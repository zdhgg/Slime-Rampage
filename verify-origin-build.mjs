import assert from 'node:assert/strict'
import { createArena, spawn, rollSkills, dispose } from './test-support/arena-fixture.mjs'
import { getOriginActiveGrowth, getPrimalOverloadProfile, gainOriginMechanism, gainOriginSecondary, PRIMAL_ENERGY_MAX } from './src/game/PrimalEnergy.js'
import { triggerOriginSecondaryEcho } from './src/game/OriginEchoes.js'
import { getEffectiveSkillMaxLevel } from './src/game/SkillProgression.js'

let checks = 0
const check = (name, fn) => { fn(); console.log(`✓ ${++checks}. ${name}`) }
function awaken(game, spec = 'gatling') {
  game.player.level = 5
  const card = rollSkills(game).find(s => s.isMilestone && s.spec === spec)
  assert.ok(card)
  assert.equal(game.applySkill(card), true)
}

check('原生专属成长卡在主拟态前关闭，拟态后进入可抽取池但不占用保底卡位', () => {
  const game = createArena('origin')
  try {
    game.player.level = 4
    assert.ok(rollSkills(game, 100).every(s => !s.id.startsWith('origin_')))
    awaken(game)
    game.player.level = 6
    const full = rollSkills(game, 100)
    for (const id of ['origin_flux', 'origin_overload', 'origin_concord']) assert.ok(full.some(s => s.id === id), `${id} should be eligible`)
    const ordinary = rollSkills(game, 3)
    assert.equal(ordinary.length, 3)
    assert.ok(full.length > ordinary.length, 'eligible choices exceed the three displayed cards')
  } finally { dispose(game) }
})

check('非原生血统不会获得原生专属成长卡', () => {
  const game = createArena('ricochet')
  try {
    game.player.level = 8
    assert.ok(rollSkills(game, 100).every(s => !s.id.startsWith('origin_')))
  } finally { dispose(game) }
})

check('异源校准、超载棱镜与双相协鸣按等级递减并硬封顶', () => {
  const game = createArena('origin')
  try {
    game.primarySpec = 'gatling'
    game.skillLevels.origin_flux = 30
    game.skillLevels.origin_overload = 30
    game.skillLevels.origin_concord = 30
    const growth = getOriginActiveGrowth(game)
    assert.equal(growth.foreignBonus, 3)
    assert.equal(growth.overloadDamageMul, 1.45)
    assert.equal(growth.overloadRangeMul, 1.3)
    assert.equal(growth.concordEcho, 3)
    assert.ok(growth.foreignBonus <= 3 && growth.overloadDamageMul <= 1.45 && growth.overloadRangeMul <= 1.3)
  } finally { dispose(game) }
})

check('主机制/副共鸣独立标记但共用能量上限、窗口节流和血统门禁', () => {
  const game = createArena('origin')
  try {
    game.primarySpec = 'gatling'
    game.secondarySpec = 'assassin'
    assert.equal(gainOriginMechanism(game, 'assassin', 0), 0, '主专精来源校验')
    assert.equal(gainOriginMechanism(game, 'gatling', 0), 5)
    assert.equal(gainOriginSecondary(game, 'assassin', 0), 5)
    assert.equal(gainOriginSecondary(game, 'assassin', 0), 1, '同源回落为 +1')
    assert.equal(gainOriginMechanism(game, 'gatling', 0), 0, '每秒三次窗口节流')
    game.player.primalEnergy = PRIMAL_ENERGY_MAX
    assert.equal(gainOriginSecondary(game, 'assassin', 1.1), 0, '满格不溢出')
  } finally { dispose(game) }
})

check('主专精超载形态叠加有限主副回响，不建立第二个终极', () => {
  const game = createArena('origin')
  try {
    game.primarySpec = 'gatling'
    game.secondarySpec = 'assassin'
    game.skillLevels.origin_concord = 1
    game.skillLevels.ass_sub_insight = 1
    const profile = getPrimalOverloadProfile(game, true)
    assert.equal(profile.volleyBonus, 1)
    assert.equal(profile.secondaryEcho, 'assassin')
    assert.equal(profile.assassinStealth, 0)
    assert.match(game.strainSkill.getDesc(game), /齐射回响/)
    assert.match(game.strainSkill.getDesc(game), /暗影刺客/)
  } finally { dispose(game) }
})

check('双相协鸣的每个主专精分支都能显示并兑现对应的有限提升', () => {
  const expected = {
    gatling: p => assert.equal(p.volleyBonus, 1),
    elemental: p => assert.equal(p.elementalSpreadBonus, 0.06),
    assassin: p => assert.equal(p.assassinStealth, 0.33),
    gluttony: p => { assert.equal(p.biteDamageMul, 1.06); assert.equal(p.biteRangeMul, 1.04) },
    symbiosis: p => { assert.equal(p.rallyDuration, 0.25); assert.equal(p.rallyDamage, 0.04) },
  }
  const game = createArena('origin')
  try {
    game.skillLevels.origin_concord = 1
    for (const [spec, assertProfile] of Object.entries(expected)) {
      game.primarySpec = spec
      assertProfile(getPrimalOverloadProfile(game, true))
    }
  } finally { dispose(game) }
})

check('暴食副专精超载回响最多打击三名附近目标并有限充能', () => {
  const game = createArena('origin')
  try {
    game.primarySpec = 'gatling'
    game.secondarySpec = 'gluttony'
    game.skillLevels.glut_sub_armor = 1
    const targets = [20, 40, 60, 80].map(x => spawn(game, { x, hp: 100 }))
    assert.equal(triggerOriginSecondaryEcho(game, { overloaded: true }), true)
    assert.ok(targets.slice(0, 3).every(e => e.hp < 100))
    assert.equal(targets[3].hp, 100, '目标数硬上限为 3')
    assert.equal(game.player.primalEnergy, 5)
  } finally { dispose(game) }
})

check('副共生超载回响最多脉冲五名目标，且脉冲本身不递归充能', () => {
  const game = createArena('origin')
  try {
    game.primarySpec = 'gatling'
    game.secondarySpec = 'symbiosis'
    game.skillLevels.sym_sub_echo = 1
    game.player.primalEnergy = 40
    const targets = [20, 40, 60, 80, 100, 120].map(x => spawn(game, { x, hp: 100 }))
    assert.equal(triggerOriginSecondaryEcho(game, { overloaded: true }), true)
    assert.ok(targets.slice(0, 5).every(e => e.hp < 100))
    assert.equal(targets[5].hp, 100, '目标数硬上限为 5')
    assert.equal(game.player.primalEnergy, 45, '只发生一次副专精来源判定')
  } finally { dispose(game) }
})

check('副专精弹幕、元素和暗影回响均被限制为单次、短时或小批次效果', () => {
  const gatling = createArena('origin')
  try {
    gatling.primarySpec = 'assassin'; gatling.secondarySpec = 'gatling'; gatling.skillLevels.gat_sub_mag = 1
    spawn(gatling, { x: 80 })
    assert.equal(triggerOriginSecondaryEcho(gatling, { overloaded: true }), true)
    assert.equal(gatling.weaponSystem.rapidVolley.remaining, 1)
    assert.equal(gatling.weaponSystem._projectiles.length, 1)
  } finally { dispose(gatling) }

  const elemental = createArena('origin')
  const originalRandom = Math.random
  try {
    elemental.primarySpec = 'gatling'; elemental.secondarySpec = 'elemental'; elemental.skillLevels.ele_sub_aura = 1
    elemental.player._procs = { freeze: { chance: 1, duration: 2 } }
    const target = spawn(elemental, { x: 60, hp: 100 })
    Math.random = () => 0
    assert.equal(triggerOriginSecondaryEcho(elemental, { overloaded: true }), true)
    assert.ok(target.freeze > 0)
    assert.equal(elemental.player.primalEnergy, 5)
  } finally { Math.random = originalRandom; dispose(elemental) }

  const assassin = createArena('origin')
  try {
    assassin.primarySpec = 'gatling'; assassin.secondarySpec = 'assassin'; assassin.skillLevels.ass_sub_insight = 1
    assert.equal(triggerOriginSecondaryEcho(assassin, { overloaded: true }), true)
    assert.ok(assassin.player.stealthTimer > 0 && assassin.player.stealthTimer <= 1.2)
    assert.equal(assassin.player.guaranteedCrit, true)
  } finally { dispose(assassin) }
})

check('原生专属成长等级遵守模式封顶和卡片实际收益区间', () => {
  const game = createArena('origin')
  try {
    game.primarySpec = 'gatling'
    const caps = Object.fromEntries(['origin_flux', 'origin_overload', 'origin_concord'].map(id => {
      const skill = rollSkills(game, 100).find(s => s.id === id)
      return [id, getEffectiveSkillMaxLevel(game, skill, 'common')]
    }))
    assert.deepEqual(caps, { origin_flux: 10, origin_overload: 8, origin_concord: 3 })
    game.runSelection.mode = 'expedition'; game.runSelection.difficulty = 'normal'
    const flux = rollSkills(game, 100).find(s => s.id === 'origin_flux')
    assert.equal(getEffectiveSkillMaxLevel(game, flux, 'common'), 3)
  } finally { dispose(game) }
})

console.log(`\n✅ 原生构筑成长：${checks} 组断言全部通过`)
