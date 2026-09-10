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
assert.equal(Object.keys(TOWER_DEFENSE_ENEMY_TYPES).length, 9)
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

// ---- 战役关卡难度基准：零建造基线 + 标准 3 塔线 ----
// 零建造基线：挂机必须在每一关都付出巢心代价；
// 标准 3 塔线：中期曲线不应拦死正常游玩（仍可通关），后期不应满血碾压。
function createStageSimulation(stageId) {
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
  gameplay.loadStage(stageId)
  gameplay.attach(game)
  return { gameplay, get result() { return result } }
}

function runStageScenario(stageId, planFactory, upgrade = true) {
  const simulation = createStageSimulation(stageId)
  const { gameplay } = simulation
  const plan = planFactory(gameplay)
  for (let tick = 0; tick < 36000 && gameplay.state !== 'finished'; tick++) {
    if (tick % 32 === 0) {
      placeAvailable(gameplay, plan)
      if (upgrade) upgradeAffordable(gameplay)
    }
    if (gameplay.pendingMutationChoices?.length) {
      gameplay.selectMutation(gameplay.pendingMutationChoices[0].id)
    }
    gameplay.updateWorld(0.05)
  }
  assert.equal(gameplay.state, 'finished', `stage ${stageId} simulation must settle within budget`)
  return simulation.result
}

const BENCH_STAGES = [1, 5, 10, 20, 40]
// 基准阵型随解锁进度升级：模拟"会玩的玩家"用上当前关卡应有的塔种工具箱，并优先占据贴路径的槽位
function skilledLine(stageId) {
  if (stageId <= 1) return ['rapid', 'slow', 'rapid']
  if (stageId <= 4) return ['rapid', 'slow', 'blast', 'rapid', 'slow']
  if (stageId <= 20) return ['rapid', 'blast', 'shock', 'rapid', 'slow', 'blast']
  return ['blast', 'shock', 'arcane', 'rapid', 'blast', 'shock']
}
function skilledPlan(gameplay, stageId) {
  const path = gameplay.stageConfig?.path || []
  const open = [...gameplay.unlockedSlots].sort((a, b) => a - b)
  const ranked = open
    .map((idx) => {
      const slot = gameplay.buildSlots[idx]
      const d = path.length ? Math.min(...path.map((p) => Math.hypot(p.x - slot.x, p.y - slot.y))) : 0
      return { idx, d }
    })
    .sort((a, b) => a.d - b.d)
  const line = skilledLine(stageId)
  return line.map((type, i) => [ranked[i]?.idx ?? open[i], type])
}
const benchRows = []
for (const stageId of BENCH_STAGES) {
  const afk = runStageScenario(stageId, () => [], false)
  assert.equal(afk.outcome, 'defeat', `第 ${stageId} 关零建造基线必须战败（当前波次 ${afk.completedWaves}）`)

  const standard = runStageScenario(stageId, (gp) => skilledPlan(gp, stageId))
  const heartsLost = TOWER_DEFENSE_BASE_HP - standard.baseHp
  benchRows.push({ stage: stageId, outcome: standard.outcome, waves: `${standard.completedWaves}/${standard.totalWaves}`, heartsLost, kills: standard.kills })

  if (stageId === 1) {
    assert.equal(standard.outcome, 'victory', `教学关标准阵型应能通关: ${JSON.stringify(standard)}`)
    assert.ok(standard.baseHp >= 16, `教学关标准阵型应舒适通关（剩余 ${standard.baseHp}，要求 ≥ 16）`)
  } else if (stageId <= 10) {
    assert.equal(standard.outcome, 'victory', `第 ${stageId} 关熟练阵型应仍可通关（防曲线过陡）: ${JSON.stringify(standard)}`)
  } else {
    // 后期关卡只要求压力存在（不能满血碾压）；机器人强度有限，战败属参考信息
    assert.ok(heartsLost > 0, `第 ${stageId} 关熟练阵型不应满血碾压（压力不足，剩余 ${standard.baseHp}）`)
  }
}
for (const row of benchRows) {
  console.log(`第 ${row.stage} 关基准: ${row.outcome} | 波次 ${row.waves} | 漏心 ${row.heartsLost} | 击杀 ${row.kills}`)
}
console.log('Tower defense balance verification passed ✓')
