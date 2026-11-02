/* Court Commander — crimson uniform under a peaked cap, a long streaming cape,
 * a sabre for the strike, and a retinue of small chess pieces orbiting him.
 * He is both the generic expedition boss and the final chapter duelist. */
import { TAU, lw, olPx, fine, ell, openMouth } from '../slime-art/slime-painter.js'
import { BOSS_PAL as PAL, ENEMY_PAL, shiftPts, limb, part, brow, emblem, bossFrames, bossFrameKey, rageEyes, rageBrow, embers, sweat, shockLines, hotEdge } from './boss-kit.js'

const FEET = 95
const BODY = [[-52, -46], [0, -54], [52, -46], [60, 4], [62, 68], [0, 78], [-62, 68], [-60, 4]]
const CAPE = [[-44, -50], [-80, -34], [-148, -6], [-168, 44], [-120, 40], [-138, 78], [-92, 58], [-104, 92], [-58, 64], [-64, 90], [-30, 62], [-20, 40]]
const HEAD = [0, -106, 58, 54]
const FACE = [[-36, -118], [4, -124], [42, -114], [46, -86], [38, -56], [4, -48], [-32, -56], [-42, -86]]
const CAP = [[-54, -104], [-50, -142], [-20, -162], [22, -162], [52, -140], [54, -108], [40, -100], [-40, -98]]
const PEAK = [[30, -118], [92, -110], [74, -96], [26, -104]]
const BOOT = [[-19, 58], [19, 58], [21, 78], [40, 86], [35, 98], [-20, 98], [-26, 80]]

const POSE = {
  idle: { lean: 0, sabre: [70, 4, .35], cape: 0, pieces: 0, hand: [-52, 6] },
  move: { lean: .03, sabre: [70, 4, .35], cape: 0, pieces: 0, hand: [-52, 6] },
  windup: { lean: -.09, sabre: [50, -58, -.55], cape: -.06, pieces: .4, hand: [-56, -18] },
  strike: { lean: .11, sabre: [84, -18, 1.2], cape: .1, pieces: .8, hand: [-46, -6] },
  recover: { lean: .16, sabre: [66, 34, .6], cape: .05, pieces: -.4, hand: [-50, 22] },
  roar: { lean: -.08, sabre: [54, -74, -.7], cape: -.1, pieces: .9, hand: [-58, -30] },
}

/** Officer's sabre: grip at the origin, slim curved blade, gold guard. */
function sabre(ctx, rage, hot) {
  limb(ctx, 0, 14, 0, -8, 12, PAL.cmdrBlack)
  part(ctx, [[-18, -10], [18, -10], [22, 0], [-22, 0]], ENEMY_PAL.gold, [0, -5], { off: [-1.5, -2], sc: .85 })
  const b = c => { c.beginPath(); c.moveTo(-4, -8); c.quadraticCurveTo(10, -66, 26, -116); c.quadraticCurveTo(30, -124, 38, -128); c.quadraticCurveTo(28, -118, 24, -110); c.quadraticCurveTo(8, -64, 4, -8); c.closePath() }
  part(ctx, b, ENEMY_PAL.steel, [12, -66], { off: [-2, -2], sc: .9, spec: [14, -84, -1.2, .7, .9] })
  if (hot || rage) hotEdge(ctx, 20, -80, hot ? 36 : 26, '#ffb04a', hot ? .7 : .4)
}

/** Small floating chess piece: pawn / rook / knight by index, cream with a gold base. */
function chessPiece(ctx, x, y, kind, rage) {
  const col = rage ? PAL.ember : PAL.wardenCream
  const pawn = [[0, -14], [7, -8], [5, 4], [10, 12], [-10, 12], [-5, 4], [-7, -8]]
  const rook = [[-9, -14], [9, -14], [9, -8], [5, -6], [5, 10], [10, 12], [-10, 12], [-5, 10], [-5, -6], [-9, -8]]
  const pony = [[-8, 12], [10, 12], [8, -2], [2, -10], [8, -16], [0, -12], [-6, -16], [-10, -6]]
  part(ctx, [pawn, rook, pony][kind % 3], col, [x, y], { off: [-1.5, -2], sc: .85 })
  part(ctx, [[x - 11, y + 12], [x + 11, y + 12], [x + 11, y + 17], [x - 11, y + 17]], ENEMY_PAL.gold, [x, y + 14], { off: [-1, -1], sc: .8, ol: .7 })
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

  // streaming cape behind the body, hem kicked by the stride
  ctx.save(); ctx.translate(0, -30); ctx.rotate(P.cape + (mv ? Math.sin(ph) * .05 : 0)); ctx.translate(0, 30)
  part(ctx, CAPE, PAL.cmdrCrimson, [-52, 18], { off: [-5, -6], sc: .95, lights: [[-70, -12, 14, 26, -.2]] })
  ctx.restore()

  // orbiting chess retinue: three pieces on a slow ring around the body
  const ring = 118 + P.pieces * 18
  for (let i = 0; i < 3; i++) {
    const a = (mv ? ph * .5 : 0) + i * TAU / 3 + .6
    chessPiece(ctx, Math.cos(a) * ring, -40 + Math.sin(a) * 66 - P.pieces * 30, i, rage)
  }

  for (const [x, lift, dir] of [[-26, liftB, -1], [26, liftF, 1]]) {
    const dx = x + dir * spread * 16, dy = -lift * 13
    part(ctx, shiftPts(BOOT, dx, dy), PAL.cmdrBlack, [dx + 4, 80 + dy], { off: [-3, -4], sc: .9 })
  }

  // crimson uniform, gold aiguillette + emblem, black belt, epaulettes
  part(ctx, BODY, PAL.cmdrCrimson, [0, 12], { off: [-6, -7], lights: [[-26, -14, 14, 26, -.18]] })
  part(ctx, [[-38, -42], [0, -48], [38, -42], [40, -30], [0, -24], [-40, -30]], PAL.cmdrBlack, [0, -36], { off: [-2, -3], sc: .94 })
  emblem(ctx, 0, -6, 13)
  part(ctx, [[-52, 26], [0, 32], [52, 26], [54, 42], [0, 48], [-54, 42]], PAL.cmdrBlack, [0, 37], { off: [-2, -3], sc: .94 })
  for (const sx of [-1, 1]) part(ctx, c => ell(c, sx * 56, -36, 26, 22, 0), ENEMY_PAL.gold, [sx * 56, -36], { off: [-4, -5], spec: [sx * 56 - 8, -44, -.4, 1.1, .8] })

  // sabre arm last-but-one so the blade stays readable over the head
  const [hx, hy, hrot] = P.sabre
  limb(ctx, 42, -32, hx - 4, hy + 10, 22, PAL.cmdrCrimson)
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(hrot)
  sabre(ctx, rage, pose === 'strike')
  ctx.restore()
  part(ctx, c => ell(c, hx, hy + 6, 12, 12, 0), ENEMY_PAL.skin, [hx, hy + 6], { off: [-2, -2], sc: .85 })
  // off arm: white glove holding an invisible reins of the chessboard
  const [ox, oy] = P.hand
  limb(ctx, -42, -30, ox, oy, 20, PAL.cmdrCrimson)
  part(ctx, c => ell(c, ox, oy + 4, 11, 11, 0), PAL.huntFur, [ox, oy + 4], { off: [-2, -2], sc: .85 })

  // peaked cap: black crown, gold band and peak toward +x
  part(ctx, CAP, PAL.cmdrBlack, [0, -128], { off: [-5, -6], sc: .95, lights: [[-26, -152, 20, 10, -.4]], spec: [-28, -158, -.4, 1.5, .9] })
  part(ctx, [[-50, -118], [50, -118], [52, -106], [-52, -106]], ENEMY_PAL.gold, [0, -112], { off: [-2, -2], sc: .9 })
  part(ctx, PEAK, PAL.cmdrBlack, [58, -108], { off: [-2, -2], sc: .88 })
  part(ctx, FACE, ENEMY_PAL.skin, [0, -82], { off: [-4, -5], sc: .94, ol: .8 })

  if (rage) rageEyes(ctx, -14, -80, 40, 1.05)
  else for (const ex of [-14, 26]) {
    ell(ctx, ex, -80, 8.5, 11, 0, ENEMY_PAL.eyeInk)
    ell(ctx, ex - 2.6, -84, 3.2, 3.8, 0, '#fff')
  }
  const brows = rage ? rageBrow : brow
  brows(ctx, -30, -104, -6, -94, ENEMY_PAL.skin.line)
  brows(ctx, 20, -94, 42, -104, ENEMY_PAL.skin.line)

  if (pose === 'recover') {
    openMouth(ctx, 4, -46, 22, 14, { line: ENEMY_PAL.skin.line })
    sweat(ctx, 46, -110, 1.1)
  } else if (pose === 'roar') {
    openMouth(ctx, 6, -48, 26, 24, { line: ENEMY_PAL.skin.line })
    shockLines(ctx, -6, -110, 80, 108)
  } else if (fine()) {
    ctx.beginPath(); ctx.moveTo(-4, -50); ctx.quadraticCurveTo(10, -56, 24, -50)
    ctx.strokeStyle = ENEMY_PAL.skin.line; ctx.lineWidth = lw(1.5); ctx.lineCap = 'round'; ctx.stroke()
  }

  if (rage) embers(ctx, [[-70, -60, 1], [60, -96, 1.2], [-24, -156, .9]])

  ctx.restore()
}

export const courtCommander = {
  id: 'boss:court_commander', baseR: 36, scale: 1.14, surface: 209, feetY: FEET, shadowRx: 108,
  gait: .8, unique: true, motionMul: 2.2, topY: -205,
  frames: bossFrames(),
  frameKey: st => bossFrameKey(st, .8),
  draw,
}
