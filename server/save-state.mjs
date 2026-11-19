import { randomUUID } from 'node:crypto'

export function saveConflict(message = '档案已在其他页面更新，请刷新后重试') {
  return Object.assign(new Error(message), { status: 409, code: 'save_conflict' })
}

export function accountState(db, userId) {
  return db.prepare('SELECT * FROM account_state WHERE user_id = ?').get(userId)
}

export function touchAccount(db, userId) {
  db.prepare('UPDATE account_state SET revision = revision + 1, saved_at = ? WHERE user_id = ?')
    .run(new Date().toISOString(), userId)
}

export function assertAccountVersion(db, userId, expected) {
  if (!expected) return // Compatibility for old clients; current UI always supplies this.
  const state = accountState(db, userId)
  if (expected.saveEpoch !== state.save_epoch || Number(expected.accountRevision) !== Number(state.revision)) throw saveConflict()
}

export function rotateSaveEpoch(db, userId) {
  db.prepare('UPDATE account_state SET save_epoch = ? WHERE user_id = ?').run(randomUUID(), userId)
  touchAccount(db, userId)
}

export function archiveProfile(db, row) {
  db.prepare(`INSERT INTO save_history(user_id, profile_id, kind, payload, created_at)
    VALUES (?, ?, 'profile', ?, ?)`).run(row.user_id, row.id, row.data_json, new Date().toISOString())
  db.prepare(`DELETE FROM save_history WHERE user_id = ? AND profile_id = ? AND kind = 'profile'
    AND id NOT IN (SELECT id FROM save_history WHERE user_id = ? AND profile_id = ? AND kind = 'profile' ORDER BY id DESC LIMIT 10)`)
    .run(row.user_id, row.id, row.user_id, row.id)
}

export function archiveAccount(db, userId, reason) {
  const payload = {
    state: accountState(db, userId),
    profiles: db.prepare('SELECT * FROM profiles WHERE user_id = ? ORDER BY slot_index').all(userId),
    accountData: db.prepare('SELECT data_json FROM account_game_data WHERE user_id = ?').get(userId)?.data_json || null,
  }
  db.prepare(`INSERT INTO save_history(user_id, profile_id, kind, payload, created_at) VALUES (?, NULL, ?, ?, ?)`)
    .run(userId, reason, JSON.stringify(payload), new Date().toISOString())
  db.prepare(`DELETE FROM save_history WHERE user_id = ? AND profile_id IS NULL AND id NOT IN
    (SELECT id FROM save_history WHERE user_id = ? AND profile_id IS NULL ORDER BY id DESC LIMIT 20)`).run(userId, userId)
}
