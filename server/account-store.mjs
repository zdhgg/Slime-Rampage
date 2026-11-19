import { ACCOUNT_MODES, boundedInt, createCampaignSave, sanitizeCampaign } from '../src/game/AccountRules.js'
import { accountState, touchAccount } from './save-state.mjs'

export function accountGameData(db, userId) {
  const row = db.prepare('SELECT data_json FROM account_game_data WHERE user_id = ?').get(userId)
  let data = {}
  let recovered = false
  if (row) {
    const read = raw => {
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
        || !parsed.campaign || typeof parsed.campaign !== 'object' || Array.isArray(parsed.campaign)
        || !parsed.records || typeof parsed.records !== 'object' || Array.isArray(parsed.records)) throw new Error('invalid account save')
      return parsed
    }
    try { data = read(row.data_json) }
    catch {
      recovered = true
      data = null
      for (const snapshot of db.prepare("SELECT payload FROM save_history WHERE user_id = ? AND kind = 'account-data' ORDER BY id DESC").all(userId)) {
        try { data = read(snapshot.payload); break } catch { /* Try an older copy. */ }
      }
      if (!data) throw Object.assign(new Error('账号进度损坏，原始数据已保留，请管理员恢复备份'), { status: 409, code: 'save_damaged' })
    }
  }
  const state = accountState(db, userId)
  return { campaign: sanitizeCampaign(data.campaign), records: data.records || {},
    accountId: Number(userId), accountRevision: Number(state?.revision) || 1,
    saveEpoch: state?.save_epoch || '', savedAt: state?.saved_at || '',
    recoveryNotice: recovered ? '账号进度异常，已读取上一份有效副本；损坏原文已保留。' : '' }
}

function sanitizeRecordEntry(value) {
  if (!value || typeof value !== 'object') return null
  return {
    gameplay: String(value.gameplay || '').slice(0, 20),
    mode: String(value.mode || '').slice(0, 20),
    difficulty: 'standard',
    result: ['victory', 'defeat'].includes(value.result) ? value.result : 'defeat',
    score: boundedInt(value.score, 0, 1e9),
    time: boundedInt(value.time, 0, 86400),
    kills: boundedInt(value.kills, 0, 1e7),
    stage: boundedInt(value.stage, 0, 99),
    wave: boundedInt(value.wave, 0, 100000),
    stars: boundedInt(value.stars, 0, 3),
    distance: boundedInt(value.distance, 0, 1e9),
  }
}

/** 账号战绩汇总只认已知玩法/模式键，避免备份导入塞入任意字段。 */
export function sanitizeAccountRecords(source) {
  const records = {}
  if (!source || typeof source !== 'object') return records
  for (const [key, value] of Object.entries(source)) {
    const [gameplay, mode] = String(key).split(':')
    if (!ACCOUNT_MODES[gameplay]?.[mode] || !value || typeof value !== 'object') continue
    const clean = { plays: boundedInt(value.plays, 0, 1000000) }
    const best = sanitizeRecordEntry(value.best)
    const last = sanitizeRecordEntry(value.last)
    if (best) clean.best = best
    if (last) clean.last = last
    records[key] = clean
  }
  return records
}

export function writeAccountGameData(db, userId, data) {
  const previous = db.prepare('SELECT data_json FROM account_game_data WHERE user_id = ?').get(userId)
  if (previous) {
    db.prepare("INSERT INTO save_history(user_id, kind, payload, created_at) VALUES (?, 'account-data', ?, ?)")
      .run(userId, previous.data_json, new Date().toISOString())
    db.prepare("DELETE FROM save_history WHERE user_id = ? AND kind = 'account-data' AND id NOT IN (SELECT id FROM save_history WHERE user_id = ? AND kind = 'account-data' ORDER BY id DESC LIMIT 10)")
      .run(userId, userId)
  }
  db.prepare(`INSERT INTO account_game_data(user_id, data_json) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET data_json = excluded.data_json`)
    .run(userId, JSON.stringify({ campaign: data.campaign, records: data.records }))
  touchAccount(db, userId)
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
  return accountGameData(db, userId)
}
