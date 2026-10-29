// Arena ordinary mage A-style renderer. This is intentionally separate from
// combat code: it receives the existing movement and cast state only.
const TAU = Math.PI * 2
let cachedMode = null

export const ARENA_MAGE_ART_MODES = Object.freeze({ PROCEDURAL: 'a', CACHE: 'cache' })

function readQueryMode() {
  if (typeof globalThis === 'undefined') return ARENA_MAGE_ART_MODES.CACHE
  const forced = globalThis.__SLIME_MAGE_ART_MODE
  if (forced === 'a' || forced === 'cache') return forced
  try {
    const value = new URLSearchParams(globalThis.location?.search || '').get('mageArt')
    if (value === 'a' || value === 'procedural') return ARENA_MAGE_ART_MODES.PROCEDURAL
    if (value === 'cache' || value === 'c') return ARENA_MAGE_ART_MODES.CACHE
  } catch {
    // Headless verification has no location; production defaults to cache.
  }
  return ARENA_MAGE_ART_MODES.CACHE
}

export function getArenaMageArtMode() {
  if (!cachedMode) cachedMode = readQueryMode()
  return cachedMode
}

export function resetArenaMageArtModeForTests() { cachedMode = null }

function polygon(ctx, points, fill, stroke = '#201c32', width = 1.2) {
  ctx.beginPath()
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill()
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke() }
}

function ellipse(ctx, x, y, rx, ry, fill, stroke = null, width = 1) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU)
  ctx.fillStyle = fill; ctx.fill()
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke() }
}

export function drawArenaMageA(ctx, radius, { walkPhase = 0, moving = false, casting = false, hurt = false } = {}) {
  const scale = radius / 13
  const step = moving ? Math.sin(walkPhase * Math.PI * 2) : 0
  const bob = moving ? Math.abs(step) * 0.9 : 0
  const stroke = hurt ? '#fff4d1' : '#201c32'
  const robe = casting ? '#7051a4' : '#554276'
  ctx.save(); ctx.scale(scale, scale); ctx.translate(0, -bob * 0.3)

  // Back robe and hem: a triangular silhouette distinguishes the mage from
  // the knight's armour while retaining the same compact 2.5D footprint.
  polygon(ctx, [[-8, -2], [8, -2], [10, 8], [4, 11], [-5, 10], [-10, 7]], '#322c51', stroke, 1.3)
  polygon(ctx, [[-7, -5], [7, -5], [8, 6], [3, 9], [-6, 8], [-8, 4]], robe, stroke, 1.25)
  polygon(ctx, [[-5, 1], [5, 1], [4, 7], [0, 9], [-5, 6]], '#8669b2', '#342846', 0.8)
  ellipse(ctx, -4.5, 10 + (step > 0 ? 0.5 : 0), 3.5, 1.5, '#29243b', stroke, 0.8)
  ellipse(ctx, 4.5, 10 + (step < 0 ? 0.5 : 0), 3.5, 1.5, '#29243b', stroke, 0.8)

  // Staff remains a separate readable line, with a warm crystal tip.
  ctx.save(); ctx.translate(8, 2); ctx.rotate(casting ? -0.2 : 0.08 + step * 0.03)
  ctx.strokeStyle = '#704b35'; ctx.lineWidth = 2.2
  ctx.beginPath(); ctx.moveTo(0, 9); ctx.lineTo(1, -12); ctx.stroke()
  ellipse(ctx, 1, -14, 2.7, 3.2, casting ? '#ffd36a' : '#b98adf', stroke, 0.9)
  ctx.restore()

  // Hood and shadowed face: a single hood mass keeps the character legible at
  // normal enemy size without borrowing the knight helmet structure.
  polygon(ctx, [[-8, -7], [-4, -14], [3, -16], [9, -9], [7, -1], [0, 3], [-7, 0]], '#47345f', stroke, 1.3)
  polygon(ctx, [[-5.5, -9], [0, -13], [6, -9], [4, -3], [-3, -3]], '#18182a', '#30253f', 0.9)
  ellipse(ctx, -1.8, -8, 1, 1.3, '#d9c8f1')
  ellipse(ctx, 2.1, -8, 1, 1.3, '#d9c8f1')
  polygon(ctx, [[-8, -10], [-3, -18], [5, -20], [10, -12], [6, -10], [0, -14], [-5, -9]], '#6c4b92', stroke, 1.1)

  if (casting) {
    ctx.strokeStyle = '#ffd36a'; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.85
    ctx.beginPath(); ctx.arc(-1, -16, 5, -1.1, 1.2); ctx.stroke()
    ellipse(ctx, -4, -20, 1.5, 1.5, '#fff2a8', null)
  }
  ctx.restore()
}
