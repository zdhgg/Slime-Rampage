import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { once } from 'node:events'
import { createServer as createNetServer } from 'node:net'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { createGameApp } from './server/app.mjs'
import { openDatabase } from './server/database.mjs'

// Real Vue UI + disposable in-memory accounts: never touches player saves.
const db = openDatabase(':memory:')
const server = createGameApp({ db, distDir: path.resolve('dist'), registration: true }).listen(0, '127.0.0.1')
await once(server, 'listening')
const reservation = createNetServer().listen(0, '127.0.0.1')
await once(reservation, 'listening')
const vitePort = reservation.address().port
await new Promise(resolve => reservation.close(resolve))
const vite = await createServer({ server: { host: '127.0.0.1', port: vitePort, strictPort: true, proxy: { '/api': `http://127.0.0.1:${server.address().port}` } } })
await vite.listen()
const output = path.resolve('.workbuddy/boss-tomes-browser')
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, baseURL: `http://127.0.0.1:${vite.httpServer.address().port}` })
const page = await context.newPage(); page.setDefaultTimeout(20000); const errors = [], screenshots = []
page.on('pageerror', e => errors.push(e.message))
const game = fn => page.evaluate(fn)
const saveScreenshot = async name => {
  const file = path.join(output, `${name}.png`)
  await page.screenshot({ path: file, animations: 'disabled' })
  screenshots.push(file)
}
const shot = async name => {
  await page.waitForFunction(() => {
    const overlay = document.querySelector('.reward-overlay')
    return overlay && !overlay.classList.contains('modal-fade-enter-active')
      && getComputedStyle(overlay).opacity === '1'
  })
  await saveScreenshot(name)
}
try {
  const registered = await page.request.post('/api/auth/register', { data: { username: `bt${Date.now().toString(36)}`, password: 'local-playtest-2026' } })
  assert.equal(registered.status(), 201, await registered.text())
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForLoadState('networkidle')
  const reconnect = page.getByRole('button', {name:'重新连接', exact:true})
  if (await reconnect.isVisible()) await reconnect.click()
  await page.waitForFunction(() => !document.querySelector('.auth-layer') || [...document.querySelectorAll('.auth-layer button')].some(button => button.textContent.trim() === '完成'))
  const done = page.getByRole('button', { name: '完成', exact: true })
  if (await done.isVisible()) await done.click()
  await page.locator('.auth-layer').waitFor({ state: 'hidden' })
  await page.locator('[data-playstyle="arena"]').click()
  await page.locator('[data-mode="expedition"]').click()
  await page.locator('[data-strain="ricochet"]').click()
  await page.locator('.config-actions .primary-action').click()
  await page.locator('.deploy-btn').click()
  await page.locator('.briefing-overlay').waitFor({ state: 'hidden' })
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__?._instance?.setupState?.engine)
  // page.evaluate forwards the explicit parameter, unlike the existing no-argument helper.
  const open = (strain, maxed = false) => page.evaluate(async ({ strain, maxed }) => {
    const g = document.querySelector('#app').__vue_app__._instance.setupState.engine
    g.stop(); g._pauseLock = 0; g._chapterSettlement = null
    g.applyStartingStrain(strain); g.reset(); g.stop()
    g.player.hp = 1
    if (maxed) {
      const { BOSS_TOMES } = await import('/src/game/BossTomes.js')
      for (const { id } of BOSS_TOMES[strain]) g.bossSkillLevels[id] = 3
    }
    const { getExpeditionBoss } = await import('/src/game/RunRules.js')
    g.runState = 'expedition-guardian'
    const boss = g.enemyManager.beginExpeditionStageBoss(getExpeditionBoss(g._expeditionDefinition.bossId))
    boss.destroy(); g.weaponSystem._settleKill(boss)
    g._updateExpedition(.7)
  }, { strain, maxed })
  const assertNextChapter = async () => {
    await page.locator('.reward-overlay').waitFor({ state: 'hidden' })
    const state = await game(() => {
      const g = document.querySelector('#app').__vue_app__._instance.setupState.engine
      return { stage: g.expeditionStage, pauseLock: g._pauseLock, fullHealth: g.player.hp === g.player.maxHp }
    })
    assert.deepEqual(state, { stage: 2, pauseLock: 0, fullHealth: true })
  }
  await open('ricochet')
  await page.locator('.tome-options button').first().waitFor()
  assert.equal(await page.locator('.tome-options button').count(), 3)
  assert.equal(await page.locator('[data-icon-missing]').count(), 0)
  assert.equal(await page.locator('.reward-steps').count(), 0)
  await shot('01-desktop-tomes')
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter')
  await assertNextChapter()

  await open('ricochet', true)
  await page.getByRole('heading', { name: '秘典满级补偿', exact: true }).waitFor()
  await page.locator('.levelup-overlay.embedded').waitFor()
  await shot('02-desktop-compensation')
  await page.keyboard.press('Digit1')
  assert.equal(await page.locator('.skill-card.is-selected .key-hint').innerText(), '1')
  await page.keyboard.press('Enter')
  await assertNextChapter()

  await page.setViewportSize({width:390,height:844})
  await open('elemental')
  await page.locator('.tome-options').waitFor()
  await shot('03-mobile-tomes')
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
  const box = await page.locator('.reward-panel').boundingBox()
  assert.ok(box.x >= 0 && box.width <= 390)
  assert.equal(await page.locator('[data-icon-missing]').count(), 0)
  await page.locator('.tome-options button').last().click()
  await assertNextChapter()

  await game(() => {
    const g = document.querySelector('#app').__vue_app__._instance.setupState.engine
    g.stop()
  })
  assert.match(await page.locator('.chapter-intro').innerText(), /进入蓝圈激活信标.*[\s\S]*3:00/)
  const resizeBeacon = async (width, height) => {
    await page.setViewportSize({ width, height })
    await page.waitForFunction(() => {
      const g = document.querySelector('#app').__vue_app__._instance.setupState.engine
      return g.width === innerWidth && g.height === innerHeight
    })
  }
  await resizeBeacon(1440, 960)
  const updateEvent = phase => page.evaluate(phase => {
    const g = document.querySelector('#app').__vue_app__._instance.setupState.engine
    const events = g.worldEvents
    if (phase === 'search') {
      g._activateExpeditionStage()
      events.current.x = g.player.x + 800
      events.current.y = g.player.y
    } else if (phase === 'activate') {
      g.player.x = events.current.x
      g.player.y = events.current.y
      events.update(.3)
    } else if (phase === 'defend') {
      events.update(.4)
      events.update(2)
    } else if (phase === 'return') {
      g.player.x -= 180
      events.update(1)
    } else if (phase === 'complete') {
      g.player.x = events.current.x
      events.update(events.current.goal - events.current.progress)
      g._updateExpedition(0)
    } else if (phase === 'expire') {
      events.update(events.current.timeLeft)
      events.update(2)
    }
    g._pushStats()
    g._pushCooldown()
    g._camInit = false
    g._updateCamera(0)
    // Capture the guide in the real canvas as well as the text in the DOM.
    let markerDrawn = false
    const { ctx } = g
    const fillText = ctx.fillText
    ctx.fillText = function (text, ...args) {
      if (text === '信标' || text === '黏液池') markerDrawn = true
      fillText.call(this, text, ...args)
    }
    try {
      g.render()
    } finally {
      ctx.fillText = fillText
    }
    return markerDrawn
  }, phase)
  const guide = page.locator('.expedition-hud')
  assert.equal(await updateEvent('search'), true)
  assert.match(await guide.innerText(), /3:00[\s\S]*前往信标[\s\S]*→ 80m[\s\S]*进入蓝圈/)
  assert.equal(await page.locator('.objective-hud').count(), 0)
  await saveScreenshot('04-desktop-beacon-search')
  assert.equal(await updateEvent('activate'), false)
  assert.match(await guide.innerText(), /正在激活信标/)
  await updateEvent('defend')
  assert.match(await guide.innerText(), /守住信标圈[\s\S]*2.0 \/ 9 秒/)
  await resizeBeacon(390, 844)
  assert.equal(await updateEvent('return'), true)
  assert.match(await guide.innerText(), /返回信标圈[\s\S]*沿 → 返回蓝圈/)
  const guideBox = await guide.boundingBox()
  assert.ok(guideBox.x >= 0 && guideBox.x + guideBox.width <= 390)
  await saveScreenshot('05-mobile-beacon-return')
  await updateEvent('complete')
  assert.match(await page.locator('.combo-toast').innerText(), /信标已封锁 · 击败信标术士/)
  assert.equal(await page.locator('.expedition-deadline').count(), 0)

  const openObjective = stage => page.evaluate(stage => {
    const g = document.querySelector('#app').__vue_app__._instance.setupState.engine
    g.configureRun({ mode: 'expedition', difficulty: 'hell' })
    g.bossArena.reset()
    g._enterExpeditionStage(stage)
    g._activateExpeditionStage()
    g._pushCooldown()
    g._updateCamera(0)
    g.render()
  }, stage)
  for (const [stage, metric] of [
    [1, '击杀 0 / 60'], [3, '精英 0 / 7'], [4, '剩余 1:30'], [7, '精英 0 / 9'],
    [8, '击杀 0 / 120'], [10, '剩余 2:00'], [11, '精英 0 / 12'],
  ]) {
    await openObjective(stage)
    assert.ok((await guide.innerText()).includes(metric))
    if (stage === 4) {
      assert.match(await guide.innerText(), /带标记的敌人[\s\S]*巢心耐久/)
      await saveScreenshot('06-mobile-nest-defense')
    }
  }

  for (const [stage, kills] of [[5, 75], [6, 90]]) {
    await openObjective(stage)
    assert.equal(await updateEvent('search'), true)
    assert.match(await guide.innerText(), new RegExp('击杀 0 / ' + kills + '[\\s\\S]*污染黏液池 0 / 1'))
    assert.match(await guide.innerText(), /激活限时[\s\S]*0:44[\s\S]*进入绿圈/)
    assert.equal(await updateEvent('activate'), false)
    await updateEvent('defend')
    assert.equal(await updateEvent('return'), false)
    assert.match(await guide.innerText(), /躲避追猎[\s\S]*剩余 0:09[\s\S]*离开绿圈也会推进/)
    await updateEvent('complete')
    assert.match(await guide.innerText(), /污染黏液池 1 \/ 1/)
  }

  await openObjective(9)
  assert.equal(await updateEvent('search'), true)
  assert.match(await guide.innerText(), /激活限时[\s\S]*0:44[\s\S]*前往信标/)
  await updateEvent('activate')
  await updateEvent('defend')
  assert.match(await guide.innerText(), /封锁限时[\s\S]*0:20[\s\S]*2.0 \/ 9 秒/)
  await updateEvent('expire')
  assert.match(await guide.innerText(), /等待信标出现[\s\S]*0:42/)
  await openObjective(12)
  const bossHud = page.locator('.boss-hud')
  const cast = bossHud.locator('.boss-telegraph')
  const phase = bossHud.locator('.boss-phase-cue')
  assert.equal((await bossHud.innerText()).trim(), '讨伐统帅 雷欧尼斯')

  const assertBossPosition = async ({ width, belowPlayerHud = false, besidePlayerHud = false }) => {
    const boss = await bossHud.boundingBox()
    assert.ok(boss.x <= 24 && boss.x + boss.width < width / 2 + 40)
    assert.ok(boss.height < 85)
    const playerHud = await page.locator('.hud-level').boundingBox()
    if (belowPlayerHud) assert.ok(boss.y >= playerHud.y + playerHud.height)
    if (besidePlayerHud) assert.ok(boss.x + boss.width <= playerHud.x)
  }
  await assertBossPosition({ width: 390, belowPlayerHud: true })
  await resizeBeacon(1440, 960)
  await game(() => {
    const g = document.querySelector('#app').__vue_app__._instance.setupState.engine
    g.applyStartingStrain('glutton')
    g.reset()
    g.stop()
  })
  await openObjective(1)
  const warden = state => page.evaluate(state => {
    const g = document.querySelector('#app').__vue_app__._instance.setupState.engine
    if (state === 'spawn') {
      g.weaponSystem.kills += g._expeditionDefinition.target
      g._updateExpedition(0)
      const boss = g.enemyManager._boss
      boss.x = g.player.x + 108
      boss.y = g.player.y - 126
      boss._spawnT = 0
      // Show the current battlefield and telegraph in the static fixture.
      g._worldBgPrev = null
      g.enemyManager._texts.length = 0
      g.dialogue.reset()
    }
    const boss = g.enemyManager._boss
    if (state === 'start') boss._prepare('thrust')
    if (state === 'half') boss.specialTimer = boss.specialDuration / 2
    if (state === 'stop') boss.cancelAttack()
    if (state === 'phase') boss._enterPhaseTwo()
    if (['spawn', 'phase', 'snapshot'].includes(state)) g._pushStats()
    g._pushCooldown()
    g._updateCamera(0)
    g.render()
  }, state)
  await warden('spawn')
  const restBox = await bossHud.boundingBox()
  assert.equal((await bossHud.innerText()).trim(), '边防官 洛恩')
  assert.equal(await cast.count(), 0)
  assert.equal(await phase.count(), 0)
  await warden('start')
  assert.match(await cast.innerText(), /长枪突刺/)
  assert.equal(await cast.locator('em').evaluate(el => el.style.width), '0%')
  await warden('half')
  assert.equal(await cast.locator('em').evaluate(el => el.style.width), '50%')
  await assertBossPosition({ width: 1440 })
  await saveScreenshot('07-desktop-boss-telegraph')
  await resizeBeacon(1024, 768)
  await assertBossPosition({ width: 1024, besidePlayerHud: true })
  await resizeBeacon(390, 844)
  await warden('half')
  await assertBossPosition({ width: 390, belowPlayerHud: true })
  await saveScreenshot('08-mobile-boss-telegraph')
  await resizeBeacon(320, 640)
  await assertBossPosition({ width: 320, belowPlayerHud: true })
  await resizeBeacon(1440, 960)
  await warden('stop')
  await cast.waitFor({ state: 'hidden' })
  assert.equal((await bossHud.boundingBox()).height, restBox.height)
  await warden('phase')
  assert.equal(await phase.innerText(), '进入阶段 2')
  await phase.waitFor({ state: 'hidden', timeout: 4000 })
  await warden('snapshot')
  assert.equal(await phase.count(), 0)

  await resizeBeacon(390, 844)
  await game(async () => {
    const g = document.querySelector('#app').__vue_app__._instance.setupState.engine
    const { getBossWavePlan } = await import('/src/game/RunRules.js')
    const { getEndlessBountyChoices } = await import('/src/game/EndlessMode.js')
    g.configureRun({ mode: 'endless', difficulty: 'normal' })
    g.reset()
    g.stop()
    const choice = getEndlessBountyChoices()[0]
    g.endlessBounty = { ...choice, baseline: 0, startedAt: g.elapsed }
    g.worldEvents.spawnEvent('surge')
    g.enemyManager.wave = 40
    g.enemyManager.spawnBossGroup(getBossWavePlan(g.runSelection, 40))
    g._pushStats()
    g._pushCooldown()
    g._updateCamera(0)
    g.render()
  })
  assert.equal(await bossHud.locator('.boss-members [role="progressbar"]').count(), 3)
  assert.match(await bossHud.innerText(), /增援待命 ×2[\s\S]*护卫/)
  const group = await bossHud.boundingBox()
  const bounty = await page.locator('.endless-bounty-hud').boundingBox()
  const event = await page.locator('.objective-hud').boundingBox()
  assert.ok(group.y + group.height <= bounty.y)
  assert.ok(bounty.y + bounty.height <= event.y)

  assert.deepEqual(errors, [])
  console.log('浏览器验证通过：BOSS 秘典换章、章节指引、首领血条、瞬时蓄力/阶段提示及编队布局。')
  console.log(JSON.stringify(screenshots))
} catch (error) {
  await page.screenshot({path:path.join(output,'failure.png')})
  console.error(JSON.stringify({errors, body:(await page.locator('body').innerText()).slice(0,1800)}))
  throw error
} finally {
  await browser.close(); await vite.close(); await new Promise(resolve=>server.close(resolve)); db.close()
}
