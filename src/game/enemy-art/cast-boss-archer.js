/* Bow King — the generic boss-archer: orange royal huntsman kit, brown cap
 * with a very long feather, a golden longbow and a back quiver. Windup draws
 * the string, strike looses it. */
import { TAU, lw, fine, ell, openMouth } from '../slime-art/slime-painter.js'
import { BOSS_PAL as PAL, ENEMY_PAL, shiftPts, limb, part, brow, bossFrames, bossFrameKey, rageEyes, rageBrow, embers, sweat, shockLines } from './boss-kit.js'

const FEET = 92
const HEAD = [0, -100, 58, 54]
const TUNIC = [[-48, -44], [0, -50], [48, -44], [56, 4], [58, 66], [0, 76], [-58, 66], [-56, 4]]
const BOOT = [[-17, 58], [17, 58], [19, 78], [36, 86], [32, 98], [-18, 98], [-23, 80]]
const CAP = [[-56, -106], [-48, -146], [-10, -164], [36, -148], [56, -118], [36, -110], [0, -120], [-36, -110]]
const BILL = [[26, -118], [80, -108], [64, -96], [22, -104]]
const FEATHER = [[-26, -152], [-92, -196], [-58, -212], [-6, -172]]
const QUIVER = [[-92, -60], [-64, -74], [-32, 6], [-64, 20]]

const POSE = {
  idle: { lean: 0, hand: [80, 6], bow: [92, 6, .24], draw: 0 },
  move: { lean: .04, hand: [80, 6], bow: [92, 6, .24], draw: 0 },
  windup: { lean: -.06, hand: [98, -52], bow: [106, -52, 0], draw: 1 },
  strike: { lean: .06, hand: [100, -52], bow: [110, -52, -.05], draw: 2 },
  recover: { lean: .14, hand: [72, 30], bow: [82, 34, .5], draw: 0 },
  roar: { lean: -.08, hand: [86, -62], bow: [94, -66, -.3], draw: 0 },
}

/** Golden longbow: grip at the origin, a long even D-curve, string behind. */
function goldbow(ctx, bx, by, rot, draw, glowCol) {
  ctx.save(); ctx.translate(bx, by); ctx.rotate(rot)
  const stringLine = () => {
    ctx.beginPath(); ctx.moveTo(0, -146)
    if (draw === 1) ctx.lineTo(-60, -8)
    else if (draw === 2) ctx.quadraticCurveTo(10, -28, 0, -28)
    ctx.lineTo(0, 88)
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  stringLine(); ctx.strokeStyle = glowCol || ENEMY_PAL.string; ctx.lineWidth = 6.5; ctx.stroke()
  limb(ctx, 0, -146, 0, 88, 15, ENEMY_PAL.gold, 54, -28)
  part(ctx, c => ell(c, 0, -28, 12, 24, 0), ENEMY_PAL.leather, [0, -28], { off: [-2, -3], sc: .85 })
  ctx.restore()
}

function draw(ctx, st) {
  const pose = st.pose || 'idle'
  const P = POSE[pose] || POSE.idle
  const ph = (st.phase || 0) * TAU
  const mv = pose === 'move'
  const rage = !!st.rage
  const spread = mv ? Math.cos(ph) : 0
  const liftF = mv ? Math.max(0, Math.sin(ph)) : 0
  const liftB = mv ? Math.max(0, -Math.sin(ph)) : 0

  ctx.save()
  ctx.translate(0, FEET); ctx.rotate(P.lean); ctx.translate(0, -FEET)

  // quiver on the back, gold fletchings poking over the shoulder
  for (const [x, y] of [[-80, -80], [-66, -88], [-52, -82]]) part(ctx, [[x - 6, y + 12], [x, y - 8], [x + 8, y + 12]], ENEMY_PAL.gold, [x, y], { off: [-1, -2], sc: .8, ol: .7 })
  part(ctx, QUIVER, ENEMY_PAL.leather, [-62, -28], { off: [-3, -4], sc: .9 })

  for (const [x, lift, dir] of [[-26, liftB, -1], [26, liftF, 1]]) {
    const dx = x + dir * spread * 16, dy = -lift * 13
    part(ctx, shiftPts(BOOT, dx, dy), ENEMY_PAL.cap, [dx + 4, 80 + dy], { off: [-3, -4], sc: .9 })
  }

  part(ctx, TUNIC, PAL.archerOrange, [0, 12], { lights: [[-26, -8, 15, 26, -.2]] })
  // gold cross strap and belt, gold collar
  part(ctx, [[-34, -40], [-14, -42], [40, 44], [20, 48]], ENEMY_PAL.gold, [2, 2], { off: [-2, -3], sc: .92 })
  part(ctx, [[-52, 28], [0, 34], [52, 28], [54, 44], [0, 50], [-54, 44]], ENEMY_PAL.cap, [0, 39], { off: [-2, -3], sc: .94 })
  part(ctx, c => ell(c, 0, 40, 9, 8, 0), ENEMY_PAL.gold, [0, 40], { off: [-1.5, -1.5], sc: .85 })
  part(ctx, c => ell(c, 0, -46, 40, 14, 0), ENEMY_PAL.gold, [0, -46], { off: [-3, -3], sc: .9 })

  // pulling arm sits behind the head; the hand lands on the cheek while drawing
  if (P.draw === 1) limb(ctx, -46, -32, 16, -66, 23, PAL.archerOrange)
  else if (P.draw === 2) limb(ctx, -46, -32, -16, -12, 23, PAL.archerOrange)
  else limb(ctx, -46, -32, -64, 14, 23, PAL.archerOrange)
  if (!P.draw) part(ctx, c => ell(c, -66, 20, 12, 12, 0), ENEMY_PAL.skin, [-66, 20], { off: [-2, -2], sc: .85 })

  // head: skin face, brown cap with bill and a very long feather
  part(ctx, FEATHER, ENEMY_PAL.gold, [-44, -184], { off: [-3, -4], sc: .9 })
  part(ctx, c => ell(c, HEAD[0], HEAD[1], HEAD[2], HEAD[3], 0), ENEMY_PAL.skin, [0, -100], { off: [-5, -6], sc: .94, lights: [[-20, -124, 20, 9, -.3]] })
  part(ctx, CAP, ENEMY_PAL.cap, [0, -132], { off: [-5, -6], sc: .94, lights: [[-24, -148, 20, 9, -.4]], spec: [-26, -154, -.4, 1.6, .9] })
  part(ctx, BILL, ENEMY_PAL.cap, [50, -106], { off: [-2, -3], sc: .88 })
  part(ctx, [[-44, -118], [44, -118], [46, -106], [-46, -106]], ENEMY_PAL.gold, [0, -112], { off: [-2, -2], sc: .9 })

  if (rage) rageEyes(ctx, -10, -82, 40, 1.05)
  else for (const ex of [-10, 28]) {
    ell(ctx, ex, -82, 8.5, 11, 0, ENEMY_PAL.eyeInk)
    ell(ctx, ex - 2.6, -86, 3.2, 3.8, 0, '#fff')
  }
  const brows = rage ? rageBrow : brow
  brows(ctx, -26, -104, 0, -94, ENEMY_PAL.skin.line)
  brows(ctx, 22, -94, 44, -104, ENEMY_PAL.skin.line)
  if (pose === 'recover') {
    openMouth(ctx, 6, -50, 20, 13, { line: ENEMY_PAL.skin.line })
    sweat(ctx, 46, -106, 1)
  } else if (pose === 'roar') {
    openMouth(ctx, 8, -52, 24, 22, { line: ENEMY_PAL.skin.line })
    shockLines(ctx, 0, -102, 76, 104)
  } else if (fine()) {
    ctx.beginPath(); ctx.moveTo(0, -52); ctx.quadraticCurveTo(12, -58, 26, -52)
    ctx.strokeStyle = ENEMY_PAL.skin.line; ctx.lineWidth = lw(1.4); ctx.lineCap = 'round'; ctx.stroke()
  }

  // front arm + the golden longbow; arrow only while drawn
  const [hx, hy] = P.hand
  limb(ctx, 50, -32, hx - 6, hy, 23, PAL.archerOrange)
  goldbow(ctx, P.bow[0], P.bow[1], P.bow[2], P.draw, rage ? '#ff8a5a' : null)
  if (P.draw === 1) {
    limb(ctx, 4, -62, 190, -62, 7, ENEMY_PAL.leather)
    part(ctx, [[190, -76], [220, -62], [190, -48]], ENEMY_PAL.steel, [200, -62], { off: [-2, -2], sc: .85 })
    part(ctx, [[-4, -76], [14, -70], [14, -54], [-4, -48]], ENEMY_PAL.cream, [4, -62], { off: [-1, -1], sc: .85 })
    part(ctx, c => ell(c, 12, -62, 13, 13, 0), ENEMY_PAL.skin, [12, -62], { off: [-2, -2], sc: .85 })
  }
  part(ctx, c => ell(c, hx + 2, hy, 13, 13, 0), ENEMY_PAL.skin, [hx + 2, hy], { off: [-2, -2], sc: .85 })

  if (rage) embers(ctx, [[-70, -80, 1], [50, -140, 1.1], [-20, -30, .8]])

  ctx.restore()
}

export const bowKing = {
  id: 'boss:archer', baseR: 34, scale: 1.18, surface: 200, feetY: FEET, shadowRx: 82,
  gait: .8, unique: true, motionMul: 2.2, topY: -214,
  frames: bossFrames(),
  frameKey: st => bossFrameKey(st, .8),
  draw,
}
