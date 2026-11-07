import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { createArena, spawn, spawnBoss, pressSpace, dispose, ctx2d, learn as learnLegacy } from './test-support/arena-fixture.mjs'
import { rollSkills, rollBossSkills, getSpecInfo } from './src/game/SkillPool.js'
import { RICOCHET_SKILL_BY_ID as skills, RICOCHET_ROUTES as routes, RICOCHET_RULES, rollRicochetSkills, ricochetInvestment } from './src/game/RicochetRules.js'

let passed = 0
function check(name, run) {
  const g = createArena('ricochet')
  // Timers/animation are presentation; choices still use the actual engine application path.
  g.evolutionEvent = (...args) => { g.lastEvolution = args }
  try { run(g); console.log(`✓ ${++passed}. ${name}`) } finally { dispose(g) }
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`)
const learn = (g, id, times = 1) => { for (let i = 0; i < times; i++) g.applySkill(skills[`rico_${id}`]) }
function prepare(g, route, allSeeds = true) {
  if (allSeeds) for (const id of ['split', 'pierce', 'bounce']) learn(g, id)
  else learn(g, route)
  learn(g, 'multishot'); learn(g, 'velocity'); learn(g, 'vitality'); if (!allSeeds) learn(g, 'haste')
  g.enemyManager.wave = 6
  g.player.level = 7
  g._ensureRoleAwakening()
  const options = rollSkills(g)
  const card = options.find(s => s.route === route)
  assert.ok(card?.isRicochetRoute)
  g.applySkill(card)
  assert.equal(g.weaponSystem.ricochetCombat.route, route)
}
function sweep(g, p, x, y = 0) {
  p.prevX = p.x; p.prevY = p.y
  p.x = g.player.x + x; p.y = g.player.y + y
  g.enemyManager._buildGrid()
  g.weaponSystem.ricochetCombat.resolve(p)
}

check('路线需要 5 次普通选卡和战局进度；无入口时继续随机探索', g => {
  for (const id of ['multishot', 'velocity', 'vitality']) learn(g, id)
  learn(g, 'haste', 2)
  g.enemyManager.wave = 6
  assert.ok(rollSkills(g, 99).every(s => !s.isRicochetRoute))
  learn(g, 'bounce')
  g.enemyManager.wave = 5
  assert.ok(rollSkills(g, 99).every(s => !s.isRicochetRoute))
  g.enemyManager.wave = 6
  const options = rollSkills(g)
  assert.equal(options.length, 3)
  assert.deepEqual(options.map(s => s.locked), [true, true, false])
  g.applySkill(options[0]); assert.equal(g.weaponSystem.ricochetCombat.route, null)
  g.applySkill(options[2]); assert.equal(g.weaponSystem.ricochetCombat.route, 'bounce')
  g.applySkill({ ...options[2], route: 'pierce' }); assert.equal(g.weaponSystem.ricochetCombat.route, 'bounce')
})

check('远征使用章节门槛；定向替代当次秘籍奖励且正确推进章节', g => {
  g.configureRun({ mode: 'expedition', difficulty: 'normal' })
  g.reset()
  for (const id of ['split', 'bounce', 'multishot', 'velocity', 'vitality']) learn(g, id)
  g.expeditionStage = 2; g.enemyManager.wave = 40
  assert.ok(!rollSkills(g).some(s => s.isRicochetRoute))
  g.expeditionStage = 3
  g.runState = 'stage-reward'
  g.onExpeditionReward = () => {}
  g._beginBossSettlement(true)
  g.resolveExpeditionReward(g._chapterSettlement.options[0].id)
  g.resolveExpeditionReward('tome')
  const cards = g._chapterSettlement.options
  assert.ok(cards.every(s => s.isRicochetRoute))
  g.resolveExpeditionReward(cards.find(s => s.route === 'split').id)
  assert.equal(g.expeditionStage, 4)
  assert.equal(g._pendingExpeditionStage, 0)
  assert.equal(g._pauseLock, 0)
})

for (const route of Object.keys(routes)) check(`${routes[route].name}：锁定池、保留混搭、终极门槛与唯一空格技能`, g => {
  prepare(g, route)
  const before = { ...g.skillLevels }
  let pool = rollSkills(g, 99)
  assert.ok(pool.some(s => s.kind === 'hybrid'))
  assert.ok(pool.every(s => !s.route || s.route === route))
  const other = Object.keys(routes).find(r => r !== route)
  learn(g, other); assert.equal(g.skillLevels[`rico_${other}`], before[`rico_${other}`])
  assert.equal(g.skillLevels[`rico_${other}`], 1, '旧入口保留')
  learn(g, route)
  learn(g, route === 'split' ? 'density' : route === 'pierce' ? 'sustain' : 'extension', 2)
  assert.equal(ricochetInvestment(g), 4)
  assert.ok(!rollSkills(g, 99).some(s => s.isCapstone))
  g.player.level = 14; g.enemyManager.wave = 9
  assert.ok(!rollSkills(g, 99).some(s => s.isCapstone))
  g.enemyManager.wave = 10
  pool = rollSkills(g, 99)
  assert.deepEqual(pool.filter(s => s.isCapstone).map(s => s.id), [routes[route].ultimate])
  assert.ok(!g.skillLevels.rico_bloom && !g.skillLevels.rico_breach && !g.skillLevels.rico_echo, '终极无需稀有前置')
  const ultimate = pool.find(s => s.isCapstone)
  g.applySkill(ultimate)
  assert.equal(g.strainSkill.id, ultimate.id)
  assert.equal(g.strainSkill.name, routes[route].ultimateName)
  assert.ok(!rollSkills(g, 99).some(s => s.isCapstone))
  assert.equal(getSpecInfo('gatling', g).name, routes[route].name)
  assert.equal(g.lastEvolution[3], ultimate.desc)
  assert.ok(Object.keys(g.skillLevels).filter(id => /rico_(swarm|cannon|prism)$/.test(id)).length === 1)
  const target = spawn(g)
  g.weaponSystem._projectiles.length = 0
  g.weaponSystem.fire(target)
  const normalDamage = g.weaponSystem._projectiles[0].damage
  g.weaponSystem._projectiles.length = 0
  pressSpace(g)
  const projectiles = g.weaponSystem._projectiles
  const count = g.weaponSystem.projectileCount
  if (route === 'split') {
    assert.equal(projectiles.length, count); assert.equal(g.weaponSystem.rapidVolley.remaining, 5)
    assert.equal(projectiles[0].ricochet.splitChance, 1)
    assert.equal(projectiles[0].ricochet.splitCount, 5)
    assert.equal(g.player.strainSkillCd, 12)
  } else if (route === 'pierce') {
    assert.equal(projectiles.length, 1); near(projectiles[0].damage, normalDamage * count * 8)
    assert.equal(g.weaponSystem.rapidVolley, null); assert.equal(g.player.strainSkillCd, 10)
  } else {
    assert.equal(projectiles.length, 3); near(projectiles[0].damage, normalDamage * count * 1.5)
    assert.equal(projectiles[0].ricochet.bounces, 6); assert.equal(g.player.strainSkillCd, 12)
  }
})

check('首领秘典不赠送路线或入口；重复应用无叠加；混搭必须在定向前取得两个入口', g => {
  g.player.level = 5; g._ensureRoleAwakening()
  const pool = rollBossSkills(g, 99)
  assert.equal(pool.length, 4)
  for (const s of pool) { g.applySkill(s); const n = g.weaponSystem.projectileCount; g.applySkill(s); assert.equal(g.weaponSystem.projectileCount, n) }
  assert.equal(g.weaponSystem.ricochetCombat.normalChoices, 0)
  for (let rank = 0; rank < 2; rank++) for (const card of rollBossSkills(g, 99)) assert.equal(g.applySkill(card), true)
  assert.equal(rollBossSkills(g).length, 0)
  assert.deepEqual(g.skillLevels, {})
  prepare(g, 'split', false)
  assert.ok(!rollSkills(g, 99).some(s => s.kind === 'hybrid'))
})

check('贯穿按飞行顺序衰减；同一目标不重复命中；高速扫掠不会漏过', g => {
  learn(g, 'pierce', 2)
  g.weaponSystem.projectileCount = 1
  const last = spawn(g, { x: 320 }), first = spawn(g, { x: 100 }), second = spawn(g, { x: 210 })
  g.weaponSystem.fire(first)
  const p = g.weaponSystem._projectiles[0], dmg = p.damage
  sweep(g, p, 450)
  near(first.hp, 100 - dmg); near(second.hp, 100 - dmg * .8); near(last.hp, 100 - dmg * .64)
  assert.equal(p.hitTargets.size, 3); assert.equal(p.active, false)
})

check('折射只选未命中目标，孤立首领只结算一次；折光穿梭最多续两次穿透', g => {
  prepare(g, 'bounce'); learn(g, 'pierce_bounce'); learn(g, 'bounce')
  g.weaponSystem.projectileCount = 1
  for (let i = 1; i <= 9; i++) spawn(g, { x: i * 100, hp: 10000 })
  g.weaponSystem.fire(g.enemyManager.enemies[0])
  const p = g.weaponSystem._projectiles[0]
  for (let i = 0; p.active && i < 12; i++) {
    p.prevX = p.x; p.prevY = p.y
    const target = p.target || g.weaponSystem.ricochetCombat.findTarget(p.x, p.y, p.hitTargets)
    if (!target) break
    p.x = target.x; p.y = target.y; g.enemyManager._buildGrid(); g.weaponSystem.ricochetCombat.resolve(p)
  }
  assert.ok(p.ricochet.turns <= 3)
  assert.equal(p.ricochet.hybridPierces, 0)
  assert.equal(p.hitTargets.size, 7)
  g.weaponSystem._projectiles.length = 0; g.enemyManager._enemies.length = 0
  const boss = spawnBoss(g, 10000)
  g.weaponSystem.fire(boss)
  const lone = g.weaponSystem._projectiles[0]
  sweep(g, lone, 150)
  assert.equal(lone.hitTargets.size, 1); assert.equal(lone.active, true, '首击剩余贯穿继续直飞')
  sweep(g, lone, 250)
  assert.equal(lone.hitTargets.size, 1)
})

check('首次主弹命中只分裂一次；子弹不再分裂，爆炸每轮最多两次且不递归', g => {
  prepare(g, 'split'); learn(g, 'density', 2); learn(g, 'bloom'); learn(g, 'split_pierce'); learn(g, 'split_bounce')
  g.weaponSystem.projectileCount = 1
  const target = spawn(g, { x: 80, hp: 1000 })
  for (let i = 0; i < 8; i++) spawn(g, { x: 200 + i * 95, hp: .1 })
  g.weaponSystem.fire(target)
  const main = g.weaponSystem._projectiles[0]
  main.ricochet.splitChance = 1
  sweep(g, main, 120)
  const children = g.weaponSystem._projectiles.filter(p => p.isSplit)
  assert.equal(children.length, 4)
  assert.ok(children.every(p => !p.ricochet.main && !p.ricochet.splitChance && p.pierces === 1 && p.ricochet.bounces === 1))
  const state = g.weaponSystem.ricochetCombat
  for (const p of children) {
    const e = g.enemyManager.enemies.find(e => e.active && e !== target)
    if (e) state.hit(p, e)
  }
  assert.equal(main.ricochet.volley.blooms, 2)
  assert.equal(state.metrics.splits, 4)
  assert.equal(g.weaponSystem.stats.explosions, 2)
  if (main.active) sweep(g, main, 500)
  assert.equal(state.metrics.splits, 4)
})

check('回响不再分裂或回响；护盾/击杀结算经过实体接口，空场不扣冷却', g => {
  prepare(g, 'bounce'); learn(g, 'echo')
  g.weaponSystem.projectileCount = 1
  const target = spawn(g, { x: 80 })
  const next = spawn(g, { x: 180 })
  target.shieldHits = 1
  g.weaponSystem.fire(target)
  const p = g.weaponSystem._projectiles[0], state = g.weaponSystem.ricochetCombat
  sweep(g, p, 110)
  assert.equal(target.hp, 100); assert.equal(target.shieldHits, 0)
  p.ricochet.bounces = 0
  p.active = true; p.ricochet.turns = 1; p.x = g.player.x + 100; p.y = g.player.y
  // Add an unhit target within range before terminal echo is requested.
  const echoTarget = spawn(g, { x: 270 })
  const beforeEcho = new Set(g.weaponSystem._projectiles)
  state.continueAfterHit(p)
  const echo = g.weaponSystem._projectiles.find(s => !beforeEcho.has(s))
  assert.ok(echo); assert.equal(echo.ricochet.bounces, 1)
  assert.ok(!echo.ricochet.echo && !echo.ricochet.splitChance)
  g.enemyManager._enemies.length = 0; g.player.strainSkillCd = 0
  pressSpace(g); assert.equal(g.player.strainSkillCd, 0)
  assert.ok(echoTarget.active && next.active)
})

check('重开清空路线；原生不再保留加特林职业树', g => {
  prepare(g, 'pierce')
  g.reset()
  assert.equal(g.weaponSystem.ricochetCombat.route, null)
  assert.equal(g.weaponSystem.ricochetCombat.normalChoices, 0)
  assert.equal(g.strainSkill.name, '疾射')
  g.applyStartingStrain('origin'); g.reset(); g.player.level = 6
  g.primarySpec = 'gatling'; g._applyPrimarySpecBonus('gatling')
  learnLegacy(g, 'gat_multishot', 2)
  assert.ok(!rollSkills(g, 99).some(s => s.id === 'gat_split'))
  assert.ok(!rollSkills(g, 99).some(s => s.isRicochetSkill))
  assert.equal(g.strainSkill.id, 'slime_shock')
  assert.equal(getSpecInfo('gatling', g).name, '机枪风暴')
})

check('达到弹体上限后拒绝新弹体且不溢出', g => {
  const state = g.weaponSystem.ricochetCombat
  for (let i = 0; i < RICOCHET_RULES.projectileLimit; i++) {
    assert.ok(state.spawn({ x: 0, y: 0, speed: 1, damage: 1, life: 10 }, {}))
  }
  assert.equal(state.spawn({ x: 0, y: 0 }, {}), null)
  assert.equal(g.weaponSystem._projectiles.length, RICOCHET_RULES.projectileLimit)
})

check('随机分布：可错过目标入口，终极不会固定置顶或保证获得', g => {
  let seed = 90210
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
  let absent = 0
  for (let run = 0; run < 2000; run++) {
    const fake = { startingStrain: 'ricochet', player: { level: 6 }, enemyManager: { wave: 5 }, skillLevels: {}, weaponSystem: { ricochetCombat: { route: null, normalChoices: 0 } } }
    for (let i = 0; i < 5; i++) {
      const cards = rollRicochetSkills(fake, 3, random)
      const chosen = cards.find(s => s.id === 'rico_split') || cards[Math.floor(random() * cards.length)]
      fake.skillLevels[chosen.id] = (fake.skillLevels[chosen.id] || 0) + 1
    }
    if (!fake.skillLevels.rico_split) absent++
  }
  assert.ok(absent > 5 && absent < 150, `5 抽未遇分裂：${absent}/2000`)
  prepare(g, 'bounce'); learn(g, 'bounce'); learn(g, 'extension', 2)
  g.player.level = 14; g.enemyManager.wave = 10
  const positions = [0, 0, 0]; let missed = 0
  for (let i = 0; i < 2000; i++) {
    const cards = rollRicochetSkills(g, 3, random), index = cards.findIndex(s => s.isCapstone)
    if (index < 0) missed++; else positions[index]++
  }
  assert.ok(missed > 100 && positions.every(n => n > 20), `${JSON.stringify({ missed, positions })}`)
  console.log(`  5 次探索未遇分裂 ${absent}/2000；达标后单面板未出现终极 ${missed}/2000；出现位置 ${positions}`)
})

for (const route of Object.keys(routes)) check(`${routes[route].name}：真实帧群怪与首领压力、弹数上限、有限连锁`, g => {
  prepare(g, route)
  learn(g, route); learn(g, route === 'split' ? 'density' : route === 'pierce' ? 'sustain' : 'extension', 2)
  g.player.level = 14; g.enemyManager.wave = 10
  g.applySkill(skills[routes[route].ultimate]); g._pauseLock = 0; g.running = true
  g.player.invincible = 100; g.player.expGainMul = 0
  g.mapFeatures.barricades = []
  for (let i = 0; i < 120; i++) {
    const a = i * 2.399963, distance = 120 + i * 4
    spawn(g, { x: Math.cos(a) * distance, y: Math.sin(a) * distance, hp: 5 })
  }
  spawnBoss(g, 3000)
  g.enemyManager._buildGrid(); pressSpace(g)
  const start = performance.now()
  let maxProjectiles = 0
  for (let frame = 0; frame < 600; frame++) {
    g.update(1 / 60)
    maxProjectiles = Math.max(maxProjectiles, g.weaponSystem._projectiles.length)
    assert.ok(g.weaponSystem._projectiles.every(p => Number.isFinite(p.x + p.y + p.damage) && p.hitTargets.size <= 30))
  }
  g.render(ctx2d)
  assert.ok(maxProjectiles <= RICOCHET_RULES.projectileLimit)
  assert.ok(g.weaponSystem.kills > 0)
  console.log(`  10 秒 / 120 敌人+首领：击杀 ${g.weaponSystem.kills}、峰值弹体 ${maxProjectiles}、耗时 ${Math.round(performance.now() - start)}ms`)
})
console.log(`verify-ricochet：${passed} 组通过`)
