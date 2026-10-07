// First-chapter art direction. Static detail is baked once; only leaves and water move.
const TAU = Math.PI * 2
export const isFrontierScenery = (theme, variant) => theme === 'frontier' && variant === 'nest-border'

export function sceneryRandom(seed = 1) {
  let state = (Number(seed) || 1) >>> 0
  return () => {
    state += 0x6d2b79f5
    let t = Math.imul(state ^ (state >>> 15), state | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const range = (rng, a, b) => a + rng() * (b - a)
const oval = (ctx, x, y, rx, ry, angle = 0) => {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, angle, 0, TAU)
  ctx.fill()
}

// Rounded irregular contour with a stable phase, shared by moss, leaves and slime.
export function organicPath(ctx, x, y, rx, ry, phase = 0, strength = 0.16) {
  const points = []
  for (let i = 0; i < 20; i++) {
    const angle = i / 20 * TAU
    const r = 1 + Math.sin(angle * 3 + phase) * strength + Math.cos(angle * 7 - phase) * strength * 0.45
    points.push({ x: x + Math.cos(angle) * rx * r, y: y + Math.sin(angle) * ry * r })
  }
  ctx.beginPath()
  const last = points[points.length - 1]
  ctx.moveTo((last.x + points[0].x) / 2, (last.y + points[0].y) / 2)
  for (let i = 0; i < points.length; i++) {
    const p = points[i], next = points[(i + 1) % points.length]
    ctx.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2)
  }
  ctx.closePath()
}

export function paintFrontierGround(ctx, w, h, seed) {
  const rng = sceneryRandom(seed)
  const gradient = ctx.createLinearGradient(0, 0, w * 0.45, h)
  gradient.addColorStop(0, '#283c32')
  gradient.addColorStop(0.55, '#304234')
  gradient.addColorStop(1, '#202f2b')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)

  // Ground has three scales: linked moss banks, broken tufts, fine soil grain.
  const banks = Math.min(100, Math.ceil(w * h / 85000))
  for (let i = 0; i < banks; i++) {
    const x = rng() * w, y = rng() * h, phase = rng() * TAU
    const radius = range(rng, 75, 190)
    for (let layer = 1; layer >= 0; layer--) {
      ctx.fillStyle = ['#3c513833', '#4b60402b', '#142b2420', '#6a744a10'][i % 4]
      organicPath(ctx, x, y, radius + layer * 11, radius * 0.55 + layer * 9, phase, 0.24)
      ctx.fill()
    }
    for (let j = 0; j < 12; j++) {
      const px = x + range(rng, -radius, radius), py = y + range(rng, -radius * 0.6, radius * 0.6)
      ctx.fillStyle = j % 3 ? '#71805216' : '#0d251c20'
      organicPath(ctx, px, py, range(rng, 4, 17), range(rng, 2, 7), phase + j)
      ctx.fill()
    }
  }
  const grain = Math.min(12000, Math.ceil(w * h / 460))
  for (let i = 0; i < grain; i++) {
    ctx.fillStyle = i % 3 ? 'rgba(162,168,113,0.055)' : 'rgba(8,25,19,0.12)'
    ctx.fillRect(rng() * w, rng() * h, range(rng, 0.6, 2), range(rng, 0.5, 1.5))
  }
  const tufts = Math.min(2000, Math.ceil(w * h / 3600))
  ctx.lineWidth = 1
  for (let i = 0; i < tufts; i++) {
    const x = rng() * w, y = rng() * h
    ctx.strokeStyle = i % 3 ? '#7b885328' : '#10291f45'
    ctx.beginPath()
    ctx.moveTo(x - 3, y)
    ctx.quadraticCurveTo(x - 4, y - 3, x - 5, y - 5)
    ctx.moveTo(x, y + 1)
    ctx.quadraticCurveTo(x, y - 3, x + 2, y - 7)
    ctx.stroke()
  }
}

export function generateFrontierScenery(w, h, options = {}) {
  const rng = sceneryRandom((Number(options.seed) || 1) ^ 0x71a5)
  const bg = [{ type: 'road', woodland: true, x: w / 2, y: h / 2, length: Math.hypot(w, h) * 1.2, angle: -0.36, width: 108, s: 1, phase: 0 }]
  const fg = []
  const spawn = { x: (options.spawn?.x ?? 0.5) * w, y: (options.spawn?.y ?? 0.5) * h }
  const clear = (x, y, padding = 0) => {
    const roadDistance = Math.abs((x - w / 2) * Math.sin(0.36) + (y - h / 2) * Math.cos(0.36))
    return Math.hypot(x - spawn.x, y - spawn.y) > 200 + padding && roadDistance > 100 + padding
  }
  // A bounded number of habitat clusters rather than independent uniform scatter.
  const count = Math.min(72, Math.max(12, Math.round(w * h / 150000)))
  for (let i = 0; i < count; i++) {
    let x, y, valid = false
    for (let attempt = 0; attempt < 20; attempt++) {
      x = range(rng, 100, Math.max(101, w - 100))
      y = range(rng, 120, Math.max(121, h - 100))
      if (clear(x, y, 60) && !bg.some(item => item.type === 'woodland-tree' && Math.hypot(item.x - x, item.y - y) < 170)) { valid = true; break }
    }
    if (!valid) continue
    const phase = rng() * TAU
    const s = range(rng, 0.85, 1.35)
    if (i % 4 !== 3) {
      bg.push({ type: 'woodland-tree', x, y, s, phase })
      fg.push({ type: 'woodland-crown', x, y, s, phase })
    } else {
      bg.push({ type: 'woodland-log', x, y, s, phase })
    }
    for (let j = 0; j < 7; j++) {
      const px = x + range(rng, -105, 105), py = y + range(rng, -45, 85)
      if (!clear(px, py, 15)) continue
      const type = ['woodland-fern', 'woodland-rock', 'woodland-shrub', 'woodland-mushroom'][j % 4]
      bg.push({ type, x: px, y: py, s: range(rng, 0.65, 1.2), phase: phase + j })
      if (j === 0) fg.push({ type: 'woodland-grass', x: px + 8, y: py + 5, s: 1, phase })
    }
    if (i % 3 === 0) {
      const px = x - 55, py = y + 85
      if (clear(px, py, 30)) {
        bg.push({ type: 'woodland-pool', x: px, y: py, s: 1, phase })
        fg.push({ type: 'woodland-ripple', x: px, y: py, s: 1, phase })
      }
    }
  }
  // Invasion traces follow the road edge instead of covering the fighting lane.
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue
    const along = i * 225, side = i % 2 ? 90 : -90
    const x = w / 2 + Math.cos(-0.36) * along - Math.sin(-0.36) * side
    const y = h / 2 + Math.sin(-0.36) * along + Math.cos(-0.36) * side
    bg.push({ type: 'woodland-marker', x, y, s: 0.9, phase: i })
  }
  // Keep the existing semantic type for gameplay/tests; only its rendering changes.
  bg.push({ type: 'nest', woodland: true, x: w / 2, y: h / 2, s: 1.4, phase: 0, state: 'intact' })
  return { bg, fg }
}

export function drawWoodlandRoad(ctx, item) {
  ctx.rotate(item.angle)
  const rng = sceneryRandom(7831)
  const top = [], bottom = []
  for (let x = -item.length / 2; x <= item.length / 2 + 32; x += 32) {
    const bend = Math.sin(x * 0.004) * 17
    const half = item.width / 2 + Math.sin(x * 0.019) * 7 + rng() * 7
    top.push([x, bend - half]); bottom.push([x, bend + half])
  }
  ctx.beginPath()
  ctx.moveTo(...top[0])
  for (const p of top.slice(1)) ctx.lineTo(...p)
  for (const p of bottom.reverse()) ctx.lineTo(...p)
  ctx.closePath()
  ctx.fillStyle = '#111f1955'; ctx.lineWidth = 13; ctx.strokeStyle = '#17251c40'; ctx.stroke()
  ctx.fillStyle = '#514d38'; ctx.fill()
  ctx.save(); ctx.clip()
  for (let i = 0; i < item.length * 0.6; i++) {
    const x = range(rng, -item.length / 2, item.length / 2), y = range(rng, -75, 75)
    ctx.fillStyle = i % 3 ? '#a39b6730' : '#242f2566'
    oval(ctx, x, y, range(rng, 1, 8), range(rng, 0.6, 2.5), -0.2)
  }
  for (const offset of [-22, 22]) {
    ctx.beginPath()
    for (let x = -item.length / 2; x <= item.length / 2; x += 12) {
      const y = Math.sin(x * 0.004) * 17 + offset + Math.sin(x * 0.014) * 3
      if (x === -item.length / 2) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = '#29302570'; ctx.lineWidth = 5; ctx.stroke()
    ctx.strokeStyle = '#8c855533'; ctx.lineWidth = 1; ctx.stroke()
  }
  ctx.restore()
  for (const edge of [top, bottom]) for (let i = 0; i < edge.length; i += 2) {
    const [x, y] = edge[i]
    ctx.fillStyle = i % 4 ? '#425538' : '#354b34'
    organicPath(ctx, x, y, range(rng, 8, 24), range(rng, 3, 7), i)
    ctx.fill()
  }
}

export function drawWoodlandNest(ctx) {
  ctx.fillStyle = '#10261e85'
  organicPath(ctx, 4, 9, 105, 68, 2, 0.17); ctx.fill()
  ctx.fillStyle = '#4b633c'
  organicPath(ctx, 0, 0, 99, 63, 2, 0.17); ctx.fill()
  ctx.strokeStyle = '#81995855'; ctx.lineWidth = 2; ctx.stroke()
  ctx.fillStyle = '#63804b'
  organicPath(ctx, -4, -6, 78, 45, 2.6, 0.22); ctx.fill()
  ctx.fillStyle = '#314d32'
  organicPath(ctx, 0, 0, 53, 31, 1, 0.14); ctx.fill()
  ctx.fillStyle = '#162d24'
  oval(ctx, 0, 2, 34, 21)
  for (let i = 0; i < 11; i++) {
    const a = i / 11 * TAU, x = Math.cos(a) * 77, y = Math.sin(a) * 46
    ctx.fillStyle = i % 3 ? '#779653' : '#445c48'
    oval(ctx, x, y, 10 + i % 4, 6 + i % 3, a * 0.3)
    ctx.strokeStyle = '#a5bf6b55'; ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.ellipse(x - 1, y - 2, 7, 3, 0, Math.PI, TAU); ctx.stroke()
  }
}

export function drawWoodlandItem(ctx, item) {
  const phase = item.phase || 0
  switch (item.type) {
    case 'woodland-tree': {
      ctx.fillStyle = '#11251e55'; oval(ctx, 25, 14, 59, 18, 0.35)
      ctx.lineCap = 'round'
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * 14
        ctx.strokeStyle = '#293328'; ctx.lineWidth = 9
        ctx.beginPath(); ctx.moveTo(0, -9); ctx.quadraticCurveTo(x * 0.5, 8, x, 10 + i % 2 * 8); ctx.stroke()
        ctx.strokeStyle = '#626047'; ctx.lineWidth = 2; ctx.stroke()
      }
      ctx.fillStyle = '#413f2f'
      ctx.beginPath(); ctx.moveTo(-15, 8); ctx.lineTo(-9, -72); ctx.lineTo(9, -72); ctx.lineTo(17, 8); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#70644a'; ctx.fillRect(-8, -68, 5, 73)
      ctx.strokeStyle = '#272e25'; ctx.lineWidth = 2
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(i * 6 - 3, -60); ctx.lineTo(i * 5 - 5, 4); ctx.stroke() }
      ctx.fillStyle = '#536d3b'; organicPath(ctx, -7, -2, 13, 7, phase); ctx.fill()
      break
    }
    case 'woodland-rock': {
      ctx.fillStyle = '#11271f70'; oval(ctx, 7, 6, 24, 9, 0.2)
      ctx.fillStyle = '#394c48'
      ctx.beginPath(); ctx.moveTo(-22, 2); ctx.lineTo(-15, -16); ctx.lineTo(4, -22); ctx.lineTo(22, -8); ctx.lineTo(25, 4); ctx.lineTo(8, 10); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#59675a'
      ctx.beginPath(); ctx.moveTo(-22, 2); ctx.lineTo(-15, -16); ctx.lineTo(4, -22); ctx.lineTo(7, -8); ctx.lineTo(-3, 1); ctx.closePath(); ctx.fill()
      ctx.strokeStyle = '#84907770'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(-15, -16); ctx.lineTo(4, -22); ctx.lineTo(16, -13); ctx.stroke()
      ctx.fillStyle = '#536d3b'; organicPath(ctx, -8, 3, 14, 5, phase); ctx.fill()
      break
    }
    case 'woodland-shrub':
      ctx.fillStyle = '#10271e65'; oval(ctx, 7, 6, 32, 10)
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * 11, y = -9 - Math.sin(i * 1.4) * 8
        ctx.fillStyle = ['#345c3d', '#456b44', '#52764a'][i % 3]
        organicPath(ctx, x, y, 18, 13, phase + i); ctx.fill()
        ctx.strokeStyle = '#90a16a40'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.ellipse(x - 3, y - 4, 8, 4, -0.2, Math.PI, TAU); ctx.stroke()
      }
      break
    case 'woodland-fern':
      ctx.lineCap = 'round'
      for (let i = -2; i <= 2; i++) {
        const tx = i * 10, ty = -28 + Math.abs(i) * 5
        ctx.strokeStyle = '#658451'; ctx.lineWidth = 1.3
        ctx.beginPath(); ctx.moveTo(0, 3); ctx.quadraticCurveTo(tx * 0.4, ty, tx, ty); ctx.stroke()
        for (let j = 1; j < 5; j++) {
          const t = j / 5, x = tx * t, y = ty * t
          ctx.strokeStyle = j % 2 ? '#536e43' : '#789255'; ctx.lineWidth = 3
          ctx.beginPath(); ctx.moveTo(x - 6 * (1 - t), y - 4); ctx.lineTo(x, y); ctx.lineTo(x + 6 * (1 - t), y - 4); ctx.stroke()
        }
      }
      break
    case 'woodland-mushroom':
      for (let i = 0; i < 3; i++) {
        const x = i * 9 - 9, y = Math.sin(i * 3 + phase) * 4
        ctx.fillStyle = '#aea57b'; ctx.fillRect(x - 1, y - 6, 2, 9)
        ctx.fillStyle = '#75674a'; oval(ctx, x, y - 7, 7, 4)
        ctx.fillStyle = '#c1ac7770'; oval(ctx, x - 2, y - 9, 3, 1.3)
      }
      break
    case 'woodland-log':
      ctx.rotate(-0.28)
      ctx.fillStyle = '#10261d65'; oval(ctx, 6, 9, 54, 12)
      ctx.fillStyle = '#3c3b2d'; ctx.fillRect(-45, -14, 85, 23)
      ctx.fillStyle = '#665c41'; ctx.fillRect(-44, -13, 82, 6)
      ctx.strokeStyle = '#242d22'; ctx.lineWidth = 2
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-42, -4 + i * 5); ctx.lineTo(37, -6 + i * 5); ctx.stroke() }
      ctx.fillStyle = '#918062'; oval(ctx, 40, -2, 7, 12)
      ctx.strokeStyle = '#4b4b36'; ctx.beginPath(); ctx.ellipse(40, -2, 4, 8, 0, 0, TAU); ctx.stroke()
      ctx.fillStyle = '#557242'; organicPath(ctx, -12, -13, 28, 7, phase); ctx.fill()
      break
    case 'woodland-pool':
      ctx.fillStyle = '#172b25'; organicPath(ctx, 0, 0, 48, 23, phase); ctx.fill()
      ctx.strokeStyle = '#69734b70'; ctx.lineWidth = 4; ctx.stroke()
      ctx.fillStyle = '#375851'; organicPath(ctx, -2, -3, 43, 19, phase); ctx.fill()
      ctx.strokeStyle = '#8da79a45'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.ellipse(-8, -7, 21, 4, -0.1, Math.PI, TAU); ctx.stroke()
      break
    case 'woodland-marker':
      ctx.rotate(phase * 0.08)
      ctx.fillStyle = '#11271e55'; oval(ctx, 7, 8, 20, 7)
      ctx.fillStyle = '#5d6755'
      ctx.beginPath(); ctx.moveTo(-12, 7); ctx.lineTo(-10, -25); ctx.lineTo(2, -29); ctx.lineTo(12, -18); ctx.lineTo(11, 7); ctx.closePath(); ctx.fill()
      ctx.strokeStyle = '#94967780'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(-10, -25); ctx.lineTo(2, -29); ctx.lineTo(12, -18); ctx.stroke()
      ctx.strokeStyle = '#303e32'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(-2, -19); ctx.lineTo(3, -10); ctx.lineTo(-3, -5); ctx.lineTo(4, 4); ctx.stroke()
      ctx.fillStyle = '#697147'; organicPath(ctx, -6, 5, 13, 4, phase); ctx.fill()
      break
  }
}

const crownSprites = new Map()

function drawCrown(ctx, phase) {
  for (let i = 0; i < 7; i++) {
    const angle = i / 7 * TAU + phase * 0.15
    const x = Math.cos(angle) * 29, y = -73 + Math.sin(angle) * 22
    ctx.fillStyle = ['#244635', '#2d513b', '#365b40', '#406448'][i % 4]
    organicPath(ctx, x, y, 31 + Math.sin(phase + i) * 5, 27, phase + i, 0.1)
    ctx.fill()
    ctx.fillStyle = '#77926325'
    organicPath(ctx, x - 8, y - 10, 21, 10, phase + i)
    ctx.fill()
    // Sparse leaf marks give the canopy a material at character scale.
    ctx.strokeStyle = '#92a77428'
    ctx.lineWidth = 1.3
    for (let j = 0; j < 4; j++) {
      const lx = x - 17 + j * 8, ly = y - 7 + Math.sin(j + phase) * 5
      ctx.beginPath(); ctx.moveTo(lx - 2, ly); ctx.quadraticCurveTo(lx, ly - 3, lx + 3, ly - 2); ctx.stroke()
    }
  }
}

/** Eight bounded, shared crown variants. No path construction in the frame loop. */
export function prepareFrontierSprites(items, dpr = 1) {
  const scale = dpr > 1 ? 2 : 1
  for (const item of items) {
    if (item.type !== 'woodland-crown') continue
    const variant = Math.floor(item.phase / TAU * 8) % 8
    const key = `${scale}:${variant}`
    if (!crownSprites.has(key)) {
      const canvas = document.createElement('canvas')
      canvas.width = 190 * scale
      canvas.height = 170 * scale
      const ctx = canvas.getContext('2d')
      ctx.scale(scale, scale)
      ctx.translate(95, 145)
      drawCrown(ctx, variant / 8 * TAU)
      crownSprites.set(key, canvas)
    }
    item.crownSprite = crownSprites.get(key)
  }
}

export function drawWoodlandForeground(ctx, item, t, player, enemies = []) {
  if (item.type === 'woodland-crown') {
    // Fade over the player AND enemies so an ornamental tree cannot hide a threat.
    const distance = actor => Math.hypot((actor.x - item.x) / (item.s * 78), (actor.y - item.y + item.s * 73) / (item.s * 60))
    let near = player ? distance(player) : 10
    for (const enemy of enemies) {
      if (!enemy.active || Math.abs(enemy.x - item.x) > 150 || Math.abs(enemy.y - item.y) > 200) continue
      near = Math.min(near, distance(enemy))
    }
    ctx.globalAlpha = 0.18 + 0.7 * Math.max(0, Math.min(1, (near - 0.7) / 0.65))
    const sway = Math.sin(t * 0.65 + item.phase) * 1.1
    ctx.translate(sway, 0)
    if (item.crownSprite) ctx.drawImage(item.crownSprite, -95, -145, 190, 170)
    else drawCrown(ctx, item.phase)
  } else if (item.type === 'woodland-grass') {
    ctx.strokeStyle = '#81925888'; ctx.lineWidth = 1.3
    const sway = Math.sin(t * 1.2 + item.phase) * 2
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(i * 4, 0); ctx.quadraticCurveTo(i * 5, -9, i * 6 + sway, -15 + Math.abs(i) * 2); ctx.stroke()
    }
  } else if (item.type === 'woodland-ripple') {
    const life = ((t * 0.16 + item.phase) % 1 + 1) % 1
    ctx.strokeStyle = `rgba(166,192,176,${Math.sin(life * Math.PI) * 0.18})`
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.ellipse(-8, 1, 3 + life * 23, 1 + life * 8, 0, 0, TAU); ctx.stroke()
  }
}
