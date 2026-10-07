const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export function getTowerDefenseLayout(width = 1280, height = 720) {
  const left = clamp(width * 0.035, 18, 54)
  const top = height > width && width <= 620 ? 164 : clamp(height * 0.11, 58, 92)
  const bottom = clamp(height * 0.055, 24, 48)
  const boardWidth = Math.max(1, width - left * 2)
  const boardHeight = Math.max(1, height - top - bottom)
  return {
    width, height, left, top, boardWidth, boardHeight, portrait: height > width,
    unit: Math.min(clamp(Math.min(boardWidth, boardHeight) * 0.064, 28, 56), Math.min(boardWidth, boardHeight) * 0.075),
  }
}

// Rotate the projection in portrait so the long road runs down the long screen.
// Logical coordinates, ranges and slot IDs are identical in both orientations.
export function projectTowerDefensePoint(point, layout) {
  return {
    x: layout.left + (layout.portrait ? 1 - point.y : point.x) * layout.boardWidth,
    y: layout.top + (layout.portrait ? point.x : point.y) * layout.boardHeight,
  }
}

export function unprojectTowerDefensePoint(x, y, layout) {
  const u = (x - layout.left) / layout.boardWidth, v = (y - layout.top) / layout.boardHeight
  return layout.portrait ? { x: v, y: 1 - u } : { x: u, y: v }
}

export function distanceToTowerDefensePath(point, path) {
  let best = Infinity
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i]
    const dx = b.x - a.x, dy = b.y - a.y
    const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1)
    best = Math.min(best, Math.hypot(point.x - a.x - dx * t, point.y - a.y - dy * t))
  }
  return best
}

// Responsive presentation may shrink the artwork, never move a combat anchor.
// Keep touch targets independent of this visual unit (the renderer uses >= 34px).
export function fitTowerDefensePresentation(layout, slots, path, traps = []) {
  const { boardWidth: w, boardHeight: h } = layout
  const project = p => projectTowerDefensePoint(p, { ...layout, left: 0, top: 0 })
  const points = slots.map(project), road = path.map(project)
  let unit = layout.unit
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    unit = Math.min(unit, distanceToTowerDefensePath(p, road) / 2.21,
      Math.min(p.x, w - p.x, p.y, h - p.y) / .95)
    for (let j = 0; j < i; j++) unit = Math.min(unit, Math.hypot(p.x - points[j].x, p.y - points[j].y) / 2.5)
    for (const trap of traps) {
      const t = project(trap.pos)
      unit = Math.min(unit, Math.hypot(p.x - t.x, p.y - t.y) / 2.25)
    }
  }
  return { ...layout, unit }
}

/** All slots, including sealed ones, reserve their full platform outside the road.
 * Fit once in the canonical reference layout, independent of the player's viewport.
 * Keep slot order/metadata intact: towers and unlock state are keyed by index.
 */
export function fitTowerDefenseSlots(slots, path, traps = [], layout = getTowerDefenseLayout()) {
  const { boardWidth: w, boardHeight: h, unit: u } = layout
  const project = p => ({ x: p.x * w, y: p.y * h })
  const pixelPath = path.map(project)
  const trapPoints = traps.map(t => project(t.pos))
  const margin = u * 0.95
  // Widest road half-width + platform/selection halo + a visible grass gap.
  const clearance = u * (1.15 + 0.9 + 0.16)
  const spacing = u * 2.5
  const placed = []
  let candidates
  const validGround = p => p.x >= margin && p.x <= w - margin && p.y >= margin && p.y <= h - margin
    && distanceToTowerDefensePath(p, pixelPath) >= clearance
    && trapPoints.every(t => Math.hypot(p.x - t.x, p.y - t.y) >= u * 2.25)
  const free = p => placed.every(t => Math.hypot(p.x - t.x, p.y - t.y) >= spacing)

  return slots.map(slot => {
    const desired = project(slot)
    let point = desired
    if (!validGround(point) || !free(point)) {
      if (!candidates) {
        candidates = []
        const step = u * 0.2
        for (let y = margin; y <= h - margin; y += step) {
          for (let x = margin; x <= w - margin; x += step) {
            const p = { x, y }
            if (validGround(p)) candidates.push(p)
          }
        }
      }
      let best = Infinity
      point = null
      for (const p of candidates) {
        const distance = (p.x - desired.x) ** 2 + (p.y - desired.y) ** 2
        if (distance < best && free(p)) {
          best = distance
          point = p
        }
      }
      if (!point) throw new Error('Tower defense board has no safe build position')
    }
    placed.push(point)
    return { ...slot, x: point.x / w, y: point.y / h }
  })
}
