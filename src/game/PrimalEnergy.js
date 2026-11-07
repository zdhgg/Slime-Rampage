/**
 * 拟态能量（原生黏液 origin 独占资源）：
 * 「异源充能 → 超载释放」——用与上一次不同的伤害来源输出时充能，
 * 攒到阈值后把当前空格技升档为超载版，覆盖震荡、拟态重咬与拟态鼓舞。
 * 能量为 0 时基础版仍可按自身规则使用；拟态重咬仍需要猎食点。
 *
 * 当前来源：飞弹命中 / 黏液震荡 / 元素附魔触发 / 主专精机制 / 副专精共鸣。
 * 后两者仍走同一窗口节流与 100 点上限，保证“多路线协同”是有限回响，
 * 不会因为伙伴、分裂或元素连锁递归刷能量。
 *
 * 口径与 GluttonResource.js 相同：模块级纯函数，状态全部挂在 player 上，
 * 引擎 / 测试桩共用同一份事实。
 */

import { getOriginCoreResonance } from './OriginCoreResonance.js'

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
/** 主专精机制与副专精回响的基础异源收益略低，避免超载回响自我返还过多能量。 */
export const PRIMAL_GAIN_SPECIAL = 5
/** 同源充能（兜底 +1，不惩罚站撸但也不奖励） */
export const PRIMAL_GAIN_SAME = 1
/** 原生专属“异源校准”卡的递减收益上限。 */
export const PRIMAL_FOREIGN_BONUS_CAP = 3
/** 击杀加成：精英 / 首领（独立通道，不占每秒判定节流） */
export const PRIMAL_GAIN_ELITE = 15
export const PRIMAL_GAIN_BOSS = 30
/** 节流：每个滚动时间窗内最多结算的充能判定次数（防高频武器+多 DOT 刷能） */
export const PRIMAL_GAIN_WINDOW = 1
export const PRIMAL_GAIN_WINDOW_MAX = 3

/**
 * 伤害来源枚举（异源判定的标签）：
 * 主机制与副共鸣来源同样使用这套轮换标签和窗口节流。
 */
export const PRIMAL_SOURCES = {
  PROJECTILE: 'projectile',
  SHOCK: 'shock',
  ELEMENT: 'element',
  MECHANISM: 'mechanism',
  SECONDARY: 'secondary',
}

/** 该玩家是否拥有拟态能量（origin 独占资源）。 */
export function hasPrimalEnergy(player) {
  return !!player && player.strainId === 'origin'
}

/** 震荡扩能随原生当前主动继承；只读取局内技能等级，不重复写入角色属性。 */
export function getOriginActiveGrowth(engine, level = engine?.skillLevels?.com_shock || 0) {
  const rank = hasPrimalEnergy(engine?.player) ? level : 0
  const flux = hasPrimalEnergy(engine?.player) ? Math.max(0, engine?.skillLevels?.origin_flux || 0) : 0
  const overload = hasPrimalEnergy(engine?.player) ? Math.max(0, engine?.skillLevels?.origin_overload || 0) : 0
  const concord = hasPrimalEnergy(engine?.player) ? Math.max(0, engine?.skillLevels?.origin_concord || 0) : 0
  // 这些曲线都在中后期递减，且有硬上限；卡片可以多级，但组合不会指数膨胀。
  const foreignBonus = Math.min(PRIMAL_FOREIGN_BONUS_CAP, Math.round((1 - 0.86 ** flux) * 4 * 100) / 100)
  const overloadDamageBonus = Math.min(0.45, 1 - 0.92 ** overload)
  const overloadRangeBonus = Math.min(0.3, 1 - 0.94 ** overload)
  const concordEcho = Math.min(3, concord)
  return {
    damageMul: 1 + rank * 0.1,
    rangeBonus: rank * 8,
    rallyDuration: rank * 0.5,
    rallyDamage: rank * 0.1,
    foreignBonus,
    overloadDamageMul: 1 + overloadDamageBonus,
    overloadRangeMul: 1 + overloadRangeBonus,
    concordEcho,
  }
}

/**
 * 计算一次已支付或预览中的超载收益。overloaded=false 时只返回基础倍率，
 * 避免空放或冷却状态提前获得收益。
 */
export function getPrimalOverloadProfile(engine, overloaded = true) {
  const growth = getOriginActiveGrowth(engine)
  const primary = engine?.primarySpec || null
  const secondary = engine?.secondarySpec || null
  const level = (id) => Math.max(0, engine?.skillLevels?.[id] || 0)
  const profile = {
    shockDamageMul: overloaded ? growth.overloadDamageMul : 1,
    shockRangeMul: overloaded ? growth.overloadRangeMul : 1,
    biteDamageMul: overloaded ? growth.overloadDamageMul : 1,
    biteRangeMul: overloaded ? growth.overloadRangeMul : 1,
    rallyDuration: overloaded ? Math.min(1, (growth.overloadRangeMul - 1) * 5) : 0,
    rallyDamage: overloaded ? growth.overloadDamageMul - 1 : 0,
    volleyBonus: 0,
    elementalSpreadBonus: 0,
    assassinStealth: 0,
    secondaryEcho: null,
  }
  if (!overloaded || !hasPrimalEnergy(engine?.player)) return profile
  // 主专精决定超载的主要形态；副专精只增加一次有限回响，不生成第二终极。
  if (primary === 'gatling') profile.volleyBonus += Math.min(3, growth.concordEcho)
  if (primary === 'elemental') profile.elementalSpreadBonus += Math.min(0.25, growth.concordEcho * 0.06)
  if (primary === 'assassin') profile.assassinStealth += Math.min(0.8, 0.25 + growth.concordEcho * 0.08)
  if (primary === 'gluttony') {
    profile.biteDamageMul *= 1 + Math.min(0.18, growth.concordEcho * 0.06)
    profile.biteRangeMul *= 1 + Math.min(0.12, growth.concordEcho * 0.04)
  }
  if (primary === 'symbiosis') {
    profile.rallyDuration += Math.min(0.75, growth.concordEcho * 0.25)
    profile.rallyDamage += Math.min(0.12, growth.concordEcho * 0.04)
  }
  if (secondary) {
    const starter = {
      gluttony: 'glut_sub_armor', gatling: 'gat_sub_mag', elemental: 'ele_sub_aura',
      assassin: 'ass_sub_insight', symbiosis: 'sym_sub_echo',
    }[secondary]
    const rank = level(starter)
    if (rank > 0) profile.secondaryEcho = secondary
  }
  return profile
}

/** HUD 与主动说明共用实际超载效果，避免鼓舞继续承诺震荡半径。 */
export function primalOverloadDescription(engine) {
  const profile = getPrimalOverloadProfile(engine, true)
  const parts = []
  if (engine?.primarySpec === 'gluttony') parts.push(`重咬伤害 ×${(PRIMAL_BITE_OVERLOAD_DAMAGE * profile.biteDamageMul).toFixed(2)}、范围 ×${(PRIMAL_BITE_OVERLOAD_RANGE * profile.biteRangeMul).toFixed(2)}（仍需 1 猎食点）`)
  else if (engine?.primarySpec === 'symbiosis') parts.push(`鼓舞额外延长 ${PRIMAL_RALLY_OVERLOAD_DURATION + profile.rallyDuration} 秒、伙伴攻击加成额外 +${Math.round((PRIMAL_RALLY_OVERLOAD_DAMAGE + profile.rallyDamage) * 100)}%`)
  else parts.push(`半径 ×${(1.5 * profile.shockRangeMul).toFixed(2)}、伤害 ×${(2.5 * profile.shockDamageMul).toFixed(2)}、击退翻倍`)
  if (engine?.primarySpec === 'elemental') {
    const resonance = getOriginCoreResonance(engine)
    if (resonance) parts.push(`晶核共鸣：${resonance.icons.join('＋')} ${resonance.effect}`)
  }
  if (profile.volleyBonus > 0) parts.push(`齐射回响 +${profile.volleyBonus} 轮`)
  if (profile.elementalSpreadBonus > 0) parts.push(`元素扩散 +${Math.round(profile.elementalSpreadBonus * 100)}%`)
  if (profile.assassinStealth > 0) parts.push(`暗影隐匿 +${profile.assassinStealth.toFixed(2)} 秒`)
  if (profile.secondaryEcho) {
    const names = { gluttony: '暴食巨兽', gatling: '机枪风暴', elemental: '元素炼金', assassin: '暗影刺客', symbiosis: '共生伙伴' }
    const echo = {
      gluttony: '小范围脉冲（最多 3 个目标）',
      gatling: '再追加 1–2 轮齐射',
      elemental: '附魔扩散（最多 210px）',
      assassin: '短暂隐匿并保证下一击暴击',
      symbiosis: '共生脉冲（最多 5 个目标）',
    }[profile.secondaryEcho]
    parts.push(`副专精【${names[profile.secondaryEcho] || profile.secondaryEcho}】：${echo}`)
  }
  return parts.join('；')
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
 * 异源充能：每次有效伤害或专精机制事件结算调用一次。
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
  const growth = getOriginActiveGrowth(engine)
  const special = source === PRIMAL_SOURCES.MECHANISM || source === PRIMAL_SOURCES.SECONDARY
  const amount = foreign ? (special ? PRIMAL_GAIN_SPECIAL : PRIMAL_GAIN_FOREIGN) + growth.foreignBonus : PRIMAL_GAIN_SAME
  p.primalEnergy = Math.min(PRIMAL_ENERGY_MAX, p.primalEnergy + amount)
  engine.bossTomes?.onOriginGain(foreign, amount)
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

/** 主树机制和副树共鸣各自的结算入口；所有来源仍共用全局窗口节流。 */
export function gainOriginMechanism(engine, spec = engine?.primarySpec, now = engine?.elapsed ?? 0) {
  if (engine?.startingStrain !== 'origin' || !spec || spec !== engine?.primarySpec) return 0
  return gainPrimalEnergy(engine, PRIMAL_SOURCES.MECHANISM, now)
}

export function gainOriginSecondary(engine, spec = engine?.secondarySpec, now = engine?.elapsed ?? 0) {
  if (engine?.startingStrain !== 'origin' || !spec || spec !== engine?.secondarySpec) return 0
  return gainPrimalEnergy(engine, PRIMAL_SOURCES.SECONDARY, now)
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
  engine.bossTomes?.onOverload()
  return true
}
