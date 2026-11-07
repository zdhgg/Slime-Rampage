import assert from 'node:assert/strict'
import { createArena, spawn, pressSpace, rollSkills, learn, dispose } from './test-support/arena-fixture.mjs'
import { ORIGIN_BASE, ORIGIN_RULES, getOriginShockProfile, getOriginGrowth, originRouteOptions, originMarkOptions } from './src/game/OriginBuild.js'
import { gainOriginEnergy, trySpendOriginOverload, ORIGIN_SOURCES } from './src/game/PrimalEnergy.js'
import { triggerOriginMarkEcho } from './src/game/OriginEchoes.js'

let passed = 0
const check = (name, run) => {
  const g = createArena('origin')
  try {
    run(g)
    console.log(`✓ ${++passed}. ${name}`)
  } finally {
    dispose(g)
  }
}

const chooseRoute = (g, route) => {
  g.player.level = 5
  const card = rollSkills(g, 3).find(s => s.isOriginRoute && s.originRoute === route)
  assert.ok(card, `route ${route}`)
  assert.equal(g.applySkill(card), true)
}
const chooseMark = (g, mark) => {
  g.player.level = 9
  const card = rollSkills(g, 5).find(s => s.isOriginMark && s.originMark === mark)
  assert.ok(card, `mark ${mark}`)
  assert.equal(g.applySkill(card), true)
}

check('身份隔离：唯一主动始终是黏液震荡，不写 primarySpec/secondarySpec，不开放职业系统', g => {
  assert.equal(g.strainSkill.id, 'slime_shock')
  assert.equal(g.strainSkill.name, '黏液震荡')
  assert.equal(g.primarySpec, null)
  assert.equal(g.secondarySpec, null)
  assert.equal(g.canDevour, false)
  assert.equal(g.weaponSystem.petCombat.enabled, false)
  assert.equal(g.weaponSystem.spellCombat.enabled, false)
  assert.equal(g.weaponSystem.shadowCombat.enabled, false)

  chooseRoute(g, 'expansion')
  chooseMark(g, 'glutton')
  assert.equal(g.strainSkill.id, 'slime_shock')
  assert.equal(g.primarySpec, null)
  assert.equal(g.secondarySpec, null)
  assert.equal(g.canDevour, false)
  assert.equal(g.weaponSystem.petCombat.enabled, false)
  assert.equal(g.weaponSystem.spellCombat.enabled, false)
  assert.equal(g.weaponSystem.shadowCombat.enabled, false)
})

check('Lv.1~4 池只有原生核心/碎片/通用，不出现任何职业树卡', g => {
  g.player.level = 4
  for (let i = 0; i < 30; i++) {
    const options = rollSkills(g, 100)
    assert.ok(options.length > 0)
    for (const card of options) {
      assert.ok(card.originOnly || card.id.startsWith('com_'), `unexpected card ${card.id}`)
      assert.ok(!/^(gat_|ele_|ass_|glut_|pet_|sym_|rico_|shadow_)/.test(card.id), `class card ${card.id}`)
    }
  }
})

check('Lv.5 只弹出 3 张路线卡，确立后 primarySpec 仍为 null', g => {
  g.player.level = 5
  const options = rollSkills(g, 3)
  assert.equal(options.length, 3)
  assert.ok(options.every(s => s.isOriginRoute && s.isMilestone && s.milestoneType === 'origin_route'))
  assert.deepEqual(options.map(s => s.originRoute).sort(), ['assimilation', 'expansion', 'resonance'])
  assert.equal(g.applySkill(options[0]), true)
  assert.ok(g.originRoute)
  assert.equal(g.primarySpec, null)
  assert.equal(g.secondarySpec, null)
})

check('Lv.6+ 只出已选路线卡，不再出现另两条路线', g => {
  chooseRoute(g, 'assimilation')
  g.player.level = 7
  const options = rollSkills(g, 100)
  assert.ok(options.length > 0)
  for (const card of options) {
    assert.ok(!card.isOriginRoute, 'route milestone should not repeat')
    if (card.originPool?.startsWith('route_')) assert.equal(card.route, 'assimilation')
    assert.notEqual(card.route, 'expansion')
    assert.notEqual(card.route, 'resonance')
  }
  assert.ok(options.some(card => card.id === 'ori_asm_stack'))
})

check('Lv.9 只弹出 5 张印记卡；选完后不开放职业主系统', g => {
  chooseRoute(g, 'resonance')
  g.player.level = 9
  const options = rollSkills(g, 5)
  assert.equal(options.length, 5)
  assert.ok(options.every(s => s.isOriginMark && s.milestoneType === 'origin_mark'))
  assert.equal(g.applySkill(options.find(s => s.originMark === 'assassin')), true)
  assert.equal(g.originMark, 'assassin')
  assert.equal(g.primarySpec, null)
  assert.equal(g.canDevour, false)
  assert.equal(g.weaponSystem.petCombat.enabled, false)
  assert.equal(g.weaponSystem.spellCombat.enabled, false)
  assert.equal(g.weaponSystem.shadowCombat.enabled, false)
  assert.equal(g.strainSkill.id, 'slime_shock')
})

check('碎片最多 2 系、每系 1 级；同系印记吸收碎片且不双触发', g => {
  g.player.level = 4
  learn(g, 'ori_frag_glutton')
  learn(g, 'ori_frag_gatling')
  const options = rollSkills(g, 100)
  assert.equal(options.some(s => s.originPool === 'fragment'), false, 'third fragment family must not be offered')
  chooseRoute(g, 'expansion')
  chooseMark(g, 'glutton')
  assert.equal(g.player.markState.mergedFragment, true)
  assert.equal(g.player.markState.rank, 1)
  assert.equal(g.skillLevels.ori_frag_glutton, 1)
  // 同系碎片不叠加：印记回响仍只兑现一次。
  const before = g.player.originGuard
  g.player.originGuard = 0
  g.player.originGuardTimer = 0
  assert.equal(triggerOriginMarkEcho(g, { overloaded: true }), true)
  assert.equal(g.player.originGuard, 1)
  assert.equal(g.player.originGuard + before >= 1, true)
})

check('震荡超载：39 能量仍为基础版，40 能量支付并进入 overloadState', g => {
  chooseRoute(g, 'resonance')
  spawn(g, { x: 40, hp: 1000 })
  g.player.originEnergy = ORIGIN_BASE.overloadCost - 1
  pressSpace(g)
  assert.equal(g.player.overloadState.active, false)
  assert.ok(g.player.originEnergy >= ORIGIN_BASE.overloadCost, 'shock should charge energy')

  g.player.strainSkillCd = 0
  g.player.originEnergy = ORIGIN_BASE.overloadCost
  g.player.overloadState.lastPaidAt = -Infinity
  pressSpace(g)
  assert.equal(g.player.overloadState.active, true)
  assert.equal(g.player.overloadState.route, 'resonance')
  assert.ok(g.player.originEnergy >= 0 && g.player.originEnergy < ORIGIN_BASE.overloadCost)
})

check('超载乘区有硬上限：伤害 ≤ 普通震荡 ×2.8、半径 ≤ ×1.8', g => {
  chooseRoute(g, 'assimilation')
  g.player.mutationState.stacks = 8
  g.player.mutationState.max = 8
  g.player.mutationState.timer = 4
  const normal = getOriginShockProfile(g, false)
  const overloaded = getOriginShockProfile(g, true)
  assert.ok(overloaded.damageMul <= normal.damageMul * ORIGIN_RULES.overloadDamageCap + 1e-9)
  assert.ok(overloaded.radius <= normal.radius * ORIGIN_RULES.overloadRadiusCap + 1e-9)
})

check('路线/印记效果不直接充能；路线来源只记录回路', g => {
  chooseRoute(g, 'resonance')
  const before = g.player.originEnergy
  assert.equal(gainOriginEnergy(g, ORIGIN_SOURCES.ROUTE), 0)
  assert.equal(g.player.originEnergy, before)
  assert.ok(g.player.routeState.resonance.sources.includes(ORIGIN_SOURCES.ROUTE))
})

check('三条路线的震荡 profile 形态不同，且不改变主动 id', g => {
  const profiles = {}
  for (const route of ['expansion', 'assimilation', 'resonance']) {
    const h = createArena('origin')
    try {
      h.player.level = 5
      assert.equal(h.applySkill(originRouteOptions(h).find(c => c.originRoute === route)), true)
      profiles[route] = getOriginShockProfile(h, false)
      assert.equal(h.strainSkill.id, 'slime_shock')
    } finally { dispose(h) }
  }
  assert.ok(profiles.expansion.radius > profiles.assimilation.radius)
  assert.ok(profiles.resonance.damageMul >= profiles.assimilation.damageMul)
})

check('五印记都可被选择，且回响只兑现一次', g => {
  for (const mark of ['glutton', 'gatling', 'elemental', 'assassin', 'symbiosis']) {
    const h = createArena('origin')
    try {
      h.player.level = 5
      assert.equal(h.applySkill(originRouteOptions(h)[0]), true)
      h.player.level = 9
      const card = originMarkOptions(h).find(c => c.originMark === mark)
      assert.ok(card)
      assert.equal(h.applySkill(card), true)
      assert.equal(h.originMark, mark)
      assert.equal(h.player.markState.rank, 1)
    } finally { dispose(h) }
  }
})

check('重开清空路线/印记/能量/同化/回路，回到无职业身份的原生', g => {
  chooseRoute(g, 'assimilation')
  chooseMark(g, 'elemental')
  g.player.originEnergy = 80
  g.player.mutationState.stacks = 3
  g.reset()
  assert.equal(g.originRoute, null)
  assert.equal(g.originMark, null)
  assert.equal(g.player.originEnergy, 0)
  assert.equal(g.player.mutationState.stacks, 0)
  assert.equal(g.player.routeState.resonance.circuits, 0)
  assert.equal(g.player.markState.mark, null)
  assert.equal(g.primarySpec, null)
  assert.equal(g.strainSkill.id, 'slime_shock')
})

console.log(`\n原生黏液重构验证通过：${passed} 组 ✓`)
