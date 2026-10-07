import { TowerDefenseGameplay } from './src/game/gameplay/tower-defense/TowerDefenseGameplay.js'
import { TOWER_DEFENSE_TOWER_TYPES, TOWER_UNLOCK_MAP, getTowerStats, getTowerDefensePathPosition } from './src/game/gameplay/tower-defense/TowerDefenseRules.js'

const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) })
export function createSimulation(stage, { width = 1280, height = 720 } = {}) {
  const gp = new TowerDefenseGameplay()
  gp.loadStage(stage)
  gp.skipTutorial()
  gp.attach({ width, height, ctx,
    canvas: { addEventListener() {}, removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width, height }) },
    sound: { shoot() {}, levelUp() {}, gameOver() {} }, _pushGameplayHud() {}, finishGameplay() {},
  })
  return gp
}

export function planFormation(gp, line) {
  const free = [...gp.unlockedSlots]
  const plan = []
  for (const [type, branch] of line) {
    if (!free.length || TOWER_UNLOCK_MAP[type] > gp.currentStageId) continue
    let best = -Infinity, slot = free[0]
    for (const i of free) {
      const stats = getTowerStats(type, 2, branch, i, gp.buildSlots)
      const pos = gp.buildSlots[i]
      let score = 0
      for (let n = 0; n < 100; n++) {
        const p = getTowerDefensePathPosition(n / 100, gp.stageConfig.path)
        const d = Math.hypot(p.x - pos.x, p.y - pos.y)
        if (d <= stats.range && d >= (stats.minRange || 0)) score += 1 + (1 - n / 100) * .3
      }
      if (stats.auraRadius) score += plan.filter(([j]) => Math.hypot(gp.buildSlots[j].x - pos.x, gp.buildSlots[j].y - pos.y) < stats.auraRadius).length * 12
      if (score > best) { best = score; slot = i }
    }
    free.splice(free.indexOf(slot), 1)
    plan.push([slot, type, branch])
  }
  return plan
}

export function standardLine(stage, variant = 0) {
  const rapid = ['rapid', variant ? 'sniper' : 'gatling']
  if (stage <= 2) return [rapid, ['slow', 'ice-chain'], rapid]
  return [rapid, ['blast', variant ? 'burn-zone' : 'heavy-shell'], ...(stage >= 63 ? [['beacon', 'expose']] : []), ['shock', 'overload'], ['slow', 'ice-chain'],
    ['spore', variant ? 'bloom' : 'solvent'], ['radiant', 'sanctuary'], ['arcane', 'void-rift'], ['ballista', 'skewer'], ['thorn', 'bramble']]
    .filter(([type]) => TOWER_UNLOCK_MAP[type] <= stage).slice(0, 8)
}

export function simulate(stage, { line = standardLine(stage), plan: suppliedPlan, traps = false, deployAfterWaves = [], viewport,
  actionInterval = .5, maxActionsPerTurn = Infinity, resizeAt = [], configure, stopAfterWave } = {}) {
  const gp = createSimulation(stage, viewport)
  configure?.(gp)
  const plan = suppliedPlan || planFormation(gp, line)
  let maxTowers = 0
  const reports = []
  const waveStarts = []
  let lastWave = 0, lastStarted = -1, nextAction = 0, resizeIndex = 0
  for (let tick = 0; tick < 18000 && gp.state !== 'finished'; tick++) {
    while (resizeIndex < resizeAt.length && gp.elapsedTime >= resizeAt[resizeIndex].seconds) {
      const { width, height } = resizeAt[resizeIndex++]
      Object.assign(gp.game, { width, height })
      gp.renderer.ensureLayout()
    }
    if (tick * .05 + 1e-8 >= nextAction) {
      nextAction += actionInterval
      let actions = 0
      // Deploy broad coverage first, then alternate upgrades across the line.
      for (const [index, [slot, type]] of plan.entries()) {
        if (actions < maxActionsPerTurn && gp.director.completedWaves >= (deployAfterWaves[index] || 0)
          && !gp.getTowerAtSlot(slot) && gp.placeTower(slot, type)) actions++
      }
      for (const [slot, , branch] of plan) {
        const tower = gp.getTowerAtSlot(slot)
        if (!tower || actions >= maxActionsPerTurn) continue
        gp.selectedSlotIndex = slot
        if (tower.level === 2 && !tower.branchId
          && gp.selectTowerBranch(branch || Object.keys(TOWER_DEFENSE_TOWER_TYPES[tower.typeId].branches)[0])) actions++
        if (actions < maxActionsPerTurn && gp.upgradeSelectedTower()) actions++
      }
      if (traps && gp.enemies.length >= 5) for (const trap of gp.traps) {
        if (actions < maxActionsPerTurn && gp.triggerTrap(trap.id)) actions++
      }
    }
    gp.updateWorld(.05)
    if (gp.director.waveIndex !== lastStarted) {
      lastStarted = gp.director.waveIndex
      waveStarts.push({ wave: lastStarted + 1, hp: gp.baseHp, gold: gp.gold, seconds: gp.elapsedTime,
        levels: gp.towers.map(t => t.level) })
    }
    maxTowers = Math.max(maxTowers, gp.towers.length)
    if (gp.director.completedWaves !== lastWave) {
      lastWave = gp.director.completedWaves
      reports.push({ wave: lastWave, hp: gp.baseHp, gold: gp.gold, kills: gp.kills, seconds: gp.elapsedTime, levels: gp.towers.map(t => t.level) })
      if (stopAfterWave && lastWave >= stopAfterWave) break
    }
  }
  const result = { stage, outcome: gp.outcome, hp: gp.baseHp, gold: gp.gold, kills: gp.kills, seconds: gp.elapsedTime,
    waves: gp.director.completedWaves, maxTowers, spawned: gp.director.spawned,
    survivors: gp.enemies.map(e => ({type:e.typeId, hp:Math.round(e.hp), progress:e.progress})), plan, reports, waveStarts }
  gp.destroy()
  return result
}
