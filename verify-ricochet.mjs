import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { createArena, spawn, spawnBoss, pressSpace, dispose, ctx2d, learn as learnLegacy } from './test-support/arena-fixture.mjs'
import { rollSkills, rollBossSkills, getSpecInfo } from './src/game/SkillPool.js'
import { BOSS_TOMES } from './src/game/BossTomes.js'
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

check('远征使用章节门槛；秘典满级补偿可确认路线并推进章节', g => {
  g.configureRun({ mode: 'expedition', difficulty: 'normal' })
  g.reset()
  for (const id of ['split', 'bounce', 'multishot', 'velocity']) learn(g, id)
  g.expeditionStage = 1; g.enemyManager.wave = 40
  assert.ok(!rollSkills(g).some(s => s.isRicochetRoute))
  g.expeditionStage = RICOCHET_RULES.routeStage
  g.runState = 'stage-reward'
  g.onExpeditionReward = () => {}
  for (const { id } of BOSS_TOMES.ricochet) g.bossSkillLevels[id] = 3
  g._beginBossSettlement(true)
  assert.equal(g._chapterSettlement.phase, 'compensation')
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
  const rc = g.weaponSystem.ricochetCombat
  rc.beams.length = 0
  g.weaponSystem.fire(target)
  const normalDamage = route === 'bounce' ? rc.beams.at(-1).damage : g.weaponSystem._projectiles[0].damage
  g.weaponSystem._projectiles.length = 0; rc.beams.length = 0
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
    assert.equal(projectiles.length, 0, '棱镜群落不再产生实体主弹')
    assert.equal(rc.beams.length, 3)
    near(rc.beams[0].damage, normalDamage * 1.5)
    assert.equal(rc.beams[0].bounces, 6); assert.equal(g.player.strainSkillCd, 12)
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

check('光棱激光：齐射加粗并压缩伤害、落点星爆散射不乒乓、斜角扫掠精准、折光穿梭延续散射', g => {
  prepare(g, 'bounce'); learn(g, 'bounce', 2)
  const rc = g.weaponSystem.ricochetCombat
  // 1) 齐射数与光线粗细/威力关联，且在 activeCountCap=7 封顶
  const samples = []
  for (const cnt of [1, 3, 7, 9]) {
    g.enemyManager._enemies.length = 0; rc.beams.length = 0
    g.weaponSystem.projectileCount = cnt
    const t = spawn(g, { x: 140, hp: 10000 })
    g.weaponSystem.fire(t)
    const primary = rc.beams.find(b => b.stage === 0)
    samples.push({ cnt, width: primary.width, damage: primary.damage })
  }
  assert.ok(samples[0].width < samples[1].width && samples[1].width < samples[2].width, '齐射越多主光束越粗')
  assert.ok(samples[0].damage < samples[1].damage && samples[1].damage < samples[2].damage, '齐射越多单束主光束威力越高')
  assert.equal(samples[2].width, samples[3].width, '光线粗细在齐射封顶 7 处停止放大')
  near(samples[2].damage, samples[3].damage, '单束伤害在齐射封顶 7 处停止放大')

  // 2) 星爆散射：主束击中第一目标后同时向周围散射，绝不对同一目标乒乓重复结算
  g.enemyManager._enemies.length = 0; rc.beams.length = 0
  g.weaponSystem.projectileCount = 1
  const mob = spawn(g, { x: 110, hp: 10000 })
  const boss = spawnBoss(g, 10000); boss.x = g.player.x + 170; boss.y = g.player.y + 48
  const add1 = spawn(g, { x: 140, y: 120, hp: 10000 })
  const add2 = spawn(g, { x: 140, y: -120, hp: 10000 })
  const bBefore = rc.metrics.bounces
  g.weaponSystem.fire(mob)
  assert.equal(rc.metrics.bounces - bBefore, 3, '主束命中 mob 后向 3 个周围目标星爆散射')
  const primary = rc.beams.find(b => b.stage === 0)
  const scatters = rc.beams.filter(b => b.stage === 1)
  assert.equal(scatters.length, 3)
  near(10000 - mob.hp, primary.damage, '主目标每发只受 1 次主束伤害，不回弹乒乓')
  assert.ok(boss.hp < 10000 && add1.hp < 10000 && add2.hp < 10000)

  // 3) 斜角精度：非轴向目标也能 100% 稳定命中并触发散射（回归浮点 proj > dist 截断漏洞）
  g.enemyManager._enemies.length = 0; rc.beams.length = 0
  const diag = spawn(g, { x: 173, y: 139, hp: 10000 })
  const diagSub = spawn(g, { x: 240, y: 190, hp: 10000 })
  g.weaponSystem.fire(diag)
  assert.ok(diag.hp < 10000 && diagSub.hp < 10000, '斜角发射不得因浮点截断丢失端点或散射')

  // 4) 孤立首领：不触发任何散射，仅吃 1 次主束伤害；超射程不隔空击杀
  g.enemyManager._enemies.length = 0; rc.beams.length = 0
  const loneBoss = spawnBoss(g, 10000); loneBoss.x = g.player.x + 180; loneBoss.y = g.player.y
  g.weaponSystem.fire(loneBoss)
  assert.equal(rc.beams.length, 1)
  near(10000 - loneBoss.hp, rc.beams[0].damage)

  // 5) 折光穿梭：主束穿过首位后顺穿后排并在穿刺终点再触发一次散射
  learn(g, 'pierce_bounce')
  g.enemyManager._enemies.length = 0; rc.beams.length = 0
  const front = spawn(g, { x: 90, hp: 10000 })
  const back = spawn(g, { x: 190, hp: 10000 })
  const flank = spawn(g, { x: 220, y: 95, hp: 10000 })
  const pBefore = rc.metrics.penetrations
  g.weaponSystem.fire(front)
  assert.ok(rc.metrics.penetrations > pBefore, '折光穿梭沿主束方向继续穿刺后排')
  assert.ok(back.hp < 10000 && flank.hp < 10000, '穿刺终点补发散射命中侧翼目标')
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

check('棱镜分束触发二级折光网且不递归；空场不扣冷却', g => {
  prepare(g, 'bounce', false); learn(g, 'echo')
  g.weaponSystem.projectileCount = 1
  const rc = g.weaponSystem.ricochetCombat
  const target = spawn(g, { x: 80, hp: 1000 })
  const next = spawn(g, { x: 160, y: 60, hp: 1000 })
  const third = spawn(g, { x: 160, y: -60, hp: 1000 })
  const far1 = spawn(g, { x: 260, y: 120, hp: 1000 })
  const far2 = spawn(g, { x: 260, y: -120, hp: 1000 })
  target.shieldHits = 1
  g.weaponSystem.fire(target)
  assert.equal(target.hp, 1000); assert.equal(target.shieldHits, 0)
  assert.ok(rc.beams.some(b => b.stage === 0), '主束生成')
  assert.equal(rc.beams.filter(b => b.stage === 1).length, 2, '一级散射命中 2 名近邻')
  assert.ok(rc.beams.some(b => b.stage === 2), '二级折光向更外圈折射，但不递归回弹')
  assert.ok(next.hp < 1000 && third.hp < 1000 && far1.hp < 1000 && far2.hp < 1000)
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

check('棱镜风暴齐射数缩放计至 7 且粗细与威力同步封顶', g => {
  prepare(g, 'bounce'); learn(g, 'bounce', 2); learn(g, 'extension')
  g.player.level = RICOCHET_RULES.ultimateLevel; g.enemyManager.wave = RICOCHET_RULES.ultimateWave
  assert.equal(g.applySkill(skills.rico_prism), true)
  g._pauseLock = 0; g.running = true
  g.weaponSystem.projectileCount = 9
  const rc = g.weaponSystem.ricochetCombat
  const target = spawn(g)
  g.weaponSystem._projectiles.length = 0; rc.beams.length = 0
  g.weaponSystem.fire(target)
  const normalBeam = rc.beams.find(b => b.stage === 0)
  const normalDamage = normalBeam.damage
  rc.beams.length = 0
  pressSpace(g)
  const beams = rc.beams.filter(b => b.stage === 0)
  assert.equal(beams.length, 3)
  assert.ok(beams.every(b => b.bounces === 6))
  assert.ok(beams[0].width > normalBeam.width, '棱镜风暴终极光束更粗')
  near(beams[0].damage, normalDamage * 1.5)
})

check('余辉增幅仅在散射命中多名不同目标时放大伤害（单挑不增伤）', g => {
  prepare(g, 'bounce'); learn(g, 'amplify', 3); learn(g, 'bounce', 4)
  g.weaponSystem.projectileCount = 1
  const rc = g.weaponSystem.ricochetCombat
  // 仅 1 个侧翼散射目标（避开正后方穿透线）：ampFactor = 0，保持基础 62%
  const primary1 = spawn(g, { x: 90, hp: 100000 })
  const onlyScatter = spawn(g, { x: 90, y: 110, hp: 100000 })
  g.weaponSystem.fire(primary1)
  const d0 = rc.beams.find(b => b.stage === 0).damage
  near(100000 - onlyScatter.hp, d0 * .62, '仅 1 个散射目标时不吃余辉共鸣加伤')

  // 4+ 个侧翼散射目标：吃满 Lv.3 的 30% 共鸣加伤（0.62 + 0.30 = 0.92）
  g.enemyManager._enemies.length = 0; rc.beams.length = 0
  const primary2 = spawn(g, { x: 90, hp: 100000 })
  const crowd = Array.from({ length: 4 }, (_, i) => spawn(g, { x: 80 + (i - 1.5) * 35, y: (i % 2 ? 1 : -1) * (80 + i * 15), hp: 100000 }))
  g.weaponSystem.fire(primary2)
  for (const e of crowd) near(100000 - e.hp, d0 * (.62 + .3), '命中 ≥4 个不同散射目标吃满余辉共鸣')
})

check('探索期混拿穿透与折射：前方无可穿目标时让位折射，不再盲飞丢锁', g => {
  learn(g, 'pierce'); learn(g, 'bounce')
  g.weaponSystem.projectileCount = 1
  const front = spawn(g, { x: 100, hp: 10000 })
  const side = spawn(g, { x: 100, y: 160, hp: 10000 })
  g.weaponSystem.fire(front)
  const p = g.weaponSystem._projectiles[0]
  sweep(g, p, 100)
  assert.equal(p.ricochet.turns, 1, '无正前目标时应直接折射而非消耗穿透盲飞')
  assert.equal(p.pierces, 1, '穿透次数未被空掷')
  assert.equal(p.target, side)
})

check('弹射系卡面与实现口径一致', g => {
  assert.equal(skills.rico_extension.stats(2), '折射范围 +105px · 光程 +30% · 蓄能间隔 -12%')
  assert.equal(skills.rico_amplify.stats(4), '散射命中 ≥4 目标时额外增伤 +38%')
  assert.equal(skills.rico_hunt.stats(5), '孢弹伤害 +40 个百分点 · 半血目标 +30% · 存续 +1.50 秒')
  assert.equal(skills.rico_pierce.stats(2), '穿透 +3 敌 · 主弹伤害 +12% · 口径 +15%')
})

check('贯穿重炮：敌群展开扇面、孤立首领集火、前向微吸附优先后排首领', g => {
  prepare(g, 'pierce')
  g.weaponSystem.projectileCount = 5
  const front = spawn(g, { x: 140, y: 0, hp: 10000 })
  spawn(g, { x: 180, y: 80, hp: 10000 })
  g.weaponSystem.fire(front)
  const crowdAngles = g.weaponSystem._projectiles.map(p => Math.atan2(p.vy, p.vx))
  const crowdSpread = Math.max(...crowdAngles) - Math.min(...crowdAngles)
  assert.ok(crowdSpread > .35, '敌群时多弹展开穿甲扇面避免重合塌缩')
  assert.equal(g.weaponSystem._projectiles.filter(p => p.homing === 0).length, 4, '侧翼弹不向首目标强收束')

  // 孤立首领时自动收束集火
  g.enemyManager._enemies.length = 0; g.weaponSystem._projectiles.length = 0
  const soloBoss = spawnBoss(g, 10000); soloBoss.x = g.player.x + 220; soloBoss.y = g.player.y
  g.weaponSystem.fire(soloBoss)
  const bossAngles = g.weaponSystem._projectiles.map(p => Math.atan2(p.vy, p.vx))
  assert.ok(Math.max(...bossAngles) - Math.min(...bossAngles) < .15, '孤立首领时自动收束扇面集火')

  // 前向微吸附：穿透首名小怪后优先偏转吸附锥角内的后排首领
  g.enemyManager._enemies.length = 0; g.weaponSystem._projectiles.length = 0
  g.weaponSystem.projectileCount = 1
  const vanguard = spawn(g, { x: 110, y: 0, hp: 10000 })
  const decoyMob = spawn(g, { x: 240, y: -25, hp: 10000 })
  const backBoss = spawnBoss(g, 10000); backBoss.x = g.player.x + 280; backBoss.y = g.player.y + 45
  g.weaponSystem.fire(vanguard)
  const shell = g.weaponSystem._projectiles[0]
  sweep(g, shell, 120)
  assert.equal(shell.target, backBoss, '穿透后在前向锥角内优先微吸附后排首领')
  assert.ok(shell.vy > 0 && decoyMob.hp === 10000, '速度向量同步向后排首领微幅偏转')
})

check('贯穿重炮：无视重盾减伤、击碎护盾、首领叠层破甲与每轮独立破阵冲击', g => {
  prepare(g, 'pierce'); learn(g, 'sustain', 1); learn(g, 'shock', 1)
  g.weaponSystem.projectileCount = 2
  const bulwark = spawn(g, { x: 110, y: 0, hp: 10000, type: 'bulwark' })
  bulwark.facing = Math.PI // 正面朝向玩家
  bulwark.shieldHits = 2
  g.weaponSystem.fire(bulwark)
  const shot = g.weaponSystem._projectiles[0]
  const baseDmg = shot.damage
  g.weaponSystem.ricochetCombat.hit(shot, bulwark)
  assert.equal(bulwark.shieldHits, 0, '重弹一次击碎至多 2 层护盾')
  near(10000 - bulwark.hp, baseDmg * .65, '无视重盾正面减伤并穿盾造成 65% 实伤')

  // 首领连续命中叠层（最多 4 层）
  g.enemyManager._enemies.length = 0; g.weaponSystem._projectiles.length = 0
  const boss = spawnBoss(g, 10000)
  const hits = []
  for (let i = 0; i < 6; i++) {
    g.weaponSystem._projectiles.length = 0
    g.weaponSystem.fire(boss)
    const p = g.weaponSystem._projectiles[0], before = boss.hp
    g.weaponSystem.ricochetCombat.hit(p, boss)
    hits.push(before - boss.hp)
  }
  assert.ok(hits[1] > hits[0] && hits[4] > hits[1], '连续命中同一首领逐层叠加穿甲过载')
  near(hits[5], hits[4], '第 6 发在 4 层处封顶')

  // 破阵冲击不受全局 0.2s CD 锁死，同轮多发穿透各自触发冲击波
  g.enemyManager._enemies.length = 0; g.weaponSystem._projectiles.length = 0
  const m1 = spawn(g, { x: 100, y: -40, hp: 10000 }), m1Back = spawn(g, { x: 170, y: -40, hp: 10000 })
  const m2 = spawn(g, { x: 100, y: 40, hp: 10000 }), m2Back = spawn(g, { x: 170, y: 40, hp: 10000 })
  const beforeExpl = g.weaponSystem.stats.explosions
  g.weaponSystem.fire(m1)
  const [pA, pB] = g.weaponSystem._projectiles
  g.weaponSystem.ricochetCombat.hit(pA, m1); g.weaponSystem.ricochetCombat.hit(pA, m1Back)
  g.weaponSystem.ricochetCombat.hit(pB, m2); g.weaponSystem.ricochetCombat.hit(pB, m2Back)
  assert.equal(g.weaponSystem.stats.explosions - beforeExpl, 2, '同轮齐射多弹穿透各自触发破阵冲击')
})

check('歼灭巨炮智能索敌优先首领／密集纵队，重炮视觉曳光仅在贯穿专精后激活并正常衰减', g => {
  // 探索期仅拿穿透腺体：保持基础冰青弹体且不提前染色出重炮炽金曳光
  learn(g, 'pierce', 2)
  const exploreEnemy = spawn(g, { x: 140, y: 0, hp: 1000 })
  g.weaponSystem.fire(exploreEnemy)
  const exploreShot = g.weaponSystem._projectiles.at(-1)
  assert.equal(exploreShot.visual.material, 'ricochet', '未定向前保持基础冰青弹体外观')
  sweep(g, exploreShot, 200)
  assert.equal(g.weaponSystem.ricochetCombat.traces.some(t => t.kind === 'pierce' || t.kind === 'muzzle_cone'), false, '未选择贯穿专精前不提前出现重炮炽金曳光')
  g.enemyManager._enemies.length = 0; g.weaponSystem._projectiles.length = 0

  prepare(g, 'pierce'); learn(g, 'pierce', 2); learn(g, 'sustain', 1)
  g.player.level = RICOCHET_RULES.ultimateLevel; g.enemyManager.wave = RICOCHET_RULES.ultimateWave
  assert.equal(g.applySkill(skills.rico_cannon), true)
  const rc = g.weaponSystem.ricochetCombat
  spawn(g, { x: -70, y: 0, hp: 50 }) // 最近但孤立的杂兵
  const boss = spawnBoss(g, 10000); boss.x = g.player.x + 360; boss.y = g.player.y + 40
  pressSpace(g)
  const cannon = g.weaponSystem._projectiles.at(-1)
  assert.equal(cannon.visual.material, 'rico_pierce', '选择贯穿专精后切换为炽金重炮弹体')
  assert.equal(cannon.target, boss, '歼灭巨炮优先锁定首领而非身边孤立小怪')
  assert.ok(rc.traces.some(t => t.kind === 'muzzle_cone'), '重炮发射产生炮口焰锥')
  cannon.prevX = cannon.x; cannon.prevY = cannon.y
  cannon.x = boss.x; cannon.y = boss.y
  g.enemyManager._buildGrid()
  rc.resolve(cannon)
  assert.ok(rc.traces.some(t => t.kind === 'pierce'), '重炮飞行生成炽金曳光轨迹')
  assert.ok(rc.traces.some(t => t.kind === 'pierce_ring'), '重炮命中生成方向性马赫激波环')
  g.render(ctx2d)
  rc.update(1)
  assert.equal(rc.traces.length, 0, '视觉曳光按寿命自动回收不泄漏')
})

check('移动中发射光棱与贯穿重炮：起笔与炮口焰始终随史莱姆同步、多弹不逸出本体边缘', g => {
  // 1) 光棱主束起点随移动中的史莱姆同步，不滞留原地
  prepare(g, 'bounce')
  const rc = g.weaponSystem.ricochetCombat
  const target = spawn(g, { x: 200, y: 0, hp: 10000 })
  const x0 = g.player.x, y0 = g.player.y
  g.weaponSystem.fire(target)
  g.player.x = x0 + 120; g.player.y = y0 + 80
  const beamMoves = []
  const spyCtx = new Proxy(ctx2d, {
    get(t, k) {
      if (k === 'moveTo') return (x, y) => beamMoves.push({ x, y })
      return t[k]
    },
  })
  rc.render(spyCtx)
  assert.ok(beamMoves.some(pt => Math.abs(pt.x - (g.player.x + 10)) < 2 && Math.abs(pt.y - (g.player.y - 8)) < 2),
    '移动后光棱主束起点紧贴史莱姆当前位置，不滞留旧坐标')

  // 2) 贯穿重炮：7弹齐射横向偏移收束在史莱姆半径内，且炮口焰与首段曳光随史莱姆同步
  g.reset()
  prepare(g, 'pierce')
  g.weaponSystem.projectileCount = 7
  const rcPierce = g.weaponSystem.ricochetCombat
  const mob = spawn(g, { x: 220, y: 0, hp: 10000 })
  const px0 = g.player.x, py0 = g.player.y
  g.weaponSystem.fire(mob)
  assert.ok(g.weaponSystem._projectiles.every(p => Math.abs(p.y - py0) <= 12), '7弹齐射出膛位置收束在本体宽度内')
  const lead = g.weaponSystem._projectiles[3]
  lead.prevX = lead.x; lead.prevY = lead.y
  lead.x += 40
  rcPierce.resolve(lead)
  g.player.x = px0 - 90; g.player.y = py0 + 60
  const pierceMoves = [], coneTranslations = []
  const pierceSpy = new Proxy(ctx2d, {
    get(t, k) {
      if (k === 'moveTo') return (x, y) => pierceMoves.push({ x, y })
      if (k === 'translate') return (x, y) => coneTranslations.push({ x, y })
      return t[k]
    },
  })
  rcPierce.render(pierceSpy)
  const cone = rcPierce.traces.find(tr => tr.kind === 'muzzle_cone')
  assert.ok(coneTranslations.some(pt => Math.abs(pt.x - (g.player.x + cone.ox)) < 1 && Math.abs(pt.y - (g.player.y + cone.oy)) < 1),
    '炮口焰锥随史莱姆移动同步锚定')
  const firstTracer = rcPierce.traces.find(tr => tr.kind === 'pierce')
  assert.ok(pierceMoves.some(pt => Math.abs(pt.x - (g.player.x + firstTracer.ox)) < 1 && Math.abs(pt.y - (g.player.y + firstTracer.oy)) < 1),
    '首段重炮曳光起笔锚定史莱姆当前位置')
})
console.log(`verify-ricochet：${passed} 组通过`)
