import { learnTome } from './test-support/arena-fixture.mjs'
import assert from 'node:assert/strict'
import { createArena, spawn, spawnBoss, learn, pressSpace, dispose, rollSkills, SKILL_DATABASE, ctx2d } from './test-support/arena-fixture.mjs'
import { BOSS_SKILL_DATABASE, resolveShadowSkill } from './src/game/SkillPool.js'
import { SHADOW_ROUTE_SKILL_BY_ID } from './src/game/ShadowBuild.js'
import { setCritSource } from './src/game/CritSources.js'
import { ExpeditionBoss } from './src/game/entities/ExpeditionBoss.js'
import { shadowLineClear } from './src/game/ShadowGeometry.js'

const learnRoute = (g, id, count = 1) => {
  const s = SHADOW_ROUTE_SKILL_BY_ID[id]
  for (let i = 0; i < count; i++) g.applySkill(s)
}

let count = 0
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`)
function check(name, test, strain = 'shadow') {
  const g = createArena(strain)
  try { test(g); console.log(`  ✓ ${++count}. ${name}`) } finally { dispose(g) }
}
function random(value, fn) {
  const original = Math.random
  Math.random = typeof value === 'function' ? value : () => value
  try { return fn() } finally { Math.random = original }
}
function step(g, seconds) { for (let t = 0; t < seconds; t += 1 / 60) g.weaponSystem.shadowCombat.update(1 / 60) }
function summon(g, target = spawn(g), action = {}) {
  const clones = g.weaponSystem.shadowCombat.clones
  clones.procCooldown = 0
  random(0, () => clones.onCritical(target, action))
  return clones.items.at(-1)
}
function prepareCloneSkill(g, includeDecoy = false) {
  if (!(g.skillLevels.ass_lethal > 0)) learn(g, 'ass_lethal')
  if (!(g.skillLevels.ass_stride > 0)) learn(g, 'ass_stride')
  if (!(g.skillLevels.ass_execute > 0)) learn(g, 'ass_execute')
  if (includeDecoy && !(g.skillLevels.ass_decoy > 0)) learn(g, 'ass_decoy')
}
function grantSwarmUltimate(g) {
  if (!(g.skillLevels.ass_echo > 0)) learn(g, 'ass_echo')
  g.player.level = 14; g._ensureRoleAwakening(); g.enemyManager.wave = 10
  const combat = g.weaponSystem.shadowCombat
  combat.normalChoices = 5; combat.route = 'swarm'
  g.skillLevels.ass_echo = 3; g.skillLevels.shadow_swarm_assault = 1
  const skill = rollSkills(g, 99).find(entry => entry.id === 'ass_capstone')
  assert.ok(skill)
  assert.equal(g.applySkill(skill), true)
}
const book = id => BOSS_SKILL_DATABASE.assassin.find(s => s.id === id)

check('开局属性与四项分身成长独立', g => {
  near(g.player.evasionChance, 0.18)
  const c = g.weaponSystem.shadowCombat.clones
  const shield = g.weaponSystem.shadowCombat.shield
  near(c.chance, 0.6); near(c.power, 0.52); assert.equal(c.cap, 2); assert.equal(c.duration, 4)
  assert.equal(shield.capacity, 1); assert.equal(shield.charges, 1)
  learn(g, 'ass_echo'); near(c.chance, 0.75); near(c.power, 0.52); near(c.duration, 4.75)
  learn(g, 'ass_lethal'); learn(g, 'ass_stride')
  learn(g, 'ass_execute'); near(c.power, 0.68); near(c.duration, 4.75)
  learn(g, 'ass_decoy'); near(c.duration, 6.25); assert.equal(c.cap, 2)
  learn(g, 'ass_legion', 2); assert.equal(c.cap, 4)
  learn(g, 'ass_stride', 3); near(g.player.evasionChance, 0.38)
  learnTome(g, 'boss_shadow_cloak', 3); near(g.player.evasionChance, 0.38); near(g.bossTomes.onEvade(), 0.4)
  g.player.shadowEvasionBonus = 1; near(g.player.evasionChance, 0.4)
  assert.ok(g.player.evasionOverflow > 0.7)
})
check('被动闪避边界、一次攻击去重、短暂虚化与无受击奖励', g => {
  const p = g.player, hp = p.hp, attack = { enemyAttack: true }
  g.weaponSystem.shadowCombat.guardCharges = 0
  p.adrenalineSpeed = 0.6
  random(0.149, () => assert.equal(p.hit(2, attack), false))
  assert.equal(p.hp, hp); assert.equal(p.invincible, 0); assert.equal(p.adrenalineTimer, 0)
  random(() => { throw Error('same event rerolled') }, () => p.hit(2, attack))
  random(() => { throw Error('grace must not roll') }, () => p.hit(2, { enemyAttack: true }))
  near(p.evasionFlash, 0.2)
  p.update(0.21)
  random(0.18, () => assert.equal(p.hit(1, { enemyAttack: true }), true))
  assert.equal(p.hp, hp - 1); assert.equal(p.adrenalineTimer, 3)
  assert.equal(p.evasionCount, 1)
})
check('无敌、事件扣血、零伤害和其他角色不消耗闪避随机数', g => {
  const p = g.player
  random(() => { throw Error('unexpected dodge roll') }, () => {
    p.invincible = 1; p.hit(1, { enemyAttack: true }); p.invincible = 0
    p.hit(0, { enemyAttack: true }); p.hit(1)
  })
  assert.equal(p.hp, p.maxHp - 1)
  g.applyStartingStrain('origin'); assert.equal(p.evasionChance, 0)
  p.invincible = 0
  random(() => { throw Error('origin dodge roll') }, () => p.hit(1, { enemyAttack: true }))
})
check('怨灵攻击被闪避时不能吸血；攻击消耗出手', g => {
  const p = g.player, e = spawn(g, { type: 'wraith', x: 30 })
  e.hp = 20; e.attackCd = 0; p._decoys.length = 0
  random(0, () => e.update(0.01))
  assert.equal(p.evasionCount, 1); assert.equal(e.hp, 20); assert.ok(e.attackCd > 0)
})
check('弹幕命中闪避后消失，只计一次', g => {
  g.enemyManager.spawnBullet(g.player.x, g.player.y, 0, 'mage')
  random(0, () => g.enemyManager._updateBullets(0))
  assert.equal(g.player.evasionCount, 1); assert.equal(g.enemyManager._bullets.length, 0)
})
check('Boss 法术与突进支持闪避，不重复命中', g => {
  const b = spawnBoss(g, 1000, 'boss-mage')
  b.targetX = g.player.x; b.targetY = g.player.y
  random(0, () => { b._executeSpecial(); b._executeSpecial() })
  assert.equal(g.player.evasionCount, 1)
  g.player.update(0.21)
  b.specialPattern = 'boss-knight'; b._specialAttackEvent = { enemyAttack: true }
  b.x = g.player.x; b.y = g.player.y; b.dashHit = false; b.dashChain = 0
  random(0, () => { b._updateKnightDash(0); b._updateKnightDash(0) })
  assert.equal(g.player.evasionCount, 2)
})
check('远征地面技能按技能事件只判定一次', g => {
  const e = new ExpeditionBoss({ x: g.player.x, y: g.player.y, wave: 5,
    encounter: { id: 'audit', archetype: 'mage', mechanic: 'royal-chess', name: 'audit', cooldown: 5 } })
  e.attach(g); e.targetX = g.player.x; e.targetY = g.player.y
  e.skillData = { tile: 100, safeParity: 1 - e._tileParity(g.player.x, g.player.y, 100) }
  random(0, () => { e._executeSpecial(); e._executeSpecial() })
  assert.equal(g.player.evasionCount, 1)
})
check('召唤概率升至 100%，边界失败且同一动作不补掷', g => {
  const c = g.weaponSystem.shadowCombat.clones, e = spawn(g), action = {}
  random(0.6, () => assert.equal(c.onCritical(e, action), false))
  c.procCooldown = 0
  random(0, () => assert.equal(c.onCritical(e, action), false))
  random(0.599, () => assert.equal(c.onCritical(e, {}), true))
  learn(g, 'ass_echo'); near(c.chance, 0.75)
  learn(g, 'ass_echo'); near(c.chance, 0.9)
  learn(g, 'ass_echo'); near(c.chance, 1.0); c.procCooldown = 0
  random(0.999, () => assert.equal(c.onCritical(e, {}), true))
  assert.equal(c.items.length, 2)
})
check('实际暴击、致死暴击生成，护盾和二次伤害不生成', g => {
  const combat = g.weaponSystem.shadowCombat, e = spawn(g)
  e.shieldHits = 1
  random(0, () => combat.hit(e, 1, { guaranteed: true, action: {} }))
  assert.equal(combat.clones.items.length, 0)
  random(0, () => combat.hit(e, 1, { guaranteed: true, action: {} }))
  assert.equal(combat.clones.items.length, 1)
  combat.clones.procCooldown = 0; e.hp = 0.1
  random(0, () => combat.hit(e, 1, { guaranteed: true, action: {} }))
  assert.equal(combat.clones.items.length, 2)
  const second = spawn(g); combat.clones.reset()
  random(0, () => combat.hit(second, 1, { secondary: true, action: {} }))
  assert.equal(combat.clones.items.length, 0)
})
check('同次贯穿只召唤一次，全局 0.35 秒限制没有补发', g => {
  const combat = g.weaponSystem.shadowCombat
  g.weaponSystem.critChance = 1; learn(g, 'ass_echo', 2)
  const enemies = [40, 60, 80].map(x => spawn(g, { x }))
  random(0, () => { combat.stab(enemies[0]); combat.update(0.11) })
  assert.equal(combat.clones.items.length, 1)
  random(0, () => combat.hit(enemies[0], 1, { guaranteed: true, action: {} }))
  assert.equal(combat.clones.items.length, 1)
  assert.ok(enemies.every(e => e.hp < 100))
})
check('满额刷新最短寿命，不重置攻击冷却、不增加数量', g => {
  const e = spawn(g), clones = g.weaponSystem.shadowCombat.clones
  summon(g, e); summon(g, e)
  clones.items[0].life = 1; clones.items[0].cooldown = 0.42
  clones.items[1].life = 2
  summon(g, e)
  assert.equal(clones.items.length, 2); assert.equal(clones.items[0].life, 4)
  near(clones.items[0].cooldown, 0.42); assert.equal(clones.items[1].life, 2)
})
check('分身真实伤害随强度成长；有界暴击但不直接复制本体巨额暴伤且不消费本体必暴', g => {
  const e = spawn(g), combat = g.weaponSystem.shadowCombat, clone = summon(g, e)
  Object.assign(clone, { x: e.x - 50, y: e.y, angle: 0 })
  g.weaponSystem.critMul = 50; g.weaponSystem.executeCrit = true; g.player.guaranteedCrit = true
  random(0.99, () => combat.clones.hit(clone, e, combat.clones.power))
  near(e.hp, 99.48); assert.equal(g.player.guaranteedCrit, true)
  random(0, () => combat.clones.hit(clone, e, combat.clones.power))
  assert.ok(e.hp < 99 && e.hp > 97, '分身暴击使用有界倍率，不复制 50x 本体暴伤')
  assert.equal(g.player.guaranteedCrit, true)
  const hpBefore = e.hp
  learn(g, 'ass_lethal'); learn(g, 'ass_stride')
  learn(g, 'ass_execute', 3)
  random(0.99, () => combat.clones.hit(clone, e, combat.clones.power))
  near(e.hp, hpBefore - 1.0); assert.equal(combat.clones.items.length, 1)
})
check('时间升级不延长现存分身；到期销毁', g => {
  const clone = summon(g)
  prepareCloneSkill(g)
  learn(g, 'ass_decoy', 2); assert.equal(clone.life, 4)
  step(g, 4.1); assert.equal(g.weaponSystem.shadowCombat.clones.items.length, 0)
  assert.equal(summon(g).life, 7)
})
check('F 快照只指挥已有分身，新分身不参与本次夹击', g => {
  const e = spawn(g, { x: 100, hp: 1000 }), c = g.weaponSystem.shadowCombat
  const old = summon(g, e); old.x = g.player.x; old.y = g.player.y - 90
  c.clones.procCooldown = 0; learn(g, 'ass_echo', 2); prepareCloneSkill(g)
  g.player.facing = 0
  random(0, () => { pressSpace(g); g.player.update(0.26) })
  assert.equal(c.clones.items.length, 2)
  assert.ok(old.rush); assert.equal(c.clones.items[1].rush, null)
  step(g, 0.6); assert.ok(e.hp < 1000 - 4.8)
})
check('分身生成、移动和攻击均不能穿过拒马', g => {
  const p = g.player, e = spawn(g, { x: 180 })
  const wallX = p.x + 80
  g.mapFeatures.barricades = [{ active: true, xRatio: wallX / g.worldWidth, yRatio: p.y / g.worldHeight,
    angle: Math.PI / 2, length: 1000, width: 18, hp: 3, hitCooldown: 0 }]
  assert.equal(shadowLineClear(g, p, e), false)
  summon(g, e); assert.equal(g.weaponSystem.shadowCombat.clones.items.length, 0)
  const nearEnemy = spawn(g, { x: 30 }), clone = summon(g, nearEnemy)
  assert.ok(clone); g.weaponSystem.shadowCombat.clones.command(e, new Set([clone.id]))
  step(g, 0.8); assert.ok(clone.x < wallX); assert.equal(e.hp, 100)
  assert.equal(g.mapFeatures.barricades[0].hp, 3)
})
check('终极分身贯穿与十字夹击去重，分身最多四个', g => {
  prepareCloneSkill(g, true); learn(g, 'ass_legion', 2)
  grantSwarmUltimate(g)
  const e = spawn(g, { x: 70 }), c = g.weaponSystem.shadowCombat.clones
  const clone = summon(g, e); clone.x = g.player.x; clone.y = g.player.y; clone.angle = 0
  const second = spawn(g, { x: 95 })
  random(0.99, () => c.sweep(clone, clone.x, clone.y, clone.x + 110, clone.y, c.power, 3))
  near(e.hp, 100 - c.power); near(second.hp, 100 - c.power * 0.5)
  for (let i = 0; i < 10; i++) summon(g, e)
  assert.equal(c.items.length, 4)
  const hits = new Set(); clone.rush = {}
  c.sweep(clone, clone.x, clone.y, clone.x + 110, clone.y, 0.8, 3, hits)
  const hp = e.hp
  c.sweep(clone, e.x, e.y - 66, e.x, e.y + 66, 0.8, 3, hits)
  assert.equal(e.hp, hp)
  g.weaponSystem.shadowCombat.render(ctx2d)
})
check('升级与秘典顺序无关，原生黏液觉醒后首级暴伤有收益', g => {
  const snapshot = reverse => {
    g.reset()
    if (reverse) learnTome(g, 'boss_assassin_mark', 3)
    learn(g, 'ass_lethal', 2); g.player.level = 5; g._ensureRoleAwakening()
    if (!reverse) learnTome(g, 'boss_assassin_mark', 3)
    return [g.weaponSystem.critChance, g.weaponSystem.critMul]
  }
  assert.deepEqual(snapshot(false), snapshot(true)); near(snapshot(true)[0], 0.46); near(snapshot(true)[1], 4.1)
  g.applyStartingStrain('origin'); g.reset()
  assert.ok(!rollSkills(g, 99).some(s => s.id === 'ass_execute'), '原生不再抽取刺客职业树')
  assert.equal(g.strainSkill.id, 'slime_shock')
})
check('角色技能显示真实效果，原生黏液不抽到分身技能', g => {
  let cards = rollSkills(g, 99)
  assert.ok(cards.some(s => s.id === 'ass_echo'))
  assert.equal(cards.find(s => s.id === 'ass_stride').name, '虚化身躯')
  assert.equal(resolveShadowSkill({ ...book('boss_assassin_voidstep'), stats: book('boss_assassin_voidstep').ranks[0] }, g).stats.includes('影袭冷却'), true)
  assert.equal(resolveShadowSkill({ id: 'boss_assassin_voidstep', stats: '' }, g).stats.includes('魔盾充能'), true)
  g.applyStartingStrain('origin'); g.reset(); cards = rollSkills(g, 99)
  assert.ok(!cards.some(s => /^(ass_|shadow_)/.test(s.id)), '原生不抽到任何暗影技能')
  assert.equal(g.strainSkill.id, 'slime_shock')
})
check('达标终极随机出现且同一局只能取得一个', g => {
  learn(g, 'ass_echo'); g.player.level = 14; g.enemyManager.wave = 10; g._ensureRoleAwakening()
  prepareCloneSkill(g, true); learn(g, 'ass_legion')
  const combat = g.weaponSystem.shadowCombat
  combat.normalChoices = 5; combat.route = 'swarm'
  g.skillLevels.ass_echo = 3; g.skillLevels.shadow_swarm_assault = 1
  const ultimates = rollSkills(g, 99).filter(s => s.kind === 'ultimate')
  assert.deepEqual(ultimates.map(s => s.id), ['ass_capstone'])
  random(0, () => assert.ok(!rollSkills(g, 1).some(s => s.kind === 'ultimate')))
  const skill = rollSkills(g, 99).find(s => s.id === 'ass_capstone')
  assert.equal(g.applySkill(skill), true)
  assert.equal(combat.routeUltimate, 'swarm')
  assert.equal(rollSkills(g, 99).some(s => s.id === 'shadow_hunt_ultimate' || s.id === 'shadow_blade_ultimate'), false)
})
check('影袭天生起手留影而被动闪避不生影；暂停、重开及远征换章清理', g => {
  pressSpace(g); g.player.update(0.27)
  assert.equal(g.weaponSystem.shadowCombat.clones.items.length, 1, '影袭天生自带起点留影')
  g.reset()
  g.player.invincible = 0
  random(0, () => g.player.hit(1, { enemyAttack: true }))
  assert.equal(g.weaponSystem.shadowCombat.clones.items.length, 0)
  summon(g); g.pause(); const clone = g.weaponSystem.shadowCombat.clones.items[0], life = clone.life
  g._tick(300); assert.equal(clone.life, life)
  g.reset(); assert.equal(g.weaponSystem.shadowCombat.clones.items.length, 0); assert.equal(g.player.evasionCount, 0)
  summon(g); g.configureRun({ mode: 'expedition', difficulty: 'normal' }); g._enterExpeditionStage(2)
  assert.equal(g.weaponSystem.shadowCombat.clones.items.length, 0)
})
check('随机频率符合配置：10,000 次有效攻击/召唤事件与闪避韧性保底', g => {
  let seed = 101, dodges = 0, summons = 0
  const rng = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
  const e = spawn(g), c = g.weaponSystem.shadowCombat.clones
  g.weaponSystem.shadowCombat.guardCharges = 0
  random(rng, () => {
    for (let i = 0; i < 10000; i++) {
      g.player.hp = 100; g.player.invincible = 0; g.player.evasionFlash = 0; g.player.shadowEvasionMisses = 0
      if (!g.player.hit(1, { enemyAttack: true })) dodges++
      c.procCooldown = 0
      if (c.onCritical(e, {})) summons++
    }
  })
  assert.ok(dodges > 1650 && dodges < 1950, String(dodges))
  assert.ok(summons > 5750 && summons < 6250, String(summons))
  let streak = 0, maxStreak = 0, pityDodges = 0
  random(rng, () => {
    for (let i = 0; i < 2000; i++) {
      g.player.hp = 100; g.player.invincible = 0; g.player.evasionFlash = 0
      if (!g.player.hit(1, { enemyAttack: true })) { pityDodges++; streak = 0 }
      else { streak++; maxStreak = Math.max(maxStreak, streak) }
    }
  })
  assert.ok(pityDodges > 500 && maxStreak <= 14, `dodges=${pityDodges}, maxStreak=${maxStreak}`)
})
check('远程优先选可见分身；近身更近且可见的非首领近战就近分流，正面/远距近战与 Boss 保持本体目标', g => {
  const c = summon(g), mage = spawn(g, { type: 'mage', x: 220 })
  c.x = g.player.x + 80; c.y = g.player.y
  const frontKnight = spawn(g, { type: 'knight', x: -60 })
  const flankKnight = spawn(g, { type: 'knight', x: 130 })
  const priest = spawn(g, { type: 'priest', x: 95 })
  assert.equal(g.player.getEnemyTarget(mage), c)
  assert.equal(g.player.getEnemyTarget(frontKnight), g.player, '距离本体更近的正面近战仍追本体')
  assert.equal(g.player.getEnemyTarget(flankKnight), c, '距离分身更近的近战被就近分流')
  assert.equal(g.player.getEnemyTarget(priest), g.player)
  assert.equal(g.player.getEnemyTarget(spawnBoss(g)), g.player)
  c.life = 0
  assert.equal(g.player.getEnemyTarget(mage), g.player)
  assert.equal(g.player.getEnemyTarget(flankKnight), g.player)
})
check('分身优先追击射手，墙后目标不可诱敌或追击', g => {
  const knight = spawn(g, { x: 30 }), c = summon(g, knight)
  const mage = spawn(g, { type: 'mage', x: 160 })
  const clones = g.weaponSystem.shadowCombat.clones
  assert.equal(clones.nearest(c), mage)
  g.mapFeatures.resolvePlayerMovement = (probe, x, y) => { probe.x = x; probe.y = y; return true }
  assert.equal(clones.nearest(c), null)
  assert.equal(clones.lureTarget(mage), null)
})
check('高速弹幕先撞分身则挡弹，初始每发仅扣 0.35 秒且不消耗攻击冷却', g => {
  const c = summon(g), p = g.player
  c.x = p.x - 80; c.y = p.y; c.cooldown = 0.4
  const life = c.life
  g.enemyManager.spawnBullet(p.x - 160, p.y, 0, 'archer', { speed: 2000 })
  random(() => { throw Error('blocked shot must not roll dodge') }, () => g.enemyManager._updateBullets(0.1))
  near(c.life, life - 0.35); near(c.cooldown, 0.4)
  assert.equal(p.hp, p.maxHp); assert.equal(g.weaponSystem.stats.shadowBlocks, 1)
  assert.equal(g.enemyManager._bullets.length, 0)
})
check('本体在前时不能让身后分身隔空挡弹', g => {
  const c = summon(g), p = g.player, life = c.life
  g.weaponSystem.shadowCombat.guardCharges = 0
  c.x = p.x + 80; c.y = p.y
  g.enemyManager.spawnBullet(p.x - 100, p.y, 0, 'archer', { speed: 2000 })
  random(0.99, () => g.enemyManager._updateBullets(0.1))
  assert.equal(p.hp, p.maxHp - 1); near(c.life, life)
})
check('密集箭雨耗尽分身后不再挡弹，剩余物理弹幕抵达本体', g => {
  const c = summon(g), p = g.player
  g.weaponSystem.shadowCombat.guardCharges = 0
  c.x = p.x - 80; c.y = p.y; c.life = 1
  for (let i = 0; i < 20; i++) g.enemyManager.spawnBullet(p.x - 160, p.y, 0, 'archer', { speed: 2000 })
  random(0.99, () => g.enemyManager._updateBullets(0.1))
  assert.equal(c.life, 0); assert.equal(g.weaponSystem.stats.shadowBlocks, 3)
  assert.equal(p.hp, p.maxHp - 1); assert.equal(g.enemyManager._bullets.length, 0)
})
check('同路径两个分身只消耗最先接触者', g => {
  const a = summon(g), b = summon(g), p = g.player
  a.x = p.x - 80; a.y = p.y; b.x = p.x - 140; b.y = p.y
  const life = a.life
  g.enemyManager.spawnBullet(p.x - 220, p.y, 0, 'archer', { speed: 2400 })
  g.enemyManager._updateBullets(0.1)
  near(a.life, life); near(b.life, life - 0.35)
})
check('Boss 法术弹幕穿过分身先被影织魔盾吸收，破盾后再命中本体', g => {
  const c = summon(g), p = g.player, life = c.life
  const shield = g.weaponSystem.shadowCombat.shield
  assert.equal(shield.charges, 1)
  c.x = p.x - 80; c.y = p.y
  g.enemyManager.spawnBullet(p.x - 160, p.y, 0, 'mage', { speed: 1600, isBoss: true })
  random(0.99, () => g.enemyManager._updateBullets(0.1))
  near(c.life, life); assert.equal(shield.charges, 0); assert.equal(p.hp, p.maxHp)
  p.invincible = 0
  g.enemyManager.spawnBullet(p.x - 160, p.y, 0, 'mage', { speed: 1600, isBoss: true })
  random(0.99, () => g.enemyManager._updateBullets(0.1))
  near(c.life, life); assert.equal(p.hp, p.maxHp - 1)
})
check('虚化不刷新、不抵扣事件成本，重开清理保护', g => {
  const p = g.player
  random(0, () => p.hit(1, { enemyAttack: true }))
  p.update(0.1)
  random(() => { throw Error('protected hit rerolled') }, () => p.hit(1, { enemyAttack: true }))
  near(p.evasionFlash, 0.1)
  p.hit(1); assert.equal(p.hp, p.maxHp - 1)
  g.reset(); assert.equal(p.evasionFlash, 0)
})
check('法师实际朝分身开火，Boss 普攻弹幕带来源标记', g => {
  const p = g.player, c = summon(g)
  c.x = p.x; c.y = p.y + 90
  const mage = spawn(g, { type: 'mage', x: 220 })
  mage.attackCd = 0; mage.update(0.01)
  const shot = g.enemyManager._bullets[0]
  assert.ok(shot && shot.vy > 0)
  near(Math.atan2(shot.vy, shot.vx), Math.atan2(c.y - mage.y, c.x - mage.x))
  g.enemyManager._bullets.length = 0
  const boss = spawnBoss(g, 300, 'boss-mage')
  boss.x = p.x + 270; boss.y = p.y; boss.attackCd = 0
  boss.specialCd = 100; boss.summonCd = 100; boss.update(0.01)
  assert.ok(g.enemyManager._bullets.length > 0)
  assert.ok(g.enemyManager._bullets.every(b => b.isBoss))
})
check('擦过分身的弹幕仍然存在，换角色后残留分身不能挡弹', g => {
  const p = g.player, c = summon(g), life = c.life
  g.camera.x = p.x - 300; g.camera.y = p.y - 300
  c.x = p.x - 80; c.y = p.y + 100
  g.enemyManager.spawnBullet(p.x - 160, p.y + 170, 0, 'mage', { speed: 1600 })
  g.enemyManager._updateBullets(0.1)
  assert.equal(g.enemyManager._bullets.length, 1); near(c.life, life)
  c.y = p.y; g.startingStrain = 'origin'
  g.enemyManager.spawnBullet(p.x - 160, p.y, 0, 'mage', { speed: 1600 })
  g.enemyManager._updateBullets(0.1)
  near(c.life, life); assert.equal(p.hp, p.maxHp - 1)
})
check('天生起点留影与影袭双影 T1 无前置且单级，起手留影获 2 次免费挡弹并在落地生第 2 影', g => {
  const p = g.player, c = g.weaponSystem.shadowCombat, x = p.x, y = p.y
  c.clones.procCooldown = 0.3
  random(() => { throw Error('F spawn rolled chance') }, () => pressSpace(g))
  assert.equal(c.clones.items.length, 1)
  const innateClone = c.clones.items[0]
  near(innateClone.x, x); near(innateClone.y, y); near(c.clones.procCooldown, 0.3)
  assert.equal(innateClone.freeBlocks, 0)
  assert.ok(!c.assault.cloneIds.has(innateClone.id))
  p.update(0.26)
  assert.ok(Math.hypot(p.x - x, p.y - y) > 100)
  near(innateClone.x, x); near(innateClone.y, y)
  assert.equal(c.clones.items.length, 1)

  g.reset()
  const card = rollSkills(g, 99).find(s => s.id === 'ass_afterimage')
  assert.ok(card); assert.equal(card.maxLevel, 1)
  learn(g, 'ass_afterimage')
  assert.ok(!rollSkills(g, 99).some(s => s.id === 'ass_afterimage'))
  const x2 = p.x, y2 = p.y
  random(() => { throw Error('F spawn rolled chance') }, () => pressSpace(g))
  assert.equal(c.clones.items.length, 1)
  const originClone = c.clones.items[0]
  near(originClone.x, x2); near(originClone.y, y2)
  assert.equal(originClone.freeBlocks, 2)
  p.update(0.26)
  assert.equal(c.clones.items.length, 2)
  const arrivalClone = c.clones.items[1]
  assert.ok(Math.hypot(arrivalClone.x - p.x, arrivalClone.y - p.y) < 30)
})
check('受阻施放不生成分身，重开清除双影天赋', g => {
  const c = g.weaponSystem.shadowCombat
  g.mapFeatures.resolvePlayerMovement = (probe, x, y) => { probe.x = x; probe.y = y; return true }
  assert.equal(c.useAssault(), false); assert.equal(c.clones.items.length, 0)
  g.reset(); learn(g, 'ass_afterimage')
  g.mapFeatures.resolvePlayerMovement = (probe, x, y) => { probe.x = x; probe.y = y; return true }
  assert.equal(c.useAssault(), false); assert.equal(c.clones.items.length, 0)
  g.reset(); assert.equal(g.player.shadowAssaultClone, false)
})
check('满额留身刷新并移回最短寿命者，保留冷却、不加入当次夹击，双影落地强袭刷新余影', g => {
  const c = g.weaponSystem.shadowCombat, e = spawn(g, { x: 100, hp: 1000 })
  const first = summon(g, e), second = summon(g, e)
  first.life = 1; first.cooldown = 0.42; second.life = 2
  learn(g, 'ass_afterimage'); prepareCloneSkill(g); learn(g, 'ass_decoy', 2)
  g.player.facing = 0; pressSpace(g)
  assert.equal(c.clones.items.length, 2)
  near(first.x, g.player.x); near(first.y, g.player.y)
  near(first.life, 7); near(first.cooldown, 0.42); near(second.life, 2)
  assert.equal(first.freeBlocks, 2)
  assert.ok(!c.assault.cloneIds.has(first.id)); assert.ok(c.assault.cloneIds.has(second.id))
  random(0, () => g.player.update(0.26))
  assert.equal(first.rush, null); assert.ok(second.rush)
  assert.equal(second.overcharge, 1); assert.equal(second.freeBlocks, 1)
})
check('F 留身继承成长与免费挡弹，挡完后再消耗寿命，命中暴击仍可额外生影', g => {
  const c = g.weaponSystem.shadowCombat, p = g.player
  learn(g, 'ass_afterimage'); prepareCloneSkill(g, true); learn(g, 'ass_decoy', 2); learn(g, 'ass_execute', 3)
  spawn(g, { x: 100, hp: 1000 }); p.facing = 0
  pressSpace(g); const clone = c.clones.items[0]
  near(clone.life, 7); near(c.clones.power, 1.09); assert.equal(clone.freeBlocks, 2)
  random(0, () => p.update(0.26))
  assert.equal(c.clones.items.length, 2)
  assert.ok(c.clones.items.every(item => !item.rush))
  const hp = p.hp
  g.enemyManager.spawnBullet(clone.x - 80, clone.y, 0, 'mage', { speed: 800 })
  g.enemyManager._updateBullets(0.1)
  near(clone.life, 7); assert.equal(clone.freeBlocks, 1); assert.equal(p.hp, hp)
  g.enemyManager.spawnBullet(clone.x - 80, clone.y, 0, 'mage', { speed: 800 })
  g.enemyManager._updateBullets(0.1)
  near(clone.life, 7); assert.equal(clone.freeBlocks, 0); assert.equal(p.hp, hp)
  g.enemyManager.spawnBullet(clone.x - 80, clone.y, 0, 'mage', { speed: 800 })
  g.enemyManager._updateBullets(0.1)
  near(clone.life, 6.82); assert.equal(p.hp, hp)
})

check('影织魔盾（方案 B 纯法术）：仅抵挡法术伤害并附带反制必暴与多弹短无敌', g => {
  const p = g.player, combat = g.weaponSystem.shadowCombat, shield = combat.shield
  combat.guardCharges = 0
  assert.equal(shield.charges, 1); assert.equal(shield.capacity, 1)

  // 1) 物理弓手箭矢：不触发也不消耗影织魔盾
  g.enemyManager.spawnBullet(p.x - 90, p.y, 0, 'archer', { speed: 1200 })
  random(0.99, () => g.enemyManager._updateBullets(0.1))
  assert.equal(shield.charges, 1); assert.equal(p.hp, p.maxHp - 1)

  // 2) 物理近战：不消耗魔盾；法术法师球：消耗 1 层魔盾并获 0.25s 短无敌+下击必暴
  p.hp = p.maxHp; p.invincible = 0; p.evasionFlash = 0
  random(0.99, () => p.hit(1, { enemyAttack: true, spellAttack: false }))
  assert.equal(shield.charges, 1); assert.equal(p.hp, p.maxHp - 1)
  p.hp = p.maxHp; p.invincible = 0; p.evasionFlash = 0; g.weaponSystem.critChance = 0
  g.enemyManager.spawnBullet(p.x - 90, p.y, 0, 'mage', { speed: 1200 })
  g.enemyManager.spawnBullet(p.x - 95, p.y, 0, 'mage', { speed: 1200 })
  random(0.99, () => g.enemyManager._updateBullets(0.1))
  assert.equal(shield.charges, 0); assert.equal(p.hp, p.maxHp)
  near(p.invincible, 0.25); assert.equal(p.guaranteedCrit, true)
  const victim = spawn(g, { x: 30, hp: 50 })
  random(0.99, () => combat.stab(victim))
  combat.update(0.12)
  assert.ok(victim.hp < 50 - 2.5, '噬法反制触发本体必暴')

  // 3) 炼金毒瓶落地（hazard spellAttack）与远征法系机制：消耗魔盾；非暗影血统不启用魔盾
  shield.grantLayer({ counterBuff: false }); p.invincible = 0; p.hp = p.maxHp
  g.enemyManager._hazards.push({ active: true, landed: false, age: 0, flightDur: 0.05, lingerDur: 1, x: p.x, y: p.y, radius: 36, damage: 1 })
  random(0.99, () => g.enemyManager._updateHazards(0.1))
  assert.equal(shield.charges, 0); assert.equal(p.hp, p.maxHp)

  shield.grantLayer({ counterBuff: false }); p.invincible = 0; p.hp = p.maxHp
  const expMage = new ExpeditionBoss({ x: p.x, y: p.y, wave: 5, encounter: { id: 'audit_mage', archetype: 'mage', mechanic: 'royal-chess', name: 'audit', cooldown: 5 } })
  expMage.attach(g); expMage.targetX = p.x; expMage.targetY = p.y
  expMage.skillData = { tile: 100, safeParity: 1 - expMage._tileParity(p.x, p.y, 100) }
  random(0.99, () => expMage._executeSpecial())
  assert.equal(shield.charges, 0); assert.equal(p.hp, p.maxHp)

  g.applyStartingStrain('origin'); g.reset()
  assert.equal(g.weaponSystem.shadowCombat.shield.charges, 0)
})

check('噬法暗幕、主动充能机制与防叠满溢出浪费（暴击/闪避率双溢出转暴伤）', g => {
  const combat = g.weaponSystem.shadowCombat, shield = combat.shield, p = g.player
  // 噬法暗幕 Lv.1~4 扩容、减 CD、返冷却、召反制影与破法震波
  learn(g, 'ass_ward', 1)
  assert.equal(shield.capacity, 2); assert.equal(shield.charges, 2); near(shield.cooldown, 7.5)
  p.strainSkillCd = 3.0; p.invincible = 0; p.evasionFlash = 0
  random(0.99, () => p.hit(1, { enemyAttack: true, spellAttack: true }))
  assert.equal(shield.charges, 1); near(p.strainSkillCd, 2.0)
  assert.equal(combat.clones.items.length, 1)

  learn(g, 'ass_ward', 2)
  assert.equal(shield.capacity, 3); assert.equal(shield.charges, 2); near(shield.cooldown, 5.5)
  // 主动加速：闪避(+2.5s/+1s 长夜披风Lv3)、暴击(+0.6s)、击杀远程(+2.0s)
  learnTome(g, 'boss_shadow_cloak', 3)
  p.invincible = 0; p.evasionFlash = 0
  random(0, () => p.hit(1, { enemyAttack: true }))
  assert.ok(shield.recharge >= 3.4, `evade recharge=${shield.recharge}`)
  shield.accelerate(10)
  assert.equal(shield.charges, 3)

  // 4级噬法暗幕破法震波 & 满级溢出转化：暴击率 > 100% 与闪避率 > 40% 转暴伤
  combat.route = 'hunt'
  learn(g, 'ass_ward', 1)
  const foe = spawn(g, { x: 60, hp: 50 })
  p.invincible = 0; p.evasionFlash = 0
  random(0.99, () => p.hit(1, { enemyAttack: true, spellAttack: true }))
  assert.ok(foe.hp < 50, 'Lv.4 噬法暗幕挡法触发破法震波')

  learn(g, 'ass_lethal', 3)
  const baseMul = g.weaponSystem.critMul
  setCritSource(g, 'overcap_test', { chance: 1.0 })
  assert.ok(g.weaponSystem.rawCritChance >= 1.2)
  assert.equal(g.weaponSystem.critChance, 1.0)
  near(g.weaponSystem.critMul, baseMul + (g.weaponSystem.rawCritChance - 1) * 2)

  learn(g, 'ass_stride', 8)
  assert.ok(p.evasionOverflow > 0.1)
  assert.equal(p.evasionChance, 0.4)
  assert.ok(shield.rechargeHaste > 1.5, '溢出闪避转化为魔盾充能速度')
})

check('分身攻速继承、满额过载强化与三大新路线机制', g => {
  const combat = g.weaponSystem.shadowCombat, clones = combat.clones, shield = combat.shield, p = g.player
  // 1) 分身攻速继承：攻击间隔缩半时分身攻击冷却同步缩短（系数 0.5）
  const prevCloneInterval = clones.attackInterval
  g.weaponSystem.fireInterval *= 0.5
  assert.ok(clones.attackInterval < prevCloneInterval * 0.7, `prev=${prevCloneInterval}, next=${clones.attackInterval}`)

  // 2) 满额生影过载（next hit 1.5x）+ 加速魔盾 0.6s
  const e = spawn(g, { x: 60, hp: 200 })
  const a = clones.createAt(p, 0), b = clones.createAt(p, 0)
  a.life = 0.8; shield.charges = 0; shield.recharge = 0
  clones.procCooldown = 0
  random(0, () => assert.equal(clones.onCritical(e, {}), true))
  assert.equal(clones.items.length, 2)
  assert.equal(a.overcharge, 1); near(shield.recharge, 0.6)
  const overBefore = e.hp
  random(0.99, () => clones.hit(a, e, clones.power))
  near(e.hp, overBefore - clones.power * 1.5)
  assert.equal(a.overcharge, 0)

  // 3) 群影新卡：shadow_swarm_crit + shadow_swarm_bulwark（免费挡弹+消散斩）
  clones.reset(); learn(g, 'ass_echo', 1); combat.route = 'swarm'
  learnRoute(g, 'shadow_swarm_crit', 2); learnRoute(g, 'shadow_swarm_bulwark', 2)
  assert.ok(combat.cloneCritInherit > 0.75); assert.ok(combat.cloneCritMultiplier > 2.0)
  const bulwarkClone = clones.createAt(p, 0)
  assert.equal(bulwarkClone.freeBlocks, 1)
  bulwarkClone.x = p.x - 80; bulwarkClone.y = p.y; bulwarkClone.life = 0.5
  g.enemyManager.spawnBullet(p.x - 150, p.y, 0, 'archer', { speed: 1200 })
  g.enemyManager._updateBullets(0.1)
  near(bulwarkClone.life, 0.5); assert.equal(bulwarkClone.freeBlocks, 0)
  bulwarkClone.x = e.x + 30; bulwarkClone.y = e.y
  const eHpBefore = e.hp
  step(g, 0.6)
  assert.ok(e.hp < eHpBefore, '影幕护主分身消散时爆出影斩')

  // 4) 刃潮新卡：shadow_blade_riposte（闪避/挡法反刃）与 shadow_blade_rend（横斩碎法球）
  g.reset()
  learn(g, 'ass_cleave', 1); g.weaponSystem.shadowCombat.route = 'blade'
  learnRoute(g, 'shadow_blade_riposte', 1); learnRoute(g, 'shadow_blade_rend', 1)
  const closeEnemy = spawn(g, { x: 50, hp: 50 })
  random(0, () => g.player.hit(1, { enemyAttack: true }))
  assert.ok(closeEnemy.hp < 50, '虚影反刃在闪避时周身反击')
  assert.ok(g.player.shadowRiposteCritTimer > 0)
  g.enemyManager.spawnBullet(g.player.x + 40, g.player.y, Math.PI, 'mage', { speed: 10 })
  g.enemyManager.spawnBullet(g.player.x + 40, g.player.y, Math.PI, 'mage', { speed: 10, isBoss: true })
  const [orb, bossOrb] = g.enemyManager._bullets.slice(-2)
  g.weaponSystem.shadowCombat.cleave(closeEnemy, 0)
  assert.equal(orb.active, false, '噬法刃舞横斩碎普通法球')
  assert.equal(bossOrb.active, true, '首领法球不因普通刃舞直接删弹，需走魔盾吸收')

  // 5) 猎杀新卡：shadow_hunt_spellbreak 压制法敌施法 + 无间影袭追击恢复魔盾
  g.reset()
  learnRoute(g, 'shadow_hunt_mark', 1); g.weaponSystem.shadowCombat.route = 'hunt'
  learnRoute(g, 'shadow_hunt_spellbreak', 2)
  g.weaponSystem.shadowCombat.routeUltimate = 'hunt'
  const stepAll = (seconds) => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      g.player.update(1 / 60)
      g.weaponSystem.shadowCombat.update(1 / 60)
    }
  }
  const mage = spawn(g, { type: 'mage', x: 90, hp: 200 })
  g.player.facing = 0; g.weaponSystem.shadowCombat.shield.charges = 0
  random(0.99, () => pressSpace(g))
  stepAll(0.35)
  assert.ok(mage.attackCd >= 1.2 && mage.spellSlowTime > 1.0, '破法绝杀压制远程目标节奏')
  assert.equal(g.weaponSystem.shadowCombat.canFollowup, true)
  g.player.facing = Math.atan2(mage.y - g.player.y, mage.x - g.player.x)
  pressSpace(g)
  stepAll(0.35)
  assert.equal(g.weaponSystem.shadowCombat.shield.charges, 1, '无间影袭追击命中恢复 1 层暗影魔盾')

  // 6) 刃潮终极「永夜刃域」域内提升闪避上限(+8%)与魔盾充能(+35%)
  g.reset()
  learn(g, 'ass_cleave', 1); g.weaponSystem.shadowCombat.route = 'blade'
  learn(g, 'ass_stride', 8)
  const preDomainEvasion = g.player.evasionChance
  const preDomainHaste = g.weaponSystem.shadowCombat.shield.rechargeHaste
  g.weaponSystem.shadowCombat.createDomain(g.player.x, g.player.y, 0)
  step(g, 0.05)
  near(g.player.evasionChance, preDomainEvasion + 0.08)
  near(g.weaponSystem.shadowCombat.shield.rechargeHaste, preDomainHaste + 0.35)
})

check('影魄汲取（方案 1）：暴击/闪避/挡法攒点回血、冷却防刷与满血双态反哺', g => {
  const combat = g.weaponSystem.shadowCombat, shield = combat.shield, p = g.player
  // 1) 本体暴击 +1（同动作及 0.4s ICD 去重），分身暴击 +0.5（0.5s ICD），闪避/挡法 +3（共享 1.5s ICD）
  const e = spawn(g, { x: 40, hp: 200 })
  g.weaponSystem.critChance = 1
  const dashAction = { hitTargets: new Set() }
  combat.hit(e, 1, { guaranteed: true, action: dashAction })
  combat.hit(e, 1, { guaranteed: true, action: dashAction })
  assert.equal(combat.soulPoints, 1)
  step(g, 0.45)
  const clone = combat.clones.createAt(p, 0)
  random(0, () => combat.clones.hit(clone, e, combat.clones.power))
  combat.clones.hit(clone, e, combat.clones.power)
  near(combat.soulPoints, 1.5)

  p.invincible = 0; p.evasionFlash = 0
  random(0, () => p.hit(1, { enemyAttack: true }))
  near(combat.soulPoints, 4.5)
  p.invincible = 0; p.evasionFlash = 0
  random(0.99, () => p.hit(1, { enemyAttack: true, spellAttack: true }))
  near(combat.soulPoints, 4.5, '共享 1.5s 防挂机刷点冷却，连触发不重复加点')
  random(0.99, () => step(g, 1.55))
  p.invincible = 0; p.evasionFlash = 0
  random(0, () => p.hit(1, { enemyAttack: true }))
  near(combat.soulPoints, 7.5)

  // 2) 受伤状态下满 16 点回 1 血，进入 12s 冷却；ass_ward 缩减冷却（Lv.3 为 9s）
  p.hp = p.maxHp - 2
  combat.gainSoul(8.5)
  assert.equal(p.hp, p.maxHp - 1); assert.equal(combat.soulPoints, 0); near(combat.soulHealCd, 12)
  learn(g, 'ass_ward', 3)
  assert.equal(combat.soulHealCooldown, 9)

  // 3) 冷却期满点停表在 16 点不连奶，冷却归零帧自动回复 1 点
  combat.gainSoul(20)
  assert.equal(combat.soulPoints, 16); assert.equal(p.hp, p.maxHp - 1)
  step(g, 11.9)
  assert.equal(p.hp, p.maxHp - 1)
  step(g, 0.2)
  assert.equal(p.hp, p.maxHp); assert.equal(combat.soulPoints, 0); assert.ok(combat.soulHealCd > 8.5)

  // 4) 满血时不浪费也不预存：优先反哺魔盾(+3s)，魔盾已满则触发 2.5s 影魄涌动
  shield.charges = 0; shield.recharge = 0
  combat.gainSoul(16)
  assert.equal(combat.soulPoints, 0); assert.ok(shield.recharge >= 2.9, '满血满点加速魔盾充能')
  while (shield.charges < shield.capacity) shield.grantLayer({ counterBuff: false })
  combat.gainSoul(16)
  near(p.shadowSoulSurgeTimer, 2.5)
  assert.equal(combat.soulPoints, 0)

  // 5) 猎杀击杀标记额外 +2 影魄；重开清理全部状态
  combat.reset({ preserveBuild: true }); combat.route = 'hunt'
  learnRoute(g, 'shadow_hunt_mark', 1)
  const victim = spawn(g, { x: 40, hp: 1 })
  combat.markHuntTarget(victim)
  combat.hit(victim, 5, { guaranteed: true, action: {} })
  assert.equal(combat.soulPoints, 3, '暴击 +1 且猎杀标记击杀额外 +2')
  g.reset()
  assert.equal(combat.soulPoints, 0); assert.equal(combat.soulHealCd, 0); assert.equal(p.shadowSoulSurgeTimer, 0)
})

check('首领战双倍影魄：暴击命中首领与闪避/挡法首领攻击点数 ×2', g => {
  const combat = g.weaponSystem.shadowCombat, shield = combat.shield, p = g.player
  const boss = spawnBoss(g, 500, 'boss-knight')
  g.weaponSystem.critChance = 1
  combat.hit(boss, 1, { guaranteed: true, action: {} })
  assert.equal(combat.soulPoints, 2, '本体暴击命中首领 +2 点')

  const clone = combat.clones.createAt(p, 0)
  random(0, () => combat.clones.hit(clone, boss, combat.clones.power))
  near(combat.soulPoints, 3, '分身暴击命中首领 +1 点')

  // 首领强招事件 & 远征强招事件均带 isBoss: true，闪避或魔盾挡法得 +6 点（仍受 1.5s ICD 与回血 CD 约束）
  p.invincible = 0; p.evasionFlash = 0
  boss._startSpecial(); boss.specialPattern = 'boss-knight'; boss.dashHit = false
  boss.specialTimer = 0.05; boss.lockedAngle = 0
  boss.x = p.x; boss.y = p.y
  random(0, () => boss._updateKnightDash(0.01))
  near(combat.soulPoints, 9, '闪避普通首领强招 +6 点')

  random(0.99, () => step(g, 1.55))
  p.invincible = 0; p.evasionFlash = 0
  const expBoss = new ExpeditionBoss({
    x: p.x, y: p.y, wave: 5,
    encounter: { id: 'audit_boss_soul', archetype: 'mage', mechanic: 'royal-chess', name: 'audit', cooldown: 5 },
  })
  expBoss.attach(g); expBoss.targetX = p.x; expBoss.targetY = p.y
  expBoss.skillData = { tile: 100, safeParity: 1 - expBoss._tileParity(p.x, p.y, 100) }
  p.hp = p.maxHp - 1
  random(0.99, () => expBoss._executeSpecial())
  assert.equal(shield.charges, 0)
  near(combat.soulPoints, 15, '魔盾挡下远征首领法术 +6 点')
  random(0.99, () => step(g, 0.5))
  combat.hit(boss, 1, { guaranteed: true, action: {} })
  assert.equal(p.hp, p.maxHp, '首领暴击 +2 凑满 16 点触发回血')
  assert.equal(combat.soulPoints, 0); near(combat.soulHealCd, 12)
})

check('分身近身软嘲讽（方案 B）：近战承伤扣寿、不助怨灵吸血、长夜留影减损与影幕护主协同', g => {
  const combat = g.weaponSystem.shadowCombat, clones = combat.clones, p = g.player
  const clone = clones.createAt(p, 0)
  clone.x = p.x + 100; clone.y = p.y
  const knight = spawn(g, { type: 'knight', x: 135, damage: 1 })
  const wraith = spawn(g, { type: 'wraith', x: 130, hp: 20, maxHp: 20, damage: 1 })
  wraith.hp = 10

  // 1) 普通近战先挑最近且在 170px 内的分身，打中分身只扣 0.45s 寿命且本体满血
  assert.equal(p.getEnemyTarget(knight), clone)
  assert.equal(p.getEnemyTarget(wraith), clone)
  const hpBefore = p.hp
  knight._hitTarget(clone, p, 1)
  near(clone.life, 4 - 0.45); assert.equal(p.hp, hpBefore)
  const wraithLanded = wraith._hitTarget(clone, p, 1)
  assert.equal(wraithLanded, false)
  assert.equal(wraith.hp, 10, '怨灵攻击分身不得触发吸血回复')

  // 2) 长夜留影 Lv.2 将近战承伤损耗降至 0.25s；超过 170px 远敌不被跨屏强吸
  learn(g, 'ass_lethal', 1); learn(g, 'ass_decoy', 2)
  const sturdyClone = clones.createAt(p, 0)
  sturdyClone.x = p.x + 120; sturdyClone.y = p.y
  const life2 = sturdyClone.life
  knight._hitTarget(sturdyClone, p, 1)
  near(sturdyClone.life, life2 - 0.25)
  const farKnight = spawn(g, { type: 'knight', x: 350 })
  assert.equal(p.getEnemyTarget(farKnight), p, '超过 170px 的远处近战不被跨半屏嘲讽')

  // 3) 群影「影幕护主」免费护甲先抵挡近战伤害；耗尽致死爆出影斩
  learn(g, 'ass_echo', 1); combat.route = 'swarm'
  learnRoute(g, 'shadow_swarm_bulwark', 2)
  clones.reset()
  const bulwark = clones.createAt(p, 0)
  bulwark.x = p.x + 100; bulwark.y = p.y; bulwark.life = 0.2
  assert.equal(bulwark.freeBlocks, 1)
  knight._hitTarget(bulwark, p, 1)
  near(bulwark.life, 0.2); assert.equal(bulwark.freeBlocks, 0)
  const foe = spawn(g, { type: 'knight', x: 115, hp: 50 })
  knight._hitTarget(bulwark, p, 1)
  assert.equal(bulwark.life, 0)
  assert.ok(foe.hp < 50, '近战打死影幕护主分身时触发原地影斩')

  // 4) 隔墙不可近战分流嘲讽
  bulwark.life = 4
  g.mapFeatures.resolvePlayerMovement = (probe, x, y) => { probe.x = x; probe.y = y; return true }
  assert.equal(clones.lureTarget(knight), null)
})

check('影袭落地 2 秒随机闪避暴击与命中缩减影魄回血冷却（口径 B）', g => {
  const combat = g.weaponSystem.shadowCombat, p = g.player
  const stepAll = seconds => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      p.update(1 / 60)
      combat.update(1 / 60)
    }
  }

  // 1) 空放影袭：前摇期间不触发；落地后才给 2 秒闪避+暴击，但空放不减影魄回血冷却且不污染溢出闪避
  combat.soulHealCd = 10
  p.facing = 0
  random(0, () => {
    pressSpace(g)
    stepAll(0.08)
    assert.equal(p.shadowAssaultBuffTimer, 0, '前摇阶段尚未落地，不提前开算')
    stepAll(0.22)
  })
  assert.ok(p.shadowAssaultBuffTimer > 1.8 && p.shadowAssaultBuffTimer <= 2.0)
  near(p.shadowAssaultEvasionBonus, 0.15); near(p.shadowAssaultCritBonus, 0.10)
  near(p.evasionChance, 0.18 + 0.15); assert.equal(p.evasionOverflow, 0)
  assert.ok(combat.soulHealCd > 9.6 && combat.soulHealCd < 9.8, `空放仅随时间流逝，未触发缩冷: cd=${combat.soulHealCd}`)

  // 2) 到期自然清空
  stepAll(2.05)
  assert.equal(p.shadowAssaultBuffTimer, 0)
  near(p.evasionChance, 0.18); assert.equal(p.shadowAssaultCritBonus, 0)

  // 3) 命中敌人：上限边界随机 +40% 闪避（临时顶帽 72%）、+30% 暴击、-2.5s 回血冷却并支持溢出触发满点回血
  p.strainSkillCd = 0
  p.shadowEvasionBonus = 0.22
  p.hp = p.maxHp - 1
  combat.soulPoints = 16; combat.soulHealCd = 2.0
  spawn(g, { x: 80, hp: 200 })
  p.facing = 0
  random(0.9999, () => {
    pressSpace(g)
    stepAll(0.32)
  })
  near(p.shadowAssaultEvasionBonus, 0.40); near(p.shadowAssaultCritBonus, 0.30)
  near(p.evasionChance, 0.72, '满被动 40% + 随机 40% 临时封顶在 72% 安全天花板')
  assert.equal(p.evasionOverflow, 0, '临时闪避不混入溢出暴伤/魔盾折算')
  assert.equal(p.hp, p.maxHp, '影袭命中把 2.0s 回血冷却砍至 0 后立刻兑现满点 16 点回血')

  // 4) 猎杀免费追击不二次砍回血冷却；重开彻底清零
  combat.route = 'hunt'; combat.routeUltimate = 'hunt'
  combat.huntFollowupReady = true; combat.huntFollowupTimer = 1.0
  combat.soulHealCd = 8.0
  p.facing = Math.PI
  random(0.9999, () => {
    pressSpace(g)
    stepAll(0.32)
  })
  assert.ok(combat.soulHealCd > 7.6 && combat.soulHealCd < 7.8, `猎杀免费追击不重复缩冷: cd=${combat.soulHealCd}`)
  g.reset()
  assert.equal(p.shadowAssaultBuffTimer, 0); assert.equal(p.shadowAssaultEvasionBonus, 0); assert.equal(p.shadowAssaultCritBonus, 0)
})

check('普攻智能微步不逆向拉人、刀光破箭(0.5s ICD)、3刀185px影波与影袭±22°吸附穿行碎弹', g => {
  const c = g.weaponSystem.shadowCombat, p = g.player
  const front = spawn(g, { x: 70, hp: 5000 }), far = spawn(g, { x: 175, hp: 5000 })
  const x0 = p.x
  // 1) 后撤拉扯方向与目标夹角 > 90° 时，智能微步绝不逆向拽回怪堆
  g.input.state.left = true
  assert.equal(c.stab(front), true)
  near(p.x, x0)
  step(g, 0.3)
  near(far.hp, 5000)

  // 2) 松开后撤（静止/顺向）会正常小步微调，且第2刀触发刀光破箭（只破1发非Boss弹，触发0.5s ICD）
  g.input.state.left = false
  g.enemyManager.spawnBullet(p.x + 42, p.y, Math.PI, 'mage', { speed: 0 })
  const bBoss = g.enemyManager._bullets.at(-1); bBoss.isBoss = true
  g.enemyManager.spawnBullet(p.x + 44, p.y, Math.PI, 'archer', { speed: 0 })
  const b1 = g.enemyManager._bullets.at(-1)
  g.enemyManager.spawnBullet(p.x + 46, p.y, Math.PI, 'archer', { speed: 0 })
  const b2 = g.enemyManager._bullets.at(-1)
  const frontAfter1 = front.hp
  assert.equal(c.stab(front), true)
  assert.ok(p.x > x0, `idle stab should step forward: ${x0} -> ${p.x}`)
  step(g, 0.25)
  const singleStabDmg = frontAfter1 - front.hp
  assert.ok(singleStabDmg > 0)
  assert.equal(bBoss.active, true)
  assert.equal(b1.active, false)
  assert.equal(b2.active, true)
  assert.ok(c.bladeParryIcd > 0.2, `parry ICD active: ${c.bladeParryIcd}`)
  near(far.hp, 5000)

  // 3) ICD 内第3刀不重复破箭，但释放 185px 穿透影波击中远端目标（近身目标不吃双份伤害）
  const frontBefore3 = front.hp
  assert.equal(c.stab(front), true)
  step(g, 0.2)
  assert.equal(b2.active, true)
  assert.ok(c.waves.length > 0)
  assert.ok(far.hp < 5000, `3rd stab shadow wave should hit far enemy at 175px: hp=${far.hp}`)
  assert.ok(Math.abs((frontBefore3 - front.hp) - singleStabDmg) < 1e-6)

  // 4) ICD 冷却归零后再次出刀可继续破箭（此前因 ICD 幸存的 b2 被本次刀光劈碎）
  step(g, 0.6)
  assert.equal(c.stab(front), true)
  step(g, 0.25)
  assert.equal(b2.active, false)

  // 5) 影袭 ±22° 自动吸附与 22px 宽道穿行碎弹，0.06s 前摇保持虚弱窗口
  g.reset()
  const c2 = g.weaponSystem.shadowCombat, p2 = g.player
  p2.facing = 0
  const a18 = (18 * Math.PI) / 180, a45 = (45 * Math.PI) / 180
  const snapTarget = spawn(g, { x: Math.cos(a18) * 120, y: Math.sin(a18) * 120, hp: 1000 })
  const wideTarget = spawn(g, { x: Math.cos(a45) * 80, y: Math.sin(a45) * 80, hp: 1000 })
  for (const dist of [40, 75, 110]) {
    g.enemyManager.spawnBullet(p2.x + Math.cos(a18) * dist, p2.y + Math.sin(a18) * dist, Math.PI, 'archer', { speed: 0 })
  }
  const dashArrows = g.enemyManager._bullets.slice(-3)
  g.enemyManager.spawnBullet(p2.x + Math.cos(a18) * 60, p2.y + Math.sin(a18) * 60, Math.PI, 'mage', { speed: 0 })
  const dashBossBullet = g.enemyManager._bullets.at(-1); dashBossBullet.isBoss = true

  pressSpace(g)
  assert.ok(Math.abs(c2.assault.angle - a18) < 0.05, `assault should snap onto +18° enemy: ${c2.assault.angle}`)
  p2.update(0.05)
  assert.equal(c2.assault.phase, 'windup')
  assert.equal(p2.invincible, 0)
  p2.update(0.22)
  assert.ok(snapTarget.hp < snapTarget.maxHp)
  near(wideTarget.hp, wideTarget.maxHp)
  assert.ok(dashArrows.every(b => !b.active), 'assault corridor should shatter non-boss bullets')
  assert.equal(dashBossBullet.active, true)
})

check('替身移影致命代死换位、优先最远分身、优先于基因茧触发、40秒冷却与换章重置', g => {
  const c = g.weaponSystem.shadowCombat, p = g.player
  const nearEnemy = spawn(g, { x: 40, hp: 5000 }), farEnemy = spawn(g, { x: 150, hp: 5000 })
  const nearClone = summon(g, nearEnemy), farClone = summon(g, farEnemy)
  nearClone.x = p.x + 40; nearClone.y = p.y
  farClone.x = p.x + 150; farClone.y = p.y
  const farPos = { x: farClone.x, y: farClone.y }

  p.hp = 2; p.invincible = 0; p.geneCocoon = 1; p._cocoonUsed = false
  assert.equal(c.hud().substituteReady, true)
  const hitResult = random(0.99, () => p.hit(4))
  assert.equal(hitResult, false)
  assert.equal(p.hp, 1)
  near(p.x, farPos.x); near(p.y, farPos.y)
  assert.equal(c.clones.items.length, 1)
  assert.equal(c.clones.items[0], nearClone)
  assert.ok(p.invincible >= 0.79 && p.invincible <= 0.81)
  assert.ok(p.evasionFlash >= 0.79 && p.evasionFlash <= 0.81)
  near(c.substituteCd, 40)
  assert.equal(c.hud().substituteReady, false)
  assert.equal(p._cocoonUsed, false)

  // 冷却期间再次致命伤害回落到基因复苏茧，不消耗残余分身
  p.invincible = 0
  random(0.99, () => p.hit(4))
  assert.equal(p._cocoonUsed, true)
  assert.equal(c.clones.items.length, 1)

  // 远征换章清零替身冷却并可再次触发
  g.configureRun({ mode: 'expedition', difficulty: 'normal' })
  g._enterExpeditionStage(2)
  near(c.substituteCd, 0)
  const s3Clone = summon(g, spawn(g, { x: 90, hp: 5000 }))
  s3Clone.x = p.x + 90; s3Clone.y = p.y
  p.hp = 2; p.invincible = 0
  assert.equal(c.hud().substituteReady, true)
  assert.equal(random(0.99, () => p.hit(4)), false)
  assert.equal(p.hp, 1)
  near(p.x, s3Clone.x); near(p.y, s3Clone.y)
  near(c.substituteCd, 40)
})

check('移速加成(+12% 常驻 / +20% 影袭落地)与「影刃格挡」（方案 1：先闪后挡、仅物理、震退、减1伤、进攻缩冷）', g => {
  const p = g.player, combat = g.weaponSystem.shadowCombat
  // 1) 开局常驻 +12% 移速（340 -> 381）且影袭落地 2 秒再 +20% 机动移速
  assert.equal(p.speed, 381)
  assert.equal(combat.guardCharges, 1)
  assert.equal(combat.hud().guard.ready, true)

  g.input.state.right = true
  const xBase = p.x
  for (let i = 0; i < 12; i++) p.update(1 / 60) // 0.2s 常驻走位
  const baseDist = p.x - xBase
  assert.ok(Math.abs(baseDist - 381 * 0.2) < 1.5, `base shadow walk distance=${baseDist}`)

  g.input.state.right = false; p.x = xBase; p.facing = 0
  random(0, () => {
    pressSpace(g)
    for (let i = 0; i < 18; i++) { p.update(1 / 60); combat.update(1 / 60) } // 落地并触发 2s 影遁加速
  })
  assert.ok(p.shadowAssaultBuffTimer > 1.8)
  const xDashEnd = p.x
  g.input.state.right = true
  for (let i = 0; i < 12; i++) { p.update(1 / 60); combat.update(1 / 60) } // 0.2s 疾行走位
  const burstDist = p.x - xDashEnd
  assert.ok(burstDist > baseDist * 1.16, `assault landing +20% speed burst: base=${baseDist}, burst=${burstDist}`)
  g.input.state.right = false

  // 2) 先闪避不耗格挡，法术/环境扣血也不消耗物理格挡
  g.reset()
  const p2 = g.player, c2 = g.weaponSystem.shadowCombat
  assert.equal(c2.guardCharges, 1)
  random(0, () => assert.equal(p2.hit(1, { enemyAttack: true }), false))
  assert.equal(c2.guardCharges, 1)
  p2.evasionFlash = 0; p2.invincible = 0

  // 消耗魔盾 1 层，再吃一发法球（破盾掉血但不耗物理影刃格挡）
  random(0.99, () => p2.hit(1, { enemyAttack: true, spellAttack: true }))
  assert.equal(c2.shield.charges, 0); assert.equal(c2.guardCharges, 1); assert.equal(p2.hp, p2.maxHp)
  p2.invincible = 0
  random(0.99, () => p2.hit(1, { enemyAttack: true, spellAttack: true }))
  assert.equal(c2.guardCharges, 1); assert.equal(p2.hp, p2.maxHp - 1)

  // 非敌方环境扣血 / zoneBurn 不消耗格挡
  p2.hp = p2.maxHp; p2.invincible = 0
  p2.hit(1)
  assert.equal(c2.guardCharges, 1); assert.equal(p2.hp, p2.maxHp - 1)
  p2.hp = p2.maxHp; p2.invincible = 0
  random(0.99, () => p2.hit(1, { enemyAttack: true, spellAttack: false, zoneBurn: true }))
  assert.equal(c2.guardCharges, 1); assert.equal(p2.hp, p2.maxHp - 1)

  // 3) 物理 1 伤未闪避时触发「影刃格挡」：0 伤抵挡、震退贴脸杂兵(首领免疫震退)、获 0.25s 短无敌、攒影魄、进入 7s 冷却
  p2.hp = p2.maxHp; p2.invincible = 0; p2.evasionFlash = 0; c2.soulPoints = 0; c2.soulDefendIcd = 0
  const mob = spawn(g, { x: 40, y: 0, hp: 100 })
  const boss = spawnBoss(g, 300, 'boss-knight'); boss.x = p2.x - 45; boss.y = p2.y
  const bossX = boss.x, mobX = mob.x
  const blocked = random(0.99, () => p2.hit(1, { enemyAttack: true }))
  assert.equal(blocked, false)
  assert.equal(p2.hp, p2.maxHp)
  assert.equal(c2.guardCharges, 0)
  near(c2.guardCd, 7.0)
  assert.equal(c2.hud().guard.ready, false)
  near(p2.invincible, 0.25)
  assert.ok(mob.x > mobX + 20, `nearby mob pushed back: ${mobX} -> ${mob.x}`)
  near(boss.x, bossX, 'boss immune to guard pushback')
  assert.equal(c2.soulPoints, 3)
  assert.equal(g.weaponSystem.stats.shadowGuardBlocks, 1)

  // 4) 进攻缩冷：三连击影波 / 主动影袭命中各缩减 1.2s 冷却，剩余时间自然回满
  c2.soulDefendIcd = 0
  const mob2 = spawn(g, { x: 60, hp: 5000 })
  const mobFar = spawn(g, { x: 175, hp: 5000 })
  p2.facing = 0
  for (let s = 0; s < 3; s++) {
    c2.stab(mob2)
    step(g, 0.2)
  }
  // 3 刀经历 0.6s 自然衰减 + 第 3 刀 1.2s 缩冷 => 7.0 - 0.6 - 1.2 = 5.2s 左右
  assert.ok(c2.guardCd > 5.0 && c2.guardCd < 5.35, `3rd combo should refund 1.2s guardCd: cd=${c2.guardCd}`)
  p2.strainSkillCd = 0; p2.invincible = 0
  const cdBeforeDash = c2.guardCd
  pressSpace(g)
  for (let i = 0; i < 16; i++) { p2.update(1 / 60); c2.update(1 / 60) }
  assert.ok(c2.guardCd < cdBeforeDash - 1.2, `assault hit should refund 1.2s guardCd: before=${cdBeforeDash}, after=${c2.guardCd}`)
  assert.ok(mobFar.active)

  // 剩余冷却随 update(dt) 走完后重新获得 1 层物理格挡，可减免 Boss 3 伤物理攻击至 2 伤
  step(g, c2.guardCd + 0.05)
  assert.equal(c2.guardCharges, 1); near(c2.guardCd, 0)
  p2.hp = p2.maxHp; p2.invincible = 0; p2.evasionFlash = 0
  random(0.99, () => p2.hit(3, { enemyAttack: true, isBoss: true }))
  assert.equal(p2.hp, p2.maxHp - 2)
  assert.equal(c2.guardCharges, 0)

  // 切换非暗影角色清除移速与格挡；远征换章刷新格挡为就绪
  g.configureRun({ mode: 'expedition', difficulty: 'normal' })
  g._enterExpeditionStage(2)
  assert.equal(c2.guardCharges, 1); near(c2.guardCd, 0)
  g.applyStartingStrain('origin'); g.reset()
  assert.equal(p2.speed, 340)
  assert.equal(c2.guardCharges, 0)
})

check('四大联动割草：猎杀爆散传染、三连影波分身共鸣与路线染色、满血影魄环斩与残影爆裂、横斩多暴缩冷', g => {
  const c = g.weaponSystem.shadowCombat, p = g.player, ws = g.weaponSystem

  // 1) 猎杀路线：击杀印记目标触发爆散影斩并自动传染给附近可见目标（最多连锁 3 次，且第 3 刀命中刷新印记时长）
  c.route = 'hunt'
  learnRoute(g, 'shadow_hunt_mark')
  c.huntPursuitLevel = 2
  const m1 = spawn(g, { x: 60, hp: 1 })
  const packDie = spawn(g, { x: 100, hp: 0.5 }) // 40px 内被爆散清场
  const packMob = spawn(g, { x: 140, hp: 500 }) // 80px 内吃爆散 AOE 并接过传染印记
  const chainMob = spawn(g, { x: 250, hp: 500 }) // 第 2 次击杀传染对象
  c.markHuntTarget(m1)
  assert.equal(c.huntChainLeft, 3)
  c.hit(m1, 2, { guaranteed: true })
  assert.equal(m1.active, false)
  assert.equal(packDie.active, false, '印记死亡爆散应直接击杀周围残血杂兵')
  assert.ok(packMob.hp < 500, '印记死亡爆散应伤及周围 135px 杂兵')
  assert.equal(chainMob.hp, 500)
  assert.equal(c.huntTarget, packMob, '印记应自动传染至最近存活邻近敌人')
  assert.equal(c.huntChainLeft, 2)
  assert.ok(c.cleaves.some(cut => cut.hunt))

  // 再击杀 2 次验证连锁上限封顶在 3 次不会无限跳传（3 -> 2 -> 1 -> 0 后再杀 1 次不再继续传染）
  const m2 = spawn(g, { x: 260, hp: 500 }), survivor = spawn(g, { x: 290, hp: 500 })
  packMob.hp = 1
  c.hit(packMob, 2, { guaranteed: true })
  assert.equal(c.huntTarget, chainMob); assert.equal(c.huntChainLeft, 1)
  chainMob.hp = 1; c.hit(chainMob, 2, { guaranteed: true })
  assert.equal(c.huntTarget, m2); assert.equal(c.huntChainLeft, 0)
  m2.hp = 1; c.hit(m2, 2, { guaranteed: true })
  assert.equal(c.huntTarget, null, '连锁 3 跳用尽后停止传染，防无限滚雪球')
  assert.ok(survivor.active && survivor.hp < 500, '末跳爆散仍正常伤及旁敌但不再挂新印记')

  // 2) 第 3 刀穿透影波联动：缩短普通分身冷却；群影路线全分身同步共鸣劈斩；刃潮切碎远距法球；猎杀波及刷新印记
  g.reset()
  const c2 = g.weaponSystem.shadowCombat, p2 = g.player
  const melee = spawn(g, { x: 60, hp: 5000 })
  const clone = summon(g, melee)
  clone.x = p2.x + 100; clone.y = p2.y + 80; clone.cooldown = 0.6
  const swarmFoe = spawn(g, { x: 145, y: 80, hp: 500 })
  clone.target = swarmFoe
  c2.stabCombo = 2 // 下一刀即第 3 刀
  c2.stab(melee); c2.update(c2.swing.windup + c2.swing.strike + 0.001)
  assert.ok(clone.cooldown < 0.15, `三连影波立即大幅缩短分身冷却: cd=${clone.cooldown}`)

  c2.route = 'swarm'; c2.stabCombo = 2
  clone.cooldown = 0.6; clone.rush = null
  c2.stab(melee); step(g, 0.2)
  assert.ok(swarmFoe.hp < 500, '群影路线下第 3 刀影波同步唤起分身劈出共鸣影刃')
  assert.ok(c2.cleaves.some(cut => cut.swarm))

  c2.route = 'blade'; c2.bladeRendLevel = 2
  c2.shield.charges = 0; c2.shield.recharge = 0
  g.enemyManager.spawnBullet(p2.x + 150, p2.y, Math.PI, 'mage', { speed: 0 })
  const farOrb = g.enemyManager._bullets.at(-1)
  c2.stabCombo = 2; c2.bladeParryIcd = 10 // 屏蔽普攻破箭，单独验证第 3 刀影波的噬法切球
  c2.stab(melee); step(g, 0.2)
  assert.equal(farOrb.active, false, '刃潮路线第 3 刀影波命中噬法切碎 150px 远距法球')
  assert.ok(c2.shield.recharge > 0.4, '切碎法球应加速魔盾充能')

  c2.route = 'hunt'; learnRoute(g, 'shadow_hunt_mark')
  const huntDummy = spawn(g, { x: 155, hp: 500 })
  c2.markHuntTarget(huntDummy); c2.huntMarkTimer = 1.0; c2.stabCombo = 2
  c2.stab(melee); step(g, 0.2)
  assert.ok(c2.huntMarkTimer > 2.0, `第 3 刀影波波及猎杀目标应延长印记时长: ${c2.huntMarkTimer}`)

  // 3) 满血满盾「影魄涌动」爆发 360° 环斩与 25% 攻速，且击杀生成的刺杀残影触敌/到期爆碎斩
  g.reset()
  const c3 = g.weaponSystem.shadowCombat, p3 = g.player, ws3 = g.weaponSystem
  p3.hp = p3.maxHp; c3.shield.charges = c3.shield.capacity
  const baseInterval = ws3.attackInterval
  const novaMobP = spawn(g, { x: 95, y: 0, hp: 500 })
  const clone3 = summon(g, novaMobP)
  clone3.x = p3.x + 280; clone3.y = p3.y
  const novaMobC = spawn(g, { x: 340, y: 0, hp: 500 }) // 在分身 60px 内，超出本体 120px 范围
  c3.gainSoul(16)
  assert.ok(p3.shadowSoulSurgeTimer > 2.4)
  assert.ok(ws3.attackInterval < baseInterval * 0.82, '影魄涌动期间本体挥刀攻速应加快 25%')
  assert.ok(novaMobP.hp < 500, '影魄环斩应伤害本体周身 120px 内敌人')
  assert.ok(novaMobC.hp < 500, '影魄环斩应带动全分身周身 85px 同步环斩')
  assert.ok(c3.cleaves.some(cut => cut.nova))

  // 刺杀残影触发碎斩（触敌或到期不递归再留残影）
  const prey = spawn(g, { x: 55, y: 0, hp: 0.5 })
  c3.stab(prey); step(g, 0.2)
  assert.equal(p3._decoys.length, 1)
  const bystander = spawn(g, { x: 105, y: 0, hp: 500 })
  bystander.x = p3._decoys[0].x + 12; bystander.y = p3._decoys[0].y
  p3.update(0.25)
  assert.equal(p3._decoys.length, 0, '残影蓄能后被贴近敌人引爆并消散')
  assert.ok(bystander.hp < 500, '刺杀残影爆裂应伤害邻近敌人')
  assert.ok(c3.cleaves.some(cut => cut.echo))

  // 4) 裂影横斩多目标暴击缩冷（普通 -0.2s／刃潮 -0.3s）
  learn(g, 'ass_cleave', 2)
  ws3.critChance = 1
  const cleaveOrigin = spawn(g, { x: 60, hp: 500 })
  c3.cleaveCooldown = 0
  c3.cleave(cleaveOrigin, 0)
  near(c3.cleaveCooldown, 0.65)
  c3.cleave(cleaveOrigin, 0)
  near(c3.cleaveCooldown, 0.45)
  c3.route = 'blade'
  c3.cleave(cleaveOrigin, 0)
  near(c3.cleaveCooldown, 0.15)
  c3.cleave(cleaveOrigin, 0)
  near(c3.cleaveCooldown, 0)
  c3.cleave(cleaveOrigin, 0)
  near(c3.cleaveCooldown, 0.65)
})

console.log(`暗影闪避与分身：${count} 组通过`)
