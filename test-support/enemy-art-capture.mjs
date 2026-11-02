// Real-UI capture of the migrated enemies (all nine roles) in Arena combat.
//   GAME_URL=http://127.0.0.1:13093 DPR=2 node test-support/enemy-art-capture.mjs [tag]
// Needs the normal backend (isolated SLIME_DATA_DIR) behind the running Vite dev server.
// Only for VISUAL review: the non-knight types are spawned next to the player through the
// engine's own spawnAt because they otherwise appear minutes into a run. Nothing else is
// touched; combat, clocks and rendering run untouched.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core')
const base = process.env.GAME_URL || 'http://127.0.0.1:13093'
const dpr = Number(process.env.DPR || 1)
const tag = process.argv[2] || `dpr${dpr}`
const out = resolve('.tmp-enemy-art/game')
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr })
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
const ENGINE = `document.querySelector('.game-canvas').__vueParentComponent.setupState.engine`
try {
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '注册', exact: true }).click()
  await page.getByRole('textbox', { name: '账号名' }).fill(`e${Date.now().toString(36)}`)
  await page.locator('input[type=password]').fill('isolated-enemy-art-2026')
  await page.getByRole('button', { name: '创建账号', exact: true }).click()
  await page.getByText(/^已登录：/).waitFor({ state: 'visible', timeout: 20000 })
  await page.getByText('选择战斗类型', { exact: true }).click()
  await page.getByText('进入设置', { exact: true }).click()
  await page.getByRole('button').filter({ hasText: '简单' }).first().click()
  await page.getByRole('button', { name: '开始行动', exact: true }).click()
  const confirm = page.getByRole('button', { name: '确认出发', exact: true })
  try { await confirm.waitFor({ state: 'visible', timeout: 4000 }); await confirm.click() } catch {}
  await page.waitForFunction(`${ENGINE}?.running`, null, { timeout: 20000 })
  await page.waitForTimeout(1500)
  // visual-review helper: a few non-knight enemies around the player (see header comment)
  await page.evaluate(`(() => {
    const e = ${ENGINE}, p = e.player
    const ring = [['mage', -210, -90], ['mage', 230, 40], ['mage', -60, 190], ['hound', 260, -120], ['hound', -280, 60], ['hound', 40, 260],
      ['assassin', -240, -200], ['assassin', 300, 150], ['archer', 20, -250], ['archer', -300, -20], ['archer', 280, -40],
      ['priest', -320, -60], ['priest', 160, 220], ['berserker', -140, -260], ['berserker', 320, -140], ['golem', -260, 140], ['golem', 240, 260], ['wraith', 60, -300], ['wraith', -180, 300]]
    for (const [type, dx, dy] of ring) e.enemyManager.spawnAt(p.x + dx, p.y + dy, type)
    // P3 取证：南侧一簇骑士看个体差异与遮挡排序，再加一只精英骑士看金边
    e.enemyManager.spawnAt(p.x - 110, p.y + 150, 'knight')
    e.enemyManager.spawnAt(p.x - 60, p.y + 180, 'knight')
    e.enemyManager.spawnAt(p.x - 150, p.y + 200, 'knight')
    e.enemyManager.spawnAt(p.x + 40, p.y + 190, 'knight', { elite: true })
    e.enemyManager.spawnAt(p.x + 90, p.y - 170, 'knight', { elite: true })
    // one berserker starts wounded: it enrages and doubles as the priest's heal target
    const ber = e.enemyManager.enemies.find(q => q.type === 'berserker')
    if (ber) { ber.hp = ber.maxHp * .4; ber.hit(0) }
  })()`)

  const probe = () => page.evaluate(`(() => {
    const e = ${ENGINE}, cam = e.camera, p = e.player, list = e.enemyManager.enemies.filter(q => q.active)
    const vis = q => q.x > cam.x + 40 && q.x < cam.x + e.width - 40 && q.y > cam.y + 40 && q.y < cam.y + e.height - 40
    const at = q => q && ({ x: q.x - cam.x, y: q.y - cam.y })
    return {
      t: e.elapsed, dpr: e.dpr, W: e.width, H: e.height, count: list.length, visible: list.filter(vis).length,
      swing: at(list.find(q => q.type === 'knight' && q._swingT > 0 && vis(q))),
      windup: at(list.find(q => q.type === 'knight' && !q._moving && q._swingT <= 0 && q.attackCd > 0 && q.attackCd < .25 && vis(q))),
      charge: at(list.find(q => q.type === 'mage' && !q._moving && q._shootFlash <= 0 && q.attackCd > 0 && q.attackCd < .45 && vis(q))),
      fire: at(list.find(q => q.type === 'mage' && q._shootFlash > 0 && vis(q))),
      hurt: at(list.find(q => q.flash > .06 && vis(q))),
      walk: at(list.find(q => q.type === 'knight' && q._moving && vis(q))),
      houndRun: at(list.find(q => q.type === 'hound' && q._moving && vis(q))),
      houndCrouch: at(list.find(q => q.type === 'hound' && !q._moving && q._swingT <= 0 && q.attackCd > 0 && q.attackCd < .25 && vis(q))),
      houndBite: at(list.find(q => q.type === 'hound' && q._swingT > 0 && vis(q))),
      assassinStalk: at(list.find(q => q.type === 'assassin' && q.assassinState === 'stalking' && vis(q))),
      assassinCharge: at(list.find(q => q.type === 'assassin' && q.assassinState === 'charging' && vis(q))),
      assassinDash: at(list.find(q => q.type === 'assassin' && q.assassinState === 'dashing' && vis(q))),
      assassinDazed: at(list.find(q => q.type === 'assassin' && q.assassinState === 'cooldown' && !q._moving && vis(q))),
      archerWalk: at(list.find(q => q.type === 'archer' && q._moving && vis(q))),
      archerDraw: at(list.find(q => q.type === 'archer' && !q._moving && q._shootFlash <= 0 && q.attackCd > 0 && q.attackCd < .4 && vis(q))),
      archerRelease: at(list.find(q => q.type === 'archer' && q._shootFlash > 0 && vis(q))),
      priestHeal: at(list.find(q => q.type === 'priest' && q._healBeamTimer > 0 && vis(q))),
      priestIdle: at(list.find(q => q.type === 'priest' && !q._moving && q._healBeamTimer <= 0 && vis(q))),
      berserkerRage: at(list.find(q => q.type === 'berserker' && q.isEnraged && vis(q))),
      berserkerSwing: at(list.find(q => q.type === 'berserker' && q._swingT > 0 && vis(q))),
      golemSlam: at(list.find(q => q.type === 'golem' && q._swingT > 0 && vis(q))),
      golemStomp: at(list.find(q => q.type === 'golem' && q._moving && vis(q))),
      wraithGrasp: at(list.find(q => q.type === 'wraith' && q._swingT > 0 && vis(q))),
      wraithDrift: at(list.find(q => q.type === 'wraith' && q._moving && vis(q))),
      elite: at(list.find(q => q.type === 'knight' && q.isElite && vis(q))),
      crowd: at(list.find(q => q.type === 'knight' && !q.isElite && q.y > p.y && vis(q))),
      overlap: { x: p.x - cam.x, y: p.y - cam.y },
    }
  })()`)
  const taken = new Set(), log = []
  const clip = async (name, pos, w = 300, h = 220) => {
    if (!pos || taken.has(name)) return
    taken.add(name)
    const x = Math.max(0, Math.min(1440 - w, pos.x - w / 2)), y = Math.max(0, Math.min(900 - h, pos.y - h * .55))
    await page.screenshot({ path: resolve(out, `${tag}-${name}.png`), clip: { x, y, width: w, height: h } })
    log.push(name)
  }
  const pickUpgrade = () => page.evaluate(`(() => {
    if (${ENGINE}.running) return false
    const card = document.querySelector('.skill-card') || document.querySelector('.milestone-card') || document.querySelector('.reward-options .rest')
    if (card) card.click()
    return !!card
  })()`)
  const keys = ['KeyD', 'KeyS', 'KeyA', 'KeyW']
  const NAMES = ['swing', 'windup', 'charge', 'fire', 'hurt', 'walk', 'houndRun', 'houndCrouch', 'houndBite', 'assassinStalk', 'assassinCharge', 'assassinDash', 'assassinDazed', 'archerWalk', 'archerDraw', 'archerRelease', 'priestHeal', 'priestIdle', 'berserkerRage', 'berserkerSwing', 'golemSlam', 'golemStomp', 'wraithGrasp', 'wraithDrift', 'elite', 'crowd', 'overlap']
  let k = 0, snapshotFull = false
  for (let i = 0; i < 900 && taken.size < NAMES.length; i++) {
    if (await pickUpgrade()) { await page.waitForTimeout(200); continue }
    // walk for a while, then stand still so knights can close in and swing
    if (i % 60 === 0) { await page.keyboard.up(keys[(k + 3) % 4]).catch(() => {}); await page.keyboard.down(keys[k % 4]); k++ }
    if (i % 60 === 22) await page.keyboard.up(keys[(k + 3) % 4]).catch(() => {})
    const s = await probe()
    for (const name of NAMES) await clip(name, s[name], name === 'crowd' || name === 'overlap' ? 560 : 300, name === 'crowd' || name === 'overlap' ? 400 : 220)
    if (!snapshotFull && s.visible >= 8 && taken.size >= 5) { snapshotFull = true; await page.screenshot({ path: resolve(out, `${tag}-full.png`) }) }
    await page.waitForTimeout(80)
  }
  await page.keyboard.up(keys[(k + 3) % 4]).catch(() => {})
  if (!snapshotFull) await page.screenshot({ path: resolve(out, `${tag}-full.png`) })
  const info = await page.evaluate(`(() => {
    const e = ${ENGINE}
    const byType = {}
    for (const q of e.enemyManager.enemies) if (q.active) byType[q.type] = (byType[q.type] || 0) + 1
    return { dpr: e.dpr, elapsed: e.elapsed, enemies: e.enemyManager.enemies.filter(q => q.active).length, byType }
  })()`)
  writeFileSync(resolve(out, `${tag}-info.json`), JSON.stringify({ info, captured: log, errors }, null, 1))
  console.log(JSON.stringify({ info, captured: log, errors }))
} catch (error) {
  errors.push(error.message.split('\n')[0])
  await page.screenshot({ path: resolve(out, `${tag}-error.png`) }).catch(() => {})
  console.log('FAILED', errors.join(' | '))
}
await browser.close()
