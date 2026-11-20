export const SHADOW_SHIELD_BASE_CAPACITY = 1
export const SHADOW_SHIELD_BASE_COOLDOWN = 9.0
export const SHADOW_SHIELD_MIN_COOLDOWN = 3.5
export const SHADOW_SHIELD_INVINCIBLE = 0.25
export const SHADOW_SHIELD_CRIT_GAIN = 0.6
export const SHADOW_SHIELD_CRIT_ICD = 0.4
export const SHADOW_SHIELD_EVADE_GAIN = 2.5
export const SHADOW_SHIELD_KILL_GAIN = 2.0
export const SHADOW_SHIELD_WARD_ICD = 0.5

/**
 * 暗影专属「影织魔盾」（纯法术魔盾）：
 *  - 只抵挡法术攻击（法师法球、炼金毒瓶落地伤害、Boss 法术弹幕与法术强招），
 *    物理箭矢与近战攻击仍由被动闪避与分身拦截应对；
 *  - 按层充能（最多 3 层），支持暴击、闪避、远程击杀与分身共鸣加速充能；
 *  - 成功挡法后立刻获得短时护体虚化与噬法反制（下次本体攻击必暴 + 短暂加速）。
 */
export class ShadowShield {
  constructor(combat) {
    this.combat = combat
    this.reset(false)
  }

  get player() { return this.combat.player }
  get game() { return this.combat.weapon?.game }

  get capacity() {
    const ward = this.combat.wardLevel || 0
    return SHADOW_SHIELD_BASE_CAPACITY + (ward >= 1 ? 1 : 0) + (ward >= 3 ? 1 : 0)
  }

  get cooldown() {
    const ward = this.combat.wardLevel || 0
    if (ward <= 0) return SHADOW_SHIELD_BASE_COOLDOWN
    if (ward === 1) return 7.5
    if (ward === 2) return 6.5
    if (ward === 3) return 5.5
    return Math.max(SHADOW_SHIELD_MIN_COOLDOWN, 5.5 - (ward - 3) * 0.25)
  }

  get rechargeHaste() {
    const p = this.player
    const stride = this.combat.strideLevel || 0
    const strideHaste = stride <= 3 ? stride * 0.10 : 0.30 + (stride - 3) * 0.06
    const overflowHaste = (p?.evasionOverflow || 0) * 2.5
    const clones = this.combat.clones?.items?.length || 0
    const legionBonus = (p?.shadowCloneCapLevel || 0) >= 2 ? 0.15 : (p?.shadowCloneCapLevel || 0) >= 1 ? 0.10 : 0.05
    const bulwark = this.combat.swarmBulwarkLevel || 0
    const bulwarkPerClone = bulwark > 0 ? ([0, 0.12, 0.16, 0.20, 0.25][Math.min(4, bulwark)] || 0.25) : 0
    const cloneHaste = clones * (legionBonus + bulwarkPerClone)
    const domainHaste = this.combat.inDomain ? 0.35 : 0
    return 1 + strideHaste + overflowHaste + cloneHaste + domainHaste
  }

  reset(full = false) {
    this.charges = full ? this.capacity : 0
    this.recharge = 0
    this.flash = 0
    this.critIcd = 0
    this.wardCloneIcd = 0
    this.previousCapacity = this.capacity
  }

  upgrade() {
    const nextCap = this.capacity
    const delta = Math.max(0, nextCap - (this.previousCapacity || SHADOW_SHIELD_BASE_CAPACITY))
    if (delta > 0) this.charges = Math.min(nextCap, this.charges + delta)
    this.previousCapacity = nextCap
  }

  /** 主动加速充能（秒）：用于暴击、闪避、击杀远程或横斩破法。 */
  accelerate(seconds) {
    if (!this.combat.available || !(seconds > 0)) return false
    const cap = this.capacity
    if (this.charges >= cap) {
      this.recharge = 0
      return false
    }
    this.recharge += seconds
    let gained = false
    const interval = this.cooldown
    while (this.recharge >= interval && this.charges < cap) {
      this.recharge -= interval
      this.charges += 1
      this.flash = 0.32
      gained = true
    }
    if (this.charges >= cap) this.recharge = 0
    return gained
  }

  grantLayer({ counterBuff = true } = {}) {
    if (!this.combat.available) return false
    const p = this.player
    if (this.charges < this.capacity) {
      this.charges += 1
      if (this.charges >= this.capacity) this.recharge = 0
      this.flash = 0.32
      this.combat.weapon?._ring?.(p.x, p.y, '#9c88ff', p.radius + 14)
      return true
    }
    if (counterBuff) {
      p.guaranteedCrit = true
      p.shadowSpellCounterTimer = Math.max(p.shadowSpellCounterTimer || 0, 1.5)
    }
    return false
  }

  onCritical() {
    if (!this.combat.available || this.critIcd > 0 || this.charges >= this.capacity) return false
    this.critIcd = SHADOW_SHIELD_CRIT_ICD
    return this.accelerate(SHADOW_SHIELD_CRIT_GAIN)
  }

  onEvade() {
    if (!this.combat.available || this.charges >= this.capacity) return false
    const cloakBonus = this.game?.bossTomes?.rank?.('shadow_cloak') === 3 ? 1.0 : 0
    return this.accelerate(SHADOW_SHIELD_EVADE_GAIN + cloakBonus)
  }

  onRangedKill() {
    if (!this.combat.available || this.charges >= this.capacity) return false
    return this.accelerate(SHADOW_SHIELD_KILL_GAIN)
  }

  /** 仅吸收敌方带有 spellAttack 标记的法术攻击；一次完整抵挡 1 次法术命中。 */
  absorb(damage, attack) {
    const s = this.combat
    if (!s.available || !attack?.enemyAttack || !attack?.spellAttack || this.charges <= 0 || !(damage > 0)) {
      return damage
    }
    const p = this.player
    this.charges -= 1
    this.flash = 0.35
    p.invincible = Math.max(p.invincible, SHADOW_SHIELD_INVINCIBLE)

    // 噬法蓄能：成功挡下法术后下次攻击必暴并短暂提速
    p.guaranteedCrit = true
    p.shadowSpellCounterTimer = Math.max(p.shadowSpellCounterTimer || 0, 2.0)

    const ward = s.wardLevel || 0
    if (ward >= 1) {
      const cdRefund = ward >= 3 ? 1.5 : 1.0
      if (p.strainSkillCd > 0) p.strainSkillCd = Math.max(0, p.strainSkillCd - cdRefund)
      if (this.wardCloneIcd <= 0) {
        this.wardCloneIcd = SHADOW_SHIELD_WARD_ICD
        s.clones?.spawnCounterClone?.()
      }
      if (ward >= 4) {
        const pulseRadius = 115
        const pulseDmg = 1.1 + (ward - 4) * 0.2
        for (const e of [...(s.weapon.enemyManager?.enemies || [])]) {
          if (!s.available) break
          if (!e?.active || e.devouring || e.hp <= 0) continue
          if (Math.hypot(e.x - p.x, e.y - p.y) <= pulseRadius + (e.radius || 0)) {
            s.hit(e, pulseDmg, { secondary: true, angle: Math.atan2(e.y - p.y, e.x - p.x) })
          }
        }
        s.weapon._ring?.(p.x, p.y, '#78e8ff', pulseRadius)
      }
    }

    if (s.route === 'blade' && (s.bladeRiposteLevel || 0) > 0) {
      s.triggerRiposte?.()
    }
    s.onSoulDefend?.(attack)

    const stats = s.weapon.stats
    stats.shadowShieldBlocks = (stats.shadowShieldBlocks || 0) + 1
    const broken = this.charges <= 0
    s.weapon._ring?.(p.x, p.y, broken ? '#78e8ff' : '#a78bfa', p.radius + 16)
    s.game.enemyManager?.addText?.(
      p.x, p.y - 40,
      broken ? '暗幕破法' : ward > 0 ? '噬法反制' : '魔盾抵挡',
      null, broken ? '#78e8ff' : '#c4b5fd', 14
    )
    s.game.sound?.spellShield?.(broken)
    s.game._pushCooldown?.()
    return 0
  }

  update(dt) {
    this.flash = Math.max(0, this.flash - dt)
    this.critIcd = Math.max(0, this.critIcd - dt)
    this.wardCloneIcd = Math.max(0, this.wardCloneIcd - dt)
    if (!this.combat.available) return
    const cap = this.capacity
    if (this.charges >= cap) {
      this.recharge = 0
      return
    }
    const interval = this.cooldown
    this.recharge += dt * this.rechargeHaste
    while (this.recharge >= interval && this.charges < cap) {
      this.recharge -= interval
      this.charges += 1
      this.flash = 0.32
      this.combat.weapon?._ring?.(this.player.x, this.player.y, '#a78bfa', this.player.radius + 12)
    }
    if (this.charges >= cap) this.recharge = 0
  }

  hud() {
    const cap = this.capacity
    const cd = this.cooldown
    const haste = this.rechargeHaste
    const remaining = this.charges >= cap ? 0 : Math.max(0, (cd - this.recharge) / haste)
    return {
      charges: this.charges,
      capacity: cap,
      cooldown: cd,
      recharge: this.recharge,
      remaining,
      progress: this.charges >= cap ? 1 : Math.max(0, Math.min(1, this.recharge / cd)),
      haste,
    }
  }
}
