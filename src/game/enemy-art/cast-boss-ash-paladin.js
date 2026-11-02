/* Ash Paladin — charcoal plate under a tattered cloak, a glowing ember cross
 * branded on the chest, and a two-handed warhammer with a huge square head.
 * Ember wisps drift off the armour; the hammer slam is his strike. */
import { TAU, lw, olPx, fine, ell, glow, openMouth } from '../slime-art/slime-painter.js'
import { BOSS_PAL as PAL, ENEMY_PAL, shiftPts, limb, part, brow, emblem, bossFrames, bossFrameKey, rageEyes, rageBrow, embers, sweat, shockLines, hotEdge } from './boss-kit.js'

const FEET = 95
const BODY = [[-56, -48], [0, -56], [56, -48], [66, 4], [68, 68], [0, 80], [-68, 68], [-66, 4]]
const CLOAK = [[-52, -52], [-96, -30], [-118, 30], [-92, 84], [-74, 62], [-60, 92], [-44, 66], [-34, 84], [-20, 60], [-8, 76], [4, 56], [-16, 30], [-30, -10]]
const HEAD = [0, -110, 62, 56]
const FACE = [[-38, -122], [4, -128], [44, -118], [50, -88], [40, -58], [4, -50], [-34, -58], [-44, -90]]
const HELM = [[-52, -100], [-48, -146], [-20, -170], [16, -172], [46, -152], [54, -112], [52, -92], [44, -84], [-44, -84], [-54, -94]]
const BOOT = [[-19, 58], [19, 58], [21, 78], [40, 86], [35, 98], [-20, 98], [-26, 80]]
const CROSS = [[-7, -38], [7, -38], [7, -16], [22, -16], [22, -4], [7, -4], [7, 20], [-7, 20], [-7, -4], [-22, -4], [-22, -16], [-7, -16]]

const POSE = {
  idle: { lean: 0, hammer: [56, 4, -.55], cloak: 0 },
  move: { lean: .03, hammer: [56, 4, -.55], cloak: 0 },
  windup: { lean: -.1, hammer: [28, -72, -.5], cloak: -.06 },
  strike: { lean: .11, hammer: [60, -12, 1.0], cloak: .08 },
  recover: { lean: .16, hammer: [48, 24, 1.95], cloak: .04 },
  roar: { lean: -.08, hammer: [26, -92, -.95], cloak: -.1 },
}

/** Two-handed warhammer: grip at the origin, long haft, giant square head. */
function hammer(ctx, rage, hot) {
  limb(ctx, 0, 40, 0, -118, 14, PAL.ashChar)
  part(ctx, [[-9, 34], [9, 34], [9, 48], [-9, 48]], PAL.gunmetal, [0, 41], { off: [-1.5, -2], sc: .85 })
  // square head: dark iron block with an ember core seam
  part(ctx, [[-30, -170], [30, -170], [34, -116], [-34, -116]], PAL.gunmetal, [0, -143], { off: [-4, -5], sc: .92, spec: [-13, -160, -.5, 1.2, .9] })
  part(ctx, [[-8, -170], [8, -170], [8, -116], [-8, -116]], PAL.ember, [0, -143], { off: [-2, -2], sc: .85 })
  if (hot || rage) hotEdge(ctx, 0, -147, hot ? 44 : 40, '#ff8a3c', hot ? .75 : .45)
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

  // tattered cloak streams behind, its hem torn into points
  ctx.save(); ctx.translate(0, -30); ctx.rotate(P.cloak); ctx.translate(0, 30)
  part(ctx, CLOAK, PAL.cmdrBlack, [-30, 16], { off: [-5, -6], sc: .95 })
  ctx.restore()

  for (const [x, lift, dir] of [[-30, liftB, -1], [30, liftF, 1]]) {
    const dx = x + dir * spread * 18, dy = -lift * 14
    part(ctx, shiftPts(BOOT, dx, dy), PAL.ashChar, [dx + 4, 80 + dy], { off: [-3, -4], sc: .9 })
  }

  // charcoal plate, ember cross branded on the chest, belt, pauldrons
  part(ctx, BODY, PAL.ashChar, [0, 12], { off: [-6, -7], lights: [[-30, -14, 16, 28, -.18]] })
  glow(ctx, 2, -10, 40, '#ff8a3c', .5)
  part(ctx, CROSS, PAL.ember, [0, -8], { off: [-2, -2], sc: .9, ol: .7 })
  part(ctx, [[-56, 26], [0, 32], [56, 26], [58, 42], [0, 48], [-58, 42]], PAL.gunmetal, [0, 37], { off: [-2, -3], sc: .94 })
  emblem(ctx, 0, 37, 9)
  for (const sx of [-1, 1]) part(ctx, c => ell(c, sx * 60, -38, 30, 26, 0), PAL.ashChar, [sx * 60, -38], { off: [-4, -5], spec: [sx * 60 - 9, -46, -.4, 1.2, .8] })

  // sallet helm, open face, hostile eyes lit by the embers below
  part(ctx, HELM, PAL.ashChar, [0, -128], { off: [-5, -6], sc: .95, lights: [[-26, -158, 20, 11, -.4]], spec: [-28, -164, -.4, 1.6, .9] })
  part(ctx, FACE, ENEMY_PAL.skin, [2, -88], { off: [-4, -5], sc: .94, ol: .8 })
  ctx.beginPath(); ctx.moveTo(-34, -110); ctx.quadraticCurveTo(6, -126, 46, -108)
  ctx.strokeStyle = PAL.ashChar.line; ctx.lineWidth = lw(olPx() * .9); ctx.lineCap = 'round'; ctx.stroke()

  if (rage) rageEyes(ctx, -16, -86, 42, 1.1)
  else for (const ex of [-16, 26]) {
    glow(ctx, ex, -86, 18, '#ff8a3c', .35)
    ell(ctx, ex, -86, 8.5, 11.5, 0, ENEMY_PAL.eyeInk)
    ell(ctx, ex - 2.6, -90, 3.2, 3.8, 0, '#fff')
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

  // hammer arm last: both hands on the haft, square head leads the silhouette
  const [hx, hy, hrot] = P.hammer
  limb(ctx, 44, -32, hx - 6, hy + 20, 24, PAL.ashChar)
  limb(ctx, 30, -34, hx - 2, hy + 4, 20, PAL.ashChar)
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(hrot)
  hammer(ctx, rage, pose === 'strike' || pose === 'windup')
  ctx.restore()
  for (const [gx, gy] of [[hx - 4, hy + 16], [hx + 4, hy]]) part(ctx, c => ell(c, gx, gy, 12, 12, 0), ENEMY_PAL.skin, [gx, gy], { off: [-2, -2], sc: .85 })

  // ember wisps drifting off the armour — more of them while raging
  embers(ctx, rage
    ? [[-74, -60, 1], [-96, -120, 1.1], [50, -150, 1], [-30, -190, .8], [80, -40, .9]]
    : [[-70, -64, .9], [-88, -110, .8]])

  ctx.restore()
}

export const ashPaladin = {
  id: 'boss:ash_paladin', baseR: 36, scale: 1.14, surface: 219, feetY: FEET, shadowRx: 104,
  gait: .8, unique: true, motionMul: 2.2, topY: -222,
  frames: bossFrames(),
  frameKey: st => bossFrameKey(st, .8),
  draw,
}
