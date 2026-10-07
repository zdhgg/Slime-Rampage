import assert from 'node:assert/strict'
import { getStageMiniBoss, MINI_BOSS_TYPES } from './src/game/gameplay/tower-defense/TowerDefenseMiniBosses.js'
import { getStageConfig } from './src/game/gameplay/tower-defense/TowerDefenseCampaignRules.js'
import { getWaveCompositionFromWaves } from './src/game/gameplay/tower-defense/TowerDefenseRules.js'
import { TowerDefenseDirector } from './src/game/gameplay/tower-defense/TowerDefenseDirector.js'
import { createSimulation } from './tower-defense-simulation.mjs'

const stages = []
for (let stage = 1; stage <= 99; stage++) {
  const config = getStageConfig(stage)
  const groups = config.waves.flatMap(w => w.groups)
  const minis = groups.filter(g => g.miniBoss)
  const expected = stage % 5 === 0 && !config.isBossStage
  assert.equal(minis.length, expected ? 1 : 0, `Mini-boss cadence at stage ${stage}`)
  assert.equal(!!config.miniBoss, expected)
  if (!expected) continue
  stages.push(stage)
  const final = config.waves.at(-1)
  const group = minis[0]
  assert.ok(final.groups.includes(group))
  assert.equal(group.count, 1)
  assert.ok(group.miniBoss.damage >= 5 && group.miniBoss.damage <= 7)
  // The ordinary formula's count is reduced by four: seven units replaced with one leader and two escorts.
  const w = config.waveCount, ramp = Math.min((w - 1) / 4, 1)
  const ordinaryCount = stage === 5 ? 32 : 7 + w * 2 + Math.floor(Math.min(stage, 30) / 12) + Math.floor((config.chapterId - 1) * ramp)
  assert.equal(final.groups.reduce((sum, g) => sum + g.count, 0), ordinaryCount - 4)
  const preview = getWaveCompositionFromWaves(config.waves, w - 1)
  const entry = preview.find(e => e.id === `mini_${group.miniBoss.id}`)
  assert.equal(entry.count, 1, 'Leader preview stays separate from ordinary units of the same base type')
  assert.ok(entry.name.includes(group.miniBoss.name))
  assert.ok(entry.traits.some(t => t.label === group.miniBoss.counter))
  const director = new TowerDefenseDirector(config.waves)
  const spawned = director._createEnemy(group)
  assert.equal(spawned.name, config.miniBoss.name)
  assert.equal(spawned.boss, false, 'Mini-bosses do not inherit chapter boss phase mechanics')
  assert.equal(spawned.miniBoss.id, config.miniBoss.id)
  assert.equal(spawned.damage, config.miniBoss.damage)
}
assert.deepEqual(stages, [5,10,15,25,30,35,45,50,55,65,70,75,85,90,95])
assert.equal(Object.keys(MINI_BOSS_TYPES).length, 6)
assert.deepEqual([5,10,15].map(s => getStageMiniBoss(s).name), ['裂殖先锋','重甲队长','菌甲督军'])
for (const input of [0, 4, 20, 40, 60, 80, 99, 100, 5.5, NaN]) assert.equal(getStageMiniBoss(input), null)

function leader(stage) {
  const config = getStageConfig(stage)
  return new TowerDefenseDirector(config.waves)._createEnemy(config.waves.at(-1).groups.find(g => g.miniBoss))
}
const gp = createSimulation(5)
const brood = leader(5)
gp._addEnemy(brood)
gp._applyDamage(brood, brood.maxHp * .31, { armorPierce: 1 })
assert.equal(gp.enemies.length, 3)
gp._applyDamage(brood, brood.maxHp * .35, { armorPierce: 1 })
assert.equal(gp.enemies.length, 5)
gp._applyDamage(brood, 1)
assert.equal(gp.enemies.length, 5, 'Each threshold releases its brood once')
assert.ok(gp.enemies.slice(1).every(e => e.reward === 0))
assert.equal(brood.bossPhase, 1, 'No chapter-wide enrage or bonus escorts')
const aimSlot=[...gp.unlockedSlots][0]
const aimPosition=gp.buildSlots[aimSlot]
brood.x=aimPosition.x; brood.y=aimPosition.y
const ordinary={...brood,id:99999,miniBoss:null,progress:.9}
gp.enemies=[ordinary,brood]
assert.equal(gp._findTarget({slotIndex:aimSlot,targetStrategy:'boss'},1),brood,'Boss priority also targets mini-bosses')

const armored = leader(10)
const normal = gp._applyDamage(armored, 20).hpDamage
const piercing = gp._applyDamage(armored, 20, { armorPierce: 1 }).hpDamage
assert.ok(piercing > normal * 2)

gp.loadStage(15)
const commander = leader(15)
commander.hp -= 50
gp._addEnemy(commander)
const group = getStageConfig(15).waves.at(-1).groups
const index = group.findIndex(g => g.miniBoss)
assert.deepEqual(group.slice(index + 1, index + 3).map(g => g.type), ['support', 'support'])
const healer = new TowerDefenseDirector()._createEnemy(group[index + 1])
healer.supportTimer = 0
gp._addEnemy(healer)
const beforeHeal = commander.hp
gp._updateEnemies(.01)
assert.ok(commander.hp > beforeHeal, 'The commander is actually healed by its escort')

gp.loadStage(30)
const ward = leader(30)
const ally = new TowerDefenseDirector()._createEnemy({type:'grunt',scale:1})
gp._addEnemy(ward); gp._addEnemy(ally)
ward.wardTimer = 0
gp._updateEnemies(.01)
assert.equal(ally.shield,18)
ward.wardTimer=0; ward.silenceTimer=2
gp._updateEnemies(.01)
assert.equal(ally.shield,18,'Silence suppresses mini-boss shield pulses')

gp.loadStage(35)
const slot = [...gp.unlockedSlots][0]
gp.placeTower(slot,'rapid')
const emp = leader(35)
emp.x=gp.buildSlots[slot].x; emp.y=gp.buildSlots[slot].y; emp.empTimer=0
gp.enemies=[emp]; gp._updateEnemies(.01)
assert.ok(gp.towers[0].disabledTimer>0,'The electromagnetic mini-boss disables nearby towers')

gp.loadStage(25)
const charger = leader(25)
gp._addEnemy(charger); gp._updateEnemies(.1)
assert.ok(charger.progress > charger.baseSpeed * .1,'Charger delivers its advertised sprint')

gp.loadStage(5)
const leaking = leader(5)
leaking.progress=.999; leaking.baseSpeed=1
gp._addEnemy(leaking); gp._updateEnemies(.01)
assert.equal(gp.baseHp,15,'Mini-boss leakage hurts but is not an automatic chapter defeat')
assert.equal(gp.state,'active')
gp.destroy()
console.log('✓ 15 mini-boss encounters: cadence, replacement budget, previews, six mechanics, priority and leakage')
