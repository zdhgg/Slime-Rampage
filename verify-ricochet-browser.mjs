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
const output = path.resolve('.workbuddy/ricochet-browser')
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, baseURL: `http://127.0.0.1:${vite.httpServer.address().port}` })
const page = await context.newPage(), errors = [], screenshots = []
page.on('pageerror', e => errors.push(e.message))
const game = fn => page.evaluate(fn)
const shot = async name => {
  const file = path.join(output, `${name}.png`)
  await page.screenshot({ path: file, animations: 'disabled' }); screenshots.push(file)
}
try {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.locator('.auth-layer').waitFor()
  await page.getByRole('button', { name: '注册', exact: true }).waitFor({ state: 'visible' })
  await page.waitForFunction(() => !document.querySelector('.auth-tabs button:nth-child(2)')?.disabled, null, { timeout: 30000 })
  await page.getByRole('button', { name: '注册', exact: true }).click()
  await page.locator('.auth-form input').nth(0).fill(`rico${Date.now()}`)
  await page.locator('.auth-form input').nth(1).fill('local-playtest-2026')
  await page.getByRole('button', { name: '创建账号', exact: true }).click()
  await page.locator('.auth-layer').waitFor({ state: 'hidden' })
  await page.locator('[data-playstyle="arena"]').click()
  await page.locator('[data-mode="expedition"]').click()
  await page.locator('[data-strain="ricochet"]').click()
  await shot('01-character')
  await page.locator('.config-actions .primary-action').click()
  await page.locator('.deploy-btn').click()
  await page.locator('.hud-ricochet').waitFor()
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__?._instance?.setupState?.engine)
  await game(() => {
    window.playtestGame = document.querySelector('#app').__vue_app__._instance.setupState.engine
    const g = playtestGame
    g.stop(); g.running = true; g._pauseLock = 0; g.input.suspended = false
    g.enemyManager._enemies = []; g.enemyManager._spawnTimer = Infinity
    g._activateExpeditionStage()
    g.start = () => { g.running = true; g.input.suspended = false }
    g.player.gainExp(g.player.maxExp - g.player.exp)
  })
  await page.locator('.skill-card').first().waitFor()
  await shot('02-random-exploration')
  await page.keyboard.press('1')
  assert.equal(await game(() => playtestGame.weaponSystem.ricochetCombat.normalChoices), 1)
  await game(async () => {
    const g = playtestGame
    g.weaponSystem.ricochetCombat.route = 'split'
    g.openFreeSkillPanel()
    const { RICOCHET_SKILLS } = await import('/src/game/RicochetRules.js')
    const choices = ['rico_density', 'rico_hunt', 'rico_bloom'].map(id => {
      const skill = RICOCHET_SKILLS.find(item => item.id === id)
      return { ...skill, level: 0, role: 'primary', stats: typeof skill.stats === 'function' ? skill.stats(0, g) : skill.stats }
    })
    g.onLevelUp(choices)
  })
  assert.deepEqual(await page.locator('.ricochet-skill-icon').evaluateAll(nodes => nodes.map(node => node.dataset.iconId)), ['rico_density', 'rico_hunt', 'rico_bloom'])
  assert.equal(await page.locator('.skill-card').evaluateAll(nodes => new Set(nodes.map(node => node.style.getPropertyValue('--rico-color'))).size), 1, 'same-route cards share one family color')
  await shot('02b-split-skill-icons')
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await game(() => document.documentElement.scrollWidth <= innerWidth + 1))
  const iconBounds = await page.locator('.ricochet-skill-icon').first().boundingBox()
  const cardBounds = await page.locator('.skill-card').first().boundingBox()
  assert.ok(iconBounds.x >= cardBounds.x && iconBounds.x + iconBounds.width <= cardBounds.x + cardBounds.width, 'mobile route icon stays within card')
  await shot('02c-split-skill-icons-mobile')
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.locator('.skill-card').nth(1).click()
  await page.locator('.levelup-overlay').waitFor({ state: 'hidden' })
  await game(() => {
    const g = playtestGame
    g.weaponSystem.ricochetCombat.route = null
    g.skillLevels = { rico_split: 1, rico_bounce: 1, rico_velocity: 1, rico_multishot: 1, rico_vitality: 1 }
    g.weaponSystem.ricochetCombat.normalChoices = 5
    g.enemyManager.wave = 6; g.expeditionStage = 3; g.player.level = 7
    g.openFreeSkillPanel()
  })
  await page.locator('.route-card').first().waitFor()
  assert.equal(await page.locator('.route-card').count(), 3)
  assert.equal(await page.locator('.route-card:disabled').count(), 1)
  await page.keyboard.press('2')
  assert.equal(await page.locator('.route-review').count(), 0, '缺少入口时键盘同样不可选择')
  await shot('03-route-desktop')
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await game(() => document.documentElement.scrollWidth <= innerWidth + 1))
  const top = await page.locator('.route-kicker').boundingBox()
  assert.ok(top.y >= 0, '窄屏不裁切路线面板顶部')
  await shot('04-route-mobile')
  await page.locator('.route-card').nth(2).scrollIntoViewIfNeeded()
  assert.ok((await page.locator('.route-card').nth(2).boundingBox()).y >= 0, '触屏可滚动到最后一条路线')
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.keyboard.press('3')
  await page.locator('.route-review').waitFor()
  assert.equal(await game(() => playtestGame.weaponSystem.ricochetCombat.route), null, '第一次选择仅预览')
  await shot('05-confirmation')
  await page.keyboard.press('2')
  await page.locator('.route-grid').waitFor()
  await page.locator('.route-card').first().click()
  await page.getByRole('button', { name: /返回重选/ }).click()
  await page.locator('.route-card').nth(2).click()
  await page.keyboard.press('Enter')
  await page.locator('.ricochet-route-overlay').waitFor({ state: 'hidden' })
  await page.waitForTimeout(1000)
  assert.equal(await game(() => playtestGame.weaponSystem.ricochetCombat.route), 'bounce')
  assert.equal(await game(() => playtestGame.input.consumeFever()), false, '确认空格不会排入幽灵技能')
  assert.ok((await page.locator('.hud-ricochet').innerText()).includes('棱镜群落'))
  // All foundations and route advances are filled; the eligible ultimate is still a real random draw.
  await game(() => {
    const g = playtestGame
    for (const id of ['split', 'bounce', 'multishot', 'haste', 'velocity', 'compression', 'recharge', 'vitality', 'extension', 'amplify']) g.skillLevels[`rico_${id}`] = 2
    g.skillLevels.rico_echo = 1; g.skillLevels.rico_split_bounce = 1
    g.player.level = 14; g.enemyManager.wave = 10; g.expeditionStage = 5
    // Keep this UI verification deterministic while production draws stay random.
    const random = Math.random
    let seed = 3
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
    g.openFreeSkillPanel()
    Math.random = random
  })
  await page.locator('.skill-card').filter({ has: page.getByText('棱镜风暴', { exact: true }) }).click()
  await page.waitForTimeout(1000)
  const snapshot = await game(() => {
    const g = playtestGame
    const e = g.enemyManager.spawnAt(g.player.x + 200, g.player.y, 'knight'); e.hp = e.maxHp = 10000; e.shieldHits = 0
    g.enemyManager._buildGrid(); g.player.strainSkillCd = 0; g.player.activeSkillCdMultiplier = 1
    g.input.queueFever(); g._updateStrainSkill(0)
    const cores = g.weaponSystem._projectiles.filter(p => p.ricochet?.bounces === 6).length
    g._pushStats(); g._pushCooldown(); g.render()
    return { route: g.weaponSystem.ricochetCombat.route, active: g.strainSkill.name, cores, cd: g.player.strainSkillCd, pauseLock: g._pauseLock }
  })
  assert.deepEqual(snapshot, { route: 'bounce', active: '棱镜风暴', cores: 3, cd: 12, pauseLock: 0 })
  await shot('06-ultimate-combat')
  assert.deepEqual(errors, [])
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ snapshot, errors, screenshots }, null, 2))
  console.log(JSON.stringify({ snapshot, errors, screenshots }, null, 2))
} finally {
  await browser.close()
  await vite.close()
  await new Promise(resolve => server.close(resolve))
  db.close()
}
