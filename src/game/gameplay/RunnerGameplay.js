import { GameplayController } from './GameplayController.js'
import { Particle } from '../effects/Particle.js'
import { FloatingText } from '../effects/FloatingText.js'
import { RunnerDirector } from './runner/RunnerDirector.js'
import { RunnerRenderer } from './runner/RunnerRenderer.js'
import {
  RUNNER_BULLET_SPEED,
  RUNNER_COLLISION_DEPTH,
  RUNNER_COUNTDOWN,
  RUNNER_DURATION,
  RUNNER_DAMAGE_AGGREGATE_WINDOW,
  RUNNER_DASH_COOLDOWN,
  RUNNER_DASH_DURATION,
  RUNNER_DASH_IMPACT_DAMAGE,
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
  RUNNER_FUSION_WEAPONS,
  RUNNER_LANE_COMMIT_EPSILON,
  RUNNER_LANE_COUNT,
  RUNNER_LANE_LERP_PER_FRAME,
  RUNNER_MAX_ATTACK,
  RUNNER_MAX_BULLETS,
  RUNNER_MAX_CATCH_UP_SHOTS,
  RUNNER_MAX_DAMAGE_NUMBERS,
  RUNNER_MAX_ENEMY_PROJECTILES,
  RUNNER_MAX_GROUND_FIRES,
  RUNNER_MAX_HP,
  RUNNER_MAX_SHIELD,
  RUNNER_MUTATION_ARM_DEPTH,
  RUNNER_PLAYER_DEPTH,
  RUNNER_RAPID_DURATION,
  RUNNER_RAPID_MULTIPLIER,
  RUNNER_SECONDARY_ELEMENTS,
  RUNNER_SUBMODES,
  RUNNER_TACTICAL_ITEMS,
  createRunnerSeed,
  getRunnerForkTimes,
  getRunnerFusionWeapon,
  getRunnerRoute,
  getRunnerRouteByLane,
  getRunnerSection,
  getRunnerSubmode,
  getRunnerWeaponCore,
  runnerDistanceRemaining,
  runnerProgress,
} from './runner/RunnerRules.js'

const HIT_RING_LIFE = 0.22
const COMBO_WINDOW = 1.8
const CORE_RING_COLORS = {
  pierce: 'rgba(121, 217, 238, ALPHA)',
  burst: 'rgba(240, 179, 95, ALPHA)',
  corrosion: 'rgba(155, 223, 106, ALPHA)',
}
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
 * 极速突围：多模式三线自动射击跑酷系统。
 *
 * 支持 60秒极速闪击、180秒决战远征与无尽狂飙三档模式。
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

    this.submode = 'marathon'
    this.submodeConfig = getRunnerSubmode('marathon')
    this.duration = this.submodeConfig.duration

    this.state = 'countdown'
    this.outcome = null
    this.countdown = RUNNER_COUNTDOWN
    this.elapsedTime = 0
    this.visualTime = 0
    this.currentLane = 1
    this.targetLane = 1
    this.lanePosition = 1
    this.hp = RUNNER_MAX_HP
    this.maxHp = RUNNER_MAX_HP
    this.shield = 0
    this.maxShield = RUNNER_MAX_SHIELD
    this.attackDamage = 1
    this.rapidFireTimer = 0
    this.weaponCore = null
    this.secondaryElement = null
    this.weaponLevel = 0
    this.weaponChoicePending = false
    this.secondaryChoicePending = false
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
    this.weaponStats = { pierced: 0, explosions: 0, corrosionStacks: 0 }
    this.comboTimer = 0
    this.section = getRunnerSection(0)
    this.sectionNotice = 0
    // 路线分叉状态：currentRouteId 为 null 表示尚未做出第一次路线选择。
    this.currentRouteId = null
    this.nextForkIndex = 0
    this.activeForkId = null
    this.routeLog = []
    this._resolvedForkIds = new Set()
    this.damageFlash = 0
    this.shieldFlash = 0
    this.dashTimer = 0
    this.dashCooldown = 0
    this.dashKills = 0
    this.feverShards = 0
    this.feverCharges = 0
    this.feverTimer = 0
    this.feverCount = 0
    this.bulletTimeTimer = 0
    this.hyperBoostTimer = 0
    this.droneTimer = 0
    this.droneLane = 0
    this.groundFires = []
    this.tacticalStats = { magnets: 0, bulletTimes: 0, boosters: 0, drones: 0, barrels: 0 }
    this.reducedMotion = false

    this._seed = createRunnerSeed()
    this._encounterTimer = 0
    this._fireCooldown = 0
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

  /**
   * 世界时间缩放：子弹时间生效时取 RunnerRules 声明的 dilation，否则正常速度。
   * 仅作用于「环境」推进（敌人、敌方弹幕、地火）；玩家输入、玩家弹道、
   * 刷怪节奏与局内计时一律仍用真实 dt，见 updateWorld。
   */
  get worldTimeScale() {
    return this.bulletTimeTimer > 0 ? RUNNER_TACTICAL_ITEMS.bullet_time.dilation : 1
  }

  /**
   * 战术道具生命周期：按真实 dt 递减并夹紧到 0。
   * bulletTimeTimer 自身不参与 worldTimeScale，否则持续时间会被放大。
   */
  _updateTacticalBuffs(dt) {
    this.bulletTimeTimer = Math.max(0, this.bulletTimeTimer - dt)
    this.hyperBoostTimer = Math.max(0, this.hyperBoostTimer - dt)
    this.droneTimer = Math.max(0, this.droneTimer - dt)
  }

  /** 推入一块地火并维持上限：超限时淘汰最旧的一块，防止长局无界增长。 */
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

  get fusionWeapon() {
    return getRunnerFusionWeapon(this.weaponCore, this.secondaryElement)
  }

  /** 当前已锁定的路线；第一次岔口之前为 null。 */
  get currentRoute() {
    return getRunnerRoute(this.currentRouteId)
  }

  /** 路线对遭遇密度的最小覆盖；未选路线时为 1，与 Phase B 前完全一致。 */
  get routeSpawnIntervalScale() {
    return this.currentRoute?.spawnIntervalMultiplier ?? 1
  }

  reset(seed, submode = this.submode || 'marathon') {
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

    this.submode = (typeof submode === 'string' && submode) ? submode : (submode?.submode || 'marathon')
    this.submodeConfig = getRunnerSubmode(this.submode)
    this.duration = this.submodeConfig.duration

    this.state = 'countdown'
    this.outcome = null
    this.countdown = RUNNER_COUNTDOWN
    this.elapsedTime = 0
    this.visualTime = 0
    this.currentLane = 1
    this.targetLane = 1
    this.lanePosition = 1
    this.hp = RUNNER_MAX_HP
    this.maxHp = RUNNER_MAX_HP
    this.shield = 0
    this.maxShield = RUNNER_MAX_SHIELD
    this.attackDamage = 1
    this.rapidFireTimer = 0
    this.weaponCore = null
    this.secondaryElement = null
    this.weaponLevel = 0
    this.weaponChoicePending = false
    this.secondaryChoicePending = false
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
    this.weaponStats = { pierced: 0, explosions: 0, corrosionStacks: 0 }
    this.comboTimer = 0
    this.section = getRunnerSection(0, this.submode)
    this.sectionNotice = 1.8
    this.currentRouteId = null
    this.nextForkIndex = 0
    this.activeForkId = null
    this.routeLog = []
    this._resolvedForkIds = new Set()
    this.damageFlash = 0
    this.shieldFlash = 0
    this.dashTimer = 0
    this.dashCooldown = 0
    this.dashKills = 0
    this.feverShards = 0
    this.feverCharges = 0
    this.feverTimer = 0
    this.feverCount = 0
    this.bulletTimeTimer = 0
    this.hyperBoostTimer = 0
    this.droneTimer = 0
    this.droneLane = 0
    this.groundFires = []
    this.tacticalStats = { magnets: 0, bulletTimes: 0, boosters: 0, drones: 0, barrels: 0 }

    this._encounterTimer = 0
    this._fireCooldown = 0
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
    return this
  }

  restart(seed, submode = this.submode) {
    return this.reset(seed, submode)
  }

  updateWorld(dt) {
    if (!this.game || dt <= 0 || this.state === 'finished') return
    this.visualTime += dt
    this._updateEffects(dt)
    this._updateLaneInput(dt)
    this.dashTimer = Math.max(0, this.dashTimer - dt)
    this.dashCooldown = Math.max(0, this.dashCooldown - dt)

    if (this.state === 'countdown') {
      this.game.input.consumeDash?.()
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

    const nextSection = getRunnerSection(this.elapsedTime, this.submode)
    if (nextSection.id !== this.section.id) {
      this.section = nextSection
      this.sectionNotice = 2.2
      this.game.sound.wave?.()
    } else {
      this.section = nextSection
    }

    this._updateWeaponProgression()
    this._updateForkSchedule()
    this._updateDirector(dt)
    // 世界推进按子弹时间 dilation 缩放；刷怪节奏保持真实 dt，避免改变刷怪数量。
    const worldDt = dt * this.worldTimeScale
    this._updateEntities(worldDt)
    this._updateEnemyProjectiles(worldDt)
    if (this.state !== 'active') return
    this._updateGroundFires(worldDt)
    this._updateShooting(dt)

    if (this.duration !== Infinity && this.elapsedTime >= this.duration) {
      this._finish('victory')
    }
  }

  _updateLaneInput(dt) {
    const input = this.game.input.state
    const left = !!input.left
    const right = !!input.right
    if (left && !this._prevLeft) this.targetLane = Math.max(0, this.targetLane - 1)
    if (right && !this._prevRight) this.targetLane = Math.min(RUNNER_LANE_COUNT - 1, this.targetLane + 1)
    this._prevLeft = left
    this._prevRight = right

    if (this.state === 'active' && this.game.input.consumeDash?.() && this.dashCooldown <= 0) {
      const direction = right && !left ? 1 : left && !right ? -1 : this._safestDashDirection()
      const nextLane = clamp(this.currentLane + direction, 0, RUNNER_LANE_COUNT - 1)
      if (nextLane !== this.currentLane) {
        this.targetLane = nextLane
        this.lanePosition = nextLane
        this.currentLane = nextLane
        this.dashTimer = RUNNER_DASH_DURATION
        this.dashCooldown = RUNNER_DASH_COOLDOWN
        this._lastLaneSwitchAt = this.visualTime
        this._shake(2.5, 0.12)
        const point = this.renderer.project(nextLane, RUNNER_PLAYER_DEPTH)
        this._burst(point.x, point.y, '#d8f7eb', 5, true)
        this.game.sound.dash?.()
        this._applyDashImpact(nextLane)
      }
    }

    const k = this.reducedMotion ? 1 : 1 - Math.pow(1 - RUNNER_LANE_LERP_PER_FRAME, dt * 60)
    this.lanePosition += (this.targetLane - this.lanePosition) * k
    if (Math.abs(this.lanePosition - this.targetLane) <= RUNNER_LANE_COMMIT_EPSILON) {
      if (this.currentLane !== this.targetLane) this._lastLaneSwitchAt = this.visualTime
      this.lanePosition = this.targetLane
      this.currentLane = this.targetLane
    }
  }

  _applyDashImpact(lane) {
    let impacted = 0
    for (const entity of this.entities) {
      if (!entity.active || entity.lane !== lane || entity.kind !== 'enemy') continue
      if (entity.depth >= 0.70 && entity.depth <= 1.05) {
        entity.hp -= RUNNER_DASH_IMPACT_DAMAGE
        entity.hitFlash = 0.25
        const point = this.renderer.project(entity.lane, entity.depth)
        this._showDamageNumber(`dash-${entity.id}`, point.x, point.y, RUNNER_DASH_IMPACT_DAMAGE, 'burst')
        this._burst(point.x, point.y, '#ffd166', 8, true)
        impacted++
        if (entity.hp <= 0) {
          this.dashKills = (this.dashKills || 0) + 1
          this._defeatEntity(entity)
          this.floatingTexts.push(new FloatingText(point.x, point.y - 20, '冲撞击破!', '', '#ffe066', 15))
          this._collectFeverShard(point)
        }
      }
    }
    if (impacted > 0) {
      this._shake(4.5, 0.18)
      this.game.sound.hit?.('spark')
    }
  }

  activateFever() {
    if (this.feverCharges <= 0) return false
    this.feverCharges -= 1
    this.feverTimer = RUNNER_FEVER_DURATION
    this.feverCount = (this.feverCount || 0) + 1
    const p = this.renderer.project(this.currentLane, RUNNER_PLAYER_DEPTH)
    this.floatingTexts.push(
      new FloatingText(
        this.renderer.lanePositionX(this.lanePosition),
        this.renderer.playerY - 45,
        '狂热暴走 FEVER!!',
        '',
        '#ffd166',
        22
      )
    )
    this._shake(6.5, 0.35)
    this.game.sound.levelUp?.()
    this._burst(p.x, p.y, '#ffd166', 20, true)
    return true
  }

  _collectFeverShard(point) {
    if (this.feverCharges < RUNNER_FEVER_MAX_CHARGES) {
      this.feverShards += 1
      if (this.feverShards >= RUNNER_FEVER_SHARDS_PER_CHARGE) {
        this.feverShards = 0
        this.feverCharges = Math.min(RUNNER_FEVER_MAX_CHARGES, this.feverCharges + 1)
        this.floatingTexts.push(
          new FloatingText(point.x, point.y - 26, '暴走就绪 +1 [按F释放]', '', '#ffd166', 18)
        )
        this.game.sound.levelUp?.()
        this._burst(point.x, point.y, '#ffd166', 12, true)
      } else {
        this.floatingTexts.push(
          new FloatingText(
            point.x,
            point.y - 26,
            `暴走印记 ${this.feverShards}/${RUNNER_FEVER_SHARDS_PER_CHARGE}`,
            '',
            '#ffe066',
            16
          )
        )
        this.game.sound.pickup?.()
      }
    } else {
      this.score += 150
      this.floatingTexts.push(
        new FloatingText(point.x, point.y - 26, '暴走充盈 · 分数 +150', '', '#ffd166', 16)
      )
      this.game.sound.pickup?.()
    }
  }

  _safestDashDirection() {
    const risks = this._getLaneRisks()
    const left = this.currentLane > 0 ? risks[this.currentLane - 1] : Infinity
    const right = this.currentLane < RUNNER_LANE_COUNT - 1 ? risks[this.currentLane + 1] : Infinity
    if (left === Infinity && right === Infinity) return 0
    return left <= right ? -1 : 1
  }

  _getLaneRisks() {
    const risks = [0, 0, 0]
    for (const entity of this.entities) {
      // 路线牌不是威胁：排除后车道风险读数才反映真实危险，岔口可读性不被污染。
      if (!entity.active || entity.kind === 'mutation' || entity.kind === 'gate' || entity.kind === 'fork') continue
      const urgency = clamp((entity.depth - 0.34) / 0.66, 0, 1)
      let weight = urgency * (1 + Math.max(0, entity.damage || 0) * 0.42)
      if (entity.charging) weight += 0.9
      if (entity.attacking) {
        if (entity.behavior === 'archer') weight += 1.45
        if (entity.behavior === 'mage' && entity.attackLanes) {
          for (const lane of entity.attackLanes) risks[lane] += 1.65
        }
      }
      risks[clamp(entity.lane, 0, RUNNER_LANE_COUNT - 1)] += weight
    }
    for (const projectile of this.enemyProjectiles) {
      if (!projectile.active) continue
      const urgency = clamp((projectile.depth - 0.38) / 0.58, 0, 1)
      risks[projectile.lane] += 1.1 + urgency * 2.4
    }
    return risks
  }

  _getLaneTelemetry() {
    const risks = this._getLaneRisks()
    return risks.map((risk, lane) => {
      const activeMage = this.entities.find(
        (entity) => entity.active && entity.behavior === 'mage' && entity.attacking && entity.attackLanes?.includes(lane)
      )
      const activeArcher = this.entities.find(
        (entity) => entity.active && entity.behavior === 'archer' && entity.attacking && entity.attackLane === lane
      )
      const hasBarrier = this.entities.some(
        (entity) => entity.active && entity.kind === 'hazard' && entity.lane === lane && entity.depth > 0.15
      )
      const isCharging = this.entities.some(
        (entity) => entity.active && entity.lane === lane && (entity.charging || entity.chargeTelegraph > 0)
      )
      const status = risk >= 2.6 || isCharging ? 'danger' : risk >= 0.85 || hasBarrier ? 'warning' : 'open'
      const intent = isCharging ? '冲锋' : activeMage ? '封锁' : activeArcher ? '瞄准' : hasBarrier ? '路障' : status === 'danger' ? '逼近' : status === 'warning' ? '注意' : '开放'
      return { lane, risk: Math.min(1, risk / 4.8), status, intent }
    })
  }

  _registerPerfectDodge(lane, depth) {
    if (this.visualTime - this._lastLaneSwitchAt > RUNNER_DODGE_WINDOW) return false
    if (this.visualTime - this._lastDodgeAt < 0.28) return false
    this._lastDodgeAt = this.visualTime
    this.perfectDodges += 1
    this.score += 20
    this.dashCooldown = Math.max(0, this.dashCooldown - RUNNER_DASH_COOLDOWN * 0.35)
    const safeDepth = Math.min(RUNNER_COLLISION_DEPTH, depth || RUNNER_COLLISION_DEPTH)
    const point = this.renderer.project(lane, safeDepth)
    this._collectFeverShard(point)
    this.rings.push({
      lane,
      depth: safeDepth,
      life: 0.28,
      maxLife: 0.28,
      color: 'rgba(128, 226, 210, ALPHA)',
      radiusScale: 1.35,
    })
    this.floatingTexts.push(new FloatingText(point.x, point.y - 24, '极限闪避  +20', '', '#8de3d7', 16))
    this.game.sound.pickup?.()
    return true
  }

  _updateDirector(dt) {
    if (this.weaponChoicePending) return
    this._encounterTimer -= dt
    if (this._encounterTimer > 0) return
    const encounter = this.director.createEncounter(
      this.elapsedTime,
      this.entities.length,
      this.submode,
      this.currentRouteId
    )
    if (encounter.length) this.entities.push(...encounter)
    this._encounterTimer = this.section.spawnInterval * this.routeSpawnIntervalScale
  }

  /**
   * 岔口时刻表完全确定，不消费任何 RNG，到点即在三条车道各放一块路线牌。
   * 刻意不受 weaponChoicePending / secondaryChoicePending 阻塞：这两个标志
   * 存在「玩家未驶入变异门则永不复位」的历史缺陷，一旦被它挡住，路线分叉
   * 也会跟着整局停摆。该缺陷属 FOLLOW-UP，本轮不修。
   */
  _updateForkSchedule() {
    const forkTimes = getRunnerForkTimes(this.submode)
    if (this.nextForkIndex >= forkTimes.length) return
    if (this.elapsedTime < forkTimes[this.nextForkIndex]) return
    const row = this.director.createForkRow(this.nextForkIndex, this.elapsedTime, this.submode)
    this.entities.push(...row)
    this.activeForkId = this.nextForkIndex
    this.nextForkIndex += 1
  }

  /**
   * 锁定岔口对应的路线：读取玩家此刻实际所在车道，映射到固定路线。
   * 路线牌会在解析深度停留多帧，因此用 _resolvedForkIds 保证一个岔口只解析一次，
   * 重复调用直接拒绝，不改写 currentRouteId、也不重复推送提示。
   */
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
    this._showNotice(`路线 · ${route.label}`, route.color)
    return true
  }

  _updateWeaponProgression() {
    const choiceTime = this.submodeConfig?.weaponChoiceTime ?? 25
    const evolveTime = this.submodeConfig?.weaponEvolveTime ?? 65
    const overdriveTime = this.submodeConfig?.weaponOverdriveTime ?? 110

    if (!this._weaponChoiceTriggered && this.elapsedTime >= choiceTime) {
      this._weaponChoiceTriggered = true
      this._startWeaponChoice()
    }
    if (!this._secondaryChoiceTriggered && this.elapsedTime >= evolveTime) {
      this._secondaryChoiceTriggered = true
      this._startSecondaryChoice()
    }
    if (!this._weaponOverdrive && this.elapsedTime >= overdriveTime) {
      this._weaponOverdrive = this._upgradeWeaponCore(3, '终极超载')
    }
  }

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
    this.score += 250
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
    this.score += 300
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
      description: core.description || descriptions[level - 1],
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
    return this.weaponDefinition?.levels[Math.max(0, this.weaponLevel - 1)] || null
  }

  _updateEntities(dt) {
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const entity = this.entities[i]
      if (!entity.active) {
        this.entities.splice(i, 1)
        continue
      }
      entity.previousDepth = entity.depth
      if (entity.behavior === 'charge') this._updateCharger(entity, dt)
      else if (entity.behavior === 'archer' || entity.behavior === 'mage') {
        this._updateRangedEnemy(entity, dt)
      }
      else entity.depth += entity.speed * dt
      entity.hitFlash = Math.max(0, entity.hitFlash - dt)

      // 路线牌：到达解析深度时锁定路线，随后整行移除。
      // 既不参与碰撞也不可被子弹命中，因此必须先于通用命中/伤害分支处理。
      if (entity.kind === 'fork') {
        if (!entity.resolved && entity.depth >= RUNNER_FORK_SELECT_DEPTH) this._resolveFork(entity)
        if (entity.resolved || entity.depth >= RUNNER_FORK_CLEAR_DEPTH) {
          entity.active = false
          this.entities.splice(i, 1)
        }
        continue
      }

      if (entity.depth < RUNNER_COLLISION_DEPTH) continue

      const collides = entity.lane === this.occupiedLane
      if (entity.kind === 'mutation') {
        if (collides) this._selectWeaponCore(entity.weaponCore)
        entity.active = false
        this.entities.splice(i, 1)
        continue
      }
      if (entity.kind !== 'gate') {
        if (collides) this._takeDamage(entity)
        else this._registerPerfectDodge(entity.lane, entity.depth)
      }
      this.entities.splice(i, 1)
      if (this.state === 'finished') return
    }
  }

  _updateCharger(entity, dt) {
    if (!entity.chargeStarted && entity.depth >= entity.chargeAt) {
      entity.chargeStarted = true
      entity.chargeTelegraph = entity.chargeDelay
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
    entity.depth += entity.speed * dt
  }

  _updateRangedEnemy(entity, dt) {
    if (entity.attacking) {
      entity.attackTimer = Math.max(0, entity.attackTimer - dt)
      if (entity.attackTimer <= 0) {
        if (entity.behavior === 'archer') this._spawnEnemyArrow(entity)
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
      entity.attackTimer = entity.attackDelay
      entity.speed = 0
      if (entity.behavior === 'archer') {
        entity.attackLane = this.occupiedLane
      } else {
        const safeLanes = [0, 1, 2].filter((lane) => lane !== this.occupiedLane)
        entity.safeLane = safeLanes[Math.floor(this.director.random() * safeLanes.length)]
        entity.attackLanes = [0, 1, 2].filter((lane) => lane !== entity.safeLane)
      }
      this._enemyAttackCooldown = entity.attackDelay + RUNNER_ENEMY_ATTACK_GAP
      return
    }

    entity.depth += entity.speed * dt
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
    if (this.dashTimer > 0 || this.hyperBoostTimer > 0) {
      this._registerPerfectDodge(entity.lane ?? this.occupiedLane, RUNNER_COLLISION_DEPTH)
      return
    }
    const incoming = Math.max(1, entity.damage)
    const absorbed = Math.min(this.shield, incoming)
    const hpDamage = incoming - absorbed
    this.shield -= absorbed
    this.hp = Math.max(0, this.hp - hpDamage)
    this.hitsTaken += 1
    this.damageTaken += hpDamage
    this.shieldAbsorbed += absorbed
    this.combo = 0
    this.comboTimer = 0
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

  _updateShooting(dt) {
    const interval = RUNNER_FIRE_INTERVAL / (this.rapidFireTimer > 0 ? RUNNER_RAPID_MULTIPLIER : 1)
    this._fireCooldown -= dt
    let shots = 0
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
              this.bullets.push(this._createBullet(lane))
            }
          }
        } else {
          this.bullets.push(this._createBullet(this.currentLane))
        }
        if (this.droneTimer > 0 && this.bullets.length < RUNNER_MAX_BULLETS) {
          this.bullets.push(this._createBullet(this.droneLane))
        }
        this.game.sound.shoot?.(this.rapidFireTimer > 0 || this.isFeverActive ? 'spark' : 'base', 0.65)
      }
      shots++
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i]
      bullet.previousDepth = bullet.depth
      bullet.depth -= RUNNER_BULLET_SPEED * dt
      let target = null
      let targetIsProjectile = false
      for (const entity of this.entities) {
        if (!entity.active || entity.lane !== bullet.lane || entity.hp <= 0) continue
        if (entity.kind === 'mutation' && entity.depth < RUNNER_MUTATION_ARM_DEPTH) continue
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
        const canPierce =
          (bullet.core === 'pierce' || bullet.fever) && bullet.remainingHits > 0 && target.kind !== 'mutation'
        if (targetIsProjectile) this._hitEnemyProjectile(target, bullet)
        else this._hitEntity(target, bullet)
        if (bullet.explosive) this._explodeAt(target, bullet)
        if (canPierce) {
          bullet.remainingHits -= 1
          bullet.damageMultiplier *= bullet.pierceDecay
          // 保留在刚穿过目标的位置，下一帧继续检查本帧跨过的后续目标。
          bullet.depth = target.depth - 0.003
          this.weaponStats.pierced += 1
        } else {
          this.bullets.splice(i, 1)
        }
      } else if (bullet.depth <= 0) {
        this.bullets.splice(i, 1)
      }
    }
  }

  _createBullet(lane = this.currentLane) {
    this._shotSerial += 1
    const core = this.weaponDefinition
    const config = this.weaponLevelConfig
    const isBurst = core?.id === 'burst'
    const isFever = this.isFeverActive
    return {
      lane,
      depth: RUNNER_PLAYER_DEPTH - 0.055,
      previousDepth: RUNNER_PLAYER_DEPTH - 0.055,
      core: core?.id || null,
      coreLevel: this.weaponLevel,
      color: isFever ? '#ffd166' : core?.color || '#ffe39a',
      fever: isFever,
      damageMultiplier: isFever ? 1.3 : 1,
      remainingHits: (core?.id === 'pierce' ? config.penetrations : 0) + (isFever ? 1 : 0),
      pierceDecay: core?.id === 'pierce' ? config.decay : 0.88,
      explosive: !!(isBurst && this._shotSerial % config.every === 0),
      size: (this.attackDamage >= 5 ? 1.24 : this.attackDamage >= 3 ? 1.12 : 1) * (isFever ? 1.35 : 1),
    }
  }

  _hitEntity(entity, source = null, options = {}) {
    if (!entity?.active) return { killed: false, damage: 0 }
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
    this._showDamageNumber(
      `entity-${entity.id}`,
      this.renderer.project(entity.lane, entity.depth).x,
      this.renderer.project(entity.lane, entity.depth).y,
      appliedDamage,
      this._damageStyleFor(entity, source, options),
      entity.corrosionStacks || 0
    )
    if (entity.hp > 0) return { killed: false, damage }

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
    this.score += 40
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
    if (coreId === 'pierce') return 'pierce'
    if ((entity.armor || 0) > 0 || this._supportReductionFor(entity) > 0) return 'armor'
    return 'normal'
  }

  _showDamageNumber(key, x, y, value, style = 'normal', stacks = 0) {
    const existing = this.damageNumbers.find(
      (number) => number.key === key && number.aggregateTimer > 0 && number.active
    )
    if (existing) {
      existing.value += value
      existing.stacks = Math.max(existing.stacks, stacks)
      existing.style = style === 'normal' ? existing.style : style
      existing.life = existing.maxLife
      existing.aggregateTimer = RUNNER_DAMAGE_AGGREGATE_WINDOW
      existing.pulse = 1
      return existing
    }

    const number = {
      key,
      x,
      y,
      value,
      style,
      stacks,
      life: 0.72,
      maxLife: 0.72,
      aggregateTimer: RUNNER_DAMAGE_AGGREGATE_WINDOW,
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
    const level = clamp(source?.coreLevel || this.weaponLevel || 1, 1, 3)
    const config = core?.levels[level - 1]
    let damage = this.attackDamage * (source?.damageMultiplier || 1)

    if (coreId === 'corrosion' && entity.kind !== 'gate' && entity.kind !== 'mutation' && entity.kind !== 'secondary_mutation') {
      const stacks = entity.corrosionStacks || 0
      damage *= 1 + stacks * config.stackBonus
      entity.corrosionStacks = Math.min(config.maxStacks, stacks + 1)
      this.weaponStats.corrosionStacks += 1
      if (entity.kind === 'hazard' || entity.kind === 'obstacle') damage *= config.barrierDamage
    }

    if (this.fusionWeapon?.id === 'corrosion_frost' && (entity.frostTimer > 0 || entity.freezeTimer > 0)) {
      damage *= 1.4
    }

    if (entity.armor > 0) {
      const armorPierce = coreId === 'corrosion' ? config.armorPierce : 0
      damage *= 1 - entity.armor * (1 - armorPierce)
    }

    const supportReduction = this._supportReductionFor(entity)
    if (supportReduction > 0) damage *= 1 - supportReduction
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
    const config = core.levels[clamp(bullet.coreLevel, 1, 3) - 1]
    const fusion = this.fusionWeapon
    const radiusMultiplier = fusion?.id === 'burst_flame' ? 1.5 : (fusion?.id === 'burst_frost' ? 1.25 : 1)
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

    if (fusion?.id === 'burst_flame') {
      const existing = this.groundFires.find(
        (f) => f.lane === primary.lane && Math.abs(f.depth - primary.depth) < 0.08
      )
      if (existing) {
        existing.duration = Math.max(existing.duration, 3.0)
      } else {
        this._pushGroundFire(primary.lane, primary.depth, 3.0, 1.0)
      }
    }

    if (fusion?.id === 'burst_lightning') {
      const adjLanes = [primary.lane - 1, primary.lane + 1].filter((l) => l >= 0 && l < 3)
      for (const adjLane of adjLanes) {
        for (const target of this.entities) {
          if (target.active && target.lane === adjLane && Math.abs(target.depth - primary.depth) <= 0.12) {
            this._hitEntity(target, { core: 'burst', damageMultiplier: 0.75 }, { silent: true, splash: true })
            this.rings.push({ lane: adjLane, depth: target.depth, life: 0.2, maxLife: 0.2, color: '#ffd859' })
            break
          }
        }
      }
    }

    const targets = this.entities.filter(
      (entity) =>
        entity.active &&
        (primary.kind === 'arrow' || entity.id !== primary.id) &&
        entity.lane === primary.lane &&
        entity.kind !== 'mutation' &&
        entity.kind !== 'secondary_mutation' &&
        Math.abs(entity.depth - primary.depth) <= radius
    )
    for (const entity of targets) {
      if (fusion?.id === 'burst_frost') {
        entity.freezeTimer = 1.2
        entity.speed = 0
      }
      this._hitEntity(
        entity,
        { core: 'burst', coreLevel: bullet.coreLevel, damageMultiplier: config.damage },
        { silent: true, splash: true }
      )
    }
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
        { core: 'burst', coreLevel: bullet.coreLevel, damageMultiplier: config.damage },
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
    if (entity.kind === 'gate') {
      this._applyReward(entity, point)
      return
    }
    if (entity.behavior === 'barrel') {
      this._triggerBarrelExplosion(entity)
      return
    }
    if (entity.type === 'gold_convoy') {
      this.score += 1500
      this.shield = this.maxShield
      this.feverCharges = RUNNER_FEVER_MAX_CHARGES
      this.feverShards = 0
      this._showNotice('运宝车击破 · 满能量&全护盾 💰', '#fbbf24')
      this.game.sound.levelUp?.()
      return
    }

    if (entity.corrosionStacks > 0 && this.secondaryElement === 'flame') {
      this.rings.push({
        lane: entity.lane,
        depth: entity.depth,
        life: 0.3,
        maxLife: 0.3,
        color: '#ff9a42',
        radiusScale: 2.2,
      })
      const splashTargets = this.entities.filter(
        (other) => other.active && other.lane === entity.lane && Math.abs(other.depth - entity.depth) <= 0.09
      )
      for (const splash of splashTargets) {
        this._hitEntity(splash, { core: 'corrosion', damageMultiplier: 2.2 }, { silent: true, splash: true })
      }
    }

    this.kills += 1
    this.combo += 1
    this.bestCombo = Math.max(this.bestCombo, this.combo)
    this.comboTimer = COMBO_WINDOW
    const comboBonus = 1 + Math.min(1.5, Math.max(0, this.combo - 1) * 0.08)
    const gained = Math.round(
      (entity.score || 0) * comboBonus * (this.isFeverActive ? RUNNER_FEVER_SCORE_MULTIPLIER : 1)
    )
    this.score += gained
    this.game.sound.kill?.(this.combo)
    this.floatingTexts.push(new FloatingText(point.x, point.y - 18, `+${gained}`, '', '#f5d778', 18))
    if (entity.behavior === 'split') {
      const fragments = this.director.createFragments(entity, this.elapsedTime, this.entities.length)
      this.entities.push(...fragments)
    }
  }

  _applyReward(entity, point) {
    this.gates += 1
    this.score += entity.score || 0
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
    let label = ''
    if (entity.reward === 'attack') {
      if (this.attackDamage < RUNNER_MAX_ATTACK) {
        this.attackDamage += 1
        const milestone = this.attackDamage === 3
          ? ' · 弹体增幅'
          : this.attackDamage === 5
          ? ' · 高能弹体'
          : ''
        label = `攻击提升至 ${this.attackDamage}${milestone}`
      } else {
        this.score += 100
        label = '攻击已满 · 分数 +100'
      }
      this.game.sound.levelUp?.()
    } else if (entity.reward === 'rapid') {
      this.rapidFireTimer = Math.min(RUNNER_RAPID_DURATION * 1.5, this.rapidFireTimer + RUNNER_RAPID_DURATION)
      label = `急速射击 ${Math.ceil(this.rapidFireTimer)} 秒`
      this.game.sound.pickup?.()
    } else if (entity.reward === 'repair') {
      const before = this.hp
      this.hp = Math.min(this.maxHp, this.hp + 1)
      label = this.hp > before ? '生命修复 +1' : '生命已满 · 分数 +60'
      if (this.hp === before) this.score += 60
      this.game.sound.pickup?.()
    } else {
      const before = this.shield
      this.shield = Math.min(this.maxShield, this.shield + 1)
      label = this.shield > before ? '防护凝胶 +1' : '防护已满 · 分数 +80'
      if (this.shield === before) this.score += 80
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

    for (const other of this.entities) {
      if (!other.active || other.id === entity.id) continue
      if (Math.abs(other.depth - entity.depth) <= 0.14) {
        other.hp -= 12
        other.hitFlash = 0.2
        if (other.hp <= 0) this._defeatEntity(other)
      }
    }

    for (const proj of this.enemyProjectiles) {
      if (proj.active && Math.abs(proj.depth - entity.depth) <= 0.18) {
        proj.active = false
      }
    }

    this._pushGroundFire(entity.lane, entity.depth, 3.0, 1.0)
  }

  _activateMagnet(point) {
    this.tacticalStats.magnets++
    this.score += 200
    this._showNotice('全息磁暴 · 聚能吸纳 🧲', '#4db8ff')
    this.game.sound.powerUp?.()

    const targets = this.entities.filter((e) => e.active && (e.kind === 'gate' || e.reward))
    for (const target of targets) {
      target.active = false
      const idx = this.entities.indexOf(target)
      if (idx >= 0) this.entities.splice(idx, 1)
      this._applyReward(target, this.renderer.project(target.lane, target.depth))
    }
  }

  _activateBulletTime(point) {
    this.tacticalStats.bulletTimes++
    this.bulletTimeTimer = RUNNER_TACTICAL_ITEMS.bullet_time.duration
    this.score += 150
    this._showNotice('时空力场 · 子弹时间 ⏳', '#6ee7b7')
    this.game.sound.powerUp?.()
  }

  _activateHyperBooster(point) {
    this.tacticalStats.boosters++
    this.hyperBoostTimer = RUNNER_TACTICAL_ITEMS.booster.duration
    this.score += 150
    this._showNotice('超频冲刺 · 金身横冲 🚀', '#f59e0b')
    this.game.sound.dash?.()
  }

  _activateDrone(point) {
    this.tacticalStats.drones++
    this.droneTimer = RUNNER_TACTICAL_ITEMS.drone.duration
    this.droneLane = this.currentLane === 0 ? 1 : this.currentLane === 2 ? 1 : 0
    this.score += 150
    this._showNotice('浮游史莱姆 · 协同射击 🤖', '#ec4899')
    this.game.sound.powerUp?.()
  }

  _showNotice(text, color = '#ffd166') {
    this.weaponNotice = text
    this.weaponNoticeTimer = 2.4
    const point = this.renderer.project(this.currentLane, RUNNER_PLAYER_DEPTH)
    this.floatingTexts.push(new FloatingText(point.x, point.y - 35, text, '', color, 19))
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
      for (const entity of this.entities) {
        if (
          entity.active &&
          entity.hp > 0 &&
          entity.lane === fire.lane &&
          Math.abs(entity.depth - fire.depth) <= 0.12
        ) {
          const burnDps = Math.max(4, this.attackDamage * 0.85 + (fire.damage || 1) * 3)
          const dmg = burnDps * dt
          const applied = Math.min(entity.hp, dmg)
          entity.hp -= dmg
          entity.hitFlash = 0.08
          const point = this.renderer.project(entity.lane, entity.depth)
          this._showDamageNumber(`burn-${entity.id}`, point.x, point.y - 12, applied, 'burst')
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
    if (outcome === 'victory') {
      const timeBonus = this.duration !== Infinity ? Math.round((this.duration - this.elapsedTime) * 40) : 0
      this.score += this.hp * 250 + timeBonus
      this.game.sound.levelUp?.()
    } else {
      this.game.sound.gameOver?.()
    }
    this.game.finishGameplay?.(this.getResultSnapshot())
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

    return {
      mode: 'runner',
      submode: this.submode,
      submodeName: this.submodeConfig.name,
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
      combo: this.combo,
      section: this.section.name,
      sectionIndex: this.section.index,
      sectionNotice: this.sectionNotice,
      route: this.currentRoute
        ? {
            id: this.currentRoute.id,
            label: this.currentRoute.label,
            shortLabel: this.currentRoute.shortLabel,
            color: this.currentRoute.color,
          }
        : null,
      lane: this.currentLane,
      targetLane: this.targetLane,
      switching: this.isSwitching,
      lanes: this._getLaneTelemetry(),
      dash: {
        active: this.dashTimer > 0,
        cooldown: this.dashCooldown,
        maxCooldown: RUNNER_DASH_COOLDOWN,
      },
      fever: {
        active: this.isFeverActive,
        charges: this.feverCharges,
        maxCharges: RUNNER_FEVER_MAX_CHARGES,
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
      kills: this.kills,
      gates: this.gates,
      bestCombo: this.bestCombo,
      hitsTaken: this.hitsTaken,
      damageTaken: this.damageTaken,
      shieldAbsorbed: this.shieldAbsorbed,
      shield: this.shield,
      perfectDodges: this.perfectDodges,
      dashKills: this.dashKills || 0,
      feverCount: this.feverCount || 0,
      attack: this.attackDamage,
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
    super.destroy()
  }
}

export { RUNNER_ENTITY_TYPES }
