// 章节时限提醒验证：deadline-start / 60s / 30s / 末 10s 逐秒事件的触发时序。
// 运行：node verify-deadline-warnings.mjs
import assert from 'node:assert/strict'

const ctx2d = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => ({ addColorStop() {} })
      return () => {}
    },
    set() { return true },
  }
)
const canvasStub = {
  width: 0,
  height: 0,
  getBoundingClientRect: () => ({ width: 1280, height: 720 }),
  getContext: () => ctx2d,
}
globalThis.window = { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 }
globalThis.document = { createElement: () => canvasStub, addEventListener() {}, removeEventListener() {}, hidden: false }
globalThis.requestAnimationFrame = () => 0
globalThis.cancelAnimationFrame = () => {}

const { GameEngine } = await import('./src/game/GameEngine.js')

const engine = GameEngine.create(canvasStub)
engine.onLevelUp = () => {}
engine.onGameOver = () => {}

const runStateEvents = []
engine.onRunState = (event) => runStateEvents.push(event)

// 模拟战斗音效：记录提示音调用而非真实发声
const soundCalls = []
engine.sound.deadlineAlert = () => soundCalls.push('alert')
engine.sound.countdownTick = (sec) => soundCalls.push(`tick:${sec}`)
engine.sound.wave = () => soundCalls.push('wave')

engine.configureRun({ mode: 'expedition', difficulty: 'normal' })
engine.reset()
engine.start()
engine.player.invincible = 9999

// 跳过第 1 章：直接进第 2 章（信标时限章）
engine._enterExpeditionStage(2)
assert.equal(engine._expeditionDefinition.deadline, 90)
engine.expeditionIntroTime = 99
engine.update(0.05) // intro → active
assert.equal(engine.runState, 'active')
assert.equal(soundCalls.includes('wave'), true, '时限章激活应响一次号角')

const startEvent = runStateEvents.find((e) => e.kind === 'deadline-start')
assert.equal(startEvent?.seconds, 90, '激活时宣告 90 秒总时限')
assert.equal(startEvent?.brief, '摧毁迁跃信标，切断王城增援')

// 推进到剩余 61 秒：不应有任何警告
runStateEvents.length = 0
engine.expeditionStageElapsed = 29
engine.update(0.05)
assert.equal(runStateEvents.filter((e) => e.kind === 'deadline-warning').length, 0)

// 跨过 60s 里程碑
engine.expeditionStageElapsed = 30.01
engine.update(0.05)
assert.deepEqual(runStateEvents.filter((e) => e.kind === 'deadline-warning').map((e) => e.seconds), [60])
assert.equal(soundCalls.filter((c) => c === 'alert').length, 1, '60s 里程碑响一次警示音')

// 重复帧不重复触发
engine.update(0.05)
engine.update(0.05)
assert.equal(runStateEvents.filter((e) => e.kind === 'deadline-warning').length, 1)

// 跨过 30s 里程碑
engine.expeditionStageElapsed = 60.01
engine.update(0.05)
assert.deepEqual(runStateEvents.filter((e) => e.kind === 'deadline-warning').map((e) => e.seconds), [60, 30])
assert.equal(soundCalls.filter((c) => c === 'alert').length, 2)

// 末 10 秒：deadline-final 一次 + 逐秒滴答
runStateEvents.length = 0
soundCalls.length = 0
engine.expeditionStageElapsed = 80.01 // remaining 9.99 → ceil 10
engine.update(0.05)
assert.equal(runStateEvents.filter((e) => e.kind === 'deadline-final').length, 1)
assert.deepEqual(soundCalls.filter((c) => c.startsWith('tick:')), ['tick:10'])

// 逐秒递减：0.6s + 0.5s 推进跨过 9s 边界
engine.update(0.6) // elapsed 80.66 → remaining 9.34 → ceil 10（同秒不重复）
assert.deepEqual(soundCalls.filter((c) => c.startsWith('tick:')), ['tick:10'])
engine.update(0.5) // elapsed 81.16 → remaining 8.84 → ceil 9
assert.deepEqual(soundCalls.filter((c) => c.startsWith('tick:')), ['tick:10', 'tick:9'])

// 逐秒推进到最后一秒：每次 +1s 跨过一秒边界，沿途 8..1 每秒一响
for (let i = 0; i < 8; i++) engine.update(1)
const ticks = soundCalls.filter((c) => c.startsWith('tick:')).map((c) => Number(c.slice(5)))
assert.deepEqual(ticks, [10, 9, 8, 7, 6, 5, 4, 3, 2, 1], '末段应逐秒滴答 10→1')

// 超时仍判负
engine.expeditionStageElapsed = 90.01
engine.update(0.05)
assert.equal(engine.runState, 'defeat')
assert.equal(engine.defeatReason, 'beacon-timeout')
assert.equal(soundCalls.filter((c) => c.startsWith('tick:')).length, 10, '超时后不再滴答')

console.log('✓ 章节时限提醒：激活宣告 + 60/30s 里程碑 + 末 10s 逐秒滴答时序全部正确')
