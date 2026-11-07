import { Enemy } from './Enemy.js'
import { AssetManager } from '../AssetManager.js'
import { drawEnemyArt, drawEnemyShadow, enemyArtFeet, enemyArtTop, hasEnemyArt } from '../EnemyArtRenderer.js'
import { BOSS_CAST, bossArtId } from '../enemy-art/boss-cast.js'

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
  },
  'boss-archer': {
    name: '弓王 罗宾',
    speed: 60,
    radius: 34,
    range: 260,
    attackInterval: 2.2,
    damage: 2,
    special: '王庭箭雨',
    phaseName: '猎杀领域',
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
  },
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

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
        : 1 - this.specialTimer / (0.42 + (this.dashChain || 0) * 0.06)
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
      special: this.isCompositeBoss ? `${cfg.special} · ${attack.name}` : attack.name,
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
    const amplified = (this.vulnerableTimer > 0 && damage > 0
      ? damage * this.vulnerableMultiplier
      : damage) * formationMul
    super.hit(amplified, effects)
    if (damage > 0) this._checkThresholdEvents()
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
   * 连段 +1（困难/地狱再 +1）、破绽窗口收窄但增伤加深、决斗圈再收 15%。
   * 伤害 +1 但不额外召唤小怪——压迫感来自节奏与空间，而非数量。
   */
  _onDuelRage() {
    const difficulty = this.game.runProfile?.id || 'normal'
    this.radius *= 1.08
    this.attackInterval *= 0.75
    this.damage += 1
    this._duelChainBonus = difficulty === 'hard' || difficulty === 'hell' ? 2 : 1
    this.duelArena?.shrink(difficulty === 'hell' ? 0.78 : 0.85)
    this.duelArena?.flash()
    this.game.enemyManager.addText(this.x, this.y - this.radius - 52, '狂血狂暴', null, '#ff5040', 17)
    this.game.sound.bossRoar()
    this.game.shakeScreen(6, 0.3)
  }

  /** 75%：首领召来护卫，逼迫玩家在输出与清场之间取舍 */
  _onReinforce() {
    const manager = this.game.enemyManager
    const count = 2
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * TAU + Math.random() * 0.6
      manager.spawnAt(
        clamp(this.x + Math.cos(angle) * 90, 24, this.game.worldWidth - 24),
        clamp(this.y + Math.sin(angle) * 90, 24, this.game.worldHeight - 24),
        'knight'
      )
    }
    manager.addText(this.x, this.y - this.radius - 34, '召唤护卫', null, '#ffd166', 14)
    this.game.sound.enemyShoot()
    this.game.shakeScreen(3, 0.18)
  }

  /** 25%：困兽之斗——攻速与移速再上一档，并立即缩短强招冷却 */
  _onLastStand() {
    this.speed *= 1.12
    this.attackInterval *= 0.88
    this.specialCd = Math.min(this.specialCd, 1.6)
    this.game.enemyManager.addText(this.x, this.y - this.radius - 34, '困兽之斗', null, '#ff7466', 15)
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
    if (this.isCompositeBoss) {
      const patterns = ['boss-knight', 'boss-mage', 'boss-archer']
      this.specialPattern = patterns[this._patternIndex++ % patterns.length]
    } else {
      this.specialPattern = this.type
    }
    this.specialState = 'telegraph'
    // 难度只增强招式内容与冷却，不缩短预警时间。
    this.specialDuration = this.specialPattern === 'boss-mage' ? 0.95 : this.specialPattern === 'boss-archer' ? 0.78 : 0.72
    // 连击第 2 段起预警时间递增（给玩家反应余量），第 3 段最长
    if (this._chainStep > 0) this.specialDuration += this._chainStep * 0.22
    this.specialTimer = this.specialDuration
    this.lockedAngle = Math.atan2(p.y - this.y, p.x - this.x)
    this.targetX = p.x
    this.targetY = p.y
    this.dashLaneRadius = this.radius + p.radius + 12
    this.dashDistance = (this.phase === 2 ? 760 : 650) * 0.42
    this._moving = false
    const chainLabel = this._chainTotal > 1 ? `（连击 ${this._chainStep + 1}/${this._chainTotal}）` : ''
    this.stateLabel = `蓄力 · ${this.attackMove.name}${chainLabel}`
    this.game.sound.enemyShoot()
  }

  _executeSpecial() {
    // 连击逐段强化：同一场战斗里动作模式随段数变化，而不是简单重复
    const chain = this._chainStep
    if (this.specialPattern === 'boss-knight') {
      this.specialState = 'dash'
      this.specialTimer = 0.42 + chain * 0.06
      this.dashHit = false
      this.dashChain = chain // 供 _updateKnightDash 读取（段数越高冲得越远越快）
      this.stateLabel = chain > 0 ? `${this.attackMove.name} · 第 ${chain + 1} 段` : this.attackMove.name
      return
    }

    if (this.specialPattern === 'boss-mage') {
      const p = this.game.player
      if ((p.x - this.targetX) ** 2 + (p.y - this.targetY) ** 2 <= 102 * 102) p.hit(2, this._specialAttackEvent ||= { enemyAttack: true })
      const count = (this.phase === 2 ? 16 : 12) + this.patternBonus * 2 + chain * 4
      for (let i = 0; i < count; i++) {
        this.game.enemyManager.spawnBullet(
          this.targetX,
          this.targetY,
          (i / count) * TAU,
          'mage',
          { speed: (this.phase === 2 ? 315 : 285) + chain * 20, radius: 8, isBoss: true, damage: 2 }
        )
      }
      this.game.shakeScreen(4, 0.2)
      this._beginRecovery(1.15)
      return
    }

    // 弹缝可钻性：0.22rad 间隔在 300px 交战距离上 ≈66px 间隙（> 玩家+弹径 64px），
    // 远距离横向走位可以钻缝，贴脸则躲不开——拉扯站位有收益。
    // 连击段数提高弹幕密度（间隔收窄），但仍保留可钻的缝。
    const count = (this.phase === 2 ? 8 : 6) + this.patternBonus + chain * 2
    const step = Math.max(0.16, 0.22 - chain * 0.02)
    for (let i = 0; i < count; i++) {
      const off = (i - (count - 1) / 2) * step
      this.game.enemyManager.spawnBullet(
        this.x,
        this.y,
        this.lockedAngle + off,
        'archer',
        { speed: 470, radius: 6, isBoss: true, damage: 2 }
      )
    }
    this._beginRecovery(0.95)
  }

  _updateKnightDash(dt) {
    const chain = this.dashChain || 0
    const speed = (this.phase === 2 ? 760 : 650) + chain * 90
    this.x += Math.cos(this.lockedAngle) * speed * dt
    this.y += Math.sin(this.lockedAngle) * speed * dt
    this.x = clamp(this.x, this.radius, this.game.worldWidth - this.radius)
    this.y = clamp(this.y, this.radius, this.game.worldHeight - this.radius)
    this.specialTimer -= dt
    const p = this.game.player
    const hitRadius = this.radius + p.radius + 12
    if (!this.dashHit && (p.x - this.x) ** 2 + (p.y - this.y) ** 2 <= hitRadius * hitRadius) {
      // 冲锋命中 4 点（原 3）：BOSS 威胁补强后，撞中一次的代价配得上 0.72s 的预警
      p.hit(4 + Math.floor(this.patternBonus / 2) + chain + (this._duelRage ? 1 : 0), this._specialAttackEvent ||= { enemyAttack: true })
      this.dashHit = true
    }
    if (this.specialTimer <= 0) {
      this.game.shakeScreen(4, 0.18)
      this._duelPincer() // 决斗夹击：冲锋落地瞬间的无预警扇形击退波（仅决斗圈骑士王）
      this._beginRecovery(1.2)
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
        for (let i = 0; i < count; i++) {
          const off = (i - (count - 1) / 2) * step
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
          this.game.enemyManager.spawnAt(this.x + Math.cos(angle) * 60, this.y + Math.sin(angle) * 60, 'knight')
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

    if (this.specialPattern === 'boss-knight') {
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
      const radius = 390
      const count = (this.phase === 2 ? 11 : 9) + this.patternBonus
      const spread = ((count - 1) / 2) * 0.12 + 0.06
      ctx.beginPath()
      ctx.moveTo(this.x, this.y)
      ctx.arc(this.x, this.y, radius, this.lockedAngle - spread, this.lockedAngle + spread)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)'
      ctx.beginPath()
      ctx.moveTo(this.x, this.y)
      ctx.lineTo(
        this.x + Math.cos(this.lockedAngle) * radius * progress,
        this.y + Math.sin(this.lockedAngle) * radius * progress
      )
      ctx.stroke()
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
  }
}
