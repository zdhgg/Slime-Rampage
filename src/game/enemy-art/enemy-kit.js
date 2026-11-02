/* =========================================================================
 * Enemy art kit — shared palette and drawing helpers for every enemy cast.
 * Materials come from `slime-art/slime-painter.js` (cel shading + constant
 * screen-width tinted outline); this file only adds what hostile units share:
 * palettes, limb/part helpers, the hostile brow and the gait frame index.
 * ========================================================================= */
import { TAU, lw, olPx, cel } from '../slime-art/slime-painter.js'

export const ENEMY_PAL = {
  steel: { base: '#c9d4e0', shade: '#8190a8', light: '#f4f8fc', line: '#2a3550' },
  steelDark: { base: '#8f9db4', shade: '#5d6a85', light: '#c3cddb', line: '#262f46' },
  tabard: { base: '#4a74d2', shade: '#2e4ca0', light: '#86a8f4', line: '#1b2a5c' },
  gold: { base: '#f4c04e', shade: '#c88b26', light: '#ffe6a0', line: '#6a4510' },
  plume: { base: '#e5503f', shade: '#a82b30', light: '#ff9a80', line: '#5c1520' },
  skin: { base: '#f7d0aa', shade: '#dba17e', light: '#ffe9d4', line: '#5a3426' },
  leather: { base: '#9a6742', shade: '#68412a', light: '#c48e62', line: '#2e1b10' },
  eyeInk: '#1c2233',
  robe: { base: '#9468e0', shade: '#6040ac', light: '#c3a2fa', line: '#2b1b52' },
  hood: { base: '#7e55cc', shade: '#4f3496', light: '#ab88f0', line: '#241546' },
  voidFace: { base: '#241942', shade: '#150e2a', light: '#33265c', line: '#150e2a' },
  orb: { base: '#ffd45e', shade: '#e0962c', light: '#fff2b8', line: '#7a4a10' },
  eyeGlow: '#ffe98c',
  fur: { base: '#d9a05b', shade: '#a06a32', light: '#f3cf93', line: '#4a2b12' },
  furDark: { base: '#9a6234', shade: '#6b4020', light: '#c08650', line: '#33190a' },
  cream: { base: '#f3dcb4', shade: '#cfa878', light: '#fff1d6', line: '#4a2b12' },
  mouth: { base: '#4a1a18', shade: '#2e0e0e', light: '#6a2a24', line: '#2e0e0e' },
  fang: { base: '#fffaf0', shade: '#d8cdb8', light: '#ffffff', line: '#5a4a38' },
  ninja: { base: '#54426f', shade: '#382b4f', light: '#7f68a8', line: '#190f2a' },
  ninjaDark: { base: '#3b2f52', shade: '#271d3a', light: '#5a4880', line: '#140b22' },
  scarf: { base: '#ec3fa4', shade: '#a82174', light: '#ff8ccb', line: '#4d0f35' },
  eyeHot: '#ff4a68',
  tunic: { base: '#d17a3c', shade: '#96501f', light: '#f4ab6c', line: '#4d260f' },
  cap: { base: '#80532f', shade: '#573719', light: '#ad7e52', line: '#2b180a' },
  amber: { base: '#f5b340', shade: '#c47f1c', light: '#ffdc8a', line: '#6a410a' },
  wood: { base: '#b07a42', shade: '#7a4e24', light: '#d9a86a', line: '#3a210c' },
  string: '#f6eed8',
  cloth: { base: '#f2eee2', shade: '#c6bfae', light: '#ffffff', line: '#5d564a' },
  pelt: { base: '#7a4a2c', shade: '#4d2a16', light: '#a06a40', line: '#2c1508' },
  skinWarm: { base: '#d99a5c', shade: '#a86a38', light: '#f2bf8a', line: '#4f2c14' },
  hairFire: { base: '#e5502f', shade: '#a02a18', light: '#ff9a6a', line: '#571207' },
  stone: { base: '#8ba3b8', shade: '#5d7488', light: '#bccfdd', line: '#24384a' },
  stoneDark: { base: '#5d7488', shade: '#3e5266', light: '#8ba3b8', line: '#1c2c3c' },
  core: { base: '#4ad8e8', shade: '#1e8ba0', light: '#c8f6ff', line: '#0d4454' },
  moss: { base: '#7fae62', shade: '#577c40', light: '#a8d28a', line: '#33481f' },
  shroud: { base: '#4d9a82', shade: '#2a6b58', light: '#82d4b8', line: '#0e3a2e' },
  shroudDark: { base: '#2a6b58', shade: '#1a4538', light: '#4d9a82', line: '#0a2a22' },
  wisp: { base: '#8affd8', shade: '#4dc8a0', light: '#d8fff0', line: '#1e5c48' },
}

/** Drawn size relative to the collision radius: chibi bodies read as the slime's peers at r26 without growing hitboxes. */
export const VISUAL_SCALE = 1.18

export const shiftPts = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy])
export const insetPts = (pts, cx, cy, s) => pts.map(([x, y]) => [cx + (x - cx) * s, cy + (y - cy) * s])

/** Round-capped limb (straight, or quadratic when a control point is given): outline stroke first, then the fill. */
export function limb(ctx, x1, y1, x2, y2, w, pal, cx, cy) {
  const path = () => {
    ctx.beginPath(); ctx.moveTo(x1, y1)
    if (cx === undefined) ctx.lineTo(x2, y2); else ctx.quadraticCurveTo(cx, cy, x2, y2)
  }
  ctx.lineCap = 'round'
  path(); ctx.strokeStyle = pal.line; ctx.lineWidth = w + lw(olPx()) * 2; ctx.stroke()
  path(); ctx.strokeStyle = pal.base; ctx.lineWidth = w; ctx.stroke()
}

/** A cel part: the shape's own centre is the scale pivot so the shade crescent stays on the lower right. */
export const part = (ctx, shape, pal, c, o = {}) => cel(ctx, shape, pal, { c, off: [-5, -6], sc: .93, ...o })

/** Slanted hostile brow. */
export function brow(ctx, x1, y1, x2, y2, col) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2)
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(10, lw(1.7)); ctx.lineCap = 'round'; ctx.stroke()
}

/** Small gold kingdom diamond — the shared "human faction" badge. */
export function emblem(ctx, x, y, s) {
  part(ctx, [[x, y - s], [x + s * .8, y], [x, y + s], [x - s * .8, y]], ENEMY_PAL.gold, [x, y], { off: [-1.5, -2], sc: .85 })
}

/** Boss palettes: same cel material contract, one dominant hue per boss (kept
 *  off the forest's green/grey-blue band and off the six slime hues). */
export const BOSS_PAL = {
  wardenNavy: { base: '#3d5288', shade: '#27355e', light: '#647fb8', line: '#131c36' },
  wardenBronze: { base: '#c28a4c', shade: '#8a5e2c', light: '#eabd84', line: '#452a0e' },
  wardenCream: { base: '#f0e2bc', shade: '#c9ac74', light: '#fff6dc', line: '#5a4520' },
  gunmetal: { base: '#5c6474', shade: '#383e4c', light: '#8a94a8', line: '#1c2028' },
  // warmed toward violet (was navy-leaning) so the robe reads apart from the shadow slime
  beaconRobe: { base: '#4e4180', shade: '#342a5c', light: '#7a6ab4', line: '#170f30' },
  beaconDark: { base: '#383064', shade: '#241c46', light: '#5a529a', line: '#130d2c' },
  brass: { base: '#c9963f', shade: '#94682a', light: '#f0c878', line: '#4a3010' },
  lamp: { base: '#4fd8e8', shade: '#1e8ba0', light: '#c8f6ff', line: '#0d4454' },
  huntLeather: { base: '#b5854f', shade: '#7d5630', light: '#d9ae78', line: '#3a2410' },
  huntScarf: { base: '#c93a44', shade: '#8e2028', light: '#f07078', line: '#4a0e12' },
  huntFur: { base: '#f4ece0', shade: '#cbb9a0', light: '#ffffff', line: '#5c4c3a' },
  gateSilver: { base: '#d8e0ea', shade: '#96a4bc', light: '#f6fafc', line: '#2a3448' },
  ashChar: { base: '#4a4550', shade: '#2e2a34', light: '#6e6878', line: '#16141c' },
  ember: { base: '#ff8a3c', shade: '#d0521e', light: '#ffc890', line: '#6a2410' },
  thronePlum: { base: '#7e4a8c', shade: '#54305e', light: '#a876b4', line: '#2c1434' },
  cmdrCrimson: { base: '#c03048', shade: '#8a1e30', light: '#e86078', line: '#4a0e1a' },
  cmdrBlack: { base: '#322e3a', shade: '#1e1a24', light: '#544e62', line: '#0e0c12' },
  inqCream: { base: '#f0e4cc', shade: '#c9b494', light: '#fff8e8', line: '#5c4a30' },
  inqFlame: { base: '#f47c2c', shade: '#c04e14', light: '#ffb066', line: '#642408' },
  relicWine: { base: '#8c2e4e', shade: '#5e1c34', light: '#b85a78', line: '#380e20' },
  pearl: { base: '#f0ece4', shade: '#c4bcae', light: '#ffffff', line: '#585048' },
  tombIvory: { base: '#e8e0cc', shade: '#b8ac90', light: '#faf4e2', line: '#4e4634' },
  tombGhost: { base: '#9a8ae0', shade: '#6a5cb0', light: '#cdc2f6', line: '#2c2450' },
  sealViolet: { base: '#3a2448', shade: '#241432', light: '#5c4070', line: '#140a1e' },
  sealGold: { base: '#f4e2a0', shade: '#d4b46a', light: '#fff6d8', line: '#6a5424' },
  merlinViolet: { base: '#5f3fb0', shade: '#3a2678', light: '#8c68dc', line: '#1e1240' },
  crystal: { base: '#c8b8f4', shade: '#8a78cc', light: '#f0eaff', line: '#3a2c6e' },
  marshalSlate: { base: '#5d5878', shade: '#3c3850', light: '#8a84a8', line: '#1c1a2c' },
  archerOrange: { base: '#e08a3c', shade: '#a85e1e', light: '#f4b46c', line: '#542c0e' },
}

/** Four fixed gait phases (contact / pass / contact / pass). */
export const MOVE = [0, .25, .5, .75]
export const moveFrames = () => MOVE.map((phase, i) => [`move${i}`, { pose: 'move', phase }])

/** Gait frame for the engine's `_walkT` (radians, one cycle = 2π); `gait` speeds the cycle up for fast units. */
export const frameIndex = (walkT, gait = 1) => Math.floor((((walkT * gait / TAU) % 1) + 1) % 1 * 4) % 4
