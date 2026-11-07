import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { once } from 'node:events'
import { createServer as createNetServer } from 'node:net'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { createGameApp } from './server/app.mjs'
import { openDatabase } from './server/database.mjs'

// Real Vue UI + disposable in-memory accounts: never touches player saves.
const db = openDatabase(':memory:')
const server = createGameApp({ db, distDir: path.resolve('dist'), registration: true }).listen(0, '127.0.0.1')
await once(server, 'listening')
const reservation = createNetServer().listen(0, '127.0.0.1')
await once(reservation, 'listening')
const vitePort = reservation.address().port
await new Promise(resolve => reservation.close(resolve))
const vite = await createServer({ server: { host: '127.0.0.1', port: vitePort, strictPort: true, proxy: { '/api': `http://127.0.0.1:${server.address().port}` } } })
await vite.listen()
const output = path.resolve('.workbuddy/boss-tomes-browser')
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, baseURL: `http://127.0.0.1:${vite.httpServer.address().port}` })
const page = await context.newPage(); page.setDefaultTimeout(20000); const errors = [], screenshots = []
page.on('pageerror', e => errors.push(e.message))
const game = fn => page.evaluate(fn)
const shot = async name => {
  const file = path.join(output, `${name}.png`)
  await page.waitForTimeout(320) // Capture after the modal's entry transition.
  await page.screenshot({ path: file, animations: 'disabled' }); screenshots.push(file)
}
try {
  const registered = await page.request.post('/api/auth/register', { data: { username: `bt${Date.now().toString(36)}`, password: 'local-playtest-2026' } })
  assert.equal(registered.status(), 201, await registered.text())
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForLoadState('networkidle')
  const reconnect = page.getByRole('button', {name:'重新连接', exact:true})
  if (await reconnect.isVisible()) await reconnect.click()
  await page.waitForFunction(() => !document.querySelector('.auth-layer') || [...document.querySelectorAll('.auth-layer button')].some(button => button.textContent.trim() === '完成'))
  const done = page.getByRole('button', { name: '完成', exact: true })
  if (await done.isVisible()) await done.click()
  await page.locator('.auth-layer').waitFor({ state: 'hidden' })
  await page.locator('[data-playstyle="arena"]').click()
  await page.locator('[data-mode="expedition"]').click()
  await page.locator('[data-strain="ricochet"]').click()
  await page.locator('.config-actions .primary-action').click()
  await page.locator('.deploy-btn').click()
  await page.locator('.briefing-overlay').waitFor({ state: 'hidden' })
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__?._instance?.setupState?.engine)
  // page.evaluate forwards the explicit parameter, unlike the existing no-argument helper.
  const open = async strain => page.evaluate(async strain => {
    const g = document.querySelector('#app').__vue_app__._instance.setupState.engine
    g.stop(); g._pauseLock = 0; g._chapterSettlement = null
    g.applyStartingStrain(strain); g.reset(); g.stop()
    const { getExpeditionBoss } = await import('/src/game/RunRules.js')
    g.runState = 'expedition-guardian'
    const boss = g.enemyManager.beginExpeditionStageBoss(getExpeditionBoss(g._expeditionDefinition.bossId))
    boss.destroy(); g.weaponSystem._settleKill(boss)
    g._updateExpedition(.7)
  }, strain)
  await open('ricochet')
  await page.locator('.tome-options button').first().waitFor()
  assert.equal(await page.locator('.tome-options button').count(), 3)
  assert.equal(await page.locator('[data-icon-missing]').count(), 0)
  await shot('01-desktop-tomes')
  await page.waitForTimeout(220)
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter')
  await page.locator('.supply-options').waitFor()
  assert.equal(await game(() => document.querySelector('#app').__vue_app__._instance.setupState.engine._pauseLock), 1)
  await shot('02-desktop-supply')
  await page.waitForTimeout(220)
  await page.locator('.supply-options .tome').click()
  await page.locator('.levelup-overlay.embedded').waitFor()
  await shot('03-inline-study')
  await page.waitForTimeout(220)
  await page.keyboard.press('Digit1')
  await page.locator('.reward-overlay').waitFor({state:'hidden'})
  assert.equal(await game(() => document.querySelector('#app').__vue_app__._instance.setupState.engine.expeditionStage), 2)
  await open('summoner')
  await page.waitForTimeout(220)
  await page.locator('.tome-options button').first().click()
  await page.locator('.supply-options').waitFor()
  await game(() => {
    const g = document.querySelector('#app').__vue_app__._instance.setupState.engine
    g.player.maxHp = g.player.hp = 1; g._publishSettlement()
  })
  assert.equal(await page.locator('.supply-options .blood').isDisabled(), true)
  await page.setViewportSize({width:390,height:844})
  await shot('04-mobile-supply')
  await open('elemental')
  await page.locator('.tome-options').waitFor()
  await shot('05-mobile-tomes')
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
  const box = await page.locator('.reward-panel').boundingBox()
  assert.ok(box.x >= 0 && box.width <= 390)
  assert.equal(await page.locator('[data-icon-missing]').count(), 0)
  await page.locator('.tome-options button').last().scrollIntoViewIfNeeded()
  await page.waitForTimeout(220)
  await page.locator('.tome-options button').last().click()
  await page.locator('.supply-options').waitFor()
  assert.deepEqual(errors, [])
  console.log('BOSS秘典浏览器验证通过：桌面、窄屏、键盘、内嵌研习、禁选与换章。')
  console.log(JSON.stringify(screenshots))
} catch (error) {
  await page.screenshot({path:path.join(output,'failure.png')})
  console.error(JSON.stringify({errors, body:(await page.locator('body').innerText()).slice(0,1800)}))
  throw error
} finally {
  await browser.close(); await vite.close(); await new Promise(resolve=>server.close(resolve)); db.close()
}
