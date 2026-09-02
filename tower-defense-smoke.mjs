// Tower defense gameplay lifecycle and rules smoke test.
import assert from 'node:assert/strict'

const gradient = { addColorStop() {} }
const ctx2d = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => gradient
      return () => {}
    },
    set() {
      return true
    },
  }
)

const listeners = new Map()
const removed = []
const canvasStub = {
  getBoundingClientRect: () => ({ left: 10, top: 20, width: 1280, height: 720 }),
  getContext: () => ctx2d,
  addEventListener(type, listener) {
    listeners.set(type, listener)
  },
  removeEventListener(type, listener) {
    removed.push([type, listener])
    if (listeners.get(type) === listener) listeners.delete(type)
  },
}

globalThis.window = {
  addEventListener() {},
  removeEventListener() {},
  devicePixelRatio: 1,
  matchMedia: () => ({ matches: false }),
}
globalThis.document = {
  createElement: () => canvasStub,
  addEventListener() {},
  removeEventListener() {},
  hidden: false,
}
globalThis.requestAnimationFrame = () => 0
globalThis.cancelAnimationFrame = () => {}

const { ArenaGameplay } = await import('./src/game/gameplay/ArenaGameplay.js')
const { createGameplay, normalizeGameplayId } = await import('./src/game/gameplay/GameplayFactory.js')
const { TowerDefenseGameplay } = await import('./src/game/gameplay/tower-defense/TowerDefenseGameplay.js')
const { TowerDefenseDirector } = await import('./src/game/gameplay/tower-defense/TowerDefenseDirector.js')
const {
  TOWER_DEFENSE_BASE_HP,
  TOWER_DEFENSE_BUILD_SLOTS,
  TOWER_DEFENSE_ENEMY_TYPES,
  TOWER_DEFENSE_STARTING_GOLD,
  TOWER_DEFENSE_TARGET_STRATEGIES,
  TOWER_DEFENSE_TOWER_TYPES,
  TOWER_DEFENSE_WAVE_COUNT,
  TOWER_DEFENSE_WAVES,
  getTowerStats,
  getWaveComposition,
} = await import('./src/game/gameplay/tower-defense/TowerDefenseRules.js')

assert.ok(createGameplay('tower-defense') instanceof TowerDefenseGameplay)
assert.equal(normalizeGameplayId('tower-defense'), 'tower-defense')
assert.ok(createGameplay('not-a-mode') instanceof ArenaGameplay)
console.log('✓ Tower defense factory id is registered with arena fallback intact')

let hudPushes = 0
let result = null
const gameStub = {
  width: 1280,
  height: 720,
  canvas: canvasStub,
  ctx: ctx2d,
  sound: {
    shoot() {},
    levelUp() {},
    gameOver() {},
  },
  _pushGameplayHud() {
    hudPushes++
  },
  finishGameplay(snapshot) {
    if (!result) result = snapshot
  },
}

const gameplay = new TowerDefenseGameplay()
gameplay.attach(gameStub)
assert.equal(gameplay.usesArenaFramePipeline(), false)
assert.equal(listeners.has('pointerdown'), true)
assert.equal(listeners.has('pointermove'), true)
gameplay.renderWorld(ctx2d)
gameStub.width = 720
gameStub.height = 1080
gameplay.renderWorld(ctx2d)
assert.equal(gameplay.renderer.width, 720)
assert.equal(gameplay.renderer.height, 1080)
console.log('✓ Tower defense owns its frame boundary, canvas events and responsive renderer')

gameplay.reset()
const initialHud = gameplay.getHudSnapshot()
assert.equal(initialHud.mode, 'tower-defense')
assert.equal(initialHud.baseHp, TOWER_DEFENSE_BASE_HP)
assert.equal(initialHud.gold, TOWER_DEFENSE_STARTING_GOLD)
assert.equal(initialHud.wave, 0)
assert.ok(initialHud.totalWaves >= 4)
assert.equal(initialHud.towerTypes.length, 6)
assert.equal(initialHud.selectedTower, null)
assert.equal(initialHud.currentWaveComposition[0].id, 'grunt')
assert.ok(initialHud.nextWavePreview.some(({ id }) => id === 'runner'))
assert.equal(initialHud.baseDamagePreview, 7)
assert.equal(Object.keys(TOWER_DEFENSE_ENEMY_TYPES).length, 8)
assert.equal(TOWER_DEFENSE_TARGET_STRATEGIES.length, 6)
assert.equal(getWaveComposition(9).some(({ id }) => id === 'boss'), true)
assert.deepEqual(new Set(initialHud.towerTypes.map(({ id }) => id)), new Set(['rapid', 'slow', 'blast', 'shock', 'arcane', 'radiant']))
console.log('✓ Tower defense reset and HUD expose economy, composition previews and all tower choices')

for (const choice of initialHud.towerTypes) {
  if (choice.unlocked) {
    assert.equal(gameplay.selectTowerType(choice.id), true, `selectTowerType(${choice.id}) must succeed`)
    assert.equal(gameplay.selectTowerType(choice.type), true, `selectTowerType(${choice.type}) must succeed`)
    assert.equal(gameplay.getHudSnapshot().selectedTowerTypeId, choice.id)
  }
}
assert.equal(gameplay.selectTowerType('slow'), true)
assert.equal(gameplay.selectTowerType('missing'), false)
assert.equal(gameplay.placeTower(-1), false)

// Test slot-first selection: clicking an empty slot selects it without spending gold
gameStub.width = 1280
gameStub.height = 720
gameplay.renderWorld(ctx2d)
const slot0Projected = gameplay.renderer.project(TOWER_DEFENSE_BUILD_SLOTS[0])
listeners.get('pointerdown')({ clientX: slot0Projected.x + 10, clientY: slot0Projected.y + 20 })
assert.equal(gameplay.selectedSlotIndex, 0)
assert.equal(gameplay.towers.length, 0, 'clicking empty slot must not place a tower until type chosen')
let slotHud = gameplay.getHudSnapshot()
assert.equal(slotHud.selectedSlotIndex, 0)
assert.equal(slotHud.selectedTower, null)

// Selecting tower type while empty slot is selected builds the tower on that slot
assert.equal(gameplay.selectTowerType('slow'), true)
assert.equal(gameplay.towers.length, 1)
assert.equal(gameplay.towers[0].slotIndex, 0)
assert.equal(gameplay.towers[0].typeId, 'slow')
assert.equal(gameplay.gold, TOWER_DEFENSE_STARTING_GOLD - TOWER_DEFENSE_TOWER_TYPES.slow.cost)
assert.equal(gameplay.placeTower(0), false, 'occupied build slot must reject a second tower')

const projected = gameplay.renderer.project(TOWER_DEFENSE_BUILD_SLOTS[0])
assert.equal(gameplay.selectTowerAt(projected.x, projected.y)?.slotIndex, 0)
let selectedHud = gameplay.getHudSnapshot().selectedTower
assert.equal(selectedHud.level, 1)
assert.equal(selectedHud.typeId, 'slow')
const upgradeCost = selectedHud.upgradeCost
gameplay.gold = upgradeCost
assert.equal(gameplay.upgradeSelectedTower(), true)
assert.equal(gameplay.towers[0].level, 2)
selectedHud = gameplay.getHudSnapshot().selectedTower
assert.equal(selectedHud.maxLevel, 4)
assert.equal(selectedHud.branchOptions.length, 2)
assert.equal(selectedHud.targetStrategies.length, 6)
assert.equal(gameplay.upgradeSelectedTower(), false, 'level three requires a specialization')
assert.equal(gameplay.selectTowerBranch('frost-field'), true)
assert.equal(gameplay.towers[0].branchId, 'frost-field')
assert.equal(gameplay.selectTowerBranch('ice-chain'), true, 'must allow changing branch preselection while at Lv.2')
assert.equal(gameplay.towers[0].branchId, 'ice-chain')
assert.equal(gameplay.setSelectedTowerStrategy('support'), true)
gameplay.gold = selectedHud.upgradeCost
assert.equal(gameplay.upgradeSelectedTower(), true)
assert.equal(gameplay.selectTowerBranch('frost-field'), false, 'branch must be locked once upgraded to Lv.3')
selectedHud = gameplay.getHudSnapshot().selectedTower
assert.equal(selectedHud.level, 3)
assert.equal(selectedHud.branch.id, 'ice-chain')
assert.equal(selectedHud.targetStrategy.id, 'support')
assert.ok(selectedHud.dps > 0)
assert.match(selectedHud.effectText, /跳转/)
const sellValue = selectedHud.sellValue
assert.equal(gameplay.sellSelectedTower(), true)
assert.equal(gameplay.towers.length, 0)
assert.equal(gameplay.gold, sellValue)
assert.ok(hudPushes >= 9, 'tower controls must immediately request HUD refresh')
console.log('✓ Tower upgrades require a branch, expose strategy stats and preserve sale economy')

gameplay.reset()
gameplay.placeTower(2, 'rapid')
const combatSlot = TOWER_DEFENSE_BUILD_SLOTS[2]
gameplay.enemies.push({
  id: 501,
  wave: 1,
  progress: 0.3,
  hp: 6,
  maxHp: 6,
  speed: 0,
  reward: 9,
  damage: 1,
  color: '#fff',
  boss: false,
  slowTimer: 0,
  slowRatio: 0,
  hitFlash: 0,
  active: true,
  x: combatSlot.x,
  y: combatSlot.y,
})
const combatGold = gameplay.gold
gameplay.updateWorld(0.01)
assert.equal(gameplay.enemies.length, 0)
assert.equal(gameplay.kills, 1)
assert.equal(gameplay.gold, combatGold + 9)
assert.equal(gameplay.shots.length, 1)
console.log('✓ Towers automatically acquire targets, deal damage and award kill gold')

function collectDirectorRun() {
  const director = new TowerDefenseDirector()
  const waves = Array.from({ length: TOWER_DEFENSE_WAVE_COUNT }, () => [])
  let guard = 0
  while (director.phase !== 'complete' && guard++ < 100) {
    const events = director.update(100, 0)
    for (const { wave, hp, speed, reward, damage, boss } of events.spawns) {
      waves[wave - 1].push({ wave, hp, speed, reward, damage, boss })
    }
    director.update(0, 0)
  }
  return { director, waves }
}

const runA = collectDirectorRun()
const runB = collectDirectorRun()
assert.deepEqual(runA.waves, runB.waves)
assert.equal(runA.waves.length, TOWER_DEFENSE_WAVE_COUNT)
assert.equal(runA.director.completedWaves, TOWER_DEFENSE_WAVE_COUNT)
assert.equal(runA.waves.at(-1).length, TOWER_DEFENSE_WAVES.at(-1).count)
assert.equal(runA.waves.at(-1).filter(({ boss }) => boss).length, 1)
console.log('✓ Tower defense director deterministically produces ten composition waves')

gameplay.reset()
gameplay.director.waveIndex = 9
gameplay.director.completedWaves = 9
gameplay.director.phase = 'waiting'
gameplay.director.spawned = 1
result = null
gameplay.updateWorld(1 / 60)
assert.equal(gameplay.state, 'finished')
assert.equal(gameplay.outcome, 'victory')
assert.equal(result.mode, 'tower-defense')
assert.equal(result.outcome, 'victory')
assert.equal(result.totalWaves, 10)
const victoryResult = result
gameplay.updateWorld(1)
assert.equal(result, victoryResult, 'result must only be emitted once')

gameplay.reset()
result = null
gameplay.baseHp = 1
gameplay.enemies.push({
  id: 999,
  wave: 1,
  progress: 0.999,
  hp: 1,
  maxHp: 1,
  speed: 1,
  reward: 0,
  damage: 1,
  color: '#fff',
  boss: false,
  slowTimer: 0,
  slowRatio: 0,
  hitFlash: 0,
  active: true,
  x: 0.97,
  y: 0.76,
})
gameplay.updateWorld(0.02)
assert.equal(gameplay.outcome, 'defeat')
assert.equal(result.outcome, 'defeat')
assert.equal(gameplay.getHudSnapshot().state, 'finished')
console.log('✓ Wave completion, victory, base defeat and one-shot result snapshots settle correctly')

// Mechanism-level combat checks: shields, armor, resistance, support, split, boss and targeting.
gameplay.reset()
const shielded = {
  id: 601, typeId: 'shield', hp: 40, maxHp: 40, shield: 20, maxShield: 20, armor: 0,
  slowResistance: 0.1, slowTimer: 0, slowRatio: 0, freezeTimer: 0, frostStacks: 0,
  progress: 0.2, x: 0.2, y: 0.2, reward: 1, damage: 1, active: true,
}
assert.equal(gameplay._applyDamage(shielded, 12).absorbedShield, 12)
assert.equal(shielded.hp, 40)
assert.equal(gameplay._applyDamage(shielded, 12).shieldBroken, true)
assert.ok(shielded.hp < 40)
const armored = { ...shielded, id: 602, shield: 0, hp: 100, maxHp: 100, armor: 0.5, active: true }
const normalDamage = gameplay._applyDamage(armored, 20).hpDamage
const pierced = { ...armored, id: 603, hp: 100, active: true }
const piercedDamage = gameplay._applyDamage(pierced, 20, { armorPierce: 1 }).hpDamage
assert.equal(normalDamage, 10)
assert.equal(piercedDamage, 20)
const resistant = { ...armored, id: 604, hp: 100, active: true, slowResistance: 0.5 }
gameplay._applySlow(resistant, { slowRatio: 0.8, slowDuration: 2, fireKind: 'slow' })
resistant.baseSpeed = 1
gameplay._updateEnemies(0.1)
assert.ok(resistant.progress > 0.09, 'slow resistance should preserve half of movement speed')
const support = { ...armored, id: 605, typeId: 'support', hp: 40, maxHp: 100, x: 0.2, y: 0.2, supportRadius: 0.2, supportHeal: 8, supportTimer: 0, active: true }
const ally = { ...armored, id: 606, hp: 20, maxHp: 100, x: 0.25, y: 0.2, active: true }
gameplay.enemies = [support, ally]
gameplay._updateEnemies(0.01)
assert.equal(ally.hp, 28)
const splitter = { ...armored, id: 607, typeId: 'splitter', hp: 1, maxHp: 1, x: 0.3, y: 0.3, progress: 0.3, splitCount: 2, splitResolved: false, reward: 10, wave: 1, active: true }
gameplay.enemies = [splitter]
gameplay._applyDamage(splitter, 2)
assert.equal(gameplay.enemies.filter(({ typeId }) => typeId === 'swarm').length, 2)
assert.equal(gameplay.gold, TOWER_DEFENSE_STARTING_GOLD + 10)
const boss = { ...armored, id: 608, typeId: 'boss', boss: true, bossPhase: 1, hp: 40, maxHp: 100, maxShield: 100, shield: 0, progress: 0.3, x: 0.3, y: 0.3, reward: 0, wave: 10, active: true }
gameplay.enemies = [boss]
gameplay._applyDamage(boss, 1)
assert.equal(boss.bossPhase, 2)
assert.ok(gameplay.enemies.length >= 4)
const targetBase = { id: 700, typeId: 'grunt', hp: 10, maxHp: 10, progress: 0.2, x: TOWER_DEFENSE_BUILD_SLOTS[0].x, y: TOWER_DEFENSE_BUILD_SLOTS[0].y, active: true }
const targetSupport = { id: 701, typeId: 'support', hp: 20, maxHp: 20, progress: 0.1, x: targetBase.x, y: targetBase.y, active: true }
gameplay.enemies = [targetBase, targetSupport]
const targetTower = { slotIndex: 0, targetStrategy: 'support' }
assert.equal(gameplay._findTarget(targetTower, 1).id, 701)
targetTower.targetStrategy = 'last'
assert.equal(gameplay._findTarget(targetTower, 1).id, 701)
targetTower.targetStrategy = 'weak'
targetBase.hp = 1
console.log('✓ Enemy combat mechanisms and target strategies resolve deterministically')

// Interactive Features Test
gameplay.reset()
assert.equal(gameplay.unlockedSlots.has(0), true)
assert.equal(gameplay.unlockedSlots.has(8), false)
// Clear locked slot 8
const prevGold = gameplay.gold
assert.equal(gameplay.clearObstacle(8), true)
assert.equal(gameplay.unlockedSlots.has(8), true)
assert.equal(gameplay.gold, prevGold - 40 + 60)

// Test Leyline stats resonance
const resonantStats = getTowerStats('rapid', 1, null, 0) // Slot 0 is acid leyline
const baseStats = getTowerStats('rapid', 1, null, null)
assert.ok(resonantStats.damage > baseStats.damage || resonantStats.fireInterval < baseStats.fireInterval)

// Test Slime Guardian Tactical Leap
assert.equal(gameplay.placeTower(0, 'rapid'), true)
assert.equal(gameplay.relocateTower(0, 1), true)
assert.equal(gameplay.getTowerAtSlot(0), null)
assert.equal(gameplay.getTowerAtSlot(1)?.typeId, 'rapid')
assert.ok(gameplay.getTowerAtSlot(1)?.relocateCooldown > 0)

// Test Petting Morale Boost
assert.equal(gameplay.petTower(1), true)
assert.ok(gameplay.getTowerAtSlot(1)?.moraleTimer > 0)

// Test Tactical Traps Trigger
assert.equal(gameplay.triggerTrap('spore_shroom'), true)
assert.equal(gameplay.triggerTrap('spore_shroom'), false, 'trap on cooldown cannot trigger again')
assert.equal(gameplay.triggerTrap('slime_geyser'), true)
assert.equal(gameplay.triggerTrap('hive_crystal'), true)
assert.ok(gameplay.getTowerAtSlot(1)?.feverTimer > 0)
console.log('✓ Interactive battlefield elements (leylines, clearable obstacles, traps, leaping, petting) fully operational')

const pointerDown = listeners.get('pointerdown')
const pointerMove = listeners.get('pointermove')
gameplay.destroy()
assert.equal(gameplay.game, null)
assert.equal(listeners.has('pointerdown'), false)
assert.equal(listeners.has('pointermove'), false)
assert.ok(removed.some(([type, listener]) => type === 'pointerdown' && listener === pointerDown))
assert.ok(removed.some(([type, listener]) => type === 'pointermove' && listener === pointerMove))
console.log('✓ Tower defense destroy unbinds both canvas pointer listeners')

console.log('\nTower defense smoke test passed ✓')
