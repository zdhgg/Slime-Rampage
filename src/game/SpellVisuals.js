import { BASE_SPELL_PALETTES, spellColorAlpha } from './SpellPalette.js'

const TAU = Math.PI * 2
const GOLDEN_ANGLE = 2.399963229728653

function drawPoly(ctx, pts, fill, stroke, lineWidth = 2) {
  ctx.beginPath()
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i]
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = lineWidth
    ctx.lineJoin = 'round'
    ctx.stroke()
  }
}

/**
 * Multi-layered curved Bezier flame tongue (outer crimson -> mid tangerine -> incandescent white-gold core).
 */
function drawFlameTongue(ctx, x, y, w, h, sway = 0, alpha = 1) {
  if (alpha <= 0.02 || h <= 1) return
  ctx.save()
  ctx.translate(x, y)
  ctx.globalAlpha *= alpha

  // Outer crimson-orange silhouette
  ctx.fillStyle = '#e03108'
  ctx.beginPath()
  ctx.moveTo(0, 2)
  ctx.bezierCurveTo(-w * 1.08, -h * 0.14, -w * 0.88 + sway * 0.4, -h * 0.65, sway, -h)
  ctx.bezierCurveTo(w * 0.88 + sway * 0.4, -h * 0.65, w * 1.08, -h * 0.14, 0, 2)
  ctx.closePath()
  ctx.fill()

  // Mid bright orange body
  ctx.fillStyle = '#ff8814'
  ctx.beginPath()
  ctx.moveTo(0, 1)
  ctx.bezierCurveTo(-w * 0.74, -h * 0.12, -w * 0.54 + sway * 0.48, -h * 0.58, sway * 0.75, -h * 0.8)
  ctx.bezierCurveTo(w * 0.54 + sway * 0.48, -h * 0.58, w * 0.74, -h * 0.12, 0, 1)
  ctx.closePath()
  ctx.fill()

  // White-gold flame heart
  ctx.fillStyle = '#fff5b8'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.bezierCurveTo(-w * 0.38, -h * 0.1, -w * 0.25 + sway * 0.3, -h * 0.4, sway * 0.4, -h * 0.52)
  ctx.bezierCurveTo(w * 0.25 + sway * 0.3, -h * 0.4, w * 0.38, -h * 0.1, 0, 0)
  ctx.closePath()
  ctx.fill()

  ctx.restore()
}

/**
 * Naturalistic 3-tongue ground fire cluster (base ember glow + central tall lick + two flanking side licks).
 * Looks like real roaring fire rather than isolated single candle flames.
 */
function drawFireCluster(ctx, x, y, scale, phase, alpha = 1) {
  if (alpha <= 0.02) return
  ctx.save()
  ctx.translate(x, y)

  // Warm orange-red base heat glow on the ground
  const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 15 * scale)
  g.addColorStop(0, `rgba(255, 132, 32, ${0.42 * alpha})`)
  g.addColorStop(0.6, `rgba(224, 52, 12, ${0.18 * alpha})`)
  g.addColorStop(1, 'rgba(224, 52, 12, 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(0, 1, 15 * scale, 8 * scale, 0, 0, TAU)
  ctx.fill()

  const swayMain = Math.sin(phase) * 4.5 * scale
  const swayL = Math.cos(phase * 1.15 + 1.2) * 3.5 * scale - 2.2 * scale
  const swayR = Math.sin(phase * 1.25 + 2.4) * 3.5 * scale + 2.2 * scale
  const hMain = (22 + Math.sin(phase * 1.4) * 5) * scale
  const hL = (14 + Math.cos(phase * 1.7) * 3.5) * scale
  const hR = (15 + Math.sin(phase * 1.6 + 1) * 3.5) * scale

  // Flanking fire tongues first, central tall flame in front
  drawFlameTongue(ctx, -5.2 * scale, 1.5, 5.4 * scale, hL, swayL, 0.82 * alpha)
  drawFlameTongue(ctx, 5.2 * scale, 1.5, 5.4 * scale, hR, swayR, 0.82 * alpha)
  drawFlameTongue(ctx, 0, 2.2, 7.6 * scale, hMain, swayMain, 0.94 * alpha)

  ctx.restore()
}

/**
 * Organic scorched magma floor bed (irregular glowing lava pockets & soft ember patches — no stick-like lines).
 */
function drawMagmaFloorPatches(ctx, radius, seed, alpha, count = 5) {
  ctx.save()
  for (let i = 0; i < count; i++) {
    const a = seed + i * GOLDEN_ANGLE
    const d = radius * (0.18 + ((i * 23) % 10) * 0.048)
    const px = Math.cos(a) * d
    const py = Math.sin(a) * d
    const rx = radius * (0.14 + (i % 3) * 0.04)
    const ry = rx * 0.62

    // Charred scorch patch
    ctx.fillStyle = `rgba(74, 22, 8, ${0.26 * alpha})`
    ctx.beginPath()
    ctx.ellipse(px, py, rx, ry, a * 0.5, 0, TAU)
    ctx.fill()

    // Warm molten ember seam inside scorch
    const mg = ctx.createRadialGradient(px, py, 1, px, py, rx * 0.72)
    mg.addColorStop(0, `rgba(255, 198, 72, ${0.42 * alpha})`)
    mg.addColorStop(0.55, `rgba(245, 86, 18, ${0.24 * alpha})`)
    mg.addColorStop(1, 'rgba(245, 86, 18, 0)')
    ctx.fillStyle = mg
    ctx.beginPath()
    ctx.ellipse(px, py, rx * 0.72, ry * 0.72, a * 0.5, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

/**
 * Crisp 6-pointed crystalline snowflake with delicate branch barbs.
 */
function drawSnowflake(ctx, x, y, r, rot, stroke, lineWidth = 1.4) {
  if (r <= 0.8) return
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.strokeStyle = stroke
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    ctx.moveTo(0, 0)
    ctx.lineTo(ca * r, sa * r)
    if (r >= 5.5) {
      const bx = ca * r * 0.58
      const by = sa * r * 0.58
      const bl = r * 0.34
      ctx.moveTo(bx, by)
      ctx.lineTo(bx + Math.cos(a + 0.65) * bl, by + Math.sin(a + 0.65) * bl)
      ctx.moveTo(bx, by)
      ctx.lineTo(bx + Math.cos(a - 0.65) * bl, by + Math.sin(a - 0.65) * bl)
    }
  }
  ctx.stroke()
  ctx.restore()
}

/**
 * Faceted glacial frost patches & etched snowflake runes on Blizzard ground.
 */
function drawFrostFloorPatches(ctx, radius, seed, alpha, count = 5) {
  ctx.save()
  for (let i = 0; i < count; i++) {
    const a = seed + i * GOLDEN_ANGLE
    const d = radius * (0.22 + ((i * 19) % 10) * 0.048)
    const px = Math.cos(a) * d
    const py = Math.sin(a) * d
    const pr = radius * (0.12 + (i % 3) * 0.03)

    // Translucent faceted ice crystal plate
    ctx.fillStyle = `rgba(14, 116, 144, ${0.18 * alpha})`
    ctx.strokeStyle = `rgba(224, 247, 255, ${0.34 * alpha})`
    ctx.lineWidth = 1.1
    ctx.beginPath()
    for (let k = 0; k < 6; k++) {
      const ka = a + (k * TAU) / 6
      const kr = k % 2 === 0 ? pr : pr * 0.72
      const vx = px + Math.cos(ka) * kr
      const vy = py + Math.sin(ka) * kr * 0.72
      if (k === 0) ctx.moveTo(vx, vy)
      else ctx.lineTo(vx, vy)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    if (i < 3) {
      drawSnowflake(ctx, px, py, pr * 0.52, a + 0.3, `rgba(240, 249, 255, ${0.42 * alpha})`, 1.0)
    }
  }
  ctx.restore()
}

/**
 * Crisp 4-point electric spark starburst for lightning strike impacts & nodes.
 */
function drawElectricStar(ctx, x, y, r, alpha, coreColor = '#ffffff', glowColor = '#fde047') {
  if (alpha <= 0.03 || r <= 1) return
  ctx.save()
  ctx.translate(x, y)

  const g = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 1.45)
  g.addColorStop(0, spellColorAlpha(glowColor, 0.72 * alpha))
  g.addColorStop(0.55, spellColorAlpha(glowColor, 0.25 * alpha))
  g.addColorStop(1, spellColorAlpha(glowColor, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, r * 1.45, 0, TAU)
  ctx.fill()

  ctx.fillStyle = spellColorAlpha(coreColor, alpha)
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4
    const rr = i % 2 === 0 ? r : r * 0.24
    const px = Math.cos(a) * rr
    const py = Math.sin(a) * rr
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/**
 * High-contrast 3-layer crackling lightning polyline with micro-subkinks, branches & overload double helix.
 */
function drawLightningPolyline(ctx, pts, { overloaded = false, color = '#fde047', glow = '#facc15', width = 2.6, ratio = 1, now = 0 } = {}) {
  if (!pts || pts.length < 2 || ratio <= 0.02) return
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Visually subdivide each coarse segment into crisp electric micro-kinks
  const refined = [pts[0]]
  const flick = Math.floor(now * 24)
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const segLen = Math.hypot(dx, dy)
    if (segLen > 34) {
      const nx = -dy / segLen
      const ny = dx / segLen
      const jitter = Math.min(8.5, segLen * 0.14) * (overloaded ? 1.25 : 0.95)
      const h1 = Math.sin((a.x * 0.17 + b.y * 0.23) + i * 3.1 + flick * 1.7) * jitter
      const h2 = Math.cos((b.x * 0.19 + a.y * 0.21) + i * 4.3 + flick * 2.1) * jitter * 0.85
      refined.push({ x: a.x + dx * 0.36 + nx * h1, y: a.y + dy * 0.36 + ny * h1 })
      refined.push({ x: a.x + dx * 0.72 + nx * h2, y: a.y + dy * 0.72 + ny * h2 })
    }
    refined.push(b)
  }

  const tracePath = (points) => {
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
  }

  // Layer 1: Dark high-contrast storm aura so bright gold/white arcs pop over light grass
  tracePath(refined)
  ctx.strokeStyle = overloaded
    ? `rgba(126, 34, 206, ${0.72 * ratio})`
    : `rgba(30, 64, 175, ${0.42 * ratio})`
  ctx.lineWidth = width + (overloaded ? 8.5 : 5.2)
  ctx.stroke()

  // Layer 2: Electric mid-corona glow
  tracePath(refined)
  ctx.strokeStyle = spellColorAlpha(overloaded ? '#c084fc' : glow, (overloaded ? 0.88 : 0.68) * ratio)
  ctx.lineWidth = width + (overloaded ? 4.4 : 2.4)
  ctx.stroke()

  // Overloaded secondary intertwined high-voltage helix strand
  if (overloaded && refined.length >= 2) {
    const twin = []
    for (let i = 0; i < refined.length; i++) {
      const p = refined[i]
      if (i === 0 || i === refined.length - 1) {
        twin.push(p)
        continue
      }
      const prev = refined[i - 1]
      const next = refined[Math.min(refined.length - 1, i + 1)]
      const dx = next.x - prev.x
      const dy = next.y - prev.y
      const len = Math.hypot(dx, dy) || 1
      const sign = (i % 2 === 0 ? 1 : -1) * (7.5 + Math.sin(now * 35 + i) * 2.5)
      twin.push({ x: p.x + (-dy / len) * sign, y: p.y + (dx / len) * sign })
    }
    tracePath(twin)
    ctx.strokeStyle = `rgba(250, 204, 21, ${0.88 * ratio})`
    ctx.lineWidth = Math.max(1.4, width * 0.65 * ratio)
    ctx.stroke()
  }

  // Layer 3: Vibrant electric plasma body
  tracePath(refined)
  ctx.strokeStyle = spellColorAlpha(overloaded ? '#fef08a' : color, ratio)
  ctx.lineWidth = Math.max(1.3, width * (0.85 + ratio * 0.25))
  ctx.stroke()

  // Layer 4: Pure incandescent white lightning core
  tracePath(refined)
  ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(1, ratio * 1.15)})`
  ctx.lineWidth = Math.max(0.9, width * 0.42 * ratio)
  ctx.stroke()

  // Micro crackling side-forks sprouting from intermediate bends
  if (pts.length >= 3) {
    for (let i = 1; i < pts.length - 1; i++) {
      if (!overloaded && i % 2 === 0) continue
      const p = pts[i]
      const prev = pts[i - 1]
      const segAng = Math.atan2(p.y - prev.y, p.x - prev.x)
      const side = (Math.floor(p.x + p.y) % 2 === 0 ? 1 : -1)
      const forkAng = segAng + side * (0.68 + ((i * 17) % 10) * 0.04)
      const forkLen = (overloaded ? 19 : 13) * (0.65 + ratio * 0.35)
      const midX = p.x + Math.cos(forkAng + side * 0.22) * (forkLen * 0.55)
      const midY = p.y + Math.sin(forkAng + side * 0.22) * (forkLen * 0.55)
      const endX = p.x + Math.cos(forkAng) * forkLen
      const endY = p.y + Math.sin(forkAng) * forkLen

      ctx.strokeStyle = overloaded ? `rgba(192, 132, 252, ${0.78 * ratio})` : `rgba(250, 204, 21, ${0.68 * ratio})`
      ctx.lineWidth = overloaded ? 2.4 : 1.7
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(midX, midY)
      ctx.lineTo(endX, endY)
      ctx.stroke()

      ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * ratio})`
      ctx.lineWidth = 0.9
      ctx.stroke()
    }
  }

  // Crisp impact flash at destination node
  const tip = pts[pts.length - 1]
  drawElectricStar(ctx, tip.x, tip.y, overloaded ? 14 : 9, ratio, '#ffffff', overloaded ? '#c084fc' : '#fde047')

  ctx.restore()
}

/**
 * Deterministic jagged polyline between two points (for animated electric arcs & fences).
 */
function buildAnimatedArc(x1, y1, x2, y2, jitter, phase, segs = 5) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const pts = [{ x: x1, y: y1 }]
  for (let i = 1; i < segs; i++) {
    const t = i / segs
    const off = Math.sin(phase * 13.7 + i * 2.91) * jitter
    pts.push({ x: x1 + dx * t + nx * off, y: y1 + dy * t + ny * off })
  }
  pts.push({ x: x2, y: y2 })
  return pts
}

export function renderSpellGround(ctx, combat) {
  if (!ctx || !combat) return
  const now = combat.game?.elapsed || 0

  for (const z of combat.zones || []) {
    const fade = Math.max(0.18, Math.min(1, z.life / Math.max(0.5, z.maxLife || 1)))
    const seed = z.seed || (z.x * 0.013 + z.y * 0.017)
    ctx.save()
    ctx.translate(z.x, z.y)

    if (z.kind === 'fire_rain' || z.kind === 'fire_scorch') {
      const pulse = 0.88 + Math.sin(now * 8 + seed) * 0.12
      const isRain = z.kind === 'fire_rain'

      // Blazing scorched-earth radial base (rich fiery amber-crimson glow, readable under red bullets)
      const grad = ctx.createRadialGradient(0, 0, z.radius * 0.06, 0, 0, z.radius)
      grad.addColorStop(0, `rgba(255, 124, 24, ${(isRain ? 0.38 : 0.42) * fade * pulse})`)
      grad.addColorStop(0.45, `rgba(226, 62, 12, ${(isRain ? 0.28 : 0.26) * fade})`)
      grad.addColorStop(0.8, `rgba(118, 28, 8, ${0.2 * fade})`)
      grad.addColorStop(1, 'rgba(92, 20, 6, 0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(0, 0, z.radius, 0, TAU)
      ctx.fill()

      // Organic glowing magma patches & embers across the scorched ground
      drawMagmaFloorPatches(ctx, z.radius, seed, fade * pulse, isRain ? 6 : 4)

      // Fiery wavy outer heat border (warm amber rim + rotating ember arc)
      ctx.strokeStyle = `rgba(218, 56, 12, ${0.46 * fade})`
      ctx.lineWidth = isRain ? 3.2 : 2.2
      ctx.beginPath()
      ctx.arc(0, 0, z.radius, 0, TAU)
      ctx.stroke()

      ctx.strokeStyle = `rgba(255, 194, 72, ${0.8 * fade})`
      ctx.lineWidth = isRain ? 2.2 : 1.6
      ctx.setLineDash([14, 7])
      ctx.beginPath()
      ctx.arc(0, 0, z.radius - 1.5, now * 0.8, now * 0.8 + TAU)
      ctx.stroke()
      ctx.setLineDash([])
    } else if (z.kind === 'ice_blizzard') {
      const pulse = 0.9 + Math.sin(now * 5.2 + seed) * 0.1
      // Cool glacial floor with crisp deep-blue edge so enemies & red bullets remain ultra-readable
      const grad = ctx.createRadialGradient(0, 0, z.radius * 0.08, 0, 0, z.radius)
      grad.addColorStop(0, `rgba(56, 189, 248, ${0.26 * fade * pulse})`)
      grad.addColorStop(0.55, `rgba(14, 116, 144, ${0.18 * fade})`)
      grad.addColorStop(0.88, `rgba(125, 211, 252, ${0.22 * fade})`)
      grad.addColorStop(1, 'rgba(14, 116, 144, 0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(0, 0, z.radius, 0, TAU)
      ctx.fill()

      // Faceted crystalline ice plates & floor snowflakes
      drawFrostFloorPatches(ctx, z.radius, seed, fade * pulse, 6)

      // Solid outer deep-glacial rim + counter-rotating crystalline white-cyan bullet-slow boundary
      ctx.strokeStyle = `rgba(2, 132, 199, ${0.52 * fade})`
      ctx.lineWidth = 3.2
      ctx.beginPath()
      ctx.arc(0, 0, z.radius, 0, TAU)
      ctx.stroke()

      ctx.strokeStyle = `rgba(224, 247, 255, ${0.88 * fade})`
      ctx.lineWidth = 2.0
      ctx.setLineDash([12, 8])
      ctx.beginPath()
      ctx.arc(0, 0, z.radius - 1.5, now * 0.55, now * 0.55 + TAU)
      ctx.stroke()
      ctx.setLineDash([])

      // 6 rotating diamond frost notches along the perimeter
      ctx.fillStyle = `rgba(240, 249, 255, ${0.85 * fade})`
      ctx.strokeStyle = `rgba(12, 74, 110, ${0.65 * fade})`
      ctx.lineWidth = 1.1
      for (let i = 0; i < 6; i++) {
        const a = now * 0.35 + (i * TAU) / 6
        const nx = Math.cos(a) * z.radius
        const ny = Math.sin(a) * z.radius
        ctx.save()
        ctx.translate(nx, ny)
        ctx.rotate(a)
        ctx.beginPath()
        ctx.moveTo(5, 0)
        ctx.lineTo(0, -3)
        ctx.lineTo(-4, 0)
        ctx.lineTo(0, 3)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        ctx.restore()
      }
    } else if (z.kind === 'poison_seed') {
      const charge = z.burstThreshold > 0 ? Math.min(1, (z.damageAccum || 0) / z.burstThreshold) : 0
      const pulse = 0.88 + Math.sin(now * (5 + charge * 9) + seed) * 0.12

      // Deep shadow-plum & acidic fel-lime bog so it contrasts sharply against olive grass
      const grad = ctx.createRadialGradient(0, 0, z.radius * 0.06, 0, 0, z.radius)
      grad.addColorStop(0, `rgba(59, 7, 100, ${(0.34 + charge * 0.14) * fade * pulse})`)
      grad.addColorStop(0.5, `rgba(101, 163, 13, ${(0.22 + charge * 0.12) * fade})`)
      grad.addColorStop(0.84, `rgba(88, 28, 135, ${(0.24 + charge * 0.1) * fade})`)
      grad.addColorStop(1, 'rgba(59, 7, 100, 0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(0, 0, z.radius, 0, TAU)
      ctx.fill()

      // 5 organic creeping forked dark-violet blight root vines radiating from the central seed
      ctx.lineCap = 'round'
      for (let i = 0; i < 5; i++) {
        const a = seed + (i * TAU) / 5
        const len = z.radius * (0.64 + (i % 2) * 0.15)
        const cpx = Math.cos(a + 0.34) * len * 0.52
        const cpy = Math.sin(a + 0.34) * len * 0.52
        const ex = Math.cos(a) * len
        const ey = Math.sin(a) * len
        ctx.strokeStyle = `rgba(76, 29, 149, ${0.52 * fade})`
        ctx.lineWidth = 2.6
        ctx.beginPath()
        ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 10)
        ctx.quadraticCurveTo(cpx, cpy, ex, ey)
        ctx.stroke()

        // Secondary delicate creeping vine fork
        const bx = cpx * 0.82 + ex * 0.22
        const by = cpy * 0.82 + ey * 0.22
        const fa = a + (i % 2 === 0 ? 0.55 : -0.55)
        ctx.strokeStyle = `rgba(107, 33, 168, ${0.42 * fade})`
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(bx, by)
        ctx.lineTo(bx + Math.cos(fa) * (z.radius * 0.24), by + Math.sin(fa) * (z.radius * 0.24))
        ctx.stroke()
      }

      // Bubbling toxic acid blisters popping across the floor
      for (let i = 0; i < 6; i++) {
        const cyc = (now * (0.75 + (i % 3) * 0.2) + i * 0.37 + seed) % 1
        const a = seed * 1.4 + i * GOLDEN_ANGLE
        const d = z.radius * (0.28 + ((i * 23) % 10) * 0.052)
        const bx = Math.cos(a) * d
        const by = Math.sin(a) * d
        const br = 2.5 + cyc * 6.5
        const ba = Math.sin(cyc * Math.PI) * fade
        ctx.fillStyle = `rgba(163, 230, 53, ${0.24 * ba})`
        ctx.strokeStyle = `rgba(190, 242, 100, ${0.8 * ba})`
        ctx.lineWidth = 1.3
        ctx.beginPath()
        ctx.arc(bx, by, br, 0, TAU)
        ctx.fill()
        ctx.stroke()
      }

      // Dual venomous perimeter rim (deep shadow-violet base + rotating glowing fel-lime dashes)
      ctx.strokeStyle = `rgba(88, 28, 135, ${(0.58 + charge * 0.25) * fade})`
      ctx.lineWidth = 3.2
      ctx.beginPath()
      ctx.arc(0, 0, z.radius, 0, TAU)
      ctx.stroke()

      ctx.strokeStyle = charge > 0.65
        ? `rgba(217, 249, 157, ${(0.82 + pulse * 0.16) * fade})`
        : `rgba(163, 230, 53, ${(0.64 + charge * 0.3) * fade})`
      ctx.lineWidth = 2.0
      ctx.setLineDash([9, 6])
      ctx.beginPath()
      ctx.arc(0, 0, z.radius - 1.2, -now * (0.65 + charge * 1.1), -now * (0.65 + charge * 1.1) + TAU)
      ctx.stroke()
      ctx.setLineDash([])
    } else if (z.kind === 'static_field') {
      // Storm-blue electrified ground bed
      const grad = ctx.createRadialGradient(0, 0, z.radius * 0.08, 0, 0, z.radius)
      grad.addColorStop(0, `rgba(30, 64, 175, ${0.24 * fade})`)
      grad.addColorStop(0.62, `rgba(56, 189, 248, ${0.15 * fade})`)
      grad.addColorStop(1, 'rgba(30, 58, 138, 0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(0, 0, z.radius, 0, TAU)
      ctx.fill()

      // Crackling irregular 28-vertex electric perimeter ring
      const verts = 28
      const ringPts = []
      const tickStep = Math.floor(now * 18)
      for (let i = 0; i <= verts; i++) {
        const idx = i % verts
        const a = idx * (TAU / verts)
        const hash = Math.sin(idx * 12.9898 + tickStep * 7.13 + seed) * 43758.5453
        const frac = hash - Math.floor(hash)
        const jit = (frac - 0.5) * 9.6
        ringPts.push({ x: Math.cos(a) * (z.radius + jit), y: Math.sin(a) * (z.radius + jit) })
      }
      ctx.beginPath()
      ctx.moveTo(ringPts[0].x, ringPts[0].y)
      for (let i = 1; i < ringPts.length; i++) ctx.lineTo(ringPts[i].x, ringPts[i].y)
      ctx.strokeStyle = `rgba(37, 99, 235, ${0.52 * fade})`
      ctx.lineWidth = 5.0
      ctx.lineJoin = 'round'
      ctx.stroke()
      ctx.strokeStyle = `rgba(250, 204, 21, ${0.84 * fade})`
      ctx.lineWidth = 2.0
      ctx.stroke()
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * fade})`
      ctx.lineWidth = 0.9
      ctx.stroke()

      // 3 interior crackling static arcs dancing across the field
      for (let i = 0; i < 3; i++) {
        const a1 = seed + i * 2.1 + tickStep * 0.55
        const a2 = a1 + 2.25
        const r1 = z.radius * 0.72
        const pts = buildAnimatedArc(
          Math.cos(a1) * r1,
          Math.sin(a1) * r1,
          Math.cos(a2) * r1,
          Math.sin(a2) * r1,
          7,
          tickStep + i * 3.3,
          4
        )
        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y)
        ctx.strokeStyle = `rgba(125, 211, 252, ${0.56 * fade})`
        ctx.lineWidth = 2.1
        ctx.stroke()
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.72 * fade})`
        ctx.lineWidth = 0.85
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  // Infernal Permanent Immolation Aura + Storm Totem Crit Aura
  for (const s of combat.summons || []) {
    if (s.kind === 'storm_totem') {
      const r = s.radius || 175
      const fade = Math.max(0.25, Math.min(1, s.life / Math.max(0.5, s.maxLife || 1)))
      const pulse = 0.88 + Math.sin(now * 6) * 0.12
      ctx.save()
      ctx.translate(s.x, s.y)
      const grad = ctx.createRadialGradient(0, 0, r * 0.65, 0, 0, r)
      grad.addColorStop(0, 'rgba(56, 189, 248, 0)')
      grad.addColorStop(0.84, `rgba(56, 189, 248, ${0.1 * fade * pulse})`)
      grad.addColorStop(1, `rgba(250, 204, 21, ${0.18 * fade * pulse})`)
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, TAU)
      ctx.fill()

      ctx.strokeStyle = `rgba(37, 99, 235, ${0.38 * fade})`
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, TAU)
      ctx.stroke()

      ctx.strokeStyle = `rgba(250, 204, 21, ${0.72 * fade})`
      ctx.lineWidth = 1.8
      ctx.setLineDash([12, 10])
      ctx.beginPath()
      ctx.arc(0, 0, r, now * 0.45, now * 0.45 + TAU)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
      continue
    }
    if (s.kind !== 'infernal') continue
    const r = s.auraRadius || 88
    const pulse = 0.86 + Math.sin(now * 8.5) * 0.14
    ctx.save()
    ctx.translate(s.x, s.y)

    const grad = ctx.createRadialGradient(0, 0, r * 0.12, 0, 0, r)
    grad.addColorStop(0, s.isAbyssalLord ? `rgba(255, 118, 24, ${0.32 * pulse})` : `rgba(245, 92, 20, ${0.25 * pulse})`)
    grad.addColorStop(0.66, `rgba(224, 58, 14, ${0.14 * pulse})`)
    grad.addColorStop(0.92, `rgba(255, 132, 34, ${0.24 * pulse})`)
    grad.addColorStop(1, 'rgba(180, 32, 6, 0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, TAU)
    ctx.fill()

    // Warm molten foot scorch directly beneath golem
    drawMagmaFloorPatches(ctx, Math.min(46, r * 0.48), s.seed || 0.7, 0.85 * pulse, 4)

    // Cohesive dual-ring fiery aura border (subtle solid heat halo + rotating flame dashes)
    ctx.strokeStyle = s.isAbyssalLord ? `rgba(255, 102, 24, ${0.52 * pulse})` : `rgba(235, 76, 18, ${0.42 * pulse})`
    ctx.lineWidth = 3.5
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, TAU)
    ctx.stroke()

    ctx.strokeStyle = s.isAbyssalLord ? `rgba(255, 214, 92, ${0.86 * pulse})` : `rgba(255, 174, 62, ${0.76 * pulse})`
    ctx.lineWidth = 2.0
    ctx.setLineDash([16, 10])
    ctx.beginPath()
    ctx.arc(0, 0, r - 1, -now * 1.25, -now * 1.25 + TAU)
    ctx.stroke()
    ctx.setLineDash([])

    // Low flickering fire licks hugging the immolation rim
    const rimClusters = s.isAbyssalLord ? 10 : 8
    for (let i = 0; i < rimClusters; i++) {
      const a = (i * TAU) / rimClusters + now * 0.55
      const fx = Math.cos(a) * r
      const fy = Math.sin(a) * r
      const fPhase = now * 11 + i * 2.1
      const fh = (s.isAbyssalLord ? 13 : 10) + Math.sin(fPhase) * 3
      drawFlameTongue(ctx, fx, fy + 2, 4.6, fh, Math.cos(fPhase) * 2.5, 0.7)
    }
    ctx.restore()
  }

  for (const f of combat.fields || []) {
    if (f.kind === 'arc_grid' && f.points?.length >= 2) {
      const a = Math.max(0.18, f.life / (f.maxLife || 1.2))
      const step = Math.floor(now * 20)
      ctx.save()
      for (let i = 0; i < f.points.length - 1; i++) {
        const p1 = f.points[i]
        const p2 = f.points[i + 1]
        const segPts = buildAnimatedArc(p1.x, p1.y, p2.x, p2.y, 7.5, step + i * 2.7, 5)
        ctx.beginPath()
        ctx.moveTo(segPts[0].x, segPts[0].y)
        for (let k = 1; k < segPts.length; k++) ctx.lineTo(segPts[k].x, segPts[k].y)
        ctx.strokeStyle = `rgba(126, 34, 206, ${0.58 * a})`
        ctx.lineWidth = 7.5
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.stroke()

        ctx.strokeStyle = `rgba(216, 180, 254, ${0.86 * a})`
        ctx.lineWidth = 3.2
        ctx.stroke()

        ctx.strokeStyle = `rgba(255, 255, 255, ${0.95 * a})`
        ctx.lineWidth = 1.2
        ctx.stroke()
      }
      // Crackling electric pylon nodes at every anchor vertex
      for (let i = 0; i < f.points.length; i++) {
        drawElectricStar(ctx, f.points[i].x, f.points[i].y, 9.5, a, '#ffffff', '#c084fc')
      }
      ctx.restore()
    }
  }
}

export function renderSpells(ctx, combat) {
  if (!ctx || !combat) return
  const p = combat.player
  const now = combat.game?.elapsed || 0

  // Dynamic elemental zone overlays: Fire Rain flames, Blizzard snowstorm gusts/hail, Poison Seed pulsing pod
  _renderFireZonesOverlay(ctx, combat, now)
  _renderBlizzardZonesOverlay(ctx, combat, now)
  _renderPoisonSeedZonesOverlay(ctx, combat, now)

  if (p) {
    _renderShieldAndOrbs(ctx, combat, p, now)
  }

  for (const s of combat.summons || []) {
    _renderSummon(ctx, s, now)
  }

  for (const shot of combat.shots || []) {
    _renderShot(ctx, shot, now)
  }

  for (const fx of combat.effects || []) {
    _renderEffect(ctx, fx, now)
  }
}

function _renderFireZonesOverlay(ctx, combat, now) {
  for (const z of combat.zones || []) {
    if (z.kind !== 'fire_rain' && z.kind !== 'fire_scorch') continue
    const fade = Math.max(0.15, Math.min(1, z.life / Math.max(0.5, z.maxLife || 1)))
    const seed = z.seed || (z.x * 0.013 + z.y * 0.017)
    const isRain = z.kind === 'fire_rain'

    ctx.save()
    ctx.translate(z.x, z.y)

    // 1. Roaring 3-tongue ground wildfire clusters spread across the burning zone
    const clusterCount = isRain ? 10 : 5
    for (let i = 0; i < clusterCount; i++) {
      const ringFrac = i === 0 ? 0.12 : 0.25 + ((i - 0.5) / clusterCount) * 0.65
      const ang = seed + i * GOLDEN_ANGLE
      const fx = Math.cos(ang) * z.radius * ringFrac
      const fy = Math.sin(ang) * z.radius * ringFrac
      const cScale = (isRain ? 0.88 : 0.78) + (i % 3) * 0.16
      const phase = now * (9.5 + (i % 4) * 1.8) + i * 1.9 + seed
      drawFireCluster(ctx, fx, fy + 2, cScale, phase, 0.86 * fade)
    }

    // 2. Abundant rising golden-orange embers drifting skyward
    const emberCount = isRain ? 14 : 7
    for (let i = 0; i < emberCount; i++) {
      const cycle = (now * (0.9 + (i % 4) * 0.18) + i * 0.29 + seed) % 1
      const ang = seed * 2 + i * GOLDEN_ANGLE
      const dist = z.radius * (0.1 + ((i * 29) % 100) / 118)
      const ex = Math.cos(ang) * dist + Math.sin(cycle * TAU + i) * 9
      const ey = Math.sin(ang) * dist - cycle * 56
      const eAlpha = Math.sin(cycle * Math.PI) * fade
      ctx.fillStyle = i % 3 === 0 ? `rgba(255, 248, 178, ${eAlpha})` : i % 3 === 1 ? `rgba(255, 178, 48, ${eAlpha})` : `rgba(255, 92, 24, ${eAlpha})`
      ctx.beginPath()
      ctx.arc(ex, ey, 1.5 + (1 - cycle) * 2.1, 0, TAU)
      ctx.fill()
    }

    // 3. Dense diagonal raining fireballs pouring from the sky into the Fire Rain zone
    if (isRain) {
      const dropCount = 7
      for (let i = 0; i < dropCount; i++) {
        const rate = 1.65 + (i % 4) * 0.17
        const raw = now * rate + i * 0.19 + seed
        const loopId = Math.floor(raw)
        const t = raw - loopId
        const a = seed + (loopId * 1.85 + i * GOLDEN_ANGLE)
        const rDist = z.radius * (0.12 + (((loopId * 23 + i * 37) % 100) / 100) * 0.76)
        const tx = Math.cos(a) * rDist
        const ty = Math.sin(a) * rDist

        if (t < 0.64) {
          const u = t / 0.64
          const ease = u * u
          const skyDx = 96
          const skyDy = -230
          const hx = tx + skyDx * (1 - ease)
          const hy = ty + dyScaled(skyDy, 1 - ease)
          const tailFactor = 0.26 + ease * 0.16
          const tailX = hx + skyDx * tailFactor
          const tailY = hy + skyDy * tailFactor

          // Subtle orange landing glow as fire drop approaches
          ctx.fillStyle = `rgba(255, 128, 32, ${0.22 * ease * fade})`
          ctx.beginPath()
          ctx.ellipse(tx, ty, 14 * ease + 4, 8 * ease + 2, 0, 0, TAU)
          ctx.fill()

          // Wide crimson outer fire wake
          const outerTail = ctx.createLinearGradient(hx, hy, tailX, tailY)
          outerTail.addColorStop(0, `rgba(255, 102, 20, ${0.88 * fade})`)
          outerTail.addColorStop(0.5, `rgba(224, 42, 8, ${0.52 * fade})`)
          outerTail.addColorStop(1, 'rgba(180, 22, 4, 0)')
          ctx.strokeStyle = outerTail
          ctx.lineWidth = 10.5
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(hx, hy)
          ctx.lineTo(tailX, tailY)
          ctx.stroke()

          // Inner bright golden-white comet core wake
          const innerTail = ctx.createLinearGradient(hx, hy, hx + skyDx * tailFactor * 0.55, hy + skyDy * tailFactor * 0.55)
          innerTail.addColorStop(0, `rgba(255, 250, 200, ${0.98 * fade})`)
          innerTail.addColorStop(0.6, `rgba(255, 186, 52, ${0.85 * fade})`)
          innerTail.addColorStop(1, 'rgba(255, 120, 20, 0)')
          ctx.strokeStyle = innerTail
          ctx.lineWidth = 4.6
          ctx.beginPath()
          ctx.moveTo(hx, hy)
          ctx.lineTo(hx + skyDx * tailFactor * 0.55, hy + skyDy * tailFactor * 0.55)
          ctx.stroke()

          // Blazing fireball tip (NO dark shell — pure radiant fire!)
          ctx.fillStyle = `rgba(255, 92, 18, ${0.95 * fade})`
          ctx.beginPath()
          ctx.arc(hx, hy, 6.4, 0, TAU)
          ctx.fill()
          ctx.fillStyle = `rgba(255, 248, 198, ${fade})`
          ctx.beginPath()
          ctx.arc(hx - 0.6, hy + 0.6, 3.4, 0, TAU)
          ctx.fill()
        } else {
          // Fiery ground splash flare right on touchdown
          const sp = (t - 0.64) / 0.36
          const inv = 1 - sp
          drawFireCluster(ctx, tx, ty + 2, 0.95 * inv + 0.25, now * 16 + i, inv * fade)
          ctx.strokeStyle = `rgba(255, 196, 74, ${0.78 * inv * fade})`
          ctx.lineWidth = 2.4 * inv
          ctx.beginPath()
          ctx.arc(tx, ty, 8 + sp * 28, 0, TAU)
          ctx.stroke()
        }
      }
    }

    ctx.restore()
  }
}

function dyScaled(dy, k) {
  return dy * k
}

/**
 * Swirling snowstorm gusts, continuous falling hailstones & spinning 6-point snowflakes for Blizzard.
 */
function _renderBlizzardZonesOverlay(ctx, combat, now) {
  for (const z of combat.zones || []) {
    if (z.kind !== 'ice_blizzard') continue
    const fade = Math.max(0.16, Math.min(1, z.life / Math.max(0.5, z.maxLife || 1)))
    const seed = z.seed || (z.x * 0.013 + z.y * 0.017)

    ctx.save()
    ctx.translate(z.x, z.y)

    // 1. Spiraling icy wind-gust ribbons whipping inward across the blizzard
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (let i = 0; i < 4; i++) {
      const baseA = now * (2.3 + (i % 2) * 0.55) + (i * TAU) / 4 + seed
      const rStart = z.radius * (0.86 - (i % 2) * 0.14)
      const rEnd = z.radius * (0.28 + (i % 2) * 0.1)
      const sweep = 1.45

      ctx.beginPath()
      for (let k = 0; k <= 10; k++) {
        const u = k / 10
        const rr = rStart + (rEnd - rStart) * u + Math.sin(u * Math.PI) * 8
        const aa = baseA + u * sweep
        const gx = Math.cos(aa) * rr
        const gy = Math.sin(aa) * rr
        if (k === 0) ctx.moveTo(gx, gy)
        else ctx.lineTo(gx, gy)
      }
      ctx.strokeStyle = `rgba(56, 189, 248, ${0.34 * fade})`
      ctx.lineWidth = 5.4
      ctx.stroke()

      ctx.strokeStyle = `rgba(240, 249, 255, ${0.74 * fade})`
      ctx.lineWidth = 1.8
      ctx.stroke()
    }

    // 2. Dense wind-swept snow flecks drifting diagonally across the storm
    for (let i = 0; i < 26; i++) {
      const cyc = (now * (0.95 + (i % 4) * 0.16) + i * 0.19 + seed) % 1
      const ang = seed * 1.7 + i * GOLDEN_ANGLE
      const baseR = z.radius * (0.1 + ((i * 29) % 100) / 116)
      const sx = Math.cos(ang) * baseR + (0.5 - cyc) * 48
      const sy = Math.sin(ang) * baseR - (1 - cyc) * 42
      const sAlpha = Math.sin(cyc * Math.PI) * fade
      ctx.fillStyle = i % 3 === 0 ? `rgba(255, 255, 255, ${0.96 * sAlpha})` : `rgba(186, 230, 253, ${0.88 * sAlpha})`
      ctx.beginPath()
      ctx.arc(sx, sy, 1.5 + (i % 3) * 0.85, 0, TAU)
      ctx.fill()
    }

    // 3. Abundant continuous falling sharp hailstone icicles & spinning 6-point snowflakes
    const dropCount = 12
    for (let i = 0; i < dropCount; i++) {
      const isHail = i % 2 === 0
      const rate = isHail ? 1.75 + (i % 3) * 0.18 : 1.05 + (i % 3) * 0.14
      const raw = now * rate + i * 0.17 + seed
      const loopId = Math.floor(raw)
      const t = raw - loopId
      const a = seed + loopId * 1.9 + i * GOLDEN_ANGLE
      const rDist = z.radius * (0.08 + (((loopId * 19 + i * 41) % 100) / 100) * 0.82)
      const tx = Math.cos(a) * rDist
      const ty = Math.sin(a) * rDist

      if (t < 0.68) {
        const u = t / 0.68
        const ease = isHail ? u * u : u
        const skyDx = isHail ? 76 : 56 + Math.sin(now * 5 + i) * 14
        const skyDy = isHail ? -205 : -150
        const hx = tx + skyDx * (1 - ease)
        const hy = ty + skyDy * (1 - ease)

        if (isHail) {
          // Subtle frost landing marker
          ctx.fillStyle = `rgba(125, 211, 252, ${0.22 * ease * fade})`
          ctx.beginPath()
          ctx.ellipse(tx, ty, 11 * ease + 3, 6 * ease + 1.5, 0, 0, TAU)
          ctx.fill()

          // Diagonal icy hail wake
          const tailX = hx + skyDx * 0.25
          const tailY = hy + skyDy * 0.25
          const wake = ctx.createLinearGradient(hx, hy, tailX, tailY)
          wake.addColorStop(0, `rgba(224, 247, 255, ${0.96 * fade})`)
          wake.addColorStop(0.5, `rgba(56, 189, 248, ${0.68 * fade})`)
          wake.addColorStop(1, 'rgba(14, 165, 233, 0)')
          ctx.strokeStyle = wake
          ctx.lineWidth = 4.8
          ctx.beginPath()
          ctx.moveTo(hx, hy)
          ctx.lineTo(tailX, tailY)
          ctx.stroke()

          // Faceted sharp crystal hailstone tip
          const fallAng = Math.atan2(-skyDy, -skyDx)
          ctx.save()
          ctx.translate(hx, hy)
          ctx.rotate(fallAng)
          drawPoly(ctx, [[8.2, 0], [-2.6, -3.6], [-6.4, 0], [-2.6, 3.6]], '#7dd3fc', '#0c4a6e', 1.2)
          drawPoly(ctx, [[6.4, 0], [-1.5, -1.7], [-3.4, 0]], '#ffffff', null)
          ctx.restore()
        } else {
          // Spinning crystalline 6-point snowflake fluttering down
          const flakeAlpha = Math.min(1, u * 3) * fade
          const flR = 7.4 + (i % 3) * 1.8
          drawSnowflake(ctx, hx, hy, flR + 0.8, now * 2.4 + i, `rgba(12, 74, 110, ${0.46 * flakeAlpha})`, 2.5)
          drawSnowflake(ctx, hx, hy, flR, now * 2.4 + i, `rgba(240, 249, 255, ${0.96 * flakeAlpha})`, 1.45)
        }
      } else {
        // Touchdown frost crystal splash!
        const sp = (t - 0.68) / 0.32
        const inv = 1 - sp
        drawSnowflake(ctx, tx, ty, (9 + sp * 12), seed + i, `rgba(224, 247, 255, ${0.9 * inv * fade})`, 1.6 * inv + 0.5)
        ctx.strokeStyle = `rgba(56, 189, 248, ${0.76 * inv * fade})`
        ctx.lineWidth = 2.0 * inv
        ctx.beginPath()
        ctx.arc(tx, ty, 5 + sp * 22, 0, TAU)
        ctx.stroke()
      }
    }

    ctx.restore()
  }
}

/**
 * Pulsing central Warlock Blighted Seed Pod (swelling & glowing as damage charges burstThreshold)
 * + drifting fel-green & shadow-violet toxic spores.
 */
function _renderPoisonSeedZonesOverlay(ctx, combat, now) {
  for (const z of combat.zones || []) {
    if (z.kind !== 'poison_seed') continue
    const fade = Math.max(0.18, Math.min(1, z.life / Math.max(0.5, z.maxLife || 1)))
    const seed = z.seed || (z.x * 0.013 + z.y * 0.017)
    const charge = z.burstThreshold > 0 ? Math.min(1, (z.damageAccum || 0) / z.burstThreshold) : 0
    const beat = Math.sin(now * (6 + charge * 12) + seed)
    const podScale = (0.94 + charge * 0.44 + beat * (0.06 + charge * 0.08)) * (0.86 + fade * 0.14)

    ctx.save()
    ctx.translate(z.x, z.y)

    // 1. Drifting glowing fel-green & shadow-violet toxic spores rising out of the bog
    for (let i = 0; i < 12; i++) {
      const cyc = (now * (0.75 + (i % 3) * 0.2) + i * 0.27 + seed) % 1
      const ang = seed * 1.9 + i * GOLDEN_ANGLE
      const dist = z.radius * (0.14 + ((i * 29) % 100) / 118)
      const sx = Math.cos(ang) * dist + Math.sin(cyc * TAU + i) * 7
      const sy = Math.sin(ang) * dist - cyc * 44
      const sAlpha = Math.sin(cyc * Math.PI) * fade
      ctx.fillStyle = i % 3 === 0 ? `rgba(192, 132, 252, ${0.92 * sAlpha})` : `rgba(190, 242, 100, ${0.96 * sAlpha})`
      ctx.strokeStyle = `rgba(46, 16, 101, ${0.7 * sAlpha})`
      ctx.lineWidth = 0.9
      ctx.beginPath()
      ctx.arc(sx, sy, 1.9 + (1 - cyc) * 2.1, 0, TAU)
      ctx.fill()
      ctx.stroke()
    }

    // 2. Pulsing Blighted Seed Pod anchored at center
    ctx.save()
    ctx.scale(podScale, podScale)

    // Ground drop shadow & glowing toxic aura under pod
    ctx.fillStyle = `rgba(26, 6, 46, ${0.52 * fade})`
    ctx.beginPath()
    ctx.ellipse(0, 8, 17, 7.5, 0, 0, TAU)
    ctx.fill()

    const aura = ctx.createRadialGradient(0, 0, 4, 0, 0, 28)
    aura.addColorStop(0, `rgba(163, 230, 53, ${(0.36 + charge * 0.42) * fade})`)
    aura.addColorStop(0.62, `rgba(147, 51, 234, ${(0.26 + charge * 0.22) * fade})`)
    aura.addColorStop(1, 'rgba(88, 28, 135, 0)')
    ctx.fillStyle = aura
    ctx.beginPath()
    ctx.arc(0, 0, 28, 0, TAU)
    ctx.fill()

    // High-charge unstable stress ripple radiating off the pod right before explosion!
    if (charge > 0.55) {
      const rCyc = (now * 2.4 + seed) % 1
      ctx.strokeStyle = `rgba(217, 249, 157, ${(1 - rCyc) * 0.85 * fade})`
      ctx.lineWidth = 2.0 * (1 - rCyc) + 0.5
      ctx.beginPath()
      ctx.arc(0, 0, 18 + rCyc * 20, 0, TAU)
      ctx.stroke()
    }

    // Detonation charge arc hugging the seed pod
    const ringR = 19.5
    ctx.strokeStyle = `rgba(46, 16, 101, ${0.55 * fade})`
    ctx.lineWidth = 3.2
    ctx.beginPath()
    ctx.arc(0, 0, ringR, 0, TAU)
    ctx.stroke()

    if (charge > 0.02) {
      ctx.strokeStyle = charge > 0.72 ? `rgba(232, 121, 249, ${0.98 * fade})` : `rgba(190, 242, 100, ${0.95 * fade})`
      ctx.lineWidth = 2.8
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(0, 0, ringR, -Math.PI / 2, -Math.PI / 2 + charge * TAU)
      ctx.stroke()
    }

    // Swollen glowing acid-lime plague sac inside husk
    const sacGrad = ctx.createRadialGradient(-2, -3, 1.5, 0, 0, 12.5)
    sacGrad.addColorStop(0, '#ecfccb')
    sacGrad.addColorStop(0.45, charge > 0.7 ? '#d9f99d' : '#a3e635')
    sacGrad.addColorStop(0.85, '#4d7c0f')
    sacGrad.addColorStop(1, '#3b0764')
    ctx.fillStyle = sacGrad
    ctx.strokeStyle = '#1e0a36'
    ctx.lineWidth = 2.0
    ctx.beginPath()
    ctx.ellipse(0, -1, 10.5, 12.5, 0, 0, TAU)
    ctx.fill()
    ctx.stroke()

    // Pulsing bright plague veins across the swollen sac
    ctx.strokeStyle = charge > 0.65 ? `rgba(240, 171, 252, ${0.95 * fade})` : `rgba(236, 252, 203, ${0.78 * fade})`
    ctx.lineWidth = 1.5 + charge * 0.6
    ctx.beginPath()
    ctx.moveTo(0, -11)
    ctx.quadraticCurveTo(-4, -3, -2, 7)
    ctx.moveTo(0, -11)
    ctx.quadraticCurveTo(5, -2, 3, 6)
    ctx.stroke()

    // 3 dark-violet thorny husk sepals cradling the glowing pod
    drawPoly(ctx, [[-12, 5], [-14, -5], [-7, -9], [-5, 2], [-3, 9]], '#581c87', '#1e0a36', 1.8)
    drawPoly(ctx, [[12, 5], [14, -5], [7, -9], [5, 2], [3, 9]], '#4c1d95', '#1e0a36', 1.8)
    drawPoly(ctx, [[-5, 9], [0, 3], [5, 9], [0, 12]], '#3b0764', '#1e0a36', 1.6)

    // Radiant neon pustule crown glint on top of seed
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(-2.5, -5.5, 2.2 + charge * 1.1, 0, TAU)
    ctx.fill()

    ctx.restore()
    ctx.restore()
  }
}

function _renderShieldAndOrbs(ctx, combat, p, now) {
  const shield = combat.shield
  if (shield?.charges > 0) {
    const r = (p.radius || 18) + 8 + (shield.flash > 0 ? shield.flash * 8 : 0)
    const color = shield.color || '#84d6e8'
    ctx.save()
    ctx.strokeStyle = spellColorAlpha(color, shield.charges >= 2 ? 0.88 : 0.65)
    ctx.lineWidth = shield.charges >= 2 ? 2.8 : 2.0
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, TAU)
    ctx.stroke()
    if (shield.charges >= 2) {
      ctx.strokeStyle = spellColorAlpha('#ffffff', 0.45)
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(p.x, p.y, r + 4, 0, TAU)
      ctx.stroke()
    }
    ctx.restore()
  }

  // Orbiting cantrip crystals + Hot Streak pips
  if (combat.crossCantrips?.length) {
    for (let i = 0; i < combat.crossCantrips.length; i++) {
      const c = combat.crossCantrips[i]
      const pal = BASE_SPELL_PALETTES[c === 'ice' ? 'water' : c] || BASE_SPELL_PALETTES.fire
      const ang = now * 2.4 + i * Math.PI
      const ox = p.x + Math.cos(ang) * 26
      const oy = p.y + Math.sin(ang) * 20
      ctx.save()
      ctx.fillStyle = pal.main
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(ox, oy, 4.2, 0, TAU)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }
  }

  if (combat.school === 'fire' && combat.hotStreak > 0) {
    ctx.save()
    ctx.fillStyle = '#ffd166'
    ctx.beginPath()
    ctx.arc(p.x, p.y - (p.radius || 18) - 10, 4.5, 0, TAU)
    ctx.fill()
    ctx.restore()
  }
}

/**
 * Dota 2 Warlock Golem-inspired Infernal Summon:
 * Towering charred-obsidian rock golem suspended around a blazing molten-magma skeleton,
 * massive jagged pauldrons crowned in fire, curved demon horns, glowing furnace chest,
 * and oversized flame-wreathed stone fists.
 */
function _renderInfernal(ctx, s, now) {
  const isLord = !!s.isAbyssalLord
  const scale = isLord ? 1.24 : 1.08
  const spawnEase = s.spawnT > 0 ? 1 - Math.min(1, s.spawnT / 0.42) : 1
  const popScale = 0.65 + spawnEase * 0.35
  const walk = s.walkT || 0
  const strideL = Math.sin(walk) * 3.6
  const strideR = -strideL
  const breath = Math.sin(now * 5.2 + (s.seed || 0)) * 1.5
  const slamRatio = s.slamT > 0 ? Math.sin((s.slamT / 0.34) * Math.PI) : 0
  const facing = s.facing < 0 ? -1 : 1
  const pulse = 0.78 + Math.sin(now * 10 + (s.seed || 0)) * 0.22

  const ink = '#140907'
  const stoneDark = isLord ? '#240f0f' : '#261714'
  const stoneMid = isLord ? '#471d18' : '#402822'
  const stoneHi = isLord ? '#6b3224' : '#5e3f35'
  const lavaOuter = isLord ? '#ff3800' : '#ff4d12'
  const lavaMid = isLord ? '#ffb01f' : '#ff981e'
  const lavaCore = '#fff6be'

  ctx.save()
  ctx.scale(scale * popScale, scale * popScale)

  // Ground drop shadow
  ctx.fillStyle = 'rgba(20, 8, 4, 0.46)'
  ctx.beginPath()
  ctx.ellipse(0, 23, 27, 10.5, 0, 0, TAU)
  ctx.fill()

  // Ambient molten body radiance (makes dark basalt plates pop strongly over bright terrain)
  const backGlow = ctx.createRadialGradient(0, -6, 6, 0, -6, 40)
  backGlow.addColorStop(0, `rgba(255, 132, 28, ${0.56 * pulse})`)
  backGlow.addColorStop(0.6, `rgba(235, 62, 12, ${0.24 * pulse})`)
  backGlow.addColorStop(1, 'rgba(235, 62, 12, 0)')
  ctx.fillStyle = backGlow
  ctx.beginPath()
  ctx.arc(0, -6, 40, 0, TAU)
  ctx.fill()

  ctx.save()
  ctx.scale(facing, 1)

  // Abyssal Lord roaring molten flame wings behind torso
  if (isLord) {
    drawFlameTongue(ctx, -20, -14 + breath, 12, 36 + pulse * 6, -12 + Math.sin(now * 11) * 3, 0.92)
    drawFlameTongue(ctx, 20, -14 + breath, 12, 36 + pulse * 6, 12 + Math.cos(now * 11) * 3, 0.92)
  }

  // ---- 1. Heavy Basalt Legs with Molten Joint Glow ----
  // Left leg
  drawPoly(
    ctx,
    [
      [-14, 7 + breath * 0.4],
      [-4.5, 7 + breath * 0.4],
      [-5, 22 + strideL],
      [-15.5, 23 + strideL],
      [-17, 15 + strideL * 0.5],
    ],
    stoneDark,
    ink,
    2.2
  )
  // Right leg
  drawPoly(
    ctx,
    [
      [4.5, 7 + breath * 0.4],
      [14, 7 + breath * 0.4],
      [17, 15 + strideR * 0.5],
      [15.5, 23 + strideR],
      [5, 22 + strideR],
    ],
    stoneMid,
    ink,
    2.2
  )
  // Molten lava knee cracks
  ctx.strokeStyle = lavaMid
  ctx.lineWidth = 2.0
  ctx.beginPath()
  ctx.moveTo(-14, 14 + strideL * 0.5); ctx.lineTo(-6.5, 15 + strideL * 0.5)
  ctx.moveTo(6.5, 15 + strideR * 0.5); ctx.lineTo(14, 14 + strideR * 0.5)
  ctx.stroke()

  // ---- 2. Broad Inverted-Triangle Obsidian Chest + Glowing Molten Core ----
  const ty = breath
  // Glowing inner magma torso skeleton visible around rock armor gaps
  ctx.fillStyle = lavaOuter
  ctx.beginPath()
  ctx.ellipse(0, -4 + ty, 19, 13, 0, 0, TAU)
  ctx.fill()

  drawPoly(
    ctx,
    [
      [-18, -14 + ty],
      [18, -14 + ty],
      [22, -2 + ty],
      [13, 12 + ty],
      [-13, 12 + ty],
      [-22, -2 + ty],
    ],
    stoneMid,
    ink,
    2.5
  )
  // Right shaded bevel & left lit rock plane
  drawPoly(ctx, [[3, -13 + ty], [17, -13 + ty], [20, -2 + ty], [12, 11 + ty], [2, 11 + ty]], stoneDark, null)
  drawPoly(ctx, [[-16, -12 + ty], [-5, -12 + ty], [-8, 1 + ty], [-19, -2 + ty]], stoneHi, null)

  // Signature Dota 2 Warlock Golem furnace chest cavity
  drawPoly(
    ctx,
    [
      [0, -11 + ty],
      [8.5, -4.5 + ty],
      [5.5, 6 + ty],
      [0, 9 + ty],
      [-5.5, 6 + ty],
      [-8.5, -4.5 + ty],
    ],
    lavaOuter,
    null
  )
  drawPoly(
    ctx,
    [
      [0, -8 + ty],
      [5.6, -3 + ty],
      [3.6, 4.2 + ty],
      [0, 6.2 + ty],
      [-3.6, 4.2 + ty],
      [-5.6, -3 + ty],
    ],
    lavaMid,
    null
  )
  drawPoly(
    ctx,
    [
      [0, -4.5 + ty],
      [2.8, -1 + ty],
      [1.8, 2.6 + ty],
      [-1.8, 2.6 + ty],
      [-2.8, -1 + ty],
    ],
    lavaCore,
    null
  )
  // Molten lava rib-cracks splitting across chest plates
  ctx.strokeStyle = lavaMid
  ctx.lineWidth = 1.9
  ctx.beginPath()
  ctx.moveTo(-7, -4 + ty); ctx.lineTo(-16, -7 + ty)
  ctx.moveTo(7, -4 + ty); ctx.lineTo(16, -7 + ty)
  ctx.moveTo(-5, 3 + ty); ctx.lineTo(-13, 6 + ty)
  ctx.moveTo(5, 3 + ty); ctx.lineTo(13, 6 + ty)
  ctx.stroke()

  // Heavy dark stone belt & burning buckle
  drawPoly(ctx, [[-12, 9 + ty], [12, 9 + ty], [10, 13.5 + ty], [-10, 13.5 + ty]], '#1a0e0c', ink, 1.8)
  ctx.fillStyle = lavaCore
  ctx.fillRect(-3.5, 10 + ty, 7, 2.6)

  // ---- 3. Towering Spiky Boulder Pauldrons + Roaring Shoulder Fire ----
  const swayL = Math.sin(now * 13 + 0.5) * 3.6
  const swayR = Math.cos(now * 13 + 1.2) * 3.6
  drawFlameTongue(ctx, -20, -17 + ty, 8.8, 22 + pulse * 4.5, swayL - 2.5, 0.95)
  drawFlameTongue(ctx, 20, -17 + ty, 8.8, 22 + pulse * 4.5, swayR + 2.5, 0.95)

  // Left giant jagged rock shoulder
  drawPoly(
    ctx,
    [
      [-29, -8 + ty],
      [-27, -21 + ty],
      [-17, -27 + ty],
      [-9, -16 + ty],
      [-14, -5 + ty],
    ],
    stoneHi,
    ink,
    2.4
  )
  // Right giant jagged rock shoulder
  drawPoly(
    ctx,
    [
      [29, -8 + ty],
      [27, -21 + ty],
      [17, -27 + ty],
      [9, -16 + ty],
      [14, -5 + ty],
    ],
    stoneMid,
    ink,
    2.4
  )
  // Glowing lava shoulder fissures
  ctx.strokeStyle = lavaMid
  ctx.lineWidth = 2.1
  ctx.beginPath()
  ctx.moveTo(-25, -15 + ty); ctx.lineTo(-15, -20 + ty)
  ctx.moveTo(25, -15 + ty); ctx.lineTo(15, -20 + ty)
  ctx.stroke()

  // ---- 4. Massive Hanging Rock Forearms & Flame-Wreathed Boulder Fists ----
  const leftArmY = -slamRatio * 7.5 + strideR * 0.45 + ty
  const rightArmY = -slamRatio * 11 + strideL * 0.45 + ty

  // Left arm + blazing magma fist
  drawPoly(ctx, [[-26, -6 + leftArmY], [-17, -4 + leftArmY], [-19, 6 + leftArmY], [-28, 4 + leftArmY]], stoneDark, ink, 2.1)
  // Flame aura wrapping the fist
  drawFlameTongue(ctx, -26, 12 + leftArmY, 10.5, 22 + slamRatio * 7, -4 + swayL * 0.6, 0.92)
  drawFlameTongue(ctx, -21, 13 + leftArmY, 7.5, 16 + slamRatio * 5, swayL * 0.4, 0.85)
  drawPoly(
    ctx,
    [
      [-31, 3 + leftArmY],
      [-18, 3 + leftArmY],
      [-17, 13 + leftArmY],
      [-24, 17 + leftArmY],
      [-32, 12 + leftArmY],
    ],
    stoneMid,
    ink,
    2.3
  )
  ctx.strokeStyle = lavaCore
  ctx.lineWidth = 2.0
  ctx.beginPath()
  ctx.moveTo(-29, 8 + leftArmY); ctx.lineTo(-21, 12 + leftArmY)
  ctx.moveTo(-25, 6 + leftArmY); ctx.lineTo(-20, 8 + leftArmY)
  ctx.stroke()

  // Right arm + blazing magma fist
  drawPoly(ctx, [[17, -4 + rightArmY], [26, -6 + rightArmY], [29, 4 + rightArmY], [19, 6 + rightArmY]], stoneMid, ink, 2.1)
  drawFlameTongue(ctx, 26, 12 + rightArmY, 11, 24 + slamRatio * 8, 4 + swayR * 0.6, 0.95)
  drawFlameTongue(ctx, 21, 13 + rightArmY, 7.8, 17 + slamRatio * 5, swayR * 0.4, 0.88)
  drawPoly(
    ctx,
    [
      [18, 3 + rightArmY],
      [32, 3 + rightArmY],
      [33, 12 + rightArmY],
      [25, 17 + rightArmY],
      [17, 13 + rightArmY],
    ],
    stoneHi,
    ink,
    2.3
  )
  ctx.strokeStyle = lavaCore
  ctx.lineWidth = 2.1
  ctx.beginPath()
  ctx.moveTo(21, 12 + rightArmY); ctx.lineTo(29, 8 + rightArmY)
  ctx.moveTo(20, 8 + rightArmY); ctx.lineTo(26, 6 + rightArmY)
  ctx.stroke()

  // ---- 5. Demonic Horned Head + Roaring Crown Flame + Slanted Burning Eyes ----
  const hy = -19 + ty * 1.1
  drawFlameTongue(ctx, 0, hy - 5, 9.5, (isLord ? 24 : 18) + pulse * 3.5, Math.sin(now * 14) * 3.2, 0.96)

  // Bold swept demonic horns curving outward and hooking upward (classic Warlock Golem profile)
  drawPoly(
    ctx,
    [
      [-7.5, hy - 3],
      [-15, hy - 8],
      [-20, hy - 18],
      [-14, hy - 22],
      [-13, hy - 14],
      [-5.5, hy - 8],
    ],
    isLord ? '#ff9e24' : '#2a1510',
    ink,
    2.0
  )
  drawPoly(
    ctx,
    [
      [7.5, hy - 3],
      [15, hy - 8],
      [20, hy - 18],
      [14, hy - 22],
      [13, hy - 14],
      [5.5, hy - 8],
    ],
    isLord ? '#ff9e24' : '#2a1510',
    ink,
    2.0
  )
  // Glowing fiery tips on both horns
  ctx.fillStyle = lavaCore
  ctx.beginPath()
  ctx.arc(-15.5, hy - 20, 2.3, 0, TAU)
  ctx.arc(15.5, hy - 20, 2.3, 0, TAU)
  ctx.fill()

  // Craggy horned demon skull
  drawPoly(
    ctx,
    [
      [-10.5, hy - 4.5],
      [0, hy - 9.5],
      [10.5, hy - 4.5],
      [9.5, hy + 5.5],
      [0, hy + 9],
      [-9.5, hy + 5.5],
    ],
    stoneDark,
    ink,
    2.4
  )
  drawPoly(ctx, [[-8.8, hy - 4], [0, hy - 7.5], [8.8, hy - 4], [5.5, hy - 0.5], [-5.5, hy - 0.5]], stoneHi, null)

  // Fierce V-slanted burning eyes
  drawPoly(ctx, [[-7.4, hy - 1.2], [-1.8, hy + 0.9], [-2.5, hy + 3.2], [-7.0, hy + 1.5]], lavaMid, null)
  drawPoly(ctx, [[7.4, hy - 1.2], [1.8, hy + 0.9], [2.5, hy + 3.2], [7.0, hy + 1.5]], lavaMid, null)
  ctx.fillStyle = lavaCore
  ctx.beginPath()
  ctx.arc(-4.4, hy + 1.0, 1.5, 0, TAU)
  ctx.arc(4.4, hy + 1.0, 1.5, 0, TAU)
  ctx.fill()

  // Jagged glowing furnace grin/maw
  ctx.strokeStyle = lavaOuter
  ctx.lineWidth = 2.0
  ctx.beginPath()
  ctx.moveTo(-5.4, hy + 4.8)
  ctx.lineTo(-2.2, hy + 6.2)
  ctx.lineTo(0, hy + 4.8)
  ctx.lineTo(2.2, hy + 6.2)
  ctx.lineTo(5.4, hy + 4.8)
  ctx.stroke()

  ctx.restore() // end facing flip

  // ---- 6. Clean HP + Lifetime Dual Bar well ABOVE the crown flame & horns ----
  const barY = isLord ? -58 : -54
  const barW = 40
  const hpRatio = Math.max(0, Math.min(1, s.hp / Math.max(1, s.maxHp)))
  const lifeRatio = Math.max(0, Math.min(1, s.life / Math.max(0.1, s.maxLife || 1)))

  ctx.fillStyle = 'rgba(14, 8, 6, 0.82)'
  ctx.fillRect(-barW / 2 - 1, barY - 1, barW + 2, 8.5)
  ctx.fillStyle = isLord ? '#ff5722' : '#fb712c'
  ctx.fillRect(-barW / 2, barY, barW * hpRatio, 4.2)
  ctx.fillStyle = '#fcd34d'
  ctx.fillRect(-barW / 2, barY + 5, barW * lifeRatio, 2.2)

  ctx.restore()
}

function _renderFrostOrb(ctx, s, now) {
  const pulse = 0.9 + Math.sin(now * 9) * 0.1

  // Ground cold mist shadow
  ctx.fillStyle = 'rgba(12, 74, 110, 0.34)'
  ctx.beginPath()
  ctx.ellipse(0, 15, 19, 7.5, 0, 0, TAU)
  ctx.fill()

  // Frosty glacial back radiance
  const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, 32)
  halo.addColorStop(0, `rgba(186, 230, 253, ${0.65 * pulse})`)
  halo.addColorStop(0.55, `rgba(14, 165, 233, ${0.32 * pulse})`)
  halo.addColorStop(1, 'rgba(14, 165, 233, 0)')
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(0, 0, 32, 0, TAU)
  ctx.fill()

  // Outer counter-rotating 6-blade serrated glacial crystal wheel
  ctx.save()
  ctx.rotate(-now * 4.4)
  for (let i = 0; i < 6; i++) {
    ctx.rotate(TAU / 6)
    drawPoly(ctx, [[12, -3.6], [24.5, 0], [12, 3.6], [15, 0]], '#38bdf8', '#0c4a6e', 1.4)
    drawPoly(ctx, [[13.5, -1.6], [22, 0], [15, 0]], '#f0f9ff', null)
  }
  ctx.restore()

  // Inner fast-spinning 4-point diamond frost star
  ctx.save()
  ctx.rotate(now * 7.2)
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2)
    drawPoly(ctx, [[9, -2.5], [17.5, 0], [9, 2.5]], '#e0f7ff', '#0369a1', 1.0)
  }
  ctx.restore()

  // Core layered frozen sphere
  const orb = ctx.createRadialGradient(-3, -3, 1.5, 0, 0, 13.5)
  orb.addColorStop(0, '#ffffff')
  orb.addColorStop(0.4, '#bae6fd')
  orb.addColorStop(0.78, '#0284c7')
  orb.addColorStop(1, '#0c4a6e')
  ctx.fillStyle = orb
  ctx.strokeStyle = '#0c4a6e'
  ctx.lineWidth = 2.0
  ctx.beginPath()
  ctx.arc(0, 0, 13.5, 0, TAU)
  ctx.fill()
  ctx.stroke()

  // Crisp inner crystalline snowflake heart
  drawSnowflake(ctx, 0, 0, 7.5, now * 2.5, 'rgba(255, 255, 255, 0.92)', 1.3)

  // Whipping orbital frost sparkles
  for (let i = 0; i < 6; i++) {
    const a = now * 5.2 + i * (TAU / 6)
    const r = 21 + Math.sin(now * 8 + i * 2) * 3.5
    ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#bae6fd'
    ctx.beginPath()
    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, i % 2 === 0 ? 2.1 : 1.5, 0, TAU)
    ctx.fill()
  }
}

function _renderStormTotem(ctx, s, now) {
  const pulse = 0.85 + Math.sin(now * 8) * 0.15
  const ink = '#0f172a'
  const bob = Math.sin(now * 5.5) * 2.2

  // Ground drop shadow
  ctx.fillStyle = 'rgba(15, 23, 42, 0.44)'
  ctx.beginPath()
  ctx.ellipse(0, 15, 18, 7.2, 0, 0, TAU)
  ctx.fill()

  // Subtle base storm glow
  const glow = ctx.createRadialGradient(0, -10, 4, 0, -10, 32)
  glow.addColorStop(0, `rgba(56, 189, 248, ${0.38 * pulse})`)
  glow.addColorStop(0.6, `rgba(250, 204, 21, ${0.18 * pulse})`)
  glow.addColorStop(1, 'rgba(56, 189, 248, 0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(0, -10, 32, 0, TAU)
  ctx.fill()

  // Swept Shaman carved thunderbird wings behind totem shoulders
  drawPoly(
    ctx,
    [[-7, -14], [-18, -19], [-24, -12], [-18, -8], [-19, -4], [-8, -6]],
    '#475569',
    ink,
    2.0
  )
  drawPoly(
    ctx,
    [[7, -14], [18, -19], [24, -12], [18, -8], [19, -4], [8, -6]],
    '#334155',
    ink,
    2.0
  )
  // Warm bronze-gold trim on wing tips
  ctx.strokeStyle = '#f59e0b'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(-11, -13); ctx.lineTo(-20, -12)
  ctx.moveTo(11, -13); ctx.lineTo(20, -12)
  ctx.stroke()

  // Heavy carved basalt stone pedestal
  drawPoly(ctx, [[-13, 13], [-10, 6], [10, 6], [13, 13]], '#1e293b', ink, 2.0)

  // Tapered carved dark-slate totem pillar
  drawPoly(ctx, [[-9.5, 7], [-8, -16], [8, -16], [9.5, 7]], '#334155', ink, 2.2)
  drawPoly(ctx, [[1, -15], [7.5, -15], [8.5, 6], [1, 6]], '#1e293b', null)

  // Carved bronze collar bands
  drawPoly(ctx, [[-9.5, -16], [9.5, -16], [8.5, -12.5], [-8.5, -12.5]], '#b45309', ink, 1.5)
  drawPoly(ctx, [[-10, 4], [10, 4], [10.5, 7.5], [-10.5, 7.5]], '#92400e', ink, 1.5)

  // Glowing carved lightning zigzag rune down the front face
  ctx.strokeStyle = '#38bdf8'
  ctx.lineWidth = 3.2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(1.5, -10.5)
  ctx.lineTo(-3, -4)
  ctx.lineTo(2.5, -2.5)
  ctx.lineTo(-2, 3)
  ctx.stroke()
  ctx.strokeStyle = '#fef08a'
  ctx.lineWidth = 1.4
  ctx.stroke()

  // Floating crackling Storm Orb hovering above totem crown
  const oy = -26 + bob
  const orbGlow = ctx.createRadialGradient(0, oy, 1, 0, oy, 15)
  orbGlow.addColorStop(0, 'rgba(255, 255, 255, 0.98)')
  orbGlow.addColorStop(0.45, 'rgba(125, 211, 252, 0.85)')
  orbGlow.addColorStop(0.75, 'rgba(250, 204, 21, 0.45)')
  orbGlow.addColorStop(1, 'rgba(56, 189, 248, 0)')
  ctx.fillStyle = orbGlow
  ctx.beginPath()
  ctx.arc(0, oy, 15, 0, TAU)
  ctx.fill()

  ctx.fillStyle = '#7dd3fc'
  ctx.strokeStyle = '#1e3a8a'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.arc(0, oy, 7.2, 0, TAU)
  ctx.fill()
  ctx.stroke()

  drawElectricStar(ctx, 0, oy, 7.5, pulse, '#ffffff', '#fde047')

  // Tiny orbiting spark motes around floating storm orb
  for (let i = 0; i < 3; i++) {
    const a = now * 6 + (i * TAU) / 3
    ctx.fillStyle = i === 0 ? '#fde047' : '#ffffff'
    ctx.beginPath()
    ctx.arc(Math.cos(a) * 12, oy + Math.sin(a) * 5.5, 1.7, 0, TAU)
    ctx.fill()
  }

  // Clean lifetime bar well above orb
  if (s.maxLife > 0) {
    const ratio = Math.max(0, Math.min(1, s.life / s.maxLife))
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)'
    ctx.fillRect(-16, -44, 32, 4.5)
    ctx.fillStyle = '#fde047'
    ctx.fillRect(-15, -43, 30 * ratio, 2.5)
  }
}

function _renderSkyCore(ctx, s, now) {
  const pulse = 0.88 + Math.sin(now * 10) * 0.12

  // Deep electric-indigo outer corona
  const glow = ctx.createRadialGradient(0, 0, 3, 0, 0, 27)
  glow.addColorStop(0, `rgba(255, 255, 255, ${0.9 * pulse})`)
  glow.addColorStop(0.38, `rgba(125, 211, 252, ${0.65 * pulse})`)
  glow.addColorStop(0.72, `rgba(147, 51, 234, ${0.35 * pulse})`)
  glow.addColorStop(1, 'rgba(76, 29, 149, 0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(0, 0, 27, 0, TAU)
  ctx.fill()

  // Two tilted counter-rotating orthogonal storm rings
  ctx.save()
  ctx.rotate(now * 3.4)
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.92)'
  ctx.lineWidth = 2.1
  ctx.beginPath()
  ctx.ellipse(0, 0, 19, 7.2, 0, 0, TAU)
  ctx.stroke()
  ctx.restore()

  ctx.save()
  ctx.rotate(-now * 2.9 + 1.15)
  ctx.strokeStyle = 'rgba(125, 211, 252, 0.92)'
  ctx.lineWidth = 2.0
  ctx.beginPath()
  ctx.ellipse(0, 0, 19, 7.2, 0, 0, TAU)
  ctx.stroke()
  ctx.restore()

  // Core storm plasma sphere
  const core = ctx.createRadialGradient(-2, -2, 1, 0, 0, 11.5)
  core.addColorStop(0, '#ffffff')
  core.addColorStop(0.48, '#bae6fd')
  core.addColorStop(0.82, '#3b82f6')
  core.addColorStop(1, '#4c1d95')
  ctx.fillStyle = core
  ctx.strokeStyle = '#1e1b4b'
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.arc(0, 0, 11 + Math.sin(now * 9) * 1.1, 0, TAU)
  ctx.fill()
  ctx.stroke()

  // Crackling mini radial sparks + central electric star
  const step = Math.floor(now * 18)
  for (let i = 0; i < 3; i++) {
    const a = step * 1.3 + i * (TAU / 3)
    const pts = buildAnimatedArc(
      Math.cos(a) * 9,
      Math.sin(a) * 9,
      Math.cos(a) * 21,
      Math.sin(a) * 21,
      3.5,
      step + i * 2,
      3
    )
    ctx.strokeStyle = '#fef08a'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y)
    ctx.stroke()
  }
  drawElectricStar(ctx, 0, 0, 8.5, pulse, '#ffffff', '#fde047')
}

function _renderDarkglare(ctx, s, now) {
  const bob = Math.sin(now * 4.8) * 2.8
  const pulse = 0.88 + Math.sin(now * 8.5) * 0.12
  const ink = '#1a0529'

  // Ground floating drop shadow
  ctx.fillStyle = 'rgba(26, 5, 41, 0.36)'
  ctx.beginPath()
  ctx.ellipse(0, 24, 14, 5.5, 0, 0, TAU)
  ctx.fill()

  ctx.save()
  ctx.translate(0, bob)

  // Rotating Warlock arcane rune halo behind the observer eye
  ctx.save()
  ctx.rotate(now * 1.6)
  ctx.strokeStyle = 'rgba(192, 132, 252, 0.62)'
  ctx.lineWidth = 1.6
  ctx.setLineDash([6, 5])
  ctx.beginPath()
  ctx.arc(0, 0, 21, 0, TAU)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()

  // Fel-violet aura radiance
  const aura = ctx.createRadialGradient(0, 0, 5, 0, 0, 24)
  aura.addColorStop(0, `rgba(163, 230, 53, ${0.32 * pulse})`)
  aura.addColorStop(0.55, `rgba(126, 34, 206, ${0.32 * pulse})`)
  aura.addColorStop(1, 'rgba(88, 28, 135, 0)')
  ctx.fillStyle = aura
  ctx.beginPath()
  ctx.arc(0, 0, 24, 0, TAU)
  ctx.fill()

  // 5 writhing dark-violet demonic tentacles dangling beneath the orb
  const roots = [-10, -5, 0, 5, 10]
  ctx.lineCap = 'round'
  for (let i = 0; i < roots.length; i++) {
    const rx = roots[i]
    const len = i === 2 ? 18 : i === 1 || i === 3 ? 16 : 13.5
    const wave = Math.sin(now * 7.5 + i * 1.35) * 5.2
    const cpx = rx + wave * 0.7
    const cpy = 11 + len * 0.45
    const ex = rx * 1.25 - wave * 0.5
    const ey = 10 + len

    ctx.strokeStyle = ink
    ctx.lineWidth = 5.4
    ctx.beginPath()
    ctx.moveTo(rx, 8)
    ctx.quadraticCurveTo(cpx, cpy, ex, ey)
    ctx.stroke()

    ctx.strokeStyle = i % 2 === 0 ? '#581c87' : '#6b21a8'
    ctx.lineWidth = 2.8
    ctx.stroke()

    // Glowing toxic suction tip
    ctx.fillStyle = '#a3e635'
    ctx.beginPath()
    ctx.arc(ex, ey, 1.8, 0, TAU)
    ctx.fill()
  }

  // Swept demonic brow horns crowning the floating eye
  drawPoly(ctx, [[-8, -10], [-16, -15], [-13, -22], [-10, -16], [-4, -13]], '#4c1d95', ink, 1.8)
  drawPoly(ctx, [[8, -10], [16, -15], [13, -22], [10, -16], [4, -13]], '#4c1d95', ink, 1.8)

  // Armored obsidian-violet demonic eyeball body
  const body = ctx.createRadialGradient(-4, -4, 2, 0, 0, 15.5)
  body.addColorStop(0, '#7e22ce')
  body.addColorStop(0.65, '#4c1d95')
  body.addColorStop(1, '#2e1065')
  ctx.fillStyle = body
  ctx.strokeStyle = ink
  ctx.lineWidth = 2.3
  ctx.beginPath()
  ctx.arc(0, 0, 14.8, 0, TAU)
  ctx.fill()
  ctx.stroke()

  // Luminous fel-green demon iris
  const iris = ctx.createRadialGradient(-1.5, -1.5, 1, 0, 0, 8.8)
  iris.addColorStop(0, '#ecfccb')
  iris.addColorStop(0.55, '#a3e635')
  iris.addColorStop(1, '#4d7c0f')
  ctx.fillStyle = iris
  ctx.strokeStyle = ink
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.arc(0, 0, 8.6, 0, TAU)
  ctx.fill()
  ctx.stroke()

  // Piercing black vertical slit pupil
  ctx.fillStyle = '#090710'
  ctx.beginPath()
  ctx.ellipse(0, 0, 2.2, 6.4, 0, 0, TAU)
  ctx.fill()

  // Fierce dark upper-lid ridge for menacing glare
  drawPoly(ctx, [[-11, -5], [0, -2.5], [11, -5], [8, -11], [-8, -11]], '#3b0764', ink, 1.6)

  // Crisp bright eye specular glint
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(-3.2, -1.5, 1.9, 0, TAU)
  ctx.fill()

  ctx.restore()
}

function _renderSummon(ctx, s, now) {
  ctx.save()
  ctx.translate(s.x, s.y)
  if (s.kind === 'infernal') {
    _renderInfernal(ctx, s, now)
  } else if (s.kind === 'frost_orb') {
    _renderFrostOrb(ctx, s, now)
  } else if (s.kind === 'storm_totem') {
    _renderStormTotem(ctx, s, now)
  } else if (s.kind === 'sky_core') {
    _renderSkyCore(ctx, s, now)
  } else if (s.kind === 'darkglare') {
    _renderDarkglare(ctx, s, now)
  }
  ctx.restore()
}

function _renderShot(ctx, s, now) {
  ctx.save()
  ctx.translate(s.x, s.y)
  const ang = Math.atan2(s.vy || 0, s.vx || 1)
  ctx.rotate(ang)

  if (s.kind === 'pyroblast') {
    const flick = Math.sin(now * 26) * 3
    const tail = ctx.createLinearGradient(8, 0, -48, 0)
    tail.addColorStop(0, '#fff4b8')
    tail.addColorStop(0.32, '#ff8c1a')
    tail.addColorStop(0.7, '#e63b0d')
    tail.addColorStop(1, 'rgba(210, 36, 8, 0)')
    ctx.fillStyle = tail
    ctx.beginPath()
    ctx.moveTo(10, -12)
    ctx.quadraticCurveTo(-20, -15 + flick, -48, flick * 0.6)
    ctx.quadraticCurveTo(-20, 15 + flick, 10, 12)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = 'rgba(255, 196, 64, 0.88)'
    ctx.beginPath()
    ctx.moveTo(6, -6)
    ctx.quadraticCurveTo(-12, -8 - flick, -30, -flick * 0.5)
    ctx.quadraticCurveTo(-12, 8 - flick, 6, 6)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = '#ff571a'
    ctx.strokeStyle = '#6e1906'
    ctx.lineWidth = 1.8
    ctx.beginPath()
    ctx.arc(0, 0, 13.5, 0, TAU)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#ffbe3b'
    ctx.beginPath()
    ctx.arc(2.5, 0, 9, 0, TAU)
    ctx.fill()

    ctx.fillStyle = '#fff9d6'
    ctx.beginPath()
    ctx.arc(4.2, 0, 5.2, 0, TAU)
    ctx.fill()
  } else if (s.kind === 'fireball' || s.kind === 'cantrip_fire') {
    const r = s.cantrip ? 6.5 : 8.5
    const flick = Math.sin(now * 24 + s.x * 0.1) * 2
    const tail = ctx.createLinearGradient(r, 0, -r * 3.2, 0)
    tail.addColorStop(0, '#ffd166')
    tail.addColorStop(0.45, '#ff6d1f')
    tail.addColorStop(1, 'rgba(230, 52, 10, 0)')
    ctx.fillStyle = tail
    ctx.beginPath()
    ctx.moveTo(r * 0.5, -r * 0.85)
    ctx.quadraticCurveTo(-r * 1.1, -r * 0.7 + flick, -r * 3.2, flick * 0.5)
    ctx.quadraticCurveTo(-r * 1.1, r * 0.7 + flick, r * 0.5, r * 0.85)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = '#ff6b26'
    ctx.strokeStyle = '#6e1d08'
    ctx.lineWidth = 1.3
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, TAU)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#fef08a'
    ctx.beginPath()
    ctx.arc(2, 0, r * 0.48, 0, TAU)
    ctx.fill()
  } else if (s.kind === 'ice_lance') {
    // Glacial halberd spear with icy slipstream wake & flared crystalline fins
    const wake = ctx.createLinearGradient(10, 0, -44, 0)
    wake.addColorStop(0, 'rgba(224, 247, 255, 0.92)')
    wake.addColorStop(0.4, 'rgba(56, 189, 248, 0.65)')
    wake.addColorStop(1, 'rgba(14, 165, 233, 0)')
    ctx.fillStyle = wake
    ctx.beginPath()
    ctx.moveTo(4, -5.5)
    ctx.lineTo(-44, 0)
    ctx.lineTo(4, 5.5)
    ctx.closePath()
    ctx.fill()

    // Flared barbed ice-crystal side fins
    drawPoly(ctx, [[5, -3], [-6, -9.5], [-12, -5.5], [-4, -1.5]], '#38bdf8', '#0c4a6e', 1.2)
    drawPoly(ctx, [[5, 3], [-6, 9.5], [-12, 5.5], [-4, 1.5]], '#0284c7', '#0c4a6e', 1.2)

    // Sleek faceted crystal spearhead
    drawPoly(ctx, [[22, 0], [3, -5.5], [-13, -3.5], [-8, 0], [-13, 3.5], [3, 5.5]], '#7dd3fc', '#0c4a6e', 1.5)
    drawPoly(ctx, [[20, 0], [3, -4.4], [-9, -1.8], [-5, 0]], '#f0f9ff', null)
    drawPoly(ctx, [[20, 0], [3, 4.4], [-9, 1.8], [-5, 0]], '#0284c7', null)

    // Incandescent white spine ridge
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(-7, 0)
    ctx.lineTo(18, 0)
    ctx.stroke()
  } else if (s.kind === 'frostbolt' || s.kind === 'cantrip_ice') {
    const sc = s.cantrip ? 0.84 : 1.0
    const len = 14.5 * sc
    const w = 5.2 * sc

    // Chilly frost vapor wake
    const wake = ctx.createLinearGradient(len * 0.3, 0, -len * 2.2, 0)
    wake.addColorStop(0, 'rgba(224, 247, 255, 0.88)')
    wake.addColorStop(0.5, 'rgba(56, 189, 248, 0.45)')
    wake.addColorStop(1, 'rgba(14, 165, 233, 0)')
    ctx.fillStyle = wake
    ctx.beginPath()
    ctx.moveTo(0, -w * 0.78)
    ctx.lineTo(-len * 2.2, 0)
    ctx.lineTo(0, w * 0.78)
    ctx.closePath()
    ctx.fill()

    // Faceted crystalline icicle spearhead
    drawPoly(ctx, [[len, 0], [-len * 0.15, -w], [-len * 0.82, -w * 0.48], [-len * 0.45, 0], [-len * 0.82, w * 0.48], [-len * 0.15, w]], '#38bdf8', '#0c4a6e', 1.4)
    drawPoly(ctx, [[len * 0.9, 0], [-len * 0.1, -w * 0.78], [-len * 0.45, 0]], '#f0f9ff', null)

    // Tiny trailing frost flecks
    ctx.fillStyle = '#e0f7ff'
    ctx.beginPath()
    ctx.arc(-len * 1.15, -w * 0.45, 1.3, 0, TAU)
    ctx.arc(-len * 1.55, w * 0.38, 1.1, 0, TAU)
    ctx.fill()
  } else if (s.kind === 'shatter_shard') {
    // Razor crystal diamond splinter
    const wake = ctx.createLinearGradient(4, 0, -16, 0)
    wake.addColorStop(0, 'rgba(186, 230, 253, 0.8)')
    wake.addColorStop(1, 'rgba(56, 189, 248, 0)')
    ctx.fillStyle = wake
    ctx.beginPath()
    ctx.moveTo(0, -2.8)
    ctx.lineTo(-16, 0)
    ctx.lineTo(0, 2.8)
    ctx.closePath()
    ctx.fill()

    drawPoly(ctx, [[10, 0], [-1.5, -3.8], [-7.5, 0], [-1.5, 3.8]], '#7dd3fc', '#0c4a6e', 1.2)
    drawPoly(ctx, [[8.5, 0], [-1, -2.5], [-5, 0]], '#ffffff', null)
  } else if (s.kind === 'agony_bolt' || s.kind === 'cantrip_poison') {
    const sc = s.cantrip ? 0.82 : 1.0
    const tailLen = 30 * sc
    const ph = now * 18 + s.x * 0.08

    // Undulating dual-strand Warlock shadow-violet & fel-lime cursed ribbon tail
    ctx.lineCap = 'round'
    const drawStrand = (colorStart, colorEnd, amp, phaseShift, lw) => {
      const grad = ctx.createLinearGradient(2, 0, -tailLen, 0)
      grad.addColorStop(0, colorStart)
      grad.addColorStop(1, colorEnd)
      ctx.strokeStyle = grad
      ctx.lineWidth = lw * sc
      ctx.beginPath()
      ctx.moveTo(0, 0)
      for (let i = 1; i <= 6; i++) {
        const t = i / 6
        const tx = -tailLen * t
        const ty = Math.sin(ph + t * 5.2 + phaseShift) * amp * sc * (0.4 + t * 0.6)
        ctx.lineTo(tx, ty)
      }
      ctx.stroke()
    }
    drawStrand('rgba(126, 34, 206, 0.92)', 'rgba(88, 28, 135, 0)', 5.2, 0, 5.2)
    drawStrand('rgba(192, 132, 252, 0.85)', 'rgba(192, 132, 252, 0)', 4.8, 0.4, 2.4)
    drawStrand('rgba(163, 230, 53, 0.95)', 'rgba(132, 204, 22, 0)', 4.8, Math.PI, 3.0)

    // Trailing venomous spore droplets
    ctx.fillStyle = '#bef264'
    ctx.strokeStyle = '#2e1065'
    ctx.lineWidth = 0.9
    ctx.beginPath()
    ctx.arc(-14 * sc, Math.sin(ph) * 4.5 * sc, 2.0 * sc, 0, TAU)
    ctx.arc(-22 * sc, -Math.sin(ph + 1) * 4.0 * sc, 1.5 * sc, 0, TAU)
    ctx.fill()
    ctx.stroke()

    // Wicked barbed shadow-fel arrowhead (high contrast against green grass!)
    drawPoly(
      ctx,
      [[12 * sc, 0], [1 * sc, -6.4 * sc], [-8 * sc, -4.6 * sc], [-3.5 * sc, 0], [-8 * sc, 4.6 * sc], [1 * sc, 6.4 * sc]],
      '#581c87',
      '#1e0a36',
      1.6
    )
    drawPoly(
      ctx,
      [[10.5 * sc, 0], [1.5 * sc, -4.4 * sc], [-4.5 * sc, 0], [1.5 * sc, 4.4 * sc]],
      '#a3e635',
      null
    )
    ctx.fillStyle = '#ecfccb'
    ctx.beginPath()
    ctx.arc(3.2 * sc, 0, 2.4 * sc, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

function _renderEffect(ctx, fx, now) {
  const ratio = Math.max(0, Math.min(1, fx.life / Math.max(0.05, fx.maxLife || 0.3)))
  const progress = 1 - ratio
  ctx.save()

  if (fx.kind === 'ring') {
    const r = (fx.r || 0) + ((fx.maxR || 80) - (fx.r || 0)) * progress
    ctx.strokeStyle = spellColorAlpha(fx.color || '#ffffff', ratio * (fx.alpha ?? 0.9))
    ctx.lineWidth = Math.max(1, (fx.lineWidth || 3) * ratio)
    ctx.beginPath()
    ctx.arc(fx.x, fx.y, Math.max(1, r), 0, TAU)
    ctx.stroke()
  } else if (fx.kind === 'bolt' && fx.pts?.length >= 2) {
    drawLightningPolyline(ctx, fx.pts, {
      overloaded: !!fx.overloaded,
      color: fx.color || '#fde047',
      glow: fx.glow || (fx.overloaded ? '#c084fc' : '#facc15'),
      width: fx.width || (fx.overloaded ? 3.8 : 2.5),
      ratio,
      now,
    })
  } else if (fx.kind === 'maelstrom_vortex') {
    // Dedicated Maelstrom Vortex: inward-spiraling violet-gold lightning cyclone + central thunder pillar!
    const rad = fx.radius || 85
    const seed = fx.seed || (fx.x * 0.02 + fx.y * 0.03)
    const spin = now * 9.5 + progress * 4.5

    ctx.save()
    ctx.translate(fx.x, fx.y)

    // Swirling dark-violet & sky-blue storm floor
    const floor = ctx.createRadialGradient(0, 0, rad * 0.08, 0, 0, rad)
    floor.addColorStop(0, `rgba(250, 204, 21, ${0.46 * ratio})`)
    floor.addColorStop(0.35, `rgba(126, 34, 206, ${0.4 * ratio})`)
    floor.addColorStop(0.76, `rgba(56, 189, 248, ${0.22 * ratio})`)
    floor.addColorStop(1, 'rgba(30, 58, 138, 0)')
    ctx.fillStyle = floor
    ctx.beginPath()
    ctx.arc(0, 0, rad * (0.88 + progress * 0.22), 0, TAU)
    ctx.fill()

    // 3 sweeping translucent electromagnetic cyclone vortex ribbons
    ctx.lineCap = 'round'
    for (let v = 0; v < 3; v++) {
      const startA = seed + spin * 1.15 + (v * TAU) / 3
      ctx.beginPath()
      for (let k = 0; k <= 14; k++) {
        const u = k / 14
        const rr = rad * (0.94 - u * 0.78) * (1.02 - progress * 0.14)
        const aa = startA + u * 2.55
        const vx = Math.cos(aa) * rr
        const vy = Math.sin(aa) * rr
        if (k === 0) ctx.moveTo(vx, vy)
        else ctx.lineTo(vx, vy)
      }
      ctx.strokeStyle = `rgba(56, 189, 248, ${0.38 * ratio})`
      ctx.lineWidth = 9.5 * ratio + 1.5
      ctx.stroke()
    }

    // Crackling jagged 28-vertex outer storm cyclone perimeter
    const rimR = rad * (0.96 - progress * 0.12)
    const verts = 28
    const step = Math.floor(now * 22)
    ctx.beginPath()
    for (let i = 0; i <= verts; i++) {
      const idx = i % verts
      const a = idx * (TAU / verts) - spin * 0.35
      const h = Math.sin(idx * 15.7 + step * 5.3 + seed) * 5.2
      const rx = Math.cos(a) * (rimR + h)
      const ry = Math.sin(a) * (rimR + h)
      if (i === 0) ctx.moveTo(rx, ry)
      else ctx.lineTo(rx, ry)
    }
    ctx.strokeStyle = `rgba(126, 34, 206, ${0.72 * ratio})`
    ctx.lineWidth = 5.4 * ratio + 1
    ctx.lineJoin = 'round'
    ctx.stroke()
    ctx.strokeStyle = `rgba(253, 224, 71, ${0.9 * ratio})`
    ctx.lineWidth = 2.0 * ratio + 0.5
    ctx.stroke()
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * ratio})`
    ctx.lineWidth = 0.85 * ratio
    ctx.stroke()

    // 6 tightly-coiled high-frequency crackling spiral lightning tendrils sucked into the eye
    for (let arm = 0; arm < 6; arm++) {
      const baseA = seed + spin + (arm * TAU) / 6
      const pts = []
      const steps = 10
      for (let k = 0; k <= steps; k++) {
        const u = k / steps
        const rr = rad * (0.96 - u * 0.88) * (1.02 - progress * 0.16)
        const aa = baseA + u * 2.4
        const jag = k > 0 && k < steps ? Math.sin(k * 6.7 + arm * 3.1 + step * 2.3) * 5.6 * (1 - u * 0.45) : 0
        pts.push({ x: Math.cos(aa) * (rr + jag), y: Math.sin(aa) * (rr + jag) })
      }
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y)

      ctx.strokeStyle = arm % 2 === 0 ? `rgba(147, 51, 234, ${0.72 * ratio})` : `rgba(37, 99, 235, ${0.65 * ratio})`
      ctx.lineWidth = (arm % 2 === 0 ? 5.8 : 4.4) * ratio + 0.8
      ctx.stroke()
      ctx.strokeStyle = arm % 2 === 0 ? `rgba(253, 224, 71, ${0.92 * ratio})` : `rgba(125, 211, 252, ${0.9 * ratio})`
      ctx.lineWidth = 2.2 * ratio + 0.5
      ctx.stroke()
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.96 * ratio})`
      ctx.lineWidth = 1.0 * ratio + 0.25
      ctx.stroke()
    }

    // Roaring central overloaded thunder pillar slamming straight into the cyclone eye
    const pillarPts = [
      { x: Math.sin(seed) * 14, y: -235 },
      { x: -13, y: -165 },
      { x: 11, y: -102 },
      { x: -8, y: -48 },
      { x: 0, y: 0 },
    ]
    drawLightningPolyline(ctx, pillarPts, {
      overloaded: true,
      color: '#fde047',
      glow: '#c084fc',
      width: 5.2,
      ratio,
      now,
    })

    // Blazing vortex eye flare + orbiting sparks
    drawElectricStar(ctx, 0, 0, 22 * ratio + 5, ratio, '#ffffff', '#fde047')
    for (let i = 0; i < 6; i++) {
      const a = seed * 2 + spin * 1.4 + (i * TAU) / 6
      const d = rad * (0.28 + progress * 0.65)
      ctx.fillStyle = i % 2 === 0 ? `rgba(255, 255, 255, ${ratio})` : `rgba(253, 224, 71, ${ratio})`
      ctx.beginPath()
      ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 2.4 * ratio + 0.8, 0, TAU)
      ctx.fill()
    }
    ctx.restore()
  } else if (fx.kind === 'sky_bolt') {
    const rad = fx.radius || 46
    const isOver = !!fx.overloaded
    const seed = fx.seed || (fx.x * 0.017 + fx.y * 0.023)

    // Flashing dark storm cloud silhouette aloft
    const cy = fx.y - 235
    ctx.save()
    ctx.translate(fx.x, cy)
    ctx.fillStyle = isOver ? `rgba(59, 7, 100, ${0.74 * ratio})` : `rgba(30, 41, 59, ${0.72 * ratio})`
    ctx.beginPath()
    ctx.arc(-18, 2, 16, 0, TAU)
    ctx.arc(0, -5, 21, 0, TAU)
    ctx.arc(19, 2, 15, 0, TAU)
    ctx.fill()

    const flash = ctx.createRadialGradient(0, 4, 2, 0, 4, 24)
    flash.addColorStop(0, isOver ? `rgba(240, 171, 252, ${0.9 * ratio})` : `rgba(186, 230, 253, ${0.88 * ratio})`)
    flash.addColorStop(1, 'rgba(56, 189, 248, 0)')
    ctx.fillStyle = flash
    ctx.beginPath()
    ctx.arc(0, 4, 24, 0, TAU)
    ctx.fill()
    ctx.restore()

    // Main multi-segment sky lightning shaft
    const j1 = Math.sin(seed * 3.1) * 14
    const j2 = Math.cos(seed * 5.7) * 12
    const j3 = Math.sin(seed * 7.3) * 9
    const mainPts = [
      { x: fx.x + j1 * 0.4, y: fx.y - 232 },
      { x: fx.x + j1, y: fx.y - 168 },
      { x: fx.x - j2, y: fx.y - 108 },
      { x: fx.x + j3, y: fx.y - 52 },
      { x: fx.x, y: fx.y },
    ]
    drawLightningPolyline(ctx, mainPts, {
      overloaded: isOver,
      color: isOver ? '#fef08a' : (fx.color || '#7dd3fc'),
      glow: isOver ? '#c084fc' : '#38bdf8',
      width: isOver ? 4.8 : 3.4,
      ratio,
      now,
    })

    // 2 dramatic mid-air side lightning branches
    const branchL = [
      mainPts[1],
      { x: mainPts[1].x - 24, y: mainPts[1].y + 26 },
      { x: mainPts[1].x - 40, y: mainPts[1].y + 58 },
    ]
    const branchR = [
      mainPts[2],
      { x: mainPts[2].x + 22, y: mainPts[2].y + 24 },
      { x: mainPts[2].x + 36, y: mainPts[2].y + 46 },
    ]
    for (const bPts of [branchL, branchR]) {
      ctx.beginPath()
      ctx.moveTo(bPts[0].x, bPts[0].y)
      ctx.lineTo(bPts[1].x, bPts[1].y)
      ctx.lineTo(bPts[2].x, bPts[2].y)
      ctx.strokeStyle = isOver ? `rgba(192, 132, 252, ${0.72 * ratio})` : `rgba(56, 189, 248, ${0.72 * ratio})`
      ctx.lineWidth = 3.2 * ratio
      ctx.lineCap = 'round'
      ctx.stroke()
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * ratio})`
      ctx.lineWidth = 1.2 * ratio
      ctx.stroke()
    }

    // Ground thunder-impact scorch, radial electric cracks & dual shockwave ring
    const curR = rad * (0.72 + progress * 0.38)
    const gImpact = ctx.createRadialGradient(fx.x, fx.y, 2, fx.x, fx.y, curR)
    gImpact.addColorStop(0, isOver ? `rgba(240, 171, 252, ${0.46 * ratio})` : `rgba(186, 230, 253, ${0.45 * ratio})`)
    gImpact.addColorStop(0.55, isOver ? `rgba(126, 34, 206, ${0.22 * ratio})` : `rgba(37, 99, 235, ${0.2 * ratio})`)
    gImpact.addColorStop(1, 'rgba(30, 64, 175, 0)')
    ctx.fillStyle = gImpact
    ctx.beginPath()
    ctx.arc(fx.x, fx.y, curR, 0, TAU)
    ctx.fill()

    // 6 radial ground crackling lightning cracks
    for (let i = 0; i < 6; i++) {
      const a = seed + (i * TAU) / 6
      const d = curR * (0.58 + (i % 2) * 0.24)
      const mx = fx.x + Math.cos(a + 0.14) * d * 0.55
      const my = fx.y + Math.sin(a + 0.14) * d * 0.55
      ctx.strokeStyle = isOver ? `rgba(253, 224, 71, ${0.85 * ratio})` : `rgba(125, 211, 252, ${0.82 * ratio})`
      ctx.lineWidth = 1.8 * ratio + 0.4
      ctx.beginPath()
      ctx.moveTo(fx.x, fx.y)
      ctx.lineTo(mx, my)
      ctx.lineTo(fx.x + Math.cos(a) * d, fx.y + Math.sin(a) * d)
      ctx.stroke()
    }

    ctx.strokeStyle = isOver ? `rgba(147, 51, 234, ${0.72 * ratio})` : `rgba(37, 99, 235, ${0.65 * ratio})`
    ctx.lineWidth = 4.2 * ratio
    ctx.beginPath()
    ctx.arc(fx.x, fx.y, curR, 0, TAU)
    ctx.stroke()

    ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * ratio})`
    ctx.lineWidth = 1.8 * ratio
    ctx.beginPath()
    ctx.arc(fx.x, fx.y, curR * 0.88, 0, TAU)
    ctx.stroke()

    drawElectricStar(ctx, fx.x, fx.y, isOver ? 17 : 13, ratio, '#ffffff', isOver ? '#fde047' : '#7dd3fc')
  } else if (fx.kind === 'meteor_slam') {
    const rad = fx.radius || 58
    const isBig = !!fx.big
    const seed = fx.seed || (fx.x * 0.03 + fx.y * 0.05)

    if (progress < 0.34) {
      // Stage 1: Blazing diagonal fire meteor streaking down from the sky!
      const u = progress / 0.34
      const ease = u * u
      const dx = isBig ? 128 : 92
      const dy = isBig ? -275 : -215
      const hx = fx.x + dx * (1 - ease)
      const hy = fx.y + dy * (1 - ease)
      const tx = hx + dx * 0.44
      const ty = hy + dy * 0.44

      // Growing burning ground landing ring
      ctx.fillStyle = `rgba(255, 112, 24, ${0.22 * u})`
      ctx.beginPath()
      ctx.arc(fx.x, fx.y, rad * (0.35 + u * 0.55), 0, TAU)
      ctx.fill()
      ctx.strokeStyle = `rgba(255, 190, 72, ${0.78 * u})`
      ctx.lineWidth = 2
      ctx.stroke()

      // Thick roaring flame wake behind meteor
      const outerGrad = ctx.createLinearGradient(hx, hy, tx, ty)
      outerGrad.addColorStop(0, 'rgba(255, 128, 28, 0.95)')
      outerGrad.addColorStop(0.5, 'rgba(226, 46, 8, 0.68)')
      outerGrad.addColorStop(1, 'rgba(180, 24, 4, 0)')
      ctx.strokeStyle = outerGrad
      ctx.lineWidth = isBig ? 26 : 15
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(hx, hy)
      ctx.lineTo(tx, ty)
      ctx.stroke()

      const coreGrad = ctx.createLinearGradient(hx, hy, hx + dx * 0.22, hy + dy * 0.22)
      coreGrad.addColorStop(0, 'rgba(255, 252, 212, 0.98)')
      coreGrad.addColorStop(0.65, 'rgba(255, 186, 46, 0.85)')
      coreGrad.addColorStop(1, 'rgba(255, 108, 20, 0)')
      ctx.strokeStyle = coreGrad
      ctx.lineWidth = isBig ? 12 : 6.5
      ctx.beginPath()
      ctx.moveTo(hx, hy)
      ctx.lineTo(hx + dx * 0.22, hy + dy * 0.22)
      ctx.stroke()

      // Blazing radiant fireball meteor head (Infernal boulder keeps burning molten-rock halo, rain is pure fire!)
      const headR = isBig ? 17 : 10
      const hGlow = ctx.createRadialGradient(hx, hy, 2, hx, hy, headR * 1.8)
      hGlow.addColorStop(0, 'rgba(255, 252, 206, 0.98)')
      hGlow.addColorStop(0.42, 'rgba(255, 148, 32, 0.92)')
      hGlow.addColorStop(0.8, 'rgba(224, 46, 8, 0.55)')
      hGlow.addColorStop(1, 'rgba(224, 46, 8, 0)')
      ctx.fillStyle = hGlow
      ctx.beginPath()
      ctx.arc(hx, hy, headR * 1.8, 0, TAU)
      ctx.fill()

      ctx.fillStyle = isBig ? '#ff6a1a' : '#ff8c1a'
      ctx.beginPath()
      ctx.arc(hx, hy, headR, 0, TAU)
      ctx.fill()
      ctx.fillStyle = '#fff8c8'
      ctx.beginPath()
      ctx.arc(hx - 1.5, hy + 1.5, headR * 0.52, 0, TAU)
      ctx.fill()
    } else {
      // Stage 2: Fiery jagged flame-blossom burst + scorched crater + roaring flames + flying sparks
      const b = (progress - 0.34) / 0.66
      const inv = 1 - b
      const curR = rad * (0.42 + b * 0.68)

      // Warm scorched crater beneath the fire burst
      ctx.fillStyle = `rgba(62, 18, 6, ${0.34 * inv})`
      ctx.beginPath()
      ctx.arc(fx.x, fx.y, rad * 0.65, 0, TAU)
      ctx.fill()

      const spikes = isBig ? 14 : 10
      ctx.save()
      ctx.translate(fx.x, fx.y)
      ctx.fillStyle = `rgba(235, 58, 12, ${0.76 * inv})`
      ctx.beginPath()
      for (let i = 0; i < spikes * 2; i++) {
        const a = seed + (i * Math.PI) / spikes
        const rr = i % 2 === 0 ? curR : curR * 0.55
        const px = Math.cos(a) * rr
        const py = Math.sin(a) * rr
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.fill()

      ctx.fillStyle = `rgba(255, 188, 48, ${0.86 * inv})`
      ctx.beginPath()
      for (let i = 0; i < spikes * 2; i++) {
        const a = seed + 0.16 + (i * Math.PI) / spikes
        const rr = (i % 2 === 0 ? curR : curR * 0.52) * 0.68
        const px = Math.cos(a) * rr
        const py = Math.sin(a) * rr
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.fill()

      if (b < 0.45) {
        const fA = 1 - b / 0.45
        ctx.fillStyle = `rgba(255, 252, 214, ${0.92 * fA})`
        ctx.beginPath()
        ctx.arc(0, 0, curR * 0.36, 0, TAU)
        ctx.fill()
      }

      const petals = isBig ? 5 : 3
      for (let i = 0; i < petals; i++) {
        const a = seed + (i * TAU) / petals
        const d = curR * (0.28 + b * 0.36)
        drawFlameTongue(ctx, Math.cos(a) * d, Math.sin(a) * d + 4, (isBig ? 11 : 7.5) * inv + 2, (isBig ? 34 : 22) * inv + 6, Math.sin(now * 16 + i) * 3, inv)
      }
      for (let i = 0; i < 8; i++) {
        const a = seed * 1.7 + (i * TAU) / 8
        const d = rad * (0.22 + b * 1.0)
        ctx.fillStyle = i % 2 === 0 ? `rgba(255, 244, 156, ${inv})` : `rgba(255, 118, 28, ${inv})`
        ctx.beginPath()
        ctx.arc(Math.cos(a) * d, Math.sin(a) * d - b * 16, 2.6 * inv + 1, 0, TAU)
        ctx.fill()
      }
      ctx.restore()
    }
  } else if (fx.kind === 'comet_slam') {
    const rad = fx.radius || 76
    const seed = fx.seed || (fx.x * 0.029 + fx.y * 0.043)

    if (progress < 0.34) {
      // Stage 1: Blazing diagonal glacial ice-comet streaking from the sky
      const u = progress / 0.34
      const ease = u * u
      const dx = 94
      const dy = -225
      const hx = fx.x + dx * (1 - ease)
      const hy = fx.y + dy * (1 - ease)
      const tx = hx + dx * 0.42
      const ty = hy + dy * 0.42

      // Growing icy frost target ring on ground
      ctx.fillStyle = `rgba(56, 189, 248, ${0.2 * u})`
      ctx.beginPath()
      ctx.arc(fx.x, fx.y, rad * (0.35 + u * 0.52), 0, TAU)
      ctx.fill()
      ctx.strokeStyle = `rgba(224, 247, 255, ${0.82 * u})`
      ctx.lineWidth = 2
      ctx.stroke()

      // Wide deep-cobalt to cyan comet trail
      const outer = ctx.createLinearGradient(hx, hy, tx, ty)
      outer.addColorStop(0, 'rgba(56, 189, 248, 0.95)')
      outer.addColorStop(0.5, 'rgba(2, 132, 199, 0.65)')
      outer.addColorStop(1, 'rgba(12, 74, 110, 0)')
      ctx.strokeStyle = outer
      ctx.lineWidth = 17
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(hx, hy)
      ctx.lineTo(tx, ty)
      ctx.stroke()

      // Crisp incandescent white-ice inner streak
      const inner = ctx.createLinearGradient(hx, hy, hx + dx * 0.22, hy + dy * 0.22)
      inner.addColorStop(0, 'rgba(255, 255, 255, 0.98)')
      inner.addColorStop(0.6, 'rgba(186, 230, 253, 0.85)')
      inner.addColorStop(1, 'rgba(125, 211, 252, 0)')
      ctx.strokeStyle = inner
      ctx.lineWidth = 7
      ctx.beginPath()
      ctx.moveTo(hx, hy)
      ctx.lineTo(hx + dx * 0.22, hy + dy * 0.22)
      ctx.stroke()

      // Faceted glacial diamond comet head
      const fallAng = Math.atan2(-dy, -dx)
      ctx.save()
      ctx.translate(hx, hy)
      ctx.rotate(fallAng)
      drawPoly(ctx, [[15, 0], [0, -9.5], [-13, 0], [0, 9.5]], '#7dd3fc', '#0c4a6e', 1.8)
      drawPoly(ctx, [[12, 0], [0, -5.8], [-8, 0], [0, 5.8]], '#f0f9ff', null)
      ctx.restore()
    } else {
      // Stage 2: Exploding asymmetric glacier crystal impact + icy fracture cracks + tumbling ice chunks!
      const b = (progress - 0.34) / 0.66
      const inv = 1 - b
      const curR = rad * (0.48 + b * 0.58)

      ctx.save()
      ctx.translate(fx.x, fx.y)

      // Deep frost ground crater + freezing mist cloud
      const crater = ctx.createRadialGradient(0, 0, 4, 0, 0, curR * 1.08)
      crater.addColorStop(0, `rgba(240, 249, 255, ${0.65 * inv})`)
      crater.addColorStop(0.45, `rgba(56, 189, 248, ${0.42 * inv})`)
      crater.addColorStop(0.8, `rgba(2, 132, 199, ${0.22 * inv})`)
      crater.addColorStop(1, 'rgba(12, 74, 110, 0)')
      ctx.fillStyle = crater
      ctx.beginPath()
      ctx.arc(0, 0, curR * 1.08, 0, TAU)
      ctx.fill()

      // 8 radiating glacial ice-fracture cracks on the ground
      ctx.strokeStyle = `rgba(224, 247, 255, ${0.78 * inv})`
      ctx.lineWidth = 1.8 * inv + 0.4
      for (let i = 0; i < 8; i++) {
        const a = seed + i * (TAU / 8) + Math.sin(i * 2.7) * 0.18
        const len = curR * (0.78 + ((i * 37) % 10) * 0.032)
        const mx = Math.cos(a + 0.12) * len * 0.52
        const my = Math.sin(a + 0.12) * len * 0.52
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(mx, my)
        ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len)
        ctx.stroke()
      }

      // Asymmetric erupting faceted glacial crystal spires around the impact center
      const spireCount = 9
      for (let i = 0; i < spireCount; i++) {
        const a = seed + (i * TAU) / spireCount + Math.sin(i * 4.1) * 0.16
        const len = curR * (0.58 + ((i * 29) % 10) * 0.048)
        const hw = (5.5 + (i % 3) * 2.4) * inv + 1.5
        ctx.save()
        ctx.rotate(a)
        drawPoly(
          ctx,
          [[len, 0], [len * 0.42, -hw], [0, -hw * 0.45], [0, hw * 0.45], [len * 0.42, hw]],
          i % 2 === 0 ? `rgba(56, 189, 248, ${0.86 * inv})` : `rgba(2, 132, 199, ${0.84 * inv})`,
          `rgba(12, 74, 110, ${0.72 * inv})`,
          1.3
        )
        drawPoly(ctx, [[len * 0.94, 0], [len * 0.4, -hw * 0.85], [0, 0]], `rgba(240, 249, 255, ${0.9 * inv})`, null)
        ctx.restore()
      }

      // Central flash & crisp frost snowflake glint
      if (b < 0.55) {
        const fA = 1 - b / 0.55
        ctx.fillStyle = `rgba(255, 255, 255, ${0.92 * fA})`
        ctx.beginPath()
        ctx.arc(0, 0, curR * 0.28, 0, TAU)
        ctx.fill()
      }
      drawSnowflake(ctx, 0, 0, curR * 0.46, seed + b * 1.2, `rgba(255, 255, 255, ${0.92 * inv})`, 1.8 * inv + 0.4)

      // 8 tumbling faceted ice chunks flying outward
      for (let i = 0; i < 8; i++) {
        const a = seed * 1.5 + (i * TAU) / 8 + 0.25
        const d = rad * (0.36 + b * (0.82 + (i % 3) * 0.14))
        ctx.save()
        ctx.translate(Math.cos(a) * d, Math.sin(a) * d - b * 16)
        ctx.rotate(a + b * 3.5)
        drawPoly(ctx, [[7.5 * inv + 2, 0], [1, -3.5 * inv - 1], [-5.5 * inv - 1, 0.8], [0, 3.5 * inv + 1]], '#e0f7ff', '#0c4a6e', 1.1)
        ctx.restore()
      }

      ctx.restore()
    }
  } else if (fx.kind === 'glacial_spike') {
    const dx = fx.x2 - fx.x1
    const dy = fx.y2 - fx.y1
    const dist = Math.hypot(dx, dy) || 1
    const ang = Math.atan2(dy, dx)
    const halfW = (13.5 * ratio + 2.5)

    ctx.save()
    ctx.translate(fx.x1, fx.y1)
    ctx.rotate(ang)

    // Wide icy frost-mist aura along the lance trajectory
    const mist = ctx.createLinearGradient(0, 0, dist, 0)
    mist.addColorStop(0, `rgba(14, 165, 233, ${0.42 * ratio})`)
    mist.addColorStop(0.75, `rgba(56, 189, 248, ${0.52 * ratio})`)
    mist.addColorStop(1, `rgba(224, 247, 255, ${0.2 * ratio})`)
    ctx.strokeStyle = mist
    ctx.lineWidth = halfW * 2.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(dist, 0)
    ctx.stroke()

    // Colossal faceted glacial spear polygon (upper icy-white facet + lower deep-sapphire facet)
    const lancePts = [
      [0, 0],
      [24, -halfW * 0.78],
      [dist * 0.72, -halfW * 0.56],
      [dist, 0],
      [dist * 0.72, halfW * 0.56],
      [24, halfW * 0.78],
    ]
    drawPoly(ctx, lancePts, `rgba(56, 189, 248, ${0.9 * ratio})`, `rgba(12, 74, 110, ${0.88 * ratio})`, 2.0)
    drawPoly(
      ctx,
      [[0, 0], [24, -halfW * 0.68], [dist * 0.72, -halfW * 0.45], [dist, 0]],
      `rgba(240, 249, 255, ${0.92 * ratio})`,
      null
    )
    drawPoly(
      ctx,
      [[0, 0], [24, halfW * 0.68], [dist * 0.72, halfW * 0.45], [dist, 0]],
      `rgba(2, 132, 199, ${0.82 * ratio})`,
      null
    )

    // Crisp incandescent white central spine & diamond crystal glints along shaft
    ctx.strokeStyle = `rgba(255, 255, 255, ${ratio})`
    ctx.lineWidth = Math.max(1.2, 4.2 * ratio)
    ctx.beginPath()
    ctx.moveTo(6, 0)
    ctx.lineTo(dist * 0.96, 0)
    ctx.stroke()

    for (let i = 1; i <= 4; i++) {
      const gx = dist * (i * 0.19)
      const gr = 9 * ratio + 3
      drawPoly(ctx, [[gx, -gr], [gx + 3.5, 0], [gx, gr], [gx - 3.5, 0]], `rgba(255, 255, 255, ${0.88 * ratio})`, null)
    }
    ctx.restore()

    // Dramatic crystalline shatter bloom at primary impact point (fx.tx, fx.ty)
    if (Number.isFinite(fx.tx) && Number.isFinite(fx.ty)) {
      ctx.save()
      ctx.translate(fx.tx, fx.ty)
      for (let i = 0; i < 6; i++) {
        const a = (i * TAU) / 6 + 0.35
        const rOut = (22 + progress * 32)
        ctx.save()
        ctx.rotate(a)
        drawPoly(ctx, [[rOut, 0], [rOut * 0.35, -5 * ratio], [0, 0], [rOut * 0.35, 5 * ratio]], `rgba(186, 230, 253, ${0.9 * ratio})`, `rgba(12, 74, 110, ${0.75 * ratio})`, 1.3)
        ctx.restore()
      }
      drawSnowflake(ctx, 0, 0, 18 + progress * 16, progress * 1.4, `rgba(255, 255, 255, ${0.95 * ratio})`, 2.0 * ratio + 0.5)
      ctx.restore()
    }
  } else if (fx.kind === 'seed_burst') {
    // Organic exploding acid/shadow-fel viscous splatter: billowing fumes + splashing goo tongues + popping toxic bubbles!
    const rad = fx.radius || 75
    const seed = fx.seed || (fx.x * 0.03 + fx.y * 0.04)
    const isViolet = (fx.color || '').toLowerCase() === '#c084fc'
    const curR = rad * (0.38 + progress * 0.68)

    ctx.save()
    ctx.translate(fx.x, fx.y)

    // Billowing shadow-violet & fel-lime corrosive fume cloud
    const cloud = ctx.createRadialGradient(0, 0, 4, 0, 0, curR * 1.05)
    cloud.addColorStop(0, isViolet ? `rgba(240, 171, 252, ${0.62 * ratio})` : `rgba(217, 249, 157, ${0.64 * ratio})`)
    cloud.addColorStop(0.45, isViolet ? `rgba(126, 34, 206, ${0.46 * ratio})` : `rgba(101, 163, 13, ${0.42 * ratio})`)
    cloud.addColorStop(0.8, `rgba(59, 7, 100, ${0.3 * ratio})`)
    cloud.addColorStop(1, 'rgba(46, 16, 101, 0)')
    ctx.fillStyle = cloud
    ctx.beginPath()
    ctx.arc(0, 0, curR * 1.05, 0, TAU)
    ctx.fill()

    // 7 organic stretched viscous acid/shadow splatter tongues fused into one unified splash
    const tongueColor = (i) =>
      isViolet
        ? (i % 2 === 0 ? `rgba(168, 85, 247, ${0.86 * ratio})` : `rgba(126, 34, 206, ${0.84 * ratio})`)
        : (i % 2 === 0 ? `rgba(163, 230, 53, ${0.88 * ratio})` : `rgba(132, 204, 22, ${0.84 * ratio})`)

    // Pass 1: Dark-plum outer silhouette stroke for all tongues + center hub (so center joins cleanly!)
    ctx.fillStyle = `rgba(30, 10, 54, ${0.82 * ratio})`
    ctx.beginPath()
    ctx.arc(0, 0, curR * 0.38 + 2.2, 0, TAU)
    ctx.fill()
    for (let i = 0; i < 7; i++) {
      const a = seed + (i * TAU) / 7 + Math.sin(i * 3.4) * 0.24
      const reach = curR * (0.62 + ((i * 23) % 10) * 0.044)
      const tipR = (5.4 + (i % 3) * 2.4) * ratio + 2.0
      ctx.save()
      ctx.rotate(a)
      ctx.beginPath()
      ctx.moveTo(0, -(tipR + 2.0) * 0.95)
      ctx.quadraticCurveTo(reach * 0.52, -(tipR * 0.42 + 1.8), reach, -(tipR * 0.65 + 2.0))
      ctx.arc(reach, 0, tipR * 0.65 + 2.0, -Math.PI / 2, Math.PI / 2)
      ctx.quadraticCurveTo(reach * 0.52, tipR * 0.42 + 1.8, 0, (tipR + 2.0) * 0.95)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }

    // Pass 2: Vibrant acid-lime / fel-violet fused liquid body & glossy highlights
    for (let i = 0; i < 7; i++) {
      const a = seed + (i * TAU) / 7 + Math.sin(i * 3.4) * 0.24
      const reach = curR * (0.62 + ((i * 23) % 10) * 0.044)
      const tipR = (5.4 + (i % 3) * 2.4) * ratio + 2.0
      ctx.save()
      ctx.rotate(a)
      ctx.fillStyle = tongueColor(i)
      ctx.beginPath()
      ctx.moveTo(0, -tipR * 0.92)
      ctx.quadraticCurveTo(reach * 0.52, -tipR * 0.4, reach, -tipR * 0.65)
      ctx.arc(reach, 0, tipR * 0.65, -Math.PI / 2, Math.PI / 2)
      ctx.quadraticCurveTo(reach * 0.52, tipR * 0.4, 0, tipR * 0.92)
      ctx.closePath()
      ctx.fill()

      ctx.fillStyle = isViolet ? `rgba(245, 208, 254, ${0.72 * ratio})` : `rgba(236, 252, 203, ${0.8 * ratio})`
      ctx.beginPath()
      ctx.ellipse(reach * 0.72, -tipR * 0.14, tipR * 0.44, tipR * 0.2, 0, 0, TAU)
      ctx.fill()
      ctx.restore()
    }

    // Seamless glowing bubbling liquid core unifying the splash center
    const coreGrad = ctx.createRadialGradient(-3, -3, 2, 0, 0, curR * 0.4)
    coreGrad.addColorStop(0, isViolet ? `rgba(250, 232, 255, ${0.95 * ratio})` : `rgba(236, 252, 203, ${0.96 * ratio})`)
    coreGrad.addColorStop(0.55, isViolet ? `rgba(192, 132, 252, ${0.88 * ratio})` : `rgba(163, 230, 53, ${0.9 * ratio})`)
    coreGrad.addColorStop(1, isViolet ? `rgba(126, 34, 206, ${0.82 * ratio})` : `rgba(101, 163, 13, ${0.84 * ratio})`)
    ctx.fillStyle = coreGrad
    ctx.beginPath()
    ctx.arc(0, 0, curR * 0.38, 0, TAU)
    ctx.fill()

    // Popping toxic gas bubbles rising around the splash core
    for (let i = 0; i < 5; i++) {
      const a = seed * 1.9 + (i * TAU) / 5
      const d = curR * (0.28 + progress * 0.42)
      const pr = (4.5 + (i % 3) * 2.2) * ratio + 1.8
      ctx.fillStyle = i % 2 === 0
        ? (isViolet ? `rgba(232, 121, 249, ${0.65 * ratio})` : `rgba(217, 249, 157, ${0.68 * ratio})`)
        : `rgba(88, 28, 135, ${0.62 * ratio})`
      ctx.strokeStyle = `rgba(30, 10, 54, ${0.72 * ratio})`
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(Math.cos(a) * d, Math.sin(a) * d, pr, 0, TAU)
      ctx.fill()
      ctx.stroke()
    }

    // Broken ragged corrosive fume ring (3 sweeping dark-violet & neon arcs)
    ctx.lineCap = 'round'
    for (let i = 0; i < 3; i++) {
      const a0 = seed + (i * TAU) / 3 + progress * 0.8
      ctx.strokeStyle = `rgba(76, 29, 149, ${0.75 * ratio})`
      ctx.lineWidth = 4.2 * ratio + 0.8
      ctx.beginPath()
      ctx.arc(0, 0, curR * 0.98, a0, a0 + 1.35)
      ctx.stroke()

      ctx.strokeStyle = isViolet ? `rgba(232, 121, 249, ${0.9 * ratio})` : `rgba(217, 249, 157, ${0.9 * ratio})`
      ctx.lineWidth = 1.8 * ratio + 0.4
      ctx.beginPath()
      ctx.arc(0, 0, curR * 0.94, a0 + 0.1, a0 + 1.25)
      ctx.stroke()
    }

    // 10 flying dark-outlined acid droplets & popping bubbles spraying outward
    for (let i = 0; i < 10; i++) {
      const a = seed * 1.4 + (i * TAU) / 10 + Math.sin(i * 2.1) * 0.14
      const d = rad * (0.34 + progress * (0.78 + (i % 3) * 0.14))
      const dx = Math.cos(a) * d
      const dy = Math.sin(a) * d - progress * 16
      const dr = (3.4 * ratio + 1.2) * (i % 2 === 0 ? 1.15 : 0.82)
      ctx.fillStyle = i % 3 === 0 ? `rgba(192, 132, 252, ${ratio})` : `rgba(190, 242, 100, ${ratio})`
      ctx.strokeStyle = `rgba(30, 10, 54, ${0.85 * ratio})`
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(dx, dy, dr, 0, TAU)
      ctx.fill()
      ctx.stroke()
    }

    ctx.restore()
  } else if (fx.kind === 'tether') {
    // Organic undulating dual-strand contagion / Darkglare / Ignite tether + racing energy spore beads!
    const dx = fx.x2 - fx.x1
    const dy = fx.y2 - fx.y1
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const baseCol = (fx.color || '#a8e46b').toLowerCase()
    const isFire = baseCol.startsWith('#ff') || baseCol.startsWith('#fb') || baseCol.startsWith('#f9')
    const isViolet = baseCol === '#c084fc' || baseCol === '#d8b4fe'
    const darkCol = isFire ? '#c2410c' : '#4c1d95'
    const mainCol = isFire ? '#ff8a48' : isViolet ? '#c084fc' : '#a3e635'
    const twinCol = isFire ? '#fde047' : isViolet ? '#a3e635' : '#c084fc'
    const lw = Math.max(1.2, (fx.width || 2.4) * (0.55 + ratio * 0.55))
    const phase = now * 16 + fx.x1 * 0.03
    const amp = Math.min(11, Math.max(4.5, len * 0.08))

    const sampleWave = (t, sign) => {
      const env = Math.sin(t * Math.PI)
      const wave = Math.sin(t * TAU * 1.4 - phase + (sign < 0 ? Math.PI : 0)) * amp * env
      return {
        x: fx.x1 + dx * t + nx * wave,
        y: fx.y1 + dy * t + ny * wave,
      }
    }

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // Shadow contrast underlay so green/violet tethers pop crisply on bright grass
    ctx.beginPath()
    for (let i = 0; i <= 12; i++) {
      const pt = sampleWave(i / 12, 1)
      if (i === 0) ctx.moveTo(pt.x, pt.y)
      else ctx.lineTo(pt.x, pt.y)
    }
    ctx.strokeStyle = spellColorAlpha(darkCol, 0.72 * ratio)
    ctx.lineWidth = lw + 3.2
    ctx.stroke()

    ctx.strokeStyle = spellColorAlpha(mainCol, 0.94 * ratio)
    ctx.lineWidth = lw
    ctx.stroke()

    // Intertwined secondary strand
    ctx.beginPath()
    for (let i = 0; i <= 12; i++) {
      const pt = sampleWave(i / 12, -1)
      if (i === 0) ctx.moveTo(pt.x, pt.y)
      else ctx.lineTo(pt.x, pt.y)
    }
    ctx.strokeStyle = spellColorAlpha(twinCol, 0.85 * ratio)
    ctx.lineWidth = Math.max(1, lw * 0.72)
    ctx.stroke()

    // 2 bright glowing contagion spore / energy beads racing from origin -> target
    for (let b = 0; b < 2; b++) {
      const bt = Math.min(1, Math.max(0, progress * 1.15 - b * 0.24))
      if (bt <= 0 || bt >= 1) continue
      const bp = sampleWave(bt, b === 0 ? 1 : -1)
      ctx.fillStyle = b === 0 ? '#ffffff' : mainCol
      ctx.strokeStyle = darkCol
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(bp.x, bp.y, (b === 0 ? 3.8 : 2.9) * ratio + 0.8, 0, TAU)
      ctx.fill()
      ctx.stroke()
    }

    // Small infection splash halo at destination
    ctx.strokeStyle = spellColorAlpha(mainCol, 0.78 * ratio)
    ctx.lineWidth = 1.8 * ratio
    ctx.beginPath()
    ctx.arc(fx.x2, fx.y2, 7 + progress * 12, 0, TAU)
    ctx.stroke()
  }

  ctx.restore()
}
