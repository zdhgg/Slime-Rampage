// Screenshots the enemy art review board served by a running Vite dev server.
//   node test-support/enemy-art-board.mjs [tag]
// GAME_URL selects the dev server (default http://127.0.0.1:13093). Output goes
// to .tmp-enemy-art/<tag>-<section>.png. Needs the installed playwright-core.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core')
const base = process.env.GAME_URL || 'http://127.0.0.1:13093'
const tag = process.argv[2] || 'cur'
const out = resolve('.tmp-enemy-art')
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1560, height: 1000 }, deviceScaleFactor: 1 })
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto(`${base}/test-support/enemy-art-board.html`)
await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 }).catch(() => errors.push('board not ready'))
await page.waitForTimeout(200)
for (const sec of await page.$$('section')) {
  const id = await sec.getAttribute('id')
  await sec.screenshot({ path: resolve(out, `${tag}-${id}.png`) })
}
const bounds = await page.evaluate(() => window.__bounds || null)
if (bounds) writeFileSync(resolve(out, `${tag}-bounds.json`), JSON.stringify(bounds, null, 1))
console.log(await page.evaluate(() => document.getElementById('bounds')?.textContent || ''))
await browser.close()
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'ok', out)
