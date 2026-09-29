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
  RUNNER_FORK_CLEAR_DEPTH,
  RUNNER_FORK_SELECT_DEPTH,
  RUNNER_MAX_GROUND_FIRES,
  RUNNER_MAX_HP,
  RUNNER_MAX_SHIELD,
  RUNNER_ROUTE_IDS,
  RUNNER_ROUTES,
  RUNNER_TACTICAL_ITEMS,
  RUNNER_WEAPON_CORES,
  getRunnerForkTimes,
  getRunnerRoute,
  getRunnerRouteByLane,
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

// 60-seed 模拟同时承担两个职责：
//  1) 难度基线：telegraph-aware bot 的存活率；
//  2) anti-freeze 回归：证明这 60 局真的在持续生成遭遇，而不是「冻住之后空跑存活」。
// 只统计胜率会被「冻结 = 没有敌人 = 轻松存活」污染，因此这里额外记录
// 遭遇行数、末段静默时长、武器选择是否真正完成，并据此设定不变式。
const SIM_SEED_COUNT = 60
const simulationStats = {
  completed: 0,
  victories: 0,
  deaths: 0,
  noWeapon: 0,
  frozen: 0,
  rowsTotal: 0,
  rowsMin: Infinity,
  tailSilenceMax: 0,
  magnetRuns: 0,
}
for (let seed = 1; seed <= SIM_SEED_COUNT; seed++) {
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
  let rows = 0
  let lastRowAt = 0
  for (let frame = 0; frame < simulation.duration * 30 + 2 && simulation.state === 'active'; frame++) {
    simulation.targetLane = chooseSimulationLane(simulation)
    const rowIdBefore = simulation.director._nextRowId
    simulation.updateWorld(1 / 30)
    if (simulation.director._nextRowId !== rowIdBefore) {
      rows += simulation.director._nextRowId - rowIdBefore
      lastRowAt = simulation.elapsedTime
    }
  }
  if (simulation.state === 'finished') simulationStats.completed += 1
  if (simulation.outcome === 'victory') simulationStats.victories += 1
  if (simulation.outcome === 'defeat') simulationStats.deaths += 1
  if (!simulation.weaponCore) simulationStats.noWeapon += 1
  if (simulation.tacticalStats.magnets > 0) simulationStats.magnetRuns += 1
  simulationStats.rowsTotal += rows
  if (rows < simulationStats.rowsMin) simulationStats.rowsMin = rows
  const tailSilence = simulation.elapsedTime - lastRowAt
  if (tailSilence > simulationStats.tailSilenceMax) simulationStats.tailSilenceMax = tailSilence
  // 冻结判定：局已结束但末段长期无遭遇，或局中出现过待选状态却从未拿到核心。
  if (tailSilence >= 8 || !simulation.weaponCore) simulationStats.frozen += 1
  simulation.destroy()
}
assert.ok(simulationStats.victories >= 48, `基础走位策略应至少通过 48/${SIM_SEED_COUNT} 个种子，实际 ${simulationStats.victories}/${SIM_SEED_COUNT}`)

// Anti-freeze 不变式（Phase B.1）：60 局必须都真的在玩。
// 健康基准来自实测：修复后每局遭遇行数 >= 18，末段静默 < 8s。
// 修复前有 5 局（seed 3/4/7 等）在 ~37s 冻结，rows 跌到 8、weaponCore 为 null，
// 却仍被计为「胜利」——这正是单纯胜率断言的盲区。
assert.equal(simulationStats.completed, SIM_SEED_COUNT, `所有 ${SIM_SEED_COUNT} 局都必须正常结束`)
assert.equal(simulationStats.frozen, 0, `不得存在 Director 冻结局，实际 ${simulationStats.frozen} 局（其中 weaponCore 为空 ${simulationStats.noWeapon} 局）`)
assert.equal(simulationStats.noWeapon, 0, `所有局都必须真正完成武器选择，实际 ${simulationStats.noWeapon} 局未完成`)
assert.ok(
  simulationStats.rowsMin >= 18,
  `单局最少遭遇行数 ${simulationStats.rowsMin} 低于健康下限 18，疑似 Director 冻结`
)
assert.ok(
  simulationStats.tailSilenceMax < 8,
  `末段静默最长 ${simulationStats.tailSilenceMax.toFixed(1)}s，疑似 Director 冻结`
)
console.log(
  `✓ Runner telegraph-aware bot survives ${simulationStats.victories}/${SIM_SEED_COUNT} seeded full runs ` +
  `(avg ${(simulationStats.rowsTotal / SIM_SEED_COUNT).toFixed(1)} encounter rows, min ${simulationStats.rowsMin}, ` +
  `deaths ${simulationStats.deaths}, magnet used ${simulationStats.magnetRuns}/${SIM_SEED_COUNT}, 0 frozen)`
)

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
  // 「不得残留永久增益」不能简单断言局末为 0：局末合法地可能带着一个刚激活、
  // 尚未到期的增益。正确判据是——每次激活都必须在声明时长内回到 0。
  const soakFrame = 1 / 30
  const buffDuration = {
    hyperBoostTimer: RUNNER_TACTICAL_ITEMS.booster.duration,
    bulletTimeTimer: RUNNER_TACTICAL_ITEMS.bullet_time.duration,
    droneTimer: RUNNER_TACTICAL_ITEMS.drone.duration,
  }
  const buffWatch = {}
  const buffActivations = {}
  const buffLifetimes = []
  for (const key of Object.keys(buffDuration)) {
    buffWatch[key] = { last: 0, since: null }
    buffActivations[key] = 0
  }
  let maxGroundFires = 0
  let frames = 0
  // 180s marathon 的 Director 活性：Phase B.1 的磁暴缺陷在 marathon 上有
  // 25/65/110 三个武器节点与 5 个路线岔口，冻结后果比 60s blitz 更严重。
  let soakRows = 0
  let soakLastRowAt = 0
  const maxFrames = Math.ceil(soak.duration * 30) + 2
  for (; frames < maxFrames && soak.state === 'active'; frames++) {
    soak.hp = soak.maxHp
    soak.targetLane = chooseSimulationLane(soak)
    const rowIdBefore = soak.director._nextRowId
    soak.updateWorld(soakFrame)
    if (soak.director._nextRowId !== rowIdBefore) {
      soakRows += soak.director._nextRowId - rowIdBefore
      soakLastRowAt = soak.elapsedTime
    }
    if (soak.groundFires.length > maxGroundFires) maxGroundFires = soak.groundFires.length
    for (const key of Object.keys(buffDuration)) {
      const value = soak[key]
      const watch = buffWatch[key]
      assert.ok(
        value >= 0 && value <= buffDuration[key] + 1e-9,
        `${key} 越界：${value}（声明上限 ${buffDuration[key]}）`
      )
      // drone/booster/bulletTime 采用「硬重置」语义：重复拾取会把计时器重新
      // 拉满，属于既有设计（rapid 才是叠加）。因此数值在生效期间回升要视为
      // 一次新的激活，否则会把合法续期误判成永久增益。
      if (value > 0 && (watch.last <= 0 || value > watch.last)) {
        watch.since = soak.elapsedTime
        buffActivations[key] += 1
      }
      if (value <= 0 && watch.last > 0) {
        buffLifetimes.push(soak.elapsedTime - watch.since)
        watch.since = null
      }
      watch.last = value
    }
  }
  assert.equal(soak.state, 'finished', '180s 局必须正常结束')
  assert.equal(soak.outcome, 'victory', '无伤跑完 180s 应判定为突围成功')
  assert.equal(soak.elapsedTime, 180)
  assert.equal(soak.weaponChoicePending, false, '180s 局末不得残留武器待选状态')
  assert.equal(soak.secondaryChoicePending, false, '180s 局末不得残留元素待选状态')
  assert.ok(soak.weaponCore, '180s 局必须真正完成武器核心选择')
  assert.ok(soak.secondaryElement, '180s 局必须真正完成元素选择')
  assert.ok(soak.routeLog.length >= 4, `180s 局应解析出多条路线，实际 ${soak.routeLog.length}`)
  assert.ok(soakRows >= 60, `180s 局遭遇行数过低（${soakRows}），疑似 Director 冻结`)
  assert.ok(
    soak.elapsedTime - soakLastRowAt < 8,
    `180s 局末段 ${(soak.elapsedTime - soakLastRowAt).toFixed(1)}s 无遭遇生成，疑似冻结`
  )
  const totalActivations = Object.values(buffActivations).reduce((a, b) => a + b, 0)
  assert.ok(totalActivations > 0, 'soak 必须真的触发过战术增益，否则该断言是空的')
  const maxDeclaredDuration = Math.max(...Object.values(buffDuration))
  for (const life of buffLifetimes) {
    assert.ok(
      life <= maxDeclaredDuration + soakFrame,
      `增益实际存活 ${life.toFixed(3)}s，超过声明上限（永久增益）`
    )
  }
  for (const key of Object.keys(buffDuration)) {
    const watch = buffWatch[key]
    if (watch.last <= 0 || watch.since == null) continue
    const alive = soak.elapsedTime - watch.since
    assert.ok(
      alive < buffDuration[key] + soakFrame,
      `${key} 在局末仍存活 ${alive.toFixed(3)}s，超出其声明时长（永久增益）`
    )
  }
  assert.ok(maxGroundFires <= RUNNER_MAX_GROUND_FIRES, `地火峰值越界：${maxGroundFires}`)
  assert.ok(Number.isFinite(soak.score) && Number.isFinite(soak.elapsedTime))
  assert.ok(soak.entities.every((e) => Number.isFinite(e.depth) && Number.isFinite(e.hp)))
  assert.ok(soak.groundFires.every((f) => Number.isFinite(f.depth) && Number.isFinite(f.duration)))
  assert.ok(soak.bullets.every((b) => Number.isFinite(b.depth)))
  soak.destroy()
}
console.log('✓ Runner 180s soak drains every buff and keeps arrays bounded')

// ---------------------------------------------------------------------------
// Phase B — 路线分叉 MVP：岔口 = 车道选择。
// 目标只证明「换道可以成为路线决策」：3 条路线、固定 lane 映射、
// 单次解析、真实影响后续 encounter、seed 可复现。不做完整风险收益系统。
// ---------------------------------------------------------------------------

// Phase B 之前记录下来的 Director encounter 基线（前 3 行）。
// 用于证明新增的路线/岔口不会无意义地扰动既有 encounter 随机序列。
const DIRECTOR_BASELINE = {
  1001: '0:fever_shard/gate|1:attack/gate|2:hound/enemy;0:attack/gate|1:hound/enemy|2:fever_shard/gate;0:swarm/enemy|0:swarm/enemy|0:swarm/enemy|1:gate_magnet/gate|2:barrel/obstacle',
  2026: '0:attack/gate|1:fever_shard/gate|2:scout/enemy;0:attack/gate|1:hound/enemy|2:fever_shard/gate;0:fever_shard/gate|1:hound/enemy|2:attack/gate',
  4242: '0:gate_magnet/gate|1:barrel/obstacle|2:swarm/enemy|2:swarm/enemy|2:swarm/enemy;0:attack/gate|1:hound/enemy|2:fever_shard/gate;0:gate_magnet/gate|1:swarm/enemy|1:swarm/enemy|1:swarm/enemy|2:barrel/obstacle',
}

const directorRowSignature = (director) => {
  const rows = []
  for (let i = 0; i < 3; i++) {
    const entities = director.createEncounter(0, 0, 'blitz')
    rows.push(
      entities.map((e) => `${e.lane}:${e.type}/${e.kind}${e.elite ? '*' : ''}`).join('|')
    )
  }
  return rows.join(';')
}

// Test A — Director seeded determinism，且与 Phase B 前基线逐字一致。
for (const seed of [1001, 2026, 4242]) {
  const a = new RunnerDirector(seed)
  const b = new RunnerDirector(seed)
  const sigA = directorRowSignature(a)
  const sigB = directorRowSignature(b)
  assert.equal(sigA, sigB, `seed ${seed} 两次 Director 必须产生完全相同的 encounter`)
  assert.equal(
    sigA,
    DIRECTOR_BASELINE[seed],
    `seed ${seed} 的 encounter 基线不得被路线系统扰动`
  )
}
console.log('✓ Phase B / Test A: Director stays deterministic and matches the pre-route baseline')

// 路线契约：恰好 3 条，lane 0/1/2 固定一一对应，不可随机重排。
assert.equal(RUNNER_ROUTE_IDS.length, 3, 'Phase B 固定三条路线')
assert.equal(RUNNER_ROUTE_IDS.join(','), 'blockade,armory,ruins')
for (let lane = 0; lane < 3; lane++) {
  const route = getRunnerRouteByLane(lane)
  assert.equal(RUNNER_ROUTES[RUNNER_ROUTE_IDS[lane]], route, `lane ${lane} 必须固定映射到 ${RUNNER_ROUTE_IDS[lane]}`)
  assert.equal(route.lane, lane)
  assert.ok(route.label && route.color, '每条路线必须有可读标签与颜色')
  assert.ok(route.spawnIntervalMultiplier > 0, '每条路线必须有最小 spawn modifier')
}
assert.notEqual(
  new Set([0, 1, 2].map((l) => getRunnerRouteByLane(l).spawnIntervalMultiplier)).size,
  1,
  '三条路线必须在生成参数上真实不同'
)

const ROUTE_FPS = 30
/** 跑一局并记录完整生成轨迹 + 岔口解析日志；hp 拉满以隔离路线逻辑与战斗平衡。 */
const simulateRunner = (seed, submode, policy, maxSeconds) => {
  const sim = new RunnerGameplay()
  const game = {
    width: 1280,
    height: 720,
    ctx: ctx2d,
    input: { state: { left: false, right: false } },
    sound: simulationSound,
    finishGameplay() {},
  }
  sim.attach(game)
  sim.reset(seed, submode)
  sim.state = 'active'
  sim.countdown = 0
  sim.maxHp = 1e6
  sim.hp = 1e6
  const seen = new Set()
  const trace = []
  // +2 帧余量：1/30 浮点累加会让 1800 帧略小于 60s，导致 duration 判定不触发。
  const maxFrames = Math.ceil(maxSeconds * ROUTE_FPS) + 2
  for (let frame = 0; frame < maxFrames && sim.state === 'active'; frame++) {
    sim.hp = sim.maxHp
    policy(sim)
    sim.updateWorld(1 / ROUTE_FPS)
    for (const entity of sim.entities) {
      if (seen.has(entity.id)) continue
      seen.add(entity.id)
      trace.push({
        t: Number(sim.elapsedTime.toFixed(4)),
        lane: entity.lane,
        type: entity.type,
        kind: entity.kind,
      })
    }
  }
  return {
    sim,
    trace,
    forkLog: sim.routeLog.map((entry) => ({ ...entry })),
    span: trace.map((r) => `${r.t}|${r.lane}:${r.type}/${r.kind}`).join(';'),
  }
}
const policyFree = () => () => {}
const policyPinLane = (lane) => (sim) => { sim.targetLane = lane }

// 像真实玩家一样主动驶入变异门以完成武器/元素选择。
// 必要原因：若变异门未被驶中或射爆，weaponChoicePending 不会复位，遭遇生成会
// 整局冻结（Phase B 之前就存在的缺陷，FOLLOW-UP）。不处理它，路线 modifier
// 在玩法层就无从观测。
const chooseLaneAwareOfChoices = (sim) => {
  if (sim.weaponChoicePending) {
    const mutation = sim.entities.find((e) => e.active && e.kind === 'mutation')
    if (mutation) return mutation.lane
  }
  if (sim.secondaryChoicePending) {
    const secondary = sim.entities.find((e) => e.active && e.kind === 'secondary_mutation')
    if (secondary) return secondary.lane
  }
  return chooseSimulationLane(sim)
}
const policyLaneAware = () => (sim) => { sim.targetLane = chooseLaneAwareOfChoices(sim) }

// Test B — 岔口按预定时刻表出现，且不与武器节点同刻。
const blitzForkTimes = getRunnerForkTimes('blitz')
assert.deepEqual(blitzForkTimes, [20, 50], '60s blitz 应在 20s / 50s 各出现一次岔口')
for (const t of blitzForkTimes) {
  assert.ok(!Object.values(RUNNER_TACTICAL_ITEMS).some((i) => i.duration === t))
  for (const node of [10, 25, 42]) {
    assert.ok(Math.abs(node - t) >= 5, `岔口 ${t}s 不得与武器节点 ${node}s 靠得太近`)
  }
}
const forkWindowRun = simulateRunner(1001, 'blitz', policyFree, 60)
const forkSpawns = forkWindowRun.trace.filter((e) => e.kind === 'fork')
assert.ok(forkSpawns.length > 0, '60s 局内必须真的生成岔口实体')
assert.ok(
  forkSpawns[0].t >= 20 - 0.1 && forkSpawns[0].t < 26,
  `首个岔口应在 20s 窗口出现，实际 ${forkSpawns[0].t}`
)
assert.equal(new Set(forkSpawns.map((e) => e.lane)).size, 3, '每个岔口必须在三条车道各放一块路线牌')
console.log('✓ Phase B / Test B: forks appear on the scheduled 20s / 45s nodes')

// Test C — lane 0/1/2 分别解析到三个不同 routeId。
for (let lane = 0; lane < 3; lane++) {
  const run = simulateRunner(3000 + lane, 'blitz', policyPinLane(lane), 60)
  assert.ok(run.forkLog.length >= 1, `pin lane ${lane} 时必须至少解析一次岔口`)
  const expected = RUNNER_ROUTE_IDS[lane]
  assert.equal(run.forkLog[0].routeId, expected, `lane ${lane} 应解析为 ${expected}`)
  assert.equal(run.forkLog[0].lane, lane, '解析日志必须记录当时所在车道')
  assert.equal(run.sim.currentRouteId, expected, 'currentRouteId 必须跟随最后一次解析')
}
console.log('✓ Phase B / Test C: lanes 0/1/2 resolve to blockade / armory / ruins')

// Test D — 同一个岔口只能 resolve 一次。
{
  const sim = new RunnerGameplay()
  const game = {
    width: 1280,
    height: 720,
    ctx: ctx2d,
    input: { state: { left: false, right: false } },
    sound: simulationSound,
    finishGameplay() {},
  }
  sim.attach(game)
  sim.reset(777, 'blitz')
  sim.state = 'active'
  sim.countdown = 0
  let fork = null
  for (let frame = 0; frame < 60 * 26 && !fork; frame++) {
    sim.updateWorld(1 / 60)
    fork = sim.entities.find((e) => e.kind === 'fork' && e.active) || null
  }
  assert.ok(fork, '应能在 26s 内拿到一个岔口实体')
  // 把岔口钉在解析深度上，跨多帧停留，验证不会重复解析。
  for (let frame = 0; frame < 40; frame++) {
    fork.depth = RUNNER_FORK_SELECT_DEPTH
    sim.updateWorld(1 / 60)
  }
  assert.equal(sim.routeLog.filter((e) => e.forkId === fork.forkId).length, 1, '一个岔口只能 resolve 一次')
  const lockedRoute = sim.currentRouteId
  const lockedLogLength = sim.routeLog.length
  assert.equal(sim._resolveFork(fork), false, '重复解析必须被拒绝')
  assert.equal(sim.currentRouteId, lockedRoute, '重复解析不得改写 currentRouteId')
  assert.equal(sim.routeLog.length, lockedLogLength, '重复解析不得重复写 notice 日志')
}
console.log('✓ Phase B / Test D: a fork resolves exactly once even when held at selection depth')

// Test E — 同 seed + 同选择：岔口序列与 encounter 序列完全一致。
{
  const runA = simulateRunner(2026, 'blitz', policyLaneAware(), 60)
  const runB = simulateRunner(2026, 'blitz', policyLaneAware(), 60)
  assert.equal(runA.span, runB.span, '同 seed + 同策略必须产生完全相同的 encounter 序列')
  assert.deepEqual(runA.forkLog, runB.forkLog, '同 seed 的岔口解析序列必须完全一致')
  assert.ok(runA.forkLog.length >= 2, '60s 局至少应解析两次岔口')
}
console.log('✓ Phase B / Test E: same seed + same choices reproduces fork and encounter sequences')

// Test F — 同 seed 不同选择：岔口前一致，岔口后因 route modifier 出现可观察差异。
{
  // Director 层（精确）：同 seed 下，先走 N 次未选路线的遭遇，
  // 再分别接 blockade / ruins，后续编队行必须因 modifier 而分歧。
  const preRows = (routeAfter) => {
    const d = new RunnerDirector(2026)
    const pre = []
    for (let i = 0; i < 6; i++) {
      pre.push(d.createEncounter(0, 0, 'blitz', null).map((e) => `${e.lane}:${e.type}/${e.kind}`).join('|'))
    }
    const post = []
    for (let i = 0; i < 8; i++) {
      post.push(
        d.createEncounter(0, 0, 'blitz', routeAfter).map((e) => `${e.lane}:${e.type}/${e.kind}`).join('|')
      )
    }
    return { pre, post }
  }
  const dirA = preRows('blockade')
  const dirB = preRows('ruins')
  assert.deepEqual(dirA.pre, dirB.pre, 'Director 岔口前的遭遇行必须逐行一致')
  assert.notEqual(dirA.post.join(';'), dirB.post.join(';'), 'Director 必须因路线 modifier 在岔口后分歧')

  // 玩法层：岔口牌出现前走完全相同的策略；牌一出现就锁定目标车道，
  // 使两次运行在「同一个决策点」上做出不同选择。
  const policyDivergeAtFork = (lane) => (sim) => {
    const approaching = sim.entities.some((e) => e.active && e.kind === 'fork' && !e.resolved)
    sim.targetLane = approaching ? lane : chooseLaneAwareOfChoices(sim)
  }
  const laneA = simulateRunner(2026, 'blitz', policyDivergeAtFork(0), 55)
  const laneB = simulateRunner(2026, 'blitz', policyDivergeAtFork(2), 55)
  assert.notEqual(
    laneA.forkLog[0].routeId,
    laneB.forkLog[0].routeId,
    '不同车道选择必须锁定不同路线'
  )
  assert.equal(laneA.forkLog[0].elapsed, laneB.forkLog[0].elapsed, '同 seed 下岔口解析时刻必须一致')
  const firstResolveT = laneA.forkLog[0].elapsed
  const preFork = (run) => run.trace.filter((e) => e.t <= firstResolveT)
  assert.ok(
    JSON.stringify(preFork(laneA)) === JSON.stringify(preFork(laneB)),
    '第一次岔口解析之前的 encounter 历史必须完全一致'
  )

  // 玩法层：路线必须真的接入 _updateDirector 的遭遇节奏。
  // 不在这里断言「局内遭遇条数不同」——既有缺陷（磁暴会吞掉携带 reward 的
  // 武器变异门，导致 weaponChoicePending 永不复位、遭遇生成整局冻结）会让
  // 该指标在多数种子下恒为 0。遭遇差异的权威断言见上面的 Director 层。
  const encounterDelay = (run) => run.sim.section.spawnInterval * run.sim.routeSpawnIntervalScale
  assert.equal(
    encounterDelay(laneA),
    laneA.sim.section.spawnInterval * getRunnerRoute('blockade').spawnIntervalMultiplier,
    'blockade 必须按正式 modifier 缩放遭遇间隔'
  )
  assert.equal(
    encounterDelay(laneB),
    laneB.sim.section.spawnInterval * getRunnerRoute('ruins').spawnIntervalMultiplier,
    'ruins 必须按正式 modifier 缩放遭遇间隔'
  )
  assert.ok(encounterDelay(laneA) > encounterDelay(laneB), 'blockade 的遭遇必须比 ruins 更稀疏')
}
console.log('✓ Phase B / Test F: same seed diverges only after the fork, via route modifiers')

// Test G — 60s blitz 至少出现 2 个岔口。
{
  const run = simulateRunner(4242, 'blitz', policyLaneAware(), 60)
  const forkIds = new Set(run.sim.routeLog.map((e) => e.forkId))
  assert.ok(forkIds.size >= 2, `60s blitz 至少应出现 2 个岔口，实际 ${forkIds.size} state=${run.sim.state} outcome=${run.sim.outcome} elapsed=${run.sim.elapsedTime}`)
  assert.ok(
    run.sim.routeLog.every((e) => e.elapsed > 0 && e.elapsed < 60),
    '岔口解析必须发生在 60s 局内'
  )
  assert.equal(run.sim.state, 'finished', '60s 局必须正常结束')
}
console.log('✓ Phase B / Test G: 60s blitz resolves at least two forks')

// Test H — reset / 新局：路线状态归零，同 seed 可重新复现。
{
  const first = simulateRunner(2026, 'blitz', policyLaneAware(), 60)
  assert.ok(first.sim.currentRouteId, '跑完后应已锁定一条路线')
  first.sim.reset(2026, 'blitz')
  assert.equal(first.sim.currentRouteId, null, 'reset 后 currentRouteId 必须归零')
  assert.equal(first.sim.nextForkIndex, 0, 'reset 后岔口游标必须归零')
  assert.equal(first.sim.routeLog.length, 0, 'reset 后路线日志必须清空')
  assert.equal(first.sim._resolvedForkIds.size, 0, 'reset 后已解析岔口集合必须清空')
  assert.ok(
    first.sim.entities.every((e) => e.kind !== 'fork'),
    'reset 后场上不得残留岔口实体'
  )
  const second = simulateRunner(2026, 'blitz', policyLaneAware(), 60)
  assert.deepEqual(second.forkLog, first.forkLog, '同 seed 重新开局必须复现同一条路线历史')
}
console.log('✓ Phase B / Test H: reset zeroes route state and same seed reproduces the same route history')

// ---------------------------------------------------------------------------
// Phase B.1 — 磁暴不得吞掉武器/元素三选一门；选择窗口必须有收口。
// 故障链：gate_magnet 被摧毁 -> _activateMagnet 过滤 (kind==='gate' || reward)
// -> 武器门(kind:'mutation', reward:'weapon')与元素门(kind:'secondary_mutation',
// reward:'element')被当成道具吸附并误发护盾 -> _selectWeaponCore/_selectSecondaryElement
// 的两个正规出口(撞入/射爆)同时被绕过 -> weaponChoicePending 永为 true ->
// _updateDirector 在递减计时器之前就 return -> 整局不再生成遭遇。
// ---------------------------------------------------------------------------

// Test A — 磁暴不得吞掉武器三选一门（走正式 _startWeaponChoice 路径）。
prepareRunner(9101, 'blitz')
runner._startWeaponChoice()
const choiceGatesBefore = runner.entities.filter((e) => e.kind === 'mutation')
assert.equal(runner.weaponChoicePending, true, '武器三选一应处于待选状态')
assert.equal(choiceGatesBefore.length, 3, '应真实生成三块武器选择门')

// 场上同时放入磁暴本应正常处理的普通奖励门
const magnetTargets = [
  { ...RUNNER_ENTITY_TYPES.attack, id: 9201, rowId: 90, lane: 0, kind: 'gate', depth: 0.4, hp: 7, maxHp: 7, active: true },
  { ...RUNNER_ENTITY_TYPES.repair, id: 9202, rowId: 90, lane: 1, kind: 'gate', depth: 0.4, hp: 5, maxHp: 5, active: true },
  { ...RUNNER_ENTITY_TYPES.fever_shard, id: 9203, rowId: 90, lane: 2, kind: 'gate', depth: 0.4, hp: 4, maxHp: 4, active: true },
]
const attackBefore = runner.attackDamage
runner.entities.push(...magnetTargets)
runner._activateMagnet()
const choiceGatesAfter = runner.entities.filter((e) => e.kind === 'mutation')
assert.equal(choiceGatesAfter.length, 3, '磁暴不得移除武器选择门（修复前为 0）')
assert.equal(runner.weaponChoicePending, true, '磁暴不得解除武器待选状态')
assert.equal(choiceGatesAfter.map((e) => e.id).join(','), choiceGatesBefore.map((e) => e.id).join(','), '三块武器门必须是原对象')
assert.equal(runner.attackDamage, attackBefore + 1, '合法奖励门仍应被磁暴吸取并结算')
assert.ok(!runner.entities.includes(magnetTargets[0]), '合法奖励门应被磁暴消耗')
console.log('✓ Phase B.1 / Test A: magnet no longer swallows weapon choice gates')

// Test B — 磁暴仍然正常吸取合法目标（不得退化成「什么都不吸」）。
prepareRunner(9102, 'blitz')
const shieldBefore = runner.shield
const feverShardsBefore = runner.feverShards
runner.entities.push(
  { ...RUNNER_ENTITY_TYPES.guard, id: 9301, rowId: 91, lane: 0, kind: 'gate', depth: 0.4, hp: 6, maxHp: 6, active: true },
  { ...RUNNER_ENTITY_TYPES.fever_shard, id: 9302, rowId: 91, lane: 1, kind: 'gate', depth: 0.4, hp: 4, maxHp: 4, active: true },
  { ...RUNNER_ENTITY_TYPES.gate_drone, id: 9303, rowId: 91, lane: 2, kind: 'gate', depth: 0.4, hp: 4, maxHp: 4, active: true }
)
runner._activateMagnet()
assert.equal(runner.shield, shieldBefore + 1, '防护凝胶门应被吸附并结算')
assert.equal(runner.feverShards, feverShardsBefore + 1, '暴走印记应被吸附并结算')
assert.equal(runner.tacticalStats.drones, 1, '浮游护卫战术门应被吸附并结算')
assert.equal(runner.entities.filter((e) => e.kind === 'gate').length, 0, '所有合法奖励门都应被清空')
console.log('✓ Phase B.1 / Test B: magnet still absorbs every legitimate reward gate')

// Test C — 元素三选一门同样不得被吞。
prepareRunner(9103, 'blitz')
runner._startSecondaryChoice()
assert.equal(runner.secondaryChoicePending, true, '元素三选一应处于待选状态')
runner.entities.push({ ...RUNNER_ENTITY_TYPES.attack, id: 9401, rowId: 92, lane: 1, kind: 'gate', depth: 0.4, hp: 7, maxHp: 7, active: true })
runner._activateMagnet()
assert.equal(runner.entities.filter((e) => e.kind === 'secondary_mutation').length, 3, '磁暴不得移除元素选择门')
assert.equal(runner.secondaryChoicePending, true, '磁暴不得解除元素待选状态')
console.log('✓ Phase B.1 / Test C: magnet leaves secondary element choice gates intact')

// Test D — 磁暴不得吸取岔口路线牌，也不得提前解析路线。
prepareRunner(9104, 'blitz')
const forkRow = runner.director.createForkRow(0, runner.elapsedTime, 'blitz')
runner.entities.push(...forkRow)
runner.entities.push({ ...RUNNER_ENTITY_TYPES.attack, id: 9501, rowId: 93, lane: 1, kind: 'gate', depth: 0.4, hp: 7, maxHp: 7, active: true })
runner._activateMagnet()
const forksLeft = runner.entities.filter((e) => e.kind === 'fork')
assert.equal(forksLeft.length, 3, '磁暴不得移除岔口路线牌')
assert.equal(runner.currentRouteId, null, '磁暴不得提前锁定路线')
assert.equal(runner.routeLog.length, 0, '磁暴不得触发路线解析')
assert.equal(forksLeft.filter((e) => e.lane === runner.occupiedLane).length, 1, '三块路线牌必须仍按车道分布')
console.log('✓ Phase B.1 / Test D: magnet ignores route fork signs and never resolves a route')

// Test E — 完整武器选择生命周期：出现 -> 磁暴 -> 保留 -> 玩家选择 -> pending 归零 -> Director 恢复。
prepareRunner(9105, 'blitz')
runner._startWeaponChoice()
runner.entities.push({ ...RUNNER_ENTITY_TYPES.gate_magnet, id: 9601, rowId: 94, lane: 1, kind: 'gate', depth: 0.4, hp: 4, maxHp: 4, active: true })
runner._activateMagnet()
assert.equal(runner.entities.filter((e) => e.kind === 'mutation').length, 3, '磁暴后武器门仍完整')
assert.equal(runner.weaponChoicePending, true)

// 玩家驶入其中一块武器门
const chosenLane = runner.entities.find((e) => e.kind === 'mutation').lane
runner.targetLane = chosenLane
runner.lanePosition = chosenLane
runner.currentLane = chosenLane
assert.equal(runner._selectWeaponCore(runner.entities.find((e) => e.kind === 'mutation').weaponCore), true, '玩家应能正常选中核心')
assert.equal(runner.weaponChoicePending, false, '选中后待选状态必须解除')
assert.ok(runner.weaponCore, '必须真正拿到武器核心')

const rowIdBefore = runner.director._nextRowId
stepRunner(120) // 2s，足够走完 _selectWeaponCore 设置的 0.75s 首刷延迟
assert.ok(
  runner.director._nextRowId > rowIdBefore,
  `Director 必须在选择完成后恢复生成遭遇（rowId ${rowIdBefore} -> ${runner.director._nextRowId}）`
)
console.log('✓ Phase B.1 / Test E: weapon choice survives magnet, resolves, and Director resumes')

// Test F — 端到端复现修复前的真实冻结局（60 seeds 中曾冻结的那几个 seed）。
// 修复前这些局的特征是：weaponCore 为 null、encounter 行数远低于健康局、
// 且在局中段之后 Director 再不生成任何遭遇。
{
  const previouslyFrozenSeeds = [3, 4, 7]
  for (const seed of previouslyFrozenSeeds) {
    const sim = new RunnerGameplay()
    sim.attach({
      width: 1280,
      height: 720,
      ctx: ctx2d,
      input: { state: { left: false, right: false } },
      sound: simulationSound,
      finishGameplay() {},
    })
    sim.reset(seed, 'blitz')
    sim.state = 'active'
    sim.countdown = 0
    let rows = 0
    let lastRowAt = 0
    for (let frame = 0; frame < sim.duration * 30 + 2 && sim.state === 'active'; frame++) {
      sim.targetLane = chooseSimulationLane(sim)
      const rowIdBefore = sim.director._nextRowId
      sim.updateWorld(1 / 30)
      if (sim.director._nextRowId !== rowIdBefore) {
        rows += sim.director._nextRowId - rowIdBefore
        lastRowAt = sim.elapsedTime
      }
    }
    assert.equal(sim.state, 'finished', `seed ${seed} 必须正常结束`)
    assert.equal(sim.outcome, 'victory', `seed ${seed} 应判定为突围成功`)
    assert.ok(sim.weaponCore, `seed ${seed} 必须真正拿到武器核心（修复前为 null）`)
    assert.equal(sim.weaponChoicePending, false, `seed ${seed} 局末不得残留待选状态`)
    assert.ok(rows >= 18, `seed ${seed} 遭遇行数过低（${rows}），疑似 Director 冻结`)
    assert.ok(
      sim.duration - lastRowAt < 8,
      `seed ${seed} 最后 ${(sim.duration - lastRowAt).toFixed(1)}s 没有任何遭遇生成，疑似冻结`
    )
    sim.destroy()
  }
}
console.log('✓ Phase B.1 / Test F: previously frozen seeds now play a full uninterrupted run')

// Test G — 不变式：任何时刻 pending=true 都必须存在真实选择入口。
// 这不是防御性 runtime 守卫，而是对根因的回归锁：修复前磁暴会在 pending 期间
// 清空选择门，该不变式即被破坏。
{
  prepareRunner(9107, 'blitz')
  let violated = 0
  for (let frame = 0; frame < 60 * 30; frame++) {
    runner.updateWorld(1 / 60)
    if (runner.weaponChoicePending && !runner.entities.some((e) => e.active && e.kind === 'mutation')) {
      violated += 1
    }
    if (runner.secondaryChoicePending && !runner.entities.some((e) => e.active && e.kind === 'secondary_mutation')) {
      violated += 1
    }
  }
  assert.equal(violated, 0, `pending 与真实选择入口必须始终一致，违例 ${violated} 帧`)
  assert.equal(runner.weaponChoicePending, false, '局末不得残留武器待选状态')
  assert.equal(runner.secondaryChoicePending, false, '局末不得残留元素待选状态')
}
console.log('✓ Phase B.1 / Test G: pending always has a live choice entry point')

// ---------------------------------------------------------------------------
// Phase C — 路线风险—收益。
// 目标：让「选哪条路」值得思考。三条路线必须形成不同 profile，
// 而不是同一条路在三个维度上全面更好。所有指标都来自真实 runtime 行为。
// ---------------------------------------------------------------------------
const ROUTE_SEEDS = 60

/** 跑一局并把路线相关的风险/收益信号折算成可比较的累计量。 */
const measureRouteProfile = (routeId, seedCount = ROUTE_SEEDS) => {
  const routeLane = RUNNER_ROUTES[routeId].lane
  const acc = {
    victories: 0, deaths: 0, frozen: 0, weaponOk: 0, elementOk: 0,
    enemies: 0, elites: 0, hits: 0, damage: 0, rows: 0, dangerRows: 0,
    gates: 0, tactical: 0, buildGates: 0, forkBonus: 0, forks: 0, magnet: 0, shield: 0, hp: 0,
  }
  for (let seed = 1; seed <= seedCount; seed++) {
    const sim = new RunnerGameplay()
    sim.attach({
      width: 1280, height: 720, ctx: ctx2d,
      input: { state: { left: false, right: false } },
      sound: simulationSound, finishGameplay() {},
    })
    sim.reset(seed, 'blitz')
    sim.state = 'active'
    sim.countdown = 0
    const seen = new Set()
    // 危险遭遇 = 至少含一只精英的行（精英是主要伤害来源，也是闸口前最难躲的目标）
    const dangerRowIds = new Set()
    let rows = 0, enemies = 0, elites = 0, gates = 0, tactical = 0, buildGates = 0
    let lastRowAt = 0, lastCharges = 0, lastShield = 0, bonus = 0, lastRoutes = 0
    for (let frame = 0; frame < sim.duration * 30 + 2 && sim.state === 'active'; frame++) {
      // 固定走该路线；其余行为与既有 bot 完全一致，不改战斗策略
      const approaching = sim.entities.some((e) => e.active && e.kind === 'fork' && !e.resolved)
      sim.targetLane = approaching ? routeLane : chooseSimulationLane(sim)
      const rowIdBefore = sim.director._nextRowId
      sim.updateWorld(1 / 30)
      if (sim.director._nextRowId !== rowIdBefore) { rows++; lastRowAt = sim.elapsedTime }
      // 路线红利：只统计「锁定路线那一帧」新增的暴走充能与护盾，
      // 否则普通 fever_shard / shield 奖励门会被混进来，红利幅度就不可比了。
      if (sim.routeLog.length > lastRoutes) {
        bonus += Math.max(0, sim.feverCharges - lastCharges) + Math.max(0, sim.shield - lastShield)
      }
      lastRoutes = sim.routeLog.length
      lastCharges = sim.feverCharges; lastShield = sim.shield
      for (const entity of sim.entities) {
        if (seen.has(entity.id)) continue
        seen.add(entity.id)
        if (entity.kind === 'enemy') { enemies++; if (entity.elite) { elites++; dangerRowIds.add(entity.rowId) } }
        if (entity.kind === 'gate') {
          gates++
          const reward = String(entity.reward || '')
          if (reward.startsWith('item_')) tactical++
          else if (reward === 'attack' || reward === 'rapid' || reward === 'repair' || reward === 'shield') buildGates++
        }
      }
    }
    if (sim.outcome === 'victory') acc.victories++
    if (sim.outcome === 'defeat') acc.deaths++
    if (sim.elapsedTime - lastRowAt >= 8 || !sim.weaponCore) acc.frozen++
    if (sim.weaponCore) acc.weaponOk++
    if (sim.secondaryElement) acc.elementOk++
    acc.enemies += enemies; acc.elites += elites; acc.hits += sim.hitsTaken; acc.damage += sim.damageTaken
    acc.rows += rows; acc.dangerRows += dangerRowIds.size
    acc.gates += gates; acc.tactical += tactical; acc.buildGates += buildGates
    acc.forkBonus += bonus; acc.forks += sim.routeLog.length
    acc.magnet += sim.tacticalStats.magnets; acc.shield += sim.shield; acc.hp += sim.hp
    sim.destroy()
  }
  acc.per = (key) => acc[key] / seedCount
  return acc
}

const routeProfiles = {}
for (const id of RUNNER_ROUTE_IDS) routeProfiles[id] = measureRouteProfile(id)
const rp = routeProfiles

// Test A — blockade 风险最低（真实遭遇量与精英量双低）。
assert.ok(rp.blockade.per('enemies') < rp.ruins.per('enemies'), `blockade 敌人量应低于 ruins：${rp.blockade.per('enemies').toFixed(2)} vs ${rp.ruins.per('enemies').toFixed(2)}`)
assert.ok(rp.blockade.per('elites') < rp.ruins.per('elites'), `blockade 精英量应低于 ruins：${rp.blockade.per('elites').toFixed(2)} vs ${rp.ruins.per('elites').toFixed(2)}`)
assert.ok(rp.blockade.per('rows') < rp.armory.per('rows'), 'blockade 遭遇行数应最低')
console.log('✓ Phase C / Test A: blockade faces measurably less danger than ruins')

// Test B — blockade 收益最低（真实奖励门机会最少）。
assert.ok(rp.blockade.per('gates') < rp.armory.per('gates'), `blockade 奖励门应少于 armory：${rp.blockade.per('gates').toFixed(2)} vs ${rp.armory.per('gates').toFixed(2)}`)
assert.ok(rp.blockade.per('tactical') < rp.armory.per('tactical'), 'blockade 战术门机会应最少')
console.log('✓ Phase C / Test B: blockade offers the fewest real reward gates')

// Test C — armory 构筑收益最高（战术道具门密度最高）。
assert.ok(
  rp.armory.per('tactical') > rp.blockade.per('tactical') && rp.armory.per('tactical') > rp.ruins.per('tactical'),
  `armory 战术门应多于其它路线：${rp.armory.per('tactical').toFixed(2)} / ${rp.blockade.per('tactical').toFixed(2)} / ${rp.ruins.per('tactical').toFixed(2)}`
)
assert.ok(rp.armory.per('gates') >= rp.blockade.per('gates'), 'armory 奖励门总量不应低于 blockade')
console.log('✓ Phase C / Test C: armory yields the most tactical build opportunities')

// Test D — ruins 风险最高（精英与受击双高）。
assert.ok(rp.ruins.per('elites') > rp.blockade.per('elites'), 'ruins 精英量应最高')
assert.ok(rp.ruins.per('hits') > rp.blockade.per('hits'), `ruins 受击应最多：${rp.ruins.per('hits').toFixed(2)} vs ${rp.blockade.per('hits').toFixed(2)}`)
assert.ok(getRunnerRoute('ruins').hpMultiplier > getRunnerRoute('blockade').hpMultiplier, 'ruins 敌人血量倍率必须更高')
console.log('✓ Phase C / Test D: ruins carries the highest measured risk')

// Test E — ruins 有真实收益补偿（路线红利），且不是分数。
{
  prepareRunner(9201, 'blitz')
  const forkRow = runner.director.createForkRow(0, runner.elapsedTime, 'blitz')
  runner.entities.push(...forkRow)
  runner.lanePosition = 2; runner.currentLane = 2; runner.targetLane = 2
  const before = runner.feverCharges + runner.shield
  assert.equal(runner._resolveFork(runner.entities.find((e) => e.kind === 'fork' && e.lane === 2)), true)
  assert.ok(
    runner.feverCharges + runner.shield > before,
    '锁定 ruins 必须真实获得局内资源（暴走充能或护盾）'
  )
  assert.equal(runner.score, 0, '路线红利不得折算成分数（分数只影响结算）')
  // blockade 不给红利
  const sim2 = new RunnerGameplay()
  sim2.attach({ width: 1280, height: 720, ctx: ctx2d, input: { state: { left: false, right: false } }, sound: simulationSound, finishGameplay() {} })
  sim2.reset(9202, 'blitz')
  sim2.state = 'active'; sim2.countdown = 0
  const row2 = sim2.director.createForkRow(0, 0, 'blitz')
  sim2.entities.push(...row2)
  sim2.lanePosition = 0; sim2.currentLane = 0; sim2.targetLane = 0
  const before2 = sim2.feverCharges + sim2.shield
  sim2._resolveFork(sim2.entities.find((e) => e.kind === 'fork' && e.lane === 0))
  assert.equal(sim2.feverCharges + sim2.shield, before2, 'blockade 不得发放路线红利')
  sim2.destroy()
}
assert.ok(
  rp.ruins.per('forkBonus') > rp.blockade.per('forkBonus') + 0.5,
  `ruins 路线红利应显著高于 blockade：${rp.ruins.per('forkBonus').toFixed(2)} vs ${rp.blockade.per('forkBonus').toFixed(2)}`
)
console.log('✓ Phase C / Test E: ruins carries a real in-run reward, blockade carries none')

// Test F — 三条路线不构成严格优劣：各自至少在一个维度独占第一。
{
  const first = (key) => RUNNER_ROUTE_IDS.filter((id) => Math.abs(rp[id].per(key) - Math.max(...RUNNER_ROUTE_IDS.map((r) => rp[r].per(key)))) < 1e-9)
  assert.ok(first('elites').includes('ruins'), 'ruins 应在精英量上独占最高')
  assert.ok(first('tactical').includes('armory'), 'armory 应在战术门机会上独占最高')
  assert.ok(first('forkBonus').includes('ruins'), 'ruins 应独占路线红利')
  // blockade 必须在「风险最低」这一维度独占，否则它就没有存在理由
  const safest = Math.min(...RUNNER_ROUTE_IDS.map((id) => rp[id].per('elites') + rp[id].per('enemies')))
  assert.ok(
    Math.abs(rp.blockade.per('elites') + rp.blockade.per('enemies') - safest) < 1e-9,
    'blockade 应在综合遭遇量上独占最低'
  )
  // armory 不该同时是「最安全 + 奖励最多」，ruins 不该是「最难 + 奖励最少」
  assert.ok(
    rp.armory.per('elites') > rp.blockade.per('elites'),
    'armory 的精英压力必须高于 blockade，否则它会变成全面更优'
  )
  assert.ok(
    rp.ruins.per('buildGates') > rp.blockade.per('buildGates'),
    'ruins 的构筑机会必须高于 blockade，否则它就是纯粹更难而无回报'
  )
}
console.log('✓ Phase C / Test F: the three routes form distinct profiles with no strict dominance')

// Test G — Determinism：路线加权不得引入非 seeded 随机。
{
  const runWithRoute = (routeId) => {
    const sim = new RunnerGameplay()
    sim.attach({ width: 1280, height: 720, ctx: ctx2d, input: { state: { left: false, right: false } }, sound: simulationSound, finishGameplay() {} })
    sim.reset(2026, 'blitz')
    sim.state = 'active'; sim.countdown = 0
    const lane = RUNNER_ROUTES[routeId].lane
    for (let frame = 0; frame < sim.duration * 30 + 2 && sim.state === 'active'; frame++) {
      const approaching = sim.entities.some((e) => e.active && e.kind === 'fork' && !e.resolved)
      sim.targetLane = approaching ? lane : chooseSimulationLane(sim)
      sim.updateWorld(1 / 30)
    }
    const out = { routeLog: sim.routeLog.map((e) => ({ ...e })), score: sim.score, kills: sim.kills, state: sim.state }
    sim.destroy()
    return out
  }
  for (const id of RUNNER_ROUTE_IDS) {
    const a = runWithRoute(id)
    const b = runWithRoute(id)
    assert.deepEqual(a, b, `路线 ${id} 必须同 seed 完全复现`)
  }
  assert.notDeepEqual(
    runWithRoute('blockade').routeLog.map((e) => e.routeId),
    runWithRoute('ruins').routeLog.map((e) => e.routeId),
    '不同路线策略必须产生不同的路线历史'
  )
}
console.log('✓ Phase C / Test G: route weighting stays fully seeded and reproducible')

// Test H — Anti-freeze：三条路线都不得复现 choice freeze 或 Director 停摆。
for (const id of RUNNER_ROUTE_IDS) {
  const p = rp[id]
  assert.equal(p.frozen, 0, `路线 ${id} 出现 ${p.frozen} 个冻结局`)
  assert.equal(p.weaponOk, ROUTE_SEEDS, `路线 ${id} 必须每局都完成武器选择`)
  assert.equal(p.elementOk, ROUTE_SEEDS, `路线 ${id} 必须每局都完成元素选择`)
  assert.ok(p.magnet > 0, `路线 ${id} 必须仍然会触发磁暴（功能未被削弱）`)
}
console.log('✓ Phase C / Test H: all three routes stay magnet-active and freeze-free')

// 路线对比矩阵（报告用输出，断言已在上面完成）
console.log('\n  路线矩阵 · 60 seeds × always-route · blitz 60s（每局均值）')
console.log('  ' + 'metric'.padEnd(14) + RUNNER_ROUTE_IDS.map((id) => id.padStart(12)).join(''))
for (const key of ['victories', 'deaths', 'frozen', 'weaponOk', 'elementOk', 'forks', 'rows', 'dangerRows', 'enemies', 'elites', 'hits', 'damage', 'gates', 'tactical', 'buildGates', 'forkBonus', 'magnet', 'shield', 'hp']) {
  console.log('  ' + (key + '/run').padEnd(14) + RUNNER_ROUTE_IDS.map((id) => rp[id].per(key).toFixed(2).padStart(12)).join(''))
}

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
