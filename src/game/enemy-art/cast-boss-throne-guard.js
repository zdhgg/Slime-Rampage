/* Throne Guard — plum plate with a tall white helm crest; his halberd towers
 * over him, spear tip above a crescent axe blade. Windup pulls the blade back
 * high, strike sweeps it down-forward in a long arc. */
import { TAU, lw, olPx, fine, ell, openMouth } from '../slime-art/slime-painter.js'
import { BOSS_PAL as PAL, ENEMY_PAL, shiftPts, limb, part, brow, emblem, bossFrames, bossFrameKey, rageEyes, rageBrow, embers, sweat, shockLines, hotEdge } from './boss-kit.js'

const FEET = 95
const BODY = [[-54, -48], [0, -56], [54, -48], [62, 4], [64, 68], [0, 80], [-64, 68], [-62, 4]]
const HEAD = [0, -112, 62, 56]
const FACE = [[-38, -124], [4, -130], [44, -120], [50, -90], [40, -58], [4, -50], [-34, -60], [-44, -92]]
const HELM = [[-52, -102], [-48, -148], [-20, -174], [16, -176], [46, -154], [54, -114], [52, -94], [44, -84], [-44, -84], [-54, -94]]
const CREST = [[-10, -170], [-4, -232], [10, -234], [16, -172], [8, -166]]
const BOOT = [[-19, 58], [19, 58], [21, 78], [40, 86], [35, 98], [-20, 98], [-26, 80]]

const POSE = {
  idle: { lean: 0, halberd: [66, -4, .06], head: 0 },
  move: { lean: .03, halberd: [66, -4, .06], head: 0 },
  windup: { lean: -.09, halberd: [44, -44, -.5], head: -.02 },
  strike: { lean: .1, halberd: [50, -34, .8], head: 0 },
  recover: { lean: .16, halberd: [70, 16, .38], head: .06 },
  roar: { lean: -.08, halberd: [50, -16, -.2], head: -.05 },
}

/** Halberd taller than the wielder: grip at the origin, spear tip and crescent
 *  axe blade crowning a long shaft. */
function halberd(ctx, rage, hot) {
  limb(ctx, 0, 70, 0, -196, 12, PAL.cmdrBlack)
  part(ctx, [[-8, 52], [8, 52], [8, 66], [-8, 66]], ENEMY_PAL.gold, [0, 59], { off: [-1.5, -2], sc: .85 })
  // crescent axe blade sweeping toward +x
  part(ctx, [[-2, -196], [46, -206], [62, -188], [54, -160], [26, -146], [4, -156], [30, -172], [16, -186], [-2, -184]], ENEMY_PAL.steel, [28, -178], { off: [-3, -3], sc: .9, spec: [44, -196, -.5, 1, .9] })
  // rear hook
  part(ctx, [[2, -190], [-34, -184], [-42, -166], [-14, -172], [4, -176]], ENEMY_PAL.steel, [-18, -178], { off: [-2, -2], sc: .85 })
  // spear tip above the blade
  part(ctx, [[-7, -200], [0, -232], [7, -200]], ENEMY_PAL.steel, [0, -210], { off: [-2, -2], sc: .9 })
  part(ctx, [[-11, -196], [11, -196], [11, -186], [-11, -186]], ENEMY_PAL.gold, [0, -191], { off: [-1.5, -2], sc: .85 })
  if (hot || rage) hotEdge(ctx, 40, -178, hot ? 32 : 30, '#ffb04a', hot ? .7 : .4)
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

  // the halberd goes first: arms and pauldrons overlap the shaft
  const [hx, hy, hrot] = P.halberd
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(hrot)
  halberd(ctx, rage, pose === 'strike')
  ctx.restore()

  for (const [x, lift, dir] of [[-28, liftB, -1], [28, liftF, 1]]) {
    const dx = x + dir * spread * 18, dy = -lift * 14
    part(ctx, shiftPts(BOOT, dx, dy), PAL.cmdrBlack, [dx + 4, 80 + dy], { off: [-3, -4], sc: .9 })
  }

  // plum plate, gold cuirass trim + emblem, belt, pauldrons
  part(ctx, BODY, PAL.thronePlum, [0, 12], { off: [-6, -7], lights: [[-28, -14, 15, 26, -.18]] })
  part(ctx, [[-36, -44], [0, -50], [36, -44], [38, -30], [0, -22], [-38, -30]], ENEMY_PAL.gold, [0, -36], { off: [-2, -3], sc: .94 })
  emblem(ctx, 0, -8, 14) // 王国金徽：人类阵营共通印记
  part(ctx, [[-54, 26], [0, 32], [54, 26], [56, 42], [0, 48], [-56, 42]], ENEMY_PAL.gold, [0, 37], { off: [-2, -3], sc: .94 })
  for (const sx of [-1, 1]) part(ctx, c => ell(c, sx * 58, -38, 28, 25, 0), PAL.thronePlum, [sx * 58, -38], { off: [-4, -5], spec: [sx * 58 - 8, -46, -.4, 1.1, .8] })

  // halberd arm over the shaft
  limb(ctx, 42, -32, hx - 2, hy + 18, 24, PAL.thronePlum)
  part(ctx, c => ell(c, hx - 2, hy + 12, 13, 13, 0), ENEMY_PAL.skin, [hx - 2, hy + 12], { off: [-2, -2], sc: .85 })
  limb(ctx, -42, -30, -56, 6, 22, PAL.thronePlum)
  part(ctx, c => ell(c, -58, 12, 12, 12, 0), ENEMY_PAL.skin, [-58, 12], { off: [-2, -2], sc: .85 })

  // tall white crest behind the helm dome
  part(ctx, CREST, PAL.huntFur, [4, -200], { off: [-3, -4], sc: .92, lights: [[-2, -218, 5, 10, -.2]] })
  part(ctx, HELM, PAL.thronePlum, [0, -130], { off: [-5, -6], sc: .95, lights: [[-26, -160, 20, 11, -.4]], spec: [-28, -166, -.4, 1.6, .9] })
  part(ctx, [[-48, -150], [48, -150], [50, -136], [-50, -136]], ENEMY_PAL.gold, [0, -143], { off: [-2, -2], sc: .9 })
  part(ctx, FACE, ENEMY_PAL.skin, [2, -88], { off: [-4, -5], sc: .94, ol: .8 })
  ctx.beginPath(); ctx.moveTo(-34, -112); ctx.quadraticCurveTo(6, -128, 46, -110)
  ctx.strokeStyle = PAL.thronePlum.line; ctx.lineWidth = lw(olPx() * .9); ctx.lineCap = 'round'; ctx.stroke()

  if (rage) rageEyes(ctx, -16, -88, 42, 1.1)
  else for (const ex of [-16, 26]) {
    ell(ctx, ex, -88, 9, 12, 0, ENEMY_PAL.eyeInk)
    ell(ctx, ex - 2.8, -92, 3.4, 4, 0, '#fff')
  }
  const brows = rage ? rageBrow : brow
  brows(ctx, -32, -112, -6, -100, ENEMY_PAL.skin.line)
  brows(ctx, 20, -100, 42, -112, ENEMY_PAL.skin.line)

  if (pose === 'recover') {
    openMouth(ctx, 4, -50, 22, 14, { line: ENEMY_PAL.skin.line })
    sweat(ctx, 50, -116, 1.1)
  } else if (pose === 'roar') {
    openMouth(ctx, 6, -52, 26, 24, { line: ENEMY_PAL.skin.line })
    shockLines(ctx, -8, -118, 84, 112)
  } else if (fine()) {
    ctx.beginPath(); ctx.moveTo(-6, -54); ctx.quadraticCurveTo(8, -60, 24, -54)
    ctx.strokeStyle = ENEMY_PAL.skin.line; ctx.lineWidth = lw(1.5); ctx.lineCap = 'round'; ctx.stroke()
  }

  if (rage) embers(ctx, [[-56, -70, 1], [60, -108, 1.2], [-26, -170, .9]])

  ctx.restore()
}

export const throneGuard = {
  id: 'boss:throne_guard', baseR: 36, scale: 1.12, surface: 226, feetY: FEET, shadowRx: 100,
  gait: .8, unique: true, motionMul: 2.2, topY: -230,
  frames: bossFrames(),
  frameKey: st => bossFrameKey(st, .8),
  draw,
}
