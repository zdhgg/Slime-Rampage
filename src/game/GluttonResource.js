/** 暴食饱食槽：吞噬任何敌人（含猛扑吞噬）或近战命中首领积累饱食度，满槽爆发饱食酸浪并续航叠甲。 */
import { NO_DEVOUR_TYPES } from './entities/Enemy.js'

/** 触发饱食酸浪所需的饱食点 */
export const GLUTTON_SATIETY_MAX = 6
/** 饱食酸浪触发后的内置冷却（秒），防止同帧批量吞噬连续多次爆浪 */
export const GLUTTON_SATIETY_COOLDOWN = 1.5
/** 兼容旧引用口径 */
export const GLUTTON_DEVOURS_PER_CHARGE = GLUTTON_SATIETY_MAX
export const GLUTTON_CHARGE_MAX = GLUTTON_SATIETY_MAX
/** Boss 普攻命中多少进度折算 1 点饱食度 */
export const GLUTTON_BOSS_HITS_PER_SATIETY = 2
/** 荒古吞噬领主（glut_capstone）下 Boss 普攻饱食阈值 */
export const GLUTTON_BOSS_CAPSTONE_HITS_PER_SATIETY = 1.5
/** 深渊胃囊对吞噬/Boss 饱食获取的加速倍率 */
export const GLUTTON_MAW_SATIETY_MULS = [1, 1.25, 1.5, 1.75]
export const GLUTTON_MAW_BOSS_PROGRESS_MULS = [1, 1.3, 1.6, 2]
/**
 * 吞噬惯性（近战补偿·机制层）：捕食/咬杀后的短时移速，缩短两波猎物之间的
 * 纯跑路空窗。
 */
export const GLUTTON_FEAST_SPEED = 0.35
export const GLUTTON_FEAST_DURATION = 1.5
/** 吞噬来源标记：普通咬击/光环/反伤/自动吞噬 */
export const DEVOUR_SOURCE_NORMAL = 'normal'
/** 吞噬来源标记：暴食 空格 主动猛扑重咬 */
export const DEVOUR_SOURCE_GLUTTON = 'gluttonF'

/** 该敌人类型是否可以进入暴食的吞噬线（石造物/亡魂没有血肉）。战獒等活物可以。 */
export function isDevourableType(type) {
  return !NO_DEVOUR_TYPES.has(type)
}

/** 暴食饱食资源是否在该玩家身上启用（非暴食角色恒为 -1）。 */
export function hasGluttonResource(player) {
  return !!player && player.gluttonSatiety >= 0
}

/** 把暴食饱食进度/护甲/冷却归零（新局、restart、切换角色共用）。 */
export function resetGluttonResource(player) {
  if (!player) return
  player.gluttonSatiety = 0
  player.gluttonSatietyCooldown = 0
  player.gluttonSatietyBursts = 0
  player.gluttonBossHuntProgress = 0
  player.gluttonLastGainPulse = 0
  player.gluttonCharge = 0
  player.gluttonDevourProgress = 0
  player.gluttonRecastLock = 0
}

/** 非暴食角色：显式置 -1 作为「无此资源」哨兵，不拥有也不显示暴食状态。 */
export function disableGluttonResource(player) {
  if (!player) return
  resetGluttonResource(player)
  player.gluttonSatiety = -1
  player.gluttonCharge = -1
}

/** 推进饱食冷却与动画脉冲（每帧调用）。 */
export function tickGluttonResource(player, dt) {
  if (!hasGluttonResource(player)) return
  if (player.gluttonSatietyCooldown > 0) player.gluttonSatietyCooldown = Math.max(0, player.gluttonSatietyCooldown - dt)
  if (player.gluttonLastGainPulse > 0) player.gluttonLastGainPulse = Math.max(0, player.gluttonLastGainPulse - dt)
}

/** 读取玩家当前的深渊胃囊等级；高难与无尽可继续成长。 */
export function getGluttonMawLevel(player) {
  const raw = player?.game?.skillLevels?.glut_maw ?? player?.skillLevels?.glut_maw ?? 0
  return Math.max(0, Math.floor(Number(raw) || 0))
}

export function getGluttonMawDevourProgressMultiplierAtLevel(level = 0) {
  const rank = Math.max(0, Math.floor(Number(level) || 0))
  return rank <= 3 ? GLUTTON_MAW_SATIETY_MULS[rank] : 1.75 + Math.min(0.45, (rank - 3) * 0.06)
}

export function getGluttonMawBossProgressMultiplierAtLevel(level = 0) {
  const rank = Math.max(0, Math.floor(Number(level) || 0))
  return rank <= 3 ? GLUTTON_MAW_BOSS_PROGRESS_MULS[rank] : 2 + Math.min(0.4, (rank - 3) * 0.06)
}

export function getGluttonMawDevourProgressMultiplier(player) {
  return getGluttonMawDevourProgressMultiplierAtLevel(getGluttonMawLevel(player))
}

export function getGluttonBossProgressMultiplier(player) {
  return getGluttonMawBossProgressMultiplierAtLevel(getGluttonMawLevel(player))
}

export function getGluttonBossProgressThreshold(player) {
  const hasCapstone =
    !!player?.isGluttonyLord || (player?.game?.skillLevels?.glut_capstone || 0) > 0
  return hasCapstone ? GLUTTON_BOSS_CAPSTONE_HITS_PER_SATIETY : GLUTTON_BOSS_HITS_PER_SATIETY
}

/**
 * 增加暴食饱食度，达到阈值且冷却就绪时触发「饱食酸浪」。
 * 溢出点数保留有限余数（不超过阈值 1.5 倍），避免同帧无限连爆。
 * @returns {boolean} 是否已准备好释放一次饱食酸浪
 */
export function gainGluttonSatiety(player, amount = 1) {
  if (!hasGluttonResource(player) || !(amount > 0)) return false
  const next = Math.min(GLUTTON_SATIETY_MAX * 1.5, (player.gluttonSatiety || 0) + amount)
  player.gluttonSatiety = Number(next.toFixed(6))
  player.gluttonLastGainPulse = 0.45
  if (player.gluttonSatiety >= GLUTTON_SATIETY_MAX && (player.gluttonSatietyCooldown || 0) <= 0) {
    player.gluttonSatiety = Number((player.gluttonSatiety - GLUTTON_SATIETY_MAX).toFixed(6))
    player.gluttonSatietyCooldown = GLUTTON_SATIETY_COOLDOWN
    player.game?.weaponSystem?.gluttonCombat?.queueSatietyBurst?.()
    return true
  }
  return false
}

/**
 * 正常吞噬计入饱食度（普通 +1、精英 +2，吃深渊胃囊倍率）。
 * @returns {boolean} 本次是否恰好触发一次饱食酸浪
 */
export function onNormalDevoured(player, enemy = null) {
  if (!hasGluttonResource(player)) return false
  const base = enemy?.isElite ? 2 : 1
  return gainGluttonSatiety(player, base * getGluttonMawDevourProgressMultiplier(player))
}

/**
 * 暴食猛扑吞噬同样计入饱食度（普通 +1、精英 +2），让主动冲怪堆收割直接汇入饱食酸浪正循环。
 * @returns {boolean} 本次是否恰好触发一次饱食酸浪
 */
export function onGluttonFDevoured(player, enemy = null) {
  return onNormalDevoured(player, enemy)
}

/**
 * 暴食普攻命中 Boss 时累计 Boss 饱食进度；每满阈值转化为 1 点饱食度。
 * @returns {boolean} 本次命中是否转化为 1 点饱食度
 */
export function onGluttonBossBasicHit(player, target) {
  if (!hasGluttonResource(player)) return false
  if (!target || !target.isBoss) return false
  const mul = getGluttonBossProgressMultiplier(player)
  const threshold = getGluttonBossProgressThreshold(player)
  player.gluttonBossHuntProgress = Number(((player.gluttonBossHuntProgress || 0) + mul).toFixed(6))
  if (player.gluttonBossHuntProgress < threshold) return false
  let gained = 0
  while (player.gluttonBossHuntProgress >= threshold) {
    player.gluttonBossHuntProgress = Number((player.gluttonBossHuntProgress - threshold).toFixed(6))
    gained += 1
  }
  gainGluttonSatiety(player, gained)
  return true
}

/** 该敌人「真实正常吞噬线」对应的 HP 上限。 */
export function devourLineHp(e) {
  if (!e || typeof e._devourThresh !== 'function') return 0
  const maxHp = e.maxHp || 0
  if (maxHp <= 0) return 0
  return Math.max(1, Math.ceil(maxHp * e._devourThresh()))
}

/** 普通吞噬线的可吞噬判定。 */
export function canDevourNow(e) {
  if (!e || e.isBoss) return false
  if (!isDevourableType(e.type)) return false
  if (!(e.hp > 0)) return false
  return e.hp <= devourLineHp(e)
}

/** 暴食饱食与护甲状态快照（冷却/状态面板用；空格技能已转为标准冷却）。 */
export function gluttonSkillHud(player) {
  if (!hasGluttonResource(player)) return null
  const combat = player.game?.weaponSystem?.gluttonCombat
  return {
    mode: 'satiety',
    satiety: Math.round((player.gluttonSatiety || 0) * 10) / 10,
    satietyMax: GLUTTON_SATIETY_MAX,
    bursts: player.gluttonSatietyBursts || 0,
    guard: player.gluttonGuard || 0,
    guardMax: combat?.guardMax || 2,
    guardTimer: Math.max(0, player.gluttonGuardTimer || 0),
    followup: !!combat?.canPounceFollowup,
    auraRadius: Math.round(combat?.auraRadius?.() || 84),
    counterCd: Math.max(0, player.gluttonCounterCooldown || 0),
    bossProgress: Math.round((player.gluttonBossHuntProgress || 0) * 10) / 10,
    bossProgressPer: getGluttonBossProgressThreshold(player),
  }
}
