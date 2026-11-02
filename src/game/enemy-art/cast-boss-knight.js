/* Knight King — gold plate and a red cape, a gold crown on a bare head, and an
 * oversized greatsword he swings two-handed. The generic boss-knight cast and
 * the archetype for the kingdom's human knights. */
import { TAU, lw, olPx, fine, ell, openMouth } from '../slime-art/slime-painter.js'
import { BOSS_PAL as PAL, ENEMY_PAL, shiftPts, limb, part, brow, emblem, bossFrames, bossFrameKey, rageEyes, rageBrow, embers, sweat, shockLines, hotEdge } from './boss-kit.js'

const FEET = 95
const BODY = [[-56, -48], [0, -56], [56, -48], [66, 4], [68, 68], [0, 80], [-68, 68], [-66, 4]]
const CAPE = [[-46, -50], [-86, -30], [-122, 18], [-110, 74], [-78, 58], [-82, 88], [-46, 62], [-50, 84], [-22, 56], [-14, 34]]
const HEAD = [0, -110, 62, 56]
const FACE = [[-38, -124], [4, -130], [46, -120], [52, -88], [42, -56], [4, -48], [-34, -58], [-44, -90]]
const HAIR = [[-46, -104], [-42, -142], [-12, -162], [22, -160], [46, -140], [50, -104], [40, -94], [-38, -94]]
const CROWN = [[-42, -138], [-38, -168], [-24, -150], [-10, -176], [2, -152], [16, -172], [28, -148], [40, -162], [42, -138]]
const BOOT = [[-19, 58], [19, 58], [21, 78], [40, 86], [35, 98], [-20, 98], [-26, 80]]

const POSE = {
  idle: { lean: 0, sword: [58, 8, .3], cape: 0 },
  move: { lean: .03, sword: [58, 8, .3], cape: 0 },
  windup: { lean: -.1, sword: [30, -66, -.55], cape: -.06 },
  strike: { lean: .11, sword: [62, -14, .95], cape: .08 },
  recover: { lean: .16, sword: [62, 30, .75], cape: .04 },
  roar: { lean: -.08, sword: [36, -84, -.7], cape: -.1 },
}

/** Oversized greatsword: grip at the origin, gold guard, long broad blade. */
function greatsword(ctx, rage, hot) {
  limb(ctx, 0, 34, 0, -8, 14, ENEMY_PAL.leather)
  part(ctx, [[-30, -18], [30, -18], [34, -6], [-34, -6]], ENEMY_PAL.gold, [0, -12], { off: [-1.5, -2], sc: .9 })
  part(ctx, c => ell(c, 0, 38, 10, 10, 0), ENEMY_PAL.gold, [0, 38], { off: [-2, -2], sc: .85 })
  part(ctx, [[-11, -20], [-9, -150], [0, -178], [9, -150], [11, -20]], ENEMY_PAL.steel, [0, -98], { off: [-2.4, -3], sc: .88, spec: [-3, -120, 1.5, .5, .9] })
  part(ctx, [[-4, -146], [4, -146], [4, -24], [-4, -24]], ENEMY_PAL.steelDark, [0, -85], { off: [-1, -1], sc: .8, ol: .6 })
  if (hot || rage) hotEdge(ctx, 0, -120, hot ? 46 : 34, '#ffb04a', hot ? .7 : .4)
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

  // red cape behind the body
  ctx.save(); ctx.translate(0, -30); ctx.rotate(P.cape + (mv ? Math.sin(ph) * .05 : 0)); ctx.translate(0, 30)
  part(ctx, CAPE, PAL.cmdrCrimson, [-40, 16], { off: [-5, -6], sc: .95 })
  ctx.restore()

  for (const [x, lift, dir] of [[-30, liftB, -1], [30, liftF, 1]]) {
    const dx = x + dir * spread * 18, dy = -lift * 14
    part(ctx, shiftPts(BOOT, dx, dy), ENEMY_PAL.leather, [dx + 4, 80 + dy], { off: [-3, -4], sc: .9 })
  }

  // gold plate, darker gold cuirass ridge + emblem, red-lined belt, pauldrons
  part(ctx, BODY, ENEMY_PAL.gold, [0, 12], { off: [-6, -7], lights: [[-30, -14, 16, 28, -.18]], spec: [-32, -20, -.4, 1.6, .9] })
  part(ctx, [[-34, -42], [0, -48], [34, -42], [38, 0], [28, 22], [0, 28], [-28, 22], [-38, 0]], PAL.wardenBronze, [0, -8], { off: [-3, -4], sc: .94 })
  emblem(ctx, 0, -8, 13) // 王国金徽：人类阵营共通印记
  part(ctx, [[-56, 26], [0, 32], [56, 26], [58, 42], [0, 48], [-58, 42]], PAL.cmdrCrimson, [0, 37], { off: [-2, -3], sc: .94 })
  for (const sx of [-1, 1]) part(ctx, c => ell(c, sx * 60, -38, 30, 26, 0), ENEMY_PAL.gold, [sx * 60, -38], { off: [-4, -5], spec: [sx * 60 - 9, -46, -.4, 1.2, .8] })

  // two hands on the hilt: back arm first, then sword, then the lead hand
  const [hx, hy, hrot] = P.sword
  limb(ctx, 42, -32, hx - 4, hy + 16, 24, ENEMY_PAL.gold)
  limb(ctx, -40, -30, hx - 14, hy + 2, 20, ENEMY_PAL.gold)
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(hrot)
  greatsword(ctx, rage, pose === 'strike' || pose === 'windup')
  ctx.restore()
  for (const [gx, gy] of [[hx - 2, hy + 14], [hx + 6, hy - 2]]) part(ctx, c => ell(c, gx, gy, 12, 12, 0), ENEMY_PAL.skin, [gx, gy], { off: [-2, -2], sc: .85 })

  // bare head: hair, crown, full hostile face — no helm
  part(ctx, HAIR, ENEMY_PAL.cap, [2, -128], { off: [-4, -5], sc: .95, lights: [[-22, -152, 18, 9, -.4]] })
  part(ctx, FACE, ENEMY_PAL.skin, [2, -88], { off: [-4, -5], sc: .94, ol: .8 })
  part(ctx, CROWN, ENEMY_PAL.gold, [0, -152], { off: [-3, -3], sc: .92, spec: [-12, -158, -.4, .9, .9] })

  if (rage) rageEyes(ctx, -16, -86, 42, 1.1)
  else for (const ex of [-16, 26]) {
    ell(ctx, ex, -86, 9, 12, 0, ENEMY_PAL.eyeInk)
    ell(ctx, ex - 2.8, -90, 3.4, 4, 0, '#fff')
  }
  const brows = rage ? rageBrow : brow
  brows(ctx, -32, -110, -6, -98, ENEMY_PAL.skin.line)
  brows(ctx, 20, -98, 42, -110, ENEMY_PAL.skin.line)

  if (pose === 'recover') {
    openMouth(ctx, 4, -50, 22, 14, { line: ENEMY_PAL.skin.line })
    sweat(ctx, 50, -114, 1.1)
  } else if (pose === 'roar') {
    openMouth(ctx, 6, -52, 26, 24, { line: ENEMY_PAL.skin.line })
    shockLines(ctx, -8, -116, 84, 112)
  } else if (fine()) {
    ctx.beginPath(); ctx.moveTo(-6, -54); ctx.quadraticCurveTo(8, -60, 24, -54)
    ctx.strokeStyle = ENEMY_PAL.skin.line; ctx.lineWidth = lw(1.5); ctx.lineCap = 'round'; ctx.stroke()
  }

  if (rage) embers(ctx, [[-62, -66, 1], [66, -104, 1.2], [-28, -160, .9]])

  ctx.restore()
}

export const knightKing = {
  id: 'boss:knight', baseR: 36, scale: 1.14, surface: 209, feetY: FEET, shadowRx: 100,
  gait: .8, unique: true, motionMul: 2.2, topY: -178,
  frames: bossFrames(),
  frameKey: st => bossFrameKey(st, .8),
  draw,
}
