// Gameplay execution-boundary and Runner rules smoke test.
import assert from 'node:assert/strict'

const gradient = { addColorStop() {} }
const ctx2d = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => gradient
      return () => {}
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
globalThis.window = {
  addEventListener() {},
  removeEventListener() {},
  devicePixelRatio: 1,
  matchMedia: () => ({ matches: false }),
}
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
const { RunnerGameplay } = await import('./src/game/gameplay/RunnerGameplay.js')
const { RunnerDirector } = await import('./src/game/gameplay/runner/RunnerDirector.js')
const {
  RUNNER_COLLISION_DEPTH,
  RUNNER_DASH_COOLDOWN,
  RUNNER_DASH_DURATION,
  RUNNER_DASH_IMPACT_DAMAGE,
  RUNNER_DURATION,
  RUNNER_ENTITY_TYPES,
  RUNNER_FEVER_DURATION,
  RUNNER_FEVER_MAX_CHARGES,
  RUNNER_FEVER_SHARDS_PER_CHARGE,
  RUNNER_MAX_GROUND_FIRES,
  RUNNER_MAX_HP,
  RUNNER_MAX_SHIELD,
  RUNNER_TACTICAL_ITEMS,
  RUNNER_WEAPON_CORES,
} = await import('./src/game/gameplay/runner/RunnerRules.js')
const { createGameplay } = await import('./src/game/gameplay/GameplayFactory.js')

assert.ok(createGameplay('arena') instanceof ArenaGameplay)
assert.ok(createGameplay('runner') instanceof RunnerGameplay)
assert.ok(createGameplay('unknown') instanceof ArenaGameplay)
console.log('✓ Gameplay factory creates arena/runner and safely falls back')

const engine = GameEngine.create(canvasStub)
assert.equal(engine.gameplayId, 'arena')
assert.ok(engine.gameplay instanceof GameplayController)
assert.equal(engine.gameplay.game, engine)

const arena = engine.gameplay
const boundary = { arenaUpdate: 0, arenaRender: 0, worldUpdate: 0, worldRender: 0 }
engine._updateArenaFrame = () => boundary.arenaUpdate++
engine._renderArenaFrame = () => boundary.arenaRender++
engine.update(1 / 60)
engine.render()
assert.deepEqual(boundary, { arenaUpdate: 1, arenaRender: 1, worldUpdate: 0, worldRender: 0 })

arena.usesArenaFramePipeline = () => false
arena.updateWorld = () => boundary.worldUpdate++
arena.renderWorld = () => boundary.worldRender++
engine.update(1 / 60)
engine.render()
assert.deepEqual(boundary, { arenaUpdate: 1, arenaRender: 1, worldUpdate: 1, worldRender: 1 })
delete engine._updateArenaFrame
delete engine._renderArenaFrame
console.log('✓ Gameplay execution boundary selects exactly one frame pipeline')

// Same seed must yield the same lane/type rows; a run can redistribute roles across all lanes.
const directorA = new RunnerDirector(12345)
const directorB = new RunnerDirector(12345)
const rowsA = []
const rowsB = []
const laneKinds = [new Set(), new Set(), new Set()]
for (const elapsed of [0, 15, 45, 60, 95, 120, 150, 170]) {
  const a = directorA.createEncounter(elapsed)
  const b = directorB.createEncounter(elapsed)
  rowsA.push(a.map(({ lane, type, hp }) => ({ lane, type, hp })))
  rowsB.push(b.map(({ lane, type, hp }) => ({ lane, type, hp })))
  for (const entity of a) laneKinds[entity.lane].add(entity.kind)
}
assert.deepEqual(rowsA, rowsB, '相同种子必须生成相同遭遇')
assert.ok(laneKinds.every((kinds) => kinds.size >= 2), '每条通道都应出现不同职责')
const advancedTypes = new Set()
for (let i = 0; i < 100; i++) {
  const elapsed = i < 25 ? 20 : i < 50 ? 60 : i < 75 ? 110 : 160
  for (const entity of directorA.createEncounter(elapsed)) advancedTypes.add(entity.type)
}
for (const type of ['swarm', 'shield', 'charger', 'priest', 'splitter', 'archer', 'mage', 'guard']) {
  assert.ok(advancedTypes.has(type), `导演编队应包含机制怪 ${type}`)
}
for (let seed = 1; seed <= 60; seed++) {
  const seededDirector = new RunnerDirector(seed)
  for (let row = 0; row < 48; row++) {
    const elapsed = row < 12 ? 20 : row < 24 ? 60 : row < 36 ? 110 : 160
    const encounter = seededDirector.createEncounter(elapsed)
    const rangedCount = encounter.filter((entity) => ['archer', 'mage'].includes(entity.type)).length
    assert.ok(rangedCount <= 2, `种子 ${seed} 的同排远程威胁不应超过两名`)
    assert.ok(encounter.length <= 9, `种子 ${seed} 的编队规模应受上限约束`)
  }
}
const mutationChoices = directorA.createWeaponChoice()
assert.equal(mutationChoices.length, 3)
assert.deepEqual(new Set(mutationChoices.map((choice) => choice.weaponCore)), new Set(Object.keys(RUNNER_WEAPON_CORES)))
assert.deepEqual(mutationChoices.map((choice) => choice.lane).sort(), [0, 1, 2])
console.log('✓ Runner director is deterministic and dynamically redistributes lane roles')

const runner = engine.configureGameplay('runner')
let latestHud = null
let result = null
engine.onGameplayHud = (snapshot) => {
  latestHud = snapshot
}
engine.onGameplayFinished = (snapshot) => {
  result = snapshot
}
engine.resetGameplaySession(12345)
assert.equal(runner.state, 'countdown')
assert.equal(runner.hp, RUNNER_MAX_HP)
assert.equal(runner.currentLane, 1)
assert.equal(runner.targetLane, 1)
assert.equal(runner.entities.length, 0)
assert.equal(engine._pauseLock, 0)
assert.equal(latestHud.mode, 'runner')
assert.equal(latestHud.timeLabel, '3:00')

engine.update(2.5)
assert.equal(runner.state, 'active')
engine.update(1 / 60)
assert.ok(runner.entities.length > 0, '倒计时结束后应立即生成首批遭遇')
assert.ok(runner.bullets.length > 0, '倒计时结束后应开始自动射击')
assert.equal(latestHud.dash.maxCooldown, RUNNER_DASH_COOLDOWN)
assert.equal(latestHud.lanes.length, 3)
console.log('✓ Runner session reset, countdown, HUD and first encounter are connected')

// A lane does not commit until the visual transition reaches it, and no shot is spawned mid-switch.
runner.bullets.length = 0
runner._fireCooldown = -1
engine.input.state.right = true
engine.update(1 / 60)
engine.input.state.right = false
engine.update(1 / 60)
assert.equal(runner.targetLane, 2)
assert.equal(runner.currentLane, 1)
assert.equal(runner.isSwitching, true)
assert.equal(runner.bullets.length, 0, '换线过程中不得生成视觉与判定错位的子弹')
for (let i = 0; i < 40; i++) engine.update(1 / 60)
assert.equal(runner.currentLane, 2)
assert.equal(runner.lanePosition, 2)
assert.equal(runner.isSwitching, false)
console.log('✓ Runner lane switching commits atomically and suppresses mid-switch shots')

// Emergency dash moves one lane, grants a short invulnerability window, and rewards a fresh evade.
runner.entities.length = 0
runner.currentLane = runner.targetLane = 1
runner.lanePosition = 1
const dashHpBefore = runner.hp
runner.dashCooldown = 0
runner.dashTimer = 0
runner.visualTime = 5
runner.entities.push({
  ...RUNNER_ENTITY_TYPES.scout,
  id: 599,
  lane: 2,
  depth: 0.86,
  previousDepth: 0.86,
  speed: 1,
  hp: 2,
  maxHp: 2,
  hitFlash: 0,
  active: true,
})
engine.input.state.left = false
engine.input.state.right = false
engine.input._dashQueued = true
runner._updateLaneInput(1 / 60)
assert.equal(runner.currentLane, 0, '无方向急闪应选择风险更低的邻道')
assert.equal(runner.dashCooldown, RUNNER_DASH_COOLDOWN)
assert.equal(runner.dashTimer, RUNNER_DASH_DURATION)
const dodgeScoreBefore = runner.score
runner._updateEntities(0.12)
assert.equal(runner.hp, dashHpBefore, '急闪无敌帧不应受到碰撞伤害')
assert.ok(runner.perfectDodges > 0)
assert.equal(runner.score, dodgeScoreBefore + 20)
runner.dashTimer = 0
runner.currentLane = runner.targetLane = 2
runner.lanePosition = 2
console.log('✓ Runner emergency dash grants invulnerability and perfect-dodge feedback')

// Emergency dash impact against light enemies and fever shard progression
runner.entities.length = 0
runner.currentLane = runner.targetLane = 0
runner.lanePosition = 0
runner.dashCooldown = 0
runner.dashTimer = 0
runner.feverShards = 0
runner.feverCharges = 0
runner.entities.push({
  ...RUNNER_ENTITY_TYPES.scout,
  id: 601,
  lane: 1,
  depth: 0.85,
  previousDepth: 0.85,
  speed: 0,
  hp: 2,
  maxHp: 2,
  active: true,
})
engine.input.state.right = true
engine.input._dashQueued = true
runner._updateLaneInput(1 / 60)
engine.input.state.right = false
assert.equal(runner.currentLane, 1)
assert.equal(runner.dashKills, 1, '急闪冲撞轻型敌人应触发冲撞击杀')
assert.equal(runner.feverShards, 1, '冲撞击杀应奖励 1 个暴走印记')

// Collecting 3 shards stores 1 charge (up to max 2 charges)
runner._collectFeverShard({ x: 0, y: 0 })
runner._collectFeverShard({ x: 0, y: 0 })
assert.equal(runner.feverCharges, 1, '收集满 3 个印记应储存 1 点暴走能量')
assert.equal(runner.feverShards, 0, '充能后印记计数应重置')

// Manual activation consumes 1 charge and activates tri-lane overdrive shooting
assert.equal(runner.isFeverActive, false, '暴走能量未手动释放时不应自动激活')
const activated = runner.activateFever()
assert.equal(activated, true, '有能量时手动激活应成功')
assert.equal(runner.isFeverActive, true)
assert.equal(runner.feverCharges, 0, '释放暴走应扣除 1 点能量')
assert.equal(runner.feverTimer, RUNNER_FEVER_DURATION)

runner.bullets.length = 0
runner._fireCooldown = 0
runner._updateShooting(0.001)
assert.equal(runner.bullets.length, 3, '狂热暴走应同时发射三路弹道')
assert.deepEqual(runner.bullets.map(b => b.lane).sort(), [0, 1, 2], '狂热暴走弹道应覆盖所有车道')
runner.feverTimer = 0
runner.dashTimer = 0
runner.hitsTaken = 0
runner.kills = 0
console.log('✓ Runner dash impact and manual Fever (3 shards -> 1 charge, max 2) verified')

// Only the currently occupied lane can damage the player at the collision line.
runner._encounterTimer = 999
runner._fireCooldown = 999
runner.entities.length = 0
runner.bullets.length = 0
const hpBeforeAvoid = runner.hp
runner.entities.push({
  ...RUNNER_ENTITY_TYPES.scout,
  id: 500,
  lane: 0,
  kind: 'enemy',
  depth: RUNNER_COLLISION_DEPTH - 0.001,
  previousDepth: RUNNER_COLLISION_DEPTH - 0.001,
  speed: 0.2,
  hp: 2,
  maxHp: 2,
  hitFlash: 0,
  active: true,
})
engine.update(0.02)
assert.equal(runner.hp, hpBeforeAvoid, '未占用通道的敌人应被避开')
assert.equal(runner.entities.length, 0)

runner.entities.push({
  ...RUNNER_ENTITY_TYPES.brute,
  id: 501,
  lane: runner.currentLane,
  kind: 'enemy',
  depth: RUNNER_COLLISION_DEPTH - 0.001,
  previousDepth: RUNNER_COLLISION_DEPTH - 0.001,
  speed: 0.2,
  hp: 3,
  maxHp: 3,
  hitFlash: 0,
  active: true,
})
engine.update(0.02)
assert.equal(runner.hp, hpBeforeAvoid - RUNNER_ENTITY_TYPES.brute.damage)
assert.equal(runner.hitsTaken, 1)
console.log('✓ Runner collision only applies on the occupied lane')

// A bullet can only hit one closest target on its immutable launch lane.
runner.entities.length = 0
runner.bullets.length = 0
runner.attackDamage = 2
runner.entities.push({
  ...RUNNER_ENTITY_TYPES.scout,
  id: 600,
  lane: runner.currentLane,
  kind: 'enemy',
  depth: 0.5,
  previousDepth: 0.5,
  speed: 0,
  hp: 2,
  maxHp: 2,
  hitFlash: 0,
  active: true,
})
runner.bullets.push({ lane: runner.currentLane, depth: 0.55, previousDepth: 0.55 })
const scoreBefore = runner.score
engine.update(0.1)
assert.equal(runner.entities.length, 0)
assert.equal(runner.kills, 1)
assert.ok(runner.score > scoreBefore)
console.log('✓ Runner shooting resolves a single target, score and combo')

// Gates grant bounded attack, timed rapid fire, or healing.
runner.attackDamage = 1
runner._hitEntity({
  ...RUNNER_ENTITY_TYPES.attack,
  id: 700,
  lane: 1,
  depth: 0.5,
  hp: 1,
  maxHp: 1,
  active: true,
})
assert.equal(runner.attackDamage, 2)
runner._hitEntity({
  ...RUNNER_ENTITY_TYPES.rapid,
  id: 701,
  lane: 1,
  depth: 0.5,
  hp: 1,
  maxHp: 1,
  active: true,
})
assert.ok(runner.rapidFireTimer > 0)
runner.hp = 2
runner._hitEntity({
  ...RUNNER_ENTITY_TYPES.repair,
  id: 702,
  lane: 1,
  depth: 0.5,
  hp: 1,
  maxHp: 1,
  active: true,
})
assert.equal(runner.hp, 3)
assert.equal(runner.gates, 3)
console.log('✓ Runner attack, rapid-fire and repair rewards apply correctly')

// Gel shield gates add a bounded defensive resource and split multi-point damage correctly.
runner.shield = 0
runner._hitEntity({
  ...RUNNER_ENTITY_TYPES.guard,
  id: 703,
  lane: 1,
  depth: 0.5,
  hp: 1,
  maxHp: 1,
  active: true,
})
assert.equal(runner.shield, 1)
assert.equal(runner.maxShield, RUNNER_MAX_SHIELD)
const shieldHpBefore = runner.hp
runner._takeDamage({ lane: runner.currentLane, damage: 2 })
assert.equal(runner.shield, 0, '一层护盾只应吸收一点伤害')
assert.equal(runner.hp, shieldHpBefore - 1, '剩余一点伤害应扣除生命')
assert.equal(runner.shieldAbsorbed, 1)
assert.ok(runner.shieldFlash > 0, '部分吸收也应触发护盾破裂反馈')
assert.ok(runner.getHudSnapshot().maxShield === RUNNER_MAX_SHIELD)

runner.shield = RUNNER_MAX_SHIELD
const fullGuardScore = runner.score
runner._hitEntity({
  ...RUNNER_ENTITY_TYPES.guard,
  id: 704,
  lane: 1,
  depth: 0.5,
  hp: 1,
  maxHp: 1,
  active: true,
})
assert.equal(runner.shield, RUNNER_MAX_SHIELD)
assert.ok(runner.score >= fullGuardScore + RUNNER_ENTITY_TYPES.guard.score + 80)
console.log('✓ Runner gel shield absorbs exact damage and converts capped rewards')

// The 18-second mutation row offers one core per lane and resolves exactly one choice.
runner.entities.length = 0
runner.bullets.length = 0
runner.weaponCore = null
runner.weaponLevel = 0
runner.weaponChoicePending = false
runner._startWeaponChoice()
const choices = runner.entities.filter((entity) => entity.kind === 'mutation')
assert.equal(choices.length, 3)
assert.equal(new Set(choices.map((entity) => entity.weaponCore)).size, 3)
const pierceChoice = choices.find((entity) => entity.weaponCore === 'pierce')
pierceChoice.hp = runner.attackDamage
runner._hitEntity(pierceChoice)
assert.equal(runner.weaponCore, 'pierce')
assert.equal(runner.weaponLevel, 1)
assert.equal(runner.weaponChoicePending, false)
assert.ok(runner.entities.filter((entity) => entity.kind === 'mutation' && entity.active).length === 0)
runner._upgradeWeaponCore(2, 'test')
runner._upgradeWeaponCore(3, 'test')
assert.equal(runner.weaponLevel, 3)
assert.equal(runner.getHudSnapshot().fusion.level, 3)
assert.equal(runner.getHudSnapshot().fusion.id, 'pierce')
console.log('✓ Runner mutation row selects one weapon core and supports staged evolution')

// Rapid hits on one target aggregate into one readable damage number.
runner.damageNumbers.length = 0
runner.weaponCore = null
runner.weaponLevel = 0
runner.attackDamage = 1
const numberProbe = {
  ...RUNNER_ENTITY_TYPES.brute,
  id: 709,
  lane: runner.currentLane,
  depth: 0.55,
  hp: 20,
  maxHp: 20,
  active: true,
}
runner.entities.push(numberProbe)
runner._hitEntity(numberProbe)
runner._hitEntity(numberProbe)
assert.equal(runner.damageNumbers.length, 1)
assert.equal(runner.damageNumbers[0].value, 2)
console.log('✓ Runner damage numbers aggregate rapid hits per target')

// Pierce retains the projectile across targets and decays subsequent damage.
runner.entities.length = 0
runner.bullets.length = 0
runner.weaponCore = 'pierce'
runner.weaponLevel = 1
runner.attackDamage = 4
runner._fireCooldown = 999
const pierceNear = {
  ...RUNNER_ENTITY_TYPES.brute,
  id: 710,
  rowId: 20,
  lane: runner.currentLane,
  depth: 0.6,
  previousDepth: 0.6,
  speed: 0,
  baseSpeed: 0,
  hp: 20,
  maxHp: 20,
  corrosionStacks: 0,
  hitFlash: 0,
  active: true,
}
const pierceFar = { ...pierceNear, id: 711, depth: 0.5, previousDepth: 0.5 }
runner.entities.push(pierceNear, pierceFar)
const pierceBullet = runner._createBullet()
pierceBullet.depth = pierceBullet.previousDepth = 0.66
runner.bullets.push(pierceBullet)
runner._updateShooting(0.08)
assert.ok(pierceNear.hp < 20)
assert.equal(runner.bullets.length, 1, '贯穿首个目标后子弹应继续存在')
runner._updateShooting(0.08)
assert.ok(pierceFar.hp < 20)
assert.ok(20 - pierceFar.hp < 20 - pierceNear.hp, '后续贯穿伤害应衰减')

// Burst damages nearby targets on the same lane, but never leaks across lanes.
runner.entities.length = 0
runner.bullets.length = 0
runner.weaponCore = 'burst'
runner.weaponLevel = 1
const burstPrimary = { ...pierceNear, id: 720, depth: 0.55, previousDepth: 0.55, hp: 20 }
const burstSplash = { ...pierceNear, id: 721, depth: 0.5, previousDepth: 0.5, hp: 20 }
const otherLane = { ...pierceNear, id: 722, lane: (runner.currentLane + 1) % 3, depth: 0.53, hp: 20 }
runner.entities.push(burstPrimary, burstSplash, otherLane)
const burstBullet = runner._createBullet()
burstBullet.depth = burstBullet.previousDepth = 0.62
burstBullet.explosive = true
runner.bullets.push(burstBullet)
runner._updateShooting(0.06)
assert.ok(burstPrimary.hp < 20)
assert.ok(burstSplash.hp < 20)
assert.equal(otherLane.hp, 20)

// Corrosion builds stacks, ramps damage and partially bypasses shield armor.
runner.entities.length = 0
runner.bullets.length = 0
runner.weaponCore = null
runner.weaponLevel = 0
const shieldProbe = {
  ...pierceNear,
  ...RUNNER_ENTITY_TYPES.shield,
  id: 730,
  rowId: 30,
  lane: runner.currentLane,
  depth: 0.5,
  hp: 100,
  maxHp: 100,
  corrosionStacks: 0,
  active: true,
}
runner.entities.push(shieldProbe)
const baseShieldHit = runner._hitEntity(shieldProbe).damage
shieldProbe.hp = 100
runner.weaponCore = 'corrosion'
runner.weaponLevel = 1
const corrosionHit1 = runner._hitEntity(shieldProbe).damage
const corrosionHit2 = runner._hitEntity(shieldProbe).damage
assert.ok(corrosionHit1 > baseShieldHit, '腐蚀应部分穿透盾甲')
assert.ok(corrosionHit2 > corrosionHit1, '腐蚀层数应提高连续命中伤害')
assert.equal(shieldProbe.corrosionStacks, 2)

// Dual-Core Fusion weapons
runner.weaponCore = 'pierce'
runner.secondaryElement = 'lightning'
assert.equal(runner.fusionWeapon?.id, 'pierce_lightning')
assert.equal(runner.fusionWeapon?.name, '超导轨道炮')

runner.weaponCore = 'burst'
runner.secondaryElement = 'flame'
assert.equal(runner.fusionWeapon?.id, 'burst_flame')
assert.equal(runner.fusionWeapon?.name, '地狱火核弹')

runner.weaponCore = 'corrosion'
runner.secondaryElement = 'frost'
assert.equal(runner.fusionWeapon?.id, 'corrosion_frost')
shieldProbe.frostTimer = 3.0
const brittleHit = runner._hitEntity(shieldProbe).damage
assert.ok(brittleHit > corrosionHit1, '脆化霜蚀对冰冻减速目标有增伤')

// Tactical pickups and interactive objects
runner._activateMagnet()
assert.ok(runner.tacticalStats.magnets >= 1, '磁暴仪应记录使用')

runner._activateBulletTime()
assert.equal(runner.bulletTimeTimer, 3.5, '时空力场应赋予3.5s子弹时间')

runner._activateHyperBooster()
assert.equal(runner.hyperBoostTimer, 2.5, '超频踏板应赋予2.5s金身冲刺')

runner._activateDrone()
assert.equal(runner.droneTimer, 10.0, '浮游炮应召唤10s辅助射击')

const barrelEntity = { ...RUNNER_ENTITY_TYPES.barrel, id: 990, lane: 1, depth: 0.5, hp: 3, maxHp: 3, active: true }
const adjacentEnemy = { ...RUNNER_ENTITY_TYPES.scout, id: 991, lane: 0, depth: 0.5, hp: 10, maxHp: 10, active: true }
runner.entities.push(barrelEntity, adjacentEnemy)
runner._defeatEntity(barrelEntity)
assert.equal(runner.tacticalStats.barrels, 1, '射爆油桶应记录统计')
assert.ok(adjacentEnemy.hp < 10, '炸药殉爆应对临近敌人造成高额范围伤害')
assert.ok(runner.groundFires.length > 0, '炸药殉爆应在地面留下燃烧火海')

console.log('✓ Runner dual fusion, tactical items, barrels and ground fires verified')

// Priest reduction, charger telegraph and splitter fragments form distinct enemy behaviors.
runner.weaponCore = null
runner.weaponLevel = 0
runner.attackDamage = 10
runner.entities.length = 0
const protectedEnemy = { ...pierceNear, id: 740, rowId: 40, hp: 100, maxHp: 100, active: true }
const priest = {
  ...protectedEnemy,
  ...RUNNER_ENTITY_TYPES.priest,
  id: 741,
  rowId: 40,
  behavior: 'support',
  supportReduction: RUNNER_ENTITY_TYPES.priest.supportReduction,
  hp: 100,
  maxHp: 100,
  active: true,
}
runner.entities.push(protectedEnemy, priest)
const protectedHit = runner._hitEntity(protectedEnemy).damage
priest.active = false
protectedEnemy.hp = 100
const exposedHit = runner._hitEntity(protectedEnemy).damage
assert.ok(protectedHit < exposedHit)

const charger = {
  ...protectedEnemy,
  ...RUNNER_ENTITY_TYPES.charger,
  id: 742,
  depth: 0.51,
  baseSpeed: 0.2,
  speed: 0.2,
  chargeAt: 0.5,
  chargeDelay: 0.72,
  chargeMultiplier: 2.65,
  chargeTelegraph: 0,
  chargeStarted: false,
  charging: false,
}
runner._updateCharger(charger, 0.1)
assert.ok(charger.chargeTelegraph > 0)
runner._updateCharger(charger, 0.7)
assert.equal(charger.charging, true)
assert.ok(charger.speed > charger.baseSpeed)

runner.entities.length = 0
const splitter = {
  ...protectedEnemy,
  ...RUNNER_ENTITY_TYPES.splitter,
  id: 743,
  rowId: 43,
  depth: 0.52,
  baseSpeed: 0.2,
  speed: 0.2,
  hp: 1,
  maxHp: 12,
  active: true,
}
runner.entities.push(splitter)
runner._hitEntity(splitter)
assert.equal(runner.entities.filter((entity) => entity.type === 'fragment').length, 2)
console.log('✓ Runner shield, priest, charger and splitter behaviors are mechanically distinct')

// Archer and mage attacks are telegraphed, lane-safe and answerable by player fire.
runner.entities.length = 0
runner.bullets.length = 0
runner.enemyProjectiles.length = 0
runner.weaponCore = null
runner.weaponLevel = 0
runner.attackDamage = 3
runner._enemyAttackCooldown = 0
const archer = {
  ...RUNNER_ENTITY_TYPES.archer,
  id: 750,
  lane: 0,
  depth: RUNNER_ENTITY_TYPES.archer.attackAt + 0.01,
  previousDepth: RUNNER_ENTITY_TYPES.archer.attackAt + 0.01,
  speed: 0.2,
  baseSpeed: 0.2,
  attackTimer: 0,
  attackLane: null,
  attackLanes: null,
  attacking: false,
  hasAttacked: false,
  hp: 20,
  maxHp: 20,
  active: true,
}
runner._updateRangedEnemy(archer, 0.01)
assert.equal(archer.attacking, true)
assert.equal(archer.attackLane, runner.occupiedLane)
runner._updateRangedEnemy(archer, archer.attackDelay + 0.01)
assert.equal(runner.enemyProjectiles.length, 1)
const arrow = runner.enemyProjectiles[0]
arrow.depth = arrow.previousDepth = 0.6
arrow.hp = 1
runner._fireCooldown = 999
runner.bullets.push({
  lane: arrow.lane,
  depth: 0.66,
  previousDepth: 0.66,
  core: null,
  coreLevel: 0,
  damageMultiplier: 1,
  remainingHits: 0,
  pierceDecay: 1,
  explosive: false,
})
runner._updateShooting(0.06)
assert.equal(arrow.active, false, '迎面箭矢应能被玩家子弹击毁')

runner._enemyAttackCooldown = 0
const mage = {
  ...RUNNER_ENTITY_TYPES.mage,
  id: 751,
  lane: 2,
  depth: RUNNER_ENTITY_TYPES.mage.attackAt + 0.01,
  previousDepth: RUNNER_ENTITY_TYPES.mage.attackAt + 0.01,
  speed: 0.2,
  baseSpeed: 0.2,
  attackTimer: 0,
  attackLane: null,
  attackLanes: null,
  attacking: false,
  hasAttacked: false,
  hp: 20,
  maxHp: 20,
  active: true,
}
const occupiedBeforeCast = runner.occupiedLane
runner._updateRangedEnemy(mage, 0.01)
assert.equal(mage.attacking, true)
assert.equal(mage.attackLanes.length, 2)
assert.ok(mage.attackLanes.includes(occupiedBeforeCast), '法师应封锁施法时玩家所在路')
assert.ok(!mage.attackLanes.includes(mage.safeLane), '法师必须保留一条安全路')
const hpBeforeSafeCast = runner.hp
runner.lanePosition = mage.safeLane
runner.targetLane = mage.safeLane
runner.currentLane = mage.safeLane
runner._updateRangedEnemy(mage, mage.attackDelay + 0.01)
assert.equal(runner.hp, hpBeforeSafeCast, '进入安全路后不应受到双路术式伤害')

const secondArcher = { ...archer, id: 752, attacking: false, hasAttacked: false }
const secondMage = { ...mage, id: 753, attacking: false, hasAttacked: false }
runner._enemyAttackCooldown = 0
runner._updateRangedEnemy(secondArcher, 0.01)
runner._updateRangedEnemy(secondMage, 0.01)
assert.equal(secondArcher.attacking, true)
assert.equal(secondMage.attacking, false, '强制换线威胁之间必须保留反应间隔')
console.log('✓ Runner archer and mage attacks are telegraphed, destructible and lane-safe')

// Test blitz, marathon, and endless submodes
runner.reset(1, 'blitz')
assert.equal(runner.duration, 60)
assert.equal(runner.submode, 'blitz')
assert.equal(runner.submodeConfig.weaponChoiceTime, 10)

runner.reset(1, 'marathon')
assert.equal(runner.duration, 180)
assert.equal(runner.submode, 'marathon')
assert.equal(runner.submodeConfig.weaponChoiceTime, 25)

runner.reset(1, 'endless')
assert.equal(runner.duration, Infinity)
assert.equal(runner.submode, 'endless')
const endlessHud = runner.getHudSnapshot()
assert.equal(endlessHud.isEndless, true)
assert.equal(endlessHud.remaining, null)

// A simple telegraph-aware bot should survive most full runs across many seeds.
const simulationSound = new Proxy({}, { get: () => () => {} })
const chooseSimulationLane = (simulation) => {
  const castingMage = simulation.entities.find(
    (entity) => entity.active && entity.behavior === 'mage' && entity.attacking
  )
  if (castingMage?.safeLane != null) return castingMage.safeLane

  const risk = [0, 0, 0]
  for (const projectile of simulation.enemyProjectiles) {
    if (projectile.active && projectile.depth > 0.62) risk[projectile.lane] += 20 + projectile.depth * 10
  }
  for (const entity of simulation.entities) {
    if (!entity.active || entity.kind === 'mutation') continue
    if (entity.kind === 'gate') {
      if (entity.depth > 0.42) risk[entity.lane] -= entity.reward === 'shield' ? 3 : 1
      continue
    }
    if (entity.depth < 0.58) continue
    const urgency = (entity.depth - 0.52) * 18
    risk[entity.lane] += urgency * Math.max(1, entity.damage || 1)
    if (entity.charging) risk[entity.lane] += 8
  }
  risk[simulation.targetLane] -= 0.35
  return risk.indexOf(Math.min(...risk))
}

let simulationVictories = 0
for (let seed = 1; seed <= 60; seed++) {
  const simulation = new RunnerGameplay()
  const simulationGame = {
    width: 1280,
    height: 720,
    ctx: ctx2d,
    input: { state: { left: false, right: false } },
    sound: simulationSound,
    finishGameplay() {},
  }
  simulation.attach(simulationGame)
  simulation.reset(seed, 'blitz')
  simulation.state = 'active'
  simulation.countdown = 0
  for (let frame = 0; frame < simulation.duration * 30 + 2 && simulation.state === 'active'; frame++) {
    simulation.targetLane = chooseSimulationLane(simulation)
    simulation.updateWorld(1 / 30)
  }
  if (simulation.outcome === 'victory') simulationVictories += 1
  simulation.destroy()
}
assert.ok(simulationVictories >= 48, `基础走位策略应至少通过 48/60 个种子，实际 ${simulationVictories}/60`)
console.log(`✓ Runner telegraph-aware bot survives ${simulationVictories}/60 seeded full runs`)

// ---------------------------------------------------------------------------
// Phase A0 — 战术增益生命周期正确性（hyper boost / bullet time / drone / 地火）。
// 这些断言锁定 RunnerRules 已经声明的生命周期确实被执行链真实驱动：
// 属于回归护栏，不做数值平衡判断。
// ---------------------------------------------------------------------------
const stepRunner = (frames, dt = 1 / 60) => {
  for (let i = 0; i < frames; i++) engine.update(dt)
}

/** 重置到一个空场面的活跃局，避免刷怪/既有实体污染受控测量。 */
const prepareRunner = (seed, submode) => {
  engine.resetGameplaySession(seed, submode)
  runner.state = 'active'
  runner.countdown = 0
  runner.entities.length = 0
  runner.enemyProjectiles.length = 0
  runner.groundFires.length = 0
  runner.bullets.length = 0
  runner.hp = runner.maxHp
  runner.shield = 0
  runner._encounterTimer = 9999 // 让世界保持空旷，推进量只来自受控实体
}

/** 用 Director 产出的完整字段模板构造受控敌人，避免手工漏字段。 */
const makeProbeEnemy = (id, lane, depth, speed, hp) => {
  const generated = runner.director.createEncounter(0, 0, 'blitz')
  const template = generated.find((entity) => entity.kind === 'enemy') || generated[0]
  return {
    ...template,
    id,
    rowId: 1,
    lane,
    depth,
    previousDepth: depth,
    speed,
    baseSpeed: speed,
    hp,
    maxHp: hp,
    hitFlash: 0,
    active: true,
    behavior: null,
    charging: false,
    chargeTelegraph: 0,
    attackTimer: 0,
    attacking: false,
    hasAttacked: false,
    attackLanes: null,
    attackLane: null,
    projectileDamage: 0,
    projectileHp: 0,
    corrosionStacks: 0,
    armor: 0,
    supportReduction: 0,
  }
}

// Test A — hyper boost 必须经由正式更新路径自然到期，并解除无敌。
prepareRunner(4242, 'blitz')
runner._activateHyperBooster()
assert.equal(runner.hyperBoostTimer, 2.5, '超频踏板应赋予 2.5s 金身')
const boostedHp = runner.hp
runner._takeDamage({ lane: runner.currentLane, depth: RUNNER_COLLISION_DEPTH, damage: 2 })
assert.equal(runner.hp, boostedHp, '增益生效期间应免疫伤害')
stepRunner(60)
assert.ok(
  runner.hyperBoostTimer < 2.5 && runner.hyperBoostTimer > 0,
  `hyperBoostTimer 必须随 dt 递减，实际 ${runner.hyperBoostTimer}`
)
stepRunner(120) // 累计 3.0s > 2.5s
assert.equal(runner.hyperBoostTimer, 0, 'hyperBoostTimer 到期必须归零')
runner.entities.length = 0
runner.enemyProjectiles.length = 0
runner._takeDamage({ lane: runner.currentLane, depth: RUNNER_COLLISION_DEPTH, damage: 2 })
assert.equal(runner.hp, boostedHp - 2, '增益结束后必须真实扣血（不得永久无敌）')
console.log('✓ Runner hyper boost expires on the real update path and ends invulnerability')

// Test B — drone 必须到期，并在到期后停止协同射击。
prepareRunner(4343, 'blitz')
runner._activateDrone()
assert.equal(runner.droneTimer, 10.0, '浮游炮应召唤 10s 协同射击')
stepRunner(60)
assert.ok(
  runner.droneTimer < 10.0 && runner.droneTimer > 0,
  `droneTimer 必须随 dt 递减，实际 ${runner.droneTimer}`
)
stepRunner(9 * 60 + 5)
assert.equal(runner.droneTimer, 0, 'droneTimer 到期必须归零')

runner.entities.length = 0
runner.enemyProjectiles.length = 0
runner.bullets.length = 0
runner._fireCooldown = 0 // 单发：负值会触发 catch-up 补射，不用于本断言
engine.update(1 / 60)
assert.equal(runner.bullets.length, 1, 'drone 到期后只应保留玩家自身弹道')

runner._activateDrone()
runner.entities.length = 0
runner.bullets.length = 0
runner._fireCooldown = 0
engine.update(1 / 60)
assert.equal(runner.bullets.length, 2, 'drone 生效期间应同时存在玩家与僚机弹道')
console.log('✓ Runner drone expires and stops contributing shots afterwards')

// Test C — bullet time 必须真实压缩世界推进，且自身计时按真实 dt 递减。
const BULLET_TIME_DILATION = RUNNER_TACTICAL_ITEMS.bullet_time.dilation
const measureEntityAdvance = (activateBulletTime) => {
  prepareRunner(4444, 'blitz')
  const probe = makeProbeEnemy(9001, 0, 0.1, 0.2, 999)
  runner.entities.push(probe)
  if (activateBulletTime) runner._activateBulletTime()
  const timerAtStart = runner.bulletTimeTimer
  const depthAtStart = probe.depth
  stepRunner(60) // 1.0s 真实时间
  return {
    delta: probe.depth - depthAtStart,
    timerElapsed: timerAtStart - runner.bulletTimeTimer,
  }
}
const normalAdvance = measureEntityAdvance(false)
const dilatedAdvance = measureEntityAdvance(true)
assert.ok(
  Math.abs(normalAdvance.delta - 0.2) < 1e-9,
  `无子弹时间时敌人应按真实速度推进，实际 ${normalAdvance.delta}`
)
assert.ok(
  Math.abs(dilatedAdvance.delta - normalAdvance.delta * BULLET_TIME_DILATION) < 1e-9,
  `子弹时间必须把世界推进压缩到 ${BULLET_TIME_DILATION} 倍，实际 ${dilatedAdvance.delta}`
)
assert.ok(
  Math.abs(dilatedAdvance.timerElapsed - 1.0) < 1e-9,
  `bulletTimeTimer 自身必须按真实 dt 递减，实际 ${dilatedAdvance.timerElapsed}`
)

// 持续时间不得被自身 dilation 放大
prepareRunner(4445, 'blitz')
runner._activateBulletTime()
stepRunner(Math.ceil(RUNNER_TACTICAL_ITEMS.bullet_time.duration * 60) + 2)
assert.equal(runner.bulletTimeTimer, 0, '子弹时间必须在 3.5s 真实时间后结束')
console.log('✓ Runner bullet time dilates world advance and expires on real time')

// Test D — 地火必须通过 updateWorld 推进、持续伤害并过期清理。
prepareRunner(4545, 'blitz')
const groundFire = { id: 1, lane: 0, depth: 0.4, duration: 1.0, maxDuration: 1.0, damage: 1.0 }
runner.groundFires.push(groundFire)
const burningVictim = makeProbeEnemy(9002, 0, 0.4, 0, 40)
runner.entities.push(burningVictim)
const fireDepthBefore = groundFire.depth
const fireDurationBefore = groundFire.duration
const victimHpBefore = burningVictim.hp
engine.update(1 / 60)
assert.ok(groundFire.depth > fireDepthBefore, 'ground fire 必须随 updateWorld 向前推进')
assert.ok(groundFire.duration < fireDurationBefore, 'ground fire 生命周期必须随 dt 递减')
assert.ok(burningVictim.hp < victimHpBefore, 'ground fire 必须对同车道目标造成持续伤害')
stepRunner(90) // 累计 1.5s > duration 1.0
assert.ok(!runner.groundFires.includes(groundFire), '过期 ground fire 必须被清理')
console.log('✓ Runner ground fires advance, burn and expire through updateWorld')

// Test E — 地火数量必须有界，防止长局无界增长。
prepareRunner(4646, 'blitz')
for (let i = 0; i < 60; i++) {
  runner.entities.length = 0 // 隔离连锁殉爆，保证每次只推入一个火海
  const barrel = makeProbeEnemy(5000 + i, i % 3, 0.2 + (i % 5) * 0.12, 0, 3)
  barrel.type = 'barrel'
  barrel.kind = 'obstacle'
  barrel.behavior = 'barrel'
  runner.entities.push(barrel)
  runner._defeatEntity(barrel)
}
assert.ok(
  runner.groundFires.length <= RUNNER_MAX_GROUND_FIRES,
  `连续引爆后 ground fire 数量必须受上限约束，实际 ${runner.groundFires.length}`
)
assert.ok(runner.groundFires.length > 0, '炸药殉爆仍应留下火海')
stepRunner(Math.ceil(3.0 * 60) + 30)
assert.equal(runner.groundFires.length, 0, '全部火海到期后必须被清空')
console.log('✓ Runner ground fires stay bounded and drain to empty')

// Test F — 180s 长局 soak：不得残留永久增益，数组不得无界增长或出现 NaN。
{
  const soak = new RunnerGameplay()
  const soakGame = {
    width: 1280,
    height: 720,
    ctx: ctx2d,
    input: { state: { left: false, right: false } },
    sound: simulationSound,
    finishGameplay() {},
  }
  soak.attach(soakGame)
  soak.reset(2024, 'marathon')
  soak.state = 'active'
  soak.countdown = 0
  // soak 只验证生命周期/内存稳定性，用高血量排除战斗平衡对结果的干扰。
  soak.maxHp = 1e6
  soak.hp = soak.maxHp
  let maxGroundFires = 0
  let frames = 0
  const maxFrames = Math.ceil(soak.duration * 30) + 2
  for (; frames < maxFrames && soak.state === 'active'; frames++) {
    soak.hp = soak.maxHp
    soak.targetLane = chooseSimulationLane(soak)
    soak.updateWorld(1 / 30)
    if (soak.groundFires.length > maxGroundFires) maxGroundFires = soak.groundFires.length
  }
  assert.equal(soak.state, 'finished', '180s 局必须正常结束')
  assert.equal(soak.outcome, 'victory', '无伤跑完 180s 应判定为突围成功')
  assert.equal(soak.elapsedTime, 180)
  assert.equal(soak.hyperBoostTimer, 0, '长局结束不得残留 hyper boost')
  assert.equal(soak.bulletTimeTimer, 0, '长局结束不得残留 bullet time')
  assert.equal(soak.droneTimer, 0, '长局结束不得残留 drone')
  assert.ok(maxGroundFires <= RUNNER_MAX_GROUND_FIRES, `地火峰值越界：${maxGroundFires}`)
  assert.ok(Number.isFinite(soak.score) && Number.isFinite(soak.elapsedTime))
  assert.ok(soak.entities.every((e) => Number.isFinite(e.depth) && Number.isFinite(e.hp)))
  assert.ok(soak.groundFires.every((f) => Number.isFinite(f.depth) && Number.isFinite(f.duration)))
  assert.ok(soak.bullets.every((b) => Number.isFinite(b.depth)))
  soak.destroy()
}
console.log('✓ Runner 180s soak drains every buff and keeps arrays bounded')

// Defeat must stop the engine and emit one result; restart clears the pause lock.
engine.resetGameplaySession(9, 'marathon')
runner.state = 'active'
runner.countdown = 0
engine.start()
runner.hp = 1
runner.entities.length = 0
runner.entities.push({
  ...RUNNER_ENTITY_TYPES.scout,
  id: 800,
  lane: runner.currentLane,
  kind: 'enemy',
  depth: RUNNER_COLLISION_DEPTH - 0.001,
  previousDepth: RUNNER_COLLISION_DEPTH - 0.001,
  speed: 0.2,
  hp: 2,
  maxHp: 2,
  hitFlash: 0,
  active: true,
})
engine.update(0.02)
assert.equal(runner.state, 'finished')
assert.equal(result.outcome, 'defeat')
assert.equal(engine.running, false)
assert.equal(engine._pauseLock, 1)
const defeatResult = result
engine.update(1)
assert.equal(result, defeatResult, '结算只能发送一次')

engine.resetGameplaySession(9, 'marathon')
assert.equal(engine._pauseLock, 0)
assert.equal(runner.state, 'countdown')
assert.equal(runner.hp, RUNNER_MAX_HP)
console.log('✓ Runner defeat freezes cleanly and retry resets lifecycle state')

// Crossing duration produces victory and the final snapshot.
engine.start()
runner.state = 'active'
runner.countdown = 0
runner.elapsedTime = runner.duration - 0.01
runner._encounterTimer = 999
runner._fireCooldown = 999
runner.entities.length = 0
result = null
engine.update(0.02)
assert.equal(runner.state, 'finished')
assert.equal(result.outcome, 'victory')
assert.equal(result.distance, 0)
assert.equal(engine.running, false)
runner.renderWorld(ctx2d)
console.log('✓ Runner victory, result payload and renderer complete the loop across submodes')

const oldRunner = runner
const restored = engine.configureGameplay('arena')
assert.ok(restored instanceof ArenaGameplay)
assert.equal(oldRunner.game, null)
engine.destroy()
assert.equal(GameEngine.getInstance(), null)
console.log('\nGameplay smoke test passed ✓')
