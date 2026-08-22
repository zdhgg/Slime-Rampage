import { Enemy } from './Enemy.js'
import { AssetManager } from '../AssetManager.js'

const TAU = Math.PI * 2

const BOSS_CFG = {
  'boss-knight': {
    name: '骑士王 加洛特',
    speed: 55,
    radius: 36,
    range: 0,
    attackInterval: 1.6,
    damage: 2,
    special: '王者冲锋',
    phaseName: '血誓狂袭',
  },
  'boss-mage': {
    name: '大法师 梅林',
    speed: 45,
    radius: 34,
    range: 300,
    attackInterval: 2.8,
    damage: 1,
    special: '奥术环爆',
    phaseName: '奥术失控',
  },
  'boss-archer': {
    name: '弓王 罗宾',
    speed: 60,
    radius: 34,
    range: 260,
    attackInterval: 2.2,
    damage: 1,
    special: '王庭箭雨',
    phaseName: '猎杀领域',
  },
  'boss-final': {
    name: '终审勇者 阿尔凯恩',
    speed: 58,
    radius: 40,
    range: 275,
    attackInterval: 1.9,
    damage: 2,
    special: '三圣裁决',
    phaseName: '终焉轮转',
  },
  'boss-expedition': {
    name: '讨伐统帅 雷欧尼斯',
    speed: 60,
    radius: 40,
    range: 275,
    attackInterval: 1.85,
    damage: 2,
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
    const baseHp = 60 + wave * 8
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
    this.dropType = type === 'boss-mage' ? 'mage' : type === 'boss-archer' ? 'archer' : 'knight'
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

    this._walkT = Math.random() * 10
    this._moving = false
    this._spawnT = 0.35
    this._shadowGrad = null
  }

  get combatInfo() {
    const cfg = BOSS_CFG[this.type]
    const patternCfg = BOSS_CFG[this.specialPattern] || cfg
    const casting = this.specialState === 'telegraph'
    return {
      phase: this.phase,
      phaseName: this.phase === 2 ? cfg.phaseName : '王级交锋',
      state: this.stateLabel,
      special: this.isCompositeBoss ? `${cfg.special} · ${patternCfg.special}` : cfg.special,
      castProgress: casting && this.specialDuration > 0
        ? Math.max(0, Math.min(1, 1 - this.specialTimer / this.specialDuration))
        : 0,
      vulnerable: this.vulnerableTimer > 0,
    }
  }

  get positionLocked() {
    return this.phaseShift > 0 || this.specialState === 'telegraph' || this.specialState === 'dash'
  }

  hit(damage, effects = null) {
    const formationMul = damage > 0
      ? this.game?.enemyManager?.getBossDamageTakenMultiplier?.(this) || 1
      : 1
    const amplified = (this.vulnerableTimer > 0 && damage > 0 ? damage * 1.35 : damage) * formationMul
    super.hit(amplified, effects)
  }

  update(dt) {
    const canAct = this._tickStatus(dt)
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
    this.game.enemyManager.releaseBossCast?.(this)
    this.phase = 2
    this.enraged = true
    this.phaseShift = 0.85
    this.specialState = 'idle'
    this.specialCd = Math.min(this.specialCd, 1.4)
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
    const claimCast = this.game.enemyManager.claimBossCast
    if (claimCast && !claimCast.call(this.game.enemyManager, this)) {
      this.specialCd = 0.35
      return
    }
    const cfg = BOSS_CFG[this.type]
    const p = this.game.player
    if (this.isCompositeBoss) {
      const patterns = ['boss-knight', 'boss-mage', 'boss-archer']
      this.specialPattern = patterns[this._patternIndex++ % patterns.length]
    } else {
      this.specialPattern = this.type
    }
    const patternCfg = BOSS_CFG[this.specialPattern]
    this.specialState = 'telegraph'
    // 难度只增强招式内容与冷却，不缩短预警时间。
    this.specialDuration = this.specialPattern === 'boss-mage' ? 0.95 : this.specialPattern === 'boss-archer' ? 0.78 : 0.72
    this.specialTimer = this.specialDuration
    this.lockedAngle = Math.atan2(p.y - this.y, p.x - this.x)
    this.targetX = p.x
    this.targetY = p.y
    this.dashLaneRadius = this.radius + p.radius + 12
    this.dashDistance = (this.phase === 2 ? 760 : 650) * 0.42
    this._moving = false
    this.stateLabel = `蓄力 · ${this.isCompositeBoss ? patternCfg.special : cfg.special}`
    this.game.sound.enemyShoot()
  }

  _executeSpecial() {
    if (this.specialPattern === 'boss-knight') {
      this.specialState = 'dash'
      this.specialTimer = 0.42
      this.dashHit = false
      this.stateLabel = '王者冲锋'
      return
    }

    if (this.specialPattern === 'boss-mage') {
      const p = this.game.player
      if ((p.x - this.targetX) ** 2 + (p.y - this.targetY) ** 2 <= 102 * 102) p.hit(2)
      const count = (this.phase === 2 ? 16 : 12) + this.patternBonus * 2
      for (let i = 0; i < count; i++) {
        this.game.enemyManager.spawnBullet(
          this.targetX,
          this.targetY,
          (i / count) * TAU,
          'mage',
          { speed: this.phase === 2 ? 315 : 285, radius: 8, isBoss: true }
        )
      }
      this.game.shakeScreen(4, 0.2)
      this._beginRecovery(1.15)
      return
    }

    // 弹缝可钻性：0.22rad 间隔在 300px 交战距离上 ≈66px 间隙（> 玩家+弹径 64px），
    // 远距离横向走位可以钻缝，贴脸则躲不开——拉扯站位有收益
    const count = (this.phase === 2 ? 8 : 6) + this.patternBonus
    for (let i = 0; i < count; i++) {
      const off = (i - (count - 1) / 2) * 0.22
      this.game.enemyManager.spawnBullet(
        this.x,
        this.y,
        this.lockedAngle + off,
        'archer',
        { speed: 470, radius: 6, isBoss: true }
      )
    }
    this._beginRecovery(0.95)
  }

  _updateKnightDash(dt) {
    const speed = this.phase === 2 ? 760 : 650
    this.x += Math.cos(this.lockedAngle) * speed * dt
    this.y += Math.sin(this.lockedAngle) * speed * dt
    this.x = clamp(this.x, this.radius, this.game.worldWidth - this.radius)
    this.y = clamp(this.y, this.radius, this.game.worldHeight - this.radius)
    this.specialTimer -= dt
    const p = this.game.player
    const hitRadius = this.radius + p.radius + 12
    if (!this.dashHit && (p.x - this.x) ** 2 + (p.y - this.y) ** 2 <= hitRadius * hitRadius) {
      p.hit(3 + Math.floor(this.patternBonus / 2))
      this.dashHit = true
    }
    if (this.specialTimer <= 0) {
      this.game.shakeScreen(4, 0.18)
      this._beginRecovery(1.2)
    }
  }

  _beginRecovery(duration) {
    this.specialState = 'recover'
    this.specialTimer = duration
    this.vulnerableTimer = duration
    this.stateLabel = '破绽暴露'
    const pattern = this.specialPattern || this.type
    const baseCd = pattern === 'boss-mage' ? 6 : pattern === 'boss-archer' ? 5.4 : 5
    this.specialCd = baseCd * (this.phase === 2 ? 0.76 : 1) / this.attackTempo
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
          player.hit(this.damage)
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
          this.game.enemyManager.spawnBullet(this.x, this.y, this.facing + off, this.type === 'boss-mage' ? 'mage' : 'archer')
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

  render(ctx) {
    const r = this.radius
    const t = this.game.elapsed
    const assets = AssetManager.getInstance()
    this._renderTelegraph(ctx)

    const auraPulse = 0.5 + 0.5 * Math.sin(t * 2.5)
    ctx.fillStyle = this.enraged
      ? `rgba(255, 70, 50, ${0.12 + auraPulse * 0.1})`
      : `rgba(255, 209, 102, ${0.08 + auraPulse * 0.08})`
    ctx.beginPath()
    ctx.arc(this.x, this.y, r * (1.6 + auraPulse * 0.25), 0, TAU)
    ctx.fill()

    ctx.save()
    ctx.translate(this.x, this.y + r * 0.85)
    ctx.scale(1, 0.3)
    if (!this._shadowGrad) {
      const shadow = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r)
      shadow.addColorStop(0, 'rgba(0, 0, 0, 0.38)')
      shadow.addColorStop(1, 'rgba(0, 0, 0, 0)')
      this._shadowGrad = shadow
    }
    ctx.fillStyle = this._shadowGrad
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, TAU)
    ctx.fill()
    ctx.restore()

    ctx.save()
    const bob = this._moving ? Math.sin(this._walkT * 1.6) * 2 : 0
    ctx.translate(this.x, this.y + bob)
    if (Math.cos(this.facing) < 0) ctx.scale(-1, 1)

    if (this._spawnT > 0) {
      const k = 1 - this._spawnT / 0.35
      const c1 = 1.70158
      const c3 = c1 + 1
      const scale = 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2)
      ctx.scale(scale, scale)
    }

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
    assets.draw(ctx, `char_${roleKey}_${frame}`, 0, 0, r * 2.6, r * 2.6)

    if (this.type === 'boss-knight' && ((this.attackCd > 0 && this.attackCd < 0.3) || this.specialState === 'dash')) {
      ctx.save()
      ctx.translate(r * 0.8, 0)
      assets.draw(ctx, 'vfx_slash_arc', 0, 0, r * 3.8, r * 3.8)
      ctx.restore()
    }

    if (this.enraged) {
      ctx.strokeStyle = `rgba(255, 60, 40, ${0.4 + auraPulse * 0.4})`
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.ellipse(0, 0, r + 4 + auraPulse * 3, r + 4 + auraPulse * 3, 0, 0, TAU)
      ctx.stroke()
    }

    if (this.flash > 0) {
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
      ctx.fillText('破绽', this.x, this.y - r - 24)
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
      ctx.fillText(statusIcon, this.x, this.y - r - (this.vulnerableTimer > 0 ? 42 : 20))
    }

    const barWidth = 68
    const barHeight = 7
    const ratio = Math.max(0, this.hp / this.maxHp)
    const barX = this.x - barWidth / 2
    const barY = this.y - r - 18
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'
    ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2)
    ctx.fillStyle = ratio > 0.5 ? '#6fce4a' : ratio > 0.25 ? '#f0b83c' : '#e04444'
    ctx.fillRect(barX, barY, barWidth * ratio, barHeight)
  }
}
