import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, copyFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { backup, DatabaseSync } from 'node:sqlite'

export const AUTO_BACKUP_KEEP = 10
export const backupStamp = () => new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
export const backupFilename = (stamp = backupStamp()) => `slime-rampage_${stamp}_${randomUUID().slice(0, 8)}.db`

export function verifyBackup(filename) {
  const check = new DatabaseSync(filename, { readOnly: true })
  try {
    if (check.prepare('PRAGMA quick_check').all().some(row => Object.values(row)[0] !== 'ok')
      || check.prepare('PRAGMA foreign_key_check').all().length) throw new Error('备份完整性校验失败')
  } finally { check.close() }
}

export async function backupDatabase(db, targetPath) {
  mkdirSync(dirname(targetPath), { recursive: true })
  const temporary = `${targetPath}.${randomUUID()}.partial`
  try {
    await backup(db, temporary)
    verifyBackup(temporary)
    if (existsSync(targetPath)) throw new Error('备份目标已存在，请使用新文件名')
    renameSync(temporary, targetPath)
    return targetPath
  } finally {
    for (const path of [temporary, `${temporary}-wal`, `${temporary}-shm`]) rmSync(path, { force: true })
  }
}

// Existing files are backed up through a read-only connection before migrations.
export async function backupBeforeMigration(filename, backupDir) {
  if (!existsSync(filename)) return ''
  const source = new DatabaseSync(filename, { readOnly: true })
  try { return await backupDatabase(source, join(backupDir, backupFilename())) }
  finally { source.close() }
}

// Ten recent copies, seven daily copies and four weekly copies. A numeric keep
// retains the old strict-count behaviour for callers that explicitly request it.
export function pruneBackups(dir, keep) {
  let files
  try { files = readdirSync(dir).filter(name => /^slime-rampage_.+\.db$/.test(name)).sort().reverse() }
  catch { return 0 }
  const kept = new Set(files.slice(0, keep ?? AUTO_BACKUP_KEEP))
  if (keep == null) {
    for (const [period, count] of [[86400000, 7], [604800000, 4]]) {
      const buckets = new Set()
      for (const file of files) {
        const date = /^slime-rampage_(\d{4}-\d{2}-\d{2})/.exec(file)?.[1]
        const stamp = Date.parse(date)
        if (!Number.isFinite(stamp)) continue
        const bucket = Math.floor(stamp / period)
        if (!buckets.has(bucket) && buckets.size < count) { kept.add(file); buckets.add(bucket) }
      }
    }
  }
  let removed = 0
  for (const name of files) {
    if (kept.has(name)) continue
    try { rmSync(join(dir, name)); removed++ } catch { /* Keep other valid backups. */ }
  }
  return removed
}

export function createBackupService(db, dir, { intervalMs = 30 * 60 * 1000, enabled = true, mirrorDir = '', onError = console.warn } = {}) {
  let pending = null
  let stopped = false
  let lastChange = ''
  const changes = () => `${db.prepare('SELECT total_changes() AS n').get().n}:${Object.values(db.prepare('PRAGMA data_version').get())[0]}`
  async function snapshot({ force = false } = {}) {
    if (pending) { await pending; if (!force) return '' }
    if (stopped) return ''
    const change = changes()
    if (!force && change === lastChange) return ''
    pending = (async () => {
      const target = await backupDatabase(db, join(dir, backupFilename()))
      // Capture the count before the asynchronous copy: writes during it must
      // still cause the next scheduled backup.
      lastChange = change
      if (mirrorDir && resolve(mirrorDir) !== resolve(dir)) {
        try {
          mkdirSync(mirrorDir, { recursive: true })
          const destination = join(mirrorDir, target.split(/[\\/]/).pop())
          const temporary = `${destination}.partial`
          try {
            copyFileSync(target, temporary)
            verifyBackup(temporary)
            renameSync(temporary, destination)
          } finally {
            for (const path of [temporary, `${temporary}-wal`, `${temporary}-shm`]) rmSync(path, { force: true })
          }
          pruneBackups(mirrorDir)
        } catch (error) { lastChange = ''; onError(`异地备份失败：${error.message}`) }
      }
      pruneBackups(dir)
      return target
    })()
    try { return await pending } finally { pending = null }
  }
  const timer = enabled ? setInterval(() => { snapshot().catch(error => onError(`自动备份失败：${error.message}`)) }, intervalMs) : null
  timer?.unref?.()
  return { snapshot, async close() { clearInterval(timer); stopped = true; if (pending) await pending } }
}
