// Real-UI capture of the boss-cast enemies in Tower Defense (siege →
// boss:gate_marshal, boss → boss:knight) and Runner (carrier_boss →
// boss:knight). Needs playwright-core and the dev server backend.
//   GAME_URL=http://127.0.0.1:13093 DPR=2 node test-support/td-runner-boss-capture.mjs [tag]
// Only for VISUAL review: enemies are injected through each gameplay's own
// factory (_createEnemy / RUNNER_ENTITY_TYPES shape) because they otherwise
// appear far into a stage/run. Rendering, clocks and combat run untouched.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core')
const base = process.env.GAME_URL || 'http://127.0.0.1:13093'
const dpr = Number(process.env.DPR || 1)
const tag = process.argv[2] || `dpr${dpr}`
const modes = (process.env.TD_RUNNER_MODES || 'td,runner').split(',')
const out = resolve('.tmp-boss-art/game')
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
const errors = []
const log = []

async function freshPage() {
  // a separate context per gameplay: the app restores an in-progress session on
  // reload, so reusing a page that just ran TD would skip the start screen
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr })
  const page = await context.newPage()
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  return { context, page }
}

const ENGINE = `document.querySelector('.game-canvas').__vueParentComponent.setupState.engine`

async function boot(page) {
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '注册', exact: true }).click()
  await page.getByRole('textbox', { name: '账号名' }).fill(`e${Date.now().toString(36)}`)
  await page.locator('input[type=password]').fill('isolated-td-runner-art-2026')
  await page.getByRole('button', { name: '创建账号', exact: true }).click()
  await page.getByText(/^已登录：/).waitFor({ state: 'visible', timeout: 20000 })
}

const clip = async (page, name, pos, w = 420, h = 340) => {
  if (!pos) { errors.push(`no position for ${name}`); return }
  const x = Math.max(0, Math.min(1440 - w, pos.x - w / 2)), y = Math.max(0, Math.min(900 - h, pos.y - h * .55))
  await page.screenshot({ path: resolve(out, `${tag}-${name}.png`), clip: { x, y, width: w, height: h } })
  log.push(name)
}

try {
  // ---- tower defense: world map → first unlocked stage → inject siege+boss ----
  if (modes.includes('td')) {
    const { context, page } = await freshPage()
    await boot(page)
    await page.locator('[data-playstyle="tower-defense"]').click()
    await page.locator('.stage-landmark-btn').first().click()
    await page.locator('.modal-start-btn').click()
    await page.waitForFunction(`${ENGINE}?.running && ${ENGINE}?.gameplay?.stageConfig?.path`, null, { timeout: 20000 })
    await page.waitForTimeout(1800)
    const tdInfo = await page.evaluate(`(() => {
      const gp = ${ENGINE}.gameplay
      const mk = (type, progress, extra = {}) => {
        const en = gp.director._createEnemy({ type, count: 1, interval: 0, ...extra })
        en.progress = progress
        en.speed = 0; en.baseSpeed = 0 // frozen tableau — parked on the path
        en.empPulse = null; en.sprint = false
        gp._addEnemy(en)
        return en.id
      }
      const siege = mk('siege', .36)
      const boss = mk('boss', .58, { bossChapter: 1, bossName: '王庭攻城兽', scale: .4, coreDamage: 20 })
      return { siege, boss }
    })()`)
    await page.waitForTimeout(700)
    const tdProbe = id => page.evaluate(`(() => {
      const gp = ${ENGINE}.gameplay, en = gp.enemies.find(q => q.id === ${id})
      if (!en) return null
      gp.renderer.ensureLayout()
      const p = gp.renderer.project({ x: en.x, y: en.y })
      return { x: p.x, y: p.y, typeId: en.typeId, boss: !!en.boss }
    })()`)
    await clip(page, 'td-siege', await tdProbe(tdInfo.siege), 380, 320)
    await clip(page, 'td-boss', await tdProbe(tdInfo.boss), 460, 380)
    await page.screenshot({ path: resolve(out, `${tag}-td-full.png`) })
    log.push('td-full')
    console.log('td:', JSON.stringify(tdInfo))
    await context.close()
  }

  // ---- runner: marathon → inject a frozen carrier_boss mid-lane ----
  if (modes.includes('runner')) {
    const { context, page } = await freshPage()
    await boot(page)
    await page.locator('[data-playstyle="runner"]').click()
    // the mode card starts the run directly (emit('runner') → engine.start)
    await page.locator('.runner-mode-card').first().click()
    const confirm = page.getByRole('button', { name: '确认出发', exact: true })
    try { await confirm.waitFor({ state: 'visible', timeout: 4000 }); await confirm.click() } catch {}
    await page.waitForFunction(`${ENGINE}?.running && ${ENGINE}?.gameplay?.entities`, null, { timeout: 20000 })
    await page.waitForTimeout(1200)
    const rnInfo = await page.evaluate(`(async () => {
      const gp = ${ENGINE}.gameplay
      const { RUNNER_ENTITY_TYPES } = await import('/src/game/gameplay/runner/RunnerRules.js')
      const cfg = RUNNER_ENTITY_TYPES.carrier_boss
      const ent = {
        id: 90001, rowId: 90001, lane: 1, type: 'carrier_boss', kind: 'enemy',
        reward: cfg.reward || null, name: cfg.name, sprite: cfg.sprite || null,
        color: cfg.color, elite: true, behavior: null, armor: 0, supportReduction: 0,
        renderScale: cfg.renderScale || 1, depth: .52, previousDepth: .52,
        speed: 0, baseSpeed: 0, chargeAt: 0, chargeDelay: 0, chargeMultiplier: 1,
        chargeTelegraph: 0, charging: false, attackAt: 0, attackDelay: 0, attackTimer: 0,
        attackLane: null, attackLanes: null, attacking: false, hasAttacked: false,
        projectileDamage: 0, projectileHp: 0, corrosionStacks: 0,
        hp: cfg.hp, maxHp: cfg.hp, damage: 0, score: cfg.score, hitFlash: 0, active: true,
      }
      gp.entities.push(ent)
      return { id: ent.id, type: ent.type }
    })()`)
    await page.waitForTimeout(700)
    const rnProbe = () => page.evaluate(`(() => {
      const gp = ${ENGINE}.gameplay, ent = gp.entities.find(q => q.id === ${rnInfo.id})
      if (!ent) return null
      const p = gp.renderer.project(ent.lane, ent.depth)
      return { x: p.x, y: p.y, type: ent.type, depth: ent.depth }
    })()`)
    await clip(page, 'runner-carrier-boss', await rnProbe(), 420, 380)
    await page.screenshot({ path: resolve(out, `${tag}-runner-full.png`) })
    log.push('runner-full')
    console.log('runner:', JSON.stringify(rnInfo))
    await context.close()
  }

  writeFileSync(resolve(out, `${tag}-td-runner-info.json`), JSON.stringify({ dpr, captured: log, errors }, null, 1))
  console.log(JSON.stringify({ dpr, captured: log, errors }))
} catch (error) {
  errors.push(error.message.split('\n')[0])
  console.log('FAILED', errors.join(' | '))
}
await browser.close()
