export const shadowTargetAlive = e => e?.active && !e.devouring && !e._settled && e.hp > 0

/** First contact along a swept circle; Infinity means the segment misses. */
export function shadowCircleEntry(ax, ay, bx, by, target, radius = 0) {
  const dx = bx - ax, dy = by - ay, ox = ax - target.x, oy = ay - target.y
  const r = radius + target.radius, c = ox * ox + oy * oy - r * r
  if (c <= 0) return 0
  const a = dx * dx + dy * dy, b = ox * dx + oy * dy
  const discriminant = b * b - a * c
  if (!a || discriminant < 0) return Infinity
  const t = (-b - Math.sqrt(discriminant)) / a
  return t >= 0 && t <= 1 ? t : Infinity
}

export function inShadowPath(enemy, ax, ay, bx, by, width) {
  if (!shadowTargetAlive(enemy)) return false
  const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy
  const t = length2 ? Math.max(0, Math.min(1, ((enemy.x - ax) * dx + (enemy.y - ay) * dy) / length2)) : 0
  return (enemy.x - ax - dx * t) ** 2 + (enemy.y - ay - dy * t) ** 2 <= (width + (enemy.radius || 0)) ** 2
}

/** Shared non-destructive movement probe: no wall slides or teleporting across barricades. */
export function traceShadowPath(game, origin, angle, distance, radius = origin.radius || 0) {
  const probe = { x: origin.x, y: origin.y, radius }
  const dx = Math.cos(angle), dy = Math.sin(angle)
  for (let moved = 0; moved < distance;) {
    const step = Math.min(6, distance - moved), x = probe.x, y = probe.y
    const tx = dx > 0 ? (game.worldWidth - radius - x) / dx : dx < 0 ? (radius - x) / dx : Infinity
    const ty = dy > 0 ? (game.worldHeight - radius - y) / dy : dy < 0 ? (radius - y) / dy : Infinity
    const allowed = Math.max(0, Math.min(step, tx, ty))
    probe.x += dx * allowed; probe.y += dy * allowed
    if (game.mapFeatures?.resolvePlayerMovement(probe, x, y, false)) break
    moved += step
    if (allowed < step - 0.001) break
  }
  return { x: probe.x, y: probe.y }
}

export function shadowLineClear(game, from, to) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  const end = traceShadowPath(game, from, Math.atan2(to.y - from.y, to.x - from.x), distance, 0)
  return Math.hypot(end.x - to.x, end.y - to.y) < 0.5
}
