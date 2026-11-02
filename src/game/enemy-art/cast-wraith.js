/* Wraith — hooded shroud that dissolves into trailing wisps instead of legs, hollow face with
 * ghost-fire eyes, clawed arms that reach forward on the life-drain ('grasp'). Floats; translucent hem. */
import { TAU, lw, olPx, fine, ell, glow, rgba } from '../slime-art/slime-painter.js'
import { ENEMY_PAL as PAL, VISUAL_SCALE, limb, part, moveFrames, frameIndex } from './enemy-kit.js'

const FEET = 74
const HOOD = [[-46, -70], [-40, -118], [-14, -148], [14, -150], [40, -124], [48, -80], [38, -52], [4, -42], [-30, -48], [-46, -58]]
const FACE = [[-28, -100], [4, -106], [34, -98], [36, -74], [24, -56], [0, -50], [-22, -58], [-30, -78]]

const POSE = {
  idle: { arms: [[-54, -14], [54, -14]], claw: .35, eye: 1, lean: 0 },
  move: { arms: [[-54, -14], [54, -14]], claw: .35, eye: 1, lean: .03 },
  grasp: { arms: [[42, -30], [80, -8]], claw: 1, eye: 1.55, lean: .14 },
}

const sine = Math.sin
// tattered hem: three trailing ribbons whose tips wave with the move phase
const hemPath = wv => c => {
  c.beginPath(); c.moveTo(-40, -46)
  c.bezierCurveTo(-20, -58, 20, -58, 40, -46)
  c.bezierCurveTo(54, -16, 58, 16, 50, 40)
  const tips = [[38, 62], [10, 70], [-18, 66], [-42, 56]]
  tips.forEach(([tx, ty], i) => {
    const w = sine(wv + i * 1.7) * 6
    c.quadraticCurveTo(tx + 14, ty - 20, tx + w, ty + sine(wv + i * 2.3) * 5)
    c.quadraticCurveTo(tx - 12 + w * .5, ty - 14, i === tips.length - 1 ? -50 : tips[i + 1][0] + 10, 34)
  })
  c.bezierCurveTo(-56, 12, -52, -18, -40, -46); c.closePath()
}

function draw(ctx, st) {
  const pose = st.pose || 'idle'
  const P = POSE[pose] || POSE.idle
  const wv = (st.phase || 0) * TAU
  const grasp = pose === 'grasp'

  ctx.save()
  ctx.translate(0, FEET); ctx.rotate(P.lean); ctx.translate(0, -FEET)

  // ground mist under the wisps — part of the art, not the world shadow
  ell(ctx, 0, 58, 52, 14, 0, rgba(PAL.shroud.base, .18))

  // clawed arms behind the body; grasp reaches both forward (+x)
  for (const [i, [ax, ay]] of P.arms.entries()) {
    const back = i === 0
    const reach = grasp ? (back ? .5 : 1) : 0
    limb(ctx, back ? -30 : 30, -30, ax, ay, 13, PAL.shroudDark, back ? -44 : 44, -18 + reach * 8)
    const claws = 2 + P.claw
    ctx.strokeStyle = PAL.wisp.base; ctx.lineWidth = lw(1.3); ctx.lineCap = 'round'
    for (let cix = -1; cix <= 1; cix++) {
      ctx.beginPath()
      ctx.moveTo(ax, ay + 2)
      ctx.lineTo(ax + (grasp ? 14 : 4) + cix * (grasp ? 3 : 6), ay + 8 * claws + cix * 2)
      ctx.stroke()
    }
    ell(ctx, ax, ay, 9, 9, 0, PAL.shroud.base)
  }

  // shrouded body dissolving into the ribbon hem
  part(ctx, hemPath(wv), PAL.shroud, [0, 0], { off: [-6, -8], sc: .95, lights: [[-26, -30, 13, 22, -.2]] })
  // translucent wisp tips over the hem
  ctx.globalAlpha *= .55
  for (const [tx, ty, i] of [[38, 62, 0], [10, 70, 1], [-18, 66, 2], [-42, 56, 3]]) {
    ell(ctx, tx + sine(wv + i * 1.7) * 6, ty + sine(wv + i * 2.3) * 5, 7, 9, .2, rgba(PAL.wisp.base, .8))
  }
  ctx.globalAlpha /= .55

  // hood + hollow face + ghost-fire eyes
  part(ctx, HOOD, PAL.shroudDark, [2, -92], { off: [-6, -7], sc: .95, lights: [[-22, -122, 16, 10, -.4]] })
  part(ctx, FACE, PAL.voidFace, [4, -78], { off: [-2, -3], sc: .94, ol: .7 })
  for (const ex of [-6, 24]) {
    glow(ctx, ex, -80, 22 * P.eye, '#4dffb8', grasp ? .6 : .35)
    ell(ctx, ex, -80, 6.5 * P.eye, 8.5 * P.eye, 0, '#8affd8')
    ell(ctx, ex - 1.5, -82, 2.4 * P.eye, 3 * P.eye, 0, '#eafff5')
  }
  if (fine()) {
    ctx.beginPath(); ctx.moveTo(-2, -60); ctx.quadraticCurveTo(10, -55, 22, -61)
    ctx.strokeStyle = '#8affd8'; ctx.lineWidth = lw(1.2); ctx.lineCap = 'round'; ctx.stroke()
  }

  // orbiting grave-dust motes — baked per frame via the phase
  for (let i = 0; i < 3; i++) {
    const a = wv + i * TAU / 3 + (grasp ? .9 : 0)
    ell(ctx, Math.cos(a) * 58, -20 + Math.sin(a) * 34, 3.2, 3.2, 0, rgba('#b8ffe0', .4))
  }
  ctx.restore()
}

export const wraith = {
  id: 'wraith', baseR: 13, scale: VISUAL_SCALE, surface: 64, feetY: FEET, shadowRx: 56, floats: true, gait: 1.1,
  frames: [['idle', { pose: 'idle' }], ...moveFrames(), ['grasp', { pose: 'grasp' }]],
  frameKey: st => st.swing >= 0 ? 'grasp' : st.moving ? `move${frameIndex(st.walkT || 0, 1.1)}` : 'idle',
  draw,
}
