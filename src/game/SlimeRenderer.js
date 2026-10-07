import { SLIME_ART, SLIME_BODIES, SLIME_PALETTES } from './SlimeAppearance.js'

const TAU = Math.PI * 2
const paths = new Map()
const bodies = new Map()
const artId = id => Object.hasOwn(SLIME_ART, id) ? id : 'origin'
const getPath = d => {
  // Non-browser engine simulations use a no-op Canvas context.
  if (typeof Path2D === 'undefined') return null
  if (!paths.has(d)) paths.set(d, new Path2D(d))
  return paths.get(d)
}

function drawLayers(ctx, layers, paints, expression = {}) {
  for (const node of layers) {
    const a = node.attrs
    // The continuous attack jaws take over this mouth while a bite is active.
    if (a.class === 'glutton-mouth' && expression.bite && !expression.bite.recovering) continue
    ctx.save()
    if (a.opacity != null) ctx.globalAlpha *= a.opacity
    if (a['clip-path']) ctx.clip(paints.clip)
    if (a.class === 'slime-eyes' && (expression.blink || expression.hurt)) {
      ctx.translate(194, 180)
      ctx.scale(1, expression.hurt ? .3 : .12)
      ctx.translate(-194, -180)
    }
    if (a.class === 'glutton-mouth') {
      const opening = expression.bite?.mouth
      const gulp = expression.swallowing ? .28 : 0
      ctx.translate(194, 204)
      ctx.scale(opening == null ? 1 + gulp * .3 : 1 + opening * .25,
        opening == null ? 1 + gulp : .32 + opening * 1.25)
      ctx.translate(-194, -204)
    }
    if (node.children) drawLayers(ctx, node.children, paints, expression)
    else {
      let shape
      if (node.tag === 'path') shape = getPath(a.d)
      else {
        ctx.beginPath()
        ctx.ellipse(a.cx, a.cy, a.rx ?? a.r, a.ry ?? a.r, 0, 0, TAU)
      }
      const paint = value => value?.startsWith('@') ? paints[value.slice(1)] : value
      const alpha = ctx.globalAlpha
      if (a.fill && a.fill !== 'none') {
        ctx.globalAlpha = alpha * (a['fill-opacity'] ?? 1)
        const fill = paint(a.fill)
        if (fill?.stops) {
          // SVG objectBoundingBox radial gradients are elliptical. Apply the
          // transform while filling the clipped shape, not while constructing
          // a gradient that would lose that transform when reused later.
          ctx.save()
          if (shape) ctx.clip(shape); else ctx.clip()
          ctx.translate(fill.x, fill.y)
          ctx.scale(fill.rx, fill.ry)
          const g = ctx.createRadialGradient(fill.cx, fill.cy, 0, fill.cx, fill.cy, fill.radius)
          for (const [offset, color] of fill.stops) g.addColorStop(offset, color)
          ctx.fillStyle = g
          ctx.fillRect(-2, -2, 5, 5)
          ctx.restore()
        } else {
          ctx.fillStyle = fill
          if (shape) ctx.fill(shape); else ctx.fill()
        }
      }
      if (a.stroke) {
        ctx.strokeStyle = paint(a.stroke)
        ctx.lineWidth = a['stroke-width'] ?? 1
        ctx.lineCap = a['stroke-linecap'] ?? 'butt'
        ctx.globalAlpha = alpha * (a['stroke-opacity'] ?? 1)
        if (shape) ctx.stroke(shape); else ctx.stroke()
      }
    }
    ctx.restore()
  }
}

function radial(x, y, rx, ry, stops, cx = .5, cy = .5, radius = .5) {
  return { x, y, rx, ry, stops, cx, cy, radius }
}

function bodySprite(id) {
  if (bodies.has(id)) return bodies.get(id)
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(400, 320)
    : typeof document !== 'undefined' ? document.createElement('canvas') : null
  // Pure simulation runners may have neither a DOM nor an offscreen canvas.
  if (!canvas) return null
  canvas.width = 400
  canvas.height = 320
  const ctx = canvas.getContext('2d')
  const look = SLIME_PALETTES[id]
  const bounds = { origin: [79, 103, 239, 163], glutton: [60, 95, 282, 174], ricochet: [81, 77, 237, 189], elemental: [88, 60, 222, 207], shadow: [80, 57, 245, 213], summoner: [79, 94, 240, 176] }[id]
  const [x, y, w, h] = bounds
  const rim = ctx.createLinearGradient(x, y, x + w * .8, y + h)
  rim.addColorStop(0, '#ffffffdb'); rim.addColorStop(.4, look.light + '1a'); rim.addColorStop(1, look.light + 'a6')
  const sheen = ctx.createLinearGradient(111, 120, 177.4, 180)
  sheen.addColorStop(0, '#ffffffa6'); sheen.addColorStop(1, '#ffffff00')
  const paints = {
    body: radial(x, y, w, h, [[0, look.light], [.36, look.mid], [.78, look.dark], [1, look.mid]], .32, .18, .9),
    belly: radial(84, 162, 236, 116, [[0, look.color + 'a6'], [1, look.color + '00']]),
    rim, sheen, clip: getPath(SLIME_BODIES[id]),
  }
  drawLayers(ctx, SLIME_ART[id].body, paints)
  bodies.set(id, canvas)
  return canvas
}

// One portrait unit scale for every strain preserves the wider glutton body.
// The logical collision radius is unchanged; feet sit at about +0.8 radius.
export function renderSlimeBody(ctx, strainId, radius) {
  const scale = radius / 100
  const sprite = bodySprite(artId(strainId))
  if (sprite) ctx.drawImage(sprite, -200 * scale, -185 * scale, 400 * scale, 320 * scale)
}

export function renderSlimeFace(ctx, strainId, radius, expression = {}) {
  ctx.save()
  const scale = radius / 100
  ctx.scale(scale, scale)
  ctx.translate(-200, -185)
  if (expression.bite) ctx.translate(Math.cos(expression.bite.angle) * 8, Math.sin(expression.bite.angle) * 5)
  drawLayers(ctx, SLIME_ART[artId(strainId)].face, {}, expression)
  ctx.restore()
}

export function paintSlimeSilhouette(ctx, strainId, radius, { fill, stroke, width = 2 } = {}) {
  ctx.save()
  const scale = radius / 100
  ctx.scale(scale, scale)
  ctx.translate(-200, -185)
  const shape = getPath(SLIME_BODIES[artId(strainId)])
  if (fill) { ctx.fillStyle = fill; if (shape) ctx.fill(shape); else ctx.fill() }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width / scale; if (shape) ctx.stroke(shape); else ctx.stroke() }
  ctx.restore()
}
