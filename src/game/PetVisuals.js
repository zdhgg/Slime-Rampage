import { ECHO_PET_SPEC, PET_TYPES } from './PetRoster.js'

const TAU = Math.PI * 2

function specLook(def, palette) {
  return {
    ...palette,
    rim: def.color,
    glow: `${def.color}59`,
  }
}

const LOOK = {
  guardian: specLook(PET_TYPES.guardian, {
    top: '#fff0c4', bottom: '#9b6e2f', glow: 'rgba(237,196,121,.34)',
    cheek: 'rgba(255,172,118,.48)', eye: '#1a2722', accent: '#6b4d24',
  }),
  hunter: specLook(PET_TYPES.hunter, {
    top: '#dcfff5', bottom: '#277265', glow: 'rgba(142,218,203,.34)',
    cheek: 'rgba(182,255,238,.42)', eye: '#102925', accent: '#c8fff0',
  }),
  dew: specLook(PET_TYPES.dew, {
    top: '#e3fbff', bottom: '#2a7796', glow: 'rgba(143,215,232,.34)',
    cheek: 'rgba(180,242,255,.45)', eye: '#122731', accent: '#9ae6a8',
  }),
  spore: specLook(PET_TYPES.spore, {
    top: '#f0e2ff', bottom: '#5e3f80', glow: 'rgba(195,164,220,.34)',
    cheek: 'rgba(235,176,255,.45)', eye: '#221433', accent: '#7c53a8',
  }),
  spark: specLook(PET_TYPES.spark, {
    top: '#fffbd1', bottom: '#9b7714', glow: 'rgba(246,229,109,.36)',
    cheek: 'rgba(255,212,112,.52)', eye: '#271f06', accent: '#fff6a6',
  }),
  ember: specLook(PET_TYPES.ember, {
    top: '#ffdfcc', bottom: '#98351a', glow: 'rgba(255,140,90,.36)',
    cheek: 'rgba(255,112,72,.52)', eye: '#2c1108', accent: '#ffbe6b',
  }),
  bramble: specLook(PET_TYPES.bramble, {
    top: '#dcffdf', bottom: '#246c38', glow: 'rgba(116,214,128,.34)',
    cheek: 'rgba(154,242,166,.46)', eye: '#102b18', accent: '#449e58',
  }),
  frost: specLook(PET_TYPES.frost, {
    top: '#ebfbff', bottom: '#276594', glow: 'rgba(154,217,255,.36)',
    cheek: 'rgba(180,235,255,.48)', eye: '#112538', accent: '#dcf4ff',
  }),
  echo: specLook(ECHO_PET_SPEC, {
    top: '#fff8db', bottom: '#9e7a2b', glow: 'rgba(255,228,161,.38)',
    cheek: 'rgba(255,204,132,.46)', eye: '#2c2008', accent: '#fff4cb',
  }),
}

function fillPath(ctx, points, fill, stroke, width = 1.6) {
  ctx.beginPath()
  points.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
  if (fill) { ctx.fillStyle = fill; ctx.fill() }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke() }
}

function drawEyes(ctx, look, y = 1.5, fierce = false) {
  ctx.fillStyle = look.cheek
  ctx.beginPath()
  ctx.ellipse(-6.5, y + 3.2, 2.2, 1.3, 0, 0, TAU)
  ctx.ellipse(6.5, y + 3.2, 2.2, 1.3, 0, 0, TAU)
  ctx.fill()
  ctx.fillStyle = look.eye
  ctx.beginPath()
  ctx.ellipse(-4.3, y, 1.7, 2.4, 0, 0, TAU)
  ctx.ellipse(4.3, y, 1.7, 2.4, 0, 0, TAU)
  ctx.fill()
  if (fierce) {
    ctx.strokeStyle = look.eye
    ctx.lineWidth = 1.3
    ctx.beginPath()
    ctx.moveTo(-6.2, y - 3.2); ctx.lineTo(-2.5, y - 2)
    ctx.moveTo(6.2, y - 3.2); ctx.lineTo(2.5, y - 2)
    ctx.stroke()
  }
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(-3.7, y - 0.9, 0.7, 0, TAU)
  ctx.arc(4.9, y - 0.9, 0.7, 0, TAU)
  ctx.fill()
}

function drawBlob(ctx, look, r, sx, sy, y = 1.5) {
  ctx.save()
  ctx.scale(sx, sy)
  ctx.beginPath()
  ctx.moveTo(-r, 4)
  ctx.quadraticCurveTo(-r * 0.96, -r * 0.92, 0, -r)
  ctx.quadraticCurveTo(r * 0.96, -r * 0.92, r, 4)
  ctx.quadraticCurveTo(r * 0.78, r * 0.88, 0, r * 0.85)
  ctx.quadraticCurveTo(-r * 0.78, r * 0.88, -r, 4)
  ctx.closePath()
  const fill = ctx.createLinearGradient(0, -r, 0, r)
  fill.addColorStop(0, look.top)
  fill.addColorStop(0.56, look.rim)
  fill.addColorStop(1, look.bottom)
  ctx.fillStyle = fill; ctx.fill()
  ctx.strokeStyle = look.eye; ctx.lineWidth = 1.9; ctx.stroke()
  ctx.restore()
  drawEyes(ctx, look, y)
}

function drawGuardian(ctx, look, r, active) {
  ctx.save()
  fillPath(ctx, [[-11.5, 4], [-14.5, -2.5], [-10.5, -8.5], [-7, -3.5]], '#8b6a38', look.eye, 1.5)
  fillPath(ctx, [[11.5, 4], [14.5, -2.5], [10.5, -8.5], [7, -3.5]], '#8b6a38', look.eye, 1.5)
  ctx.beginPath()
  ctx.moveTo(-r, 5)
  ctx.quadraticCurveTo(-r * 0.92, -r * 0.84, 0, -r * 0.92)
  ctx.quadraticCurveTo(r * 0.92, -r * 0.84, r, 5)
  ctx.quadraticCurveTo(r * 0.82, r * 0.86, 0, r * 0.84)
  ctx.quadraticCurveTo(-r * 0.82, r * 0.86, -r, 5)
  ctx.closePath()
  const fill = ctx.createLinearGradient(0, -r, 0, r)
  fill.addColorStop(0, look.top); fill.addColorStop(0.55, look.rim); fill.addColorStop(1, look.bottom)
  ctx.fillStyle = fill; ctx.fill()
  ctx.strokeStyle = look.eye; ctx.lineWidth = 2; ctx.stroke()
  fillPath(ctx, [[-6.5, -4], [-4.5, -10.5], [0, -12.5], [4.5, -10.5], [6.5, -4], [0, -2.5]], active ? '#fff0bd' : '#c6954c', look.eye, 1.4)
  drawEyes(ctx, look, 2.2, true)
  ctx.restore()
}

function drawHunter(ctx, look, r, active) {
  ctx.save()
  const wingSpread = active ? 2.5 : 0
  fillPath(ctx, [[-7, -1], [-15 - wingSpread, -9], [-13 - wingSpread, 0], [-8, 3]], look.top, look.eye, 1.4)
  fillPath(ctx, [[7, -1], [15 + wingSpread, -9], [13 + wingSpread, 0], [8, 3]], look.top, look.eye, 1.4)
  fillPath(ctx, [[-3.5, -r + 2], [0, -r - 7.5], [3.5, -r + 2]], '#e6fff8', look.eye, 1.4)
  drawBlob(ctx, look, r * 0.94, 0.96, 1.03, 1.5)
  ctx.restore()
}

function drawDew(ctx, look, r) {
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(0, -r * 1.06)
  ctx.quadraticCurveTo(r * 0.95, -r * 0.16, r * 0.96, 4.2)
  ctx.quadraticCurveTo(r * 0.72, r * 0.92, 0, r * 0.88)
  ctx.quadraticCurveTo(-r * 0.72, r * 0.92, -r * 0.96, 4.2)
  ctx.quadraticCurveTo(-r * 0.95, -r * 0.16, 0, -r * 1.06)
  ctx.closePath()
  const fill = ctx.createLinearGradient(0, -r, 0, r)
  fill.addColorStop(0, look.top); fill.addColorStop(0.55, look.rim); fill.addColorStop(1, look.bottom)
  ctx.fillStyle = fill; ctx.fill()
  ctx.strokeStyle = look.eye; ctx.lineWidth = 1.9; ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,.55)'
  ctx.beginPath()
  ctx.ellipse(-4.5, -5.5, 2.5, 4.2, 0.45, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = '#3b8c52'; ctx.lineWidth = 1.6
  ctx.beginPath(); ctx.moveTo(0, -r * 1.06); ctx.quadraticCurveTo(2, -r * 1.28, 4.5, -r * 1.24); ctx.stroke()
  fillPath(ctx, [[1.5, -r * 1.18], [7, -r * 1.46], [5.5, -r * 1.08]], look.accent, look.eye, 1.1)
  drawEyes(ctx, look, 2.2)
  ctx.restore()
}

function drawSpore(ctx, look, r, active) {
  ctx.save()
  drawBlob(ctx, { ...look, top: '#e2d0f7', rim: '#b48fd6', bottom: '#68458f' }, r * 0.86, 0.92, 0.92, 3.2)
  ctx.beginPath()
  ctx.moveTo(-r * 1.22, -1.5)
  ctx.quadraticCurveTo(-r * 1.1, -r * 1.18, 0, -r * 1.22)
  ctx.quadraticCurveTo(r * 1.1, -r * 1.18, r * 1.22, -1.5)
  ctx.quadraticCurveTo(0, 1.5, -r * 1.22, -1.5)
  ctx.closePath()
  ctx.fillStyle = active ? '#a56fd8' : '#7b4fa8'; ctx.fill()
  ctx.strokeStyle = look.eye; ctx.lineWidth = 1.8; ctx.stroke()
  ctx.fillStyle = '#f2e8ff'
  for (const [cx, cy, sr] of [[-5.8, -7.2, 2.3], [0.8, -10.2, 2.6], [6.4, -5.5, 1.9]]) {
    ctx.beginPath(); ctx.arc(cx, cy, sr, 0, TAU); ctx.fill()
  }
  ctx.restore()
}

function drawSpark(ctx, look, r, time, active) {
  ctx.save()
  const jitter = Math.sin(time * 22) * (active ? 1.8 : 0.7)
  // 闪电双耳天线
  fillPath(ctx, [[-6.5, -9], [-11, -18 + jitter], [-4.5, -14], [-3, -10]], '#fff9b8', look.eye, 1.3)
  fillPath(ctx, [[6.5, -9], [11, -18 - jitter], [4.5, -14], [3, -10]], '#fff9b8', look.eye, 1.3)
  drawBlob(ctx, look, r * 0.92, 0.98, 0.96, 1.8)
  // 颊侧电流锯齿
  ctx.strokeStyle = active ? '#ffffff' : '#fff6a6'
  ctx.lineWidth = 1.5
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(side * 8.5, 0)
    ctx.lineTo(side * 12.5, -2.5)
    ctx.lineTo(side * 10.5, 2)
    ctx.lineTo(side * 14, 1)
    ctx.stroke()
  }
  ctx.restore()
}

function drawEmber(ctx, look, r, time, active) {
  ctx.save()
  const flicker = Math.sin(time * 16) * 2 + (active ? 3 : 0)
  // 顶部摇曳火冠
  fillPath(ctx, [[-8, -7], [-4.5, -17 - flicker], [0, -13], [4, -19 - flicker * 0.6], [8, -7]], '#ffbe6b', look.eye, 1.4)
  drawBlob(ctx, look, r * 0.95, 1, 0.98, 2)
  // 岩浆纹
  ctx.strokeStyle = '#ffdf9e'
  ctx.lineWidth = 1.3
  ctx.beginPath()
  ctx.moveTo(-6, -6); ctx.lineTo(-2, -3.5)
  ctx.moveTo(6.5, -5.5); ctx.lineTo(2.5, -3)
  ctx.stroke()
  ctx.restore()
}

function drawBramble(ctx, look, r, spinAngle) {
  ctx.save()
  ctx.save()
  ctx.rotate(spinAngle)
  const spikes = 8
  ctx.beginPath()
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i * TAU) / (spikes * 2)
    const dist = i % 2 === 0 ? r * 1.24 : r * 0.88
    const px = Math.cos(a) * dist
    const py = Math.sin(a) * dist
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fillStyle = '#3e8c4f'; ctx.fill()
  ctx.strokeStyle = look.eye; ctx.lineWidth = 1.5; ctx.stroke()
  ctx.restore()
  drawBlob(ctx, look, r * 0.88, 0.96, 0.94, 1.5)
  // 锋利战眉
  ctx.strokeStyle = look.eye; ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(-6.5, -1.6); ctx.lineTo(-2.5, -0.3)
  ctx.moveTo(6.5, -1.6); ctx.lineTo(2.5, -0.3)
  ctx.stroke()
  ctx.restore()
}

function drawFrost(ctx, look, r, time, active) {
  ctx.save()
  const float = Math.sin(time * 4) * 1.2
  // 悬浮冰晶冠
  fillPath(ctx, [[-3, -r + 1], [0, -r - 8 + float], [3, -r + 1], [0, -r + 4]], '#e8f9ff', look.eye, 1.3)
  fillPath(ctx, [[-11, -6], [-14.5, -11 + float], [-8.5, -9.5]], '#bfeaff', look.eye, 1.2)
  fillPath(ctx, [[11, -6], [14.5, -11 - float], [8.5, -9.5]], '#bfeaff', look.eye, 1.2)
  // 棱角霜晶轮廓
  fillPath(ctx, [
    [-r * 0.95, 4], [-r * 0.85, -r * 0.6], [0, -r * 1.02], [r * 0.85, -r * 0.6],
    [r * 0.95, 4], [r * 0.6, r * 0.86], [-r * 0.6, r * 0.86],
  ], look.rim, look.eye, 1.8)
  ctx.fillStyle = active ? 'rgba(255,255,255,.55)' : 'rgba(235,250,255,.35)'
  fillPath(ctx, [[0, -r * 0.9], [-r * 0.55, -r * 0.4], [0, 0]], ctx.fillStyle)
  drawEyes(ctx, look, 1.8)
  ctx.restore()
}

const PET_BODY_DRAWERS = {
  guardian: (ctx, look, r, active) => drawGuardian(ctx, look, r, active),
  hunter: (ctx, look, r, active) => drawHunter(ctx, look, r, active),
  dew: (ctx, look, r) => drawDew(ctx, look, r),
  spore: (ctx, look, r, active) => drawSpore(ctx, look, r, active),
  spark: (ctx, look, r, active, time) => drawSpark(ctx, look, r, time, active),
  ember: (ctx, look, r, active, time) => drawEmber(ctx, look, r, time, active),
  bramble: (ctx, look, r, active, time, pet) => drawBramble(ctx, look, r, pet.spinTimer > 0 ? pet.angle : time * 1.4),
  frost: (ctx, look, r, active, time) => drawFrost(ctx, look, r, time, active),
  echo: (ctx, look, r) => drawBlob(ctx, look, r * 0.9, 0.96, 1.04, 1.5),
}

export function renderPet(ctx, pet, recovery, time = 0, rallyTime = 0, route = null) {
  const look = LOOK[pet.type] || LOOK.guardian
  const active = pet.supportActive > 0
  const rallied = rallyTime > 0
  const isBeastRallied = rallied && route === 'beast'
  const r = 13.5 * (pet.star ? 1.08 : 1) * (isBeastRallied ? 1.12 : 1)
  const bob = pet.down > 0 ? 0 : Math.sin(time * 5 + pet.id * 1.4) * 1.6

  ctx.save()
  if (pet.isEcho) ctx.globalAlpha = 0.68

  // 刃棘滚滚冲刺残影
  if (pet.rollDash && pet.down <= 0) {
    ctx.save()
    ctx.globalAlpha *= 0.32
    for (const step of [14, 28]) {
      ctx.fillStyle = look.rim
      ctx.beginPath()
      ctx.arc(pet.x - pet.rollDash.dx * step, pet.y - pet.rollDash.dy * step, r * 0.72, 0, TAU)
      ctx.fill()
    }
    ctx.restore()
  }

  // 地面投影
  ctx.fillStyle = 'rgba(0,0,0,.22)'
  ctx.beginPath(); ctx.ellipse(pet.x, pet.y + 11.5, r * 0.9, 4.4, 0, 0, TAU); ctx.fill()

  if (pet.down > 0) {
    ctx.globalAlpha = 0.45
    ctx.strokeStyle = look.rim; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(pet.x, pet.y, 11.5, 0, TAU); ctx.stroke()
    ctx.strokeStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(pet.x, pet.y, 14.5, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - pet.down / Math.max(0.1, recovery)))
    ctx.stroke()
    ctx.restore()
    return
  }

  // 外围战斗光环（狂野/星辰/鼓舞）
  if (rallied || active || pet.star) {
    const auraRadius = r + (isBeastRallied ? 8 : rallied ? 6 : 4)
    ctx.fillStyle = isBeastRallied ? 'rgba(255,140,90,.28)' : look.glow
    ctx.beginPath(); ctx.arc(pet.x, pet.y + bob, auraRadius, 0, TAU); ctx.fill()
  }

  // 护盾环
  if ((pet.shield || 0) > 0) {
    ctx.strokeStyle = 'rgba(255,228,161,.92)'; ctx.lineWidth = 2.2
    ctx.beginPath(); ctx.arc(pet.x, pet.y + bob, r + 4.5, 0, TAU); ctx.stroke()
  }

  // 刃棘风暴旋转刀锋
  if (pet.spinTimer > 0) {
    ctx.strokeStyle = 'rgba(116,214,128,.75)'; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.arc(pet.x, pet.y + bob, 36, time * 10, time * 10 + Math.PI * 1.45); ctx.stroke()
    ctx.beginPath(); ctx.arc(pet.x, pet.y + bob, 44, -time * 12, -time * 12 + Math.PI * 1.2); ctx.stroke()
  }

  // 前摇指示环
  if (pet.attack) {
    ctx.strokeStyle = 'rgba(255,244,210,.88)'; ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.arc(pet.x, pet.y + bob, 17, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - pet.attack.time / Math.max(0.05, pet.attack.maxTime)))
    ctx.stroke()
  } else if (pet.support) {
    ctx.strokeStyle = look.rim; ctx.lineWidth = 2.2
    ctx.beginPath()
    ctx.arc(pet.x, pet.y + bob, 18.5, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - pet.support.time / Math.max(0.05, pet.support.maxTime)))
    ctx.stroke()
  }

  // 主体史莱姆矢量造型
  ctx.save()
  ctx.translate(pet.x, pet.y + bob)
  const drawer = PET_BODY_DRAWERS[pet.type] || PET_BODY_DRAWERS.guardian
  drawer(ctx, look, r, active, time, pet)
  ctx.restore()

  // 星级王冠徽记（🌟 万灵契约满编制晋升）
  if (pet.star && !pet.isEcho) {
    const sy = pet.y + bob - r - 8
    ctx.fillStyle = '#ffd166'
    ctx.strokeStyle = '#6b470c'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(pet.x, sy - 4.5)
    ctx.lineTo(pet.x + 2, sy - 1)
    ctx.lineTo(pet.x + 5, sy)
    ctx.lineTo(pet.x + 2, sy + 1.5)
    ctx.lineTo(pet.x, sy + 4.5)
    ctx.lineTo(pet.x - 2, sy + 1.5)
    ctx.lineTo(pet.x - 5, sy)
    ctx.lineTo(pet.x - 2, sy - 1)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
  }

  if (pet.flash > 0) {
    ctx.fillStyle = 'rgba(255,112,112,.45)'
    ctx.beginPath(); ctx.arc(pet.x, pet.y + bob, r * 0.9, 0, TAU); ctx.fill()
  }

  if (pet.attackFx > 0) {
    ctx.strokeStyle = pet.attackBoosted ? '#ffe4a1' : look.rim; ctx.lineWidth = pet.attackBoosted ? 3 : 2.1
    ctx.beginPath(); ctx.arc(pet.x, pet.y + bob, 20, pet.attackAngle - 0.85, pet.attackAngle + 0.85); ctx.stroke()
  }

  // 头顶血条与护盾条
  if (!pet.isEcho && pet.maxHp > 0) {
    const w = 24, hpY = pet.y - r - (pet.star ? 14 : 6)
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(pet.x - w / 2, hpY, w, 3.2)
    ctx.fillStyle = pet.hurt > 0 ? '#ffe4a1' : look.rim
    ctx.fillRect(pet.x - w / 2, hpY, w * Math.max(0, Math.min(1, pet.hp / pet.maxHp)), 3.2)
    if ((pet.shield || 0) > 0) {
      ctx.fillStyle = '#fff5c8'
      ctx.fillRect(pet.x - w / 2, hpY - 2, w * Math.min(1, pet.shield / pet.maxHp), 1.8)
    }
  }
  ctx.restore()
}

export function renderPetGround(ctx, combat, time = 0) {
  if (!combat) return
  ctx.save()

  // 孢毒菌雾地带
  for (const z of combat.sporeZones || []) {
    const ratio = Math.max(0, z.life / Math.max(0.1, z.maxLife))
    ctx.fillStyle = `rgba(195,164,220,${0.16 * ratio})`
    ctx.strokeStyle = `rgba(195,164,220,${0.48 * ratio})`
    ctx.lineWidth = 1.6
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.fill(); ctx.stroke()
    for (let i = 0; i < 3; i++) {
      const a = time * 1.4 + i * 2.1
      const br = z.r * 0.55
      ctx.fillStyle = `rgba(220,192,255,${0.32 * ratio})`
      ctx.beginPath(); ctx.arc(z.x + Math.cos(a) * br, z.y + Math.sin(a) * br, 4, 0, TAU); ctx.fill()
    }
  }

  // 甘露涌泉光环
  if (combat.fountainZone) {
    const fz = combat.fountainZone
    const alpha = Math.max(0, fz.life / Math.max(0.1, fz.maxLife))
    ctx.fillStyle = `rgba(143,215,232,${0.14 * alpha})`
    ctx.strokeStyle = `rgba(143,215,232,${0.55 * alpha})`
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(fz.x, fz.y, fz.r, 0, TAU); ctx.fill(); ctx.stroke()
    const wave = ((time * 1.5) % 1) * fz.r
    ctx.strokeStyle = `rgba(218,250,255,${0.45 * alpha})`
    ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.arc(fz.x, fz.y, wave, 0, TAU); ctx.stroke()
  }

  // 岩甲陨石碑（守护觉醒）
  for (const mon of combat.monuments || []) {
    const alpha = Math.max(0, mon.life / Math.max(0.1, mon.maxLife))
    ctx.strokeStyle = `rgba(237,196,121,${0.28 * alpha})`
    ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.arc(mon.x, mon.y, mon.lureRadius || 160, 0, TAU); ctx.stroke()
    ctx.globalAlpha = 0.35 + 0.65 * alpha
    fillPath(ctx, [[mon.x - 10, mon.y + 8], [mon.x - 7, mon.y - 14], [mon.x, mon.y - 20], [mon.x + 7, mon.y - 14], [mon.x + 10, mon.y + 8]], '#a67d43', '#2d200d', 1.8)
    ctx.fillStyle = '#ffe4a1'
    ctx.beginPath(); ctx.arc(mon.x, mon.y - 6, 3, 0, TAU); ctx.fill()
    ctx.globalAlpha = 1
  }

  // 陨石/巨孢预警圈
  for (const m of combat.meteorDrops || []) {
    const progress = 1 - Math.max(0, m.delay / 0.5)
    ctx.fillStyle = m.kind === 'ember' ? 'rgba(255,140,90,.18)' : 'rgba(195,164,220,.16)'
    ctx.strokeStyle = m.color || '#ff8c5a'
    ctx.lineWidth = 1.8
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r * Math.max(0.15, progress), 0, TAU); ctx.stroke()
  }

  // 永恒星阵终极地面法阵
  if (combat.routeUltimate === 'bond' && combat.rallyTime > 0 && combat.player) {
    const px = combat.player.x, py = combat.player.y
    ctx.fillStyle = 'rgba(195,164,220,.10)'
    ctx.strokeStyle = 'rgba(222,196,255,.68)'
    ctx.lineWidth = 2.2
    ctx.beginPath(); ctx.arc(px, py, 220, 0, TAU); ctx.fill(); ctx.stroke()
    ctx.strokeStyle = 'rgba(255,228,161,.42)'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    for (let i = 0; i <= 6; i++) {
      const a = time * 0.8 + (i * TAU) / 3
      const vx = px + Math.cos(a) * 214
      const vy = py + Math.sin(a) * 214
      if (i === 0) ctx.moveTo(vx, vy)
      else ctx.lineTo(vx, vy)
    }
    ctx.stroke()
  }

  ctx.restore()
}

export function renderPetEffects(ctx, combat, time = 0) {
  if (!combat || !combat.player) return
  ctx.save()
  const p = combat.player

  // 本体玩家灵盾护盾环
  if ((combat.playerShield || 0) > 0) {
    ctx.strokeStyle = 'rgba(255,228,161,.85)'; ctx.lineWidth = 2.6
    ctx.beginPath(); ctx.arc(p.x, p.y, (p.radius || 22) + 8 + Math.sin(time * 8) * 1.2, 0, TAU); ctx.stroke()
  }

  // 鼓舞开启冲击光环
  if ((combat.rallyFlash || 0) > 0) {
    const progress = 1 - combat.rallyFlash / 0.55
    ctx.strokeStyle = `rgba(255,228,161,${(1 - progress) * 0.72})`
    ctx.lineWidth = 3.2
    ctx.beginPath(); ctx.arc(p.x, p.y, 28 + progress * 115, 0, TAU); ctx.stroke()
  }

  // 双生协奏 · 共生灵链连线
  const linkActive = combat.route === 'bond' || (combat.routeBondSeedLevel > 0 && combat.rallyTime > 0)
  if (linkActive) {
    const alivePets = (combat.items || []).filter(item => item.hp > 0)
    const reach = Math.min(400, 280 + (combat.routeBondChainLevel || 0) * 15)
    const boosted = combat.rallyTime > 0
    ctx.strokeStyle = boosted ? 'rgba(255,228,161,.82)' : 'rgba(195,164,220,.62)'
    ctx.lineWidth = boosted ? 4.2 : 2.4
    for (const pet of alivePets) {
      if (Math.hypot(pet.x - p.x, pet.y - p.y) > reach) continue
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(pet.x, pet.y); ctx.stroke()
    }
    if ((combat.routeBondChainLevel || 0) > 0) {
      ctx.strokeStyle = boosted ? 'rgba(218,186,255,.68)' : 'rgba(195,164,220,.42)'
      ctx.lineWidth = boosted ? 2.6 : 1.6
      for (let i = 0; i < alivePets.length; i++) {
        for (let j = i + 1; j < alivePets.length; j++) {
          if (Math.hypot(alivePets[i].x - alivePets[j].x, alivePets[i].y - alivePets[j].y) <= 240) {
            ctx.beginPath(); ctx.moveTo(alivePets[i].x, alivePets[i].y); ctx.lineTo(alivePets[j].x, alivePets[j].y); ctx.stroke()
          }
        }
      }
    }
  }

  // 电光叽叽 · 高压电弧链持续连线
  for (const pet of combat.items || []) {
    if (pet.type === 'spark' && pet.hp > 0 && pet.supportActive > 0) {
      ctx.strokeStyle = '#f6e56d'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(pet.x, pet.y); ctx.stroke()
    }
  }

  // 瞬间电弧与误导引线
  for (const arc of combat.arcs || []) {
    const pts = arc.points || []
    if (pts.length < 2) continue
    const alpha = Math.max(0, arc.life / Math.max(0.05, arc.maxLife))
    ctx.globalAlpha = alpha
    ctx.strokeStyle = arc.color || '#f6e56d'
    ctx.lineWidth = arc.width || 2.4
    ctx.beginPath()
    pts.forEach((pt, idx) => (idx ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)))
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // 借灵游侠 · 万灵汇聚炮 / 苍穹猎星全屏光束
  for (const beam of combat.beams || []) {
    const alpha = Math.max(0, beam.life / Math.max(0.05, beam.maxLife))
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.lineCap = 'round'
    ctx.strokeStyle = beam.color || '#8edacb'
    ctx.lineWidth = beam.width || 44
    ctx.beginPath(); ctx.moveTo(beam.x1, beam.y1); ctx.lineTo(beam.x2, beam.y2); ctx.stroke()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = Math.max(6, (beam.width || 44) * 0.34)
    ctx.beginPath(); ctx.moveTo(beam.x1, beam.y1); ctx.lineTo(beam.x2, beam.y2); ctx.stroke()
    ctx.restore()
  }

  // 霜晶咔咔 · 公转冰柱
  for (const fp of combat.frostPillars || []) {
    const px = p.x + Math.cos(fp.angle) * fp.dist
    const py = p.y + Math.sin(fp.angle) * fp.dist
    fillPath(ctx, [[px, py - 14], [px + 8, py], [px, py + 14], [px - 8, py]], '#9ad9ff', '#e8f9ff', 1.5)
  }

  // 借灵游侠 · 刃棘护身旋刺
  if (combat.route === 'ranger' && (combat.items || []).some(item => item.hp > 0 && item.type === 'bramble')) {
    const baseA = combat._brambleOrbitAngle || 0
    for (const offset of [0, Math.PI]) {
      const sx = p.x + Math.cos(baseA + offset) * 52
      const sy = p.y + Math.sin(baseA + offset) * 52
      ctx.save()
      ctx.translate(sx, sy)
      ctx.rotate(baseA * 2 + offset)
      fillPath(ctx, [[-8, 0], [0, -8], [8, 0], [0, 8]], '#74d680', '#102b18', 1.4)
      ctx.restore()
    }
  }

  ctx.restore()
}

export function renderPetShot(ctx, shot) {
  const color = PET_TYPES[shot.type]?.color || '#8edacb'
  ctx.save()
  ctx.translate(shot.x, shot.y)
  ctx.rotate(shot.angle)
  ctx.fillStyle = color
  if (shot.type === 'dew') {
    ctx.beginPath(); ctx.arc(0, 0, shot.radius + 1.5, 0, TAU); ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath(); ctx.arc(-1.2, -1.2, 1.4, 0, TAU); ctx.fill()
  } else if (shot.type === 'spore') {
    ctx.beginPath(); ctx.arc(0, 0, shot.radius + 1.5, 0, TAU); ctx.fill()
    ctx.strokeStyle = '#efe2ff'; ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.arc(0, 0, shot.radius + 3.2, 0, TAU); ctx.stroke()
  } else if (shot.type === 'ember') {
    ctx.beginPath(); ctx.arc(0, 0, shot.radius + 1.5, 0, TAU); ctx.fill()
    ctx.fillStyle = '#fff1b8'
    ctx.beginPath(); ctx.arc(1, 0, shot.radius * 0.55, 0, TAU); ctx.fill()
  } else if (shot.type === 'frost') {
    fillPath(ctx, [[7, 0], [-3, -4], [-5, 0], [-3, 4]], '#bfeaff', '#ffffff', 1.2)
  } else if (shot.type === 'bramble') {
    fillPath(ctx, [[7, 0], [-3, -3.5], [-3, 3.5]], '#74d680', '#dcffdf', 1.1)
  } else if (shot.type === 'ranger_arrow') {
    fillPath(ctx, [[9, 0], [-6, -4.2], [-3, 0], [-6, 4.2]], '#8edacb', '#ffffff', 1.2)
  } else {
    ctx.fillStyle = shot.boosted ? '#fff1b8' : color
    fillPath(ctx, [[7, 0], [-5, -3.4], [-3, 0], [-5, 3.4]], ctx.fillStyle)
  }
  ctx.restore()
}
