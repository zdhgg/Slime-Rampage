import { Enemy } from './Enemy.js'
import { AssetManager } from '../AssetManager.js'
import { drawEnemyArt, drawEnemyShadow, enemyArtFeet, enemyArtTop, hasEnemyArt } from '../EnemyArtRenderer.js'
import { BOSS_CAST, bossArtId } from '../enemy-art/boss-cast.js'
import { bossSpecialGeometry, knightDash, archerTribunal, archerFan } from './bossGeometry.js'

const TAU = Math.PI * 2

const BOSS_CFG = {
  'boss-knight': {
    name: '骑士王 加洛特',
    speed: 55,
    radius: 36,
    range: 0,
    attackInterval: 1.6,
    damage: 3,
    special: '王者冲锋',
    phaseName: '血誓狂袭',
    // 登场名片：一行说清「他考什么、两档各加什么」，让 boss 名从标签变成预告
    briefing: '距离轴｜75% 双段裂地 · 25% 纯冲锋',
  },
  'boss-mage': {
    name: '大法师 梅林',
    speed: 45,
    radius: 34,
    range: 300,
    attackInterval: 2.8,
    damage: 2,
    special: '奥术环爆',
    phaseName: '奥术失控',
    briefing: '目标轴｜75% 三护卫护盾 · 25% 停止召唤',
  },
  'boss-archer': {
    name: '弓王 罗宾',
    speed: 60,
    radius: 34,
    range: 260,
    attackInterval: 2.2,
    damage: 2,
    special: '王庭三判',
    phaseName: '猎杀领域',
    briefing: '时间轴｜三判预判落点 · 25% 四判',
  },
  'boss-final': {
    name: '终审勇者 阿尔凯恩',
    speed: 58,
    radius: 40,
    range: 275,
    attackInterval: 1.9,
    damage: 3,
    special: '三圣裁决',
    phaseName: '终焉轮转',
    briefing: '三职轮转｜三问定赏罚 · 答对给 2s 破绽',
  },
  'boss-expedition': {
    name: '讨伐统帅 雷欧尼斯',
    speed: 60,
    radius: 40,
    range: 275,
    attackInterval: 1.85,
    damage: 3,
    special: '王庭战阵',
    phaseName: '统帅决意',
    briefing: '远征总分｜机制随关卡叠加',
  },
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

// 终局三问：预警 1.8s（比常规强招长，给够走位时间）、答对 2s 破绽、答错 2 点伤害
const QUIZ_TELEGRAPH = 1.8
const QUIZ_BREAK = 2
const QUIZ_PENALTY = 2

/**
 * 王级勇者：普通职业循环 + 可预判强招 + 半血第二阶段 + 强招后破绽。
 * 预警阶段锁定几何区域，执行时不再追踪玩家，确保走位能够可靠规避。
 */
export class Boss extends Enemy {
  constructor({
    x,
    y,
    wave,
    type,
    hpMultiplier = 1,
    speedMultiplier = 1,
    attackTempo = 1,
    patternBonus = 0,
    finalBoss = false,
    expeditionBoss = false,
  }) {
    const cfg = BOSS_CFG[type]
    // BOSS 耐久补强（BOSS 平衡 2026-11）：基础体量 60+8w → 100+10w，
    // 配合 RunRules 的限时档位前段抬升，目标实战中位 TTK 45~90 秒（原 10~30 秒太脆）
    const baseHp = 100 + wave * 10
    const encounterHpMul = finalBoss ? 1.35 : expeditionBoss ? 1.25 : 1
    const hp = Math.round(baseHp * hpMultiplier * encounterHpMul)
    super({ x, y, speed: cfg.speed, hp, type: 'knight' })
    this.type = type
    this.isBoss = true
    this.name = cfg.name
    this.briefing = cfg.briefing || ''
    this.speed = cfg.speed * speedMultiplier
    this.radius = cfg.radius
    this.range = cfg.range
    this.attackTempo = Math.max(0.1, attackTempo)
    this.attackInterval = cfg.attackInterval / this.attackTempo
    this.damage = cfg.damage
    this.maxHp = hp
    this.hp = hp
    this.expValue = Math.round(baseHp * encounterHpMul) * 3
    this.paletteKey = 'knight'
    this.wave = wave
    this.isFinalBoss = finalBoss || type === 'boss-final'
    this.isExpeditionBoss = expeditionBoss || type === 'boss-expedition'
    this.isCompositeBoss = this.isFinalBoss || this.isExpeditionBoss
    this.patternBonus = Math.max(0, Math.round(patternBonus))
    this.specialPattern = this.isCompositeBoss ? 'boss-knight' : type
    this._patternIndex = 0
    this.summonCd = 7.5

    this.phase = 1
    this.enraged = false
    this.phaseShift = 0
    this.specialCd = 3.2
    this.specialState = 'idle'
    this.specialTimer = 0
    this.specialDuration = 0
    this.lockedAngle = 0
    this.targetX = x
    this.targetY = y
    this.dashHit = false
    this.dashLaneRadius = this.radius + 38
    this.dashDistance = 650 * 0.42
    this.vulnerableTimer = 0
    this.stateLabel = '追猎'

    // —— 强招几何快照（telegraph 时冻结，execute 时读取；绘制同源） ——
    this._specialGeometry = null
    // —— 冲锋落点裂地：0.9s 的低速地面，逼玩家在近身与距离之间做取舍 ——
    this._rupture = null
    this._ruptureTier = 1 // 75% 之后升为双段
    this._ruptureOff = false // 25% 之后不再留地（纯冲锋节奏）
    // —— 法师的护卫层（目标轴）：每名存活护卫给本体 −20% 承伤，最多 3 层 ——
    this._guards = []
    // —— 弓王三判：按玩家速度外推的落点阶梯 ——
    this._tribunal = null
    this._volleyHit = false
    this._volleyFx = null
    // —— 终局三问（仅限时/无尽终局的终审勇者）：每打满三轮强招插一问 ——
    this._specialCount = 0
    this._quizIndex = 0
    this._quiz = null

    // —— 连击（二阶段质变）：强招连续释放，段数随难度档位提升 ——
    this._chainStep = 0
    this._chainTotal = 1
    this._chainDelay = 0.5
    // —— 血量阈值事件：75% 增援 / 25% 困兽之斗（半血二阶段仍走原路径） ——
    this._reinforced = false
    this._lastStand = false
    // —— 决斗圈（P0：仅限时第 5 波骑士王）：activate 时由 BossArena 挂接 ——
    this.duelArena = null
    this._duelRage = false
    this._duelChainBonus = 0

    this._walkT = Math.random() * 10
    this._moving = false
    this._spawnT = 0.35
    this._animClock = 0
    this._attackAnim = 0
    this._recoveryDuration = 0
  }

  get attackMove() {
    const cfg = BOSS_CFG[this.specialPattern] || BOSS_CFG[this.type]
    return Object.freeze({ id: this.specialPattern, name: cfg.special })
  }

  /** 首领美术 cast 键（`boss:*`）；未注册的 id 渲染时回退旧精灵。 */
  get artId() {
    return bossArtId(this)
  }

  /** Read-only presentation snapshot. Never advances combat or exposes mutable hit geometry. */
  get attackPresentation() {
    const stage = !this.active || this.hp <= 0 ? 'dead' : this.phaseShift > 0 ? 'phase' : this.specialState
    const move = this.attackMove
    let progress = 0
    if (stage === 'telegraph') progress = 1 - this.specialTimer / this.specialDuration
    else if (stage === 'dash' || stage === 'step') {
      progress = this._cast ? (this._cast.travel || 0) / this._cast.length
        : 1 - this.specialTimer / (this._specialGeometry?.lane?.duration || (0.42 + (this.dashChain || 0) * 0.06))
    } else if (stage === 'recover') progress = 1 - this.specialTimer / this._recoveryDuration
    else if (stage === 'chain') progress = 1 - this.specialTimer / (this._sequence ? .32 : this._chainDelay)
    return Object.freeze({
      id: stage === 'dead' || stage === 'phase' || stage === 'idle' ? null : move.id,
      name: move.name, stage,
      progress: Number.isFinite(progress) ? clamp(progress, 0, 1) : 0,
      clock: this._animClock, attackRemaining: this._attackAnim,
    })
  }

  _tickAnimation(dt, canAct) {
    if (!canAct || !this.active) return
    this._animClock += dt
    this._attackAnim = Math.max(0, this._attackAnim - dt)
  }

  /** Explicit interruption, shared by phase transitions, destruction and manager reset. */
  cancelAttack({ preserveVulnerability = false } = {}) {
    this.game?.enemyManager?.releaseBossCast?.(this)
    this.specialState = 'idle'
    this.specialTimer = this.specialDuration = this._recoveryDuration = 0
    if (!preserveVulnerability) this.vulnerableTimer = 0
    this._attackAnim = 0
    this.dashHit = false
    this.dashChain = 0
    this._specialAttackEvent = null
    this._specialGeometry = null
    this._tribunal = null
    this._volleyHit = false
    this._volleyFx = null
    this._quiz = null
    this._clearRupture()
    this._chainStep = 0
    this._chainTotal = 1
    this._moving = false
    this.stateLabel = '追猎'
    if (this.skillData) this.skillData = {}
    if (this._sequence) this._sequence = []
    if ('_cast' in this) this._cast = this._fx = null
    if ('_presentationMove' in this) this._presentationMove = null
  }

  destroy() {
    super.destroy()
    // Formation defeat settlement still reads the original vulnerability window.
    this.cancelAttack({ preserveVulnerability: true })
  }

  /** 强招后的破绽承伤倍率：躲完一整套机制的回报必须值得专门去抓（狂暴期 2.5×） */
  get vulnerableMultiplier() {
    return this._duelRage ? 2.5 : 1.8
  }

  get combatInfo() {
    const cfg = BOSS_CFG[this.type]
    const attack = this.attackPresentation
    return {
      phase: this.phase,
      phaseName: this.phase === 2 ? cfg.phaseName : '王级交锋',
      state: this.stateLabel,
      special: this.specialPattern === 'final-quiz'
        ? `${cfg.special} · ${this._quiz?.label || '审判'}`
        : this.isCompositeBoss ? `${cfg.special} · ${attack.name}` : attack.name,
      castProgress: attack.stage === 'telegraph' ? attack.progress : 0,
      vulnerable: this.active && this.hp > 0 && this.vulnerableTimer > 0,
    }
  }

  get positionLocked() {
    return this.phaseShift > 0 || this.specialState === 'telegraph' || this.specialState === 'dash'
  }

  hit(damage, effects = null) {
    const formationMul = damage > 0
      ? this.game?.enemyManager?.getBossDamageTakenMultiplier?.(this) || 1
      : 1
    const guardMul = damage > 0 ? this._guardMitigation() : 1
    const amplified = (this.vulnerableTimer > 0 && damage > 0
      ? damage * this.vulnerableMultiplier
      : damage) * formationMul * guardMul
    super.hit(amplified, effects)
    if (damage > 0) this._checkThresholdEvents()
  }

  /**
   * 目标轴（大法师）：每名存活护卫给他 −20% 承伤（最多 3 层）。
   * 于是「先拆还是先打」第一次成为真选择：不拆打不动，拆了环爆就改锁回你身上。
   */
  _guardMitigation() {
    if (this.type !== 'boss-mage' || this._guards.length === 0) return 1
    this._guards = this._guards.filter((guard) => guard && guard.active)
    if (this._guards.length === 0) return 1
    return 1 - 0.2 * Math.min(3, this._guards.length)
  }

  /** 距玩家最近的存活护卫（环爆的导流锚点） */
  _nearestGuardTo(target) {
    if (this.type !== 'boss-mage' || this._guards.length === 0) return null
    this._guards = this._guards.filter((guard) => guard && guard.active)
    if (this._guards.length === 0) return null
    let best = null
    let bestD = Infinity
    for (const guard of this._guards) {
      const d = (guard.x - target.x) ** 2 + (guard.y - target.y) ** 2
      if (d < bestD) { bestD = d; best = guard }
    }
    return best
  }

  /** 记录自己召来的护卫（只算本体召的，不把普通小兵算进护盾层） */
  _trackGuard(enemy) {
    if (!enemy || this.type !== 'boss-mage') return enemy
    this._guards.push(enemy)
    return enemy
  }

  /**
   * 血量阈值事件：把一场首领战切成 75% / 50% / 25% 三段结构，
   * 而不是只有半血一次转折。50% 仍走原有二阶段路径（保持既有手感与断言）。
   */
  _checkThresholdEvents() {
    if (this.hp <= 0) return
    const ratio = this.hp / this.maxHp
    if (!this._reinforced && ratio <= 0.75) {
      this._reinforced = true
      this._onReinforce()
    }
    if (!this._lastStand && ratio <= 0.25) {
      this._lastStand = true
      this._onLastStand()
    }
    // 决斗圈残血狂暴：与「困兽之斗」同为 25% 触发但相互独立，一次性永久生效
    if (!this._duelRage && ratio <= 0.25 && this.duelArena?.rageEnabled) {
      this._duelRage = true
      this._onDuelRage()
    }
  }

  /**
   * 决斗圈狂暴（25% 一次性永久）：体型 +8%、攻速 ×0.75、强招冷却 ×0.7、
   * 连段 +1（困难/地狱再 +1）、破绽窗口收窄但增伤加深；半径平滑收缩不再突然折半瞬缩。
   */
  _onDuelRage() {
    const difficulty = this.game.runProfile?.id || 'normal'
    this.radius *= 1.08
    this.attackInterval *= 0.75
    this.damage += 1
    this._duelChainBonus = difficulty === 'hard' || difficulty === 'hell' ? 2 : 1
    this.duelArena?.flash()
    this.game.enemyManager.addText(this.x, this.y - this.radius - 52, '狂血狂暴', null, '#ff5040', 17)
    this.game.sound.bossRoar()
    this.game.shakeScreen(6, 0.3)
  }

  /**
   * 75%：三种首领在这里第一次分道扬镳。
   *  - 骑士王：不叫护卫，把落点裂地升成「双段」，加的是地形而不是人头（距离轴）
   *  - 大法师：召 3 名护卫，直接喂给「目标轴」的护盾层（先拆还是先打）
   *  - 弓王与其他：维持两名护卫，不抢已有的节奏轴
   */
  _onReinforce() {
    const manager = this.game.enemyManager
    if (this.type === 'boss-knight' && !this.isExpeditionBoss) {
      this._ruptureTier = 2
      manager.addText(this.x, this.y - this.radius - 34, '地裂·双段', '冲锋落点将留下两道裂口', '#ff9c6e', 14)
      this.game.sound.enemyShoot()
      this.game.shakeScreen(3, 0.18)
      return
    }
    const count = this.type === 'boss-mage' ? 3 : 2
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * TAU + Math.random() * 0.6
      this._trackGuard(manager.spawnAt(
        clamp(this.x + Math.cos(angle) * 90, 24, this.game.worldWidth - 24),
        clamp(this.y + Math.sin(angle) * 90, 24, this.game.worldHeight - 24),
        'knight'
      ))
    }
    manager.addText(this.x, this.y - this.radius - 34, '召唤护卫', null, '#ffd166', 14)
    this.game.sound.enemyShoot()
    this.game.shakeScreen(3, 0.18)
  }

  /**
   * 25%：困兽之斗——攻速与移速再上一档，并立即缩短强招冷却。
   * 三种首领在这里第二次分道扬镳，让「最后 25%」不再是同一张模板：
   *  - 骑士王：不再留地，节奏变成纯冲锋（抢时间打掉他）
   *  - 大法师：停止召唤，护盾层只减不增（先拆的选择在这里兑现）
   */
  _onLastStand() {
    this.speed *= 1.12
    this.attackInterval *= 0.88
    this.specialCd = Math.min(this.specialCd, 1.6)
    if (this.type === 'boss-knight' && !this.isExpeditionBoss) {
      this._ruptureOff = true
      this._clearRupture()
      this.game.enemyManager.addText(this.x, this.y - this.radius - 34, '困兽之斗 · 不再留地', '纯冲锋节奏', '#ff7466', 15)
    } else if (this.type === 'boss-mage') {
      this.summonCd = Infinity
      this.game.enemyManager.addText(this.x, this.y - this.radius - 34, '困兽之斗 · 停止召唤', '护盾层只减不增', '#ff7466', 15)
    } else {
      this.game.enemyManager.addText(this.x, this.y - this.radius - 34, '困兽之斗', null, '#ff7466', 15)
    }
    this.game.sound.bossRoar()
    this.game.shakeScreen(4, 0.22)
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0 || !this.active) return
    const canAct = this._tickStatus(dt)
    this._tickAnimation(dt, canAct)
    this.vulnerableTimer = Math.max(0, this.vulnerableTimer - dt)
    if (this.hp <= 0) return
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) this._enterPhaseTwo()
    if (!canAct && this.phaseShift <= 0) return
    if (this.phaseShift > 0) {
      this.phaseShift -= dt
      this.stateLabel = BOSS_CFG[this.type].phaseName
      return
    }

    if (this.specialState === 'telegraph') {
      this.specialTimer -= dt
      if (this.specialTimer <= 0) this._executeSpecial()
      return
    }
    if (this.specialState === 'dash') {
      this._updateKnightDash(dt)
      return
    }
    if (this.specialState === 'chain') {
      // 连击间隙：短暂停顿后立刻接下一段（不给完整破绽窗口，末段才有）
      this.specialTimer -= dt
      this.stateLabel = `连击 · 第 ${this._chainStep + 1} 段`
      if (this.specialTimer <= 0) this._startSpecial()
      return
    }
    if (this.specialState === 'recover') {
      this.specialTimer -= dt
      this.stateLabel = '破绽暴露'
      if (this.specialTimer <= 0) {
        this.game.enemyManager.releaseBossCast?.(this)
        this.specialState = 'idle'
        this.stateLabel = '追猎'
      }
      return
    }

    const squadTempo = this.game.enemyManager.getBossTempoMultiplier?.(this) || 1
    this.specialCd -= dt * squadTempo
    if (this.specialCd <= 0) {
      this._startSpecial()
      return
    }

    this._updateStandardAttack(dt * squadTempo)
    if (this.duelArena?.active && !this.duelArena.dissolve) {
      const pos = this.duelArena.clampPosition(this.x, this.y, this.radius, 16)
      this.x = pos.x
      this.y = pos.y
    }
    if (this._moving) this._walkT += dt * 5
  }

  _enterPhaseTwo() {
    this.cancelAttack({ preserveVulnerability: true })
    this.phase = 2
    this.enraged = true
    this.phaseShift = 0.85
    this.specialState = 'idle'
    this.specialCd = Math.min(this.specialCd, 1.4)
    // 连击状态复位：转阶段可能发生在连段中途，残留段数会让二阶段错接旧连段
    this._chainStep = 0
    this._chainTotal = 1
    this.speed *= 1.25
    this.attackInterval *= 0.78
    this.summonCd = Math.min(this.summonCd, 3)
    this.freeze = 0
    this.slow = 0
    const cfg = BOSS_CFG[this.type]
    this.game.enemyManager.addText(this.x, this.y - this.radius - 18, '第二阶段', cfg.phaseName, '#ff7466', 16)
    this.game.dialogue?.sayBoss(this, 'phase')
    this.game.sound.bossRoar()
    this.game.shakeScreen(5, 0.28)
  }

  _startSpecial() {
    this._specialAttackEvent = { enemyAttack: true }
    const claimCast = this.game.enemyManager.claimBossCast
    if (claimCast && !claimCast.call(this.game.enemyManager, this)) {
      this.specialCd = 0.35
      return
    }
    // 二阶段质变：强招改为连击，段数随难度档位（patternBonus）提升——
    // 简单/普通 2 段，困难/地狱与深层无尽 3 段。这是难度档位的「行为差异」，
    // 而不只是数值差异（预警时间仍不缩短，保持公平底线）。
    if (this._chainStep === 0) {
      this._chainTotal = this.phase === 2
        ? (this.patternBonus >= 1 ? 3 : 2) + (this._duelRage ? this._duelChainBonus : 0)
        : 1
    }
    const p = this.game.player
    // 终局三问：三段轮转之后插一问，奖励是「答对了才有的破绽」，而不是白送
    if (this._chainStep === 0) this._specialCount += 1
    const quizTurn = this.isFinalBoss
      && !this.isExpeditionBoss
      && this._chainStep === 0
      && this._specialCount > 0
      && this._specialCount % 4 === 0
    if (quizTurn) {
      this.specialPattern = 'final-quiz'
      this._chainTotal = 1
      this._quiz = this._buildQuiz()
      this._specialGeometry = Object.freeze({ pattern: 'final-quiz', phase: this.phase, chain: 0, telegraph: QUIZ_TELEGRAPH })
      this.specialDuration = QUIZ_TELEGRAPH
      this.specialTimer = QUIZ_TELEGRAPH
      this.lockedAngle = Math.atan2(p.y - this.y, p.x - this.x)
      this.targetX = p.x
      this.targetY = p.y
      this.specialState = 'telegraph'
      this._tribunal = null
      this.stateLabel = `终局审判 · ${this._quiz.label}`
      this.game.enemyManager?.addText?.(this.x, this.y - this.radius - 26,
        `第 ${this._quiz.round}/3 问 · ${this._quiz.label}`, this._quiz.hint, '#e8c477', 14)
      this.game.sound.enemyShoot()
      return
    }
    if (this.isCompositeBoss) {
      const patterns = ['boss-knight', 'boss-mage', 'boss-archer']
      this.specialPattern = patterns[this._patternIndex++ % patterns.length]
    } else {
      this.specialPattern = this.type
    }
    this.specialState = 'telegraph'
    // 难度只增强招式内容与冷却，不缩短预警时间；几何统一由 bossSpecialGeometry 给出，
    // 绘制与命中读同一份快照（含连段抬升的道宽/道远/弹数/扇角）。
    this.dashLaneRadius = this.radius + p.radius + 12
    this._specialGeometry = bossSpecialGeometry({
      pattern: this.specialPattern,
      phase: this.phase,
      chain: this._chainStep,
      patternBonus: this.patternBonus,
      laneRadius: this.dashLaneRadius,
    })
    this.specialDuration = this._specialGeometry.telegraph
    this.specialTimer = this.specialDuration
    this.lockedAngle = Math.atan2(p.y - this.y, p.x - this.x)
    this.targetX = p.x
    this.targetY = p.y
    this.dashDistance = this._specialGeometry.lane ? this._specialGeometry.lane.distance : 0
    if (this.dashDistance > 0 && this.duelArena?.active && !this.duelArena.dissolve) {
      this.dashDistance = this.duelArena.clipRayLength(this.x, this.y, this.lockedAngle, this.dashDistance, this.radius, 18)
    }
    // —— 目标轴：环爆圆心改锁「离你最近的存活护卫」，没有护卫才落回你的脚边 ——
    if (this.specialPattern === 'boss-mage') {
      const guard = this._nearestGuardTo(p)
      if (guard) {
        this.targetX = guard.x
        this.targetY = guard.y
      }
    }
    // —— 时间轴：三判按此刻的速度外推落点，预警开始即冻结（不追着你滑动） ——
    if (this.specialPattern === 'boss-archer') {
      const lead = this._specialGeometry.judgement.leads
      const leads = this._lastStand ? [...lead, lead[lead.length - 1] + 0.8] : lead
      this._tribunal = archerTribunal(p.x, p.y, p.vx || 0, p.vy || 0, {
        leads,
        radius: this._specialGeometry.judgement.radius,
      })
      // 落点夹在场内：预判跑出场外时那一发直接打在墙外，不该变成"墙外也中"
      for (const pt of this._tribunal.points) {
        pt.x = clamp(pt.x, 24, this.game.worldWidth - 24)
        pt.y = clamp(pt.y, 24, this.game.worldHeight - 24)
      }
      this._volleyHit = false
    } else {
      this._tribunal = null
    }
    this._moving = false
    const chainLabel = this._chainTotal > 1 ? `（连击 ${this._chainStep + 1}/${this._chainTotal}）` : ''
    this.stateLabel = `蓄力 · ${this.attackMove.name}${chainLabel}`
    this.game.sound.enemyShoot()
  }

  /**
   * 终局三问的题面：三道题对应「站在哪」的三种读法——
   * 环（里或外）→ 象限（唯一没被封的那格）→ 棋盘（第几道同心带）。
   * 题面在预警时冻结（q.x/q.y 是他出题时的位置），不追着玩家改答案。
   */
  _buildQuiz() {
    const round = (this._quizIndex % 3) + 1
    const kindIdx = this._quizIndex % 3
    this._quizIndex += 1
    const base = { round, x: this.x, y: this.y, born: this.game.elapsed }
    if (kindIdx === 0) {
      return {
        ...base,
        kind: 'annulus',
        label: '净化之环',
        hint: '站进环心，或干脆跑出环外',
        coreRadius: 150,
        hazardRadius: 330,
      }
    }
    if (kindIdx === 1) {
      return {
        ...base,
        kind: 'quadrant',
        label: '封印四象限',
        hint: '只有一格没被封住',
        safeQuadrant: Math.floor(Math.random() * 4),
        radius: 360,
      }
    }
    return {
      ...base,
      kind: 'chess',
      label: '王庭棋盘',
      hint: '站到亮着的那一道带',
      bands: [120, 240, 360],
      safeBand: 1,
    }
  }

  /** 判题：玩家当前位置是否落在安全区（与绘制共用同一份题面数据） */
  _quizCorrect(px, py) {
    const q = this._quiz
    if (!q) return false
    const dx = px - q.x
    const dy = py - q.y
    const dist = Math.hypot(dx, dy)
    if (q.kind === 'annulus') return dist <= q.coreRadius || dist > q.hazardRadius
    if (q.kind === 'quadrant') {
      const angle = Math.atan2(dy, dx)
      const idx = Math.floor((((angle + Math.PI) % TAU) / (Math.PI / 2)))
      return idx === q.safeQuadrant
    }
    return dist >= q.bands[q.safeBand - 1] && dist < q.bands[q.safeBand]
  }

  _executeSpecial() {
    // 连击逐段强化：同一场战斗里动作模式随段数变化，而不是简单重复。
    // 所有几何取自 _startSpecial 冻结的快照，绘制与结算不会各算一遍。
    const chain = this._chainStep
    const geo = this._specialGeometry
    if (this.specialPattern === 'final-quiz') {
      const p = this.game.player
      const ok = this._quizCorrect(p.x, p.y)
      this.specialState = 'recover'
      if (ok) {
        // 答对才给破绽：2s、承伤 ×1.8（决斗圈狂暴期 ×2.5 仍按原规则叠）
        this.specialTimer = QUIZ_BREAK
        this._recoveryDuration = QUIZ_BREAK
        this.vulnerableTimer = QUIZ_BREAK
        this.game.enemyManager?.addText?.(this.x, this.y - this.radius - 26, '答对', `破绽 ${QUIZ_BREAK}s · 承伤 ×1.8`, '#ffe3a2', 15)
        this.game.sound.bossRoar?.()
      } else {
        // 答错只扣血，不给破绽（不能靠乱答换输出窗口）
        this.specialTimer = 1
        this.vulnerableTimer = 0
        p.hit(QUIZ_PENALTY, this._specialAttackEvent ||= { enemyAttack: true })
        this.game.enemyManager?.addText?.(this.x, this.y - this.radius - 26, '答错', '无破绽', '#ff7466', 15)
      }
      this._quiz = null
      this.game.shakeScreen(3, 0.18)
      return
    }
    if (this.specialPattern === 'boss-knight') {
      this.specialState = 'dash'
      const dashSpeed = (this.phase === 2 ? 760 : 650) + chain * 90
      const baseDur = geo?.lane?.duration ?? knightDash(this.phase, chain).duration
      this.specialTimer = this.dashDistance > 0 ? Math.min(baseDur, this.dashDistance / dashSpeed) : 0.05
      this.dashHit = false
      this.dashChain = chain // 供 _updateKnightDash 读取（段数越高冲得越远越快）
      this.stateLabel = chain > 0 ? `${this.attackMove.name} · 第 ${chain + 1} 段` : this.attackMove.name
      return
    }

    if (this.specialPattern === 'boss-mage') {
      const p = this.game.player
      const burst = geo?.burst ?? { radius: 102, count: 12, bulletSpeed: 285 }
      if ((p.x - this.targetX) ** 2 + (p.y - this.targetY) ** 2 <= burst.radius * burst.radius) {
        p.hit(2, this._specialAttackEvent ||= { enemyAttack: true })
      }
      for (let i = 0; i < burst.count; i++) {
        this.game.enemyManager.spawnBullet(
          this.targetX,
          this.targetY,
          (i / burst.count) * TAU,
          'mage',
          { speed: burst.bulletSpeed, radius: 8, isBoss: true, damage: 2 }
        )
      }
      this.game.shakeScreen(4, 0.2)
      this._beginRecovery(1.15)
      return
    }

    // 王庭三判：三个预判落点同时开火。站桩三点叠在脚下、直线跑撞上第二点，
    // 只有改变方向才三点全空——「别按他以为的路线跑」就是弓王的答案。
    // 一次施放最多结算一次，避免站桩时被三点各打一次。
    const trib = this._tribunal
    const p = this.game.player
    if (trib && !this._volleyHit) {
      for (const pt of trib.points) {
        if ((p.x - pt.x) ** 2 + (p.y - pt.y) ** 2 <= trib.radius * trib.radius) {
          p.hit(2, this._specialAttackEvent ||= { enemyAttack: true })
          this._volleyHit = true
          break
        }
      }
    }
    // 落箭闪光：事后读法——告诉玩家「他刚才以为你会在这里」
    this._volleyFx = trib
      ? trib.points.map((pt) => ({ x: pt.x, y: pt.y, radius: trib.radius, born: this.game.elapsed, until: this.game.elapsed + 0.32, duration: 0.32 }))
      : null
    this.game.shakeScreen(3, 0.16)
    this._beginRecovery(0.95)
  }

  _updateKnightDash(dt) {
    const chain = this.dashChain || 0
    const speed = (this.phase === 2 ? 760 : 650) + chain * 90
    this.x += Math.cos(this.lockedAngle) * speed * dt
    this.y += Math.sin(this.lockedAngle) * speed * dt
    this.x = clamp(this.x, this.radius, this.game.worldWidth - this.radius)
    this.y = clamp(this.y, this.radius, this.game.worldHeight - this.radius)
    if (this.duelArena?.active && !this.duelArena.dissolve) {
      const pos = this.duelArena.clampPosition(this.x, this.y, this.radius, 16)
      this.x = pos.x
      this.y = pos.y
    }
    this.specialTimer -= dt
    const p = this.game.player
    // 道宽取预警快照，狂暴期体型变化不会让「已画好的道」和「正在算的命中」错位
    const hitRadius = this._specialGeometry?.lane?.halfWidth ?? (this.radius + p.radius + 12)
    if (!this.dashHit && (p.x - this.x) ** 2 + (p.y - this.y) ** 2 <= hitRadius * hitRadius) {
      // 冲锋命中 4 点（原 3）：BOSS 威胁补强后，撞中一次的代价配得上 0.72s 的预警
      p.hit(4 + Math.floor(this.patternBonus / 2) + chain + (this._duelRage ? 1 : 0), this._specialAttackEvent ||= { enemyAttack: true })
      this.dashHit = true
    }
    if (this.specialTimer <= 0) {
      this.game.shakeScreen(4, 0.18)
      this._spawnRupture() // 落点裂地：把「他停下的地方」变成接下来 0.9s 的劣地
      this._duelPincer() // 决斗夹击：冲锋落地瞬间的无预警扇形击退波（仅决斗圈骑士王）
      this._beginRecovery(1.2)
    }
  }

  /**
   * 落点裂地（P0 · 骑士王的距离轴）：冲锋落地的地面裂开 0.9 秒，
   * 站在裂口上移动速度 ×0.7。零伤害——它不要求玩家「躲」，而是给
   * 「贴脸收尾」标价：想在下一次连段前回到近身位，路是变慢的。
   * 与法师（要拉远）、弓手（要持续移动）形成三种不同的站位代价。
   */
  _spawnRupture() {
    if (this.type !== 'boss-knight' || this.isExpeditionBoss) return
    if (this._ruptureOff) return // 25% 之后：不再留地，节奏变成纯冲锋
    const radius = 86
    const slow = 0.7
    const life = 0.9
    const tier = Math.max(1, this._ruptureTier)
    // 双段：沿冲锋方向前后各裂一道（间距 168 ≈ 两块半径 86 相切），
    // 把「他停下的地方」拼成一条 340px 的劣地带，而不是两个孤立的圆。
    for (let i = 0; i < tier; i++) {
      const back = i * 168
      const seg = {
        x: clamp(this.x - Math.cos(this.lockedAngle) * back, 24, this.game.worldWidth - 24),
        y: clamp(this.y - Math.sin(this.lockedAngle) * back, 24, this.game.worldHeight - 24),
        radius,
        slow,
        born: this.game.elapsed,
        until: this.game.elapsed + life,
        duration: life,
      }
      // 回指不可枚举：它只是「谁造的这块地」的存活查询柄，不属于战斗状态，
      // 不应被状态快照（structuredClone）顺着摸回 game/canvas。
      Object.defineProperty(seg, 'source', { value: this, enumerable: false, configurable: true })
      if (i === 0) this._clearRupture()
      this._rupture = seg
      this.game.enemyManager?.addBossField?.(seg)
    }
    // 首段才飘字：连段 2~3 段连续落地时不刷屏，但第一次一定把规则说清楚
    if (this.dashChain === 0) {
      this.game.enemyManager?.addText?.(this.x, this.y - this.radius - 26,
        tier > 1 ? '地裂·双段' : '地裂', '移速 ×0.7 · 0.9s', '#ff9c6e', 13)
    }
    this.game.sound.enemyShoot()
    this.game.shakeScreen(3, 0.16)
  }

  /** 裂地提前收场（死亡/打断/切阶段）：地面立刻恢复正常，不留隐形减速 */
  _clearRupture() {
    // 双段会有多块地，一次全清（_rupture 只记最后一块，管理器持有全部）
    this.game?.enemyManager?.clearBossFields?.(this)
    this._rupture = null
  }

  /** 裂地读法：一圈焦土 + 内圈裂缝，颜色随剩余寿命衰减（越淡越快结束） */
  _renderRupture(ctx) {
    const fields = this.game.enemyManager?._bossFields
    if (!fields || fields.length === 0) return
    const t = this.game.elapsed
    for (const seg of fields) {
      if (seg.source !== this) continue
      if (t >= seg.until) continue // 到期由管理器回收，渲染只读、不改状态
      const k = Math.max(0, (seg.until - t) / seg.duration)
      ctx.save()
      ctx.beginPath()
      ctx.arc(seg.x, seg.y, seg.radius, 0, TAU)
      ctx.fillStyle = `rgba(255, 96, 58, ${0.10 * k})`
      ctx.fill()
      ctx.strokeStyle = `rgba(255, 150, 96, ${0.55 * k})`
      ctx.lineWidth = 2.5
      ctx.stroke()
      // 八条向内延伸的裂缝
      ctx.strokeStyle = `rgba(255, 120, 70, ${0.45 * k})`
      ctx.lineWidth = 1.6
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + (this._artSeed || 0)
        const r0 = seg.radius * 0.34
        const r1 = seg.radius * 0.94
        ctx.beginPath()
        ctx.moveTo(seg.x + Math.cos(a) * r0, seg.y + Math.sin(a) * r0)
        ctx.lineTo(seg.x + Math.cos(a + 0.12) * ((r0 + r1) * 0.5), seg.y + Math.sin(a + 0.12) * ((r0 + r1) * 0.5))
        ctx.lineTo(seg.x + Math.cos(a) * r1, seg.y + Math.sin(a) * r1)
        ctx.stroke()
      }
      ctx.restore()
    }
  }

  /**
   * 决斗夹击（P0）：冲锋落地瞬间追加 120° 扇形击退波——无预警、沿冲锋方向、
   * 伤害固定 2（不吃狂暴加成）、半径 200。横向预判走位或位移技（暗影影袭、
   * 超载震荡击退等）可在落地帧离开扇形，是明确的反制窗口。
   */
  _duelPincer() {
    if (this.type !== 'boss-knight' || !this.duelArena?.pincerEnabled) return
    const p = this.game.player
    const radius = 200
    const halfAngle = Math.PI / 3 // 120° 扇形
    // 短促的落地扇形闪光（无预警，靠节奏预判：冲锋停 = 夹击来）
    this._pincerFx = { angle: this.lockedAngle, until: this.game.elapsed + 0.3, duration: 0.3 }
    this.game.sound.enemyShoot()
    const dx = p.x - this.x
    const dy = p.y - this.y
    const dist = Math.hypot(dx, dy)
    if (dist > radius + p.radius) return
    let diff = Math.atan2(dy, dx) - this.lockedAngle
    diff = Math.atan2(Math.sin(diff), Math.cos(diff))
    if (Math.abs(diff) > halfAngle) return
    if (!p.hit(2, { enemyAttack: true })) return
    // 击退：沿远离 BOSS 方向推开（出圈有 0.8s 宽限兜底，不会直接被灼烧判死）
    if (!p.dead && dist > 0) {
      const push = 130
      p.x = clamp(p.x + (dx / dist) * push, p.radius, this.game.worldWidth - p.radius)
      p.y = clamp(p.y + (dy / dist) * push, p.radius, this.game.worldHeight - p.radius)
    }
  }

  /**
   * 连击推进（基类与远征首领共用）：
   *  - 还有后续段：进入短暂间隙（无破绽窗口）并返回 { continuing: true }
   *  - 连击打完：复位段数并返回 { continuing: false, steps }，由调用方结算破绽窗口
   */
  _advanceChain() {
    if (this._chainStep < this._chainTotal - 1) {
      this._chainStep++
      this.specialState = 'chain'
      this.specialTimer = this._chainDelay
      this.vulnerableTimer = 0
      this.stateLabel = `连击 · 第 ${this._chainStep + 1} 段`
      return { continuing: true, steps: this._chainTotal }
    }
    const steps = this._chainTotal
    this._chainStep = 0
    this._chainTotal = 1
    return { continuing: false, steps }
  }

  /** 破绽窗口时长：基础值 + 收尾余量 + 每多一段连击追加，连段越长回报越高（狂暴期收窄至 0.8s 起） */
  _chainBreakWindow(duration, steps) {
    if (this._duelRage) return 0.8 + Math.max(0, steps - 1) * 0.2
    return duration + 0.4 + Math.max(0, steps - 1) * 0.35
  }

  /**
   * 强招收尾：连击未打完则进入短暂间隙并接下一段，打满后才给完整破绽窗口。
   * 破绽窗口随段数递增（连段越长，收尾回报越高）——「躲完整套 → 抓破绽爆发」成立。
   */
  _beginRecovery(duration) {
    const chain = this._advanceChain()
    if (chain.continuing) return
    this.specialState = 'recover'
    const breakWindow = this._chainBreakWindow(duration, chain.steps)
    this.specialTimer = breakWindow
    this._recoveryDuration = breakWindow
    this.vulnerableTimer = breakWindow
    this.stateLabel = '破绽暴露'
    const pattern = this.specialPattern || this.type
    const baseCd = pattern === 'boss-mage' ? 6 : pattern === 'boss-archer' ? 5.4 : 5
    this.specialCd = baseCd * (this.phase === 2 ? 0.76 : 1) * (this._duelRage ? 0.7 : 1) / this.attackTempo
  }

  _updateStandardAttack(dt) {
    const player = this.game.player
    const dx = player.x - this.x
    const dy = player.y - this.y
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    this.facing = Math.atan2(dy, dx)
    const ux = dx / dist
    const uy = dy / dist
    const spd = this.speed * (this.slow > 0 ? 0.6 : 1)
    this._moving = false

    if (this.type === 'boss-knight') {
      this.stateLabel = this.phase === 2 ? '狂袭逼近' : '重甲逼近'
      const stopDist = this.radius + player.radius + 6
      if (dist > stopDist) {
        this.x += ux * spd * dt
        this.y += uy * spd * dt
        this._moving = true
      } else {
        this.attackCd -= dt
        if (this.attackCd <= 0) {
          this.attackCd = this.attackInterval
          player.hit(this.damage, { enemyAttack: true })
        }
      }
      return
    }

    const retreat = this.range * 0.5
    if (dist > this.range) {
      this.x += ux * spd * dt
      this.y += uy * spd * dt
      this._moving = true
    } else if (dist < retreat) {
      this.x -= ux * spd * 0.8 * dt
      this.y -= uy * spd * 0.8 * dt
      this._moving = true
    } else {
      this.attackCd -= dt
      if (this.attackCd <= 0) {
        this.attackCd = this.attackInterval
        const count = this.type === 'boss-mage'
          ? (this.phase === 2 ? 5 : 3)
          : (this.phase === 2 ? 7 : 5)
        const step = this.type === 'boss-mage' ? 0.15 : 0.22
        const fan = this.type === 'boss-mage' ? null : archerFan(this.phase, 0, this.patternBonus)
        const shots = fan ? fan.count : count
        const gap = fan ? fan.step : step
        for (let i = 0; i < shots; i++) {
          const off = (i - (shots - 1) / 2) * gap
          this.game.enemyManager.spawnBullet(this.x, this.y, this.facing + off, this.type === 'boss-mage' ? 'mage' : 'archer', { isBoss: true, damage: 2 })
        }
        this.game.sound.enemyShoot()
      }
    }

    if (this.type === 'boss-mage') {
      this.stateLabel = '奥术施压'
      this.summonCd -= dt
      if (this.summonCd <= 0) {
        this.summonCd = this.phase === 2 ? 6 : 8
        const count = this.phase === 2 ? 3 : 2
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * TAU
          this._trackGuard(this.game.enemyManager.spawnAt(this.x + Math.cos(angle) * 60, this.y + Math.sin(angle) * 60, 'knight'))
        }
      }
    } else {
      this.stateLabel = '游猎压制'
    }
  }

  _renderTelegraph(ctx) {
    if (this.specialState !== 'telegraph') return
    const progress = this.specialDuration > 0 ? 1 - this.specialTimer / this.specialDuration : 0
    ctx.save()
    ctx.fillStyle = 'rgba(224, 68, 68, 0.14)'
    ctx.strokeStyle = 'rgba(255, 116, 102, 0.9)'
    ctx.lineWidth = 2

    if (this.specialPattern === 'final-quiz') {
      // 题面：安全区用冷色（站这里），危险区用红色（别站），与判题读同一份 q
      const q = this._quiz
      if (!q) { ctx.restore(); return }
      const safeFill = `rgba(120, 200, 255, ${0.10 + 0.14 * progress})`
      const safeLine = 'rgba(150, 215, 255, 0.95)'
      const dangerFill = `rgba(224, 68, 68, ${0.12 + 0.18 * progress})`
      const dangerLine = 'rgba(255, 116, 102, 0.9)'
      if (q.kind === 'annulus') {
        ctx.beginPath()
        ctx.arc(q.x, q.y, q.coreRadius, 0, TAU)
        ctx.fillStyle = safeFill
        ctx.fill()
        ctx.strokeStyle = safeLine
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(q.x, q.y, q.hazardRadius, 0, TAU)
        ctx.arc(q.x, q.y, q.coreRadius, 0, TAU, true)
        ctx.fillStyle = dangerFill
        ctx.fill()
        ctx.strokeStyle = dangerLine
        ctx.lineWidth = 1.6
        ctx.stroke()
      } else if (q.kind === 'quadrant') {
        for (let i = 0; i < 4; i++) {
          const a0 = -Math.PI + i * Math.PI / 2
          ctx.beginPath()
          ctx.moveTo(q.x, q.y)
          ctx.arc(q.x, q.y, q.radius, a0, a0 + Math.PI / 2)
          ctx.closePath()
          ctx.fillStyle = i === q.safeQuadrant ? safeFill : dangerFill
          ctx.fill()
          ctx.strokeStyle = i === q.safeQuadrant ? safeLine : dangerLine
          ctx.lineWidth = 1.6
          ctx.stroke()
        }
      } else {
        // 三道具名同心环带：第 0 道是实心圆，其余用「外圆 + 内圆反向」挖成环，
        // 否则后一道会整块盖住前一道（画出来只剩最外圈一种颜色）
        const bands = q.bands
        for (let i = 0; i < 3; i++) {
          ctx.beginPath()
          ctx.arc(q.x, q.y, bands[i], 0, TAU)
          if (i > 0) ctx.arc(q.x, q.y, bands[i - 1], 0, TAU, true)
          ctx.fillStyle = i === q.safeBand - 1 ? safeFill : dangerFill
          ctx.fill()
          ctx.strokeStyle = i === q.safeBand - 1 ? safeLine : dangerLine
          ctx.lineWidth = 1.6
          ctx.stroke()
        }
        ctx.setLineDash([8, 6])
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(q.x, q.y, bands[2] + 22, 0, TAU)
        ctx.stroke()
        ctx.setLineDash([])
      }
      // 中心读条：题目本身也有倒计时
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(q.x, q.y, 40, -Math.PI / 2, -Math.PI / 2 + TAU * progress)
      ctx.stroke()
    } else if (this.specialPattern === 'boss-knight') {
      ctx.translate(this.x, this.y)
      ctx.rotate(this.lockedAngle)
      ctx.fillRect(0, -this.dashLaneRadius, this.dashDistance, this.dashLaneRadius * 2)
      ctx.strokeRect(0, -this.dashLaneRadius, this.dashDistance, this.dashLaneRadius * 2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
      ctx.fillRect(0, -2, this.dashDistance * progress, 4)
    } else if (this.specialPattern === 'boss-mage') {
      const radius = 102
      ctx.beginPath()
      ctx.arc(this.targetX, this.targetY, radius, 0, TAU)
      ctx.fill()
      ctx.stroke()
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(this.targetX, this.targetY, radius - 8, -Math.PI / 2, -Math.PI / 2 + TAU * progress)
      ctx.stroke()
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(this.targetX - 16, this.targetY)
      ctx.lineTo(this.targetX + 16, this.targetY)
      ctx.moveTo(this.targetX, this.targetY - 16)
      ctx.lineTo(this.targetX, this.targetY + 16)
      ctx.stroke()
    } else {
      // 三判：把「他以为你会跑到的三个位置」画成三圈落点，并用虚线串成路线。
      // 预警开始就冻结，所以这是一条可以绕开的假路线，不是追踪弹。
      const trib = this._tribunal
      if (!trib) { ctx.restore(); return }
      // 轨迹虚线：先画线，避免压住圆
      ctx.save()
      ctx.setLineDash([6, 5])
      ctx.strokeStyle = 'rgba(255, 150, 120, 0.45)'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      trib.points.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y)
        else ctx.lineTo(pt.x, pt.y)
      })
      ctx.stroke()
      ctx.restore()
      for (let i = 0; i < trib.points.length; i++) {
        const pt = trib.points[i]
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, trib.radius, 0, TAU)
        ctx.fillStyle = `rgba(224, 68, 68, ${0.09 + 0.16 * progress})`
        ctx.fill()
        ctx.strokeStyle = 'rgba(255, 116, 102, 0.88)'
        ctx.lineWidth = 1.8
        ctx.stroke()
        // 收缩的内圈＝倒计时
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, trib.radius - 7, -Math.PI / 2, -Math.PI / 2 + TAU * progress)
        ctx.stroke()
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(pt.x - 8, pt.y)
        ctx.lineTo(pt.x + 8, pt.y)
        ctx.moveTo(pt.x, pt.y - 8)
        ctx.lineTo(pt.x, pt.y + 8)
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  /**
   * 首领美术姿态输入：全部来自已有战斗时钟与 attackPresentation（冻结只读快照），
   * 渲染不得写入任何战斗状态。
   */
  _artState() {
    const attack = this.attackPresentation
    const ranged = this.type === 'boss-mage' || this.type === 'boss-archer'
    const st = {
      walkT: this._walkT + this._artSeed, // 弧度；+种子相位错开同屏步伐
      moving: this._moving,
      time: this.game.elapsed,
      seed: this._artSeed,
      sizeMul: 1, // 首领是独一无二个体：不要体型抖动
      enraged: this.enraged,
      hurt: this.flash > 0 ? Math.min(1, this.flash / 0.12) : 0,
      swing: -1,
    }
    if (this.phaseShift > 0) st.stance = 'roar'
    else if (attack.stage === 'recover') st.stance = 'recover'
    else if (attack.stage === 'telegraph' || attack.stage === 'chain') {
      st.windup = true
      if (ranged) st.casting = 'charge'
    } else if (attack.stage === 'dash' || attack.stage === 'step') {
      st.swing = attack.progress
      if (attack.stage === 'dash') st.stance = 'dashing'
      if (ranged) st.casting = 'fire'
    }
    // 边防官出手即闪（_attackAnim 结算后 0.48s 的释放帧）
    if (attack.attackRemaining > 0 && attack.stage !== 'telegraph') st.swing = 1 - attack.attackRemaining / 0.48
    // 普攻窗口（站定才递减冷却）：临近出手抬武器、刚出手跟斩击帧
    if (st.swing < 0 && !st.windup && !this._moving && this.attackCd > 0) {
      const since = this.attackInterval - this.attackCd
      if (since >= 0 && since < 0.18) {
        st.swing = since / 0.18
        if (ranged) st.casting = 'fire'
      } else if (this.attackCd < (this.type === 'boss-knight' ? 0.3 : 0.4)) {
        st.windup = true
        if (ranged) st.casting = 'charge'
      }
    }
    return st
  }

  render(ctx) {
    if (!this.active || this.hp <= 0) return
    const r = this.radius
    const t = this.game.elapsed
    const assets = AssetManager.getInstance()
    const artId = this.artId
    const hasArt = !!artId && hasEnemyArt(artId)
    const cast = hasArt ? BOSS_CAST[artId] : null
    const top = hasArt ? enemyArtTop(artId, r) : r
    this._renderTelegraph(ctx)
    this._renderRupture(ctx)

    // 决斗夹击落地闪光：无预警招式的事后读法——短促扇形让玩家记住「冲锋停 = 夹击来」
    if (this._pincerFx && t < this._pincerFx.until) {
      const fx = this._pincerFx
      const fade = (fx.until - t) / fx.duration
      ctx.save()
      ctx.fillStyle = `rgba(255, 132, 74, ${0.34 * fade})`
      ctx.strokeStyle = `rgba(255, 190, 130, ${0.7 * fade})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(this.x, this.y)
      ctx.arc(this.x, this.y, 200, fx.angle - Math.PI / 3, fx.angle + Math.PI / 3)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }

    const auraPulse = 0.5 + 0.5 * Math.sin(t * 2.5)
    const feet = hasArt ? enemyArtFeet(artId, r) : r * 0.85

    // 王者气场与狂暴红环：压成贴地椭圆铺在脚线上，不再盖住身体
    const auraRx = r * (1.7 + auraPulse * 0.3)
    ctx.fillStyle = this.enraged
      ? `rgba(255, 70, 50, ${0.12 + auraPulse * 0.1})`
      : `rgba(255, 209, 102, ${0.08 + auraPulse * 0.08})`
    ctx.beginPath()
    ctx.ellipse(this.x, this.y + feet, auraRx, auraRx * 0.42, 0, 0, TAU)
    ctx.fill()
    if (this.enraged) {
      const ringRx = auraRx + 4 + auraPulse * 3
      ctx.strokeStyle = `rgba(255, 60, 40, ${0.4 + auraPulse * 0.4})`
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.ellipse(this.x, this.y + feet, ringRx, ringRx * 0.42, 0, 0, TAU)
      ctx.stroke()
    }

    // 出生弹入缩放（easeOutBack），地面阴影同步缩放
    let spawnScale = 1
    if (this._spawnT > 0) {
      const k = 1 - this._spawnT / 0.35
      const c1 = 1.70158
      const c3 = c1 + 1
      spawnScale = 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2)
    }

    // 悬浮首领离地漂浮（信标术士等），影子随之缩小
    const floating = !!cast?.floats
    const hover = floating ? (0.12 + 0.06 * Math.sin(t * 3 + this._walkT + this._artSeed)) * r : 0

    if (hasArt) drawEnemyShadow(ctx, artId, this.x, this.y, r, { lift: hover, scale: spawnScale })
    else {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.26)'
      ctx.beginPath()
      ctx.ellipse(this.x, this.y + feet + 1, r, r * 0.26, 0, 0, TAU)
      ctx.fill()
    }

    ctx.save()
    ctx.translate(this.x, this.y - hover)
    if (Math.cos(this.facing) < 0) ctx.scale(-1, 1)
    if (spawnScale !== 1) ctx.scale(spawnScale, spawnScale)

    const roleKey = this.type === 'boss-mage' ? 'boss_mage' : this.type === 'boss-archer' ? 'boss_archer' : 'boss_knight'
    let frame = Math.floor(((this._walkT % (TAU * 1.5)) / (TAU * 1.5)) * 4) % 4
    if ((this.attackCd > 0 && this.attackCd < 0.4) || this.specialState === 'dash') frame = 4

    if (this.type === 'boss-mage') {
      ctx.save()
      ctx.scale(1, 0.45)
      ctx.rotate(t * 2)
      assets.draw(ctx, 'vfx_magic_circle', 0, 0, r * 3.2, r * 3.2)
      ctx.restore()
    }

    let artMode = false
    if (hasArt) artMode = drawEnemyArt(ctx, artId, r, this._artState(), this.game.dpr)
    if (!artMode) assets.draw(ctx, `char_${roleKey}_${frame}`, 0, 0, r * 2.6, r * 2.6)

    // 狂怒受击余烬：白闪（缓存白剪影或旧圆斑）会盖住 r_* 狂怒读法，
    // 在头肩线上补三点活火让二阶段仍然可读；白闪本身仍是主反馈
    if (this.enraged && this.flash > 0) {
      for (const [fx, fy, s] of [[-.3, .8, .7], [.34, .6, 1], [.02, .97, .55]]) {
        const ex = fx * r, ey = -top * fy, gr = r * .22 * s
        const ember = ctx.createRadialGradient(ex, ey, 0, ex, ey, gr)
        ember.addColorStop(0, 'rgba(255, 122, 60, .85)')
        ember.addColorStop(1, 'rgba(255, 60, 30, 0)')
        ctx.fillStyle = ember
        ctx.beginPath(); ctx.arc(ex, ey, gr, 0, TAU); ctx.fill()
        ctx.fillStyle = '#ffc890'
        ctx.beginPath(); ctx.arc(ex, ey, gr * .36, 0, TAU); ctx.fill()
      }
    }

    if (this.type === 'boss-knight' && ((this.attackCd > 0 && this.attackCd < 0.3) || this.specialState === 'dash')) {
      ctx.save()
      ctx.translate(r * 0.8, 0)
      assets.draw(ctx, 'vfx_slash_arc', 0, 0, r * 3.8, r * 3.8)
      ctx.restore()
    }

    // 受击白闪（新美术的缓存帧自带白剪影叠层，无需再盖圆斑）
    if (this.flash > 0 && artMode !== 'cache') {
      ctx.fillStyle = `rgba(255, 255, 255, ${((this.flash / 0.12) * 0.75).toFixed(2)})`
      ctx.beginPath()
      ctx.ellipse(0, 0, r * 1.1, r * 1.1, 0, 0, TAU)
      ctx.fill()
    }

    const statusColor = this.freeze > 0
      ? 'rgba(120, 200, 255, 0.42)'
      : this.slow > 0
      ? 'rgba(160, 220, 255, 0.22)'
      : this.burnHits > 0
      ? 'rgba(255, 140, 60, 0.35)'
      : this.poisonHits > 0
      ? 'rgba(120, 255, 120, 0.3)'
      : null
    if (statusColor) {
      ctx.fillStyle = statusColor
      ctx.beginPath()
      ctx.ellipse(0, 0, r, r, 0, 0, TAU)
      ctx.fill()
    }
    ctx.restore()

    if (this.vulnerableTimer > 0) {
      ctx.save()
      ctx.strokeStyle = 'rgba(255, 236, 180, 0.9)'
      ctx.lineWidth = 2
      ctx.setLineDash([7, 5])
      ctx.beginPath()
      ctx.arc(this.x, this.y, r + 10, 0, TAU)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#ffe3a2'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('破绽', this.x, this.y - top - 24)
      ctx.restore()
    }

    if (this.phaseShift > 0) {
      ctx.save()
      ctx.strokeStyle = 'rgba(255, 116, 102, 0.85)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(this.x, this.y, r + 18 + (0.85 - this.phaseShift) * 35, 0, TAU)
      ctx.stroke()
      ctx.restore()
    }

    let statusIcon = ''
    if (this.freeze > 0) statusIcon += '❄️'
    if (this.burnHits > 0) statusIcon += '🔥'
    if (this.poisonHits > 0) statusIcon += '☠️'
    if (this.slow > 0) statusIcon += '🌀'
    if (statusIcon) {
      ctx.font = '13px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(statusIcon, this.x, this.y - top - (this.vulnerableTimer > 0 ? 42 : 20))
    }

    const barWidth = 68
    const barHeight = 7
    const ratio = Math.max(0, this.hp / this.maxHp)
    const barX = this.x - barWidth / 2
    const barY = this.y - top - 14
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'
    ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2)
    ctx.fillStyle = ratio > 0.5 ? '#6fce4a' : ratio > 0.25 ? '#f0b83c' : '#e04444'
    ctx.fillRect(barX, barY, barWidth * ratio, barHeight)

    // 护盾层读数（目标轴）：三格＝本体 −60% 承伤，拆一格掉 20%
    if (this.type === 'boss-mage' && this._guards.length > 0) {
      const alive = Math.min(3, this._guards.filter((g) => g && g.active).length)
      if (alive > 0) {
        for (let i = 0; i < 3; i++) {
          const px = barX + 8 + i * 18
          const py = barY - 12
          ctx.beginPath()
          ctx.moveTo(px, py - 5)
          ctx.lineTo(px + 6, py)
          ctx.lineTo(px, py + 5)
          ctx.lineTo(px - 6, py)
          ctx.closePath()
          ctx.fillStyle = i < alive ? 'rgba(177, 140, 255, 0.85)' : 'rgba(255, 255, 255, 0.10)'
          ctx.fill()
          ctx.strokeStyle = i < alive ? 'rgba(210, 185, 255, 0.9)' : 'rgba(255, 255, 255, 0.18)'
          ctx.lineWidth = 1
          ctx.stroke()
        }
      }
    }

    // 三判落箭闪光：一圈扩散的红环，事后仍能看出「他以为你会在这里」
    if (this._volleyFx) {
      const t = this.game.elapsed
      for (const fx of this._volleyFx) {
        if (t >= fx.until) continue
        const k = 1 - (fx.until - t) / fx.duration
        ctx.strokeStyle = `rgba(255, 150, 110, ${0.8 * (1 - k)})`
        ctx.lineWidth = 3 * (1 - k) + 1
        ctx.beginPath()
        ctx.arc(fx.x, fx.y, fx.radius * (0.75 + k * 0.75), 0, TAU)
        ctx.stroke()
      }
    }
  }
}
