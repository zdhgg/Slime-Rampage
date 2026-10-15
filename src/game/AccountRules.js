import { MODE_IDS, DIFFICULTY_IDS } from './RunRules.js'
import { CAMPAIGN_TOWER_UNLOCKS } from './gameplay/tower-defense/TowerDefenseContent.js'

export const GAMEPLAY_NAMES = { arena: '主战场', runner: '突围', 'tower-defense': '塔防' }
export const ACCOUNT_MODES = {
  runner: { blitz: '极速闪击', marathon: '决战远征', endless: '无尽突围' },
  'tower-defense': { campaign: '战役', endless: '无尽试炼' },
}
export const boundedInt = (value, min, max, fallback = min) =>
  Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Math.round(Number(value)))) : fallback

export function validBoardSelection({ gameplay = 'arena', mode, difficulty } = {}) {
  return gameplay === 'arena'
    ? MODE_IDS.includes(mode) && DIFFICULTY_IDS.includes(difficulty)
    : !!ACCOUNT_MODES[gameplay]?.[mode] && difficulty === 'standard'
}

export function createCampaignSave() {
  return {
    unlockedStage: 1, stageStars: {}, claimedChests: [], unlockedTowers: ['rapid', 'slow'],
    tutorialCompleted: false, endlessBestWave: 0, totalStarsEarned: 0,
  }
}

export function sanitizeCampaign(source) {
  const save = createCampaignSave()
  save.unlockedStage = boundedInt(source?.unlockedStage, 1, 99)
  for (let stage = 1; stage <= 99; stage++) {
    const stars = boundedInt(source?.stageStars?.[stage], 0, 3)
    if (stars) {
      save.stageStars[stage] = stars
      save.totalStarsEarned += stars
      save.unlockedStage = Math.max(save.unlockedStage, Math.min(99, stage + 1))
    }
  }
  save.tutorialCompleted = !!source?.tutorialCompleted
  save.endlessBestWave = boundedInt(source?.endlessBestWave, 0, 100000)
  save.claimedChests = [...new Set((Array.isArray(source?.claimedChests) ? source.claimedChests : [])
    .filter((stage) => Number.isInteger(stage) && stage > 0 && stage <= save.unlockedStage))]
  for (const [tower, stage] of Object.entries(CAMPAIGN_TOWER_UNLOCKS)) {
    if (save.unlockedStage >= stage && !save.unlockedTowers.includes(tower)) save.unlockedTowers.push(tower)
  }
  return save
}

export function applyCampaignClear(source, stageId, hp, maxHp) {
  const save = sanitizeCampaign(source)
  const stage = boundedInt(stageId, 1, 99)
  const ratio = Math.max(0, Number(hp) || 0) / Math.max(1, Number(maxHp) || 20)
  const stars = ratio >= 0.999 ? 3 : ratio >= 0.799 ? 2 : 1
  const previous = save.stageStars[stage] || 0
  save.stageStars[stage] = Math.max(previous, stars)
  save.unlockedStage = Math.max(save.unlockedStage, Math.min(99, stage + 1))
  if (stage === 1) save.tutorialCompleted = true
  return { save: sanitizeCampaign(save), stars, isNewRecord: stars > previous }
}

export function compareAccountEntries(a, b, gameplay, mode) {
  if (gameplay === 'tower-defense') {
    const progress = mode === 'campaign' ? b.stage - a.stage : b.wave - a.wave
    if (progress) return progress
  }
  return b.score - a.score || a.time - b.time
}
