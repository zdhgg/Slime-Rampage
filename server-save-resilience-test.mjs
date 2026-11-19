import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { openDatabase, withTransaction } from './server/database.mjs'
import { createGameApp } from './server/app.mjs'
import { parseProfileData, profileCatalog, writeProfileData } from './server/profile-store.mjs'
import { accountGameData, writeAccountGameData } from './server/account-store.mjs'
import { backupBeforeMigration, createBackupService, verifyBackup } from './server/backup-task.mjs'
const dir = mkdtempSync(join(tmpdir(), 'slime-resilience-'))
const db = openDatabase(join(dir, 'test.db'))
let server, service
try {
  let destructiveBackups = 0
  server = createGameApp({ db, registration: true, beforeDestructiveWrite: async () => { destructiveBackups++ } }).listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  async function api(path, { body, cookie, version, method = body ? 'POST' : 'GET' } = {}) {
    const response = await fetch(base + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}), ...(version ? { 'X-Save-Epoch': version.saveEpoch, 'X-Save-Revision': String(version.accountRevision) } : {}) },
      body: body ? JSON.stringify(body) : undefined })
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie }
  }
  const alice = await api('/api/auth/register', { body: { username: 'Alice', password: 'resilience-123' } })
  const cookie = alice.cookie
  const userId = alice.data.account.id
  const profileId = alice.data.catalog.slots[0].profileId
  const row = () => db.prepare('SELECT * FROM profiles WHERE id = ?').get(profileId)
  let data = parseProfileData(row(), db)
  data.drops = 2000
  withTransaction(db, () => writeProfileData(db, row(), data))
  data.drops = 3000
  withTransaction(db, () => writeProfileData(db, row(), data))
  db.prepare('UPDATE profiles SET data_json = ? WHERE id = ?').run('{damaged', profileId)
  assert.equal(profileCatalog(db, userId).slots[0].data.drops, 2000)
  assert.equal(profileCatalog(db, userId).recoveryNotices.length, 1)
  assert.equal(row().data_json, '{damaged')
  data = parseProfileData(row(), db)
  withTransaction(db, () => writeProfileData(db, row(), data))
  assert.ok(db.prepare("SELECT 1 FROM save_history WHERE payload = '{damaged'").get())
  const damagedUser = await api('/api/auth/register', { body: { username: 'Damaged', password: 'resilience-123' } })
  db.prepare('UPDATE profiles SET data_json = ? WHERE user_id = ?').run('null', damagedUser.data.account.id)
  assert.equal((await api('/api/profile', { cookie: damagedUser.cookie })).data.error.code, 'save_damaged')
  const campaign = accountGameData(db, userId)
  campaign.campaign.unlockedStage = 4
  withTransaction(db, () => writeAccountGameData(db, userId, campaign))
  campaign.campaign.unlockedStage = 5
  withTransaction(db, () => writeAccountGameData(db, userId, campaign))
  db.prepare('UPDATE account_game_data SET data_json = ? WHERE user_id = ?').run('{damaged', userId)
  assert.equal(accountGameData(db, userId).campaign.unlockedStage, 4)
  assert.ok(accountGameData(db, userId).recoveryNotice)
  withTransaction(db, () => writeAccountGameData(db, userId, accountGameData(db, userId)))
  // Drop the synthetic damaged account so full-server export remains meaningful.
  db.prepare('DELETE FROM users WHERE id = ?').run(damagedUser.data.account.id)
  console.log('✓ Server profile/account history recovers valid copies without overwriting corrupt originals')

  const stale = (await api('/api/profile', { cookie })).data.catalog
  assert.equal((await api('/api/runs/start', { version: stale, body: { gameplay: 'arena', mode: 'expedition', difficulty: 'normal' } })).status, 401)
  assert.equal((await api('/api/profile/preferences', { cookie, version: stale, method: 'PATCH', body: { preferences: { mode: 'expedition', difficulty: 'normal' } } })).status, 200)
  assert.equal((await api('/api/profile/preferences', { cookie, version: stale, method: 'PATCH', body: { preferences: { mode: 'expedition', difficulty: 'normal' } } })).data.error.code, 'save_conflict')
  const started = await api('/api/runs/start', { cookie, body: { gameplay: 'runner', mode: 'blitz', difficulty: 'standard' } })
  const ticket = started.data.ticket.id
  assert.equal((await api(`/api/runs/${ticket}/resume`, { cookie, body: {} })).status, 200)
  const backup = (await api(`/api/admin/accounts/${userId}/export`, { cookie })).data
  const restored = await api(`/api/admin/accounts/${userId}/import`, { cookie, body: backup })
  assert.equal(restored.status, 200)
  assert.notEqual(restored.data.catalog.saveEpoch, stale.saveEpoch)
  assert.equal((await api(`/api/runs/${ticket}/finish`, { cookie, body: { run: { outcome: 'defeat', elapsed: 0, kills: 0, score: 0 } } })).data.error.code, 'save_restored')
  assert.equal((await api(`/api/runs/${ticket}/resume`, { cookie, body: {} })).data.error.code, 'save_restored')
  console.log('✓ Stale device writes and pre-restore action tickets are rejected')

  const entire = (await api('/api/admin/backup', { cookie })).data
  entire.transportPadding = 'x'.repeat(5 * 1024 * 1024)
  const large = await api('/api/admin/restore', { cookie, body: entire })
  assert.equal(large.status, 200, JSON.stringify(large.data))
  assert.equal(destructiveBackups, 2)
  console.log('✓ Restore accepts files above the old 4MB boundary and invokes pre-restore backup')

  const migrationFile = join(dir, 'before-migration.db')
  const old = new DatabaseSync(migrationFile)
  old.exec('CREATE TABLE legacy (progress INTEGER); INSERT INTO legacy VALUES (42)')
  old.close()
  const copy = await backupBeforeMigration(migrationFile, join(dir, 'before'))
  verifyBackup(copy)
  const inspection = new DatabaseSync(copy, { readOnly: true })
  assert.equal(inspection.prepare('SELECT progress FROM legacy').get().progress, 42)
  assert.equal(inspection.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'schema_migrations'").get().n, 0)
  inspection.close()
  service = createBackupService(db, join(dir, 'scheduled'), { enabled: false, mirrorDir: join(dir, 'mirror') })
  assert.ok(await service.snapshot())
  assert.equal(await service.snapshot(), '')
  db.prepare("UPDATE server_settings SET value = '0' WHERE key = 'registration_enabled'").run()
  assert.ok(await service.snapshot())
  const copies = readdirSync(join(dir, 'scheduled'))
  assert.equal(copies.length, 2)
  assert.ok(copies.every(file => file.endsWith('.db')))
  assert.equal(readdirSync(join(dir, 'mirror')).length, 2)
  console.log('✓ Pre-migration copies preserve old schema; changed-only backup and mirror copies verify correctly')
} finally {
  if (service) await service.close()
  if (server) await new Promise(resolve => server.close(resolve))
  db.close()
  const target = resolve(dir)
  assert.equal(target.startsWith(resolve(tmpdir()) + '\\'), true)
  rmSync(target, { recursive: true, force: true })
}
