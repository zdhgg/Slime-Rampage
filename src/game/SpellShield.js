import { ELEMENTAL_SCHOOLS } from './ElementalSchools.js'
import { BASE_SPELL_PALETTES } from './SpellPalette.js'

const MAX_WORLD_PAD = 18

/**
 * Elemental Slime v2 characteristic shields (1 shared SpellShield slot upgraded Lv.0 -> Lv.3):
 *  - Fire (烈焰护体): break blasts flame ring, knocks back non-bosses, ignites, feeds Hot Streak
 *  - Ice (寒冰护体): -1s rebuild cooldown, break unleashes miniature Frost Nova freeze
 *  - Lightning (闪电之盾): periodic 115px shock aura while active; break chains & grants 1.5s +35% speed
 *  - Poison (灵魂榨取): plague ticks & infected kills shave rebuild CD (capped 1s/s); Lv.3 break bursts infected
 */
export class SpellShield {
  constructor(combat) {
    this.combat = combat
    this.reset()
  }

  reset(broken = false) {
    this.charges = broken ? 0 : 1
    this.timer = broken ? this.cooldown : 0
    this.regenTimer = 10
    this.shockTimer = 1.2
    this.flash = 0
    this._siphonAccum = 0
    this._siphonClock = 0
  }

  get rank() {
    return this.combat?.rank?.('spell_shield') || 0
  }

  get points() {
    return this.enabled ? this.charges : 0
  }

  set points(v) {
    this.charges = Math.max(0, Number(v) || 0)
  }

  get capacity() {
    return this.enabled ? this.maxCharges : 0
  }

  get remaining() {
    return this.timer
  }

  set remaining(v) {
    this.timer = Math.max(0, Number(v) || 0)
  }

  upgrade(prevCooldown = null) {
    const nextCd = this.cooldown
    if (this.charges <= 0 && this.timer > 0) {
      const rank = this.rank
      const prevBase = rank >= 3 ? 6.0 : rank === 2 ? 6.0 : 7.0
      const schoolBonus = this.combat?.school === 'ice' ? 1.0 : 0
      const tomeBonus = this.combat?.game?.bossTomes?.veilReduction || 0
      const refPrev = prevCooldown || Math.max(3.5, prevBase - schoolBonus - tomeBonus)
      if (refPrev > 0) this.timer = Math.min(nextCd, this.timer * (nextCd / refPrev))
    }
    this.regenTimer = Math.min(this.regenTimer, 10)
    this.flash = 0.22
  }

  /** Active spells accelerate broken shield rebuild or multi-charge regeneration. */
  advanceRebuild(seconds = 2.0) {
    if (!this.enabled || seconds <= 0) return false
    if (this.charges <= 0 && this.timer > 0) {
      this.timer = Math.max(0, this.timer - seconds)
      if (this.timer <= 0) {
        this.charges = 1
        this.regenTimer = 10
        this.flash = 0.28
        this.combat.game?.sound?.spellShieldUp?.()
      }
      return true
    }
    if (this.rank >= 2 && this.charges < this.maxCharges && this.regenTimer > 0) {
      this.regenTimer = Math.max(0, this.regenTimer - seconds)
      if (this.regenTimer <= 0) {
        this.charges = Math.min(this.maxCharges, this.charges + 1)
        this.regenTimer = 10
        this.flash = 0.24
        this.combat.game?.sound?.spellShieldUp?.()
      }
      return true
    }
    return false
  }

  get enabled() {
    return !!this.combat?.enabled
  }

  get active() {
    return this.charges > 0
  }

  get maxCharges() {
    return this.rank >= 2 ? 2 : 1
  }

  get cooldown() {
    const base = this.rank >= 3 ? 5.0 : this.rank >= 1 ? 6.0 : 7.0
    const schoolBonus = this.combat?.school === 'ice' ? 1.0 : 0
    const tomeBonus = this.combat?.game?.bossTomes?.veilReduction || 0
    return Math.max(3.5, base - schoolBonus - tomeBonus)
  }

  get progress() {
    if (this.charges > 0) return 1
    const cd = this.cooldown
    return cd > 0 ? Math.max(0, Math.min(1, 1 - this.timer / cd)) : 1
  }

  get label() {
    return ELEMENTAL_SCHOOLS[this.combat?.school]?.shield?.name || '法术护盾'
  }

  get color() {
    return (
      ELEMENTAL_SCHOOLS[this.combat?.school]?.color ||
      BASE_SPELL_PALETTES[this.combat?.school === 'ice' ? 'water' : this.combat?.school]?.main ||
      '#84d6e8'
    )
  }

  hud() {
    return {
      available: this.enabled,
      active: this.charges > 0,
      points: this.points,
      capacity: this.capacity,
      remaining: this.timer,
      charges: this.charges,
      maxCharges: this.maxCharges,
      timer: this.timer,
      cooldown: this.cooldown,
      progress: this.progress,
      rank: this.rank,
      label: this.label,
      color: this.color,
      flash: this.flash,
    }
  }

  update(dt) {
    if (!this.enabled) return
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt)
    this._siphonClock += dt
    if (this._siphonClock >= 1) {
      this._siphonClock %= 1
      this._siphonAccum = 0
    }

    if (this.charges <= 0) {
      this.timer = Math.max(0, this.timer - dt)
      if (this.timer <= 0) {
        this.charges = 1
        this.regenTimer = 10
        this.flash = 0.25
        this.combat.game?.sound?.spellShieldUp?.()
      }
    } else if (this.rank >= 2 && this.charges < this.maxCharges) {
      this.regenTimer = Math.max(0, this.regenTimer - dt)
      if (this.regenTimer <= 0) {
        this.charges = Math.min(this.maxCharges, this.charges + 1)
        this.regenTimer = 10
        this.flash = 0.22
        this.combat.game?.sound?.spellShieldUp?.()
      }
    }

    if (this.combat.school === 'lightning' && this.charges > 0) {
      this.shockTimer -= dt
      if (this.shockTimer <= 0) {
        this.shockTimer = this.rank >= 3 ? 0.9 : this.rank >= 1 ? 1.3 : 1.6
        this._pulseLightningAura()
      }
    }
  }

  _pulseLightningAura() {
    const p = this.combat.player
    const enemies = this.combat.enemies
    if (!p || !enemies?.length) return
    const radius = 115 * this.combat.rangeScale
    const hitLimit = this.rank >= 3 ? 3 : 2
    const candidates = []
    for (const e of enemies) {
      if (!e?.active || e.hp <= 0) continue
      const d = Math.hypot(e.x - p.x, e.y - p.y)
      if (d <= radius + (e.radius || 0)) candidates.push({ e, d })
    }
    if (!candidates.length) return
    candidates.sort((a, b) => a.d - b.d)
    const picked = candidates.slice(0, hitLimit)
    const dmg = this.combat.schoolDamage('lightning', this.rank >= 3 ? 0.78 : this.rank >= 1 ? 0.55 : 0.45)
    for (const { e } of picked) {
      this.combat.damageEnemy(e, dmg, { element: 'lightning', derived: true, noOverload: true })
      this.combat.pushEffect({
        kind: 'bolt',
        pts: [
          { x: p.x, y: p.y },
          { x: e.x, y: e.y },
        ],
        color: '#f3d97d',
        life: 0.14,
        maxLife: 0.14,
        width: 2.2,
      })
    }
    this.combat.pushEffect({
      kind: 'ring',
      x: p.x,
      y: p.y,
      r: 20,
      maxR: radius,
      color: '#f3d97d',
      life: 0.2,
      maxLife: 0.2,
      lineWidth: 1.5,
      alpha: 0.35,
    })
  }

  onPlagueProgress(seconds) {
    if (!this.enabled || this.combat.school !== 'poison' || seconds <= 0) return 0
    const needsRebuild = this.charges <= 0 && this.timer > 0
    const needsRegen = this.charges > 0 && this.rank >= 2 && this.charges < this.maxCharges && this.regenTimer > 0
    if (!needsRebuild && !needsRegen) return 0

    const room = Math.max(0, 1.0 - this._siphonAccum)
    if (room <= 0) return 0
    const rankMul = this.rank >= 3 ? 1.35 : this.rank >= 1 ? 1.0 : 0.6
    const branchMul = this.combat.branch === 'poi_affliction' ? 1.5 : 1.0
    const gain = Math.min(room, seconds * rankMul * branchMul)
    if (gain <= 0) return 0

    this._siphonAccum += gain
    if (needsRebuild) {
      this.timer = Math.max(0, this.timer - gain)
      if (this.timer <= 0) {
        this.charges = 1
        this.regenTimer = 10
        this.flash = 0.25
        this.combat.game?.sound?.spellShieldUp?.()
      }
    } else if (needsRegen) {
      this.regenTimer = Math.max(0, this.regenTimer - gain * 0.65)
      if (this.regenTimer <= 0) {
        this.charges = Math.min(this.maxCharges, this.charges + 1)
        this.regenTimer = 10
        this.flash = 0.22
        this.combat.game?.sound?.spellShieldUp?.()
      }
    }
    return gain
  }

  absorb(damage = 1, attack = null) {
    if (!this.enabled || !attack?.enemyAttack || damage <= 0 || this.charges <= 0) return damage
    const absorbed = Math.min(damage, this.charges)
    this.charges = Math.max(0, this.charges - absorbed)
    this.combat.stats.shieldAbsorbed = (this.combat.stats.shieldAbsorbed || 0) + absorbed
    this.flash = 0.35
    if (this.charges <= 0) {
      this.timer = this.cooldown
      this.combat.game?.sound?.spellShieldBreak?.()
      this._triggerBreakEffect()
      this.combat.game?.bossTomes?.onSpellShieldBroken?.()
    }
    return Math.max(0, damage - absorbed)
  }

  _pushAway(e, originX, originY, dist) {
    if (!e || !e.active || e.isBoss) return
    const dx = e.x - originX
    const dy = e.y - originY
    const len = Math.hypot(dx, dy) || 1
    const ww = this.combat.game?.worldWidth || 2000
    const wh = this.combat.game?.worldHeight || 2000
    e.x = Math.max(MAX_WORLD_PAD, Math.min(ww - MAX_WORLD_PAD, e.x + (dx / len) * dist))
    e.y = Math.max(MAX_WORLD_PAD, Math.min(wh - MAX_WORLD_PAD, e.y + (dy / len) * dist))
  }

  _triggerBreakEffect() {
    const p = this.combat.player
    const enemies = this.combat.enemies || []
    if (!p) return
    const school = this.combat.school
    const rScale = this.combat.rangeScale
    const rank = this.rank

    if (!school) {
      const radius = 85 * rScale
      this.combat.pushEffect({
        kind: 'ring',
        x: p.x,
        y: p.y,
        r: 12,
        maxR: radius,
        color: '#a8d8f0',
        life: 0.28,
        maxLife: 0.28,
        lineWidth: 3,
      })
      for (const e of enemies) {
        if (!e?.active || e.hp <= 0) continue
        if (Math.hypot(e.x - p.x, e.y - p.y) <= radius + (e.radius || 0)) {
          this._pushAway(e, p.x, p.y, 32)
        }
      }
      return
    }

    if (school === 'fire') {
      const radius = (rank >= 3 ? 135 : 108) * rScale
      const dmg = this.combat.schoolDamage('fire', rank >= 3 ? 2.1 : rank >= 1 ? 1.55 : 1.2)
      const burnHits = rank >= 3 ? 5 : rank >= 1 ? 4 : 2
      this.combat.pushEffect({
        kind: 'ring',
        x: p.x,
        y: p.y,
        r: 14,
        maxR: radius,
        color: '#ff8a48',
        life: 0.34,
        maxLife: 0.34,
        lineWidth: 4,
      })
      let hitCount = 0
      for (const e of enemies) {
        if (!e?.active || e.hp <= 0) continue
        if (Math.hypot(e.x - p.x, e.y - p.y) <= radius + (e.radius || 0)) {
          hitCount++
          this._pushAway(e, p.x, p.y, 38)
          this.combat.damageEnemy(e, dmg, { element: 'fire', derived: true })
          if (e.active && e.hp > 0) this.combat.applyBurn(e, burnHits, dmg * 0.32)
        }
      }
      this.combat.gainHotStreak(rank >= 3 ? 2 : 1, enemies.find(e => e?.active))
      if (hitCount > 0) this.combat.game?.combatFeedback?.impact?.({ hits: hitCount })
      return
    }

    if (school === 'ice') {
      const radius = (rank >= 3 ? 145 : 112) * rScale
      const dmg = this.combat.schoolDamage('ice', rank >= 3 ? 1.8 : rank >= 1 ? 1.35 : 1.05)
      const freezeDur = rank >= 3 ? 2.1 : rank >= 1 ? 1.5 : 0.9
      this.combat.pushEffect({
        kind: 'ring',
        x: p.x,
        y: p.y,
        r: 14,
        maxR: radius,
        color: '#80e5ff',
        life: 0.34,
        maxLife: 0.34,
        lineWidth: 3.5,
      })
      for (const e of enemies) {
        if (!e?.active || e.hp <= 0) continue
        if (Math.hypot(e.x - p.x, e.y - p.y) <= radius + (e.radius || 0)) {
          this._pushAway(e, p.x, p.y, 32)
          this.combat.damageEnemy(e, dmg, { element: 'water', derived: true })
          if (e.active && e.hp > 0) {
            this.combat.applyFrost(e, 1, { freezeDur: !e.isBoss ? freezeDur : 0, forceDeepWinter: e.isBoss && rank >= 3 })
          }
        }
      }
      this.combat.game?.combatFeedback?.impact?.({ hits: 1 })
      return
    }

    if (school === 'lightning') {
      const pushR = 96 * rScale
      this.combat.staticRushTimer = Math.max(this.combat.staticRushTimer || 0, rank >= 3 ? 2.0 : 1.5)
      this.combat.pushEffect({
        kind: 'ring',
        x: p.x,
        y: p.y,
        r: 14,
        maxR: pushR,
        color: '#f3d97d',
        life: 0.28,
        maxLife: 0.28,
        lineWidth: 3,
      })
      for (const e of enemies) {
        if (!e?.active || e.hp <= 0) continue
        if (Math.hypot(e.x - p.x, e.y - p.y) <= pushR + (e.radius || 0)) {
          this._pushAway(e, p.x, p.y, 28)
        }
      }
      this.combat.lightning.castShieldChain(rank >= 3 ? 5 : rank >= 1 ? 4 : 3, rank >= 3 ? 1.7 : 1.2)
      this.combat.game?.combatFeedback?.impact?.({ hits: 1 })
      return
    }

    if (school === 'poison') {
      const radius = (rank >= 3 ? 142 : 108) * rScale
      const dmg = this.combat.schoolDamage('poison', rank >= 3 ? 1.55 : 0.95)
      this.combat.pushEffect({
        kind: 'ring',
        x: p.x,
        y: p.y,
        r: 14,
        maxR: radius,
        color: '#a8e46b',
        life: 0.34,
        maxLife: 0.34,
        lineWidth: 3.5,
      })
      for (const e of enemies) {
        if (!e?.active || e.hp <= 0) continue
        const dist = Math.hypot(e.x - p.x, e.y - p.y)
        if (dist <= radius + (e.radius || 0)) {
          this._pushAway(e, p.x, p.y, 34)
          this.combat.damageEnemy(e, dmg, { element: 'poison', derived: true })
          if (e.active && e.hp > 0) {
            this.combat.applyAgony(e, rank >= 3 ? 2 : 1)
            this.combat.applyPoison(e, 3, dmg * 0.38)
          }
        } else if (rank >= 3 && dist <= 165 * rScale && this.combat.contagion.isInfected(e)) {
          this.combat.damageEnemy(e, dmg * 0.9, { element: 'poison', derived: true })
        }
      }
      if (rank >= 3) {
        const infected = enemies.find(e => e?.active && this.combat.contagion.isInfected(e))
        if (infected) this.combat.contagion.queueDelayedContagion(infected, 0, true)
      }
      this.combat.game?.combatFeedback?.impact?.({ hits: 1 })
    }
  }
}
