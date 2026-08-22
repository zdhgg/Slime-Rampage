const TAU = Math.PI * 2

export const MAP_THEMES = {
  frontier: {
    id: 'frontier',
    name: '湿苔边境',
    ground: ['#18261a', '#0b120d'],
    grid: 'rgba(205, 225, 198, 0.025)',
    speck: 'rgba(220, 232, 214, 0.025)',
    patch: 'rgba(8, 18, 11, 0.5)',
    stone: ['#1b2529', '#29353a'],
    plant: ['#17341e', '#24502c'],
    accent: '#668f65',
    water: ['rgba(36, 81, 83, 0.34)', 'rgba(97, 145, 137, 0.18)'],
  },
  blight: {
    id: 'blight',
    name: '腐化洞庭',
    ground: ['#202321', '#0d1110'],
    grid: 'rgba(207, 225, 190, 0.022)',
    speck: 'rgba(205, 230, 184, 0.025)',
    patch: 'rgba(24, 12, 28, 0.34)',
    stone: ['#24262b', '#34343b'],
    plant: ['#29361f', '#455b2d'],
    accent: '#8a6f9f',
    water: ['rgba(83, 101, 43, 0.34)', 'rgba(155, 178, 69, 0.16)'],
  },
  royal: {
    id: 'royal',
    name: '王城废垒',
    ground: ['#22252a', '#101216'],
    grid: 'rgba(224, 222, 207, 0.028)',
    speck: 'rgba(226, 220, 196, 0.025)',
    patch: 'rgba(8, 9, 12, 0.4)',
    stone: ['#2c3037', '#41464e'],
    plant: ['#252f28', '#344138'],
    accent: '#a88c58',
    water: ['rgba(45, 58, 69, 0.32)', 'rgba(113, 126, 132, 0.13)'],
  },
}

export const MAP_THEME_IDS = Object.keys(MAP_THEMES)

export function getMapTheme(id) {
  return MAP_THEMES[id] || MAP_THEMES.frontier
}

function hashSeed(seed, text) {
  let h = (Number(seed) || 1) >>> 0
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function seededRandom(seed) {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const between = (rng, min, max) => min + rng() * (max - min)

function scatter(bg, rng, type, count, w, h, margin, scale = [0.7, 1.35]) {
  for (let i = 0; i < count; i++) {
    bg.push({
      type,
      x: between(rng, margin, w - margin),
      y: between(rng, margin, h - margin),
      s: between(rng, scale[0], scale[1]),
      phase: between(rng, 0, TAU),
    })
  }
}

/** 主题与变体驱动的地图清单；同一局 seed 下 resize 前后保持稳定。 */
export function generateDecor(w, h, options = {}) {
  const themeId = options.themeId || 'frontier'
  const variant = options.variant || 'marsh-edge'
  const rng = seededRandom(hashSeed(options.seed, `${themeId}:${variant}`))
  const bg = []
  const fg = []

  if (variant === 'nest-border') {
    bg.push({ type: 'road', x: w / 2, y: h / 2, length: Math.max(w, h) * 1.35, angle: -0.36, width: 105 })
    bg.push({ type: 'nest', x: w / 2, y: h / 2, s: 1.4, phase: 0, state: 'intact' })
    scatter(bg, rng, 'slime-vein', 12, w, h, 90, [0.9, 1.55])
    scatter(bg, rng, 'boundary-stone', 10, w, h, 130, [0.8, 1.2])
  } else if (variant === 'camp-road') {
    bg.push({ type: 'road', x: w / 2, y: h / 2, length: Math.max(w, h) * 1.35, angle: -0.42, width: 150 })
    bg.push({ type: 'camp', x: w / 2, y: h / 2, s: 1.25, phase: -0.42 })
    scatter(bg, rng, 'stake', 12, w, h, 90, [0.8, 1.2])
    scatter(bg, rng, 'rune', 5, w, h, 160, [0.8, 1.25])
  } else if (variant === 'slime-nest' || variant === 'slime-nest-sieged') {
    bg.push({
      type: 'nest',
      x: w / 2,
      y: h / 2,
      s: 1.35,
      phase: 0,
      state: variant === 'slime-nest-sieged' ? 'sieged' : 'intact',
    })
    if (variant === 'slime-nest-sieged') {
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * TAU + Math.PI / 6
        bg.push({
          type: 'purifier-stake',
          x: w / 2 + Math.cos(angle) * 165,
          y: h / 2 + Math.sin(angle) * 125,
          s: 0.9 + (i % 2) * 0.12,
          phase: angle,
        })
      }
    }
    scatter(bg, rng, 'slime-vein', 15, w, h, 80, [0.9, 1.7])
  } else if (variant === 'outer-bailey') {
    bg.push({ type: 'road', x: w / 2, y: h / 2, length: Math.max(w, h) * 1.4, angle: 0.08, width: 190 })
    bg.push({ type: 'gate-breach', x: w * 0.56, y: h / 2, s: 1.35, phase: 0.08 })
    scatter(bg, rng, 'rubble', 18, w, h, 60, [0.7, 1.35])
    scatter(bg, rng, 'banner-pole', 8, w, h, 130, [0.9, 1.2])
  } else if (variant === 'shattered-court') {
    bg.push({ type: 'court', x: w / 2, y: h / 2, s: 1.5, phase: 0 })
    bg.push({ type: 'throne', x: w / 2, y: h / 2 - 95, s: 1.3, phase: 0 })
    scatter(bg, rng, 'rubble', 22, w, h, 60, [0.65, 1.3])
    scatter(bg, rng, 'sigil', 7, w, h, 150, [0.75, 1.25])
  } else if (variant === 'blight-garden') {
    bg.push({ type: 'hunter-camp', x: w / 2, y: h / 2, s: 1.25, phase: 0 })
    scatter(bg, rng, 'fissure', 14, w, h, 70, [0.8, 1.5])
    scatter(bg, rng, 'bone', 16, w, h, 60, [0.7, 1.25])
  } else if (variant === 'reliquary') {
    // 圣物洗劫（远征插章）：倾倒的圣物与崩落的石雕
    bg.push({ type: 'reliquary-vault', x: w / 2, y: h / 2, s: 1.25, phase: 0 })
    scatter(bg, rng, 'rubble', 15, w, h, 60, [0.7, 1.3])
    scatter(bg, rng, 'sigil', 10, w, h, 140, [0.8, 1.2])
    scatter(bg, rng, 'banner-pole', 6, w, h, 130, [0.9, 1.15])
  } else if (variant === 'sanctum') {
    // 圣殿禁卫（远征插章）：中央祭坛 + 环列符文
    bg.push({ type: 'court', x: w / 2, y: h / 2, s: 1.1, phase: 0 })
    bg.push({ type: 'sanctum-altar', x: w / 2, y: h / 2, s: 1.15, phase: 0 })
    scatter(bg, rng, 'rune', 12, w, h, 120, [0.8, 1.25])
    scatter(bg, rng, 'sigil', 8, w, h, 150, [0.75, 1.2])
  } else if (variant === 'throne-gallery') {
    // 王座回廊（远征插章）：十字长廊 + 密集军旗
    bg.push({ type: 'road', x: w / 2, y: h / 2, length: Math.max(w, h) * 1.4, angle: 0.55, width: 170 })
    bg.push({ type: 'road', x: w / 2, y: h / 2, length: Math.max(w, h) * 1.4, angle: 0.55 + Math.PI / 2, width: 170 })
    bg.push({ type: 'throne', x: w / 2, y: h / 2, s: 1.18, phase: 0 })
    scatter(bg, rng, 'banner-pole', 14, w, h, 120, [0.9, 1.2])
    scatter(bg, rng, 'sigil', 9, w, h, 150, [0.75, 1.2])
  } else if (variant === 'royal-crypt') {
    // 王陵惊魂（远征插章）：先王石棺群与裂开的墓道
    bg.push({ type: 'royal-tomb', x: w / 2, y: h / 2, s: 1.24, phase: -0.12 })
    scatter(bg, rng, 'bone', 20, w, h, 60, [0.7, 1.25])
    scatter(bg, rng, 'fissure', 10, w, h, 80, [0.8, 1.4])
    scatter(bg, rng, 'sigil', 6, w, h, 150, [0.75, 1.15])
  } else if (variant === 'seal-chamber') {
    // 地窖封印（远征插章）：中央黏液巢口 + 环列封印符文
    bg.push({ type: 'nest', x: w / 2, y: h / 2, s: 1.15, phase: 0 })
    bg.push({ type: 'seal-obelisk', x: w / 2, y: h / 2 - 82, s: 1.05, phase: 0 })
    scatter(bg, rng, 'rune', 10, w, h, 130, [0.8, 1.25])
    scatter(bg, rng, 'fissure', 12, w, h, 70, [0.8, 1.45])
  } else if (variant === 'war-camp') {
    // 终焉动员（远征插章）：拒马防线与连营军旗
    bg.push({ type: 'war-table', x: w / 2, y: h / 2, s: 1.2, phase: 0.08 })
    scatter(bg, rng, 'stake', 14, w, h, 90, [0.8, 1.2])
    scatter(bg, rng, 'banner-pole', 12, w, h, 120, [0.9, 1.2])
    scatter(bg, rng, 'rubble', 10, w, h, 60, [0.65, 1.2])
  } else {
    scatter(bg, rng, 'puddle', 13, w, h, 80, [0.8, 1.6])
    scatter(bg, rng, 'reeds', 26, w, h, 40, [0.7, 1.35])
  }

  scatter(bg, rng, 'patch', themeId === 'royal' ? 8 : 12, w, h, 55, [0.8, 1.7])
  scatter(bg, rng, 'pebble', themeId === 'royal' ? 20 : 13, w, h, 35, [0.55, 1.2])

  if (themeId === 'frontier') {
    for (let i = 0; i < 6; i++) {
      const item = {
        x: between(rng, 100, w - 100),
        y: between(rng, 100, h - 100),
        s: between(rng, 0.9, 1.35),
        phase: between(rng, 0, TAU),
      }
      bg.push({ ...item, type: 'trunk' })
      fg.push({ ...item, type: 'canopy' })
    }
  } else if (themeId === 'blight') {
    scatter(bg, rng, 'fungus-stem', 18, w, h, 55, [0.65, 1.2])
    scatter(fg, rng, 'fungus-cap', 8, w, h, 70, [0.75, 1.25])
  } else {
    scatter(bg, rng, 'stone-slab', 26, w, h, 45, [0.65, 1.25])
    scatter(fg, rng, 'torn-banner', 6, w, h, 120, [0.8, 1.15])
  }

  // 出生点是战斗可读性的空白区：保留主地标与道路，其余随机装饰推离中心。
  // 只调整坐标不删项，确保同一 seed 在不同尺寸下的装饰拓扑稳定。
  const spawnX = (options.spawn?.x ?? 0.5) * w
  const spawnY = (options.spawn?.y ?? 0.5) * h
  const safeRadius = 150
  const anchored = new Set([
    'road', 'nest', 'court', 'purifier-stake', 'camp', 'hunter-camp', 'gate-breach',
    'throne', 'reliquary-vault', 'sanctum-altar', 'royal-tomb', 'seal-obelisk', 'war-table',
  ])
  for (const item of [...bg, ...fg]) {
    if (anchored.has(item.type)) continue
    const dx = item.x - spawnX
    const dy = item.y - spawnY
    const d2 = dx * dx + dy * dy
    if (d2 >= safeRadius * safeRadius) continue
    const angle = d2 > 1 ? Math.atan2(dy, dx) : item.phase || 0
    item.x = Math.max(35, Math.min(w - 35, spawnX + Math.cos(angle) * safeRadius))
    item.y = Math.max(35, Math.min(h - 35, spawnY + Math.sin(angle) * safeRadius))
  }

  return { bg, fg }
}

function ellipse(ctx, x, y, rx, ry, rotation = 0) {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, rotation, 0, TAU)
  ctx.fill()
}

/** 绘制一次性烘焙进离屏背景的装饰。 */
export function drawBgItem(ctx, item, themeId = 'frontier') {
  const theme = getMapTheme(typeof themeId === 'string' ? themeId : themeId?.id)
  ctx.save()
  ctx.translate(item.x, item.y)
  ctx.scale(item.s || 1, item.s || 1)

  switch (item.type) {
    case 'patch':
      ctx.fillStyle = theme.patch
      ellipse(ctx, 0, 0, 25, 14, 0.3)
      break
    case 'pebble':
      ctx.fillStyle = theme.stone[0]
      ellipse(ctx, 0, 1, 7, 5)
      ctx.fillStyle = theme.stone[1]
      ellipse(ctx, -1, -1, 5, 3, 0.2)
      break
    case 'puddle':
      ctx.fillStyle = theme.water[0]
      ellipse(ctx, 0, 0, 28, 14, item.phase * 0.15)
      ctx.strokeStyle = theme.water[1]
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.ellipse(0, 0, 20, 8, item.phase * 0.15, 0, TAU)
      ctx.stroke()
      break
    case 'reeds':
      ctx.strokeStyle = theme.accent
      ctx.globalAlpha = 0.46
      ctx.lineWidth = 1.5
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath()
        ctx.moveTo(i * 4, 5)
        ctx.quadraticCurveTo(i * 5 + 2, -3, i * 4 + 1, -11)
        ctx.stroke()
      }
      break
    case 'trunk':
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'
      ellipse(ctx, 0, 0, 10, 3.5)
      ctx.fillStyle = '#30251d'
      ctx.fillRect(-4, -20, 8, 20)
      break
    case 'road':
      ctx.rotate(item.angle)
      ctx.fillStyle = theme.id === 'royal' ? 'rgba(105, 108, 112, 0.12)' : 'rgba(111, 91, 65, 0.12)'
      ctx.fillRect(-item.length / 2, -item.width / 2, item.length, item.width)
      ctx.strokeStyle = 'rgba(225, 220, 200, 0.045)'
      ctx.lineWidth = 2
      for (let x = -item.length / 2; x < item.length / 2; x += 64) {
        ctx.beginPath()
        ctx.moveTo(x, -item.width / 2)
        ctx.lineTo(x + 18, item.width / 2)
        ctx.stroke()
      }
      break
    case 'stake':
      ctx.rotate(item.phase)
      ctx.fillStyle = '#4a3525'
      ctx.fillRect(-2, -13, 4, 26)
      ctx.fillStyle = '#6a4b31'
      ctx.beginPath()
      ctx.moveTo(-3, -13)
      ctx.lineTo(0, -19)
      ctx.lineTo(3, -13)
      ctx.fill()
      break
    case 'rune':
    case 'sigil': {
      const color = item.type === 'rune' ? '#5b94a4' : theme.accent
      ctx.strokeStyle = color
      ctx.globalAlpha = item.type === 'rune' ? 0.22 : 0.18
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(0, 0, item.type === 'rune' ? 16 : 23, 0, TAU)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-10, 0)
      ctx.lineTo(0, -12)
      ctx.lineTo(10, 0)
      ctx.lineTo(0, 12)
      ctx.closePath()
      ctx.stroke()
      break
    }
    case 'fissure':
      ctx.strokeStyle = 'rgba(157, 184, 75, 0.25)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(-18, -8)
      ctx.lineTo(-5, -2)
      ctx.lineTo(2, -8)
      ctx.lineTo(8, 2)
      ctx.lineTo(20, 7)
      ctx.stroke()
      break
    case 'bone':
      ctx.rotate(item.phase)
      ctx.strokeStyle = 'rgba(193, 191, 165, 0.34)'
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(-9, 0)
      ctx.lineTo(9, 0)
      ctx.stroke()
      break
    case 'slime-vein':
      ctx.rotate(item.phase)
      ctx.strokeStyle = 'rgba(126, 190, 77, 0.18)'
      ctx.lineWidth = 5
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(-25, 0)
      ctx.quadraticCurveTo(0, -10, 25, 5)
      ctx.stroke()
      break
    case 'boundary-stone':
      ctx.rotate(item.phase * 0.15)
      ctx.fillStyle = 'rgba(31, 43, 36, 0.82)'
      ctx.fillRect(-8, -11, 16, 22)
      ctx.strokeStyle = 'rgba(144, 187, 109, 0.25)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(-4, 5)
      ctx.lineTo(0, -6)
      ctx.lineTo(4, 5)
      ctx.stroke()
      break
    case 'purifier-stake':
      ctx.rotate(item.phase + Math.PI / 2)
      ctx.fillStyle = '#594b3c'
      ctx.fillRect(-3, -22, 6, 35)
      ctx.fillStyle = 'rgba(197, 112, 68, 0.48)'
      ctx.beginPath()
      ctx.moveTo(0, -30)
      ctx.lineTo(8, -18)
      ctx.lineTo(0, -10)
      ctx.lineTo(-8, -18)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(255, 202, 120, 0.48)'
      ctx.lineWidth = 1.5
      ctx.stroke()
      break
    case 'nest':
      ctx.fillStyle = item.state === 'sieged' ? 'rgba(77, 93, 54, 0.18)' : 'rgba(93, 139, 58, 0.2)'
      ellipse(ctx, 0, 0, 90, 58)
      ctx.strokeStyle = item.state === 'sieged' ? 'rgba(179, 119, 72, 0.27)' : 'rgba(159, 211, 102, 0.28)'
      ctx.lineWidth = 6
      for (let i = 0; i < 3; i++) {
        ctx.beginPath()
        ctx.arc(0, 0, 32 + i * 18, 0, TAU)
        ctx.stroke()
      }
      ctx.fillStyle = item.state === 'sieged' ? 'rgba(47, 35, 31, 0.7)' : 'rgba(70, 112, 46, 0.52)'
      ellipse(ctx, 0, 2, 28, 19)
      if (item.state === 'sieged') {
        ctx.strokeStyle = 'rgba(218, 135, 77, 0.42)'
        ctx.lineWidth = 3
        for (let i = 0; i < 4; i++) {
          ctx.beginPath()
          ctx.moveTo(-10 + i * 7, -12)
          ctx.lineTo(-18 + i * 11, -35 - (i % 2) * 8)
          ctx.stroke()
        }
      } else {
        ctx.fillStyle = 'rgba(196, 238, 137, 0.28)'
        ellipse(ctx, -8, -5, 8, 5, -0.3)
      }
      break
    case 'fungus-stem':
      ctx.fillStyle = '#343047'
      ctx.fillRect(-2, -9, 4, 10)
      ctx.fillStyle = 'rgba(142, 103, 162, 0.48)'
      ellipse(ctx, 0, -10, 8, 4)
      break
    case 'stone-slab':
      ctx.rotate(item.phase)
      ctx.fillStyle = 'rgba(104, 109, 116, 0.12)'
      ctx.fillRect(-13, -9, 26, 18)
      ctx.strokeStyle = 'rgba(194, 190, 175, 0.08)'
      ctx.strokeRect(-13, -9, 26, 18)
      break
    case 'rubble':
      ctx.fillStyle = theme.stone[1]
      ctx.globalAlpha = 0.55
      ctx.fillRect(-8, -5, 10, 8)
      ctx.fillRect(4, 0, 7, 5)
      ctx.fillRect(-2, 4, 6, 4)
      break
    case 'banner-pole':
      ctx.fillStyle = '#554837'
      ctx.fillRect(-1.5, -24, 3, 28)
      ctx.fillStyle = 'rgba(128, 45, 45, 0.48)'
      ctx.fillRect(2, -22, 13, 9)
      break
    case 'court':
      ctx.fillStyle = 'rgba(104, 108, 114, 0.1)'
      ellipse(ctx, 0, 0, 120, 120)
      ctx.strokeStyle = 'rgba(191, 180, 151, 0.16)'
      ctx.lineWidth = 3
      for (let i = 0; i < 3; i++) {
        ctx.beginPath()
        ctx.arc(0, 0, 55 + i * 31, 0, TAU)
        ctx.stroke()
      }
      break
    case 'camp':
    case 'hunter-camp': {
      const hunter = item.type === 'hunter-camp'
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)'
      ellipse(ctx, 0, 12, 68, 25)
      ctx.fillStyle = hunter ? 'rgba(76, 55, 61, 0.78)' : 'rgba(78, 68, 52, 0.78)'
      ctx.beginPath()
      ctx.moveTo(-48, 13)
      ctx.lineTo(-17, -31)
      ctx.lineTo(15, 13)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = hunter ? '#80545f' : '#8b7657'
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.fillStyle = 'rgba(24, 19, 18, 0.72)'
      ctx.fillRect(-18, -4, 17, 18)
      ctx.fillStyle = hunter ? 'rgba(132, 67, 67, 0.58)' : 'rgba(164, 112, 58, 0.46)'
      ctx.fillRect(24, -25, 25, 12)
      ctx.fillStyle = '#62503a'
      ctx.fillRect(20, -31, 3, 46)
      ctx.fillStyle = 'rgba(206, 116, 65, 0.55)'
      ellipse(ctx, 31, 9, 10, 5)
      break
    }
    case 'gate-breach':
      ctx.rotate(item.phase)
      ctx.fillStyle = 'rgba(38, 41, 47, 0.86)'
      ctx.fillRect(-98, -62, 64, 124)
      ctx.fillRect(34, -62, 64, 124)
      ctx.fillStyle = 'rgba(91, 96, 105, 0.45)'
      for (let y = -54; y < 55; y += 24) {
        ctx.fillRect(-91 + ((y / 24) % 2) * 8, y, 48, 14)
        ctx.fillRect(43 - ((y / 24) % 2) * 8, y, 48, 14)
      }
      ctx.fillStyle = 'rgba(23, 25, 29, 0.72)'
      ctx.beginPath()
      ctx.moveTo(-35, -62)
      ctx.lineTo(-12, -48)
      ctx.lineTo(0, -63)
      ctx.lineTo(16, -43)
      ctx.lineTo(34, -62)
      ctx.lineTo(34, 62)
      ctx.lineTo(-35, 62)
      ctx.closePath()
      ctx.fill()
      break
    case 'throne':
      ctx.fillStyle = 'rgba(8, 9, 12, 0.3)'
      ellipse(ctx, 0, 23, 48, 16)
      ctx.fillStyle = 'rgba(72, 66, 62, 0.58)'
      ctx.fillRect(-35, 14, 70, 12)
      ctx.fillRect(-27, 2, 54, 12)
      ctx.fillStyle = 'rgba(91, 72, 58, 0.72)'
      ctx.fillRect(-20, -27, 40, 32)
      ctx.fillRect(-24, -49, 9, 54)
      ctx.fillRect(15, -49, 9, 54)
      ctx.strokeStyle = 'rgba(183, 151, 89, 0.38)'
      ctx.lineWidth = 2
      ctx.strokeRect(-20, -27, 40, 32)
      break
    case 'reliquary-vault':
      ctx.fillStyle = 'rgba(61, 63, 69, 0.76)'
      ctx.fillRect(-48, -28, 96, 56)
      ctx.fillStyle = 'rgba(18, 20, 24, 0.66)'
      ctx.fillRect(-39, -19, 78, 38)
      ctx.strokeStyle = 'rgba(187, 151, 83, 0.48)'
      ctx.lineWidth = 4
      ctx.strokeRect(-48, -28, 96, 56)
      ctx.beginPath()
      ctx.moveTo(0, -25)
      ctx.lineTo(0, 24)
      ctx.stroke()
      break
    case 'sanctum-altar':
      ctx.fillStyle = 'rgba(79, 80, 84, 0.72)'
      ctx.fillRect(-50, 10, 100, 18)
      ctx.fillRect(-37, -4, 74, 15)
      ctx.fillStyle = 'rgba(190, 148, 75, 0.26)'
      ellipse(ctx, 0, -8, 27, 12)
      ctx.strokeStyle = 'rgba(233, 190, 98, 0.44)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(0, -8, 18, 0, TAU)
      ctx.stroke()
      break
    case 'royal-tomb':
      ctx.rotate(item.phase)
      ctx.fillStyle = 'rgba(42, 45, 49, 0.76)'
      ctx.fillRect(-54, -28, 108, 56)
      ctx.fillStyle = 'rgba(84, 87, 90, 0.5)'
      ctx.fillRect(-45, -35, 90, 15)
      ctx.strokeStyle = 'rgba(170, 170, 151, 0.28)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(-16, -20)
      ctx.lineTo(0, 7)
      ctx.lineTo(16, -20)
      ctx.stroke()
      break
    case 'seal-obelisk':
      ctx.fillStyle = 'rgba(34, 37, 43, 0.84)'
      ctx.beginPath()
      ctx.moveTo(0, -43)
      ctx.lineTo(18, 24)
      ctx.lineTo(-18, 24)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(91, 148, 164, 0.45)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(0, -25)
      ctx.lineTo(8, 3)
      ctx.lineTo(0, 14)
      ctx.lineTo(-8, 3)
      ctx.closePath()
      ctx.stroke()
      break
    case 'war-table':
      ctx.rotate(item.phase)
      ctx.fillStyle = 'rgba(62, 46, 34, 0.84)'
      ctx.fillRect(-52, -31, 104, 62)
      ctx.fillStyle = 'rgba(132, 113, 78, 0.32)'
      ctx.fillRect(-45, -24, 90, 48)
      ctx.strokeStyle = 'rgba(177, 61, 55, 0.48)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(-31, 13)
      ctx.lineTo(-8, -12)
      ctx.lineTo(16, 5)
      ctx.lineTo(35, -17)
      ctx.stroke()
      break
  }
  ctx.restore()
}

/** 少量前景遮挡；透明度受控，避免掩盖敌人、弹幕和对白。 */
export function drawFgItem(ctx, item, t, themeId = 'frontier') {
  const theme = getMapTheme(typeof themeId === 'string' ? themeId : themeId?.id)
  const sway = Math.sin(t + item.phase) * 1.5
  ctx.save()
  ctx.translate(item.x + sway, item.y)
  ctx.scale(item.s, item.s)

  if (item.type === 'canopy') {
    ctx.globalAlpha = 0.32
    ctx.fillStyle = theme.plant[0]
    ellipse(ctx, 0, -28, 15, 15)
    ctx.fillStyle = theme.plant[1]
    ellipse(ctx, -9, -24, 11, 10)
    ellipse(ctx, 9, -24, 11, 10)
  } else if (item.type === 'fungus-cap') {
    ctx.globalAlpha = 0.34
    ctx.fillStyle = '#3a334c'
    ctx.fillRect(-3, -28, 6, 28)
    ctx.fillStyle = '#735880'
    ellipse(ctx, 0, -29, 18, 8)
    ctx.fillStyle = 'rgba(184, 207, 116, 0.28)'
    ellipse(ctx, -5, -31, 4, 2)
  } else if (item.type === 'torn-banner') {
    ctx.globalAlpha = 0.34
    ctx.fillStyle = '#5b5142'
    ctx.fillRect(-2, -45, 4, 48)
    ctx.fillStyle = '#713f3d'
    ctx.beginPath()
    ctx.moveTo(3, -42)
    ctx.lineTo(27, -39 + sway)
    ctx.lineTo(20, -22)
    ctx.lineTo(3, -25)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}
