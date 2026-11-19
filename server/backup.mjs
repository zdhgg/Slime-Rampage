import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { backupDatabase, backupFilename } from './backup-task.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = resolve(process.env.SLIME_DATA_DIR || join(root, 'data'))
const sourcePath = join(dataDir, 'slime-rampage.db')
const targetPath = resolve(process.argv[2] || join(dataDir, 'backups', backupFilename()))

const source = new DatabaseSync(sourcePath, { readOnly: true })
try {
  await backupDatabase(source, targetPath)
  console.log(`备份完成：${targetPath}`)
} finally {
  source.close()
}
