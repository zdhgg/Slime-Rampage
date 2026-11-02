/* Mage — floppy violet hood with glowing eyes, bell-sleeved robe with a scalloped hem, tall staff topped by a gold orb. */
import { lw, olPx, fine, ell, glow, rgba } from '../slime-art/slime-painter.js'
import { ENEMY_PAL as PAL, VISUAL_SCALE, limb, part, moveFrames, frameIndex } from './enemy-kit.js'

const FEET = 84
const HOOD = [[-58, -90], [-50, -134], [-20, -160], [22, -162], [52, -138], [64, -100], [56, -62], [16, -44], [-28, -46], [-58, -64]]
const TIP = [[-22, -148], [-62, -164], [-98, -134], [-72, -130], [-48, -118]]
const FACE = [[-34, -112], [2, -120], [42, -112], [48, -86], [36, -62], [4, -54], [-26, -62], [-38, -86]]

const POSE = {
  idle: { hand: [88, 6], tilt: .06, orb: 22, glow: .35 },
  move: { hand: [88, 6], tilt: .06, orb: 22, glow: .35 },
  charge: { hand: [94, -26], tilt: -.1, orb: 27, glow: 1 },
  fire: { hand: [110, -34], tilt: .42, orb: 31, glow: 1.5 },
}

const sine = Math.sin
const robePath = wv => c => {
  c.beginPath(); c.moveTo(-50, -44)
  c.bezierCurveTo(-30, -58, 30, -58, 50, -44)
  c.bezierCurveTo(64, -14, 74, 30, 88, 68 + 5 * sine(wv))
  c.quadraticCurveTo(66, 92 + 4 * sine(wv + 1), 44, 72 + 5 * sine(wv + 2))
  c.quadraticCurveTo(22, 90 + 4 * sine(wv + 3), 0, 72 + 5 * sine(wv + 4))
  c.quadraticCurveTo(-22, 90 + 4 * sine(wv + 5), -44, 72 + 5 * sine(wv + 6))
  c.quadraticCurveTo(-66, 92 + 4 * sine(wv + 7), -88, 68 + 5 * sine(wv + 8))
  c.bezierCurveTo(-74, 30, -64, -14, -50, -44); c.closePath()
}

function draw(ctx, st) {
  const pose = st.pose || 'idle'
  const P = POSE[pose] || POSE.idle
  const wv = pose === 'move' ? (st.phase || 0) * Math.PI * 4 : 0
  const charge = pose === 'charge', fire = pose === 'fire'
  const [hx, hy] = P.hand

  ctx.save()
  // staff first: the sleeve bell and hand overlap it
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(P.tilt)
  limb(ctx, 0, 78, 0, -128, 12, PAL.leather)
  const oy = -150
  if (P.glow) glow(ctx, 0, oy, 52 * P.glow, '#ffd45e', fire ? .8 : charge ? .6 : .32)
  ctx.beginPath(); ctx.arc(0, oy + 2, P.orb + 7, Math.PI * .1, Math.PI * .9)
  ctx.strokeStyle = PAL.leather.line; ctx.lineWidth = 12 + lw(olPx()) * 2; ctx.lineCap = 'round'; ctx.stroke()
  ctx.strokeStyle = PAL.leather.base; ctx.lineWidth = 12; ctx.stroke()
  part(ctx, c => ell(c, 0, oy, P.orb, P.orb, 0), PAL.orb, [0, oy], { off: [-4, -5], sc: .9, spec: [-7, oy - 8, -.5, 1.3, .95] })
  if (fire) ell(ctx, 0, oy, P.orb * .62, P.orb * .62, 0, 'rgba(255,255,255,.88)')
  ctx.restore()

  // robe with scalloped hem, centre seam and rope belt
  part(ctx, robePath(wv), PAL.robe, [0, 12], { off: [-6, -8], sc: .95, lights: [[-30, -4, 15, 30, -.15]] })
  ctx.beginPath(); ctx.moveTo(2, -42); ctx.lineTo(2, 74)
  ctx.strokeStyle = rgba(PAL.gold.base, .95); ctx.lineWidth = 11; ctx.lineCap = 'round'; ctx.stroke()
  part(ctx, [[-58, 8], [0, 16], [58, 8], [60, 22], [0, 30], [-60, 22]], PAL.gold, [0, 19], { off: [-2, -3], sc: .94 })

  // off-hand sleeve: hangs idle, lifts a spark while charging
  const ly = charge || fire ? -36 : 18
  part(ctx, c => ell(c, -68, ly, 24, 28, -.15), PAL.robe, [-68, ly], { off: [-4, -5], sc: .9 })
  part(ctx, c => ell(c, -72, ly + (charge || fire ? -26 : 24), 11, 11, 0), PAL.skin, [-72, ly + 24], { off: [-2, -2], sc: .85 })
  if (charge || fire) {
    glow(ctx, -72, ly - 52, 30, '#d8b4ff', .85)
    ell(ctx, -72, ly - 52, 9, 9, 0, '#f5e6ff')
  }

  // staff-hand sleeve bell + hand
  limb(ctx, 44, -34, hx - 10, hy - 6, 26, PAL.robe)
  part(ctx, c => ell(c, hx - 4, hy - 2, 24, 20, .2), PAL.robe, [hx - 4, hy - 2], { off: [-4, -5], sc: .9 })
  part(ctx, c => ell(c, hx, hy + 4, 11, 11, 0), PAL.skin, [hx, hy + 4], { off: [-2, -2], sc: .85 })

  // hood: floppy tip behind, dome, dark face with glowing eyes
  part(ctx, TIP, PAL.hood, [-62, -142], { off: [-3, -4], sc: .88 })
  part(ctx, HOOD, PAL.hood, [2, -102], { off: [-6, -7], sc: .95, lights: [[-26, -136, 20, 11, -.4]], spec: [-30, -142, -.4, 1.7, .9] })
  part(ctx, FACE, PAL.voidFace, [4, -88], { off: [-2, -3], sc: .94, ol: .7 })
  const er = charge || fire ? 1.18 : 1
  for (const [ex, rot] of [[-12, .32], [28, -.32]]) {
    glow(ctx, ex, -88, 26, PAL.eyeGlow, charge || fire ? .55 : .3)
    ctx.save(); ctx.translate(ex, -88); ctx.rotate(rot)
    ell(ctx, 0, 0, 8.5 * er, 12 * er, 0, PAL.eyeGlow)
    ell(ctx, -1.5, -3, 3.4 * er, 5 * er, 0, '#fff')
    ctx.restore()
  }
  if (fine()) {
    ctx.beginPath(); ctx.moveTo(-6, -66); ctx.quadraticCurveTo(10, -58, 26, -66)
    ctx.strokeStyle = PAL.eyeGlow; ctx.lineWidth = lw(1.3); ctx.lineCap = 'round'; ctx.stroke()
  }
  ctx.restore()
}

export const mage = {
  id: 'mage', baseR: 13, scale: VISUAL_SCALE, surface: 84, feetY: FEET, shadowRx: 66, floats: true,
  frames: [['idle', { pose: 'idle' }], ...moveFrames(), ['charge', { pose: 'charge' }], ['fire', { pose: 'fire' }]],
  frameKey: st => st.casting === 'fire' ? 'fire' : st.casting ? 'charge' : st.moving ? `move${frameIndex(st.walkT || 0)}` : 'idle',
  draw,
}
