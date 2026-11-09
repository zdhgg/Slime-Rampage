// 主战场虚拟摇杆验证（无头）：摇杆数学 + 输入优先级 + 引擎指针接线 + 渲染。
// 运行：node verify-virtual-stick.mjs
import assert from 'node:assert/strict'

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

const { VirtualStick, VIRTUAL_STICK_METRICS } = await import('./src/game/VirtualStick.js')
const { GameEngine } = await import('./src/game/GameEngine.js')

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps
const fire = (type, event) => {
  const handlers = [...(canvasListeners.get(type) || [])]
  assert.ok(handlers.length > 0, `画布未注册 ${type} 监听`)
  for (const handler of handlers) handler(event)
}
const pointer = (type, id, x, y, extra = {}) => fire(type, {
  pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y, ...extra,
})

// —— 1. 摇杆数学：死区、满推力夹取、模拟推力、独占与复位 ——
{
  const stick = new VirtualStick()
  const { BASE_RADIUS, MAX_OFFSET, DEAD_ZONE } = VIRTUAL_STICK_METRICS
  assert.equal(stick.begin(1, 200, 600, 1280, 720), true)
  assert.equal(stick.engaged, true)
  assert.equal(stick.vector.x, 0)
  assert.equal(stick.vector.y, 0)
  assert.equal(stick.begin(2, 300, 600, 1280, 720), false, '已有手指时不能再次接管')

  stick.move(1, 200 + 4, 600) // 死区内
  assert.equal(stick.vector.x, 0, '死区内不应输出方向')

  stick.move(1, 200 + MAX_OFFSET, 600)
  assert.ok(near(stick.vector.x, 1, 1e-6), `满推力应为 1，实际 ${stick.vector.x}`)
  assert.ok(near(stick.vector.y, 0, 1e-6))

  stick.move(1, 200 + MAX_OFFSET / 2, 600)
  const expected = (0.5 - DEAD_ZONE) / (1 - DEAD_ZONE)
  assert.ok(near(Math.hypot(stick.vector.x, stick.vector.y), expected, 1e-6), '半程推力映射错误')

  stick.move(1, 200 + 500, 600) // 远超满推力
  assert.ok(near(stick.vector.x, 1, 1e-6), '超程应夹到满推力')
  assert.ok(near(stick.dx, MAX_OFFSET, 1e-6), '摇杆头应夹在最大偏移处')
  assert.ok(stick.baseX - MAX_OFFSET >= BASE_RADIUS - MAX_OFFSET, '基座应在可视区内')

  // 斜向：方向单位化，推力仍为 1
  stick.move(1, 200 + MAX_OFFSET, 600 + MAX_OFFSET)
  assert.ok(near(Math.hypot(stick.vector.x, stick.vector.y), 1, 1e-6))
  assert.ok(near(stick.vector.x, Math.SQRT1_2, 1e-6) && near(stick.vector.y, Math.SQRT1_2, 1e-6))

  assert.equal(stick.end(1), true)
  assert.equal(stick.engaged, false)
  assert.equal(stick.vector.x, 0)
  stick.update(0.09)
  assert.ok(stick.alpha > 0.4 && stick.alpha < 0.6, `淡出中透明度异常：${stick.alpha}`)
  stick.update(0.2)
  assert.equal(stick.alpha, 0, '淡出结束后应完全隐藏')
  console.log('✓ 摇杆数学：死区、半程推力、满推力夹取、斜向单位化、松手淡出')
}

// —— 2. 引擎接线：左半屏触摸接管、拖动方向、松手即停 ——
const engine = GameEngine.create(canvasStub)
engine.onStats = () => {}
engine.onLevelUp = () => {}
engine.onGameOver = () => {}
engine.onBossSpawn = () => {}
engine.onWaveChanged = () => {}
engine.onEvolution = () => {}

function freshRun() {
  engine.reset()
  engine.start()
  engine.update(1 / 60)
  engine.update(1 / 60)
  const p = engine.player
  p.invincible = 1e6
  p.hp = p.maxHp = 999
  engine.mapFeatures.barricades.length = 0
  return p
}

{
  const p = freshRun()
  const startX = p.x
  const startY = p.y
  pointer('pointerdown', 7, 100, 500)
  assert.equal(engine.virtualStick.engaged, true, '左半屏触摸未接管摇杆')
  assert.equal(engine._stickPointer, 7)
  assert.equal(engine.input.stickVector.x, 0)
  assert.equal(engine.input.moveTarget, null, '触摸不应再生成点地目标')

  pointer('pointermove', 7, 60, 460) // 左上拖动 ≈ 满推力
  assert.ok(engine.input.stickVector.x < -0.6 && engine.input.stickVector.y < -0.6,
    `摇杆推力方向错误：${JSON.stringify(engine.input.stickVector)}`)
  for (let i = 0; i < 20; i++) engine.update(1 / 60)
  assert.ok(p.x < startX - 30 && p.y < startY - 30, `角色未随摇杆移动：(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`)

  const heldX = p.x
  const heldY = p.y
  pointer('pointerup', 7, 60, 460)
  assert.equal(engine.virtualStick.engaged, false)
  assert.equal(engine.input.stickVector.x, 0)
  for (let i = 0; i < 20; i++) engine.update(1 / 60)
  assert.ok(Math.hypot(p.x - heldX, p.y - heldY) < 1, '松手后仍在移动')
  console.log('✓ 引擎接线：左半屏触摸接管摇杆，拖动方向正确，松手立即停住')
}

// —— 3. 推力模拟量：半推走半速 ——
{
  const p = freshRun()
  const startX = p.x
  pointer('pointerdown', 9, 300, 500)
  pointer('pointermove', 9, 300 + VIRTUAL_STICK_METRICS.MAX_OFFSET / 2, 500)
  const thrust = Math.hypot(engine.input.stickVector.x, engine.input.stickVector.y)
  for (let i = 0; i < 30; i++) engine.update(1 / 60)
  const halfDistance = p.x - startX
  pointer('pointerup', 9, 0, 0)

  const fullRun = freshRun()
  const fullStartX = fullRun.x
  pointer('pointerdown', 10, 300, 500)
  pointer('pointermove', 10, 300 + VIRTUAL_STICK_METRICS.MAX_OFFSET, 500)
  for (let i = 0; i < 30; i++) engine.update(1 / 60)
  const fullDistance = fullRun.x - fullStartX
  pointer('pointerup', 10, 0, 0)

  assert.ok(halfDistance > 5 && fullDistance > halfDistance * 1.3,
    `半推应明显慢于满推：half=${halfDistance.toFixed(1)} full=${fullDistance.toFixed(1)} thrust=${thrust.toFixed(2)}`)
  console.log(`✓ 模拟推力：半推 30 帧位移 ${halfDistance.toFixed(1)}px，满推 ${fullDistance.toFixed(1)}px`)
}

// —— 4. 触摸不点地移动；鼠标点地移动仍然可用；键盘优先于摇杆 ——
{
  const p = freshRun()
  pointer('pointerdown', 11, 900, 400) // 右半屏触摸
  assert.equal(engine.virtualStick.engaged, false, '右半屏不应接管摇杆')
  assert.equal(engine.input.moveTarget, null, '触摸点按不应生成点地目标')
  pointer('pointerup', 11, 900, 400)

  pointer('pointerdown', 12, 300, 500) // 左半屏轻触（不拖）
  pointer('pointerup', 12, 300, 500)
  assert.equal(engine.input.stickVector.x, 0)
  assert.equal(engine.input.moveTarget, null)
  const x0 = p.x
  for (let i = 0; i < 10; i++) engine.update(1 / 60)
  assert.ok(Math.abs(p.x - x0) < 1, '轻触不应让角色移动')

  fire('pointerdown', { pointerId: 13, pointerType: 'mouse', button: 0, clientX: 900, clientY: 400 })
  assert.ok(engine.input.moveTarget, '鼠标点地移动被误伤')
  fire('pointerup', { pointerId: 13, pointerType: 'mouse', button: 0, clientX: 900, clientY: 400 })

  // 摇杆推进中按键盘：键盘方向优先，且摇杆向量不参与本帧
  engine.input.clearMoveTarget()
  pointer('pointerdown', 14, 200, 500)
  pointer('pointermove', 14, 200, 300) // 向上推
  engine.input._onKeyDown({ code: 'KeyD', repeat: false, defaultPrevented: false, target: null, preventDefault() {} })
  const v = engine.input.getMoveVector(p.x, p.y)
  assert.equal(v.x, 1, '键盘应压过摇杆')
  assert.equal(v.y, 0)
  engine.input._onKeyUp({ code: 'KeyD' })
  pointer('pointerup', 14, 200, 300)
  console.log('✓ 触屏点按不移动、鼠标点地仍可用、键盘优先于摇杆')
}

// —— 5. 暂停/重开清理摇杆；渲染层绘制摇杆基座 ——
{
  const p = freshRun()
  pointer('pointerdown', 21, 150, 550)
  pointer('pointermove', 21, 110, 510)
  assert.ok(engine.input.stickVector.x < 0)
  engine.pause()
  assert.equal(engine.virtualStick.engaged, false, '暂停未结束摇杆拖动')
  assert.equal(engine.input.stickVector.x, 0, '暂停未清空摇杆推力')
  assert.equal(engine._stickPointer, null)
  engine.resume()

  // 渲染：按住时基座与摇杆头应出现在屏幕坐标
  pointer('pointerdown', 22, 180, 520)
  assert.equal(engine.virtualStick.engaged, true)
  const baseX = engine.virtualStick.baseX
  const baseY = engine.virtualStick.baseY
  frame.arcs.length = 0
  engine.render()
  assert.ok(frame.arcs.some(([x, y, r]) => near(x, baseX, 0.5) && near(y, baseY, 0.5) && near(r, VIRTUAL_STICK_METRICS.BASE_RADIUS, 0.01)),
    '摇杆基座未绘制在屏幕坐标')
  pointer('pointerup', 22, 180, 520)

  // 松手淡出后不再绘制
  engine.virtualStick.update(1)
  frame.arcs.length = 0
  engine.render()
  assert.ok(!frame.arcs.some(([x, y, r]) => near(x, baseX, 0.5) && near(y, baseY, 0.5) && near(r, VIRTUAL_STICK_METRICS.BASE_RADIUS, 0.01)),
    '淡出后仍在绘制摇杆')

  // 重开清空
  pointer('pointerdown', 23, 180, 520)
  pointer('pointermove', 23, 240, 520)
  assert.ok(engine.input.stickVector.x > 0)
  engine.reset()
  assert.equal(engine.virtualStick.engaged, false)
  assert.equal(engine.input.stickVector.x, 0)
  console.log('✓ 暂停/重开清理摇杆，基座按屏幕坐标绘制并在松手后淡出')
}

engine.stop()
console.log('全部虚拟摇杆断言通过')
