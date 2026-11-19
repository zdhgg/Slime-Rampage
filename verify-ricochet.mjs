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
  g.enemyManager.wave = RICOCHET_RULES.routeWave
  g.player.level = 6
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

check('路线需要 4 次普通选卡和战局进度；无入口时继续随机探索', g => {
  for (const id of ['multishot', 'velocity', 'vitality', 'haste']) learn(g, id)
  g.enemyManager.wave = RICOCHET_RULES.routeWave
  assert.ok(rollSkills(g, 99).every(s => !s.isRicochetRoute))
  learn(g, 'bounce')
  g.enemyManager.wave = RICOCHET_RULES.routeWave - 1
  assert.ok(rollSkills(g, 99).every(s => !s.isRicochetRoute))
  g.enemyManager.wave = RICOCHET_RULES.routeWave
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
  for (const id of ['split', 'bounce', 'multishot', 'velocity']) learn(g, id)
  g.expeditionStage = 1; g.enemyManager.wave = 40
  assert.ok(!rollSkills(g).some(s => s.isRicochetRoute))
  g.expeditionStage = RICOCHET_RULES.routeStage
  g.runState = 'stage-reward'
  g.onExpeditionReward = () => {}
  g._beginBossSettlement(true)
  g.resolveExpeditionReward(g._chapterSettlement.options[0].id)
  g.resolveExpeditionReward('tome')
  const cards = g._chapterSettlement.options
  assert.ok(cards.every(s => s.isRicochetRoute))
  g.resolveExpeditionReward(cards.find(s => s.route === 'split').id)
  assert.equal(g.expeditionStage, RICOCHET_RULES.routeStage + 1)
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
  learn(g, route === 'split' ? 'density' : route === 'pierce' ? 'sustain' : 'extension', 1)
  assert.equal(ricochetInvestment(g), RICOCHET_RULES.ultimateInvestment)
  assert.ok(!rollSkills(g, 99).some(s => s.isCapstone))
  g.player.level = RICOCHET_RULES.ultimateLevel; g.enemyManager.wave = RICOCHET_RULES.ultimateWave - 1
  assert.ok(!rollSkills(g, 99).some(s => s.isCapstone))
  g.enemyManager.wave = RICOCHET_RULES.ultimateWave
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
    assert.equal(projectiles[0].ricochet.splitCount, 6)
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

check('贯穿按飞行顺序结算；定向后 100% 保伤且穿甲过载越穿越高', g => {
  learn(g, 'pierce', 2)
  g.weaponSystem.projectileCount = 1
  const last = spawn(g, { x: 320 }), first = spawn(g, { x: 100 }), second = spawn(g, { x: 210 })
  g.weaponSystem.fire(first)
  const p = g.weaponSystem._projectiles[0], dmg = p.damage
  sweep(g, p, 450)
  near(first.hp, 100 - dmg); near(second.hp, 100 - dmg * .9); near(last.hp, 100 - dmg * .81)
  assert.equal(p.hitTargets.size, 3); assert.equal(p.active, false)

  // 定向贯穿重炮 + 穿甲过载：100% 保伤且每穿一敌递增 +15%，首领再 +15%
  prepare(g, 'pierce'); learn(g, 'sustain', 1)
  g.enemyManager._enemies.length = 0; g.weaponSystem._projectiles.length = 0
  const m1 = spawn(g, { x: 100, hp: 1000 }), m2 = spawn(g, { x: 200, hp: 1000 }), boss = spawnBoss(g, 1000)
  boss.x = g.player.x + 300; boss.y = g.player.y
  g.weaponSystem.fire(m1)
  const heavy = g.weaponSystem._projectiles[0], d0 = heavy.damage
  sweep(g, heavy, 380)
  near(m1.hp, 1000 - d0)
  near(m2.hp, 1000 - d0 * 1.15)
  near(boss.hp, 1000 - d0 * 1.3 * 1.15)
})

check('破阵冲击在贯穿或暴击时爆发；破城弹头首击增伤并前向溅射', g => {
  prepare(g, 'pierce'); learn(g, 'shock', 1); learn(g, 'breach')
  g.weaponSystem.projectileCount = 1
  const front = spawn(g, { x: 100, hp: 1 })
  const back = spawn(g, { x: 170, hp: 1000 })
  const side = spawn(g, { x: 185, y: 40, hp: 1000 })
  g.weaponSystem.fire(front)
  const p = g.weaponSystem._projectiles[0]
  const src = p.ricochet.sourceDamage
  sweep(g, p, 240)
  assert.equal(front.active, false)
  // 击杀 front 触发前向碎甲溅射（0.9×），贯穿命中 back 触发破阵冲击（0.75×）
  assert.ok(side.hp < 1000)
  assert.ok(back.hp < 1000 - src)
})

check('折射优先未命中目标；多目标允许乒乓反弹；孤立首领只打一次；折光穿梭续穿透', g => {
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
  assert.equal(p.ricochet.hybridPierces, 1)
  assert.equal(p.hitTargets.size, 8)

  // 乒乓折射：只有首领与一名小怪时来回弹射，直到次数耗尽
  g.weaponSystem._projectiles.length = 0; g.enemyManager._enemies.length = 0
  const mob = spawn(g, { x: 120, hp: 10000 }), boss = spawnBoss(g, 10000)
  boss.x = g.player.x + 260; boss.y = g.player.y
  g.weaponSystem.fire(mob)
  const ping = g.weaponSystem._projectiles[0]
  ping.pierces = 0
  const hitsBefore = ping.ricochet.turns
  for (let i = 0; ping.active && i < 12; i++) {
    ping.prevX = ping.x; ping.prevY = ping.y
    const t = ping.target
    if (!t) break
    ping.x = t.x; ping.y = t.y; g.enemyManager._buildGrid(); g.weaponSystem.ricochetCombat.resolve(ping)
  }
  assert.equal(ping.ricochet.turns, hitsBefore + 3)
  assert.ok(boss.hp < 10000 && mob.hp < 10000)

  // 孤立首领：绝不自己弹自己
  g.weaponSystem._projectiles.length = 0; g.enemyManager._enemies.length = 0
  const loneBoss = spawnBoss(g, 10000)
  g.weaponSystem.fire(loneBoss)
  const lone = g.weaponSystem._projectiles[0]
  lone.pierces = 0
  sweep(g, lone, 150)
  assert.equal(lone.hitTargets.size, 1); assert.equal(lone.active, false, '无第二目标时停止折射')
})

check('裂殖母体必定分裂；孢弹不再分裂，爆裂孢弹支持击杀与首领叠层引爆', g => {
  prepare(g, 'split'); learn(g, 'density', 2); learn(g, 'bloom'); learn(g, 'hunt'); learn(g, 'split_pierce'); learn(g, 'split_bounce')
  g.weaponSystem.projectileCount = 1
  const target = spawn(g, { x: 80, hp: 1000 })
  for (let i = 0; i < 8; i++) spawn(g, { x: 200 + i * 95, hp: .1 })
  g.weaponSystem.fire(target)
  const main = g.weaponSystem._projectiles[0]
  assert.equal(main.ricochet.splitChance, 1)
  sweep(g, main, 120)
  const children = g.weaponSystem._projectiles.filter(p => p.isSplit)
  assert.equal(children.length, 4)
  assert.ok(children.every(p => !p.ricochet.main && !p.ricochet.splitChance && p.pierces === 2 && p.ricochet.bounces === 2))
  const state = g.weaponSystem.ricochetCombat
  for (const p of children) {
    const e = g.enemyManager.enemies.find(e => e.active && e !== target)
    if (e) state.hit(p, e)
  }
  assert.equal(main.ricochet.volley.blooms, 4)
  assert.equal(state.metrics.splits, 4)
  assert.equal(g.weaponSystem.stats.explosions, 4)
  // 首领累计 4 枚孢弹命中直接引爆
  const boss = spawnBoss(g, 1000)
  for (let i = 0; i < 4; i++) state.hit(children[i], boss)
  assert.equal(g.weaponSystem.stats.explosions, 5)
  if (main.active) sweep(g, main, 500)
  assert.equal(state.metrics.splits, 4)
})

check('空格疾射逐轮扫射：同轮弹体分散锁定、各轮换锁新目标，耗尽后回落集火', g => {
  prepare(g, 'split')
  g.weaponSystem.projectileCount = 3
  g.weaponSystem.cooldown = 100
  for (let i = 0; i < 6; i++) spawn(g, { x: 100 + i * 60, y: (i % 2 ? 90 : -90), hp: 10000 })
  g.weaponSystem._projectiles.length = 0
  pressSpace(g)
  const v1 = [...g.weaponSystem._projectiles]
  assert.equal(v1.length, 3)
  assert.equal(new Set(v1.map(p => p.target)).size, 3, '同轮 3 弹应各锁一个不同敌人')
  g.weaponSystem._projectiles.length = 0
  g.weaponSystem.update(0.13)
  const v2 = [...g.weaponSystem._projectiles]
  assert.equal(v2.length, 3)
  const claimed = new Set(v1.map(p => p.target))
  assert.ok(v2.every(p => p.target && !claimed.has(p.target)), '第二轮应换锁未被占用的敌人')
  for (const e of g.enemyManager.enemies) e.active = false
  const only = spawn(g, { x: 150, hp: 10000 })
  g.weaponSystem._projectiles.length = 0
  g.weaponSystem.update(0.13)
  assert.ok(g.weaponSystem._projectiles.length > 0)
  assert.ok(g.weaponSystem._projectiles.every(p => p.target === only), '无可锁目标时应集火最近敌人')
})

check('棱镜分束首跳一分为二且不递归；空场不扣冷却', g => {
  prepare(g, 'bounce', false); learn(g, 'echo')
  g.weaponSystem.projectileCount = 1
  const target = spawn(g, { x: 80, hp: 1000 })
  const next = spawn(g, { x: 180, hp: 1000 })
  const third = spawn(g, { x: 260, hp: 1000 })
  target.shieldHits = 1
  g.weaponSystem.fire(target)
  const p = g.weaponSystem._projectiles[0]
  sweep(g, p, 110)
  assert.equal(target.hp, 1000); assert.equal(target.shieldHits, 0)
  const splitBeam = g.weaponSystem._projectiles.find(s => s !== p)
  assert.ok(splitBeam, '首跳应分束产生衍生光弹')
  assert.equal(splitBeam.ricochet.echo, false)
  assert.equal(splitBeam.ricochet.bounces, p.ricochet.bounces)
  assert.ok(third.active && next.active)
  g.enemyManager._enemies.length = 0; g.player.strainSkillCd = 0
  pressSpace(g); assert.equal(g.player.strainSkillCd, 0)
})

check('聚焦晶核纯正面提升暴击且不拖慢射速', g => {
  const intervalBefore = g.weaponSystem.fireInterval
  const critBefore = g.weaponSystem.critChance
  const mulBefore = g.weaponSystem.critMul
  learn(g, 'compression', 2)
  near(g.weaponSystem.fireInterval, intervalBefore)
  near(g.weaponSystem.critChance, critBefore + .2)
  near(g.weaponSystem.critMul, mulBefore + .7)
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
    const fake = { startingStrain: 'ricochet', player: { level: 5 }, enemyManager: { wave: 3 }, skillLevels: {}, weaponSystem: { ricochetCombat: { route: null, normalChoices: 0 } } }
    for (let i = 0; i < RICOCHET_RULES.choicesBeforeRoute; i++) {
      const cards = rollRicochetSkills(fake, 3, random)
      const chosen = cards.find(s => s.id === 'rico_split') || cards[Math.floor(random() * cards.length)]
      fake.skillLevels[chosen.id] = (fake.skillLevels[chosen.id] || 0) + 1
    }
    if (!fake.skillLevels.rico_split) absent++
  }
  assert.ok(absent > 20 && absent < 600, `4 抽未遇分裂：${absent}/2000`)
  prepare(g, 'bounce'); learn(g, 'bounce'); learn(g, 'extension', 1)
  g.player.level = RICOCHET_RULES.ultimateLevel; g.enemyManager.wave = RICOCHET_RULES.ultimateWave
  const positions = [0, 0, 0]; let missed = 0
  for (let i = 0; i < 2000; i++) {
    const cards = rollRicochetSkills(g, 3, random), index = cards.findIndex(s => s.isCapstone)
    if (index < 0) missed++; else positions[index]++
  }
  assert.ok(missed > 100 && positions.every(n => n > 20), `${JSON.stringify({ missed, positions })}`)
  console.log(`  4 次探索未遇分裂 ${absent}/2000；达标后单面板未出现终极 ${missed}/2000；出现位置 ${positions}`)
})

for (const route of Object.keys(routes)) check(`${routes[route].name}：真实帧群怪与首领压力、弹数上限、有限连锁`, g => {
  prepare(g, route)
  learn(g, route); learn(g, route === 'split' ? 'density' : route === 'pierce' ? 'sustain' : 'extension', 1)
  g.player.level = RICOCHET_RULES.ultimateLevel; g.enemyManager.wave = RICOCHET_RULES.ultimateWave
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
check('巨炮齐射数缩放计至 7，秘典弹仓不放大终极', g => {
  prepare(g, 'pierce'); learn(g, 'pierce', 2); learn(g, 'sustain')
  g.player.level = RICOCHET_RULES.ultimateLevel; g.enemyManager.wave = RICOCHET_RULES.ultimateWave
  assert.equal(g.applySkill(skills.rico_cannon), true)
  g._pauseLock = 0; g.running = true
  g.weaponSystem.projectileCount = 9
  const target = spawn(g)
  g.weaponSystem._projectiles.length = 0
  g.weaponSystem.fire(target)
  const normalDamage = g.weaponSystem._projectiles[0].damage
  g.weaponSystem._projectiles.length = 0
  pressSpace(g)
  near(g.weaponSystem._projectiles[0].damage, normalDamage * 7 * 8)
})

check('棱镜风暴齐射数缩放计至 7', g => {
  prepare(g, 'bounce'); learn(g, 'bounce', 2); learn(g, 'extension')
  g.player.level = RICOCHET_RULES.ultimateLevel; g.enemyManager.wave = RICOCHET_RULES.ultimateWave
  assert.equal(g.applySkill(skills.rico_prism), true)
  g._pauseLock = 0; g.running = true
  g.weaponSystem.projectileCount = 9
  const target = spawn(g)
  g.weaponSystem._projectiles.length = 0
  g.weaponSystem.fire(target)
  const normalDamage = g.weaponSystem._projectiles[0].damage
  g.weaponSystem._projectiles.length = 0
  pressSpace(g)
  const cores = g.weaponSystem._projectiles
  assert.equal(cores.length, 3)
  near(cores[0].damage, normalDamage * 7 * 1.5)
})

check('余辉增幅每跳线性累加且第 7 跳不再追加（越弹越痛）', g => {
  prepare(g, 'bounce'); learn(g, 'amplify', 4)
  g.weaponSystem.projectileCount = 1
  for (let i = 1; i <= 8; i++) spawn(g, { x: i * 90, hp: 10000 })
  g.weaponSystem.fire(g.enemyManager.enemies[0])
  const p = g.weaponSystem._projectiles[0], rc = g.weaponSystem.ricochetCombat
  const d0 = p.damage, b = p.ricochet.bounceBonus, ret = p.ricochet.bounceRetention
  near(ret, 1)
  near(b, .4)
  const first = g.enemyManager.enemies[0]
  p.x = first.x; p.y = first.y; p.hitTargets.add(first)
  p.pierces = 0; p.ricochet.bounces = 7
  const d = []
  for (let i = 0; i < 7; i++) { rc.continueAfterHit(p); d.push(p.damage) }
  for (let i = 0; i < 6; i++) near(d[i], d0 * (1 + (i + 1) * b))
  near(d[6], d[5])
})

check('弹射系卡面与实现口径一致', g => {
  assert.equal(skills.rico_extension.stats(2), '折射 +3 次 · 范围 +360px · 转向弹速 +75%')
  assert.equal(skills.rico_amplify.stats(4), '每次折射伤害 +44%')
  assert.equal(skills.rico_hunt.stats(5), '孢弹伤害 +40 个百分点 · 半血目标 +30% · 存续 +1.50 秒')
})
console.log(`verify-ricochet：${passed} 组通过`)
