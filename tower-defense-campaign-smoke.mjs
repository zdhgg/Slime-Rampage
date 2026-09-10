import assert from 'node:assert/strict'
import { CHAPTERS_META, TOPOLOGY_PRESETS, GENE_TREE_NODES, getStageConfig } from './src/game/gameplay/tower-defense/TowerDefenseCampaignRules.js'
import { TOWER_DEFENSE_TOWER_TYPES, isTowerUnlocked, TOWER_UNLOCK_MAP } from './src/game/gameplay/tower-defense/TowerDefenseRules.js'
import { loadCampaignSave, recordStageClear, upgradeGeneTalent, resetGeneTalents, getActiveGeneEffects, createDefaultSave } from './src/game/gameplay/tower-defense/TowerDefenseSave.js'
import { TowerDefenseGameplay } from './src/game/gameplay/tower-defense/TowerDefenseGameplay.js'

console.log('=== Running Tower Defense Campaign & Meta Progression Smoke Tests ===')

// 1. Verify Chapters Meta
assert.equal(CHAPTERS_META.length, 5, 'Must have 5 thematic chapters')
assert.deepEqual(CHAPTERS_META[0].stageRange, [1, 20], 'Chapter 1 is 1~20')
assert.deepEqual(CHAPTERS_META[1].stageRange, [21, 40], 'Chapter 2 is 21~40')
assert.deepEqual(CHAPTERS_META[2].stageRange, [41, 60], 'Chapter 3 is 41~60')
assert.deepEqual(CHAPTERS_META[3].stageRange, [61, 80], 'Chapter 4 is 61~80')
assert.deepEqual(CHAPTERS_META[4].stageRange, [81, 99], 'Chapter 5 is 81~99')
console.log('✓ 5 Thematic Chapters verified')

// 2. Verify 6 Slime Tower Types and Progressive Unlocks
assert.equal(Object.keys(TOWER_DEFENSE_TOWER_TYPES).length, 6, 'Must have 6 tower types')
assert.ok(TOWER_DEFENSE_TOWER_TYPES.shock, 'Shock slime exists')
assert.ok(TOWER_DEFENSE_TOWER_TYPES.arcane, 'Arcane slime exists')
assert.ok(TOWER_DEFENSE_TOWER_TYPES.radiant, 'Radiant slime exists')

assert.equal(isTowerUnlocked('rapid', 1), true)
assert.equal(isTowerUnlocked('slow', 1), true)
assert.equal(isTowerUnlocked('blast', 1), false)
assert.equal(isTowerUnlocked('blast', 2), true)
assert.equal(isTowerUnlocked('shock', 1), false)
assert.equal(isTowerUnlocked('shock', 5), true)
assert.equal(isTowerUnlocked('arcane', 21), true)
assert.equal(isTowerUnlocked('radiant', 41), true)
console.log('✓ 6 Slime Tower Types and Progressive Unlocks verified')

// 3. Verify getStageConfig
const stage1 = getStageConfig(1)
assert.equal(stage1.stageId, 1)
assert.equal(stage1.chapterId, 1)
assert.equal(stage1.isBossStage, false)
assert.equal(stage1.waves.length, 4, 'Stage 1 tutorial has 4 gentle waves')

const stage20 = getStageConfig(20)
assert.equal(stage20.stageId, 20)
assert.equal(stage20.isBossStage, true)
assert.equal(stage20.bossName, '重装开路巨像')

const stage40 = getStageConfig(40)
assert.equal(stage40.chapterId, 2)
assert.equal(stage40.isBossStage, true)

const stage99 = getStageConfig(99)
assert.equal(stage99.chapterId, 5)
assert.equal(stage99.isBossStage, true)
assert.equal(stage99.topologyId, 'crossroads')
console.log('✓ getStageConfig for stages 1, 20, 40, 99 verified')

// 4. Verify Gene Tree & Save Logic
const mockSave = createDefaultSave()
assert.equal(mockSave.unlockedStage, 1)
assert.equal(mockSave.totalStarsEarned, 0)
assert.deepEqual(mockSave.unlockedTowers, ['rapid', 'slow'])

// Test Stage Clear calculation
const clearRes = recordStageClear(1, 20, 20)
assert.equal(clearRes.stars, 3, 'Full HP yields 3 stars')
assert.ok(clearRes.unlockedTowers.includes('blast'))

// Test gene effects
const effects = getActiveGeneEffects({
  ...mockSave,
  geneTalents: {
    talent_gold: 2,
    talent_leyline: 1,
    talent_trap_cd: 3,
    talent_pet_morale: 1,
    talent_leap_shield: 0,
  },
})
assert.equal(effects.startingGoldBonus, 60, 'Level 2 gold talent gives +60')
assert.equal(effects.leylineBoostMultiplier, 1.15, 'Level 1 leyline talent gives +15%')
assert.equal(effects.trapCooldownMultiplier, 0.70, 'Level 3 trap cd gives -30%')
console.log('✓ Star scoring and gene tree talent effects verified')

// 5. Verify TowerDefenseGameplay Campaign Integration & Tutorial
const gameplay = new TowerDefenseGameplay()
gameplay.loadStage(1)
assert.equal(gameplay.currentStageId, 1)
assert.ok(gameplay.gold >= 240)
assert.ok(gameplay.buildSlots.length > 0)
assert.ok(gameplay.traps.length === 3)

const hud = gameplay.getHudSnapshot()
assert.equal(hud.stageId, 1)
assert.ok(hud.stageName.includes('第 1-1 关'))
assert.equal(hud.chapterId, 1)
assert.equal(hud.towerTypes.length, 6)

// Test switching to boss stage
gameplay.loadStage(20)
assert.equal(gameplay.currentStageId, 20)
assert.ok(gameplay.stageConfig.isBossStage)
console.log('✓ TowerDefenseGameplay loadStage and HUD snapshot verified')

// 6. Verify Roguelike Mutations and Shiny Traits
import { SLIME_SHINY_TRAITS, TOWER_DEFENSE_MUTATIONS, getRandomMutationChoices } from './src/game/gameplay/tower-defense/TowerDefenseRules.js'
assert.equal(Object.keys(SLIME_SHINY_TRAITS).length, 5, 'Must have 5 shiny traits')
assert.ok(TOWER_DEFENSE_MUTATIONS.length >= 16, 'Must have at least 16 mutation cards')

const choices = getRandomMutationChoices(3, [], ['rapid', 'slow'])
assert.equal(choices.length, 3, 'Must draw 3 random mutation cards')
assert.ok(choices[0].id)
assert.ok(choices[0].name)
assert.ok(choices[0].description)

gameplay.reset()
assert.equal(gameplay.activeMutations.length, 0)
const selectSuccess = gameplay.selectMutation('nutrient_harvest')
assert.equal(selectSuccess, true)
assert.equal(gameplay.hasMutation('nutrient_harvest'), true)
console.log('✓ Roguelike Mutations (3-choice draw & perks) and Shiny Slime Traits verified')

// 7. Verify Extended Gene Tree, Endless Mode, EMP Enemy, Speed & Early-Call
import { generateEndlessWaves, TOWER_DEFENSE_ENDLESS_WAVE_COUNT } from './src/game/gameplay/tower-defense/TowerDefenseCampaignRules.js'
assert.ok(GENE_TREE_NODES.length >= 15, `Gene tree must have at least 15 nodes (got ${GENE_TREE_NODES.length})`)
assert.ok(GENE_TREE_NODES.every((node) => Array.isArray(node.costs) && node.costs.length === node.maxLevel))
assert.equal(GENE_TREE_NODES.length, new Set(GENE_TREE_NODES.map((node) => node.id)).size, 'Talent ids must be unique')

// 天赋效果需能合并进基因效果
const leveledSave = createDefaultSave()
for (const node of GENE_TREE_NODES) leveledSave.geneTalents[node.id] = 1
const mergedEffects = getActiveGeneEffects(leveledSave)
assert.ok(mergedEffects.towerDamageMultiplier > 1)
assert.ok(mergedEffects.towerSpeedMultiplier > 1)
assert.ok(mergedEffects.baseHpBonus > 0)
assert.ok(mergedEffects.interestRate > 0.05)

// 无尽波次生成器：确定性、数量、Boss 节奏、血量爬升
const endlessA = generateEndlessWaves(20)
const endlessB = generateEndlessWaves(20)
assert.deepEqual(endlessA, endlessB, 'Endless waves must be deterministic')
assert.equal(endlessA.length, TOWER_DEFENSE_ENDLESS_WAVE_COUNT)
assert.ok(endlessA[9].groups.some((g) => g.type === 'boss'), 'Wave 10 must be a boss wave')
assert.ok(endlessA[9].groups[0].scale > endlessA[0].groups[0].scale, 'Endless scale must climb')

// 无尽模式启动：地图保留 + 波次替换 + HUD ∞ + 重开保持在无尽
gameplay.startEndlessMode(20)
assert.equal(gameplay.isEndless, true)
assert.equal(gameplay.director.waves.length, TOWER_DEFENSE_ENDLESS_WAVE_COUNT)
const endlessHud = gameplay.getHudSnapshot()
assert.equal(endlessHud.totalWaves, '∞')
assert.ok(endlessHud.stageName.includes('无尽试炼'))
assert.equal(gameplay.reset().isEndless, true, 'Endless restart must stay in endless mode')

// 倍速：1→2→3→1 循环
gameplay.cycleGameSpeed()
gameplay.cycleGameSpeed()
assert.equal(gameplay.gameSpeed, 3)
assert.equal(gameplay.cycleGameSpeed(), 1)

// 提前召唤下一波：整备期可换养分
const goldBeforeCall = gameplay.gold
gameplay.director.timer = 12
assert.equal(gameplay.callNextWaveEarly(), true)
assert.ok(gameplay.gold > goldBeforeCall, 'Early call must grant gold bonus')
assert.equal(gameplay.director.timer, 0)

// 跳过突变：队列消费 + 养分补偿
gameplay.pendingMutationOffers.push(getRandomMutationChoices(3, [], ['rapid', 'slow']))
assert.ok(gameplay.pendingMutationChoices, 'Pending offer must be readable via compat getter')
const goldBeforeSkip = gameplay.gold
assert.equal(gameplay.skipMutationOffer(), true)
assert.equal(gameplay.pendingMutationOffers.length, 0)
assert.ok(gameplay.gold > goldBeforeSkip, 'Skipping a mutation must grant nutrient compensation')

// EMP 电磁傀儡：22+ 关入池，脉冲应瘫痪范围内守卫
const campaignStage25 = getStageConfig(25)
assert.ok(campaignStage25.waves.some((wave) => wave.groups.some((g) => g.type === 'emp')), 'Stage 25+ must field EMP puppets')
gameplay.loadStage(20)
gameplay.attach({
  width: 1280,
  height: 720,
  ctx: { addColorStop() {} },
  canvas: { addEventListener() {}, removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) },
  sound: { shoot() {}, levelUp() {}, gameOver() {} },
  _pushGameplayHud() {},
  finishGameplay() {},
})
gameplay.selectSlot(0)
assert.equal(gameplay.placeTower(0, 'rapid'), true)
// 直接入列以保留自定义坐标（_addEnemy 会把 progress 映射到路径上）
gameplay.enemies.push({
  id: 900001,
  typeId: 'emp',
  name: '电磁傀儡',
  progress: 0,
  hp: 55,
  maxHp: 55,
  speed: 0.045,
  baseSpeed: 0.045,
  reward: 26,
  damage: 2,
  size: 1.05,
  active: true,
  x: gameplay.buildSlots[0].x + 0.01,
  y: gameplay.buildSlots[0].y + 0.01,
  empPulse: { interval: 6.5, duration: 2.5, radius: 0.22 },
  empTimer: 0.01,
  empFlash: 0,
})
gameplay.updateWorld(0.05)
assert.ok(gameplay.towers[0].disabledTimer > 0, 'EMP pulse must disable nearby towers')
gameplay.enemies.length = 0
console.log('✓ Extended gene tree, endless mode, EMP puppets, speed & early-call systems verified')

console.log('=== All Tower Defense Campaign Smoke Tests Passed! ===')
