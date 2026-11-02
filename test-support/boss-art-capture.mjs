// Real-UI capture of the migrated Arena bosses (new enemy-art casts) in combat.
//   GAME_URL=http://127.0.0.1:13093 DPR=2 node test-support/boss-art-capture.mjs [tag]
// Needs the normal backend (isolated SLIME_DATA_DIR) behind the running Vite dev server.
// Only for VISUAL review: bosses are spawned through the engine's own
// beginExpeditionStageBoss / spawnBoss because they otherwise appear minutes into a
// run, and individual bosses are then frozen (b.update = no-op) so each named
// presentation state can be held for a deterministic screenshot. Combat code,
// clocks and rendering otherwise run untouched; nothing here mutates game code.
//
// Field map used to hold each named state (all read by attackPresentation/_artState):
//   idle      specialState='idle'  + _moving=false
//   moving    _moving=true + _walkT advanced (gait frame)
//   telegraph specialState='telegraph' + specialDuration/specialTimer (windup; ranged adds casting='charge')
//   release   specialState='dash'/'step' (strike frame; ranged adds casting='fire')
//   recover   specialState='recover' + _recoveryDuration
//   roar      phaseShift>0 (attackPresentation stage='phase' -> stance='roar')
//   enraged   enraged=true + phase=2 (r_* twin frames + enraged ring)
//   hurt      flash>0 (white silhouette twin overlay)
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core')
const base = process.env.GAME_URL || 'http://127.0.0.1:13093'
const dpr = Number(process.env.DPR || 1)
const tag = process.argv[2] || `dpr${dpr}`
const out = resolve('.tmp-boss-art/game')
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

  // Spawn pass 1: the three expedition stage bosses (they enter _finale mode, so no
  // further waves queue up behind them), ringed around the player with a few
  // ordinary knights for scale; each is then frozen for deterministic shots.
  const spawned = await page.evaluate(`(() => {
    const e = ${ENGINE}, p = e.player
    return (async () => {
      const { EXPEDITION_BOSSES } = await import('/src/game/RunRules.js')
      const em = e.enemyManager
      const place = (b, dx, dy) => { b.x = p.x + dx; b.y = p.y + dy; return b }
      // the stage-boss entry is single-boss by design (spawnBoss bails on a second
      // boss without allowMultiple); the siblings go through the same
      // encounter-driven constructor path with allowMultiple so all three coexist
      const warden = place(em.beginExpeditionStageBoss(EXPEDITION_BOSSES.border_warden), -260, -40)
      const ash = place(em.spawnBoss({ encounter: EXPEDITION_BOSSES.ash_paladin, allowMultiple: true }), 270, -70)
      const inq = place(em.spawnBoss({ encounter: EXPEDITION_BOSSES.nest_inquisitor, allowMultiple: true }), 60, 235)
      for (const [dx, dy] of [[-150, 150], [160, 165], [-70, -200], [60, -170]]) {
        const k = em.spawnAt(p.x + dx, p.y + dy, 'knight')
        if (k) { k._spawnT = 0; k.update = () => {} } // frozen: scale props only, must not kill the slime
      }
      for (const b of [warden, ash, inq]) {
        b.attackCd = 0; b.specialCd = 1e9
        b.cancelAttack?.({ preserveVulnerability: true })
        b._spawnT = 0 // update() is frozen below, so clear the spawn-pop timer by hand
        b.update = () => {} // freeze: held states never tick down
      }
      // anything already on the field freezes too: the slime must survive the whole shoot
      for (const q of em.enemies) if (q && q.update) { q._spawnT = 0; q.update = () => {} }
      return {
        warden: { type: warden.type, stageBossId: warden.stageBossId, artId: warden.artId, r: warden.radius },
        ash: { type: ash.type, stageBossId: ash.stageBossId, artId: ash.artId, r: ash.radius },
        inq: { type: inq.type, stageBossId: inq.stageBossId, artId: inq.artId, r: inq.radius },
      }
    })()
  })()`)
  await page.waitForTimeout(600)

  // _separate() shoves frozen bosses every frame, so each patch re-pins the
  // boss to its tableau slot relative to the player before the screenshot
  const SLOTS = { warden: [-260, -40], ash: [270, -70], inq: [60, 235], mage: [-250, 150] }
  const setState = (find, patch, slot) => page.evaluate(`(() => {
    const e = ${ENGINE}, p = e.player
    const q = ${find}
    if (!q) return null
    const [dx, dy] = ${JSON.stringify(slot || [0, 0])}
    if (dx || dy) { q.x = p.x + dx; q.y = p.y + dy }
    Object.assign(q, ${JSON.stringify(patch)})
    // telegraph overlays draw at targetX/targetY: pin them on the slime
    q.targetX = p.x; q.targetY = p.y
    return q.attackPresentation.stage
  })()`)
  // re-centre a boss near the player and report its screen position + live stage
  const probe = find => page.evaluate(`(() => {
    const e = ${ENGINE}, cam = e.camera, p = e.player
    const q = ${find}
    if (!q) return null
    return { x: q.x - cam.x, y: q.y - cam.y, stage: q.attackPresentation.stage, stageBossId: q.stageBossId || null, artId: q.artId, enraged: q.enraged }
  })()`)
  const taken = new Set(), log = []
  const clip = async (name, pos, w = 340, h = 280) => {
    if (!pos) { errors.push(`no position for ${name}`); return }
    taken.add(name)
    const x = Math.max(0, Math.min(1440 - w, pos.x - w / 2)), y = Math.max(0, Math.min(900 - h, pos.y - h * .55))
    await page.screenshot({ path: resolve(out, `${tag}-${name}.png`), clip: { x, y, width: w, height: h } })
    log.push(`${name}@${pos.artId || '?'}:${pos.stage}`)
  }
  const WARDEN = `e.enemyManager.enemies.find(q => q.stageBossId === 'border_warden')`
  const ASH = `e.enemyManager.enemies.find(q => q.stageBossId === 'ash_paladin')`
  const INQ = `e.enemyManager.enemies.find(q => q.stageBossId === 'nest_inquisitor')`
  const MAGE = `e.enemyManager.enemies.find(q => q.type === 'boss-mage' && !q.stageBossId)`

  // --- named states, each held on a specific boss around the slime ---
  const shots = [
    ['idle', WARDEN, SLOTS.warden, { specialState: 'idle', _moving: false, enraged: false, phaseShift: 0, flash: 0 }],
    ['moving', WARDEN, SLOTS.warden, { specialState: 'idle', _moving: true, _walkT: 1.1, enraged: false, phaseShift: 0 }],
    ['telegraph', ASH, SLOTS.ash, { specialState: 'telegraph', specialDuration: 1.05, specialTimer: .55, lockedAngle: -2.6, skillData: {}, _moving: false, phaseShift: 0 }],
    ['release', WARDEN, SLOTS.warden, { specialState: 'dash', specialTimer: .3, _cast: null, _moving: false, enraged: false, phaseShift: 0 }],
    ['recover', INQ, SLOTS.inq, { specialState: 'recover', _recoveryDuration: 1, specialTimer: .55, _moving: false, phaseShift: 0 }],
    ['roar', INQ, SLOTS.inq, { phaseShift: .55, specialState: 'idle', _moving: false }],
    ['enraged', ASH, SLOTS.ash, { enraged: true, phase: 2, specialState: 'telegraph', specialDuration: 1.05, specialTimer: .6, lockedAngle: -2.4, skillData: {}, _moving: false, phaseShift: 0 }],
    ['hurt', WARDEN, SLOTS.warden, { specialState: 'idle', _moving: false, enraged: false, phaseShift: 0, flash: .12 }],
  ]
  for (const [name, find, slot, patch] of shots) {
    const stage = await setState(find, patch, slot)
    await page.waitForTimeout(90)
    await clip(name, await probe(find))
    void stage
  }
  await setState(WARDEN, { specialState: 'idle', _moving: false, enraged: false, phaseShift: 0 }, SLOTS.warden)
  await setState(ASH, { enraged: true, phase: 2, specialState: 'idle', _moving: false, phaseShift: 0 }, SLOTS.ash)
  await setState(INQ, { specialState: 'idle', _moving: false, phaseShift: 0 }, SLOTS.inq)
  await page.waitForTimeout(60)
  await page.screenshot({ path: resolve(out, `${tag}-full.png`) })

  // --- pass 2: generic boss-mage (spawnBoss refuses a 4th active boss, so the
  // inquisitor is deactivated for the spawn then reactivated for the tableau) ---
  const mageInfo = await page.evaluate(`(() => {
    const e = ${ENGINE}, p = e.player
    return (async () => {
      const em = e.enemyManager
      const inq = em.enemies.find(q => q.stageBossId === 'nest_inquisitor')
      if (inq) inq.active = false
      const mage = em.spawnBoss({ type: 'boss-mage', allowMultiple: true })
      if (!mage) return null
      mage.x = p.x - 250; mage.y = p.y + 150
      mage.attackCd = 0; mage.specialCd = 1e9
      mage.cancelAttack?.({ preserveVulnerability: true })
      mage._spawnT = 0 // update() is frozen below, so clear the spawn-pop timer by hand
      mage.update = () => {}
      if (inq) inq.active = true
      return { type: mage.type, artId: mage.artId, r: mage.radius }
    })()
  })()`)
  await page.waitForTimeout(400)
  const mageShots = [
    ['mage-telegraph', MAGE, SLOTS.mage, { specialState: 'telegraph', specialDuration: .95, specialTimer: .5, lockedAngle: -.5, skillData: {}, _moving: false }],
    ['mage-fire', MAGE, SLOTS.mage, { specialState: 'step', specialTimer: .18, _cast: null, _moving: false }],
    ['mage-moving', MAGE, SLOTS.mage, { specialState: 'idle', _moving: true, _walkT: 2.2 }],
  ]
  for (const [name, find, slot, patch] of mageShots) {
    await setState(find, patch, slot)
    await page.waitForTimeout(90)
    await clip(name, await probe(find))
  }
  await setState(WARDEN, { specialState: 'idle', _moving: false }, SLOTS.warden)
  await setState(ASH, { specialState: 'idle', _moving: false }, SLOTS.ash)
  await setState(INQ, { specialState: 'idle', _moving: false }, SLOTS.inq)
  await setState(MAGE, { specialState: 'telegraph', specialDuration: .95, specialTimer: .6, lockedAngle: -.4, skillData: {}, _moving: false }, SLOTS.mage)
  await page.waitForTimeout(60)
  await page.screenshot({ path: resolve(out, `${tag}-full2.png`) })

  const info = await page.evaluate(`(() => {
    const e = ${ENGINE}
    const bosses = e.enemyManager.enemies.filter(q => q.isBoss).map(q => ({
      type: q.type, stageBossId: q.stageBossId || null, artId: q.artId, enraged: q.enraged, stage: q.attackPresentation.stage,
    }))
    return { dpr: e.dpr, elapsed: e.elapsed, bosses }
  })()`)
  writeFileSync(resolve(out, `${tag}-info.json`), JSON.stringify({ spawned, mageInfo, info, captured: log, errors }, null, 1))
  console.log(JSON.stringify({ spawned, mageInfo, info, captured: log, errors }))
} catch (error) {
  errors.push(error.message.split('\n')[0])
  await page.screenshot({ path: resolve(out, `${tag}-error.png`) }).catch(() => {})
  console.log('FAILED', errors.join(' | '))
}
await browser.close()
