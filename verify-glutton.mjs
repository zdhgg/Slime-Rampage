import assert from 'node:assert/strict'
import { createArena, spawn, spawnBoss, strike, pressSpace, learn, dispose, ctx2d, rollSkills } from './test-support/arena-fixture.mjs'
import { GLUTTON_BITE_DAMAGE, GLUTTON_HEAVY_DAMAGE, GLUTTON_BOSS_HEAVY_DAMAGE, GLUTTON_BITE_ARC, GLUTTON_HEAVY_ARC, inBiteSector } from './src/game/GluttonCombat.js'
import { onNormalDevoured, onGluttonBossBasicHit, gluttonSkillHud } from './src/game/GluttonResource.js'

let count = 0
function check(name, test) {
  const game = createArena()
  try { test(game); console.log(`  ✓ ${++count}. ${name}`) } finally { dispose(game) }
}
check('开局即近战；远处目标不消耗攻击就绪，进入范围后出现前摇与咬合', g => {
  const ws = g.weaponSystem, c = ws.gluttonCombat
  const e = spawn(g, { x: 400 })
  ws.cooldown = 0
  ws.update(0.02)
  assert.equal(c.swing, null)
  assert.equal(ws._projectiles.length, 0)
  e.x = g.player.x + 60
  ws.update(0.02)
  assert.ok(c.swing)
  assert.equal(e.hp, 100, '前摇期间还未造成伤害')
  c.render(ctx2d)
  c.update(0.17)
  assert.equal(e.hp, 100 - GLUTTON_BITE_DAMAGE)
  assert.equal(g.primarySpec, null, '无需等到 Lv.5')
  c.render(ctx2d)
})
check('扇形攻击多目标、身体边缘与背后边界；前摇后离开范围可躲开', g => {
  const c = g.weaponSystem.gluttonCombat
  const e = spawn(g), side = spawn(g, { x: 45, y: 30 }), back = spawn(g, { x: -60 })
  assert.equal(inBiteSector(g.player, back, 0, c.reach(), Math.PI * 5 / 6), false)
  strike(g, e)
  assert.ok(side.hp < 100)
  assert.equal(back.hp, 100)
  e.x = g.player.x + 60
  c.bite(e)
  e.x = g.player.x + 400
  const hp = e.hp
  c.update(0.17)
  assert.equal(e.hp, hp)
  const angle = Math.PI / 2 + 0.08
  const corner = { active: true, hp: 1, radius: 10, x: g.player.x + Math.cos(angle) * 109, y: g.player.y + Math.sin(angle) * 109 }
  assert.equal(inBiteSector(g.player, corner, 0, 100, Math.PI), false, '扇面外侧圆角不能被两次近似边界误判')
})
check('过量致命咬击仍吞噬，奖励/充能只结算一次；精英同样走吞噬链', g => {
  const e = spawn(g, { hp: 1 })
  e.isElite = true
  strike(g, e)
  assert.ok(e.devouring)
  assert.equal(g.weaponSystem.devours, 1)
  assert.equal(g.weaponSystem.eliteKills, 1)
  assert.equal(g.player.gluttonDevourProgress, 1)
  g.weaponSystem.onDevoured(e)
  g.weaponSystem._onKill(e)
  assert.equal(g.weaponSystem.kills, 1)
  assert.equal(g.player.gluttonDevourProgress, 1)
})
check('护盾先吸收；石造物和亡魂可受伤、可击杀，但不可吞噬', g => {
  const shield = spawn(g, { hp: 1 })
  shield.shieldHits = 1
  strike(g, shield)
  assert.equal(shield.hp, 1)
  assert.equal(shield.devouring, false)
  strike(g, shield)
  assert.ok(shield.devouring)
  for (const type of ['golem', 'wraith']) {
    const e = spawn(g, { hp: 1, type })
    strike(g, e)
    assert.equal(e.active, false)
    assert.equal(e.devouring, false)
  }
  assert.equal(g.weaponSystem.devours, 1)
})
check('F 对满血目标有效；正面多目标受伤，背后与远处目标安全', g => {
  const front = spawn(g), side = spawn(g, { x: 65, y: 25 }), back = spawn(g, { x: -70 }), far = spawn(g, { x: 320 })
  g.player.gluttonCharge = 2
  pressSpace(g)
  assert.equal(g.player.gluttonCharge, 1)
  pressSpace(g)
  assert.equal(g.player.gluttonCharge, 1, '再次释放锁防连扣')
  g.weaponSystem.gluttonCombat.update(0.23)
  assert.equal(front.hp, 100 - GLUTTON_HEAVY_DAMAGE)
  assert.equal(side.hp, 100 - GLUTTON_HEAVY_DAMAGE)
  assert.equal(back.hp, 100)
  assert.equal(far.hp, 100)
})
check('F 吞噬不返充；无资源、无近处目标、死亡时不释放', g => {
  for (let i = 0; i < 6; i++) spawn(g, { x: 60, y: i * 2, hp: 2 })
  pressSpace(g)
  assert.equal(g.weaponSystem.gluttonCombat.swing, null)
  g.player.gluttonCharge = 1
  g.player.gluttonDevourProgress = 4
  pressSpace(g)
  g.weaponSystem.gluttonCombat.update(0.23)
  assert.equal(g.weaponSystem.devours, 6)
  assert.equal(g.player.gluttonCharge, 0)
  assert.equal(g.player.gluttonDevourProgress, 4)
  g.player.gluttonCharge = 1
  g.player.gluttonRecastLock = 0
  pressSpace(g)
  assert.equal(g.player.gluttonCharge, 1)
  assert.equal(g.player.gluttonRecastLock, 0)
  spawn(g)
  g.player.dead = true
  pressSpace(g)
  assert.equal(g.player.gluttonCharge, 1)
})
check('普通吞噬 5 次充一格，最多 2 格，满仓不暗存进度', g => {
  for (let i = 0; i < 10; i++) onNormalDevoured(g.player)
  assert.equal(g.player.gluttonCharge, 2)
  for (let i = 0; i < 30; i++) onNormalDevoured(g.player)
  assert.equal(g.player.gluttonDevourProgress, 0)
})
check('首领只能由真实近战普攻命中充能；护盾、重咬和酸爆不返充', g => {
  const boss = spawnBoss(g, 1000), c = g.weaponSystem.gluttonCombat
  boss.shieldHits = 1
  strike(g, boss)
  assert.equal(g.player.gluttonBossHuntProgress, 0)
  for (let i = 0; i < 10; i++) strike(g, boss)
  assert.equal(g.player.gluttonCharge, 1)
  assert.equal(g.player.gluttonBossHuntProgress, 0)
  g.player.devourAcidBurst = 2
  const before = boss.hp
  pressSpace(g)
  c.update(0.23)
  assert.ok(before - boss.hp >= GLUTTON_BOSS_HEAVY_DAMAGE)
  assert.equal(g.player.gluttonCharge, 0)
  assert.equal(g.player.gluttonBossHuntProgress, 0)
  assert.equal(g.player.gluttonGuard, 1)
  assert.equal(boss.devouring, false)
  assert.equal(g.weaponSystem._projectiles.length, 0)
})
check('首领重咬随攻击与等级成长，仍遵循首领易伤和护盾', g => {
  const boss = spawnBoss(g, 1000)
  g.weaponSystem.damage = 3
  g.weaponSystem.levelMul = 2
  boss.vulnerableTimer = 1
  const vulnerability = boss.vulnerableMultiplier
  g.player.gluttonCharge = 1
  pressSpace(g)
  g.weaponSystem.gluttonCombat.update(0.23)
  assert.equal(boss.hp, 1000 - 3 * 2 * GLUTTON_BOSS_HEAVY_DAMAGE * vulnerability)
})
check('胃囊不降低攻击，强化两种充能；5 级自动觉醒且进阶遵循技能前置', g => {
  const damage = g.weaponSystem.damage
  assert.ok(rollSkills(g, 100).every(s => !s.tier || s.tier === 1))
  learn(g, 'glut_maw', 3)
  assert.equal(g.weaponSystem.damage, damage)
  assert.equal(g.devourThreshold, 0.36)
  onNormalDevoured(g.player)
  assert.equal(g.player.gluttonDevourProgress, 1.6)
  onGluttonBossBasicHit(g.player, { isBoss: true })
  assert.equal(g.player.gluttonBossHuntProgress, 2)
  g.player.level = 5
  g._ensureRoleAwakening()
  assert.equal(g.primarySpec, 'gluttony')
  assert.ok(rollSkills(g, 100).some(s => s.id === 'glut_ram'))
  assert.ok(!rollSkills(g, 100).some(s => s.id === 'glut_eruption'))
  learn(g, 'glut_ram')
  assert.ok(rollSkills(g, 100).some(s => s.id === 'glut_eruption'))
})
check('捕食护甲只抵挡 1 点，不能叠加或无限刷新，仍会受到重击伤害', g => {
  const p = g.player, c = g.weaponSystem.gluttonCombat
  c.grantGuard()
  const hp = p.hp
  p.hit(1)
  assert.equal(p.hp, hp)
  assert.equal(p.gluttonGuard, 0)
  c.grantGuard()
  assert.equal(p.gluttonGuard, 0)
  p.update(2.51)
  c.grantGuard()
  p.hit(3)
  assert.equal(p.hp, hp - 2)
  p.update(2.51)
  learn(g, 'glut_bulk', 3)
  c.grantGuard()
  assert.ok(Math.abs(p.gluttonGuardTimer - 2.8) < 1e-6)
  p.update(2.41)
  assert.equal(p.gluttonGuard, 1)
  p.update(0.4)
  assert.equal(p.gluttonGuard, 0)
})
check('恢复有独立间隔；密集吞噬合并近身酸爆，范围外不受伤', g => {
  const p = g.player, c = g.weaponSystem.gluttonCombat
  p.hp = 1
  p.geneDevourHeal = 1
  p.devourAcidBurst = 2
  const far = spawn(g, { x: 300 }), near = spawn(g, { x: 100 })
  for (let i = 0; i < 8; i++) g.enemyManager._startDevour(spawn(g, { hp: 1 }))
  assert.equal(p.hp, 2, '不会八次吞噬瞬间回满')
  c.update(0.01)
  assert.ok(near.hp < 100)
  assert.equal(far.hp, 100)
  const hp = near.hp
  c.queueAcid()
  c.update(0.01)
  assert.equal(near.hp, hp)
  assert.equal(g.weaponSystem._projectiles.length, 0)
})
check('F 酸爆造成的残血目标被自动吞噬时仍不返充', g => {
  const p = g.player, c = g.weaponSystem.gluttonCombat
  p.devourAcidBurst = 1
  const e = spawn(g, { x: 25, hp: 10 })
  e.hp = 3
  c.queueAcid('gluttonF')
  c.update(0.01)
  assert.equal(e.hp, 2)
  assert.equal(e.devourable, true)
  e.hit(0) // 无伤害状态更新不能抹掉 F 的来源。
  g.enemyManager._checkDevour()
  assert.equal(e.devouring, true)
  assert.equal(p.gluttonDevourProgress, 0)
  assert.equal(p.gluttonCharge, 0)
})
check('范围攻击中途阵亡后停止后续伤害与奖励结算', g => {
  g.player.hp = 1
  const bomb = spawn(g, { x: 25, hp: 1, type: 'golem' })
  bomb.affixes = ['explosive']
  const next = spawn(g, { x: 30, hp: 1 })
  strike(g, bomb)
  assert.equal(g.player.dead, true)
  assert.equal(next.hp, 1, '结算快照之后不再伤害其他目标')
  assert.equal(g.weaponSystem.kills, 1)
  assert.equal(g.weaponSystem.devours, 0)
})
check('重碾强化重咬，领主半血吞噬不越过非血肉和护盾限制', g => {
  learn(g, 'glut_ram', 3)
  const c = g.weaponSystem.gluttonCombat, boss = spawnBoss(g, 1000)
  g.player.gluttonCharge = 2
  pressSpace(g); c.update(0.23)
  assert.ok(Math.abs((1000 - boss.hp) - 6 * 1.45) < 1e-7)
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
})
check('重开与角色切换清掉暴食状态；暗影使用影刃，其他角色继续远程攻击', g => {
  g.player.gluttonCharge = 2
  spawn(g)
  pressSpace(g)
  assert.ok(g.weaponSystem.gluttonCombat.swing)
  g.weaponSystem.gluttonCombat.acidPending = true
  g.weaponSystem.gluttonCombat.grantGuard()
  g.player.gluttonHealCooldown = 4
  for (const strain of ['origin', 'ricochet', 'elemental', 'shadow']) {
    g.applyStartingStrain(strain); g.reset()
    assert.equal(g.weaponSystem.gluttonCombat.swing, null)
    assert.equal(g.weaponSystem.gluttonCombat.acidPending, false)
    assert.equal(g.player.gluttonGuard, 0)
    assert.equal(g.player.gluttonHealCooldown, 0)
    assert.equal(gluttonSkillHud(g.player), null)
    g.weaponSystem.fire(spawn(g, { x: 400 }))
    if (strain === 'shadow') {
      assert.equal(g.weaponSystem._projectiles.length, 0)
      g.weaponSystem.fire(spawn(g))
      assert.ok(g.weaponSystem.shadowCombat.swing)
    } else assert.ok(g.weaponSystem._projectiles.length > 0)
  }
})
check('前摇压缩张嘴，出手前探，咬合才扣血；移动/冲刺朝向不受动画修改', g => {
  const c = g.weaponSystem.gluttonCombat, p = g.player, e = spawn(g)
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
  assert.equal(e.hp, 100 - GLUTTON_BITE_DAMAGE)
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
  const sounds = []
  g.sound.bite = (heavy, landed) => sounds.push({ heavy, landed })
  for (const position of [{ x: -60, y: 0 }, { x: 0, y: 85 }, { x: 200, y: 0 }]) {
    e.x = g.player.x + 60; e.y = g.player.y
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
  assert.equal(g.player.gluttonDevourProgress, 0)
  assert.deepEqual(sounds, Array.from({ length: 3 }, () => ({ heavy: false, landed: false })))
})
check('普攻/F 的前方边界、可视扇面与判定使用相同方向和半径', g => {
  const c = g.weaponSystem.gluttonCombat, p = g.player
  for (const heavy of [false, true]) {
    p.gluttonCharge = 1
    const front = spawn(g), flank = spawn(g, { x: 0, y: c.reach(heavy) + 2 })
    const arc = heavy ? GLUTTON_HEAVY_ARC : GLUTTON_BITE_ARC
    assert.equal(inBiteSector(p, flank, 0, c.reach(heavy), arc), false)
    assert.ok(c.bite(front, heavy))
    const arcs = []
    const recorder = new Proxy(ctx2d, { get(target, key) { return key === 'arc' ? (...args) => arcs.push(args) : target[key] } })
    c.render(recorder)
    assert.ok(arcs.some(([, , radius, start, end]) => radius === c.reach(heavy) + 1 && start === -arc / 2 && end === arc / 2))
    c.update(c.swing.windup + c.swing.strike + 0.001)
    assert.equal(flank.hp, 100)
  }
})
check('高攻速保留短前摇，攻击周期不叠加动作延迟；收势可被下一次普攻接续', g => {
  const ws = g.weaponSystem, c = ws.gluttonCombat, e = spawn(g, { hp: 10000 })
  ws.fireInterval = 0.3; ws.berserkBuffTimer = 10; ws.cooldown = 0
  const starts = []
  for (let i = 0; i < 700; i++) {
    const previous = c.swing
    e.x = g.player.x + 60 // 保持目标在攻击范围，排除受击推开对计数的影响。
    ws.update(0.001)
    if (c.swing && c.swing !== previous) {
      starts.push(i * 0.001)
      assert.ok(c.swing.windup >= 0.06 && c.swing.windup < 0.12)
      assert.ok(c.swing.windup + c.swing.strike < ws.attackInterval)
    }
  }
  assert.equal(starts.length, 4)
  for (let i = 1; i < starts.length; i++) assert.ok(Math.abs(starts[i] - starts[i - 1] - 0.18) < 0.003)
})
check('重咬只可替换普通前摇；吞食产生回收粒子，死亡/重开清除所有动作与反馈', g => {
  const c = g.weaponSystem.gluttonCombat, e = spawn(g, { hp: 2 })
  g.player.gluttonCharge = 1
  c.bite(e)
  assert.ok(c.heavyBite())
  c.update(c.swing.windup + 0.001)
  assert.equal(c.heavyBite(), false)
  c.update(c.swing.remaining + 0.001)
  assert.equal(g.weaponSystem.devours, 1)
  assert.equal(g.player.gluttonCharge, 0)
  assert.ok(c.morsels.length > 0 && c.impacts[0].devoured)
  assert.equal(g.weaponSystem._rings.length, 0, '基础吞食不产生攻击状扩散圆环')
  g.player.dead = true
  c.update(0.001)
  assert.equal(c.swing, null); assert.equal(c.flash, null)
  assert.equal(c.morsels.length, 0); assert.equal(c.impacts.length, 0)
  assert.equal(c.guardPulse, 0)
  g.reset()
  assert.equal(c.pose, null)
})
console.log(`暴食近战契约：${count} 组通过`)
