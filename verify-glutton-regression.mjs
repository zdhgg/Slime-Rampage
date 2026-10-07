// 固定随机种子的真实帧管线回归：正常敌潮与无杂兵首领战。机器人只操作方向和空格。
import assert from 'node:assert/strict'
import { createArena, spawnBoss, learn, dispose } from './test-support/arena-fixture.mjs'

const originalRandom = Math.random
const randomFor = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
const DT = 1 / 60
function steer(game, target) {
  const p = game.player
  let mx = 0, my = 0
  if (target) {
    const dx = target.x - p.x, dy = target.y - p.y, d = Math.hypot(dx, dy) || 1
    const desired = p.radius + target.radius + (target.isBoss ? 30 : 22)
    const direction = d > desired + 5 ? 1 : d < desired - 6 ? -1 : 0
    mx = dx / d * direction; my = dy / d * direction
    if (target.isBoss && direction === 0) { mx = -dy / d; my = dx / d }
    if (target.isBoss && ['telegraph', 'active', 'charge'].includes(target.specialState)) {
      mx = -dy / d; my = dx / d
      if (target.type === 'boss-mage') {
        const ax = p.x - target.targetX, ay = p.y - target.targetY, ad = Math.hypot(ax, ay)
        mx = ad > 1 ? ax / ad : -dx / d
        my = ad > 1 ? ay / ad : -dy / d
      }
    }
  }
  Object.assign(game.input.state, { left: mx < -0.35, right: mx > 0.35, up: my < -0.35, down: my > 0.35 })
  if (game.player.gluttonCharge > 0 && game.weaponSystem.gluttonCombat.nearest(true)) game.input.queueFever()
}
function nearest(game) {
  let target = null, distance = Infinity
  for (const e of game.enemyManager.enemies) {
    if (!e.active || e.devouring) continue
    const d = Math.hypot(e.x - game.player.x, e.y - game.player.y)
    if (d < distance) { target = e; distance = d }
  }
  return target
}
function track(game) {
  const stats = { casts: 0, normal: 0, fDevours: 0, bossHits: 0, firstCharge: null }
  const c = game.weaponSystem.gluttonCombat
  const heavy = c.heavyBite.bind(c)
  c.heavyBite = () => { const used = heavy(); if (used) stats.casts++; return used }
  const onDevoured = game.weaponSystem.onDevoured.bind(game.weaponSystem)
  game.weaponSystem.onDevoured = (e, context) => {
    const charge = game.player.gluttonCharge, progress = game.player.gluttonDevourProgress
    const settled = e._settled
    onDevoured(e, context)
    if (settled) return
    if (context?.source === 'gluttonF') {
      stats.fDevours++
      assert.equal(game.player.gluttonCharge, charge, 'F 吞噬不产生猎食点')
      assert.equal(game.player.gluttonDevourProgress, progress, 'F 吞噬不贡献进度')
    } else stats.normal++
  }
  const hit = c.hit.bind(c)
  c.hit = (e, damage, options) => {
    const landed = hit(e, damage, options)
    if (landed && e.isBoss && options?.basic) stats.bossHits++
    return landed
  }
  return stats
}
function validate(game) {
  const p = game.player
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.hp))
  assert.ok(p.gluttonCharge >= 0 && p.gluttonCharge <= 2)
  assert.ok(p.gluttonDevourProgress >= 0 && p.gluttonDevourProgress < 5)
  assert.equal(game.weaponSystem._projectiles.length, 0, '暴食不再产生远程飞弹')
}

const crowds = []
try {
  for (const seed of [311, 733, 1559, 2026, 4027, 9199]) {
    Math.random = randomFor(seed)
    const g = createArena()
    g.configureRun({ mode: 'timed', difficulty: 'normal' }); g.reset(); g.running = true
    g.onLevelUp = options => {
      const priorities = ['glut_maw', 'glut_bulk', 'glut_ram', 'glut_eruption', 'com_regen']
      const choice = priorities.map(id => options.find(s => s.id === id)).find(Boolean) || options[0]
      g.applySkill(choice); g.resume()
    }
    const stats = track(g)
    let deaths = 0
    try {
      for (let frame = 0; frame < 180 * 60; frame++) {
        if (g.player.dead) { deaths++; g.reset(); g.running = true }
        steer(g, nearest(g))
        g.update(DT)
        validate(g)
        if (stats.firstCharge === null && g.player.gluttonCharge > 0) stats.firstCharge = Number((frame * DT).toFixed(1))
      }
      assert.ok(stats.normal > 0 && stats.casts > 0, `seed ${seed} 必须发生正常捕食与主动重咬`)
      assert.ok(stats.firstCharge > 1 && stats.firstCharge < 90, `seed ${seed} 前期能够自然获取资源`)
      crowds.push({ seed, deaths, ...stats })
    } finally { dispose(g) }
  }
  console.table(crowds)
  assert.ok(crowds.every(r => r.fDevours > 0), '全部种子都能用重咬完成吞噬')

  const bosses = []
  for (const level of [1, 8, 14]) {
    for (const type of ['boss-knight', 'boss-mage', 'boss-archer']) {
      Math.random = randomFor(2026)
      const g = createArena()
      g.configureRun({ mode: 'timed', difficulty: 'normal' }); g.reset(); g.running = true
      g.enemyManager._enemies.length = 0
      g.enemyManager._spawnTimer = Infinity
      g.enemyManager._waveTimer = -1e9
      g.worldEvents.active = false
      g.mapFeatures.active = false
      g.player.level = level
      g.weaponSystem.levelMul = 1.08 ** (level - 1)
      g.weaponSystem.critChance = 0
      g._ensureRoleAwakening()
      if (level >= 8) { learn(g, 'glut_maw', 2); learn(g, 'glut_bulk', 2); learn(g, 'glut_ram', 2); learn(g, 'glut_eruption') }
      if (level >= 14) { learn(g, 'glut_maw'); learn(g, 'glut_bulk'); learn(g, 'glut_ram'); learn(g, 'glut_eruption'); learn(g, 'glut_capstone') }
      clearTimeout(g._evolutionTimer); g.resume()
      const boss = spawnBoss(g, 189, type)
      boss._reinforced = true // 隔离无杂兵场景，只保留首领本身的移动/攻击/阶段。
      boss.summonCd = Infinity
      const stats = track(g)
      let frame = 0
      try {
        for (; frame < 180 * 60 && boss.active && !g.player.dead; frame++) {
          boss.summonCd = Infinity // 二阶段会重设召唤冷却，无杂兵场景继续屏蔽召唤。
          steer(g, boss)
          g.update(DT)
          validate(g)
        }
        bosses.push({ level, type, killed: !boss.active, hp: g.player.hp, bossHp: Math.round(boss.hp), seconds: Number((frame * DT).toFixed(1)), casts: stats.casts, hits: stats.bossHits })
        assert.ok(stats.bossHits > 0, '首领必须受到真实近战命中')
        assert.equal(g.weaponSystem.devours, 0, '无杂兵首领场景不能依赖吞噬奖励')
      } finally { dispose(g) }
    }
  }
  console.table(bosses)
  assert.ok(bosses.every(r => r.casts > 0), '全部等级和首领种类都能独立获取并使用猎食点')
  // Lv.1 对战 189 HP 首领是资源压力场景，不要求简单走位机器人必胜。
  assert.ok(bosses.every(r => r.bossHp < 189 / 2), '全部场景能持续近战输出，不会资源枯竭停滞')
  assert.ok(bosses.filter(r => r.level === 14).every(r => r.killed), '完整近战构筑可以击败三类首领')
  for (const type of ['boss-knight', 'boss-mage', 'boss-archer']) {
    const rows = bosses.filter(r => r.type === type)
    const throughput = rows.map(r => (189 - Math.max(0, r.bossHp)) / r.seconds)
    assert.ok(throughput[2] > throughput[1] && throughput[1] > throughput[0], '三档成长均提高实际输出效率')
  }
  console.log('暴食回归：6 组 180 秒敌潮、9 组无杂兵首领资源/成长场景通过（含低等级失败场景）')
} finally { Math.random = originalRandom }
