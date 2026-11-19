import {
  defaultSave,
  sanitizeSave,
  isSaveData,
} from '../src/game/SaveManager.js'
import { randomUUID } from 'node:crypto'
import { accountState, archiveProfile, touchAccount } from './save-state.mjs'

export const REMOTE_SLOT_COUNT = 3
const slotId = (index) => `slot-${index + 1}`
const slotName = (index) => `史莱姆档案 ${index + 1}`
const timestamp = () => new Date().toISOString()

export function parseSlotId(id) {
  const match = /^slot-([1-3])$/.exec(String(id || ''))
  return match ? Number(match[1]) - 1 : -1
}

export function initializeAccount(db, userId) {
  const now = timestamp()
  db.prepare('INSERT INTO account_state(user_id, active_slot_index, save_epoch, saved_at) VALUES (?, 0, ?, ?)').run(userId, randomUUID(), now)
  db.prepare(`
    INSERT INTO profiles(user_id, slot_index, name, data_json, revision, created_at, updated_at)
    VALUES (?, 0, ?, ?, 1, ?, ?)
  `).run(userId, slotName(0), JSON.stringify(defaultSave()), now, now)
}

export function profileCatalog(db, userId) {
  const state = accountState(db, userId)
  const rows = db.prepare(`
    SELECT id, user_id, slot_index, name, data_json, revision, created_at, updated_at
    FROM profiles WHERE user_id = ? ORDER BY slot_index
  `).all(userId)
  const slots = Array(REMOTE_SLOT_COUNT).fill(null)
  const recoveryNotices = []
  for (const row of rows) {
    const parsed = parseProfileData(row, db, () => recoveryNotices.push(`${row.name}异常，已读取上一份有效副本；损坏原文已保留。`))
    slots[Number(row.slot_index)] = {
      id: slotId(Number(row.slot_index)),
      profileId: Number(row.id),
      name: row.name,
      revision: Number(row.revision),
      createdAt: row.created_at,
      lastPlayedAt: row.updated_at,
      data: parsed,
    }
  }
  const first = rows[0]?.slot_index ?? 0
  const activeIndex = slots[Number(state?.active_slot_index)] ? Number(state.active_slot_index) : Number(first)
  return {
    version: 6,
    accountId: Number(userId),
    accountRevision: Number(state?.revision) || 1,
    saveEpoch: state?.save_epoch || '',
    savedAt: state?.saved_at || '',
    recoveryNotices,
    serverId: db.prepare("SELECT value FROM server_settings WHERE key = 'server_id'").get()?.value || '',
    activeSlotId: slotId(activeIndex),
    settings: { sound: { muted: false } },
    slots,
  }
}

export function activeProfileRow(db, userId) {
  return db.prepare(`
    SELECT p.* FROM profiles p
    JOIN account_state a ON a.user_id = p.user_id AND a.active_slot_index = p.slot_index
    WHERE p.user_id = ?
  `).get(userId)
}

export function profileRowById(db, userId, profileId) {
  return db.prepare('SELECT * FROM profiles WHERE id = ? AND user_id = ?').get(profileId, userId)
}

export function parseProfileData(row, db = null, onRecovered = () => {}) {
  try {
    const parsed = JSON.parse(row?.data_json || 'null')
    if (!isSaveData(parsed)) throw new Error('invalid profile')
    return sanitizeSave(parsed)
  } catch {
    // Keep the original bytes. Only a verified historical copy may substitute.
    if (db && row) {
      for (const snapshot of db.prepare("SELECT payload FROM save_history WHERE user_id = ? AND profile_id = ? AND kind = 'profile' ORDER BY id DESC").all(row.user_id, row.id)) {
        try {
          const data = JSON.parse(snapshot.payload)
          if (isSaveData(data)) { onRecovered(); return sanitizeSave(data) }
        } catch { /* Try an older generation. */ }
      }
    }
    throw Object.assign(new Error('档案数据损坏，原始数据已保留，请管理员从备份恢复'), { status: 409, code: 'save_damaged' })
  }
}

export function writeProfileData(db, row, data) {
  const now = timestamp()
  archiveProfile(db, row)
  db.prepare(`
    UPDATE profiles SET data_json = ?, revision = revision + 1, updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(sanitizeSave(data)), now, row.id)
  touchAccount(db, row.user_id)
}

export function createProfileSlot(db, userId, index) {
  if (!Number.isInteger(index) || index < 0 || index >= REMOTE_SLOT_COUNT) return false
  if (db.prepare('SELECT 1 FROM profiles WHERE user_id = ? AND slot_index = ?').get(userId, index)) {
    return false
  }
  const now = timestamp()
  db.prepare(`
    INSERT INTO profiles(user_id, slot_index, name, data_json, revision, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `).run(userId, index, slotName(index), JSON.stringify(defaultSave()), now, now)
  db.prepare('UPDATE account_state SET active_slot_index = ? WHERE user_id = ?').run(index, userId)
  touchAccount(db, userId)
  return true
}

export function activateProfileSlot(db, userId, index) {
  const row = db.prepare('SELECT id FROM profiles WHERE user_id = ? AND slot_index = ?').get(userId, index)
  if (!row) return false
  db.prepare('UPDATE account_state SET active_slot_index = ? WHERE user_id = ?').run(index, userId)
  db.prepare('UPDATE profiles SET updated_at = ? WHERE id = ?').run(timestamp(), row.id)
  touchAccount(db, userId)
  return true
}

const ISO_LIKE = /^\d{4}-\d{2}-\d{2}T/
const cleanTimestamp = (value, fallback) =>
  typeof value === 'string' && ISO_LIKE.test(value) ? value.slice(0, 40) : fallback

/** 备份恢复：整体覆盖三个档案槽；被移除槽位的历史成绩转挂到恢复出的首个档案，不随档删除。 */
export function restoreProfileCatalog(db, userId, catalog) {
  const sourceSlots = Array.isArray(catalog?.slots) ? catalog.slots : []
  if (sourceSlots.some(source => source != null && !isSaveData(source.data))) return false
  const now = timestamp()
  const restored = []
  for (let index = 0; index < REMOTE_SLOT_COUNT; index++) {
    const source = sourceSlots[index]
    if (!source?.data || typeof source.data !== 'object') continue
    const name = typeof source.name === 'string' && source.name.trim()
      ? source.name.trim().slice(0, 40)
      : slotName(index)
    const data = JSON.stringify(sanitizeSave(source.data))
    const createdAt = cleanTimestamp(source.createdAt, now)
    const updatedAt = cleanTimestamp(source.lastPlayedAt, now)
    const existing = db
      .prepare('SELECT id FROM profiles WHERE user_id = ? AND slot_index = ?')
      .get(userId, index)
    if (existing) {
      db.prepare(`
        UPDATE profiles SET name = ?, data_json = ?, revision = revision + 1, created_at = ?, updated_at = ?
        WHERE id = ?
      `).run(name, data, createdAt, updatedAt, existing.id)
      restored.push({ index, profileId: Number(existing.id) })
    } else {
      const result = db.prepare(`
        INSERT INTO profiles(user_id, slot_index, name, data_json, revision, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)
      `).run(userId, index, name, data, createdAt, updatedAt)
      restored.push({ index, profileId: Number(result.lastInsertRowid) })
    }
  }
  if (!restored.length) return false
  const kept = new Set(restored.map((slot) => slot.profileId))
  const fallbackId = restored[0].profileId
  for (const row of db.prepare('SELECT id FROM profiles WHERE user_id = ?').all(userId)) {
    if (kept.has(Number(row.id))) continue
    db.prepare('UPDATE run_tickets SET profile_id = ? WHERE profile_id = ?').run(fallbackId, row.id)
    db.prepare('UPDATE runs SET profile_id = ? WHERE profile_id = ?').run(fallbackId, row.id)
    db.prepare('DELETE FROM profiles WHERE id = ?').run(row.id)
  }
  const requested = parseSlotId(catalog?.activeSlotId)
  const activeIndex = restored.some((slot) => slot.index === requested) ? requested : restored[0].index
  db.prepare('UPDATE account_state SET active_slot_index = ? WHERE user_id = ?').run(activeIndex, userId)
  touchAccount(db, userId)
  return true
}

export function deleteProfileSlot(db, userId, index) {
  const rows = db.prepare('SELECT id, slot_index FROM profiles WHERE user_id = ? ORDER BY slot_index').all(userId)
  const target = rows.find((row) => Number(row.slot_index) === index)
  if (!target || rows.length <= 1) return false
  // 成绩属于账号，删除成长档案不删除已完成行动与公开排名。
  const fallback = rows.find((row) => Number(row.slot_index) !== index)
  db.prepare('UPDATE run_tickets SET profile_id = ? WHERE profile_id = ?').run(fallback.id, target.id)
  db.prepare('UPDATE runs SET profile_id = ? WHERE profile_id = ?').run(fallback.id, target.id)
  db.prepare('DELETE FROM profiles WHERE id = ?').run(target.id)
  const state = db.prepare('SELECT active_slot_index FROM account_state WHERE user_id = ?').get(userId)
  if (Number(state.active_slot_index) === index) {
    db.prepare('UPDATE account_state SET active_slot_index = ? WHERE user_id = ?').run(
      fallback.slot_index,
      userId
    )
  }
  touchAccount(db, userId)
  return true
}
