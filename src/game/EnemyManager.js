import { Entity } from './core/Entity.js'
import { Enemy } from './entities/Enemy.js'
import { EnemyBullet } from './entities/EnemyBullet.js'
import { Boss } from './entities/Boss.js'
import { FloatingText } from './effects/FloatingText.js'
import { AssetManager } from './AssetManager.js'
import { getWaveModifiers } from './RunRules.js'

const TAU = Math.PI * 2

const MAX_ENEMIES = 300 // 性能护栏：场上敌人数量上限（防无限增长卡死）
const SPAWN_MARGIN = 24 // 生成点偏移：视口边缘外侧，营造「涌入」感
export const CELL_SIZE = 64 // 空间哈希网格单元尺寸（≥ 2×最大碰撞半径和，供分离与飞弹碰撞共用）
export const GRID_KEY_SCALE = 100000 // cell 坐标 → Map 唯一数字 key 的缩放系数
const WAVE_DURATION = 30 // 每波持续时间（秒）：时间驱动推进，压力随时间递增

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
    this._boss = null // 当前存活的 Boss（每 5 波一个）
    this._bossGrace = 0 // Boss 登场后的短暂清晰读招窗口
    this._directorPhase = '集结'
    this._directorIntensity = 0.75
    this._devouring = [] // 正在被吸入的敌人（溶解动画）
    this._routing = [] // 过关溃散中的残敌（原地震散动画，非吞噬）
    this._texts = [] // 浮动提示文本（吞噬等）
    this._finale = false
  }

  /** 当前活跃敌人数量（HUD 显示用） */
  get count() {
    return this._enemies.length
  }

  /** 当前是否有 Boss 存活 */
  get hasBoss() {
    return this._boss !== null
  }

  get bossInfo() {
    const b = this._boss
    if (!b?.active) return null
    const combat = b.combatInfo || {}
    return {
      name: b.name,
      hp: b.hp,
      maxHp: b.maxHp,
      enraged: !!b.enraged,
      phase: combat.phase || 1,
      phaseName: combat.phaseName || '王级交锋',
      state: combat.state || '追猎',
      special: combat.special || '',
      castProgress: combat.castProgress || 0,
      vulnerable: !!combat.vulnerable,
    }
  }

  get directorInfo() {
    return { phase: this._directorPhase, intensity: this._directorIntensity }
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
    this._bossGrace = 0
    this._directorPhase = '集结'
    this._directorIntensity = 0.75
    this._devouring.length = 0
    this._routing.length = 0
    this._texts.length = 0
    this._finale = false
  }

  attach(game) {
    super.attach(game)
    this._spawnTimer = this._nextInterval()
  }

  /** 下一次生成的随机等待时间：基础曲线叠加导演节拍与场上压力护栏；远征关卡越深节奏越紧。 */
  _nextInterval() {
    const introMul = this.wave === 1 ? 1.35 : this.wave === 2 ? 1.15 : 1
    const pressure = this.game?.runProfile?.spawnPressureMul || 1
    const stagePressure =
      this.game?.runSelection?.mode === 'expedition'
        ? 1 + ((this.game.expeditionStage || 1) - 1) * 0.05
        : 1
    return Math.max(
      0.2,
      (rand(0.4, 1.0) * introMul * Math.pow(0.92, this.wave - 1) * this._directorFactor()) /
        (pressure * stagePressure)
    )
  }

  _combatModifiers() {
    const profile = this.game?.runProfile || {}
    const stage =
      this.game?.runSelection?.mode === 'expedition' ? this.game.expeditionStage || 1 : 0
    const wave = getWaveModifiers(this.game?.runSelection, this.wave, stage)
    return { profile, wave }
  }

  _speedGrowth() {
    const endless = this.game?.runSelection?.mode === 'endless'
    const growthWave = endless ? Math.min(this.wave - 1, 24) : this.wave - 1
    return 1 + Math.max(0, growthWave) * 0.08
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

    const target = Math.min(120, 16 + this.wave * 7)
    if (this._enemies.length > target) factor *= 1.35
    else if (this._enemies.length < target * 0.42) factor *= 0.9

    const player = this.game?.player
    if (player) {
      const hpRatio = player.maxHp > 0 ? player.hp / player.maxHp : 1
      if (hpRatio < 0.35) factor *= 1.12
      else if (hpRatio > 0.8 && player.level > this.wave * 1.35) factor *= 0.93
    }
    return Math.max(0.68, Math.min(1.65, factor))
  }

  _rollType() {
    let roster = WAVE_ROSTERS[0].units
    for (const profile of WAVE_ROSTERS) {
      if (profile.min > this.wave) break
      roster = profile.units
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

    // 随机选一条视口边，坐标落在该边外侧
    const side = (Math.random() * 4) | 0
    let x = 0
    let y = 0
    if (side === 0) {
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

    // 命名波次使用对应的加权敌军编成；精英怪第 3 波起出现，概率随波次增长。
    const type = this._rollType()
    const { profile, wave } = this._combatModifiers()
    const baseEliteChance = 0.03 + this.wave * 0.01
    const eliteChance = Math.min(
      profile.eliteChanceCap || 0.12,
      baseEliteChance * (profile.eliteChanceMul || 1) + wave.eliteChanceBonus
    )
    const elite = this.wave >= 3 && Math.random() < eliteChance
    const affixes = this._rollAffixes(elite)

    const baseHp = 1 + ((Math.random() * 3) | 0) + Math.floor((this.wave - 1) / 2)
    const enemy = new Enemy({
      x,
      y,
      type,
      elite,
      affixes,
      // 波次成长曲线：每波速度 +8%、每 2 波基础生命 +1（职业/精英系数在 Enemy 内乘算）
      speed: rand(65, 110) * this._speedGrowth() * (profile.enemySpeedMul || 1),
      hp: baseHp * (profile.enemyHpMul || 1) * wave.enemyHpMul,
      rewardHp: baseHp,
      attackTempo: profile.attackTempoMul || 1,
    })
    enemy.attach(this.game)
    this._enemies.push(enemy)
  }

  /**
   * 在指定坐标生成敌人（Boss 召唤 / 召唤词缀用），受上限保护。
   * 阶段十三修复：复用 spawn 的波次成长公式（速度 +8%/波、生命 +1/2波），
   * 高波次下召唤兵不再是一碰就碎的第 1 波属性空气。
   */
  spawnAt(x, y, type = 'knight', options = {}) {
    if (this._enemies.length >= MAX_ENEMIES) return
    const elite = !!options.elite
    const { profile, wave } = this._combatModifiers()
    const baseHp = 1 + ((Math.random() * 3) | 0) + Math.floor((this.wave - 1) / 2)
    const enemy = new Enemy({
      x,
      y,
      type,
      elite,
      affixes: this._rollAffixes(elite, options.affix || null),
      speed: rand(65, 110) * this._speedGrowth() * (profile.enemySpeedMul || 1),
      hp: baseHp * (profile.enemyHpMul || 1) * wave.enemyHpMul,
      rewardHp: baseHp,
      attackTempo: profile.attackTempoMul || 1,
    })
    enemy.eventToken = options.eventToken || null
    enemy.attach(this.game)
    this._enemies.push(enemy)
    return enemy
  }

  /** 生成 Boss（每 5 波一次）：在玩家周围 420~620px 处登场 */
  spawnBoss(options = {}) {
    if (this._boss) return
    const types = ['boss-knight', 'boss-mage', 'boss-archer']
    const type = options.type || types[(Math.random() * 3) | 0]
    const player = this.game.player
    const a = Math.random() * TAU
    const d = 420 + Math.random() * 200
    const x = Math.max(0, Math.min(this.game.worldWidth, player.x + Math.cos(a) * d))
    const y = Math.max(0, Math.min(this.game.worldHeight, player.y + Math.sin(a) * d))
    const { profile, wave } = this._combatModifiers()
    const boss = new Boss({
      x,
      y,
      wave: this.wave,
      type,
      hpMultiplier: (profile.bossHpMul || 1) * wave.bossHpMul,
      speedMultiplier: profile.enemySpeedMul || 1,
      attackTempo: profile.attackTempoMul || 1,
      patternBonus: (profile.bossPatternBonus || 0) + wave.bossPatternBonus,
      finalBoss: !!options.finalBoss,
      expeditionBoss: !!options.expeditionBoss,
    })
    boss.attach(this.game)
    this._enemies.push(boss)
    this._boss = boss
    this.game.sound.bossRoar()
    this.game.shakeScreen(6, 0.35) // Boss 登场震撼（阶段十五美化）
    this.game.onBossSpawn?.(boss)
    this.game.dialogue?.sayBoss(boss, 'spawn')
    return boss
  }

  /** 限时模式终局：清掉普通敌人与敌方弹幕，只保留确定性的终局 Boss。 */
  beginFinale() {
    if (this._finale) return this._boss
    this._finale = true
    this._clearCombatants()
    this.wave = Math.max(25, this.wave)
    this._waveTimer = 0
    this._bossGrace = 0
    this._directorPhase = '终局审判'
    this._directorIntensity = 1
    return this.spawnBoss({ type: 'boss-final', finalBoss: true })
  }

  _clearCombatants() {
    for (const enemy of this._enemies) enemy.destroy()
    this._enemies.length = 0
    this._bullets.length = 0
    this._devouring.length = 0
    this._routing.length = 0
    this._boss = null
  }

  /** 远征换关：中立清场并恢复普通生成。 */
  prepareExpeditionStage() {
    this._clearCombatants()
    this._finale = false
    this._waveTimer = 0
    this._bossGrace = 0
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

  beginExpeditionBoss() {
    this._finale = true
    this._clearCombatants()
    this.wave = Math.max(20, this.wave)
    this._waveTimer = 0
    this._bossGrace = 0
    this._directorPhase = '王庭决战'
    this._directorIntensity = 1
    return this.spawnBoss({ type: 'boss-expedition', expeditionBoss: true })
  }

  update(dt) {
    // 玩家已死亡（gameOver 已触发，仅本帧残差）：停止敌人侧全部推进，
    // 防止死亡帧残差继续吞噬/击杀结算（结算快照之后的数据变动会丢失或重复）
    if (this.game.player.dead) return

    // 0) 波次推进：终局阶段冻结波次与普通生成。
    if (!this._finale) this._waveTimer += dt
    if (!this._finale && this._waveTimer >= WAVE_DURATION) {
      this._waveTimer -= WAVE_DURATION
      this.wave++
      this.game.sound.wave() // 波次切换号角
      if (this.wave % 5 === 0) {
        this._bossGrace = 4
        this._spawnTimer = Math.max(this._spawnTimer, this._nextInterval())
        this.spawnBoss() // 每 5 波：Boss 登场
      }
      // 叙事节点：进入命名波次时提示（反转剧情让玩家看见）
      if (WAVE_NAMES[this.wave]) {
        this.game.onWaveChanged?.(this.wave, WAVE_NAMES[this.wave])
      }
    }

    // 更新导演节拍，即使当前处于生成冷却，HUD/下一次间隔也能得到当前状态。
    if (!this._finale) this._directorFactor()

    // 1) 定时生成
    this._bossGrace = Math.max(0, this._bossGrace - dt)
    if (!this._finale && this._bossGrace <= 0) {
      this._spawnTimer -= dt
      if (this._spawnTimer <= 0) {
        this.spawn()
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
    for (const e of this._enemies) {
      if (!e.active) {
        hasDead = true
        if (e === this._boss) this._boss = null // Boss 阵亡，清除引用
      }
    }
    if (hasDead) this._enemies = this._enemies.filter((e) => e.active)
  }

  /** 吞噬检测：可吞噬的残血敌人进入玩家吸入口径时触发吞噬（一帧至多一个） */
  _checkDevour() {
    const player = this.game.player
    const reach = (player.radius + 12) * (player.devourRadiusBonus || 1.0) * (player.strainDevourRadius || 1)
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

  /** 开始吞噬：标记吸入 → 玩家膨胀脉冲 → 掉落/素材/文本结算（WeaponSystem 统一处理） */
  _startDevour(e) {
    e.devouring = true
    e._devourT = 0
    this._devouring.push(e)
    this.game.player._devourPulse = 0.3 // 果冻膨胀脉冲
    this.game.weaponSystem.onDevoured(e)
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
