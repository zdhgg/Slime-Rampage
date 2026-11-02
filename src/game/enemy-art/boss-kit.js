/* =========================================================================
 * Boss art kit — shared pose table, frame pick and phase-2 cosmetics for
 * every Arena boss cast (current-r2 language, same material rules as the
 * nine ordinary enemies; bosses are the family's ornate big siblings).
 * ========================================================================= */
import { lw, ell, glow, openMouth } from '../slime-art/slime-painter.js'
import { ENEMY_PAL, BOSS_PAL, shiftPts, insetPts, limb, part, brow, emblem, moveFrames, frameIndex } from './enemy-kit.js'

export { ENEMY_PAL, BOSS_PAL, shiftPts, insetPts, limb, part, brow, emblem, moveFrames, frameIndex, openMouth }

/** The fixed 17-key pose table every boss bakes: the eight normal stances,
 *  their phase-2 `r_` rage twins, then the roar (rage-only frame). */
export function bossFrames() {
  const base = [
    ['idle', { pose: 'idle' }],
    ...moveFrames(),
    ['windup', { pose: 'windup' }],
    ['strike', { pose: 'strike' }],
    ['recover', { pose: 'recover' }],
  ]
  return [
    ...base,
    ...base.map(([key, st]) => [`r_${key}`, { ...st, rage: true }]),
    ['r_roar', { pose: 'roar', rage: true }],
  ]
}

/** Shared frame pick: roar > recover > strike > windup > move > idle; `r_` prefix while enraged. */
export function bossFrameKey(st = {}, gait = 1) {
  const r = st.enraged ? 'r_' : ''
  if (st.stance === 'roar') return 'r_roar'
  if (st.stance === 'recover') return `${r}recover`
  if (st.swing >= 0 || st.casting === 'fire') return `${r}strike`
  if (st.windup || st.casting === 'charge') return `${r}windup`
  if (st.moving) return `${r}move${frameIndex(st.walkT || 0, gait)}`
  return `${r}idle`
}

/** Phase-2 hostile eyes: red glow slits on the same eye line (silhouette unchanged). */
export function rageEyes(ctx, x, y, dx, s = 1) {
  for (const [ex, rot] of [[x, .3], [x + dx, -.3]]) {
    glow(ctx, ex, y, 24 * s, '#ff5a3c', .6)
    ctx.save(); ctx.translate(ex, y); ctx.rotate(rot)
    ell(ctx, 0, 0, 8.5 * s, 11.5 * s, 0, '#ff6a4a')
    ell(ctx, -1.6 * s, -3.2 * s, 3 * s, 4.4 * s, 0, '#ffe0d0')
    ctx.restore()
  }
}

/** Steeper phase-2 brows (same slant direction, more pitch). */
export function rageBrow(ctx, x1, y1, x2, y2, col) {
  ctx.beginPath(); ctx.moveTo(x1, y1 + 4); ctx.lineTo(x2, y2 - 5)
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(10, lw(1.7)); ctx.lineCap = 'round'; ctx.stroke()
}

/** Small teardrop flame wisp — deterministic geometry, safe for cached frames. */
const WISP = [[0, -15], [7, -4], [4, 6], [0, 10], [-5, 5], [-8, -3]]
export function embers(ctx, pts, col = '#ff7a3c') {
  for (const [x, y, s] of pts) {
    const k = s || 1
    part(ctx, WISP.map(([px, py]) => [x + px * k, y + py * k]), { base: col, shade: '#c23c14', light: '#ffc890', line: '#5c1408' }, [x, y], { off: [-1.5 * k, -2 * k], sc: .85, ol: .7 })
  }
}

/** Blue sweat drop for the exhausted recover pose. */
export function sweat(ctx, x, y, s = 1) {
  part(ctx, [[x, y - 10 * s], [x + 6 * s, y + 2 * s], [x, y + 9 * s], [x - 6 * s, y + 2 * s]],
    { base: '#8fd4f0', shade: '#4a9cc8', light: '#d8f4ff', line: '#1e5468' }, [x, y], { off: [-1.5 * s, -2 * s], sc: .85, ol: .7 })
}

/** Short radiating shock lines above a roaring head — six strokes with a hot
 *  inner pass so the roar still reads over a busy battlefield. */
export function shockLines(ctx, x, y, r0, r1, col = 'rgba(255,236,190,.85)') {
  ctx.strokeStyle = col; ctx.lineCap = 'round'
  for (const a of [-2.3, -1.98, -1.66, -1.34, -1.02, -.7]) {
    ctx.beginPath()
    ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0)
    ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1)
    ctx.lineWidth = lw(2.6); ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x + Math.cos(a) * (r0 + 5), y + Math.sin(a) * (r0 + 5))
    ctx.lineTo(x + Math.cos(a) * (r1 - 7), y + Math.sin(a) * (r1 - 7))
    ctx.strokeStyle = 'rgba(255,255,240,.9)'; ctx.lineWidth = lw(1.1); ctx.stroke()
    ctx.strokeStyle = col
  }
}

/** Weapon-edge glow used on strike / rage frames (flat halo, not a material). */
export function hotEdge(ctx, x, y, r, col = '#ffb04a', a = .55) {
  glow(ctx, x, y, r, col, a)
}
