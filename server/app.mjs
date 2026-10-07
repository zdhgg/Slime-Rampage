import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import express from 'express'
import { getGene, getGenePurchaseState } from '../src/game/GenePool.js'
import {
  getRunRecord,
  pushScore,
  sanitizeRun,
  sanitizeSave,
} from '../src/game/SaveManager.js'
import {
  DIFFICULTY_IDS,
  MODE_IDS,
  RUN_DURATION,
  calculateMaterialReward,
  getExpeditionStages,
  isDifficultyUnlocked,
  isModeUnlocked,
  normalizeRunSelection,
  sumDrops,
} from '../src/game/RunRules.js'
import { withTransaction } from './database.mjs'
import { getLeaderboard } from './leaderboard.mjs'
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
const RUN_TTL_MS = 8 * 60 * 60 * 1000
const DROP_TYPES = ['knight', 'mage', 'archer', 'assassin', 'priest', 'berserker', 'hound', 'golem', 'wraith']

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

function sanitizeDrops(value) {
  return Object.fromEntries(
    DROP_TYPES.map((type) => [type, Math.max(0, Math.min(10000, Math.round(Number(value?.[type]) || 0)))])
  )
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
  const drops = sanitizeDrops(raw.drops)
  const rawDrops = sumDrops(drops)
  if (rawDrops > clean.kills * 3 + clean.bossKills * 20 + 50) {
    throw new HttpError(422, 'implausible_run', '本局战利品数量超出合理范围')
  }
  const species = typeof raw.species === 'string'
    ? raw.species.slice(0, 80)
    : String(raw.species?.name || '').slice(0, 80)
  return {
    ...clean,
    elapsed: clean.time,
    drops,
    rawDrops,
    species,
    level: Math.max(1, Math.min(999, Math.round(Number(raw.level) || 1))),
    endlessRewardBonus: Math.max(0, Math.min(2, Number(raw.endlessRewardBonus) || 0)),
  }
}

function registrationEnabled(db, forcedValue) {
  if (typeof forcedValue === 'boolean') return forcedValue
  return db.prepare("SELECT value FROM server_settings WHERE key = 'registration_enabled'").get()?.value !== '0'
}

/** 本机局域网 IPv4 列表：给前端展示「其他设备加入地址」，避免 localhost 误导。 */
function lanIPv4Addresses() {
  const addresses = []
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) addresses.push(entry.address)
    }
  }
  // 家庭路由器网段优先：172.x 常为 WSL/Hyper-V/VMware 虚拟网卡，别的设备连不上
  return addresses.sort((a, b) => Number(!a.startsWith('192.168.')) - Number(!b.startsWith('192.168.')))
}

export function createLanApp({ db, distDir = null, registration = null }) {
  const app = express()
  app.disable('x-powered-by')
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    next()
  })
  app.use(express.json({ limit: '64kb' }))

  app.get('/api/status', (req, res) => {
    res.json({
      service: 'slime-rampage-lan',
      version: 1,
      registrationEnabled: registrationEnabled(db, registration),
      serverTime: new Date().toISOString(),
      lanIps: lanIPv4Addresses(),
      lanPort: req.socket.localPort || null,
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
    res.json({ account: accountPayload(req.account), catalog: profileCatalog(db, req.account.id) })
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
        const result = db.prepare(`
          INSERT INTO users(username, display_name, password_hash, password_salt, created_at, last_login_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(valid.username, valid.displayName, password.hash, password.salt, now, now)
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
    res.status(201).json({ account: accountPayload(account), catalog: profileCatalog(db, userId) })
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
    res.json({ account: accountPayload(account), catalog: profileCatalog(db, account.id) })
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
      next(new HttpError(401, 'authentication_required', '请先登录局域网账号'))
      return
    }
    next()
  })

  app.get('/api/profile', (req, res) => {
    res.json({ catalog: profileCatalog(db, req.account.id) })
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

  app.delete('/api/profiles/:id', (req, res, next) => {
    try {
      const index = parseSlotId(req.params.id)
      const deleted = withTransaction(db, () => deleteProfileSlot(db, req.account.id, index))
      if (!deleted) throw new HttpError(409, 'profile_required', '至少需要保留一个档案')
      res.json({ catalog: profileCatalog(db, req.account.id) })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/profile/import', (req, res, next) => {
    try {
      const source = req.body?.slot?.data
      if (!source || typeof source !== 'object') throw new HttpError(400, 'invalid_profile', '本地档案格式无效')
      const row = activeProfileRow(db, req.account.id)
      withTransaction(db, () => writeProfileData(db, row, sanitizeSave(source)))
      res.json({ catalog: profileCatalog(db, req.account.id) })
    } catch (error) {
      next(error)
    }
  })

  app.patch('/api/profile/preferences', (req, res, next) => {
    try {
      const row = activeProfileRow(db, req.account.id)
      const data = parseProfileData(row)
      data.preferences = normalizeRunSelection(req.body?.preferences)
      withTransaction(db, () => writeProfileData(db, row, data))
      res.json({ catalog: profileCatalog(db, req.account.id) })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/profile/genes/:geneId/purchase', (req, res, next) => {
    try {
      const row = activeProfileRow(db, req.account.id)
      const data = parseProfileData(row)
      const gene = getGene(req.params.geneId)
      if (!gene) throw new HttpError(404, 'gene_not_found', '没有找到这个基因')
      const state = getGenePurchaseState(gene, data.genes, data.drops)
      if (!state.canBuy) throw new HttpError(409, 'gene_unavailable', state.reason || '当前无法购买这个基因')
      data.drops -= state.cost
      data.genes[gene.id] = state.level + 1
      withTransaction(db, () => writeProfileData(db, row, data))
      res.json({ catalog: profileCatalog(db, req.account.id), purchase: { geneId: gene.id, level: state.level + 1, cost: state.cost } })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/runs/start', (req, res, next) => {
    try {
      if (!MODE_IDS.includes(req.body?.mode) || !DIFFICULTY_IDS.includes(req.body?.difficulty)) {
        throw new HttpError(400, 'invalid_selection', '作战模式或难度无效')
      }
      const selection = normalizeRunSelection(req.body)
      const profile = activeProfileRow(db, req.account.id)
      const data = parseProfileData(profile)
      if (!isModeUnlocked(data.progression, selection.mode) || !isDifficultyUnlocked(data.progression, selection.difficulty)) {
        throw new HttpError(403, 'run_locked', '当前档案尚未解锁这套规则')
      }
      const now = Date.now()
      const ticket = {
        id: randomUUID(),
        expiresAt: now + RUN_TTL_MS,
      }
      db.prepare(`
        INSERT INTO run_tickets(id, user_id, profile_id, mode, difficulty, issued_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(ticket.id, req.account.id, profile.id, selection.mode, selection.difficulty, now, ticket.expiresAt)
      res.status(201).json({ ticket })
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
        if (ticket.completed_at) {
          const completed = db.prepare('SELECT result_json FROM runs WHERE ticket_id = ?').get(ticket.id)
          return JSON.parse(completed.result_json)
        }
        if (Number(ticket.expires_at) < Date.now()) {
          throw new HttpError(410, 'run_expired', '这局行动记录已经过期')
        }
        const run = sanitizeSubmission(req.body?.run, ticket)
        const profile = profileRowById(db, req.account.id, ticket.profile_id)
        if (!profile) throw new HttpError(404, 'profile_not_found', '本局对应的档案已不存在')
        const data = parseProfileData(profile)
        const selection = { mode: ticket.mode, difficulty: ticket.difficulty }
        const previousScore = getRunRecord(data, selection).best.score || 0
        const earnedDrops = calculateMaterialReward(run.rawDrops, selection, run)
        data.drops += earnedDrops
        const scoreResult = pushScore(data, selection, run)
        writeProfileData(db, profile, data)

        const runId = randomUUID()
        const submittedAt = new Date().toISOString()
        const result = {
          runId,
          rawDrops: run.rawDrops,
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
      const board = getLeaderboard(db, stored.entry.mode, stored.entry.difficulty, 50, req.account.id)
      res.json({ catalog: profileCatalog(db, req.account.id), result: stored, leaderboard: board })
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/leaderboard', (req, res, next) => {
    try {
      if (!MODE_IDS.includes(req.query.mode) || !DIFFICULTY_IDS.includes(req.query.difficulty)) {
        throw new HttpError(400, 'invalid_selection', '排行榜模式或难度无效')
      }
      res.json({
        leaderboard: getLeaderboard(db, req.query.mode, req.query.difficulty, req.query.limit, req.account?.id),
      })
    } catch (error) {
      next(error)
    }
  })

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'api_not_found', '接口不存在')))

  if (distDir && existsSync(join(distDir, 'index.html'))) {
    app.use(express.static(distDir, { index: false, maxAge: '1h' }))
    app.use((req, res, next) => {
      if (req.method !== 'GET') {
        next()
        return
      }
      res.sendFile(join(distDir, 'index.html'))
    })
  }

  app.use((error, _req, res, _next) => {
    const status = Number(error.status) || 500
    if (status >= 500) console.error(error)
    res.status(status).json({
      error: {
        code: error.code || 'server_error',
        message: status >= 500 ? '局域网服务器处理请求时发生错误' : error.message,
        details: error.details || null,
      },
    })
  })
  return app
}
