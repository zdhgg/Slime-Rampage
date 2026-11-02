/* Archer — feathered brown cap, amber scarf, orange-brown jerkin, back quiver and a big recurve bow in front. Faces +x. */
import { TAU, ell } from '../slime-art/slime-painter.js'
import { ENEMY_PAL as PAL, shiftPts, limb, part, brow, moveFrames, frameIndex } from './enemy-kit.js'

const FEET = 92
const BOOT = [[-16, 58], [16, 58], [18, 76], [34, 84], [30, 96], [-16, 96], [-21, 78]]
const TUNIC = [[-44, -40], [0, -46], [44, -40], [52, 0], [54, 62], [0, 72], [-54, 62], [-52, 0]]
const CAP = [[-62, -108], [-54, -148], [-12, -168], [38, -152], [62, -120], [40, -112], [0, -122], [-40, -112]]
const BILL = [[28, -122], [88, -114], [72, -102], [26, -108]]
const FEATHER = [[-30, -158], [-76, -198], [-50, -210], [-8, -172]]
const QUIVER = [[-90, -58], [-62, -72], [-30, 8], [-62, 20]]

const POSE = {
  idle: { lean: 0, hand: [86, 8], bow: [100, 8, .28], draw: 0 },
  move: { lean: .04, hand: [86, 8], bow: [100, 8, .28], draw: 0 },
  draw: { lean: -.05, hand: [106, -60], bow: [110, -60, 0], draw: 1 },
  release: { lean: .05, hand: [108, -60], bow: [114, -60, -.04], draw: 2 },
}

/** Recurve bow in its own space: grip at the origin, belly toward +x, string on the archer side. */
function bow(ctx, bx, by, rot, draw) {
  ctx.save(); ctx.translate(bx, by); ctx.rotate(rot)
  const stringLine = () => {
    ctx.beginPath(); ctx.moveTo(0, -96)
    if (draw === 1) ctx.lineTo(-68, 0)
    else if (draw === 2) ctx.quadraticCurveTo(10, 0, 0, 0)
    ctx.lineTo(0, 96)
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  stringLine(); ctx.strokeStyle = PAL.string; ctx.lineWidth = 6; ctx.stroke()
  limb(ctx, 0, -96, 0, 96, 13, PAL.wood, 62, 0)
  part(ctx, c => ell(c, 0, 0, 12, 22, 0), PAL.leather, [0, 0], { off: [-2, -3], sc: .85 })
  ctx.restore()
}

function draw(ctx, st) {
  const pose = st.pose || 'idle'
  const P = POSE[pose] || POSE.idle
  const ph = (st.phase || 0) * TAU
  const mv = pose === 'move'
  const spread = mv ? Math.cos(ph) : 0
  const liftF = mv ? Math.max(0, Math.sin(ph)) : 0
  const liftB = mv ? Math.max(0, -Math.sin(ph)) : 0

  ctx.save()
  ctx.translate(0, FEET); ctx.rotate(P.lean); ctx.translate(0, -FEET)

  // quiver on the back, fletchings poking over the shoulder
  for (const [x, y] of [[-78, -78], [-64, -86], [-50, -80]]) part(ctx, [[x - 6, y + 12], [x, y - 8], [x + 8, y + 12]], PAL.cream, [x, y], { off: [-1, -2], sc: .8, ol: .7 })
  part(ctx, QUIVER, PAL.leather, [-60, -26], { off: [-3, -4], sc: .9 })

  for (const [x, lift, dir] of [[-26, liftB, -1], [26, liftF, 1]]) {
    const dx = x + dir * spread * 16, dy = -lift * 13
    part(ctx, shiftPts(BOOT, dx, dy), PAL.cap, [dx + 4, 78 + dy], { off: [-3, -4], sc: .9 })
  }

  part(ctx, TUNIC, PAL.tunic, [0, 12], { lights: [[-24, -8, 14, 24, -.2]] })
  // cross strap and belt
  part(ctx, [[-34, -40], [-14, -42], [40, 44], [20, 48]], PAL.cap, [2, 2], { off: [-2, -3], sc: .92 })
  part(ctx, [[-52, 28], [0, 34], [52, 28], [54, 44], [0, 50], [-54, 44]], PAL.cap, [0, 39], { off: [-2, -3], sc: .94 })
  part(ctx, c => ell(c, 0, 40, 9, 8, 0), PAL.gold, [0, 40], { off: [-1.5, -1.5], sc: .85 })
  part(ctx, c => ell(c, 0, -46, 40, 14, 0), PAL.amber, [0, -46], { off: [-3, -3], sc: .9 })

  // pulling arm sits behind the head; its hand is drawn on the cheek afterwards
  if (P.draw === 1) limb(ctx, -48, -30, 14, -66, 22, PAL.tunic)
  else if (P.draw === 2) limb(ctx, -48, -30, -20, -10, 22, PAL.tunic)
  else limb(ctx, -48, -30, -66, 14, 22, PAL.tunic)
  if (!P.draw) part(ctx, c => ell(c, -68, 20, 12, 12, 0), PAL.skin, [-68, 20], { off: [-2, -2], sc: .85 })

  // head: skin, cap with bill and feather, hostile face
  part(ctx, [[22, -178], [-14, -196], [-52, -178]], PAL.amber, [-14, -184], { off: [-2, -3], sc: .85 })
  part(ctx, FEATHER, PAL.amber, [-40, -182], { off: [-3, -4], sc: .88 })
  part(ctx, c => ell(c, 0, -96, 60, 54, 0), PAL.skin, [0, -96], { off: [-5, -6], sc: .94, lights: [[-20, -120, 20, 9, -.3]] })
  for (const ex of [-8, 30]) {
    ell(ctx, ex, -84, 8, 10.5, 0, PAL.eyeInk)
    ell(ctx, ex - 2.4, -88, 3, 3.6, 0, '#fff')
  }
  brow(ctx, -24, -104, 2, -94, PAL.skin.line)
  brow(ctx, 22, -94, 46, -104, PAL.skin.line)
  part(ctx, CAP, PAL.cap, [2, -134], { off: [-5, -6], sc: .94, lights: [[-26, -148, 20, 9, -.4]] })
  part(ctx, BILL, PAL.cap, [56, -112], { off: [-2, -3], sc: .88 })

  // front arm, bow and (while drawing) the nocked arrow
  const [hx, hy] = P.hand
  limb(ctx, 50, -30, hx - 6, hy, 22, PAL.tunic)
  bow(ctx, P.bow[0], P.bow[1], P.bow[2], P.draw)
  if (P.draw === 1) {
    limb(ctx, 4, -62, 196, -62, 7, PAL.leather)
    part(ctx, [[196, -76], [226, -62], [196, -48]], PAL.steel, [206, -62], { off: [-2, -2], sc: .85 })
    part(ctx, [[-4, -76], [14, -70], [14, -54], [-4, -48]], PAL.cream, [4, -62], { off: [-1, -1], sc: .85 })
    part(ctx, c => ell(c, 12, -62, 13, 13, 0), PAL.skin, [12, -62], { off: [-2, -2], sc: .85 })
  }
  part(ctx, c => ell(c, hx + 2, hy, 13, 13, 0), PAL.skin, [hx + 2, hy], { off: [-2, -2], sc: .85 })
  ctx.restore()
}

export const archer = {
  id: 'archer', baseR: 13, scale: 1.18, surface: 80, feetY: FEET, shadowRx: 76,
  frames: [['idle', { pose: 'idle' }], ...moveFrames(), ['draw', { pose: 'draw' }], ['release', { pose: 'release' }]],
  frameKey: st => st.casting === 'fire' ? 'release' : st.casting ? 'draw' : st.moving ? `move${frameIndex(st.walkT || 0)}` : 'idle',
  draw,
}
