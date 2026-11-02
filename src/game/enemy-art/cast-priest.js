/* Priest — white-and-gold choir robe, floating halo, gold-cross staff topped with a sun orb. Floats like the mage. */
import { lw, olPx, fine, ell, glow, rgba } from '../slime-art/slime-painter.js'
import { ENEMY_PAL as PAL, VISUAL_SCALE, limb, part, brow, moveFrames, frameIndex } from './enemy-kit.js'

const FEET = 80
const WIMPLE = [[-52, -88], [-46, -128], [-18, -152], [16, -154], [44, -134], [54, -96], [44, -60], [8, -48], [-30, -54], [-52, -70]]
const FACE = [[-30, -106], [2, -112], [34, -106], [38, -82], [28, -58], [2, -50], [-22, -58], [-32, -82]]

const POSE = {
  idle: { hand: [84, 8], tilt: .08, orb: 19, glow: .35, halo: 1, arm: [-62, 16] },
  move: { hand: [84, 8], tilt: .08, orb: 19, glow: .35, halo: 1, arm: [-62, 16] },
  heal: { hand: [88, -30], tilt: -.16, orb: 26, glow: 1.15, halo: 1.5, arm: [-58, -22] },
}

const sine = Math.sin
const robePath = wv => c => {
  c.beginPath(); c.moveTo(-46, -44)
  c.bezierCurveTo(-26, -56, 26, -56, 46, -44)
  c.bezierCurveTo(58, -12, 66, 32, 76, 66 + 4 * sine(wv))
  c.quadraticCurveTo(56, 86 + 4 * sine(wv + 1), 38, 70 + 4 * sine(wv + 2))
  c.quadraticCurveTo(19, 86 + 4 * sine(wv + 3), 0, 70 + 4 * sine(wv + 4))
  c.quadraticCurveTo(-19, 86 + 4 * sine(wv + 5), -38, 70 + 4 * sine(wv + 6))
  c.quadraticCurveTo(-56, 86 + 4 * sine(wv + 7), -76, 66 + 4 * sine(wv + 8))
  c.bezierCurveTo(-66, 32, -58, -12, -46, -44); c.closePath()
}

function draw(ctx, st) {
  const pose = st.pose || 'idle'
  const P = POSE[pose] || POSE.idle
  const wv = pose === 'move' ? (st.phase || 0) * Math.PI * 4 : 0
  const heal = pose === 'heal'
  const [hx, hy] = P.hand

  ctx.save()
  // staff first: sleeve and hand overlap it; cross + sun orb on top
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(P.tilt)
  limb(ctx, 0, 76, 0, -118, 11, PAL.gold)
  const oy = -138
  if (P.glow) glow(ctx, 0, oy, 50 * P.glow, '#ffd45e', heal ? .75 : .3)
  ctx.lineCap = 'round'
  ctx.strokeStyle = PAL.gold.line; ctx.lineWidth = 10 + lw(olPx()) * 2
  ctx.beginPath(); ctx.moveTo(-19, oy - 6); ctx.lineTo(19, oy - 6); ctx.stroke()
  ctx.strokeStyle = PAL.gold.base; ctx.lineWidth = 10
  ctx.beginPath(); ctx.moveTo(-19, oy - 6); ctx.lineTo(19, oy - 6); ctx.stroke()
  part(ctx, c => ell(c, 0, oy + 14, P.orb, P.orb, 0), PAL.orb, [0, oy + 14], { off: [-4, -5], sc: .9, spec: [-6, oy + 6, -.5, 1.3, .95] })
  if (heal) ell(ctx, 0, oy + 14, P.orb * .6, P.orb * .6, 0, 'rgba(255,255,255,.9)')
  ctx.restore()

  // robe with scalloped hem, gold hem band and gold cross on the chest
  part(ctx, robePath(wv), PAL.cloth, [0, 12], { off: [-6, -8], sc: .95, lights: [[-28, -2, 14, 28, -.15]] })
  part(ctx, [[-62, 52], [0, 62], [62, 52], [64, 66], [0, 76], [-64, 66]], PAL.gold, [0, 64], { off: [-2, -3], sc: .94 })
  ctx.lineCap = 'round'
  ctx.strokeStyle = rgba(PAL.gold.base, .95); ctx.lineWidth = 9
  ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(0, 4); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(-14, -16); ctx.lineTo(14, -16); ctx.stroke()
  part(ctx, [[-54, 6], [0, 14], [54, 6], [56, 20], [0, 28], [-56, 20]], PAL.gold, [0, 17], { off: [-2, -3], sc: .94 })

  // off-hand sleeve: hangs idle, lifts in prayer while healing
  const [ax, ay] = P.arm
  part(ctx, c => ell(c, ax, ay, 22, 26, -.15), PAL.cloth, [ax, ay], { off: [-4, -5], sc: .9 })
  part(ctx, c => ell(c, ax - 4, ay + (heal ? -20 : 22), 10, 10, 0), PAL.skin, [ax - 4, ay + 22], { off: [-2, -2], sc: .85 })
  if (heal) {
    glow(ctx, ax - 4, ay - 44, 26, '#ffe98c', .8)
    ell(ctx, ax - 4, ay - 44, 8, 8, 0, '#fff5cf')
  }

  // staff-hand sleeve + hand
  limb(ctx, 40, -32, hx - 10, hy - 4, 24, PAL.cloth)
  part(ctx, c => ell(c, hx - 4, hy, 22, 18, .2), PAL.cloth, [hx - 4, hy], { off: [-4, -5], sc: .9 })
  part(ctx, c => ell(c, hx, hy + 4, 10, 10, 0), PAL.skin, [hx, hy + 4], { off: [-2, -2], sc: .85 })

  // wimple hood with a gold circlet, skin face, calm hostile eyes
  part(ctx, WIMPLE, PAL.cloth, [0, -100], { off: [-6, -7], sc: .95, lights: [[-24, -128, 18, 10, -.4]], spec: [-28, -134, -.4, 1.6, .9] })
  part(ctx, FACE, PAL.skin, [4, -82], { off: [-4, -5], sc: .94, ol: .8 })
  ctx.beginPath(); ctx.moveTo(-36, -116); ctx.quadraticCurveTo(2, -132, 40, -114)
  ctx.strokeStyle = PAL.gold.base; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.stroke()
  for (const ex of [-8, 22]) {
    ell(ctx, ex, -82, 7.5, 9.5, 0, PAL.eyeInk)
    ell(ctx, ex - 2.2, -85, 2.8, 3.4, 0, '#fff')
  }
  brow(ctx, -22, -100, -2, -93, PAL.skin.line)
  brow(ctx, 12, -93, 32, -102, PAL.skin.line)
  if (fine()) {
    ctx.beginPath(); ctx.moveTo(-4, -62); ctx.quadraticCurveTo(8, -58, 20, -64)
    ctx.strokeStyle = PAL.skin.line; ctx.lineWidth = lw(1.3); ctx.lineCap = 'round'; ctx.stroke()
  }

  // floating halo — the priest's read-at-r14 anchor
  const hy2 = -196, hs = P.halo
  glow(ctx, 2, hy2, 46 * hs, '#ffd45e', heal ? .6 : .3)
  ctx.save(); ctx.translate(2, hy2); ctx.scale(1, .34)
  ctx.beginPath(); ctx.arc(0, 0, 30 * hs, 0, Math.PI * 2)
  ctx.strokeStyle = PAL.gold.line; ctx.lineWidth = 10 + lw(olPx()) * 2; ctx.stroke()
  ctx.strokeStyle = heal ? '#ffe6a0' : PAL.gold.base; ctx.lineWidth = 10; ctx.stroke()
  ctx.restore()
  ctx.restore()
}

export const priest = {
  id: 'priest', baseR: 13, scale: VISUAL_SCALE, surface: 88, feetY: FEET, shadowRx: 62, floats: true,
  frames: [['idle', { pose: 'idle' }], ...moveFrames(), ['heal', { pose: 'heal' }]],
  frameKey: st => st.casting === 'heal' ? 'heal' : st.moving ? `move${frameIndex(st.walkT || 0)}` : 'idle',
  draw,
}
