import { canOriginOverload, trySpendOriginOverload, tickOriginCombatFlow } from './PrimalEnergy.js'
import { ORIGIN_OVERLOAD_RULES, nextOriginCast, originComboEntries, originComboState } from './OriginSourceSkills.js'
import { drawOriginAuxiliary } from './OriginCombo.js'
import { triggerOriginMarkEcho } from './OriginEchoes.js'
import { getOriginGrowth } from './OriginBuild.js'
import { createOriginInjectionToken } from './OriginInjection.js'

/**
 * 被动源质超载控制器（原生黏液独占）。
 *
 * 超载与黏液震荡完全解耦：由异源能量驱动、无按键、自动释放。
 * 放在 WeaponSystem.update 末尾——所有命中/击杀结算完成后才检查触发，
 * 充能本身不会同步引发释放，也不会在击杀过程中递归触发新攻击。
 *
 * 支付时序：进入启动只「预约」（锁状态防重入，不扣能量）；
 * 启动表现结束后重新校验目标与能量，确认能释放才扣费。
 */
export class OriginOverload {
  constructor(weapon) {
    this.weapon = weapon
    this.reset()
  }

  get game() { return this.weapon?.game }
  get player() { return this.weapon?.player }
  get enabled() { return this.game?.startingStrain === 'origin' }

  reset() {
    this.state = 'charging' // charging | windup
    this.windup = 0
    this.cooldown = 0
    this.retry = 0
    this.pending = null
    this.targetWait = 0
    this.auxiliary = null
  }

  /** 共振路线的超载节奏优势：更短冷却（数值见 OriginSourceSkills.ORIGIN_OVERLOAD_RULES）。 */
  cooldownFor() {
    return this.game?.originRoute === 'resonance'
      ? ORIGIN_OVERLOAD_RULES.resonanceCooldown
      : ORIGIN_OVERLOAD_RULES.cooldown
  }

  update(dt) {
    if (!this.enabled) return
    const p = this.player
    if (!p || p.dead || this.game?.runFinished) {
      this.reset()
      return
    }
    // 战斗涌流：附近有敌人时缓慢充能，保证 Lv.1~4 也有完整的超载循环。
    tickOriginCombatFlow(this.game, dt)
    if (this.auxiliary) {
      this.auxiliary.delay -= dt
      if (this.auxiliary.delay <= 0) {
        const pending = this.auxiliary
        this.auxiliary = null
        const entries = originComboEntries(this.game)
        const state = originComboState(this.game)
        const id = drawOriginAuxiliary(pending.selection, candidate =>
          !pending.used.includes(candidate) && this.weapon.originSourceCombat?.hasTargetsFor(entries.find(entry => entry.id === candidate)))
        if ((state.revision || 0) === pending.revision) state.bag = [...pending.selection.bag]
        const entry = entries.find(item => item.id === id)
        if (entry) this.weapon.originSourceCombat.castNow(entry, pending.snapshot,
          { secondary: true, scale: pending.third ? 0.4 : 0.6, category: pending.third ? 'third' : 'auxiliary', token: pending.token })
        if (entry) pending.used.push(entry.id)
        if (!pending.third && pending.triple && entry) this.auxiliary = { ...pending, delay: 0.35, third: true }
      }
    }

    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt)
    if (this.retry > 0) this.retry = Math.max(0, this.retry - dt)

    if (this.state === 'windup') {
      this.windup -= dt
      if (this.windup > 0) return
      this.state = 'charging'
      const pending = this.pending
      this.pending = null
      this._commit(pending)
      return
    }

    if (this.cooldown > 0) return
    if (this.targetWait > 0) this.targetWait += dt
    if (this.retry > 0) return
    if (!canOriginOverload(p)) return
    // 只有能量与冷却都就绪时才执行目标搜索，不做逐帧扫描。
    let next = nextOriginCast(this.game)
    if (!next) return
    if (!this.weapon.originSourceCombat?.hasTargetsFor(next)) {
      if (!this.targetWait) this.targetWait = dt || 0.001
      const equipped = originComboState(this.game).equipped
      const alternatives = this.targetWait >= 2 ? originComboEntries(this.game)
        .filter(entry => entry.id !== next.id && equipped.includes(entry.id))
        .map(entry => ({ ...entry, fallback: true })) : []
      next = alternatives.find(entry => this.weapon.originSourceCombat?.hasTargetsFor(entry))
      if (!next) {
        this.retry = ORIGIN_OVERLOAD_RULES.retryDelay
        return
      }
    } else {
      this.targetWait = 0
    }
    this.state = 'windup'
    this.windup = ORIGIN_OVERLOAD_RULES.windup
    this.pending = next
  }

  /**
   * 启动结束后的确认释放：
   * 校验 → 快照路线状态 → 扣费 → 秘典 → 释放 → 印记回响 → 进入冷却。
   */
  _commit(next) {
    const p = this.player
    const cs = this.weapon.originSourceCombat
    if (!cs || p.dead || this.game?.runFinished) return
    if (!next) next = nextOriginCast(this.game)
    if (!next || !cs.hasTargetsFor(next) || !canOriginOverload(p)) {
      // 目标在启动期间消失/能量异常：保留能量与轮换位，稍后重试。
      this.retry = ORIGIN_OVERLOAD_RULES.retryDelay
      return
    }
    const snapshot = cs.snapshot()
    if (!trySpendOriginOverload(this.game, { id: next.id })) {
      this.retry = ORIGIN_OVERLOAD_RULES.retryDelay
      return
    }
    const token = createOriginInjectionToken(this.game)
    const info = cs.castNow(next, snapshot, { token })
    if (!info) {
      // 极端情况：扣费后未能释放（等级失效等），短冷却后重试，不退款。
      this.cooldown = 1
      return
    }
    this.weapon.originCombat?.applyRiders(null, 0, 1, true, true)
    const motility = getOriginGrowth(this.game).motilityBonus
    if (motility > 0) {
      p.originMoveBuff = Math.max(p.originMoveBuff || 0, motility)
      p.originMoveBuffTimer = Math.max(p.originMoveBuffTimer || 0, 1.5)
    }
    // 超载印记回响：每次超载最多一次，预算基准为本次技能的乘区倍率。
    triggerOriginMarkEcho(this.game, { overloaded: true, center: p, profile: info.profile })
    this.cooldown = this.cooldownFor()
    const tripleEnabled = (this.game.skillLevels?.origin_multicast || 0) > 0
    const count = tripleEnabled ? ((this.game.originTripleCount || 0) + 1) % 3 : 0
    this.game.originTripleCount = count
    const selection = originComboState(this.game)
    this.auxiliary = { delay: 0.35, snapshot, token, used: [next.id], triple: tripleEnabled && count === 0,
      selection: { ...selection, equipped: [...selection.equipped], bag: [...selection.bag] }, revision: selection.revision || 0 }
    this.targetWait = 0
  }

  /** HUD 快照：状态、剩余冷却、下一次释放预告。 */
  hud() {
    const p = this.player
    return {
      state: this.state === 'windup' ? 'windup'
        : this.cooldown > 0 ? 'cooldown'
        : this.retry > 0 ? 'waiting'
        : canOriginOverload(p) ? 'ready' : 'charging',
      cooldown: this.cooldown,
      cooldownMax: this.cooldownFor(),
      windup: this.windup,
      windupMax: ORIGIN_OVERLOAD_RULES.windup,
    }
  }
}
