import { drawArenaKnightA } from './ArenaKnightPrototype.js'

const TAU = Math.PI * 2
const BASE_RADIUS = 14 * 1.52
const SURFACE_SIZE = 64
const MOVE_PHASES = Object.freeze([0, 0.25, 0.5, 0.75])

function createSurface(size) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(size, size)
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    return canvas
  }
  return null
}

function phaseIndex(walkPhase) {
  const normalized = ((walkPhase % TAU) + TAU) % TAU
  return Math.floor(normalized / TAU * MOVE_PHASES.length) % MOVE_PHASES.length
}

/**
 * Fixed-size raster cache for the Arena knight A prototype.
 *
 * The cache owns exactly eight frames: idle, four movement phases, attack,
 * hurt and a preview-only death pose. It never keys by entity id, radius or arbitrary time. Runtime scales
 * these bitmaps to the same visual radius used by drawArenaKnightA().
 */
export class ArenaKnightFrameCache {
  constructor() {
    this.frames = new Map()
    this.initialized = false
    this.initMs = 0
    this.surfaceBytes = 0
  }

  initialize() {
    if (this.initialized) return this
    const started = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const definitions = [
      ['idle', { walkPhase: 0 }],
      ...MOVE_PHASES.map((phase, index) => [`move${index}`, { walkPhase: phase }]),
      ['attack', { walkPhase: 0, attacking: true }],
      ['hurt', { walkPhase: 0, hurt: true }],
      ['dead', { walkPhase: 0, dead: true }],
    ]
    for (const [key, state] of definitions) {
      const canvas = createSurface(SURFACE_SIZE)
      const ctx = canvas?.getContext?.('2d')
      if (!canvas || !ctx) continue
      ctx.clearRect(0, 0, SURFACE_SIZE, SURFACE_SIZE)
      ctx.save()
      ctx.translate(SURFACE_SIZE / 2, SURFACE_SIZE / 2)
      if (state.dead) {
        ctx.globalAlpha = 0.45
        ctx.translate(0, 6)
        ctx.scale(1.08, 0.72)
      }
      drawArenaKnightA(ctx, BASE_RADIUS, state)
      ctx.restore()
      this.frames.set(key, canvas)
    }
    this.initialized = true
    this.surfaceBytes = this.frames.size * SURFACE_SIZE * SURFACE_SIZE * 4
    this.initMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started
    return this
  }

  keyFor({ walkPhase = 0, moving = false, attacking = false, hurt = false, dead = false } = {}) {
    if (dead) return 'dead'
    if (hurt) return 'hurt'
    if (attacking) return 'attack'
    if (moving) return `move${phaseIndex(walkPhase)}`
    return 'idle'
  }

  draw(ctx, x, y, radius, state = {}) {
    this.initialize()
    const source = this.frames.get(this.keyFor(state))
    if (!source) return false
    const scale = radius * 1.52 / BASE_RADIUS
    const size = SURFACE_SIZE * scale
    ctx.drawImage(source, x - size / 2, y - size / 2, size, size)
    return true
  }

  snapshot() {
    this.initialize()
    return {
      frameCount: this.frames.size,
      surfaceSize: SURFACE_SIZE,
      baseRadius: BASE_RADIUS,
      initMs: this.initMs,
      estimatedBytes: this.surfaceBytes,
      keys: [...this.frames.keys()],
    }
  }
}

let singleton = null
export function getArenaKnightFrameCache() {
  if (!singleton) singleton = new ArenaKnightFrameCache()
  return singleton
}

export function resetArenaKnightFrameCacheForTests() {
  singleton = null
}
