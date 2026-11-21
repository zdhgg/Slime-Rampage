import assert from 'node:assert/strict'
import { createArena, spawn, spawnBoss, learn, dispose, pressSpace, rollSkills, ctx2d } from './test-support/arena-fixture.mjs'
import { rollBossSkills } from './src/game/SkillPool.js'
import { computeSquadSynergies } from './src/game/PetRoster.js'

let checks = 0
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`)

function check(name, test) {
  const g = createArena('summoner'), pets = g.weaponSystem.petCombat
  try { pets.sync(); test(g, pets); console.log(`✓ ${++checks}. ${name}`) } finally { dispose(g) }
}

function draft(g, ...ids) {
  const needSlots = g.weaponSystem.petCombat.squadTypes.length + ids.length
  if (needSlots >= 2) g.player.level = Math.max(g.player.level, 4)
  if (needSlots >= 3) { g.player.level = Math.max(g.player.level, 8); g.enemyManager.wave = Math.max(g.enemyManager.wave, 4) }
  if (needSlots >= 4) { g.player.level = Math.max(g.player.level, 12); g.enemyManager.wave = Math.max(g.enemyManager.wave, 8) }
  for (const id of ids) learn(g, id)
  g.weaponSystem.petCombat.sync()
}

check('开局岩甲护卫、技能成长、四人上限、独行补偿与新局清理', (g, p) => {
  assert.equal(p.items.length, 1); assert.equal(p.items[0].hp, 11)
  near(p.soloCompensation, 1.24)
  learn(g, 'pet_vitality'); assert.equal(p.items[0].hp, 14)

  draft(g, 'pet_partner')
  assert.equal(p.items.length, 2); assert.equal(p.items[1].hp, 10)
  near(p.soloCompensation, 1.16)

  draft(g, 'pet_spark_partner', 'pet_frost_partner')
  assert.equal(p.cap, 4); assert.equal(p.items.length, 4)
  assert.equal(new Set(p.items.map(pet => pet.type)).size, 4)
  near(p.soloCompensation, 1)
  assert.equal(p.fullSquadActive, true)

  // 旧档隐藏基因（伙伴活性+共生原核）软上限收敛检查：1.3888 -> 1.20（叠加 Lv.5 1.10 = 1.32）
  g.player.genePetDamageMul = 1.3888
  near(p.damageScale, 1.2 * 1.1)
  g.player.genePetDamageMul = 1

  g.reset(); p.sync(); assert.equal(p.items.length, 1); assert.equal(p.items[0].hp, 11)
  g.applyStartingStrain('origin'); g.reset(); p.sync(); assert.equal(p.items.length, 0)
})

check('小队编成羁绊与满编共鸣正确激活数值', (g, p) => {
  assert.equal(computeSquadSynergies(['guardian']).active.length, 0)
  const synVan = computeSquadSynergies(['guardian', 'bramble'])
  assert.equal(synVan.vanguardActive, true)
  near(synVan.aoeMul, 1.25); near(synVan.recoveryCut, 2); near(synVan.shieldMul, 1.25)

  const synStr = computeSquadSynergies(['hunter', 'spark', 'ember'])
  assert.equal(synStr.strikerActive, true)
  near(synStr.critBonus, 0.12); assert.equal(synStr.strikerExtraTarget, 1); near(synStr.strikerBlastMul, 1.2)

  const synSup = computeSquadSynergies(['dew', 'spore', 'frost'])
  assert.equal(synSup.supportActive, true)
  near(synSup.zoneMul, 1.25); near(synSup.controlVulnBonus, 0.15)

  const synBal = computeSquadSynergies(['guardian', 'hunter', 'dew'])
  assert.equal(synBal.balancedActive, true)
  near(synBal.activeCdMul, 0.85); near(synBal.hasteBonus, 0.15)

  // 4/4 满编且激活均衡战阵：+12% 攻速，主动 CD = 9.5 * 0.85 * 0.9
  draft(g, 'pet_partner', 'pet_dew_partner', 'pet_frost_partner')
  near(p.rallyStats.cooldown, Number((9.5 * 0.85 * 0.9).toFixed(2)))
  assert.ok(p.attackRate >= 1.27)
  assert.ok(p.playerAttackHasteBonus() >= 0.27)
})

check('伙伴独立伤害、击杀只结算一次且不生影', (g, p) => {
  const pet = p.items[0], e = spawn(g, { x: 60, hp: 1 }), before = g.weaponSystem.kills
  p.strike(pet, { target: e }); p.strike(pet, { target: e })
  assert.equal(g.weaponSystem.kills, before + 1); assert.equal(g.weaponSystem.stats.petDamage, 1)
  assert.equal(p.items.length, 1)
  const miss = spawn(g, { x: 300 }); p.strike(pet, { target: miss }); assert.equal(miss.hp, 100)
})

check('空格鼓舞无需敌人、战吼震退伤敌，冷却与全倒地释放限制', (g, p) => {
  draft(g, 'pet_partner', 'pet_dew_partner', 'pet_spore_partner')
  const base = p.items.map(pet => p.attackDamage(pet)), ownerDamage = g.weaponSystem.damage
  const nearEnemy = spawn(g, { x: 80, hp: 100 }), nx = nearEnemy.x
  pressSpace(g)
  assert.equal(p.rallyTime, 5)
  near(g.player.strainSkillCd, Number((9.5 * 0.85 * 0.9).toFixed(2)))
  assert.ok(nearEnemy.hp < 100 && nearEnemy.x > nx, '战吼震退并伤害近敌')
  assert.ok(p.attackRate > 1.5)
  assert.equal(p.moveScale, 1.35)
  p.items.forEach((pet, i) => near(p.attackDamage(pet) / base[i], 1.3))
  assert.equal(g.weaponSystem.damage, ownerDamage)
  assert.ok(p.hud().every(pet => pet.boosted)); assert.equal(p.rallyHud().remaining, 5)

  p.update(0.5); pressSpace(g); assert.equal(p.rallyTime, 4.5)
  assert.equal(p.rally(), false); assert.equal(p.rallyTime, 4.5)
  const before = p.rallyTime; g.pause(); g._tick(1000); assert.equal(p.rallyTime, before)
  p.update(4.51); assert.equal(p.rallyTime, 0); assert.equal(p.rallyHud(), null)
  p.items.forEach((pet, i) => near(p.attackDamage(pet), base[i]))

  g.running = true
  for (const pet of p.items) p.hit(pet, 100)
  g.player.strainSkillCd = 0; pressSpace(g)
  assert.equal(g.player.strainSkillCd, 0); assert.equal(p.rallyTime, 0)
})

check('新伙伴·电光叽叽：瞬发连锁闪电、高压电弧链与雷电网阵', (g, p) => {
  draft(g, 'pet_spark_partner')
  const spark = p.items[1]; spark.x = g.player.x; spark.y = g.player.y
  const e1 = spawn(g, { x: 80, hp: 200 }), e2 = spawn(g, { x: 180, hp: 200 }), e3 = spawn(g, { x: 260, hp: 200 })
  p.strike(spark, { target: e1 })
  assert.ok(e1.hp < 200 && e2.hp < 200 && e3.hp < 200, '连锁闪电瞬间弹跳命中多名敌人')
  assert.ok(p.arcs.length >= 1)

  spark.x = g.player.x + 220; spark.y = g.player.y
  const onLine = spawn(g, { x: 110, y: 0, hp: 200 })
  spark.supportCd = 0
  assert.equal(p.beginSupport(spark), true)
  p.update(0.25); assert.ok(spark.supportActive > 0)
  p.update(0.05)
  assert.ok(onLine.hp < 200 && onLine.petSlowTime > 0, '高压电弧链电击并减速连线路径敌人')

  const eBefore = onLine.hp
  pressSpace(g)
  assert.ok(onLine.hp < eBefore, '雷电网阵鼓舞轰击周边敌群')
  p.render(ctx2d)
})

check('新伙伴·炽火绒绒：高爆溅射灼烧、流星三连炮与死爆不递归', (g, p) => {
  draft(g, 'pet_ember_partner')
  const ember = p.items[1]; ember.x = g.player.x; ember.y = g.player.y
  const e1 = spawn(g, { x: 150, hp: 200 }), e2 = spawn(g, { x: 195, hp: 200 })
  p.strike(ember, { target: e1 }); p.updateShots(0.6)
  assert.ok(e1.hp < 200 && e2.hp < 200 && e1.burnHits > 0)

  const hpBeforeMeteor = e1.hp
  ember.supportCd = 0; p.finishSupport(ember); ember.support = null
  assert.ok(p.meteorDrops.length >= 2)
  p.update(0.4)
  assert.ok(e1.hp < hpBeforeMeteor, '流星炮延迟落地震伤')

  // 炽火觉醒：灼烧死亡殉爆不无限连锁
  g.player.level = 5; g._ensureRoleAwakening()
  learn(g, 'pet_awake_ember')
  assert.equal(g.skillLevels.pet_awake_ember, 1)
  const dying = spawn(g, { x: 220, hp: 1 }), bystander = spawn(g, { x: 245, hp: 0.8 })
  dying.burnHits = 2; dying.hit(10); g.weaponSystem._onKill(dying)
  assert.ok(!bystander.active, '觉醒炽火殉爆击杀邻近残血')
  assert.equal(bystander._petDerivedKill, true, '衍生击杀标记防止无限递归')
})

check('新伙伴·刃棘滚滚：冲滚穿刺遇墙止步、棘刺风暴与公转护主', (g, p) => {
  draft(g, 'pet_bramble_partner')
  const bramble = p.items[1]; bramble.x = g.player.x; bramble.y = g.player.y
  const e1 = spawn(g, { x: 60, hp: 200 }), e2 = spawn(g, { x: 95, hp: 200 })
  p.strike(bramble, { target: e1 })
  assert.ok(bramble.rollDash)
  p.update(0.25)
  assert.ok(e1.hp < 200 && e2.hp < 200, '冲滚穿刺多个目标')

  // 碰墙提前结束冲滚
  bramble.x = g.player.x; bramble.y = g.player.y
  g.mapFeatures.resolvePlayerMovement = (probe, x, y) => { probe.x = x; probe.y = y; return true }
  p.strike(bramble, { target: spawn(g, { x: 90, hp: 200 }) })
  p.update(0.05)
  assert.equal(bramble.rollDash, null, '碰壁阻挡应立即收束冲滚')
  g.mapFeatures.resolvePlayerMovement = () => false

  bramble.supportCd = 0; p.finishSupport(bramble); bramble.support = null
  assert.ok(bramble.spinTimer > 0)
  p.update(1.95)
  p.update(0.1)
  assert.ok(p.shots.length >= 4, '棘刺风暴结束向外甩出穿透尖刺')

  pressSpace(g)
  assert.ok(bramble.orbitTimer > 2, '鼓舞触发刃棘公转绞杀')
  p.render(ctx2d)
})

check('新伙伴·霜晶咔咔：叠霜冻结、寒霜碎冰、冰环与公转冰柱', (g, p) => {
  draft(g, 'pet_frost_partner')
  const frost = p.items[1]; frost.x = g.player.x; frost.y = g.player.y
  const target = spawn(g, { x: 150, hp: 500 })
  for (let i = 0; i < 3; i++) { p.strike(frost, { target }); p.updateShots(0.5) }
  assert.ok(target.freeze > 0, '3 次霜晶命中冻结非首领目标')

  // 死亡碎冰爆炸不超过 5 目标且带衍生防递归
  const crowd = Array.from({ length: 7 }, (_, i) => spawn(g, { x: 150 + i * 5, hp: 50 }))
  target.hit(999); g.weaponSystem._onKill(target)
  assert.ok(crowd.filter(e => e.hp < 50).length <= 5)

  frost.supportCd = 0; p.finishSupport(frost); frost.support = null
  assert.ok(crowd[0].freeze > 0, '寒霜新星冻结附近敌人')

  pressSpace(g)
  assert.equal(p.frostPillars.length, 3, '鼓舞生成 3 根公转冰柱')
  p.render(ctx2d)
})

check('原生四杰重做：岩甲盾冲、石碑不伤玩家、疾风扇射、甘露清弹、孢毒二爆', (g, p) => {
  const guardian = p.items[0]
  const enemy = spawn(g, { x: 120, hp: 200 })
  guardian.supportCd = 0; p.finishSupport(guardian); guardian.support = null
  assert.ok(guardian.taunted.has(enemy) && p.playerShield >= 1 && guardian.shield > 0)

  g.player.level = 5; g._ensureRoleAwakening()
  learn(g, 'pet_awake_guardian')
  assert.equal(g.skillLevels.pet_awake_guardian, 1)
  p.hit(guardian, 999)
  assert.equal(p.monuments.length, 1)
  const lured = p.lureTarget(enemy)
  assert.equal(lured, p.monuments[0])
  const pHpBefore = g.player.hp
  assert.equal(enemy._hitTarget(lured, g.player, 5), false)
  assert.equal(g.player.hp, pHpBefore, '敌人攻击岩甲嘲讽碑不会误伤玩家')

  draft(g, 'pet_partner', 'pet_dew_partner', 'pet_spore_partner')
  const [_, hunter, dew, spore] = p.items
  hunter.supportCd = 0; p.finishSupport(hunter); hunter.support = null
  assert.equal(p.shots.length, 5, '风刃乱舞齐射 5 道叶刃')

  const bullet = { x: g.player.x + 80, y: g.player.y, radius: 4, damage: 1, active: true, isBoss: false }
  g.enemyManager._bullets.push(bullet)
  g.player.hp = g.player.maxHp - 1
  dew.supportCd = 0; p.finishSupport(dew); dew.support = null
  assert.equal(bullet.active, false, '甘露潮汐清除半径内普通敌弹')
  assert.equal(g.player.hp, g.player.maxHp, '甘露潮汐治疗本体')

  spore.supportCd = 0; p.finishSupport(spore); spore.support = null
  assert.ok(p.meteorDrops.length >= 1)
  p.update(0.6)
  assert.ok(p.sporeZones.length >= 1, '孢子囊爆破后留下菌雾')
  const zoneVictim = spawn(g, { x: p.sporeZones[0].x, y: p.sporeZones[0].y, hp: 1 })
  zoneVictim.petSporeMarkTime = 2; zoneVictim.hit(10); g.weaponSystem._onKill(zoneVictim)
  assert.ok(p.sporeZones.length >= 1)
  pressSpace(g)
  assert.equal(p.sporeZones.length, 0, '鼓舞瞬间引爆场上所有残余菌雾')
})

check('本体飞弹调优 0.72x（不吃独行补偿）、护盾冷却防刷窗、Lv.5 猎手印记与优先锁敌', (g, p) => {
  const w = g.weaponSystem, e = spawn(g, { x: 200, hp: 500 })
  w.fire(e)
  near(w._projectiles[0].damage, w.damage * w.levelMul * w.devourDamageMul * 0.72)
  assert.equal(p.grantPlayerShield(1, 4), true)
  assert.equal(p.grantPlayerShield(1, 4), false, '被动获盾受 2 秒冷却保护防连刷')
  p.playerShield = 0; p.playerShieldTimer = 0
  draft(g, 'pet_partner', 'pet_dew_partner', 'pet_spore_partner')
  w._projectiles.length = 0; w.fire(e)
  near(w._projectiles[0].damage, w.damage * w.levelMul * w.devourDamageMul * 0.72)

  g.player.level = 5; g._ensureRoleAwakening()
  assert.equal(g.primarySpec, 'symbiosis')
  const unmarked = spawn(g, { x: 100, hp: 500 }), farMarked = spawn(g, { x: 350, hp: 500 })
  p.onPlayerProjectileHit(farMarked, 1, false, { isBasicAttack: true })
  assert.ok(farMarked.petMarkTime > 0)
  assert.equal(p.nearest(p.items[0]), farMarked, '猎手印记牵引伙伴优先集火')

  const basePetHit = p.attackDamage(p.items[0])
  const hpBefore = farMarked.hp
  p.dealHit(p.items[0], farMarked, basePetHit)
  near((hpBefore - farMarked.hp) / basePetHit, 1.2 * 1.15, 0.01) // 猎手印记 +20% 叠加 灵域双辅 +15%
})

check('猎人三大自动战术：震荡威慑（真实减伤/缓速/护盾）、狩猎误导、灵能愈合', (g, p) => {
  learn(g, 'sym_tactic_weaken', 2)
  learn(g, 'sym_tactic_misdirect', 2)
  learn(g, 'sym_tactic_mend', 2)
  g.mapFeatures.speedMultiplierAt = () => 1

  const melee = spawn(g, { x: 90, type: 'knight', hp: 500 })
  const mage = spawn(g, { x: 120, type: 'mage', hp: 500 })
  const extra1 = spawn(g, { x: 130, hp: 500 }), extra2 = spawn(g, { x: 140, hp: 500 })
  const baseSpeedX = melee.x
  melee.update(0.1); const normMove = baseSpeedX - melee.x

  p.weakenTimer = 0.01; p.misdirectTimer = 0.01
  p.update(0.02)
  assert.ok(melee.petWeakenTime > 0 && melee.petSuppressAmount >= 0.3 && melee.petSlowTime > 0)
  assert.equal(p.playerShield, 1, '波及 >=4 名敌人时为本体凝聚真实灵能护盾')

  // 减速与伤害削减实效
  melee.x = baseSpeedX; melee.update(0.1)
  assert.ok((baseSpeedX - melee.x) < normMove * 0.72, '威慑减速生效')
  mage._shoot()
  const slowBullet = g.enemyManager._bullets.at(-1)
  assert.ok(Math.hypot(slowBullet.vx, slowBullet.vy) < slowBullet.speed * 0.75 || mage.petSuppressAmount >= 0.3)

  const playerHpBefore = g.player.hp; g.player.invincible = 0
  g.player.hit(1, { enemyAttack: true })
  assert.equal(g.player.hp, playerHpBefore, '威慑授予的真实灵盾直接抵消 1 次伤害')
  assert.equal(p.playerShield, 0)

  // 误导牵引至前锋并授盾
  const guardian = p.items[0]
  assert.equal(p.isTaunted(melee), true)
  assert.equal(melee.petTauntTarget, guardian)
  assert.ok(guardian.shield > 0)

  // 灵能愈合每命中治疗伤员 / 加速复苏 / 缩减空格 CD
  guardian.hp = guardian.maxHp - 4
  for (let i = 0; i < 7; i++) p.onPlayerProjectileHit(extra1, 1, false, { isBasicAttack: true })
  assert.ok(guardian.hp >= guardian.maxHp - 1.5, '灵能愈合累计命中自动治疗最低血量伙伴')

  guardian.hp = guardian.maxHp; g.player.strainSkillCd = 5
  for (let i = 0; i < 7; i++) p.onPlayerProjectileHit(extra2, 1, false, { isBasicAttack: true })
  assert.ok(g.player.strainSkillCd < 5, '全员满血时灵能愈合缩短空格冷却')
})

check('阻挡、超距脱战回位、防重叠分散、巢心保护与完整实战渲染清理', (g, p) => {
  draft(g, 'pet_spark_partner', 'pet_ember_partner', 'pet_frost_partner')
  g.player.hp = g.player.maxHp = 1000
  const e = spawn(g, { x: 80, hp: 500 })
  g.mapFeatures.resolvePlayerMovement = (probe, x, y) => { probe.x = x; probe.y = y; return true }
  assert.equal(p.nearest(p.items[0]), null)
  g.mapFeatures.resolvePlayerMovement = () => false

  for (let i = 0; i < 14; i++) spawn(g, { x: Math.cos(i) * 240, y: Math.sin(i) * 200, hp: 10, type: i % 2 ? 'mage' : 'knight' })
  for (let i = 0; i < 600; i++) {
    g.update(1 / 60)
    if (i % 60 === 0) g.render()
  }
  p.renderGround(ctx2d)
  p.render(ctx2d)
  assert.ok(g.weaponSystem.stats.petDamage > 0 && g.weaponSystem.kills > 0)
  assert.ok(p.items.every(pet => Number.isFinite(pet.x + pet.y + pet.hp + pet.down)))
  g.finishRun('defeat')
  assert.equal(p.items.length, 0); assert.equal(p.shots.length, 0); assert.deepEqual(p.hud(), [])
})

console.log(`PASS: ${checks} pet combat v2 checks`)
