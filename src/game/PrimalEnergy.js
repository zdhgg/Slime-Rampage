/**
 * 拟态能量（原生黏液 origin 独占资源）：
 * 「异源充能 → 超载释放」——用与上一次不同的伤害来源输出时充能，
 * 攒到阈值后把当前空格技升档为超载版，覆盖震荡、拟态重咬与拟态鼓舞。
 * 能量为 0 时基础版仍可按自身规则使用；拟态重咬仍需要猎食点。
 *
 * P0 只接三个来源：飞弹命中 / 黏液震荡 / 元素附魔触发；
 * 主专精机制与副专精挂件在 P1 接入——PRIMAL_SOURCES 枚举已预留，
 * 新来源只需扩展枚举并在伤害结算点调用 gainPrimalEnergy。
 *
 * 口径与 GluttonResource.js 相同：模块级纯函数，状态全部挂在 player 上，
 * 引擎 / 测试桩共用同一份事实。
 */

/** 能量上限（HUD 显示为 5 格 × 20） */
export const PRIMAL_ENERGY_MAX = 100
/** 超载释放的消耗（空格技升档价格） */
export const PRIMAL_OVERLOAD_COST = 40
/** 拟态重咬与鼓舞已有独立基础机制，超载使用各自的强化幅度。 */
export const PRIMAL_BITE_OVERLOAD_DAMAGE = 1.5
export const PRIMAL_BITE_OVERLOAD_RANGE = 1.5
export const PRIMAL_RALLY_OVERLOAD_DURATION = 2
export const PRIMAL_RALLY_OVERLOAD_DAMAGE = 0.2
/** 异源充能（与上一次伤害来源不同） */
export const PRIMAL_GAIN_FOREIGN = 8
/** 同源充能（兜底 +1，不惩罚站撸但也不奖励） */
export const PRIMAL_GAIN_SAME = 1
/** 击杀加成：精英 / 首领（独立通道，不占每秒判定节流） */
export const PRIMAL_GAIN_ELITE = 15
export const PRIMAL_GAIN_BOSS = 30
/** 节流：每个滚动时间窗内最多结算的充能判定次数（防高频武器+多 DOT 刷能） */
export const PRIMAL_GAIN_WINDOW = 1
export const PRIMAL_GAIN_WINDOW_MAX = 3

/**
 * 伤害来源枚举（异源判定的标签）：
 * P0 三源已接线；MECHANISM / SECONDARY 为 P1 预留（主专精机制、副专精挂件）。
 */
export const PRIMAL_SOURCES = {
  PROJECTILE: 'projectile',
  SHOCK: 'shock',
  ELEMENT: 'element',
  // P1: MECHANISM: 'mechanism', SECONDARY: 'secondary',
}

/** 该玩家是否拥有拟态能量（origin 独占资源）。 */
export function hasPrimalEnergy(player) {
  return !!player && player.strainId === 'origin'
}

/** 震荡扩能随原生当前主动继承；只读取局内技能等级，不重复写入角色属性。 */
export function getOriginActiveGrowth(engine, level = engine?.skillLevels?.com_shock || 0) {
  const rank = hasPrimalEnergy(engine?.player) ? level : 0
  return { damageMul: 1 + rank * 0.1, rangeBonus: rank * 8, rallyDuration: rank * 0.5, rallyDamage: rank * 0.1 }
}

/** HUD 与主动说明共用实际超载效果，避免鼓舞继续承诺震荡半径。 */
export function primalOverloadDescription(engine) {
  if (engine?.primarySpec === 'gluttony') return `重咬伤害 ×${PRIMAL_BITE_OVERLOAD_DAMAGE}、范围 ×${PRIMAL_BITE_OVERLOAD_RANGE}（仍需 1 猎食点）`
  if (engine?.primarySpec === 'symbiosis') return `鼓舞额外延长 ${PRIMAL_RALLY_OVERLOAD_DURATION} 秒、伙伴攻击加成额外 +${Math.round(PRIMAL_RALLY_OVERLOAD_DAMAGE * 100)}%`
  return '半径 ×1.5、伤害 ×2.5、击退翻倍'
}

/** 归零（新局 / restart 共用；纯局内资源，不进存档）。 */
export function resetPrimalEnergy(player) {
  if (!player) return
  player.primalEnergy = 0
  player._lastDamageSource = null
  player._primalWindowStart = -Infinity
  player._primalWindowCount = 0
}

/**
 * 异源充能：每次伤害结算调用一次。
 *  - 来源与上一次不同 → +PRIMAL_GAIN_FOREIGN；相同 → +PRIMAL_GAIN_SAME；
 *  - 节流：每个 PRIMAL_GAIN_WINDOW 秒窗口内最多结算 PRIMAL_GAIN_WINDOW_MAX 次，
 *    被节流的判定不改变「上一次来源」（不消耗轮换进度）；
 *  - 满格（100）不再获得。
 * @returns {number} 本次实际充入的能量（0 = 被节流 / 满格 / 非 origin）
 */
export function gainPrimalEnergy(engine, source, now = engine?.elapsed ?? 0) {
  const p = engine?.player
  if (!hasPrimalEnergy(p) || p.dead) return 0
  if (p.primalEnergy >= PRIMAL_ENERGY_MAX) return 0
  if (now - p._primalWindowStart >= PRIMAL_GAIN_WINDOW) {
    p._primalWindowStart = now
    p._primalWindowCount = 0
  }
  if (p._primalWindowCount >= PRIMAL_GAIN_WINDOW_MAX) return 0
  p._primalWindowCount++
  const foreign = source !== p._lastDamageSource
  p._lastDamageSource = source
  const amount = foreign ? PRIMAL_GAIN_FOREIGN : PRIMAL_GAIN_SAME
  p.primalEnergy = Math.min(PRIMAL_ENERGY_MAX, p.primalEnergy + amount)
  return amount
}

/**
 * 击杀加成（精英 +15 / 首领 +30）：独立通道，不占充能节流——
 * 击杀是低频高光事件，不与命中判定抢窗口。
 * @returns {number} 本次实际充入的能量
 */
export function onPrimalKill(engine, enemy) {
  const p = engine?.player
  if (!hasPrimalEnergy(p) || p.dead || !enemy) return 0
  const amount = enemy.isBoss ? PRIMAL_GAIN_BOSS : enemy.isElite ? PRIMAL_GAIN_ELITE : 0
  if (!amount || p.primalEnergy >= PRIMAL_ENERGY_MAX) return 0
  p.primalEnergy = Math.min(PRIMAL_ENERGY_MAX, p.primalEnergy + amount)
  return amount
}

/** 能量是否够一次超载（≥ PRIMAL_OVERLOAD_COST）。 */
export function canPrimalOverload(player) {
  return hasPrimalEnergy(player) && player.primalEnergy >= PRIMAL_OVERLOAD_COST
}

/**
 * 尝试为本次空格技支付超载费用。
 * @returns {boolean} true = 已扣费，本次应走超载版；false = 照常基础版
 */
export function trySpendPrimalOverload(engine) {
  const p = engine?.player
  if (!canPrimalOverload(p)) return false
  p.primalEnergy -= PRIMAL_OVERLOAD_COST
  return true
}
