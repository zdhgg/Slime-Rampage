import { createCampaignSave, sanitizeCampaign } from '../src/game/AccountRules.js'

export function accountGameData(db, userId) {
  const row = db.prepare('SELECT data_json FROM account_game_data WHERE user_id = ?').get(userId)
  const data = row ? JSON.parse(row.data_json) : {}
  return { campaign: sanitizeCampaign(data.campaign), records: data.records || {} }
}

export function writeAccountGameData(db, userId, data) {
  db.prepare(`INSERT INTO account_game_data(user_id, data_json) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET data_json = excluded.data_json`)
    .run(userId, JSON.stringify(data))
}

export function mergeLegacyCampaign(db, userId, source) {
  const data = accountGameData(db, userId)
  const legacy = sanitizeCampaign(source || createCampaignSave())
  data.campaign = sanitizeCampaign({
    ...data.campaign,
    unlockedStage: Math.max(data.campaign.unlockedStage, legacy.unlockedStage),
    stageStars: Object.fromEntries(Array.from({ length: 99 }, (_, i) => [i + 1,
      Math.max(data.campaign.stageStars[i + 1] || 0, legacy.stageStars[i + 1] || 0)])),
    tutorialCompleted: data.campaign.tutorialCompleted || legacy.tutorialCompleted,
    endlessBestWave: Math.max(data.campaign.endlessBestWave, legacy.endlessBestWave),
  })
  writeAccountGameData(db, userId, data)
  return data
}
