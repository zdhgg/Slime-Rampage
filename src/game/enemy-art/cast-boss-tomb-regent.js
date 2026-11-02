/* Tomb Regent — a bone-ivory royal ghost: tattered regalia dissolving into a
 * translucent spectral tail, a spiked crown, and a hollow face with glowing
 * violet eyes. Floats; the clawed arms do the casting. */
import { lw, fine, ell, glow, rgba } from '../slime-art/slime-painter.js'
import { BOSS_PAL as PAL, ENEMY_PAL, limb, part, bossFrames, bossFrameKey, embers, shockLines } from './boss-kit.js'

const FEET = 78
const SINE = Math.sin

const POSE = {
  idle: { arms: [[-58, -16], [58, -16]], claw: .35, eye: 1, lean: 0, crown: 0, tail: 0 },
  move: { arms: [[-58, -16], [58, -16]], claw: .35, eye: 1, lean: .03, crown: 0, tail: 0 },
  windup: { arms: [[-44, -66], [64, -58]], claw: .6, eye: 1.5, lean: -.08, crown: 0, tail: .3 },
  strike: { arms: [[38, -34], [96, -18]], claw: 1, eye: 1.8, lean: .13, crown: 0, tail: .5 },
  recover: { arms: [[-52, 8], [52, 8]], claw: .2, eye: .7, lean: .15, crown: .08, tail: -.3 },
  roar: { arms: [[-52, -72], [52, -72]], claw: .8, eye: 1.9, lean: -.08, crown: 0, tail: .6 },
}

// royal shroud: narrow shoulders, then the whole body dissolves into one long
// ragged wisp tail — no legs, and the torn tips are deliberately asymmetric
const bodyPath = wv => c => {
  c.beginPath(); c.moveTo(-30, -46)
  c.bezierCurveTo(-12, -58, 12, -58, 30, -46)
  c.bezierCurveTo(36, -16, 36, 8, 40, 30)
  c.quadraticCurveTo(46, 56 + 4 * SINE(wv), 38, 86 + 5 * SINE(wv + 1))
  c.quadraticCurveTo(30, 116 + 6 * SINE(wv + 2), 12, 92 + 5 * SINE(wv + 3))
  c.quadraticCurveTo(2, 76 + 5 * SINE(wv + 4), -8, 98 + 6 * SINE(wv + 5))
  c.quadraticCurveTo(-18, 110 + 5 * SINE(wv + 6), -28, 78 + 4 * SINE(wv + 7))
  c.quadraticCurveTo(-34, 52 + 4 * SINE(wv + 8), -36, 28)
  c.bezierCurveTo(-37, 6, -37, -20, -30, -46); c.closePath()
}

function draw(ctx, st) {
  const pose = st.pose || 'idle'
  const P = POSE[pose] || POSE.idle
  const rage = !!st.rage
  const wv = (st.phase || 0) * Math.PI * 4

  ctx.save()
  ctx.translate(0, FEET); ctx.rotate(P.lean); ctx.translate(0, -FEET)

  // spectral mist under the tail — part of the art, not the world shadow
  ell(ctx, 2, 66, 50, 13, 0, rgba(PAL.tombGhost.base, .16))

  // clawed spectral arms; strike reaches both forward (+x)
  for (const [i, [ax, ay]] of P.arms.entries()) {
    const back = i === 0
    const reach = pose === 'strike' ? (back ? .5 : 1) : 0
    limb(ctx, back ? -34 : 34, -34, ax, ay, 15, PAL.tombIvory, back ? -50 : 50, -20 + reach * 8)
    ctx.strokeStyle = PAL.tombGhost.light; ctx.lineWidth = lw(1.4); ctx.lineCap = 'round'
    for (let cix = -1; cix <= 1; cix++) {
      ctx.beginPath()
      ctx.moveTo(ax, ay + 2)
      ctx.lineTo(ax + (pose === 'strike' ? 16 : 5) + cix * (pose === 'strike' ? 3 : 7), ay + 9 * (2 + P.claw) + cix * 2)
      ctx.stroke()
    }
    ell(ctx, ax, ay, 10, 10, 0, PAL.tombIvory.base)
  }

  // ivory shroud + translucent ghost tail tips
  part(ctx, bodyPath(wv), PAL.tombIvory, [0, 4], { off: [-6, -8], sc: .95, lights: [[-26, -28, 14, 24, -.2]] })
  ctx.globalAlpha *= .5
  for (const [tx, ty, i] of [[26, 100, 0], [4, 110, 1], [-20, 88, 2]]) {
    ell(ctx, tx + SINE(wv + i * 1.7) * 6, ty + SINE(wv + i * 2.3) * 5, 8, 10, .2, rgba(PAL.tombGhost.base, .8))
  }
  ctx.globalAlpha /= .5
  // spectral seams up the robe
  ctx.beginPath(); ctx.moveTo(0, -44); ctx.lineTo(0, 40)
  ctx.strokeStyle = rgba(PAL.tombGhost.base, .85); ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.stroke()
  part(ctx, [[-50, 2], [0, 10], [50, 2], [52, 16], [0, 24], [-52, 16]], PAL.tombGhost, [0, 13], { off: [-2, -3], sc: .94 })

  // cracked gold circlet under the crown
  part(ctx, [[-32, -58], [32, -58], [34, -46], [-34, -46]], ENEMY_PAL.gold, [0, -52], { off: [-2, -2], sc: .9 })

  // hollow skull face under a spiked crown — the glowing sockets are the face
  ctx.save(); ctx.translate(0, -60); ctx.rotate(P.crown); ctx.translate(0, 60)
  part(ctx, c => ell(c, 0, -98, 56, 50, 0), PAL.tombIvory, [0, -98], { off: [-5, -6], sc: .94, lights: [[-20, -122, 18, 9, -.3]] })
  // hollow face cavity
  part(ctx, [[-32, -112], [0, -120], [34, -110], [38, -84], [26, -60], [0, -54], [-26, -62], [-36, -86]], PAL.cmdrBlack, [2, -86], { off: [-2, -3], sc: .94, ol: .7 })
  // spiked crown: band + five points
  part(ctx, [[-46, -128], [46, -128], [48, -112], [-48, -112]], ENEMY_PAL.gold, [0, -120], { off: [-2, -2], sc: .9 })
  for (const [cx2, ch] of [[-40, 34], [-20, 52], [0, 64], [20, 52], [40, 34]]) {
    part(ctx, [[cx2 - 8, -128], [cx2, -128 - ch], [cx2 + 8, -128]], PAL.tombIvory, [cx2, -128 - ch / 2], { off: [-1.5, -2], sc: .88, spec: [cx2 - 3, -128 - ch + 8, -.4, .5, .8] })
  }
  ctx.restore()

  // glowing hollow eyes: violet sockets angled hostile, brighter when casting
  const eyeGlowAmt = P.eye + (rage ? .6 : 0)
  const eyeCol = rage ? '#ff6a4a' : '#b8a4ff'
  for (const [ex, rot] of [[-12, .3], [24, -.3]]) {
    glow(ctx, ex, -90, 24 * eyeGlowAmt, rage ? '#ff5a3c' : '#8a76e8', .35 + eyeGlowAmt * .18)
    ctx.save(); ctx.translate(ex, -90); ctx.rotate(rot)
    ell(ctx, 0, 0, 7.5 * Math.min(eyeGlowAmt, 1.4), 10 * Math.min(eyeGlowAmt, 1.4), 0, eyeCol)
    ell(ctx, 0, 0, 2.8, 7, 0, '#241a4a')
    ctx.restore()
  }
  if (pose === 'roar') {
    // the hollow jaw drops open and glows — a spectral howl
    ctx.beginPath(); ctx.moveTo(-6, -70); ctx.quadraticCurveTo(6, -64, 18, -70)
    ctx.bezierCurveTo(20, -48, -4, -46, -6, -70); ctx.closePath()
    ctx.fillStyle = '#3a2a6e'; ctx.fill()
    ell(ctx, 6, -54, 8, 5, 0, '#b8a4ff')
    shockLines(ctx, 0, -110, 80, 108)
  } else if (fine()) {
    ctx.beginPath(); ctx.moveTo(-4, -64); ctx.quadraticCurveTo(8, -58, 22, -64)
    ctx.strokeStyle = '#b8a4ff'; ctx.lineWidth = lw(1.3); ctx.lineCap = 'round'; ctx.stroke()
  }

  if (rage) embers(ctx, [[-70, -120, 1], [66, -140, 1.1], [-14, -50, .8]])

  ctx.restore()
}

export const tombRegent = {
  id: 'boss:tomb_regent', baseR: 34, scale: 1.18, surface: 200, feetY: FEET, shadowRx: 74,
  gait: .8, floats: true, unique: true, motionMul: 2.2, topY: -196,
  frames: bossFrames(),
  frameKey: st => bossFrameKey(st, .8),
  draw,
}
