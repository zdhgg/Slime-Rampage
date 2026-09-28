/**
 * 角色专属主动技能（F 键）定义表。
 *
 * 与 SkillPool 的分工：
 *  - SkillPool 的技能是「局内成长」，随等级累积、按树解锁；
 *  - 本表是「角色身份」，开局即有、与等级无关，每个角色恰有一个。
 * 因此这里不写 maxLevel / requires / tier，也不进升级面板候选池。
 *
 * 实现纪律：只调用引擎已有的公开方法（fire / _burst / _ring / _findNearest /
 * _explode / _startDevour），不新增战斗机制、不改任何伤害公式。
 * 暴食 F 的吞噬来源标记是唯一新增的上下文参数（见 GluttonResource.js 的来源护栏）。
 */

import {
  DEVOUR_SOURCE_GLUTTON,
  GLUTTON_BOSS_BITE_PCT,
  GLUTTON_BOSS_HITS_PER_CHARGE,
  GLUTTON_CHARGE_MAX,
  GLUTTON_DEVOURS_PER_CHARGE,
  GLUTTON_HUNT_RADIUS,
  collectGluttonHuntTargets,
  findGluttonBiteBoss,
  getGluttonBossBiteDamage,
  gluttonSkillHud,
  hasGluttonCharge,
  hasGluttonResource,
  isGluttonLocked,
  spendGluttonCharge,
} from './GluttonResource.js'

const VOLLEY_SHOTS = 4 // 弹射「疾射」的额外连射次数

/**
 * 暴食 · 贪食脉冲（资源型主动捕食 / Boss 暴食撕咬）：
 *
 * 猎食点来源：
 *  - 普通战斗：每 5 次**正常吞噬** +1 点；
 *  - Boss 战斗：每 10 次基础普攻命中 Boss（荒古领主觉醒为 8 次，深渊胃囊加速进度）+1 点；
 *  - 共同上限 2 点（见 GluttonResource.js）。
 *
 * F 消耗 1 点：
 *  - 普通/精英分支：把 320px 内所有处于主动捕食带 `(N, M]` 的猎物送进现有吞噬结算链
 *    （EnemyManager._startDevour → WeaponSystem.onDevoured，来源标记 gluttonF 不返充）；
 *  - Boss 分支（BITE5）：对 320px 内的 Boss 造成 5% 最大生命真实伤害（走 Boss.hit 路径，
 *    不秒杀、不给吞噬奖励、不返充；若已习得胃酸迸发则触发最多 4 发、0.5× 伤害、无毒的弱化喷酸）。
 *
 * 为什么没有 cooldown 字段：本技能不使用主冷却（旧版 10s 主冷却已删除）。
 * 唯一的节流是 0.3s「再次释放锁」，且它由 spendGluttonCharge 在**真正命中**
 * 时启动——空放既不扣点也不进锁（见 GameEngine._updateStrainSkill 的返回值约定）。
 */
export const GLUTTON_SKILL = {
  id: 'devour_pulse',
  name: '贪食脉冲',
  icon: '🍽️',
  cooldown: 0, // 资源型技能：无主冷却（HUD 改走 charge 口径）
  chargeMax: GLUTTON_CHARGE_MAX,
  desc: `每 ${GLUTTON_DEVOURS_PER_CHARGE} 次吞噬或 ${GLUTTON_BOSS_HITS_PER_CHARGE} 次命中首领 +1 猎食点（上限 ${GLUTTON_CHARGE_MAX}）；消耗 1 点主动捕食 ${GLUTTON_HUNT_RADIUS}px 内濒临吞噬线的敌人，或撕咬首领造成 ${Math.round(GLUTTON_BOSS_BITE_PCT * 100)}% 最大生命伤害`,
  /** HUD 口径：引擎把结果并进 cooldown 快照，HUD 据此渲染「猎食 ●○ n/5」 */
  getHud(player) {
    return gluttonSkillHud(player)
  },
  /**
   * @returns {boolean} true = 本次真的消耗了 1 点并发动；false = 空放（无合法目标）
   * 失败时资源与锁都不动，由引擎跳过冷却赋值。
   */
  use(engine) {
    const player = engine.player
    const list = engine.enemyManager?.enemies
    if (!player || !list) return false
    if (!hasGluttonResource(player) || !hasGluttonCharge(player) || isGluttonLocked(player)) {
      return false
    }

    // 1) 普通/精英分支：先找目标再扣点（320px 内处于主动捕食带 (N, M] 的猎物）
    // 资格口径唯一来源 = GluttonResource.canGluttonHunt（额外带上限 ceil(maxHp × (T + 0.05))）。
    const targets = collectGluttonHuntTargets(list, player)
    if (targets.length > 0) {
      if (!spendGluttonCharge(player)) return false

      // 贪食脉冲拉拽（保留原有表现）：把目标拽到贴身处，让随后的吸入动画连贯
      for (const e of targets) {
        const dx = player.x - e.x
        const dy = player.y - e.y
        const d = Math.hypot(dx, dy)
        if (d < 1) continue
        const pull = Math.max(0, d - (player.radius + 6))
        e.x += (dx / d) * pull
        e.y += (dy / d) * pull
      }
      engine.weaponSystem?._ring?.(player.x, player.y, '#8ae84a', GLUTTON_HUNT_RADIUS)
      engine.weaponSystem?._burst?.(player.x, player.y, 'knight', 14, false)
      engine.shakeScreen?.(3, 0.18)

      // 直接进入现有真实吞噬结算链：复用 _startDevour（含动画/标记/奖励结算），
      // 并显式标注来源为 gluttonF —— 该来源**不累加猎食点进度**（核心护栏）。
      const manager = engine.enemyManager
      for (const e of targets) {
        if (typeof manager._startDevour === 'function') {
          manager._startDevour(e, { source: DEVOUR_SOURCE_GLUTTON })
        } else {
          e.devouring = true // 引擎桩兜底：仍走同一套 WeaponSystem 结算
          engine.weaponSystem?.onDevoured?.(e, { source: DEVOUR_SOURCE_GLUTTON })
        }
      }
      return true
    }

    // 2) Boss 分支（BITE5）：无普通猎物时，对 320px 内的有效 Boss 发动暴食撕咬（一次 F 只走一个分支、只扣 1 点）
    const boss = findGluttonBiteBoss(list, player)
    if (boss) {
      if (!spendGluttonCharge(player)) return false
      const biteDamage = getGluttonBossBiteDamage(boss)
      boss.hit(biteDamage, null)
      if (!boss.active) {
        engine.weaponSystem?._onKill?.(boss)
      }
      engine.weaponSystem?._ring?.(boss.x, boss.y, '#ffd166', 70)
      engine.weaponSystem?._burstColor?.(boss.x, boss.y, '#ffd166', 18, true)
      engine.enemyManager?.addText?.(boss.x, boss.y - 40, `🦴 撕咬 -${biteDamage}`, null, '#ffd166', 18)
      engine.shakeScreen?.(4, 0.2)

      // E（腐殖喷吐弱化映射）：若已习得 glut_eruption，Boss 撕咬触发最多 4 发、0.5× 伤害、无毒 DOT 的酸弹
      if ((player.devourAcidSpray || 0) > 0) {
        engine.weaponSystem?.spawnDevourEruption?.(boss.x, boss.y, { bossBite: true })
      }
      return true
    }

    // 失败反馈保持轻量：不启动技能视觉，也不消耗资源
    engine.weaponSystem?._ring?.(player.x, player.y, '#8ae84a', 46)
    return false
  },
}

/**
 * 弹射 · 疾射：立刻追加一轮齐射，无需要求场上存在索敌目标之外的任何条件。
 * 复用 WeaponSystem.fire，因此弹数/分裂/附魔/视觉全部自动继承。
 */
export const RICOCHET_SKILL = {
  id: 'rapid_volley',
  name: '疾射',
  icon: '🔫',
  cooldown: 8,
  desc: `立刻追加 ${VOLLEY_SHOTS} 轮齐射`,
  use(engine) {
    const ws = engine.weaponSystem
    if (!ws) return
    for (let i = 0; i < VOLLEY_SHOTS; i++) {
      const target = ws._findNearest()
      if (!target) break
      ws.fire(target)
    }
    ws._ring?.(engine.player.x, engine.player.y, '#8ae8f7', 70)
  },
}

/**
 * 元素 · 原质释放：以本体为中心引爆一次元素冲击（复用 _explode，自动读取当前
 * 反应强度与附魔口径），并重置消化心跳——视觉上与「消化爆发」同源，
 * 让元素角色在拿到元素前也有一个可用的爆发按钮。
 */
export const ELEMENTAL_SKILL = {
  id: 'prime_burst',
  name: '原质释放',
  icon: '🔮',
  cooldown: 12,
  desc: '以本体为中心引爆元素冲击（伤害随当前攻击力与反应强度）',
  use(engine) {
    const ws = engine.weaponSystem
    if (!ws) return
    const player = engine.player
    const power = 2.4
    ws._explode(
      player.x,
      player.y,
      Math.round(ws.damage * ws.levelMul * power),
      null,
      150
    )
    ws._ring?.(player.x, player.y, '#a29bfe', 150)
    ws._burstColor?.(player.x, player.y, '#a29bfe', 18, true)
    engine.shakeScreen?.(4, 0.22)
  },
}

/**
 * 暗影 · 影袭：进入「下次命中必定暴击」状态。
 * 复用命中结算里已有的 player.guaranteedCrit 通道（WeaponSystem._resolveCollisions
 * 读取后立即消费），因此在专精觉醒前也完全可用。
 */
export const SHADOW_SKILL = {
  id: 'shadow_strike',
  name: '影袭',
  icon: '🗡️',
  cooldown: 7,
  desc: '下一次命中必定暴击',
  use(engine) {
    const player = engine.player
    player.guaranteedCrit = true
    engine.weaponSystem?._ring?.(player.x, player.y, '#ff5656', 80)
    engine.weaponSystem?._burstColor?.(player.x, player.y, '#ff5656', 14, true)
    engine.sound?.uiSelect?.()
  },
}
