/* Alchemist — full chunky chibi grenadier wearing brass-rimmed crimson-berry alchemy goggles,
 * heavy glowing crimson-magenta toxin canister pack and raised bubbling potion flask. */
import { TAU, lw, olPx, fine, ell, glow } from '../slime-art/slime-painter.js'
import { ENEMY_PAL as PAL, VISUAL_SCALE, shiftPts, limb, part, moveFrames, frameIndex } from './enemy-kit.js'

const APRON = { base: '#57534e', shade: '#36322f', light: '#8a837b', line: '#1d1b18' }
const BRASS = { base: '#e0a93b', shade: '#92671d', light: '#fae08c', line: '#2a1f0d' }
const VENOM = { base: '#e11d74', shade: '#881349', light: '#fda4c8', line: '#36081d' }
const HOOD = { base: '#4a5568', shade: '#2d3748', light: '#718096', line: '#171c26' }
const FEET = 92
const BODY = [[-48, -42], [0, -50], [48, -42], [54, 14], [48, 62], [0, 70], [-48, 62], [-54, 14]]
const HEAD = [2, -96, 52, 46]
const BOOT = [[-19, 56], [19, 56], [21, 74], [38, 82], [33, 94], [-20, 94], [-25, 76]]

const POSE = {
  idle: { lean: 0, hand: [66, -18], flask: .18, glowR: 22 },
  move: { lean: .05, hand: [66, -14], flask: .26, glowR: 22 },
  charge: { lean: -.1, hand: [48, -96], flask: -.38, glowR: 32 },
  throw: { lean: .16, hand: [84, -40], flask: .95, glowR: 38 },
}

function drawFlask(ctx, r = 1) {
  ctx.save(); ctx.scale(r, r)
  part(ctx, [[-11, -30], [11, -30], [9, -12], [-9, -12]], BRASS, [0, -20], { off: [-1.5, -2], sc: .85 })
  part(ctx, c => ell(c, 0, 8, 22, 21, 0), VENOM, [0, 8], { off: [-3, -4], sc: .92, spec: [-8, -2, -.5, 1.3, .9] })
  ell(ctx, -7, 2, 6, 7, -.3, '#ffe4f0')
  ctx.restore()
}

function draw(ctx, st) {
  const pose = st.pose || 'idle'
  const P = POSE[pose] || POSE.idle
  const ph = (st.phase || 0) * TAU
  const mv = pose === 'move'
  const spread = mv ? Math.cos(ph) : 0
  const liftF = mv ? Math.max(0, Math.sin(ph)) : 0
  const liftB = mv ? Math.max(0, -Math.sin(ph)) : 0

  ctx.save()
  ctx.translate(0, FEET); ctx.rotate(P.lean); ctx.translate(0, -FEET)

  // boots
  for (const [x, lift, dir] of [[-24, liftB, -1], [24, liftF, 1]]) {
    const dx = x + dir * spread * 14, dy = -lift * 11
    part(ctx, shiftPts(BOOT, dx, dy), PAL.leather, [dx + 4, 76 + dy], { off: [-3, -4], sc: .9 })
  }

  // bulging glowing crimson-magenta toxin tank strapped behind torso
  part(ctx, [[-74, -48], [-32, -48], [-30, 18], [-74, 18]], BRASS, [-52, -15], { off: [-3, -3], sc: .9 })
  part(ctx, [[-66, -34], [-38, -34], [-38, 6], [-66, 6]], VENOM, [-52, -14], { off: [-2, -2], sc: .92 })
  glow(ctx, -52, -14, 24, '#e11d74', .52)

  // broad alchemy apron + potion belt
  part(ctx, BODY, APRON, [0, 10], { off: [-5, -6], sc: .95, lights: [[-18, -16, 14, 22, -.2]] })
  part(ctx, [[-50, 12], [0, 20], [50, 12], [50, 30], [0, 36], [-50, 30]], PAL.leather, [0, 24], { off: [-2, -2], sc: .92 })
  for (const vx of [-24, 0, 24]) {
    part(ctx, [[vx - 7, 16], [vx + 7, 16], [vx + 7, 40], [vx - 7, 40]], VENOM, [vx, 28], { off: [-1, -1.5], sc: .88 })
  }

  // chunky hooded head + giant glowing brass goggles
  part(ctx, [[-58, -94], [-52, -142], [0, -156], [52, -142], [58, -94], [44, -56], [-44, -56]], HOOD, [0, -104], { off: [-5, -6], sc: .95 })
  part(ctx, c => ell(c, HEAD[0], HEAD[1], HEAD[2], HEAD[3], 0), PAL.leather, [2, -96], { off: [-4, -5], sc: .92 })
  for (const gx of [-15, 22]) {
    part(ctx, c => ell(c, gx, -96, 19, 17, 0), BRASS, [gx, -96], { off: [-2, -2], sc: .9 })
    ell(ctx, gx, -96, 12.5, 11.5, 0, '#fb719c')
    ell(ctx, gx - 3.5, -100, 4.2, 4, 0, '#ffffff')
  }
  ctx.strokeStyle = PAL.leather.line; ctx.lineWidth = lw(olPx()); ctx.beginPath(); ctx.moveTo(2, -96); ctx.lineTo(8, -96); ctx.stroke()

  // throwing arm & bubbling crimson-magenta flask
  const [hx, hy] = P.hand
  limb(ctx, 44, -26, hx - 8, hy + 4, 20, APRON)
  part(ctx, c => ell(c, hx, hy, 14, 13, 0), PAL.leather, [hx, hy], { off: [-2, -2], sc: .88 })
  ctx.save(); ctx.translate(hx + 8, hy - 14); ctx.rotate(P.flask)
  glow(ctx, 0, 6, P.glowR, '#e11d74', pose === 'charge' || pose === 'throw' ? .85 : .54)
  drawFlask(ctx, pose === 'charge' ? 1.15 : 1.05)
  ctx.restore()

  if (fine() && (pose === 'charge' || pose === 'throw')) {
    ctx.strokeStyle = 'rgba(255,108,152,.88)'; ctx.lineWidth = lw(1.4); ctx.lineCap = 'round'
    for (const [fx, fy] of [[hx - 10, hy - 44], [hx + 24, hy - 34]]) {
      ctx.beginPath(); ctx.arc(fx, fy, 4.5, 0, TAU); ctx.stroke()
    }
  }

  ctx.restore()
}

export const alchemist = {
  id: 'alchemist', baseR: 13, scale: VISUAL_SCALE * 1.04, surface: 94, feetY: FEET, shadowRx: 80, gait: 1, topY: -164,
  frames: [
    ['idle', { pose: 'idle' }],
    ...moveFrames(),
    ['charge', { pose: 'charge' }],
    ['throw', { pose: 'throw' }],
  ],
  frameKey: st => (st.casting === 'fire' ? 'throw' : st.casting === 'charge' ? 'charge' : st.moving ? `move${frameIndex(st.walkT || 0)}` : 'idle'),
  draw,
}
