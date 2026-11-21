import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'

// Use an isolated local test database; do not touch a development account DB.
const output = path.resolve('.workbuddy/elemental-build')
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, baseURL: process.env.SLIME_TEST_URL || 'http://127.0.0.1:3014' })
const errors = [], screenshots = []
const page = await context.newPage()
page.on('pageerror', error => errors.push(error.message))
const game = fn => page.evaluate(fn)
const shot = async name => {
  const file = path.join(output, `${name}.png`)
  await page.screenshot({ path: file, animations: 'disabled' }); screenshots.push(file)
}
const freeze = () => game(() => { const g = window.playtestGame; g.stop(); g.running = true })
async function gainLevel() {
  await game(() => { const g = window.playtestGame; g.player.gainExp(g.player.maxExp - g.player.exp) })
}

try {
  const registered = await context.request.post('/api/auth/register', { data: { username: `el${Date.now().toString(36)}`, password: 'local-playtest-2026' } })
  assert.equal(registered.ok(), true, await registered.text())
  await context.request.post('/api/account/tutorial')
  await page.goto('/')
  await page.locator('[data-playstyle="arena"]').waitFor()
  await page.locator('[data-playstyle="arena"]').click()
  await page.locator('[data-mode="expedition"]').waitFor()
  await page.locator('[data-mode="expedition"]').click()
  await page.locator('[data-strain="elemental"]').click()
  assert.equal(await page.locator('.starting-spells-options').count(), 0)
  await page.locator('.spell-growth-note').waitFor()
  await shot('01-menu-desktop')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.spell-growth-note').scrollIntoViewIfNeeded()
  assert.ok(await game(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await shot('02-menu-mobile')
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.locator('.config-actions .primary-action').click()
  await page.locator('.deploy-btn').click()
  await page.locator('.hud-spell-build').waitFor()
  await game(() => {
    window.playtestGame = document.querySelector('#app').__vue_app__._instance.setupState.engine
    const g = window.playtestGame
    g.stop(); g.running = true; g._pauseLock = 0; g.input.suspended = false
    g._activateExpeditionStage(); g.enemyManager._enemies = []; g.enemyManager._spawnTimer = Infinity
    g.mapFeatures.barricades = []; g.start = () => { g.running = true }
    g._pushStats(); g.render()
  })
  assert.equal(await game(() => playtestGame.weaponSystem.spellCombat.elements.size), 0)
  await gainLevel()
  await page.getByRole('heading', { name: '选择本局元素专精' }).waitFor()
  assert.equal(await page.locator('.core-option').count(), 4)
  await shot('03-first-spell-desktop')
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await game(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await shot('04-first-spell-mobile')
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.locator('.core-option').filter({ hasText: '烈焰毁灭' }).click()
  await page.locator('.spell-core-panel').waitFor({ state: 'hidden' })
  assert.deepEqual(await game(() => [...playtestGame.weaponSystem.spellCombat.elements]), ['fire'])
  assert.equal(await game(() => playtestGame.input.consumeFever()), false, '法术选择不会排入幽灵空格技能')

  // Bypass RNG to verify the branch ascendancy UI with max 2 cross-school cantrips.
  await game(() => {
    const g = playtestGame, s = g.weaponSystem.spellCombat
    s.learnCantrip('ice'); s.learnCantrip('lightning'); s.normalChoices = 5; g.expeditionStage = 3
    g._pushStats(); g.render()
  })
  await gainLevel()
  await page.getByRole('heading', { name: '专精分支升华 · 选择本系流派' }).waitFor()
  assert.equal(await page.locator('.route-card').count(), 2)
  assert.equal(await page.locator('.route-card:disabled').count(), 0)
  await shot('05-routes-desktop')
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await game(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await shot('06-routes-mobile')
  await page.locator('.route-card').filter({ hasText: '毁灭术士' }).click()
  await page.getByRole('heading', { name: '确认升华【毁灭术士】' }).waitFor()
  await page.locator('.review-actions button:not(.confirm)').click()
  await page.getByRole('heading', { name: '专精分支升华 · 选择本系流派' }).waitFor()
  await page.locator('.route-card').filter({ hasText: '毁灭术士' }).click()
  await page.locator('.review-actions button.confirm').click()
  await page.locator('.elemental-route-overlay').waitFor({ state: 'hidden' })
  const routeState = await game(() => {
    const g = playtestGame, s = g.weaponSystem.spellCombat
    return {
      branch: s.branch,
      school: s.school,
      crossCantrips: [...s.crossCantrips],
      routeName: s.hud().branchName,
      fireRainLv: g.skillLevels.fire_rain || 0,
      normalChoices: s.normalChoices,
    }
  })
  assert.equal(routeState.branch, 'fire_destruction')
  assert.deepEqual(routeState.crossCantrips, ['ice', 'lightning'])
  assert.ok(routeState.fireRainLv >= 1)
  assert.equal(routeState.routeName, '毁灭术士')
  await page.setViewportSize({ width: 1440, height: 960 })
  await shot('07-route-locked-desktop')

  const snapshot = await game(() => {
    const g = playtestGame, s = g.weaponSystem.spellCombat
    g._pauseLock = 0; g.running = true; g.input.suspended = false
    for (let i = 0; i < 5; i++) {
      const e = g.enemyManager.spawnAt(g.player.x + 130 + i * 55, g.player.y + (i % 2) * 50, 'knight')
      e.hp = e.maxHp = 10000; e.shieldHits = 0
    }
    g.enemyManager._buildGrid()
    for (let i = 0; i < 120; i++) s.update(.05)
    s.useActive()
    s.update(.05)
    g._pushStats(); g.render()
    return { casts: s.stats.castsByElement, cantripCasts: s.stats.cantripCasts, summons: s.summons.length, zones: s.zones.length }
  })
  assert.ok(snapshot.casts.fire > 0 && snapshot.cantripCasts > 0 && snapshot.summons > 0, JSON.stringify(snapshot))
  await shot('08-branch-combat-desktop')

  await game(() => playtestGame.finishRun('defeat', 'slime-defeated'))
  await page.locator('.restart-btn').click()
  await page.locator('.deploy-btn').click()
  await page.locator('.hud-spell-build').waitFor()
  await page.waitForFunction(() => playtestGame.player.level === 1 && !playtestGame.runFinished)
  await freeze()
  assert.deepEqual(await game(() => ({ level: playtestGame.player.level, elements: [...playtestGame.weaponSystem.spellCombat.elements], branch: playtestGame.weaponSystem.spellCombat.branch })), { level: 1, elements: [], branch: null })
  await gainLevel()
  await page.getByRole('heading', { name: '选择本局元素专精' }).waitFor()
  await page.locator('.core-option').filter({ hasText: '瘟疫灾厄' }).click()
  assert.deepEqual(await game(() => [...playtestGame.weaponSystem.spellCombat.elements]), ['poison'])
  assert.deepEqual(errors, [])
  await fs.writeFile(path.join(output, 'browser-results.json'), JSON.stringify({ routeState, snapshot, errors, screenshots }, null, 2))
  console.log(JSON.stringify({ routeState, snapshot, errors, screenshots }, null, 2))
} finally { await browser.close() }
