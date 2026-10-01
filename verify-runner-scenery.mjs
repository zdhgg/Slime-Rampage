import assert from 'node:assert/strict'
import {
  RunnerScenery,
  SCENERY_CONFIG,
  SCROLL_DEPTH_RATE,
  visibleGates,
  sceneryRandom,
} from './src/game/gameplay/runner/RunnerScenery.js'
import { RunnerRenderer } from './src/game/gameplay/runner/RunnerRenderer.js'

// Node has no <canvas>/<document>: the scenery service must degrade to no-ops
// instead of throwing, so server smoke tests stay hermetic.
const scenery = new RunnerScenery()
scenery.prepare(1600, 900, 2, { horizonY: 140, roadTopWidth: 455 })
assert.equal(scenery.sprites, null, 'bake is skipped without document')
const nullCtx = new Proxy({}, {
  get: (_, name) => (...args) => (String(name).includes('Gradient') ? { addColorStop() {} } : undefined),
  set: () => true,
})
scenery.drawSkyline(nullCtx, 12)
scenery.drawClusters(nullCtx, 12)
scenery.drawFogBand(nullCtx, 'A', { sky: '#07131d', horizon: '#1b3540' })
scenery.drawGate(nullCtx, 800, 500, 400, 176)
scenery.drawLampGlow(nullCtx, 100, 100, 30, 0.5)
scenery.updateMotes(0.4)
scenery.drawMotes(nullCtx, 1.5, { sky: '#07131d', horizon: '#1b3540', accent: '#4fc2d2', lamp: '#e8a860' }, () => 400)
assert.equal(scenery.sprites, null, 'draws never resurrect the bake')

// Same seed must produce the same motes/strips across rebuilds.
const a = new RunnerScenery()
a.prepare(1280, 720, 1)
const b = new RunnerScenery()
b.prepare(1280, 720, 1)
assert.deepEqual(a._motes, b._motes)
const rngA = sceneryRandom(7)
const rngB = sceneryRandom(7)
assert.equal(rngA(), rngB())
assert.equal(rngA(), rngB())

// Gate schedule: deterministic, bounded (perf budget: at most 2 sprite blits),
// and monotonic along the depth axis.
for (const scroll of [0, 0.5, 3.72, 100.5, 1234.5]) {
  const first = visibleGates(scroll)
  const second = visibleGates(scroll)
  assert.deepEqual(first, second, `gate schedule must be deterministic at ${scroll}`)
  assert.ok(first.length <= 2, `too many gates visible at scroll ${scroll}: ${first.length}`)
  for (const gate of first) {
    assert.ok(gate.depth >= 0 && gate.depth <= 1.05)
    const phase = (((gate.gateScroll / SCENERY_CONFIG.gateSpacing) % 1) + 1) % 1
    assert.ok(Math.abs(phase - 0.5) < 1e-9, 'gates sit on a half-spacing phase')
  }
  for (let i = 1; i < first.length; i++) {
    assert.ok(first[i].depth > first[i - 1].depth, 'nearer gates have larger depth')
  }
}
assert.equal(visibleGates(0).length, 1, 'exactly one gate is on screen at scroll 0')
assert.equal(visibleGates(0)[0].depth > 0.2 && visibleGates(0)[0].depth < 0.9, true, 'frame-one gate is not at the player plane')
// scrollDistance is monotonic from 0 in gameplay; negative input is defensive
// only, but must stay deterministic and depth-bounded.
const negative = visibleGates(-5)
assert.deepEqual(negative, visibleGates(-5))
for (const gate of negative) assert.ok(gate.depth >= 0 && gate.depth <= 1.05)

// Config invariants: parallax ordering and a sane gate cadence.
assert.ok(SCENERY_CONFIG.parallaxSkyline < SCENERY_CONFIG.parallaxMidground)
assert.ok(SCENERY_CONFIG.parallaxMidground < 1)
assert.ok(SCENERY_CONFIG.gateSpacing > 0 && SCENERY_CONFIG.gateSpacing <= 1.05 / SCROLL_DEPTH_RATE + 1e-9)
assert.ok(SCENERY_CONFIG.moteCount <= 64, 'mote pool stays inside the frame budget')

// Full-renderer integration: exercise render() against a recording ctx so the
// backdrop rewrite cannot silently throw on real frames.
const gradient = { addColorStop() {} }
const calls = []
const ctx = new Proxy({}, {
  get: (_, name) => (...args) => {
    calls.push(String(name))
    if (String(name).includes('Gradient')) return gradient
    return undefined
  },
  set: (_, name, value) => { calls.push(`set:${String(name)}`); return true },
})
const gameplay = {
  game: { width: 1600, height: 900, dpr: 2, ctx },
  scrollDistance: 26.4,
  visualTime: 8.5,
  reducedMotion: false,
  damageFlash: 0,
  shakeOffset: () => 0,
  entities: [],
  bullets: [],
  enemyProjectiles: [],
  groundFires: [],
  particles: [],
  floatingTexts: [],
  damageNumbers: [],
  rings: [],
  fusionPulse: 0,
  lanePosition: 1,
  currentLane: 1,
  targetLane: 1,
  isFeverActive: false,
  duration: Infinity,
  elapsedTime: 0,
  _getLaneTelemetry: () => [{}, {}, {}],
}
const renderer = new RunnerRenderer(gameplay)
renderer.ensureLayout()
assert.equal(renderer.scenery.sprites, null)
assert.ok(renderer._vignette, 'vignette gradient is cached at layout time')
renderer.render(ctx)
renderer.render(ctx)
assert.ok(calls.includes('fillRect'), 'render fills the backdrop')
assert.ok(calls.some(name => name.startsWith('set:globalAlpha')), 'layered alpha is used')
assert.equal(renderer.scenery._motes.length, SCENERY_CONFIG.moteCount)

// Layout change must re-run preparation without duplicating state.
gameplay.game.width = 1920
renderer.ensureLayout()
assert.equal(renderer.scenery.width, 1920)
const before = renderer.scenery._motes.length
renderer.ensureLayout()
assert.equal(renderer.scenery._motes.length, before, 'stable layout must not re-scatter motes')

console.log('✓ runner scenery: node-safe bake, deterministic gates/motes, full-render smoke')
