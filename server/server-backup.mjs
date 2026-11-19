import { boundedInt, sanitizeCampaign } from '../src/game/AccountRules.js'
import { sanitizeSave, isSaveData } from '../src/game/SaveManager.js'
import {
  accountGameData,
  sanitizeAccountRecords,
  writeAccountGameData,
} from './account-store.mjs'
import { withTransaction } from './database.mjs'
import { parseSlotId, profileCatalog, restoreProfileCatalog } from './profile-store.mjs'
import { archiveAccount, rotateSaveEpoch } from './save-state.mjs'

export const SERVER_BACKUP_KIND = 'slime-rampage-server-backup'
export const ACCOUNT_BACKUP_KIND = 'slime-rampage-backup'
export const BACKUP_FORMAT = 1
const SLOT_COUNT = 3

const invalid = (message) =>
  Object.assign(new Error(message), { status: 400, code: 'invalid_backup' })

const text = (value, max = 200) => (typeof value === 'string' ? value.slice(0, max) : '')
const isoOr = (value, fallback) => (/^\d{4}-\d{2}-\d{2}T/.test(String(value || '')) ? String(value).slice(0, 40) : fallback)

/** 整服备份：所有账号、档案、塔防进度、行动流水与服务器设置打成一个 JSON。 */
export function buildServerBackup(db) {
  const settings = Object.fromEntries(
    db.prepare('SELECT key, value FROM server_settings').all().map((row) => [row.key, row.value])
  )
  const users = db.prepare('SELECT * FROM users ORDER BY id').all()
  return {
    kind: SERVER_BACKUP_KIND,
    format: BACKUP_FORMAT,
    exportedAt: new Date().toISOString(),
    settings,
    accounts: users.map((user) => ({
      user: {
        id: Number(user.id),
        username: user.username,
        displayName: user.display_name,
        passwordHash: user.password_hash,
        passwordSalt: user.password_salt,
        role: user.role === 'admin' ? 'admin' : 'player',
        disabled: !!user.disabled,
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at,
      },
      catalog: profileCatalog(db, user.id),
      accountData: accountGameData(db, user.id),
      tickets: db.prepare('SELECT * FROM run_tickets WHERE user_id = ?').all(user.id),
      runs: db.prepare('SELECT * FROM runs WHERE user_id = ?').all(user.id),
    })),
  }
}

/** 单账号备份：catalog + 账号进度整体覆盖；由调用方决定目标账号。 */
export function restoreAccountBackup(db, userId, source) {
  if (source?.kind !== ACCOUNT_BACKUP_KIND || Number(source.format) !== BACKUP_FORMAT) {
    throw invalid('备份文件无效或版本不受支持')
  }
  return withTransaction(db, () => {
    archiveAccount(db, userId, 'before-restore')
    if (!restoreProfileCatalog(db, userId, source.catalog)) {
      throw invalid('备份中没有可恢复的档案')
    }
    const data = {
      campaign: sanitizeCampaign(source.accountData?.campaign),
      records: sanitizeAccountRecords(source.accountData?.records),
    }
    writeAccountGameData(db, userId, data)
    rotateSaveEpoch(db, userId)
    return { catalog: profileCatalog(db, userId), accountData: accountGameData(db, userId) }
  })
}

function restoreSlots(db, userId, catalog) {
  const sourceSlots = Array.isArray(catalog?.slots) ? catalog.slots : []
  const now = new Date().toISOString()
  const profileIds = new Map()
  const restoredIndexes = []
  for (let index = 0; index < SLOT_COUNT; index++) {
    const slot = sourceSlots[index]
    if (slot != null && !isSaveData(slot.data)) throw invalid('备份中的档案损坏或版本不受支持')
    if (!slot?.data || typeof slot.data !== 'object') continue
    const name = typeof slot.name === 'string' && slot.name.trim()
      ? slot.name.trim().slice(0, 40)
      : `史莱姆档案 ${index + 1}`
    const storedId = boundedInt(slot.profileId, 1, 2147483647, 0) || null
    const result = db.prepare(`
      INSERT INTO profiles(id, user_id, slot_index, name, data_json, revision, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      storedId, userId, index, name, JSON.stringify(sanitizeSave(slot.data)), 1,
      isoOr(slot.createdAt, now), isoOr(slot.lastPlayedAt, now)
    )
    profileIds.set(slot.profileId, Number(result.lastInsertRowid))
    restoredIndexes.push(index)
  }
  if (!restoredIndexes.length) throw invalid('备份中有账号缺少可恢复档案')
  const requested = parseSlotId(catalog?.activeSlotId)
  const activeIndex = restoredIndexes.includes(requested) ? requested : restoredIndexes[0]
  db.prepare('INSERT INTO account_state(user_id, active_slot_index) VALUES (?, ?)').run(userId, activeIndex)
  return profileIds
}

function restoreTicket(db, userId, ticket, profileIds) {
  const id = text(ticket?.id, 80)
  if (!id) return
  const profileId = profileIds.get(ticket.profile_id) || [...profileIds.values()][0]
  if (!profileId) return
  db.prepare(`
    INSERT INTO run_tickets(id, user_id, profile_id, mode, difficulty, issued_at, expires_at, completed_at, gameplay, stage_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, userId, profileId, text(ticket.mode, 30), text(ticket.difficulty, 30),
    boundedInt(ticket.issued_at, 0, 1e15), boundedInt(ticket.expires_at, 0, 1e15),
    ticket.completed_at == null ? null : boundedInt(ticket.completed_at, 0, 1e15),
    text(ticket.gameplay, 20) || 'arena', boundedInt(ticket.stage_id, 1, 99, 1)
  )
}

function restoreRun(db, userId, run, profileIds) {
  const id = text(run?.id, 80)
  const ticketId = text(run?.ticket_id, 80)
  if (!id || !ticketId) return 0
  if (!db.prepare('SELECT 1 FROM run_tickets WHERE id = ?').get(ticketId)) return 0
  const profileId = profileIds.get(run.profile_id) || [...profileIds.values()][0]
  if (!profileId) return 0
  const gameplay = text(run.gameplay, 20) || 'arena'
  const mode = text(run.mode, 30)
  db.prepare(`
    INSERT INTO runs(
      id, ticket_id, user_id, profile_id, mode, difficulty, result, stage, wave, kills,
      elapsed, finale_time, devours, elite_kills, boss_kills, events_completed, species,
      score, score_version, breakdown_json, result_json, submitted_at, gameplay
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, ticketId, userId, profileId, mode, text(run.difficulty, 30),
    text(run.result, 20) || 'defeat', boundedInt(run.stage, 1, 99, 1), boundedInt(run.wave, 0, 1e6),
    boundedInt(run.kills, 0, 1e9), boundedInt(run.elapsed, 0, 1e7), Number(run.finale_time) || 0,
    boundedInt(run.devours, 0, 1e9), boundedInt(run.elite_kills, 0, 1e9),
    boundedInt(run.boss_kills, 0, 1e9), boundedInt(run.events_completed, 0, 1e6),
    text(run.species, 80), boundedInt(run.score, 0, 1e12), boundedInt(run.score_version, 0, 99),
    text(run.breakdown_json, 60000) || '{}', text(run.result_json, 60000) || '{}',
    isoOr(run.submitted_at, new Date().toISOString()), gameplay
  )
  return 1
}

/** 整服恢复：清空全部业务表后按备份重建；调用方必须是管理员。 */
export function restoreServerBackup(db, source) {
  if (source?.kind !== SERVER_BACKUP_KIND || Number(source.format) !== BACKUP_FORMAT) {
    throw invalid('备份文件无效或版本不受支持')
  }
  if (!Array.isArray(source.accounts)) throw invalid('备份中没有账号数据')
  try {
    return withTransaction(db, () => {
      // 先删子表再删父表；成绩与档案引用用户，会话随恢复全部失效。
      for (const table of ['runs', 'run_tickets', 'account_game_data', 'profiles', 'account_state', 'sessions', 'users']) {
        db.prepare(`DELETE FROM ${table}`).run()
      }
      const now = new Date().toISOString()
      let userCount = 0
      let runCount = 0
      for (const entry of source.accounts) {
        const username = text(entry?.user?.username, 20).trim()
        if (!username) throw invalid('备份中有账号缺少账号名')
        const user = entry.user
        const storedId = boundedInt(user.id, 1, 2147483647, 0) || null
        const result = db.prepare(`
          INSERT INTO users(id, username, display_name, password_hash, password_salt, role, disabled, created_at, last_login_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          storedId, username, text(user.displayName, 40) || username,
          text(user.passwordHash, 200), text(user.passwordSalt, 200),
          user.role === 'admin' ? 'admin' : 'player', user.disabled ? 1 : 0,
          isoOr(user.createdAt, now), isoOr(user.lastLoginAt, now) || null
        )
        const userId = Number(result.lastInsertRowid)
        const profileIds = restoreSlots(db, userId, entry.catalog)
        writeAccountGameData(db, userId, {
          campaign: sanitizeCampaign(entry.accountData?.campaign),
          records: sanitizeAccountRecords(entry.accountData?.records),
        })
        for (const ticket of Array.isArray(entry.tickets) ? entry.tickets : []) {
          restoreTicket(db, userId, ticket, profileIds)
        }
        for (const run of Array.isArray(entry.runs) ? entry.runs : []) {
          runCount += restoreRun(db, userId, run, profileIds)
        }
        rotateSaveEpoch(db, userId)
        userCount += 1
      }
      db.prepare("UPDATE sqlite_sequence SET seq = (SELECT IFNULL(MAX(id), 0) FROM users) WHERE name = 'users'").run()
      db.prepare("UPDATE sqlite_sequence SET seq = (SELECT IFNULL(MAX(id), 0) FROM profiles) WHERE name = 'profiles'").run()
      if (source.settings && typeof source.settings === 'object') {
        db.prepare('DELETE FROM server_settings').run()
        for (const [key, value] of Object.entries(source.settings)) {
          if (typeof key === 'string' && key.length <= 60 && typeof value === 'string' && value.length <= 400) {
            db.prepare('INSERT INTO server_settings(key, value) VALUES (?, ?)').run(key, value)
          }
        }
      }
      db.prepare("INSERT OR REPLACE INTO server_settings(key, value) VALUES ('server_id', lower(hex(randomblob(16))))").run()
      return { accounts: userCount, runs: runCount }
    })
  } catch (error) {
    if (error.status) throw error
    if (String(error.message || '').includes('Constraint') || String(error.code || '').includes('SQLITE_CONSTRAINT')) {
      throw invalid('备份数据与目标库冲突，恢复已取消')
    }
    throw error
  }
}
