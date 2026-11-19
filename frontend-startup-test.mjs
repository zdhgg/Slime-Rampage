import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// 用临时后端验证代理；不创建或修改真实玩家账号。
const backend = createServer(async (req, res) => {
  let body = ''
  for await (const chunk of req) body += chunk
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Set-Cookie', 'test_session=verified; Path=/; HttpOnly; SameSite=Strict')
  res.statusCode = req.url === '/api/private' ? 401 : 200
  res.end(JSON.stringify({ path: req.url, cookie: req.headers.cookie, body }))
}).listen(0, '127.0.0.1')
await once(backend, 'listening')
const backendPort = backend.address().port
const reservation = createServer().listen(0, '127.0.0.1')
await once(reservation, 'listening')
const port = reservation.address().port
await new Promise(resolve => reservation.close(resolve))
const child = spawn(process.execPath, [resolve('server/frontend.mjs')], {
  cwd: resolve('frontend'), windowsHide: true,
  env: { ...process.env, VITE_PORT: String(port), SLIME_PORT: String(backendPort) },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let logs = ''
child.stdout.on('data', chunk => { logs += chunk })
child.stderr.on('data', chunk => { logs += chunk })
const base = `http://127.0.0.1:${port}`
try {
  let ready = false
  for (let attempt = 0; attempt < 150; attempt++) {
    try {
      const response = await fetch(`${base}/__startup`)
      const status = await response.json()
      assert.equal(response.headers.get('cache-control'), 'no-store')
      assert.equal(status.failed, false, logs)
      if (status.ready) { ready = true; break }
      const loading = await fetch(base).then(response => response.text())
      assert.ok(loading.includes('正在准备游戏资源'))
    } catch (error) {
      if (child.exitCode !== null || error instanceof assert.AssertionError) throw error
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  assert.ok(ready, logs)
  const page = await fetch(base)
  const html = await page.text()
  assert.equal(page.headers.get('cache-control'), 'no-cache')
  assert.ok(html.includes('game-boot-message'), '首屏必须包含原生加载状态')
  assert.ok(!html.includes('/src/main.js'), '门户不应发送开发源码模块')
  const script = html.match(/src="([^"]+\.js)"/)[1]
  const asset = await fetch(new URL(script, base))
  assert.equal(asset.status, 200)
  assert.ok(asset.headers.get('cache-control').includes('immutable'))
  const auth = await fetch(`${base}/api/auth/login?test=1`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'test_session=old' },
    body: JSON.stringify({ username: 'test' }),
  })
  assert.ok(auth.headers.get('set-cookie').includes('test_session=verified'))
  const echoed = await auth.json()
  assert.equal(echoed.path, '/api/auth/login?test=1')
  assert.equal(echoed.cookie, 'test_session=old')
  assert.equal(JSON.parse(echoed.body).username, 'test')
  assert.equal((await fetch(`${base}/api/private`)).status, 401)
  await new Promise(resolve => backend.close(resolve))
  const unavailable = await fetch(`${base}/api/status`)
  assert.equal(unavailable.status, 502)
  assert.equal((await unavailable.json()).error.code, 'backend_unavailable')

  const fixture = await mkdtemp(join(tmpdir(), 'slime-portal-startup-'))
  const distDir = join(fixture, 'dist')
  const accountServer = spawn(process.execPath, ['index.mjs', '--portal'], {
    cwd: resolve('server'), windowsHide: true, stdio: 'ignore',
    env: {
      ...process.env,
      SLIME_PORT: String(backendPort),
      SLIME_HOST: '127.0.0.1',
      SLIME_DIST_DIR: distDir,
      SLIME_DATA_DIR: join(fixture, 'data'),
      SLIME_AUTO_BACKUP: '0',
    },
  })
  try {
    const backendUrl = `http://127.0.0.1:${backendPort}`
    let status
    for (let attempt = 0; attempt < 50; attempt++) {
      assert.equal(accountServer.exitCode, null, '门户后端必须能在资源未构建时启动')
      const response = await fetch(`${backendUrl}/api/status`).catch(() => null)
      if (response?.ok) {
        status = await response.json()
        break
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.equal(status?.service, 'slime-rampage')
    assert.equal((await fetch(backendUrl)).status, 404)
    assert.deepEqual(await fetch(`${base}/api/auth/me`).then(response => response.json()), { account: null })

    await mkdir(distDir)
    const index = '<!doctype html><title>Slime Rampage</title>'
    await writeFile(join(distDir, 'index.html'), index)
    assert.equal(await fetch(backendUrl).then(response => response.text()), index)
  } finally {
    if (accountServer.exitCode === null && accountServer.signalCode === null) {
      const exited = once(accountServer, 'exit')
      accountServer.kill()
      await exited
    }
    await rm(fixture, { recursive: true, force: true, maxRetries: 5 })
  }
  console.log('✓ 门户启动：无构建资源时启动后端、生产资源、首屏提示、资源缓存与账号代理均通过')
} finally {
  child.kill()
  if (backend.listening) await new Promise(resolve => backend.close(resolve))
}
