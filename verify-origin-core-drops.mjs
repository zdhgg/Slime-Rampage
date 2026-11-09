import assert from 'node:assert/strict'
import { createArena, spawn, spawnBoss, dispose } from './test-support/arena-fixture.mjs'

const g = createArena('origin')
const originalRandom = Math.random
try {
  const enemies = Array.from({ length: 6 }, () => spawn(g, { hp: 1 }))
  for (const enemy of enemies) enemy.isElite = true
  Math.random = () => 0.99
  const cores = () => g.gemManager._gems.filter(gem => ['fire', 'water', 'poison', 'lightning'].includes(gem.type)).length
  const summoned = spawn(g, { hp: 1 })
  summoned.isElite = true
  summoned.summoned = true
  g.weaponSystem._settleKill(summoned)
  assert.equal(cores(), 0, 'summoned elites do not drop cores')
  assert.equal(g.originCoreDropState.eliteSeen, false, 'summoned elites do not advance pity')
  g.weaponSystem._settleKill(enemies[0])
  assert.equal(cores(), 1, 'first elite is guaranteed')
  for (let i = 1; i <= 4; i++) g.weaponSystem._settleKill(enemies[i])
  assert.equal(cores(), 1, 'four failures accumulate')
  g.weaponSystem._settleKill(enemies[5])
  assert.equal(cores(), 2, 'fifth eligible elite triggers pity')
  g.weaponSystem._settleKill(enemies[5])
  assert.equal(cores(), 2, 'duplicate settlement cannot duplicate a drop')
  const boss = spawnBoss(g)
  g.weaponSystem._settleKill(boss)
  assert.equal(cores(), 3, 'independent boss provides one core')
  g.reset()
  assert.deepEqual(g.originCoreDropState, { eliteSeen: false, misses: 0, guardianStages: [] })
  let choice = null
  g.onFusionConfirm = info => { choice = info }
  const core = g.gemManager.spawn(g.player.x, g.player.y, 0, 'fire', { coreChoices: ['fire', 'water'] })
  core.state = 'magnet'
  g.gemManager.update(0.02)
  assert.equal(choice?.coreChoice, true)
  assert.equal(core.state, 'held')
  assert.equal(g.resolveOriginCoreChoice('poison'), false)
  assert.equal(g.resolveOriginCoreChoice('water'), true)
  assert.equal(g.player.elements.get('water'), 1)
  assert.equal(g.player.elements.has('fire'), false)
  assert.equal(g.gemManager._gems.includes(core), false)
  assert.equal(g.resolveOriginCoreChoice('fire'), false, 'choice cannot be submitted twice')
  g.reset()
  const guardian1 = spawnBoss(g)
  guardian1.isExpeditionStageBoss = true
  g.weaponSystem._settleKill(guardian1)
  const guardian2 = spawnBoss(g)
  guardian2.isExpeditionStageBoss = true
  g.weaponSystem._settleKill(guardian2)
  assert.equal(cores(), 1, 'chapter guardians share a chapter budget')
  g.reset()
  const squad = [spawnBoss(g), spawnBoss(g)]
  g.enemyManager._bosses.push(...squad)
  for (const member of squad) { member.isBossSquadMember = true; member.bossGroupSize = 2 }
  squad[0].destroy(); g.weaponSystem._settleKill(squad[0])
  assert.equal(cores(), 0)
  squad[1].destroy(); g.weaponSystem._settleKill(squad[1])
  assert.equal(cores(), 1, 'whole squad shares one core')
  console.log('原生核心首精英保底、连续未掉保底、首领数量和重置通过')
} finally {
  Math.random = originalRandom
  dispose(g)
}
