/* Seal Archbishop — black-violet vestments edged in luminous white-gold, a
 * tall split mitre, and four glowing seal tablets floating on the quadrants
 * around him. Floats; the tablets flare when he casts. */
import { lw, fine, ell, glow, openMouth } from '../slime-art/slime-painter.js'
import { BOSS_PAL as PAL, ENEMY_PAL, limb, part, brow, bossFrames, bossFrameKey, rageEyes, rageBrow, embers, sweat, shockLines } from './boss-kit.js'

const FEET = 70
const HEAD = [0, -104, 58, 54]
const FACE = [[-34, -112], [2, -120], [40, -110], [46, -84], [34, -58], [2, -50], [-28, -58], [-38, -84]]
const MITRE = [[-46, -104], [-42, -150], [-30, -204], [-6, -160], [0, -196], [8, -160], [32, -208], [44, -150], [46, -106], [30, -92], [-30, -92]]
const SINE = Math.sin

const POSE = {
  idle: { tablets: 0, hands: [[-58, 0], [58, 0]], glow: .35, slump: 0 },
  move: { tablets: 0, hands: [[-58, 0], [58, 0]], glow: .35, slump: 0 },
  windup: { tablets: .5, hands: [[-52, -34], [60, -36]], glow: 1, slump: 0 },
  strike: { tablets: 1.2, hands: [[-40, -18], [96, -20]], glow: 1.6, slump: 0 },
  recover: { tablets: -.7, hands: [[-54, 24], [54, 24]], glow: .15, slump: .14 },
  roar: { tablets: 1.5, hands: [[-56, -46], [56, -46]], glow: 1.8, slump: 0 },
}

// monument robe: square shoulders carried straight down in a slab — it should
// read as architecture, not as one more bell-shaped gown
const robePath = wv => c => {
  c.beginPath(); c.moveTo(-64, -48)
  c.bezierCurveTo(-40, -62, 40, -62, 64, -48)
  c.lineTo(74, -42)
  c.bezierCurveTo(78, -6, 78, 28, 74, 56 + 4 * SINE(wv))
  c.quadraticCurveTo(54, 64 + 4 * SINE(wv + 1), 32, 58 + 4 * SINE(wv + 2))
  c.quadraticCurveTo(16, 64 + 3 * SINE(wv + 3), 0, 58 + 4 * SINE(wv + 4))
  c.quadraticCurveTo(-16, 64 + 3 * SINE(wv + 5), -32, 58 + 4 * SINE(wv + 6))
  c.quadraticCurveTo(-54, 64 + 4 * SINE(wv + 7), -74, 56 + 4 * SINE(wv + 8))
  c.bezierCurveTo(-78, 28, -78, -6, -74, -42)
  c.closePath()
}

/** Floating seal tablet: white-gold slip with a dark glyph stroke. */
function tablet(ctx, x, y, rot, flare, rage) {
  const hot = rage ? '#ff8a5a' : '#fff0b8'
  glow(ctx, x, y, Math.min(38, 30 + flare * 16), hot, .3 + flare * .25)
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot)
  part(ctx, [[-13, -24], [13, -24], [15, 24], [-15, 24]], PAL.sealGold, [0, 0], { off: [-2, -2], sc: .9 })
  ctx.beginPath()
  ctx.moveTo(-6, -14); ctx.lineTo(6, -14); ctx.moveTo(0, -14); ctx.lineTo(0, 12); ctx.moveTo(-7, 12); ctx.lineTo(7, 12)
  ctx.strokeStyle = PAL.sealViolet.line; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke()
  ctx.restore()
}

function draw(ctx, st) {
  const pose = st.pose || 'idle'
  const P = POSE[pose] || POSE.idle
  const rage = !!st.rage
  const wv = pose === 'move' ? (st.phase || 0) * Math.PI * 4 : 0
  const flare = Math.max(0, P.glow + (rage ? .4 : 0))

  ctx.save()
  if (P.slump) { ctx.translate(0, FEET); ctx.rotate(P.slump); ctx.translate(0, -FEET) }

  // four seal tablets pinned at the diagonal corners — spread wider while casting
  const q = 1 + P.tablets * .18, tb = pose === 'move' ? SINE(wv * .5) * 5 : 0
  tablet(ctx, -100 * q, -150 * q + tb, -.08, flare, rage)
  tablet(ctx, 100 * q, -150 * q - tb, .08, flare, rage)
  tablet(ctx, -104 * q, -14 * q - tb, .08, flare, rage)
  tablet(ctx, 104 * q, -14 * q + tb, -.08, flare, rage)

  // black-violet robe, luminous centre stole and hem band
  part(ctx, robePath(wv), PAL.sealViolet, [0, 8], { off: [-6, -8], sc: .95, lights: [[-30, -8, 15, 28, -.15]] })
  part(ctx, [[-14, -46], [0, -50], [14, -46], [18, 54], [0, 62], [-18, 54]], PAL.sealGold, [0, 4], { off: [-2, -3], sc: .94 })
  part(ctx, [[-64, 30], [0, 38], [64, 30], [66, 46], [0, 54], [-66, 46]], PAL.sealGold, [0, 42], { off: [-2, -3], sc: .94 })
  // squared shoulder capelet — reinforces the slab silhouette
  part(ctx, [[-76, -52], [0, -60], [76, -52], [80, -24], [0, -14], [-80, -24]], PAL.sealViolet, [0, -36], { off: [-3, -4], sc: .94, lights: [[-28, -46, 14, 7, -.2]] })

  // both arms: sleeves reach forward, hands bare — strike sends the right hand out
  for (const [i, [ax, ay]] of P.hands.entries()) {
    const sx = i === 0 ? -1 : 1
    limb(ctx, sx * 44, -36, ax - 4 * sx, ay - 2, 25, PAL.sealViolet)
    part(ctx, c => ell(c, ax - 3 * sx, ay - 1, 22, 19, .2 * sx), PAL.sealViolet, [ax - 3 * sx, ay - 1], { off: [-4, -5], sc: .9 })
    part(ctx, c => ell(c, ax, ay + 3, 11, 11, 0), ENEMY_PAL.skin, [ax, ay + 3], { off: [-2, -2], sc: .85 })
  }
  if (P.glow >= 1) {
    for (const [ax, ay] of P.hands) glow(ctx, ax, ay - 22, 26 * P.glow, rage ? '#ff8a5a' : '#fff0b8', .5)
  }

  // split mitre: two tall black-violet horns edged in white-gold
  part(ctx, c => ell(c, HEAD[0], HEAD[1], HEAD[2], HEAD[3], 0), ENEMY_PAL.skin, [0, -104], { off: [-5, -6], sc: .94, lights: [[-20, -128, 18, 9, -.3]] })
  part(ctx, FACE, ENEMY_PAL.skin, [2, -84], { off: [-3, -4], sc: .94, ol: .8 })
  part(ctx, MITRE, PAL.sealViolet, [0, -146], { off: [-5, -6], sc: .95, lights: [[-24, -180, 14, 20, -.2]], spec: [-26, -188, -.4, 1.4, .9] })
  // luminous band at the mitre base and the centre seam
  part(ctx, [[-44, -110], [44, -110], [46, -96], [-46, -96]], PAL.sealGold, [0, -103], { off: [-2, -2], sc: .9 })
  ctx.beginPath(); ctx.moveTo(0, -196); ctx.lineTo(0, -112)
  ctx.strokeStyle = PAL.sealGold.base; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.stroke()

  if (rage) rageEyes(ctx, -14, -88, 40, 1.05)
  else for (const ex of [-14, 26]) {
    ell(ctx, ex, -88, 8.5, 11, 0, ENEMY_PAL.eyeInk)
    ell(ctx, ex - 2.6, -92, 3.2, 3.8, 0, '#fff')
  }
  const brows = rage ? rageBrow : brow
  brows(ctx, -30, -112, -4, -100, ENEMY_PAL.skin.line)
  brows(ctx, 20, -100, 42, -112, ENEMY_PAL.skin.line)

  if (pose === 'recover') {
    openMouth(ctx, 4, -52, 20, 13, { line: ENEMY_PAL.skin.line })
    sweat(ctx, 46, -114, 1)
  } else if (pose === 'roar') {
    openMouth(ctx, 6, -54, 24, 22, { line: ENEMY_PAL.skin.line })
    shockLines(ctx, -4, -108, 78, 106)
  } else if (fine()) {
    ctx.beginPath(); ctx.moveTo(-4, -54); ctx.quadraticCurveTo(10, -60, 24, -54)
    ctx.strokeStyle = ENEMY_PAL.skin.line; ctx.lineWidth = lw(1.4); ctx.lineCap = 'round'; ctx.stroke()
  }

  if (rage) embers(ctx, [[-76, -140, 1], [76, -150, 1.1], [-14, -56, .8]])

  ctx.restore()
}

export const sealArchbishop = {
  id: 'boss:seal_archbishop', baseR: 34, scale: 1.18, surface: 206, feetY: FEET, shadowRx: 76,
  gait: .8, floats: true, unique: true, motionMul: 2.2, topY: -214,
  frames: bossFrames(),
  frameKey: st => bossFrameKey(st, .8),
  draw,
}
