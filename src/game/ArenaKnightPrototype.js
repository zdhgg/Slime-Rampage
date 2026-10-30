// Arena-only art validation prototype.
//
// The prototype is deliberately isolated from enemy behaviour and combat data:
// `?knightArt=a` selects the realtime procedural variant; `?knightArt=cache`
// selects the fixed offscreen-frame cache. All other enemy types keep their
// existing renderer. This file owns only the presentation experiment.

const TAU = Math.PI * 2
let cachedMode = null

export const ARENA_KNIGHT_ART_MODES = Object.freeze({
  PROCEDURAL: 'a',
  CACHE: 'cache',
})

function readQueryMode() {
  if (typeof globalThis === 'undefined') return ARENA_KNIGHT_ART_MODES.CACHE
  const forced = globalThis.__SLIME_KNIGHT_ART_MODE
  if (forced === 'a' || forced === 'cache') return forced
  try {
    const value = new URLSearchParams(globalThis.location?.search || '').get('knightArt')
    if (value === 'cache' || value === 'c') return ARENA_KNIGHT_ART_MODES.CACHE
    if (value === 'a' || value === 'procedural') return ARENA_KNIGHT_ART_MODES.PROCEDURAL
  } catch {
    // Node and hermetic Canvas tests have no location. The prototype defaults
    // to the production cache so Node and browser behavior agree.
  }
  return ARENA_KNIGHT_ART_MODES.CACHE
}

export function getArenaKnightArtMode() {
  if (!cachedMode) cachedMode = readQueryMode()
  return cachedMode
}

// Test/debug hook only; normal gameplay selects the mode once per page load.
export function resetArenaKnightArtModeForTests() {
  cachedMode = null
}

function polygon(ctx, points, fill, stroke = '#1d2630', width = 1.25) {
  ctx.beginPath()
  points.forEach(([x, y], index) => index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y))
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = width
    ctx.stroke()
  }
}

function ellipse(ctx, x, y, rx, ry, fill, stroke = null, width = 1) {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU)
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = width
    ctx.stroke()
  }
}

/**
 * A compact 2.5D knight body for the A comparison branch.
 *
 * The renderer receives the same radius, walk phase and attack state as the
 * production enemy, so movement/attack timing stays untouched. The body uses
 * a small number of colour masses and a stable shield/sword silhouette rather
 * than a detailed portrait.
 */
export function drawArenaKnightA(ctx, radius, { walkPhase = 0, attacking = false, hurt = false } = {}) {
  const scale = radius / 14
  const step = Math.sin(walkPhase * Math.PI * 2)
  const lift = Math.abs(step) * 1.2
  const swordAngle = attacking ? -0.82 : 0.16 + step * 0.04
  const bodyStroke = hurt ? '#fff4d1' : '#1d2630'

  ctx.save()
  ctx.scale(scale, scale)
  ctx.translate(0, -lift * 0.35)

  // Cape and rear silhouette provide a readable warm edge against the forest.
  polygon(ctx, [[-10, -1], [-7, -11], [0, -8], [5, 7], [-8, 9]], '#704a42', bodyStroke, 1.35)
  polygon(ctx, [[-7, 2], [-4, -6], [2, -4], [3, 8], [-6, 9]], '#9b6250', '#382c34', 1)

  // Feet/legs: a tiny alternating step is enough at gameplay scale.
  for (const side of [-1, 1]) {
    const y = 8 + (side < 0 ? step : -step) * 0.8
    polygon(ctx, [[side * 6, 4], [side * 2, 4], [side * 2.5, y + 4], [side * 7, y + 4]], '#354955', bodyStroke, 1.05)
    ellipse(ctx, side * 5.2, y + 5, 3.6, 1.8, '#26363e', bodyStroke, 0.85)
  }

  // Body and breastplate use three simple masses, matching the reference's
  // lightweight cartoon language without painterly microtexture.
  polygon(ctx, [[-8, -5], [7, -6], [9, 5], [3, 9], [-7, 7]], '#3e6670', bodyStroke, 1.35)
  polygon(ctx, [[-5, -3], [4, -4], [5, 4], [0, 7], [-5, 4]], '#6f9a9d', '#29424d', 0.9)
  polygon(ctx, [[-1, -3], [3, -3], [3, 5], [0, 6], [-1, 4]], '#c18a45', '#60452f', 0.85)

  // Shield is deliberately oversized so the class reads before facial detail.
  polygon(ctx, [[-14, -7], [-8, -10], [-4, -6], [-5, 8], [-10, 11], [-14, 7]], '#27566b', bodyStroke, 1.4)
  polygon(ctx, [[-11.8, -5.5], [-8.2, -7], [-6.5, -4.5], [-7, 6.8], [-10, 8.5], [-11.8, 5.2]], '#4f8b99', '#b6d0c3', 0.7)
  polygon(ctx, [[-9.5, -2.5], [-7.4, -1], [-9.2, 1], [-11, -1]], '#d5a452', '#7a5933', 0.7)

  // Helmet: broad dome, visor strip and a small crest create a clear head mass.
  ellipse(ctx, 0, -11, 8, 7.5, '#587c86', bodyStroke, 1.35)
  polygon(ctx, [[-7, -12], [7, -12], [6, -5], [2, -3], [-6, -5]], '#324650', bodyStroke, 1.1)
  ctx.fillStyle = '#18262d'
  ctx.fillRect(-5.8, -9.5, 10.8, 2.3)
  ctx.fillStyle = '#bdd8cf'
  ctx.fillRect(-4.2, -9.2, 2.2, 0.8)
  polygon(ctx, [[-3, -18], [0, -21], [3, -18], [2, -15], [-2, -15]], '#b57e41', '#60452f', 0.8)

  // Sword stays separate from the body so attack direction remains obvious.
  ctx.save()
  ctx.translate(8, 0)
  ctx.rotate(swordAngle)
  ctx.strokeStyle = '#5a422d'
  ctx.lineWidth = 2.1
  ctx.beginPath(); ctx.moveTo(0, 3); ctx.lineTo(0, -11); ctx.stroke()
  polygon(ctx, [[-1.8, -10], [0, -16], [1.8, -10]], '#d8e0d5', bodyStroke, 0.8)
  ctx.strokeStyle = '#c18a45'
  ctx.lineWidth = 2.4
  ctx.beginPath(); ctx.moveTo(-3, 3); ctx.lineTo(3, 3); ctx.stroke()
  ctx.restore()

  ctx.restore()
}

