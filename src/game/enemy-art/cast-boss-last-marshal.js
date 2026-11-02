/* Last Marshal — slate field uniform with big gold epaulettes, a tall-plumed
 * marshal hat, a tattered war banner strapped to his back, and a long dark
 * longbow. Windup draws the string, strike looses it. */
import { TAU, lw, fine, ell, openMouth } from '../slime-art/slime-painter.js'
import { BOSS_PAL as PAL, ENEMY_PAL, shiftPts, limb, part, brow, emblem, bossFrames, bossFrameKey, rageEyes, rageBrow, embers, sweat, shockLines } from './boss-kit.js'

const FEET = 92
const HEAD = [0, -102, 58, 54]
const TUNIC = [[-48, -44], [0, -50], [48, -44], [56, 4], [58, 66], [0, 76], [-58, 66], [-56, 4]]
const BOOT = [[-17, 58], [17, 58], [19, 78], [36, 86], [32, 98], [-18, 98], [-23, 80]]
const HAT = [[-52, -108], [-46, -140], [-16, -156], [24, -154], [52, -134], [56, -112], [40, -104], [-40, -102]]
const PLUME = [[-12, -152], [-8, -204], [8, -206], [14, -152]]
const BANNER = [[-8, -188], [-74, -174], [-96, -148], [-70, -140], [-88, -116], [-56, -112], [-66, -88], [-12, -96]]
const FACE = [[-36, -112], [4, -118], [42, -108], [48, -82], [36, -56], [4, -48], [-30, -56], [-40, -82]]

const POSE = {
  idle: { lean: 0, hand: [78, 6], bow: [88, 4, .24], draw: 0, banner: 0 },
  move: { lean: .04, hand: [78, 6], bow: [88, 4, .24], draw: 0, banner: 0 },
  windup: { lean: -.06, hand: [96, -52], bow: [104, -52, 0], draw: 1, banner: -.06 },
  strike: { lean: .06, hand: [98, -52], bow: [108, -52, -.05], draw: 2, banner: .04 },
  recover: { lean: .14, hand: [70, 30], bow: [80, 34, .5], draw: 0, banner: .03 },
  roar: { lean: -.08, hand: [84, -62], bow: [92, -66, -.3], draw: 0, banner: -.1 },
}

/** Tall longbow: grip at the origin, a long even D-curve, string behind. */
function longbow(ctx, bx, by, rot, draw, glowCol) {
  ctx.save(); ctx.translate(bx, by); ctx.rotate(rot)
  const stringLine = () => {
    ctx.beginPath(); ctx.moveTo(0, -150)
    if (draw === 1) ctx.lineTo(-60, -8)
    else if (draw === 2) ctx.quadraticCurveTo(10, -28, 0, -28)
    ctx.lineTo(0, 90)
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  stringLine(); ctx.strokeStyle = glowCol || ENEMY_PAL.string; ctx.lineWidth = 6.5; ctx.stroke()
  limb(ctx, 0, -150, 0, 90, 14, PAL.cmdrBlack, 56, -30)
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

  // tattered war banner on the back: pole over the shoulder, ragged flag flying -x
  ctx.save(); ctx.translate(-34, -60); ctx.rotate(P.banner + (mv ? Math.sin(ph) * .04 : 0))
  limb(ctx, 0, 30, 0, -140, 9, ENEMY_PAL.wood)
  part(ctx, BANNER, PAL.huntScarf, [-48, -136], { off: [-4, -4], sc: .92, lights: [[-52, -160, 12, 8, -.3]] })
  part(ctx, [[-10, -150], [-40, -146], [-40, -120], [-10, -116]], PAL.marshalSlate, [-24, -132], { off: [-2, -2], sc: .9, ol: .8 })
  ctx.restore()

  for (const [x, lift, dir] of [[-26, liftB, -1], [26, liftF, 1]]) {
    const dx = x + dir * spread * 16, dy = -lift * 13
    part(ctx, shiftPts(BOOT, dx, dy), PAL.cmdrBlack, [dx + 4, 80 + dy], { off: [-3, -4], sc: .9 })
  }

  // slate tunic, gold cross-belt + emblem, big fringed epaulettes
  part(ctx, TUNIC, PAL.marshalSlate, [0, 12], { lights: [[-26, -8, 15, 26, -.2]] })
  part(ctx, [[-34, -40], [-14, -42], [40, 44], [20, 48]], ENEMY_PAL.gold, [2, 2], { off: [-2, -3], sc: .92 })
  part(ctx, [[-52, 28], [0, 34], [52, 28], [54, 44], [0, 50], [-54, 44]], PAL.cmdrBlack, [0, 39], { off: [-2, -3], sc: .94 })
  emblem(ctx, -6, -12, 13) // 王国金徽：人类阵营共通印记
  for (const sx of [-1, 1]) {
    part(ctx, c => ell(c, sx * 56, -38, 30, 18, 0), ENEMY_PAL.gold, [sx * 56, -38], { off: [-4, -5], spec: [sx * 56 - 8, -44, -.4, 1, .8] })
    ctx.strokeStyle = ENEMY_PAL.gold.base; ctx.lineWidth = 4; ctx.lineCap = 'round'
    for (let f = 0; f < 4; f++) { ctx.beginPath(); ctx.moveTo(sx * (42 + f * 9), -30); ctx.lineTo(sx * (42 + f * 9), -16); ctx.stroke() }
  }

  // pulling arm sits behind the head; the hand lands on the cheek while drawing
  if (P.draw === 1) limb(ctx, -46, -32, 16, -66, 23, PAL.marshalSlate)
  else if (P.draw === 2) limb(ctx, -46, -32, -16, -12, 23, PAL.marshalSlate)
  else limb(ctx, -46, -32, -62, 12, 23, PAL.marshalSlate)
  if (!P.draw) part(ctx, c => ell(c, -64, 18, 12, 12, 0), ENEMY_PAL.skin, [-64, 18], { off: [-2, -2], sc: .85 })

  // head: skin face, marshal hat with gold band and tall dark plume
  part(ctx, c => ell(c, HEAD[0], HEAD[1], HEAD[2], HEAD[3], 0), ENEMY_PAL.skin, [0, -102], { off: [-5, -6], sc: .94, lights: [[-20, -126, 20, 9, -.3]] })
  part(ctx, FACE, ENEMY_PAL.skin, [2, -82], { off: [-3, -4], sc: .94, ol: .8 })
  part(ctx, PLUME, PAL.cmdrBlack, [2, -180], { off: [-3, -4], sc: .92 })
  part(ctx, HAT, PAL.marshalSlate, [0, -128], { off: [-5, -6], sc: .94, lights: [[-24, -146, 20, 9, -.4]], spec: [-26, -152, -.4, 1.6, .9] })
  part(ctx, [[-48, -116], [48, -116], [50, -104], [-50, -104]], ENEMY_PAL.gold, [0, -110], { off: [-2, -2], sc: .9 })
  part(ctx, [[28, -112], [80, -104], [64, -94], [24, -102]], PAL.marshalSlate, [52, -102], { off: [-2, -2], sc: .88 })

  if (rage) rageEyes(ctx, -12, -82, 40, 1.05)
  else for (const ex of [-12, 28]) {
    ell(ctx, ex, -82, 8.5, 11, 0, ENEMY_PAL.eyeInk)
    ell(ctx, ex - 2.6, -86, 3.2, 3.8, 0, '#fff')
  }
  const brows = rage ? rageBrow : brow
  brows(ctx, -28, -106, -2, -96, ENEMY_PAL.skin.line)
  brows(ctx, 22, -96, 44, -106, ENEMY_PAL.skin.line)
  if (pose === 'recover') {
    openMouth(ctx, 6, -50, 20, 13, { line: ENEMY_PAL.skin.line })
    sweat(ctx, 46, -108, 1)
  } else if (pose === 'roar') {
    openMouth(ctx, 8, -52, 24, 22, { line: ENEMY_PAL.skin.line })
    shockLines(ctx, 0, -106, 78, 106)
  } else if (fine()) {
    ctx.beginPath(); ctx.moveTo(0, -52); ctx.quadraticCurveTo(12, -58, 26, -52)
    ctx.strokeStyle = ENEMY_PAL.skin.line; ctx.lineWidth = lw(1.4); ctx.lineCap = 'round'; ctx.stroke()
  }

  // front arm + the longbow; arrow only while drawn
  const [hx, hy] = P.hand
  limb(ctx, 50, -32, hx - 6, hy, 23, PAL.marshalSlate)
  longbow(ctx, P.bow[0], P.bow[1], P.bow[2], P.draw, rage ? '#ff8a5a' : null)
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

export const lastMarshal = {
  id: 'boss:last_marshal', baseR: 34, scale: 1.18, surface: 226, feetY: FEET, shadowRx: 82,
  gait: .8, unique: true, motionMul: 2.2, topY: -212,
  frames: bossFrames(),
  frameKey: st => bossFrameKey(st, .8),
  draw,
}
