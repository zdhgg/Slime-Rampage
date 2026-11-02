/* Gate Marshal — a silver wall: gold-rimmed tower shield taller than his head
 * planted on the front arm, short hammer on the back arm, wide cheek-guard
 * helm. Windup lifts the hammer behind, strike swings it over the wall. */
import { TAU, lw, olPx, fine, ell, openMouth } from '../slime-art/slime-painter.js'
import { BOSS_PAL as PAL, ENEMY_PAL, shiftPts, insetPts, limb, part, brow, emblem, bossFrames, bossFrameKey, rageEyes, rageBrow, embers, sweat, shockLines, hotEdge } from './boss-kit.js'

const FEET = 95
const BODY = [[-58, -48], [0, -56], [54, -48], [62, 4], [64, 68], [0, 80], [-64, 68], [-62, 4]]
const TABARD = [[-18, -48], [0, -52], [22, -48], [26, 30], [0, 48], [-26, 30]]
const HEAD = [0, -112, 64, 58]
const FACE = [[-42, -126], [4, -132], [44, -122], [50, -90], [40, -58], [4, -50], [-36, -60], [-48, -94]]
const HELM = [[-56, -104], [-52, -152], [-24, -178], [14, -182], [46, -158], [56, -116], [58, -92], [48, -84], [-50, -84], [-58, -96]]
const CHEEK_L = [[-58, -92], [-66, -50], [-46, -42], [-42, -80]]
const CHEEK_R = [[54, -88], [62, -46], [42, -40], [42, -76]]
const BAND = [[-50, -158], [0, -182], [50, -156], [52, -136], [0, -158], [-52, -136]]
// mid-edge verts on the long top corners keep the catmull-rom top edge from
// bulging above the slab's own apex when the shield tilts in the roar pose
const SLAB = [[54, -212], [104, -204], [108, -150], [110, -56], [100, 60], [72, 92], [52, 62], [46, -58], [48, -140]]
const BOOT = [[-19, 58], [19, 58], [21, 78], [40, 86], [35, 98], [-20, 98], [-26, 80]]

const POSE = {
  idle: { lean: 0, hammer: [-58, -8, .5], shield: [0, 0, 0], head: 0 },
  move: { lean: .03, hammer: [-58, -8, .5], shield: [0, 0, 0], head: 0 },
  windup: { lean: -.09, hammer: [-46, -58, -.62], shield: [8, -6, -.04], head: -.02 },
  strike: { lean: .12, hammer: [64, -52, 1.18], shield: [14, -2, .06], head: 0 },
  recover: { lean: .16, hammer: [-44, 42, .95], shield: [-8, 30, .2], head: .06 },
  roar: { lean: -.07, hammer: [-38, -84, -.8], shield: [-4, -22, -.14], head: -.05 },
}

/** Short war hammer: grip at the origin, haft along -y, blocky head at the top. */
function hammer(ctx, rage, hot) {
  limb(ctx, 0, 34, 0, -62, 13, PAL.gunmetal)
  part(ctx, [[-8, 30], [8, 30], [8, 44], [-8, 44]], ENEMY_PAL.gold, [0, 37], { off: [-1.5, -2], sc: .85 })
  part(ctx, [[-26, -96], [26, -96], [30, -58], [-30, -58]], PAL.gateSilver, [0, -77], { off: [-3, -4], sc: .9, spec: [-12, -88, -.5, 1, .9] })
  part(ctx, [[-10, -104], [10, -104], [10, -94], [-10, -94]], ENEMY_PAL.gold, [0, -99], { off: [-1.5, -2], sc: .85 })
  if (hot || rage) hotEdge(ctx, 0, -77, hot ? 46 : 34, '#ffb04a', hot ? .7 : .4)
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

  // silver cuirass, cream tabard, gold belt + emblem, pauldrons
  part(ctx, BODY, PAL.gateSilver, [0, 12], { off: [-6, -7], lights: [[-30, -14, 16, 28, -.18]], spec: [-32, -20, -.4, 1.6, .9] })
  part(ctx, TABARD, PAL.wardenCream, [0, -4], { off: [-3, -4], sc: .94 })
  emblem(ctx, 2, -12, 15) // 王国金徽：人类阵营共通印记
  part(ctx, [[-56, 26], [0, 32], [56, 26], [58, 42], [0, 48], [-58, 42]], ENEMY_PAL.gold, [0, 37], { off: [-2, -3], sc: .94 })
  for (const sx of [-1, 1]) part(ctx, c => ell(c, sx * 58, -38, 28, 25, 0), PAL.gateSilver, [sx * 58, -38], { off: [-4, -5], spec: [sx * 58 - 9, -46, -.4, 1.2, .8] })

  // back arm + hammer (hammer raised = windup, swung over = strike)
  const [hx, hy, hrot] = P.hammer
  limb(ctx, -46, -32, hx + 6, hy + 14, 24, PAL.gateSilver)
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(hrot)
  hammer(ctx, rage, pose === 'strike')
  ctx.restore()
  part(ctx, c => ell(c, hx + 4, hy + 18, 13, 13, 0), PAL.gunmetal, [hx + 4, hy + 18], { off: [-2, -2], sc: .85 })

  // wide cheek-guard helm: dome, gold band across it, open face, flared cheek plates
  part(ctx, HELM, PAL.gateSilver, [0, -132], { off: [-5, -6], sc: .95, lights: [[-28, -162, 22, 12, -.4]], spec: [-30, -168, -.4, 1.7, .9] })
  part(ctx, BAND, ENEMY_PAL.gold, [0, -158], { off: [-2, -3], sc: .9 })
  part(ctx, FACE, ENEMY_PAL.skin, [2, -90], { off: [-4, -5], sc: .94, ol: .8 })
  part(ctx, CHEEK_L, PAL.gateSilver, [-52, -66], { off: [-2, -2], sc: .85, ol: .8 })
  part(ctx, CHEEK_R, PAL.gateSilver, [50, -62], { off: [-2, -2], sc: .85, ol: .8 })
  ctx.beginPath(); ctx.moveTo(-38, -114); ctx.quadraticCurveTo(6, -130, 48, -112)
  ctx.strokeStyle = PAL.gateSilver.line; ctx.lineWidth = lw(olPx() * .9); ctx.lineCap = 'round'; ctx.stroke()

  if (rage) rageEyes(ctx, -18, -88, 42, 1.1)
  else for (const ex of [-18, 24]) {
    ell(ctx, ex, -88, 9, 12, 0, ENEMY_PAL.eyeInk)
    ell(ctx, ex - 2.8, -92, 3.4, 4, 0, '#fff')
  }
  const brows = rage ? rageBrow : brow
  brows(ctx, -34, -112, -8, -100, ENEMY_PAL.skin.line)
  brows(ctx, 20, -100, 42, -112, ENEMY_PAL.skin.line)

  if (pose === 'recover') {
    openMouth(ctx, 4, -52, 22, 14, { line: ENEMY_PAL.skin.line })
    sweat(ctx, 52, -118, 1.1)
  } else if (pose === 'roar') {
    openMouth(ctx, 6, -54, 26, 24, { line: ENEMY_PAL.skin.line })
    shockLines(ctx, -10, -118, 86, 116)
  } else if (fine()) {
    ctx.beginPath(); ctx.moveTo(-8, -56); ctx.quadraticCurveTo(8, -62, 24, -56)
    ctx.strokeStyle = ENEMY_PAL.skin.line; ctx.lineWidth = lw(1.5); ctx.lineCap = 'round'; ctx.stroke()
  }

  // tower shield last: the gold-rimmed slab is the silhouette anchor
  const [sx, sy, tilt] = P.shield
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(tilt)
  limb(ctx, -8, -20, 44, -10, 24, PAL.gateSilver)
  part(ctx, SLAB, PAL.gateSilver, [76, -58], { off: [-5, -6], sc: .95, lights: [[62, -160, 16, 34, -.15]], spec: [64, -176, -.4, 1.6, .9] })
  part(ctx, insetPts(SLAB, 76, -58, .9), ENEMY_PAL.gold, [76, -58], { off: [-3, -4], sc: .92 })
  part(ctx, insetPts(SLAB, 76, -58, .78), PAL.gateSilver, [76, -58], { off: [-2, -3], sc: .9 })
  emblem(ctx, 76, -70, 20)
  ctx.restore()

  if (rage) embers(ctx, [[-58, -72, 1], [64, -110, 1.2], [-28, -172, .9]])

  ctx.restore()
}

export const gateMarshal = {
  id: 'boss:gate_marshal', baseR: 36, scale: 1.14, surface: 225, feetY: FEET, shadowRx: 112,
  gait: .8, unique: true, motionMul: 2.2, topY: -215,
  frames: bossFrames(),
  frameKey: st => bossFrameKey(st, .8),
  draw,
}
