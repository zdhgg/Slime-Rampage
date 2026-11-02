/* Nest Inquisitor — cream purifier robe under a tall pointed cowl, charcoal
 * inner shadow with ember eyes; a chained censer swings from the hand and a
 * ring of flame circles the hem. Floats. */
import { TAU, lw, olPx, fine, ell, glow, openMouth } from '../slime-art/slime-painter.js'
import { BOSS_PAL as PAL, ENEMY_PAL, limb, part, brow, bossFrames, bossFrameKey, rageEyes, rageBrow, embers, sweat, shockLines } from './boss-kit.js'

const FEET = 72
const HEAD = [0, -104, 60, 56]
// cowl runs taller and narrower than the other headdresses — a sharp spire
const COWL = [[-46, -92], [-40, -152], [-14, -216], [6, -226], [28, -206], [46, -150], [52, -98], [44, -70], [20, -54], [-22, -56], [-46, -72]]
const FACE = [[-34, -112], [2, -120], [40, -110], [46, -84], [34, -60], [2, -52], [-28, -60], [-38, -86]]
const SINE = Math.sin

// every pose carries a slight forward lean — the inquisitor hunches a little
const POSE = {
  idle: { censer: [64, 6, .12], flame: .5, hand: [58, 2], ring: 0, slump: .04 },
  move: { censer: [64, 6, .12], flame: .5, hand: [58, 2], ring: 0, slump: .05 },
  windup: { censer: [68, -42, -.4], flame: 1, hand: [62, -36], ring: .5, slump: -.06 },
  strike: { censer: [112, -16, .9], flame: 1.6, hand: [94, -8], ring: 1, slump: .12 },
  recover: { censer: [56, 46, .35], flame: .2, hand: [52, 36], ring: -.6, slump: .16 },
  roar: { censer: [58, -56, -.5], flame: 1.7, hand: [54, -50], ring: 1.3, slump: -.06 },
}

// narrow gown — slimmer than the other robes so the cowl spire dominates
const robePath = wv => c => {
  c.beginPath(); c.moveTo(-46, -46)
  c.bezierCurveTo(-24, -60, 24, -60, 46, -46)
  c.bezierCurveTo(54, -16, 64, 20, 74, 52 + 5 * SINE(wv))
  c.quadraticCurveTo(56, 70 + 4 * SINE(wv + 1), 38, 54 + 5 * SINE(wv + 2))
  c.quadraticCurveTo(18, 70 + 4 * SINE(wv + 3), 0, 54 + 5 * SINE(wv + 4))
  c.quadraticCurveTo(-18, 70 + 4 * SINE(wv + 5), -38, 54 + 5 * SINE(wv + 6))
  c.quadraticCurveTo(-56, 70 + 4 * SINE(wv + 7), -74, 52 + 5 * SINE(wv + 8))
  c.bezierCurveTo(-64, 20, -54, -16, -46, -46); c.closePath()
}

/** Chained censer: short chain from the hand, charcoal pot, flame inside. */
function censer(ctx, x, y, rot, flare, rage) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot)
  // chain — longer so the pot hangs clearly below the sleeve line
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 52)
  ctx.strokeStyle = PAL.ashChar.line; ctx.lineWidth = 8 + lw(olPx()) * 2; ctx.lineCap = 'round'; ctx.stroke()
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 52)
  ctx.strokeStyle = PAL.ashChar.base; ctx.lineWidth = 8; ctx.stroke()
  for (const cy of [12, 30, 46]) {
    ctx.beginPath(); ctx.ellipse(0, cy, 6, 8, 0, 0, TAU)
    ctx.strokeStyle = PAL.ashChar.line; ctx.lineWidth = 3; ctx.stroke()
  }
  // pot: squat charcoal bowl with a brass rim
  part(ctx, [[-18, 52], [18, 52], [24, 72], [16, 88], [-16, 88], [-24, 72]], PAL.ashChar, [0, 70], { off: [-2, -3], sc: .9 })
  part(ctx, [[-20, 50], [20, 50], [20, 58], [-20, 58]], PAL.brass, [0, 54], { off: [-1.5, -2], sc: .85 })
  // flame above the bowl
  const hot = rage ? '#ff5a3c' : '#f47c2c'
  glow(ctx, 0, 48, 26 + flare * 16, hot, .45 + flare * .25)
  embers(ctx, [[0, 42 - flare * 6, 1 + flare * .3]])
  ctx.restore()
}

function draw(ctx, st) {
  const pose = st.pose || 'idle'
  const P = POSE[pose] || POSE.idle
  const rage = !!st.rage
  const wv = pose === 'move' ? (st.phase || 0) * Math.PI * 4 : 0
  const [cx, cy, crot] = P.censer
  const [hx, hy] = P.hand
  const mv = pose === 'move'

  ctx.save()
  if (P.slump) { ctx.translate(0, FEET); ctx.rotate(P.slump); ctx.translate(0, -FEET) }

  // ring of flame circling the hem — the purifier's annulus
  const ringY = 56 - P.ring * 20, ringR = 74 + P.ring * 22, n = 7
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + (mv ? wv * .3 : 0)
    embers(ctx, [[Math.cos(a) * ringR, ringY + Math.sin(a) * 18, .8 + P.flame * .3]], rage ? '#ff5a3c' : '#f47c2c')
  }

  // cream robe with scalloped hem, charcoal centre seam and rope belt
  part(ctx, robePath(wv), PAL.inqCream, [0, 8], { off: [-6, -8], sc: .95, lights: [[-30, -8, 15, 28, -.15]] })
  ctx.beginPath(); ctx.moveTo(2, -44); ctx.lineTo(2, 60)
  ctx.strokeStyle = PAL.ashChar.base; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.stroke()
  part(ctx, [[-50, 6], [0, 14], [50, 6], [52, 20], [0, 28], [-52, 20]], PAL.brass, [0, 17], { off: [-2, -3], sc: .94 })

  // censer arm: sleeve reaches to the hand, the pot swings below
  limb(ctx, 44, -34, hx - 6, hy - 4, 26, PAL.inqCream)
  part(ctx, c => ell(c, hx - 4, hy - 2, 24, 20, .2), PAL.inqCream, [hx - 4, hy - 2], { off: [-4, -5], sc: .9 })
  part(ctx, c => ell(c, hx, hy + 4, 12, 12, 0), ENEMY_PAL.skin, [hx, hy + 4], { off: [-2, -2], sc: .85 })
  censer(ctx, cx, cy, crot + (pose === 'move' ? SINE(wv * .5) * .12 : 0), P.flame, rage)

  // off-hand sleeve gathers a coal while charging
  const ly = P.flame >= 1 ? -38 : 16
  part(ctx, c => ell(c, -70, ly, 25, 29, -.15), PAL.inqCream, [-70, ly], { off: [-4, -5], sc: .9 })
  part(ctx, c => ell(c, -74, ly + (P.flame >= 1 ? -26 : 24), 12, 12, 0), ENEMY_PAL.skin, [-74, ly + 24], { off: [-2, -2], sc: .85 })
  if (P.flame >= 1) {
    glow(ctx, -74, ly - 52, 34, '#ffb066', .85)
    embers(ctx, [[-74, ly - 56, 1]])
  }

  // tall pointed cowl: charcoal opening, ember-lit hostile eyes
  part(ctx, COWL, PAL.inqCream, [0, -128], { off: [-5, -6], sc: .95, lights: [[-26, -168, 18, 14, -.4]], spec: [-26, -176, -.4, 1.6, .9] })
  part(ctx, FACE, PAL.ashChar, [2, -86], { off: [-3, -4], sc: .94, ol: .8 })
  if (rage) rageEyes(ctx, -14, -88, 40, 1.05)
  else for (const [ex, rot] of [[-14, .3], [26, -.3]]) {
    glow(ctx, ex, -88, 22, '#f47c2c', .5)
    ctx.save(); ctx.translate(ex, -88); ctx.rotate(rot)
    ell(ctx, 0, 0, 7.5, 10.5, 0, '#ffb066')
    ell(ctx, 0, 0, 3, 7.5, 0, '#7a2a10')
    ctx.restore()
  }
  const brows = rage ? rageBrow : brow
  brows(ctx, -28, -112, -4, -100, PAL.ashChar.light)
  brows(ctx, 20, -100, 42, -112, PAL.ashChar.light)

  if (pose === 'recover') {
    openMouth(ctx, 4, -58, 20, 13, { line: PAL.ashChar.light, deep: '#2e0e0e', tongue: '#ff8a5a' })
    sweat(ctx, 48, -118, 1)
  } else if (pose === 'roar') {
    openMouth(ctx, 6, -58, 24, 22, { line: PAL.ashChar.light, deep: '#2e0e0e', tongue: '#ff8a5a' })
    shockLines(ctx, -6, -112, 80, 108)
  } else if (fine()) {
    ctx.beginPath(); ctx.moveTo(-4, -58); ctx.quadraticCurveTo(10, -64, 24, -58)
    ctx.strokeStyle = '#ffb066'; ctx.lineWidth = lw(1.4); ctx.lineCap = 'round'; ctx.stroke()
  }

  if (rage) embers(ctx, [[-76, -140, 1], [74, -150, 1.1], [-16, -60, .8]])

  ctx.restore()
}

export const nestInquisitor = {
  id: 'boss:nest_inquisitor', baseR: 34, scale: 1.18, surface: 212, feetY: FEET, shadowRx: 78,
  gait: .8, floats: true, unique: true, motionMul: 2.2, topY: -230,
  frames: bossFrames(),
  frameKey: st => bossFrameKey(st, .8),
  draw,
}
