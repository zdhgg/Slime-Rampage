/* Hunt Captain — tan leather ranger with a white fur collar and a crimson
 * scarf; a high ponytail, a hunting horn on the belt and an oversized recurve
 * bow that out-measures her. Windup draws the string, strike looses it. */
import { TAU, lw, olPx, fine, ell, glow, openMouth } from '../slime-art/slime-painter.js'
import { BOSS_PAL as PAL, ENEMY_PAL, shiftPts, limb, part, brow, bossFrames, bossFrameKey, rageEyes, rageBrow, embers, sweat, shockLines } from './boss-kit.js'

const FEET = 92
const HEAD = [0, -100, 58, 54]
const TUNIC = [[-48, -44], [0, -50], [48, -44], [56, 4], [58, 66], [0, 76], [-58, 66], [-56, 4]]
const BOOT = [[-17, 58], [17, 58], [19, 78], [36, 86], [32, 98], [-18, 98], [-23, 80]]
const HAIR = [[-48, -108], [-42, -150], [-12, -170], [22, -168], [48, -148], [54, -112], [46, -100], [42, -108], [-42, -100]]
const PONYTAIL = [[-10, -160], [-46, -198], [-30, -204], [-2, -172], [-24, -150], [-64, -120], [-74, -96], [-44, -108]]
const SCARF = [[-16, -64], [-64, -58], [-110, -28], [-64, -30], [-28, -40]]
const HORN = [[-44, 26], [-72, 40], [-64, 52], [-40, 40]]

const POSE = {
  idle: { lean: 0, hand: [78, 6], bow: [88, 6, .22], draw: 0, scarf: 0 },
  move: { lean: .04, hand: [78, 6], bow: [88, 6, .22], draw: 0, scarf: 0 },
  windup: { lean: -.06, hand: [96, -50], bow: [104, -50, 0], draw: 1, scarf: -.1 },
  // the loose lunges the whole bow arm forward — a clearly bigger reach than the draw
  strike: { lean: .13, hand: [114, -42], bow: [128, -38, -.14], draw: 2, scarf: .05 },
  recover: { lean: .14, hand: [70, 30], bow: [80, 34, .5], draw: 0, scarf: .1 },
  roar: { lean: -.08, hand: [84, -62], bow: [92, -66, -.3], draw: 0, scarf: -.12 },
}

/** Oversized recurve bow: grip at the origin, belly toward +x, string behind. */
function bow(ctx, bx, by, rot, draw, glowCol) {
  ctx.save(); ctx.translate(bx, by); ctx.rotate(rot)
  const stringLine = () => {
    ctx.beginPath(); ctx.moveTo(0, -158)
    if (draw === 1) ctx.lineTo(-64, -10)
    else if (draw === 2) ctx.quadraticCurveTo(10, -30, 0, -30)
    ctx.lineTo(0, 92)
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  stringLine(); ctx.strokeStyle = glowCol || ENEMY_PAL.string; ctx.lineWidth = 6.5; ctx.stroke()
  limb(ctx, 0, -158, 0, 92, 15, PAL.huntLeather, 66, -34)
  // recurve tips kick back toward the archer
  limb(ctx, 0, -158, -22, -184, 11, PAL.huntLeather)
  limb(ctx, 0, 92, -20, 114, 11, PAL.huntLeather)
  part(ctx, c => ell(c, 0, -30, 13, 26, 0), ENEMY_PAL.leather, [0, -30], { off: [-2, -3], sc: .85 })
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

  // scarf tail and ponytail stream behind (-x); they lead the silhouette
  ctx.save(); ctx.rotate(P.scarf)
  part(ctx, SCARF, PAL.huntScarf, [-52, -44], { off: [-4, -4], sc: .92 })
  ctx.restore()
  part(ctx, PONYTAIL, ENEMY_PAL.cap, [-30, -150], { off: [-4, -4], sc: .9 })

  for (const [x, lift, dir] of [[-26, liftB, -1], [26, liftF, 1]]) {
    const dx = x + dir * spread * 16, dy = -lift * 13
    part(ctx, shiftPts(BOOT, dx, dy), PAL.huntLeather, [dx + 4, 80 + dy], { off: [-3, -4], sc: .9 })
  }

  part(ctx, TUNIC, PAL.huntLeather, [0, 12], { lights: [[-26, -8, 15, 26, -.2]] })
  // white fur collar: big soft ring at the neck, scalloped front tufts
  part(ctx, c => ell(c, 0, -50, 50, 24, 0), PAL.huntFur, [0, -50], { off: [-4, -4], sc: .92, lights: [[-24, -62, 18, 7, -.2]] })
  part(ctx, [[-30, -44], [-18, -34], [-8, -46], [4, -34], [14, -46], [26, -36], [34, -46], [30, -60], [-28, -60]], PAL.huntFur, [0, -44], { off: [-2, -3], sc: .9 })
  // crimson scarf knot at the throat
  part(ctx, c => ell(c, -16, -48, 14, 12, 0), PAL.huntScarf, [-16, -48], { off: [-2, -2], sc: .88 })
  // belt + hunting horn on the hip
  part(ctx, [[-52, 28], [0, 34], [52, 28], [54, 44], [0, 50], [-54, 44]], ENEMY_PAL.cap, [0, 39], { off: [-2, -3], sc: .94 })
  part(ctx, HORN, ENEMY_PAL.cream, [-56, 39], { off: [-2, -2], sc: .88 })

  // pulling arm sits behind the head; the hand lands on the cheek while drawing
  if (P.draw === 1) limb(ctx, -46, -32, 16, -66, 23, PAL.huntLeather)
  else if (P.draw === 2) limb(ctx, -46, -32, -16, -12, 23, PAL.huntLeather)
  else limb(ctx, -46, -32, -62, 12, 23, PAL.huntLeather)
  if (!P.draw) part(ctx, c => ell(c, -64, 18, 12, 12, 0), ENEMY_PAL.skin, [-64, 18], { off: [-2, -2], sc: .85 })

  // head: hair cap, skin face, hostile brows and eyes
  part(ctx, c => ell(c, HEAD[0], HEAD[1], HEAD[2], HEAD[3], 0), ENEMY_PAL.skin, [0, -100], { off: [-5, -6], sc: .94, lights: [[-20, -124, 20, 9, -.3]] })
  part(ctx, HAIR, ENEMY_PAL.cap, [2, -132], { off: [-5, -6], sc: .94, lights: [[-24, -152, 18, 9, -.4]] })
  if (rage) rageEyes(ctx, -10, -86, 40, 1.05)
  else for (const ex of [-10, 30]) {
    ell(ctx, ex, -86, 8, 10.5, 0, ENEMY_PAL.eyeInk)
    ell(ctx, ex - 2.4, -90, 3, 3.6, 0, '#fff')
  }
  const brows = rage ? rageBrow : brow
  brows(ctx, -26, -106, 0, -96, ENEMY_PAL.skin.line)
  brows(ctx, 24, -96, 46, -106, ENEMY_PAL.skin.line)
  if (pose === 'recover') {
    openMouth(ctx, 8, -58, 20, 13, { line: ENEMY_PAL.skin.line })
    sweat(ctx, 48, -112, 1)
  } else if (pose === 'roar') {
    openMouth(ctx, 8, -60, 24, 22, { line: ENEMY_PAL.skin.line })
    shockLines(ctx, 0, -104, 80, 108)
  } else if (fine()) {
    ctx.beginPath(); ctx.moveTo(0, -60); ctx.quadraticCurveTo(14, -66, 28, -60)
    ctx.strokeStyle = ENEMY_PAL.skin.line; ctx.lineWidth = lw(1.4); ctx.lineCap = 'round'; ctx.stroke()
  }

  // front arm + the oversized bow; arrow only while drawn
  const [hx, hy] = P.hand
  limb(ctx, 50, -32, hx - 6, hy, 23, PAL.huntLeather)
  bow(ctx, P.bow[0], P.bow[1], P.bow[2], P.draw, rage ? '#ff8a5a' : null)
  if (P.draw === 1) {
    limb(ctx, 4, -62, 190, -62, 7, ENEMY_PAL.leather)
    part(ctx, [[190, -76], [220, -62], [190, -48]], ENEMY_PAL.steel, [200, -62], { off: [-2, -2], sc: .85 })
    part(ctx, [[-4, -76], [14, -70], [14, -54], [-4, -48]], ENEMY_PAL.cream, [4, -62], { off: [-1, -1], sc: .85 })
    part(ctx, c => ell(c, 12, -62, 13, 13, 0), ENEMY_PAL.skin, [12, -62], { off: [-2, -2], sc: .85 })
  } else if (P.draw === 2) {
    // the loosed arrow streaks just ahead of the bow — the release reads at a glance
    limb(ctx, 140, -52, 205, -52, 7, ENEMY_PAL.leather)
    part(ctx, [[205, -64], [228, -52], [205, -40]], ENEMY_PAL.steel, [214, -52], { off: [-2, -2], sc: .85 })
    part(ctx, [[132, -62], [150, -56], [150, -48], [132, -44]], ENEMY_PAL.cream, [140, -52], { off: [-1, -1], sc: .85 })
  }
  part(ctx, c => ell(c, hx + 2, hy, 13, 13, 0), ENEMY_PAL.skin, [hx + 2, hy], { off: [-2, -2], sc: .85 })

  if (rage) embers(ctx, [[-70, -80, 1], [50, -140, 1.1], [-20, -30, .8]])

  ctx.restore()
}

export const huntCaptain = {
  id: 'boss:hunt_captain', baseR: 34, scale: 1.18, surface: 221, feetY: FEET, shadowRx: 82,
  gait: .8, unique: true, motionMul: 2.2, topY: -204,
  frames: bossFrames(),
  frameKey: st => bossFrameKey(st, .8),
  draw,
}
