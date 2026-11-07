import assert from 'node:assert/strict'
import { createArena, spawn, spawnBoss, dispose, settleSwing } from './test-support/arena-fixture.mjs'
import { BOSS_TOMES, rollBossTomes } from './src/game/BossTomes.js'
import { gainPrimalEnergy, trySpendPrimalOverload } from './src/game/PrimalEnergy.js'
import { onNormalDevoured } from './src/game/GluttonResource.js'
import { ordinarySpellCoreSkills } from './src/game/SpellRules.js'
import { elementalSkillOptions } from './src/game/ElementalBuild.js'
import { ELEMENTAL_SKILLS } from './src/game/SpellRules.js'
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
for (const strain of Object.keys(BOSS_TOMES)) test(strain, '一把暂停锁串行秘典→补给→下一章，失效/重复选择不推进', g => {
  g.configureRun({ mode: 'expedition', difficulty: 'normal' }); g.reset(); g.running = true
  let latest; g.onExpeditionReward = payload => { latest = payload }
  g.runState = 'stage-clearing'; g._stageClearT = 1
  g._updateExpedition(.01)
  assert.equal(latest.phase, 'boss'); assert.equal(g._pauseLock, 1)
  assert.equal(g.resolveExpeditionReward('rest'), false)
  const id = latest.options[0].id
  assert.equal(g.resolveExpeditionReward(id), true)
  assert.equal(latest.phase, 'supply'); assert.equal(g._pauseLock, 1); assert.equal(g.running, false)
  assert.equal(g.resolveExpeditionReward(id), false)
  g.player.maxHp = g.player.hp = 1
  const damage = g.weaponSystem.damage
  assert.equal(g.resolveExpeditionReward('blood'), false); near(g.weaponSystem.damage, damage)
  assert.equal(g.resolveExpeditionReward('rest'), true)
  assert.equal(g.expeditionStage, 2); assert.equal(g._pauseLock, 0); assert.equal(latest, null)
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
test('origin', '充能/超载费用固定，余震最多五目标且不返充；护盾不叠容量', g => {
  learn(g, 'origin_conduit', 3); learn(g, 'origin_aftershock', 3); learn(g, 'origin_membrane', 3)
  for (const [i, source] of ['projectile', 'shock', 'projectile'].entries()) gainPrimalEnergy(g, source, i * .35)
  assert.equal(g.player.primalEnergy, 30)
  g.player.primalEnergy = 80
  const enemies = Array.from({ length: 8 }, (_, i) => spawn(g, { x: 45 + i, hp: 100 }))
  assert.equal(trySpendPrimalOverload(g), true); assert.equal(g.player.primalEnergy, 40)
  assert.equal(g.bossTomes.shield, 1)
  g.bossTomes.update(.02)
  assert.equal(enemies.filter(e => e.hp < 100).length, 5); assert.equal(g.player.primalEnergy, 40)
  g.bossTomes.update(.4); assert.equal(g.bossTomes.jobs.length, 0)
  g.elapsed = 3 // 超载支付锁：真实战局里由 6.5 秒震荡冷却自然跨过
  g.player.overloadState.active = false // 超载窗口由 OriginCombat.update 推进；测试直接跨过
  assert.equal(trySpendPrimalOverload(g), true); assert.equal(g.player.primalEnergy, 0); assert.equal(g.bossTomes.shield, 1)
  g.bossTomes.clearStage(); assert.equal(g.bossTomes.shield, 0); assert.equal(g.bossTomes.jobs.length, 0)
})
test('glutton', '猎食节律真实充能触发、满仓无隐藏储备；重咬前摇和标记兑现', g => {
  learn(g, 'glutton_rhythm', 3); learn(g, 'glutton_jaw', 3)
  const before = g.weaponSystem.attackInterval
  for (let i = 0; i < 5; i++) onNormalDevoured(g.player)
  assert.equal(g.player.gluttonCharge, 1); near(g.weaponSystem.attackInterval, before / 1.25)
  const e = spawnBoss(g, 1000), bite = g.weaponSystem.gluttonCombat
  assert.equal(bite.bite(e, true), true); near(bite.swing.windup, .2)
  settleSwing(bite)
  assert.equal(g.player.gluttonCharge, 0, 'heavy bite never refunds')
  assert.ok(g.bossTomes.jaw.get(e) > 0)
})
test('elemental', '自动施法第五次强化、主动循环与护盾数值；延迟法印不触发反应', g => {
  const spells = g.weaponSystem.spellCombat
  spells.elements.add('fire'); spells.syncElements()
  learn(g, 'elemental_grimoire', 3); learn(g, 'elemental_circuit', 3); learn(g, 'elemental_veil', 3); learn(g, 'elemental_sigil', 3)
  near(spells.activeCooldown, 8.5); near(spells.shield.cooldown, 6.5)
  const e = spawn(g, { hp: 1000 })
  const powers = []
  for (let i = 0; i < 5; i++) { spells.cast('fire', e); powers.push(spells.shots.at(-1).power) }
  near(powers[4] / powers[0], 1.3)
  g.bossTomes.onSpellActive(); assert.equal(g.bossTomes.castCredits, 3)
  const before = e.hp; spells.damage(e, 1, 'fire'); assert.ok(g.bossTomes.jobs.length)
  const reactions = spells.stats.reactions
  g.bossTomes.update(.81); assert.ok(e.hp < before - 1); assert.equal(spells.stats.reactions, reactions)
})
test('elemental', '旧核心形态迁入普通池；雷暴保留双系与三次首领奖励门槛', g => {
  const spells = g.weaponSystem.spellCombat
  spells.elements = new Set(['water', 'lightning']); spells.syncElements()
  assert.equal(ordinarySpellCoreSkills(g).length, 0)
  learn(g, 'elemental_grimoire')
  assert.ok(ordinarySpellCoreSkills(g).some(s => s.id === 'spell_core_shape_water'))
  assert.ok(!ordinarySpellCoreSkills(g).some(s => s.id === 'spell_core_lightning_storm'))
  learn(g, 'elemental_grimoire', 2)
  const card = ordinarySpellCoreSkills(g).find(s => s.id === 'spell_core_lightning_storm')
  assert.ok(card); assert.equal(g.applySkill(card), true); assert.equal(spells.lightning.storm, true)
  assert.ok(!ordinarySpellCoreSkills(g).some(s => s.id === card.id))
  assert.ok(elementalSkillOptions(g, ELEMENTAL_SKILLS, SKILL_DATABASE.common, 999).some(s => s.isSpellCoreUpgrade))
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
test('summoner', '随机招募预告固定、最多四只；生命成长按总量，鼓舞支援和复苏保护', g => {
  const oldHp = g.player.maxHp
  learn(g, 'pet_roster', 3); learn(g, 'pet_vitality', 3); learn(g, 'pet_unity', 3); learn(g, 'pet_command', 3)
  assert.equal(g.weaponSystem.petCombat.items.length, 4); assert.equal(g.player.maxHp, oldHp + 2)
  const pets = g.weaponSystem.petCombat.items
  for (const pet of pets) pet.supportCd = 5
  assert.equal(g.weaponSystem.petCombat.rally(), true)
  assert.ok(pets.every(p => p.supportCd === 3))
  assert.equal(g.bossTomes.shield, 1)
  const pet = pets[0], a = g.weaponSystem.petCombat.attackDamage(pet), b = g.weaponSystem.petCombat.attackDamage(pet)
  near(a / b, 1.4)
})
test('glutton', '捕食护甲挡伤也反震，但三秒内不重复；辉胃等待敌人且重咬只减一次计时', g => {
  learn(g, 'glutton_thorns', 3); learn(g, 'glutton_radiance', 3)
  const e = spawn(g, { hp: 1000 }), hp = g.player.hp
  g.player.gluttonGuard = 1; g.player.gluttonGuardTimer = 1
  g.player.hit(1, { enemyAttack: true })
  near(e.hp, 1000 - 1.2 * g.bossTomes.base()); assert.equal(g.player.hp, hp)
  const before = e.hp
  g.player.invincible = 0; g.player.hit(1, { enemyAttack: true }); near(e.hp, before)
  g.bossTomes.afterHit(e, e.hp + 1, { bossTomeContext: { heavy: true } })
  assert.equal(g.bossTomes.ready.radiance, 3)
  g.bossTomes.afterHit(e, e.hp + 1, { bossTomeContext: { heavy: true } })
  assert.equal(g.bossTomes.ready.radiance, 3)
})
test('origin', '蓄能增伤按门槛生效，超载后窗口到期退出，异源首击只消费一次', g => {
  learn(g, 'origin_reservoir', 3); learn(g, 'origin_conduit', 3)
  const e = spawn(g, { hp: 1000 }); g.player.primalEnergy = 60
  e.hit(10); near(e.hp, 988.5)
  g.player.primalEnergy = 40; trySpendPrimalOverload(g)
  e.hit(10); near(e.hp, 977)
  g.bossTomes.update(3.1); e.hit(10); near(e.hp, 967)
  g.bossTomes.until.originFirst = g.bossTomes.time + 3
  e.hit(10, { bossTomeContext: { basic: true } }); near(e.hp, 954)
  e.hit(10, { bossTomeContext: { basic: true } }); near(e.hp, 944)
})
test('ricochet', '三级冷凝治疗来自真实主动命中，受伤才消耗冷却，不能按多弹重复回血', g => {
  learn(g, 'rico_recharge', 3)
  const e = spawn(g, { hp: 1000 }), ws = g.weaponSystem
  const shoot = () => { ws.ricochetCombat.fire(e, { ricochetActive: true }); ws.ricochetCombat.hit(ws._projectiles.at(-1), e) }
  const hp = g.player.maxHp; shoot(); assert.equal(g.bossTomes.ready.heal, undefined)
  g.player.hp = hp - 1; shoot(); assert.equal(g.player.hp, hp)
  g.player.hp = hp - 1; shoot(); assert.equal(g.player.hp, hp - 1)
  g.bossTomes.update(20); shoot(); assert.equal(g.player.hp, hp)
})
test('elemental', '未融合的原质释放也兑现奥术回路主动增伤', g => {
  const spells = g.weaponSystem.spellCombat, e = spawn(g, { hp: 1000 })
  let before = e.hp; assert.equal(spells.useActive(), true); const base = before - e.hp
  learn(g, 'elemental_circuit')
  before = e.hp; assert.equal(spells.useActive(), true); near((before - e.hp) / base, 1.1)
})
test('elemental', '毒雾继承整次施法强化，主动不消耗第五次自动施法计数', g => {
  const spells = g.weaponSystem.spellCombat, e = spawn(g, { hp: 1000 })
  spells.elements.add('poison'); spells.syncElements(); learn(g, 'elemental_grimoire', 3)
  const powers = []
  for (let i = 0; i < 5; i++) {
    spells.cast('poison', e)
    const shot = spells.shots.at(-1)
    powers.push(spells.field(e, { tomePower: shot.tomePower }).damage)
  }
  near(powers[4] / powers[0], 1.3)
  const casts = g.bossTomes.casts
  spells.cast('poison', e, true); assert.equal(g.bossTomes.casts, casts)
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
test('origin', '秘典满级后补偿普通选卡仍在同一结算中，补给研习不放开暂停', g => {
  for (const card of BOSS_TOMES.origin) learn(g, card.id.slice(5), 3)
  g.onExpeditionReward = () => {}; g.runState = 'stage-reward'
  g._beginBossSettlement(true)
  assert.equal(g._chapterSettlement.phase, 'compensation')
  g.resolveExpeditionReward(g._chapterSettlement.options[0].id)
  assert.equal(g._chapterSettlement.phase, 'supply'); assert.equal(g._pauseLock, 1)
  g.resolveExpeditionReward('tome')
  assert.equal(g._chapterSettlement.phase, 'study'); assert.equal(g._pauseLock, 1)
  g.resolveExpeditionReward(g._chapterSettlement.options[0].id)
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
