// Behavioral & art contract checks for Part B enemy system overhaul:
// 1. 3-tier progression (rank 1/2/3) across knight, mage, archer, priest
// 2. Slow, readable mage projectiles
// 3. Zero pause & unthrottled mob spawning before/during boss fights
// 4. Three new vanguard/support classes: bulwark, alchemist, bannerman
// 5. Extended frame-cache art pipeline (ENEMY_EXTENDED_CAST) without mutating ENEMY_CAST keys
import assert from 'node:assert/strict'
import { Enemy, BANNER_AURA_RADIUS } from './src/game/entities/Enemy.js'
import { EnemyBullet } from './src/game/entities/EnemyBullet.js'
import { EnemyManager } from './src/game/EnemyManager.js'
import { ENEMY_CAST } from './src/game/enemy-art/enemy-cast.js'
import { ENEMY_EXTENDED_CAST } from './src/game/enemy-art/enemy-extended-cast.js'
import * as R from './src/game/EnemyArtRenderer.js'
import { K, setScale } from './src/game/slime-art/slime-painter.js'

let passed = 0
const ok = (msg) => { passed++; console.log(`  [PASS ${passed}] ${msg}`) }

const gradient = { addColorStop() {} }
function recorder() {
  const log = []
  const state = { globalAlpha: 1, globalCompositeOperation: 'source-over' }
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
class FakeCanvas {
  constructor(w, h) { this.width = w; this.height = h; this.ctx = recorder() }
  getContext() { return this.ctx }
}

function makeStubGame({ wave = 1, mode = 'timed', stage = 1 } = {}) {
  const hits = []
  const sounds = { enemyShootCount: 0, waveCount: 0 }
  const game = {
    elapsed: 0,
    width: 1280,
    height: 720,
    worldWidth: 2400,
    worldHeight: 2400,
    dpr: 1,
    camera: { x: 400, y: 400 },
    runSelection: { mode, difficulty: 'normal' },
    expeditionStage: stage,
    canDevour: true,
    player: {
      x: 1000,
      y: 1000,
      radius: 16,
      dead: false,
      hp: 20,
      maxHp: 20,
      level: 5,
      hit(dmg, meta) {
        hits.push({ dmg, meta })
        this.hp -= dmg
        return true
      },
      getEnemyTarget() { return null },
    },
    sound: {
      enemyShoot() { sounds.enemyShootCount++ },
      wave() { sounds.waveCount++ },
      bossRoar() {},
    },
    mapFeatures: null,
    dialogue: { tryMinion() {}, sayBoss() {} },
    shakeScreen() {},
    worldEvents: null,
    weaponSystem: { kills: 0 },
  }
  const manager = new EnemyManager()
  manager.attach(game)
  manager.wave = wave
  game.enemyManager = manager
  return { game, manager, hits, sounds }
}

// 1. Slow mage projectile physics & clarity
{
  const orb = new EnemyBullet({ x: 0, y: 0, angle: 0, kind: 'mage' })
  assert.equal(orb.speed, 130, 'ordinary mage orb uses readable 130 px/s speed')
  assert.equal(orb.radius, 8, 'mage orb uses enlarged 8px silhouette radius')
  assert.equal(orb.life, 4.5, 'mage orb retains 4.5s default lifetime')

  const bossOrb = new EnemyBullet({ x: 0, y: 0, angle: 0, kind: 'mage', isBoss: true })
  assert.equal(bossOrb.speed, 210, 'boss mage orb defaults to readable 210 px/s')

  const arrow = new EnemyBullet({ x: 0, y: 0, angle: 0, kind: 'archer' })
  assert.equal(arrow.speed, 380, 'archer arrow velocity unchanged')
  assert.equal(arrow.life, 3)

  const ctx = recorder()
  orb.render(ctx)
  assert.ok(ctx.__log.some(([fn]) => fn === 'stroke'), 'ordinary mage orb draws explicit outer rim contour')

  // Distinct rank styles across mage T1/T2/T3 and archer T1/T2/T3
  const mOrb1 = new EnemyBullet({ x: 0, y: 0, angle: 0, kind: 'mage', rank: 1 })
  const mOrb3 = new EnemyBullet({ x: 0, y: 0, angle: 0, kind: 'mage', rank: 3 })
  assert.equal(mOrb1.radius, 6.5)
  assert.equal(mOrb3.radius, 8.5)
  const c1 = recorder(), c3 = recorder()
  mOrb1.render(c1); mOrb3.render(c3)
  assert.ok(c3.__log.length > c1.__log.length, 'T3 archmage orb draws richer star-core contour than T1 orb')

  const aArrow1 = new EnemyBullet({ x: 0, y: 0, angle: 0, kind: 'archer', rank: 1 })
  const aArrow2 = new EnemyBullet({ x: 0, y: 0, angle: 0, kind: 'archer', rank: 2 })
  const aArrow3 = new EnemyBullet({ x: 0, y: 0, angle: 0, kind: 'archer', rank: 3 })
  const ac1 = recorder(), ac2 = recorder(), ac3 = recorder()
  aArrow1.render(ac1); aArrow2.render(ac2); aArrow3.render(ac3)
  assert.ok(ac1.__log.some(([fn, args]) => fn === 'set:fillStyle' && args === '#64748b'), 'T1 archer arrow draws muted slate fletching')
  assert.ok(ac2.__log.some(([fn, args]) => fn === 'set:fillStyle' && args === '#10ac84'), 'T2 archer arrow draws emerald fletching')
  assert.ok(ac3.__log.some(([fn, args]) => fn === 'set:fillStyle' && args === '#fde047'), 'T3 archer arrow draws golden-trimmed enchanted fletching')
  assert.ok(ac3.__log.length > ac2.__log.length && ac3.__log.length > ac1.__log.length, 'T3 royal arrow renders richest trail and dual-feather detail')
}
ok('慢速法师弹幕与 1/2/3 阶敌军弹道区分（含深色威胁描边、星芒法球与三阶箭矢）')

// 2. Three-tier unit progression & baseline compatibility
{
  const { game } = makeStubGame({ wave: 1 })
  const k1 = new Enemy({ x: 100, y: 100, speed: 100, hp: 10, type: 'knight', rank: 1 })
  const k2 = new Enemy({ x: 100, y: 100, speed: 100, hp: 10, type: 'knight' })
  const k2Elite = new Enemy({ x: 100, y: 100, speed: 100, hp: 10, type: 'knight', elite: true })
  const k3 = new Enemy({ x: 100, y: 100, speed: 100, hp: 10, type: 'knight', rank: 3 })

  assert.equal(k2.rank, 2, 'omitted rank defaults to 2 (preserves baseline formulas)')
  assert.equal(k2Elite.hp, k2.hp * 3, 'default rank-2 elite maintains exact 3x HP rule')
  assert.equal(k2Elite.expValue, k2.expValue * 5, 'default rank-2 elite maintains exact 5x EXP rule')
  assert.ok(k1.hp < k2.hp && k2.hp < k3.hp, 'knight HP scales T1 < T2 < T3')
  assert.ok(k1.speed < k2.speed && k2.speed < k3.speed, 'knight speed scales T1 < T2 < T3')
  assert.equal(k1.artId, 'knight:1')
  assert.equal(k2.artId, 'knight')
  assert.equal(k3.artId, 'knight:3')
  assert.equal(k3.shieldHits, 2, 'T3 knight starts with 2 frontal plate shield layers')

  // T3 shield absorbs first two hits cleanly
  k3.attach(game)
  const hpBefore = k3.hp
  k3.hit(5)
  k3.hit(5)
  assert.equal(k3.hp, hpBefore)
  assert.equal(k3.shieldHits, 0)

  // Mage tiers: T1/T2 1 orb, T3 3 spread orbs with bounded lifetime
  const { game: gMage, manager: mMage } = makeStubGame({ wave: 5 })
  const m1 = new Enemy({ x: 200, y: 200, speed: 80, hp: 10, type: 'mage', rank: 1 })
  const m2 = new Enemy({ x: 200, y: 200, speed: 80, hp: 10, type: 'mage', rank: 2 })
  const m3 = new Enemy({ x: 200, y: 200, speed: 80, hp: 10, type: 'mage', rank: 3 })
  m1.attach(gMage); m2.attach(gMage); m3.attach(gMage)
  m1._shoot()
  assert.equal(mMage._bullets.length, 1)
  assert.equal(mMage._bullets[0].rank, 1)
  assert.equal(mMage._bullets[0].speed, 130)
  assert.equal(mMage._bullets[0].life, 4.2)
  mMage._bullets.length = 0
  m2._shoot()
  assert.equal(mMage._bullets.length, 1)
  assert.equal(mMage._bullets[0].speed, 145)
  assert.equal(mMage._bullets[0].life, 4.2)
  mMage._bullets.length = 0
  m3._shoot()
  assert.equal(mMage._bullets.length, 3, 'T3 archmage fires a 3-orb arcane fan')
  assert.ok(mMage._bullets.every((b) => b.speed === 120 && b.life === 4.4 && b.rank === 3), 'all T3 multi-shot orbs fly at 120 px/s with 4.4s bounded lifetime')
  assert.ok(mMage._bullets[0].speed < 130 && mMage._bullets[0].speed < 145, 'T3 multi-shot orbs are slower than T1/T2 single-shot mage orbs')
  const spreadLeft = Math.atan2(mMage._bullets[0].vy, mMage._bullets[0].vx)
  const spreadRight = Math.atan2(mMage._bullets[2].vy, mMage._bullets[2].vx)
  assert.ok(Math.abs(spreadRight - spreadLeft - 0.4) < 1e-6, 'T3 3-orb fan widens to 0.4 rad total cone for clear dodge lanes')

  // Archer tiers: T1 fast single arrow, T3 3-arrow fan
  mMage._bullets.length = 0
  const a3 = new Enemy({ x: 200, y: 200, speed: 100, hp: 10, type: 'archer', rank: 3 })
  a3.attach(gMage)
  a3._shoot()
  assert.equal(mMage._bullets.length, 3, 'T3 royal archer fires 3-arrow fan')
  assert.ok(mMage._bullets.every((b) => b.rank === 3), 'T3 archer arrows carry rank 3')

  // Priest T3 heal grants ward shield + higher heal
  const p3 = new Enemy({ x: 250, y: 200, speed: 80, hp: 10, type: 'priest', rank: 3 })
  p3.attach(gMage)
  const hurtAlly = mMage.spawnAt(270, 200, 'knight')
  hurtAlly.hp = 1
  p3._healCd = 0
  p3.update(0.05)
  assert.ok(hurtAlly.shieldHits >= 1, 'T3 archbishop grants holy ward shield on heal')

  // Rank roll progression across early/mid/late waves
  let earlyT1 = 0, lateT3 = 0
  for (let i = 0; i < 200; i++) {
    if (mMage._rollRank(1, 'knight') === 1) earlyT1++
    if (mMage._rollRank(12, 'knight') === 3) lateT3++
  }
  assert.ok(earlyT1 > 120, `wave 1 should mostly spawn T1 militia (got ${earlyT1}/200)`)
  assert.ok(lateT3 > 110, `wave 12 should mostly spawn T3 elites (got ${lateT3}/200)`)
}
ok('三阶兵种演化（T1→T2→T3 建模键/属性/骑士盾/大法师散射/大主教圣佑）')

// 3. Unthrottled spawn pacing & zero boss-spawn pause
{
  const { manager } = makeStubGame({ wave: 1 })
  const targetW1 = manager._populationTarget()
  const targetW12 = (() => { manager.wave = 12; return manager._populationTarget() })()
  assert.ok(targetW1 >= 26 && targetW1 <= 36, `wave 1 brisk mowing density target (got ${targetW1})`)
  assert.ok(targetW12 <= 76, `late wave target capped cleanly at <=76 (got ${targetW12})`)

  // Boss wave (wave 5) no longer sets _bossGrace = 1.5
  manager.wave = 5
  manager._bossGrace = 0
  manager.beginWave(5)
  assert.equal(manager._bossGrace, 0, 'spawning a boss no longer triggers _bossGrace pause')

  // During _finale, full _populationTarget() softCap & full roster remain active
  manager.beginFinale()
  const finaleSoftCap = Math.ceil(manager._populationTarget() * 1.2)
  for (let i = 0; i < finaleSoftCap + 5; i++) {
    manager._spawnTimer = 0
    manager.update(0.05)
  }
  assert.ok(
    manager.enemies.length >= finaleSoftCap - 2,
    `boss finale keeps unthrottled mowing density (${manager.enemies.length}/${finaleSoftCap})`
  )
}
ok('高频率无间断出兵节奏与 Boss 战不暂缓刷怪')

// 4. Bulwark frontal shield vs flank/ricochet bypass
{
  const { game, manager } = makeStubGame({ wave: 5 })
  const bw = manager.spawnAt(1000, 1000, 'bulwark')
  bw.hp = 100
  bw.maxHp = 100
  // Initialize facing right toward player first, then test bounded turn rate on rapid flank
  bw.game.player.x = 1200
  bw.game.player.y = 1000
  bw.update(0.016)
  assert.ok(Math.abs(bw.facing) < 1e-6)

  // Projectile moving left (angle PI) hits front (+x face of bulwark) -> mitigated 65%
  bw.hit(20, { hitAngle: Math.PI })
  assert.equal(bw.hp, 100 - 7, 'frontal hit onto tower shield mitigates damage by 65%')

  // Banked/flank projectile moving right (angle 0) hits rear (-x) -> full 100% damage
  bw.hit(20, { hitAngle: 0 })
  assert.equal(bw.hp, 93 - 20, 'flank/rear hit bypasses tower shield for full 100% damage')

  // Bounded turn speed prevents instant 180 flip on rapid flank
  const initialFacing = bw.facing
  bw.game.player.x = 800
  bw.game.player.y = 1000 // directly behind
  bw.update(0.1)
  assert.ok(Math.abs(bw.facing - initialFacing) <= 0.27, 'bulwark turns smoothly so circling flanks work')
}
ok('重盾塔兵正面 45% 减伤、绕背/反弹破盾与有限转身速率')

// 5. Alchemist lobbed hazard telegraph, landing impact, player slow & cleanup
{
  const { game, manager, hits } = makeStubGame({ wave: 6 })
  manager._spawnTimer = 999
  const alc = manager.spawnAt(1250, 1000, 'alchemist')
  alc.attackCd = 0
  alc.update(0.05)
  assert.equal(manager._hazards.length, 1, 'alchemist lobs flask when within range')
  const h = manager._hazards[0]
  assert.equal(h.landed, false, 'hazard begins in flight with landing ring telegraph')

  // Render preview (ground + air) works cleanly during flight & landed phases
  const gCtx = recorder()
  manager.renderBodies(gCtx, game.player)
  manager.render(gCtx)
  assert.ok(gCtx.__log.length > 10)

  alc.destroy()
  // Advance until impact inside puddle
  for (let i = 0; i < 8; i++) manager.update(0.1)
  assert.equal(h.landed, true, 'flask lands after flightDur')
  assert.equal(hits.length, 1, 'landing deals direct splash hit when player stays in telegraph circle')
  assert.ok(manager.playerFieldMultiplierAt(game.player.x, game.player.y) < 0.8, 'acid puddle slows player inside radius')
  assert.equal(manager.playerFieldMultiplierAt(game.player.x + 200, game.player.y), 1, 'outside puddle has no slow')

  // Cleanup on expiry & routAll
  for (let i = 0; i < 45; i++) manager.update(0.1)
  assert.equal(manager._hazards.length, 0, 'puddle expires cleanly after lingerDur')

  manager.spawnLobHazard({ startX: 1100, startY: 1000, targetX: 1000, targetY: 1000 })
  assert.equal(manager._hazards.length, 1)
  manager.routAll()
  assert.equal(manager._hazards.length, 0, 'routAll clears remaining hazards immediately')
}
ok('炼金投弹手抛投预警、落地伤害、地面减速池与回收')

// 6. Bannerman aura buff & immediate drop on death + wave roster unlocks
{
  const { manager } = makeStubGame({ wave: 7 })
  const banner = manager.spawnAt(1000, 1000, 'bannerman')
  const nearby = manager.spawnAt(1000 + BANNER_AURA_RADIUS - 20, 1000, 'knight')
  const farAway = manager.spawnAt(1000 + BANNER_AURA_RADIUS + 80, 1000, 'knight')
  const baselineAtkCd = nearby.attackCd = 1.0
  nearby.x = manager.game.player.x + 20
  nearby.y = manager.game.player.y
  banner.x = nearby.x + 50
  banner.y = nearby.y

  manager.update(0.1)
  assert.ok(nearby._bannerBuff > 0, 'ally inside 185px receives banner buff')
  assert.equal(farAway._bannerBuff, 0, 'ally outside 185px receives no banner buff')
  assert.ok(nearby.attackCd < baselineAtkCd - 0.105, 'banner buff accelerates ally attack tempo cleanly')

  banner.destroy()
  manager.update(0.05)
  assert.equal(nearby._bannerBuff, 0, 'killing bannerman clears buff on next frame')

  const sampleRosterTypes = (w) => {
    manager.wave = w
    return new Set(manager._rollRoster().map(([t]) => t))
  }
  assert.ok(sampleRosterTypes(5).has('bulwark'), 'wave 5+ unlocks bulwark')
  assert.ok(sampleRosterTypes(6).has('alchemist'), 'wave 6+ unlocks alchemist')
  assert.ok(sampleRosterTypes(7).has('bannerman'), 'wave 7+ unlocks bannerman')
}
ok('王国战旗官光环增益、击杀即刻断档与波次编成解锁')

// 7. Extended art pipeline contracts (all 11 new casts bake & draw without mutating ENEMY_CAST)
{
  assert.deepEqual(
    Object.keys(ENEMY_CAST),
    ['knight', 'mage', 'hound', 'assassin', 'archer', 'priest', 'berserker', 'golem', 'wraith'],
    'base ENEMY_CAST keys remain strictly frozen for existing tests'
  )

  const EXTENDED_IDS = [
    'knight:1', 'knight:3', 'mage:1', 'mage:3',
    'archer:1', 'archer:3', 'priest:1', 'priest:3',
    'bulwark', 'alchemist', 'bannerman',
  ]
  globalThis.OffscreenCanvas = FakeCanvas
  R.resetEnemyFrameCachesForTests()
  setScale(26, { blink: true })
  const before = { ...K }

  for (const id of EXTENDED_IDS) {
    assert.ok(R.hasEnemyArt(id), `${id} resolves in hasEnemyArt`)
    const cast = ENEMY_EXTENDED_CAST[id]
    assert.ok(cast && cast.frames.length >= 5, `${id} has full pose frames`)
    const snap = R.getEnemyFrameCache(id).snapshot()
    assert.equal(snap.frameCount, cast.frames.length, `${id} bakes all poses into frame cache`)

    const ctx = recorder()
    const drawn = R.drawEnemyArt(ctx, id, cast.baseR, { moving: true, walkT: 1, hurt: 0.5 }, 1)
    assert.equal(drawn, 'cache', `${id} renders through cached bitmap pipeline`)
    assert.ok(R.drawEnemyShadow(ctx, id, 0, 0, cast.baseR, {}) !== false, `${id} draws ground shadow`)
  }
  assert.deepEqual({ ...K }, before, 'extended casts leave slime painter global state untouched')
  R.resetEnemyFrameCachesForTests()
}
ok('11 套高/低阶与新职业矢量立绘帧缓存烘焙与渲染隔离')

console.log(`\n敌人系统重构专项通过：${passed} 组断言 ✓`)
