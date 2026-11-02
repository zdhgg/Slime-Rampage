/* Beacon Engineer — dark indigo robe with brass goggles and a tall beacon
 * staff crowned by a big cyan lamp; three small beacon lamps float in a
 * triangle around him. Floats; the lamp fire is his weapon and his tell. */
import { TAU, lw, olPx, fine, ell, glow, openMouth } from '../slime-art/slime-painter.js'
import { BOSS_PAL as PAL, ENEMY_PAL, limb, part, brow, bossFrames, bossFrameKey, rageEyes, embers, sweat, shockLines } from './boss-kit.js'

const FEET = 70
const HEAD = [0, -106, 62, 56]
const HAIR = [[-50, -116], [-44, -156], [-14, -176], [20, -178], [48, -154], [56, -118], [48, -104], [44, -112], [-44, -106]]
const SINE = Math.sin

const POSE = {
  idle: { staff: [64, 8, .05], lampGlow: .4, hand: [60, 4], lamps: 0, slump: 0 },
  move: { staff: [64, 8, .05], lampGlow: .4, hand: [60, 4], lamps: 0, slump: 0 },
  windup: { staff: [72, -30, -.22], lampGlow: 1, hand: [66, -26], lamps: .5, slump: 0 },
  strike: { staff: [94, -14, .34], lampGlow: 1.6, hand: [88, -10], lamps: 1, slump: 0 },
  recover: { staff: [56, 40, .5], lampGlow: .15, hand: [52, 30], lamps: -1, slump: .14 },
  roar: { staff: [60, -40, -.35], lampGlow: 1.6, hand: [56, -42], lamps: 1.4, slump: 0 },
}

const robePath = wv => c => {
  c.beginPath(); c.moveTo(-54, -48)
  c.bezierCurveTo(-30, -62, 30, -62, 54, -48)
  c.bezierCurveTo(68, -16, 80, 26, 94, 60 + 5 * SINE(wv))
  c.quadraticCurveTo(70, 82 + 4 * SINE(wv + 1), 46, 62 + 5 * SINE(wv + 2))
  c.quadraticCurveTo(23, 80 + 4 * SINE(wv + 3), 0, 62 + 5 * SINE(wv + 4))
  c.quadraticCurveTo(-23, 80 + 4 * SINE(wv + 5), -46, 62 + 5 * SINE(wv + 6))
  c.quadraticCurveTo(-70, 82 + 4 * SINE(wv + 7), -94, 60 + 5 * SINE(wv + 8))
  c.bezierCurveTo(-80, 26, -68, -16, -54, -48); c.closePath()
}

/** Caged cyan beacon lamp: brass diamond cage, glowing glass core.
 *  The halo is capped so even a roar flare stays inside the cache surface. */
function lamp(ctx, x, y, s, flare, rage) {
  const hot = rage ? '#ff9a3c' : '#4fd8e8'
  glow(ctx, x, y, Math.min(46, (24 + flare * 12) * s), hot, .4 + flare * .3)
  part(ctx, [[x, y - 17 * s], [x + 12 * s, y], [x, y + 17 * s], [x - 12 * s, y]], PAL.brass, [x, y], { off: [-2 * s, -2.4 * s], sc: .85 })
  part(ctx, [[x, y - 10 * s], [x + 6.5 * s, y], [x, y + 10 * s], [x - 6.5 * s, y]], PAL.lamp, [x, y], { off: [-1.5 * s, -2 * s], sc: .85, spec: [x - 2 * s, y - 5 * s, -.5, .7 * s, .9] })
  // small finial and base hook
  part(ctx, [[x - 3 * s, y - 21 * s], [x + 3 * s, y - 21 * s], [x + 2 * s, y - 16 * s], [x - 2 * s, y - 16 * s]], PAL.brass, [x, y - 18 * s], { off: [-1, -1], sc: .8, ol: .8 })
}

function draw(ctx, st) {
  const pose = st.pose || 'idle'
  const P = POSE[pose] || POSE.idle
  const rage = !!st.rage
  const wv = pose === 'move' ? (st.phase || 0) * Math.PI * 4 : 0
  const [sx, sy, stilt] = P.staff
  const [hx, hy] = P.hand
  const lampHot = Math.max(0, P.lampGlow + (rage ? .5 : 0))

  ctx.save()
  if (P.slump) { ctx.translate(0, FEET); ctx.rotate(P.slump); ctx.translate(0, -FEET) }

  // staff first: robe sleeve and hand overlap it (antenna finial reaches the top line)
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(stilt)
  limb(ctx, 0, 66, 0, -176, 12, PAL.brass)
  part(ctx, [[-5, -206], [5, -206], [4, -176], [-4, -176]], PAL.brass, [0, -190], { off: [-1.5, -2], sc: .85 })
  part(ctx, [[-9, -212], [9, -212], [5, -205], [-5, -205]], PAL.brass, [0, -208], { off: [-1.5, -2], sc: .85 })
  part(ctx, c => ell(c, 0, -216, 5, 5, 0), PAL.lamp, [0, -216], { off: [-1, -1], sc: .8 })
  // beacon lamp head: brass frame + big glowing core
  part(ctx, [[-20, -186], [20, -186], [24, -150], [-24, -150]], PAL.brass, [0, -168], { off: [-3, -3], sc: .9 })
  lamp(ctx, 0, -166, 1.5, lampHot, rage)
  ctx.restore()

  // three floating beacon lamps in a triangle around the body
  const dip = P.lamps < 0 ? 34 : 0
  const bob = pose === 'move' ? SINE(wv * .5) * 6 : 0
  const lampScale = .8 + Math.max(0, P.lamps) * .15
  lamp(ctx, -92, -30 + dip + bob, lampScale, lampHot, rage)
  lamp(ctx, 94, -84 + dip - bob, lampScale, lampHot, rage)
  lamp(ctx, -34, -186 + dip - bob * .5, lampScale, lampHot, rage)

  // robe with scalloped hem, brass seam and tool belt
  part(ctx, robePath(wv), PAL.beaconRobe, [0, 8], { off: [-6, -8], sc: .95, lights: [[-32, -8, 15, 30, -.15]] })
  ctx.beginPath(); ctx.moveTo(2, -46); ctx.lineTo(2, 66)
  ctx.strokeStyle = PAL.brass.base; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.stroke()
  part(ctx, [[-62, 4], [0, 12], [62, 4], [64, 20], [0, 28], [-64, 20]], PAL.brass, [0, 16], { off: [-2, -3], sc: .94 })
  part(ctx, [[-52, 22], [-36, 24], [-34, 44], [-50, 42]], ENEMY_PAL.cream, [-43, 33], { off: [-2, -2], sc: .85 })

  // off-hand sleeve: gathers a spark while charging
  const ly = P.lampGlow >= 1 ? -40 : 14
  part(ctx, c => ell(c, -72, ly, 26, 30, -.15), PAL.beaconRobe, [-72, ly], { off: [-4, -5], sc: .9 })
  part(ctx, c => ell(c, -76, ly + (P.lampGlow >= 1 ? -28 : 26), 12, 12, 0), ENEMY_PAL.skin, [-76, ly + 26], { off: [-2, -2], sc: .85 })
  if (P.lampGlow >= 1) {
    glow(ctx, -76, ly - 56, 34, '#a8ecff', .9)
    ell(ctx, -76, ly - 56, 10, 10, 0, '#eafaff')
  }

  // staff-hand sleeve + hand on the shaft
  limb(ctx, 46, -36, hx - 8, hy - 4, 28, PAL.beaconRobe)
  part(ctx, c => ell(c, hx - 4, hy - 2, 25, 21, .2), PAL.beaconRobe, [hx - 4, hy - 2], { off: [-4, -5], sc: .9 })
  part(ctx, c => ell(c, hx, hy + 4, 12, 12, 0), ENEMY_PAL.skin, [hx, hy + 4], { off: [-2, -2], sc: .85 })

  // head: messy dark hair, skin face, brass goggles over hostile eyes
  part(ctx, HAIR, PAL.beaconDark, [2, -136], { off: [-4, -5], sc: .95, lights: [[-22, -160, 18, 9, -.35]] })
  part(ctx, c => ell(c, HEAD[0], HEAD[1], HEAD[2], HEAD[3], 0), ENEMY_PAL.skin, [0, -106], { off: [-5, -6], sc: .94, lights: [[-22, -130, 20, 10, -.3]] })
  // hair fringe over the crown
  part(ctx, [[-46, -118], [-30, -140], [-4, -146], [24, -142], [46, -120], [40, -110], [-40, -108]], PAL.beaconDark, [0, -128], { off: [-3, -4], sc: .92 })
  // goggles: strap, two brass rims, cyan lenses with hostile slits
  ctx.beginPath(); ctx.moveTo(-52, -98); ctx.lineTo(52, -98)
  ctx.strokeStyle = PAL.brass.line; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.stroke()
  if (rage) rageEyes(ctx, -20, -98, 42, 1.05)
  else for (const [ex, rot] of [[-20, .28], [22, -.28]]) {
    glow(ctx, ex, -98, 20, PAL.lamp.base, .5)
    ctx.save(); ctx.translate(ex, -98); ctx.rotate(rot)
    ell(ctx, 0, 0, 7, 10, 0, PAL.lamp.light)
    ell(ctx, 0, 0, 3.2, 8, 0, '#0d4454')
    ctx.restore()
  }
  for (const ex of [-20, 22]) {
    ctx.beginPath(); ctx.ellipse(ex, -98, 15, 16, 0, 0, TAU)
    ctx.strokeStyle = PAL.brass.base; ctx.lineWidth = 7; ctx.stroke()
    ctx.strokeStyle = PAL.brass.line; ctx.lineWidth = lw(olPx() * .8); ctx.stroke()
  }
  part(ctx, [[-6, -100], [8, -100], [8, -94], [-6, -94]], PAL.brass, [1, -97], { off: [-1, -1], sc: .8, ol: .7 })
  // goggle slant does the hostility; a short frown finishes the face
  if (pose === 'recover') {
    openMouth(ctx, 6, -64, 20, 13, { line: ENEMY_PAL.skin.line })
    sweat(ctx, 50, -128, 1)
  } else if (pose === 'roar') {
    openMouth(ctx, 8, -66, 24, 22, { line: ENEMY_PAL.skin.line })
    shockLines(ctx, 0, -110, 84, 112)
  } else if (fine()) {
    ctx.beginPath(); ctx.moveTo(-2, -62); ctx.quadraticCurveTo(12, -68, 26, -62)
    ctx.strokeStyle = ENEMY_PAL.skin.line; ctx.lineWidth = lw(1.4); ctx.lineCap = 'round'; ctx.stroke()
  }

  if (rage) embers(ctx, [[-80, -140, 1], [80, -160, 1.1], [-10, -60, .8]])

  ctx.restore()
}

export const beaconEngineer = {
  id: 'boss:beacon_engineer', baseR: 34, scale: 1.18, surface: 221, feetY: FEET, shadowRx: 76,
  gait: .8, floats: true, unique: true, motionMul: 2.2, topY: -222,
  frames: bossFrames(),
  frameKey: st => bossFrameKey(st, .8),
  draw,
}
