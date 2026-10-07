// Real arena frame loop, deterministic seeds; the controller only steers and presses Space.
import assert from 'node:assert/strict'
import { createArena, spawnBoss, learn, dispose } from './test-support/arena-fixture.mjs'

const originalRandom = Math.random
const randomFor = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
const DT = 1 / 60
function nearest(g) {
  return g.enemyManager.enemies.filter(e => e.active && !e.devouring).sort((a, b) =>
    Math.hypot(a.x - g.player.x, a.y - g.player.y) - Math.hypot(b.x - g.player.x, b.y - g.player.y))[0]
}
function steer(g, target) {
  const p = g.player
  let mx = 0, my = 0
  if (target) {
    const dx = target.x - p.x, dy = target.y - p.y, d = Math.hypot(dx, dy) || 1
    const desired = p.radius + target.radius + 48
    const direction = d > desired + 4 ? 1 : d < desired - 6 ? -1 : 0
    mx = dx / d * direction; my = dy / d * direction
    if (direction === 0) { mx = -dy / d; my = dx / d }
    if (target.isBoss && ['telegraph', 'active', 'charge'].includes(target.specialState)) {
      mx = -dy / d; my = dx / d
      if (target.type === 'boss-mage') {
        const ax = p.x - target.targetX, ay = p.y - target.targetY, ad = Math.hypot(ax, ay)
        mx = ad > 1 ? ax / ad : -dx / d; my = ad > 1 ? ay / ad : -dy / d
      }
    } else if (p.strainSkillCd <= 0 && d < 145) {
      // Deliberately aim toward the target for F instead of attacking while fleeing.
      mx = dx / d; my = dy / d; g.input.queueFever()
    }
  }
  Object.assign(g.input.state, { left: mx < -0.35, right: mx > 0.35, up: my < -0.35, down: my > 0.35 })
}
function track(g) {
  const stats = { casts: 0, hits: 0, kills: 0 }
  const c = g.weaponSystem.shadowCombat, hit = c.hit.bind(c), cast = c.useAssault.bind(c)
  c.hit = (...args) => { const result = hit(...args); if (result.landed) stats.hits++; if (result.killed) stats.kills++; return result }
  c.useAssault = () => { const used = cast(); if (used) stats.casts++; return used }
  return stats
}
function validate(g) {
  assert.equal(g.weaponSystem._projectiles.length, 0)
  assert.equal(g.weaponSystem.devours, 0)
  assert.ok(Number.isFinite(g.player.x) && Number.isFinite(g.player.y) && Number.isFinite(g.player.hp))
}
const crowds = [], bosses = []
try {
  for (const seed of [311, 733, 2026]) {
    Math.random = randomFor(seed)
    const g = createArena('shadow')
    g.configureRun({ mode: 'timed', difficulty: 'normal' }); g.reset(); g.running = true
    g.onLevelUp = options => {
      const priorities = ['ass_echo', 'ass_lethal', 'ass_execute', 'ass_decoy', 'ass_legion', 'ass_stride', 'ass_cleave', 'ass_capstone', 'com_regen', 'com_vital']
      g.applySkill(priorities.map(id => options.find(s => s.id === id)).find(Boolean) || options[0]); g.resume()
    }
    const stats = track(g)
    let deaths = 0
    try {
      for (let frame = 0; frame < 120 * 60; frame++) {
        if (g.player.dead) { deaths++; g.reset(); g.running = true }
        steer(g, nearest(g)); g.update(DT); validate(g)
      }
      assert.ok(stats.casts > 0 && stats.hits > 20 && stats.kills > 0)
      crowds.push({ seed, deaths, ...stats })
    } finally { dispose(g) }
  }
  console.table(crowds)
  for (const level of [1, 8, 14]) {
    for (const type of ['boss-knight', 'boss-mage', 'boss-archer']) {
      Math.random = randomFor(2026)
      const g = createArena('shadow')
      g.configureRun({ mode: 'timed', difficulty: 'normal' }); g.reset(); g.running = true
      g.enemyManager._enemies.length = 0; g.enemyManager._spawnTimer = Infinity; g.enemyManager._waveTimer = -1e9
      g.worldEvents.active = false; g.mapFeatures.active = false
      g.player.level = level; g.weaponSystem.levelMul = 1.08 ** (level - 1); g._ensureRoleAwakening()
      if (level >= 8) { learn(g, 'ass_lethal'); learn(g, 'ass_stride'); learn(g, 'ass_echo'); learn(g, 'ass_execute'); learn(g, 'ass_decoy', 2); learn(g, 'ass_legion') }
      if (level >= 14) { learn(g, 'ass_lethal'); learn(g, 'ass_stride', 2); learn(g, 'ass_execute'); learn(g, 'ass_legion'); learn(g, 'ass_capstone') }
      assert.ok(Object.values(g.skillLevels).reduce((sum, n) => sum + n, 0) <= level - 1, '遵守正常升级预算')
      clearTimeout(g._evolutionTimer); g.resume()
      const boss = spawnBoss(g, 189, type); boss._reinforced = true
      const stats = track(g)
      let frame = 0
      try {
        for (; frame < 180 * 60 && boss.active && !g.player.dead; frame++) {
          boss.summonCd = Infinity
          steer(g, boss); g.update(DT); validate(g)
        }
        const row = { level, type, killed: !boss.active, hp: g.player.hp, bossHp: Math.max(0, Math.round(boss.hp)), seconds: Number((frame * DT).toFixed(1)), ...stats }
        bosses.push(row)
        assert.ok(stats.casts > 0 && stats.hits > 0, '无需杂兵即可发动影袭并持续近战')
      } finally { dispose(g) }
    }
  }
  console.table(bosses)
  assert.ok(bosses.filter(r => r.level === 14).every(r => r.killed), '完整构筑能够击败三类首领')
  for (const type of ['boss-knight', 'boss-mage', 'boss-archer']) {
    const rows = bosses.filter(r => r.type === type)
    const rates = rows.map(r => (189 - r.bossHp) / r.seconds)
    assert.ok(rates[2] > rates[1] && rates[1] > rates[0], '专精成长提高实际输出效率')
  }
  console.log('暗影回归：3 组 120 秒敌潮、9 组无杂兵首领战通过（简单机器人不代表真人胜率）')
} finally { Math.random = originalRandom }
