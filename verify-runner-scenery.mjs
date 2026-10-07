import assert from 'node:assert/strict'
import {
  RunnerScenery,
  SCENERY_CONFIG,
  SCROLL_DEPTH_RATE,
  visibleGates,
  sceneryRandom,
} from './src/game/gameplay/runner/RunnerScenery.js'
import { RunnerRenderer } from './src/game/gameplay/runner/RunnerRenderer.js'
import { RUNNER_SCENE_PROFILES, runnerSceneProfile } from './src/game/gameplay/runner/RunnerSceneProfiles.js'
import { getRunnerSection } from './src/game/gameplay/runner/RunnerRules.js'

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

for (const [width, height] of [[1280, 720], [390, 844], [667, 375], [320, 640]]) {
  gameplay.game.width = width; gameplay.game.height = height
  renderer.ensureLayout()
  for (const depth of [0, 0.2, 0.5, 0.9, 1.05]) {
    assert.ok(Math.abs(renderer.roadHalfAtY(renderer.depthToY(depth)) * 2 - renderer.roadWidthAt(depth)) < 1e-8,
      'road floor and lane/collision projection agree at every supported size')
  }
}

console.log('✓ runner scenery: node-safe bake, deterministic gates/motes, full-render smoke')

// Follow actual rules at stage boundaries, including endless cycling after
// named waves are exhausted. A missing endless profile used to stay default.
const profileAt = (submode, time) => runnerSceneProfile({ submode, section: getRunnerSection(time, submode) })
assert.equal(new Set(['blitz', 'marathon', 'endless'].map(mode => profileAt(mode, 0).family)).size, 3)
assert.deepEqual([0, 20, 42].map(t => profileAt('blitz', t).theme), ['highway', 'works', 'checkpoint'])
assert.deepEqual([0, 35, 85, 140].map(t => profileAt('marathon', t).theme), ['outskirts', 'ramparts', 'royal', 'citadel'])
assert.deepEqual([0, 30, 60, 90, 120, 150, 180, 240, 300, 360].map(t => profileAt('endless', t).theme), ['ruins', 'ruins', 'tunnel', 'tunnel', 'rift', 'rift', 'ruins', 'tunnel', 'rift', 'ruins'])

// A recording canvas exercises every bake. Stable frames and HUD-only layout
// changes must reuse bitmaps; resizing and DPR changes must rebuild them.
let canvases = 0
globalThis.document = { createElement() { canvases++; return { getContext: () => ctx } } }
try {
  const baked = new RunnerScenery()
  baked.prepare(1280, 720, 2, { horizonY: 120, roadTopWidth: 300 }, RUNNER_SCENE_PROFILES.blitz_outer)
  const first = baked.sprites, count = canvases
  assert.equal(first.scale, 2, 'high-DPI baking uses the actual DPR')
  for (let i = 0; i < 100; i++) baked.prepare(1280, 720, 2, { horizonY: 128, roadTopWidth: 300 }, RUNNER_SCENE_PROFILES.blitz_outer)
  assert.equal(canvases, count, 'no rebaking on stable frames or HUD-only changes')
  for (const profile of Object.values(RUNNER_SCENE_PROFILES).slice(1)) {
    const before = baked.sprites
    baked.prepare(1280, 720, 2, { horizonY: 128, roadTopWidth: 300 }, profile)
    assert.equal(baked.previousSprites, before)
    assert.notEqual(baked.sprites, before)
    baked.transition = 0.5
    baked.drawSkyline(ctx, 2); baked.drawClusters(ctx, 2); baked.drawDestination(ctx); baked.drawGate(ctx, 640, 400, 200, 66)
    baked.finishTransition()
    assert.equal(baked.previousSprites, null, 'completed transitions release the previous district')
  }
  const beforeResize = baked.sprites
  baked.prepare(390, 844, 1, { horizonY: 220, roadTopWidth: 180 })
  assert.notEqual(baked.sprites, beforeResize)
  assert.equal(baked.sprites.scale, 1)
  assert.equal(baked.previousSprites, null, 'resize never blends different-sized strips')

  // Real renderer transition: color/bakes share the clock; reset and reduced
  // motion settle immediately, and long endless sessions retain bounded state.
  gameplay.submode = 'endless'; gameplay.section = getRunnerSection(0, 'endless'); gameplay.visualTime = 1
  renderer.render(ctx)
  gameplay.section = getRunnerSection(60, 'endless'); gameplay.visualTime = 61
  renderer.render(ctx)
  assert.equal(renderer._sceneProgress, 0)
  gameplay.visualTime = 61.6; renderer.render(ctx)
  assert.ok(renderer._sceneProgress > 0.49 && renderer._sceneProgress < 0.51)
  gameplay.visualTime = 62.3; renderer.render(ctx)
  assert.equal(renderer.scenery.previousSprites, null)
  for (let wave = 4; wave < 120; wave += 2) {
    gameplay.section = getRunnerSection(wave * 30, 'endless'); gameplay.visualTime = wave * 30 + 1
    renderer.render(ctx)
    gameplay.visualTime += 1.3; renderer.render(ctx)
    assert.equal(renderer.scenery.previousSprites, null)
    assert.ok(renderer.scenery._fogCache.size <= 4)
  }
  gameplay.reducedMotion = true; gameplay.section = getRunnerSection(60, 'endless'); gameplay.visualTime += 2
  renderer.render(ctx)
  assert.equal(renderer._sceneProgress, 1)
  assert.equal(renderer.scenery.previousSprites, null)
  gameplay.reducedMotion = false; gameplay.submode = 'blitz'; gameplay.visualTime = 0; gameplay.section = getRunnerSection(0, 'blitz')
  renderer.render(ctx)
  assert.equal(renderer._sceneProfile.theme, 'highway')
  assert.equal(renderer._sceneProgress, 1, 'new run does not inherit the prior environment')
} finally { delete globalThis.document }
console.log('✓ runner environments: distinct modes, all stage boundaries, bounded bakes, smooth transitions, reset and reduced motion')
