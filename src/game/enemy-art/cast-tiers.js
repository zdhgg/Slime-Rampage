/* Tiered visual evolutions (rank 1 = militia/novice, rank 3 = royal/arch-elite)
 * sharing the game's canonical chunky chibi proportions (~HEAD 52x46, BODY +-48x58)
 * while upgrading armor silhouettes, emblems, weapons and halos cleanly from T1 -> T2 -> T3. */
import { TAU, lw, olPx, fine, ell, glow } from '../slime-art/slime-painter.js'
import { ENEMY_PAL as PAL, VISUAL_SCALE, shiftPts, insetPts, limb, part, brow, emblem, moveFrames, frameIndex } from './enemy-kit.js'

const SLATE = { base: '#708299', shade: '#465466', light: '#a3b5cc', line: '#1f2833' }
const ROBE_T3 = { base: '#9e2a74', shade: '#5e1346', light: '#e878ba', line: '#29061f' }
const WHITE_GOLD = { base: '#eef3fa', shade: '#b7c4d8', light: '#ffffff', line: '#2a3448' }
const BRASS = { base: '#eab308', shade: '#92671d', light: '#fef08a', line: '#2d1c04' }
const EMERALD = { base: '#2ea86a', shade: '#18663e', light: '#74e8a9', line: '#0d3620' }
const NOVICE = { base: '#cbd5e1', shade: '#8795a8', light: '#f8fafc', line: '#2b3444' }

function boots(ctx, mv, ph, pal, feetOffset = 92) {
  const spread = mv ? Math.cos(ph) : 0
  const liftF = mv ? Math.max(0, Math.sin(ph)) : 0
  const liftB = mv ? Math.max(0, -Math.sin(ph)) : 0
  const BOOT = [[-19, 56], [19, 56], [21, 74], [38, 82], [33, feetOffset], [-20, feetOffset], [-25, 76]]
  for (const [x, lift, dir] of [[-24, liftB, -1], [24, liftF, 1]]) {
    const dx = x + dir * spread * 14, dy = -lift * 11
    part(ctx, shiftPts(BOOT, dx, dy), pal, [dx + 4, 76 + dy], { off: [-3, -4], sc: .9 })
  }
}

/* ========================= KNIGHT T1 & T3 ========================= */
const knightKey = st => (st.swing >= 0 ? 'strike' : st.windup ? 'windup' : st.moving ? `move${frameIndex(st.walkT || 0)}` : 'idle')
const KNIGHT_POSE = {
  idle: { lean: 0, sword: [-58, 6, .28], shield: [0, 0, 0] },
  move: { lean: .04, sword: [-58, 6, .24], shield: [0, 0, 0] },
  windup: { lean: -.1, sword: [-50, -50, -.65], shield: [-4, 2, -.05] },
  strike: { lean: .12, sword: [58, -18, 1.35], shield: [12, 0, .06] },
}

function drawKnightT1(ctx, st) {
  const pose = st.pose || 'idle', P = KNIGHT_POSE[pose] || KNIGHT_POSE.idle
  const ph = (st.phase || 0) * TAU, mv = pose === 'move'
  ctx.save(); ctx.translate(0, 92); ctx.rotate(P.lean); ctx.translate(0, -92)
  boots(ctx, mv, ph, PAL.leather, 92)
  // wooden spear on back arm
  const [sx, sy, sa] = P.sword
  limb(ctx, -40, -24, sx + 5, sy + 6, 18, SLATE)
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(sa)
  limb(ctx, 0, 30, 0, -56, 9, PAL.wood)
  part(ctx, [[-10, -54], [0, -90], [10, -54]], SLATE, [0, -70], { off: [-1.5, -2], sc: .9 })
  ctx.restore()
  // chunky leather militia jerkin
  part(ctx, [[-46, -42], [0, -50], [46, -42], [52, 12], [46, 58], [0, 66], [-46, 58], [-52, 12]], PAL.leather, [0, 8], { off: [-5, -5], sc: .95 })
  part(ctx, [[-48, 26], [0, 34], [48, 26], [48, 42], [0, 48], [-48, 42]], SLATE, [0, 37], { off: [-2, -2], sc: .92 })
  // chunky face + open kettle cap
  part(ctx, c => ell(c, 2, -96, 52, 46, 0), PAL.skinWarm, [2, -96], { off: [-4, -5], sc: .95 })
  part(ctx, [[-50, -104], [-42, -142], [0, -154], [44, -140], [52, -102], [0, -114]], SLATE, [0, -124], { off: [-4, -5], sc: .94 })
  for (const ex of [-13, 18]) {
    ell(ctx, ex, -94, 7.5, 9, 0, PAL.eyeInk); ell(ctx, ex - 2.4, -97, 2.6, 3, 0, '#fff')
  }
  brow(ctx, -25, -106, -4, -100, PAL.skinWarm.line)
  brow(ctx, 10, -100, 30, -106, PAL.skinWarm.line)
  // wooden buckler shield
  const [bx, by, bt] = P.shield
  ctx.save(); ctx.translate(bx, by); ctx.rotate(bt)
  part(ctx, c => ell(c, 60, -4, 26, 30, 0), PAL.wood, [60, -4], { off: [-3, -4], sc: .92 })
  part(ctx, c => ell(c, 60, -4, 11, 13, 0), SLATE, [60, -4], { off: [-1.5, -2], sc: .9 })
  ctx.restore()
  ctx.restore()
}

function drawKnightT3(ctx, st) {
  const pose = st.pose || 'idle', P = KNIGHT_POSE[pose] || KNIGHT_POSE.idle
  const ph = (st.phase || 0) * TAU, mv = pose === 'move'
  ctx.save(); ctx.translate(0, 94); ctx.rotate(P.lean); ctx.translate(0, -94)
  boots(ctx, mv, ph, WHITE_GOLD, 94)
  // gilded runed greatsword
  const [sx, sy, sa] = P.sword
  limb(ctx, -44, -26, sx + 6, sy + 4, 20, WHITE_GOLD)
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(sa)
  part(ctx, [[-7, 16], [7, 16], [7, 36], [-7, 36]], BRASS, [0, 26], { off: [-1, -1.5], sc: .88 })
  part(ctx, [[-24, -12], [24, -12], [20, -2], [-20, -2]], BRASS, [0, -7], { off: [-1.5, -2], sc: .9 })
  part(ctx, [[-12, -12], [-9, -86], [0, -112], [9, -86], [12, -12]], WHITE_GOLD, [0, -56], { off: [-2, -3], sc: .92, spec: [-3, -72, -.2, 1.5, .9] })
  ctx.restore()
  // chunky white-gold templar plate & royal pauldrons
  part(ctx, [[-52, -44], [0, -54], [52, -44], [58, 12], [52, 62], [0, 72], [-52, 62], [-58, 12]], WHITE_GOLD, [0, 10], { off: [-5, -6], sc: .95, spec: [-22, -20, -.4, 1.5, .86] })
  part(ctx, [[-20, -44], [0, -48], [20, -44], [22, 46], [0, 58], [-22, 46]], BRASS, [0, 6], { off: [-2, -3], sc: .9 })
  for (const x of [-52, 52]) part(ctx, c => ell(c, x, -36, 26, 22, 0), BRASS, [x, -36], { off: [-3, -4], sc: .92 })
  // winged greathelm with glowing visor slit (stays safely inside -164)
  part(ctx, [[-54, -98], [-48, -144], [0, -158], [48, -144], [54, -98], [42, -62], [-42, -62]], WHITE_GOLD, [0, -108], { off: [-5, -6], sc: .95 })
  part(ctx, [[-48, -120], [-84, -158], [-64, -114], [-40, -92]], BRASS, [-60, -122], { off: [-2, -2], sc: .9 })
  part(ctx, [[48, -120], [84, -158], [64, -114], [40, -92]], BRASS, [60, -122], { off: [-2, -2], sc: .9 })
  part(ctx, [[-34, -96], [36, -96], [32, -76], [-32, -76]], PAL.eyeInk, [0, -86], { off: [-1.5, -1.5], sc: .88 })
  for (const ex of [-12, 16]) ell(ctx, ex, -86, 6.5, 4, 0, '#fef08a')
  // ornate gold-rimmed kite shield
  const [bx, by, bt] = P.shield
  ctx.save(); ctx.translate(bx, by); ctx.rotate(bt)
  const KITE = [[42, -62], [96, -56], [98, -2], [84, 46], [66, 66], [46, 42], [38, -8]]
  part(ctx, KITE, BRASS, [68, 0], { off: [-4, -5], sc: .94 })
  part(ctx, insetPts(KITE, 68, 0, .82), WHITE_GOLD, [68, 0], { off: [-3, -4], sc: .92 })
  emblem(ctx, 68, -6, 14)
  ctx.restore()
  ctx.restore()
}

/* ========================= MAGE T1 & T3 ========================= */
const mageKey = st => (st.casting === 'fire' ? 'fire' : st.casting === 'charge' ? 'charge' : st.moving ? `move${frameIndex(st.walkT || 0)}` : 'idle')
const MAGE_POSE = {
  idle: { wand: [58, -4, .18], glowR: 18 },
  move: { wand: [58, -4, .22], glowR: 18 },
  charge: { wand: [64, -46, -.22], glowR: 30 },
  fire: { wand: [74, -22, .34], glowR: 36 },
}

function drawMageT1(ctx, st) {
  const pose = st.pose || 'idle', P = MAGE_POSE[pose] || MAGE_POSE.idle
  part(ctx, [[-44, -38], [0, -46], [44, -38], [52, 38], [30, 68], [0, 74], [-30, 68], [-52, 38]], SLATE, [0, 14], { off: [-5, -5], sc: .95 })
  part(ctx, c => ell(c, 2, -92, 50, 44, 0), PAL.skinWarm, [2, -92], { off: [-4, -5], sc: .95 })
  part(ctx, [[-52, -98], [-32, -148], [14, -158], [50, -124], [54, -96], [0, -108]], SLATE, [0, -124], { off: [-4, -5], sc: .94 })
  for (const ex of [-13, 18]) { ell(ctx, ex, -90, 7, 8.5, 0, PAL.eyeInk); ell(ctx, ex - 2.2, -93, 2.4, 2.8, 0, '#fff') }
  const [wx, wy, wa] = P.wand
  limb(ctx, 38, -20, wx - 4, wy + 2, 17, SLATE)
  ctx.save(); ctx.translate(wx, wy); ctx.rotate(wa)
  limb(ctx, 0, 42, 0, -60, 9, PAL.wood)
  glow(ctx, 0, -68, P.glowR, '#a78bfa', .62)
  part(ctx, c => ell(c, 0, -68, 12, 12, 0), NOVICE, [0, -68], { off: [-1.5, -2], sc: .9 })
  ctx.restore()
}

function drawMageT3(ctx, st) {
  const pose = st.pose || 'idle', P = MAGE_POSE[pose] || MAGE_POSE.idle
  glow(ctx, 0, -34, 56, '#e879f9', .4)
  ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = lw(3.4); ctx.beginPath(); ctx.arc(0, -34, 56, 0, TAU); ctx.stroke()
  part(ctx, [[-52, -40], [0, -52], [52, -40], [62, 42], [38, 72], [0, 80], [-38, 72], [-62, 42]], ROBE_T3, [0, 16], { off: [-5, -6], sc: .95, spec: [-20, -18, -.3, 1.3, .82] })
  part(ctx, [[-26, -44], [0, -50], [26, -44], [22, 46], [0, 58], [-22, 46]], BRASS, [0, 4], { off: [-2, -3], sc: .92 })
  part(ctx, c => ell(c, 2, -92, 52, 46, 0), PAL.skinWarm, [2, -92], { off: [-4, -5], sc: .95 })
  part(ctx, [[-72, -104], [0, -116], [72, -104], [56, -88], [0, -98], [-56, -88]], BRASS, [0, -102], { off: [-3, -4], sc: .92 })
  part(ctx, [[-48, -106], [-24, -156], [16, -166], [44, -142], [48, -106], [0, -114]], ROBE_T3, [0, -132], { off: [-4, -5], sc: .94 })
  emblem(ctx, 2, -128, 13)
  for (const ex of [-13, 19]) { glow(ctx, ex, -90, 14, '#f0abfc', .72); ell(ctx, ex, -90, 7.5, 9, 0, '#fae8ff') }
  const [wx, wy, wa] = P.wand
  limb(ctx, 42, -24, wx - 4, wy + 2, 18, ROBE_T3)
  ctx.save(); ctx.translate(wx, wy); ctx.rotate(wa)
  limb(ctx, 0, 52, 0, -72, 10, BRASS)
  part(ctx, [[-20, -76], [0, -102], [20, -76], [0, -66]], BRASS, [0, -82], { off: [-2, -2], sc: .9 })
  glow(ctx, 0, -82, P.glowR, '#f0abfc', .85)
  ell(ctx, 0, -82, 12, 12, 0, '#fdf4ff')
  ctx.restore()
}

/* ========================= ARCHER T1 & T3 ========================= */
const archerKey = st => (st.casting === 'fire' ? 'release' : st.casting === 'charge' ? 'draw' : st.moving ? `move${frameIndex(st.walkT || 0)}` : 'idle')
const ARCHER_POSE = {
  idle: { bowX: 52, draw: false },
  move: { bowX: 52, draw: false },
  draw: { bowX: 60, draw: true },
  release: { bowX: 64, draw: false },
}

function drawArcherT1(ctx, st) {
  const pose = st.pose || 'idle', P = ARCHER_POSE[pose] || ARCHER_POSE.idle
  const ph = (st.phase || 0) * TAU, mv = pose === 'move'
  ctx.save(); ctx.translate(0, 92)
  boots(ctx, mv, ph, PAL.leather, 92)
  part(ctx, [[-44, -40], [0, -48], [44, -40], [48, 14], [42, 58], [0, 66], [-42, 58], [-48, 14]], PAL.leather, [0, 8], { off: [-5, -5], sc: .95 })
  part(ctx, c => ell(c, 2, -94, 50, 44, 0), PAL.skinWarm, [2, -94], { off: [-4, -5], sc: .95 })
  part(ctx, [[-48, -104], [-34, -142], [26, -144], [50, -104], [0, -114]], PAL.wood, [0, -122], { off: [-4, -4], sc: .92 })
  for (const ex of [-12, 18]) { ell(ctx, ex, -92, 7, 8.5, 0, PAL.eyeInk); ell(ctx, ex - 2.2, -95, 2.4, 2.8, 0, '#fff') }
  ctx.save(); ctx.translate(P.bowX, -14)
  ctx.strokeStyle = PAL.wood.line; ctx.lineWidth = lw(4.4); ctx.beginPath(); ctx.arc(0, 0, 44, -Math.PI * .45, Math.PI * .45); ctx.stroke()
  ctx.strokeStyle = PAL.wood.base; ctx.lineWidth = lw(2.6); ctx.beginPath(); ctx.arc(0, 0, 44, -Math.PI * .45, Math.PI * .45); ctx.stroke()
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = lw(1.3)
  ctx.beginPath(); ctx.moveTo(6, -42); ctx.lineTo(P.draw ? -18 : 6, 0); ctx.lineTo(6, 42); ctx.stroke()
  if (P.draw) { ctx.strokeStyle = PAL.wood.line; ctx.lineWidth = lw(2); ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(48, 0); ctx.stroke() }
  ctx.restore(); ctx.restore()
}

function drawArcherT3(ctx, st) {
  const pose = st.pose || 'idle', P = ARCHER_POSE[pose] || ARCHER_POSE.idle
  const ph = (st.phase || 0) * TAU, mv = pose === 'move'
  ctx.save(); ctx.translate(0, 94)
  boots(ctx, mv, ph, EMERALD, 94)
  // golden quiver & emerald royal cloak
  part(ctx, [[-64, -48], [-32, -56], [-30, 18], [-62, 14]], BRASS, [-48, -20], { off: [-2, -2], sc: .9 })
  part(ctx, [[-48, -42], [0, -52], [48, -42], [54, 14], [46, 64], [0, 72], [-46, 64], [-54, 14]], EMERALD, [0, 10], { off: [-5, -5], sc: .95 })
  part(ctx, [[-22, -44], [0, -48], [22, -44], [18, 44], [0, 54], [-18, 44]], BRASS, [0, 4], { off: [-2, -3], sc: .9 })
  part(ctx, c => ell(c, 2, -96, 52, 46, 0), PAL.skinWarm, [2, -96], { off: [-4, -5], sc: .95 })
  part(ctx, [[-54, -104], [-38, -154], [30, -148], [56, -104], [0, -116]], EMERALD, [0, -124], { off: [-4, -5], sc: .94 })
  part(ctx, [[-24, -138], [-56, -166], [-12, -146]], BRASS, [-30, -150], { off: [-1.5, -2], sc: .9 })
  for (const ex of [-12, 19]) { ell(ctx, ex, -94, 7.5, 9, 0, PAL.eyeInk); ell(ctx, ex - 2.4, -97, 2.6, 3, 0, '#fef08a') }
  ctx.save(); ctx.translate(P.bowX, -14)
  ctx.strokeStyle = BRASS.line; ctx.lineWidth = lw(5); ctx.beginPath(); ctx.arc(0, 0, 50, -Math.PI * .48, Math.PI * .48); ctx.stroke()
  ctx.strokeStyle = BRASS.light; ctx.lineWidth = lw(3); ctx.beginPath(); ctx.arc(0, 0, 50, -Math.PI * .48, Math.PI * .48); ctx.stroke()
  ctx.strokeStyle = '#fef9c3'; ctx.lineWidth = lw(1.5)
  ctx.beginPath(); ctx.moveTo(4, -48); ctx.lineTo(P.draw ? -22 : 4, 0); ctx.lineTo(4, 48); ctx.stroke()
  if (P.draw) {
    for (const dy of [-5, 5]) {
      ctx.strokeStyle = '#fef08a'; ctx.lineWidth = lw(2.2); ctx.beginPath(); ctx.moveTo(-22, dy); ctx.lineTo(54, dy); ctx.stroke()
    }
  }
  ctx.restore(); ctx.restore()
}

/* ========================= PRIEST T1 & T3 ========================= */
const priestKey = st => (st.casting === 'heal' ? 'heal' : st.moving ? `move${frameIndex(st.walkT || 0)}` : 'idle')

function drawPriestT1(ctx, st) {
  const heal = st.pose === 'heal'
  part(ctx, [[-44, -38], [0, -46], [44, -38], [50, 38], [30, 68], [0, 74], [-30, 68], [-50, 38]], NOVICE, [0, 14], { off: [-5, -5], sc: .95 })
  part(ctx, c => ell(c, 2, -92, 50, 44, 0), PAL.skinWarm, [2, -92], { off: [-4, -5], sc: .95 })
  part(ctx, [[-52, -98], [-34, -142], [18, -146], [52, -118], [54, -96], [0, -108]], NOVICE, [0, -120], { off: [-4, -5], sc: .94 })
  for (const ex of [-13, 18]) { ell(ctx, ex, -90, 7, 8.5, 0, PAL.eyeInk); ell(ctx, ex - 2.2, -93, 2.4, 2.8, 0, '#fff') }
  const hx = 56, hy = heal ? -38 : -8
  limb(ctx, 36, -20, hx - 4, hy + 2, 16, NOVICE)
  limb(ctx, hx, hy + 48, hx, hy - 58, 8.5, PAL.wood)
  glow(ctx, hx, hy - 66, heal ? 26 : 14, '#fde047', heal ? .85 : .42)
  part(ctx, c => ell(c, hx, hy - 66, 12, 12, 0), BRASS, [hx, hy - 66], { off: [-1.5, -2], sc: .88 })
}

function drawPriestT3(ctx, st) {
  const heal = st.pose === 'heal'
  glow(ctx, 0, -64, heal ? 62 : 48, '#fde047', heal ? .7 : .42)
  part(ctx, [[-34, -64], [-96, -114], [-86, -64], [-62, -32]], BRASS, [-64, -72], { off: [-2, -2], sc: .92 })
  part(ctx, [[34, -64], [96, -114], [86, -64], [62, -32]], BRASS, [64, -72], { off: [-2, -2], sc: .92 })
  part(ctx, [[-50, -40], [0, -52], [50, -40], [60, 42], [36, 72], [0, 80], [-36, 72], [-60, 42]], WHITE_GOLD, [0, 16], { off: [-5, -6], sc: .95 })
  part(ctx, [[-24, -44], [0, -48], [24, -44], [22, 52], [0, 64], [-22, 52]], BRASS, [0, 8], { off: [-2, -3], sc: .92 })
  part(ctx, c => ell(c, 2, -92, 52, 46, 0), PAL.skinWarm, [2, -92], { off: [-4, -5], sc: .95 })
  part(ctx, [[-44, -104], [-28, -148], [0, -166], [28, -148], [44, -104], [0, -112]], WHITE_GOLD, [0, -130], { off: [-4, -4], sc: .94 })
  part(ctx, [[-20, -138], [20, -138], [14, -108], [-14, -108]], BRASS, [0, -124], { off: [-1.5, -2], sc: .9 })
  for (const ex of [-13, 19]) { ell(ctx, ex, -90, 7.5, 9, 0, PAL.eyeInk); ell(ctx, ex - 2.4, -93, 2.6, 3, 0, '#fef08a') }
  const hx = 60, hy = heal ? -44 : -10
  limb(ctx, 40, -22, hx - 4, hy + 2, 18, WHITE_GOLD)
  limb(ctx, hx, hy + 54, hx, hy - 68, 9.5, BRASS)
  part(ctx, c => ell(c, hx, hy - 78, 20, 20, 0), BRASS, [hx, hy - 78], { off: [-2, -2], sc: .9 })
  ell(ctx, hx, hy - 78, 10, 10, 0, '#fffbeb')
}

export const TIER_CAST = {
  'knight:1': {
    id: 'knight:1', baseR: 14, scale: VISUAL_SCALE * .96, surface: 88, feetY: 92, shadowRx: 78,
    frames: [['idle', { pose: 'idle' }], ...moveFrames(), ['windup', { pose: 'windup' }], ['strike', { pose: 'strike' }]],
    frameKey: knightKey,
    draw: drawKnightT1,
  },
  'knight:3': {
    id: 'knight:3', baseR: 14, scale: VISUAL_SCALE * 1.08, surface: 98, feetY: 94, shadowRx: 90, topY: -168,
    frames: [['idle', { pose: 'idle' }], ...moveFrames(), ['windup', { pose: 'windup' }], ['strike', { pose: 'strike' }]],
    frameKey: knightKey,
    draw: drawKnightT3,
  },
  'mage:1': {
    id: 'mage:1', baseR: 13, scale: VISUAL_SCALE * .96, surface: 88, feetY: 84, shadowRx: 72, floats: true,
    frames: [['idle', { pose: 'idle' }], ...moveFrames(), ['charge', { pose: 'charge' }], ['fire', { pose: 'fire' }]],
    frameKey: mageKey,
    draw: drawMageT1,
  },
  'mage:3': {
    id: 'mage:3', baseR: 13, scale: VISUAL_SCALE * 1.08, surface: 98, feetY: 80, shadowRx: 84, floats: true, topY: -172,
    frames: [['idle', { pose: 'idle' }], ...moveFrames(), ['charge', { pose: 'charge' }], ['fire', { pose: 'fire' }]],
    frameKey: mageKey,
    draw: drawMageT3,
  },
  'archer:1': {
    id: 'archer:1', baseR: 13, scale: VISUAL_SCALE * .96, surface: 86, feetY: 92, shadowRx: 76,
    frames: [['idle', { pose: 'idle' }], ...moveFrames(), ['draw', { pose: 'draw' }], ['release', { pose: 'release' }]],
    frameKey: archerKey,
    draw: drawArcherT1,
  },
  'archer:3': {
    id: 'archer:3', baseR: 13, scale: VISUAL_SCALE * 1.08, surface: 96, feetY: 94, shadowRx: 82, topY: -168,
    frames: [['idle', { pose: 'idle' }], ...moveFrames(), ['draw', { pose: 'draw' }], ['release', { pose: 'release' }]],
    frameKey: archerKey,
    draw: drawArcherT3,
  },
  'priest:1': {
    id: 'priest:1', baseR: 13, scale: VISUAL_SCALE * .96, surface: 86, feetY: 80, shadowRx: 72, floats: true,
    frames: [['idle', { pose: 'idle' }], ...moveFrames(), ['heal', { pose: 'heal' }]],
    frameKey: priestKey,
    draw: drawPriestT1,
  },
  'priest:3': {
    id: 'priest:3', baseR: 13, scale: VISUAL_SCALE * 1.08, surface: 98, feetY: 78, shadowRx: 84, floats: true, topY: -172,
    frames: [['idle', { pose: 'idle' }], ...moveFrames(), ['heal', { pose: 'heal' }]],
    frameKey: priestKey,
    draw: drawPriestT3,
  },
}
