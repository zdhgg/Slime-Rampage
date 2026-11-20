import { GameplayController } from './GameplayController.js'
import { Particle } from '../effects/Particle.js'
import { FloatingText } from '../effects/FloatingText.js'
import { RunnerDirector } from './runner/RunnerDirector.js'
import { RunnerRenderer } from './runner/RunnerRenderer.js'
import {
  RUNNER_BOSS_RELICS,
  RUNNER_BULLET_SPEED,
  RUNNER_CHARGE_GATE_THRESHOLDS,
  RUNNER_COLLISION_DEPTH,
  RUNNER_COUNTDOWN,
  RUNNER_DAMAGE_AGGREGATE_WINDOW,
  RUNNER_DODGE_WINDOW,
  RUNNER_ENEMY_ATTACK_GAP,
  RUNNER_ENTITY_TYPES,
  RUNNER_FEVER_DURATION,
  RUNNER_FEVER_MAX_CHARGES,
  RUNNER_FEVER_SCORE_MULTIPLIER,
  RUNNER_FEVER_SHARDS_PER_CHARGE,
  RUNNER_FIRE_INTERVAL,
  RUNNER_FORK_CLEAR_DEPTH,
  RUNNER_FORK_SELECT_DEPTH,
  RUNNER_HEAT_PACTS,
  RUNNER_KINETIC_TRIGGERS,
  RUNNER_LANE_COMMIT_EPSILON,
  RUNNER_LANE_COUNT,
  RUNNER_LANE_LERP_PER_FRAME,
  RUNNER_MAX_ATTACK,
  RUNNER_MAX_BULLETS,
  RUNNER_MAX_CATCH_UP_SHOTS,
  RUNNER_MAX_CLONES,
  RUNNER_MAX_DAMAGE_NUMBERS,
  RUNNER_MAX_ENEMY_PROJECTILES,
  RUNNER_MAX_GROUND_FIRES,
  RUNNER_MAX_HP,
  RUNNER_MAX_KINETICS,
  RUNNER_MAX_MINES,
  RUNNER_MAX_MODULES,
  RUNNER_MAX_SHIELD,
  RUNNER_MAX_TERRAINS,
  RUNNER_MUTATION_ARM_DEPTH,
  RUNNER_PLAYER_DEPTH,
  RUNNER_RAPID_DURATION,
  RUNNER_RAPID_MULTIPLIER,
  RUNNER_REROLL_CREDIT_COST,
  RUNNER_ROUTES,
  RUNNER_ROUTE_IDS,
  RUNNER_SCORE_MILESTONES,
  RUNNER_SECONDARY_ELEMENTS,
  RUNNER_SECONDARY_ELEMENT_IDS,
  RUNNER_STARTER_CHIPS,
  RUNNER_STRAINS,
  RUNNER_SUBMODES,
  RUNNER_TACTICAL_ITEMS,
  RUNNER_TERRAIN_TYPES,
  RUNNER_WEAPON_CORES,
  RUNNER_WEAPON_CORE_IDS,
  RUNNER_WEAPON_MODULE_IDS,
  createRunnerSeed,
  getRunnerBossSchedule,
  getRunnerCollapseSchedule,
  getRunnerForkTimes,
  getRunnerFusionCodex,
  getRunnerFusionWeapon,
  getRunnerKineticTrigger,
  getRunnerRoute,
  getRunnerRouteByLane,
  getRunnerSection,
  getRunnerStarterChip,
  getRunnerStrain,
  getRunnerStyleRank,
  getRunnerSubmode,
  getRunnerWeaponCore,
  getRunnerWeaponModule,
  runnerDistanceRemaining,
  runnerProgress,
} from './runner/RunnerRules.js'
import { findRunnerEffect, getRunnerBulletProfile, planRunnerEffects } from './runner/RunnerEffects.js'

const HIT_RING_LIFE = 0.22
const COMBO_WINDOW = 2.0
const CORE_RING_COLORS = {
  pierce: 'rgba(121, 217, 238, ALPHA)',
  burst: 'rgba(240, 179, 95, ALPHA)',
  corrosion: 'rgba(155, 223, 106, ALPHA)',
  spread: 'rgba(255, 158, 187, ALPHA)',
  beam: 'rgba(147, 197, 253, ALPHA)',
}

const ATTACK_PRIMARY = 'primary'
const ATTACK_SECONDARY = 'secondary'
const canProcModule = (source) => source?.provenance === ATTACK_PRIMARY

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const formatTime = (seconds) => {
  const total = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const formatElapsedTime = (seconds) => {
  const total = Math.max(0, Math.floor(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * 极速突围：全维度重构版三线动作肉鸽跑酷系统。
 */
export class RunnerGameplay extends GameplayController {
  constructor() {
    super('runner')
    this.renderer = new RunnerRenderer(this)
    this.director = new RunnerDirector()

    this.entities = []
    this.bullets = []
    this.enemyProjectiles = []
    this.rings = []
    this.particles = []
    this.floatingTexts = []
    this.damageNumbers = []
    this.groundFires = []
    this.terrains = []
    this.mines = []
    this.clones = []

    this.submode = 'marathon'
    this.submodeConfig = getRunnerSubmode('marathon')
    this.duration = this.submodeConfig.duration

    this.strainId = 'origin'
    this.strain = getRunnerStrain('origin')
    this.chipId = null
    this.chip = null
    this.pacts = []

    this.state = 'countdown'
    this.outcome = null
    this.countdown = RUNNER_COUNTDOWN
    this.elapsedTime = 0
    this.visualTime = 0
    this.scrollDistance = 0
    this.currentLane = 1
    this.targetLane = 1
    this.lanePosition = 1
    this.hp = RUNNER_MAX_HP
    this.maxHp = RUNNER_MAX_HP
    this.shield = 0
    this.maxShield = RUNNER_MAX_SHIELD
    this.attackDamage = 1
    this.rapidFireTimer = 0
    this.switchRapidTimer = 0
    this.dodgeOverdriveTimer = 0
    this.shieldRegenTimer = 0

    // 四维构筑状态
    this.weaponCore = null
    this.secondaryElement = null
    this.weaponLevel = 0
    this.elementLevel = 0
    this.modules = []
    this.weaponModule = null
    this.kinetics = []
    this.relics = []

    // 经验驱动升级与暂停抽卡状态
    this.autoDraftOnXp = true
    this.xp = 0
    this.xpToNext = 28
    this.level = 1
    this.pendingDraft = null
    this._pendingBossRelics = 0
    this.freeRerolls = 0
    this.bountyCredits = 0
    this.nextMilestoneIndex = 0

    // 旧赛道门兼容态
    this.weaponChoicePending = false
    this.secondaryChoicePending = false
    this.moduleChoicePending = false
    this._moduleChoiceTriggered = false
    this._moduleChoiceRowId = 0

    this.weaponNotice = ''
    this.weaponNoticeTimer = 0
    this.fusionPresentation = null
    this.fusionPulse = 0

    // 积分与技巧段位
    this.score = 0
    this.kills = 0
    this.gates = 0
    this.hitsTaken = 0
    this.damageTaken = 0
    this.shieldAbsorbed = 0
    this.perfectDodges = 0
    this.combo = 0
    this.bestCombo = 0
    this.comboTimer = 0
    this.stylePoints = 0
    this.styleGraceTimer = 0
    this.bestStyleRank = 'C'

    this.weaponStats = {
      pierced: 0,
      explosions: 0,
      corrosionStacks: 0,
      splits: 0,
      ricochets: 0,
      splinterCount: 0,
      maxProcDepth: 0,
      crossPrisms: 0,
      minesDetonated: 0,
      voidPulls: 0,
    }

    this.section = getRunnerSection(0)
    this.sectionNotice = 0
    this.currentRouteId = null
    this.nextForkIndex = 0
    this.activeForkId = null
    this.routeLog = []
    this._resolvedForkIds = new Set()

    // 地形与塌陷状态
    this.laneCollapse = null
    this.nextCollapseIndex = 0
    this.onAccelStrip = false
    this.onMireStrip = false
    this.collapseHurtCooldown = 0

    // 阶段守关 Boss
    this.nextBossIndex = 0
    this.activeBossGroupId = null
    this.bossDefeatedCount = 0

    this.damageFlash = 0
    this.shieldFlash = 0
    this.feverShards = 0
    this.feverCharges = 0
    this.maxFeverCharges = RUNNER_FEVER_MAX_CHARGES
    this.feverTimer = 0
    this.feverCount = 0
    this.jumpTimer = 0
    this.jumpDuration = 0.55
    this._prevJump = false
    this.bulletTimeTimer = 0
    this.hyperBoostTimer = 0
    this.droneTimer = 0
    this.droneLane = 0
    this.tacticalStats = { magnets: 0, bulletTimes: 0, boosters: 0, drones: 0, barrels: 0, crystals: 0, switches: 0 }
    this.reducedMotion = false

    this._seed = createRunnerSeed()
    this._encounterTimer = 0
    this._terrainTimer = 4.5
    this._fireCooldown = 0
    this._cloneFireCooldown = 0
    this._lanePulseCooldown = 0
    this._prevLeft = false
    this._prevRight = false
    this._shakeTime = 0
    this._shakeDuration = 0
    this._shakeMagnitude = 0
    this._finishSent = false
    this._weaponChoiceTriggered = false
    this._secondaryChoiceTriggered = false
    this._weaponEvolved = false
    this._weaponOverdrive = false
    this._choiceRowId = 0
    this._secondaryChoiceRowId = 0
    this._shotSerial = 0
    this._nextEnemyProjectileId = 1
    this._enemyAttackCooldown = 0
    this._lastLaneSwitchAt = -Infinity
    this._lastDodgeAt = -Infinity
  }

  attach(game) {
    super.attach(game)
    this.renderer.ensureLayout()
    this.reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  }

  usesArenaFramePipeline() {
    return false
  }

  get isSwitching() {
    return Math.abs(this.lanePosition - this.targetLane) > RUNNER_LANE_COMMIT_EPSILON
  }

  get occupiedLane() {
    return clamp(Math.round(this.lanePosition), 0, RUNNER_LANE_COUNT - 1)
  }

  get isFeverActive() {
    return this.feverTimer > 0
  }

  get worldTimeScale() {
    if (this.bulletTimeTimer > 0) return RUNNER_TACTICAL_ITEMS.bullet_time.dilation
    if (this.isFeverActive && this.strainId === 'shadow') return 0.45
    return 1
  }

  get fusionWeapon() {
    return getRunnerFusionWeapon(this.weaponCore, this.secondaryElement)
  }

  get moduleWeapon() {
    const primary = this.modules[0]
    if (primary) return getRunnerWeaponModule(primary.id, primary.level)
    return getRunnerWeaponModule(this.weaponModule)
  }

  get buildProfile() {
    const modulesList = this.modules.length
      ? this.modules.map((m) => getRunnerWeaponModule(m.id, m.level)).filter(Boolean)
      : this.weaponModule
      ? [getRunnerWeaponModule(this.weaponModule)].filter(Boolean)
      : []
    return {
      fusion: this.fusionWeapon,
      module: modulesList[0] || null,
      modules: modulesList,
      kinetics: this.kinetics.map((k) => getRunnerKineticTrigger(k.id, k.level)).filter(Boolean),
    }
  }

  get currentRoute() {
    return getRunnerRoute(this.currentRouteId)
  }

  get routeSpawnIntervalScale() {
    return this.currentRoute?.spawnIntervalMultiplier ?? 1
  }

  get pactModifiers() {
    let speedMul = 1
    let hpMul = 1
    let telegraphMul = 1
    let rewardBonus = 0
    for (const pactId of this.pacts) {
      const pact = RUNNER_HEAT_PACTS[pactId]
      if (!pact) continue
      if (pact.speedMul) speedMul *= pact.speedMul
      if (pact.hpMul) hpMul *= pact.hpMul
      if (pact.telegraphMul) telegraphMul *= pact.telegraphMul
      if (pact.rewardBonus) rewardBonus += pact.rewardBonus
    }
    return { speedMul, hpMul, telegraphMul, rewardBonus }
  }

  get totalScoreMultiplier() {
    const routeMul = this.currentRoute?.scoreMultiplier || 1
    const chipMul = 1 + (this.chip?.scoreBonus || 0)
    const pactMul = 1 + this.pactModifiers.rewardBonus
    const styleMul = getRunnerStyleRank(this.stylePoints).multiplier
    const feverMul = this.isFeverActive ? RUNNER_FEVER_SCORE_MULTIPLIER : 1
    return routeMul * chipMul * pactMul * styleMul * feverMul
  }

  get bossParts() {
    return this.entities.filter((e) => e.active && e.boss)
  }

  get isBossActive() {
    return this.bossParts.length > 0
  }

  _updateTacticalBuffs(dt) {
    this.bulletTimeTimer = Math.max(0, this.bulletTimeTimer - dt)
    this.hyperBoostTimer = Math.max(0, this.hyperBoostTimer - dt)
    this.droneTimer = Math.max(0, this.droneTimer - dt)
    this.switchRapidTimer = Math.max(0, this.switchRapidTimer - dt)
    this.dodgeOverdriveTimer = Math.max(0, this.dodgeOverdriveTimer - dt)
    this._lanePulseCooldown = Math.max(0, this._lanePulseCooldown - dt)
    this.collapseHurtCooldown = Math.max(0, this.collapseHurtCooldown - dt)
    if (this.strain.shieldRegenInterval && this.shield < this.maxShield) {
      this.shieldRegenTimer += dt
      if (this.shieldRegenTimer >= this.strain.shieldRegenInterval) {
        this.shieldRegenTimer = 0
        this.shield = Math.min(this.maxShield, this.shield + 1)
        this.shieldFlash = 0.6
      }
    }
  }

  _pushGroundFire(lane, depth, duration, damage) {
    while (this.groundFires.length >= RUNNER_MAX_GROUND_FIRES) {
      this.groundFires.shift()
    }
    this.groundFires.push({
      id: this.groundFires.length + 1,
      lane,
      depth,
      duration,
      maxDuration: duration,
      damage,
    })
  }

  reset(seed, options = this.submode || 'marathon') {
    this._seed = createRunnerSeed(seed)
    this.director.reset(this._seed)
    this.entities.length = 0
    this.bullets.length = 0
    this.enemyProjectiles.length = 0
    this.rings.length = 0
    this.particles.length = 0
    this.floatingTexts.length = 0
    this.damageNumbers.length = 0
    this.groundFires.length = 0
    this.terrains.length = 0
    this.mines.length = 0
    this.clones.length = 0

    const cfg = typeof options === 'string' ? { submode: options } : (options || {})
    this.submode = cfg.submode || 'marathon'
    this.submodeConfig = getRunnerSubmode(this.submode)
    this.duration = this.submodeConfig.duration

    this.strainId = RUNNER_STRAINS[cfg.strainId] ? cfg.strainId : 'origin'
    this.strain = getRunnerStrain(this.strainId)
    this.chipId = RUNNER_STARTER_CHIPS[cfg.chipId] ? cfg.chipId : null
    this.chip = getRunnerStarterChip(this.chipId)
    this.pacts = Array.isArray(cfg.pacts)
      ? [...new Set(cfg.pacts.filter((id) => !!RUNNER_HEAT_PACTS[id]))]
      : []

    this.state = 'countdown'
    this.outcome = null
    this.countdown = RUNNER_COUNTDOWN
    this.elapsedTime = 0
    this.visualTime = 0
    this.scrollDistance = 0
    this.currentLane = 1
    this.targetLane = 1
    this.lanePosition = 1
    this.hp = this.strain.hp || RUNNER_MAX_HP
    this.maxHp = this.strain.hp || RUNNER_MAX_HP
    this.shield = this.strainId === 'elemental' ? 1 : 0
    this.maxShield = this.strain.maxShield || RUNNER_MAX_SHIELD
    this.attackDamage = 1
    this.rapidFireTimer = 0
    this.switchRapidTimer = 0
    this.dodgeOverdriveTimer = 0
    this.shieldRegenTimer = 0

    this.weaponCore = null
    this.secondaryElement = null
    this.weaponLevel = 0
    this.elementLevel = 0
    this.modules = []
    this.weaponModule = null
    this.kinetics = []
    this.relics = []

    this.xp = 0
    this.xpToNext = 28
    this.level = 1
    this.pendingDraft = null
    this._pendingBossRelics = 0
    this.freeRerolls = 0
    this.bountyCredits = 0
    this.nextMilestoneIndex = 0

    this.weaponChoicePending = false
    this.secondaryChoicePending = false
    this.moduleChoicePending = false
    this._moduleChoiceTriggered = false
    this._moduleChoiceRowId = 0
    this.weaponNotice = ''
    this.weaponNoticeTimer = 0
    this.fusionPresentation = null
    this.fusionPulse = 0

    this.score = 0
    this.kills = 0
    this.gates = 0
    this.hitsTaken = 0
    this.damageTaken = 0
    this.shieldAbsorbed = 0
    this.perfectDodges = 0
    this.combo = 0
    this.bestCombo = 0
    this.comboTimer = 0
    this.stylePoints = 0
    this.styleGraceTimer = 0
    this.bestStyleRank = 'C'

    this.weaponStats = {
      pierced: 0,
      explosions: 0,
      corrosionStacks: 0,
      splits: 0,
      ricochets: 0,
      splinterCount: 0,
      maxProcDepth: 0,
      crossPrisms: 0,
      minesDetonated: 0,
      voidPulls: 0,
    }
    this.section = getRunnerSection(0, this.submode)
    this.sectionNotice = 1.8
    this.currentRouteId = null
    this.nextForkIndex = 0
    this.activeForkId = null
    this.routeLog = []
    this._resolvedForkIds = new Set()

    this.laneCollapse = null
    this.nextCollapseIndex = 0
    this.onAccelStrip = false
    this.onMireStrip = false
    this.collapseHurtCooldown = 0

    this.nextBossIndex = 0
    this.activeBossGroupId = null
    this.bossDefeatedCount = 0

    this.damageFlash = 0
    this.shieldFlash = 0
    this.feverShards = 0
    this.feverCharges = 0
    this.maxFeverCharges = RUNNER_FEVER_MAX_CHARGES
    this.feverTimer = 0
    this.feverCount = 0
    this.jumpTimer = 0
    this.jumpDuration = 0.55
    this._prevJump = false
    this.bulletTimeTimer = 0
    this.hyperBoostTimer = 0
    this.droneTimer = 0
    this.droneLane = 0
    this.tacticalStats = { magnets: 0, bulletTimes: 0, boosters: 0, drones: 0, barrels: 0, crystals: 0, switches: 0 }

    this._encounterTimer = 0
    this._terrainTimer = 4.5
    this._fireCooldown = 0
    this._cloneFireCooldown = 0
    this._lanePulseCooldown = 0
    this._prevLeft = false
    this._prevRight = false
    this._shakeTime = 0
    this._shakeDuration = 0
    this._shakeMagnitude = 0
    this._finishSent = false
    this._weaponChoiceTriggered = false
    this._secondaryChoiceTriggered = false
    this._weaponEvolved = false
    this._weaponOverdrive = false
    this._choiceRowId = 0
    this._secondaryChoiceRowId = 0
    this._shotSerial = 0
    this._nextEntityProjectileId = 1
    this._nextEnemyProjectileId = 1
    this._enemyAttackCooldown = 0
    this._lastLaneSwitchAt = -Infinity
    this._lastDodgeAt = -Infinity

    // 战前开局被动落位（不扰动 Director 遭遇 RNG 序列太剧烈：使用极少确定性抽签）
    if (this.strainId === 'elemental') {
      const idx = this._seed % RUNNER_SECONDARY_ELEMENT_IDS.length
      this.secondaryElement = RUNNER_SECONDARY_ELEMENT_IDS[idx]
      this.elementLevel = 1
    }
    if (this.chipId === 'mystery_pioneer') {
      const idx = (this._seed >>> 4) % RUNNER_WEAPON_CORE_IDS.length
      this.weaponCore = RUNNER_WEAPON_CORE_IDS[idx]
      this.weaponLevel = 1
    }

    return this
  }

  restart(seed, options = this.submode) {
    return this.reset(seed, options)
  }

  updateWorld(dt) {
    if (!this.game || dt <= 0 || this.state === 'finished') return
    if (this.pendingDraft) return

    this.visualTime += dt
    if (this.jumpTimer > 0) {
      this.jumpTimer = Math.max(0, this.jumpTimer - dt)
      if (this.jumpTimer === 0) this._onJumpLand()
    }
    this._updateEffects(dt)
    this._updateLaneInput(dt)

    if (this.state === 'countdown') {
      this.countdown = Math.max(0, this.countdown - dt)
      if (this.countdown <= 0) {
        this.state = 'active'
        this.sectionNotice = 1.8
      }
      return
    }

    if (this.duration !== Infinity) {
      this.elapsedTime = Math.min(this.duration, this.elapsedTime + dt)
    } else {
      this.elapsedTime += dt
    }
    this.rapidFireTimer = Math.max(0, this.rapidFireTimer - dt)
    this.feverTimer = Math.max(0, this.feverTimer - dt)
    this._updateTacticalBuffs(dt)
    this.sectionNotice = Math.max(0, this.sectionNotice - dt)
    this.weaponNoticeTimer = Math.max(0, this.weaponNoticeTimer - dt)
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.6)
    this.shieldFlash = Math.max(0, this.shieldFlash - dt * 3.2)
    this._shakeTime = Math.max(0, this._shakeTime - dt)
    this._enemyAttackCooldown = Math.max(0, this._enemyAttackCooldown - dt)

    if (this.state === 'active' && this.game.input.consumeFever?.()) {
      this.activateFever()
    }

    if (this.comboTimer > 0) {
      this.comboTimer -= dt
      if (this.comboTimer <= 0) this.combo = 0
    }
    if (this.styleGraceTimer > 0) {
      this.styleGraceTimer -= dt
    } else if (this.stylePoints > 0) {
      this.stylePoints = Math.max(0, this.stylePoints - dt * 3.5)
    }

    const nextSection = getRunnerSection(this.elapsedTime, this.submode)
    if (nextSection.id !== this.section.id) {
      this.section = nextSection
      this.sectionNotice = 2.2
      this.game.sound.wave?.()
    } else {
      this.section = nextSection
    }

    this._updateCollapseSchedule(dt)
    this._updateBossSchedule()
    this._updateForkSchedule()
    this._updateDirector(dt)

    const worldDt = dt * this.worldTimeScale
    const speedMul = this.pactModifiers.speedMul
    this.scrollDistance += (this.section?.advanceSpeed || 0.17) * speedMul * worldDt

    this._updateTerrains(worldDt * speedMul)
    this._updateEntities(worldDt * speedMul)
    this._updateBossActions(worldDt)
    this._updateMines(worldDt * speedMul)
    this._updateClones(dt)
    this._updateEnemyProjectiles(worldDt * speedMul)
    if (this.state !== 'active') return
    this._updateGroundFires(worldDt)
    this._updateShooting(dt)
    this._checkCollapsePenalty()

    if (this.duration !== Infinity && this.elapsedTime >= this.duration) {
      this._finish('victory')
    }
  }

  changeLane(direction) {
    if (this.state !== 'active' || this.pendingDraft || this.game?.input?.suspended || (direction !== -1 && direction !== 1)) return false
    const nextLane = clamp(this.targetLane + direction, 0, RUNNER_LANE_COUNT - 1)
    if (nextLane === this.targetLane) return false
    const oldLane = this.occupiedLane
    this.targetLane = nextLane
    this._onLaneSwitchStarted(oldLane, nextLane)
    return true
  }

  jump(customDuration = 0.55) {
    if (this.state !== 'active' || this.pendingDraft || this.isJumping) return false
    this.jumpDuration = customDuration
    this.jumpTimer = customDuration
    this.floatingTexts.push(
      new FloatingText(
        this.renderer.lanePositionX(this.lanePosition),
        this.renderer.playerY - 45,
        customDuration > 0.7 ? 'SUPER JUMP!' : 'JUMP!',
        '',
        '#79d5e6',
        14
      )
    )
    this.game?.sound?.dash?.()
    if (this.strainId === 'shadow') {
      this._triggerShadowSlash(this.occupiedLane)
    }
    return true
  }

  get isJumping() {
    return this.jumpTimer > 0
  }

  get jumpOffset() {
    if (this.jumpTimer <= 0) return 0
    const progress = 1 - this.jumpTimer / this.jumpDuration
    const peak = this.jumpDuration > 0.7 ? 64 : 48
    return Math.sin(progress * Math.PI) * peak
  }

  _updateLaneInput(dt) {
    const input = this.game.input.state
    const left = !!input.left
    const right = !!input.right
    if (left && !this._prevLeft && !this.pendingDraft) {
      const next = Math.max(0, this.targetLane - 1)
      if (next !== this.targetLane) {
        const old = this.occupiedLane
        this.targetLane = next
        this._onLaneSwitchStarted(old, next)
      }
    }
    if (right && !this._prevRight && !this.pendingDraft) {
      const next = Math.min(RUNNER_LANE_COUNT - 1, this.targetLane + 1)
      if (next !== this.targetLane) {
        const old = this.occupiedLane
        this.targetLane = next
        this._onLaneSwitchStarted(old, next)
      }
    }
    this._prevLeft = left
    this._prevRight = right
    const up = !!input.up
    if (up && !this._prevJump && !this.isJumping && this.state === 'active' && !this.pendingDraft) {
      this.jump()
    }
    this._prevJump = up

    let lerpRate = RUNNER_LANE_LERP_PER_FRAME * (this.strain.laneSpeedMul || 1)
    if (this.onMireStrip) lerpRate *= RUNNER_TERRAIN_TYPES.mire.laneSpeedMul
    lerpRate = clamp(lerpRate, 0.12, 0.85)
    const k = this.reducedMotion ? 1 : 1 - Math.pow(1 - lerpRate, dt * 60)
    this.lanePosition += (this.targetLane - this.lanePosition) * k
    if (Math.abs(this.lanePosition - this.targetLane) <= RUNNER_LANE_COMMIT_EPSILON) {
      if (this.currentLane !== this.targetLane) {
        this._lastLaneSwitchAt = this.visualTime
      }
      this.lanePosition = this.targetLane
      this.currentLane = this.targetLane
    }
  }

  _onLaneSwitchStarted(oldLane, newLane) {
    if (this.strain.switchRapidDuration) {
      this.switchRapidTimer = this.strain.switchRapidDuration
    }
    if (this.strainId === 'summoner') {
      this.droneLane = newLane === 0 ? 1 : newLane === 2 ? 1 : 0
    }
    const pulseKin = this._getKinetic('lane_pulse')
    if (pulseKin && this._lanePulseCooldown <= 0 && this.bullets.length < RUNNER_MAX_BULLETS) {
      this._lanePulseCooldown = pulseKin.cooldown
      const b = this._createBullet(newLane)
      b.damageMultiplier *= pulseKin.damageMul
      b.remainingHits = Math.max(b.remainingHits, 2)
      b.size *= 1.35
      b.color = pulseKin.color
      this.bullets.push(b)
    }
    const cloneKin = this._getKinetic('lane_clone')
    if (cloneKin) {
      while (this.clones.length >= RUNNER_MAX_CLONES) this.clones.shift()
      this.clones.push({
        lane: oldLane,
        duration: cloneKin.duration,
        maxDuration: cloneKin.duration,
        fireRatio: cloneKin.fireRatio,
      })
    }
  }

  _onJumpLand() {
    const slam = this._getKinetic('aerial_slam')
    if (!slam || this.state !== 'active') return
    this._shake(5.5, 0.25)
    const dmg = this.attackDamage * slam.slamDamage
    for (const lane of [0, 1, 2]) {
      this.rings.push({ lane, depth: RUNNER_COLLISION_DEPTH - 0.1, life: 0.32, maxLife: 0.32, color: 'rgba(52, 211, 153, ALPHA)', radiusScale: 2.2 })
    }
    for (const entity of this.entities.slice()) {
      if (!entity.active || entity.kind !== 'enemy' || entity.depth < 0.48) continue
      this._applyFreeze(entity, slam.stunDuration)
      this._hitEntity(entity, this._secondaryAttack({ core: this.weaponCore, coreLevel: this.weaponLevel, damageMultiplier: dmg / Math.max(1, this.attackDamage) }), { silent: true, splash: true })
    }
  }

  _triggerShadowSlash(lane) {
    this.rings.push({ lane, depth: 0.72, life: 0.32, maxLife: 0.32, color: 'rgba(241, 139, 165, ALPHA)', radiusScale: 2.5 })
    for (const entity of this.entities.slice()) {
      if (!entity.active || entity.kind !== 'enemy' || entity.lane !== lane || entity.depth < 0.35) continue
      this._hitEntity(entity, this._secondaryAttack({ core: this.weaponCore, coreLevel: this.weaponLevel, damageMultiplier: 2.4 }), { silent: true, splash: true })
    }
  }

  _getKinetic(id) {
    const entry = this.kinetics.find((k) => k.id === id)
    return entry ? getRunnerKineticTrigger(id, entry.level) : null
  }

  _hasModule(id) {
    return this.modules.some((m) => m.id === id) || this.weaponModule === id
  }

  _getRelic(id) {
    return this.relics.includes(id) ? RUNNER_BOSS_RELICS[id] : null
  }

  activateFever() {
    if (this.state !== 'active' || this.pendingDraft || this.isFeverActive || this.feverCharges <= 0) return false
    this.feverCharges -= 1
    const extraDur = this._getRelic('infinite_fever_engine')?.extraFeverDuration || 0
    this.feverTimer = RUNNER_FEVER_DURATION + extraDur
    this.feverCount = (this.feverCount || 0) + 1
    const p = this.renderer.project(this.currentLane, RUNNER_PLAYER_DEPTH)
    this.floatingTexts.push(
      new FloatingText(
        this.renderer.lanePositionX(this.lanePosition),
        this.renderer.playerY - 45,
        `${this.strain.feverName || '暴走启动'}`,
        '',
        this.strain.color || '#ffd166',
        18
      )
    )
    this._shake(6.5, 0.35)
    this.game.sound.levelUp?.()
    this._burst(p.x, p.y, this.strain.color || '#ffd166', 20, true)

    // 血统专属暴走大招即时效应
    if (this.strainId === 'elemental') {
      const elemColor = RUNNER_SECONDARY_ELEMENTS[this.secondaryElement]?.color || '#b6a4ff'
      for (const lane of [0, 1, 2]) {
        this.rings.push({ lane, depth: 0.65, life: 0.4, maxLife: 0.4, color: 'rgba(182, 164, 255, ALPHA)', radiusScale: 2.8 })
        if (this.secondaryElement === 'flame') this._pushGroundFire(lane, 0.55, 3.0, 1.2)
      }
      for (const entity of this.entities.slice()) {
        if (!entity.active || entity.kind !== 'enemy') continue
        if (this.secondaryElement === 'frost') this._applyFreeze(entity, 1.5)
        this._hitEntity(entity, this._secondaryAttack({ core: this.weaponCore, coreLevel: this.weaponLevel, damageMultiplier: 2.6 }), { silent: true, splash: true })
      }
      this._burst(p.x, p.y, elemColor, 16, true)
    } else if (this.strainId === 'shadow') {
      for (const lane of [0, 1, 2]) this._triggerShadowSlash(lane)
    } else if (this.strainId === 'glutton') {
      this.hyperBoostTimer = Math.max(this.hyperBoostTimer, 2.5)
    }
    return true
  }

  _collectFeverShard(point) {
    if (this.feverCharges < this.maxFeverCharges) {
      this.feverShards += 1
      if (this.feverShards >= RUNNER_FEVER_SHARDS_PER_CHARGE) {
        this.feverShards = 0
        this.feverCharges = Math.min(this.maxFeverCharges, this.feverCharges + 1)
        this.floatingTexts.push(
          new FloatingText(point.x, point.y - 26, '暴走就绪 +1 [按空格释放]', '', '#ffd166', 18)
        )
        this.game.sound.levelUp?.()
        this._burst(point.x, point.y, '#ffd166', 12, true)
      } else {
        this.game.sound.pickup?.()
      }
    } else {
      this._addScore(150)
      this.game.sound.pickup?.()
    }
  }

  _addScore(rawAmount) {
    const gained = Math.round(rawAmount * this.totalScoreMultiplier)
    if (gained <= 0) return 0
    this.score += gained
    this.bountyCredits += gained
    this._checkScoreMilestones()
    return gained
  }

  _addStyle(points) {
    this.stylePoints = Math.min(180, this.stylePoints + points)
    this.styleGraceTimer = 2.4
    const rank = getRunnerStyleRank(this.stylePoints)
    const order = ['C', 'B', 'A', 'S', 'SS', 'SSS']
    if (order.indexOf(rank.id) > order.indexOf(this.bestStyleRank)) {
      this.bestStyleRank = rank.id
    }
  }

  _checkScoreMilestones() {
    while (
      this.nextMilestoneIndex < RUNNER_SCORE_MILESTONES.length &&
      this.score >= RUNNER_SCORE_MILESTONES[this.nextMilestoneIndex]
    ) {
      const target = RUNNER_SCORE_MILESTONES[this.nextMilestoneIndex]
      this.nextMilestoneIndex += 1
      this.freeRerolls += 1
      if (this.feverCharges < this.maxFeverCharges) this.feverCharges += 1
      else if (this.shield < this.maxShield) this.shield += 1
      this._showNotice(`积分里程碑 ${target.toLocaleString()} · 充能 & 刷新次数 +1 🎯`)
      this._gainXp(18)
    }
  }

  _gainXp(rawAmount, fromGate = false) {
    if (!this.autoDraftOnXp || this.state !== 'active' || rawAmount <= 0) return
    let mul = this.submodeConfig?.xpScale || 1
    if (this.chip?.xpMul) mul *= this.chip.xpMul
    if (fromGate && this.strain.gatePowerMul) mul *= this.strain.gatePowerMul
    this.xp += rawAmount * mul
    if (this.xp >= this.xpToNext && !this.pendingDraft) {
      this._triggerDraft(false)
    }
  }

  _draftStateSnapshot() {
    return {
      level: this.level,
      weaponCore: this.weaponCore,
      weaponLevel: this.weaponLevel,
      secondaryElement: this.secondaryElement,
      elementLevel: this.elementLevel,
      modules: this.modules.slice(),
      kinetics: this.kinetics.slice(),
      relics: this.relics.slice(),
      strainId: this.strainId,
      attackDamage: this.attackDamage,
      shield: this.shield,
      feverCharges: this.feverCharges,
    }
  }

  _triggerDraft(isBossRelic = false, fromChain = false) {
    const options = this.director.createDraftOptions(this._draftStateSnapshot(), isBossRelic)
    if (!options.length) return false
    const wasPaused = fromChain || !!this.pendingDraft
    this.pendingDraft = {
      level: isBossRelic ? this.level : this.level + 1,
      isBossRelic,
      options,
      freeRerolls: this.freeRerolls,
      bountyCredits: this.bountyCredits,
      rerollCost: RUNNER_REROLL_CREDIT_COST,
    }
    if (!wasPaused) this.game?.pause?.()
    this.game?.onRunnerDraft?.(this.pendingDraft)
    this.game?._pushGameplayHud?.()
    return true
  }

  rerollDraft() {
    if (!this.pendingDraft) return false
    if (this.freeRerolls > 0) {
      this.freeRerolls -= 1
    } else if (this.bountyCredits >= RUNNER_REROLL_CREDIT_COST) {
      this.bountyCredits -= RUNNER_REROLL_CREDIT_COST
    } else {
      return false
    }
    const isBossRelic = this.pendingDraft.isBossRelic
    const options = this.director.createDraftOptions(this._draftStateSnapshot(), isBossRelic)
    this.pendingDraft = {
      ...this.pendingDraft,
      options,
      freeRerolls: this.freeRerolls,
      bountyCredits: this.bountyCredits,
    }
    this.game?.onRunnerDraft?.(this.pendingDraft)
    this.game?._pushGameplayHud?.()
    return true
  }

  selectDraftOption(optionId) {
    if (!this.pendingDraft) return false
    const option = this.pendingDraft.options.find((o) => o.id === optionId)
    if (!option) return false
    const isBossRelic = this.pendingDraft.isBossRelic
    this._applyDraftOption(option)
    if (!isBossRelic) {
      this.xp = Math.max(0, this.xp - this.xpToNext)
      this.level += 1
      this.xpToNext = Math.round(28 + this.level * 18 + this.level * this.level * 2)
    }
    this.pendingDraft = null
    if (this._pendingBossRelics > 0) {
      this._pendingBossRelics -= 1
      if (!this._triggerDraft(true, true)) {
        this.game?.onRunnerDraft?.(null)
        this.game?.resume?.()
      }
    } else if (this.autoDraftOnXp && this.xp >= this.xpToNext) {
      if (!this._triggerDraft(false, true)) {
        this.game?.onRunnerDraft?.(null)
        this.game?.resume?.()
      }
    } else {
      this.game?.onRunnerDraft?.(null)
      this.game?.resume?.()
    }
    this.game?._pushGameplayHud?.()
    return true
  }

  _applyDraftOption(option) {
    if (option.category === 'core') {
      const core = getRunnerWeaponCore(option.itemId)
      if (!core) return
      const isNew = this.weaponCore !== option.itemId
      this.weaponCore = option.itemId
      this.weaponLevel = isNew ? 1 : Math.min(5, (this.weaponLevel || 1) + 1)
      this._showFusion(core, this.weaponLevel, isNew ? '核心搭载' : '核心升阶')
      this._showNotice(`${core.name} Lv.${this.weaponLevel}`)
    } else if (option.category === 'element') {
      const elem = RUNNER_SECONDARY_ELEMENTS[option.itemId]
      if (!elem) return
      const isNew = this.secondaryElement !== option.itemId
      this.secondaryElement = option.itemId
      this.elementLevel = isNew ? 1 : Math.min(3, (this.elementLevel || 1) + 1)
      const fusion = this.fusionWeapon
      if (fusion) {
        this._showFusion({ id: fusion.id, name: fusion.name, color: fusion.color, description: fusion.description }, this.weaponLevel || 1, isNew ? '超武融合觉醒' : '元素深化')
        this._showNotice(`${fusion.name} · 融合共鸣`)
      } else {
        this._showNotice(`${elem.name} Lv.${this.elementLevel}`)
      }
    } else if (option.category === 'module') {
      const existing = this.modules.find((m) => m.id === option.itemId)
      if (existing) {
        existing.level = Math.min(3, existing.level + 1)
      } else if (this.modules.length < RUNNER_MAX_MODULES) {
        this.modules.push({ id: option.itemId, level: 1 })
      }
      this.weaponModule = this.modules[0]?.id || null
      const mod = getRunnerWeaponModule(option.itemId, existing?.level || 1)
      this._showNotice(`模组 · ${mod.name} Lv.${mod.level}`)
    } else if (option.category === 'kinetic') {
      const existing = this.kinetics.find((k) => k.id === option.itemId)
      if (existing) {
        existing.level = Math.min(3, existing.level + 1)
      } else if (this.kinetics.length < RUNNER_MAX_KINETICS) {
        this.kinetics.push({ id: option.itemId, level: 1 })
      }
      const kin = RUNNER_KINETIC_TRIGGERS[option.itemId]
      this._showNotice(`机动触发 · ${kin.name} Lv.${existing?.level || 1}`)
    } else if (option.category === 'relic') {
      const relic = RUNNER_BOSS_RELICS[option.itemId]
      if (relic && !this.relics.includes(option.itemId)) {
        this.relics.push(option.itemId)
        if (relic.extraFeverCharge) {
          this.maxFeverCharges += relic.extraFeverCharge
          this.feverCharges = this.maxFeverCharges
        }
        if (relic.extraRerolls) this.freeRerolls += relic.extraRerolls
        if (relic.bonusMaxHp) {
          this.maxHp += relic.bonusMaxHp
          this.hp = Math.min(this.maxHp, this.hp + relic.bonusMaxHp)
        }
        if (relic.bonusMaxShield) {
          this.maxShield += relic.bonusMaxShield
          this.shield = this.maxShield
        }
        this._showFusion({ id: relic.id, name: relic.name, color: relic.color, description: relic.description }, 1, '首领遗物觉醒')
      }
    } else if (option.category === 'stat') {
      if (option.itemId === 'attack') {
        this.attackDamage = Math.min(RUNNER_MAX_ATTACK, this.attackDamage + 1)
        this.rapidFireTimer = Math.max(this.rapidFireTimer, 4)
      } else if (option.itemId === 'fortify') {
        this.hp = Math.min(this.maxHp, this.hp + 1)
        this.shield = Math.min(this.maxShield, this.shield + 2)
        this._collectFeverShard(this.renderer.project(this.occupiedLane, RUNNER_PLAYER_DEPTH))
      } else if (option.itemId === 'fever') {
        this.feverCharges = Math.min(this.maxFeverCharges, this.feverCharges + 1)
        this.bountyCredits += 800
      }
    }
    this.game.sound.evolution?.()
  }

  _getLaneRisks() {
    const risks = [0, 0, 0]
    for (const entity of this.entities) {
      if (!entity.active || this._isChoiceGate(entity) || entity.kind === 'gate' || entity.kind === 'fork') continue
      const urgency = clamp((entity.depth - 0.34) / 0.66, 0, 1)
      let weight = urgency * (1 + Math.max(0, entity.damage || 0) * 0.42)
      if (entity.charging || entity.shiftTelegraph > 0) weight += 0.9
      if (entity.attacking) {
        if (entity.behavior === 'archer' || entity.behavior === 'aerial') risks[entity.attackLane] += 1.45
        if ((entity.behavior === 'mage' || entity.partRole === 'pulse_hammer') && entity.attackLanes) {
          for (const lane of entity.attackLanes) risks[lane] += 1.65
        }
      }
      if (entity.boss && entity.attackLanes) {
        for (const lane of entity.attackLanes) risks[lane] += 1.65
      }
      risks[clamp(entity.lane, 0, RUNNER_LANE_COUNT - 1)] += weight
    }
    for (const projectile of this.enemyProjectiles) {
      if (!projectile.active) continue
      const urgency = clamp((projectile.depth - 0.38) / 0.58, 0, 1)
      risks[projectile.lane] += 1.1 + urgency * 2.4
    }
    if (this.laneCollapse?.phase === 'active') {
      risks[this.laneCollapse.lane] += 4.5
    }
    return risks
  }

  _getLaneTelemetry() {
    const risks = this._getLaneRisks()
    return risks.map((risk, lane) => {
      const collapsed = this.laneCollapse?.lane === lane
      const collapsePhase = collapsed ? this.laneCollapse.phase : null
      const activeMage = this.entities.find(
        (entity) => entity.active && (entity.behavior === 'mage' || entity.partRole === 'pulse_hammer') && (entity.attacking || entity.attackTelegraph > 0) && entity.attackLanes?.includes(lane)
      )
      const activeArcher = this.entities.find(
        (entity) => entity.active && (entity.behavior === 'archer' || entity.behavior === 'aerial') && entity.attacking && entity.attackLane === lane
      )
      const hasBarrier = this.entities.some(
        (entity) => entity.active && (entity.kind === 'hazard' || entity.kind === 'obstacle') && entity.lane === lane && entity.depth > 0.15
      )
      const isCharging = this.entities.some(
        (entity) => entity.active && entity.lane === lane && (entity.charging || entity.chargeTelegraph > 0 || entity.shiftTelegraph > 0)
      )
      const imminent = this.entities.some((entity) => entity.active && entity.lane === lane &&
        !this._isChoiceGate(entity) && entity.kind !== 'gate' && entity.kind !== 'fork' && !entity.boss &&
        this._effectiveSpeed(entity) > 0 &&
        (RUNNER_COLLISION_DEPTH - entity.depth) / this._effectiveSpeed(entity) < 0.85)
      const incoming = this.enemyProjectiles.some((projectile) => projectile.active && projectile.lane === lane &&
        (RUNNER_COLLISION_DEPTH - projectile.depth) / projectile.speed < 0.85)
      const terrain = this.terrains.find((t) => t.active && t.lane === lane && t.depth + t.length >= 0.45)

      const status = collapsePhase === 'active' || imminent || incoming || activeMage || isCharging
        ? 'danger'
        : collapsePhase === 'warning' || activeArcher || risk >= 0.85 || hasBarrier
        ? 'warning'
        : 'open'

      const intent = collapsePhase === 'active'
        ? '坍塌'
        : collapsePhase === 'warning'
        ? '预警'
        : isCharging
        ? '突袭'
        : activeMage
        ? '封锁'
        : activeArcher
        ? '瞄准'
        : incoming
        ? '飞弹'
        : imminent
        ? '逼近'
        : hasBarrier
        ? '路障'
        : terrain
        ? terrain.shortLabel
        : status === 'warning'
        ? '注意'
        : '开放'
      return { lane, risk: Math.min(1, risk / 4.8), status, intent }
    })
  }

  _registerPerfectDodge(lane, depth) {
    const window = RUNNER_DODGE_WINDOW * (this.strain.dodgeWindowMul || 1)
    if (this.visualTime - this._lastLaneSwitchAt > window) return false
    if (this.visualTime - this._lastDodgeAt < 0.28) return false
    this._lastDodgeAt = this.visualTime
    this.perfectDodges += 1
    this._addScore(25)
    this._addStyle(18)
    this._gainXp(12)
    const safeDepth = Math.min(RUNNER_COLLISION_DEPTH, depth || RUNNER_COLLISION_DEPTH)
    const point = this.renderer.project(lane, safeDepth)
    this._collectFeverShard(point)

    const overdrive = this._getKinetic('dodge_overdrive')
    if (overdrive) {
      this.dodgeOverdriveTimer = overdrive.duration
      for (let i = 0; i < overdrive.bonusShards; i++) this._collectFeverShard(point)
    }
    if (this.strainId === 'shadow') {
      this._triggerShadowSlash(lane)
    }

    this.rings.push({
      lane,
      depth: safeDepth,
      life: 0.28,
      maxLife: 0.28,
      color: 'rgba(128, 226, 210, ALPHA)',
      radiusScale: 1.35,
    })
    this.floatingTexts.push(new FloatingText(point.x, point.y - 24, '极限闪避  +STYLE', '', '#8de3d7', 16))
    this.game.sound.pickup?.()
    return true
  }

  _updateDirector(dt) {
    if (this.weaponChoicePending) return
    this._terrainTimer -= dt
    if (this._terrainTimer <= 0 && !this.isBossActive) {
      if (this.terrains.length < RUNNER_MAX_TERRAINS) {
        this.terrains.push(this.director.createTerrainStrip(this.elapsedTime, this.submode, this.laneCollapse?.lane ?? null))
      }
      this._terrainTimer = 5.2 + this.director.random() * 2.5
    }

    this._encounterTimer -= dt
    if (this._encounterTimer > 0) return
    if (this.isBossActive) {
      // Boss 战期间保持轻度补给印记与炸药桶刷新
      const supply = this.director.createEncounter(0, this.entities.length, this.submode, 'blockade', {
        hpMul: this.pactModifiers.hpMul,
        collapsedLane: this.laneCollapse?.lane ?? null,
      }).filter((e) => e.kind === 'gate' || e.behavior === 'barrel')
      if (supply.length) this.entities.push(...supply.slice(0, 2))
      this._encounterTimer = 4.2
      return
    }
    const encounter = this.director.createEncounter(
      this.elapsedTime,
      this.entities.length,
      this.submode,
      this.currentRouteId,
      {
        hpMul: this.pactModifiers.hpMul,
        extraBarrels: this.chipId === 'demolition_expert',
        collapsedLane: this.laneCollapse?.lane ?? null,
      }
    )
    if (encounter.length) this.entities.push(...encounter)
    this._encounterTimer = this.section.spawnInterval * this.routeSpawnIntervalScale
  }

  _updateCollapseSchedule(dt) {
    if (this.laneCollapse) {
      this.laneCollapse.timer -= dt
      if (this.laneCollapse.timer <= 0) {
        if (this.laneCollapse.phase === 'warning') {
          this.laneCollapse.phase = 'active'
          this.laneCollapse.timer = 6.5
          this._showNotice(`⚠️ ${this.laneCollapse.lane === 0 ? '左道' : '右道'}塌陷成窄桥 · 敌群双道集结！`)
        } else {
          this.laneCollapse = null
        }
      }
      return
    }
    if (this.isBossActive) return
    const schedule = getRunnerCollapseSchedule(this.submode)
    if (this.nextCollapseIndex >= schedule.length) return
    if (this.elapsedTime < schedule[this.nextCollapseIndex]) return
    this.nextCollapseIndex += 1
    const lane = this.nextCollapseIndex % 2 === 1 ? 0 : 2
    const warnDur = 2.5 * this.pactModifiers.telegraphMul
    this.laneCollapse = { lane, phase: 'warning', timer: warnDur, maxTimer: warnDur }
    this._showNotice(`🚨 ${lane === 0 ? '左道' : '右道'}路面即将坍塌 · 准备变道！`)
  }

  _checkCollapsePenalty() {
    if (this.laneCollapse?.phase !== 'active') return
    if (this.occupiedLane !== this.laneCollapse.lane) return
    if (this.isJumping || this.hyperBoostTimer > 0 || this.collapseHurtCooldown > 0) return
    this.collapseHurtCooldown = 0.9
    this._takeDamage({ lane: this.occupiedLane, depth: RUNNER_COLLISION_DEPTH, damage: 1 })
    this.targetLane = 1
    this.lanePosition = 1
    this.currentLane = 1
  }

  _updateBossSchedule() {
    if (this.isBossActive) return
    const schedule = getRunnerBossSchedule(this.submode)
    if (this.nextBossIndex >= schedule.length) return
    if (this.elapsedTime < schedule[this.nextBossIndex].time) return
    const spec = schedule[this.nextBossIndex]
    this.nextBossIndex += 1
    this.laneCollapse = null
    const parts = this.director.createBossEncounter(spec.bossId, this.elapsedTime, this.submode, this.pactModifiers.hpMul)
    this.entities.push(...parts)
    this.activeBossGroupId = parts[0]?.bossGroupId || null
    this._showNotice(`🚨 阶段守关首领 [${parts[0]?.bossName}] 降临！先破两翼再轰核心！`)
    this._shake(8, 0.4)
    this.game.sound.wave?.()
  }

  _updateBossActions(dt) {
    const parts = this.bossParts
    if (!parts.length) return
    const leftAlive = parts.some((p) => p.partRole === 'missile_pod')
    const rightAlive = parts.some((p) => p.partRole === 'pulse_hammer')
    const core = parts.find((p) => p.partRole === 'core_reactor')
    if (core) {
      if (leftAlive && rightAlive) core.armor = core.baseArmor || 0.72
      else if (leftAlive || rightAlive) core.armor = (core.baseArmor || 0.72) * 0.45
      else core.armor = 0
    }

    for (const part of parts) {
      if (part.depth < (part.targetDepth || 0.24)) {
        part.depth = Math.min(part.targetDepth || 0.24, part.depth + part.speed * dt)
        continue
      }
      if (part.partRole === 'core_reactor') continue
      if (part.attackTelegraph > 0) {
        part.attackTelegraph = Math.max(0, part.attackTelegraph - dt)
        if (part.attackTelegraph <= 0) {
          if (part.partRole === 'pulse_hammer') this._detonateMageCast(part)
          part.attacking = false
          part.attackLanes = null
          part.safeLane = null
        }
        continue
      }
      part.attackTimer -= dt
      if (part.attackTimer <= 0) {
        part.attackTimer = (part.attackCooldown || 2.5) * this.pactModifiers.telegraphMul
        if (part.partRole === 'missile_pod') {
          this._spawnEnemyArrow({
            ...part,
            attackLane: this.occupiedLane,
            projectileDamage: 1,
            projectileHp: 1,
          })
        } else if (part.partRole === 'pulse_hammer') {
          const safe = [0, 1, 2].filter((l) => l !== this.occupiedLane)[0] ?? 0
          part.safeLane = safe
          part.attackLanes = [0, 1, 2].filter((l) => l !== safe)
          part.attacking = true
          part.attackDelay = 1.05 * this.pactModifiers.telegraphMul
          part.attackTimer = part.attackDelay
          part.attackTelegraph = part.attackDelay
        }
      }
    }
  }

  _updateForkSchedule() {
    const forkTimes = getRunnerForkTimes(this.submode)
    if (this.nextForkIndex >= forkTimes.length) return
    if (this.elapsedTime < forkTimes[this.nextForkIndex]) return
    this.laneCollapse = null
    const row = this.director.createForkRow(this.nextForkIndex, this.elapsedTime, this.submode)
    this.entities.push(...row)
    this.activeForkId = this.nextForkIndex
    this.nextForkIndex += 1
  }

  _resolveFork(fork) {
    if (this._resolvedForkIds.has(fork.forkId)) return false
    this._resolvedForkIds.add(fork.forkId)
    const route = getRunnerRouteByLane(this.occupiedLane)
    this.currentRouteId = route.id
    this.activeForkId = null
    this.routeLog.push({
      forkId: fork.forkId,
      routeId: route.id,
      lane: this.occupiedLane,
      elapsed: Number(this.elapsedTime.toFixed(4)),
    })
    for (const other of this.entities) {
      if (other.kind === 'fork' && other.rowId === fork.rowId) other.resolved = true
    }
    let bonusCharges = 0
    let bonusShield = 0
    if (route.forkBonusCharges) {
      for (let i = 0; i < route.forkBonusCharges; i++) {
        if (this.feverCharges < this.maxFeverCharges) {
          this.feverCharges += 1
          bonusCharges += 1
        } else if (this.shield < this.maxShield) {
          this.shield += 1
          bonusShield += 1
        }
      }
    }
    const bonusLabel = bonusCharges
      ? `暴走充能 +${bonusCharges}`
      : bonusShield
      ? `防护凝胶 +${bonusShield}`
      : ''
    this._showNotice(
      bonusLabel ? `路线 · ${route.label} · ${bonusLabel}` : `路线 · ${route.label}`,
      route.color
    )
    return true
  }

  // 兼容方法：保留手动触发三选一门
  _startWeaponChoice() {
    const choices = this.director.createWeaponChoice()
    this._choiceRowId = choices[0]?.rowId || 0
    this.weaponChoicePending = choices.length > 0
    this.weaponNotice = '弹道变异'
    this.weaponNoticeTimer = 2.2
    this.bullets.length = 0
    this.entities.push(...choices)
  }

  _startSecondaryChoice() {
    const choices = this.director.createSecondaryChoice()
    this._secondaryChoiceRowId = choices[0]?.rowId || 0
    this.secondaryChoicePending = choices.length > 0
    this.weaponNotice = '元素融合变异'
    this.weaponNoticeTimer = 2.4
    this.bullets.length = 0
    this.entities.push(...choices)
  }

  _selectWeaponCore(coreId) {
    if (this.weaponCore || !this.weaponChoicePending) return false
    const core = getRunnerWeaponCore(coreId)
    if (!core) return false
    this.weaponCore = core.id
    this.weaponLevel = 1
    this.weaponChoicePending = false
    this.weaponNotice = `${core.name} · 已融合`
    this.weaponNoticeTimer = 2.6
    this._addScore(250)
    this._shotSerial = 0
    for (const entity of this.entities) {
      if (entity.kind === 'mutation' && entity.rowId === this._choiceRowId) entity.active = false
    }
    this._encounterTimer = 0.75
    this._showFusion(core, 1, '流派融合')
    this.game.sound.evolution?.()
    return true
  }

  _selectSecondaryElement(elemId) {
    if (this.secondaryElement || !this.secondaryChoicePending) return false
    const elem = RUNNER_SECONDARY_ELEMENTS[elemId]
    if (!elem) return false
    this.secondaryElement = elem.id
    this.elementLevel = 1
    this.secondaryChoicePending = false
    this.weaponLevel = Math.max(2, this.weaponLevel)
    for (const entity of this.entities) {
      if (entity.kind === 'secondary_mutation' && entity.rowId === this._secondaryChoiceRowId) {
        entity.active = false
      }
    }
    const fusion = this.fusionWeapon
    this.weaponNotice = fusion ? `${fusion.name} · 融合觉醒` : `${elem.name} · 附魔就绪`
    this.weaponNoticeTimer = 3.0
    this._addScore(300)
    this._encounterTimer = 0.75
    this._showFusion({
      id: fusion?.id || elem.id,
      name: fusion?.name || elem.name,
      color: fusion?.color || elem.color,
      description: fusion?.description || elem.description,
    }, this.weaponLevel, '双核融合觉醒')
    this.game.sound.evolution?.()
    return true
  }

  _startModuleChoice() {
    const choices = this.director.createModuleChoice()
    this._moduleChoiceRowId = choices[0]?.rowId || 0
    this.moduleChoicePending = choices.length > 0
    this.weaponNotice = '模块搭载变异'
    this.weaponNoticeTimer = 2.4
    this.entities.push(...choices)
  }

  _selectWeaponModule(moduleId) {
    if (this.weaponModule || !this.moduleChoicePending) return false
    const module = getRunnerWeaponModule(moduleId)
    if (!module) return false
    this.weaponModule = module.id
    if (!this.modules.some((m) => m.id === module.id)) {
      this.modules.push({ id: module.id, level: 1 })
    }
    this.moduleChoicePending = false
    for (const entity of this.entities) {
      if (entity.kind === 'module_mutation' && entity.rowId === this._moduleChoiceRowId) {
        entity.active = false
      }
    }
    this.weaponNotice = `${module.name} · 已搭载`
    this.weaponNoticeTimer = 2.8
    this._addScore(300)
    this._showFusion({
      id: module.id,
      name: module.name,
      color: module.color,
      description: module.description,
    }, this.weaponLevel || 1, '模块搭载')
    this.game.sound.evolution?.()
    return true
  }

  _upgradeWeaponCore(level, prefix) {
    if (!this.weaponCore || this.weaponLevel >= level) return false
    const core = getRunnerWeaponCore(this.weaponCore)
    const fusion = this.fusionWeapon
    this.weaponLevel = level
    const displayName = fusion?.name || core.name
    this.weaponNotice = `${prefix} · ${displayName} Lv.${level}`
    this.weaponNoticeTimer = 2.6
    this._showFusion({
      id: fusion?.id || core.id,
      name: displayName,
      color: fusion?.color || core.color,
      description: fusion?.description || core.description,
    }, level, prefix)
    this.game.sound.elementUp?.()
    return true
  }

  _showFusion(core, level, kicker) {
    const descriptions = [core.description, '弹道结构完成双核融合', '核心进入终极过载状态']
    this.fusionPresentation = {
      id: core.id,
      kicker,
      title: `${core.name} Lv.${level}`,
      description: core.description || descriptions[Math.min(2, Math.max(0, level - 1))],
      color: core.color,
      level,
      timer: this.reducedMotion ? 0.9 : 0.78,
      maxTimer: this.reducedMotion ? 0.9 : 0.78,
    }
    this.fusionPulse = 1
  }

  get weaponDefinition() {
    return getRunnerWeaponCore(this.weaponCore)
  }

  get weaponLevelConfig() {
    const levels = this.weaponDefinition?.levels
    if (!levels) return null
    return levels[clamp((this.weaponLevel || 1) - 1, 0, levels.length - 1)] || null
  }

  _tickEntityStatus(entity, dt) {
    if (entity.freezeTimer > 0) entity.freezeTimer = Math.max(0, entity.freezeTimer - dt)
    if (entity.slowTimer > 0) {
      entity.slowTimer = Math.max(0, entity.slowTimer - dt)
      if (entity.slowTimer === 0) entity.slowRatio = 0
    }
  }

  _effectiveSpeed(entity) {
    if (entity.boss) return 0
    if (entity.freezeTimer > 0) return 0
    let spd = entity.speed
    if (entity.slowTimer > 0) spd *= 1 - (entity.slowRatio || 0)
    if (this.terrains.some((t) => t.active && t.type === 'accel' && t.lane === entity.lane && entity.depth >= t.depth && entity.depth <= t.depth + t.length)) {
      spd *= RUNNER_TERRAIN_TYPES.accel.enemySpeedMul
    }
    return spd
  }

  _applyFreeze(entity, duration) {
    if (!duration) return
    entity.freezeTimer = Math.max(entity.freezeTimer || 0, duration)
    if (entity.shiftTelegraph > 0) {
      entity.shiftTelegraph = 0
      entity.shiftTargetLane = null
    }
  }

  _applySlow(entity, effect) {
    if (!effect.duration) return
    entity.slowTimer = Math.max(entity.slowTimer || 0, effect.duration)
    entity.slowRatio = Math.max(entity.slowRatio || 0, effect.ratio)
  }

  _mergeGroundFire(lane, depth, effect) {
    const existing = this.groundFires.find((f) => f.lane === lane && Math.abs(f.depth - depth) < 0.08)
    if (existing) {
      existing.duration = Math.max(existing.duration, effect.duration)
      return
    }
    this._pushGroundFire(lane, depth, effect.duration, effect.damage)
  }

  _secondaryAttack(fields = {}) {
    return { ...fields, provenance: ATTACK_SECONDARY }
  }

  _applyFusionOnHit(target, source = null) {
    for (const effect of planRunnerEffects(this.buildProfile, 'onHit')) {
      if (effect.kind === 'slow') this._applySlow(target, effect)
      else if (effect.kind === 'armorBreak') target.armor = Math.max(0, (target.armor || 0) * (1 - effect.amount))
      else if (effect.kind === 'groundFire') this._mergeGroundFire(target.lane, target.depth, effect)
      else if (effect.kind === 'sparks') this._sparksToNearbyTargets(target, effect)
      else if (effect.kind === 'adjacentArc') this._arcToAdjacentLanes(target, effect)
      else if (effect.kind === 'voidPull') {
        if (source?.provenance !== ATTACK_SECONDARY) this._triggerVoidPull(target, effect)
      }
      else if (effect.kind === 'corrosionShock') {
        const stacks = this.weaponCore === 'beam' ? (target.focusStacks || 0) : (target.corrosionStacks || 0)
        if (stacks >= effect.threshold) {
          this._triggerCorrosionShock(target, effect)
        }
      }
    }
  }

  _triggerCorrosionShock(target, effect) {
    if (this.weaponCore === 'beam') target.focusStacks = 0
    else target.corrosionStacks = 0
    this._applyFreeze(target, effect.duration)
    this.rings.push({ lane: target.lane, depth: target.depth, life: 0.3, maxLife: 0.3, color: '#c0ff73', radiusScale: 2.4 })
    this._hitEntity(
      target,
      this._secondaryAttack({
        core: this.weaponCore,
        coreLevel: this.weaponLevel,
        damageMultiplier: effect.damage,
        discharge: true,
      }),
      { silent: true, splash: true, skipFusionOnHit: true }
    )
  }

  _triggerVoidPull(center, effect) {
    if (!center || center.boss) return
    const pullTargets = this.entities.filter(
      (e) =>
        e.active &&
        e.hp > 0 &&
        !e.boss &&
        e.kind === 'enemy' &&
        e.id !== center.id &&
        e.lane !== center.lane &&
        Math.abs(e.depth - center.depth) <= (effect.range || 0.22)
    )
    if (!pullTargets.length) return
    this.weaponStats.voidPulls += 1
    this.rings.push({ lane: center.lane, depth: center.depth, life: 0.32, maxLife: 0.32, color: 'rgba(192, 132, 252, ALPHA)', radiusScale: 2.3 })
    for (const pulled of pullTargets) {
      pulled.lane = center.lane
      pulled.depth = clamp(center.depth + (pulled.depth - center.depth) * 0.4, 0.05, 0.92)
      this._hitEntity(
        pulled,
        this._secondaryAttack({ core: this.weaponCore, coreLevel: this.weaponLevel, damageMultiplier: effect.damage || 0.45 }),
        { silent: true, splash: true, skipFusionOnHit: true }
      )
    }
  }

  _applyFusionOnPierce(target) {
    for (const effect of planRunnerEffects(this.buildProfile, 'onPierce')) {
      if (effect.kind === 'adjacentArc') this._arcToAdjacentLanes(target, effect)
      else if (effect.kind === 'groundFire') this._mergeGroundFire(target.lane, target.depth, effect)
      else if (effect.kind === 'slow') this._applySlow(target, effect)
      else if (effect.kind === 'armorBreak') target.armor = Math.max(0, (target.armor || 0) * (1 - effect.amount))
      else if (effect.kind === 'voidPull') this._triggerVoidPull(target, effect)
    }
  }

  _arcToAdjacentLanes(primary, effect) {
    const lanes = [primary.lane - 1, primary.lane + 1].filter((lane) => lane >= 0 && lane < 3)
    for (const lane of lanes) {
      const target = this._nearestTargetInLane(lane, primary.depth, 0.14, primary.id)
      if (!target) continue
      this.rings.push({ lane, depth: target.depth, life: 0.2, maxLife: 0.2, color: '#7be8ff' })
      this._hitEntity(target, this._secondaryAttack({ core: this.weaponCore, coreLevel: this.weaponLevel, damageMultiplier: effect.damageRatio }), { silent: true, splash: true })
    }
  }

  _sparksToNearbyTargets(primary, effect) {
    const lanes = [primary.lane, primary.lane - 1, primary.lane + 1].filter((lane) => lane >= 0 && lane < 3)
    const candidates = []
    for (const lane of lanes) {
      for (const entity of this.entities) {
        if (!entity.active || entity.hp <= 0 || entity.id === primary.id) continue
        if (this._isChoiceGate(entity)) continue
        if (entity.lane !== lane || Math.abs(entity.depth - primary.depth) > 0.16) continue
        candidates.push(entity)
      }
    }
    candidates.sort((a, b) => a.lane - b.lane || b.depth - a.depth || a.id - b.id)
    for (const entity of candidates.slice(0, effect.count)) {
      this.rings.push({ lane: entity.lane, depth: entity.depth, life: 0.2, maxLife: 0.2, color: '#ffd859' })
      this._hitEntity(entity, this._secondaryAttack({ core: this.weaponCore, coreLevel: this.weaponLevel, damageMultiplier: effect.damage }), { silent: true, splash: true })
    }
  }

  _canTakeBlastStatus(primary) {
    if (!primary || primary.kind === 'arrow') return false
    if (!primary.active || primary.hp <= 0) return false
    if (this._isChoiceGate(primary)) return false
    if (primary.lane === undefined || primary.depth === undefined) return false
    return true
  }

  _nearestTargetInLane(lane, depth, tolerance, excludeId) {
    let best = null
    for (const entity of this.entities) {
      if (!entity.active || entity.hp <= 0 || entity.id === excludeId) continue
      if (this._isChoiceGate(entity)) continue
      if (entity.lane !== lane || Math.abs(entity.depth - depth) > tolerance) continue
      if (!best || entity.depth > best.depth) best = entity
    }
    return best
  }

  _deathBlast(dead, effect) {
    this.rings.push({ lane: dead.lane, depth: dead.depth, life: 0.3, maxLife: 0.3, color: '#ff9a42', radiusScale: 2.2 })
    const targets = this.entities.filter(
      (other) => other.active && other.hp > 0 && !this._isChoiceGate(other) && other.lane === dead.lane && Math.abs(other.depth - dead.depth) <= effect.radius
    )
    for (const target of targets) {
      this._hitEntity(target, this._secondaryAttack({ core: this.weaponCore, coreLevel: this.weaponLevel, damageMultiplier: effect.damage }), { silent: true, splash: true })
    }
  }

  _applyModuleProc(primary, source) {
    if (!canProcModule(source) || source.moduleProcUsed) return
    const onHitEffects = planRunnerEffects(this.buildProfile, 'onHit')
    const split = findRunnerEffect(onHitEffects, 'split')
    const cross = findRunnerEffect(onHitEffects, 'crossPrism')
    if (!split && !cross) return
    source.moduleProcUsed = true

    if (split) {
      const candidates = []
      for (const entity of this.entities) {
        if (!entity.active || entity.hp <= 0 || entity.id === primary.id) continue
        if (this._isChoiceGate(entity)) continue
        if (Math.abs(entity.depth - primary.depth) > split.range) continue
        candidates.push(entity)
      }
      candidates.sort((a, b) => a.lane - b.lane || b.depth - a.depth || a.id - b.id)
      const targets = candidates.slice(0, split.count)
      if (targets.length) {
        this.weaponStats.splits += 1
        for (const entity of targets) {
          const point = this.renderer.project(entity.lane, entity.depth)
          this._burst(point.x, point.y, '#7ce0c3', 4, true)
          this.weaponStats.splinterCount += 1
          this.weaponStats.maxProcDepth = Math.max(this.weaponStats.maxProcDepth, 1)
          this._hitEntity(
            entity,
            this._secondaryAttack({
              core: this.weaponCore,
              coreLevel: this.weaponLevel,
              damageMultiplier: split.damage,
              flankBypass: true,
            }),
            { silent: true, splash: true }
          )
        }
      }
    }

    if (cross) {
      const adjCandidates = []
      for (const entity of this.entities) {
        if (!entity.active || entity.hp <= 0 || entity.id === primary.id) continue
        if (this._isChoiceGate(entity)) continue
        if (Math.abs(entity.lane - primary.lane) !== 1) continue
        if (Math.abs(entity.depth - primary.depth) > cross.range) continue
        adjCandidates.push(entity)
      }
      adjCandidates.sort((a, b) => a.lane - b.lane || b.depth - a.depth || a.id - b.id)
      const crossTargets = adjCandidates.slice(0, cross.count)
      if (crossTargets.length) {
        this.weaponStats.crossPrisms += 1
        this.weaponStats.maxProcDepth = Math.max(this.weaponStats.maxProcDepth, 1)
        for (const entity of crossTargets) {
          this.rings.push({ lane: entity.lane, depth: entity.depth, life: 0.22, maxLife: 0.22, color: 'rgba(96, 165, 250, ALPHA)', radiusScale: 1.5 })
          this._hitEntity(
            entity,
            this._secondaryAttack({
              core: this.weaponCore,
              coreLevel: this.weaponLevel,
              damageMultiplier: cross.damage,
              flankBypass: true,
            }),
            { silent: true, splash: true }
          )
        }
      }
    }
  }

  _tryRicochet(bullet, killedTarget) {
    if (!bullet.ricochetRemaining || bullet.ricochetRemaining <= 0) return false
    if (!killedTarget) return false
    const candidates = []
    for (const entity of this.entities) {
      if (!entity.active || entity.hp <= 0) continue
      if (this._isChoiceGate(entity) || entity.kind === 'fork') continue
      if (bullet.ricochetHitIds.includes(entity.id)) continue
      if (entity.depth >= bullet.depth - 0.005) continue
      candidates.push(entity)
    }
    if (!candidates.length) return false
    candidates.sort((a, b) => a.lane - b.lane || b.depth - a.depth || a.id - b.id)
    const next = candidates[0]
    bullet.ricochetRemaining -= 1
    bullet.damageMultiplier *= bullet.ricochetDecay
    bullet.lane = next.lane
    bullet.laneFloat = next.lane
    bullet.laneDrift = 0
    bullet.ricochetHitIds.push(next.id)
    bullet.provenance = ATTACK_SECONDARY
    bullet.flankBypass = true
    this.weaponStats.ricochets += 1
    const point = this.renderer.project(next.lane, next.depth)
    this._burst(point.x, point.y, '#c9a6ff', 3, true)
    return true
  }

  _isChoiceGate(entity) {
    return entity.kind === 'mutation' || entity.kind === 'secondary_mutation' || entity.kind === 'module_mutation'
  }

  _updateTerrains(dt) {
    this.onAccelStrip = false
    this.onMireStrip = false
    for (let i = this.terrains.length - 1; i >= 0; i--) {
      const strip = this.terrains[i]
      if (!strip.active) {
        this.terrains.splice(i, 1)
        continue
      }
      strip.depth += strip.speed * dt
      if (strip.depth > 1.08) {
        this.terrains.splice(i, 1)
        continue
      }
      const overlapsPlayer =
        strip.lane === this.occupiedLane &&
        strip.depth <= RUNNER_COLLISION_DEPTH &&
        strip.depth + strip.length >= RUNNER_COLLISION_DEPTH &&
        !this.isJumping
      if (overlapsPlayer) {
        if (strip.type === 'accel') this.onAccelStrip = true
        else if (strip.type === 'mire') this.onMireStrip = true
        else if (strip.type === 'launchpad' && !strip.triggered) {
          strip.triggered = true
          this.jump(RUNNER_TERRAIN_TYPES.launchpad.jumpDuration)
        }
      }
    }
  }

  _updateMines(dt) {
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const mine = this.mines[i]
      mine.life -= dt
      mine.depth += 0.04 * dt
      if (mine.life <= 0 || mine.depth > 1.02) {
        this.mines.splice(i, 1)
        continue
      }
      const trigger = this.entities.find(
        (e) =>
          e.active &&
          e.hp > 0 &&
          !this._isChoiceGate(e) &&
          e.kind === 'enemy' &&
          e.lane === mine.lane &&
          Math.abs(e.depth - mine.depth) <= 0.06
      )
      if (!trigger) continue
      this.weaponStats.minesDetonated += 1
      this.rings.push({ lane: mine.lane, depth: mine.depth, life: 0.28, maxLife: 0.28, color: 'rgba(251, 146, 60, ALPHA)', radiusScale: 2.4 })
      const targets = this.entities.filter(
        (e) => e.active && e.hp > 0 && !this._isChoiceGate(e) && e.kind !== 'gate' && e.lane === mine.lane && Math.abs(e.depth - mine.depth) <= mine.radius
      )
      for (const target of targets) {
        this._hitEntity(target, this._secondaryAttack({ core: this.weaponCore, coreLevel: this.weaponLevel, damageMultiplier: mine.damage }), { silent: true, splash: true })
      }
      this.mines.splice(i, 1)
    }
  }

  _updateClones(dt) {
    for (let i = this.clones.length - 1; i >= 0; i--) {
      this.clones[i].duration -= dt
      if (this.clones[i].duration <= 0) this.clones.splice(i, 1)
    }
    if (!this.clones.length || this.state !== 'active') return
    this._cloneFireCooldown -= dt
    if (this._cloneFireCooldown <= 0) {
      this._cloneFireCooldown = RUNNER_FIRE_INTERVAL * 1.4
      for (const clone of this.clones) {
        if (this.bullets.length >= RUNNER_MAX_BULLETS) break
        const b = this._createBullet(clone.lane)
        b.damageMultiplier *= clone.fireRatio
        b.provenance = ATTACK_SECONDARY
        b.color = '#a78bfa'
        this.bullets.push(b)
      }
    }
  }

  _removeEntity(entity) {
    if (!entity) return
    entity.active = false
    const idx = this.entities.indexOf(entity)
    if (idx >= 0) this.entities.splice(idx, 1)
  }

  _updateEntities(dt) {
    for (const entity of this.entities.slice().reverse()) {
      if (!entity?.active) {
        this._removeEntity(entity)
        continue
      }
      this._tickEntityStatus(entity, dt)
      entity.previousDepth = entity.depth

      // 黏液减速沼控制突击怪与变道刺客
      if (
        (entity.behavior === 'charge' || entity.behavior === 'assassin') &&
        this.terrains.some((t) => t.active && t.type === 'mire' && t.lane === entity.lane && entity.depth >= t.depth && entity.depth <= t.depth + t.length)
      ) {
        entity.charging = false
        entity.chargeTelegraph = 0
        entity.shiftTelegraph = 0
        entity.speed = entity.baseSpeed
        this._applySlow(entity, { ratio: RUNNER_TERRAIN_TYPES.mire.enemySlowRatio, duration: 0.6 })
      }

      if (entity.behavior === 'charge') this._updateCharger(entity, dt)
      else if (entity.behavior === 'assassin') this._updateAssassin(entity, dt)
      else if (entity.behavior === 'archer' || entity.behavior === 'mage' || entity.behavior === 'aerial') {
        this._updateRangedEnemy(entity, dt)
      }
      else if (entity.type === 'carrier_boss') {
        this._updateCarrierBoss(entity, dt)
      }
      else entity.depth += this._effectiveSpeed(entity) * dt
      entity.hitFlash = Math.max(0, entity.hitFlash - dt)

      if (entity.kind === 'fork') {
        if (!entity.resolved && entity.depth >= RUNNER_FORK_SELECT_DEPTH) this._resolveFork(entity)
        if (entity.resolved || entity.depth >= RUNNER_FORK_CLEAR_DEPTH) this._removeEntity(entity)
        continue
      }

      if (entity.depth < RUNNER_COLLISION_DEPTH) continue

      const collides = entity.lane === this.occupiedLane
      if (entity.kind === 'mutation') {
        this._removeEntity(entity)
        if (collides) this._selectWeaponCore(entity.weaponCore)
        continue
      }
      if (entity.kind === 'module_mutation') {
        this._removeEntity(entity)
        if (collides) this._selectWeaponModule(entity.weaponModule)
        continue
      }
      if (entity.kind === 'secondary_mutation') {
        this._removeEntity(entity)
        if (collides) this._selectSecondaryElement(entity.secondaryElement)
        continue
      }
      if (entity.kind === 'gate') {
        this._removeEntity(entity)
        if (collides) {
          const point = this.renderer.project(entity.lane, entity.depth)
          this._applyReward(entity, point)
        }
        continue
      }

      if (collides) {
        // 暴食血统胃酸冲角：可直接撞碎残血(<25% HP)普通怪/轻量障碍而不受伤
        if (
          this.strainId === 'glutton' &&
          !entity.boss &&
          entity.behavior !== 'roller_mine' &&
          entity.kind !== 'hazard' &&
          entity.hp / Math.max(1, entity.maxHp) <= (this.strain.ramThreshold || 0.25)
        ) {
          this._defeatEntity(entity)
          this._gainXp(10)
          this._collectFeverShard(this.renderer.project(entity.lane, entity.depth))
          this.floatingTexts.push(new FloatingText(this.renderer.lanePositionX(this.lanePosition), this.renderer.playerY - 40, '胃酸吞噬！', '', '#ff9f43', 16))
        } else {
          this._removeEntity(entity)
          this._takeDamage(entity)
        }
      } else {
        this._removeEntity(entity)
        this._registerPerfectDodge(entity.lane, entity.depth)
      }
      if (this.state === 'finished') return
    }
  }

  _updateAssassin(entity, dt) {
    if (entity.freezeTimer <= 0 && !entity.hasShifted && entity.depth >= (entity.shiftAt || 0.44)) {
      if (entity.shiftTelegraph <= 0) {
        if (entity.lane !== this.occupiedLane) {
          entity.shiftTargetLane = clamp(entity.lane + Math.sign(this.occupiedLane - entity.lane), 0, 2)
          entity.shiftTelegraph = (entity.shiftDelay || 0.65) * this.pactModifiers.telegraphMul
        } else {
          entity.hasShifted = true
        }
      }
    }
    if (entity.shiftTelegraph > 0) {
      entity.shiftTelegraph = Math.max(0, entity.shiftTelegraph - dt)
      if (entity.shiftTelegraph <= 0 && entity.shiftTargetLane !== null) {
        entity.lane = entity.shiftTargetLane
        entity.shiftTargetLane = null
        entity.hasShifted = true
        entity.speed = entity.baseSpeed * 1.45
        this.game.sound.dash?.()
      }
    }
    entity.depth += this._effectiveSpeed(entity) * dt
  }

  _updateCarrierBoss(entity, dt) {
    if (entity.bossHoldTimer == null) {
      entity.bossHoldTimer = 12.0
      entity.bossAttackCooldown = 2.4
    }
    if (entity.depth >= 0.38 && entity.bossHoldTimer > 0) {
      entity.depth = Math.min(0.42, entity.depth + this._effectiveSpeed(entity) * dt * 0.15)
      entity.bossHoldTimer -= dt
      entity.bossAttackCooldown -= dt
      if (entity.bossAttackCooldown <= 0) {
        entity.bossAttackCooldown = 2.4
        this._spawnEnemyArrow({
          ...entity,
          attackLane: this.occupiedLane,
          projectileDamage: 1,
          projectileHp: 1,
        })
      }
    } else {
      entity.depth += this._effectiveSpeed(entity) * dt
    }
  }

  _updateCharger(entity, dt) {
    if (!entity.chargeStarted && entity.depth >= entity.chargeAt) {
      entity.chargeStarted = true
      entity.chargeTelegraph = entity.chargeDelay * this.pactModifiers.telegraphMul
      entity.speed = 0
    }
    if (entity.chargeTelegraph > 0) {
      entity.chargeTelegraph = Math.max(0, entity.chargeTelegraph - dt)
      if (entity.chargeTelegraph <= 0) {
        entity.charging = true
        entity.speed = entity.baseSpeed * entity.chargeMultiplier
        this.game.sound.enemyShoot?.()
      }
      return
    }
    entity.depth += this._effectiveSpeed(entity) * dt
  }

  _updateRangedEnemy(entity, dt) {
    if (entity.attacking) {
      entity.attackTimer = Math.max(0, entity.attackTimer - dt)
      if (entity.attackTimer <= 0) {
        if (entity.behavior === 'archer' || entity.behavior === 'aerial') this._spawnEnemyArrow(entity)
        else this._detonateMageCast(entity)
        entity.attacking = false
        entity.hasAttacked = true
        entity.speed = entity.baseSpeed * 0.86
        this.game.sound.enemyShoot?.()
      }
      return
    }

    if (!entity.hasAttacked && entity.depth >= entity.attackAt && this._enemyAttackCooldown <= 0) {
      entity.attacking = true
      entity.attackTimer = entity.attackDelay * this.pactModifiers.telegraphMul
      entity.speed = 0
      if (entity.behavior === 'archer' || entity.behavior === 'aerial') {
        entity.attackLane = this.occupiedLane
      } else {
        const safeLanes = [0, 1, 2].filter((lane) => lane !== this.occupiedLane)
        entity.safeLane = safeLanes[Math.floor(this.director.random() * safeLanes.length)]
        entity.attackLanes = [0, 1, 2].filter((lane) => lane !== entity.safeLane)
      }
      this._enemyAttackCooldown = entity.attackTimer + RUNNER_ENEMY_ATTACK_GAP
      return
    }

    entity.depth += this._effectiveSpeed(entity) * dt
  }

  _spawnEnemyArrow(entity) {
    if (this.enemyProjectiles.length >= RUNNER_MAX_ENEMY_PROJECTILES) return
    const hp = Math.max(1, entity.projectileHp || 1)
    this.enemyProjectiles.push({
      id: this._nextEnemyProjectileId++,
      kind: 'arrow',
      lane: entity.attackLane,
      depth: entity.depth + 0.018,
      previousDepth: entity.depth + 0.018,
      speed: 0.72,
      damage: entity.projectileDamage || 1,
      hp,
      maxHp: hp,
      color: '#9dd9b2',
      active: true,
      hitFlash: 0,
    })
  }

  _detonateMageCast(entity) {
    const lanes = entity.attackLanes || []
    for (const lane of lanes) {
      this.rings.push({
        lane,
        depth: RUNNER_COLLISION_DEPTH - 0.045,
        life: 0.34,
        maxLife: 0.34,
        color: 'rgba(205, 138, 239, ALPHA)',
        radiusScale: 2.8,
      })
    }
    if (lanes.includes(this.occupiedLane)) {
      if (this.isJumping) {
        this._registerPerfectDodge(this.occupiedLane, RUNNER_COLLISION_DEPTH)
        this._addScore(200)
        this._addStyle(20)
        this._gainXp(15)
        this.floatingTexts.push(
          new FloatingText(
            this.renderer.lanePositionX(this.lanePosition),
            this.renderer.playerY - 60,
            'MAGIC JUMP DODGE! +200',
            '',
            '#c59bf0',
            14
          )
        )
        return
      }
      this._takeDamage({
        lane: this.occupiedLane,
        depth: RUNNER_COLLISION_DEPTH,
        damage: entity.projectileDamage || 1,
      })
    }
  }

  _updateEnemyProjectiles(dt) {
    for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
      const projectile = this.enemyProjectiles[i]
      if (!projectile.active) {
        this.enemyProjectiles.splice(i, 1)
        continue
      }
      projectile.previousDepth = projectile.depth
      projectile.depth += projectile.speed * dt
      projectile.hitFlash = Math.max(0, projectile.hitFlash - dt)
      if (projectile.depth < RUNNER_COLLISION_DEPTH) continue
      if (projectile.lane === this.occupiedLane) this._takeDamage(projectile)
      else this._registerPerfectDodge(projectile.lane, projectile.depth)
      projectile.active = false
      this.enemyProjectiles.splice(i, 1)
      if (this.state === 'finished') return
    }
  }

  _takeDamage(entity) {
    if (this.hyperBoostTimer > 0) {
      this._registerPerfectDodge(entity.lane ?? this.occupiedLane, RUNNER_COLLISION_DEPTH)
      return
    }
    const isGroundHazard = entity.type === 'laser_gate' || entity.kind === 'hazard' || entity.type === 'ground_fire' || entity.isGround
    if (this.isJumping && isGroundHazard) {
      this._registerPerfectDodge(entity.lane ?? this.occupiedLane, RUNNER_COLLISION_DEPTH)
      this._addScore(150)
      this._addStyle(18)
      this._gainXp(12)
      this.floatingTexts.push(
        new FloatingText(
          this.renderer.lanePositionX(this.lanePosition),
          this.renderer.playerY - 60,
          'JUMP DODGE! +150',
          '',
          '#79d5e6',
          13
        )
      )
      return
    }
    if (this.isJumping) {
      this.jumpTimer = 0
    }
    const incoming = Math.max(1, entity.damage)
    const absorbed = Math.min(this.shield, incoming)
    const hpDamage = incoming - absorbed
    this.shield -= absorbed
    this.hp = Math.max(0, this.hp - hpDamage)
    this.hitsTaken += 1
    this.damageTaken += hpDamage
    this.shieldAbsorbed += absorbed
    this.shieldRegenTimer = 0

    // 护盾保连击机制：有护盾完全吸收或圣盾矩阵时仅折半连击、小幅回落段位
    if (absorbed > 0 && hpDamage === 0) {
      this.combo = Math.floor(this.combo * 0.5)
      this.stylePoints = Math.max(0, this.stylePoints - 22)
    } else if (this._getRelic('omni_shield_core') && absorbed > 0) {
      this.combo = Math.floor(this.combo * 0.5)
      this.stylePoints = Math.max(0, this.stylePoints - 30)
    } else {
      this.combo = 0
      this.comboTimer = 0
      this.stylePoints = Math.max(0, this.stylePoints - 55)
    }

    if (absorbed > 0) {
      this.shieldFlash = 1
      this.game.sound.barrierBreak?.()
    }
    if (hpDamage > 0) {
      this.damageFlash = 1
      this._shake(7, 0.28)
      this.game.sound.hurt?.()
    } else {
      this._shake(3, 0.16)
    }

    const lane = entity.lane ?? this.occupiedLane
    const point = this.renderer.project(lane, RUNNER_COLLISION_DEPTH)
    if (absorbed > 0) {
      this._burst(point.x, point.y, '#70d8d3', 6, true)
      this._showDamageNumber('player-shield', point.x, point.y - 34, absorbed, 'shield')
    }
    if (hpDamage > 0) {
      this._burst(point.x, point.y, '#e36b59', 8, true)
      this._showDamageNumber('player-hp', point.x, point.y - 16, hpDamage, 'player')
    }
    if (this.hp <= 0) this._finish('defeat')
  }

  _currentFireInterval() {
    let mul = 1
    if (this.rapidFireTimer > 0) mul *= RUNNER_RAPID_MULTIPLIER
    if (this.switchRapidTimer > 0) mul *= 1.5
    if (this.onAccelStrip) mul *= RUNNER_TERRAIN_TYPES.accel.fireRateMul
    const aerial = this._getKinetic('aerial_slam')
    if (this.isJumping && aerial) mul *= 1 + aerial.airRapidBonus
    if (this.weaponCore === 'beam' && this.weaponLevelConfig?.fireRateMul) mul *= this.weaponLevelConfig.fireRateMul
    const barrelRelic = this._getRelic('quantum_barrel')
    if (barrelRelic) mul *= 1 + barrelRelic.fireRateBonus
    mul /= this.strain.fireIntervalMul || 1
    return RUNNER_FIRE_INTERVAL / mul
  }

  _updateShooting(dt) {
    const interval = this._currentFireInterval()
    this._fireCooldown -= dt
    let shots = 0
    const bulletSpeed = RUNNER_BULLET_SPEED * (this.strain.bulletSpeedMul || 1) * (this.weaponCore === 'beam' ? 1.35 : 1)

    while (this._fireCooldown <= 0) {
      if (shots >= RUNNER_MAX_CATCH_UP_SHOTS) {
        this._fireCooldown = interval
        break
      }
      this._fireCooldown += interval
      if (!this.isSwitching && this.bullets.length < RUNNER_MAX_BULLETS) {
        if (this.isFeverActive) {
          for (let lane = 0; lane < RUNNER_LANE_COUNT; lane++) {
            if (this.bullets.length < RUNNER_MAX_BULLETS) {
              this._emitShot(lane)
            }
          }
        } else {
          this._emitShot(this.currentLane)
        }
        if ((this.droneTimer > 0 || this.strain.permanentDrone) && this.bullets.length < RUNNER_MAX_BULLETS) {
          const droneLane = this.droneTimer > 0 ? this.droneLane : (this.currentLane === 0 ? 1 : this.currentLane === 2 ? 1 : 0)
          const droneBullet = this._createBullet(droneLane)
          droneBullet.damageMultiplier *= 0.65
          this.bullets.push(droneBullet)
        }
        this.game.sound.shoot?.(this.rapidFireTimer > 0 || this.isFeverActive ? 'spark' : 'base', 0.65)
      }
      shots++
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i]
      bullet.previousDepth = bullet.depth
      bullet.depth -= bulletSpeed * dt
      if (bullet.laneDrift) {
        bullet.laneFloat = clamp((bullet.laneFloat ?? bullet.lane) + bullet.laneDrift * dt, 0, RUNNER_LANE_COUNT - 1)
        bullet.lane = clamp(Math.round(bullet.laneFloat), 0, RUNNER_LANE_COUNT - 1)
      }

      let target = null
      let targetIsProjectile = false
      for (const entity of this.entities) {
        if (!entity.active || entity.lane !== bullet.lane || entity.hp <= 0) continue
        if ((entity.kind === 'mutation' || entity.kind === 'module_mutation' || entity.kind === 'secondary_mutation') && entity.depth < RUNNER_MUTATION_ARM_DEPTH) continue
        if (entity.behavior === 'roller_mine') continue
        const crossed = bullet.previousDepth >= entity.depth && bullet.depth <= entity.depth
        if (crossed && (!target || entity.depth > target.depth)) target = entity
      }

      for (const projectile of this.enemyProjectiles) {
        if (!projectile.active || projectile.lane !== bullet.lane || projectile.hp <= 0) continue
        const crossed = bullet.previousDepth >= projectile.previousDepth && bullet.depth <= projectile.depth
        if (crossed && (!target || projectile.depth > target.depth)) {
          target = projectile
          targetIsProjectile = true
        }
      }

      if (target) {
        // 可蓄力强化门：子弹命中改为灌注充能升级，不打碎门（未标注 chargeable 的兼容旧测试门仍按打碎结算）
        if (!targetIsProjectile && target.kind === 'gate' && target.chargeable) {
          this._chargeGate(target, bullet)
          this.bullets.splice(i, 1)
          continue
        }

        const canPierce =
          (bullet.core === 'pierce' || bullet.fever || bullet.sidePenetrations > 0) &&
          bullet.remainingHits > 0 &&
          target.kind !== 'mutation'
        let result = null
        if (targetIsProjectile) this._hitEnemyProjectile(target, bullet)
        else result = this._hitEntity(target, bullet)
        if (bullet.explosive) this._explodeAt(target, bullet)

        const ricocheted = !!result?.killed && this._tryRicochet(bullet, target)
        if (canPierce && !ricocheted) {
          bullet.remainingHits -= 1
          bullet.damageMultiplier *= bullet.pierceDecay
          bullet.depth = target.depth - 0.003
          this.weaponStats.pierced += 1
          this._applyFusionOnPierce(target)
        } else if (!ricocheted) {
          this.bullets.splice(i, 1)
        }
      } else if (bullet.depth <= 0.12 && bullet.layMine && this.mines.length < RUNNER_MAX_MINES) {
        this.mines.push({
          lane: bullet.lane,
          depth: 0.14,
          life: 6.0,
          damage: bullet.layMine.mineDamage,
          radius: bullet.layMine.mineRadius,
        })
        this.bullets.splice(i, 1)
      } else if (bullet.depth <= 0) {
        this.bullets.splice(i, 1)
      }
    }
  }

  _emitShot(lane) {
    const main = this._createBullet(lane)
    this.bullets.push(main)
    if (this.weaponCore === 'spread' && this.weaponLevelConfig) {
      const cfg = this.weaponLevelConfig
      const drifts = cfg.extraCount >= 4 ? [-1.15, 1.15, -2.0, 2.0] : [-1.15, 1.15]
      for (const drift of drifts) {
        if (this.bullets.length >= RUNNER_MAX_BULLETS) break
        const side = this._createBullet(lane)
        side.laneDrift = drift
        side.laneFloat = lane
        side.damageMultiplier *= cfg.spreadDamage || 0.55
        side.remainingHits = cfg.sidePenetrations || 0
        side.size *= 0.85
        this.bullets.push(side)
      }
    }
  }

  _chargeGate(gate, bullet) {
    const chargeDmg = Math.max(1, this.attackDamage * (bullet.damageMultiplier || 1))
    gate.chargeProgress = (gate.chargeProgress || 0) + chargeDmg
    gate.hitFlash = 0.12
    const thresholds = RUNNER_CHARGE_GATE_THRESHOLDS
    let nextLevel = 1
    if (gate.chargeProgress >= thresholds[2]) nextLevel = 3
    else if (gate.chargeProgress >= thresholds[1]) nextLevel = 2
    if (nextLevel > (gate.chargeLevel || 1)) {
      gate.chargeLevel = nextLevel
      const point = this.renderer.project(gate.lane, gate.depth)
      this.rings.push({ lane: gate.lane, depth: gate.depth, life: 0.25, maxLife: 0.25, color: nextLevel === 3 ? 'rgba(255, 215, 89, ALPHA)' : 'rgba(192, 132, 252, ALPHA)', radiusScale: 1.7 })
      this.floatingTexts.push(new FloatingText(point.x, point.y - 20, nextLevel === 3 ? 'MAX 金色蓄能!' : '蓄能升阶 Lv.2!', '', nextLevel === 3 ? '#ffd166' : '#c084fc', 14))
      this.game.sound.pickup?.()
    }
  }

  _createBullet(lane = this.currentLane) {
    this._shotSerial += 1
    const core = this.weaponDefinition
    const config = this.weaponLevelConfig
    const isBurst = core?.id === 'burst'
    const isFever = this.isFeverActive
    const bulletProfile = getRunnerBulletProfile(this.buildProfile)
    const feverRicochet = isFever && this.strainId === 'ricochet' ? 2 : 0
    const layMine =
      bulletProfile?.mineInterval && this._shotSerial % bulletProfile.mineInterval === 0
        ? { mineDamage: bulletProfile.mineDamage, mineRadius: bulletProfile.mineRadius }
        : null

    return {
      lane,
      laneFloat: lane,
      laneDrift: 0,
      depth: RUNNER_PLAYER_DEPTH - 0.055,
      previousDepth: RUNNER_PLAYER_DEPTH - 0.055,
      core: core?.id || null,
      coreLevel: this.weaponLevel,
      color: isFever ? '#ffd166' : core?.color || '#ffe39a',
      fever: isFever,
      damageMultiplier: (isFever ? 1.3 : 1) * (this.strain.bodyDamageMul || 1),
      remainingHits: (core?.id === 'pierce' ? config.penetrations : 0) + (isFever ? 1 : 0),
      pierceDecay: core?.id === 'pierce' ? config.decay : 0.88,
      explosive: !!(isBurst && this._shotSerial % config.every === 0),
      size: (this.attackDamage >= 5 ? 1.24 : this.attackDamage >= 3 ? 1.12 : 1) * (isFever ? 1.35 : 1),
      ricochetRemaining: (bulletProfile ? bulletProfile.ricochetCount : 0) + feverRicochet,
      ricochetDecay: bulletProfile ? bulletProfile.ricochetDecay : 0.75,
      ricochetHitIds: [],
      layMine,
      moduleProcUsed: false,
      provenance: ATTACK_PRIMARY,
    }
  }

  _hitEntity(entity, source = null, options = {}) {
    if (!entity?.active) return { killed: false, damage: 0 }
    // 非蓄力门在旧测试逻辑下仍支持射击破门
    const damage = this._calculateDamage(entity, source)
    const appliedDamage = Math.min(entity.hp, damage)
    entity.hp -= damage
    entity.hitFlash = 0.12
    if (!options.silent) this.game.sound.hit?.(this.rapidFireTimer > 0 ? 'spark' : 'base')
    const core = getRunnerWeaponCore(source?.core || this.weaponCore)
    this.rings.push({
      lane: entity.lane,
      depth: entity.depth,
      life: HIT_RING_LIFE,
      maxLife: HIT_RING_LIFE,
      color: CORE_RING_COLORS[core?.id] || 'rgba(255, 226, 138, ALPHA)',
      radiusScale: options.splash ? 1.6 : 1,
    })
    const pos = this.renderer.project(entity.lane, entity.depth)
    this._showDamageNumber(
      `entity-${entity.id}`,
      pos.x,
      pos.y,
      appliedDamage,
      this._damageStyleFor(entity, source, options),
      entity.corrosionStacks || entity.focusStacks || 0
    )

    if (entity.hp > 0) {
      this._applyModuleProc(entity, source)
      if (!options.skipFusionOnHit && entity.active && entity.hp > 0) this._applyFusionOnHit(entity, source)
      if (entity.hp > 0 || !entity.active) return { killed: false, damage }
      this._defeatEntity(entity)
      return { killed: true, damage }
    }

    // 可翻转脉冲闸：打爆开关翻转为友方护盾补给门
    if (entity.behavior === 'switch_gate' && !entity.switchFlipped) {
      entity.switchFlipped = true
      entity.kind = 'gate'
      entity.reward = 'shield'
      entity.damage = 0
      entity.isGround = false
      entity.color = '#70d8d3'
      entity.name = '已翻转·护盾门'
      entity.hp = 6
      entity.maxHp = 6
      this.tacticalStats.switches += 1
      this._addScore(200)
      this._addStyle(16)
      this._gainXp(14)
      this.floatingTexts.push(new FloatingText(pos.x, pos.y - 22, '闸门翻转·转敌为友！', '', '#70d8d3', 16))
      this.game.sound.pickup?.()
      return { killed: false, damage }
    }

    this._defeatEntity(entity)
    return { killed: true, damage }
  }

  _hitEnemyProjectile(projectile, source = null, options = {}) {
    if (!projectile?.active) return { killed: false, damage: 0 }
    const damage = Math.max(0.25, this.attackDamage * (source?.damageMultiplier || 1))
    const appliedDamage = Math.min(projectile.hp, damage)
    projectile.hp -= damage
    projectile.hitFlash = 0.12
    if (!options.silent) this.game.sound.hit?.(this.rapidFireTimer > 0 ? 'spark' : 'base')
    const point = this.renderer.project(projectile.lane, projectile.depth)
    this._showDamageNumber(
      `projectile-${projectile.id}`,
      point.x,
      point.y,
      appliedDamage,
      source?.core || this.weaponCore || 'normal'
    )
    if (projectile.hp > 0) return { killed: false, damage }
    projectile.active = false
    this._addScore(40)
    this._burst(point.x, point.y, projectile.color, 6, true)
    this.rings.push({
      lane: projectile.lane,
      depth: projectile.depth,
      life: HIT_RING_LIFE,
      maxLife: HIT_RING_LIFE,
      color: 'rgba(142, 220, 184, ALPHA)',
      radiusScale: 1.35,
    })
    return { killed: true, damage }
  }

  _damageStyleFor(entity, source, options) {
    const coreId = source?.core || this.weaponCore
    if (options.splash || source?.core === 'burst') return 'burst'
    if (coreId === 'corrosion') return 'corrosion'
    if (coreId === 'pierce' || coreId === 'beam') return 'pierce'
    if ((entity.armor || 0) > 0 || this._supportReductionFor(entity) > 0) return 'armor'
    return 'normal'
  }

  _showDamageNumber(key, x, y, value, style = 'normal', stacks = 0) {
    const aggregateWindow = style === 'corrosion' || style === 'burn' ? 0.48 : RUNNER_DAMAGE_AGGREGATE_WINDOW
    const existing = this.damageNumbers.find(
      (number) => number.key === key && number.aggregateTimer > 0 && number.active
    )
    if (existing) {
      existing.value += value
      existing.stacks = Math.max(existing.stacks, stacks)
      existing.style = style === 'normal' ? existing.style : style
      existing.life = existing.maxLife
      existing.aggregateTimer = aggregateWindow
      existing.pulse = 1
      return existing
    }

    let offset = 0
    while (this.damageNumbers.some((number) => number.active && Math.abs(number.x - (x + offset)) < 32 && Math.abs(number.y - y) < 26)) {
      offset = offset <= 0 ? -offset + 36 : -offset
    }
    const number = {
      key,
      x: clamp(x + offset, 24, this.renderer.width - 24),
      y,
      value,
      style,
      stacks,
      life: 0.72,
      maxLife: 0.72,
      aggregateTimer: aggregateWindow,
      pulse: 1,
      active: true,
    }
    this.damageNumbers.push(number)
    while (this.damageNumbers.length > RUNNER_MAX_DAMAGE_NUMBERS) this.damageNumbers.shift()
    return number
  }

  _calculateDamage(entity, source) {
    const coreId = source?.core || this.weaponCore
    const core = getRunnerWeaponCore(coreId)
    const levelsCount = core?.levels?.length || 3
    const level = clamp(source?.coreLevel || this.weaponLevel || 1, 1, levelsCount)
    const config = core?.levels?.[level - 1]
    let damage = this.attackDamage * (source?.damageMultiplier || 1)

    if (this.dodgeOverdriveTimer > 0) {
      const kin = this._getKinetic('dodge_overdrive')
      if (kin) damage *= 1 + kin.damageBonus
    }
    const resonance = this._getRelic('twin_core_resonance')
    if (resonance) damage *= 1 + resonance.damageBonus
    if (this.strain.elementDamageMul && source?.provenance === ATTACK_SECONDARY) {
      damage *= this.strain.elementDamageMul
    }

    if (coreId === 'corrosion' && config && !source?.discharge && entity.kind !== 'gate' && !this._isChoiceGate(entity)) {
      const stacks = entity.corrosionStacks || 0
      damage *= 1 + stacks * config.stackBonus
      entity.corrosionStacks = Math.min(config.maxStacks, stacks + 1)
      this.weaponStats.corrosionStacks += 1
      if (entity.kind === 'hazard' || entity.kind === 'obstacle') damage *= config.barrierDamage
    }

    if (coreId === 'beam' && config && !source?.discharge && entity.kind === 'enemy') {
      const stacks = entity.focusStacks || 0
      damage *= 1 + stacks * config.focusBonus
      entity.focusStacks = Math.min(config.maxFocus, stacks + 1)
    }

    const onHitEffects = planRunnerEffects(this.buildProfile, 'onHit')
    const vulnerability = findRunnerEffect(onHitEffects, 'vulnerability')
    if (vulnerability && (entity.slowTimer || 0) > 0) {
      damage *= 1 + vulnerability.bonus
    }

    const amplify = findRunnerEffect(onHitEffects, 'amplify')
    if (amplify && entity.maxHp > 0 && entity.hp / entity.maxHp < amplify.hpRatio) {
      damage *= 1 + amplify.bonus
    }

    const siege = findRunnerEffect(onHitEffects, 'siegeBreaker')
    if (siege && ((entity.armor || 0) > 0 || entity.kind === 'obstacle' || entity.kind === 'hazard' || entity.boss)) {
      damage *= 1 + siege.bonus
    }

    // 空域炮艇机制：跳跃或雷电附魔造成高额对空弱点，地面普通平射受闪避减伤
    if (entity.behavior === 'aerial') {
      if (this.isJumping || this.secondaryElement === 'lightning') {
        damage *= 2.2
      } else {
        damage *= 1 - (entity.aerialEvasion || 0.45)
      }
    }

    // 侧翼/弹片/回弹/折光绕过正面塔盾卫护甲
    if (entity.armor > 0 && !source?.flankBypass) {
      const armorPierce = coreId === 'corrosion' && config ? config.armorPierce : 0
      damage *= 1 - entity.armor * (1 - armorPierce)
    }

    const supportReduction = this._supportReductionFor(entity)
    if (supportReduction > 0 && !source?.flankBypass) damage *= 1 - supportReduction
    return Math.max(0.25, damage)
  }

  _supportReductionFor(entity) {
    if (entity.kind !== 'enemy' || entity.behavior === 'support') return 0
    let reduction = 0
    for (const other of this.entities) {
      if (
        other.active &&
        other.behavior === 'support' &&
        other.rowId === entity.rowId &&
        other.id !== entity.id
      ) {
        reduction = Math.max(reduction, other.supportReduction || 0)
      }
    }
    return reduction
  }

  _explodeAt(primary, bullet) {
    const core = getRunnerWeaponCore('burst')
    const config = core.levels[clamp(bullet.coreLevel || 1, 1, core.levels.length) - 1]
    const fusion = this.fusionWeapon
    const effects = planRunnerEffects(this.buildProfile, 'onExplosion')
    const blast = findRunnerEffect(effects, 'blastRadius')
    const freeze = findRunnerEffect(effects, 'freeze')
    const groundFire = findRunnerEffect(effects, 'groundFire')
    const sparks = findRunnerEffect(effects, 'sparks')
    const voidPull = findRunnerEffect(effects, 'voidPull')
    const radiusMultiplier = blast ? blast.multiplier : 1
    const radius = config.radius * radiusMultiplier
    this.weaponStats.explosions += 1
    this.rings.push({
      lane: primary.lane,
      depth: primary.depth,
      life: HIT_RING_LIFE * 1.45,
      maxLife: HIT_RING_LIFE * 1.45,
      color: fusion ? fusion.color : 'rgba(240, 179, 95, ALPHA)',
      radiusScale: 2.7 * radiusMultiplier,
    })

    if (voidPull) this._triggerVoidPull(primary, voidPull)
    if (groundFire) this._mergeGroundFire(primary.lane, primary.depth, groundFire)

    const damageTargets = this.entities.filter(
      (entity) =>
        entity.active &&
        entity.hp > 0 &&
        (primary.kind === 'arrow' || entity.id !== primary.id) &&
        entity.lane === primary.lane &&
        !this._isChoiceGate(entity) &&
        Math.abs(entity.depth - primary.depth) <= radius
    )

    let statusTargets = damageTargets
    if (freeze && this._canTakeBlastStatus(primary, radius)) {
      statusTargets = damageTargets.includes(primary) ? damageTargets : [...damageTargets, primary]
    }

    for (const entity of statusTargets) {
      if (freeze) this._applyFreeze(entity, freeze.duration)
    }
    for (const entity of damageTargets) {
      this._hitEntity(
        entity,
        this._secondaryAttack({ core: 'burst', coreLevel: bullet.coreLevel, damageMultiplier: config.damage }),
        { silent: true, splash: true }
      )
    }
    if (sparks) this._sparksToNearbyTargets(primary, sparks)
    const arrows = this.enemyProjectiles.filter(
      (projectile) =>
        projectile.active &&
        (primary.kind !== 'arrow' || projectile.id !== primary.id) &&
        projectile.lane === primary.lane &&
        Math.abs(projectile.depth - primary.depth) <= radius
    )
    for (const projectile of arrows) {
      this._hitEnemyProjectile(
        projectile,
        this._secondaryAttack({ core: 'burst', coreLevel: bullet.coreLevel, damageMultiplier: config.damage }),
        { silent: true, splash: true }
      )
    }
  }

  _defeatEntity(entity) {
    entity.active = false
    const index = this.entities.indexOf(entity)
    if (index >= 0) this.entities.splice(index, 1)
    const point = this.renderer.project(entity.lane, entity.depth)
    this._burst(point.x, point.y, entity.color, entity.elite ? 14 : 8)

    if (entity.kind === 'mutation') {
      this._selectWeaponCore(entity.weaponCore)
      return
    }
    if (entity.kind === 'secondary_mutation') {
      this._selectSecondaryElement(entity.secondaryElement)
      return
    }
    if (entity.kind === 'module_mutation') {
      this._selectWeaponModule(entity.weaponModule)
      return
    }
    if (entity.kind === 'gate') {
      this._applyReward(entity, point)
      return
    }
    if (entity.behavior === 'barrel') {
      this._triggerBarrelExplosion(entity)
      return
    }
    if (entity.behavior === 'crystal_ice') {
      this._triggerCrystalWave(entity, 'ice')
      return
    }
    if (entity.behavior === 'crystal_volt') {
      this._triggerCrystalWave(entity, 'volt')
      return
    }
    if (entity.type === 'gold_convoy') {
      this._addScore(1500)
      this._addStyle(25)
      this._gainXp(entity.xp || 42)
      this.shield = this.maxShield
      this.feverCharges = this.maxFeverCharges
      this.feverShards = 0
      this._showNotice('运宝车击破 · 满能量&全护盾 💰', '#fbbf24')
      this.game.sound.levelUp?.()
      return
    }

    const onKillEffects = planRunnerEffects(this.buildProfile, 'onKill')
    const deathBlast = findRunnerEffect(onKillEffects, 'deathBlast')
    if (deathBlast && ((entity.corrosionStacks || 0) > 0 || (entity.focusStacks || 0) > 0)) {
      this._deathBlast(entity, deathBlast)
    }
    const voidKill = findRunnerEffect(onKillEffects, 'voidPull')
    if (voidKill && (entity.corrosionStacks || 0) > 0) {
      this._triggerVoidPull(entity, voidKill)
    }

    this.kills += 1
    this.combo += 1
    this.bestCombo = Math.max(this.bestCombo, this.combo)
    this.comboTimer = COMBO_WINDOW
    const comboBonus = 1 + Math.min(1.5, Math.max(0, this.combo - 1) * 0.08)
    const routeMul = this.currentRoute?.scoreMultiplier || 1
    const pactMul = 1 + this.pactModifiers.rewardBonus
    const styleMul = getRunnerStyleRank(this.stylePoints).multiplier
    const feverMul = this.isFeverActive ? RUNNER_FEVER_SCORE_MULTIPLIER : 1
    const gained = Math.round((entity.score || 0) * comboBonus * routeMul * pactMul * styleMul * feverMul)
    this.score += gained
    this.bountyCredits += gained
    this._checkScoreMilestones()

    const clearedBoss = !!(entity.boss && this.bossParts.length === 0)
    if (clearedBoss) {
      this.bossDefeatedCount += 1
      this.activeBossGroupId = null
      this._shake(12, 0.5)
      this._addScore(4000)
      this._addStyle(40)
      this._showNotice(`🏆 ${entity.bossName} 已被摧毁！获取首领遗物！`)
      if (this.autoDraftOnXp && this.state === 'active') {
        if (!this.pendingDraft) {
          this._triggerDraft(true)
        } else {
          this._pendingBossRelics += 1
        }
      }
    }

    this._addStyle(entity.elite || entity.boss ? 16 : 4)
    this._gainXp(entity.xp || 8)
    this.game.sound.kill?.(this.combo)

    if (entity.type === 'carrier_boss') {
      this._shake(10, 0.45)
      this.feverCharges = Math.min(this.maxFeverCharges, this.feverCharges + 1)
      this.floatingTexts.push(
        new FloatingText(
          this.renderer.lanePositionX(entity.lane),
          this.renderer.depthToY(entity.depth) - 50,
          'BOSS ANNIHILATED! +3000',
          '',
          '#ffd166',
          20
        )
      )
      this._addScore(3000)
    }

    if (entity.behavior === 'split') {
      const fragments = this.director.createFragments(entity, this.elapsedTime, this.entities.length)
      this.entities.push(...fragments)
    }
  }

  _triggerCrystalWave(entity, kind) {
    this.tacticalStats.crystals += 1
    const point = this.renderer.project(entity.lane, entity.depth)
    this._addScore(entity.score || 200)
    this._addStyle(18)
    this._gainXp(entity.xp || 14)
    for (const lane of [0, 1, 2]) {
      this.rings.push({ lane, depth: entity.depth, life: 0.35, maxLife: 0.35, color: kind === 'ice' ? 'rgba(123, 227, 255, ALPHA)' : 'rgba(253, 224, 71, ALPHA)', radiusScale: 2.8 })
    }
    this.floatingTexts.push(new FloatingText(point.x, point.y - 24, kind === 'ice' ? '冰晶共振·全屏冻结!' : '雷晶过载·全屏破甲!', '', entity.color, 18))
    this.game.sound.powerUp?.()
    for (const target of this.entities.slice()) {
      if (!target.active || target.kind !== 'enemy') continue
      if (kind === 'ice') {
        this._applyFreeze(target, 1.8)
      } else {
        target.armor = 0
        this._hitEntity(target, this._secondaryAttack({ core: this.weaponCore, coreLevel: this.weaponLevel, damageMultiplier: 2.0 }), { silent: true, splash: true })
      }
    }
  }

  _applyReward(entity, point) {
    this.gates += 1
    const tier = Math.max(1, entity.chargeLevel || 1)
    const gateMul = this.strain.gatePowerMul || 1
    this._addScore((entity.score || 0) * tier)
    this._gainXp((entity.xp || 10) * tier, true)

    if (entity.reward === 'bounty_upgrade') {
      const cost = entity.creditCost || 1500
      if (this.bountyCredits >= cost) {
        this.bountyCredits -= cost
        this.attackDamage = Math.min(RUNNER_MAX_ATTACK, this.attackDamage + 1)
        this.freeRerolls += 1
        this.floatingTexts.push(new FloatingText(point.x, point.y - 26, '黑市悬赏兑换 · 攻击+1 & 刷新+1', '', '#fbbf24', 17))
      } else {
        this.bountyCredits += 400
        this.floatingTexts.push(new FloatingText(point.x, point.y - 26, '悬赏信用 +400', '', '#fbbf24', 16))
      }
      this.game.sound.levelUp?.()
      return
    }

    if (entity.reward === 'fever_shard') {
      this._collectFeverShard(point)
      return
    }
    if (entity.reward === 'item_magnet') {
      this._activateMagnet(point)
      return
    }
    if (entity.reward === 'item_bullet_time') {
      this._activateBulletTime(point)
      return
    }
    if (entity.reward === 'item_booster') {
      this._activateHyperBooster(point)
      return
    }
    if (entity.reward === 'item_drone') {
      this._activateDrone(point)
      return
    }

    // 磁力引擎芯片：拾取普通门时自动吸附同排印记/相邻门
    if (this.chipId === 'magnet_engine' && entity.rowId) {
      for (const sibling of this.entities.slice()) {
        if (sibling.active && sibling.id !== entity.id && sibling.rowId === entity.rowId && sibling.kind === 'gate') {
          sibling.active = false
          const idx = this.entities.indexOf(sibling)
          if (idx >= 0) this.entities.splice(idx, 1)
          if (sibling.reward === 'fever_shard') this._collectFeverShard(point)
        }
      }
    }

    let label = ''
    const power = tier >= 3 ? 2 : tier === 2 ? 2 : 1
    if (entity.reward === 'attack') {
      const delta = Math.round(power * (gateMul > 1.1 ? 1.25 : 1))
      if (this.attackDamage < RUNNER_MAX_ATTACK) {
        this.attackDamage = Math.min(RUNNER_MAX_ATTACK, this.attackDamage + delta)
        label = `攻击提升至 ${this.attackDamage}${tier >= 3 ? ' · MAX金色' : ''}`
      } else {
        this._addScore(150 * tier)
        label = `攻击已满 · 分数 +${150 * tier}`
      }
      this.game.sound.levelUp?.()
    } else if (entity.reward === 'rapid') {
      const dur = RUNNER_RAPID_DURATION * (tier === 3 ? 1.8 : tier === 2 ? 1.4 : 1) * gateMul
      this.rapidFireTimer = Math.min(RUNNER_RAPID_DURATION * 2.2, this.rapidFireTimer + dur)
      label = `急速射击 ${Math.ceil(this.rapidFireTimer)} 秒`
      this.game.sound.pickup?.()
    } else if (entity.reward === 'repair') {
      const before = this.hp
      this.hp = Math.min(this.maxHp, this.hp + power)
      if (tier >= 3) this.shield = Math.min(this.maxShield, this.shield + 1)
      label = this.hp > before ? `生命修复 +${this.hp - before}` : '生命已满 · 分数 +100'
      if (this.hp === before) this._addScore(100)
      this.game.sound.pickup?.()
    } else {
      const before = this.shield
      this.shield = Math.min(this.maxShield, this.shield + power)
      if (tier >= 3) this._collectFeverShard(point)
      label = this.shield > before ? `防护凝胶 +${this.shield - before}` : '防护已满 · 分数 +120'
      if (this.shield === before) this._addScore(120)
      this.shieldFlash = 0.7
      this.game.sound.pickup?.()
    }
    this.floatingTexts.push(new FloatingText(point.x, point.y - 26, label, '', entity.color, 17))
  }

  _triggerBarrelExplosion(entity) {
    this.tacticalStats.barrels++
    const point = this.renderer.project(entity.lane, entity.depth)
    this._shake(10, 0.35)
    this._burst(point.x, point.y, '#f97316', 16, true)
    this.floatingTexts.push(new FloatingText(point.x, point.y - 25, '炸药殉爆 💥', '', '#f97316', 22))
    this.game.sound.bombExplode?.()

    const crossLane = !!this.chip?.barrelCrossLane
    const dmg = 12 * (this.chip?.barrelDamageMul || 1)
    let hitCount = 0
    for (const other of this.entities.slice()) {
      if (!other.active || other.id === entity.id || other.hp <= 0 || this._isChoiceGate(other)) continue
      if (!crossLane && Math.abs(other.lane - entity.lane) > 1) continue
      if (Math.abs(other.depth - entity.depth) <= 0.16) {
        other.hp -= dmg
        other.hitFlash = 0.2
        hitCount += 1
        if (other.hp <= 0) this._defeatEntity(other)
      }
    }
    if (hitCount >= 2) this._addStyle(15)
    this._gainXp(entity.xp || 12)

    for (const proj of this.enemyProjectiles) {
      if (proj.active && Math.abs(proj.depth - entity.depth) <= 0.18) {
        proj.active = false
      }
    }

    this._pushGroundFire(entity.lane, entity.depth, 3.0, 1.0)
  }

  _isMagnetEligibleEntity(entity) {
    return !!entity && entity.active === true && entity.kind === 'gate'
  }

  _activateMagnet() {
    this.tacticalStats.magnets++
    this._addScore(200)
    this._showNotice('全息磁暴 · 聚能吸纳 🧲', '#4db8ff')
    this.game.sound.powerUp?.()

    const targets = this.entities.filter((e) => this._isMagnetEligibleEntity(e))
    for (const target of targets) {
      target.active = false
      const idx = this.entities.indexOf(target)
      if (idx >= 0) this.entities.splice(idx, 1)
      this._applyReward(target, this.renderer.project(target.lane, target.depth))
    }
  }

  _activateBulletTime() {
    this.tacticalStats.bulletTimes++
    this.bulletTimeTimer = RUNNER_TACTICAL_ITEMS.bullet_time.duration
    this._addScore(150)
    this._showNotice('时空力场 · 子弹时间 ⏳', '#6ee7b7')
    this.game.sound.powerUp?.()
  }

  _activateHyperBooster() {
    this.tacticalStats.boosters++
    this.hyperBoostTimer = RUNNER_TACTICAL_ITEMS.booster.duration
    this._addScore(150)
    this._showNotice('超频冲刺 · 金身横冲 🚀', '#f59e0b')
    this.game.sound.dash?.()
  }

  _activateDrone() {
    this.tacticalStats.drones++
    this.droneTimer = RUNNER_TACTICAL_ITEMS.drone.duration
    this.droneLane = this.currentLane === 0 ? 1 : this.currentLane === 2 ? 1 : 0
    this._addScore(150)
    this._showNotice('浮游史莱姆 · 协同射击 🤖', '#ec4899')
    this.game.sound.powerUp?.()
  }

  _showNotice(text) {
    this.weaponNotice = text
    this.weaponNoticeTimer = 2.4
  }

  _updateGroundFires(dt) {
    const advance = (this.section?.advanceSpeed || 0.17) * dt
    for (let i = this.groundFires.length - 1; i >= 0; i--) {
      const fire = this.groundFires[i]
      fire.duration -= dt
      fire.depth += advance
      if (fire.duration <= 0 || fire.depth > 1.1) {
        this.groundFires.splice(i, 1)
        continue
      }
      for (const entity of this.entities.slice()) {
        if (
          entity.active &&
          entity.hp > 0 &&
          !this._isChoiceGate(entity) &&
          entity.kind !== 'gate' &&
          entity.lane === fire.lane &&
          Math.abs(entity.depth - fire.depth) <= 0.12
        ) {
          const burnDps = Math.max(4, this.attackDamage * 0.85 + (fire.damage || 1) * 3)
          const dmg = burnDps * dt
          const applied = Math.min(entity.hp, dmg)
          entity.hp -= dmg
          entity.hitFlash = 0.08
          const point = this.renderer.project(entity.lane, entity.depth)
          this._showDamageNumber(`burn-${entity.id}`, point.x, point.y - 12, applied, 'burn')
          if (Math.random() < 0.25) {
            this._burst(point.x, point.y, '#ff6b35', 1, true)
          }
          if (entity.hp <= 0) this._defeatEntity(entity)
        }
      }
    }
  }

  _burst(x, y, color, count, spark = false) {
    const limit = this.reducedMotion ? Math.ceil(count / 2) : count
    for (let i = 0; i < limit; i++) this.particles.push(new Particle(x, y, color, spark))
  }

  _updateEffects(dt) {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i]
      ring.life -= dt
      if (ring.life <= 0) this.rings.splice(i, 1)
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i]
      particle.update(dt)
      if (!particle.active) this.particles.splice(i, 1)
    }
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const floatingText = this.floatingTexts[i]
      floatingText.update(dt)
      if (!floatingText.active) this.floatingTexts.splice(i, 1)
    }
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const number = this.damageNumbers[i]
      number.life -= dt
      number.aggregateTimer = Math.max(0, number.aggregateTimer - dt)
      number.pulse = Math.max(0, number.pulse - dt * 8)
      if (number.life <= 0) {
        number.active = false
        this.damageNumbers.splice(i, 1)
      }
    }
    if (this.fusionPresentation) {
      this.fusionPresentation.timer -= dt
      if (this.fusionPresentation.timer <= 0) this.fusionPresentation = null
    }
    this.fusionPulse = Math.max(0, this.fusionPulse - dt * (this.reducedMotion ? 2.5 : 1.45))
  }

  _shake(magnitude, duration) {
    if (this.reducedMotion) return
    this._shakeMagnitude = magnitude
    this._shakeDuration = duration
    this._shakeTime = duration
  }

  shakeOffset() {
    if (this._shakeTime <= 0 || this._shakeDuration <= 0) return 0
    const strength = this._shakeMagnitude * (this._shakeTime / this._shakeDuration)
    return Math.sin(this.visualTime * 173) * strength
  }

  _finish(outcome) {
    if (this._finishSent) return
    this._finishSent = true
    this.state = 'finished'
    this.outcome = outcome
    this.pendingDraft = null
    if (outcome === 'victory') {
      const timeBonus = this.duration !== Infinity ? Math.round((this.duration - this.elapsedTime) * 40) : 0
      this.score += this.hp * 250 + timeBonus
      this.game.sound.levelUp?.()
    } else {
      this.game.sound.gameOver?.()
    }
    this.game.finishGameplay?.(this.getResultSnapshot())
  }

  _buildHudTags() {
    const modFirst = this.modules[0]
      ? getRunnerWeaponModule(this.modules[0].id, this.modules[0].level)
      : this.moduleWeapon
    return {
      core: this.weaponDefinition
        ? { id: this.weaponDefinition.id, shortLabel: this.weaponDefinition.shortLabel, color: this.weaponDefinition.color, level: this.weaponLevel }
        : null,
      element: this.secondaryElement
        ? {
            id: this.secondaryElement,
            shortLabel: RUNNER_SECONDARY_ELEMENTS[this.secondaryElement]?.shortLabel || this.secondaryElement,
            color: RUNNER_SECONDARY_ELEMENTS[this.secondaryElement]?.color || '#ffffff',
            level: this.elementLevel || 1,
          }
        : null,
      module: modFirst
        ? { id: modFirst.id, shortLabel: modFirst.shortLabel, color: modFirst.color, level: modFirst.level }
        : null,
      modules: this.modules.map((m) => {
        const mod = getRunnerWeaponModule(m.id, m.level)
        return { id: m.id, shortLabel: mod.shortLabel, icon: mod.icon, color: mod.color, level: m.level }
      }),
      kinetics: this.kinetics.map((k) => {
        const kin = getRunnerKineticTrigger(k.id, k.level)
        return { id: k.id, shortLabel: kin.shortLabel, icon: kin.icon, color: kin.color, level: k.level }
      }),
    }
  }

  getHudSnapshot() {
    const weapon = this.weaponDefinition
    const fusion = this.fusionWeapon
    const isEndless = this.duration === Infinity
    const remaining = isEndless ? null : Math.max(0, this.duration - this.elapsedTime)
    const timeLabel = isEndless ? formatElapsedTime(this.elapsedTime) : formatTime(remaining)
    const progress = runnerProgress(this.elapsedTime, this.duration)
    const distance = isEndless
      ? Math.floor(this.elapsedTime * 85)
      : runnerDistanceRemaining(this.elapsedTime, this.duration, this.submodeConfig.distance)

    const sections = this.submodeConfig.sections || []
    const totalSections = Math.max(1, sections.length)
    const currentSection = this.section
    const sectionIndex = currentSection.index ?? 0
    const sectionStart = currentSection.start || 0
    const sectionEnd = currentSection.end || this.duration || 60
    const sectionProgress = isEndless ? 0 : clamp((this.elapsedTime - sectionStart) / Math.max(1, sectionEnd - sectionStart), 0, 1)

    const styleRank = getRunnerStyleRank(this.stylePoints)
    const nextMilestone = RUNNER_SCORE_MILESTONES[this.nextMilestoneIndex] || null

    let tacticalObjective = ''
    if (this.state === 'countdown') {
      tacticalObjective = `${this.strain.name}引擎就绪 · 准备突破封锁线！`
    } else if (this.isBossActive) {
      const parts = this.bossParts
      tacticalObjective = `🚨 守关巨像 [${parts[0]?.bossName}] · 摧毁两翼解锁核心弱点！`
    } else if (this.laneCollapse) {
      tacticalObjective = this.laneCollapse.phase === 'warning'
        ? `⚠️ ${this.laneCollapse.lane === 0 ? '左道' : '右道'}即将坍塌，注意切道！`
        : '🌉 窄桥断层期 · 利用双道火力收割敌群！'
    } else if (this.isFeverActive) {
      tacticalObjective = `⚡ ${this.strain.feverName || '暴走超频'}激活 · 得分 ×2！`
    } else if (fusion) {
      tacticalObjective = `💥 超武 [${fusion.name}] 觉醒 · 射击蓄力门持续升阶！`
    } else if (weapon) {
      tacticalObjective = `⚔️ ${weapon.name} Lv.${this.weaponLevel} · 击敌积攒进化能量！`
    } else {
      tacticalObjective = `🚩 突破第 ${sectionIndex + 1}/${totalSections} 封锁区 · 剩余 ${distance}m`
    }

    const modPrimary = this.modules[0]
      ? getRunnerWeaponModule(this.modules[0].id, this.modules[0].level)
      : this.moduleWeapon
    const kinPrimary = this.kinetics[0]
      ? getRunnerKineticTrigger(this.kinetics[0].id, this.kinetics[0].level)
      : null

    const slots = {
      core: {
        equipped: !!this.weaponCore,
        id: this.weaponCore || null,
        name: weapon?.name || '凝胶弹',
        shortName: weapon?.shortName || '凝胶',
        color: weapon?.color || '#79d5e6',
        level: this.weaponLevel,
      },
      element: {
        equipped: !!this.secondaryElement,
        id: this.secondaryElement || null,
        name: this.secondaryElement ? (RUNNER_SECONDARY_ELEMENTS[this.secondaryElement]?.name || this.secondaryElement) : null,
        shortName: this.secondaryElement ? (RUNNER_SECONDARY_ELEMENTS[this.secondaryElement]?.shortLabel || this.secondaryElement) : null,
        icon: this.secondaryElement ? (RUNNER_SECONDARY_ELEMENTS[this.secondaryElement]?.icon || '⚡') : null,
        color: this.secondaryElement ? (RUNNER_SECONDARY_ELEMENTS[this.secondaryElement]?.color || '#ffd859') : null,
        level: this.elementLevel || 0,
      },
      fusion: {
        active: !!fusion,
        id: fusion?.id || null,
        name: fusion?.name || null,
        color: fusion?.color || null,
        description: fusion?.description || null,
      },
      module: {
        equipped: !!modPrimary,
        id: modPrimary?.id || null,
        name: modPrimary?.name || null,
        shortLabel: modPrimary?.shortLabel || null,
        icon: modPrimary?.icon || '⑂',
        color: modPrimary?.color || '#7ce0c3',
        list: this.modules.map((m) => {
          const d = getRunnerWeaponModule(m.id, m.level)
          return { id: m.id, name: d.name, shortLabel: d.shortLabel, icon: d.icon, color: d.color, level: m.level }
        }),
      },
      kinetic: {
        equipped: !!kinPrimary,
        id: kinPrimary?.id || null,
        name: kinPrimary?.name || null,
        shortLabel: kinPrimary?.shortLabel || null,
        icon: kinPrimary?.icon || '💨',
        color: kinPrimary?.color || '#38bdf8',
        list: this.kinetics.map((k) => {
          const d = getRunnerKineticTrigger(k.id, k.level)
          return { id: k.id, name: d.name, shortLabel: d.shortLabel, icon: d.icon, color: d.color, level: k.level }
        }),
      },
    }

    const bossParts = this.bossParts
    const bossHud = bossParts.length
      ? {
          name: bossParts[0].bossName,
          hp: bossParts.reduce((s, p) => s + Math.max(0, p.hp), 0),
          maxHp: bossParts.reduce((s, p) => s + p.maxHp, 0),
          parts: [0, 1, 2].map((lane) => {
            const p = bossParts.find((part) => part.lane === lane)
            return p ? { lane, name: p.name, hp: Math.max(0, p.hp), maxHp: p.maxHp, armored: (p.armor || 0) > 0.3 } : { lane, destroyed: true }
          }),
        }
      : null

    return {
      slots,
      tacticalObjective,
      sectionProgress,
      totalSections,
      fusionCodex: getRunnerFusionCodex(),
      mode: 'runner',
      submode: this.submode,
      submodeName: this.submodeConfig.name,
      strain: {
        id: this.strain.id,
        name: this.strain.name,
        color: this.strain.color,
        passiveName: this.strain.passiveName,
        feverName: this.strain.feverName,
      },
      chip: this.chip ? { id: this.chip.id, name: this.chip.name, icon: this.chip.icon } : null,
      pactsCount: this.pacts.length,
      totalMultiplier: Number(this.totalScoreMultiplier.toFixed(2)),
      xp: this.xp,
      xpToNext: this.xpToNext,
      level: this.level,
      pendingDraft: !!this.pendingDraft,
      bountyCredits: this.bountyCredits,
      freeRerolls: this.freeRerolls,
      nextMilestone,
      style: {
        rank: styleRank.id,
        multiplier: styleRank.multiplier,
        color: styleRank.color,
        points: this.stylePoints,
      },
      boss: bossHud,
      laneCollapse: this.laneCollapse ? { ...this.laneCollapse } : null,
      isEndless,
      state: this.state,
      countdown: this.countdown,
      elapsed: this.elapsedTime,
      duration: this.duration,
      remaining,
      timeLabel,
      progress,
      distance,
      hp: this.hp,
      maxHp: this.maxHp,
      shield: this.shield,
      maxShield: this.maxShield,
      attack: this.attackDamage,
      attackMax: RUNNER_MAX_ATTACK,
      rapid: this.rapidFireTimer,
      rapidMax: RUNNER_RAPID_DURATION,
      score: this.score,
      reducedMotion: this.reducedMotion,
      combo: this.combo,
      section: this.section.name,
      sectionIndex: this.section.index,
      sectionNotice: this.sectionNotice,
      build: this._buildHudTags(),
      moduleChoicePending: this.moduleChoicePending,
      route: this.currentRoute
        ? {
            id: this.currentRoute.id,
            label: this.currentRoute.label,
            shortLabel: this.currentRoute.shortLabel,
            color: this.currentRoute.color,
            riskLabel: this.currentRoute.riskLabel,
            rewardLabel: this.currentRoute.rewardLabel,
          }
        : null,
      routes: RUNNER_ROUTE_IDS.map((id) => {
        const route = RUNNER_ROUTES[id]
        return {
          id,
          lane: route.lane,
          label: route.label,
          color: route.color,
          riskLabel: route.riskLabel,
          rewardLabel: route.rewardLabel,
        }
      }),
      lane: this.currentLane,
      targetLane: this.targetLane,
      switching: this.isSwitching,
      lanes: this._getLaneTelemetry(),
      fever: {
        active: this.isFeverActive,
        charges: this.feverCharges,
        maxCharges: this.maxFeverCharges,
        shards: this.feverShards,
        shardsPerCharge: RUNNER_FEVER_SHARDS_PER_CHARGE,
        timer: this.feverTimer,
        duration: RUNNER_FEVER_DURATION,
      },
      weapon: weapon
        ? {
            id: weapon.id,
            name: fusion ? fusion.name : weapon.name,
            shortName: weapon.shortName,
            description: fusion ? fusion.description : weapon.description,
            color: fusion ? fusion.color : weapon.color,
            level: this.weaponLevel,
            secondary: this.secondaryElement,
            fusionId: fusion?.id || null,
          }
        : null,
      buffs: {
        bulletTime: this.bulletTimeTimer,
        booster: this.hyperBoostTimer,
        drone: this.droneTimer,
      },
      weaponChoicePending: this.weaponChoicePending,
      secondaryChoicePending: this.secondaryChoicePending,
      weaponNotice: this.weaponNoticeTimer > 0 ? this.weaponNotice : '',
      fusion: this.fusionPresentation ? { ...this.fusionPresentation } : null,
    }
  }

  getResultSnapshot() {
    const weapon = this.weaponDefinition
    const fusion = this.fusionWeapon
    const isEndless = this.duration === Infinity
    const distance = isEndless
      ? Math.floor(this.elapsedTime * 85)
      : runnerDistanceRemaining(this.elapsedTime, this.duration, this.submodeConfig.distance)

    const rawDrops = Math.max(0, Math.round(this.score / 35))
    const earnedDrops = rawDrops > 2000 ? 2000 + Math.round((rawDrops - 2000) / 2) : rawDrops

    return {
      mode: 'runner',
      submode: this.submode,
      submodeName: this.submodeConfig.name,
      isEndless,
      outcome: this.outcome,
      title: isEndless
        ? `${this.submodeConfig.name} · 战绩结算`
        : this.outcome === 'victory'
        ? `${this.submodeConfig.name} · 突围成功`
        : `${this.submodeConfig.name} · 突围失败`,
      elapsed: this.elapsedTime,
      timeLabel: formatElapsedTime(this.elapsedTime),
      distance,
      score: this.score,
      earnedDrops,
      kills: this.kills,
      gates: this.gates,
      bestCombo: this.bestCombo,
      bestStyleRank: this.bestStyleRank,
      level: this.level,
      strain: { id: this.strain.id, name: this.strain.name, color: this.strain.color },
      chip: this.chip ? { id: this.chip.id, name: this.chip.name } : null,
      pacts: this.pacts.map((id) => RUNNER_HEAT_PACTS[id]?.name || id),
      bossDefeatedCount: this.bossDefeatedCount,
      hitsTaken: this.hitsTaken,
      damageTaken: this.damageTaken,
      shieldAbsorbed: this.shieldAbsorbed,
      shield: this.shield,
      perfectDodges: this.perfectDodges,
      feverCount: this.feverCount || 0,
      attack: this.attackDamage,
      modules: this.modules.map((m) => `${getRunnerWeaponModule(m.id, m.level)?.name} Lv.${m.level}`),
      kinetics: this.kinetics.map((k) => `${getRunnerKineticTrigger(k.id, k.level)?.name} Lv.${k.level}`),
      relics: this.relics.map((id) => RUNNER_BOSS_RELICS[id]?.name || id),
      weapon: weapon
        ? {
            id: weapon.id,
            name: fusion ? fusion.name : weapon.name,
            color: fusion ? fusion.color : weapon.color,
            level: this.weaponLevel,
            secondary: this.secondaryElement,
            fusionId: fusion?.id || null,
          }
        : null,
      tacticalStats: { ...this.tacticalStats },
      weaponStats: { ...this.weaponStats },
      seed: this._seed,
    }
  }

  renderWorld(ctx) {
    this.renderer.render(ctx)
  }

  destroy() {
    this.entities.length = 0
    this.bullets.length = 0
    this.enemyProjectiles.length = 0
    this.particles.length = 0
    this.floatingTexts.length = 0
    this.damageNumbers.length = 0
    this.groundFires.length = 0
    this.terrains.length = 0
    this.mines.length = 0
    this.clones.length = 0
    super.destroy()
  }
}

export { RUNNER_ENTITY_TYPES }
