import { paintSlimeFamilySilhouette, renderSlimeFamilyFace } from '../SlimeFamilyArtRenderer.js'

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
    paintSlimeFamilySilhouette(ctx, 'shadow', clone.radius, { fill: '#57415f', stroke: '#cba5d9', width: 1.3 })
    renderSlimeFamilyFace(ctx, 'shadow', clone.radius, { expr: 'idle' })
    ctx.restore()
    ctx.save(); ctx.globalAlpha = fade * 0.6; ctx.strokeStyle = '#cba5d9'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(clone.x - 12, clone.y + clone.radius + 7)
    ctx.lineTo(clone.x - 12 + 24 * clone.life / clone.maxLife, clone.y + clone.radius + 7); ctx.stroke()
    for (let bi = 0; bi < (clone.freeBlocks || 0); bi++) {
      ctx.fillStyle = '#93f2ff'
      ctx.beginPath(); ctx.arc(clone.x - 8 + bi * 5, clone.y - clone.radius - 5, 1.9, 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()
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
      paintSlimeFamilySilhouette(ctx, 'shadow', p.radius, { fill: '#c6a6dc' }); ctx.restore()
    }
  }
  const shield = c.shield
  if (shield && (shield.charges > 0 || shield.flash > 0)) {
    const r = p.radius + 9 + Math.sin(c.time * 5) * 1.2
    ctx.save()
    ctx.strokeStyle = shield.flash > 0 ? '#93f2ff' : '#a78bfa'
    ctx.lineWidth = shield.flash > 0 ? 2.4 : 1.7
    ctx.globalAlpha = shield.flash > 0 ? Math.min(0.9, 0.35 + shield.flash * 1.6) : 0.42
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke()
    for (let i = 0; i < shield.charges; i++) {
      const a = c.time * 2.2 + (i * Math.PI * 2) / Math.max(1, shield.charges)
      const px = p.x + Math.cos(a) * (r + 3), py = p.y + Math.sin(a) * (r + 3)
      ctx.fillStyle = '#c4b5fd'; ctx.globalAlpha = 0.9
      ctx.beginPath(); ctx.moveTo(px, py - 3.2); ctx.lineTo(px + 2.8, py); ctx.lineTo(px, py + 3.2); ctx.lineTo(px - 2.8, py); ctx.closePath(); ctx.fill()
    }
    ctx.restore()
  }
  if ((c.guardCharges || 0) > 0 || (c.guardFlash || 0) > 0) {
    const gr = p.radius + 6.5
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.facing || 0)
    ctx.strokeStyle = (c.guardFlash || 0) > 0 ? '#f8fafc' : '#cbd5e1'
    ctx.lineWidth = (c.guardFlash || 0) > 0 ? 2.6 : 1.9
    ctx.globalAlpha = (c.guardFlash || 0) > 0 ? Math.min(0.95, 0.4 + c.guardFlash * 1.5) : 0.62
    ctx.beginPath(); ctx.arc(0, 0, gr, -0.78, 0.78); ctx.stroke()
    ctx.restore()
  }
  if (p.shadowSpellCounterTimer > 0 || p.shadowEvadeCritTimer > 0 || p.shadowAssaultBuffTimer > 0) {
    ctx.save()
    ctx.strokeStyle = p.shadowSpellCounterTimer > 0 ? '#78e8ff' : p.shadowAssaultBuffTimer > 0 ? '#d8b4fe' : '#e0b8ff'
    ctx.lineWidth = p.shadowAssaultBuffTimer > 0 ? 1.9 : 1.6; ctx.globalAlpha = 0.55
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.arc(p.x, p.y, p.radius + 5, 0, Math.PI * 2); ctx.stroke()
    ctx.restore()
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
    paintSlimeFamilySilhouette(ctx, 'shadow', p.radius, { fill: '#b15f7b' }); ctx.restore()
  }
  for (const domain of c.domains) {
    const radius = 92 + Math.min(60, c.bladeArcLevel * 6)
    const lifeAlpha = Math.min(1, domain.life / 0.3)
    const pulse = 1 - Math.max(0, Math.min(1, domain.timer / 0.42))
    ctx.save(); ctx.translate(domain.x, domain.y); ctx.globalAlpha = lifeAlpha * 0.58
    ctx.strokeStyle = '#e78da7'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 7])
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
    ctx.globalAlpha = lifeAlpha * (0.18 + pulse * 0.26); ctx.strokeStyle = '#ffd9e5'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(0, 0, radius * (0.45 + pulse * 0.55), 0, Math.PI * 2); ctx.stroke()
    ctx.rotate(domain.angle)
    for (const sign of [-1, 1]) {
      ctx.save(); ctx.rotate(sign * Math.PI / 4); blade(ctx, 0, 0, 0, radius * 0.35, radius * 0.78, 5, lifeAlpha * 0.42); ctx.restore()
    }
    ctx.restore()
  }
  if (s) {
    const k = s.elapsed < s.windup ? 0.12 + s.elapsed / s.windup * 0.16 : 0.28 + (s.elapsed - s.windup) / s.strike * 0.72
    blade(ctx, p.x, p.y, s.angle, p.radius, p.radius + (s.reach - p.radius) * k, 9)
  } else if (f) {
    blade(ctx, f.x, f.y, f.angle, p.radius, p.radius + (f.reach - p.radius) * f.life / 0.13, 9, f.life / 0.13)
  }
  if (a) blade(ctx, p.x, p.y, a.angle, p.radius, p.radius + (a.phase === 'travel' ? 42 : 16), 11)
  for (const wave of (c.waves || [])) {
    const t = 1 - Math.max(0, Math.min(1, wave.life / 0.22))
    ctx.save(); ctx.translate(wave.x, wave.y); ctx.rotate(wave.angle); ctx.globalAlpha = (1 - t) * 0.85
    const rx = wave.reach * (0.35 + t * 0.65)
    ctx.strokeStyle = '#d8b4fe'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(rx - 18, 0, wave.width * 1.15, -Math.PI * 0.42, Math.PI * 0.42); ctx.stroke()
    ctx.strokeStyle = '#ffe4ec'; ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.arc(rx - 14, 0, wave.width * 0.9, -Math.PI * 0.36, Math.PI * 0.36); ctx.stroke()
    ctx.restore()
  }
  for (const cut of c.cleaves) {
    const k = Math.max(0, Math.min(1, cut.life / (cut.nova ? 0.26 : cut.hunt ? 0.22 : 0.2)))
    ctx.save(); ctx.translate(cut.x, cut.y); ctx.globalAlpha = k
    if (cut.nova) {
      const r = cut.reach * (0.45 + (1 - k) * 0.55)
      ctx.strokeStyle = '#e879f9'; ctx.lineWidth = 3.2 * k + 1
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = '#fdf4ff'; ctx.lineWidth = 1.4
      ctx.beginPath(); ctx.arc(0, 0, r * 0.78, -Math.PI * 0.65, Math.PI * 0.65); ctx.stroke()
      ctx.restore()
      continue
    }
    ctx.rotate(cut.angle)
    ctx.fillStyle = cut.hunt ? 'rgba(56, 189, 248, 0.28)' : cut.swarm ? 'rgba(167, 139, 250, 0.28)' : cut.echo ? 'rgba(168, 85, 247, 0.26)' : 'rgba(113, 49, 80, 0.28)'
    ctx.strokeStyle = cut.hunt ? '#84d6e8' : cut.swarm ? '#c39be6' : cut.echo ? '#d8b4fe' : cut.riposte ? '#fda4af' : '#ed9bae'
    ctx.lineWidth = 1.5
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
      ctx.translate(-25, -18); paintSlimeFamilySilhouette(ctx, 'shadow', p.radius * 0.75, { fill: '#dd91af' })
      ctx.translate(50, 36); paintSlimeFamilySilhouette(ctx, 'shadow', p.radius * 0.75, { fill: '#dd91af' })
    }
    ctx.restore()
  }
}
