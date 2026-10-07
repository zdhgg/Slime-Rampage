/**
 * 回归测试：敌人渲染坐标必须与当前关卡路径一致。
 *
 * 历史缺陷：渲染层 `_drawEnemies` 调用 getTowerDefensePathPosition(progress)
 * 时未传入关卡路径，导致非 classic_s 拓扑的关卡（如 1-6 荆棘密林 / canyon_creek）
 * 怪物被画到默认 S 形路径上，与地面道路和模拟层坐标全部错位。
 *
 * 本测试直接实例化 Renderer，验证其绘制位置落在关卡路径折线上。
 */
import assert from 'node:assert/strict'
import { getStageConfig } from './src/game/gameplay/tower-defense/TowerDefenseCampaignRules.js'
import { TowerDefenseRenderer } from './src/game/gameplay/tower-defense/TowerDefenseRenderer.js'

console.log('=== Running Tower Defense Path Alignment Tests ===')

/** 点到折线的最短距离（归一化棋盘坐标） */
function distToPath(px, py, path) {
  let best = Infinity
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lenSq = dx * dx + dy * dy
    const t = lenSq > 0 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lenSq)) : 0
    best = Math.min(best, Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t)))
  }
  return best
}

/** 记录绘制调用坐标的最小 ctx 桩 */
function createCtxSpy() {
  const draws = []
  const noop = () => {}
  return {
    draws,
    canvas: { width: 1600, height: 900 },
    save: noop, restore: noop, beginPath: noop, closePath: noop, clip: noop,
    moveTo: noop, lineTo: noop, arc: noop, rect: noop, roundRect: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop, ellipse: noop, stroke: noop, fill: noop,
    fillRect: noop, strokeRect: noop, clearRect: noop, setLineDash: noop,
    fillText: noop, strokeText: noop, measureText: () => ({ width: 10 }),
    drawImage: noop, translate: (x, y) => { draws.push({ x, y }) },
    scale: noop, rotate: noop, transform: noop, setTransform: noop, resetTransform: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => null,
  }
}

const TOLERANCE = 0.005

// 1. 重点关卡：1-6 荆棘密林（本次报障关卡，canyon_creek 拓扑）
const stage6 = getStageConfig(6)
assert.equal(stage6.topologyId, 'canyon_creek', 'Stage 1-6 must use canyon_creek topology')
{
  const gameplay = {
    enemies: [{ id: 1, active: true, typeId: 'grunt', hp: 10, maxHp: 10, progress: 0.25, x: 0.75, y: 0.168, facing: Math.PI / 2 }],
    stageConfig: stage6,
    elapsed: 3,
    hoveredEnemyId: null,
    game: { width: 1600, height: 900 },
  }
  const renderer = new TowerDefenseRenderer(gameplay)
  renderer.ensureLayout?.()
  const ctx = createCtxSpy()
  renderer._drawEnemies(ctx)

  assert.ok(ctx.draws.length > 0, 'stage 1-6 must draw at least one enemy')
  const drawn = renderer.unproject(ctx.draws[0].x, ctx.draws[0].y)
  const offset = distToPath(drawn.x, drawn.y, stage6.path)
  assert.ok(
    offset < TOLERANCE,
    `Stage 1-6 enemy drawn off the stage path (offset ${offset.toFixed(4)}); renderer is using the default path`,
  )
  console.log('✓ Stage 1-6 (canyon_creek) enemies render on the stage path')
}

// 2. 全关卡覆盖：任意拓扑下，模拟层坐标都必须落在关卡路径上
let checked = 0
for (let stageId = 1; stageId <= 99; stageId++) {
  const cfg = getStageConfig(stageId)
  assert.ok(Array.isArray(cfg.path) && cfg.path.length >= 2, `stage ${stageId} must define a path`)

  const { getTowerDefensePathPosition } = await import('./src/game/gameplay/tower-defense/TowerDefenseRules.js')
  for (const progress of [0, 0.13, 0.27, 0.41, 0.5, 0.63, 0.77, 0.91, 1]) {
    const pos = getTowerDefensePathPosition(progress, cfg.path)
    const offset = distToPath(pos.x, pos.y, cfg.path)
    assert.ok(offset < 1e-9, `stage ${stageId} progress ${progress} off path by ${offset}`)
    checked++
  }
}
console.log(`✓ All 99 stages keep simulation coordinates on their own path (${checked} samples)`)

// 3. 渲染层与模拟层必须一致：渲染直接复用 enemy.x/y，不得重算
{
  const cfg = getStageConfig(6)
  const offPathEnemy = { id: 9, active: true, typeId: 'grunt', hp: 5, maxHp: 10, progress: 0.5, x: 0.25, y: 0.48, facing: 0 }
  const gameplay = {
    enemies: [offPathEnemy],
    stageConfig: cfg,
    elapsed: 1,
    hoveredEnemyId: null,
    game: { width: 1600, height: 900 },
  }
  const renderer = new TowerDefenseRenderer(gameplay)
  renderer.ensureLayout?.()
  const ctx = createCtxSpy()
  renderer._drawEnemies(ctx)
  const expected = renderer.project({ x: 0.25, y: 0.48 })
  assert.ok(
    Math.abs(ctx.draws[0].x - expected.x) < 0.001 && Math.abs(ctx.draws[0].y - expected.y) < 0.001,
    'Renderer must reuse the simulation position instead of recomputing from progress',
  )
  console.log('✓ Renderer reuses simulation coordinates (no independent path recompute)')
}

// 4. 防御：坐标缺失时仍应回退到关卡路径而非默认路径
{
  const cfg = getStageConfig(6)
  const { getTowerDefensePathPosition } = await import('./src/game/gameplay/tower-defense/TowerDefenseRules.js')
  const expected = renderer_projectExpectation(0.5, cfg)
  function renderer_projectExpectation(progress, config) {
    return getTowerDefensePathPosition(progress, config.path)
  }
  const gameplay = {
    enemies: [{ id: 3, active: true, typeId: 'grunt', hp: 1, maxHp: 10, progress: 0.5, x: NaN, y: undefined, facing: null }],
    stageConfig: cfg,
    elapsed: 0,
    hoveredEnemyId: null,
    game: { width: 1600, height: 900 },
  }
  const renderer = new TowerDefenseRenderer(gameplay)
  renderer.ensureLayout?.()
  const ctx = createCtxSpy()
  renderer._drawEnemies(ctx)
  const expectedPoint = renderer.project(expected)
  assert.ok(
    Math.abs(ctx.draws[0].x - expectedPoint.x) < 0.001 && Math.abs(ctx.draws[0].y - expectedPoint.y) < 0.001,
    'Fallback must use the stage path, not the default path',
  )
  console.log('✓ Fallback path also uses the stage path')
}

// 5. All build positions must clear the visible road, even before/after opening a seal.
// Use the actual renderer layout and an independent pixel-space distance check.
{
  const sizes = [[1280, 720], [1366, 768], [1600, 900], [1920, 1080], [2560, 1440], [3840, 2160], [720, 1080], [390, 844], [844, 390]]
  let checkedSlots = 0
  for (let stageId = 1; stageId <= 99; stageId++) {
    const cfg = getStageConfig(stageId)
    const original = JSON.stringify(cfg)
    const gp = { stageConfig: cfg, buildSlots: cfg.buildSlots, game: { width: 1280, height: 720 } }
    const renderer = new TowerDefenseRenderer(gp)
    for (const [width, height] of sizes) {
      Object.assign(gp.game, { width, height })
      renderer.ensureLayout()
      assert.equal(gp.buildSlots, cfg.buildSlots, 'Presentation must not replace combat anchors')
      const path = cfg.path.map(p => renderer.project(p))
      const points = gp.buildSlots.map(p => renderer.project(p))
      assert.equal(points.length, cfg.buildSlots.length, 'Layout must preserve all slot indices')
      for (const [index, slot] of gp.buildSlots.entries()) {
        const point = points[index]
        const gap = distToPath(point.x, point.y, path) - renderer.unit * (1.15 + 0.9)
        assert.ok(gap >= renderer.unit * 0.159, `stage ${stageId} slot ${index} ${width}x${height}: road gap ${gap}`)
        assert.equal(slot.locked, cfg.buildSlots[index].locked, 'Moving a slot cannot change its unlock state')
        assert.equal(slot.leyline, cfg.buildSlots[index].leyline)
        assert.ok(point.x - renderer.left >= renderer.unit * 0.949)
        assert.ok(renderer.left + renderer.boardWidth - point.x >= renderer.unit * 0.949)
        assert.ok(point.y - renderer.top >= renderer.unit * 0.949)
        assert.ok(renderer.top + renderer.boardHeight - point.y >= renderer.unit * 0.949)
        for (let j = 0; j < index; j++) {
          assert.ok(Math.hypot(point.x - points[j].x, point.y - points[j].y) >= renderer.unit * 2.499, 'Build slots must not crowd each other')
        }
        for (const trap of cfg.traps) {
          const t = renderer.project(trap.pos)
          assert.ok(Math.hypot(point.x - t.x, point.y - t.y) >= renderer.unit * 2.249, 'A relocated slot must not overlap a trap')
        }
        checkedSlots++
      }
    }
    assert.equal(JSON.stringify(cfg), original, 'Responsive layout must not mutate the campaign configuration')
  }
  console.log(`✓ ${checkedSlots} build slots across 99 stages / 9 resolutions clear roads, traps, other slots and board edges`)
}

// 6. 机关命中点必须落在路径上，否则机关形同虚设
{
  let offPath = 0
  for (let stageId = 1; stageId <= 99; stageId++) {
    const cfg = getStageConfig(stageId)
    for (const trap of cfg.traps) {
      if (distToPath(trap.targetPos.x, trap.targetPos.y, cfg.path) > 0.02) offPath++
    }
  }
  assert.equal(offPath, 0, `${offPath} traps have a target position off the path`)
  console.log('✓ All traps target a position on the stage path')
}

console.log('\nAll path alignment tests passed!')
