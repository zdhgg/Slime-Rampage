// Run manually to compare combat traces against the approved baseline; requires Git.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createArena, dispose } from './test-support/arena-fixture.mjs'
import { Boss } from './src/game/entities/Boss.js'
import { ExpeditionBoss } from './src/game/entities/ExpeditionBoss.js'
import { BorderWarden } from './src/game/entities/BorderWarden.js'
import { EXPEDITION_BOSSES } from './src/game/RunRules.js'

const root = mkdtempSync(join(tmpdir(), 'slime-boss-baseline-'))
const baseline = '947fdbcb1fdef7e3f3c3ad61e47ff25076c0223e'
let count = 0
try {
  for (const name of ['Boss', 'ExpeditionBoss', 'BorderWarden']) {
    let source = execFileSync('git', ['show', `${baseline}:src/game/entities/${name}.js`], { encoding: 'utf8' })
    if (name === 'Boss') {
      source = source.replace("'./Enemy.js'", JSON.stringify(pathToFileURL(resolve('src/game/entities/Enemy.js')).href))
        .replace("'../AssetManager.js'", JSON.stringify(pathToFileURL(resolve('src/game/AssetManager.js')).href))
    }
    writeFileSync(join(root, `${name}.mjs`), source.replaceAll("'./Boss.js'", "'./Boss.mjs'").replaceAll("'./ExpeditionBoss.js'", "'./ExpeditionBoss.mjs'"))
  }
  const old = await Promise.all(['Boss', 'ExpeditionBoss', 'BorderWarden'].map(n => import(pathToFileURL(join(root, `${n}.mjs`)).href).then(m => m[n])))
  function trace(Type, encounter, type, fps, phase, interrupted) {
    const random = Math.random
    let seed = 42
    Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32)
    const g = createArena()
    try {
      g.mapFeatures.speedMultiplierAt = () => 1
      const b = new Type({ x: 900, y: 900, wave: 5, type, encounter })
      b.attach(g); b.phase = phase
      g.player.x = 1000; g.player.y = 900
      const events = [], frames = []
      // Idle timers are intentionally cleared on interruption; only active timers drive combat.
      g.player.hit = d => events.push(['hit', d])
      g.enemyManager.spawnBullet = (...args) => events.push(['bullet', ...args])
      g.enemyManager.spawnAt = (...args) => events.push(['summon', ...args])
      b._startSpecial()
      for (let i = 0; i < fps * 10; i++) {
        if (interrupted && i === fps) b.freeze = .5
        if (interrupted && i === fps * 3) b.hp = b.maxHp * .49
        b.update(1 / fps)
        frames.push([b.x, b.y, b.facing, b.phase, b.specialState, b.specialState === 'idle' ? null : b.specialTimer,
          b.specialCd, b.vulnerableTimer, b.speed, b.attackInterval, b.hp, events.length])
      }
      return { frames, events }
    } finally { dispose(g); Math.random = random }
  }
  const cases = [
    ...['boss-knight', 'boss-mage', 'boss-archer', 'boss-final', 'boss-expedition'].map(type => ({ index: 0, type })),
    ...Object.values(EXPEDITION_BOSSES).map(encounter => ({ index: encounter.id === 'border_warden' ? 2 : 1, encounter })),
  ]
  for (const c of cases) for (const fps of [15, 30, 60, 120]) for (const phase of [1, 2]) for (const interrupted of [false, true]) {
    const args = [c.encounter, c.type, fps, phase, interrupted]
    assert.deepEqual(trace([Boss, ExpeditionBoss, BorderWarden][c.index], ...args), trace(old[c.index], ...args), JSON.stringify({ ...c, fps, phase, interrupted }))
    count++
  }
  console.log(`Baseline ${baseline.slice(0, 7)}: ${count} combat traces identical (10 seconds each)`)
} finally {
  // Only the unique directory created above is removed.
  rmSync(root, { recursive: true, force: true })
}
