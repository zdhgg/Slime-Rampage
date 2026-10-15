import { compareEntries } from '../src/game/SaveManager.js'
import { compareAccountEntries, boundedInt } from '../src/game/AccountRules.js'

function runEntry(row) {
  return {
    runId: row.id,
    gameplay: row.gameplay,
    username: row.display_name,
    profile: row.profile_name,
    mode: row.mode,
    difficulty: row.difficulty,
    result: row.result,
    stage: Number(row.stage),
    wave: Number(row.wave),
    kills: Number(row.kills),
    time: Number(row.elapsed),
    finaleTime: Number(row.finale_time),
    devours: Number(row.devours),
    eliteKills: Number(row.elite_kills),
    bossKills: Number(row.boss_kills),
    eventsCompleted: Number(row.events_completed),
    species: row.species,
    score: Number(row.score),
    scoreVersion: Number(row.score_version),
    submittedAt: row.submitted_at,
    userId: Number(row.user_id),
    stars: JSON.parse(row.result_json)?.stars || 0,
  }
}

export function getLeaderboard(db, mode, difficulty, limit = 50, currentUserId = null, gameplay = 'arena', page = 1) {
  const rows = db.prepare(`
    SELECT r.*, u.display_name, p.name AS profile_name
    FROM runs r
    JOIN users u ON u.id = r.user_id
    JOIN profiles p ON p.id = r.profile_id
    WHERE r.gameplay = ? AND r.mode = ? AND r.difficulty = ? AND u.disabled = 0
      AND (r.gameplay != 'tower-defense' OR r.mode != 'campaign' OR r.result = 'victory')
  `).all(gameplay, mode, difficulty).map(runEntry)

  rows.sort((a, b) => (gameplay === 'arena' ? compareEntries(a, b, mode) : compareAccountEntries(a, b, gameplay, mode))
    || a.submittedAt.localeCompare(b.submittedAt) || a.runId.localeCompare(b.runId))
  const seen = new Set()
  const bestByUser = rows.filter((entry) => {
    if (seen.has(entry.userId)) return false
    seen.add(entry.userId)
    return true
  })
  const ranked = bestByUser.map((entry, index) => ({
    ...entry,
    rank: index + 1,
    current: currentUserId != null && entry.userId === Number(currentUserId),
  }))
  const pageSize = boundedInt(limit, 1, 50, 50)
  const totalPages = Math.max(1, Math.ceil(ranked.length / pageSize))
  const currentPage = boundedInt(page, 1, totalPages, 1)
  return {
    entries: ranked.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(({ userId, ...entry }) => entry),
    page: currentPage,
    pageSize,
    totalPages,
    currentRank: currentUserId == null
      ? null
      : ranked.find((entry) => entry.userId === Number(currentUserId))?.rank || null,
    totalPlayers: ranked.length,
  }
}
