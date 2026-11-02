/* Archmage — the generic boss-mage: deep-violet robe with gold stars, a
 * wide-brim pointed hat, a long white beard, and a big crystal staff that
 * does all the casting. Floats. */
import { lw, olPx, fine, ell, glow, sparkle, rgba, openMouth } from '../slime-art/slime-painter.js'
import { BOSS_PAL as PAL, ENEMY_PAL, limb, part, brow, bossFrames, bossFrameKey, rageEyes, rageBrow, embers, sweat, shockLines } from './boss-kit.js'

const FEET = 72
// wide flat brim + a low dome — a disc on top of the head, not a cone
const DOME = [[-56, -124], [-38, -172], [-2, -190], [34, -178], [54, -124]]
const HATBAND = [[-52, -134], [52, -134], [54, -122], [-54, -122]]
// beard tapers to a single point under the chin
const BEARD = [[-38, -58], [40, -58], [44, -36], [34, -6], [14, 10], [2, 16], [-12, 4], [-32, -14], [-42, -38], [-44, -54]]
const FACE = [[-34, -94], [2, -102], [40, -92], [46, -66], [34, -42], [2, -34], [-28, -42], [-38, -66]]
const SINE = Math.sin

const POSE = {
  idle: { staff: [62, 6, .05], orb: .4, hand: [58, 2], slump: 0 },
  move: { staff: [62, 6, .05], orb: .4, hand: [58, 2], slump: 0 },
  windup: { staff: [70, -32, -.25], orb: 1, hand: [64, -28], slump: 0 },
  strike: { staff: [98, -16, .4], orb: 1.6, hand: [90, -10], slump: 0 },
  recover: { staff: [56, 40, .5], orb: .15, hand: [52, 32], slump: .14 },
  roar: { staff: [58, -44, -.4], orb: 1.7, hand: [54, -40], slump: 0 },
}

// short round body — a squat ball of robes, nothing like the tall bell gowns
const robePath = wv => c => {
  c.beginPath()
  c.ellipse(0, 8, 66, 56 + 2 * SINE(wv), 0, 0, Math.PI * 2)
  c.closePath()
}

/** Crystal staff: dark shaft, gold collar, big faceted violet crystal. */
function staff(ctx, glowAmt, rage) {
  limb(ctx, 0, 62, 0, -140, 12, ENEMY_PAL.wood)
  part(ctx, [[-9, -112], [9, -112], [9, -96], [-9, -96]], ENEMY_PAL.gold, [0, -104], { off: [-1.5, -2], sc: .85 })
  const hot = rage ? '#ff8a5a' : '#b8a4ff'
  // the crystal halo is capped so even a roar flare stays inside the cache surface
  glow(ctx, 0, -166, Math.min(40, 24 + glowAmt * 18), hot, .35 + glowAmt * .28)
  // faceted crystal: long hexagonal prism with a light half
  part(ctx, [[-16, -156], [-8, -188], [8, -188], [16, -156], [8, -148], [-8, -148]], PAL.crystal, [0, -168], { off: [-2.4, -3], sc: .92, spec: [-5, -180, -.5, .8, .9] })
  ctx.beginPath(); ctx.moveTo(0, -188); ctx.lineTo(0, -148)
  ctx.strokeStyle = rgba('#ffffff', .8); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke()
  if (glowAmt > 1) ell(ctx, 0, -168, 10, 10, 0, rgba('#ffffff', .75))
}

function draw(ctx, st) {
  const pose = st.pose || 'idle'
  const P = POSE[pose] || POSE.idle
  const rage = !!st.rage
  const wv = pose === 'move' ? (st.phase || 0) * Math.PI * 4 : 0
  const [sx, sy, srot] = P.staff
  const [hx, hy] = P.hand
  const orbGlow = Math.max(0, P.orb + (rage ? .4 : 0))

  ctx.save()
  if (P.slump) { ctx.translate(0, FEET); ctx.rotate(P.slump); ctx.translate(0, -FEET) }

  // staff first: sleeve and hand overlap the shaft
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(srot)
  staff(ctx, orbGlow, rage)
  ctx.restore()

  // deep-violet robe-ball with gold stars and a gold hem band
  part(ctx, robePath(wv), PAL.merlinViolet, [0, 8], { off: [-6, -8], sc: .95, lights: [[-30, -12, 15, 28, -.15]] })
  for (const [sx2, sy2, ss] of [[-34, -20, 7], [24, -2, 6], [-14, 22, 5], [40, 34, 6], [-46, 40, 5]]) {
    sparkle(ctx, sx2, sy2 + SINE(wv * .4 + sx2) * 2, ss, ENEMY_PAL.gold.light)
  }
  part(ctx, [[-52, 36], [0, 44], [52, 36], [54, 50], [0, 58], [-54, 50]], ENEMY_PAL.gold, [0, 47], { off: [-2, -3], sc: .94 })

  // off-hand sleeve gathers a star spark while charging
  const ly = P.orb >= 1 ? -36 : 16
  part(ctx, c => ell(c, -70, ly, 25, 29, -.15), PAL.merlinViolet, [-70, ly], { off: [-4, -5], sc: .9 })
  part(ctx, c => ell(c, -74, ly + (P.orb >= 1 ? -26 : 24), 12, 12, 0), ENEMY_PAL.skin, [-74, ly + 24], { off: [-2, -2], sc: .85 })
  if (P.orb >= 1) {
    glow(ctx, -74, ly - 52, 32, '#d8b4ff', .85)
    sparkle(ctx, -74, ly - 52, 12, '#f5e6ff')
  }

  // staff-hand sleeve + hand on the shaft
  limb(ctx, 44, -34, hx - 8, hy - 4, 26, PAL.merlinViolet)
  part(ctx, c => ell(c, hx - 4, hy - 2, 24, 20, .2), PAL.merlinViolet, [hx - 4, hy - 2], { off: [-4, -5], sc: .9 })
  part(ctx, c => ell(c, hx, hy + 4, 12, 12, 0), ENEMY_PAL.skin, [hx, hy + 4], { off: [-2, -2], sc: .85 })

  // head sits low on the ball; a tapering white beard spills to a point
  part(ctx, c => ell(c, 0, -66, 56, 50, 0), ENEMY_PAL.skin, [0, -66], { off: [-5, -6], sc: .94 })
  part(ctx, FACE, ENEMY_PAL.skin, [2, -68], { off: [-3, -4], sc: .94, ol: .8 })
  part(ctx, BEARD, PAL.huntFur, [2, -28], { off: [-4, -5], sc: .95, lights: [[-18, -40, 14, 22, -.2]] })
  // moustache shelf over the beard
  part(ctx, [[-28, -46], [4, -38], [32, -46], [27, -34], [4, -28], [-23, -34]], PAL.huntFur, [2, -40], { off: [-2, -2], sc: .9 })

  // wide flat-brim hat: a broad disc brim with a low dome, gold band
  part(ctx, c => ell(c, 0, -118, 104, 15, 0), PAL.merlinViolet, [0, -118], { off: [-5, -4], sc: .95, lights: [[-40, -122, 24, 6, -.3]] })
  part(ctx, DOME, PAL.merlinViolet, [-2, -150], { off: [-5, -6], sc: .95, lights: [[-24, -160, 20, 9, -.3]], spec: [-28, -168, -.4, 1.6, .9] })
  part(ctx, HATBAND, ENEMY_PAL.gold, [0, -128], { off: [-2, -2], sc: .9 })

  if (rage) rageEyes(ctx, -14, -66, 40, 1.05)
  else for (const ex of [-14, 26]) {
    ell(ctx, ex, -66, 8.5, 11, 0, ENEMY_PAL.eyeInk)
    ell(ctx, ex - 2.6, -70, 3.2, 3.8, 0, '#fff')
  }
  const brows = rage ? rageBrow : brow
  brows(ctx, -30, -90, -4, -80, PAL.huntFur.light)
  brows(ctx, 20, -80, 42, -90, PAL.huntFur.light)

  if (pose === 'recover') {
    openMouth(ctx, 4, -32, 20, 12, { line: PAL.huntFur.line })
    sweat(ctx, 46, -96, 1)
  } else if (pose === 'roar') {
    openMouth(ctx, 6, -34, 24, 20, { line: PAL.huntFur.line })
    shockLines(ctx, -6, -92, 80, 108)
  } else if (fine()) {
    ctx.beginPath(); ctx.moveTo(-4, -34); ctx.quadraticCurveTo(10, -40, 24, -34)
    ctx.strokeStyle = ENEMY_PAL.skin.line; ctx.lineWidth = lw(1.4); ctx.lineCap = 'round'; ctx.stroke()
  }

  if (rage) embers(ctx, [[-76, -140, 1], [74, -150, 1.1], [-14, -56, .8]])

  ctx.restore()
}

export const archMage = {
  id: 'boss:mage', baseR: 34, scale: 1.18, surface: 216, feetY: FEET, shadowRx: 78,
  gait: .8, floats: true, unique: true, motionMul: 2.2, topY: -196,
  frames: bossFrames(),
  frameKey: st => bossFrameKey(st, .8),
  draw,
}
