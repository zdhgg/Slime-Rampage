import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLanApp } from './server/app.mjs'
import { openDatabase } from './server/database.mjs'

const tempDir = mkdtempSync(join(tmpdir(), 'slime-rampage-test-'))
const db = openDatabase(join(tempDir, 'test.db'))
const server = createLanApp({ db, registration: true }).listen(0, '127.0.0.1')
await new Promise((resolve) => server.once('listening', resolve))
const baseUrl = `http://127.0.0.1:${server.address().port}`

async function api(path, { method = 'GET', body, cookie } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await response.json()
  return {
    status: response.status,
    payload,
    cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie,
  }
}

try {
  const status = await api('/api/status')
  assert.equal(status.status, 200)
  assert.equal(status.payload.service, 'slime-rampage-lan')

  const aliceRegistration = await api('/api/auth/register', {
    method: 'POST',
    body: { username: 'Alice', password: 'slime-123' },
  })
  assert.equal(aliceRegistration.status, 201)
  const aliceCookie = aliceRegistration.cookie
  assert.equal(aliceRegistration.payload.catalog.slots.length, 3)

  const duplicate = await api('/api/auth/register', {
    method: 'POST',
    body: { username: 'alice', password: 'slime-456' },
  })
  assert.equal(duplicate.status, 409)

  const anonymousProfile = await api('/api/profile')
  assert.equal(anonymousProfile.status, 401)

  let response = await api('/api/profiles', {
    method: 'POST',
    cookie: aliceCookie,
    body: { index: 1 },
  })
  assert.equal(response.status, 201)
  assert.equal(response.payload.catalog.activeSlotId, 'slot-2')
  assert.equal(response.payload.catalog.slots.filter(Boolean).length, 2)

  response = await api('/api/profile/import', {
    method: 'POST',
    cookie: aliceCookie,
    body: {
      slot: {
        data: {
          version: 4,
          drops: 100,
          genes: {},
          records: {},
          progression: { highestDifficulty: 'normal', highestMode: 'expedition' },
          preferences: { mode: 'expedition', difficulty: 'normal' },
        },
      },
    },
  })
  assert.equal(response.status, 200)
  assert.equal(response.payload.catalog.slots[1].data.drops, 100)

  response = await api('/api/profile/genes/giant/purchase', {
    method: 'POST',
    cookie: aliceCookie,
  })
  assert.equal(response.status, 200)
  assert.equal(response.payload.catalog.slots[1].data.genes.giant, 1)
  assert.equal(response.payload.catalog.slots[1].data.drops, 88)

  const start = await api('/api/runs/start', {
    method: 'POST',
    cookie: aliceCookie,
    body: { mode: 'expedition', difficulty: 'normal' },
  })
  assert.equal(start.status, 201)
  const summary = {
    result: 'defeat',
    stage: 1,
    wave: 1,
    kills: 3,
    time: 0,
    finaleTime: 0,
    devours: 1,
    eliteKills: 0,
    bossKills: 0,
    eventsCompleted: 0,
    drops: { knight: 1 },
    species: { name: '测试史莱姆' },
    score: 99999999,
  }
  const finish = await api(`/api/runs/${start.payload.ticket.id}/finish`, {
    method: 'POST',
    cookie: aliceCookie,
    body: { run: summary },
  })
  assert.equal(finish.status, 200)
  assert.equal(finish.payload.result.score, 45)
  assert.equal(finish.payload.result.earnedDrops, 1)
  assert.equal(finish.payload.leaderboard.entries[0].username, 'Alice')

  const repeated = await api(`/api/runs/${start.payload.ticket.id}/finish`, {
    method: 'POST',
    cookie: aliceCookie,
    body: { run: summary },
  })
  assert.equal(repeated.status, 200)
  assert.equal(repeated.payload.result.runId, finish.payload.result.runId)
  assert.equal(repeated.payload.catalog.slots[1].data.drops, 89)

  const bobRegistration = await api('/api/auth/register', {
    method: 'POST',
    body: { username: 'Bob', password: 'slime-789' },
  })
  assert.equal(bobRegistration.status, 201)
  assert.equal(bobRegistration.payload.catalog.slots[0].data.drops, 0)

  const publicBoard = await api('/api/leaderboard?mode=expedition&difficulty=normal')
  assert.equal(publicBoard.status, 200)
  assert.equal(publicBoard.payload.leaderboard.entries.length, 1)
  assert.equal(publicBoard.payload.leaderboard.entries[0].score, 45)

  const suspiciousStart = await api('/api/runs/start', {
    method: 'POST',
    cookie: aliceCookie,
    body: { mode: 'expedition', difficulty: 'normal' },
  })
  const suspicious = await api(`/api/runs/${suspiciousStart.payload.ticket.id}/finish`, {
    method: 'POST',
    cookie: aliceCookie,
    body: { run: { ...summary, kills: 1000000 } },
  })
  assert.equal(suspicious.status, 422)

  response = await api('/api/profiles/slot-1/activate', { method: 'POST', cookie: aliceCookie })
  assert.equal(response.status, 200)
  response = await api('/api/profiles/slot-2', { method: 'DELETE', cookie: aliceCookie })
  assert.equal(response.status, 200)
  assert.equal(response.payload.catalog.slots.filter(Boolean).length, 1)

  console.log('✓ 局域网服务：账号隔离、三槽档案、服务端计分、幂等结算与公开排行榜均正常')
} finally {
  await new Promise((resolve) => server.close(resolve))
  db.close()
  rmSync(tempDir, { recursive: true, force: true })
}
