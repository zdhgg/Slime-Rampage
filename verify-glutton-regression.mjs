// 固定随机种子的真实帧管线回归：正常敌潮与无杂兵首领战。机器人只操作方向和空格。
import assert from 'node:assert/strict'
import { createArena, spawnBoss, learn, dispose } from './test-support/arena-fixture.mjs'
import { GLUTTON_SKILL_BY_ID } from './src/game/GluttonBuild.js'

const originalRandom = Math.random
const randomFor = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
const DT = 1 / 60

function steer(game, target) {
  const p = game.player
  let mx = 0, my = 0
  if (target) {
    const dx = target.x - p.x, dy = target.y - p.y, d = Math.hypot(dx, dy) || 1
    const desired = p.radius + target.radius + (target.isBoss ? 28 : 20)
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
    if (p.strainSkillCd <= 0 && d <= 200) {
      game.input.queueFever()
    }
  }
  Object.assign(game.input.state, { left: mx < -0.35, right: mx > 0.35, up: my < -0.35, down: my > 0.35 })
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
  const stats = { casts: 0, normal: 0, fDevours: 0, bossHits: 0, firstBurst: null }
  const c = game.weaponSystem.gluttonCombat
  const useVortex = c.useVortex.bind(c)
  c.useVortex = () => { const used = useVortex(); if (used) stats.casts++; return used }
  const onDevoured = game.weaponSystem.onDevoured.bind(game.weaponSystem)
  game.weaponSystem.onDevoured = (e, context) => {
    const settled = e._settled
    onDevoured(e, context)
    if (settled) return
    if (context?.source === 'gluttonF') stats.fDevours++
    else stats.normal++
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
  const p = game.player, c = game.weaponSystem.gluttonCombat
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.hp))
  assert.ok(p.gluttonSatiety >= 0 && p.gluttonSatiety <= 9)
  assert.ok(p.gluttonGuard >= 0 && p.gluttonGuard <= c.guardMax)
  assert.equal(game.weaponSystem._projectiles.length, 0, '暴食不再产生远程飞弹')
}

const crowds = []
try {
  for (const seed of [311, 733, 1559, 2026, 4027, 9199]) {
    Math.random = randomFor(seed)
    const g = createArena()
    g.configureRun({ mode: 'timed', difficulty: 'normal' }); g.reset(); g.running = true
    g.onLevelUp = options => {
      const priorities = ['glut_maw', 'glut_ram', 'glut_bulk', 'glut_bite_sweep', 'glut_acid_aura', 'glut_eruption', 'glut_aftershock', 'glut_counter', 'com_regen']
      const choice = priorities.map(id => options.find(s => s.id === id)).find(Boolean) || options.find(s => !s.locked) || options[0]
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
        if (stats.firstBurst === null && g.weaponSystem.stats.overflowWaves > 0) stats.firstBurst = Number((frame * DT).toFixed(1))
      }
      const bursts = g.weaponSystem.stats.overflowWaves || 0
      assert.ok(stats.normal > 0 && stats.casts > 0, `seed ${seed} 必须发生正常捕食与深渊吸噬`)
      assert.ok(bursts > 0 && stats.firstBurst > 0 && stats.firstBurst < 90, `seed ${seed} 前期能够自然攒满饱食酸浪`)
      crowds.push({ seed, deaths, bursts, ...stats })
    } finally { dispose(g) }
  }
  console.table(crowds)
  assert.ok(crowds.every(r => r.fDevours > 0 || r.casts > 0), '全部种子都能使用深渊吸噬聚怪收割')

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
      if (level >= 8) {
        learn(g, 'glut_maw', 2); learn(g, 'glut_bulk', 2); learn(g, 'glut_ram', 2)
        g.weaponSystem.gluttonCombat.route = 'mire'
        g.applySkill(GLUTTON_SKILL_BY_ID.glut_acid_aura)
        g.applySkill(GLUTTON_SKILL_BY_ID.glut_eruption)
      }
      if (level >= 14) {
        learn(g, 'glut_maw'); learn(g, 'glut_bulk'); learn(g, 'glut_ram')
        g.applySkill(GLUTTON_SKILL_BY_ID.glut_acid_aura)
        learn(g, 'glut_capstone')
      }
      clearTimeout(g._evolutionTimer); g.resume()
      const boss = spawnBoss(g, 189, type)
      boss._reinforced = true
      boss.summonCd = Infinity
      const stats = track(g)
      let frame = 0
      let prevHits = 0, lastHitFrame = -1, maxGapFrames = 0
      try {
        for (; frame < 180 * 60 && boss.active && !g.player.dead; frame++) {
          boss.summonCd = Infinity
          steer(g, boss)
          g.update(DT)
          validate(g)
          if (stats.bossHits > prevHits) {
            prevHits = stats.bossHits
            if (lastHitFrame >= 0) maxGapFrames = Math.max(maxGapFrames, frame - lastHitFrame)
            lastHitFrame = frame
          }
        }
        bosses.push({ level, type, killed: !boss.active, hp: g.player.hp, bossHp: Math.round(boss.hp), seconds: Number((frame * DT).toFixed(1)), casts: stats.casts, hits: stats.bossHits, maxGap: Number((maxGapFrames * DT).toFixed(1)) })
        assert.ok(stats.bossHits > 0, '首领必须受到真实近战命中')
        assert.equal(g.weaponSystem.devours, 0, '无杂兵首领场景不能依赖吞噬奖励')
      } finally { dispose(g) }
    }
  }
  console.table(bosses)
  assert.ok(bosses.every(r => r.casts > 0), '全部等级和首领种类都能稳定释放深渊吸噬')
  assert.ok(bosses.every(r => r.level === 1 ? r.bossHp < 189 * 0.75 : r.bossHp < 189 / 2), '全部场景能持续近战输出，不会资源枯竭停滞')
  assert.ok(bosses.every(r => r.maxGap < 6), '命中间隔有界，近战追击窗口健康')
  assert.ok(bosses.filter(r => r.level === 14).every(r => r.killed), '完整近战构筑可以击败三类首领')
  for (const type of ['boss-knight', 'boss-mage', 'boss-archer']) {
    const rows = bosses.filter(r => r.type === type)
    const throughput = rows.map(r => (189 - Math.max(0, r.bossHp)) / r.seconds)
    assert.ok(throughput[2] > throughput[1] && throughput[1] > throughput[0], '三档成长均提高实际输出效率')
  }
  console.log('暴食回归：6 组 180 秒敌潮、9 组无杂兵首领资源/成长场景通过')
} finally { Math.random = originalRandom }
