const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

// Anchor coordinates are normalized to the game surface, not the browser window.
export function getBuildMenuPosition(anchor, viewport, panel) {
  const margin = 12
  const topInset = Math.min(112, viewport.height * 0.2)
  const width = Math.min(panel.width, viewport.width - margin * 2)
  let maxHeight = Math.max(0, viewport.height - topInset - margin)
  let height = Math.min(panel.height, maxHeight)
  const x = (anchor?.x ?? 0.5) * viewport.width
  const y = (anchor?.y ?? 0.5) * viewport.height
  const gapX = (anchor?.radiusX ?? 0.04) * viewport.width + 12
  const gapY = (anchor?.radiusY ?? 0.05) * viewport.height + 12
  let left, top, side
  if (viewport.width >= 620 && x + gapX + width <= viewport.width - margin) {
    left = x + gapX
    top = y - height / 2
    side = 'right'
  } else if (viewport.width >= 620 && x - gapX - width >= margin) {
    left = x - gapX - width
    top = y - height / 2
    side = 'left'
  } else {
    left = x - width / 2
    const roomBelow = viewport.height - margin - y - gapY
    const roomAbove = y - gapY - topInset
    if (roomBelow >= height || roomBelow >= roomAbove) {
      maxHeight = Math.max(0, roomBelow)
      height = Math.min(height, maxHeight)
      top = y + gapY
      side = 'below'
    } else {
      maxHeight = Math.max(0, roomAbove)
      height = Math.min(height, maxHeight)
      top = y - gapY - height
      side = 'above'
    }
  }
  left = clamp(left, margin, viewport.width - margin - width)
  top = clamp(top, topInset, viewport.height - margin - height)
  return {
    left, top, side,
    arrowX: clamp(x - left, 20, width - 20),
    arrowY: clamp(y - top, 20, height - 20),
    maxHeight,
  }
}
