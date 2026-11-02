/* =========================================================================
 * Current slime art — game bridge (current-r2).
 * Space contract: the caller's ctx is already at the player centre (inside
 * the player's own squash transform); the cast scales by r/100 and paints in
 * "radius = 100" units, feet at y = +80 (~+0.8r, matching Player).
 * ========================================================================= */
import { SLIME_CAST, paintFace, slimeShapePath } from './slime-art/slime-cast.js'
import { setScale } from './slime-art/slime-painter.js'

const art = id => SLIME_CAST[id]

/** Whether the strain has approved current procedural art (all six do). */
export function hasSlimeFamilyArt(strainId) { return !!art(strainId) }

/** Game face flags -> current visual state (eyes/cheeks/mouth layer only). */
export function slimeFamilyFaceState(t, expression = {}) {
  let expr = 'idle'
  if (expression.hurt) expr = 'hurt'
  else if (expression.devour || expression.happy) expr = 'happy'
  else if (expression.angry) expr = 'charge'
  return {
    expr, t,
    blink: !!expression.blink,
    tired: !!expression.lowhp && !expression.hurt,
    noMouth: !!expression.bite,
    el: expression.elements || [],
    lookX: expression.lookX || 0,
    lookY: expression.lookY || 0,
  }
}

/** Game flags -> current body state. Bite suppresses the design mouth entirely —
 * the real jaw is drawn by the game's own GluttonBiteVisual on top. */
export function slimeFamilyBodyState(t, { bite = 0, swallowing = 0, elements = [], hitJolt = 0, recoil = 0, coreGlow = 0 } = {}) {
  return {
    expr: 'idle', t,
    el: Array.isArray(elements) ? elements : [],
    recoil, coreGlow,
    noMouth: bite ? 1 : 0,
    gulp: swallowing ? 1 : 0,
    hitJolt,
    petHop: t,
    noAttach: 1,  // real pets are independent units — never double-draw
    noShadow: 1,  // Player draws its own ground contact shadow
  }
}

/** Body layer. Returns false when the strain has no current art so the caller can fall back. */
export function renderSlimeFamilyBody(ctx, strainId, r, st = {}) {
  const ch = art(strainId)
  if (!ch) return false
  setScale(r, st)
  ctx.save(); ctx.scale(r / 100, r / 100)
  ch.body(ctx, st)
  ctx.restore()
  return true
}

/** Face layer — drawn after mutation overlays, same squash space as body. */
export function renderSlimeFamilyFace(ctx, strainId, r, st = {}) {
  const ch = art(strainId)
  if (!ch) return false
  setScale(r, st)
  ctx.save(); ctx.scale(r / 100, r / 100)
  paintFace(ctx, strainId, st)
  ctx.restore()
  setScale(r)
  return true
}

/** Silhouette fill/stroke for evolution tint, charge rim and hit flash.
 * options: { fill, stroke, width } with width in screen pixels. */
export function paintSlimeFamilySilhouette(ctx, strainId, r, options = {}) {
  if (!art(strainId)) return false
  const k = r / 100
  ctx.save(); ctx.scale(k, k)
  slimeShapePath(ctx, strainId)
  if (options.fill) { ctx.fillStyle = options.fill; ctx.fill() }
  if (options.stroke) {
    ctx.strokeStyle = options.stroke
    ctx.lineWidth = (options.width || 2) / k
    ctx.lineJoin = 'round'
    ctx.stroke()
  }
  ctx.restore()
  return true
}
