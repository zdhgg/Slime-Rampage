import assert from 'node:assert/strict'
import { createArena, spawn, spawnBoss, dispose, rollSkills, ctx2d } from './test-support/arena-fixture.mjs'
import { SYMBIOSIS_ENDLESS_SKILL, SYMBIOSIS_ROUTES, SYMBIOSIS_ROUTE_SKILLS, SYMBIOSIS_SKILL_BY_ID, symbiosisDraftReady, unlockedSquadSlots } from './src/game/SymbiosisBuild.js'
import { captureExpeditionCheckpoint, restoreExpeditionCheckpoint } from './src/game/RunCheckpoint.js'
import { PET_SKILLS } from './src/game/PetSkills.js'

let checks = 0
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`)
const check = (name, fn) => { const game = createArena('summoner'); try { fn(game); console.log(`✓ ${++checks}. ${name}`) } finally { dispose(game) } }
const learn = (game, id, count = 1) => {
  for (let i = 0; i < count; i++) {
    const sk = SYMBIOSIS_SKILL_BY_ID[id] || PET_SKILLS.primary.find(s => s.id === id)
    assert.ok(sk, `Unknown skill ${id}`)
    assert.equal(game.applySkill(sk), true, `Failed to learn ${id}`)
  }
}

function setupFullSquad(game, partnerIds = ['pet_partner', 'pet_dew_partner', 'pet_spore_partner']) {
  game.player.level = Math.max(game.player.level, 12)
  game.enemyManager.wave = Math.max(game.enemyManager.wave, 8)
  game.expeditionStage = Math.max(game.expeditionStage || 1, 4)
  for (const id of partnerIds) learn(game, id)
  game.weaponSystem.petCombat.sync()
}

check('8 选 4 阶梯选秀门控：Lv.4 / Lv.8+W4 / Lv.12+W8 逐步解锁且正常卡池隔离', game => {
  const p = game.weaponSystem.petCombat
  assert.equal(unlockedSquadSlots(game), 1)
  assert.equal(symbiosisDraftReady(game), false)
  assert.ok(!rollSkills(game, 100).some(c => c.isPartnerChoice), '常规随机卡池不含伙伴选秀卡')

  game.player.level = 4
  assert.equal(unlockedSquadSlots(game), 2)
  assert.equal(symbiosisDraftReady(game), true)
  const draft1 = rollSkills(game, 3)
  assert.equal(draft1.length, 3)
  assert.ok(draft1.every(c => c.isPartnerChoice && c.synergyPreview && c.rangerInfusePreview))
  assert.equal(game.applySkill(draft1[0]), true)
  assert.equal(p.squadTypes.length, 2)
  assert.equal(symbiosisDraftReady(game), false)

  // 未满第 4 波即使 Lv.8 也不开 3 号位；第 4 波后解锁
  game.player.level = 8; game.enemyManager.wave = 3
  assert.equal(unlockedSquadSlots(game), 2)
  game.enemyManager.wave = 4
  assert.equal(unlockedSquadSlots(game), 3)
  assert.equal(game.applySkill(rollSkills(game, 3)[0]), true)
  assert.equal(p.squadTypes.length, 3)

  // 远征模式按第 4 章解锁 4 号位
  game.configureRun({ mode: 'expedition', difficulty: 'normal' })
  game.player.level = 12; game.expeditionStage = 3
  assert.equal(unlockedSquadSlots(game), 3)
  game.expeditionStage = 4
  assert.equal(unlockedSquadSlots(game), 4)
  assert.equal(game.applySkill(rollSkills(game, 3)[0]), true)
  assert.equal(p.squadTypes.length, 4)

  // 仅在场伙伴对应的觉醒卡进入随机池
  const awakeIds = new Set(rollSkills(game, 200).filter(c => c.isPartnerAwakening).map(c => c.partnerType))
  for (const type of awakeIds) assert.ok(p.squadTypes.includes(type), `离场伙伴 ${type} 觉醒卡不应出现`)
})

check('探索期三极入口与路线确认锁定，终极互斥', game => {
  game.primarySpec = 'symbiosis'; game.weaponSystem.petCombat.normalChoices = 1
  const cards = rollSkills(game, 200), ids = new Set(cards.map(c => c.id))
  for (const route of Object.values(SYMBIOSIS_ROUTES)) assert.ok(ids.has(route.seed), route.seed)
  assert.ok(!cards.some(c => c.isSymbiosisRoute || c.isCapstone))

  game.weaponSystem.petCombat.normalChoices = 5; game.enemyManager.wave = 6
  learn(game, 'sym_beast_seed')
  const ceremony = rollSkills(game, 3)
  assert.equal(ceremony.length, 3)
  assert.equal(ceremony.find(c => c.route === 'beast').locked, false)
  assert.equal(ceremony.find(c => c.route === 'ranger').locked, true)
  assert.equal(ceremony.find(c => c.route === 'bond').locked, true)
  assert.equal(game.applySkill(ceremony.find(c => c.route === 'beast')), true)
  assert.equal(game.weaponSystem.petCombat.route, 'beast')

  setupFullSquad(game)
  game.player.level = 14; game.enemyManager.wave = 10
  learn(game, 'sym_beast_frenzy', 3)
  const postLock = rollSkills(game, 200)
  assert.ok(postLock.some(c => c.id === 'sym_beast_cleave'))
  assert.ok(!postLock.some(c => c.id === 'sym_ranger_focus' || c.id === 'sym_bond_chain'))
  assert.ok(postLock.some(c => c.id === 'sym_beast_ultimate'))
  assert.equal(game.applySkill(postLock.find(c => c.id === 'sym_beast_ultimate')), true)
  assert.ok(!rollSkills(game, 200).some(c => c.id === 'sym_ranger_ultimate' || c.id === 'sym_bond_ultimate'))
})

check('万兽统领路线：信号弹破甲、伙伴暴击狂潮、顺劈不递归与万兽天灾分影', game => {
  setupFullSquad(game, ['pet_partner', 'pet_spark_partner', 'pet_ember_partner'])
  game.primarySpec = 'symbiosis'
  const p = game.weaponSystem.petCombat
  learn(game, 'sym_beast_seed', 2)
  p.normalChoices = 5; game.enemyManager.wave = 6
  assert.equal(p.chooseRoute('beast'), true)
  near(p.playerBodyDamageMultiplier(), 0.65)
  assert.equal(p.activeSkill.name, '狂野怒火')

  const e1 = spawn(game, { x: 80, hp: 500 }), e2 = spawn(game, { x: 110, hp: 500 })
  p.onPlayerProjectileHit(e1, 5, false, { isBasicAttack: true })
  assert.ok(e1.petBeastMarkTime > 0 && e2.petBeastMarkTime > 0, '破甲信号弹溅射标记敌群')
  const gHpBefore = p.items[0].hp
  e1._hitTarget(p.items[0], game.player, 5)
  assert.ok(gHpBefore - p.items[0].hp <= 4, '信号弹标记敌人对伙伴伤害 −20%')

  learn(game, 'sym_beast_frenzy', 2)
  learn(game, 'sym_beast_cleave', 2)
  learn(game, 'sym_beast_curse', 2)
  learn(game, 'sym_beast_revive', 2)
  const rateBefore = p.attackRate
  p.onKill(e2); p.onKill(e2); p.onKill(e2)
  assert.equal(p.beastFrenzyStacks, 3); assert.ok(p.attackRate >= rateBefore + 0.089)
  p.dealHit(p.items[0], e1, 10)
  assert.ok(e2.hp < 500, '狂兽践踏顺劈击中邻近目标而不递归触发')

  // 威慑波联动衰减冷却 + 伙伴倒地爆破
  p.items[1].supportCd = 5
  p.weakenTimer = 0.01; learn(game, 'sym_tactic_weaken', 1); p.update(0.02)
  assert.ok(p.items[1].supportCd < 5, '狩猎衰弱波及后缩减伙伴特技冷却')
  const eReviveBefore = e1.hp
  p.items[0].hurt = 0
  p.hit(p.items[0], 999)
  assert.ok(e1.hp < eReviveBefore, '野性复苏倒地冲击引爆周围敌群')

  // 终极：万兽天灾
  game.player.level = 14; game.enemyManager.wave = 10
  learn(game, 'sym_beast_ultimate')
  assert.equal(p.activeSkill.name, '万兽天灾')
  for (const pet of p.items) if (pet.down > 0) { pet.down = 0; pet.hp = pet.maxHp }
  assert.equal(p.rally(), true)
  assert.equal(p.spiritEchoes.length, 4, '万兽天灾召唤 4 只灵能分影协同扑杀')
  p.render(ctx2d)
})

check('借灵游侠路线：本体主C、50%双词条反哺、八伙伴赋能、防穿透连爆与苍穹猎星', game => {
  setupFullSquad(game, ['pet_frost_partner', 'pet_spark_partner', 'pet_ember_partner'])
  game.primarySpec = 'symbiosis'
  const p = game.weaponSystem.petCombat
  learn(game, 'pet_power', 3); learn(game, 'pet_haste', 3)
  learn(game, 'sym_ranger_seed', 2)
  p.normalChoices = 5; game.enemyManager.wave = 6
  assert.equal(p.chooseRoute('ranger'), true)
  assert.equal(p.activeSkill.name, '万灵汇聚炮')
  assert.ok(p.playerBodyDamageMultiplier() > 1.75, '1.05 基础 + 50% 兽灵反哺 + 4 伙伴叠加强化本体倍率')
  assert.ok(p.playerAttackHasteBonus() >= 0.3, '50% 默契步调反哺本体攻速')
  near(p.playerProjectileSpeedMul(), 1.25)
  assert.equal(p.playerBonusPierces(), 2, '基础 +1 穿透叠加霜晶 +1 穿透')
  assert.ok(p.rallyStats.cooldown >= 6.8, '空格冷却守住健康下限')

  // 验证宠物伤害降至 0.75x，但特技更频繁且范围扩大 25%
  assert.ok(p.supportStats(p.items[1]).cooldown < 9)
  assert.equal(p.supportStats(p.items[1]).radius, 200)

  learn(game, 'sym_ranger_infuse', 2); learn(game, 'sym_ranger_focus', 2)
  learn(game, 'sym_ranger_escort', 2); learn(game, 'sym_ranger_barrage', 2)
  const e1 = spawn(game, { x: 140, hp: 1000 }), e2 = spawn(game, { x: 185, hp: 1000 })
  e1.freeze = 2
  const mod = p.modifyPlayerHit(10, 0.1, 3.0, e1)
  assert.ok(mod.critChance >= 0.28 && mod.critMul >= 3.9, '受控目标触发霜晶+穿甲猎心暴击暴伤')

  const singleProj = { isBasicAttack: true }
  p.onPlayerProjectileHit(e1, 40, true, singleProj)
  assert.ok(e2.hp < 1000, '暴击碎甲+火焰溅射+电弧链全部联动命中邻敌')
  assert.ok(e2.burnHits > 0 && p.arcs.length >= 1)
  // 同一枚飞弹多次穿透不再重复触发副箭计数或无内冷炎爆
  p.onPlayerProjectileHit(e2, 40, true, singleProj)
  p.onPlayerProjectileHit(e1, 40, true, singleProj)
  p.onPlayerProjectileHit(e2, 40, true, singleProj)
  assert.equal(p.rangerBarrageCount, 1, '单枚穿透弹只计 1 次齐射进度')

  for (let i = 0; i < 4; i++) p.onPlayerProjectileHit(e1, 20, false, { isBasicAttack: true })
  assert.ok(p.shots.some(s => s.type === 'ranger_arrow'), '万灵齐发追加共鸣副箭')

  // 万灵汇聚炮 & 终极苍穹猎星
  game.player.level = 14; game.enemyManager.wave = 10
  learn(game, 'sym_ranger_ultimate')
  assert.equal(p.activeSkill.name, '苍穹猎星')
  const bullet = { x: game.player.x + 80, y: game.player.y, radius: 4, damage: 1, active: true, isBoss: false }
  game.enemyManager._bullets.push(bullet)
  assert.equal(p.rally(), true)
  assert.equal(bullet.active, false, '汇聚护主震碎周围敌弹')
  assert.equal(p.beams.length, 3, '苍穹猎星轰出三轨全屏星轨炮')
  assert.ok(p.rangerUltimateTimer > 2.3 && p.rangerUltimateTimer <= 2.5)
  assert.equal(p.modifyPlayerHit(10, 0, 3, e1).forceCrit, true, '4 秒狂怒窗口本体攻击必暴')
  p.renderGround(ctx2d); p.render(ctx2d)
})

check('双生协奏路线：人宠双核、绞杀光网、同频连携与永恒星阵', game => {
  setupFullSquad(game, ['pet_partner', 'pet_dew_partner', 'pet_bramble_partner'])
  game.primarySpec = 'symbiosis'
  const p = game.weaponSystem.petCombat
  learn(game, 'sym_bond_seed', 2)
  p.normalChoices = 5; game.enemyManager.wave = 6
  assert.equal(p.chooseRoute('bond'), true)
  near(p.playerBodyDamageMultiplier(), 1.0)
  assert.equal(p.playerShield, 1, '选择双生协奏立刻获得联防护盾')
  assert.equal(p.activeSkill.name, '共生协奏')

  learn(game, 'sym_bond_chain', 2); learn(game, 'sym_bond_volley', 2)
  learn(game, 'sym_bond_aegis', 2); learn(game, 'sym_bond_surge', 2)

  // 光网切割敌人 + 减速
  const onLink = spawn(game, { x: (game.player.x + p.items[0].x) / 2 - game.player.x, y: (game.player.y + p.items[0].y) / 2 - game.player.y, hp: 500 })
  p.bondLinkTick = 0; p.update(0.05)
  assert.ok(onLink.hp < 500 && onLink.petSlowTime > 0, '双生灵链自动切割路径敌群')

  // 本体命中触发伙伴补刀 + 盾反双端爆破 + 缩减空格冷却
  const eBefore = onLink.hp
  p.onPlayerProjectileHit(onLink, 10, false, { isBasicAttack: true })
  p.onPlayerProjectileHit(onLink, 10, false, { isBasicAttack: true })
  assert.ok(onLink.hp < eBefore || p.shots.length > 0, '同频连携令伙伴立即追击补刀')

  game.player.strainSkillCd = 4; game.player.invincible = 0
  p.grantPlayerShield(1, 5)
  const hpBeforeHit = game.player.hp
  game.player.hit(1, { enemyAttack: true })
  assert.equal(game.player.hp, hpBeforeHit)
  assert.ok(game.player.strainSkillCd < 4, '联防护盾挡伤反震并缩短空格冷却')

  // 终极：永恒星阵（锁血不倒 + 清弹 + 结束全队回血）
  game.player.level = 14; game.enemyManager.wave = 10
  learn(game, 'sym_bond_ultimate')
  assert.equal(p.activeSkill.name, '永恒星阵')
  assert.equal(p.rally(), true)
  p.items[0].hp = 2
  p.hit(p.items[0], 999)
  assert.equal(p.items[0].hp, 1, '永恒星阵期间伙伴锁血 1 点不倒')
  p.update(p.rallyTime + 0.05)
  assert.ok(p.items[0].hp > 1, '星阵结束全队恢复 35% 生命')
  p.renderGround(ctx2d); p.render(ctx2d)
})

check('无尽灵契解锁门控（无尽第 25 波）与递减成长实效', game => {
  game.configureRun({ mode: 'endless', difficulty: 'normal' })
  game.primarySpec = 'symbiosis'; setupFullSquad(game)
  game.enemyManager.wave = 24
  assert.ok(!rollSkills(game, 200).some(c => c.id === 'sym_endless_pact'))
  game.enemyManager.wave = 25
  assert.ok(rollSkills(game, 200).some(c => c.id === 'sym_endless_pact'))
  assert.equal(game.applySkill(SYMBIOSIS_ENDLESS_SKILL), true)
  assert.ok(game.weaponSystem.petCombat.endlessMultiplier > 1)
})

check('远征换章保留选秀名单、星辰形态与路线进度；旧存档无缝迁移', game => {
  game.configureRun({ mode: 'expedition', difficulty: 'hard' })
  setupFullSquad(game, ['pet_partner', 'pet_spark_partner', 'pet_frost_partner'])
  game.primarySpec = 'symbiosis'
  const p = game.weaponSystem.petCombat
  p.normalChoices = 5; learn(game, 'sym_ranger_seed', 2)
  game.expeditionStage = 4
  assert.equal(p.chooseRoute('ranger'), true)
  p.starPets.add('spark')
  learn(game, 'sym_ranger_focus', 2); learn(game, 'sym_tactic_weaken', 2)
  game.player.level = 14; game.expeditionStage = 5
  learn(game, 'sym_ranger_ultimate')
  p.rally(); assert.ok(p.beams.length > 0 && p.rallyTime > 0)

  game._enterExpeditionStage(6)
  const checkpoint = captureExpeditionCheckpoint(game)
  assert.ok(checkpoint)
  assert.equal(p.route, 'ranger'); assert.equal(p.routeUltimate, 'ranger')
  assert.deepEqual(p.squadTypes, ['guardian', 'hunter', 'spark', 'frost'])
  assert.equal(p.starPets.has('spark'), true)
  assert.equal(p.routeRangerFocusLevel, 2)
  assert.equal(p.tacticWeakenLevel, 2)
  assert.equal(p.beams.length, 0)
  assert.equal(p.rallyTime, 0)

  const fresh = createArena('summoner')
  try {
    // 构造一份旧版本 v1 存档结构验证迁移（hunt -> beast，guard/spore -> bond）
    checkpoint.components['weaponSystem.petCombat'].route = 'hunt'
    checkpoint.engine.skillLevels.sym_hunt_link = 2
    checkpoint.engine.skillLevels.pet_bulwark = 1
    restoreExpeditionCheckpoint(fresh, checkpoint)
    const fp = fresh.weaponSystem.petCombat
    assert.equal(fp.route, 'beast')
    assert.equal(fresh.skillLevels.pet_awake_guardian, 1)
    assert.ok(fp.routeBeastSeedLevel >= 2)
    assert.deepEqual(fp.squadTypes, ['guardian', 'hunter', 'spark', 'frost'])
  } finally { dispose(fresh) }

  p.reset()
  assert.equal(p.route, null); assert.equal(p.routeUltimate, null); assert.equal(p.starPets.size, 0)
})

check('路线卡 0 级预览与路由展示信息完备（无 0 增量与缺失技能名）', () => {
  const names = new Set(SYMBIOSIS_ROUTE_SKILLS.map(skill => skill.name))
  for (const route of Object.values(SYMBIOSIS_ROUTES)) {
    assert.ok(route.roleBadge, `${route.id} 需要角色定位徽章`)
    for (const label of route.skills) assert.ok(names.has(label), `路线面板技能名缺失：${label}`)
  }
  for (const skill of SYMBIOSIS_ROUTE_SKILLS) {
    if (typeof skill.stats !== 'function') continue
    const preview = skill.stats(0)
    assert.ok(!/\+0(\.0)?(px|%| 秒)|延长 0 秒/.test(preview), `${skill.id} Lv.0 预览不应出现 0 增量：${preview}`)
  }
})

console.log(`共生路线 v2 验证：${checks} 组全部通过 ✓`)
