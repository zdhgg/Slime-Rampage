import { renderShadowCombat, shadowPose } from './effects/ShadowBladeVisual.js'
import { ShadowClones } from './ShadowClones.js'
import { shadowTargetAlive as alive, inShadowPath, traceShadowPath } from './ShadowGeometry.js'
import { SHADOW_ROUTES, shadowProgressReady, shadowRouteReady } from './ShadowBuild.js'
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
  reset({ preserveBuild = false } = {}) {
    const build = preserveBuild ? {
      route: this.route, routeUltimate: this.routeUltimate, normalChoices: this.normalChoices,
      huntMarkLevel: this.huntMarkLevel, huntPursuitLevel: this.huntPursuitLevel, huntReapLevel: this.huntReapLevel,
      swarmAssaultLevel: this.swarmAssaultLevel, swarmReapLevel: this.swarmReapLevel,
      bladeArcLevel: this.bladeArcLevel, bladeEchoLevel: this.bladeEchoLevel,
    } : null
    this.swing = null; this.assault = null; this.flash = null
    this.clones?.reset()
    this.route = build?.route || null; this.routeUltimate = build?.routeUltimate || null; this.normalChoices = build?.normalChoices || 0
    this.huntMarkLevel = build?.huntMarkLevel || 0; this.huntPursuitLevel = build?.huntPursuitLevel || 0; this.huntReapLevel = build?.huntReapLevel || 0
    this.swarmAssaultLevel = build?.swarmAssaultLevel || 0; this.swarmReapLevel = build?.swarmReapLevel || 0
    this.bladeArcLevel = build?.bladeArcLevel || 0; this.bladeEchoLevel = build?.bladeEchoLevel || 0
    this.huntTarget = null; this.huntMarkTimer = 0
    this.huntFollowupReady = false; this.huntFollowupTimer = 0
    this.time = 0; this.domains = []; this.echoQueue = []
    this.cleaveCooldown = 0
    this.echoes ??= []; this.impacts ??= []; this.cleaves ??= []
    this.echoes.length = 0; this.impacts.length = 0; this.cleaves.length = 0
  }
  get player() { return this.weapon.player }
  get game() { return this.weapon.game }
  get enabled() { return this.weapon.game?.startingStrain === 'shadow' }
  get available() { return this.enabled && !this.player.dead && !this.weapon.game.runFinished }
  get pose() { return this.available ? shadowPose(this) : null }
  get canFollowup() { return this.routeUltimate === 'hunt' && this.huntFollowupReady && this.huntFollowupTimer > 0 && !this.assault }
  get huntMarkBonus() { return Math.min(.72, .12 + Math.min(8, this.huntPursuitLevel) * .06 + Math.max(0, this.huntPursuitLevel - 8) * .015) }
  get swarmCommandMultiplier() { return Math.min(3.1, 2 + Math.min(8, this.swarmAssaultLevel) * .12 + Math.max(0, this.swarmAssaultLevel - 8) * .035) }
  get bladeRangeBonus() { return Math.min(90, Math.min(8, this.bladeArcLevel) * 9 + Math.max(0, this.bladeArcLevel - 8) * 3) }
  get bladeMaxTargets() { return Math.min(10, 4 + Math.min(6, this.bladeArcLevel)) }
  get bladeEchoMultiplier() { return Math.min(.68, .3 + Math.min(6, this.bladeEchoLevel) * .05 + Math.max(0, this.bladeEchoLevel - 6) * .02) }
  get reach() { return this.player.radius + SHADOW_BLADE_REACH + (this.route === 'blade' ? this.bladeRangeBonus : 0) }

  chooseRoute(route) {
    if (!this.enabled || !SHADOW_ROUTES[route] || !shadowRouteReady(this.game) || !(this.game.skillLevels?.[SHADOW_ROUTES[route].seed] > 0)) return false
    this.route = route
    return true
  }

  hud() {
    const route = SHADOW_ROUTES[this.route]
    const ids = this.route === 'hunt' ? ['shadow_hunt_mark','shadow_hunt_pursuit','shadow_hunt_reap']
      : this.route === 'swarm' ? ['ass_echo','shadow_swarm_assault','shadow_swarm_reap']
        : this.route === 'blade' ? ['ass_cleave','shadow_blade_arc','shadow_blade_echo'] : []
    const investment = ids.reduce((sum, id) => sum + (this.game.skillLevels?.[id] || 0), 0)
    const ultimateReady = !!route && !this.routeUltimate && (this.player.level || 1) >= 14 &&
      shadowProgressReady(this.game, true) && investment >= 4
    const entryCount = Object.values(SHADOW_ROUTES).filter(item => (this.game.skillLevels?.[item.seed] || 0) > 0).length
    return { route: this.route, routeName: route?.name || '暗影探索', routeColor: route?.color || null,
      normalChoices: this.normalChoices, routeInvestment: investment, ultimate: this.routeUltimate,
      ultimateName: route?.ultimateName || '', ultimateReady, routeReady: shadowRouteReady(this.game),
      entryCount, followup: this.canFollowup,
      marked: alive(this.huntTarget) && this.huntMarkTimer > 0 }
  }

  markHuntTarget(enemy) {
    if (this.route !== 'hunt' || !(this.game.skillLevels?.shadow_hunt_mark > 0) || !alive(enemy)) return
    this.huntTarget = enemy
    this.huntMarkTimer = Math.min(6, 3.5 + this.huntPursuitLevel * .25)
  }

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
    const followup = this.canFollowup
    const angle = this.direction(), end = this.destination(angle)
    if (Math.hypot(end.x - this.player.x, end.y - this.player.y) < 4) return false
    this.swing = null; this.flash = null
    this.assault = { angle, end, phase: 'windup', elapsed: 0, hitTargets: new Set(), cloneIds: new Set(this.clones.items.map(c => c.id)), primaryUsed: false, refunded: false }
    if (followup) { this.huntFollowupReady = false; this.huntFollowupTimer = 0; this.assault.isFollowup = true }
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
        if (primary) { this.markHuntTarget(e); this.clones.command(e, a.cloneIds) }
        const result = this.hit(e, primary ? SHADOW_ASSAULT_DAMAGE : SHADOW_ASSAULT_SPLASH, { guaranteed: primary, angle: a.angle, action: a })
        if (result.killed && !a.refunded && !a.isFollowup && this.available) {
          a.refunded = true
          const refund = this.route === 'hunt'
            ? Math.min(1.8, SHADOW_DASH_REFUND + Math.min(6, this.huntReapLevel) * .16 + Math.max(0, this.huntReapLevel - 6) * .08)
            : SHADOW_DASH_REFUND
          p.strainSkillCd = Math.max(0, p.strainSkillCd - refund)
          this.weapon.enemyManager.addText(p.x, p.y - 42, `影袭收割 · 影袭 −${refund.toFixed(2)}秒`, null, '#f18d9e', 13)
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
      if (this.routeUltimate === 'hunt' && a.primaryUsed && !a.isFollowup) {
        this.huntFollowupReady = true
        this.huntFollowupTimer = 1.25
      }
      if (this.routeUltimate === 'blade') this.createDomain(p.x, p.y, a.angle)
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
    const markMultiplier = this.route === 'hunt' && enemy === this.huntTarget && this.huntMarkTimer > 0 ? 1 + this.huntMarkBonus : 1
    const crit = !secondary && (guaranteed || (!action?.hitTargets && p.guaranteedCrit) || Math.random() < ws.critChance)
    let power = crit ? (ws.critMul || 3) : 1
    if (crit && ws.executeCrit && enemy.hp <= enemy.maxHp * 0.5) power *= 2
    const before = enemy.hp
    enemy.hit(ws.damage * ws.levelMul * ws.devourDamageMul * multiplier * markMultiplier * power)
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

  onCloneKill(clone, enemy) {
    if (this.route !== 'swarm' || this.swarmReapLevel <= 0) return
    const recovery = Math.min(1.5, Math.min(6, this.swarmReapLevel) * .2 + Math.max(0, this.swarmReapLevel - 6) * .05)
    for (const other of this.clones.items) {
      if (other === clone || other.life <= 0 || Math.hypot(other.x - enemy.x, other.y - enemy.y) > 300) continue
      other.life = Math.min(other.maxLife, other.life + recovery)
    }
  }

  /** A short transverse cut clears the target's flanks. Cannot crit, recurse or refund F. */
  cleave(origin, angle) {
    const config = SHADOW_CLEAVE[this.player.shadowCleaveLevel - 1]
    if (!config || this.cleaveCooldown > 0 || !this.available) return
    this.cleaveCooldown = config.cooldown
    const reach = config.reach + (this.route === 'blade' ? this.bladeRangeBonus : 0)
    const maxTargets = this.route === 'blade' ? this.bladeMaxTargets : 4
    const cross = angle + Math.PI / 2
    const dx = Math.cos(cross) * reach, dy = Math.sin(cross) * reach
    const targets = this.targets(origin.x - dx, origin.y - dy, origin.x + dx, origin.y + dy, config.width)
      .filter(e => e !== origin)
      .sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y))
      .slice(0, maxTargets)
    this.cleaves.push({ x: origin.x, y: origin.y, angle: cross, reach, width: config.width, life: 0.2 })
    if (this.route === 'blade' && this.bladeEchoLevel > 0 && this.echoQueue.length < 12) {
      this.echoQueue.push({ due: this.time + .18, x: origin.x, y: origin.y, angle: cross, reach, width: config.width,
        damage: this.bladeEchoMultiplier, maxTargets })
    }
    for (const e of targets) {
      if (!this.available) break
      this.hit(e, config.damage, { angle: cross, secondary: true })
    }
  }

  update(dt) {
    if (!this.available) { this.reset(); return }
    this.time += dt
    this.clones.update(dt)
    if (!this.available) return
    this.cleaveCooldown = Math.max(0, this.cleaveCooldown - dt)
    this.huntMarkTimer = Math.max(0, this.huntMarkTimer - dt)
    if (!this.huntMarkTimer || !alive(this.huntTarget)) this.huntTarget = null
    if (this.huntFollowupTimer > 0) {
      this.huntFollowupTimer = Math.max(0, this.huntFollowupTimer - dt)
      if (!this.huntFollowupTimer) this.huntFollowupReady = false
    }
    this.updateEchoes()
    this.updateDomains(dt)
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

  updateEchoes() {
    for (let i = this.echoQueue.length - 1; i >= 0; i--) {
      const echo = this.echoQueue[i]
      if (echo.due > this.time) continue
      this.echoQueue.splice(i, 1)
      const dx = Math.cos(echo.angle) * echo.reach, dy = Math.sin(echo.angle) * echo.reach
      const targets = this.targets(echo.x - dx, echo.y - dy, echo.x + dx, echo.y + dy, echo.width)
        .sort((a, b) => Math.hypot(a.x - echo.x, a.y - echo.y) - Math.hypot(b.x - echo.x, b.y - echo.y))
        .slice(0, echo.maxTargets)
      this.cleaves.push({ x: echo.x, y: echo.y, angle: echo.angle, reach: echo.reach, width: echo.width, life: .2, echo: true })
      for (const enemy of targets) {
        if (!this.available) break
        this.hit(enemy, echo.damage, { angle: echo.angle, secondary: true })
      }
    }
  }

  createDomain(x, y, angle) {
    if (this.domains.length >= 3) this.domains.shift()
    this.domains.push({ x, y, angle, life: 1.65, timer: 0 })
  }

  updateDomains(dt) {
    for (let i = this.domains.length - 1; i >= 0; i--) {
      const domain = this.domains[i]
      domain.life -= dt; domain.timer -= dt
      if (domain.life <= 0) { this.domains.splice(i, 1); continue }
      if (domain.timer > 0) continue
      domain.timer = .42
      const radius = 92 + Math.min(60, this.bladeArcLevel * 6)
      const targets = this.weapon.enemyManager.enemies
        .filter(enemy => alive(enemy) && (enemy.x - domain.x) ** 2 + (enemy.y - domain.y) ** 2 <= radius ** 2)
        .sort((a, b) => (a.x - domain.x) ** 2 + (a.y - domain.y) ** 2 - ((b.x - domain.x) ** 2 + (b.y - domain.y) ** 2))
        .slice(0, 12)
      for (const enemy of targets) {
        if (!this.available) break
        this.hit(enemy, .62, { angle: domain.angle, secondary: true })
      }
    }
  }

  render(ctx) { if (this.available) renderShadowCombat(ctx, this) }
}
