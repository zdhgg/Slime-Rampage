/* Hound (战獒) — side-on four-legged silhouette: pointed ear, red studded collar, back spikes, snapping jaw. Faces +x. */
import { TAU, ell } from '../slime-art/slime-painter.js'
import { ENEMY_PAL as PAL, limb, part, brow, moveFrames, frameIndex } from './enemy-kit.js'

const FEET = 98
const TORSO = [[-98, -8], [-86, -54], [-42, -66], [14, -64], [64, -54], [96, -22], [94, 22], [58, 46], [0, 56], [-54, 52], [-90, 32]]
const SPIKES = [-60, -32, -4, 24]
const EAR_FAR = [[-38, -30], [-48, -90], [-8, -50]]
const EAR_NEAR = [[-26, -36], [-28, -108], [16, -54]]
const SNOUT = [[8, -16], [64, -12], [92, 4], [78, 24], [10, 22]]
const JAW = [[-2, -2], [60, -2], [74, 10], [48, 28], [4, 24]]

const POSE = {
  idle: { lean: 0, dx: 0, head: [0, 0, 0], open: 0, legs: 0, tail: 0 },
  move: { lean: .02, dx: 0, head: [0, 0, -.04], open: .2, legs: 1, tail: 1 },
  crouch: { lean: .07, dx: -4, head: [4, 12, .16], open: .3, legs: 0, tail: 2, low: 10 },
  bite: { lean: .1, dx: 12, head: [18, 6, .24], open: 1, legs: 2, tail: 2 },
}
const TAILS = [[-140, -60], [-146, -88], [-150, -106]]

function leg(ctx, hx, off, lift, pal) {
  const px = hx + off, py = FEET - lift
  limb(ctx, hx, 30, px, py - 10, 32, pal)
  part(ctx, c => ell(c, px + 9, py - 4, 24, 12, 0), PAL.furDark, [px + 9, py - 4], { off: [-3, -3], sc: .88 })
}

function head(ctx, P) {
  const [hx, hy, tilt] = P.head, open = P.open
  ctx.save(); ctx.translate(106 + hx, -28 + hy); ctx.rotate(tilt)
  part(ctx, EAR_FAR, PAL.furDark, [-30, -52], { off: [-3, -4], sc: .88 })
  part(ctx, c => ell(c, 0, 0, 56, 52, 0), PAL.fur, [0, 0], { off: [-6, -7], sc: .95, lights: [[-16, -30, 24, 11, -.3]], spec: [-20, -34, -.4, 1.7, .85] })
  part(ctx, EAR_NEAR, PAL.furDark, [-14, -62], { off: [-3, -4], sc: .88 })
  if (open > .05) part(ctx, [[8, 16], [68, 10], [62, 12 + open * 32], [10, 30]], PAL.mouth, [38, 20], { off: [-1, -1], sc: .9, ol: .7 })
  ctx.save(); ctx.translate(6, 20); ctx.rotate(open * .5)
  part(ctx, JAW, PAL.cream, [34, 12], { off: [-3, -3], sc: .9 })
  if (open > .5) for (const fx of [34, 54]) part(ctx, [[fx - 5, 4], [fx, -12], [fx + 5, 4]], PAL.fang, [fx, -3], { off: [-1, -1], sc: .8, ol: .6 })
  ctx.restore()
  part(ctx, SNOUT, PAL.cream, [44, 4], { off: [-4, -5], sc: .92, lights: [[34, -4, 16, 6, 0]] })
  for (const fx of [44, 64]) part(ctx, [[fx - 5, 19], [fx, 31 + open * 10], [fx + 5, 19]], PAL.fang, [fx, 24], { off: [-1, -1], sc: .8, ol: .6 })
  part(ctx, c => ell(c, 78, 2, 12, 9, 0), PAL.furDark, [78, 2], { off: [-2, -2], sc: .85 })
  ell(ctx, 26, -16, 9.5, 11, 0, PAL.eyeHot)
  ell(ctx, 23, -19.5, 3.4, 4, 0, '#fff')
  brow(ctx, 8, -38, 42, -26, PAL.fur.line)
  ctx.restore()
}

function draw(ctx, st) {
  const pose = st.pose || 'idle'
  const P = POSE[pose] || POSE.idle
  const ph = (st.phase || 0) * TAU
  const mv = pose === 'move'
  const sp = mv ? Math.cos(ph) : P.legs === 2 ? .75 : 0
  const fl = mv ? Math.max(0, Math.sin(ph)) * 16 : 0
  const rl = mv ? Math.max(0, -Math.sin(ph)) * 16 : 0
  const sp2 = mv ? Math.cos(ph + .8) : sp * .6
  const fl2 = mv ? Math.max(0, Math.sin(ph + .8)) * 14 : 0
  const rl2 = mv ? Math.max(0, -Math.sin(ph + .8)) * 14 : 0
  const low = P.low || 0

  ctx.save()
  ctx.translate(P.dx, 0); ctx.translate(0, FEET); ctx.rotate(P.lean); ctx.translate(0, -FEET)

  // far-side legs
  leg(ctx, 40, sp2 * 24, fl2, PAL.furDark)
  leg(ctx, -78, -sp2 * 24, rl2, PAL.furDark)

  // tail: thick curve that thins to a lighter tip
  const [tx, ty] = TAILS[P.tail]
  limb(ctx, -92, -6, tx, ty, 28, PAL.fur, -130, -8)
  ell(ctx, tx, ty, 14, 14, 0, PAL.cream.base)

  ctx.save(); ctx.translate(0, low * .6)
  for (const x of SPIKES) part(ctx, [[x - 14, -52], [x + 2, -82], [x + 16, -52]], PAL.furDark, [x, -62], { off: [-2, -3], sc: .85 })
  part(ctx, TORSO, PAL.fur, [0, 0], {
    off: [-7, -8], sc: .96, lights: [[-30, -40, 42, 11, -.05]],
    inner: c => ell(c, -4, 50, 90, 24, 0, PAL.cream.base),
  })
  // red studded collar at the neck
  part(ctx, [[70, -56], [92, -48], [104, -8], [80, -4]], PAL.plume, [88, -28], { off: [-2, -3], sc: .9 })
  part(ctx, c => ell(c, 94, -26, 9, 9, 0), PAL.gold, [94, -26], { off: [-1.5, -1.5], sc: .85 })
  ctx.restore()

  // near-side legs
  leg(ctx, 62, sp * 26, fl, PAL.fur)
  leg(ctx, -56, -sp * 26, rl, PAL.fur)

  ctx.save(); ctx.translate(0, low); head(ctx, P); ctx.restore()
  ctx.restore()
}

export const hound = {
  id: 'hound', baseR: 11, scale: 1.25, surface: 80, feetY: FEET, shadowRx: 104, gait: 1.6,
  frames: [['idle', { pose: 'idle' }], ...moveFrames(), ['crouch', { pose: 'crouch' }], ['bite', { pose: 'bite' }]],
  frameKey: st => st.swing >= 0 ? 'bite' : st.windup ? 'crouch' : st.moving ? `move${frameIndex(st.walkT || 0, 1.6)}` : 'idle',
  draw,
}
