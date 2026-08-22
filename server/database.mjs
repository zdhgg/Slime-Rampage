import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export function withTransaction(db, operation) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = operation()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function openDatabase(filename) {
  mkdirSync(dirname(filename), { recursive: true })
  const db = new DatabaseSync(filename, { timeout: 5000 })
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)
  migrate(db)
  return db
}

function migrate(db) {
  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((row) => Number(row.version))
  )
  const migrations = [
    {
      version: 1,
      sql: `
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL COLLATE NOCASE UNIQUE,
          display_name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          password_salt TEXT NOT NULL,
          disabled INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          last_login_at TEXT
        );
        CREATE TABLE sessions (
          token_hash TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at INTEGER NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX sessions_user_idx ON sessions(user_id);
        CREATE TABLE account_state (
          user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          active_slot_index INTEGER NOT NULL DEFAULT 0 CHECK(active_slot_index BETWEEN 0 AND 2)
        );
        CREATE TABLE profiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          slot_index INTEGER NOT NULL CHECK(slot_index BETWEEN 0 AND 2),
          name TEXT NOT NULL,
          data_json TEXT NOT NULL,
          revision INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(user_id, slot_index)
        );
        CREATE INDEX profiles_user_idx ON profiles(user_id);
        CREATE TABLE run_tickets (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          mode TEXT NOT NULL,
          difficulty TEXT NOT NULL,
          issued_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          completed_at INTEGER
        );
        CREATE INDEX run_tickets_user_idx ON run_tickets(user_id);
        CREATE TABLE runs (
          id TEXT PRIMARY KEY,
          ticket_id TEXT NOT NULL UNIQUE REFERENCES run_tickets(id) ON DELETE RESTRICT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          mode TEXT NOT NULL,
          difficulty TEXT NOT NULL,
          result TEXT NOT NULL,
          stage INTEGER NOT NULL,
          wave INTEGER NOT NULL,
          kills INTEGER NOT NULL,
          elapsed INTEGER NOT NULL,
          finale_time REAL NOT NULL,
          devours INTEGER NOT NULL,
          elite_kills INTEGER NOT NULL,
          boss_kills INTEGER NOT NULL,
          events_completed INTEGER NOT NULL,
          species TEXT NOT NULL,
          score INTEGER NOT NULL,
          score_version INTEGER NOT NULL,
          breakdown_json TEXT NOT NULL,
          result_json TEXT NOT NULL,
          submitted_at TEXT NOT NULL
        );
        CREATE INDEX runs_board_idx ON runs(mode, difficulty, score DESC);
        CREATE TABLE server_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        INSERT INTO server_settings(key, value) VALUES ('registration_enabled', '1');
      `,
    },
  ]

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue
    withTransaction(db, () => {
      db.exec(migration.sql)
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(
        migration.version,
        new Date().toISOString()
      )
    })
  }
}
