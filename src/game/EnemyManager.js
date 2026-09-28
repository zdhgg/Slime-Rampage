import { Entity } from './core/Entity.js'
import { Enemy } from './entities/Enemy.js'
import { EnemyBullet } from './entities/EnemyBullet.js'
import { Boss } from './entities/Boss.js'
import { ExpeditionBoss } from './entities/ExpeditionBoss.js'
import { FloatingText } from './effects/FloatingText.js'
import { AssetManager } from './AssetManager.js'
import {
  applyEnemyBias,
  getBossWavePlan,
  getExpeditionBossHpMultiplier,
  getStageEnemyBias,
  getWaveModifiers,
} from './RunRules.js'

const TAU = Math.PI * 2

const MAX_ENEMIES = 300 // 性能护栏：场上敌人数量上限（防无限增长卡死）
const SPAWN_MARGIN = 24 // 生成点偏移：视口边缘外侧，营造「涌入」感
export const CELL_SIZE = 64 // 空间哈希网格单元尺寸（≥ 2×最大碰撞半径和，供分离与飞弹碰撞共用）
export const GRID_KEY_SCALE = 100000 // cell 坐标 → Map 唯一数字 key 的缩放系数
const WAVE_DURATION = 30 // 每波持续时间（秒）：远征外用于时间驱动的压力推进
const BOSS_RECOVERY_DURATION = 4
const CLEAR_RATE_WINDOW = 3
/**
 * 章节首领登场前的收口（远征节奏）：
 * 目标进度越过 75% 后逐步拉长增援间隔，进入 100% 时达到最大收口倍率。
 * 目的不是清场（那会破坏割草密度与吞噬续航），而是让首领登场的瞬间
 * 不再是「叠着一波满编杂兵」，玩家有干净的读招空间。
 */
const EXPEDITION_WIND_DOWN_AT = 0.75
const EXPEDITION_WIND_DOWN_MUL = 0.9

/**
 * 早期元素入口（第二批）：第 2 波保底放出一只精英。
 *
 * 背景：元素核心的唯一来源是精英/Boss，而精英从「有效波次 ≥ 3」才开始出现
 * （见 spawn 的 baseEliteChance 判定），导致前 60 秒全场无元素可用——
 * 实测各角色首颗核心落在 66~146 秒。把一个精英提前到第 2 波开始（约 30 秒），
 * 玩家在 35~45 秒即可拿到第一颗核心。
 *
 * 边界（刻意收窄，不影响后续曲线）：
 *  - 每局至多一次（_earlyEliteDone 闸门）；
 *  - 走 spawnAt 常规路径：共用波次成长公式与场上上限；只把这一只的体量除以
 *    EARLY_ELITE_HP_DIVISOR（否则第 2 波打不动，见下），不新增任何掉落或资源；
 *  - 不修改 baseEliteChance 与任何掉率——第 3 波以后整体精英率与核心掉率不变；
 *  - 远征模式按章重置波次，同样每章至多一次，与既有章节节奏一致。
 */
const EARLY_ELEMENT_WAVE = 2
/** 第 2 波保底精英的登场距离（px）：在视野内、但必须走过来——给玩家看清并迎战的余地 */
const EARLY_ELITE_DISTANCE = 480
/**
 * 保底精英不享受 3× 精英体量。
 *
 * 实测依据：第 2 波玩家裸 DPS 约 1.0~1.3（1 发/秒 × 1 伤害），而 3× 骑士精英
 * 有 10~14 HP → 需要 8~14 秒纯输出；加上接近与走位，首颗核心实测落在 59~87 秒，
 * 保底形同虚设。改为「标准体量 + 主动追击」后，击杀缩到 5~9 秒，
 * 稳定落在 35~45 秒窗口。掉率完全不变（精英掉落规则照旧），只改这一只的体量。
 */
const EARLY_ELITE_HP_DIVISOR = 3
/** 保底精英主动加速逼近，把「遇见」变成「必然交战」 */
const EARLY_ELITE_SPEED_MUL = 1.4

/** 波次叙事表：开局是勇者刷史莱姆，后期是整个世界在阻止史莱姆（评审：反转感） */
const WAVE_NAMES = {
  1: '新手村勇者实习团',
  2: '见习骑士小队',
  3: '冒险者公会 · 异常通报',
  4: '王国讨伐预备队',
  5: '王国讨伐令',
  8: 'A级勇者小队',
  10: '皇家法师团',
  12: '圣骑士团',
  15: '传说中的勇者',
  20: '？？？（世界级灾害确认）',
}

/** 命名波次对应真实敌军编成；取不高于当前波次的最近一档。
 *  非人敌族登场节奏：战獒第 3 波参战、魔像第 8 波列阵、怨灵第 12 波苏醒。 */
const WAVE_ROSTERS = [
  { min: 1, units: [['knight', 1]] },
  { min: 3, units: [['knight', 0.45], ['mage', 0.28], ['hound', 0.27]] },
  { min: 4, units: [['knight', 0.34], ['mage', 0.16], ['assassin', 0.3], ['hound', 0.2]] },
  { min: 5, units: [['knight', 0.34], ['mage', 0.14], ['archer', 0.2], ['assassin', 0.14], ['hound', 0.18]] },
  { min: 6, units: [['knight', 0.3], ['berserker', 0.28], ['assassin', 0.22], ['hound', 0.2]] },
  { min: 7, units: [['knight', 0.28], ['berserker', 0.2], ['priest', 0.18], ['mage', 0.16], ['hound', 0.18]] },
  { min: 8, units: [['knight', 0.2], ['mage', 0.13], ['archer', 0.15], ['assassin', 0.15], ['berserker', 0.12], ['priest', 0.09], ['golem', 0.08], ['hound', 0.08]] },
  { min: 10, units: [['mage', 0.34], ['priest', 0.16], ['knight', 0.18], ['assassin', 0.13], ['golem', 0.1], ['hound', 0.09]] },
  { min: 12, units: [['knight', 0.3], ['priest', 0.22], ['berserker', 0.18], ['archer', 0.08], ['golem', 0.1], ['wraith', 0.12]] },
  { min: 15, units: [['assassin', 0.22], ['archer', 0.19], ['berserker', 0.19], ['priest', 0.11], ['mage', 0.08], ['wraith', 0.13], ['golem', 0.08]] },
  { min: 20, units: [['knight', 0.12], ['mage', 0.14], ['archer', 0.13], ['assassin', 0.16], ['berserker', 0.13], ['priest', 0.1], ['golem', 0.1], ['wraith', 0.12]] },
]

const rand = (min, max) => min + Math.random() * (max - min)

/** 精英词缀池（阶段十三）：精英怪额外获得一种行为词缀 */
const AFFIXES = ['swift', 'shielded', 'explosive', 'summoner']

/**
 * 敌人管理器（自身也是 Entity，由引擎统一驱动 update/render）
 *
 * 生成算法：
 *  - 随机间隔 0.4~1.0 秒生成 1 个（即每秒 1~2.5 个），每波 -8% 且下限 0.2s；
 *  - 随机选相机视口四边之一，坐标落在对应边缘外侧 SPAWN_MARGIN 处，
 *    并夹回世界边界内。
 *
 * 群集分离（防敌人重叠成一个点）：
 *  - 每帧把敌人按坐标散列进网格（空间哈希），分离时只检查相邻 3×3 个网格
 *    中的邻居，把 O(n²) 的全量两两比较降为近 O(n)——这是「数百敌人」
 *    仍能保持 60FPS 的关键；
 *  - 重叠对各推一半距离（Separation Steering 的轻量版），形成互相让位的
 *    「怪海」效果。
 */
export class EnemyManager extends Entity {
  constructor() {
    super()
    this._enemies = []
    this._bullets = [] // 敌人弹幕（法师火球/弓手箭矢）
    this._spawnTimer = 0
    this._grid = new Map() // 空间哈希表：cell key → 敌人数组（每帧 clear 复用，不新建对象）
    this.wave = 1 // 当前波次（阶段六：随时间推进，属性递增）
    this._waveTimer = 0
    this._boss = null // 当前主目标（兼容旧索敌/测试入口）
    this._bosses = [] // 活跃首领编队，最多三名
    this._bossCaster = null // 当前持有大型技能施放权的首领
    this._bossEncounter = null // 终局增援队列与编队元数据
    this._bossGroupSeq = 0
    this._bossGrace = 0 // Boss 登场后的短暂清晰读招窗口
    this._bossRecovery = 0 // Boss 阵亡后的喘息窗口
    this._directorPhase = '集结'
    this._directorIntensity = 0.75
    this._clearSampleTime = 0
    this._clearSampleKills = 0
    this._clearSampleReady = false
    this._clearRate = 0
    this._devouring = [] // 正在被吸入的敌人（溶解动画）
    this._routing = [] // 过关溃散中的残敌（原地震散动画，非吞噬）
    this._texts = [] // 浮动提示文本（吞噬等）
    this._finale = false
    this._earlyEliteDone = false
  }

  /** 当前活跃敌人数量（HUD 显示用） */
  get count() {
    return this._enemies.length
  }

  /** 当前是否有 Boss 存活 */
  get hasBoss() {
    return this.activeBossCount > 0
  }

  get activeBossCount() {
    let count = 0
    for (const boss of this._bosses) if (boss.active) count++
    return count || (this._boss?.active ? 1 : 0)
  }

  get pendingBossCount() {
    return this._bossEncounter?.pending?.length || 0
  }

  get bossInfo() {
    let active = this._bosses.filter((boss) => boss.active)
    if (active.length === 0 && this._boss?.active) active = [this._boss]
    if (active.length === 0) return null
    const b = this._bossCaster?.active ? this._bossCaster : active[0]
    const combat = b.combatInfo || {}
    const totalHp = active.reduce((sum, boss) => sum + Math.max(0, boss.hp), 0)
    const totalMaxHp = active.reduce((sum, boss) => sum + boss.maxHp, 0)
    const groupTotal = Math.max(active.length, this._bossEncounter?.total || 0)
    const formation = this._bossFormationInfo(active)
    return {
      name: groupTotal > 1 ? this._bossEncounter?.label || `王级编队 · ${groupTotal}` : b.name,
      activeName: b.name,
      hp: totalHp,
      maxHp: totalMaxHp,
      enraged: active.some((boss) => boss.enraged),
      phase: combat.phase || 1,
      phaseName: combat.phaseName || '王级交锋',
      state: combat.state || '追猎',
      special: combat.special || '',
      castProgress: combat.castProgress || 0,
      vulnerable: !!combat.vulnerable,
      count: active.length,
      total: groupTotal,
      pending: this.pendingBossCount,
      formation,
      members: active.map((boss) => ({
        id: boss.bossMemberId || boss.name,
        name: boss.name,
        hp: Math.max(0, boss.hp),
        maxHp: boss.maxHp,
        enraged: !!boss.enraged,
        casting: boss === this._bossCaster,
        protected: formation?.id === 'royal_guard' && formation.captainId === boss.bossMemberId && formation.active,
      })),
    }
  }

  get directorInfo() {
    return {
      phase: this._directorPhase,
      intensity: this._directorIntensity,
      clearRate: this._clearRate,
    }
  }

  /** 当前波次名称（叙事化：取 ≤ 当前波次最近的命名节点） */
  get waveName() {
    let name = WAVE_NAMES[1]
    for (const k of Object.keys(WAVE_NAMES)) {
      if (this.wave >= Number(k)) name = WAVE_NAMES[k]
    }
    return name
  }

  /** 添加浮动提示文本（伤害数字 / 吞噬反馈），带数量上限防风暴 */
  addText(x, y, main, sub, subColor, fontSize) {
    if (this._texts.length >= 80) this._texts.shift() // 上限保护：丢弃最旧
    this._texts.push(new FloatingText(x, y, main, sub, subColor, fontSize))
  }

  /** 活跃敌人数组（只读用途：武器系统的索敌与碰撞遍历） */
  get enemies() {
    return this._enemies
  }

  /** 空间哈希网格（分离阶段每帧重建）：供武器系统飞弹碰撞粗筛复用，避免维护第二套网格 */
  get grid() {
    return this._grid
  }

  /** 重置波次、敌人与弹幕（游戏重开时由引擎调用） */
  reset() {
    this._enemies.length = 0
    this._bullets.length = 0
    this._spawnTimer = 0
    this.wave = 1
    this._waveTimer = 0
    this._boss = null
    this._bosses.length = 0
    this._bossCaster = null
    this._bossEncounter = null
    this._bossGroupSeq = 0
    this._bossGrace = 0
    this._bossRecovery = 0
    this._directorPhase = '集结'
    this._directorIntensity = 0.75
    this._clearSampleTime = 0
    this._clearSampleKills = 0
    this._clearSampleReady = false
    this._clearRate = 0
    this._devouring.length = 0
    this._routing.length = 0
    this._texts.length = 0
    this._finale = false
    this._earlyEliteDone = false
    this._stagePressure = 0 // 章节进度（引擎推送）：重开归零
  }

  /**
   * 章节进度（0~1，由引擎按远征目标推进推送）：驱动首领登场前的增援收口。
   * 非远征模式应传 0，保持原有导演节拍不变。
   */
  setStagePressure(ratio) {
    this._stagePressure = Math.max(0, Math.min(1, Number(ratio) || 0))
  }

  attach(game) {
    super.attach(game)
    this._spawnTimer = this._nextInterval()
  }

  /** 远征只按关卡推进强度，避免同一关停留更久时再叠加计时波次成长。 */
  _effectiveWave() {
    if (this.game?.runSelection?.mode !== 'expedition') return this.wave
    const stage = Math.max(1, this.game.expeditionStage || 1)
    return 1 + Math.round((stage - 1) * 1.6)
  }

  _populationTarget() {
    return Math.min(120, 16 + this._effectiveWave() * 7)
  }

  /** 下一次生成的随机等待时间：基础曲线叠加导演节拍与场上压力护栏。 */
  _nextInterval() {
    const effectiveWave = this._effectiveWave()
    const introMul = effectiveWave === 1 ? 1.35 : effectiveWave === 2 ? 1.15 : 1
    const pressure =
      (this.game?.runProfile?.spawnPressureMul || 1) *
      (this.game?.endlessModifiers?.spawnPressureMul || 1)
    const interval =
      (rand(0.4, 1.0) * introMul * Math.pow(0.92, effectiveWave - 1) * this._directorFactor()) /
      pressure
    // 高难度的刷怪倍率在后期仍然有效，而不是所有档位一起撞上 0.2 秒硬下限。
    return Math.max(0.2 / Math.max(0.75, pressure), interval)
  }

  _combatModifiers() {
    const profile = this.game?.runProfile || {}
    const stage =
      this.game?.runSelection?.mode === 'expedition' ? this.game.expeditionStage || 1 : 0
    const wave = getWaveModifiers(this.game?.runSelection, this.wave, stage)
    const endless = this.game?.endlessModifiers || {}
    wave.enemyHpMul *= endless.enemyHpMul || 1
    wave.bossHpMul *= endless.bossHpMul || 1
    wave.attackTempoMul *= endless.attackTempoMul || 1
    wave.eliteChanceBonus += endless.eliteChanceBonus || 0
    wave.eliteChanceCapBonus = endless.eliteChanceBonus || 0
    wave.bossPatternBonus += endless.bossPatternBonus || 0
    return { profile, wave }
  }

  /** 决策闸门放行后才真正开始新波，确保首领不会生成在选择面板背后。 */
  beginWave(wave = this.wave) {
    const bossPlan = getBossWavePlan(
      this.game?.runSelection,
      wave,
      this.game?.endlessModifiers?.bossExtraMembers || 0
    )
    if (bossPlan) {
      this._bossGrace = 4
      this._spawnTimer = Math.max(this._spawnTimer, this._nextInterval())
      this.spawnBossGroup(bossPlan)
    }
    // 早期元素入口：第 2 波保底一只精英（每局至多一次），让第一颗元素核心
    // 在 35~45 秒就能到手，而不是等第 3 波之后。
    // 第三批角色化：它只服务「能使用元素」的角色（elemental / origin）——
    // 暴食/弹射/暗影不使用元素，为它们多刷一只精英属于纯粹的难度上浮。
    // 刻意用 spawnAt 在玩家近处「点名登场」：定时生成是视口边缘随机落点
    // （420~620px 外），玩家很容易整波都没遇到它，保底就失去意义。
    // spawnAt 与 spawn 共用同一套波次成长公式与场上上限。
    if (
      wave >= EARLY_ELEMENT_WAVE &&
      !this._earlyEliteDone &&
      !this._finale &&
      this.game?.canUseElements !== false
    ) {
      this._earlyEliteDone = true
      this._spawnEarlyElementElite()
    }
    if (WAVE_NAMES[wave]) this.game.onWaveChanged?.(wave, WAVE_NAMES[wave])
  }

  /**
   * 第 2 波保底精英：出现在玩家视野附近（EARLY_ELITE_DISTANCE），带一个词缀，
   * 走常规 spawnAt 路径 → 击杀后按既有规则必掉一颗元素核心。
   *
   * 与常规精英的两点刻意差异（都是为了「来得及」）：
   *  - 体量除以 EARLY_ELITE_HP_DIVISOR，让第 2 波的裸 DPS 也打得动；
   *  - 移速乘 EARLY_ELITE_SPEED_MUL，主动逼近，把「遇见」变成「必然交战」。
   * 掉落规则与怪物类型池完全沿用既有实现，不新增任何资源。
   *
   * 返回生成的敌人（场上已满时 spawnAt 返回 undefined，保底顺延到下一次 beginWave）。
   */
  _spawnEarlyElementElite() {
    const player = this.game?.player
    if (!player) return null
    const type = this._rollType()
    const angle = Math.random() * TAU
    const d = EARLY_ELITE_DISTANCE
    const x = Math.max(0, Math.min(this.game.worldWidth, player.x + Math.cos(angle) * d))
    const y = Math.max(0, Math.min(this.game.worldHeight, player.y + Math.sin(angle) * d))
    return this.spawnAt(x, y, type, {
      elite: true,
      affix: AFFIXES[(Math.random() * AFFIXES.length) | 0],
      hpDivisor: EARLY_ELITE_HP_DIVISOR,
      speedMul: EARLY_ELITE_SPEED_MUL,
    })
  }

  _speedGrowth() {
    const growthWave = Math.min(Math.max(0, this._effectiveWave() - 1), 16)
    return 1 + growthWave * 0.06
  }

  _rollAffixes(elite, forced = null) {
    if (!elite) return []
    const first = forced || AFFIXES[(Math.random() * AFFIXES.length) | 0]
    const affixes = [first]
    const chance = this.game?.runProfile?.doubleAffixChance || 0
    if (Math.random() < chance) {
      const pool = AFFIXES.filter((affix) => affix !== first)
      affixes.push(pool[(Math.random() * pool.length) | 0])
    }
    return affixes
  }

  _directorFactor() {
    if (this._bossGrace > 0) {
      this._directorPhase = '王级交锋'
      this._directorIntensity = 0
      return 1.5
    }
    if (this._bossRecovery > 0) {
      this._directorPhase = '战后喘息'
      this._directorIntensity = 0.25
      return 1.6
    }

    const beat = this._waveTimer / WAVE_DURATION
    let factor = 1
    if (beat < 0.18) {
      this._directorPhase = '集结'
      this._directorIntensity = 0.72
      factor = 1.22
    } else if (beat > 0.82) {
      // 波末冲刺（原「喘息」）：以最快增援收尾，清场快的玩家不再有 4~5 秒死时间，
      // 每波以高潮结束并自然顶进下一波
      this._directorPhase = '冲刺'
      this._directorIntensity = 1.3
      factor = 0.72
    } else {
      this._directorPhase = '围攻'
      this._directorIntensity = 1.12
      factor = 0.84
    }

    const effectiveWave = this._effectiveWave()
    const target = this._populationTarget()
    if (this._enemies.length > target) factor *= 1.35
    else if (this._enemies.length < target * 0.42) factor *= 0.9

    if (this._clearSampleReady) {
      const expectedRate = Math.min(4.5, 0.6 + effectiveWave * 0.12)
      if (this._clearRate < expectedRate * 0.55 && this._enemies.length > target * 0.7) {
        factor *= 1.1
      } else if (this._clearRate > expectedRate * 1.35 && this._enemies.length < target * 0.55) {
        factor *= 0.94
      }
    }

    // 首领登场收口（远征）：目标越接近完成，增援越稀疏——
    // 由引擎每帧推送的章节进度驱动，非远征模式恒为 0，不影响原有节拍
    const stagePressure = this._stagePressure || 0
    if (stagePressure > EXPEDITION_WIND_DOWN_AT) {
      const k = (stagePressure - EXPEDITION_WIND_DOWN_AT) / (1 - EXPEDITION_WIND_DOWN_AT)
      factor *= 1 + k * EXPEDITION_WIND_DOWN_MUL
      this._directorPhase = '决战前夕'
      this._directorIntensity = Math.max(0.4, 0.72 - k * 0.3)
    }

    const player = this.game?.player
    if (player) {
      const hpRatio = player.maxHp > 0 ? player.hp / player.maxHp : 1
      if (hpRatio < 0.35) factor *= 1.12
      else if (hpRatio > 0.8 && player.level > effectiveWave * 1.35) factor *= 0.93
    }
    return Math.max(0.68, Math.min(1.65, factor))
  }

  /**
   * 抽取敌军兵种：先按有效波次取原生编成，再叠加当前章节的地域偏向——
   * 远征的每个章节因此拥有自己的兵种画像（盾卫城塞 / 怨灵王陵 / 狂战校场），
   * 而非 12 章共用一张权重表。非远征模式 getStageEnemyBias 返回 null，编成不变。
   */
  _rollType() {
    const effectiveWave = this._effectiveWave()
    let roster = WAVE_ROSTERS[0].units
    for (const profile of WAVE_ROSTERS) {
      if (profile.min > effectiveWave) break
      roster = profile.units
    }
    if (this.game?.runSelection?.mode === 'expedition') {
      const bias = getStageEnemyBias(this.game.runSelection, this.game.expeditionStage || 1)
      roster = applyEnemyBias(roster, bias)
    }
    let roll = Math.random()
    for (const [type, weight] of roster) {
      roll -= weight
      if (roll <= 0) return type
    }
    return roster[roster.length - 1][0]
  }

  /** 远程职业（法师/弓手）发射弹幕：由 Enemy._shoot 调用 */
  spawnBullet(x, y, angle, kind, options = {}) {
    this._bullets.push(new EnemyBullet({ x, y, angle, kind, ...options }))
  }

  /** 屏幕边缘生成一个勇者（相机视口边缘外侧，营造「涌入」感） */
  spawn() {
    if (this._finale || this._enemies.length >= MAX_ENEMIES) return
    const cam = this.game.camera
    const vw = this.game.width // 视口尺寸（世界坐标下的可见范围）
    const vh = this.game.height

    // 守巢章节从巢心四条进攻路线入场；其余关卡仍从当前视口四边涌入。
    const defensePoint = this.game.mapFeatures?.nestDefenseActive
      ? this.game.mapFeatures.getDefenseSpawnPoint()
      : null
    const side = (Math.random() * 4) | 0
    let x = 0
    let y = 0
    if (defensePoint) {
      x = defensePoint.x
      y = defensePoint.y
    } else if (side === 0) {
      x = cam.x + rand(0, vw)
      y = cam.y - SPAWN_MARGIN // 上边
    } else if (side === 1) {
      x = cam.x + vw + SPAWN_MARGIN // 右边
      y = cam.y + rand(0, vh)
    } else if (side === 2) {
      x = cam.x + rand(0, vw)
      y = cam.y + vh + SPAWN_MARGIN // 下边
    } else {
      x = cam.x - SPAWN_MARGIN // 左边
      y = cam.y + rand(0, vh)
    }
    // 夹回世界内（视口贴世界边时，不让敌人生成到世界外）
    x = Math.max(0, Math.min(this.game.worldWidth, x))
    y = Math.max(0, Math.min(this.game.worldHeight, y))

    // 命名波次使用对应的加权敌军编成；精英怪第 3 波起按概率出现，
    // 另在第 2 波有一只保底精英作为「早期元素入口」（见 EARLY_ELEMENT_WAVE）。
    const type = this._rollType()
    const { profile, wave } = this._combatModifiers()
    const effectiveWave = this._effectiveWave()
    const baseEliteChance = 0.03 + effectiveWave * 0.01
    const eliteChance = Math.min(
      (profile.eliteChanceCap || 0.12) + (wave.eliteChanceCapBonus || 0),
      baseEliteChance * (profile.eliteChanceMul || 1) + wave.eliteChanceBonus
    )
    const elite = effectiveWave >= 3 && Math.random() < eliteChance
    const affixes = this._rollAffixes(elite)

    const baseHp = 1 + ((Math.random() * 3) | 0) + Math.floor((effectiveWave - 1) / 2)
    const enemy = new Enemy({
      x,
      y,
      type,
      elite,
      affixes,
      // 波次成长曲线：每波速度 +6%（封顶）、每 2 波基础生命 +1（职业/精英系数在 Enemy 内乘算）
      speed: rand(65, 110) * this._speedGrowth() * (profile.enemySpeedMul || 1),
      speedCap: profile.enemySpeedCap,
      hp: baseHp * (profile.enemyHpMul || 1) * wave.enemyHpMul,
      rewardHp: baseHp,
      attackTempo: (profile.attackTempoMul || 1) * (wave.attackTempoMul || 1),
    })
    enemy.objectiveTarget = this.game.mapFeatures?.shouldTargetNest(enemy) ? 'nest' : null
    enemy.attach(this.game)
    this._enemies.push(enemy)
  }

  /**
   * 在指定坐标生成敌人（Boss 召唤 / 召唤词缀用），受上限保护。
   * 阶段十三修复：复用 spawn 的波次成长公式（速度 +6%/波且封顶、生命 +1/2波），
   * 高波次下召唤兵不再是一碰就碎的第 1 波属性空气。
   */
  spawnAt(x, y, type = 'knight', options = {}) {
    if (this._enemies.length >= MAX_ENEMIES) return
    const elite = !!options.elite
    const { profile, wave } = this._combatModifiers()
    const effectiveWave = this._effectiveWave()
    const baseHp = 1 + ((Math.random() * 3) | 0) + Math.floor((effectiveWave - 1) / 2)
    const hpDivisor = Math.max(1, options.hpDivisor || 1)
    const enemy = new Enemy({
      x,
      y,
      type,
      elite,
      affixes: this._rollAffixes(elite, options.affix || null),
      speed: rand(65, 110) * this._speedGrowth() * (profile.enemySpeedMul || 1) * (options.speedMul || 1),
      speedCap: profile.enemySpeedCap,
      hp: (baseHp * (profile.enemyHpMul || 1) * wave.enemyHpMul) / hpDivisor,
      rewardHp: baseHp,
      attackTempo: (profile.attackTempoMul || 1) * (wave.attackTempoMul || 1),
    })
    enemy.eventToken = options.eventToken || null
    enemy.objectiveTarget = options.objectiveTarget || null
    enemy.attach(this.game)
    this._enemies.push(enemy)
    return enemy
  }

  /** 大型技能共享令牌：编队中同一时刻只允许一名首领制造全屏预警。 */
  claimBossCast(boss) {
    if (!boss?.active) return false
    if (this._bossCaster?.active && this._bossCaster !== boss) return false
    this._bossCaster = boss
    const encounter = this._bossEncounter
    if (encounter && encounter.relayTargetId === boss.bossMemberId) {
      encounter.relayTargetId = null
    }
    return true
  }

  releaseBossCast(boss) {
    const wasCaster = this._bossCaster === boss
    if (wasCaster) this._bossCaster = null
    const encounter = this._bossEncounter
    if (
      !wasCaster ||
      !boss?.active ||
      boss.specialState !== 'recover' ||
      encounter?.formation?.id !== 'arcane_relay' ||
      encounter.breakClaimed ||
      encounter.id !== boss.bossGroupId
    ) return

    const next = this._bosses.find((member) =>
      member.active && member !== boss && member.bossGroupId === encounter.id
    )
    if (!next) return
    next.specialCd = Math.min(next.specialCd, 0.65)
    encounter.relayTargetId = next.bossMemberId
    this.addText(next.x, next.y - next.radius - 14, '奥术接力', '强招蓄势', '#e8c477', 13)
  }

  getBossDamageTakenMultiplier(boss) {
    const encounter = this._bossEncounter
    if (
      encounter?.formation?.id !== 'royal_guard' ||
      encounter.id !== boss?.bossGroupId ||
      encounter.captainId !== boss?.bossMemberId
    ) return 1
    const guards = this._bosses.some((member) =>
      member.active && member !== boss && member.bossGroupId === encounter.id
    ) || encounter.pending.length > 0
    return guards ? 0.65 : 1
  }

  getBossTempoMultiplier(boss) {
    const encounter = this._bossEncounter
    if (
      encounter?.formation?.id !== 'blood_oath' ||
      encounter.breakClaimed ||
      encounter.id !== boss?.bossGroupId
    ) return 1
    return 1 + Math.min(4, encounter.furyStacks || 0) * 0.12
  }

  _bossFormationInfo(active = this._bosses.filter((boss) => boss.active)) {
    const encounter = this._bossEncounter
    const formation = encounter?.formation
    if (!formation || encounter.final) return null
    if (formation.id === 'royal_guard') {
      const captain = active.find((boss) => boss.bossMemberId === encounter.captainId)
      const protectedNow = captain && this.getBossDamageTakenMultiplier(captain) < 1
      return {
        ...formation,
        captainId: encounter.captainId,
        active: !!protectedNow,
        broken: !!encounter.breakClaimed,
        status: encounter.breakClaimed
          ? '护卫线已破 · 追击中'
          : protectedNow ? '受护 · 清空护卫可破阵' : '护卫线已破',
      }
    }
    if (formation.id === 'blood_oath') {
      const stacks = Math.min(4, encounter.furyStacks || 0)
      return {
        ...formation,
        stacks,
        broken: !!encounter.breakClaimed,
        status: encounter.breakClaimed
          ? '血誓已断 · 追击中'
          : `血誓 ${stacks}/4 · 行动 +${stacks * 12}% · 破绽击杀`,
      }
    }
    const relay = active.find((boss) => boss.bossMemberId === encounter.relayTargetId)
    return {
      ...formation,
      broken: !!encounter.breakClaimed,
      status: encounter.breakClaimed
        ? '接力已断 · 追击中'
        : this._bossCaster?.active
        ? `施法 · ${this._bossCaster.name} · 击杀破阵`
        : relay ? `接力 · ${relay.name} · 击杀破阵` : '待接力 · 击杀施法目标破阵',
    }
  }

  /** 生成一名 Boss：编队入口显式传 allowMultiple，普通调用仍保持单首领语义。 */
  spawnBoss(options = {}) {
    if (this.hasBoss && !options.allowMultiple) return
    if (this.activeBossCount >= 3) return
    const types = ['boss-knight', 'boss-mage', 'boss-archer']
    const encounter = options.encounter || null
    const type = encounter ? `boss-${encounter.archetype}` : options.type || types[(Math.random() * 3) | 0]
    const player = this.game.player
    const a = Number.isFinite(options.spawnAngle) ? options.spawnAngle : Math.random() * TAU
    const d = options.distance || 420 + Math.random() * 200
    const x = Math.max(0, Math.min(this.game.worldWidth, player.x + Math.cos(a) * d))
    const y = Math.max(0, Math.min(this.game.worldHeight, player.y + Math.sin(a) * d))
    const { profile, wave } = this._combatModifiers()
    const expedition = this.game?.runSelection?.mode === 'expedition'
    const scalingWave = expedition ? 12 + this._effectiveWave() : this.wave
    const expeditionBossHpMul = expedition && encounter
      ? getExpeditionBossHpMultiplier(encounter)
      : 1
    const bossOptions = {
      x,
      y,
      wave: scalingWave,
      type,
      hpMultiplier:
        (profile.bossHpMul || 1) *
        wave.bossHpMul *
        (encounter?.hpMul || 1) *
        expeditionBossHpMul *
        (options.memberHpMul || 1),
      speedMultiplier: profile.enemySpeedMul || 1,
      attackTempo: (profile.attackTempoMul || 1) * (wave.attackTempoMul || 1),
      patternBonus: (profile.bossPatternBonus || 0) + wave.bossPatternBonus,
      finalBoss: !!options.finalBoss,
      expeditionBoss: !!options.expeditionBoss,
    }
    const boss = encounter
      ? new ExpeditionBoss({ ...bossOptions, encounter })
      : new Boss(bossOptions)
    boss.bossGroupId = options.groupId || `solo-${++this._bossGroupSeq}`
    boss.bossMemberId = `${boss.bossGroupId}-${this._bosses.length + 1}`
    boss.bossGroupSize = options.groupTotal || 1
    boss.isBossSquadMember = boss.bossGroupSize > 1
    boss.bossLootDrops = Number.isFinite(options.bossLootDrops) ? options.bossLootDrops : null
    boss.bossEncounterFinal = !!options.bossEncounterFinal
    boss.encounterLabel = options.encounterLabel || boss.name
    if (options.expMul) boss.expValue = Math.max(20, Math.round(boss.expValue * options.expMul))
    boss.attach(this.game)
    this._enemies.push(boss)
    this._bosses.push(boss)
    if (!this._boss?.active) this._boss = boss
    this.game.sound.bossRoar()
    this.game.shakeScreen(6, 0.35) // Boss 登场震撼（阶段十五美化）
    this.game.onBossSpawn?.(boss)
    this.game.dialogue?.sayBoss(boss, 'spawn')
    return boss
  }

  /** 五波节点首领：场上硬封顶三名，超出的编队成员在首领阵亡后依次补位。 */
  spawnBossGroup(plan) {
    if (!plan?.types?.length) return []
    const active = this._bosses.filter((boss) => boss.active)
    const target = Math.max(active.length, plan.total || plan.types.length)
    const maxActive = Math.min(3, plan.maxActive || target)
    const existing = this._bossEncounter?.final ? null : this._bossEncounter
    const formationChanged = !existing || existing.formationWave !== this.wave
    const committed = active.length + (existing?.pending.length || 0)
    if (committed >= target) return []

    const groupId = existing?.id || `wave-${this.wave}-${++this._bossGroupSeq}`
    this._bossEncounter = existing || {
      id: groupId,
      label: plan.label,
      total: target,
      pending: [],
      maxActive,
      lootSlotsAssigned: 0,
      final: false,
      formation: plan.formation || null,
      formationWave: this.wave,
      captainId: null,
      furyStacks: 0,
      relayTargetId: null,
      breakClaimed: false,
    }
    this._bossEncounter.label = plan.label
    this._bossEncounter.total = target
    this._bossEncounter.maxActive = maxActive
    this._bossEncounter.lootSlotsAssigned = 0
    if (formationChanged) {
      this._bossEncounter.formation = plan.formation || null
      this._bossEncounter.formationWave = this.wave
      this._bossEncounter.captainId = null
      this._bossEncounter.furyStacks = 0
      this._bossEncounter.relayTargetId = null
      this._bossEncounter.breakClaimed = false
    }
    for (const boss of active) {
      boss.bossGroupId = groupId
      boss.bossGroupSize = target
      boss.isBossSquadMember = target > 1
      boss.bossLootDrops = this._bossEncounter.lootSlotsAssigned < 3 ? 1 : 0
      this._bossEncounter.lootSlotsAssigned++
      boss.encounterLabel = plan.label
    }

    for (const member of this._bossEncounter.pending) {
      member.memberHpMul = plan.memberHpMul
      member.expMul = target > 1 ? 1.2 / target : 1
      member.bossLootDrops = this._bossEncounter.lootSlotsAssigned < 3 ? 1 : 0
      this._bossEncounter.lootSlotsAssigned++
    }

    const occupied = new Set([
      ...active.map((boss) => boss.type),
      ...this._bossEncounter.pending.map((member) => member.type),
    ])
    const candidates = [
      ...plan.types.filter((type) => !occupied.has(type)),
      ...plan.types.filter((type) => occupied.has(type)),
    ]
    const missing = target - committed
    const baseAngle = Math.random() * TAU
    for (let i = 0; i < missing; i++) {
      this._bossEncounter.pending.push({
        type: candidates[i % candidates.length],
        spawnAngle: baseAngle + ((committed + i) / target) * TAU,
        distance: 480,
        memberHpMul: plan.memberHpMul,
        expMul: target > 1 ? 1.2 / target : 1,
      })
    }
    const spawned = this._fillBossEncounter()
    if (this._bossEncounter.formation?.id === 'royal_guard' && !this._bossEncounter.captainId) {
      const captain = this._bosses.find((boss) => boss.active && boss.bossGroupId === groupId)
      this._bossEncounter.captainId = captain?.bossMemberId || null
    }
    this.game.onBossGroupSpawn?.({
      label: plan.label,
      total: target,
      wave: this.wave,
      formation: this._bossEncounter.formation,
    })
    return spawned
  }

  _startBossEncounter({ label, members, maxActive = 2 }) {
    const groupId = `encounter-${++this._bossGroupSeq}`
    this._bossEncounter = {
      id: groupId,
      label,
      total: members.length,
      pending: members.map((member) => ({ ...member })),
      maxActive,
      lootSlotsAssigned: 0,
      final: true,
    }
    this._fillBossEncounter()
    this.game.onBossGroupSpawn?.({ label, total: members.length, wave: this.wave, finale: true })
    return this._boss
  }

  _fillBossEncounter() {
    const encounter = this._bossEncounter
    const spawned = []
    if (!encounter) return spawned
    while (this.activeBossCount < encounter.maxActive && encounter.pending.length > 0) {
      const member = encounter.pending.shift()
      const bossLootDrops = Number.isFinite(member.bossLootDrops)
        ? member.bossLootDrops
        : encounter.lootSlotsAssigned < 3 ? 1 : 0
      encounter.lootSlotsAssigned++
      const boss = this.spawnBoss({
        ...member,
        allowMultiple: true,
        groupId: encounter.id,
        groupTotal: encounter.total,
        encounterLabel: encounter.label,
        bossLootDrops,
        bossEncounterFinal: encounter.final,
        expMul: member.expMul ?? (encounter.final ? 0.4 : 1),
      })
      if (boss) spawned.push(boss)
    }
    return spawned
  }

  /** Boss 击败结算后推进增援；返回整个编队是否已经清空。 */
  advanceBossEncounter(boss) {
    const encounter = this._bossEncounter
    const sameGroup = encounter && encounter.id === boss?.bossGroupId
    const formationId = sameGroup ? encounter.formation?.id : null
    const bloodOathBreak = formationId === 'blood_oath' && boss.vulnerableTimer > 0
    const arcaneRelayBreak = formationId === 'arcane_relay' &&
      (this._bossCaster === boss || encounter.relayTargetId === boss.bossMemberId)
    this.releaseBossCast(boss)
    let bloodOathTriggered = false
    if (
      encounter?.formation?.id === 'blood_oath' &&
      !encounter.breakClaimed &&
      !bloodOathBreak &&
      encounter.id === boss?.bossGroupId &&
      this.activeBossCount + this.pendingBossCount > 0
    ) {
      encounter.furyStacks = Math.min(4, (encounter.furyStacks || 0) + 1)
      bloodOathTriggered = true
    }
    this._fillBossEncounter()
    if (bloodOathTriggered) {
      for (const survivor of this._bosses) {
        if (!survivor.active || survivor.bossGroupId !== encounter.id) continue
        const heal = Math.max(1, Math.round(survivor.maxHp * 0.08))
        survivor.hp = Math.min(survivor.maxHp, survivor.hp + heal)
        this.addText(survivor.x, survivor.y - survivor.radius - 14, `血誓 +${encounter.furyStacks}`, `恢复 ${heal}`, '#ef998c', 13)
      }
    }
    const royalGuardBreak = formationId === 'royal_guard' &&
      boss.bossMemberId !== encounter.captainId &&
      this._bosses.some((member) =>
        member.active && member.bossGroupId === encounter.id &&
        member.bossMemberId === encounter.captainId
      ) &&
      !this._bosses.some((member) =>
        member.active && member.bossGroupId === encounter.id &&
        member.bossMemberId !== encounter.captainId
      ) && encounter.pending.length === 0
    const remaining = this.activeBossCount + this.pendingBossCount > 0
    if (
      sameGroup &&
      !encounter.breakClaimed &&
      remaining &&
      (royalGuardBreak || bloodOathBreak || arcaneRelayBreak)
    ) {
      encounter.breakClaimed = true
      this.game.triggerEndlessFormationBreak?.({
        id: encounter.formation.id,
        name: encounter.formation.breakName,
      })
    }
    const complete = this.activeBossCount === 0 && this.pendingBossCount === 0
    if (complete) this._bossEncounter = null
    return complete
  }

  /** 限时终局：两名先遣同时登场，任一阵亡后终审勇者补位，场上始终最多两名。 */
  beginFinale() {
    if (this._finale) return this._boss
    this._finale = true
    this._clearCombatants()
    this.wave = Math.max(25, this.wave)
    this._waveTimer = 0
    this._bossGrace = 0
    this._bossRecovery = 0
    this._directorPhase = '终局审判'
    this._directorIntensity = 1
    return this._startBossEncounter({
      label: '王国最后防线',
      maxActive: 2,
      members: [
        { type: 'boss-knight', memberHpMul: 0.62, spawnAngle: -Math.PI / 5, distance: 500 },
        { type: 'boss-archer', memberHpMul: 0.62, spawnAngle: Math.PI / 5, distance: 500 },
        { type: 'boss-final', finalBoss: true, memberHpMul: 0.78, spawnAngle: Math.PI, distance: 520 },
      ],
    })
  }

  _clearCombatants() {
    for (const enemy of this._enemies) enemy.destroy()
    this._enemies.length = 0
    this._bullets.length = 0
    this._devouring.length = 0
    this._routing.length = 0
    this._boss = null
    this._bosses.length = 0
    this._bossCaster = null
    this._bossEncounter = null
  }

  /** 远征换关：中立清场并恢复普通生成。 */
  prepareExpeditionStage() {
    this._clearCombatants()
    this._finale = false
    this.wave = 1
    this._waveTimer = 0
    this._bossGrace = 0
    this._bossRecovery = 0
    this._clearSampleTime = 0
    this._clearSampleKills = this.game?.weaponSystem?.kills || 0
    this._clearSampleReady = false
    this._clearRate = 0
    this._spawnTimer = this._nextInterval()
    this._directorPhase = '远征推进'
    this._directorIntensity = 0.8
  }

  spawnExpeditionElites(count = 5, eliteTypes = null) {
    const player = this.game.player
    const types = eliteTypes?.length ? eliteTypes : ['knight', 'mage', 'archer', 'assassin', 'berserker']
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * TAU
      const distance = 260 + (i % 2) * 55
      this.spawnAt(
        Math.max(20, Math.min(this.game.worldWidth - 20, player.x + Math.cos(angle) * distance)),
        Math.max(20, Math.min(this.game.worldHeight - 20, player.y + Math.sin(angle) * distance)),
        types[i % types.length],
        { elite: true, affix: AFFIXES[i % AFFIXES.length] }
      )
    }
  }

  beginExpeditionStageBoss(encounter, final = false) {
    this._finale = true
    this._waveTimer = 0
    this._bossGrace = 0
    this._bossRecovery = 0
    this._stagePressure = 0 // 首领已登场：收口状态清除，交由 _finale 接管生成闸门
    this._directorPhase = final ? '王庭真相' : '章节首领'
    this._directorIntensity = 1
    return this.spawnBoss({ encounter, expeditionBoss: final })
  }

  beginExpeditionBoss(encounter = null) {
    if (encounter) return this.beginExpeditionStageBoss(encounter, true)
    this._finale = true
    this._waveTimer = 0
    this._bossGrace = 0
    this._bossRecovery = 0
    this._directorPhase = '王庭真相'
    this._directorIntensity = 1
    return this.spawnBoss({ type: 'boss-expedition', expeditionBoss: true })
  }

  update(dt) {
    // 玩家已死亡（gameOver 已触发，仅本帧残差）：停止敌人侧全部推进，
    // 防止死亡帧残差继续吞噬/击杀结算（结算快照之后的数据变动会丢失或重复）
    if (this.game.player.dead) return

    this._updateClearRate(dt)

    // 0) 波次推进：远征只循环本章内的导演节拍，不再递增全局波次。
    const expedition = this.game?.runSelection?.mode === 'expedition'
    if (!this._finale) this._waveTimer += dt
    if (!this._finale && expedition && this._waveTimer >= WAVE_DURATION) {
      this._waveTimer %= WAVE_DURATION
    } else if (!this._finale && this._waveTimer >= WAVE_DURATION) {
      this._waveTimer -= WAVE_DURATION
      this.wave++
      this.game.sound.wave() // 波次切换号角
      if (this.game.handleWaveAdvanced?.(this.wave)) return
      this.beginWave(this.wave)
    }

    // 更新导演节拍，即使当前处于生成冷却，HUD/下一次间隔也能得到当前状态。
    if (!this._finale) this._directorFactor()

    // 1) 定时生成
    this._bossGrace = Math.max(0, this._bossGrace - dt)
    this._bossRecovery = Math.max(0, this._bossRecovery - dt)
    if (!this._finale && this._bossGrace <= 0 && this._bossRecovery <= 0) {
      this._spawnTimer -= dt
      if (this._spawnTimer <= 0) {
        const softCap = Math.ceil(this._populationTarget() * 1.2)
        if (this._enemies.length < softCap) this.spawn()
        this._spawnTimer += this._nextInterval()
      }
    }

    // 2) 每个敌人各自执行职业行为（追逐/风筝/射击）
    for (const e of this._enemies) {
      e.update(dt)
      if (e.active && !e.isBoss && !e._dialogueChecked) this.game.dialogue?.tryMinion(e)
    }

    // 2.5) 敌人弹幕：移动 + 与玩家碰撞 + 回收
    this._updateBullets(dt)

    // 2.6) 吞噬系统：残血敌人吸入 + 溶解动画推进 + 溃散推进 + 浮动文本
    this._checkDevour()
    this._updateDevouring(dt)
    this._updateRouting(dt)
    for (const t of this._texts) t.update(dt)
    let hasText = false
    for (const t of this._texts) {
      if (!t.active) {
        hasText = true
        break
      }
    }
    if (hasText) this._texts = this._texts.filter((t) => t.active)

    // 3) 空间哈希 + 邻域分离，保持群集身位
    this._buildGrid()
    this._separate()

    // 4) 回收已死亡（destroy 标记 active=false）的敌人
    let hasDead = false
    let bossDied = false
    for (const e of this._enemies) {
      if (!e.active) {
        hasDead = true
        if (e.isBoss) {
          bossDied = true
          this.releaseBossCast(e)
        }
      }
    }
    if (hasDead) this._enemies = this._enemies.filter((e) => e.active)
    if (bossDied) {
      this._bosses = this._bosses.filter((boss) => boss.active)
      this._boss = this._bossCaster?.active ? this._bossCaster : this._bosses[0] || null
      if (this.activeBossCount === 0 && this.pendingBossCount === 0) {
        this._bossRecovery = BOSS_RECOVERY_DURATION
        this._spawnTimer = Math.max(this._spawnTimer, 0.8)
        if (!this._bossEncounter?.final) this._bossEncounter = null
      }
    }
  }

  _updateClearRate(dt) {
    const kills = this.game?.weaponSystem?.kills || 0
    if (!this._clearSampleReady && this._clearSampleTime === 0) this._clearSampleKills = kills
    this._clearSampleTime += dt
    if (this._clearSampleTime < CLEAR_RATE_WINDOW) return
    this._clearRate = Math.max(0, kills - this._clearSampleKills) / this._clearSampleTime
    this._clearSampleKills = kills
    this._clearSampleTime = 0
    this._clearSampleReady = true
  }

  /**
   * 吞噬检测：可吞噬的残血敌人进入玩家吸入口径时触发吞噬（一帧至多一个）。
   * 阶段十九：吞噬是暴食史莱姆的独占机制——非暴食角色（含 origin）直接短路。
   * Enemy.hit 侧也做了同一判定（标记层），这里是吸收层的唯一闸门。
   */
  _checkDevour() {
    // game.canDevour：引擎侧是 getter（布尔）；桩对象通常没这个字段，缺省按「可吞噬」处理
    if (this.game.canDevour === false) return
    const player = this.game.player
    const reach = (player.radius + 12) * (player.devourRadiusBonus || 1.0)
    const reach2 = reach * reach
    for (const e of this._enemies) {
      if (!e.active || !e.devourable || e.devouring) continue
      const dx = player.x - e.x
      const dy = player.y - e.y
      if (dx * dx + dy * dy < reach2) {
        this._startDevour(e)
        break
      }
    }
  }

  /**
   * 开始吞噬：标记吸入 → 玩家膨胀脉冲 → 掉落/素材/文本结算（WeaponSystem 统一处理）。
   *
   * `ctx.source` 是**显式**的吞噬来源标记（'normal' | 'gluttonF'），从唯一入口
   * 一路传到 WeaponSystem.onDevoured：判断链路上不存在时间戳、位置或全局布尔，
   * 「暴食 F 的吞噬不返充猎食点」这条护栏就落在 WeaponSystem.onDevoured 的
   * 来源分发上（见 GluttonResource.onNormalDevoured / onGluttonFDevoured）。
   * @param {object} e 目标敌人
   * @param {{source?: string}} [ctx] 吞噬来源上下文（缺省 = 普通吞噬）
   */
  _startDevour(e, ctx = null) {
    e.devouring = true
    e._devourT = 0
    this._devouring.push(e)
    this.game.player._devourPulse = 0.3 // 果冻膨胀脉冲
    this.game.weaponSystem.onDevoured(e, ctx)
  }

  /** 远征过关：残敌原地震散（0.55s 缩小淡出）——胜势演出，不给吞噬奖励。
   *  弹幕立即清空（不让飞行中的弹幕偷袭庆祝中的玩家）。 */
  routAll() {
    this._bullets.length = 0
    this._devouring.length = 0
    for (const e of this._enemies) {
      e.devouring = true // 冻结行为 + 武器/吞噬系统跳过（与吞噬共用免交互通道）
      e._routT = 0
      this._routing.push(e)
    }
  }

  /** 溃散推进：0.55s 后自毁回收 */
  _updateRouting(dt) {
    const list = this._routing
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i]
      e._routT += dt
      if (e._routT >= 0.55) {
        e.destroy()
        list.splice(i, 1)
      }
    }
  }

  /** 吸入动画：0.22s 内敌人加速飞向玩家并缩小，随后溶解消失 */
  _updateDevouring(dt) {
    const player = this.game.player
    const list = this._devouring
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i]
      e._devourT += dt
      const k = Math.min(1, e._devourT / 0.22)
      const f = k * k // 加速吸入（先慢后快，吞咽感）
      e.x += (player.x - e.x) * f * 0.6
      e.y += (player.y - e.y) * f * 0.6
      e._devourScale = 1 - k * 0.85 // 缩小到 15%
      if (k >= 1) {
        e.destroy() // 溶解消失
        list.splice(i, 1)
      }
    }
  }

  /** 敌人弹幕推进：直线移动、命中玩家扣血、寿命/越界销毁 */
  _updateBullets(dt) {
    const list = this._bullets
    if (list.length === 0) return
    const player = this.game.player
    const cam = this.game.camera
    const { width, height } = this.game
    for (const b of list) {
      if (!b.active) continue
      b.update(dt)
      if (!b.active) continue
      // 玩家碰撞（圆碰撞，平方比较免开方；玩家无敌帧兜底）
      const dx = player.x - b.x
      const dy = player.y - b.y
      const rr = b.radius + player.radius
      if (dx * dx + dy * dy < rr * rr) {
        b.active = false
        player.hit(b.damage)
        continue
      }
      // 视口余量外销毁（弹幕不会追出太远）
      if (b.x < cam.x - 80 || b.x > cam.x + width + 80 || b.y < cam.y - 80 || b.y > cam.y + height + 80) {
        b.active = false
      }
    }
    // 回收失效弹幕
    let hasDead = false
    for (const b of list) {
      if (!b.active) {
        hasDead = true
        break
      }
    }
    if (hasDead) this._bullets = list.filter((b) => b.active)
  }

  /** 把敌人散列进网格：O(n) 构建，供分离阶段快速取邻居 */
  _buildGrid() {
    const grid = this._grid
    grid.clear()
    for (const e of this._enemies) {
      const cx = (e.x / CELL_SIZE) | 0
      const cy = (e.y / CELL_SIZE) | 0
      const key = cx * GRID_KEY_SCALE + cy // 双射数字 key，无字符串拼接、无哈希冲突
      let bucket = grid.get(key)
      if (!bucket) {
        bucket = []
        grid.set(key, bucket)
      }
      bucket.push(e)
    }
  }

  /** 圆-圆分离：只检查相邻 3×3 网格中的邻居，重叠对各推一半；推开后夹回世界边界 */
  _separate() {
    const { _enemies: list, _grid: grid, game } = this
    const { worldWidth, worldHeight } = game
    for (const e of list) {
      const cx = (e.x / CELL_SIZE) | 0
      const cy = (e.y / CELL_SIZE) | 0
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const bucket = grid.get((cx + ox) * GRID_KEY_SCALE + (cy + oy))
          if (!bucket) continue
          for (const n of bucket) {
            if (n === e) continue
            const dx = e.x - n.x
            const dy = e.y - n.y
            const minD = e.radius + n.radius
            const d2 = dx * dx + dy * dy
            if (d2 < minD * minD && d2 > 0.0001) {
              if (e.positionLocked) continue
              const d = Math.sqrt(d2)
              // 锁定读招几何的 Boss 不受群集推挤；邻居承担全部让位距离。
              const share = n.positionLocked ? 1 : 0.5
              const push = ((minD - d) / d) * share
              e.x += dx * push
              e.y += dy * push
              // 阶段十三：推开不越界（贴世界边的怪群不再被推出地图外）
              if (e.x < e.radius) e.x = e.radius
              else if (e.x > worldWidth - e.radius) e.x = worldWidth - e.radius
              if (e.y < e.radius) e.y = e.radius
              else if (e.y > worldHeight - e.radius) e.y = worldHeight - e.radius
            }
          }
        }
      }
    }
  }

  render(ctx) {
    const cam = this.game.camera
    const { width, height } = this.game
    // 视口剔除：可见范围（80px 余量，覆盖 Boss 体型与武器伸出）之外的敌人不绘制
    const vx0 = cam.x - 80
    const vy0 = cam.y - 80
    const vx1 = cam.x + width + 80
    const vy1 = cam.y + height + 80
    for (const e of this._enemies) {
      const outsideView = e.x < vx0 || e.x > vx1 || e.y < vy0 || e.y > vy1
      // Boss 本体可在视口外读招，但危险几何可能延伸进视口，蓄力/冲锋期间不能剔除。
      if (outsideView && !e.positionLocked) continue
      if (e.devouring) continue // 吸入/溃散中的敌人由各自的溶解通道绘制
      e.render(ctx)
    }
    // 弹幕绘制在敌人之上，清晰可见
    for (const b of this._bullets) {
      if (b.active) b.render(ctx)
    }
    // 溶解中的敌人：被吸向史莱姆时的拉伸半透明精灵
    const assets = AssetManager.getInstance()
    // 溃散中的残敌：过关演出的原地震散（缩小淡出，不飞向玩家——与吞噬区分语义）
    for (const e of this._routing) {
      const k = Math.min(1, e._routT / 0.55)
      ctx.save()
      ctx.translate(e.x, e.y)
      ctx.globalAlpha = Math.max(0, 1 - k * 1.15)
      const s = 1 - k * 0.9
      ctx.scale(s, s)
      assets.draw(ctx, `char_${e.type}_0`, 0, 0, e.radius * 2.8, e.radius * 2.8)
      ctx.restore()
    }
    for (const e of this._devouring) {
      const s = Math.max(0.12, e._devourScale || 0)
      ctx.save()
      ctx.translate(e.x, e.y)
      ctx.globalAlpha = Math.min(1, s * 1.6)
      ctx.scale(s, s * 1.25)
      assets.draw(ctx, `char_${e.type}_0`, 0, 0, e.radius * 2.8, e.radius * 2.8)
      ctx.restore()
    }
    // 浮动文本（吞噬提示等）在最上层
    for (const t of this._texts) {
      if (t.active) t.render(ctx)
    }
  }
}
