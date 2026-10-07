const TAU = Math.PI * 2
const clamp01 = value => Math.max(0, Math.min(1, value))
const ease = value => 1 - (1 - value) ** 3

/** 身体与口器读取同一攻击时钟；只返回形变，不改移动、碰撞或冲刺朝向。 */
export function bitePose(swing, flash) {
  const attack = swing || flash
  if (!attack) return null
  const heavy = attack.heavy
  let compression = 0, extension = 0, mouth = 0
  if (swing?.phase === 'windup') {
    compression = ease(clamp01(1 - swing.remaining / swing.windup))
    mouth = 0.2 + compression * 0.8
  } else if (swing) {
    const progress = ease(clamp01(1 - swing.remaining / swing.strike))
    compression = 1 - progress
    extension = progress
    mouth = 1 - progress * 0.9
  } else {
    extension = clamp01(flash.life / flash.maxLife) ** 2
    mouth = 0.1
  }
  return {
    angle: attack.angle, heavy, mouth, recovering: !swing,
    sx: 1 - compression * 0.2 + extension * (heavy ? 0.38 : 0.24),
    sy: 1 + compression * 0.14 - extension * (heavy ? 0.2 : 0.13),
    offset: -compression * 0.12 + extension * (heavy ? 0.6 : 0.34),
  }
}

export function renderBiteMotion(ctx, player, swing, flash) {
  const attack = swing || flash
  if (!attack) return
  const preparing = swing?.phase === 'windup'
  const striking = swing?.phase === 'strike'
  const progress = preparing ? clamp01(1 - swing.remaining / swing.windup)
    : striking ? ease(clamp01(1 - swing.remaining / swing.strike)) : 1
  const fade = swing ? 1 : clamp01(flash.life / flash.maxLife)
  const r = player.radius
  const pose = bitePose(swing, flash)
  const reach = attack.reach
  const half = attack.arc / 2
  ctx.save()
  ctx.translate(swing ? player.x : flash.x, swing ? player.y : flash.y)
  ctx.rotate(attack.angle)

  // 轻薄地面覆盖只交代判定边界；没有圆环描边或向外扩散的波纹。
  ctx.fillStyle = attack.heavy ? '#efce79' : '#c2eb83'
  ctx.globalAlpha = (preparing ? 0.045 + progress * 0.025 : 0.085) * fade
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.arc(0, 0, reach + 1, -half, half)
  ctx.closePath()
  ctx.fill()
  // 两侧短边提示始终使用实际角度、射程，包含大型敌人擦边接触的位置。
  ctx.strokeStyle = attack.heavy ? '#f5dfa4' : '#d6efb0'
  ctx.lineWidth = 1.2
  ctx.globalAlpha = (preparing ? 0.28 : 0.2) * fade
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(Math.cos(half) * reach * 0.7, side * Math.sin(half) * reach * 0.7)
    ctx.lineTo(Math.cos(half) * reach, side * Math.sin(half) * reach)
    ctx.stroke()
  }

  // 口器从身体伸出，上下颌沿前向闭合；无绕角色旋转的挥刀弧线。
  const retract = clamp01(1 - (1 - fade) * 3.4)
  const length = preparing ? r * (0.92 + progress * 0.25)
    : striking ? r * 1.17 + (reach - r * 1.17) * progress : r * 1.05 + (reach - r * 1.05) * retract ** 2
  const gape = preparing ? r * (0.12 + progress * 0.28) : (1 - progress) * r * 0.4 + 1.5
  const spread = preparing ? gape : Math.sin(half) * reach * (1 - progress) * 0.85 + 5
  // The portrait stays upright: project its actual mouth into attack space.
  // This keeps the jaw attached to the face even for upward/diagonal bites.
  const cos = Math.cos(attack.angle), sin = Math.sin(attack.angle)
  const horizontal = cos * cos
  const scaleX = pose.sx * horizontal + pose.sy * (1 - horizontal)
  const scaleY = pose.sy * horizontal + pose.sx * (1 - horizontal)
  const mouthX = r * (-0.06 + cos * 0.08) * scaleX
  const mouthY = r * (0.3 + sin * 0.05) * scaleY
  const rootX = r * pose.offset + cos * mouthX + sin * mouthY
  const centerY = -sin * mouthX + cos * mouthY
  const rootY = r * (0.04 + pose.mouth * 0.16)
  ctx.globalAlpha = (preparing ? 0.55 + progress * 0.25 : 0.9) * fade
  ctx.lineCap = 'round'
  ctx.fillStyle = '#193d22'
  ctx.beginPath()
  ctx.moveTo(rootX, centerY - rootY)
  ctx.bezierCurveTo(length * 0.5, -spread, length * 0.84, -spread, length, -gape)
  ctx.lineTo(length, gape)
  ctx.bezierCurveTo(length * 0.84, spread, length * 0.5, spread, rootX, centerY + rootY)
  ctx.closePath()
  ctx.fill()
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(rootX, centerY + side * rootY)
    ctx.bezierCurveTo(length * 0.5, side * spread, length * 0.84, side * spread, length, side * gape)
    ctx.strokeStyle = '#365f26'
    ctx.lineWidth = attack.heavy ? 8 : 6
    ctx.stroke()
    ctx.strokeStyle = attack.heavy ? '#f1dea0' : '#c9ef9c'
    ctx.lineWidth = attack.heavy ? 4.5 : 3
    ctx.stroke()
    ctx.fillStyle = '#f6ffdd'
    for (let i = 0; i < 3; i++) {
      const t = 0.42 + i * 0.19, u = 1 - t
      const x = u ** 3 * rootX + 3 * u * u * t * length * 0.5 + 3 * u * t * t * length * 0.84 + t ** 3 * length
      const y = u ** 3 * centerY + side * (u ** 3 * rootY + 3 * u * t * spread + t ** 3 * gape)
      ctx.beginPath()
      ctx.moveTo(x - 3, y)
      ctx.lineTo(x + 4, y)
      ctx.lineTo(x + 3, y - side * Math.min(attack.heavy ? 8 : 6, Math.abs(y) * 0.9))
      ctx.closePath()
      ctx.fill()
    }
  }
  if (attack.heavy && !preparing) {
    // 重咬的扑食拖痕朝前，角色逻辑位置仍由玩家控制。
    ctx.globalAlpha = 0.45 * fade
    ctx.strokeStyle = '#d6efaa'
    ctx.lineWidth = 2
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(-r * 0.7, side * r * 0.65)
      ctx.lineTo(r * 0.4 + progress * r, side * r * 0.45)
      ctx.stroke()
    }
  }
  ctx.restore()
}

export function renderBiteFeedback(ctx, combat) {
  const p = combat.player
  ctx.save()
  if (p.gluttonGuard > 0 && p.gluttonGuardTimer > 0) {
    ctx.strokeStyle = '#d1efa0'
    ctx.lineWidth = 2
    ctx.globalAlpha = Math.min(0.55, p.gluttonGuardTimer * 2)
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.radius + 3 + combat.guardPulse * 9, 0, TAU)
    ctx.stroke()
  }
  for (const hit of combat.impacts) {
    const fade = clamp01(hit.life / hit.maxLife), age = 1 - fade
    ctx.save()
    ctx.translate(hit.x, hit.y)
    ctx.rotate(hit.angle)
    ctx.globalAlpha = fade
    ctx.fillStyle = hit.heavy ? '#fff1bd' : '#f5ffde'
    const size = (hit.heavy ? 12 : 8) * (0.65 + fade * 0.35)
    ctx.beginPath()
    ctx.moveTo(-size, 0)
    ctx.lineTo(-2, -2)
    ctx.lineTo(0, -size * 0.7)
    ctx.lineTo(3, -2)
    ctx.lineTo(size, 0)
    ctx.lineTo(2, 2)
    ctx.lineTo(0, size * 0.7)
    ctx.lineTo(-3, 2)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = hit.devoured ? '#d6f885' : '#9bd66b'
    for (let i = 0; i < (hit.heavy ? 7 : 4); i++) {
      const angle = (i - (hit.heavy ? 3 : 1.5)) * 0.65
      const distance = 4 + age * (12 + i * 2)
      ctx.beginPath()
      ctx.ellipse(Math.cos(angle) * distance, Math.sin(angle) * distance,
        (2.5 - age) * (hit.heavy ? 1.2 : 1), 1.5, angle, 0, TAU)
      ctx.fill()
    }
    ctx.restore()
  }
  for (const morsel of combat.morsels) {
    const progress = 1 - clamp01(morsel.life / morsel.maxLife)
    const mouthX = p.x + Math.cos(morsel.angle) * p.radius * 0.75
    const mouthY = p.y + Math.sin(morsel.angle) * p.radius * 0.75
    ctx.fillStyle = '#d3f78f'
    for (let i = 0; i < 5; i++) {
      const k = clamp01((progress - i * 0.05) / 0.8)
      const pull = k * k
      const bend = Math.sin(k * Math.PI) * (i - 2) * 4
      ctx.globalAlpha = (1 - k) * 0.9
      ctx.beginPath()
      ctx.ellipse(morsel.x + (mouthX - morsel.x) * pull - Math.sin(morsel.angle) * bend,
        morsel.y + (mouthY - morsel.y) * pull + Math.cos(morsel.angle) * bend,
        3.2 - k * 2, 1.8 - k, morsel.angle, 0, TAU)
      ctx.fill()
    }
  }
  ctx.restore()
}
