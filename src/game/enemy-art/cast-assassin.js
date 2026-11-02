/* Assassin — plum hood with a skin eye-band and hot red slit eyes, magenta scarf streaming back, twin daggers. Faces +x. */
import { TAU, glow, ell } from '../slime-art/slime-painter.js'
import { ENEMY_PAL as PAL, shiftPts, limb, part, brow, moveFrames, frameIndex } from './enemy-kit.js'

const FEET = 90
const BOOT = [[-14, 58], [14, 58], [16, 74], [30, 82], [26, 94], [-14, 94], [-18, 76]]
const SUIT = [[-40, -38], [0, -44], [40, -38], [46, 0], [42, 54], [0, 64], [-42, 54], [-46, 0]]
const BAND = [[-46, -108], [0, -114], [50, -108], [48, -80], [0, -72], [-44, -80]]
const STARS = [[-34, -170, 9], [10, -184, 11], [48, -166, 8]]

const POSE = {
  idle: { lean: .08, dy: 0, sy: 1, scarf: [90, 10], f: [80, 22, 2.4], b: [-72, 22, -2.4], eye: 1 },
  move: { lean: .14, dy: 0, sy: 1, scarf: [110, 18], f: [82, 14, 2.1], b: [-74, 14, -2.1], eye: 1 },
  charge: { lean: -.14, dy: 6, sy: .92, scarf: [96, 44], f: [86, -44, .35], b: [-70, -30, -.35], eye: 2 },
  dash: { lean: .5, dy: 0, sy: .94, scarf: [168, 6], f: [100, -36, 1.5], b: [72, -62, 1.45], eye: 2 },
  dazed: { lean: -.1, dy: 4, sy: 1, scarf: [70, -8], f: [70, 38, 2.9], b: [-66, 38, -2.9], eye: 0 },
}

function dagger(ctx, hx, hy, rot) {
  limb(ctx, hx > 0 ? 46 : -46, -30, hx, hy, 20, PAL.ninja)
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(rot)
  part(ctx, [[-6, -2], [6, -2], [6, 24], [-6, 24]], PAL.leather, [0, 11], { off: [-1.5, -2], sc: .9 })
  part(ctx, [[-8, -6], [-6, -72], [0, -90], [6, -72], [8, -6]], PAL.steel, [0, -46], { off: [-2.2, -3], sc: .86, spec: [-1, -50, 1.5, .5, .9] })
  part(ctx, [[-17, -8], [17, -8], [18, 0], [-18, 0]], PAL.scarf, [0, -4], { off: [-1.5, -2], sc: .9 })
  ctx.restore()
  part(ctx, c => ell(c, hx, hy, 13, 13, 0), PAL.ninjaDark, [hx, hy], { off: [-3, -3], sc: .88 })
}

function scarfTail(ctx, len, lift, wave) {
  const path = c => {
    c.beginPath(); c.moveTo(-18, -54)
    c.quadraticCurveTo(-len * .5, -54 - lift + wave * 8, -len, -42 - lift * 1.2 + wave * 14)
    c.lineTo(-len + 14, -16 - lift * .8 + wave * 14)
    c.quadraticCurveTo(-len * .5, -34 - lift * .6 + wave * 8, -14, -32)
    c.closePath()
  }
  part(ctx, path, PAL.scarf, [-len * .5, -40 - lift * .6], { off: [-3, -4], sc: .9 })
}

function draw(ctx, st) {
  const pose = st.pose || 'idle'
  const P = POSE[pose] || POSE.idle
  const ph = (st.phase || 0) * TAU
  const mv = pose === 'move', dash = pose === 'dash'
  const spread = mv ? Math.cos(ph) : 0
  const liftF = mv ? Math.max(0, Math.sin(ph)) : 0
  const liftB = mv ? Math.max(0, -Math.sin(ph)) : 0
  const wave = mv ? Math.sin(ph) : dash ? .3 : 0
  const swing = mv ? Math.sin(ph) * .3 : 0

  ctx.save()
  ctx.translate(0, FEET); ctx.rotate(P.lean); ctx.scale(dash ? 1.08 : 1, P.sy); ctx.translate(0, -FEET + P.dy)

  scarfTail(ctx, P.scarf[0], P.scarf[1], wave)

  // boots: the dash trails the back foot and tucks the front one
  for (const [x, lift, dir] of [[-22, liftB, -1], [22, liftF, 1]]) {
    const dx = (dash ? (dir > 0 ? 8 : -38) : x + dir * spread * 14), dy = dash && dir < 0 ? -18 : -lift * 11
    part(ctx, shiftPts(BOOT, dx, dy), PAL.ninjaDark, [dx + 4, 78 + dy], { off: [-3, -4], sc: .9 })
  }

  part(ctx, SUIT, PAL.ninja, [0, 12], { lights: [[-24, -10, 12, 22, -.2]] })
  part(ctx, [[-46, 26], [0, 32], [46, 26], [48, 42], [0, 48], [-48, 42]], PAL.scarf, [0, 37], { off: [-2, -3], sc: .94 })
  // neck wrap
  part(ctx, c => ell(c, 0, -48, 38, 13, 0), PAL.scarf, [0, -48], { off: [-3, -3], sc: .9 })

  // back-hand dagger sits behind the head, front-hand dagger is drawn last
  dagger(ctx, P.b[0], P.b[1] - swing * 20, P.b[2] - swing)

  // hood, eye band and eyes
  const hood = c => ell(c, 0, -104, 60, 54, 0)
  part(ctx, [[-44, -138], [-84, -150], [-64, -118]], PAL.ninja, [-62, -136], { off: [-2, -3], sc: .85 })
  part(ctx, hood, PAL.ninja, [0, -104], { off: [-5, -6], sc: .94, lights: [[-24, -134, 20, 10, -.4]], spec: [-28, -140, -.4, 1.6, .85] })
  part(ctx, BAND, PAL.skin, [2, -92], { off: [-3, -3], sc: .94, ol: .8 })
  const ex = [[-18, -94, .3], [30, -94, -.3]]
  for (const [x, y, rot] of ex) {
    if (P.eye) glow(ctx, x, y, 26, PAL.eyeHot, P.eye > 1 ? .6 : .32)
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot)
    if (P.eye) { ell(ctx, 0, 0, 12, 7 + (P.eye > 1 ? 1.5 : 0), 0, PAL.eyeHot); ell(ctx, -2, -1.5, 5, 2.6, 0, '#fff') }
    else ell(ctx, 0, 1, 11, 3.4, 0, PAL.skin.line)
    ctx.restore()
  }
  brow(ctx, -34, -108, -4, -98, PAL.ninja.line)
  brow(ctx, 18, -98, 48, -108, PAL.ninja.line)
  if (!P.eye) for (const [x, y, s] of STARS) ell(ctx, x, y, s, s, 0, PAL.gold.light)

  dagger(ctx, P.f[0], P.f[1] + swing * 20, P.f[2] + swing)
  ctx.restore()
}

export const assassin = {
  id: 'assassin', baseR: 12, scale: 1.3, surface: 88, feetY: FEET, shadowRx: 70, gait: 1.4,
  frames: [['idle', { pose: 'idle' }], ...moveFrames(), ['charge', { pose: 'charge' }], ['dash', { pose: 'dash' }], ['dazed', { pose: 'dazed' }]],
  /** `stance` is the assassin state machine (stalking / charging / dashing / cooldown), read-only. */
  frameKey: st => st.stance === 'dashing' ? 'dash' : st.stance === 'charging' ? 'charge'
    : st.stance === 'cooldown' && !st.moving ? 'dazed' : st.moving ? `move${frameIndex(st.walkT || 0, 1.4)}` : 'idle',
  draw,
}
