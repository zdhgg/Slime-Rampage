/* Bannerman — chunky royal herald wearing silver-gold plate and plumed morion helm,
 * holding a tall gilded war-standard whose crimson-gold banner unfurls safely inside the canvas tile. */
import { TAU, lw, olPx, fine, ell, glow } from '../slime-art/slime-painter.js'
import { ENEMY_PAL as PAL, VISUAL_SCALE, shiftPts, limb, part, brow, emblem, moveFrames, frameIndex } from './enemy-kit.js'

const CRIMSON = { base: '#e11d48', shade: '#881337', light: '#fb7185', line: '#3b0512' }
const SILVER = { base: '#d3dde8', shade: '#8897ab', light: '#f4f8fc', line: '#263140' }
const BRASS = { base: '#eab308', shade: '#a16207', light: '#fef08a', line: '#3b2404' }
const FEET = 94
const BODY = [[-48, -42], [0, -50], [48, -42], [54, 12], [48, 60], [0, 68], [-48, 60], [-54, 12]]
const HELM = [[-52, -98], [-44, -138], [0, -154], [44, -138], [52, -98], [60, -88], [0, -96], [-60, -88]]
const BOOT = [[-19, 58], [19, 58], [21, 76], [38, 84], [33, 96], [-20, 96], [-25, 78]]

// Keep finial <= -166 and banner unfurling safely leftward (-126..-44) inside the cached tile!
const POSE = {
  idle: { lean: 0, poleX: -50, poleY: 0, tilt: -.04, rally: false },
  move: { lean: .04, poleX: -48, poleY: 0, tilt: -.08, rally: false },
  rally: { lean: -.05, poleX: -48, poleY: -12, tilt: .02, rally: true },
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
  for (const [x, lift, dir] of [[-22, liftB, -1], [22, liftF, 1]]) {
    const dx = x + dir * spread * 14, dy = -lift * 10
    part(ctx, shiftPts(BOOT, dx, dy), SILVER, [dx + 4, 78 + dy], { off: [-2, -3], sc: .9 })
  }

  // billowing crimson & gold war standard kept cleanly inside [-162..+84] tile vertical span
  ctx.save(); ctx.translate(P.poleX, P.poleY); ctx.rotate(P.tilt)
  limb(ctx, 0, 82, 0, -146, 9, PAL.wood)
  if (P.rally) glow(ctx, -38, -104, 38, '#fbbf24', .68)
  const flap = mv ? Math.sin(ph) * 8 : P.rally ? -6 : 0
  // banner billowing leftward behind captain so head & body stay unobstructed
  part(
    ctx,
    [[-4, -142], [-46, -138 + flap], [-86, -118 + flap * 1.3], [-64, -96 + flap], [-84, -74 + flap * 1.2], [-4, -66]],
    CRIMSON,
    [-42, -104],
    { off: [-3, -4], sc: .94, lights: [[-34, -124, 18, 12, .2]] }
  )
  part(ctx, [[-8, -114], [-62, -108 + flap], [-56, -94 + flap], [-8, -96]], BRASS, [-34, -103], { off: [-1.5, -2], sc: .88 })
  emblem(ctx, -36, -104, 12)
  part(ctx, [[-8, -144], [0, -166], [8, -144], [0, -138]], BRASS, [0, -152], { off: [-1.5, -2], sc: .88 })
  ctx.restore()

  // silver plate + crimson tabard + brass belt
  part(ctx, BODY, SILVER, [0, 8], { off: [-5, -6], sc: .95, spec: [-22, -18, -.4, 1.4, .82] })
  part(ctx, [[-24, -42], [0, -46], [24, -42], [26, 48], [0, 58], [-26, 48]], CRIMSON, [0, 8], { off: [-3, -3], sc: .92 })
  part(ctx, [[-48, 28], [0, 36], [48, 28], [48, 44], [0, 50], [-48, 44]], BRASS, [0, 38], { off: [-2, -2], sc: .9 })
  for (const sx of [-1, 1]) {
    part(ctx, c => ell(c, sx * 48, -32, 22, 19, 0), BRASS, [sx * 48, -32], { off: [-3, -3], sc: .9 })
  }

  // chunky face + crested captain morion helm
  part(ctx, c => ell(c, 2, -88, 50, 44, 0), PAL.skinWarm, [2, -88], { off: [-4, -5], sc: .94 })
  part(ctx, HELM, SILVER, [0, -118], { off: [-4, -5], sc: .95, spec: [-18, -136, -.4, 1.5, .85] })
  part(ctx, [[-12, -146], [0, -168], [16, -144], [0, -138]], CRIMSON, [0, -152], { off: [-2, -2], sc: .9 })
  for (const ex of [-11, 18]) {
    ell(ctx, ex, -86, 7.5, 9, 0, PAL.eyeInk)
    ell(ctx, ex - 2.4, -89, 2.6, 3, 0, '#fff')
  }
  brow(ctx, -23, -98, -3, -92, PAL.skinWarm.line)
  brow(ctx, 10, -92, 30, -98, PAL.skinWarm.line)

  // gripping arm on pole
  limb(ctx, -38, -22, P.poleX + 4, P.poleY + 4, 18, SILVER)
  part(ctx, c => ell(c, P.poleX + 4, P.poleY + 4, 13, 12, 0), BRASS, [P.poleX + 4, P.poleY + 4], { off: [-2, -2], sc: .88 })

  // swordarm forward
  limb(ctx, 40, -16, 56, 20, 18, SILVER)
  part(ctx, c => ell(c, 56, 20, 12, 11, 0), PAL.skinWarm, [56, 20], { off: [-2, -2], sc: .85 })

  ctx.restore()
}

export const bannerman = {
  id: 'bannerman', baseR: 13, scale: VISUAL_SCALE * 1.06, surface: 108, feetY: FEET, shadowRx: 86, gait: 1, topY: -176,
  frames: [
    ['idle', { pose: 'idle' }],
    ...moveFrames(),
    ['rally', { pose: 'rally' }],
  ],
  frameKey: st => (st.casting === 'rally' ? 'rally' : st.moving ? `move${frameIndex(st.walkT || 0)}` : 'idle'),
  draw,
}
