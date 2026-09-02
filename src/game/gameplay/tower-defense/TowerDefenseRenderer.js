import { AssetManager } from '../../AssetManager.js'
import {
  TOWER_DEFENSE_BUILD_SLOTS,
  TOWER_DEFENSE_LEYLINE_TYPES,
  TOWER_DEFENSE_PATH,
  TOWER_DEFENSE_SLOT_LEYLINES,
  TOWER_DEFENSE_TOWER_TYPES,
  TOWER_DEFENSE_TRAPS,
  getSlotLeylineResonance,
  getTowerDefensePathPosition,
  getTowerStats,
} from './TowerDefenseRules.js'

const TAU = Math.PI * 2
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const ENEMY_ROLE_MAP = {
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
  }

  ensureLayout() {
    const game = this.gameplay.game
    if (!game || (game.width === this.width && game.height === this.height)) return
    this.width = Math.max(1, game.width)
    this.height = Math.max(1, game.height)
    const side = clamp(this.width * 0.035, 18, 54)
    const top = clamp(this.height * 0.11, 58, 92)
    const bottom = clamp(this.height * 0.055, 24, 48)
    this.left = side
    this.top = top
    this.boardWidth = Math.max(1, this.width - side * 2)
    this.boardHeight = Math.max(1, this.height - top - bottom)
    this.unit = clamp(Math.min(this.boardWidth, this.boardHeight) * 0.064, 28, 56)
  }

  project(point) {
    return {
      x: this.left + point.x * this.boardWidth,
      y: this.top + point.y * this.boardHeight,
    }
  }

  unproject(x, y) {
    this.ensureLayout()
    return {
      x: (x - this.left) / this.boardWidth,
      y: (y - this.top) / this.boardHeight,
    }
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
    this._drawBackdrop(ctx)
    this._drawEnvironmentDecorations(ctx)
    this._drawPath(ctx)
    this._drawBurnZones(ctx)
    this._drawBuildSlots(ctx)
    this._drawTraps(ctx)
    this._drawEnemies(ctx)
    this._drawTowers(ctx)
    this._drawShots(ctx)
    this._drawTrapEvents(ctx)
    this._drawAmbientParticles(ctx)
    this._drawTutorialGuide(ctx)
    this._drawStatus(ctx)
  }

  _drawBackdrop(ctx) {
    const chapterId = this.gameplay.stageConfig?.chapterId || 1
    const stageId = this.gameplay.currentStageId || 1
    const timeOfDay = this.gameplay.stageConfig?.timeOfDay || 'noon'
    const theme = this.gameplay.stageConfig?.theme || {}
    const u = this.unit

    // 1. Base Gradient Canvas
    ctx.fillStyle = theme.bgBase || '#0e1815'
    ctx.fillRect(0, 0, this.width, this.height)

    const grad = ctx.createRadialGradient(
      this.left + this.boardWidth * 0.5,
      this.top + this.boardHeight * 0.45,
      u * 1.5,
      this.left + this.boardWidth * 0.5,
      this.top + this.boardHeight * 0.5,
      Math.max(this.boardWidth, this.boardHeight) * 0.72
    )

    if (chapterId === 1) {
      // 🌿 Verdant Deep Forest Canopy with Time-of-Day variation
      if (timeOfDay === 'dawn') {
        grad.addColorStop(0, '#1a3829')
        grad.addColorStop(0.5, '#0f271d')
        grad.addColorStop(1, '#081610')
      } else if (timeOfDay === 'amber_dusk') {
        grad.addColorStop(0, '#283318')
        grad.addColorStop(0.5, '#1a2410')
        grad.addColorStop(1, '#0d1308')
      } else if (timeOfDay === 'twilight') {
        grad.addColorStop(0, '#1c2432')
        grad.addColorStop(0.5, '#111822')
        grad.addColorStop(1, '#090d14')
      } else if (timeOfDay === 'midnight') {
        grad.addColorStop(0, '#112220')
        grad.addColorStop(0.5, '#091514')
        grad.addColorStop(1, '#040b0a')
      } else {
        grad.addColorStop(0, '#152f23')
        grad.addColorStop(0.5, '#0e2319')
        grad.addColorStop(1, '#07130e')
      }
    } else if (chapterId === 2) {
      grad.addColorStop(0, '#142738')
      grad.addColorStop(0.55, '#0d1a26')
      grad.addColorStop(1, '#060e15')
    } else if (chapterId === 3) {
      grad.addColorStop(0, '#2d140e')
      grad.addColorStop(0.55, '#1e0c08')
      grad.addColorStop(1, '#100503')
    } else if (chapterId === 4) {
      grad.addColorStop(0, '#1e1430')
      grad.addColorStop(0.55, '#140c22')
      grad.addColorStop(1, '#0a0512')
    } else {
      grad.addColorStop(0, '#282012')
      grad.addColorStop(0.55, '#1b140a')
      grad.addColorStop(1, '#0d0a04')
    }

    ctx.fillStyle = grad
    ctx.fillRect(this.left, this.top, this.boardWidth, this.boardHeight)

    // 2. Organic Floor Texturing (Moss patches, soil spots, stone pavers)
    this._drawGroundTexture(ctx, chapterId)
  }

  _drawGroundTexture(ctx, chapterId) {
    const u = this.unit
    ctx.save()

    if (chapterId === 1) {
      // 🌿 Forest Floor: Dappled canopy moonlight & moss patches
      const patches = [
        { x: 0.12, y: 0.25, r: 1.4, color: 'rgba(46, 204, 113, 0.05)' },
        { x: 0.82, y: 0.32, r: 1.8, color: 'rgba(39, 174, 96, 0.06)' },
        { x: 0.35, y: 0.78, r: 1.6, color: 'rgba(88, 201, 165, 0.05)' },
        { x: 0.68, y: 0.65, r: 2.1, color: 'rgba(46, 204, 113, 0.04)' },
        { x: 0.50, y: 0.18, r: 1.3, color: 'rgba(38, 222, 129, 0.05)' },
      ]
      for (const p of patches) {
        const pt = this.project(p)
        const rad = p.r * u
        const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, rad)
        g.addColorStop(0, p.color)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, rad, 0, TAU)
        ctx.fill()
      }
    } else if (chapterId === 2) {
      // ❄️ Glacial: Frost crystal patches
      const patches = [
        { x: 0.2, y: 0.3, r: 1.8, color: 'rgba(56, 210, 255, 0.06)' },
        { x: 0.75, y: 0.25, r: 2.2, color: 'rgba(56, 210, 255, 0.05)' },
        { x: 0.4, y: 0.8, r: 1.9, color: 'rgba(56, 210, 255, 0.06)' },
      ]
      for (const p of patches) {
        const pt = this.project(p)
        const rad = p.r * u
        const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, rad)
        g.addColorStop(0, p.color)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, rad, 0, TAU)
        ctx.fill()
      }
    } else if (chapterId === 3) {
      // 🔥 Volcanic: Magma fissure glows
      const patches = [
        { x: 0.25, y: 0.2, r: 1.8, color: 'rgba(255, 107, 107, 0.08)' },
        { x: 0.8, y: 0.6, r: 2.2, color: 'rgba(255, 159, 67, 0.07)' },
        { x: 0.3, y: 0.85, r: 1.7, color: 'rgba(255, 107, 107, 0.08)' },
      ]
      for (const p of patches) {
        const pt = this.project(p)
        const rad = p.r * u
        const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, rad)
        g.addColorStop(0, p.color)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, rad, 0, TAU)
        ctx.fill()
      }
    }

    ctx.restore()
  }

  _drawEnvironmentDecorations(ctx) {
    const stageId = this.gameplay.currentStageId || 1
    const chapterId = this.gameplay.stageConfig?.chapterId || 1
    const stageInChapter = this.gameplay.stageConfig?.stageInChapter || (stageId - (chapterId - 1) * 20)
    const tier = Math.min(3, Math.max(0, Math.floor((stageInChapter - 1) / 5))) // 0: 1-5, 1: 6-10, 2: 11-15, 3: 16-20

    if (chapterId === 1) {
      this._drawForestElements(ctx, stageId, tier)
    } else if (chapterId === 2) {
      this._drawGlacialElements(ctx, stageId, tier)
    } else if (chapterId === 3) {
      this._drawVolcanicElements(ctx, stageId, tier)
    } else if (chapterId === 4) {
      this._drawSuperconductorElements(ctx, stageId, tier)
    } else {
      this._drawImperialElements(ctx, stageId, tier)
    }
  }

  _drawForestElements(ctx, stageId = 1, tier = 0) {
    const u = this.unit
    const elapsed = this.gameplay.elapsedTime || 0

    // 1. Trees adapted to sub-biome tier
    const treeTypes = tier === 0 ? ['oak', 'pine'] : tier === 1 ? ['pine', 'pine'] : tier === 2 ? ['moss_willow', 'oak'] : ['ancient_colossus', 'oak']
    const baseTrees = [
      { x: 0.04, y: 0.05, r: 1.30, type: treeTypes[0] },
      { x: 0.94, y: 0.06, r: 1.35, type: treeTypes[1] },
      { x: 0.04, y: 0.94, r: 1.30, type: treeTypes[0] },
      { x: 0.94, y: 0.94, r: 1.40, type: treeTypes[1] },
      { x: 0.52, y: 0.04, r: 1.15, type: treeTypes[0] },
    ]
    if (tier >= 1) {
      baseTrees.push({ x: 0.05, y: 0.48, r: 1.10, type: treeTypes[1] })
      baseTrees.push({ x: 0.93, y: 0.48, r: 1.15, type: treeTypes[0] })
    }
    for (const tree of baseTrees) {
      const pt = this.project(tree)
      this._drawCanopyTree(ctx, pt.x, pt.y, tree.r * u, tree.type)
    }

    // 2. Bushes & Shrubs
    const bushes = [
      { x: 0.15, y: 0.10, s: 0.55 },
      { x: 0.38, y: 0.08, s: 0.65 },
      { x: 0.72, y: 0.08, s: 0.60 },
      { x: 0.08, y: 0.78, s: 0.65 },
      { x: 0.35, y: 0.88, s: 0.55 },
      { x: 0.68, y: 0.88, s: 0.60 },
    ]
    for (const bush of bushes) {
      const pt = this.project(bush)
      this._drawForestBush(ctx, pt.x, pt.y, bush.s * u)
    }

    // 3. Rocks & Boulders
    const rocks = [
      { x: 0.22, y: 0.06, rx: 0.38, ry: 0.28 },
      { x: 0.58, y: 0.08, rx: 0.42, ry: 0.30 },
      { x: 0.07, y: 0.62, rx: 0.40, ry: 0.30 },
      { x: 0.74, y: 0.92, rx: 0.45, ry: 0.32 },
    ]
    for (const rock of rocks) {
      const pt = this.project(rock)
      this._drawMossyRock(ctx, pt.x, pt.y, rock.rx * u, rock.ry * u)
    }

    // 4. Wild Mushrooms (Different themes: Tier 0 standard, Tier 1 toxic red/purple, Tier 2 glowing teal/poison, Tier 3 amber sacred)
    const shroomColors = tier === 0
      ? ['#ff6b6b', '#a29bfe', '#fdcb6e']
      : tier === 1
        ? ['#e84393', '#6c5ce7', '#d63031']
        : tier === 2
          ? ['#00cec9', '#55efc4', '#0984e3']
          : ['#f9ca24', '#f0932b', '#ffbe76']

    const mushrooms = [
      { x: 0.18, y: 0.13, s: 0.26, color: shroomColors[0] },
      { x: 0.42, y: 0.06, s: 0.22, color: shroomColors[1] },
      { x: 0.84, y: 0.12, s: 0.28, color: shroomColors[2] },
      { x: 0.06, y: 0.70, s: 0.25, color: shroomColors[0] },
      { x: 0.32, y: 0.92, s: 0.24, color: shroomColors[1] },
      { x: 0.78, y: 0.86, s: 0.28, color: shroomColors[2] },
    ]
    for (const m of mushrooms) {
      const pt = this.project(m)
      this._drawForestMushroom(ctx, pt.x, pt.y, m.s * u, m.color)
    }

    // 5. Special Tier 3 Boss Props (Ancient Colossal Roots & Burning Battle Torches)
    if (tier === 3 || stageId === 20) {
      // Draw 2 Ancient Ground Roots
      const root1 = this.project({ x: 0.20, y: 0.52 })
      const root2 = this.project({ x: 0.70, y: 0.52 })
      ctx.save()
      ctx.strokeStyle = '#3e2723'
      ctx.lineWidth = u * 0.25
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(root1.x - u * 0.5, root1.y + u * 0.4)
      ctx.quadraticCurveTo(root1.x, root1.y - u * 0.2, root1.x + u * 0.6, root1.y + u * 0.3)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(root2.x - u * 0.6, root2.y - u * 0.3)
      ctx.quadraticCurveTo(root2.x, root2.y + u * 0.2, root2.x + u * 0.5, root2.y - u * 0.3)
      ctx.stroke()

      // Fiery Torches
      const torchX = root1.x
      const torchY = root1.y - u * 0.3
      const flamePulse = Math.sin(elapsed * 8) * u * 0.04
      ctx.fillStyle = '#f39c12'
      ctx.beginPath()
      ctx.arc(torchX, torchY, u * 0.12 + flamePulse, 0, TAU)
      ctx.fill()
      ctx.fillStyle = '#ff7675'
      ctx.beginPath()
      ctx.arc(torchX, torchY - u * 0.04, u * 0.08 + flamePulse * 0.5, 0, TAU)
      ctx.fill()
      ctx.restore()
    }
  }

  _drawCanopyTree(ctx, x, y, radius, type = 'oak') {
    ctx.save()
    ctx.translate(x, y)

    // Tree Ground Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
    ctx.beginPath()
    ctx.ellipse(0, radius * 0.4, radius * 0.9, radius * 0.45, 0, 0, TAU)
    ctx.fill()

    if (type === 'pine') {
      // Conifer Pine Tree
      const layers = [
        { dy: radius * 0.2, r: radius * 0.85, c1: '#1b4332', c2: '#0d281e' },
        { dy: -radius * 0.15, r: radius * 0.65, c1: '#2d6a4f', c2: '#1b4332' },
        { dy: -radius * 0.50, r: radius * 0.45, c1: '#40916c', c2: '#2d6a4f' },
      ]
      for (const l of layers) {
        ctx.fillStyle = l.c1
        ctx.strokeStyle = l.c2
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(0, l.dy - l.r * 0.9)
        ctx.lineTo(l.r * 0.85, l.dy + l.r * 0.5)
        ctx.lineTo(-l.r * 0.85, l.dy + l.r * 0.5)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
    } else {
      // Broadleaf Oak Tree (Multi-layered spherical lush canopy)
      const orbs = [
        { ox: -radius * 0.28, oy: radius * 0.1, r: radius * 0.52, col: '#1b4332' },
        { ox: radius * 0.30, oy: radius * 0.12, r: radius * 0.50, col: '#1e4d39' },
        { ox: 0, oy: radius * 0.2, r: radius * 0.58, col: '#2d6a4f' },
        { ox: -radius * 0.18, oy: -radius * 0.18, r: radius * 0.46, col: '#40916c' },
        { ox: radius * 0.18, oy: -radius * 0.15, r: radius * 0.44, col: '#52b788' },
        { ox: 0, oy: -radius * 0.28, r: radius * 0.40, col: '#74c69d' },
      ]
      for (const orb of orbs) {
        const g = ctx.createRadialGradient(
          orb.ox - orb.r * 0.3,
          orb.oy - orb.r * 0.3,
          orb.r * 0.1,
          orb.ox,
          orb.oy,
          orb.r
        )
        g.addColorStop(0, orb.col)
        g.addColorStop(1, '#0d281e')
        ctx.fillStyle = g
        ctx.strokeStyle = '#081c14'
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.arc(orb.ox, orb.oy, orb.r, 0, TAU)
        ctx.fill()
        ctx.stroke()
      }
    }

    ctx.restore()
  }

  _drawForestBush(ctx, x, y, size) {
    ctx.save()
    ctx.translate(x, y)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
    ctx.beginPath()
    ctx.ellipse(0, size * 0.3, size * 0.8, size * 0.35, 0, 0, TAU)
    ctx.fill()

    const lobes = [
      { ox: -size * 0.3, oy: 0, r: size * 0.45, col: '#2d6a4f' },
      { ox: size * 0.3, oy: 0, r: size * 0.42, col: '#40916c' },
      { ox: 0, oy: -size * 0.2, r: size * 0.48, col: '#52b788' },
    ]
    for (const lobe of lobes) {
      ctx.fillStyle = lobe.col
      ctx.strokeStyle = '#183a2b'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.arc(lobe.ox, lobe.oy, lobe.r, 0, TAU)
      ctx.fill()
      ctx.stroke()
    }
    ctx.restore()
  }

  _drawMossyRock(ctx, x, y, rx, ry) {
    ctx.save()
    ctx.translate(x, y)

    // Rock Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
    ctx.beginPath()
    ctx.ellipse(0, ry * 0.35, rx * 1.05, ry * 0.5, 0, 0, TAU)
    ctx.fill()

    // Stone Body (Deep River Slate)
    const stoneGrad = ctx.createLinearGradient(0, -ry, 0, ry)
    stoneGrad.addColorStop(0, '#576574')
    stoneGrad.addColorStop(1, '#222f3e')
    ctx.fillStyle = stoneGrad
    ctx.strokeStyle = '#1e272e'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU)
    ctx.fill()
    ctx.stroke()

    // Green Moss Top Cap
    ctx.fillStyle = '#2ecc71'
    ctx.beginPath()
    ctx.ellipse(0, -ry * 0.3, rx * 0.8, ry * 0.5, 0, 0, Math.PI)
    ctx.fill()

    ctx.restore()
  }

  _drawForestMushroom(ctx, x, y, size, color) {
    ctx.save()
    ctx.translate(x, y)

    // Stem
    ctx.fillStyle = '#ecf0f1'
    ctx.strokeStyle = '#bdc3c7'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(-size * 0.15, -size * 0.1, size * 0.3, size * 0.8, 3)
    ctx.fill()
    ctx.stroke()

    // Cap
    ctx.fillStyle = color || '#ff6b6b'
    ctx.strokeStyle = '#b33939'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.arc(0, -size * 0.1, size * 0.55, Math.PI, 0)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // White Spots
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(-size * 0.22, -size * 0.35, size * 0.08, 0, TAU)
    ctx.arc(0, -size * 0.48, size * 0.1, 0, TAU)
    ctx.arc(size * 0.22, -size * 0.35, size * 0.08, 0, TAU)
    ctx.fill()

    ctx.restore()
  }

  _drawGrassTuft(ctx, x, y, size) {
    ctx.save()
    ctx.translate(x, y)
    ctx.strokeStyle = '#2ecc71'
    ctx.lineWidth = 1.8
    ctx.lineCap = 'round'

    // Left blade
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(-size * 0.4, -size * 0.6, -size * 0.6, -size)
    ctx.stroke()

    // Center blade
    ctx.strokeStyle = '#55efc4'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(0, -size * 0.7, 0, -size * 1.15)
    ctx.stroke()

    // Right blade
    ctx.strokeStyle = '#2ecc71'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(size * 0.4, -size * 0.6, size * 0.6, -size * 0.9)
    ctx.stroke()

    ctx.restore()
  }

  _drawGlacialElements(ctx) {
    const u = this.unit
    const rocks = [
      { x: 0.08, y: 0.12, r: 0.9 },
      { x: 0.92, y: 0.10, r: 1.1 },
      { x: 0.06, y: 0.88, r: 1.0 },
      { x: 0.90, y: 0.88, r: 1.15 },
    ]
    for (const rk of rocks) {
      const pt = this.project(rk)
      ctx.save()
      ctx.translate(pt.x, pt.y)
      ctx.fillStyle = '#1e374d'
      ctx.strokeStyle = '#70a1ff'
      ctx.lineWidth = 1.6
      this._polygon(ctx, rk.r * u * 0.6, 6)
      ctx.fill()
      ctx.stroke()
      // Ice highlight
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(-rk.r * u * 0.15, -rk.r * u * 0.15, rk.r * u * 0.2, 0, TAU)
      ctx.fill()
      ctx.restore()
    }
  }

  _drawVolcanicElements(ctx) {
    const u = this.unit
    const vents = [
      { x: 0.1, y: 0.12, r: 0.8 },
      { x: 0.88, y: 0.15, r: 0.9 },
      { x: 0.12, y: 0.85, r: 0.95 },
      { x: 0.86, y: 0.85, r: 1.05 },
    ]
    for (const v of vents) {
      const pt = this.project(v)
      ctx.save()
      ctx.translate(pt.x, pt.y)
      ctx.fillStyle = '#2d150f'
      ctx.strokeStyle = '#ff6b6b'
      ctx.lineWidth = 1.8
      this._polygon(ctx, v.r * u * 0.55, 5)
      ctx.fill()
      ctx.stroke()
      // Lava core
      ctx.fillStyle = '#ff9f43'
      ctx.beginPath()
      ctx.arc(0, 0, v.r * u * 0.22, 0, TAU)
      ctx.fill()
      ctx.restore()
    }
  }

  _drawSuperconductorElements(ctx) {
    const u = this.unit
    const crystals = [
      { x: 0.08, y: 0.12, r: 0.75 },
      { x: 0.92, y: 0.12, r: 0.85 },
      { x: 0.08, y: 0.88, r: 0.8 },
      { x: 0.92, y: 0.88, r: 0.9 },
    ]
    for (const c of crystals) {
      const pt = this.project(c)
      ctx.save()
      ctx.translate(pt.x, pt.y)
      ctx.fillStyle = '#341f97'
      ctx.strokeStyle = '#a55eea'
      ctx.lineWidth = 1.6
      this._polygon(ctx, c.r * u * 0.5, 4, Math.PI / 4)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }
  }

  _drawImperialElements(ctx) {
    const u = this.unit
    const pillars = [
      { x: 0.08, y: 0.12, r: 0.7 },
      { x: 0.92, y: 0.12, r: 0.7 },
      { x: 0.08, y: 0.88, r: 0.7 },
      { x: 0.92, y: 0.88, r: 0.7 },
    ]
    for (const p of pillars) {
      const pt = this.project(p)
      ctx.save()
      ctx.translate(pt.x, pt.y)
      ctx.fillStyle = '#3a3224'
      ctx.strokeStyle = '#f1c40f'
      ctx.lineWidth = 1.8
      ctx.fillRect(-p.r * u * 0.35, -p.r * u * 0.35, p.r * u * 0.7, p.r * u * 0.7)
      ctx.strokeRect(-p.r * u * 0.35, -p.r * u * 0.35, p.r * u * 0.7, p.r * u * 0.7)
      ctx.restore()
    }
  }

  _tracePath(ctx) {
    const path = this.gameplay.stageConfig?.path || TOWER_DEFENSE_PATH
    const start = this.project(path[0])
    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    for (let index = 1; index < path.length; index++) {
      const point = this.project(path[index])
      ctx.lineTo(point.x, point.y)
    }
  }

  _drawPath(ctx) {
    const chapterId = this.gameplay.stageConfig?.chapterId || 1
    const theme = this.gameplay.stageConfig?.theme || {}
    const path = this.gameplay.stageConfig?.path || TOWER_DEFENSE_PATH
    const u = this.unit

    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (chapterId === 1) {
      // 🌿 Chapter 1: Natural Forest Earthen Cobblestone Trail (林间幽径)
      // 1. Dark Loam & Moss Turf Roadbed
      this._tracePath(ctx)
      ctx.strokeStyle = '#07150e'
      ctx.lineWidth = u * 2.3
      ctx.stroke()

      this._tracePath(ctx)
      ctx.strokeStyle = '#1e402e'
      ctx.lineWidth = u * 1.95
      ctx.stroke()

      // 2. Rich Earthen Dirt Core
      this._tracePath(ctx)
      ctx.strokeStyle = '#3d2e20'
      ctx.lineWidth = u * 1.5
      ctx.stroke()

      this._tracePath(ctx)
      ctx.strokeStyle = '#54402e'
      ctx.lineWidth = u * 1.15
      ctx.stroke()

      // 3. Natural Cobblestone Stepping Stones along the trail
      this._drawCobblestonesAlongPath(ctx, path)

    } else if (chapterId === 2) {
      // ❄️ Glacial Frozen Ice Pack
      this._tracePath(ctx)
      ctx.strokeStyle = '#06131f'
      ctx.lineWidth = u * 2.2
      ctx.stroke()

      this._tracePath(ctx)
      ctx.strokeStyle = '#2980b9'
      ctx.lineWidth = u * 1.8
      ctx.stroke()

      this._tracePath(ctx)
      ctx.strokeStyle = '#74b9ff'
      ctx.lineWidth = u * 1.35
      ctx.stroke()

      ctx.setLineDash([u * 0.4, u * 0.45])
      this._tracePath(ctx)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)'
      ctx.lineWidth = 2.2
      ctx.stroke()

    } else if (chapterId === 3) {
      // 🔥 Volcanic Magma Basalt Trail
      this._tracePath(ctx)
      ctx.strokeStyle = '#180703'
      ctx.lineWidth = u * 2.2
      ctx.stroke()

      this._tracePath(ctx)
      ctx.strokeStyle = '#d63031'
      ctx.lineWidth = u * 1.8
      ctx.stroke()

      this._tracePath(ctx)
      ctx.strokeStyle = '#2d140e'
      ctx.lineWidth = u * 1.35
      ctx.stroke()

      ctx.setLineDash([u * 0.35, u * 0.35])
      this._tracePath(ctx)
      ctx.strokeStyle = '#ff9f43'
      ctx.lineWidth = 2.4
      ctx.stroke()

    } else if (chapterId === 4) {
      // ⚡ Superconductor Arcane Void Road
      this._tracePath(ctx)
      ctx.strokeStyle = '#0e0618'
      ctx.lineWidth = u * 2.2
      ctx.stroke()

      this._tracePath(ctx)
      ctx.strokeStyle = '#6c5ce7'
      ctx.lineWidth = u * 1.8
      ctx.stroke()

      this._tracePath(ctx)
      ctx.strokeStyle = '#241738'
      ctx.lineWidth = u * 1.35
      ctx.stroke()

      ctx.setLineDash([u * 0.4, u * 0.4])
      this._tracePath(ctx)
      ctx.strokeStyle = '#ffeaa7'
      ctx.lineWidth = 2.2
      ctx.stroke()

    } else {
      // 👑 Imperial Golden Highway
      this._tracePath(ctx)
      ctx.strokeStyle = '#120e05'
      ctx.lineWidth = u * 2.2
      ctx.stroke()

      this._tracePath(ctx)
      ctx.strokeStyle = '#f1c40f'
      ctx.lineWidth = u * 1.8
      ctx.stroke()

      this._tracePath(ctx)
      ctx.strokeStyle = '#382e18'
      ctx.lineWidth = u * 1.35
      ctx.stroke()

      ctx.setLineDash([u * 0.45, u * 0.45])
      this._tracePath(ctx)
      ctx.strokeStyle = '#ffd700'
      ctx.lineWidth = 2.5
      ctx.stroke()
    }

    ctx.restore()

    const entrance = this.project(path[0])
    const base = this.project(path.at(-1))
    this._drawWarpPortal(ctx, entrance)
    this._drawSlimeBase(ctx, base)
  }

  _drawCobblestonesAlongPath(ctx, path) {
    const u = this.unit
    // Draw 30 embedded rounded stones along the path coordinates
    for (let i = 0; i <= 36; i++) {
      const progress = i / 36
      const pos = getTowerDefensePathPosition(progress, path)
      const pt = this.project(pos)

      // Alternating offset perpendicular to path
      const angle = (pos.facing || 0) + Math.PI / 2
      const offset = (Math.sin(i * 4.7) * 0.3) * u
      const stoneX = pt.x + Math.cos(angle) * offset
      const stoneY = pt.y + Math.sin(angle) * offset
      const stoneR = (0.16 + (Math.sin(i * 3.1) + 1) * 0.08) * u

      ctx.fillStyle = i % 2 === 0 ? '#635446' : '#7d6c5b'
      ctx.strokeStyle = '#33271c'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.ellipse(stoneX, stoneY, stoneR, stoneR * 0.75, pos.facing || 0, 0, TAU)
      ctx.fill()
      ctx.stroke()
    }
  }

  _drawAmbientParticles(ctx) {
    const chapterId = this.gameplay.stageConfig?.chapterId || 1
    const elapsed = this.gameplay.elapsedTime || 0
    const u = this.unit
    ctx.save()

    if (chapterId === 1) {
      // 🌿 Floating Glowing Golden-Green Forest Fireflies (微光萤火虫)
      const fireflyCount = 20
      for (let i = 0; i < fireflyCount; i++) {
        const seedX = ((i * 137.5) % 100) / 100
        const seedY = ((i * 269.3) % 100) / 100
        const speedX = 0.03 + (i % 5) * 0.015
        const speedY = 0.04 + (i % 4) * 0.012

        const fx = (seedX + elapsed * speedX * 0.15) % 1.0
        const fy = (seedY + Math.sin(elapsed * speedY + i) * 0.08 + elapsed * 0.01) % 1.0

        const screenPos = {
          x: this.left + fx * this.boardWidth,
          y: this.top + fy * this.boardHeight,
        }

        const pulse = 0.4 + Math.sin(elapsed * 2.5 + i * 1.8) * 0.35
        if (pulse <= 0.05) continue

        const rad = (3 + (i % 3) * 1.5) * (u / 36)

        // Firefly Glow Halo
        const glow = ctx.createRadialGradient(screenPos.x, screenPos.y, 0, screenPos.x, screenPos.y, rad * 3)
        glow.addColorStop(0, `rgba(186, 255, 107, ${pulse * 0.8})`)
        glow.addColorStop(0.5, `rgba(78, 230, 133, ${pulse * 0.4})`)
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(screenPos.x, screenPos.y, rad * 3, 0, TAU)
        ctx.fill()

        // Firefly Center Spark
        ctx.fillStyle = `rgba(255, 255, 230, ${pulse})`
        ctx.beginPath()
        ctx.arc(screenPos.x, screenPos.y, rad * 0.8, 0, TAU)
        ctx.fill()
      }
    } else if (chapterId === 2) {
      // ❄️ Falling Snowflakes
      const snowCount = 24
      for (let i = 0; i < snowCount; i++) {
        const seedX = ((i * 153.2) % 100) / 100
        const seedY = ((i * 211.7) % 100) / 100
        const sx = (seedX + Math.sin(elapsed + i) * 0.05) % 1.0
        const sy = (seedY + elapsed * (0.05 + (i % 4) * 0.02)) % 1.0
        const pt = { x: this.left + sx * this.boardWidth, y: this.top + sy * this.boardHeight }
        ctx.fillStyle = 'rgba(235, 245, 255, 0.75)'
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, 2 + (i % 3), 0, TAU)
        ctx.fill()
      }
    } else if (chapterId === 3) {
      // 🔥 Rising Embers
      const emberCount = 20
      for (let i = 0; i < emberCount; i++) {
        const seedX = ((i * 179.1) % 100) / 100
        const seedY = ((i * 131.4) % 100) / 100
        const ex = (seedX + Math.sin(elapsed * 2 + i) * 0.04) % 1.0
        const ey = (seedY - elapsed * (0.06 + (i % 3) * 0.03)) % 1.0
        const fixedEy = ey < 0 ? ey + 1.0 : ey
        const pt = { x: this.left + ex * this.boardWidth, y: this.top + fixedEy * this.boardHeight }
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 107, 107, 0.8)' : 'rgba(255, 159, 67, 0.8)'
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, 2.5, 0, TAU)
        ctx.fill()
      }
    }

    ctx.restore()
  }

  _drawWarpPortal(ctx, entrance) {
    const u = this.unit
    const elapsed = this.gameplay.elapsed || 0

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
    const elapsed = this.gameplay.elapsed || 0
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
    for (let index = 0; index < slots.length; index++) {
      const slotDef = slots[index]
      const point = this.project(slotDef)
      const occupied = !!this.gameplay.getTowerAtSlot(index)
      const hovered = index === this.gameplay.hoveredSlotIndex
      const isLocked = !this.gameplay.unlockedSlots.has(index)
      const leylineId = slotDef.leyline || TOWER_DEFENSE_SLOT_LEYLINES[index] || 'acid'
      const leyline = TOWER_DEFENSE_LEYLINE_TYPES[leylineId]

      if (isLocked) {
        // Locked / Wild Sealed Obstacle Node
        ctx.save()
        ctx.translate(point.x, point.y)

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

        // Soft ambient Leyline glow
        ctx.fillStyle = leyline ? leyline.glow : 'rgba(88, 201, 165, 0.2)'
        ctx.beginPath()
        ctx.arc(0, 0, u * 0.76, 0, TAU)
        ctx.fill()

        // Clean circular pedestal
        ctx.fillStyle = occupied ? '#131e1c' : hovered ? '#203c32' : '#172b24'
        ctx.strokeStyle = index === selected ? '#f0d577' : (leyline ? leyline.color : '#6d8a7c')
        ctx.lineWidth = index === selected ? 3.0 : 2.0
        ctx.beginPath()
        ctx.arc(0, 0, u * 0.66, 0, TAU)
        ctx.fill()
        ctx.stroke()

        // Build Cross (+)
        if (!occupied) {
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
    const targetRadius = trap.radius * this.boardWidth

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
    ctx.arc(targetPoint.x, targetPoint.y, targetRadius, 0, TAU)
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
    for (const enemy of this.gameplay.enemies) {
      if (!enemy.active) continue
      const pathPos = getTowerDefensePathPosition(enemy.progress)
      const point = this.project(pathPos)
      const radius = this.unit * 0.52 * (enemy.size || (enemy.boss ? 1.55 : 1))

      ctx.save()
      ctx.translate(point.x, point.y)

      // Direction flipping: enemies face towards walking direction
      const facing = enemy.facing != null ? enemy.facing : pathPos.facing || 0
      const facingRight = Math.cos(facing) >= 0
      if (!facingRight) {
        ctx.scale(-1, 1)
      }

      this._drawEnemyCharacter(ctx, enemy, radius, elapsed)
      this._drawEnemyStatuses(ctx, enemy, radius)
      ctx.restore()

      this._drawEnemyBars(ctx, enemy, point, radius)
    }
  }

  _drawEnemyCharacter(ctx, enemy, radius, elapsed) {
    const role = ENEMY_ROLE_MAP[enemy.typeId] || 'knight'
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
    ctx.fillStyle = enemy.boss ? '#f2c660' : '#77d282'
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
      const stats = getTowerStats(tower.typeId, tower.level, tower.branchId, tower.slotIndex)
      if (selected) this._drawTowerRange(ctx, point, stats.range)

      // Base platform with level progression & elemental glow
      this._drawTowerPlatform(ctx, point, tower, type, selected)

      // Slime Guardian: Stands naturally upright on the platform, facing towards target
      ctx.save()
      ctx.translate(point.x, point.y)
      const aimAngle = tower.aimAngle != null ? tower.aimAngle : -Math.PI / 2
      const facingRight = Math.cos(aimAngle) >= 0

      // Flip body horizontally based on target direction
      if (!facingRight) {
        ctx.scale(-1, 1)
      }

      // Local normalized look vector for eyes & mouth aiming
      const lookX = facingRight ? Math.cos(aimAngle) : -Math.cos(aimAngle)
      const lookY = Math.sin(aimAngle)

      if (tower.typeId === 'rapid') {
        this._drawRapidSlime(ctx, tower, type, lookX, lookY)
      } else if (tower.typeId === 'slow') {
        this._drawFrostSlime(ctx, tower, type, lookX, lookY)
      } else if (tower.typeId === 'blast') {
        this._drawBlastSlime(ctx, tower, type, lookX, lookY)
      } else if (tower.typeId === 'shock') {
        this._drawShockSlime(ctx, tower, type, lookX, lookY)
      } else if (tower.typeId === 'arcane') {
        this._drawArcaneSlime(ctx, tower, type, lookX, lookY)
      } else if (tower.typeId === 'radiant') {
        this._drawRadiantSlime(ctx, tower, type, lookX, lookY)
      }

      // Floating Hearts on Petting
      if ((tower.heartAnim || 0) > 0) {
        const hp = 1 - tower.heartAnim / 0.8
        ctx.fillStyle = `rgba(255, 107, 129, ${1 - hp})`
        ctx.font = `700 ${clamp(u * 0.45, 16, 24)}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText('❤️', 0, -u * (0.85 + hp * 0.6))
      }

      // Fever / Morale Boost Aura
      if ((tower.feverTimer || 0) > 0 || (tower.moraleTimer || 0) > 0) {
        ctx.strokeStyle = tower.feverTimer > 0 ? 'rgba(255, 234, 167, 0.85)' : 'rgba(255, 159, 243, 0.85)'
        ctx.lineWidth = 2.2
        ctx.setLineDash([4, 3])
        ctx.beginPath()
        ctx.arc(0, 0, u * 0.70, 0, TAU)
        ctx.stroke()
        ctx.setLineDash([])
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

  _drawTowerRange(ctx, point, range) {
    ctx.save()
    ctx.strokeStyle = 'rgba(232, 213, 136, 0.45)'
    ctx.fillStyle = 'rgba(232, 213, 136, 0.06)'
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
      const from = this.project(shot.from)
      const to = this.project(shot.to)
      const alpha = clamp(shot.life / shot.maxLife, 0, 1)
      const progress = clamp(1 - (shot.life / shot.maxLife), 0, 1)

      ctx.save()

      if (shot.kind === 'chain') {
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

        if (progress < 0.9) {
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
        if (progress >= 0.55) {
          const impactProg = (progress - 0.55) / 0.45
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

        if (progress < 0.92) {
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
        if (progress >= 0.7) {
          const impactProg = (progress - 0.7) / 0.3
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

        if (isSniper) {
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
        } else if (isBurst) {
          // Stream of rapid mini-droplets
          for (let b = 0; b < (shot.burstCount || 3); b++) {
            const bProg = clamp(progress * 1.3 - b * 0.12, 0, 1)
            if (bProg <= 0 || bProg >= 1) continue
            const bx = from.x + (to.x - from.x) * bProg
            const by = from.y + (to.y - from.y) * bProg

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
          }
        } else {
          // Standard Glossy Acid Slime Droplet
          const curX = from.x + (to.x - from.x) * progress
          const curY = from.y + (to.y - from.y) * progress

          if (progress < 0.92) {
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

          // Acid Splat on impact
          if (progress >= 0.75) {
            const impactProg = (progress - 0.75) / 0.25
            ctx.strokeStyle = `rgba(88, 255, 155, ${1 - impactProg})`
            ctx.lineWidth = 1.6
            ctx.beginPath()
            ctx.arc(to.x, to.y, u * (0.15 + impactProg * 0.35), 0, TAU)
            ctx.stroke()
          }
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
    const elapsed = this.gameplay.elapsed || 0
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
      // Guide to first trap (Spore Mushroom)
      const trap = this.gameplay.traps?.[0]
      if (trap) {
        const pt = this.project(trap.pos)
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
