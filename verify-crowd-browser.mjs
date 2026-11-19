import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { build } from 'vite'
import { openDatabase } from './server/database.mjs'
import { createGameApp } from './server/app.mjs'

const output = path.resolve('.workbuddy/crowd-browser')
await mkdir(output, { recursive: true })
const fixture = await mkdtemp(path.join(tmpdir(), 'slime-crowd-browser-'))
let server, db, browser
try {
  await build({ logLevel: 'error', build: { outDir: path.join(fixture, 'dist') }, plugins: [{
    name: 'crowd-browser-fixture', enforce: 'pre',
    transform(source, id) {
      if (id.replaceAll('\\', '/').endsWith('/src/App.vue')) return source.replace('</script>',
        'window.__crowdTestApp = { get engine() { return engine.value } }\n</script>')
    },
  }] })
  db = openDatabase(':memory:')
  server = createGameApp({ db, registration: true, distDir: path.join(fixture, 'dist') }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, baseURL: `http://127.0.0.1:${server.address().port}` })
  const page = await context.newPage(), errors = []
  page.on('pageerror', e => errors.push(e.message))
  const registered = await context.request.post('/api/auth/register', { data: { username: `crowd${Date.now().toString(36)}`, password: 'crowd-local-test-2026' } })
  assert.ok(registered.ok(), await registered.text())
  await context.request.post('/api/account/tutorial')
  await page.goto('/')
  await page.locator('.account-welcome').waitFor()
  await page.locator('[data-playstyle="arena"]').click()
  await page.locator('[data-mode="expedition"]').click()
  await page.locator('[data-strain="glutton"]').click()
  await page.locator('.config-actions .primary-action').click()
  await page.locator('.deploy-btn').click()
  await page.locator('.hud-action--skill').waitFor()
  await page.locator('.glutton-status').waitFor()
  await page.evaluate(() => {
    const g = window.__crowdTestApp.engine
    g.stop(); g.running = true; g._pauseLock = 0; g.input.suspended = false
    g._activateExpeditionStage()
    g.start = () => { g.running = true; g.input.suspended = false }
    g.enemyManager._enemies = []; g.enemyManager._spawnTimer = Infinity
    g.enemyManager.wave = 4; g.weaponSystem.cooldown = Infinity
    g.mapFeatures.barricades = []; g.worldEvents.current = null
    g.player.invincible = 1e9
    g.player.x = g.worldWidth / 2; g.player.y = g.worldHeight / 2
    g._camInit = false; g._updateCamera(.01)
    g.enemyManager.crowds.startSquad()
    for (let i = 0; i < 220; i++) { g.elapsed += 1 / 60; g.update(1 / 60) }
    g._pushStats(); g._pushCooldown(); g.render()
  })
  await page.locator('.hud-crowd-cue').filter({ hasText: '讨伐小队' }).waitFor()
  await page.screenshot({ path: path.join(output, '01-squad-desktop.png') })
  await page.evaluate(() => {
    const g = window.__crowdTestApp.engine, s = g.enemyManager.crowds.squad
    s.leader.hit(999); g.weaponSystem._onKill(s.leader)
    g._pushStats(); g.render()
  })
  await page.locator('.hud-crowd-cue').filter({ hasText: '破阵追击' }).waitFor()
  await page.screenshot({ path: path.join(output, '02-rout-desktop.png') })
  await page.evaluate(() => {
    const g = window.__crowdTestApp.engine, m = g.enemyManager
    m.crowds.releaseSquad(); m._enemies = []; m._devouring = []; m.crowds.spawnDebt = 0
    m.crowds.startTide()
    for (let i = 0; i < 22; i++) {
      const angle = i * Math.PI * 2 / 22
      m.crowds.spawnTide(g.player.x + Math.cos(angle) * (180 + i * 4), g.player.y + Math.sin(angle) * (180 + i * 3))
    }
    g._pushStats(); g.render()
  })
  await page.locator('.hud-crowd-cue').filter({ hasText: '战獒奔潮' }).waitFor()
  await page.screenshot({ path: path.join(output, '03-tide-desktop.png') })
  await page.evaluate(() => {
    const g = window.__crowdTestApp.engine, m = g.enemyManager
    for (let i = 0; i < 6; i++) {
      const e = m.spawnAt(g.player.x + 20, g.player.y + i * 8, 'knight')
      m._startDevour(e)
    }
    m.enemies.filter(e => e.swarmTide).slice(0, 8).forEach((e, i) => {
      e.x = g.player.x + 50 + i * 3; e.y = g.player.y + (i - 4) * 12; e.hp = .2
    })
    g.weaponSystem.gluttonCombat.update(.01)
    g._pushStats(); g._pushCooldown(); g.render()
  })
  await page.locator('.glutton-status').filter({ hasText: '胃铠' }).waitFor()
  await page.screenshot({ path: path.join(output, '04-overflow-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => window.__crowdTestApp.engine.render())
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await page.screenshot({ path: path.join(output, '05-tide-mobile.png') })
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.evaluate(() => window.__crowdTestApp.engine.finishRun('defeat'))
  await page.locator('.combat-highlights').waitFor()
  assert.match(await page.locator('.combat-highlights').innerText(), /讨伐小队破阵/)
  assert.match(await page.locator('.combat-highlights').innerText(), /饱食酸浪/)
  assert.equal(await page.evaluate(() => window.__crowdTestApp.engine.weaponSystem.stats.swarmKills), 8)
  await page.screenshot({ path: path.join(output, '06-highlights-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await page.screenshot({ path: path.join(output, '07-highlights-mobile.png') })

  // Reproducible frame workload; a local smoke measurement, not an FPS guarantee.
  await page.setViewportSize({ width: 1440, height: 960 })
  const performanceReport = await page.evaluate(() => {
    const g = window.__crowdTestApp.engine, m = g.enemyManager
    g.runFinished = false; g.runState = 'active'; g._pauseLock = 0; g.running = true
    g.player.dead = false; g.player.hp = g.player.maxHp; g.player.invincible = 1e9
    g.worldEvents.update = () => {}; g.player.exp = 0; g.player.maxExp = 1e9
    const director = m.crowds
    const methods = Object.fromEntries(['update', 'steer', 'renderMarker'].map(key => [key, director[key]]))
    m._enemies = []; m._devouring = []; m._texts = []; m._bullets = []; director.reset(); m.wave = 20
    g.elapsed = 100; g._runRandomState = 12345; g._shakeT = 0; g.combatFeedback.reset()
    for (let i = 0; i < 300; i++) {
      const angle = i * 2.399963, radius = 100 + i * .9
      const e = m.spawnAt(g.player.x + Math.cos(angle) * radius, g.player.y + Math.sin(angle) * radius, i % 4 === 0 ? 'hound' : 'knight')
      e.hp = e.maxHp = 1000; e.speed = 100; e._artSeed = i * .01; e._walkT = i * .02; e.attackCd = 99
    }
    const samples = { disabled: [], enabled: [] }, noop = () => false
    // ABBA interleaving controls scene age and renderer/cache drift between batches.
    for (let i = 0; i < 300; i++) {
      const enabled = i % 4 === 0 || i % 4 === 3
      for (const key of Object.keys(methods)) director[key] = enabled ? methods[key] : noop
      const at = performance.now(); g.elapsed += 1 / 60; g.update(1 / 60)
      const updated = performance.now(); g.render()
      if (i >= 60) samples[enabled ? 'enabled' : 'disabled'].push({ frame: performance.now() - at, update: updated - at })
    }
    const summary = list => {
      const frames = list.map(s => s.frame).sort((a, b) => a - b), updates = list.map(s => s.update).sort((a, b) => a - b)
      return { enemies: m.count, frames: frames.length, medianMs: frames[Math.floor(frames.length * .5)],
        p95Ms: frames[Math.floor(frames.length * .95)], updateP95Ms: updates[Math.floor(updates.length * .95)] }
    }
    const disabled = summary(samples.disabled), enabled = summary(samples.enabled)
    return { method: 'interleaved ABBA; ordinary 300-enemy workload', viewport: [innerWidth, innerHeight], disabled, enabled,
      p95Ratio: enabled.p95Ms / disabled.p95Ms }
  })
  assert.deepEqual(errors, [])
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ errors, performance: performanceReport }, null, 2))
  console.log('✓ 桌面与390px窄屏：小队、破阵、潮汐、酸浪与结算高光通过')
  console.log(JSON.stringify(performanceReport))
  console.log(output)
} finally {
  await browser?.close()
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
  db?.close()
  if (path.dirname(path.resolve(fixture)) !== path.resolve(tmpdir()) || !path.basename(fixture).startsWith('slime-crowd-browser-')) throw new Error('Unexpected fixture cleanup path')
  await rm(fixture, { recursive: true, force: true })
}
