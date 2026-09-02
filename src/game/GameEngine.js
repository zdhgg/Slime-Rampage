import { InputManager } from './InputManager.js'
import { Player, STARTING_EXP_THRESHOLD } from './entities/Player.js'
import { EnemyManager } from './EnemyManager.js'
import { WeaponSystem } from './WeaponSystem.js'
import { GemManager } from './GemManager.js'
import { SoundManager } from './SoundManager.js'
import { rollSkills, SPEC_INFO } from './SkillPool.js'
import { applyGenes } from './GenePool.js'
import { buildSpecies } from './Species.js'
import { REACTIONS, getElement, getActiveReactions } from './ElementSystem.js'
import { generateDecor, drawBgItem, drawFgItem, getMapTheme } from './MapDecor.js'
import { WorldEventManager } from './WorldEventManager.js'
import { MapFeatureManager } from './MapFeatureManager.js'
import { DialogueManager } from './DialogueManager.js'
import { createGameplay, normalizeGameplayId } from './gameplay/GameplayFactory.js'
import { AmbientLayer } from './effects/AmbientLayer.js'
import { STRAIN_IDS, applyStrain } from './Strains.js'
import {
  EXPEDITION_REWARDS,
  EVENT_LOCK_AT,
  FINAL_WARNING_AT,
  RUN_DURATION,
  calculateMaterialReward,
  getEndlessDisasterTier,
  getExpeditionBoss,
  getExpeditionStage,
  getExpeditionStages,
  getProgressionStage,
  getRunProfile,
  normalizeRunSelection,
  sumDrops,
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
    dashCd: 0,
    dashMax: 1.2,
    devourThreshold: 0.25,
    boss: null,
    director: null,
    objective: null,
    eventsCompleted: 0,
    loot: 0,
    elements: [],
    reactions: [],
    primaryReaction: null,
    secondaryCount: 0,
    secondarySlots: 2,
    primarySpec: null,
    secondarySpec: null,
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
      lootMultiplier: 1,
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
    this.primarySpec = null // 主专精（'gluttony' | 'gatling' | 'elemental' | 'assassin'）
    this.secondarySpec = null // 副专精
    this.startingStrain = 'origin' // 开局血统预选（先天属性，reset 末尾叠加应用）
    this.strainDevourBonus = 0 // 贪噬血统：吞噬线整体加宽（pct）
    this.devourThreshold = 0.25 // 吞噬生命百分比阈值（暴食流放宽）

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

  get endlessLootMultiplier() {
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
    this._pauseLock = Math.max(0, this._pauseLock - 1)
    if (this._pauseLock > 0) return
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
    this.openFreeSkillPanel()
  }

  /**
   * 技能选择面板（升级 / 王级秘籍共用）：
   * 暂停主循环 → 抽取 3 个流派/通用技能 → onLevelUp 回调 → 选择后应用
   */
  openFreeSkillPanel() {
    this.pause()
    const options = rollSkills(this, 3)
    if (options.length === 0) {
      this._pauseLock = Math.max(0, this._pauseLock - 1)
      this.start()
      // 技能池耗尽不再静默：全部满级后的升级转化为一次治愈——
      // 后期升级仍有正反馈，而不是"什么都没发生"
      this.player.heal(1)
      this.enemyManager?.addText?.(this.player.x, this.player.y - 42, '🧬 基因已臻完美', null, '#ffd166', 16)
      return
    }
    this.sound.levelUp()
    this._pushStats()
    this.onLevelUp?.(options)
  }

  /** 应用技能（支持里程碑专精觉醒与常规技能） */
  applySkill(skill) {
    if (!skill) return

    // 1. 处理里程碑专精觉醒（Lv.5 主专精 / Lv.9 副专精）
    if (skill.isMilestone) {
      const info = SPEC_INFO[skill.spec]
      if (skill.milestoneType === 'primary') {
        this.primarySpec = skill.spec
        this._applyPrimarySpecBonus(skill.spec)
        this.enemyManager?.addText?.(this.player.x, this.player.y - 20, `👑 主专精确立：${info?.name || skill.spec}`, null, info?.color || '#ffd166', 16)
        this.sound.wave()
      } else if (skill.milestoneType === 'secondary') {
        this.secondarySpec = skill.spec
        this.enemyManager?.addText?.(this.player.x, this.player.y - 20, `🥈 副专精确立：${info?.name || skill.spec}`, null, info?.color || '#74b9ff', 16)
      }
    } else {
      // 2. 常规技能与自由探索技能应用
      this.skillLevels[skill.id] = (this.skillLevels[skill.id] || 0) + 1
      skill.apply?.(this, this.skillLevels[skill.id])
    }

    const weaponEvolved = this.weaponSystem.registerSkillEvolution(skill)
    if (weaponEvolved && skill.isCapstone) {
      const info = SPEC_INFO[skill.spec]
      this.evolutionEvent(
        `武器进化：${info?.name || skill.spec}`,
        skill.name.replace(/^🌟\s*/, ''),
        skill.spec,
        '弹体轮廓、出膛反馈与命中音色完成终极异化'
      )
    }

    if (this._pendingExpeditionStage > 0) {
      const nextStage = this._pendingExpeditionStage
      this._pendingExpeditionStage = 0
      this._enterExpeditionStage(nextStage)
    }
    this.resume()
  }

  /** 主专精初始觉醒赋能（Lv.5 里程碑与开局预选共用同一套数值） */
  _applyPrimarySpecBonus(spec) {
    if (spec === 'gluttony') {
      this.devourThreshold = Math.max(this.devourThreshold, 0.28)
      this.player.maxHp += 1
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1)
    } else if (spec === 'gatling') {
      this.weaponSystem.projectileCount += 1
      this.weaponSystem.fireInterval *= 0.85
    } else if (spec === 'elemental') {
      this.weaponSystem.freezeChance += 0.2
      this.weaponSystem.burnChance += 0.2
      this.weaponSystem.poisonChance += 0.2
      this.weaponSystem.reactionDmgMul = (this.weaponSystem.reactionDmgMul || 1) * 1.35
    } else if (spec === 'assassin') {
      this.weaponSystem.critChance = Math.max(this.weaponSystem.critChance || 0, 0.25)
      this.weaponSystem.critMul = Math.max(this.weaponSystem.critMul || 3.0, 3.5)
    }
  }

  /** 开局血统预选：先天属性每局 reset 末尾（基因/难度之后）叠加应用 */
  applyStartingStrain(id) {
    this.startingStrain = STRAIN_IDS.includes(id) ? id : 'origin'
    applyStrain(this, this.startingStrain)
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

  _rawEndlessDrops() {
    return sumDrops(this.weaponSystem?.drops)
  }

  _offerEndlessCheckpoint(wave) {
    this._endlessDecisionKind = 'checkpoint'
    this._endlessChoices = []
    const rawDrops = this._rawEndlessDrops()
    const nextBonus = getEndlessRewardBonus(this.endlessCalamities, this.endlessContinues + 1)
    this.onEndlessDecision?.({
      kind: 'checkpoint',
      wave,
      rawDrops,
      safeLoot: calculateMaterialReward(rawDrops, this.runSelection, {
        result: 'extracted',
        endlessRewardBonus: this.endlessRewardBonus,
      }),
      defeatLoot: calculateMaterialReward(rawDrops, this.runSelection, {
        result: 'defeat',
        endlessRewardBonus: this.endlessRewardBonus,
      }),
      currentLootMultiplier: this.endlessLootMultiplier,
      nextLootMultiplier: this.runProfile.rewardMul * (1 + nextBonus),
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
      currentLootMultiplier: this.endlessLootMultiplier,
      choices: this._endlessChoices.map((choice) => ({
        ...choice,
        lootMultiplier:
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
      lootMultiplier: this.endlessLootMultiplier,
      lootRetention:
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
      drops: { ...this.weaponSystem.drops }, // 本局勇者掉落物（黑市货币；副本快照，防死亡帧残差结算污染）
      behavior: this.weaponSystem.stats, // 代表行为（连锁/引爆，物种档案）
      species: buildSpecies(this.player, this.genes, this.enemyManager.wave, this.weaponSystem.kills, this.weaponSystem.stats), // 物种档案（评审：可截图的传播点）
      epilogue: this.dialogue.epilogue,
    }
  }

  finishRun(result, defeatReason = null) {
    if (this.runFinished) return
    this.runFinished = true
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
    this.player._dashT = 0
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
      // 残敌溃散演出（0.6s）：演出结束后才暂停进补给——清除不再「瞬间发生」
      this._stageClearT += dt
      if (this._stageClearT < 0.6) return
      this.runState = 'stage-reward'
      this.enemyManager.prepareExpeditionStage()
      this.worldEvents.cancelForTransition()
      this.pause()
      this.onExpeditionReward?.({
        stage: this.expeditionStage,
        nextStage: this.expeditionStage + 1,
        totalStages: getExpeditionStages(this.runSelection.difficulty).length,
        stageTitle: getExpeditionStage(this.runSelection.difficulty, this.expeditionStage).title,
        nextTitle: getExpeditionStage(this.runSelection.difficulty, this.expeditionStage + 1).title,
        nextRegion: getExpeditionStage(this.runSelection.difficulty, this.expeditionStage + 1).region,
        rewards: EXPEDITION_REWARDS,
      })
      return
    }
    if (this.runState !== 'active') return
    this.expeditionStageElapsed += dt
    const progress = this._expeditionProgress()
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

  resolveExpeditionReward(rewardId) {
    if (this.runState !== 'stage-reward') return
    const nextStage = this.expeditionStage + 1
    if (rewardId === 'rest') {
      this.player.heal(this.player.maxHp)
    } else if (rewardId === 'blood') {
      this.player.maxHp = Math.max(1, this.player.maxHp - 1)
      this.player.hp = Math.min(this.player.hp, this.player.maxHp)
      this.weaponSystem.damage *= 1.2
    } else if (rewardId === 'tome') {
      const options = rollSkills(this, 3)
      if (options.length > 0) {
        this._pendingExpeditionStage = nextStage
        this.sound.levelUp()
        this._pushStats()
        this.onLevelUp?.(options)
        return
      }
    }
    this._enterExpeditionStage(nextStage)
    this.resume()
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
   * 两者都是不可逆的「永久改变身体」时刻，值得一次确认；其余核心按 E 后直接吸收。
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
        return { icon: oe?.icon || '?', name: oe?.name || '', species: r.species }
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
    p.dashCd = 0 // 冲刺冷却/状态清零（阶段十三）
    p._dashT = 0
    p._blink = 0 // 视觉状态清零（阶段十五美化）
    p._blinkT = 2 + Math.random() * 2.5
    p._aura.length = 0
    this.primarySpec = null
    this.secondarySpec = null
    this.devourThreshold = 0.25
    this.skillLevels = {}
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

  /** 推送一次冷却数据（冲刺 / Boss 施法 / 破阵追击），约 10Hz */
  _pushCooldown() {
    this.onCooldown?.({
      dashCd: this.player.dashCd,
      dashMax: 1.2 * (this.player.dashCdMultiplier || 1) * (this.player.geneDashCdMultiplier || 1),
      cast: this.enemyManager.bossInfo?.castProgress || 0,
      formationBreak: this.endlessFormationBreakTimer,
      formationBreakMax: ENDLESS_FORMATION_BREAK_DURATION,
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
          this.weaponSystem.damage * this.weaponSystem.levelMul * this.weaponSystem.devourDamageMul * 100
        ) / 100,
      wave: this.enemyManager.wave,
      waveName: this.enemyManager.waveName,
      level: this.player.level,
      exp: this.player.exp,
      maxExp: this.player.maxExp,
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      dashCd: this.player.dashCd,
      dashMax: 1.2 * (this.player.dashCdMultiplier || 1) * (this.player.geneDashCdMultiplier || 1),
      devourThreshold: this.devourThreshold,
      boss: this.enemyManager.bossInfo,
      director: this.enemyManager.directorInfo,
      objective: this.worldEvents.objectiveInfo,
      eventsCompleted: this.worldEvents.completed,
      loot: Object.values(this.weaponSystem.drops).reduce((sum, n) => sum + n, 0),
      elements: Array.from(this.player.elements, ([id, lv]) => ({ id, lv })), // 元素等级（HUD 显示 💧2）
      // 激活反应（阶段十五：HUD 常驻徽章 + 效果说明，进化「有什么效果」一眼可读）
      reactions: this.player._reactions.map((r) => ({ id: r.id, name: r.name, desc: r.desc })),
      primaryReaction: this.player._primaryReaction, // 主形态（★ 徽章标识）
      secondaryCount: this.player._secondaryIds.size, // 副反应占用（阶段十六）
      secondarySlots: this.player.secondarySlots,
      primarySpec: this.primarySpec,
      secondarySpec: this.secondarySpec,
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
        lootMultiplier: this.endlessLootMultiplier,
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
    this._updateRunState(dt)
    if (this.runState !== 'stage-reward' && this.runState !== 'expedition-intro') {
      for (const e of this.entities) {
        if (e.active && !this.runFinished) e.update(dt)
      }
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
    for (const e of this.entities) {
      if (e.active && e !== this.dialogue) e.render(ctx)
    }

    // 前景装饰：树冠/高草绘制在角色上方，形成遮挡景深（世界坐标系）
    const t = this.elapsed
    for (const item of this._fgDecor) {
      // 视口剔除：前景装饰在可见范围外直接跳过
      if (item.x < this.camera.x - 80 || item.x > this.camera.x + this.width + 80) continue
      if (item.y < this.camera.y - 80 || item.y > this.camera.y + this.height + 80) continue
      drawFgItem(ctx, item, t, this._mapThemeId)
    }
    // 对白保留世界坐标跟随，但置于前景装饰之上，避免树冠或旗帜遮住台词。
    if (this.dialogue.active) this.dialogue.render(ctx)
    ctx.restore()

    // 暗角（屏幕坐标系，视线始终聚焦屏幕中心）
    ctx.fillStyle = this._vignette
    ctx.fillRect(0, 0, width, height)
  }

  // ------------------------------------------------------------
  // 相机：大世界滚动
  // ------------------------------------------------------------

  /** 相机平滑跟随玩家（含运动方向预判），并夹在世界边界内（视口不会露出世界外的空白） */
  _updateCamera(dt) {
    const cam = this.camera
    const player = this.player
    // 运动方向预判（阶段十三）：朝移动/冲刺方向提前 70px，走位时前方信息量更大
    const mv = player._dashT > 0 ? player._dashDir : player.input.getMoveVector()
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
   * 世界背景：一次性渲染到离屏画布（渐变 + 网格 + 随机装饰点）。
   * 相机滚动时每帧只 drawImage 一次，零逐帧绘制成本；
   * 只在世界尺寸变化（resize）时重建。
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

    const theme = getMapTheme(this._mapThemeId)

    // 主题底色只在离屏背景创建时解析，战斗热路径不分支。
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, theme.ground[0])
    g.addColorStop(1, theme.ground[1])
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)

    // 极微弱网格（64px，辅助空间感知，低对比度不抢视线）
    ctx.strokeStyle = theme.grid
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 64; x < w; x += 64) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
    }
    for (let y = 64; y < h; y += 64) {
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
    }
    ctx.stroke()

    // 极淡土壤微粒（降低数量与透明度，减少视觉噪点）
    for (let i = 0; i < 100; i++) {
      ctx.fillStyle = theme.speck
      ctx.beginPath()
      ctx.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 1.5, 0, Math.PI * 2)
      ctx.fill()
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
