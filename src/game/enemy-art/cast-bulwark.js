/* Bulwark — chunky chibi powerhouse in iron kettle-helm, heavy brass-trimmed tower shield
 * planted forward, thick shoulder pauldrons and short mace behind the shield wall. */
import { TAU, lw, olPx, fine, ell } from '../slime-art/slime-painter.js'
import { ENEMY_PAL as PAL, VISUAL_SCALE, shiftPts, insetPts, limb, part, brow, emblem, moveFrames, frameIndex } from './enemy-kit.js'

const IRON = { base: '#6f8096', shade: '#435266', light: '#b8c8dc', line: '#1f2936' }
const BRASS = { base: '#d9a441', shade: '#92671d', light: '#fae08c', line: '#2a1f0d' }
const FEET = 94
const BODY = [[-54, -44], [0, -52], [54, -44], [60, 8], [54, 60], [0, 70], [-54, 60], [-60, 8]]
const HELM = [[-56, -96], [-50, -142], [0, -158], [50, -142], [56, -96], [44, -74], [-44, -74]]
const BRIM = [[-70, -100], [0, -110], [70, -100], [62, -84], [0, -94], [-62, -84]]
const SLAB = [[44, -142], [102, -134], [106, -64], [102, 52], [72, 88], [46, 56], [40, -54]]
const BOOT = [[-20, 58], [20, 58], [22, 76], [40, 84], [35, 96], [-21, 96], [-26, 78]]

const POSE = {
  idle: { lean: 0, shield: [0, 0, 0], mace: [-58, 2, .45] },
  move: { lean: .03, shield: [0, 0, 0], mace: [-58, 2, .45] },
  windup: { lean: -.07, shield: [-4, -4, -.06], mace: [-50, -48, -.65] },
  strike: { lean: .11, shield: [18, -2, .08], mace: [-28, -10, .85] },
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
  for (const [x, lift, dir] of [[-26, liftB, -1], [24, liftF, 1]]) {
    const dx = x + dir * spread * 12, dy = -lift * 9
    part(ctx, shiftPts(BOOT, dx, dy), IRON, [dx + 4, 78 + dy], { off: [-3, -4], sc: .9 })
  }

  // short war mace behind back shoulder
  const [mx, my, ma] = P.mace
  limb(ctx, -44, -24, mx + 6, my + 8, 20, IRON)
  ctx.save(); ctx.translate(mx, my); ctx.rotate(ma)
  limb(ctx, 0, 26, 0, -48, 10, PAL.wood)
  part(ctx, [[-18, -72], [18, -72], [22, -42], [-22, -42]], IRON, [0, -56], { off: [-2, -3], sc: .9 })
  ctx.restore()

  // barrel breastplate + brass waist trim
  part(ctx, BODY, IRON, [0, 8], { off: [-5, -6], sc: .95, lights: [[-24, -18, 16, 26, -.2]], spec: [-28, -24, -.4, 1.5, .85] })
  part(ctx, [[-54, 34], [0, 42], [54, 34], [54, 52], [0, 58], [-54, 52]], BRASS, [0, 45], { off: [-2, -3], sc: .92 })

  // thick shoulder pauldrons
  for (const sx of [-1, 1]) {
    part(ctx, c => ell(c, sx * 52, -32, 26, 22, 0), IRON, [sx * 52, -32], { off: [-3, -4], spec: [sx * 52 - 7, -40, -.4, 1.2, .85] })
  }

  // wide kettle helm + expressive face band
  part(ctx, HELM, IRON, [0, -112], { off: [-5, -6], sc: .95, spec: [-20, -142, -.4, 1.5, .85] })
  part(ctx, BRIM, BRASS, [0, -98], { off: [-2, -3], sc: .92 })
  part(ctx, [[-40, -92], [42, -92], [38, -70], [-38, -70]], PAL.skinWarm, [0, -81], { off: [-2, -2], sc: .9 })
  for (const ex of [-11, 18]) {
    ell(ctx, ex, -82, 6.5, 7.5, 0, PAL.eyeInk)
    ell(ctx, ex - 2, -84, 2.2, 2.5, 0, '#fff')
  }
  brow(ctx, -23, -92, -3, -86, PAL.skinWarm.line)
  brow(ctx, 10, -86, 28, -92, PAL.skinWarm.line)

  // tower shield hero silhouette on front arm
  const [sx, sy, tilt] = P.shield
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(tilt)
  part(ctx, SLAB, BRASS, [72, -26], { off: [-4, -5], sc: .94 })
  part(ctx, insetPts(SLAB, 72, -26, .86), IRON, [72, -26], { off: [-4, -5], sc: .94, lights: [[60, -104, 15, 30, -.12]], spec: [62, -118, -.4, 1.6, .88] })
  part(ctx, insetPts(SLAB, 72, -26, .58), BRASS, [72, -26], { off: [-2, -3], sc: .9 })
  emblem(ctx, 72, -34, 16)
  if (fine()) {
    ctx.strokeStyle = 'rgba(255,255,255,.38)'; ctx.lineWidth = lw(olPx() * .7); ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(54, -108); ctx.lineTo(54, 48); ctx.stroke()
  }
  ctx.restore()

  ctx.restore()
}

export const bulwark = {
  id: 'bulwark', baseR: 15, scale: VISUAL_SCALE * 1.1, surface: 100, feetY: FEET, shadowRx: 94, gait: .85, topY: -176,
  frames: [
    ['idle', { pose: 'idle' }],
    ...moveFrames(),
    ['windup', { pose: 'windup' }],
    ['strike', { pose: 'strike' }],
  ],
  frameKey: st => (st.swing >= 0 ? 'strike' : st.windup ? 'windup' : st.moving ? `move${frameIndex(st.walkT || 0, .85)}` : 'idle'),
  draw,
}
