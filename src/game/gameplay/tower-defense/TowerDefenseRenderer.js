import { createTowerScenery, paintTowerScenery, drawTowerAtmosphere } from './TowerDefenseScenery.js'
import { getTowerDefenseLayout, fitTowerDefensePresentation, projectTowerDefensePoint, unprojectTowerDefensePoint } from './TowerDefenseLayout.js'
import { AssetManager } from '../../AssetManager.js'
import {
  TOWER_DEFENSE_BUILD_SLOTS,
  TOWER_DEFENSE_LEYLINE_TYPES,
  TOWER_DEFENSE_PATH,
  TOWER_DEFENSE_SLOT_LEYLINES,
  TOWER_DEFENSE_TOWER_TYPES,
  TOWER_DEFENSE_TRAPS,
  getEnemyTraitTags,
  getTowerDefensePathPosition,
} from './TowerDefenseRules.js'

const TAU = Math.PI * 2
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const ENEMY_ROLE_MAP = {
  regenerator: 'golem', sprinter: 'hound', warder: 'mage', berserker: 'berserker', broodmother: 'golem', stalker: 'assassin', siege: 'boss_knight', emp: 'mage',
  grunt: 'knight',
  runner: 'assassin',
  tank: 'berserker',
  swarm: 'hound',
  shield: 'mage',
  support: 'priest',
  splitter: 'golem',
  boss: 'boss_knight',
}

export class TowerDefenseRenderer {
  constructor(gameplay) {
    this.gameplay = gameplay
    this.assets = AssetManager.getInstance()
    this.width = 0
    this.height = 0
    this.left = 0
    this.top = 0
    this.boardWidth = 0
    this.boardHeight = 0
    this.unit = 0
    this._sceneryCanvas = null
    this._scenery = null
  }

  ensureLayout() {
    const game = this.gameplay.game
    const config = this.gameplay.stageConfig
    if (!game || (game.width === this.width && game.height === this.height && this._layoutConfig === config)) return
    const layout = getTowerDefenseLayout(Math.max(1, game.width), Math.max(1, game.height))
    Object.assign(this, config?.buildSlots
      ? fitTowerDefensePresentation(layout, config.buildSlots, config.path, config.traps)
      : layout)
    this._layoutConfig = config
  }

  project(point) {
    return projectTowerDefensePoint(point, this)
  }

  unproject(x, y) {
    this.ensureLayout()
    return unprojectTowerDefensePoint(x, y, this)
  }

  getSlotIndexAt(x, y, occupiedOnly = false) {
    this.ensureLayout()
    let match = -1
    let closest = Infinity
    const radius = Math.max(34, this.unit * 1.22)
    const slots = this.gameplay.buildSlots || TOWER_DEFENSE_BUILD_SLOTS
    for (let i = 0; i < slots.length; i++) {
      if (occupiedOnly && !this.gameplay.getTowerAtSlot(i)) continue
      const point = this.project(slots[i])
      const distance = Math.hypot(x - point.x, y - point.y)
      if (distance <= radius && distance < closest) {
        closest = distance
        match = i
      }
    }
    return match
  }

  render(ctx) {
    if (!ctx) return
    this.ensureLayout()
    this._drawCachedScenery(ctx)
    drawTowerAtmosphere(ctx, this, this._scenery, this.gameplay.elapsedTime || 0)
    const path = this.gameplay.stageConfig?.path || TOWER_DEFENSE_PATH
    this._drawWarpPortal(ctx, this.project(path[0]))
    this._drawSlimeBase(ctx, this.project(path.at(-1)))
    this._drawBurnZones(ctx)
    this._drawBuildSlots(ctx)
    this._drawTraps(ctx)
    this._drawEnemies(ctx)
    this._drawTowers(ctx)
    this._drawBuildPreview(ctx)
    this._drawShots(ctx)
    this._drawTrapEvents(ctx)
    this._drawTutorialGuide(ctx)
    this._drawStatus(ctx)
  }

  _drawCachedScenery(ctx) {
    const gp = this.gameplay
    const config = gp.stageConfig
    const slots = gp.buildSlots || TOWER_DEFENSE_BUILD_SLOTS
    const traps = gp.traps || TOWER_DEFENSE_TRAPS
    const dpr = Number(gp.game?.dpr) || 1
    if (!this._sceneryCanvas || this._sceneryConfig !== config || this._scenerySlots !== slots ||
        this._sceneryTraps !== traps || this._sceneryWidth !== this.width || this._sceneryHeight !== this.height ||
        this._sceneryDpr !== dpr || this._sceneryTime !== config?.timeOfDay || this._sceneryTheme !== config?.theme) {
      const resolved = { ...config, id: gp.currentStageId || 1, path: config?.path || TOWER_DEFENSE_PATH }
      this._scenery = createTowerScenery(this, resolved, slots, traps)
      const canvas = this._sceneryCanvas || document.createElement('canvas')
      // One bounded viewport cache, never a growing collection of 99 level images.
      const scale = Math.min(2, Math.max(1, dpr), Math.sqrt(8388608 / (this.width * this.height)))
      canvas.width = Math.ceil(this.width * scale)
      canvas.height = Math.ceil(this.height * scale)
      const offscreen = canvas.getContext('2d')
      offscreen.setTransform(scale, 0, 0, scale, 0, 0)
      paintTowerScenery(offscreen, this, this._scenery, resolved)
      this._sceneryCanvas = canvas
      this._sceneryConfig = config
      this._scenerySlots = slots
      this._sceneryTraps = traps
      this._sceneryWidth = this.width
      this._sceneryHeight = this.height
      this._sceneryDpr = dpr
      this._sceneryTime = config?.timeOfDay
      this._sceneryTheme = config?.theme
    }
    ctx.drawImage(this._sceneryCanvas, 0, 0, this.width, this.height)
  }

  destroy() {
    if (this._sceneryCanvas) { this._sceneryCanvas.width = 1; this._sceneryCanvas.height = 1 }
    this._sceneryCanvas = null
    this._scenery = null
    this._sceneryConfig = this._scenerySlots = this._sceneryTraps = null
  }

  _drawWarpPortal(ctx, entrance) {
    const u = this.unit
    const elapsed = this.gameplay.elapsedTime || 0

    ctx.save()
    ctx.translate(entrance.x, entrance.y)

    // Swirling purple magic warp vortex
    ctx.save()
    ctx.rotate(elapsed * 2.2)
    const vortexGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, u * 0.6)
    vortexGrad.addColorStop(0, '#ffffff')
    vortexGrad.addColorStop(0.35, '#c98aff')
    vortexGrad.addColorStop(0.7, '#672db8')
    vortexGrad.addColorStop(1, 'rgba(40, 12, 80, 0)')
    ctx.fillStyle = vortexGrad
    ctx.beginPath()
    ctx.arc(0, 0, u * 0.6, 0, TAU)
    ctx.fill()
    ctx.restore()

    // Arcane summoning ring
    ctx.strokeStyle = '#d4a6ff'
    ctx.lineWidth = 1.8
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.arc(0, 0, u * 0.48, 0, TAU)
    ctx.stroke()
    ctx.setLineDash([])

    // Marble Gate Pillars
    ctx.fillStyle = '#2f3640'
    ctx.strokeStyle = '#dcdde1'
    ctx.lineWidth = 1.5
    ctx.fillRect(-u * 0.45, -u * 0.55, u * 0.16, u * 1.1)
    ctx.strokeRect(-u * 0.45, -u * 0.55, u * 0.16, u * 1.1)
    ctx.fillRect(u * 0.29, -u * 0.55, u * 0.16, u * 1.1)
    ctx.strokeRect(u * 0.29, -u * 0.55, u * 0.16, u * 1.1)

    // Top Crest
    ctx.fillStyle = '#e1b12c'
    ctx.beginPath()
    ctx.moveTo(-u * 0.52, -u * 0.55)
    ctx.lineTo(0, -u * 0.78)
    ctx.lineTo(u * 0.52, -u * 0.55)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    ctx.restore()
  }

  _drawSlimeBase(ctx, base) {
    const u = this.unit
    const elapsed = this.gameplay.elapsedTime || 0
    const hpRatio = clamp(this.gameplay.baseHp / this.gameplay.maxBaseHp, 0, 1)
    const bob = Math.sin(elapsed * 4) * u * 0.05

    ctx.save()
    ctx.translate(base.x, base.y)

    // Base Bio-shrine platform
    ctx.fillStyle = 'rgba(23, 50, 42, 0.88)'
    ctx.strokeStyle = '#48e5b4'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(0, u * 0.1, u * 0.78, 0, TAU)
    ctx.fill()
    ctx.stroke()

    // Protective Hive Shield Barrier
    ctx.strokeStyle = hpRatio > 0.4 ? 'rgba(72, 229, 180, 0.65)' : 'rgba(239, 88, 88, 0.75)'
    ctx.lineWidth = 2.2
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.arc(0, 0, u * 0.98, 0, TAU)
    ctx.stroke()
    ctx.setLineDash([])

    // Royal Slime Body (Translucent Jelly Emerald Gradient)
    const slimeR = u * 0.54
    const grad = ctx.createRadialGradient(0, -slimeR * 0.3 + bob, slimeR * 0.1, 0, bob, slimeR)
    grad.addColorStop(0, '#7effcb')
    grad.addColorStop(0.55, '#38d99f')
    grad.addColorStop(1, '#1b8a62')

    ctx.fillStyle = grad
    ctx.strokeStyle = '#9effdb'
    ctx.lineWidth = 2.2
    ctx.beginPath()
    ctx.ellipse(0, bob, slimeR, slimeR * 0.84, 0, 0, TAU)
    ctx.fill()
    ctx.stroke()

    // Slime King Crown
    ctx.fillStyle = '#ffd700'
    ctx.strokeStyle = '#b8860b'
    ctx.lineWidth = 1.3
    ctx.beginPath()
    ctx.moveTo(-slimeR * 0.45, -slimeR * 0.65 + bob)
    ctx.lineTo(-slimeR * 0.52, -slimeR * 1.15 + bob)
    ctx.lineTo(-slimeR * 0.2, -slimeR * 0.85 + bob)
    ctx.lineTo(0, -slimeR * 1.25 + bob)
    ctx.lineTo(slimeR * 0.2, -slimeR * 0.85 + bob)
    ctx.lineTo(slimeR * 0.52, -slimeR * 1.15 + bob)
    ctx.lineTo(slimeR * 0.45, -slimeR * 0.65 + bob)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Crown Jewel
    ctx.fillStyle = '#ff4d4d'
    ctx.beginPath()
    ctx.arc(0, -slimeR * 0.9 + bob, 3, 0, TAU)
    ctx.fill()

    // Dynamic Slime Face
    let faceKey = 'slime_face_idle'
    if (hpRatio <= 0.35) faceKey = 'slime_face_lowhp'
    else if (this.gameplay.enemies.length > 0) faceKey = 'slime_face_angry'

    this.assets.draw(ctx, faceKey, 0, bob + slimeR * 0.08, slimeR * 1.45, slimeR * 1.45)

    ctx.restore()
  }

  _drawBurnZones(ctx) {
    for (const zone of this.gameplay.burnZones) {
      const point = this.project(zone)
      const alpha = clamp(zone.life / zone.maxLife, 0, 1)
      ctx.fillStyle = `rgba(224, 101, 55, ${0.12 + alpha * 0.16})`
      ctx.strokeStyle = `rgba(247, 168, 75, ${0.25 + alpha * 0.45})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.ellipse(point.x, point.y, zone.radius * this.boardWidth, zone.radius * this.boardHeight, 0, 0, TAU)
      ctx.fill()
      ctx.stroke()
    }
  }

  _drawBuildSlots(ctx) {
    const selected = this.gameplay.selectedSlotIndex
    const u = this.unit
    const slots = this.gameplay.buildSlots || TOWER_DEFENSE_BUILD_SLOTS
    // 战斗阶段（部署窗口之外）空槽与封印节点降噪，悬停/选中时恢复完整可见度
    const phase = this.gameplay.director?.phase || 'intermission'
    const buildWindow = phase === 'intermission'
    for (let index = 0; index < slots.length; index++) {
      const slotDef = slots[index]
      const point = this.project(slotDef)
      const occupied = !!this.gameplay.getTowerAtSlot(index)
      const hovered = index === this.gameplay.hoveredSlotIndex
      const isLocked = !this.gameplay.unlockedSlots.has(index)
      // 战斗阶段（部署窗口之外）空槽与封印节点降噪，悬停/选中时恢复完整可见度
      const dimmed = !buildWindow && !occupied && index !== selected && !hovered
      const leylineId = slotDef.leyline || TOWER_DEFENSE_SLOT_LEYLINES[index] || 'acid'
      const leyline = TOWER_DEFENSE_LEYLINE_TYPES[leylineId]

      if (isLocked) {
        // Locked / Wild Sealed Obstacle Node
        ctx.save()
        ctx.translate(point.x, point.y)
        if (dimmed) ctx.globalAlpha = 0.45

        // Dark Rocky Seal Base
        ctx.fillStyle = '#16191f'
        ctx.strokeStyle = index === selected ? '#ff9f43' : hovered ? '#e17055' : '#4b4b4b'
        ctx.lineWidth = index === selected ? 3 : 2
        this._polygon(ctx, u * 0.68, 6, Math.PI / 6)
        ctx.fill()
        ctx.stroke()

        // Ancient Runic Obelisk Prism
        ctx.fillStyle = '#2d3436'
        ctx.strokeStyle = '#636e72'
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(0, -u * 0.42)
        ctx.lineTo(u * 0.22, 0)
        ctx.lineTo(0, u * 0.38)
        ctx.lineTo(-u * 0.22, 0)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()

        // Golden Lock Glyph in Center
        ctx.fillStyle = '#ffeaa7'
        ctx.font = `700 ${clamp(u * 0.38, 14, 20)}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('🔒', 0, 0)

        if (index === selected) {
          ctx.strokeStyle = '#ff9f43'
          ctx.lineWidth = 1.8
          ctx.setLineDash([4, 3])
          ctx.beginPath()
          ctx.arc(0, 0, u * 0.90, 0, TAU)
          ctx.stroke()
        }
        ctx.restore()
      } else {
        // Unlocked Natural Leyline Slot
        ctx.save()
        ctx.translate(point.x, point.y)
        if (dimmed) ctx.globalAlpha = 0.4

        // Soft ambient Leyline glow
        if (!dimmed) {
          ctx.fillStyle = leyline ? leyline.glow : 'rgba(88, 201, 165, 0.2)'
          ctx.beginPath()
          ctx.arc(0, 0, u * 0.76, 0, TAU)
          ctx.fill()
        }

        // Clean circular pedestal
        ctx.fillStyle = occupied ? '#131e1c' : hovered ? '#203c32' : '#172b24'
        ctx.strokeStyle = index === selected ? '#f0d577' : (leyline ? leyline.color : '#6d8a7c')
        ctx.lineWidth = index === selected ? 3.0 : 2.0
        ctx.beginPath()
        ctx.arc(0, 0, u * 0.66, 0, TAU)
        ctx.fill()
        ctx.stroke()

        // Build Cross (+)
        if (!occupied && !dimmed) {
          this._drawBuildCross(ctx, { x: 0, y: 0 })
        }

        // Selection Dashed Halo
        if (index === selected && !occupied) {
          ctx.strokeStyle = 'rgba(240, 213, 119, 0.9)'
          ctx.lineWidth = 1.8
          ctx.setLineDash([4, 3])
          ctx.beginPath()
          ctx.arc(0, 0, u * 0.88, 0, TAU)
          ctx.stroke()
        }
        ctx.restore()
      }
    }
  }

  _drawBuildCross(ctx, point) {
    ctx.strokeStyle = 'rgba(190, 221, 205, 0.75)'
    ctx.lineWidth = 2.2
    ctx.beginPath()
    ctx.moveTo(point.x - this.unit * 0.22, point.y)
    ctx.lineTo(point.x + this.unit * 0.22, point.y)
    ctx.moveTo(point.x, point.y - this.unit * 0.22)
    ctx.lineTo(point.x, point.y + this.unit * 0.22)
    ctx.stroke()
  }

  _drawTraps(ctx) {
    const u = this.unit
    const elapsed = this.gameplay.elapsedTime || 0
    const hoveredTrapId = this.gameplay.hoveredTrapId

    // 1. Draw Target Range Indicators first (beneath characters, on top of path)
    for (const trap of this.gameplay.traps) {
      if (trap.id === hoveredTrapId) {
        this._drawTrapHoverRange(ctx, trap, u)
      }
    }

    // 2. Draw the Trap Entities
    for (const trap of this.gameplay.traps) {
      const point = this.project(trap.pos)
      const isReady = trap.cooldownTimer <= 0
      const isHovered = trap.id === hoveredTrapId

      ctx.save()
      ctx.translate(point.x, point.y)

      if (isHovered && isReady) {
        ctx.scale(1.1, 1.1)
      }

      // Draw Distinct Character Graphics
      if (trap.id === 'spore_shroom') {
        this._drawSporeMushroom(ctx, u, isReady, isHovered, elapsed)
      } else if (trap.id === 'slime_geyser') {
        this._drawSlimeGeyser(ctx, u, isReady, isHovered, elapsed)
      } else if (trap.id === 'hive_crystal') {
        this._drawHiveCrystal(ctx, u, isReady, isHovered, elapsed)
      }

      // Draw Cooldown Clock/Pie Wipe Animation
      if (!isReady) {
        this._drawTrapCooldownPie(ctx, u, trap)
      }

      // Draw Tooltip when hovered
      if (isHovered) {
        this._drawTrapTooltip(ctx, u, trap, isReady)
      }

      ctx.restore()
    }
  }

  _drawTrapHoverRange(ctx, trap, u) {
    if (trap.radius >= 0.9) {
      // Global hive overdrive
      ctx.save()
      ctx.strokeStyle = 'rgba(255, 234, 167, 0.45)'
      ctx.lineWidth = 3
      ctx.strokeRect(this.left, this.top, this.boardWidth, this.boardHeight)
      ctx.restore()
      return
    }

    const trapPoint = this.project(trap.pos)
    const targetPoint = this.project(trap.targetPos)

    ctx.save()
    // Connecting dashed guidance arc
    ctx.strokeStyle = trap.color === '#2ecc71' ? 'rgba(46, 204, 113, 0.55)' : 'rgba(56, 210, 255, 0.55)'
    ctx.lineWidth = 1.8
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(trapPoint.x, trapPoint.y)
    ctx.quadraticCurveTo((trapPoint.x + targetPoint.x) / 2, (trapPoint.y + targetPoint.y) / 2 - 15, targetPoint.x, targetPoint.y)
    ctx.stroke()

    // Impact zone range circle
    ctx.fillStyle = trap.color === '#2ecc71' ? 'rgba(46, 204, 113, 0.16)' : 'rgba(56, 210, 255, 0.16)'
    ctx.strokeStyle = trap.color
    ctx.lineWidth = 2.2
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.ellipse(targetPoint.x, targetPoint.y, trap.radius * this.boardWidth, trap.radius * this.boardHeight, 0, 0, TAU)
    ctx.fill()
    ctx.stroke()

    ctx.restore()
  }

  _drawSporeMushroom(ctx, u, isReady, isHovered, elapsed) {
    const bob = isReady ? Math.sin(elapsed * 4.5) * u * 0.05 : 0

    // Ready ground glow aura
    if (isReady) {
      const pulse = Math.sin(elapsed * 4) * 0.08
      ctx.fillStyle = 'rgba(46, 204, 113, 0.35)'
      ctx.beginPath()
      ctx.arc(0, 0, u * (0.65 + pulse), 0, TAU)
      ctx.fill()
    }

    // Stalk
    ctx.fillStyle = isReady ? '#8d6e63' : '#4a3d35'
    ctx.strokeStyle = isReady ? '#5d4037' : '#2e1f18'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(-u * 0.16, -u * 0.1 + bob, u * 0.32, u * 0.52, 4)
    ctx.fill()
    ctx.stroke()

    // Cap (Juicy, cute large toxic spotted mushroom)
    const capGrad = ctx.createRadialGradient(0, -u * 0.42 + bob, u * 0.08, 0, -u * 0.12 + bob, u * 0.62)
    capGrad.addColorStop(0, isReady ? '#e8ff70' : '#bdc3c7')
    capGrad.addColorStop(0.45, isReady ? '#2ecc71' : '#7f8c8d')
    capGrad.addColorStop(1, isReady ? '#1b5e20' : '#2c3e50')
    ctx.fillStyle = capGrad
    ctx.strokeStyle = isReady ? '#a3e635' : '#57606f'
    ctx.lineWidth = 2.0
    ctx.beginPath()
    ctx.ellipse(0, -u * 0.22 + bob, u * 0.58, u * 0.42, 0, Math.PI, TAU)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Luminous Bio-Dots on Cap
    ctx.fillStyle = isReady ? '#ffffff' : '#ecf0f1'
    ctx.beginPath()
    ctx.arc(-u * 0.26, -u * 0.32 + bob, u * 0.09, 0, TAU)
    ctx.arc(u * 0.24, -u * 0.34 + bob, u * 0.08, 0, TAU)
    ctx.arc(0, -u * 0.44 + bob, u * 0.10, 0, TAU)
    ctx.arc(-u * 0.05, -u * 0.25 + bob, u * 0.06, 0, TAU)
    ctx.fill()

    // Drifting spore dust particles when ready
    if (isReady) {
      for (let i = 0; i < 3; i++) {
        const drift = ((elapsed * 0.8 + i * 0.33) % 1)
        const sporeX = Math.sin(elapsed * 2 + i * 2) * u * 0.35
        const sporeY = -u * (0.4 + drift * 0.5)
        ctx.fillStyle = `rgba(163, 230, 53, ${1 - drift})`
        ctx.beginPath()
        ctx.arc(sporeX, sporeY, u * 0.04, 0, TAU)
        ctx.fill()
      }
    }
  }

  _drawSlimeGeyser(ctx, u, isReady, isHovered, elapsed) {
    // Ready ground glow aura
    if (isReady) {
      const pulse = Math.sin(elapsed * 4) * 0.08
      ctx.fillStyle = 'rgba(56, 210, 255, 0.35)'
      ctx.beginPath()
      ctx.arc(0, 0, u * (0.65 + pulse), 0, TAU)
      ctx.fill()
    }

    // Stone Font Basin
    ctx.fillStyle = '#2d3436'
    ctx.strokeStyle = isReady ? '#00d2d3' : '#636e72'
    ctx.lineWidth = 2.0
    ctx.beginPath()
    ctx.ellipse(0, u * 0.1, u * 0.56, u * 0.36, 0, 0, TAU)
    ctx.fill()
    ctx.stroke()

    // Swirling Cyan Slime Water
    const poolGrad = ctx.createRadialGradient(0, u * 0.1, u * 0.05, 0, u * 0.1, u * 0.45)
    poolGrad.addColorStop(0, isReady ? '#70a1ff' : '#57606f')
    poolGrad.addColorStop(1, isReady ? '#00d2d3' : '#2f3542')
    ctx.fillStyle = poolGrad
    ctx.beginPath()
    ctx.ellipse(0, u * 0.1, u * 0.45, u * 0.26, 0, 0, TAU)
    ctx.fill()

    // Valve Pipe Body & Wheel
    ctx.fillStyle = '#34495e'
    ctx.fillRect(-u * 0.11, -u * 0.32, u * 0.22, u * 0.44)
    ctx.strokeStyle = isReady ? '#00d2d3' : '#7f8c8d'
    ctx.lineWidth = 2.4
    ctx.beginPath()
    ctx.arc(0, -u * 0.36, u * 0.22, 0, TAU)
    ctx.stroke()

    // Central Valve Hub
    ctx.fillStyle = isReady ? '#e67e22' : '#7f8c8d'
    ctx.beginPath()
    ctx.arc(0, -u * 0.36, u * 0.08, 0, TAU)
    ctx.fill()

    // Water Bubbles when ready
    if (isReady) {
      for (let i = 0; i < 3; i++) {
        const drift = ((elapsed * 1.2 + i * 0.33) % 1)
        const bx = Math.cos(elapsed * 3 + i * 2) * u * 0.22
        const by = u * 0.1 - drift * u * 0.35
        ctx.fillStyle = `rgba(112, 161, 255, ${1 - drift})`
        ctx.beginPath()
        ctx.arc(bx, by, u * 0.05, 0, TAU)
        ctx.fill()
      }
    }
  }

  _drawHiveCrystal(ctx, u, isReady, isHovered, elapsed) {
    const bob = isReady ? Math.sin(elapsed * 3) * u * 0.06 : 0

    // Ground Runic Base
    ctx.fillStyle = 'rgba(15, 20, 25, 0.75)'
    ctx.strokeStyle = isReady ? '#fdcb6e' : '#636e72'
    ctx.lineWidth = 1.6
    this._polygon(ctx, u * 0.52, 6, 0)
    ctx.fill()
    ctx.stroke()

    // Floating Multi-faceted Crystal Prism
    ctx.save()
    ctx.translate(0, -u * 0.25 + bob)
    ctx.rotate(elapsed * 1.2)

    // Outer Crystal
    ctx.fillStyle = isReady ? '#ffeaa7' : '#7f8c8d'
    ctx.strokeStyle = isReady ? '#f39c12' : '#4a5568'
    ctx.lineWidth = 2.0
    this._polygon(ctx, u * 0.44, 6, 0)
    ctx.fill()
    ctx.stroke()

    // Inner Radiant Core
    ctx.fillStyle = isReady ? '#ffffff' : '#dcdde1'
    this._polygon(ctx, u * 0.22, 6, 0)
    ctx.fill()
    ctx.restore()

    // 3 Orbiting Celestial Sparks when ready
    if (isReady) {
      for (let i = 0; i < 3; i++) {
        const angle = elapsed * 2.5 + (i * TAU) / 3
        const sx = Math.cos(angle) * u * 0.55
        const sy = -u * 0.25 + bob + Math.sin(angle) * u * 0.35
        ctx.fillStyle = '#fff275'
        ctx.beginPath()
        ctx.arc(sx, sy, u * 0.05, 0, TAU)
        ctx.fill()
      }
    }
  }

  _drawTrapCooldownPie(ctx, u, trap) {
    const radius = u * 0.55
    const ratio = clamp(trap.cooldownTimer / trap.cooldown, 0, 1) // 1 down to 0

    // 1. Dark radial cooldown sweep overlay
    ctx.save()
    ctx.fillStyle = 'rgba(8, 12, 16, 0.72)'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    // Wipe clockwise from top
    ctx.arc(0, 0, radius, -Math.PI / 2 + (1 - ratio) * TAU, -Math.PI / 2 + TAU, false)
    ctx.closePath()
    ctx.fill()

    // 2. Circular track outline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
    ctx.lineWidth = 2.4
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, TAU)
    ctx.stroke()

    // 3. Active Cooldown Progress Ring
    ctx.strokeStyle = trap.color
    ctx.lineWidth = 2.8
    ctx.beginPath()
    ctx.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + (1 - ratio) * TAU, false)
    ctx.stroke()

    // 4. Center Countdown Text Pill
    ctx.fillStyle = 'rgba(10, 15, 20, 0.88)'
    ctx.strokeStyle = '#e74c3c'
    ctx.lineWidth = 1.2
    const pillW = u * 0.68
    const pillH = u * 0.34
    ctx.beginPath()
    ctx.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, 4)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#ff7675'
    ctx.font = `700 ${clamp(u * 0.24, 11, 15)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${Math.ceil(trap.cooldownTimer)}s`, 0, 0)

    ctx.restore()
  }

  _drawTrapTooltip(ctx, u, trap, isReady) {
    ctx.save()
    const tooltipY = -u * 0.85
    const cardW = u * 2.8
    const cardH = u * 0.62

    // Tooltip Bubble Container
    ctx.fillStyle = 'rgba(8, 14, 20, 0.94)'
    ctx.strokeStyle = isReady ? trap.color : '#747d8c'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(-cardW / 2, tooltipY - cardH, cardW, cardH, 5)
    ctx.fill()
    ctx.stroke()

    // Little Triangle pointer
    ctx.fillStyle = 'rgba(8, 14, 20, 0.94)'
    ctx.beginPath()
    ctx.moveTo(-u * 0.12, tooltipY)
    ctx.lineTo(0, tooltipY + u * 0.1)
    ctx.lineTo(u * 0.12, tooltipY)
    ctx.fill()

    // Text Row 1: Name + Status
    ctx.textAlign = 'center'
    ctx.fillStyle = isReady ? '#ffffff' : '#bdc3c7'
    ctx.font = `700 ${clamp(u * 0.20, 11, 14)}px system-ui, sans-serif`
    const statusText = isReady ? '【点击引爆】' : `【${Math.ceil(trap.cooldownTimer)}s 冷却】`
    ctx.fillText(`${trap.icon} ${trap.name} ${statusText}`, 0, tooltipY - cardH * 0.62)

    // Text Row 2: Short Description
    ctx.fillStyle = isReady ? trap.color : 'rgba(238, 245, 242, 0.65)'
    ctx.font = `500 ${clamp(u * 0.17, 9, 12)}px system-ui, sans-serif`
    ctx.fillText(trap.shortDesc || trap.description, 0, tooltipY - cardH * 0.22)

    ctx.restore()
  }

  _drawTrapEvents(ctx) {
    const u = this.unit
    for (const event of this.gameplay.trapEvents) {
      const p = clamp(1 - event.life / event.maxLife, 0, 1)
      const point = this.project(event.pos)

      ctx.save()
      ctx.translate(point.x, point.y)

      if (event.type === 'spore') {
        // Huge Expanding Toxic Spore Cloud
        const r = u * 2.8 * (0.3 + p * 0.7)
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r)
        grad.addColorStop(0, `rgba(168, 255, 120, ${(1 - p) * 0.8})`)
        grad.addColorStop(0.5, `rgba(46, 204, 113, ${(1 - p) * 0.5})`)
        grad.addColorStop(1, 'rgba(20, 90, 50, 0)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(0, 0, r, 0, TAU)
        ctx.fill()
      } else if (event.type === 'geyser') {
        // High-pressure cyan geyser eruption wave
        const r = u * 3.2 * (0.2 + p * 0.8)
        ctx.strokeStyle = `rgba(0, 210, 211, ${(1 - p)})`
        ctx.lineWidth = 4 * (1 - p)
        ctx.beginPath()
        ctx.arc(0, 0, r, 0, TAU)
        ctx.stroke()
      } else if (event.type === 'crystal') {
        // Golden Overcharge Ring
        const r = this.boardWidth * 0.8 * p
        ctx.strokeStyle = `rgba(255, 234, 167, ${(1 - p) * 0.9})`
        ctx.lineWidth = 5 * (1 - p)
        ctx.beginPath()
        ctx.arc(0, 0, r, 0, TAU)
        ctx.stroke()
      }

      ctx.restore()
    }
  }

  _drawEnemies(ctx) {
    const elapsed = this.gameplay.elapsed || 0
    const path = this.gameplay.stageConfig?.path || TOWER_DEFENSE_PATH
    for (const enemy of this.gameplay.enemies) {
      if (!enemy.active) continue
      // 模拟层已按当前关卡拓扑写入 enemy.x/y，这里直接复用；
      // 仅在坐标缺失时回退到路径换算，避免退回默认路径造成怪物脱轨
      const hasPos = Number.isFinite(enemy.x) && Number.isFinite(enemy.y)
      const pathPos = hasPos ? null : getTowerDefensePathPosition(enemy.progress || 0, path)
      const point = this.project(hasPos ? enemy : pathPos)
      const radius = this.unit * 0.52 * (enemy.size || (enemy.boss ? 1.55 : 1))

      ctx.save()
      ctx.translate(point.x, point.y)

      // Direction flipping: enemies face towards walking direction
      const facing = enemy.facing != null ? enemy.facing : (pathPos ? pathPos.facing : 0) || 0
      const facingRight = (this.portrait ? -Math.sin(facing) : Math.cos(facing)) >= 0
      if (!facingRight) {
        ctx.scale(-1, 1)
      }

      this._drawEnemyCharacter(ctx, enemy, radius, elapsed)
      this._drawEnemyStatuses(ctx, enemy, radius)
      ctx.restore()

      this._drawEnemyBars(ctx, enemy, point, radius)
      if (this.gameplay.hoveredEnemyId === enemy.id) {
        this._drawEnemyTooltip(ctx, enemy, point, radius)
      }
    }
  }

  /** 敌人悬停提示：名称 + 生命/护盾 + 机制特质说明 */
  _drawEnemyTooltip(ctx, enemy, point, radius) {
    const tags = enemy.miniBoss ? [{ icon: '◆', label: enemy.miniBoss.mechanic }, { icon: '↳', label: enemy.miniBoss.counter }, { icon: '⚠', label: `漏过损失 ${enemy.damage} 点耐久` }] : getEnemyTraitTags(enemy.typeId)
    const lines = [
      enemy.name,
      `生命 ${Math.max(0, Math.ceil(enemy.hp))}/${enemy.maxHp}${enemy.shield > 0 ? ` · 护盾 ${Math.ceil(enemy.shield)}` : ''}`,
      ...tags.map((tag) => `${tag.icon} ${tag.label}`),
    ]
    ctx.save()
    ctx.font = '600 11px "Segoe UI", "PingFang SC", sans-serif'
    const width = Math.max(...lines.map((line) => ctx.measureText(line).width)) + 16
    const lineHeight = 15
    const height = lines.length * lineHeight + 10
    const canvasWidth = this.gameplay.game?.width || 800
    let x = point.x + radius + 8
    if (x + width > canvasWidth - 6) x = point.x - radius - 8 - width
    let y = point.y - radius - height - 6
    if (y < 6) y = point.y + radius + 8
    ctx.fillStyle = 'rgba(8, 14, 20, 0.92)'
    ctx.strokeStyle = 'rgba(142, 166, 240, 0.55)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect?.(x, y, width, height, 5)
    if (!ctx.roundRect) ctx.rect(x, y, width, height)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#f2f6ed'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    lines.forEach((line, index) => {
      ctx.fillStyle = index === 0 ? '#ffd166' : 'rgba(238, 245, 242, 0.86)'
      ctx.fillText(line, x + 8, y + 6 + index * lineHeight)
    })
    ctx.restore()
  }

  _drawEnemyCharacter(ctx, enemy, radius, elapsed) {
    const role = ENEMY_ROLE_MAP[enemy.typeId] || 'knight'
    if (enemy.miniBoss) {
      ctx.save()
      ctx.strokeStyle = enemy.color; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.arc(0, 0, radius * 1.4, 0, TAU); ctx.stroke()
      ctx.fillStyle = '#ffd28a'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('◆', 0, -radius * 1.7)
      ctx.restore()
    }
    if (enemy.cloaked && !(enemy.markTimer > 0)) ctx.globalAlpha *= .55
    if (enemy.corrosionTimer > 0 || enemy.markTimer > 0 || enemy.wardRadius || enemy.regeneration || enemy.berserk) {
      ctx.strokeStyle = enemy.markTimer > 0 ? '#82dbe4' : enemy.corrosionTimer > 0 ? '#a8ce58' : enemy.color
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, radius * 1.3, 0, TAU); ctx.stroke()
    }
    const badge = { regenerator: '+', sprinter: '»', warder: '◇', berserker: '!', broodmother: '⁙', stalker: '◐', siege: '⚑' }[enemy.typeId]
    if (badge) {
      ctx.fillStyle = enemy.color; ctx.font = `bold ${Math.max(12, radius)}px sans-serif`; ctx.textAlign = 'center'
      ctx.fillText(badge, 0, -radius * 1.5)
    }
    const walkTime = enemy.walkTime != null ? enemy.walkTime : enemy.progress * 45
    const frame = Math.floor(walkTime) % 4
    const spriteKey = `char_${role}_${frame}`

    // Ground auras per class
    if (enemy.typeId === 'support') {
      ctx.save()
      ctx.rotate(elapsed * 2.5)
      ctx.strokeStyle = 'rgba(255, 225, 75, 0.75)'
      ctx.lineWidth = 1.8
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.arc(0, 0, radius * 1.35, 0, TAU)
      ctx.stroke()
      ctx.restore()
    } else if (enemy.typeId === 'shield') {
      ctx.strokeStyle = enemy.shieldFlash > 0 ? '#ffffff' : 'rgba(90, 216, 232, 0.85)'
      ctx.lineWidth = 2.4
      ctx.fillStyle = 'rgba(90, 216, 232, 0.12)'
      ctx.beginPath()
      ctx.arc(0, 0, radius * 1.3, 0, TAU)
      ctx.fill()
      ctx.stroke()
    } else if (enemy.typeId === 'emp') {
      // 电磁傀儡：电弧环 + 脉冲闪白
      const flashing = (enemy.empFlash || 0) > 0
      ctx.strokeStyle = flashing ? '#ffffff' : 'rgba(142, 166, 240, 0.85)'
      ctx.lineWidth = 2.2
      ctx.setLineDash([5, 4])
      ctx.beginPath()
      ctx.arc(0, 0, radius * (flashing ? 1.9 : 1.32), 0, TAU)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = flashing ? 'rgba(174, 189, 245, 0.25)' : 'rgba(142, 166, 240, 0.10)'
      ctx.beginPath()
      ctx.arc(0, 0, radius * 1.32, 0, TAU)
      ctx.fill()
    } else if (enemy.boss) {
      ctx.save()
      ctx.rotate(-elapsed * 1.6)
      ctx.strokeStyle = 'rgba(255, 209, 102, 0.85)'
      ctx.lineWidth = 2.8
      this._polygon(ctx, radius * 1.45, 8, 0)
      ctx.restore()
    }

    ctx.save()
    if (enemy.hitFlash > 0) {
      ctx.filter = 'brightness(2.2) contrast(1.2)'
    } else if (enemy.freezeTimer > 0 || enemy.slowTimer > 0) {
      ctx.filter = 'drop-shadow(0 0 6px #7cd8f5)'
    }

    const spriteSize = radius * (enemy.boss ? 3.6 : 3.0)
    const drawn = this.assets.draw(ctx, spriteKey, 0, 0, spriteSize, spriteSize)
    if (!drawn) {
      this._drawEnemyShapeFallback(ctx, enemy, radius)
    }
    ctx.restore()
  }

  _drawEnemyShapeFallback(ctx, enemy, radius) {
    ctx.fillStyle = enemy.hitFlash > 0 ? '#fff4d4' : enemy.color
    ctx.strokeStyle = enemy.slowTimer > 0 || enemy.freezeTimer > 0 ? '#8dd8ee' : '#492f2d'
    ctx.lineWidth = enemy.boss ? 3.5 : 2
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, TAU)
    ctx.fill()
    ctx.stroke()
  }

  _polygon(ctx, radius, sides, rotation) {
    ctx.beginPath()
    for (let index = 0; index < sides; index++) {
      const angle = rotation + index * TAU / sides
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius
      if (index === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }

  _drawShieldEnemy(ctx, radius) {
    ctx.beginPath()
    ctx.moveTo(0, -radius)
    ctx.quadraticCurveTo(radius, -radius * 0.55, radius * 0.8, radius * 0.25)
    ctx.quadraticCurveTo(0, radius * 1.2, -radius * 0.8, radius * 0.25)
    ctx.quadraticCurveTo(-radius, -radius * 0.55, 0, -radius)
    ctx.fill()
    ctx.stroke()
  }

  _drawSplitEnemy(ctx, radius) {
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, TAU)
    ctx.fill()
    ctx.stroke()
    ctx.strokeStyle = '#5d312f'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(-radius * 0.42, -radius * 0.55)
    ctx.lineTo(0, -radius * 0.08)
    ctx.lineTo(-radius * 0.18, radius * 0.48)
    ctx.moveTo(0, -radius * 0.08)
    ctx.lineTo(radius * 0.48, radius * 0.42)
    ctx.stroke()
  }

  _drawBossEnemy(ctx, radius, phase) {
    this._polygon(ctx, radius, 8, Math.PI / 8)
    ctx.fillStyle = phase === 2 ? '#ffe06f' : '#632f35'
    ctx.beginPath()
    ctx.arc(0, 0, radius * 0.38, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = '#f2c660'
    ctx.beginPath()
    ctx.moveTo(-radius * 0.6, -radius * 0.72)
    ctx.lineTo(-radius * 0.25, -radius * 1.15)
    ctx.lineTo(0, -radius * 0.76)
    ctx.lineTo(radius * 0.3, -radius * 1.15)
    ctx.lineTo(radius * 0.62, -radius * 0.7)
    ctx.stroke()
  }

  _drawEnemyStatuses(ctx, enemy, radius) {
    if ((enemy.shield || 0) > 0) {
      ctx.strokeStyle = enemy.shieldFlash > 0 ? '#f2fbff' : 'rgba(119, 210, 244, 0.85)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(0, 0, radius * 1.28, -Math.PI * 0.85, Math.PI * 0.85)
      ctx.stroke()
    }
    if (enemy.supportRadius > 0) {
      ctx.strokeStyle = `rgba(208, 159, 238, ${enemy.supportFlash > 0 ? 0.85 : 0.35})`
      ctx.lineWidth = 2
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.arc(0, 0, radius * 1.42, 0, TAU)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(-radius * 0.4, 0)
      ctx.lineTo(radius * 0.4, 0)
      ctx.moveTo(0, -radius * 0.4)
      ctx.lineTo(0, radius * 0.4)
      ctx.stroke()
    }
    if ((enemy.frostStacks || 0) > 0) {
      ctx.fillStyle = '#bcefff'
      for (let index = 0; index < enemy.frostStacks; index++) {
        ctx.beginPath()
        ctx.arc((index - 1) * 5, -radius * 1.42, 2.5, 0, TAU)
        ctx.fill()
      }
    }
  }

  _drawEnemyBars(ctx, enemy, point, radius) {
    const width = radius * (enemy.boss ? 2.4 : 2.0)
    const top = point.y - radius - (enemy.shield > 0 ? 14 : 10)
    const barH = enemy.boss ? 7 : 5
    const ratio = clamp(enemy.hp / enemy.maxHp, 0, 1)
    ctx.fillStyle = 'rgba(8, 12, 14, 0.82)'
    ctx.fillRect(point.x - width / 2, top, width, barH)
    ctx.fillStyle = enemy.boss ? '#f2c660' : enemy.miniBoss ? '#eeae72' : '#77d282'
    ctx.fillRect(point.x - width / 2, top, width * ratio, barH)
    if ((enemy.maxShield || 0) > 0 && enemy.shield > 0) {
      const shieldRatio = clamp(enemy.shield / enemy.maxShield, 0, 1)
      ctx.fillStyle = '#79cae8'
      ctx.fillRect(point.x - width / 2, top - 5, width * shieldRatio, 3)
    }
  }

  _drawTowers(ctx) {
    const u = this.unit
    const slots = this.gameplay.buildSlots || TOWER_DEFENSE_BUILD_SLOTS
    for (const tower of this.gameplay.towers) {
      const slotDef = slots[tower.slotIndex]
      let point
      if (tower.leapAnim) {
        const lp = clamp(tower.leapAnim.progress, 0, 1)
        const fromP = this.project(tower.leapAnim.from)
        const toP = this.project(tower.leapAnim.to)
        const loft = Math.sin(lp * Math.PI) * u * 2.2
        point = {
          x: fromP.x + (toP.x - fromP.x) * lp,
          y: fromP.y + (toP.y - fromP.y) * lp - loft,
        }
      } else {
        point = this.project(slotDef)
      }

      const type = TOWER_DEFENSE_TOWER_TYPES[tower.typeId]
      const selected = tower.slotIndex === this.gameplay.selectedSlotIndex
      if (selected) this._drawTowerRange(ctx, point, this.gameplay.getTowerRange(tower.typeId, tower.level, tower.branchId, tower.slotIndex))

      // Base platform with level progression & elemental glow
      this._drawTowerPlatform(ctx, point, tower, type, selected)

      // Slime Guardian: Stands naturally upright on the platform, facing towards target
      ctx.save()
      ctx.translate(point.x, point.y)
      const logicalAim = tower.aimAngle != null ? tower.aimAngle : -Math.PI / 2
      const aimAngle = Math.atan2((this.portrait ? Math.cos(logicalAim) : Math.sin(logicalAim)) * this.boardHeight,
        (this.portrait ? -Math.sin(logicalAim) : Math.cos(logicalAim)) * this.boardWidth)
      const facingRight = Math.cos(aimAngle) >= 0

      // Flip body horizontally based on target direction
      if (!facingRight) {
        ctx.scale(-1, 1)
      }

      // Local normalized look vector for eyes & mouth aiming
      const lookX = facingRight ? Math.cos(aimAngle) : -Math.cos(aimAngle)
      const lookY = Math.sin(aimAngle)

      this.drawGuardian(ctx, tower, lookX, lookY)

      // Fever boost aura from tactical traps and leap talents.
      if ((tower.feverTimer || 0) > 0) {
        ctx.strokeStyle = 'rgba(255, 234, 167, 0.85)'
        ctx.lineWidth = 2.2
        ctx.setLineDash([4, 3])
        ctx.beginPath()
        ctx.arc(0, 0, u * 0.70, 0, TAU)
        ctx.stroke()
        ctx.setLineDash([])
      }

      // EMP 瘫痪状态：暗淡 + 电击标识
      if ((tower.disabledTimer || 0) > 0) {
        ctx.fillStyle = 'rgba(10, 16, 28, 0.55)'
        ctx.beginPath()
        ctx.arc(0, 0, u * 0.72, 0, TAU)
        ctx.fill()
        ctx.strokeStyle = 'rgba(142, 166, 240, 0.9)'
        ctx.lineWidth = 2
        ctx.setLineDash([3, 3])
        ctx.beginPath()
        ctx.arc(0, 0, u * 0.72, 0, TAU)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = '#aebdf5'
        ctx.font = `700 ${clamp(u * 0.42, 14, 20)}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('⚡', 0, 0)
      }

      // ✨ Shiny Slime Floating Star & Sparkle
      if (tower.shinyTrait) {
        const elapsed = this.gameplay.elapsedTime || 0
        const starY = -u * 0.88 + Math.sin(elapsed * 4 + tower.slotIndex) * u * 0.08
        ctx.fillStyle = tower.shinyTrait.color || '#ffd166'
        ctx.font = `700 ${clamp(u * 0.36, 14, 20)}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText('✨', 0, starY)
      }

      ctx.restore()

      this._drawTowerLevel(ctx, point, tower.level, tower.branchId, type)
    }
  }

  // Shared by the battlefield, placement ghost and static menu portraits.
  drawGuardian(ctx, tower, lookX = 0, lookY = 0.15) {
    const type = TOWER_DEFENSE_TOWER_TYPES[tower.typeId]
    const draw = {
      rapid: this._drawRapidSlime,
      slow: this._drawFrostSlime,
      blast: this._drawBlastSlime,
      shock: this._drawShockSlime,
      arcane: this._drawArcaneSlime,
      radiant: this._drawRadiantSlime,
    }[tower.typeId]
    if (!type) return
    if (!draw) { this._drawSpecialGuardian(ctx, tower, type); return }
    ctx.save()
    draw.call(this, ctx, tower, type, lookX, lookY)
    ctx.restore()
  }

  _drawSpecialGuardian(ctx, tower, type) {
    const r = this.unit * .42
    ctx.save()
    ctx.fillStyle = '#17251e'; ctx.strokeStyle = type.color; ctx.lineWidth = 2
    ctx.beginPath(); ctx.ellipse(0, r * .6, r * 1.1, r * .42, 0, 0, TAU); ctx.fill(); ctx.stroke()
    ctx.fillStyle = type.color
    ctx.beginPath(); ctx.ellipse(0, 0, r * .8, r, 0, Math.PI, TAU); ctx.lineTo(r * .8, r * .4); ctx.quadraticCurveTo(0, r * .9, -r * .8, r * .4); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = '#f0f4d5'; ctx.lineWidth = 2.5
    if (tower.typeId === 'spore') {
      for (const x of [-.55, 0, .55]) { ctx.beginPath(); ctx.arc(r * x, -r * .65, r * .25, 0, TAU); ctx.fill(); ctx.stroke() }
    } else if (tower.typeId === 'thorn') {
      for (const x of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x * r * .5, r * .3); ctx.lineTo(x * r, -r * .6); ctx.lineTo(x * r * .4, -r * .2); ctx.stroke() }
    } else if (tower.typeId === 'ballista') {
      ctx.beginPath(); ctx.moveTo(-r, -r * .2); ctx.lineTo(0, -r * .65); ctx.lineTo(r, -r * .2); ctx.moveTo(0, r * .2); ctx.lineTo(0, -r * 1.35); ctx.stroke()
    } else {
      ctx.beginPath(); ctx.arc(0, -r * .55, r * .45, 0, TAU); ctx.stroke()
      ctx.fillStyle = '#eaffff'; ctx.beginPath(); ctx.arc(0, -r * .55, r * .18, 0, TAU); ctx.fill()
    }
    ctx.fillStyle = '#162925'
    for (const x of [-.28, .28]) { ctx.beginPath(); ctx.arc(r * x, r * .12, r * .1, 0, TAU); ctx.fill() }
    if (tower.level >= 3) { ctx.fillStyle = '#fff0b0'; ctx.beginPath(); ctx.arc(0, r * .45, r * .12, 0, TAU); ctx.fill() }
    ctx.restore()
  }

  _drawBuildPreview(ctx) {
    const { previewTowerTypeId, selectedSlotIndex } = this.gameplay
    const type = TOWER_DEFENSE_TOWER_TYPES[previewTowerTypeId]
    const slot = this.gameplay.buildSlots?.[selectedSlotIndex]
    if (!type || !slot || !this.gameplay.unlockedSlots.has(selectedSlotIndex)
      || this.gameplay.getTowerAtSlot(selectedSlotIndex)) return
    const point = this.project(slot)
    this._drawTowerRange(ctx, point, this.gameplay.getTowerRange(type.id), type.color)
    ctx.save()
    ctx.globalAlpha = 0.65
    ctx.translate(point.x, point.y)
    this.drawGuardian(ctx, { typeId: type.id, level: 1, pulseTime: 0 })
    ctx.restore()
  }

  _drawTowerRange(ctx, point, range, color = '#e8d588') {
    ctx.save()
    ctx.strokeStyle = `${color}88`
    ctx.fillStyle = `${color}12`
    ctx.lineWidth = 1.8
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.ellipse(point.x, point.y, range * this.boardWidth, range * this.boardHeight, 0, 0, TAU)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  _drawTowerPlatform(ctx, point, tower, type, selected) {
    const u = this.unit
    const level = tower.level || 1
    const pulse = tower.pulseTime || 0

    ctx.save()
    ctx.translate(point.x, point.y)

    // Outer elemental bio-glow aura
    const glowColor = type.color === '#58c9a5' ? 'rgba(46, 232, 168, 0.32)'
      : type.color === '#74bce8' ? 'rgba(72, 216, 255, 0.35)'
      : 'rgba(255, 170, 51, 0.35)'

    ctx.fillStyle = glowColor
    ctx.beginPath()
    ctx.arc(0, 0, u * 0.76, 0, TAU)
    ctx.fill()

    // Base bio-jelly pad (Translucent dark jade)
    ctx.fillStyle = '#1c342f'
    ctx.strokeStyle = selected ? '#ffe27d' : level >= 3 ? '#ffffff' : type.color
    ctx.lineWidth = selected ? 3.5 : 2.2
    this._polygon(ctx, u * 0.60, 8, Math.PI / 8)

    // Inner glowing elemental runes ring
    ctx.save()
    ctx.rotate(pulse * 0.5)
    ctx.strokeStyle = type.color
    ctx.lineWidth = 1.4
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.arc(0, 0, u * 0.48, 0, TAU)
    ctx.stroke()
    ctx.restore()

    // 4 Corner Bio-nodules
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4
      const cx = Math.cos(a) * u * 0.52
      const cy = Math.sin(a) * u * 0.52
      ctx.fillStyle = type.color
      ctx.beginPath()
      ctx.arc(cx, cy, u * 0.055, 0, TAU)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(cx, cy, u * 0.025, 0, TAU)
      ctx.fill()
    }
    ctx.restore()
  }

  _drawRapidSlime(ctx, tower, type, lookX, lookY) {
    const u = this.unit
    const level = tower.level || 1
    const isGatling = tower.branchId === 'gatling'
    const isSniper = tower.branchId === 'sniper'
    const pulse = tower.pulseTime || 0
    const recoil = tower.recoil || 0
    const bob = Math.sin(pulse * 6) * u * 0.04

    // Squish & recoil when spitting
    const sx = 1 + recoil * 0.25
    const sy = 1 - recoil * 0.28
    ctx.scale(sx, sy)

    if (isGatling) {
      // Tri-Slime Stack (三头叠罗汉暴走形态 - 纯萌态三兄弟)
      const stack = [
        { y: u * 0.18, r: u * 0.40, color0: '#abebc6', color1: '#27ae60' },
        { y: -u * 0.15, r: u * 0.30, color0: '#d5f5e3', color1: '#2ecc71' },
        { y: -u * 0.45, r: u * 0.22, color0: '#e8f8f5', color1: '#58d68d' },
      ]
      for (let i = 0; i < stack.length; i++) {
        const s = stack[i]
        const grad = ctx.createRadialGradient(0, s.y - s.r * 0.3 + bob, s.r * 0.1, 0, s.y + bob, s.r)
        grad.addColorStop(0, s.color0)
        grad.addColorStop(0.7, s.color1)
        grad.addColorStop(1, '#145a32')

        ctx.fillStyle = grad
        ctx.strokeStyle = '#a9dfbf'
        ctx.lineWidth = 1.8
        ctx.beginPath()
        ctx.ellipse(0, s.y + bob, s.r, s.r * 0.84, 0, 0, TAU)
        ctx.fill()
        ctx.stroke()

        // Eyes looking at target
        for (const side of [-1, 1]) {
          const ex = side * s.r * 0.35 + lookX * s.r * 0.12
          const ey = s.y - s.r * 0.15 + bob + lookY * s.r * 0.12
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.arc(ex, ey, s.r * 0.24, 0, TAU)
          ctx.fill()
          ctx.fillStyle = '#145a32'
          ctx.beginPath()
          ctx.arc(ex + lookX * s.r * 0.08, ey + lookY * s.r * 0.08, s.r * 0.13, 0, TAU)
          ctx.fill()
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.arc(ex + lookX * s.r * 0.05 - 1, ey + lookY * s.r * 0.05 - 1, s.r * 0.06, 0, TAU)
          ctx.fill()
        }

        // Open Spitting Mouth
        const mx = lookX * s.r * 0.28
        const my = s.y + s.r * 0.22 + bob + lookY * s.r * 0.2
        ctx.fillStyle = '#145a32'
        ctx.beginPath()
        ctx.ellipse(mx, my, s.r * (recoil > 0.05 ? 0.28 : 0.18), s.r * (recoil > 0.05 ? 0.32 : 0.14), 0, 0, TAU)
        ctx.fill()
        if (recoil > 0.05) {
          ctx.fillStyle = '#58ff9b'
          ctx.beginPath()
          ctx.arc(mx, my, s.r * 0.16, 0, TAU)
          ctx.fill()
        }
      }
    } else if (isSniper) {
      // Long-Horn Sniper Slime (独角长弓狙击史莱姆 - 纯晶角与大嘴喷射)
      const r = u * (level >= 4 ? 0.46 : 0.42)
      const grad = ctx.createRadialGradient(0, -r * 0.3 + bob, r * 0.1, 0, bob, r)
      grad.addColorStop(0, '#a3e4d7')
      grad.addColorStop(0.6, '#1abc9c')
      grad.addColorStop(1, '#0e6251')

      ctx.fillStyle = grad
      ctx.strokeStyle = '#76d7c4'
      ctx.lineWidth = 2.4
      ctx.beginPath()
      ctx.ellipse(0, bob, r, r * 0.86, 0, 0, TAU)
      ctx.fill()
      ctx.stroke()

      // Cute Emerald Crystal Horn on top of head
      ctx.fillStyle = '#16a085'
      ctx.strokeStyle = '#58ffb4'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(-u * 0.09, -r * 0.72 + bob)
      ctx.lineTo(0, -u * 1.18 + bob)
      ctx.lineTo(u * 0.09, -r * 0.72 + bob)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      // Horn Superconductor Rings
      ctx.fillStyle = '#2ff5b4'
      ctx.fillRect(-u * 0.1, -u * 0.95 + bob, u * 0.2, u * 0.055)

      // Aiming Laser Beam projecting from horn tip
      ctx.strokeStyle = 'rgba(255, 50, 50, 0.8)'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(0, -u * 1.19 + bob)
      ctx.lineTo(lookX * u * 3.8, -u * 1.19 + bob + lookY * u * 3.8)
      ctx.stroke()

      // Sharp Focused Eyes
      for (const side of [-1, 1]) {
        const ex = side * r * 0.38 + lookX * r * 0.14
        const ey = -r * 0.15 + bob + lookY * r * 0.14
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(ex, ey, r * 0.24, 0, TAU)
        ctx.fill()
        ctx.fillStyle = '#0b5345'
        ctx.beginPath()
        ctx.arc(ex + lookX * r * 0.1, ey + lookY * r * 0.1, r * 0.13, 0, TAU)
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(ex + lookX * r * 0.06 - 1, ey + lookY * r * 0.06 - 1, r * 0.06, 0, TAU)
        ctx.fill()
      }

      // Spitting Mouth (Wide open when firing)
      const mx = lookX * r * 0.32
      const my = r * 0.22 + bob + lookY * r * 0.22
      ctx.fillStyle = '#0b5345'
      ctx.beginPath()
      ctx.ellipse(mx, my, r * (recoil > 0.05 ? 0.32 : 0.18), r * (recoil > 0.05 ? 0.36 : 0.14), 0, 0, TAU)
      ctx.fill()
      if (recoil > 0.05) {
        ctx.fillStyle = '#2ff5b4'
        ctx.beginPath()
        ctx.arc(mx, my, r * 0.2, 0, TAU)
        ctx.fill()
      }
    } else {
      // Standard Acid Spore Slime (标准强酸史莱姆 - 纯嘴巴喷射，无机械管)
      const r = u * (level >= 2 ? 0.44 : 0.40)
      const grad = ctx.createRadialGradient(0, -r * 0.3 + bob, r * 0.1, 0, bob, r)
      grad.addColorStop(0, '#abebc6')
      grad.addColorStop(0.55, '#2ecc71')
      grad.addColorStop(1, '#196f3d')

      ctx.fillStyle = grad
      ctx.strokeStyle = '#82e0aa'
      ctx.lineWidth = 2.4
      ctx.beginPath()
      ctx.ellipse(0, bob, r, r * 0.85, 0, 0, TAU)
      ctx.fill()
      ctx.stroke()

      // Cute little top sprout / droplet antenna
      ctx.fillStyle = '#27ae60'
      ctx.strokeStyle = '#a9dfbf'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(0, -r * 0.82 + bob, u * 0.1, 0, TAU)
      ctx.fill()
      ctx.stroke()

      // Cute Eyes looking at target
      for (const side of [-1, 1]) {
        const ex = side * r * 0.36 + lookX * r * 0.12
        const ey = -r * 0.12 + bob + lookY * r * 0.12
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(ex, ey, r * 0.26, 0, TAU)
        ctx.fill()
        ctx.fillStyle = '#1e8449'
        ctx.beginPath()
        ctx.arc(ex + lookX * r * 0.09, ey + lookY * r * 0.09, r * 0.14, 0, TAU)
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(ex + lookX * r * 0.05 - 1, ey + lookY * r * 0.05 - 1, r * 0.06, 0, TAU)
        ctx.fill()

        // Cute pink blush
        ctx.fillStyle = 'rgba(255, 120, 150, 0.45)'
        ctx.beginPath()
        ctx.ellipse(side * r * 0.65, r * 0.15 + bob, r * 0.15, r * 0.09, 0, 0, TAU)
        ctx.fill()
      }

      // Spitting Mouth (Opens wide "O" when firing, W-smile when idle)
      const mx = lookX * r * 0.3
      const my = r * 0.22 + bob + lookY * r * 0.2
      if (recoil > 0.05) {
        // Deep inhale / open mouth spitting acid
        ctx.fillStyle = '#145a32'
        ctx.strokeStyle = '#58ff9b'
        ctx.lineWidth = 1.8
        ctx.beginPath()
        ctx.ellipse(mx, my, r * 0.28, r * 0.32, 0, 0, TAU)
        ctx.fill()
        ctx.stroke()

        // Glowing green acid charge in mouth
        ctx.fillStyle = '#58ff9b'
        ctx.beginPath()
        ctx.arc(mx, my, r * 0.16, 0, TAU)
        ctx.fill()
      } else {
        // Cute happy W-smile
        ctx.strokeStyle = '#145a32'
        ctx.lineWidth = 2.2
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.arc(mx - r * 0.1, my, r * 0.12, 0.1 * Math.PI, 0.9 * Math.PI)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(mx + r * 0.1, my, r * 0.12, 0.1 * Math.PI, 0.9 * Math.PI)
        ctx.stroke()
      }
    }
  }

  _drawFrostSlime(ctx, tower, type, lookX, lookY) {
    const u = this.unit
    const level = tower.level || 1
    const isChain = tower.branchId === 'ice-chain'
    const isField = tower.branchId === 'frost-field'
    const pulse = tower.pulseTime || 0
    const recoil = tower.recoil || 0
    const floatBob = Math.sin(pulse * 3.5) * u * 0.08
    const r = u * (level >= 4 ? 0.46 : level >= 2 ? 0.42 : 0.38)

    ctx.save()
    ctx.translate(0, floatBob)

    if (isField) {
      // 6 Orbiting Sharp Ice Crystals
      for (let i = 0; i < 6; i++) {
        const a = (i * TAU) / 6 - pulse * 1.6
        const sx = Math.cos(a) * u * 0.52
        const sy = Math.sin(a) * u * 0.52
        ctx.save()
        ctx.translate(sx, sy)
        ctx.rotate(a + Math.PI / 2)
        ctx.fillStyle = '#d4f6ff'
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.4
        this._polygon(ctx, u * 0.13, 3, 0)
        ctx.restore()
      }
    } else if (isChain) {
      // 3 Floating Satellites with Lightning Arcs
      for (let i = 0; i < 3; i++) {
        const a = (i * TAU) / 3 + pulse * 2.2
        const sx = Math.cos(a) * u * 0.48
        const sy = Math.sin(a) * u * 0.48
        ctx.strokeStyle = '#b8f2ff'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(sx, sy)
        ctx.stroke()
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(sx, sy, u * 0.09, 0, TAU)
        ctx.fill()
        ctx.fillStyle = '#38d2ff'
        ctx.beginPath()
        ctx.arc(sx, sy, u * 0.05, 0, TAU)
        ctx.fill()
      }
    }

    // Ice Slime Body
    const grad = ctx.createRadialGradient(0, -r * 0.3, r * 0.1, 0, 0, r)
    grad.addColorStop(0, '#ffffff')
    grad.addColorStop(0.35, '#c5f2ff')
    grad.addColorStop(0.75, '#56ccf2')
    grad.addColorStop(1, '#2f80ed')

    ctx.fillStyle = grad
    ctx.strokeStyle = '#d9f7ff'
    ctx.lineWidth = 2.4
    ctx.beginPath()
    ctx.ellipse(0, 0, r, r * 0.85, 0, 0, TAU)
    ctx.fill()
    ctx.stroke()

    // Ice Crystal Crown
    ctx.fillStyle = '#9fe8ff'
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.3
    ctx.beginPath()
    ctx.moveTo(-r * 0.45, -r * 0.65)
    ctx.lineTo(-r * 0.52, -r * 1.1)
    ctx.lineTo(-r * 0.2, -r * 0.85)
    ctx.lineTo(0, -r * 1.25)
    ctx.lineTo(r * 0.2, -r * 0.85)
    ctx.lineTo(r * 0.52, -r * 1.1)
    ctx.lineTo(r * 0.45, -r * 0.65)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Sparkling Blue Eyes looking at target
    for (const side of [-1, 1]) {
      const ex = side * r * 0.35 + lookX * r * 0.12
      const ey = -r * 0.08 + lookY * r * 0.12
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(ex, ey, r * 0.24, 0, TAU)
      ctx.fill()
      ctx.fillStyle = '#1c3d5a'
      ctx.beginPath()
      ctx.arc(ex + lookX * r * 0.08, ey + lookY * r * 0.08, r * 0.13, 0, TAU)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(ex + lookX * r * 0.05 - 1, ey + lookY * r * 0.05 - 1, r * 0.06, 0, TAU)
      ctx.fill()
    }

    // Mouth: Blowing frosty mist when firing
    const mx = lookX * r * 0.28
    const my = r * 0.22 + lookY * r * 0.18
    if (recoil > 0.05) {
      ctx.fillStyle = '#1c3d5a'
      ctx.beginPath()
      ctx.ellipse(mx, my, r * 0.24, r * 0.28, 0, 0, TAU)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(mx, my, r * 0.14, 0, TAU)
      ctx.fill()
    } else {
      ctx.strokeStyle = '#1c3d5a'
      ctx.lineWidth = 1.8
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(mx, my, r * 0.16, 0.1 * Math.PI, 0.9 * Math.PI)
      ctx.stroke()
    }

    ctx.restore()
  }

  _drawBlastSlime(ctx, tower, type, lookX, lookY) {
    const u = this.unit
    const level = tower.level || 1
    const isHeavy = tower.branchId === 'heavy-shell'
    const isBurn = tower.branchId === 'burn-zone'
    const pulse = tower.pulseTime || 0
    const recoil = tower.recoil || 0
    const bob = Math.sin(pulse * 4) * u * 0.03
    const r = u * (level >= 4 ? 0.50 : level >= 2 ? 0.46 : 0.42)

    // Squish & expansion when coughing/spitting lava ball
    const sx = 1 + recoil * 0.28
    const sy = 1 - recoil * 0.32
    ctx.scale(sx, sy)

    // Obsidian Back Armor Crust
    ctx.fillStyle = '#2c1810'
    ctx.strokeStyle = '#e67e22'
    ctx.lineWidth = 2.2
    ctx.beginPath()
    ctx.ellipse(0, r * 0.25 + bob, r * 1.15, r * 0.72, 0, 0, TAU)
    ctx.fill()
    ctx.stroke()

    // Molten Magma Slime Body
    const grad = ctx.createRadialGradient(0, -r * 0.3 + bob, r * 0.1, 0, bob, r)
    grad.addColorStop(0, '#ffeaa7')
    grad.addColorStop(0.35, '#e17055')
    grad.addColorStop(0.75, '#d63031')
    grad.addColorStop(1, '#631818')

    ctx.fillStyle = grad
    ctx.strokeStyle = '#ff9f43'
    ctx.lineWidth = 2.6
    ctx.beginPath()
    ctx.ellipse(0, bob, r, r * 0.86, 0, 0, TAU)
    ctx.fill()
    ctx.stroke()

    // Flickering Head Flame Plume
    const flameH = u * (isBurn ? 0.38 : 0.25) + Math.sin(pulse * 10) * u * 0.05
    ctx.fillStyle = isBurn ? '#ff7675' : '#fdcb6e'
    ctx.strokeStyle = '#d63031'
    ctx.lineWidth = 1.3
    ctx.beginPath()
    ctx.moveTo(-u * 0.09, -r * 0.75 + bob)
    ctx.quadraticCurveTo(0, -r * 0.75 - flameH + bob, u * 0.09, -r * 0.75 + bob)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    if (isHeavy) {
      // Obsidian Horns
      ctx.fillStyle = '#1e110c'
      ctx.strokeStyle = '#f39c12'
      ctx.lineWidth = 1.8
      ctx.beginPath()
      ctx.moveTo(-r * 0.75, -r * 0.3 + bob)
      ctx.lineTo(-r * 1.15, -r * 0.8 + bob)
      ctx.lineTo(-r * 0.55, -r * 0.6 + bob)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(r * 0.75, -r * 0.3 + bob)
      ctx.lineTo(r * 1.15, -r * 0.8 + bob)
      ctx.lineTo(r * 0.55, -r * 0.6 + bob)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }

    // Fierce/Determined Slime Eyes looking at target
    for (const side of [-1, 1]) {
      const ex = side * r * 0.35 + lookX * r * 0.12
      const ey = -r * 0.12 + bob + lookY * r * 0.12
      // Slanted angry eye white
      ctx.fillStyle = '#fff4cc'
      ctx.beginPath()
      ctx.arc(ex, ey, r * 0.25, 0, TAU)
      ctx.fill()
      // Pupil
      ctx.fillStyle = '#4a1500'
      ctx.beginPath()
      ctx.arc(ex + lookX * r * 0.09, ey + lookY * r * 0.09, r * 0.14, 0, TAU)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(ex + lookX * r * 0.05 - 1, ey + lookY * r * 0.05 - 1, r * 0.05, 0, TAU)
      ctx.fill()
      // Slanted angry eyebrow
      ctx.strokeStyle = '#4a1500'
      ctx.lineWidth = 2.2
      ctx.beginPath()
      ctx.moveTo(ex - side * r * 0.2, ey - r * 0.22)
      ctx.lineTo(ex + side * r * 0.18, ey - r * 0.12)
      ctx.stroke()
    }

    // Huge Roaring/Spitting Magma Mouth
    const mx = lookX * r * 0.3
    const my = r * 0.22 + bob + lookY * r * 0.2
    if (recoil > 0.05) {
      // Roaring wide open mouth with molten fire inside
      ctx.fillStyle = '#4a1500'
      ctx.strokeStyle = '#ff6348'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.ellipse(mx, my, r * 0.36, r * 0.38, 0, 0, TAU)
      ctx.fill()
      ctx.stroke()

      ctx.fillStyle = '#ff9f43'
      ctx.beginPath()
      ctx.arc(mx, my, r * 0.22, 0, TAU)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(mx, my, r * 0.11, 0, TAU)
      ctx.fill()
    } else {
      // Fierce determined mouth
      ctx.strokeStyle = '#4a1500'
      ctx.lineWidth = 2.4
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(mx, my + r * 0.08, r * 0.22, 1.1 * Math.PI, 1.9 * Math.PI)
      ctx.stroke()
    }
  }

  _drawTowerLevel(ctx, point, level, branchId, type) {
    const u = this.unit
    const stars = Math.min(4, Math.max(1, level))

    ctx.save()
    for (let index = 0; index < stars; index++) {
      const sx = point.x + (index - (stars - 1) / 2) * 12
      const sy = point.y + u * 0.54
      ctx.fillStyle = branchId ? '#ffe680' : level >= 2 ? '#6affc5' : '#ffffff'
      ctx.strokeStyle = '#000000'
      ctx.lineWidth = 1.0
      ctx.beginPath()
      ctx.moveTo(sx, sy - 4.5)
      ctx.lineTo(sx + 3.8, sy)
      ctx.lineTo(sx, sy + 4.5)
      ctx.lineTo(sx - 3.8, sy)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
    ctx.restore()
  }

  _drawShots(ctx) {
    const u = this.unit
    for (const shot of this.gameplay.shots) {
      const elapsed = shot.maxLife - shot.life - (shot.delay || 0)
      if (elapsed < 0) continue
      const from = this.project(shot.from)
      const to = this.project(shot.to)
      const alpha = clamp(shot.life / shot.maxLife, 0, 1)
      const progress = shot.impacted ? 1 : clamp(elapsed / shot.travelDuration, 0, 1)
      const impactProg = shot.impacted ? clamp(1 - shot.life / shot.impactDuration, 0, 1) : 0

      ctx.save()

      if (shot.kind === 'chain' || shot.kind === 'chain_shock') {
        // High-voltage cryo electric arc jumping between targets
        ctx.globalAlpha = alpha
        ctx.strokeStyle = '#a9e9ff'
        ctx.lineWidth = 2.8
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        const midX = (from.x + to.x) / 2 + (Math.random() - 0.5) * u * 0.4
        const midY = (from.y + to.y) / 2 + (Math.random() - 0.5) * u * 0.4
        ctx.lineTo(midX, midY)
        ctx.lineTo(to.x, to.y)
        ctx.stroke()

        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(to.x, to.y, 3.5, 0, TAU)
        ctx.fill()
      } else if (shot.blast || shot.towerTypeId === 'blast') {
        // 🟠 Magma Fireball / Molten Meteor
        const loft = Math.sin(progress * Math.PI) * u * 0.45
        const curX = from.x + (to.x - from.x) * progress
        const curY = from.y + (to.y - from.y) * progress - loft

        if (!shot.impacted) {
          // Trailing fiery sparks & smoke
          for (let i = 1; i <= 3; i++) {
            const tp = Math.max(0, progress - i * 0.06)
            const tLoft = Math.sin(tp * Math.PI) * u * 0.45
            const tx = from.x + (to.x - from.x) * tp + (Math.random() - 0.5) * 3
            const ty = from.y + (to.y - from.y) * tp - tLoft + (Math.random() - 0.5) * 3
            ctx.fillStyle = `rgba(255, ${100 + i * 40}, 30, ${0.7 - i * 0.2})`
            ctx.beginPath()
            ctx.arc(tx, ty, u * (0.16 - i * 0.04), 0, TAU)
            ctx.fill()
          }

          // Main Molten Fireball
          const ballGrad = ctx.createRadialGradient(curX, curY, 0, curX, curY, u * 0.22)
          ballGrad.addColorStop(0, '#ffffff')
          ballGrad.addColorStop(0.3, '#ffeaa7')
          ballGrad.addColorStop(0.65, '#ff7675')
          ballGrad.addColorStop(1, 'rgba(214, 48, 49, 0.85)')
          ctx.fillStyle = ballGrad
          ctx.beginPath()
          ctx.arc(curX, curY, u * 0.22, 0, TAU)
          ctx.fill()
          ctx.strokeStyle = '#ffa502'
          ctx.lineWidth = 1.8
          ctx.stroke()
        }

        // Impact Explosion (when arriving at target)
        if (shot.impacted) {
          const blastR = (shot.radius || 0.11) * this.boardWidth * (0.3 + impactProg * 0.7)
          const explGrad = ctx.createRadialGradient(to.x, to.y, 0, to.x, to.y, blastR)
          explGrad.addColorStop(0, `rgba(255, 245, 180, ${1 - impactProg * 0.8})`)
          explGrad.addColorStop(0.45, `rgba(255, 107, 30, ${(1 - impactProg) * 0.8})`)
          explGrad.addColorStop(1, 'rgba(214, 48, 49, 0)')
          ctx.fillStyle = explGrad
          ctx.beginPath()
          ctx.arc(to.x, to.y, blastR, 0, TAU)
          ctx.fill()
          ctx.strokeStyle = `rgba(255, 220, 100, ${1 - impactProg})`
          ctx.lineWidth = 2
          ctx.stroke()
        }
      } else if (shot.kind === 'slow' || shot.kind === 'freeze' || shot.towerTypeId === 'slow') {
        // 🔵 Frost Ice Shard / Snowball / Cryo Mist
        const angle = Math.atan2(to.y - from.y, to.x - from.x)
        const curX = from.x + (to.x - from.x) * progress
        const curY = from.y + (to.y - from.y) * progress

        if (!shot.impacted) {
          // Trailing frost mist
          for (let i = 1; i <= 3; i++) {
            const tp = Math.max(0, progress - i * 0.07)
            const tx = from.x + (to.x - from.x) * tp
            const ty = from.y + (to.y - from.y) * tp
            ctx.fillStyle = `rgba(168, 236, 255, ${0.6 - i * 0.18})`
            ctx.beginPath()
            ctx.arc(tx, ty, u * (0.13 - i * 0.03), 0, TAU)
            ctx.fill()
          }

          // Rotating Flying Ice Crystal
          ctx.save()
          ctx.translate(curX, curY)
          ctx.rotate(progress * 12 + angle)

          // Outer sharp diamond crystal
          ctx.fillStyle = '#7cd8f5'
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1.4
          this._polygon(ctx, u * 0.16, 4, Math.PI / 4)

          // Inner white core
          ctx.fillStyle = '#ffffff'
          this._polygon(ctx, u * 0.08, 4, 0)
          ctx.restore()
        }

        // Frost Burst at impact
        if (shot.impacted) {
          ctx.strokeStyle = `rgba(180, 242, 255, ${1 - impactProg})`
          ctx.lineWidth = 1.8
          ctx.beginPath()
          ctx.arc(to.x, to.y, u * (0.2 + impactProg * 0.4), 0, TAU)
          ctx.stroke()
        }
      } else {
        // 🟢 Acid Poison Droplet / Spore Bullet / Sniper Dart
        const isSniper = shot.branchId === 'sniper'
        const isBurst = shot.kind === 'burst'
        const angle = Math.atan2(to.y - from.y, to.x - from.x)

        if (isSniper && !shot.impacted) {
          // High-Energy Cyan-Green Piercing Dart
          const curX = from.x + (to.x - from.x) * progress
          const curY = from.y + (to.y - from.y) * progress

          // Sharp Tracer Line behind the dart
          ctx.strokeStyle = 'rgba(46, 232, 168, 0.75)'
          ctx.lineWidth = 2.5
          ctx.beginPath()
          const tailP = Math.max(0, progress - 0.35)
          ctx.moveTo(from.x + (to.x - from.x) * tailP, from.y + (to.y - from.y) * tailP)
          ctx.lineTo(curX, curY)
          ctx.stroke()

          // Piercing Dart Head
          ctx.save()
          ctx.translate(curX, curY)
          ctx.rotate(angle)
          ctx.fillStyle = '#ffffff'
          ctx.strokeStyle = '#2ff5b4'
          ctx.lineWidth = 1.8
          ctx.beginPath()
          ctx.moveTo(u * 0.2, 0)
          ctx.lineTo(-u * 0.15, -u * 0.07)
          ctx.lineTo(-u * 0.08, 0)
          ctx.lineTo(-u * 0.15, u * 0.07)
          ctx.closePath()
          ctx.fill()
          ctx.stroke()
          ctx.restore()
        } else if (isBurst && !shot.impacted) {
          // Each droplet has its own launch delay and impact time.
          const bx = from.x + (to.x - from.x) * progress
          const by = from.y + (to.y - from.y) * progress

          ctx.save()
          ctx.translate(bx, by)
          ctx.rotate(angle)
          // Droplet
          ctx.fillStyle = '#2ecc71'
          ctx.strokeStyle = '#a9dfbf'
          ctx.lineWidth = 1.2
          ctx.beginPath()
          ctx.ellipse(0, 0, u * 0.12, u * 0.07, 0, 0, TAU)
          ctx.fill()
          ctx.stroke()
          // White highlight
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.arc(u * 0.03, -u * 0.02, u * 0.03, 0, TAU)
          ctx.fill()
          ctx.restore()
        } else {
          // Standard Glossy Acid Slime Droplet
          const curX = from.x + (to.x - from.x) * progress
          const curY = from.y + (to.y - from.y) * progress

          if (!shot.impacted) {
            // Trailing poison bubbles
            for (let i = 1; i <= 3; i++) {
              const tp = Math.max(0, progress - i * 0.08)
              const tx = from.x + (to.x - from.x) * tp
              const ty = from.y + (to.y - from.y) * tp
              ctx.fillStyle = `rgba(46, 232, 168, ${0.6 - i * 0.18})`
              ctx.beginPath()
              ctx.arc(tx, ty, u * (0.11 - i * 0.025), 0, TAU)
              ctx.fill()
            }

            // Main Teardrop Acid Bullet
            ctx.save()
            ctx.translate(curX, curY)
            ctx.rotate(angle)

            // Outer Acid Gel Bullet
            const dropGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, u * 0.15)
            dropGrad.addColorStop(0, '#ffffff')
            dropGrad.addColorStop(0.35, '#58ff9b')
            dropGrad.addColorStop(0.75, '#27ae60')
            dropGrad.addColorStop(1, '#145a32')
            ctx.fillStyle = dropGrad
            ctx.strokeStyle = '#a9dfbf'
            ctx.lineWidth = 1.4

            ctx.beginPath()
            ctx.moveTo(u * 0.16, 0)
            ctx.quadraticCurveTo(0, -u * 0.11, -u * 0.12, -u * 0.08)
            ctx.quadraticCurveTo(-u * 0.18, 0, -u * 0.12, u * 0.08)
            ctx.quadraticCurveTo(0, u * 0.11, u * 0.16, 0)
            ctx.fill()
            ctx.stroke()

            // Highlight dot
            ctx.fillStyle = '#ffffff'
            ctx.beginPath()
            ctx.arc(u * 0.04, -u * 0.03, u * 0.035, 0, TAU)
            ctx.fill()
            ctx.restore()
          }

        }

        // The hit ring starts on the same simulation step as damage, including lethal hits.
        if (shot.impacted) {
          ctx.strokeStyle = `rgba(88, 255, 155, ${1 - impactProg})`
          ctx.lineWidth = 1.6
          ctx.beginPath()
          ctx.arc(to.x, to.y, u * (0.15 + impactProg * 0.35), 0, TAU)
          ctx.stroke()
        }
      }

      ctx.restore()
    }
  }

  _drawStatus(ctx) {
    if (this.gameplay.state === 'finished') {
      ctx.fillStyle = 'rgba(5, 9, 11, 0.68)'
      ctx.fillRect(0, 0, this.width, this.height)
      ctx.textAlign = 'center'
      ctx.fillStyle = this.gameplay.outcome === 'victory' ? '#f0d577' : '#ef8a77'
      ctx.font = `700 ${clamp(this.width * 0.05, 30, 64)}px system-ui, sans-serif`
      ctx.fillText(this.gameplay.outcome === 'victory' ? '母巢守卫成功！' : '母巢失守', this.width / 2, this.height / 2)
    }
  }

  _drawShockSlime(ctx, tower, type, lookX, lookY) {
    const u = this.unit
    const recoil = tower.recoil || 0
    const elapsed = this.gameplay.elapsedTime || 0
    const rx = u * (0.46 - recoil * 0.08)
    const ry = u * (0.42 + recoil * 0.1)

    // Lightning Slime Body
    const g = ctx.createRadialGradient(-rx * 0.25, -ry * 0.35, rx * 0.1, 0, 0, rx)
    g.addColorStop(0, '#e056fd')
    g.addColorStop(0.65, '#be2edd')
    g.addColorStop(1, '#4834d4')
    ctx.fillStyle = g
    ctx.strokeStyle = '#22a6b3'
    ctx.lineWidth = 2.2
    ctx.beginPath()
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU)
    ctx.fill()
    ctx.stroke()

    // 2 Orbiting Electric Sparks
    for (let i = 0; i < 2; i++) {
      const angle = elapsed * 5 + i * Math.PI
      const sx = Math.cos(angle) * (rx * 1.3)
      const sy = Math.sin(angle) * (ry * 0.6)
      ctx.fillStyle = '#f9ca24'
      ctx.beginPath()
      ctx.arc(sx, sy, u * 0.08, 0, TAU)
      ctx.fill()
    }

    // Eyes
    this._drawSlimeEyes(ctx, rx, ry, lookX, lookY, '#f9ca24')
  }

  _drawArcaneSlime(ctx, tower, type, lookX, lookY) {
    const u = this.unit
    const recoil = tower.recoil || 0
    const elapsed = this.gameplay.elapsed || 0
    const rx = u * (0.48 - recoil * 0.06)
    const ry = u * (0.44 + recoil * 0.08)

    // Dark Gravity Void Body
    const g = ctx.createRadialGradient(-rx * 0.2, -ry * 0.3, rx * 0.1, 0, 0, rx)
    g.addColorStop(0, '#a55eea')
    g.addColorStop(0.6, '#4b4b4b')
    g.addColorStop(1, '#1e272e')
    ctx.fillStyle = g
    ctx.strokeStyle = '#a55eea'
    ctx.lineWidth = 2.4
    ctx.beginPath()
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU)
    ctx.fill()
    ctx.stroke()

    // Spinning Arcane Event Horizon Ring
    ctx.save()
    ctx.rotate(elapsed * 2.5)
    ctx.strokeStyle = '#8854d0'
    ctx.lineWidth = 1.8
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.ellipse(0, 0, rx * 1.25, ry * 0.5, 0, 0, TAU)
    ctx.stroke()
    ctx.restore()

    // Purple Eyes
    this._drawSlimeEyes(ctx, rx, ry, lookX, lookY, '#a55eea')
  }

  _drawRadiantSlime(ctx, tower, type, lookX, lookY) {
    const u = this.unit
    const recoil = tower.recoil || 0
    const elapsed = this.gameplay.elapsed || 0
    const rx = u * (0.46 - recoil * 0.07)
    const ry = u * (0.42 + recoil * 0.09)

    // Radiant Holy Golden Body
    const g = ctx.createRadialGradient(-rx * 0.25, -ry * 0.35, rx * 0.1, 0, 0, rx)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(0.5, '#f9ca24')
    g.addColorStop(1, '#f0932b')
    ctx.fillStyle = g
    ctx.strokeStyle = '#f6e58d'
    ctx.lineWidth = 2.4
    ctx.beginPath()
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU)
    ctx.fill()
    ctx.stroke()

    // Floating Sun Crown / Halo
    const haloY = -ry * 1.15 + Math.sin(elapsed * 3) * u * 0.05
    ctx.strokeStyle = '#f9ca24'
    ctx.lineWidth = 2.0
    ctx.beginPath()
    ctx.ellipse(0, haloY, rx * 0.65, ry * 0.25, 0, 0, TAU)
    ctx.stroke()

    // Golden Eyes
    this._drawSlimeEyes(ctx, rx, ry, lookX, lookY, '#ffffff')
  }

  _drawSlimeEyes(ctx, rx, ry, lookX, lookY, eyeColor = '#ffffff') {
    const u = this.unit
    const eyeOffsetX = lookX * (rx * 0.25)
    const eyeOffsetY = lookY * (ry * 0.2)
    const eyeSpacing = rx * 0.35

    // Left Eye
    ctx.fillStyle = eyeColor
    ctx.beginPath()
    ctx.arc(-eyeSpacing + eyeOffsetX, -ry * 0.15 + eyeOffsetY, u * 0.10, 0, TAU)
    ctx.fill()

    // Right Eye
    ctx.beginPath()
    ctx.arc(eyeSpacing + eyeOffsetX, -ry * 0.15 + eyeOffsetY, u * 0.10, 0, TAU)
    ctx.fill()

    // Pupils
    ctx.fillStyle = '#000000'
    ctx.beginPath()
    ctx.arc(-eyeSpacing + eyeOffsetX + lookX * u * 0.03, -ry * 0.15 + eyeOffsetY + lookY * u * 0.03, u * 0.05, 0, TAU)
    ctx.arc(eyeSpacing + eyeOffsetX + lookX * u * 0.03, -ry * 0.15 + eyeOffsetY + lookY * u * 0.03, u * 0.05, 0, TAU)
    ctx.fill()
  }

  _drawTutorialGuide(ctx) {
    const tut = this.gameplay.tutorial
    if (!tut || !tut.active) return
    const elapsed = this.gameplay.elapsed || 0
    const u = this.unit
    const pulse = Math.sin(elapsed * 6) * 0.3 + 0.7

    ctx.save()
    if (tut.step === 1) {
      // Guide to first build slot
      const slotDef = this.gameplay.buildSlots?.[0]
      if (slotDef && !this.gameplay.getTowerAtSlot(0)) {
        const pt = this.project(slotDef)
        // Pulsing green beacon
        ctx.strokeStyle = `rgba(46, 204, 113, ${pulse})`
        ctx.lineWidth = 3.5
        ctx.setLineDash([6, 4])
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, u * 0.85, 0, TAU)
        ctx.stroke()
        ctx.setLineDash([])

        // Bouncing Arrow
        const bounce = Math.sin(elapsed * 5) * u * 0.15
        ctx.fillStyle = '#2ecc71'
        ctx.font = `900 ${clamp(u * 0.6, 22, 32)}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText('👇', pt.x, pt.y - u * 0.95 + bounce)
      }
    } else if (tut.step === 2) {
      const tower = this.gameplay.towers?.find(t => t.level === 1)
      if (tower) {
        const pt = this.project(this.gameplay.buildSlots[tower.slotIndex])
        // Pulsing orange beacon
        ctx.strokeStyle = `rgba(243, 156, 18, ${pulse})`
        ctx.lineWidth = 3.5
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, u * 0.85, 0, TAU)
        ctx.stroke()

        const bounce = Math.sin(elapsed * 5) * u * 0.15
        ctx.fillStyle = '#f39c12'
        ctx.font = `900 ${clamp(u * 0.6, 22, 32)}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText('👇', pt.x, pt.y - u * 0.95 + bounce)
      }
    }
    ctx.restore()
  }
}
