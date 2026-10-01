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
    this._fogCache = new Map() // `sky|band` -> gradient, rebuilt on prepare
    this._motes = []
  }

  /** (Re)bake for a canvas size. No-op when nothing changed; safe in node. */
  prepare(width, height, dpr = 1, geometry = {}) {
    const sameSize = this._w === width && this._h === height && this._dpr === dpr
    if (sameSize && (this.sprites || !this._canBake())) return
    this._w = width
    this._h = height
    this._dpr = dpr
    this.width = width
    this.height = height
    this.horizonY = geometry.horizonY || Math.max(88, height * 0.155)
    this.roadTopWidth = geometry.roadTopWidth || 320
    this._fogCache.clear()
    this._initMotes()
    if (!this._canBake()) return
    this.sprites = this._bake()
  }

  _canBake() {
    return typeof document !== 'undefined' && typeof document.createElement === 'function'
  }

  _bake() {
    const scale = this.dpr > 1 ? 2 : 1
    const stripW = Math.max(640, Math.ceil(this.width * 2))
    const clusterW = this._clusterWidth()
    const skyline = this._bakeStrip(stripW, SCENERY_CONFIG.skylineHeight, scale, ctx => this._paintSkyline(ctx, stripW))
    const cluster = this._bakeStrip(clusterW, SCENERY_CONFIG.clusterHeight, scale, ctx => this._paintCluster(ctx, clusterW))
    const gate = this._bakeStrip(256, 112, scale, ctx => this._paintGate(ctx))
    const glow = this._bakeStrip(128, 128, scale, ctx => this._paintGlow(ctx))
    return { scale, stripW, skyline, clusterW, cluster, gate, glow }
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

  _paintSkyline(ctx, w) {
    const rng = sceneryRandom(0x5191ce)
    // Two silhouette bands for aerial depth; transparent background lets the
    // sky gradient show through.
    for (const [alpha, maxH, minW, maxW] of [[0.55, 66, 16, 34], [1, 108, 20, 48]]) {
      ctx.fillStyle = `rgba(10, 22, 31, ${alpha})`
      let x = -20
      while (x < w + 20) {
        const bw = minW + rng() * (maxW - minW)
        const bh = 14 + rng() * (maxH - 14)
        ctx.fillRect(x, SCENERY_CONFIG.skylineHeight - bh, bw, bh)
        if (rng() > 0.72) {
          // Antenna mast + tip light keeps the far skyline from reading as flat.
          const ax = x + bw * (0.3 + rng() * 0.4)
          const ah = 8 + rng() * 22
          ctx.fillRect(ax - 1, SCENERY_CONFIG.skylineHeight - bh - ah, 2, ah)
          ctx.fillStyle = 'rgba(150, 220, 235, 0.5)'
          ctx.fillRect(ax - 1.5, SCENERY_CONFIG.skylineHeight - bh - ah - 2, 3, 3)
          ctx.fillStyle = `rgba(10, 22, 31, ${alpha})`
        }
        x += bw + 2 + rng() * 14
      }
    }
  }

  _paintCluster(ctx, w) {
    const rng = sceneryRandom(0xc1ade)
    const h = SCENERY_CONFIG.clusterHeight
    // Silhouette blocks with lit windows sit closest to the road: they set the
    // mid-ground scale between the skyline and the asphalt.
    let x = -6
    while (x < w + 6) {
      const bw = 42 + rng() * 52
      const bh = 96 + rng() * 116
      const top = h - bh
      ctx.fillStyle = rng() > 0.5 ? '#0d1a24' : '#11202c'
      ctx.fillRect(x, top, bw, bh)
      ctx.fillStyle = 'rgba(140, 220, 240, 0.16)'
      ctx.fillRect(x, top, bw, 2)

      const cols = Math.max(2, Math.floor(bw / 14))
      const rows = Math.max(3, Math.floor(bh / 22))
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          if (rng() > 0.3) continue
          ctx.fillStyle = `rgba(232, 176, 106, ${(0.28 + rng() * 0.5).toFixed(3)})`
          ctx.fillRect(x + 5 + c * 14, top + 8 + r * 22, 4, 6)
        }
      }

      if (rng() > 0.55) {
        // Neon sign bar: warm lamp or cool accent, echoing the section profile.
        const sw = 8 + rng() * (bw - 20)
        const sy = top + 12 + rng() * (bh - 40)
        ctx.fillStyle = rng() > 0.5 ? 'rgba(240, 168, 96, 0.6)' : 'rgba(96, 200, 220, 0.55)'
        ctx.fillRect(x + 6, sy, sw, 3)
      }
      if (rng() > 0.7) {
        const ax = x + bw * (0.25 + rng() * 0.5)
        const ah = 10 + rng() * 20
        ctx.fillStyle = '#0d1a24'
        ctx.fillRect(ax - 1, top - ah, 2, ah)
        ctx.fillStyle = 'rgba(150, 220, 235, 0.55)'
        ctx.fillRect(ax - 1.5, top - ah - 2, 3, 3)
      }
      x += bw + 1 + rng() * 10
    }
  }

  _paintGate(ctx) {
    // Arch gate spanning the road. Neutral baking: the renderer adds the
    // per-section accent bar at draw time, so one sprite serves all profiles.
    const w = 256
    const h = 112
    ctx.fillStyle = '#101f2a'
    ctx.fillRect(26, 30, 28, h - 30) // left leg
    ctx.fillRect(w - 54, 30, 28, h - 30) // right leg
    ctx.fillRect(14, 16, w - 28, 26) // beam
    ctx.fillStyle = 'rgba(140, 220, 240, 0.28)'
    ctx.fillRect(14, 14, w - 28, 3) // top edge highlight
    ctx.fillStyle = '#8fe3f2'
    ctx.fillRect(30, 44, w - 60, 3) // inner light strip
    ctx.fillStyle = 'rgba(120, 200, 225, 0.35)'
    ctx.fillRect(38, 52, w - 76, 1)
    // Hazard ticks on the legs.
    ctx.fillStyle = 'rgba(240, 168, 96, 0.75)'
    for (const lx of [34, w - 46]) {
      for (let i = 0; i < 3; i++) ctx.fillRect(lx, 60 + i * 16, 12, 4)
    }
    ctx.fillStyle = '#0a151d'
    ctx.fillRect(20, h - 8, 40, 8)
    ctx.fillRect(w - 60, h - 8, 40, 8)
  }

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

  drawSkyline(ctx, scroll) {
    if (!this.sprites) return
    const { skyline, stripW } = this.sprites
    const h = SCENERY_CONFIG.skylineHeight
    const top = this.horizonY + 4 - h
    const offset = ((scroll * SCENERY_CONFIG.parallaxSkyline) % stripW + stripW) % stripW
    ctx.drawImage(skyline, -offset, top, stripW, h)
    ctx.drawImage(skyline, -offset + stripW, top, stripW, h)
  }

  drawClusters(ctx, scroll) {
    if (!this.sprites) return
    const { cluster, clusterW } = this.sprites
    const h = SCENERY_CONFIG.clusterHeight
    const top = this.horizonY + SCENERY_CONFIG.clusterBaseOffset - h
    const offset = ((scroll * SCENERY_CONFIG.parallaxMidground) % clusterW + clusterW) % clusterW
    for (let k = 0; k < 2; k++) {
      ctx.drawImage(cluster, k * clusterW - offset, top, clusterW, h) // left of road
      ctx.drawImage(cluster, this.width - (k + 1) * clusterW + offset, top, clusterW, h) // right of road
    }
  }

  /** Cached per-profile fog gradient; blends each baked layer into the next. */
  _fogGradient(ctx, band, profile) {
    const key = `${profile.sky}|${band}`
    let grad = this._fogCache.get(key)
    if (!grad) {
      const y0 = band === 'A' ? this.horizonY - 18 : this.horizonY + SCENERY_CONFIG.clusterBaseOffset - SCENERY_CONFIG.clusterHeight * 0.4
      const y1 = band === 'A' ? this.horizonY + 30 : this.horizonY + SCENERY_CONFIG.clusterBaseOffset + 8
      grad = ctx.createLinearGradient(0, y0, 0, y1)
      grad.addColorStop(0, `${profile.horizon}00`)
      grad.addColorStop(1, `${profile.horizon}${band === 'A' ? '8c' : 'b8'}`)
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
    if (!this.sprites) return
    ctx.drawImage(this.sprites.gate, cx - w / 2, baseY - h, w, h)
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
