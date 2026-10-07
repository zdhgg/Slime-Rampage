// Canvas-native cyber city, baked once. Near towers advance in world depth.
const poly = (ctx, points, color) => {
  ctx.fillStyle = color
  ctx.beginPath()
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))
  ctx.closePath()
  ctx.fill()
}

function windows(ctx, x, y, w, h, p, rng, dim = false) {
  for (let yy = y; yy < y + h; yy += 13) for (let xx = x; xx < x + w - 3; xx += 9) {
    const light = rng()
    if (light < 0.43) continue
    ctx.fillStyle = light > 0.93 ? p.lamp + (dim ? '50' : 'a0') : p.accent + (dim ? '28' : '55')
    ctx.fillRect(xx, yy, 3, 5)
  }
}

export function paintSceneSkyline(ctx, w, p, rng) {
  for (let layer = 0; layer < 2; layer++) {
    let x = -20, index = 0
    while (x < w) {
      const bw = 20 + rng() * 62, bh = 24 + rng() * 88 * p.density, top = 132 - bh
      ctx.fillStyle = layer ? p.landmark : p.horizon
      ctx.globalAlpha = layer ? 0.88 : 0.4
      ctx.fillRect(x, top, bw, bh)
      ctx.fillRect(x + bw * 0.2, top - 8 - rng() * 10, bw * 0.5, 12)
      ctx.fillStyle = p.prop + '60'; ctx.fillRect(x, top, 2, bh)
      if (index % 3 === 0) {
        ctx.fillRect(x + bw * 0.6, top - 24, 1, 24)
        ctx.fillStyle = p.sign + '80'; ctx.fillRect(x + bw * 0.6, top - 24, 2, 2)
      }
      windows(ctx, x + 6, top + 9, bw - 10, bh - 12, p, rng, true)
      x += bw + 9 + rng() * 24
      index++
    }
  }
  ctx.globalAlpha = 1
}

// Lower roofs establish a city below the bridge, with overlapping levels.
export function paintSceneCluster(ctx, w, p, rng) {
  for (let layer = 0; layer < 3; layer++) {
    let x = -35
    while (x < w) {
      const bw = 35 + rng() * 80, h = 28 + rng() * 68
      const base = 105 + layer * 60 + rng() * 20, y = base - h
      poly(ctx, [[x, y], [x + 14, y - 10], [x + bw + 14, y - 10], [x + bw, y]], p.prop + '55')
      ctx.fillStyle = layer === 2 ? p.sky : p.landmark
      ctx.fillRect(x, y, bw, h + 50)
      ctx.fillStyle = p.prop + '40'; ctx.fillRect(x, y, bw, 2)
      windows(ctx, x + 7, y + 12, bw - 12, h + 20, p, rng, true)
      ctx.fillStyle = p.accent + '35'; ctx.fillRect(x + 10, base + 22, bw * 0.65, 1)
      x += bw + 12 + rng() * 20
    }
  }
}

// 180 x 360, bottom anchor. Dark inward face and a bevelled rooftop describe
// volume. Both orientations are baked so neon glyphs stay symmetric.
export function paintCyberTower(ctx, p, rng, variant, side) {
  if (side === 1) { ctx.translate(180, 0); ctx.scale(-1, 1) }
  const top = 40 + (variant % 3) * 32
  const front = variant % 2 ? '#17283d' : '#1b2b43'
  poly(ctx, [[12, top], [115, top], [115, 355], [12, 355]], front)
  poly(ctx, [[115, top], [163, top + 5], [163, 355], [115, 355]], '#101d30')
  poly(ctx, [[12, top], [57, top - 19], [163, top + 5], [115, top]], '#30465c')
  ctx.fillStyle = p.prop + '55'
  ctx.fillRect(12, top, 3, 355 - top); ctx.fillRect(112, top, 2, 355 - top)
  for (let y = top + 44; y < 345; y += 58) {
    ctx.fillStyle = '#091525'; ctx.fillRect(16, y, 95, 5)
    poly(ctx, [[115, y], [163, y + 9], [163, y + 12], [115, y + 3]], '#0a1424')
  }
  windows(ctx, 23, top + 18, 82, 332 - top, p, rng)
  for (let y = top + 35; y < 335; y += 21) {
    ctx.fillStyle = p.accent + '32'; ctx.fillRect(126, y, 5, 7); ctx.fillRect(145, y + 6, 5, 7)
  }
  poly(ctx, [[39, top - 6], [39, top - 26], [76, top - 26], [76, top - 6]], '#203349')
  poly(ctx, [[76, top - 26], [96, top - 16], [96, top + 3], [76, top - 6]], '#132236')
  ctx.fillStyle = p.prop; ctx.fillRect(52, top - 38, 2, 18)
  ctx.fillStyle = p.sign + 'a0'; ctx.fillRect(51, top - 39, 4, 3)
  const neon = variant % 2 ? p.sign : p.accent
  if (variant % 3 !== 2) {
    ctx.fillStyle = neon + '25'; ctx.fillRect(20, top + 61, 32, 94)
    ctx.fillStyle = '#0a1729'; ctx.fillRect(23, top + 64, 26, 88)
    ctx.fillStyle = neon + 'b0'; ctx.fillRect(23, top + 64, 2, 88)
    for (let i = 0; i < 3; i++) {
      const y = top + 75 + i * 24
      ctx.fillRect(31, y, 12, 2); ctx.fillRect(31, y, 2, 13)
      ctx.fillRect(31, y + 11, 12, 2); ctx.fillRect(41, y + 5, 2, 8)
    }
  } else {
    ctx.fillStyle = '#0d1a2d'; ctx.fillRect(20, top + 60, 80, 29)
    ctx.fillStyle = neon + '80'; ctx.fillRect(20, top + 60, 80, 2)
    ctx.fillRect(20, top + 87, 80, 1)
    ctx.fillStyle = neon + 'b0'
    for (let n = 0; n < 5; n++) {
      ctx.fillRect(29 + n * 13, top + 69, 7, 2)
      ctx.fillRect(29 + n * 13, top + 69, 2, 10)
      ctx.fillRect(29 + n * 13, top + 77, 7, 2)
    }
  }
  ctx.fillStyle = p.accent + '75'; ctx.fillRect(115, top + 17, 2, 57)
}

export function paintSceneDestination(ctx, p) {
  const royal = p.theme === 'royal' || p.theme === 'citadel'
  for (const side of [-1, 1]) {
    const x = side < 0 ? 62 : 264, top = royal ? 30 : 62
    poly(ctx, [[x, 174], [x, top + 18], [x + 18, top], [x + 66, top], [x + 74, 174]], p.landmark)
    ctx.fillStyle = p.prop + '50'; ctx.fillRect(x + 10, top + 24, 4, 150 - top)
    ctx.fillStyle = p.accent + '65'; ctx.fillRect(x + 20, top + 12, 35, 2); ctx.fillRect(x + 49, top + 20, 2, 60)
    ctx.fillStyle = p.sign + '70'; ctx.fillRect(x + 31, top - 17, 2, 17)
  }
  if (royal) {
    poly(ctx, [[171, 170], [177, 23], [190, 23], [200, 4], [210, 23], [223, 23], [229, 170]], '#1b2841')
    ctx.fillStyle = p.sign + '85'; ctx.fillRect(196, 38, 8, 44)
    ctx.fillStyle = p.lamp + '80'; ctx.fillRect(195, 21, 10, 3)
  }
  ctx.fillStyle = p.landmark; ctx.fillRect(130, 122, 140, 8)
  ctx.fillStyle = p.accent + '45'; ctx.fillRect(147, 125, 106, 1)
}

export function paintSceneGate(ctx, p) {
  for (const x of [14, 232]) {
    poly(ctx, [[x, 112], [x, 27], [x + 7, 18], [x + 10, 112]], p.landmark)
    ctx.fillStyle = p.prop + '80'; ctx.fillRect(x + 1, 32, 2, 80)
    ctx.fillStyle = p.accent + '90'; ctx.fillRect(x + 3, 34, 2, 16)
  }
  poly(ctx, [[14, 27], [35, 15], [221, 15], [242, 27], [242, 33], [14, 33]], p.landmark)
  ctx.fillStyle = p.prop + '70'; ctx.fillRect(36, 16, 183, 2)
  ctx.fillStyle = p.accent + '55'; ctx.fillRect(51, 30, 154, 1)
}
