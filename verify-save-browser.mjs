import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { build } from 'vite'
import { openDatabase } from './server/database.mjs'
import { createGameApp } from './server/app.mjs'
const output = path.resolve('.workbuddy/save-browser')
await mkdir(output, { recursive: true })
const fixture = await mkdtemp(path.join(tmpdir(), 'slime-save-browser-'))
// Build a disposable production UI with test-only access to the existing Vue
// bindings. No test hook enters the shipped application or player database.
await build({
  logLevel: 'warn',
  build: { outDir: path.join(fixture, 'dist') },
  plugins: [{
    name: 'save-browser-fixture', enforce: 'pre',
    transform(source, id) {
      if (!id.replaceAll('\\', '/').endsWith('/src/App.vue')) return
      const fields = ['account', 'engine', 'started', 'runContext', 'pendingSettlements', 'syncing', 'activeGameplay', 'continuation']
      const getters = fields.map(key => `get ${key}() { return ${key}.value }`).join(',')
      return source.replace('</script>', `window.__saveTestApp = { ${getters}, onChangeRules, onStartRunner, onStartTowerDefenseStage, persistRunCheckpoint, captureExpeditionCheckpoint, captureTowerCheckpoint }\n</script>`)
    },
  }],
})
console.log('browser: initializing isolated server')
const db = openDatabase(':memory:')
const server = createGameApp({ db, registration: true, distDir: path.join(fixture, 'dist') }).listen(0, '127.0.0.1')
await once(server, 'listening')
const port = server.address().port
console.log('browser: launching Edge')
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, baseURL: `http://127.0.0.1:${port}`, acceptDownloads: true })
const page = await context.newPage()
page.setDefaultTimeout(30000)
page.setDefaultNavigationTimeout(120000)
const errors = []
page.on('pageerror', error => { errors.push(error.message); console.error('PAGE ERROR:', error.message) })
page.on('console', message => { if (message.type() === 'error') console.error('CONSOLE:', message.text()) })
page.on('requestfailed', request => console.error('REQUEST FAILED:', request.url(), request.failure()?.errorText))
page.on('response', response => { if (response.status() >= 400) console.error('HTTP:', response.status(), response.url()) })
const ready = async () => {
  await page.waitForFunction(() => window.__saveTestApp?.account)
  await page.waitForFunction(() => window.__saveTestApp.engine)
}
try {
  const registered = await page.request.post('/api/auth/register', { data: { username: 'savebrowser', password: 'save-browser-123' } })
  assert.equal(registered.status(), 201)
  console.log('browser: loading signed-in app')
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 120000 })
  await ready()
  console.log('browser: signed-in app ready')

  // Exercise the separated data workflow against the disposable database,
  // including real downloads, restores and the ordinary-player view.
  const playerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: `http://127.0.0.1:${port}` })
  try {
    assert.equal((await playerContext.request.post('/api/auth/register', { data: { username: 'storageplayer', password: 'storage-player-123' } })).status(), 201)
    const playerPage = await playerContext.newPage()
    playerPage.on('pageerror', error => errors.push(error.message))
    const adminRequests = []
    playerPage.on('request', request => { if (request.url().includes('/api/admin/')) adminRequests.push(request.url()) })
    await playerPage.goto('/', { waitUntil: 'domcontentloaded' })
    await playerPage.waitForFunction(() => window.__saveTestApp?.account)
    await playerPage.getByRole('button', { name: '数据与存档', exact: true }).click()
    const playerStorage = playerPage.getByRole('dialog', { name: '数据与存档', exact: true })
    await playerStorage.getByText('备份与恢复', { exact: true }).waitFor()
    assert.equal(await playerStorage.getByRole('button', { name: /导出.*备份|恢复.*备份/ }).count(), 0)
    assert.ok((await playerStorage.innerText()).includes('请联系管理员'))
    assert.deepEqual(adminRequests, [], '普通玩家打开数据面板不请求管理员接口')
    assert.ok(await playerStorage.evaluate(el => el.scrollWidth <= el.clientWidth + 1))
    await playerPage.screenshot({ path: path.join(output, 'storage-player-mobile.png') })
    await playerStorage.locator('summary').click()
    await playerStorage.getByRole('button', { name: '迁移本机进度', exact: true }).click()
    await playerStorage.getByRole('button', { name: '取消', exact: true }).click()
    const migrated = playerPage.waitForResponse(response => response.url().endsWith('/api/profile/import'))
    await playerStorage.getByRole('button', { name: '迁移本机进度', exact: true }).click()
    await playerStorage.getByRole('button', { name: '确认迁移', exact: true }).click()
    assert.equal((await migrated).status(), 200, '旧档迁移在新数据面板中仍可完成')

    await page.getByTitle('游戏账号', { exact: true }).click()
    const accountDialog = page.getByRole('dialog', { name: '游戏账号', exact: true })
    assert.equal(await accountDialog.locator('details').count(), 0, '旧迁移与备份折叠入口已移出账号面板')
    await accountDialog.getByRole('button', { name: '账号管理', exact: true }).click()
    const adminDialog = page.getByRole('dialog', { name: '账号管理', exact: true })
    await adminDialog.getByText('@storageplayer', { exact: true }).waitFor()
    assert.equal(await adminDialog.getByRole('button', { name: /导出|恢复/ }).count(), 0, '账号管理不再承担备份与恢复')
    const playerRow = adminDialog.getByRole('row').filter({ hasText: '@storageplayer' })
    await playerRow.getByRole('button', { name: '停用', exact: true }).click()
    await adminDialog.getByRole('button', { name: '确认', exact: true }).click()
    await playerRow.getByRole('button', { name: '启用', exact: true }).waitFor()
    assert.equal((await (await playerContext.request.get('/api/auth/me')).json()).account, null)
    await playerRow.getByRole('button', { name: '启用', exact: true }).click()
    await playerRow.getByRole('button', { name: '停用', exact: true }).waitFor()
    await playerContext.request.post('/api/auth/login', { data: { username: 'storageplayer', password: 'storage-player-123' } })
    await adminDialog.getByRole('button', { name: '关闭账号管理', exact: true }).click()

    await page.getByRole('button', { name: '数据与存档', exact: true }).click()
    const storage = page.getByRole('dialog', { name: '数据与存档', exact: true })
    await storage.getByRole('button', { name: '导出账号备份', exact: true }).waitFor({ state: 'visible' })
    await page.waitForFunction(() => { const select = document.querySelector('.account-selector select'); return select && !select.disabled })
    assert.ok(await storage.getByLabel('选择账号').inputValue())
    const accountDownload = page.waitForEvent('download')
    await storage.getByRole('button', { name: '导出账号备份', exact: true }).click()
    const accountBackupPath = path.join(output, 'account-backup.json')
    await (await accountDownload).saveAs(accountBackupPath)
    const accountBackup = JSON.parse(await readFile(accountBackupPath, 'utf8'))
    assert.equal(accountBackup.kind, 'slime-rampage-backup')
    assert.equal(accountBackup.account.username, 'savebrowser')
    await storage.locator('input[type=file]').first().setInputFiles(accountBackupPath)
    await storage.getByRole('alert').filter({ hasText: '这不是整服备份文件' }).waitFor()
        const selfPicker = page.waitForEvent('filechooser')
    await storage.getByRole('button', { name: '恢复账号进度…', exact: true }).click()
    await (await selfPicker).setFiles(accountBackupPath)
    await storage.getByRole('button', { name: '确认覆盖并恢复', exact: true }).waitFor()
    await page.waitForFunction(() => document.activeElement?.textContent === '取消')
    await page.screenshot({ path: path.join(output, 'storage-confirm-desktop.png') })
    const restoredSelf = page.waitForResponse(response => response.url().includes('/import') && response.request().method() === 'POST')
    await storage.getByRole('button', { name: '确认覆盖并恢复', exact: true }).click()
    assert.equal((await restoredSelf).status(), 200)
    await page.waitForFunction(() => { const select = document.querySelector('.account-selector select'); return select && !select.disabled })

    const playerInfo = (await (await playerContext.request.get('/api/auth/me')).json()).account
    await storage.getByLabel('选择账号').selectOption(String(playerInfo.id))
    const playerDownload = page.waitForEvent('download')
    await storage.getByRole('button', { name: '导出账号备份', exact: true }).click()
    const playerBackupPath = path.join(output, 'player-backup.json')
    await (await playerDownload).saveAs(playerBackupPath)
    assert.equal((await playerContext.request.post('/api/account/import-campaign', { data: { campaign: { unlockedStage: 7 } } })).status(), 200)
    // Reopen to read the target's latest revision before restoring it.
    await storage.getByRole('button', { name: '关闭数据与存档', exact: true }).click()
    await page.getByRole('button', { name: '数据与存档', exact: true }).click()
    await page.waitForFunction(() => { const select = document.querySelector('.account-selector select'); return select && !select.disabled })
    await storage.getByLabel('选择账号').selectOption(String(playerInfo.id))
    const playerPicker = page.waitForEvent('filechooser')
    await storage.getByRole('button', { name: '恢复账号进度…', exact: true }).click()
    await (await playerPicker).setFiles(playerBackupPath)
    await storage.getByRole('heading', { name: '恢复 storageplayer 的进度', exact: true }).waitFor()
    await storage.getByRole('button', { name: '取消', exact: true }).click()
    assert.equal((await (await playerContext.request.get('/api/auth/me')).json()).accountData.campaign.unlockedStage, 7, '取消恢复保留现有进度')
    const confirmedPlayerPicker = page.waitForEvent('filechooser')
    await storage.getByRole('button', { name: '恢复账号进度…', exact: true }).click()
    await (await confirmedPlayerPicker).setFiles(playerBackupPath)
    const restoredPlayer = page.waitForResponse(response => response.url().includes(`/accounts/${playerInfo.id}/import`))
    await storage.getByRole('button', { name: '确认覆盖并恢复', exact: true }).click()
    assert.equal((await restoredPlayer).status(), 200)
    assert.equal((await (await playerContext.request.get('/api/auth/me')).json()).accountData.campaign.unlockedStage, 1)
    await page.waitForFunction(() => { const select = document.querySelector('.account-selector select'); return select && !select.disabled })
    await page.screenshot({ path: path.join(output, 'storage-admin-desktop.png') })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: path.join(output, 'storage-admin-mobile.png') })
    assert.ok(await storage.evaluate(el => el.scrollWidth <= el.clientWidth + 1))
    await storage.getByRole('button', { name: '关闭数据与存档', exact: true }).click()
    await storage.waitFor({ state: 'hidden' })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    assert.ok(await page.locator('.account-link b').evaluate(el => el.scrollWidth <= el.clientWidth + 1), '手机导航保留完整账号名')
    await page.screenshot({ path: path.join(output, 'storage-home-mobile.png') })
    await page.setViewportSize({ width: 1440, height: 960 })
    await page.getByRole('button', { name: '数据与存档', exact: true }).click()
    const serverDownload = page.waitForEvent('download')
    await storage.getByRole('button', { name: '导出整服备份', exact: true }).click()
    const serverBackupPath = path.join(output, 'server-backup.json')
    await (await serverDownload).saveAs(serverBackupPath)
    assert.equal(JSON.parse(await readFile(serverBackupPath, 'utf8')).kind, 'slime-rampage-server-backup')
    const serverPicker = page.waitForEvent('filechooser')
    await storage.getByRole('button', { name: '恢复整服备份…', exact: true }).click()
    await (await serverPicker).setFiles(serverBackupPath)
    const restoredServer = page.waitForResponse(response => response.url().endsWith('/api/admin/restore'))
    await storage.getByRole('button', { name: '确认覆盖并恢复', exact: true }).click()
    assert.equal((await restoredServer).status(), 200)
    const loginDialog = page.getByRole('dialog', { name: '游戏账号', exact: true })
    await loginDialog.getByPlaceholder('3-20 位文字、数字、_ 或 -').fill('savebrowser')
    await loginDialog.getByPlaceholder('至少 6 个字符').fill('save-browser-123')
    await loginDialog.getByRole('button', { name: '登录账号', exact: true }).click()
    await ready()
    console.log('✓ 数据与存档：独立入口、普通玩家权限、账号管理拆分、旧档迁移、真实导出/单账号与整服恢复、取消确认、重新登录与窄屏布局均通过')
  } finally { await playerContext.close() }

  const marketSeed = await page.request.post('/api/profile/import', {
    data: { slot: { data: { version: 6, drops: 50, records: {}, genes: { giant: 1, split: 1 } } } },
  })
  assert.equal(marketSeed.status(), 200)
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 })
  await ready()
  await page.locator('[data-playstyle="arena"]').click()
  await page.locator('[data-mode="expedition"]').click()
  await page.locator('.config-actions .primary-action').click()
  await page.locator('.deploy-btn').click()
  await page.waitForFunction(() => window.__saveTestApp.started)
  const originalTicket = await page.evaluate(async () => {
    const a = window.__saveTestApp
    const g = a.engine
    g.stop(); g._pauseLock = 0; g.elapsed = 88
    g._enterExpeditionStage(2)
    g.player.maxHp = 9; g.player.hp = 7; g.player.strainSkillCd = 2
    g.onCheckpoint(a.captureExpeditionCheckpoint(g))
    return a.runContext.ticketId
  })
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 })
  await ready()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('[data-playstyle="arena"]').click()
  await page.getByRole('button', { name: '地下城黑市', exact: true }).click()
  const market = page.getByRole('dialog', { name: '地下城黑市' })
  const resetButton = market.getByRole('button', { name: '重置加点' })
  await resetButton.click()
  const resetDialog = page.getByRole('dialog', { name: '重置黑市加点' })
  await resetDialog.getByText(/将返还 400 战力点/).waitFor()
  await resetDialog.getByText(/已下架的旧基因也会清除/).waitFor()
  await resetDialog.getByRole('button', { name: '取消', exact: true }).click()
  await page.waitForFunction(() => document.activeElement?.classList.contains('market-reset'))
  assert.equal(await market.locator('.market-wallet b').innerText(), '50')
  assert.ok(await market.evaluate(el => el.scrollWidth <= el.clientWidth + 1))
  await resetButton.click()
  const resetResponse = page.waitForResponse(response => response.url().endsWith('/api/profile/genes/reset'))
  await resetDialog.getByRole('button', { name: '确认重置' }).click()
  assert.equal((await resetResponse).status(), 200)
  await market.locator('.market-wallet').getByText('450', { exact: true }).waitFor()
  assert.equal(await resetButton.isDisabled(), true)
  await market.getByRole('button', { name: '返回', exact: true }).click()
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.getByRole('button', { name: '继续行动', exact: true }).click()
  await page.waitForFunction(() => window.__saveTestApp.started)
  const restored = await page.evaluate(() => {
    const a = window.__saveTestApp
    a.engine.stop()
    return { ticket: a.runContext.ticketId, stage: a.engine.expeditionStage, hp: a.engine.player.hp, maxHp: a.engine.player.maxHp, elapsed: a.engine.elapsed, genes: a.engine.genes }
  })
  assert.equal(restored.ticket, originalTicket)
  assert.equal(restored.stage, 2)
  assert.equal(restored.hp, 7)
  assert.equal(restored.maxHp, 9)
  assert.deepEqual(restored.genes, { giant: 1, split: 1 })
  assert.ok(restored.elapsed >= 88 && restored.elapsed < 90)
  console.log('✓ 黑市在窄屏支持取消、确认及刷新余额；重置后续玩保留原局基因和行动票据')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '保留续玩并返回', exact: true }).click()
  await page.getByRole('dialog', { name: '确认进度操作' }).getByRole('button', { name: '确认继续', exact: true }).click()
  await page.getByRole('button', { name: '继续行动', exact: true }).waitFor()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: path.join(output, 'resume-mobile.png') })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.evaluate(() => { window.__saveTestApp.onStartRunner('blitz') })
  await page.getByRole('button', { name: '保留当前进度', exact: true }).click()
  assert.equal(await page.evaluate(() => window.__saveTestApp.continuation.ticketId), originalTicket)
  await page.evaluate(() => { window.__saveTestApp.onStartRunner('blitz') })
  await page.getByRole('button', { name: '确认继续', exact: true }).click()
  await page.waitForFunction(() => window.__saveTestApp.activeGameplay === 'runner')
  await page.route('**/api/runs/*/finish', route => route.abort())
  await page.evaluate(() => {
    const a = window.__saveTestApp
    a.engine.gameplay._finish('defeat')
  })
  await page.waitForFunction(() => {
    const a = window.__saveTestApp
    return a.pendingSettlements.length === 1 && !a.syncing
  })
  const download = page.waitForEvent('download')
  await page.locator('.account-sync-bar').getByRole('button', { name: '导出', exact: true }).click()
  await (await download).saveAs(path.join(output, 'pending.json'))
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 })
  await ready()
  await page.waitForFunction(() => window.__saveTestApp.pendingSettlements.length === 1)
  await page.unroute('**/api/runs/*/finish')
  await page.locator('.account-sync-bar').getByRole('button', { name: '重试', exact: true }).click()
  await page.waitForFunction(() => window.__saveTestApp.pendingSettlements.length === 0)
  assert.equal(db.prepare('SELECT count(*) AS n FROM runs').get().n, 1)
  console.log('✓ Replacement confirmation, failed settlement export and reload/retry preserve exactly one reward')
  await page.evaluate(async () => { await window.__saveTestApp.onStartTowerDefenseStage(1) })
  await page.evaluate(async () => {
    const a = window.__saveTestApp
    const g = a.engine
    g.stop()
    g.gameplay.gold = 555
    g.gameplay.director.waveIndex = 0; g.gameplay.director.completedWaves = 1; g.gameplay.director.timer = 8
    a.persistRunCheckpoint(a.captureTowerCheckpoint(g))
  })
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 })
  await ready()
  await page.getByRole('button', { name: '继续行动', exact: true }).click()
  await page.waitForFunction(() => window.__saveTestApp.activeGameplay === 'tower-defense')
  assert.equal(await page.evaluate(() => { const g = window.__saveTestApp.engine; g.stop(); return g.gameplay.gold }), 555)
  await page.screenshot({ path: path.join(output, 'tower-resumed.png') })
  assert.deepEqual(errors, [])
  console.log('✓ Tower preparation resumes in the browser; desktop/mobile UI has no runtime errors or overflow')
} catch (error) {
  console.error('BROWSER FAILURE', error)
  console.error(JSON.stringify({ errors, body: (await page.locator('body').innerText()).slice(0, 1800) }))
  await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {})
  throw error
} finally {
  console.log('browser: closing fixtures')
  await browser.close()
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
  db.close()
  assert.ok(fixture.startsWith(path.resolve(tmpdir()) + path.sep))
  await rm(fixture, { recursive: true, force: true })
}
