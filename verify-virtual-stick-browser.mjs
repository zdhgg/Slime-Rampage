// 主战场虚拟摇杆 · 真实浏览器验收（触屏模拟）：内存账号 + Vite 开发服务 + 本机 Edge。
// 用 CDP 派发真实 touchStart/touchMove/touchEnd，验证左半屏摇杆驱动移动、松手停住、
// 触屏点按不再产生点地目标，以及触屏提示文案。截图保存在 .workbuddy/virtual-stick-browser/。
// 运行：node verify-virtual-stick-browser.mjs（依赖本机 Edge，故不进入 npm test 长链路）
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { once } from 'node:events'
import { createServer as createNetServer } from 'node:net'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { createGameApp } from './server/app.mjs'
import { openDatabase } from './server/database.mjs'

const db = openDatabase(':memory:')
const server = createGameApp({ db, distDir: path.resolve('dist'), registration: true }).listen(0, '127.0.0.1')
await once(server, 'listening')
const reservation = createNetServer().listen(0, '127.0.0.1')
await once(reservation, 'listening')
const vitePort = reservation.address().port
await new Promise(resolve => reservation.close(resolve))
const vite = await createServer({
  server: { host: '127.0.0.1', port: vitePort, strictPort: true, proxy: { '/api': `http://127.0.0.1:${server.address().port}` } },
})
await vite.listen()
const baseURL = `http://127.0.0.1:${vite.httpServer.address().port}`
const output = path.resolve('.workbuddy/virtual-stick-browser')
await fs.mkdir(output, { recursive: true })

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
})
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  baseURL,
})
const page = await context.newPage()
page.setDefaultTimeout(30000)
const errors = []
page.on('pageerror', error => errors.push(error.message))
const cdp = await context.newCDPSession(page)

const touch = (type, x, y, id = 1) => cdp.send('Input.dispatchTouchEvent', {
  type,
  touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y, id, radiusX: 12, radiusY: 12, force: 1 }],
})
const touchEnd = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

const gameState = () => page.evaluate(() => {
  const g = document.querySelector('#app').__vue_app__._instance.setupState.engine
  return {
    x: g.player.x,
    y: g.player.y,
    target: g.input.moveTarget ? { x: g.input.moveTarget.x, y: g.input.moveTarget.y } : null,
    stick: { x: g.input.stickVector.x, y: g.input.stickVector.y },
    engaged: g.virtualStick.engaged,
    stickPointer: g._stickPointer,
    alpha: g.virtualStick.alpha,
    running: g.running,
    runState: g.runState,
  }
})

const probe = () => page.evaluate(() => {
  const g = document.querySelector('#app')?.__vue_app__?._instance?.setupState?.engine
  return {
    hasEngine: !!g,
    running: g?.running ?? null,
    runState: g?.runState ?? null,
    dead: g?.player?.dead ?? null,
    pauseLock: g?._pauseLock ?? null,
    dialogs: [...document.querySelectorAll('[role="dialog"]')].map(d => d.getAttribute('aria-label') || d.className),
  }
})

try {
  const registered = await page.request.post('/api/auth/register', {
    data: { username: `stick${Date.now().toString(36)}`, password: 'local-playtest-2026' },
  })
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

  let mounted = false
  let lastProbe = null
  for (let i = 0; i < 100; i++) {
    lastProbe = await probe()
    if (lastProbe.hasEngine) { mounted = true; break }
    await page.waitForTimeout(100)
  }
  assert.ok(mounted, `引擎未挂载：${JSON.stringify(lastProbe)}`)
  await page.evaluate(() => {
    const g = document.querySelector('#app').__vue_app__._instance.setupState.engine
    g.player.invincible = 1e9
    g.player.maxExp = 1e9
    g.player.exp = 0
    g.player.maxHp = 999
    g.player.hp = 999
    g.enemyManager.spawn = () => {}
    g.expeditionIntroTime = 999
  })

  let ready = false
  for (let i = 0; i < 60; i++) {
    lastProbe = await probe()
    if (lastProbe.hasEngine && lastProbe.running && lastProbe.runState !== 'expedition-intro' && !lastProbe.dead) {
      ready = true
      break
    }
    // 冻结前抢开的升级面板会把主循环锁在暂停态：点一张卡继续（只影响测试节奏）
    const card = page.locator('.levelup-overlay .levelup-cards button').first()
    if (await card.count()) await card.click({ force: true }).catch(() => {})
    await page.waitForTimeout(200)
  }
  if (!ready) {
    await page.screenshot({ path: path.join(output, '0-not-ready.png') })
    assert.fail(`游戏未进入可操作状态：${JSON.stringify(lastProbe)}`)
  }
  await page.waitForTimeout(300)

  // 触屏布局：技能键让到右下，左下整块留给摇杆拇指区
  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches)
  assert.equal(coarse, true, '触屏模拟未命中 (pointer: coarse)')
  const skillBox = await page.locator('.hud-action').boundingBox()
  assert.ok(skillBox && skillBox.x > 195, `技能键未移到右下：${JSON.stringify(skillBox)}`)
  assert.equal(await page.evaluate(() => document.elementFromPoint(110, 770)?.tagName), 'CANVAS',
    '左下拇指区被 HUD 元素占用')

  // —— 1. 左半屏按住拖动：摇杆接管，角色随方向移动，松手立即停住 ——
  const before = await gameState()
  const startX = 140
  const startY = 600
  assert.equal(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, [startX, startY]), 'CANVAS')
  await touch('touchStart', startX, startY)
  await page.waitForTimeout(80)
  const engaged = await gameState()
  assert.equal(engaged.engaged, true, 'touchStart 没有接管摇杆')
  assert.equal(typeof engaged.stickPointer, 'number', '摇杆 pointerId 未记录')

  // 向左上拖：推力拉满，角色应向左上走，且不再产生点地目标
  await touch('touchMove', startX - 60, startY - 60)
  await page.waitForTimeout(120)
  const dragging = await gameState()
  assert.ok(dragging.stick.x < -0.6 && dragging.stick.y < -0.6, `摇杆推力方向错误：${JSON.stringify(dragging.stick)}`)
  assert.equal(dragging.target, null, '触屏拖动不应再生成点地目标')
  assert.ok(dragging.alpha > 0.9, '拖动中摇杆应保持显示')
  await page.screenshot({ path: path.join(output, '1-dragging.png') })

  await page.waitForTimeout(500)
  const moved = await gameState()
  assert.ok(moved.x < before.x - 40 && moved.y < before.y - 40,
    `角色未随摇杆移动：(${moved.x.toFixed(0)}, ${moved.y.toFixed(0)}) vs (${before.x.toFixed(0)}, ${before.y.toFixed(0)})`)
  await page.screenshot({ path: path.join(output, '2-moved.png') })

  await touchEnd()
  await page.waitForTimeout(120)
  const released = await gameState()
  assert.equal(released.engaged, false, 'touchEnd 后仍处于拖动状态')
  assert.equal(released.stick.x, 0)
  assert.equal(released.stick.y, 0)
  assert.equal(released.stickPointer, null, 'pointerId 未释放')
  const stopX = released.x
  const stopY = released.y
  await page.waitForTimeout(400)
  const settled = await gameState()
  assert.ok(Math.hypot(settled.x - stopX, settled.y - stopY) < 2,
    `松手后仍在移动：(${settled.x.toFixed(1)}, ${settled.y.toFixed(1)}) vs (${stopX.toFixed(1)}, ${stopY.toFixed(1)})`)

  // —— 2. 触屏点按不再让史莱姆自己跑；键盘仍可接管 ——
  const tapBefore = await gameState()
  await page.touchscreen.tap(300, 420)
  await page.waitForTimeout(350)
  const tapAfter = await gameState()
  assert.equal(tapAfter.target, null, '触屏点按生成了点地目标')
  assert.ok(Math.hypot(tapAfter.x - tapBefore.x, tapAfter.y - tapBefore.y) < 2, '触屏点按导致角色移动')

  // 无头环境下键盘焦点偶发丢失：最多重试 3 次（真实键盘输入已在鼠标点地验收里覆盖）
  let afterKey = await gameState()
  for (let attempt = 0; attempt < 3 && afterKey.x > tapAfter.x - 20; attempt++) {
    await page.keyboard.down('ArrowLeft')
    await page.waitForTimeout(300)
    await page.keyboard.up('ArrowLeft')
    await page.waitForTimeout(60)
    afterKey = await gameState()
  }
  assert.ok(afterKey.x < tapAfter.x - 20, '键盘未能接管移动')

  assert.deepEqual(errors, [], `页面异常：${errors.join(' | ')}`)
  await page.screenshot({ path: path.join(output, '3-final.png') })
  console.log('✓ 触屏虚拟摇杆：左半屏拖动驱动移动，推满推力→松手停住，指针状态干净')
  console.log('✓ 触屏点按不再触发点地移动，键盘仍可接管；技能键让到右下、左下拇指区无遮挡')
  console.log(`截图：${output}`)
} finally {
  await browser.close()
  await vite.close()
  await new Promise(resolve => server.close(resolve))
  db.close()
}
