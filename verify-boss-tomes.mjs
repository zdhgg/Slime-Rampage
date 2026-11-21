import assert from 'node:assert/strict'
import { createArena, spawn, spawnBoss, dispose, pressSpace, settleSwing } from './test-support/arena-fixture.mjs'
import { BOSS_TOMES, rollBossTomes } from './src/game/BossTomes.js'
import { gainPrimalEnergy, trySpendPrimalOverload } from './src/game/PrimalEnergy.js'
import { onNormalDevoured } from './src/game/GluttonResource.js'
import { GLUTTON_VORTEX_WINDUP } from './src/game/GluttonCombat.js'
import { elementalSkillOptions } from './src/game/ElementalBuild.js'
import { ELEMENTAL_SKILLS, ordinarySpellCoreSkills } from './src/game/SpellRules.js'
import { SKILL_DATABASE } from './src/game/SkillPool.js'
import { resolveSkillIcon } from './src/components/skillIconRegistry.js'

let passed = 0
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`)
function test(strain, name, run) {
  const g = createArena(strain)
  g.evolutionEvent = () => {}
  try { run(g); console.log(`✓ ${++passed}. ${strain}: ${name}`) } finally { dispose(g) }
}
function learn(g, id, ranks = 1) {
  for (let i = 0; i < ranks; i++) {
    const card = rollBossTomes(g, 99).find(card => card.id === `boss_${id}`)
    assert.ok(card, id); assert.equal(g.applySkill(card), true)
  }
}
for (const strain of Object.keys(BOSS_TOMES)) test(strain, '四本三级、独立职业池、升级不增等级/普通投入、满级退出', g => {
  const level = g.player.level, ordinary = Object.keys(g.skillLevels).length
  assert.equal(BOSS_TOMES[strain].length, 4)
  const first = rollBossTomes(g, 3, () => .2)
  assert.equal(new Set(first.map(s => s.id)).size, 3)
  for (const s of BOSS_TOMES[strain]) {
    assert.equal(resolveSkillIcon(s).missing, false, s.id)
    const card = rollBossTomes(g, 99).find(c => c.id === s.id)
    assert.equal(g.applySkill(card), true)
    assert.equal(g.applySkill(card), false, 'stale offer cannot upgrade again')
    learn(g, s.id.slice(5), 2)
  }
  assert.equal(g.player.level, level)
  assert.equal(rollBossTomes(g, 99).length, 0)
  assert.equal(Object.values(g.bossSkillLevels).reduce((a, b) => a + b, 0), 12)
  if (strain !== 'summoner') assert.equal(Object.keys(g.skillLevels).length, ordinary)
  assert.ok(Object.values(g.weaponSystem.visualTiers).every(tier => tier < 4), 'tomes never unlock a visual ultimate')
  g.reset(); assert.deepEqual(g.bossSkillLevels, {}); assert.equal(g.bossTomes.jobs.length, 0)
})
for (const strain of Object.keys(BOSS_TOMES)) test(strain, '确认秘典后回满生命并进入下一章，失效或重复选择不推进', g => {
  g.configureRun({ mode: 'expedition', difficulty: 'normal' }); g.reset(); g.running = true
  const rewards = [], checkpoints = []
  g.onExpeditionReward = payload => rewards.push(payload)
  g.onCheckpoint = checkpoint => checkpoints.push(checkpoint)
  g.player.hp = 1
  g.runState = 'stage-clearing'; g._stageClearT = 1
  g._updateExpedition(.01)
  const [reward] = rewards
  assert.equal(reward.phase, 'boss'); assert.equal(g._pauseLock, 1); assert.equal(g.running, false)
  for (const id of ['rest', 'tome', 'blood']) assert.equal(g.resolveExpeditionReward(id), false)
  assert.equal(g.expeditionStage, 1)
  assert.equal(g.player.hp, 1)
  const { id } = reward.options[0]
  assert.equal(g.resolveExpeditionReward(id), true)
  assert.equal(g.resolveExpeditionReward(id), false)
  assert.deepEqual(rewards, [reward, null])
  assert.equal(g.expeditionStage, 2); assert.equal(g._pauseLock, 0)
  assert.equal(g.player.hp, g.player.maxHp)
  assert.equal(checkpoints.length, 1)
  assert.equal(checkpoints[0].stage, 2)
  assert.equal(checkpoints[0].components.player.hp, g.player.maxHp)
  assert.equal(g.running, true)
  assert.ok(g.gemManager._gems.every(gem => !gem.mastery))
})
test('ricochet', '等级总量替换，不逐级重复乘算；回响按轮次保底且不递归', g => {
  const ws = g.weaponSystem, damage = ws.damage, count = ws.projectileCount, interval = ws.fireInterval
  learn(g, 'rico_chamber', 3); learn(g, 'rico_stabilizer', 3)
  near(ws.damage, damage * 1.2); near(ws.fireInterval, interval * .92); assert.equal(ws.projectileCount, count + 2)
  learn(g, 'rico_echo', 3)
  for (let i = 0; i < 4; i++) assert.equal(g.bossTomes.echoMultiplier(() => .99), 0)
  assert.equal(g.bossTomes.echoMultiplier(() => .99), .5)
  const e = spawn(g, { hp: 1000 })
  const random = Math.random; Math.random = () => 0
  try { ws.fire(e) } finally { Math.random = random }
  assert.equal(ws._projectiles.length, ws.projectileCount * 2)
  const echo = ws._projectiles.find(p => p.ricochet.tomeEcho)
  const before = e.hp; ws.ricochetCombat.hit(echo, e)
  near(before - e.hp, echo.damage)
})
test('origin', '充能/超载费用固定；源质调谐不放余震只给移速；护盾不叠容量', g => {
  learn(g, 'origin_conduit', 3); learn(g, 'origin_aftershock', 3); learn(g, 'origin_membrane', 3)
  for (const [i, source] of ['projectile', 'shock', 'projectile'].entries()) gainPrimalEnergy(g, source, i * .35)
  assert.equal(g.player.primalEnergy, 18, '普攻 2 + 震荡 8 + 普攻 2 + 导流 6')
  g.player.primalEnergy = 80
  const enemies = Array.from({ length: 8 }, (_, i) => spawn(g, { x: 45 + i, hp: 100 }))
  assert.equal(trySpendPrimalOverload(g), true); assert.equal(g.player.primalEnergy, 40)
  assert.equal(g.bossTomes.shield, 1)
  assert.ok(g.bossTomes.until.move > g.bossTomes.time, '调谐/膜满级给 2 秒移速窗口')
  g.bossTomes.update(.02)
  assert.equal(enemies.filter(e => e.hp < 100).length, 0, '调谐不再释放余震脉冲')
  assert.equal(g.bossTomes.jobs.length, 0)
  g.elapsed = 3 // 超载支付锁：真实战局里由 6.5 秒震荡冷却自然跨过
  g.player.overloadState.active = false // 超载窗口由 OriginCombat.update 推进；测试直接跨过
  assert.equal(trySpendPrimalOverload(g), true); assert.equal(g.player.primalEnergy, 0); assert.equal(g.bossTomes.shield, 1)
  g.bossTomes.clearStage(); assert.equal(g.bossTomes.shield, 0); assert.equal(g.bossTomes.jobs.length, 0)
})
test('glutton', '猎食节律吞噬与饱食爆发触发攻速与吸噬减冷却；王猎重颚吸噬易伤标记兑现', g => {
  learn(g, 'glutton_rhythm', 3); learn(g, 'glutton_jaw', 3)
  const before = g.weaponSystem.attackInterval
  onNormalDevoured(g.player); g.bossTomes.onGluttonDevour()
  near(g.weaponSystem.attackInterval, before / 1.25)
  g.player.strainSkillCd = 3
  for (let i = 0; i < 6; i++) onNormalDevoured(g.player)
  g.weaponSystem.gluttonCombat.update(0.01)
  near(g.player.strainSkillCd, 2)
  const e = spawnBoss(g, 1000), bite = g.weaponSystem.gluttonCombat
  assert.equal(bite.useVortex(), true); near(bite.vortex.windup, GLUTTON_VORTEX_WINDUP * .8)
  settleSwing(bite)
  assert.ok(g.bossTomes.jaw.get(e) > 0)
  near(g.bossTomes.gluttonPounceCooldownMultiplier(), .9)
})
test('elemental', '自动施法第五次强化、主动循环与护盾数值；延迟法印按主系上状态', g => {
  const spells = g.weaponSystem.spellCombat
  spells.chooseSchool('fire')
  learn(g, 'elemental_grimoire', 3); learn(g, 'elemental_circuit', 3); learn(g, 'elemental_veil', 3); learn(g, 'elemental_sigil', 3)
  near(spells.activeCooldown, 11 * 0.85); near(spells.shield.cooldown, 5.5)
  const e = spawn(g, { hp: 1000 })
  const powers = []
  for (let i = 0; i < 5; i++) { spells.cast('fire', e); powers.push(spells.shots.at(-1).damage) }
  near(powers[4] / powers[0], 1.3)
  g.bossTomes.onSpellActive(); assert.equal(g.bossTomes.castCredits, 3)
  const before = e.hp; spells.damageEnemy(e, 1, { element: 'fire' }); assert.ok(g.bossTomes.jobs.length)
  g.bossTomes.update(.81); assert.ok(e.hp < before - 1); assert.ok(e.burnHits > 0)
  const foe = spawn(g, { x: g.player.x + 80, y: g.player.y, hp: 200 })
  g.player.invincible = 0
  g.player.hit(1, { enemyAttack: true })
  assert.ok(foe.x > g.player.x + 95, '满级魔力帷幕破盾推开近敌')
})
test('elemental', '旧核心卡不进入v2普通池，主系专精与Boss秘典协同正常', g => {
  const spells = g.weaponSystem.spellCombat
  spells.chooseSchool('ice')
  assert.equal(ordinarySpellCoreSkills(g).length, 0)
  learn(g, 'elemental_sigil', 3)
  const e = spawn(g, { hp: 1000 })
  g.weaponSystem.critChance = 0
  spells.damageEnemy(e, 1, { element: 'water' })
  g.bossTomes.update(.81)
  assert.ok((e.frostStacks || 0) > 0 || e.spellSlowTime > 0)
  // Lv.3 余辉法印爆发后的 2 秒内，自动法术伤害享受 +15% 易伤
  const hpBeforeSigilHit = e.hp
  spells.damageEnemy(e, 10, { element: 'water', extraCritChance: -1 })
  near(hpBeforeSigilHit - e.hp, 11.5)
  assert.equal(elementalSkillOptions(g, ELEMENTAL_SKILLS, SKILL_DATABASE.common, 999).some(s => s.isSpellCoreUpgrade), false)
})
test('shadow', '分身首击只享受一次；虚化有界；残血增伤不施加给派生伤害', g => {
  learn(g, 'shadow_pact', 3); learn(g, 'shadow_cloak', 3); learn(g, 'assassin_mark', 3)
  const combat = g.weaponSystem.shadowCombat, clones = combat.clones, e = spawn(g, { hp: 1000 })
  const clone = clones.createAt(g.player, 0, e)
  let hp = e.hp; clones.hit(clone, e, 1); const first = hp - e.hp
  hp = e.hp; clones.hit(clone, e, 1); near(first / (hp - e.hp), 1.5)
  near(g.bossTomes.onEvade(), .4)
  e.hp = 300
  near(g.bossTomes.hitMultiplier(e, { bossTomeContext: { shadowBody: true } }), 1.4)
  near(g.bossTomes.hitMultiplier(e, { bossTomeDerived: true }), 1)
})
test('summoner', '万灵契约未满编开选秀、满编4人晋升星辰形态；生命与鼓舞协同按v2规则结算', g => {
  const oldHp = g.player.maxHp, p = g.weaponSystem.petCombat
  // 未满 4 人时：万灵契约开启选秀名额
  const rosterCard = rollBossTomes(g, 99).find(c => c.id === 'boss_pet_roster')
  assert.equal(rosterCard.draftGrant, true)
  assert.equal(g.applySkill(rosterCard), true)
  assert.equal(p.bonusSlots, 1)

  // 凑齐 4 人编制后：万灵契约改为随机晋升 🌟 星辰形态
  g.player.level = 12; g.enemyManager.wave = 8
  for (const id of ['pet_partner', 'pet_dew_partner', 'pet_spore_partner']) {
    g.skillLevels[id] = 1
    p.registerPartner(id === 'pet_partner' ? 'hunter' : id === 'pet_dew_partner' ? 'dew' : 'spore')
  }
  p.sync()
  assert.equal(p.squadTypes.length, 4)
  const starCard = rollBossTomes(g, 99).find(c => c.id === 'boss_pet_roster')
  assert.ok(starCard.starPetType && !starCard.draftGrant)
  const baseStarDmg = p.attackDamage(p.items.find(it => it.type === starCard.starPetType))
  const baseStarHp = p.petMaxHp(starCard.starPetType)
  assert.equal(g.applySkill(starCard), true)
  assert.ok(p.starPets.has(starCard.starPetType))
  assert.ok(p.petMaxHp(starCard.starPetType) > baseStarHp)
  assert.ok(p.attackDamage(p.items.find(it => it.type === starCard.starPetType)) > baseStarDmg * 1.3)

  learn(g, 'pet_vitality', 3); learn(g, 'pet_unity', 3); learn(g, 'pet_command', 3)
  assert.equal(g.player.maxHp, oldHp + 2)
  const e = spawn(g, { x: 80, hp: 500 })
  g.bossTomes.update(.01)
  assert.equal(p.playerShield, 1, '灵盾纽带自动授予本体真实护盾')
  assert.ok(e.hp < 500, 'Lv.3 灵盾触发 160px 震荡冲击')

  const pets = p.items
  for (const pet of pets) pet.supportCd = 5
  const eBeforeRally = e.hp
  assert.equal(p.rally(), true)
  assert.ok(pets.every(it => it.supportCd === 4), 'Lv.3 疾令契约鼓舞时全队特技冷却 −1 秒')
  assert.equal(p.rallyUnityBuffTimer, 4, 'Lv.3 群心契约赋予 4 秒暴击爆发窗')
  assert.ok(e.hp < eBeforeRally)
})
test('glutton', '胃铠挡伤触发反震与荆棘脉冲，冷却内不重复；辉胃等待敌人且猛扑只减一次计时', g => {
  learn(g, 'glutton_thorns', 3); learn(g, 'glutton_radiance', 3)
  const e = spawn(g, { hp: 1000 }), hp = g.player.hp
  g.player.gluttonGuard = 1; g.player.gluttonGuardTimer = 1
  g.player.hit(1, { enemyAttack: true })
  assert.ok(e.hp < 1000 - 1.2 * g.bossTomes.base()); assert.equal(g.player.hp, hp)
  assert.ok(g.bossTomes.until.biteFirst > g.bossTomes.time)
  const before = e.hp
  g.player.invincible = 0; g.player.hit(1, { enemyAttack: true }); near(e.hp, before)
  g.bossTomes.afterHit(e, e.hp + 1, { bossTomeContext: { heavy: true } })
  assert.equal(g.bossTomes.ready.radiance, 3)
  g.bossTomes.afterHit(e, e.hp + 1, { bossTomeContext: { heavy: true } })
  assert.equal(g.bossTomes.ready.radiance, 3)
})
test('origin', '蓄能原核超载后窗口增伤，到期退出，异源首击只消费一次', g => {
  learn(g, 'origin_reservoir', 3); learn(g, 'origin_conduit', 3)
  const e = spawn(g, { hp: 1000 })
  e.hit(10); near(e.hp, 990)
  g.player.primalEnergy = 40; trySpendPrimalOverload(g)
  e.hit(10); near(e.hp, 978.5)
  g.bossTomes.update(5.1); e.hit(10); near(e.hp, 968.5)
  g.bossTomes.until.originFirst = g.bossTomes.time + 3
  e.hit(10, { bossTomeContext: { basic: true } }); near(e.hp, 955.5)
  e.hit(10, { bossTomeContext: { basic: true } }); near(e.hp, 945.5)
})
test('ricochet', '冷凝弹腺一级开始治疗，逐级提高治疗量、缩短治疗冷却', g => {
  const e = spawn(g, { hp: 1000 }), p = g.player, ws = g.weaponSystem
  const hurtHp = p.maxHp - 3
  const shoot = (active = true) => {
    ws._projectiles.length = 0
    p.strainSkillCd = 0
    if (active) pressSpace(g)
    else ws.fire(e)
    assert.ok(ws._projectiles.length > 1, '射出多枚弹体进行命中结算')
    for (const projectile of ws._projectiles) ws.ricochetCombat.hit(projectile, e)
  }

  p.hp = hurtHp; shoot(); assert.equal(p.hp, hurtHp)
  for (const [amount, cooldown, skillReduction] of [[1, 30, 8], [1.5, 25, 15], [2, 20, 15]]) {
    const offer = rollBossTomes(g, 99).find(card => card.id === 'boss_rico_recharge')
    assert.equal(offer.stats, `空格冷却 −${skillReduction}% · 回血 ${amount} 点 · 治疗冷却 ${cooldown} 秒`)
    assert.equal(g.applySkill(offer), true)

    const previousReady = g.bossTomes.ready.heal
    p.hp = p.maxHp; shoot()
    assert.equal(g.bossTomes.ready.heal, previousReady, '满血命中不消耗治疗冷却')
    near(p.strainSkillCd, 8 * (1 - skillReduction / 100))

    p.hp = hurtHp; shoot(false)
    assert.equal(p.hp, hurtHp, '普攻不触发治疗')
    e.shieldHits = ws.projectileCount; shoot()
    assert.equal(p.hp, hurtHp, '护盾吸收全部伤害时不触发治疗')
    shoot()
    assert.equal(p.hp, hurtHp + amount, '多弹命中只治疗一次')
    assert.equal(g.bossTomes.ready.heal, g.bossTomes.time + cooldown)

    p.hp = p.maxHp - .5
    g.bossTomes.update(cooldown - .25); shoot()
    assert.equal(p.hp, p.maxHp - .5, '冷却结束前不触发治疗')
    g.bossTomes.update(.25); shoot()
    assert.equal(p.hp, p.maxHp, '冷却结束后再次治疗，最多回到满血')
    g.bossTomes.update(cooldown)
  }
})
test('elemental', '未融合的原质释放也兑现奥术回路主动增伤', g => {
  const spells = g.weaponSystem.spellCombat, e = spawn(g, { hp: 1000 })
  let before = e.hp; assert.equal(spells.useActive(), true); const base = before - e.hp
  learn(g, 'elemental_circuit')
  before = e.hp; assert.equal(spells.useActive(), true); near((before - e.hp) / base, 1.1)
})
test('elemental', '腐化箭继承整次施法强化，主动不消耗第五次自动施法计数', g => {
  const spells = g.weaponSystem.spellCombat, e = spawn(g, { hp: 1000 })
  spells.chooseSchool('poison'); learn(g, 'elemental_grimoire', 3)
  const powers = []
  for (let i = 0; i < 5; i++) {
    spells.cast('poison', e)
    powers.push(spells.shots.at(-1).damage)
  }
  near(powers[4] / powers[0], 1.3)
  spells.applyAgony(e, 1)
  const casts = g.bossTomes.casts
  spells.useActive(); assert.equal(g.bossTomes.casts, casts)
})
test('summoner', '万灵满员治疗仍有永久成长，复苏减伤真实生效', g => {
  for (const id of ['pet_partner', 'pet_dew_partner', 'pet_spore_partner']) g.skillLevels[id] = 1
  const pets = g.weaponSystem.petCombat; pets.sync()
  const pet = pets.items[0], oldMax = pet.maxHp
  pet.hp = 1; learn(g, 'pet_roster')
  assert.ok(pet.maxHp > oldMax && pet.hp > 1)
  learn(g, 'pet_roster', 2)
  pet.hp = 0; pet.down = .01; pets.update(.02)
  assert.ok(pet.tomeReviveUntil > g.elapsed)
  pet.hurt = 0; const before = pet.hp; pets.hit(pet, 4)
  near(before - pet.hp, 3)
})
test('origin', '秘典满级时只确认一次普通强化，随后回满生命并换章', g => {
  g.configureRun({ mode: 'expedition', difficulty: 'normal' })
  g.reset()
  for (const card of BOSS_TOMES.origin) learn(g, card.id.slice(5), 3)
  const rewards = []
  g.onExpeditionReward = reward => rewards.push(reward)
  g.player.hp = 1
  g.runState = 'stage-reward'
  const level = g.player.level
  g._beginBossSettlement(true)
  const [reward] = rewards
  assert.equal(reward.phase, 'compensation'); assert.equal(g._pauseLock, 1)
  assert.equal(g.resolveExpeditionReward(reward.options[0].id), true)
  assert.deepEqual(rewards, [reward, null])
  assert.equal(g.player.level, level)
  assert.equal(g.player.hp, g.player.maxHp)
  assert.equal(g.expeditionStage, 2); assert.equal(g._pauseLock, 0)
})
test('origin', '通关同帧经验选卡先完成，秘典不会叠加第二层暂停或覆盖旧面板', g => {
  let options; g.onLevelUp = cards => { options = cards }; g.onExpeditionReward = () => {}
  g.runState = 'stage-clearing'; g._stageClearT = 1
  g.openFreeSkillPanel(); assert.equal(g._pauseLock, 1)
  g._updateExpedition(.01); assert.equal(g._chapterSettlement, null)
  g.applySkill(options[0]); assert.equal(g._pauseLock, 0)
  g._updateExpedition(.01)
  assert.equal(g._chapterSettlement.phase, 'boss'); assert.equal(g._pauseLock, 1)
})
console.log(`BOSS秘典验证通过：${passed}组`)
