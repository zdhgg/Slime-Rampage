const TAU = Math.PI * 2

const LOOK = {
  guardian: { base: '#e3b96e', light: '#ffe4a1', shade: '#9d713f', edge: '#674c35', eye: '#273b34' },
  hunter: { base: '#83d3bd', light: '#d5fff0', shade: '#4a9c8d', edge: '#315e57', eye: '#203d3a' },
  dew: { base: '#8fd7e8', light: '#e4fbff', shade: '#5099b4', edge: '#356a7d', eye: '#24495a' },
  spore: { base: '#c3a4dc', light: '#f0ddf8', shade: '#866aa4', edge: '#59466f', eye: '#303047' },
}

function fillPath(ctx, points, fill, stroke, width = 1.5) {
  ctx.beginPath()
  points(ctx)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke() }
}

function drawEyes(ctx, look, y = 2) {
  ctx.fillStyle = look.eye
  for (const x of [-5.5, 5.5]) {
    ctx.beginPath(); ctx.ellipse(x, y, 2.25, 3, 0, 0, TAU); ctx.fill()
  }
  ctx.fillStyle = '#fff9e9'
  for (const x of [-6.2, 4.8]) {
    ctx.beginPath(); ctx.arc(x, y - 1.2, 0.85, 0, TAU); ctx.fill()
  }
}

function drawGuardian(ctx, look) {
  const body = ctx.createLinearGradient(-12, -16, 13, 14)
  body.addColorStop(0, look.light)
  body.addColorStop(0.48, look.base)
  body.addColorStop(1, look.shade)
  fillPath(ctx, path => {
    path.moveTo(-19, 9)
    path.bezierCurveTo(-21, 3, -17, -12, -8, -16)
    path.bezierCurveTo(-2, -19, 9, -17, 14, -10)
    path.bezierCurveTo(18, -4, 21, 5, 18, 10)
    path.bezierCurveTo(16, 15, 9, 14, 2, 13)
    path.bezierCurveTo(-5, 15, -15, 16, -19, 9)
  }, body, look.edge, 1.7)

  // A few large stone planes read as armor even when the pet is small.
  fillPath(ctx, path => {
    path.moveTo(-15, -8)
    path.lineTo(-7, -15)
    path.lineTo(3, -17)
    path.lineTo(11, -13)
    path.lineTo(16, -5)
    path.lineTo(7, -6)
    path.lineTo(1, -2)
    path.lineTo(-7, -6)
  }, '#a7804d', look.edge, 1.25)
  fillPath(ctx, path => {
    path.moveTo(-7, -15)
    path.lineTo(3, -17)
    path.lineTo(11, -13)
    path.lineTo(1, -10)
    path.lineTo(-2, -5)
  }, '#e8c17b', null)
  ctx.strokeStyle = '#fff0b7'; ctx.lineWidth = 1.25; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(-8, -11); ctx.lineTo(-4, -14); ctx.stroke()

  drawEyes(ctx, look, 3)
  ctx.strokeStyle = look.edge; ctx.lineWidth = 1.25
  ctx.beginPath(); ctx.arc(0, 6, 2.4, 0.12, Math.PI - 0.12); ctx.stroke()
  ctx.fillStyle = '#fff1bf85'
  ctx.beginPath(); ctx.ellipse(-12, 5, 2.5, 1.7, 0, 0, TAU); ctx.fill()
  ctx.beginPath(); ctx.ellipse(12, 5, 2.5, 1.7, 0, 0, TAU); ctx.fill()
}

function drawHunter(ctx, look) {
  // The leaf tips and slim tail make this partner distinct from the armored dome.
  fillPath(ctx, path => {
    path.moveTo(-10, -8)
    path.bezierCurveTo(-14, -15, -12, -23, -7, -27)
    path.bezierCurveTo(-2, -24, -1, -17, -2, -10)
  }, '#69b8a2', look.edge, 1.3)
  fillPath(ctx, path => {
    path.moveTo(2, -11)
    path.bezierCurveTo(4, -19, 11, -24, 17, -25)
    path.bezierCurveTo(17, -17, 13, -11, 8, -7)
  }, '#a5e7c9', look.edge, 1.3)
  fillPath(ctx, path => {
    path.moveTo(13, 3)
    path.quadraticCurveTo(23, 2, 23, -5)
    path.quadraticCurveTo(26, 8, 17, 11)
  }, '#5aa795', look.edge, 1.1)

  const body = ctx.createLinearGradient(-11, -16, 12, 14)
  body.addColorStop(0, look.light)
  body.addColorStop(0.5, look.base)
  body.addColorStop(1, look.shade)
  fillPath(ctx, path => {
    path.moveTo(-17, 9)
    path.bezierCurveTo(-19, 2, -15, -10, -7, -14)
    path.bezierCurveTo(0, -18, 10, -13, 15, -5)
    path.bezierCurveTo(19, 2, 18, 11, 11, 13)
    path.bezierCurveTo(4, 15, -4, 14, -11, 13)
    path.quadraticCurveTo(-16, 13, -17, 9)
  }, body, look.edge, 1.7)

  ctx.strokeStyle = '#e8fff0'; ctx.lineWidth = 1.3; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(9, -19); ctx.quadraticCurveTo(7, -15, 5, -12); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(-11, -8); ctx.quadraticCurveTo(-7, -13, -2, -12); ctx.stroke()
  drawEyes(ctx, look, 2)
  ctx.strokeStyle = look.edge; ctx.lineWidth = 1.1
  ctx.beginPath(); ctx.arc(0, 5, 2, 0.1, Math.PI - 0.1); ctx.stroke()
}

function drawDew(ctx, look) {
  const body = ctx.createLinearGradient(-12, -18, 12, 15)
  body.addColorStop(0, look.light)
  body.addColorStop(0.5, look.base)
  body.addColorStop(1, look.shade)
  fillPath(ctx, path => {
    path.moveTo(-17, 9)
    path.bezierCurveTo(-19, 2, -13, -9, -5, -13)
    path.quadraticCurveTo(-2, -21, 3, -27)
    path.quadraticCurveTo(4, -17, 11, -12)
    path.bezierCurveTo(18, -6, 20, 7, 16, 12)
    path.bezierCurveTo(11, 16, -9, 16, -15, 12)
  }, body, look.edge, 1.7)
  ctx.fillStyle = 'rgba(255,255,255,0.46)'
  ctx.beginPath(); ctx.ellipse(-8, -7, 5, 7, -0.45, 0, TAU); ctx.fill()
  ctx.beginPath(); ctx.arc(8, -9, 2.1, 0, TAU); ctx.fill()
  drawEyes(ctx, look, 3)
  ctx.strokeStyle = look.edge; ctx.lineWidth = 1.1
  ctx.beginPath(); ctx.arc(0, 6, 2.2, 0.1, Math.PI - 0.1); ctx.stroke()
}

function drawSpore(ctx, look) {
  const body = ctx.createLinearGradient(-10, -13, 12, 14)
  body.addColorStop(0, look.light)
  body.addColorStop(0.6, look.base)
  body.addColorStop(1, look.shade)
  fillPath(ctx, path => {
    path.moveTo(-15, 10)
    path.bezierCurveTo(-17, 2, -12, -10, -4, -12)
    path.bezierCurveTo(4, -15, 14, -8, 16, 3)
    path.quadraticCurveTo(20, 15, 10, 14)
    path.quadraticCurveTo(-11, 16, -15, 10)
  }, body, look.edge, 1.6)
  fillPath(ctx, path => {
    path.moveTo(-20, -5)
    path.bezierCurveTo(-17, -19, -8, -25, 1, -25)
    path.bezierCurveTo(11, -25, 19, -17, 21, -5)
    path.quadraticCurveTo(13, 1, 2, -3)
    path.quadraticCurveTo(-8, 2, -20, -5)
  }, '#8c6eaa', look.edge, 1.7)
  ctx.fillStyle = '#e9d4f3'
  for (const [x, y, r] of [[-8, -14, 2.5], [2, -18, 3.2], [12, -12, 2.2]]) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill()
  }
  ctx.strokeStyle = '#e7cdf2'; ctx.lineWidth = 1.3
  ctx.beginPath(); ctx.moveTo(-16, -5); ctx.quadraticCurveTo(0, -1, 17, -5); ctx.stroke()
  drawEyes(ctx, look, 5)
  ctx.strokeStyle = look.edge; ctx.lineWidth = 1.1
  ctx.beginPath(); ctx.arc(0, 8, 1.8, 0.1, Math.PI - 0.1); ctx.stroke()
}

export function renderPet(ctx, pet, recovery, time = 0, rallyTime = 0) {
  const look = LOOK[pet.type]
  if (!look) return
  ctx.save()
  ctx.translate(pet.x, pet.y)

  ctx.fillStyle = 'rgba(6, 25, 20, 0.34)'
  ctx.beginPath(); ctx.ellipse(0, 13, 19, 5.5, 0, 0, TAU); ctx.fill()

  if (rallyTime > 0 && pet.down <= 0) {
    ctx.save()
    ctx.globalAlpha = 0.18 + Math.sin(time * 5 + pet.id) * 0.04
    ctx.strokeStyle = '#f7d48a'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.ellipse(0, 14, 23, 7, 0, 0, TAU); ctx.stroke()
    ctx.restore()
    ctx.globalAlpha = 0.65
    ctx.strokeStyle = '#f7d48a'
    ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.arc(0, -1, 23, -0.8, 1.75); ctx.stroke()
    ctx.beginPath(); ctx.arc(0, -1, 23, 2.25, 4.7); ctx.stroke()
    ctx.fillStyle = '#ffe4a1'
    const lift = (time * 13 + pet.id * 6) % 12
    ctx.beginPath(); ctx.arc(-18, -14 - lift, 1.5, 0, TAU); ctx.fill()
    ctx.beginPath(); ctx.arc(19, -8 - lift, 1, 0, TAU); ctx.fill()
    ctx.globalAlpha = 1
  }

  ctx.globalAlpha = pet.down > 0 ? 0.48 : 1
  if (pet.down > 0) {
    ctx.translate(0, 7)
    ctx.scale(1.06, 0.47)
  } else {
    ctx.translate(0, Math.sin(time * 4 + pet.id * 1.7) * 1.1)
    if (pet.support) {
      const k = 1 - Math.max(0, pet.support.time) / pet.support.maxTime
      if (pet.type === 'guardian') ctx.scale(1 + k * .22, 1 - k * .25)
      else if (pet.type === 'hunter') { ctx.rotate(Math.sin(k * Math.PI * 2) * .16); ctx.translate(0, -k * 3) }
      else if (pet.type === 'dew') { ctx.translate(0, -k * 4); ctx.scale(1 + k * .12, 1 + k * .15) }
      else { ctx.translate(0, k * 3); ctx.scale(1 + k * .2, 1 - k * .2) }
    } else if (pet.supportFx > .3) {
      const recoil = (pet.supportFx - .3) / .25
      ctx.translate(0, -Math.sin(recoil * Math.PI) * (pet.type === 'guardian' ? 4 : 2))
    } else if (pet.attack) {
      const k = 1 - Math.max(0, pet.attack.time) / pet.attack.maxTime
      if (pet.type === 'guardian') {
        ctx.translate(Math.cos(pet.angle) * k * 7, Math.sin(pet.angle) * k * 7)
        ctx.rotate(pet.angle)
        ctx.scale(1 + k * 0.17, 1 - k * 0.18)
        ctx.rotate(-pet.angle)
      } else if (pet.type === 'hunter') {
        ctx.translate(-Math.cos(pet.angle) * k * 4, -Math.sin(pet.angle) * k * 4)
        ctx.rotate(Math.cos(pet.angle) * -0.12 * k)
      } else if (pet.type === 'dew') {
        ctx.scale(1 + k * 0.09, 1 + k * 0.12)
      } else {
        ctx.scale(1 + k * 0.16, 1 - k * 0.14)
      }
    }
  }

  if (pet.flash > 0 && pet.down <= 0) ctx.filter = 'brightness(1.5)'
  if (pet.type === 'guardian') drawGuardian(ctx, look)
  else if (pet.type === 'hunter') drawHunter(ctx, look)
  else if (pet.type === 'dew') drawDew(ctx, look)
  else drawSpore(ctx, look)
  ctx.restore()

  if (pet.down <= 0) renderSupport(ctx, pet, look, time)

  if (pet.down <= 0 && pet.attack && pet.type !== 'guardian') {
    const charge = 1 - Math.max(0, pet.attack.time) / pet.attack.maxTime
    ctx.save()
    ctx.globalAlpha = 0.45 + charge * 0.5
    ctx.fillStyle = rallyTime > 0 ? '#fff2ba' : look.light
    ctx.beginPath()
    ctx.arc(pet.x + Math.cos(pet.angle) * 20, pet.y + Math.sin(pet.angle) * 20 - 3, 2 + charge * 2.5, 0, TAU)
    ctx.fill()
    ctx.restore()
  }

  if (pet.down <= 0 && pet.attackFx > 0) {
    const fade = Math.min(1, pet.attackFx / 0.18)
    const angle = pet.attackAngle ?? pet.angle
    ctx.save()
    ctx.translate(pet.x, pet.y)
    ctx.globalAlpha = fade * 0.82
    ctx.strokeStyle = look.light
    ctx.lineCap = 'round'
    if (pet.type === 'guardian') {
      ctx.lineWidth = pet.attackBoosted ? 4 : 3
      ctx.beginPath(); ctx.arc(0, 0, 25, angle - 0.72, angle + 0.72); ctx.stroke()
      ctx.lineWidth = 1.5
      for (const spread of [-0.45, 0.45]) {
        const a = angle + spread
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * 24, Math.sin(a) * 24)
        ctx.lineTo(Math.cos(a) * 31, Math.sin(a) * 31); ctx.stroke()
      }
    } else if (pet.type === 'hunter') {
      ctx.lineWidth = pet.attackBoosted ? 3.5 : 2.5
      ctx.beginPath(); ctx.moveTo(Math.cos(angle) * 14, Math.sin(angle) * 14)
      ctx.lineTo(Math.cos(angle) * 30, Math.sin(angle) * 30); ctx.stroke()
    } else {
      ctx.lineWidth = pet.attackBoosted ? 3 : 2
      const x = Math.cos(angle) * 24, y = Math.sin(angle) * 24
      ctx.beginPath(); ctx.arc(x, y, pet.type === 'dew' ? 8 : 11, angle - 0.9, angle + 0.9); ctx.stroke()
      if (pet.type === 'spore') {
        ctx.fillStyle = look.light
        for (const spread of [-0.4, 0.4]) {
          const a = angle + spread
          ctx.beginPath(); ctx.arc(Math.cos(a) * 32, Math.sin(a) * 32, 2, 0, TAU); ctx.fill()
        }
      }
    }
    ctx.restore()
  }

  // The HUD carries the permanent status; world bars appear only after damage.
  if (pet.down <= 0 && pet.hp < pet.maxHp) {
    const x = pet.x - 17, y = pet.y - (pet.type === 'hunter' || pet.type === 'dew' ? 37 : pet.type === 'spore' ? 34 : 29)
    ctx.fillStyle = 'rgba(7, 20, 17, 0.8)'; ctx.fillRect(x - 1, y - 1, 36, 5)
    ctx.fillStyle = look.base; ctx.fillRect(x, y, 34 * Math.max(0, pet.hp / pet.maxHp), 3)
  } else if (pet.down > 0) {
    ctx.strokeStyle = look.base; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(pet.x, pet.y - 2, 24, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - pet.down / recovery)); ctx.stroke()
  }
}

function renderSupport(ctx, pet, look, time) {
  if (!pet.support && !(pet.supportFx > 0) && !(pet.type === 'guardian' && pet.supportActive > 0)) return
  ctx.save()
  ctx.strokeStyle = look.light; ctx.fillStyle = look.base; ctx.lineWidth = 1.5
  if (pet.support) {
    const charge = 1 - Math.max(0, pet.support.time) / pet.support.maxTime
    ctx.globalAlpha = .3 + charge * .5
    ctx.beginPath(); ctx.ellipse(pet.x, pet.y + 13, 23 + charge * 8, 7 + charge * 3, 0, 0, TAU); ctx.stroke()
    for (let i = 0; i < 3; i++) {
      const angle = i * TAU / 3 + charge * 2
      ctx.beginPath(); ctx.arc(pet.x + Math.cos(angle) * 25, pet.y - 6 + Math.sin(angle) * 14, 1.5 + charge, 0, TAU); ctx.fill()
    }
  }
  if (pet.type === 'guardian' && pet.supportActive > 0) {
    ctx.globalAlpha = .55 + Math.sin(time * 6) * .1
    ctx.strokeStyle = look.light; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(pet.x, pet.y - 1, 25, -.9, .9); ctx.stroke()
    ctx.beginPath(); ctx.arc(pet.x, pet.y - 1, 25, Math.PI - .9, Math.PI + .9); ctx.stroke()
    // A compact crest indicates active taunt without obscuring the fight.
    fillPath(ctx, path => {
      path.moveTo(pet.x + 21, pet.y - 22); path.lineTo(pet.x + 31, pet.y - 22)
      path.lineTo(pet.x + 30, pet.y - 15); path.lineTo(pet.x + 26, pet.y - 12); path.lineTo(pet.x + 22, pet.y - 15)
    }, look.base, look.edge, 1)
  }
  if (pet.supportFx > 0) {
    const progress = 1 - pet.supportFx / .55
    ctx.globalAlpha = (1 - progress) * .65
    if (pet.type === 'guardian') {
      for (const offset of [0, 13]) {
        ctx.beginPath(); ctx.ellipse(pet.x, pet.y + 12, 22 + progress * 48 + offset, 7 + progress * 15 + offset / 3, 0, 0, TAU); ctx.stroke()
      }
    }
    for (const target of pet.supportTargets || []) {
      if (pet.type === 'dew') {
        ctx.strokeStyle = look.light; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(pet.x, pet.y - 8)
        ctx.quadraticCurveTo((pet.x + target.x) / 2, Math.min(pet.y, target.y) - 35, target.x, target.y - 8); ctx.stroke()
        ctx.lineWidth = 2.5
        const y = target.y - 35 - progress * 10
        ctx.beginPath(); ctx.moveTo(target.x - 4, y); ctx.lineTo(target.x + 4, y)
        ctx.moveTo(target.x, y - 4); ctx.lineTo(target.x, y + 4); ctx.stroke()
      } else if (target.active && pet.type === 'hunter') {
        ctx.strokeStyle = look.light
        for (let i = 0; i < 2; i++) {
          const y = target.y - 10 + i * 10
          ctx.beginPath(); ctx.moveTo(target.x - 25 + progress * 9, y)
          ctx.bezierCurveTo(target.x - 9, y - 12, target.x + 8, y + 12, target.x + 25 - progress * 9, y); ctx.stroke()
        }
      } else if (target.active && pet.type === 'spore') {
        ctx.save(); ctx.globalAlpha *= .45
        for (let i = 0; i < 4; i++) {
          const angle = i * TAU / 4 + progress
          const x = target.x + Math.cos(angle) * (14 + progress * 10)
          const y = target.y + Math.sin(angle) * 8 - progress * 15
          ctx.beginPath(); ctx.ellipse(x, y, 8 + progress * 6, 5 + progress * 3, 0, 0, TAU); ctx.fill()
        }
        ctx.restore()
      }
    }
  }
  ctx.restore()
}

export function renderPetShot(ctx, shot) {
  ctx.save()
  ctx.translate(shot.x, shot.y)
  ctx.rotate(shot.angle)
  ctx.globalAlpha = Math.min(1, shot.life / 0.15)
  const scale = shot.boosted ? 1.15 : 1
  ctx.scale(scale, scale)
  const look = LOOK[shot.type] || LOOK.hunter
  ctx.strokeStyle = shot.boosted ? '#f8e6aa' : look.base
  ctx.lineWidth = shot.boosted ? 2.5 : 1.8
  ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(-19, 0); ctx.lineTo(-6, 0); ctx.stroke()
  if (shot.type === 'dew') {
    ctx.fillStyle = shot.boosted ? '#e5ffff' : look.base
    ctx.strokeStyle = look.edge; ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(1, 0, 5.3, 0, TAU); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.arc(-1, -2, 1.8, 0, TAU); ctx.fill()
    ctx.beginPath(); ctx.arc(-12, -4, 1.5, 0, TAU); ctx.fill()
  } else if (shot.type === 'spore') {
    ctx.fillStyle = shot.boosted ? '#f3ddff' : look.base
    ctx.strokeStyle = look.edge; ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(1, 0, 5, 0, TAU); ctx.fill(); ctx.stroke()
    ctx.fillStyle = look.light
    for (const [x, y] of [[-2, -2], [2, 1], [7, -3]]) {
      ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill()
    }
  } else {
    ctx.fillStyle = shot.boosted ? '#f8e6aa' : '#a9efda'
    ctx.strokeStyle = '#427e6f'; ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(8, 0)
    ctx.quadraticCurveTo(-1, -6, -7, -3)
    ctx.quadraticCurveTo(-5, 4, 8, 0)
    ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.strokeStyle = '#e8fff0'; ctx.lineWidth = 0.8
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(6, 0); ctx.stroke()
  }
  ctx.restore()
}
