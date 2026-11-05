import assert from 'node:assert/strict'
import { createArena, spawn, dispose, rollSkills } from './test-support/arena-fixture.mjs'
import { SYMBIOSIS_ROUTES, SYMBIOSIS_SKILL_BY_ID } from './src/game/SymbiosisBuild.js'

let checks = 0
const check = (name, fn) => { const game = createArena('summoner'); try { fn(game); console.log(`✓ ${++checks}. ${name}`) } finally { dispose(game) } }
const learn = (game, id, count = 1) => { for (let i = 0; i < count; i++) assert.equal(game.applySkill(SYMBIOSIS_SKILL_BY_ID[id]), true, id) }
const seeds = new Set(Object.values(SYMBIOSIS_ROUTES).map(route => route.seed))

check('探索期三条共生入口均可出现，且早期有伙伴招募机会', game => {
  game.primarySpec = 'symbiosis'; game.weaponSystem.petCombat.normalChoices = 1
  const cards = rollSkills(game, 100), ids = new Set(cards.map(card => card.id))
  for (const id of seeds) assert.ok(ids.has(id), id)
  assert.ok(cards.some(card => card.isPartnerChoice))
  assert.ok(!cards.some(card => card.isSymbiosisRoute || card.isCapstone))
})

check('达到门槛后出现共生路线确认，未获得入口的方向锁定', game => {
  game.primarySpec = 'symbiosis'; game.weaponSystem.petCombat.normalChoices = 5; game.enemyManager.wave = 6
  game.skillLevels.sym_hunt_link = 1
  const cards = rollSkills(game, 3)
  assert.equal(cards.length, 3); assert.equal(cards.find(card => card.route === 'hunt').locked, false)
  assert.equal(cards.find(card => card.route === 'spore').locked, true); assert.equal(cards.find(card => card.route === 'guard').locked, true)
  assert.equal(game.applySkill(cards.find(card => card.route === 'hunt')), true)
  assert.equal(game.weaponSystem.petCombat.route, 'hunt')
})

check('路线锁定后只开放本路线进阶，终极互斥且仍需投入', game => {
  game.primarySpec = 'symbiosis'; game.weaponSystem.petCombat.route = 'hunt'; game.player.level = 14; game.enemyManager.wave = 10
  game.skillLevels.sym_hunt_link = 1; game.skillLevels.sym_hunt_mark = 3
  const cards = rollSkills(game, 100)
  assert.ok(cards.some(card => card.id === 'sym_hunt_chain')); assert.ok(!cards.some(card => card.id === 'sym_spore_field' || card.id === 'sym_guard_aegis'))
  assert.ok(cards.some(card => card.id === 'sym_hunt_ultimate'))
  assert.equal(game.applySkill(cards.find(card => card.id === 'sym_hunt_ultimate')), true)
  assert.ok(!rollSkills(game, 100).some(card => card.id === 'sym_spore_ultimate' || card.id === 'sym_guard_ultimate'))
})

check('孢潮路线命中扩散伤害受控，不递归爆炸', game => {
  game.primarySpec = 'symbiosis'; game.weaponSystem.petCombat.route = 'spore'; game.skillLevels.sym_spore_link = 2
  learn(game, 'sym_spore_link')
  game.weaponSystem.petCombat.sync()
  const pet = game.weaponSystem.petCombat.items[0], first = spawn(game, { x: 70, hp: 100 }), second = spawn(game, { x: 100, hp: 100 })
  game.weaponSystem.petCombat.dealHit(pet, first, 10)
  assert.ok(first.hp < 100); assert.ok(second.hp < 100)
  const after = second.hp; game.weaponSystem.petCombat.dealHit(pet, second, 10); assert.ok(second.hp < after)
})

check('守望路线在鼓舞期间提供本体减伤与冲击波', game => {
  game.primarySpec = 'symbiosis'; game.weaponSystem.petCombat.route = 'guard'; game.skillLevels.sym_guard_link = 2; game.skillLevels.sym_guard_pulse = 1
  learn(game, 'sym_guard_link'); learn(game, 'sym_guard_pulse')
  const pet = game.weaponSystem.petCombat, enemy = spawn(game, { x: 70, hp: 1000 }); pet.sync()
  game.player.hp = 100; game.player.maxHp = 100; game.player.invincible = 0; pet.rally()
  assert.ok(enemy.hp < 1000); const before = game.player.hp; game.player.hit(10, { enemyAttack: true }); assert.ok(game.player.hp > before - 10)
})

console.log(`共生路线验证：${checks} 组通过`)
