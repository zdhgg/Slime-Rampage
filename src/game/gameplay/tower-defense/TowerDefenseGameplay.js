import { GameplayController } from '../GameplayController.js'
import { TowerDefenseDirector } from './TowerDefenseDirector.js'
import { TowerDefenseRenderer } from './TowerDefenseRenderer.js'
import {
  CHAPTERS_META,
  GENE_TREE_NODES,
  getStageConfig,
} from './TowerDefenseCampaignRules.js'
import {
  getActiveGeneEffects,
  loadCampaignSave,
  recordStageClear,
  completeTutorial,
} from './TowerDefenseSave.js'
import {
  TOWER_DEFENSE_BASE_HP,
  TOWER_DEFENSE_BUILD_SLOTS,
  TOWER_DEFENSE_ENEMY_TYPES,
  TOWER_DEFENSE_LEYLINE_TYPES,
  TOWER_DEFENSE_SLOT_LEYLINES,
  TOWER_DEFENSE_STARTING_GOLD,
  TOWER_DEFENSE_TARGET_STRATEGIES,
  TOWER_DEFENSE_TOWER_TYPES,
  TOWER_DEFENSE_TRAPS,
  TOWER_DEFENSE_WAVE_COUNT,
  TOWER_DEFENSE_WAVES,
  TOWER_UNLOCK_MAP,
  SLIME_SHINY_TRAITS,
  TOWER_DEFENSE_MUTATIONS,
  getRandomMutationChoices,
  isTowerUnlocked,
  getEnemyType,
  getSlotLeylineResonance,
  getTowerBranchOptions,
  getTowerDefensePathPosition,
  getTowerSellValue,
  getTowerStats,
  getTowerUpgradeCost,
  getWaveBaseDamage,
  getWaveComposition,
} from './TowerDefenseRules.js'

const TOWER_TYPE_LIST = Object.values(TOWER_DEFENSE_TOWER_TYPES)
const TARGET_STRATEGY_IDS = new Set(TOWER_DEFENSE_TARGET_STRATEGIES.map(({ id }) => id))
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const distanceSquared = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2

export class TowerDefenseGameplay extends GameplayController {
  constructor() {
    super('tower-defense')
    this.currentStageId = 1
    this.stageConfig = getStageConfig(1)
    this.geneEffects = getActiveGeneEffects()
    this.buildSlots = this.stageConfig.buildSlots
    this.director = new TowerDefenseDirector(this.stageConfig.waves)
    this.renderer = new TowerDefenseRenderer(this)
    this.enemies = []
    this.towers = []
    this.shots = []
    this.burnZones = []
    this.unlockedSlots = new Set(this.buildSlots.map((s, idx) => (!s.locked ? idx : -1)).filter((idx) => idx >= 0))
    this.traps = this.stageConfig.traps.map((t) => {
      const base = TOWER_DEFENSE_TRAPS.find((dt) => dt.id === t.id) || t
      return {
        ...base,
        ...t,
        cooldown: base.cooldown * (this.geneEffects.trapCooldownMultiplier || 1),
        cooldownTimer: 0,
      }
    })
    this.trapEvents = []
    this.clearResult = null
    this.activeMutations = []
    this.pendingMutationChoices = null
    this.saveUnlockedTowers = new Set(['rapid', 'slow'])

    this.state = 'active'
    this.outcome = null
    this.elapsedTime = 0
    this.baseHp = this.stageConfig.baseHp || TOWER_DEFENSE_BASE_HP
    this.maxBaseHp = this.stageConfig.baseHp || TOWER_DEFENSE_BASE_HP
    this.gold = (this.stageConfig.startingGold || TOWER_DEFENSE_STARTING_GOLD) + (this.geneEffects.startingGoldBonus || 0)
    this.kills = 0
    this.score = 0
    this.towersBuilt = 0
    this.upgrades = 0
    this.selectedTowerTypeId = 'rapid'
    this.selectedSlotIndex = -1
    this.hoveredSlotIndex = -1
    this.hoveredTrapId = null
    this.feedback = null
    this.feedbackTimer = 0
    this._nextSpecialEnemyId = 100000
    this._finishSent = false
    this._canvas = null
    this._onPointerDown = (event) => this._handlePointerDown(event)
    this._onPointerMove = (event) => this._handlePointerMove(event)
  }

  attach(game) {
    if (this._canvas) this._unbindCanvas()
    super.attach(game)
    this._canvas = game?.canvas || null
    this._canvas?.addEventListener?.('pointerdown', this._onPointerDown)
    this._canvas?.addEventListener?.('pointermove', this._onPointerMove)
    this.renderer.ensureLayout()
  }

  usesArenaFramePipeline() {
    return false
  }

  loadStage(stageId = 1) {
    const save = loadCampaignSave()
    this.currentStageId = Math.max(1, Math.min(99, Number(stageId) || 1))
    this.stageConfig = getStageConfig(this.currentStageId)
    this.geneEffects = getActiveGeneEffects(save)
    this.saveUnlockedTowers = new Set(save.unlockedTowers || ['rapid', 'slow'])
    this.tutorial = {
      active: this.currentStageId === 1 && !save.tutorialCompleted,
      step: 1,
    }
    this.director.loadWaves(this.stageConfig.waves)
    this.buildSlots = this.stageConfig.buildSlots
    this.unlockedSlots = new Set(this.buildSlots.map((s, idx) => (!s.locked ? idx : -1)).filter((idx) => idx >= 0))
    this.traps = this.stageConfig.traps.map((t) => {
      const base = TOWER_DEFENSE_TRAPS.find((dt) => dt.id === t.id) || t
      return {
        ...base,
        ...t,
        cooldown: base.cooldown * (this.geneEffects.trapCooldownMultiplier || 1),
        cooldownTimer: 0,
      }
    })
    this.enemies.length = 0
    this.towers.length = 0
    this.shots.length = 0
    this.burnZones.length = 0
    this.trapEvents.length = 0
    this.activeMutations = []
    this.pendingMutationChoices = null
    this.state = 'active'
    this.outcome = null
    this.clearResult = null
    this.elapsedTime = 0
    this.baseHp = this.stageConfig.baseHp || TOWER_DEFENSE_BASE_HP
    this.maxBaseHp = this.stageConfig.baseHp || TOWER_DEFENSE_BASE_HP
    this.gold = (this.stageConfig.startingGold || TOWER_DEFENSE_STARTING_GOLD) + (this.geneEffects.startingGoldBonus || 0)
    this.kills = 0
    this.score = 0
    this.towersBuilt = 0
    this.upgrades = 0
    this.selectedTowerTypeId = 'rapid'
    this.selectedSlotIndex = -1
    this.hoveredSlotIndex = -1
    this.hoveredTrapId = null
    this.feedback = null
    this.feedbackTimer = 0
    this._nextSpecialEnemyId = 100000
    this._finishSent = false
    this.renderer?.ensureLayout?.()
    this._pushHud()
    return this
  }

  reset() {
    return this.loadStage(this.currentStageId || 1)
  }

  restart() {
    return this.loadStage(this.currentStageId || 1)
  }

  advanceTutorial() {
    if (!this.tutorial || !this.tutorial.active) return
    this.tutorial.step++
    if (this.tutorial.step > 4) {
      this.tutorial.active = false
      completeTutorial()
    }
    this._pushHud()
  }

  skipTutorial() {
    if (!this.tutorial) return
    this.tutorial.active = false
    completeTutorial()
    this._pushHud()
  }

  getTowerAtSlot(slotIndex) {
    return this.towers.find((tower) => tower.slotIndex === slotIndex) || null
  }

  clearObstacle(slotIndex) {
    const index = Number(slotIndex)
    const slot = (this.buildSlots || TOWER_DEFENSE_BUILD_SLOTS)[index]
    if (!slot || !slot.locked || this.unlockedSlots.has(index)) return false
    const cost = slot.cost || 40
    if (this.gold < cost) return this._reject(`养分不足，开垦需要 ${cost} 养分`)
    this.gold -= cost
    this.unlockedSlots.add(index)
    const reward = slot.reward || 60
    this.gold += reward
    this.selectedSlotIndex = index
    this._feedback(`开垦完成！获得 ${reward} 养分奖励，超导高台已解锁！`, 'success')
    this._pushHud()
    return true
  }

  triggerTrap(trapId) {
    const trap = this.traps.find((t) => t.id === trapId)
    if (!trap || trap.cooldownTimer > 0) return false
    trap.cooldownTimer = trap.cooldown
    if (this.tutorial?.active && this.tutorial.step === 2) {
      this.tutorial.step = 3
    }

    if (trap.id === 'spore_shroom') {
      const radiusSq = trap.radius ** 2
      let hitCount = 0
      for (const enemy of this.enemies) {
        if (!enemy.active || distanceSquared(enemy, trap.targetPos) > radiusSq) continue
        this._applyDamage(enemy, trap.damage, { damageType: 'poison' })
        this._applySlow(enemy, { slowRatio: trap.slowRatio, slowDuration: trap.duration })
        hitCount++
      }
      this.trapEvents.push({ type: 'spore', pos: trap.targetPos, life: 0.8, maxLife: 0.8 })
      this._feedback(`毒孢子大蘑菇引爆！腐蚀毒雾覆盖 ${hitCount} 名敌人！`, 'success')
    } else if (trap.id === 'slime_geyser') {
      const radiusSq = trap.radius ** 2
      let hitCount = 0
      for (const enemy of this.enemies) {
        if (!enemy.active || distanceSquared(enemy, trap.targetPos) > radiusSq) continue
        enemy.freezeTimer = Math.max(enemy.freezeTimer || 0, trap.stunDuration)
        this._applyDamage(enemy, trap.damage)
        hitCount++
      }
      this.trapEvents.push({ type: 'geyser', pos: trap.targetPos, life: 0.7, maxLife: 0.7 })
      this._feedback(`黏液泉爆发！${hitCount} 名敌军被牢牢定身！`, 'success')
    } else if (trap.id === 'hive_crystal') {
      for (const tower of this.towers) {
        tower.feverTimer = trap.overdriveDuration
      }
      this.trapEvents.push({ type: 'crystal', pos: trap.pos, life: 0.9, maxLife: 0.9 })
      this._feedback('母巢超载共鸣激活！全场史莱姆守卫进入 5 秒暴走狂热！', 'warning')
    }
    this._pushHud()
    return true
  }

  relocateTower(fromSlot, toSlot) {
    const fromIndex = Number(fromSlot)
    const toIndex = Number(toSlot)
    const tower = this.getTowerAtSlot(fromIndex)
    if (!tower) return this._reject('未找到要调度的史莱姆')
    const slots = this.buildSlots || TOWER_DEFENSE_BUILD_SLOTS
    if (!slots[toIndex] || !this.unlockedSlots.has(toIndex)) return this._reject('目标槽位不可用')
    if (this.getTowerAtSlot(toIndex)) return this._reject('目标槽位已被占用')
    if ((tower.relocateCooldown || 0) > 0) return this._reject(`弹跳调度冷却中（${Math.ceil(tower.relocateCooldown)}s）`)

    const fromPos = slots[fromIndex]
    const toPos = slots[toIndex]
    tower.slotIndex = toIndex
    tower.relocateCooldown = 8.0
    tower.leapAnim = { from: fromPos, to: toPos, progress: 0, duration: 0.35 }
    this.selectedSlotIndex = toIndex
    this._feedback(`${TOWER_DEFENSE_TOWER_TYPES[tower.typeId].name}弹跳换位成功！`, 'success')
    this._pushHud()
    return true
  }

  petTower(slotIndex) {
    const tower = this.getTowerAtSlot(slotIndex)
    if (!tower) return false
    tower.moraleTimer = 4.0
    tower.heartAnim = 0.8
    this._feedback(`史莱姆感受到了母巢的鼓励！心情大好，攻速提升！`, 'success')
    this._pushHud()
    return true
  }

  selectTowerType(typeId) {
    if (!TOWER_DEFENSE_TOWER_TYPES[typeId]) return this._reject('未知的防御塔类型')
    this.selectedTowerTypeId = typeId
    if (this.selectedSlotIndex >= 0 && !this.getTowerAtSlot(this.selectedSlotIndex)) {
      return this.placeTower(this.selectedSlotIndex, typeId)
    }
    this._pushHud()
    return true
  }

  selectSlot(slotIndex) {
    const index = Number(slotIndex)
    const slots = this.buildSlots || TOWER_DEFENSE_BUILD_SLOTS
    if (Number.isInteger(index) && slots[index]) {
      this.selectedSlotIndex = index
    } else {
      this.selectedSlotIndex = -1
    }
    this._pushHud()
    return this.selectedSlotIndex >= 0
  }

  placeTower(slotIndex, towerTypeId = this.selectedTowerTypeId) {
    const index = Number(slotIndex)
    const type = TOWER_DEFENSE_TOWER_TYPES[towerTypeId]
    const slots = this.buildSlots || TOWER_DEFENSE_BUILD_SLOTS
    if (this.state !== 'active' || !Number.isInteger(index) || !slots[index]) return false
    if (!this.unlockedSlots.has(index)) return this._reject('该槽位已被封印阻挡，请先开垦清理')
    if (!type) return this._reject('未知的防御塔类型')
    if (!isTowerUnlocked(type.id, this.currentStageId, this.saveUnlockedTowers)) {
      const req = TOWER_UNLOCK_MAP[type.id] || 1
      return this._reject(`${type.name}需在第 ${req} 关解锁`)
    }
    if (this.getTowerAtSlot(index)) return this._reject('该部署位已被占用')
    if (this.gold < type.cost) return this._reject(`资源不足，还需 ${type.cost - this.gold}`)

    this.gold -= type.cost
    this.selectedTowerTypeId = type.id
    this.selectedSlotIndex = index
    // 20% Chance to roll Shiny Slime Trait (开盲盒)
    let shinyTrait = null
    if (Math.random() < 0.20) {
      const traitKeys = Object.keys(SLIME_SHINY_TRAITS)
      const rolledKey = traitKeys[Math.floor(Math.random() * traitKeys.length)]
      shinyTrait = SLIME_SHINY_TRAITS[rolledKey]
    }

    this.towers.push({
      slotIndex: index,
      typeId: type.id,
      level: 1,
      branchId: null,
      targetStrategy: type.targeting || 'first',
      cooldown: 0,
      feverTimer: 0,
      moraleTimer: 0,
      relocateCooldown: 0,
      leapAnim: null,
      heartAnim: 0,
      shinyTrait,
    })
    this.towersBuilt++
    if (this.tutorial?.active && this.tutorial.step === 1) {
      this.tutorial.step = 2
    }
    const resonance = getSlotLeylineResonance(index, type.id)
    if (resonance.isResonant) {
      this._feedback(`${type.name}召唤完成！激活【${resonance.leylineName}】共鸣！`, 'success')
    } else {
      this._feedback(`${type.name}召唤完成`, 'success')
    }
    this._pushHud()
    return true
  }

  selectTowerAt(x, y) {
    const slotIndex = this.renderer.getSlotIndexAt(Number(x), Number(y), true)
    this.selectedSlotIndex = slotIndex
    this._pushHud()
    return slotIndex >= 0 ? this.getTowerAtSlot(slotIndex) : null
  }

  setSelectedTowerStrategy(strategyId) {
    const tower = this.getTowerAtSlot(this.selectedSlotIndex)
    if (!tower || !TARGET_STRATEGY_IDS.has(strategyId)) return false
    tower.targetStrategy = strategyId
    const strategy = TOWER_DEFENSE_TARGET_STRATEGIES.find(({ id }) => id === strategyId)
    this._feedback(`索敌切换为${strategy?.name || strategyId}`, 'info')
    this._pushHud()
    return true
  }

  selectTowerBranch(branchId) {
    const tower = this.getTowerAtSlot(this.selectedSlotIndex)
    const type = tower ? TOWER_DEFENSE_TOWER_TYPES[tower.typeId] : null
    if (!tower || tower.level !== 2 || !type?.branches[branchId]) return false
    tower.branchId = branchId
    this._feedback(`已预选${type.branches[branchId].name}`, 'info')
    this._pushHud()
    return true
  }


  selectMutation(mutationId) {
    const mutation = TOWER_DEFENSE_MUTATIONS.find((m) => m.id === mutationId)
    if (!mutation) return false
    this.activeMutations.push(mutation)
    this.pendingMutationChoices = null
    this.game?.sound?.levelUp?.()
    this._feedback(`🧬 基因突变觉醒：【${mutation.name}】！`, 'success')
    this._pushHud()
    return true
  }

  hasMutation(mutationId) {
    if (!this.activeMutations) return false
    return this.activeMutations.some((m) => m.id === mutationId || m === mutationId)
  }

  upgradeSelectedTower() {
    const tower = this.getTowerAtSlot(this.selectedSlotIndex)
    const cost = getTowerUpgradeCost(tower)
    if (this.state !== 'active' || !tower || cost === null) return false
    if (tower.level === 2 && !tower.branchId) return this._reject('请先选择一个 Lv.3 突变方向')
    if (this.gold < cost) return this._reject(`资源不足，还需 ${cost - this.gold}`)
    this.gold -= cost
    tower.level++
    tower.cooldown = Math.min(tower.cooldown, getTowerStats(tower.typeId, tower.level, tower.branchId).fireInterval)
    this.upgrades++
    this.game?.sound?.levelUp?.()
    this._feedback(`${TOWER_DEFENSE_TOWER_TYPES[tower.typeId].name}进化至 Lv.${tower.level}`, 'success')
    this._pushHud()
    return true
  }

  sellSelectedTower() {
    const tower = this.getTowerAtSlot(this.selectedSlotIndex)
    if (this.state !== 'active' || !tower) return false
    const value = getTowerSellValue(tower)
    this.gold += value
    this.towers.splice(this.towers.indexOf(tower), 1)
    this.selectedSlotIndex = -1
    this._feedback(`史莱姆已放生遣散，返还 ${value} 养分`, 'info')
    this._pushHud()
    return true
  }

  updateWorld(dt) {
    if (!this.game || this.state === 'finished' || !Number.isFinite(dt) || dt <= 0) return
    if (this.pendingMutationChoices && this.pendingMutationChoices.length > 0) return

    const step = Math.min(dt, 0.25)
    this.elapsedTime += step
    this.feedbackTimer = Math.max(0, this.feedbackTimer - step)
    if (this.feedbackTimer === 0) this.feedback = null

    for (const trap of this.traps) {
      trap.cooldownTimer = Math.max(0, trap.cooldownTimer - step)
    }
    for (const event of this.trapEvents) {
      event.life -= step
    }
    this.trapEvents = this.trapEvents.filter((e) => e.life > 0)

    const events = this.director.update(step, this.enemies.length)
    for (const enemy of events.spawns) this._addEnemy(enemy)
    if (events.waveStarted) this._feedback(`第 ${events.waveStarted} 波抵达`, 'warning')
    if (events.waveCompleted) {
      const wave = (this.director.waves || TOWER_DEFENSE_WAVES)[events.waveCompleted - 1]
      let bonus = wave?.reward ?? 15 + events.waveCompleted * 3
      if (this.hasMutation('nutrient_harvest')) {
        bonus = Math.round(bonus * 1.25)
      }
      this.gold += bonus
      this.score += bonus * 5
      this._feedback(`波次清除，整备奖励 ${bonus}`, 'success')

      // Roguelike Mutation 3-Choice Prompt (Trigger on wave clears before the final victory wave)
      const totalWaves = this.director.waves?.length || 5
      if (events.waveCompleted < totalWaves) {
        const unlockedList = Array.from(this.saveUnlockedTowers || ['rapid', 'slow'])
        const choices = getRandomMutationChoices(3, this.activeMutations, unlockedList)
        if (choices.length > 0) {
          this.pendingMutationChoices = choices
          this._pushHud()
        }
      }
    }

    this._updateEnemies(step)
    if (this.state === 'finished') return
    this._updateBurnZones(step)
    this._updateTowers(step)
    this._removeDefeatedEnemies()
    this._updateShots(step)

    if ((events.allCompleted || this.director.phase === 'complete') && this.enemies.length === 0 && this.state !== 'finished') this._finish('victory')
  }

  _addEnemy(enemy) {
    const point = getTowerDefensePathPosition(enemy.progress || 0)
    enemy.x = point.x
    enemy.y = point.y
    this.enemies.push(enemy)
  }

  _updateEnemies(dt) {
    for (const enemy of this.enemies) {
      if (!enemy.active) continue
      enemy.slowTimer = Math.max(0, (enemy.slowTimer || 0) - dt)
      enemy.freezeTimer = Math.max(0, (enemy.freezeTimer || 0) - dt)
      enemy.frostStackTimer = Math.max(0, (enemy.frostStackTimer || 0) - dt)
      enemy.speedBoostTimer = Math.max(0, (enemy.speedBoostTimer || 0) - dt)
      enemy.hitFlash = Math.max(0, (enemy.hitFlash || 0) - dt * 7)
      enemy.shieldFlash = Math.max(0, (enemy.shieldFlash || 0) - dt * 5)
      enemy.supportFlash = Math.max(0, (enemy.supportFlash || 0) - dt * 3)
      if (enemy.frostStackTimer === 0) enemy.frostStacks = 0

      if ((enemy.supportRadius || 0) > 0) this._updateSupportEnemy(enemy, dt)
      if (!enemy.active) continue

      const resistedSlow = (enemy.slowRatio || 0) * (1 - clamp(enemy.slowResistance || 0, 0, 0.9))
      const slowSpeed = enemy.slowTimer > 0 ? 1 - resistedSlow : 1
      const boostSpeed = enemy.speedBoostTimer > 0 ? 1.18 : 1
      const freezeSpeed = enemy.freezeTimer > 0 ? 0 : 1
      const moveStep = (enemy.baseSpeed ?? enemy.speed ?? 0) * slowSpeed * boostSpeed * freezeSpeed * dt
      enemy.progress += moveStep
      enemy.walkTime = (enemy.walkTime || 0) + moveStep * 45
      const point = getTowerDefensePathPosition(enemy.progress)
      enemy.x = point.x
      enemy.y = point.y
      enemy.facing = point.facing
      if (enemy.progress < 1) continue

      enemy.active = false
      this.baseHp = Math.max(0, this.baseHp - (enemy.damage || 1))
      if (this.baseHp <= 0) {
        this._removeDefeatedEnemies()
        this._finish('defeat')
        return
      }
    }
    this._removeDefeatedEnemies()
  }

  _updateSupportEnemy(support, dt) {
    support.supportTimer = (support.supportTimer ?? 1.2) - dt
    if (support.supportTimer > 0) return
    support.supportTimer += 1.6
    const radiusSquared = support.supportRadius ** 2
    let affected = 0
    for (const ally of this.enemies) {
      if (!ally.active || ally === support || distanceSquared(ally, support) > radiusSquared) continue
      const heal = Math.min(support.supportHeal || 0, Math.max(0, ally.maxHp - ally.hp))
      ally.hp += heal
      ally.speedBoostTimer = Math.max(ally.speedBoostTimer || 0, 1.25)
      ally.supportFlash = 0.5
      if (heal > 0 || ally.speedBoostTimer > 0) affected++
    }
    if (affected > 0) support.supportFlash = 0.6
  }

  _updateBurnZones(dt) {
    for (const zone of this.burnZones) {
      zone.life -= dt
      zone.tick -= dt
      while (zone.tick <= 0 && zone.life > 0) {
        zone.tick += 0.5
        const radiusSquared = zone.radius ** 2
        for (const enemy of this.enemies) {
          if (!enemy.active || distanceSquared(enemy, zone) > radiusSquared) continue
          this._applyDamage(enemy, zone.damage * 0.5, { damageType: 'burn', armorPierce: 0.65 })
        }
      }
    }
    this.burnZones = this.burnZones.filter(({ life }) => life > 0)
  }

  _updateTowers(dt) {
    for (const tower of this.towers) {
      const stats = getTowerStats(tower.typeId, tower.level, tower.branchId, tower.slotIndex)
      let fireInterval = stats.fireInterval
      if (tower.feverTimer > 0) {
        tower.feverTimer = Math.max(0, tower.feverTimer - dt)
        fireInterval *= 0.62
      }
      if (tower.moraleTimer > 0) {
        tower.moraleTimer = Math.max(0, tower.moraleTimer - dt)
        fireInterval *= 0.85
      }
      if (tower.relocateCooldown > 0) {
        tower.relocateCooldown = Math.max(0, tower.relocateCooldown - dt)
      }
      if (tower.leapAnim) {
        tower.leapAnim.progress += dt / tower.leapAnim.duration
        if (tower.leapAnim.progress >= 1) tower.leapAnim = null
      }
      if (tower.heartAnim > 0) {
        tower.heartAnim = Math.max(0, tower.heartAnim - dt)
      }

      tower.cooldown -= dt
      tower.recoil = Math.max(0, (tower.recoil || 0) - dt * 6)
      tower.pulseTime = (tower.pulseTime || 0) + dt

      const target = this._findTarget(tower, stats.range)
      if (target) {
        const slot = (this.buildSlots || TOWER_DEFENSE_BUILD_SLOTS)[tower.slotIndex]
        const targetAngle = Math.atan2(target.y - slot.y, target.x - slot.x)
        if (tower.aimAngle == null) tower.aimAngle = targetAngle
        else {
          let diff = targetAngle - tower.aimAngle
          while (diff < -Math.PI) diff += Math.PI * 2
          while (diff > Math.PI) diff -= Math.PI * 2
          tower.aimAngle += diff * Math.min(1, dt * 14)
        }
      }

      let catchUp = 0
      while (tower.cooldown <= 0 && catchUp < 4) {
        if (!target) {
          tower.cooldown = 0
          break
        }
        this._fireTower(tower, target, stats)
        tower.recoil = 1
        tower.cooldown += fireInterval
        catchUp++
      }
    }
  }

  _findTarget(tower, range) {
    const slot = (this.buildSlots || TOWER_DEFENSE_BUILD_SLOTS)[tower.slotIndex]
    const rangeSquared = range * range
    const strategy = tower.targetStrategy || 'first'
    let target = null
    let bestScore = -Infinity
    for (const enemy of this.enemies) {
      if (!enemy.active || distanceSquared(enemy, slot) > rangeSquared) continue
      const health = Math.max(0, enemy.hp || 0) + Math.max(0, enemy.shield || 0)
      let score
      if (strategy === 'last') score = -enemy.progress
      else if (strategy === 'strong') score = health
      else if (strategy === 'weak') score = -health
      else if (strategy === 'support') score = (enemy.typeId === 'support' ? 10 : 0) + enemy.progress
      else if (strategy === 'boss') score = (enemy.boss ? 10 : 0) + enemy.progress
      else score = enemy.progress

      if (
        score > bestScore
        || (score === bestScore && (!target || enemy.progress > target.progress))
        || (score === bestScore && target && enemy.progress === target.progress && enemy.id < target.id)
      ) {
        target = enemy
        bestScore = score
      }
    }
    return target
  }

  _fireTower(tower, target, profile) {
    const type = TOWER_DEFENSE_TOWER_TYPES[tower.typeId]
    const source = (this.buildSlots || TOWER_DEFENSE_BUILD_SLOTS)[tower.slotIndex]
    const isSniper = tower.branchId === 'sniper'
    const isBurst = profile.fireKind === 'burst'
    const isBlast = ['splash', 'burn'].includes(profile.fireKind)
    const duration = isSniper ? 0.18 : isBlast ? 0.28 : isBurst ? 0.26 : 0.22

    const baseShot = {
      from: source,
      to: { x: target.x, y: target.y },
      towerTypeId: tower.typeId,
      branchId: tower.branchId,
      color: type.color,
      kind: profile.fireKind,
      blast: isBlast,
      burstCount: isBurst ? (profile.burst || 3) : 1,
      radius: profile.splashRadius || 0,
      life: duration,
      maxLife: duration,
    }
    this.shots.push(baseShot)

    if (profile.fireKind === 'splash' || profile.fireKind === 'burn') {
      this._damageArea(target, profile)
      if (profile.fireKind === 'burn') {
        this.burnZones.push({
          x: target.x,
          y: target.y,
          radius: profile.splashRadius,
          damage: profile.burnDamage,
          life: profile.burnDuration,
          maxLife: profile.burnDuration,
          tick: 0,
        })
      }
    } else if (profile.fireKind === 'burst') {
      const count = profile.burst || 1
      for (let index = 0; index < count; index++) {
        this._applyDamage(target, profile.damage * (index === 0 ? 1 : profile.burstScale || 1), profile)
        if (!target.active) break
      }
    } else if (profile.fireKind === 'chain' || profile.fireKind === 'chain_shock') {
      this._fireChain(target, profile)
    } else if (profile.fireKind === 'vortex') {
      this._damageArea(target, profile)
      this._applyVortexPull(target, profile)
    } else if (profile.fireKind === 'nova') {
      this._damageArea(target, profile)
      this._applyNovaStun(target, profile)
    } else {
      this._applyDamage(target, profile.damage, profile)
      if (target.active && ['slow', 'freeze'].includes(profile.fireKind)) this._applySlow(target, profile)
    }

    this.game?.sound?.shoot?.(baseShot.blast ? 'heavy' : 'spark', 0.35)
  }

  _applyVortexPull(center, profile) {
    const pullRadiusSq = (profile.splashRadius || 0.14) ** 2
    const pullForce = profile.pullForce || 0.06
    for (const enemy of this.enemies) {
      if (!enemy.active || distanceSquared(enemy, center) > pullRadiusSq) continue
      enemy.progress = Math.max(0, enemy.progress - pullForce * 0.015)
      enemy.slowTimer = Math.max(enemy.slowTimer || 0, 0.4)
      enemy.slowRatio = Math.max(enemy.slowRatio || 0, 0.35)
    }
  }

  _applyNovaStun(center, profile) {
    const stunRadiusSq = (profile.splashRadius || 0.28) ** 2
    for (const enemy of this.enemies) {
      if (!enemy.active || distanceSquared(enemy, center) > stunRadiusSq) continue
      enemy.freezeTimer = Math.max(enemy.freezeTimer || 0, profile.stunDuration || 0.6)
    }
  }

  _damageArea(center, profile) {
    const radiusSquared = profile.splashRadius ** 2
    for (const enemy of this.enemies) {
      if (!enemy.active || distanceSquared(enemy, center) > radiusSquared) continue
      this._applyDamage(enemy, profile.damage, profile)
    }
  }

  _fireChain(target, profile) {
    const visited = new Set()
    let current = target
    for (let jump = 0; current && jump < (profile.chainCount || 1); jump++) {
      visited.add(current.id)
      this._applyDamage(current, profile.damage * (profile.chainScale ** jump), profile)
      if (current.active) this._applySlow(current, profile)
      if (jump + 1 >= profile.chainCount) break
      let next = null
      let closest = Infinity
      for (const enemy of this.enemies) {
        if (!enemy.active || visited.has(enemy.id)) continue
        const distance = distanceSquared(enemy, current)
        if (distance <= profile.chainRange ** 2 && distance < closest) {
          closest = distance
          next = enemy
        }
      }
      if (next) {
        this.shots.push({
          from: { x: current.x, y: current.y },
          to: { x: next.x, y: next.y },
          color: '#a9e9ff',
          kind: 'chain',
          blast: false,
          life: 0.16,
          maxLife: 0.16,
        })
      }
      current = next
    }
  }

  _applySlow(enemy, profile) {
    enemy.slowRatio = Math.max(enemy.slowRatio || 0, profile.slowRatio || 0)
    enemy.slowTimer = Math.max(enemy.slowTimer || 0, profile.slowDuration || 0)
    if (profile.fireKind !== 'freeze') return
    enemy.frostStacks = (enemy.frostStacks || 0) + 1
    enemy.frostStackTimer = 2.8
    if (enemy.frostStacks >= 3) {
      enemy.freezeTimer = Math.max(enemy.freezeTimer || 0, (profile.freezeDuration || 0) * (1 - clamp(enemy.slowResistance || 0, 0, 0.8)))
      enemy.frostStacks = 0
    }
  }

  _applyDamage(enemy, amount, profile = {}) {
    const result = { absorbedShield: 0, hpDamage: 0, shieldBroken: false, killed: false }
    if (!enemy?.active || !Number.isFinite(amount) || amount <= 0) return result

    let remaining = amount
    const shieldBefore = Math.max(0, enemy.shield || 0)
    if (shieldBefore > 0) {
      result.absorbedShield = Math.min(shieldBefore, remaining)
      enemy.shield = shieldBefore - result.absorbedShield
      remaining -= result.absorbedShield
      enemy.shieldFlash = 0.22
      result.shieldBroken = shieldBefore > 0 && enemy.shield <= 0
    }

    if (remaining > 0) {
      const armor = clamp(enemy.armor || 0, 0, 0.85)
      const pierce = clamp(profile.armorPierce || 0, 0, 1)
      const reduced = remaining * (1 - armor * (1 - pierce))
      result.hpDamage = Math.min(Math.max(0, enemy.hp), reduced)
      enemy.hp -= reduced
    }
    enemy.hitFlash = 0.12

    if (enemy.boss && enemy.bossPhase === 1 && enemy.hp > 0 && enemy.hp <= enemy.maxHp * 0.5) {
      this._activateBossPhase(enemy)
    }
    if (enemy.hp <= 0) {
      result.killed = true
      this._resolveEnemyDeath(enemy)
    }
    return result
  }

  _activateBossPhase(boss) {
    boss.bossPhase = 2
    boss.baseSpeed = (boss.baseSpeed ?? boss.speed) * 1.2
    boss.shield = Math.max(boss.shield || 0, Math.round((boss.maxShield || 100) * 0.65))
    boss.maxShield = Math.max(boss.maxShield || 0, boss.shield)
    for (let index = 0; index < 3; index++) this._spawnEscort(boss, index)
    this._feedback('攻城兽进入狂暴阶段并召来护卫', 'warning')
  }

  _spawnEscort(boss, index) {
    const type = TOWER_DEFENSE_ENEMY_TYPES.grunt
    const progress = clamp(boss.progress - 0.012 * (index + 1), 0, 0.98)
    const hp = Math.round(type.hp * 1.5)
    this._addEnemy({
      id: this._nextSpecialEnemyId++,
      typeId: type.id,
      name: '王庭护卫',
      shape: type.shape,
      wave: boss.wave,
      progress,
      hp,
      maxHp: hp,
      speed: type.speed * 1.08,
      baseSpeed: type.speed * 1.08,
      reward: 8,
      damage: 1,
      color: '#d95f57',
      size: 0.92,
      boss: false,
      armor: 0.12,
      shield: 0,
      maxShield: 0,
      slowResistance: 0.1,
      splitCount: 0,
      active: true,
    })
  }

  _resolveEnemyDeath(enemy) {
    if (!enemy.active) return
    enemy.active = false
    this.gold += enemy.reward || 0
    if (enemy.countsAsKill !== false) this.kills++
    this.score += (enemy.reward || 0) * 10 + (enemy.wave || 1) * 4
    if ((enemy.splitCount || 0) > 0 && !enemy.splitResolved) {
      enemy.splitResolved = true
      this._spawnSplitChildren(enemy)
    }
  }

  _spawnSplitChildren(parent) {
    const type = getEnemyType('swarm')
    for (let index = 0; index < parent.splitCount; index++) {
      const progress = clamp(parent.progress - index * 0.006, 0, 0.995)
      this._addEnemy({
        id: this._nextSpecialEnemyId++,
        typeId: 'swarm',
        name: '裂殖幼体',
        shape: type.shape,
        wave: parent.wave,
        progress,
        hp: type.hp,
        maxHp: type.hp,
        speed: type.speed * 1.08,
        baseSpeed: type.speed * 1.08,
        reward: 0,
        damage: 1,
        color: type.color,
        size: 0.58,
        boss: false,
        armor: 0,
        shield: 0,
        maxShield: 0,
        slowResistance: 0,
        splitCount: 0,
        countsAsKill: false,
        active: true,
      })
    }
  }

  _damageEnemy(enemy, damage) {
    return this._applyDamage(enemy, damage)
  }

  _removeDefeatedEnemies() {
    this.enemies = this.enemies.filter((enemy) => enemy.active)
  }

  _update(step, events) {
    this._updateEnemies(step)
    if (this.state === 'finished') return
    this._updateBurnZones(step)
    this._updateTowers(step)
    this._removeDefeatedEnemies()
    this._updateShots(step)

    if ((events.allCompleted || this.director.phase === 'complete') && this.enemies.length === 0 && this.state !== 'finished') this._finish('victory')
  }

  _addEnemy(enemy) {
    const point = getTowerDefensePathPosition(enemy.progress || 0, this.stageConfig?.path)
    enemy.x = point.x
    enemy.y = point.y
    this.enemies.push(enemy)
  }

  _updateEnemies(dt) {
    for (const enemy of this.enemies) {
      if (!enemy.active) continue
      enemy.slowTimer = Math.max(0, (enemy.slowTimer || 0) - dt)
      enemy.freezeTimer = Math.max(0, (enemy.freezeTimer || 0) - dt)
      enemy.frostStackTimer = Math.max(0, (enemy.frostStackTimer || 0) - dt)
      enemy.speedBoostTimer = Math.max(0, (enemy.speedBoostTimer || 0) - dt)
      enemy.hitFlash = Math.max(0, (enemy.hitFlash || 0) - dt * 7)
      enemy.shieldFlash = Math.max(0, (enemy.shieldFlash || 0) - dt * 5)
      enemy.supportFlash = Math.max(0, (enemy.supportFlash || 0) - dt * 3)
      if (enemy.frostStackTimer === 0) enemy.frostStacks = 0

      if ((enemy.supportRadius || 0) > 0) this._updateSupportEnemy(enemy, dt)
      if (!enemy.active) continue

      const resistedSlow = (enemy.slowRatio || 0) * (1 - clamp(enemy.slowResistance || 0, 0, 0.9))
      const slowSpeed = enemy.slowTimer > 0 ? 1 - resistedSlow : 1
      const boostSpeed = enemy.speedBoostTimer > 0 ? 1.18 : 1
      const freezeSpeed = enemy.freezeTimer > 0 ? 0 : 1
      const moveStep = (enemy.baseSpeed ?? enemy.speed ?? 0) * slowSpeed * boostSpeed * freezeSpeed * dt
      enemy.progress += moveStep
      enemy.walkTime = (enemy.walkTime || 0) + moveStep * 45
      const point = getTowerDefensePathPosition(enemy.progress, this.stageConfig?.path)
      enemy.x = point.x
      enemy.y = point.y
      enemy.facing = point.facing
      if (enemy.progress < 1) continue

      enemy.active = false
      this.baseHp = Math.max(0, this.baseHp - (enemy.damage || 1))
      if (this.baseHp <= 0) {
        this._removeDefeatedEnemies()
        this._finish('defeat')
        return
      }
    }
    this._removeDefeatedEnemies()
  }

  _updateSupportEnemy(support, dt) {
    support.supportTimer = (support.supportTimer ?? 1.2) - dt
    if (support.supportTimer > 0) return
    support.supportTimer += 1.6
    const radiusSquared = support.supportRadius ** 2
    let affected = 0
    for (const ally of this.enemies) {
      if (!ally.active || ally === support || distanceSquared(ally, support) > radiusSquared) continue
      const heal = Math.min(support.supportHeal || 0, Math.max(0, ally.maxHp - ally.hp))
      ally.hp += heal
      ally.speedBoostTimer = Math.max(ally.speedBoostTimer || 0, 1.25)
      ally.supportFlash = 0.5
      if (heal > 0 || ally.speedBoostTimer > 0) affected++
    }
    if (affected > 0) support.supportFlash = 0.6
  }

  _updateBurnZones(dt) {
    for (const zone of this.burnZones) {
      zone.life -= dt
      zone.tick -= dt
      while (zone.tick <= 0 && zone.life > 0) {
        zone.tick += 0.25
        const radiusSquared = zone.radius ** 2
        for (const enemy of this.enemies) {
          if (!enemy.active || distanceSquared(enemy, zone) > radiusSquared) continue
          this._applyDamage(enemy, zone.damage * 0.25, { armorPierce: 0.2 })
        }
      }
    }
    this.burnZones = this.burnZones.filter((zone) => zone.life > 0)
  }

  _updateTowers(dt) {
    for (const tower of this.towers) {
      tower.cooldown = Math.max(0, (tower.cooldown || 0) - dt)
      tower.feverTimer = Math.max(0, (tower.feverTimer || 0) - dt)
      tower.moraleTimer = Math.max(0, (tower.moraleTimer || 0) - dt)
      tower.relocateCooldown = Math.max(0, (tower.relocateCooldown || 0) - dt)

      if (tower.heartAnim > 0) {
        tower.heartAnim = Math.max(0, tower.heartAnim - dt)
      }
      if (tower.leapAnim) {
        tower.leapAnim.progress += dt / tower.leapAnim.duration
        if (tower.leapAnim.progress >= 1) {
          tower.leapAnim = null
        }
      }

      if (tower.cooldown > 0) continue

      const stats = getTowerStats(tower.typeId, tower.level, tower.branchId, tower.slotIndex)
      const target = this._findTarget(tower, stats.range)
      if (!target) continue

      const feverMult = tower.feverTimer > 0 ? 0.40 : 1.0
      const moraleSpeedBonus = this.geneEffects?.moraleSpeedBoost || 0.15
      const moraleMult = tower.moraleTimer > 0 ? (1 - moraleSpeedBonus) : 1.0
      tower.cooldown = stats.fireInterval * feverMult * moraleMult
      this._fireTower(tower, target, stats)
    }
  }

  _updateShots(dt) {
    for (const shot of this.shots) shot.life -= dt
    this.shots = this.shots.filter((shot) => shot.life > 0)
  }

  _finish(outcome) {
    if (this._finishSent) return
    this._finishSent = true
    this.state = 'finished'
    this.outcome = outcome
    if (outcome === 'victory') {
      this.score += this.baseHp * 100 + this.gold * 2
      this.clearResult = recordStageClear(this.currentStageId || 1, this.baseHp, this.maxBaseHp)
      this.game?.sound?.levelUp?.()
      this._feedback(`🎉 防线大捷！恭喜通关获得 ${this.clearResult?.stars || 3} 星评价！`, 'success')
    } else {
      this.game?.sound?.gameOver?.()
      this._feedback(`💀 防线失守，请重新部署！`, 'danger')
    }
    this._pushHud()
    this.game?.finishGameplay?.(this.getResultSnapshot())
  }

  getHudSnapshot() {
    const selected = this.getTowerAtSlot(this.selectedSlotIndex)
    const totalWavesCount = this.director.waves?.length || TOWER_DEFENSE_WAVE_COUNT
    const activeWaveIndex = clamp(this.director.waveIndex, 0, totalWavesCount - 1)
    const previewWaveIndex = this.director.phase === 'intermission'
      ? clamp(this.director.waveIndex + 1, 0, totalWavesCount - 1)
      : activeWaveIndex
    const nextWaveIndex = previewWaveIndex + 1
    const waveConfig = this.director.waves?.[activeWaveIndex] || TOWER_DEFENSE_WAVES[activeWaveIndex]
    const waveTotal = waveConfig?.groups?.reduce((sum, g) => sum + g.count, 0) || waveConfig?.count || 0
    const waveResolved = Math.max(0, this.director.spawned - this.enemies.length)
    const waveProgress = this.director.phase === 'intermission'
      ? this.director.completedWaves / totalWavesCount
      : waveTotal > 0
        ? clamp(waveResolved / waveTotal, 0, 1)
        : 0
    const totalSeconds = Math.max(0, Math.floor(this.elapsedTime))
    const timeLabel = `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`
    const status = this.director.phase === 'intermission'
      ? `${this.director.waveIndex < 0 ? '部署准备' : '整备阶段'}：${Math.ceil(Math.max(0, this.director.timer))} 秒`
      : this.director.phase === 'waiting'
        ? '清除剩余来袭单位'
        : this.director.phase === 'complete'
          ? '所有波次已完成'
          : '敌军正在进入防线'
    const currentSlots = this.buildSlots || TOWER_DEFENSE_BUILD_SLOTS
    return {
      mode: 'tower-defense',
      stageId: this.currentStageId || 1,
      stageName: this.stageConfig?.name || '第 1-1 关 · 母巢防线',
      chapterId: this.stageConfig?.chapterId || 1,
      chapterName: this.stageConfig?.chapterName || '纯净母巢',
      theme: this.stageConfig?.theme || null,
      clearResult: this.clearResult,
      state: this.state,
      stateLabel: this.director.phase === 'intermission' ? (this.director.waveIndex < 0 ? '部署准备' : '波间整备') : '防守进行中',
      outcome: this.outcome,
      elapsed: this.elapsedTime,
      timeLabel,
      baseHp: this.baseHp,
      maxBaseHp: this.maxBaseHp,
      lives: this.baseHp,
      maxLives: this.maxBaseHp,
      gold: this.gold,
      wave: Math.max(0, this.director.waveIndex + 1),
      totalWaves: totalWavesCount,
      completedWaves: this.director.completedWaves,
      activeMutations: this.activeMutations,
      pendingMutationChoices: this.pendingMutationChoices,
      waveProgress,
      status,
      phase: this.director.phase,
      nextWaveIn: this.director.phase === 'intermission' ? Math.max(0, this.director.timer) : 0,
      currentWaveComposition: getWaveComposition(previewWaveIndex),
      nextWavePreview: nextWaveIndex < totalWavesCount ? getWaveComposition(nextWaveIndex) : [],
      baseDamagePreview: getWaveBaseDamage(previewWaveIndex),
      feedback: this.feedback,
      enemies: this.enemies.length,
      kills: this.kills,
      score: this.score,
      towersBuilt: this.towersBuilt,
      upgrades: this.upgrades,
      selectedTowerTypeId: this.selectedTowerTypeId,
      selectedSlotIndex: this.selectedSlotIndex,
      traps: this.traps.map((t) => ({
        id: t.id,
        name: t.name,
        shortDesc: t.shortDesc,
        description: t.description,
        icon: t.icon,
        color: t.color,
        cooldown: t.cooldown,
        cooldownTimer: Math.ceil(t.cooldownTimer),
        isReady: t.cooldownTimer <= 0,
      })),
      selectedSlot: this.selectedSlotIndex >= 0 ? {
        index: this.selectedSlotIndex,
        occupied: !!selected,
        isLocked: !this.unlockedSlots.has(this.selectedSlotIndex),
        lockCost: currentSlots[this.selectedSlotIndex]?.cost || 40,
        lockReward: currentSlots[this.selectedSlotIndex]?.reward || 60,
        leyline: getSlotLeylineResonance(this.selectedSlotIndex, selected?.typeId || this.selectedTowerTypeId),
      } : null,
      tutorial: this.tutorial,
      towerTypes: TOWER_TYPE_LIST.map((type) => {
        const unlocked = isTowerUnlocked(type.id, this.currentStageId, this.saveUnlockedTowers)
        const unlockStage = TOWER_UNLOCK_MAP[type.id] || 1
        return {
          id: type.id,
          typeId: type.id,
          type: type.id,
          shape: type.shape,
          name: type.name,
          description: type.description,
          color: type.color,
          cost: type.cost,
          unlocked,
          unlockStage,
          affordable: unlocked && this.gold >= type.cost,
          selected: type.id === this.selectedTowerTypeId,
        }
      }),
      selectedTower: selected ? this._getTowerSnapshot(selected) : null,
      buildSlots: currentSlots.map((slot, slotIndex) => ({
        slotIndex,
        occupied: !!this.getTowerAtSlot(slotIndex),
        isLocked: !this.unlockedSlots.has(slotIndex),
        leyline: getSlotLeylineResonance(slotIndex, this.getTowerAtSlot(slotIndex)?.typeId),
      })),
    }
  }

  _getTowerSnapshot(tower) {
    const type = TOWER_DEFENSE_TOWER_TYPES[tower.typeId]
    const stats = getTowerStats(tower.typeId, tower.level, tower.branchId, tower.slotIndex)
    const upgradeCost = getTowerUpgradeCost(tower)
    const branch = tower.branchId ? type.branches[tower.branchId] : null
    const burstMultiplier = stats.fireKind === 'burst'
      ? 1 + ((stats.burst || 1) - 1) * (stats.burstScale || 1)
      : 1
    const resonance = getSlotLeylineResonance(tower.slotIndex, tower.typeId)
    return {
      slotIndex: tower.slotIndex,
      typeId: tower.typeId,
      name: type.name,
      color: type.color,
      level: tower.level,
      maxLevel: 4,
      damage: stats.damage,
      range: stats.range,
      fireInterval: stats.fireInterval,
      attackSpeed: 1 / stats.fireInterval,
      dps: stats.damage * burstMultiplier / stats.fireInterval,
      effectText: this._getEffectText(stats),
      targetStrategy: TOWER_DEFENSE_TARGET_STRATEGIES.find(({ id }) => id === tower.targetStrategy),
      targetStrategies: TOWER_DEFENSE_TARGET_STRATEGIES,
      branch: branch ? { id: branch.id, name: branch.name, description: branch.description } : null,
      branchOptions: tower.level >= 2 ? getTowerBranchOptions(tower.typeId) : [],
      upgradeCost,
      canUpgrade: upgradeCost !== null && this.gold >= upgradeCost && (tower.level !== 2 || !!tower.branchId),
      sellValue: getTowerSellValue(tower),
      canSell: this.state === 'active',
      resonance,
      relocateCooldown: Math.ceil(tower.relocateCooldown || 0),
      canRelocate: (tower.relocateCooldown || 0) <= 0,
      feverActive: (tower.feverTimer || 0) > 0,
      moraleActive: (tower.moraleTimer || 0) > 0,
    }
  }

  _getEffectText(stats) {
    if (stats.fireKind === 'burst') return `${stats.burst} 连射，后续弹伤害 ${Math.round(stats.burstScale * 100)}%`
    if (stats.fireKind === 'chain') return `寒流跳转 ${stats.chainCount} 个目标，减速 ${Math.round(stats.slowRatio * 100)}%`
    if (stats.fireKind === 'freeze') return `减速 ${Math.round(stats.slowRatio * 100)}%，三层寒霜冻结`
    if (stats.fireKind === 'slow') return `减速 ${Math.round(stats.slowRatio * 100)}%，持续 ${stats.slowDuration.toFixed(1)} 秒`
    if (stats.fireKind === 'burn') return `范围 ${stats.splashRadius.toFixed(2)}，灼烧 ${stats.burnDamage}/秒`
    if (stats.fireKind === 'splash') return `爆炸范围 ${stats.splashRadius.toFixed(2)}，穿甲 ${Math.round((stats.armorPierce || 0) * 100)}%`
    if ((stats.armorPierce || 0) > 0) return `护甲穿透 ${Math.round(stats.armorPierce * 100)}%`
    return '稳定单体伤害'
  }

  getResultSnapshot() {
    return {
      mode: 'tower-defense',
      outcome: this.outcome,
      title: this.outcome === 'victory' ? '防线守卫成功' : '基地防线失守',
      elapsed: this.elapsedTime,
      wave: Math.max(0, this.director.waveIndex + 1),
      completedWaves: this.director.completedWaves,
      totalWaves: TOWER_DEFENSE_WAVE_COUNT,
      baseHp: this.baseHp,
      maxBaseHp: this.maxBaseHp,
      lives: this.baseHp,
      maxLives: this.maxBaseHp,
      gold: this.gold,
      towers: this.towers.length,
      towersBuilt: this.towersBuilt,
      upgrades: this.upgrades,
      kills: this.kills,
      score: this.score,
    }
  }

  renderWorld(ctx) {
    this.renderer.render(ctx)
  }

  _eventPosition(event) {
    const rect = this._canvas?.getBoundingClientRect?.()
    if (!rect || !rect.width || !rect.height) return null
    return {
      x: (event.clientX - (rect.left || 0)) * (this.game.width / rect.width),
      y: (event.clientY - (rect.top || 0)) * (this.game.height / rect.height),
    }
  }

  _handlePointerDown(event) {
    if (this.state !== 'active') return
    const point = this._eventPosition(event)
    if (!point) return

    // 1. Check interactive trap clicks
    for (const trap of this.traps) {
      const trapPoint = this.renderer.project(trap.pos)
      const distSq = (point.x - trapPoint.x) ** 2 + (point.y - trapPoint.y) ** 2
      const hitRadius = Math.max(28, this.renderer.unit * 1.15)
      if (distSq <= hitRadius ** 2) {
        if (trap.cooldownTimer <= 0) {
          this.triggerTrap(trap.id)
        } else {
          this._feedback(`${trap.name}冷却中（${Math.ceil(trap.cooldownTimer)}s）`, 'info')
        }
        return
      }
    }

    // 2. Check build slot clicks
    const slotIndex = this.renderer.getSlotIndexAt(point.x, point.y)
    if (slotIndex >= 0) {
      const existing = this.getTowerAtSlot(slotIndex)
      if (existing && slotIndex === this.selectedSlotIndex) {
        // Petting / Encouraging the slime
        this.petTower(slotIndex)
      }
      this.selectedSlotIndex = slotIndex
      this._pushHud()
    } else {
      this.selectedSlotIndex = -1
      this._pushHud()
    }
  }

  _handlePointerMove(event) {
    const point = this._eventPosition(event)
    if (!point) {
      this.hoveredSlotIndex = -1
      this.hoveredTrapId = null
      return
    }
    this.hoveredSlotIndex = this.renderer.getSlotIndexAt(point.x, point.y)

    let hoveredTrap = null
    for (const trap of this.traps) {
      const trapPoint = this.renderer.project(trap.pos)
      const distSq = (point.x - trapPoint.x) ** 2 + (point.y - trapPoint.y) ** 2
      const hitRadius = Math.max(30, this.renderer.unit * 1.25)
      if (distSq <= hitRadius ** 2) {
        hoveredTrap = trap.id
        break
      }
    }
    this.hoveredTrapId = hoveredTrap
  }

  _feedback(text, kind = 'info') {
    this.feedback = { text, kind }
    this.feedbackTimer = 2.2
  }

  _reject(text) {
    this._feedback(text, 'error')
    this._pushHud()
    return false
  }

  _pushHud() {
    this.game?._pushGameplayHud?.()
  }

  _unbindCanvas() {
    this._canvas?.removeEventListener?.('pointerdown', this._onPointerDown)
    this._canvas?.removeEventListener?.('pointermove', this._onPointerMove)
    this._canvas = null
  }

  destroy() {
    this._unbindCanvas()
    this.enemies.length = 0
    this.towers.length = 0
    this.shots.length = 0
    this.burnZones.length = 0
    super.destroy()
  }
}

export { TOWER_DEFENSE_TOWER_TYPES }
