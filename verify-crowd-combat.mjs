import assert from 'node:assert/strict'
import { createArena, spawn, spawnBoss, dispose, settleSwing } from './test-support/arena-fixture.mjs'
import { CROWD_RULES } from './src/game/CrowdDirector.js'
import { GLUTTON_SATIETY_DAMAGE } from './src/game/GluttonCombat.js'
import { DEVOUR_SOURCE_GLUTTON, GLUTTON_SATIETY_MAX } from './src/game/GluttonResource.js'
import { captureExpeditionCheckpoint, restoreExpeditionCheckpoint } from './src/game/RunCheckpoint.js'

let passed = 0
const check = (strain, name, test) => {
  const g = createArena(strain)
  try { test(g); console.log(`✓ ${++passed}. ${name}`) } finally { dispose(g) }
}
const feed = (g, count = 3, ctx = null) => {
  for (let i = 0; i < count; i++) {
    const e = spawn(g, { hp: 1, x: 20 + i * 5 })
    g.enemyManager._startDevour(e, ctx)
  }
}

check('ricochet', '潮汐替换常规刷怪，低血量、低接触伤害、经验折减且无精英词缀', g => {
  const m = g.enemyManager, d = m.crowds
  m.wave = 4
  assert.ok(d.startTide())
  m.spawn()
  assert.equal(m.count, 2)
  assert.ok(m.enemies.every(e => e.swarmTide && !e.isElite && e.affixes.length === 0 && e.damage === .35))
  const reward = m.enemies.reduce((sum, e) => sum + e.expValue, 0)
  assert.ok(reward <= 10, '一对潮汐敌人的经验预算低于同波普通骑士')
  d.update(CROWD_RULES.tideDuration)
  assert.equal(d.tide, 0)
  assert.equal(g.weaponSystem.stats.swarmTides, 1)
})
check('ricochet', '潮汐与小队都遵守人口软上限；不开启第二场并发遭遇', g => {
  const m = g.enemyManager, d = m.crowds
  m.wave = 3
  assert.ok(d.startTide())
  assert.equal(d.startSquad(), false)
  const limit = Math.ceil(m._populationTarget() * 1.2)
  while (m.count < limit - 1) spawn(g)
  d.spawnTide(100, 100)
  assert.equal(m.count, limit)
  d.cancel()
  assert.equal(d.startSquad(), false)
})
check('origin', '奔潮小额接触伤害经过多层减伤不被抬到1点，普通攻击下限保持原规则', g => {
  const p = g.player, m = g.enemyManager
  m.crowds.spawnTide(p.x + 30, p.y)
  const tide = m.enemies[0], before = p.hp
  p.invincible = 0; p.devourDamageReductionTimer = 1; p.devourDamageReduction = .2
  p.originDr = .2; p.overloadState.active = true; p.originAdaptReduction = .1; p.originFormDr = .1
  tide._hitTarget(p, p, tide.damage)
  assert.ok(Math.abs(before - p.hp - .35 * .8 * .8 * .9 * .9) < 1e-10)
  const ordinary = spawn(g), after = p.hp
  p.invincible = 0; ordinary._hitTarget(p, p, 1)
  assert.equal(after - p.hp, 1)
})
check('shadow', '小队有六人双排与旗手，预付六次刷怪配额，地图边缘不贴脸生成', g => {
  const m = g.enemyManager, d = m.crowds
  g.player.x = g.player.y = 27
  assert.ok(d.startSquad())
  const s = d.squad
  assert.equal(s.members.length, 6)
  assert.equal(s.members.filter(e => e.crowdShield).length, 3)
  assert.equal(s.leader.type, 'priest')
  assert.ok(s.members.every(e => e.x >= 0 && e.x <= g.worldWidth && e.y >= 0 && e.y <= g.worldHeight))
  assert.ok(s.members.every(e => Math.hypot(e.x - g.player.x, e.y - g.player.y) >= 300))
  const before = m.count
  for (let i = 0; i < 6; i++) m.spawn()
  assert.equal(m.count, before)
  m.spawn()
  assert.equal(m.count, before + 1)
})
check('ricochet', '旗手死亡只破所属小队，重复结算不重复破阵，Boss 与散兵安全', g => {
  const m = g.enemyManager, d = m.crowds
  d.startSquad()
  const s = d.squad, outsider = spawn(g, { hp: 100 }), boss = spawnBoss(g)
  s.leader.hit(1000); g.weaponSystem._onKill(s.leader)
  assert.ok(s.broken)
  for (const e of s.members.filter(e => e !== s.leader)) {
    assert.equal(e.shieldHits, 0)
    assert.equal(e.routTime, 2)
    e.hp = e.maxHp = 100; e.hit(10)
    assert.equal(e.hp, 86.5)
  }
  assert.equal(outsider.routTime, 0)
  assert.equal(boss.routTime, 0)
  d.onDefeated(s.leader); g.weaponSystem._onKill(s.leader)
  assert.equal(g.weaponSystem.stats.squadBreaks, 1)
})
check('glutton', '正常吞噬与重咬吞噬旗手均可破阵，吸入动画不阻塞判定', g => {
  const m = g.enemyManager, d = m.crowds
  for (const ctx of [null, { source: DEVOUR_SOURCE_GLUTTON }]) {
    d.releaseSquad(); d.startSquad()
    const s = d.squad
    m._startDevour(s.leader, ctx)
    assert.ok(s.broken)
    assert.ok(s.members.filter(e => e !== s.leader).every(e => e.routTime === 2))
  }
  assert.equal(g.weaponSystem.stats.squadBreaks, 2)
})
check('shadow', '溃散期间停止攻击并远离玩家，两秒后职业行为恢复', g => {
  const d = g.enemyManager.crowds
  d.startSquad()
  const s = d.squad, e = s.members[0]
  d.breakSquad()
  e.x = g.player.x + 30; e.y = g.player.y; e.attackCd = 0
  const hp = g.player.hp, x = e.x
  e.update(.5)
  assert.ok(e.x > x)
  assert.equal(g.player.hp, hp)
  e.update(1.6)
  assert.equal(e.routTime, 0)
})
check('ricochet', '首领、世界事件、守巢、收口与非战斗阶段阻止遭遇并清理溃散', g => {
  const m = g.enemyManager, d = m.crowds
  const blocks = [
    [() => { m._bossGrace = 1 }, () => { m._bossGrace = 0 }],
    [() => { m._bossRecovery = 1 }, () => { m._bossRecovery = 0 }],
    [() => { m._stagePressure = .8 }, () => { m._stagePressure = 0 }],
    [() => { g.worldEvents.current = {} }, () => { g.worldEvents.current = null }],
    [() => { g.runState = 'stage-reward' }, () => { g.runState = 'active' }],
    [() => { g.mapFeatures.nest = { active: true } }, () => { g.mapFeatures.nest = null }],
  ]
  for (const [block, clear] of blocks) {
    block(); assert.equal(d.startTide(), false); assert.equal(d.startSquad(), false); clear()
  }
  d.startSquad(); const s = d.squad; d.breakSquad()
  g.worldEvents.current = {}; d.update(.01)
  assert.equal(d.squad, null)
  assert.ok(s.members.every(e => e.routTime === 0 && !e.crowdSquad))
  g.worldEvents.current = null
  const boss = m.spawnBoss()
  assert.ok(boss); assert.equal(d.startTide(), false)
})
check('ricochet', '导演自动交替潮汐与小队，世界事件在遭遇期间等待', g => {
  const m = g.enemyManager, d = m.crowds
  m.wave = 3
  d.update(6)
  assert.equal(d.tide, 15)
  assert.equal(g.canStartWorldEvent, false)
  d.update(15)
  d.update(38)
  assert.ok(d.squad)
  m.prepareExpeditionStage()
  assert.equal(d.active, false)
  assert.equal(d.spawnDebt, 0)
})
check('glutton', '6次正常吞噬触发饱食酸浪，伤及精英首领并获胃铠，远敌安全', g => {
  const w = g.weaponSystem, c = w.gluttonCombat
  feed(g, GLUTTON_SATIETY_MAX)
  assert.equal(c.satietyPending, true)
  assert.equal(g.player.gluttonSatiety, 0)
  const nearby = Array.from({ length: 10 }, () => spawn(g, { hp: .2, x: 45 }))
  const elite = spawn(g, { hp: 100, x: 40 }); elite.isElite = true
  const far = spawn(g, { hp: 100, x: 300 })
  const boss = spawnBoss(g, 100)
  c.update(.01)
  assert.equal(w.stats.overflowWaves, 1)
  assert.equal(nearby.filter(e => !e.active).length, 10)
  assert.ok(nearby.every(e => !e.devouring && !e.devourable))
  assert.ok(elite.hp < 100 && boss.hp < 100)
  assert.equal(far.hp, 100)
  assert.equal(g.player.gluttonGuard, 1)
  assert.ok(w.stats.overflowDamage >= GLUTTON_SATIETY_DAMAGE)
})
check('glutton', '吸噬吞噬与精英双倍饱食正确累计；吸噬拉拢外围敌群并重咬', g => {
  const c = g.weaponSystem.gluttonCombat
  feed(g, 2, { source: DEVOUR_SOURCE_GLUTTON })
  assert.equal(g.player.gluttonSatiety, 2)
  const elite = spawn(g, { hp: 1 }); elite.isElite = true
  g.enemyManager._startDevour(elite)
  assert.equal(g.player.gluttonSatiety, 4)
  const target = spawn(g, { hp: 100, x: 160 })
  assert.ok(c.useVortex())
  assert.equal(g.player.gluttonGuard, 1)
  settleSwing(c)
  assert.ok(target.hp < 100)
  assert.equal(g.weaponSystem.stats.heavyBites, 1)
})
check('glutton', '批量吞噬按冷却合并酸浪，首领登场清掉待发饱食酸浪', g => {
  const c = g.weaponSystem.gluttonCombat
  feed(g, 30)
  c.update(.01)
  assert.equal(g.weaponSystem.stats.overflowWaves, 1)
  g.player.gluttonSatietyCooldown = 0
  g.player.gluttonSatiety = 0
  feed(g, GLUTTON_SATIETY_MAX)
  assert.equal(c.satietyPending, true)
  g.enemyManager.spawnBoss()
  c.update(.01)
  assert.equal(c.satietyPending, false)
  assert.equal(g.weaponSystem.stats.overflowWaves, 1)
})
check('glutton', '深渊吸噬五目标触发35ms反馈；护盾全吸收时不产生虚假命中', g => {
  const c = g.weaponSystem.gluttonCombat
  c.auraTimer = 99
  for (let i = 0; i < 5; i++) spawn(g, { hp: 100, x: 150, y: i * 2 })
  c.useVortex(); settleSwing(c)
  assert.equal(g.combatFeedback.stop, .035)
  g.combatFeedback.reset()
  g.enemyManager._enemies.length = 0
  for (let i = 0; i < 5; i++) {
    const e = spawn(g, { hp: 100, x: 150, y: i * 2 })
    e.shieldHits = 1
  }
  c.useVortex(); settleSwing(c)
  assert.equal(g.combatFeedback.stop, 0)
})
check('shadow', '反馈按施放合并、频率有限、降级短顿帧，统计不受反馈冷却吞掉', g => {
  const f = g.combatFeedback
  assert.deepEqual(f.offset(), { x: 0, y: 0 })
  assert.ok(f.impact({ hits: 1, angle: 0 }))
  assert.equal(f.stop, .016)
  assert.equal(f.impact({ hits: 8, kills: 8 }), false)
  assert.equal(g.weaponSystem.stats.bestBurst, 8)
  f.advance(.5)
  assert.ok(f.impact({ hits: 5, angle: 0 }))
  assert.equal(f.stop, .035)
  assert.ok(f.offset().x > 0); assert.equal(f.offset().y, 0)
  assert.equal(f.advance(.02), 0)
  assert.ok(Math.abs(f.advance(.02) - .005) < 1e-10)
})
check('shadow', '真实帧循环顿帧时全体战斗计时同步冻结，空格输入不丢失', g => {
  let updated = 0, rendered = 0
  g.update = dt => { updated += dt }; g.render = () => { rendered++ }
  g._lastTs = 1000; g.elapsed = 0
  g.input.queueFever()
  g.combatFeedback.impact({ hits: 5 })
  g._tick(1020)
  assert.equal(updated, 0); assert.equal(g.elapsed, 0)
  assert.equal(rendered, 1); assert.equal(g.input._feverQueued, true)
  g._tick(1040)
  assert.ok(Math.abs(updated - .005) < 1e-10)
  assert.equal(updated, g.elapsed)
  assert.equal(g.input.consumeFever(), true)
})
check('ricochet', '实际伤害剔除护盾与过量伤害，击杀去重且最高连杀可结算', g => {
  const w = g.weaponSystem, a = spawn(g, { hp: 3 })
  a.shieldHits = 1; a.hit(999)
  assert.equal(w.stats.damageDealt, 0)
  a.hit(999); w._onKill(a); w._onKill(a)
  assert.equal(w.stats.damageDealt, 3)
  assert.equal(w.kills, 1)
  const b = spawn(g, { hp: 1 }); b.swarmTide = true
  b.hit(999); w._onKill(b)
  assert.equal(w.stats.bestCombo, 2)
  assert.equal(w.stats.swarmKills, 1)
  const info = g._runSnapshot('defeat')
  assert.equal(info.highlights.bestCombo, 2)
  w.stats.bestCombo = 99
  assert.equal(info.highlights.bestCombo, 2, '结算使用独立统计快照')
})
check('glutton', '远征换章和续玩保留累计高光，清掉临时小队、顿帧与瞬态猛扑动作', g => {
  g.configureRun({ mode: 'expedition', difficulty: 'normal' }); g.reset()
  g.weaponSystem.stats.squadBreaks = 3; g.weaponSystem.stats.bestCombo = 17
  const saved = captureExpeditionCheckpoint(g)
  assert.ok(saved)
  g.combatFeedback.impact({ hits: 5 })
  g.weaponSystem.gluttonCombat.satietyPending = true
  restoreExpeditionCheckpoint(g, saved)
  assert.equal(g.weaponSystem.stats.squadBreaks, 3)
  assert.equal(g.weaponSystem.stats.bestCombo, 17)
  assert.equal(g.combatFeedback.stop, 0)
  assert.equal(g.enemyManager.crowds.active, false)
  assert.equal(g.weaponSystem.gluttonCombat.satietyPending, false)
  g.reset()
  assert.equal(g.weaponSystem.stats.bestCombo, undefined)
})
console.log(`割草节奏与反馈：${passed} 组通过`)
