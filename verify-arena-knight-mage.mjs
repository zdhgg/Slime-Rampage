// Contract tests for the enemy art system (all nine ordinary roles on current-r2).
// Headless: canvases are recorders, so this checks structure, units and wiring,
// not pixels. Pixel/proportion review lives in test-support/enemy-art-board.*.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const gradient = { addColorStop() {} }
function recorder() {
  const log = [], state = { globalAlpha: 1, globalCompositeOperation: 'source-over' }
  return new Proxy({}, {
    get(_t, k) {
      if (k === '__log') return log
      if (k === '__state') return state
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => gradient
      if (k in state) return state[k]
      return (...args) => { log.push([k, args]) }
    },
    set(_t, k, v) { state[k] = v; log.push([`set:${k}`, v]); return true },
  })
}
let created = []
class FakeCanvas {
  constructor(w, h) { this.width = w; this.height = h; this.id = created.length; this.ctx = recorder(); created.push(this) }
  getContext() { return this.ctx }
}

const { ENEMY_CAST, ENEMY_PAL, enemyFramePose } = await import('./src/game/enemy-art/enemy-cast.js')
const R = await import('./src/game/EnemyArtRenderer.js')
const { K, setScale } = await import('./src/game/slime-art/slime-painter.js')
const TAU = Math.PI * 2
const TYPES = ['knight', 'mage', 'hound', 'assassin', 'archer', 'priest', 'berserker', 'golem', 'wraith']
const UNMIGRATED = ['boss_knight', 'boss_mage', 'boss_archer']
assert.deepEqual(Object.keys(ENEMY_CAST), TYPES, 'registry lists exactly the migrated roster')

/* ---- registry + every frame draws at combat, elite and portrait sizes ---- */
for (const type of TYPES) {
  const cast = ENEMY_CAST[type]
  assert.ok(R.hasEnemyArt(type))
  // surface 下限 64px：画布尺寸按实测包围盒取，小体型职业（怨灵 64）在 2x 档仍有 128 设备像素
  assert.ok(cast.baseR > 0 && cast.scale > 1 && cast.surface >= 64 && cast.feetY > 0 && cast.shadowRx > 0)
  assert.equal(new Set(cast.frames.map(([key]) => key)).size, cast.frames.length, `${type} frame keys are unique`)
  for (const r of [cast.baseR * cast.scale, (cast.baseR + 3) * cast.scale, 100]) {
    for (const [key, state] of cast.frames) {
      const ctx = recorder()
      setScale(r)
      ctx.save(); ctx.scale(r / 100, r / 100); cast.draw(ctx, state); ctx.restore()
      assert.ok(ctx.__log.length > 40, `${type}/${key}/r${r} should emit canvas calls`)
    }
  }
}
for (const type of UNMIGRATED) assert.equal(R.hasEnemyArt(type), false)
assert.equal(R.hasEnemyArt('boss-knight'), false)
assert.ok(typeof ENEMY_PAL.steel.base === 'string' && ENEMY_PAL.eyeInk)

/* ---- every reachable frame key exists; walk phase is in radians (engine _walkT) ---- */
const STANCES = [null, 'stalking', 'charging', 'dashing', 'cooldown']
const sweep = { moving: [true, false], swing: [-1, 0, .5, 1], windup: [false, true], casting: [null, 'charge', 'fire', 'heal'], stance: STANCES, enraged: [false, true], walkT: [-7, -1, 0, .3, 1.7, 3.4, 6.2, 40, 123.4, ...Array.from({ length: 16 }, (_, i) => i * .45)] }
for (const type of TYPES) {
  const cast = ENEMY_CAST[type], keys = new Set(cast.frames.map(([key]) => key)), seen = new Set()
  for (const moving of sweep.moving) for (const swing of sweep.swing) for (const windup of sweep.windup) for (const casting of sweep.casting) for (const stance of sweep.stance) for (const enraged of sweep.enraged) for (const walkT of sweep.walkT) {
    const key = cast.frameKey({ moving, swing, windup, casting, stance, enraged, walkT })
    assert.ok(keys.has(key), `${type}: frameKey returned unknown "${key}"`)
    seen.add(key)
  }
  assert.deepEqual([...seen].sort(), [...keys].sort(), `${type}: every frame is reachable`)
  assert.equal(cast.frameKey({}), 'idle')
}
const moveOf = (type, walkT, extra = {}) => ENEMY_CAST[type].frameKey({ moving: true, walkT, ...extra })
const quarter = Math.PI / 2 + .01
for (const type of TYPES) {
  const gait = ENEMY_CAST[type].gait || 1
  assert.deepEqual([0, quarter, Math.PI + .01, Math.PI * 1.5 + .01, TAU + .01].map(w => moveOf(type, w / gait)), ['move0', 'move1', 'move2', 'move3', 'move0'], `${type}: walkT is radians, one gait cycle = 2π / gait`)
  assert.equal(moveOf(type, -Math.PI / 2 / gait), 'move3', `${type}: negative phases wrap`)
  assert.equal(moveOf(type, (10 * TAU + Math.PI + .01) / gait), moveOf(type, (Math.PI + .01) / gait), `${type}: phase is periodic`)
  assert.equal(ENEMY_CAST[type].frames.find(([k]) => k === 'move1')[1].phase, .25, `${type}: cached move frames sit at quarter-cycle phases`)
}
assert.equal(ENEMY_CAST.hound.gait, 1.6); assert.equal(ENEMY_CAST.assassin.gait, 1.4)
assert.equal(ENEMY_CAST.berserker.gait, 1.25); assert.equal(ENEMY_CAST.wraith.gait, 1.1); assert.equal(ENEMY_CAST.golem.gait, .8)
assert.equal(moveOf('knight', 2 * quarter / 1.6) === moveOf('hound', 2 * quarter / 1.6), false, 'fast units cycle their gait faster than the raw walk clock')
assert.equal(moveOf('knight', TAU * .3) === moveOf('golem', TAU * .3), false, 'the golem stomps slower than the raw walk clock')

/* per-type pose mapping from read-only combat state */
assert.equal(ENEMY_CAST.knight.frameKey({ moving: true, swing: .3, windup: true, walkT: 2 }), 'strike', 'strike outranks windup and walking')
assert.equal(ENEMY_CAST.knight.frameKey({ windup: true }), 'windup')
assert.equal(ENEMY_CAST.hound.frameKey({ moving: true, swing: .3, windup: true, walkT: 2 }), 'bite')
assert.equal(ENEMY_CAST.hound.frameKey({ windup: true }), 'crouch')
assert.equal(ENEMY_CAST.mage.frameKey({ moving: true, casting: 'fire', walkT: 2 }), 'fire')
assert.equal(ENEMY_CAST.mage.frameKey({ casting: 'charge' }), 'charge')
assert.equal(ENEMY_CAST.archer.frameKey({ moving: true, casting: 'fire', walkT: 2 }), 'release')
assert.equal(ENEMY_CAST.archer.frameKey({ casting: 'charge' }), 'draw')
assert.equal(ENEMY_CAST.assassin.frameKey({ stance: 'dashing', moving: true, walkT: 1 }), 'dash')
assert.equal(ENEMY_CAST.assassin.frameKey({ stance: 'charging' }), 'charge')
assert.equal(ENEMY_CAST.assassin.frameKey({ stance: 'cooldown', moving: false }), 'dazed')
assert.match(ENEMY_CAST.assassin.frameKey({ stance: 'cooldown', moving: true, walkT: 1 }), /^move\d$/, 'recovering assassins walk again')
assert.match(ENEMY_CAST.assassin.frameKey({ stance: 'stalking', moving: true, walkT: 1 }), /^move\d$/)
assert.equal(ENEMY_CAST.assassin.frameKey({ stance: 'stalking', moving: false }), 'idle')
assert.equal(ENEMY_CAST.priest.frameKey({ casting: 'heal' }), 'heal')
assert.equal(ENEMY_CAST.priest.frameKey({ moving: true, casting: 'heal', walkT: 1 }), 'heal', 'healing outranks floating drift')
assert.equal(ENEMY_CAST.priest.frameKey({ casting: 'charge' }), 'idle', 'the priest ignores mage cast states')
assert.equal(ENEMY_CAST.berserker.frameKey({ swing: .3 }), 'swing')
assert.equal(ENEMY_CAST.berserker.frameKey({ enraged: true }), 'r_idle')
assert.equal(ENEMY_CAST.berserker.frameKey({ enraged: true, swing: .3 }), 'r_swing')
assert.match(ENEMY_CAST.berserker.frameKey({ enraged: true, moving: true, walkT: 1 }), /^r_move\d$/, 'enraged frames are separate cache keys')
assert.equal(ENEMY_CAST.berserker.frameKey({ moving: true, walkT: TAU * .3 / 1.25 }), 'move1', 'gait 1.25 speeds the berserker cycle up')
assert.equal(ENEMY_CAST.golem.frameKey({ swing: .2 }), 'windup', 'the first half of the golem swing raises the fist')
assert.equal(ENEMY_CAST.golem.frameKey({ swing: .8 }), 'slam', 'the second half slams it down')
assert.equal(ENEMY_CAST.wraith.frameKey({ swing: .4 }), 'grasp')
assert.equal(ENEMY_CAST.wraith.frameKey({ moving: true, swing: -1, walkT: TAU * .3 / 1.1 }), 'move1')

/* ---- motion overlay: bounded, finite, driven only by passed-in clocks ---- */
for (const type of TYPES) {
  for (const moving of [true, false]) for (const swing of [-1, 0, .5, 1]) for (const windup of [false, true]) for (const casting of [null, 'charge', 'fire', 'heal']) for (const stance of STANCES) for (const enraged of [false, true]) for (const hurt of [0, .4, 1, 5]) {
    const m = R.enemyArtMotion(type, { moving, swing, windup, casting, stance, enraged, hurt, walkT: 1.3, time: 7.7, seed: 2 })
    for (const v of Object.values(m)) assert.ok(Number.isFinite(v))
    assert.ok(m.sy > .8 && m.sy < 1.15 && m.sx > .85 && m.sx < 1.15, `${type} squash stays subtle`)
    assert.ok(Math.abs(m.dx) < 8 && Math.abs(m.dy) < 3)
  }
}
assert.equal(R.enemyArtMotion('mage', { moving: true, walkT: 1.6 }).dy, 0, 'floating units keep their own float instead of a step bob')
assert.equal(R.enemyArtMotion('priest', { moving: true, walkT: 1.6 }).dy, 0, 'the priest floats too')
assert.equal(R.enemyArtMotion('wraith', { moving: true, walkT: 1.6 }).dy, 0, 'the wraith drifts instead of stepping')
assert.ok(R.enemyArtMotion('golem', { moving: true, walkT: 1.6 }).dy < 0, 'the golem still stomps')
assert.ok(R.enemyArtMotion('knight', { moving: true, walkT: 1.6 }).dy < 0, 'walking knights lift at mid-stride')
assert.ok(R.enemyArtMotion('priest', { casting: 'heal' }).dy < 0, 'a healing priest rises a little')
assert.ok(R.enemyArtMotion('berserker', { enraged: true, time: 3 }).dx !== 0, 'rage adds a tremor')
assert.ok(R.enemyArtMotion('knight', { swing: .5 }).dx > 0, 'a slash lunges toward the facing side')
assert.ok(R.enemyArtMotion('knight', { hurt: 1 }).dx < 0, 'a hit recoils away from the facing side')
{
  const dash = R.enemyArtMotion('assassin', { moving: true, stance: 'dashing', walkT: 1.6, time: 3 })
  assert.equal(dash.dy, 0); assert.equal(dash.sy, 1, 'a dash keeps its stretched pose instead of bobbing')
  assert.ok(R.enemyArtMotion('assassin', { moving: true, stance: 'stalking', walkT: 1.6 / 1.4 }).dy < 0, 'stalking assassins still bob')
}

/* ---- ground shadow pins to the ground contact line ---- */
{
  const knight = recorder(), mage = recorder(), lifted = recorder()
  R.drawEnemyShadow(knight, 'knight', 100, 200, 14)
  R.drawEnemyShadow(mage, 'mage', 100, 200, 13)
  R.drawEnemyShadow(lifted, 'mage', 100, 200, 13, { lift: 8 })
  const e = c => c.__log.find(([k]) => k === 'ellipse')[1]
  const feet = R.enemyArtFeet('knight', 14)
  assert.equal(e(knight)[0], 100); assert.ok(Math.abs(e(knight)[1] - (200 + feet + 1)) < 1e-9)
  assert.ok(e(knight)[3] < e(knight)[2] * .3, 'shadow is a flat ellipse')
  assert.ok(e(lifted)[2] < e(mage)[2], 'higher float shrinks the shadow')
  assert.equal(R.drawEnemyShadow(recorder(), 'boss_knight', 0, 0, 13), false)
  for (const type of TYPES) {
    const r = ENEMY_CAST[type].baseR, f = R.enemyArtFeet(type, r), low = ENEMY_CAST[type].floats ? .6 : .85
    assert.ok(f > r * low && f < r * 1.8, `${type}: ground line sits near the bottom of the collision circle`)
    const c = recorder(); R.drawEnemyShadow(c, type, 0, 0, r)
    const [, , rx, ry] = e(c)
    assert.ok(ry < rx * .3 && rx > r * .6 && rx < r * 3.2, `${type}: shadow is a flat ellipse comparable to the body width`)
  }
}

/* ---- no canvas available: realtime fallback still draws, and leaves painter state alone ---- */
{
  delete globalThis.OffscreenCanvas
  R.resetEnemyFrameCachesForTests()
  setScale(26, { blink: true })
  const before = { ...K }
  for (const type of TYPES) {
    const ctx = recorder()
    assert.equal(R.drawEnemyArt(ctx, type, ENEMY_CAST[type].baseR, { moving: true, walkT: 1 }, 1), 'realtime')
    assert.ok(ctx.__log.length > 40)
  }
  assert.deepEqual({ ...K }, before, 'drawing must not leak painter scale/face flags into slime rendering')
  assert.equal(R.drawEnemyArt(recorder(), 'boss_knight', 13, {}, 1), false)
}

/* ---- frame cache: fixed count, two resolution tiers, white twin, never per entity ---- */
{
  globalThis.OffscreenCanvas = FakeCanvas
  R.resetEnemyFrameCachesForTests()
  created = []
  setScale(26, { blink: true })
  const before = { ...K }
  for (const type of TYPES) {
    const cast = ENEMY_CAST[type], n = cast.frames.length * (cast.variants || 1)
    const snap = R.getEnemyFrameCache(type).snapshot()
    assert.equal(snap.frameCount, n)
    assert.deepEqual(snap.frameKeys, cast.frames.flatMap(([k]) => cast.variants > 1 ? [k, ...Array.from({ length: cast.variants - 1 }, (_, i) => `${k}#v${i + 1}`)] : [k]))
    assert.equal(created.length, n * 2, `${type}: one image and one white twin per frame`)
    assert.ok(created.every(c => c.width === cast.surface && c.height === cast.surface), '1x tier = surface px')
    const twin = created[1]
    assert.equal(twin.ctx.__state.globalCompositeOperation, 'source-atop')
    assert.equal(twin.ctx.__state.fillStyle, '#ffffff')
    assert.ok(twin.ctx.__log.some(([k]) => k === 'drawImage'))
    created = []
    for (let i = 0; i < 300; i++) {
      const ctx = recorder()
      R.drawEnemyArt(ctx, type, cast.baseR + (i % 5), { moving: i % 2 === 0, walkT: i * .37, swing: i % 7 === 0 ? .4 : -1, windup: i % 11 === 0, casting: i % 5 === 0 ? 'fire' : null, stance: i % 4 === 0 ? 'dashing' : 'stalking', hurt: i % 3 === 0 ? 1 : 0, time: i }, 1)
    }
    assert.ok(created.length <= 1, `${type}: drawing many entities builds at most the shared tint scratch`)
    R.getEnemyFrameCache(type).draw(recorder(), 'idle', 1, 10, 2)
    assert.ok(created.length <= n * 2 + 1, `${type}: 2x tier builds once (+ the tier's tint scratch)`)
    const tier2 = R.getEnemyFrameCache(type).tiers.get(2)
    assert.ok([...tier2.values()].every(f => f.img.width === cast.surface * 2), `${type}: 2x tier frames are 2x size`)
    const tier2Count = created.length
    R.getEnemyFrameCache(type).draw(recorder(), 'idle', 1, 10, 1.5)
    R.getEnemyFrameCache(type).draw(recorder(), 'idle', 1, 10, 2)
    assert.equal(created.length, tier2Count, `${type}: tiers are reused`)
    created = []
  }
  assert.deepEqual({ ...K }, before, 'cache build restores painter state')
  assert.equal(R.enemyArtTier(1), 1); assert.equal(R.enemyArtTier(1.25), 2); assert.equal(R.enemyArtTier(2), 2)

  // hit flash overlays the current pose; destination size is tier independent
  const knight = ENEMY_CAST.knight
  const flat = recorder()
  R.drawEnemyArt(flat, 'knight', 14, { hurt: 1, seed: .5 }, 1) // seed .5 picks the untinted lane
  const imgs = flat.__log.filter(([k]) => k === 'drawImage')
  assert.equal(imgs.length, 2, 'base frame plus white twin')
  assert.ok(imgs[0][1][0] !== imgs[1][1][0])
  assert.equal(imgs[0][1][3], knight.surface); assert.equal(imgs[1][1][3], knight.surface)
  const hi = recorder()
  R.drawEnemyArt(hi, 'knight', 14, { hurt: 1 }, 2)
  assert.equal(hi.__log.filter(([k]) => k === 'drawImage')[0][1][3], knight.surface, '2x tier keeps the CSS size')
  const elite = recorder()
  R.drawEnemyArt(elite, 'knight', 17, {}, 1)
  assert.ok(Math.abs(elite.__log.find(([k]) => k === 'drawImage')[1][3] - knight.surface * 17 / 14) < 1e-9, 'elite scales the same frame')
  assert.equal(R.drawEnemyArt(recorder(), 'knight', 14, { hurt: 0 }, 1), 'cache')
}

/* ---- engine integration: Enemy.render and the dissolve channels ---- */
{
  globalThis.OffscreenCanvas = FakeCanvas
  R.resetEnemyFrameCachesForTests()
  created = []
  const { createArena, spawn, dispose } = await import('./test-support/arena-fixture.mjs')
  const { AssetManager } = await import('./src/game/AssetManager.js')
  const game = createArena('origin')
  const assets = AssetManager.getInstance(), drawn = [], assetDraw = assets.draw
  assets.draw = function (ctx, key, ...rest) { drawn.push(key); return assetDraw.call(this, ctx, key, ...rest) }
  // The asset manager also blits its own sprites (e.g. the magic circle), so only count cache frames.
  const cacheImages = () => new Set(TYPES.flatMap(type => [1, 2].flatMap(tier => [...(R.getEnemyFrameCache(type).tiers.get(tier)?.values() || [])].flatMap(f => [f.img, f.flash]))))
  const artImages = ctx => { const own = cacheImages(); return ctx.__log.filter(([k, a]) => k === 'drawImage' && own.has(a[0])) }
  const frameOf = (ctx, type) => {
    const call = artImages(ctx)[0]
    if (!call) return null
    for (const [key, frame] of R.getEnemyFrameCache(type).build(1)) if (frame.img === call[1][0]) return key.split('#')[0]
    return null
  }
  const clocks = e => [e.hp, e._walkT, e._swingT, e._shootFlash, e.attackCd, e.facing, e.x, e.y, e.flash, e._moving, e.assassinState, e._dashTimer, e._chargeTimer, e._healBeamTimer, e.isEnraged, e._artSeed]
  const half = Math.PI / 2 + .01
  // [label, state written by the test, expected frame, magic circle expected]
  const CASES = {
    knight: [
      ['idle', { attackCd: 1 }, 'idle'],
      ['walk', { _moving: true, _walkT: half }, 'move1'],
      ['windup', { attackCd: .2 }, 'windup'],
      ['strike', { _swingT: .1 }, 'strike'],
    ],
    hound: [
      ['idle', { attackCd: .5 }, 'idle'],
      ['run', { _moving: true, _walkT: half / 1.6 }, 'move1'],
      ['crouch', { attackCd: .2 }, 'crouch'],
      ['bite', { _swingT: .1 }, 'bite'],
    ],
    mage: [
      ['idle', { attackCd: 1.5 }, 'idle', false],
      ['approach with stale cooldown', { _moving: true, attackCd: .3, _walkT: Math.PI + .01 }, 'move2', false],
      ['charge', { attackCd: .3 }, 'charge', true],
      ['fire', { _shootFlash: .1, attackCd: 2.4 }, 'fire', true],
    ],
    archer: [
      ['idle', { attackCd: 1 }, 'idle'],
      ['walk', { _moving: true, _walkT: half }, 'move1'],
      ['approach with stale cooldown', { _moving: true, attackCd: .3, _walkT: Math.PI + .01 }, 'move2'],
      ['draw', { attackCd: .3 }, 'draw'],
      ['release', { _shootFlash: .1, attackCd: 1.9 }, 'release'],
    ],
    assassin: [
      ['stalking idle', { assassinState: 'stalking' }, 'idle'],
      ['stalking run', { assassinState: 'stalking', _moving: true, _walkT: half / 1.4 }, 'move1'],
      ['charging', { assassinState: 'charging' }, 'charge'],
      ['dashing', { assassinState: 'dashing', _moving: true }, 'dash'],
      ['cooldown daze', { assassinState: 'cooldown' }, 'dazed'],
      ['cooldown recovery', { assassinState: 'cooldown', _moving: true, _walkT: half / 1.4 }, 'move1'],
    ],
    priest: [
      ['idle', { attackCd: 1 }, 'idle', false],
      ['drift', { _moving: true, _walkT: half }, 'move1'],
      ['heal', { _healBeamTimer: .5 }, 'heal', false],
    ],
    berserker: [
      ['idle', { attackCd: 1 }, 'idle'],
      ['walk', { _moving: true, _walkT: half / 1.25 }, 'move1'],
      ['swing', { _swingT: .1 }, 'swing'],
      ['enraged idle', { isEnraged: true }, 'r_idle'],
      ['enraged swing', { isEnraged: true, _swingT: .1 }, 'r_swing'],
      ['enraged walk', { isEnraged: true, _moving: true, _walkT: half / 1.25 }, 'r_move1'],
    ],
    golem: [
      ['idle', { attackCd: 1 }, 'idle'],
      ['stomp', { _moving: true, _walkT: half / .8 }, 'move1'],
      ['windup', { _swingT: .28 }, 'windup'],
      ['slam', { _swingT: .1 }, 'slam'],
    ],
    wraith: [
      ['idle', { attackCd: 1 }, 'idle'],
      ['drift', { _moving: true, _walkT: half / 1.1 }, 'move1'],
      ['grasp', { _swingT: .1 }, 'grasp'],
    ],
  }
  const REST = { _moving: false, _swingT: 0, _shootFlash: 0, attackCd: 1, flash: 0, assassinState: 'stalking', facing: 0, _healBeamTimer: 0, isEnraged: false, _artSeed: 0, isElite: false }
  try {
    const units = {}
    TYPES.forEach((type, i) => { units[type] = spawn(game, { type, x: 200 * (i % 2 ? -1 : 1), y: 120 * i - 240 }); units[type]._spawnT = 0 })
    for (const type of TYPES) {
      const e = units[type]
      for (const [name, setup, expected, circle] of CASES[type]) {
        Object.assign(e, REST, setup)
        drawn.length = 0
        const before = clocks(e), ctx = recorder()
        e.render(ctx)
        assert.deepEqual(clocks(e), before, `${type} ${name}: rendering is read-only for combat clocks`)
        assert.equal(frameOf(ctx, type), expected, `${type} ${name} pose`)
        if (circle !== undefined) assert.equal(drawn.includes('vfx_magic_circle'), circle, `${type} ${name}: magic circle only while charging or firing`)
        const shadow = ctx.__log.find(([k]) => k === 'ellipse')[1]
        assert.equal(shadow[0], e.x)
        const mul = R.enemySizeMul(e._artSeed, e.isElite)
        assert.ok(Math.abs(shadow[1] - (e.y + R.enemyArtFeet(type, e.radius * mul) + 1)) < 1e-9, `${type} ${name}: shadow at the ground line`)
      }
      // hit flash = cached white twin over the current pose, no legacy white circle
      Object.assign(e, REST, { flash: .1 })
      const hurt = recorder(); e.render(hurt)
      assert.equal(artImages(hurt).length, 2, `${type}: hit flash is the cached white twin`)
      assert.equal(hurt.__log.filter(([k]) => k === 'ellipse').length, 1, `${type}: no legacy white circle (only the shadow ellipse)`)
      // left-facing units flip horizontally
      Object.assign(e, REST, { facing: Math.PI })
      const left = recorder(); e.render(left)
      assert.ok(left.__log.some(([k, a]) => k === 'scale' && a[0] === -1 && a[1] === 1), `${type}: left-facing units flip horizontally`)
      // DPR 2 draws from the 2x tier
      Object.assign(e, REST); game.dpr = 2
      const dpr2 = recorder(); e.render(dpr2)
      game.dpr = 1
      const tier2 = R.getEnemyFrameCache(type).tiers.get(2)
      assert.ok(tier2 && [...tier2.values()].every(f => f.img.width === ENEMY_CAST[type].surface * 2), `${type}: DPR 2 builds the 2x tier`)
      assert.ok(artImages(dpr2).length >= 1 && artImages(dpr2).every(([, a]) => [...tier2.values()].some(f => f.img === a[0] || f.flash === a[0])), `${type}: DPR 2 draws from the 2x tier`)
    }

    // P3: per-instance variety — deterministic per seed, bounded, cache-friendly
    {
      assert.equal(R.enemySizeMul(3.1, false), R.enemySizeMul(3.1, false), 'size jitter is deterministic per seed')
      for (const s of [0, .8, 1.9, 3.3, 4.7, 6.2, 42]) {
        const m = R.enemySizeMul(s, false)
        assert.ok(m >= .96 && m <= 1.04, `size jitter stays within ±4% (seed ${s})`)
      }
      assert.ok(R.enemySizeMul(2, true) > 1.04, 'elites are visibly bulkier than the biggest normal unit')
      assert.equal(ENEMY_CAST.knight.variants, 3, 'the crowd unit bakes three plume silhouettes')
      const ks = R.getEnemyFrameCache('knight').snapshot()
      assert.ok(ks.frameKeys.includes('idle#v1') && ks.frameKeys.includes('idle#v2'), 'knight variant frames are cached')
      for (const t of TYPES.filter(t => t !== 'knight')) assert.ok(!ENEMY_CAST[t].variants || ENEMY_CAST[t].variants === 1, `${t} keeps a single-silhouette cache`)

      // the hue wash uses the silhouette mask + 'hue' composite; ~a third of seeds stay untinted
      const probeSeeds = [0, .5, 1, 1.7, 2.3, 3.9]
      const plainSeed = probeSeeds.find(s => !R.enemyArtTint(s))
      const tintSeed = probeSeeds.find(s => R.enemyArtTint(s))
      assert.ok(plainSeed !== undefined && tintSeed !== undefined, 'tint table mixes plain and tinted seeds')
      const tctx = recorder()
      R.drawEnemyArt(tctx, 'mage', 13, { seed: tintSeed }, 1)
      assert.ok(tctx.__log.some(([k, a]) => k === 'set:globalCompositeOperation' && a === 'hue'), 'tinted units wash through the hue composite')
      // elite rim: an enlarged golden silhouette behind the sprite (scratch blit before the frame)
      const ectx = recorder(), pctx = recorder()
      R.drawEnemyArt(ectx, 'knight', 14, { seed: plainSeed, elite: true }, 1)
      R.drawEnemyArt(pctx, 'knight', 14, { seed: plainSeed }, 1)
      const eImgs = ectx.__log.filter(([k]) => k === 'drawImage'), pImgs = pctx.__log.filter(([k]) => k === 'drawImage')
      assert.equal(pImgs.length, 1, 'plain draw is a single frame blit')
      assert.equal(eImgs.length, 2, 'elite draw adds the golden rim blit')
      assert.ok(eImgs[0][1][3] > eImgs[1][1][3], 'the rim blit is enlarged around the sprite')

      // _artState derives variety inputs from existing fields only
      const va = spawn(game, { type: 'knight', x: 500, y: 500 }), vb = spawn(game, { type: 'knight', x: 520, y: 520 })
      va._walkT = vb._walkT = 2; va._artSeed = 1; vb._artSeed = 3
      assert.equal(va._artState().walkT - vb._artState().walkT, -2, 'the art walk phase carries the per-instance offset')
      va.isElite = true
      const vaState = va._artState()
      assert.equal(vaState.elite, true)
      assert.equal(vaState.sizeMul, R.enemySizeMul(1, true), 'sizeMul comes from seed + elite only')
      game.enemyManager._enemies.splice(-2)

      // footpoint-Y ordering: the merged pass draws far-to-near and render() skips double-draw
      const em = game.enemyManager, keep = em._enemies
      const order = []
      const stub = (tag, y, type = 'knight', radius = 14) => ({ type, radius, x: 0, y, active: true, render() { order.push(tag) } })
      em._enemies = [stub('south', 130), stub('north', 50)]
      const playerStub = { active: true, radius: 26, x: 0, y: 95, render() { order.push('player') } }
      em.renderBodies(recorder(), playerStub)
      assert.deepEqual(order, ['north', 'player', 'south'], 'bodies draw far-to-near by ground contact y')
      em._enemies = [stub('devoured', 10), stub('walking', 20)]
      em._enemies[0].devouring = true
      order.length = 0
      em.renderBodies(recorder())
      assert.deepEqual(order, ['walking'], 'devouring units stay in the overlay channel')
      order.length = 0
      em.render(recorder())
      assert.deepEqual(order, [], 'render() skips bodies after the merged pass')
      order.length = 0
      em.render(recorder())
      assert.deepEqual(order, ['walking'], 'without a merged pass, render() draws bodies itself')
      em._enemies = keep
    }

    // dissolve channels use the same art (idle frame) instead of the old char_* sprite
    const em = game.enemyManager, dissolving = {}
    for (const type of TYPES) dissolving[type] = spawn(game, { type, x: 40, y: 300 })
    em._enemies.length = 0
    TYPES.forEach((type, i) => { dissolving[type]._routT = .2; dissolving[type]._devourScale = .5; (i % 2 ? em._devouring : em._routing).push(dissolving[type]) })
    em._routing.push({ type: 'boss_knight', radius: 20, x: 40, y: 320, facing: 0, _routT: .1, _devourScale: .5 })
    drawn.length = 0
    const dissolveCtx = recorder()
    em.render(dissolveCtx)
    for (const type of TYPES) assert.ok(!drawn.includes(`char_${type}_0`), `${type}: dissolving units never fall back to the old sprite`)
    assert.ok(drawn.includes('char_boss_knight_0'), 'unmigrated types keep their old sprite')
    assert.equal(artImages(dissolveCtx).length, TYPES.length, 'one idle frame per migrated dissolving unit')
    em._routing.length = 0; em._devouring.length = 0

    // unmigrated types (bosses) get nothing from the new pipeline
    for (const type of UNMIGRATED) {
      assert.equal(R.hasEnemyArt(type), false)
      assert.equal(R.drawEnemyArt(recorder(), type, 14, {}, 1), false, `${type} does not draw through the enemy art bridge`)
      assert.equal(R.drawEnemyShadow(recorder(), type, 0, 0, 14), false, `${type} gets no migrated-art shadow`)
    }
  } finally {
    assets.draw = assetDraw
    dispose(game)
  }
}

/* ---- wiring: the retired knight/mage prototypes are gone and nothing references them ---- */
{
  for (const retired of ['ArenaKnightPrototype', 'ArenaKnightFrameCache', 'ArenaMagePrototype', 'ArenaMageFrameCache']) {
    assert.ok(!fs.existsSync(`./src/game/${retired}.js`), `${retired}.js was retired with enemy art current-r2`)
  }
  const enemy = fs.readFileSync('./src/game/entities/Enemy.js', 'utf8')
  assert.match(enemy, /drawEnemyArt/); assert.match(enemy, /drawEnemyShadow/); assert.match(enemy, /hasEnemyArt/)
  assert.doesNotMatch(enemy, /ArenaKnight|ArenaMage/, 'Enemy must not use the retired prototypes')
  const manager = fs.readFileSync('./src/game/EnemyManager.js', 'utf8')
  assert.match(manager, /_drawDissolving/); assert.match(manager, /hasEnemyArt/); assert.match(manager, /renderBodies/)
  const engine = fs.readFileSync('./src/game/GameEngine.js', 'utf8')
  assert.match(engine, /enemyManager\.renderBodies\(ctx, e\)/, 'the player slot drives the merged y-sorted pass')
}
R.resetEnemyFrameCachesForTests()
console.log(`enemy art verification passed (${TYPES.join(', ')})`)
