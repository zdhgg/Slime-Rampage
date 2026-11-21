import { renderShadowCombat, shadowPose } from './effects/ShadowBladeVisual.js'
import { ShadowClones } from './ShadowClones.js'
import { ShadowShield } from './ShadowShield.js'
import { shadowTargetAlive as alive, inShadowPath, traceShadowPath, shadowLineClear, shadowRangedEnemy } from './ShadowGeometry.js'
import {
  SHADOW_ROUTES,
  getShadowEndlessDamageMultiplier,
  shadowBladeRendDmgMulAt,
  shadowBladeRendOrbsAt,
  shadowBladeRiposteDmgAt,
  shadowBladeRiposteReachAt,
  shadowHuntRangedRefundAt,
  shadowProgressReady,
  shadowRouteInvestment,
  shadowRouteReady,
  shadowSwarmCritInheritAt,
  shadowSwarmCritMulAt,
} from './ShadowBuild.js'
import { shadowExecuteCritInheritAt } from './ShadowSkills.js'
export { inShadowPath } from './ShadowGeometry.js'

export const SHADOW_BLADE_REACH = 84
export const SHADOW_BLADE_WIDTH = 15
export const SHADOW_BLADE_DAMAGE = 1.05
export const SHADOW_BLADE_TARGETS = 3
export const SHADOW_BLADE_PARRY_ICD = 0.5
export const SHADOW_BLADE_WAVE_EVERY = 3
export const SHADOW_BLADE_WAVE_REACH = 185
export const SHADOW_BLADE_WAVE_WIDTH = 15
export const SHADOW_BLADE_WAVE_DAMAGE = 0.9
export const SHADOW_WINDUP = 0.065
export const SHADOW_STRIKE = 0.04
export const SHADOW_ASSAULT_DISTANCE = 180
export const SHADOW_ASSAULT_WINDUP = 0.06
export const SHADOW_ASSAULT_TIME = 0.16
export const SHADOW_ASSAULT_WIDTH = 22
export const SHADOW_ASSAULT_SNAP_ANGLE = (22 * Math.PI) / 180
export const SHADOW_ASSAULT_DAMAGE = 1.6
export const SHADOW_ASSAULT_SPLASH = 0.8
export const SHADOW_DASH_REFUND = 0.5
export const SHADOW_SUBSTITUTE_COOLDOWN = 40
export const SHADOW_SUBSTITUTE_INVINCIBLE = 0.8
/** 每次影袭施放周期的冷却返还总预算（占最大冷却比例），防止远程密集波无空窗。 */
const SHADOW_REFUND_BUDGET = 0.6
/** 刃隙微步（近战补偿·机制层）：刺击起手向目标小步进，停在目标边缘前，不扩大判定面。 */
export const SHADOW_BLADE_STEP = 26
/** 刺杀残影（近战补偿·机制层）：本体击杀在击杀点留下短命替身，供本体脱身。 */
export const SHADOW_KILL_ECHO_LIFE = 1.2
export const SHADOW_KILL_ECHO_CAP = 3
export const SHADOW_CLEAVE = [
  { damage: 0.85, reach: 52, width: 14, cooldown: 0.9 },
  { damage: 1.2, reach: 66, width: 16, cooldown: 0.65 },
]
export const SHADOW_CLEAVE_CRIT_REFUND = 0.2
export const SHADOW_CLEAVE_BLADE_REFUND = 0.3
export const SHADOW_HUNT_SPREAD_RADIUS = 135
export const SHADOW_HUNT_SPREAD_DAMAGE = 1.05
export const SHADOW_HUNT_SPREAD_RANGE = 260
export const SHADOW_HUNT_SPREAD_CHAIN_CAP = 3
export const SHADOW_SOUL_THRESHOLD = 16
export const SHADOW_SOUL_HEAL_COOLDOWN = 12
export const SHADOW_SOUL_MIN_HEAL_COOLDOWN = 8
export const SHADOW_SOUL_CRIT_GAIN = 1
export const SHADOW_SOUL_CRIT_ICD = 0.4
export const SHADOW_SOUL_CLONE_CRIT_GAIN = 0.5
export const SHADOW_SOUL_CLONE_CRIT_ICD = 0.5
export const SHADOW_SOUL_DEFEND_GAIN = 3
export const SHADOW_SOUL_DEFEND_ICD = 1.5
export const SHADOW_SOUL_OVERFLOW_SHIELD_GAIN = 3.0
export const SHADOW_SOUL_SURGE_DURATION = 2.5
export const SHADOW_SOUL_SURGE_HASTE = 1.25
export const SHADOW_SOUL_NOVA_RADIUS = 120
export const SHADOW_SOUL_CLONE_NOVA_RADIUS = 85
export const SHADOW_SOUL_NOVA_DAMAGE = 1.15
export const SHADOW_ECHO_BURST_RADIUS = 85
export const SHADOW_ECHO_BURST_DAMAGE = 0.85
export const SHADOW_SOUL_BOSS_MULTIPLIER = 2
export const SHADOW_ASSAULT_BUFF_DURATION = 2.0
export const SHADOW_ASSAULT_EVADE_MIN = 0.15
export const SHADOW_ASSAULT_EVADE_SPAN = 0.25
export const SHADOW_ASSAULT_CRIT_MIN = 0.10
export const SHADOW_ASSAULT_CRIT_SPAN = 0.20
export const SHADOW_ASSAULT_HEAL_CD_MIN = 1.0
export const SHADOW_ASSAULT_HEAL_CD_SPAN = 1.5
export const SHADOW_ASSAULT_SPEED_BONUS = 0.2
export const SHADOW_GUARD_CAP = 1
export const SHADOW_GUARD_COOLDOWN = 7.0
export const SHADOW_GUARD_ATTACK_REFUND = 1.2
export const SHADOW_GUARD_INVINCIBLE = 0.25
export const SHADOW_GUARD_PUSH_RADIUS = 95
export const SHADOW_GUARD_PUSH_DISTANCE = 28

export class ShadowCombat {
  constructor(weapon) {
    this.weapon = weapon
    this.clones = new ShadowClones(this)
    this.shield = new ShadowShield(this)
    this.reset()
  }

  reset({ preserveBuild = false } = {}) {
    const build = preserveBuild ? {
      route: this.route, routeUltimate: this.routeUltimate, normalChoices: this.normalChoices,
      wardLevel: this.wardLevel, strideLevel: this.strideLevel, endlessEclipseLevel: this.endlessEclipseLevel,
      huntMarkLevel: this.huntMarkLevel, huntPursuitLevel: this.huntPursuitLevel, huntReapLevel: this.huntReapLevel, huntRefundLevel: this.huntRefundLevel, huntSpellbreakLevel: this.huntSpellbreakLevel,
      swarmAssaultLevel: this.swarmAssaultLevel, swarmReapLevel: this.swarmReapLevel, swarmCritLevel: this.swarmCritLevel, swarmBulwarkLevel: this.swarmBulwarkLevel,
      bladeArcLevel: this.bladeArcLevel, bladeEchoLevel: this.bladeEchoLevel, bladeRiposteLevel: this.bladeRiposteLevel, bladeRendLevel: this.bladeRendLevel,
    } : null
    this.swing = null; this.assault = null; this.flash = null
    this.clones?.reset()
    this.route = build?.route || null; this.routeUltimate = build?.routeUltimate || null; this.normalChoices = build?.normalChoices || 0
    this.wardLevel = build?.wardLevel || 0; this.strideLevel = build?.strideLevel || 0; this.endlessEclipseLevel = build?.endlessEclipseLevel || 0
    this.huntMarkLevel = build?.huntMarkLevel || 0; this.huntPursuitLevel = build?.huntPursuitLevel || 0; this.huntReapLevel = build?.huntReapLevel || 0
    this.huntRefundLevel = build?.huntRefundLevel || 0; this.huntSpellbreakLevel = build?.huntSpellbreakLevel || 0
    this.swarmAssaultLevel = build?.swarmAssaultLevel || 0; this.swarmReapLevel = build?.swarmReapLevel || 0
    this.swarmCritLevel = build?.swarmCritLevel || 0; this.swarmBulwarkLevel = build?.swarmBulwarkLevel || 0
    this.bladeArcLevel = build?.bladeArcLevel || 0; this.bladeEchoLevel = build?.bladeEchoLevel || 0
    this.bladeRiposteLevel = build?.bladeRiposteLevel || 0; this.bladeRendLevel = build?.bladeRendLevel || 0
    this.huntTarget = null; this.huntMarkTimer = 0
    this.huntChainLeft = 0
    this.huntFollowupReady = false; this.huntFollowupTimer = 0
    this.huntUltimateShieldIcd = 0
    this.evadeCounterIcd = 0
    this.riposteIcd = 0
    this.cloneCritShieldIcd = 0
    this.bladeCleaveRefundIcd = 0
    this.soulPoints = 0
    this.soulHealCd = 0
    this.soulCritIcd = 0
    this.soulCloneIcd = 0
    this.soulDefendIcd = 0
    this.stabCombo = 0
    this.bladeParryIcd = 0
    this.substituteCd = 0
    this.guardCharges = this.enabled ? SHADOW_GUARD_CAP : 0
    this.guardCd = 0
    this.guardFlash = 0
    this.inDomain = false
    this.refundLeft = 0
    this.time = 0; this.domains = []; this.echoQueue = []
    this.cleaveCooldown = 0
    this.echoes ??= []; this.impacts ??= []; this.cleaves ??= []; this.waves ??= []
    this.echoes.length = 0; this.impacts.length = 0; this.cleaves.length = 0; this.waves.length = 0
    this.shield?.reset(this.enabled)
  }

  start() {
    this.shield?.reset(this.enabled)
    this.guardCharges = this.enabled ? SHADOW_GUARD_CAP : 0
    this.guardCd = 0
    this.guardFlash = 0
  }

  get player() { return this.weapon.player }
  get game() { return this.weapon.game }
  get enabled() { return this.weapon.game?.startingStrain === 'shadow' }
  get available() { return this.enabled && !this.player.dead && !this.weapon.game.runFinished }
  get pose() { return this.available ? shadowPose(this) : null }
  get canFollowup() { return this.routeUltimate === 'hunt' && this.huntFollowupReady && this.huntFollowupTimer > 0 && !this.assault }
  get endlessDamageMultiplier() { return getShadowEndlessDamageMultiplier(this.game?.skillLevels) }
  bladeHasteMultiplier() { return this.available && (this.player?.shadowSoulSurgeTimer || 0) > 0 ? SHADOW_SOUL_SURGE_HASTE : 1 }
  get huntMarkBonus() { return Math.min(.72, .12 + Math.min(8, this.huntPursuitLevel) * .06 + Math.max(0, this.huntPursuitLevel - 8) * .015) }
  get swarmCommandMultiplier() { return Math.min(3.1, 2 + Math.min(8, this.swarmAssaultLevel) * .12 + Math.max(0, this.swarmAssaultLevel - 8) * .035) }
  get bladeRangeBonus() { return Math.min(90, Math.min(8, this.bladeArcLevel) * 9 + Math.max(0, this.bladeArcLevel - 8) * 3) }
  get bladeMaxTargets() { return Math.min(10, 4 + Math.min(6, this.bladeArcLevel)) }
  get bladeEchoMultiplier() { return Math.min(.68, .3 + Math.min(6, this.bladeEchoLevel) * .05 + Math.max(0, this.bladeEchoLevel - 6) * .02) }
  get reach() { return this.player.radius + (SHADOW_BLADE_REACH + (this.route === 'blade' ? this.bladeRangeBonus : 0)) * (this.weapon.geneRangeMul || 1) }

  get cloneCritInherit() {
    const execute = shadowExecuteCritInheritAt(this.player?.shadowClonePowerLevel || 0)
    const route = this.route === 'swarm' ? 0.15 + shadowSwarmCritInheritAt(this.swarmCritLevel) : 0
    return Math.min(1, 0.4 + execute + route)
  }

  get cloneCritMultiplier() {
    const bodyExcess = Math.min(0.8, Math.max(0, (this.weapon?.critMul || 3) - 3) * 0.25)
    const swarmBonus = this.route === 'swarm' ? shadowSwarmCritMulAt(this.swarmCritLevel) : 0
    return 1.6 + bodyExcess + swarmBonus
  }

  chooseRoute(route) {
    if (!this.enabled || !SHADOW_ROUTES[route] || !shadowRouteReady(this.game) || !(this.game.skillLevels?.[SHADOW_ROUTES[route].seed] > 0)) return false
    this.route = route
    return true
  }

  get soulHealCooldown() {
    return Math.max(SHADOW_SOUL_MIN_HEAL_COOLDOWN, SHADOW_SOUL_HEAL_COOLDOWN - (this.wardLevel || 0))
  }

  hud() {
    const route = SHADOW_ROUTES[this.route]
    const investment = route ? shadowRouteInvestment(this.game, this.route) : 0
    const ultimateReady = !!route && !this.routeUltimate && (this.player.level || 1) >= 14 &&
      shadowProgressReady(this.game, true) && investment >= 4
    const entryCount = Object.values(SHADOW_ROUTES).filter(item => (this.game.skillLevels?.[item.seed] || 0) > 0).length
    const soulCd = this.soulHealCooldown
    return {
      route: this.route, routeName: route?.name || '暗影探索', routeColor: route?.color || null,
      normalChoices: this.normalChoices, routeInvestment: investment, ultimate: this.routeUltimate,
      ultimateName: route?.ultimateName || '', ultimateReady, routeReady: shadowRouteReady(this.game),
      entryCount, followup: this.canFollowup,
      marked: alive(this.huntTarget) && this.huntMarkTimer > 0,
      shield: this.shield?.hud() || null,
      soul: {
        points: Math.round((this.soulPoints || 0) * 10) / 10,
        threshold: SHADOW_SOUL_THRESHOLD,
        progress: Math.max(0, Math.min(1, (this.soulPoints || 0) / SHADOW_SOUL_THRESHOLD)),
        healCd: Math.max(0, this.soulHealCd || 0),
        healCooldown: soulCd,
        surge: Math.max(0, this.player?.shadowSoulSurgeTimer || 0),
        ready: (this.soulHealCd || 0) <= 0,
      },
      assaultBuff: {
        timer: Math.max(0, this.player?.shadowAssaultBuffTimer || 0),
        evasion: this.player?.shadowAssaultEvasionBonus || 0,
        crit: this.player?.shadowAssaultCritBonus || 0,
      },
      substituteCd: Math.max(0, this.substituteCd || 0),
      substituteReady: (this.substituteCd || 0) <= 0 && this.clones.items.some(c => c.life > 0),
      guard: {
        charges: this.guardCharges || 0,
        capacity: SHADOW_GUARD_CAP,
        remaining: (this.guardCharges || 0) >= SHADOW_GUARD_CAP ? 0 : Math.max(0, this.guardCd || 0),
        cooldown: SHADOW_GUARD_COOLDOWN,
        ready: (this.guardCharges || 0) > 0,
        progress: (this.guardCharges || 0) >= SHADOW_GUARD_CAP
          ? 1
          : Math.max(0, Math.min(1, 1 - (this.guardCd || 0) / SHADOW_GUARD_COOLDOWN)),
      },
      stabCombo: this.stabCombo || 0,
      inDomain: this.inDomain,
    }
  }

  /** 进攻缩冷（影刃格挡方案 1）：三连击影波与影袭命中时加快物理格挡冷却重聚。 */
  refundGuard(seconds = SHADOW_GUARD_ATTACK_REFUND) {
    if (!this.available || !(seconds > 0) || (this.guardCharges || 0) >= SHADOW_GUARD_CAP) return false
    this.guardCd = Math.max(0, (this.guardCd || 0) - seconds)
    if (this.guardCd <= 0) {
      this.guardCharges = SHADOW_GUARD_CAP
      this.guardCd = 0
      this.guardFlash = 0.32
      this.weapon?._ring?.(this.player.x, this.player.y, '#cbd5e1', this.player.radius + 12)
      return true
    }
    return false
  }

  /** 「影刃格挡」（方案 1）：被动闪避未中后，消耗 1 层架势抵挡 1 点物理／近战伤害，震退贴脸杂兵并积攒影魄。 */
  absorbPhysicalGuard(damage, attack) {
    if (
      !this.available ||
      (this.guardCharges || 0) <= 0 ||
      !attack?.enemyAttack ||
      attack?.spellAttack ||
      attack?.zoneBurn ||
      !(damage > 0)
    ) {
      return damage
    }
    const p = this.player
    this.guardCharges = Math.max(0, (this.guardCharges || 0) - 1)
    this.guardCd = SHADOW_GUARD_COOLDOWN
    this.guardFlash = 0.35

    const blocked = Math.min(damage, 1)
    const remaining = damage - blocked
    if (remaining <= 0) p.invincible = Math.max(p.invincible, SHADOW_GUARD_INVINCIBLE)

    const enemies = this.weapon.enemyManager?.enemies
    if (enemies?.length) {
      const worldW = this.game.worldWidth || 2400, worldH = this.game.worldHeight || 1800
      for (const e of enemies) {
        if (!e?.active || e.devouring || e.isBoss) continue
        const dx = e.x - p.x, dy = e.y - p.y
        const dist = Math.hypot(dx, dy)
        if (dist > SHADOW_GUARD_PUSH_RADIUS + (e.radius || 0)) continue
        const angle = dist > 1e-4 ? Math.atan2(dy, dx) : 0
        const r = e.radius || 0
        e.x = Math.max(r, Math.min(worldW - r, e.x + Math.cos(angle) * SHADOW_GUARD_PUSH_DISTANCE))
        e.y = Math.max(r, Math.min(worldH - r, e.y + Math.sin(angle) * SHADOW_GUARD_PUSH_DISTANCE))
      }
    }

    if (this.route === 'blade' && (this.bladeRiposteLevel || 0) > 0) {
      this.triggerRiposte?.()
    }
    this.onSoulDefend?.(attack)

    const stats = this.weapon?.stats
    if (stats) stats.shadowGuardBlocks = (stats.shadowGuardBlocks || 0) + 1
    this.weapon?._ring?.(p.x, p.y, '#cbd5e1', p.radius + 16)
    this.weapon.enemyManager?.addText?.(
      p.x, p.y - 40,
      remaining <= 0 ? '影刃格挡' : '格挡 −1 伤',
      null, '#e2e8f0', 14
    )
    this.game?.sound?.spellShield?.(remaining <= 0)
    this.game?._pushCooldown?.()
    return remaining
  }

  /** 「替身移影」致命代死：即将阵亡且场上有存活分身时，献祭最远分身换位脱险，锁 1 血并获 0.8s 虚化无敌（冷却 40 秒，远征换章刷新）。 */
  tryFatalSubstitute() {
    if (!this.available || (this.substituteCd || 0) > 0) return false
    const p = this.player
    const living = this.clones.items.filter(c => c.life > 0)
    if (!living.length) return false
    const sacrificed = living.reduce((best, c) =>
      ((c.x - p.x) ** 2 + (c.y - p.y) ** 2) > ((best.x - p.x) ** 2 + (best.y - p.y) ** 2) ? c : best
    )
    const oldX = p.x, oldY = p.y
    const worldW = this.game.worldWidth || 2400, worldH = this.game.worldHeight || 1800
    p.x = Math.max(p.radius, Math.min(worldW - p.radius, sacrificed.x))
    p.y = Math.max(p.radius, Math.min(worldH - p.radius, sacrificed.y))
    sacrificed.life = 0
    this.clones.expireClone(sacrificed)
    this.clones.items = this.clones.items.filter(c => c !== sacrificed && c.life > 0)
    this.assault = null; this.swing = null
    p.hp = 1
    p.invincible = Math.max(p.invincible, SHADOW_SUBSTITUTE_INVINCIBLE)
    p.evasionFlash = Math.max(p.evasionFlash, SHADOW_SUBSTITUTE_INVINCIBLE)
    this.substituteCd = SHADOW_SUBSTITUTE_COOLDOWN
    const stats = this.weapon?.stats
    if (stats) stats.shadowSubstitutes = (stats.shadowSubstitutes || 0) + 1
    this.weapon?._ring?.(oldX, oldY, '#a855f7', p.radius + 18)
    this.weapon?._ring?.(p.x, p.y, '#e879f9', p.radius + 22)
    this.weapon.enemyManager?.addText?.(p.x, p.y - 44, '替身移影 · 致命换位', null, '#f0abfc', 16)
    this.game?.sound?.spellShield?.(true)
    this.game?._pushCooldown?.()
    return true
  }

  markHuntTarget(enemy) {
    if (this.route !== 'hunt' || !(this.game.skillLevels?.shadow_hunt_mark > 0) || !alive(enemy)) return
    this.huntTarget = enemy
    this.huntMarkTimer = Math.min(6.5, 3.5 + this.huntPursuitLevel * .25)
    this.huntChainLeft = SHADOW_HUNT_SPREAD_CHAIN_CAP
  }

  /** 对单个或多个圆域来源收集去重敌群并结算次级范围影斩，避免重复编写索敌与清场逻辑。 */
  strikeArea({ anchor = this.player, sources, maxTargets, damage, visual = null, ringColor = null }) {
    if (!this.available || !sources?.length) return 0
    const enemies = this.weapon.enemyManager?.enemies || []
    const pool = new Set()
    for (const src of sources) {
      if (ringColor) this.weapon?._ring?.(src.x, src.y, ringColor, src.radius)
      if (visual) {
        this.cleaves.push({
          x: src.x, y: src.y,
          angle: src.angle ?? visual.angle ?? (this.player?.facing || 0),
          reach: src.visualReach ?? src.radius,
          width: src.width ?? visual.width ?? 16,
          life: src.life ?? visual.life ?? 0.22,
          ...visual.flags,
        })
      }
      const r = src.radius
      for (const e of enemies) {
        if (!alive(e)) continue
        const total = r + (e.radius || 0)
        if ((e.x - src.x) ** 2 + (e.y - src.y) ** 2 <= total * total) pool.add(e)
      }
    }
    const ordered = [...pool]
      .sort((a, b) => ((a.x - anchor.x) ** 2 + (a.y - anchor.y) ** 2) - ((b.x - anchor.x) ** 2 + (b.y - anchor.y) ** 2))
      .slice(0, maxTargets)
    let hits = 0
    for (const e of ordered) {
      if (!this.available) break
      const angle = Math.atan2(e.y - anchor.y, e.x - anchor.x)
      if (this.hit(e, damage, { secondary: true, angle }).landed) hits++
    }
    return hits
  }

  /** 猎杀路线联动：击杀带有猎杀印记的目标时爆散范围影斩，并将印记传染给附近下一名可见目标（最多连锁 3 次）。 */
  triggerHuntSpread(enemy) {
    if (!this.available || this._huntSpreading || this.route !== 'hunt' || !(this.game.skillLevels?.shadow_hunt_mark > 0)) return false
    this._huntSpreading = true
    try {
      const remainingChain = Math.max(0, this.huntChainLeft || 0)
      this.huntTarget = null
      this.huntMarkTimer = 0
      const dmg = SHADOW_HUNT_SPREAD_DAMAGE * (1 + this.huntMarkBonus * 0.5)
      this.strikeArea({
        anchor: enemy,
        sources: [{ x: enemy.x, y: enemy.y, radius: SHADOW_HUNT_SPREAD_RADIUS, visualReach: 78, angle: this.player.facing || 0 }],
        maxTargets: 6,
        damage: dmg,
        visual: { width: 16, life: 0.22, flags: { hunt: true } },
        ringColor: '#84d6e8',
      })
      if (remainingChain <= 0 || !this.available) return true
      const next = (this.weapon.enemyManager?.enemies || [])
        .filter(e => alive(e) && (e.x - enemy.x) ** 2 + (e.y - enemy.y) ** 2 <= SHADOW_HUNT_SPREAD_RANGE ** 2 && shadowLineClear(this.game, enemy, e))
        .sort((a, b) => {
          const pa = a.isBoss ? 0 : shadowRangedEnemy(a) ? 1 : 2
          const pb = b.isBoss ? 0 : shadowRangedEnemy(b) ? 1 : 2
          return pa !== pb ? pa - pb : ((a.x - enemy.x) ** 2 + (a.y - enemy.y) ** 2) - ((b.x - enemy.x) ** 2 + (b.y - enemy.y) ** 2)
        })[0] || null
      if (next) {
        this.huntChainLeft = remainingChain - 1
        this.huntTarget = next
        this.huntMarkTimer = Math.min(6.5, 3.5 + this.huntPursuitLevel * .25)
        this.weapon.enemyManager?.addText?.(next.x, next.y - 26, '猎杀传染', null, '#84d6e8', 13)
      }
      return true
    } finally {
      this._huntSpreading = false
    }
  }

  /** 满血影魄涌动爆发：本体与全场分身同步迸发 360° 影魄环斩清场。 */
  triggerSoulNova() {
    if (!this.available) return 0
    const p = this.player
    const sources = [{ x: p.x, y: p.y, radius: SHADOW_SOUL_NOVA_RADIUS, visualReach: SHADOW_SOUL_NOVA_RADIUS, width: 22, life: 0.26 }]
    for (const c of this.clones.items) {
      if (c.life <= 0) continue
      c.flash = Math.max(c.flash || 0, 0.22)
      sources.push({ x: c.x, y: c.y, radius: SHADOW_SOUL_CLONE_NOVA_RADIUS, visualReach: SHADOW_SOUL_CLONE_NOVA_RADIUS, width: 16, life: 0.22, angle: c.angle || 0 })
    }
    return this.strikeArea({
      anchor: p,
      sources,
      maxTargets: 12,
      damage: SHADOW_SOUL_NOVA_DAMAGE,
      visual: { width: 20, life: 0.24, flags: { nova: true } },
      ringColor: '#e879f9',
    })
  }

  /** 刺杀残影爆裂：击杀生成的短命残影到期或被敌人触碰时炸出残影碎斩。 */
  burstKillEcho(decoy) {
    if (!this.available || !decoy?.echo || decoy._bursted) return 0
    decoy._bursted = true
    return this.strikeArea({
      anchor: decoy,
      sources: [{ x: decoy.x, y: decoy.y, radius: SHADOW_ECHO_BURST_RADIUS, visualReach: 58, angle: decoy.angle ?? (this.player.facing || 0) }],
      maxTargets: 5,
      damage: SHADOW_ECHO_BURST_DAMAGE,
      visual: { width: 14, life: 0.2, flags: { echo: true } },
      ringColor: '#a855f7',
    })
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
    const angle = Math.atan2(target.y - this.player.y, target.x - this.player.x)
    // 智能微步：静止或朝目标方向推进（<= 90°）时小步拉近；后撤/斜拉躲技能时绝不逆向拽回怪堆。
    const moveDir = this.player.input.getMoveVector(this.player.x, this.player.y)
    const moving = moveDir.x !== 0 || moveDir.y !== 0
    const forwardIntent = !moving || (Math.cos(angle) * moveDir.x + Math.sin(angle) * moveDir.y) >= -0.01
    const gap = Math.hypot(target.x - this.player.x, target.y - this.player.y) - (target.radius || 0) - this.player.radius
    if (forwardIntent && gap > 4) {
      const end = traceShadowPath(this.game, this.player, angle, Math.min(SHADOW_BLADE_STEP, gap - 4))
      this.player.x = end.x; this.player.y = end.y
    }
    this.swing = { angle, elapsed: 0, windup: SHADOW_WINDUP * pace, strike: SHADOW_STRIKE * pace, reach: this.reach }
    this.flash = null
    return true
  }

  /** ±22° 影袭智能锁敌吸附：优先吸附视野内无阻挡的首领、猎杀标记或后排法系目标。 */
  snapAssaultAngle(rawAngle) {
    const enemies = this.weapon.enemyManager?.enemies
    if (!enemies?.length) return rawAngle
    const p = this.player
    const maxDist = SHADOW_ASSAULT_DISTANCE + 40
    let bestAngle = rawAngle, bestScore = Infinity
    for (const e of enemies) {
      if (!alive(e)) continue
      const dx = e.x - p.x, dy = e.y - p.y
      const dist = Math.hypot(dx, dy)
      if (dist < 4 || dist > maxDist + (e.radius || 0)) continue
      const targetAngle = Math.atan2(dy, dx)
      const delta = Math.abs(Math.atan2(Math.sin(targetAngle - rawAngle), Math.cos(targetAngle - rawAngle)))
      if (delta > SHADOW_ASSAULT_SNAP_ANGLE) continue
      if (!shadowLineClear(this.game, p, e)) continue
      const priority = e.isBoss ? -120 : e === this.huntTarget ? -90 : shadowRangedEnemy(e) ? -60 : 0
      const score = priority + delta * 120 + dist * 0.15
      if (score < bestScore) { bestScore = score; bestAngle = targetAngle }
    }
    return bestAngle
  }

  direction() {
    // 传玩家坐标：点地移动时影袭沿「目标落点方向」突进，并按 ±22° 智能微调锁定顺路目标。
    const dir = this.player.input.getMoveVector(this.player.x, this.player.y)
    const raw = dir.x || dir.y ? Math.atan2(dir.y, dir.x) : this.player.facing
    return this.snapAssaultAngle(raw)
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
    this.assault = { angle, end, phase: 'windup', elapsed: 0, hitTargets: new Set(), cloneIds: new Set(this.clones.items.map(c => c.id)), primaryUsed: false, refunded: false, landed: 0, kills: 0 }
    if (followup) { this.huntFollowupReady = false; this.huntFollowupTimer = 0; this.assault.isFollowup = true }
    else this.refundLeft = SHADOW_REFUND_BUDGET * (this.player.strainSkillMax || 5)
    this.player.facing = angle
    const originClone = !followup ? this.clones.leaveAtOrigin() : null
    if (originClone) this.assault.cloneIds.delete(originClone.id)
    if (this.player.shadowCloneLord && this.clones.items.length < this.clones.cap) {
      this.clones.createAt(this.player, angle)
    }
    return true
  }

  /** 被动闪避成功回调：加速暗影魔盾充能、触发影隙反击与影魄积攒；刃潮额外触发虚影反刃。 */
  onEvade(attack = null) {
    if (!this.available) return
    const p = this.player
    this.shield?.onEvade()
    this.onSoulDefend(attack)
    if (this.evadeCounterIcd <= 0) {
      this.evadeCounterIcd = 1.8
      p.shadowEvadeRushTimer = Math.max(p.shadowEvadeRushTimer || 0, 1.5)
      p.shadowEvadeCritTimer = Math.max(p.shadowEvadeCritTimer || 0, 2.0)
    }
    if (this.route === 'blade' && this.bladeRiposteLevel > 0) {
      this.triggerRiposte()
    }
  }

  /** 影魄汲取满额结算：受伤且冷却就绪时回复 1 点生命；满血不浪费，自动转化为魔盾加速或短时涌动。 */
  resolveSoul() {
    if (!this.available || (this.soulPoints || 0) < SHADOW_SOUL_THRESHOLD) return false
    const p = this.player
    if (p.hp < p.maxHp) {
      if ((this.soulHealCd || 0) > 0) return false
      this.soulPoints = 0
      this.soulHealCd = this.soulHealCooldown
      p.heal(1)
      const stats = this.weapon?.stats
      if (stats) stats.shadowSoulHeals = (stats.shadowSoulHeals || 0) + 1
      this.weapon?._ring?.(p.x, p.y, '#4ade80', p.radius + 14)
      this.game?._pushCooldown?.()
      return true
    }
    this.soulPoints = 0
    if (this.shield && this.shield.charges < this.shield.capacity) {
      this.shield.accelerate(SHADOW_SOUL_OVERFLOW_SHIELD_GAIN)
      this.game.enemyManager?.addText?.(p.x, p.y - 36, '影魄反哺 · 魔盾充能', null, '#a78bfa', 13)
    } else {
      p.shadowSoulSurgeTimer = Math.max(p.shadowSoulSurgeTimer || 0, SHADOW_SOUL_SURGE_DURATION)
      this.triggerSoulNova()
      this.game.enemyManager?.addText?.(p.x, p.y - 36, '影魄涌动 · 环斩破敌', null, '#f0abfc', 13)
    }
    this.weapon?._ring?.(p.x, p.y, '#c084fc', p.radius + 14)
    this.game?._pushCooldown?.()
    return true
  }

  gainSoul(amount) {
    if (!this.available || !(amount > 0)) return false
    this.soulPoints = Math.min(SHADOW_SOUL_THRESHOLD, (this.soulPoints || 0) + amount)
    return this.resolveSoul()
  }

  onSoulCritical(isClone = false, action = null, isBoss = false) {
    if (!this.available) return false
    const bossMul = isBoss ? SHADOW_SOUL_BOSS_MULTIPLIER : 1
    if (isClone) {
      if ((this.soulCloneIcd || 0) > 0) return false
      this.soulCloneIcd = SHADOW_SOUL_CLONE_CRIT_ICD
      return this.gainSoul(SHADOW_SOUL_CLONE_CRIT_GAIN * bossMul)
    }
    if (action?.soulCounted || (this.soulCritIcd || 0) > 0) return false
    if (action) action.soulCounted = true
    this.soulCritIcd = SHADOW_SOUL_CRIT_ICD
    return this.gainSoul(SHADOW_SOUL_CRIT_GAIN * bossMul)
  }

  onSoulDefend(attack = null) {
    if (!this.available || (this.soulDefendIcd || 0) > 0) return false
    this.soulDefendIcd = SHADOW_SOUL_DEFEND_ICD
    const bossMul = attack?.isBoss ? SHADOW_SOUL_BOSS_MULTIPLIER : 1
    return this.gainSoul(SHADOW_SOUL_DEFEND_GAIN * bossMul)
  }

  /** 刃潮「虚影反刃」：闪避或魔盾挡法时挥出周身强力反刃并短时提高暴击率。 */
  triggerRiposte() {
    if (!this.available || this.route !== 'blade' || this.bladeRiposteLevel <= 0 || this.riposteIcd > 0) return false
    this.riposteIcd = 0.45
    const p = this.player
    const reach = shadowBladeRiposteReachAt(this.bladeRiposteLevel) + this.bladeRangeBonus * 0.4
    const dmg = shadowBladeRiposteDmgAt(this.bladeRiposteLevel) * shadowBladeRendDmgMulAt(this.bladeRendLevel)
    p.shadowRiposteCritTimer = Math.max(p.shadowRiposteCritTimer || 0, 2.0)
    const enemies = this.weapon.enemyManager.enemies
      .filter(e => alive(e) && Math.hypot(e.x - p.x, e.y - p.y) <= reach + (e.radius || 0))
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))
      .slice(0, 6 + this.bladeRiposteLevel)
    const angle = p.facing || 0
    this.cleaves.push({ x: p.x, y: p.y, angle, reach, width: 18, life: 0.22, riposte: true })
    this.cleaves.push({ x: p.x, y: p.y, angle: angle + Math.PI / 2, reach, width: 18, life: 0.22, riposte: true })
    if (this.bladeRendLevel > 0) {
      this.shatterRadiusOrbs(p.x, p.y, reach, shadowBladeRendOrbsAt(this.bladeRendLevel))
    }
    for (const e of enemies) {
      if (!this.available) break
      this.hit(e, dmg, { angle: Math.atan2(e.y - p.y, e.x - p.x), secondary: true })
    }
    this.weapon._ring?.(p.x, p.y, '#f18ba5', reach)
    return true
  }

  /** 切碎线域内普通敌方弹幕；spellOnly 为 true 时仅清法球并按「噬法刃舞」充能魔盾。 */
  shatterLineBullets(ax, ay, bx, by, width, limit, { spellOnly = false } = {}) {
    if (!limit || limit <= 0) return 0
    const bullets = this.weapon.enemyManager?._bullets
    if (!bullets?.length) return 0
    let shattered = 0
    for (const b of bullets) {
      if (shattered >= limit) break
      if (!b.active || b.isBoss || (spellOnly && !b.spellAttack)) continue
      const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy
      const t = length2 ? Math.max(0, Math.min(1, ((b.x - ax) * dx + (b.y - ay) * dy) / length2)) : 0
      if ((b.x - ax - dx * t) ** 2 + (b.y - ay - dy * t) ** 2 <= (width + (b.radius || 0)) ** 2) {
        b.active = false
        shattered++
        this.impacts.push({ x: b.x, y: b.y, angle: 0, life: 0.16, maxLife: 0.16 })
      }
    }
    return shattered
  }

  /** 噬法刃舞：切碎线域内普通敌方法术弹幕并加速暗影魔盾充能。 */
  shatterLineOrbs(ax, ay, bx, by, width, limit) {
    const shattered = this.shatterLineBullets(ax, ay, bx, by, width, limit, { spellOnly: true })
    if (shattered > 0) this.shield?.accelerate(shattered * 0.45)
    return shattered
  }

  shatterRadiusOrbs(cx, cy, radius, limit) {
    if (!limit || limit <= 0) return 0
    const bullets = this.weapon.enemyManager?._bullets
    if (!bullets?.length) return 0
    let shattered = 0
    for (const b of bullets) {
      if (shattered >= limit) break
      if (!b.active || b.isBoss || !b.spellAttack) continue
      if ((b.x - cx) ** 2 + (b.y - cy) ** 2 <= (radius + (b.radius || 0)) ** 2) {
        b.active = false
        shattered++
        this.impacts.push({ x: b.x, y: b.y, angle: 0, life: 0.16, maxLife: 0.16 })
      }
    }
    if (shattered > 0) this.shield?.accelerate(shattered * 0.45)
    return shattered
  }

  /** Called by Player before ordinary movement; owns Space assault movement and swept collision. */
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
      this.shatterLineBullets(x, y, p.x, p.y, SHADOW_ASSAULT_WIDTH, 12)
      const targets = this.targets(x, y, p.x, p.y, SHADOW_ASSAULT_WIDTH)
      for (const e of targets) {
        if (!this.available) break
        if (a.hitTargets.has(e)) continue
        a.hitTargets.add(e)
        const primary = !a.primaryUsed
        a.primaryUsed = true
        if (primary) { this.markHuntTarget(e); this.clones.command(e, a.cloneIds) }
        if (this.route === 'hunt' && this.huntSpellbreakLevel > 0 && !a.spellbreakApplied && (e === this.huntTarget || shadowRangedEnemy(e))) {
          a.spellbreakApplied = true
          this.shield?.accelerate(Math.min(3.6, 1.2 + this.huntSpellbreakLevel * 0.3))
          if (!e.isBoss) {
            e.attackCd = Math.max(e.attackCd || 0, Math.min(2.6, 1.2 + this.huntSpellbreakLevel * 0.2))
            e.spellSlowTime = Math.max(e.spellSlowTime || 0, 1.5)
            e.spellSlowAmount = Math.max(e.spellSlowAmount || 0, 0.25)
          }
        }
        const result = this.hit(e, primary ? SHADOW_ASSAULT_DAMAGE : SHADOW_ASSAULT_SPLASH, { guaranteed: primary, angle: a.angle, action: a })
        if (result.landed) {
          a.landed++
          if (a.isFollowup && this.routeUltimate === 'hunt' && !a.huntShieldGranted && this.huntUltimateShieldIcd <= 0) {
            a.huntShieldGranted = true
            this.huntUltimateShieldIcd = 6.0
            this.shield?.grantLayer({ counterBuff: true })
          }
        }
        if (result.killed) a.kills++
        if (result.killed && !a.refunded && !a.isFollowup && this.available) {
          a.refunded = true
          const raw = this.route === 'hunt'
            ? Math.min(1.8, SHADOW_DASH_REFUND + Math.min(6, this.huntReapLevel) * .16 + Math.max(0, this.huntReapLevel - 6) * .08)
            : SHADOW_DASH_REFUND
          const refund = Math.min(raw, this.refundLeft)
          if (refund > 0) {
            this.refundLeft -= refund
            p.strainSkillCd = Math.max(0, p.strainSkillCd - refund)
            this.weapon.enemyManager.addText(p.x, p.y - 42, `影袭收割 · 影袭 −${refund.toFixed(2)}秒`, null, '#f18d9e', 13)
          }
          if (this.route === 'hunt' && this.huntReapLevel > 0) {
            this.shield?.accelerate(Math.min(3, 1.0 + this.huntReapLevel * 0.25))
          }
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
      this.game.combatFeedback?.impact({ hits: a.landed, kills: a.kills, angle: a.angle })
      this.weapon.game.mapFeatures?.attackBarricades(p.x, p.y, this.reach)
      this.assault = null
      if (!a.isFollowup && this.game?.bossTomes?.rank('assassin_voidstep') === 3) this.game.bossTomes.until.shadowCrit = this.game?.bossTomes.time + 3
      if (p.shadowBossStep) p.guaranteedCrit = true
      this.weapon.cooldown = Math.min(this.weapon.cooldown, 0.10)
      if (this.routeUltimate === 'hunt' && a.primaryUsed && !a.isFollowup) {
        this.huntFollowupReady = true
        this.huntFollowupTimer = 1.25
      }
      if (this.routeUltimate === 'blade') this.createDomain(p.x, p.y, a.angle)
      if (!a.isFollowup && p.shadowAssaultClone) this.clones.spawnAfterimageArrival(a.angle)
      if ((a.landed || 0) > 0) this.refundGuard(SHADOW_GUARD_ATTACK_REFUND)
      this.applyAssaultLandingBuff(a)
    }
    return true
  }

  /** 影袭落地爆发（口径 B）：赋予 2 秒 +20% 移速与随机 15%~40% 闪避、10%~30% 暴击；命中敌人则额外缩短 1~2.5 秒影魄回血冷却。 */
  applyAssaultLandingBuff(a) {
    if (!this.available || a?.isFollowup) return
    const p = this.player
    const evadeBonus = Number((SHADOW_ASSAULT_EVADE_MIN + Math.random() * SHADOW_ASSAULT_EVADE_SPAN).toFixed(4))
    const critBonus = Number((SHADOW_ASSAULT_CRIT_MIN + Math.random() * SHADOW_ASSAULT_CRIT_SPAN).toFixed(4))
    p.shadowAssaultBuffTimer = SHADOW_ASSAULT_BUFF_DURATION
    p.shadowAssaultEvasionBonus = evadeBonus
    p.shadowAssaultCritBonus = critBonus

    let healCut = 0
    if ((a?.landed || 0) > 0 && (this.soulHealCd || 0) > 0) {
      healCut = Number((SHADOW_ASSAULT_HEAL_CD_MIN + Math.random() * SHADOW_ASSAULT_HEAL_CD_SPAN).toFixed(2))
      this.soulHealCd = Math.max(0, this.soulHealCd - healCut)
      if ((this.soulPoints || 0) >= SHADOW_SOUL_THRESHOLD) this.resolveSoul()
    }
    const suffix = healCut > 0 ? ` · 回血−${healCut.toFixed(1)}s` : ''
    this.weapon.enemyManager?.addText?.(
      p.x, p.y - 38,
      `影遁 速+${Math.round(SHADOW_ASSAULT_SPEED_BONUS * 100)}% 闪+${Math.round(evadeBonus * 100)}% 暴+${Math.round(critBonus * 100)}%${suffix}`,
      null, '#d8b4fe', 13
    )
    this.game?._pushCooldown?.()
  }

  targets(ax, ay, bx, by, width) {
    return this.weapon.enemyManager.enemies.filter(e => inShadowPath(e, ax, ay, bx, by, width))
      .sort((a, b) => (a.x - ax) * (bx - ax) + (a.y - ay) * (by - ay) -
        ((b.x - ax) * (bx - ax) + (b.y - ay) * (by - ay)))
  }

  hit(enemy, multiplier, { guaranteed = false, angle = 0, secondary = false, action = null, clone = false, cloneCritEligible = false } = {}) {
    if (!this.available || !alive(enemy)) return { landed: false, killed: false }
    const ws = this.weapon, p = this.player
    const wasMarked = enemy === this.huntTarget && this.huntMarkTimer > 0
    const markMultiplier = this.route === 'hunt' && wasMarked ? 1 + this.huntMarkBonus : 1
    const tomeCrit = !secondary && !action?.hitTargets && (ws.game?.bossTomes?.until.shadowCrit || 0) > (ws.game?.bossTomes?.time || 0)
    const baseRawCrit = ws.critChance >= 1 ? Math.max(ws.critChance, ws.rawCritChance || 0) : ws.critChance
    const tempCritBonus = !secondary
      ? (p.shadowEvadeCritTimer > 0 ? 0.45 : 0) +
        (p.shadowRiposteCritTimer > 0 ? 0.15 + (this.bladeRiposteLevel || 0) * 0.05 : 0) +
        (p.shadowSoulSurgeTimer > 0 ? 0.10 : 0) +
        (p.shadowAssaultBuffTimer > 0 ? (p.shadowAssaultCritBonus || 0) : 0) +
        (this.route === 'hunt' && (enemy.isBoss || shadowRangedEnemy(enemy)) ? 0.10 : 0)
      : 0
    const effectiveCritChance = Math.min(1, baseRawCrit + tempCritBonus)
    const extraOverflowMul = Math.max(0, baseRawCrit + tempCritBonus - Math.max(1, baseRawCrit)) * 2

    const bodyCrit = !secondary && (tomeCrit || guaranteed || (!action?.hitTargets && p.guaranteedCrit) || Math.random() < effectiveCritChance)
    const cloneCrit = clone && cloneCritEligible && !bodyCrit && Math.random() < Math.min(1, baseRawCrit * this.cloneCritInherit)
    const crit = bodyCrit || cloneCrit

    let power = 1
    if (bodyCrit) {
      const wardBonusMul = !action?.hitTargets && p.shadowSpellCounterTimer > 0 && (this.wardLevel || 0) >= 2
        ? 0.6 + Math.max(0, this.wardLevel - 2) * 0.2
        : 0
      power = (ws.critMul || 3) + extraOverflowMul + wardBonusMul
      if (ws.executeCrit && enemy.hp <= enemy.maxHp * 0.5) power *= 2
    } else if (cloneCrit) {
      power = this.cloneCritMultiplier
    }

    const before = enemy.hp
    enemy.hit(ws.damage * ws.levelMul * ws.devourDamageMul * this.endlessDamageMultiplier * multiplier * markMultiplier * power,
      { bossTomeContext: { shadowBody: !secondary, clone } })
    const landed = enemy.hp < before
    // Shields and misses do not waste the stored critical strike from dash upgrades.
    if (landed) {
      if (tomeCrit) ws.game.bossTomes.until.shadowCrit = 0
      if (!secondary && !action?.hitTargets && p.guaranteedCrit) {
        p.guaranteedCrit = false
        p.shadowSpellCounterTimer = 0
      }
      if (!secondary) p.stealthTimer = 0
      if (cloneCrit) {
        this.onSoulCritical(true, null, !!enemy.isBoss)
        if (this.route === 'swarm' && this.swarmCritLevel > 0 && this.cloneCritShieldIcd <= 0) {
          this.cloneCritShieldIcd = 0.4
          this.shield?.accelerate(0.25)
        }
      }
      this.impacts.push({ x: enemy.x, y: enemy.y, angle, crit, clone, life: 0.18 })
      if (this.impacts.length > 24) this.impacts.shift()
      ws.enemyManager.addText(enemy.x, enemy.y - 14, String(Math.round((before - enemy.hp) * 10) / 10), null,
        bodyCrit ? '#ffd166' : cloneCrit ? '#f3b8ff' : '#f6d8e1', bodyCrit ? 22 : cloneCrit ? 18 : 14)
      ws.game.sound.shadowBlade?.(false, true)
    }
    const killed = !enemy.active
    if (killed) {
      ws._onKill(enemy)
      if (wasMarked && this.route === 'hunt') this.triggerHuntSpread(enemy)
      // 本体击杀（刺击/影袭）：留残影替身脱身 + 击杀远程加速魔盾 + 「猎手直觉」冷却返还。
      // 横斩、余波、刃域、分身均为 secondary，不产生这些收益。
      if (!secondary) {
        this.leaveEcho(enemy, angle)
        if (this.route === 'hunt' && (wasMarked || (this.huntRefundLevel > 0 && shadowRangedEnemy(enemy)))) {
          this.gainSoul(2)
        }
        if (shadowRangedEnemy(enemy)) {
          this.shield?.onRangedKill()
          if (this.huntRefundLevel > 0) {
            const refund = Math.min(shadowHuntRangedRefundAt(this.huntRefundLevel), this.refundLeft)
            if (refund > 0) {
              this.refundLeft -= refund
              p.strainSkillCd = Math.max(0, p.strainSkillCd - refund)
              ws.enemyManager.addText(p.x, p.y - 42, `猎手直觉 · 影袭 −${refund.toFixed(2)}秒`, null, '#84d6e8', 13)
            }
          }
        }
      }
    }
    if (landed && bodyCrit && !secondary && this.available) {
      this.shield?.onCritical()
      this.clones.onCritical(enemy, action)
      this.cleave(enemy, angle)
      this.onSoulCritical(false, action, !!enemy.isBoss)
    }
    return { landed, killed }
  }

  /** 刺杀残影：在击杀点留下短命替身（到期或触敌爆出碎斩）；与主动替身共用 _decoys 池，总上限 3。 */
  leaveEcho(enemy, angle = this.player?.facing || 0) {
    const p = this.player
    p._decoys = (p._decoys || []).filter(d => d.life > 0)
    if (p._decoys.length >= SHADOW_KILL_ECHO_CAP) return
    const echoLife = SHADOW_KILL_ECHO_LIFE + (p.shadowCloneLifeLevel || 0) * 0.5
    p._decoys.push({
      x: enemy.x, y: enemy.y, angle, radius: p.radius * 0.8,
      life: echoLife, maxLife: echoLife, flash: 0, isDecoy: true, echo: true,
    })
  }

  onCloneKill(clone, enemy) {
    if (this.route !== 'swarm' || this.swarmReapLevel <= 0) return
    const recovery = Math.min(1.5, Math.min(6, this.swarmReapLevel) * .2 + Math.max(0, this.swarmReapLevel - 6) * .05)
    for (const other of this.clones.items) {
      if (other === clone || other.life <= 0 || Math.hypot(other.x - enemy.x, other.y - enemy.y) > 300) continue
      other.life = Math.min(other.maxLife, other.life + recovery)
    }
  }

  /** A short transverse cut clears the target's flanks; crits on cooldown shorten remaining cooldown. Cannot crit, recurse or refund F unnecessarily. */
  cleave(origin, angle) {
    const config = SHADOW_CLEAVE[this.player.shadowCleaveLevel - 1]
    if (!config || !this.available) return
    if (this.cleaveCooldown > 0) {
      this.cleaveCooldown = Math.max(0, this.cleaveCooldown - (this.route === 'blade' ? SHADOW_CLEAVE_BLADE_REFUND : SHADOW_CLEAVE_CRIT_REFUND))
      return
    }
    this.cleaveCooldown = config.cooldown
    const reach = config.reach + (this.route === 'blade' ? this.bladeRangeBonus : 0)
    const maxTargets = this.route === 'blade' ? this.bladeMaxTargets : 4
    const rendMul = this.route === 'blade' ? shadowBladeRendDmgMulAt(this.bladeRendLevel) : 1
    const cross = angle + Math.PI / 2
    const dx = Math.cos(cross) * reach, dy = Math.sin(cross) * reach
    const targets = this.targets(origin.x - dx, origin.y - dy, origin.x + dx, origin.y + dy, config.width)
      .filter(e => e !== origin)
      .sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y))
      .slice(0, maxTargets)
    this.cleaves.push({ x: origin.x, y: origin.y, angle: cross, reach, width: config.width, life: 0.2 })
    if (this.route === 'blade') {
      this.shield?.accelerate(0.4)
      if (this.bladeCleaveRefundIcd <= 0 && this.player.strainSkillCd > 0) {
        this.bladeCleaveRefundIcd = 0.55
        this.player.strainSkillCd = Math.max(0, this.player.strainSkillCd - 0.15)
      }
      if (this.bladeRendLevel > 0) {
        this.shatterLineOrbs(origin.x - dx, origin.y - dy, origin.x + dx, origin.y + dy, config.width + 8, shadowBladeRendOrbsAt(this.bladeRendLevel))
      }
      if (this.bladeEchoLevel > 0 && this.echoQueue.length < 12) {
        this.echoQueue.push({
          due: this.time + .18, x: origin.x, y: origin.y, angle: cross, reach, width: config.width,
          damage: this.bladeEchoMultiplier * rendMul, maxTargets,
        })
      }
    }
    for (const e of targets) {
      if (!this.available) break
      this.hit(e, config.damage * rendMul, { angle: cross, secondary: true })
    }
  }

  update(dt) {
    if (!this.available) { this.reset(); return }
    this.time += dt
    this.clones.update(dt)
    if (!this.available) return
    this.cleaveCooldown = Math.max(0, this.cleaveCooldown - dt)
    this.huntMarkTimer = Math.max(0, this.huntMarkTimer - dt)
    this.huntUltimateShieldIcd = Math.max(0, this.huntUltimateShieldIcd - dt)
    this.evadeCounterIcd = Math.max(0, this.evadeCounterIcd - dt)
    this.riposteIcd = Math.max(0, this.riposteIcd - dt)
    this.cloneCritShieldIcd = Math.max(0, this.cloneCritShieldIcd - dt)
    this.bladeCleaveRefundIcd = Math.max(0, this.bladeCleaveRefundIcd - dt)
    this.soulHealCd = Math.max(0, (this.soulHealCd || 0) - dt)
    this.soulCritIcd = Math.max(0, (this.soulCritIcd || 0) - dt)
    this.soulCloneIcd = Math.max(0, (this.soulCloneIcd || 0) - dt)
    this.soulDefendIcd = Math.max(0, (this.soulDefendIcd || 0) - dt)
    this.bladeParryIcd = Math.max(0, (this.bladeParryIcd || 0) - dt)
    this.substituteCd = Math.max(0, (this.substituteCd || 0) - dt)
    this.guardFlash = Math.max(0, (this.guardFlash || 0) - dt)
    if (this.available && (this.guardCharges || 0) < SHADOW_GUARD_CAP) {
      this.guardCd = Math.max(0, (this.guardCd || 0) - dt)
      if (this.guardCd <= 0) {
        this.guardCharges = SHADOW_GUARD_CAP
        this.guardFlash = 0.32
        this.weapon?._ring?.(this.player.x, this.player.y, '#cbd5e1', this.player.radius + 12)
      }
    }
    if ((this.soulPoints || 0) >= SHADOW_SOUL_THRESHOLD) this.resolveSoul()
    if (!this.huntMarkTimer || !alive(this.huntTarget)) this.huntTarget = null
    if (this.huntFollowupTimer > 0) {
      this.huntFollowupTimer = Math.max(0, this.huntFollowupTimer - dt)
      if (!this.huntFollowupTimer) this.huntFollowupReady = false
    }
    this.updateEchoes()
    this.updateDomains(dt)
    this.inDomain = this.domains.some(domain => {
      const radius = 92 + Math.min(60, this.bladeArcLevel * 6)
      return (this.player.x - domain.x) ** 2 + (this.player.y - domain.y) ** 2 <= radius ** 2
    })
    this.shield?.update(dt)
    for (const list of [this.echoes, this.impacts, this.cleaves, this.waves]) {
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
    const stabHits = new Set(targets)
    let landed = false
    for (let i = 0; i < targets.length && this.available; i++) {
      landed = this.hit(targets[i], SHADOW_BLADE_DAMAGE * (i ? 0.65 : 1), { angle: s.angle, action: s }).landed || landed
    }
    if (this.bladeParryIcd <= 0 && this.available) {
      const parried = this.shatterLineBullets(
        p.x + dx * p.radius * 0.5, p.y + dy * p.radius * 0.5,
        p.x + dx * s.reach, p.y + dy * s.reach,
        SHADOW_BLADE_WIDTH + 6, 1
      )
      if (parried > 0) {
        this.bladeParryIcd = SHADOW_BLADE_PARRY_ICD
        this.weapon.enemyManager?.addText?.(p.x, p.y - 24, '刀光破箭', null, '#d8b4fe', 12)
      }
    }
    this.stabCombo = ((this.stabCombo || 0) + 1) % SHADOW_BLADE_WAVE_EVERY
    if (this.stabCombo === 0 && this.available) {
      const waveReach = p.radius + (SHADOW_BLADE_WAVE_REACH + (this.route === 'blade' ? this.bladeRangeBonus * 0.6 : 0)) * (this.weapon.geneRangeMul || 1)
      const waveTargets = this.targets(
        p.x + dx * p.radius * 0.5, p.y + dy * p.radius * 0.5,
        p.x + dx * waveReach, p.y + dy * waveReach, SHADOW_BLADE_WAVE_WIDTH
      ).filter(e => !stabHits.has(e) && shadowLineClear(this.game, p, e)).slice(0, 5)
      if (this.route === 'blade' && this.bladeRendLevel > 0) {
        this.shatterLineOrbs(
          p.x + dx * p.radius * 0.5, p.y + dy * p.radius * 0.5,
          p.x + dx * waveReach, p.y + dy * waveReach,
          SHADOW_BLADE_WAVE_WIDTH + 6, shadowBladeRendOrbsAt(this.bladeRendLevel)
        )
      }
      if (this.route === 'hunt' && alive(this.huntTarget) && (stabHits.has(this.huntTarget) || waveTargets.includes(this.huntTarget))) {
        this.huntMarkTimer = Math.min(6.5, (this.huntMarkTimer || 0) + 1.5)
      }
      this.waves.push({ x: p.x, y: p.y, angle: s.angle, reach: waveReach, width: SHADOW_BLADE_WAVE_WIDTH, life: 0.22 })
      let waveLanded = false
      for (const e of waveTargets) {
        if (!this.available) break
        const waveHit = this.hit(e, SHADOW_BLADE_WAVE_DAMAGE, { angle: s.angle, action: s })
        waveLanded = waveHit.landed || waveLanded
        landed = waveHit.landed || landed
      }
      if (this.available && (waveLanded || landed)) this.refundGuard(SHADOW_GUARD_ATTACK_REFUND)
      this.clones.onBodyWave(s.angle)
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
    const rendMul = this.route === 'blade' ? shadowBladeRendDmgMulAt(this.bladeRendLevel) : 1
    for (let i = this.domains.length - 1; i >= 0; i--) {
      const domain = this.domains[i]
      domain.life -= dt; domain.timer -= dt
      if (domain.life <= 0) { this.domains.splice(i, 1); continue }
      if (domain.timer > 0) continue
      domain.timer = .42
      const radius = 92 + Math.min(60, this.bladeArcLevel * 6)
      if (this.route === 'blade' && this.bladeRendLevel > 0) {
        this.shatterRadiusOrbs(domain.x, domain.y, radius, shadowBladeRendOrbsAt(this.bladeRendLevel))
      }
      const targets = this.weapon.enemyManager.enemies
        .filter(enemy => alive(enemy) && (enemy.x - domain.x) ** 2 + (enemy.y - domain.y) ** 2 <= radius ** 2)
        .sort((a, b) => (a.x - domain.x) ** 2 + (a.y - domain.y) ** 2 - ((b.x - domain.x) ** 2 + (b.y - domain.y) ** 2))
        .slice(0, 12)
      for (const enemy of targets) {
        if (!this.available) break
        this.hit(enemy, .62 * rendMul, { angle: domain.angle, secondary: true })
      }
    }
  }

  render(ctx) { if (this.available) renderShadowCombat(ctx, this) }
}
