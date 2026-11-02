/* Knight — steel open-face helmet + red plume, blue tunic, big blue shield on the back arm, gold-hilted sword on the front arm. */
import { TAU, lw, olPx, fine, ell, outline } from '../slime-art/slime-painter.js'
import { ENEMY_PAL as PAL, VISUAL_SCALE, shiftPts, insetPts, limb, part, brow, emblem, moveFrames, frameIndex } from './enemy-kit.js'

const FEET = 92
const HEAD = [0, -104, 64, 58]
const FACE = [[-36, -116], [8, -122], [50, -114], [56, -86], [44, -58], [8, -48], [-30, -58], [-42, -86]]
const SHIELD = [[-100, -32], [-56, -38], [-44, 0], [-50, 42], [-76, 70], [-102, 42], [-108, 0]]
const TUNIC = [[-46, -40], [0, -48], [46, -40], [54, 0], [58, 66], [0, 76], [-58, 66], [-54, 0]]
const PLATE = [[-34, -34], [0, -40], [34, -34], [40, 0], [28, 24], [0, 30], [-28, 24], [-40, 0]]
const BOOT = [[-17, 58], [17, 58], [19, 76], [36, 84], [32, 96], [-18, 96], [-23, 78]]
/* Three plume silhouettes (P3 crowd variety): tall crescent / swept-back / narrow ridge. */
const PLUMES = [
  [[-14, -156], [-32, -192], [-8, -214], [22, -198], [40, -166], [22, -156]],
  [[-16, -156], [-44, -176], [-28, -196], [4, -188], [28, -170], [24, -158]],
  [[-10, -158], [-14, -188], [2, -202], [18, -188], [12, -158]],
]

const POSE = {
  idle: { hand: [80, 4], sword: .2, lean: 0, shield: 0 },
  move: { hand: [80, 4], sword: .2, lean: .03, shield: 0 },
  windup: { hand: [86, -58], sword: .5, lean: -.09, shield: -8 },
  strike: { hand: [94, -6], sword: 1.46, lean: .13, shield: 5 },
}

function draw(ctx, st) {
  const pose = st.pose || 'idle'
  const P = POSE[pose] || POSE.idle
  const ph = (st.phase || 0) * TAU
  const mv = pose === 'move'
  const spread = mv ? Math.cos(ph) : 0
  const liftF = mv ? Math.max(0, Math.sin(ph)) : 0
  const liftB = mv ? Math.max(0, -Math.sin(ph)) : 0
  const swordTilt = P.sword + (mv ? Math.sin(ph) * .08 : 0)

  ctx.save()
  ctx.translate(0, FEET); ctx.rotate(P.lean); ctx.translate(0, -FEET)

  // boots: toes point forward (+x); the legs stay short so the head carries the character
  for (const [x, lift, dir] of [[-26, liftB, -1], [26, liftF, 1]]) {
    const dx = x + dir * spread * 16, dy = -lift * 13
    part(ctx, shiftPts(BOOT, dx, dy), PAL.steelDark, [dx + 4, 78 + dy], { off: [-3, -4], sc: .9 })
  }

  part(ctx, TUNIC, PAL.tabard, [0, 14], { lights: [[-26, -8, 15, 24, -.2]] })
  part(ctx, PLATE, PAL.steel, [0, -2], { off: [-5, -6], lights: [[-16, -22, 13, 8, -.4]], spec: [-18, -24, -.5, 1.6, .9] })
  emblem(ctx, 0, -4, 11)

  // belt
  part(ctx, [[-52, 22], [0, 28], [52, 22], [54, 38], [0, 44], [-54, 38]], PAL.gold, [0, 33], { off: [-2, -3], sc: .94 })
  part(ctx, [[-8, 26], [8, 26], [8, 42], [-8, 42]], PAL.steel, [0, 34], { off: [-1.5, -2], sc: .85 })

  // pauldrons
  for (const sx of [-1, 1]) part(ctx, c => ell(c, sx * 56, -34, 26, 22, 0), PAL.steel, [sx * 56, -34], { off: [-4, -5], spec: [sx * 56 - 8, -42, -.4, 1.2, .8] })

  // shield arm: kite shield, rim steel with a blue field and the gold badge
  const sy = P.shield, shield = shiftPts(SHIELD, 0, sy)
  part(ctx, shield, PAL.steel, [-76, 14 + sy], { off: [-4, -5], sc: .94 })
  part(ctx, insetPts(shield, -76, 14 + sy, .66), PAL.tabard, [-76, 14 + sy], { off: [-3, -4], sc: .9, lights: [[-88, -4 + sy, 9, 14, -.3]] })
  emblem(ctx, -76, 12 + sy, 15)

  // head: plume first so it roots behind the helmet dome (shape varies per unit)
  const plume = PLUMES[st.variant % PLUMES.length] || PLUMES[0]
  part(ctx, plume, PAL.plume, [4, -186], { off: [-4, -5], sc: .9 })
  const dome = c => ell(c, HEAD[0], HEAD[1], HEAD[2], HEAD[3], 0)
  part(ctx, dome, PAL.steel, [0, -104], { off: [-5, -6], sc: .94, lights: [[-26, -134, 22, 12, -.4]], spec: [-30, -140, -.4, 1.8, .9] })
  ctx.save()
  dome(ctx); ctx.clip()
  part(ctx, FACE, PAL.skin, [6, -84], { off: [-4, -5], sc: .94, ol: .8 })
  ctx.restore()
  outline(ctx, dome, PAL.steel.line)
  // brow ridge so the visor reads as a steel rim above the eyes
  ctx.beginPath(); ctx.moveTo(-34, -112); ctx.quadraticCurveTo(8, -128, 52, -110)
  ctx.strokeStyle = PAL.steel.line; ctx.lineWidth = lw(olPx() * .9); ctx.lineCap = 'round'; ctx.stroke()
  for (const ex of [-10, 28]) {
    ell(ctx, ex, -86, 8.5, 11, 0, PAL.eyeInk)
    ell(ctx, ex - 2.6, -90, 3.2, 3.8, 0, '#fff')
  }
  brow(ctx, -26, -110, -2, -99, PAL.skin.line)
  brow(ctx, 22, -99, 46, -110, PAL.skin.line)
  if (fine()) {
    ctx.beginPath(); ctx.moveTo(0, -64); ctx.quadraticCurveTo(14, -70, 28, -64)
    ctx.strokeStyle = PAL.skin.line; ctx.lineWidth = lw(1.4); ctx.lineCap = 'round'; ctx.stroke()
  }

  // sword arm last so the blade stays readable over the head during windup
  const [hx, hy] = P.hand
  limb(ctx, 52, -30, hx, hy, 24, PAL.tabard)
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(swordTilt)
  part(ctx, [[-7, -14], [7, -14], [7, 28], [-7, 28]], PAL.leather, [0, 8], { off: [-1.5, -2], sc: .9 })
  part(ctx, [[-9, -18], [-7, -104], [0, -128], [7, -104], [9, -18]], PAL.steel, [0, -72], { off: [-2.4, -3], sc: .86, spec: [-2, -78, 1.5, .5, .9] })
  part(ctx, [[-24, -22], [24, -22], [26, -12], [-26, -12]], PAL.gold, [0, -17], { off: [-1.5, -2], sc: .9 })
  part(ctx, c => ell(c, 0, 32, 9, 9, 0), PAL.gold, [0, 32], { off: [-2, -2], sc: .85 })
  ctx.restore()
  part(ctx, c => ell(c, hx, hy, 16, 15, 0), PAL.steelDark, [hx, hy], { off: [-3, -4], sc: .88 })

  ctx.restore()
}

export const knight = {
  id: 'knight', baseR: 14, scale: VISUAL_SCALE, surface: 88, feetY: FEET, shadowRx: 84,
  variants: 3, // plume shape variants baked as extra cache frames (the crowd unit gets shape variety)
  frames: [['idle', { pose: 'idle' }], ...moveFrames(), ['windup', { pose: 'windup' }], ['strike', { pose: 'strike' }]],
  /** Pose frame for the live state; every input comes from existing combat clocks. */
  frameKey: st => st.swing >= 0 ? 'strike' : st.windup ? 'windup' : st.moving ? `move${frameIndex(st.walkT || 0)}` : 'idle',
  draw,
}
