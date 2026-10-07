/** 暴食猎食点：正常吞噬或近战命中首领充能；空格 重咬只消耗，不返充。 */
import { NO_DEVOUR_TYPES } from './entities/Enemy.js'

/** 每积累多少次正常吞噬获得 1 点猎食点 */
export const GLUTTON_DEVOURS_PER_CHARGE = 5
/** Boss 普攻命中多少进度获得 1 点猎食点（默认阈值 H10） */
export const GLUTTON_BOSS_HITS_PER_CHARGE = 10
/** 荒古吞噬领主（glut_capstone）下 Boss 普攻进度阈值（C1） */
export const GLUTTON_BOSS_CAPSTONE_HITS_PER_CHARGE = 8
/** 胃囊提高资源获取效率，保留攻击成长。 */
export const GLUTTON_MAW_BOSS_PROGRESS_MULS = [1, 1.33, 1.66, 2]
export const GLUTTON_MAW_DEVOUR_PROGRESS_MULS = [1, 1.2, 1.4, 1.6]
/** 猎食点储存上限 */
export const GLUTTON_CHARGE_MAX = 2
/** 再次释放锁（秒）：只防同帧/瞬时连点两次，**不是**技能主冷却 */
export const GLUTTON_RECAST_LOCK = 0.3
/** 吞噬来源标记：普通咬击、冲撞和自动吞噬。 */
export const DEVOUR_SOURCE_NORMAL = 'normal'
/** 吞噬来源标记：暴食 空格 主动捕食 */
export const DEVOUR_SOURCE_GLUTTON = 'gluttonF'

/** 该敌人类型是否可以进入暴食的吞噬线（石造物/亡魂没有血肉）。战獒等活物可以。
 *  直接复用 Enemy.js 的同一份集合，杜绝两处口径漂移。 */
export function isDevourableType(type) {
  return !NO_DEVOUR_TYPES.has(type)
}

/** 暴食资源是否在该玩家身上启用（非暴食角色恒为 -1，不拥有也不显示猎食点）。 */
export function hasGluttonResource(player) {
  return !!player && player.gluttonCharge >= 0
}

/** 把猎食点/进度/再次释放锁归零（新局、restart、切换角色共用）。 */
export function resetGluttonResource(player) {
  if (!player) return
  player.gluttonCharge = 0
  player.gluttonDevourProgress = 0
  player.gluttonBossHuntProgress = 0
  player.gluttonRecastLock = 0
  player.gluttonLastGainPulse = 0
}

/**
 * 非暴食角色：本局不拥有猎食点，且不得残留上一局/上一角色的数值。
 * 用 -1 作为「无此资源」的显式哨兵，HUD 与技能分支都读得到同一个事实。
 */
export function disableGluttonResource(player) {
  if (!player) return
  resetGluttonResource(player)
  player.gluttonCharge = -1
}

/** 推进再次释放锁（每帧调用；无资源时短路，不影响其它角色）。 */
export function tickGluttonResource(player, dt) {
  if (player.gluttonCharge < 0) return
  if (player.gluttonRecastLock > 0) player.gluttonRecastLock = Math.max(0, player.gluttonRecastLock - dt)
  if (player.gluttonLastGainPulse > 0) player.gluttonLastGainPulse = Math.max(0, player.gluttonLastGainPulse - dt)
}

/** 是否有可用的猎食点。 */
export function hasGluttonCharge(player) {
  return !!player && player.gluttonCharge > 0
}

/** 是否处于再次释放锁窗口内（窗口内不扣点、不施放；供测试与 HUD 查询用）。 */
export function isGluttonLocked(player) {
  return !player || player.gluttonRecastLock > 0
}

/**
 * 消耗 1 点猎食点并启动再次释放锁。
 * @returns {boolean} 是否真的消耗（点数不足返回 false，调用方据此空放）
 */
export function spendGluttonCharge(player) {
  if (!hasGluttonCharge(player)) return false
  player.gluttonCharge -= 1
  player.gluttonRecastLock = GLUTTON_RECAST_LOCK
  return true
}

/**
 * 正常吞噬计入进度（胃囊加速）→ 满 5 进度 +1 点（上限 2）。
 *
 * **满仓行为（明确固定，有测试）**：2 点已满时不再累计进度。
 * 理由——若继续累计并重置，就等价于在暗处存了「第三点」，与本轮「不要自行建立
 * 隐藏第三点」的约束直接冲突；冻结进度是唯一不会产生隐形储蓄的可观测行为。
 * 空格 重咬及其酸爆触发的自动吞噬不调用本函数。
 * @returns {boolean} 本次是否恰好获得 1 点（供飘字/反馈）
 */
export function onNormalDevoured(player) {
  if (!player || player.gluttonCharge < 0) return false
  if (player.gluttonCharge >= GLUTTON_CHARGE_MAX) return false
  player.gluttonDevourProgress = Number((player.gluttonDevourProgress + GLUTTON_MAW_DEVOUR_PROGRESS_MULS[getGluttonMawLevel(player)]).toFixed(6))
  if (player.gluttonDevourProgress < GLUTTON_DEVOURS_PER_CHARGE) return false
  player.gluttonDevourProgress = Number((player.gluttonDevourProgress - GLUTTON_DEVOURS_PER_CHARGE).toFixed(6))
  player.gluttonCharge += 1
  player.gluttonLastGainPulse = 0.6
  return true
}

/**
 * 空格 主动捕食的吞噬：**只保证不返充**，并显式保留独立入口，
 * 避免未来有人顺手把 空格 的吞噬接回 onNormalDevoured。
 */
export function onGluttonFDevoured() {
  return false
}

/** 读取玩家当前的深渊胃囊（glut_maw）等级（0~3，唯一真源为 skillLevels.glut_maw）。 */
export function getGluttonMawLevel(player) {
  const raw = player?.game?.skillLevels?.glut_maw ?? player?.skillLevels?.glut_maw ?? 0
  return Math.max(0, Math.min(3, Number(raw) || 0))
}

/** 深渊胃囊对 Boss 普攻猎食进度的加速倍率（M2：Lv.0~3 → 1.0 / 1.33 / 1.66 / 2.0）。 */
export function getGluttonBossProgressMultiplier(player) {
  return GLUTTON_MAW_BOSS_PROGRESS_MULS[getGluttonMawLevel(player)] ?? 1.0
}

/** Boss 普攻猎食进度阈值（默认 10；已学 glut_capstone 降为 8）。 */
export function getGluttonBossProgressThreshold(player) {
  const hasCapstone =
    !!player?.isGluttonyLord || (player?.game?.skillLevels?.glut_capstone || 0) > 0
  return hasCapstone ? GLUTTON_BOSS_CAPSTONE_HITS_PER_CHARGE : GLUTTON_BOSS_HITS_PER_CHARGE
}

/**
 * 暴食普攻命中 Boss 时累计 Boss 猎食进度（H10 + M2 + C1）。
 *  - 仅暴食角色生效；
 *  - 仅目标为 Boss（target.isBoss === true）生效；
 *  - 满仓（gluttonCharge >= 2）时不再隐藏累计第三点；
 *  - 达到阈值后 gluttonCharge += 1（上限 2），progress 减去 threshold 并保留小数余数。
 * @returns {boolean} 本次命中是否恰好生成 1 点猎食点
 */
export function onGluttonBossBasicHit(player, target) {
  if (!hasGluttonResource(player)) return false
  if (!target || !target.isBoss) return false
  if (player.gluttonCharge >= GLUTTON_CHARGE_MAX) return false
  const mul = getGluttonBossProgressMultiplier(player)
  const threshold = getGluttonBossProgressThreshold(player)
  player.gluttonBossHuntProgress = Number(
    ((player.gluttonBossHuntProgress || 0) + mul).toFixed(6)
  )
  if (player.gluttonBossHuntProgress < threshold) return false
  player.gluttonBossHuntProgress = Math.max(
    0,
    Number((player.gluttonBossHuntProgress - threshold).toFixed(6))
  )
  player.gluttonCharge = Math.min(GLUTTON_CHARGE_MAX, player.gluttonCharge + 1)
  player.gluttonLastGainPulse = 0.6
  return true
}

/**
 * 该敌人「真实正常吞噬线」对应的 HP 上限。
 *
 * 复用 Enemy 自己的 _devourThresh()：它已经包含了 devourThreshold（专精 glut_maw /
 * 觉醒会改写）、strainDevourBonus，以及普通/精英的分层宽度。因此这里读到的
 * 就是当前这一局、这一只敌人真正的正常吞噬线，而不是写死的 12%/38%。
 * 测试桩或特殊实体没有阈值方法时返回 0。
 */
export function devourLineHp(e) {
  if (!e || typeof e._devourThresh !== 'function') return 0
  const maxHp = e.maxHp || 0
  if (maxHp <= 0) return 0
  return Math.max(1, Math.ceil(maxHp * e._devourThresh()))
}

/** 普通吞噬线的可吞噬判定（与 Enemy.hit 里的标记条件同源，供测试与查询使用）。 */
export function canDevourNow(e) {
  if (!e || e.isBoss) return false
  if (!isDevourableType(e.type)) return false
  if (!(e.hp > 0)) return false
  return e.hp <= devourLineHp(e)
}

/**
 * 空格 技能 HUD 口径（引擎 → cooldown 快照 → HudOverlay）。
 * progress 在满仓时冻结（见 onNormalDevoured），因此「满点」时显示满格而不是 0/5。
 */
export function gluttonSkillHud(player) {
  if (!hasGluttonResource(player)) return null
  return {
    mode: 'charge',
    charge: player.gluttonCharge,
    max: GLUTTON_CHARGE_MAX,
    progress: Math.round(player.gluttonDevourProgress * 10) / 10,
    bossProgress: Math.round((player.gluttonBossHuntProgress || 0) * 10) / 10,
    bossProgressPer: getGluttonBossProgressThreshold(player),
    devourGain: GLUTTON_MAW_DEVOUR_PROGRESS_MULS[getGluttonMawLevel(player)],
    bossGain: getGluttonBossProgressMultiplier(player),
    progressPer: GLUTTON_DEVOURS_PER_CHARGE,
    ready: player.gluttonCharge > 0 && player.gluttonRecastLock <= 0,
    lock: Math.max(0, player.gluttonRecastLock),
  }
}
