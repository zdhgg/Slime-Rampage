import express from 'express'
import { request } from 'node:http'
import { spawn } from 'node:child_process'
import { readdirSync, statSync, existsSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 取磁盘上的真实大小写：门户可能以小写工作目录启动，Vite 在 Windows 上会因路径大小写不一致而构建失败
const root = realpathSync.native(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
const dist = join(root, 'dist')
const index = join(dist, 'index.html')
const port = Number(process.env.VITE_PORT) || 3013
const apiPort = Number(process.env.SLIME_PORT) || 8013
const app = express()
let buildProcess
let state = { ready: false, failed: false }

function latestModified(path) {
  if (!existsSync(path)) return 0
  const info = statSync(path)
  if (!info.isDirectory()) return info.mtimeMs
  return Math.max(info.mtimeMs, ...readdirSync(path).map(name => latestModified(join(path, name))))
}

const inputs = ['src', 'public', 'index.html', 'vite.config.js', 'package.json', 'package-lock.json', 'CHANGELOG.md']
const needsBuild = !existsSync(index) || inputs.some(path => latestModified(join(root, path)) > statSync(index).mtimeMs)

// 门户仍使用 3013；API 代理到同一 8013 后端，保留原有站点的账号 Cookie。
app.use('/api', (req, res) => {
  const upstream = request({ hostname: '127.0.0.1', port: apiPort, path: req.originalUrl,
    method: req.method, headers: { ...req.headers, host: `127.0.0.1:${apiPort}` } }, response => {
    res.writeHead(response.statusCode, response.headers)
    response.pipe(res)
  })
  upstream.setTimeout(15000, () => upstream.destroy(new Error('API timeout')))
  upstream.on('error', () => {
    if (!res.headersSent) res.status(502).json({ error: { code: 'backend_unavailable', message: '账号服务尚未就绪，请稍后重试' } })
    else res.destroy()
  })
  req.on('aborted', () => upstream.destroy())
  req.pipe(upstream)
})
app.get('/__startup', (_req, res) => res.set('Cache-Control', 'no-store').json(state))
app.use((_req, res, next) => {
  if (state.ready) return next()
  res.set('Cache-Control', 'no-store').status(state.failed ? 503 : 200).type('html').send(`<!doctype html>
    <html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>史莱姆大暴走</title><style>body{margin:0;min-height:100vh;display:grid;place-content:center;text-align:center;background:#0b0d0b;color:#e6ebdf;font:14px/1.8 'Microsoft YaHei',sans-serif}p{color:#a4af9c}button{padding:10px 22px;cursor:pointer}</style>
    <h1>史莱姆大暴走</h1><p id="status">${state.failed ? '游戏资源准备失败，请在应用管理中重新启动游戏。' : '正在准备游戏资源，完成后自动进入…'}</p>
    <button onclick="location.reload()">重新加载</button>
    <script>const started=Date.now();async function poll(){try{const r=await fetch('/__startup',{cache:'no-store'});const s=await r.json();if(s.ready){location.reload();return}if(s.failed){document.getElementById('status').textContent='游戏资源准备失败，请在应用管理中重新启动游戏。';return}}catch{}if(Date.now()-started>60000){document.getElementById('status').textContent='游戏准备时间较长，请在应用管理中检查启动日志。';return}setTimeout(poll,1000)}poll()</script></html>`)
})
app.use(express.static(dist, { index: false, setHeaders(res, path) {
  res.setHeader('Cache-Control', path.includes(`${join(dist, 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache')
} }))
app.get('/', (_req, res) => res.set('Cache-Control', 'no-cache').sendFile(index))

const server = app.listen(port, '0.0.0.0', () => console.log(`游戏入口 http://localhost:${port}`))
server.on('error', error => { console.error(error); process.exit(1) })
if (needsBuild) {
  console.log('正在构建游戏资源…')
  buildProcess = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: root, stdio: 'inherit', windowsHide: true })
  buildProcess.on('error', error => { console.error(error); state = { ready: false, failed: true } })
  buildProcess.on('exit', code => {
    state = { ready: code === 0 && existsSync(index), failed: code !== 0 || !existsSync(index) }
    console.log(state.ready ? '游戏资源已就绪' : '游戏构建失败')
  })
} else {
  state = { ready: true, failed: false }
  console.log('复用已构建资源，游戏已就绪')
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  buildProcess?.kill()
  server.close(() => process.exit(0))
})
