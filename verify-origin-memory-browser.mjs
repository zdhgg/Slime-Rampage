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
const output = path.resolve('.workbuddy/origin-memory-browser')
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, baseURL: `http://127.0.0.1:${vite.httpServer.address().port}` })
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

  // 真实击杀章节首领：走 handleBossDefeated → 章间结算 → 现有首领奖励面板
  const killChapterBoss = () => game(async () => {
    const g = document.querySelector('#app').__vue_app__._instance.setupState.engine
    window.playtestGame = g
    g.stop(); g._pauseLock = 0; g._chapterSettlement = null
    const { getExpeditionBoss } = await import('/src/game/RunRules.js')
    g.runState = 'expedition-guardian'
    const boss = g.enemyManager.beginExpeditionStageBoss(getExpeditionBoss(g._expeditionDefinition.bossId))
    window.__bossType = boss.type
    boss.destroy(); g.weaponSystem._settleKill(boss)
    g._updateExpedition(0.7)
  })
  await killChapterBoss()
  await page.locator('.tome-options button').first().waitFor()

  const bossType = await game(() => window.__bossType)
  assert.equal(bossType, 'boss-knight', '第一章首领复用骑士类型')
  assert.equal(await page.locator('.tome-options button').count(), 3, '仍是三选一')
  const memoryCard = page.locator('.tome-options button.is-memory')
  assert.equal(await memoryCard.count(), 1, '首领奖励里必出源质记忆卡')
  const cardText = await memoryCard.innerText()
  assert.match(cardText, /源质记忆/)
  assert.match(cardText, /骑士王源质·破阵凝胶波/)
  assert.match(cardText, /超载时自动释放/)
  assert.equal(await page.locator('[data-icon-missing]').count(), 0, '源质卡有已注册的矢量图标')
  await shot('01-boss-reward-memory-desktop')

  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await game(() => document.documentElement.scrollWidth <= innerWidth + 1), '窄屏无横向溢出')
  await shot('02-boss-reward-memory-mobile')
  await page.setViewportSize({ width: 1440, height: 960 })

  await memoryCard.click()
  await page.locator('.supply-options').waitFor()
  assert.equal(await game(() => playtestGame.originSourceMemories.length), 1, '记忆写入局内状态')
  assert.deepEqual(await game(() => playtestGame.originSourceMemories), [{ id: 'knight_breach', level: 1 }])
  assert.equal(await game(() => playtestGame.configureOriginCombo(['knight_breach', 'primal_orbit'], 'knight_breach')), true)

  // 完成章间整备 → 进入下一章，HUD 常驻显示源质记忆槽
  await page.locator('.supply-options .rest').click()
  await page.locator('.hud-memory').waitFor()
  const hudText = await page.locator('.hud-memory').innerText()
  assert.match(hudText, /破阵凝胶波/)
  assert.match(hudText, /Lv\.1/)
  assert.match(hudText, /主技能：\s*破阵凝胶波/)
  assert.equal(await page.locator('.memory-slot').count(), 1)
  assert.equal(await page.locator('.memory-slot.next').count(), 1, '当前轮换位高亮')
  await shot('03-hud-memory-desktop')

  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await game(() => document.documentElement.scrollWidth <= innerWidth + 1), '窄屏 HUD 无横向溢出')
  const box = await page.locator('.hud-memory').boundingBox()
  assert.ok(box && box.width > 0 && box.height > 0, '窄屏下源质记忆区域可见')
  await shot('04-hud-memory-mobile')
  await page.setViewportSize({ width: 1440, height: 960 })

  // 被动超载：能量满格 + 有目标 → 控制器自动支付并释放（无需按空格）
  await game(() => {
    const g = window.playtestGame
    g._pauseLock = 0
    g.runState = 'active' // 换章演出结束后的正常战斗态：实体（含武器系统）每帧更新
    g.enemyManager._enemies = []
    g.enemyManager._spawnTimer = Infinity
    for (let i = 0; i < 3; i++) g.enemyManager.spawnAt(g.player.x + 130 + i * 34, g.player.y, 'knight')
    g.weaponSystem.originOverload.reset()
    g.player.overloadState.lastPaidAt = -Infinity
    g.player.overloadState.active = false
    g.player.originEnergy = 40
    g.start()
  })
  await page.waitForTimeout(900) // 重试/启动 0.25s + 校验
  assert.equal(await game(() => playtestGame.player.overloadState.active), true, '被动超载自动支付')
  const cast = await game(() => playtestGame.originSourceLastCast)
  assert.ok(cast, '被动超载自动释放了源质技能')
  assert.equal(cast.id, 'knight_breach')
  assert.equal(await game(() => playtestGame.weaponSystem.originSourceCombat.waves.length >= 0), true)

  // 释放瞬间 HUD 高亮当前技能（1.4 秒高亮窗口内推一次快照）
  const age = await game(() => {
    const g = playtestGame
    g._pushStats()
    return g.elapsed - (g.originSourceLastCast?.at || 0)
  })
  assert.ok(age < 1.4, `高亮窗口内（${age.toFixed(2)}s）`)
  await page.locator('.memory-slot.casting').first().waitFor({ timeout: 1200 })
  assert.match(await page.locator('.hud-memory').innerText(), /破阵凝胶波/)
  await shot('05-overload-memory-cast')

  // 暂停 / 恢复 / 结算
  await game(() => { const g = playtestGame; g.pause(); g.resume() })
  await page.waitForTimeout(120)
  assert.equal(await game(() => playtestGame.runFinished), false)
  await game(() => playtestGame.finishRun('defeat'))
  await page.waitForTimeout(400)
  assert.equal(await game(() => playtestGame.runFinished), true)

  assert.deepEqual(errors, [], `页面运行期无异常：${errors.join(' | ')}`)
  console.log(`✓ 源质记忆浏览器验收通过：${screenshots.length} 张截图`)
  for (const file of screenshots) console.log(`  - ${path.relative(process.cwd(), file)}`)
} finally {
  await context.close()
  await browser.close()
  await vite.close()
  server.close()
}
