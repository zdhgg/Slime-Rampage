/* =========================================================================
 * Slime Rampage · family paint kit (runtime art contract, current-r2)
 * -------------------------------------------------------------------------
 * Flat-plus cel material that matches the flat vector world: shade / base /
 * light + one specular + a tinted outline whose screen width stays constant.
 *
 * Space contract (unchanged from r1): the caller translates to the body
 * centre and the cast scales by r/100, painting in "radius = 100" units with
 * the ground contact line at y = +80 (~+0.8 r, matching Player feet).
 * Call `setScale(r)` before painting so outlines and LOD follow screen size.
 * ========================================================================= */
export const TAU = Math.PI * 2
export const FEET_Y = 80

/** Shared per-draw state: k = r/100, small = combat-size LOD, face flags. */
export const K = { k: 1, small: false, blink: false, tired: false, focus: false }
export function setScale(r, flags = {}) {
  K.k = Math.max(r, 1) / 100
  K.small = r < 40
  K.blink = !!flags.blink
  K.tired = !!flags.tired
  K.focus = flags.expr === 'charge'
}
export const lw = px => px / K.k
export const olPx = () => 1.5 + 1.3 * Math.min(1, K.k)
export const fine = () => !K.small

/* ------------------------------ helpers -------------------------------- */
export function poly(ctx, pts) {
  const n = pts.length
  ctx.beginPath()
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n]
    if (!i) ctx.moveTo(p1[0], p1[1])
    ctx.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1])
  }
  ctx.closePath()
}
export const shapeOf = s => typeof s === 'function' ? s : ctx => poly(ctx, s)

export function ell(ctx, x, y, rx, ry, rot, fill) {
  ctx.beginPath(); ctx.ellipse(x, y, Math.max(rx, .01), Math.max(ry, .01), rot || 0, 0, TAU)
  if (fill) { ctx.fillStyle = fill; ctx.fill() }
}
export function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`
}
export function glow(ctx, x, y, r, hex, a) {
  const gr = ctx.createRadialGradient(x, y, 0, x, y, r)
  gr.addColorStop(0, rgba(hex, a)); gr.addColorStop(1, rgba(hex, 0))
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill()
}
/** Four-point twinkle, `s` = half-length of the long axis. */
export function sparkle(ctx, x, y, s, col) {
  ctx.beginPath()
  ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x, y, x + s * .55, y)
  ctx.quadraticCurveTo(x, y, x, y + s); ctx.quadraticCurveTo(x, y, x - s * .55, y)
  ctx.quadraticCurveTo(x, y, x, y - s); ctx.closePath()
  ctx.fillStyle = col; ctx.fill()
}
export function groundShadow(ctx, x, y, rx) { ell(ctx, x, y, rx, rx * .2, 0, 'rgba(6,12,10,.36)') }
export function outline(ctx, b, col, k) {
  b(ctx); ctx.strokeStyle = col; ctx.lineWidth = lw(olPx() * (k || 1))
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke()
}
export function spec(ctx, x, y, rot, s = 1, a = .92) {
  ell(ctx, x, y, 9 * s, 5 * s, rot, `rgba(255,255,255,${a})`)
  ell(ctx, x + 11 * s, y + 7 * s, 2.6 * s, 2.6 * s, 0, `rgba(255,255,255,${a * .8})`)
}

/**
 * Flat-plus cel body.
 *  1. shade fill            2. base = copy offset toward the light (shade
 *  crescent remains bottom-right)   3. tint hook   4. light patches
 *  5. inner hook   6. optional rim crescent   7. specular   8. outline
 */
export function cel(ctx, shape, pal, o = {}) {
  const b = shapeOf(shape)
  const [cx, cy] = o.c || [0, 10]
  const off = o.off || [-7, -9], sc = o.sc || .95
  b(ctx); ctx.fillStyle = pal.shade; ctx.fill()
  ctx.save(); b(ctx); ctx.clip()
  ctx.save()
  ctx.translate(cx + off[0], cy + off[1]); ctx.scale(sc, sc); ctx.translate(-cx, -cy)
  b(ctx); ctx.fillStyle = pal.base; ctx.fill()
  ctx.restore()
  if (o.tint) o.tint(ctx)
  for (const L of o.lights || []) ell(ctx, L[0], L[1], L[2], L[3], L[4] || 0, pal.light)
  if (o.inner) o.inner(ctx)
  if (pal.rim) {
    // rim crescent = body minus a copy offset away from the light
    const ro = o.rimOff || [-1, 1], m = Math.max(5, lw(1.4))
    ctx.save()
    ctx.translate(ro[0] * m, ro[1] * m); b(ctx); ctx.translate(-ro[0] * m, -ro[1] * m)
    ctx.rect(-400, -400, 800, 800); ctx.clip('evenodd')
    ctx.fillStyle = pal.rim; ctx.fillRect(-400, -400, 800, 800)
    ctx.restore()
  }
  if (o.spec) spec(ctx, o.spec[0], o.spec[1], o.spec[2] || -.45, o.spec[3] || 1, o.spec[4] || .92)
  ctx.restore()
  outline(ctx, b, pal.line, o.ol)
}

/* -------------------------------- face kit ----------------------------- */
export function dotEye(ctx, x, y, rx, ry, col, o = {}) {
  if (K.blink) {
    ctx.beginPath(); ctx.moveTo(x - rx * 1.05, y + ry * .2); ctx.quadraticCurveTo(x, y + ry * .55, x + rx * 1.05, y + ry * .2)
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(rx * .5, lw(1.5)); ctx.lineCap = 'round'; ctx.stroke()
    return
  }
  // focus = determined (lid tilts toward the nose); tired = droopy (lid tilts outward)
  const lid = K.tired ? Math.max(o.lid || 0, .46) : K.focus ? Math.max(o.lid || 0, .3) : o.lid || 0
  const lidColor = o.lidColor || o.body
  const lidRot = K.tired ? (x < 0 ? -.18 : .18) : K.focus ? (x < 0 ? .24 : -.24) : o.lidRot || 0
  ell(ctx, x, y, rx, ry, o.rot || 0, col)
  ell(ctx, x - rx * .3 + (o.lx || 0), y - ry * .32 + lid * ry * .7, rx * .38, ry * .3, -.3, '#fff')
  if (fine()) ell(ctx, x + rx * .32, y + ry * .42, rx * .14, rx * .14, 0, 'rgba(255,255,255,.7)')
  if (lid && lidColor) {
    ctx.save(); ell(ctx, x, y, rx + .4, ry + .4, o.rot || 0); ctx.clip()
    ctx.translate(x, y); ctx.rotate(lidRot)
    const cut = -ry + ry * 2 * lid
    ctx.fillStyle = lidColor; ctx.fillRect(-rx * 2, -ry * 2, rx * 4, ry * 2 + cut)
    ctx.restore()
    ctx.save(); ctx.translate(x, y); ctx.rotate(lidRot)
    ctx.beginPath(); ctx.moveTo(-rx * 1.15, -ry + ry * 2 * lid); ctx.lineTo(rx * 1.15, -ry + ry * 2 * lid)
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(2.6, lw(1.3)); ctx.lineCap = 'round'; ctx.stroke()
    ctx.restore()
  }
}
export function arcEye(ctx, x, y, w, col, dir = 1, wid) {
  ctx.beginPath(); ctx.moveTo(x - w, y + dir * w * .25)
  ctx.quadraticCurveTo(x, y - dir * w * 1.05, x + w, y + dir * w * .25)
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(wid || w * .5, lw(1.5)); ctx.lineCap = 'round'; ctx.stroke()
}
export function winceEye(ctx, x, y, w, col, flip) {
  const s = flip ? -1 : 1
  ctx.beginPath()
  ctx.moveTo(x - w * .75 * s, y - w * .6); ctx.lineTo(x + w * .45 * s, y); ctx.lineTo(x - w * .75 * s, y + w * .6)
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(w * .42, lw(1.5)); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke()
}
export function smile(ctx, x, y, w, col, wid, depth = .45) {
  ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.quadraticCurveTo(x, y + w * depth, x + w / 2, y)
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(wid || w * .2, lw(1.4)); ctx.lineCap = 'round'; ctx.stroke()
}
export function wavy(ctx, x, y, w, col, wid) {
  ctx.beginPath(); ctx.moveTo(x - w / 2, y)
  ctx.quadraticCurveTo(x - w / 4, y - w * .22, x, y); ctx.quadraticCurveTo(x + w / 4, y + w * .22, x + w / 2, y)
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(wid || w * .2, lw(1.4)); ctx.lineCap = 'round'; ctx.stroke()
}
/** D-shaped open mouth: flat-ish top, round bottom, tongue. */
export function openMouth(ctx, x, y, w, h, o = {}) {
  ctx.save()
  ctx.beginPath(); ctx.moveTo(x - w / 2, y)
  ctx.quadraticCurveTo(x, y + h * .18, x + w / 2, y)
  ctx.bezierCurveTo(x + w * .46, y + h * .9, x - w * .46, y + h * .9, x - w / 2, y)
  ctx.closePath()
  ctx.fillStyle = o.deep || '#3a0e14'; ctx.fill()
  ctx.save(); ctx.clip(); ell(ctx, x, y + h * .78, w * .3, h * .3, 0, o.tongue || '#ff8a96'); ctx.restore()
  ctx.strokeStyle = o.line; ctx.lineWidth = Math.max(o.wid || 3, lw(1.3)); ctx.lineJoin = 'round'; ctx.stroke()
  ctx.restore()
}
export function cheeks(ctx, x, y, rx, a = .42) {
  ell(ctx, -x, y, rx, rx * .5, 0, `rgba(255,120,110,${a})`)
  ell(ctx, x, y, rx, rx * .5, 0, `rgba(255,120,110,${a})`)
}
