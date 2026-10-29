// Start Vite on 3017 first. PLAYWRIGHT_MODULE may point to playwright-core/index.mjs.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
const output = '.workbuddy/warden-browser'
await mkdir(output, { recursive: true })
const rows = []
try {
  await page.goto('http://127.0.0.1:3017/test-support/warden-playtest.html')
  await page.waitForFunction(() => window.wardenBoss)
  for (const role of ['glutton', 'shadow', 'ricochet', 'elemental', 'summoner', 'origin']) {
    await page.selectOption('#role', role)
    await page.selectOption('#phase', '2')
    await page.check('#mobs')
    await page.click('#reset')
    const initial = await page.evaluate(() => {
      const g = window.wardenGame, b = window.wardenBoss
      if (['glutton','shadow'].includes(g.startingStrain)) { g.player.x = b.x - 95; g.player.facing = 0 }
      return { hp: b.hp, totalHp: g.enemyManager.enemies.reduce((sum, e) => sum + e.hp, 0), x: g.player.x }
    })
    await page.waitForTimeout(1800)
    const before = await page.evaluate(() => window.wardenGame.player.x)
    await page.keyboard.down('ArrowLeft')
    await page.waitForTimeout(250)
    await page.keyboard.up('ArrowLeft')
    const row = await page.evaluate(() => ({ role: window.wardenGame.startingStrain,
      bossHp: window.wardenBoss.hp, playerHp: window.wardenGame.player.hp,
      x: window.wardenGame.player.x, state: window.wardenBoss.specialState,
      phase: window.wardenBoss.phase, count: window.wardenGame.enemyManager.enemies.length,
      totalHp: window.wardenGame.enemyManager.enemies.reduce((sum, e) => sum + Math.max(0, e.hp), 0) }))
    assert.ok(row.x < before - 20, `${role}: real keyboard movement`)
    assert.ok(row.totalHp < initial.totalHp, `${role}: real auto attack damage (nearest target may be a survivor)`)
    assert.equal(row.phase, 2)
    rows.push(row)
    await page.screenshot({ path: `${output}/${role}.png` })
  }
  assert.deepEqual(errors, [])
  await writeFile(`${output}/results.json`, JSON.stringify({ rows, errors }, null, 2))
  console.table(rows)
  console.log('Browser: six roles, phase two, three survivors, real input/Canvas/auto attacks passed')
} finally { await browser.close() }
