import { shadowTargetAlive as alive, shadowLineClear, traceShadowPath, shadowCircleEntry } from './ShadowGeometry.js'
import { renderPet, renderPetShot, renderPetEffects, renderPetGround } from './PetVisuals.js'
import { PET_MAX_SQUAD_SIZE, PET_PARTNER_TYPES, PET_ROSTER_BY_ID, PET_TYPES, computeSquadSynergies } from './PetRoster.js'
import { PET_RALLY_BASE, getPetRally, petPowerBonus, petVitalityBonus, petHasteBonus } from './PetSkills.js'
import {
  SYMBIOSIS_ROUTES,
  SYMBIOSIS_RULES,
  getSymbiosisEndlessMultiplier,
  nextDraftUnlockHint,
  symbiosisDraftReady,
  symbiosisProgressReady,
  symbiosisRouteInvestment,
  symbiosisRouteReady,
} from './SymbiosisBuild.js'
import { petSupportStats, petSupportDescription } from './PetSupport.js'

const TAU = Math.PI * 2
const ranged = e => e.type === 'mage' || e.type === 'archer'
const FORMATION_SLOTS = [
  { angle: -0.32, distance: 56 },
  { angle: 2.2, distance: 72 },
  { angle: -2.2, distance: 72 },
  { angle: Math.PI, distance: 102 },
]

function pointToSegmentDistSq(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay
  const lenSq = abx * abx + aby * aby
  if (lenSq <= 0.0001) return (px - ax) ** 2 + (py - ay) ** 2
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq))
  const cx = ax + abx * t, cy = ay + aby * t
  return (px - cx) ** 2 + (py - cy) ** 2
}

/** 共生伙伴系统 v2：8 选 4 选秀小队 · 猎人本体战术技 · 三极路线协同 */
export class PetCombat {
  constructor(weapon) {
    this.weapon = weapon
    this.reset()
  }

  get game() { return this.weapon.game }
  get player() { return this.weapon.player }
  get fullRoster() { return this.game?.startingStrain === 'summoner' }
  get enabled() { return this.fullRoster || this.level('sym_sub_echo') > 0 }
  get available() { return this.enabled && !this.player.dead && !this.game.runFinished }
  level(id) { return this.game?.skillLevels?.[id] || 0 }

  get squadTypes() {
    const types = []
    if (this.fullRoster) types.push('guardian')
    const ordered = Array.isArray(this.rosterOrder) ? this.rosterOrder : []
    for (const type of ordered) {
      const def = PET_ROSTER_BY_ID[type]
      if (!def || def.starter || types.includes(type)) continue
      if (this.level(def.partnerSkillId) > 0 && types.length < PET_MAX_SQUAD_SIZE) types.push(type)
    }
    for (const [skillId, type] of Object.entries(PET_PARTNER_TYPES)) {
      if (types.length >= PET_MAX_SQUAD_SIZE) break
      if (!types.includes(type) && this.level(skillId) > 0) types.push(type)
    }
    return types
  }

  get rosterTypes() {
    const types = [...this.squadTypes]
    if (this.level('sym_sub_echo') > 0) types.push('echo')
    return types
  }

  get cap() { return this.rosterTypes.length }
  get squadCount() { return this.squadTypes.length }
  get synergies() { return this.fullRoster ? computeSquadSynergies(this.squadTypes) : computeSquadSynergies([]) }
  get soloCompensation() {
    if (!this.fullRoster) return 1
    const count = Math.max(1, Math.min(PET_MAX_SQUAD_SIZE, this.squadCount))
    return count < PET_MAX_SQUAD_SIZE ? 1 + 0.08 * (PET_MAX_SQUAD_SIZE - count) : 1
  }
  get fullSquadActive() { return this.fullRoster && this.squadCount >= PET_MAX_SQUAD_SIZE }
  get endlessMultiplier() { return getSymbiosisEndlessMultiplier(this.game?.skillLevels) }

  get recovery() {
    const reviveCut = this.route === 'beast' ? Math.min(3.2, this.routeBeastReviveLevel * 0.4) : 0
    return Math.max(
      2.5,
      8 - this.level('pet_recovery') - (this.player.genePetRecoveryBonus || 0) - this.synergies.recoveryCut - reviveCut
    )
  }

  typeScale(type) { return type === 'echo' ? 1 + 0.5 * (this.level('sym_sub_echo') - 1) : 1 }

  get damageScale() {
    const basePetBonus = petPowerBonus(this.level('pet_power'))
    const routeBeastBonus = this.route === 'beast' ? 0.1 : 0
    const legacyGeneMul = 1 + Math.min(0.2, Math.max(0, (this.player.genePetDamageMul || 1) - 1) * 0.55)
    return (
      (1 + basePetBonus + this.level('sym_sub_surge') * 0.4 + routeBeastBonus) *
      legacyGeneMul *
      (this.game.primarySpec === 'symbiosis' ? 1.1 : 1)
    )
  }

  get rallyStats() {
    const stats = getPetRally(this.level('pet_command'))
    const cdMul = this.synergies.activeCdMul * (this.fullSquadActive ? 0.9 : 1) *
      (1 - (this.game?.bossTomes?.rank('pet_command') === 1 ? 0.08 : this.game?.bossTomes?.rank('pet_command') >= 2 ? 0.15 : 0))
    stats.cooldown = Math.max(6.8, Number((stats.cooldown * cdMul).toFixed(2)))
    if (this.route === 'beast') {
      stats.duration += 0.5
      stats.damage += 0.1
      stats.haste += 0.12
      stats.move += 0.05
    } else if (this.route === 'bond') {
      stats.duration = Math.min(8.0, stats.duration + Math.min(2.0, this.routeBondSurgeLevel * 0.25))
      stats.haste = 0.3
      stats.move = 0.25
    } else if (this.route === 'ranger') {
      stats.cooldown = Math.max(6.8, Number((9.0 * cdMul).toFixed(2)))
    }
    return stats
  }

  get attackRate() {
    const syn = this.synergies
    const dewBonus = (this.dewBuffTimer > 0 ? 0.18 : 0) + (this.fountainZone ? 0.25 : 0)
    const fullBonus = this.fullSquadActive ? 0.12 : 0
    const frenzyBonus = this.route === 'beast' && this.routeBeastFrenzyLevel > 0
      ? this.beastFrenzyStacks * Math.min(0.06, 0.02 + this.routeBeastFrenzyLevel * 0.005)
      : 0
    const rallyBonus = this.rallyTime > 0 ? this.rallyStats.haste : 0
    const bondBonus = this.route === 'bond' && this.rallyTime > 0 ? 0.3 : 0
    return (1 + petHasteBonus(this.level('pet_haste')) + syn.hasteBonus + fullBonus + dewBonus + frenzyBonus) *
      (1 + Math.max(rallyBonus, bondBonus))
  }

  get moveScale() {
    const frenzyMove = this.route === 'beast' && this.routeBeastFrenzyLevel > 0 ? this.beastFrenzyStacks * 0.03 : 0
    return (this.rallyTime > 0 ? 1 + this.rallyStats.move : 1) * (1 + this.level('sym_sub_surge') * 0.15 + frenzyMove)
  }

  get playerMoveBonus() {
    if (!this.available) return 0
    return (this.brambleKillSpeedTimer > 0 ? 0.2 : 0) +
      (this.route === 'bond' && this.rallyTime > 0 ? 0.25 : 0) +
      (this.route === 'beast' && this.routeBeastFrenzyLevel > 0 ? this.beastFrenzyStacks * 0.02 : 0)
  }

  get playerDamageReduction() { return 0 }

  playerBodyDamageMultiplier() {
    if (!this.fullRoster) return 1
    const unity = 1 + (this.game?.bossTomes?.rank('pet_unity') === 1 ? 0.12 : this.game?.bossTomes?.rank('pet_unity') >= 2 ? 0.2 : 0)
    const alivePets = this.items.filter(p => p.hp > 0 && p.type !== 'echo').length
    let routeMul = 0.72
    if (this.route === 'beast') routeMul = 0.65
    else if (this.route === 'bond') routeMul = 1.0
    else if (this.route === 'ranger') {
      const powerFeedback = 0.5 * petPowerBonus(this.level('pet_power'))
      const perPet = 0.08 + Math.min(0.1, 0.03 + this.routeRangerSeedLevel * 0.01)
      const escort = this.rangerEscortTimer > 0 ? Math.min(0.45, 0.15 + this.routeRangerEscortLevel * 0.04) : 0
      routeMul = (1.05 + powerFeedback + alivePets * perPet) * (1 + escort)
    }
    return routeMul * unity * this.endlessMultiplier
  }

  playerAttackHasteBonus() {
    if (!this.available) return 0
    const syn = this.synergies
    let bonus = (this.fullSquadActive ? 0.12 : 0) + syn.hasteBonus
    if (this.dewBuffTimer > 0) bonus += 0.18
    if (this.fountainZone) {
      const d2 = (this.player.x - this.fountainZone.x) ** 2 + (this.player.y - this.fountainZone.y) ** 2
      if (d2 <= this.fountainZone.r * this.fountainZone.r) bonus += 0.25
    }
    if (this.route === 'bond' && this.rallyTime > 0) bonus += 0.3
    if (this.route === 'beast' && this.routeBeastFrenzyLevel > 0) {
      bonus += this.beastFrenzyStacks * Math.min(0.06, 0.02 + this.routeBeastFrenzyLevel * 0.005)
    }
    if (this.route === 'ranger') {
      bonus += 0.5 * petHasteBonus(this.level('pet_haste'))
      if (this.items.some(p => p.hp > 0 && p.type === 'hunter')) bonus += 0.15
      if (this.rangerUltimateTimer > 0) bonus += 0.25
    }
    return bonus
  }

  playerProjectileSpeedMul() {
    if (!this.available || this.route !== 'ranger') return 1
    return 1.25 + (this.items.some(p => p.hp > 0 && p.type === 'hunter') ? 0.25 : 0)
  }

  playerBonusPierces() {
    if (!this.available || this.route !== 'ranger') return 0
    return 1 + (this.items.some(p => p.hp > 0 && p.type === 'frost') ? 1 : 0)
  }

  playerCritBonus() {
    if (!this.available) return 0
    let bonus = this.synergies.critBonus
    if (this.route === 'ranger' || this.routeRangerSeedLevel > 0) {
      bonus += Math.min(0.22, 0.04 + this.routeRangerSeedLevel * 0.022)
    }
    if (this.game?.bossTomes?.rank('pet_unity') === 3 && this.rallyUnityBuffTimer > 0) bonus += 0.2
    return bonus
  }

  get activeSkill() {
    this._activeSkill ||= { use: () => this.rally() }
    const baseCd = this.rallyStats.cooldown
    if (this.route === 'beast') {
      return Object.assign(this._activeSkill, {
        id: this.routeUltimate === 'beast' ? 'sym_beast_ultimate' : 'sym_beast_rally',
        name: this.routeUltimate === 'beast' ? '万兽天灾' : '狂野怒火',
        icon: '✦',
        cooldown: baseCd,
        getDesc: () => this.routeUltimate === 'beast'
          ? '全体伙伴红金狂暴，攻速/伤害大幅提升且特技冷却减半，并召唤至多 4 只灵能分影协同扑杀！'
          : '全体伙伴体型与战意暴涨，免疫常规减速，攻速/伤害狂飙并同步释放鼓舞爆发技！',
      })
    }
    if (this.route === 'ranger') {
      return Object.assign(this._activeSkill, {
        id: this.routeUltimate === 'ranger' ? 'sym_ranger_ultimate' : 'sym_ranger_rally',
        name: this.routeUltimate === 'ranger' ? '苍穹猎星' : '万灵汇聚炮',
        icon: '⌖',
        cooldown: baseCd,
        getDesc: () => this.routeUltimate === 'ranger'
          ? '伙伴聚拢护主并凝盾，本体轰出三轨全屏星轨炮（引爆全部赋能星爆），之后 2.5 秒射速 +25% 且必暴！'
          : '伙伴聚拢护主并凝盾，本体沿朝向轰出贯穿全屏的汇聚灵能重炮并触发全部在场伙伴武器赋能！',
      })
    }
    if (this.route === 'bond') {
      return Object.assign(this._activeSkill, {
        id: this.routeUltimate === 'bond' ? 'sym_bond_ultimate' : 'sym_bond_rally',
        name: this.routeUltimate === 'bond' ? '永恒星阵' : '共生协奏',
        icon: '✣',
        cooldown: baseCd,
        getDesc: () => this.routeUltimate === 'bond'
          ? '展开封闭星芒领域：灵链翻倍切割、粉碎边缘普通敌弹、每秒全向脉冲，伙伴期间锁血不倒且结束回血 35%！'
          : '加粗灵链翻倍切割并碎弹，本体与全队同步释放协奏震荡波，全队获联防护盾并大幅提速！',
      })
    }
    return Object.assign(this._activeSkill, {
      id: 'companion_hunt',
      name: '共生鼓舞',
      icon: '🐾',
      cooldown: baseCd,
      getDesc: () => {
        const r = this.rallyStats
        return `战吼震退近敌并同步全队伙伴爆发绝技，鼓舞 ${r.duration.toFixed(1)} 秒：攻击力 +${Math.round(r.damage * 100)}%、攻速 +${Math.round(r.haste * 100)}%、移速 +${Math.round(r.move * 100)}%`
      },
    })
  }

  reset({ preserveBuild = false } = {}) {
    const build = preserveBuild ? {
      route: this.route,
      routeUltimate: this.routeUltimate,
      normalChoices: this.normalChoices,
      draftChoices: this.draftChoices,
      bonusSlots: this.bonusSlots,
      pendingDraft: this.pendingDraft,
      rosterOrder: [...(this.rosterOrder || [])],
      starPets: new Set(this.starPets || []),
      tacticWeakenLevel: this.tacticWeakenLevel,
      tacticMisdirectLevel: this.tacticMisdirectLevel,
      tacticMendLevel: this.tacticMendLevel,
      endlessPactLevel: this.endlessPactLevel,
      routeBeastSeedLevel: this.routeBeastSeedLevel,
      routeBeastFrenzyLevel: this.routeBeastFrenzyLevel,
      routeBeastCleaveLevel: this.routeBeastCleaveLevel,
      routeBeastCurseLevel: this.routeBeastCurseLevel,
      routeBeastReviveLevel: this.routeBeastReviveLevel,
      routeRangerSeedLevel: this.routeRangerSeedLevel,
      routeRangerInfuseLevel: this.routeRangerInfuseLevel,
      routeRangerFocusLevel: this.routeRangerFocusLevel,
      routeRangerEscortLevel: this.routeRangerEscortLevel,
      routeRangerBarrageLevel: this.routeRangerBarrageLevel,
      routeBondSeedLevel: this.routeBondSeedLevel,
      routeBondChainLevel: this.routeBondChainLevel,
      routeBondVolleyLevel: this.routeBondVolleyLevel,
      routeBondAegisLevel: this.routeBondAegisLevel,
      routeBondSurgeLevel: this.routeBondSurgeLevel,
    } : null

    this.items = []
    this.shots = []
    this.sporeZones = []
    this.meteorDrops = []
    this.arcs = []
    this.beams = []
    this.monuments = []
    this.spiritEchoes = []
    this.frostPillars = []
    this.fountainZone = null
    this.rallyTime = 0
    this.rallyDuration = 0
    this.rallyOverloaded = false
    this.rallyFlash = 0
    this.rallyUnityBuffTimer = 0
    this.serial = 0

    this.route = build?.route || null
    this.routeUltimate = build?.routeUltimate || null
    this.normalChoices = build?.normalChoices || 0
    this.draftChoices = build?.draftChoices || 0
    this.bonusSlots = build?.bonusSlots || 0
    this.pendingDraft = build?.pendingDraft || 0
    this.rosterOrder = build?.rosterOrder || []
    this.starPets = build?.starPets || new Set()
    this.tacticWeakenLevel = build?.tacticWeakenLevel || 0
    this.tacticMisdirectLevel = build?.tacticMisdirectLevel || 0
    this.tacticMendLevel = build?.tacticMendLevel || 0
    this.endlessPactLevel = build?.endlessPactLevel || 0

    this.routeBeastSeedLevel = build?.routeBeastSeedLevel || 0
    this.routeBeastFrenzyLevel = build?.routeBeastFrenzyLevel || 0
    this.routeBeastCleaveLevel = build?.routeBeastCleaveLevel || 0
    this.routeBeastCurseLevel = build?.routeBeastCurseLevel || 0
    this.routeBeastReviveLevel = build?.routeBeastReviveLevel || 0

    this.routeRangerSeedLevel = build?.routeRangerSeedLevel || 0
    this.routeRangerInfuseLevel = build?.routeRangerInfuseLevel || 0
    this.routeRangerFocusLevel = build?.routeRangerFocusLevel || 0
    this.routeRangerEscortLevel = build?.routeRangerEscortLevel || 0
    this.routeRangerBarrageLevel = build?.routeRangerBarrageLevel || 0

    this.routeBondSeedLevel = build?.routeBondSeedLevel || 0
    this.routeBondChainLevel = build?.routeBondChainLevel || 0
    this.routeBondVolleyLevel = build?.routeBondVolleyLevel || 0
    this.routeBondAegisLevel = build?.routeBondAegisLevel || 0
    this.routeBondSurgeLevel = build?.routeBondSurgeLevel || 0

    this.playerShield = 0
    this.playerShieldTimer = 0
    this.shieldGrantIcd = 0
    this.dewBuffTimer = 0
    this.weakenTimer = 1.5
    this.weakenShieldIcd = 0
    this.misdirectTimer = 2.0
    this.mendHits = 0
    this.mendCdIcd = 0
    this.rangerUltimateTimer = 0
    this.rangerEscortTimer = 0
    this.rangerEscortIcd = 0
    this.rangerFocusIcd = 0
    this.rangerRockShieldTimer = 2.5
    this.rangerInfuseIcd = { spark: 0, spore: 0, ember: 0, dew: 0, block: 0 }
    this.rangerBarrageCount = 0
    this.brambleKillSpeedTimer = 0
    this.beastFrenzyStacks = 0
    this.beastFrenzyTimer = 0
    this.beastCurseIcd = 0
    this.bondHits = 0
    this.bondSkillStacks = 0
    this.bondLinkTick = 0
    this.bondSurgePulseTimer = 0
    this.bondSurgeKills = 0
    this.bondSurgeExtended = 0
    this.bondAegisIcd = 0
    this.bondRetalIcd = 0
    this.bondVolleyIcd = 0
    this.starDomainTimer = 0
    this.markOrder = []
    this._brambleOrbitAngle = 0
  }

  registerPartner(type) {
    if (!type || !PET_ROSTER_BY_ID[type]) return false
    if (!Array.isArray(this.rosterOrder)) this.rosterOrder = []
    if (!this.rosterOrder.includes(type) && !PET_ROSTER_BY_ID[type].starter) {
      this.rosterOrder.push(type)
    }
    this.sync()
    return true
  }

  recomputeSkillLevels() {
    const lv = this.game?.skillLevels || {}
    this.tacticWeakenLevel = lv.sym_tactic_weaken || 0
    this.tacticMisdirectLevel = lv.sym_tactic_misdirect || 0
    this.tacticMendLevel = lv.sym_tactic_mend || 0
    this.endlessPactLevel = lv.sym_endless_pact || 0
    this.routeBeastSeedLevel = lv.sym_beast_seed || 0
    this.routeBeastFrenzyLevel = lv.sym_beast_frenzy || 0
    this.routeBeastCleaveLevel = lv.sym_beast_cleave || 0
    this.routeBeastCurseLevel = lv.sym_beast_curse || 0
    this.routeBeastReviveLevel = lv.sym_beast_revive || 0
    this.routeRangerSeedLevel = lv.sym_ranger_seed || 0
    this.routeRangerInfuseLevel = lv.sym_ranger_infuse || 0
    this.routeRangerFocusLevel = lv.sym_ranger_focus || 0
    this.routeRangerEscortLevel = lv.sym_ranger_escort || 0
    this.routeRangerBarrageLevel = lv.sym_ranger_barrage || 0
    this.routeBondSeedLevel = lv.sym_bond_seed || 0
    this.routeBondChainLevel = lv.sym_bond_chain || 0
    this.routeBondVolleyLevel = lv.sym_bond_volley || 0
    this.routeBondAegisLevel = lv.sym_bond_aegis || 0
    this.routeBondSurgeLevel = lv.sym_bond_surge || 0
    if (lv.sym_beast_ultimate) this.routeUltimate = 'beast'
    else if (lv.sym_ranger_ultimate) this.routeUltimate = 'ranger'
    else if (lv.sym_bond_ultimate) this.routeUltimate = 'bond'
  }

  migrateLegacyBuild() {
    const lv = this.game?.skillLevels
    if (!lv) return
    const routeMap = { hunt: 'beast', spore: 'bond', guard: 'bond' }
    if (routeMap[this.route]) this.route = routeMap[this.route]
    if (routeMap[this.routeUltimate]) this.routeUltimate = routeMap[this.routeUltimate]
    const skillMap = {
      sym_hunt_link: 'sym_beast_seed',
      sym_hunt_mark: 'sym_beast_frenzy',
      sym_hunt_chain: 'sym_beast_cleave',
      sym_hunt_ultimate: 'sym_beast_ultimate',
      sym_spore_link: 'sym_bond_seed',
      sym_spore_field: 'sym_bond_chain',
      sym_spore_bloom: 'sym_bond_volley',
      sym_spore_ultimate: 'sym_bond_ultimate',
      sym_guard_link: 'sym_bond_seed',
      sym_guard_aegis: 'sym_bond_aegis',
      sym_guard_pulse: 'sym_bond_surge',
      sym_guard_ultimate: 'sym_bond_ultimate',
      pet_bulwark: 'pet_awake_guardian',
      pet_taunt: 'pet_awake_guardian',
      pet_volley: 'pet_awake_hunter',
      pet_wind_guard: 'pet_awake_hunter',
      pet_dew_spring: 'pet_awake_dew',
      pet_spore_bloom: 'pet_awake_spore',
      pet_capstone: 'sym_tactic_weaken',
    }
    for (const [oldId, newId] of Object.entries(skillMap)) {
      if (lv[oldId] > 0) {
        const cap = newId.startsWith('pet_awake_') ? 1 : 8
        lv[newId] = Math.min(cap, Math.max(lv[newId] || 0, lv[oldId]))
        delete lv[oldId]
      }
    }
    if (!(this.starPets instanceof Set)) this.starPets = new Set(Array.isArray(this.starPets) ? this.starPets : [])
    this.recomputeSkillLevels()
    this.sync()
  }

  get routeInfo() { return SYMBIOSIS_ROUTES[this.route] || null }

  chooseRoute(route) {
    if (!this.fullRoster || !SYMBIOSIS_ROUTES[route] || !symbiosisRouteReady(this.game) ||
        !(this.game.skillLevels?.[SYMBIOSIS_ROUTES[route].seed] > 0)) return false
    this.route = route
    this.weapon._weaponPulse = 0.7
    if (route === 'bond') this.grantPlayerShield(1, 5, { bypassIcd: true })
    return true
  }

  hudBuild() {
    const route = this.routeInfo
    const syn = this.synergies
    const squad = this.squadCount
    return {
      route: this.route,
      name: route?.name || '共生探索',
      roleBadge: route?.roleBadge || '8 选 4 选秀小队',
      icon: route?.icon || '🐾',
      color: route?.color || '#edc479',
      investment: route ? symbiosisRouteInvestment(this.game, this.route) : 0,
      normalChoices: this.normalChoices,
      draftChoices: this.draftChoices,
      squadCount: squad,
      nextDraftHint: nextDraftUnlockHint(this.game),
      synergies: syn.active.map(s => s.name),
      playerShield: Math.ceil(this.playerShield),
      routeReady: symbiosisRouteReady(this.game),
      draftReady: symbiosisDraftReady(this.game),
      progressReady: symbiosisProgressReady(this.game),
      ultimate: !!(route && this.game.skillLevels?.[route.ultimate]),
      ultimateName: route?.ultimateName || '',
      ultimateReady: !!(route && this.game.player?.level >= SYMBIOSIS_RULES.ultimateLevel && symbiosisProgressReady(this.game, true)),
      note: route
        ? `${route.name}（${route.roleBadge}）· ${route.ultimateName}为互斥终极`
        : `8 选 4 选秀（${nextDraftUnlockHint(this.game)}）· 选卡满 ${SYMBIOSIS_RULES.choicesBeforeRoute} 次且第 ${SYMBIOSIS_RULES.routeWave} 波／远征第 ${SYMBIOSIS_RULES.routeStage} 章确认路线`,
    }
  }

  formationPoint(type) {
    const idx = Math.max(0, this.rosterTypes.indexOf(type))
    const slot = FORMATION_SLOTS[idx % FORMATION_SLOTS.length]
    const dist = type === 'echo' ? 66 : slot.distance
    const angle = type === 'echo' ? -0.65 : slot.angle
    return traceShadowPath(this.game, this.player, this.player.facing + angle, dist, 17)
  }

  petMaxHp(type) {
    const base = PET_TYPES[type] || PET_TYPES.guardian
    const vit = petVitalityBonus(this.level('pet_vitality'))
    const beastPct = this.route === 'beast' && this.routeBeastReviveLevel > 0
      ? Math.min(0.55, 0.15 + this.routeBeastReviveLevel * 0.05) : 0
    const tomePct = 0.12 * (this.game?.bossTomes?.rank('pet_roster') || 0)
    const starScale = this.starPets.has(type) ? 1.35 : 1
    return Math.max(1, Math.round((base.hp + vit + (this.player.genePetHpBonus || 0)) * this.typeScale(type) * (1 + beastPct + tomePct) * starScale))
  }

  sync() {
    if (!this.available) { this.reset(); return }
    const types = this.rosterTypes
    if (this.items.some(pet => !types.includes(pet.type))) {
      this.items = this.items.filter(pet => types.includes(pet.type))
      this.shots = this.shots.filter(shot => types.includes(shot.type))
    }
    for (const type of types) {
      let pet = this.items.find(p => p.type === type)
      const maxHp = this.petMaxHp(type)
      if (!pet) {
        const end = this.formationPoint(type)
        const def = PET_TYPES[type] || PET_TYPES.guardian
        pet = {
          ...end,
          id: ++this.serial,
          type,
          name: def.name,
          radius: 17,
          isPet: true,
          hp: maxHp,
          maxHp,
          shield: 0,
          shieldTimer: 0,
          down: 0,
          hurt: 0,
          idle: 0,
          cooldown: 0,
          attack: null,
          target: null,
          retarget: 0,
          flash: 0,
          angle: 0,
          attackFx: 0,
          attackBoosted: false,
          shotCount: 0,
          healCharge: 0,
          rollDash: null,
          spinTimer: 0,
          spinTick: 0,
          orbitTimer: 0,
          orbitTick: 0,
          orbitAngle: 0,
          claims: new Set(),
          support: null,
          supportCd: 0,
          supportFx: 0,
          supportActive: 0,
          taunted: new Set(),
          supportTargets: [],
          specialLines: [],
          cleaveIcd: 0,
          bondIcd: 0,
          star: this.starPets.has(type),
        }
        this.items.push(pet)
      } else {
        pet.star = this.starPets.has(type)
        if (maxHp > pet.maxHp) {
          if (pet.hp > 0) pet.hp += maxHp - pet.maxHp
          pet.maxHp = maxHp
        }
      }
    }
  }

  hud() {
    this.sync()
    const syn = this.synergies
    return this.items.map(p => {
      const def = PET_TYPES[p.type] || PET_TYPES.guardian
      const stats = this.supportStats(p)
      return {
        id: p.type,
        name: p.name,
        role: def.roleLabel,
        roleKey: def.role,
        color: def.color,
        star: this.starPets.has(p.type),
        hp: Math.ceil(p.hp),
        maxHp: p.maxHp,
        shield: Math.ceil(p.shield || 0),
        supportName: stats.name,
        supportCd: p.supportCd,
        supportActive: p.supportActive,
        supporting: !!p.support,
        supportDesc: petSupportDescription(stats),
        down: p.down,
        boosted: p.down <= 0 && this.rallyTime > 0,
        synergies: syn.active.map(s => s.name),
        state: p.down > 0 ? '恢复中' : this.rallyTime > 0 ? this.activeSkill.name :
          p.type === 'dew' ? `甘露蓄能 ${p.healCharge}/${this.level('pet_awake_dew') ? 3 : 4}` : '作战中',
      }
    })
  }

  rallyHud() {
    return this.available && this.rallyTime > 0
      ? { ...this.rallyStats, name: this.activeSkill.name, remaining: this.rallyTime, duration: this.rallyDuration }
      : null
  }

  grantPlayerShield(amount = 1, duration = 4, opts = {}) {
    if (!opts.bypassIcd && this.shieldGrantIcd > 0) return false
    if (!opts.bypassIcd) this.shieldGrantIcd = 2.0
    const cap = this.route === 'bond' ? 2 : 1
    this.playerShield = Math.min(cap, (this.playerShield || 0) + amount)
    this.playerShieldTimer = Math.max(this.playerShieldTimer || 0, duration)
    this.weapon._ring?.(this.player.x, this.player.y, '#edc479', this.player.radius + 16)
    return true
  }

  absorb(damage, attack) {
    if (!this.available || !(attack?.enemyAttack || attack?.zoneBurn) || this.playerShield <= 0 || damage <= 0) return damage
    const absorbed = Math.min(this.playerShield, damage)
    this.playerShield = Math.max(0, this.playerShield - absorbed)
    if (this.playerShield <= 0) this.playerShieldTimer = 0
    this.weapon._ring?.(this.player.x, this.player.y, '#edc479', this.player.radius + 16)
    this.game.enemyManager?.addText?.(this.player.x, this.player.y - 34, '灵盾抵挡', null, '#ffe4a1', 13)
    this.game.sound?.originWard?.()
    this.onPlayerShieldTriggered()
    return damage - absorbed
  }

  onPlayerShieldTriggered() {
    if (this.game?.bossTomes?.rank('pet_vitality') === 3) {
      this._tomeVitalityPulse()
    }
    if (this.route === 'ranger' && this.routeRangerEscortLevel > 0) {
      this._triggerRangerEscort()
    }
    if (this.route === 'bond' && this.routeBondAegisLevel > 0 && this.bondAegisIcd <= 0) {
      this.bondAegisIcd = 1.2
      this._bondRetaliate(this.player)
      this.player.strainSkillCd = Math.max(0, (this.player.strainSkillCd || 0) - 0.5)
    }
  }

  _tomeVitalityPulse() {
    const damage = this.weapon.damage * this.weapon.levelMul * 1.5
    for (const enemy of this.weapon.enemyManager.enemies) {
      if (!alive(enemy) || Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) > 160) continue
      const before = enemy.hp
      enemy.hit(damage)
      if (enemy.hp < before) this._recordDamage(Math.min(before, before - enemy.hp))
      if (!enemy.isBoss) {
        const a = Math.atan2(enemy.y - this.player.y, enemy.x - this.player.x)
        const end = traceShadowPath(this.game, enemy, a, 24, enemy.radius || 14)
        enemy.x = end.x; enemy.y = end.y
      }
      if (!enemy.active) { enemy._petDerivedKill = true; this.weapon._onKill(enemy) }
    }
    this.weapon._ring?.(this.player.x, this.player.y, '#edc479', 160)
  }

  hit(pet, damage, attacker = null) {
    if (!this.available || pet.hp <= 0 || damage <= 0 || pet.hurt > 0) return false
    const guardianAwake = pet.type === 'guardian' && this.level('pet_awake_guardian') > 0
    const armor = (guardianAwake ? 0.7 : 1) * ((pet.tomeReviveUntil || 0) > this.game.elapsed ? 0.75 : 1)
    let actual = damage * armor
    if (pet.shield > 0) {
      const blocked = Math.min(pet.shield, actual)
      pet.shield = Math.max(0, pet.shield - blocked)
      actual -= blocked
    }
    if (actual > 0) pet.hp = Math.max(0, pet.hp - actual)
    // 永恒星阵终极：协奏期间伙伴锁血 1 点不倒
    if (this.routeUltimate === 'bond' && this.rallyTime > 0 && pet.hp <= 0) {
      pet.hp = 1
    }
    pet.hurt = 0.35; pet.idle = 0; pet.flash = 0.18
    if (this.route === 'bond' && this.routeBondAegisLevel > 0 && this.bondAegisIcd <= 0 && attacker) {
      this.bondAegisIcd = 1.2
      this._bondRetaliate(pet)
      this.player.strainSkillCd = Math.max(0, (this.player.strainSkillCd || 0) - 0.5)
    }
    if (pet.hp <= 0) {
      pet.down = this.recovery
      pet.attack = null; pet.attackFx = 0; pet.target = null; pet.rollDash = null; pet.spinTimer = 0; pet.orbitTimer = 0
      pet.support = null; pet.supportActive = 0; pet.supportFx = 0; pet.taunted.clear(); pet.supportTargets = []
      if (guardianAwake) {
        this.monuments.push({
          x: pet.x, y: pet.y, life: 3, maxLife: 3,
          radius: 18, lureRadius: 190 * this.synergies.aoeMul, isMonument: true,
        })
        if (this.monuments.length > 2) this.monuments.shift()
      }
      if (this.route === 'beast' && this.routeBeastReviveLevel > 0) {
        this._beastDownBurst(pet)
      }
      this.game.enemyManager?.addText?.(pet.x, pet.y - 26, `${pet.name} · 暂歇`, null, PET_TYPES[pet.type]?.color || '#edc479', 12)
    }
    return true
  }

  _beastDownBurst(pet) {
    const mul = Math.min(2.8, 1.4 + this.routeBeastReviveLevel * 0.18)
    const dmg = this.attackDamage(pet) * mul
    const radius = 120 * this.synergies.aoeMul
    for (const enemy of this.weapon.enemyManager.enemies) {
      if (!alive(enemy) || Math.hypot(enemy.x - pet.x, enemy.y - pet.y) > radius) continue
      const before = enemy.hp
      enemy.hit(dmg)
      if (enemy.hp < before) this._recordDamage(Math.min(before, before - enemy.hp))
      if (!enemy.active) { enemy._petDerivedKill = true; this.weapon._onKill(enemy) }
    }
    this.weapon._ring?.(pet.x, pet.y, '#ff8c5a', radius)
    this.weapon._burstColor?.(pet.x, pet.y, '#ff8c5a', 10, true)
  }

  _bondRetaliate(source) {
    const mul = Math.min(2.18, 0.9 + this.routeBondAegisLevel * 0.16)
    const dmg = this.weapon.damage * this.weapon.levelMul * mul * this.endlessMultiplier
    const radius = 135 * this.synergies.aoeMul
    const emitters = source === this.player ? [this.player] : [source, this.player]
    for (const emitter of emitters) {
      for (const enemy of this.weapon.enemyManager.enemies) {
        if (!alive(enemy) || Math.hypot(enemy.x - emitter.x, enemy.y - emitter.y) > radius) continue
        const before = enemy.hp
        enemy.hit(dmg)
        if (enemy.hp < before) this._recordDamage(Math.min(before, before - enemy.hp))
        if (!enemy.active) { enemy._petDerivedKill = true; this.weapon._onKill(enemy) }
      }
      this.weapon._ring?.(emitter.x, emitter.y, '#c3a4dc', radius)
    }
  }

  lureTarget(enemy) {
    if (!this.available || !enemy || enemy.isBoss) return null
    if (enemy.petTauntTime > 0 && enemy.petTauntTarget && (enemy.petTauntTarget.hp > 0 || enemy.petTauntTarget.life > 0)) {
      if (shadowLineClear(this.game, enemy.petTauntTarget, enemy)) return enemy.petTauntTarget
    }
    for (const mon of this.monuments) {
      if (mon.life > 0 && Math.hypot(mon.x - enemy.x, mon.y - enemy.y) <= (mon.lureRadius || 190) && shadowLineClear(this.game, mon, enemy)) {
        return mon
      }
    }
    const taunter = this.items.find(p => (p.type === 'guardian' || p.type === 'echo') && p.hp > 0)
    if (taunter?.supportActive > 0 && taunter.taunted.has(enemy) && shadowLineClear(this.game, taunter, enemy)) return taunter
    if (!taunter || Math.hypot(taunter.x - enemy.x, taunter.y - enemy.y) > 185 || !shadowLineClear(this.game, taunter, enemy)) return null
    if (!taunter.claims.has(enemy) && taunter.claims.size >= 4) return null
    taunter.claims.add(enemy)
    return taunter
  }

  isTaunted(enemy) {
    if (!this.available || !alive(enemy) || enemy.isBoss) return false
    if (enemy.petTauntTime > 0 && enemy.petTauntTarget && (enemy.petTauntTarget.hp > 0 || enemy.petTauntTarget.life > 0)) return true
    const taunter = this.items.find(p => (p.type === 'guardian' || p.type === 'echo') && p.hp > 0)
    return !!(taunter && taunter.supportActive > 0 && taunter.taunted.has(enemy))
  }

  supportStats(pet) {
    const escortCut = this.route === 'ranger'
      ? Math.max(0.45, 0.75 - Math.min(0.3, this.routeRangerEscortLevel * 0.03))
      : 1
    const beastUltimateCut = this.routeUltimate === 'beast' && this.rallyTime > 0 ? 0.5 : 1
    const tomeCut = 1 - (this.game?.bossTomes?.rank('pet_command') === 1 ? 0.1 : this.game?.bossTomes?.rank('pet_command') >= 2 ? 0.18 : 0)
    const radiusMul = (this.route === 'ranger' ? 1.25 : 1) * (['dew', 'spore', 'frost'].includes(pet.type) ? this.synergies.zoneMul : this.synergies.aoeMul)
    return petSupportStats(pet.type, this.game.skillLevels, {
      cdMul: escortCut * beastUltimateCut * tomeCut,
      radiusMul,
      star: this.starPets.has(pet.type),
    })
  }

  supportEnemies(pet, center = pet, radius = null, limit = null) {
    const stats = this.supportStats(pet)
    const r = radius ?? stats.radius
    const maxCount = limit ?? stats.limit
    return this.weapon.enemyManager.enemies.filter(enemy => alive(enemy) &&
      !this.game.mapFeatures?.getEnemyTarget?.(enemy)?.isMapObjective &&
      Math.hypot(enemy.x - center.x, enemy.y - center.y) <= r &&
      shadowLineClear(this.game, center, enemy))
      .sort((a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y))
      .slice(0, maxCount)
  }

  injuredAlly() {
    if (this.player.hp < this.player.maxHp) return this.player
    return this.items.filter(ally => ally.hp > 0 && ally.hp < ally.maxHp)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]
  }

  beginSupport(pet) {
    if (!this.available || pet.hp <= 0 || pet.support || pet.supportCd > 0 || pet.down > 0) return false
    const stats = this.supportStats(pet)
    if (pet.type === 'dew') {
      const hasBullet = (this.game.enemyManager?._bullets || []).some(b =>
        b.active && !b.isBoss && Math.hypot(b.x - this.player.x, b.y - this.player.y) <= stats.radius
      )
      const hasEnemy = this.supportEnemies(pet, this.player, stats.radius, 1).length > 0
      if (!this.injuredAlly() && !hasBullet && !hasEnemy) return false
    } else if (pet.type === 'spark') {
      if (!this.supportEnemies(pet, this.player, 340, 1).length && !this.supportEnemies(pet, pet, 340, 1).length) return false
    } else if (pet.type === 'frost') {
      if (!this.supportEnemies(pet, this.player, stats.radius, 1).length) return false
    } else if (pet.type === 'guardian' || pet.type === 'echo') {
      const candidates = this.supportEnemies(pet, pet, stats.radius, stats.limit).filter(e => !e.isBoss)
      if (!candidates.length) return false
    } else {
      if (!this.supportEnemies(pet).length) return false
    }
    pet.support = { kind: pet.type, time: stats.windup, maxTime: stats.windup }
    return true
  }

  finishSupport(pet) {
    if (!this.available || pet.hp <= 0 || pet.down > 0) return false
    const stats = this.supportStats(pet)
    const dmg = this.attackDamage(pet)
    let executed = false

    if (pet.type === 'echo') {
      const targets = this.supportEnemies(pet, pet, stats.radius, stats.limit).filter(e => !e.isBoss)
      if (!targets.length) return false
      pet.taunted = new Set(targets)
      pet.supportTargets = targets
      executed = true
    } else if (pet.type === 'guardian') {
      const targets = this.supportEnemies(pet, pet, 240, stats.limit).filter(e => !e.isBoss)
      if (!targets.length) return false
      const anchor = targets[0]
      const end = traceShadowPath(this.game, pet, Math.atan2(anchor.y - pet.y, anchor.x - pet.x), Math.min(130, Math.hypot(anchor.x - pet.x, anchor.y - pet.y)), 17)
      pet.x = end.x; pet.y = end.y
      const tauntTargets = this.supportEnemies(pet, pet, stats.radius, stats.limit).filter(e => !e.isBoss)
      pet.taunted = new Set(tauntTargets)
      for (const e of tauntTargets) { e.petTauntTarget = pet; e.petTauntTime = stats.duration }
      const waveTargets = this.supportEnemies(pet, pet, 125 * this.synergies.aoeMul, 8)
      for (const e of waveTargets) this.dealHit(pet, e, dmg * 1.4, true)
      pet.shield = Math.min(pet.maxHp, (pet.shield || 0) + 4 * this.synergies.shieldMul)
      pet.shieldTimer = 4
      this.grantPlayerShield(1, 4)
      pet.supportTargets = tauntTargets
      this.weapon._ring?.(pet.x, pet.y, '#edc479', 125 * this.synergies.aoeMul)
      executed = true
    } else if (pet.type === 'hunter') {
      const targets = this.supportEnemies(pet, pet, 320, 1)
      if (!targets.length) return false
      const aim = Math.atan2(targets[0].y - pet.y, targets[0].x - pet.x)
      const count = this.level('pet_awake_hunter') > 0 ? 7 : 5
      const step = 0.17
      for (let i = 0; i < count; i++) {
        const angle = aim + (i - (count - 1) / 2) * step
        this.launchShot(pet, null, dmg * 0.95, 0, {
          angle,
          pierces: 1 + (this.level('pet_awake_hunter') > 0 ? 1 : 0) + this.synergies.strikerExtraTarget,
        })
      }
      executed = true
    } else if (pet.type === 'dew') {
      const radius = stats.radius
      const healed = this.healOrShield(1, 4)
      let cleared = 0
      for (const b of this.game.enemyManager?._bullets || []) {
        if (!b.active || b.isBoss) continue
        if (Math.hypot(b.x - this.player.x, b.y - this.player.y) <= radius) {
          b.active = false
          cleared++
        }
      }
      const near = this.supportEnemies(pet, this.player, radius, 10)
      for (const e of near) {
        if (e.isBoss) continue
        const a = Math.atan2(e.y - this.player.y, e.x - this.player.x)
        const end = traceShadowPath(this.game, e, a, 45, e.radius || 14)
        e.x = end.x; e.y = end.y
      }
      if (this.level('pet_awake_dew') > 0 && cleared > 0) {
        this.dewBuffTimer = Math.max(this.dewBuffTimer, Math.min(5, 3 + Math.min(2, cleared * 0.4)))
        if (this.player.hp < this.player.maxHp) this.player.heal(Math.min(1, cleared * 0.25))
      }
      if (!healed && cleared === 0 && !near.length) return false
      this.weapon._ring?.(this.player.x, this.player.y, '#8fd7e8', radius)
      executed = true
    } else if (pet.type === 'spore') {
      const targets = this.supportEnemies(pet, pet, 300, 3)
      if (!targets.length) return false
      const radius = (95 + (this.level('pet_awake_spore') > 0 ? 25 : 0)) * this.synergies.zoneMul
      for (const t of targets) {
        this.meteorDrops.push({
          x: t.x, y: t.y, r: radius, delay: 0.5, damage: dmg * 1.25,
          kind: 'spore', color: '#c3a4dc', owner: pet, slow: 2.5, mist: true,
        })
      }
      if (this.meteorDrops.length > 24) this.meteorDrops.splice(0, this.meteorDrops.length - 24)
      executed = true
    } else if (pet.type === 'spark') {
      const hasTargets = this.supportEnemies(pet, this.player, 340, 1).length > 0 || this.supportEnemies(pet, pet, 340, 1).length > 0
      if (!hasTargets) return false
      pet.supportActive = stats.duration
      executed = true
    } else if (pet.type === 'ember') {
      const targets = this.supportEnemies(pet, this.player, 320, this.level('pet_awake_ember') > 0 ? 4 : 3)
      if (!targets.length) return false
      const radius = 105 * this.synergies.strikerBlastMul
      for (const t of targets) {
        this.meteorDrops.push({
          x: t.x, y: t.y, r: radius, delay: 0.35, damage: dmg * 1.35,
          kind: 'ember', color: '#ff8c5a', owner: pet, burn: 2,
        })
      }
      if (this.meteorDrops.length > 24) this.meteorDrops.splice(0, this.meteorDrops.length - 24)
      this.game.combatFeedback?.impact?.({ hits: 2, kills: 0, angle: pet.angle })
      executed = true
    } else if (pet.type === 'bramble') {
      if (!this.supportEnemies(pet, pet, 260, 1).length) return false
      pet.spinTimer = stats.duration
      pet.spinTick = 0
      executed = true
    } else if (pet.type === 'frost') {
      const targets = this.supportEnemies(pet, this.player, stats.radius, stats.limit)
      if (!targets.length) return false
      for (const enemy of targets) {
        this.dealHit(pet, enemy, dmg * 1.1, true)
        if (alive(enemy)) {
          if (!enemy.isBoss && !enemy.isEnraged) {
            enemy.freeze = Math.max(enemy.freeze || 0, 1.5)
            enemy.petFrostTime = Math.max(enemy.petFrostTime || 0, 2.5)
          } else {
            enemy.petSlowTime = Math.max(enemy.petSlowTime || 0, 2)
            enemy.petSlowAmount = Math.max(enemy.petSlowAmount || 0, 0.35)
          }
        }
      }
      this.weapon._ring?.(this.player.x, this.player.y, '#9ad9ff', stats.radius)
      executed = true
    }

    if (!executed) return false
    pet.supportCd = stats.cooldown
    pet.supportActive = Math.max(pet.supportActive || 0, stats.duration)
    pet.supportFx = 0.55
    if (this.route === 'bond') {
      this.bondSkillStacks++
      if (this.bondSkillStacks >= 3) {
        this.bondSkillStacks = 0
        this.grantPlayerShield(1, 6)
      }
    }
    if (this.route === 'ranger' && this.routeRangerEscortLevel > 0) {
      this._triggerRangerEscort()
    }
    const color = PET_TYPES[pet.type]?.color || '#edc479'
    this.weapon._ring?.(pet.x, pet.y, color, 55)
    this.weapon._burstColor?.(pet.x, pet.y, color, 7, false)
    this.game.enemyManager?.addText?.(pet.x, pet.y - 40, stats.name, null, color, 12)
    this.game.sound?.hit?.('spark')
    return true
  }

  _triggerRangerEscort() {
    if (this.rangerEscortIcd > 0) return
    this.rangerEscortIcd = 1.5
    this.rangerEscortTimer = 2.5
    this.player.strainSkillCd = Math.max(0, (this.player.strainSkillCd || 0) - 0.4)
  }

  intercept(bullet, ax, ay) {
    if (!this.available || bullet.isBoss) return false
    let contact = shadowCircleEntry(ax, ay, bullet.x, bullet.y, this.player, bullet.radius)
    let blocker = null
    const extraPad = this.route === 'ranger' ? 7 : 0
    for (const p of this.items) {
      if (p.hp <= 0) continue
      const t = shadowCircleEntry(ax, ay, bullet.x, bullet.y, p, bullet.radius + extraPad)
      if (t < contact) { blocker = p; contact = t }
    }
    if (!blocker) return false
    this.hit(blocker, bullet.damage)
    bullet.active = false
    if (this.route === 'ranger' && this.routeRangerEscortLevel > 0) this._triggerRangerEscort()
    return true
  }

  nearest(pet, point = pet, radius = 440, preferRanged = pet.type === 'hunter') {
    let best = null, score = Infinity
    for (const e of this.weapon.enemyManager.enemies) {
      if (!alive(e) || Math.hypot(e.x - point.x, e.y - point.y) > radius ||
          Math.hypot(e.x - this.player.x, e.y - this.player.y) > 620) continue
      const markPriority = e.petMarkTime > 0 ? 320 : 0
      const d = Math.hypot(e.x - pet.x, e.y - pet.y) - (preferRanged && ranged(e) && !e.isBoss ? 450 : 0) - markPriority
      if (d < score && shadowLineClear(this.game, pet, e)) { best = e; score = d }
    }
    return best
  }

  rally() {
    this.sync()
    const alivePets = this.items.filter(p => p.hp > 0)
    if (!alivePets.length && this.route !== 'ranger') return false
    if (this.rallyTime > 0 && this.route !== 'ranger') return false
    const stats = this.rallyStats
    this.rallyOverloaded = false
    this.rallyTime = this.rallyDuration = stats.duration
    this.rallyFlash = 0.55
    this.rallyUnityBuffTimer = this.game?.bossTomes?.rank('pet_unity') === 3 ? 4 : 0
    this.bondSurgeKills = 0
    this.bondSurgeExtended = 0
    this.bondSurgePulseTimer = 1.5
    this.starDomainTimer = 0.25

    this.game?.bossTomes?.onRally?.(alivePets)
    if (this.game?.bossTomes?.rank('pet_vitality') === 3) {
      this._tomeVitalityPulse()
    }
    if (this.game?.bossTomes?.rank('pet_command') === 3) {
      for (const pet of alivePets) pet.supportCd = Math.max(0, pet.supportCd - 1)
    }

    for (const pet of alivePets) {
      pet.cooldown /= 1 + this.attackRate * 0.25
      if (pet.attack) {
        pet.attack.time /= 1 + stats.haste
        pet.attack.maxTime /= 1 + stats.haste
      }
      this.weapon._ring?.(pet.x, pet.y, PET_TYPES[pet.type]?.color || '#edc479', 34)
      this.weapon._burstColor?.(pet.x, pet.y, '#ffe4a1', 5, false)
    }

    let totalHits = 0, totalKills = 0
    const rallyRadius = 150 * this.synergies.aoeMul
    const shoutDmg = this.weapon.damage * this.weapon.levelMul * 1.2 * this.endlessMultiplier
    for (const enemy of this.weapon.enemyManager.enemies) {
      if (!alive(enemy) || Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) > rallyRadius) continue
      const before = enemy.hp
      enemy.hit(shoutDmg)
      if (enemy.hp < before) {
        totalHits++
        this._recordDamage(Math.min(before, before - enemy.hp))
      }
      if (!enemy.isBoss) {
        const a = Math.atan2(enemy.y - this.player.y, enemy.x - this.player.x)
        const end = traceShadowPath(this.game, enemy, a, 28, enemy.radius || 14)
        enemy.x = end.x; enemy.y = end.y
      }
      if (!enemy.active) { totalKills++; enemy._petDerivedKill = true; this.weapon._onKill(enemy) }
    }
    this.weapon._ring?.(this.player.x, this.player.y, this.routeInfo?.color || '#edc479', rallyRadius)

    if (this.route === 'ranger') {
      const res = this._castRangerCannon(alivePets)
      totalHits += res.hits; totalKills += res.kills
    } else {
      for (const pet of alivePets) {
        const res = this._triggerPetRallyBurst(pet)
        totalHits += res.hits; totalKills += res.kills
      }
      if (this.route === 'bond' || this.routeBondSeedLevel > 0) {
        const res = this._castBondPulse(alivePets)
        totalHits += res.hits; totalKills += res.kills
      }
      if (this.routeUltimate === 'beast') {
        this._spawnBeastEchoes(alivePets)
      }
    }

    this.game.combatFeedback?.impact?.({ hits: totalHits, kills: totalKills, angle: this.player.facing })
    this.weapon._burstColor?.(this.player.x, this.player.y, this.routeInfo?.color || '#edc479', 14, true)
    this.game.enemyManager?.addText?.(this.player.x, this.player.y - 45, this.activeSkill.name, null, '#ffe4a1', 15)
    this.game.sound?.bite?.(true, totalHits > 0)
    this.game.shakeScreen?.(totalHits >= 5 ? 4 : 2.5, 0.18)
    return true
  }

  _triggerPetRallyBurst(pet) {
    let hits = 0, kills = 0
    const dmg = this.attackDamage(pet)
    const color = PET_TYPES[pet.type]?.color || '#edc479'
    if (pet.type === 'guardian') {
      const radius = 145 * this.synergies.aoeMul
      for (const e of this.weapon.enemyManager.enemies) {
        if (!alive(e) || Math.hypot(e.x - pet.x, e.y - pet.y) > radius) continue
        const before = e.hp
        e.hit(dmg * 1.8)
        if (e.hp < before) { hits++; this._recordDamage(Math.min(before, before - e.hp)) }
        if (alive(e) && !e.isBoss && !e.isEnraged) e.elementStun = Math.max(e.elementStun || 0, 0.4)
        if (!e.active) { kills++; e._petDerivedKill = true; this.weapon._onKill(e) }
      }
      this.weapon._ring?.(pet.x, pet.y, color, radius)
    } else if (pet.type === 'hunter') {
      for (let i = 0; i < 8; i++) {
        this.launchShot(pet, null, dmg * 0.85, 0, { angle: (i * TAU) / 8, pierces: 1 + this.synergies.strikerExtraTarget })
      }
    } else if (pet.type === 'dew') {
      this.fountainZone = { x: this.player.x, y: this.player.y, r: 140 * this.synergies.zoneMul, life: 3.5, maxLife: 3.5, tick: 0.6 }
    } else if (pet.type === 'spore') {
      for (const zone of this.sporeZones) {
        for (const e of this.weapon.enemyManager.enemies) {
          if (!alive(e) || (e._sporeDetonatedCount || 0) >= 2) continue
          if (Math.hypot(e.x - zone.x, e.y - zone.y) <= zone.r + (e.radius || 14)) {
            e._sporeDetonatedCount = (e._sporeDetonatedCount || 0) + 1
            const before = e.hp
            e.hit(dmg * 1.3)
            if (e.hp < before) { hits++; this._recordDamage(Math.min(before, before - e.hp)) }
            if (alive(e) && !e.isBoss && !e.isEnraged) e.petSlowTime = Math.max(e.petSlowTime || 0, 2)
            if (!e.active) { kills++; e._petDerivedKill = true; this.weapon._onKill(e) }
          }
        }
        this.weapon._ring?.(zone.x, zone.y, '#c3a4dc', zone.r)
      }
      for (const e of this.weapon.enemyManager.enemies) delete e._sporeDetonatedCount
      this.sporeZones.length = 0
    } else if (pet.type === 'spark') {
      const nodes = [this.player, ...this.items.filter(p => p.hp > 0)]
      for (let i = 0; i < nodes.length; i++) {
        const next = nodes[(i + 1) % nodes.length]
        if (nodes[i] !== next) this.arcs.push({ points: [{ x: nodes[i].x, y: nodes[i].y }, { x: next.x, y: next.y }], life: 0.45, maxLife: 0.45, color: '#f6e56d', width: 3.5 })
      }
      const targets = this.supportEnemies(pet, this.player, 320, 14)
      for (const e of targets) {
        const before = e.hp
        e.hit(dmg * 1.6)
        if (e.hp < before) { hits++; this._recordDamage(Math.min(before, before - e.hp)) }
        this.arcs.push({ points: [{ x: pet.x, y: pet.y }, { x: e.x, y: e.y }], life: 0.25, maxLife: 0.25, color: '#fff9b8', width: 2.2 })
        if (!e.active) { kills++; e._petDerivedKill = true; this.weapon._onKill(e) }
      }
    } else if (pet.type === 'ember') {
      for (const r of [115, 160]) {
        const radius = r * this.synergies.strikerBlastMul
        for (const e of this.weapon.enemyManager.enemies) {
          if (!alive(e) || Math.hypot(e.x - pet.x, e.y - pet.y) > radius) continue
          const before = e.hp
          e.hit(dmg * 0.85, { burn: 2, burnDmg: Math.max(1, dmg * 0.25) })
          if (e.hp < before) { hits++; this._recordDamage(Math.min(before, before - e.hp)) }
          if (!e.active) { kills++; e._petDerivedKill = true; this.weapon._onKill(e) }
        }
        this.weapon._ring?.(pet.x, pet.y, '#ff8c5a', radius)
      }
    } else if (pet.type === 'bramble') {
      pet.orbitTimer = 2.5
      pet.orbitTick = 0
      pet.orbitAngle = pet.angle
    } else if (pet.type === 'frost') {
      this.frostPillars = [0, 1, 2].map(i => ({ angle: (i * TAU) / 3, dist: 92, life: 3, maxLife: 3, damage: dmg * 0.9, tick: 0 }))
    }
    return { hits, kills }
  }

  _castRangerCannon(alivePets) {
    for (const pet of alivePets) {
      const end = this.formationPoint(pet.type)
      pet.x = end.x; pet.y = end.y
    }
    this.grantPlayerShield(1, 4, { bypassIcd: true })
    for (const b of this.game.enemyManager?._bullets || []) {
      if (!b.active || b.isBoss) continue
      if (Math.hypot(b.x - this.player.x, b.y - this.player.y) <= 155) b.active = false
    }
    const target = this.weapon._findNearest?.()
    const baseAngle = target ? Math.atan2(target.y - this.player.y, target.x - this.player.x) : this.player.facing
    const ult = this.routeUltimate === 'ranger'
    if (ult) this.rangerUltimateTimer = 2.5
    const angles = ult ? [baseAngle - 0.16, baseAngle, baseAngle + 0.16] : [baseAngle]
    const len = 760, width = ult ? 54 : 44
    const dmg = this.weapon.damage * this.weapon.levelMul * (2.4 + alivePets.length * 0.5) * this.playerBodyDamageMultiplier()
    let hits = 0, kills = 0
    const hitSet = new Set()
    for (const a of angles) {
      const x1 = this.player.x, y1 = this.player.y
      const x2 = x1 + Math.cos(a) * len, y2 = y1 + Math.sin(a) * len
      this.beams.push({ x1, y1, x2, y2, width, life: 0.42, maxLife: 0.42, color: '#8edacb' })
      let infuses = 0
      for (const e of this.weapon.enemyManager.enemies) {
        if (!alive(e) || hitSet.has(e)) continue
        const rr = width * 0.5 + (e.radius || 14)
        if (pointToSegmentDistSq(e.x, e.y, x1, y1, x2, y2) <= rr * rr) {
          hitSet.add(e)
          const before = e.hp
          e.hit(dmg, { ignoreShield: true })
          if (e.hp < before) { hits++; this._recordDamage(Math.min(before, before - e.hp)) }
          if (infuses < (ult ? 6 : 4)) {
            infuses++
            this._applyRangerInfusions(e, dmg * 0.5, true)
          }
          if (!e.active) { kills++; e._petDerivedKill = true; this.weapon._onKill(e) }
        }
      }
    }
    return { hits, kills }
  }

  _castBondPulse(alivePets) {
    this.grantPlayerShield(1, 5, { bypassIcd: true })
    const radius = (145 + Math.min(80, this.routeBondSeedLevel * 10)) * this.synergies.aoeMul
    const dmg = this.weapon.damage * this.weapon.levelMul * 1.15 * this.endlessMultiplier
    let hits = 0, kills = 0
    for (const emitter of [this.player, ...alivePets]) {
      for (const e of this.weapon.enemyManager.enemies) {
        if (!alive(e) || Math.hypot(e.x - emitter.x, e.y - emitter.y) > radius) continue
        const before = e.hp
        e.hit(dmg)
        if (e.hp < before) { hits++; this._recordDamage(Math.min(before, before - e.hp)) }
        if (!e.active) { kills++; e._petDerivedKill = true; this.weapon._onKill(e) }
      }
      this.weapon._ring?.(emitter.x, emitter.y, '#c3a4dc', radius)
    }
    return { hits, kills }
  }

  _spawnBeastEchoes(alivePets) {
    this.spiritEchoes = alivePets.slice(0, 4).map((pet, idx) => ({
      x: pet.x + Math.cos(idx * 1.5) * 28,
      y: pet.y + Math.sin(idx * 1.5) * 28,
      type: pet.type,
      color: PET_TYPES[pet.type]?.color || '#edc479',
      life: 5,
      maxLife: 5,
      cooldown: 0.15 * idx,
      radius: 15,
      speed: 440,
      angle: pet.angle,
      attackFx: 0,
      power: 0.3 * this.attackDamage(pet),
    }))
  }

  attackDamage(pet) {
    const def = PET_TYPES[pet.type] || PET_TYPES.guardian
    const starScale = this.starPets.has(pet.type) ? 1.35 : 1
    const rangerScale = this.route === 'ranger' ? 0.75 : 1
    const rallyMul = this.rallyTime > 0 ? 1 + this.rallyStats.damage : 1
    const unityMul = 1 + (this.game?.bossTomes?.rank('pet_unity') === 1 ? 0.12 : this.game?.bossTomes?.rank('pet_unity') >= 2 ? 0.2 : 0)
    const unityRally = this.game?.bossTomes?.petAttackMultiplier?.(pet, this.rallyTime > 0) || 1
    return (
      this.weapon.damage *
      this.weapon.levelMul *
      def.power *
      this.typeScale(pet.type) *
      this.damageScale *
      this.soloCompensation *
      starScale *
      rangerScale *
      rallyMul *
      unityMul *
      unityRally *
      this.endlessMultiplier
    )
  }

  petCritParams(enemy) {
    const syn = this.synergies
    const frostAwake = this.level('pet_awake_frost') > 0 && (enemy.freeze > 0 || enemy.petFrostTime > 0) ? 0.25 : 0
    const unityCrit = this.game?.bossTomes?.rank('pet_unity') === 3 && this.rallyUnityBuffTimer > 0 ? 0.2 : 0
    const beastCrit = this.route === 'beast' ? (this.weapon.critChance || 0.1) * 0.8 + 0.08 : 0
    const seedCrit = this.routeBeastSeedLevel > 0 ? Math.min(0.22, 0.05 + this.routeBeastSeedLevel * 0.022) : 0
    const chance = Math.min(0.7, beastCrit + seedCrit + syn.critBonus + unityCrit + frostCritOrZero(frostAwake))
    const canCrit = this.route === 'beast' || this.routeBeastSeedLevel > 0 || syn.strikerActive || unityCrit > 0 || frostAwake > 0
    if (!canCrit || chance <= 0) return { isCrit: false, mul: 1 }
    const isCrit = Math.random() < chance
    if (!isCrit) return { isCrit: false, mul: 1 }
    const curseMul = this.route === 'beast' && this.routeBeastCurseLevel > 0 &&
      (enemy.petMarkTime > 0 || enemy.petWeakenTime > 0 || enemy.petBeastMarkTime > 0)
      ? Math.min(0.45, 0.13 + this.routeBeastCurseLevel * 0.04)
      : 0
    return { isCrit: true, mul: 1.75 + curseMul }
  }

  _recordDamage(amount) {
    if (amount > 0) this.weapon.stats.petDamage = (this.weapon.stats.petDamage || 0) + amount
  }

  applyHunterMark(enemy, duration = 3.0) {
    if (!alive(enemy)) return
    enemy.petMarkTime = Math.max(enemy.petMarkTime || 0, duration)
    if (!this.markOrder.includes(enemy)) {
      this.markOrder.push(enemy)
      while (this.markOrder.length > 3) {
        const oldest = this.markOrder.shift()
        if (oldest && oldest !== enemy) oldest.petMarkTime = 0
      }
    }
  }

  healOrShield(amount = 1, shieldDuration = 4) {
    const ally = this.injuredAlly()
    if (ally) {
      const heal = Math.min(amount, ally.maxHp - ally.hp)
      ally.hp += heal
      this.game.enemyManager?.addText?.(ally.x, ally.y - 30, `+${Math.round(heal * 10) / 10}`, null, '#8fd7e8', 13)
      this.weapon._ring?.(ally.x, ally.y, '#8fd7e8', 32)
      return true
    }
    this.grantPlayerShield(1, shieldDuration)
    this.dewBuffTimer = Math.max(this.dewBuffTimer, 3)
    return true
  }

  dealHit(pet, enemy, damage, boosted = false, opts = {}) {
    if (!this.available || !alive(enemy)) return false
    let mul = 1
    if (enemy.petMarkTime > 0 || enemy.petBeastMarkTime > 0) {
      mul += 0.2 + (this.routeBeastSeedLevel > 0 ? Math.min(0.25, 0.07 + this.routeBeastSeedLevel * 0.025) : 0)
    }
    const crit = opts.derived ? { isCrit: false, mul: 1 } : this.petCritParams(enemy)
    damage *= mul * crit.mul

    const before = enemy.hp
    enemy.hit(damage, opts.effects || null)
    if (enemy.hp < before) {
      const dealt = Math.min(before, before - enemy.hp)
      this._recordDamage(dealt)
      const color = crit.isCrit ? '#ffd166' : PET_TYPES[pet.type]?.color || '#edc479'
      this.game.enemyManager?.addText?.(enemy.x, enemy.y - 18, String(Math.round(damage * 10) / 10), null, color, crit.isCrit ? 15 : 12)
      this.weapon._burstColor?.(enemy.x, enemy.y - 6, color, crit.isCrit ? 8 : boosted ? 6 : 4, crit.isCrit)
      if (!opts.derived) {
        if (this.route === 'beast' && this.routeBeastCleaveLevel > 0 && pet.cleaveIcd <= 0) {
          this._beastCleave(pet, enemy, damage)
        }
        if (this.route === 'bond' && crit.isCrit && this.routeBondVolleyLevel > 0 && this.bondVolleyIcd <= 0) {
          this._fireBondPlayerEcho(enemy)
        }
      }
    }
    if (!enemy.active) {
      if (opts.derived) enemy._petDerivedKill = true
      this.weapon._onKill(enemy)
    }
    return enemy.hp < before
  }

  _beastCleave(pet, primary, damage) {
    pet.cleaveIcd = 0.22
    const radius = Math.min(130, 65 + this.routeBeastCleaveLevel * 8) * this.synergies.aoeMul
    const limit = Math.min(7, 3 + Math.ceil(this.routeBeastCleaveLevel / 2))
    const splash = damage * Math.min(0.6, 0.28 + this.routeBeastCleaveLevel * 0.04)
    const targets = this.weapon.enemyManager.enemies
      .filter(other => alive(other) && other !== primary && Math.hypot(other.x - primary.x, other.y - primary.y) <= radius)
      .slice(0, limit)
    for (const other of targets) {
      this.dealHit(pet, other, splash, false, { derived: true })
    }
    if (targets.length) this.weapon._ring?.(primary.x, primary.y, '#edc479', radius)
  }

  _fireBondPlayerEcho(target) {
    if (!alive(target)) return
    this.bondVolleyIcd = 0.45
    const angle = Math.atan2(target.y - this.player.y, target.x - this.player.x)
    this.shots.push({
      x: this.player.x + Math.cos(angle) * 18,
      y: this.player.y + Math.sin(angle) * 18,
      vx: Math.cos(angle) * 560,
      vy: Math.sin(angle) * 560,
      angle,
      target,
      owner: this.items[0] || { type: 'guardian', hp: 1, down: 0 },
      type: 'bond_echo',
      speed: 560,
      damage: this.weapon.damage * this.weapon.levelMul * 0.9 * this.endlessMultiplier,
      boosted: true,
      radius: 5,
      life: 1.2,
      active: true,
      pierces: 0,
      hitTargets: new Set(),
      derived: true,
    })
  }

  // —— 本体“猎人”技能协同钩子（由 WeaponSystem 调用） ——

  modifyPlayerHit(damage, critChance, critMul, target) {
    let dmg = damage, cc = critChance, cm = critMul, forceCrit = false
    if (!this.available || !alive(target)) return { damage: dmg, critChance: cc, critMul: cm, forceCrit }
    if (this.rangerUltimateTimer > 0) forceCrit = true
    if (this.route === 'ranger') {
      const aliveFrost = this.items.some(p => p.hp > 0 && p.type === 'frost')
      const controlled = target.slow > 0 || target.petSlowTime > 0 || target.freeze > 0 || target.petFrostTime > 0
      if (aliveFrost && controlled) {
        cc += 0.18
        cm += 0.4
      }
      if (this.routeRangerFocusLevel > 0 && (controlled || target.petMarkTime > 0 || this.isTaunted(target))) {
        cm += Math.min(1.0, 0.3 + this.routeRangerFocusLevel * 0.1)
      }
    }
    return { damage: dmg, critChance: cc, critMul: cm, forceCrit }
  }

  onPlayerProjectileHit(enemy, damage, isCrit, projectile) {
    if (!this.available || !enemy) return
    const firstHit = !projectile?._petHitCounted
    if (projectile) projectile._petHitCounted = true
    if (alive(enemy) && (this.game?.primarySpec === 'symbiosis' || this.route)) {
      this.applyHunterMark(enemy, 3.0)
    }
    if (this.tacticMendLevel > 0 && !projectile?.isSplit && firstHit) {
      this.mendHits += isCrit ? 2 : 1
      const threshold = 9 - this.tacticMendLevel
      if (this.mendHits >= threshold) {
        this.mendHits = 0
        this._executeMendTactic()
      }
    }
    if (this.route === 'beast') {
      if (alive(enemy)) enemy.petBeastMarkTime = Math.max(enemy.petBeastMarkTime || 0, 3.5)
      for (const other of this.weapon.enemyManager.enemies) {
        if (!alive(other) || Math.hypot(other.x - enemy.x, other.y - enemy.y) > 85) continue
        other.petBeastMarkTime = Math.max(other.petBeastMarkTime || 0, 3.5)
      }
      this.weapon._ring?.(enemy.x, enemy.y, '#edc479', 85)
    }
    if (this.route === 'ranger') {
      if (this.routeRangerFocusLevel > 0 && isCrit && this.rangerFocusIcd <= 0) {
        this.rangerFocusIcd = 0.22
        this._rangerFocusShatter(enemy, damage)
      }
      if (!projectile?.rangerSideArrow) {
        this._applyRangerInfusions(enemy, damage, false)
        if (this.routeRangerBarrageLevel > 0 && firstHit) {
          this.rangerBarrageCount++
          const freq = this.routeRangerBarrageLevel >= 4 ? 3 : 4
          if (this.rangerBarrageCount >= freq) {
            this.rangerBarrageCount = 0
            this._fireRangerBarrage(enemy)
          }
        }
      }
    }
    if (this.route === 'bond' && !projectile?.isSplit && firstHit) {
      this.bondHits++
      if (this.bondHits >= 2) {
        this.bondHits = 0
        const target = alive(enemy) ? enemy : this.weapon._findNearest?.()
        if (target) this._triggerBondFollowup(target)
      }
    }
  }

  _executeMendTactic() {
    const healAmount = 1.5 + this.tacticMendLevel * 0.5
    const hurtPet = this.items.filter(p => p.hp > 0 && p.hp < p.maxHp).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]
    if (hurtPet) {
      hurtPet.hp = Math.min(hurtPet.maxHp, hurtPet.hp + healAmount)
      this.game.enemyManager?.addText?.(hurtPet.x, hurtPet.y - 28, `+${healAmount}`, null, '#8fd7e8', 12)
      this.weapon._ring?.(hurtPet.x, hurtPet.y, '#8fd7e8', 30)
      return
    }
    const downPet = this.items.filter(p => p.down > 0).sort((a, b) => b.down - a.down)[0]
    if (downPet) {
      downPet.down = Math.max(0.05, downPet.down - 1.2)
      return
    }
    if (this.mendCdIcd <= 0) {
      this.mendCdIcd = 1.5
      this.player.strainSkillCd = Math.max(0, (this.player.strainSkillCd || 0) - 0.35)
    }
  }

  _rangerFocusShatter(enemy, damage) {
    const radius = 95 + this.routeRangerFocusLevel * 8
    const splash = damage * Math.min(0.45, 0.25 + this.routeRangerFocusLevel * 0.03)
    for (const other of this.weapon.enemyManager.enemies) {
      if (!alive(other) || other === enemy || Math.hypot(other.x - enemy.x, other.y - enemy.y) > radius) continue
      const before = other.hp
      other.hit(splash)
      if (other.hp < before) this._recordDamage(Math.min(before, before - other.hp))
      if (!other.active) { other._petDerivedKill = true; this.weapon._onKill(other) }
    }
    this.weapon._ring?.(enemy.x, enemy.y, '#8edacb', radius)
  }

  _fireRangerBarrage(primary) {
    const count = 2 + Math.min(2, Math.floor(this.routeRangerBarrageLevel / 3))
    const mul = Math.min(0.65, 0.38 + this.routeRangerBarrageLevel * 0.035)
    const baseAngle = Math.atan2(primary.y - this.player.y, primary.x - this.player.x)
    const baseDmg = this.weapon.damage * this.weapon.levelMul * this.playerBodyDamageMultiplier() * mul
    for (let i = 0; i < count; i++) {
      const a = baseAngle + (i - (count - 1) / 2) * 0.16
      this.shots.push({
        x: this.player.x + Math.cos(a) * 18,
        y: this.player.y + Math.sin(a) * 18,
        vx: Math.cos(a) * 620,
        vy: Math.sin(a) * 620,
        angle: a,
        target: primary,
        owner: this.items[0] || { type: 'hunter', hp: 1, down: 0 },
        type: 'ranger_arrow',
        speed: 620,
        damage: baseDmg,
        boosted: true,
        radius: 5,
        life: 1.3,
        active: true,
        pierces: 1,
        hitTargets: new Set(),
        rangerSideArrow: true,
      })
    }
  }

  _applyRangerInfusions(enemy, damage, fromCannon = false) {
    const aliveTypes = new Set(this.items.filter(p => p.hp > 0).map(p => p.type))
    const dmgScale = 1 + Math.min(1.2, this.routeRangerInfuseLevel * 0.15)
    const rangeScale = 1 + Math.min(0.52, this.routeRangerInfuseLevel * 0.065)

    if (alive(enemy) && aliveTypes.has('guardian') && !enemy.isBoss && Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) <= 120 * rangeScale) {
      const a = Math.atan2(enemy.y - this.player.y, enemy.x - this.player.x)
      const end = traceShadowPath(this.game, enemy, a, 22, enemy.radius || 14)
      enemy.x = end.x; enemy.y = end.y
    }
    if (alive(enemy) && aliveTypes.has('frost') && !enemy.isEnraged) {
      enemy.petSlowTime = Math.max(enemy.petSlowTime || 0, 2.0)
      enemy.petSlowAmount = Math.max(enemy.petSlowAmount || 0, 0.3)
    }
    if (aliveTypes.has('spore') && (fromCannon || this.rangerInfuseIcd.spore <= 0)) {
      this.rangerInfuseIcd.spore = 0.4
      const r = 65 * rangeScale
      for (const e of this.weapon.enemyManager.enemies) {
        if (!alive(e) || Math.hypot(e.x - enemy.x, e.y - enemy.y) > r) continue
        e.petVulnTime = Math.max(e.petVulnTime || 0, 3)
        e.petVulnAmount = Math.max(e.petVulnAmount || 0, 0.18)
      }
      this.weapon._ring?.(enemy.x, enemy.y, '#c3a4dc', r)
    }
    if (aliveTypes.has('spark') && (fromCannon || this.rangerInfuseIcd.spark <= 0)) {
      this.rangerInfuseIcd.spark = 0.25
      this._chainLightning(this.items.find(p => p.type === 'spark') || this.items[0], enemy, damage * 0.42 * dmgScale, 3, 145 * rangeScale, true)
    }
    if (aliveTypes.has('ember') && (fromCannon || this.rangerInfuseIcd.ember <= 0)) {
      this.rangerInfuseIcd.ember = 0.22
      const r = 85 * rangeScale
      const splash = damage * 0.45 * dmgScale
      for (const other of this.weapon.enemyManager.enemies) {
        if (!alive(other) || other === enemy || Math.hypot(other.x - enemy.x, other.y - enemy.y) > r) continue
        const before = other.hp
        other.hit(splash, { burn: 2, burnDmg: Math.max(1, damage * 0.2) })
        if (other.hp < before) this._recordDamage(Math.min(before, before - other.hp))
        if (!other.active) { other._petDerivedKill = true; this.weapon._onKill(other) }
      }
      this.weapon._ring?.(enemy.x, enemy.y, '#ff8c5a', r)
    }
    if (aliveTypes.has('hunter') && !fromCannon) {
      if ((this.rangerInfuseIcd.hunterCount = (this.rangerInfuseIcd.hunterCount || 0) + 1) >= 3) {
        this.rangerInfuseIcd.hunterCount = 0
        const hunterPet = this.items.find(p => p.type === 'hunter') || this.items[0]
        if (hunterPet) this.launchShot(hunterPet, enemy, damage * 0.65 * dmgScale, 8, { pierces: 1, derived: true })
      }
    }
    if (aliveTypes.has('dew') && !fromCannon) {
      this.rangerInfuseIcd.dew = (this.rangerInfuseIcd.dew || 0) + 1
      if (this.rangerInfuseIcd.dew >= 8) {
        this.rangerInfuseIcd.dew = 0
        this.healOrShield(1, 4)
      }
    }
  }

  _triggerBondFollowup(enemy) {
    const cd = Math.max(0.28, 0.6 - this.routeBondVolleyLevel * 0.04)
    const readyPet = this.items
      .filter(p => p.hp > 0 && p.bondIcd <= 0 && shadowLineClear(this.game, p, enemy))
      .sort((a, b) => Math.hypot(a.x - enemy.x, a.y - enemy.y) - Math.hypot(b.x - enemy.x, b.y - enemy.y))[0]
    if (!readyPet) return
    readyPet.bondIcd = cd
    const scale = this.routeBondVolleyLevel > 0 ? Math.min(1.34, 0.7 + this.routeBondVolleyLevel * 0.08) : 0.65
    const dmg = this.attackDamage(readyPet) * scale
    if (PET_TYPES[readyPet.type]?.projectileSpeed) {
      this.launchShot(readyPet, enemy, dmg, 0, { derived: true })
    } else {
      this.dealHit(readyPet, enemy, dmg, true, { derived: true })
    }
    this.arcs.push({ points: [{ x: readyPet.x, y: readyPet.y }, { x: enemy.x, y: enemy.y }], life: 0.16, maxLife: 0.16, color: '#c3a4dc', width: 2 })
  }

  onKill(enemy) {
    if (!this.available || !enemy) return
    if (this.route === 'beast' && this.routeBeastFrenzyLevel > 0) {
      const cap = this.rallyTime > 0 ? 16 : 8
      this.beastFrenzyStacks = Math.min(cap, this.beastFrenzyStacks + 1)
      this.beastFrenzyTimer = 3
    }
    if (this.route === 'bond' && this.routeBondSurgeLevel > 0 && this.rallyTime > 0 && this.bondSurgeExtended < 2.0) {
      this.bondSurgeKills++
      if (this.bondSurgeKills >= 4) {
        this.bondSurgeKills = 0
        const add = Math.min(0.25, 2.0 - this.bondSurgeExtended)
        this.rallyTime = Math.min(8.0, this.rallyTime + add)
        this.bondSurgeExtended += add
      }
    }
    if (this.route === 'ranger' && this.items.some(p => p.hp > 0 && p.type === 'bramble')) {
      this.brambleKillSpeedTimer = 1.5
    }
    if (enemy._petDerivedKill) return
    // 孢毒菌雾亡语爆发
    if (enemy.petSporeMarkTime > 0) {
      const sporeAwake = this.level('pet_awake_spore') > 0
      const r = (sporeAwake ? 95 : 70) * this.synergies.zoneMul
      const base = this.weapon.damage * this.weapon.levelMul * (sporeAwake ? 1.05 : 0.7) * this.endlessMultiplier
      for (const other of this.weapon.enemyManager.enemies) {
        if (!alive(other) || other === enemy || Math.hypot(other.x - enemy.x, other.y - enemy.y) > r) continue
        const before = other.hp
        other.hit(base)
        if (other.hp < before) this._recordDamage(Math.min(before, before - other.hp))
        if (sporeAwake && alive(other)) {
          other.petVulnTime = Math.max(other.petVulnTime || 0, 3)
          other.petVulnAmount = Math.max(other.petVulnAmount || 0, 0.15)
        }
        if (!other.active) { other._petDerivedKill = true; this.weapon._onKill(other) }
      }
      this.weapon._ring?.(enemy.x, enemy.y, '#c3a4dc', r)
    }
    // 霜晶碎冰亡语爆发
    if ((enemy.petFrostTime > 0 || enemy.freeze > 0) && this.items.some(p => p.type === 'frost')) {
      const frostAwake = this.level('pet_awake_frost') > 0
      const r = 75 * this.synergies.zoneMul
      const base = this.weapon.damage * this.weapon.levelMul * (frostAwake ? 1.05 : 0.65) * this.endlessMultiplier
      const targets = this.weapon.enemyManager.enemies
        .filter(other => alive(other) && other !== enemy && Math.hypot(other.x - enemy.x, other.y - enemy.y) <= r)
        .slice(0, 5)
      for (const other of targets) {
        const before = other.hp
        other.hit(base)
        if (other.hp < before) this._recordDamage(Math.min(before, before - other.hp))
        if (!other.active) { other._petDerivedKill = true; this.weapon._onKill(other) }
      }
      this.weapon._ring?.(enemy.x, enemy.y, '#9ad9ff', r)
    }
    // 炽火唤醒：灼烧敌人死亡殉爆
    if (enemy.burnHits > 0 && this.level('pet_awake_ember') > 0) {
      const r = 80 * this.synergies.strikerBlastMul
      const base = this.weapon.damage * this.weapon.levelMul * 0.9 * this.endlessMultiplier
      for (const other of this.weapon.enemyManager.enemies) {
        if (!alive(other) || other === enemy || Math.hypot(other.x - enemy.x, other.y - enemy.y) > r) continue
        const before = other.hp
        other.hit(base)
        if (other.hp < before) this._recordDamage(Math.min(before, before - other.hp))
        if (!other.active) { other._petDerivedKill = true; this.weapon._onKill(other) }
      }
      this.weapon._ring?.(enemy.x, enemy.y, '#ff8c5a', r)
    }
  }

  // —— 伙伴投射物 & 特殊普攻 ——

  launchShot(pet, target, damage, offset = 0, opts = {}) {
    const def = PET_TYPES[pet.type] || PET_TYPES.hunter
    const speed = opts.speed || def.projectileSpeed || 480
    const angle = opts.angle ?? (target ? Math.atan2(target.y - pet.y, target.x - pet.x) : pet.angle)
    const x = pet.x + Math.cos(angle) * 17 - Math.sin(angle) * offset
    const y = pet.y + Math.sin(angle) * 17 + Math.cos(angle) * offset - 3
    const pierces = opts.pierces ?? (
      pet.type === 'hunter' ? 1 + (this.level('pet_awake_hunter') > 0 ? 1 : 0) + this.synergies.strikerExtraTarget
        : pet.type === 'frost' ? 1 + (this.level('pet_awake_frost') > 0 ? 1 : 0)
        : 0
    )
    this.shots.push({
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      angle, target: opts.angle != null ? null : target,
      owner: pet, type: pet.type, speed, damage, boosted: this.rallyTime > 0,
      radius: pet.type === 'ember' ? 6 : 4.5, life: 0.95, active: true,
      pierces, hitTargets: new Set(), derived: !!opts.derived,
    })
  }

  _chainLightning(pet, primary, damage, maxHops = 3, jumpRange = 155, derived = false) {
    const visited = new Set([primary])
    let cur = primary, curDmg = damage
    const points = [{ x: pet.x, y: pet.y }, { x: primary.x, y: primary.y }]
    if (!derived) this.dealHit(pet, primary, curDmg, this.rallyTime > 0)
    else if (alive(primary)) {
      const before = primary.hp
      primary.hit(curDmg)
      if (primary.hp < before) this._recordDamage(Math.min(before, before - primary.hp))
      if (!primary.active) { primary._petDerivedKill = true; this.weapon._onKill(primary) }
    }
    const decay = this.level('pet_awake_spark') > 0 ? 0.88 : 0.78
    for (let h = 0; h < maxHops; h++) {
      let best = null, bestD = jumpRange
      for (const e of this.weapon.enemyManager.enemies) {
        if (!alive(e) || visited.has(e)) continue
        const d = Math.hypot(e.x - cur.x, e.y - cur.y)
        if (d <= bestD) { bestD = d; best = e }
      }
      if (!best) break
      visited.add(best)
      curDmg *= decay
      points.push({ x: best.x, y: best.y })
      this.dealHit(pet, best, curDmg, this.rallyTime > 0, { derived: true })
      cur = best
    }
    this.arcs.push({ points, life: 0.16, maxLife: 0.16, color: '#f6e56d', width: 2.2 })
    if (this.arcs.length > 32) this.arcs.shift()
  }

  _hitSpore(shot, primary) {
    const awake = this.level('pet_awake_spore') > 0
    const radius = 65 * this.synergies.zoneMul
    const x = primary.x, y = primary.y
    const targets = [primary, ...this.weapon.enemyManager.enemies.filter(e => e !== primary && alive(e) && Math.hypot(e.x - x, e.y - y) <= radius)].slice(0, 4)
    let landed = false
    for (const [idx, e] of targets.entries()) {
      const hit = this.dealHit(shot.owner, e, shot.damage * (idx ? 0.55 : 1), shot.boosted, { derived: idx > 0 || shot.derived })
      if (hit && !e.isBoss && !e.isEnraged) e.petSlowTime = Math.max(e.petSlowTime || 0, 1.2), e.petSlowAmount = Math.max(e.petSlowAmount || 0, 0.35)
      landed = hit || landed
    }
    const mistRadius = (58 + (awake ? 30 : 0)) * this.synergies.zoneMul
    this.sporeZones.push({
      x, y, r: mistRadius,
      life: awake ? 4.0 : 2.5, maxLife: awake ? 4.0 : 2.5,
      tick: 0.35, damage: shot.damage * 0.35, owner: shot.owner,
    })
    if (this.sporeZones.length > 10) this.sporeZones.shift()
    this.weapon._ring?.(x, y, '#c3a4dc', radius)
    return landed
  }

  _hitEmber(shot, primary) {
    const awake = this.level('pet_awake_ember') > 0
    const radius = (78 + (awake ? 25 : 0)) * this.synergies.strikerBlastMul
    const x = primary.x, y = primary.y
    const targets = [primary, ...this.weapon.enemyManager.enemies.filter(e => e !== primary && alive(e) && Math.hypot(e.x - x, e.y - y) <= radius)].slice(0, 6)
    let landed = false
    for (const [idx, e] of targets.entries()) {
      const dmg = shot.damage * (idx ? 0.7 : 1)
      const hit = this.dealHit(shot.owner, e, dmg, shot.boosted, {
        derived: idx > 0 || shot.derived,
        effects: { burn: 2, burnDmg: Math.max(1, shot.damage * 0.2) },
      })
      landed = hit || landed
    }
    this.weapon._ring?.(x, y, '#ff8c5a', radius)
    this.weapon._burstColor?.(x, y, '#ff8c5a', 8, false)
    return landed
  }

  _hitFrost(shot, enemy) {
    const awake = this.level('pet_awake_frost') > 0
    const hit = this.dealHit(shot.owner, enemy, shot.damage, shot.boosted, { derived: shot.derived })
    if (alive(enemy)) {
      enemy.petSlowTime = Math.max(enemy.petSlowTime || 0, 2.5)
      enemy.petSlowAmount = Math.max(enemy.petSlowAmount || 0, 0.3)
      enemy.petFrostTime = Math.max(enemy.petFrostTime || 0, 2.5)
      enemy.petFrostStacks = (enemy.petFrostStacks || 0) + 1
      const need = awake ? 2 : 3
      if (enemy.petFrostStacks >= need && !enemy.isBoss && !enemy.isEnraged) {
        enemy.petFrostStacks = 0
        enemy.freeze = Math.max(enemy.freeze || 0, 1.2)
      }
    }
    return hit
  }

  strike(pet, attack) {
    const primary = attack.target
    pet.attackFx = 0.18
    pet.attackBoosted = this.rallyTime > 0
    pet.attackAngle = pet.angle
    const def = PET_TYPES[pet.type] || PET_TYPES.guardian
    const range = def.range + 18
    if (!alive(primary) || Math.hypot(primary.x - pet.x, primary.y - pet.y) > range || !shadowLineClear(this.game, pet, primary)) return
    const damage = this.attackDamage(pet)

    if (pet.type === 'spark') {
      const hops = 3 + this.synergies.strikerExtraTarget + (this.level('pet_awake_spark') > 0 ? 2 : 0)
      this._chainLightning(pet, primary, damage, hops, 155, false)
      this.game.sound?.hit?.('spark')
      return
    }
    if (pet.type === 'bramble') {
      const dir = Math.atan2(primary.y - pet.y, primary.x - pet.x)
      pet.rollDash = {
        dx: Math.cos(dir), dy: Math.sin(dir),
        speed: 620, remaining: 135, hitTargets: new Set(),
        pierceLimit: this.level('pet_awake_bramble') > 0 ? 6 : 4, damage,
      }
      return
    }
    if (def.projectileSpeed) {
      this.launchShot(pet, primary, damage)
      pet.shotCount++
      this.weapon._burstColor?.(pet.x + Math.cos(pet.angle) * 16, pet.y + Math.sin(pet.angle) * 16, def.color, 3, false)
      return
    }
    if (pet.type === 'guardian') {
      const awake = this.level('pet_awake_guardian') > 0
      const halfCone = awake ? Math.PI * 0.5 : Math.PI / 3
      const radius = (def.range + 10) * this.synergies.aoeMul
      const limit = awake ? 6 : 4
      const hitList = [primary, ...this.weapon.enemyManager.enemies.filter(e => {
        if (!alive(e) || e === primary) return false
        const d = Math.hypot(e.x - pet.x, e.y - pet.y)
        if (d > radius) return false
        const diff = Math.abs(Math.atan2(Math.sin(Math.atan2(e.y - pet.y, e.x - pet.x) - pet.angle), Math.cos(Math.atan2(e.y - pet.y, e.x - pet.x) - pet.angle)))
        return diff <= halfCone && shadowLineClear(this.game, pet, e)
      })].slice(0, limit)
      let landed = false
      for (const [idx, e] of hitList.entries()) {
        const hit = this.dealHit(pet, e, damage * (idx ? 0.65 : 1), pet.attackBoosted, { derived: idx > 0 })
        if (hit && !e.isBoss) {
          const a = Math.atan2(e.y - pet.y, e.x - pet.x)
          const end = traceShadowPath(this.game, e, a, 14, e.radius || 14)
          e.x = end.x; e.y = end.y
        }
        landed = hit || landed
      }
      if (landed) this.game.sound?.hit?.('base')
      return
    }
    const landed = this.dealHit(pet, primary, damage, pet.attackBoosted)
    if (landed) this.game.sound?.hit?.('base')
  }

  updateShots(dt) {
    for (const shot of this.shots) {
      shot.life -= dt
      if (shot.life <= 0) { shot.active = false; continue }
      if (alive(shot.target) && !shot.hitTargets?.has(shot.target)) {
        const angle = Math.atan2(shot.target.y - shot.y, shot.target.x - shot.x)
        shot.vx = Math.cos(angle) * shot.speed
        shot.vy = Math.sin(angle) * shot.speed
      }
      shot.angle = Math.atan2(shot.vy, shot.vx)
      const ax = shot.x, ay = shot.y, step = shot.speed * dt
      const end = traceShadowPath(this.game, shot, shot.angle, step, 0)
      shot.x = end.x; shot.y = end.y
      let hit = null, first = Infinity
      for (const enemy of this.weapon.enemyManager.enemies) {
        if (!alive(enemy) || shot.hitTargets?.has(enemy)) continue
        const entry = shadowCircleEntry(ax, ay, shot.x, shot.y, enemy, shot.radius)
        if (entry < first) { hit = enemy; first = entry }
      }
      if (hit) {
        shot.hitTargets?.add(hit)
        const dmg = shot.hitTargets.size > 1 && shot.type === 'hunter' ? shot.damage * 0.75 : shot.damage
        let landed = false
        if (shot.type === 'spore') landed = this._hitSpore(shot, hit)
        else if (shot.type === 'ember') landed = this._hitEmber(shot, hit)
        else if (shot.type === 'frost') landed = this._hitFrost(shot, hit)
        else landed = this.dealHit(shot.owner, hit, dmg, shot.boosted, { derived: shot.derived })

        if (landed && shot.type === 'dew' && shot.owner?.hp > 0 && shot.owner?.down <= 0) {
          this._hitDewSplash(shot, hit)
        }
        if (landed && shot.type === 'hunter' && !hit.active && this.level('pet_awake_hunter') > 0 && !shot.derived) {
          const next = this.weapon.enemyManager.enemies
            .filter(e => alive(e) && e !== hit && Math.hypot(e.x - hit.x, e.y - hit.y) <= 220)
            .sort((a, b) => Math.hypot(a.x - hit.x, a.y - hit.y) - Math.hypot(b.x - hit.x, b.y - hit.y))[0]
          if (next) this.launchShot(shot.owner, next, shot.damage * 0.85, 0, { pierces: 0, derived: true })
        }
        if (landed && shot.type === 'ranger_arrow') this._applyRangerInfusions(hit, shot.damage, false)
        if (landed) this.game.sound?.hit?.('spark')
        if ((shot.pierces || 0) > 0 && shot.type !== 'spore' && shot.type !== 'ember') {
          shot.pierces--
          shot.target = null
        } else {
          shot.active = false
        }
      } else if (Math.hypot(shot.x - ax, shot.y - ay) < step - 0.5) {
        shot.active = false
      }
    }
    if (this.shots.some(shot => !shot.active)) this.shots = this.shots.filter(shot => shot.active)
  }

  _hitDewSplash(shot, primary) {
    const splashTargets = this.weapon.enemyManager.enemies
      .filter(e => alive(e) && e !== primary && Math.hypot(e.x - primary.x, e.y - primary.y) <= 55)
      .slice(0, 3)
    for (const e of splashTargets) {
      this.dealHit(shot.owner, e, shot.damage * 0.6, shot.boosted, { derived: true })
    }
    shot.owner.healCharge = (shot.owner.healCharge || 0) + 1
    const threshold = this.level('pet_awake_dew') > 0 ? 3 : 4
    if (shot.owner.healCharge >= threshold) {
      shot.owner.healCharge = 0
      this.healOrShield(1, 4)
    }
  }

  _updateHunterTactics(dt) {
    if (this.tacticWeakenLevel > 0) {
      this.weakenTimer -= dt
      if (this.weakenTimer <= 0) {
        const cd = Math.max(4.5, 7.5 - this.tacticWeakenLevel * 0.35)
        const radius = Math.min(292, 180 + this.tacticWeakenLevel * 14)
        const limit = Math.min(18, 8 + this.tacticWeakenLevel)
        const dur = Math.min(5, 3 + this.tacticWeakenLevel * 0.25)
        const petDr = Math.min(0.5, 0.25 + this.tacticWeakenLevel * 0.03)
        const targets = this.weapon.enemyManager.enemies
          .filter(e => alive(e) && Math.hypot(e.x - this.player.x, e.y - this.player.y) <= radius)
          .slice(0, limit)
        this.weakenTimer = targets.length ? cd : 1.0
        if (targets.length) {
          for (const e of targets) {
            const d = e.isBoss ? dur * 0.5 : dur
            e.petWeakenTime = Math.max(e.petWeakenTime || 0, d)
            e.petWeakenAmount = Math.max(e.petWeakenAmount || 0, petDr)
            e.petSuppressAmount = Math.max(e.petSuppressAmount || 0, 0.3)
            e.petSlowTime = Math.max(e.petSlowTime || 0, d)
            e.petSlowAmount = Math.max(e.petSlowAmount || 0, 0.35)
            if (e.isBoss) e.slow = Math.max(e.slow || 0, d)
          }
          if (targets.length >= 4 && this.weakenShieldIcd <= 0) {
            this.weakenShieldIcd = 10
            this.grantPlayerShield(1, 3.5)
          }
          if (this.route === 'beast' && this.routeBeastCurseLevel > 0 && this.beastCurseIcd <= 0) {
            this.beastCurseIcd = 3
            const cut = Math.min(2.8, 0.8 + this.routeBeastCurseLevel * 0.25)
            for (const p of this.items) if (p.hp > 0) p.supportCd = Math.max(0, p.supportCd - cut)
          }
          this.weapon._ring?.(this.player.x, this.player.y, '#8edacb', radius)
        }
      }
    }

    if (this.tacticMisdirectLevel > 0) {
      this.misdirectTimer -= dt
      if (this.misdirectTimer <= 0) {
        const anchor = this.items.find(p => p.hp > 0 && PET_TYPES[p.type]?.role === 'vanguard') ||
          this.items.filter(p => p.hp > 0).sort((a, b) => b.hp - a.hp)[0]
        const targets = anchor
          ? this.weapon.enemyManager.enemies
              .filter(e => alive(e) && !e.isBoss && Math.hypot(e.x - this.player.x, e.y - this.player.y) <= 230)
              .sort((a, b) => Math.hypot(a.x - this.player.x, a.y - this.player.y) - Math.hypot(b.x - this.player.x, b.y - this.player.y))
              .slice(0, 3 + this.tacticMisdirectLevel)
          : []
        if (anchor && targets.length) {
          this.misdirectTimer = 11 - this.tacticMisdirectLevel * 1.5
          for (const e of targets) { e.petTauntTarget = anchor; e.petTauntTime = 2.5 }
          anchor.shield = Math.min(anchor.maxHp, (anchor.shield || 0) + 3 + this.tacticMisdirectLevel * 2)
          anchor.shieldTimer = 3
          this.arcs.push({ points: [{ x: this.player.x, y: this.player.y }, { x: anchor.x, y: anchor.y }], life: 0.3, maxLife: 0.3, color: '#edc479', width: 2.5 })
          this.weapon._ring?.(anchor.x, anchor.y, '#edc479', 65)
        } else {
          this.misdirectTimer = 1.2
        }
      }
    }

    if (this.route === 'ranger' && this.items.some(p => p.hp > 0 && p.type === 'guardian')) {
      this.rangerRockShieldTimer -= dt
      if (this.rangerRockShieldTimer <= 0) {
        this.rangerRockShieldTimer = 9
        this.grantPlayerShield(1, 5)
      }
    }
  }

  _updateGroundAndRoutes(dt) {
    // 孢毒菌雾推进
    for (let i = this.sporeZones.length - 1; i >= 0; i--) {
      const z = this.sporeZones[i]
      z.life -= dt
      z.tick -= dt
      if (z.life <= 0) { this.sporeZones.splice(i, 1); continue }
      if (z.tick <= 0) {
        z.tick = 0.5
        for (const e of this.weapon.enemyManager.enemies) {
          if (!alive(e) || Math.hypot(e.x - z.x, e.y - z.y) > z.r) continue
          const before = e.hp
          e.hit(z.damage)
          if (e.hp < before) this._recordDamage(Math.min(before, before - e.hp))
          if (alive(e)) {
            e.petSporeMarkTime = Math.max(e.petSporeMarkTime || 0, 1.2)
            if (!e.isBoss && !e.isEnraged) {
              e.petSlowTime = Math.max(e.petSlowTime || 0, 0.8)
              e.petSlowAmount = Math.max(e.petSlowAmount || 0, 0.35)
            }
          } else {
            e._petDerivedKill = true
            this.weapon._onKill(e)
          }
        }
      }
    }

    // 延迟陨石/巨孢爆破
    for (let i = this.meteorDrops.length - 1; i >= 0; i--) {
      const m = this.meteorDrops[i]
      m.delay -= dt
      if (m.delay > 0) continue
      this.meteorDrops.splice(i, 1)
      for (const e of this.weapon.enemyManager.enemies) {
        if (!alive(e) || Math.hypot(e.x - m.x, e.y - m.y) > m.r) continue
        const before = e.hp
        e.hit(m.damage, m.burn ? { burn: m.burn, burnDmg: Math.max(1, m.damage * 0.2) } : null)
        if (e.hp < before) this._recordDamage(Math.min(before, before - e.hp))
        if (alive(e) && m.slow && !e.isBoss && !e.isEnraged) {
          e.petSlowTime = Math.max(e.petSlowTime || 0, m.slow)
          e.petSlowAmount = Math.max(e.petSlowAmount || 0, 0.35)
        }
        if (!e.active) { e._petDerivedKill = true; this.weapon._onKill(e) }
      }
      if (m.mist) {
        this.sporeZones.push({
          x: m.x, y: m.y, r: m.r * 0.9, life: 3.5, maxLife: 3.5, tick: 0.4,
          damage: m.damage * 0.25, owner: m.owner,
        })
        if (this.sporeZones.length > 10) this.sporeZones.shift()
      }
      this.weapon._ring?.(m.x, m.y, m.color, m.r)
      this.weapon._burstColor?.(m.x, m.y, m.color, 10, true)
    }

    // 甘露涌泉光环
    if (this.fountainZone) {
      this.fountainZone.life -= dt
      this.fountainZone.tick -= dt
      this.fountainZone.x = this.player.x; this.fountainZone.y = this.player.y
      if (this.fountainZone.tick <= 0) {
        this.fountainZone.tick = 1
        this.healOrShield(0.5, 2.5)
      }
      if (this.fountainZone.life <= 0) this.fountainZone = null
    }

    // 霜晶冰柱公转
    for (let i = this.frostPillars.length - 1; i >= 0; i--) {
      const fp = this.frostPillars[i]
      fp.life -= dt
      fp.tick -= dt
      fp.angle += dt * 3.4
      if (fp.life <= 0) { this.frostPillars.splice(i, 1); continue }
      if (fp.tick <= 0) {
        fp.tick = 0.3
        const px = this.player.x + Math.cos(fp.angle) * fp.dist
        const py = this.player.y + Math.sin(fp.angle) * fp.dist
        for (const e of this.weapon.enemyManager.enemies) {
          if (!alive(e) || Math.hypot(e.x - px, e.y - py) > 28 + (e.radius || 14)) continue
          const before = e.hp
          e.hit(fp.damage)
          if (e.hp < before) this._recordDamage(Math.min(before, before - e.hp))
          if (alive(e) && !e.isBoss && !e.isEnraged) {
            e.freeze = Math.max(e.freeze || 0, 1)
            e.petFrostTime = Math.max(e.petFrostTime || 0, 2)
          }
          if (!e.active) { e._petDerivedKill = true; this.weapon._onKill(e) }
        }
      }
    }

    // 借灵游侠 · 刃棘护身旋刺
    if (this.route === 'ranger' && this.items.some(p => p.hp > 0 && p.type === 'bramble')) {
      this._brambleOrbitAngle += dt * 4.2
      if ((this._brambleOrbitTick = (this._brambleOrbitTick || 0) - dt) <= 0) {
        this._brambleOrbitTick = 0.4
        const dmg = this.weapon.damage * this.weapon.levelMul * 0.55 * this.endlessMultiplier
        for (const offset of [0, Math.PI]) {
          const sx = this.player.x + Math.cos(this._brambleOrbitAngle + offset) * 52
          const sy = this.player.y + Math.sin(this._brambleOrbitAngle + offset) * 52
          for (const e of this.weapon.enemyManager.enemies) {
            if (!alive(e) || Math.hypot(e.x - sx, e.y - sy) > 24 + (e.radius || 14)) continue
            const before = e.hp
            e.hit(dmg)
            if (e.hp < before) this._recordDamage(Math.min(before, before - e.hp))
            if (!e.active) { e._petDerivedKill = true; this.weapon._onKill(e) }
          }
        }
      }
    }

    // 万兽天灾灵能分影
    for (let i = this.spiritEchoes.length - 1; i >= 0; i--) {
      const se = this.spiritEchoes[i]
      se.life -= dt
      se.cooldown -= dt
      se.attackFx = Math.max(0, se.attackFx - dt)
      if (se.life <= 0) { this.spiritEchoes.splice(i, 1); continue }
      const target = this.nearest(se, this.player, 420, false)
      if (target) {
        se.angle = Math.atan2(target.y - se.y, target.x - se.x)
        const dist = Math.hypot(target.x - se.x, target.y - se.y)
        if (dist > 75) {
          se.x += Math.cos(se.angle) * Math.min(dist - 55, se.speed * dt)
          se.y += Math.sin(se.angle) * Math.min(dist - 55, se.speed * dt)
        } else if (se.cooldown <= 0) {
          se.cooldown = 0.6
          se.attackFx = 0.16
          const before = target.hp
          target.hit(se.power)
          if (target.hp < before) this._recordDamage(Math.min(before, before - target.hp))
          if (!target.active) { target._petDerivedKill = true; this.weapon._onKill(target) }
        }
      }
    }

    // 双生协奏 · 共生灵链与永恒星阵
    const linkActive = this.route === 'bond' || (this.routeBondSeedLevel > 0 && this.rallyTime > 0)
    if (linkActive) {
      this.bondLinkTick -= dt
      const alivePets = this.items.filter(p => p.hp > 0)
      const reach = Math.min(400, 280 + this.routeBondChainLevel * 15)
      const pairs = []
      for (const pet of alivePets) {
        if (Math.hypot(pet.x - this.player.x, pet.y - this.player.y) <= reach) {
          pairs.push({ a: this.player, b: pet, sub: false })
        }
      }
      if (this.routeBondChainLevel > 0) {
        for (let i = 0; i < alivePets.length; i++) {
          for (let j = i + 1; j < alivePets.length; j++) {
            if (Math.hypot(alivePets[i].x - alivePets[j].x, alivePets[i].y - alivePets[j].y) <= 240) {
              pairs.push({ a: alivePets[i], b: alivePets[j], sub: true })
            }
          }
        }
      }
      if (this.rallyTime > 0) {
        for (const b of this.game.enemyManager?._bullets || []) {
          if (!b.active || b.isBoss) continue
          if (pairs.some(pair => pointToSegmentDistSq(b.x, b.y, pair.a.x, pair.a.y, pair.b.x, pair.b.y) <= 18 * 18)) {
            b.active = false
          }
        }
      }
      if (this.bondLinkTick <= 0 && pairs.length) {
        this.bondLinkTick = 0.35
        const linkBase = this.weapon.damage * this.weapon.levelMul * 0.38 *
          (1 + Math.min(1.2, 0.15 + this.routeBondSeedLevel * 0.14) + 0.35 * petPowerBonus(this.level('pet_power'))) *
          (this.rallyTime > 0 ? 1.8 : 1) * this.endlessMultiplier
        const subScale = Math.min(0.9, 0.5 + this.routeBondChainLevel * 0.05)
        for (const e of this.weapon.enemyManager.enemies) {
          if (!alive(e)) continue
          let hitsOnEnemy = 0
          for (const pair of pairs) {
            if (hitsOnEnemy >= 2) break
            const rr = (this.rallyTime > 0 ? 12 : 8) + (e.radius || 14)
            if (pointToSegmentDistSq(e.x, e.y, pair.a.x, pair.a.y, pair.b.x, pair.b.y) <= rr * rr) {
              hitsOnEnemy++
              const before = e.hp
              e.hit(linkBase * (pair.sub ? subScale : 1))
              if (e.hp < before) this._recordDamage(Math.min(before, before - e.hp))
              if (alive(e) && !e.isBoss && !e.isEnraged) {
                e.petSlowTime = Math.max(e.petSlowTime || 0, 0.6)
                e.petSlowAmount = Math.max(e.petSlowAmount || 0, 0.25)
              }
              if (!e.active) { e._petDerivedKill = true; this.weapon._onKill(e); break }
            }
          }
        }
      }
    }

    if (this.route === 'bond' && this.rallyTime > 0) {
      if (this.routeBondSurgeLevel > 0) {
        this.bondSurgePulseTimer -= dt
        if (this.bondSurgePulseTimer <= 0) {
          this.bondSurgePulseTimer = 1.5
          this._castBondPulse(this.items.filter(p => p.hp > 0))
        }
      }
      if (this.routeUltimate === 'bond') {
        this.starDomainTimer -= dt
        if (this.starDomainTimer <= 0) {
          this.starDomainTimer = 1.0
          const targets = this.weapon.enemyManager.enemies
            .filter(e => alive(e) && Math.hypot(e.x - this.player.x, e.y - this.player.y) <= 220)
            .slice(0, 16)
          const pulseDmg = this.weapon.damage * this.weapon.levelMul * 0.9 * this.endlessMultiplier
          for (const e of targets) {
            const before = e.hp
            e.hit(pulseDmg)
            if (e.hp < before) this._recordDamage(Math.min(before, before - e.hp))
            if (!e.active) { e._petDerivedKill = true; this.weapon._onKill(e) }
          }
          for (const b of this.game.enemyManager?._bullets || []) {
            if (b.active && !b.isBoss && Math.hypot(b.x - this.player.x, b.y - this.player.y) <= 220) b.active = false
          }
          this.weapon._ring?.(this.player.x, this.player.y, '#c3a4dc', 220)
        }
      }
    }
  }

  update(dt) {
    this.sync()
    if (!this.available) return

    // 衰减全局计时器
    const wasRallying = this.rallyTime > 0
    this.rallyTime = Math.max(0, this.rallyTime - dt)
    if (wasRallying && this.rallyTime === 0 && this.routeUltimate === 'bond') {
      for (const pet of this.items) if (pet.hp > 0) pet.hp = Math.min(pet.maxHp, pet.hp + pet.maxHp * 0.35)
    }
    if (this.rallyTime === 0) this.rallyOverloaded = false
    this.rallyFlash = Math.max(0, this.rallyFlash - dt)
    this.rallyUnityBuffTimer = Math.max(0, this.rallyUnityBuffTimer - dt)
    this.playerShieldTimer = Math.max(0, this.playerShieldTimer - dt)
    if (this.playerShieldTimer === 0) this.playerShield = 0
    this.shieldGrantIcd = Math.max(0, (this.shieldGrantIcd || 0) - dt)
    this.dewBuffTimer = Math.max(0, this.dewBuffTimer - dt)
    this.weakenShieldIcd = Math.max(0, this.weakenShieldIcd - dt)
    this.mendCdIcd = Math.max(0, this.mendCdIcd - dt)
    this.rangerUltimateTimer = Math.max(0, this.rangerUltimateTimer - dt)
    this.rangerEscortTimer = Math.max(0, this.rangerEscortTimer - dt)
    this.rangerEscortIcd = Math.max(0, this.rangerEscortIcd - dt)
    this.rangerFocusIcd = Math.max(0, (this.rangerFocusIcd || 0) - dt)
    this.rangerInfuseIcd.spark = Math.max(0, this.rangerInfuseIcd.spark - dt)
    this.rangerInfuseIcd.spore = Math.max(0, this.rangerInfuseIcd.spore - dt)
    this.rangerInfuseIcd.ember = Math.max(0, (this.rangerInfuseIcd.ember || 0) - dt)
    this.brambleKillSpeedTimer = Math.max(0, this.brambleKillSpeedTimer - dt)
    this.beastCurseIcd = Math.max(0, this.beastCurseIcd - dt)
    this.bondAegisIcd = Math.max(0, this.bondAegisIcd - dt)
    this.bondRetalIcd = Math.max(0, this.bondRetalIcd - dt)
    this.bondVolleyIcd = Math.max(0, this.bondVolleyIcd - dt)
    if (this.beastFrenzyStacks > 0 && this.rallyTime <= 0) {
      this.beastFrenzyTimer -= dt
      if (this.beastFrenzyTimer <= 0) { this.beastFrenzyStacks = 0; this.beastFrenzyTimer = 0 }
    }

    for (let i = this.arcs.length - 1; i >= 0; i--) {
      this.arcs[i].life -= dt
      if (this.arcs[i].life <= 0) this.arcs.splice(i, 1)
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      this.beams[i].life -= dt
      if (this.beams[i].life <= 0) this.beams.splice(i, 1)
    }
    for (let i = this.monuments.length - 1; i >= 0; i--) {
      this.monuments[i].life -= dt
      if (this.monuments[i].life <= 0) this.monuments.splice(i, 1)
    }

    // 借灵游侠 · 甘露护盾抵消飞弹（1.2s 内冷）
    if (this.route === 'ranger' && this.items.some(p => p.hp > 0 && p.type === 'dew')) {
      this.rangerInfuseIcd.block = Math.max(0, (this.rangerInfuseIcd.block || 0) - dt)
      if (this.rangerInfuseIcd.block <= 0) {
        for (const p of this.weapon._projectiles || []) {
          if (!p.active) continue
          const hitB = (this.game.enemyManager?._bullets || []).find(b => b.active && !b.isBoss && Math.hypot(b.x - p.x, b.y - p.y) <= (b.radius || 6) + (p.radius || 6) + 4)
          if (hitB) { hitB.active = false; this.rangerInfuseIcd.block = 1.2; break }
        }
      }
    }

    this._updateHunterTactics(dt)
    this._updateGroundAndRoutes(dt)

    for (const pet of this.items) {
      if (!this.available) break
      pet.claims.clear()
      pet.supportCd = Math.max(0, pet.supportCd - dt)
      pet.supportActive = Math.max(0, pet.supportActive - dt)
      pet.supportFx = Math.max(0, pet.supportFx - dt)
      pet.cleaveIcd = Math.max(0, pet.cleaveIcd - dt)
      pet.bondIcd = Math.max(0, pet.bondIcd - dt)
      pet.shieldTimer = Math.max(0, (pet.shieldTimer || 0) - dt)
      if (pet.shieldTimer === 0) pet.shield = 0
      if (pet.supportFx === 0) pet.supportTargets = []
      if (pet.supportActive === 0) pet.taunted.clear()

      if (pet.down > 0) {
        pet.down = Math.max(0, pet.down - dt)
        if (pet.down === 0) {
          Object.assign(pet, this.formationPoint(pet.type))
          pet.hp = pet.maxHp
          pet.hurt = 0.8
          if (this.game?.bossTomes?.rank('pet_roster') === 3) pet.tomeReviveUntil = this.game.elapsed + 2
        }
        continue
      }

      pet.hurt = Math.max(0, pet.hurt - dt)
      pet.flash = Math.max(0, pet.flash - dt)
      pet.attackFx = Math.max(0, pet.attackFx - dt)
      pet.cooldown = Math.max(0, pet.cooldown - dt)
      pet.idle += dt
      if (pet.idle > 3) pet.hp = Math.min(pet.maxHp, pet.hp + dt * 0.45)

      // 刃棘滚滚 · 公转横扫（鼓舞）
      if (pet.orbitTimer > 0) {
        pet.orbitTimer -= dt
        pet.orbitTick -= dt
        pet.orbitAngle += dt * 6.5
        const targetPos = traceShadowPath(this.game, this.player, pet.orbitAngle, 95, 17)
        pet.x = targetPos.x; pet.y = targetPos.y
        pet.angle = pet.orbitAngle + Math.PI / 2
        if (pet.orbitTick <= 0) {
          pet.orbitTick = 0.25
          const mul = this.level('pet_awake_bramble') > 0 ? 1.15 : 0.8
          const dmg = this.attackDamage(pet) * mul
          for (const e of this.weapon.enemyManager.enemies) {
            if (!alive(e) || Math.hypot(e.x - pet.x, e.y - pet.y) > 40 + (e.radius || 14)) continue
            this.dealHit(pet, e, dmg, true, { derived: true })
            if (alive(e) && !e.isBoss) {
              const a = Math.atan2(e.y - this.player.y, e.x - this.player.x)
              const end = traceShadowPath(this.game, e, a, 16, e.radius || 14)
              e.x = end.x; e.y = end.y
            }
          }
        }
        continue
      }

      // 刃棘滚滚 · 棘刺风暴特技
      if (pet.spinTimer > 0) {
        pet.spinTimer -= dt
        pet.spinTick -= dt
        pet.angle += dt * 16
        if (pet.spinTick <= 0) {
          pet.spinTick = 0.5
          const radius = 75 * this.synergies.aoeMul
          const dmg = this.attackDamage(pet) * 0.9
          const hits = this.weapon.enemyManager.enemies
            .filter(e => alive(e) && Math.hypot(e.x - pet.x, e.y - pet.y) <= radius)
            .slice(0, 6)
          for (const e of hits) this.dealHit(pet, e, dmg, true, { derived: true })
          this.weapon._ring?.(pet.x, pet.y, '#74d680', radius)
        }
        if (pet.spinTimer <= 0) {
          const dmg = this.attackDamage(pet) * 0.85
          for (let i = 0; i < 8; i++) {
            this.launchShot(pet, null, dmg, 0, { angle: (i * TAU) / 8, speed: 520, pierces: 1, derived: true })
          }
        }
        continue
      }

      // 刃棘滚滚 · 冲滚穿刺普攻
      if (pet.rollDash) {
        const dash = pet.rollDash
        const step = Math.min(dash.remaining, dash.speed * dt)
        const prevX = pet.x, prevY = pet.y
        const next = traceShadowPath(this.game, pet, Math.atan2(dash.dy, dash.dx), step, 17)
        const moved = Math.hypot(next.x - prevX, next.y - prevY)
        pet.x = next.x; pet.y = next.y
        dash.remaining -= step
        for (const e of this.weapon.enemyManager.enemies) {
          if (dash.hitTargets.size >= dash.pierceLimit) break
          if (!alive(e) || dash.hitTargets.has(e)) continue
          const hitR = 24 + (e.radius || 14)
          if (pointToSegmentDistSq(e.x, e.y, prevX, prevY, pet.x, pet.y) <= hitR * hitR) {
            dash.hitTargets.add(e)
            this.dealHit(pet, e, dash.damage, this.rallyTime > 0, { derived: dash.hitTargets.size > 1 })
          }
        }
        if (dash.remaining <= 0.5 || (step > 1 && moved < 0.5)) {
          pet.rollDash = null
          if (this.level('pet_awake_bramble') > 0) {
            for (let i = 0; i < 4; i++) {
              this.launchShot(pet, null, dash.damage * 0.55, 0, { angle: pet.angle + (i * TAU) / 4, speed: 480, pierces: 1, derived: true })
            }
          }
        }
        continue
      }

      // 电光叽叽 · 高压电弧链周期电击
      if (pet.type === 'spark' && pet.supportActive > 0) {
        if ((pet._tetherTick = (pet._tetherTick || 0) - dt) <= 0) {
          pet._tetherTick = 0.28
          const anchors = [{ a: this.player, b: pet }]
          if (this.level('pet_awake_spark') > 0) {
            const ally = this.items.filter(other => other !== pet && other.hp > 0)
              .sort((a, b) => Math.hypot(a.x - pet.x, a.y - pet.y) - Math.hypot(b.x - pet.x, b.y - pet.y))[0]
            if (ally) anchors.push({ a: pet, b: ally })
          }
          const dmg = this.attackDamage(pet) * 0.65
          for (const seg of anchors) {
            for (const e of this.weapon.enemyManager.enemies) {
              if (!alive(e)) continue
              const rr = 14 + (e.radius || 14)
              if (pointToSegmentDistSq(e.x, e.y, seg.a.x, seg.a.y, seg.b.x, seg.b.y) <= rr * rr) {
                this.dealHit(pet, e, dmg, this.rallyTime > 0, { derived: true })
                if (alive(e) && !e.isBoss && !e.isEnraged) {
                  e.petSlowTime = Math.max(e.petSlowTime || 0, 0.5)
                  e.petSlowAmount = Math.max(e.petSlowAmount || 0, 0.3)
                }
              }
            }
          }
        }
      }

      if (pet.support) {
        pet.support.time -= dt
        if (pet.support.time <= 0) { pet.support = null; this.finishSupport(pet) }
        continue
      }
      if (pet.attack) {
        pet.attack.time -= dt
        if (pet.attack.time <= 0) { const attack = pet.attack; pet.attack = null; this.strike(pet, attack) }
        continue
      }
      if (this.beginSupport(pet)) continue

      const recall = Math.hypot(pet.x - this.player.x, pet.y - this.player.y) > 540
      pet.retarget -= dt
      if (!alive(pet.target) || Math.hypot(pet.target.x - this.player.x, pet.target.y - this.player.y) > 620) pet.target = null
      if (pet.retarget <= 0) { pet.target = this.nearest(pet); pet.retarget = 0.25 }
      const following = recall || !pet.target
      const target = following ? this.formationPoint(pet.type) : pet.target
      const distance = Math.hypot(target.x - pet.x, target.y - pet.y)
      pet.angle = Math.atan2(target.y - pet.y, target.x - pet.x)
      const def = PET_TYPES[pet.type] || PET_TYPES.guardian
      if (!following && distance < def.range && shadowLineClear(this.game, pet, target)) {
        if (pet.cooldown <= 0) {
          const windup = def.windup / this.attackRate
          pet.attack = { target, time: windup, maxTime: windup }
          pet.cooldown = def.interval / this.attackRate
        }
      } else {
        const speed = def.speed * this.moveScale
        const followDistance = following ? 5 : def.follow
        if (distance > followDistance) {
          Object.assign(pet, traceShadowPath(this.game, pet, pet.angle, Math.min(distance - followDistance, speed * dt)))
        }
      }
    }

    this.spreadOut(dt)
    this.updateShots(dt)
  }

  spreadOut(dt) {
    const pets = this.items.filter(p => p.hp > 0 && !p.rollDash && p.orbitTimer <= 0)
    for (let i = 0; i < pets.length; i++) {
      for (let j = i + 1; j < pets.length; j++) {
        const a = pets[i], b = pets[j]
        const distance = Math.hypot(b.x - a.x, b.y - a.y)
        if (distance >= 40) continue
        const angle = distance > 0.01 ? Math.atan2(b.y - a.y, b.x - a.x) : (a.id + b.id) * 1.7
        const step = Math.min((40 - distance) / 2, 90 * dt)
        Object.assign(a, traceShadowPath(this.game, a, angle + Math.PI, step))
        Object.assign(b, traceShadowPath(this.game, b, angle, step))
      }
    }
  }

  renderGround(ctx) {
    if (!this.available) return
    renderPetGround(ctx, this, this.game.elapsed)
  }

  render(ctx) {
    if (!this.available) return
    renderPetEffects(ctx, this, this.game.elapsed)
    for (const pet of this.items.slice().sort((a, b) => a.y - b.y)) {
      renderPet(ctx, pet, this.recovery, this.game.elapsed, this.rallyTime, this.route)
    }
    for (const se of this.spiritEchoes) {
      renderPet(ctx, { ...se, id: 99, down: 0, hp: 1, maxHp: 1, hurt: 0, flash: 0, support: null, supportFx: 0, supportActive: 0, isEcho: true }, this.recovery, this.game.elapsed, this.rallyTime, 'beast')
    }
    for (const shot of this.shots) renderPetShot(ctx, shot)
    this.renderSupportMarks(ctx)
  }

  renderSupportMarks(ctx) {
    ctx.save()
    ctx.lineWidth = 1.5
    for (const enemy of this.weapon.enemyManager.enemies) {
      if (!alive(enemy)) continue
      const taunted = this.isTaunted(enemy)
      const weakened = enemy.petWeakenTime > 0
      const marked = enemy.petMarkTime > 0 || enemy.petBeastMarkTime > 0
      const frost = enemy.petFrostStacks > 0
      if (!taunted && !weakened && !marked && !frost) continue
      const y = enemy.y - enemy.radius - 8
      const marks = [
        ...(taunted ? ['taunt'] : []),
        ...(weakened ? ['weaken'] : []),
        ...(marked ? ['mark'] : []),
        ...(frost ? ['frost'] : []),
      ]
      for (const [index, kind] of marks.entries()) {
        const x = enemy.x + (index - (marks.length - 1) / 2) * 14
        ctx.strokeStyle = kind === 'taunt' ? '#edc479' : kind === 'mark' ? '#ffd166' : kind === 'frost' ? '#9ad9ff' : '#8edacb'
        ctx.fillStyle = 'rgba(9,20,16,.85)'
        ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill(); ctx.stroke()
        ctx.beginPath()
        if (kind === 'taunt') { ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 1) }
        else if (kind === 'mark') { ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y); ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3) }
        else if (kind === 'frost') { ctx.moveTo(x - 2.5, y - 2.5); ctx.lineTo(x + 2.5, y + 2.5); ctx.moveTo(x + 2.5, y - 2.5); ctx.lineTo(x - 2.5, y + 2.5) }
        else { ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3); ctx.moveTo(x - 2, y + 1); ctx.lineTo(x, y + 3); ctx.lineTo(x + 2, y + 1) }
        ctx.stroke()
        if (kind === 'taunt') { ctx.fillStyle = '#edc479'; ctx.beginPath(); ctx.arc(x, y + 3, 0.8, 0, TAU); ctx.fill() }
      }
    }
    ctx.restore()
  }
}

function frostCritOrZero(v) { return v > 0 ? v : 0 }
