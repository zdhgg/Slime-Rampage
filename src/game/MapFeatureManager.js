import { Entity } from './core/Entity.js'

const TAU = Math.PI * 2
const NEST_DURABILITY = { easy: 120, normal: 105, hard: 90, hell: 78 }
const NEST_RAIDER_CHANCE = { easy: 0.2, normal: 0.28, hard: 0.34, hell: 0.4 }
const NEST_RAIDER_TYPES = new Set(['knight', 'hound', 'golem', 'berserker'])

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

function segmentDistanceSq(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1
  const vy = y2 - y1
  const lenSq = vx * vx + vy * vy || 1
  const t = clamp(((px - x1) * vx + (py - y1) * vy) / lenSq, 0, 1)
  const dx = px - (x1 + vx * t)
  const dy = py - (y1 + vy * t)
  return dx * dx + dy * dy
}

/**
 * 动态地图特征：巢心目标、功能地形与可破坏拒马。
 * 装饰仍由 MapDecor 烘焙；只有需要状态、动画或碰撞的对象进入这个管理器。
 */
export class MapFeatureManager extends Entity {
  constructor() {
    super()
    this.themeId = 'frontier'
    this.variant = 'marsh-edge'
    this.seed = 1
    this.time = 0
    this.terrain = []
    this.barricades = []
    this.nest = null
    this._failed = false
  }

  reset() {
    this.time = 0
    this.terrain.length = 0
    this.barricades.length = 0
    this.nest = null
    this._failed = false
  }

  configure(themeId, variant, seed = 1) {
    this.themeId = themeId
    this.variant = variant
    this.seed = seed
    this.time = 0
    this.terrain = this._buildTerrain(variant)
    this.barricades = this._buildBarricades(variant)
    this._failed = false
    this.nest = variant === 'nest-border' || variant === 'slime-nest-sieged'
      ? this._createNest(variant === 'slime-nest-sieged')
      : null
  }

  prepareStage(definition) {
    if (definition?.type === 'defend') {
      this.nest = this.nest || this._createNest(true)
      this.nest.preview = true
      this.nest.active = false
      this.nest.secured = false
      this.nest.hp = 0
      this.nest.maxHp = 0
    }
  }

  beginNestDefense() {
    const difficulty = this.game?.runSelection?.difficulty || 'normal'
    const maxHp = NEST_DURABILITY[difficulty] || NEST_DURABILITY.normal
    this.nest = this.nest || this._createNest(true)
    Object.assign(this.nest, {
      active: true,
      preview: false,
      secured: false,
      hp: maxHp,
      maxHp,
      flash: 0,
    })
    this._failed = false
    return this.nest
  }

  completeNestDefense() {
    if (!this.nest) return
    this.nest.active = false
    this.nest.secured = true
    this.nest.preview = false
    this.game?.sound?.nestSecured?.()
  }

  get nestDefenseActive() {
    return !!this.nest?.active
  }

  get nestInfo() {
    const nest = this.nest
    if (!nest || (!nest.active && !nest.secured)) return null
    return {
      hp: Math.max(0, nest.hp),
      maxHp: nest.maxHp,
      ratio: nest.maxHp > 0 ? Math.max(0, nest.hp / nest.maxHp) : 0,
      state: nest.secured ? 'secured' : nest.hp <= nest.maxHp * 0.35 ? 'critical' : 'defending',
    }
  }

  shouldTargetNest(enemy) {
    if (!this.nestDefenseActive || !enemy || enemy.isBoss || !NEST_RAIDER_TYPES.has(enemy.type)) return false
    const difficulty = this.game?.runSelection?.difficulty || 'normal'
    return Math.random() < (NEST_RAIDER_CHANCE[difficulty] || NEST_RAIDER_CHANCE.normal)
  }

  getEnemyTarget(enemy) {
    if (!this.nestDefenseActive || enemy?.objectiveTarget !== 'nest') return null
    return this.nest
  }

  getDefenseSpawnPoint() {
    if (!this.nest) return null
    const center = this._position(this.nest)
    const lane = (Math.random() * 4) | 0
    const angle = lane * (TAU / 4) + (Math.random() - 0.5) * 0.18
    const distance = 500 + Math.random() * 80
    return {
      x: clamp(center.x + Math.cos(angle) * distance, 20, this.game.worldWidth - 20),
      y: clamp(center.y + Math.sin(angle) * distance, 20, this.game.worldHeight - 20),
    }
  }

  hitNest(damage = 1) {
    const nest = this.nest
    if (!nest?.active || damage <= 0) return false
    nest.hp = Math.max(0, nest.hp - damage)
    nest.flash = 0.16
    if (nest.soundCd <= 0) {
      nest.soundCd = 0.24
      this.game?.sound?.nestHit?.()
    }
    this.game?.shakeScreen?.(2.4, 0.14)
    this.game?.weaponSystem?._ring?.(nest.x, nest.y, '#d67b55', 68)
    if (nest.hp <= 0 && !this._failed) {
      this._failed = true
      nest.active = false
      this.game?.failExpeditionObjective?.('nest-destroyed')
    }
    return true
  }

  speedMultiplierAt(x, y, side = 'player') {
    let multiplier = 1
    for (const zone of this.terrain) {
      const pos = this._position(zone)
      const dx = x - pos.x
      const dy = y - pos.y
      if (dx * dx + dy * dy > zone.radius * zone.radius) continue
      if (zone.type === 'slime' && side === 'player') multiplier = Math.max(multiplier, 1.12)
      if (zone.type === 'mud') multiplier = Math.min(multiplier, side === 'player' ? 0.84 : 0.88)
    }
    return multiplier
  }

  resolvePlayerMovement(player, previousX, previousY, dashing = false) {
    for (const barrier of this.barricades) {
      if (!barrier.active) continue
      const { x, y } = this._position(barrier)
      const dx = Math.cos(barrier.angle) * barrier.length * 0.5
      const dy = Math.sin(barrier.angle) * barrier.length * 0.5
      const radius = player.radius + barrier.width * 0.5
      if (segmentDistanceSq(player.x, player.y, x - dx, y - dy, x + dx, y + dy) > radius * radius) continue

      if (dashing && barrier.hitCooldown <= 0) {
        barrier.hitCooldown = 0.18
        barrier.hp--
        barrier.flash = 0.14
        this.game?.shakeScreen?.(2.2, 0.12)
        this.game?.weaponSystem?._ring?.(x, y, '#b89a68', 48)
        if (barrier.hp <= 0) {
          barrier.active = false
          this.game?.sound?.barrierBreak?.()
          this.game?.enemyManager?.addText?.(x, y - 18, '拒马破碎', null, '#d7c49b', 13)
          continue
        }
      }

      player.x = previousX
      player.y = previousY
      return true
    }
    return false
  }

  update(dt) {
    this.time += dt
    for (const barrier of this.barricades) {
      barrier.hitCooldown = Math.max(0, barrier.hitCooldown - dt)
      barrier.flash = Math.max(0, barrier.flash - dt)
    }
    if (this.nest) {
      const pos = this._position(this.nest)
      this.nest.x = pos.x
      this.nest.y = pos.y
      this.nest.flash = Math.max(0, this.nest.flash - dt)
      this.nest.soundCd = Math.max(0, this.nest.soundCd - dt)
    }
  }

  render(ctx) {
    for (const zone of this.terrain) this._renderTerrain(ctx, zone)
    for (const barrier of this.barricades) this._renderBarricade(ctx, barrier)
    if (this.nest) this._renderNest(ctx, this.nest)
  }

  _createNest(sieged) {
    const manager = this
    return {
      xRatio: 0.5,
      yRatio: 0.5,
      x: 0,
      y: 0,
      radius: 46,
      hp: 0,
      maxHp: 0,
      active: false,
      preview: true,
      secured: false,
      sieged,
      flash: 0,
      soundCd: 0,
      isMapObjective: true,
      hit(damage) {
        return manager.hitNest(damage)
      },
    }
  }

  _buildTerrain(variant) {
    if (variant === 'nest-border') {
      return [
        { type: 'slime', xRatio: 0.5, yRatio: 0.5, radius: 148, angle: 0.1 },
        { type: 'slime', xRatio: 0.39, yRatio: 0.58, radius: 92, angle: -0.5 },
        { type: 'slime', xRatio: 0.62, yRatio: 0.42, radius: 84, angle: 0.7 },
      ]
    }
    if (variant === 'slime-nest-sieged') {
      return [
        { type: 'slime', xRatio: 0.5, yRatio: 0.5, radius: 176, angle: 0 },
        { type: 'slime', xRatio: 0.39, yRatio: 0.5, radius: 72, angle: 0.2 },
        { type: 'slime', xRatio: 0.61, yRatio: 0.5, radius: 72, angle: -0.2 },
      ]
    }
    if (variant === 'marsh-edge' || variant === 'camp-road') {
      return [
        { type: 'mud', xRatio: 0.3, yRatio: 0.34, radius: 88, angle: -0.3 },
        { type: 'mud', xRatio: 0.7, yRatio: 0.66, radius: 106, angle: 0.45 },
        { type: 'mud', xRatio: 0.68, yRatio: 0.28, radius: 70, angle: 0.15 },
      ]
    }
    return []
  }

  _buildBarricades(variant) {
    const make = (xRatio, yRatio, angle, length = 94) => ({
      xRatio,
      yRatio,
      angle,
      length,
      width: 18,
      hp: 2,
      maxHp: 2,
      active: true,
      flash: 0,
      hitCooldown: 0,
    })
    if (variant === 'outer-bailey') {
      return [
        make(0.52, 0.42, Math.PI / 2, 100),
        make(0.52, 0.58, Math.PI / 2, 100),
        make(0.68, 0.5, Math.PI / 2, 112),
      ]
    }
    if (variant === 'war-camp') {
      return [make(0.43, 0.46, 0.15, 104), make(0.57, 0.54, 0.15, 104)]
    }
    return []
  }

  _position(item) {
    return {
      x: item.xRatio * (this.game?.worldWidth || 2400),
      y: item.yRatio * (this.game?.worldHeight || 1800),
    }
  }

  _renderTerrain(ctx, zone) {
    const { x, y } = this._position(zone)
    const pulse = zone.type === 'slime' ? Math.sin(this.time * 1.7 + zone.angle) * 2 : 0
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(zone.angle)
    ctx.scale(1.18, 0.72)
    ctx.fillStyle = zone.type === 'slime' ? 'rgba(101, 160, 64, 0.12)' : 'rgba(60, 73, 67, 0.18)'
    ctx.strokeStyle = zone.type === 'slime' ? 'rgba(151, 205, 101, 0.24)' : 'rgba(126, 145, 133, 0.16)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, 0, zone.radius + pulse, 0, TAU)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  _renderBarricade(ctx, barrier) {
    const { x, y } = this._position(barrier)
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(barrier.angle)
    ctx.globalAlpha = barrier.active ? 1 : 0.42
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)'
    ctx.fillRect(-barrier.length / 2, 8, barrier.length, 9)
    ctx.strokeStyle = barrier.flash > 0 ? '#f1d29a' : '#7d6746'
    ctx.fillStyle = barrier.flash > 0 ? '#b69663' : '#59462f'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(-barrier.length / 2, 7)
    ctx.lineTo(barrier.length / 2, -7)
    ctx.moveTo(-barrier.length / 2, -7)
    ctx.lineTo(barrier.length / 2, 7)
    ctx.stroke()
    for (let i = -1; i <= 1; i++) {
      const px = i * barrier.length * 0.28
      ctx.beginPath()
      ctx.moveTo(px - 8, 12)
      ctx.lineTo(px, -15)
      ctx.lineTo(px + 8, 12)
      ctx.closePath()
      ctx.fill()
    }
    if (!barrier.active) {
      ctx.strokeStyle = 'rgba(191, 167, 119, 0.55)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(-28, 9)
      ctx.lineTo(-4, -4)
      ctx.moveTo(9, 8)
      ctx.lineTo(31, 2)
      ctx.stroke()
    }
    ctx.restore()
  }

  _renderNest(ctx, nest) {
    const { x, y } = this._position(nest)
    const pulse = Math.sin(this.time * 2.2) * 2
    const hpRatio = nest.maxHp > 0 ? Math.max(0, nest.hp / nest.maxHp) : 1
    ctx.save()
    ctx.translate(x, y)

    if (nest.active) {
      ctx.strokeStyle = 'rgba(214, 123, 85, 0.16)'
      ctx.lineWidth = 2
      ctx.setLineDash([8, 10])
      for (let i = 0; i < 4; i++) {
        const angle = i * (TAU / 4)
        ctx.beginPath()
        ctx.moveTo(Math.cos(angle) * 84, Math.sin(angle) * 84)
        ctx.lineTo(Math.cos(angle) * 260, Math.sin(angle) * 260)
        ctx.stroke()
      }
      ctx.setLineDash([])
    }

    ctx.fillStyle = 'rgba(7, 12, 9, 0.42)'
    ctx.beginPath()
    ctx.ellipse(0, 10, 54, 27, 0, 0, TAU)
    ctx.fill()
    ctx.fillStyle = nest.flash > 0 ? '#d9efa9' : nest.secured ? '#91c96b' : hpRatio < 0.35 ? '#9f5b4b' : '#6f9e54'
    ctx.beginPath()
    ctx.arc(0, 0, 30 + pulse * 0.35, 0, TAU)
    ctx.fill()
    ctx.fillStyle = nest.sieged ? 'rgba(42, 48, 36, 0.72)' : 'rgba(170, 219, 112, 0.48)'
    ctx.beginPath()
    ctx.arc(0, 2, 18, 0, TAU)
    ctx.fill()
    ctx.fillStyle = 'rgba(225, 246, 184, 0.56)'
    ctx.beginPath()
    ctx.ellipse(-7, -6, 7, 4, -0.4, 0, TAU)
    ctx.fill()

    if (nest.active && nest.maxHp > 0) {
      ctx.strokeStyle = 'rgba(30, 22, 19, 0.82)'
      ctx.lineWidth = 7
      ctx.beginPath()
      ctx.arc(0, 0, 47, -Math.PI / 2, Math.PI * 1.5)
      ctx.stroke()
      ctx.strokeStyle = hpRatio < 0.35 ? '#d66f57' : '#a8d574'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(0, 0, 47, -Math.PI / 2, -Math.PI / 2 + TAU * hpRatio)
      ctx.stroke()
    } else if (nest.secured) {
      ctx.strokeStyle = 'rgba(168, 213, 116, 0.68)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(0, 0, 47 + pulse, 0, TAU)
      ctx.stroke()
    }
    ctx.restore()
  }
}
