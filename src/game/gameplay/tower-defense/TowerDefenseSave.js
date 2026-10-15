import { createCampaignSave, sanitizeCampaign, applyCampaignClear, boundedInt } from '../../AccountRules.js'

// 旧键只用于明确迁移；账号会话使用服务器快照，绝不写回共享本机进度。
const STORAGE_KEY = 'slime_rampage_td_campaign_save_v2'
let accountCampaign = null
let tutorialCallback = null
export const createDefaultSave = createCampaignSave

export function setAccountCampaign(save, onTutorialComplete = null) {
  accountCampaign = save == null ? null : sanitizeCampaign(save)
  tutorialCallback = onTutorialComplete
}

export function loadLegacyCampaign() {
  try {
    return sanitizeCampaign(JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) || 'null'))
  } catch { return createDefaultSave() }
}

export function loadCampaignSave() {
  return accountCampaign ? sanitizeCampaign(accountCampaign) : loadLegacyCampaign()
}

export function saveCampaignProgress(saveData) {
  if (!saveData) return
  const clean = sanitizeCampaign(saveData)
  if (accountCampaign) {
    accountCampaign = clean
    return
  }
  try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(clean)) }
  catch (error) { console.warn('[TowerDefenseSave] save failed', error) }
}

export function recordStageClear(stageId, hp, maxHp = 20) {
  const clear = applyCampaignClear(loadCampaignSave(), stageId, hp, maxHp)
  saveCampaignProgress(clear.save)
  return {
    stars: clear.stars, isNewRecord: clear.isNewRecord, unlockedNext: clear.save.unlockedStage,
    unlockedTowers: clear.save.unlockedTowers, totalStars: clear.save.totalStarsEarned,
  }
}

export function completeTutorial() {
  const save = loadCampaignSave()
  save.tutorialCompleted = true
  saveCampaignProgress(save)
  tutorialCallback?.()
  return save
}

export function recordEndlessWave(waveReached) {
  const save = loadCampaignSave()
  const previous = save.endlessBestWave
  save.endlessBestWave = Math.max(previous, boundedInt(waveReached, 0, 100000))
  saveCampaignProgress(save)
  return { best: save.endlessBestWave, isNewRecord: save.endlessBestWave > previous }
}
