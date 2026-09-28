/**
 * 暴食史莱姆 · 猎食点资源（暴食 F 主动捕食的正式机制）。
 *
 * 设计合同（已冻结）：
 *  - 每 5 次**正常吞噬** → +1 猎食点，最多储存 2 点；
 *  - F 消耗 1 点发动贪食脉冲，直接进入现有吞噬结算链，抢吞「已经贴到正常吞噬线、
 *    但还没跨过去」的猎物。额外带的上限口径 = `ceil(maxHp × (T + 0.05))`
 *    （见 gluttonHuntLimitHp；T 为该敌人真实的 `_devourThresh()`）；
 *  - **F 自身造成的吞噬不返充**——这是护栏，不是临时逻辑（前期消融已证明自返充
 *    会明显放大资源循环）。
 *
 * 为什么单独成模块而不是塞进 Player / GameEngine：
 * 它是「一个角色的一个资源」，三个字段 + 五个纯函数。放进 Player 会让角色专属
 * 语义污染通用实体，放进 GameEngine 会让 F 技能分支继续膨胀。这里保持最小，
 * 且所有函数都接收「玩家对象」而非引擎——因此引擎桩、单测桩都能直接复用。
 *
 * 资源状态存放在 **Player** 上（gluttonCharge / gluttonDevourProgress /
 * gluttonRecastLock，见 Player.js），本模块只提供口径与读写函数，不持有状态。
 */
import { NO_DEVOUR_TYPES } from './entities/Enemy.js'

/** 每积累多少次正常吞噬获得 1 点猎食点 */
export const GLUTTON_DEVOURS_PER_CHARGE = 5
/** Boss 普攻命中多少进度获得 1 点猎食点（默认阈值 H10） */
export const GLUTTON_BOSS_HITS_PER_CHARGE = 10
/** 荒古吞噬领主（glut_capstone）下 Boss 普攻进度阈值（C1） */
export const GLUTTON_BOSS_CAPSTONE_HITS_PER_CHARGE = 8
/** 深渊胃囊（glut_maw Lv.0~3）对小怪/精英普攻的伤害倍率 */
export const GLUTTON_MAW_DAMAGE_MULS = [1.0, 0.9, 0.8, 0.7]
/** 深渊胃囊（glut_maw Lv.0~3）对 Boss 普攻猎食进度的加速倍率（M2） */
export const GLUTTON_MAW_BOSS_PROGRESS_MULS = [1.0, 1.33, 1.66, 2.0]
/** Boss 撕咬（BITE5）造成的 Boss 最大生命比例伤害 */
export const GLUTTON_BOSS_BITE_PCT = 0.05
/** Boss 撕咬触发腐殖喷吐（E）的弹数上限 */
export const GLUTTON_BOSS_ERUPTION_MAX_SHOTS = 4
/** Boss 撕咬触发腐殖喷吐（E）的伤害倍率 */
export const GLUTTON_BOSS_ERUPTION_DAMAGE_MUL = 0.5
/** 猎食点储存上限 */
export const GLUTTON_CHARGE_MAX = 2
/** 再次释放锁（秒）：只防同帧/瞬时连点两次，**不是**技能主冷却 */
export const GLUTTON_RECAST_LOCK = 0.3
/** 贪食脉冲的主动捕食半径（px） */
export const GLUTTON_HUNT_RADIUS = 320
/**
 * 主动捕食带相对吞噬线的额外宽度（比例，不含 ceil 量化）。
 *
 * 正式口径（A）：主动捕食带上限 = `ceil(maxHp × (T + 0.05))`，T = `e._devourThresh()`。
 * 它**不等价于**「吞噬线上限 + 1 HP」：因为两侧都要过 ceil，maxHp 小时
 * `ceil(m × T)` 与 `ceil(m × (T + 0.05))` 会相等 → 该敌人不存在额外带。
 * 这是刻意的：额外带始终是吞噬线附近极窄的一段，宁可没有，也不凭空加宽。
 */
export const GLUTTON_HUNT_THRESHOLD_BONUS = 0.05
/** 吞噬来源标记：普通吞噬（含自动吞噬 / 荒古吞噬领主拉拽等全部既有来源） */
export const DEVOUR_SOURCE_NORMAL = 'normal'
/** 吞噬来源标记：暴食 F 主动捕食 */
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
 * 正常吞噬计入进度 → 满 5 次 +1 点（上限 2）。
 *
 * **满仓行为（明确固定，有测试）**：2 点已满时不再累计进度。
 * 理由——若继续累计并重置，就等价于在暗处存了「第三点」，与本轮「不要自行建立
 * 隐藏第三点」的约束直接冲突；冻结进度是唯一不会产生隐形储蓄的可观测行为。
 * F 主动捕食的吞噬**不会**调用本函数（见 GameEngine 的来源标记）。
 * @returns {boolean} 本次是否恰好获得 1 点（供飘字/反馈）
 */
export function onNormalDevoured(player) {
  if (!player || player.gluttonCharge < 0) return false
  if (player.gluttonCharge >= GLUTTON_CHARGE_MAX) return false
  player.gluttonDevourProgress += 1
  if (player.gluttonDevourProgress < GLUTTON_DEVOURS_PER_CHARGE) return false
  player.gluttonDevourProgress -= GLUTTON_DEVOURS_PER_CHARGE
  player.gluttonCharge += 1
  player.gluttonLastGainPulse = 0.6
  return true
}

/**
 * F 主动捕食的吞噬：**只保证不返充**，并显式保留独立入口，
 * 避免未来有人顺手把 F 的吞噬接回 onNormalDevoured。
 */
export function onGluttonFDevoured() {
  return false
}

/** 读取玩家当前的深渊胃囊（glut_maw）等级（0~3，唯一真源为 skillLevels.glut_maw）。 */
export function getGluttonMawLevel(player) {
  const raw = player?.game?.skillLevels?.glut_maw ?? player?.skillLevels?.glut_maw ?? 0
  return Math.max(0, Math.min(3, Number(raw) || 0))
}

/** 深渊胃囊对普通/精英怪普攻的伤害倍率（Lv.0~3 → 1.0 / 0.9 / 0.8 / 0.7）。 */
export function getGluttonMawDamageMultiplier(player) {
  return GLUTTON_MAW_DAMAGE_MULS[getGluttonMawLevel(player)] ?? 1.0
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

/** 计算 Boss 撕咬（BITE5）的基础真实伤害：`Math.max(1, Math.round(boss.maxHp * 0.05))`。 */
export function getGluttonBossBiteDamage(boss) {
  if (!boss || !(boss.maxHp > 0)) return 0
  return Math.max(1, Math.round(boss.maxHp * GLUTTON_BOSS_BITE_PCT))
}

/**
 * Boss 撕咬资格判定（与普通怪吞噬资格 canGluttonHunt 严格正交）：
 *  - Boss 永不可被 devour（canGluttonHunt 恒为 false）；
 *  - 但当玩家拥有猎食点（charge > 0）、未处于 0.3s 锁窗口、且 Boss 在 320px 内活跃时，
 *    Boss 可作为 F 的 Boss Bite 目标。
 */
export function canGluttonBiteBoss(e, player, radius = GLUTTON_HUNT_RADIUS) {
  if (!e || !e.active || !e.isBoss || e.devouring) return false
  if (!(e.hp > 0)) return false
  if (!hasGluttonResource(player) || !hasGluttonCharge(player) || isGluttonLocked(player)) {
    return false
  }
  const dx = player.x - e.x
  const dy = player.y - e.y
  const r2 = radius * radius
  return dx * dx + dy * dy <= r2
}

/** 在敌人列表中寻找距离玩家最近的可撕咬 Boss（320px 内）。 */
export function findGluttonBiteBoss(list, player, radius = GLUTTON_HUNT_RADIUS) {
  if (!list || !player) return null
  let best = null
  let bestD2 = radius * radius
  for (const e of list) {
    if (!canGluttonBiteBoss(e, player, radius)) continue
    const dx = player.x - e.x
    const dy = player.y - e.y
    const d2 = dx * dx + dy * dy
    if (d2 <= bestD2) {
      bestD2 = d2
      best = e
    }
  }
  return best
}

// ---------------------------------------------------------------
// 主动捕食资格（唯一口径：用敌人真实的普通吞噬线上限计算，不写死基础比例）
// ---------------------------------------------------------------

/**
 * 该敌人「真实正常吞噬线」对应的 HP 上限。
 *
 * 复用 Enemy 自己的 _devourThresh()：它已经包含了 devourThreshold（专精 glut_maw /
 * 觉醒会改写）、strainDevourBonus，以及普通/精英的分层宽度。因此这里读到的
 * 就是当前这一局、这一只敌人真正的正常吞噬线，而不是写死的 12%/38%。
 * 边界回退（测试桩/特殊实体没有该方法时）用 0，即「不存在 F 额外带」——宁可不给，
 * 也不给一个凭空放宽的资格。
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
 * F 主动捕食带的 HP 上限：`ceil(maxHp × (T + 0.05))`，T = 该敌人真实的 `_devourThresh()`。
 *
 * 与 devourLineHp 完全同源（都读 `_devourThresh()`），因此 glut_maw 专精、Lv.5 觉醒、
 * 贪噬血统 strainDevourBonus 与普通/精英分层都会自动跟随，不存在第二份写死的比例。
 *
 * 量化后果（已知、且被 verify-glutton.mjs 固定为契约）：
 *  - maxHp 较小时本函数可能**等于** devourLineHp → 资格带为空，该敌人永不构成 F 目标；
 *  - maxHp 较大时带宽才会 > 1 HP（例如 T=0.16、maxHp=100 时带宽为 5）。
 * 边界回退同 devourLineHp：读不到真实阈值时返回 0，即「不存在额外带」。
 */
export function gluttonHuntLimitHp(e) {
  if (!e || typeof e._devourThresh !== 'function') return 0
  const maxHp = e.maxHp || 0
  if (maxHp <= 0) return 0
  return Math.max(1, Math.ceil(maxHp * (e._devourThresh() + GLUTTON_HUNT_THRESHOLD_BONUS)))
}

/**
 * F 主动捕食资格：已经贴到正常吞噬线、但还没有跨过去的猎物。
 *
 * 条件：active / 非 Boss / 非 NO_DEVOUR_TYPES / 非 devouring / hp > 0 /
 *       devourLineHp < hp ≤ gluttonHuntLimitHp / 与玩家距离 ≤ 320px。
 *
 * 注意：**不要求 e.devourable === true**。F 的价值恰恰在于 devourable 尚未置位
 * （hp 高于吞噬线）时抢先吞掉它。
 *
 * 也注意：带宽由公式量化决定，**不是恒定的 1 HP**。当 `ceil(m × (T + 0.05)) == ceil(m × T)`
 * 时资格带为空，此时该敌人对 F 完全不可选——这是本口径的确定性行为，不是漏判。
 */
export function canGluttonHunt(e, player, radius = GLUTTON_HUNT_RADIUS) {
  if (!e || !e.active || e.isBoss || e.devouring) return false
  if (!isDevourableType(e.type)) return false
  if (!(e.hp > 0)) return false
  const line = devourLineHp(e)
  if (!(e.hp > line) || e.hp > gluttonHuntLimitHp(e)) return false
  const dx = player.x - e.x
  const dy = player.y - e.y
  const r2 = radius * radius
  return dx * dx + dy * dy <= r2
}

/** 列出本次 F 可以主动捕食的全部目标（320px 内全量，不抽样、不额外限个数）。 */
export function collectGluttonHuntTargets(list, player, radius = GLUTTON_HUNT_RADIUS) {
  const picked = []
  if (!list) return picked
  for (const e of list) {
    if (canGluttonHunt(e, player, radius)) picked.push(e)
  }
  return picked
}

/**
 * F 技能 HUD 口径（引擎 → cooldown 快照 → HudOverlay）。
 * progress 在满仓时冻结（见 onNormalDevoured），因此「满点」时显示满格而不是 0/5。
 */
export function gluttonSkillHud(player) {
  if (!hasGluttonResource(player)) return null
  return {
    mode: 'charge',
    charge: player.gluttonCharge,
    max: GLUTTON_CHARGE_MAX,
    progress: player.gluttonDevourProgress,
    progressPer: GLUTTON_DEVOURS_PER_CHARGE,
    ready: player.gluttonCharge > 0 && player.gluttonRecastLock <= 0,
    lock: Math.max(0, player.gluttonRecastLock),
  }
}
