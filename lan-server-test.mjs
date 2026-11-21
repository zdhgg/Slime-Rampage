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

async function api(path, { method = 'GET', body, cookie, catalog } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(catalog ? { 'X-Save-Epoch': catalog.saveEpoch, 'X-Save-Revision': String(catalog.accountRevision) } : {}),
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
  assert.equal(status.payload.service, 'slime-rampage')

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
  // V4 导入档战利品按购买力 ÷15 迁移为战力点、V6 尺度 ×100：round(100/15)×100 = 700
  assert.equal(response.payload.catalog.slots[1].data.drops, 700)

  response = await api('/api/profile/genes/giant/purchase', {
    method: 'POST',
    cookie: aliceCookie,
  })
  assert.equal(response.status, 200)
  assert.equal(response.payload.catalog.slots[1].data.genes.giant, 1)
  assert.equal(response.payload.catalog.slots[1].data.drops, 550)

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
    species: { name: '测试史莱姆' },
    score: 99999999,
  }
  const finish = await api(`/api/runs/${start.payload.ticket.id}/finish`, {
    method: 'POST',
    cookie: aliceCookie,
    body: { run: summary },
  })
  assert.equal(finish.status, 200)
  // 分数由服务端按统计重算（30 + 15 = 45），战利品改由分数派生：round(45/30) = 2 点
  assert.equal(finish.payload.result.score, 45)
  assert.equal(finish.payload.result.earnedDrops, 2)
  assert.equal(finish.payload.leaderboard.entries[0].username, 'Alice')

  const repeated = await api(`/api/runs/${start.payload.ticket.id}/finish`, {
    method: 'POST',
    cookie: aliceCookie,
    body: { run: summary },
  })
  assert.equal(repeated.status, 200)
  assert.equal(repeated.payload.result.runId, finish.payload.result.runId)
  assert.equal(repeated.payload.catalog.slots[1].data.drops, 552)

  const resetPath = '/api/profile/genes/reset'
  const resetOptions = { method: 'POST', cookie: aliceCookie, catalog: repeated.payload.catalog }
  assert.equal(repeated.payload.catalog.slots[1].data.geneInvestment, 150)
  assert.equal((await api(resetPath, { method: 'POST', cookie: aliceCookie })).status, 409)
  assert.equal((await api(resetPath, { method: 'POST' })).status, 401)
  const attempts = await Promise.all([
    api(resetPath, { ...resetOptions, body: { points: 100000, slotId: 'slot-1' } }),
    api(resetPath, { ...resetOptions, body: { points: 100000, slotId: 'slot-1' } }),
  ])
  assert.deepEqual(attempts.map(attempt => attempt.status).sort(), [200, 409])
  const reset = attempts.find(attempt => attempt.status === 200).payload
  assert.equal(reset.refund.points, 150)
  assert.equal(reset.catalog.saveEpoch, resetOptions.catalog.saveEpoch)
  assert.equal(reset.catalog.slots[1].data.drops, 702)
  assert.equal(reset.catalog.slots[1].data.geneInvestment, 0)
  assert.deepEqual(reset.catalog.slots[1].data.genes, {})
  assert.deepEqual(reset.catalog.slots[1].data.records, resetOptions.catalog.slots[1].data.records)
  assert.deepEqual(reset.catalog.slots[0], resetOptions.catalog.slots[0])
  const emptyReset = await api(resetPath, { ...resetOptions, catalog: reset.catalog })
  assert.equal(emptyReset.payload.refund.points, 0)
  assert.equal(emptyReset.payload.catalog.accountRevision, reset.catalog.accountRevision)

  const repurchase = await api('/api/profile/genes/giant/purchase', { ...resetOptions, catalog: reset.catalog })
  assert.equal(repurchase.status, 200)
  const reroll = await api(resetPath, { ...resetOptions, catalog: repurchase.payload.catalog })
  assert.equal(reroll.payload.refund.points, 150)
  assert.equal(reroll.payload.catalog.slots[1].data.drops, 702)

  const legacySave = { version: 4, drops: 30, records: {}, genes: { giant: 2, split: 1, predator_origin: 1 } }
  const legacyProfileId = reroll.payload.catalog.slots[1].profileId
  db.prepare('UPDATE profiles SET data_json = ? WHERE id = ?').run(JSON.stringify(legacySave), legacyProfileId)
  const legacy = (await api('/api/profile', { cookie: aliceCookie })).payload.catalog
  assert.deepEqual(legacy.slots[1].data.genes, legacySave.genes)
  assert.equal(legacy.slots[1].data.drops, 200)
  assert.equal(legacy.slots[1].data.geneInvestment, 1200)
  assert.deepEqual(JSON.parse(db.prepare('SELECT data_json FROM profiles WHERE id = ?').get(legacyProfileId).data_json), legacySave)
  const switched = await api('/api/profiles/slot-1/activate', { ...resetOptions, catalog: legacy })
  assert.equal(switched.status, 200)
  assert.equal((await api(resetPath, { ...resetOptions, catalog: legacy })).status, 409)
  const returned = await api('/api/profiles/slot-2/activate', { ...resetOptions, catalog: switched.payload.catalog })
  const legacyReset = await api(resetPath, { ...resetOptions, catalog: returned.payload.catalog })
  assert.equal(legacyReset.payload.refund.points, 1200)
  assert.equal(legacyReset.payload.catalog.slots[1].data.drops, 1400)
  assert.deepEqual(legacyReset.payload.catalog.slots[1].data.genes, {})

  const forgedImport = await api('/api/profile/import', {
    ...resetOptions, catalog: legacyReset.payload.catalog,
    body: { slot: { data: { version: 6, drops: 100, records: {}, genes: { giant: 1 }, geneInvestment: 100000 } } },
  })
  assert.equal(forgedImport.status, 200)
  assert.equal(forgedImport.payload.catalog.slots[1].data.geneInvestment, 200)
  console.log('✓ 黑市重置：实付返还、无限重配、旧档估算、档案隔离与版本冲突保护通过')

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

  const lockedTimed20 = await api('/api/runs/start', {
    method: 'POST',
    cookie: aliceCookie,
    body: { mode: 'timed20', difficulty: 'normal' },
  })
  assert.equal(lockedTimed20.status, 403)

  // 解锁远征→限时→20分钟限时，并校验 20 分钟最短通关时长与独立排行榜
  const aliceProfileId = forgedImport.payload.catalog.slots[1].profileId
  const unlockedData = JSON.parse(db.prepare('SELECT data_json FROM profiles WHERE id = ?').get(aliceProfileId).data_json)
  unlockedData.progression = { highestDifficulty: 'hard', highestMode: 'endless' }
  db.prepare('UPDATE profiles SET data_json = ? WHERE id = ?').run(JSON.stringify(unlockedData), aliceProfileId)

  const startTimed20 = await api('/api/runs/start', {
    method: 'POST',
    cookie: aliceCookie,
    body: { mode: 'timed20', difficulty: 'hard' },
  })
  assert.equal(startTimed20.status, 201)
  db.prepare('UPDATE run_tickets SET issued_at = ? WHERE id = ?').run(Date.now() - 1500_000, startTimed20.payload.ticket.id)

  const tooFastTimed20 = await api(`/api/runs/${startTimed20.payload.ticket.id}/finish`, {
    method: 'POST',
    cookie: aliceCookie,
    body: {
      run: {
        result: 'victory',
        wave: 41,
        kills: 500,
        time: 900,
        finaleTime: 60,
        devours: 20,
        eliteKills: 15,
        bossKills: 8,
        eventsCompleted: 5,
        species: { name: '测试终焉史莱姆' },
      },
    },
  })
  assert.equal(tooFastTimed20.status, 422)

  const validTimed20 = await api(`/api/runs/${startTimed20.payload.ticket.id}/finish`, {
    method: 'POST',
    cookie: aliceCookie,
    body: {
      run: {
        result: 'victory',
        wave: 41,
        kills: 2000,
        time: 1260,
        finaleTime: 60,
        devours: 40,
        eliteKills: 30,
        bossKills: 15,
        eventsCompleted: 8,
        species: { name: '测试终焉史莱姆' },
      },
    },
  })
  assert.equal(validTimed20.status, 200)
  assert.equal(validTimed20.payload.leaderboard.entries.length, 1)
  const timed12Board = await api('/api/leaderboard?mode=timed&difficulty=hard')
  assert.equal(timed12Board.payload.leaderboard.entries.length, 0)

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

  console.log('✓ 账号服务：账号隔离、兼容旧档案、服务端计分、幂等结算与公开排行榜均正常')
} finally {
  await new Promise((resolve) => server.close(resolve))
  db.close()
  rmSync(tempDir, { recursive: true, force: true })
}
