import assert from 'node:assert/strict'
import { createArena, spawn, spawnBoss, pressSpace, rollSkills, learn, dispose } from './test-support/arena-fixture.mjs'
import { ORIGIN_BASE } from './src/game/OriginBuild.js'
import { gainOriginEnergy, ORIGIN_SOURCES } from './src/game/PrimalEnergy.js'
import {
  ORIGIN_INNATE_SKILL,
  ORIGIN_OVERLOAD_RULES,
  learnOriginMemory as learnMemory,
  originComboState, originComboEntries, originMemories,
  nextOriginCast,
  originMemoryHud,
} from './src/game/OriginSourceSkills.js'
import { setOriginComboLoadout } from './src/game/OriginCombo.js'

function learnOriginMemory(g, id) {
  const first = originMemories(g).length === 0
  const result = learnMemory(g, id)
  if (first && result) setOriginComboLoadout(originComboState(g), [id], id, originComboEntries(g).map(e => e.id))
  return result
}

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

check('有效震荡催化充能，空放不充能', g => {
  pressSpace(g)
  assert.equal(g.player.originEnergy, 0)
  g.player.strainSkillCd = 0
  spawn(g, { x: 60, hp: 10000 })
  pressSpace(g)
  assert.equal(g.player.originEnergy, 8)
})

check('普攻与元素独立限频，震荡不被普攻限频', g => {
  gainOriginEnergy(g, ORIGIN_SOURCES.PROJECTILE, 0)
  gainOriginEnergy(g, ORIGIN_SOURCES.PROJECTILE, 0.1)
  gainOriginEnergy(g, ORIGIN_SOURCES.PROJECTILE, 0.2)
  gainOriginEnergy(g, ORIGIN_SOURCES.ELEMENT, 0.2)
  gainOriginEnergy(g, ORIGIN_SOURCES.ELEMENT, 0.3)
  gainOriginEnergy(g, ORIGIN_SOURCES.SHOCK, 0.3, 3)
  assert.equal(g.player.originEnergy, 18)
})

/** 真实引擎计时推进：震荡 → 源质执行器 → 被动超载控制器（与 WeaponSystem.update 同序）。 */
function advance(g, seconds, step = 0.05) {
  const steps = Math.max(1, Math.ceil(seconds / step))
  for (let i = 0; i < steps; i++) {
    g.elapsed += step
    g._updateStrainSkill(step)
    g.weaponSystem.originCombat.update(step)
    g.weaponSystem.originSourceCombat.update(step)
    g.weaponSystem.originOverload.update(step)
  }
}

/** 驱动被动控制器完成一次超载（启动 0.25s → 扣费 → 释放）。 */
function fireOverload(g) {
  const ctrl = g.weaponSystem.originOverload
  ctrl.reset()
  g.player.overloadState.active = false
  g.player.overloadState.timer = 0
  g.player.originEnergy = ORIGIN_BASE.overloadCost
  advance(g, ORIGIN_OVERLOAD_RULES.windup + 0.15, 0.02)
  assert.equal(g.player.overloadState.active, true, '被动超载应当成功支付')
  assert.ok(g.player.originEnergy < ORIGIN_BASE.overloadCost, '确实扣除了超载能量')
}

check('前两次升级提供超载成长候选', g => {
  for (const level of [2, 3]) {
    g.player.level = level
    for (let i = 0; i < 20; i++) {
      assert.ok(rollSkills(g, 3).some(card => ['origin_flux', 'origin_overload'].includes(card.id)))
    }
  }
})

check('源质射程不够时暂用其他技能且保留原轮换位', g => {
  learnOriginMemory(g, 'knight_breach')
  learnOriginMemory(g, 'archer_hunt')
  spawn(g, { x: 650, hp: 100000 })
  g.player.originEnergy = 40
  advance(g, 3.5, 0.05)
  assert.equal(g.originSourceLastCast?.id, 'archer_hunt')
  assert.equal(nextOriginCast(g).id, 'knight_breach')
})

check('同化满层奖励超时后保留至超载', g => {
  g.originRoute = 'assimilation'
  g.player.mutationState.stacks = 5
  g.player.mutationState.empowered = true
  g.player.mutationState.timer = 0.1
  advance(g, 0.5)
  assert.equal(g.player.mutationState.stacks, 5)
  spawn(g, { x: 60, hp: 100000 })
  fireOverload(g)
  assert.equal(g.player.mutationState.stacks, 0)
  assert.ok(g.player.mutationState.formTimer > 0)
})

check('液态回流只在超载有效命中后恢复', g => {
  learn(g, 'origin_recovery')
  g.player.hp = g.player.maxHp - 1
  spawn(g, { x: 50, hp: 100000 })
  pressSpace(g)
  assert.equal(g.player.hp, g.player.maxHp - 1)
  fireOverload(g)
  advance(g, 1.5)
  assert.equal(g.player.hp, g.player.maxHp)
})

// ============================================================
// 验收用例 1~9：核心循环
// ============================================================

check('1. 开局无 BOSS 源质：被动超载自动释放默认技能「原质环流」', g => {
  assert.equal(nextOriginCast(g).id, 'primal_orbit', '未吸收时预告原质环流')
  spawn(g, { x: 60, hp: 10000 })
  g.player.originEnergy = ORIGIN_BASE.overloadCost
  advance(g, ORIGIN_OVERLOAD_RULES.windup + 0.1, 0.02)
  assert.equal(g.originSourceLastCast?.id, 'primal_orbit')
  assert.ok(g.player.overloadState.active)
  assert.ok(g.weaponSystem.originSourceCombat.orbs.length > 0, '原质球已生成')
})

check('2. 全程不按空格：普攻与战斗涌流也能驱动被动超载', g => {
  spawn(g, { x: 150, hp: 100000 })
  // 走完整武器帧（含普攻充能 + 涌流），留出蓄能与启动时间。
  for (let i = 0; i < 45 * 20 && !g.originSourceLastCast; i++) {
    g.elapsed += 0.05
    g.weaponSystem.update(0.05)
  }
  assert.equal(g.originSourceLastCast?.id, 'primal_orbit', '不按空格也应自动超载')
})

check('3. 频繁按空格不直接支付超载能量', g => {
  g.weaponSystem.originOverload.cooldown = 9999 // 隔离控制器，只观察空格行为
  g.player.originEnergy = ORIGIN_BASE.overloadCost
  for (let i = 0; i < 5; i++) {
    g.player.strainSkillCd = 0
    pressSpace(g)
  }
  assert.equal(g.player.overloadState.lastPaidAt, -Infinity, '空格不支付超载')
  assert.ok(g.player.originEnergy >= ORIGIN_BASE.overloadCost, '空格只充能不扣费')
})

check('4. 能量不足时不会自动释放', g => {
  spawn(g, { x: 60, hp: 10000 })
  g.player.originEnergy = 0
  advance(g, 0.4, 0.02) // 涌流 1.5/s × 0.4s ≈ 0.6，远低于 40
  assert.equal(g.originSourceLastCast, null)
  assert.equal(g.player.overloadState.lastPaidAt, -Infinity)
})

check('5. 能量足够但无敌人时不会空耗', g => {
  g.player.originEnergy = ORIGIN_BASE.overloadCost
  advance(g, 0.6, 0.02)
  assert.ok(g.player.originEnergy >= ORIGIN_BASE.overloadCost, '无目标不扣能量')
  assert.equal(g.originSourceLastCast, null)
  assert.equal(g.weaponSystem.originSourceCombat.orbs.length, 0)
})

check('6. 冷却期间可以继续储能但不提前释放', g => {
  spawn(g, { x: 80, hp: 100000 })
  fireOverload(g)
  const paidAt = g.player.overloadState.lastPaidAt
  g.player.originEnergy = 100
  advance(g, ORIGIN_OVERLOAD_RULES.cooldown - 1, 0.05)
  assert.equal(g.player.overloadState.lastPaidAt, paidAt, '冷却内不重复支付')
  assert.ok(g.player.originEnergy >= ORIGIN_BASE.overloadCost, '冷却内能量继续积累')
  advance(g, 1.5, 0.05)
  assert.ok(g.player.overloadState.lastPaidAt > paidAt, '冷却结束后自动进入下一次超载')
})

check('7. 可把已吸收 BOSS 源质装备为主技能', g => {
  learnOriginMemory(g, 'knight_breach')
  assert.equal(nextOriginCast(g).id, 'knight_breach')
  spawn(g, { x: 120, hp: 100000 })
  fireOverload(g)
  assert.equal(g.originSourceLastCast.id, 'knight_breach', '源质记忆替代默认技能')
  assert.ok(g.weaponSystem.originSourceCombat.waves.length > 0, '释放了破阵凝胶波而非环流')
})

check('8. 多项记忆不会改变指定的主技能', g => {
  learnOriginMemory(g, 'knight_breach')
  learnOriginMemory(g, 'mage_collapse')
  learnOriginMemory(g, 'archer_hunt')
  spawn(g, { x: 160, hp: 100000 })
  const order = []
  for (let i = 0; i < 3; i++) {
    fireOverload(g)
    order.push(g.originSourceLastCast.id)
    g.originSourceLastCast = null
  }
  assert.deepEqual(order, Array(3).fill('knight_breach'))
})

check('9. 自动超载不会连续重复支付或递归触发', g => {
  spawn(g, { x: 150, hp: 100000 })
  g.player.originEnergy = ORIGIN_BASE.overloadCost
  advance(g, ORIGIN_OVERLOAD_RULES.windup + 0.5, 0.02)
  const paid1 = g.player.overloadState.lastPaidAt
  assert.ok(Number.isFinite(paid1))
  // 支付后能量 < 40 且进入冷却：同一批实体结算不可能再触发一次。
  assert.ok(g.player.originEnergy < ORIGIN_BASE.overloadCost)
  assert.ok(g.weaponSystem.originOverload.cooldown > 0)
  advance(g, 0.5, 0.02)
  assert.equal(g.player.overloadState.lastPaidAt, paid1, '一次超载只支付一次')
})

// ============================================================
// 验收用例 13/14/15：结算与隔离
// ============================================================

check('13. 源质技能击杀正常结算，精英/首领击杀不返还超载充能', g => {
  learnOriginMemory(g, 'knight_breach')
  const elite = spawn(g, { x: 250, hp: 1 })
  elite.isElite = true
  const boss = spawnBoss(g, 1, 'boss-mage')
  boss.x = g.player.x + 330
  boss.y = g.player.y
  g.player.originEnergy = ORIGIN_BASE.overloadCost
  advance(g, 1.5, 0.03)
  assert.equal(elite.active, false)
  assert.equal(boss.active, false)
  assert.equal(g.weaponSystem.eliteKills, 1)
  assert.equal(g.weaponSystem.bossKills, 1)
  assert.ok(g.player.originEnergy < ORIGIN_BASE.overloadCost, '源质击杀不返还 +15/+30 充能')
  assert.ok(elite._originDerivedKill && boss._originDerivedKill, '击杀已打衍生标记')
})

check('14a. 死亡/结算不遗留延迟任务与飞行物，重开清空记忆', g => {
  learnOriginMemory(g, 'knight_breach')
  spawn(g, { x: 150, hp: 100000 })
  fireOverload(g)
  g.finishRun('defeat')
  g.weaponSystem.update(0.016)
  const cs = g.weaponSystem.originSourceCombat
  assert.equal(cs.jobs.length + cs.waves.length + cs.cores.length + cs.spikes.length + cs.orbs.length, 0)
  assert.equal(g.weaponSystem.originOverload.state, 'charging')
  g.reset()
  assert.deepEqual(g.originSourceMemories, [])
  assert.equal(g.originSourceCursor, 0)
  assert.equal(g.originSourceLastCast, null)
})

check('14b. 换章清空在途技能与超载启动，保留本局已学记忆', g => {
  learnOriginMemory(g, 'mage_collapse')
  learnOriginMemory(g, 'archer_hunt')
  spawn(g, { x: 150, hp: 100000 })
  g.player.originEnergy = ORIGIN_BASE.overloadCost
  g.weaponSystem.originOverload.update(0.02) // 进入启动
  assert.equal(g.weaponSystem.originOverload.state, 'windup')
  g._enterExpeditionStage(2)
  assert.equal(g.weaponSystem.originOverload.state, 'charging', '换章取消未支付的启动')
  assert.equal(g.weaponSystem.originSourceCombat.jobs.length, 0)
  assert.deepEqual(g.originSourceMemories.map(m => m.id), ['mage_collapse', 'archer_hunt'], '记忆保留')
})

check('14c. 启动期间目标失效：取消释放、保留能量与轮换位', g => {
  learnOriginMemory(g, 'mage_collapse')
  const target = spawn(g, { x: 60, hp: 10000 })
  g.player.originEnergy = ORIGIN_BASE.overloadCost
  g.weaponSystem.originOverload.update(0.02)
  assert.equal(g.weaponSystem.originOverload.state, 'windup')
  target.hit(20000)
  assert.equal(target.active, false)
  advance(g, 0.4, 0.02)
  assert.equal(g.player.overloadState.lastPaidAt, -Infinity, '目标失效不扣能量')
  assert.equal(g.originSourceLastCast, null)
  assert.equal(g.originSourceCursor, 0, '不消耗轮换位')
  // 目标回来后正常释放（重试 0.5s + 启动 0.25s，给足窗口）
  spawn(g, { x: 60, hp: 10000 })
  advance(g, 0.9, 0.02)
  assert.equal(g.originSourceLastCast?.id, 'mage_collapse')
})

check('15. 其他五种职业：控制器关闭、零行为变化', g => {
  for (const strain of ['glutton', 'ricochet', 'elemental', 'shadow', 'summoner']) {
    const other = createArena(strain)
    try {
      assert.equal(other.weaponSystem.originOverload.enabled, false, `${strain} 不启用被动超载`)
      assert.equal(other.weaponSystem.originSourceCombat.enabled, false)
      spawn(other, { x: 100, hp: 100000 })
      other.weaponSystem.originOverload.update(0.05)
      other.weaponSystem.update(0.05)
      assert.equal(other.originSourceLastCast, null)
      assert.equal(other.weaponSystem.originSourceCombat.orbs.length, 0)
    } finally {
      dispose(other)
    }
  }
})

// ============================================================
// 补充：默认技能预告与启动时序
// ============================================================

check('HUD 在无记忆时预告「原质环流」，而不是空洞提示', g => {
  const memory = originMemoryHud(g)
  assert.equal(memory.nextName, '原质环流')
  assert.equal(memory.nextInnate, true)
  assert.equal(ORIGIN_INNATE_SKILL.innate, true)
})

check('启动表现 0.25 秒：期间不扣能量，结束后才支付', g => {
  spawn(g, { x: 60, hp: 10000 })
  g.player.originEnergy = ORIGIN_BASE.overloadCost
  g.weaponSystem.originOverload.update(0.02)
  assert.equal(g.weaponSystem.originOverload.state, 'windup')
  advance(g, 0.1, 0.02)
  assert.ok(g.player.originEnergy >= ORIGIN_BASE.overloadCost, '启动中未扣能量')
  assert.equal(g.originSourceLastCast, null)
  advance(g, 0.2, 0.02)
  assert.equal(g.originSourceLastCast?.id, 'primal_orbit', '启动结束后释放')
})

// ============================================================
// 验收用例 10~12：三路线、资源归属与乘区收口（第 2 阶段）
// ============================================================

check('10. 同化新层数来源：普攻命中 2.5s 节流 / 精英击杀 4s 节流；满层兑现后可重新叠层', g => {
  g.originRoute = 'assimilation'
  const oc = g.weaponSystem.originCombat
  oc.onBasicHit(); oc.onBasicHit()
  assert.equal(g.player.mutationState.stacks, 1, '普攻命中 2.5 秒内只 +1')
  g.elapsed += 2.6
  oc.onBasicHit()
  assert.equal(g.player.mutationState.stacks, 2)

  const elite = spawn(g, { x: 300, hp: 10000 })
  elite.isElite = true
  const trash = spawn(g, { x: 320, hp: 10 })
  oc.onKill(elite); oc.onKill(elite)
  assert.equal(g.player.mutationState.stacks, 3, '精英击杀 4 秒内只 +1')
  g.elapsed += 4.1
  oc.onKill(trash)
  assert.equal(g.player.mutationState.stacks, 3, '非精英击杀不叠层')
  oc.onKill(elite)
  assert.equal(g.player.mutationState.stacks, 4)

  // 满层（基础上限 5）由超载兑现清空，之后可重新积累，不会长期卡满。
  g.player.mutationState.stacks = 5
  spawn(g, { x: 120, hp: 100000 }) // 原质环流射程内的释放目标
  fireOverload(g)
  assert.equal(g.player.mutationState.stacks, 0, '满层被被动超载兑现清空')
  oc.onBasicHit()
  assert.equal(g.player.mutationState.stacks, 1, '兑现后重新积累')
})

check('11. 三路线差异：扩张液域独立上限 1 / 共振冷却更短 / 同化满层消耗', g => {
  g.originRoute = 'expansion'
  spawn(g, { x: 200, hp: 100000 })
  fireOverload(g)
  fireOverload(g)
  const fields = g.weaponSystem.originCombat.fields.filter(f => f.overloadField)
  assert.equal(fields.length, 1, '超载液域顶替不叠加')
  assert.ok(fields[0].dmg > 0 && fields[0].life > 0)

  g.originRoute = 'resonance'
  assert.ok(g.weaponSystem.originOverload.cooldownFor() < 6, '共振路线超载冷却更短')

  g.originRoute = 'assimilation'
  g.player.mutationState.stacks = 5
  g.elapsed += 10
  fireOverload(g)
  assert.equal(g.player.mutationState.stacks, 0, '满层快照兑现消耗')
})

check('12. 一次超载的共振余波/印记回响各只兑现一次（棘刺多段不叠加）', g => {
  g.originRoute = 'resonance'
  learnOriginMemory(g, 'archer_hunt')
  g.originMark = 'gatling'
  g.player.markState = { mark: 'gatling', rank: 1, icd: 0, echoUsed: false, bubble: 0, bubbleTimer: 0, icdByFamily: {} }
  g.player.routeState = {
    route: 'resonance',
    resonance: { sources: ['projectile', 'shock', 'element'], circuits: 3, circuitTimer: 8 },
  }
  for (let i = 0; i < 4; i++) spawn(g, { x: 150 + i * 60, hp: 100000 })
  fireOverload(g)
  advance(g, 1.0, 0.03) // 让棘刺完成多段命中
  const echoes = g.weaponSystem.originSourceCombat.jobs.filter(j => j.kind === 'echo')
  assert.ok(echoes.length <= 1, '多段命中也只排一次共振余波')
  assert.equal(g.player.markState.echoUsed, true, '印记回响已兑现')
  // 回响预算改为读本次技能倍率：棘刺 Lv.1 2.0×乘区 → 副弹伤害按该基准 ×35%
})

console.log(`\n原生被动超载验收通过：${passed} 组 ✓`)
