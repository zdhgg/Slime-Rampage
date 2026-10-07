import assert from 'node:assert/strict'
import { getStageConfig } from './src/game/gameplay/tower-defense/TowerDefenseCampaignRules.js'
import { createTowerScenery, paintTowerScenery } from './src/game/gameplay/tower-defense/TowerDefenseScenery.js'

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const sizes = [[1280, 720], [1600, 900], [1920, 1080], [2560, 1440], [3840, 2160], [768, 1024], [390, 844]]
function layout(width, height) {
  const left = clamp(width * 0.035, 18, 54), top = clamp(height * 0.11, 58, 92)
  const boardWidth = width - left * 2, boardHeight = height - top - clamp(height * 0.055, 24, 48)
  return { width, height, left, top, boardWidth, boardHeight, unit: clamp(Math.min(boardWidth, boardHeight) * 0.064, 28, 56) }
}
// Independent segment-distance implementation: don't verify the generator against itself.
function segmentDistance(p, a, b) {
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  if (!length) return Math.hypot(p.x - a.x, p.y - a.y)
  const along = clamp(((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / length, 0, length)
  return Math.hypot(p.x - a.x - (b.x - a.x) / length * along, p.y - a.y - (b.y - a.y) / length * along)
}
let tested = 0
const topologies = new Set()
for (let id = 1; id <= 99; id++) {
  const config = getStageConfig(id)
  topologies.add(config.topologyId)
  for (const [w, h] of sizes) {
    const l = layout(w, h), s = createTowerScenery(l, { ...config, id }, config.buildSlots, config.traps)
    assert.ok(s.props.length <= 42)
    assert.deepEqual(s, createTowerScenery(l, { ...config, id }, config.buildSlots, config.traps))
    for (const item of s.props) {
      const r = item.radius
      assert.ok(item.x - r >= l.left - 0.001 && item.x + r <= l.left + l.boardWidth + 0.001)
      assert.ok(item.y - r >= l.top - 0.001 && item.y + r <= l.top + l.boardHeight + 0.001)
      for (let i = 1; i < s.path.length; i++) assert.ok(segmentDistance(item, s.path[i - 1], s.path[i]) >= s.roadHalfWidth + r + 5.999)
      for (const slot of config.buildSlots) assert.ok(Math.hypot(item.x - l.left - slot.x * l.boardWidth, item.y - l.top - slot.y * l.boardHeight) >= Math.max(34, l.unit * 1.22) + 8 + r - 0.001)
      for (const trap of config.traps) assert.ok(Math.hypot(item.x - l.left - trap.pos.x * l.boardWidth, item.y - l.top - trap.pos.y * l.boardHeight) >= l.unit * 1.15 + 10 + r - 0.001)
      for (const endpoint of [s.path[0], s.path.at(-1)]) assert.ok(Math.hypot(item.x - endpoint.x, item.y - endpoint.y) >= l.unit * 1.3 + 10 + r - 0.001)
      tested++
    }
  }
}
assert.equal(topologies.size, 10)

let depth = 0, builds = 0
const ctx = new Proxy({}, {
  get: (_, key) => (...args) => {
    for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg), `${key}: nonfinite coordinate`)
    if (key === 'save') depth++
    if (key === 'restore') { depth--; assert.ok(depth >= 0) }
    if (key === 'setTransform') builds++
    if (String(key).includes('Gradient')) return { addColorStop() {} }
  },
  set: () => true,
})
for (const id of [1, 6, 11, 16, 21, 41, 61, 81, 99]) {
  const c = getStageConfig(id), l = layout(1600, 900)
  paintTowerScenery(ctx, l, createTowerScenery(l, { ...c, id }, c.buildSlots, c.traps), c)
  assert.equal(depth, 0)
}

globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) }
const { TowerDefenseRenderer } = await import('./src/game/gameplay/tower-defense/TowerDefenseRenderer.js')
const c = getStageConfig(6)
const gp = { currentStageId: 6, stageConfig: c, buildSlots: c.buildSlots, traps: c.traps.map(t => ({ ...t })), game: { width: 1600, height: 900, dpr: 1 } }
const renderer = new TowerDefenseRenderer(gp)
renderer.ensureLayout(); renderer._drawCachedScenery(ctx)
const cache = renderer._sceneryCanvas, count = builds
for (let i = 0; i < 30; i++) { gp.elapsedTime = i; gp.selectedSlotIndex = i % c.buildSlots.length; gp.traps[0].cooldownTimer = i; renderer._drawCachedScenery(ctx) }
assert.equal(builds, count, 'combat and selection must not rebuild scenery')
gp.stageConfig = getStageConfig(21); gp.currentStageId = 21; gp.buildSlots = gp.stageConfig.buildSlots; gp.traps = gp.stageConfig.traps
renderer._drawCachedScenery(ctx); assert.equal(builds, count + 1)
assert.equal(renderer._sceneryCanvas, cache, 'stage switch reuses the single viewport cache')
gp.game.width = 1280; renderer.ensureLayout(); renderer._drawCachedScenery(ctx); assert.equal(builds, count + 2)
gp.game.dpr = 2; renderer._drawCachedScenery(ctx); assert.equal(builds, count + 3)
gp.stageConfig = { ...gp.stageConfig, timeOfDay: 'midnight' }; renderer._drawCachedScenery(ctx); assert.equal(builds, count + 4)
gp.game.width = 3840; gp.game.height = 2160; renderer.ensureLayout(); renderer._drawCachedScenery(ctx)
assert.ok(cache.width * cache.height < 8400000, 'cache has a bounded pixel budget at high DPI')
renderer.destroy(); assert.equal(renderer._sceneryCanvas, null); assert.equal(cache.width, 1)
assert.equal(depth, 0)
console.log(`✓ 99 关 / 10 路径 / 7 分辨率：${tested} 个装饰安全区检查、固定种子、绘制状态及缓存生命周期通过`)
