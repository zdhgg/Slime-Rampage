import { getSoftRankMultiplier } from './SkillProgression.js'
import {
  CROSS_CANTRIPS,
  ELEMENTAL_BRANCHES,
  ELEMENTAL_BUILD_RULES,
  ELEMENTAL_SCHOOLS,
  MAX_CROSS_CANTRIPS,
  elementToSchool,
  fireActiveCdReduction,
  fireDestImmolateRadiusBonus,
  fireDestImmolateVuln,
  fireDestMeteorScale,
  fireHotStreakDamageMul,
  fireHotStreakPity,
  fireHotStreakRadius,
  fireIgniteDotMul,
  fireIgniteSpreadRange,
  fireIgniteSpreadTargets,
  fireIgniteVulnMul,
  fireInfernalAuraScale,
  fireInfernalBurstScale,
  fireInfernalDurationBonus,
  firePyroCombustCrit,
  firePyroCombustDuration,
  firePyroCombustHaste,
  firePyroRefundChance,
  firePyroStreakScale,
  fireRainDuration,
  fireRainInterval,
  fireRainMeteorCount,
  fireRainMeteorDamageMul,
  fireRainRadius,
  fireRainScorchCritBonus,
  fireRainScorchSlow,
  fireSizeScale,
  fireVolleyCompMul,
  fireVolleyCount,
  iceArrowCount,
  iceBlizzardCdrCritMul,
  iceBlizzardCdrThreshold,
  iceBlizzardDuration,
  iceBlizzardInterval,
  iceBlizzardRadius,
  iceBlizzardTickMul,
  iceCometCount,
  iceCometScale,
  iceFrostbiteDmgMul,
  iceFrostbiteSlow,
  iceLanceDamageMul,
  iceMultiDamageMul,
  iceNovaRadiusBonus,
  iceShatterCritChance,
  iceShatterDamageMul,
  iceShatterDeepCritMul,
  iceShatterFlurryCadence,
  iceShatterFlurryScale,
  iceShatterRadius,
  iceStormHailDamageScale,
  iceStormHailHaste,
  iceStormVeinsDuration,
  iceStormVeinsHaste,
  normalizeSpellSchool,
  poiAffAgonyBossBonus,
  poiAffAgonyTickMul,
  poiAffSiphonChance,
  poiAffSiphonShieldDmg,
  poiAgonyBoltCount,
  poiAgonyCap,
  poiAgonyDuration,
  poiCurseMultiDotBonus,
  poiCurseSlow,
  poiCurseVuln,
  poiPanBurstDamageMul,
  poiPanBurstRadius,
  poiRaptureScale,
  poiSeedBloomDamageScale,
  poiSeedBloomDurationBonus,
  poiSeedBloomRadiusBonus,
  poiSeedExplosionMul,
  poiSeedInterval,
  poiSeedRadius,
  poiSeedTickMul,
  scholarDamageMultiplier,
  schoolToElement,
  spellMasteryHaste,
  spellSchoolPower,
} from './ElementalSchools.js'
import { elementalBuildNote, elementalRouteInvestment, elementalRouteReady } from './ElementalBuild.js'
import { ELEMENTAL_SKILL_BY_ID } from './ElementalUpgrades.js'
import { spellMilestoneReward } from './SpellRules.js'
import { BASE_SPELL_PALETTES, spellPalette } from './SpellPalette.js'
import { SpellShield } from './SpellShield.js'
import { LightningCasting } from './LightningCasting.js'
import { SpellContagion } from './SpellContagion.js'
import { renderSpellGround, renderSpells } from './SpellVisuals.js'

const TAU = Math.PI * 2
const MASTERY_ID_BY_SCHOOL = { fire: 'fire_mastery', ice: 'ice_mastery', lightning: 'lit_mastery', poison: 'poi_mastery' }
const PACT_ID_BY_SCHOOL = {
  fire: 'fire_infernal_pact',
  ice: 'ice_comet_mastery',
  lightning: 'lit_keeper_pact',
  poison: 'poi_rapture_pact',
}
const MAX_ZONES = 10
const MAX_EFFECTS = 140
const MAX_SHOTS = 90

function clampWorld(val, max, pad = 28) {
  return Math.max(pad, Math.min((max || 2000) - pad, val))
}

/**
 * Elemental Slime v2 combat controller.
 * Manages 4 independent schools (fire / ice / lightning / poison),
 * up to 2 cross-school Lv.1 cantrips, 8 ascendancy branches & ultimates,
 * characteristic shields, ground AoE zones, and spell summons.
 */
export class SpellCombat {
  constructor(weapon) {
    this.weapon = weapon
    this._game = weapon?.game || weapon?.player?.game || null
    this.shield = new SpellShield(this)
    this.lightning = new LightningCasting(this)
    this.contagion = new SpellContagion(this)
    this.reset()
  }

  get game() {
    return this._game || this.weapon?.game || this.weapon?.player?.game || null
  }

  set game(v) {
    this._game = v
  }

  reset() {
    this.enabled = false
    this.school = null
    this._branch = null
    this.branchUltimate = null
    this.crossCantrips = []
    this.normalChoices = 0
    this.elements = new Set()
    this.activeCd = 0
    this.destAlreadyHadRain = false
    this.stormAlreadyHadBlizzard = false
    this.pandemicAlreadyHadSeed = false
    this.clocks = { primary: 0.2, autoAoE: 2.0 }
    this.cantripClocks = { fire: 1.5, ice: 1.5, lightning: 1.5, poison: 1.5 }
    this.hotStreak = 0
    this.hotStreakIcd = 0
    this.pyroblastIcd = 0
    this.fireNonCritStreak = 0
    this.iceCastCounter = 0
    this.pyroLastCdrAt = -99
    this.combustionTimer = 0
    this.combustionIsUltimate = false
    this.iceVeinsTimer = 0
    this.blizzardHitAccum = 0
    this.plagueFrenzyTimer = 0
    this.staticRushTimer = 0
    this.soulFragments = 0
    this.siphonHealCd = 0
    this.totemCritBonus = 0
    this.totemHasteBonus = 0
    this.zones = []
    this.summons = []
    this.shots = []
    this.fields = []
    this.delayed = []
    this.effects = []
    this.marks = []
    this.jobs = []
    this.stats = {
      casts: 0,
      castsByElement: {},
      damageByElement: {},
      fireExplosions: 0,
      bodyLightningCasts: 0,
      skyStrikes: 0,
      shieldAbsorbed: 0,
      contagionTransfers: 0,
      burnSpreads: 0,
      pyroblasts: 0,
      shatters: 0,
      overloads: 0,
      cantripCasts: 0,
    }
    this.shield?.reset()
    this.lightning?.reset()
    this.contagion?.reset()
  }

  get player() {
    return this.weapon?.player || this.game?.player || null
  }

  get enemies() {
    return this.game?.enemyManager?.enemies || []
  }

  get branch() {
    return this._branch
  }

  set branch(value) {
    this._branch = value
  }

  get route() {
    return this._branch
  }

  get routeUltimate() {
    return this.branchUltimate
  }

  get usesBasicProjectile() {
    return !this.school
  }

  get available() {
    return this.enabled
  }

  start() {
    return this.sync(this.game)
  }

  milestoneReward() {
    return spellMilestoneReward(this)
  }

  coreOptions() {
    return []
  }

  fx(x, y, radius = 48, color = '#b6a4ff', kind = 'ring', life = 0.35) {
    this.pushEffect({ kind: kind === 'core' ? 'ring' : kind, x, y, r: 8, maxR: radius, color, life, maxLife: life, lineWidth: 3 })
  }

  get fusion() {
    return null
  }

  get rangeScale() {
    return this.weapon?.geneRangeMul || 1
  }

  get endlessPowerMul() {
    const lv = this.rank('ele_endless_arcane')
    return lv > 0 ? getSoftRankMultiplier(lv, 0.045, 5, 1.5) : 1
  }

  get scholarMul() {
    return scholarDamageMultiplier(this.crossCantrips.length)
  }

  get tomePowerMul() {
    return this.game?.bossTomes?.autoCastMultiplier?.() ?? 1
  }

  get genePowerMul() {
    const reactBonus = 1 + Math.max(0, (this.weapon?.spellGeneReactionMul || 1) - 1) * 0.5
    return (this.weapon?.spellGenePowerMul || 1) * (this.weapon?.spellGeneRoutePowerMul || 1) * reactBonus
  }

  get hasteScale() {
    const weaponInterval = Math.max(0.25, this.weapon?.attackInterval || 1.0)
    const weaponHaste = Math.max(0.5, Math.min(2.6, 1 / weaponInterval))
    const masteryId = MASTERY_ID_BY_SCHOOL[this.school]
    let internal = 1 + (masteryId ? spellMasteryHaste(this.rank(masteryId)) : 0)
    if (this.combustionTimer > 0 && this.school === 'fire') {
      internal += firePyroCombustHaste(this.rank('fire_pyro_combust'))
    }
    if (this.iceVeinsTimer > 0 && this.school === 'ice') {
      internal += iceStormVeinsHaste(this.rank('ice_storm_veins'))
    }
    if (this.totemHasteBonus > 0 && this.school === 'lightning') {
      internal += this.totemHasteBonus
    }
    return weaponHaste * internal
  }

  get primaryInterval() {
    const base = this.school ? ELEMENTAL_SCHOOLS[this.school]?.primarySpell?.interval || 0.95 : 1.0
    return Math.max(0.28, base / this.hasteScale)
  }

  get activeCooldown() {
    const base = this.school ? ELEMENTAL_SCHOOLS[this.school]?.activeSpell?.cooldown || 10.5 : 10.0
    const pactId = PACT_ID_BY_SCHOOL[this.school]
    const pactRed = pactId ? fireActiveCdReduction(this.rank(pactId)) : 0
    const tomeRed = this.game?.bossTomes?.spellCooldownMultiplier ?? 1
    return Math.max(3.5, base * (1 - pactRed) * tomeRed)
  }

  get activeName() {
    if (!this.school) return '原质释放'
    if (this.branchUltimate && ELEMENTAL_BRANCHES[this._branch]?.ultimate === this.branchUltimate) {
      return ELEMENTAL_BRANCHES[this._branch].ultimateName
    }
    return ELEMENTAL_SCHOOLS[this.school]?.activeSpell?.name || '原质释放'
  }

  get playerMoveBonus() {
    let bonus = 0
    if (this.iceVeinsTimer > 0 && this.rank('ice_storm_veins') > 0) bonus += 0.15
    if (this.staticRushTimer > 0) bonus += 0.35
    return bonus
  }

  get dotSpeedMultiplier() {
    return this.plagueFrenzyTimer > 0 ? 2 : 1
  }

  rank(id) {
    return Math.max(0, Math.floor(Number(this.game?.skillLevels?.[id] || 0)))
  }

  agonyCap() {
    return poiAgonyCap(this.rank('poi_agony_bolt'), this._branch)
  }

  sync(game = this.game) {
    if (game) this.game = game
    this.enabled = this.game?.startingStrain === 'elemental'
    this._syncElements()
    return this.enabled
  }

  syncElements() {
    return this._syncElements()
  }

  _syncElements() {
    const list = []
    if (this.school) list.push(schoolToElement(this.school))
    for (const c of this.crossCantrips) {
      const el = schoolToElement(c)
      if (!list.includes(el)) list.push(el)
    }
    for (const el of this.elements || []) {
      if (!list.includes(el)) list.push(el)
    }
    this.elements = new Set(list)
    if (this.enabled && this.player) {
      if (!(this.player.elements instanceof Map)) this.player.elements = new Map()
      if (this.school) {
        for (const id of [...this.player.elements.keys()]) {
          if (!this.elements.has(id)) this.player.elements.delete(id)
        }
      }
      for (const el of list) {
        const masteryId = MASTERY_ID_BY_SCHOOL[elementToSchool(el)]
        const baseRank = el === schoolToElement(this.school) && masteryId ? Math.max(1, this.rank(masteryId) + 1) : 1
        this.player.elements.set(el, Math.max(this.player.elements.get(el) || 0, baseRank))
      }
      this.player._refreshElements?.()
    }
  }

  chooseSchool(schoolId) {
    const school = normalizeSpellSchool(schoolId)
    if (!ELEMENTAL_SCHOOLS[school]) return false
    this.school = school
    this.hotStreak = 0
    this.hotStreakIcd = 0
    this.pyroblastIcd = 0
    this.fireNonCritStreak = 0
    this.clocks.primary = 0.15
    this.clocks.autoAoE = 1.4
    this._syncElements()
    const def = ELEMENTAL_SCHOOLS[school]
    if (this.player) {
      this.pushEffect({
        kind: 'ring',
        x: this.player.x,
        y: this.player.y,
        r: 14,
        maxR: 115,
        color: def.color,
        life: 0.4,
        maxLife: 0.4,
        lineWidth: 4,
      })
    }
    this.game?.sound?.spellCorePick?.()
    return true
  }

  applyMilestone(option) {
    if (!option) return false
    return this.chooseSchool(option.school || option.element || option.id)
  }

  applyCore() {
    return false
  }

  learnCantrip(schoolOrId) {
    const raw = String(schoolOrId || '').replace(/^cantrip_/, '')
    const school = normalizeSpellSchool(raw)
    if (!this.school || school === this.school) return false
    if (this.crossCantrips.includes(school) || this.crossCantrips.length >= MAX_CROSS_CANTRIPS) return false
    this.crossCantrips.push(school)
    this.cantripClocks[school] = 0.25
    this._syncElements()
    return true
  }

  chooseBranch(branchId) {
    const def = ELEMENTAL_BRANCHES[branchId]
    if (!def || this._branch) return false
    if (this.school && def.school !== this.school) return false
    if (!this.school) this.chooseSchool(def.school)

    this.destAlreadyHadRain = branchId === 'fire_destruction' && this.rank('fire_rain') > 0
    this.stormAlreadyHadBlizzard = branchId === 'ice_storm' && this.rank('ice_blizzard') > 0
    this.pandemicAlreadyHadSeed = branchId === 'poi_pandemic' && this.rank('poi_seed') > 0

    this._branch = branchId
    if (def.grantSkill && this.rank(def.grantSkill) <= 0 && this.game?.skillLevels) {
      this.game.skillLevels[def.grantSkill] = 1
      if (this.game.obtainedSkillIds && !this.game.obtainedSkillIds.includes(def.grantSkill)) {
        this.game.obtainedSkillIds.push(def.grantSkill)
      }
      if (def.grantSkill === 'fire_rain' || def.grantSkill === 'ice_blizzard' || def.grantSkill === 'poi_seed') {
        this.clocks.autoAoE = Math.min(this.clocks.autoAoE, 0.35)
      }
    }
    if (this.player) {
      this.pushEffect({
        kind: 'ring',
        x: this.player.x,
        y: this.player.y,
        r: 16,
        maxR: 135,
        color: def.color,
        life: 0.45,
        maxLife: 0.45,
        lineWidth: 4,
      })
    }
    return true
  }

  chooseRoute(route) {
    return this.chooseBranch(route)
  }

  applyElementalSkill(skill) {
    if (!skill) return
    if (skill.isCantrip || skill.isCrossCantrip || skill.id?.startsWith?.('cantrip_')) {
      this.learnCantrip(skill.school || skill.id)
    } else if (skill.isBranchUltimate || skill.kind === 'ultimate') {
      this.branchUltimate = skill.id
    } else if (skill.id === 'spell_shield' && this.shield) {
      this.shield.upgrade()
    } else if ((skill.id === 'fire_rain' || skill.id === 'ice_blizzard' || skill.id === 'poi_seed') && this.rank(skill.id) === 1) {
      this.clocks.autoAoE = Math.min(this.clocks.autoAoE, 0.4)
    } else if (skill.id === 'lit_thunderstorm' && this.rank('lit_thunderstorm') === 1) {
      this.lightning.thunderstormTimer = Math.min(this.lightning.thunderstormTimer, 0.4)
    }
  }

  reduceActiveCooldown(seconds) {
    if (seconds <= 0) return
    this.activeCd = Math.max(0, (this.activeCd || 0) - seconds)
    if (this.player && this.player.strainSkillCd > 0) {
      this.player.strainSkillCd = Math.max(0, this.player.strainSkillCd - seconds)
    }
  }

  schoolDamage(school, mul = 1) {
    const norm = normalizeSpellSchool(school)
    const masteryId = MASTERY_ID_BY_SCHOOL[norm]
    const masteryMul = norm === this.school && masteryId ? spellSchoolPower(this.rank(masteryId)) : 1
    const base = (this.weapon?.damage || 1) * (this.weapon?.levelMul || 1) * (this.weapon?.devourDamageMul || 1) * mul
    const scholar = norm === this.school ? this.scholarMul : 1
    const shieldPoisonBonus =
      norm === 'poison' && this.school === 'poison' && this.shield.charges > 0 && this.rank('poi_aff_siphon') > 0
        ? 1 + poiAffSiphonShieldDmg(this.rank('poi_aff_siphon'))
        : 1
    return (
      base *
      masteryMul *
      scholar *
      shieldPoisonBonus *
      this.endlessPowerMul *
      this.tomePowerMul *
      this.genePowerMul
    )
  }

  cantripBaseDamage(school, mul = 1) {
    return (
      (this.weapon?.damage || 1) *
      (this.weapon?.levelMul || 1) *
      (this.weapon?.devourDamageMul || 1) *
      mul *
      this.endlessPowerMul *
      this.tomePowerMul *
      (this.weapon?.spellGenePowerMul || 1)
    )
  }

  damageEnemy(e, rawAmount, opts = {}) {
    if (!e?.active || e.hp <= 0) return { hit: false, crit: false, damage: 0 }
    const school = elementToSchool(opts.element || this.school || 'fire')
    let amount = rawAmount

    if (opts.active) {
      amount *= this.game?.bossTomes?.activeSpellMultiplier ?? 1
    }
    if (!opts.cantrip && school === this.school && e.cantripVulnTime > 0 && e.cantripVulnAmount > 0) {
      amount *= 1 + e.cantripVulnAmount
    }
    if (!opts.cantrip && school === this.school && e.cantripIceVulnTime > 0 && e.cantripIceVulnAmount > 0) {
      amount *= 1 + e.cantripIceVulnAmount
    }
    if (school === 'fire' && (e.burnHits || 0) > 0 && this.rank('fire_ignite') > 0 && !opts.cantrip) {
      amount *= fireIgniteVulnMul(this.rank('fire_ignite'))
    }
    if (school === 'fire' && !opts.cantrip && this.rank('fire_dest_immolate') > 0 && this._isInInfernalAura(e)) {
      amount *= 1 + fireDestImmolateVuln(this.rank('fire_dest_immolate'))
    }
    if (school === 'ice' && !opts.cantrip && this._hasIceMark(e)) {
      if (this.rank('ice_frostbite') > 0) amount *= iceFrostbiteDmgMul(this.rank('ice_frostbite'))
      if (e.isBoss || e.isElite) amount *= 1.2
    }
    if (school === 'poison' && !opts.cantrip && this.rank('poi_curse') > 0) {
      const dotKinds = this._countPlagueDotKinds(e)
      if (dotKinds > 0) amount *= 1 + dotKinds * poiCurseMultiDotBonus(this.rank('poi_curse'))
    }

    let critChance = this.weapon?.critChance || 0
    if (!opts.cantrip && school === this.school && e.cantripFireCritTime > 0 && e.cantripFireCritAmount > 0) {
      critChance += e.cantripFireCritAmount
    }
    if (school === 'fire' && !opts.cantrip) {
      critChance += Math.min(0.16, this.rank('fire_mastery') * 0.02)
      if (this.combustionTimer > 0) {
        critChance = this.combustionIsUltimate ? 1.0 : Math.min(0.95, critChance + firePyroCombustCrit(this.rank('fire_pyro_combust')))
      }
      if (this.rank('fire_rain_scorch') > 0 && this._isInsideZone(e, 'fire_rain')) {
        critChance += fireRainScorchCritBonus(this.rank('fire_rain_scorch'))
      }
    }
    if (school === 'ice' && !opts.cantrip && this._hasIceMark(e)) {
      critChance += iceShatterCritChance(this.rank('ice_shatter_lance'))
    }
    if (opts.extraCritChance) critChance += opts.extraCritChance
    if (opts.cantrip) critChance = this.weapon?.critChance || 0

    const isCrit = !!opts.forceCrit || Math.random() < Math.max(0, Math.min(1, critChance))
    if (isCrit) {
      const weaponCritBonus = Math.max(0, (this.weapon?.critMul ?? 3.0) - 3.0)
      let critMul = 2.25 + weaponCritBonus
      if (school === 'fire' && !opts.cantrip && this._branch === 'fire_pyromancer') critMul += 0.45
      if (school === 'ice' && !opts.cantrip && this._hasIceMark(e)) {
        critMul += Math.min(0.96, this.rank('ice_mastery') * 0.12)
        if (this.rank('ice_blizzard_cdr') > 0 && this._isInsideZone(e, 'ice_blizzard')) {
          critMul += iceBlizzardCdrCritMul(this.rank('ice_blizzard_cdr'))
        }
        if ((e.freeze > 0 || e.deepWinterTime > 0) && this.rank('ice_shatter_deep') > 0) {
          critMul += iceShatterDeepCritMul(this.rank('ice_shatter_deep'))
        }
      }
      if (this.totemCritBonus > 0 && !opts.cantrip) critMul += this.totemCritBonus
      if (opts.extraCritDamage) critMul += opts.extraCritDamage
      amount *= critMul
    }

    const beforeHp = e.hp
    const autoSpellCtx = !opts.cantrip && !opts.active
    const hitEffects = {
      element: schoolToElement(school),
      autoSpell: !!opts.autoSpell || autoSpellCtx,
      bossTomeContext: autoSpellCtx ? { autoSpell: true } : null,
      cantrip: !!opts.cantrip,
      derived: !!opts.derived,
      hitFromX: opts.fromX,
      hitFromY: opts.fromY,
    }
    e.hit(amount, hitEffects)
    const dealt = Math.max(0, beforeHp - Math.max(0, e.hp))
    const statEl = schoolToElement(school)
    this.stats.damageByElement[statEl] = (this.stats.damageByElement[statEl] || 0) + dealt

    if (!opts.derived && !opts.cantrip && !autoSpellCtx) {
      this.game?.bossTomes?.onSpellHit?.(e)
    }

    if (e.hp > 0 && e.active && this.school === 'poison' && school === 'poison' && !opts.cantrip) {
      this._feedPoisonSeedAccum(e, dealt)
    }
    if (opts.killByCataclysm && (!e.active || e.hp <= 0)) {
      e._killedByCataclysmMeteor = true
    }

    if (this.school === 'fire' && school === 'fire' && !opts.cantrip && !opts.noHotStreak && !opts.derived) {
      if (isCrit) {
        this.fireNonCritStreak = 0
        if (!opts.primaryOrMeteor || this.hotStreakIcd <= 0) {
          if (opts.primaryOrMeteor) this.hotStreakIcd = 0.24
          this.gainHotStreak(1, e, opts.primaryOrMeteor ? { fromCombat: true } : null)
        }
      } else if (opts.primaryOrMeteor) {
        this.fireNonCritStreak++
        if (this.fireNonCritStreak >= fireHotStreakPity(this.rank('fire_hot_streak'))) {
          this.fireNonCritStreak = 0
          if (this.hotStreakIcd <= 0) {
            this.hotStreakIcd = 0.24
            this.gainHotStreak(1, e, { fromCombat: true })
          }
        }
      }
    }

    if (!e.active || e.hp <= 0) {
      this.onEnemyKilled(e, { killer: opts.summonOwner || null })
      if (!e._settled) this.weapon?._onKill?.(e)
    }

    const numTxt = Math.round(amount * 10) / 10
    if (isCrit && numTxt > 0) {
      this.game?.enemyManager?.addText?.(e.x, e.y - (e.radius || 14) - 8, `✦${numTxt}`, null, '#fde047', 13)
    }
    return { hit: true, crit: isCrit, damage: dealt }
  }

  _hasIceMark(e) {
    return !!(e && ((e.frostStacks || 0) > 0 || (e.freeze || 0) > 0 || (e.deepWinterTime || 0) > 0 || (e.spellSlowTime || 0) > 0))
  }

  _countPlagueDotKinds(e) {
    if (!e) return 0
    let c = 0
    if ((e.agonyTime || 0) > 0 && (e.agonyStacks || 0) > 0) c++
    if ((e.poisonHits || 0) > 0) c++
    if ((e.curseTime || 0) > 0) c++
    if ((e.unsteadyTime || 0) > 0) c++
    return c
  }

  _isInsideZone(e, kind) {
    for (const z of this.zones) {
      if (z.kind === kind && Math.hypot(e.x - z.x, e.y - z.y) <= z.radius + (e.radius || 0)) return true
    }
    return false
  }

  _isInInfernalAura(e) {
    for (const s of this.summons) {
      if (s.kind === 'infernal' && Math.hypot(e.x - s.x, e.y - s.y) <= s.auraRadius + (e.radius || 0)) return true
    }
    return false
  }

  _feedPoisonSeedAccum(e, dmg) {
    for (const z of this.zones) {
      if (z.kind === 'poison_seed' && Math.hypot(e.x - z.x, e.y - z.y) <= z.radius + (e.radius || 0)) {
        z.damageAccum = (z.damageAccum || 0) + dmg
        if (z.damageAccum >= z.burstThreshold && z.bloomsLeft > 0) {
          z.damageAccum = 0
          this._detonatePoisonSeed(z)
        }
      }
    }
  }

  // ==================== Status Application Helpers ====================

  applyBurn(e, hits, dmgPerTick, { allowSpread = true } = {}) {
    if (!e?.active || e.hp <= 0) return
    const lv = this.rank('fire_ignite')
    const scaledTick = Math.max(0.5, dmgPerTick * (lv > 0 ? fireIgniteDotMul(lv) : 1))
    e.burnHits = Math.max(e.burnHits || 0, Math.round(hits))
    if (scaledTick >= (e._burnDmg || 0) || e.burnHits <= 0) e._burnDmg = scaledTick

    if (allowSpread && lv > 0 && this.school === 'fire') {
      const originX = e.x
      const originY = e.y
      const snapHits = Math.max(2, Math.round(e.burnHits * 0.7))
      const snapTick = scaledTick * 0.8
      this.delay(0.6, () => {
        const range = fireIgniteSpreadRange(lv) * this.rangeScale
        const count = fireIgniteSpreadTargets(lv)
        const sx = e.active ? e.x : originX
        const sy = e.active ? e.y : originY
        const targets = []
        for (const other of this.enemies) {
          if (!other?.active || other.hp <= 0 || other === e || (other.burnHits || 0) > 0) continue
          const d = Math.hypot(other.x - sx, other.y - sy)
          if (d <= range + (other.radius || 0)) targets.push({ other, d })
        }
        targets.sort((a, b) => a.d - b.d)
        for (const { other } of targets.slice(0, count)) {
          this.applyBurn(other, snapHits, snapTick, { allowSpread: false })
          this.stats.burnSpreads = (this.stats.burnSpreads || 0) + 1
          this.pushEffect({
            kind: 'tether',
            x1: sx,
            y1: sy,
            x2: other.x,
            y2: other.y,
            color: '#ff964f',
            life: 0.24,
            maxLife: 0.24,
            width: 2,
          })
        }
      })
    }
  }

  applyFrost(e, addStacks = 1, { freezeDur = 0, forceDeepWinter = false } = {}) {
    if (!e?.active || e.hp <= 0) return
    const now = this.game?.elapsed || 0
    if ((e.frostUntil || 0) < now) e.frostStacks = 0

    const biteLv = this.rank('ice_frostbite')
    const slowAmt = iceFrostbiteSlow(biteLv)
    e.spellSlowTime = Math.max(e.spellSlowTime || 0, 2.8)
    e.spellSlowAmount = e.isBoss ? 0 : Math.max(e.spellSlowAmount || 0, slowAmt)
    e.frostUntil = now + 4.0

    if (freezeDur > 0 && !e.isBoss) {
      e.freeze = Math.max(e.freeze || 0, freezeDur)
    }
    if (forceDeepWinter && e.isBoss) {
      e.deepWinterTime = Math.max(e.deepWinterTime || 0, 4.0)
    }

    if (addStacks > 0) {
      e.frostStacks = (e.frostStacks || 0) + addStacks
      if (e.frostStacks >= 3) {
        e.frostStacks = 0
        if (e.isBoss) e.deepWinterTime = Math.max(e.deepWinterTime || 0, 3.6)
        else e.freeze = Math.max(e.freeze || 0, 0.9)

        if (this.school === 'ice') {
          this._triggerShatterAndLance(e)
        }
      }
    }
  }

  applyAgony(e, addStacks = 1, { isCritCapable = true } = {}) {
    if (!e?.active || e.hp <= 0) return
    const boltLv = this.rank('poi_agony_bolt')
    const masteryLv = this.rank('poi_mastery')
    const curseLv = this.rank('poi_curse')
    const torLv = this.rank('poi_aff_agony')
    const cap = this.agonyCap()
    const wasAtCap = (e.agonyStacks || 0) >= cap
    const bonusBoss = this._branch === 'poi_affliction' && (e.isBoss || e.isElite) ? 2 : addStacks
    const gain = Math.max(addStacks, bonusBoss)

    e.agonyStacks = Math.min(cap, (e.agonyStacks || 0) + gain)
    e.agonyTime = Math.max(e.agonyTime || 0, poiAgonyDuration(boltLv))
    const dotBase = this.schoolDamage('poison', 0.5)
    e.agonyDmg = Math.max(e.agonyDmg || 0, dotBase)
    if (isCritCapable && masteryLv > 0) {
      const weaponCritBonus = Math.max(0, (this.weapon?.critMul ?? 3.0) - 3.0)
      e.agonyCritChance = Math.max(e.agonyCritChance || 0, Math.min(0.42, 0.14 + masteryLv * 0.035))
      e.agonyCritMul = 1.75 + weaponCritBonus * 0.5
    }
    if (curseLv > 0) {
      e.curseTime = Math.max(e.curseTime || 0, 4.5)
      e.curseVuln = Math.max(e.curseVuln || 0, poiCurseVuln(curseLv))
      e.curseSlow = e.isBoss ? 0 : Math.max(e.curseSlow || 0, poiCurseSlow(curseLv))
    }
    if (torLv > 0 && e.agonyStacks >= 5) {
      e.unsteadyTime = Math.max(e.unsteadyTime || 0, 4.2)
      e.unsteadyDmg = Math.max(e.unsteadyDmg || 0, this.schoolDamage('poison', poiAffAgonyTickMul(torLv) * 0.5))
    }
    // Overflow Agony harvest: hitting an enemy already at max stacks immediately triggers 1 bonus Agony tick!
    if (wasAtCap && this.school === 'poison' && e.active && e.hp > 0) {
      let tickAmt = e.agonyDmg * (0.45 + e.agonyStacks * 0.25)
      const crit = e.agonyCritChance > 0 && Math.random() < e.agonyCritChance
      if (crit) tickAmt *= e.agonyCritMul || 1.75
      const before = e.hp
      e.hit(tickAmt, { element: 'poison', derived: true })
      const dealt = Math.max(0, before - Math.max(0, e.hp))
      this.game?.enemyManager?.addText?.(
        e.x,
        e.y - 16,
        `${crit ? '✦' : ''}${Math.round(tickAmt * 10) / 10}`,
        null,
        crit ? '#d8b4fe' : '#bef264',
        crit ? 13 : 12
      )
      this.onDoTTick(e, 'agony', dealt)
      if (!e.active || e.hp <= 0) {
        this.onEnemyKilled(e)
        if (!e._settled) this.weapon?._onKill?.(e)
      }
    }
  }

  applyPoison(e, hits, dmgPerTick) {
    if (!e?.active || e.hp <= 0) return
    e.poisonHits = Math.max(e.poisonHits || 0, Math.round(hits))
    if (dmgPerTick >= (e._poisonDmg || 0) || e.poisonHits <= 0) e._poisonDmg = dmgPerTick
  }

  // ==================== Primary Cast Dispatch ====================

  cast(elementOrSchool, target = null) {
    if (!this.enabled) return false
    const school = this.school || normalizeSpellSchool(elementOrSchool)
    if (!this.school) return false
    const live = target?.active && target.hp > 0 ? target : this._nearestEnemy(this.player?.x || 0, this.player?.y || 0, 480)
    if (!live) return false

    const statEl = schoolToElement(school)
    this.stats.casts = (this.stats.casts || 0) + 1
    this.stats.castsByElement[statEl] = (this.stats.castsByElement[statEl] || 0) + 1

    let fired = false
    if (school === 'fire') fired = this._castFireball(live)
    else if (school === 'ice') fired = this._castFrostbolt(live)
    else if (school === 'lightning') fired = this.lightning.castChain(live)
    else if (school === 'poison') fired = this._castAgonyBolt(live)
    if (fired) this.game?.bossTomes?.onAutoCast?.()
    return fired
  }

  castPrimary(target = null) {
    return this.cast(this.school, target)
  }

  _nearestEnemy(x, y, maxRange = Infinity, exclude = null) {
    let best = null
    let bestD = maxRange
    for (const e of this.enemies) {
      if (!e?.active || e.hp <= 0 || exclude?.has?.(e)) continue
      const d = Math.hypot(e.x - x, e.y - y)
      if (d <= bestD + (e.radius || 0)) {
        best = e
        bestD = d
      }
    }
    return best
  }

  _nearestDistinct(x, y, maxRange, count) {
    const out = []
    for (const e of this.enemies) {
      if (!e?.active || e.hp <= 0) continue
      const d = Math.hypot(e.x - x, e.y - y)
      if (d <= maxRange + (e.radius || 0)) out.push({ e, d })
    }
    out.sort((a, b) => a.d - b.d)
    return out.slice(0, count).map(o => o.e)
  }

  _denseClusterCenter(preferBossOrElite = false) {
    const p = this.player
    const pool = this.enemies.filter(e => e?.active && e.hp > 0 && (!p || Math.hypot(e.x - p.x, e.y - p.y) <= 420))
    if (!pool.length) return p ? { x: p.x + 120, y: p.y } : { x: 0, y: 0 }
    let best = pool[0]
    let bestScore = -1
    for (const a of pool) {
      let score = preferBossOrElite ? (a.isBoss ? 8 : a.isElite ? 4 : 1) : 1
      for (const b of pool) {
        if (Math.hypot(b.x - a.x, b.y - a.y) <= 130) score++
      }
      if (score > bestScore) {
        bestScore = score
        best = a
      }
    }
    return { x: best.x, y: best.y }
  }

  // ---- Fire Primary + Hot Streak Pyroblast ----

  _castFireball(target) {
    const p = this.player
    if (!p) return false
    const volleyLv = this.rank('fire_volley')
    const count = fireVolleyCount(volleyLv)
    const compMul = fireVolleyCompMul(count)
    const sizeScale = fireSizeScale(volleyLv)
    const distinct = this._nearestDistinct(p.x, p.y, 440 * this.rangeScale, count)

    for (let i = 0; i < count; i++) {
      const aim = target.isBoss || distinct.length <= 1 ? target : distinct[i % distinct.length]
      const baseAngle = Math.atan2(aim.y - p.y, aim.x - p.x)
      const angle = baseAngle + (count > 1 && aim === target ? (i - (count - 1) / 2) * 0.14 : 0)
      this._spawnShot({
        kind: 'fireball',
        school: 'fire',
        x: p.x,
        y: p.y,
        vx: Math.cos(angle) * 410,
        vy: Math.sin(angle) * 410,
        target: aim,
        homing: 6.5,
        radius: 10,
        splashR: 54 * sizeScale * this.rangeScale,
        damage: this.schoolDamage('fire', 1.0 * compMul),
        life: 1.5,
      })
    }
    this.game?.sound?.spellFireCast?.()
    return true
  }

  gainHotStreak(stacks = 1, target = null, opts = null) {
    if (this.school !== 'fire') return
    this.hotStreak = Math.min(2, (this.hotStreak || 0) + stacks)
    if (this.hotStreak >= 2) {
      if (opts?.fromCombat && this.pyroblastIcd > 0) {
        this.hotStreak = 1
        return
      }
      this.hotStreak = 0
      const live = target?.active && target.hp > 0 ? target : this._nearestEnemy(this.player?.x || 0, this.player?.y || 0, 480)
      if (live) {
        if (opts?.fromCombat) this.pyroblastIcd = 0.55
        this._castPyroblast(live, { refunded: false })
      }
    }
  }

  _castPyroblast(target, opts = {}) {
    const p = this.player
    if (!p || !target) return
    const hsLv = this.rank('fire_hot_streak')
    const pyroLv = this.rank('fire_pyro_streak')
    const mul = fireHotStreakDamageMul(hsLv) * firePyroStreakScale(pyroLv)
    const splashR = fireHotStreakRadius(hsLv) * this.rangeScale
    const angle = Math.atan2(target.y - p.y, target.x - p.x)
    this._spawnShot({
      kind: 'pyroblast',
      school: 'fire',
      x: p.x,
      y: p.y,
      vx: Math.cos(angle) * 470,
      vy: Math.sin(angle) * 470,
      target,
      homing: 8.5,
      radius: 15,
      splashR,
      damage: this.schoolDamage('fire', mul),
      life: 1.6,
      isPyroblast: true,
      refunded: !!opts.refunded,
    })
    this.stats.pyroblasts = (this.stats.pyroblasts || 0) + 1
  }

  // ---- Ice Primary + Shatter / Ice Lance ----

  _castFrostbolt(target) {
    const p = this.player
    if (!p) return false
    const barLv = this.rank('ice_lance_barrage')
    const count = iceArrowCount(barLv)
    const compMul = iceMultiDamageMul(count)
    const pierce = 2 + barLv + (this.weapon?.genePierces || 0)
    const baseAngle = Math.atan2(target.y - p.y, target.x - p.x)
    const spread = 0.12
    const roundFrostSet = new Set()

    for (let i = 0; i < count; i++) {
      const a = baseAngle + (i - (count - 1) / 2) * spread
      this._spawnShot({
        kind: 'frostbolt',
        school: 'ice',
        x: p.x,
        y: p.y,
        vx: Math.cos(a) * 560,
        vy: Math.sin(a) * 560,
        radius: 9,
        pierceLeft: pierce,
        hitSet: new Set(),
        roundFrostSet,
        damage: this.schoolDamage('ice', 1.0 * compMul),
        life: 1.15,
      })
    }

    const flurryLv = this.rank('ice_shatter_flurry')
    if (flurryLv > 0) {
      this.iceCastCounter++
      if (this.iceCastCounter >= iceShatterFlurryCadence(flurryLv)) {
        this.iceCastCounter = 0
        this._spawnIceLance(target, { twin: false, bonusFree: true })
      }
    }
    this.game?.sound?.spellIceCast?.()
    return true
  }

  _triggerShatterAndLance(e) {
    const lv = this.rank('ice_shatter_lance')
    const flurryLv = this.rank('ice_shatter_flurry')
    const scale = iceShatterFlurryScale(flurryLv)
    const rad = iceShatterRadius(lv) * this.rangeScale
    const popDmg = this.schoolDamage('ice', iceShatterDamageMul(lv) * scale)
    this.stats.shatters = (this.stats.shatters || 0) + 1

    this.pushEffect({
      kind: 'ring',
      x: e.x,
      y: e.y,
      r: 8,
      maxR: rad,
      color: '#a8ebff',
      life: 0.28,
      maxLife: 0.28,
      lineWidth: 3,
    })
    for (const other of this.enemies) {
      if (!other?.active || other.hp <= 0) continue
      if (Math.hypot(other.x - e.x, other.y - e.y) <= rad + (other.radius || 0)) {
        this.damageEnemy(other, popDmg, { element: 'water', derived: true, extraCritChance: 0.2 })
      }
    }
    this._spawnIceLance(e, { twin: false })
    if (this._branch === 'ice_shatter') {
      this._spawnIceLance(e, { twin: true })
    }
  }

  _spawnIceLance(target, { twin = false } = {}) {
    const p = this.player
    if (!p || !target?.active) return
    const lv = this.rank('ice_shatter_lance')
    const flurryLv = this.rank('ice_shatter_flurry')
    const mul = iceLanceDamageMul(lv) * iceShatterFlurryScale(flurryLv) * (twin ? 0.7 : 1)
    const bossMul = this._branch === 'ice_shatter' && target.isBoss ? 1.2 : 1
    const baseAngle = Math.atan2(target.y - p.y, target.x - p.x) + (twin ? 0.18 : 0)
    this._spawnShot({
      kind: 'ice_lance',
      school: 'ice',
      x: p.x,
      y: p.y,
      vx: Math.cos(baseAngle) * 620,
      vy: Math.sin(baseAngle) * 620,
      target,
      homing: 10,
      radius: 9,
      pierceLeft: this._branch === 'ice_shatter' ? 2 + (this.weapon?.genePierces || 0) : this.weapon?.genePierces || 1,
      hitSet: new Set(),
      damage: this.schoolDamage('ice', mul * bossMul),
      life: 1.2,
    })
  }

  // ---- Poison Primary ----

  _castAgonyBolt(target) {
    const p = this.player
    if (!p) return false
    const boltLv = this.rank('poi_agony_bolt')
    const count = poiAgonyBoltCount(boltLv)
    const distinct = this._nearestDistinct(p.x, p.y, 440 * this.rangeScale, count)
    for (let i = 0; i < count; i++) {
      const aim = target.isBoss || distinct.length <= 1 ? target : distinct[i % distinct.length]
      const angle = Math.atan2(aim.y - p.y, aim.x - p.x) + (count > 1 && aim === target ? (i === 0 ? -0.1 : 0.1) : 0)
      this._spawnShot({
        kind: 'agony_bolt',
        school: 'poison',
        x: p.x,
        y: p.y,
        vx: Math.cos(angle) * 480,
        vy: Math.sin(angle) * 480,
        target: aim,
        homing: 8.5,
        radius: 8,
        damage: this.schoolDamage('poison', 0.85),
        life: 1.4,
      })
    }
    this.game?.sound?.spellPoisonCast?.()
    return true
  }

  // ==================== Cross-School Cantrips ====================

  _castCantrip(school) {
    const p = this.player
    if (!p || school === this.school) return false
    const target = this._nearestEnemy(p.x, p.y, 420 * this.rangeScale)
    if (!target) return false
    this.stats.cantripCasts = (this.stats.cantripCasts || 0) + 1
    if (school === 'lightning') return this.lightning.castCantripChain(target)

    const angle = Math.atan2(target.y - p.y, target.x - p.x)
    if (school === 'fire') {
      this._spawnShot({
        kind: 'cantrip_fire',
        school: 'fire',
        cantrip: true,
        x: p.x,
        y: p.y,
        vx: Math.cos(angle) * 390,
        vy: Math.sin(angle) * 390,
        target,
        homing: 5.5,
        radius: 8,
        splashR: 54 * this.rangeScale,
        damage: this.cantripBaseDamage('fire', 0.95),
        life: 1.4,
      })
      return true
    }
    if (school === 'ice') {
      this._spawnShot({
        kind: 'cantrip_ice',
        school: 'ice',
        cantrip: true,
        x: p.x,
        y: p.y,
        vx: Math.cos(angle) * 520,
        vy: Math.sin(angle) * 520,
        radius: 7,
        pierceLeft: 3,
        hitSet: new Set(),
        damage: this.cantripBaseDamage('ice', 0.85),
        life: 1.1,
      })
      return true
    }
    if (school === 'poison') {
      this._spawnShot({
        kind: 'cantrip_poison',
        school: 'poison',
        cantrip: true,
        x: p.x,
        y: p.y,
        vx: Math.cos(angle) * 450,
        vy: Math.sin(angle) * 450,
        target,
        homing: 7.5,
        radius: 7,
        damage: this.cantripBaseDamage('poison', 0.6),
        life: 1.3,
      })
      return true
    }
    return false
  }

  // ==================== Spacebar Active Skill ====================

  useActive() {
    if (!this.enabled || !this.player) return false
    const p = this.player

    if (!this.school) {
      const r = 150 * this.rangeScale
      const activeMul = this.game?.bossTomes?.activeSpellMultiplier ?? 1
      const dmg = Math.max(1, Math.round((this.weapon?.damage || 1) * (this.weapon?.levelMul || 1) * 2.4) * this.endlessPowerMul * activeMul)
      let hits = 0
      for (const e of this.enemies) {
        if (!e?.active || e.hp <= 0) continue
        if (Math.hypot(e.x - p.x, e.y - p.y) <= r) {
          hits++
          if (!e.isBoss) {
            const dx = e.x - p.x
            const dy = e.y - p.y
            const len = Math.hypot(dx, dy) || 1
            e.x = clampWorld(e.x + (dx / len) * 22, this.game?.worldWidth)
            e.y = clampWorld(e.y + (dy / len) * 22, this.game?.worldHeight)
            e.primeSlow = Math.max(e.primeSlow || 0, 1.5)
          }
          e.hit(dmg)
          if (!e.active && !e._settled) this.weapon?._onKill?.(e)
        }
      }
      if (hits <= 0) return false
      this.pushEffect({ kind: 'ring', x: p.x, y: p.y, r: 12, maxR: r, color: '#9ad8ff', life: 0.34, maxLife: 0.34, lineWidth: 3.5 })
      this.shield?.advanceRebuild?.(2.0)
      this.game?.bossTomes?.onSpellActive?.()
      this.game?.combatFeedback?.impact?.({ hits })
      this.game?.sound?.spellCast?.()
      return true
    }

    this.game?.bossTomes?.onSpellActive?.()
    let castOk = false
    if (this.school === 'fire') castOk = this._useFireActive()
    else if (this.school === 'ice') castOk = this._useIceActive()
    else if (this.school === 'lightning') castOk = this.lightning.castStormkeeperActive()
    else if (this.school === 'poison') castOk = this._usePoisonActive()
    if (castOk) this.shield?.advanceRebuild?.(2.0)
    return castOk
  }

  _useFireActive() {
    const p = this.player
    const pactLv = this.rank('fire_infernal_pact')
    const center = this._denseClusterCenter(true)
    const tx = clampWorld((p.x + center.x) * 0.5, this.game?.worldWidth, 64)
    const ty = clampWorld((p.y + center.y) * 0.5, this.game?.worldHeight, 64)
    const burstScale = fireInfernalBurstScale(pactLv)
    const auraScale = fireInfernalAuraScale(pactLv)
    const isDest = this._branch === 'fire_destruction'
    const isAbyss = this.branchUltimate === 'fire_dest_ultimate'
    const dur = 7.5 + fireInfernalDurationBonus(pactLv) + (isDest ? 1.5 : 0)

    const dropMeteor = (mx, my, mul) => {
      const rad = 112 * this.rangeScale
      const dmg = this.schoolDamage('fire', mul * burstScale)
      this.pushEffect({ kind: 'meteor_slam', x: mx, y: my, radius: rad, color: '#ff6f43', life: 0.62, maxLife: 0.62, big: true })
      for (const e of this.enemies) {
        if (!e?.active || e.hp <= 0) continue
        if (Math.hypot(e.x - mx, e.y - my) <= rad + (e.radius || 0)) {
          if (!e.isBoss) e.elementStun = Math.max(e.elementStun || 0, 1.0)
          this.damageEnemy(e, dmg, { element: 'fire', active: true, derived: true })
          if (e.active && e.hp > 0) this.applyBurn(e, 5, dmg * 0.3)
        }
      }
      this.game?.combatFeedback?.impact?.({ hits: 2 })
    }

    dropMeteor(tx, ty, 2.2)
    if (isAbyss) {
      this.delay(0.26, () => dropMeteor(tx + 34, ty - 22, 2.0))
    }

    const auraR = (88 + (isDest ? 30 : 0)) * this.rangeScale
    const maxHp = Math.round((isDest ? 18 : 13) + (this.game?.wave || 1) * 1.6)
    this.spawnSummon({
      kind: 'infernal',
      x: tx,
      y: ty,
      hp: maxHp,
      maxHp,
      life: dur,
      maxLife: dur,
      tick: 0.45,
      volleyTick: 1.25,
      kills: 0,
      radius: 24,
      facing: tx >= p.x ? 1 : -1,
      walkT: 0,
      slamT: 0.4,
      spawnT: 0.42,
      seed: Math.random() * TAU,
      auraRadius: auraR,
      tauntRadius: 195 * this.rangeScale,
      auraDamage: this.schoolDamage('fire', 0.58 * auraScale),
      martyrDamage: this.schoolDamage('fire', 1.95 * burstScale),
      martyrRadius: (125 + fireDestImmolateRadiusBonus(this.rank('fire_dest_immolate'))) * this.rangeScale,
      isAbyssalLord: isAbyss,
      isSpellSummon: true,
    })

    if (isDest) {
      this._spawnFireRainZone(tx, ty)
    }
    if (this._branch === 'fire_pyromancer') {
      const combLv = this.rank('fire_pyro_combust')
      const durBuff = this.branchUltimate === 'fire_pyro_ultimate' ? Math.max(5.5, firePyroCombustDuration(combLv)) : firePyroCombustDuration(combLv)
      if (durBuff > 0) {
        this.combustionTimer = Math.max(this.combustionTimer, durBuff)
        if (this.branchUltimate === 'fire_pyro_ultimate') this.combustionIsUltimate = true
      }
    }
    this.game?.sound?.spellExplosion?.()
    return true
  }

  _useIceActive() {
    const p = this.player
    const pactLv = this.rank('ice_comet_mastery')
    const novaR = (118 + iceNovaRadiusBonus(pactLv)) * this.rangeScale
    const novaDmg = this.schoolDamage('ice', 1.4 * iceCometScale(pactLv))
    this.pushEffect({ kind: 'ring', x: p.x, y: p.y, r: 16, maxR: novaR, color: '#80e5ff', life: 0.38, maxLife: 0.38, lineWidth: 4 })

    for (const e of this.enemies) {
      if (!e?.active || e.hp <= 0) continue
      if (Math.hypot(e.x - p.x, e.y - p.y) <= novaR + (e.radius || 0)) {
        if (!e.isBoss) {
          const dx = e.x - p.x
          const dy = e.y - p.y
          const len = Math.hypot(dx, dy) || 1
          e.x = clampWorld(e.x + (dx / len) * 34, this.game?.worldWidth)
          e.y = clampWorld(e.y + (dy / len) * 34, this.game?.worldHeight)
        }
        this.damageEnemy(e, novaDmg, { element: 'water', active: true, derived: true })
        if (e.active && e.hp > 0) this.applyFrost(e, 1, { freezeDur: 1.6, forceDeepWinter: true })
      }
    }

    const cometCount = iceCometCount(pactLv)
    const cometDmg = this.schoolDamage('ice', 1.32 * iceCometScale(pactLv))
    const cometR = 78 * this.rangeScale
    const deepLv = this.rank('ice_shatter_deep')
    for (let i = 0; i < cometCount; i++) {
      this.delay(i * 0.11, () => {
        const spot = this._denseClusterCenter(true)
        const cx = spot.x + (Math.random() - 0.5) * 44
        const cy = spot.y + (Math.random() - 0.5) * 44
        this.pushEffect({ kind: 'comet_slam', x: cx, y: cy, radius: cometR, color: '#a8ebff', life: 0.3, maxLife: 0.3 })
        let deepHit = false
        for (const e of this.enemies) {
          if (!e?.active || e.hp <= 0) continue
          if (Math.hypot(e.x - cx, e.y - cy) <= cometR + (e.radius || 0)) {
            if (deepLv > 0 && ((e.freeze || 0) > 0 || (e.deepWinterTime || 0) > 0)) deepHit = true
            this.damageEnemy(e, cometDmg, { element: 'water', active: true, derived: true })
            if (e.active && e.hp > 0) this.applyFrost(e, 1, { freezeDur: 0.65, forceDeepWinter: true })
          }
        }
        if (deepHit && deepLv > 0) {
          this.pushEffect({ kind: 'ring', x: cx, y: cy, r: 10, maxR: 75 * this.rangeScale, color: '#e0f7ff', life: 0.24, maxLife: 0.24, lineWidth: 2.5 })
          for (const e of this.enemies) {
            if (e?.active && e.hp > 0 && Math.hypot(e.x - cx, e.y - cy) <= 75 * this.rangeScale + (e.radius || 0)) {
              this.damageEnemy(e, cometDmg * 0.78, { element: 'water', derived: true, extraCritChance: 0.45 })
            }
          }
        }
      })
    }

    if (this._branch === 'ice_storm') {
      const veinsLv = this.rank('ice_storm_veins')
      if (veinsLv > 0) this.iceVeinsTimer = Math.max(this.iceVeinsTimer, iceStormVeinsDuration(veinsLv))
      if (this.branchUltimate === 'ice_storm_ultimate') {
        const aim = this._denseClusterCenter(true)
        const a = Math.atan2(aim.y - p.y, aim.x - p.x)
        this.spawnSummon({
          kind: 'frost_orb',
          x: p.x,
          y: p.y,
          vx: Math.cos(a) * 95,
          vy: Math.sin(a) * 95,
          life: 5.0,
          maxLife: 5.0,
          tick: 0.28,
          lanceTick: 0.85,
          radius: 18,
          shardDamage: this.schoolDamage('ice', 0.62),
        })
      }
    }

    if (this.branchUltimate === 'ice_shatter_ultimate') {
      this.delay(Math.min(0.55, cometCount * 0.1), () => {
        const target =
          [...this.enemies]
            .filter(e => e?.active && e.hp > 0)
            .sort((a, b) => (b.isBoss ? 3 : b.isElite ? 2 : 1) - (a.isBoss ? 3 : a.isElite ? 2 : 1) || b.hp - a.hp)[0] || null
        if (!target || !this.player) return
        const ang = Math.atan2(target.y - this.player.y, target.x - this.player.x)
        const spikeDmg = this.schoolDamage('ice', 5.5)
        const endX = this.player.x + Math.cos(ang) * 760
        const endY = this.player.y + Math.sin(ang) * 760
        this.pushEffect({
          kind: 'glacial_spike',
          x1: this.player.x,
          y1: this.player.y,
          x2: endX,
          y2: endY,
          tx: target.x,
          ty: target.y,
          color: '#e0f7ff',
          life: 0.42,
          maxLife: 0.42,
        })
        for (const e of this.enemies) {
          if (!e?.active || e.hp <= 0) continue
          const vx = endX - this.player.x
          const vy = endY - this.player.y
          const t = Math.max(0, Math.min(1, ((e.x - this.player.x) * vx + (e.y - this.player.y) * vy) / (vx * vx + vy * vy || 1)))
          const dist = Math.hypot(e.x - (this.player.x + vx * t), e.y - (this.player.y + vy * t))
          if (dist <= 28 + (e.radius || 14)) {
            this.damageEnemy(e, spikeDmg, { element: 'water', forceCrit: true, active: true, derived: true })
          }
        }
        const popR = 120 * this.rangeScale
        this.pushEffect({ kind: 'ring', x: target.x, y: target.y, r: 14, maxR: popR, color: '#a8ebff', life: 0.34, maxLife: 0.34, lineWidth: 3.5 })
        for (const e of this.enemies) {
          if (e?.active && e.hp > 0 && Math.hypot(e.x - target.x, e.y - target.y) <= popR + (e.radius || 0)) {
            this.damageEnemy(e, spikeDmg * 0.42, { element: 'water', forceCrit: true, derived: true })
          }
        }
      })
    }

    this.game?.combatFeedback?.impact?.({ hits: 2 })
    this.game?.sound?.spellIceNova?.()
    return true
  }

  _usePoisonActive() {
    const p = this.player
    const pactLv = this.rank('poi_rapture_pact')
    const scale = poiRaptureScale(pactLv)
    const bossBonus = poiAffAgonyBossBonus(this.rank('poi_aff_agony'))
    const topInfected = []

    this.pushEffect({ kind: 'ring', x: p.x, y: p.y, r: 16, maxR: 220 * this.rangeScale, color: '#a8e46b', life: 0.4, maxLife: 0.4, lineWidth: 3 })

    for (const e of this.enemies) {
      if (!e?.active || e.hp <= 0) continue
      const infected = this.contagion.isInfected(e)
      if (!infected) continue
      const dots = this._countPlagueDotKinds(e)
      const mult = (1.1 + (e.agonyStacks || 0) * 0.28 + dots * 0.45) * scale * (e.isBoss || e.isElite ? 1 + bossBonus : 1)
      const dmg = this.schoolDamage('poison', mult)
      this.damageEnemy(e, dmg, { element: 'poison', active: true, derived: true })
      this.pushEffect({ kind: 'seed_burst', x: e.x, y: e.y, radius: 52, color: '#c084fc', life: 0.34, maxLife: 0.34, seed: Math.random() * TAU })

      if (e.active && e.hp > 0) {
        if ((e.agonyStacks || 0) > 0) e.agonyTime = poiAgonyDuration(this.rank('poi_agony_bolt'))
        if ((e.poisonHits || 0) > 0) e.poisonHits = Math.max(e.poisonHits, 4)
        if ((e.curseTime || 0) > 0) e.curseTime = 4.5
        if ((e.unsteadyTime || 0) > 0) e.unsteadyTime = 4.2
        topInfected.push(e)
      }
    }

    const waves = pactLv >= 4 ? 2 : 1
    topInfected.sort((a, b) => (b.agonyStacks || 0) - (a.agonyStacks || 0))
    for (let w = 0; w < waves; w++) {
      for (const src of topInfected.slice(0, 3)) {
        this.contagion.spreadFrom(src, this.contagion.snapshot(src), 0, { forceWave: true, targetsOverride: 3, rangeOverride: 185 })
      }
    }

    if (this.branchUltimate === 'poi_pan_ultimate') {
      this.plagueFrenzyTimer = Math.max(this.plagueFrenzyTimer, 5.5)
    }

    if (this.branchUltimate === 'poi_aff_ultimate') {
      for (const e of this.enemies) {
        if (!e?.active || e.hp <= 0) continue
        if (e.agonyTime > 0) e.agonyTime += 4.0
        if (e.poisonHits > 0) e.poisonHits += 4
        if (e.curseTime > 0) e.curseTime += 4.0
        if (e.unsteadyTime > 0) e.unsteadyTime += 4.0
      }
      this.spawnSummon({
        kind: 'darkglare',
        x: p.x - 24,
        y: p.y - 24,
        life: 6.0,
        maxLife: 6.0,
        tick: 0.5,
        radius: 14,
      })
    }

    this.game?.combatFeedback?.impact?.({ hits: 2 })
    this.game?.sound?.spellPoisonCast?.()
    return true
  }

  // ==================== Auto-AoE Zones & Summons ====================

  spawnZone(zone) {
    if (this.zones.length >= MAX_ZONES) this.zones.shift()
    this.zones.push(zone)
  }

  spawnSummon(summon) {
    // Allow at most 1 active copy of unique spell summons cleanly
    const existing = this.summons.findIndex(s => s.kind === summon.kind)
    if (existing >= 0) this.summons.splice(existing, 1)
    this.summons.push(summon)
  }

  _spawnFireRainZone(x, y) {
    const lv = Math.max(1, this.rank('fire_rain'))
    const cap = this.rank('fire_dest_cataclysm') > 0 ? 3 : 2
    const activeRain = this.zones.filter(z => z.kind === 'fire_rain')
    if (activeRain.length >= cap) {
      const idx = this.zones.indexOf(activeRain[0])
      if (idx >= 0) this.zones.splice(idx, 1)
    }
    const radius = fireRainRadius(lv) * this.rangeScale
    const dur = fireRainDuration(lv)
    const meteorCount = fireRainMeteorCount(lv) + (this._branch === 'fire_destruction' && this.destAlreadyHadRain ? 1 : 0)
    const meteorDmg = this.schoolDamage('fire', fireRainMeteorDamageMul(lv) * fireDestMeteorScale(this.rank('fire_dest_cataclysm')))
    this.spawnZone({
      kind: 'fire_rain',
      school: 'fire',
      x,
      y,
      radius,
      life: dur,
      maxLife: dur,
      tick: 0.18,
      seed: Math.random() * TAU,
      meteorCount,
      meteorDamage: meteorDmg,
    })
  }

  _spawnBlizzardZone(x, y) {
    const lv = Math.max(1, this.rank('ice_blizzard'))
    const cap = this._branch === 'ice_storm' ? 3 : 2
    const existing = this.zones.filter(z => z.kind === 'ice_blizzard')
    if (existing.length >= cap) {
      const idx = this.zones.indexOf(existing[0])
      if (idx >= 0) this.zones.splice(idx, 1)
    }
    const radius = (iceBlizzardRadius(lv) + (this._branch === 'ice_storm' && this.stormAlreadyHadBlizzard ? 25 : 0)) * this.rangeScale
    const dur = iceBlizzardDuration(lv)
    const tickDmg = this.schoolDamage('ice', iceBlizzardTickMul(lv) * iceStormHailDamageScale(this.rank('ice_storm_hail')))
    this.spawnZone({
      kind: 'ice_blizzard',
      school: 'ice',
      x,
      y,
      radius,
      life: dur,
      maxLife: dur,
      tick: 0.35,
      seed: Math.random() * TAU,
      tickDamage: tickDmg,
    })
  }

  _spawnPoisonSeedZone(x, y) {
    const lv = Math.max(1, this.rank('poi_seed'))
    const bloomLv = this.rank('poi_seed_bloom')
    const cap = this._branch === 'poi_pandemic' && this.pandemicAlreadyHadSeed ? 4 : this._branch === 'poi_pandemic' ? 4 : 3
    const existing = this.zones.filter(z => z.kind === 'poison_seed')
    if (existing.length >= cap) {
      const idx = this.zones.indexOf(existing[0])
      if (idx >= 0) this.zones.splice(idx, 1)
    }
    const radius = (poiSeedRadius(lv) + poiSeedBloomRadiusBonus(bloomLv)) * this.rangeScale
    const dur = 3.8 + poiSeedBloomDurationBonus(bloomLv)
    const tickDmg = this.schoolDamage('poison', poiSeedTickMul(lv))
    const burstDmg = this.schoolDamage('poison', poiSeedExplosionMul(lv) * poiSeedBloomDamageScale(bloomLv))
    this.spawnZone({
      kind: 'poison_seed',
      school: 'poison',
      x,
      y,
      radius,
      life: dur,
      maxLife: dur,
      tick: 0.55,
      seed: Math.random() * TAU,
      tickDamage: tickDmg,
      burstDamage: burstDmg,
      burstThreshold: this.schoolDamage('poison', 1.8),
      damageAccum: 0,
      bloomsLeft: bloomLv > 0 ? 2 : 1,
    })
  }

  _detonatePoisonSeed(z) {
    if (!z || z.bloomsLeft <= 0) return
    z.bloomsLeft--
    this.pushEffect({ kind: 'seed_burst', x: z.x, y: z.y, radius: z.radius, color: '#a8e46b', life: 0.44, maxLife: 0.44, seed: Math.random() * TAU })
    for (const e of this.enemies) {
      if (!e?.active || e.hp <= 0) continue
      if (Math.hypot(e.x - z.x, e.y - z.y) <= z.radius + (e.radius || 0)) {
        this.damageEnemy(e, z.burstDamage, { element: 'poison', autoSpell: true, derived: true })
        if (e.active && e.hp > 0) this.applyAgony(e, 1)
      }
    }
  }

  // ==================== Per-Frame Update ====================

  delay(timer, fn) {
    if (this.delayed.length < 100) this.delayed.push({ timer, fn })
  }

  pushEffect(fx) {
    if (this.effects.length >= MAX_EFFECTS) this.effects.shift()
    this.effects.push(fx)
  }

  _spawnShot(shot) {
    if (this.shots.length >= MAX_SHOTS) this.shots.shift()
    this.shots.push(shot)
  }

  update(dt) {
    if (!this.enabled) return
    if (this.activeCd > 0) this.activeCd = Math.max(0, this.activeCd - dt)
    if (this.combustionTimer > 0) {
      this.combustionTimer = Math.max(0, this.combustionTimer - dt)
      if (this.combustionTimer === 0) this.combustionIsUltimate = false
    }
    if (this.iceVeinsTimer > 0) this.iceVeinsTimer = Math.max(0, this.iceVeinsTimer - dt)
    if (this.plagueFrenzyTimer > 0) this.plagueFrenzyTimer = Math.max(0, this.plagueFrenzyTimer - dt)
    if (this.staticRushTimer > 0) this.staticRushTimer = Math.max(0, this.staticRushTimer - dt)
    if (this.siphonHealCd > 0) this.siphonHealCd = Math.max(0, this.siphonHealCd - dt)

    this.shield.update(dt)
    this.hotStreakIcd = Math.max(0, (this.hotStreakIcd || 0) - dt)
    this.pyroblastIcd = Math.max(0, (this.pyroblastIcd || 0) - dt)
    this.lightning.update(dt)
    this.contagion.update(dt)

    this._updatePrimary(dt)
    this._updateAutoAoE(dt)
    this._updateCantrips(dt)
    this._updateDelayed(dt)
    this._updateShots(dt)
    this._updateZones(dt)
    this._updateSummons(dt)
    this._updateFields(dt)
    this._updateEffects(dt)
  }

  _updatePrimary(dt) {
    if (!this.school) return
    this.clocks.primary = (this.clocks.primary ?? 0.2) - dt
    if (this.clocks.primary > 0) return
    const target = this._nearestEnemy(this.player?.x || 0, this.player?.y || 0, 480)
    if (!target) {
      this.clocks.primary = 0.15
      return
    }
    this.clocks.primary = this.primaryInterval
    this.castPrimary(target)
  }

  _updateAutoAoE(dt) {
    if (!this.school) return
    const fireLv = this.school === 'fire' ? this.rank('fire_rain') : 0
    const iceLv = this.school === 'ice' ? this.rank('ice_blizzard') : 0
    const poiLv = this.school === 'poison' ? this.rank('poi_seed') : 0
    if (fireLv <= 0 && iceLv <= 0 && poiLv <= 0) return

    this.clocks.autoAoE -= dt
    if (this.clocks.autoAoE > 0) return

    const c = this._denseClusterCenter(false)
    if (fireLv > 0) {
      this.clocks.autoAoE = Math.max(1.8, fireRainInterval(fireLv) / this.hasteScale)
      this._spawnFireRainZone(c.x, c.y)
    } else if (iceLv > 0) {
      this.clocks.autoAoE = Math.max(1.8, iceBlizzardInterval(iceLv) / this.hasteScale)
      this._spawnBlizzardZone(c.x, c.y)
    } else if (poiLv > 0) {
      this.clocks.autoAoE = Math.max(1.6, poiSeedInterval(poiLv) / this.hasteScale)
      this._spawnPoisonSeedZone(c.x, c.y)
    }
  }

  _updateCantrips(dt) {
    const haste = Math.max(1, this.hasteScale)
    for (const cSchool of this.crossCantrips) {
      const def = CROSS_CANTRIPS[`cantrip_${cSchool}`]
      if (!def) continue
      this.cantripClocks[cSchool] = (this.cantripClocks[cSchool] ?? def.interval) - dt
      if (this.cantripClocks[cSchool] <= 0) {
        this.cantripClocks[cSchool] = Math.max(0.85, def.interval / haste)
        this._castCantrip(cSchool)
      }
    }
  }

  _updateDelayed(dt) {
    for (let i = this.delayed.length - 1; i >= 0; i--) {
      const d = this.delayed[i]
      d.timer -= dt
      if (d.timer <= 0) {
        this.delayed.splice(i, 1)
        d.fn?.()
      }
    }
  }

  _updateShots(dt) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]
      s.life -= dt
      if (s.life <= 0) {
        this.shots.splice(i, 1)
        continue
      }
      if (s.target?.active && s.homing) {
        const desired = Math.atan2(s.target.y - s.y, s.target.x - s.x)
        const spd = Math.hypot(s.vx, s.vy)
        const cur = Math.atan2(s.vy, s.vx)
        let diff = desired - cur
        while (diff > Math.PI) diff -= TAU
        while (diff < -Math.PI) diff += TAU
        const nextA = cur + Math.sign(diff) * Math.min(Math.abs(diff), s.homing * dt)
        s.vx = Math.cos(nextA) * spd
        s.vy = Math.sin(nextA) * spd
      }
      s.x += s.vx * dt
      s.y += s.vy * dt

      let remove = false
      for (const e of this.enemies) {
        if (!e?.active || e.hp <= 0 || s.hitSet?.has(e)) continue
        if (Math.hypot(e.x - s.x, e.y - s.y) > s.radius + (e.radius || 12)) continue

        if (s.kind === 'fireball' || s.kind === 'pyroblast' || s.kind === 'cantrip_fire') {
          this._onFireImpact(s, e)
          remove = true
          break
        }
        if (s.kind === 'frostbolt' || s.kind === 'ice_lance' || s.kind === 'shatter_shard' || s.kind === 'cantrip_ice') {
          s.hitSet?.add(e)
          this._onIceShotHit(s, e)
          s.pierceLeft = (s.pierceLeft ?? 0) - 1
          if (s.pierceLeft <= 0) {
            remove = true
            break
          }
        }
        if (s.kind === 'agony_bolt' || s.kind === 'cantrip_poison') {
          this._onPoisonShotHit(s, e)
          remove = true
          break
        }
      }
      if (remove) this.shots.splice(i, 1)
    }
  }

  _onFireImpact(s, directTarget) {
    const rad = s.splashR || 54
    const isCantrip = !!s.cantrip
    const isPyro = !!s.isPyroblast
    this.stats.fireExplosions = (this.stats.fireExplosions || 0) + 1
    this.pushEffect({
      kind: 'ring',
      x: s.x,
      y: s.y,
      r: 8,
      maxR: rad,
      color: isPyro ? '#ffd166' : '#ff8a48',
      life: isPyro ? 0.34 : 0.24,
      maxLife: isPyro ? 0.34 : 0.24,
      lineWidth: isPyro ? 4 : 2.8,
    })

    let pyroCrit = false
    for (const e of this.enemies) {
      if (!e?.active || e.hp <= 0) continue
      if (Math.hypot(e.x - s.x, e.y - s.y) > rad + (e.radius || 0)) continue

      const remIgnite = isPyro && this.combustionIsUltimate && this.combustionTimer > 0
        ? Math.min(s.damage * 2.5, Math.max(0, e.burnHits || 0) * (e._burnDmg || 0) * 0.55)
        : 0

      const res = this.damageEnemy(e, s.damage * (e === directTarget ? 1 : 0.85), {
        element: 'fire',
        cantrip: isCantrip,
        primaryOrMeteor: !isCantrip && !isPyro && e === directTarget,
        noHotStreak: isCantrip || isPyro || e !== directTarget,
        fromX: s.x,
        fromY: s.y,
      })
      if (res.crit) pyroCrit = true

      if (remIgnite > 0 && e.active && e.hp > 0) {
        this.damageEnemy(e, remIgnite, { element: 'fire', derived: true, noHotStreak: true })
      }
      if (e.active && e.hp > 0) {
        const hits = isCantrip ? 2 : isPyro ? 5 : 3 + this.rank('fire_ignite')
        const dotDmg = s.damage * (isCantrip ? 0.24 : isPyro ? 0.38 : 0.32)
        this.applyBurn(e, hits, dotDmg, { allowSpread: !isCantrip })
        if (isCantrip) {
          e.cantripFireCritTime = Math.max(e.cantripFireCritTime || 0, 3.0)
          e.cantripFireCritAmount = Math.max(e.cantripFireCritAmount || 0, 0.06)
        }
      }
    }

    if (isPyro && this._branch === 'fire_pyromancer') {
      this.spawnZone({
        kind: 'fire_scorch',
        school: 'fire',
        x: s.x,
        y: s.y,
        radius: 68 * this.rangeScale,
        life: 2.5,
        maxLife: 2.5,
        tick: 0.5,
        damage: this.schoolDamage('fire', 0.48),
      })
      if ((this.game?.elapsed || 0) - this.pyroLastCdrAt >= 1.2) {
        this.pyroLastCdrAt = this.game?.elapsed || 0
        this.reduceActiveCooldown(0.6)
      }
      const pyroLv = this.rank('fire_pyro_streak')
      if (pyroLv > 0 && pyroCrit && !s.refunded && Math.random() < firePyroRefundChance(pyroLv)) {
        this.hotStreak = Math.min(2, this.hotStreak + 1)
      }
    }
  }

  _onIceShotHit(s, e) {
    const isCantrip = !!s.cantrip
    const res = this.damageEnemy(e, s.damage, {
      element: 'water',
      cantrip: isCantrip,
      derived: s.kind === 'ice_lance' || s.kind === 'shatter_shard',
      fromX: s.x,
      fromY: s.y,
    })
    if (!e.active || e.hp <= 0) return

    if (isCantrip) {
      e.spellSlowTime = Math.max(e.spellSlowTime || 0, 2.5)
      e.spellSlowAmount = e.isBoss ? 0 : Math.max(e.spellSlowAmount || 0, 0.35)
      e.cantripIceVulnTime = Math.max(e.cantripIceVulnTime || 0, 3.0)
      e.cantripIceVulnAmount = Math.max(e.cantripIceVulnAmount || 0, 0.06)
      return
    }
    if (s.kind === 'frostbolt') {
      const canStack = !s.roundFrostSet?.has(e)
      s.roundFrostSet?.add(e)
      this.applyFrost(e, canStack ? 1 : 0)
    } else if (s.kind === 'ice_lance') {
      this.applyFrost(e, 0)
    }
    if (res.crit) {
      this.pushEffect({ kind: 'ring', x: e.x, y: e.y, r: 4, maxR: 26, color: '#cffafe', life: 0.18, maxLife: 0.18, lineWidth: 2 })
    }
  }

  _onPoisonShotHit(s, e) {
    const isCantrip = !!s.cantrip
    this.damageEnemy(e, s.damage, { element: 'poison', cantrip: isCantrip, fromX: s.x, fromY: s.y })
    if (!e.active || e.hp <= 0) return

    if (isCantrip) {
      this.applyPoison(e, 3, s.damage * 0.45)
      e.cantripVulnTime = Math.max(e.cantripVulnTime || 0, 3.5)
      e.cantripVulnAmount = Math.max(e.cantripVulnAmount || 0, 0.1)
      return
    }
    this.applyAgony(e, 1)
    if (this.rank('poi_contagion') > 0) {
      this.contagion.queueDelayedContagion(e, 0)
    }
  }

  _updateZones(dt) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i]
      z.life -= dt
      z.tick -= dt

      if (z.kind === 'fire_rain' && z.tick <= 0) {
        z.tick = 0.52
        const insideEnemies = this.enemies.filter(
          e => e?.active && e.hp > 0 && Math.hypot(e.x - z.x, e.y - z.y) <= z.radius + (e.radius || 0)
        )
        for (let m = 0; m < z.meteorCount; m++) {
          let mx
          let my
          if (m === 0 && insideEnemies.length > 0) {
            // Smart-lock first meteor of every wave onto an enemy inside Fire Rain so it doesn't whiff on air
            const chosen = insideEnemies[Math.floor(Math.random() * insideEnemies.length)]
            mx = chosen.x + (Math.random() - 0.5) * 28
            my = chosen.y + (Math.random() - 0.5) * 28
          } else {
            const ang = Math.random() * TAU
            const rad = Math.sqrt(Math.random()) * (z.radius * 0.72)
            mx = z.x + Math.cos(ang) * rad
            my = z.y + Math.sin(ang) * rad
          }
          const splash = 58 * this.rangeScale
          this.pushEffect({ kind: 'meteor_slam', x: mx, y: my, radius: splash, color: '#ff8248', life: 0.48, maxLife: 0.48, seed: Math.random() * TAU })
          let meteorCredit = false
          for (const e of this.enemies) {
            if (!e?.active || e.hp <= 0) continue
            if (Math.hypot(e.x - mx, e.y - my) <= splash + (e.radius || 0)) {
              const scorchLv = this.rank('fire_rain_scorch')
              const allowHotStreak = !meteorCredit
              meteorCredit = true
              this.damageEnemy(e, z.meteorDamage, {
                element: 'fire',
                autoSpell: true,
                primaryOrMeteor: allowHotStreak,
                noHotStreak: !allowHotStreak,
              })
              if (e.active && e.hp > 0) {
                this.applyBurn(e, scorchLv > 0 ? 4 : 2, z.meteorDamage * 0.28)
                if (scorchLv > 0) {
                  e.spellSlowTime = Math.max(e.spellSlowTime || 0, 0.75)
                  e.spellSlowAmount = e.isBoss ? 0 : Math.max(e.spellSlowAmount || 0, fireRainScorchSlow(scorchLv))
                }
              }
            }
          }
        }
      } else if (z.kind === 'fire_scorch' && z.tick <= 0) {
        z.tick = 0.45
        for (const e of this.enemies) {
          if (e?.active && e.hp > 0 && Math.hypot(e.x - z.x, e.y - z.y) <= z.radius + (e.radius || 0)) {
            this.damageEnemy(e, z.damage, { element: 'fire', derived: true, noHotStreak: true })
          }
        }
      } else if (z.kind === 'ice_blizzard' && z.tick <= 0) {
        const hailLv = this.rank('ice_storm_hail')
        z.tick = Math.max(0.45, 0.9 / (1 + iceStormHailHaste(hailLv)))
        const cdrLv = this.rank('ice_blizzard_cdr')
        const orbUp = this.summons.some(s => s.kind === 'frost_orb')
        const thresh = cdrLv > 0 ? Math.max(1, Math.floor(iceBlizzardCdrThreshold(cdrLv) / (orbUp ? 2 : 1))) : 0

        for (const e of this.enemies) {
          if (!e?.active || e.hp <= 0) continue
          if (Math.hypot(e.x - z.x, e.y - z.y) <= z.radius + (e.radius || 0)) {
            this.damageEnemy(e, z.tickDamage, { element: 'water', autoSpell: true, derived: true })
            if (e.active && e.hp > 0) {
              this.applyFrost(e, 1)
              e.spellSlowTime = Math.max(e.spellSlowTime || 0, 1.1)
              e.spellSlowAmount = e.isBoss ? 0 : Math.max(e.spellSlowAmount || 0, 0.48)
            }
            if (cdrLv > 0) {
              this.blizzardHitAccum++
              if (this.blizzardHitAccum >= thresh) {
                this.blizzardHitAccum = 0
                this.reduceActiveCooldown(0.25)
              }
            }
          }
        }
      } else if (z.kind === 'poison_seed' && z.tick <= 0) {
        z.tick = 0.65
        for (const e of this.enemies) {
          if (!e?.active || e.hp <= 0) continue
          if (Math.hypot(e.x - z.x, e.y - z.y) <= z.radius + (e.radius || 0)) {
            this.damageEnemy(e, z.tickDamage, { element: 'poison', autoSpell: true, derived: true })
            if (e.active && e.hp > 0) {
              this.applyPoison(e, 3, z.tickDamage * 0.72)
              if (this.rank('poi_contagion') > 0) this.contagion.queueDelayedContagion(e, 0)
            }
          }
        }
      } else if (z.kind === 'static_field' && z.tick <= 0) {
        z.tick = 0.45
        for (const e of this.enemies) {
          if (e?.active && e.hp > 0 && Math.hypot(e.x - z.x, e.y - z.y) <= z.radius + (e.radius || 0)) {
            if (!e.isBoss) {
              e.spellSlowTime = Math.max(e.spellSlowTime || 0, 0.65)
              e.spellSlowAmount = Math.max(e.spellSlowAmount || 0, z.slow || 0.25)
            }
            this.damageEnemy(e, z.damage, { element: 'lightning', derived: true })
          }
        }
      }

      if (z.life <= 0) {
        if (z.kind === 'ice_blizzard' && this.rank('ice_storm_hail') > 0) {
          this.pushEffect({ kind: 'ring', x: z.x, y: z.y, r: 10, maxR: z.radius, color: '#99e6ff', life: 0.3, maxLife: 0.3, lineWidth: 3 })
          for (const e of this.enemies) {
            if (e?.active && e.hp > 0 && Math.hypot(e.x - z.x, e.y - z.y) <= z.radius + (e.radius || 0)) {
              this.damageEnemy(e, z.tickDamage * 1.3, { element: 'water', derived: true })
            }
          }
        } else if (z.kind === 'poison_seed' && z.bloomsLeft > 0) {
          this._detonatePoisonSeed(z)
        }
        this.zones.splice(i, 1)
      }
    }
  }

  _updateSummons(dt) {
    this.totemCritBonus = 0
    this.totemHasteBonus = 0
    for (let i = this.summons.length - 1; i >= 0; i--) {
      const s = this.summons[i]
      s.life -= dt
      s.tick -= dt

      if (s.kind === 'infernal') {
        s.spawnT = Math.max(0, (s.spawnT || 0) - dt)
        s.slamT = Math.max(0, (s.slamT || 0) - dt)
        const nearest = this._nearestEnemy(s.x, s.y, 460)
        if (nearest) {
          const dx = nearest.x - s.x
          const dy = nearest.y - s.y
          const dist = Math.hypot(dx, dy)
          if (Math.abs(dx) > 4) s.facing = dx >= 0 ? 1 : -1
          if (dist > 34) {
            s.x += (dx / dist) * 86 * dt
            s.y += (dy / dist) * 86 * dt
            s.walkT = (s.walkT || 0) + dt * 6.8
          }
        }
        if (s.tick <= 0) {
          s.tick = 0.5
          let auraHits = 0
          for (const e of this.enemies) {
            if (e?.active && e.hp > 0 && Math.hypot(e.x - s.x, e.y - s.y) <= s.auraRadius + (e.radius || 0)) {
              auraHits++
              this.damageEnemy(e, s.auraDamage, { element: 'fire', derived: true, summonOwner: s })
              if (e.active && e.hp > 0) this.applyBurn(e, 2, s.auraDamage * 0.45, { allowSpread: false })
            }
          }
          if (auraHits > 0) s.slamT = 0.34
        }
        if (s.isAbyssalLord) {
          s.volleyTick -= dt
          if (s.volleyTick <= 0) {
            s.volleyTick = 1.25
            for (const t of this._nearestDistinct(s.x, s.y, 380, 3)) {
              const a = Math.atan2(t.y - s.y, t.x - s.x)
              this._spawnShot({
                kind: 'fireball',
                school: 'fire',
                x: s.x,
                y: s.y,
                vx: Math.cos(a) * 430,
                vy: Math.sin(a) * 430,
                target: t,
                homing: 7,
                radius: 8,
                splashR: 52 * this.rangeScale,
                damage: this.schoolDamage('fire', 0.9),
                life: 1.2,
              })
            }
          }
        }
        if (s.life <= 0 || s.hp <= 0) {
          const blast = (radiusMul = 1) => {
            const rad = s.martyrRadius * radiusMul
            this.pushEffect({ kind: 'meteor_slam', x: s.x, y: s.y, radius: rad, color: '#ff7043', life: 0.56, maxLife: 0.56, big: true })
            for (const e of this.enemies) {
              if (e?.active && e.hp > 0 && Math.hypot(e.x - s.x, e.y - s.y) <= rad + (e.radius || 0)) {
                this.damageEnemy(e, s.martyrDamage * radiusMul, { element: 'fire', active: true, derived: true })
                if (e.active && e.hp > 0) this.applyBurn(e, 4, s.martyrDamage * 0.25)
              }
            }
          }
          blast(1)
          if (s.isAbyssalLord) this.delay(0.22, () => blast(0.85))
          this.summons.splice(i, 1)
          continue
        }
      } else if (s.kind === 'frost_orb') {
        s.x += s.vx * dt
        s.y += s.vy * dt
        s.lanceTick -= dt
        if (s.tick <= 0) {
          s.tick = 0.28
          for (let k = 0; k < 6; k++) {
            const a = (k * TAU) / 6 + (this.game?.elapsed || 0) * 3.5
            this._spawnShot({
              kind: 'shatter_shard',
              school: 'ice',
              x: s.x,
              y: s.y,
              vx: Math.cos(a) * 400,
              vy: Math.sin(a) * 400,
              radius: 6,
              pierceLeft: 2,
              hitSet: new Set(),
              damage: s.shardDamage,
              life: 0.55,
            })
          }
        }
        if (s.lanceTick <= 0) {
          s.lanceTick = 0.85
          const target = this._nearestEnemy(s.x, s.y, 380)
          if (target) this._spawnIceLance(target, { twin: false })
        }
        if (s.life <= 0) this.summons.splice(i, 1)
      } else if (s.kind === 'storm_totem') {
        const p = this.player
        if (p && Math.hypot(p.x - s.x, p.y - s.y) <= s.radius) {
          this.totemCritBonus = Math.max(this.totemCritBonus, 0.35)
          this.totemHasteBonus = Math.max(this.totemHasteBonus, 0.15)
        }
        if (s.tick <= 0) {
          s.tick = 1.2
          const picked = this._nearestDistinct(s.x, s.y, 360 * this.rangeScale, 2)
          if (picked.length) {
            this.lightning.castThunderstormStrike({
              targetsOverride: picked,
              damageOverride: s.damage,
              overloaded: true,
              derived: true,
              noStaticField: true,
            })
          }
        }
        if (s.life <= 0) this.summons.splice(i, 1)
      } else if (s.kind === 'sky_core') {
        const p = this.player
        if (p) {
          s.x = p.x
          s.y = p.y - 26
        }
        if (s.tick <= 0) {
          s.tick = 1.0
          const picked = this._nearestDistinct(s.x, s.y, 460 * this.rangeScale, 4)
          if (picked.length) {
            this.lightning.castThunderstormStrike({
              targetsOverride: picked,
              damageOverride: s.damage,
              baseVuln: 0.14,
              overloaded: true,
              derived: true,
              noStaticField: true,
            })
          }
        }
        if (s.life <= 0) this.summons.splice(i, 1)
      } else if (s.kind === 'darkglare') {
        const p = this.player
        if (p) {
          const ang = (this.game?.elapsed || 0) * 2.2
          s.x = p.x + Math.cos(ang) * 32
          s.y = p.y + Math.sin(ang) * 32 - 8
        }
        if (s.tick <= 0) {
          s.tick = 1.0
          const heavy = [...this.enemies].filter(e => e?.active && e.hp > 0).sort((a, b) => b.hp - a.hp).slice(0, 3)
          for (const e of heavy) {
            const tickBase =
              (e.agonyTime > 0 ? e.agonyDmg * (0.45 + (e.agonyStacks || 1) * 0.25) : 0) +
              (e.poisonHits > 0 ? e._poisonDmg || 0 : 0) +
              (e.unsteadyTime > 0 ? e.unsteadyDmg || 0 : 0)
            const glareDmg = Math.max(this.schoolDamage('poison', 0.9), tickBase * 1.65)
            this.damageEnemy(e, glareDmg, { element: 'poison', derived: true, forceCrit: true })
            this.pushEffect({ kind: 'tether', x1: s.x, y1: s.y, x2: e.x, y2: e.y, color: '#d8b4fe', life: 0.26, maxLife: 0.26, width: 2.5 })
          }
        }
        if (s.life <= 0) this.summons.splice(i, 1)
      }
    }
  }

  _updateFields(dt) {
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const f = this.fields[i]
      f.life -= dt
      f.tick -= dt
      if (f.kind === 'arc_grid' && f.tick <= 0) {
        f.tick = 0.35
        for (let j = 0; j < f.points.length - 1; j++) {
          const a = f.points[j]
          const b = f.points[j + 1]
          const vx = b.x - a.x
          const vy = b.y - a.y
          const lenSq = vx * vx + vy * vy || 1
          for (const e of this.enemies) {
            if (!e?.active || e.hp <= 0) continue
            const t = Math.max(0, Math.min(1, ((e.x - a.x) * vx + (e.y - a.y) * vy) / lenSq))
            if (Math.hypot(e.x - (a.x + vx * t), e.y - (a.y + vy * t)) <= 20 + (e.radius || 12)) {
              this.damageEnemy(e, f.damage, { element: 'lightning', derived: true })
            }
          }
        }
      }
      if (f.life <= 0) this.fields.splice(i, 1)
    }
  }

  _updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i]
      fx.life -= dt
      if (fx.life <= 0) this.effects.splice(i, 1)
    }
  }

  // ==================== Hooks called by Enemy / EnemyManager / Player / WeaponSystem ====================

  lureTarget(enemy) {
    if (!this.enabled || !enemy || enemy.isBoss) return null
    for (const s of this.summons) {
      if (s.kind === 'infernal' && s.hp > 0 && Math.hypot(enemy.x - s.x, enemy.y - s.y) <= s.tauntRadius) {
        return s
      }
    }
    return null
  }

  hitSummon(summon, damage) {
    if (!summon || summon.hp <= 0) return false
    const taken = summon.kind === 'infernal' ? Math.min(1.5, Math.max(0.5, damage)) : Math.max(0.5, damage)
    summon.hp = Math.max(0, summon.hp - taken)
    return true
  }

  interceptBullet(b, fromX, fromY) {
    if (!this.enabled || !b?.active || b.isBoss) return false
    for (const s of this.summons) {
      if (s.kind !== 'infernal' || s.hp <= 0) continue
      const r = (s.radius || 20) + (b.radius || 6)
      if (Math.hypot(b.x - s.x, b.y - s.y) <= r || Math.hypot(fromX - s.x, fromY - s.y) <= r) {
        b.active = false
        const bulletLoss = Math.min(1.0, Math.max(0.5, (b.damage || 1) * 0.65))
        s.hp = Math.max(0, s.hp - bulletLoss)
        return true
      }
    }
    return false
  }

  bulletSpeedMultiplierAt(b) {
    if (!this.enabled || !b || b.isBoss) return 1
    for (const z of this.zones) {
      if (z.kind === 'ice_blizzard' && Math.hypot(b.x - z.x, b.y - z.y) <= z.radius) {
        return this._branch === 'ice_storm' ? 0.7 : 0.85
      }
    }
    return 1
  }

  onDoTTick(enemy, kind, dealt = 0) {
    if (!this.enabled || !enemy) return
    if (dealt > 0) {
      const statEl = kind === 'burn' ? 'fire' : 'poison'
      this.stats.damageByElement[statEl] = (this.stats.damageByElement[statEl] || 0) + dealt
    }
    if (this.school !== 'poison' || kind === 'burn') return

    if (dealt > 0) {
      this._feedPoisonSeedAccum(enemy, dealt)
    }
    this.shield.onPlagueProgress(0.06)
    const siphonLv = this.rank('poi_aff_siphon')
    if (siphonLv > 0 && Math.random() < poiAffSiphonChance(siphonLv)) {
      this.soulFragments++
      if (this.soulFragments >= 25 && this.siphonHealCd <= 0) {
        this.soulFragments -= 25
        this.siphonHealCd = 12.0
        const p = this.player
        if (p && p.hp < p.maxHp) {
          p.hp = Math.min(p.maxHp, p.hp + 1)
          this.game?.enemyManager?.addText?.(p.x, p.y - 22, '+1 ❤️', null, '#a8e46b', 14)
        } else if (this.shield.charges < this.shield.maxCharges) {
          this.shield.charges = Math.min(this.shield.maxCharges, this.shield.charges + 1)
          this.shield.flash = 0.25
        }
      }
    }
  }

  onEnemyKilled(enemy, { killer = null } = {}) {
    if (!this.enabled || !enemy || enemy._spellKillHandled) return
    enemy._spellKillHandled = true

    if (killer?.kind === 'infernal' && this.rank('fire_dest_immolate') > 0) {
      killer.kills = (killer.kills || 0) + 1
      if (killer.kills % 4 === 0) {
        killer.life = Math.min(killer.maxLife + 4.5, killer.life + 0.6)
      }
    }

    if (this.school === 'fire' && this.rank('fire_dest_cataclysm') > 0 && !enemy._killedByCataclysmMeteor) {
      if (this._isInsideZone(enemy, 'fire_rain') && Math.random() < 0.45) {
        const dmg = this.schoolDamage('fire', fireRainMeteorDamageMul(Math.max(1, this.rank('fire_rain'))) * 0.72)
        const rad = 54 * this.rangeScale
        this.pushEffect({ kind: 'meteor_slam', x: enemy.x, y: enemy.y, radius: rad, color: '#ff8a48', life: 0.22, maxLife: 0.22 })
        for (const e of this.enemies) {
          if (e?.active && e.hp > 0 && Math.hypot(e.x - enemy.x, e.y - enemy.y) <= rad + (e.radius || 0)) {
            this.damageEnemy(e, dmg, { element: 'fire', derived: true, killByCataclysm: true })
          }
        }
      }
    }

    if (this.school === 'ice' && this.rank('ice_frostbite') > 0 && ((enemy.freeze || 0) > 0 || (enemy.deepWinterTime || 0) > 0)) {
      const shardTargets = this._nearestDistinct(enemy.x, enemy.y, 260 * this.rangeScale, 4)
      for (let i = 0; i < 4; i++) {
        const tgt = shardTargets[i % Math.max(1, shardTargets.length)] || null
        const ang = tgt ? Math.atan2(tgt.y - enemy.y, tgt.x - enemy.x) : (i * TAU) / 4
        this._spawnShot({
          kind: 'shatter_shard',
          school: 'ice',
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(ang) * 430,
          vy: Math.sin(ang) * 430,
          target: tgt,
          homing: 7,
          radius: 6,
          pierceLeft: 1,
          hitSet: new Set(),
          damage: this.schoolDamage('ice', 0.52),
          life: 0.75,
        })
      }
    }

    if (this.school === 'poison' && this.contagion.isInfected(enemy)) {
      this.shield.onPlagueProgress(0.28)
      this.contagion.onEnemyKilled(enemy)

      const burstLv = this.rank('poi_pan_burst')
      if (this._branch === 'poi_pandemic' || burstLv > 0 || this.plagueFrenzyTimer > 0) {
        const isFrenzy = this.plagueFrenzyTimer > 0
        const rad = (isFrenzy ? 130 : burstLv > 0 ? poiPanBurstRadius(burstLv) : 80) * this.rangeScale
        const mul = isFrenzy ? Math.max(1.45, poiPanBurstDamageMul(burstLv)) : burstLv > 0 ? poiPanBurstDamageMul(burstLv) : 0.85
        const burstDmg = this.schoolDamage('poison', mul)
        this.pushEffect({ kind: 'ring', x: enemy.x, y: enemy.y, r: 8, maxR: rad, color: '#9ee86b', life: 0.26, maxLife: 0.26, lineWidth: 2.8 })
        for (const e of this.enemies) {
          if (e?.active && e.hp > 0 && Math.hypot(e.x - enemy.x, e.y - enemy.y) <= rad + (e.radius || 0)) {
            const res = this.damageEnemy(e, burstDmg, { element: 'poison', derived: true })
            if (burstLv > 0 && res.hit && (!e.active || e.hp <= 0)) {
              this.reduceActiveCooldown(0.12)
            }
          }
        }
      }
    }
  }

  // ==================== Rendering, HUD & Persistence ====================

  renderGround(ctx) {
    if (!this.enabled) return
    renderSpellGround(ctx, this)
  }

  render(ctx) {
    if (!this.enabled) return
    renderSpells(ctx, this)
  }

  hud() {
    if (!this.enabled) return null
    const schoolDef = ELEMENTAL_SCHOOLS[this.school] || null
    const branchDef = ELEMENTAL_BRANCHES[this._branch] || null
    const pal = branchDef ? spellPalette(null, schoolToElement(this.school)) : schoolDef ? schoolDef.palette : BASE_SPELL_PALETTES.fire
    return {
      school: this.school,
      schoolName: schoolDef?.name || '未选系',
      schoolShort: schoolDef?.short || '待定',
      schoolIcon: schoolDef?.icon || '✨',
      schoolColor: schoolDef?.color || '#9ad8ff',
      branch: this._branch,
      branchName: branchDef?.name || null,
      branchShort: branchDef?.short || null,
      branchColor: branchDef?.color || null,
      ultimate: this.branchUltimate,
      ultimateName: branchDef?.ultimate === this.branchUltimate ? branchDef.ultimateName : null,
      crossCantrips: [...this.crossCantrips],
      maxCantrips: MAX_CROSS_CANTRIPS,
      cantripNames: this.crossCantrips.map(c => CROSS_CANTRIPS[`cantrip_${c}`]?.name || c),
      scholarBonusPct: Math.round((this.scholarMul - 1) * 100),
      hotStreak: this.school === 'fire' ? this.hotStreak : 0,
      shieldCharges: this.shield.charges,
      shieldMaxCharges: this.shield.maxCharges,
      shieldTimer: this.shield.timer,
      shieldCooldown: this.shield.cooldown,
      shieldProgress: this.shield.progress,
      shieldName: this.shield.label,
      shieldColor: this.shield.color,
      route: this._branch,
      routeName: branchDef?.name || null,
      routeInvestment: elementalRouteInvestment(this.game, this._branch),
      normalChoices: this.normalChoices,
      routeReady: elementalRouteReady(this.game),
      buildNote: elementalBuildNote(this.game),
      elements: [...this.elements],
      palette: pal,
      activeName: this.activeName,
      choicesBeforeBranch: ELEMENTAL_BUILD_RULES.choicesBeforeBranch,
    }
  }

  migrateLegacyBuild() {
    if (!this.enabled) return
    if (!Array.isArray(this.crossCantrips)) this.crossCantrips = []
    if (!this.school && (this.elements?.size > 0 || (this.upgrades && Object.keys(this.upgrades).length > 0))) {
      const legacyEl = [...(this.elements || [])][0]
      if (legacyEl) this.chooseSchool(elementToSchool(legacyEl))
    } else if (this.school) {
      this.school = normalizeSpellSchool(this.school)
    }
    if (this.crossCantrips.length > MAX_CROSS_CANTRIPS) {
      this.crossCantrips = this.crossCantrips.slice(0, MAX_CROSS_CANTRIPS)
    }
    this.zones ||= []
    this.summons ||= []
    this.shots ||= []
    this.fields ||= []
    this.delayed ||= []
    this.effects ||= []
    this.marks ||= []
    this.jobs ||= []
    this._syncElements()
  }
}

export { ELEMENTAL_SKILL_BY_ID }
