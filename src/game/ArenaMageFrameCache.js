import { drawArenaMageA } from './ArenaMagePrototype.js'

const TAU = Math.PI * 2
const BASE_RADIUS = 13 * 1.45
const SURFACE_SIZE = 64
const MOVE_PHASES = Object.freeze([0, 0.25, 0.5, 0.75])

function createSurface(size) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(size, size)
  if (typeof document !== 'undefined' && document.createElement) {
    const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size; return canvas
  }
  return null
}
function phaseIndex(walkPhase) {
  const normalized = ((walkPhase % TAU) + TAU) % TAU
  return Math.floor(normalized / TAU * MOVE_PHASES.length) % MOVE_PHASES.length
}

export class ArenaMageFrameCache {
  constructor() { this.frames = new Map(); this.initialized = false; this.initMs = 0; this.surfaceBytes = 0 }
  initialize() {
    if (this.initialized) return this
    const started = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const definitions = [
      ['idle', { }],
      ...MOVE_PHASES.map((phase, index) => [`move${index}`, { walkPhase: phase, moving: true }]),
      ['cast', { casting: true }], ['hurt', { hurt: true }],
    ]
    for (const [key, state] of definitions) {
      const canvas = createSurface(SURFACE_SIZE); const ctx = canvas?.getContext?.('2d')
      if (!canvas || !ctx) continue
      ctx.clearRect(0, 0, SURFACE_SIZE, SURFACE_SIZE); ctx.save()
      ctx.translate(SURFACE_SIZE / 2, SURFACE_SIZE / 2); drawArenaMageA(ctx, BASE_RADIUS, state); ctx.restore()
      this.frames.set(key, canvas)
    }
    this.initialized = true; this.surfaceBytes = this.frames.size * SURFACE_SIZE * SURFACE_SIZE * 4
    this.initMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started
    return this
  }
  keyFor({ walkPhase = 0, moving = false, casting = false, hurt = false } = {}) {
    if (hurt) return 'hurt'; if (casting) return 'cast'; if (moving) return `move${phaseIndex(walkPhase)}`; return 'idle'
  }
  draw(ctx, x, y, radius, state = {}) {
    this.initialize(); const source = this.frames.get(this.keyFor(state)); if (!source) return false
    const size = SURFACE_SIZE * (radius * 1.45 / BASE_RADIUS); ctx.drawImage(source, x - size / 2, y - size / 2, size, size); return true
  }
  snapshot() { this.initialize(); return { frameCount: this.frames.size, surfaceSize: SURFACE_SIZE, baseRadius: BASE_RADIUS, initMs: this.initMs, estimatedBytes: this.surfaceBytes, keys: [...this.frames.keys()] } }
}
let singleton = null
export function getArenaMageFrameCache() { if (!singleton) singleton = new ArenaMageFrameCache(); return singleton }
export function resetArenaMageFrameCacheForTests() { singleton = null }
