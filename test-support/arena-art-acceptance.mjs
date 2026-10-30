// Real UI acceptance against an isolated backend. No auth stubs, enemy spawning,
// clock acceleration, combat-state writes or save-data edits are used.
// Start the normal backend with SLIME_DATA_DIR pointing at a fresh temp folder,
// then Vite with the matching SLIME_PORT. Set PLAYWRIGHT_MODULE to the installed
// playwright-core entry if it is not resolvable locally. No dependency is added.
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core')
const base = process.env.ART_ACCEPTANCE_URL || 'http://127.0.0.1:13023'
const output = resolve('docs/arena-art-acceptance')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
const save = async (name, data) => writeFile(resolve(output, name), data)
try {
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '注册', exact: true }).click()
  await page.getByRole('textbox', { name: '账号名' }).fill(`art_${Date.now().toString(36)}`)
  await page.locator('input[type=password]').fill('isolated-art-acceptance-2026')
  await page.getByRole('button', { name: '创建账号', exact: true }).click()
  await page.getByText(/^已登录：/).waitFor({ state: 'visible', timeout: 20000 })
  await page.getByText('选择战斗类型', { exact: true }).click()
  await page.getByText('进入设置', { exact: true }).click()
  await page.getByRole('button').filter({ hasText: '简单' }).first().click()
  await page.getByRole('button', { name: '开始行动', exact: true }).click()
  // Older Arena builds opened a confirmation sheet after “开始行动”; the
  // current flow starts directly. Keep the acceptance path compatible with
  // both without changing game state or bypassing the real menu.
  const confirmDeparture = page.getByRole('button', { name: '确认出发', exact: true })
  try { await confirmDeparture.waitFor({ state: 'visible', timeout: 5000 }); await confirmDeparture.click() } catch {}
  await page.waitForFunction(() => document.querySelector('.game-canvas').__vueParentComponent.setupState.engine.running)
  await page.evaluate(async () => {
    const e = document.querySelector('.game-canvas').__vueParentComponent.setupState.engine
    const { getArenaKnightFrameCache } = await import('/src/game/ArenaKnightFrameCache.js')
    const { getArenaMageFrameCache } = await import('/src/game/ArenaMageFrameCache.js')
    const { AssetManager } = await import('/src/game/AssetManager.js')
    window.acceptance = { samples: [], captures: {}, calls: { knight: 0, mage: 0, art: {} }, choices: [], mode: 'DPR1', cache: [] }
    const audit = window.acceptance
    for (const [name, cache] of [['knight', getArenaKnightFrameCache()], ['mage', getArenaMageFrameCache()]]) {
      const draw = cache.draw
      cache.draw = function (...args) { audit.calls[name]++; return draw.apply(this, args) }
      audit.cache.push({ name, ...cache.snapshot() })
    }
    const assets = AssetManager.getInstance(), drawArt = assets.drawArt
    assets.drawArt = function (ctx, key, ...args) { audit.calls.art[key] = (audit.calls.art[key] || 0) + 1; return drawArt.call(this, ctx, key, ...args) }
    const update = e.update, render = e.render
    let updateMs = 0, last = performance.now()
    e.update = function (...args) { const t = performance.now(); const result = update.apply(this, args); updateMs = performance.now() - t; return result }
    e.render = function (...args) {
      const t = performance.now(), result = render.apply(this, args), end = performance.now()
      const enemies = this.enemyManager.enemies.filter(q => q.active), cam = this.camera
      const visible = enemies.filter(q => q.x > cam.x && q.x < cam.x + this.width && q.y > cam.y && q.y < cam.y + this.height)
      const byType = {}; enemies.forEach(q => { byType[q.type] = (byType[q.type] || 0) + 1 })
      const player = this.player
      const sample = { t: this.elapsed, update: updateMs, render: end - t, interval: end - last, count: enemies.length, visible: visible.length, byType, hp: player.hp, moveBlend: player.moveBlend, flash: player.flash, invincible: player.invincible, blink: player._blink, stopJitter: player._stopJitter, devourPulse: player._devourPulse, dpr: this.dpr, mode: audit.mode, stage: this.expeditionStage, variant: this._mapVariant }
      if (audit.samples.length < 20000) audit.samples.push(sample)
      last = end
      let faceState = 'idle'
      if (player.flash > 0 || (player.invincible > 0 && Math.floor(player.invincible * 10) % 2 === 0)) faceState = 'hurt'
      else if (player._devourPulse > .03) faceState = 'devour'
      else if (player.hp <= player.maxHp * .3) faceState = 'lowhp'
      else if (player._blink > 0) faceState = 'blink'
      else if (player.moveBlend > .65) faceState = 'angry'
      sample.faceState = faceState
      const flags = { knightAttack: visible.some(q => q.type === 'knight' && q._swingT > 0), mageCast: visible.some(q => q.type === 'mage' && q._shootFlash > 0), mixed: visible.some(q => q.type === 'mage') && visible.some(q => q.type === 'knight') }
      for (const [key, value] of Object.entries(flags)) if (value && !audit.captures[key]) audit.captures[key] = { ...sample, image: this.canvas.toDataURL() }
      if (player.moveBlend > .75 && !audit.captures['slime-moving']) audit.captures['slime-moving'] = { ...sample, image: this.canvas.toDataURL() }
      if (player._stopJitter > .08 && player.moveBlend < .65 && !audit.captures['slime-stop']) audit.captures['slime-stop'] = { ...sample, image: this.canvas.toDataURL() }
      if (faceState !== 'idle' && !audit.captures[`slime-face-${faceState}`]) audit.captures[`slime-face-${faceState}`] = { ...sample, image: this.canvas.toDataURL() }
      if (visible.length > (audit.peak?.visible || 0) && visible.length >= 20) audit.peak = { ...sample, image: this.canvas.toDataURL() }
      return result
    }
    let held = new Set()
    audit.inputTimer = setInterval(() => {
      if (!e.running) {
        const cards = [...document.querySelectorAll('.skill-card')]
        const healing = cards.find(c => /再生|生命上限|最大生命/.test(c.textContent))
        const offense = cards.find(c => /弹数|飞弹|射速/.test(c.textContent)) || cards.find(c => /攻击/.test(c.textContent))
        const card = offense || healing || cards[0]
        const milestone = [...document.querySelectorAll('.milestone-card')].find(c => /机枪/.test(c.textContent)) || document.querySelector('.milestone-card')
        const reward = document.querySelector('.reward-options .rest')
        const choice = card || milestone || reward
        if (choice) { audit.choices.push({ t: e.elapsed, text: choice.textContent }); choice.click() }
        return
      }
      const p = e.player, enemies = e.enemyManager.enemies.filter(q => q.active)
      let best = { score: -Infinity, x: 1, y: 0 }
      for (let j = 0; j < 16; j++) {
        const a = j * Math.PI / 8, dx = Math.cos(a), dy = Math.sin(a), tx = p.x + dx * 180, ty = p.y + dy * 180
        let score = tx < 140 || tx > e.worldWidth - 140 || ty < 140 || ty > e.worldHeight - 140 ? -100 : 0
        for (const q of enemies) score -= 1400 / Math.max(Math.hypot(tx - q.x, ty - q.y), 15)
        score += Math.cos(a - e.elapsed * .09) * .15
        if (score > best.score) best = { score, x: dx, y: dy }
      }
      const next = new Set()
      const briefRest = e.elapsed % 12 > 10.5
      if (!briefRest) {
        if (best.x > .3) next.add('d'); if (best.x < -.3) next.add('a'); if (best.y > .3) next.add('s'); if (best.y < -.3) next.add('w')
      }
      for (const key of held) if (!next.has(key)) window.dispatchEvent(new KeyboardEvent('keyup', { key, code: 'Key' + key.toUpperCase() }))
      for (const key of next) window.dispatchEvent(new KeyboardEvent('keydown', { key, code: 'Key' + key.toUpperCase() }))
      held = next
      if (enemies.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 120)) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' })); window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space' }))
      }
    }, 120)
    window.acceptanceEngine = e
  })
  const cdp = await context.newCDPSession(page)
  const flags = new Set()
  const started = Date.now()
  for (let i = 0; i < 380; i++) {
    await page.waitForTimeout(500)
    const state = await page.evaluate(() => ({ t: acceptanceEngine.elapsed, running: acceptanceEngine.running, hp: acceptanceEngine.player.hp, stage: acceptanceEngine.expeditionStage, last: acceptance.samples.at(-1), captures: Object.keys(acceptance.captures), result: !!document.querySelector('.gameover-overlay') }))
    if (i % 20 === 0) console.log(JSON.stringify(state))
    if (state.running && state.t > 12 && !flags.has('normal')) { await page.screenshot({ path: resolve(output, 'real-normal.png') }); flags.add('normal') }
    if (state.running && state.captures.includes('mixed') && !flags.has('mixed')) {
      await page.screenshot({ path: resolve(output, 'real-mixed.png') }); flags.add('mixed')
      await page.evaluate(() => {
        const stream = acceptanceEngine.canvas.captureStream(24), chunks = []
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
        recorder.ondataavailable = ev => { if (ev.data.size) chunks.push(ev.data) }
        recorder.onstop = () => { const reader = new FileReader(); reader.onload = () => acceptance.video = reader.result; reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' })); stream.getTracks().forEach(track => track.stop()) }
        recorder.start(); setTimeout(() => recorder.stop(), 12000)
      })
    }
    if (state.running && state.t > 125 && !flags.has('DPR2')) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })
      await page.waitForTimeout(250)
      await page.evaluate(() => { acceptance.mode = 'DPR2'; window.dispatchEvent(new Event('resize')) })
      await save('real-dpr2.png', Buffer.from((await page.evaluate(() => acceptanceEngine.canvas.toDataURL())).split(',')[1], 'base64')); flags.add('DPR2')
    }
    if (state.running && state.t > 137 && !flags.has('DPR3')) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 3, mobile: false })
      await page.waitForTimeout(250)
      await page.evaluate(() => { acceptance.mode = 'DPR3-cap2'; window.dispatchEvent(new Event('resize')) })
      await save('real-dpr3.png', Buffer.from((await page.evaluate(() => acceptanceEngine.canvas.toDataURL())).split(',')[1], 'base64')); flags.add('DPR3')
    }
    if (state.running && state.t > 149 && !flags.has('zoom')) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1152, height: 720, deviceScaleFactor: 1.25, mobile: false })
      await page.waitForTimeout(250)
      await page.evaluate(() => { acceptance.mode = 'zoom125-emulated'; window.dispatchEvent(new Event('resize')) })
      await save('real-zoom125.png', Buffer.from((await page.evaluate(() => acceptanceEngine.canvas.toDataURL())).split(',')[1], 'base64')); flags.add('zoom')
    }
    if (state.result || (state.t > 162 && state.captures.includes('mageCast')) || Date.now() - started > 195000 || state.hp <= 0) break
  }
  const data = await page.evaluate(() => {
    clearInterval(acceptance.inputTimer)
    return { ...acceptance, inputTimer: undefined, viewport: { css: [acceptanceEngine.width, acceptanceEngine.height], canvas: [acceptanceEngine.canvas.width, acceptanceEngine.canvas.height], browserDpr: devicePixelRatio, engineDpr: acceptanceEngine.dpr }, url: location.href, strain: acceptanceEngine.player.strainId }
  })
  data.quality = await page.evaluate(async () => {
    const { drawArenaKnightA } = await import('/src/game/ArenaKnightPrototype.js')
    const { drawArenaMageA } = await import('/src/game/ArenaMagePrototype.js')
    const results = []
    for (const [name, draw, radius] of [['knight', drawArenaKnightA, 14 * 1.52], ['mage', drawArenaMageA, 13 * 1.45]]) {
      const c = document.createElement('canvas'); c.width = c.height = 128
      const x = c.getContext('2d'); x.translate(64, 64); draw(x, radius)
      const pixels = x.getImageData(0, 0, 128, 128).data
      let outsideAlphaPixels = 0, minX = 128, minY = 128, maxX = -1, maxY = -1
      for (let py = 0; py < 128; py++) for (let px = 0; px < 128; px++) if (pixels[(py * 128 + px) * 4 + 3] > 0) {
        minX = Math.min(minX, px); minY = Math.min(minY, py); maxX = Math.max(maxX, px); maxY = Math.max(maxY, py)
        if (px < 32 || px >= 96 || py < 32 || py >= 96) outsideAlphaPixels++
      }
      results.push({ name, bboxRelative: [minX - 64, minY - 64, maxX - 64, maxY - 64], outside64SurfaceAlphaPixels: outsideAlphaPixels })
    }
    return { bounds: results, quarterRadianPhase: Math.PI / 2, realtimeStepAtQuarterRadian: Math.sin(Math.PI / 2 * Math.PI * 2), cachedQuarterCycleStep: 1 }
  })
  for (const [name, capture] of Object.entries(data.captures)) { await save(`real-${name}.png`, Buffer.from(capture.image.split(',')[1], 'base64')); delete capture.image }
  if (data.peak) { await save('real-peak-density.png', Buffer.from(data.peak.image.split(',')[1], 'base64')); delete data.peak.image }
  if (data.video) { await save('real-battle.webm', Buffer.from(data.video.split(',')[1], 'base64')); delete data.video }
  await save('runtime.json', JSON.stringify({ ...data, errors, flags: [...flags], wallSeconds: (Date.now() - started) / 1000 }, null, 2))
  console.log('Saved real authenticated Arena artifacts; flags:', [...flags].join(', '))
} finally { await browser.close() }
