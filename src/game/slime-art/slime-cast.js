/* =========================================================================
 * Slime Rampage · family cast (current-r2, "concept A")
 * -------------------------------------------------------------------------
 * Silhouette first, one external identity anchor per strain, own face kit:
 *  01 Origin    — low dome + twin sprout            (the proportion baseline)
 *  02 Glutton   — wide flat bean, eye bumps, full-width fanged mouth
 *  03 Ricochet  — smallest round ball, triple nozzle crown ("three per volley")
 *  04 Elemental — gel pulled into a bent wizard tip, pearl body tinted by the
 *                 two chosen elements, two element orbs at the sides
 *  05 Shadow    — forward-leaning ink drop with a long trailing tail, glowing
 *                 slit eyes, no mouth (the only dark / asymmetric member)
 *  06 Summoner  — rose mother with a three-bud crown; partners are drawn as
 *                 attachments in portraits only (in combat they are real units)
 *
 * Each character exposes body / face / shape (+ attachments). Body and face
 * are split so Player can lay mutation overlays between them.
 * ========================================================================= */
import {
  TAU, FEET_Y, K, setScale, lw, olPx, fine, ell, rgba, glow, groundShadow, outline, cel,
  dotEye, arcEye, winceEye, smile, wavy, openMouth, cheeks, poly, sparkle,
} from './slime-painter.js'

/* ------------------------------- palettes ------------------------------ */
export const PAL = {
  origin: { base: '#a8e06a', shade: '#6fb04c', light: '#d2f6a0', line: '#2c5228', eye: '#1d3622' },
  leaf: { base: '#5fb83e', shade: '#3f8a2c', light: '#9be067', line: '#21461f' },
  glutton: { base: '#ec5a42', shade: '#b93a30', light: '#ff9474', line: '#561616', eye: '#2a0a0c' },
  ricochet: { base: '#4cc6f0', shade: '#2a8fc8', light: '#a6e8ff', line: '#103a5a', eye: '#0b2a40' },
  elemental: { base: '#eceefc', shade: '#b4b0da', light: '#ffffff', line: '#3a3468', eye: '#2a2556' },
  shadow: { base: '#2f2749', shade: '#1c1731', light: '#41366a', line: '#0b0916', rim: '#a98bff', eye: '#eaf7ff' },
  summoner: { base: '#f6a3c4', shade: '#d56f98', light: '#ffd3e4', line: '#5e2340', eye: '#3d1428' },
  guardian: { base: '#edc479', shade: '#c49a4e', light: '#ffe2a6', line: '#5a4220', eye: '#3a2a12' },
  stone: { base: '#a49e93', shade: '#76716a', light: '#cfcac0', line: '#3c3833' },
  hunter: { base: '#8edacb', shade: '#58ab9b', light: '#c9f4eb', line: '#1f4f47', eye: '#123a34' },
  spore: { base: '#d9c6ea', shade: '#ab92c8', light: '#f1e7f9', line: '#3f2b58', eye: '#2e1f44' },
  sporeCap: { base: '#a77ad0', shade: '#7c55a6', light: '#c9a6ea', line: '#36214f' },
}
export const ELEMENT_PAL = {
  fire: { base: '#ff8a4a', shade: '#e0582c', light: '#ffd29a', line: '#7a2a10' },
  water: { base: '#5cc4f0', shade: '#2f8fc4', light: '#c8f1ff', line: '#123e5e' },
  lightning: { base: '#f5d250', shade: '#d1a92a', light: '#fff3b0', line: '#6a5310' },
  poison: { base: '#8fd860', shade: '#5fa83c', light: '#d6f7b0', line: '#2f5a1c' },
}
const elOf = id => ELEMENT_PAL[id] ? id : null
const faceMode = e => e === 'happy' || e === 'release' ? 'happy' : e === 'hurt' ? 'hurt' : 'idle'

/* ------------------------------ shared parts --------------------------- */
function leaf(ctx, x, y, len, wid, rot, pal) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot)
  const b = c => { c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * .45, -wid, len, 0); c.quadraticCurveTo(len * .45, wid, 0, 0); c.closePath() }
  cel(ctx, b, pal, { c: [len / 2, 0], off: [-2, -3], sc: .9 })
  if (fine()) {
    ctx.beginPath(); ctx.moveTo(2, 0); ctx.quadraticCurveTo(len * .5, -wid * .15, len * .82, 0)
    ctx.strokeStyle = rgba('#21461f', .7); ctx.lineWidth = lw(1); ctx.stroke()
  }
  ctx.restore()
}
function stem(ctx, pts, pal) {
  const go = () => { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); ctx.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]) }
  ctx.lineCap = 'round'
  go(); ctx.strokeStyle = pal.line; ctx.lineWidth = 8 + lw(olPx()); ctx.stroke()
  go(); ctx.strokeStyle = pal.base; ctx.lineWidth = 8; ctx.stroke()
}

/** Element orb; `id` null draws an empty socket (second element not yet unlocked). */
function elementOrb(ctx, x, y, R, id, flare = 0, t = 0) {
  const p = ELEMENT_PAL[id]
  if (!p) {
    // empty socket: a faint ring that slowly breathes, waiting for the second element
    const a = .45 + .25 * Math.sin(t * 2.2)
    ctx.save()
    ctx.beginPath(); ctx.arc(x, y, R * .85, 0, TAU)
    ctx.fillStyle = 'rgba(236,238,252,.12)'; ctx.fill()
    ctx.setLineDash([R * .55, R * .4]); ctx.lineDashOffset = -t * R * .6
    ctx.strokeStyle = `rgba(214,210,250,${a})`; ctx.lineWidth = Math.max(R * .16, lw(1.3)); ctx.lineCap = 'round'; ctx.stroke()
    ctx.restore()
    return
  }
  R *= 1 + flare * .3
  glow(ctx, x, y, R * (2.4 + flare * .9), p.base, .55 + flare * .35)
  if (id === 'fire') {
    const b = c => {
      c.beginPath(); c.moveTo(x + R * .15, y - R * 1.75)
      c.bezierCurveTo(x + R * .9, y - R * .9, x + R * 1.1, y - R * .1, x + R, y + R * .2)
      c.bezierCurveTo(x + R * .9, y + R * 1.15, x - R * .9, y + R * 1.15, x - R, y + R * .2)
      c.bezierCurveTo(x - R * 1.05, y - R * .5, x - R * .4, y - R * .9, x + R * .15, y - R * 1.75)
      c.closePath()
    }
    cel(ctx, b, p, { c: [x, y], off: [-2, -2], sc: .88, lights: [[x - R * .2, y + R * .3, R * .45, R * .5, 0]] })
    return
  }
  const b = c => { c.beginPath(); c.arc(x, y, R, 0, TAU) }
  cel(ctx, b, p, { c: [x, y], off: [-2, -2], sc: .9, spec: [x - R * .4, y - R * .45, -.5, R / 18] })
  ctx.save(); ctx.strokeStyle = p.line; ctx.fillStyle = p.light
  ctx.lineWidth = Math.max(R * .16, lw(1.2)); ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  if (id === 'water') {
    ctx.beginPath(); ctx.moveTo(x, y - R * .6); ctx.lineTo(x + R * .42, y); ctx.lineTo(x, y + R * .6); ctx.lineTo(x - R * .42, y); ctx.closePath()
    ctx.fill(); ctx.stroke()
  } else if (id === 'lightning') {
    ctx.beginPath(); ctx.moveTo(x + R * .15, y - R * .65); ctx.lineTo(x - R * .3, y + R * .08); ctx.lineTo(x + R * .08, y + R * .08); ctx.lineTo(x - R * .15, y + R * .65)
    ctx.lineWidth = Math.max(R * .2, lw(1.3)); ctx.stroke()
  } else {
    ell(ctx, x - R * .2, y + R * .1, R * .26, R * .26, 0); ctx.stroke()
    ell(ctx, x + R * .32, y - R * .25, R * .15, R * .15, 0); ctx.stroke()
  }
  ctx.restore()
}

/** Small partner slime (portrait attachments for the summoner). */
function partner(ctx, type, x, y, R, o = {}) {
  const pal = PAL[type]
  if (!o.noShadow) groundShadow(ctx, x, y + R * .88, R * .9)
  if (type === 'hunter') {
    const b = c => {
      c.beginPath(); c.moveTo(x - R * .9, y - R * 1.25)
      c.bezierCurveTo(x - R * .1, y - R * 1.05, x + R * 1.05, y - R * .4, x + R, y + R * .25)
      c.bezierCurveTo(x + R * .95, y + R * .95, x - R * .95, y + R * .95, x - R, y + R * .25)
      c.bezierCurveTo(x - R * 1.05, y - R * .3, x - R * .7, y - R * .7, x - R * .9, y - R * 1.25)
      c.closePath()
    }
    cel(ctx, b, pal, { c: [x, y], off: [-2, -3], sc: .9, spec: [x - R * .4, y - R * .3, -.5, R / 22] })
    leaf(ctx, x + R * .2, y - R * .85, R * .9, R * .32, -1.1, PAL.leaf)
  } else {
    const b = c => { c.beginPath(); c.ellipse(x, y, R, R * .9, 0, 0, TAU) }
    cel(ctx, b, pal, { c: [x, y], off: [-2, -3], sc: .9, spec: type === 'guardian' ? null : [x - R * .45, y - R * .2, -.5, R / 22] })
  }
  if (type === 'guardian') {
    const h = c => {
      c.beginPath(); c.moveTo(x - R * 1.08, y - R * .05)
      c.bezierCurveTo(x - R * 1.1, y - R * 1.25, x + R * 1.1, y - R * 1.25, x + R * 1.08, y - R * .05)
      c.quadraticCurveTo(x, y - R * .3, x - R * 1.08, y - R * .05); c.closePath()
    }
    cel(ctx, h, PAL.stone, { c: [x, y - R * .5], off: [-2, -2], sc: .88, lights: [[x - R * .4, y - R * .72, R * .3, R * .14, -.3]] })
    if (fine()) {
      ctx.beginPath(); ctx.moveTo(x + R * .15, y - R * .95); ctx.lineTo(x + R * .3, y - R * .62); ctx.lineTo(x + R * .12, y - R * .4)
      ctx.strokeStyle = PAL.stone.line; ctx.lineWidth = lw(1); ctx.stroke()
    }
  }
  if (type === 'spore') {
    const cap = c => {
      c.beginPath(); c.moveTo(x - R * 1.3, y - R * .25)
      c.bezierCurveTo(x - R * 1.25, y - R * 1.5, x + R * 1.25, y - R * 1.5, x + R * 1.3, y - R * .25)
      c.quadraticCurveTo(x, y - R * .55, x - R * 1.3, y - R * .25); c.closePath()
    }
    cel(ctx, cap, PAL.sporeCap, { c: [x, y - R * .7], off: [-2, -2], sc: .88 })
    ell(ctx, x - R * .5, y - R * .85, R * .2, R * .14, 0, '#fff')
    ell(ctx, x + R * .35, y - R * 1.05, R * .16, R * .12, 0, '#fff')
    ell(ctx, x + R * .8, y - R * .55, R * .12, R * .09, 0, '#fff')
  }
  const ey = type === 'guardian' ? y + R * .25 : y + R * .05
  if (o.expr === 'happy') {
    arcEye(ctx, x - R * .36, ey, R * .2, pal.eye, 1, R * .14)
    arcEye(ctx, x + R * .36, ey, R * .2, pal.eye, 1, R * .14)
  } else {
    dotEye(ctx, x - R * .36, ey, R * .14, R * .2, pal.eye)
    dotEye(ctx, x + R * .36, ey, R * .14, R * .2, pal.eye)
  }
  if (fine()) smile(ctx, x, ey + R * .28, R * .26, pal.eye, R * .08)
}

/* ============================== 01 ORIGIN =============================== */
const originDome = c => {
  c.beginPath(); c.moveTo(-92, 70)
  c.bezierCurveTo(-98, 14, -58, -44, 0, -46)
  c.bezierCurveTo(58, -44, 98, 14, 92, 70)
  c.bezierCurveTo(88, 86, 50, 84, 0, 84)
  c.bezierCurveTo(-50, 84, -88, 86, -92, 70)
  c.closePath()
}
const origin = {
  id: 'origin', shadowRx: 92,
  body(ctx, st) {
    const sw = Math.sin((st.t || 0) * 2.4) * .06 - (st.hitJolt || 0) * .12
    stem(ctx, [2, -30, -2, -48, 4, -62], PAL.leaf)
    leaf(ctx, 4, -60, 36, 15, -2.55 + sw, PAL.leaf)
    leaf(ctx, 4, -62, 46, 18, -.72 + sw, PAL.leaf)
    cel(ctx, originDome, PAL.origin, {
      c: [0, 20], lights: [[-40, -16, 28, 13, -.35]], spec: [-52, -14, -.4],
      inner: c => {
        if (!fine()) return
        c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1.6
        ell(c, 46, 50, 5, 5, 0); c.stroke(); ell(c, 58, 34, 3, 3, 0); c.stroke()
      },
    })
  },
  face(ctx, st) {
    const pl = PAL.origin, e = faceMode(st.expr), y0 = 10
    if (e === 'hurt') {
      winceEye(ctx, -28, y0, 11, pl.eye); winceEye(ctx, 28, y0, 11, pl.eye, 1)
      wavy(ctx, 0, y0 + 26, 18, pl.eye, 4)
    } else if (e === 'happy') {
      arcEye(ctx, -28, y0, 11, pl.eye, 1, 5.5); arcEye(ctx, 28, y0, 11, pl.eye, 1, 5.5)
      openMouth(ctx, 0, y0 + 18, 26, 16, { line: pl.eye })
    } else {
      dotEye(ctx, -28, y0, 9.5, 12.5, pl.eye, { body: pl.base })
      dotEye(ctx, 28, y0, 9.5, 12.5, pl.eye, { body: pl.base })
      smile(ctx, 0, y0 + 22, 18, pl.eye, 4.2)
    }
    cheeks(ctx, 52, y0 + 18, 10)
  },
  shape: originDome,
}

/* ============================== 02 GLUTTON ============================== */
const gluttonBean = [
  [-104, 60], [-100, 22], [-86, -6], [-66, -20], [-58, -40], [-40, -52], [-20, -44], [-10, -28],
  [10, -28], [20, -44], [40, -52], [58, -40], [66, -20], [86, -6], [100, 22], [104, 60],
  [86, 80], [40, 85], [0, 86], [-40, 85], [-86, 80],
]
function teeth(ctx, xs, yf, h, dir, col, line) {
  ctx.fillStyle = col; ctx.strokeStyle = line; ctx.lineWidth = lw(.9); ctx.lineJoin = 'round'
  for (const [x, s] of xs) {
    const y = yf(x)
    ctx.beginPath(); ctx.moveTo(x - 7.5 * s, y - dir * 1.5); ctx.lineTo(x, y + dir * h * s); ctx.lineTo(x + 7.5 * s, y - dir * 1.5); ctx.closePath()
    ctx.fill(); if (fine()) ctx.stroke()
  }
}
function gluttonBigMouth(ctx, pl, gape = 1, t = 0) {
  const top = s => 6 + 32 * s * (1 - s)
  const deep = 66 * gape + 18 * (1 - gape)
  const b = c => {
    c.beginPath(); c.moveTo(-74, 6)
    c.quadraticCurveTo(0, 22, 74, 6)
    c.bezierCurveTo(68, deep * .72, 32, deep, 0, deep)
    c.bezierCurveTo(-32, deep, -68, deep * .72, -74, 6)
    c.closePath()
  }
  b(ctx); ctx.fillStyle = '#3b0d16'; ctx.fill()
  ctx.save(); b(ctx); ctx.clip()
  ell(ctx, 6, deep - 2, 36, 15, 0, '#ff7a8c')
  if (fine()) ell(ctx, 0, 30, 46, 10, 0, 'rgba(20,0,6,.5)')
  teeth(ctx, [[-46, 1.45], [-24, 1], [-4, 1], [16, 1], [46, 1.45]], x => top((x + 74) / 148), 11, 1, '#fff6e8', '#7a3a30')
  teeth(ctx, [[-30, 1.1], [30, 1.1]], x => deep - 6 - Math.abs(x) * .25, 10, -1, '#fff6e8', '#7a3a30')
  ctx.restore()
  outline(ctx, b, pl.line, .9)
  if (fine()) {
    // drool: swells at the lip, stretches, drops and fades, then the next one forms
    const p = (t * .45) % 1, fall = p * p * 18
    const d = c => {
      c.beginPath(); c.moveTo(66, 26 + fall * .4)
      c.quadraticCurveTo(74 + p * 1.5, 40 + fall, 68, 46 + fall * 1.2)
      c.quadraticCurveTo(60 - p * 1.5, 42 + fall, 66, 26 + fall * .4); c.closePath()
    }
    ctx.save(); ctx.globalAlpha = 1 - p * p * p
    d(ctx); ctx.fillStyle = 'rgba(255,232,220,.92)'; ctx.fill(); outline(ctx, d, pl.line, .6)
    ctx.restore()
  }
}
const glutton = {
  id: 'glutton', shadowRx: 104,
  body(ctx) {
    cel(ctx, gluttonBean, PAL.glutton, {
      c: [0, 22], off: [-8, -9], sc: .95,
      lights: [[-64, -2, 22, 10, -.3], [-46, -40, 8, 4.5, -.4], [34, -40, 8, 4.5, -.4]], spec: [-76, 4, -.5],
    })
  },
  face(ctx, st) {
    const pl = PAL.glutton, e = st.gulp ? 'happy' : faceMode(st.expr)
    if (e === 'hurt') {
      winceEye(ctx, -38, -30, 9, pl.eye); winceEye(ctx, 38, -30, 9, pl.eye, 1)
      if (!st.noMouth) wavy(ctx, 0, 30, 40, pl.line, 5)
    } else if (e === 'happy') {
      arcEye(ctx, -38, -28, 9, pl.eye, 1, 5); arcEye(ctx, 38, -28, 9, pl.eye, 1, 5)
      if (!st.noMouth) {
        smile(ctx, 0, 18, 96, pl.line, 6, .32)
        ell(ctx, 30, 38, 10, 8, 0, '#ff7a8c'); outline(ctx, c => ell(c, 30, 38, 10, 8, 0), pl.line, .6)
      }
    } else {
      dotEye(ctx, -38, -30, 8, 10, pl.eye, { lid: .34, lidColor: pl.base, lidRot: .18, lx: 1.5 })
      dotEye(ctx, 38, -30, 8, 10, pl.eye, { lid: .34, lidColor: pl.base, lidRot: -.18, lx: 1.5 })
      // idle chewing: the jaw works slowly so the mouth never freezes
      const t = st.t || 0
      if (!st.noMouth) gluttonBigMouth(ctx, pl, st.jaw ?? (K.tired ? .45 + .06 * Math.sin(t * 1.4) : .86 + .14 * Math.sin(t * 2.6)), t)
    }
  },
  shape: gluttonBean,
}

/* ============================== 03 RICOCHET ============================= */
const MUZZLE = '#ffd166'
const D2R = Math.PI / 180
// angle from +x, barrel length, width multiplier — a fanned triple crown
const BARRELS = [[-127, 31, 1], [-53, 31, 1], [-90, 38, 1.1]]
/** Barrel mounted on the ball's surface: flange ring, shaded tube, collar band, warm muzzle ring with a dark bore.
 * Drawn after the ball so the whole barrel is readable; `kick` 0..1 pushes it back along its axis. */
function nozzle(ctx, ang, len, w, pl, kick = 0) {
  const bx = Math.cos(ang) * 66 * .88, by = 20 + Math.sin(ang) * 61 * .88
  ctx.save(); ctx.translate(bx, by); ctx.rotate(ang)
  const flange = c => ell(c, 0, 0, 5, w / 2 + 4.5, 0)
  flange(ctx); ctx.fillStyle = pl.shade; ctx.fill(); outline(ctx, flange, pl.line, .9)
  ctx.translate(-kick * 6, 0)
  const b = c => { c.beginPath(); c.rect(0, -w / 2, len, w) }
  b(ctx); ctx.fillStyle = pl.base; ctx.fill()
  ctx.save(); b(ctx); ctx.clip(); ctx.fillStyle = pl.shade; ctx.fillRect(0, w * .12, len, w)
  ctx.fillStyle = pl.light; ctx.fillRect(0, -w * .38, len, w * .16); ctx.restore()
  outline(ctx, b, pl.line)
  const collar = c => { c.beginPath(); c.rect(len * .3, -w / 2 - 2, len * .2, w + 4) }
  collar(ctx); ctx.fillStyle = pl.shade; ctx.fill(); outline(ctx, collar, pl.line, .8)
  const rim = c => ell(c, len, 0, 5.5, w / 2 + 3, 0)
  rim(ctx); ctx.fillStyle = MUZZLE; ctx.fill(); outline(ctx, rim, pl.line)
  ell(ctx, len + 1.4, 0, 2.8, Math.max(2.4, w / 2 - 3.4), 0, '#0d2a40')
  if (kick > .3) glow(ctx, len + 5, 0, 20 + kick * 8, MUZZLE, .85 * kick)
  ctx.restore()
}
const ricochetBall = c => ell(c, 0, 20, 66, 61, 0)
// silhouette = ball + the three barrels, so hit flash and tints cover the whole character
const ricochetShape = c => {
  ricochetBall(c)
  for (const [a, len, wk] of BARRELS) {
    const ang = a * D2R, x = Math.cos(ang) * 66 * .88, y = 20 + Math.sin(ang) * 61 * .88, w = 22 * wk
    const ca = Math.cos(ang), sa = Math.sin(ang)
    const P = (u, v) => [x + ca * u - sa * v, y + sa * u + ca * v]
    const pts = [P(0, -w / 2), P(len + 5, -w / 2 - 3), P(len + 5, w / 2 + 3), P(0, w / 2)]
    c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < 4; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath()
  }
}
const ricochet = {
  id: 'ricochet', shadowRx: 70,
  body(ctx, st) {
    const pl = PAL.ricochet, kick = st.recoil || 0
    // combat LOD: fatter, slightly longer barrels so the crown survives at r26
    const g = K.small ? 1.2 : 1, L = K.small ? 3 : 0
    cel(ctx, ricochetBall, pl, {
      c: [0, 20], lights: [[-30, -8, 26, 13, -.45]], spec: [-40, -12, -.5],
      inner: c => {
        c.beginPath(); c.moveTo(-70, 52); c.quadraticCurveTo(0, 74, 70, 52); c.lineTo(70, 62); c.quadraticCurveTo(0, 84, -70, 62); c.closePath()
        c.fillStyle = 'rgba(235,252,255,.55)'; c.fill()
      },
    })
    for (const [a, len, wk] of BARRELS) nozzle(ctx, a * D2R, len + L, 22 * g * wk, pl, kick)
  },
  face(ctx, st) {
    const pl = PAL.ricochet, e = faceMode(st.expr)
    if (e === 'hurt') {
      winceEye(ctx, -24, 14, 10, pl.eye); winceEye(ctx, 24, 14, 10, pl.eye, 1)
      wavy(ctx, 0, 38, 16, pl.eye, 4)
    } else if (e === 'happy') {
      arcEye(ctx, -24, 14, 10, pl.eye, 1, 5); arcEye(ctx, 24, 14, 10, pl.eye, 1, 5)
      openMouth(ctx, 0, 30, 24, 15, { line: pl.eye })
    } else {
      ctx.beginPath(); ctx.moveTo(-36, 16); ctx.quadraticCurveTo(-25, 10, -13, 15)
      ctx.strokeStyle = pl.eye; ctx.lineWidth = Math.max(5, lw(1.5)); ctx.lineCap = 'round'; ctx.stroke()
      dotEye(ctx, 25, 13, 10, 13, pl.eye, { lid: .22, lidColor: pl.base, lidRot: -.25 })
      ctx.beginPath(); ctx.moveTo(-6, 36); ctx.quadraticCurveTo(4, 42, 13, 33)
      ctx.strokeStyle = pl.eye; ctx.lineWidth = Math.max(4, lw(1.4)); ctx.stroke()
    }
  },
  shape: ricochetShape,
}

/* ============================== 04 ELEMENTAL ============================ */
const elementalHat = [
  [40, -120], [30, -104], [20, -84], [16, -60], [18, -40],
  [44, -31], [76, -24], [84, -14], [70, -5],
  [78, 20], [80, 50], [68, 74], [36, 84], [0, 86], [-36, 84], [-68, 74], [-80, 50], [-78, 20],
  [-70, -5], [-84, -14], [-76, -24], [-42, -31],
  [-26, -46], [-12, -68], [4, -92], [22, -110], [34, -121],
]
function elemTint(ctx, e1, e2, x0, x1, a = .5) {
  const gr = ctx.createLinearGradient(x0, 0, x1, 0)
  const c1 = e1 ? ELEMENT_PAL[e1].base : '#eceefc', c2 = e2 ? ELEMENT_PAL[e2].base : '#eceefc'
  gr.addColorStop(0, rgba(c1, e1 ? a : 0)); gr.addColorStop(.5, rgba(c1, 0))
  gr.addColorStop(.5, rgba(c2, 0)); gr.addColorStop(1, rgba(c2, e2 ? a : 0))
  ctx.fillStyle = gr; ctx.fillRect(x0, -140, x1 - x0, 240)
}
const elementPair = st => {
  const list = (st.el || []).map(elOf).filter(Boolean)
  return [list[0] || null, list[1] || null]
}
const elemental = {
  id: 'elemental', shadowRx: 84,
  body(ctx, st) {
    const pl = PAL.elemental, [e1, e2] = elementPair(st)
    cel(ctx, elementalHat, pl, {
      c: [0, 24],
      tint: c => elemTint(c, e1, e2, -84, 84, .5 + (st.coreGlow || 0) * .2),
      lights: [[-38, 24, 20, 13, -.4], [0, -66, 4, 14, .4]], spec: [-48, 20, -.5],
      inner: c => {
        c.beginPath(); c.moveTo(-74, -10); c.quadraticCurveTo(0, 6, 74, -10)
        c.strokeStyle = pl.line; c.lineWidth = lw(olPx() * .8); c.stroke()
        c.beginPath(); c.moveTo(-64, -18); c.quadraticCurveTo(0, -6, 64, -18)
        c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = Math.max(3, lw(1)); c.stroke()
      },
    })
    const t = st.t || 0, flare = Math.min(1, st.coreGlow || 0)
    if (fine() && (e1 || e2)) {
      // the hat tip twinkles in the first element's colour
      const tw = .75 + .25 * Math.sin(t * 3.4)
      glow(ctx, 40, -122, 11 + flare * 7, ELEMENT_PAL[e1 || e2].base, .9 * tw)
      sparkle(ctx, 40, -122, 7 * tw + flare * 5, '#fff')
    }
    // orbs drift on slow ellipses (one in front of its side, one behind) instead of bobbing in place
    const a1 = t * 1.3, a2 = t * 1.3 + Math.PI
    elementOrb(ctx, -100 + Math.cos(a1) * 6, 2 + Math.sin(a1) * 9, 15, e1, flare, t)
    elementOrb(ctx, 100 + Math.cos(a2) * 6, -14 + Math.sin(a2) * 9, 15, e2, flare, t)
  },
  face(ctx, st) {
    const pl = PAL.elemental, e = faceMode(st.expr), [e1, e2] = elementPair(st), y0 = 28, sp = 24
    if (e === 'hurt') {
      winceEye(ctx, -sp, y0, 9.5, pl.eye); winceEye(ctx, sp, y0, 9.5, pl.eye, 1)
      wavy(ctx, 0, y0 + 20, 12, pl.eye, 3.6)
    } else if (e === 'happy' || st.expr === 'charge') {
      for (const [x, el] of [[-sp, e1 || e2], [sp, e2 || e1]]) {
        const p = ELEMENT_PAL[el] || { base: '#8f86d8', line: pl.eye }
        glow(ctx, x, y0, 20, p.base, .7)
        ell(ctx, x, y0, 8.5, 11.5, 0, p.base); outline(ctx, c => ell(c, x, y0, 8.5, 11.5, 0), p.line, .8)
        ell(ctx, x - 2.5, y0 - 4, 3.2, 3.8, 0, '#fff')
      }
      openMouth(ctx, 0, y0 + 16, 14, 10, { line: pl.eye, wid: 2.6 })
    } else {
      arcEye(ctx, -sp, y0, 10, pl.eye, -1, 4.6); arcEye(ctx, sp, y0, 10, pl.eye, -1, 4.6)
      smile(ctx, 0, y0 + 18, 10, pl.eye, 3.4, .4)
    }
  },
  shape: elementalHat,
}

/* =============================== 05 SHADOW ============================== */
// The tail whips on a slow double sine. `shadowSway` is written by body() each frame so
// the silhouette (hit flash, evolution tint, clone ghosts) follows the same tail pose.
const shadowSway = { a: 0, b: 0 }
const shadowLean = c => {
  const { a, b } = shadowSway
  c.beginPath(); c.moveTo(72, 60)
  c.bezierCurveTo(86, 28, 82, -22, 40, -40)
  c.bezierCurveTo(10, -52, -24, -50, -50, -58)
  c.bezierCurveTo(-74 + a * 2, -66 + b * 2, -104 + a * 5, -74 + b * 3, -128 + a * 9, -98 + b * 7)
  c.bezierCurveTo(-110 + a * 6, -74 + b * 3, -96, -40, -82, -16)
  c.bezierCurveTo(-90, 12, -86, 50, -66, 72)
  c.bezierCurveTo(-40, 88, 40, 88, 72, 60)
  c.closePath()
}
function slitEye(ctx, x, y, w, h, rot, mode, t = 0) {
  const pl = PAL.shadow
  glow(ctx, x, y, w * 1.9, '#8fd0ff', .46 + .14 * Math.sin(t * 2.6 + x))
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot)
  if (mode === 'happy' || K.blink) {
    ctx.beginPath(); ctx.moveTo(-w, h * .6); ctx.quadraticCurveTo(0, (K.blink ? 1.2 : -1.8) * h, w, h * .6)
    ctx.strokeStyle = pl.eye; ctx.lineWidth = Math.max(h * .9, lw(1.6)); ctx.lineCap = 'round'; ctx.stroke()
  } else if (mode === 'hurt') {
    ctx.strokeStyle = pl.eye; ctx.lineWidth = Math.max(h * .8, lw(1.6)); ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(-w * .6, -h); ctx.lineTo(w * .6, h); ctx.moveTo(w * .6, -h); ctx.lineTo(-w * .6, h); ctx.stroke()
  } else {
    const top = K.tired ? -h * 1.1 : -h * 2.1
    ctx.beginPath(); ctx.moveTo(-w, 0); ctx.quadraticCurveTo(0, top, w, 0); ctx.quadraticCurveTo(0, h * 1.1, -w, 0); ctx.closePath()
    ctx.fillStyle = pl.eye; ctx.fill()
    if (fine()) ell(ctx, w * .1, -h * .2, w * .14, h * .75, 0, '#3a2f7a')
  }
  ctx.restore()
}
const shadow = {
  id: 'shadow', shadowRx: 92,
  body(ctx, st) {
    const t = st.t || 0
    shadowSway.a = Math.sin(t * 2.2); shadowSway.b = Math.sin(t * 1.5 + 1.1)
    if (fine() && !st.noWisps) {
      // ink wisps peel off the tail and drift along the ground, each on its own phase
      for (const [x, y, s, ph] of [[-104, 76, 1, 0], [-128, 66, .7, 1.7]]) {
        const drift = Math.sin(t * 1.4 + ph) * 4, al = .42 + .2 * Math.sin(t * 2.1 + ph)
        ctx.save(); ctx.translate(drift, 0)
        ctx.beginPath(); ctx.moveTo(x + 14 * s, y); ctx.quadraticCurveTo(x, y - 4 * s, x - 14 * s, y - 14 * s); ctx.quadraticCurveTo(x - 2 * s, y + 6 * s, x + 14 * s, y)
        ctx.fillStyle = `rgba(47,39,73,${al})`; ctx.fill()
        ctx.restore()
      }
    }
    cel(ctx, shadowLean, PAL.shadow, { c: [0, 16], off: [-7, -7], lights: [[30, -18, 18, 9, -.5]], spec: [44, -20, .5, .9, .55], rimOff: [-.8, 1] })
    if (fine()) {
      // faint violet ember at the tail tip so the whip stays readable on dark ground
      const tipX = -128 + shadowSway.a * 9, tipY = -98 + shadowSway.b * 7
      glow(ctx, tipX + 3, tipY + 4, 12, '#a98bff', .35 + .15 * Math.sin(t * 3))
    }
  },
  face(ctx, st) {
    const m = faceMode(st.expr)
    slitEye(ctx, 14, 6, 16, 6.5, .24, m, st.t || 0)
    slitEye(ctx, 54, 2, 15, 6.5, -.2, m, st.t || 0)
  },
  shape: shadowLean,
}

/* ============================== 06 SUMMONER ============================= */
// Pear-shaped mother with three round buds on top, tinted like the partners she calls
// (guardian / hunter / spore). Buds are drawn first so the body overlaps their roots.
const motherBody = [
  [-70, 44], [-72, 6], [-64, -26], [-46, -50], [-22, -62], [0, -65], [22, -62], [46, -50], [64, -26], [72, 6],
  [70, 44], [62, 72], [36, 84], [0, 86], [-36, 84], [-62, 72],
]
const BUDS = [[-38, -64, 15, 'guardian'], [0, -79, 17.5, 'hunter'], [38, -64, 15, 'spore']]
const motherShape = c => {
  poly(c, motherBody)
  for (const [x, y, r] of BUDS) { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU) }
}
const summoner = {
  id: 'summoner', shadowRx: 78,
  body(ctx, st) {
    const t = st.t || 0
    BUDS.forEach(([x, y, r, k], i) => {
      const bob = Math.sin(t * 2.6 + i * 1.3) * 2 - (st.hitJolt || 0) * 4
      const b = c => ell(c, x, y + bob, r, r * .94, 0)
      cel(ctx, b, PAL[k], { c: [x, y + bob], off: [-2.5, -3], sc: .9, spec: [x - r * .34, y + bob - r * .3, -.5, r / 22] })
    })
    cel(ctx, motherBody, PAL.summoner, { c: [0, 20], lights: [[-34, -12, 20, 13, -.4]], spec: [-42, -18, -.5] })
  },
  face(ctx, st) {
    const pl = PAL.summoner, e = faceMode(st.expr), y0 = 14
    if (e === 'hurt') {
      winceEye(ctx, -26, y0, 10, pl.eye); winceEye(ctx, 26, y0, 10, pl.eye, 1)
      wavy(ctx, 0, y0 + 22, 14, pl.eye, 3.8)
    } else if (e === 'happy') {
      arcEye(ctx, -26, y0, 11, pl.eye, 1, 5); arcEye(ctx, 26, y0, 11, pl.eye, 1, 5)
      openMouth(ctx, 0, y0 + 16, 26, 16, { line: pl.eye })
    } else if (K.tired) {
      dotEye(ctx, -26, y0, 8, 10, pl.eye, { body: pl.base }); dotEye(ctx, 26, y0, 8, 10, pl.eye, { body: pl.base })
      wavy(ctx, 0, y0 + 22, 14, pl.eye, 3.8)
    } else {
      arcEye(ctx, -26, y0, 10.5, pl.eye, 1, 4.6); arcEye(ctx, 26, y0, 10.5, pl.eye, 1, 4.6)
      smile(ctx, 0, y0 + 20, 20, pl.eye, 4, .42)
    }
    cheeks(ctx, 46, y0 + 16, 10, .5)
  },
  attachments(ctx, st) {
    const hop = Math.abs(Math.sin((st.petHop ?? st.t ?? 0) * 3)) * 4, expr = faceMode(st.expr)
    partner(ctx, 'spore', -86, -36 - hop, 17, { expr, noShadow: true })
    partner(ctx, 'guardian', -84, 64, 23, { expr })
    partner(ctx, 'hunter', 90, 60 - hop, 20, { expr })
  },
  shape: motherShape,
}

export const SLIME_CAST = { origin, glutton, ricochet, elemental, shadow, summoner }

/** Face layer with gaze: the whole face glides a few units toward `lookX/lookY` (-1..1),
 * reading as the slime turning its head toward where it is going or attacking. */
export function paintFace(ctx, id, st = {}) {
  const ch = SLIME_CAST[id]
  if (!ch) return false
  ctx.save()
  ctx.translate((st.lookX || 0) * 5, (st.lookY || 0) * 3)
  ch.face(ctx, st)
  ctx.restore()
  return true
}

/** Build the body silhouette path (used for evolution tint, charge rim, hit flash). */
export function slimeShapePath(ctx, id) {
  const ch = SLIME_CAST[id]
  if (!ch) return false
  if (typeof ch.shape === 'function') ch.shape(ctx); else poly(ctx, ch.shape)
  return true
}

/* ------------------------------ pose table ----------------------------- */
const SPR = (p, amp, freq) => Math.exp(-p * 5.5) * Math.cos(p * Math.PI * (freq || 4)) * amp
const JOLT = p => Math.exp(-p * 4.5)
const base = {
  idle: t => ({ sx: 1, sy: 1 + .028 * Math.sin(t * 2), expr: 'idle', t }),
  move: t => ({ sx: 1.1, sy: .9, lean: .08, lift: -4 * Math.abs(Math.sin(t * 6)), lookX: 1, expr: 'charge', t }),
  charge: t => ({ sx: 1.18, sy: .78, expr: 'charge', t }),
  release: t => ({ sx: .86, sy: 1.18, lift: -6, expr: 'happy', t }),
  recover: t => ({ sx: 1.05, sy: .95, expr: 'happy', t }),
  hit: p => ({ sx: 1 + SPR(p, .24, 4) * 1.15, sy: 1 - SPR(p, .26, 4), lean: .05 * JOLT(p), expr: p < .5 ? 'hurt' : 'idle', hitJolt: JOLT(p), t: p * 3 }),
}
const POSES = {
  origin: base,
  glutton: { ...base, idle: t => ({ sx: 1, sy: 1 + .022 * Math.sin(t * 1.8), expr: 'idle', t }), release: t => ({ sx: 1.16, sy: .84, lean: .1, lift: -4, expr: 'idle', t }) },
  ricochet: { ...base, idle: t => ({ sx: 1 + .024 * Math.sin(t * 7), sy: 1 - .022 * Math.sin(t * 7), expr: 'idle', t }), release: t => ({ sx: .8, sy: 1.26, lift: -10, recoil: 1, expr: 'happy', t }) },
  elemental: { ...base, release: t => ({ sx: .92, sy: 1.1, lift: -6, coreGlow: 1, expr: 'happy', t }) },
  shadow: { ...base, idle: t => ({ sx: 1, sy: 1 + .018 * Math.sin(t * 1.6), expr: 'idle', t }), release: t => ({ sx: 1.22, sy: .82, lean: .08, expr: 'happy', t }) },
  summoner: { ...base, release: t => ({ sx: 1.04, sy: .96, lift: -4, expr: 'happy', petHop: t + 2, t }) },
}
export function slimePose(id, name, t = 0) {
  const fn = (POSES[id] || base)[name] || base.idle
  return fn(t)
}

/**
 * Full portrait draw: ground shadow, squash about the feet, body, face, and
 * unsquashed attachments. Caller translates to the body centre (feet at +0.8r).
 */
export function drawSlimeFamily(ctx, id, r, st = {}) {
  const ch = SLIME_CAST[id]
  if (!ch) return false
  setScale(r, st)
  const sx = st.sx ?? 1, sy = st.sy ?? 1
  ctx.save(); ctx.scale(K.k, K.k)
  if (!st.noShadow) groundShadow(ctx, 0, FEET_Y + 4, ch.shadowRx * sx)
  ctx.save()
  ctx.translate(0, FEET_Y); ctx.scale(sx, sy); ctx.rotate(st.lean || 0); ctx.translate(0, -FEET_Y + (st.lift || 0))
  ch.body(ctx, st); paintFace(ctx, id, st)
  ctx.restore()
  if (ch.attachments && !st.noAttach) {
    ctx.save(); ctx.translate(0, st.lift || 0); ch.attachments(ctx, st); ctx.restore()
  }
  ctx.restore()
  return true
}
