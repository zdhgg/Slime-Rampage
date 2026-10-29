import assert from 'node:assert/strict'
import { createArena, dispose, ctx2d, spawnBoss } from './test-support/arena-fixture.mjs'
import { EXPEDITION_BOSSES } from './src/game/RunRules.js'

let scenarios = 0
const encounters = [null, ...Object.values(EXPEDITION_BOSSES)]
function setup(encounter, type = 'boss-knight') {
  const g = createArena()
  g.mapFeatures.barricades = []
  g.mapFeatures.speedMultiplierAt = () => 1
  const b = encounter ? g.enemyManager.beginExpeditionStageBoss(encounter) : spawnBoss(g, 300, type)
  b.x = 900; b.y = 900; b.facing = 0
  g.player.x = 1000; g.player.y = 900
  return { g, b }
}
function finite(b) {
  const a = b.attackPresentation
  for (const key of ['progress', 'clock', 'attackRemaining']) assert.ok(Number.isFinite(a[key]), key)
  assert.ok(a.progress >= 0 && a.progress <= 1)
  assert.ok(Object.isFrozen(a))
  assert.equal(b.combatInfo.castProgress, a.stage === 'telegraph' ? a.progress : 0)
  assert.ok(b.combatInfo.special.includes(a.name))
}
function clean(b) {
  assert.equal(b.specialState, 'idle')
  assert.equal(b.specialTimer, 0)
  assert.equal(b.specialDuration, 0)
  assert.equal(b._attackAnim, 0)
  assert.equal(b.dashHit, false)
  assert.equal(b._specialAttackEvent, null)
  if (b._cast !== undefined) assert.equal(b._cast, null)
  if (b._fx !== undefined) assert.equal(b._fx, null)
  if (b.skillData) assert.deepEqual(b.skillData, {})
}
for (const fps of [15, 30, 60, 120]) for (const encounter of encounters) for (const phase of [1, 2]) {
  const { g, b } = setup(encounter)
  try {
    b.phase = phase
    const hits = new Map()
    g.player.hit = (_damage, event) => hits.set(event, (hits.get(event) || 0) + 1)
    finite(b)
    b._startSpecial()
    const initial = b.attackPresentation
    for (const dt of [0, -1, NaN, Infinity]) { b.update(dt); assert.deepEqual(b.attackPresentation, initial) }
    const timer = b.specialTimer, clock = b._animClock
    b.freeze = 1
    b.update(.25)
    assert.equal(b.specialTimer, timer)
    assert.equal(b._animClock, clock)
    b.freeze = 0
    for (let i = 0; i < fps * 6; i++) {
      const beforeState = b.specialState, beforeHits = [...hits.values()].reduce((a, v) => a + v, 0)
      b.update(1 / fps)
      finite(b)
      const afterHits = [...hits.values()].reduce((a, v) => a + v, 0)
      if (afterHits > beforeHits) assert.ok(['telegraph', 'dash'].includes(beforeState))
      if (b.specialState === 'recover') break
    }
    assert.equal(b.specialState, 'recover')
    for (const count of hits.values()) assert.equal(count, 1, 'one settlement per attack event')
    const count = [...hits.values()]
    // Rendering and snapshot reads must not change combat state (gradient cache is visual only).
    b.render(ctx2d)
    const { _shadowGrad, game, ...before } = b
    const beforeSnapshot = structuredClone(before)
    for (let i = 0; i < 3; i++) { b.render(ctx2d); finite(b) }
    const { _shadowGrad: afterGradient, game: afterGame, ...after } = b
    assert.deepEqual(after, beforeSnapshot)
    assert.deepEqual([...hits.values()], count)
    b.cancelAttack(); clean(b)
    const previousClock = b._animClock
    b.specialCd = 100; b.update(1 / fps)
    assert.ok(Math.abs(b._animClock - previousClock - 1 / fps) < 1e-9)
    b._startSpecial(); b._enterPhaseTwo()
    clean(b)
    assert.equal(b.attackPresentation.stage, 'phase')
    b.phaseShift = 0; b._startSpecial()
    b.hit(b.maxHp * 2); clean(b)
    assert.equal(b.attackPresentation.stage, 'dead')
    const deadClock = b._animClock
    b.update(1); assert.equal(b._animClock, deadClock)
    scenarios++
  } finally { dispose(g) }
}
for (const fps of [15, 30, 60, 120]) {
  const { g, b } = setup(EXPEDITION_BOSSES.border_warden)
  try {
    b.x = 600; g.player.x = 900
    let hits = 0
    g.player.hit = () => hits++
    b._startSpecial()
    assert.equal(b._cast.kind, 'charge')
    for (let i = 0; i < fps * 3 && !hits; i++) b.update(1 / fps)
    assert.equal(hits, 1)
    assert.equal(b._cast.hit, true)
    const c = b._cast, travel = c.travel, remaining = b._attackAnim
    b.freeze = 1; b.update(.5)
    assert.equal(c.travel, travel)
    assert.equal(c.hit, true)
    assert.equal(b._attackAnim, remaining)
    b.freeze = 0
    for (let i = 0; i < fps * 2 && b.specialState !== 'recover'; i++) b.update(1 / fps)
    assert.equal(hits, 1)
    const window = b.vulnerableTimer
    b.freeze = 1; b.update(.5)
    assert.equal(b.vulnerableTimer, window)
    b.cancelAttack(); clean(b)
  } finally { dispose(g) }
}
for (const encounter of encounters) {
  const { g, b } = setup(encounter)
  try {
    b._startSpecial()
    g.enemyManager.reset()
    clean(b); assert.equal(b.active, false)
    assert.equal(g.enemyManager.enemies.length, 0)
  } finally { dispose(g) }
}
for (const type of ['boss-knight', 'boss-mage', 'boss-archer', 'boss-final', 'boss-expedition']) {
  for (const fps of [15, 30, 60, 120]) {
    const { g, b } = setup(null, type)
    try {
      b.specialCd = 100
      for (let i = 0; i < fps; i++) b.update(1 / fps)
      assert.ok(Math.abs(b._animClock - 1) < 1e-9)
      finite(b)
    } finally { dispose(g) }
  }
}
console.log(`Boss animation compatibility: ${scenarios} attack/lifecycle scenarios, 13 resets and 20 clock checks passed`)
