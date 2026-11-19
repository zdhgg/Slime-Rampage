import assert from 'node:assert/strict'
import { createArena, spawn, spawnBoss, strike, settleSwing, pressSpace, learn, dispose, ctx2d, rollSkills } from './test-support/arena-fixture.mjs'
import {
  GLUTTON_AURA_BASE_DAMAGE, GLUTTON_BITE_ARC, GLUTTON_BITE_DAMAGE,
  GLUTTON_BOSS_VORTEX_DAMAGE, GLUTTON_COUNTER_BASE_COOLDOWN,
  GLUTTON_GUARD_BASE_MAX, GLUTTON_GUARD_COOLDOWN,
  GLUTTON_HEAVY_SNOWBALL_CAP, GLUTTON_SATIETY_DAMAGE,
  GLUTTON_VORTEX_BITE_RADIUS, GLUTTON_VORTEX_COOLDOWN, GLUTTON_VORTEX_DAMAGE,
  inBiteSector,
} from './src/game/GluttonCombat.js'
import { GLUTTON_SKILL_BY_ID } from './src/game/GluttonBuild.js'
import { GLUTTON_SATIETY_MAX, onNormalDevoured, onGluttonBossBasicHit, gluttonSkillHud } from './src/game/GluttonResource.js'

let count = 0
function check(name, test) {
  const game = createArena()
  try { test(game); console.log(`  ✓ ${++count}. ${name}`) } finally { dispose(game) }
}

check('开局即近战；远处目标不消耗攻击就绪，进入范围后出现前摇与 150° 宽幅扫咬', g => {
  const ws = g.weaponSystem, c = ws.gluttonCombat
  c.auraTimer = 99
  g.player.facing = 0; c.aimAngle = 0
  const e = spawn(g, { x: 400 })
  ws.cooldown = 0
  ws.update(0.02)
  assert.equal(c.swing, null)
  assert.equal(ws._projectiles.length, 0)
  e.x = g.player.x + 56
  ws.update(0.02)
  assert.ok(c.swing)
  assert.equal(e.hp, 100, '前摇期间还未造成伤害')
  c.render(ctx2d)
  settleSwing(c)
  assert.ok(Math.abs(e.hp - (100 - GLUTTON_BITE_DAMAGE)) < 1e-9)
  assert.equal(g.primarySpec, null, '无需等到 Lv.5')
  c.render(ctx2d)
})

check('扇形攻击多目标、身体边缘与背后边界；前摇后离开范围可躲开', g => {
  const c = g.weaponSystem.gluttonCombat
  c.auraTimer = 99
  const e = spawn(g), side = spawn(g, { x: 42, y: 38 }), back = spawn(g, { x: -60 })
  assert.equal(inBiteSector(g.player, back, 0, c.reach(), GLUTTON_BITE_ARC), false)
  strike(g, e)
  assert.ok(side.hp < 100, '150° 宽幅扫咬应覆盖更大侧前方角度')
  assert.equal(back.hp, 100)
  e.x = g.player.x + 55
  c.bite(e)
  e.x = g.player.x + 400
  const hp = e.hp
  settleSwing(c)
  assert.equal(e.hp, hp)
  const angle = Math.PI / 2 + 0.08
  const corner = { active: true, hp: 1, radius: 10, x: g.player.x + Math.cos(angle) * 109, y: g.player.y + Math.sin(angle) * 109 }
  assert.equal(inBiteSector(g.player, corner, 0, 100, Math.PI), false, '扇面外侧圆角不能被两次近似边界误判')
})

check('过量致命咬击仍吞噬，精英双倍饱食 (+2) 且不重复结算', g => {
  const e = spawn(g, { hp: 1 })
  e.isElite = true
  strike(g, e)
  assert.ok(e.devouring)
  assert.equal(g.weaponSystem.devours, 1)
  assert.equal(g.weaponSystem.eliteKills, 1)
  assert.equal(g.player.gluttonSatiety, 2)
  g.weaponSystem.onDevoured(e)
  g.weaponSystem._onKill(e)
  assert.equal(g.weaponSystem.kills, 1)
  assert.equal(g.player.gluttonSatiety, 2)
})

check('护盾先吸收；击杀石造物和亡魂只给吞噬惯性而不白嫖胃铠', g => {
  g.weaponSystem.gluttonCombat.auraTimer = 99
  const shield = spawn(g, { hp: 1 })
  shield.shieldHits = 1
  strike(g, shield)
  assert.equal(shield.hp, 1)
  assert.equal(shield.devouring, false)
  strike(g, shield)
  assert.ok(shield.devouring)
  g.player.gluttonGuard = 0
  g.player.gluttonGuardCooldown = 0
  g.player.gluttonFeastTimer = 0
  for (const type of ['golem', 'wraith']) {
    const e = spawn(g, { hp: 1, type })
    strike(g, e)
    assert.equal(e.active, false)
    assert.equal(e.devouring, false)
  }
  assert.equal(g.weaponSystem.devours, 1)
  assert.equal(g.player.gluttonGuard, 0, '非吞噬击杀不再白嫖胃铠')
  assert.ok(g.player.gluttonFeastTimer > 0)
})

check('Lv.1 自带 360° 体表腐蚀光环：温和跳伤、减速普通怪且不阻断吞噬线', g => {
  const c = g.weaponSystem.gluttonCombat, p = g.player
  const mob = spawn(g, { x: 40, hp: 100 })
  const fragile = spawn(g, { x: -40, hp: 1.4 }); fragile.maxHp = 10
  const far = spawn(g, { x: 260, hp: 100 })
  const boss = spawnBoss(g, 500); boss.x = p.x; boss.y = p.y + 45
  c.auraTimer = 0.01
  c.update(0.02)
  assert.ok(Math.abs((100 - mob.hp) - GLUTTON_AURA_BASE_DAMAGE) < 1e-8)
  assert.ok(mob.corrodeSlowTime > 0 && mob.corrodeSlowAmount >= 0.15)
  assert.equal(fragile.devourable, true, '腐蚀光环应允许把血肉怪压进吞噬线')
  assert.equal(far.hp, 100)
  assert.ok(boss.hp < 500 && boss.corrodeSlowTime === 0, '光环可伤 Boss 但不减速 Boss')
  assert.ok(c.auraPulses.length >= 1)
})

check('Space 深渊吸噬：原地不位移不给无敌帧，拽回外围目标后 360° 重咬并获 1 甲', g => {
  const c = g.weaponSystem.gluttonCombat, p = g.player
  c.auraTimer = 99
  const x0 = p.x, y0 = p.y
  const pulled = spawn(g, { x: 165, y: 0, hp: 100, type: 'archer' })
  const outOfRange = spawn(g, { x: 300, y: 0, hp: 100 })
  pressSpace(g)
  assert.ok(c.vortex, '无近战前摇约束，任意位置都能开启深渊吸噬')
  assert.equal(p.gluttonGuard, 1, '开启吸噬立即获得 1 层胃铠')
  assert.equal(p.invincible, 0, '不给予刺客式无敌帧白嫖生存')
  assert.equal(p.strainSkillCd, GLUTTON_VORTEX_COOLDOWN)
  pressSpace(g)
  assert.equal(p.strainSkillCd, GLUTTON_VORTEX_COOLDOWN, '冷却中二次空格无效')
  settleSwing(c)
  assert.equal(p.x, x0); assert.equal(p.y, y0, '深渊吸噬原地聚怪，不与暗影冲刺重样')
  assert.ok(Math.hypot(pulled.x - p.x, pulled.y - p.y) < 115, '外围弓手应被吸噬拽近身前')
  assert.ok(Math.abs((100 - pulled.hp) - GLUTTON_VORTEX_DAMAGE) < 1e-6)
  assert.ok(pulled.corrodeSlowTime > 0)
  assert.equal(outOfRange.hp, 100)
})

check('6 次吞噬积累饱食槽，满 6 点自动触发饱食酸浪与续航叠甲', g => {
  const p = g.player, c = g.weaponSystem.gluttonCombat
  c.auraTimer = 99
  p.hp = p.maxHp - 1
  for (let i = 0; i < GLUTTON_SATIETY_MAX; i++) onNormalDevoured(p)
  assert.equal(p.gluttonSatiety, 0)
  assert.equal(c.satietyPending, true)
  const mob = spawn(g, { x: 60, hp: 100 })
  const boss = spawnBoss(g, 500)
  c.update(0.01)
  assert.equal(g.weaponSystem.stats.overflowWaves, 1)
  assert.equal(p.hp, p.maxHp, '残血触发酸浪自动回 1 HP')
  assert.ok(Math.abs((100 - mob.hp) - GLUTTON_SATIETY_DAMAGE) < 1e-7)
  assert.ok(Math.abs((500 - boss.hp) - GLUTTON_SATIETY_DAMAGE) < 1e-7)
  p.gluttonSatietyCooldown = 0
  for (let i = 0; i < GLUTTON_SATIETY_MAX; i++) onNormalDevoured(p)
  c.update(0.01)
  assert.equal(p.gluttonGuard, 1, '满血触发酸浪改为赠送 1 层胃铠')
})

check('首领近战普攻命中累计饱食度；吸噬命中首领不额外白给第二层胃铠', g => {
  const boss = spawnBoss(g, 10000), c = g.weaponSystem.gluttonCombat
  c.auraTimer = 99
  boss.shieldHits = 1
  strike(g, boss)
  assert.equal(g.player.gluttonBossHuntProgress, 0)
  for (let i = 0; i < 4; i++) strike(g, boss)
  assert.ok(g.player.gluttonSatiety >= 2)

  g.weaponSystem.devourDamageMul = 2
  g.skillLevels.glut_endless_hunger = 20
  const endless = c.endlessDamageMultiplier
  assert.ok(endless > 1.3)
  boss.x = g.player.x + 60; boss.y = g.player.y
  g.player.gluttonBulkGuardBonus = 2
  const hpBeforeVortex = boss.hp
  c.useVortex(); settleSwing(c)
  assert.equal(g.player.gluttonGuard, 1, '开技能给 1 甲，命中首领不再白给第二层甲')
  assert.ok(Math.abs((hpBeforeVortex - boss.hp) - GLUTTON_BOSS_VORTEX_DAMAGE * GLUTTON_HEAVY_SNOWBALL_CAP) < 1e-6)
  const hpBeforeBasic = boss.hp
  strike(g, boss)
  assert.ok(Math.abs((hpBeforeBasic - boss.hp) - GLUTTON_BITE_DAMAGE * 2 * endless) < 1e-6)
})

check('胃铠可被围攻打穿：基础仅 1 层、2.8s 冷却、挡伤仅 0.1s 无敌、满层不无限续满计时', g => {
  const p = g.player, c = g.weaponSystem.gluttonCombat
  const attacker = spawn(g, { x: 45, hp: 100 })
  assert.equal(c.guardMax, GLUTTON_GUARD_BASE_MAX)
  c.grantGuard()
  assert.equal(p.gluttonGuard, 1)
  assert.ok(p.gluttonGuardCooldown >= 2.7)
  const hp = p.hp
  p.hit(1)
  assert.equal(p.hp, hp)
  assert.equal(p.gluttonGuard, 0)
  assert.ok(p.invincible <= 0.101, '挡伤仅防同帧连扣，不再送 0.22s 无敌')
  assert.ok(attacker.hp < 100, '胃铠挡伤触发 360° 酸刺反震')

  p.update(0.15)
  p.hit(3)
  assert.equal(p.hp, hp - 3, '碎甲后紧接的围殴真实打进血条')
  assert.ok(attacker.hp < 100)

  learn(g, 'glut_bulk', 3)
  assert.equal(c.guardMax, 3, '硬化甲壳 Lv.3 上限 3 层，无法无限硬抗')
  p.gluttonGuardCooldown = 0
  for (let i = 0; i < 3; i++) c.grantGuard(true)
  assert.equal(p.gluttonGuard, 3)
  assert.ok(Math.abs(p.gluttonGuardTimer - 3.4) < 1e-6)
  p.update(2.0)
  c.grantGuard(true) // 满层时不再续满整管计时
  assert.ok(p.gluttonGuardTimer < 2.0, '满层溢甲不能无限刷新倒计时')
  p.update(GLUTTON_COUNTER_BASE_COOLDOWN + 1.5)
  assert.equal(p.gluttonGuard, 0)
})

check('深渊胃囊 5 级觉醒；荒古领主半血吸噬吞噬与光环 18% 自动吞噬', g => {
  const damage = g.weaponSystem.damage
  assert.ok(rollSkills(g, 100).every(s => !s.tier || s.tier === 1))
  learn(g, 'glut_maw', 3)
  assert.equal(g.weaponSystem.damage, damage)
  assert.equal(g.devourThreshold, 0.36)
  onNormalDevoured(g.player)
  assert.equal(g.player.gluttonSatiety, 1.75)
  onGluttonBossBasicHit(g.player, { isBoss: true })
  assert.equal(g.player.gluttonSatiety, 2.75)

  g.player.level = 5
  g._ensureRoleAwakening()
  assert.equal(g.primarySpec, 'gluttony')
  assert.ok(rollSkills(g, 100).some(s => s.id === 'glut_ram'))
  learn(g, 'glut_ram', 3)
  const c = g.weaponSystem.gluttonCombat
  assert.ok(Math.abs(c.reach(true) - (g.player.radius + GLUTTON_VORTEX_BITE_RADIUS * 1.3)) < 1e-6)

  c.auraTimer = 99
  c.route = 'mire'
  assert.equal(g.applySkill(GLUTTON_SKILL_BY_ID.glut_eruption), true)
  assert.equal(g.player.devourAcidBurst, 1)

  learn(g, 'glut_capstone')
  const e = spawn(g); e.hp = 51
  c.hit(e, 2, { execute: true, source: 'gluttonF' })
  assert.ok(e.devouring)
  const stone = spawn(g, { type: 'golem' }); stone.hp = 40
  c.hit(stone, 2, { execute: true, source: 'gluttonF' })
  assert.equal(stone.devouring, false)
  const shield = spawn(g); shield.hp = 40; shield.shieldHits = 1
  c.hit(shield, 2, { execute: true, source: 'gluttonF' })
  assert.equal(shield.devouring, false)
  const lowFlesh = spawn(g, { x: 40, hp: 18 }); lowFlesh.maxHp = 100
  c.auraTimer = 0.01; c.update(0.02)
  assert.equal(lowFlesh.devouring, true, '荒古吞噬领主光环内 <=18% 血肉普通怪自动卷入吞噬')
})

check('重开与角色切换清掉暴食状态；暗影用影刃、元素用法术、其他角色用飞弹', g => {
  spawn(g)
  pressSpace(g)
  assert.ok(g.weaponSystem.gluttonCombat.vortex)
  g.weaponSystem.gluttonCombat.acidPending = true
  g.weaponSystem.gluttonCombat.satietyPending = true
  g.weaponSystem.gluttonCombat.grantGuard()
  g.player.gluttonHealCooldown = 4
  for (const strain of ['origin', 'ricochet', 'elemental', 'shadow']) {
    g.applyStartingStrain(strain); g.reset()
    assert.equal(g.weaponSystem.gluttonCombat.vortex, null)
    assert.equal(g.weaponSystem.gluttonCombat.swing, null)
    assert.equal(g.weaponSystem.gluttonCombat.acidPending, false)
    assert.equal(g.weaponSystem.gluttonCombat.satietyPending, false)
    assert.equal(g.player.gluttonGuard, 0)
    assert.equal(g.player.gluttonHealCooldown, 0)
    assert.equal(gluttonSkillHud(g.player), null)
    g.weaponSystem.fire(spawn(g, { x: 400 }))
    if (strain === 'shadow') {
      assert.equal(g.weaponSystem._projectiles.length, 0)
      g.weaponSystem.fire(spawn(g))
      assert.ok(g.weaponSystem.shadowCombat.swing)
    } else if (strain === 'elemental') {
      assert.ok(g.weaponSystem._projectiles.length > 0, 'Lv.1 原质飞弹正常攻击')
      assert.equal(g.weaponSystem.spellCombat.elements.size, 0)
      assert.equal(g.weaponSystem.spellCombat.stats.casts, 0)
    } else assert.ok(g.weaponSystem._projectiles.length > 0)
  }
})

check('前摇压缩张嘴，出手前探，咬合才扣血；移动/冲刺朝向不受动画修改', g => {
  const c = g.weaponSystem.gluttonCombat, p = g.player, e = spawn(g)
  c.auraTimer = 99
  p.facing = 0
  c.aimAngle = 0
  const before = { x: p.x, y: p.y, facing: p.facing }
  c.bite(e)
  c.update(c.swing.windup * 0.9)
  assert.ok(c.pose.sx < 1 && c.pose.mouth > 0.9 && c.pose.offset < 0)
  assert.equal(e.hp, 100)
  c.update(c.swing.remaining + 0.001)
  assert.equal(c.swing.phase, 'strike')
  assert.equal(e.hp, 100, '出手轨迹开始时尚未咬合')
  c.update(c.swing.remaining - 0.001)
  assert.ok(c.pose.sx > 1 && c.pose.offset > 0)
  assert.equal(e.hp, 100)
  p.render(ctx2d)
  assert.deepEqual({ x: p.x, y: p.y, facing: p.facing }, before)
  c.update(0.002)
  assert.ok(Math.abs(e.hp - (100 - GLUTTON_BITE_DAMAGE)) < 1e-9)
  assert.equal(c.impacts.length, 1)
  const hp = e.hp
  c.update(0.01)
  assert.equal(e.hp, hp, '收势不能重复伤害')
  const origin = { x: c.flash.x, y: c.flash.y }
  p.x += 80
  assert.deepEqual({ x: c.flash.x, y: c.flash.y }, origin, '残像固定在实际命中位置')
  c.update(0.4)
  assert.equal(c.pose, null)
  assert.equal(c.impacts.length, 0)
})

check('出手方向锁定；绕背/越界咬空，没有命中粒子、奖励或命中音', g => {
  const c = g.weaponSystem.gluttonCombat, e = spawn(g)
  c.auraTimer = 99
  g.player.facing = 0
  c.aimAngle = 0
  const sounds = []
  g.sound.bite = (heavy, landed) => sounds.push({ heavy, landed })
  for (const position of [{ x: -60, y: 0 }, { x: 0, y: 85 }, { x: 200, y: 0 }]) {
    e.x = g.player.x + 56; e.y = g.player.y
    assert.ok(c.bite(e))
    c.update(c.swing.windup + 0.001)
    e.x = g.player.x + position.x; e.y = g.player.y + position.y
    g.player.facing = Math.PI / 2
    assert.equal(c.pose.angle, 0, '移动方向不能改变这次咬击')
    c.update(c.swing.remaining + 0.001)
    assert.equal(e.hp, 100)
  }
  assert.equal(c.impacts.length, 0)
  assert.equal(c.morsels.length, 0)
  assert.equal(g.player.gluttonSatiety, 0)
  assert.deepEqual(sounds, Array.from({ length: 3 }, () => ({ heavy: false, landed: false })))
})

check('高攻速保留短前摇，攻击周期不叠加动作延迟；吸噬可打断普攻前摇且不额外扣血', g => {
  const ws = g.weaponSystem, c = ws.gluttonCombat, e = spawn(g, { hp: 10000 })
  c.auraTimer = 99
  g.player.facing = 0
  c.aimAngle = 0
  ws.fireInterval = 0.3; ws.berserkBuffTimer = 10; ws.cooldown = 0
  const starts = []
  for (let i = 0; i < 700; i++) {
    const previous = c.swing
    e.x = g.player.x + 56
    ws.update(0.001)
    if (c.swing && c.swing !== previous) {
      starts.push(i * 0.001)
      assert.ok(c.swing.windup >= 0.06 && c.swing.windup < 0.14)
      assert.ok(c.swing.windup + c.swing.strike < ws.attackInterval)
    }
  }
  assert.equal(starts.length, 4)

  const target = spawn(g, { x: 50, hp: 1000 })
  g.player.facing = 0; c.aimAngle = 0
  c.swing = null
  c.bite(target)
  assert.ok(c.useVortex(), '吸噬应直接接管普攻前摇')
  assert.equal(c.swing, null)
  assert.equal(target.hp, 1000, '被打断的普攻前摇不再偷算一次伤害')
  settleSwing(c)
})

check('胃酸迸发不再使用通用圆环，团块视觉不超出真实圆形判定', g => {
  const c = g.weaponSystem.gluttonCombat, p = g.player
  p.devourAcidBurst = 2
  spawn(g, { x: 90, hp: 1000 })
  c.queueAcid()
  c.update(0.01)
  assert.equal(g.weaponSystem._rings.length, 0, '酸爆不生成扩散圆环')
  assert.equal(c.acidBursts.length, 1)
  const burst = c.acidBursts[0]
  assert.equal(burst.radius, 129)
  for (const blob of burst.blobs) {
    assert.ok(blob.distance + blob.radius <= burst.radius + 1e-6, '酸团不能画出实际伤害半径之外')
  }
})

console.log(`暴食近战契约：${count} 组通过`)
