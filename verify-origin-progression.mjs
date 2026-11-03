import assert from 'node:assert/strict'
import { createArena, spawn, pressSpace, settleSwing, rollSkills, learn, dispose } from './test-support/arena-fixture.mjs'
import { getSecondaryStarter } from './src/game/SkillPool.js'
import { GLUTTON_HEAVY_DAMAGE, GLUTTON_HEAVY_REACH } from './src/game/GluttonCombat.js'

let checks = 0
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`)
function check(name, run, strain = 'origin') {
  const g = createArena(strain)
  try { run(g); console.log(`✓ ${++checks}. ${name}`) } finally { dispose(g) }
}
function awaken(g, spec) {
  g.player.level = 5
  const card = rollSkills(g).find(s => s.isMilestone && s.spec === spec)
  assert.ok(card)
  g.applySkill(card)
}

for (const spec of ['gatling', 'elemental', 'assassin', 'gluttony', 'symbiosis']) {
  check(`${spec}：五系主动均可超载，39 能量仍释放基础版`, g => {
    awaken(g, spec)
    spawn(g, { x: 60, hp: 1000 })
    g.player.primalEnergy = 39
    if (spec === 'gluttony') g.player.gluttonCharge = 2
    pressSpace(g)
    settleSwing(g.weaponSystem.gluttonCombat)
    assert.equal(g.player.primalEnergy, ['gluttony', 'symbiosis'].includes(spec) ? 39 : 47)
    if (spec === 'symbiosis') g.weaponSystem.petCombat.update(13)
    g.player.strainSkillCd = 0
    g.player.gluttonRecastLock = 0
    g.player.primalEnergy = 40
    pressSpace(g)
    settleSwing(g.weaponSystem.gluttonCombat)
    assert.equal(g.player.primalEnergy, ['gluttony', 'symbiosis'].includes(spec) ? 0 : 1)
  })
}

check('前期震荡投入继承重咬，超载索敌与实际扇形都采用扩大后的范围', g => {
  learn(g, 'com_shock', 2)
  awaken(g, 'gluttony')
  const combat = g.weaponSystem.gluttonCombat
  const reach = g.player.radius + GLUTTON_HEAVY_REACH + 16
  near(combat.reach(true), reach)
  const target = spawn(g, { x: reach * 1.3, hp: 1000 })
  target.radius = 4
  g.player.gluttonCharge = 1
  pressSpace(g)
  assert.equal(g.player.gluttonCharge, 1, '基础范围之外不消耗猎食点')
  g.player.primalEnergy = 40
  pressSpace(g)
  assert.equal(g.player.gluttonCharge, 0)
  assert.equal(g.player.primalEnergy, 0)
  near(combat.swing.reach, reach * 1.5)
  settleSwing(combat)
  near(1000 - target.hp, GLUTTON_HEAVY_DAMAGE * 1.2 * 1.5)
  assert.match(g.strainSkill.getDesc(g), /伤害 \+20%.*范围 \+16px/)
  learn(g, 'com_shock')
  near(combat.reach(true), reach + 8)
})

check('拟态重咬空放、无猎食点、释放锁与重咬前摇重复输入都不额外扣费', g => {
  awaken(g, 'gluttony')
  g.player.primalEnergy = 80
  g.player.gluttonCharge = 2
  pressSpace(g)
  assert.equal(g.player.primalEnergy, 80)
  assert.equal(g.player.gluttonCharge, 2)
  spawn(g)
  g.player.gluttonCharge = 0
  pressSpace(g)
  assert.equal(g.player.primalEnergy, 80)
  g.player.gluttonCharge = 2
  g.player.gluttonRecastLock = 0.3
  pressSpace(g)
  assert.equal(g.player.primalEnergy, 80)
  g.player.gluttonRecastLock = 0
  pressSpace(g)
  assert.equal(g.player.primalEnergy, 40)
  g.player.gluttonRecastLock = 0
  pressSpace(g)
  assert.equal(g.player.primalEnergy, 40)
  assert.equal(g.player.gluttonCharge, 1)
})

check('前期震荡投入继承鼓舞，超载强化真实伙伴伤害，结束后恢复基础数值', g => {
  learn(g, 'com_shock', 2)
  awaken(g, 'symbiosis')
  const pets = g.weaponSystem.petCombat
  near(pets.rallyStats.duration, 6)
  near(pets.rallyStats.damage, 0.5)
  const pet = pets.items[0]
  const baseDamage = pets.attackDamage(pet)
  g.player.primalEnergy = 40
  pressSpace(g)
  near(pets.rallyDuration, 8)
  near(pets.rallyStats.damage, 0.7)
  near(pets.attackDamage(pet), baseDamage * 1.7)
  const enemy = spawn(g, { hp: 1000 })
  pets.dealHit(pet, enemy, pets.attackDamage(pet), true)
  near(1000 - enemy.hp, baseDamage * 1.7)
  pets.update(9)
  assert.equal(pets.rallyOverloaded, false)
  near(pets.attackDamage(pet), baseDamage)
  near(pets.rallyStats.damage, 0.5)
  assert.match(g.strainSkill.getDesc(g), /鼓舞全体伙伴 6 秒：攻击力 \+50%/)
})

check('全员倒地、已有鼓舞、冷却与暂停时不消耗拟态能量', g => {
  awaken(g, 'symbiosis')
  const pets = g.weaponSystem.petCombat
  for (const pet of pets.items) { pet.hp = 0; pet.down = 8 }
  g.player.primalEnergy = 80
  pressSpace(g)
  assert.equal(g.player.primalEnergy, 80)
  assert.equal(g.player.strainSkillCd, 0)
  pets.update(9)
  pressSpace(g)
  assert.equal(g.player.primalEnergy, 40)
  pressSpace(g)
  assert.equal(g.player.primalEnergy, 40)
  g.player.strainSkillCd = 0
  assert.equal(pets.rally(), false, '鼓舞进行中不重复触发')
  assert.equal(g.player.primalEnergy, 40)
  pets.update(9)
  g.pause()
  pressSpace(g)
  assert.equal(g.player.primalEnergy, 40)
})

check('震荡扩能在拟态后仍可继续抽取，卡面展示当前主动的收益', g => {
  learn(g, 'com_shock')
  awaken(g, 'symbiosis')
  learn(g, 'pet_partner')
  g.player.level = 6
  const shock = rollSkills(g, 100).find(s => s.id === 'com_shock')
  assert.ok(shock)
  assert.match(shock.stats, /鼓舞攻击加成额外 \+20%.*持续时间 \+1 秒/)
  g.applySkill(shock)
  near(g.weaponSystem.petCombat.rallyStats.duration, 6)
})

for (const spec of ['gluttony', 'gatling', 'elemental', 'assassin', 'symbiosis']) {
  check(`Lv.9 ${spec}：卡面承诺的基础共鸣立即生效且只能领取一次`, g => {
    awaken(g, spec === 'gatling' ? 'assassin' : 'gatling')
    g.player.level = 9
    const card = rollSkills(g).find(s => s.isMilestone && s.spec === spec)
    const starter = getSecondaryStarter(g, spec)
    assert.match(card.bonus, /立即获得/)
    assert.ok(card.bonus.includes(starter.name))
    const before = { hp: g.player.maxHp, shots: g.weaponSystem.projectileCount, crit: g.weaponSystem.critChance }
    g.applySkill(card)
    assert.equal(g.skillLevels[starter.id], 1)
    assert.equal(g.secondarySpec, spec)
    if (spec === 'gluttony') assert.equal(g.player.maxHp, before.hp + 1)
    if (spec === 'gatling') assert.equal(g.weaponSystem.projectileCount, before.shots + 1)
    if (spec === 'elemental') assert.equal(g.player.frostFireAura, 3)
    if (spec === 'assassin') near(g.weaponSystem.critChance, before.crit + 0.15)
    if (spec === 'symbiosis') assert.deepEqual(g.weaponSystem.petCombat.items.map(p => p.type), ['echo'])
    g.applySkill(card)
    assert.equal(g.skillLevels[starter.id], 1, '重复点击不会再次授予')
    assert.equal(g.player.level, 9, '共鸣占用里程碑本次奖励，不额外增加等级')
    const next = rollSkills(g, 100).find(s => s.id === starter.id)
    assert.ok(next)
    g.applySkill(next)
    assert.equal(g.skillLevels[starter.id], 2, '下次抽取从已有等级继续强化')
    g.reset()
    assert.equal(g.secondarySpec, null)
    assert.equal(g.skillLevels[starter.id], undefined)
    assert.equal(g.weaponSystem.petCombat.enabled, false)
    assert.equal(g.player.frostFireAura, 0)
  })
}

check('元素副专精授予的霜火护体实际控制贴身敌人', g => {
  awaken(g, 'gatling')
  g.player.level = 9
  g.applySkill(rollSkills(g).find(s => s.spec === 'elemental'))
  const enemy = spawn(g, { x: 60, hp: 1000 })
  for (let t = 0; t < 3.2; t += 0.02) g.player.update(0.02)
  assert.ok(enemy.freeze > 0)
  assert.ok(enemy.burnHits > 0)
})

for (const strain of ['glutton', 'summoner']) {
  check(`${strain}：专属血统保持原有伤害、范围和鼓舞，不获得原生超载`, g => {
    // 人为放入原生字段，检验战斗闸门仍按真实血统隔离。
    g.skillLevels.com_shock = 3
    g.player.primalEnergy = 80
    spawn(g, { hp: 1000 })
    if (strain === 'glutton') {
      g.player.gluttonCharge = 1
      const enemy = g.enemyManager.enemies[0]
      near(g.weaponSystem.gluttonCombat.reach(true), g.player.radius + GLUTTON_HEAVY_REACH)
      pressSpace(g)
      settleSwing(g.weaponSystem.gluttonCombat)
      near(1000 - enemy.hp, GLUTTON_HEAVY_DAMAGE)
    } else {
      pressSpace(g)
      near(g.weaponSystem.petCombat.rallyDuration, 5)
      near(g.weaponSystem.petCombat.rallyStats.damage, 0.3)
    }
    assert.equal(g.player.primalEnergy, 80)
    assert.ok(rollSkills(g, 100).every(s => s.id !== 'com_shock'))
  }, strain)
}

console.log(`原生成长闭环：${checks} 组通过`)
