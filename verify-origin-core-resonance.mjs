import assert from 'node:assert/strict'
import { createArena, spawn, pressSpace, dispose, rollSkills } from './test-support/arena-fixture.mjs'
import { applyOriginCoreResonance, getOriginCoreResonance } from './src/game/OriginCoreResonance.js'

let checks = 0
function check(name, run, strain = 'origin') {
  const game = createArena(strain)
  try {
    run(game)
    console.log(`✓ ${++checks}. ${name}`)
  } finally {
    dispose(game)
  }
}

function awakenElemental(game) {
  game.player.level = 5
  const card = rollSkills(game).find((skill) => skill.isMilestone && skill.spec === 'elemental')
  assert.ok(card)
  assert.equal(game.applySkill(card), true)
}

check('元素主专精从已激活反应中选择最低等级最高的一对', (game) => {
  awakenElemental(game)
  game.player.elements = new Map([
    ['fire', 2],
    ['water', 2],
    ['poison', 1],
  ])
  game.player._primaryReaction = 'steam'
  game.player._secondaryIds = new Set(['acid'])
  game.player._refreshElements()
  const resonance = getOriginCoreResonance(game)
  assert.equal(resonance.id, 'steam')
  assert.deepEqual(resonance.icons, ['🔥', '💧'])
  assert.equal(resonance.strength, 2)
  assert.equal(resonance.primary, true)
})

check('并列时主反应优先，动态共鸣不改变主形态', (game) => {
  awakenElemental(game)
  game.player.elements = new Map([
    ['fire', 2],
    ['water', 2],
    ['poison', 2],
  ])
  game.player._primaryReaction = 'acid'
  game.player._secondaryIds = new Set(['steam'])
  game.player._refreshElements()
  const resonance = getOriginCoreResonance(game)
  assert.equal(resonance.id, 'acid')
  assert.equal(game.player._primaryReaction, 'acid')
})

check('元素主专精震荡触发一次轻量晶核共鸣', (game) => {
  awakenElemental(game)
  game.player.elements = new Map([
    ['fire', 2],
    ['water', 2],
  ])
  game.player._primaryReaction = 'steam'
  game.player._secondaryIds = new Set()
  game.player._refreshElements()
  const enemy = spawn(game, { x: 40, hp: 1000 })
  const beforeEnergy = game.player.primalEnergy
  const summary = applyOriginCoreResonance(game, 120, 10)
  assert.equal(summary.id, 'steam')
  assert.equal(summary.effect, '蒸汽迷雾')
  assert.equal(game.weaponSystem._clouds.length, 1)
  assert.equal(game.player.primalEnergy, beforeEnergy)
  assert.ok(enemy.active)
})

check('非元素主专精不获得晶核共鸣', (game) => {
  game.player.level = 5
  const card = rollSkills(game).find((skill) => skill.isMilestone && skill.spec === 'gatling')
  assert.ok(card)
  assert.equal(game.applySkill(card), true)
  game.player.elements = new Map([['fire', 3], ['water', 3]])
  game.player._primaryReaction = 'steam'
  game.player._refreshElements()
  assert.equal(getOriginCoreResonance(game), null)
})

check('原生拟态外的元素血统不获得晶核共鸣', (game) => {
  game.primarySpec = 'elemental'
  game.player.elements = new Map([['fire', 2], ['water', 2]])
  game.player._primaryReaction = 'steam'
  game.player._refreshElements()
  assert.equal(getOriginCoreResonance(game), null)
}, 'elemental')

check('黏液震荡的元素方向会显示晶核共鸣说明', (game) => {
  awakenElemental(game)
  game.player.elements = new Map([['fire', 2], ['poison', 2]])
  game.player._primaryReaction = 'acid'
  game.player._secondaryIds = new Set()
  game.player._refreshElements()
  spawn(game, { x: 60, hp: 1000 })
  assert.match(game.strainSkill.getDesc(game), /晶核共鸣：🔥＋☠️ 爆炸酸液/)
  pressSpace(game)
  assert.ok(game.weaponSystem._pools.length > 0)
})

console.log(`原生晶核共鸣：${checks} 组通过`)

