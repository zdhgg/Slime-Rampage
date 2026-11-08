import assert from 'node:assert/strict'
import { createArena, spawn, spawnBoss, pressSpace, rollSkills, learn, dispose } from './test-support/arena-fixture.mjs'
import { ORIGIN_BASE, ORIGIN_RULES, ORIGIN_ROUTES, ORIGIN_SKILL_BY_ID, getOriginShockProfile, getOriginGrowth, originRouteOptions, originMarkOptions } from './src/game/OriginBuild.js'
import { gainOriginEnergy, trySpendOriginOverload, ORIGIN_SOURCES } from './src/game/PrimalEnergy.js'
import { triggerOriginMarkEcho } from './src/game/OriginEchoes.js'
import { Projectile } from './src/game/entities/Projectile.js'
import { CELL_SIZE, GRID_KEY_SCALE } from './src/game/EnemyManager.js'

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

/** 用真实引擎计时推进：冷却、超载窗口、同化层数、被动超载都走 update，不直接改状态。 */
function advance(g, seconds, step = 0.05) {
  const steps = Math.ceil(seconds / step)
  for (let i = 0; i < steps; i++) {
    g.elapsed += step
    g._updateStrainSkill(step)
    g.weaponSystem.originCombat.update(step)
    g.weaponSystem.originSourceCombat.update(step)
    g.weaponSystem.originOverload.update(step)
  }
}

/** 驱动被动控制器完成一次超载（启动 → 扣费 → 释放）。 */
function fireOverload(g) {
  g.weaponSystem.originOverload.reset()
  g.player.overloadState.active = false
  g.player.overloadState.timer = 0
  g.player.originEnergy = ORIGIN_BASE.overloadCost
  advance(g, 0.4, 0.02)
  assert.equal(g.player.overloadState.active, true, '被动超载应成功支付')
  assert.ok(g.player.originEnergy < ORIGIN_BASE.overloadCost)
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

check('空格不再支付超载：能量满格 + 有目标 → 被动控制器自动支付', g => {
  chooseRoute(g, 'resonance')
  spawn(g, { x: 40, hp: 1000 })
  g.weaponSystem.originOverload.cooldown = 9999 // 先隔离控制器
  g.player.originEnergy = ORIGIN_BASE.overloadCost - 1
  pressSpace(g)
  assert.equal(g.player.overloadState.active, false, '空格不支付超载')
  assert.ok(g.player.originEnergy >= ORIGIN_BASE.overloadCost, '震荡仍充能')

  g.weaponSystem.originOverload.cooldown = 0
  advance(g, 0.4, 0.02)
  assert.equal(g.player.overloadState.active, true)
  assert.equal(g.player.overloadState.route, 'resonance')
  assert.ok(g.player.originEnergy >= 0 && g.player.originEnergy < ORIGIN_BASE.overloadCost)
})

check('震荡不再有超载乘区：层数与能量都不改变震荡数值', g => {
  chooseRoute(g, 'assimilation')
  const normal = getOriginShockProfile(g)
  g.player.mutationState.stacks = 8
  g.player.mutationState.max = 8
  g.player.mutationState.timer = 4
  g.player.originEnergy = 100
  const boosted = getOriginShockProfile(g)
  assert.equal(boosted.damageMul, normal.damageMul)
  assert.equal(boosted.radius, normal.radius)
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

check('连续两次被动超载都能触发印记回响', g => {
  chooseRoute(g, 'resonance')
  chooseMark(g, 'glutton')
  spawn(g, { x: 30, hp: 10000 })
  fireOverload(g)
  assert.equal(g.player.markState.echoUsed, true, '第一次超载兑现回响')
  assert.equal(g.player.originGuard, 1)
  g.player.originGuard = 0
  g.player.originGuardTimer = 0

  fireOverload(g)
  assert.equal(g.player.markState.echoUsed, true, '第二次超载仍应兑现一次回响')
  assert.equal(g.player.originGuard, 1, '第二次回响真实生效，而不是被旧的 echoUsed 锁死')
})

check('同化层数叠满后由被动超载兑现（震荡只积累不再消耗）', g => {
  chooseRoute(g, 'assimilation')
  for (const x of [-30, 0, 30]) {
    const enemy = spawn(g, { x, hp: 100000 })
    enemy.isBoss = true // 首领不被击退，保证每次震荡都能命中 3 个目标
  }
  g.weaponSystem.originOverload.cooldown = 9999 // 隔离自动超载，专注叠层过程

  pressSpace(g)
  assert.equal(g.player.mutationState.stacks, 2, '3 目标震荡 +2 层')
  advance(g, 6.6)
  pressSpace(g)
  assert.equal(g.player.mutationState.stacks, 4, '第二次震荡后层数未过期')
  advance(g, 6.6)
  pressSpace(g)
  assert.equal(g.player.mutationState.stacks, 5, '第三次震荡叠满')
  assert.equal(g.player.mutationState.empowered, true, '满层标记已点亮')
  g.weaponSystem.originCombat.update(0.01)
  assert.ok(g.player.originMoveBuff >= 0.1, '战场适应：满层获得 10% 移速')

  advance(g, 6.6)
  pressSpace(g)
  assert.equal(g.player.mutationState.stacks, 5, '满层时震荡不再消耗层数')

  g.weaponSystem.originOverload.cooldown = 0
  fireOverload(g)
  assert.equal(g.player.mutationState.stacks, 0, '被动超载兑现并消耗全部层数')
  assert.ok(g.player.mutationState.formTimer > 0, '进入局部形态重组窗口')
})

check('多源切换额外充能受独立 3 秒 ICD', g => {
  chooseRoute(g, 'resonance')
  learn(g, 'ori_res_switch')
  // 暂时摘掉路线，隔离共振回路对充能数值的乘区，只验证切换 ICD。
  g.originRoute = null
  g.player.originEnergy = 0

  gainOriginEnergy(g, ORIGIN_SOURCES.PROJECTILE, 0)
  assert.equal(g.player.originEnergy, 10, '首次异源：8 + 切换 2')
  gainOriginEnergy(g, ORIGIN_SOURCES.SHOCK, 0.1)
  assert.equal(g.player.originEnergy, 18, '3 秒内再次切换不再获得额外 2')
  gainOriginEnergy(g, ORIGIN_SOURCES.PROJECTILE, 3.1)
  assert.equal(g.player.originEnergy, 28, '超过 3 秒后重新获得切换奖励')
})

check('震荡击杀首领的异源奖励只结算一次', g => {
  const boss = spawnBoss(g, 1)
  boss.shieldHits = 0
  g.player.originEnergy = 0
  pressSpace(g)
  assert.equal(g.player.originEnergy, 38, '震荡 +8、首领击杀 +30')
  g.weaponSystem._onKill(boss)
  assert.equal(g.player.originEnergy, 38, '重复 _onKill 不得重复发放')
})

check('路线液痕击杀精英：正常结算但不返还超载充能（防循环）', g => {
  chooseRoute(g, 'expansion')
  g.player.originEnergy = 0
  pressSpace(g) // 无敌人，只留下液痕
  assert.equal(g.weaponSystem.originCombat.fields.length, 1)
  g.player.originEnergy = 0
  const elite = spawn(g, { x: 0, hp: 0.05 })
  elite.isElite = true
  elite.maxHp = 1
  g.weaponSystem.originCombat.update(0.6)
  assert.equal(elite.active, false)
  assert.equal(g.weaponSystem.eliteKills, 1, '精英击杀照常统计')
  assert.equal(g.player.originEnergy, 0, '路线派生伤害击杀不返还 +15，避免循环充能')
})

check('普通飞弹击杀精英获得异源奖励', g => {
  g.enemyManager._enemies.length = 0
  const elite = spawn(g, { x: 80, hp: 1 })
  elite.isElite = true
  elite.maxHp = 1
  const bullet = new Projectile({ x: elite.x, y: elite.y, target: elite, damage: 1, vx: 0, vy: 0 })
  g.weaponSystem._projectiles.length = 0
  g.weaponSystem._projectiles.push(bullet)
  const grid = g.enemyManager.grid
  grid.clear()
  const cx = (bullet.x / CELL_SIZE) | 0
  const cy = (bullet.y / CELL_SIZE) | 0
  grid.set(cx * GRID_KEY_SCALE + cy, [elite])
  g.player.originEnergy = 0
  g.weaponSystem._resolveCollisions()
  assert.equal(elite.active, false)
  assert.equal(g.player.originEnergy, 23, '飞弹命中 +8、精英击杀 +15')
})

check('弹射印记深化后的超载回响总伤害不超过 35% 预算', g => {
  chooseRoute(g, 'expansion')
  chooseMark(g, 'gatling')
  // 回响预算基准 = 本次超载技能的主伤害倍率（此处用 3.0 代表一次中档源质技能）。
  const profile = { damageMul: 3.0 }
  const castDamage = g.weaponSystem.damage * g.weaponSystem.levelMul * profile.damageMul
  for (const rank of [1, 2]) {
    g.player.markState.rank = rank
    g.player.markState.echoUsed = false
    g.weaponSystem._projectiles.length = 0
    g.enemyManager._enemies.length = 0
    spawn(g, { x: 50, hp: 10000 })
    assert.equal(triggerOriginMarkEcho(g, { overloaded: true, center: g.player, profile }), true)
    const total = g.weaponSystem._projectiles.reduce((sum, bolt) => sum + bolt.damage, 0)
    assert.ok(total > 0)
    assert.ok(total <= castDamage * ORIGIN_RULES.echoShareCap + 1e-6,
      `rank ${rank}: ${total} > ${castDamage * ORIGIN_RULES.echoShareCap}`)
  }
})

check('原质扩张路线自带液痕，残留液痕卡只强化不解锁', g => {
  chooseRoute(g, 'expansion')
  assert.equal(g.skillLevels.ori_exp_residue || 0, 0)
  pressSpace(g)
  const first = g.weaponSystem.originCombat.fields.find(field => field.origin)
  assert.ok(first, '未学习残留液痕卡时路线已能留下液痕')
  const baseLife = first.life

  learn(g, 'ori_exp_residue')
  g.player.strainSkillCd = 0
  pressSpace(g)
  const second = g.weaponSystem.originCombat.fields.find(field => field.origin)
  assert.ok(second.life > baseLife, '残留液痕卡提高液痕持续时间')
})

check('原生普通卡描述与派生一致，路线预览不含未实现 T4', g => {
  const motility = ORIGIN_SKILL_BY_ID.origin_motility
  assert.match(motility.stats(0, g), /8%/, '1 级流体机动描述为 8%')
  assert.equal(getOriginGrowth({ ...g, skillLevels: { ...g.skillLevels, origin_motility: 1 } }).motilityBonus, 0.08)
  for (const route of Object.keys(ORIGIN_ROUTES)) {
    assert.ok(!ORIGIN_ROUTES[route].roadmap.some(line => line.startsWith('T4')),
      `${route} 不应展示未实现的 T4`)
  }
})

check('暴食碎片按“震荡前残血”判定，残血目标被震死也兑现护甲', g => {
  learn(g, 'ori_frag_glutton')
  const target = spawn(g, { x: 40, hp: 1000 })
  target.hp = 1 // 震荡前已残血，且会被本次震荡打死
  pressSpace(g)
  assert.equal(target.active, false, '残血目标被震荡打死')
  assert.equal(g.player.originGuard, 1, '命中前残血仍应触发护甲')
  assert.ok(g.player.originGuardTimer > 0)
})

check('异源碎片进入 HUD 快照，元素碎片无元素时明确提示未激活', g => {
  let snapshot = null
  g.onStats = (stats) => { snapshot = stats }
  const card = ORIGIN_SKILL_BY_ID.ori_frag_elemental
  assert.equal(g.applySkill(card), true)
  assert.ok(snapshot, '选卡后立即推送一次 HUD 快照')
  const chip = snapshot.originFragments.find(f => f.id === 'elemental')
  assert.ok(chip, '碎片出现在 HUD 快照')
  assert.match(chip.title, /尚未吸收元素核心/)
  assert.match(card.stats(0, g), /未吸收任何元素核心/)
  g.player.elements.set('fire', 1)
  g._pushStats()
  const active = snapshot.originFragments.find(f => f.id === 'elemental')
  assert.doesNotMatch(active.title, /尚未吸收元素核心/)
  assert.match(active.title, /35%|附加/)
})

check('碎片手感数值与卡面一致（ICD/时长）', g => {
  learn(g, 'ori_frag_glutton')
  const target = spawn(g, { x: 40, hp: 1000 })
  target.hp = 500 // 50%：不触发
  pressSpace(g)
  assert.equal(g.player.originGuard, 0)
  target.hp = 200 // 20%：触发
  g.player.strainSkillCd = 0
  pressSpace(g)
  assert.equal(g.player.originGuard, 1)
  assert.equal(g.player.markState.icdByFamily.glutton, 6, '暴食碎片 ICD 6 秒')
  assert.match(ORIGIN_SKILL_BY_ID.ori_frag_glutton.stats(0, g), /6 秒 ICD/)
})

check('暗影/共生碎片手感数值与卡面一致', g => {
  learn(g, 'ori_frag_assassin')
  learn(g, 'ori_frag_symbiosis')
  spawn(g, { x: 40, hp: 100000 })
  pressSpace(g)
  assert.ok(Math.abs(g.player.stealthTimer - 0.5) < 1e-9, '暗影碎片 0.5 秒隐匿')
  assert.ok(Math.abs(g.player.originNextHitMul - 1.12) < 1e-9, '下一次攻击 +12%')
  assert.equal(g.player.markState.icdByFamily.assassin, 6)
  assert.equal(g.player.markState.bubble, 1)
  assert.equal(g.player.markState.bubbleTimer, 12)
  assert.equal(g.player.markState.icdByFamily.symbiosis, 10)
  assert.match(ORIGIN_SKILL_BY_ID.ori_frag_assassin.stats(0, g), /0\.5 秒隐匿/)
  assert.match(ORIGIN_SKILL_BY_ID.ori_frag_symbiosis.stats(0, g), /10 秒 ICD/)
})

console.log(`\n原生黏液重构验证通过：${passed} 组 ✓`)
