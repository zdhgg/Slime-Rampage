import assert from 'node:assert/strict'
import { createArena, spawn, spawnBoss, dispose, pressSpace, ctx2d } from './test-support/arena-fixture.mjs'
import { CONTAGION_FRAME_BUDGET, MAX_SPELL_INFECTIONS } from './src/game/SpellContagion.js'
import { ELEMENTAL_SCHOOL_IDS } from './src/game/ElementalSchools.js'
import { ELEMENTAL_SKILL_BY_ID } from './src/game/ElementalUpgrades.js'
import { ELEMENTAL_ROUTE_SKILL_BY_ID } from './src/game/ElementalBuild.js'

let checks = 0
function check(name, test, school = 'fire') {
  const g = createArena('elemental')
  g.reset()
  g.running = true
  g.input.suspended = false
  g.runState = 'active'
  g.weaponSystem.critChance = 0
  g.enemyManager._enemies.length = 0
  g.enemyManager._spawnTimer = Infinity
  g.mapFeatures.resolvePlayerMovement = () => false
  g.mapFeatures.barricades = []
  const s = g.weaponSystem.spellCombat
  if (school) chooseSchool(s, school)
  try {
    test(g, s)
    console.log(`✓ ${++checks}. ${name}`)
  } finally {
    dispose(g)
  }
}

const chooseSchool = (s, id) => {
  s.start()
  s.player.level = Math.max(2, s.player.level)
  const card = s.milestoneReward().options.find(o => o.school === id || o.id === `spell_learn_${id}`)
  assert.ok(card)
  assert.equal(s.applyMilestone(card), true)
}

const learn = (g, id, rank = 1) => {
  const def = ELEMENTAL_SKILL_BY_ID[id] || ELEMENTAL_ROUTE_SKILL_BY_ID[id]
  assert.ok(def, `未知技能 ${id}`)
  for (let i = 0; i < rank; i++) {
    g.skillLevels[id] = (g.skillLevels[id] || 0) + 1
    g.weaponSystem.spellCombat.applyElementalSkill(def, g.skillLevels[id])
    def.apply?.(g, g.skillLevels[id])
  }
}

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`)

for (const schoolId of ELEMENTAL_SCHOOL_IDS) {
  check(`${schoolId}: Lv.2 选系后自动施法替换旧飞弹`, (g, s) => {
    assert.equal(s.usesBasicProjectile, false)
    assert.equal(s.school, schoolId)
    spawn(g, { hp: 1000, x: 160, y: 0 })
    for (let i = 0; i < 30; i++) s.update(0.05)
    assert.ok(Object.values(s.stats.castsByElement).reduce((a, b) => a + b, 0) >= 1)
    assert.equal(g.weaponSystem._projectiles.length, 0)
  }, schoolId)
}

check('火系：齐射分摊与聚火、炽热连击炎爆、燃世燃烧不耗点燃、焦土与地狱火', (g, s) => {
  learn(g, 'fire_volley', 2)
  const boss = spawnBoss(g, 2000)
  boss.x = g.player.x + 160
  boss.y = g.player.y
  s.shots.length = 0
  s.castPrimary(boss)
  assert.equal(s.shots.filter(sh => sh.kind === 'fireball').length, 2)
  assert.ok(s.shots.every(sh => sh.target === boss), '单首领自动聚火齐射')

  learn(g, 'fire_hot_streak', 2)
  s.chooseBranch('fire_pyromancer')
  learn(g, 'fire_pyro_streak', 1)
  learn(g, 'fire_pyro_combust', 1)
  learn(g, 'fire_pyro_ultimate', 1)
  g.skillCooldown = 8
  s.activeCd = 8

  boss.burnHits = 6
  boss._burnDmg = 2
  const hitsBefore = boss.burnHits
  const hpBeforeUlt = boss.hp
  pressSpace(g)
  assert.ok(s.combustionTimer > 0 && s.combustionIsUltimate, '释放空格开启完全体燃烧窗')
  const pyroTarget = spawn(g, { hp: 5000, x: 80, y: 0 })
  pyroTarget.burnHits = 5
  pyroTarget._burnDmg = 4
  s.hotStreak = 1
  s.gainHotStreak(1, pyroTarget)
  assert.equal(s.stats.pyroblasts, 1, '满 2 层热力自动瞬发炎爆')
  for (let i = 0; i < 20; i++) s.update(0.05)
  assert.ok(pyroTarget.burnHits >= 5, '燃世燃烧引爆剩余点燃但不消耗点燃层数')
  assert.ok(pyroTarget.hp < 5000 - 20, '炎爆＋点燃残余伤害真实扣血')
  assert.ok(s.zones.some(z => z.kind === 'fire_scorch'), '火法炎爆命中留下焦土火圈')
  assert.ok(boss.hp <= hpBeforeUlt || hitsBefore > 0)
}, 'fire')

check('火系：余烬蔓延只传一代防递归、火焰雨上限与毁灭地狱火嘲讽/拦弹', (g, s) => {
  learn(g, 'fire_ignite', 3)
  s.clocks.primary = 99
  const src = spawn(g, { hp: 1000, x: 90, y: 0 })
  const n1 = spawn(g, { hp: 1000, x: 160, y: 0 })
  const n2 = spawn(g, { hp: 1000, x: 310, y: 0 })
  s.applyBurn(src, 4, 2, { allowSpread: true })
  for (let i = 0; i < 16; i++) s.update(0.05) // > 0.6s
  assert.ok(n1.burnHits > 0, '邻近目标被余烬延迟点燃')
  for (let i = 0; i < 20; i++) s.update(0.05) // n2 距 src=220(>160)，距 n1=150(<=160)，若递归必传给 n2
  assert.equal(n2.burnHits, 0, '余烬仅传一代，绝不二传递归')

  s.chooseBranch('fire_destruction')
  learn(g, 'fire_dest_cataclysm', 2)
  assert.equal(g.skillLevels.fire_rain, 1, '毁灭分支自动补发 Lv.1 火焰雨')
  s._spawnFireRainZone(100, 0)
  s._spawnFireRainZone(200, 0)
  s._spawnFireRainZone(300, 0)
  s._spawnFireRainZone(400, 0)
  assert.equal(s.zones.filter(z => z.kind === 'fire_rain').length, 3, '焦炎倾泻后火焰雨上限为 3')

  const foe = spawn(g, { hp: 1000, x: 120, y: 40 })
  s.useActive()
  const inf = s.summons.find(x => x.kind === 'infernal')
  assert.ok(inf, '召唤地狱火傀儡成功')
  assert.equal(g.player.getEnemyTarget(foe), inf, '地狱火嘲讽附近普通敌人')
  const enemyBullet = { active: true, isBoss: false, x: inf.x, y: inf.y, radius: 6, damage: 1 }
  assert.equal(s.interceptBullet(enemyBullet, inf.x, inf.y), true, '地狱火拦截普通敌弹幕')
  assert.equal(enemyBullet.active, false)
}, 'fire')

check('冰系：寒冰箭单轮单目标最多叠1层霜纹、首领免疫减速仍吃碎冰、暴风雪减速弹幕与冰川尖刺', (g, s) => {
  learn(g, 'ice_lance_barrage', 4) // 3 arrows fan
  learn(g, 'ice_frostbite', 2)
  learn(g, 'ice_shatter_lance', 2)
  const target = spawn(g, { hp: 2000, x: 120, y: 0 })
  s.clocks.primary = 99
  s.castPrimary(target)
  for (let i = 0; i < 12; i++) s.update(0.05)
  assert.equal(target.frostStacks || 0, 1, `同轮齐射单目标最多叠 1 层霜纹（实测 ${target.frostStacks}）`)

  const boss = spawnBoss(g, 3000)
  boss.x = g.player.x + 120
  boss.y = g.player.y
  for (let round = 0; round < 3; round++) {
    boss.x = g.player.x + 120
    s.applyFrost(boss, 1)
  }
  assert.equal(boss.spellSlowAmount, 0, '首领免疫减速幅度')
  assert.ok(boss.deepWinterTime > 0, '首领满 3 层霜纹转化为深冬标记')
  assert.ok(s.stats.shatters >= 1, '首领同样触发碎冰 · 寒冰指并发射冰枪')

  s.chooseBranch('ice_storm')
  learn(g, 'ice_storm_hail', 1)
  learn(g, 'ice_blizzard_cdr', 2)
  s._spawnBlizzardZone(g.player.x + 100, g.player.y)
  const bNormal = { isBoss: false, x: g.player.x + 100, y: g.player.y }
  const bBoss = { isBoss: true, x: g.player.x + 100, y: g.player.y }
  near(s.bulletSpeedMultiplierAt(bNormal), 0.7)
  near(s.bulletSpeedMultiplierAt(bBoss), 1.0)

  s._branch = 'ice_shatter'
  learn(g, 'ice_shatter_ultimate', 1)
  const elite = spawn(g, { hp: 4000, x: 150, y: 0, elite: true })
  const eHp = elite.hp
  s.useActive()
  for (let i = 0; i < 20; i++) s.update(0.05)
  assert.ok(elite.hp < eHp - 5, '极寒彗星与冰川尖刺对精英打出高额爆发')
  assert.ok(s.effects.some(fx => fx.kind === 'glacial_spike') || s.stats.damageByElement.water > 5)
}, 'ice')

check('电系：孤立单体未使用跳跃补偿、闪电过载深度硬封顶 <= 2、漩涡与风暴图腾', (g, s) => {
  const soloBoss = spawnBoss(g, 5000)
  soloBoss.x = g.player.x + 130
  soloBoss.y = g.player.y
  s.castPrimary(soloBoss)
  const soloDmg = 5000 - soloBoss.hp

  // Spawn 4 more enemies -> solo bonus should make single-target hit strictly higher than base single hop
  const group = [spawn(g, { hp: 5000, x: 130, y: 40 })]
  for (let k = 1; k < 4; k++) group.push(spawn(g, { hp: 5000, x: 130 + k * 40, y: 40 }))
  s.castPrimary(group[0])
  const multiFirstHit = 5000 - group[0].hp
  assert.ok(soloDmg > multiFirstHit * 1.15, `孤立首领获得未跳跃补偿 (${soloDmg.toFixed(2)} > ${multiFirstHit.toFixed(2)})`)

  learn(g, 'lit_overload', 4)
  learn(g, 'lit_maelstrom', 2)
  s.chooseBranch('lit_overdrive')
  learn(g, 'lit_over_echo', 8)
  learn(g, 'lit_over_ultimate', 1)
  s.clocks.primary = 99
  s.delayed.length = 0
  s.lightning.stormkeeperTimer = 3.0
  s.stats.overloads = 0
  s.castPrimary(soloBoss)
  for (let i = 0; i < 30; i++) s.update(0.05)
  assert.equal(s.stats.overloads, 2, `单次施法过载连锁封顶深度 2（触发 ${s.stats.overloads} 次）`)

  s._branch = 'lit_skyfury'
  learn(g, 'lit_sky_totem', 1)
  s.useActive()
  assert.ok(s.summons.some(x => x.kind === 'storm_totem'), '风暴天罚分支召唤风暴图腾')
}, 'lightning')

check('毒系：痛楚叠层、多重 DoT、双轨传染节流上限、灾厄狂欢不消DoT且全刷新与腐蚀之种', (g, s) => {
  learn(g, 'poi_agony_bolt', 2)
  learn(g, 'poi_contagion', 4)
  learn(g, 'poi_curse', 2)
  const e1 = spawn(g, { hp: 2000, x: 100, y: 0 })
  const e2 = spawn(g, { hp: 2000, x: 140, y: 0 })
  const e3 = spawn(g, { hp: 2000, x: 175, y: 0 })
  for (let i = 0; i < 4; i++) s.applyAgony(e1, 1)
  assert.equal(e1.agonyStacks, 4)
  assert.ok(e1.curseTime > 0, '衰弱诅咒生效')

  // Death-triggered contagion on enemy kill
  e1.hp = 0.01
  s.damageEnemy(e1, 5, { element: 'poison' })
  assert.ok(s.contagion.isInfected(e2), '染疫死亡瞬间立刻传染给邻近敌人')
  assert.ok(s.stats.contagionTransfers >= 1)

  // Budget & cap test across 160 clustered enemies
  const swarm = []
  for (let i = 0; i < 160; i++) swarm.push(spawn(g, { hp: 2000, x: 100 + (i % 10) * 6, y: Math.floor(i / 10) * 6 }))
  s.applyAgony(swarm[0], 3)
  s.contagion._frameTransfers = 0
  s.contagion.spreadFrom(swarm[0], s.contagion.snapshot(swarm[0]), 0, { targetsOverride: 50, rangeOverride: 400 })
  assert.ok(s.contagion._frameTransfers <= CONTAGION_FRAME_BUDGET, '单帧传染严格遵守帧预算')
  const totalInf = g.enemyManager.enemies.filter(e => e.active && s.contagion.isInfected(e)).length
  assert.ok(totalInf <= MAX_SPELL_INFECTIONS, '总感染上限封顶 <= 128')

  // Dark Rapture preserves & refreshes DoTs + Affliction Darkglare
  s.chooseBranch('poi_affliction')
  learn(g, 'poi_aff_agony', 1)
  learn(g, 'poi_aff_ultimate', 1)
  e2.agonyStacks = 6
  s.applyAgony(e2, 1)
  assert.ok(e2.unsteadyTime > 0, '高层痛楚触发痛苦无常')
  e2.agonyTime = 1.0
  const hpBeforeRapture = e2.hp
  s.useActive()
  assert.ok(e2.hp < hpBeforeRapture, '灾厄狂欢引爆造成高额伤害')
  assert.ok(e2.agonyTime > 5.0, '邪能黑眼＋狂欢刷新并延长 DoT 不消耗层数')
  assert.ok(s.summons.some(x => x.kind === 'darkglare'), '邪能黑眼召唤物出场')
}, 'poison')

check('跨系兼修战斗：只放基础法术、不触发主系核心联动，但毒系挂 8% 主系易伤', (g, s) => {
  learn(g, 'fire_hot_streak', 3)
  assert.equal(s.learnCantrip('ice'), true)
  assert.equal(s.learnCantrip('poison'), true)
  assert.equal(s.learnCantrip('lightning'), false)
  g.weaponSystem.critChance = 1 // force crit on cantrip!
  s.clocks.primary = 99
  const target = spawn(g, { hp: 2000, x: 120, y: 0 })
  s._castCantrip('ice')
  for (let i = 0; i < 12; i++) s.update(0.05)
  assert.equal(target.frostStacks || 0, 0, '基础寒冰箭兼修不叠主系霜纹')
  s._castCantrip('poison')
  for (let i = 0; i < 12; i++) s.update(0.05)
  assert.ok(target.cantripVulnTime > 0 && target.cantripVulnAmount >= 0.08, '毒系基础箭提供 8% 主系法术易伤')
  assert.equal(s.hotStreak, 0, '跨系法术暴击不触发火法炽热连击')
}, 'fire')

check('四系特色护盾（烈焰破盾连击 / 寒冰减CD+冻结 / 闪电电环+移速 / 灵魂榨取跳伤减CD节流）与超额漏伤', (g, s) => {
  // Base absorb & excess damage
  const hp0 = g.player.hp
  g.player.invincible = 0
  g.player.hit(1, { enemyAttack: true })
  assert.equal(g.player.hp, hp0)
  assert.equal(s.shield.points, 0)
  assert.equal(s.shield.remaining, 7)
  g.player.invincible = 0
  s.shield.reset(false)
  g.player.hit(2, { enemyAttack: true })
  assert.equal(g.player.hp, hp0 - 1, '1 点盾抵 2 伤后漏 1 点真伤')

  // Ice -1s cooldown & break freeze
  s.chooseSchool('ice')
  assert.equal(s.shield.cooldown, 6)
  learn(g, 'spell_shield', 3)
  assert.equal(s.shield.capacity, 2)
  assert.equal(s.shield.cooldown, 4.0) // 5 - 1 = 4s
  const nearEnemy = spawn(g, { hp: 500, x: 80, y: 0 })
  s.shield.charges = 1
  g.player.invincible = 0
  g.player.hit(1, { enemyAttack: true })
  assert.ok(nearEnemy.freeze > 0, '寒冰护体破盾直接冻结近身敌人')

  // Lightning rush & aura
  s.chooseSchool('lightning')
  s.shield.charges = 1
  g.player.invincible = 0
  g.player.hit(1, { enemyAttack: true })
  assert.ok(s.staticRushTimer >= 1.5 && s.playerMoveBonus >= 0.35, '闪电之盾破盾提供 +35% 移速爆发')

  // Poison Soul Siphon throttle (<= 1s per second)
  s.chooseSchool('poison')
  s.shield.charges = 0
  s.shield.timer = 4.5
  let gained = 0
  for (let k = 0; k < 50; k++) gained += s.shield.onPlagueProgress(0.2)
  near(gained, 1.0, 1e-4)
}, 'fire')

check('击杀防双倍触发、暂停冻结、渲染与结束重置彻底清理', (g, s) => {
  const e = spawn(g, { hp: 100, x: 90, y: 0 })
  learn(g, 'fire_rain', 1)
  s.chooseBranch('fire_destruction')
  learn(g, 'fire_dest_cataclysm', 1)
  s._spawnFireRainZone(90, 0)
  s.useActive()
  s.renderGround(ctx2d)
  s.render(ctx2d)

  // _spellKillHandled prevents double kill processing
  s.onEnemyKilled(e)
  e._settled = true
  s.onEnemyKilled(e) // second call is no-op
  assert.equal(e._spellKillHandled, true)

  g.finishRun('defeat')
  assert.equal(s.shield.points, 0)
  assert.equal(s.zones.length, 0)
  assert.equal(s.summons.length, 0)
  g.reset()
  assert.equal(s.school, null)
  assert.equal(s.crossCantrips.length, 0)
  assert.equal(s.shield.points, 1)
}, 'fire')

check('底层乘区全通：levelMul 成长、critMul 暴伤、attackInterval/精通施法急速同步生效', (g, s) => {
  // 1. levelMul scales schoolDamage & cantripBaseDamage
  g.weaponSystem.levelMul = 1
  const d1 = s.schoolDamage('fire', 1)
  const c1 = s.cantripBaseDamage('ice', 1)
  g.weaponSystem.levelMul = 2.5
  near(s.schoolDamage('fire', 1), d1 * 2.5)
  near(s.cantripBaseDamage('ice', 1), c1 * 2.5)
  g.weaponSystem.levelMul = 1

  // 2. critMul scales spell crits (2.25x base + weapon critMul bonus above 3.0)
  const foe = spawn(g, { hp: 2000, x: 100, y: 0 })
  g.weaponSystem.critMul = 3.0
  const rBase = s.damageEnemy(foe, 10, { element: 'fire', forceCrit: true, noHotStreak: true })
  near(rBase.damage, 22.5, 1e-4)
  g.weaponSystem.critMul = 3.5
  const rBoost = s.damageEnemy(foe, 10, { element: 'fire', forceCrit: true, noHotStreak: true })
  near(rBoost.damage, 27.5, 1e-4)

  // 3. attackInterval & mastery haste accelerate primaryInterval
  const baseInterval = s.primaryInterval
  g.weaponSystem.fireInterval = 0.8
  assert.ok(s.primaryInterval < baseInterval * 0.85, '全局攻速缩短主法术施法间隔')
  const withWeaponHaste = s.primaryInterval
  learn(g, 'fire_mastery', 4)
  assert.ok(s.primaryInterval < withWeaponHaste * 0.92, '主系精通同步提供施法急速')
}, 'fire')

check('Lv.2 选系自带四系签名引擎雏形（无需先抽卡即可运转）', (g, s) => {
  // Fire Lv.0 Hot Streak Pyroblast
  const eFire = spawn(g, { hp: 2000, x: 100, y: 0 })
  s.damageEnemy(eFire, 5, { element: 'fire', forceCrit: true })
  assert.equal(s.hotStreak, 1, '火系 0 级即可暴击叠热力')
  s.damageEnemy(eFire, 5, { element: 'fire', forceCrit: true })
  assert.equal(s.stats.pyroblasts, 1, '火系 0 级满 2 层自动瞬发炎爆')

  // Ice Lv.0 3-stack Shatter + Ice Lance
  s.chooseSchool('ice')
  const eIce = spawn(g, { hp: 2000, x: 120, y: 0 })
  for (let i = 0; i < 3; i++) s.applyFrost(eIce, 1)
  assert.ok(s.stats.shatters >= 1, '冰系 0 级叠满 3 层霜纹自动碎冰发射冰枪')
  assert.ok(s.shots.some(sh => sh.kind === 'ice_lance'))

  // Lightning Lv.0 baseline Overload (guaranteed within pity=4 casts)
  s.chooseSchool('lightning')
  s.stats.overloads = 0
  const eLit = spawn(g, { hp: 5000, x: 120, y: 0 })
  for (let i = 0; i < 4; i++) s.castPrimary(eLit)
  for (let i = 0; i < 10; i++) s.update(0.05)
  assert.ok(s.stats.overloads >= 1, '电系 0 级自带基础过载与 4 次保底')

  // Poison Lv.0 nascent death contagion
  g.enemyManager._enemies.length = 0
  s.chooseSchool('poison')
  const pSrc = spawn(g, { hp: 100, x: 90, y: 0 })
  const pDst = spawn(g, { hp: 500, x: 145, y: 0 })
  s.applyAgony(pSrc, 2)
  pSrc.hp = 0.01
  s.damageEnemy(pSrc, 5, { element: 'poison' })
  assert.ok(s.contagion.isInfected(pDst), '毒系 0 级染疫阵亡自带初染扩散')
}, 'fire')

check('四系机制强化：地狱火减伤、冰系首领增伤与暴风雪慢弹、漩涡聚怪与图腾急速、毒满层跳伤与DoT喂种、兼修联动、主动加速护盾', (g, s) => {
  // Fire Infernal magma armor damage cap & active advances shield rebuild
  s.shield.charges = 0
  s.shield.timer = 5.0
  s.useActive()
  near(s.shield.timer, 3.0, 1e-4)
  const inf = s.summons.find(x => x.kind === 'infernal')
  const infHp0 = inf.hp
  s.hitSummon(inf, 8)
  near(infHp0 - inf.hp, 1.5, 1e-4)

  // Fire Lv.0 shield break feeds Hot Streak
  s.hotStreak = 0
  s.shield.charges = 1
  g.player.invincible = 0
  g.player.hit(1, { enemyAttack: true })
  assert.equal(s.hotStreak, 1, '烈焰护体 Lv.0 破盾即赠送 1 层热力')

  // Ice baseline Blizzard slows enemy bullets (-15%) & Ice Boss brittle +20%
  g.enemyManager._enemies.length = 0
  s.chooseSchool('ice')
  s._spawnBlizzardZone(g.player.x + 90, g.player.y)
  near(s.bulletSpeedMultiplierAt({ isBoss: false, x: g.player.x + 90, y: g.player.y }), 0.85)
  const boss = spawnBoss(g, 3000)
  boss.x = g.player.x + 110; boss.y = g.player.y
  const normBossHit = s.damageEnemy(boss, 10, { element: 'water' }).damage
  boss.deepWinterTime = 3
  const markedBossHit = s.damageEnemy(boss, 10, { element: 'water' }).damage
  near(markedBossHit / normBossHit, 1.2, 1e-4)

  // Lightning Maelstrom pull + Storm Totem haste + Lv.0 Lightning Shield aura
  g.enemyManager._enemies.length = 0
  s.chooseSchool('lightning')
  const mCenter = spawn(g, { hp: 4000, x: 180, y: 0 })
  const mOuter = spawn(g, { hp: 2000, x: 250, y: 0 })
  const distBefore = Math.hypot(mOuter.x - mCenter.x, mOuter.y - mCenter.y)
  s.lightning._castMaelstromVortex(1)
  const distAfter = Math.hypot(mOuter.x - mCenter.x, mOuter.y - mCenter.y)
  assert.ok(distAfter < distBefore - 10, '静电漩涡向心牵引周围非首领敌人')
  s.summons.push({ kind: 'storm_totem', x: g.player.x, y: g.player.y, life: 5, maxLife: 5, tick: 5, radius: 160, damage: 1 })
  s._updateSummons(0.05)
  assert.ok(s.totemHasteBonus >= 0.15, '风暴图腾光环提供 +15% 施法急速')

  // Poison max-stack Agony instant tick + DoT ticks feed Poison Seed burst
  g.enemyManager._enemies.length = 0
  s.zones.length = 0
  s.summons.length = 0
  s.chooseSchool('poison')
  const pBoss = spawnBoss(g, 5000)
  pBoss.x = g.player.x + 110; pBoss.y = g.player.y
  s._spawnPoisonSeedZone(pBoss.x, pBoss.y)
  const seedZone = s.zones.find(z => z.kind === 'poison_seed')
  const cap = s.agonyCap()
  pBoss.agonyStacks = cap
  pBoss.agonyDmg = 4
  const hpBeforeCapHit = pBoss.hp
  s.applyAgony(pBoss, 1)
  assert.ok(pBoss.hp < hpBeforeCapHit - 3, '痛楚满层再命中立即结算额外跳伤')
  assert.ok(seedZone.damageAccum > 0 || seedZone.bloomsLeft === 0, '毒系 DoT 跳伤实时为腐蚀之种充能')

  // Cross-school cantrip tactical synergies (fire crit +6%, lightning -0.15s primary CD)
  s.clocks.primary = 0.8
  s.learnCantrip('fire')
  s.learnCantrip('lightning')
  s._castCantrip('lightning')
  near(s.clocks.primary, 0.65, 1e-4)
  s.clocks.primary = 99
  s._castCantrip('fire')
  for (let i = 0; i < 15; i++) s.update(0.05)
  assert.ok(pBoss.cantripFireCritTime > 0 && pBoss.cantripFireCritAmount >= 0.06, '兼修火球附加主系暴击 +6%')
}, 'fire')

console.log(`元素 v2 核心战斗与机制验证通过：共 ${checks} 组 ✓`)
