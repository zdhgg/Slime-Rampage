import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { once } from 'node:events'
import { createServer as createNetServer } from 'node:net'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { createGameApp } from './server/app.mjs'
import { openDatabase } from './server/database.mjs'

/**
 * 源质记忆的浏览器验收：真实 Vue 界面 + 内存态账号 + 一次真实的「首领击杀 → 奖励面板 → 超载释放」流程。
 * 只用于人工/本地验收，不进入 `npm test` 长链路（依赖本机 Edge）。
 */
const db = openDatabase(':memory:')
const server = createGameApp({ db, distDir: path.resolve('dist'), registration: true }).listen(0, '127.0.0.1')
await once(server, 'listening')
const reservation = createNetServer().listen(0, '127.0.0.1')
await once(reservation, 'listening')
const vitePort = reservation.address().port
await new Promise(resolve => reservation.close(resolve))
const vite = await createServer({ server: { host: '127.0.0.1', port: vitePort, strictPort: true, proxy: { '/api': `http://127.0.0.1:${server.address().port}` } } })
await vite.listen()
const output = path.resolve('.workbuddy/origin-combo-browser')
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, hasTouch: true, baseURL: `http://127.0.0.1:${vite.httpServer.address().port}` })
const page = await context.newPage()
page.setDefaultTimeout(20000)
const errors = []
const screenshots = []
page.on('pageerror', error => errors.push(error.message))
const game = fn => page.evaluate(fn)
const shot = async (name) => {
  const file = path.join(output, `${name}.png`)
  await page.waitForTimeout(320)
  await page.screenshot({ path: file, animations: 'disabled' })
  screenshots.push(file)
}

try {
  const registered = await page.request.post('/api/auth/register', { data: { username: `om${Date.now().toString(36)}`, password: 'local-playtest-2026' } })
  assert.equal(registered.status(), 201, await registered.text())
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForLoadState('networkidle')
  const reconnect = page.getByRole('button', { name: '重新连接', exact: true })
  if (await reconnect.isVisible()) await reconnect.click()
  await page.waitForFunction(() => !document.querySelector('.auth-layer') || [...document.querySelectorAll('.auth-layer button')].some(button => button.textContent.trim() === '完成'))
  const done = page.getByRole('button', { name: '完成', exact: true })
  if (await done.isVisible()) await done.click()
  await page.locator('.auth-layer').waitFor({ state: 'hidden' })
  await page.locator('[data-playstyle="arena"]').click()
  await page.locator('[data-mode="expedition"]').click()
  await page.locator('[data-strain="origin"]').click()
  await page.locator('.config-actions .primary-action').click()
  await page.locator('.deploy-btn').click()
  await page.locator('.briefing-overlay').waitFor({ state: 'hidden' })
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__?._instance?.setupState?.engine)

  await game(async () => {
    const g = document.querySelector('#app').__vue_app__._instance.setupState.engine
    window.playtestGame = g
    g.stop(); g._pauseLock = 0
    const { learnOriginMemory } = await import('/src/game/OriginSourceSkills.js')
    const { rollSkills } = await import('/src/game/SkillPool.js')
    g.skillLevels.origin_discovery = 1
    learnOriginMemory(g, 'knight_breach'); learnOriginMemory(g, 'mage_collapse'); learnOriginMemory(g, 'archer_hunt')
    g.player.elements.set('water', 1); g.player.elements.set('lightning', 1)
    g.player._refreshElements() // 排名派生：主反应 = 水雷「雷涌凝胶」，注入自动跟排名
    g.pause(); g._pushStats(); g.onLevelUp(rollSkills(g, 3))
  })
  await page.locator('.origin-loadout summary').click()
  await page.locator('.origin-loadout select').nth(0).selectOption('native_wave')
  assert.equal(await game(() => playtestGame.originCombo.main), 'native_wave')
  // 注入与连招为只读展示：主注入 = 水流（第 1 名）、协同 = 雷电（第 2 名）、连招 = 雷涌凝胶
  const injectText = await page.locator('.origin-loadout .inject-line').first().innerText()
  assert.ok(injectText.includes('水流') && injectText.includes('雷电'), injectText)
  const comboText = await page.locator('.origin-loadout .inject-line').nth(1).innerText()
  assert.ok(comboText.includes('雷涌凝胶'), comboText)
  assert.equal(await game(() => playtestGame.player.originOverloadElement), 'water')
  assert.equal(await game(() => playtestGame.player._primaryReaction), 'gel')
  await shot('01-config-desktop')
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await game(() => document.documentElement.scrollWidth <= innerWidth + 1))
  const box = await page.locator('.origin-loadout').boundingBox()
  assert.ok(box && box.x >= 0 && box.x + box.width <= 391)
  await shot('02-config-mobile')
  await page.locator('.origin-loadout summary').tap()
  await page.locator('.levelup-panel .skill-card').first().tap()
  await page.locator('.levelup-overlay').waitFor({ state: 'hidden' })
  await game(() => {
    const g = playtestGame
    g.stop(); g._pauseLock = 0
    g.player.invincible = 1e9
    const core = g.gemManager.spawn(g.player.x, g.player.y, 0, 'fire', { coreChoices: ['fire', 'poison'] })
    core.state = 'magnet'
    g.gemManager.update(0.02)
  })
  await page.getByRole('heading', { name: '首领元素核心' }).waitFor()
  await shot('03-boss-core-choice-mobile')
  await page.locator('.fusion-eat').filter({ hasText: '毒素' }).tap()
  await page.getByRole('heading', { name: '首领元素核心' }).waitFor({ state: 'hidden' })
  assert.equal(await game(() => playtestGame.player.elements.get('poison')), 1)
  assert.equal(await game(() => playtestGame.player.elements.has('fire')), false)
  assert.equal(await game(() => playtestGame._originCoreChoice), null)
  assert.deepEqual(errors, [])
  console.log(`超载配置与首领核心浏览器验收通过：${screenshots.length} 张截图`)
} finally {
  await context.close()
  await browser.close()
  await vite.close()
  server.close()
}

