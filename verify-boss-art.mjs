// Contract tests for the Arena boss art system (current-r2 boss casts).
// Headless: canvases are recorders, so this checks structure, units and wiring,
// not pixels. Pixel/proportion review lives in test-support/boss-art-board.*.
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

const { ENEMY_CAST } = await import('./src/game/enemy-art/enemy-cast.js')
const { BOSS_CAST, bossArtId } = await import('./src/game/enemy-art/boss-cast.js')
const R = await import('./src/game/EnemyArtRenderer.js')
const { K, setScale } = await import('./src/game/slime-art/slime-painter.js')
const TAU = Math.PI * 2
const ENEMIES = ['knight', 'mage', 'hound', 'assassin', 'archer', 'priest', 'berserker', 'golem', 'wraith']
const BOSSES = Object.keys(BOSS_CAST)
const FRAME_KEYS = ['idle', 'move0', 'move1', 'move2', 'move3', 'windup', 'strike', 'recover',
  'r_idle', 'r_move0', 'r_move1', 'r_move2', 'r_move3', 'r_windup', 'r_strike', 'r_recover', 'r_roar']

assert.ok(BOSSES.length > 0, 'boss cast registry is populated')
assert.deepEqual([...BOSSES].sort(), ['boss:archer', 'boss:ash_paladin', 'boss:beacon_engineer', 'boss:border_warden', 'boss:court_commander', 'boss:final', 'boss:gate_marshal', 'boss:hunt_captain', 'boss:knight', 'boss:last_marshal', 'boss:mage', 'boss:nest_inquisitor', 'boss:relic_keeper', 'boss:seal_archbishop', 'boss:throne_guard', 'boss:tomb_regent'].sort(), 'the roster is exactly the 16 boss casts')
assert.deepEqual(Object.keys(ENEMY_CAST), ENEMIES, 'the enemy registry is still exactly the nine roles')
for (const id of BOSSES) assert.ok(R.hasEnemyArt(id), `${id} has art`)
for (const key of ['boss-knight', 'boss_knight', 'boss-final', 'boss-mage', 'boss-archer']) {
  assert.equal(R.hasEnemyArt(key), false, `${key} is a sprite key, not an art cast`)
}

/* ---- per-cast contract: numbers, the fixed 17 frames, unique flag ---- */
for (const id of BOSSES) {
  const cast = BOSS_CAST[id]
  assert.equal(cast.unique, true, `${id}: bosses are unique individuals`)
  assert.equal(cast.baseR, { 'boss:knight': 36, 'boss:mage': 34, 'boss:archer': 34, 'boss:final': 40, 'boss:court_commander': 36 }[id] ?? cast.baseR, `${id}: baseR tracks the collision radius`)
  assert.ok(cast.baseR >= 34 && cast.baseR <= 40, `${id}: boss collision radius range`)
  assert.ok(cast.scale >= 1.05 && cast.scale <= 1.2, `${id}: visual scale ~1.1`)
  assert.ok(cast.baseR * cast.scale >= 40, `${id}: face LOD stays on at combat size`)
  assert.ok((cast.gait || 1) === 0.8, `${id}: heavy boss gait`)
  assert.ok(cast.surface >= 160 && cast.surface <= 242, `${id}: cache surface within memory budget`)
  assert.ok(cast.feetY > 0 && cast.shadowRx > 0)
  const feetPx = cast.feetY * cast.scale * cast.baseR / 100
  assert.ok(feetPx >= cast.baseR * (cast.floats ? .6 : .85) && feetPx <= cast.baseR * 1.8, `${id}: ground line near the collision circle`)
  assert.ok(cast.topY < 0, `${id}: topY points up from the body centre`)
  const top = R.enemyArtTop(id, cast.baseR)
  assert.ok(top >= cast.baseR * 1.8 && top <= cast.baseR * 2.8, `${id}: head top sits 1.8-2.8r above centre (got ${(top / cast.baseR).toFixed(2)}r)`)
  const height = (cast.feetY - cast.topY) * cast.scale * cast.baseR / 100
  assert.ok(height >= cast.baseR * 3.0 && height <= cast.baseR * 3.7, `${id}: drawn height 3.0-3.7r (got ${(height / cast.baseR).toFixed(2)}r)`)
  assert.deepEqual(cast.frames.map(([k]) => k), FRAME_KEYS, `${id}: exactly the 17 shared frame keys in order`)
  for (const r of [cast.baseR * cast.scale, (cast.baseR + 3) * cast.scale, 100]) {
    for (const [key, state] of cast.frames) {
      const ctx = recorder()
      setScale(r)
      ctx.save(); ctx.scale(r / 100, r / 100); cast.draw(ctx, state); ctx.restore()
      assert.ok(ctx.__log.length > 80, `${id}/${key}/r${r} should emit canvas calls`)
    }
  }
  const mem1x = cast.frames.length * 2 * cast.surface * cast.surface * 4
  assert.ok(mem1x <= 8 * 1024 * 1024, `${id}: 1x cache stays under 8 MB (${Math.round(mem1x / 1024)} KB)`)
}

/* ---- frameKey sweep: only existing keys, all 17 reachable, explicit priority ---- */
const STANCES = [null, 'dashing', 'recover', 'roar']
const sweep = { moving: [true, false], swing: [-1, 0, .5, 1], windup: [false, true], casting: [null, 'charge', 'fire'], stance: STANCES, enraged: [false, true], walkT: [-7, -1, 0, .3, 1.7, 3.4, 6.2, 40, 123.4, ...Array.from({ length: 16 }, (_, i) => i * .45)] }
for (const id of BOSSES) {
  const cast = BOSS_CAST[id], keys = new Set(cast.frames.map(([key]) => key)), seen = new Set()
  for (const moving of sweep.moving) for (const swing of sweep.swing) for (const windup of sweep.windup) for (const casting of sweep.casting) for (const stance of sweep.stance) for (const enraged of sweep.enraged) for (const walkT of sweep.walkT) {
    const key = cast.frameKey({ moving, swing, windup, casting, stance, enraged, walkT })
    assert.ok(keys.has(key), `${id}: frameKey returned unknown "${key}"`)
    seen.add(key)
  }
  assert.deepEqual([...seen].sort(), [...keys].sort(), `${id}: every frame is reachable`)
  assert.equal(cast.frameKey({}), 'idle')
  // priority: roar > recover > strike > windup > move > idle
  assert.equal(cast.frameKey({ stance: 'roar', swing: .5, windup: true, moving: true, walkT: 1 }), 'r_roar', `${id}: roar beats everything`)
  assert.equal(cast.frameKey({ stance: 'recover', swing: .5, windup: true }), 'recover', `${id}: recover beats strike`)
  assert.equal(cast.frameKey({ stance: 'recover', enraged: true }), 'r_recover')
  assert.equal(cast.frameKey({ swing: .5, windup: true, moving: true, walkT: 1 }), 'strike', `${id}: strike beats windup`)
  assert.equal(cast.frameKey({ casting: 'fire', windup: true }), 'strike', `${id}: a fire tell is a strike`)
  assert.equal(cast.frameKey({ windup: true, moving: true, walkT: 1 }), 'windup', `${id}: windup beats move`)
  assert.equal(cast.frameKey({ casting: 'charge', moving: true, walkT: 1 }), 'windup')
  assert.equal(cast.frameKey({ moving: true, walkT: 0 }), 'move0')
  assert.equal(cast.frameKey({ enraged: true }), 'r_idle')
}
const quarter = Math.PI / 2 + .01
for (const id of BOSSES) {
  const cast = BOSS_CAST[id]
  const moveOf = (walkT, extra = {}) => cast.frameKey({ moving: true, walkT, ...extra })
  assert.deepEqual([0, quarter, Math.PI + .01, Math.PI * 1.5 + .01, TAU + .01].map(w => moveOf(w / .8)), ['move0', 'move1', 'move2', 'move3', 'move0'], `${id}: walkT is radians, one gait cycle = 2π / gait`)
  assert.equal(moveOf(-Math.PI / 2 / .8), 'move3', `${id}: negative phases wrap`)
  assert.equal(moveOf((10 * TAU + Math.PI + .01) / .8), moveOf((Math.PI + .01) / .8), `${id}: phase is periodic`)
  assert.equal(moveOf(quarter / .8, { enraged: true }), 'r_move1', `${id}: enraged walks are r_ frames`)
}

/* ---- motion overlay: finite, bounded, recover slumps, roar tremors ---- */
for (const id of BOSSES) {
  for (const moving of [true, false]) for (const swing of [-1, 0, .5, 1]) for (const windup of [false, true]) for (const casting of [null, 'charge', 'fire']) for (const stance of STANCES) for (const enraged of [false, true]) for (const hurt of [0, .4, 1, 5]) {
    const m = R.enemyArtMotion(id, { moving, swing, windup, casting, stance, enraged, hurt, walkT: 1.3, time: 7.7, seed: 2 })
    for (const v of Object.values(m)) assert.ok(Number.isFinite(v))
    assert.ok(m.sy > .8 && m.sy < 1.15 && m.sx > .85 && m.sx < 1.15, `${id} squash stays subtle`)
    assert.ok(Math.abs(m.dx) < 16 && Math.abs(m.dy) < 6, `${id} boss-weight overlay stays bounded`)
  }
  assert.ok(R.enemyArtMotion(id, { stance: 'recover' }).sy < 1, `${id}: recover slumps`)
  assert.ok(R.enemyArtMotion(id, { stance: 'roar', time: 3, seed: 1 }).dx !== 0, `${id}: roar tremors`)
  assert.ok(R.enemyArtMotion(id, { swing: .5 }).dx > 0, `${id}: strike lunges toward facing`)
  assert.ok(R.enemyArtMotion(id, { hurt: 1 }).dx < 0, `${id}: a hit recoils`)
  if (BOSS_CAST[id].floats) assert.equal(R.enemyArtMotion(id, { moving: true, walkT: 1.6 }).dy, 0, `${id}: floating boss drifts, never steps`)
  else assert.ok(R.enemyArtMotion(id, { moving: true, walkT: 1.6 }).dy < 0, `${id}: walking boss lifts at mid-stride`)
}

/* ---- ground shadow pins to the ground contact line ---- */
{
  for (const id of BOSSES) {
    const cast = BOSS_CAST[id], r = cast.baseR
    const ctx = recorder()
    R.drawEnemyShadow(ctx, id, 100, 200, r)
    const e = ctx.__log.find(([k]) => k === 'ellipse')[1]
    const feet = R.enemyArtFeet(id, r)
    assert.equal(e[0], 100); assert.ok(Math.abs(e[1] - (200 + feet + 1)) < 1e-9, `${id}: shadow at the ground line`)
    assert.ok(e[3] < e[2] * .3 && e[2] > r * .6 && e[2] < r * 3.2, `${id}: shadow is a flat ellipse comparable to the body`)
    const lifted = recorder()
    R.drawEnemyShadow(lifted, id, 100, 200, r, { lift: 12 })
    assert.ok(lifted.__log.find(([k]) => k === 'ellipse')[1][2] < e[2], `${id}: lift shrinks the shadow`)
  }
  assert.equal(R.drawEnemyShadow(recorder(), 'boss-knight', 0, 0, 36), false)
  // unique casts render unjittered, so their shadows ignore sizeMul; enemy casts still honour it
  const shadowEllipse = (type, r, sizeMul) => {
    const c = recorder()
    R.drawEnemyShadow(c, type, 0, 0, r, { sizeMul })
    return c.__log.find(([k]) => k === 'ellipse')[1]
  }
  assert.deepEqual(shadowEllipse('boss:knight', 36, 1), shadowEllipse('boss:knight', 36, 1.2), 'boss shadow ignores sizeMul')
  assert.deepEqual(shadowEllipse('boss:gate_marshal', 36, 1), shadowEllipse('boss:gate_marshal', 36, 1.2), 'boss shadow ignores sizeMul')
  const enemyShadow = shadowEllipse('knight', 14, 1), enemyShadowBig = shadowEllipse('knight', 14, 1.2)
  assert.ok(enemyShadowBig[2] > enemyShadow[2] && enemyShadowBig[1] !== enemyShadow[1], 'enemy shadow still honours sizeMul')
}

/* ---- no canvas available: realtime fallback draws, painter state untouched ---- */
{
  delete globalThis.OffscreenCanvas
  R.resetEnemyFrameCachesForTests()
  setScale(40, { blink: true })
  const before = { ...K }
  for (const id of BOSSES) {
    const ctx = recorder()
    assert.equal(R.drawEnemyArt(ctx, id, BOSS_CAST[id].baseR, { moving: true, walkT: 1 }, 1), 'realtime')
    assert.ok(ctx.__log.length > 80)
  }
  assert.deepEqual({ ...K }, before, 'drawing must not leak painter scale/face flags into slime rendering')
}

/* ---- frame cache: 17 frames + white twins, two tiers, no per-entity builds, no tint ---- */
{
  globalThis.OffscreenCanvas = FakeCanvas
  R.resetEnemyFrameCachesForTests()
  created = []
  setScale(40, { blink: true })
  const before = { ...K }
  for (const id of BOSSES) {
    const cast = BOSS_CAST[id], cache = R.getEnemyFrameCache(id)
    const snap = cache.snapshot()
    assert.equal(snap.frameCount, 17)
    assert.deepEqual(snap.frameKeys, FRAME_KEYS)
    assert.equal(created.length, 34, `${id}: one image and one white twin per frame`)
    assert.ok(created.every(c => c.width === cast.surface && c.height === cast.surface), `${id}: 1x tier = surface px`)
    const hueLogs = []
    for (let i = 0; i < 300; i++) {
      const ctx = recorder()
      R.drawEnemyArt(ctx, id, cast.baseR + (i % 5), { moving: i % 2 === 0, walkT: i * .37, swing: i % 7 === 0 ? .4 : -1, windup: i % 11 === 0, casting: i % 5 === 0 ? 'fire' : null, stance: STANCES[i % 4], enraged: i % 3 === 0, hurt: i % 4 === 0 ? 1 : 0, time: i, seed: i * .83 }, 1)
      hueLogs.push(...ctx.__log.filter(([k, a]) => k === 'set:globalCompositeOperation' && a === 'hue'))
    }
    assert.equal(created.length, 34, `${id}: unique casts build no tint scratch, no per-entity frames`)
    assert.equal(hueLogs.length, 0, `${id}: unique casts never apply a hue composite`)
    cache.draw(recorder(), 'idle', 1, 10, 2)
    assert.equal(created.length, 34 + 34, `${id}: 2x tier builds once`)
    assert.ok([...cache.tiers.get(2).values()].every(f => f.img.width === cast.surface * 2), `${id}: 2x tier frames are 2x size`)
    cache.draw(recorder(), 'idle', 1, 10, 1.5)
    cache.draw(recorder(), 'idle', 1, 10, 2)
    assert.equal(created.length, 68, `${id}: tiers are reused`)
    assert.equal(R.drawEnemyArt(recorder(), id, cast.baseR, { hurt: 0 }, 1), 'cache')
    const hurtCtx = recorder()
    R.drawEnemyArt(hurtCtx, id, cast.baseR, { hurt: 1 }, 1)
    assert.equal(hurtCtx.__log.filter(([k]) => k === 'drawImage').length, 2, `${id}: hit flash is the cached white twin`)
    created = []
  }
  assert.deepEqual({ ...K }, before, 'cache build restores painter state')
  assert.equal(R.enemyArtTier(1), 1); assert.equal(R.enemyArtTier(1.25), 2); assert.equal(R.enemyArtTier(2), 2)
}

/* ---- engine integration: real entities resolve artId, render through the new pipeline ---- */
{
  const { createArena, spawnBoss, dispose } = await import('./test-support/arena-fixture.mjs')
  const { EXPEDITION_BOSSES } = await import('./src/game/RunRules.js')
  const { AssetManager } = await import('./src/game/AssetManager.js')
  const assets = AssetManager.getInstance()
  const drawn = [], artCalls = []
  const assetDraw = assets.draw.bind(assets), assetDrawArt = assets.drawArt.bind(assets)
  assets.draw = (ctx, key, ...rest) => { drawn.push(key); return assetDraw(ctx, key, ...rest) }
  assets.drawArt = (ctx, key, ...rest) => { artCalls.push(key); return assetDrawArt(ctx, key, ...rest) }
  const clocks = b => ({ hp: b.hp, _walkT: b._walkT, attackCd: b.attackCd, attackInterval: b.attackInterval, facing: b.facing, x: b.x, y: b.y, flash: b.flash, _moving: b._moving, specialState: b.specialState, specialTimer: b.specialTimer, specialDuration: b.specialDuration, phaseShift: b.phaseShift, enraged: b.enraged, _attackAnim: b._attackAnim, _animClock: b._animClock, vulnerableTimer: b.vulnerableTimer })
  // duelArena 是引擎侧 BossArena 实例引用（含 game/canvas 与函数），不属于 BOSS 战斗状态快照
  const snapshot = b => { const { _shadowGrad, game, duelArena, ...rest } = b; return structuredClone(rest) }
  const cacheImages = () => new Set(BOSSES.flatMap(id => [1, 2].flatMap(tier => [...(R.getEnemyFrameCache(id).tiers.get(tier)?.values() || [])].flatMap(f => [f.img, f.flash]))))
  const artImages = ctx => { const own = cacheImages(); return ctx.__log.filter(([k, a]) => k === 'drawImage' && own.has(a[0])) }

  const spawns = [
    ...Object.values(EXPEDITION_BOSSES).map(encounter => g => g.enemyManager.beginExpeditionStageBoss(encounter)),
    ...['boss-knight', 'boss-mage', 'boss-archer', 'boss-final', 'boss-expedition'].map(type => g => spawnBoss(g, 300, type)),
  ]
  // GameEngine is a singleton: each boss gets its own arena and is processed inside it.
  let footSorted = false, dissolved = false
  for (const spawn of spawns) {
    const game = createArena()
    game.mapFeatures.barricades = []
    game.mapFeatures.speedMultiplierAt = () => 1
    try {
      const boss = spawn(game)
      boss._spawnT = 0
      const id = boss.artId
      assert.ok(typeof id === 'string' && id.startsWith('boss:'), `${boss.name}: artId resolves to a boss cast id (got ${id})`)
      const registered = !!BOSS_CAST[id]
      if (registered) {
        assert.ok(Math.abs(BOSS_CAST[id].baseR - boss.radius) <= boss.radius * .12, `${id}: baseR within 12% of the collision radius`)
        assert.ok(R.hasEnemyArt(id))
      }
      drawn.length = 0
      const before = clocks(boss), beforeSnap = snapshot(boss), ctx = recorder()
      boss.render(ctx)
      assert.deepEqual(clocks(boss), before, `${id}: render is read-only for combat clocks`)
      const { _shadowGrad, game: g2, duelArena: _duelArena, ...rest } = boss
      assert.deepEqual(rest, beforeSnap, `${id}: render leaves the boss deep-equal`)
      assert.equal(artCalls.length, 0, `${id}: boss render never touches drawArt`)
      if (registered) {
        assert.ok(artImages(ctx).length >= 1, `${id}: body draws from the boss frame cache`)
        assert.ok(!drawn.some(k => /^char_(boss|knight)/.test(k)), `${id}: no legacy boss/knight sprite keys`)
        // HP bar (70px border rect) sits above the head top, not above the collision circle
        const bar = ctx.__log.find(([k, a]) => k === 'fillRect' && a[2] === 70)
        assert.ok(bar, `${id}: HP bar drawn`)
        assert.ok(bar[1][1] <= boss.y - R.enemyArtTop(id, boss.radius) - 4, `${id}: HP bar clears the head top`)
      }
      // _artState mapping cases
      const S = (patch) => {
        const keep = { specialState: boss.specialState, phaseShift: boss.phaseShift, _attackAnim: boss._attackAnim, attackCd: boss.attackCd, _moving: boss._moving, attackInterval: boss.attackInterval, specialTimer: boss.specialTimer, _recoveryDuration: boss._recoveryDuration, specialPattern: boss.specialPattern, _cast: boss._cast, type: boss.type }
        Object.assign(boss, patch)
        const st = boss._artState()
        Object.assign(boss, keep)
        return st
      }
      assert.equal(S({ specialState: 'telegraph', specialTimer: .5, specialDuration: 1 }).windup, true, `${boss.type}: telegraph winds up`)
      assert.equal(S({ specialState: 'recover', specialTimer: 1, _recoveryDuration: 1 }).stance, 'recover')
      assert.equal(S({ phaseShift: .5 }).stance, 'roar')
      const dash = S({ specialState: 'dash', specialTimer: .2, _cast: { travel: 50, length: 100 } })
      assert.equal(dash.stance, 'dashing'); assert.equal(dash.swing, .5)
      const ranged = boss.type === 'boss-mage' || boss.type === 'boss-archer'
      assert.equal(S({ specialState: 'telegraph', specialTimer: .5, specialDuration: 1 }).casting, ranged ? 'charge' : undefined)
      assert.equal(S({ specialState: 'idle', attackCd: .2, _moving: false }).windup, true, `${boss.type}: standing with attackCd .2 winds up`)
      assert.equal(S({ specialState: 'idle', attackCd: .2, _moving: true }).windup, undefined, `${boss.type}: a walking cooldown does not wind up`)
      const justHit = S({ specialState: 'idle', attackCd: boss.attackInterval - .09, _moving: false })
      assert.ok(justHit.swing > 0 && justHit.swing <= 1, `${boss.type}: just-attacked shows the strike frame`)
      assert.equal(justHit.casting, ranged ? 'fire' : undefined)
      assert.equal(S({ specialState: 'idle', attackCd: 9, _moving: false }).swing, -1, `${boss.type}: fresh cooldown is idle`)
      assert.equal(S({}).hurt, 0)

      if (id === 'boss:border_warden') {
        // release flash maps through _attackAnim (BorderWarden strike settlement)
        boss._attackAnim = .24
        assert.ok(Math.abs(boss._artState().swing - .5) < 1e-9, 'release flash maps attackRemaining to swing progress')
        boss._attackAnim = 0

        // foot sorting: the player's feet 8px south/north of the boss's foot line
        const em = game.enemyManager, keep = em._enemies
        const order = []
        const orig = boss.render.bind(boss)
        boss.render = c => { order.push('boss'); return orig(c) }
        boss.x = game.camera.x + 200; boss.y = game.camera.y + 200
        boss.specialState = 'idle'; boss.phaseShift = 0
        em._enemies = [boss]
        const footLine = boss.y + R.enemyArtFeet(id, boss.radius)
        const mkPlayer = footY => ({ active: true, radius: 26, x: boss.x, y: footY - 26 * .85, render() { order.push('player') } })
        order.length = 0; em.renderBodies(recorder(), mkPlayer(footLine + 8))
        assert.deepEqual(order, ['boss', 'player'], 'a player south of the foot line draws after the boss')
        order.length = 0; em.renderBodies(recorder(), mkPlayer(footLine - 8))
        assert.deepEqual(order, ['player', 'boss'], 'a player north of the foot line draws before the boss')
        boss.render = orig
        em._enemies = keep
        footSorted = true

        // routed/devoured bosses keep the new look in the dissolve channel (idle frame, no tint)
        em._enemies = []
        boss._routT = .2
        em._routing.push(boss)
        const dissolveCtx = recorder()
        em.render(dissolveCtx)
        assert.ok(artImages(dissolveCtx).length >= 1, 'a routed boss draws the new art in the dissolve channel')
        em._routing.length = 0
        em._enemies = keep
        dissolved = true
      }
    } finally {
      dispose(game)
    }
  }
  assert.ok(footSorted && dissolved, 'the registered-boss integration cases ran')

  /* ---- enraged hit-flash: live embers keep the phase-2 read under the white twin ---- */
  {
    const game = createArena()
    game.mapFeatures.barricades = []
    game.mapFeatures.speedMultiplierAt = () => 1
    try {
      const boss = spawnBoss(game, 300, 'boss-knight')
      boss._spawnT = 0
      boss.attackCd = 0
      boss.enraged = true
      boss.phase = 2
      const arcsAfterBody = c => {
        const last = c.__log.reduce((m, [k], i) => (k === 'drawImage' ? i : m), -1)
        return c.__log.slice(last + 1).filter(([k]) => k === 'arc').length
      }
      boss.flash = .12
      const flashed = recorder(); boss.render(flashed)
      boss.flash = 0
      const calm = recorder(); boss.render(calm)
      boss.enraged = false
      boss.flash = .12
      const plain = recorder(); boss.render(plain)
      assert.ok(arcsAfterBody(flashed) >= 3, 'enraged + flash emits live ember arcs after the body')
      assert.equal(arcsAfterBody(calm), 0, 'no embers without a flash')
      assert.equal(arcsAfterBody(plain), 0, 'no embers without rage')
    } finally { dispose(game) }
  }
  assets.draw = assetDraw
  assets.drawArt = assetDrawArt
}

/* ---- TD / Runner wiring: both modes resolve their bosses to boss casts ---- */
{
  const { ENEMY_ROLE_MAP } = await import('./src/game/gameplay/tower-defense/TowerDefenseRenderer.js')
  for (const [typeId, role] of Object.entries(ENEMY_ROLE_MAP)) {
    assert.ok(R.hasEnemyArt(role), `TD ${typeId} -> "${role}" must resolve to a cast`)
  }
  assert.equal(ENEMY_ROLE_MAP.siege, 'boss:gate_marshal', 'TD siege rides the tower-shield boss cast')
  assert.equal(ENEMY_ROLE_MAP.boss, 'boss:knight', 'TD boss rides the crowned 王庭 boss cast')
  // runner maps carrier_boss inline: pin the cast id it resolves to
  const runnerSrc = fs.readFileSync(new URL('./src/game/gameplay/runner/RunnerRenderer.js', import.meta.url), 'utf8')
  const carrier = runnerSrc.match(/carrier_boss'\s*\?\s*'([^']+)'/)?.[1]
  assert.ok(carrier && R.hasEnemyArt(carrier), `runner carrier_boss -> "${carrier}" must resolve to a cast`)
  assert.equal(carrier, 'boss:knight')
  assert.equal(R.enemyArtUnique('boss:knight'), true)
  assert.equal(R.enemyArtUnique('boss:gate_marshal'), true)
  assert.equal(R.enemyArtUnique('knight'), false)
}
R.resetEnemyFrameCachesForTests()
console.log(`boss art verification passed (${BOSSES.join(', ')})`)
