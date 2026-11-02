// Renders ASCII silhouettes of every boss cast (idle + strike + r_roar) so the
// shape language can be reviewed headlessly, and reports pairwise silhouette
// similarity (IoU) for the six mage-family casts. Needs playwright-core and a
// dev server on GAME_URL (default http://127.0.0.1:13093).
//   node test-support/boss-sil-ascii.mjs [--iou]
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core')
const base = process.env.GAME_URL || 'http://127.0.0.1:13093'
const COLS = 46, ROWS = 30

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
await page.goto(`${base}/test-support/boss-art-board.html`)
await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 })

const data = await page.evaluate(async () => {
  const { BOSS_CAST, bossFramePose } = await import('/src/game/enemy-art/boss-cast.js')
  const { setScale } = await import('/src/game/slime-art/slime-painter.js')
  const out = []
  for (const id of Object.keys(BOSS_CAST)) {
    const cast = BOSS_CAST[id]
    for (const key of ['idle', 'strike', 'r_roar']) {
      const px = cast.surface * 2
      const cv = document.createElement('canvas'); cv.width = px; cv.height = px
      const g = cv.getContext('2d', { willReadFrequently: true })
      g.translate(px / 2, px / 2); g.scale(2, 2); setScale(cast.baseR * cast.scale); g.scale(cast.baseR * cast.scale / 100, cast.baseR * cast.scale / 100)
      cast.draw(g, bossFramePose(id, key))
      const d = g.getImageData(0, 0, px, px).data
      const mask = []
      for (let y = 0; y < px; y += 4) {
        const row = []
        for (let x = 0; x < px; x += 4) {
          let a = 0
          for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) a = Math.max(a, d[((y + sy) * px + x + sx) * 4 + 3])
          row.push(a > 40 ? 1 : 0)
        }
        mask.push(row)
      }
      out.push({ id, key, mask })
    }
  }
  return out
})

await browser.close()

for (const { id, key, mask } of data) {
  const h = mask.length, w = mask[0].length
  // crop to ink bounds
  let x0 = w, y0 = h, x1 = 0, y1 = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y][x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  if (x1 < x0) { console.log(`\n=== ${id} ${key} === EMPTY`); continue }
  console.log(`\n=== ${id} ${key} ===`)
  for (let r = 0; r < ROWS; r++) {
    let line = ''
    for (let c = 0; c < COLS; c++) {
      const sx = Math.floor(x0 + (c + .5) / COLS * (x1 - x0 + 1))
      const sy = Math.floor(y0 + (r + .5) / ROWS * (y1 - y0 + 1))
      line += mask[sy][sx] ? '#' : ' '
    }
    console.log(line)
  }
}

// pairwise IoU on idle silhouettes (masks cropped to bounds then compared on a
// common normalised grid)
const idles = data.filter(d => d.key === 'idle')
const norm = m => {
  const h = m.length, w = m[0].length
  let x0 = w, y0 = h, x1 = 0, y1 = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y][x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  const N = 32, g = []
  for (let r = 0; r < N; r++) { const row = []; for (let c = 0; c < N; c++) row.push(m[Math.floor(y0 + (r + .5) / N * (y1 - y0 + 1))][Math.floor(x0 + (c + .5) / N * (x1 - x0 + 1))]); g.push(row) }
  return g
}
const grids = new Map(idles.map(d => [d.id, norm(d.mask)]))
console.log('\n=== pairwise idle-silhouette IoU (lower = more distinct) ===')
const ids = [...grids.keys()]
for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
  const A = grids.get(ids[i]), B = grids.get(ids[j])
  let inter = 0, uni = 0
  for (let r = 0; r < 32; r++) for (let c = 0; c < 32; c++) { if (A[r][c] && B[r][c]) inter++; if (A[r][c] || B[r][c]) uni++ }
  console.log(`${ids[i]} vs ${ids[j]}: ${(inter / uni).toFixed(2)}`)
}
