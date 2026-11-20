import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLanApp } from './server/app.mjs'
import { AUTO_BACKUP_KEEP, backupDatabase, backupFilename, pruneBackups } from './server/backup-task.mjs'
import { openDatabase } from './server/database.mjs'

const tempDir = mkdtempSync(join(tmpdir(), 'slime-backup-test-'))
const db = openDatabase(join(tempDir, 'backup.db'))
let server
let second
try {
  server = createLanApp({ db, registration: true }).listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  async function api(path, { cookie, body, method = body ? 'POST' : 'GET' } = {}) {
    const response = await fetch(base + path, { method, headers: {
      ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}),
    }, body: body ? JSON.stringify(body) : undefined })
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie }
  }
  const apiOn = (other) => async (path, { cookie, body, method = body ? 'POST' : 'GET' } = {}) => {
    const response = await fetch(other + path, { method, headers: {
      ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}),
    }, body: body ? JSON.stringify(body) : undefined })
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie }
  }

  // 首个注册账号自动成为管理员，其余是普通玩家。
  const alice = await api('/api/auth/register', { body: { username: 'Alice', password: 'backup-test-123' } })
  const bob = await api('/api/auth/register', { body: { username: 'Bob', password: 'backup-test-456' } })
  assert.equal(alice.data.account.admin, true)
  assert.equal(bob.data.account.admin, false)

  // 管理接口的访问边界：未登录 401、普通玩家 403；旧玩家自助备份接口已移除。
  assert.equal((await api('/api/admin/accounts')).status, 401)
  assert.equal((await api('/api/admin/accounts', { cookie: bob.cookie })).status, 403)
  assert.equal((await api('/api/admin/backup', { cookie: bob.cookie })).status, 403)
  assert.equal((await api('/api/account/export', { cookie: alice.cookie })).status, 404)
  assert.equal((await api('/api/account/import', { cookie: alice.cookie, body: {} })).status, 404)

  // Bob 攒一些进度：主战场存档、塔防、两次突围。
  const entry = { mode: 'expedition', difficulty: 'normal', result: 'victory', stage: 6, wave: 12, kills: 150, time: 900, score: 5000, scoreVersion: 3, date: '2026-01-01' }
  const saveB = { version: 6, drops: 4321, genes: { vitality: 2 }, records: { 'expedition:normal': { best: entry, board: [entry] } } }
  assert.equal((await api('/api/profile/import', { cookie: bob.cookie, body: { slot: { data: saveB }, campaign: { unlockedStage: 4, stageStars: { 1: 3, 2: 2 } } } })).status, 200)
  const runnerRun = { outcome: 'defeat', elapsed: 20, kills: 3, score: 700, submode: 'blitz' }
  async function bobRun() {
    const ticket = await api('/api/runs/start', { cookie: bob.cookie, body: { gameplay: 'runner', mode: 'blitz', difficulty: 'standard' } })
    db.prepare('UPDATE run_tickets SET issued_at = ? WHERE id = ?').run(Date.now() - 600000, ticket.data.ticket.id)
    return api(`/api/runs/${ticket.data.ticket.id}/finish`, { cookie: bob.cookie, body: { run: runnerRun } })
  }
  assert.equal((await bobRun()).status, 200)
  assert.equal((await bobRun()).status, 200)

  // 管理员按账号导出 → Bob 继续推进 → 管理员按账号恢复。
  const exported = await api(`/api/admin/accounts/${bob.data.account.id}/export`, { cookie: alice.cookie })
  assert.equal(exported.status, 200)
  assert.equal(exported.data.kind, 'slime-rampage-backup')
  assert.equal(exported.data.account.username, 'bob')
  assert.equal(exported.data.catalog.slots[0].data.drops, 4361)
  assert.equal(exported.data.accountData.campaign.unlockedStage, 4)
  await api('/api/account/import-campaign', { cookie: bob.cookie, body: { campaign: { unlockedStage: 8 } } })
  assert.equal((await api('/api/profiles', { cookie: bob.cookie, body: { index: 1 } })).status, 201)
  const imported = await api(`/api/admin/accounts/${bob.data.account.id}/import`, { cookie: alice.cookie, body: exported.data })
  assert.equal(imported.status, 200, JSON.stringify(imported.data))
  assert.equal(imported.data.catalog.slots[0].data.drops, 4361)
  assert.equal(imported.data.catalog.slots[1], null, '恢复按备份整体覆盖，新建槽位被移除')
  assert.equal(imported.data.accountData.campaign.unlockedStage, 4)
  const bobHistory = await api('/api/account/records?gameplay=runner', { cookie: bob.cookie })
  assert.equal(bobHistory.data.total, 2, '按账号恢复不清空行动流水')
  assert.equal(bobHistory.data.accountData.records['runner:blitz'].plays, 2)

  // 非管理员不能对他人导出/恢复；非法文件被拒。
  assert.equal((await api(`/api/admin/accounts/${alice.data.account.id}/export`, { cookie: bob.cookie })).status, 403)
  assert.equal((await api(`/api/admin/accounts/${bob.data.account.id}/import`, { cookie: alice.cookie, body: { kind: 'other' } })).status, 400)
  assert.equal((await api('/api/admin/accounts/999/export', { cookie: alice.cookie })).status, 404)

  // 停用：立即踢下线且禁止登录；启用后恢复。不能停用自己。
  assert.equal((await api(`/api/admin/accounts/${alice.data.account.id}/disable`, { cookie: alice.cookie, method: 'POST' })).status, 400)
  const carol = await api('/api/auth/register', { body: { username: 'Carol', password: 'backup-test-789' } })
  assert.equal(carol.data.account.admin, false)
  assert.equal((await api(`/api/admin/accounts/${carol.data.account.id}/disable`, { cookie: alice.cookie, method: 'POST' })).status, 200)
  assert.equal((await api('/api/auth/me', { cookie: carol.cookie })).data.account, null, '停用即踢下线')
  const deniedLogin = await api('/api/auth/login', { body: { username: 'carol', password: 'backup-test-789' } })
  assert.equal(deniedLogin.status, 403)
  assert.equal((await api(`/api/admin/accounts/${carol.data.account.id}/enable`, { cookie: alice.cookie, method: 'POST' })).status, 200)
  assert.equal((await api('/api/auth/login', { body: { username: 'carol', password: 'backup-test-789' } })).status, 200)

  // 整服备份包含全部账号、流水与设置。
  const full = await api('/api/admin/backup', { cookie: alice.cookie })
  assert.equal(full.status, 200)
  assert.equal(full.data.kind, 'slime-rampage-server-backup')
  assert.equal(full.data.accounts.length, 3)
  const bobEntry = full.data.accounts.find((item) => item.user.username === 'bob')
  assert.equal(bobEntry.catalog.slots[0].data.drops, 4361)
  assert.equal(bobEntry.runs.length, 2)
  assert.equal(bobEntry.tickets.length, 2)
  assert.equal(full.data.settings.registration_enabled, '1')
  assert.equal(full.data.accounts.find((item) => item.user.username === 'alice').user.role, 'admin')

  // 备份后世界继续变化：新玩家、停用、进度推进；恢复后整体回到快照。
  await api('/api/auth/register', { body: { username: 'Dave', password: 'backup-test-000' } })
  assert.equal((await api(`/api/admin/accounts/${carol.data.account.id}/disable`, { cookie: alice.cookie, method: 'POST' })).status, 200)
  await api('/api/account/import-campaign', { cookie: bob.cookie, body: { campaign: { unlockedStage: 12 } } })
  const restored = await api('/api/admin/restore', { cookie: alice.cookie, body: full.data })
  assert.equal(restored.status, 200, JSON.stringify(restored.data))
  assert.equal(restored.data.restored.accounts, 3)
  assert.equal(restored.data.restored.runs, 2)
  // 恢复后所有会话失效，需重新登录；Dave 随清库消失，Carol 恢复启用状态。
  assert.equal((await api('/api/auth/me', { cookie: alice.cookie })).data.account, null)
  assert.equal((await api('/api/auth/login', { body: { username: 'dave', password: 'backup-test-000' } })).status, 401)
  assert.equal((await api('/api/auth/login', { body: { username: 'carol', password: 'backup-test-789' } })).status, 200)
  const alice2 = await api('/api/auth/login', { body: { username: 'alice', password: 'backup-test-123' } })
  assert.equal(alice2.data.account.admin, true)
  assert.equal(alice2.data.catalog.slots.length, 3)
  const bob2 = await api('/api/auth/login', { body: { username: 'bob', password: 'backup-test-456' } })
  assert.equal(bob2.data.catalog.slots[0].data.drops, 4361)
  assert.equal(bob2.data.accountData.campaign.unlockedStage, 4)
  assert.equal((await api('/api/account/records?gameplay=runner', { cookie: bob2.cookie })).data.total, 2, '整服恢复保留行动流水与榜单')
  const board = await api('/api/leaderboard?gameplay=runner&mode=blitz&difficulty=standard')
  assert.equal(board.data.leaderboard.totalPlayers, 1)

  // 非法整服文件被拒且不破坏数据。
  assert.equal((await api('/api/admin/restore', { cookie: alice2.cookie, body: { kind: 'slime-rampage-server-backup', format: 99 } })).status, 400)
  assert.equal((await api('/api/admin/restore', { cookie: alice2.cookie, body: { kind: 'slime-rampage-server-backup', format: 1 } })).status, 400)
  assert.equal((await api('/api/auth/me', { cookie: alice2.cookie })).data.account.username, 'alice')

  // 迁移场景：全新服务器上注册的第一个账号成为临时管理员，恢复备份后可登录原账号。
  const freshDir = mkdtempSync(join(tmpdir(), 'slime-backup-fresh-'))
  const freshDb = openDatabase(join(freshDir, 'fresh.db'))
  const freshServer = createLanApp({ db: freshDb, registration: true }).listen(0, '127.0.0.1')
  await new Promise((resolve) => freshServer.once('listening', resolve))
  const fresh = apiOn(`http://127.0.0.1:${freshServer.address().port}`)
  try {
    const temp = await fresh('/api/auth/register', { body: { username: 'Temp', password: 'temp-pass-123' } })
    assert.equal(temp.data.account.admin, true, '新服务器首个注册账号是管理员')
    const migrated = await fresh('/api/admin/restore', { cookie: temp.cookie, body: full.data })
    assert.equal(migrated.status, 200)
    const bobFresh = await fresh('/api/auth/login', { body: { username: 'bob', password: 'backup-test-456' } })
    assert.equal(bobFresh.status, 200)
    assert.equal(bobFresh.data.catalog.slots[0].data.drops, 4361)
    assert.equal((await fresh('/api/account/records?gameplay=runner', { cookie: bobFresh.cookie })).data.total, 2)
    assert.equal((await fresh('/api/auth/login', { body: { username: 'temp', password: 'temp-pass-123' } })).status, 401, '恢复覆盖临时管理员')
  } finally {
    await new Promise((resolve) => freshServer.close(resolve))
    freshDb.close()
    rmSync(freshDir, { recursive: true, force: true })
  }

  // SLIME_ADMIN 环境变量找回通道：普通玩家凭环境变量获得管理员权限。
  process.env.SLIME_ADMIN = 'bob'
  try {
    second = createLanApp({ db, registration: true }).listen(0, '127.0.0.1')
    await new Promise((resolve) => second.once('listening', resolve))
    const envBase = `http://127.0.0.1:${second.address().port}`
    const envApi = apiOn(envBase)
    const bobEnv = await envApi('/api/auth/login', { body: { username: 'bob', password: 'backup-test-456' } })
    assert.equal(bobEnv.data.account.admin, true)
    assert.equal((await envApi('/api/admin/accounts', { cookie: bobEnv.cookie })).status, 200)
    const aliceEnv = await envApi('/api/auth/login', { body: { username: 'alice', password: 'backup-test-123' } })
    assert.equal(aliceEnv.data.account.admin, true, '数据库角色与环境变量并存')
  } finally {
    delete process.env.SLIME_ADMIN
    if (second) { await new Promise((resolve) => second.close(resolve)); second = null }
  }

  // 库级备份工具：生成实体备份文件，滚动清理只留最近 AUTO_BACKUP_KEEP 份。
  const backupDir = join(tempDir, 'backups')
  const target = await backupDatabase(db, join(backupDir, backupFilename()))
  assert.ok(existsSync(target))
  for (let index = 0; index < AUTO_BACKUP_KEEP + 2; index++) {
    writeFileSync(join(backupDir, `slime-rampage_2026-01-0${(index % 9) + 1}_00-00-${String(index).padStart(2, '0')}.db`), 'x')
  }
  pruneBackups(backupDir, AUTO_BACKUP_KEEP)
  const remaining = readdirSync(backupDir)
  assert.equal(remaining.length, AUTO_BACKUP_KEEP)
  assert.ok(remaining.every((name) => /^slime-rampage_.+\.db$/.test(name)))

  console.log('✓ 数据备份：管理员边界、按账号恢复、整服恢复、跨服迁移、停用启用、环境变量管理员、自动备份清理均通过')
} finally {
  if (server) await new Promise((resolve) => server.close(resolve))
  if (second) await new Promise((resolve) => second.close(resolve))
  db.close()
  rmSync(tempDir, { recursive: true, force: true })
}
