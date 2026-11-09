// 主战场点地移动 · 真实浏览器验收（触屏模拟）：内存账号 + Vite 开发服务 + 本机 Edge。
// 验证：touch-action、真实 touch tap → 生成世界坐标落点、朝落点移动、到点收脚、
//       键盘接管、Esc 清理、HUD 暂停键不误触发；截图保存在 .workbuddy/tap-move-browser/。
// 运行：node verify-tap-move-browser.mjs（依赖本机 Edge，故不进入 npm test 长链路）
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
const output = path.resolve('.workbuddy/tap-move-browser')
await fs.mkdir(output, { recursive: true })

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
})
// 390×844 手机视口：鼠标点击走 pointerType=mouse → 点地移动通道（触屏摇杆另见 verify-virtual-stick-browser）
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

const gameState = () => page.evaluate(() => {
  const g = document.querySelector('#app').__vue_app__._instance.setupState.engine
  return {
    x: g.player.x,
    y: g.player.y,
    camX: g.camera.x,
    camY: g.camera.y,
    target: g.input.moveTarget ? { x: g.input.moveTarget.x, y: g.input.moveTarget.y } : null,
    runState: g.runState,
    running: g.running,
  }
})

// 玩家在视口中的位置（点击点必须围绕它取，直接写死坐标会因容器/视口滚动而变化）
const playerScreen = () => page.evaluate(() => {
  const g = document.querySelector('#app').__vue_app__._instance.setupState.engine
  const rect = g.canvas.getBoundingClientRect()
  return {
    x: g.player.x - g.camera.x + rect.left,
    y: g.player.y - g.camera.y + rect.top,
    playerX: g.player.x,
    playerY: g.player.y,
    vw: window.innerWidth,
    vh: window.innerHeight,
  }
})

const probe = () => page.evaluate(() => {
  const g = document.querySelector('#app')?.__vue_app__?._instance?.setupState?.engine
  return {
    hasEngine: !!g,
    running: g?.running ?? null,
    runState: g?.runState ?? null,
    elapsed: g?.elapsed ?? null,
    pauseLock: g?._pauseLock ?? null,
    dead: g?.player?.dead ?? null,
    dialogs: [...document.querySelectorAll('[role="dialog"]')].map(d => d.getAttribute('aria-label') || d.className),
  }
})

try {
  const registered = await page.request.post('/api/auth/register', {
    data: { username: `tap${Date.now().toString(36)}`, password: 'local-playtest-2026' },
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

  // 限时讨伐对新账号锁定，用远征第一章进入主战场（同一套 Arena 规则与输入）
  await page.locator('[data-playstyle="arena"]').click()
  await page.locator('[data-mode="expedition"]').click()
  await page.locator('[data-strain="origin"]').click()
  await page.locator('.config-actions .primary-action').click()
  await page.locator('.deploy-btn').click()
  await page.locator('.briefing-overlay').waitFor({ state: 'hidden' })

  // 引擎一挂载就冻结干扰项：无敌、封顶经验、关刷怪（此时可能还在章节开场演出里）
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
    g.expeditionIntroTime = 999 // 跳过章节开场演出，直接进入可控状态
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

  // 记录真实指针事件与 InputManager 收到的目标，断言失败时可直接看到差在哪
  await page.evaluate(() => {
    const g = document.querySelector('#app').__vue_app__._instance.setupState.engine
    window.__tapLog = { downs: [], sets: [] }
    window.addEventListener('pointerdown', (event) => {
      window.__tapLog.downs.push({ tag: event.target?.tagName, type: event.pointerType, x: event.clientX, y: event.clientY })
    }, true)
    const set = g.input.setMoveTarget.bind(g.input)
    g.input.setMoveTarget = (x, y) => { window.__tapLog.sets.push({ x, y }); set(x, y) }
  })
  const readTapLog = () => page.evaluate(() => window.__tapLog)

  const touchAction = await page.locator('canvas.game-canvas').evaluate(el => getComputedStyle(el).touchAction)
  assert.equal(touchAction, 'none', `canvas touch-action 应为 none，实际 ${touchAction}`)
  await page.waitForTimeout(300)

  // 点按一个「离玩家足够远」的位置：坐标由玩家实时屏幕位置偏移得到，避开 HUD 与滚动误差
  const tapAway = async (offsets) => {
    for (const [dx, dy] of offsets) {
      const screen = await playerScreen()
      const x = Math.round(Math.min(Math.max(12, screen.x + dx), screen.vw - 12))
      const y = Math.round(Math.min(Math.max(40, screen.y + dy), screen.vh - 40))
      const onCanvas = await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.tagName === 'CANVAS', [x, y])
      if (!onCanvas) continue
      await page.mouse.click(x, y)
      await page.waitForTimeout(110)
      const now = await gameState()
      if (!now.target) continue
      if (Math.hypot(now.target.x - screen.playerX, now.target.y - screen.playerY) < 40) continue // 点在史莱姆身上不算
      return { target: now.target, player: { x: screen.playerX, y: screen.playerY }, point: { x, y } }
    }
    return null
  }

  // —— 1. 鼠标点击 → 生成落点 → 朝落点移动 → 到达收脚 ——
  const tap = await tapAway([[-120, -90], [120, 90], [-150, 60], [110, -110], [-90, 150]])
  assert.ok(tap, `连续点击都没有生成有效落点：${JSON.stringify(await readTapLog())}`)
  assert.ok(Math.hypot(tap.target.x - tap.player.x, tap.target.y - tap.player.y) > 40, '落点离玩家过近')
  await page.screenshot({ path: path.join(output, '1-tap-marker.png') })

  let arrived = null
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(100)
    const now = await gameState()
    if (!now.target) { arrived = now; break }
  }
  assert.ok(arrived, `史莱姆没有在 3 秒内到达落点（事件：${JSON.stringify(await readTapLog())}）`)
  assert.ok(Math.hypot(arrived.x - tap.target.x, arrived.y - tap.target.y) < 2,
    `未停在落点：(${arrived.x.toFixed(1)}, ${arrived.y.toFixed(1)}) vs (${tap.target.x.toFixed(1)}, ${tap.target.y.toFixed(1)})`)
  assert.ok(Math.hypot(arrived.x - tap.player.x, arrived.y - tap.player.y) > 40, '史莱姆没有实际移动')
  assert.ok(Math.sign(arrived.x - tap.player.x) === Math.sign(tap.target.x - tap.player.x) &&
    Math.sign(arrived.y - tap.player.y) === Math.sign(tap.target.y - tap.player.y), '移动方向与落点不一致')
  await page.screenshot({ path: path.join(output, '2-arrived.png') })

  // —— 2. 键盘接管：按方向键立即清空落点，且之后不会自己走回去 ——
  const tap2 = await tapAway([[120, 90], [-120, -90], [140, -60]])
  assert.ok(tap2, `第二次点击没有生成目标：${JSON.stringify(await readTapLog())}`)
  const beforeKey = await gameState()
  await page.keyboard.down('ArrowLeft')
  await page.waitForTimeout(240)
  await page.keyboard.up('ArrowLeft')
  const afterKey = await gameState()
  assert.equal(afterKey.target, null, '方向键没有清除点地目标')
  assert.ok(afterKey.x < beforeKey.x, '方向键移动未生效')
  await page.waitForTimeout(300)
  const settled = await gameState()
  assert.equal(settled.target, null, '松手后点地目标复活')
  assert.ok(Math.abs(settled.x - afterKey.x) < 2, '松手后仍在自动移动')

  // —— 3. 暂停清理落点：Esc 后目标不残留，恢复后不会自己走 ——
  const tap3 = await tapAway([[-130, -80], [130, 80]])
  assert.ok(tap3, '暂停前未能生成目标')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(180)
  assert.equal((await gameState()).target, null, '暂停后仍残留点地目标')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(420)
  const resumed = await gameState()
  assert.ok(resumed.running, 'Esc 未能恢复游戏')
  assert.equal(resumed.target, null, '恢复后点地目标残留')

  // —— 4. HUD 按钮（暂停键）不触发点地移动 ——
  const pauseBefore = await gameState()
  await page.locator('button[aria-label="暂停"]').click()
  await page.locator('.pause-overlay').waitFor()
  await page.waitForTimeout(160)
  assert.equal((await gameState()).target, null, '点击暂停按钮误生成了点地目标')
  // 暂停面板遮住 HUD，恢复要点面板内按钮（HUD 的暂停键在遮罩下不可点）
  await page.locator('.pause-overlay button', { hasText: '继续游戏' }).click()
  await page.locator('.pause-overlay').waitFor({ state: 'hidden' })
  await page.waitForTimeout(320)
  const pauseAfter = await gameState()
  assert.ok(pauseAfter.running, '暂停面板未能恢复游戏')
  assert.ok(Math.hypot(pauseAfter.x - pauseBefore.x, pauseAfter.y - pauseBefore.y) < 2, '暂停/恢复期间角色位置漂移')

  assert.deepEqual(errors, [], `页面异常：${errors.join(' | ')}`)
  await page.screenshot({ path: path.join(output, '3-final.png') })
  console.log('✓ 鼠标点地移动：canvas touch-action=none，真实点击生成落点并自动走到落点')
  console.log('✓ 键盘接管、Esc 清理、暂停按钮不误触发，全部通过')
  console.log(`截图：${output}`)
} finally {
  await browser.close()
  await vite.close()
  await new Promise(resolve => server.close(resolve))
  db.close()
}
