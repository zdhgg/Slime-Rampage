import {
  defaultSave,
  sanitizeSave,
} from '../src/game/SaveManager.js'

export const REMOTE_SLOT_COUNT = 3
const slotId = (index) => `slot-${index + 1}`
const slotName = (index) => `史莱姆档案 ${index + 1}`
const timestamp = () => new Date().toISOString()

export function parseSlotId(id) {
  const match = /^slot-([1-3])$/.exec(String(id || ''))
  return match ? Number(match[1]) - 1 : -1
}

export function initializeAccount(db, userId) {
  const now = timestamp()
  db.prepare('INSERT INTO account_state(user_id, active_slot_index) VALUES (?, 0)').run(userId)
  db.prepare(`
    INSERT INTO profiles(user_id, slot_index, name, data_json, revision, created_at, updated_at)
    VALUES (?, 0, ?, ?, 1, ?, ?)
  `).run(userId, slotName(0), JSON.stringify(defaultSave()), now, now)
}

export function profileCatalog(db, userId) {
  const state = db.prepare('SELECT active_slot_index FROM account_state WHERE user_id = ?').get(userId)
  const rows = db.prepare(`
    SELECT id, slot_index, name, data_json, revision, created_at, updated_at
    FROM profiles WHERE user_id = ? ORDER BY slot_index
  `).all(userId)
  const slots = Array(REMOTE_SLOT_COUNT).fill(null)
  for (const row of rows) {
    let parsed
    try {
      parsed = JSON.parse(row.data_json)
    } catch {
      parsed = null
    }
    slots[Number(row.slot_index)] = {
      id: slotId(Number(row.slot_index)),
      profileId: Number(row.id),
      name: row.name,
      revision: Number(row.revision),
      createdAt: row.created_at,
      lastPlayedAt: row.updated_at,
      data: sanitizeSave(parsed),
    }
  }
  const first = rows[0]?.slot_index ?? 0
  const activeIndex = slots[Number(state?.active_slot_index)] ? Number(state.active_slot_index) : Number(first)
  return {
    version: 5,
    activeSlotId: slotId(activeIndex),
    settings: { sound: { muted: false } },
    slots,
  }
}

export function activeProfileRow(db, userId) {
  return db.prepare(`
    SELECT p.* FROM profiles p
    JOIN account_state a ON a.user_id = p.user_id AND a.active_slot_index = p.slot_index
    WHERE p.user_id = ?
  `).get(userId)
}

export function profileRowById(db, userId, profileId) {
  return db.prepare('SELECT * FROM profiles WHERE id = ? AND user_id = ?').get(profileId, userId)
}

export function parseProfileData(row) {
  try {
    return sanitizeSave(JSON.parse(row?.data_json || 'null'))
  } catch {
    return defaultSave()
  }
}

export function writeProfileData(db, row, data) {
  const now = timestamp()
  db.prepare(`
    UPDATE profiles SET data_json = ?, revision = revision + 1, updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(sanitizeSave(data)), now, row.id)
}

export function createProfileSlot(db, userId, index) {
  if (!Number.isInteger(index) || index < 0 || index >= REMOTE_SLOT_COUNT) return false
  if (db.prepare('SELECT 1 FROM profiles WHERE user_id = ? AND slot_index = ?').get(userId, index)) {
    return false
  }
  const now = timestamp()
  db.prepare(`
    INSERT INTO profiles(user_id, slot_index, name, data_json, revision, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `).run(userId, index, slotName(index), JSON.stringify(defaultSave()), now, now)
  db.prepare('UPDATE account_state SET active_slot_index = ? WHERE user_id = ?').run(index, userId)
  return true
}

export function activateProfileSlot(db, userId, index) {
  const row = db.prepare('SELECT id FROM profiles WHERE user_id = ? AND slot_index = ?').get(userId, index)
  if (!row) return false
  db.prepare('UPDATE account_state SET active_slot_index = ? WHERE user_id = ?').run(index, userId)
  db.prepare('UPDATE profiles SET updated_at = ? WHERE id = ?').run(timestamp(), row.id)
  return true
}

export function deleteProfileSlot(db, userId, index) {
  const rows = db.prepare('SELECT id, slot_index FROM profiles WHERE user_id = ? ORDER BY slot_index').all(userId)
  const target = rows.find((row) => Number(row.slot_index) === index)
  if (!target || rows.length <= 1) return false
  db.prepare('DELETE FROM profiles WHERE id = ?').run(target.id)
  const state = db.prepare('SELECT active_slot_index FROM account_state WHERE user_id = ?').get(userId)
  if (Number(state.active_slot_index) === index) {
    const fallback = rows.find((row) => Number(row.slot_index) !== index)
    db.prepare('UPDATE account_state SET active_slot_index = ? WHERE user_id = ?').run(
      fallback.slot_index,
      userId
    )
  }
  return true
}
