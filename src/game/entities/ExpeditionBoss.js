import { Boss } from './Boss.js'
import { bossMeleeShape, bossMeleeContains, drawBossMelee } from '../BossMelee.js'

const TAU = Math.PI * 2
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const TELEGRAPH_STYLE = {
  'border-pincer': { fill: 'rgba(53, 155, 145, 0.16)', stroke: 'rgba(145, 231, 189, 0.92)', accent: '#b8efbd' },
  'beacon-triad': { fill: 'rgba(84, 116, 213, 0.16)', stroke: 'rgba(160, 191, 255, 0.92)', accent: '#d2dcff' },
  'hunter-converge': { fill: 'rgba(35, 165, 117, 0.15)', stroke: 'rgba(154, 237, 183, 0.92)', accent: '#c5f1b1' },
  'purifier-annulus': { fill: 'rgba(195, 88, 53, 0.16)', stroke: 'rgba(255, 175, 109, 0.92)', accent: '#ffd098' },
  'shield-wall': { fill: 'rgba(68, 105, 137, 0.18)', stroke: 'rgba(173, 214, 235, 0.92)', accent: '#d6f1ff' },
  'relic-echo': { fill: 'rgba(154, 104, 206, 0.16)', stroke: 'rgba(215, 174, 255, 0.92)', accent: '#efd7ff' },
  'ash-cross': { fill: 'rgba(203, 73, 47, 0.17)', stroke: 'rgba(255, 166, 93, 0.94)', accent: '#ffd09a' },
  'tomb-spiral': { fill: 'rgba(108, 111, 149, 0.16)', stroke: 'rgba(204, 203, 255, 0.9)', accent: '#e6e5ff' },
  'seal-quadrants': { fill: 'rgba(114, 72, 167, 0.16)', stroke: 'rgba(207, 166, 255, 0.92)', accent: '#edd4ff' },
  'throne-edict': { fill: 'rgba(125, 71, 165, 0.17)', stroke: 'rgba(219, 176, 255, 0.92)', accent: '#f0d4ff' },
  'final-muster': { fill: 'rgba(183, 87, 65, 0.16)', stroke: 'rgba(255, 190, 121, 0.92)', accent: '#ffe0ac' },
  'royal-chess': { fill: 'rgba(161, 89, 73, 0.16)', stroke: 'rgba(255, 201, 133, 0.92)', accent: '#ffe2ad' },
}

/** 十二章远征首领：复用职业普攻与美术，只替换为章节专属强招。 */
export class ExpeditionBoss extends Boss {
  constructor({ encounter, ...options }) {
    const type = `boss-${encounter.archetype}`
    super({ ...options, type, expeditionBoss: !!encounter.final })
    this.encounter = encounter
    this.stageBossId = encounter.id
    this.dialogueKey = `expedition-${encounter.id}`
    this.name = encounter.name
    this.isExpeditionStageBoss = true
    this.isExpeditionBoss = !!encounter.final
    this.isCompositeBoss = false
    this.specialPattern = encounter.mechanic
    this.dropType = encounter.archetype
    this.summonCd = Infinity
    if (!encounter.final) this.expValue = Math.max(30, Math.round(this.expValue * 0.35))
    this.specialCd = 2.6
    this.skillData = {}
    this._meleeFX = null
  }

  get combatInfo() {
    const casting = this.specialState === 'telegraph'
    return {
      phase: this.phase,
      phaseName: this.phase === 2 ? this.encounter.phaseName : '章节首领',
      state: this.stateLabel,
      special: this.encounter.special,
      castProgress: casting && this.specialDuration > 0
        ? Math.max(0, Math.min(1, 1 - this.specialTimer / this.specialDuration))
        : 0,
      vulnerable: this.vulnerableTimer > 0,
    }
  }

  update(dt) {
    if (this._meleeFX) {
      this._meleeFX.life = Math.max(0, this._meleeFX.life - dt)
      if (!this._meleeFX.life) this._meleeFX = null
    }
    super.update(dt)
    if (this.phaseShift > 0) this.stateLabel = this.encounter.phaseName
  }

  _enterPhaseTwo() {
    this.game.enemyManager.releaseBossCast?.(this)
    this._meleeFX = null
    this._meleeCast = null
    this.phase = 2
    this.enraged = true
    this.phaseShift = 0.85
    this.specialState = 'idle'
    this.specialCd = Math.min(this.specialCd, 1.25)
    // 连击状态复位（同基类：转阶段可能发生在连段中途）
    this._chainStep = 0
    this._chainTotal = 1
    this.speed *= 1.18
    this.attackInterval *= 0.8
    this.freeze = 0
    this.slow = 0
    this.stateLabel = this.encounter.phaseName
    this.game.enemyManager.addText(
      this.x,
      this.y - this.radius - 18,
      '第二阶段',
      this.encounter.phaseName,
      '#ff7466',
      16
    )
    this.game.dialogue?.sayBoss(this, 'phase')
    this.game.sound.bossRoar()
    this.game.shakeScreen(5, 0.28)
  }

  _startSpecial() {
    const melee = bossMeleeShape(this.encounter.mechanic, this.phase, this._chainStep)
    // Close the distance before committing. Never cast an empty melee strike
    // from across the arena, and never chase the target after the tell begins.
    if (melee && Math.hypot(this.game.player.x - this.x, this.game.player.y - this.y) > melee.reach * 0.9) {
      this.specialCd = 0.2
      this.specialState = 'idle'
      this.game.enemyManager.releaseBossCast?.(this)
      return
    }
    const claimCast = this.game.enemyManager.claimBossCast
    if (claimCast && !claimCast.call(this.game.enemyManager, this)) {
      this.specialCd = 0.35
      return
    }
    // 二阶段连击：与基类同口径（patternBonus 由难度与章节深度共同决定），
    // 让远征首领的二阶段从「同一机制重复」变成连续两/三段机制连段。
    if (this._chainStep === 0) {
      this._chainTotal = this.phase === 2 ? (this.patternBonus >= 1 ? 3 : 2) : 1
    }
    const p = this.game.player
    this.specialPattern = this.encounter.mechanic
    this.specialState = 'telegraph'
    this.specialDuration = this.encounter.telegraph
    if (this._chainStep > 0) this.specialDuration += this._chainStep * 0.22
    this.specialTimer = this.specialDuration
    this.lockedAngle = Math.atan2(p.y - this.y, p.x - this.x)
    this.targetX = p.x
    this.targetY = p.y
    this.skillData = {}
    this._meleeCast = melee ? { shape: melee, x: this.x, y: this.y, angle: this.lockedAngle } : null
    if (melee) {
      this.targetX = this.x
      this.targetY = this.y
      this.facing = this.lockedAngle
    }

    const mechanic = this.specialPattern
    if (mechanic === 'beacon-triad') {
      const radius = this.phase === 2 ? 132 : 150
      this.skillData.points = Array.from({ length: 3 }, (_, i) => {
        const angle = -Math.PI / 2 + (i / 3) * TAU
        return {
          x: clamp(this.targetX + Math.cos(angle) * radius, 80, this.game.worldWidth - 80),
          y: clamp(this.targetY + Math.sin(angle) * radius, 80, this.game.worldHeight - 80),
        }
      })
    } else if (mechanic === 'hunter-converge') {
      const count = this.phase === 2 ? 12 : 8
      const radius = this.phase === 2 ? 340 : 300
      this.skillData.sources = Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * TAU
        return { x: this.targetX + Math.cos(angle) * radius, y: this.targetY + Math.sin(angle) * radius }
      })
    } else if (mechanic === 'purifier-annulus') {
      this.skillData.inner = this.phase === 2 ? 155 : 130
      this.skillData.outer = this.phase === 2 ? 315 : 350
    } else if (mechanic === 'relic-echo') {
      this.skillData.echoX = clamp(this.x * 2 - this.targetX, 70, this.game.worldWidth - 70)
      this.skillData.echoY = clamp(this.y * 2 - this.targetY, 70, this.game.worldHeight - 70)
    } else if (mechanic === 'seal-quadrants') {
      this.skillData.safeQuadrant = this._quadrant(p.x, p.y)
    } else if (mechanic === 'final-muster') {
      const formations = this.phase === 2
        ? [['golem', 'priest', 'wraith'], ['berserker', 'assassin', 'archer']]
        : [['knight', 'archer'], ['hound', 'mage']]
      this.skillData.formation = formations[this._patternIndex++ % formations.length]
    } else if (mechanic === 'royal-chess') {
      const tile = this.phase === 2 ? 88 : 108
      this.skillData.tile = tile
      this.skillData.safeParity = 1 - this._tileParity(p.x, p.y, tile)
    }

    this._moving = false
    this.game.dialogue?.sayBossSkill?.(this)
    this.stateLabel = `蓄力 · ${melee?.name || this.encounter.special}`
    this.game.sound.enemyShoot()
  }

  _executeSpecial() {
    this._castBurst = 0.34
    const p = this.game.player
    const mechanic = this.specialPattern
    const damage = this.phase === 2 ? 3 : 2

    if (this._meleeCast) {
      const cast = this._meleeCast
      if (bossMeleeContains(cast.shape, cast.x, cast.y, cast.angle, p.x, p.y)) {
        p.hit(damage, this.skillData.attackEvent ||= { enemyAttack: true })
      }
      this._attackAnim = 0.48
      this._castBurst = 0
      this._meleeFX = { ...cast, life: 0.32 }
    } else if (mechanic === 'beacon-triad') {
      const points = this.skillData.points || []
      if (points.some((point) => (p.x - point.x) ** 2 + (p.y - point.y) ** 2 < 78 ** 2)) p.hit(damage, this.skillData.attackEvent ||= { enemyAttack: true })
      for (const point of points) this._radial(point.x, point.y, this.phase === 2 ? 8 : 6, 260, Math.PI / 6)
      if (points.length) {
        const destination = points.reduce((best, point) => {
          const distance = (p.x - point.x) ** 2 + (p.y - point.y) ** 2
          return distance > best.distance ? { point, distance } : best
        }, { point: points[0], distance: -1 }).point
        this.x = destination.x
        this.y = destination.y
      }
    } else if (mechanic === 'hunter-converge') {
      for (const source of this.skillData.sources || []) {
        const angle = Math.atan2(this.targetY - source.y, this.targetX - source.x)
        this._bullet(source.x, source.y, angle, 'archer', this.phase === 2 ? 500 : 450)
      }
    } else if (mechanic === 'purifier-annulus') {
      const distance = Math.hypot(p.x - this.x, p.y - this.y)
      if (distance < this.skillData.inner || distance > this.skillData.outer) p.hit(damage, this.skillData.attackEvent ||= { enemyAttack: true })
      this._radial(this.x, this.y, this.phase === 2 ? 14 : 10, 285, this._patternIndex++ * 0.17)
    } else if (mechanic === 'relic-echo') {
      const offset = this.phase === 2 ? Math.PI / 10 : Math.PI / 8
      this._radial(this.targetX, this.targetY, 8, 270, offset)
      this._radial(this.skillData.echoX, this.skillData.echoY, 8, 270, offset + Math.PI / 8)
    } else if (mechanic === 'tomb-spiral') {
      const count = this.phase === 2 ? 6 : 4
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * TAU + this._patternIndex * 0.31
        this.game.enemyManager.spawnAt(
          clamp(this.x + Math.cos(angle) * 115, 24, this.game.worldWidth - 24),
          clamp(this.y + Math.sin(angle) * 115, 24, this.game.worldHeight - 24),
          'wraith'
        )
      }
      this._radial(this.x, this.y, this.phase === 2 ? 15 : 11, 225, this._patternIndex++ * 0.37)
    } else if (mechanic === 'seal-quadrants') {
      if (this._quadrant(p.x, p.y) !== this.skillData.safeQuadrant) p.hit(damage, this.skillData.attackEvent ||= { enemyAttack: true })
      for (let i = 0; i < 4; i++) this._bullet(this.x, this.y, i * Math.PI / 2, 'mage', 300)
    } else if (mechanic === 'final-muster') {
      const formation = this.skillData.formation || ['knight']
      const count = this.phase === 2 ? 7 : 5
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * TAU
        const radius = 130 + (i % 2) * 55
        this.game.enemyManager.spawnAt(
          clamp(this.x + Math.cos(angle) * radius, 24, this.game.worldWidth - 24),
          clamp(this.y + Math.sin(angle) * radius, 24, this.game.worldHeight - 24),
          formation[i % formation.length],
          { elite: this.phase === 2 && i === 0 }
        )
      }
    } else if (mechanic === 'royal-chess') {
      if (this._tileParity(p.x, p.y, this.skillData.tile) !== this.skillData.safeParity) p.hit(damage, this.skillData.attackEvent ||= { enemyAttack: true })
      const tile = this.skillData.tile
      const baseX = Math.floor(this.targetX / tile) * tile
      const baseY = Math.floor(this.targetY / tile) * tile
      for (let i = -3; i <= 3; i++) {
        this._bullet(baseX + i * tile, baseY - tile * 3, Math.PI / 2, 'mage', 250)
        this._bullet(baseX - tile * 3, baseY + i * tile, 0, 'mage', 250)
      }
    }

    this.game.shakeScreen(4, 0.2)
    this._beginRecovery(this.phase === 2 ? 0.9 : 1.1)
  }

  /**
   * 强招收尾（远征版）：连击未打完则短暂间隙后接下一段；
   * 打满后给破绽窗口（随段数延长），窗口与冷却均按遭遇战配置结算。
   */
  _beginRecovery(duration) {
    const chain = this._advanceChain()
    if (chain.continuing) return
    this.specialState = 'recover'
    const breakWindow = this._chainBreakWindow(duration, chain.steps)
    this.specialTimer = breakWindow
    this.vulnerableTimer = breakWindow
    this.stateLabel = '破绽暴露'
    this.specialCd = this.encounter.cooldown * (this.phase === 2 ? 0.78 : 1) / this.attackTempo
  }

  _bullet(x, y, angle, kind, speed) {
    this.game.enemyManager.spawnBullet(x, y, angle, kind, {
      speed,
      radius: kind === 'mage' ? 8 : 6,
      isBoss: true,
    })
  }

  _radial(x, y, count, speed, offset = 0) {
    for (let i = 0; i < count; i++) this._bullet(x, y, offset + (i / count) * TAU, 'mage', speed)
  }

  _quadrant(x, y) {
    const right = x >= this.x ? 1 : 0
    const bottom = y >= this.y ? 2 : 0
    return right + bottom
  }

  _tileParity(x, y, tile) {
    return (Math.floor(x / tile) + Math.floor(y / tile)) & 1
  }

  _renderTelegraph(ctx) {
    if (this.specialState !== 'telegraph') return
    const progress = this.specialDuration > 0 ? 1 - this.specialTimer / this.specialDuration : 0
    const mechanic = this.specialPattern
    if (this._meleeCast) {
      drawBossMelee(ctx, this._meleeCast, progress, TELEGRAPH_STYLE[mechanic].accent)
      return
    }
    const style = TELEGRAPH_STYLE[mechanic] || TELEGRAPH_STYLE['royal-chess']
    const pulse = 0.72 + Math.sin(this.game.elapsed * 10) * 0.18
    ctx.save()
    ctx.fillStyle = style.fill
    ctx.strokeStyle = style.stroke
    ctx.lineWidth = 2.2
    ctx.setLineDash([10, 8])
    ctx.lineDashOffset = -progress * 28

    if (mechanic === 'beacon-triad') {
      for (const point of this.skillData.points || []) this._drawCircle(ctx, point.x, point.y, 78, progress)
    } else if (mechanic === 'hunter-converge') {
      for (const source of this.skillData.sources || []) {
        ctx.beginPath()
        ctx.moveTo(source.x, source.y)
        ctx.lineTo(this.targetX, this.targetY)
        ctx.stroke()
      }
      this._drawCircle(ctx, this.targetX, this.targetY, 34, progress)
    } else if (mechanic === 'purifier-annulus') {
      ctx.beginPath()
      ctx.arc(this.x, this.y, this.skillData.inner, 0, TAU)
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(this.x, this.y, this.skillData.outer, 0, TAU)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(138, 232, 74, 0.9)'
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.arc(this.x, this.y, (this.skillData.inner + this.skillData.outer) / 2, 0, TAU * progress)
      ctx.stroke()
    } else if (mechanic === 'relic-echo') {
      this._drawCircle(ctx, this.targetX, this.targetY, 72, progress)
      this._drawCircle(ctx, this.skillData.echoX, this.skillData.echoY, 72, progress)
      ctx.beginPath()
      ctx.moveTo(this.targetX, this.targetY)
      ctx.lineTo(this.skillData.echoX, this.skillData.echoY)
      ctx.stroke()
    } else if (mechanic === 'tomb-spiral') {
      const count = this.phase === 2 ? 6 : 4
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * TAU + this._patternIndex * 0.31
        this._drawCircle(ctx, this.x + Math.cos(angle) * 115, this.y + Math.sin(angle) * 115, 28, progress)
      }
      ctx.beginPath()
      ctx.arc(this.x, this.y, 115, 0, TAU * progress)
      ctx.stroke()
    } else if (mechanic === 'seal-quadrants') {
      const size = 360
      for (let q = 0; q < 4; q++) {
        const x = this.x + (q & 1 ? 0 : -size)
        const y = this.y + (q & 2 ? 0 : -size)
        if (q !== this.skillData.safeQuadrant) ctx.fillRect(x, y, size, size)
        ctx.strokeRect(x, y, size, size)
      }
    } else if (mechanic === 'final-muster') {
      const count = this.phase === 2 ? 7 : 5
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * TAU
        const radius = 130 + (i % 2) * 55
        this._drawCircle(ctx, this.x + Math.cos(angle) * radius, this.y + Math.sin(angle) * radius, 24, progress)
      }
    } else if (mechanic === 'royal-chess') {
      const tile = this.skillData.tile
      const baseX = Math.floor(this.targetX / tile) * tile
      const baseY = Math.floor(this.targetY / tile) * tile
      for (let ix = -4; ix <= 4; ix++) {
        for (let iy = -4; iy <= 4; iy++) {
          const x = baseX + ix * tile
          const y = baseY + iy * tile
          const parity = this._tileParity(x + 1, y + 1, tile)
          if (parity !== this.skillData.safeParity) ctx.fillRect(x, y, tile, tile)
          ctx.strokeRect(x, y, tile, tile)
        }
      }
    }

    ctx.setLineDash([])
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.35 + pulse * 0.3})`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(this.targetX, this.targetY, 10 + progress * 16, 0, TAU)
    ctx.stroke()
    ctx.fillStyle = style.accent
    ctx.beginPath()
    ctx.arc(this.targetX, this.targetY, 3.5 + progress * 5, 0, TAU)
    ctx.fill()
    ctx.globalAlpha = 0.24 + pulse * 0.18
    ctx.beginPath()
    ctx.arc(this.targetX, this.targetY, 20 + progress * 24, -Math.PI / 2, -Math.PI / 2 + TAU * progress)
    ctx.stroke()
    ctx.restore()
  }

  render(ctx) {
    super.render(ctx)
    if (this._meleeFX) drawBossMelee(ctx, this._meleeFX, 1 - this._meleeFX.life / 0.32,
      TELEGRAPH_STYLE[this.encounter.mechanic].accent, true)
  }

  _drawCircle(ctx, x, y, radius, progress) {
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, TAU)
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x, y, Math.max(4, radius - 7), -Math.PI / 2, -Math.PI / 2 + TAU * progress)
    ctx.stroke()
  }
}
