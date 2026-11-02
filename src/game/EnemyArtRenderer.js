/* =========================================================================
 * Enemy art — game bridge (current-r2).
 * Casts live in `enemy-art/enemy-cast.js`; this module owns everything the
 * game needs around them: the fixed frame cache, motion overlays (squash,
 * lunge, recoil) and the world ground shadow.
 *
 * Frames are keyed by (type x pose) only — never by entity, radius or time —
 * and exist in two resolution tiers (DPR <= 1.1 -> 1x, otherwise 2x, matching
 * the engine's DPR cap). Every frame has a white-silhouette twin so a hit flash
 * is an overlay on the current pose instead of replacing it.
 *
 * Space contract for `drawEnemyArt`: the caller's ctx is at the body centre
 * (already flipped for facing); +x is the facing direction.
 * ========================================================================= */
import { ENEMY_CAST, enemyFramePose } from './enemy-art/enemy-cast.js'
import { BOSS_CAST, bossFramePose } from './enemy-art/boss-cast.js'
import { K, setScale } from './slime-art/slime-painter.js'

const TAU = Math.PI * 2
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/** Ordinary enemies and Arena bosses share one pipeline; the registries stay separate. */
const castOf = type => ENEMY_CAST[type] || BOSS_CAST[type]
const framePoseOf = (type, key) => ENEMY_CAST[type] ? enemyFramePose(type, key) : bossFramePose(type, key)

export const hasEnemyArt = type => !!castOf(type)
/** Unique casts (bosses) skip tint, size jitter, variants and the elite rim — callers sizing shadows or feet outside `drawEnemyArt` must mirror it. */
export const enemyArtUnique = type => !!castOf(type)?.unique

/** Deterministic per-instance hash -> [0,1); non-finite seeds collapse to 0. */
const hash01 = seed => {
  const s = typeof seed === 'number' && Number.isFinite(seed) ? seed : 0
  const n = Math.sin(s * 127.1 + 311.7) * 43758.5453
  return n - Math.floor(n)
}

/* Per-instance variety (P3). A unit picks a subtle hue wash plus a size jitter
 * from its seed, so a crowd stops looking copy-pasted. The wash reuses the
 * cached white silhouette as a mask — no extra frames are baked. Two nulls keep
 * roughly a third of a crowd at the default look. */
export const VARIANT_TINTS = [null, null, '#ffd166', '#6fd8f0', '#f088e0', '#a0e070', '#ff9a5a']
export const enemyArtTint = seed => VARIANT_TINTS[Math.floor(hash01((seed || 0) + .5) * VARIANT_TINTS.length)]
/** Visual scale jitter (±4%) times the elite bulk bonus; collision radius is untouched. */
export const enemySizeMul = (seed = 0, elite = false) => (0.96 + hash01((seed || 0) + .25) * .08) * (elite ? 1.08 : 1)
const variantOf = (cast, seed) => (cast.variants > 1 ? Math.floor(hash01(seed || 0) * cast.variants) % cast.variants : 0)

/* Shared scratch surfaces for silhouette-masked layers (tint wash, elite rim):
 * the cached white twin is re-tinted per draw instead of baking variant frames. */
const scratch = new Map()
function tintedLayer(src, px, color) {
  let s = scratch.get(px)
  if (!s) { s = createSurface(px); if (s) scratch.set(px, s) }
  const c = s?.getContext?.('2d')
  if (!c) return null
  c.globalCompositeOperation = 'source-over'
  c.clearRect(0, 0, px, px)
  c.drawImage(src, 0, 0)
  c.globalCompositeOperation = 'source-in'
  c.fillStyle = color
  c.fillRect(0, 0, px, px)
  c.globalCompositeOperation = 'source-over'
  return s
}

function createSurface(size) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(size, size)
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas')
    canvas.width = size; canvas.height = size
    return canvas
  }
  return null
}

export const enemyArtTier = dpr => (dpr > 1.1 ? 2 : 1)

export class EnemyFrameCache {
  constructor(type) {
    this.type = type
    this.cast = castOf(type)
    this.tiers = new Map()
    this.initMs = 0
    this.surfaceBytes = 0
  }

  /** Build (once) every frame of one resolution tier. Headless runs without canvas yield an empty tier. */
  build(tier) {
    let set = this.tiers.get(tier)
    if (set) return set
    set = new Map()
    this.tiers.set(tier, set)
    const { cast } = this
    const started = now()
    const px = Math.round(cast.surface * tier)
    const saved = { ...K }
    const variants = cast.variants || 1
    for (const [key, state] of cast.frames) {
      for (let v = 0; v < variants; v++) {
        const img = createSurface(px)
        const c = img?.getContext?.('2d')
        if (!c) continue
        c.clearRect(0, 0, px, px)
        c.save()
        c.translate(px / 2, px / 2)
        c.scale(tier, tier)
        setScale(cast.baseR * cast.scale)
        c.scale(cast.baseR * cast.scale / 100, cast.baseR * cast.scale / 100)
        cast.draw(c, { ...state, variant: v })
        c.restore()
        const flash = createSurface(px)
        const fc = flash?.getContext?.('2d')
        if (fc) {
          fc.drawImage(img, 0, 0)
          fc.globalCompositeOperation = 'source-atop'
          fc.fillStyle = '#ffffff'
          fc.fillRect(0, 0, px, px)
        }
        set.set(v ? `${key}#v${v}` : key, { img, flash: fc ? flash : null })
      }
    }
    Object.assign(K, saved)
    this.initMs += now() - started
    this.surfaceBytes += set.size * 2 * px * px * 4
    return set
  }

  /** Draw one frame with its feet pivot at the ctx origin. `k` = r / baseR, `hurt` = 0..1 flash strength.
   *  `fx.tint` washes the sprite's saturated colours toward the tint hue; `fx.elite` adds a golden rim. */
  draw(ctx, key, k, feet, dpr, hurt = 0, fx = null) {
    const frame = this.build(enemyArtTier(dpr)).get(key)
    if (!frame) return false
    const size = this.cast.surface * k, x = -size / 2, y = -size / 2 - feet
    const px = Math.round(this.cast.surface * enemyArtTier(dpr))
    if (fx?.elite && frame.flash) {
      const rim = tintedLayer(frame.flash, px, '#ffd166')
      if (rim) {
        const a = ctx.globalAlpha, g = size * 1.08
        ctx.globalAlpha = a * .5
        ctx.drawImage(rim, x - (g - size) / 2, y - (g - size) / 2, g, g)
        ctx.globalAlpha = a
      }
    }
    ctx.drawImage(frame.img, x, y, size, size)
    if (fx?.tint && frame.flash) {
      const layer = tintedLayer(frame.flash, px, fx.tint)
      if (layer) {
        const a = ctx.globalAlpha
        ctx.globalAlpha = a * .42
        ctx.globalCompositeOperation = 'hue'
        ctx.drawImage(layer, x, y, size, size)
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = a
      }
    }
    if (hurt > 0 && frame.flash) {
      const a = ctx.globalAlpha
      ctx.globalAlpha = a * Math.min(1, hurt * .85)
      ctx.drawImage(frame.flash, x, y, size, size)
      ctx.globalAlpha = a
    }
    return true
  }

  snapshot() {
    this.build(1)
    return {
      type: this.type,
      surfaceSize: this.cast.surface,
      baseRadius: this.cast.baseR,
      frameKeys: [...this.tiers.get(1).keys()],
      frameCount: this.tiers.get(1).size,
      tiers: [...this.tiers.keys()],
      initMs: this.initMs,
      estimatedBytes: this.surfaceBytes,
    }
  }
}

const caches = new Map()
export function getEnemyFrameCache(type) {
  let cache = caches.get(type)
  if (!cache) caches.set(type, cache = new EnemyFrameCache(type))
  return cache
}
export function resetEnemyFrameCachesForTests() { caches.clear() }

/** Pixels from the body centre down to the ground contact line. */
export const enemyArtFeet = (type, r) => { const c = castOf(type); return c ? c.feetY * c.scale * r / 100 : 0 }

/** Pixels from the body centre up to the head/headgear top (boss casts declare `topY`). */
export const enemyArtTop = (type, r) => { const c = castOf(type); return c?.topY ? -c.topY * c.scale * r / 100 : 0 }

/**
 * Procedural motion on top of the pose frame. Everything is derived from clocks
 * the enemy already owns (walk phase, swing, cast timers, flash), so combat
 * timing is untouched. Offsets are CSS px in facing space; scales pivot at the feet.
 */
export function enemyArtMotion(type, st = {}) {
  const cast = castOf(type)
  const t = st.time || 0
  let dx = 0, dy = 0, sy = 1
  if (st.moving) {
    const s = Math.abs(Math.sin((st.walkT || 0) * (cast?.gait || 1)))
    if (!cast?.floats) dy = -s * 1.5
    sy = 1 + (s * 2 - 1) * .03
  } else sy = 1 + .02 * Math.sin(t * 2.4 + (st.seed || 0))
  if (st.stance === 'dashing') { dy = 0; sy = 1 }
  if (st.stance === 'recover') { dy = 0; sy *= .96 } // 破绽瘫姿：不起伏，微塌
  if (st.stance === 'roar') sy *= 1.04
  if (st.swing >= 0) {
    const p = Math.sin(st.swing * Math.PI)
    dx += p * 3.2; sy *= 1 - .05 * p
  } else if (st.windup) { dx -= 1.2; sy *= 1.04 }
  if (st.casting === 'charge') { sy *= 1 + .025 * Math.sin(t * 28); dy -= 1 }
  else if (st.casting === 'fire') dx -= 2.4
  else if (st.casting === 'heal') { dy -= 1.2; sy *= 1 + .02 * Math.sin(t * 5) }
  if (st.enraged || st.stance === 'roar') dx += Math.sin(t * 30 + (st.seed || 0)) * .5
  let sx = 1 + (1 - sy) * .6
  const h = st.hurt > 0 ? Math.min(1, st.hurt) : 0
  if (h) { dx -= 2 * h; sy *= 1 - .08 * h; sx *= 1 + .07 * h }
  const mm = cast?.motionMul || 1 // 首领动作幅度更大（体感重量）
  return { dx: dx * mm, dy: dy * mm, sx, sy }
}

/**
 * Draw one enemy. Returns 'cache' (flash already applied), 'realtime' (frames
 * unavailable — the caller still owns its own hit flash) or false (no art).
 */
export function drawEnemyArt(ctx, type, r, st = {}, dpr = 1) {
  const cast = castOf(type)
  if (!cast) return false
  // unique casts (bosses): no per-seed tint, no size jitter, no variants, no elite rim
  const mul = cast.unique ? 1 : (st.sizeMul || 1) // callers pass enemySizeMul(seed, elite) to opt into size jitter
  const k = r * mul / cast.baseR, feet = enemyArtFeet(type, r * mul), m = enemyArtMotion(type, st)
  const v = cast.unique ? 0 : variantOf(cast, st.seed), base = cast.frameKey(st), key = v ? `${base}#v${v}` : base
  ctx.save()
  ctx.translate(m.dx * k, feet + m.dy)
  ctx.scale(m.sx, m.sy)
  let mode = 'cache'
  const fx = cast.unique ? { tint: null, elite: false } : { tint: enemyArtTint(st.seed), elite: !!st.elite }
  if (!getEnemyFrameCache(type).draw(ctx, key, k, feet, dpr, st.hurt, fx)) {
    mode = 'realtime'
    const saved = { ...K }, s = r * mul * cast.scale
    setScale(s)
    ctx.translate(0, -feet)
    ctx.scale(s / 100, s / 100)
    cast.draw(ctx, { ...framePoseOf(type, base), variant: v })
    Object.assign(K, saved)
  }
  ctx.restore()
  return mode
}

/** World-space ground shadow, pinned to the ground contact line (bob and float do not move it). */
export function drawEnemyShadow(ctx, type, x, y, r, { lift = 0, scale = 1, sizeMul = 1 } = {}) {
  const cast = castOf(type)
  if (!cast) return false
  const mul = cast.unique ? 1 : sizeMul // unique casts render at r, unjittered (see drawEnemyArt)
  const rx = cast.shadowRx * cast.scale * r * mul / 100 * scale * (1 - Math.min(.3, Math.max(0, lift) / 40))
  ctx.fillStyle = cast.floats ? 'rgba(6,12,10,.22)' : 'rgba(6,12,10,.34)'
  ctx.beginPath()
  ctx.ellipse(x, y + enemyArtFeet(type, r * mul) + 1, rx, rx * .24, 0, 0, TAU)
  ctx.fill()
  return true
}
