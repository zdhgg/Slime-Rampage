const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

/** Mark a visible objective in place, or point toward it beside the player. */
export function drawObjectiveMarker(ctx, game, cameraX, cameraY, objective) {
  const { width, height, player } = game
  const dx = objective.x - player.x
  const dy = objective.y - player.y
  if (dx * dx + dy * dy <= objective.radius ** 2) return
  const targetX = objective.x - cameraX
  const targetY = objective.y - cameraY
  const visible = targetX >= 44 && targetX <= width - 44 && targetY >= 76 && targetY <= height - 30
  const angle = Math.atan2(dy, dx)
  const x = visible ? targetX : clamp(player.x - cameraX + Math.cos(angle) * 82, 44, width - 44)
  const y = visible ? targetY - 58 : clamp(player.y - cameraY + Math.sin(angle) * 82, 28, height - 28)

  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = '#18332d'
  ctx.strokeStyle = objective.color
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(-38, -13, 76, 26, 7)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#f2faff'
  ctx.font = '700 12px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(objective.label, 8, 0)

  ctx.translate(-23, 0)
  ctx.rotate(visible ? Math.PI / 2 : angle)
  ctx.fillStyle = objective.color
  ctx.beginPath()
  ctx.moveTo(7, 0)
  ctx.lineTo(-5, -5)
  ctx.lineTo(-3, 0)
  ctx.lineTo(-5, 5)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}
