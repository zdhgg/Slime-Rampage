import assert from 'node:assert/strict'
import { createArena, dispose, pressSpace } from './test-support/arena-fixture.mjs'
import { rollSkills } from './src/game/SkillPool.js'
import {
  ELEMENTAL_ROUTES,
  ELEMENTAL_ROUTE_SKILLS,
  ELEMENTAL_BUILD_RULES,
  elementalBuildNote,
  elementalRouteInvestment,
  elementalRouteOptions,
  elementalRouteReady,
  elementalSkillOptions,
} from './src/game/ElementalBuild.js'
import { ELEMENTAL_SCHOOLS, ELEMENTAL_SCHOOL_IDS, MAX_CROSS_CANTRIPS, scholarDamageMultiplier } from './src/game/ElementalSchools.js'
import { ELEMENTAL_SKILLS } from './src/game/SpellRules.js'

let checks = 0
function check(name, test) {
  const g = createArena('elemental')
  g.reset()
  g.running = true
  g.input.suspended = false
  g.enemyManager._enemies.length = 0
  g.enemyManager._spawnTimer = Infinity
  g.mapFeatures.barricades = []
  g.mapFeatures.resolvePlayerMovement = () => false
  try {
    test(g, g.weaponSystem.spellCombat)
    console.log(`✓ ${++checks}. ${name}`)
  } finally {
    dispose(g)
  }
}

const learnSchool = (s, schoolId) => {
  s.player.level = Math.max(2, s.player.level)
  const card = s.milestoneReward().options.find(o => o.school === schoolId || o.id === `spell_learn_${schoolId}`)
  assert.ok(card, `应提供 Lv.2 专精选项: ${schoolId}`)
  assert.equal(s.applyMilestone(card), true)
}

const pick = (g, id) => {
  const card = rollSkills(g, 99).find(o => o.id === id)
  assert.ok(card, `候选池应包含 ${id}`)
  assert.equal(g.applySkill(card), true)
}

check('Lv.2 四选一确定火/冰/电/毒主专精，卡池彻底纯化，跨系仅提供他系 Lv.1 基础', (g, s) => {
  assert.equal(MAX_CROSS_CANTRIPS, 2)
  assert.equal(s.usesBasicProjectile, true)
  g.player.level = 2
  const milestone = s.milestoneReward()
  assert.equal(milestone.stage, 'first')
  assert.equal(milestone.options.length, 4)
  assert.deepEqual(milestone.options.map(o => o.school), ['fire', 'ice', 'lightning', 'poison'])

  learnSchool(s, 'fire')
  assert.equal(s.school, 'fire')
  assert.equal(s.usesBasicProjectile, false)
  assert.deepEqual([...s.elements], ['fire'])

  const pool = rollSkills(g, 99)
  assert.ok(pool.some(c => c.id === 'fire_mastery'))
  assert.ok(pool.some(c => c.id === 'cantrip_ice'))
  assert.ok(pool.some(c => c.id === 'cantrip_lightning'))
  assert.ok(pool.some(c => c.id === 'cantrip_poison'))
  assert.ok(!pool.some(c => c.id === 'cantrip_fire'), '本系不会作为跨系基础重复出现')
  assert.ok(!pool.some(c => c.id.startsWith('ice_') || c.id.startsWith('lit_') || c.id.startsWith('poi_')), '他系进阶/大法术永不混入')
  assert.ok(!pool.some(c => c.originOnly || ['com_shock', 'origin_flux'].includes(c.id)), '不会抽到原生卡')
})

check('Lv.3 首个常规升级保底提供签名引擎或自动大法术；单次三选一至多 1 张跨系卡', (g, s) => {
  for (const schoolId of ELEMENTAL_SCHOOL_IDS) {
    const inner = createArena('elemental')
    inner.reset()
    try {
      const sc = inner.weaponSystem.spellCombat
      learnSchool(sc, schoolId)
      inner.player.level = 3
      assert.equal(sc.normalChoices, 0)
      for (let i = 0; i < 30; i++) {
        const cards = rollSkills(inner, 3)
        assert.equal(cards.length, 3)
        assert.ok(cards.some(c => c.isSignatureEngine || c.isAutoAoE), `${schoolId} Lv.3 应保底包含签名或自动AOE`)
        assert.ok(cards.filter(c => c.isCantrip).length <= 1, `${schoolId} 单次三选一至多出现 1 张跨系基础`)
      }
    } finally {
      dispose(inner)
    }
  }
})

check('单局最多兼修 2 门他系基础；学满 2 门后第 3 门永久不再刷新，主系按 +8%/+16% 增伤', (g, s) => {
  learnSchool(s, 'fire')
  assert.equal(s.scholarMul, 1)
  g.player.level = 3

  pick(g, 'cantrip_ice')
  assert.deepEqual(s.crossCantrips, ['ice'])
  assert.equal(s.scholarMul, scholarDamageMultiplier(1))
  assert.equal(s.scholarMul, 1.08)

  pick(g, 'cantrip_lightning')
  assert.deepEqual(s.crossCantrips, ['ice', 'lightning'])
  assert.equal(s.scholarMul, scholarDamageMultiplier(2))
  assert.equal(s.scholarMul, 1.16)

  const afterPool = rollSkills(g, 999)
  assert.ok(!afterPool.some(c => c.isCantrip), '学满 2 门兼修后，第 3 门毒系基础绝对不再刷新')
  assert.equal(s.learnCantrip('poison'), false, 'runtime 接口亦拒绝超过第 3 门兼修')
  assert.equal(s.crossCantrips.length, 2)
})

check('四系均在第 6 波 / 远征第 3 章且选卡满 5 次开启同系 2 选 1 升华分支（永不锁定）', (g, s) => {
  for (const schoolId of ELEMENTAL_SCHOOL_IDS) {
    const inner = createArena('elemental')
    inner.reset()
    try {
      const sc = inner.weaponSystem.spellCombat
      learnSchool(sc, schoolId)
      sc.normalChoices = ELEMENTAL_BUILD_RULES.choicesBeforeBranch - 1
      inner.enemyManager.wave = ELEMENTAL_BUILD_RULES.branchWave
      assert.equal(elementalRouteReady(inner), false, '选卡未满 5 次不触发升华')

      sc.normalChoices = ELEMENTAL_BUILD_RULES.choicesBeforeBranch
      inner.enemyManager.wave = ELEMENTAL_BUILD_RULES.branchWave - 1
      assert.equal(elementalRouteReady(inner), false, '未到第 6 波不触发升华')

      inner.enemyManager.wave = ELEMENTAL_BUILD_RULES.branchWave
      assert.equal(elementalRouteReady(inner), true)

      inner.configureRun({ mode: 'expedition', difficulty: 'hard' })
      inner.expeditionStage = ELEMENTAL_BUILD_RULES.branchStage - 1
      assert.equal(elementalRouteReady(inner), false)
      inner.expeditionStage = ELEMENTAL_BUILD_RULES.branchStage
      assert.equal(elementalRouteReady(inner), true)

      const options = elementalRouteOptions(inner)
      assert.equal(options.length, 2)
      assert.ok(options.every(o => !o.locked && o.school === schoolId))
      assert.deepEqual(options.map(o => o.branch), ELEMENTAL_SCHOOLS[schoolId].branches)
    } finally {
      dispose(inner)
    }
  }
})

check('升华选定后未学签名法术免费赠 Lv.1；锁定分支池与 Lv.14 终极门槛准确无误', (g, s) => {
  learnSchool(s, 'fire')
  s.normalChoices = 5
  g.enemyManager.wave = 6
  g.player.level = 9
  const options = elementalRouteOptions(g)
  const dest = options.find(o => o.branch === 'fire_destruction')
  assert.ok(dest)
  assert.equal(g.skillLevels.fire_rain || 0, 0)
  assert.equal(g.applySkill(dest), true)

  assert.equal(s.branch, 'fire_destruction')
  assert.equal(g.skillLevels.fire_rain, 1, '未学火焰雨选毁灭分支后免费获赠 Lv.1')
  assert.equal(elementalRouteInvestment(g), 1)
  assert.equal(elementalRouteReady(g), false, '定型后不再触发升华界面')

  const branchPool = rollSkills(g, 999)
  assert.ok(branchPool.some(c => c.id === 'fire_dest_cataclysm'))
  assert.ok(branchPool.some(c => c.id === 'fire_dest_immolate'))
  assert.ok(!branchPool.some(c => c.id === 'fire_pyro_streak' || c.id === 'fire_pyro_combust'), '不混入同系另一分支卡')
  assert.ok(!branchPool.some(c => c.id === 'fire_dest_ultimate'), '投入与等级未达标时不出现终极')

  pick(g, 'fire_dest_cataclysm')
  pick(g, 'fire_dest_immolate')
  pick(g, 'fire_infernal_pact')
  assert.equal(elementalRouteInvestment(g), 4)

  g.player.level = 13
  g.enemyManager.wave = 10
  assert.ok(!rollSkills(g, 999).some(c => c.id === 'fire_dest_ultimate'), 'Lv.13 仍差 1 级')

  g.player.level = 14
  g.enemyManager.wave = 9
  assert.ok(!rollSkills(g, 999).some(c => c.id === 'fire_dest_ultimate'), '第 9 波未达标')

  g.enemyManager.wave = 10
  const ultCard = rollSkills(g, 999).find(c => c.id === 'fire_dest_ultimate')
  assert.ok(ultCard, 'Lv.14 + 第 10 波 + 投入>=4 后进入卡池')
  assert.equal(g.applySkill(ultCard), true)
  assert.equal(s.branchUltimate, 'fire_dest_ultimate')
  assert.equal(g.strainSkill.name, '深渊浩劫')
  assert.ok(!rollSkills(g, 999).some(c => c.id === 'fire_dest_ultimate'), '终极只能学习 1 次')
})

check('前置依赖、护盾Lv3上限与无尽第25波无尽奥秘准入正常', (g, s) => {
  learnSchool(s, 'ice')
  g.player.level = 5
  assert.ok(!rollSkills(g, 999).some(c => c.id === 'ice_blizzard_cdr'), '未学暴风雪不出现极寒缩冷')
  pick(g, 'ice_blizzard')
  assert.ok(rollSkills(g, 999).some(c => c.id === 'ice_blizzard_cdr'), '学习暴风雪后解锁极寒缩冷')

  for (let i = 0; i < 3; i++) pick(g, 'spell_shield')
  assert.ok(!rollSkills(g, 999).some(c => c.id === 'spell_shield'), '法术护盾满级 3 后退池')

  assert.ok(!rollSkills(g, 999).some(c => c.id === 'ele_endless_arcane'), '非无尽模式不出现无尽奥秘')
  g.configureRun({ mode: 'endless', difficulty: 'normal' })
  g.enemyManager.wave = 24
  assert.ok(!rollSkills(g, 999).some(c => c.id === 'ele_endless_arcane'), '无尽第 24 波未开放无尽奥秘')
  g.enemyManager.wave = 25
  assert.ok(rollSkills(g, 999).some(c => c.id === 'ele_endless_arcane'), '无尽第 25 波开放无尽奥秘')
})

check('全 58 张元素技能与 8 分支字段完整，buildNote 与 stats 数值格式零异常', (g, s) => {
  const all = [...ELEMENTAL_SKILLS, ...ELEMENTAL_ROUTE_SKILLS]
  assert.equal(all.length, 58)
  assert.equal(Object.keys(ELEMENTAL_ROUTES).length, 8)
  for (const sk of all) {
    assert.ok(sk.id && sk.name && sk.desc)
    const sample = sk.stats(0)
    assert.ok(typeof sample === 'string' && sample.length > 0)
    assert.ok(!/undefined|NaN|Infinity/.test(sample), `${sk.id}.stats(0) 异常: ${sample}`)
  }
  assert.match(elementalBuildNote(g), /Lv\.2/)
  learnSchool(s, 'poison')
  assert.match(elementalBuildNote(g), /瘟疫灾厄/)
  assert.ok(elementalSkillOptions(g, ELEMENTAL_SKILLS, [], 3).length > 0)
  pressSpace(g)
})

console.log('元素 v2 构筑规则验证全部通过 ✓')
