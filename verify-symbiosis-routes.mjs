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
  pet.routeGuardLevel = 4; pet.routeGuardAegisLevel = 5; pet.routeUltimate = 'guard'
  assert.ok(Math.abs(pet.playerDamageReduction - .30) < 1e-9, '守望本体减伤封顶 30%')
})

check('猎团协同攻击按标记命中数触发，派生伤害不递归', game => {
  game.primarySpec = 'symbiosis'; game.weaponSystem.petCombat.route = 'hunt'
  learn(game, 'sym_hunt_link'); learn(game, 'sym_hunt_mark', 3)
  const pet = game.weaponSystem.petCombat; pet.sync()
  const attacker = pet.items[0], enemy = spawn(game, { x: 70, hp: 1000 })
  pet.dealHit(attacker, enemy, 10)
  assert.ok(Math.abs(enemy.hp - 990) < 1e-6)
  pet.dealHit(attacker, enemy, 10)
  assert.ok(Math.abs(enemy.hp - 978.2) < 1e-6)
  assert.equal(enemy.petHuntChainHits, 1)
  pet.dealHit(attacker, enemy, 10)
  assert.ok(Math.abs(enemy.hp - (978.2 - 11.8 - 11.8 * .56)) < 1e-6)
  assert.equal(enemy.petHuntChainHits, 0)
  const before = enemy.hp
  pet.dealHit(attacker, enemy, 10)
  assert.ok(Math.abs(enemy.hp - (before - 11.8)) < 1e-6)
  assert.equal(enemy.petHuntChainHits, 1)
})

check('群猎标记命中短暂牵引附近伙伴', game => {
  game.primarySpec = 'symbiosis'; game.weaponSystem.petCombat.route = 'hunt'
  learn(game, 'sym_hunt_link'); learn(game, 'sym_hunt_mark')
  game.skillLevels.pet_partner = 1
  const pet = game.weaponSystem.petCombat; pet.sync()
  const attacker = pet.items.find(p => p.type === 'guardian'), other = pet.items.find(p => p.type === 'hunter')
  const enemy = spawn(game, { x: 70, hp: 1000 }), decoy = spawn(game, { x: -200, hp: 1000 })
  other.target = decoy; other.retarget = 0.25
  pet.dealHit(attacker, enemy, 10)
  assert.equal(other.target, decoy)
  pet.dealHit(attacker, enemy, 10)
  assert.equal(other.target, enemy)
  assert.ok(other.retarget >= 0.5)
})

check('猎团回响：鼓舞期间标记冻结且延长，无回响时照常衰减', game => {
  game.primarySpec = 'symbiosis'; game.weaponSystem.petCombat.route = 'hunt'
  learn(game, 'sym_hunt_link'); learn(game, 'sym_hunt_chain', 2)
  const pet = game.weaponSystem.petCombat; pet.sync()
  const attacker = pet.items[0], enemy = spawn(game, { x: 70, hp: 1000 })
  pet.dealHit(attacker, enemy, 10)
  assert.ok(Math.abs(enemy.petHuntMarkTime - 3) < 1e-6)
  assert.ok(pet.rally())
  for (const p of pet.items) p.down = 99
  pet.update(1)
  assert.ok(Math.abs(enemy.petHuntMarkTime - 3) < 1e-6)
  assert.equal(enemy.petHuntMarkDamage, .18)
  pet.dealHit(attacker, enemy, 10)
  assert.ok(Math.abs(enemy.petHuntMarkTime - 5) < 1e-6)
  pet.rallyTime = 0
  pet.update(1)
  assert.ok(Math.abs(enemy.petHuntMarkTime - 4) < 1e-6)
  pet.routeHuntEchoLevel = 0
  pet.dealHit(attacker, enemy, 10)
  assert.ok(Math.abs(enemy.petHuntMarkTime - 3) < 1e-6)
  assert.ok(pet.rally())
  pet.update(1)
  assert.ok(Math.abs(enemy.petHuntMarkTime - 2) < 1e-6)
})

check('猎团回响扩大追猎范围，伙伴优先追击标记目标', game => {
  game.primarySpec = 'symbiosis'; game.weaponSystem.petCombat.route = 'hunt'
  game.mapFeatures.barricades = []
  learn(game, 'sym_hunt_link'); learn(game, 'sym_hunt_chain', 2)
  const pet = game.weaponSystem.petCombat; pet.sync()
  const guardian = pet.items[0]
  guardian.x = game.player.x; guardian.y = game.player.y
  const far = spawn(game, { x: 450, hp: 100 })
  pet.routeHuntEchoLevel = 0
  assert.equal(pet.nearest(guardian), null)
  pet.routeHuntEchoLevel = 2
  assert.equal(pet.nearest(guardian), far)
  const near = spawn(game, { x: 300, hp: 100 })
  assert.equal(pet.nearest(guardian), near)
  far.petHuntMarkTime = 3; far.petHuntMarkDamage = .18
  assert.equal(pet.nearest(guardian), far)
})

console.log(`共生路线验证：${checks} 组通过`)
