import { GameplayController } from '../GameplayController.js'
import { TowerDefenseDirector } from './TowerDefenseDirector.js'
import { TowerDefenseRenderer } from './TowerDefenseRenderer.js'
import {
  CHAPTERS_META,
  generateEndlessWaves,
  getStageConfig,
} from './TowerDefenseCampaignRules.js'
import {
  loadCampaignSave,
  recordEndlessWave,
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
  getWaveCompositionFromWaves,
} from './TowerDefenseRules.js'

const TOWER_TYPE_LIST = Object.values(TOWER_DEFENSE_TOWER_TYPES).sort((a, b) => TOWER_UNLOCK_MAP[a.id] - TOWER_UNLOCK_MAP[b.id])
const TARGET_STRATEGY_IDS = new Set(TOWER_DEFENSE_TARGET_STRATEGIES.map(({ id }) => id))
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const distanceSquared = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2

export class TowerDefenseGameplay extends GameplayController {
  constructor() {
    super('tower-defense')
    this.currentStageId = 1
    this.stageConfig = getStageConfig(1)
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
        cooldown: base.cooldown,
        cooldownTimer: 0,
      }
    })
    this.trapEvents = []
    this.clearResult = null
    this.saveUnlockedTowers = new Set(['rapid', 'slow'])
    this.gameSpeed = 1
    this.isEndless = false
    this.lastWaveReport = null
    this._waveLeaked = 0
    this._waveLeakDamage = 0
    this.hoveredEnemyId = null

    this.state = 'active'
    this.outcome = null
    this.elapsedTime = 0
    this.baseHp = this.stageConfig.baseHp || TOWER_DEFENSE_BASE_HP
    this.maxBaseHp = this.stageConfig.baseHp || TOWER_DEFENSE_BASE_HP
    this.gold = (this.stageConfig.startingGold || TOWER_DEFENSE_STARTING_GOLD)
    this.kills = 0
    this.score = 0
    this.towersBuilt = 0
    this.upgrades = 0
    this.selectedTowerTypeId = 'rapid'
    this.previewTowerTypeId = null
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
    this._bindHotkeys()
  }

  usesArenaFramePipeline() {
    return false
  }

  _bindHotkeys() {
    if (this._hotkeysBound || typeof window === 'undefined') return
    this._hotkeysBound = true
    this._onKeyDown = (event) => {
      if (this.state === 'finished' || event.repeat) return
      const typeIds = Object.keys(TOWER_UNLOCK_MAP)
      if (event.code.startsWith('Digit')) {
        const index = (Number(event.code.slice(5)) || 10) - 1
        if (index >= 0 && index < typeIds.length) {
          this.selectTowerType(typeIds[index])
          event.preventDefault()
        }
        return
      }
      switch (event.code) {
        case 'Escape':
        case 'KeyQ':
          this.selectSlot(-1)
          break
        case 'KeyE':
          this.callNextWaveEarly()
          break
        case 'KeyT':
          this.triggerTrap(this.traps[0]?.id)
          break
        case 'KeyG':
          this.triggerTrap(this.traps[1]?.id)
          break
        default:
          return
      }
      event.preventDefault()
    }
    window.addEventListener('keydown', this._onKeyDown)
  }

  _unbindHotkeys() {
    if (this._hotkeysBound && this._onKeyDown && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this._onKeyDown)
    }
    this._hotkeysBound = false
  }

  cycleGameSpeed() {
    this.gameSpeed = this.gameSpeed >= 3 ? 1 : this.gameSpeed + 1
    this._feedback(`游戏速度 ×${this.gameSpeed}`, 'info')
    this._pushHud()
    return this.gameSpeed
  }

  callNextWaveEarly() {
    if (this.state !== 'active') return false
    if (this.waitingForFirstTower) return false
    if (this.director.phase !== 'intermission') return false
    const wait = Math.ceil(Math.max(0, this.director.timer))
    if (wait <= 0) return false
    const bonus = Math.round(wait * 2)
    this.director.timer = 0
    this.gold += bonus
    this.score += bonus * 2
    this._feedback(`敌军提前来袭！先手奖励 +${bonus} 养分`, 'warning')
    this._pushHud()
    return true
  }

  loadStage(stageId = 1, { endless = false } = {}) {
    const save = loadCampaignSave()
    this.currentStageId = Math.max(1, Math.min(99, Number(stageId) || 1))
    this.stageConfig = getStageConfig(this.currentStageId, { endless })
    this.saveUnlockedTowers = new Set(save.unlockedTowers || ['rapid', 'slow'])
    this.tutorial = {
      active: this.stageConfig.introductory && !save.tutorialCompleted,
      step: 1,
      totalSteps: 3,
    }
    this.director.loadWaves(this.stageConfig.waves)
    this.buildSlots = this.stageConfig.buildSlots
    this.unlockedSlots = new Set(this.buildSlots.map((s, idx) => (!s.locked ? idx : -1)).filter((idx) => idx >= 0))
    this.traps = this.stageConfig.traps.map((t) => {
      const base = TOWER_DEFENSE_TRAPS.find((dt) => dt.id === t.id) || t
      return {
        ...base,
        ...t,
        cooldown: base.cooldown,
        cooldownTimer: 0,
      }
    })
    this.enemies.length = 0
    this.towers.length = 0
    this.shots.length = 0
    this.burnZones.length = 0
    this.trapEvents.length = 0
    this.isEndless = endless
    this.lastWaveReport = null
    this._waveLeaked = 0
    this._waveLeakDamage = 0
    this.hoveredEnemyId = null
    this.gameSpeed = 1
    this.state = 'active'
    this.outcome = null
    this.clearResult = null
    this.elapsedTime = 0
    const baseHpTotal = (this.stageConfig.baseHp || TOWER_DEFENSE_BASE_HP)
    this.baseHp = baseHpTotal
    this.maxBaseHp = baseHpTotal
    this.gold = (this.stageConfig.startingGold || TOWER_DEFENSE_STARTING_GOLD)
    this.kills = 0
    this.score = 0
    this.towersBuilt = 0
    this.upgrades = 0
    this.selectedTowerTypeId = 'rapid'
    this.previewTowerTypeId = null
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
    if (this.isEndless) return this.startEndlessMode(this.currentStageId || 1)
    return this.loadStage(this.currentStageId || 1)
  }

  restart() {
    return this.reset()
  }

  /** 无尽模式：沿用所选关卡的地图/机关，替换为无限爬坡波次，冲击最高波次记录 */
  startEndlessMode(baseStageId = 1) {
    this.loadStage(Math.max(1, Math.min(99, Number(baseStageId) || 1)), { endless: true })
    this.isEndless = true
    this.director.loadWaves(generateEndlessWaves(this.currentStageId))
    this.tutorial = { active: false, step: 0 }
    this._feedback('♾️ 无尽试炼开始！坚持尽可能多的波次！', 'warning')
    this._pushHud()
    return this
  }

  advanceTutorial() {
    if (!this.tutorial || !this.tutorial.active) return
    if (this.waitingForFirstTower) return
    this.tutorial.step++
    if (this.tutorial.step > 3) {
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

  get introductory() {
    return !!this.stageConfig.introductory
  }

  get progression() {
    return this.stageConfig.progression
  }

  canUseTower(typeId) {
    return isTowerUnlocked(typeId, this.currentStageId, this.progression.restrictTowerRoster ? null : this.saveUnlockedTowers)
  }

  get waitingForFirstTower() {
    return this.introductory && this.tutorial?.active && this.towersBuilt === 0
  }

  getTowerAtSlot(slotIndex) {
    return this.towers.find((tower) => tower.slotIndex === slotIndex) || null
  }

  clearObstacle(slotIndex) {
    if (!this.progression.clearing) return false
    const index = Number(slotIndex)
    const slot = (this.buildSlots || TOWER_DEFENSE_BUILD_SLOTS)[index]
    if (!slot || !slot.locked || this.unlockedSlots.has(index)) return false
    const cost = slot.cost || 40
    if (this.gold < cost) return this._reject(`养分不足，开垦需要 ${cost} 养分`)
    this.gold -= cost
    this.unlockedSlots.add(index)
    const reward = 0
    this.gold += reward
    this.selectedSlotIndex = index
    this._feedback(`开垦完成，优势塔位已解锁`, 'success')
    this._pushHud()
    return true
  }

  triggerTrap(trapId) {
    const trap = this.traps.find((t) => t.id === trapId)
    if (!trap || trap.cooldownTimer > 0) return false
    trap.cooldownTimer = trap.cooldown

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
    if (!this.progression.relocation) return false
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

  selectTowerType(typeId) {
    if (!TOWER_DEFENSE_TOWER_TYPES[typeId]) return this._reject('未知的防御塔类型')
    if (!this.canUseTower(typeId)) return false
    this.selectedTowerTypeId = typeId
    if (this.selectedSlotIndex >= 0 && !this.getTowerAtSlot(this.selectedSlotIndex)) {
      return this.placeTower(this.selectedSlotIndex, typeId)
    }
    this._pushHud()
    return true
  }

  previewTowerType(typeId) {
    const canPreview = this.state === 'active'
      && this.selectedSlotIndex >= 0
      && this.unlockedSlots.has(this.selectedSlotIndex)
      && !this.getTowerAtSlot(this.selectedSlotIndex)
      && TOWER_DEFENSE_TOWER_TYPES[typeId]
      && this.canUseTower(typeId)
    this.previewTowerTypeId = canPreview ? typeId : null
    // Paused games still need to show and clear the placement preview.
    if (this.game?.running === false) this.game.render?.()
    return !!canPreview
  }

  getTowerRange(typeId, level = 1, branchId = null, slotIndex = this.selectedSlotIndex) {
    const stats = getTowerStats(typeId, level, branchId, slotIndex, this.buildSlots)
    return stats.range
  }

  selectSlot(slotIndex) {
    this.previewTowerTypeId = null
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
    if (!this.canUseTower(type.id)) {
      const req = TOWER_UNLOCK_MAP[type.id] || 1
      return this._reject(`${type.name}需在第 ${req} 关解锁`)
    }
    if (this.getTowerAtSlot(index)) return this._reject('该部署位已被占用')
    if (this.gold < type.cost) return this._reject(`资源不足，还需 ${type.cost - this.gold}`)

    this.gold -= type.cost
    this.previewTowerTypeId = null
    this.selectedTowerTypeId = type.id
    this.selectedSlotIndex = index
    const shinyTrait = null


    this.towers.push({
      slotIndex: index,
      typeId: type.id,
      level: 1,
      branchId: null,
      targetStrategy: type.targeting || 'first',
      cooldown: 0,
      feverTimer: 0,
      relocateCooldown: 0,
      leapAnim: null,
      shinyTrait,
    })
    this.towersBuilt++
    if (this.tutorial?.active && this.tutorial.step === 1) {
      this.tutorial.step = 2
    }
    const resonance = getSlotLeylineResonance(index, type.id, this.buildSlots)
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
    if (!this.progression.targeting) return false
    const tower = this.getTowerAtSlot(this.selectedSlotIndex)
    if (!tower || !TARGET_STRATEGY_IDS.has(strategyId)) return false
    tower.targetStrategy = strategyId
    const strategy = TOWER_DEFENSE_TARGET_STRATEGIES.find(({ id }) => id === strategyId)
    this._feedback(`索敌切换为${strategy?.name || strategyId}`, 'info')
    this._pushHud()
    return true
  }

  selectTowerBranch(branchId) {
    if (!this.progression.branches) return false
    const tower = this.getTowerAtSlot(this.selectedSlotIndex)
    const type = tower ? TOWER_DEFENSE_TOWER_TYPES[tower.typeId] : null
    if (!tower || tower.level !== 2 || !type?.branches[branchId]) return false
    tower.branchId = branchId
    this._feedback(`已预选${type.branches[branchId].name}`, 'info')
    this._pushHud()
    return true
  }


  upgradeSelectedTower() {
    const tower = this.getTowerAtSlot(this.selectedSlotIndex)
    if (tower?.level >= this.progression.maxTowerLevel) return false
    const cost = getTowerUpgradeCost(tower)
    if (this.state !== 'active' || !tower || cost === null) return false
    if (tower.level === 2 && !tower.branchId) return this._reject('请先选择一个 Lv.3 专精方向')
    if (this.gold < cost) return this._reject(`资源不足，还需 ${cost - this.gold}`)
    this.gold -= cost
    tower.level++
    tower.cooldown = Math.min(tower.cooldown, getTowerStats(tower.typeId, tower.level, tower.branchId).fireInterval)
    this.upgrades++
    if (this.tutorial?.active && this.tutorial.step === 2) this.tutorial.step = 3
    this.game?.sound?.levelUp?.()
    this._feedback(`${TOWER_DEFENSE_TOWER_TYPES[tower.typeId].name}进化至 Lv.${tower.level}`, 'success')
    this._pushHud()
    return true
  }

  sellSelectedTower() {
    const tower = this.getTowerAtSlot(this.selectedSlotIndex)
    if (this.state !== 'active' || !tower) return false
    const value = Math.round(getTowerSellValue(tower))
    this.gold += value
    this.towers.splice(this.towers.indexOf(tower), 1)
    this.selectedSlotIndex = -1
    this._feedback(`史莱姆已放生遣散，返还 ${value} 养分`, 'info')
    this._pushHud()
    return true
  }

  updateWorld(dt) {
    if (!this.game || this.state === 'finished' || !Number.isFinite(dt) || dt <= 0) return
    this.renderer.ensureLayout()
    // 倍速：把缩放后的时间切成小步长推进，保证高频事件（开火/脉冲）不丢帧
    let remaining = Math.min(dt, 0.25) * (this.gameSpeed || 1)
    while (remaining > 0) {
      const step = Math.min(remaining, 0.05)
      remaining -= step
      this._simulateStep(step)
      if (this.state === 'finished') break
    }
  }

  _simulateStep(step) {
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

    const events = this.waitingForFirstTower ? {} : this.director.update(step, this.enemies.length)
    for (const enemy of events.spawns || []) {
      this._addEnemy(enemy)
      if (enemy.miniBoss) this._feedback(`小首领 ${enemy.name} 抵达！${enemy.miniBoss.counter}`, 'warning')
    }
    if (events.waveStarted) {
      this._waveLeaked = 0
      this._waveLeakDamage = 0
      const pacing = this.director.waves[events.waveStarted - 1]?.pacing
      this._feedback(`第 ${events.waveStarted} 波抵达${pacing ? ` · ${pacing.name}` : ''}`, pacing?.role === 'recovery' ? 'info' : 'warning')
    }
    if (events.waveCompleted) {
      const wave = (this.director.waves || TOWER_DEFENSE_WAVES)[events.waveCompleted - 1]
      // 波次补给随关卡进度成长（战役波次未配置 reward 时使用成长公式）
      let bonus = wave?.reward ?? Math.round((18 + events.waveCompleted * 4) * (1 + (this.currentStageId - 1) * 0.06))
      const interest = 0
      this.gold += bonus + interest
      this.score += (bonus + interest) * 5
      this.lastWaveReport = {
        wave: events.waveCompleted,
        bonus,
        interest,
        leaked: this._waveLeaked,
        leakDamage: this._waveLeakDamage,
      }
      const supplyText = `补给 +${bonus}`
      this._feedback(
        this._waveLeaked > 0
          ? `⚠ 战报：漏怪 ${this._waveLeaked} 名 -${this._waveLeakDamage} 心 ｜ ${supplyText}`
          : `战报：防线无损 ｜ ${supplyText}`,
        this._waveLeaked > 0 ? 'danger' : 'success',
      )


    }

    this._updateEnemies(step)
    if (this.state === 'finished') return
    this._updateBurnZones(step)
    this._updateShots(step)
    this._updateTowers(step)
    this._removeDefeatedEnemies()

    if ((events.allCompleted || this.director.phase === 'complete') && this.enemies.length === 0 && this.state !== 'finished') this._finish('victory')
  }

  _findTarget(tower, range) {
    const slot = (this.buildSlots || TOWER_DEFENSE_BUILD_SLOTS)[tower.slotIndex]
    const rangeSquared = range * range
    const strategy = tower.targetStrategy || 'first'
    let target = null
    let bestScore = -Infinity
    for (const enemy of this.enemies) {
      const stats = getTowerStats(tower.typeId, tower.level, tower.branchId, tower.slotIndex, this.buildSlots)
      if (!enemy.active || distanceSquared(enemy, slot) > rangeSquared || distanceSquared(enemy, slot) < (stats?.minRange || 0) ** 2) continue
      if (!this._isEnemyVisible(enemy, slot)) continue
      const health = Math.max(0, enemy.hp || 0) + Math.max(0, enemy.shield || 0)
      let score
      if (strategy === 'last') score = -enemy.progress
      else if (strategy === 'strong') score = health
      else if (strategy === 'weak') score = -health
      else if (strategy === 'support') score = ((enemy.typeId === 'support' || enemy.supportRadius || enemy.wardRadius || enemy.empPulse) ? 10 : 0) + enemy.progress
      else if (strategy === 'boss') score = (enemy.boss || enemy.miniBoss ? 10 : 0) + enemy.progress
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

  _isEnemyVisible(enemy, source) {
    if (!enemy.cloaked || enemy.markTimer > 0 || distanceSquared(enemy, source) <= .12 ** 2) return true
    return this.towers.some(tower => {
      if (tower.typeId !== 'beacon' || tower.disabledTimer > 0) return false
      const stats = getTowerStats(tower.typeId, tower.level, tower.branchId, tower.slotIndex, this.buildSlots)
      return distanceSquared(enemy, this.buildSlots[tower.slotIndex]) <= stats.revealRadius ** 2
    })
  }

  _firePiercing(tower, target, profile) {
    const source = this.buildSlots[tower.slotIndex]
    const length = Math.hypot(target.x - source.x, target.y - source.y) || 1
    const dx = (target.x - source.x) / length, dy = (target.y - source.y) / length
    const hits = this.enemies.filter(enemy => {
      const x = enemy.x - source.x, y = enemy.y - source.y
      const along = x * dx + y * dy
      return enemy.active && along >= (profile.minRange || 0) && along <= profile.range && Math.abs(x * dy - y * dx) <= .025
    }).sort((a, b) => distanceSquared(a, source) - distanceSquared(b, source)).slice(0, profile.pierceCount)
    for (const enemy of hits) this._applyDamage(enemy, profile.damage, profile)
    this.shots.push({ from: { ...source }, to: { x: source.x + dx * profile.range, y: source.y + dy * profile.range }, color: '#e0bf94', kind: 'chain', impacted: true, life: .18, maxLife: .18 })
  }

  _fireTower(tower, target, profile) {
    const type = TOWER_DEFENSE_TOWER_TYPES[tower.typeId]
    const source = (this.buildSlots || TOWER_DEFENSE_BUILD_SLOTS)[tower.slotIndex]
    if (profile.fireKind === 'piercing') { this._firePiercing(tower, target, profile); return }
    const isSniper = tower.branchId === 'sniper'
    const isBurst = profile.fireKind === 'burst'
    const isBlast = ['splash', 'burn'].includes(profile.fireKind)
    const duration = isSniper ? 0.18 : isBlast ? 0.28 : isBurst ? 0.26 : 0.22
    const isChain = ['chain', 'chain_shock'].includes(profile.fireKind)
    const travelDuration = isChain ? 0 : duration
    const impactDuration = isChain ? duration : isBlast ? 0.18 : 0.12
    const count = isBurst ? (profile.burst || 1) : 1

    for (let index = 0; index < count; index++) {
      const delay = index * 0.03
      const life = delay + travelDuration + impactDuration
      this.shots.push({
        from: { x: source.x, y: source.y },
        to: { x: target.x, y: target.y },
        target: isChain ? null : target,
        profile: { ...profile, damage: profile.damage * (index === 0 ? 1 : profile.burstScale || 1) },
        towerTypeId: tower.typeId,
        branchId: tower.branchId,
        color: type.color,
        kind: profile.fireKind,
        blast: isBlast,
        radius: profile.splashRadius || 0,
        delay,
        travelDuration,
        impactDuration,
        impacted: isChain,
        life,
        maxLife: life,
      })
    }

    // 连锁电弧会立即连接目标；实体飞弹由 _updateShots 在抵达时结算。
    if (isChain) this._fireChain(target, profile)
    this.game?.sound?.shoot?.(isBlast ? 'heavy' : 'spark', 0.35)
  }

  _resolveShotImpact(shot) {
    const { target, profile, to: center } = shot
    if (['corrode', 'root', 'mark'].includes(profile.fireKind)) {
      const victims = profile.splashRadius ? this.enemies.filter(e => e.active && distanceSquared(e, center) <= profile.splashRadius ** 2) : [target];
      for (const enemy of victims) {
        if (!enemy?.active) continue
        this._applyDamage(enemy, profile.damage, profile)
        if (profile.fireKind === 'corrode') {
          enemy.corrosion = Math.max(enemy.corrosion || 0, profile.corrosion)
          enemy.poisonDps = Math.max(enemy.poisonDps || 0, profile.poisonDps)
          enemy.corrosionTimer = profile.effectDuration
        } else if (profile.fireKind === 'root' && !(enemy.rootImmunity > 0)) {
          const duration = profile.rootDuration * (enemy.boss ? .3 : 1 - (enemy.slowResistance || 0))
          enemy.freezeTimer = Math.max(enemy.freezeTimer || 0, duration)
          enemy.rootImmunity = duration + 3
        } else if (profile.fireKind === 'mark') {
          enemy.markTimer = profile.effectDuration
          enemy.vulnerability = Math.max(enemy.vulnerability || 0, profile.vulnerability)
          enemy.silenceTimer = Math.max(enemy.silenceTimer || 0, profile.silenceDuration || 0)
        }
      }
    } else if (profile.fireKind === 'splash' || profile.fireKind === 'burn') {
      this._damageArea(center, profile)
      if (profile.fireKind === 'burn') {
        this.burnZones.push({
          x: center.x,
          y: center.y,
          radius: profile.splashRadius,
          damage: profile.burnDamage,
          life: profile.burnDuration,
          maxLife: profile.burnDuration,
          tick: 0,
        })
      }
    } else if (profile.fireKind === 'vortex') {
      this._damageArea(center, profile)
      this._applyVortexPull(center, profile)
    } else if (profile.fireKind === 'nova') {
      this._damageArea(center, profile)
      this._applyNovaStun(center, profile)
    } else if (target?.active) {
      this._applyDamage(target, profile.damage, profile)
      if (target.active && ['slow', 'freeze'].includes(profile.fireKind)) this._applySlow(target, profile)
    }
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
      enemy.freezeTimer = Math.max(enemy.freezeTimer || 0, (profile.stunDuration || .3) * (enemy.boss ? .3 : 1 - (enemy.slowResistance || 0)))
    }
  }

  _damageArea(center, profile) {
    const radiusSquared = (profile.splashRadius || .14) ** 2
    const victims = this.enemies.filter(enemy => enemy.active && distanceSquared(enemy, center) <= radiusSquared)
      .sort((a, b) => distanceSquared(a, center) - distanceSquared(b, center)).slice(0, profile.splashTargets || 6)
    for (const enemy of victims) {
      const falloff = profile.fireKind === 'splash' || profile.fireKind === 'burn' ? Math.max(.4, 1 - Math.sqrt(distanceSquared(enemy, center) / radiusSquared) * .6) : 1
      this._applyDamage(enemy, profile.damage * falloff, profile)
    }
  }

  _fireChain(target, profile) {
    const visited = new Set()
    let current = target
    for (let jump = 0; current && jump < (profile.chainCount || 1); jump++) {
      visited.add(current.id)
      this._applyDamage(current, profile.damage * ((profile.chainScale ?? .72) ** jump), profile)
      if (current.active) {
        this._applySlow(current, profile)
        if (profile.stunDuration) {
          current.freezeTimer = Math.max(current.freezeTimer || 0, profile.stunDuration * (current.boss ? .3 : 1 - (current.slowResistance || 0)))
          current.silenceTimer = Math.max(current.silenceTimer || 0, profile.stunDuration)
        }
      }
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
          travelDuration: 0,
          impactDuration: 0.16,
          impacted: true,
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

    let remaining = amount * (enemy.markTimer > 0 ? 1 + (enemy.vulnerability || 0) : 1)
    const shieldBefore = Math.max(0, enemy.shield || 0)
    if (shieldBefore > 0 && !profile.shieldBypass) {
      result.absorbedShield = Math.min(shieldBefore, remaining)
      enemy.shield = shieldBefore - result.absorbedShield
      remaining -= result.absorbedShield
      enemy.shieldFlash = 0.22
      result.shieldBroken = shieldBefore > 0 && enemy.shield <= 0
    }

    if (remaining > 0) {
      const armor = clamp((enemy.armor || 0) - (enemy.corrosionTimer > 0 ? enemy.corrosion || 0 : 0), 0, 0.85)
      const pierce = clamp(profile.armorPierce || 0, 0, 1)
      const reduced = remaining * (1 - armor * (1 - pierce))
      result.hpDamage = Math.min(Math.max(0, enemy.hp), reduced)
      enemy.hp -= reduced
    }
    enemy.hitFlash = 0.12

    if (enemy.boss && enemy.bossPhase === 1 && enemy.hp > 0 && enemy.hp <= enemy.maxHp * 0.5) {
      this._activateBossPhase(enemy)
    }
    if (enemy.hp > 0 && enemy.broodThresholds) {
      while ((enemy.broodThresholdIndex || 0) < enemy.broodThresholds.length && enemy.hp / enemy.maxHp <= enemy.broodThresholds[enemy.broodThresholdIndex || 0]) {
        enemy.broodThresholdIndex = (enemy.broodThresholdIndex || 0) + 1
        this._spawnSplitChildren({ ...enemy, splitCount: 2 })
      }
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
    const chapter = boss.bossChapter || 1
    if (chapter === 1) { boss.armor = .65; boss.regeneration = .008 }
    if (chapter === 2) { boss.wardRadius = .22; boss.wardAmount = 30; boss.sprint = true }
    if (chapter === 3) { boss.berserk = true; boss.splitCount = 8 }
    if (chapter === 4) { boss.empPulse = { interval: 5, radius: .25, duration: 1.2 }; boss.empTimer = 1 }
    if (chapter === 5) { boss.wardRadius = .22; boss.wardAmount = 25; boss.empPulse = { interval: 6, radius: .25, duration: 1.2 }; boss.empTimer = 2 }
    this._feedback(`首领进入第二阶段：${['重甲再生', '晶盾冲锋', '熔血裂殖', '电磁压制', '王庭协同'][chapter - 1]}`, 'danger')
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
    this._updateShots(step)
    this._updateTowers(step)
    this._removeDefeatedEnemies()

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
      for (const key of ['corrosionTimer', 'markTimer', 'silenceTimer', 'rootImmunity']) enemy[key] = Math.max(0, (enemy[key] || 0) - dt)
      if (enemy.corrosionTimer > 0) this._applyDamage(enemy, (enemy.poisonDps || 0) * dt, { armorPierce: 1 })
      else { enemy.corrosion = 0; enemy.poisonDps = 0 }
      if (enemy.markTimer === 0) enemy.vulnerability = 0
      if (!enemy.active) continue
      if (enemy.regeneration && enemy.silenceTimer === 0 && enemy.corrosionTimer === 0) enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.maxHp * enemy.regeneration * dt)
      enemy.age = (enemy.age || 0) + dt
      if (enemy.wardRadius && enemy.silenceTimer === 0 && !(enemy.freezeTimer > 0)) {
        enemy.wardTimer = (enemy.wardTimer ?? 2) - dt
        if (enemy.wardTimer <= 0) {
          enemy.wardTimer = 2.5
          for (const ally of this.enemies) {
            if (!ally.active || ally === enemy || distanceSquared(ally, enemy) > enemy.wardRadius ** 2) continue
            const cap = (ally.maxShield || 0) + enemy.wardAmount * 2
            ally.shield = Math.min(cap, (ally.shield || 0) + enemy.wardAmount)
            ally.shieldFlash = .3
          }
        }
      }
      enemy.slowTimer = Math.max(0, (enemy.slowTimer || 0) - dt)
      enemy.freezeTimer = Math.max(0, (enemy.freezeTimer || 0) - dt)
      enemy.frostStackTimer = Math.max(0, (enemy.frostStackTimer || 0) - dt)
      enemy.speedBoostTimer = Math.max(0, (enemy.speedBoostTimer || 0) - dt)
      enemy.hitFlash = Math.max(0, (enemy.hitFlash || 0) - dt * 7)
      enemy.shieldFlash = Math.max(0, (enemy.shieldFlash || 0) - dt * 5)
      enemy.supportFlash = Math.max(0, (enemy.supportFlash || 0) - dt * 3)
      if (enemy.frostStackTimer === 0) enemy.frostStacks = 0

      if ((enemy.supportRadius || 0) > 0 && !enemy.silenceTimer && !enemy.freezeTimer) this._updateSupportEnemy(enemy, dt)
      if ((enemy.empPulse || 0) && enemy.active && !enemy.silenceTimer && !enemy.freezeTimer) {
        enemy.empTimer = (enemy.empTimer ?? enemy.empPulse.interval) - dt
        enemy.empFlash = Math.max(0, (enemy.empFlash || 0) - dt * 2)
        if (enemy.empTimer <= 0) {
          enemy.empTimer = enemy.empPulse.interval
          this._triggerEmpPulse(enemy)
        }
      }
      if (!enemy.active) continue

      const resistedSlow = (enemy.slowRatio || 0) * (1 - clamp(enemy.slowResistance || 0, 0, 0.9))
      const slowSpeed = enemy.slowTimer > 0 ? 1 - resistedSlow : 1
      const boostSpeed = (enemy.speedBoostTimer > 0 ? 1.18 : 1) * (enemy.sprint && enemy.age % 4 < 1 ? 1.7 : 1) * (enemy.berserk && enemy.hp <= enemy.maxHp * .5 ? 1.65 : 1)
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
      this._waveLeaked++
      this._waveLeakDamage += enemy.damage || 1
      this.baseHp = Math.max(0, this.baseHp - (enemy.damage || 1))
      if (this.baseHp <= 0) {
        this._removeDefeatedEnemies()
        this._finish('defeat')
        return
      }
    }
    this._removeDefeatedEnemies()
  }

  /** 电磁傀儡脉冲：瘫痪范围内守卫数秒 */
  _triggerEmpPulse(enemy) {
    const radiusSq = enemy.empPulse.radius ** 2
    let disabled = 0
    const slots = this.buildSlots || []
    for (const tower of this.towers) {
      const pos = slots[tower.slotIndex]
      if (!pos) continue
      if (distanceSquared(pos, enemy) <= radiusSq) {
        tower.disabledTimer = Math.max(tower.disabledTimer || 0, enemy.empPulse.duration)
        disabled++
      }
    }
    enemy.empFlash = 0.6
    if (disabled > 0) this._feedback(`⚡ 电磁脉冲！${disabled} 座守卫瘫痪 ${enemy.empPulse.duration} 秒！`, 'danger')
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
      tower.relocateCooldown = Math.max(0, (tower.relocateCooldown || 0) - dt)

      if (tower.leapAnim) {
        tower.leapAnim.progress += dt / tower.leapAnim.duration
        if (tower.leapAnim.progress >= 1) {
          tower.leapAnim = null
        }
      }

      // EMP 瘫痪：计时走但不开火
      if ((tower.disabledTimer || 0) > 0) {
        tower.disabledTimer = Math.max(0, tower.disabledTimer - dt)
        continue
      }

      if (tower.cooldown > 0) continue

      const stats = getTowerStats(tower.typeId, tower.level, tower.branchId, tower.slotIndex, this.buildSlots)
      const range = stats.range
      const target = this._findTarget(tower, range)
      if (!target) continue

      let aura = 0
      for (const ally of this.towers) {
        if (ally === tower || ally.disabledTimer > 0) continue
        const other = getTowerStats(ally.typeId, ally.level, ally.branchId, ally.slotIndex, this.buildSlots)
        if (other.auraSpeedBoost && distanceSquared(this.buildSlots[tower.slotIndex], this.buildSlots[ally.slotIndex]) <= other.auraRadius ** 2) aura = Math.max(aura, other.auraSpeedBoost)
      }
      const feverMult = (tower.feverTimer > 0 ? 1 / 1.6 : 1) / (1 + aura)
      tower.cooldown = (stats.fireInterval * feverMult)
      this._fireTower(tower, target, stats)
    }
  }

  _updateShots(dt) {
    for (const shot of this.shots) {
      shot.life -= dt
      if (shot.impacted || !shot.target) continue
      // 跟随目标的实际位置，命中后固定落点，让特效与伤害共用同一时刻。
      shot.to = { x: shot.target.x, y: shot.target.y }
      if (shot.life > shot.impactDuration + 1e-9) continue
      shot.impacted = true
      this._resolveShotImpact(shot)
      shot.target = null
    }
    this.shots = this.shots.filter((shot) => shot.life > 0)
  }

  _finish(outcome) {
    if (this._finishSent) return
    this._finishSent = true
    this.state = 'finished'
    this.outcome = outcome
    this._unbindHotkeys()
    if (this.isEndless) {
      // 无尽模式：只记录最高波次，不推进战役进度
      const waveReached = Math.max(0, this.director.completedWaves)
      this.endlessResult = recordEndlessWave(waveReached)
      if (outcome === 'victory') {
        this.score += this.baseHp * 100 + this.gold * 2
        this.game?.sound?.levelUp?.()
        this._feedback(`♾️ 无尽试炼达成 ${waveReached} 波，防线坚守成功！`, 'success')
      } else {
        this.game?.sound?.gameOver?.()
        this._feedback(`💀 无尽试炼止步第 ${waveReached} 波${this.endlessResult?.isNewRecord ? '（新纪录！）' : `（最佳 ${this.endlessResult?.best ?? 0} 波）`}`, 'danger')
      }
    } else if (outcome === 'victory') {
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
    this.renderer.ensureLayout()
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
    const status = this.waitingForFirstTower ? '点击路边的 ＋ 召唤守卫，准备好后敌人才会出发'
      : this.director.phase === 'intermission'
      ? `${this.director.waveIndex < 0 ? '部署准备' : '整备阶段'}：${Math.ceil(Math.max(0, this.director.timer))} 秒`
      : this.director.phase === 'waiting'
        ? '清除剩余来袭单位'
        : this.director.phase === 'complete'
          ? '所有波次已完成'
          : '敌军正在进入防线'
    const currentSlots = this.buildSlots || TOWER_DEFENSE_BUILD_SLOTS
    return {
      mode: 'tower-defense',
      introductory: this.introductory,
      progression: this.progression,
      waitingForFirstTower: this.waitingForFirstTower,
      stageId: this.currentStageId || 1,
      miniBoss: this.stageConfig.miniBoss,
      tactic: this.stageConfig.tactic,
      assault: this.stageConfig.assault,
      stageName: this.isEndless
        ? `无尽试炼 · ${this.stageConfig?.chapterName || '母巢防线'}`
        : (this.stageConfig?.name || '第 1-1 关 · 母巢防线'),
      chapterId: this.stageConfig?.chapterId || 1,
      chapterName: this.stageConfig?.chapterName || '纯净母巢',
      theme: this.stageConfig?.theme || null,
      clearResult: this.clearResult,
      isEndless: this.isEndless,
      state: this.state,
      stateLabel: this.director.phase === 'intermission' ? (this.director.waveIndex < 0 ? '部署准备' : '波间整备') : '防守进行中',
      outcome: this.outcome,
      elapsed: this.elapsedTime,
      timeLabel,
      gameSpeed: this.gameSpeed,
      baseHp: this.baseHp,
      maxBaseHp: this.maxBaseHp,
      lives: this.baseHp,
      maxLives: this.maxBaseHp,
      gold: this.gold,
      wave: Math.max(0, this.director.waveIndex + 1),
      totalWaves: this.isEndless ? '∞' : totalWavesCount,
      completedWaves: this.director.completedWaves,
      earlyCallBonus: this._computeEarlyCallBonus(),
      lastWaveReport: this.lastWaveReport,
      waveProgress,
      status,
      phase: this.director.phase,
      nextWaveIn: this.director.phase === 'intermission' ? Math.max(0, this.director.timer) : 0,
      currentWaveComposition: getWaveCompositionFromWaves(this.director.waves, previewWaveIndex),
      currentWavePacing: this.director.waves?.[previewWaveIndex]?.pacing || null,
      nextWavePreview: getWaveCompositionFromWaves(this.director.waves, nextWaveIndex),
      nextWavePacing: this.director.waves?.[nextWaveIndex]?.pacing || null,
      baseDamagePreview: getWaveBaseDamage(previewWaveIndex, this.director.waves),
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
        anchor: this.game ? (() => {
          const point = this.renderer.project(currentSlots[this.selectedSlotIndex])
          return {
            x: point.x / this.game.width,
            y: point.y / this.game.height,
            radiusX: Math.max(34, this.renderer.unit * 1.22) / this.game.width,
            radiusY: Math.max(34, this.renderer.unit * 1.22) / this.game.height,
          }
        })() : null,
        occupied: !!selected,
        isLocked: !this.unlockedSlots.has(this.selectedSlotIndex),
        lockCost: currentSlots[this.selectedSlotIndex]?.cost || 40,
        lockReward: 0,
        leyline: !this.progression.leylines ? null : getSlotLeylineResonance(this.selectedSlotIndex, selected?.typeId || this.selectedTowerTypeId, currentSlots),
      } : null,
      tutorial: this.tutorial,
      towerTypes: TOWER_TYPE_LIST.filter(type => !this.progression.restrictTowerRoster || this.canUseTower(type.id)).map((type) => {
        const unlocked = this.canUseTower(type.id)
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
          resonance: !this.progression.leylines || this.selectedSlotIndex < 0 ? null
            : getSlotLeylineResonance(this.selectedSlotIndex, type.id, currentSlots),
        }
      }),
      selectedTower: selected ? this._getTowerSnapshot(selected) : null,
      buildSlots: currentSlots.map((slot, slotIndex) => ({
        slotIndex,
        occupied: !!this.getTowerAtSlot(slotIndex),
        isLocked: !this.unlockedSlots.has(slotIndex),
        leyline: !this.progression.leylines ? null : getSlotLeylineResonance(slotIndex, this.getTowerAtSlot(slotIndex)?.typeId, currentSlots),
      })),
    }
  }

  _getTowerSnapshot(tower) {
    const type = TOWER_DEFENSE_TOWER_TYPES[tower.typeId]
    const upgradeCost = tower.level >= this.progression.maxTowerLevel ? null : getTowerUpgradeCost(tower)
    const branch = tower.branchId ? type.branches[tower.branchId] : null
    // Preview and current values share the same calculation, including the slot's resonance.
    const combatSnapshot = (level) => {
      const stats = getTowerStats(tower.typeId, level, tower.branchId, tower.slotIndex, this.buildSlots)
      const burstMultiplier = stats.fireKind === 'burst'
        ? 1 + ((stats.burst || 1) - 1) * (stats.burstScale || 1)
        : 1
      return {
        damage: stats.damage,
        range: this.getTowerRange(tower.typeId, level, tower.branchId, tower.slotIndex),
        fireInterval: stats.fireInterval,
        attackSpeed: 1 / stats.fireInterval,
        dps: stats.damage * burstMultiplier / stats.fireInterval,
        effectText: this._getEffectText(stats),
      }
    }
    const resonance = getSlotLeylineResonance(tower.slotIndex, tower.typeId, this.buildSlots)
    return {
      slotIndex: tower.slotIndex,
      typeId: tower.typeId,
      name: type.name,
      color: type.color,
      level: tower.level,
      maxLevel: this.progression.maxTowerLevel,
      ...combatSnapshot(tower.level),
      upgradePreview: upgradeCost !== null && (tower.level !== 2 || !!tower.branchId)
        ? combatSnapshot(tower.level + 1) : null,
      targetStrategy: TOWER_DEFENSE_TARGET_STRATEGIES.find(({ id }) => id === tower.targetStrategy),
      targetStrategies: this.progression.targeting ? TOWER_DEFENSE_TARGET_STRATEGIES : [],
      branch: branch ? { id: branch.id, name: branch.name, description: branch.description } : null,
      branchOptions: this.progression.branches && tower.level >= 2 ? getTowerBranchOptions(tower.typeId) : [],
      upgradeCost,
      canUpgrade: upgradeCost !== null && this.gold >= upgradeCost && (tower.level !== 2 || !!tower.branchId),
      sellValue: getTowerSellValue(tower),
      canSell: this.state === 'active',
      resonance,
      relocateCooldown: Math.ceil(tower.relocateCooldown || 0),
      relocationUnlocked: this.progression.relocation,
      canRelocate: this.progression.relocation && (tower.relocateCooldown || 0) <= 0,
      feverActive: (tower.feverTimer || 0) > 0,
    }
  }

  _getEffectText(stats) {
    if (stats.fireKind === 'corrode') return `削甲 ${Math.round(stats.corrosion * 100)}%，毒蚀 ${stats.poisonDps}/秒，抑制再生`
    if (stats.fireKind === 'root') return `缠绕 ${stats.rootDuration} 秒；挣脱后 3 秒免疫再次缠绕`
    if (stats.fireKind === 'mark') return `显露隐匿，标记增伤 ${Math.round(stats.vulnerability * 100)}%${stats.silenceDuration ? '，打断特殊技能' : ''}`
    if (stats.fireKind === 'piercing') return `直线贯穿 ${stats.pierceCount} 个敌人；近身盲区 ${stats.minRange.toFixed(2)}`
    if (stats.fireKind === 'chain_shock') return `连锁 ${stats.chainCount} 个目标，逐跳衰减，短暂打断`
    if (stats.auraSpeedBoost) return `邻塔攻速 +${Math.round(stats.auraSpeedBoost * 100)}%，同类光环不叠加`
    if (stats.shieldBypass) return '无视护甲与护盾的单体伤害'
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
      title: this.isEndless
        ? (this.outcome === 'victory' ? '无尽试炼·通关' : '无尽试炼·终局')
        : (this.outcome === 'victory' ? '防线守卫成功' : '基地防线失守'),
      isEndless: this.isEndless,
      endlessWave: this.director.completedWaves,
      endlessBest: this.endlessResult?.best ?? null,
      elapsed: this.elapsedTime,
      wave: Math.max(0, this.director.waveIndex + 1),
      completedWaves: this.director.completedWaves,
      totalWaves: this.director.waves?.length || TOWER_DEFENSE_WAVE_COUNT,
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
      this.selectSlot(slotIndex)
    } else {
      this.selectSlot(-1)
    }
  }

  _handlePointerMove(event) {
    const point = this._eventPosition(event)
    if (!point) {
      this.hoveredSlotIndex = -1
      this.hoveredTrapId = null
      this.hoveredEnemyId = null
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

    // 敌人悬停（特质说明用）：就近命中
    let hoveredEnemyId = null
    let bestDistSq = (Math.max(18, this.renderer.unit * 0.85)) ** 2
    for (const enemy of this.enemies) {
      if (!enemy.active) continue
      const enemyPoint = this.renderer.project(enemy)
      const distSq = (point.x - enemyPoint.x) ** 2 + (point.y - enemyPoint.y) ** 2
      if (distSq <= bestDistSq) {
        bestDistSq = distSq
        hoveredEnemyId = enemy.id
      }
    }
    this.hoveredEnemyId = hoveredEnemyId
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

  _computeEarlyCallBonus() {
    if (this.waitingForFirstTower) return 0
    if (this.state !== 'active' || this.director.phase !== 'intermission') return 0
    const wait = Math.ceil(Math.max(0, this.director.timer))
    if (wait <= 0) return 0
    return Math.round(wait * 2)
  }

  _unbindCanvas() {
    this._canvas?.removeEventListener?.('pointerdown', this._onPointerDown)
    this._canvas?.removeEventListener?.('pointermove', this._onPointerMove)
    this._canvas = null
  }

  destroy() {
    this._unbindCanvas()
    this._unbindHotkeys()
    this.renderer.destroy()
    this.enemies.length = 0
    this.towers.length = 0
    this.shots.length = 0
    this.burnZones.length = 0
    super.destroy()
  }
}

export { TOWER_DEFENSE_TOWER_TYPES }
