import { randomUUID } from 'node:crypto'
import { applyCampaignClear, boundedInt, compareAccountEntries } from '../src/game/AccountRules.js'
import { RUNNER_SUBMODES } from '../src/game/gameplay/runner/RunnerRules.js'
import { getStageConfig } from '../src/game/gameplay/tower-defense/TowerDefenseCampaignRules.js'
import { accountGameData, writeAccountGameData } from './account-store.mjs'

function reject(message) {
  throw Object.assign(new Error(message), { status: 422, code: 'implausible_run' })
}

export function finishGameplayRun(db, userId, ticket, raw) {
  if (!raw || !['victory', 'defeat'].includes(raw.outcome)) reject('本局结果无效')
  const elapsed = Number(raw.elapsed)
  const kills = Number(raw.kills)
  const score = Number(raw.score)
  const speed = ticket.gameplay === 'tower-defense' ? 3 : 1
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 86400 ||
    elapsed > ((Date.now() - ticket.issued_at) / 1000 + 15) * speed) reject('本局计时超出合理范围')
  if (!Number.isInteger(kills) || kills < 0 || kills > elapsed * 100 + 200 ||
    !Number.isFinite(score) || score < 0 || score > elapsed * 100000 + 10000) reject('本局得分或击杀超出合理范围')

  const data = accountGameData(db, userId)
  let wave = 0
  let stars = 0
  if (ticket.gameplay === 'runner') {
    const duration = RUNNER_SUBMODES[ticket.mode].duration
    if (Number.isFinite(duration) && elapsed > duration + 1) reject('突围用时超过模式上限')
    // 首领可提前击破，通关并不要求耗尽模式时长。
    if (duration === Infinity && raw.outcome === 'victory') reject('无尽突围不存在通关结算')
  } else {
    const config = getStageConfig(ticket.stage_id)
    const hp = Number(raw.baseHp)
    const maxHp = config.baseHp || 20
    wave = Number(raw.completedWaves)
    if (!Number.isInteger(wave) || wave < 0 || wave > elapsed * 2 + 1 ||
      !Number.isFinite(hp) || hp < 0 || hp > maxHp) reject('塔防波次或巢心耐久无效')
    if (ticket.mode === 'campaign') {
      if (wave > config.waves.length) reject('塔防波次超过关卡上限')
      if (raw.outcome === 'victory') {
        if (wave !== config.waves.length || hp <= 0) reject('当前关卡尚未完成')
        const clear = applyCampaignClear(data.campaign, ticket.stage_id, hp, maxHp)
        data.campaign = clear.save
        stars = clear.stars
      }
    } else {
      if (raw.outcome === 'victory') reject('无尽试炼不存在通关结算')
      data.campaign.endlessBestWave = Math.max(data.campaign.endlessBestWave, wave)
    }
  }
  const entry = {
    gameplay: ticket.gameplay, mode: ticket.mode, difficulty: 'standard',
    result: raw.outcome, score: Math.round(score), time: Math.round(elapsed), kills,
    stage: ticket.stage_id, wave, stars,
    distance: ticket.gameplay === 'runner' && ticket.mode === 'endless' ? Math.floor(elapsed * 85) : 0,
  }
  const key = `${ticket.gameplay}:${ticket.mode}`
  const record = data.records[key] || { plays: 0, best: null }
  const isNewRecord = !record.best || compareAccountEntries(entry, record.best, ticket.gameplay, ticket.mode) < 0
  record.plays += 1
  if (isNewRecord) record.best = entry
  record.last = entry
  data.records[key] = record
  writeAccountGameData(db, userId, data)
  const result = { runId: randomUUID(), entry, score: entry.score, isNewRecord, stars }
  db.prepare(`INSERT INTO runs(
    id, ticket_id, user_id, profile_id, mode, difficulty, result, stage, wave, kills,
    elapsed, finale_time, devours, elite_kills, boss_kills, events_completed, species,
    score, score_version, breakdown_json, result_json, submitted_at, gameplay
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, '', ?, 1, '{}', ?, ?, ?)`)
    .run(result.runId, ticket.id, userId, ticket.profile_id, ticket.mode, 'standard', raw.outcome,
      entry.stage, wave, kills, entry.time, entry.score, JSON.stringify(result), new Date().toISOString(), ticket.gameplay)
  db.prepare('UPDATE run_tickets SET completed_at = ? WHERE id = ?').run(Date.now(), ticket.id)
  return result
}
