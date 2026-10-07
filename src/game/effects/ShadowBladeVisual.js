import { paintSlimeSilhouette, renderSlimeFace } from '../SlimeRenderer.js'

export function shadowPose(combat) {
  const a = combat.assault, s = combat.swing, f = combat.flash
  if (a) return { angle: a.angle, sx: a.phase === 'travel' ? 1.32 : 0.88, sy: a.phase === 'travel' ? 0.72 : 1.05, offset: 0, alpha: a.phase === 'travel' ? 0.48 : 1 }
  if (s) {
    const strike = Math.max(0, Math.min(1, (s.elapsed - s.windup) / s.strike))
    return { angle: s.angle, sx: 0.93 + strike * 0.25, sy: 1.04 - strike * 0.17, offset: -0.04 + strike * 0.17, alpha: 1 }
  }
  if (f) return { angle: f.angle, sx: 1 + f.life / 0.13 * 0.12, sy: 1 - f.life / 0.13 * 0.08, offset: 0, alpha: 1 }
  return null
}

/** Attached fluid blade: broad root inside the body, dark core and thin rose cutting edge. */
function blade(ctx, x, y, angle, root, reach, width, alpha = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.globalAlpha *= alpha
  ctx.fillStyle = '#342031'; ctx.strokeStyle = '#f08b9d'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(root * 0.5, -width)
  ctx.bezierCurveTo(root + 12, -width, reach * 0.65, -width * 0.65, reach, 0)
  ctx.bezierCurveTo(reach * 0.58, width * 0.4, root + 6, width * 0.8, root * 0.5, width)
  ctx.quadraticCurveTo(root, 0, root * 0.5, -width); ctx.fill(); ctx.stroke()
  ctx.strokeStyle = '#ffe1e6'; ctx.lineWidth = 0.8
  ctx.beginPath(); ctx.moveTo(root + 8, -width * 0.65); ctx.quadraticCurveTo(reach * 0.7, -width * 0.4, reach, 0); ctx.stroke()
  ctx.restore()
}

export function renderShadowCombat(ctx, c) {
  const p = c.player, a = c.assault, s = c.swing, f = c.flash
  for (const clone of c.clones.items) {
    const fade = Math.min(1, clone.life / 0.4)
    ctx.save(); ctx.translate(clone.x, clone.y)
    ctx.globalAlpha = fade * (clone.birth > 0 ? 0.5 : 0.76)
    const stretch = clone.rush ? 1.12 : clone.attack ? 0.95 : 1
    ctx.scale(stretch, 1 / stretch)
    paintSlimeSilhouette(ctx, 'shadow', clone.radius, { fill: '#57415f', stroke: '#cba5d9', width: 1.3 })
    renderSlimeFace(ctx, 'shadow', clone.radius)
    ctx.restore()
    ctx.save(); ctx.globalAlpha = fade * 0.6; ctx.strokeStyle = '#cba5d9'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(clone.x - 12, clone.y + clone.radius + 7)
    ctx.lineTo(clone.x - 12 + 24 * clone.life / clone.maxLife, clone.y + clone.radius + 7); ctx.stroke(); ctx.restore()
    if (clone.attack || clone.rush || clone.flash > 0) {
      const reach = clone.rush ? 72 : clone.attack ? 35 + 65 * (1 - clone.attack.time / 0.15) : 100
      blade(ctx, clone.x, clone.y, clone.angle, clone.radius, reach, 7, fade * 0.8)
      if (clone.flash > 0 && clone.crossFlash) blade(ctx, clone.x, clone.y, clone.angle + Math.PI / 2, 0, 66, 7, fade * 0.65)
    }
  }
  if (c.clones.focus) {
    const focus = c.clones.focus
    ctx.save(); ctx.translate(focus.x, focus.y); ctx.globalAlpha = focus.life / 0.35 * 0.75
    ctx.strokeStyle = '#e6c3ed'; ctx.lineWidth = 1.5
    for (const sign of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(sign * 28, -12); ctx.lineTo(sign * 34, 0); ctx.lineTo(sign * 28, 12); ctx.stroke()
    }
    ctx.restore()
  }
  if (p.evasionFlash > 0) {
    for (const sign of [-1, 1]) {
      ctx.save(); ctx.translate(p.x + sign * 14, p.y - 3); ctx.globalAlpha = p.evasionFlash * 1.2
      paintSlimeSilhouette(ctx, 'shadow', p.radius, { fill: '#c6a6dc' }); ctx.restore()
    }
  }
  // The marker follows the same bounded path as F; it remains quiet outside a cast.
  if ((!a && p.strainSkillCd <= 0) || a?.phase === 'windup') {
    const angle = a?.angle ?? c.direction(), end = a?.end ?? c.destination(angle)
    ctx.save(); ctx.globalAlpha = a ? 0.8 : 0.27
    ctx.strokeStyle = '#ed9baa'; ctx.lineWidth = 1; ctx.setLineDash([3, 7])
    ctx.beginPath(); ctx.moveTo(p.x + Math.cos(angle) * (p.radius + 5), p.y + Math.sin(angle) * (p.radius + 5)); ctx.lineTo(end.x, end.y); ctx.stroke()
    ctx.setLineDash([]); ctx.translate(end.x, end.y); ctx.rotate(angle)
    ctx.beginPath(); ctx.moveTo(-7, -7); ctx.lineTo(0, 0); ctx.lineTo(-7, 7); ctx.stroke()
    ctx.beginPath(); ctx.ellipse(0, 0, p.radius, p.radius * 0.7, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore()
  }
  for (const e of c.echoes) {
    ctx.save(); ctx.translate(e.x, e.y); ctx.globalAlpha = e.life / 0.18 * 0.22
    paintSlimeSilhouette(ctx, 'shadow', p.radius, { fill: '#b15f7b' }); ctx.restore()
  }
  if (s) {
    const k = s.elapsed < s.windup ? 0.12 + s.elapsed / s.windup * 0.16 : 0.28 + (s.elapsed - s.windup) / s.strike * 0.72
    blade(ctx, p.x, p.y, s.angle, p.radius, p.radius + (s.reach - p.radius) * k, 9)
  } else if (f) {
    blade(ctx, f.x, f.y, f.angle, p.radius, p.radius + (f.reach - p.radius) * f.life / 0.13, 9, f.life / 0.13)
  }
  if (a) blade(ctx, p.x, p.y, a.angle, p.radius, p.radius + (a.phase === 'travel' ? 42 : 16), 11)
  for (const cut of c.cleaves) {
    ctx.save(); ctx.translate(cut.x, cut.y); ctx.rotate(cut.angle); ctx.globalAlpha = cut.life / 0.2
    ctx.fillStyle = 'rgba(113, 49, 80, 0.28)'; ctx.strokeStyle = '#ed9bae'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(-cut.reach, 0)
    ctx.quadraticCurveTo(0, -cut.width, cut.reach, 0)
    ctx.quadraticCurveTo(0, cut.width, -cut.reach, 0); ctx.fill(); ctx.stroke()
    ctx.strokeStyle = '#ffe4ec'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(-cut.reach * 0.9, 0); ctx.lineTo(cut.reach * 0.9, 0); ctx.stroke()
    ctx.restore()
  }
  for (const i of c.impacts) {
    ctx.save(); ctx.translate(i.x, i.y); ctx.rotate(i.angle); ctx.globalAlpha = i.life / 0.18
    ctx.strokeStyle = i.crit ? '#ffe8be' : '#ffd8e3'; ctx.lineWidth = i.crit ? 2 : 1.4
    const size = i.clone ? 24 : i.crit ? 15 : 10
    ctx.beginPath(); ctx.moveTo(-size, -size * 0.65); ctx.lineTo(size, size * 0.65)
    ctx.moveTo(-size * 0.6, size * 0.7); ctx.lineTo(size * 0.6, -size * 0.7); ctx.stroke()
    if (i.clone) {
      ctx.globalAlpha *= 0.22
      ctx.translate(-25, -18); paintSlimeSilhouette(ctx, 'shadow', p.radius * 0.75, { fill: '#dd91af' })
      ctx.translate(50, 36); paintSlimeSilhouette(ctx, 'shadow', p.radius * 0.75, { fill: '#dd91af' })
    }
    ctx.restore()
  }
}
