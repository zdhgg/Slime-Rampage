// Gameplay 架构 smoke test：验证 gameplay 层默认值、工厂回落、
// hooks 接线（reset/update/render/destroy）与 Engine 初始化销毁不受损。
// 纯 Node 运行（无头桩与 engine-smoke.mjs 同源），npm test 链内执行。
import assert from 'node:assert/strict'

// —— 浏览器环境桩（与 engine-smoke.mjs 相同的最小桩） ——
const gradient = { addColorStop() {} }
const ctx2d = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => gradient
      return () => {} // 其余绘制方法 → no-op
    },
    set() {
      return true
    },
  }
)
const canvasStub = {
  width: 0,
  height: 0,
  getBoundingClientRect: () => ({ width: 1280, height: 720 }),
  getContext: () => ctx2d,
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
const { GameplayController } = await import('./src/game/gameplay/GameplayController.js')
const { ArenaGameplay } = await import('./src/game/gameplay/ArenaGameplay.js')
const { createGameplay } = await import('./src/game/gameplay/GameplayFactory.js')

// 工厂：arena → ArenaGameplay；未知 id（如尚未实装的 runner）安全回落 arena
assert.ok(createGameplay('arena') instanceof ArenaGameplay)
assert.ok(createGameplay('runner') instanceof ArenaGameplay)
console.log('✓ GameplayFactory：arena 命中，未知 id 安全回落 arena')

// 默认 gameplay = arena，且已注入引擎上下文
const engine = GameEngine.create(canvasStub)
assert.equal(engine.gameplayId, 'arena')
assert.ok(engine.gameplay instanceof ArenaGameplay)
assert.ok(engine.gameplay instanceof GameplayController)
assert.equal(engine.gameplay.game, engine)
console.log('✓ 引擎默认 gameplay 为 arena（Controller 已 attach 引擎）')

// configureRun 只归一化规则模式，不触碰 gameplay 层
const gameplayBefore = engine.gameplay
engine.configureRun({ mode: 'endless', difficulty: 'hell' })
assert.equal(engine.runSelection.mode, 'endless')
assert.equal(engine.gameplayId, 'arena')
assert.equal(engine.gameplay, gameplayBefore)
console.log('✓ configureRun 不改变 gameplay（expedition/timed/endless 语义不变）')

// hooks 接线：reset → update → render 各自按序触发对应 hook
const calls = []
const gp = engine.gameplay
for (const hook of ['reset', 'beforeUpdate', 'afterUpdate', 'beforeRender', 'afterRender']) {
  gp[hook] = (...args) => calls.push([hook, args])
}
engine.reset()
assert.equal(calls.length, 1)
assert.equal(calls[0][0], 'reset')
engine.update(1 / 60)
assert.deepEqual(calls.map(([hook]) => hook), ['reset', 'beforeUpdate', 'afterUpdate'])
assert.ok(Math.abs(calls[1][1][0] - 1 / 60) < 1e-9, 'beforeUpdate 应收到 dt')
engine.render()
assert.deepEqual(
  calls.map(([hook]) => hook),
  ['reset', 'beforeUpdate', 'afterUpdate', 'beforeRender', 'afterRender']
)
assert.equal(calls[3][1][0], ctx2d, 'beforeRender 应收到 ctx')
console.log('✓ Gameplay hooks 在 Engine 生命周期中按序接线（reset/update/render）')

// ArenaGameplay 可独立 attach/reset（纯 JS、无 DOM 依赖），destroy 清空上下文
const standalone = new ArenaGameplay()
standalone.attach(engine)
assert.equal(standalone.game, engine)
standalone.reset()
standalone.beforeUpdate(1 / 60)
standalone.afterRender(ctx2d)
standalone.destroy()
assert.equal(standalone.game, null)
console.log('✓ ArenaGameplay 可独立 attach/reset/destroy')

// 显式入口 configureGameplay：重建 Controller 并重新 attach；未知 id 回落 arena
const swapped = engine.configureGameplay('runner')
assert.equal(engine.gameplayId, 'arena')
assert.ok(swapped instanceof ArenaGameplay)
assert.equal(swapped.game, engine)
assert.notEqual(swapped, gp, 'configureGameplay 应重建 Controller')
assert.equal(gp.game, null, '旧 Controller 已被销毁（上下文清空）')
console.log('✓ configureGameplay 显式入口可用（未知 id 回落 arena 并重建）')

// 引擎销毁同步销毁 gameplay，单例复位；销毁后可再次初始化（HMR 场景）
const active = engine.gameplay
let destroyed = false
const originalDestroy = active.destroy.bind(active)
active.destroy = () => {
  destroyed = true
  originalDestroy()
}
engine.destroy()
assert.ok(destroyed, 'engine.destroy 应调用 gameplay.destroy')
assert.equal(active.game, null, 'destroy 后 gameplay 的 Engine 上下文应已清空')
assert.equal(GameEngine.getInstance(), null)
const revived = GameEngine.create(canvasStub)
assert.equal(revived.gameplayId, 'arena')
assert.ok(revived.gameplay instanceof ArenaGameplay)
revived.destroy()
console.log('✓ 引擎初始化与销毁不受损（gameplay 同步销毁，单例可重建）')

console.log('\nGameplay 架构 smoke test 通过 ✓')
