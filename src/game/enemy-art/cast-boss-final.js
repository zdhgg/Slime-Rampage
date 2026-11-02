/* Final Arbiter — pearl plate with tri-colour trim and a gold circlet; three
 * holy relics float behind him fanned like a halo: sword, staff and bow.
 * Windup kindles the relics, strike sends the sword thrusting forward. */
import { TAU, lw, olPx, fine, ell, glow, openMouth } from '../slime-art/slime-painter.js'
import { BOSS_PAL as PAL, ENEMY_PAL, shiftPts, limb, part, brow, emblem, bossFrames, bossFrameKey, rageEyes, rageBrow, embers, sweat, shockLines, hotEdge } from './boss-kit.js'

const FEET = 95
const BODY = [[-56, -48], [0, -56], [56, -48], [66, 4], [68, 68], [0, 80], [-68, 68], [-66, 4]]
const HEAD = [0, -110, 62, 56]
const FACE = [[-38, -124], [4, -130], [46, -120], [52, -88], [42, -56], [4, -48], [-34, -58], [-44, -90]]
const HAIR = [[-46, -104], [-42, -146], [-12, -166], [22, -164], [46, -144], [50, -104], [40, -94], [-38, -94]]
const BOOT = [[-19, 58], [19, 58], [21, 78], [40, 86], [35, 98], [-20, 98], [-26, 80]]

const POSE = {
  idle: { lean: 0, relics: 0, sword: 0, glowAmt: .3 },
  move: { lean: .03, relics: 0, sword: 0, glowAmt: .3 },
  windup: { lean: -.09, relics: .4, sword: -.3, glowAmt: 1 },
  strike: { lean: .13, relics: .2, sword: 1, glowAmt: 1.4 },
  recover: { lean: .16, relics: -.6, sword: .3, glowAmt: .15 },
  roar: { lean: -.08, relics: .8, sword: -.4, glowAmt: 1.6 },
}

/** Holy sword relic floating in its own space: pommel down, point up. */
function relicSword(ctx, x, y, rot, s, flare, rage) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s)
  // each relic halo is capped so even a roar flare stays inside the surface
  if (flare > .5) glow(ctx, 0, -60, Math.min(46, 34 + flare * 20), rage ? '#ff8a5a' : '#fff0b8', .3 + flare * .2)
  part(ctx, [[-9, -96], [0, -124], [9, -96], [8, -16], [-8, -16]], ENEMY_PAL.steel, [0, -60], { off: [-2, -2], sc: .9, spec: [-3, -84, 1.5, .5, .9] })
  part(ctx, [[-20, -14], [20, -14], [22, -4], [-22, -4]], ENEMY_PAL.gold, [0, -9], { off: [-1.5, -2], sc: .85 })
  limb(ctx, 0, -2, 0, 22, 10, ENEMY_PAL.leather)
  part(ctx, c => ell(c, 0, 28, 8, 8, 0), ENEMY_PAL.gold, [0, 28], { off: [-1.5, -1.5], sc: .8 })
  ctx.restore()
}

/** Holy staff relic: slim shaft with a glowing pearl orb. */
function relicStaff(ctx, x, y, rot, s, flare, rage) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s)
  if (flare > .5) glow(ctx, 0, -108, Math.min(40, 30 + flare * 18), rage ? '#ff8a5a' : '#d8b4ff', .3 + flare * .2)
  limb(ctx, 0, 30, 0, -104, 10, PAL.brass)
  part(ctx, [[-14, -112], [14, -112], [14, -100], [-14, -100]], ENEMY_PAL.gold, [0, -106], { off: [-1.5, -2], sc: .85 })
  part(ctx, c => ell(c, 0, -122, 13, 13, 0), PAL.crystal, [0, -122], { off: [-2, -2], sc: .9, spec: [-4, -128, -.5, .7, .9] })
  ctx.restore()
}

/** Holy bow relic: a small golden D-curve with a white string. */
function relicBow(ctx, x, y, rot, s, flare, rage) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s)
  if (flare > .5) glow(ctx, 0, -40, Math.min(40, 30 + flare * 18), rage ? '#ff8a5a' : '#fff0b8', .3 + flare * .2)
  ctx.beginPath(); ctx.moveTo(0, -96); ctx.lineTo(0, 30)
  ctx.strokeStyle = ENEMY_PAL.string; ctx.lineWidth = 4.5; ctx.lineCap = 'round'; ctx.stroke()
  limb(ctx, 0, -96, 0, 30, 10, ENEMY_PAL.gold, 40, -32)
  part(ctx, c => ell(c, 0, -30, 9, 18, 0), ENEMY_PAL.leather, [0, -30], { off: [-1.5, -2], sc: .8 })
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
  const flare = P.glowAmt + (rage ? .4 : 0)

  ctx.save()
  ctx.translate(0, FEET); ctx.rotate(P.lean); ctx.translate(0, -FEET)

  // the halo fan: staff and bow flanking, sword centre — strike sends the sword out
  const lift = P.relics * 18, spreadK = 1 + P.relics * .12
  relicStaff(ctx, -88 * spreadK, -84 - lift, -.42 - P.relics * .1, 1, flare, rage)
  relicBow(ctx, 92 * spreadK, -84 - lift, .42 + P.relics * .1, 1, flare, rage)
  const sx2 = P.sword === 1 ? 102 : 6, sy2 = P.sword === 1 ? -58 : -92 - lift
  const srot = P.sword === 1 ? 1.05 : P.sword * .35
  relicSword(ctx, sx2, sy2, srot, 1, flare, rage)
  if (pose === 'strike') hotEdge(ctx, sx2 + 80, sy2 - 30, 30, '#fff0b8', .5)

  for (const [x, lift2, dir] of [[-30, liftB, -1], [30, liftF, 1]]) {
    const dx = x + dir * spread * 18, dy = -lift2 * 14
    part(ctx, shiftPts(BOOT, dx, dy), PAL.cmdrBlack, [dx + 4, 80 + dy], { off: [-3, -4], sc: .9 })
  }

  // pearl plate with tri-colour trim and the gold emblem
  part(ctx, BODY, PAL.pearl, [0, 12], { off: [-6, -7], lights: [[-30, -14, 16, 28, -.18]], spec: [-32, -20, -.4, 1.6, .9] })
  part(ctx, [[-36, -44], [0, -50], [36, -44], [38, -30], [0, -22], [-38, -30]], ENEMY_PAL.gold, [0, -36], { off: [-2, -3], sc: .94 })
  emblem(ctx, 0, -6, 14) // 王国金徽：人类阵营共通印记
  // tri-colour trim: three thin stripes down the cuirass
  for (const [cx3, col] of [[-10, '#c03048'], [0, '#3d5288'], [10, '#c88b26']]) {
    ctx.beginPath(); ctx.moveTo(cx3, -22); ctx.lineTo(cx3, 24)
    ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.stroke()
  }
  part(ctx, [[-56, 26], [0, 32], [56, 26], [58, 42], [0, 48], [-58, 42]], ENEMY_PAL.gold, [0, 37], { off: [-2, -3], sc: .94 })
  for (const sx of [-1, 1]) part(ctx, c => ell(c, sx * 60, -38, 30, 26, 0), PAL.pearl, [sx * 60, -38], { off: [-4, -5], spec: [sx * 60 - 9, -46, -.4, 1.2, .8] })

  // bare head, gold circlet, stern hostile face
  part(ctx, HAIR, ENEMY_PAL.cap, [2, -128], { off: [-4, -5], sc: .95, lights: [[-22, -152, 18, 9, -.4]] })
  part(ctx, FACE, ENEMY_PAL.skin, [2, -88], { off: [-4, -5], sc: .94, ol: .8 })
  part(ctx, [[-44, -130], [44, -130], [46, -116], [-46, -116]], ENEMY_PAL.gold, [0, -123], { off: [-2, -2], sc: .9 })
  part(ctx, [[-7, -134], [7, -134], [9, -112], [-9, -112]], PAL.crystal, [0, -123], { off: [-1, -1], sc: .85 })

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

  if (rage) embers(ctx, [[-64, -66, 1], [68, -104, 1.2], [-28, -160, .9]])

  ctx.restore()
}

export const finalHero = {
  id: 'boss:final', baseR: 40, scale: 1.1, surface: 229, feetY: FEET, shadowRx: 102,
  gait: .8, unique: true, motionMul: 2.2, topY: -230,
  frames: bossFrames(),
  frameKey: st => bossFrameKey(st, .8),
  draw,
}
