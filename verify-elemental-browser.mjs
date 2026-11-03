import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'

// Use a disposable test account service, never the user's development account DB.
const output = path.resolve('.workbuddy/elemental-level-growth')
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, baseURL: process.env.SLIME_TEST_URL || 'http://127.0.0.1:3014' })
const errors = [], screenshots = []
const page = await context.newPage()
page.on('pageerror', e => errors.push(e.message))
const shot = async name => {
  await page.waitForFunction(() => { const overlay = document.querySelector('.spell-core-overlay'); return !overlay || Number(getComputedStyle(overlay).opacity) >= .999 })
  const file = path.join(output, `${name}.png`)
  await page.screenshot({ path: file, animations: 'disabled' }); screenshots.push(file)
}
const game = fn => page.evaluate(fn)
const freeze = () => game(() => { const g = window.playtestGame; g.stop(); g.running = true })
async function gainLevel() {
  await game(() => { const g = window.playtestGame; g.player.gainExp(g.player.maxExp - g.player.exp) })
}

try {
  const registered = await context.request.post('/api/auth/register', { data: { username: `growth${Date.now()}`, password: 'local-playtest-2026' } })
  assert.equal(registered.ok(), true, await registered.text())
  await context.request.post('/api/account/tutorial')
  await page.goto('/')
  await page.locator('[data-playstyle="arena"]').click()
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
    g.mapFeatures.barricades = []
    // Keep rendering deterministic while actual UI choices still call the engine.
    g.start = () => { g.running = true }
    g._pushStats(); g.render()
  })
  assert.equal(await game(() => playtestGame.weaponSystem.spellCombat.elements.size), 0)
  await gainLevel()
  await page.getByRole('heading', { name: '选择你的第一个法术' }).waitFor()
  assert.equal(await page.locator('.core-option').count(), 4)
  assert.equal(await page.locator('.levelup-panel').count(), 0)
  await shot('03-first-spell-desktop')
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await game(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await shot('04-first-spell-mobile')
  await page.setViewportSize({ width: 1440, height: 960 })
  const fire = page.locator('.core-option').filter({ has: page.getByText('火球术', { exact: true }) })
  await fire.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Space')
  await page.locator('.spell-core-panel').waitFor({ state: 'hidden' })
  assert.deepEqual(await game(() => [...playtestGame.weaponSystem.spellCombat.elements]), ['fire'])
  assert.equal(await game(() => playtestGame.input.consumeFever()), false, '面板确认不会排入幽灵空格技能')
  for (let n = 0; n < 2; n++) { await gainLevel(); await page.locator('.skill-card').first().click(); await freeze() }
  await gainLevel()
  await page.getByRole('heading', { name: '选择第二元素，确定本局融合' }).waitFor()
  assert.equal(await page.locator('.core-option').count(), 3)
  await shot('05-fusion-desktop')
  await page.setViewportSize({ width: 390, height: 844 })
  await shot('06-fusion-mobile')
  assert.ok(await game(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.locator('.core-option').filter({ has: page.getByText('雷电', { exact: true }) }).click()
  await page.locator('.spell-core-panel').waitFor({ state: 'hidden' })
  for (let n = 0; n < 4; n++) { await gainLevel(); await page.locator('.skill-card').first().click(); await freeze() }
  await gainLevel()
  await page.getByRole('heading', { name: '融合主动术进化' }).waitFor()
  assert.equal(await page.locator('.core-option').count(), 1)
  await shot('07-evolution-desktop')
  await page.locator('.core-option').click()
  const snapshot = await game(() => {
    const g = playtestGame, s = g.weaponSystem.spellCombat
    for (let i = 0; i < 5; i++) {
      const e = g.enemyManager.spawnAt(g.player.x + 130 + i * 55, g.player.y + (i % 2) * 50, 'knight')
      e.hp = e.maxHp = 10000; e.shieldHits = 0
    }
    g.enemyManager._buildGrid()
    for (let i = 0; i < 16; i++) s.update(.05)
    g.input.queueFever(); g._updateStrainSkill(0)
    for (let i = 0; i < 8; i++) s.update(.05)
    g._pushStats(); g._pushCooldown(); g.render()
    return { level: g.player.level, elements: [...s.elements], active: s.activeName, cores: s.cores, pauseLock: g._pauseLock, casts: s.stats.castsByElement, activeCasts: s.stats.activeCasts }
  })
  assert.equal(snapshot.active, '天罚雷炎'); assert.equal(snapshot.pauseLock, 0)
  assert.ok(snapshot.casts.fire > 0 && snapshot.casts.lightning > 0)
  assert.equal(snapshot.activeCasts, 1)
  await shot('08-evolved-combat-desktop')
  await page.setViewportSize({ width: 390, height: 844 })
  await game(() => { playtestGame._onResize(); playtestGame.render() })
  await shot('09-evolved-combat-mobile')
  // Actual result-screen restart returns to a neutral Lv.1, then a new first choice.
  await page.setViewportSize({ width: 1440, height: 960 })
  await game(() => playtestGame.finishRun('defeat', 'slime-defeated'))
  await page.locator('.restart-btn').click()
  await page.locator('.deploy-btn').click()
  await page.locator('.hud-spell-build').waitFor()
  await page.waitForFunction(() => playtestGame.player.level === 1 && !playtestGame.runFinished)
  await freeze()
  assert.deepEqual(await game(() => ({ level: playtestGame.player.level, elements: [...playtestGame.weaponSystem.spellCombat.elements], evolved: playtestGame.weaponSystem.spellCombat.milestoneEvolved, first: playtestGame.startingElement })), { level: 1, elements: [], evolved: false, first: null })
  await gainLevel()
  await page.getByRole('heading', { name: '选择你的第一个法术' }).waitFor()
  assert.equal(await page.locator('.core-option').count(), 4)
  await page.locator('.core-option').filter({ has: page.getByText('毒雾', { exact: true }) }).click()
  assert.deepEqual(await game(() => [...playtestGame.weaponSystem.spellCombat.elements]), ['poison'])
  assert.deepEqual(errors, [])
  // Old comparison links cannot re-enable the removed pre-run selection.
  await page.goto('/?elementalProgression=boss')
  await page.locator('[data-playstyle="arena"]').click()
  await page.locator('[data-mode="expedition"]').click()
  await page.locator('[data-strain="elemental"]').click()
  assert.equal(await page.locator('.starting-spells-options button').count(), 0)
  await page.locator('.spell-growth-note').waitFor()
  await fs.writeFile(path.join(output, 'browser-results.json'), JSON.stringify({ snapshot, errors, screenshots }, null, 2))
  console.log(JSON.stringify({ snapshot, errors, screenshots }, null, 2))
} finally { await browser.close() }
