import { organicPath, sceneryRandom } from '../../FrontierScenery.js'
import { projectTowerDefensePoint } from './TowerDefenseLayout.js'

const TAU = Math.PI * 2
export const TD_SCENERY_PALETTES = {
  1: { ground: ['#2b4133', '#1c3029'], soil: '#72815a', road: '#63533c', edge: '#3f4d35', detail: '#9b9273', dark: '#283c2d', stone: '#69715d', light: '#9aa780' },
  2: { ground: ['#344d5b', '#233742'], soil: '#91a9ad', road: '#617e89', edge: '#3d5867', detail: '#b0c6c9', dark: '#304e61', stone: '#628d9f', light: '#bacfd2' },
  3: { ground: ['#403831', '#292a29'], soil: '#827365', road: '#5b5046', edge: '#634836', detail: '#a78866', dark: '#302d2b', stone: '#635b50', light: '#a28c73' },
  4: { ground: ['#393b50', '#282d3d'], soil: '#807694', road: '#615c76', edge: '#423e58', detail: '#aaa2bb', dark: '#363347', stone: '#777398', light: '#b9b1d1' },
  5: { ground: ['#414741', '#2b3434'], soil: '#858675', road: '#6b6b60', edge: '#535b50', detail: '#baad80', dark: '#34433f', stone: '#7b8174', light: '#b7b49b' },
}
const tones = { dawn: '#c3b27c0b', noon: '#b5cab204', amber_dusk: '#cc924514', twilight: '#555b9014', midnight: '#101d3622' }
const oval = (ctx, x, y, rx, ry) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill() }
const blob = (ctx, x, y, rx, ry, phase) => { organicPath(ctx, x, y, rx, ry, phase); ctx.fill() }
const poly = (ctx, points) => { ctx.beginPath(); ctx.moveTo(...points[0]); for (const p of points.slice(1)) ctx.lineTo(...p); ctx.closePath(); ctx.fill() }

export function distanceToSceneryPath(x, y, path) {
  let distance = Infinity
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b.x - a.x, dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)))
    distance = Math.min(distance, Math.hypot(x - a.x - dx * t, y - a.y - dy * t))
  }
  return distance
}

export function createTowerScenery(layout, config, slots, traps) {
  const { left, top, boardWidth: w, boardHeight: h, unit: u } = layout
  const project = p => projectTowerDefensePoint(p, layout)
  const path = config.path.map(project)
  const roadHalfWidth = u * (config.chapterId === 1 ? 1.15 : 1.1)
  const exclusions = [
    ...slots.map(p => ({ ...project(p), radius: Math.max(34, u * 1.22) + 8, kind: 'slot' })),
    ...traps.map(t => ({ ...project(t.pos), radius: u * 1.15 + 10, kind: 'trap' })),
    ...[path[0], path.at(-1)].map(p => ({ ...p, radius: u * 1.3 + 10, kind: 'endpoint' })),
  ]
  const seed = config.id || config.stageId || 1
  const rng = sceneryRandom(seed * 2654435761)
  const props = []
  const count = Math.min(42, Math.max(16, Math.round(w * h / 35000)))
  for (let attempt = 0; attempt < 900 && props.length < count; attempt++) {
    const radius = u * (0.48 + rng() * 0.95)
    const x = left + radius + rng() * Math.max(0, w - radius * 2)
    const y = top + radius + rng() * Math.max(0, h - radius * 2)
    if (radius * 2 > Math.min(w, h)) continue
    if (distanceToSceneryPath(x, y, path) < roadHalfWidth + radius + 6) continue
    if (exclusions.some(p => Math.hypot(p.x - x, p.y - y) < p.radius + radius)) continue
    if (props.some(p => Math.hypot(p.x - x, p.y - y) < p.radius + radius + 8)) continue
    props.push({ x, y, radius, variant: Math.floor(rng() * 4), phase: rng() * TAU })
  }
  return { path, roadHalfWidth, exclusions, props, seed, chapter: config.chapterId || 1, timeOfDay: config.timeOfDay || 'noon' }
}

function trace(ctx, path) {
  ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y)
  for (const point of path.slice(1)) ctx.lineTo(point.x, point.y)
}

function ground(ctx, layout, scene, p) {
  const { left: x, top: y, boardWidth: w, boardHeight: h, unit: u } = layout
  const rng = sceneryRandom(scene.seed ^ 0x1387)
  const gradient = ctx.createLinearGradient(x, y, x + w * 0.35, y + h)
  gradient.addColorStop(0, p.ground[0]); gradient.addColorStop(1, p.ground[1])
  ctx.fillStyle = gradient; ctx.fillRect(x, y, w, h)
  if (scene.chapter === 5 || scene.chapter === 4) {
    const tile = u * 1.9
    for (let row = 0, py = y; py < y + h; py += tile * 0.6, row++) {
      for (let px = x - row % 2 * tile / 2; px < x + w; px += tile) {
        ctx.fillStyle = rng() > 0.5 ? p.light + '07' : '#101a2016'
        ctx.fillRect(px + 2, py + 2, tile - 4, tile * 0.6 - 4)
        if (rng() < 0.15) {
          ctx.strokeStyle = p.dark + '88'; ctx.lineWidth = 1
          ctx.beginPath(); ctx.moveTo(px + tile * 0.3, py + 2); ctx.lineTo(px + tile * 0.4, py + 12); ctx.lineTo(px + tile * 0.35, py + 24); ctx.stroke()
        }
      }
    }
  }
  for (let i = 0, n = Math.min(65, Math.ceil(w * h / 24000)); i < n; i++) {
    const px = x + rng() * w, py = y + rng() * h, r = u * (0.8 + rng() * 2)
    ctx.fillStyle = i % 3 ? p.soil + '15' : '#0b1c2418'
    blob(ctx, px, py, r, r * 0.5, i)
    ctx.fillStyle = p.light + '08'; blob(ctx, px - 6, py - 5, r * 0.85, r * 0.37, i)
  }
  for (let i = 0, n = Math.min(8500, Math.round(w * h / 260)); i < n; i++) {
    ctx.fillStyle = i % 3 ? p.light + '13' : '#0d182828'
    ctx.fillRect(x + rng() * w, y + rng() * h, 0.6 + rng() * 1.5, 0.6 + rng())
  }
  for (let i = 0, n = Math.min(650, Math.round(w * h / 2400)); i < n; i++) {
    const px = x + rng() * w, py = y + rng() * h
    ctx.strokeStyle = p.light + (scene.chapter === 1 ? '22' : '18'); ctx.lineWidth = 1
    ctx.beginPath()
    if (scene.chapter === 1) {
      ctx.moveTo(px - 3, py); ctx.quadraticCurveTo(px - 4, py - 3, px - 5, py - 6)
      ctx.moveTo(px, py + 1); ctx.lineTo(px + 2, py - 5)
    } else {
      ctx.moveTo(px, py); ctx.lineTo(px + 5, py - 3); ctx.lineTo(px + 12, py + 1)
    }
    ctx.stroke()
  }
}

function road(ctx, scene, p, u) {
  const rng = sceneryRandom(scene.seed ^ 0xa549)
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  for (const [width, color] of [[scene.roadHalfWidth * 2, p.dark], [scene.roadHalfWidth * 2 - u * 0.13, p.edge], [u * 1.58, p.road]]) {
    trace(ctx, scene.path); ctx.lineWidth = width; ctx.strokeStyle = color; ctx.stroke()
  }
  // Details stay inside the road footprint. Sample screen-space arc length so
  // a rectangular board cannot stretch offsets away from the real path.
  for (let i = 1; i < scene.path.length; i++) {
    const a = scene.path[i - 1], b = scene.path[i], dx = b.x - a.x, dy = b.y - a.y
    const length = Math.hypot(dx, dy), angle = Math.atan2(dy, dx)
    for (let d = 10; d < length - 6; d += 8 + rng() * 12) {
      const offset = (rng() - 0.5) * u * 1.15
      const x = a.x + dx * d / length - Math.sin(angle) * offset
      const y = a.y + dy * d / length + Math.cos(angle) * offset
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle + rng() * 0.3)
      ctx.fillStyle = rng() > 0.4 ? p.detail + '45' : p.dark + '66'
      oval(ctx, 0, 0, 1.5 + rng() * u * 0.10, 0.7 + rng() * u * 0.035)
      ctx.restore()
    }
    for (let d = u * 0.5; d < length - u * 0.5; d += u * (0.65 + rng() * 0.5)) {
      for (const side of [-1, 1]) {
        const offset = side * u * 0.87
        const x = a.x + dx * d / length - Math.sin(angle) * offset
        const y = a.y + dy * d / length + Math.cos(angle) * offset
        ctx.save(); ctx.translate(x, y); ctx.rotate(angle)
        ctx.fillStyle = scene.chapter === 1 ? '#62734b70' : p.detail + '40'
        blob(ctx, 0, 0, u * (0.12 + rng() * 0.12), u * 0.07, d)
        ctx.restore()
      }
    }
    if (scene.chapter === 5) {
      for (const side of [-1, 1]) {
        const nx = -Math.sin(angle) * side * u * 0.72, ny = Math.cos(angle) * side * u * 0.72
        ctx.strokeStyle = '#c4ad7455'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(a.x + nx, a.y + ny); ctx.lineTo(b.x + nx, b.y + ny); ctx.stroke()
      }
    }
  }
  ctx.restore()
}

function stones(ctx, r, p, phase) {
  for (let i = 0; i < 4; i++) {
    const x = Math.sin(i * 3 + phase) * r * 0.47, y = Math.cos(i * 2 + phase) * r * 0.4, s = r * (0.16 + i * 0.025)
    ctx.fillStyle = p.dark; oval(ctx, x + 3, y + 5, s * 1.2, s * 0.55)
    ctx.fillStyle = p.stone; poly(ctx, [[x - s, y], [x - s * 0.6, y - s], [x + s * 0.2, y - s * 1.1], [x + s, y - s * 0.2], [x + s * 0.7, y + s * 0.4], [x - s * 0.7, y + s * 0.4]])
    ctx.fillStyle = p.light + '65'; poly(ctx, [[x - s, y], [x - s * 0.6, y - s], [x + s * 0.2, y - s * 1.1], [x - s * 0.2, y - s * 0.3]])
  }
}

function prop(ctx, item, chapter, p, tier) {
  const r = item.radius / 1.25
  ctx.save(); ctx.translate(item.x, item.y)
  ctx.fillStyle = '#0c1b2455'; oval(ctx, r * 0.06, r * 0.40, r * 0.80, r * 0.23)
  if (chapter === 1) {
    if (item.variant === 3) { stones(ctx, r, p, item.phase) }
    else if (item.variant === 2) {
      ctx.save(); ctx.rotate(-0.25)
      ctx.fillStyle = '#444635'; ctx.fillRect(-r * 0.65, -r * 0.13, r * 1.3, r * 0.32)
      ctx.fillStyle = '#6d6b49'; ctx.fillRect(-r * 0.63, -r * 0.13, r * 1.25, r * 0.08)
      ctx.fillStyle = '#999173'; oval(ctx, r * 0.64, r * 0.03, r * 0.10, r * 0.16)
      ctx.strokeStyle = '#3d4935'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.ellipse(r * 0.64, r * 0.03, r * 0.05, r * 0.09, 0, 0, TAU); ctx.stroke()
      ctx.fillStyle = '#627845'; blob(ctx, -r * 0.14, -r * 0.10, r * 0.38, r * 0.10, item.phase)
      ctx.restore()
      ctx.strokeStyle = '#829564aa'; ctx.lineWidth = 1.3
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(-r * 0.4, r * 0.3); ctx.quadraticCurveTo(-r * 0.6 + i * 4, r * 0.1, -r * 0.4 + i * 6, -r * 0.15); ctx.stroke()
      }
    }
    else {
      ctx.strokeStyle = '#4f4d37'; ctx.lineWidth = r * 0.12
      ctx.beginPath(); ctx.moveTo(0, r * 0.45); ctx.lineTo(-r * 0.07, -r * 0.38); ctx.stroke()
      const colors = tier >= 2 ? ['#315444', '#40614c', '#506e51'] : ['#2c4d38', '#385b3f', '#466847']
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU, x = Math.cos(a) * r * 0.35, y = -r * 0.2 + Math.sin(a) * r * 0.25
        const pine = item.variant === 1
        const px = pine ? (i % 2 ? 1 : -1) * r * (0.3 - Math.floor(i / 2) * 0.09) : x
        const py = pine ? r * 0.05 - Math.floor(i / 2) * r * 0.28 : y
        ctx.fillStyle = colors[i % 3]; blob(ctx, px, py, r * (pine ? 0.3 - Math.floor(i / 2) * 0.05 : 0.39), r * (pine ? 0.20 : 0.32), item.phase + i)
        ctx.fillStyle = '#9dad6930'; blob(ctx, px - r * 0.07, py - r * 0.09, r * 0.18, r * 0.07, i)
      }
      ctx.fillStyle = '#697f4b80'; blob(ctx, -r * 0.25, r * 0.40, r * 0.25, r * 0.10, 2)
    }
    ctx.strokeStyle = '#8a9a6166'; ctx.lineWidth = 1
    for (let i = 0; i < 5; i++) { const x = (i - 2) * r * 0.13; ctx.beginPath(); ctx.moveTo(x, r * 0.60); ctx.lineTo(x - 3, r * 0.42); ctx.stroke() }
  } else if (chapter === 2 || chapter === 4) {
    stones(ctx, r * 0.8, p, item.phase)
    if (chapter === 2 && item.variant % 2 === 0) {
      ctx.fillStyle = '#5d8190'; poly(ctx, [[-r * 0.65, r * 0.27], [-r * 0.60, -r * 0.15], [-r * 0.2, -r * 0.63], [r * 0.36, -r * 0.53], [r * 0.66, r * 0.25]])
      ctx.fillStyle = '#a7c1c6'; poly(ctx, [[-r * 0.60, -r * 0.15], [-r * 0.2, -r * 0.63], [r * 0.36, -r * 0.53], [r * 0.48, -r * 0.22], [r * 0.05, -r * 0.13], [-r * 0.17, -r * 0.25]])
      ctx.strokeStyle = '#c7d7d580'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 0.5); ctx.lineTo(-r * 0.1, -r * 0.1); ctx.lineTo(r * 0.12, r * 0.22); ctx.stroke()
      ctx.restore(); return
    }
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * r * 0.3, y = r * 0.22, height = r * (i === 1 ? 0.98 : 0.63), width = r * 0.2
      ctx.fillStyle = p.stone; poly(ctx, [[x - width, y], [x - width * 0.8, y - height * 0.65], [x, y - height], [x + width, y - height * 0.6], [x + width, y]])
      ctx.fillStyle = p.light + '88'; poly(ctx, [[x, y - height], [x + width, y - height * 0.6], [x, y - height * 0.4], [x - width * 0.8, y - height * 0.65]])
      ctx.strokeStyle = p.light + '70'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y - height); ctx.lineTo(x, y - height * 0.4); ctx.lineTo(x + width, y); ctx.stroke()
    }
    if (chapter === 2) { ctx.fillStyle = '#c3d3d044'; blob(ctx, -r * 0.2, r * 0.4, r * 0.56, r * 0.13, 2) }
  } else if (chapter === 3) {
    stones(ctx, r * 1.05, p, item.phase)
    ctx.fillStyle = '#4f4236'; blob(ctx, 0, r * 0.10, r * 0.6, r * 0.29, item.phase)
    ctx.fillStyle = '#222a29'; blob(ctx, 0, r * 0.15, r * 0.45, r * 0.18, 2)
    ctx.strokeStyle = '#c68950aa'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(-r * 0.3, r * 0.13); ctx.lineTo(-r * 0.08, 0); ctx.lineTo(r * 0.08, r * 0.15); ctx.lineTo(r * 0.3, r * 0.08); ctx.stroke()
  } else {
    stones(ctx, r * 0.9, p, item.phase)
    const height = r * (item.variant === 3 ? 0.5 : 1)
    ctx.fillStyle = p.dark; ctx.fillRect(-r * 0.37, r * 0.24, r * 0.74, r * 0.27)
    ctx.fillStyle = p.stone; ctx.fillRect(-r * 0.36, r * 0.18, r * 0.72, r * 0.22)
    ctx.fillRect(-r * 0.21, r * 0.2 - height, r * 0.42, height)
    ctx.fillStyle = p.light + '60'; ctx.fillRect(-r * 0.21, r * 0.2 - height, r * 0.07, height)
    ctx.fillStyle = p.dark; ctx.fillRect(r * 0.08, r * 0.23 - height, r * 0.09, height * 0.9)
    ctx.fillStyle = p.stone; ctx.fillRect(-r * 0.29, r * 0.15 - height, r * 0.58, r * 0.15)
    if (item.variant !== 3) {
      ctx.fillStyle = '#7f5757'; poly(ctx, [[0, r * 0.39 - height], [r * 0.32, r * 0.39 - height], [r * 0.29, r * 0.1], [r * 0.15, 0], [0, r * 0.1]])
      ctx.strokeStyle = '#b3a07588'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(r * 0.08, r * 0.48 - height); ctx.lineTo(r * 0.18, r * 0.56 - height); ctx.lineTo(r * 0.08, r * 0.64 - height); ctx.stroke()
    }
  }
  ctx.restore()
}

export function paintTowerScenery(ctx, layout, scene, config) {
  const p = TD_SCENERY_PALETTES[scene.chapter] || TD_SCENERY_PALETTES[1]
  const { left, top, boardWidth, boardHeight, width, height, unit } = layout
  ctx.fillStyle = config.theme?.bgBase || '#0b1613'; ctx.fillRect(0, 0, width, height)
  ctx.save(); ctx.beginPath(); ctx.rect(left, top, boardWidth, boardHeight); ctx.clip()
  ground(ctx, layout, scene, p)
  road(ctx, scene, p, unit)
  const tier = Math.min(3, Math.floor(((config.stageInChapter || 1) - 1) / 5))
  for (const item of scene.props) prop(ctx, item, scene.chapter, p, tier)
  ctx.fillStyle = tones[scene.timeOfDay] || tones.noon; ctx.fillRect(left, top, boardWidth, boardHeight)
  ctx.restore()
}

export function drawTowerAtmosphere(ctx, layout, scene, elapsed) {
  const p = TD_SCENERY_PALETTES[scene.chapter] || TD_SCENERY_PALETTES[1]
  ctx.save(); ctx.beginPath(); ctx.rect(layout.left, layout.top, layout.boardWidth, layout.boardHeight); ctx.clip()
  // Tiny local motes; never cross the path or controls and never cover combat actors.
  for (let i = 0; i < scene.props.length; i += 3) {
    const item = scene.props[i], a = elapsed * 0.24 + item.phase
    const x = item.x + Math.cos(a) * item.radius * 0.25, y = item.y + Math.sin(a * 0.8) * item.radius * 0.2
    const pulse = 0.18 + (1 + Math.sin(elapsed * 1.2 + i)) * 0.08
    ctx.globalAlpha = pulse; ctx.fillStyle = p.light
    oval(ctx, x, y, 2.5, 2.5)
    ctx.globalAlpha = Math.min(0.55, pulse + 0.16); ctx.fillStyle = scene.chapter === 3 ? '#d8aa79' : '#d8e2bd'
    oval(ctx, x, y, 1, 1)
  }
  ctx.restore()
}
