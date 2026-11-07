import assert from 'node:assert/strict'
import { createArena, spawn, dispose, pressSpace } from './test-support/arena-fixture.mjs'
import { rollSkills } from './src/game/SkillPool.js'
import { ELEMENTAL_ROUTES, elementalRouteOptions } from './src/game/ElementalBuild.js'
import { ELEMENTAL_SKILLS } from './src/game/SpellRules.js'
import { ELEMENTAL_MILESTONE_LEVELS } from './src/game/ElementalProgression.js'

let checks = 0
function check(name, test) {
  const g = createArena('elemental')
  g.reset(); g.running = true; g.input.suspended = false
  g.enemyManager._enemies.length = 0; g.enemyManager._spawnTimer = Infinity
  g.mapFeatures.barricades = []; g.mapFeatures.resolvePlayerMovement = () => false
  try { test(g, g.weaponSystem.spellCombat); console.log(`✓ ${++checks}. ${name}`) } finally { dispose(g) }
}

const learn = (s, id) => {
  s.player.level = Math.max(2, s.player.level)
  const card = s.milestoneReward().options.find(o => o.element === id)
  assert.ok(card); assert.equal(s.applyMilestone(card), true)
}
const pick = (g, id) => {
  const card = rollSkills(g, 30).find(o => o.id === id)
  assert.ok(card, `应能抽到 ${id}`)
  assert.equal(g.applySkill(card), true)
}

check('探索期可以保留单系，也能随机发现第二、第三元素', (g, s) => {
  learn(s, 'fire')
  g.player.level = 4
  const cards = rollSkills(g, 30)
  assert.ok(cards.some(card => card.element === 'fire'))
  assert.ok(cards.some(card => card.isElementalDiscovery && card.element !== 'fire'))
  pick(g, 'ele_discover_water')
  pick(g, 'ele_discover_lightning')
  assert.deepEqual([...s.elements], ['fire', 'water', 'lightning'])
  assert.equal(s.fusion, null)
})

check('元素史莱姆不会抽到原生黏液专属成长', g => {
  const cards = rollSkills(g, 30)
  assert.ok(cards.length > 0)
  assert.ok(cards.every(card => !card.originOnly), '元素卡池不应包含 originOnly 技能')
  assert.ok(!cards.some(card => ['com_shock', 'origin_flux', 'origin_overload', 'origin_concord'].includes(card.id)))
})

check('Lv.2 首系教学保留，第二系与 Lv.10 进化不会强制弹出核心面板', (g, s) => {
  g.player.level = ELEMENTAL_MILESTONE_LEVELS.first
  assert.equal(s.milestoneReward()?.stage, 'first')
  learn(s, 'fire'); g.player.level = ELEMENTAL_MILESTONE_LEVELS.fusion
  g.onSpellCore = () => {}; g.onLevelUp = () => {}
  g.triggerLevelUp()
  assert.equal(g._spellCoreChoice, null); assert.ok(g._pauseLock > 0)
  g._pauseLock = 0; g.runFinished = false; g.start = () => { g.running = true }
  g.player.level = ELEMENTAL_MILESTONE_LEVELS.evolution
  g.triggerLevelUp()
  assert.equal(g._spellCoreChoice, null)
  const second = rollSkills(g, 30).find(card => card.id === 'ele_discover_water')
  assert.ok(second); assert.equal(g.applySkill(second), true)
  assert.ok(ELEMENTAL_SKILLS.some(skill => skill.id === 'spell_fire_power'))
})

check('达到门槛后出现三条路线，元素不足的方向锁定', (g, s) => {
  learn(s, 'fire'); s.normalChoices = 5; g.enemyManager.wave = 6
  const options = rollSkills(g, 3)
  assert.deepEqual(options.map(option => option.route), ['single', 'fusion', 'cycle'])
  assert.equal(options.find(option => option.route === 'single').locked, false)
  assert.equal(options.find(option => option.route === 'fusion').locked, true)
  assert.equal(options.find(option => option.route === 'cycle').locked, true)
  assert.equal(elementalRouteOptions(g).length, 3)
})

check('双系路线锁定后保留融合，关闭第三系发现并开放本路线进阶', (g, s) => {
  learn(s, 'fire'); s.player.level = 3; pick(g, 'ele_discover_water')
  s.normalChoices = 5; g.enemyManager.wave = 6
  const route = rollSkills(g, 3).find(option => option.route === 'fusion')
  assert.equal(g.applySkill(route), true)
  assert.equal(s.route, 'fusion'); assert.equal(s.fusion?.id, 'steam')
  assert.ok(rollSkills(g, 30).some(option => option.id === 'ele_fusion_resonance'))
  assert.ok(!rollSkills(g, 30).some(option => option.isElementalDiscovery))
  assert.ok(!rollSkills(g, 30).some(option => option.route === 'single' || option.route === 'cycle'))
})

check('多系轮转按顺序施法，完成循环释放受控脉冲', (g, s) => {
  learn(s, 'fire'); s.player.level = 3; pick(g, 'ele_discover_water'); pick(g, 'ele_discover_lightning')
  s.normalChoices = 5; g.enemyManager.wave = 6
  const route = rollSkills(g, 3).find(option => option.route === 'cycle')
  assert.equal(g.applySkill(route), true)
  pick(g, 'ele_cycle_echo')
  const enemy = spawn(g, { hp: 100000, x: 100 })
  for (let i = 0; i < 600; i++) s.update(.05)
  assert.ok(s.stats.castsByElement.fire > 0 && s.stats.castsByElement.water > 0 && s.stats.castsByElement.lightning > 0)
  assert.ok(enemy.hp < 100000)
  assert.ok(s.effects.length <= 100)
})

check('三种路线终极互斥且需要投入与战局门槛', (g, s) => {
  learn(s, 'fire'); s.player.level = 14; s.normalChoices = 5; g.enemyManager.wave = 10
  const route = rollSkills(g, 3).find(option => option.route === 'single'); assert.ok(route)
  assert.equal(g.applySkill(route), true)
  for (let i = 0; i < 4; i++) pick(g, 'ele_single_focus')
  const ultimate = rollSkills(g, 30).find(option => option.id === 'ele_single_ultimate')
  assert.ok(ultimate); assert.equal(g.applySkill(ultimate), true); assert.equal(s.routeUltimate, 'single')
  assert.ok(!rollSkills(g, 30).some(option => option.isCapstone && option.route !== 'single'))
  const enemy = spawn(g, { hp: 100000, x: 90 }); pressSpace(g); assert.ok(s.stats.activeCasts > 0 && enemy.hp < 100000)
})

console.log(`\n元素构筑路线验证通过：${checks} 组检查`)
