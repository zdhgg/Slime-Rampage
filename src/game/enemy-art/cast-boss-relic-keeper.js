/* Relic Keeper — wine robe with pearl beads, a giant ornate key carried like a
 * staff, two twin relic orbs floating at her sides, and a ring of small keys
 * at the belt. Floats. */
import { TAU, lw, fine, ell, glow, openMouth } from '../slime-art/slime-painter.js'
import { BOSS_PAL as PAL, ENEMY_PAL, shiftPts, limb, part, brow, bossFrames, bossFrameKey, rageEyes, rageBrow, embers, sweat, shockLines } from './boss-kit.js'

const FEET = 70
const HEAD = [0, -102, 58, 54]
const HOOD = [[-52, -96], [-48, -142], [-18, -170], [18, -172], [48, -146], [54, -104], [46, -76], [20, -58], [-22, -60], [-50, -78]]
const FACE = [[-34, -110], [2, -118], [40, -108], [46, -82], [34, -58], [2, -50], [-28, -58], [-38, -84]]
const HAIR = [[-40, -108], [-44, -140], [-16, -160], [16, -158], [42, -136], [44, -106], [36, -98], [-34, -98]]
const SINE = Math.sin

// every pose keeps a stoop — the keeper is permanently hunched over her keys
const POSE = {
  idle: { staff: [62, 6, .05], orbs: 0, hand: [58, 2], slump: .07, glow: .4 },
  move: { staff: [62, 6, .05], orbs: 0, hand: [58, 2], slump: .08, glow: .4 },
  windup: { staff: [70, -34, -.25], orbs: .6, hand: [64, -30], slump: .03, glow: 1 },
  strike: { staff: [96, -16, .4], orbs: 1, hand: [88, -10], slump: .11, glow: 1.6 },
  recover: { staff: [56, 38, .5], orbs: -1, hand: [52, 30], slump: .2, glow: .15 },
  roar: { staff: [58, -44, -.4], orbs: 1.3, hand: [54, -40], slump: .03, glow: 1.6 },
}

const robePath = wv => c => {
  c.beginPath(); c.moveTo(-50, -44)
  c.bezierCurveTo(-28, -58, 28, -58, 50, -44)
  c.bezierCurveTo(62, -14, 74, 22, 86, 54 + 5 * SINE(wv))
  c.quadraticCurveTo(64, 74 + 4 * SINE(wv + 1), 42, 56 + 5 * SINE(wv + 2))
  c.quadraticCurveTo(21, 72 + 4 * SINE(wv + 3), 0, 56 + 5 * SINE(wv + 4))
  c.quadraticCurveTo(-21, 72 + 4 * SINE(wv + 5), -42, 56 + 5 * SINE(wv + 6))
  c.quadraticCurveTo(-64, 74 + 4 * SINE(wv + 7), -86, 54 + 5 * SINE(wv + 8))
  c.bezierCurveTo(-74, 22, -62, -14, -50, -44); c.closePath()
}

/** The giant key-staff: shaft, three-lobed bow ring on top, bit teeth at the side. */
function keyStaff(ctx, glowAmt, rage) {
  limb(ctx, 0, 64, 0, -150, 14, PAL.brass)
  // bit teeth near the top, pointing +x — wide enough to read as a key, not a staff
  part(ctx, [[4, -122], [38, -122], [38, -110], [18, -110], [18, -98], [38, -98], [38, -86], [4, -86]], ENEMY_PAL.gold, [20, -104], { off: [-2, -2], sc: .9 })
  // ornate bow: three overlapping rings — oversized so the key reads at range
  for (const [ox, oy] of [[-15, -178], [15, -178], [0, -196]]) {
    part(ctx, c => { c.beginPath(); c.ellipse(ox, oy, 18, 18, 0, 0, TAU) }, ENEMY_PAL.gold, [ox, oy], { off: [-2, -2], sc: .85, spec: [ox - 5, oy - 6, -.5, .6, .9] })
    part(ctx, c => { c.beginPath(); c.ellipse(ox, oy, 10, 10, 0, 0, TAU) }, PAL.relicWine, [ox, oy], { off: [-1, -1], sc: .8, ol: .7 })
  }
  // the bow halo is capped so even a roar flare stays inside the cache surface
  if (glowAmt > .5) glow(ctx, 0, -182, Math.min(40, 20 + glowAmt * 18), rage ? '#ff8a5a' : '#ffd45e', .3 + glowAmt * .25)
}

/** Twin relic orb: pearl sphere in a gold cage with a glow core. */
function relicOrb(ctx, x, y, s, flare, rage) {
  const hot = rage ? '#ff8a5a' : '#ffd45e'
  glow(ctx, x, y, Math.min(40, (20 + flare * 10) * s), hot, .35 + flare * .25)
  part(ctx, c => ell(c, x, y, 15 * s, 15 * s, 0), PAL.pearl, [x, y], { off: [-2 * s, -2.4 * s], sc: .9, spec: [x - 5 * s, y - 6 * s, -.5, .6 * s, .9] })
  for (const a of [-.5, .5]) {
    ctx.beginPath(); ctx.ellipse(x, y, 19 * s, 7 * s, a, 0, TAU)
    ctx.strokeStyle = ENEMY_PAL.gold.base; ctx.lineWidth = 4; ctx.stroke()
    ctx.strokeStyle = ENEMY_PAL.gold.line; ctx.lineWidth = lw(1); ctx.stroke()
  }
}

function draw(ctx, st) {
  const pose = st.pose || 'idle'
  const P = POSE[pose] || POSE.idle
  const rage = !!st.rage
  const wv = pose === 'move' ? (st.phase || 0) * Math.PI * 4 : 0
  const [sx, sy, srot] = P.staff
  const [hx, hy] = P.hand
  const orbGlow = Math.max(0, P.glow + (rage ? .4 : 0))

  ctx.save()
  if (P.slump) { ctx.translate(0, FEET); ctx.rotate(P.slump); ctx.translate(0, -FEET) }

  // key-staff first: sleeve and hand overlap the shaft
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(srot)
  keyStaff(ctx, orbGlow, rage)
  ctx.restore()

  // twin relic orbs floating at both shoulders
  const dip = P.orbs < 0 ? 30 : 0, bob = pose === 'move' ? SINE(wv * .5) * 6 : 0
  const os = .85 + Math.max(0, P.orbs) * .15
  relicOrb(ctx, -86, -56 + dip + bob, os, orbGlow, rage)
  relicOrb(ctx, 8, -192 + dip - bob, os * .9, orbGlow, rage)

  // wine robe with scalloped hem, gold seam and key-ring belt
  part(ctx, robePath(wv), PAL.relicWine, [0, 8], { off: [-6, -8], sc: .95, lights: [[-28, -8, 15, 28, -.15]] })
  // hunched back: a rounded mass of robe droops over the shoulders toward -x
  part(ctx, [[-62, -38], [-48, -66], [-12, -76], [22, -66], [46, -48], [52, -30], [16, -16], [-52, -20]], PAL.relicWine, [-8, -44], { off: [-4, -5], sc: .95, lights: [[-36, -58, 13, 16, -.25]] })
  ctx.beginPath(); ctx.moveTo(2, -42); ctx.lineTo(2, 60)
  ctx.strokeStyle = ENEMY_PAL.gold.base; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.stroke()
  part(ctx, [[-56, 6], [0, 14], [56, 6], [58, 20], [0, 28], [-58, 20]], ENEMY_PAL.gold, [0, 17], { off: [-2, -3], sc: .94 })
  // a ring of small keys hangs off the belt
  for (const [kx, krot] of [[-30, .3], [-12, -.15], [8, .2]]) {
    ctx.save(); ctx.translate(kx, 24); ctx.rotate(krot)
    limb(ctx, 0, 0, 0, 16, 5, PAL.brass)
    part(ctx, c => ell(c, 0, -3, 5, 5, 0), PAL.brass, [0, -3], { off: [-1, -1], sc: .8, ol: .7 })
    part(ctx, [[-2, 14], [8, 14], [8, 20], [3, 20], [3, 24], [-2, 24]], PAL.brass, [3, 19], { off: [-1, -1], sc: .8, ol: .7 })
    ctx.restore()
  }

  // pearl collar beads
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * .22 + i * Math.PI * .14
    part(ctx, c => ell(c, Math.cos(a) * 42, -40 + Math.sin(a) * 20, 6, 6, 0), PAL.pearl, [Math.cos(a) * 42, -40 + Math.sin(a) * 20], { off: [-1, -1], sc: .8, ol: .7 })
  }

  // off-hand sleeve lifts a pearl spark while charging
  const ly = P.glow >= 1 ? -36 : 16
  part(ctx, c => ell(c, -68, ly, 24, 28, -.15), PAL.relicWine, [-68, ly], { off: [-4, -5], sc: .9 })
  part(ctx, c => ell(c, -72, ly + (P.glow >= 1 ? -26 : 24), 11, 11, 0), ENEMY_PAL.skin, [-72, ly + 24], { off: [-2, -2], sc: .85 })
  if (P.glow >= 1) {
    glow(ctx, -72, ly - 50, 30, '#ffe9b0', .85)
    ell(ctx, -72, ly - 50, 9, 9, 0, '#fff8e0')
  }

  // staff-hand sleeve + hand on the shaft
  limb(ctx, 44, -34, hx - 8, hy - 4, 26, PAL.relicWine)
  part(ctx, c => ell(c, hx - 4, hy - 2, 24, 20, .2), PAL.relicWine, [hx - 4, hy - 2], { off: [-4, -5], sc: .9 })
  part(ctx, c => ell(c, hx, hy + 4, 11, 11, 0), ENEMY_PAL.skin, [hx, hy + 4], { off: [-2, -2], sc: .85 })

  // hooded head: wine hood over dark hair — pushed forward and down by the stoop
  part(ctx, shiftPts(HAIR, 10, 6), PAL.cmdrBlack, [10, -122], { off: [-4, -5], sc: .94 })
  part(ctx, c => ell(c, 10, -96, HEAD[2], HEAD[3], 0), ENEMY_PAL.skin, [10, -96], { off: [-5, -6], sc: .94, lights: [[-10, -120, 18, 9, -.3]] })
  part(ctx, shiftPts(HOOD, 10, 6), PAL.relicWine, [10, -106], { off: [-5, -6], sc: .95, lights: [[-14, -144, 18, 10, -.4]], spec: [-16, -150, -.4, 1.5, .9] })
  // hood opening frames the face
  part(ctx, [[-26, -100], [-10, -122], [30, -122], [50, -102], [44, -86], [-22, -86]], PAL.pearl, [12, -104], { off: [-2, -3], sc: .9 })

  if (rage) rageEyes(ctx, -2, -80, 40, 1.05)
  else for (const ex of [-2, 38]) {
    ell(ctx, ex, -80, 8.5, 11, 0, ENEMY_PAL.eyeInk)
    ell(ctx, ex - 2.6, -84, 3.2, 3.8, 0, '#fff')
  }
  const brows = rage ? rageBrow : brow
  brows(ctx, -18, -102, 8, -92, ENEMY_PAL.skin.line)
  brows(ctx, 32, -92, 54, -102, ENEMY_PAL.skin.line)

  if (pose === 'recover') {
    openMouth(ctx, 16, -48, 20, 13, { line: ENEMY_PAL.skin.line })
    sweat(ctx, 56, -106, 1)
  } else if (pose === 'roar') {
    openMouth(ctx, 18, -50, 24, 22, { line: ENEMY_PAL.skin.line })
    shockLines(ctx, 6, -100, 78, 106)
  } else if (fine()) {
    ctx.beginPath(); ctx.moveTo(8, -50); ctx.quadraticCurveTo(22, -56, 36, -50)
    ctx.strokeStyle = ENEMY_PAL.skin.line; ctx.lineWidth = lw(1.4); ctx.lineCap = 'round'; ctx.stroke()
  }

  if (rage) embers(ctx, [[-74, -130, 1], [72, -146, 1.1], [-12, -56, .8]])

  ctx.restore()
}

export const relicKeeper = {
  id: 'boss:relic_keeper', baseR: 34, scale: 1.18, surface: 220, feetY: FEET, shadowRx: 76,
  gait: .8, floats: true, unique: true, motionMul: 2.2, topY: -218,
  frames: bossFrames(),
  frameKey: st => bossFrameKey(st, .8),
  draw,
}
