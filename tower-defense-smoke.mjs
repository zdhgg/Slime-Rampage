// Tower defense gameplay lifecycle and rules smoke test.
import assert from 'node:assert/strict'
import { getBuildMenuPosition } from './src/components/towerDefenseBuildMenuLayout.js'

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
  getWaveCompositionFromWaves,
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
assert.equal(initialHud.towerTypes.length, 2)
assert.equal(initialHud.selectedTower, null)
assert.equal(initialHud.currentWaveComposition[0].id, 'grunt')
// 情报现在读取关卡实战波次（第 1 关第 2 波为步战小队），不再是默认表
assert.ok(initialHud.nextWavePreview.some(({ id }) => id === 'grunt'))
assert.equal(getWaveCompositionFromWaves(gameplay.director.waves, 2).some(({ id }) => id === 'runner'), true)
assert.equal(initialHud.baseDamagePreview, 4, 'Leak preview uses the four actual campaign enemies')
assert.equal(Object.keys(TOWER_DEFENSE_ENEMY_TYPES).length, 16)
assert.equal(TOWER_DEFENSE_TARGET_STRATEGIES.length, 6)
assert.equal(getWaveComposition(9).some(({ id }) => id === 'boss'), true)
assert.deepEqual(new Set(initialHud.towerTypes.map(({ id }) => id)), new Set(['rapid', 'slow']))
console.log('✓ Introductory HUD exposes economy, wave previews and two basic tower choices')

for (const choice of initialHud.towerTypes) {
  if (choice.unlocked) {
    assert.equal(gameplay.selectTowerType(choice.id), true, `selectTowerType(${choice.id}) must succeed`)
    assert.equal(gameplay.selectTowerType(choice.type), true, `selectTowerType(${choice.type}) must succeed`)
    assert.equal(gameplay.getHudSnapshot().selectedTowerTypeId, choice.id)
  }
}
// Exercise advanced combat and interactions on a regular stage.
gameplay.loadStage(16)
assert.equal(gameplay.selectTowerType('slow'), true)
assert.equal(gameplay.selectTowerType('missing'), false)
assert.equal(gameplay.placeTower(-1), false)

// Test slot-first selection: clicking an empty slot selects it without spending gold
gameStub.width = 1280
gameStub.height = 720
gameplay.renderWorld(ctx2d)
const slot0Projected = gameplay.renderer.project(gameplay.buildSlots[0])
listeners.get('pointerdown')({ clientX: slot0Projected.x + 10, clientY: slot0Projected.y + 20 })
assert.equal(gameplay.selectedSlotIndex, 0)
assert.equal(gameplay.towers.length, 0, 'clicking empty slot must not place a tower until type chosen')
let slotHud = gameplay.getHudSnapshot()
assert.equal(slotHud.selectedSlotIndex, 0)
assert.equal(slotHud.selectedTower, null)

// Preview is non-committing, even when the player cannot afford the guardian.
const previewGold = gameplay.gold
const previewSelectedType = gameplay.selectedTowerTypeId
assert.equal(gameplay.previewTowerType('rapid'), true)
assert.equal(gameplay.previewTowerTypeId, 'rapid')
assert.equal(gameplay.gold, previewGold)
assert.equal(gameplay.towers.length, 0)
assert.equal(gameplay.selectedTowerTypeId, previewSelectedType)
gameplay.gold = 0
assert.equal(gameplay.previewTowerType('slow'), true)
gameplay.gold = previewGold
assert.equal(gameplay.previewTowerType('beacon'), false, 'locked guardians cannot be previewed')
assert.equal(gameplay.previewTowerTypeId, null)
gameplay.previewTowerType('slow')
gameplay.selectSlot(-1)
assert.equal(gameplay.previewTowerTypeId, null, 'deselect clears the ghost')
gameplay.selectSlot(0)
gameplay.previewTowerType('slow')
const normalRange = getTowerStats('slow', 1, null, 0, gameplay.buildSlots).range
assert.equal(gameplay.getTowerRange('slow'), normalRange, 'preview uses terrain and branch stats without permanent talents')
assert.equal(slotHud.selectedSlot.anchor.x, slot0Projected.x / gameStub.width)
assert.equal(slotHud.selectedSlot.anchor.y, slot0Projected.y / gameStub.height)
for (const viewport of [{ width: 1600, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  for (const anchor of [{ x: 0.07, y: 0.3 }, { x: 0.5, y: 0.5 }, { x: 0.92, y: 0.85 }]) {
    const menu = getBuildMenuPosition(anchor, viewport, { width: 336, height: 520 })
    const height = Math.min(520, menu.maxHeight)
    const ax = anchor.x * viewport.width, ay = anchor.y * viewport.height
    assert.ok(menu.left >= 0 && menu.left + 336 <= viewport.width)
    assert.ok(menu.top >= 0 && menu.top + height <= viewport.height)
    assert.ok(!(ax >= menu.left && ax <= menu.left + 336 && ay >= menu.top && ay <= menu.top + height), 'menu must leave its pit visible')
  }
}
console.log('✓ Placement preview preserves economy, uses effective range and keeps menus inside the viewport')

// Selecting tower type while empty slot is selected builds the tower on that slot
assert.equal(gameplay.selectTowerType('slow'), true)
assert.equal(gameplay.previewTowerTypeId, null, 'building clears the ghost')
assert.equal(gameplay.previewTowerType('rapid'), false, 'occupied slots cannot preview another guardian')
assert.equal(gameplay.towers.length, 1)
assert.equal(gameplay.towers[0].slotIndex, 0)
assert.equal(gameplay.towers[0].typeId, 'slow')
assert.equal(gameplay.gold, gameplay.stageConfig.startingGold - TOWER_DEFENSE_TOWER_TYPES.slow.cost)
assert.equal(gameplay.placeTower(0), false, 'occupied build slot must reject a second tower')

const projected = gameplay.renderer.project(gameplay.buildSlots[0])
assert.equal(gameplay.selectTowerAt(projected.x, projected.y)?.slotIndex, 0)
let selectedHud = gameplay.getHudSnapshot().selectedTower
assert.equal(selectedHud.level, 1)
assert.equal(selectedHud.typeId, 'slow')
const upgradeCost = selectedHud.upgradeCost
const levelTwoPreview = selectedHud.upgradePreview
assert.ok(levelTwoPreview?.dps > selectedHud.dps, 'upgrade preview exposes the next level before buying')
gameplay.gold = upgradeCost
assert.equal(gameplay.upgradeSelectedTower(), true)
assert.equal(gameplay.towers[0].level, 2)
selectedHud = gameplay.getHudSnapshot().selectedTower
for (const key of ['damage', 'range', 'fireInterval', 'attackSpeed', 'dps', 'effectText']) {
  assert.equal(selectedHud[key], levelTwoPreview[key], `Lv.2 preview must match purchased ${key}`)
}
assert.equal(selectedHud.upgradePreview, null, 'Lv.3 preview waits for a branch choice')
assert.equal(selectedHud.maxLevel, 4)
assert.equal(selectedHud.branchOptions.length, 2)
assert.equal(selectedHud.targetStrategies.length, 6)
assert.equal(gameplay.upgradeSelectedTower(), false, 'level three requires a specialization')
assert.equal(gameplay.selectTowerBranch('frost-field'), true)
assert.equal(gameplay.towers[0].branchId, 'frost-field')
assert.equal(gameplay.selectTowerBranch('ice-chain'), true, 'must allow changing branch preselection while at Lv.2')
assert.equal(gameplay.towers[0].branchId, 'ice-chain')
assert.equal(gameplay.setSelectedTowerStrategy('support'), true)
const branchPreview = gameplay.getHudSnapshot().selectedTower.upgradePreview
assert.match(branchPreview.effectText, /跳转/, 'preview follows the selected mutation')
gameplay.gold = selectedHud.upgradeCost
assert.equal(gameplay.upgradeSelectedTower(), true)
assert.equal(gameplay.selectTowerBranch('frost-field'), false, 'branch must be locked once upgraded to Lv.3')
selectedHud = gameplay.getHudSnapshot().selectedTower
assert.equal(selectedHud.level, 3)
assert.equal(selectedHud.branch.id, 'ice-chain')
assert.equal(selectedHud.targetStrategy.id, 'support')
for (const key of ['damage', 'range', 'fireInterval', 'attackSpeed', 'dps', 'effectText']) {
  assert.equal(selectedHud[key], branchPreview[key], `mutation preview must match purchased ${key}`)
}
assert.equal(gameplay._getTowerSnapshot({ ...gameplay.towers[0], level: 4 }).upgradePreview, null, 'max level has no upgrade preview')
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
gameplay.getTowerAtSlot(2).shinyTrait = null
const combatSlot = gameplay.buildSlots[2]
gameplay.enemies.push({
  id: 501,
  wave: 1,
  progress: 0,
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
assert.equal(gameplay.enemies.length, 1, 'a lethal projectile must leave its target alive while flying')
assert.equal(gameplay.enemies[0].hp, 6)
assert.equal(gameplay.kills, 0)
assert.equal(gameplay.gold, combatGold, 'kill rewards must wait for impact')
assert.equal(gameplay.shots.length, 1)
gameplay.updateWorld(0.21)
assert.equal(gameplay.enemies.length, 1, 'the enemy must remain visible until the projectile arrives')
gameplay.updateWorld(0.02)
assert.equal(gameplay.enemies.length, 0)
assert.equal(gameplay.kills, 1)
assert.equal(gameplay.gold, combatGold + 9)
assert.equal(gameplay.shots.length, 1)
assert.equal(gameplay.shots[0].impacted, true, 'lethal hits must leave an impact effect')
console.log('✓ Towers award damage and kill gold only when their projectiles arrive')

// Isolated projectile regressions: moving targets, burst timing, area effects and stale targets.
function projectileFixture(typeId = 'rapid', profile = { fireKind: 'single', damage: 10 }) {
  const combat = new TowerDefenseGameplay()
  const target = {
    id: 550, typeId: 'grunt', hp: 100, maxHp: 100, shield: 0, armor: 0,
    progress: 0.2, x: 0.2, y: 0.2, reward: 9, damage: 1, active: true,
  }
  combat.enemies = [target]
  combat._fireTower({ typeId, slotIndex: 0 }, target, profile)
  return { combat, target, shot: combat.shots[0] }
}

const moving = projectileFixture()
moving.target.x += 0.1
moving.combat._updateShots(0.1)
assert.deepEqual(moving.shot.to, { x: moving.target.x, y: moving.target.y })
assert.equal(moving.target.hp, 100)
moving.combat._updateShots(0.12)
assert.equal(moving.target.hp, 90)
const impactPoint = { ...moving.shot.to }
moving.target.x += 0.1
moving.combat._updateShots(0.05)
assert.deepEqual(moving.shot.to, impactPoint, 'impact effects stay at the hit location')
assert.equal(moving.target.hp, 90, 'each projectile applies its damage once')

const burst = projectileFixture('rapid', { fireKind: 'burst', damage: 10, burst: 3, burstScale: 0.5 })
assert.equal(burst.combat.shots.length, 3)
assert.equal(burst.target.hp, 100)
burst.combat._updateShots(0.26)
assert.equal(burst.target.hp, 90, 'only the leading burst round has arrived')
burst.combat._updateShots(0.03)
assert.equal(burst.target.hp, 85)
burst.combat._updateShots(0.03)
assert.equal(burst.target.hp, 80)

const frost = projectileFixture('slow', { fireKind: 'freeze', damage: 10, slowRatio: 0.5, slowDuration: 2, freezeDuration: 1 })
frost.target.frostStacks = 2
frost.combat._updateShots(0.21)
assert.equal(frost.target.slowTimer, undefined)
assert.equal(frost.target.freezeTimer, undefined)
frost.combat._updateShots(0.01)
assert.equal(frost.target.hp, 90)
assert.equal(frost.target.slowTimer, 2)
assert.equal(frost.target.freezeTimer, 1)

const blast = projectileFixture('blast', { fireKind: 'burn', damage: 20, splashRadius: 0.1, burnDamage: 8, burnDuration: 2 })
const bystander = { ...blast.target, id: 551, x: 0.4 }
blast.combat.enemies.push(bystander)
blast.target.x = 0.4
blast.combat._updateShots(0.27)
assert.equal(blast.target.hp, 100)
assert.equal(bystander.hp, 100)
assert.equal(blast.combat.burnZones.length, 0)
blast.combat._updateShots(0.01)
assert.equal(blast.target.hp, 80)
assert.equal(bystander.hp, 80, 'splash is centered on the actual impact location')
assert.equal(blast.combat.burnZones[0].x, 0.4)

const overkill = projectileFixture('rapid', { fireKind: 'single', damage: 1000 })
overkill.combat._fireTower({ typeId: 'rapid', slotIndex: 1 }, overkill.target, { fireKind: 'single', damage: 1000 })
const overkillGold = overkill.combat.gold
overkill.combat._updateShots(0.21)
assert.equal(overkill.target.active, true)
overkill.combat._updateShots(0.01)
assert.equal(overkill.combat.kills, 1)
assert.equal(overkill.combat.gold, overkillGold + 9, 'overlapping lethal shots never award duplicate kills')
overkill.combat._updateShots(1)
assert.equal(overkill.combat.shots.length, 0)
assert.equal(overkill.combat.kills, 1)

const lost = projectileFixture()
lost.target.active = false // Escaped or killed by a trap before arrival.
lost.combat.enemies = []
lost.combat._updateShots(1)
assert.equal(lost.target.hp, 100)
assert.equal(lost.combat.kills, 0)
assert.equal(lost.combat.shots.length, 0)

for (const kind of ['chain', 'chain_shock']) {
  const arc = projectileFixture('shock', { fireKind: kind, damage: 10, chainCount: 1, chainScale: 1 })
  assert.equal(arc.target.hp, 90, 'instant arcs deal damage when the visible connection appears')
  assert.equal(arc.shot.impacted, true)
  arc.combat._updateShots(1)
  assert.equal(arc.target.hp, 90)
}

const resetFlight = projectileFixture()
resetFlight.combat.reset()
resetFlight.combat._updateShots(1)
assert.equal(resetFlight.target.hp, 100, 'restarting discards unresolved projectiles')

for (const speed of [1, 2, 3]) {
  const run = projectileFixture()
  run.combat.game = gameStub
  run.combat.gameSpeed = speed
  run.combat.updateWorld(0.21 / speed)
  assert.equal(run.target.hp, 100)
  run.combat.updateWorld(0.02 / speed)
  assert.equal(run.target.hp, 90, 'impact timing follows simulation speed')
}
console.log('✓ Projectile travel, burst rounds, control effects, splash, overkill and speed share impact timing')

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
gameplay.director.loadWaves(TOWER_DEFENSE_WAVES)
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
assert.equal(gameplay.gold, gameplay.stageConfig.startingGold + 10)
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
gameplay.loadStage(31)
assert.equal(gameplay.unlockedSlots.has(0), true)
assert.equal(gameplay.unlockedSlots.has(8), false)
// Clear locked slot 8
const prevGold = gameplay.gold
assert.equal(gameplay.clearObstacle(8), true)
assert.equal(gameplay.unlockedSlots.has(8), true)
assert.equal(gameplay.gold, prevGold - gameplay.buildSlots[8].cost)

// Test Leyline stats resonance
const resonantStats = getTowerStats('rapid', 1, null, 0) // Slot 0 is acid leyline
const baseStats = getTowerStats('rapid', 1, null, null)
assert.ok(resonantStats.damage > baseStats.damage || resonantStats.fireInterval < baseStats.fireInterval)

// Test Slime Guardian Tactical Leap
// 守卫：以下用例依赖槽位 0/1 处于开放状态（压路槽位会被自动封印）
assert.equal(gameplay.buildSlots[0].locked, false, 'slot 0 must be unlocked for the leap test')
assert.equal(gameplay.buildSlots[1].locked, false, 'slot 1 must be unlocked for the leap test')
assert.equal(gameplay.placeTower(0, 'rapid'), true)
assert.equal(gameplay.relocateTower(0, 1), true)
assert.equal(gameplay.getTowerAtSlot(0), null)
assert.equal(gameplay.getTowerAtSlot(1)?.typeId, 'rapid')
assert.ok(gameplay.getTowerAtSlot(1)?.relocateCooldown > 0)

// Re-selecting a guardian only selects it; it no longer grants a combat bonus.
const reselectedPoint = gameplay.renderer.project(gameplay.buildSlots[1])
const selectedBefore = structuredClone(gameplay.getHudSnapshot().selectedTower)
const feedbackBefore = structuredClone(gameplay.feedback)
listeners.get('pointerdown')({ clientX: reselectedPoint.x + 10, clientY: reselectedPoint.y + 20 })
assert.equal(gameplay.selectedSlotIndex, 1)
assert.deepEqual(gameplay.getHudSnapshot().selectedTower, selectedBefore)
assert.deepEqual(gameplay.feedback, feedbackBefore)
assert.equal('moraleTimer' in gameplay.getTowerAtSlot(1), false)

// Test Tactical Traps Trigger
gameplay.loadStage(31)
gameplay.placeTower(1, 'rapid')
assert.equal(gameplay.triggerTrap('spore_shroom'), true)
assert.equal(gameplay.triggerTrap('spore_shroom'), false, 'trap on cooldown cannot trigger again')
assert.equal(gameplay.triggerTrap('slime_geyser'), true)
assert.equal(gameplay.triggerTrap('hive_crystal'), true)
assert.ok(gameplay.getTowerAtSlot(1)?.feverTimer > 0)
console.log('✓ Interactive battlefield elements and selection without petting bonuses verified')

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
