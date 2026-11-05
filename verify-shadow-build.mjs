import assert from 'node:assert/strict'
import { createArena, dispose, learn, spawn } from './test-support/arena-fixture.mjs'
import { rollSkills, SKILL_DATABASE } from './src/game/SkillPool.js'
import { getEffectiveSkillMaxLevel } from './src/game/SkillProgression.js'
import {
  SHADOW_ROUTES, SHADOW_ROUTE_SKILL_BY_ID, getShadowSkill,
  shadowRouteInvestment, shadowRouteReady, shadowSkillAvailable,
} from './src/game/ShadowBuild.js'
import { SHADOW_CLONE_POWERS } from './src/game/ShadowSkills.js'

let passed = 0
function check(name, fn) {
  const game = createArena('shadow')
  try { fn(game); console.log(`  ✓ ${++passed}. ${name}`) } finally { dispose(game) }
}
function prepareRoute(game, route) {
  game.player.level = 5
  game._ensureRoleAwakening()
  const seed = SHADOW_ROUTES[route].seed
  if (seed === 'shadow_hunt_mark') assert.equal(game.applySkill(SHADOW_ROUTE_SKILL_BY_ID[seed]), true)
  else learn(game, seed)
  learn(game, 'ass_lethal', 3)
  learn(game, 'ass_stride')
  assert.equal(game.weaponSystem.shadowCombat.normalChoices, 5)
  game.enemyManager.wave = 6
  assert.equal(shadowRouteReady(game), true)
  const choices = rollSkills(game, 3)
  assert.equal(choices.length, 3)
  const selected = choices.find(choice => choice.route === route)
  assert.ok(selected && !selected.locked, `${route} route should be unlocked`)
  assert.equal(game.applySkill(selected), true)
  assert.equal(game.weaponSystem.shadowCombat.route, route)
  return game.weaponSystem.shadowCombat
}
function applyRouteSkill(game, id, count = 1) {
  for (let n = 0; n < count; n++) assert.equal(game.applySkill(SHADOW_ROUTE_SKILL_BY_ID[id]), true, id)
}
function withRandom(value, fn) {
  const original = Math.random
  Math.random = () => value
  try { return fn() } finally { Math.random = original }
}

check('前期入口随机，不固定成单一路线；已抽到的入口不会重复占卡', game => {
  const firstSeeds = new Set()
  for (const random of [0, .34, .67, .999]) {
    const seed = withRandom(random, () => rollSkills(game, 1)[0])
    assert.ok(Object.values(SHADOW_ROUTES).some(route => route.seed === seed.id))
    firstSeeds.add(seed.id)
  }
  assert.ok(firstSeeds.size >= 2, '不同随机结果应能揭示不同入口')
  const all = rollSkills(game, 99)
  const seeds = all.filter(skill => Object.values(SHADOW_ROUTES).some(route => route.seed === skill.id))
  assert.equal(new Set(seeds.map(skill => skill.id)).size, seeds.length)
})

check('路线要同时满足 5 次选卡、进度和入口；远征按章节计算', game => {
  game.player.level = 5; game._ensureRoleAwakening(); game.enemyManager.wave = 6
  game.weaponSystem.shadowCombat.normalChoices = 5
  assert.equal(shadowRouteReady(game), false)
  learn(game, 'ass_echo')
  assert.equal(shadowRouteReady(game), true)
  game.enemyManager.wave = 5; assert.equal(shadowRouteReady(game), false)
  game.runSelection = { ...game.runSelection, mode: 'expedition' }
  game.expeditionStage = 2; assert.equal(shadowRouteReady(game), false)
  game.expeditionStage = 3; assert.equal(shadowRouteReady(game), true)
})

check('远征换章清除临时战斗状态但保留选卡进度、路线技能和互斥终极', game => {
  game.configureRun({ mode: 'expedition', difficulty: 'normal' })
  game.expeditionStage = 3
  const combat = prepareRoute(game, 'swarm')
  game.player.level = 14; game.expeditionStage = 5
  applyRouteSkill(game, 'shadow_swarm_assault', 3)
  const capstone = rollSkills(game, 99).find(skill => skill.id === 'ass_capstone')
  assert.ok(capstone); game.applySkill(capstone)
  combat.createDomain(game.player.x, game.player.y, 0)
  combat.echoQueue.push({ due: 2 })
  game._enterExpeditionStage(6)
  assert.equal(combat.route, 'swarm')
  assert.equal(combat.routeUltimate, 'swarm')
  assert.equal(combat.normalChoices, 9)
  assert.equal(combat.swarmAssaultLevel, 3)
  assert.equal(combat.domains.length, 0)
  assert.equal(combat.echoQueue.length, 0)
})

check('路线一旦锁定不可切换，另外两条的进阶停止出现', game => {
  for (const route of Object.keys(SHADOW_ROUTES)) {
    const combat = prepareRoute(game, route)
    assert.equal(combat.chooseRoute(Object.keys(SHADOW_ROUTES).find(id => id !== route)), false)
    const skills = rollSkills(game, 99).filter(skill => skill.isShadowSkill && skill.route)
    assert.ok(skills.every(skill => skill.route === route || skill.kind === 'flex' && (game.skillLevels[skill.id] || 0) > 0))
    const otherAdvanced = Object.values(SHADOW_ROUTE_SKILL_BY_ID).filter(skill => skill.route && skill.route !== route && skill.kind !== 'seed' && skill.kind !== 'ultimate')
    assert.ok(otherAdvanced.every(skill => !shadowSkillAvailable(game, skill)))
    game.reset()
    assert.equal(combat.route, null)
    assert.equal(combat.routeUltimate, null)
  }
})

check('达标终极有路线投入与章节／波次门槛，互斥且随机出现', game => {
  const combat = prepareRoute(game, 'hunt')
  game.player.level = 14; game.enemyManager.wave = 10
  const ultimate = SHADOW_ROUTE_SKILL_BY_ID.shadow_hunt_ultimate
  assert.equal(shadowSkillAvailable(game, ultimate), false, '投入未满不能进入池')
  assert.equal(shadowRouteInvestment(game), 1)
  applyRouteSkill(game, 'shadow_hunt_pursuit', 3)
  assert.equal(shadowRouteInvestment(game), 4)
  game.enemyManager.wave = 9; assert.equal(shadowSkillAvailable(game, ultimate), false)
  game.enemyManager.wave = 10; assert.equal(shadowSkillAvailable(game, ultimate), true)
  assert.equal(combat.hud().ultimateReady, true)
  assert.equal(withRandom(0, () => rollSkills(game, 1).some(skill => skill.id === ultimate.id)), false)
  const all = rollSkills(game, 99)
  assert.deepEqual(all.filter(skill => skill.kind === 'ultimate').map(skill => skill.id), [ultimate.id])
  assert.equal(game.applySkill(all.find(skill => skill.id === ultimate.id)), true)
  assert.equal(combat.routeUltimate, 'hunt')
  assert.equal(shadowSkillAvailable(game, SHADOW_ROUTE_SKILL_BY_ID.ass_capstone), false)
  assert.equal(shadowSkillAvailable(game, SHADOW_ROUTE_SKILL_BY_ID.shadow_blade_ultimate), false)
  assert.equal(combat.hud().ultimateReady, false)
})

check('猎杀印记增伤，免费追击可在影袭冷却期间施放且不重置冷却', game => {
  const combat = prepareRoute(game, 'hunt')
  game.player.level = 14; game.enemyManager.wave = 10
  applyRouteSkill(game, 'shadow_hunt_pursuit', 3)
  const offer = rollSkills(game, 99).find(skill => skill.id === 'shadow_hunt_ultimate')
  assert.ok(offer); game.applySkill(offer)
  const marked = spawn(game, { x: 35, hp: 1000 })
  combat.huntPursuitLevel = 2
  combat.markHuntTarget(marked)
  const hp = marked.hp, expected = game.weaponSystem.damage * game.weaponSystem.levelMul * game.weaponSystem.devourDamageMul * (1 + combat.huntMarkBonus)
  combat.hit(marked, 1, { secondary: true })
  assert.ok(Math.abs(marked.hp - (hp - expected)) < 1e-7)
  assert.equal(combat.hud().marked, true)

  game.player.facing = 0; game.running = true; game.runState = 'active'; game._pauseLock = 0
  game.input.queueFever(); game.update(0)
  assert.ok(combat.assault); assert.equal(game.player.strainSkillCd, game.player.strainSkillMax)
  for (let frame = 0; combat.assault && frame < 40; frame++) game.update(1 / 60)
  assert.equal(combat.assault, null)
  assert.equal(combat.canFollowup, true)
  const remaining = game.player.strainSkillCd
  game.input.queueFever(); game.update(0)
  assert.ok(combat.assault?.isFollowup)
  assert.equal(game.player.strainSkillCd, remaining)
  assert.equal(combat.canFollowup, false)
})

check('群影夹击倍率递增有界，分身击杀只有限恢复其他分身', game => {
  const combat = prepareRoute(game, 'swarm')
  applyRouteSkill(game, 'shadow_swarm_assault', 5)
  assert.equal(combat.swarmCommandMultiplier, 2.6)
  combat.swarmReapLevel = 2
  const first = combat.clones.createAt(game.player, 0)
  const other = combat.clones.createAt({ x: game.player.x + 5, y: game.player.y }, 0)
  other.life = 3
  const enemy = spawn(game, { x: 60, hp: .5 })
  combat.clones.hit(first, enemy, 1)
  assert.equal(enemy.active, false)
  assert.ok(Math.abs(other.life - 3.4) < 1e-7)
  other.life = other.maxLife - .05
  combat.onCloneKill(first, spawn(game, { x: 60, hp: .5 }))
  assert.equal(other.life, other.maxLife)
})

check('裂影回响只补一次伤害，刃域有限脉冲且不生成暴击分身', game => {
  const combat = prepareRoute(game, 'blade')
  game.player.shadowCleaveLevel = 2; combat.bladeArcLevel = 2; combat.bladeEchoLevel = 1
  game.weaponSystem.critChance = 1
  const origin = spawn(game, { x: 60 }), flank = spawn(game, { x: 60, y: 30 })
  combat.cleave(origin, 0)
  assert.equal(combat.echoQueue.length, 1)
  for (let frame = 0; frame < 12; frame++) combat.update(1 / 60)
  assert.ok(Math.abs(flank.hp - (100 - 1.2 - .35)) < 1e-7)
  assert.equal(combat.echoQueue.length, 0)
  assert.equal(combat.clones.items.length, 0)
  const domainTarget = spawn(game, { x: 25, y: 0, hp: 100 })
  combat.createDomain(game.player.x + 25, game.player.y, 0)
  for (let frame = 0; frame < 120; frame++) combat.update(1 / 60)
  assert.ok(domainTarget.hp < 100)
  assert.equal(combat.domains.length, 0)
  assert.equal(combat.clones.items.length, 0)
})

check('模式等级上限延长成长跑道，分身强度始终有限', game => {
  game.player.level = 14; game.weaponSystem.shadowCombat.route = 'swarm'
  const pursuit = SHADOW_ROUTE_SKILL_BY_ID.shadow_hunt_pursuit
  game.runSelection = { ...game.runSelection, mode: 'expedition', difficulty: 'easy' }
  assert.equal(getEffectiveSkillMaxLevel(game, pursuit, 'primary'), 3)
  game.runSelection.difficulty = 'hard'; assert.equal(getEffectiveSkillMaxLevel(game, pursuit, 'primary'), 8)
  game.runSelection.difficulty = 'hell'; assert.equal(getEffectiveSkillMaxLevel(game, pursuit, 'primary'), 10)
  game.runSelection = { ...game.runSelection, mode: 'timed', difficulty: 'normal' }
  assert.equal(getEffectiveSkillMaxLevel(game, pursuit, 'primary'), 8)
  game.runSelection.mode = 'endless'; assert.equal(getEffectiveSkillMaxLevel(game, pursuit, 'primary'), 12)
  const execute = getShadowSkill('ass_execute', SKILL_DATABASE.assassin.primary, SKILL_DATABASE.common)
  assert.equal(getEffectiveSkillMaxLevel(game, execute, 'primary'), 14)
  assert.equal(SHADOW_CLONE_POWERS[14], 1.23)
  assert.ok(SHADOW_CLONE_POWERS.every(Number.isFinite))
  const combat = game.weaponSystem.shadowCombat
  combat.route = 'hunt'; combat.huntPursuitLevel = 12
  assert.ok(Math.abs(combat.huntMarkBonus - .66) < 1e-7)
  combat.route = 'swarm'; combat.swarmAssaultLevel = 12; combat.swarmReapLevel = 12
  assert.ok(Math.abs(combat.swarmCommandMultiplier - 3.1) < 1e-7)
  const first = { life: 1, x: 0, y: 0 }, other = { life: 1, maxLife: 4, x: 0, y: 0 }
  combat.clones.items = [first, other]
  combat.onCloneKill(first, { x: 0, y: 0 })
  assert.equal(other.life, 2.5)
  combat.route = 'blade'; combat.bladeArcLevel = 12; combat.bladeEchoLevel = 12
  assert.equal(combat.bladeRangeBonus, 84)
  assert.equal(combat.bladeMaxTargets, 10)
  assert.ok(Math.abs(combat.bladeEchoMultiplier - .68) < 1e-7)
})

console.log(`暗影路线与构筑：${passed} 组通过`)
