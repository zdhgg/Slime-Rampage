import { getOriginGrowth, originOverloadDescription, resetOriginState, ORIGIN_BASE, ORIGIN_RULES } from './OriginBuild.js'

/**
 * 异源能量（原生黏液 origin 独占资源）：
 * 「异源充能 → 被动超载自动释放」。飞弹、震荡、元素附着是不同的伤害来源；
 * 交替使用会获得更高充能，攒到阈值后由被动超载控制器自动释放源质技能。
 *
 * 路线效果与印记回响刻意不充能（共振路线只提高充能效率），
 * 避免“路线附加伤害 → 更多能量 → 更多超载”的递归。
 *
 * 旧名 PrimalEnergy / primalEnergy 保留为兼容别名，至少保留一个版本。
 */

export const ORIGIN_ENERGY_MAX = ORIGIN_BASE.energyMax
export const ORIGIN_OVERLOAD_COST = ORIGIN_BASE.overloadCost
export const PRIMAL_ENERGY_MAX = ORIGIN_ENERGY_MAX
export const PRIMAL_OVERLOAD_COST = ORIGIN_OVERLOAD_COST

/** 充能来源：路线来源只记录回路，不直接给能量。 */
export const ORIGIN_SOURCES = {
  PROJECTILE: 'projectile',
  SHOCK: 'shock',
  ELEMENT: 'element',
  ROUTE: 'route',
}
export const PRIMAL_SOURCES = ORIGIN_SOURCES

export const PRIMAL_GAIN_FOREIGN = 8
export const PRIMAL_GAIN_SPECIAL = 5
export const PRIMAL_GAIN_SAME = 2
export const PRIMAL_FOREIGN_BONUS_CAP = 3
export const PRIMAL_GAIN_ELITE = 15
export const PRIMAL_GAIN_BOSS = 30
export const PRIMAL_GAIN_WINDOW = 1
export const PRIMAL_GAIN_WINDOW_MAX = 3

/** 战斗涌流：附近有敌人时持续充能，保证不按空格也有完整的被动超载循环。 */
export const ORIGIN_FLOW_RATE = 1.5
export const ORIGIN_FLOW_RANGE = 480

export function isOrigin(player) {
  return !!player && player.strainId === 'origin'
}

export function hasPrimalEnergy(player) {
  return isOrigin(player)
}

/** 兼容旧调用：旧的拟态成长字段已移除，保留公共字段。 */
export function getOriginActiveGrowth(engine, level = engine?.skillLevels?.com_shock || 0) {
  const growth = getOriginGrowth(engine, {
    ...(engine?.skillLevels || {}),
    com_shock: level,
  })
  return {
    ...growth,
    // 旧字段：仍被少量测试/表现层引用，语义归零。
    rallyDuration: 0,
    rallyDamage: 0,
    concordEcho: 0,
    overloadDamageMul: growth.overloadDamageMul,
    overloadRangeMul: growth.overloadRangeMul,
  }
}

export function resetOriginEnergy(player) {
  if (!player) return
  player.originEnergy = 0
  player._lastDamageSource = null
  player._primalWindowStart = -Infinity
  player._primalWindowCount = 0
  resetOriginState({ player })
}

export const resetPrimalEnergy = resetOriginEnergy

function recordSource(engine, source, now) {
  if (engine?.originRoute !== 'resonance') return
  const p = engine?.player
  const resonance = p?.routeState?.resonance
  if (!resonance) return
  if (!resonance.sources.includes(source)) {
    resonance.sources.push(source)
    resonance.circuits = Math.min(ORIGIN_RULES.resonanceMaxCircuits, resonance.sources.length)
  }
  const growth = getOriginGrowth(engine)
  resonance.circuitTimer = growth.circuitWindow
}

/**
 * 异源充能：
 *  - 来源与上一次不同 → +8（+ origin_flux 加成）；相同 → +1；
 *  - 每秒最多结算 3 次，被节流的判定不改变“上一次来源”；
 *  - 路线来源只记录共振回路，不产生能量。
 */
export function gainOriginEnergy(engine, source, now = engine?.elapsed ?? 0) {
  const p = engine?.player
  if (!isOrigin(p) || p.dead) return 0
  recordSource(engine, source, now)
  if (source === ORIGIN_SOURCES.ROUTE) return 0
  if (p.originEnergy >= ORIGIN_ENERGY_MAX) return 0
  if (now - p._primalWindowStart >= PRIMAL_GAIN_WINDOW) {
    p._primalWindowStart = now
    p._primalWindowCount = 0
  }
  if (p._primalWindowCount >= PRIMAL_GAIN_WINDOW_MAX) return 0
  p._primalWindowCount++
  const foreign = source !== p._lastDamageSource
  p._lastDamageSource = source
  const growth = getOriginGrowth(engine)
  const circuits = p.routeState?.resonance?.circuits || 0
  const circuitMul = engine.originRoute === 'resonance' ? 1 + growth.circuitEnergy * circuits : 1
  let amount = (foreign ? PRIMAL_GAIN_FOREIGN + growth.foreignBonus : PRIMAL_GAIN_SAME) * circuitMul
  // 「多源切换」独立 3 秒节流：不吃每秒充能窗口，也不会被同源命中刷新。
  if (foreign && growth.switchLevel > 0 && now >= (p.originSwitchReadyAt ?? -Infinity)) {
    amount += growth.switchLevel * 2
    p.originSwitchReadyAt = now + 3
  }
  p.originEnergy = Math.min(ORIGIN_ENERGY_MAX, p.originEnergy + amount)
  engine.bossTomes?.onOriginGain(foreign, amount)
  return amount
}

export const gainPrimalEnergy = gainOriginEnergy

/** 只记录来源（用于路线/共振回路），不充能。 */
export function noteOriginSource(engine, source, now = engine?.elapsed ?? 0) {
  const p = engine?.player
  if (!isOrigin(p) || p.dead) return 0
  recordSource(engine, source, now)
  return 0
}

/**
 * 战斗涌流：指定范围内存在有效敌人时按 dt 持续充能。
 * 不属于任何「伤害来源」：不切换来源、不受每秒 3 次充能窗口节流、不记录共振回路。
 */
export function tickOriginCombatFlow(engine, dt) {
  const p = engine?.player
  if (!isOrigin(p) || p.dead || !(dt > 0) || p.originEnergy >= ORIGIN_ENERGY_MAX) return 0
  const r2 = ORIGIN_FLOW_RANGE * ORIGIN_FLOW_RANGE
  for (const e of engine?.enemyManager?.enemies || []) {
    if (!e.active || e.devouring) continue
    if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 > r2) continue
    const before = p.originEnergy
    p.originEnergy = Math.min(ORIGIN_ENERGY_MAX, p.originEnergy + ORIGIN_FLOW_RATE * dt)
    return p.originEnergy - before
  }
  return 0
}

export function onOriginKill(engine, enemy) {
  const p = engine?.player
  if (!isOrigin(p) || p.dead || !enemy) return 0
  const amount = enemy.isBoss ? PRIMAL_GAIN_BOSS : enemy.isElite ? PRIMAL_GAIN_ELITE : 0
  if (!amount || p.originEnergy >= ORIGIN_ENERGY_MAX) return 0
  p.originEnergy = Math.min(ORIGIN_ENERGY_MAX, p.originEnergy + amount)
  return amount
}

export const onPrimalKill = onOriginKill

export function canOriginOverload(player) {
  return isOrigin(player) && player.originEnergy >= ORIGIN_OVERLOAD_COST
}

export const canPrimalOverload = canOriginOverload

/**
 * 支付一次被动超载。写入 overloadState，供 HUD、同化形变和印记回响共享。
 * 只由被动超载控制器（OriginOverload）在确认释放时调用：
 * 黏液震荡与其他路径都不再支付能量。active 状态是唯一的重入保护，
 * 频率由控制器的内部冷却与充能速度决定。
 */
export function trySpendOriginOverload(engine, info = {}) {
  const p = engine?.player
  if (!canOriginOverload(p)) return false
  const now = engine?.elapsed ?? 0
  const state = p.overloadState || {}
  if (state.active) return false
  p.originEnergy -= ORIGIN_OVERLOAD_COST
  p.overloadState = {
    active: true,
    timer: ORIGIN_RULES.overloadWindow,
    route: engine?.originRoute || null,
    skillId: info.id || null,
    damageMul: info.damageMul || 1,
    radiusMul: info.radiusMul || 1,
    spent: ORIGIN_OVERLOAD_COST,
    lastPaidAt: now,
    echoTriggered: false,
  }
  // 每次新超载都可以兑现一次印记回响；markState.echoUsed 只在本轮超载内有效。
  if (p.markState) p.markState.echoUsed = false
  engine.bossTomes?.onOverload()
  return true
}

export const trySpendPrimalOverload = trySpendOriginOverload

export const originOverloadText = originOverloadDescription
export const primalOverloadDescription = (engine) => originOverloadDescription(engine)

/** 拟态/副专精时代的兼容入口：现在不再产生能量。 */
export function gainOriginMechanism() { return 0 }
export function gainOriginSecondary() { return 0 }
