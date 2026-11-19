import { existsSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGameApp } from './app.mjs'
import { backupBeforeMigration, createBackupService } from './backup-task.mjs'
import { openDatabase } from './database.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// 只认 SLIME_PORT（默认 8013）：不读取通用 PORT，避免被宿主环境的 PORT 覆盖
const port = Math.max(1, Math.min(65535, Number(process.env.SLIME_PORT) || 8013))
const host = process.env.SLIME_HOST || '0.0.0.0'
const dataDir = resolve(process.env.SLIME_DATA_DIR || join(root, 'data'))
const distDir = resolve(process.env.SLIME_DIST_DIR || join(root, 'dist'))
const registration = process.env.SLIME_REGISTRATION === '0'
  ? false
  : process.env.SLIME_REGISTRATION === '1' ? true : null

// 门户先启动账号服务，前端进程随后负责构建游戏资源。
if (!process.argv.includes('--portal') && !existsSync(join(distDir, 'index.html'))) {
  console.error('未找到 dist/index.html，请先运行 npm run build。')
  process.exit(1)
}

const databasePath = join(dataDir, 'slime-rampage.db')
const backupDir = join(dataDir, 'backups')
let startupBackup = ''
if (process.env.SLIME_AUTO_BACKUP !== '0') {
  // A failed pre-migration backup must not proceed with an upgrade.
  startupBackup = await backupBeforeMigration(databasePath, backupDir)
}
const db = openDatabase(databasePath)
const backups = createBackupService(db, backupDir, { enabled: process.env.SLIME_AUTO_BACKUP !== '0', mirrorDir: process.env.SLIME_BACKUP_MIRROR_DIR || '' })
if (process.env.SLIME_AUTO_BACKUP !== '0') startupBackup = await backups.snapshot({ force: true })
const app = createGameApp({ db, distDir, registration,
  beforeDestructiveWrite: () => backups.snapshot({ force: true }) })
const server = app.listen(port, host, () => {
  console.log('史莱姆大暴走游戏服务已启动：')
  console.log(`  本机  http://127.0.0.1:${port}`)
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) console.log(`  局域网  http://${entry.address}:${port}`)
    }
  }
  console.log(`  数据  ${dataDir}`)
  if (startupBackup) console.log(`  备份  ${startupBackup}`)
  if (process.platform === 'win32') {
    console.log('  提示  若其他设备无法连接，多为 Windows 防火墙拦截，可用管理员终端放行：')
    console.log(`        netsh advfirewall firewall add rule name="SlimeRampage-LAN" dir=in action=allow protocol=TCP localport=${port}`)
  }
})

function shutdown(signal) {
  console.log(`\n收到 ${signal}，正在安全关闭...`)
  server.close(async () => {
    await backups.close()
    db.close()
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 5000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
