// 主战场点地移动（tap-to-move）验证：无头引擎 + DOM/Canvas 桩。
// 覆盖：落点生成与到达、键盘接管、高速贴点不抖动、障碍卡住自动放弃、
//       暂停/非 Arena 忽略、决斗圈收束、落点标记进入渲染层。
// 运行：node verify-tap-move.mjs
import assert from 'node:assert/strict'

// —— 浏览器环境桩（记录 translate / arc，验证落点标记真的被绘制） ——
const frame = { translates: [], arcs: [] }
const gradient = { addColorStop() {} }
const ctx2d = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => gradient
      if (prop === 'translate') return (x, y) => frame.translates.push([x, y])
      if (prop === 'arc') return (x, y, r) => frame.arcs.push([x, y, r])
      return () => {}
    },
    set() {
      return true
    },
  }
)
const canvasListeners = new Map()
const canvasStub = {
  width: 0,
  height: 0,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
  getContext: () => ctx2d,
  addEventListener: (type, fn) => {
    if (!canvasListeners.has(type)) canvasListeners.set(type, new Set())
    canvasListeners.get(type).add(fn)
  },
  removeEventListener: (type, fn) => canvasListeners.get(type)?.delete(fn),
}
globalThis.window = { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 }
globalThis.document = {
  createElement: () => canvasStub,
  addEventListener() {},
  removeEventListener() {},
  hidden: false,
}
globalThis.requestAnimationFrame = () => 0
globalThis.cancelAnimationFrame = () => {}

const { GameEngine } = await import('./src/game/GameEngine.js')

const engine = GameEngine.create(canvasStub)
engine.onStats = () => {}
engine.onLevelUp = () => {}
engine.onGameOver = () => {}
engine.onBossSpawn = () => {}
engine.onWaveChanged = () => {}
engine.onEvolution = () => {}

function tap(clientX, clientY, extra = {}) {
  const handlers = [...(canvasListeners.get('pointerdown') || [])]
  assert.ok(handlers.length > 0, '画布未注册 pointerdown 监听')
  for (const handler of handlers) handler({ clientX, clientY, button: 0, ...extra })
}

function key(code, type = 'down') {
  const e = { code, repeat: false, defaultPrevented: false, target: null, preventDefault() {} }
  if (type === 'down') engine.input._onKeyDown(e)
  else engine.input._onKeyUp(e)
}

function freshRun() {
  engine.reset()
  engine.start()
  engine.update(1 / 60)
  engine.update(1 / 60)
  const p = engine.player
  p.invincible = 1e6
  p.hp = p.maxHp = 999
  engine.mapFeatures.barricades.length = 0 // 只验证输入→移动，排除随机拒马挡路
  return p
}

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps
const hasTranslate = (x, y, eps = 0.5) => frame.translates.some(([tx, ty]) => near(tx, x, eps) && near(ty, y, eps))

// —— 1. 点击画布生成世界坐标目标，史莱姆走到落点后自动清除 ——
{
  const p = freshRun()
  const camX = engine.camera.x
  const camY = engine.camera.y
  const startX = p.x
  const startY = p.y
  tap(900, 460)
  const target = engine.input.moveTarget
  assert.ok(target, '点击后没有生成移动目标')
  assert.ok(near(target.x, camX + 900, 0.01), `目标 X 换算错误：${target.x} != ${camX + 900}`)
  assert.ok(near(target.y, camY + 460, 0.01), `目标 Y 换算错误：${target.y} != ${camY + 460}`)

  let frames = 0
  while (engine.input.moveTarget && frames < 240) {
    engine.update(1 / 60)
    frames++
  }
  assert.equal(engine.input.moveTarget, null, '到达后目标未清除')
  assert.ok(frames > 5 && frames < 240, `移动耗时异常：${frames} 帧`)
  assert.ok(Math.hypot(p.x - target.x, p.y - target.y) < 0.01, `未停在落点：(${p.x}, ${p.y}) vs (${target.x}, ${target.y})`)
  assert.ok(Math.hypot(p.x - startX, p.y - startY) > 50, '史莱姆没有实际移动')
  console.log(`✓ 点地移动：${frames} 帧从 (${startX.toFixed(0)}, ${startY.toFixed(0)}) 到达 (${target.x.toFixed(0)}, ${target.y.toFixed(0)})`)
}

// —— 2. 键盘优先：方向键立即作废目标，单纯键盘移动不带目标 ——
{
  const p = freshRun()
  tap(900, 460)
  assert.ok(engine.input.moveTarget, '前置条件：目标未生成')
  key('KeyW')
  assert.equal(engine.input.moveTarget, null, '方向键没有清除点地目标')
  const y0 = p.y
  engine.update(1 / 60)
  assert.ok(p.y < y0, '按下 W 后没有向上移动')
  key('KeyW', 'up')

  // 即使先设目标再按键，getMoveVector 也不会让目标「复活」
  engine.input.setMoveTarget(p.x + 300, p.y)
  engine.input.state.right = true
  const v = engine.input.getMoveVector(p.x, p.y)
  assert.equal(v.x, 1)
  assert.equal(engine.input.moveTarget, null)
  engine.input.state.right = false
  console.log('✓ 键盘优先：方向键接管并丢弃落点，松手后不会自己走回去')
}

// —— 3. 高移速下贴点收脚：越过落点即停，不在终点两侧来回抖 ——
{
  const p = freshRun()
  p.speed = 4000 // 60fps 下单帧约 66px，远超落点剩余距离
  const destX = Math.min(engine.worldWidth - p.radius - 1, p.x + 250)
  const destY = p.y
  engine.input.setMoveTarget(destX, destY)
  for (let i = 0; i < 30; i++) engine.update(1 / 60)
  assert.equal(engine.input.moveTarget, null, '高速到达后目标未清除')
  assert.ok(Math.abs(p.x - destX) < 0.5 && Math.abs(p.y - destY) < 0.5, `高速未贴住落点：(${p.x}, ${p.y}) vs (${destX}, ${destY})`)
  const settledX = p.x
  const settledY = p.y
  for (let i = 0; i < 20; i++) engine.update(1 / 60)
  assert.ok(Math.abs(p.x - settledX) < 1e-6 && Math.abs(p.y - settledY) < 1e-6, '到达后仍在抖动/漂移')
  console.log('✓ 高速贴点：单帧位移 66px 仍精确停在落点，无终点抖动')
}

// —— 4. 被障碍/边界顶住时自动放弃目标（不会无限顶墙） ——
{
  const p = freshRun()
  const startX = p.x
  const startY = p.y
  engine.input.setMoveTarget(startX + 300, startY)
  let frames = 0
  while (engine.input.moveTarget && frames < 120) {
    engine.update(1 / 60)
    p.x = startX // 模拟拒马/边界每帧把位移还原
    p.y = startY
    frames++
  }
  assert.equal(engine.input.moveTarget, null, '推不动时目标未被放弃')
  assert.ok(frames >= 20 && frames <= 40, `放弃时机异常：${frames} 帧（期望约 0.45s ≈ 27 帧）`)
  console.log(`✓ 卡住看门狗：${frames} 帧（约 ${(frames / 60).toFixed(2)}s）后自动放弃目标`)
}

// —— 5. 暂停与非 Arena 玩法忽略点击 ——
{
  const p = freshRun()
  engine.pause()
  tap(900, 460)
  assert.equal(engine.input.moveTarget, null, '暂停时点击仍然生成了移动目标')
  engine.resume()
  assert.equal(engine.running, true)

  engine.gameplayId = 'runner'
  tap(900, 460)
  assert.equal(engine.input.moveTarget, null, '非主战场玩法不应响应点地移动')
  engine.gameplayId = 'arena'

  engine.runState = 'expedition-intro'
  tap(900, 460)
  assert.equal(engine.input.moveTarget, null, '章节开场演出期间不应接收点地目标')
  engine.runState = 'active'

  // 右键 / 中键不触发（触屏与左键 button=0）
  tap(900, 460, { button: 2 })
  assert.equal(engine.input.moveTarget, null, '右键误触发点地移动')
  tap(900, 460)
  assert.ok(engine.input.moveTarget, '左键未能生成目标')
  engine.input.clearMoveTarget()
  console.log('✓ 暂停、非主战场、右键均被忽略')
}

// —— 6. 决斗圈（软结界）内收束落点，避免误点把自己送到圈外灼烧 ——
{
  const p = freshRun()
  engine.bossArena.active = true
  engine.bossArena.cx = p.x
  engine.bossArena.cy = p.y
  engine.bossArena.radius = 200
  tap(1270, 700)
  const target = engine.input.moveTarget
  assert.ok(target, '圈内点击未生成目标')
  const dist = Math.hypot(target.x - p.x, target.y - p.y)
  assert.ok(dist <= 200 * 0.94 + 0.01, `落点未收束到决斗圈内：${dist.toFixed(1)} > ${(200 * 0.94).toFixed(1)}`)
  engine.bossArena.active = false
  engine.input.clearMoveTarget()
  console.log(`✓ 决斗圈收束：落点距圈心 ${dist.toFixed(0)}px ≤ ${(200 * 0.94).toFixed(0)}px`)
}

// —— 7. 落点标记进入世界渲染层；重开清空目标 ——
{
  const p = freshRun()
  const targetX = p.x + 120
  const targetY = p.y
  engine.input.setMoveTarget(targetX, targetY)
  frame.translates.length = 0
  engine.render()
  assert.ok(hasTranslate(targetX, targetY), '落点标记未在世界坐标系中绘制')
  assert.ok(frame.arcs.length > 0, '落点标记没有绘制圆环')
  engine.reset()
  assert.equal(engine.input.moveTarget, null, '重开一局未清空点地目标')
  console.log('✓ 落点标记进入渲染层，reset() 清空目标')
}

engine.stop()
console.log('全部点地移动断言通过')
