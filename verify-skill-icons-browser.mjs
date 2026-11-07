import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'

// Mount the production components against authored skills. No accounts or player saves are accessed.
const output = path.resolve('.workbuddy/skill-icons')
await fs.mkdir(output, { recursive: true })
await fs.writeFile(path.join(output, 'review.html'), `<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><style>
html,body{margin:0;background:#101713;color:#e8eef0;font-family:"Microsoft YaHei",sans-serif}button{font-family:inherit}#app{position:relative;width:100vw;height:100vh}*{box-sizing:border-box}
.gallery{padding:32px;display:grid;grid-template-columns:repeat(6,1fr);gap:24px}.gallery section{display:flex;align-items:center;flex-direction:column;gap:8px}.gallery h2{font-size:14px}.gallery label{font-size:11px;color:#9aa9af}
</style><div id="app"></div><script type="module">
import {createApp,h,shallowRef,nextTick} from 'vue'
import LevelUpModal from '/src/components/LevelUpModal.vue'
import SpellCoreModal from '/src/components/SpellCoreModal.vue'
import HudOverlay from '/src/components/HudOverlay.vue'
import SkillIcon from '/src/components/SkillIcon.vue'
import {SKILL_DATABASE,SPEC_INFO} from '/src/game/SkillPool.js'
import {RICOCHET_SKILLS,ricochetRouteOptions} from '/src/game/RicochetRules.js'
import {gluttonRouteOptions} from '/src/game/GluttonBuild.js'
import {symbiosisRouteOptions} from '/src/game/SymbiosisBuild.js'
import {shadowRouteOptions} from '/src/game/ShadowBuild.js'
import {elementalRouteOptions} from '/src/game/ElementalBuild.js'
import {ELEMENTAL_SKILLS,spellMilestoneReward} from '/src/game/SpellRules.js'
import {ORIGIN_COMMON_SKILLS,ORIGIN_FRAGMENT_SKILLS,originRouteOptions,originMarkOptions} from '/src/game/OriginBuild.js'
import {GameEngine} from '/src/game/GameEngine.js'
const common=SKILL_DATABASE.common
const card=s=>({...s,level:0,stats:typeof s.stats==='string'?s.stats:'强化生效',role:'common'})
const examples={
 origin:[ORIGIN_COMMON_SKILLS[0],ORIGIN_FRAGMENT_SKILLS[0],common.find(s=>s.id==='com_vital')],
 ricochet:['rico_recharge','rico_vitality','rico_haste'].map(id=>RICOCHET_SKILLS.find(s=>s.id===id)),
 glutton:[SKILL_DATABASE.gluttony.primary[0],common[0],SKILL_DATABASE.gluttony.primary[4]],
 summoner:[SKILL_DATABASE.symbiosis.primary[3],common[0],SKILL_DATABASE.symbiosis.primary[4]],
 elemental:[ELEMENTAL_SKILLS[0],common[0],ELEMENTAL_SKILLS.find(s=>s.id==='spell_shield')],
 shadow:[SKILL_DATABASE.assassin.primary[0],{...common[0],isShadowSkill:true},SKILL_DATABASE.assassin.primary[4]],
}
const state=shallowRef({type:'cards',strain:'ricochet'})
window.lastSelection=null
const app=createApp({render(){const s=state.value
 if(s.type==='cards')return h(LevelUpModal,{key:s.strain,options:examples[s.strain].map(card),level:5,canUseElements:false,onSelect:c=>window.lastSelection=c.id})
 if(s.type==='milestone')return h(LevelUpModal,{options:Object.entries(SPEC_INFO).map(([spec,v])=>({...v,id:'milestone_pri_'+spec,spec,isMilestone:true,milestoneType:'primary',tags:['主专精',v.name]})),level:5,canUseElements:false})
 if(s.type==='core')return h(SpellCoreModal,{info:spellMilestoneReward({available:true,elements:new Set(),player:{level:2}}),onSelect:id=>window.lastSelection=id})
 if(s.type==='route')return h(LevelUpModal,{key:s.strain,options:s.options,level:7,canUseElements:false})
 if(s.type==='originRoute'||s.type==='originMark')return h(LevelUpModal,{key:s.type,options:s.options,level:s.type==='originRoute'?5:9,canUseElements:true,onSelect:c=>window.lastSelection=c.id})
 if(s.type==='hud')return h(HudOverlay,{stats:s.stats,cooldown:s.cooldown})
 return h('div',{class:'gallery'},Object.entries(examples).map(([strain,skills])=>h('section',[h('h2',strain),...skills.flatMap(skill=>[h(SkillIcon,{skill}),h('label',skill.name)])])))
}}).mount('#app')
window.review={async show(type,strain){
 window.lastSelection=null
 let data={type,strain}
 if(type==='originRoute'||type==='originMark'){
  const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=960
  const game=GameEngine.create(canvas);game.applyStartingStrain('origin');game.reset()
  game.player.level=type==='originRoute'?5:9
  if(type==='originRoute') data.options=originRouteOptions(game)
  else { game.originRoute='expansion'; data.options=originMarkOptions(game) }
  game.destroy()
 }
 if(type==='route'||type==='hud'){
  const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=960
  const game=GameEngine.create(canvas);game.applyStartingStrain(strain);game.reset()
  if(type==='route'){
   data.options=({ricochet:ricochetRouteOptions,glutton:gluttonRouteOptions,summoner:symbiosisRouteOptions,shadow:shadowRouteOptions,elemental:elementalRouteOptions}[strain])(game)
  }else{
   game.onStats=stats=>data.stats=stats;game.onCooldown=cooldown=>data.cooldown=cooldown
   game._updateStrainSkill(0);game._pushStats();game._pushCooldown()
   data.stats={...data.stats,shadow:data.cooldown.shadow}
  }
  game.destroy()
 }
 state.value=data;await nextTick()
}}
window.reviewReady=true
</script></html>`, 'utf8')

console.log('Starting isolated icon review server')
const vite = await createServer({ configFile: false, plugins: [vue()], cacheDir: path.join(output, '.vite'), optimizeDeps: { noDiscovery: true, include: ['vue', 'lucide-vue-next'] }, server: { host: '127.0.0.1', port: 0, strictPort: false, watch: { ignored: ['**/.workbuddy/**'] } } })
await vite.listen()
console.log('Review server ready')
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
const errors = [], warnings = [], results = []
page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.message) })
page.on('requestfailed', request => console.error('Request failed:', request.url(), request.failure()?.errorText))
page.on('console', message => { if(message.type()==='error') console.error(message.text()); if (message.type() === 'warning' || message.type() === 'warn') warnings.push(message.text()) })
async function show(type, strain) {
  await page.evaluate(async ({ type, strain }) => window.review.show(type, strain), { type, strain })
  await page.mouse.move(0, 0)
  assert.equal(await page.locator('vite-error-overlay').count(), 0, 'no compile errors')
  assert.equal(await page.locator('[data-icon-missing]').count(), 0, `${type}/${strain}: complete registration`)
  assert.ok(await page.locator('.skill-glyph svg').count(), `${type}/${strain}: real SVGs rendered; ${errors.join('; ')}; ${warnings.join('; ')}`)
  const metrics = await page.locator('.skill-glyph:not(.skill-glyph--inline)').evaluateAll(nodes => nodes.map(node => {
    const icon = node.getBoundingClientRect(), card = node.closest('.skill-card,.core-option,.route-card,.milestone-card')?.getBoundingClientRect()
    return { width: icon.width, height: icon.height, radius: getComputedStyle(node).borderRadius,
      contained: !card || icon.x >= card.x && icon.right <= card.right && icon.y >= card.y && icon.bottom <= card.bottom }
  }))
  for (const metric of metrics) {
    assert.equal(metric.width, metric.height, `${type}/${strain}: square frame`)
    assert.equal(metric.radius, '16px', `${type}/${strain}: shared geometry`)
    assert.equal(metric.contained, true, `${type}/${strain}: icon stays inside card`)
  }
  console.log('Verified', type, strain || '', page.viewportSize().width)
  results.push({ type, strain, viewport: page.viewportSize(), icons: metrics.length })
}
try {
  console.log('Loading production components')
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/.workbuddy/skill-icons/review.html`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  console.log('Initial page state', await page.evaluate(()=>({ready:window.reviewReady,review:!!window.review})))
  await page.waitForFunction(() => window.reviewReady, null, { timeout: 30000, polling: 100 }).catch(error => { throw new Error(error.message + '\n' + errors.join('\n')) })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 })
    for (const strain of ['origin', 'ricochet', 'glutton', 'summoner', 'elemental', 'shadow']) {
      await show('cards', strain)
      const key = await page.locator('[data-icon-key="vitality"]').getAttribute('data-icon-key')
      assert.equal(key, 'vitality', `${strain}: cross-strain vitality`)
      if (strain === 'ricochet' || strain === 'shadow') await page.screenshot({ animations: 'disabled', path: path.join(output, `cards-${strain}-${width}.png`) })
      const expected = await page.locator('.skill-card').nth(1).locator('.skill-glyph').getAttribute('data-icon-id')
      await page.keyboard.press('2')
      assert.equal(await page.evaluate(() => window.lastSelection), expected, 'keyboard selection remains wired')
      await show('hud', strain)
    }
    await show('core')
    await page.screenshot({ animations: 'disabled', path: path.join(output, `core-${width}.png`) })
    await show('milestone')
    await page.screenshot({ animations: 'disabled', path: path.join(output, `milestone-${width}.png`) })
    for (const strain of ['ricochet', 'glutton', 'summoner', 'elemental', 'shadow']) await show('route', strain)
    await show('originRoute')
    await show('originMark')
    await page.screenshot({ animations: 'disabled', path: path.join(output, `origin-milestones-${width}.png`) })
    await page.screenshot({ animations: 'disabled', path: path.join(output, `routes-shadow-${width}.png`) })
  }
  await page.setViewportSize({ width: 1440, height: 740 })
  await show('gallery')
  await page.screenshot({ animations: 'disabled', path: path.join(output, 'gallery.png') })
  assert.deepEqual(errors, [], 'no Vue/runtime errors')
  assert.deepEqual(warnings.filter(message => message.includes('[SkillIcon]') || message.includes('[Vue warn]')), [], 'no missing glyph or Vue warnings')
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ results, errors, warnings }, null, 2))
  console.log(`浏览器图标验收通过：${results.length} 个桌面/手机场景，零缺失图标、零运行错误。截图：${output}`)
} catch (error) {
  await page.screenshot({path:path.join(output, 'failure.png')}).catch(()=>{})
  console.error('Page body:', (await page.locator('body').innerText()).slice(0,2000))
  throw error
} finally {
  await browser.close()
  await vite.close()
}
