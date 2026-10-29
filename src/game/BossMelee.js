// One descriptor drives both the warning footprint and the damage test.
export function bossMeleeShape(mechanic, phase, chain = 0) {
  if (mechanic === 'border-pincer') return chain % 2
    ? { kind: 'sector', reach: 215, spread: 0.28, name: '长枪突刺' }
    : { kind: 'sector', reach: 170, spread: 0.88, name: '盾缘横扫' }
  if (mechanic === 'shield-wall') return { kind: 'sector', reach: 200, spread: 1.05, name: '重盾猛击' }
  if (mechanic === 'ash-cross') return { kind: 'cross', reach: 210, width: 42, name: '灰烬重砸' }
  if (mechanic === 'throne-edict') return { kind: 'sector', reach: 240, spread: Math.PI * 0.72, name: '王命横斩' }
  return null
}

export function bossMeleeContains(shape, x, y, angle, px, py) {
  const dx = px - x, dy = py - y
  const forward = dx * Math.cos(angle) + dy * Math.sin(angle)
  const side = -dx * Math.sin(angle) + dy * Math.cos(angle)
  if (Math.hypot(dx, dy) >= shape.reach) return false
  if (shape.kind === 'cross') return Math.abs(forward) < shape.width || Math.abs(side) < shape.width
  return Math.abs(Math.atan2(side, forward)) < shape.spread
}

export function bossMeleePath(ctx, shape) {
  ctx.beginPath()
  if (shape.kind === 'cross') {
    // Intersection of the two bars and the circular reach, so no damaging
    // corners can appear beyond the actual weapon reach.
    const w = shape.width, end = Math.sqrt(shape.reach ** 2 - w ** 2)
    const a = Math.asin(w / shape.reach)
    ctx.moveTo(end, -w)
    for (let i = 0; i < 4; i++) {
      ctx.arc(0, 0, shape.reach, i * Math.PI / 2 - a, i * Math.PI / 2 + a)
      const turn = (i + 1) * Math.PI / 2
      const corner = i * Math.PI / 2 + Math.PI / 4
      ctx.lineTo(Math.cos(corner) * w * Math.SQRT2, Math.sin(corner) * w * Math.SQRT2)
      ctx.lineTo(Math.cos(turn - a) * shape.reach, Math.sin(turn - a) * shape.reach)
    }
  } else {
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, shape.reach, -shape.spread, shape.spread)
  }
  ctx.closePath()
}

export function drawBossMelee(ctx, cast, progress, accent, release = false) {
  const { shape } = cast
  ctx.save()
  ctx.translate(cast.x, cast.y)
  ctx.rotate(cast.angle)
  bossMeleePath(ctx, shape)
  ctx.fillStyle = release ? 'rgba(245,211,147,0.18)' : 'rgba(212,78,48,0.17)'
  ctx.strokeStyle = accent
  ctx.lineWidth = release ? 2 : 1.8
  ctx.fill(); ctx.stroke()
  ctx.clip()
  if (release) {
    ctx.globalAlpha = 1 - progress
    // A weapon-shaped ribbon travels across the warned area, without an orb
    // or projectile travelling beyond it.
    ctx.lineWidth = 11 * (1 - progress) + 2
    ctx.strokeStyle = accent
    ctx.beginPath()
    if (shape.kind === 'cross') {
      const d = shape.reach * progress
      ctx.moveTo(-d, 0); ctx.lineTo(d, 0); ctx.moveTo(0, -d); ctx.lineTo(0, d)
    } else {
      const angle = -shape.spread + progress * shape.spread * 2
      ctx.arc(0, 0, shape.reach * 0.78, angle - 0.32, angle + 0.12)
    }
    ctx.stroke()
    ctx.lineWidth = 2; ctx.strokeStyle = '#fff1cc'; ctx.stroke()
  } else {
    ctx.lineWidth = 3; ctx.strokeStyle = accent
    ctx.beginPath()
    const reach = shape.reach * progress
    if (shape.kind === 'cross') {
      ctx.moveTo(-reach, 0); ctx.lineTo(reach, 0); ctx.moveTo(0, -reach); ctx.lineTo(0, reach)
    } else ctx.arc(0, 0, reach, -shape.spread, shape.spread)
    ctx.stroke()
  }
  ctx.restore()
}
