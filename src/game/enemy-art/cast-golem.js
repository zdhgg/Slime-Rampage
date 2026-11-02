/* Golem — stacked-stone torso with masonry seams, a glowing cyan core in the chest,
 * boulder fists on slab arms, a small carved head with one glowing eye slit, moss on the shoulders.
 * `swing` splits into 'windup' (fist raised, core brightening) and 'slam' (fist down, dust burst). */
import { TAU, lw, olPx, fine, ell, glow, rgba } from '../slime-art/slime-painter.js'
import { ENEMY_PAL as PAL, VISUAL_SCALE, shiftPts, limb, part, moveFrames, frameIndex } from './enemy-kit.js'

const FEET = 90
const TORSO = [[-58, -56], [0, -66], [58, -56], [66, -4], [58, 52], [0, 62], [-58, 52], [-66, -4]]
const SLAB = [[-50, -52], [0, -60], [50, -52], [54, -18], [0, -12], [-54, -18]]
const BELLY = [[-54, -10], [0, -4], [54, -10], [58, 26], [0, 34], [-58, 26]]
const HEAD = [[-30, -96], [30, -96], [26, -62], [0, -56], [-26, -62]]
const LEG = [[-20, 30], [20, 30], [24, 64], [30, 78], [26, 92], [-26, 92], [-30, 78], [-24, 64]]
const FIST = [[-26, -14], [0, -22], [26, -14], [30, 12], [0, 24], [-30, 12]]

const POSE = {
  idle: { armR: [64, -8], fist: [78, 40], armL: [-64, -8], fistL: [-78, 40], core: 1, lean: 0 },
  move: { armR: [64, -8], fist: [78, 40], armL: [-64, -8], fistL: [-78, 40], core: 1, lean: 0 },
  windup: { armR: [58, -58], fist: [72, -96], armL: [-64, -8], fistL: [-78, 44], core: 1.35, lean: -.09 },
  slam: { armR: [82, -10], fist: [104, 42], armL: [-60, -6], fistL: [-72, 48], core: 1.7, lean: .11, dust: 1 },
}

function draw(ctx, st) {
  const pose = st.pose || 'idle'
  const P = POSE[pose] || POSE.idle
  const ph = (st.phase || 0) * TAU
  const mv = pose === 'move'
  const spread = mv ? Math.cos(ph) * .8 : 0
  const liftF = mv ? Math.max(0, Math.sin(ph)) : 0
  const liftB = mv ? Math.max(0, -Math.sin(ph)) : 0

  ctx.save()
  ctx.translate(0, FEET); ctx.rotate(P.lean); ctx.translate(0, -FEET)

  // stone pillar legs — slow heavy stomp
  for (const [x, lift, dir] of [[-28, liftB, -1], [28, liftF, 1]]) {
    const dx = x + dir * spread * 14, dy = -lift * 10
    part(ctx, shiftPts(LEG, dx, dy), PAL.stoneDark, [dx, 60 + dy], { off: [-3, -4], sc: .92 })
  }

  // arms first so fists can overlap the torso edge
  const [ax, ay] = P.armR, [fx, fy] = P.fist, [lx, ly] = P.fistL
  limb(ctx, -52, -34, -66, 18, 30, PAL.stoneDark)
  part(ctx, shiftPts(FIST, lx - 0, ly - 16), PAL.stone, [lx, ly - 4], { off: [-4, -5], sc: .94 })
  limb(ctx, 52, -34, ax, ay, 30, PAL.stoneDark)
  part(ctx, shiftPts(FIST, fx, fy - 16), PAL.stone, [fx, fy - 4], { off: [-4, -5], sc: .94, spec: [fx - 8, fy - 14, -.5, 1.2, .85] })

  // stacked torso slabs + masonry seams + the cyan core
  part(ctx, TORSO, PAL.stoneDark, [0, -2], { off: [-5, -6], sc: .96 })
  part(ctx, SLAB, PAL.stone, [0, -36], { off: [-4, -5], sc: .95, lights: [[-26, -46, 16, 9, -.35]], spec: [-28, -48, -.4, 1.5, .85] })
  part(ctx, BELLY, PAL.stone, [0, 14], { off: [-4, -5], sc: .95 })
  ctx.strokeStyle = rgba(PAL.stoneDark.line, .8); ctx.lineWidth = lw(1.1); ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-56, -14); ctx.lineTo(56, -14)
  ctx.moveTo(-14, -56); ctx.lineTo(-18, -16); ctx.moveTo(18, -56); ctx.lineTo(14, -16)
  ctx.moveTo(-58, 28); ctx.lineTo(58, 28)
  ctx.moveTo(-20, 32); ctx.lineTo(-22, 54); ctx.moveTo(22, 32); ctx.lineTo(20, 54)
  ctx.stroke()
  if (P.core > 1) glow(ctx, 8, -4, 40 * P.core - 20, '#4ad8e8', .55)
  part(ctx, c => ell(c, 8, -4, 17 * P.core, 17 * P.core, 0), PAL.core, [8, -4], { off: [-3, -4], sc: .9, spec: [3, -9, -.6, 1.1, .9] })
  ctx.beginPath(); ctx.arc(8, -4, 23, .3, Math.PI - .3)
  ctx.strokeStyle = P.core > 1 ? '#c8f6ff' : rgba(PAL.core.base, .7); ctx.lineWidth = lw(1.2); ctx.stroke()

  // carved head with a single glowing eye slit
  part(ctx, HEAD, PAL.stoneDark, [0, -76], { off: [-4, -5], sc: .95 })
  if (P.core > 1.2) glow(ctx, 4, -80, 20, '#4ad8e8', .6)
  ell(ctx, 4, -80, 16, 5, 0, P.core > 1.2 ? '#c8f6ff' : PAL.core.base)

  // moss on head and shoulder
  for (const [mx, my, mr] of [[-20, -94, 9], [40, -52, 8], [-48, -30, 7]]) {
    ell(ctx, mx, my, mr, mr * .55, .3, rgba(PAL.moss.base, .85))
  }

  // slam dust burst at the lead fist
  if (P.dust) {
    for (const [dx, dy, dr, a] of [[26, 20, 12, .5], [46, 30, 9, .4], [8, 34, 8, .35], [60, 14, 7, .3]]) {
      ell(ctx, fx + dx - 20, fy + dy - 30, dr, dr * .8, 0, rgba('#c8c0b0', a))
    }
    for (const [cx2, cy2] of [[34, 8], [52, 26], [20, 30]]) {
      part(ctx, [[cx2 - 5, cy2 - 5], [cx2 + 4, cy2 - 6], [cx2 + 6, cy2 + 3], [cx2 - 3, cy2 + 5]], PAL.stoneDark, [cx2 + fx - 20, cy2 + fy - 30], { off: [-1, -1], sc: .8, ol: .6 })
    }
  }
  ctx.restore()
}

export const golem = {
  id: 'golem', baseR: 17, scale: VISUAL_SCALE, surface: 78, feetY: FEET, shadowRx: 96, gait: .8,
  frames: [['idle', { pose: 'idle' }], ...moveFrames(), ['windup', { pose: 'windup' }], ['slam', { pose: 'slam' }]],
  frameKey: st => st.swing >= 0 ? (st.swing < .5 ? 'windup' : 'slam') : st.moving ? `move${frameIndex(st.walkT || 0, .8)}` : 'idle',
  draw,
}
