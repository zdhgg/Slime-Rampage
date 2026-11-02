/* Border Warden — deep navy sentinel behind an oversized kite shield; a gun
 * barrel and spearhead jut forward through it (long horizontal silhouette),
 * bronze trim, cream tabard star, open-face helm with a bronze crest fin. */
import { TAU, lw, olPx, fine, ell, glow, openMouth } from '../slime-art/slime-painter.js'
import { BOSS_PAL as PAL, ENEMY_PAL, shiftPts, insetPts, limb, part, brow, emblem, bossFrames, bossFrameKey, rageEyes, rageBrow, embers, sweat, shockLines } from './boss-kit.js'

const FEET = 95
const BODY = [[-56, -48], [0, -56], [56, -48], [66, 4], [68, 70], [0, 82], [-68, 70], [-66, 4]]
const TABARD = [[-20, -48], [0, -52], [24, -48], [28, 32], [0, 50], [-28, 32]]
const HEAD = [0, -114, 68, 60]
const FACE = [[-40, -128], [6, -134], [50, -124], [56, -92], [44, -60], [6, -52], [-34, -62], [-46, -94]]
const HELM = [[-54, -106], [-50, -158], [-22, -186], [16, -188], [48, -162], [58, -118], [56, -96], [50, -88], [-48, -88], [-56, -98]]
const CREST = [[-12, -180], [6, -218], [24, -178]]
const BOOT = [[-19, 58], [19, 58], [21, 78], [40, 86], [35, 98], [-20, 98], [-26, 80]]
const SHIELD = [[24, -90], [88, -76], [102, -14], [62, 100], [26, 20]]

const POSE = {
  idle: { lean: 0, shield: [0, 0, 0], head: 0 },
  move: { lean: .03, shield: [0, 0, 0], head: 0 },
  windup: { lean: -.1, shield: [-16, -28, -.2], head: -.02 },
  strike: { lean: .13, shield: [22, -4, .05], head: 0 },
  recover: { lean: .16, shield: [-10, 36, .24], head: .06 },
  roar: { lean: -.07, shield: [-8, -46, -.26], head: -.05 },
}

/** The gun-shield: kite shield face, gun barrel + spearhead jutting toward +x. */
function gunShield(ctx, rage, hot) {
  // forearm behind the shield
  limb(ctx, -16, -14, 30, -4, 26, PAL.wardenNavy)
  // kite shield: navy field, bronze rim inset, cream star
  part(ctx, SHIELD, PAL.wardenNavy, [62, 2], { off: [-5, -6], sc: .95, lights: [[42, -64, 14, 22, -.3]] })
  part(ctx, insetPts(SHIELD, 62, 2, .78), PAL.wardenCream, [62, 2], { off: [-3, -4], sc: .9 })
  part(ctx, [[62, -30], [70, -8], [62, 14], [54, -8]], PAL.wardenBronze, [62, -8], { off: [-1.5, -2], sc: .9 })
  // barrel: thick gunmetal tube with bronze bands and a heavy muzzle ring —
  // wide enough to read as a cannon, not a telescope
  part(ctx, [[-6, -52], [128, -52], [132, -14], [-6, -14]], PAL.gunmetal, [60, -33], { off: [-4, -5], sc: .9 })
  part(ctx, [[42, -56], [64, -56], [66, -10], [42, -10]], PAL.wardenBronze, [54, -33], { off: [-2, -2], sc: .85 })
  part(ctx, [[122, -58], [150, -58], [152, -8], [122, -8]], PAL.wardenBronze, [137, -33], { off: [-2, -2], sc: .85 })
  part(ctx, c => ell(c, 150, -33, 9, 21, 0), PAL.gunmetal, [150, -33], { off: [-2, -2], sc: .85 })
  // spearhead above the muzzle
  part(ctx, [[140, -56], [186, -34], [140, -12], [150, -34]], ENEMY_PAL.steel, [158, -34], { off: [-3, -3], sc: .85, spec: [150, -44, -.5, 1, .9] })
  if (hot || rage) glow(ctx, 158, -34, hot ? 40 : 30, '#ff9a3c', hot ? .75 : .45)
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

  for (const [x, lift, dir] of [[-30, liftB, -1], [30, liftF, 1]]) {
    const dx = x + dir * spread * 18, dy = -lift * 14
    part(ctx, shiftPts(BOOT, dx, dy), PAL.gunmetal, [dx + 4, 80 + dy], { off: [-3, -4], sc: .9 })
  }

  // navy cuirass, cream tabard, bronze star + belt, pauldrons
  part(ctx, BODY, PAL.wardenNavy, [0, 12], { off: [-6, -7], lights: [[-30, -14, 16, 28, -.18]] })
  part(ctx, TABARD, PAL.wardenCream, [0, -4], { off: [-3, -4], sc: .94 })
  emblem(ctx, 4, -12, 15) // 王国金徽：人类阵营共通印记
  part(ctx, [[-58, 26], [0, 32], [58, 26], [60, 42], [0, 48], [-60, 42]], PAL.wardenBronze, [0, 37], { off: [-2, -3], sc: .94 })
  for (const sx of [-1, 1]) part(ctx, c => ell(c, sx * 62, -38, 30, 26, 0), PAL.wardenBronze, [sx * 62, -38], { off: [-4, -5], spec: [sx * 62 - 9, -46, -.4, 1.2, .8] })

  // helm: crest fin, crown dome, open face
  part(ctx, CREST, PAL.wardenBronze, [6, -196], { off: [-2, -3], sc: .9 })
  part(ctx, HELM, PAL.wardenNavy, [0, -132], { off: [-5, -6], sc: .95, lights: [[-28, -162, 22, 12, -.4]], spec: [-30, -168, -.4, 1.7, .9] })
  part(ctx, FACE, ENEMY_PAL.skin, [4, -90], { off: [-4, -5], sc: .94, ol: .8 })
  // cheek guards framing the open face
  for (const sx of [-1, 1]) part(ctx, [[sx * 52, -100], [sx * 42, -96], [sx * 40, -62], [sx * 54, -70]], PAL.wardenNavy, [sx * 47, -80], { off: [-2, -2], sc: .85, ol: .8 })
  // brow ridge over the eyes
  ctx.beginPath(); ctx.moveTo(-36, -116); ctx.quadraticCurveTo(8, -132, 52, -114)
  ctx.strokeStyle = PAL.wardenNavy.line; ctx.lineWidth = lw(olPx() * .9); ctx.lineCap = 'round'; ctx.stroke()

  if (rage) rageEyes(ctx, -14, -90, 44, 1.1)
  else for (const ex of [-14, 30]) {
    ell(ctx, ex, -90, 9, 12, 0, ENEMY_PAL.eyeInk)
    ell(ctx, ex - 2.8, -94, 3.4, 4, 0, '#fff')
  }
  const brows = rage ? rageBrow : brow
  brows(ctx, -30, -114, -4, -102, ENEMY_PAL.skin.line)
  brows(ctx, 24, -102, 48, -114, ENEMY_PAL.skin.line)

  if (pose === 'recover') {
    openMouth(ctx, 8, -52, 22, 14, { line: ENEMY_PAL.skin.line })
    sweat(ctx, 56, -120, 1.1)
  } else if (pose === 'roar') {
    openMouth(ctx, 10, -56, 26, 24, { line: ENEMY_PAL.skin.line })
    shockLines(ctx, 0, -120, 88, 118)
  } else if (fine()) {
    ctx.beginPath(); ctx.moveTo(-4, -58); ctx.quadraticCurveTo(12, -64, 28, -58)
    ctx.strokeStyle = ENEMY_PAL.skin.line; ctx.lineWidth = lw(1.5); ctx.lineCap = 'round'; ctx.stroke()
  }

  // gun-shield group last: it is the silhouette anchor and stays on top
  const [sx, sy, tilt] = P.shield
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(tilt)
  gunShield(ctx, rage, pose === 'strike')
  ctx.restore()

  if (rage) embers(ctx, [[-56, -70, 1], [70, -100, 1.2], [-30, -170, .9]])

  ctx.restore()
}

export const borderWarden = {
  id: 'boss:border_warden', baseR: 36, scale: 1.12, surface: 216, feetY: FEET, shadowRx: 118,
  gait: .8, unique: true, motionMul: 2.2, topY: -218,
  frames: bossFrames(),
  frameKey: st => bossFrameKey(st, .8),
  draw,
}
