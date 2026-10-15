import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createLanApp } from './server/app.mjs'
import { openDatabase } from './server/database.mjs'
import { initializeAccount } from './server/profile-store.mjs'
import { getStageConfig } from './src/game/gameplay/tower-defense/TowerDefenseCampaignRules.js'
import { createSettlementQueue } from './src/services/SettlementQueue.js'
import { setAccountCampaign, loadCampaignSave, recordStageClear, createDefaultSave } from './src/game/gameplay/tower-defense/TowerDefenseSave.js'

const tempDir = mkdtempSync(join(tmpdir(), 'slime-account-test-'))
const filename = join(tempDir, 'accounts.db')
let db = openDatabase(filename)
let server
try {
  // 重现升级前数据库：只移除 v2 引入的结构，保留旧用户和主战场存档。
  db.prepare(`INSERT INTO users(username, display_name, password_hash, password_salt, created_at) VALUES ('legacy', 'Legacy', '', '', '2026-01-01')`).run()
  initializeAccount(db, 1)
  db.prepare("UPDATE profiles SET data_json = json_set(data_json, '$.drops', 123) WHERE user_id = 1").run()
  db.exec(`DROP INDEX runs_gameplay_board_idx;
    ALTER TABLE runs DROP COLUMN gameplay;
    ALTER TABLE run_tickets DROP COLUMN gameplay;
    ALTER TABLE run_tickets DROP COLUMN stage_id;
    DROP TABLE account_game_data;
    DELETE FROM schema_migrations WHERE version = 2;`)
  db.close()
  db = openDatabase(filename)
  assert.equal(JSON.parse(db.prepare('SELECT data_json FROM profiles WHERE user_id = 1').get().data_json).drops, 123)
  assert.equal(db.prepare('SELECT count(*) AS n FROM schema_migrations').get().n, 2)
  server = createLanApp({ db, registration: true }).listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  async function api(path, { cookie, body, method = body ? 'POST' : 'GET' } = {}) {
    const response = await fetch(base + path, { method, headers: {
      ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}),
    }, body: body ? JSON.stringify(body) : undefined })
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie }
  }
  const alice = await api('/api/auth/register', { body: { username: 'Alice', password: 'account-test-123' } })
  const bob = await api('/api/auth/register', { body: { username: 'Bob', password: 'account-test-456' } })
  assert.equal(alice.status, 201)
  assert.notEqual(alice.data.account.id, bob.data.account.id)
  const selection = { gameplay: 'runner', mode: 'blitz', difficulty: 'standard' }
  assert.equal((await api('/api/runs/start', { body: selection })).status, 401)
  assert.equal((await api('/api/account/records')).status, 401)
  assert.equal((await api('/api/leaderboard?gameplay=runner&mode=blitz&difficulty=standard')).status, 200)
  assert.equal((await api('/api/runs/start', { cookie: alice.cookie, body: { ...selection, mode: 'invalid' } })).status, 400)
  assert.equal((await api('/api/runs/start', { cookie: alice.cookie, body: { gameplay: 'tower-defense', mode: 'campaign', difficulty: 'standard', stageId: 2 } })).status, 403)

  async function start(body, cookie = alice.cookie) {
    const response = await api('/api/runs/start', { cookie, body })
    assert.equal(response.status, 201, JSON.stringify(response.data))
    const ticketId = response.data.ticket.id
    db.prepare('UPDATE run_tickets SET issued_at = ? WHERE id = ?').run(Date.now() - 600000, ticketId)
    return ticketId
  }
  const runnerTicket = await start(selection)
  assert.equal((await api(`/api/runs/${runnerTicket}/finish`, { cookie: bob.cookie, body: { run: { outcome: 'defeat' } } })).status, 404)
  const runnerRun = { outcome: 'defeat', elapsed: 20, kills: 3, score: 700, submode: 'blitz' }
  const runnerFinish = await api(`/api/runs/${runnerTicket}/finish`, { cookie: alice.cookie, body: { run: runnerRun } })
  assert.equal(runnerFinish.status, 200, JSON.stringify(runnerFinish.data))
  assert.equal(runnerFinish.data.accountData.records['runner:blitz'].plays, 1)
  assert.equal(runnerFinish.data.leaderboard.entries[0].username, 'Alice')
  const repeated = await api(`/api/runs/${runnerTicket}/finish`, { cookie: alice.cookie, body: { run: runnerRun } })
  assert.equal(repeated.data.result.runId, runnerFinish.data.result.runId)
  assert.equal(repeated.data.accountData.records['runner:blitz'].plays, 1)
  const badTicket = await start(selection)
  assert.equal((await api(`/api/runs/${badTicket}/finish`, { cookie: alice.cookie, body: { run: { ...runnerRun, score: 1e100 } } })).status, 422)

  const tdSelection = { gameplay: 'tower-defense', mode: 'campaign', difficulty: 'standard', stageId: 1 }
  const tdTicket = await start(tdSelection)
  const stage = getStageConfig(1)
  const towerRun = { outcome: 'victory', elapsed: 120, kills: 10, score: 2500, baseHp: stage.baseHp || 20, completedWaves: stage.waves.length }
  const towerFinish = await api(`/api/runs/${tdTicket}/finish`, { cookie: alice.cookie, body: { run: towerRun } })
  assert.equal(towerFinish.status, 200, JSON.stringify(towerFinish.data))
  assert.equal(towerFinish.data.accountData.campaign.unlockedStage, 2)
  assert.equal(towerFinish.data.accountData.campaign.stageStars[1], 3)
  assert.equal(towerFinish.data.accountData.campaign.totalStarsEarned, 3)
  const newDevice = await api('/api/auth/login', { body: { username: 'ALICE', password: 'account-test-123' } })
  assert.equal(newDevice.data.accountData.campaign.unlockedStage, 2)
  assert.equal((await api('/api/auth/me', { cookie: bob.cookie })).data.accountData.campaign.unlockedStage, 1)
  const endlessTicket = await start({ ...tdSelection, mode: 'endless' })
  const endlessFinish = await api(`/api/runs/${endlessTicket}/finish`, { cookie: alice.cookie, body: { run: { ...towerRun, outcome: 'defeat', completedWaves: 8 } } })
  assert.equal(endlessFinish.status, 200)
  assert.equal(endlessFinish.data.accountData.campaign.endlessBestWave, 8)
  assert.equal(endlessFinish.data.accountData.campaign.unlockedStage, 2)

  // 服务端拒绝不完整通关；浏览器换账号也不会继承塔防进度。
  const incomplete = await start({ ...tdSelection, stageId: 2 })
  assert.equal((await api(`/api/runs/${incomplete}/finish`, { cookie: alice.cookie, body: { run: { ...towerRun, completedWaves: 0 } } })).status, 422)
  setAccountCampaign(towerFinish.data.accountData.campaign)
  recordStageClear(2, 20)
  assert.equal(loadCampaignSave().unlockedStage, 3)
  setAccountCampaign(bob.data.accountData.campaign)
  assert.equal(loadCampaignSave().unlockedStage, 1)
  setAccountCampaign(createDefaultSave())

  // 本机迁移只合并进度，不制造公共成绩，不降低已有星级。
  const imported = await api('/api/account/import-campaign', { cookie: bob.cookie, body: { campaign: { unlockedStage: 7, stageStars: { 1: 2, 6: 3 } } } })
  assert.equal(imported.data.accountData.campaign.unlockedStage, 7)
  const merged = await api('/api/account/import-campaign', { cookie: bob.cookie, body: { campaign: { unlockedStage: 1, stageStars: { 1: 1 } } } })
  assert.equal(merged.data.accountData.campaign.stageStars[1], 2)
  assert.equal((await api('/api/account/records', { cookie: bob.cookie })).data.total, 0)

  // 61 个额外玩家：第三页仍可查看，单人多局不刷榜，玩法之间互不混排。
  const template = db.prepare('SELECT * FROM runs WHERE ticket_id = ?').get(runnerTicket)
  const columns = Object.keys(template)
  for (let i = 0; i < 61; i++) {
    const user = db.prepare(`INSERT INTO users(username, display_name, password_hash, password_salt, created_at) VALUES (?, ?, '', '', '2026-01-01')`).run(`player${i}`, `Player ${i}`)
    const userId = Number(user.lastInsertRowid)
    initializeAccount(db, userId)
    const profileId = db.prepare('SELECT id FROM profiles WHERE user_id = ?').get(userId).id
    const ticketId = randomUUID()
    db.prepare(`INSERT INTO run_tickets(id, user_id, profile_id, mode, difficulty, issued_at, expires_at, gameplay) VALUES (?, ?, ?, 'blitz', 'standard', 0, 9999999999999, 'runner')`).run(ticketId, userId, profileId)
    const entry = { ...template, id: randomUUID(), ticket_id: ticketId, user_id: userId, profile_id: profileId, score: 1000 + i }
    db.prepare(`INSERT INTO runs(${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...columns.map(column => entry[column]))
  }
  const board = await api('/api/leaderboard?gameplay=runner&mode=blitz&difficulty=standard&page=4&limit=20', { cookie: alice.cookie })
  assert.equal(board.data.leaderboard.totalPlayers, 62)
  assert.equal(board.data.leaderboard.totalPages, 4)
  assert.equal(board.data.leaderboard.entries.length, 2)
  assert.equal(board.data.leaderboard.currentRank, 62)
  assert.equal(board.data.leaderboard.entries[1].current, true)
  assert.equal((await api('/api/leaderboard?mode=expedition&difficulty=normal')).data.leaderboard.totalPlayers, 0)
  const history = await api('/api/account/records', { cookie: alice.cookie })
  assert.equal(history.data.total, 3)
  assert.ok(history.data.entries.every(entry => ['runner', 'tower-defense'].includes(entry.gameplay)))
  await api('/api/profiles', { cookie: alice.cookie, body: { index: 1 } })
  assert.equal((await api('/api/profiles/slot-1', { cookie: alice.cookie, method: 'DELETE' })).status, 200)
  assert.equal((await api('/api/account/records', { cookie: alice.cookie })).data.total, 3, '删除成长槽不应删除账号成绩')

  // 筛选必须先在服务端过滤，再分页；概览始终覆盖当前账号所有玩法。
  for (let index = 0; index < 21; index++) {
    const ticketId = randomUUID()
    const profileId = db.prepare('SELECT id FROM profiles WHERE user_id = ?').get(alice.data.account.id).id
    db.prepare(`INSERT INTO run_tickets(id, user_id, profile_id, mode, difficulty, issued_at, expires_at, gameplay) VALUES (?, ?, ?, 'blitz', 'standard', 0, 9999999999999, 'runner')`).run(ticketId, alice.data.account.id, profileId)
    const entry = { ...template, id: randomUUID(), ticket_id: ticketId, user_id: alice.data.account.id, profile_id: profileId, score: 1300 + index }
    db.prepare(`INSERT INTO runs(${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...columns.map(column => entry[column]))
  }
  const filteredRunner = await api('/api/account/records?gameplay=runner&page=2', { cookie: alice.cookie })
  assert.equal(filteredRunner.data.total, 22)
  assert.equal(filteredRunner.data.entries.length, 2)
  assert.equal(filteredRunner.data.totalPages, 2)
  assert.equal(filteredRunner.data.overallTotal, 24)
  assert.equal(filteredRunner.data.summary.runner.bestScore, 1320)
  assert.equal(filteredRunner.data.summary['tower-defense'].plays, 2)
  assert.ok(filteredRunner.data.entries.every(entry => entry.gameplay === 'runner'))
  const filteredTower = await api('/api/account/records?gameplay=tower-defense&page=2', { cookie: alice.cookie })
  assert.equal(filteredTower.data.page, 1)
  assert.equal(filteredTower.data.total, 2)
  assert.equal(filteredTower.data.summary.runner.plays, 22)
  assert.equal(filteredTower.data.summary['tower-defense'].clears, 1)
  const emptyArena = await api('/api/account/records?gameplay=arena', { cookie: alice.cookie })
  assert.equal(emptyArena.data.total, 0)
  assert.equal(emptyArena.data.summary.arena.bestScore, null)
  assert.equal((await api('/api/account/records?gameplay=unknown', { cookie: alice.cookie })).status, 400)
  const otherHistory = await api('/api/account/records?gameplay=runner', { cookie: bob.cookie })
  assert.equal(otherHistory.data.overallTotal, 0)
  assert.equal(otherHistory.data.summary.runner.plays, 0)

  // 丢失成功响应后重试：重载队列、按账号隔离、服务端仍只结算一次。
  const values = new Map()
  const storage = { get length() { return values.size }, key: index => [...values.keys()][index], getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  let queue = createSettlementQueue(storage)
  const job = { accountId: alice.data.account.id, ticketId: runnerTicket, gameplay: 'runner', run: runnerRun }
  queue.add(job); queue.add(job)
  assert.equal(queue.list(job.accountId).length, 1)
  await queue.flush(job.accountId, async () => { throw new Error('断线') }, () => assert.fail('不能确认失败请求'))
  assert.equal(queue.list(job.accountId).length, 1)
  queue = createSettlementQueue(storage)
  await queue.flush(bob.data.account.id, () => assert.fail('不能跨账号提交'), () => {})
  const secondTab = createSettlementQueue(storage)
  secondTab.add({ ...job, ticketId: 'second-tab-job' })
  assert.equal(queue.list(job.accountId).length, 2, '另一个标签页添加的结算不可丢失')
  await secondTab.flush(job.accountId, async queued => {
    if (queued.ticketId === 'second-tab-job') throw Object.assign(new Error('invalid'), { status: 422 })
    throw new Error('保留原始结算')
  }, () => {})
  // 独立移除模拟标签页记录，原始待同步结算仍在。
  storage.removeItem('slime-account-settlement:second-tab-job')
  assert.equal(queue.list(job.accountId).length, 1)
  let acknowledgements = 0
  await queue.flush(job.accountId, async queued => {
    const response = await api(`/api/runs/${queued.ticketId}/finish`, { cookie: alice.cookie, body: { run: queued.run } })
    assert.equal(response.status, 200)
    return response.data
  }, () => acknowledgements++)
  assert.equal(acknowledgements, 1)
  assert.equal(queue.list(job.accountId).length, 0)
  assert.equal((await api('/api/auth/me', { cookie: alice.cookie })).data.accountData.records['runner:blitz'].plays, 1)
  queue.add({ ...job, ticketId: 'expired-ticket' })
  await queue.flush(job.accountId, async () => { throw Object.assign(new Error('结算过期'), { status: 410 }) }, () => {})
  assert.equal(queue.list(job.accountId)[0].failed, true)
  await queue.flush(job.accountId, () => assert.fail('不应自动重试永久错误'), () => {})
  queue.discard(bob.data.account.id, 'expired-ticket')
  assert.equal(queue.list(job.accountId).length, 1)
  queue.discard(job.accountId, 'expired-ticket')
  assert.equal(queue.list(job.accountId).length, 0)
  const noStorage = createSettlementQueue({ getItem: () => null, setItem() { throw new Error('quota') } })
  noStorage.add(job)
  assert.equal(noStorage.durable, false)
  assert.equal(noStorage.list(job.accountId).length, 1)
  console.log('✓ 账号升级：旧库迁移、三玩法隔离、塔防解锁、跨设备恢复、全量分页榜、行动历史、断线幂等重试均通过')
} finally {
  if (server) await new Promise(resolve => server.close(resolve))
  db.close()
  const target = join(tmpdir(), tempDir.split(/[\\/]/).pop())
  assert.equal(target, tempDir)
  rmSync(target, { recursive: true, force: true })
}
