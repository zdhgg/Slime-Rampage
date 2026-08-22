import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { backup, DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = resolve(process.env.SLIME_DATA_DIR || join(root, 'data'))
const sourcePath = join(dataDir, 'slime-rampage.db')
const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
const targetPath = resolve(process.argv[2] || join(dataDir, 'backups', `slime-rampage_${stamp}.db`))

mkdirSync(dirname(targetPath), { recursive: true })
const source = new DatabaseSync(sourcePath, { readOnly: true })
try {
  await backup(source, targetPath)
  console.log(`备份完成：${targetPath}`)
} finally {
  source.close()
}
