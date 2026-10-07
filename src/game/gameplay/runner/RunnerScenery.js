import { RUNNER_SCENE_PROFILES } from './RunnerSceneProfiles.js'
import { paintSceneSkyline, paintSceneCluster, paintSceneDestination, paintSceneGate, paintCyberTower } from './RunnerSceneArt.js'

// Runner scenery: baked parallax backdrops and roadside glow props for the
// expedition (runner) mode. Static detail is baked once per canvas size (the
// FrontierScenery pattern); the frame loop only blits sprites plus a bounded
// number of vectors. No shadowBlur and no per-frame gradients: glow comes from
// pre-baked radial sprites, fog from two gradients cached per colour profile.

const TAU = Math.PI * 2
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

// Tuning constants live here so balance/art passes never touch draw code.
export const SCENERY_CONFIG = {
  parallaxSkyline: 0.2, // far strip scroll factor
  parallaxMidground: 0.5, // building cluster scroll factor
  skylineHeight: 132, // CSS px
  clusterHeight: 236, // CSS px
  clusterBaseOffset: 120, // CSS px below the horizon where cluster bases sit
  gateSpacing: 0.72, // scroll units between arch gates (~4s at default advanceSpeed)
  moteCount: 22,
}

// scrollDistance already drives every moving layer; roadside props advance
// SCROLL_DEPTH_RATE depth units per scroll unit, so gates share the same clock
// and the whole scene reads as one coherent world.
export const SCROLL_DEPTH_RATE = 1.45

/** Deterministic PRNG (same recipe as FrontierScenery) so bakes are stable. */
export function sceneryRandom(seed = 1) {
  let state = (Number(seed) || 1) >>> 0
  return () => {
    state += 0x6d2b79f5
    let t = Math.imul(state ^ (state >>> 15), state | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), state | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Gates anchored to the shared scroll accumulator: a gate is born at the horizon
 * (depth 0) and recedes toward the player plane as scroll advances. Returns the
 * gates inside the visible depth span, nearest first. A half-spacing phase keeps
 * the schedule clear of the player plane at scroll 0 (no gate pops in on frame
 * one) while still allowing two gates on screen for the pass-through moment.
 */
export function visibleGates(scroll, spacing = SCENERY_CONFIG.gateSpacing, depthRate = SCROLL_DEPTH_RATE) {
  const gates = []
  if (!(spacing > 0)) return gates
  const span = 1.05 / depthRate
  const nLow = Math.ceil((scroll - span) / spacing - 0.5)
  const nHigh = Math.floor((scroll + 0.02 / depthRate) / spacing - 0.5)
  for (let n = nLow; n <= nHigh; n++) {
    const gateScroll = (n + 0.5) * spacing
    const depth = (scroll - gateScroll) * depthRate
    if (depth < -0.02 || depth > 1.06) continue
    gates.push({ id: n, gateScroll, depth: clamp(depth, 0, 1.05) })
  }
  return gates
}

export class RunnerScenery {
  constructor() {
    this._w = 0
    this._h = 0
    this._dpr = 1
    this.width = 0
    this.height = 0
    this.horizonY = 0
    this.roadTopWidth = 0
    this.sprites = null
    this.previousSprites = null
    this.transition = 1
    this.profile = RUNNER_SCENE_PROFILES.outer
    this._fogCache = new Map() // `sky|band` -> gradient, rebuilt on prepare
    this._motes = []
  }

  /** (Re)bake for a canvas size. No-op when nothing changed; safe in node. */
  prepare(width, height, dpr = 1, geometry = {}, profile = this.profile) {
    const sameSize = this._w === width && this._h === height && this._dpr === dpr
    const horizonY = geometry.horizonY || Math.max(88, height * 0.155)
    const roadTopWidth = geometry.roadTopWidth || 320
    if (this.horizonY !== horizonY || this.roadTopWidth !== roadTopWidth) this._fogCache.clear()
    this.horizonY = horizonY
    this.roadTopWidth = roadTopWidth
    this.playerY = geometry.playerY || height * 0.82
    this.roadBottomWidth = geometry.roadBottomWidth || width * 0.8
    const sameTheme = this.profile.theme === profile.theme
    if (sameSize && sameTheme && (this.sprites || !this._canBake())) return
    this.previousSprites = sameSize && !sameTheme ? this.sprites : null
    this.profile = profile
    this._w = width
    this._h = height
    this._dpr = dpr
    this.width = width
    this.height = height
    this._fogCache.clear()
    if (!sameSize) this._initMotes()
    if (!this._canBake()) return
    this.sprites = this._bake()
  }

  _canBake() {
    return typeof document !== 'undefined' && typeof document.createElement === 'function'
  }

  _bake() {
    const scale = this._dpr > 1 ? 2 : 1
    const stripW = Math.max(640, Math.ceil(this.width * 2))
    const clusterW = this._clusterWidth()
    const skyline = this._bakeStrip(stripW, SCENERY_CONFIG.skylineHeight, scale, ctx => paintSceneSkyline(ctx, stripW, this.profile, sceneryRandom(this.profile.seed)))
    const cluster = this._bakeStrip(clusterW, SCENERY_CONFIG.clusterHeight, scale, ctx => paintSceneCluster(ctx, clusterW, this.profile, sceneryRandom(this.profile.seed + 71)))
    const gate = this._bakeStrip(256, 112, scale, ctx => paintSceneGate(ctx, this.profile))
    const destination = this._bakeStrip(400, 180, scale, ctx => paintSceneDestination(ctx, this.profile))
    const towers = Array.from({ length: 8 }, (_, i) => this._bakeStrip(180, 360, scale,
      ctx => paintCyberTower(ctx, this.profile, sceneryRandom(this.profile.seed + i * 93), i % 4, i < 4 ? -1 : 1)))
    const glow = this.previousSprites?.glow || this._bakeStrip(128, 128, scale, ctx => this._paintGlow(ctx))
    return { scale, stripW, skyline, clusterW, cluster, gate, destination, glow, towers }
  }

  _bakeStrip(w, h, scale, paint) {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(w * scale))
    canvas.height = Math.max(1, Math.round(h * scale))
    const ctx = canvas.getContext('2d')
    ctx.scale(scale, scale)
    paint(ctx)
    return canvas
  }

  _clusterWidth() {
    return clamp(this.roadTopWidth * 0.92, 230, this.width * 0.27)
  }

  // ---- baked strips (drawn once, never in the frame loop) ----

  _paintGlow(ctx) {
    // Warm radial glow sprite: blitted for lamp halos so the frame loop never
    // pays for shadowBlur or gradient construction.
    const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 64)
    grad.addColorStop(0, 'rgba(255, 216, 150, 0.9)')
    grad.addColorStop(0.35, 'rgba(240, 172, 92, 0.4)')
    grad.addColorStop(1, 'rgba(230, 140, 60, 0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 128, 128)
  }

  // ---- frame-loop draws (blits only) ----

  // Keep only the old/new bakes during a transition. No growing cache in endless.
  finishTransition() {
    this.transition = 1
    this.previousSprites = null
  }

  _drawLayers(ctx, draw) {
    if (!this.sprites) return
    const alpha = ctx.globalAlpha
    if (this.previousSprites && this.transition < 1) {
      ctx.globalAlpha = alpha * (1 - this.transition)
      draw(this.previousSprites)
    }
    ctx.globalAlpha = alpha * (this.previousSprites ? this.transition : 1)
    draw(this.sprites)
    ctx.globalAlpha = alpha
  }

  drawSkyline(ctx, scroll) {
    this._drawLayers(ctx, ({ skyline, stripW }) => {
      const h = SCENERY_CONFIG.skylineHeight
      const top = this.horizonY + 4 - h
      const offset = ((scroll * SCENERY_CONFIG.parallaxSkyline) % stripW + stripW) % stripW
      ctx.drawImage(skyline, -offset, top, stripW, h)
      ctx.drawImage(skyline, -offset + stripW, top, stripW, h)
    })
  }

  drawClusters(ctx, scroll) {
    this._drawLayers(ctx, ({ cluster, clusterW, towers }) => {
      const alpha = ctx.globalAlpha
      // Lower city fades below the bridge; its footprint fills the former void.
      ctx.globalAlpha = alpha * 0.7
      const lowerH = Math.max(240, this.height * 0.5)
      for (let x = -clusterW; x < this.width; x += clusterW) {
        ctx.drawImage(cluster, x, this.horizonY + 20, clusterW, lowerH)
      }
      // A bounded, seeded stream of freestanding towers, painted far to near.
      // The offset is depth, never horizontal wallpaper motion. No allocation
      // or random generation occurs in the animation loop.
      // Continue past the player until each tower leaves the viewport. Recycling
      // at depth 1 would pop a still-visible facade off the edge of the screen.
      for (let row = 0; row < 12; row++) {
        for (const side of [-1, 1]) {
          const clock = scroll * 0.17 + (side === 1 ? 0.061 : 0)
          const phase = ((clock % (1 / 7)) + 1 / 7) % (1 / 7)
          const depth = row / 7 + phase
          const slot = ((row - Math.floor(clock * 7) + (side === 1 ? 2 : 0)) % 4 + 4) % 4
          const factor = 0.28 + Math.pow(depth, 1.15) * 1.35
          const w = 180 * factor * Math.min(1.25, this.width / 1000)
          const h = w * (1.65 + slot * 0.16)
          const roadY = this.horizonY + (this.playerY - this.horizonY) * Math.pow(depth, 1.48)
          const half = (this.roadTopWidth + (this.roadBottomWidth - this.roadTopWidth) * Math.pow(depth, 0.92)) / 2
          const x = this.width / 2 + side * (half + 30 + depth * 55 + w * 0.52)
          const base = roadY + 48 + depth * this.height * 0.25
          if (x + w / 2 < 0 || x - w / 2 > this.width || base - h > this.height) continue
          // Solid silhouettes occlude the buildings behind them. Fading every
          // layer independently made nearby architecture look transparent.
          ctx.globalAlpha = alpha * Math.min(1, depth * 12)
          ctx.drawImage(towers[(side === -1 ? 0 : 4) + slot], x - w / 2, base - h, w, h)
        }
      }
      ctx.globalAlpha = alpha
    })
  }

  drawDestination(ctx) {
    const w = Math.min(this.width * 0.48, this.roadTopWidth * 1.05)
    const h = w * 0.45
    this._drawLayers(ctx, ({ destination }) => ctx.drawImage(destination, (this.width - w) / 2, this.horizonY + 38 - h, w, h))
  }

  /** Cached per-profile fog gradient; blends each baked layer into the next. */
  _fogGradient(ctx, band, profile) {
    const key = `${profile.horizon}|${band}`
    let grad = this._fogCache.get(key)
    if (!grad) {
      const y0 = band === 'A' ? this.horizonY - 18 : this.horizonY + SCENERY_CONFIG.clusterBaseOffset - SCENERY_CONFIG.clusterHeight * 0.4
      const y1 = band === 'A' ? this.horizonY + 30 : this.horizonY + SCENERY_CONFIG.clusterBaseOffset + 8
      grad = ctx.createLinearGradient(0, y0, 0, y1)
      grad.addColorStop(0, `${profile.horizon}00`)
      grad.addColorStop(1, `${profile.horizon}${band === 'A' ? '8c' : 'b8'}`)
      if (this._fogCache.size >= 4) this._fogCache.clear()
      this._fogCache.set(key, grad)
    }
    return grad
  }

  drawFogBand(ctx, band, profile) {
    const grad = this._fogGradient(ctx, band, profile)
    if (!grad) return
    const y0 = band === 'A' ? this.horizonY - 18 : this.horizonY + SCENERY_CONFIG.clusterBaseOffset - SCENERY_CONFIG.clusterHeight * 0.4
    const y1 = band === 'A' ? this.horizonY + 30 : this.horizonY + SCENERY_CONFIG.clusterBaseOffset + 8
    ctx.fillStyle = grad
    ctx.fillRect(0, y0, this.width, y1 - y0)
  }

  /** Arch gate sprite; base sits on the road plane at baseY. */
  drawGate(ctx, cx, baseY, w, h) {
    this._drawLayers(ctx, ({ gate }) => ctx.drawImage(gate, cx - w / 2, baseY - h, w, h))
  }

  /** Baked warm halo; alpha is premultiplied by the caller's fade/breath. */
  drawLampGlow(ctx, x, y, r, alpha) {
    if (!this.sprites) return
    const prev = ctx.globalAlpha
    ctx.globalAlpha = prev * clamp(alpha, 0, 1)
    ctx.drawImage(this.sprites.glow, x - r, y - r, r * 2, r * 2)
    ctx.globalAlpha = prev
  }

  // ---- ambient motes (pooled, zero per-frame allocation) ----

  _initMotes() {
    const rng = sceneryRandom(0x40e5)
    this._motes = []
    for (let i = 0; i < SCENERY_CONFIG.moteCount; i++) {
      this._motes.push({
        track: rng(),
        side: i % 2 === 0 ? -1 : 1,
        outward: 24 + rng() * 150,
        size: 0.7 + rng() * 1.6,
        phase: rng() * TAU,
        warm: rng() > 0.45,
        sway: 0.4 + rng() * 1.2,
      })
    }
  }

  /** Motes ride the same scroll clock as everything else. */
  updateMotes(scrollDelta) {
    if (!this._motes.length) return
    const advance = Math.max(0, scrollDelta) * 0.85
    for (const m of this._motes) {
      m.track += advance
      if (m.track >= 1) m.track -= 1
    }
  }

  drawMotes(ctx, time, profile, roadWidthAt) {
    if (!this._motes.length) return
    const horizonY = this.horizonY
    ctx.save()
    for (const m of this._motes) {
      const track = m.track
      const y = horizonY + Math.pow(track, 1.7) * (this.height - horizonY)
      const x = this.width / 2 + m.side * (roadWidthAt(track) / 2 + m.outward + Math.sin(time * m.sway + m.phase) * 6)
      const alpha = (0.05 + track * 0.16) * (0.6 + 0.4 * Math.sin(time * 2.2 + m.phase))
      ctx.fillStyle = m.warm ? profile.lamp : profile.accent
      ctx.globalAlpha = clamp(alpha, 0.02, 0.22)
      ctx.beginPath()
      ctx.arc(x, y, m.size, 0, TAU)
      ctx.fill()
    }
    ctx.restore()
  }
}
