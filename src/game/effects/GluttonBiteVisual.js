const TAU = Math.PI * 2
const clamp01 = value => Math.max(0, Math.min(1, value))
const ease = value => 1 - (1 - value) ** 3

/**
 * 身体与口器读取同一攻击时钟；只返回形变，不改移动、碰撞或朝向。
 * 阶段：aim（转头预告）→ windup（张嘴蓄力）→ strike（咬合）→ flash（收势）；
 *       深渊吸噬（vortex）：inhale（原地膨胀张口引流）。
 */
export function bitePose(swing, flash, vortex = null) {
  if (vortex) {
    const p = clamp01(vortex.elapsed / Math.max(0.0001, vortex.windup || 0.18))
    const swell = ease(p) * 0.24
    return {
      angle: vortex.angle || 0, heavy: true, mouth: 0.42 + p * 0.58, recovering: false,
      aiming: false, windupProgress: p, strikeProgress: 0,
      sx: 1 + swell,
      sy: 1 + swell,
      offset: -0.22 * ease(p),
    }
  }
  const attack = swing || flash
  if (!attack) return null
  const heavy = !!attack.heavy
  let compression = 0, extension = 0, mouth = 0
  let aiming = false, windupProgress = 0, strikeProgress = 0
  if (swing?.phase === 'aim') {
    aiming = true
    const p = clamp01(1 - swing.remaining / Math.max(0.0001, swing.aimDuration || 0.0001))
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
function mouthRoot(player, angle, pose) {
  const r = player.radius
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const faceX = r * -0.06 * pose.sx
  const faceY = r * 0.19 * pose.sy
  return {
    x: r * pose.offset + faceX * cos + faceY * sin,
    y: -faceX * sin + faceY * cos,
    half: r * (0.05 + pose.mouth * 0.15),
  }
}

/** 方向与真实扇形共用同一个 angle/reach/arc；深渊吸噬实时绘制向心引力环与吸流轨迹。 */
export function renderBiteMotion(ctx, player, swing, flash, vortex = null) {
  if (vortex) {
    const p = clamp01(vortex.elapsed / Math.max(0.0001, vortex.windup || 0.18))
    const pullR = vortex.pullRadius || player.radius + 190
    const biteR = vortex.biteRadius || player.radius + 92
    ctx.save()
    ctx.translate(player.x, player.y)
    // 外圈向内收缩的引力漩涡环
    const ringR = pullR * (1 - p * 0.58)
    ctx.globalAlpha = 0.28 + p * 0.25
    ctx.strokeStyle = '#c5ee7f'
    ctx.lineWidth = 2.2
    ctx.setLineDash([12, 8])
    ctx.lineDashOffset = -p * 60
    ctx.beginPath()
    ctx.arc(0, 0, ringR, 0, TAU)
    ctx.stroke()
    ctx.setLineDash([])
    // 内圈重咬杀伤域虚线框
    ctx.globalAlpha = 0.18 + p * 0.22
    ctx.fillStyle = 'rgba(182, 232, 102, 0.10)'
    ctx.beginPath()
    ctx.arc(0, 0, biteR, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = '#ffe596'
    ctx.lineWidth = 1.6
    ctx.stroke()
    // 向内牵引流线
    const streams = 8
    ctx.globalAlpha = 0.48
    ctx.strokeStyle = '#e7f9aa'
    ctx.lineWidth = 1.8
    for (let i = 0; i < streams; i++) {
      const a = (i / streams) * TAU + p * 1.6
      const outer = pullR * (0.94 - p * 0.45)
      const inner = Math.max(player.radius * 1.1, outer - pullR * 0.26)
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * outer, Math.sin(a) * outer)
      ctx.lineTo(Math.cos(a + 0.18) * inner, Math.sin(a + 0.18) * inner)
      ctx.stroke()
    }
    ctx.restore()
    return
  }
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
  const root = mouthRoot(player, attack.angle, pose)

  ctx.save()
  ctx.translate(swing ? player.x : flash.x, swing ? player.y : flash.y)
  ctx.rotate(attack.angle)

  // —— 1. 方向预告 ——
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
    ctx.fillStyle = heavy ? '#f0d487' : '#c6eb8d'
    ctx.globalAlpha = (heavy ? 0.045 : 0.03) + prepareProgress * (heavy ? 0.035 : 0.025)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, reach + 1, -half, half)
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = (heavy ? 0.06 : 0.045) + prepareProgress * 0.035
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, reach * 0.7, -half * 0.74, half * 0.74)
    ctx.closePath()
    ctx.fill()
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

  // —— 2. 口器：上下颌沿攻击方向张开/闭合 ——
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

  if (gape > r * 0.05) {
    ctx.globalAlpha = 0.88 * alpha
    ctx.fillStyle = '#2a0a10'
    ctx.beginPath()
    ctx.moveTo(root.x, root.y - root.half * 0.65)
    ctx.quadraticCurveTo(root.x + (length - root.x) * 0.55, root.y - gape * 0.82,
      length, root.y - gape * 0.86)
    ctx.lineTo(length, root.y + gape * 0.86)
    ctx.quadraticCurveTo(root.x + (length - root.x) * 0.55, root.y + gape * 0.82,
      root.x, root.y + root.half * 0.65)
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 0.7 * alpha
    ctx.fillStyle = '#6b1c22'
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

  for (let side = -1; side <= 1; side += 2) {
    const rootOuter = root.y + side * root.half
    const rootInner = root.y + side * root.half * 0.35
    const tipOuter = root.y + side * (gape + thick * 0.35)
    const tipInner = root.y + side * gape
    const midX = root.x + (length - root.x) * 0.55
    const innerMidX = root.x + (length - root.x) * 0.72
    ctx.globalAlpha = 0.94 * alpha
    ctx.fillStyle = heavy ? '#9c2e26' : '#b93a30'
    ctx.beginPath()
    ctx.moveTo(root.x, rootOuter)
    ctx.quadraticCurveTo(midX, root.y + side * (gape * 0.95 + thick), length, tipOuter)
    ctx.lineTo(length, tipInner)
    ctx.quadraticCurveTo(innerMidX, root.y + side * (gape * 0.66), root.x, rootInner)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = heavy ? '#ffe9ae' : '#ffd6c2'
    ctx.lineWidth = heavy ? 2.8 : 2.2
    ctx.stroke()
    ctx.globalAlpha = 0.96 * alpha
    ctx.beginPath()
    ctx.arc(length, root.y + side * gape, thick * 0.32, 0, TAU)
    ctx.fill()

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

  ctx.globalAlpha = 0.95 * alpha
  ctx.fillStyle = '#7a2420'
  ctx.beginPath()
  ctx.ellipse(root.x, root.y, r * 0.14, root.half * 0.9, 0, 0, TAU)
  ctx.fill()

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

/** 咬中反馈：上下两排分离的齿痕 + 碎屑 */
function renderImpact(ctx, hit) {
  const fade = clamp01(hit.life / hit.maxLife)
  const age = 1 - fade
  const heavy = hit.heavy
  const size = (heavy ? 10 : 7.5) * (0.72 + fade * 0.28)
  ctx.save()
  ctx.translate(hit.x, hit.y)
  ctx.rotate(hit.angle)

  ctx.globalAlpha = 0.2 * fade
  ctx.fillStyle = '#1f3518'
  ctx.beginPath()
  ctx.ellipse(0, 0, size * 0.5, size * 0.34, 0, 0, TAU)
  ctx.fill()

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

/** 地面腐蚀光环（近战 360° 威慑半径）：极克制透明度，不压过敌方攻击红线。 */
export function renderCorrodeAura(ctx, combat) {
  const p = combat.player
  const radius = combat.auraRadius()
  if (!(radius > 0)) return
  const t = p.elapsed || 0
  const isMire = combat.route === 'mire'
  const pulse = 0.5 + 0.5 * Math.sin(t * 4.5)
  ctx.save()
  ctx.translate(p.x, p.y)
  const grad = ctx.createRadialGradient(0, 0, p.radius * 0.7, 0, 0, radius)
  grad.addColorStop(0, isMire ? 'rgba(181, 214, 111, 0.16)' : 'rgba(145, 224, 102, 0.11)')
  grad.addColorStop(0.78, isMire ? 'rgba(130, 194, 72, 0.11)' : 'rgba(115, 198, 84, 0.07)')
  grad.addColorStop(1, 'rgba(115, 198, 84, 0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, TAU)
  ctx.fill()

  ctx.globalAlpha = (isMire ? 0.34 : 0.22) + pulse * 0.08
  ctx.strokeStyle = isMire ? '#c5eb7c' : '#9ee276'
  ctx.lineWidth = isMire ? 1.8 : 1.3
  ctx.setLineDash([7, 7])
  ctx.lineDashOffset = -t * 24
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, TAU)
  ctx.stroke()
  ctx.setLineDash([])

  for (const fx of combat.auraPulses || []) {
    const k = clamp01(fx.life / fx.maxLife)
    ctx.globalAlpha = k * 0.28
    ctx.strokeStyle = isMire ? '#dff8a6' : '#c0ee9b'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, 0, radius * (0.45 + (1 - k) * 0.55), 0, TAU)
    ctx.stroke()
  }
  ctx.restore()
}

export function renderBiteFeedback(ctx, combat) {
  const p = combat.player
  ctx.save()

  // 深渊吸噬：残余向心引力波
  for (const vx of combat.vortices || []) {
    const k = clamp01(vx.life / vx.maxLife)
    const progress = 1 - k
    ctx.globalAlpha = k * 0.38
    ctx.strokeStyle = combat.route === 'jaw' ? '#f28a59' : '#c6f18e'
    ctx.lineWidth = 2.2
    ctx.beginPath()
    ctx.arc(vx.x, vx.y, vx.pullRadius * (1 - progress * 0.55), 0, TAU)
    ctx.stroke()
  }

  // 闭颚/地震践踏冲击波
  for (const slam of combat.slams || []) {
    const k = clamp01(slam.life / slam.maxLife)
    const r = slam.radius * (0.35 + (1 - k) * 0.65)
    ctx.globalAlpha = k * 0.52
    ctx.strokeStyle = slam.color || '#f4c87a'
    ctx.lineWidth = 3 * k + 1
    ctx.beginPath()
    ctx.arc(slam.x, slam.y, r, 0, TAU)
    ctx.stroke()
  }

  // 酸刺反震扩散波
  for (const sp of combat.spikes || []) {
    const k = clamp01(sp.life / sp.maxLife)
    const progress = 1 - k
    const count = sp.count || 10
    ctx.strokeStyle = sp.color || '#f1c76b'
    ctx.lineWidth = sp.surge ? 2.4 : 1.7
    ctx.globalAlpha = k * 0.85
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + (sp.offset || 0)
      const r0 = sp.radius * (0.28 + progress * 0.45)
      const r1 = sp.radius * (0.58 + progress * 0.42)
      ctx.beginPath()
      ctx.moveTo(sp.x + Math.cos(a) * r0, sp.y + Math.sin(a) * r0)
      ctx.lineTo(sp.x + Math.cos(a) * r1, sp.y + Math.sin(a) * r1)
      ctx.stroke()
    }
  }

  // 多层胃铠：按当前层数分段绘制可数软壳弧，有几层就有几段弧。
  if (p.gluttonGuard > 0 && p.gluttonGuardTimer > 0) {
    const layers = Math.max(1, Math.min(8, Math.round(p.gluttonGuard)))
    const cap = Math.max(layers, combat.guardMax || 2)
    const radius = p.radius + 4 + combat.guardPulse * 8
    const step = TAU / cap
    const gap = Math.min(0.24, step * 0.28)
    ctx.strokeStyle = combat.route === 'shell' ? '#f3cf7b' : '#d1efa0'
    ctx.lineWidth = 2.6
    ctx.lineCap = 'round'
    ctx.globalAlpha = Math.min(0.82, 0.35 + p.gluttonGuardTimer * 0.35)
    for (let i = 0; i < layers; i++) {
      const start = -Math.PI / 2 + i * step + gap / 2
      ctx.beginPath()
      ctx.arc(p.x, p.y, radius, start, start + step - gap)
      ctx.stroke()
    }
  }

  for (const burst of combat.acidBursts) renderAcidBurst(ctx, burst)
  for (const hit of combat.impacts) renderImpact(ctx, hit)

  // 吞噬时目标血肉被吸入口器
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
