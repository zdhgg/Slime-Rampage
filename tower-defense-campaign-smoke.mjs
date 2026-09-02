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

console.log('=== All Tower Defense Campaign Smoke Tests Passed! ===')
