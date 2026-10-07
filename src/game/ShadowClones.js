import { shadowTargetAlive as alive, inShadowPath, traceShadowPath, shadowLineClear } from './ShadowGeometry.js'
import { SHADOW_CLONE_CHANCES, SHADOW_CLONE_POWERS, SHADOW_CLONE_LIFETIMES, SHADOW_CLONE_CAPS } from './ShadowSkills.js'

export const SHADOW_CLONE_INTERVAL = 0.7
export const SHADOW_CLONE_PROC_INTERVAL = 0.35
const WINDUP = 0.15
const ranged = e => e && !e.isBoss && (e.type === 'mage' || e.type === 'archer')
export const SHADOW_HUNT_RANGE = 420 // 覆盖法师 340px 的开火距离。
const HUNT_LEASH = 520

export class ShadowClones {
  constructor(combat) { this.combat = combat; this.reset() }
  get player() { return this.combat.player }
  get game() { return this.combat.weapon.game }
  get chance() { return SHADOW_CLONE_CHANCES[this.player.shadowCloneChanceLevel || 0] }
  get power() { return SHADOW_CLONE_POWERS[this.player.shadowClonePowerLevel || 0] }
  get duration() { return SHADOW_CLONE_LIFETIMES[this.player.shadowCloneLifeLevel || 0] }
  get cap() { return SHADOW_CLONE_CAPS[this.player.shadowCloneCapLevel || 0] }
  reset() { this.items = []; this.procCooldown = 0; this.serial = 0; this.focus = null }

  createAt(spot, angle, target = this.nearest(spot)) {
    const c = { x: spot.x, y: spot.y, id: ++this.serial, radius: this.player.radius * 0.78, angle,
      life: this.duration, maxLife: this.duration, birth: 0.2, cooldown: 0, target,
      retarget: 0, attack: null, flash: 0, rush: null }
    this.items.push(c)
    const stats = this.combat.weapon.stats
    stats.shadowSummons = (stats.shadowSummons || 0) + 1
    return c
  }

  leaveAtOrigin() {
    if (!this.combat.available || !this.player.shadowAssaultClone) return null
    this.items = this.items.filter(c => c.life > 0)
    if (this.items.length < this.cap) return this.createAt(this.player, this.player.facing)
    const c = this.items.reduce((best, item) => item.life < best.life ? item : best)
    Object.assign(c, { x: this.player.x, y: this.player.y, angle: this.player.facing,
      life: this.duration, maxLife: this.duration, birth: 0.2, target: null,
      attack: null, rush: null, flash: 0, crossFlash: false, retarget: 0 })
    return c
  }

  onCritical(target, action) {
    if (!action || action.cloneRolled || !this.combat.available) return false
    action.cloneRolled = true
    if (this.procCooldown > 0) return false
    this.procCooldown = SHADOW_CLONE_PROC_INTERVAL
    if (Math.random() >= this.chance) return false
    this.items = this.items.filter(c => c.life > 0)
    if (this.items.length >= this.cap) {
      const oldest = this.items.reduce((best, c) => c.life < best.life ? c : best)
      oldest.life = oldest.maxLife = this.duration; oldest.birth = 0.2
      return true
    }
    const p = this.player, radius = p.radius * 0.78
    const facing = Math.atan2(target.y - p.y, target.x - p.x)
    for (const offset of [Math.PI / 2, -Math.PI / 2, Math.PI, 0]) {
      const distance = (target.radius || 18) + radius + 10
      const spot = { x: target.x + Math.cos(facing + offset) * distance, y: target.y + Math.sin(facing + offset) * distance }
      const end = traceShadowPath(this.game, p, Math.atan2(spot.y - p.y, spot.x - p.x), Math.hypot(spot.x - p.x, spot.y - p.y), radius)
      if (Math.hypot(end.x - spot.x, end.y - spot.y) > 0.5 || !shadowLineClear(this.game, end, target)) continue
      this.createAt(end, facing + offset + Math.PI, this.nearest(end) || target)
      return true
    }
    return false
  }

  command(target, ids) {
    this.focus = { x: target.x, y: target.y, life: 0.35 }
    const assigned = new Map()
    for (const c of this.items) {
      if (!ids.has(c.id) || c.life <= 0) continue
      // 本体被前排截住时，分身仍能扑向后排；首领指令保持集火。
      const focus = !target.isBoss ? this.rangedTarget(c, assigned) || target : target
      assigned.set(focus, (assigned.get(focus) || 0) + 1)
      const distance = Math.hypot(focus.x - c.x, focus.y - c.y)
      if (distance > HUNT_LEASH) continue
      const angle = Math.atan2(focus.y - c.y, focus.x - c.x)
      c.target = focus
      // Stop short of the center so the attached blade visibly cuts into the focus.
      c.rush = { x: focus.x, y: focus.y, angle, remaining: Math.max(0, distance - 38), windup: 0.12, hits: new Set() }
      c.attack = null; c.cooldown = SHADOW_CLONE_INTERVAL; c.angle = angle
    }
  }

  rangedTarget(c, assigned = null) {
    let best = null, score = Infinity
    for (const e of this.combat.weapon.enemyManager.enemies) {
      if (!alive(e) || !ranged(e)) continue
      const d = Math.hypot(e.x - c.x, e.y - c.y)
      if (d > SHADOW_HUNT_RANGE || Math.hypot(e.x - this.player.x, e.y - this.player.y) > HUNT_LEASH) continue
      const value = d + (assigned?.get(e) || 0) * SHADOW_HUNT_RANGE
      if (value < score && shadowLineClear(this.game, c, e)) { best = e; score = value }
    }
    return best
  }

  nearest(c) {
    const shooter = this.rangedTarget(c)
    if (shooter) return shooter
    let best = null, distance = 220, bestRanged = null, rangedDistance = 220
    for (const e of this.combat.weapon.enemyManager.enemies) {
      if (!alive(e)) continue
      const d = Math.hypot(e.x - c.x, e.y - c.y)
      if (d < distance && shadowLineClear(this.game, c, e)) { best = e; distance = d }
      if (ranged(e) && d < rangedDistance && shadowLineClear(this.game, c, e)) { bestRanged = e; rangedDistance = d }
    }
    return bestRanged || best
  }

  lureTarget(enemy) {
    if (!this.combat.available || !ranged(enemy)) return null
    let best = null, distance = Math.min(320, Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) + 80)
    for (const c of this.items) {
      if (c.life <= 0) continue
      const d = Math.hypot(enemy.x - c.x, enemy.y - c.y)
      if (d < distance && shadowLineClear(this.game, enemy, c)) { best = c; distance = d }
    }
    return best
  }

  blockBullet(c) {
    c.life = Math.max(0, c.life - 0.5)
    c.flash = 0.18
    this.combat.impacts.push({ x: c.x, y: c.y, angle: c.angle, life: 0.18, maxLife: 0.18 })
    if (this.combat.impacts.length > 24) this.combat.impacts.shift()
    const stats = this.combat.weapon.stats
    stats.shadowBlocks = (stats.shadowBlocks || 0) + 1
  }

  hit(c, enemy, multiplier) {
    if (!this.combat.available || !alive(enemy) || !shadowLineClear(this.game, c, enemy)) return
    const before = enemy.hp
    this.combat.hit(enemy, multiplier, { secondary: true, angle: c.angle, clone: true })
    const stats = this.combat.weapon.stats
    stats.shadowDamage = (stats.shadowDamage || 0) + Math.max(0, before - Math.max(0, enemy.hp))
  }

  sweep(c, ax, ay, bx, by, multiplier, maxTargets, hits = new Set(), width = 12) {
    const targets = this.combat.targets(ax, ay, bx, by, width)
    // 普攻已瞄准射手时，不让贴在刀路上的前排抢走唯一命中名额。
    if (!c.rush && ranged(c.target)) targets.sort((a, b) => Number(b === c.target) - Number(a === c.target))
    for (const e of targets) {
      if (hits.size >= maxTargets || !this.combat.available) break
      if (hits.has(e) || !shadowLineClear(this.game, c, e)) continue
      // 突袭为指定目标保留一个命中名额，避免三名挡路近战耗光整次攻击。
      if (c.rush && alive(c.target) && e !== c.target && !hits.has(c.target) && hits.size >= maxTargets - 1) continue
      const order = hits.size
      hits.add(e)
      this.hit(c, e, multiplier * (maxTargets === 3 && !c.rush && order > 0 ? 0.5 : 1))
    }
    return hits
  }

  update(dt) {
    this.procCooldown = Math.max(0, this.procCooldown - dt)
    if (this.focus && (this.focus.life -= dt) <= 0) this.focus = null
    for (const c of this.items) {
      if (!this.combat.available) break
      c.life -= dt; c.birth = Math.max(0, c.birth - dt); c.flash = Math.max(0, c.flash - dt)
      c.cooldown = Math.max(0, c.cooldown - dt)
      if (c.life <= 0) continue
      if (c.rush) {
        const r = c.rush
        if (r.windup > 0) { r.windup -= dt; continue }
        const x = c.x, y = c.y
        const distance = Math.min(r.remaining, 1400 * dt)
        const end = traceShadowPath(this.game, c, r.angle, distance)
        Object.assign(c, end)
        const moved = Math.hypot(c.x - x, c.y - y)
        r.remaining -= moved
        this.sweep(c, x, y, c.x, c.y, this.power * 2, 3, r.hits, 16)
        if (r.remaining <= 0.01 || moved < distance - 0.01) {
          this.sweep(c, c.x, c.y, c.x + Math.cos(r.angle) * 65, c.y + Math.sin(r.angle) * 65, this.power * 2, 3, r.hits, 16)
          if (this.player.shadowCloneLord) {
            const dx = Math.cos(r.angle + Math.PI / 2) * 66, dy = Math.sin(r.angle + Math.PI / 2) * 66
            this.sweep(c, r.x - dx, r.y - dy, r.x + dx, r.y + dy, this.power * 2, 3, r.hits, 16)
          }
          c.rush = null; c.crossFlash = this.player.shadowCloneLord; c.flash = 0.18; c.cooldown = SHADOW_CLONE_INTERVAL
        }
        continue
      }
      const leash = Math.hypot(this.player.x - c.x, this.player.y - c.y) > HUNT_LEASH
      if (leash) c.attack = null
      if (c.attack) {
        c.attack.time -= dt
        if (c.attack.time <= 0) {
          const angle = c.attack.angle
          this.sweep(c, c.x, c.y, c.x + Math.cos(angle) * 110, c.y + Math.sin(angle) * 110,
            this.power, this.player.shadowCloneLord ? 3 : 1)
          c.attack = null; c.crossFlash = false; c.flash = 0.13
        }
        continue
      }
      c.retarget -= dt
      if (!alive(c.target) || Math.hypot(c.target.x - c.x, c.target.y - c.y) > (ranged(c.target) ? SHADOW_HUNT_RANGE : 220)) c.target = null
      if (c.retarget <= 0 && !leash) {
        if (!c.target || !ranged(c.target) || !shadowLineClear(this.game, c, c.target)) c.target = this.nearest(c)
        c.retarget = 0.2
      }
      const target = leash ? this.player : c.target
      if (!target) continue
      const distance = Math.hypot(target.x - c.x, target.y - c.y)
      c.angle = Math.atan2(target.y - c.y, target.x - c.x)
      if (!leash && distance <= 110 && shadowLineClear(this.game, c, target)) {
        if (c.cooldown <= 0) { c.attack = { angle: c.angle, time: WINDUP }; c.cooldown = SHADOW_CLONE_INTERVAL }
      } else {
        const speed = !leash && ranged(target) ? 420 : 260
        Object.assign(c, traceShadowPath(this.game, c, c.angle, Math.min(distance, speed * (this.game.primarySpec === 'assassin' ? 1.15 : 1) * dt)))
      }
    }
    this.items = this.items.filter(c => c.life > 0)
  }
}
