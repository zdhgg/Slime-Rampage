// Arena origin-specific geometry. Motion, status layers, footpoint and face
// state inputs stay in Player/SlimeRenderer so future strains can reuse those
// contracts while keeping their own body model and material.
const TAU = Math.PI * 2

const WIDTH = 400
const HEIGHT = 320

let cachedBody = null
let cacheUnavailable = false
let cacheWarningShown = false

function traceBody(ctx) {
  ctx.beginPath()
  ctx.moveTo(101, 246)
  ctx.bezierCurveTo(84, 242, 79, 229, 86, 210)
  ctx.lineTo(98, 180)
  ctx.bezierCurveTo(106, 157, 111, 137, 132, 121)
  ctx.bezierCurveTo(147, 109, 163, 113, 178, 105)
  ctx.bezierCurveTo(192, 97, 198, 83, 209, 84)
  ctx.bezierCurveTo(220, 85, 225, 98, 223, 109)
  ctx.bezierCurveTo(244, 103, 254, 118, 251, 132)
  ctx.bezierCurveTo(270, 143, 280, 163, 284, 184)
  ctx.bezierCurveTo(289, 205, 298, 217, 307, 232)
  ctx.bezierCurveTo(318, 250, 301, 258, 284, 254)
  ctx.bezierCurveTo(270, 250, 261, 253, 250, 260)
  ctx.bezierCurveTo(234, 269, 217, 261, 201, 266)
  ctx.bezierCurveTo(182, 270, 167, 259, 151, 264)
  ctx.bezierCurveTo(130, 269, 119, 256, 101, 256)
  ctx.closePath()
}

function drawBody(ctx) {
  traceBody(ctx)
  const volume = ctx.createRadialGradient(158, 137, 2, 205, 181, 142)
  volume.addColorStop(0, '#e1f1bb')
  volume.addColorStop(.28, '#b9d995')
  volume.addColorStop(.6, '#8db978')
  volume.addColorStop(.84, '#668f65')
  volume.addColorStop(1, '#3f6250')
  ctx.fillStyle = volume
  ctx.fill()
  ctx.strokeStyle = '#304f43'
  ctx.lineWidth = 5
  ctx.lineJoin = 'round'
  ctx.stroke()

  ctx.save()
  traceBody(ctx)
  ctx.clip()

  const belly = ctx.createRadialGradient(202, 214, 4, 202, 220, 112)
  belly.addColorStop(0, 'rgba(226, 243, 183, .45)')
  belly.addColorStop(.55, 'rgba(183, 218, 148, .18)')
  belly.addColorStop(1, 'rgba(107, 154, 98, 0)')
  ctx.fillStyle = belly
  ctx.fillRect(75, 170, 250, 112)

  const lowerShade = ctx.createLinearGradient(0, 207, 0, 272)
  lowerShade.addColorStop(0, 'rgba(30, 64, 49, 0)')
  lowerShade.addColorStop(1, 'rgba(27, 56, 44, .32)')
  ctx.fillStyle = lowerShade
  ctx.fillRect(70, 202, 260, 80)

  // One leaf-like crown mark keeps the original slime recognizable in a crowd.
  ctx.beginPath()
  ctx.moveTo(201, 112)
  ctx.quadraticCurveTo(194, 101, 210, 84)
  ctx.quadraticCurveTo(218, 99, 223, 109)
  ctx.quadraticCurveTo(215, 119, 201, 112)
  ctx.fillStyle = 'rgba(113, 164, 95, .72)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(235, 249, 193, .62)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(204, 111)
  ctx.quadraticCurveTo(209, 100, 216, 93)
  ctx.moveTo(209, 102)
  ctx.quadraticCurveTo(215, 102, 219, 106)
  ctx.strokeStyle = 'rgba(235, 249, 193, .52)'
  ctx.stroke()

  // A restrained set of bubbles sells the translucent gel without painterly noise.
  for (const [x, y, rx, ry] of [[127, 202, 5, 3.5], [263, 190, 5.5, 4], [239, 230, 3.5, 2.5]]) {
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU)
    ctx.fillStyle = 'rgba(229, 249, 198, .12)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(235, 251, 213, .42)'
    ctx.lineWidth = 1.1
    ctx.stroke()
  }

  ctx.beginPath()
  ctx.moveTo(110, 164)
  ctx.bezierCurveTo(121, 134, 143, 117, 169, 115)
  ctx.bezierCurveTo(184, 114, 193, 120, 202, 126)
  ctx.bezierCurveTo(172, 120, 145, 131, 128, 153)
  ctx.quadraticCurveTo(118, 164, 110, 164)
  ctx.closePath()
  const sheen = ctx.createLinearGradient(125, 117, 177, 163)
  sheen.addColorStop(0, 'rgba(255, 255, 229, .68)')
  sheen.addColorStop(1, 'rgba(230, 250, 199, 0)')
  ctx.fillStyle = sheen
  ctx.fill()
  ctx.restore()

  const rim = ctx.createLinearGradient(100, 100, 300, 260)
  rim.addColorStop(0, 'rgba(247, 255, 218, .8)')
  rim.addColorStop(.48, 'rgba(226, 248, 194, .08)')
  rim.addColorStop(1, 'rgba(216, 243, 180, .46)')
  traceBody(ctx)
  ctx.strokeStyle = rim
  ctx.lineWidth = 1.7
  ctx.stroke()
}

function getBodyCache() {
  if (cachedBody || cacheUnavailable) return cachedBody
  try {
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(WIDTH, HEIGHT)
      : typeof document !== 'undefined' ? document.createElement('canvas') : null
    if (!canvas) throw new Error('Offscreen canvas is unavailable')
    canvas.width = WIDTH
    canvas.height = HEIGHT
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D context is unavailable')
    drawBody(ctx)
    cachedBody = canvas
  } catch (error) {
    cacheUnavailable = true
    if (!cacheWarningShown && typeof document !== 'undefined') {
      console.warn('[Arena origin slime] Body cache unavailable; using live vector drawing.', error)
      cacheWarningShown = true
    }
  }
  return cachedBody
}

export function renderArenaOriginBody(ctx, radius) {
  const scale = radius / 100
  const sprite = getBodyCache()
  if (sprite) {
    ctx.drawImage(sprite, -200 * scale, -185 * scale, WIDTH * scale, HEIGHT * scale)
    return
  }
  ctx.save()
  ctx.scale(scale, scale)
  ctx.translate(-200, -185)
  drawBody(ctx)
  ctx.restore()
}
function drawEye(ctx, x, y, mood) {
  if (mood === 'blink' || mood === 'hurt') {
    ctx.beginPath()
    ctx.moveTo(x - 9, y + (mood === 'hurt' ? 2 : 1))
    ctx.quadraticCurveTo(x, y + (mood === 'hurt' ? -3 : 5), x + 9, y + 1)
    ctx.strokeStyle = '#294437'
    ctx.lineWidth = mood === 'hurt' ? 3.4 : 3
    ctx.lineCap = 'round'
    ctx.stroke()
    return
  }
  ctx.beginPath()
  ctx.ellipse(x, y, 9.5, mood === 'lowhp' ? 8.8 : 12.5, 0, 0, TAU)
  ctx.fillStyle = '#203c36'
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(x + 2, y - 3, 3.2, 4, 0, 0, TAU)
  ctx.fillStyle = '#f7ffe9'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x - 2, y + 4, 1.35, 0, TAU)
  ctx.fillStyle = 'rgba(187, 224, 175, .82)'
  ctx.fill()

  if (mood === 'angry' || mood === 'lowhp') {
    ctx.beginPath()
    ctx.moveTo(x - 10, y - 12)
    ctx.lineTo(x + (x < 200 ? -1.5 : 1.5), y - (mood === 'angry' ? 9 : 14))
    ctx.strokeStyle = '#355443'
    ctx.lineWidth = mood === 'angry' ? 3.4 : 2.6
    ctx.lineCap = 'round'
    ctx.stroke()
  } else if (mood === 'devour') {
    ctx.beginPath()
    ctx.moveTo(x - 9, y - 14)
    ctx.quadraticCurveTo(x, y - 19, x + 9, y - 13)
    ctx.strokeStyle = '#477252'
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.stroke()
  }
}

export function renderArenaOriginFace(ctx, radius, mood = 'idle') {
  ctx.save()
  const scale = radius / 100
  ctx.scale(scale, scale)
  ctx.translate(-200, -185)
  drawEye(ctx, 157, 178, mood)
  drawEye(ctx, 231, 178, mood)
  ctx.beginPath()
  if (mood === 'devour') {
    ctx.ellipse(194, 207, 8.5, 10, 0, 0, TAU)
    ctx.fillStyle = '#294639'
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(194, 213, 3.8, 2.2, 0, Math.PI, TAU)
    ctx.fillStyle = '#df9991'
    ctx.fill()
  } else if (mood === 'hurt' || mood === 'lowhp') {
    ctx.moveTo(183, 211)
    ctx.quadraticCurveTo(194, mood === 'hurt' ? 200 : 205, 205, 211)
    ctx.strokeStyle = '#294639'
    ctx.lineWidth = 3.4
    ctx.lineCap = 'round'
    ctx.stroke()
  } else {
    ctx.moveTo(183, 204)
    ctx.quadraticCurveTo(194, mood === 'angry' ? 218 : 216, 205, 204)
    ctx.strokeStyle = mood === 'angry' ? '#294639' : '#355845'
    ctx.lineWidth = mood === 'angry' ? 3.8 : 3.2
    ctx.lineCap = 'round'
    ctx.stroke()
  }
  ctx.restore()
}

function traceSilhouette(ctx) {
  traceBody(ctx)
}

export function paintArenaOriginSilhouette(ctx, radius, { fill, stroke, width = 2 } = {}) {
  ctx.save()
  const scale = radius / 100
  ctx.scale(scale, scale)
  ctx.translate(-200, -185)
  if (fill) {
    ctx.fillStyle = fill
    traceSilhouette(ctx)
    ctx.fill()
  }
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = width / scale
    traceSilhouette(ctx)
    ctx.stroke()
  }
  ctx.restore()
}
