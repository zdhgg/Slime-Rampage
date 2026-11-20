import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import express from 'express'
import { getGene, getGenePurchaseState } from '../src/game/GenePool.js'
import { hasPurchasedGenes } from '../src/game/BlackMarketRefund.js'
import {
  getRunRecord,
  pushScore,
  sanitizeRun,
  sanitizeSave,
  isSaveData,
} from '../src/game/SaveManager.js'
import {
  DIFFICULTY_IDS,
  MODE_IDS,
  RUN_DURATION,
  getExpeditionStages,
  isDifficultyUnlocked,
  isModeUnlocked,
  normalizeRunSelection,
  scoreToPoints,
} from '../src/game/RunRules.js'
import { withTransaction } from './database.mjs'
import { BACKUP_MAX_BYTES } from '../src/game/SaveProtocol.js'
import { accountState, archiveAccount, assertAccountVersion, rotateSaveEpoch, saveConflict } from './save-state.mjs'
import { getLeaderboard } from './leaderboard.mjs'
import { accountGameData, mergeLegacyCampaign, writeAccountGameData } from './account-store.mjs'
import { finishGameplayRun } from './gameplay-runs.mjs'
import { validBoardSelection, boundedInt } from '../src/game/AccountRules.js'
import {
  activateProfileSlot,
  activeProfileRow,
  createProfileSlot,
  deleteProfileSlot,
  initializeAccount,
  parseProfileData,
  parseSlotId,
  profileCatalog,
  profileRowById,
  writeProfileData,
} from './profile-store.mjs'
import {
  ACCOUNT_BACKUP_KIND,
  BACKUP_FORMAT,
  buildServerBackup,
  restoreAccountBackup,
  restoreServerBackup,
} from './server-backup.mjs'
import {
  SESSION_COOKIE,
  createSessionToken,
  hashPassword,
  hashToken,
  parseCookies,
  sessionCookie,
  validateCredentials,
  verifyPassword,
} from './security.mjs'

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60
const RUN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 给断线结算保留补交窗口

class HttpError extends Error {
  constructor(status, code, message, details = null) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const accountPayload = (row) => ({
  id: Number(row.id),
  username: row.username,
  displayName: row.display_name,
  createdAt: row.created_at,
})

function createRateLimiter({ windowMs, max }) {
  const attempts = new Map()
  return (req, _res, next) => {
    const now = Date.now()
    const key = req.ip || req.socket.remoteAddress || 'unknown'
    const entry = attempts.get(key)
    if (!entry || entry.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + windowMs })
      next()
      return
    }
    entry.count += 1
    if (entry.count > max) {
      next(new HttpError(429, 'rate_limited', '尝试次数过多，请稍后再试'))
      return
    }
    next()
  }
}

function createSession(db, userId) {
  const token = createSessionToken()
  const now = Date.now()
  db.prepare(`
    INSERT INTO sessions(token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)
  `).run(hashToken(token), userId, now + SESSION_TTL_SECONDS * 1000, new Date(now).toISOString())
  return token
}

function setSessionCookie(req, res, token, ttl = SESSION_TTL_SECONDS) {
  res.setHeader('Set-Cookie', sessionCookie(token, ttl, req.secure))
}

function sanitizeSubmission(raw, ticket) {
  if (!raw || typeof raw !== 'object') throw new HttpError(400, 'invalid_run', '缺少本局结算数据')
  if (!['victory', 'extracted', 'defeat'].includes(raw.result)) {
    throw new HttpError(400, 'invalid_run', '本局结果无效')
  }
  const selection = { mode: ticket.mode, difficulty: ticket.difficulty }
  const clean = sanitizeRun({ ...raw, ...selection }, selection)
  const now = Date.now()
  const wallSeconds = Math.max(0, (now - Number(ticket.issued_at)) / 1000)
  if (clean.time > wallSeconds + 15) {
    throw new HttpError(422, 'implausible_run', '本局计时超过服务器记录的实际时长')
  }
  if (clean.wave > 5000 || clean.kills > Math.max(200, clean.time * 30 + 200)) {
    throw new HttpError(422, 'implausible_run', '本局波次或击杀数据超出合理范围')
  }
  if (
    clean.devours > clean.kills ||
    clean.eliteKills > clean.kills ||
    clean.bossKills > clean.kills ||
    clean.eventsCompleted > 100
  ) {
    throw new HttpError(422, 'implausible_run', '本局分类统计与总击杀不一致')
  }
  if (clean.mode === 'endless' && clean.result === 'victory') {
    throw new HttpError(422, 'implausible_run', '无尽模式不存在通关结算')
  }
  if (clean.mode === 'timed' && clean.result === 'victory' && clean.time < RUN_DURATION - 5) {
    throw new HttpError(422, 'implausible_run', '限时模式通关时间不足')
  }
  if (
    clean.mode === 'expedition' &&
    clean.result === 'victory' &&
    clean.stage !== getExpeditionStages(clean.difficulty).length
  ) {
    throw new HttpError(422, 'implausible_run', '远征尚未到达最终章节')
  }
  const species = typeof raw.species === 'string'
    ? raw.species.slice(0, 80)
    : String(raw.species?.name || '').slice(0, 80)
  return {
    ...clean,
    elapsed: clean.time,
    species,
    level: Math.max(1, Math.min(999, Math.round(Number(raw.level) || 1))),
    endlessRewardBonus: Math.max(0, Math.min(2.5, Number(raw.endlessRewardBonus) || 0)),
  }
}

function registrationEnabled(db, forcedValue) {
  if (typeof forcedValue === 'boolean') return forcedValue
  return db.prepare("SELECT value FROM server_settings WHERE key = 'registration_enabled'").get()?.value !== '0'
}

export function createGameApp({ db, distDir = null, registration = null, beforeDestructiveWrite = async () => {} }) {
  const app = express()
  let restoring = false
  // 管理员 = users.role='admin'（首个注册账号），或环境变量 SLIME_ADMIN 指定的账号名（找回通道）。
  const envAdmin = String(process.env.SLIME_ADMIN || '').trim().toLowerCase()
  const isAdmin = (row) =>
    !!row && (row.role === 'admin' || (!!envAdmin && String(row.username).toLowerCase() === envAdmin))
  const payloadOf = (row) => ({ ...accountPayload(row), admin: isAdmin(row) })
  app.disable('x-powered-by')
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    next()
  })
  const jsonParser = express.json({ limit: '64kb' })
  const backupParser = express.json({ limit: BACKUP_MAX_BYTES })
  // 备份导入的 JSON 体积可能超过通用 64kb（整服恢复含行动流水），单独放宽。
  const LARGE_BODY = /^\/api\/admin\/(restore|accounts\/\d+\/import)$/
  app.use((req, res, next) => (LARGE_BODY.test(req.path) ? backupParser : jsonParser)(req, res, next))
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })
  app.use('/api', (req, _res, next) => {
    if (restoring && req.method !== 'GET') return next(new HttpError(503, 'restore_in_progress', '服务器正在恢复存档，请稍后重试'))
    next()
  })

  app.get('/api/status', (req, res) => {
    res.json({
      service: 'slime-rampage',
      version: 2,
      registrationEnabled: registrationEnabled(db, registration),
      serverTime: new Date().toISOString(),
    })
  })

  app.use((req, _res, next) => {
    req.account = null
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
    if (!token) {
      next()
      return
    }
    const now = Date.now()
    const row = db.prepare(`
      SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled = 0
    `).get(hashToken(token), now)
    if (row) req.account = row
    next()
  })

  const authLimit = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 20 })
  app.get('/api/auth/me', (req, res) => {
    if (!req.account) {
      res.json({ account: null })
      return
    }
    res.json({ account: payloadOf(req.account), catalog: profileCatalog(db, req.account.id), accountData: accountGameData(db, req.account.id) })
  })

  app.post('/api/auth/register', authLimit, route(async (req, res) => {
    if (!registrationEnabled(db, registration)) {
      throw new HttpError(403, 'registration_closed', '主机已关闭新账号注册')
    }
    const valid = validateCredentials(req.body?.username, req.body?.password)
    if (valid.error) throw new HttpError(400, 'invalid_credentials', valid.error)
    const password = await hashPassword(req.body.password)
    let userId
    try {
      userId = withTransaction(db, () => {
        const now = new Date().toISOString()
        // 没有管理员时首个注册账号自动成为管理员
        const role = db.prepare("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1").get() ? 'player' : 'admin'
        const result = db.prepare(`
          INSERT INTO users(username, display_name, password_hash, password_salt, created_at, last_login_at, role)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(valid.username, valid.displayName, password.hash, password.salt, now, now, role)
        const id = Number(result.lastInsertRowid)
        initializeAccount(db, id)
        return id
      })
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) {
        throw new HttpError(409, 'username_taken', '这个账号名已经被使用')
      }
      throw error
    }
    const account = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
    const token = createSession(db, userId)
    setSessionCookie(req, res, token)
    res.status(201).json({ account: payloadOf(account), catalog: profileCatalog(db, userId), accountData: accountGameData(db, userId) })
  }))

  app.post('/api/auth/login', authLimit, route(async (req, res) => {
    const valid = validateCredentials(req.body?.username, req.body?.password)
    if (valid.error) throw new HttpError(400, 'invalid_credentials', valid.error)
    const account = db.prepare('SELECT * FROM users WHERE username = ?').get(valid.username)
    if (!account || !(await verifyPassword(req.body.password, account.password_salt, account.password_hash))) {
      throw new HttpError(401, 'login_failed', '账号名或密码不正确')
    }
    if (account.disabled) throw new HttpError(403, 'account_disabled', '这个账号已被主机管理员停用')
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(new Date().toISOString(), account.id)
    const token = createSession(db, account.id)
    setSessionCookie(req, res, token)
    res.json({ account: payloadOf(account), catalog: profileCatalog(db, account.id), accountData: accountGameData(db, account.id) })
  }))

  app.post('/api/auth/logout', (req, res) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
    setSessionCookie(req, res, '', 0)
    res.json({ ok: true })
  })

  app.use('/api', (req, _res, next) => {
    if (req.method === 'GET' && req.path === '/leaderboard') {
      next()
      return
    }
    if (!req.account) {
      next(new HttpError(401, 'authentication_required', '请先登录账号'))
      return
    }
    if (req.get('X-Save-Epoch') && ['/account/tutorial', '/account/import-campaign', '/runs/start'].includes(req.path)) {
      if (req.get('X-Save-Epoch') !== accountState(db, req.account.id).save_epoch) return next(saveConflict('账号已恢复过存档，请刷新账号进度后重试'))
    }
    next()
  })

  app.get('/api/profile', (req, res) => {
    res.json({ catalog: profileCatalog(db, req.account.id) })
  })

  app.use('/api', (req, _res, next) => {
    if (req.method !== 'GET' && /^\/(profile(?:s)?(?:\/|$))/.test(req.path) && req.get('X-Save-Epoch')) {
      try { assertAccountVersion(db, req.account.id, { saveEpoch: req.get('X-Save-Epoch'), accountRevision: req.get('X-Save-Revision') }) }
      catch (error) { return next(error) }
    }
    next()
  })

  const sendBackup = (res, value) => {
    const json = JSON.stringify(value)
    if (Buffer.byteLength(json) > BACKUP_MAX_BYTES) throw new HttpError(413, 'backup_too_large', '备份超过 64MB，请使用服务器数据库备份工具导出和恢复')
    res.type('json').send(json)
  }

  app.get('/api/account/records', (req, res) => {
    const gameplay = req.query.gameplay || 'all'
    if (!['all', 'arena', 'runner', 'tower-defense'].includes(gameplay)) {
      res.status(400).json({ error: { code: 'invalid_gameplay', message: '游戏记录玩法无效' } })
      return
    }
    const pageSize = 20
    const summary = Object.fromEntries(['arena', 'runner', 'tower-defense'].map(id => [id, { plays: 0, clears: 0, bestScore: null }]))
    for (const row of db.prepare(`SELECT gameplay, count(*) AS plays,
      sum(CASE WHEN result = 'victory' THEN 1 ELSE 0 END) AS clears, max(score) AS bestScore
      FROM runs WHERE user_id = ? GROUP BY gameplay`).all(req.account.id)) {
      if (summary[row.gameplay]) summary[row.gameplay] = { plays: Number(row.plays), clears: Number(row.clears), bestScore: Number(row.bestScore) }
    }
    const overallTotal = Object.values(summary).reduce((sum, item) => sum + item.plays, 0)
    const total = gameplay === 'all' ? overallTotal : summary[gameplay].plays
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const page = boundedInt(req.query.page, 1, totalPages, 1)
    const entries = db.prepare(`SELECT id, gameplay, mode, difficulty, result, stage, wave, kills,
      elapsed AS time, score, submitted_at AS submittedAt FROM runs WHERE user_id = ? AND (? = 'all' OR gameplay = ?)
      ORDER BY submitted_at DESC, rowid DESC LIMIT ? OFFSET ?`).all(req.account.id, gameplay, gameplay, pageSize, (page - 1) * pageSize)
    res.json({ entries, page, totalPages, total, overallTotal, summary, accountData: accountGameData(db, req.account.id) })
  })

  // ── 管理员接口：账号管理与数据备份恢复，普通玩家一律 403 ──
  app.use('/api/admin', (req, _res, next) => {
    if (!isAdmin(req.account)) return next(new HttpError(403, 'admin_required', '只有管理员可以执行这个操作'))
    next()
  })

  const adminTarget = (req) => {
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id))
    if (!target) throw new HttpError(404, 'account_not_found', '没有找到这个账号')
    return target
  }

  app.get('/api/admin/accounts', (req, res) => {
    const rows = db.prepare(`
      SELECT u.id, u.username, u.display_name, u.role, u.disabled, u.created_at, u.last_login_at,
        (SELECT COUNT(*) FROM profiles p WHERE p.user_id = u.id) AS slot_count,
        (SELECT COUNT(*) FROM runs r WHERE r.user_id = u.id) AS run_count,
        (SELECT json_extract(d.data_json, '$.campaign.unlockedStage') FROM account_game_data d WHERE d.user_id = u.id) AS campaign_stage
      FROM users u ORDER BY u.id
    `).all()
        res.json({
      accounts: rows.map((row) => ({
        id: Number(row.id),
        username: row.username,
        displayName: row.display_name,
        admin: isAdmin(row),
        disabled: !!row.disabled,
        createdAt: row.created_at,
        lastLoginAt: row.last_login_at,
        slotCount: Number(row.slot_count),
        runCount: Number(row.run_count),
        campaignStage: Number(row.campaign_stage) || 1,
        saveEpoch: accountState(db, row.id).save_epoch,
        accountRevision: Number(accountState(db, row.id).revision),
      })),
    })
  })

  app.post('/api/admin/accounts/:id/disable', (req, res, next) => {
    try {
      const target = adminTarget(req)
      if (target.id === req.account.id) throw new HttpError(400, 'cannot_disable_self', '不能停用自己的账号')
      withTransaction(db, () => {
        db.prepare('UPDATE users SET disabled = 1 WHERE id = ?').run(target.id)
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id)
      })
      res.json({ ok: true })
    } catch (error) { next(error) }
  })

  app.post('/api/admin/accounts/:id/enable', (req, res, next) => {
    try {
      const target = adminTarget(req)
      db.prepare('UPDATE users SET disabled = 0 WHERE id = ?').run(target.id)
      res.json({ ok: true })
    } catch (error) { next(error) }
  })

  app.get('/api/admin/accounts/:id/export', (req, res, next) => {
    try {
      const target = adminTarget(req)
      sendBackup(res, {
        kind: ACCOUNT_BACKUP_KIND,
        format: BACKUP_FORMAT,
        exportedAt: new Date().toISOString(),
        account: payloadOf(target),
        catalog: profileCatalog(db, target.id),
        accountData: accountGameData(db, target.id),
      })
    } catch (error) { next(error) }
  })

  // 恢复整体覆盖成长进度；行动流水与公共榜由服务端生成，不随备份写入。
  app.post('/api/admin/accounts/:id/import', route(async (req, res) => {
    try {
      const target = adminTarget(req)
      assertAccountVersion(db, target.id, req.body?.expected)
      restoring = true
      await beforeDestructiveWrite()
      assertAccountVersion(db, target.id, req.body?.expected)
      res.json(restoreAccountBackup(db, target.id, req.body))
    } finally { restoring = false }
  }))

  app.get('/api/admin/backup', (req, res) => {
    sendBackup(res, buildServerBackup(db))
  })

  // 整服恢复会清空现有账号与会话；恢复完成后所有玩家需重新登录。
  app.post('/api/admin/restore', route(async (req, res) => {
    try {
      const serverId = db.prepare("SELECT value FROM server_settings WHERE key = 'server_id'").get()?.value
      if (req.get('X-Server-Id') && req.get('X-Server-Id') !== serverId) throw saveConflict('服务器已经恢复过数据，请重新登录后重试')
      restoring = true
      await beforeDestructiveWrite()
      const restored = restoreServerBackup(db, req.body)
      res.json({ ok: true, restored })
    } finally { restoring = false }
  }))

  app.post('/api/account/import-campaign', (req, res, next) => {
    try {
      const accountData = withTransaction(db, () => mergeLegacyCampaign(db, req.account.id, req.body?.campaign))
      res.json({ accountData })
    } catch (error) { next(error) }
  })

  app.post('/api/account/tutorial', (req, res, next) => {
    try {
      const accountData = withTransaction(db, () => {
        const data = accountGameData(db, req.account.id)
        data.campaign.tutorialCompleted = true
        writeAccountGameData(db, req.account.id, data)
        return accountGameData(db, req.account.id)
      })
      res.json({ accountData, catalog: profileCatalog(db, req.account.id) })
    } catch (error) { next(error) }
  })

  app.post('/api/profiles', (req, res, next) => {
    try {
      const index = Number(req.body?.index)
      const created = withTransaction(db, () => createProfileSlot(db, req.account.id, index))
      if (!created) throw new HttpError(409, 'slot_unavailable', '该档案位无法创建')
      res.status(201).json({ catalog: profileCatalog(db, req.account.id) })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/profiles/:id/activate', (req, res, next) => {
    try {
      const index = parseSlotId(req.params.id)
      if (!activateProfileSlot(db, req.account.id, index)) {
        throw new HttpError(404, 'profile_not_found', '没有找到这个档案')
      }
      res.json({ catalog: profileCatalog(db, req.account.id) })
    } catch (error) {
      next(error)
    }
  })

  app.delete('/api/profiles/:id', route(async (req, res) => {
    try {
      const index = parseSlotId(req.params.id)
      const deleted = withTransaction(db, () => {
        archiveAccount(db, req.account.id, 'before-delete')
        return deleteProfileSlot(db, req.account.id, index)
      })
      if (!deleted) throw new HttpError(409, 'profile_required', '至少需要保留一个档案')
      res.json({ catalog: profileCatalog(db, req.account.id) })
    } catch (error) {
      throw error
    }
  }))

  app.post('/api/profile/import', (req, res, next) => {
    try {
      const source = req.body?.slot?.data
      if (!isSaveData(source)) throw new HttpError(400, 'invalid_profile', '本地档案格式无效或版本不受支持')
      const row = activeProfileRow(db, req.account.id)
      const accountData = withTransaction(db, () => {
        archiveAccount(db, req.account.id, 'before-import')
        writeProfileData(db, row, sanitizeSave({ ...source, geneInvestment: undefined }))
        if (req.body?.campaign) mergeLegacyCampaign(db, req.account.id, req.body.campaign)
        rotateSaveEpoch(db, req.account.id)
        return accountGameData(db, req.account.id)
      })
      res.json({ catalog: profileCatalog(db, req.account.id), accountData })
    } catch (error) {
      next(error)
    }
  })

  app.patch('/api/profile/preferences', (req, res, next) => {
    try {
      const row = activeProfileRow(db, req.account.id)
      const data = parseProfileData(row, db)
      data.preferences = normalizeRunSelection(req.body?.preferences)
      withTransaction(db, () => writeProfileData(db, row, data))
      res.json({ catalog: profileCatalog(db, req.account.id) })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/profile/genes/:geneId/purchase', (req, res, next) => {
    try {
      const gene = getGene(req.params.geneId)
      if (!gene) throw new HttpError(404, 'gene_not_found', '没有找到这个基因')
      const purchase = withTransaction(db, () => {
        if (req.get('X-Save-Epoch')) assertAccountVersion(db, req.account.id, { saveEpoch: req.get('X-Save-Epoch'), accountRevision: req.get('X-Save-Revision') })
        const row = activeProfileRow(db, req.account.id)
        const data = parseProfileData(row, db)
        const state = getGenePurchaseState(gene, data.genes, data.drops)
        if (!state.canBuy) throw new HttpError(409, 'gene_unavailable', state.reason || '当前无法购买这个基因')
        data.drops -= state.cost
        data.genes[gene.id] = state.level + 1
        data.geneInvestment += state.cost
        writeProfileData(db, row, data)
        return { geneId: gene.id, level: state.level + 1, cost: state.cost }
      })
      res.json({ catalog: profileCatalog(db, req.account.id), purchase })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/profile/genes/reset', (req, res, next) => {
    try {
      const refunded = withTransaction(db, () => {
        assertAccountVersion(db, req.account.id, { saveEpoch: req.get('X-Save-Epoch'), accountRevision: req.get('X-Save-Revision') })
        const row = activeProfileRow(db, req.account.id)
        const data = parseProfileData(row, db)
        if (!hasPurchasedGenes(data.genes)) return 0
        const amount = data.geneInvestment
        data.drops += amount
        data.genes = {}
        data.geneInvestment = 0
        writeProfileData(db, row, data)
        return amount
      })
      res.json({ catalog: profileCatalog(db, req.account.id), refund: { points: refunded } })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/runs/start', (req, res, next) => {
    try {
      const gameplay = req.body?.gameplay || 'arena'
      if (!validBoardSelection({ ...req.body, gameplay })) {
        throw new HttpError(400, 'invalid_selection', '作战模式或难度无效')
      }
      const selection = gameplay === 'arena' ? normalizeRunSelection(req.body) : req.body
      const profile = activeProfileRow(db, req.account.id)
      const data = parseProfileData(profile, db)
      if (gameplay === 'arena' && (!isModeUnlocked(data.progression, selection.mode) || !isDifficultyUnlocked(data.progression, selection.difficulty))) {
        throw new HttpError(403, 'run_locked', '当前档案尚未解锁这套规则')
      }
      const stageId = boundedInt(req.body?.stageId, 1, 99)
      if (gameplay === 'tower-defense' && stageId > accountGameData(db, req.account.id).campaign.unlockedStage) {
        throw new HttpError(403, 'stage_locked', '当前账号尚未解锁这个关卡')
      }
      const now = Date.now()
      const ticket = {
        id: randomUUID(),
        expiresAt: now + RUN_TTL_MS,
      }
      db.prepare(`
        INSERT INTO run_tickets(id, user_id, profile_id, mode, difficulty, issued_at, expires_at, gameplay, stage_id, save_epoch)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(ticket.id, req.account.id, profile.id, selection.mode, selection.difficulty, now, ticket.expiresAt, gameplay, stageId, accountState(db, req.account.id).save_epoch)
      res.status(201).json({ ticket, catalog: profileCatalog(db, req.account.id) })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/runs/:ticketId/finish', (req, res, next) => {
    try {
      const stored = withTransaction(db, () => {
        const ticket = db.prepare('SELECT * FROM run_tickets WHERE id = ? AND user_id = ?').get(
          req.params.ticketId,
          req.account.id
        )
        if (!ticket) throw new HttpError(404, 'run_not_found', '没有找到这局行动记录')
        if (ticket.save_epoch !== accountState(db, req.account.id).save_epoch) {
          throw new HttpError(409, 'save_restored', '此行动属于恢复前的存档，已保留结算，请确认后放弃或联系管理员')
        }
        if (ticket.completed_at) {
          const completed = db.prepare('SELECT result_json FROM runs WHERE ticket_id = ?').get(ticket.id)
          return JSON.parse(completed.result_json)
        }
        if (Number(ticket.expires_at) < Date.now()) {
          throw new HttpError(410, 'run_expired', '这局行动记录已经过期')
        }
        if (ticket.gameplay !== 'arena') return finishGameplayRun(db, req.account.id, ticket, req.body?.run)
        const run = sanitizeSubmission(req.body?.run, ticket)
        const profile = profileRowById(db, req.account.id, ticket.profile_id)
        if (!profile) throw new HttpError(404, 'profile_not_found', '本局对应的档案已不存在')
        const data = parseProfileData(profile, db)
        const selection = { mode: ticket.mode, difficulty: ticket.difficulty }
        const previousScore = getRunRecord(data, selection).best.score || 0
        const scoreResult = pushScore(data, selection, run)
        // 战力点由服务端重算的分数派生：客户端不再上报掉落数量，结算输入面收窄
        const earnedDrops = scoreToPoints(scoreResult.entry.score, selection, run)
        data.drops += earnedDrops
        writeProfileData(db, profile, data)

        const runId = randomUUID()
        const submittedAt = new Date().toISOString()
        const result = {
          runId,
          earnedDrops,
          score: scoreResult.entry.score,
          scoreBreakdown: scoreResult.entry.breakdown,
          rank: scoreResult.rank,
          entry: scoreResult.entry,
          best: scoreResult.best,
          personalBoard: scoreResult.board,
          unlocked: scoreResult.unlocked,
          unlockedMode: scoreResult.unlockedMode,
          isNewRecord: scoreResult.entry.score > previousScore,
        }
        db.prepare(`
          INSERT INTO runs(
            id, ticket_id, user_id, profile_id, mode, difficulty, result, stage, wave, kills,
            elapsed, finale_time, devours, elite_kills, boss_kills, events_completed, species,
            score, score_version, breakdown_json, result_json, submitted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          runId, ticket.id, req.account.id, profile.id, selection.mode, selection.difficulty,
          run.result, run.stage, run.wave, run.kills, run.time, run.finaleTime, run.devours,
          run.eliteKills, run.bossKills, run.eventsCompleted, run.species, scoreResult.entry.score,
          scoreResult.entry.scoreVersion, JSON.stringify(scoreResult.entry.breakdown), JSON.stringify(result),
          submittedAt
        )
        db.prepare('UPDATE run_tickets SET completed_at = ? WHERE id = ?').run(Date.now(), ticket.id)
        return result
      })
      const board = getLeaderboard(db, stored.entry.mode, stored.entry.difficulty, 50, req.account.id, stored.entry.gameplay || 'arena')
      res.json({ catalog: profileCatalog(db, req.account.id), accountData: accountGameData(db, req.account.id), result: stored, leaderboard: board })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/runs/:ticketId/resume', (req, res, next) => {
    try {
      const ticket = db.prepare('SELECT * FROM run_tickets WHERE id = ? AND user_id = ?').get(req.params.ticketId, req.account.id)
      if (!ticket) throw new HttpError(404, 'run_not_found', '原行动不存在，无法继续')
      if (ticket.save_epoch !== accountState(db, req.account.id).save_epoch) throw new HttpError(409, 'save_restored', '账号已恢复过存档，无法继续旧行动')
      if (ticket.completed_at) throw new HttpError(409, 'run_completed', '这局行动已经结算')
      if (ticket.expires_at < Date.now()) throw new HttpError(410, 'run_expired', '续玩期限已过')
      res.json({ ticket: { id: ticket.id, expiresAt: ticket.expires_at, gameplay: ticket.gameplay,
        mode: ticket.mode, difficulty: ticket.difficulty, stageId: ticket.stage_id },
        catalog: profileCatalog(db, req.account.id), accountData: accountGameData(db, req.account.id) })
    } catch (error) { next(error) }
  })

  app.get('/api/leaderboard', (req, res, next) => {
    try {
      if (!validBoardSelection(req.query)) {
        throw new HttpError(400, 'invalid_selection', '排行榜模式或难度无效')
      }
      res.json({
        leaderboard: getLeaderboard(db, req.query.mode, req.query.difficulty, req.query.limit, req.account?.id, req.query.gameplay || 'arena', req.query.page),
      })
    } catch (error) {
      next(error)
    }
  })

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'api_not_found', '接口不存在')))

  if (distDir) {
    const index = join(distDir, 'index.html')
    app.use(express.static(distDir, { index: false, maxAge: '1h' }))
    app.use((req, res, next) => {
      if (req.method !== 'GET' || !existsSync(index)) {
        next()
        return
      }
      res.sendFile(index)
    })
  }

  app.use((error, _req, res, _next) => {
    const status = Number(error.status) || 500
    if (status >= 500) console.error(error)
    res.status(status).json({
      error: {
        code: error.code || 'server_error',
        message: status >= 500 ? '游戏服务器处理请求时发生错误' : error.message,
        details: error.details || null,
      },
    })
  })
  return app
}

// 兼容旧启动器和已有集成。
export const createLanApp = createGameApp
