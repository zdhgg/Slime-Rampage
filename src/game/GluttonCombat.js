import {
  DEVOUR_SOURCE_GLUTTON, DEVOUR_SOURCE_NORMAL, GLUTTON_FEAST_DURATION,
  gluttonSkillHud, hasGluttonResource, onGluttonBossBasicHit,
} from './GluttonResource.js'
import { bitePose, renderBiteFeedback, renderBiteMotion, renderCorrodeAura, renderGluttonGuard, renderMires } from './effects/GluttonBiteVisual.js'
import {
  GLUTTON_ROUTES, GLUTTON_RULES,
  getGluttonEndlessDamageMultiplier, getGluttonHeavyDamageMultiplier, getGluttonHeavyReachMultiplier,
  gluttonAcidAuraBonusAt, gluttonAcidAuraDamageAt, gluttonAcidAuraVulnAt,
  gluttonBreachDamageAt, gluttonBreachVulnAt,
  gluttonCounterDamageAt, gluttonCounterRadiusAt,
  gluttonCowDurationAt, gluttonCowPowerAt,
  gluttonFrenzyArcDegAt, gluttonFrenzyHasteAt,
  gluttonPounceResetCapRatioAt, gluttonPounceResetPerKillAt,
  gluttonProgressReady, gluttonRouteInvestment, gluttonRouteReady,
} from './GluttonBuild.js'
import { traceShadowPath } from './ShadowGeometry.js'

const TAU = Math.PI * 2
/** 从 a 转到 b 的最短有符号角差。 */
const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from))
/** 以有限角速度转向，避免单帧直接翻到身后。 */
const turnToward = (from, to, maxStep) => {
  const delta = angleDelta(from, to)
  return Math.abs(delta) <= maxStep ? to : from + Math.sign(delta) * maxStep
}
const angleTo = (player, enemy) => Math.atan2(enemy.y - player.y, enemy.x - player.x)
const alive = e => !!e?.active && !e.devouring && e.hp > 0

export const GLUTTON_BITE_REACH = 52
export const GLUTTON_BITE_ARC = Math.PI * 5 / 6 // 150° 宽幅扫咬
export const GLUTTON_BITE_WINDUP = 0.14
export const GLUTTON_BITE_STRIKE = 0.045
export const GLUTTON_BITE_DAMAGE = 1.25

export const GLUTTON_VORTEX_COOLDOWN = 6.0
export const GLUTTON_VORTEX_WINDUP = 0.18
export const GLUTTON_VORTEX_PULL_RADIUS = 190
export const GLUTTON_VORTEX_BITE_RADIUS = 92
export const GLUTTON_VORTEX_DAMAGE = 2.6
export const GLUTTON_BOSS_VORTEX_DAMAGE = 3.8
export const GLUTTON_VORTEX_PULL_SPEED = 480

// 兼容导出别名（确保测试/UI 引用不断裂）
export const GLUTTON_POUNCE_COOLDOWN = GLUTTON_VORTEX_COOLDOWN
export const GLUTTON_POUNCE_WINDUP = GLUTTON_VORTEX_WINDUP
export const GLUTTON_POUNCE_TIME = GLUTTON_VORTEX_WINDUP
export const GLUTTON_POUNCE_DISTANCE = GLUTTON_VORTEX_PULL_RADIUS
export const GLUTTON_POUNCE_SLAM_RADIUS = GLUTTON_VORTEX_BITE_RADIUS
export const GLUTTON_POUNCE_DAMAGE = GLUTTON_VORTEX_DAMAGE
export const GLUTTON_BOSS_POUNCE_DAMAGE = GLUTTON_BOSS_VORTEX_DAMAGE
export const GLUTTON_HEAVY_REACH = GLUTTON_VORTEX_BITE_RADIUS
export const GLUTTON_HEAVY_ARC = Math.PI
export const GLUTTON_HEAVY_DAMAGE = GLUTTON_VORTEX_DAMAGE
export const GLUTTON_BOSS_HEAVY_DAMAGE = GLUTTON_BOSS_VORTEX_DAMAGE
export const GLUTTON_HEAVY_WINDUP = GLUTTON_VORTEX_WINDUP
export const GLUTTON_HEAVY_STRIKE = GLUTTON_VORTEX_WINDUP
export const GLUTTON_HEAVY_SNOWBALL_CAP = 1.55

export const GLUTTON_AURA_BASE_RADIUS = 48
export const GLUTTON_AURA_BASE_INTERVAL = 0.55
export const GLUTTON_AURA_BASE_DAMAGE = 0.26

export const GLUTTON_GUARD_BASE_MAX = 1
export const GLUTTON_GUARD_COOLDOWN = 2.8
export const GLUTTON_HEAL_COOLDOWN = 3.5

export const GLUTTON_COUNTER_BASE_RADIUS = 84
export const GLUTTON_COUNTER_BASE_DAMAGE = 0.65
export const GLUTTON_COUNTER_BASE_COOLDOWN = 0.9

export const GLUTTON_SATIETY_RADIUS = 130
export const GLUTTON_SATIETY_DAMAGE = 1.45

/** 兼容旧导出名 */
export const GLUTTON_OVERFLOW = Object.freeze({ devours: 6, cooldown: 1.5, radius: GLUTTON_SATIETY_RADIUS, damage: GLUTTON_SATIETY_DAMAGE, targets: 14 })

export const GLUTTON_FORWARD_HALF_ARC = Math.PI * 5 / 9
export const GLUTTON_AIM_SNAP_LIMIT = Math.PI / 3
export const GLUTTON_AIM_TURN_RATE = 14
export const GLUTTON_TARGET_STICKY = 1.22
export const GLUTTON_AIM_MAX_TIME = 0.25

/** 圆形目标与扇形相交；范围、预览和结算共享同一份几何判定。 */
export function inBiteSector(player, enemy, angle, reach, arc) {
  if (!enemy?.active || enemy.devouring || !(enemy.hp > 0)) return false
  if (arc >= TAU - 1e-6) {
    const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y)
    return distance <= reach + (enemy.radius || 0)
  }
  const dx = enemy.x - player.x
  const dy = enemy.y - player.y
  const distance = Math.hypot(dx, dy)
  const radius = enemy.radius || 0
  if (distance > reach + radius) return false
  if (distance <= radius) return true
  const delta = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - angle), Math.cos(Math.atan2(dy, dx) - angle)))
  if (delta <= arc / 2) return true
  const cosine = Math.cos(delta - arc / 2)
  const nearest = Math.max(0, Math.min(reach, distance * cosine))
  return distance * distance + nearest * nearest - 2 * distance * nearest * cosine <= radius * radius + 1e-8
}

/** 暴食战斗系统：宽幅扫咬、体表腐蚀光环、节律胃铠与酸刺反震、深渊吸噬聚怪重咬、饱食酸浪。 */
export class GluttonCombat {
  constructor(weapon) {
    this.weapon = weapon
    this.reset()
  }

  clearTransient() {
    this.swing = null
    this.flash = null
    this.vortex = null
    this.impacts = []
    this.morsels = []
    this.acidBursts = []
    this.vortices = []
    this.slams = []
    this.spikes = []
    this.auraPulses = []
    this.guardShatters = []
    this.guardPulse = 0
    this._groundRendered = false
    this.acidPending = false
    this.acidSource = DEVOUR_SOURCE_NORMAL
    this.acidCooldown = 0
    this.satietyPending = false
    this.aimAngle = this.weapon?.player?.facing ?? -Math.PI / 2
    this.aimTarget = null
    this.mires = []
    this.auraTimer = 0.25
    this.overflowGuardCooldown = 0
  }

  reset() {
    this.clearTransient()
    this.acidBurstSeq = 0
    this.route = null
    this.normalChoices = 0
  }

  get game() { return this.weapon.game }
  get player() { return this.weapon.player }
  get enabled() { return this.weapon.game?.startingStrain === 'glutton' }
  get biteUnlocked() { return this.enabled }
  get routeInfo() { return GLUTTON_ROUTES[this.route] || null }
  get endlessDamageMultiplier() { return getGluttonEndlessDamageMultiplier(this.weapon.game?.skillLevels) }
  get canPounceFollowup() { return false }
  get guardMax() {
    const p = this.player
    return GLUTTON_GUARD_BASE_MAX + (p?.gluttonBulkGuardBonus || 0) + (this.route === 'shell' ? 1 : 0) + (p?.gluttonShellUltimate ? 1 : 0)
  }
  refreshStats() {}

  chooseRoute(route) {
    if (!this.enabled || !GLUTTON_ROUTES[route] || !gluttonRouteReady(this.game) || !this.game.skillLevels?.[GLUTTON_ROUTES[route].seed]) return false
    this.route = route
    this.weapon._weaponPulse = 0.7
    if (route === 'jaw') this.grantGuard(true)
    return true
  }

  hud() {
    const route = this.routeInfo
    return {
      route: this.route, name: route?.name || '暴食探索', icon: route?.icon || '🍽️', color: route?.color || '#ff9f43',
      investment: route ? gluttonRouteInvestment(this.game, this.route) : 0,
      normalChoices: this.normalChoices, routeReady: gluttonRouteReady(this.game), progressReady: gluttonProgressReady(this.game),
      ultimate: !!(route && this.game.skillLevels?.[route.ultimate]), ultimateName: route?.ultimateName || '',
      ultimateReady: !!(route && this.game.player?.level >= GLUTTON_RULES.ultimateLevel && gluttonProgressReady(this.game, true)),
      note: route ? `${route.name}已锁定 · ${route.ultimateName}为互斥终极` : `前期随机探索 · 选卡满${GLUTTON_RULES.choicesBeforeRoute}次且第${GLUTTON_RULES.routeWave}波／远征第${GLUTTON_RULES.routeStage}章后确认路线`,
    }
  }

  hudStatus() {
    const base = gluttonSkillHud(this.player)
    if (!base) return null
    return { ...base, route: this.route }
  }

  get pose() { return this.biteUnlocked && !this.player.dead ? bitePose(this.swing, this.flash, this.vortex) : null }

  reach(heavy = false) {
    const p = this.player
    if (heavy) {
      return p.radius + GLUTTON_VORTEX_BITE_RADIUS * getGluttonHeavyReachMultiplier(p.gluttonHeavyLevel) *
        (p.isGluttonyLord ? 1.25 : 1) * (this.weapon.geneRangeMul || 1)
    }
    return p.radius + GLUTTON_BITE_REACH * (p.isGluttonyLord ? 1.2 : 1) * (this.weapon.geneRangeMul || 1)
  }

  pullRadius() {
    const p = this.player
    return p.radius + GLUTTON_VORTEX_PULL_RADIUS * getGluttonHeavyReachMultiplier(p.gluttonHeavyLevel) *
      (p.isGluttonyLord ? 1.25 : 1) * (this.route === 'jaw' && p.gluttonJawUltimate ? 1.3 : 1) *
      (this.weapon.geneRangeMul || 1)
  }

  biteArc() {
    const p = this.player
    const sweepRad = (p.gluttonBiteSweepLevel || 0) * (Math.PI / 10) // +18°/级
    const frenzyRad = p.gluttonFrenzyTimer > 0 && p.gluttonFrenzyJawLevel > 0
      ? gluttonFrenzyArcDegAt(p.gluttonFrenzyJawLevel) * Math.PI / 180
      : 0
    return Math.min(TAU, GLUTTON_BITE_ARC + sweepRad + frenzyRad)
  }

  biteHasteMultiplier() {
    const p = this.player
    const sweepHaste = 1 + (p.gluttonBiteSweepLevel || 0) * 0.06
    const frenzyHaste = p.gluttonFrenzyTimer > 0 && p.gluttonFrenzyJawLevel > 0
      ? 1 + gluttonFrenzyHasteAt(p.gluttonFrenzyJawLevel)
      : 1
    return sweepHaste * frenzyHaste
  }

  auraRadius() {
    const p = this.player
    const mawBonus = (p.gluttonMawAuraLevel || 0) * 10
    const acidBonus = gluttonAcidAuraBonusAt(p.gluttonAcidAuraLevel)
    const tomeBonus = this.game?.bossTomes?.gluttonRadianceRadiusBonus?.() || 0
    return (p.radius + GLUTTON_AURA_BASE_RADIUS + mawBonus + acidBonus + tomeBonus) *
      (this.route === 'mire' ? 1.15 : 1) * (p.isGluttonyLord ? 1.2 : 1) * (this.weapon.geneRangeMul || 1)
  }

  auraInterval() {
    const acidLv = this.player.gluttonAcidAuraLevel || 0
    return this.route === 'mire' ? Math.max(0.32, 0.45 - acidLv * 0.025) : GLUTTON_AURA_BASE_INTERVAL
  }

  auraDamage() {
    const p = this.player
    const base = this.weapon.damage * this.weapon.levelMul * this.weapon.devourDamageMul * this.endlessDamageMultiplier
    const acidMul = gluttonAcidAuraDamageAt(p.gluttonAcidAuraLevel)
    const routeMul = this.route === 'mire' ? 1.18 : 1
    const lordMul = p.isGluttonyLord ? 1.2 : 1
    const tomeMul = this.game?.bossTomes?.gluttonRadianceDamageMultiplier?.() || 1
    return base * GLUTTON_AURA_BASE_DAMAGE * acidMul * routeMul * lordMul * tomeMul
  }

  aimReference() {
    const facing = this.player.facing
    return Number.isFinite(facing) ? facing : -Math.PI / 2
  }

  nearest(heavy = false) {
    const reach = this.reach(heavy)
    const facing = this.aimReference()
    const current = this.aimTarget
    let frontBest = null, frontEdge = Infinity
    let anyBest = null, anyEdge = Infinity
    let currentEdge = Infinity, currentFront = false, currentSeen = false

    for (const e of this.weapon.enemyManager.enemies) {
      if (!alive(e)) continue
      const dx = e.x - this.player.x
      const dy = e.y - this.player.y
      const radius = e.radius || 0
      const distance = Math.hypot(dx, dy)
      if (distance > reach + radius) continue
      const edge = distance - radius
      const front = Math.abs(angleDelta(facing, Math.atan2(dy, dx))) <= GLUTTON_FORWARD_HALF_ARC
      if (e === current) { currentSeen = true; currentEdge = edge; currentFront = front }
      if (edge < anyEdge) { anyEdge = edge; anyBest = e }
      if (front && edge < frontEdge) { frontEdge = edge; frontBest = e }
    }

    const preferred = frontBest || anyBest
    if (!preferred) { this.aimTarget = null; return null }
    if (currentSeen && current !== preferred) {
      const preferredFront = !!frontBest
      if (currentFront && !preferredFront) return current
      if (!currentFront && preferredFront) { this.aimTarget = preferred; return preferred }
      const preferredEdge = preferred === frontBest ? frontEdge : anyEdge
      if (currentEdge <= preferredEdge * GLUTTON_TARGET_STICKY) return current
    }
    this.aimTarget = preferred
    return preferred
  }

  bite(target = null, heavy = false) {
    if (!this.enabled || this.player.dead || this.weapon.game.runFinished) return false
    if (heavy) return this.useVortex()
    if (this.vortex || this.swing) return false
    const chosen = target || this.nearest(false)
    if (!chosen) return false
    const desired = angleTo(this.player, chosen)
    const reach = this.reach(false)
    if (!inBiteSector(this.player, chosen, desired, reach, Math.PI)) return false
    const pace = Math.min(1, Math.max(0.55, this.weapon.attackInterval / 0.4))
    const windup = GLUTTON_BITE_WINDUP * pace
    const strike = GLUTTON_BITE_STRIKE * pace
    const gap = Math.abs(angleDelta(this.aimAngle, desired))
    const needsTurn = gap > GLUTTON_AIM_SNAP_LIMIT
    const aimDuration = needsTurn ? Math.min(GLUTTON_AIM_MAX_TIME, gap / GLUTTON_AIM_TURN_RATE + 0.02) : 0
    if (!needsTurn) this.aimAngle = desired

    this.flash = null
    this.aimTarget = chosen
    this.swing = {
      target: chosen,
      angle: needsTurn ? this.aimAngle : desired,
      desiredAngle: desired,
      reach, arc: this.biteArc(),
      remaining: needsTurn ? aimDuration : windup,
      windup, strike, heavy: false,
      phase: needsTurn ? 'aim' : 'windup',
      aimDuration,
      recovery: Math.min(0.14, this.weapon.attackInterval * 0.22),
    }
    return true
  }

  /** 深渊吸噬（Space 主动）：向内强吸聚怪后原地 360° 重咬，立刻获得 1 层胃铠，无无敌位移。 */
  useVortex() {
    if (!this.enabled || this.player.dead || this.game.runFinished || this.vortex) return false
    const p = this.player
    const pullRadius = this.pullRadius()
    const biteRadius = this.reach(true)
    this.swing = null
    this.flash = null
    this.grantGuard(true)
    this.aimAngle = this.aimReference()
    this.vortex = {
      phase: 'inhale',
      elapsed: 0,
      windup: GLUTTON_VORTEX_WINDUP * (this.game?.bossTomes?.heavyWindup?.() || 1),
      pullRadius,
      biteRadius,
      angle: this.aimAngle,
    }
    this.vortices.push({ x: p.x, y: p.y, pullRadius, biteRadius, life: 0.26, maxLife: 0.26 })
    if (this.vortices.length > 6) this.vortices.shift()
    return true
  }

  usePounce() { return this.useVortex() }
  heavyBite() { return this.useVortex() }

  _pullVortexTargets(vortex, dt) {
    const p = this.player
    const pullSpeed = GLUTTON_VORTEX_PULL_SPEED * (this.weapon.geneRangeMul || 1)
    for (const enemy of this.weapon.enemyManager.enemies) {
      if (!alive(enemy) || enemy.isBoss || enemy.isEnraged) continue
      const dx = p.x - enemy.x
      const dy = p.y - enemy.y
      const dist = Math.hypot(dx, dy)
      const minStop = p.radius + (enemy.radius || 0) + 4
      if (dist <= minStop || dist > vortex.pullRadius + (enemy.radius || 0)) continue
      const angle = Math.atan2(dy, dx)
      const step = Math.min(dist - minStop, pullSpeed * dt)
      if (step <= 0) continue
      const end = traceShadowPath(this.game, enemy, angle, step, enemy.radius)
      enemy.x = end.x
      enemy.y = end.y
      enemy._devourPullT = 0.12
    }
  }

  _settleVortexCrunch(vortex) {
    if (this.player.dead || this.game.runFinished) return
    const p = this.player
    const biteRadius = vortex.biteRadius
    const ignoreShield = this.route === 'jaw'
    const dmgBase = this.weapon.damage * this.weapon.levelMul * Math.min(GLUTTON_HEAVY_SNOWBALL_CAP, this.weapon.devourDamageMul * this.endlessDamageMultiplier) *
      getGluttonHeavyDamageMultiplier(p.gluttonHeavyLevel) * (1 + gluttonBreachDamageAt(p.gluttonBreachLevel)) *
      (p.isGluttonyLord ? 1.2 : 1)

    this.game.mapFeatures?.attackBarricades(p.x, p.y, biteRadius)
    const targets = this.weapon.enemyManager.enemies.filter(e =>
      alive(e) && Math.hypot(e.x - p.x, e.y - p.y) <= biteRadius + (e.radius || 0)
    )
    let landed = false
    let bossHit = false
    let hitCount = 0
    const killsBefore = this.weapon.kills
    const devoursBefore = this.weapon.devours

    for (const e of targets) {
      if (p.dead || this.game.runFinished) break
      if (ignoreShield && e.shieldHits > 0) e.shieldHits = 0
      const mult = e.isBoss ? GLUTTON_BOSS_VORTEX_DAMAGE : GLUTTON_VORTEX_DAMAGE
      const damage = dmgBase * mult
      const hit = this.hit(e, damage, { source: DEVOUR_SOURCE_GLUTTON, execute: !!p.isGluttonyLord, heavy: true, ignoreShield })
      landed ||= hit
      if (hit) {
        hitCount++
        this.impact(e, { angle: Math.atan2(e.y - p.y, e.x - p.x), heavy: true }, e.x, e.y)
        if (p.gluttonBreachLevel > 0 && e.active && !e.devouring) {
          e.gluttonBreachTime = Math.max(e.gluttonBreachTime || 0, 3.0)
          e.gluttonBreachVuln = Math.max(e.gluttonBreachVuln || 0, gluttonBreachVulnAt(p.gluttonBreachLevel))
        }
        if (e.isBoss) {
          bossHit = true
          this.queueAcid(DEVOUR_SOURCE_GLUTTON)
        } else if (e.active && !e.devouring) {
          e.gluttonStagger = Math.max(e.gluttonStagger || 0, 0.4)
          e.corrodeSlowTime = Math.max(e.corrodeSlowTime || 0, 1.0)
          e.corrodeSlowAmount = Math.max(e.corrodeSlowAmount || 0, 0.35)
        }
      }
    }

    if (this.route === 'jaw' && (p.gluttonAftershockLevel > 0 || p.gluttonJawUltimate)) {
      this.aftershock(vortex.angle, Math.max(1, p.gluttonAftershockLevel || 0),
        this.weapon.damage * this.weapon.levelMul * this.weapon.devourDamageMul * this.endlessDamageMultiplier,
        !!p.gluttonJawUltimate, true)
    }
    const totalKillsAndDevours = Math.max(0, Math.max(this.weapon.kills - killsBefore, this.weapon.devours - devoursBefore))
    if (p.gluttonJawUltimate && totalKillsAndDevours >= 3) {
      p.gluttonBerserkTimer = 3.0
      this.weapon.enemyManager.addText(p.x, p.y - 52, '断岳狂怒!', null, '#f28a59', 15)
    }
    if (p.devourAcidBurst > 0) this.queueAcid(DEVOUR_SOURCE_GLUTTON)
    if (this.route === 'mire' && p.gluttonMireLevel > 0) this.spawnMire(p.x, p.y)
    if (p.gluttonFrenzyJawLevel > 0) p.gluttonFrenzyTimer = 3.0
    if (this.game?.bossTomes) this.game.bossTomes.onPounceLanding?.(p, targets)

    if (p.gluttonPounceResetLevel > 0 && totalKillsAndDevours > 0 && p.strainSkillCd > 0) {
      const perKill = gluttonPounceResetPerKillAt(p.gluttonPounceResetLevel)
      const cap = (p.strainSkillMax || GLUTTON_VORTEX_COOLDOWN) * gluttonPounceResetCapRatioAt(p.gluttonPounceResetLevel)
      const refund = Math.min(cap, totalKillsAndDevours * perKill, p.strainSkillCd)
      if (refund > 0) {
        p.strainSkillCd = Math.max(0, p.strainSkillCd - refund)
        this.weapon.enemyManager.addText(p.x, p.y - 44, `血宴连噬 −${refund.toFixed(1)}s`, null, '#f28a59', 13)
      }
    }

    this.weapon.stats.heavyBites = (this.weapon.stats.heavyBites || 0) + 1
    this.flash = { angle: vortex.angle, reach: biteRadius, arc: Math.PI, heavy: true, x: p.x, y: p.y, life: 0.2, maxLife: 0.2 }
    this.slams.push({
      x: p.x, y: p.y, radius: biteRadius,
      color: this.route === 'jaw' ? '#f28a59' : this.route === 'mire' ? '#b5d66f' : '#e3bd73',
      life: 0.26, maxLife: 0.26,
    })
    if (this.slams.length > 6) this.slams.shift()
    this.weapon.game.sound.bite(true, landed)
    if (landed) {
      this.game.combatFeedback?.impact({ hits: hitCount, kills: totalKillsAndDevours, angle: vortex.angle })
      this.weapon.game.shakeScreen(bossHit ? 5 : 3.5, bossHit ? 0.16 : 0.12)
    }
    this.weapon.cooldown = Math.min(this.weapon.cooldown, 0.12)
  }

  grantGuard(force = false) {
    const p = this.player
    if (!this.biteUnlocked || p.dead || (!force && p.gluttonGuardCooldown > 0)) return
    const cap = this.guardMax
    if (p.gluttonGuard >= cap) {
      // 满层不再无限续满整管计时，确保长时间贴脸仍需节奏补甲或会自然褪层
      this.guardPulse = 0.22
      if (p.gluttonShellUltimate && this.overflowGuardCooldown <= 0) {
        this.overflowGuardCooldown = 0.8
        this.counterPulse({ blocked: true, ultimate: true })
      }
      return
    }
    if (p.gluttonGuard <= 0) {
      p.gluttonGuard = 1
      p.gluttonGuardTimer = p.gluttonGuardDuration
    } else {
      p.gluttonGuard = Math.min(cap, p.gluttonGuard + 1)
      p.gluttonGuardTimer = Math.min(p.gluttonGuardDuration, Math.max(p.gluttonGuardTimer, p.gluttonGuardDuration * 0.45) + 1.1)
    }
    if (!force) p.gluttonGuardCooldown = GLUTTON_GUARD_COOLDOWN
    this.guardPulse = 0.24
  }

  spawnGuardShatter(count = 6) {
    const p = this.player
    if (!p || this.game?.runFinished) return
    const isShell = this.route === 'shell'
    const rx = p.radius * 1.28
    const ry = p.radius * 0.96
    const cy = p.y + p.radius * 0.14
    const baseAngle = (p.elapsed || 0) * 0.42
    for (let i = 0; i < count; i++) {
      const a = baseAngle + (i / count) * TAU + Math.sin(i * 7.3 + (p.elapsed || 0) * 19) * 0.35
      const speed = 95 + (i % 3) * 38
      this.guardShatters.push({
        x: p.x + Math.cos(a) * rx * 0.92,
        y: cy + Math.sin(a) * ry * 0.92,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 18,
        angle: a,
        spin: (i % 2 ? 1 : -1) * (3.5 + (i % 3) * 1.6),
        size: 4.2 + (i % 3) * 1.2,
        shell: isShell,
        life: 0.32,
        maxLife: 0.32,
      })
    }
    while (this.guardShatters.length > 24) this.guardShatters.shift()
  }

  /** 胃铠挡伤或本体受击时触发 360° 酸刺反震与蓄甲爆刺。 */
  onHurt({ blocked = false } = {}) {
    if (!this.enabled || this.player.dead || this.game.runFinished) return
    if (blocked) this.spawnGuardShatter(this.player.gluttonShellUltimate ? 8 : 6)
    const p = this.player
    if (p.gluttonThornsSurgeLevel > 0) {
      p.gluttonThornsSurgeCount = (p.gluttonThornsSurgeCount || 0) + 1
      if (p.gluttonThornsSurgeCount >= 3) {
        p.gluttonThornsSurgeCount = 0
        this.counterPulse({ blocked: true, surge: true })
        this.grantGuard(true)
      }
    }
    if (p.gluttonCounterCooldown > 0) return
    const baseCd = GLUTTON_COUNTER_BASE_COOLDOWN * (this.route === 'shell' ? 0.75 : 1) * (p.gluttonShellUltimate ? 0.75 : 1)
    p.gluttonCounterCooldown = baseCd
    this.counterPulse({ blocked, ultimate: !!p.gluttonShellUltimate })
    if (blocked && p.gluttonShellUltimate && p.strainSkillCd > 0) {
      p.strainSkillCd = Math.max(0, p.strainSkillCd - 0.5)
    }
  }

  onGuardBlocked() {
    this.onHurt({ blocked: true })
  }

  counterPulse({ blocked = true, ultimate = false, surge = false } = {}) {
    if (!this.enabled || this.player.dead || this.game.runFinished) return
    const p = this.player
    const level = p.gluttonCounterLevel || 0
    const baseRadius = level > 0 ? gluttonCounterRadiusAt(level) : GLUTTON_COUNTER_BASE_RADIUS
    const tomeRadius = this.game?.bossTomes?.gluttonThornsRadiusBonus?.() || 0
    const radius = (p.radius + baseRadius + (this.route === 'shell' ? 20 : 0) + (surge ? 45 : 0) + tomeRadius) * (this.weapon.geneRangeMul || 1)
    const baseMult = level > 0 ? gluttonCounterDamageAt(level) : GLUTTON_COUNTER_BASE_DAMAGE
    const hpScale = 1 + p.maxHp * (level > 0 ? 0.045 : 0.02)
    const bulkScale = 1 + (p.gluttonBulkLevel || 0) * 0.15
    const surgeScale = surge ? [1.35, 1.75, 2.2][Math.min(2, (p.gluttonThornsSurgeLevel || 1) - 1)] : 1
    const ultimateScale = ultimate && blocked ? 1.5 : 1
    const tomeMul = this.game?.bossTomes?.gluttonThornsDamageMultiplier?.() || 1
    const damage = this.weapon.damage * this.weapon.levelMul * this.weapon.devourDamageMul * this.endlessDamageMultiplier *
      baseMult * hpScale * bulkScale * surgeScale * ultimateScale * (blocked ? 1 : 0.65) * tomeMul

    let hits = 0
    for (const enemy of [...this.weapon.enemyManager.enemies]) {
      if (p.dead || this.game.runFinished) break
      if (!alive(enemy) || Math.hypot(enemy.x - p.x, enemy.y - p.y) > radius + (enemy.radius || 0)) continue
      const before = enemy.hp
      enemy.hit(damage, { devourSource: DEVOUR_SOURCE_NORMAL, bossTomeContext: { gluttonCounter: true } })
      if (enemy.hp < before) hits++
      if (enemy.active && !enemy.devouring && !enemy.isBoss) {
        const dx = enemy.x - p.x, dy = enemy.y - p.y, d = Math.hypot(dx, dy) || 1
        enemy.x += dx / d * (surge ? 20 : 12)
        enemy.y += dy / d * (surge ? 20 : 12)
        if (p.gluttonCowLevel > 0) this.applyCow(enemy)
        if (ultimate && blocked) enemy.elementStun = Math.max(enemy.elementStun || 0, 0.3)
      }
      if (!enemy.active) this.weapon._onKill(enemy)
    }
    if (hits > 0) this.game?.bossTomes?.onGluttonThornsHit?.()
    this.spikes.push({
      x: p.x, y: p.y, radius, count: surge ? 16 : 10, surge,
      color: surge ? '#ffe082' : blocked ? '#e3bd73' : '#f29e6b',
      offset: (p.elapsed || 0) * 2, life: 0.22, maxLife: 0.22,
    })
    if (this.spikes.length > 8) this.spikes.shift()
    this.weapon._burstColor(p.x, p.y, surge ? '#ffe8a3' : '#f5d484', surge ? 12 : 7, false)
  }

  applyCow(enemy) {
    if (!enemy || enemy.isBoss || enemy.isEnraged || !(this.player.gluttonCowLevel > 0)) return
    enemy.gluttonCow = gluttonCowDurationAt(this.player.gluttonCowLevel)
    enemy.gluttonCowMul = gluttonCowPowerAt(this.player.gluttonCowLevel)
  }

  onDevoured(enemy) {
    if (!this.biteUnlocked || this.player.dead) return
    this.player.gluttonFeastTimer = GLUTTON_FEAST_DURATION
    const angle = this.swing?.angle ?? this.flash?.angle ?? Math.atan2(enemy.y - this.player.y, enemy.x - this.player.x)
    this.morsels.push({ x: enemy.x, y: enemy.y, angle, life: 0.3, maxLife: 0.3 })
    if (this.morsels.length > 20) this.morsels.shift()
    if (this.route === 'mire' && this.player.gluttonMireLevel > 0) this.spawnMire(enemy.x, enemy.y)
  }

  clearOverflow() {
    this.satietyPending = false
  }

  queueSatietyBurst() {
    if (!this.enabled || this.player.dead || this.game.runFinished) return
    this.satietyPending = true
  }

  releaseSatietyBurst() {
    this.satietyPending = false
    if (!this.enabled || this.player.dead || this.game.runFinished) return
    const p = this.player
    const radius = GLUTTON_SATIETY_RADIUS * (p.isGluttonyLord ? 1.2 : 1) * (this.weapon.geneRangeMul || 1)
    const damage = this.weapon.damage * this.weapon.levelMul * this.weapon.devourDamageMul * this.endlessDamageMultiplier * GLUTTON_SATIETY_DAMAGE
    for (const e of [...this.weapon.enemyManager.enemies]) {
      if (p.dead || this.game.runFinished) break
      if (!alive(e) || Math.hypot(e.x - p.x, e.y - p.y) > radius + (e.radius || 0)) continue
      const before = e.hp
      e.hit(damage, { devourSource: DEVOUR_SOURCE_NORMAL })
      this.weapon.stats.overflowDamage = (this.weapon.stats.overflowDamage || 0) + Math.max(0, before - Math.max(0, e.hp))
      if (!e.isBoss && e.active && !e.devouring) e.slow = Math.max(e.slow || 0, 0.8)
      if (!e.active) this.weapon._onKill(e)
    }
    p.gluttonSatietyBursts = (p.gluttonSatietyBursts || 0) + 1
    this.weapon.stats.overflowWaves = (this.weapon.stats.overflowWaves || 0) + 1
    p.gluttonFeastTimer = GLUTTON_FEAST_DURATION
    if (p.hp < p.maxHp && p.gluttonHealCooldown <= 0) {
      p.heal(1)
      p.gluttonHealCooldown = GLUTTON_HEAL_COOLDOWN
    } else {
      this.grantGuard(true)
    }
    this.game?.bossTomes?.onGluttonSatietyBurst?.(p)
    this.spawnAcidBurst(radius)
    this.weapon._ring(p.x, p.y, '#b7e88b', radius)
    this.weapon.enemyManager.addText(p.x, p.y - 54, '饱食酸浪', null, '#c6ee9e', 15)
  }

  spawnMire(x, y) {
    const level = this.player.gluttonMireLevel || 0
    if (level <= 0) return
    const radius = 64 + Math.min(7, level) * 8
    const duration = Math.min(4.0, 2.6 + level * 0.3)
    this.mires.push({ x, y, r: radius, life: duration, maxLife: duration, tick: 0 })
    if (this.mires.length > 8) this.mires.shift()
  }

  aftershock(angle, level, damage, ultimate = false, radial = false) {
    const radius = 140 + Math.min(8, level) * 14
    const waves = ultimate && radial ? 2 : 1
    for (let wave = 0; wave < waves; wave++) {
      const waveRadius = radius * (wave ? 1.25 : 1)
      const waveDamage = damage * (0.45 + Math.min(8, level) * 0.13) * (wave ? 0.72 : 1)
      for (const enemy of [...this.weapon.enemyManager.enemies]) {
        if (this.player.dead || this.game.runFinished) break
        if (!alive(enemy)) continue
        const dx = enemy.x - this.player.x, dy = enemy.y - this.player.y
        if (Math.hypot(dx, dy) > waveRadius + (enemy.radius || 0)) continue
        if (!radial) {
          const delta = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - angle), Math.cos(Math.atan2(dy, dx) - angle)))
          if (delta > Math.PI * 0.42) continue
        }
        enemy.hit(waveDamage, { devourSource: DEVOUR_SOURCE_NORMAL })
        if (ultimate && radial && wave === 1 && enemy.active && !enemy.devouring && !enemy.isBoss) {
          enemy.elementStun = Math.max(enemy.elementStun || 0, 0.6)
        }
        if (!enemy.active) this.weapon._onKill(enemy)
      }
      if (radial) {
        this.slams.push({ x: this.player.x, y: this.player.y, radius: waveRadius, color: '#f28a59', life: 0.24, maxLife: 0.24 })
      } else {
        this.weapon._ring(this.player.x + Math.cos(angle) * waveRadius * 0.45, this.player.y + Math.sin(angle) * waveRadius * 0.45, '#f28a59', waveRadius * 0.55)
      }
    }
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

  queueAcid(source = DEVOUR_SOURCE_NORMAL) {
    if (this.biteUnlocked && this.player.devourAcidBurst > 0) {
      if (!this.acidPending || source === DEVOUR_SOURCE_GLUTTON) this.acidSource = source
      this.acidPending = true
    }
  }

  spawnAcidBurst(radius) {
    const tier = this.player.devourAcidBurst || 0
    const count = Math.min(14, 8 + tier * 2)
    const seed = this.acidBurstSeq++
    const noise = (i, k) => {
      const value = Math.sin((i + 1) * 12.9898 + (k + 1) * 78.233 + seed * 37.719 + this.player.x * 0.013 + this.player.y * 0.017) * 43758.5453
      return value - Math.floor(value)
    }
    const blobs = []
    for (let i = 0; i < count; i++) {
      blobs.push({
        angle: (i / count) * TAU + (noise(i, 1) - 0.5) * 0.7,
        distance: radius * (0.22 + noise(i, 2) * 0.42),
        radius: radius * (0.07 + noise(i, 3) * 0.055),
        drift: radius * (0.05 + noise(i, 4) * 0.08),
        roll: (noise(i, 5) - 0.5) * 1.1,
        phase: noise(i, 6) * TAU,
      })
    }
    this.acidBursts.push({ x: this.player.x, y: this.player.y, radius, blobs, life: 0.42, maxLife: 0.42 })
    if (this.acidBursts.length > 4) this.acidBursts.shift()
  }

  hit(enemy, damage, { source = DEVOUR_SOURCE_NORMAL, basic = false, execute = false, heavy = false, ignoreShield = false } = {}) {
    if (this.player.dead || this.weapon.game.runFinished) return false
    if (!enemy.active || enemy.devouring || enemy._settled) return false
    const before = enemy.hp
    enemy.hit(damage, {
      devourOnHit: true, devourSource: source, devourExecute: execute, ignoreShield,
      bossTomeContext: { heavy: heavy || source === DEVOUR_SOURCE_GLUTTON, biteBasic: basic },
    })
    const landed = enemy.hp < before
    if (landed && basic && enemy.isBoss && onGluttonBossBasicHit(this.player, enemy)) {
      this.weapon.enemyManager.addText(this.player.x, this.player.y - 46,
        `🍽️ 饱食 +1（${Math.min(6, Math.round(this.player.gluttonSatiety || 0))}/6）`, null, '#a6e77c', 14)
    }
    if (landed && !enemy.devouring) {
      this.weapon.enemyManager.addText(enemy.x, enemy.y - 14, String(Math.round((before - enemy.hp) * 10) / 10), null, '#eaffc9', 15)
      if (!enemy.isBoss && !enemy.isEnraged && enemy.active) {
        enemy.gluttonStagger = Math.max(enemy.gluttonStagger || 0, 0.14)
        if (this.player.gluttonCowLevel > 0) this.applyCow(enemy)
        const dx = enemy.x - this.player.x, dy = enemy.y - this.player.y, d = Math.hypot(dx, dy) || 1
        enemy.x += dx / d * 6
        enemy.y += dy / d * 6
      }
    }
    if (!enemy.active) {
      this.weapon._onKill(enemy)
      this.player.gluttonFeastTimer = GLUTTON_FEAST_DURATION
    }
    return landed
  }

  updateAura(dt) {
    const p = this.player
    this.auraTimer -= dt
    if (this.auraTimer > 0) return
    const radius = this.auraRadius()
    const inAura = []
    for (const enemy of this.weapon.enemyManager.enemies) {
      if (!alive(enemy)) continue
      if (Math.hypot(enemy.x - p.x, enemy.y - p.y) <= radius + (enemy.radius || 0)) inAura.push(enemy)
    }
    if (!inAura.length) {
      this.auraTimer = 0
      return
    }
    this.auraTimer = this.auraInterval()
    const dmg = this.auraDamage()
    const slowAmt = Math.min(0.35, 0.15 + (p.gluttonAcidAuraLevel || 0) * 0.05)
    const vulnAmt = this.route === 'mire' ? Math.min(0.32, 0.08 + gluttonAcidAuraVulnAt(p.gluttonAcidAuraLevel) - (p.gluttonAcidAuraLevel ? 0.04 : 0)) : 0
    let autoDevours = 0

    for (const enemy of inAura) {
      if (p.dead || this.game.runFinished) break
      if (!alive(enemy)) continue
      if (p.isGluttonyLord && !enemy.isBoss && !enemy.isElite && autoDevours < 4 &&
          hasGluttonResource(p) && enemy.hp <= enemy.maxHp * 0.18 && enemy._devourThresh?.() >= 0) {
        if (enemy.type !== 'golem' && enemy.type !== 'wraith') {
          this.weapon.enemyManager._startDevour(enemy, { source: DEVOUR_SOURCE_NORMAL })
          autoDevours++
          continue
        }
      }
      enemy.hit(dmg, { devourSource: DEVOUR_SOURCE_NORMAL, bossTomeContext: { gluttonAura: true } })
      if (enemy.active && !enemy.devouring) {
        if (!enemy.isBoss) {
          enemy.corrodeSlowTime = Math.max(enemy.corrodeSlowTime || 0, 0.65)
          enemy.corrodeSlowAmount = Math.max(enemy.corrodeSlowAmount || 0, slowAmt)
          if (p.gluttonCowLevel > 0) this.applyCow(enemy)
        }
        if (vulnAmt > 0) {
          enemy.gluttonCorrodeTime = Math.max(enemy.gluttonCorrodeTime || 0, 0.75)
          enemy.gluttonCorrodeVuln = Math.max(enemy.gluttonCorrodeVuln || 0, vulnAmt)
        }
      }
      if (!enemy.active) this.weapon._onKill(enemy)
    }
    this.auraPulses.push({ life: 0.28, maxLife: 0.28 })
    if (this.auraPulses.length > 3) this.auraPulses.shift()
  }

  update(dt) {
    if (!this.biteUnlocked || this.player.dead || this.weapon.game.runFinished) { this.clearTransient(); return }
    const p = this.player
    this.overflowGuardCooldown = Math.max(0, this.overflowGuardCooldown - dt)
    if (this.flash) {
      this.flash.life -= dt
      if (this.flash.life <= 0) this.flash = null
    }
    this.guardPulse = Math.max(0, this.guardPulse - dt)
    for (const list of [this.impacts, this.morsels, this.acidBursts, this.mires, this.vortices, this.slams, this.spikes, this.auraPulses]) {
      for (let i = list.length - 1; i >= 0; i--) {
        list[i].life -= dt
        if (list[i].life <= 0) list.splice(i, 1)
      }
    }
    for (let i = this.guardShatters.length - 1; i >= 0; i--) {
      const sh = this.guardShatters[i]
      sh.life -= dt
      if (sh.life <= 0) {
        this.guardShatters.splice(i, 1)
        continue
      }
      const damp = Math.max(0, 1 - 4.5 * dt)
      sh.vx *= damp
      sh.vy *= damp
      sh.x += sh.vx * dt
      sh.y += sh.vy * dt
      sh.angle += sh.spin * dt
    }

    // 体表腐蚀光环（360° 贴身威慑）
    this.updateAura(dt)

    // 深渊吸噬：引力漩涡持续引流聚怪，结束后闭颚重咬
    if (this.vortex) {
      const stepDt = Math.min(dt, Math.max(0, this.vortex.windup - this.vortex.elapsed))
      if (stepDt > 0) this._pullVortexTargets(this.vortex, stepDt)
      this.vortex.elapsed += dt
      if (this.vortex.elapsed >= this.vortex.windup) {
        const settled = this.vortex
        this.vortex = null
        this._settleVortexCrunch(settled)
      }
    }

    // 腐沼：周期酸蚀伤害并拉拢白旗猎物
    for (const mire of this.mires) {
      mire.tick -= dt
      if (mire.tick > 0) continue
      mire.tick = 0.4
      const damage = this.weapon.damage * this.weapon.levelMul * this.weapon.devourDamageMul * this.endlessDamageMultiplier * (0.28 + Math.min(6, (p.gluttonMireLevel || 1) - 1) * 0.045)
      for (const enemy of [...this.weapon.enemyManager.enemies]) {
        if (p.dead || this.game.runFinished) break
        if (!alive(enemy) || Math.hypot(enemy.x - mire.x, enemy.y - mire.y) > mire.r + (enemy.radius || 0)) continue
        enemy.hit(damage, { devourSource: DEVOUR_SOURCE_NORMAL })
        if (!enemy.isBoss && enemy.active && !enemy.devouring) {
          enemy.slow = Math.max(enemy.slow || 0, 0.45)
          if (enemy.devourable) {
            const dx = p.x - enemy.x, dy = p.y - enemy.y, d = Math.hypot(dx, dy) || 1
            enemy.x += dx / d * 18
            enemy.y += dy / d * 18
          }
        }
        if (!enemy.active) this.weapon._onKill(enemy)
      }
    }

    this.acidCooldown = Math.max(0, this.acidCooldown - dt)
    if (this.swing && !this.vortex) {
      if (this.swing.phase === 'aim') {
        const target = this.swing.target
        if (alive(target)) this.swing.desiredAngle = angleTo(p, target)
        this.swing.angle = turnToward(this.swing.angle, this.swing.desiredAngle, GLUTTON_AIM_TURN_RATE * dt)
        this.aimAngle = this.swing.angle
        this.swing.remaining -= dt
        if (Math.abs(angleDelta(this.swing.angle, this.swing.desiredAngle)) <= 0.03 || this.swing.remaining <= 0) {
          this.swing.angle = this.swing.desiredAngle
          this.aimAngle = this.swing.angle
          this.swing.phase = 'windup'
          this.swing.remaining = this.swing.windup
        }
      } else {
        this.swing.remaining -= dt
        if (this.swing.phase === 'windup' && this.swing.remaining <= 0) {
          this.swing.phase = 'strike'
          this.swing.remaining += this.swing.strike
        }
        if (this.swing.remaining <= 0) {
          const swing = this.swing
          this.swing = null
          this.flash = { ...swing, x: p.x, y: p.y, life: swing.recovery, maxLife: swing.recovery }
          this.aimAngle = swing.angle
          const targets = this.weapon.enemyManager.enemies.filter(e => inBiteSector(p, e, swing.angle, swing.reach, swing.arc))
          this.weapon.game.mapFeatures?.attackBarricades(p.x, p.y, swing.reach)
          let landed = false
          const sweepMul = 1 + (p.gluttonBiteSweepLevel || 0) * 0.12
          const berserkMul = p.gluttonBerserkTimer > 0 ? 1.35 : 1
          for (const e of targets) {
            if (p.dead || this.weapon.game.runFinished) break
            const crit = Math.random() < this.weapon.critChance ? this.weapon.critMul : 1
            const snowball = this.weapon.devourDamageMul * this.endlessDamageMultiplier
            const damage = this.weapon.damage * this.weapon.levelMul * snowball * GLUTTON_BITE_DAMAGE * sweepMul * berserkMul * crit * (p.isGluttonyLord ? 1.2 : 1)
            const x = e.x, y = e.y
            const hit = this.hit(e, damage, { source: DEVOUR_SOURCE_NORMAL, basic: true })
            landed ||= hit
            if (hit) this.impact(e, swing, x, y)
          }
          if (landed && this.route === 'jaw' && p.gluttonAftershockLevel > 0) {
            this.aftershock(swing.angle, p.gluttonAftershockLevel, this.weapon.damage * this.weapon.levelMul * this.weapon.devourDamageMul * this.endlessDamageMultiplier * 0.55, false, false)
          }
          this.weapon.game.sound.bite(false, landed)
        }
      }
    }
    if (p.dead || this.weapon.game.runFinished) { this.clearTransient(); return }
    if (this.acidPending && this.acidCooldown <= 0) {
      this.acidPending = false
      this.acidCooldown = 0.35
      const tier = p.devourAcidBurst || 0
      const radius = (105 + tier * 12) * (this.weapon.geneRangeMul || 1)
      const damage = this.weapon.damage * this.weapon.levelMul * this.weapon.devourDamageMul * this.endlessDamageMultiplier * (0.9 + tier * 0.35)
      for (const e of [...this.weapon.enemyManager.enemies]) {
        if (p.dead || this.weapon.game.runFinished) break
        if (!alive(e) || Math.hypot(e.x - p.x, e.y - p.y) > radius + (e.radius || 0)) continue
        e.hit(damage, { devourSource: this.acidSource })
        if (!e.isBoss && e.active && !e.devouring) e.slow = Math.max(e.slow || 0, 0.8)
        if (!e.active) this.weapon._onKill(e)
      }
      this.spawnAcidBurst(radius)
    }
    if (this.satietyPending && !p.dead && !this.game.runFinished) this.releaseSatietyBurst()
  }

  renderGround(ctx) {
    if (!this.biteUnlocked || this.player.dead) {
      this._groundRendered = false
      return
    }
    this._groundRendered = true
    renderCorrodeAura(ctx, this)
    renderMires(ctx, this)
  }

  render(ctx) {
    if (!this.biteUnlocked || this.player.dead) {
      this._groundRendered = false
      return
    }
    if (!this._groundRendered) this.renderGround(ctx)
    this._groundRendered = false
    renderGluttonGuard(ctx, this)
    renderBiteMotion(ctx, this.player, this.swing, this.flash, this.vortex)
    renderBiteFeedback(ctx, this)
  }
}
