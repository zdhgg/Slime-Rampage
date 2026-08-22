import { compareEntries } from '../src/game/SaveManager.js'

function runEntry(row) {
  return {
    runId: row.id,
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
  }
}

export function getLeaderboard(db, mode, difficulty, limit = 50, currentUserId = null) {
  const rows = db.prepare(`
    SELECT r.*, u.display_name, p.name AS profile_name
    FROM runs r
    JOIN users u ON u.id = r.user_id
    JOIN profiles p ON p.id = r.profile_id
    WHERE r.mode = ? AND r.difficulty = ? AND u.disabled = 0
  `).all(mode, difficulty).map(runEntry)

  rows.sort((a, b) => compareEntries(a, b, mode) || a.submittedAt.localeCompare(b.submittedAt))
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
  return {
    entries: ranked.slice(0, Math.max(1, Math.min(50, Number(limit) || 50))).map(({ userId, ...entry }) => entry),
    currentRank: currentUserId == null
      ? null
      : ranked.find((entry) => entry.userId === Number(currentUserId))?.rank || null,
    totalPlayers: ranked.length,
  }
}
