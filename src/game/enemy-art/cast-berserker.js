/* Berserker — bare bronze chest with crossed straps, wolf-pelt shoulders, spiky red hair, huge double axe.
 * Enraged variants (r_*) bake in flared hair, white-hot eyes and a burning axe gem — the cache keys carry the state. */
import { TAU, lw, olPx, fine, ell, glow } from '../slime-art/slime-painter.js'
import { ENEMY_PAL as PAL, VISUAL_SCALE, shiftPts, insetPts, limb, part, brow, moveFrames, frameIndex } from './enemy-kit.js'

const FEET = 92
const HAIR = [[-34, -116], [-48, -146], [-30, -140], [-34, -168], [-12, -148], [-10, -180], [6, -152], [18, -184], [26, -150], [44, -166], [38, -136], [48, -128], [34, -108]]
const HEAD = [2, -98, 52, 46]
const TORSO = [[-46, -44], [0, -54], [46, -44], [54, -2], [46, 44], [0, 54], [-46, 44], [-54, -2]]
const PELT = [[-56, -58], [-30, -78], [0, -86], [30, -78], [56, -58], [44, -44], [52, -56], [30, -50], [36, -36], [0, -62], [-36, -36], [-30, -50], [-52, -56], [-44, -44]]
const BOOT = [[-19, 56], [19, 56], [21, 74], [38, 82], [33, 94], [-20, 94], [-25, 76]]
const BLADE = [[2, -26], [-36, -44], [-54, -18], [-50, 14], [-34, 36], [2, 22]]

const POSE = {
  idle: { hand: [76, 8], axe: .34, lean: 0, raise: 0 },
  move: { hand: [76, 8], axe: .34, lean: .04, raise: 0 },
  swing: { hand: [84, -30], axe: 1.4, lean: .12, raise: 0 },
}

function draw(ctx, st) {
  const pose = st.pose || 'idle'
  const P = POSE[pose] || POSE.idle
  const rage = !!st.rage
  const ph = (st.phase || 0) * TAU
  const mv = pose === 'move'
  const spread = mv ? Math.cos(ph) : 0
  const liftF = mv ? Math.max(0, Math.sin(ph)) : 0
  const liftB = mv ? Math.max(0, -Math.sin(ph)) : 0

  ctx.save()
  ctx.translate(0, FEET); ctx.rotate(P.lean); ctx.translate(0, -FEET)

  // fur boots, toes forward
  for (const [x, lift, dir] of [[-24, liftB, -1], [24, liftF, 1]]) {
    const dx = x + dir * spread * 15, dy = -lift * 12
    part(ctx, shiftPts(BOOT, dx, dy), PAL.pelt, [dx + 4, 76 + dy], { off: [-3, -4], sc: .9 })
  }

  // wolf pelt across the shoulders first — the torso overlaps its lower edge
  part(ctx, PELT, PAL.furDark, [0, -56], { off: [-4, -5], sc: .94 })
  if (rage) for (const fx of [-38, 38]) {
    part(ctx, [[fx - 9, -78], [fx - 2, -102], [fx + 4, -80], [fx + 10, -96], [fx + 13, -72]], PAL.plume, [fx, -84], { off: [-1.5, -2], sc: .8, ol: .6 })
  }

  // bare torso with crossed war straps and a steel buckle
  part(ctx, TORSO, PAL.skinWarm, [0, -2], { off: [-5, -6], sc: .95, lights: [[-24, -30, 14, 18, -.3]] })
  ctx.lineCap = 'round'
  ctx.strokeStyle = PAL.leather.line; ctx.lineWidth = 13 + lw(olPx()) * 2
  ctx.beginPath(); ctx.moveTo(-42, -46); ctx.lineTo(30, 34); ctx.moveTo(42, -46); ctx.lineTo(-30, 34); ctx.stroke()
  ctx.strokeStyle = PAL.leather.base; ctx.lineWidth = 13
  ctx.beginPath(); ctx.moveTo(-42, -46); ctx.lineTo(30, 34); ctx.moveTo(42, -46); ctx.lineTo(-30, 34); ctx.stroke()
  part(ctx, [[-10, -14], [10, -14], [10, 4], [-10, 4]], PAL.steel, [0, -5], { off: [-2, -2], sc: .9 })

  // belt
  part(ctx, [[-50, 34], [0, 40], [50, 34], [52, 48], [0, 54], [-52, 48]], PAL.pelt, [0, 44], { off: [-2, -3], sc: .94 })
  part(ctx, [[-9, 36], [9, 36], [9, 52], [-9, 52]], PAL.gold, [0, 44], { off: [-1.5, -2], sc: .85 })

  // head: roaring face under a wild mane; rage flares the mane and burns the eyes white
  const dome = c => ell(c, HEAD[0], HEAD[1], HEAD[2], HEAD[3], 0)
  part(ctx, dome, PAL.skinWarm, [2, -98], { off: [-5, -6], sc: .95 })
  part(ctx, rage ? insetPts(HAIR, 4, -110, 1.22) : HAIR, PAL.hairFire, [4, -140], { off: [-5, -6], sc: .95 })
  for (const ex of [-12, 18]) {
    if (rage) {
      glow(ctx, ex, -98, 20, '#ff6a3c', .7)
      ell(ctx, ex, -98, 8, 9, 0, '#fff2e0')
      ell(ctx, ex - 2, -100, 3, 3.5, 0, '#ff3a1a')
    } else {
      ell(ctx, ex, -98, 7.5, 9, 0, PAL.eyeInk)
      ell(ctx, ex - 2.4, -101, 2.8, 3.2, 0, '#fff')
    }
  }
  brow(ctx, -26, -112, -4, -104, PAL.skinWarm.line)
  brow(ctx, 10, -104, 32, -114, PAL.skinWarm.line)
  // roaring mouth — the berserker's second anchor after the axe
  part(ctx, [[-14, -84], [16, -86], [14, -68], [0, -62], [-13, -70]], PAL.mouth, [1, -76], { off: [-1.5, -2], sc: .9, ol: .7 })
  ell(ctx, 2, -71, 7, 3.6, 0, '#f6e8dc')

  // axe arm last so the blades read over the head during the swing
  const [hx, hy] = P.hand
  limb(ctx, 46, -34, hx - 6, hy - 2, 26, PAL.skinWarm)
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(P.axe + (mv ? Math.sin(ph) * .06 : 0))
  limb(ctx, 0, 52, 0, -64, 11, PAL.wood)
  part(ctx, [[-7, -62], [0, -86], [7, -62]], PAL.steel, [0, -72], { off: [-2, -2], sc: .9 })
  for (const s of [-1, 1]) {
    ctx.save(); if (s < 0) ctx.scale(-1, 1)
    part(ctx, shiftPts(BLADE, 0, -74), PAL.steel, [-24, -74], { off: [-3, -4], sc: .9, spec: [-34, -100, -.6, 1.4, .8] })
    ctx.restore()
  }
  if (rage) glow(ctx, 0, -74, 28, '#ff4a1a', .9)
  part(ctx, c => ell(c, 0, -74, 10, 10, 0), rage ? PAL.plume : PAL.furDark, [0, -74], { off: [-2, -2], sc: .88 })
  if (rage) ell(ctx, 0, -74, 5, 5, 0, '#ffe0b0')
  ctx.restore()
  part(ctx, c => ell(c, hx, hy, 15, 14, 0), PAL.skinWarm, [hx, hy], { off: [-3, -4], sc: .88 })

  if (fine() && rage) {
    ctx.strokeStyle = 'rgba(255,120,60,.75)'; ctx.lineWidth = lw(1.4); ctx.lineCap = 'round'
    for (const [fx, fy] of [[-44, -70], [44, -76]]) {
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.quadraticCurveTo(fx + 4, fy - 12, fx - 1, fy - 20); ctx.stroke()
    }
  }
  ctx.restore()
}

const key = st => (st.swing >= 0 ? 'swing' : st.moving ? `move${frameIndex(st.walkT || 0, 1.25)}` : 'idle')

export const berserker = {
  id: 'berserker', baseR: 15, scale: VISUAL_SCALE, surface: 92, feetY: FEET, shadowRx: 84, gait: 1.25,
  frames: [
    ['idle', { pose: 'idle' }], ...moveFrames(), ['swing', { pose: 'swing' }],
    ['r_idle', { pose: 'idle', rage: 1 }], ...[0, .25, .5, .75].map((p, i) => [`r_move${i}`, { pose: 'move', phase: p, rage: 1 }]), ['r_swing', { pose: 'swing', rage: 1 }],
  ],
  frameKey: st => st.enraged ? `r_${key(st)}` : key(st),
  draw,
}
