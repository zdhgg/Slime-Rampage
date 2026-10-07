import {
  DEVOUR_SOURCE_GLUTTON, DEVOUR_SOURCE_NORMAL, GLUTTON_CHARGE_MAX,
  hasGluttonCharge, isGluttonLocked, onGluttonBossBasicHit, spendGluttonCharge,
} from './GluttonResource.js'
import { bitePose, renderBiteMotion, renderBiteFeedback } from './effects/GluttonBiteVisual.js'

export const GLUTTON_BITE_REACH = 48 // 从身体边缘起算，留出与接触伤害之间的走位空间。
export const GLUTTON_HEAVY_REACH = 68
export const GLUTTON_BITE_ARC = Math.PI * 11 / 18 // 110°：明确留出侧后方空隙。
export const GLUTTON_HEAVY_ARC = Math.PI * 7 / 9
export const GLUTTON_BITE_WINDUP = 0.12
export const GLUTTON_BITE_STRIKE = 0.045
export const GLUTTON_HEAVY_WINDUP = 0.16
export const GLUTTON_HEAVY_STRIKE = 0.06
export const GLUTTON_BITE_DAMAGE = 1.35
export const GLUTTON_HEAVY_DAMAGE = 4
export const GLUTTON_BOSS_HEAVY_DAMAGE = 6
export const GLUTTON_GUARD_COOLDOWN = 2.5
export const GLUTTON_HEAL_COOLDOWN = 4

/** 圆形目标与扇形相交；范围、预览和结算共享同一份几何判定。 */
export function inBiteSector(player, enemy, angle, reach, arc) {
  if (!enemy?.active || enemy.devouring || !(enemy.hp > 0)) return false
  const dx = enemy.x - player.x
  const dy = enemy.y - player.y
  const distance = Math.hypot(dx, dy)
  const radius = enemy.radius || 0
  if (distance > reach + radius) return false
  if (distance <= radius) return true
  const delta = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - angle), Math.cos(Math.atan2(dy, dx) - angle)))
  if (delta <= arc / 2) return true
  // 角度在扇面外时，检查目标圆到边界线段的距离，避免同时擦过射程/角度却误中。
  const cosine = Math.cos(delta - arc / 2)
  const nearest = Math.max(0, Math.min(reach, distance * cosine))
  return distance * distance + nearest * nearest - 2 * distance * nearest * cosine <= radius * radius + 1e-8
}

/** 暴食的近战时序与表现。伤害、护盾、吞噬奖励仍经过原有实体结算。 */
export class GluttonCombat {
  constructor(weapon) {
    this.weapon = weapon
    this.reset()
  }

  reset() {
    this.swing = null
    this.flash = null
    this.impacts = []
    this.morsels = []
    this.guardPulse = 0
    this.acidPending = false
    this.acidSource = DEVOUR_SOURCE_NORMAL
    this.acidCooldown = 0
  }

  get player() { return this.weapon.player }
  get enabled() { return this.weapon.game?.startingStrain === 'glutton' }
  get pose() { return this.enabled && !this.player.dead ? bitePose(this.swing, this.flash) : null }
  reach(heavy = false) {
    return this.player.radius + (heavy ? GLUTTON_HEAVY_REACH * (1 + 0.1 * (this.player.gluttonHeavyLevel || 0)) : GLUTTON_BITE_REACH) * (this.player.isGluttonyLord ? 1.25 : 1)
  }

  nearest(heavy = false) {
    let best = null
    let nearest = Infinity
    for (const e of this.weapon.enemyManager.enemies) {
      if (!e.active || e.devouring || !(e.hp > 0)) continue
      const distance = Math.hypot(e.x - this.player.x, e.y - this.player.y)
      if (distance > this.reach(heavy) + (e.radius || 0)) continue
      const edge = distance - (e.radius || 0)
      if (edge < nearest) { best = e; nearest = edge }
    }
    return best
  }

  bite(target = this.nearest(), heavy = false) {
    if (!this.enabled || this.player.dead || this.weapon.game.runFinished || !target) return false
    if (this.swing && (!heavy || this.swing.heavy || this.swing.phase === 'strike')) return false
    if (!inBiteSector(this.player, target, Math.atan2(target.y - this.player.y, target.x - this.player.x), this.reach(heavy), Math.PI)) return false
    if (heavy && (!hasGluttonCharge(this.player) || isGluttonLocked(this.player))) return false
    if (heavy && !spendGluttonCharge(this.player)) return false
    // 前摇与出手占用既有攻击周期；高攻速优先压缩收势，仍保留可见张嘴。
    const pace = Math.min(1, Math.max(0.55, this.weapon.attackInterval / 0.4))
    const windup = heavy ? GLUTTON_HEAVY_WINDUP : GLUTTON_BITE_WINDUP * pace
    const strike = heavy ? GLUTTON_HEAVY_STRIKE : GLUTTON_BITE_STRIKE * pace
    this.flash = null
    this.swing = {
      angle: Math.atan2(target.y - this.player.y, target.x - this.player.x),
      reach: this.reach(heavy), arc: heavy ? GLUTTON_HEAVY_ARC : GLUTTON_BITE_ARC,
      remaining: windup, windup, strike, heavy, phase: 'windup',
      recovery: heavy ? 0.22 : Math.min(0.16, this.weapon.attackInterval * 0.25),
    }
    return true
  }

  heavyBite() { return this.bite(this.nearest(true), true) }

  grantGuard() {
    const p = this.player
    if (!this.enabled || p.dead || p.gluttonGuardCooldown > 0) return
    p.gluttonGuard = 1
    p.gluttonGuardTimer = p.gluttonGuardDuration
    p.gluttonGuardCooldown = GLUTTON_GUARD_COOLDOWN
    this.guardPulse = 0.24
  }

  onDevoured(enemy) {
    if (!this.enabled || this.player.dead) return
    const angle = this.swing?.angle ?? this.flash?.angle ?? Math.atan2(enemy.y - this.player.y, enemy.x - this.player.x)
    this.morsels.push({ x: enemy.x, y: enemy.y, angle, life: 0.3, maxLife: 0.3 })
    if (this.morsels.length > 20) this.morsels.shift()
  }

  impact(enemy, swing, x, y) {
    const dx = x - this.player.x, dy = y - this.player.y
    const distance = Math.hypot(dx, dy) || 1
    const contact = Math.max(0, distance - (enemy.radius || 0))
    this.impacts.push({
      x: this.player.x + dx / distance * contact, y: this.player.y + dy / distance * contact,
      angle: swing.angle, heavy: swing.heavy, devoured: enemy.devouring,
      life: 0.18, maxLife: 0.18,
    })
    if (this.impacts.length > 32) this.impacts.shift()
  }

  /** 同一帧的多次吞噬合并为一次近身爆发，不递归吞噬、不生成远程弹幕。 */
  queueAcid(source = DEVOUR_SOURCE_NORMAL) {
    if (this.enabled && this.player.devourAcidBurst > 0) {
      if (!this.acidPending || source === DEVOUR_SOURCE_GLUTTON) this.acidSource = source
      this.acidPending = true
    }
  }

  hit(enemy, damage, { source = DEVOUR_SOURCE_NORMAL, basic = false, execute = false } = {}) {
    if (this.player.dead || this.weapon.game.runFinished) return false
    if (!enemy.active || enemy.devouring || enemy._settled) return false
    const before = enemy.hp
    enemy.hit(damage, { devourOnHit: true, devourSource: source, devourExecute: execute })
    const landed = enemy.hp < before
    if (landed && basic && enemy.isBoss && onGluttonBossBasicHit(this.player, enemy)) {
      this.weapon.enemyManager.addText(this.player.x, this.player.y - 46,
        `🍽️ 猎食点 +1（${this.player.gluttonCharge}/${GLUTTON_CHARGE_MAX}）`, null, '#a6e77c', 15)
    }
    if (landed && !enemy.devouring) {
      this.weapon.enemyManager.addText(enemy.x, enemy.y - 14, String(Math.round((before - enemy.hp) * 10) / 10), null, '#eaffc9', 15)
      if (!enemy.isBoss && !enemy.isEnraged && enemy.active) {
        enemy.gluttonStagger = Math.max(enemy.gluttonStagger || 0, 0.14)
        const dx = enemy.x - this.player.x
        const dy = enemy.y - this.player.y
        const d = Math.hypot(dx, dy) || 1
        enemy.x += dx / d * 6
        enemy.y += dy / d * 6
      }
    }
    if (!enemy.active) this.weapon._onKill(enemy)
    return landed
  }

  update(dt) {
    if (!this.enabled || this.player.dead || this.weapon.game.runFinished) { this.reset(); return }
    if (this.flash) {
      this.flash.life -= dt
      if (this.flash.life <= 0) this.flash = null
    }
    this.guardPulse = Math.max(0, this.guardPulse - dt)
    for (const list of [this.impacts, this.morsels]) {
      for (let i = list.length - 1; i >= 0; i--) {
        list[i].life -= dt
        if (list[i].life <= 0) list.splice(i, 1)
      }
    }
    this.acidCooldown = Math.max(0, this.acidCooldown - dt)
    if (this.swing) {
      this.swing.remaining -= dt
      if (this.swing.phase === 'windup' && this.swing.remaining <= 0) {
        this.swing.phase = 'strike'
        this.swing.remaining += this.swing.strike
      }
      if (this.swing.remaining <= 0) {
        const swing = this.swing
        this.swing = null
        // 命中残像留在真实咬合位置，移动后不会把特效拖到新的敌人身上。
        this.flash = { ...swing, x: this.player.x, y: this.player.y, life: swing.recovery, maxLife: swing.recovery }
        const source = swing.heavy ? DEVOUR_SOURCE_GLUTTON : DEVOUR_SOURCE_NORMAL
        // 在结算前固定目标，吞噬/首领阶段变化产生的新敌人不会被同一次攻击扫到。
        const targets = this.weapon.enemyManager.enemies.filter(e => inBiteSector(this.player, e, swing.angle, swing.reach, swing.arc))
        this.weapon.game.mapFeatures?.attackBarricades(this.player.x, this.player.y, swing.reach)
        let landed = false
        for (const e of targets) {
          if (this.player.dead || this.weapon.game.runFinished) break
          const multiplier = swing.heavy ? (e.isBoss ? GLUTTON_BOSS_HEAVY_DAMAGE : GLUTTON_HEAVY_DAMAGE) : GLUTTON_BITE_DAMAGE
          const crit = !swing.heavy && Math.random() < this.weapon.critChance ? this.weapon.critMul : 1
          const damage = this.weapon.damage * this.weapon.levelMul * this.weapon.devourDamageMul * multiplier * (swing.heavy ? 1 + 0.15 * (this.player.gluttonHeavyLevel || 0) : 1) * crit * (this.player.isGluttonyLord ? 1.25 : 1)
          const x = e.x, y = e.y
          const hit = this.hit(e, damage, { source, basic: !swing.heavy, execute: swing.heavy && this.player.isGluttonyLord })
          landed ||= hit
          if (hit) this.impact(e, swing, x, y)
          if (hit && e.isBoss && swing.heavy) { this.grantGuard(); this.queueAcid(source) }
        }
        this.weapon.game.sound.bite(swing.heavy, landed)
        if (landed && swing.heavy) this.weapon.game.shakeScreen(3, 0.12)
      }
    }
    if (this.player.dead || this.weapon.game.runFinished) { this.reset(); return }
    if (this.acidPending && this.acidCooldown <= 0) {
      this.acidPending = false
      this.acidCooldown = 0.4
      const radius = 90 + this.player.devourAcidBurst * 10
      const damage = this.weapon.damage * this.weapon.levelMul * this.weapon.devourDamageMul * (0.65 + this.player.devourAcidBurst * 0.35)
      for (const e of [...this.weapon.enemyManager.enemies]) {
        if (this.player.dead || this.weapon.game.runFinished) break
        if (!e.active || e.devouring || Math.hypot(e.x - this.player.x, e.y - this.player.y) > radius + e.radius) continue
        e.hit(damage, { devourSource: this.acidSource })
        if (!e.isBoss) e.slow = Math.max(e.slow || 0, 0.7)
        if (!e.active) this.weapon._onKill(e)
      }
      this.weapon._ring(this.player.x, this.player.y, '#b4ef72', radius)
    }
  }

  render(ctx) {
    if (!this.enabled || this.player.dead) return
    renderBiteMotion(ctx, this.player, this.swing, this.flash)
    renderBiteFeedback(ctx, this)
  }
}
