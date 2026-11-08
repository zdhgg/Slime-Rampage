import { setCritSource } from './CritSources.js'
import { resolveShadowSkill } from './ShadowSkills.js'
import { resolveElementalSkill, ordinarySpellCoreSkills } from './SpellRules.js'
import { InputManager } from './InputManager.js'
import { ELEMENTAL_SPEC_PROC_CAP, Player, STARTING_EXP_THRESHOLD } from './entities/Player.js'
import { EnemyManager } from './EnemyManager.js'
import { WeaponSystem } from './WeaponSystem.js'
import { GemManager } from './GemManager.js'
import { SoundManager } from './SoundManager.js'
import { rollSkills, rollBossSkills, getSpecInfo, SKILL_DATABASE } from './SkillPool.js'
import { RICOCHET_ROUTES, RICOCHET_SKILL_BY_ID, ricochetSkillAvailable, ricochetRouteReady } from './RicochetRules.js'
import { GLUTTON_ROUTES, GLUTTON_SKILL_BY_ID, gluttonSkillAvailable, gluttonRouteReady } from './GluttonBuild.js'
import { SYMBIOSIS_ROUTES, SYMBIOSIS_SKILL_BY_ID, symbiosisSkillAvailable, symbiosisRouteReady } from './SymbiosisBuild.js'
import { ELEMENTAL_ROUTES, ELEMENTAL_ROUTE_SKILL_BY_ID, elementalSkillAvailable, elementalRouteReady } from './ElementalBuild.js'
import { SHADOW_ROUTES, SHADOW_ROUTE_SKILL_BY_ID, getShadowSkill, shadowSkillAvailable, shadowRouteReady } from './ShadowBuild.js'
import { ENDLESS_SKILL_BY_ID } from './EndlessSkills.js'
import { getEffectiveSkillMaxLevel } from './SkillProgression.js'
import { applyGenes } from './GenePool.js'
import { buildSpecies } from './Species.js'
import { REACTIONS, getElement, getActiveReactions } from './ElementSystem.js'
import { generateDecor, drawBgItem, drawFgItem, getMapTheme } from './MapDecor.js'
import { isFrontierScenery, paintFrontierGround, prepareFrontierSprites } from './FrontierScenery.js'
import { paintChapterGround, prepareChapterSprites } from './ChapterScenery.js'
import { WorldEventManager } from './WorldEventManager.js'
import { MapFeatureManager } from './MapFeatureManager.js'
import { DialogueManager } from './DialogueManager.js'
import { createGameplay, normalizeGameplayId } from './gameplay/GameplayFactory.js'
import { AmbientLayer } from './effects/AmbientLayer.js'
import { STRAIN_IDS, applyStrain, canDevour, canUseElements, getStrainSkill } from './Strains.js'
import { PRIMAL_ENERGY_MAX, PRIMAL_OVERLOAD_COST, resetPrimalEnergy, primalOverloadDescription } from './PrimalEnergy.js'
import { getOriginCoreResonance } from './OriginCoreResonance.js'
import { ORIGIN_ROUTES, ORIGIN_MARKS, ORIGIN_RULES, ORIGIN_SKILL_BY_ID, originSkillAvailable, originFragmentFamilies, initOriginRouteState, initOriginMarkState } from './OriginBuild.js'
import {
  learnOriginMemory,
  originMemoryHud,
  originMemories,
  resetOriginSourceMemories,
  rollOriginMemoryCard,
} from './OriginSourceSkills.js'
import { BossTomeCombat } from './BossTomeCombat.js'
import { BossArena } from './BossArena.js'
import {
  GLUTTON_CHARGE_MAX,
  GLUTTON_DEVOURS_PER_CHARGE,
  hasGluttonResource,
  resetGluttonResource,
  tickGluttonResource,
} from './GluttonResource.js'
import {
  EXPEDITION_REWARDS,
  EVENT_LOCK_AT,
  FINAL_WARNING_AT,
  RUN_DURATION,
  computeScore,
  getEndlessDisasterTier,
  getExpeditionBoss,
  getExpeditionStage,
  getExpeditionStages,
  getProgressionStage,
  getRunProfile,
  normalizeRunSelection,
  scoreToPoints,
} from './RunRules.js'
import {
  ENDLESS_DEFEAT_RETENTION,
  ENDLESS_FORMATION_BREAK_DURATION,
  getEndlessBounty,
  getEndlessBountyChoices,
  getEndlessCalamity,
  getEndlessCalamitySummary,
  getEndlessModifiers,
  getEndlessRewardBonus,
  isEndlessCalamityWave,
  isEndlessExtractionWave,
  rollEndlessCalamityChoices,
} from './EndlessMode.js'

const MAX_DT = 0.05 // 单帧时间上限（50ms）：切后台回来时防止物理「爆炸」
const EXPEDITION_INTRO_DURATION = 1.6

/**
 * 吞噬线口径（阶段十九集中化）：
 * 基础阈值 0.25，血统（strainDevourBonus）与专精（glut_maw / Lv.5 觉醒）都往它上面加，
 * 而 Enemy._devourThresh 是「基础值 ± 13pct」的固定宽度分层。
 * 不设上限时暴食角色会叠到 ≈30%（普通怪门槛），怪在被打死之前就举白旗，
 * 击杀数暴跌并连带污染掉落、连杀与导演清怪率采样——因此在此封顶。
 */
export const DEVOUR_THRESHOLD_BASE = 0.25
export const DEVOUR_THRESHOLD_CAP = 0.4

/**
 * HUD 初始统计快照：与 _pushStats 的字段形状保持一致。
 * UI 层用它初始化 stats（引擎就绪前 HUD 渲染不访问 undefined 字段），
 * 字段增删只改引擎这一处，消除「初始对象与回调拷贝手工双写」的漂移。
 */
export function createDefaultStats() {
  return {
    elapsed: 0,
    enemies: 0,
    gems: 0,
    kills: 0,
    dmg: 1,
    wave: 1,
    waveName: '',
    level: 1,
    exp: 0,
    maxExp: STARTING_EXP_THRESHOLD,
    hp: 5,
    maxHp: 5,
    devourThreshold: 0.25,
    strainDevourBonus: 0,
    boss: null,
    director: null,
    objective: null,
    eventsCompleted: 0,
    score: 0,
    elements: [],
    reactions: [],
    coreResonance: null,
    primaryReaction: null,
    secondaryCount: 0,
    secondarySlots: 2,
    skillRerolls: 0,
    primarySpec: null,
    secondarySpec: null,
    roleSpec: null,
    originRoute: null,
    originMark: null,
    originFragments: [],
    ricochet: null,
    symbiosis: null,
    bossTomes: [],
    strainId: 'origin',
    canDevour: false,
    canUseElements: true,
    spells: null,
    digest: { charge: 0, max: 100, bursts: 0 },
    // 异源能量（origin 独占）：异源充能 → ≥cost 时空格技升档为超载版
    origin: { energy: 0, max: 100, cost: 40, effect: primalOverloadDescription(), route: null, mark: null, overload: null, mutation: null, circuits: 0, memory: null },
    primal: { value: 0, max: 100, cost: 40, effect: primalOverloadDescription() },
    // 暴食猎食点（仅暴食角色在 _pushStats 里给出 true 与真实数值）
    glutton: { has: false, charge: 0, max: 2, progress: 0, progressPer: 5, ready: false },
    x: 0,
    y: 0,
    run: {
      mode: 'timed',
      difficulty: 'normal',
      modeName: '',
      difficultyName: '',
      state: 'idle',
      remaining: null,
      finaleTime: 0,
      rewardMultiplier: 1,
      endlessRewardBonus: 0,
      effectiveMultiplier: 1,
      disasterTier: 0,
      calamities: [],
      endlessContinues: 0,
      bounty: null,
      bountiesCompleted: 0,
      stage: 1,
      totalStages: 6,
      chapterTitle: '',
      chapterBrief: '',
      region: '',
      theme: 'frontier',
      objective: null,
    },
  }
}

/**
 * 游戏引擎（单例）
 *
 * 职责：
 *  - requestAnimationFrame 60FPS 主循环：update(dt) → render()
 *  - 增量时间 deltaTime（秒）驱动所有实体移动，帧率无关、物理平滑
 *  - DPR 适配（缓冲区分辨率 = CSS 尺寸 × devicePixelRatio），避免高 DPI 模糊
 *  - 页面隐藏自动暂停、恢复；失焦/尺寸变化监听
 *
 * 与 Vue 的解耦边界（架构红线）：
 *  - 引擎内部零 Vue 依赖：不使用 ref/reactive/watch，坐标与渲染全部走原生对象；
 *  - 引擎 → UI 方向：仅通过 onStats 低频回调（约 2Hz）回传统计数据；
 *    升级事件通过 onLevelUp 回调（事件驱动，非轮询）传递 3 个技能选项；
 *  - UI → 引擎方向：只允许显式方法调用（start/stop/pause/resume/destroy…）。
 */
export class GameEngine {
  static #instance = null

  /** 获取单例；传入画布时创建。HMR 场景下旧画布实例自动销毁重建 */
  static create(canvas) {
    if (GameEngine.#instance) {
      if (GameEngine.#instance.canvas === canvas) return GameEngine.#instance
      GameEngine.#instance.destroy()
    }
    GameEngine.#instance = new GameEngine(canvas)
    return GameEngine.#instance
  }

  static getInstance() {
    return GameEngine.#instance
  }

  constructor(canvas) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: false })
    if (!this.ctx) throw new Error('无法获取 2D 渲染上下文')

    this.dpr = 1
    this.width = 0 // CSS 像素尺寸（视口）
    this.height = 0
    this.worldWidth = 0 // 世界尺寸（≥1.5×视口，滚动空间）
    this.worldHeight = 0
    this.camera = { x: 0, y: 0 } // 相机左上角（世界坐标）
    this._camInit = false
    // 屏幕震动（阶段十五美化）：受击/Boss 登场阵亡/爆炸的打击感
    this._shakeT = 0
    this._shakeDur = 1
    this._shakeMag = 0

    this.input = new InputManager()
    this.entities = []
    this.player = new Player({ input: this.input })
    this.enemyManager = new EnemyManager()
    this.bossArena = new BossArena(this) // 决斗圈（P0：限时第 5 波骑士王）；非 Entity，由帧管线显式驱动
    this.mapFeatures = new MapFeatureManager()
    this.worldEvents = new WorldEventManager()
    this.dialogue = new DialogueManager()
    this.weaponSystem = new WeaponSystem({
      player: this.player,
      enemyManager: this.enemyManager,
    })
    this.gemManager = new GemManager({ player: this.player })

    // 主循环状态
    this.running = false
    this._rafId = 0
    this._lastTs = 0
    // 页面切到后台时只记录“此前确实在运行”的局。回到前台后消费该标记，
    // 避免主菜单/黑市等从未启动过主循环的界面被 visibilitychange 意外拉起。
    this._resumeOnVisible = false
    this.elapsed = 0 // 累计游戏时间（秒）
    this.runSelection = normalizeRunSelection()
    this.runProfile = getRunProfile(this.runSelection)
    // Gameplay 层：描述「游戏空间与核心操作规则」，与 runSelection.mode 正交。
    // 默认 arena（现有开放地图割草）；runner 走 configureGameplay 显式切换，
    // 现有启动流程无需感知。Controller 不是 Entity，不进入 entities 列表。
    // 创建即刻完成，attach 推迟到构造末尾（见 constructor 尾部）。
    this.gameplayId = 'arena'
    this.gameplay = createGameplay(this.gameplayId)
    this.runState = 'idle'
    this.finaleTime = 0
    this.runFinished = false
    this.defeatReason = null
    this._finalWarningShown = false
    this.expeditionStage = 1
    this.expeditionStageElapsed = 0
    this.expeditionIntroTime = 0
    this._expeditionBaseline = { kills: 0, elites: 0, events: 0 }
    this._expeditionDefinition = null
    this._pendingExpeditionStage = 0
    this.endlessCalamities = {}
    this.endlessContinues = 0
    this._pendingEndlessWave = 0
    this._endlessDecisionKind = null
    this._endlessChoices = []
    this.endlessBounty = null
    this.endlessBountiesCompleted = 0
    this._pendingEndlessBountyReward = false
    this.endlessFormationBreakTimer = 0
    // 暂停锁：手动暂停/升级面板/进化事件/游戏结束 都会 +1，
    // 页面恢复时若锁 > 0 则不自动启动（修复切页后「暂停被解除」的顺序 bug）
    this._pauseLock = 0

    // 低频统计（UI 桥接，不参与热路径）
    this._statAcc = 0
    this.onStats = null // (stats) => void，约 2Hz 调用
    // 高频冷却桥接（约 10Hz）：冲刺、Boss 施法与破阵追击是连续递变量，
    // 2Hz 快照下进度条会肉眼跳变，单独走五个数值的轻量通道。
    this._cdAcc = 0
    this.onCooldown = null // ({ dashCd, dashMax, cast, formationBreak, formationBreakMax }) => void
    // 玩法专属 UI 桥接：Runner 等非 Arena 玩法以 10Hz 推送轻量 HUD，结束时仅发一次结算。
    this._gameplayHudAcc = 0
    this.onGameplayHud = null
    this.onGameplayFinished = null
    // 世界背景重建防抖计时器（resize 高频触发时合并为一次重建）
    this._worldBgTimer = 0

    // 升级桥接（事件驱动，非轮询）：升级时回调 Vue，传入 3 个技能选项
    this.onLevelUp = null // (options) => void
    this.skillLevels = {} // 技能已选次数（SkillPool 过滤满级用），普通对象不走响应式
    this.bossSkillIds = new Set()
    this.bossSkillLevels = {}
    this.bossTomes = new BossTomeCombat(this)
    this._bossRewardQueue = []
    this._bossRewardSeen = new Set()
    this._chapterSettlement = null
    this._settlementApplying = false
    this._lastChapterBoss = null
    this._lastChapterBossTypes = []
    this.primarySpec = null // 主专精（'gluttony' | 'gatling' | 'elemental' | 'assassin'）
    this.secondarySpec = null // 旧副专精字段：origin 重构后不再使用，保留以兼容旧测试桩
    this.originRoute = null // 原生路线：'expansion' | 'assimilation' | 'resonance'
    this.originMark = null // 异源印记：'glutton' | 'gatling' | 'elemental' | 'assassin' | 'symbiosis'
    // 源质记忆（原生黏液独占）：击败 BOSS 吸收的源质技能，超载时轮换释放。
    this.originSourceMemories = [] // [{ id, level }]，最多 3 槽、每槽 Lv.3
    this.originSourceCursor = 0 // 下一次超载释放的槽位
    this.originSourceLastCast = null // { id, name, level, at }：HUD 释放高亮用
    this._originSourceSeen = new Set() // 本局已「保底发放」过的源质 id（每种只保底一次）
    this.startingStrain = 'origin' // 开局血统预选（先天属性，reset 末尾叠加应用）
    this.startingElement = null // Set when the first spell is learned at Lv.2.
    this.onSpellCore = null
    this._spellCoreQueue = []
    this._spellCoreChoice = null
    this._spellCoreSeen = new Set()
    // 角色身份（阶段十九）：血统 → 专属技能树。Lv.1~4 只开放本角色 T1，
    // Lv.5 由 _ensureRoleAwakening 自动确立 primarySpec（origin 为 null = 自由构筑）。
    this.roleSpec = null
    this.strainDevourBonus = 0 // 贪噬血统：吞噬线整体加宽（pct）
    this.devourThreshold = DEVOUR_THRESHOLD_BASE // 吞噬生命百分比阈值（暴食流放宽，封顶见 DEVOUR_THRESHOLD_CAP）

    // 游戏结束桥接：玩家死亡时回调 Vue 弹结算面板
    this.onGameOver = null // (info) => void

    // Boss 登场桥接：每 5 波王级勇者出现时回调 Vue 显示警告
    this.onBossSpawn = null // (boss) => void
    this.onBossGroupSpawn = null // ({ label, total, wave, finale }) => void

    // 波次叙事桥接：进入命名波次时回调 Vue（「第 8 波 · A级勇者小队」）
    this.onWaveChanged = null // (wave, name) => void

    // 世界事件桥接：出现/激活/完成/失败时向 HUD 发一次轻量通知
    this.onWorldEvent = null // (payload) => void
    this.onRunState = null // (payload) => void，限时预警/终局开始
    this.onExpeditionReward = null // (payload) => void，远征关间补给
    this.onEndlessDecision = null // (payload) => void，无尽灾变与撤离抉择

    // 进化事件桥接：元素融合激活时暂停 + 回调 Vue 演出
    this.onEvolution = null // (title, subtitle, mutation) => void
    this._evolutionTimer = 0

    // 副反应替换面板桥接（阶段十六）：槽满时暂停 + 回调 Vue 弹替换面板
    this.onReactionFull = null // (payload) => void

    // 首融确认桥接（阶段十六追加）：吃下将触发首次融合的核心时暂停 + 回调 Vue
    this.onFusionConfirm = null // (payload) => void

    // 黑市基因（阶段八）：存档等级，每次 reset 时应用
    this.genes = {} // { [geneId]: level }

    // 音效：程序化合成（Web Audio），首次用户手势时解锁
    this.sound = new SoundManager()

    // 背景资源：世界背景离屏画布（resize 时重建）+ 视口暗角
    this._worldBg = null
    this._vignette = null
    this._fgDecor = [] // 前景装饰（树冠/高草，每帧绘制，随相机滚动）
    this._mapSeed = 1
    this._mapThemeId = 'frontier'
    this._ambient = new AmbientLayer() // 环境氛围层：主题粒子 + 时段色调
    this._stageClearT = 0 // 远征过关的残敌溃散演出计时
    this._worldBgPrev = null // 换景交叉淡化的旧背景
    this._themeFadeT = 0
    this._bgFadePending = false
    this._mapVariant = 'marsh-edge'
    this._mapSpawn = { x: 0.5, y: 0.5 }

    this._tick = this._tick.bind(this)
    this._onResize = this._onResize.bind(this)
    this._onVisibility = this._onVisibility.bind(this)

    this._onResize()
    window.addEventListener('resize', this._onResize)
    document.addEventListener('visibilitychange', this._onVisibility)

    // 浏览器策略：AudioContext 需用户手势解锁，首次按键/点击时初始化音效
    this._unlockAudio = () => {
      this.sound.ensure()
      window.removeEventListener('keydown', this._unlockAudio)
      window.removeEventListener('click', this._unlockAudio)
    }
    window.addEventListener('keydown', this._unlockAudio)
    window.addEventListener('click', this._unlockAudio)

    // 功能地形、巢心与拒马在最底层，世界事件随后，都位于战斗实体之下。
    this.addEntity(this.mapFeatures)
    this.addEntity(this.worldEvents)
    // 注册玩家（需在 _onResize 之后：Player.attach 依赖画布尺寸定位出生点）
    this.addEntity(this.player)
    // 敌人管理器：负责生成、追逐、分离与渲染，作为普通 Entity 接入帧循环
    this.addEntity(this.enemyManager)
    // 宝石管理器：经验掉落与磁力吸附（渲染层在敌人之上、飞弹之下）
    this.addEntity(this.gemManager)
    // 武器系统：自动索敌射击（渲染在最后层，飞弹/粒子盖在怪海之上）
    this.addEntity(this.weaponSystem)
    // 战斗对白最后绘制，确保短气泡不被弹幕、伤害字或角色遮挡。
    this.addEntity(this.dialogue)

    // Gameplay attach 放在构造末尾：字段、resize（画布/世界尺寸）与全部 Entity
    // 注册均已就绪。attach 即「GameEngine 已完整构造，Gameplay 现在获得一个
    // 可安全使用的 Engine 上下文」——未来 RunnerGameplay.attach 可直接依赖
    // player / weaponSystem / width / entities 等，而无需自查初始化进度。
    this.gameplay.attach(this)
  }

  // ------------------------------------------------------------
  // 实体管理
  // ------------------------------------------------------------

  /** 注册实体并注入游戏上下文；阶段二起用于添加敌人、子弹等 */
  addEntity(entity) {
    this.entities.push(entity)
    entity.attach(this)
    return entity
  }

  configureRun(selection) {
    this.runSelection = normalizeRunSelection(selection)
    this.runProfile = getRunProfile(this.runSelection)
    return this.runSelection
  }

  /**
   * 显式玩法入口：按 gameplay id 重建 Gameplay Controller。
   * 与 configureRun 正交：切换玩法不改变 expedition/timed/endless 的语义；
   * 现有启动流程无需调用它（引擎默认已是 arena）。未知 id 安全回落 arena。
   */
  configureGameplay(id) {
    this.gameplay?.destroy()
    // 新玩法会话不继承旧暂停锁：finishGameplay 的终止暂停会把锁留在 ≥1，
    // 否则下一局首次手动暂停/切后台后 resume 与可见性恢复都不会再 start
    this._pauseLock = 0
    this.gameplayId = normalizeGameplayId(id)
    this.gameplay = createGameplay(this.gameplayId)
    this.gameplay.attach(this)
    return this.gameplay
  }

  /**
   * 重置当前玩法会话。Runner 无需重建 Arena 的敌人、地图和技能系统，避免模式间
   * 生命周期互相污染；Arena 仍沿用完整 reset() 流程。
   */
  resetGameplaySession(seed, options) {
    if (this.gameplayId === 'arena') {
      this.reset()
      return this.gameplay
    }
    this.stop()
    this.sound.stopMusic()
    this.elapsed = 0
    this._pauseLock = 0
    this._statAcc = 0
    this._cdAcc = 0
    this._gameplayHudAcc = 0
    this.input.reset()
    this.gameplay?.reset(seed, options)
    this._pushGameplayHud()
    return this.gameplay
  }

  /** 非 Arena 玩法的统一结束边界：停止循环与音乐，并把最终快照交给 UI。 */
  finishGameplay(payload) {
    if (!this.running) return
    this.pause()
    this._pushGameplayHud()
    this.onGameplayFinished?.(payload)
  }

  get endlessModifiers() {
    return this.runSelection?.mode === 'endless'
      ? getEndlessModifiers(this.endlessCalamities)
      : getEndlessModifiers()
  }

  get endlessRewardBonus() {
    return this.runSelection?.mode === 'endless'
      ? getEndlessRewardBonus(this.endlessCalamities, this.endlessContinues)
      : 0
  }

  get endlessRewardMultiplier() {
    return this.runProfile.rewardMul * (1 + this.endlessRewardBonus)
  }

  _endlessMetricValue(metric) {
    return Math.max(0, Number(this.weaponSystem?.[metric]) || 0)
  }

  get endlessBountyInfo() {
    const bounty = this.endlessBounty
    if (!bounty) return null
    const progress = Math.min(
      bounty.target,
      Math.max(0, this._endlessMetricValue(bounty.metric) - bounty.baseline)
    )
    return {
      id: bounty.id,
      mark: bounty.mark,
      name: bounty.name,
      brief: bounty.brief,
      metric: bounty.metric,
      progress,
      target: bounty.target,
      timeLeft: Math.max(0, bounty.duration - (this.elapsed - bounty.startedAt)),
      reward: bounty.reward,
    }
  }

  /** 成功破解无尽首领阵型后刷新短时追击窗口，不产生额外素材。 */
  triggerEndlessFormationBreak(info = {}) {
    if (this.runSelection?.mode !== 'endless' || this.runFinished) return false
    this.endlessFormationBreakTimer = ENDLESS_FORMATION_BREAK_DURATION
    this.onRunState?.({
      kind: 'formation-break',
      id: info.id || '',
      name: info.name || '阵型瓦解',
      duration: ENDLESS_FORMATION_BREAK_DURATION,
    })
    this._pushCooldown()
    return true
  }

  _updateEndlessFormationBreak(dt) {
    if (this.endlessFormationBreakTimer <= 0) return
    this.endlessFormationBreakTimer = Math.max(0, this.endlessFormationBreakTimer - dt)
  }

  get canStartWorldEvent() {
    if (this.runFinished || this.runState !== 'active') return false
    if (this.runSelection.mode === 'timed') return this.elapsed < EVENT_LOCK_AT
    if (this.runSelection.mode === 'expedition') {
      return ['event', 'mixed'].includes(
        getExpeditionStage(this.runSelection.difficulty, this.expeditionStage).type
      )
    }
    return true
  }

  // ------------------------------------------------------------
  // 角色身份（阶段十九）
  // ------------------------------------------------------------

  /**
   * 该角色能否吞噬敌人。只有暴食史莱姆天生可以；
   * origin 的路线/印记不会授予吞噬，避免复制暴食主系统。
   */
  get canDevour() {
    return canDevour(this.startingStrain)
  }

  /**
   * 该角色能否使用元素系统（第三批角色化）。
   * 只有 elemental / origin 为真；origin 保留元素吸收与反应，但不开放法术树。
   */
  get canUseElements() {
    return canUseElements(this.startingStrain)
  }

  /**
   * 当前角色的空格技能定义，包含原生黏液。
   * origin 任何路线/印记都固定返回「黏液震荡」，不再替换成重咬/鼓舞。
   */
  get strainSkill() {
    if (this.weaponSystem?.ricochetCombat?.enabled) return this.weaponSystem.ricochetCombat.activeSkill
    const skill = getStrainSkill(this.startingStrain), spells = this.weaponSystem.spellCombat
    if (!spells.enabled) return skill
    this._spellActiveSkill ||= { ...skill, use: engine => engine.weaponSystem.spellCombat.useActive() }
    Object.assign(this._spellActiveSkill, { id: spells.routeUltimate ? `elemental_${spells.routeUltimate}` : spells.fusion ? `fusion_${spells.fusion.id}` : skill.id, name: spells.activeName,
      cooldown: spells.activeCooldown, getDesc: () => spells.routeUltimate ? `${spells.routeUltimate === 'single' ? '主元素极化爆发' : spells.routeUltimate === 'fusion' ? '终极融合反应' : '完成一轮元素轮转'}，同时推开身边的普通敌人。` : spells.fusion ? `${spells.rank('active') >= 3 ? spells.fusion.evolution : spells.fusion.activeDesc} 同时推开身边的普通敌人。` : skill.desc })
    return this._spellActiveSkill
  }

  /**
   * Lv.5 角色觉醒：达到等级、存在 roleSpec、且 primarySpec 为空时自动确立主专精。
   *
   * 刻意放在「抽卡之前」统一执行（而不是 rollSkills 内部、也不是 settleLevelUp）：
   *  - rollSkills 保持只负责生成候选，不产生副作用；
   *  - 所有会抽卡的入口（升级 / 王级秘籍 / 悬赏奖励 / 远征勇者秘籍）都先经过这里，
   *    因此任何一个入口在 Lv.5 都不会漏掉觉醒，也不会弹出错的四选一面板；
   *  - origin 的 roleSpec 为 null，直接短路 → 保留 Lv.5 三选一原生路线。
   *
   * 时序要求：必须在 weaponSystem.reset() / player.resetRunState() / applyGenes /
   * applyStrain 之后调用（觉醒会改写 damage/fireInterval/maxHp 等基础值）。
   */
  _ensureRoleAwakening() {
    if (this.primarySpec || !this.roleSpec) return false
    if ((this.player?.level || 1) < 5) return false
    const spec = this.roleSpec
    this.primarySpec = spec
    this._applyPrimarySpecBonus(spec)
    // 同步武器视觉第 1 档：旧流程靠 Lv.5 里程碑卡触发 registerSkillEvolution，
    // 角色绑定后这次调用消失，必须在此补上，否则武器外显少一级。
    this.weaponSystem.registerSkillEvolution({ spec, tier: 1 })
    return true
  }

  /**
   * 空格 专属主动技能：边沿触发 + 自身冷却。
   * Arena 使用与 Runner 暴走狂热相同的 空格 通道（input.consumeFever()），
   * 因此不需要新增按键、不需要新增 input 槽位。
   *
   * 两条释放语义（互不干扰）：
   *  - **资源型**（暴食）：没有主冷却，只受 0.3s 再次释放锁限制；点数不足或近战
   *    范围内没有目标时不扣点、不进锁；起手后锁定咬击方向，敌人可以在前摇内躲开。
   *  - **冷却型**（弹射 / 元素 / 暗影）：语义与本轮之前完全一致（strainSkillCd 主冷却）。
   * 角色分流靠 `skill.getHud`（只有资源型技能提供）判断，不在引擎里比较角色 id。
   */
  _updateStrainSkill(dt) {
    const p = this.player
    const skill = this.strainSkill
    if (!skill) {
      p.strainSkillCd = 0 // 无空格技（未知血统 id）：空格 不响应，冷却恒为 0；origin 自身持有黏液震荡，不走此分支
      p.strainSkillReadyPulse = 0
      return
    }
    const resourceSkill = typeof skill.getHud === 'function'
    if (resourceSkill) {
      // 资源型：再次释放锁每帧推进；主冷却语义整条不参与
      tickGluttonResource(p, dt)
      p.strainSkillMax = 0
      p.strainSkillCd = 0
    } else {
      p.strainSkillMax = skill.cooldown * (p.activeSkillCdMultiplier || 1) * (p.geneActiveSkillCdMultiplier || 1)
      p.strainSkillCd = Math.max(0, p.strainSkillCd - dt)
    }
    if (p.strainSkillReadyPulse > 0) p.strainSkillReadyPulse -= dt
    if (!this.running || this.runFinished) return
    // 边沿消费 空格：无论是否满足释放条件都必须取走，否则输入会在一帧后「幽灵释放」
    const pressed = this.input.consumeFever?.()
    if (!pressed || p.dead) return
    if (resourceSkill) {
      if (!hasGluttonResource(p)) return // 非暴食角色不拥有猎食点：空格 不响应
      if (p.gluttonRecastLock > 0) return // 锁内不消耗点数
      if (p.gluttonCharge <= 0) return // 没有猎食点：不释放、不扣点
      if (skill.use(this) !== true) return // 空放：不扣点、不进锁、不启动技能视觉
      p.strainSkillReadyPulse = 0.4
      return
    }
    const shadow = this.startingStrain === 'shadow' ? this.weaponSystem.shadowCombat : null
    const shadowFollowup = !!shadow?.canFollowup
    if (p.strainSkillCd > 0 && !shadowFollowup) return
    if (skill.use(this) === false) return // 方向被障碍完全挡住或动作冲突时，不消耗冷却。
    if (!shadowFollowup) p.strainSkillCd = p.strainSkillMax
    p.strainSkillReadyPulse = 0.4
  }

  // ------------------------------------------------------------
  // 生命周期
  // ------------------------------------------------------------

  start() {
    if (this.running) return
    this.running = true
    this.input.suspended = false // 主循环运行时才接管键盘（暂停/面板期间放行给 UI）
    this.sound.startMusic() // BGM 起（首次从头排程；resume 接续进度；reset 后重开从头排程）
    this._lastTs = 0 // 恢复首帧 dt=0，避免跳帧
    this._rafId = requestAnimationFrame(this._tick)
  }

  stop() {
    this.running = false
    // 挂起键盘并清空队列：面板打开期间按下的 Space/E 不再在恢复后「幽灵冲刺/吸核」
    this.input.suspended = true
    this.input.reset()
    cancelAnimationFrame(this._rafId)
  }

  /** 暂停主循环（升级面板/进化事件/手动暂停等场景）；持有暂停锁 + BGM 淡出 */
  pause() {
    this._pauseLock++
    this.sound.pauseMusic()
    this.stop()
  }

  /**
   * 恢复主循环（释放一把暂停锁）。
   * 暂停锁可能叠加（进化演出/升级面板/手动暂停各持一把），
   * 任一持有方未释放（锁 > 0）都不拉起主循环——
   * 否则进化演出期间按 Esc 后，演出定时器会把暂停面板下的游戏悄悄恢复。
   */
  resume() {
    if (this._settlementApplying) return
    this._pauseLock = Math.max(0, this._pauseLock - 1)
    if (this._pauseLock > 0) return
    if (this.runFinished || this.player?.dead) return
    if (this._openPendingBossReward?.()) return
    if (this._openPendingSpellCore?.()) return
    if (this._pendingEndlessBountyReward) {
      this._pendingEndlessBountyReward = false
      this.openFreeSkillPanel()
      return
    }
    this.start()
    // 连升结算：剩余经验仍够升级时必须走完整升级（扣经验/升级/阈值递增），
    // 再弹面板——原先只弹面板不扣经验，大额经验（吞噬×2/×3 + 经验基因）时
    // 升级面板无限循环、等级卡死不涨（Lv.1 → Lv.5 跳级 bug 的残余路径）
    if (this.player.exp >= this.player.maxExp) this.player.settleLevelUp()
  }

  /**
   * 升级流程：暂停 → 抽取 3 个未满级技能 → 回调 Vue 弹面板。
   * 技能池耗尽（全满级）时静默继续，不再弹面板。
   */
  triggerLevelUp() {
    const reward = this.weaponSystem.spellCombat.milestoneReward()
    // 现代元素成长只保留 Lv.2 的首系教学；第二元素、路线确认和终极都进入普通随机卡池。
    // milestoneReward 仍保留旧核心接口，供存档兼容与核心测试使用，但不再在升级时强制融合。
    if (reward && reward.stage === 'first' && this.onSpellCore && !this._spellCoreChoice) {
      this.pause()
      this._ensureRoleAwakening()
      this._spellCoreChoice = { ...reward, milestone: true, first: reward.stage === 'fusion' }
      this.sound.levelUp(); this._pushStats()
      this.onSpellCore(this._spellCoreChoice)
      return
    }
    this.openFreeSkillPanel()
  }

  /**
   * 技能选择面板（升级 / 王级秘籍共用）：
   * 暂停主循环 → 抽取 3 个流派/通用技能 → onLevelUp 回调 → 选择后应用
   */
  /** 扩容视界（黑市）：技能选卡面板候选数 +1 */
  _skillOptionCount() {
    return 3 + (this.player?.geneExtraOptions || 0)
  }

  openFreeSkillPanel() {
    this.pause()
    // 角色觉醒必须在抽卡之前统一执行一次：Lv.5 到达时自动确立 primarySpec，
    // 之后的候选池才会从「本角色 T1」切到「本角色 T2+」，且不会弹出四选一面板。
    this._ensureRoleAwakening()
    const options = rollSkills(this, this._skillOptionCount())
    if (options.length === 0) {
      this._pauseLock = Math.max(0, this._pauseLock - 1)
      this.start()
      // 技能池耗尽不再静默：全部满级后的升级转化为一次治愈——
      // 后期升级仍有正反馈，而不是"什么都没发生"
      this.player.heal(1)
      this.enemyManager?.addText?.(this.player.x, this.player.y - 42, '🧬 基因已臻完美', null, '#ffd166', 16)
      return
    }
    // 备选蓝图（黑市）：里程碑觉醒 / 路线确认 / 伙伴招募不是「抽不到想要的卡」，
    // 而是剧情节点——重抽等于跳过里程碑，标记为不可刷新。
    const head = options[0]
    this._skillPanelRerollable = !head.isMilestone && !head.isRicochetRoute && !head.isGluttonRoute
      && !head.isSymbiosisRoute && !head.isElementalRoute && !head.isShadowRoute && !head.isPartnerChoice
    this.sound.levelUp()
    this._pushStats()
    this.onLevelUp?.(options)
  }

  /**
   * 备选蓝图（黑市）：消耗一次刷新次数，重抽当前选卡面板候选。
   * 只作用于 openFreeSkillPanel 弹出的普通选卡（升级/秘典/悬赏共用入口）；
   * 抽取失败不扣次数（候选池枯竭时按无效处理）。
   */
  rerollSkillOptions() {
    const p = this.player
    if (!p || (p.geneRerolls || 0) <= 0 || !this._skillPanelRerollable) return false
    const options = rollSkills(this, this._skillOptionCount())
    if (!options.length) return false
    p.geneRerolls--
    this.sound.levelUp()
    this._pushStats()
    this.onLevelUp?.(options)
    return true
  }

  /** Legacy pickups use the same serialized settlement. */
  openBossSkillPanel() {
    if (!this._chapterSettlement && !this.runFinished) this._beginBossSettlement(false, '首领战利品')
  }

  /**
   * 首领奖励入队：按遭遇去重（同一场编队只发一次），概率与旧规则一致。
   * 例外：原生黏液「首次遇到某种源质」时保底入队，避免打死首领却什么都没吸收。
   * 额外记录本场遭遇出现过的首领类型，供源质卡按「未学优先」挑选。
   */
  queueBossReward(boss, encounterTypes = null) {
    const key = boss.bossGroupId || boss
    if (this._bossRewardSeen.has(key)) return false
    this._bossRewardSeen.add(key)
    const bossTypes = encounterTypes?.length ? encounterTypes : (boss.type ? [boss.type] : [])
    const guaranteed = this._claimFirstOriginSource(bossTypes)
    if (!guaranteed && Math.random() >= (boss.isBossSquadMember ? .85 : .65)) return false
    this._bossRewardQueue.push({
      label: boss.encounterLabel || boss.name || '首领',
      bossTypes,
    })
    return true
  }

  /**
   * 首次源质保底：每种源质在一局里只保底一次。
   * 只有确实能给出卡（未满级、槽位够）时才占用保底机会，不会白占。
   */
  _claimFirstOriginSource(bossTypes) {
    if (this.startingStrain !== 'origin') return false
    const card = rollOriginMemoryCard(this, bossTypes)
    if (!card || this._originSourceSeen.has(card.memoryId)) return false
    this._originSourceSeen.add(card.memoryId)
    return true
  }

  _openPendingBossReward() {
    if (this.runFinished || this.player?.dead || this._pauseLock > 0 || this._chapterSettlement || !this._bossRewardQueue?.length || !this.onExpeditionReward) return false
    this._beginBossSettlement(false, this._bossRewardQueue.shift())
    return true
  }

  _beginBossSettlement(chapter, source = this._lastChapterBoss || '章节首领') {
    if (this._chapterSettlement || this.runFinished || this.player.dead) return false
    // source 兼容旧调用（字符串）与新的入队结构（{ label, bossTypes }）。
    const info = typeof source === 'string' ? { label: source } : (source || {})
    const label = info.label || this._lastChapterBoss || '章节首领'
    const bossTypes = info.bossTypes?.length
      ? info.bossTypes
      : (chapter ? (this._lastChapterBossTypes || []) : [])
    this.pause()
    this._chapterSettlement = { chapter, source: label, bossTypes, summary: null, phase: 'boss', options: [] }
    // 原生专属：本次首领有源质映射且未满级时，强制占一个候选位；
    // 其余候选继续走原有 BOSS 秘典抽取，其他五种职业不受影响（rollOriginMemoryCard 返回 null）。
    const memory = rollOriginMemoryCard(this, bossTypes)
    this._chapterSettlement.options = memory
      ? [memory, ...rollBossSkills(this, 2)]
      : rollBossSkills(this, 3)
    if (!this._chapterSettlement.options.length) {
      this._chapterSettlement.phase = 'compensation'
      this._chapterSettlement.options = rollSkills(this, this._skillOptionCount())
      if (!this._chapterSettlement.options.length) {
        this.player.heal(1)
        this._chapterSettlement.summary = '秘典与技能已满级 · 恢复1点生命'
        return this._advanceSettlement()
      }
    }
    this.sound.wave()
    this._publishSettlement()
    return true
  }

  _publishSettlement() {
    const session = this._chapterSettlement
    if (!session) { this.onExpeditionReward?.(null); return }
    const current = getExpeditionStage(this.runSelection.difficulty, this.expeditionStage)
    const next = getExpeditionStage(this.runSelection.difficulty, this.expeditionStage + 1)
    this._pushStats()
    this.onExpeditionReward?.({ ...session,
      stage: this.expeditionStage, nextStage: this.expeditionStage + 1, stageTitle: current.title,
      nextTitle: next.title, nextRegion: next.region,
      level: this.player.level, roleSpec: this.roleSpec, canUseElements: this.canUseElements,
      secondarySlots: this.player.secondarySlots,
      rewards: EXPEDITION_REWARDS.map(reward => ({ ...reward,
        disabled: reward.id === 'blood' && this.player.maxHp <= 1,
        preview: reward.id === 'rest' ? `生命 ${this.player.hp}/${this.player.maxHp} → ${this.player.maxHp}/${this.player.maxHp}${this.player.hp === this.player.maxHp ? ' · 当前已满血' : ''}`
          : reward.id === 'blood' ? this.player.maxHp <= 1 ? '生命上限不足，无法献祭' : `生命上限 ${this.player.maxHp} → ${this.player.maxHp - 1} · 攻击 ×1.20`
          : '普通技能三选一 · 不增加等级',
      })),
    })
  }

  _advanceSettlement() {
    if (this._chapterSettlement.chapter) {
      this._chapterSettlement.phase = 'supply'; this._chapterSettlement.options = []
      this._publishSettlement()
    } else this._finishSettlement()
    return true
  }

  _finishSettlement() {
    const chapter = this._chapterSettlement?.chapter
    this._chapterSettlement = null
    this.onExpeditionReward?.(null)
    if (chapter) this._enterExpeditionStage(this.expeditionStage + 1)
    this.resume()
  }

  /** 应用技能；成功返回 true，无效选择返回 false，让 UI 保留选卡面板。 */
  applySkill(skill) {
    if (!skill) return false
    // 弹射路线是唯一需要二阶段确认的中期节点；路线卡本身不进入技能等级表。
    if (skill.isRicochetRoute) {
      const route = skill.route
      if (!ricochetRouteReady(this) || !RICOCHET_ROUTES[route] || !this.weaponSystem.ricochetCombat.chooseRoute(route)) return false
      this.weaponSystem.registerSkillEvolution({ spec: 'gatling', tier: 2 })
      this.enemyManager?.addText?.(this.player.x, this.player.y - 20, `🧭 路线锁定：${RICOCHET_ROUTES[route].name}`, null, RICOCHET_ROUTES[route].color, 16)
      this.sound.wave()
      this.evolutionEvent('路线确立', RICOCHET_ROUTES[route].name, 'gatling', RICOCHET_ROUTES[route].bonus)
      if (this._pendingExpeditionStage > 0) {
        const nextStage = this._pendingExpeditionStage
        this._pendingExpeditionStage = 0
        this._enterExpeditionStage(nextStage)
      }
      this._pushStats()
      this._refreshRicochetCooldown()
      this.resume()
      return true
    }
    if (skill.isGluttonRoute) {
      const route = skill.route
      if (!gluttonRouteReady(this) || !GLUTTON_ROUTES[route] || !this.weaponSystem.gluttonCombat.chooseRoute(route)) return false
      this.weaponSystem.registerSkillEvolution({ spec: 'gluttony', tier: 2 })
      this.enemyManager?.addText?.(this.player.x, this.player.y - 20, `🧭 路线锁定：${GLUTTON_ROUTES[route].name}`, null, GLUTTON_ROUTES[route].color, 16)
      this.sound.wave()
      this.evolutionEvent('路线确立', GLUTTON_ROUTES[route].name, 'gluttony', GLUTTON_ROUTES[route].bonus)
      if (this._pendingExpeditionStage > 0) {
        const nextStage = this._pendingExpeditionStage
        this._pendingExpeditionStage = 0
        this._enterExpeditionStage(nextStage)
      }
      this._pushStats()
      this.resume()
      return true
    }
    if (skill.isSymbiosisRoute) {
      const route = skill.route
      if (!symbiosisRouteReady(this) || !SYMBIOSIS_ROUTES[route] || !this.weaponSystem.petCombat.chooseRoute(route)) return false
      this.weaponSystem.registerSkillEvolution({ spec: 'symbiosis', tier: 2 })
      this.enemyManager?.addText?.(this.player.x, this.player.y - 20, `🧭 路线锁定：${SYMBIOSIS_ROUTES[route].name}`, null, SYMBIOSIS_ROUTES[route].color, 16)
      this.sound.wave()
      this.evolutionEvent('路线确立', SYMBIOSIS_ROUTES[route].name, 'symbiosis', SYMBIOSIS_ROUTES[route].bonus)
      this._pushStats()
      this.resume()
      return true
    }
    if (skill.isElementalRoute) {
      const route = skill.route
      const spells = this.weaponSystem.spellCombat
      if (!elementalRouteReady(this) || !ELEMENTAL_ROUTES[route] || !spells.chooseRoute(route)) return false
      this.weaponSystem.registerSkillEvolution({ spec: 'elemental', tier: 2 })
      this.enemyManager?.addText?.(this.player.x, this.player.y - 20, `🧭 路线锁定：${ELEMENTAL_ROUTES[route].name}`, null, ELEMENTAL_ROUTES[route].color, 16)
      this.sound.wave()
      this.evolutionEvent('路线确立', ELEMENTAL_ROUTES[route].name, 'elemental', ELEMENTAL_ROUTES[route].bonus)
      this._pushStats()
      this.resume()
      return true
    }
    if (skill.isShadowRoute) {
      const route = skill.route, shadow = this.weaponSystem.shadowCombat
      if (!shadowRouteReady(this) || !SHADOW_ROUTES[route] || !shadow.chooseRoute(route)) return false
      this.weaponSystem.registerSkillEvolution({ spec: 'assassin', tier: 2 })
      this.enemyManager?.addText?.(this.player.x, this.player.y - 20, `🧭 路线锁定：${SHADOW_ROUTES[route].name}`, null, SHADOW_ROUTES[route].color, 16)
      this.sound.wave()
      this.evolutionEvent('路线确立', SHADOW_ROUTES[route].name, 'assassin', SHADOW_ROUTES[route].bonus)
      if (this._pendingExpeditionStage > 0) {
        const nextStage = this._pendingExpeditionStage
        this._pendingExpeditionStage = 0
        this._enterExpeditionStage(nextStage)
      }
      this._pushStats(); this._pushCooldown(); this.resume()
      return true
    }
    if (skill.isOriginRoute) {
      if (this.startingStrain !== 'origin' || this.originRoute || (this.player.level || 1) < ORIGIN_RULES.routeLevel) return false
      if (!ORIGIN_ROUTES[skill.originRoute]) return false
      this.originRoute = skill.originRoute
      initOriginRouteState(this, this.originRoute)
      this.player.strainTint = ORIGIN_ROUTES[this.originRoute].tint
      this.weaponSystem.registerSkillEvolution({ spec: 'origin', tier: 1 })
      this.enemyManager?.addText?.(this.player.x, this.player.y - 20, `🧬 原生进化：${ORIGIN_ROUTES[this.originRoute].name}`, null, ORIGIN_ROUTES[this.originRoute].color, 16)
      this.sound.wave()
      this.evolutionEvent('原生进化', ORIGIN_ROUTES[this.originRoute].name, 'origin', ORIGIN_ROUTES[this.originRoute].bonus)
      this._pushStats(); this._pushCooldown(); this.resume()
      return true
    }
    if (skill.isOriginMark) {
      if (this.startingStrain !== 'origin' || !this.originRoute || this.originMark || (this.player.level || 1) < ORIGIN_RULES.markLevel) return false
      if (!ORIGIN_MARKS[skill.originMark]) return false
      this.originMark = skill.originMark
      initOriginMarkState(this, this.originMark)
      this.enemyManager?.addText?.(this.player.x, this.player.y - 20, `🧬 异源印记：${ORIGIN_MARKS[this.originMark].name}`, null, ORIGIN_MARKS[this.originMark].color, 16)
      this.sound.wave()
      this._pushStats(); this._pushCooldown(); this.resume()
      return true
    }
    skill = resolveShadowSkill(skill, this)
    skill = resolveElementalSkill(skill, this)

    // 0. 源质记忆（原生专属）：独立等级，不写 skillLevels，不占用 BOSS 秘典槽。
    if (skill.isOriginMemory) {
      const learned = learnOriginMemory(this, skill.memoryId)
      if (!learned) return false
      const color = skill.color || '#8cffc8'
      this.enemyManager?.addText?.(
        this.player.x, this.player.y - 22,
        `${skill.icon || '🫧'} 源质记忆：${skill.name} Lv.${learned.level}`,
        null, color, 16
      )
      this.weaponSystem?._ring?.(this.player.x, this.player.y, color, 48)
      this.sound.wave()
    }
    // 1. BOSS 职业秘典：独立等级，校验本次候选的旧等级，拒绝重复提交
    else if (skill.isBossSkill) {
      if (!this.bossTomes.learn(skill)) return false
      this.enemyManager?.addText?.(this.player.x, this.player.y - 20, `📜 ${skill.name} Lv.${this.bossSkillLevels[skill.id]}`, null, skill.color || '#ffd166', 16)
      this.sound.wave()
    } else if (skill.isMilestone) {
      // 原生路线/印记已在上面处理；旧主/副专精里程碑不再对 origin 开放。
      if (this.startingStrain === 'origin' || this.startingStrain === 'ricochet') return false
      const info = getSpecInfo(skill.spec, this)
      if (skill.milestoneType === 'primary') {
        this.primarySpec = skill.spec
        this._applyPrimarySpecBonus(skill.spec)
        this.enemyManager?.addText?.(this.player.x, this.player.y - 20, `👑 主专精确立：${info?.name || skill.spec}`, null, info?.color || '#ffd166', 16)
        this.sound.wave()
      }
    } else {
      // 2. 常规技能与自由探索技能应用
      let choiceState = null
      if (skill.isEndlessMastery) {
        if (this.runSelection?.mode !== 'endless') return false
        skill = ENDLESS_SKILL_BY_ID[skill.id]
        if (!skill) return false
      } else if (this.startingStrain === 'origin') {
        const canonical = ORIGIN_SKILL_BY_ID[skill.id] || SKILL_DATABASE.common.find(entry => entry.id === skill.id)
        if (!canonical || (canonical.originOnly && !originSkillAvailable(this, canonical))) return false
        const role = canonical.originOnly
          ? (canonical.originPool === 'fragment' ? 'origin_fragment'
            : canonical.originPool?.startsWith('route_') ? 'origin_route'
            : canonical.originPool === 'mark' ? 'origin_mark' : 'origin_common')
          : 'common'
        skill = { ...canonical, role, progressionRole: role, maxLevel: getEffectiveSkillMaxLevel(this, canonical, role) }
      } else if (this.startingStrain === 'ricochet') {
        const offered = skill
        const canonical = RICOCHET_SKILL_BY_ID[skill.id]
        if (!canonical || !ricochetSkillAvailable(this, canonical)) return false
        skill = { ...canonical, role: offered.role, progressionRole: offered.progressionRole, maxLevel: offered.maxLevel }
        choiceState = this.weaponSystem.ricochetCombat
      } else if (this.startingStrain === 'glutton') {
        const offered = skill
        const common = SKILL_DATABASE.common.find(entry => entry.id === skill.id)
        const canonical = common ? { ...common, kind: 'common' }
          : GLUTTON_SKILL_BY_ID[skill.id] || this._gluttonPrimarySkills().find(entry => entry.id === skill.id)
        if (!canonical || ((canonical.isGluttonSkill || common) && !gluttonSkillAvailable(this, canonical, this._gluttonPrimarySkills()))) return false
        const role = common ? 'common' : offered.role
        skill = { ...canonical, role, progressionRole: common ? 'common' : offered.progressionRole }
        choiceState = this.weaponSystem.gluttonCombat
      } else if (this.startingStrain === 'summoner') {
        const offered = skill
        const common = SKILL_DATABASE.common.find(entry => entry.id === skill.id)
        const canonical = common ? { ...common, kind: 'common' } : SYMBIOSIS_SKILL_BY_ID[skill.id] || this._symbiosisPrimarySkills().find(entry => entry.id === skill.id)
        if (!canonical || ((canonical.isSymbiosisSkill || common) && !symbiosisSkillAvailable(this, canonical, this._symbiosisPrimarySkills()))) return false
        const role = common ? 'common' : offered.role
        skill = { ...canonical, role, progressionRole: common ? 'common' : offered.progressionRole }
        choiceState = this.weaponSystem.petCombat
      } else if (this.startingStrain === 'elemental') {
        const offered = skill
        const common = SKILL_DATABASE.common.find(entry => entry.id === skill.id)
        const canonical = common ? { ...common, kind: 'common' } : skill.isSpellCoreUpgrade ? ordinarySpellCoreSkills(this).find(card => card.id === skill.id) : ELEMENTAL_ROUTE_SKILL_BY_ID[skill.id] || skill
        if (!canonical || ((canonical.isElementalSkill || common) && !elementalSkillAvailable(this, canonical))) return false
        const role = common ? 'common' : offered.role || 'primary'
        skill = { ...canonical, role, progressionRole: common ? 'common' : offered.progressionRole }
        choiceState = this.weaponSystem.spellCombat
      } else if (this.startingStrain === 'shadow') {
        const offered = skill
        const baseSkills = SKILL_DATABASE.assassin.primary.map(entry => resolveShadowSkill(entry, this))
        const canonical = getShadowSkill(skill.id, baseSkills, SKILL_DATABASE.common) || SHADOW_ROUTE_SKILL_BY_ID[skill.id]
        if (!canonical || !shadowSkillAvailable(this, canonical)) return false
        const common = canonical.kind === 'common'
        skill = { ...canonical, role: common && canonical.growthClass !== 'core' ? 'common' : offered.role || 'primary',
          progressionRole: common && canonical.growthClass !== 'core' ? 'common' : offered.progressionRole || 'primary',
          maxLevel: offered.maxLevel ?? canonical.maxLevel }
        choiceState = this.weaponSystem.shadowCombat
      }
      if (!skill.isEndlessMastery && (this.skillLevels[skill.id] || 0) >= getEffectiveSkillMaxLevel(this, skill, skill.role)) return false
      this.skillLevels[skill.id] = (this.skillLevels[skill.id] || 0) + 1
      if (this.startingStrain === 'elemental' && skill.isElementalDiscovery) this.weaponSystem.spellCombat.applyElementalSkill(skill, this.skillLevels[skill.id])
      else skill.apply?.(this, this.skillLevels[skill.id])
      // 异源碎片没有进化演出，但至少要让玩家在场上确认“我真的拿到了”。
      if (this.startingStrain === 'origin' && skill.originPool === 'fragment') {
        const info = ORIGIN_MARKS[skill.fragment]
        const color = info?.color || '#5ad1c8'
        this.enemyManager?.addText?.(this.player.x, this.player.y - 22, `🧬 异源碎片：${skill.name}`, null, color, 16)
        this.weaponSystem?._ring?.(this.player.x, this.player.y, color, 44)
        this._pushStats()
      }
      if (choiceState) choiceState.normalChoices++
    }

    const weaponEvolved = !skill.isBossSkill && !skill.isOriginMemory && this.weaponSystem.registerSkillEvolution(skill)
    if (weaponEvolved && skill.isCapstone) {
      const info = getSpecInfo(skill.spec, this)
      this.evolutionEvent(
        `武器进化：${info?.name || skill.spec}`,
        skill.name.replace(/^🌟\s*/, ''),
        skill.spec,
        skill.isRicochetSkill ? skill.desc : skill.spec === 'symbiosis' ? (SYMBIOSIS_ROUTES[skill.route]?.ultimateDesc || '伙伴协同与鼓舞机制完成终极异化') : skill.spec === 'gluttony' ? '咬击范围与伤害提升，重咬和冲撞可吞噬半血猎物' : this.startingStrain === 'shadow' ? '分身影刃贯穿敌群，影袭协同进化为十字夹击' : '弹体轮廓、出膛反馈与命中音色完成终极异化'
      )
    }

    this._refreshRicochetCooldown()
    this._pushStats()

    if (this._pendingExpeditionStage > 0) {
      const nextStage = this._pendingExpeditionStage
      this._pendingExpeditionStage = 0
      this._enterExpeditionStage(nextStage)
    }
    this.resume()
    return true
  }

  _refreshRicochetCooldown() {
    if (!this.weaponSystem.ricochetCombat.enabled) return
    this.player.strainSkillMax = this.strainSkill.cooldown * (this.player.activeSkillCdMultiplier || 1) * (this.player.geneActiveSkillCdMultiplier || 1)
    this._pushCooldown()
  }

  _gluttonPrimarySkills() {
    return (SKILL_DATABASE?.gluttony?.primary || [])
  }

  _symbiosisPrimarySkills() {
    return [...(SKILL_DATABASE?.symbiosis?.primary || []), ...Object.values(SYMBIOSIS_SKILL_BY_ID)]
  }

  /**
   * 主专精初始觉醒赋能（Lv.5 里程碑与开局预选共用同一套数值）。
   *
   * 角色化后的元素规则归属：
   *  - 元素树（elemental）：附魔概率封顶 60% → 85%，只可能被 elemental / origin 拿到；
   *  - 刺客树（assassin）：暴击保证触发玩家**已有的**元素 proc——**仅当角色有元素权限时赋值**。
   *    暗影史莱姆无元素权限（`_procs` 恒空），因此它拿不到任何元素效果；
   *    origin 若在 Lv.5 选刺客，则恢复「元素 × 暴击」的自由构筑通路。
   *  - 暴食的「消化效率 +50%」已随暴食退出元素链一并移除。
   */
  _applyPrimarySpecBonus(spec) {
    // 职业觉醒赋能只属于专职角色；origin 的路线/印记不调用这里。
    if (this.startingStrain === 'origin') return
    if (spec === 'gluttony') {
      this.devourThreshold = Math.min(DEVOUR_THRESHOLD_CAP, Math.max(this.devourThreshold, 0.28))
      this.player.maxHp += 1
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1)
    } else if (spec === 'gatling') {
      this.weaponSystem.projectileCount += 1
      this.weaponSystem.fireInterval *= 0.85
      this.weaponSystem.splitInherit = 1
    } else if (spec === 'elemental') {
      if (this.weaponSystem.spellCombat.enabled) return
      this.weaponSystem.freezeChance += 0.2
      this.weaponSystem.burnChance += 0.2
      this.weaponSystem.poisonChance += 0.2
      this.weaponSystem.reactionDmgMul = (this.weaponSystem.reactionDmgMul || 1) * 1.35
      this.player.elementProcCap = ELEMENTAL_SPEC_PROC_CAP
      this.player._refreshElements() // 已有元素的附魔概率立即按新封顶重算
    } else if (spec === 'assassin') {
      setCritSource(this, 'awakening', { chanceFloor: 0.25, multiplierFloor: 3.5 })
      // 能力闸门：只有能使用元素的角色才获得这条元素规则（暗影恒不获得）。
      // 显式比较 true，保证字段在任何上下文（含测试桩缺字段）下都是布尔值。
      this.weaponSystem.critGuaranteesElement = this.canUseElements === true
    }
  }

  /** 开局血统预选：先天属性每局 reset 末尾（基因/难度之后）叠加应用 */
  applyStartingStrain(id) {
    this.startingStrain = STRAIN_IDS.includes(id) ? id : 'origin'
    this.startingElement = null
    applyStrain(this, this.startingStrain)
    this.weaponSystem.spellCombat.start()
    return true
  }

  queueSpellCore(boss) {
    if (!this.weaponSystem.spellCombat.enabled || this.runFinished || this.player.dead) return false
    const key = boss.bossGroupId || boss
    if (this._spellCoreSeen.has(key)) return false
    this._spellCoreSeen.add(key)
    this._spellCoreQueue.push({ source: boss.encounterLabel || boss.name || '首领' })
    this.weaponSystem.spellCombat.fx(boss.x, boss.y, 70, '#b6a4ff', 'core', .8)
    this.enemyManager.addText?.(boss.x, boss.y - 40, '◆ 法术核心', null, '#c9baff', 20)
    return true
  }

  _openPendingSpellCore() {
    if (this.runFinished || this.player?.dead || this._pauseLock > 0 || this._spellCoreChoice || !this._spellCoreQueue?.length || !this.onSpellCore) return false
    const spells = this.weaponSystem.spellCombat
    if (!spells.enabled) return false
    // Early BOSS rewards wait for Lv.5; they never bypass the level-based fusion.
    if (!spells.elements.size) return false
    const reward = this._spellCoreQueue.shift(), options = spells.coreOptions()
    this._spellCoreChoice = { ...reward, stage: 'boss', first: false, options }
    this.pause(); this.sound.absorb(); this._pushStats()
    this.onSpellCore(this._spellCoreChoice)
    return true
  }

  resolveSpellCore(id) {
    const option = this._spellCoreChoice?.options.find(s => s.id === id)
    const spells = this.weaponSystem.spellCombat
    if (!option || !(this._spellCoreChoice.milestone ? spells.applyMilestone(option) : spells.applyCore(option))) return false
    this._spellCoreChoice = null
    this._pushStats(); this._pushCooldown(); this.resume()
    return true
  }

  /**
   * 游戏结束：玩家死亡时由 Player.hit 调用。
   * 暂停主循环 + 结束音效 + 回调 Vue 弹结算面板（带统计信息）。
   */
  gameOver() {
    this.finishRun('defeat', 'slime-defeated')
  }

  /** 波次开场决策：无尽模式在撤离点/灾变点暂停，确认后才放行波次。 */
  handleWaveAdvanced(wave) {
    if (
      this.runSelection.mode !== 'endless' ||
      typeof this.onEndlessDecision !== 'function' ||
      (!isEndlessExtractionWave(wave) && !isEndlessCalamityWave(wave))
    ) return false

    this._pendingEndlessWave = wave
    this.pause()
    if (isEndlessExtractionWave(wave)) this._offerEndlessCheckpoint(wave)
    else this._offerEndlessCalamities(wave)
    return true
  }

  /** 实时预估分：战力点与无尽撤离预览共用（胜利/速通项在局内自然为 0）。 */
  _liveScore() {
    return computeScore({
      mode: this.runSelection.mode,
      difficulty: this.runSelection.difficulty,
      result: 'defeat',
      stage: this.expeditionStage,
      wave: this.enemyManager?.wave,
      kills: this.weaponSystem?.kills,
      devours: this.weaponSystem?.devours,
      eliteKills: this.weaponSystem?.eliteKills,
      bossKills: this.weaponSystem?.bossKills,
      eventsCompleted: this.worldEvents?.completed,
      time: this.elapsed,
    })
  }

  _offerEndlessCheckpoint(wave) {
    this._endlessDecisionKind = 'checkpoint'
    this._endlessChoices = []
    const liveScore = this._liveScore()
    const nextBonus = getEndlessRewardBonus(this.endlessCalamities, this.endlessContinues + 1)
    this.onEndlessDecision?.({
      kind: 'checkpoint',
      wave,
      liveScore,
      extractPoints: scoreToPoints(liveScore, this.runSelection, {
        result: 'extracted',
        endlessRewardBonus: this.endlessRewardBonus,
      }),
      defeatPoints: scoreToPoints(liveScore, this.runSelection, {
        result: 'defeat',
        endlessRewardBonus: this.endlessRewardBonus,
      }),
      currentRewardMultiplier: this.endlessRewardMultiplier,
      nextRewardMultiplier: this.runProfile.rewardMul * (1 + nextBonus),
      continues: this.endlessContinues,
      calamities: getEndlessCalamitySummary(this.endlessCalamities),
    })
  }

  _offerEndlessCalamities(wave) {
    this._endlessDecisionKind = 'calamity'
    this._endlessChoices = rollEndlessCalamityChoices(this.endlessCalamities, 3)
    this.onEndlessDecision?.({
      kind: 'calamity',
      wave,
      currentRewardMultiplier: this.endlessRewardMultiplier,
      choices: this._endlessChoices.map((choice) => ({
        ...choice,
        rewardMultiplier:
          this.runProfile.rewardMul *
          (1 +
            getEndlessRewardBonus(
              {
                ...this.endlessCalamities,
                [choice.id]: (this.endlessCalamities[choice.id] || 0) + 1,
              },
              this.endlessContinues
            )),
      })),
      calamities: getEndlessCalamitySummary(this.endlessCalamities),
      continues: this.endlessContinues,
    })
  }

  _offerEndlessBounties(wave) {
    this._endlessDecisionKind = 'bounty'
    this._endlessChoices = getEndlessBountyChoices(this.endlessContinues)
    this.onEndlessDecision?.({
      kind: 'bounty',
      wave,
      choices: this._endlessChoices,
      continues: this.endlessContinues,
    })
  }

  resolveEndlessCheckpoint(action) {
    if (this._endlessDecisionKind !== 'checkpoint' || this._pendingEndlessWave <= 0) return false
    const wave = this._pendingEndlessWave
    if (action === 'extract') {
      this._pendingEndlessWave = 0
      this._endlessDecisionKind = null
      this._endlessChoices = []
      this.finishRun('extracted')
      return true
    }
    if (action !== 'continue') return false
    this.endlessContinues += 1
    this._offerEndlessBounties(wave)
    return true
  }

  resolveEndlessBounty(id) {
    if (this._endlessDecisionKind !== 'bounty' || this._pendingEndlessWave <= 0) return false
    const choice = this._endlessChoices.find((entry) => entry.id === id)
    if (!choice || !getEndlessBounty(id)) return false
    this.endlessBounty = {
      ...choice,
      baseline: this._endlessMetricValue(choice.metric),
      startedAt: this.elapsed,
    }
    const wave = this._pendingEndlessWave
    if (isEndlessCalamityWave(wave)) this._offerEndlessCalamities(wave)
    else this._completeEndlessDecision()
    return true
  }

  resolveEndlessCalamity(id) {
    if (this._endlessDecisionKind !== 'calamity' || this._pendingEndlessWave <= 0) return false
    if (!this._endlessChoices.some((choice) => choice.id === id) || !getEndlessCalamity(id)) return false
    this.endlessCalamities[id] = Math.max(0, Math.floor(this.endlessCalamities[id] || 0)) + 1
    this._completeEndlessDecision()
    this.onRunState?.({ kind: 'calamity', id, name: getEndlessCalamity(id).name, level: this.endlessCalamities[id] })
    return true
  }

  _completeEndlessDecision() {
    const wave = this._pendingEndlessWave
    this._pendingEndlessWave = 0
    this._endlessDecisionKind = null
    this._endlessChoices = []
    this.enemyManager.beginWave(wave)
    this._pushStats()
    this.resume()
  }

  _updateEndlessBounty() {
    const bounty = this.endlessBountyInfo
    if (!bounty) return
    if (bounty.progress >= bounty.target) {
      this.endlessBounty = null
      this.endlessBountiesCompleted += 1
      this._pendingEndlessBountyReward = true
      this.onRunState?.({ kind: 'bounty-complete', name: bounty.name, reward: bounty.reward })
      this._pushStats()
      if (this._pauseLock === 0) {
        this._pendingEndlessBountyReward = false
        this.openFreeSkillPanel()
      }
      return
    }
    if (bounty.timeLeft <= 0) {
      this.endlessBounty = null
      this.onRunState?.({ kind: 'bounty-failed', name: bounty.name })
      this._pushStats()
    }
  }

  _runSnapshot(result) {
    return {
      result,
      defeatReason: result === 'defeat' ? this.defeatReason : null,
      mode: this.runSelection.mode,
      difficulty: this.runSelection.difficulty,
      modeName: this.runProfile.modeInfo.name,
      difficultyName: this.runProfile.difficultyInfo.name,
      rewardMultiplier: this.runProfile.rewardMul,
      endlessRewardBonus: this.endlessRewardBonus,
      effectiveMultiplier: this.endlessRewardMultiplier,
      defeatRetention:
        this.runSelection.mode === 'endless' && result === 'defeat'
          ? ENDLESS_DEFEAT_RETENTION
          : 1,
      calamities: getEndlessCalamitySummary(this.endlessCalamities),
      endlessContinues: this.endlessContinues,
      bounty: this.endlessBountyInfo,
      bountiesCompleted: this.endlessBountiesCompleted,
      stage: this.expeditionStage,
      totalStages: getExpeditionStages(this.runSelection.difficulty).length,
      kills: this.weaponSystem.kills,
      level: this.player.level,
      wave: this.enemyManager.wave,
      elapsed: this.elapsed,
      time: this.elapsed,
      finaleTime: this.finaleTime,
      devours: this.weaponSystem.devours,
      eliteKills: this.weaponSystem.eliteKills,
      bossKills: this.weaponSystem.bossKills,
      eventsCompleted: this.worldEvents.completed,
      eventsFailed: this.worldEvents.failed,
      behavior: this.weaponSystem.stats, // 代表行为（连锁/引爆，物种档案）
      species: buildSpecies(this.player, this.genes, this.enemyManager.wave, this.weaponSystem.kills, this.weaponSystem.stats), // 物种档案（评审：可截图的传播点）
      epilogue: this.dialogue.epilogue,
    }
  }

  finishRun(result, defeatReason = null) {
    if (this.runFinished) return
    this.runFinished = true
    this.bossTomes.clearStage()
    this._bossRewardQueue.length = 0
    this._chapterSettlement = null
    this.onExpeditionReward?.(null)
    this.weaponSystem.shadowCombat.reset()
    this.weaponSystem.petCombat.reset()
    this.weaponSystem.spellCombat.shots.length = 0
    this.weaponSystem.spellCombat.fields.length = 0
    this.weaponSystem.spellCombat.delayed.length = 0
    this.weaponSystem.spellCombat.lightning.reset()
    this.weaponSystem.spellCombat.shield.reset()
    this.weaponSystem.spellCombat.contagion.reset()
    this.weaponSystem.spellCombat.poisonThrow = null
    this._spellCoreQueue = []
    this._spellCoreChoice = null
    this.defeatReason = result === 'defeat' ? defeatReason || 'slime-defeated' : null
    this.runState = result === 'victory'
      ? 'victory'
      : result === 'extracted' ? 'extracted' : 'defeat'
    this.pause()
    if (result === 'defeat') this.sound.gameOver()
    else if (result === 'victory') this.sound.newRecord?.()
    else this.sound.uiSelect?.()
    this._pushStats()
    this.onGameOver?.(this._runSnapshot(result))
  }

  failExpeditionObjective(reason) {
    if (this.runSelection.mode !== 'expedition' || this.runFinished) return false
    this.finishRun('defeat', reason)
    return true
  }

  handleBossDefeated(boss) {
    this.bossArena.onBossDeath(boss) // 决斗圈随 BOSS 死亡消散
    // 编队类型必须在 advanceBossEncounter 之前取样：清空后 _bossEncounter 会被置 null，
    // 已阵亡成员也已从 _bosses 移除。
    const encounterTypes = this.enemyManager.bossEncounterTypes?.(boss) || (boss?.type ? [boss.type] : [])
    const encounterComplete = this.enemyManager.advanceBossEncounter(boss)
    if (
      this.runState === 'finale' &&
      (boss?.isFinalBoss || boss?.bossEncounterFinal) &&
      encounterComplete
    ) {
      this.finishRun('victory')
    }
    if (this.runState === 'expedition-boss' && boss?.isExpeditionBoss && encounterComplete) {
      this.finishRun('victory')
    }
    if (
      this.runState === 'expedition-guardian' &&
      boss?.isExpeditionStageBoss &&
      encounterComplete
    ) {
      this._completeExpeditionStage()
    }
    if (encounterComplete && !this.runFinished) {
      if (this.runSelection.mode === 'expedition') {
        this._lastChapterBoss = boss.name
        // 章节首领复用骑士/法师/弓手 archetype，源质映射按稳定类型判定（不按显示名）。
        this._lastChapterBossTypes = encounterTypes
      } else this.queueBossReward(boss, encounterTypes)
    }
  }

  _enterFinale() {
    if (this.runState !== 'active') return
    this.runState = 'finale'
    this.finaleTime = 0
    this.worldEvents.cancelForFinale()
    // 终局审判：战场切入王城决战场（与远征统帅共用宫廷构图）
    this._setMapTheme('royal', 'shattered-court', false)
    const boss = this.enemyManager.beginFinale()
    this.onRunState?.({ kind: 'finale', boss: boss?.encounterLabel || '王国最后防线' })
  }

  _updateRunState(dt) {
    if (this._openPendingBossReward()) return
    if (this._openPendingSpellCore()) return
    if (this.runSelection.mode === 'expedition') {
      this._updateExpedition(dt)
      return
    }
    // 无尽战场推进：跨过推进波次即换景（边境 → 腐化 → 王城），交叉淡化 + 战区横幅
    if (this.runSelection.mode === 'endless' && this.runState === 'active') {
      this._updateEndlessFormationBreak(dt)
      this._updateEndlessBounty()
      const progression = getProgressionStage(this.enemyManager.wave)
      if (progression.theme !== this._mapThemeId) {
        this._setMapTheme(progression.theme, progression.variant, false)
        this.onRunState?.({ kind: 'zone', zone: getMapTheme(progression.theme).name })
      }
    }
    if (this.runSelection.mode !== 'timed' || this.runFinished) return
    if (this.runState === 'finale') {
      this.finaleTime += dt
      return
    }
    if (this.runState !== 'active') return
    if (!this._finalWarningShown && this.elapsed >= FINAL_WARNING_AT) {
      this._finalWarningShown = true
      this.onRunState?.({ kind: 'warning', seconds: RUN_DURATION - this.elapsed })
    }
    if (this.elapsed >= RUN_DURATION) this._enterFinale()
  }

  _enterExpeditionStage(stage, forceMap = false) {
    this.bossTomes?.clearStage()
    this.weaponSystem.shadowCombat.reset({ preserveBuild: true })
    this.weaponSystem.petCombat.reset()
    this.player._dodgedAttacks = new WeakSet()
    const total = getExpeditionStages(this.runSelection.difficulty).length
    this.expeditionStage = Math.max(1, Math.min(total, stage))
    this.expeditionStageElapsed = 0
    this.expeditionIntroTime = 0
    const definition = getExpeditionStage(this.runSelection.difficulty, this.expeditionStage)
    this._expeditionDefinition = definition
    this._mapSpawn = definition.spawn || { x: 0.5, y: 0.5 }
    this.runState = 'expedition-intro'
    this.worldEvents.cancelForTransition()
    this.enemyManager.prepareExpeditionStage()
    this.enemyManager.setStagePressure(0) // 新章节从零开始，收口状态重置
    this._setMapTheme(definition.theme, definition.variant, true, forceMap)
    this.mapFeatures.prepareStage(definition)
    this._placePlayerAtMapSpawn()
    this._expeditionBaseline = {
      kills: this.weaponSystem.kills,
      elites: this.weaponSystem.eliteKills,
      events: this.worldEvents.completed,
    }
    this.onRunState?.({
      kind: 'expedition-stage',
      stage: this.expeditionStage,
      total: getExpeditionStages(this.runSelection.difficulty).length,
      title: definition.title,
      region: definition.region,
    })
    this._pushStats()
  }

  /** 远征换章是地域跳转：玩家与相机必须同步落在本章入口。 */
  _placePlayerAtMapSpawn() {
    const spawn = this._mapSpawn || { x: 0.5, y: 0.5 }
    this.player.x = Math.max(this.player.radius, Math.min(this.worldWidth - this.player.radius, spawn.x * this.worldWidth))
    this.player.y = Math.max(this.player.radius, Math.min(this.worldHeight - this.player.radius, spawn.y * this.worldHeight))
    this.player._trail.length = 0
    this.player._decoys.length = 0
    this._camInit = false
  }

  _activateExpeditionStage() {
    const definition = this._expeditionDefinition ||
      getExpeditionStage(this.runSelection.difficulty, this.expeditionStage)
    this.runState = definition.type === 'boss' ? 'expedition-boss' : 'active'
    if (definition.type === 'event' || definition.type === 'mixed') {
      this.worldEvents.spawnEvent(definition.eventType)
    } else if (definition.type === 'elites') {
      this.enemyManager.spawnExpeditionElites(definition.target, definition.eliteTypes)
    } else if (definition.type === 'defend') {
      this.mapFeatures.beginNestDefense()
    } else if (definition.type === 'boss') {
      this.enemyManager.beginExpeditionBoss(getExpeditionBoss(definition.bossId))
    }
    this._pushStats()
  }

  _expeditionProgress() {
    const definition = getExpeditionStage(this.runSelection.difficulty, this.expeditionStage)
    const kills = Math.max(0, this.weaponSystem.kills - this._expeditionBaseline.kills)
    const elites = Math.max(0, this.weaponSystem.eliteKills - this._expeditionBaseline.elites)
    const events = Math.max(0, this.worldEvents.completed - this._expeditionBaseline.events)
    const progress = definition.type === 'kills'
      ? kills
      : definition.type === 'event'
      ? events
      : definition.type === 'elites'
      ? elites
      : definition.type === 'survive' || definition.type === 'defend'
      ? this.expeditionStageElapsed
      : definition.type === 'mixed'
      ? Math.min(definition.target, kills) +
        Math.min(definition.eventTarget, events) * definition.target
      : this.runState === 'expedition-intro' || this.enemyManager.hasBoss ? 0 : 1
    const total = definition.type === 'mixed'
      ? definition.target * 2
      : definition.target
    const complete = definition.type === 'mixed'
      ? kills >= definition.target && events >= definition.eventTarget
      : definition.type === 'defend'
      ? progress >= total && (this.mapFeatures.nestInfo?.hp || 0) > 0
      : progress >= total
    return { definition, kills, elites, events, progress, total, complete }
  }

  _updateExpedition(dt) {
    if (this.runFinished) return
    if (this.runState === 'expedition-intro') {
      this.expeditionIntroTime += dt
      if (this.expeditionIntroTime >= EXPEDITION_INTRO_DURATION) {
        this._activateExpeditionStage()
      }
      return
    }
    if (this.runState === 'expedition-boss' || this.runState === 'expedition-guardian') {
      this.expeditionStageElapsed += dt
      return
    }
    if (this.runState === 'stage-clearing') {
      if (this._pauseLock > 0) return // 同帧经验升级先完成，避免覆盖已有选卡
      // 残敌溃散演出（0.6s）：演出结束后才暂停进补给——清除不再「瞬间发生」
      this._stageClearT += dt
      if (this._stageClearT < 0.6) return
      this.runState = 'stage-reward'
      this.enemyManager.prepareExpeditionStage()
      this.worldEvents.cancelForTransition()
      this._beginBossSettlement(true)
      return
    }
    if (this.runState !== 'active') return
    this.expeditionStageElapsed += dt
    const progress = this._expeditionProgress()
    // 首领登场收口：把章节完成度推给敌军管理器，越接近目标增援越稀疏
    this.enemyManager.setStagePressure(progress.total > 0 ? progress.progress / progress.total : 0)
    if (!progress.complete) return

    if (progress.definition.type === 'defend') this.mapFeatures.completeNestDefense()
    this.runState = 'expedition-guardian'
    this.worldEvents.cancelForEncounter()
    const encounter = getExpeditionBoss(progress.definition.bossId)
    const boss = this.enemyManager.beginExpeditionStageBoss(encounter)
    this.onRunState?.({
      kind: 'expedition-guardian',
      stage: this.expeditionStage,
      title: progress.definition.title,
      boss: boss?.name || encounter.name,
      special: encounter.special,
    })
    this._pushStats()
  }

  _completeExpeditionStage() {
    const definition = getExpeditionStage(this.runSelection.difficulty, this.expeditionStage)
    // 过关瞬间：残敌溃散 + 横幅提示，先播 0.6s 胜势演出
    this.runState = 'stage-clearing'
    this._stageClearT = 0
    this.enemyManager.routAll()
    this.worldEvents.cancelForTransition()
    this.onRunState?.({
      kind: 'expedition-clear',
      stage: this.expeditionStage,
      title: definition.title,
    })
  }

  resolveExpeditionReward(selection) {
    const session = this._chapterSettlement
    if (!session || this.runFinished || this.player.dead) return false
    const id = typeof selection === 'string' ? selection : selection?.id
    if (session.phase !== 'supply') {
      const card = session.options.find(option => option.id === id)
      if (!card) return false
      this._settlementApplying = true
      let applied
      try { applied = this.applySkill(card) } finally { this._settlementApplying = false }
      if (!applied) return false
      if (session.phase === 'boss') {
        session.summary = card.isOriginMemory
          ? `${card.name} · Lv.${originMemories(this).find(m => m.id === card.memoryId)?.level || 1}/3`
          : `${card.name} · Lv.${this.bossSkillLevels[card.id]}/3${card.recruitName ? ` · 招募${card.recruitName}` : ''}`
      } else if (!session.summary) session.summary = `秘典满级补偿 · ${card.name}`
      if (session.phase === 'study') this._finishSettlement()
      else this._advanceSettlement()
      return true
    }
    if (!EXPEDITION_REWARDS.some(reward => reward.id === id)) return false
    if (id === 'blood' && this.player.maxHp <= 1) return false
    if (id === 'rest') this.player.heal(this.player.maxHp)
    if (id === 'blood') {
      this.player.maxHp -= 1
      this.player.hp = Math.min(this.player.hp, this.player.maxHp)
      this.weaponSystem.damage *= 1.2
    }
    if (id === 'tome') {
      this._ensureRoleAwakening()
      const options = rollSkills(this, this._skillOptionCount())
      if (options.length) {
        session.phase = 'study'; session.options = options
        this._publishSettlement(); return true
      }
      this.player.heal(1)
    }
    this._finishSettlement()
    return true
  }

  /** 反应信息（替换面板展示用：图标组合/名称/物种/效果） */
  _reactionInfo(id) {
    const r = REACTIONS.find((x) => x.id === id)
    if (!r) return null
    return {
      id: r.id,
      name: r.name,
      species: r.species,
      desc: r.desc,
      combo: r.combo.map((el) => getElement(el)?.icon || '?').join(' + '),
    }
  }

  /** 副反应位已满（阶段十六槽位经济）：暂停 + 回调 Vue 弹替换面板 */
  reactionSlotsFull(candidateId) {
    this.pause()
    this.sound.uiClick()
    this.onReactionFull?.({
      candidate: this._reactionInfo(candidateId),
      secondaries: Array.from(this.player._secondaryIds, (id) => this._reactionInfo(id)),
      slots: this.player.secondarySlots,
      count: this.player._secondaryIds.size,
    })
  }

  /** 替换面板选择结果（阶段十六）：replacedId 为 null = 放弃新反应；否则替换该副反应 */
  resolveReactionSwap(newId, replacedId) {
    this.player.resolveSecondarySwap(newId, replacedId)
    this.resume()
  }

  /**
   * 元素核心吃前确认（阶段十六追加）：首颗元素 / 首次融合 → 暂停 + 回调 Vue 弹面板。
   * 两者都是不可逆的「永久改变身体」时刻，值得一次确认；其余核心靠近后自动吸收。
   */
  askFusionConfirm(type) {
    this.pause()
    this.sound.uiClick()
    const el = getElement(type)
    const firstElement = this.player.elements.size === 0
    let reaction = null
    let combos = []
    if (firstElement) {
      // 首颗元素：预览该元素可融合的全部组合（帮助玩家规划主形态方向）
      combos = REACTIONS.filter((r) => r.combo.includes(type)).map((r) => {
        const other = r.combo.find((e) => e !== type)
        const oe = getElement(other)
        return { element: other, icon: oe?.icon || '?', name: oe?.name || '', species: r.species }
      })
    } else {
      const test = new Map(this.player.elements)
      test.set(type, 1)
      const r = getActiveReactions(test)[0]
      if (r) reaction = this._reactionInfo(r.id)
    }
    this.onFusionConfirm?.({
      type,
      icon: el?.icon || '?',
      name: el?.name || type,
      firstElement,
      reaction,
      combos,
    })
  }

  /** 首融确认结果（阶段十六追加）：accepted 为 true 时吸收并触发首融进化 */
  resolveFusionConfirm(type, accepted) {
    this._pauseLock = Math.max(0, this._pauseLock - 1) // 释放确认锁
    this.start()
    if (accepted) this.player.absorbElement(type) // 首融进化（自带演出暂停与恢复）
    this.gemManager.resolveHeld(accepted) // 移除 / 吐回宝石
  }

  /**
   * 进化事件（评审 Day 2）：元素融合激活时暂停 0.9s + 全屏演出，
   * 让玩家明确知道「刚才发生了一件重要的事」；演出结束自动恢复。
   */
  evolutionEvent(title, subtitle, mutation, desc = '') {
    this.pause()
    this.sound.evolution()
    // 进化瞬间的场上反馈（阶段十五）：玩家位置粒子爆发 + 扩散环 + 微震，
    // 进化不再是「弹窗闪过就没」，而是场上能看到的质变瞬间
    this.weaponSystem._burst(this.player.x, this.player.y, 'mage', 22, true)
    this.weaponSystem._ring(this.player.x, this.player.y, '#d2ff8a', 90)
    this.shakeScreen(5, 0.3)
    this.onEvolution?.(title, subtitle, mutation, desc)
    clearTimeout(this._evolutionTimer)
    this._evolutionTimer = setTimeout(() => {
      // 死亡或仍有其他暂停源（暂停锁 > 1）时不自动恢复：
      // resume() 只在锁归零时启动主循环，演出期间手动暂停不会被顶掉
      if (!this.running && !this.player.dead) this.resume()
    }, 900)
  }

  /**
   * 重置整局游戏（结算面板点「再来一局」时调用）：
   * 玩家属性/技能等级/各管理器全部还原，技能重新开始抽取；
   * 黑市基因在最后应用（覆盖基础值，每局自动生效）。
   * 注意：不自动 start()，由调用方（Vue）显式恢复。
   */
  reset() {
    const p = this.player
    this._mapSeed = ((Math.random() * 0xffffffff) >>> 0) || 1
    this._mapSpawn = { x: 0.5, y: 0.5 }
    this.input.reset()
    p.resetRunState() // 先清掉上一局专精/临时状态，再恢复基础值并应用永久基因
    p.x = this.worldWidth / 2 // 出生点：世界中心
    p.y = this.worldHeight / 2
    p.hp = p.maxHp
    p.dead = false
    p.invincible = 0
    p.flash = 0
    p.speed = 340
    p.level = 1
    p.exp = 0
    p.maxExp = STARTING_EXP_THRESHOLD
    p.pickupRadius = 150
    p.elements.clear() // 清空本局吸收的元素
    p._refreshElements() // 重建元素派生缓存（激活反应/附魔概率归零）
    p._primaryReaction = null // 主形态锁定清空（新局新身份，阶段十五）
    p._secondaryIds.clear() // 副反应槽位清空（阶段十六；槽位数由 applyGenes 重置）
    p._trail.length = 0 // 清空酸液拖尾
    p._devourPulse = 0
    p._ripple = 0
    p._stopJitter = 0
    // 视觉/循环状态清零：防重开后带旧朝向/形变、再生/拖尾计时错位
    p.facing = -Math.PI / 2
    p.moveBlend = 0
    p.elapsed = 0
    p._trailTimer = 0
    p._regenTimer = 10
    p._blink = 0 // 视觉状态清零（阶段十五美化）
    p._blinkT = 2 + Math.random() * 2.5
    p._aura.length = 0
    this.primarySpec = null
    this.secondarySpec = null
    this.originRoute = null
    this.originMark = null
    // 源质记忆是「本局吸收」的成长：新开局清空，远征换章保留（不参与任何重置）。
    resetOriginSourceMemories(this)
    this._originSourceSeen = new Set()
    this.roleSpec = null // 角色身份归位（随后由 applyStrain 按血统重建）
    this.strainDevourBonus = 0
    this.devourThreshold = DEVOUR_THRESHOLD_BASE
    p.strainSkillCd = 0 // 空格 角色技能冷却归位
    p.strainSkillMax = 0
    p.strainSkillReadyPulse = 0
    // 暴食猎食点归零（随后由 applyStrain 按血统重建归属：
    // 暴食从 0 点 / 0 进度起步，其它角色置 -1 关闭该资源）
    resetGluttonResource(p)
    this.skillLevels = {}
    this.bossSkillIds = new Set()
    this.bossSkillLevels = {}
    this.bossTomes.reset()
    this._bossRewardQueue = []
    this._bossRewardSeen = new Set()
    this._chapterSettlement = null
    this._settlementApplying = false
    this._lastChapterBoss = null
    this._lastChapterBossTypes = []
    this.startingElement = null
    this._spellCoreQueue = []
    this._spellCoreChoice = null
    this._spellCoreSeen.clear()
    this.elapsed = 0
    this.runState = 'active'
    this.finaleTime = 0
    this.runFinished = false
    this.defeatReason = null
    this._finalWarningShown = false
    this.expeditionStage = 1
    this.expeditionStageElapsed = 0
    this.expeditionIntroTime = 0
    this._expeditionDefinition = null
    this._pendingExpeditionStage = 0
    this.endlessCalamities = {}
    this.endlessContinues = 0
    this._pendingEndlessWave = 0
    this._endlessDecisionKind = null
    this._endlessChoices = []
    this.endlessBounty = null
    this.endlessBountiesCompleted = 0
    this._pendingEndlessBountyReward = false
    this.endlessFormationBreakTimer = 0
    this._pauseLock = 0 // 清空暂停锁（重开即全新状态）
    this._camInit = false // 相机下一帧瞬间定位到新出生点
    this._shakeT = 0 // 清空屏幕震动（阶段十五）
    this.sound.stopMusic() // 复位 BGM（reset 后由 start() 重建，防孤立播放）
    this.enemyManager.reset()
    this.bossArena.reset() // 决斗圈：纯局内状态，重开归零
    this.mapFeatures.reset()
    this.worldEvents.reset()
    this.dialogue.reset()
    this.gemManager.reset()
    this.weaponSystem.reset()
    applyGenes(this, this.genes) // 黑市基因最后应用（含满血开局）
    if (this.runProfile.playerBonusHp > 0) {
      p.maxHp += this.runProfile.playerBonusHp
      p.hp = p.maxHp
    }
    applyStrain(this, this.startingStrain) // 血统先天属性：最后叠加（生命/移速/攻击/吞噬口径）
    resetPrimalEnergy(p) // 异源能量：纯局内资源，重开归零（不进存档）
    this.weaponSystem.spellCombat.start()
    if (this.runSelection.mode === 'expedition') {
      this._enterExpeditionStage(1, true)
    } else if (this.runSelection.mode === 'endless') {
      // 无尽：边境开局，随灾变波次推进到腐化、王城（战场烧向王都）
      this._setMapTheme('frontier', 'marsh-edge', true, true)
    } else {
      // 限时：边境或腐化开局（种子决定），王城留给终局勇者的决战场
      const startTheme = this._mapSeed % 2 === 0 ? 'frontier' : 'blight'
      const variants = { frontier: 'marsh-edge', blight: 'blight-garden' }
      this._setMapTheme(startTheme, variants[startTheme], true, true)
    }
    this.gameplay?.reset() // Gameplay 层整局重置（arena 空实现，不影响既有 reset 顺序）
  }

  /** 设置黑市基因（存档加载/购买后调用），立即生效并持续到后续每局 */
  setGenes(genes) {
    this.genes = { ...(genes || {}) }
    applyGenes(this, this.genes)
  }

  destroy() {
    this._resumeOnVisible = false
    this.stop()
    this.sound.stopMusic() // 停止 BGM 调度（清理 interval）
    clearTimeout(this._worldBgTimer) // 取消待执行的世界背景重建
    window.removeEventListener('resize', this._onResize)
    document.removeEventListener('visibilitychange', this._onVisibility)
    window.removeEventListener('keydown', this._unlockAudio)
    window.removeEventListener('click', this._unlockAudio)
    // Gameplay 是上层生命周期对象：在 Input / entities / 回调等 Engine 基础设施
    // 仍完整时先给销毁机会，未来 Gameplay 可在此注销自有资源或清理自有 Entity。
    this.gameplay?.destroy()
    this.input.destroy()
    this.entities.length = 0
    this.onStats = null
    this.onCooldown = null
    this.onGameplayHud = null
    this.onGameplayFinished = null
    this.onLevelUp = null
    this.onSpellCore = null
    this.onGameOver = null
    this.onBossSpawn = null
    this.onBossGroupSpawn = null
    this.onWaveChanged = null
    this.onWorldEvent = null
    this.onRunState = null
    this.onExpeditionReward = null
    this.onEndlessDecision = null
    this.onEvolution = null
    this.onReactionFull = null
    this.onFusionConfirm = null
    clearTimeout(this._evolutionTimer)
    if (GameEngine.#instance === this) GameEngine.#instance = null
  }

  // ------------------------------------------------------------
  // 主循环：requestAnimationFrame + deltaTime
  // ------------------------------------------------------------

  _tick(ts) {
    // 先排队下一帧：保证 stop()/pause() 的 cancel 一定生效。
    // （若排队写在帧尾，update 中触发暂停后本帧尾部还会再排一帧，
    //   resume() 与帧尾重复排队会 double-tick）
    this._rafId = requestAnimationFrame(this._tick)
    if (!this.running) return

    // 增量时间（秒）：首帧 dt=0；上限 MAX_DT 防切后台后的时间跳跃
    const dt = this._lastTs ? Math.min((ts - this._lastTs) / 1000, MAX_DT) : 0
    this._lastTs = ts
    this.elapsed += dt

    this.update(dt)
    this.render()

    if (this.gameplayId === 'arena') {
      // Arena 专属桥接；Runner 不遍历无关的敌人、技能和 Boss 状态。
      this._statAcc += dt
      if (this._statAcc >= 0.5) this._pushStats()
      this._cdAcc += dt
      if (this._cdAcc >= 0.1) this._pushCooldown()
    }

    this._gameplayHudAcc += dt
    if (this._gameplayHudAcc >= 0.1) this._pushGameplayHud()
  }

  /** 推送当前玩法的专属 HUD；Arena 返回 null，不产生额外 UI 更新。 */
  _pushGameplayHud() {
    const snapshot = this.gameplay?.getHudSnapshot?.()
    if (snapshot) this.onGameplayHud?.(snapshot)
    this._gameplayHudAcc = 0
  }

  /** 推送一次冷却数据（冲刺 / Boss 施法 / 破阵追击 / 空格 角色技能），约 10Hz */
  _pushCooldown() {
    this.onCooldown?.({
      cast: this.enemyManager.bossInfo?.castProgress || 0,
      formationBreak: this.endlessFormationBreakTimer,
      formationBreakMax: ENDLESS_FORMATION_BREAK_DURATION,
      // 空格角色技能：菜单/冷却条数据源。
      // 资源型技能（暴食）额外给出 charge 口径，HUD 改渲染猎食点而非冷却条——
      // 它的 skillMax 恒为 0，因此旧的冷却分支天然不会被点亮。
      // 伙伴面板跟随系统开关而非血统名：只有共生血统会开启完整名册。
      pets: this.weaponSystem.petCombat.enabled ? this.weaponSystem.petCombat.hud() : null,
      petRally: this.weaponSystem.petCombat.enabled ? this.weaponSystem.petCombat.rallyHud() : null,
      tomeShield: this.bossTomes.shield,
      spellShield: this.weaponSystem.spellCombat.available ? this.weaponSystem.spellCombat.shield.hud() : null,
      shadow: this.startingStrain === 'shadow' ? {
        evasion: this.player.evasionChance, crit: this.weaponSystem.critChance,
        count: this.weaponSystem.shadowCombat.clones.items.length,
        cap: this.weaponSystem.shadowCombat.clones.cap,
        chance: this.weaponSystem.shadowCombat.clones.chance,
        power: this.weaponSystem.shadowCombat.clones.power,
        duration: this.weaponSystem.shadowCombat.clones.duration,
        ...this.weaponSystem.shadowCombat.hud(),
      } : null,
      skillId: this.strainSkill?.id || null,
      skillName: this.strainSkill?.name || '',
      skillDesc: this.strainSkill?.getDesc?.(this) || this.strainSkill?.desc || '',
      skillCd: this.player.strainSkillCd,
      skillMax: this.player.strainSkillMax,
      charge: this.strainSkill?.getHud?.(this.player) || null,
    })
    this._cdAcc = 0
  }

  /** 推送一次实时统计（HUD 用；升级面板弹出前也调用，保证面板/HUD 显示最新等级） */
  _pushStats() {
    this.onStats?.({
      elapsed: this.elapsed,
      enemies: this.enemyManager.count,
      gems: this.gemManager.count,
      kills: this.weaponSystem.kills,
      // 实际攻击力（基础 × 等级成长 × 捕食吞噬加成，供 HUD 展示）
      dmg:
        Math.round(
          this.weaponSystem.damage * this.weaponSystem.levelMul * this.weaponSystem.devourDamageMul * (this.weaponSystem.ricochetCombat.route === 'pierce' ? 1.35 : 1) * 100
        ) / 100,
      wave: this.enemyManager.wave,
      waveName: this.enemyManager.waveName,
      level: this.player.level,
      exp: this.player.exp,
      maxExp: this.player.maxExp,
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      devourThreshold: this.devourThreshold,
      // 血统对吞噬线的加宽（pct）：HUD 需要它才能显示「真实」的普通/精英门槛，
      // 否则会把暴食角色的白旗线显示得比实际更窄
      strainDevourBonus: this.strainDevourBonus,
      boss: this.enemyManager.bossInfo,
      director: this.enemyManager.directorInfo,
      objective: this.worldEvents.objectiveInfo,
      eventsCompleted: this.worldEvents.completed,
      // 实时分数（HUD 直接展示原始信号；战力点折算留给撤离面板与结算页）
      score: this._liveScore(),
      elements: Array.from(this.player.elements, ([id, lv]) => ({ id, lv })), // 元素等级（HUD 显示 💧2）
      // 激活反应（阶段十五：HUD 常驻徽章 + 效果说明，进化「有什么效果」一眼可读）
      reactions: this.player._reactions.map((r) => ({ id: r.id, name: r.name, desc: r.desc })),
      primaryReaction: this.player._primaryReaction, // 主形态（★ 徽章标识）
      coreResonance: (() => {
        const resonance = getOriginCoreResonance(this)
        return resonance
          ? {
              id: resonance.id,
              name: resonance.name,
              effect: resonance.effect,
              icons: resonance.icons,
              levels: resonance.levels,
              strength: resonance.strength,
              color: resonance.color,
              primary: resonance.primary,
            }
          : null
      })(),
      secondaryCount: this.player._secondaryIds.size, // 副反应占用（阶段十六）
      secondarySlots: this.player.secondarySlots,
      skillRerolls: this.player.geneRerolls || 0,
      primarySpec: this.primarySpec,
      secondarySpec: this.secondarySpec,
      originRoute: this.originRoute,
      originMark: this.originMark,
      // 异源碎片（Lv.1~4 获取）：HUD 需要显示已拥有碎片，否则选完就“消失”。
      originFragments: this.startingStrain === 'origin'
        ? originFragmentFamilies(this).filter((family) => family !== this.originMark).map((family) => {
          const info = ORIGIN_MARKS[family]
          const skill = ORIGIN_SKILL_BY_ID[`ori_frag_${family}`]
          const effect = typeof skill?.stats === 'function' ? skill.stats(0, this) : skill?.stats || ''
          const inactive = family === 'elemental' && !this.player.elements.size
          return {
            id: family,
            skillId: `ori_frag_${family}`,
            icon: info.icon,
            name: info.name.replace('印记', '碎片'),
            color: info.color,
            title: inactive ? '尚未吸收元素核心：震荡的元素附着不会触发' : effect,
          }
        })
        : [],
      // 角色身份（阶段十九）：HUD 据此显示角色名、决定是否渲染吞噬线（canDevour）
      bossTomes: this.bossTomes.hud(),
      roleSpec: this.roleSpec,
      strainId: this.startingStrain,
      canDevour: this.canDevour,
      canUseElements: this.canUseElements,
      ricochet: this.weaponSystem.ricochetCombat.enabled ? this.weaponSystem.ricochetCombat.hud() : null,
      symbiosis: this.weaponSystem.petCombat.enabled ? this.weaponSystem.petCombat.hudBuild() : null,
      spells: this.weaponSystem.spellCombat.enabled ? this.weaponSystem.spellCombat.hud() : null,
      // 消化进度（吞噬 → 元素联动的可见口径）：满载待命时 ratio = 1，吸收首颗核心即兑现
      digest: {
        charge: Math.round(this.weaponSystem.digestCharge),
        max: this.weaponSystem.digestChargeMax,
        bursts: this.weaponSystem.digestBursts,
      },
      // 异源能量（HUD 能量条；非 origin 恒为 0，HUD 按 strainId 决定是否渲染）
      origin: {
        energy: Math.round(this.player.originEnergy || 0),
        max: PRIMAL_ENERGY_MAX,
        cost: PRIMAL_OVERLOAD_COST,
        effect: primalOverloadDescription(this),
        route: this.originRoute,
        mark: this.originMark,
        overload: this.player.overloadState ? {
          active: !!this.player.overloadState.active,
          timer: this.player.overloadState.timer || 0,
          damageMul: this.player.overloadState.damageMul || 1,
          radiusMul: this.player.overloadState.radiusMul || 1,
        } : null,
        mutation: this.player.mutationState ? {
          stacks: this.player.mutationState.stacks || 0,
          max: this.player.mutationState.max || 5,
          timer: this.player.mutationState.timer || 0,
          empowered: !!this.player.mutationState.empowered,
        } : null,
        circuits: this.player.routeState?.resonance?.circuits || 0,
        // 源质记忆：三槽位、当前轮换位、下一次超载预告、最近一次释放（HUD 高亮）。
        memory: originMemoryHud(this),
      },
      // 兼容旧 HUD：primal 仍指向同一份异源能量
      primal: {
        value: Math.round(this.player.originEnergy || 0),
        max: PRIMAL_ENERGY_MAX,
        cost: PRIMAL_OVERLOAD_COST,
        effect: primalOverloadDescription(this),
      },
      // 暴食猎食点（stats 侧口径，给常驻面板用；高频冷却条走 cooldown.charge）：
      // 非暴食角色 has=false，HUD 整项不渲染
      glutton: hasGluttonResource(this.player)
        ? {
            has: true,
            charge: this.player.gluttonCharge,
            max: GLUTTON_CHARGE_MAX,
            progress: this.player.gluttonDevourProgress,
            progressPer: GLUTTON_DEVOURS_PER_CHARGE,
            ready: this.player.gluttonCharge > 0 && this.player.gluttonRecastLock <= 0,
            ...(this.weaponSystem.gluttonCombat.enabled ? this.weaponSystem.gluttonCombat.hud() : {}),
          }
        : { has: false, charge: 0, max: GLUTTON_CHARGE_MAX, progress: 0, progressPer: GLUTTON_DEVOURS_PER_CHARGE, ready: false },
      x: Math.round(this.player.x), // 扁平坐标：UI 端可直接整树赋值（见 createDefaultStats）
      y: Math.round(this.player.y),
      run: {
        ...this.runSelection,
        modeName: this.runProfile.modeInfo.name,
        difficultyName: this.runProfile.difficultyInfo.name,
        state: this.runState,
        remaining: this.runSelection.mode === 'timed' && this.runState === 'active'
          ? Math.max(0, RUN_DURATION - this.elapsed)
          : null,
        finaleTime: this.finaleTime,
        rewardMultiplier: this.runProfile.rewardMul,
        endlessRewardBonus: this.endlessRewardBonus,
        effectiveMultiplier: this.endlessRewardMultiplier,
        disasterTier: getEndlessDisasterTier(this.runSelection, this.enemyManager.wave),
        calamities: getEndlessCalamitySummary(this.endlessCalamities),
        endlessContinues: this.endlessContinues,
        bounty: this.endlessBountyInfo,
        bountiesCompleted: this.endlessBountiesCompleted,
        stage: this.expeditionStage,
        totalStages: getExpeditionStages(this.runSelection.difficulty).length,
        chapterTitle: this.runSelection.mode === 'expedition'
          ? getExpeditionStage(this.runSelection.difficulty, this.expeditionStage).title
          : '',
        chapterBrief: this.runSelection.mode === 'expedition'
          ? getExpeditionStage(this.runSelection.difficulty, this.expeditionStage).brief
          : '',
        region: this.runSelection.mode === 'expedition'
          ? getExpeditionStage(this.runSelection.difficulty, this.expeditionStage).region
          : getMapTheme(this._mapThemeId).name,
        theme: this._mapThemeId,
        objective: this.runSelection.mode === 'expedition'
          ? (() => {
              const progress = this._expeditionProgress()
              return {
                title: progress.definition.title,
                brief: progress.definition.brief,
                type: progress.definition.type,
                progress: progress.progress,
                total: progress.total,
                kills: progress.kills,
                events: progress.events,
                eventTarget: progress.definition.eventTarget || 0,
                defense: progress.definition.type === 'defend' ? this.mapFeatures.nestInfo : null,
              }
            })()
          : null,
      },
    })
    this._statAcc = 0
  }

  /**
   * 每帧执行边界（Execution Boundary）：beforeUpdate 后按 Gameplay 的
   * usesArenaFramePipeline() 决定走向——Arena 默认管线（_updateArenaFrame）
   * 或由 Gameplay 完全接管（updateWorld）。之后统一 afterUpdate。
   */
  update(dt) {
    this.gameplay?.beforeUpdate(dt)
    if (this.gameplay?.usesArenaFramePipeline()) this._updateArenaFrame(dt)
    else this.gameplay?.updateWorld(dt)
    this.gameplay?.afterUpdate(dt)
  }

  /**
   * Arena 默认帧管线（update）：震屏计时 → 规则状态机 → 实体更新 →
   * 相机 → 环境氛围 → 换景淡化推进。原 update() 主体原样提取，顺序零改动。
   */
  _updateArenaFrame(dt) {
    if (this._shakeT > 0) this._shakeT -= dt // 屏幕震动计时衰减
    this._updateStrainSkill(dt) // 空格 角色技能：边沿触发 + 自身冷却（origin 短路）
    this._updateRunState(dt)
    if (this._pauseLock > 0 || this.runFinished) return
    if (this.runState !== 'stage-reward' && this.runState !== 'expedition-intro') {
      for (const e of this.entities) {
        if (e.active && !this.runFinished) e.update(dt)
        if (this._pauseLock > 0 || this.runFinished) break
      }
      this.bossArena.update(dt) // 决斗圈：圈心跟随与界外灼烧（在实体结算之后判定）
    }
    this._updateCamera(dt) // 相机跟随玩家（在实体更新之后）
    this._ambient.update(dt, this.camera, this.width, this.height, this._mapThemeId)
    // 换景交叉淡化推进（0.8s 缓入缓出）
    if (this._worldBgPrev) {
      this._themeFadeT += dt
      if (this._themeFadeT >= 0.8) this._worldBgPrev = null
    }
  }

  /**
   * 每帧执行边界（Execution Boundary）：DPR 变换与 beforeRender 后按
   * usesArenaFramePipeline() 决定走向——Arena 默认渲染管线（_renderArenaFrame）
   * 或由 Gameplay 完全接管（renderWorld）。之后统一 afterRender。
   */
  render() {
    const { ctx, width, height, dpr } = this
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0) // CSS 像素坐标系 + DPR 适配
    this.gameplay?.beforeRender(ctx)
    if (this.gameplay?.usesArenaFramePipeline()) this._renderArenaFrame(ctx)
    else this.gameplay?.renderWorld(ctx)
    this.gameplay?.afterRender(ctx)
  }

  /**
   * Arena 默认渲染管线：世界背景 → 时段色调与环境粒子 → 实体 → 前景装饰 →
   * 对白 → 暗角。原 render() 主体原样提取，绘制顺序零改动。
   */
  _renderArenaFrame(ctx) {
    const { width, height } = this

    // 屏幕震动（阶段十五美化）：随机抖动随剩余时间衰减
    let jx = 0
    let jy = 0
    if (this._shakeT > 0) {
      const k = this._shakeT / this._shakeDur
      jx = (Math.random() * 2 - 1) * this._shakeMag * k
      jy = (Math.random() * 2 - 1) * this._shakeMag * k
    }
    const camX = this.camera.x + jx
    const camY = this.camera.y + jy

    // 世界背景：离屏画布一次性绘制（渐变+网格+装饰），
    // 相机滚动时只花一次 drawImage，零逐帧绘制成本；
    // 运行中换景时与旧背景交叉淡化（缓入缓出），场景过渡不跳变
    if (this._worldBgPrev) {
      const k = Math.min(1, this._themeFadeT / 0.8)
      const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
      ctx.drawImage(this._worldBgPrev, -camX, -camY)
      ctx.globalAlpha = eased
      ctx.drawImage(this._worldBg, -camX, -camY)
      ctx.globalAlpha = 1
    } else {
      ctx.drawImage(this._worldBg, -camX, -camY)
    }

    // 时段色调（随波次渐入主题暮色）+ 环境粒子（萤火/孢子/余烬）：
    // 叠加在背景之上、实体之下，长局有「时间在流逝」的呼吸感
    const tint = this._ambient.tintFor(this._mapThemeId, this.enemyManager.wave)
    if (tint) {
      ctx.fillStyle = tint
      ctx.fillRect(0, 0, width, height)
    }
    ctx.save()
    ctx.translate(-camX, -camY)
    this._ambient.render(ctx)
    ctx.restore()

    // 实体渲染（世界坐标系，整体随相机平移）
    ctx.save()
    ctx.translate(-camX, -camY)
    this.bossArena.renderWorld(ctx) // 决斗圈圈环：压在敌人与预警层之下
    for (const e of this.entities) {
      if (!e.active || e === this.dialogue) continue
      // 玩家与敌人按脚点 y 合并排序绘制：站在敌人南侧盖住它，北侧被它盖住
      if (e === this.player && this.enemyManager) this.enemyManager.renderBodies(ctx, e)
      else e.render(ctx)
    }

    // 前景装饰：树冠/高草绘制在角色上方，形成遮挡景深（世界坐标系）
    const t = this.elapsed
    for (const item of this._fgDecor) {
      // 视口剔除：前景装饰在可见范围外直接跳过
      if (item.x < this.camera.x - 180 || item.x > this.camera.x + this.width + 180) continue
      if (item.y < this.camera.y - 180 || item.y > this.camera.y + this.height + 180) continue
      drawFgItem(ctx, item, t, this._mapThemeId, this.player, this.enemyManager.enemies)
    }
    // 对白保留世界坐标跟随，但置于前景装饰之上，避免树冠或旗帜遮住台词。
    if (this.dialogue.active) this.dialogue.render(ctx)
    ctx.restore()

    // 暗角（屏幕坐标系，视线始终聚焦屏幕中心）
    ctx.fillStyle = this._vignette
    ctx.globalAlpha = 0.5
    ctx.fillRect(0, 0, width, height)
    ctx.globalAlpha = 1

    this.bossArena.renderOverlay(ctx, width, height) // 决斗圈屏幕层：狂暴红闪 / 界外泛红 + 回圈箭头
  }

  // ------------------------------------------------------------
  // 相机：大世界滚动
  // ------------------------------------------------------------

  /** 相机平滑跟随玩家（含运动方向预判），并夹在世界边界内（视口不会露出世界外的空白） */
  _updateCamera(dt) {
    const cam = this.camera
    const player = this.player
    // 运动方向预判（阶段十三）：朝移动/冲刺方向提前 70px，走位时前方信息量更大
    const mv = player.input.getMoveVector()
    const lead = 70
    // 目标：玩家居中（+ 方向预判偏移）
    const tx = player.x + mv.x * lead - this.width / 2
    const ty = player.y + mv.y * lead - this.height / 2
    if (!this._camInit) {
      // 首帧直接定位（出生点/重开后的第一帧，不做平滑漂移）
      cam.x = tx
      cam.y = ty
      this._camInit = true
      return
    }
    // 平滑跟随：帧率无关的指数收敛（60fps 基准下等效每帧 10% 拉近）
    const k = 1 - Math.pow(1 - 0.1, dt * 60)
    cam.x += (tx - cam.x) * k
    cam.y += (ty - cam.y) * k
    // 世界边界夹取（世界小于视口时 clamp 区间为 0，静止在原点）
    const maxX = Math.max(0, this.worldWidth - this.width)
    const maxY = Math.max(0, this.worldHeight - this.height)
    cam.x = cam.x < 0 ? 0 : cam.x > maxX ? maxX : cam.x
    cam.y = cam.y < 0 ? 0 : cam.y > maxY ? maxY : cam.y
  }

  // ------------------------------------------------------------
  // 适配与暂停
  // ------------------------------------------------------------

  _onResize() {
    const rect = this.canvas.getBoundingClientRect()
    this.dpr = Math.min(window.devicePixelRatio || 1, 2) // 上限 2，避免高 DPI 过度渲染
    this.width = Math.max(1, rect.width)
    this.height = Math.max(1, rect.height)
    this.canvas.width = Math.round(this.width * this.dpr)
    this.canvas.height = Math.round(this.height * this.dpr)

    // 世界尺寸：至少比视口大 1.5 倍（保证滚动空间），下限 2400×1800
    const ww = Math.round(Math.max(2400, this.width * 1.5))
    const wh = Math.round(Math.max(1800, this.height * 1.5))
    if (ww !== this.worldWidth || wh !== this.worldHeight) {
      this.worldWidth = ww
      this.worldHeight = wh
      this._scheduleWorldBg()
    }

    // 暗角（屏幕坐标系，跟随视口）
    const ctx = this.ctx
    const cx = this.width / 2
    const cy = this.height / 2
    const maxR = Math.hypot(cx, cy)
    const v = (this._vignette = ctx.createRadialGradient(cx, cy, maxR * 0.35, cx, cy, maxR))
    v.addColorStop(0, 'rgba(0, 0, 0, 0)')
    v.addColorStop(1, 'rgba(0, 0, 0, 0.4)')

    // 视口尺寸变化后相机重新夹取
    this._camInit = false
  }

  /**
   * 世界背景重建调度：resize 期间事件高频连发（拖动窗口/移动端收放地址栏），
   * 每次都重建 2400×1800 离屏画布（约 17MB）会造成内存峰值与掉帧——
   * 合并为停止变化 150ms 后的一次重建；首帧（尚无背景）保持同步，
   * 保证构造后立即可渲染（无头测试也依赖同步构建）。
   */
  _scheduleWorldBg() {
    if (!this._worldBg) {
      this._buildWorldBg()
      return
    }
    clearTimeout(this._worldBgTimer)
    this._worldBgTimer = setTimeout(() => {
      this._worldBgTimer = 0
      this._buildWorldBg()
    }, 150)
  }

  /** 切换地图主题；远征关间处于暂停态，可同步烘焙而不影响战斗帧。 */
  _setMapTheme(themeId, variant, immediate = false, force = false) {
    const nextTheme = getMapTheme(themeId).id
    const nextVariant = variant || `${nextTheme}-default`
    if (!force && nextTheme === this._mapThemeId && nextVariant === this._mapVariant && this._worldBg) return false
    const changed = nextTheme !== this._mapThemeId || nextVariant !== this._mapVariant
    // 运行中换景（已有烘焙背景）：新背景构建完成后做交叉淡化，避免画面瞬间跳变
    if (this._worldBg && !force) this._bgFadePending = true
    this._mapThemeId = nextTheme
    this._mapVariant = nextVariant
    this.mapFeatures.configure(nextTheme, nextVariant, this._mapSeed)
    if (changed && !force) this.sound.mapShift?.(nextTheme)
    if (immediate && this.worldWidth > 0 && this.worldHeight > 0) {
      clearTimeout(this._worldBgTimer)
      this._worldBgTimer = 0
      this._buildWorldBg()
    } else {
      this._scheduleWorldBg()
    }
    return true
  }

  /**
   * 世界背景：固定种子的主题地面、主地标与成组装饰一次性烘焙。
   * 相机滚动时每帧只 drawImage 一次，零逐帧绘制成本；
   * 仅在换章、重开或世界尺寸变化（resize）时重建。
   */
  _buildWorldBg() {
    const w = this.worldWidth
    const h = this.worldHeight
    // 运行中换景：旧背景留存作交叉淡化源（resize 重建不置位 _bgFadePending，无淡化）
    if (this._bgFadePending && this._worldBg) {
      this._worldBgPrev = this._worldBg
      this._themeFadeT = 0
    }
    this._bgFadePending = false
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')

    const woodland = isFrontierScenery(this._mapThemeId, this._mapVariant)

    if (woodland) {
      paintFrontierGround(ctx, w, h, this._mapSeed)
    } else {
      paintChapterGround(ctx, w, h, this._mapSeed, this._mapThemeId, this._mapVariant)
    }

    // 地图装饰：背景层（草丛/花/石/菇/水洼/树干）直接烙进离屏画布；
    // 前景层（树冠/高草）存列表，由 render 每帧绘制
    const { bg, fg } = generateDecor(w, h, {
      themeId: this._mapThemeId,
      variant: this._mapVariant,
      seed: this._mapSeed,
      spawn: this._mapSpawn,
    })
    this._fgDecor = fg
    prepareFrontierSprites(fg, this.dpr)
    prepareChapterSprites(fg, this.dpr)
    this._ambient?.setHabitats(woodland ? bg : [])
    for (const item of bg) drawBgItem(ctx, item, this._mapThemeId)

    this._worldBg = c
  }

  /** 屏幕震动（阶段十五美化）：受击/Boss 登场阵亡/爆炸等打击感反馈 */
  shakeScreen(mag = 4, dur = 0.2) {
    this._shakeMag = mag
    this._shakeDur = dur
    this._shakeT = dur
  }

  /** 页面隐藏时暂停循环与 BGM；仅恢复隐藏前确实在运行且没有暂停锁的局。 */
  _onVisibility() {
    if (document.hidden) {
      if (this.running) {
        this._resumeOnVisible = true
        this.sound.pauseMusic()
        this.stop()
      }
      return
    }

    const shouldResume = this._resumeOnVisible
    this._resumeOnVisible = false
    if (shouldResume && this._pauseLock === 0) this.start()
  }
}
