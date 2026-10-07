import { renderShadowCombat, shadowPose } from './effects/ShadowBladeVisual.js'
import { ShadowClones } from './ShadowClones.js'
import { shadowTargetAlive as alive, inShadowPath, traceShadowPath } from './ShadowGeometry.js'
export { inShadowPath } from './ShadowGeometry.js'

export const SHADOW_BLADE_REACH = 72
export const SHADOW_BLADE_WIDTH = 12
export const SHADOW_BLADE_DAMAGE = 1.05
export const SHADOW_BLADE_TARGETS = 3
export const SHADOW_WINDUP = 0.065
export const SHADOW_STRIKE = 0.04
export const SHADOW_ASSAULT_DISTANCE = 180
export const SHADOW_ASSAULT_WINDUP = 0.10
export const SHADOW_ASSAULT_TIME = 0.16
export const SHADOW_ASSAULT_WIDTH = 12
export const SHADOW_ASSAULT_DAMAGE = 1.6
export const SHADOW_ASSAULT_SPLASH = 0.8
export const SHADOW_DASH_REFUND = 0.5
export const SHADOW_CLEAVE = [
  { damage: 0.85, reach: 52, width: 14, cooldown: 0.9 },
  { damage: 1.2, reach: 66, width: 16, cooldown: 0.65 },
]

export class ShadowCombat {
  constructor(weapon) { this.weapon = weapon; this.clones = new ShadowClones(this); this.reset() }
  reset() {
    this.swing = null; this.assault = null; this.flash = null
    this.clones?.reset()
    this.cleaveCooldown = 0
    this.echoes ??= []; this.impacts ??= []; this.cleaves ??= []
    this.echoes.length = 0; this.impacts.length = 0; this.cleaves.length = 0
  }
  get player() { return this.weapon.player }
  get enabled() { return this.weapon.game?.startingStrain === 'shadow' }
  get available() { return this.enabled && !this.player.dead && !this.weapon.game.runFinished }
  get pose() { return this.available ? shadowPose(this) : null }
  get reach() { return this.player.radius + SHADOW_BLADE_REACH }

  nearest() {
    let best = null, distance = Infinity
    for (const e of this.weapon.enemyManager.enemies) {
      if (!alive(e)) continue
      const edge = Math.hypot(e.x - this.player.x, e.y - this.player.y) - (e.radius || 0)
      if (edge <= this.reach && edge < distance) { best = e; distance = edge }
    }
    return best
  }

  stab(target = this.nearest()) {
    if (!this.available || this.swing || this.assault || !alive(target)) return false
    if (Math.hypot(target.x - this.player.x, target.y - this.player.y) > this.reach + (target.radius || 0)) return false
    const pace = Math.max(0.55, Math.min(1, this.weapon.attackInterval / 0.3))
    this.swing = { angle: Math.atan2(target.y - this.player.y, target.x - this.player.x),
      elapsed: 0, windup: SHADOW_WINDUP * pace, strike: SHADOW_STRIKE * pace, reach: this.reach }
    this.flash = null
    return true
  }

  direction() {
    const dir = this.player.input.getMoveVector()
    return dir.x || dir.y ? Math.atan2(dir.y, dir.x) : this.player.facing
  }

  /** Small steps also stop a fast crossing through a thin barricade. No mutation of terrain. */
  destination(angle, distance = SHADOW_ASSAULT_DISTANCE) {
    return traceShadowPath(this.weapon.game, this.player, angle, distance)
  }

  useAssault() {
    if (!this.available || this.assault) return false
    const angle = this.direction(), end = this.destination(angle)
    if (Math.hypot(end.x - this.player.x, end.y - this.player.y) < 4) return false
    this.swing = null; this.flash = null
    this.assault = { angle, end, phase: 'windup', elapsed: 0, hitTargets: new Set(), cloneIds: new Set(this.clones.items.map(c => c.id)), primaryUsed: false, refunded: false }
    this.player.facing = angle
    const originClone = this.clones.leaveAtOrigin()
    if (originClone) this.assault.cloneIds.delete(originClone.id)
    return true
  }

  /** Called by Player before ordinary movement; owns F's movement and swept collision. */
  updateMovement(dt) {
    if (!this.available) { this.reset(); return false }
    const a = this.assault
    if (!a) return false
    const p = this.player
    if (a.phase === 'windup') {
      a.elapsed += dt
      if (a.elapsed < SHADOW_ASSAULT_WINDUP) return true
      dt = a.elapsed - SHADOW_ASSAULT_WINDUP
      a.phase = 'travel'; a.elapsed = 0
      a.start = { x: p.x, y: p.y }
      a.end = this.destination(a.angle)
      a.distance = Math.hypot(a.end.x - p.x, a.end.y - p.y)
      this.weapon.game.sound.shadowBlade?.(true, false)
    }
    const time = Math.min(dt, SHADOW_ASSAULT_TIME - a.elapsed)
    // Remaining crossing + 0.12s landing grace, including frames spanning the whole cast.
    // Windup remains vulnerable and existing damage/dash immunity is never shortened.
    p.invincible = Math.max(p.invincible, SHADOW_ASSAULT_TIME - a.elapsed - time + 0.12)
    const distance = a.distance * time / SHADOW_ASSAULT_TIME
    for (let moved = 0; moved < distance && this.available;) {
      const step = Math.min(6, distance - moved), x = p.x, y = p.y
      const end = this.destination(a.angle, step)
      p.x = end.x; p.y = end.y
      const targets = this.targets(x, y, p.x, p.y, SHADOW_ASSAULT_WIDTH)
      for (const e of targets) {
        if (!this.available) break
        if (a.hitTargets.has(e)) continue
        a.hitTargets.add(e)
        const primary = !a.primaryUsed
        a.primaryUsed = true
        if (primary) this.clones.command(e, a.cloneIds)
        const result = this.hit(e, primary ? SHADOW_ASSAULT_DAMAGE : SHADOW_ASSAULT_SPLASH, { guaranteed: primary, angle: a.angle, action: a })
        if (result.killed && !a.refunded && this.available) {
          a.refunded = true
          p.strainSkillCd = Math.max(0, p.strainSkillCd - SHADOW_DASH_REFUND)
          this.weapon.enemyManager.addText(p.x, p.y - 42, '影袭收割 · 影袭 −0.5秒', null, '#f18d9e', 13)
        }
      }
      moved += step
      if (Math.hypot(p.x - x, p.y - y) < step - 0.01) { a.elapsed = SHADOW_ASSAULT_TIME; break }
    }
    if (!this.available) { this.reset(); return true }
    a.elapsed += time
    p.facing = a.angle; p.moveBlend = 1
    this.echoes.push({ x: p.x, y: p.y, angle: a.angle, life: 0.18 })
    if (this.echoes.length > 9) this.echoes.shift()
    if (a.elapsed >= SHADOW_ASSAULT_TIME - 1e-8) {
      this.weapon.game.mapFeatures?.attackBarricades(p.x, p.y, this.reach)
      this.assault = null
      if (p.shadowBossStep) p.guaranteedCrit = true
      this.weapon.cooldown = Math.min(this.weapon.cooldown, 0.10)
    }
    return true
  }

  targets(ax, ay, bx, by, width) {
    return this.weapon.enemyManager.enemies.filter(e => inShadowPath(e, ax, ay, bx, by, width))
      .sort((a, b) => (a.x - ax) * (bx - ax) + (a.y - ay) * (by - ay) -
        ((b.x - ax) * (bx - ax) + (b.y - ay) * (by - ay)))
  }

  hit(enemy, multiplier, { guaranteed = false, angle = 0, secondary = false, action = null, clone = false } = {}) {
    if (!this.available || !alive(enemy)) return { landed: false, killed: false }
    const ws = this.weapon, p = this.player
    const crit = !secondary && (guaranteed || (!action?.hitTargets && p.guaranteedCrit) || Math.random() < ws.critChance)
    let power = crit ? (ws.critMul || 3) : 1
    if (crit && ws.executeCrit && enemy.hp <= enemy.maxHp * 0.5) power *= 2
    const before = enemy.hp
    enemy.hit(ws.damage * ws.levelMul * ws.devourDamageMul * multiplier * power)
    const landed = enemy.hp < before
    // Shields and misses do not waste the stored critical strike from dash upgrades.
    if (landed) {
      if (!secondary && !action?.hitTargets && p.guaranteedCrit) p.guaranteedCrit = false
      if (!secondary) p.stealthTimer = 0
      this.impacts.push({ x: enemy.x, y: enemy.y, angle, crit, clone, life: 0.18 })
      if (this.impacts.length > 24) this.impacts.shift()
      ws.enemyManager.addText(enemy.x, enemy.y - 14, String(Math.round((before - enemy.hp) * 10) / 10), null, crit ? '#ffd166' : '#f6d8e1', crit ? 22 : 14)
      ws.game.sound.shadowBlade?.(false, true)
    }
    const killed = !enemy.active
    if (killed) ws._onKill(enemy)
    if (landed && crit && !secondary && this.available) {
      this.clones.onCritical(enemy, action)
      this.cleave(enemy, angle)
    }
    return { landed, killed }
  }

  /** A short transverse cut clears the target's flanks. Cannot crit, recurse or refund F. */
  cleave(origin, angle) {
    const config = SHADOW_CLEAVE[this.player.shadowCleaveLevel - 1]
    if (!config || this.cleaveCooldown > 0 || !this.available) return
    this.cleaveCooldown = config.cooldown
    const cross = angle + Math.PI / 2, dx = Math.cos(cross) * config.reach, dy = Math.sin(cross) * config.reach
    const targets = this.targets(origin.x - dx, origin.y - dy, origin.x + dx, origin.y + dy, config.width)
      .filter(e => e !== origin)
      .sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y))
      .slice(0, 4)
    this.cleaves.push({ x: origin.x, y: origin.y, angle: cross, reach: config.reach, width: config.width, life: 0.2 })
    for (const e of targets) {
      if (!this.available) break
      this.hit(e, config.damage, { angle: cross, secondary: true })
    }
  }

  update(dt) {
    if (!this.available) { this.reset(); return }
    this.clones.update(dt)
    if (!this.available) return
    this.cleaveCooldown = Math.max(0, this.cleaveCooldown - dt)
    for (const list of [this.echoes, this.impacts, this.cleaves]) {
      for (let i = list.length - 1; i >= 0; i--) { list[i].life -= dt; if (list[i].life <= 0) list.splice(i, 1) }
    }
    if (this.flash) { this.flash.life -= dt; if (this.flash.life <= 0) this.flash = null }
    const s = this.swing
    if (!s) return
    s.elapsed += dt
    if (s.elapsed < s.windup + s.strike) return
    this.swing = null
    const p = this.player, dx = Math.cos(s.angle), dy = Math.sin(s.angle)
    this.flash = { ...s, x: p.x, y: p.y, life: 0.13 }
    const targets = this.targets(p.x + dx * p.radius * 0.5, p.y + dy * p.radius * 0.5,
      p.x + dx * s.reach, p.y + dy * s.reach, SHADOW_BLADE_WIDTH).slice(0, SHADOW_BLADE_TARGETS)
    let landed = false
    for (let i = 0; i < targets.length && this.available; i++) {
      landed = this.hit(targets[i], SHADOW_BLADE_DAMAGE * (i ? 0.65 : 1), { angle: s.angle, action: s }).landed || landed
    }
    if (!landed) this.weapon.game.sound.shadowBlade?.(false, false)
    if (!this.available) this.reset()
  }

  render(ctx) { if (this.available) renderShadowCombat(ctx, this) }
}
