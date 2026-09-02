import assert from 'node:assert/strict'
import {
  TOWER_DEFENSE_BASE_HP,
  TOWER_DEFENSE_BUILD_SLOTS,
  TOWER_DEFENSE_ENEMY_TYPES,
  TOWER_DEFENSE_STARTING_GOLD,
  TOWER_DEFENSE_TOWER_TYPES,
  TOWER_DEFENSE_WAVES,
  getWaveBaseDamage,
} from './src/game/gameplay/tower-defense/TowerDefenseRules.js'
import { TowerDefenseGameplay } from './src/game/gameplay/tower-defense/TowerDefenseGameplay.js'

const gradient = { addColorStop() {} }
const ctx = new Proxy({}, {
  get(_target, prop) {
    if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => gradient
    return () => {}
  },
  set() { return true },
})

function createSimulation() {
  let result = null
  const game = {
    width: 1280,
    height: 720,
    ctx,
    canvas: { addEventListener() {}, removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) },
    sound: { shoot() {}, levelUp() {}, gameOver() {} },
    _pushGameplayHud() {},
    finishGameplay(snapshot) { result ||= snapshot },
  }
  const gameplay = new TowerDefenseGameplay()
  gameplay.director.loadWaves(TOWER_DEFENSE_WAVES)
  gameplay.attach(game)
  return { gameplay, get result() { return result } }
}

function placeAvailable(gameplay, plan) {
  for (const [slot, type] of plan) {
    if (gameplay.getTowerAtSlot(slot)) continue
    if (gameplay.placeTower(slot, type)) break
  }
}

function upgradeAffordable(gameplay) {
  for (const tower of gameplay.towers) {
    gameplay.selectedSlotIndex = tower.slotIndex
    if (tower.level === 2 && !tower.branchId) gameplay.selectTowerBranch(tower.typeId === 'rapid' ? 'sniper' : tower.typeId === 'slow' ? 'frost-field' : 'heavy-shell')
    gameplay.upgradeSelectedTower()
  }
}

function runScenario(name, plan, adaptive = true, upgrade = true) {
  const simulation = createSimulation()
  const { gameplay } = simulation
  let lastCompleted = 0
  const waveLog = []
  for (let tick = 0; tick < 36000 && gameplay.state !== 'finished'; tick++) {
    if (adaptive && tick % 32 === 0) {
      placeAvailable(gameplay, plan)
      if (upgrade) upgradeAffordable(gameplay)
    }
    if (gameplay.pendingMutationChoices?.length) {
      gameplay.selectMutation(gameplay.pendingMutationChoices[0].id)
    }
    gameplay.updateWorld(0.05)
    if (gameplay.director.completedWaves > lastCompleted) {
      lastCompleted = gameplay.director.completedWaves
      waveLog.push({ wave: lastCompleted, baseHp: gameplay.baseHp, gold: gameplay.gold, kills: gameplay.kills })
    }
  }
  assert.equal(gameplay.state, 'finished', `${name} must settle within simulation budget`)
  return { name, result: simulation.result, waveLog, gameplay }
}

assert.equal(TOWER_DEFENSE_WAVES.length, 10)
assert.equal(Object.keys(TOWER_DEFENSE_ENEMY_TYPES).length, 8)
assert.ok(TOWER_DEFENSE_WAVES.every((wave) => wave.groups.length > 0 && wave.count > 0))
assert.ok(TOWER_DEFENSE_WAVES.reduce((sum, wave) => sum + getWaveBaseDamage(TOWER_DEFENSE_WAVES.indexOf(wave)), 0) < 240)
assert.ok(TOWER_DEFENSE_TOWER_TYPES.blast.branches['heavy-shell'].level4.damage > TOWER_DEFENSE_TOWER_TYPES.blast.levels[0].damage)
assert.ok(TOWER_DEFENSE_ENEMY_TYPES.boss.hp > 700)
assert.ok(TOWER_DEFENSE_STARTING_GOLD >= TOWER_DEFENSE_TOWER_TYPES.rapid.cost + TOWER_DEFENSE_TOWER_TYPES.slow.cost + TOWER_DEFENSE_TOWER_TYPES.blast.cost)

const balanced = runScenario('balanced', [
  [0, 'rapid'], [1, 'slow'], [2, 'blast'], [3, 'rapid'], [4, 'slow'], [5, 'blast'], [6, 'rapid'], [7, 'blast'],
])
const singleRapid = runScenario('single-rapid', [
  [0, 'rapid'], [1, 'rapid'], [2, 'rapid'], [3, 'rapid'], [4, 'rapid'], [5, 'rapid'], [6, 'rapid'], [7, 'rapid'],
], true, false)
const singleSlow = runScenario('single-slow', [
  [0, 'slow'], [1, 'slow'], [2, 'slow'], [3, 'slow'], [4, 'slow'], [5, 'slow'], [6, 'slow'], [7, 'slow'],
])
const control = runScenario('control', [], false)

assert.equal(balanced.result.outcome, 'victory', `balanced strategy should clear all waves: ${JSON.stringify(balanced.result)}`)
assert.ok(balanced.result.baseHp > 0)
assert.equal(balanced.waveLog.length, balanced.gameplay.director.waves.length)
assert.equal(control.result.outcome, 'defeat')
assert.ok(control.result.completedWaves < 4, 'no-build control should fail early')
assert.ok(singleRapid.result.outcome !== 'victory' || singleRapid.result.baseHp < balanced.result.baseHp)
assert.ok(singleSlow.result.outcome !== 'victory' || singleSlow.result.baseHp < balanced.result.baseHp)

for (const scenario of [balanced, singleRapid, singleSlow, control]) {
  console.log(`${scenario.name}: ${scenario.result.outcome}, wave ${scenario.result.completedWaves}/${scenario.result.totalWaves}, base ${scenario.result.baseHp}, kills ${scenario.result.kills}, gold ${scenario.result.gold}`)
}
console.log('Tower defense balance verification passed ✓')
