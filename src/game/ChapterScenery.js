import { sceneryRandom, organicPath, paintFrontierGround } from './FrontierScenery.js'

const TAU = Math.PI * 2
const palettes = {
  frontier: { ground: ['#293d32', '#22352c'], bank: '#577348', light: '#8a9d6b', stone: '#606954', dark: '#26382c', accent: '#a28a58' },
  blight: { ground: ['#30343d', '#252e32'], bank: '#655574', light: '#a296ae', stone: '#696672', dark: '#292d39', accent: '#91ae84' },
  royal: { ground: ['#363e45', '#283238'], bank: '#56645d', light: '#9b9e92', stone: '#6b7475', dark: '#303c43', accent: '#b39863' },
}

// The same material language, with different silhouettes and floor plans per chapter.
export const CHAPTER_SCENES = {
  'camp-road': { kind: 'camp', prop: 'tent', cloth: '#7b6550' },
  'marsh-edge': { kind: 'marsh', prop: 'tree' },
  'blight-garden': { kind: 'garden', prop: 'fungus' },
  'slime-nest': { kind: 'nest', prop: 'fungus' },
  'slime-nest-sieged': { kind: 'nest', prop: 'fungus', cloth: '#9a6f4d' },
  'outer-bailey': { kind: 'court', prop: 'pillar', cloth: '#835453' },
  'reliquary': { kind: 'hall', prop: 'relic', cloth: '#647f80', ground: ['#3d4242', '#303735'] },
  'sanctum': { kind: 'sanctum', prop: 'pillar', cloth: '#917a58', ground: ['#403d39', '#302f30'] },
  'royal-crypt': { kind: 'crypt', prop: 'tomb', cloth: '#637c83', ground: ['#303c44', '#252e37'] },
  'seal-chamber': { kind: 'seal', prop: 'obelisk', cloth: '#648e89', ground: ['#2f4140', '#273333'] },
  'throne-gallery': { kind: 'gallery', prop: 'pillar', cloth: '#785365', ground: ['#3b3b46', '#2c303b'] },
  'war-camp': { kind: 'camp', prop: 'tent', cloth: '#84564c', ground: ['#414037', '#31362f'] },
  'shattered-court': { kind: 'throne', prop: 'pillar', cloth: '#795455', ground: ['#3e4045', '#30333a'] },
}

const palette = theme => palettes[theme] || palettes.frontier
const scene = variant => CHAPTER_SCENES[variant] || CHAPTER_SCENES['marsh-edge']
const oval = (ctx, x, y, rx, ry) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill() }
const contour = (ctx, x, y, rx, ry, phase) => { organicPath(ctx, x, y, rx, ry, phase); ctx.fill() }
const polygon = (ctx, points) => {
  ctx.beginPath(); ctx.moveTo(...points[0]); for (const p of points.slice(1)) ctx.lineTo(...p); ctx.closePath(); ctx.fill()
}

export function paintChapterGround(ctx, w, h, seed, theme, variant) {
  if (theme === 'frontier') { paintFrontierGround(ctx, w, h, seed); return }
  const p = palette(theme), spec = scene(variant), rng = sceneryRandom(seed)
  const stoneFloor = theme === 'royal' || ['crypt', 'seal'].includes(spec.kind)
  const gradient = ctx.createLinearGradient(0, 0, w * 0.3, h)
  gradient.addColorStop(0, (spec.ground || p.ground)[0]); gradient.addColorStop(1, (spec.ground || p.ground)[1])
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h)
  if (stoneFloor) {
    // Wide worn slabs: joints have low contrast so they never resemble a combat grid.
    const tile = Math.max(88, Math.ceil(Math.sqrt(w * h / 1700)))
    for (let y = 0, row = 0; y < h; y += tile * 0.58, row++) {
      for (let x = -(row % 2) * tile * 0.5; x < w; x += tile) {
        ctx.fillStyle = rng() > 0.5 ? '#a0aaa307' : '#101a2310'
        ctx.fillRect(x + 2, y + 2, tile - 4, tile * 0.58 - 4)
        ctx.strokeStyle = '#a0afa411'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(x + 5, y + 3); ctx.lineTo(x + tile - 6, y + 3); ctx.stroke()
        if (rng() < 0.22) {
          ctx.strokeStyle = '#14202955'
          ctx.beginPath(); ctx.moveTo(x + tile * 0.3, y + 3); ctx.lineTo(x + tile * 0.45, y + 13); ctx.lineTo(x + tile * 0.4, y + 26); ctx.stroke()
        }
      }
    }
  }
  for (let i = 0, count = Math.min(80, Math.ceil(w * h / 90000)); i < count; i++) {
    const x = rng() * w, y = rng() * h, r = 70 + rng() * 125
    ctx.fillStyle = i % 3 ? p.bank + '1b' : '#12232b1b'
    contour(ctx, x, y, r, r * 0.54, i)
    ctx.fillStyle = p.light + '0c'; contour(ctx, x - 9, y - 6, r * 0.85, r * 0.4, i)
    if (!stoneFloor) {
      ctx.strokeStyle = '#91a68620'; ctx.lineWidth = 1.4
      for (let j = 0; j < 7; j++) {
        const dx = (rng() - 0.5) * r * 2, dy = (rng() - 0.5) * r
        ctx.beginPath(); ctx.moveTo(x + dx, y + dy); ctx.quadraticCurveTo(x + dx - 12, y + dy - 12, x + dx + 18, y + dy - 23); ctx.stroke()
      }
    }
  }
  if (['sanctum', 'seal', 'throne'].includes(spec.kind)) {
    ctx.save(); ctx.translate(w / 2, h / 2)
    ctx.strokeStyle = p.accent + '27'; ctx.lineWidth = 3
    for (const radius of [220, 236, 310]) { ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.stroke() }
    for (let i = 0; i < 12; i++) {
      ctx.save(); ctx.rotate(i / 12 * TAU)
      ctx.strokeRect(-6, 253, 12, 24); ctx.restore()
    }
    ctx.restore()
  }
  if (spec.kind === 'gallery' || spec.kind === 'crypt') {
    ctx.fillStyle = spec.kind === 'gallery' ? '#77505a28' : '#111d2730'
    ctx.fillRect(w / 2 - 120, 0, 240, h)
    ctx.fillStyle = p.accent + '30'
    ctx.fillRect(w / 2 - 122, 0, 2, h); ctx.fillRect(w / 2 + 120, 0, 2, h)
  }
  for (let i = 0, n = Math.min(10000, Math.ceil(w * h / 650)); i < n; i++) {
    ctx.fillStyle = i % 3 ? p.light + '0d' : '#101c2426'
    ctx.fillRect(rng() * w, rng() * h, 0.7 + rng() * 2, 0.6 + rng())
  }
}

/** Retain semantic landmarks; group supporting scenery away from roads and spawn. */
export function enrichChapterDecor(bg, fg, w, h, options) {
  const { themeId: theme, variant } = options, spec = scene(variant)
  const rng = sceneryRandom((Number(options.seed) || 1) ^ [...variant].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619), 2166136261))
  const filler = new Set(['patch', 'pebble', 'trunk', 'fungus-stem', 'stone-slab', 'puddle', 'reeds'])
  const kept = bg.filter(item => !filler.has(item.type))
  bg.splice(0, bg.length, ...kept); fg.length = 0
  for (const item of bg) Object.assign(item, { chapter: true, theme, variant })
  const spawn = { x: (options.spawn?.x ?? 0.5) * w, y: (options.spawn?.y ?? 0.5) * h }
  const roads = bg.filter(item => item.type === 'road')
  const clear = (x, y, margin = 0) => {
    if (x < 70 || x > w - 70 || y < 110 || y > h - 70) return false
    if (Math.hypot(x - spawn.x, y - spawn.y) < 210 + margin) return false
    if (Math.hypot(x - w / 2, y - h / 2) < 210 + margin) return false
    return roads.every(road => Math.abs(-(x - road.x) * Math.sin(road.angle) + (y - road.y) * Math.cos(road.angle)) > road.width / 2 + 65 + margin)
  }
  const anchors = []
  const count = Math.min(52, Math.max(14, Math.round(w * h / 145000)))
  const ordered = ['hall', 'crypt', 'gallery', 'sanctum', 'seal', 'throne'].includes(spec.kind)
  for (let i = 0; i < count; i++) {
    let x, y, valid = false
    for (let attempt = 0; attempt < 24; attempt++) {
      if (ordered && attempt === 0) {
        x = w / 2 + (i % 2 ? 1 : -1) * (285 + Math.floor(i / 12) * 270)
        y = 150 + Math.floor(i % 12 / 2) * (h - 300) / 5
      } else { x = 100 + rng() * (w - 200); y = 150 + rng() * (h - 250) }
      if (clear(x, y, 65) && anchors.every(a => Math.hypot(a.x - x, a.y - y) > 185)) { valid = true; break }
    }
    if (!valid) continue
    anchors.push({ x, y })
    const item = { x, y, s: 0.85 + rng() * 0.35, phase: rng() * TAU, theme, variant, chapter: true }
    const prop = theme === 'frontier' && i % 3 !== 0 ? 'tree' : spec.prop
    bg.push({ ...item, type: 'chapter-footing' })
    if (prop === 'tree') {
      bg.push({ ...item, type: 'woodland-tree' }); fg.push({ ...item, type: 'woodland-crown' })
    } else {
      fg.push({ ...item, type: 'chapter-prop', prop })
    }
    for (let j = 0; j < 5; j++) {
      const px = x + (rng() - 0.5) * 210, py = y + (rng() - 0.3) * 120
      if (!clear(px, py, 12)) continue
      const type = theme === 'frontier' ? ['woodland-fern', 'woodland-rock', 'woodland-shrub'][j % 3] : j % 2 ? 'chapter-shards' : 'chapter-growth'
      bg.push({ ...item, type, x: px, y: py, phase: item.phase + j, s: 0.6 + rng() * 0.5 })
    }
    if (i % 3 === 0 && clear(x - 70, y + 85, 25)) {
      const water = theme !== 'royal' && !['crypt', 'seal'].includes(spec.kind)
      const detail = { ...item, x: x - 70, y: y + 85, s: 1, water }
      bg.push({ ...detail, type: water ? 'chapter-pool' : 'chapter-brazier' })
      fg.push({ ...detail, type: 'chapter-glimmer' })
    }
  }
  return { bg, fg }
}

function block(ctx, x, y, w, h, p) {
  ctx.fillStyle = p.dark; ctx.fillRect(x, y + 6, w, h)
  ctx.fillStyle = p.stone; ctx.fillRect(x, y, w, h)
  ctx.fillStyle = p.light + '60'; ctx.fillRect(x + 2, y, w - 4, 2)
  ctx.fillStyle = '#14212c45'; ctx.fillRect(x + w - 5, y + 2, 5, h - 2)
}

function drawProp(ctx, prop, p, spec, phase) {
  ctx.fillStyle = '#101f2a55'; oval(ctx, 10, 4, 46, 15)
  if (prop === 'fungus') {
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 30, y = (i === 1 ? -58 : -31) + Math.sin(phase + i) * 6, r = (i === 1 ? 42 : 25) + Math.cos(phase + i) * 3
      ctx.fillStyle = '#696578'; polygon(ctx, [[x - 6, 0], [x - 9, y], [x + 7, y], [x + 5, 0]])
      ctx.strokeStyle = '#a39aab70'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 3, -3); ctx.lineTo(x - 5, y); ctx.stroke()
      ctx.fillStyle = '#383348'; oval(ctx, x, y + 4, r, r * 0.43)
      ctx.fillStyle = '#786483'; contour(ctx, x, y - 4, r, r * 0.48, phase + i)
      ctx.fillStyle = '#ab8caa55'; contour(ctx, x - 8, y - 10, r * 0.6, r * 0.2, phase + i)
      for (let j = 0; j < 5; j++) { ctx.fillStyle = '#aec49b88'; oval(ctx, x - r * 0.6 + j * r * 0.28, y - 3 + Math.sin(j + phase) * 4, 2, 1.2) }
      ctx.strokeStyle = '#b1b79c40'; ctx.lineWidth = 1
      for (let j = -2; j <= 2; j++) { ctx.beginPath(); ctx.moveTo(x, y + 10); ctx.lineTo(x + j * r * 0.36, y + 3); ctx.stroke() }
    }
  } else if (prop === 'tent') {
    ctx.fillStyle = spec.cloth || '#77634c'
    polygon(ctx, [[-52, 5], [-20, -51], [24, -44], [60, 8]])
    ctx.fillStyle = '#403d3b'; polygon(ctx, [[-52, 5], [-20, -51], [5, 8]])
    ctx.fillStyle = '#1e2b2c'; polygon(ctx, [[-37, 5], [-20, -29], [-7, 6]])
    ctx.strokeStyle = '#b7a38280'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(-61, 12); ctx.lineTo(-20, -51); ctx.lineTo(24, -44); ctx.lineTo(68, 13); ctx.stroke()
    ctx.strokeStyle = '#30333370'; ctx.beginPath(); ctx.moveTo(0, -43); ctx.lineTo(26, 6); ctx.moveTo(16, -43); ctx.lineTo(43, 7); ctx.stroke()
    block(ctx, 43, 13, 24, 16, { ...p, stone: '#756448', dark: '#403f33' })
    ctx.strokeStyle = '#b49c6360'; ctx.strokeRect(46, 14, 18, 13)
  } else if (prop === 'pillar') {
    block(ctx, -25, -2, 50, 17, p); block(ctx, -19, -12, 38, 12, p)
    if (phase > 3) {
      block(ctx, -14, -43, 28, 31, p)
      ctx.fillStyle = p.light + '88'; polygon(ctx, [[-14, -43], [-8, -51], [2, -42], [9, -47], [14, -43]])
      ctx.save(); ctx.translate(32, 9); ctx.rotate(0.3); block(ctx, -11, -20, 23, 37, p); ctx.restore()
      return
    }
    block(ctx, -14, -78, 28, 66, p)
    ctx.strokeStyle = p.dark; ctx.lineWidth = 2
    for (const x of [-7, 1, 8]) { ctx.beginPath(); ctx.moveTo(x, -70); ctx.lineTo(x, -18); ctx.stroke() }
    block(ctx, -22, -85, 44, 10, p)
    ctx.fillStyle = spec.cloth || '#785759'
    polygon(ctx, [[2, -70], [27, -70], [25, -28], [16, -33], [6, -26]])
    ctx.strokeStyle = p.accent + 'aa'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(13, -59); ctx.lineTo(19, -51); ctx.lineTo(13, -44); ctx.lineTo(8, -51); ctx.closePath(); ctx.stroke()
    ctx.strokeStyle = p.dark; ctx.beginPath(); ctx.moveTo(-14, -34); ctx.lineTo(-3, -41); ctx.lineTo(-7, -49); ctx.stroke()
  } else if (prop === 'tomb' || prop === 'relic') {
    block(ctx, -48, -9, 96, 29, p); block(ctx, -43, -19, 86, 27, p)
    ctx.strokeStyle = p.accent + '90'; ctx.lineWidth = 2; ctx.strokeRect(-35, -13, 70, 14)
    ctx.fillStyle = p.dark
    if (prop === 'tomb') {
      oval(ctx, 0, -18, 6, 7); polygon(ctx, [[-5, -12], [-11, 0], [12, 0], [5, -12]])
      ctx.strokeStyle = p.light + '70'; ctx.beginPath(); ctx.moveTo(-24, -16); ctx.lineTo(-10, -6); ctx.lineTo(-15, 7); ctx.stroke()
    } else {
      ctx.fillRect(-29, -10, 58, 13); ctx.fillStyle = '#a9b7aa'; polygon(ctx, [[0, -32], [10, -18], [0, -6], [-9, -18]])
      ctx.fillStyle = '#d0bf8380'; oval(ctx, -19, -5, 5, 2); oval(ctx, 23, -6, 5, 3)
    }
  } else if (prop === 'obelisk') {
    block(ctx, -27, 0, 54, 15, p)
    ctx.fillStyle = p.stone; polygon(ctx, [[-17, 0], [-13, -66], [0, -85], [16, -65], [20, 0]])
    ctx.fillStyle = p.dark; polygon(ctx, [[0, -85], [16, -65], [20, 0], [3, 0]])
    ctx.strokeStyle = '#91b7a899'; ctx.lineWidth = 2
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-6, -53 + i * 15); ctx.lineTo(0, -59 + i * 15); ctx.lineTo(5, -52 + i * 15); ctx.stroke() }
  }
}

/** Called inside the item's local transform. False delegates to the established landmark renderer. */
export function drawChapterItem(ctx, item) {
  const p = palette(item.theme), spec = scene(item.variant)
  switch (item.type) {
    case 'chapter-footing':
      ctx.fillStyle = '#111e2638'; contour(ctx, 8, 7, 82, 35, item.phase)
      ctx.fillStyle = p.bank + '60'; contour(ctx, -3, 4, 57, 22, item.phase)
      return true
    case 'chapter-shards':
      for (let i = 0; i < 5; i++) { ctx.save(); ctx.translate(i * 12 - 22, Math.sin(i * 4 + item.phase) * 9); ctx.rotate(i * 0.5); block(ctx, -8, -5, 12 + i % 3 * 4, 8, p); ctx.restore() }
      return true
    case 'chapter-growth':
      if (item.theme === 'blight') {
        for (let i = 0; i < 5; i++) {
          const x = i * 9 - 18, y = Math.sin(i + item.phase) * 5
          ctx.fillStyle = '#777181'; ctx.fillRect(x - 1, y - 10, 2, 13)
          ctx.fillStyle = i % 2 ? '#8c748b' : '#73897c'; oval(ctx, x, y - 11, 9, 4)
          ctx.fillStyle = '#b3b6a966'; oval(ctx, x - 2, y - 13, 4, 1.2)
        }
      } else {
        ctx.fillStyle = '#60706370'; contour(ctx, 0, 3, 28, 10, item.phase)
        for (let i = -3; i <= 3; i++) { ctx.strokeStyle = '#81917770'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(i * 5, 2); ctx.lineTo(i * 7, -8 - Math.sin(i + item.phase) * 6); ctx.stroke() }
      }
      return true
    case 'chapter-pool':
      ctx.fillStyle = p.dark; contour(ctx, 0, 0, 53, 27, item.phase)
      ctx.strokeStyle = p.light + '55'; ctx.lineWidth = 3; ctx.stroke()
      ctx.fillStyle = item.theme === 'blight' ? '#52675b' : '#395b51'; contour(ctx, -2, -3, 47, 22, item.phase)
      ctx.strokeStyle = '#adbaa050'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(-8, -7, 29, 8, 0, Math.PI, TAU); ctx.stroke()
      return true
    case 'chapter-brazier':
      block(ctx, -12, -4, 24, 14, p); ctx.fillStyle = '#212c31'; oval(ctx, 0, -5, 17, 9)
      ctx.fillStyle = '#9f7757'; oval(ctx, 0, -6, 10, 4)
      return true
    case 'road':
      if (item.theme === 'frontier') return false
      ctx.rotate(item.angle)
      ctx.fillStyle = '#7e888327'; ctx.fillRect(-item.length / 2, -item.width / 2, item.length, item.width)
      for (const sign of [-1, 1]) {
        ctx.fillStyle = '#a6a78b35'; ctx.fillRect(-item.length / 2, sign * item.width / 2, item.length, 4)
        ctx.fillStyle = '#131f2944'; ctx.fillRect(-item.length / 2, sign * item.width / 2 + 4, item.length, 2)
      }
      return true
    case 'camp': case 'hunter-camp':
      drawProp(ctx, 'tent', p, spec, item.phase); return true
    case 'royal-tomb': case 'reliquary-vault':
      drawProp(ctx, item.type === 'royal-tomb' ? 'tomb' : 'relic', p, spec, item.phase); return true
    case 'seal-obelisk':
      drawProp(ctx, 'obelisk', p, spec, item.phase); return true
    case 'sanctum-altar':
      block(ctx, -62, 14, 124, 16, p); block(ctx, -51, 0, 102, 16, p); block(ctx, -43, -12, 86, 13, p)
      ctx.fillStyle = '#b49a5866'; oval(ctx, 0, -10, 27, 10)
      ctx.strokeStyle = '#ccb880aa'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, -10, 27, 10, 0, 0, TAU); ctx.stroke()
      return true
    case 'gate-breach':
      for (const side of [-1, 1]) for (let row = 0; row < 5; row++) {
        block(ctx, side * 75 - 25 + (row % 2) * 4, -66 + row * 25, 49, 22, p)
        block(ctx, side * 110 - 12, -58 + row * 25, 24, 22, p)
      }
      return true
    case 'throne':
      block(ctx, -50, 20, 100, 13, p); block(ctx, -38, 6, 76, 15, p)
      block(ctx, -25, -49, 50, 55, { ...p, stone: '#716657' })
      ctx.fillStyle = spec.cloth; ctx.fillRect(-17, -40, 34, 43)
      for (const x of [-30, 20]) block(ctx, x, -23, 10, 35, p)
      ctx.strokeStyle = p.accent; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(-14, -49); ctx.lineTo(-11, -64); ctx.lineTo(0, -54); ctx.lineTo(12, -64); ctx.lineTo(16, -49); ctx.stroke()
      return true
    default: return false
  }
}

const sprites = new Map()
export function prepareChapterSprites(items, dpr = 1) {
  const scale = dpr > 1 ? 2 : 1
  for (const item of items) {
    if (item.type !== 'chapter-prop') continue
    const variation = Math.floor(((item.phase || 0) % TAU + TAU) % TAU / TAU * 3)
    const key = `${scale}:${item.theme}:${item.variant}:${item.prop}:${variation}`
    if (!sprites.has(key)) {
      const canvas = document.createElement('canvas'); canvas.width = 180 * scale; canvas.height = 160 * scale
      const ctx = canvas.getContext('2d'); ctx.scale(scale, scale); ctx.translate(90, 125)
      drawProp(ctx, item.prop, palette(item.theme), scene(item.variant), variation * 2)
      sprites.set(key, canvas)
    }
    item.sprite = sprites.get(key)
  }
}

export function chapterPropAlpha(item, player, enemies = []) {
  const distance = a => Math.hypot((a.x - item.x) / (item.s * 90), (a.y - item.y + 35 * item.s) / (item.s * 90))
  let near = player ? distance(player) : 10
  for (const enemy of enemies) if (enemy.active && Math.abs(enemy.x - item.x) < 180 && Math.abs(enemy.y - item.y) < 200) near = Math.min(near, distance(enemy))
  return 0.18 + 0.72 * Math.max(0, Math.min(1, (near - 0.65) / 0.65))
}

export function drawChapterForeground(ctx, item, time, player, enemies) {
  if (item.type === 'chapter-prop') {
    ctx.globalAlpha = chapterPropAlpha(item, player, enemies)
    if (item.sprite) ctx.drawImage(item.sprite, -90, -125, 180, 160)
    else drawProp(ctx, item.prop, palette(item.theme), scene(item.variant), 1)
  } else if (item.type === 'chapter-glimmer') {
    const life = ((time * 0.18 + item.phase) % 1 + 1) % 1
    if (item.water) {
      ctx.strokeStyle = `rgba(172,192,169,${Math.sin(life * Math.PI) * 0.2})`; ctx.lineWidth = 1
      ctx.beginPath(); ctx.ellipse(-6, -1, 4 + life * 26, 2 + life * 9, 0, 0, TAU); ctx.stroke()
    } else {
      ctx.fillStyle = '#d6a777aa'; oval(ctx, 0, -10, 3 + Math.sin(time * 3 + item.phase), 5)
      ctx.fillStyle = '#f1d19b99'; oval(ctx, 0, -12, 1.5, 3)
    }
  }
}
