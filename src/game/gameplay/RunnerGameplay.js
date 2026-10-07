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
  RUNNER_ROUTES,
  RUNNER_ROUTE_IDS,
  RUNNER_WEAPON_MODULE_IDS,
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
  getRunnerWeaponModule,
  runnerDistanceRemaining,
  runnerProgress,
} from './runner/RunnerRules.js'
import { findRunnerEffect, getRunnerBulletProfile, planRunnerEffects } from './runner/RunnerEffects.js'

const HIT_RING_LIFE = 0.22
const COMBO_WINDOW = 1.8
const CORE_RING_COLORS = {
  pierce: 'rgba(121, 217, 238, ALPHA)',
  burst: 'rgba(240, 179, 95, ALPHA)',
  corrosion: 'rgba(155, 223, 106, ALPHA)',
}
/**
 * 攻击来源（attack provenance）—— D1.3 单一来源规则，整个 Module 触发资格只有一个判据。
 *
 * 为什么不能再靠 procDepth：procDepth 是写在 source 上的一个数字，它只能挡住
 * 「同一个 source 对象直接递归」。一旦攻击跨过一层 fusion，效果层会构造一个**新的**
 * source（过载放电、爆炸 AoE、雷弧、火花、弹片、殉爆都是如此），新对象上没有那个数字，
 * 于是二级攻击重新获得 Module 触发资格：split 弹片 → 腐蚀过载 → 又一次 split。
 * 实测（修复前）C+L+S 单发就可以产生 4 次 split / 8 片弹片，而 maxProcDepth 全程 = 1。
 *
 * 规则（全部集中在本文件，调用点不需要各自记得传 flag）：
 *  1. 只有 `_createBullet` 会把 provenance 标成 PRIMARY —— 玩家弹体自身的直接命中
 *     是唯一允许触发 Module 的攻击，这是 primary 的唯一来源。
 *  2. 一切「生成型」攻击必须用 `_secondaryAttack()` 构造 source：它无条件盖 SECONDARY
 *     章，不读父攻击的资格，因此二级攻击的后代永远是二级，不存在「升格」路径。
 *  3. 弹体自身的二级化（回弹）只需要把弹体标成 SECONDARY，之后的每次命中都随之降级。
 *  4. `_applyModuleProc` 只认 PRIMARY，且**缺省按 SECONDARY 处理**：新写的调用点若忘记
 *     标记，只会少触发一次 Module，绝不可能造成无界正反馈（fail-safe 方向）。
 */
const ATTACK_PRIMARY = 'primary'
const ATTACK_SECONDARY = 'secondary'

/** 唯一判据：这次攻击是否有资格触发 Weapon Module。未标记一律视为二级攻击。 */
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
    // Shared world scroll used by the renderer and moving entities. Keeping one
    // accumulator prevents the road, roadside props, and threats from drifting
    // at visibly different speeds (especially during bullet time).
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
    this.weaponCore = null
    this.secondaryElement = null
    this.weaponLevel = 0
    this.weaponChoicePending = false
    this.secondaryChoicePending = false
    // D1 第三槽：与 core / element 完全独立的 pending 生命周期，reset 必须一并归零。
    this.weaponModule = null
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
    this.weaponStats = { pierced: 0, explosions: 0, corrosionStacks: 0, splits: 0, ricochets: 0, splinterCount: 0, maxProcDepth: 0 }
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

  /** D1 第三槽：module 是独立维度，不与 core / element 产生任何组合 id。 */
  get moduleWeapon() {
    return getRunnerWeaponModule(this.weaponModule)
  }

  /** 交给 RunnerEffects 的当前构筑：融合负责触发时机，模块负责额外轴。 */
  get buildProfile() {
    return { fusion: this.fusionWeapon, module: this.moduleWeapon }
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
    this.weaponCore = null
    this.secondaryElement = null
    this.weaponLevel = 0
    this.weaponChoicePending = false
    this.secondaryChoicePending = false
    // D1 第三槽：与 core / element 完全独立的 pending 生命周期，reset 必须一并归零。
    this.weaponModule = null
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
    this.weaponStats = { pierced: 0, explosions: 0, corrosionStacks: 0, splits: 0, ricochets: 0, splinterCount: 0, maxProcDepth: 0 }
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
    this.scrollDistance += (this.section?.advanceSpeed || 0.17) * worldDt
    this._updateEntities(worldDt)
    this._updateEnemyProjectiles(worldDt)
    if (this.state !== 'active') return
    this._updateGroundFires(worldDt)
    this._updateShooting(dt)

    if (this.duration !== Infinity && this.elapsedTime >= this.duration) {
      this._finish('victory')
    }
  }

  changeLane(direction) {
    if (this.state !== 'active' || this.game?.input?.suspended || (direction !== -1 && direction !== 1)) return false
    const nextLane = clamp(this.targetLane + direction, 0, RUNNER_LANE_COUNT - 1)
    if (nextLane === this.targetLane) return false
    this.targetLane = nextLane
    return true
  }

  _updateLaneInput(dt) {
    const input = this.game.input.state
    const left = !!input.left
    const right = !!input.right
    if (left && !this._prevLeft) this.targetLane = Math.max(0, this.targetLane - 1)
    if (right && !this._prevRight) this.targetLane = Math.min(RUNNER_LANE_COUNT - 1, this.targetLane + 1)
    this._prevLeft = left
    this._prevRight = right


    const k = this.reducedMotion ? 1 : 1 - Math.pow(1 - RUNNER_LANE_LERP_PER_FRAME, dt * 60)
    this.lanePosition += (this.targetLane - this.lanePosition) * k
    if (Math.abs(this.lanePosition - this.targetLane) <= RUNNER_LANE_COMMIT_EPSILON) {
      if (this.currentLane !== this.targetLane) this._lastLaneSwitchAt = this.visualTime
      this.lanePosition = this.targetLane
      this.currentLane = this.targetLane
    }
  }

  activateFever() {
    if (this.state !== 'active' || this.isFeverActive || this.feverCharges <= 0) return false
    this.feverCharges -= 1
    this.feverTimer = RUNNER_FEVER_DURATION
    this.feverCount = (this.feverCount || 0) + 1
    const p = this.renderer.project(this.currentLane, RUNNER_PLAYER_DEPTH)
    this.floatingTexts.push(
      new FloatingText(
        this.renderer.lanePositionX(this.lanePosition),
        this.renderer.playerY - 45,
        '暴走启动',
        '',
        '#ffd166',
        18
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
          new FloatingText(point.x, point.y - 26, '暴走就绪 +1 [按空格释放]', '', '#ffd166', 18)
        )
        this.game.sound.levelUp?.()
        this._burst(point.x, point.y, '#ffd166', 12, true)
      } else {
        this.game.sound.pickup?.()
      }
    } else {
      this.score += 150
      this.game.sound.pickup?.()
    }
  }

  _getLaneRisks() {
    const risks = [0, 0, 0]
    for (const entity of this.entities) {
      // 路线牌不是威胁：排除后车道风险读数才反映真实危险，岔口可读性不被污染。
      if (!entity.active || this._isChoiceGate(entity) || entity.kind === 'gate' || entity.kind === 'fork') continue
      const urgency = clamp((entity.depth - 0.34) / 0.66, 0, 1)
      let weight = urgency * (1 + Math.max(0, entity.damage || 0) * 0.42)
      if (entity.charging) weight += 0.9
      if (entity.attacking) {
        if (entity.behavior === 'archer') risks[entity.attackLane] += 1.45
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
        (entity) => entity.active && (entity.kind === 'hazard' || entity.kind === 'obstacle') && entity.lane === lane && entity.depth > 0.15
      )
      const isCharging = this.entities.some(
        (entity) => entity.active && entity.lane === lane && (entity.charging || entity.chargeTelegraph > 0)
      )
      const imminent = this.entities.some(entity => entity.active && entity.lane === lane &&
        !this._isChoiceGate(entity) && entity.kind !== 'gate' && entity.kind !== 'fork' &&
        this._effectiveSpeed(entity) > 0 &&
        (RUNNER_COLLISION_DEPTH - entity.depth) / this._effectiveSpeed(entity) < 0.85)
      const incoming = this.enemyProjectiles.some(projectile => projectile.active && projectile.lane === lane &&
        (RUNNER_COLLISION_DEPTH - projectile.depth) / projectile.speed < 0.85)
      const status = imminent || incoming || activeMage || isCharging ? 'danger' : activeArcher || risk >= 0.85 || hasBarrier ? 'warning' : 'open'
      const intent = isCharging ? '冲锋' : activeMage ? '封锁' : activeArcher ? '瞄准' : incoming ? '飞弹' : imminent ? '逼近' : hasBarrier ? '路障' : status === 'warning' ? '注意' : '开放'
      return { lane, risk: Math.min(1, risk / 4.8), status, intent }
    })
  }

  _registerPerfectDodge(lane, depth) {
    if (this.visualTime - this._lastLaneSwitchAt > RUNNER_DODGE_WINDOW) return false
    if (this.visualTime - this._lastDodgeAt < 0.28) return false
    this._lastDodgeAt = this.visualTime
    this.perfectDodges += 1
    this.score += 20
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
    // ruins 主收益轴：锁定险路立刻结算一次路线红利。
    // 优先给暴走充能（3 线齐射 / 2 倍分 / 额外穿透的真实战力）；充能已满时
    // 折算成 1 点护盾，同样是局内资源——绝不折算成分数，因为分数只影响结算。
    // 不采用「击杀精英掉印记」：定点验证证明机制有效，但主动躲避精英才是理性
    // 打法，实测与真实对局里都几乎打不到，收益轴形同虚设。
    let bonusCharges = 0
    let bonusShield = 0
    if (route.forkBonusCharges) {
      for (let i = 0; i < route.forkBonusCharges; i++) {
        if (this.feverCharges < RUNNER_FEVER_MAX_CHARGES) {
          this.feverCharges += 1
          bonusCharges += 1
        } else if (this.shield < this.maxShield) {
          this.shield += 1
          bonusShield += 1
        }
      }
    }
    // 提示必须说实际拿到的东西：充能已满时发的是护盾，不能一律写「暴走充能」。
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

  _updateWeaponProgression() {
    const choiceTime = this.submodeConfig?.weaponChoiceTime ?? 25
    const evolveTime = this.submodeConfig?.weaponEvolveTime ?? 65
    const moduleTime = this.submodeConfig?.weaponModuleTime ?? 90
    const overdriveTime = this.submodeConfig?.weaponOverdriveTime ?? 110

    if (!this._weaponChoiceTriggered && this.elapsedTime >= choiceTime) {
      this._weaponChoiceTriggered = true
      this._startWeaponChoice()
    }
    if (!this._secondaryChoiceTriggered && this.elapsedTime >= evolveTime) {
      this._secondaryChoiceTriggered = true
      this._startSecondaryChoice()
    }
    if (!this._moduleChoiceTriggered && this.elapsedTime >= moduleTime) {
      this._moduleChoiceTriggered = true
      this._startModuleChoice()
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

  /**
   * D1 第三槽：module 三选一。
   * 刻意不阻塞 _updateDirector —— weaponChoicePending 的阻塞正是 B.1 冻结的成因，
   * 而三条车道各有一扇 module 门，玩家无论停在哪条车道都会必然撞上其中一扇，
   * 「必定能选」由布局保证，不靠 Director 停摆来保证。
   */
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
    this.moduleChoicePending = false
    for (const entity of this.entities) {
      if (entity.kind === 'module_mutation' && entity.rowId === this._moduleChoiceRowId) {
        entity.active = false
      }
    }
    this.weaponNotice = `${module.name} · 已搭载`
    this.weaponNoticeTimer = 2.8
    this.score += 300
    this._showFusion({
      id: module.id,
      name: module.name,
      color: module.color,
      description: module.description,
    }, this.weaponLevel, '模块搭载')
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

  /**
   * 冻结与减速的计时器，按世界推进时间递减（与地火 duration 同口径：
   * 子弹时间下世界被拉长，同一份「1.2 秒」自然换来更多真实操作时间）。
   * 两者都必须在到期时归零并恢复速度，否则就是永久状态——这正是 burst_frost 曾经的 bug。
   */
  _tickEntityStatus(entity, dt) {
    if (entity.freezeTimer > 0) entity.freezeTimer = Math.max(0, entity.freezeTimer - dt)
    if (entity.slowTimer > 0) {
      entity.slowTimer = Math.max(0, entity.slowTimer - dt)
      if (entity.slowTimer === 0) entity.slowRatio = 0
    }
  }

  /**
   * 实体当前实际推进速度：冻结完全停止，减速按比例削减。
   * 刻意不改写 entity.speed——archer/mage 的攻击状态机与 charger 的冲锋
   * 都会自行改写 speed，在这里乘算才不会和它们打架。
   */
  _effectiveSpeed(entity) {
    if (entity.freezeTimer > 0) return 0
    if (entity.slowTimer > 0) return entity.speed * (1 - (entity.slowRatio || 0))
    return entity.speed
  }

  _applyFreeze(entity, duration) {
    if (!duration) return
    entity.freezeTimer = Math.max(entity.freezeTimer || 0, duration)
  }

  _applySlow(entity, effect) {
    if (!effect.duration) return
    entity.slowTimer = Math.max(entity.slowTimer || 0, effect.duration)
    entity.slowRatio = Math.max(entity.slowRatio || 0, effect.ratio)
  }

  /** 在车道上留下一块（或续命）地火，cap 与到期销毁仍由 _pushGroundFire / _updateGroundFires 负责。 */
  _mergeGroundFire(lane, depth, effect) {
    const existing = this.groundFires.find((f) => f.lane === lane && Math.abs(f.depth - depth) < 0.08)
    if (existing) {
      existing.duration = Math.max(existing.duration, effect.duration)
      return
    }
    this._pushGroundFire(lane, depth, effect.duration, effect.damage)
  }

  /**
   * 构造一次「生成型」攻击的 source —— 全文件唯一入口，provenance 规则的落地点。
   *
   * 无论父攻击是 primary 还是 secondary，这里都无条件盖 SECONDARY 章：
   * 二级攻击可以继续触发既有允许的 fusion 行为（雷弧、火花、殉爆、弹片、地火、
   * 过载放电都照旧结算），但它的后代永远还是二级，不可能因为「换了一层效果」
   * 就重新拿到 Module 触发资格。因此调用点不需要各自记得传 skipModuleProc。
   */
  _secondaryAttack(fields = {}) {
    return { ...fields, provenance: ATTACK_SECONDARY }
  }

  /**
   * 一次命中的融合结算：减速、过载电击。
   * 增伤（vulnerability）不进这里——它要在算伤害之前生效，由 _calculateDamage 读取。
   */
  _applyFusionOnHit(target) {
    for (const effect of planRunnerEffects(this.buildProfile, 'onHit')) {
      if (effect.kind === 'slow') this._applySlow(target, effect)
      else if (effect.kind === 'corrosionShock' && (target.corrosionStacks || 0) >= effect.threshold) {
        this._triggerCorrosionShock(target, effect)
      }
    }
  }

  /**
   * 腐蚀叠满阈值：清空叠层、造成硬直，并按 shockDamage 追加一次过载伤害。
   *
   * 过载放电是 fusion 生成的**二级攻击**：它必须走 _secondaryAttack，否则它会以
   * 「没有 provenance 的新 source」重新获得 Module 触发资格——这正是 C+L+S 的
   * Module → Fusion → Module 回路的起点。叠层清零后不会立刻再次触发
   * （1 < threshold），因此单层内也不会递归。
   */
  _triggerCorrosionShock(target, effect) {
    target.corrosionStacks = 0
    this._applyFreeze(target, effect.duration)
    this.rings.push({ lane: target.lane, depth: target.depth, life: 0.3, maxLife: 0.3, color: '#c0ff73', radiusScale: 2.4 })
    this._hitEntity(
      target,
      // discharge：过载放电本身不是一次新的腐蚀命中，不能顺手再叠一层，
      // 否则「叠满即清空」会立刻被自己重新填回 1 层。
      this._secondaryAttack({
        core: this.weaponCore,
        coreLevel: this.weaponLevel,
        damageMultiplier: effect.damage,
        discharge: true,
      }),
      { silent: true, splash: true, skipFusionOnHit: true }
    )
  }

  /**
   * 贯穿后的融合结算：折射雷弧、熔岩火海、减速、破甲。
   * 目标按固定顺序挑选（车道 → 深度 → id），不使用任何随机。
   */
  _applyFusionOnPierce(target) {
    for (const effect of planRunnerEffects(this.buildProfile, 'onPierce')) {
      if (effect.kind === 'adjacentArc') this._arcToAdjacentLanes(target, effect)
      else if (effect.kind === 'groundFire') this._mergeGroundFire(target.lane, target.depth, effect)
      else if (effect.kind === 'slow') this._applySlow(target, effect)
      else if (effect.kind === 'armorBreak') target.armor = Math.max(0, (target.armor || 0) * (1 - effect.amount))
    }
  }

  /** 相邻车道各取最近的合法目标结算雷弧，不重复命中主目标。 */
  _arcToAdjacentLanes(primary, effect) {
    const lanes = [primary.lane - 1, primary.lane + 1].filter((lane) => lane >= 0 && lane < 3)
    for (const lane of lanes) {
      const target = this._nearestTargetInLane(lane, primary.depth, 0.14, primary.id)
      if (!target) continue
      this.rings.push({ lane, depth: target.depth, life: 0.2, maxLife: 0.2, color: '#7be8ff' })
      this._hitEntity(target, this._secondaryAttack({ core: this.weaponCore, coreLevel: this.weaponLevel, damageMultiplier: effect.damageRatio }), { silent: true, splash: true })
    }
  }

  /**
   * 爆裂迸发的自动锁敌火花：从同车道与相邻车道里按固定顺序取前 count 个目标。
   * 「自动锁敌」解释为「自动获取目标」而不是新增追踪弹体——后者是 Phase E 的表现层。
   */
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

  /**
   * 爆裂主目标是否可以被状态效果作用（D1.2 正式合同）。
   *
   * 主目标是「敌人投射物」时（子弹打掉了飞行道具也会引爆）它根本不是实体，
   * 不该被挂状态；已死亡的实体不挂无意义状态；选择门是玩家界面不是敌人；
   * lane / depth 校验只是把既有爆炸空间规则照抄一遍，不构成任何扩张。
   */
  _canTakeBlastStatus(primary, radius) {
    if (!primary || primary.kind === 'arrow') return false
    if (!primary.active || primary.hp <= 0) return false
    if (this._isChoiceGate(primary)) return false
    if (primary.lane === undefined || primary.depth === undefined) return false
    return true
  }

  /** 指定车道里离玩家最近（depth 最大）的合法伤害目标；没有则返回 null。 */
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

  /** 被腐蚀目标阵亡时的殉爆，范围与伤害取自 Rules。殉爆是二级攻击。 */
  _deathBlast(dead, effect) {
    this.rings.push({ lane: dead.lane, depth: dead.depth, life: 0.3, maxLife: 0.3, color: '#ff9a42', radiusScale: 2.2 })
    const targets = this.entities.filter(
      (other) => other.active && other.hp > 0 && !this._isChoiceGate(other) && other.lane === dead.lane && Math.abs(other.depth - dead.depth) <= effect.radius
    )
    for (const target of targets) {
      this._hitEntity(target, this._secondaryAttack({ core: this.weaponCore, coreLevel: this.weaponLevel, damageMultiplier: effect.damage }), { silent: true, splash: true })
    }
  }

  /**
   * 分裂弹片：一次真实命中扩散到附近其它目标。
   *
   * 触发资格是**单一来源**的，不再是「每个调用点记得传 skipModuleProc」：
   *   1. canProcModule(source) —— 只有玩家弹体自身的直接命中（provenance=primary）
   *      才有资格。过载放电 / 爆炸 AoE / 雷弧 / 火花 / 殉爆 / 弹片本身都是 secondary，
   *      缺省（没有 provenance）同样按 secondary 处理，因此不会出现「新写的效果路径
   *      忘记了标记，于是二级攻击重新拿到触发资格」这种跨层泄漏。
   *   2. 每颗弹丸只 proc 一次 —— pierce 后续穿透与 ricochet 回弹都不再 proc。
   * 两者叠加后，单发子弹能产生的二级效果数量有确定上限 = splitCount。
   * 目标按 (lane, depth, id) 确定性挑选，不使用任何随机。
   */
  _applyModuleProc(primary, source) {
    if (!canProcModule(source) || source.moduleProcUsed) return
    const split = findRunnerEffect(planRunnerEffects(this.buildProfile, 'onHit'), 'split')
    if (!split) return
    source.moduleProcUsed = true
    const candidates = []
    for (const entity of this.entities) {
      if (!entity.active || entity.hp <= 0 || entity.id === primary.id) continue
      if (this._isChoiceGate(entity)) continue
      if (Math.abs(entity.depth - primary.depth) > split.range) continue
      candidates.push(entity)
    }
    candidates.sort((a, b) => a.lane - b.lane || b.depth - a.depth || a.id - b.id)
    const targets = candidates.slice(0, split.count)
    if (!targets.length) return
    this.weaponStats.splits += 1
    for (const entity of targets) {
      const point = this.renderer.project(entity.lane, entity.depth)
      this._burst(point.x, point.y, '#7ce0c3', 4, true)
      this.weaponStats.splinterCount += 1
      this.weaponStats.maxProcDepth = Math.max(this.weaponStats.maxProcDepth, 1)
      this._hitEntity(
        entity,
        // 弹片是 effect pipeline 生成的二级攻击：它照旧按腐蚀/减速等既有规则结算，
        // 但不可能再触发 Module——provenance 随 _secondaryAttack 一路向后传播。
        this._secondaryAttack({
          core: this.weaponCore,
          coreLevel: this.weaponLevel,
          damageMultiplier: split.damage,
        }),
        { silent: true, splash: true }
      )
    }
  }

  /**
   * 回弹：击破目标后让同一颗弹体转向下一个目标继续飞行。
   * 不新建弹体，所以弹体数量天然不增长；次数由 ricochetCount 硬性递减，
   * 没有合法目标时直接销毁弹体，绝不残留。
   */
  _tryRicochet(bullet, killedTarget) {
    if (!bullet.ricochetRemaining || bullet.ricochetRemaining <= 0) return false
    // 不要求 killedTarget 仍然 active：_defeatEntity 刚刚把它置为 inactive，
    // 拿 active 当前置条件等于「每一次击破都取消回弹」。
    if (!killedTarget) return false
    const candidates = []
    for (const entity of this.entities) {
      if (!entity.active || entity.hp <= 0) continue
      if (entity.kind === 'mutation' || entity.kind === 'secondary_mutation' || entity.kind === 'module_mutation') continue
      if (bullet.ricochetHitIds.includes(entity.id)) continue
      // 只考虑弹体前方（depth 更小 = 更远）的目标，否则弹体永远追不上
      if (entity.depth >= bullet.depth - 0.005) continue
      candidates.push(entity)
    }
    if (!candidates.length) return false
    candidates.sort((a, b) => a.lane - b.lane || b.depth - a.depth || a.id - b.id)
    const next = candidates[0]
    bullet.ricochetRemaining -= 1
    bullet.damageMultiplier *= bullet.ricochetDecay
    bullet.lane = next.lane
    bullet.ricochetHitIds.push(next.id)
    // 回弹后的弹体自身降级为二级攻击：它转向后的每一次命中都不再有 Module 触发资格，
    // 与雷弧/火花/弹片走同一条 provenance 规则（而不是另写一个 procDepth 数字）。
    bullet.provenance = ATTACK_SECONDARY
    this.weaponStats.ricochets += 1
    const point = this.renderer.project(next.lane, next.depth)
    this._burst(point.x, point.y, '#c9a6ff', 3, true)
    return true
  }

  /**
   * 变异门（核心 / 元素 / module）是玩家界面，不是伤害目标。
   *
   * 这条判定必须集中在一处。曾经只有主弹道选靶遵守「未武装不可射击」，
   * 而雷弧、火花、殉爆、地火、弹片、油桶这些范围路径各自手写过滤条件，
   * 结果 pierce_lightning 的折射雷弧会打死相邻车道的 module 门，
   * **替玩家做掉了构筑选择**。任何新增伤害路径都必须先过这一关。
   */
  _isChoiceGate(entity) {
    return entity.kind === 'mutation' || entity.kind === 'secondary_mutation' || entity.kind === 'module_mutation'
  }

  _updateEntities(dt) {
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const entity = this.entities[i]
      if (!entity.active) {
        this.entities.splice(i, 1)
        continue
      }
      this._tickEntityStatus(entity, dt)
      entity.previousDepth = entity.depth
      if (entity.behavior === 'charge') this._updateCharger(entity, dt)
      else if (entity.behavior === 'archer' || entity.behavior === 'mage') {
        this._updateRangedEnemy(entity, dt)
      }
      else entity.depth += this._effectiveSpeed(entity) * dt
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
      // D1 第三槽：与核心选择同构——驶入车道即搭载。
      if (entity.kind === 'module_mutation') {
        if (collides) this._selectWeaponModule(entity.weaponModule)
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
    entity.depth += this._effectiveSpeed(entity) * dt
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
        // 变���门未武装不可射击：核心门与 module 门共用同一把锁，
        // 否则 module 门一生成（depth 0.08）就会被本车道子弹打掉，玩家只剩 0.6 秒换道，
        // 所谓「三选一」退化成「拿当前车道那扇」。
        if ((entity.kind === 'mutation' || entity.kind === 'module_mutation') && entity.depth < RUNNER_MUTATION_ARM_DEPTH) continue
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
        let result = null
        if (targetIsProjectile) this._hitEnemyProjectile(target, bullet)
        else result = this._hitEntity(target, bullet)
        if (bullet.explosive) this._explodeAt(target, bullet)
        // D1.1：击破与贯穿是同一颗弹体在同一帧里的两种互斥命运，任何一帧只会命中其一。
        //
        // 旧实现把回弹挂在贯穿分支的 else 上，也就是「只有 remainingHits 归零后的一次
        // 击破才回弹」。对 burst/corrosion 这没问题（canPierce 恒为 false），但 pierce 的
        // remainingHits 随武器等级升到 2~3，于是它在整个 module 生命周期里几乎不再归零：
        // 实测 270 局真实对局 0 次回弹，pierce × ricochet 是一个死 module。
        //
        // Rules 文案写的是「击破目标后弹体转向下一个目标继续飞行」，触发条件是击破本身，
        // 不是「贯穿耗尽」。因此这里把击破提为回弹触发点，并给出单一转换规则：
        //   击破且还有回弹次数 -> 转向（不再沿原车道继续贯穿）
        //   击破但回弹次数用尽 -> 照常贯穿
        //   没有击破           -> 照常贯穿
        // 转向成功时不消耗 remainingHits，回弹成功本身已经是一次命中，弹体不会因此多活。
        const ricocheted = !!result?.killed && this._tryRicochet(bullet, target)
        if (canPierce && !ricocheted) {
          bullet.remainingHits -= 1
          bullet.damageMultiplier *= bullet.pierceDecay
          // 保留在刚穿过目标的位置，下一帧继续检查本帧跨过的后续目标。
          bullet.depth = target.depth - 0.003
          this.weaponStats.pierced += 1
          // 贯穿类融合效果在此结算：折射雷弧 / 熔岩火海 / 减速 / 破甲。
          this._applyFusionOnPierce(target)
        } else if (!ricocheted) {
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
    // D1 弹体级模块参数：回弹走弹道通道而不是 trigger，因此不新增触发时机。
    const bulletProfile = getRunnerBulletProfile(this.buildProfile)
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
      // 模块专属的弹体状态：只有回弹用得上，其余构筑全部保持 0 / 空数组
      ricochetRemaining: bulletProfile ? bulletProfile.ricochetCount : 0,
      ricochetDecay: bulletProfile ? bulletProfile.ricochetDecay : 1,
      ricochetHitIds: [],
      moduleProcUsed: false,
      // provenance：玩家弹体自身的直接命中是 primary —— 全文件唯一写入 PRIMARY 的地方。
      // 回弹会把同一颗弹体降级为 SECONDARY（见 _tryRicochet）。
      provenance: ATTACK_PRIMARY,
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
    if (entity.hp > 0) {
      if (!options.skipFusionOnHit) this._applyFusionOnHit(entity)
      // Module 触发资格只由 source 的 provenance 决定（唯一判据，见文件顶部说明）。
      // 这里不再读取任何 per-call-site 的 skipModuleProc 开关：调用点没有「记得」的义务，
      // 二级攻击也就没有重新获得触发资格的可能。
      this._applyModuleProc(entity, source)
      // 融合效果（过载电击）可能把目标打死：若它还没被结算过就补一次，
      // 已经由效果本身结算过（active=false）则绝不能重复计入击杀。
      if (entity.hp > 0 || !entity.active) return { killed: false, damage }
      this._defeatEntity(entity)
      return { killed: true, damage }
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

    // Move new receipts sideways, keeping the target's overhead health bar
    // and status dots clear. Existing aggregate receipts keep their position.
    let offset = 0
    while (this.damageNumbers.some(number => number.active && Math.abs(number.x - (x + offset)) < 32 && Math.abs(number.y - y) < 26)) {
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
    const level = clamp(source?.coreLevel || this.weaponLevel || 1, 1, 3)
    const config = core?.levels[level - 1]
    let damage = this.attackDamage * (source?.damageMultiplier || 1)

    if (coreId === 'corrosion' && !source?.discharge && entity.kind !== 'gate' && entity.kind !== 'mutation' && entity.kind !== 'secondary_mutation') {
      const stacks = entity.corrosionStacks || 0
      damage *= 1 + stacks * config.stackBonus
      entity.corrosionStacks = Math.min(config.maxStacks, stacks + 1)
      this.weaponStats.corrosionStacks += 1
      if (entity.kind === 'hazard' || entity.kind === 'obstacle') damage *= config.barrierDamage
    }

    // 脆化霜蚀：被本组合减速到的目标吃到额外增伤。
    // 判据是「目标当前处于减速状态」，而不是某个只有别的组合才会写的计时器——
    // 旧实现读 frostTimer（游戏从不赋值）/ freezeTimer（只有 burst_frost 会写），
    // 而一局同时只可能有一个融合，因此该条件恒为假，增伤从未生效过。
    const onHitEffects = planRunnerEffects(this.buildProfile, 'onHit')
    const vulnerability = findRunnerEffect(onHitEffects, 'vulnerability')
    if (vulnerability && (entity.slowTimer || 0) > 0) {
      damage *= 1 + vulnerability.bonus
    }

    // D1 增幅棱镜：条件增伤，不是无条件全局加成——满血目标一个字节都不多。
    const amplify = findRunnerEffect(onHitEffects, 'amplify')
    if (amplify && entity.maxHp > 0 && entity.hp / entity.maxHp < amplify.hpRatio) {
      damage *= 1 + amplify.bonus
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
    // 爆裂类融合效果一次性规划：半径放大、冻结、焦土、锁敌火花。
    // 具体效果由 Rules 的数据字段决定，这里不再出现任何组合 id。
    const effects = planRunnerEffects(this.buildProfile, 'onExplosion')
    const blast = findRunnerEffect(effects, 'blastRadius')
    const freeze = findRunnerEffect(effects, 'freeze')
    const groundFire = findRunnerEffect(effects, 'groundFire')
    const sparks = findRunnerEffect(effects, 'sparks')
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

    if (groundFire) this._mergeGroundFire(primary.lane, primary.depth, groundFire)

    // 伤害目标集：主目标已经吃过子弹的直接伤害，AoE 伤害必须继续排除它，
    // 否则同一发会结算两次伤害。`entity.id !== primary.id` 就是这条去重规则。
    const damageTargets = this.entities.filter(
      (entity) =>
        entity.active &&
        // 范围伤害只打还有血的实体：路线牌 hp 为 0（不可射击/不碰撞），
        // 若被当成目标，_hitEntity 会立刻判定它"已死"并把它当击杀删除，
        // 于是岔口牌会在抵达选择深度之前凭空消失、路线永远不解析。
        entity.hp > 0 &&
        (primary.kind === 'arrow' || entity.id !== primary.id) &&
        entity.lane === primary.lane &&
        !this._isChoiceGate(entity) &&
        Math.abs(entity.depth - primary.depth) <= radius
    )

    // 状态目标集（D1.2 正式合同）：主目标如果在直接伤害结算后仍然存活，
    // 同样被冻住。**伤害目标集与状态目标集不是同一件事**——排除主目标是为了
    // 不重复结算伤害，不是为了不让它吃到状态效果。
    //
    // 边界全部来自合同，不做任何扩张：不跨车道、不改 radius、不改 freezeDuration、
    // 主目标已死不挂状态、选择门不是合法目标。而且只对 freeze 生效——
    // sparks / groundFire / 其它元素的爆炸语义一律不动。
    let statusTargets = damageTargets
    if (freeze && this._canTakeBlastStatus(primary, radius)) {
      statusTargets = damageTargets.includes(primary) ? damageTargets : [...damageTargets, primary]
    }

    for (const entity of statusTargets) {
      if (freeze) this._applyFreeze(entity, freeze.duration)
    }
    for (const entity of damageTargets) {
      // AoE 伤害是 effect 生成的二级攻击：主目标在直接命中里已经用过 primary 资格，
      // 这一轮范围伤害不可能再触发 Module（修复前每个被炸到的目标都会各 proc 一次 split）。
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
    if (entity.type === 'gold_convoy') {
      this.score += 1500
      this.shield = this.maxShield
      this.feverCharges = RUNNER_FEVER_MAX_CHARGES
      this.feverShards = 0
      this._showNotice('运宝车击破 · 满能量&全护盾 💰', '#fbbf24')
      this.game.sound.levelUp?.()
      return
    }

    // 酸焰殉爆：只有真正带着腐蚀叠层的目标阵亡才触发，范围与伤害取自 Rules。
    // 旧实现判的是 secondaryElement === 'flame'——那是元素判断而不是融合判断，
    // 任何带火焰元素的击杀都会误触发，只是恰好被「叠层只由腐蚀写入」掩盖了。
    const deathBlast = findRunnerEffect(planRunnerEffects(this.buildProfile, 'onKill'), 'deathBlast')
    if (deathBlast && (entity.corrosionStacks || 0) > 0) this._deathBlast(entity, deathBlast)

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

  /**
   * 炸药桶殉爆：固定 12 点范围伤害，同样不走 _hitEntity（与地火同类的非攻击通道），
   * 因此不会触发 Module；其击杀引发的融合效果仍走 _deathBlast（二级攻击）。
   */
  _triggerBarrelExplosion(entity) {
    this.tacticalStats.barrels++
    const point = this.renderer.project(entity.lane, entity.depth)
    this._shake(10, 0.35)
    this._burst(point.x, point.y, '#f97316', 16, true)
    this.floatingTexts.push(new FloatingText(point.x, point.y - 25, '炸药殉爆 💥', '', '#f97316', 22))
    this.game.sound.bombExplode?.()

    for (const other of this.entities) {
      if (!other.active || other.id === entity.id || other.hp <= 0 || this._isChoiceGate(other)) continue
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

  /**
   * 磁暴可吸附对象：仅限「强化门」一族（普通奖励门与战术道具门），即 kind === 'gate'。
   *
   * 原条件 `kind === 'gate' || reward` 里的 `reward` 是 bug 来源：武器三选一门
   * (kind:'mutation', reward:'weapon') 与元素三选一门 (kind:'secondary_mutation',
   * reward:'element') 同样带 reward 字段，会被当成道具吸附，走 _applyReward 的
   * 兜底分支误发护盾；更致命的是它们被绕过 _selectWeaponCore / _selectSecondaryElement
   * 两个正规出口直接移出数组，使对应 pending 标志永不复位。
   * 所有合法奖励门（含战术道具门）的 kind 均为 'gate'，因此按 kind 收窄既修掉
   * 误伤，也一条合法目标都不丢。岔口路线牌 reward 为 null、kind 为 'fork'，天然不匹配。
   */
  _isMagnetEligibleEntity(entity) {
    return !!entity && entity.active === true && entity.kind === 'gate'
  }

  _activateMagnet(point) {
    this.tacticalStats.magnets++
    this.score += 200
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

  _showNotice(text) {
    this.weaponNotice = text
    this.weaponNoticeTimer = 2.4
  }

  /**
   * 地火：effect 生成的持续伤害通道。
   *
   * 这里刻意不走 _hitEntity（燃烧 DPS 不是一次「攻击」，既不叠腐蚀也不吃易伤/增幅），
   * 因此它天然没有 Module 触发资格——provenance 规则在这里不需要再加一道锁。
   * 它唯一的跨层出口是击杀：击杀引发的融合效果（酸焰殉爆）走 _deathBlast →
   * _secondaryAttack，仍然是二级攻击。
   */
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
          !this._isChoiceGate(entity) &&
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
    if (outcome === 'victory') {
      const timeBonus = this.duration !== Infinity ? Math.round((this.duration - this.elapsedTime) * 40) : 0
      this.score += this.hp * 250 + timeBonus
      this.game.sound.levelUp?.()
    } else {
      this.game.sound.gameOver?.()
    }
    this.game.finishGameplay?.(this.getResultSnapshot())
  }

  /**
   * 构筑三标签：`贯穿 · 冰霜 · 分裂`。
   * 刻意不生成 27 个专属名字——正交构筑的可读性来自「三个维度各自是什么」，
   * 而不是来自把三个词拼成一个新词。
   */
  _buildHudTags() {
    return {
      core: this.weaponDefinition ? { id: this.weaponDefinition.id, shortLabel: this.weaponDefinition.shortLabel, color: this.weaponDefinition.color } : null,
      element: this.secondaryElement
        ? {
            id: this.secondaryElement,
            shortLabel: RUNNER_SECONDARY_ELEMENTS[this.secondaryElement]?.shortLabel || this.secondaryElement,
            color: RUNNER_SECONDARY_ELEMENTS[this.secondaryElement]?.color || '#ffffff',
          }
        : null,
      module: this.moduleWeapon
        ? { id: this.moduleWeapon.id, shortLabel: this.moduleWeapon.shortLabel, color: this.moduleWeapon.color }
        : null,
      modules: RUNNER_WEAPON_MODULE_IDS.map((id) => {
        const module = getRunnerWeaponModule(id)
        return { id, shortLabel: module.shortLabel, color: module.color }
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
      reducedMotion: this.reducedMotion,
      combo: this.combo,
      section: this.section.name,
      sectionIndex: this.section.index,
      sectionNotice: this.sectionNotice,
      // D1 第三槽：HUD 只做 Core / Element / Module 三个短标签的并置，
      // 不为 27 种组合编名字，也不新增面板或资源条。
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
