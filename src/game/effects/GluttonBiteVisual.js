const TAU = Math.PI * 2
const clamp01 = value => Math.max(0, Math.min(1, value))
const ease = value => 1 - (1 - value) ** 3

/**
 * 身体与口器读取同一攻击时钟；只返回形变，不改移动、碰撞或冲刺朝向。
 * 阶段：aim（转头预告）→ windup（张嘴蓄力）→ strike（咬合）→ flash（收势）。
 */
export function bitePose(swing, flash) {
  const attack = swing || flash
  if (!attack) return null
  const heavy = !!attack.heavy
  let compression = 0, extension = 0, mouth = 0
  let aiming = false, windupProgress = 0, strikeProgress = 0
  if (swing?.phase === 'aim') {
    aiming = true
    const p = clamp01(1 - swing.remaining / Math.max(0.0001, swing.aimDuration || 0.0001))
    // 转头时只轻轻下沉，真正的蓄力留给 windup，避免把「看方向」误读成「已出手」。
    compression = ease(p) * (heavy ? 0.15 : 0.08)
    mouth = p * (heavy ? 0.86 : 0.58)
    windupProgress = p * 0.3
  } else if (swing?.phase === 'windup') {
    const p = clamp01(1 - swing.remaining / swing.windup)
    windupProgress = p
    compression = ease(p) * (heavy ? 0.28 : 0.17)
    mouth = 0.22 + ease(p) * (heavy ? 0.78 : 0.72)
  } else if (swing) {
    const p = ease(clamp01(1 - swing.remaining / swing.strike))
    strikeProgress = p
    compression = (heavy ? 0.28 : 0.17) * (1 - p)
    extension = p
    mouth = Math.max(0, 1 - p * 0.94)
  } else {
    const p = clamp01(flash.life / flash.maxLife)
    extension = p * p * 0.6
    mouth = 0
  }
  return {
    angle: attack.angle, heavy, mouth, recovering: !swing, aiming, windupProgress, strikeProgress,
    sx: 1 - compression + extension * (heavy ? 0.52 : 0.34),
    sy: 1 + compression * 0.62 - extension * (heavy ? 0.24 : 0.16),
    offset: -compression * 0.9 + extension * (heavy ? 0.85 : 0.55),
  }
}

/** 把口器根部投影到「攻击方向为 +X」的局部坐标，保证上下左右与斜向都贴住脸。 */
function mouthRoot(player, attack, pose) {
  const r = player.radius
  const cos = Math.cos(attack.angle), sin = Math.sin(attack.angle)
  const faceX = r * -0.06 * pose.sx
  const faceY = r * 0.19 * pose.sy
  return {
    x: r * pose.offset + faceX * cos + faceY * sin,
    y: -faceX * sin + faceY * cos,
    half: r * (0.05 + pose.mouth * 0.15),
  }
}

/** 方向与真实扇形共用同一个 angle/reach/arc；命中结算也读这份状态。 */
export function renderBiteMotion(ctx, player, swing, flash) {
  const attack = swing || flash
  if (!attack) return
  const aiming = swing?.phase === 'aim'
  const preparing = swing?.phase === 'windup'
  const striking = swing?.phase === 'strike'
  const recovering = !swing
  const aimProgress = aiming ? clamp01(1 - swing.remaining / Math.max(0.0001, swing.aimDuration || 0.0001)) : 0
  const prepareProgress = preparing ? clamp01(1 - swing.remaining / swing.windup) : 0
  const strikeProgress = striking ? ease(clamp01(1 - swing.remaining / swing.strike)) : 0
  const fade = swing ? 1 : clamp01(flash.life / flash.maxLife)
  const pose = bitePose(swing, flash)
  const heavy = !!attack.heavy
  const reach = attack.reach
  const half = attack.arc / 2
  const r = player.radius
  const root = mouthRoot(player, attack, pose)

  ctx.save()
  ctx.translate(swing ? player.x : flash.x, swing ? player.y : flash.y)
  ctx.rotate(attack.angle)

  // —— 1. 方向预告：轻量、低透明度、不遮挡敌人攻击预警 ——
  if (aiming) {
    ctx.globalAlpha = 0.13 + aimProgress * 0.08
    ctx.strokeStyle = heavy ? '#f2dc95' : '#cfee9f'
    ctx.lineWidth = 1.3
    ctx.setLineDash([5, 7])
    ctx.beginPath()
    ctx.moveTo(r * 0.45, 0)
    ctx.lineTo(reach * 0.8, 0)
    ctx.stroke()
    ctx.setLineDash([])
  } else if (preparing) {
    // 扇形底色只交代真实判定边界：没有描边圆环、没有向外扩散的波纹。
    ctx.fillStyle = heavy ? '#f0d487' : '#c6eb8d'
    ctx.globalAlpha = (heavy ? 0.045 : 0.03) + prepareProgress * (heavy ? 0.035 : 0.025)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, reach + 1, -half, half)
    ctx.closePath()
    ctx.fill()
    // 内侧的「合拢阴影」随蓄力收窄，读起来像口器正在夹住这一块区域。
    ctx.globalAlpha = (heavy ? 0.06 : 0.045) + prepareProgress * 0.035
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, reach * 0.7, -half * 0.74, half * 0.74)
    ctx.closePath()
    ctx.fill()
    // 两侧短边提示始终使用实际角度、射程，包含大型敌人擦边接触的位置。
    ctx.strokeStyle = heavy ? '#f5dfa4' : '#d6efb0'
    ctx.lineWidth = 1.1
    ctx.globalAlpha = (0.16 + prepareProgress * 0.1) * fade
    for (let side = -1; side <= 1; side += 2) {
      ctx.beginPath()
      ctx.moveTo(Math.cos(half) * reach * 0.72, side * Math.sin(half) * reach * 0.72)
      ctx.lineTo(Math.cos(half) * reach, side * Math.sin(half) * reach)
      ctx.stroke()
    }
    ctx.globalAlpha = 0.1 + prepareProgress * 0.06
    ctx.beginPath()
    ctx.moveTo(r * 0.5, 0)
    ctx.lineTo(reach * 0.86, 0)
    ctx.stroke()
  } else if (striking && heavy) {
    // 重咬的短促前冲拖影；只沿真实咬合方向，不制造额外伤害范围。
    ctx.globalAlpha = (1 - strikeProgress) * 0.16
    ctx.strokeStyle = '#dcf3ad'
    ctx.lineWidth = 2
    for (let side = -1; side <= 1; side += 2) {
      ctx.beginPath()
      ctx.moveTo(-r * 0.7, side * r * 0.6)
      ctx.lineTo(root.x + r * 0.25, side * r * 0.28)
      ctx.stroke()
    }
  }

  // —— 2. 口器：上下颌沿攻击方向张开/闭合，根部贴住脸部 ——
  const extension = striking ? strikeProgress : recovering ? clamp01(1 - (1 - fade) * 3.2) : 0
  const length = aiming ? r * (1.1 + aimProgress * 0.32)
    : preparing ? r * (heavy ? 1.35 + prepareProgress * 0.8 : 1.3 + prepareProgress * 0.55)
    : r * 1.25 + (reach * (heavy ? 0.94 : 0.88) - r * 1.25) * (striking ? extension : extension ** 2)
  const gape = aiming ? r * (0.18 + aimProgress * 0.28)
    : preparing ? r * (heavy ? 0.3 + prepareProgress * 0.7 : 0.24 + prepareProgress * 0.48)
    : striking ? r * (heavy ? 1.0 * (1 - strikeProgress) + 0.1 : 0.85 * (1 - strikeProgress) + 0.08)
    : r * 0.08 + 1
  const thick = r * (heavy ? 0.32 : 0.24)
  const alpha = Math.min(1, fade * 1.6)

  // 口腔：张开时露出深色喉部，闭合时自然消失。
  if (gape > r * 0.05) {
    ctx.globalAlpha = 0.88 * alpha
    ctx.fillStyle = '#14301a'
    ctx.beginPath()
    ctx.moveTo(root.x, root.y - root.half * 0.65)
    ctx.quadraticCurveTo(root.x + (length - root.x) * 0.55, root.y - gape * 0.82,
      length, root.y - gape * 0.86)
    ctx.lineTo(length, root.y + gape * 0.86)
    ctx.quadraticCurveTo(root.x + (length - root.x) * 0.55, root.y + gape * 0.82,
      root.x, root.y + root.half * 0.65)
    ctx.closePath()
    ctx.fill()
    // 喉部与舌面只作为一点点生命感，不抢牙齿和咬合轮廓。
    ctx.globalAlpha = 0.7 * alpha
    ctx.fillStyle = '#3b6a2b'
    ctx.beginPath()
    ctx.ellipse(root.x + (length - root.x) * 0.22, root.y,
      Math.max(1.6, (length - root.x) * 0.13), Math.max(1.2, gape * 0.42), 0, 0, TAU)
    ctx.fill()
    ctx.globalAlpha = 0.62 * alpha
    ctx.fillStyle = '#e2a29a'
    ctx.beginPath()
    ctx.ellipse(root.x + (length - root.x) * 0.34, root.y + gape * 0.04,
      Math.max(1.8, (length - root.x) * 0.28), Math.max(1.3, gape * 0.26), 0, 0, TAU)
    ctx.fill()
  }

  // 上下颌分别绘制：外缘厚、内缘薄，闭合时像软体口器夹紧而不是刀光。
  for (let side = -1; side <= 1; side += 2) {
    const rootOuter = root.y + side * root.half
    const rootInner = root.y + side * root.half * 0.35
    const tipOuter = root.y + side * (gape + thick * 0.35)
    const tipInner = root.y + side * gape
    const midX = root.x + (length - root.x) * 0.55
    const innerMidX = root.x + (length - root.x) * 0.72
    ctx.globalAlpha = 0.94 * alpha
    ctx.fillStyle = heavy ? '#365f24' : '#3f7029'
    ctx.beginPath()
    ctx.moveTo(root.x, rootOuter)
    ctx.quadraticCurveTo(midX, root.y + side * (gape * 0.95 + thick), length, tipOuter)
    ctx.lineTo(length, tipInner)
    ctx.quadraticCurveTo(innerMidX, root.y + side * (gape * 0.66), root.x, rootInner)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = heavy ? '#f3e0a1' : '#d6f0ae'
    ctx.lineWidth = heavy ? 2.8 : 2.2
    ctx.stroke()
    // 圆润的唇尖：避免长颌被读成针管或机械钳。
    ctx.globalAlpha = 0.96 * alpha
    ctx.beginPath()
    ctx.arc(length, root.y + side * gape, thick * 0.32, 0, TAU)
    ctx.fill()

    // 牙齿沿内缘排列，始终朝口腔中心生长。
    if (gape > r * 0.1) {
      ctx.fillStyle = '#f6ffdd'
      ctx.globalAlpha = alpha
      for (let i = 0; i < 4; i++) {
        const t = 0.4 + i * 0.15
        const u = 1 - t
        const px = u * u * root.x + 2 * u * t * innerMidX + t * t * length
        const py = u * u * rootInner + 2 * u * t * (root.y + side * gape * 0.66) + t * t * tipInner
        const tooth = r * (heavy ? 0.18 : 0.135) * (0.72 + t * 0.35)
        ctx.beginPath()
        ctx.moveTo(px - r * 0.055, py)
        ctx.lineTo(px + r * 0.055, py)
        ctx.lineTo(px + r * 0.008, py - side * tooth)
        ctx.closePath()
        ctx.fill()
      }
    }
  }

  // 根部封口，避免口器与身体之间露出缝隙（尤其上下与斜向）。
  ctx.globalAlpha = 0.95 * alpha
  ctx.fillStyle = '#2a4d20'
  ctx.beginPath()
  ctx.ellipse(root.x, root.y, r * 0.14, root.half * 0.9, 0, 0, TAU)
  ctx.fill()

  // 重咬在蓄力末段增加一圈很淡的内缘高光，强调力量层级而非扩大范围。
  if (heavy && (preparing || striking)) {
    const pulse = preparing ? prepareProgress : 1 - strikeProgress
    ctx.globalAlpha = pulse * 0.32 * alpha
    ctx.strokeStyle = '#ffe9ae'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(root.x + r * 0.2, root.y - root.half * 0.9)
    ctx.quadraticCurveTo(root.x + (length - root.x) * 0.5, root.y - gape * 0.7, length * 0.92, root.y - gape * 0.55)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(root.x + r * 0.2, root.y + root.half * 0.9)
    ctx.quadraticCurveTo(root.x + (length - root.x) * 0.5, root.y + gape * 0.7, length * 0.92, root.y + gape * 0.55)
    ctx.stroke()
  }
  ctx.restore()
}

/** 咬中反馈：上下两排分离的齿痕 + 碎屑；不绘制通用爆炸星形或白色圆盘。 */
function renderImpact(ctx, hit) {
  const fade = clamp01(hit.life / hit.maxLife)
  const age = 1 - fade
  const heavy = hit.heavy
  const size = (heavy ? 10 : 7.5) * (0.72 + fade * 0.28)
  ctx.save()
  ctx.translate(hit.x, hit.y)
  ctx.rotate(hit.angle)

  // 接触点暗部，让齿痕从敌人身上「咬出来」。
  ctx.globalAlpha = 0.2 * fade
  ctx.fillStyle = '#1f3518'
  ctx.beginPath()
  ctx.ellipse(0, 0, size * 0.5, size * 0.34, 0, 0, TAU)
  ctx.fill()

  // 上下两排短弧齿痕，中间留出敌人的轮廓，不拼成完整圆环。
  ctx.globalAlpha = 0.9 * fade
  ctx.strokeStyle = heavy ? '#fff0bd' : '#f6ffdf'
  ctx.lineWidth = heavy ? 2.4 : 1.8
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(0, -size * 0.62, size * 0.42, 0.2 * Math.PI, 0.8 * Math.PI)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, size * 0.62, size * 0.42, 1.2 * Math.PI, 1.8 * Math.PI)
  ctx.stroke()

  // 齿尖小刻痕：上下各三枚，短而碎。
  ctx.fillStyle = '#fff6d9'
  ctx.globalAlpha = 0.85 * fade
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 3; i++) {
      const px = (i - 1) * size * 0.27
      const py = side * size * 0.34
      ctx.beginPath()
      ctx.moveTo(px - size * 0.085, py)
      ctx.lineTo(px + size * 0.085, py)
      ctx.lineTo(px, py + side * size * 0.16)
      ctx.closePath()
      ctx.fill()
    }
  }

  // 碎屑：数量有限，重咬略多；吞噬目标用更亮的绿色。
  const crumbs = heavy ? 6 : 4
  ctx.fillStyle = hit.devoured ? '#dcfa92' : '#9bd66b'
  for (let i = 0; i < crumbs; i++) {
    const angle = (i / crumbs) * TAU + 0.4
    const distance = size * (0.55 + age * (heavy ? 1.25 : 0.9))
    ctx.globalAlpha = fade * 0.85
    ctx.beginPath()
    ctx.ellipse(Math.cos(angle) * distance, Math.sin(angle) * distance,
      Math.max(0.6, (heavy ? 2.4 : 1.8) * fade), Math.max(0.5, 1.1 * fade), angle, 0, TAU)
    ctx.fill()
  }

  if (heavy) {
    // 首领/重咬的短裂纹，向外但很快消失。
    ctx.globalAlpha = (1 - age) * 0.4
    ctx.strokeStyle = '#e6f7b4'
    ctx.lineWidth = 1.5
    for (let i = 0; i < 4; i++) {
      const angle = Math.PI * 0.25 + i * Math.PI * 0.5
      const inner = size * 0.55
      const outer = size * (0.95 + age * 0.7)
      ctx.beginPath()
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner)
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer)
      ctx.stroke()
    }
  }
  ctx.restore()
}

/** 胃酸迸发：不规则团块 + 碎滴，实际伤害半径只用极淡底色交代。 */
function renderAcidBurst(ctx, burst) {
  const fade = clamp01(burst.life / burst.maxLife)
  const spread = 1 - fade
  // 低透明度底色表示真实圆形判定，一闪即淡出。
  ctx.globalAlpha = 0.055 * fade
  ctx.fillStyle = '#a6e865'
  ctx.beginPath()
  ctx.arc(burst.x, burst.y, burst.radius, 0, TAU)
  ctx.fill()

  for (let i = 0; i < burst.blobs.length; i++) {
    const blob = burst.blobs[i]
    const distance = blob.distance + blob.drift * spread
    const px = burst.x + Math.cos(blob.angle) * distance
    const py = burst.y + Math.sin(blob.angle) * distance
    const rr = blob.radius * (1 - spread * 0.35)
    ctx.globalAlpha = (0.48 + 0.28 * Math.sin(blob.phase + spread * 4)) * fade
    ctx.fillStyle = i % 3 === 0 ? '#d9f79a' : i % 3 === 1 ? '#9fe35f' : '#77c847'
    ctx.beginPath()
    ctx.ellipse(px, py, rr * (1 + spread * 0.35), rr * (0.68 + 0.18 * Math.sin(blob.phase)),
      blob.angle + blob.roll * spread, 0, TAU)
    ctx.fill()
    if (i % 2 === 0) {
      ctx.beginPath()
      ctx.arc(px + Math.cos(blob.angle) * rr * 1.15, py + Math.sin(blob.angle) * rr * 1.15,
        Math.max(0.5, rr * 0.32), 0, TAU)
      ctx.fill()
    }
  }
}

export function renderBiteFeedback(ctx, combat) {
  const p = combat.player
  ctx.save()

  // 护甲：断续的软壳弧，而不是完整明亮的圆环。
  if (p.gluttonGuard > 0 && p.gluttonGuardTimer > 0) {
    const radius = p.radius + 3 + combat.guardPulse * 9
    ctx.strokeStyle = '#d1efa0'
    ctx.lineWidth = 2
    ctx.globalAlpha = Math.min(0.5, p.gluttonGuardTimer * 2)
    for (let i = 0; i < 3; i++) {
      const start = -Math.PI / 2 + i * TAU / 3 + 0.22
      ctx.beginPath()
      ctx.arc(p.x, p.y, radius, start, start + TAU / 3 - 0.44)
      ctx.stroke()
    }
  }

  for (const burst of combat.acidBursts) renderAcidBurst(ctx, burst)
  for (const hit of combat.impacts) renderImpact(ctx, hit)

  // 吞噬时目标血肉被吸入口器；方向读取本次真实咬击方向。
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
