import assert from 'node:assert/strict'
import { createArena, spawn, spawnBoss, learn, pressSpace, dispose, rollSkills, SKILL_DATABASE, ctx2d } from './test-support/arena-fixture.mjs'
import { BOSS_SKILL_DATABASE, resolveShadowSkill } from './src/game/SkillPool.js'
import { ExpeditionBoss } from './src/game/entities/ExpeditionBoss.js'
import { shadowLineClear } from './src/game/ShadowGeometry.js'

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
const book = id => BOSS_SKILL_DATABASE.assassin.find(s => s.id === id)

check('开局属性与四项分身成长独立', g => {
  near(g.player.evasionChance, 0.15)
  const c = g.weaponSystem.shadowCombat.clones
  near(c.chance, 0.6); near(c.power, 0.4); assert.equal(c.cap, 2); assert.equal(c.duration, 4)
  learn(g, 'ass_echo'); near(c.chance, 0.7); near(c.power, 0.4)
  learn(g, 'ass_execute'); near(c.power, 0.55); assert.equal(c.duration, 4)
  learn(g, 'ass_decoy'); near(c.duration, 5.5); assert.equal(c.cap, 2)
  learn(g, 'ass_legion', 2); assert.equal(c.cap, 4)
  learn(g, 'ass_stride', 3); near(g.player.evasionChance, 0.3)
  book('boss_assassin_voidstep').apply(g); near(g.player.evasionChance, 0.4)
  g.player.shadowEvasionBonus = 1; near(g.player.evasionChance, 0.4)
})
check('被动闪避边界、一次攻击去重、短暂虚化与无受击奖励', g => {
  const p = g.player, hp = p.hp, attack = { enemyAttack: true }
  p.adrenalineSpeed = 0.6
  random(0.149, () => assert.equal(p.hit(2, attack), false))
  assert.equal(p.hp, hp); assert.equal(p.invincible, 0); assert.equal(p.adrenalineTimer, 0)
  random(() => { throw Error('same event rerolled') }, () => p.hit(2, attack))
  random(() => { throw Error('grace must not roll') }, () => p.hit(2, { enemyAttack: true }))
  near(p.evasionFlash, 0.2)
  p.update(0.21)
  random(0.15, () => assert.equal(p.hit(1, { enemyAttack: true }), true))
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
check('召唤概率缓升至 90%，边界失败且同一动作不补掷', g => {
  const c = g.weaponSystem.shadowCombat.clones, e = spawn(g), action = {}
  random(0.6, () => assert.equal(c.onCritical(e, action), false))
  c.procCooldown = 0
  random(0, () => assert.equal(c.onCritical(e, action), false))
  random(0.599, () => assert.equal(c.onCritical(e, {}), true))
  learn(g, 'ass_echo'); near(c.chance, 0.7)
  learn(g, 'ass_echo'); near(c.chance, 0.8)
  learn(g, 'ass_echo'); near(c.chance, 0.9); c.procCooldown = 0
  random(0.9, () => assert.equal(c.onCritical(e, {}), false))
  c.procCooldown = 0
  random(0.899999, () => assert.equal(c.onCritical(e, {}), true))
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
check('分身真实伤害随强度成长；不复制暴伤、不消费本体必暴', g => {
  const e = spawn(g), combat = g.weaponSystem.shadowCombat, clone = summon(g, e)
  Object.assign(clone, { x: e.x - 50, y: e.y, angle: 0 })
  g.weaponSystem.critMul = 50; g.weaponSystem.executeCrit = true; g.player.guaranteedCrit = true
  combat.clones.hit(clone, e, combat.clones.power)
  near(e.hp, 99.6); assert.equal(g.player.guaranteedCrit, true)
  learn(g, 'ass_execute', 3)
  combat.clones.hit(clone, e, combat.clones.power)
  near(e.hp, 98.75); assert.equal(combat.clones.items.length, 1)
})
check('时间升级不延长现存分身；到期销毁', g => {
  const clone = summon(g)
  learn(g, 'ass_decoy', 2); assert.equal(clone.life, 4)
  step(g, 4.1); assert.equal(g.weaponSystem.shadowCombat.clones.items.length, 0)
  assert.equal(summon(g).life, 7)
})
check('F 快照只指挥已有分身，新分身不参与本次夹击', g => {
  const e = spawn(g, { x: 100, hp: 1000 }), c = g.weaponSystem.shadowCombat
  const old = summon(g, e); old.x = g.player.x; old.y = g.player.y - 90
  c.clones.procCooldown = 0; learn(g, 'ass_echo', 2)
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
  learn(g, 'ass_legion', 2); learn(g, 'ass_capstone')
  const e = spawn(g, { x: 70 }), c = g.weaponSystem.shadowCombat.clones
  const clone = summon(g, e); clone.x = g.player.x; clone.y = g.player.y; clone.angle = 0
  const second = spawn(g, { x: 95 })
  c.sweep(clone, clone.x, clone.y, clone.x + 110, clone.y, c.power, 3)
  near(e.hp, 99.6); near(second.hp, 99.8)
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
    if (reverse) book('boss_assassin_mark').apply(g)
    learn(g, 'ass_lethal', 2); g.player.level = 5; g._ensureRoleAwakening()
    if (!reverse) book('boss_assassin_mark').apply(g)
    return [g.weaponSystem.critChance, g.weaponSystem.critMul]
  }
  assert.deepEqual(snapshot(false), snapshot(true)); near(snapshot(true)[0], 0.59)
  g.applyStartingStrain('origin'); g.reset(); g.primarySpec = 'assassin'; g._applyPrimarySpecBonus('assassin')
  const before = g.weaponSystem.critMul; learn(g, 'ass_execute')
  assert.ok(g.weaponSystem.critMul > before)
})
check('角色技能显示真实效果，原生黏液不抽到分身技能', g => {
  let cards = rollSkills(g, 99)
  assert.ok(cards.some(s => s.id === 'ass_echo'))
  assert.equal(cards.find(s => s.id === 'ass_stride').name, '虚化身躯')
  assert.equal(resolveShadowSkill(book('boss_assassin_voidstep'), g).stats.includes('闪避率'), true)
  g.applyStartingStrain('origin'); g.reset(); cards = rollSkills(g, 99)
  assert.ok(!cards.some(s => ['ass_echo', 'ass_legion', 'ass_afterimage'].includes(s.id)))
  assert.equal(cards.find(s => s.id === 'ass_stride').name, '暗影疾行')
})
check('分身路线选项保底与终极优先同时满足', g => {
  learn(g, 'ass_echo'); g.player.level = 14; g.enemyManager.wave = 10; g._ensureRoleAwakening()
  learn(g, 'ass_execute'); learn(g, 'ass_legion')
  for (let i = 0; i < 30; i++) {
    const cards = rollSkills(g)
    assert.equal(cards[0].id, 'ass_capstone')
  }
  learn(g, 'ass_capstone')
  for (let i = 0; i < 30; i++) assert.ok(rollSkills(g).some(s => ['ass_echo', 'ass_afterimage', 'ass_execute', 'ass_decoy', 'ass_legion'].includes(s.id)))
})
check('未升级影袭留身时空放与被动闪避均不生成分身；重开及换场景清理', g => {
  pressSpace(g); g.player.update(0.27)
  assert.equal(g.weaponSystem.shadowCombat.clones.items.length, 0)
  g.player.invincible = 0
  random(0, () => g.player.hit(1, { enemyAttack: true }))
  assert.equal(g.weaponSystem.shadowCombat.clones.items.length, 0)
  summon(g); g.pause(); const clone = g.weaponSystem.shadowCombat.clones.items[0], life = clone.life
  g._tick(300); assert.equal(clone.life, life)
  g.reset(); assert.equal(g.weaponSystem.shadowCombat.clones.items.length, 0); assert.equal(g.player.evasionCount, 0)
  summon(g); g.configureRun({ mode: 'expedition', difficulty: 'normal' }); g._enterExpeditionStage(2)
  assert.equal(g.weaponSystem.shadowCombat.clones.items.length, 0)
})
check('随机频率符合配置：10,000 次有效攻击/召唤事件', g => {
  let seed = 101, dodges = 0, summons = 0
  const rng = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
  const e = spawn(g), c = g.weaponSystem.shadowCombat.clones
  random(rng, () => {
    for (let i = 0; i < 10000; i++) {
      g.player.hp = 100; g.player.invincible = 0; g.player.evasionFlash = 0
      if (!g.player.hit(1, { enemyAttack: true })) dodges++
      c.procCooldown = 0
      if (c.onCritical(e, {})) summons++
    }
  })
  assert.ok(dodges > 1350 && dodges < 1650, String(dodges))
  assert.ok(summons > 5750 && summons < 6250, String(summons))
})
check('远程优先选可见分身，近战和 Boss 保持本体目标', g => {
  const c = summon(g), mage = spawn(g, { type: 'mage', x: 220 })
  assert.equal(g.player.getEnemyTarget(mage), c)
  assert.equal(g.player.getEnemyTarget(spawn(g)), g.player)
  assert.equal(g.player.getEnemyTarget(spawnBoss(g)), g.player)
  c.life = 0
  assert.equal(g.player.getEnemyTarget(mage), g.player)
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
check('高速弹幕先撞分身则挡弹，每发只扣半秒且不消耗攻击冷却', g => {
  const c = summon(g), p = g.player
  c.x = p.x - 80; c.y = p.y; c.cooldown = 0.4
  const life = c.life
  g.enemyManager.spawnBullet(p.x - 160, p.y, 0, 'archer', { speed: 2000 })
  random(() => { throw Error('blocked shot must not roll dodge') }, () => g.enemyManager._updateBullets(0.1))
  near(c.life, life - 0.5); near(c.cooldown, 0.4)
  assert.equal(p.hp, p.maxHp); assert.equal(g.weaponSystem.stats.shadowBlocks, 1)
  assert.equal(g.enemyManager._bullets.length, 0)
})
check('本体在前时不能让身后分身隔空挡弹', g => {
  const c = summon(g), p = g.player, life = c.life
  c.x = p.x + 80; c.y = p.y
  g.enemyManager.spawnBullet(p.x - 100, p.y, 0, 'archer', { speed: 2000 })
  random(0.99, () => g.enemyManager._updateBullets(0.1))
  assert.equal(p.hp, p.maxHp - 1); near(c.life, life)
})
check('密集弹幕耗尽分身后不再挡弹，剩余弹幕抵达本体', g => {
  const c = summon(g), p = g.player
  c.x = p.x - 80; c.y = p.y; c.life = 1
  for (let i = 0; i < 20; i++) g.enemyManager.spawnBullet(p.x - 160, p.y, 0, 'mage', { speed: 2000 })
  random(0.99, () => g.enemyManager._updateBullets(0.1))
  assert.equal(c.life, 0); assert.equal(g.weaponSystem.stats.shadowBlocks, 2)
  assert.equal(p.hp, p.maxHp - 1); assert.equal(g.enemyManager._bullets.length, 0)
})
check('同路径两个分身只消耗最先接触者', g => {
  const a = summon(g), b = summon(g), p = g.player
  a.x = p.x - 80; a.y = p.y; b.x = p.x - 140; b.y = p.y
  const life = a.life
  g.enemyManager.spawnBullet(p.x - 220, p.y, 0, 'archer', { speed: 2400 })
  g.enemyManager._updateBullets(0.1)
  near(a.life, life); near(b.life, life - 0.5)
})
check('Boss 弹幕穿过分身且仍命中本体', g => {
  const c = summon(g), p = g.player, life = c.life
  c.x = p.x - 80; c.y = p.y
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
check('影袭留身 T1 无前置且单级，空放 F 起点生影，不消耗暴击判定', g => {
  const card = rollSkills(g, 99).find(s => s.id === 'ass_afterimage')
  assert.ok(card); assert.equal(card.maxLevel, 1)
  learn(g, 'ass_afterimage')
  assert.ok(!rollSkills(g, 99).some(s => s.id === 'ass_afterimage'))
  const p = g.player, c = g.weaponSystem.shadowCombat, x = p.x, y = p.y
  c.clones.procCooldown = 0.3
  random(() => { throw Error('F spawn rolled chance') }, () => pressSpace(g))
  assert.equal(c.clones.items.length, 1)
  const clone = c.clones.items[0]
  near(clone.x, x); near(clone.y, y); near(c.clones.procCooldown, 0.3)
  assert.ok(!c.assault.cloneIds.has(clone.id))
  p.update(0.26)
  assert.ok(Math.hypot(p.x - x, p.y - y) > 100)
  near(clone.x, x); near(clone.y, y)
  pressSpace(g); assert.equal(c.clones.items.length, 1)
})
check('未学天赋及受阻施放不生成，重开清除天赋', g => {
  const c = g.weaponSystem.shadowCombat
  pressSpace(g); assert.equal(c.clones.items.length, 0)
  g.reset(); learn(g, 'ass_afterimage')
  g.mapFeatures.resolvePlayerMovement = (probe, x, y) => { probe.x = x; probe.y = y; return true }
  assert.equal(c.useAssault(), false); assert.equal(c.clones.items.length, 0)
  g.reset(); assert.equal(g.player.shadowAssaultClone, false)
})
check('满额留身刷新并移回最短寿命者，保留冷却、不加入当次夹击', g => {
  const c = g.weaponSystem.shadowCombat, e = spawn(g, { x: 100, hp: 1000 })
  const first = summon(g, e), second = summon(g, e)
  first.life = 1; first.cooldown = 0.42; second.life = 2
  learn(g, 'ass_afterimage'); learn(g, 'ass_decoy', 2)
  g.player.facing = 0; pressSpace(g)
  assert.equal(c.clones.items.length, 2)
  near(first.x, g.player.x); near(first.y, g.player.y)
  near(first.life, 7); near(first.cooldown, 0.42); near(second.life, 2)
  assert.ok(!c.assault.cloneIds.has(first.id)); assert.ok(c.assault.cloneIds.has(second.id))
  random(0, () => g.player.update(0.26))
  assert.equal(first.rush, null); assert.ok(second.rush)
})
check('F 留身继承成长可挡弹，命中暴击仍可额外生影', g => {
  const c = g.weaponSystem.shadowCombat, p = g.player
  learn(g, 'ass_afterimage'); learn(g, 'ass_decoy', 2); learn(g, 'ass_execute', 3)
  spawn(g, { x: 100, hp: 1000 }); p.facing = 0
  pressSpace(g); const clone = c.clones.items[0]
  near(clone.life, 7); near(c.clones.power, 0.85)
  random(0, () => p.update(0.26))
  assert.equal(c.clones.items.length, 2)
  assert.ok(c.clones.items.every(item => !item.rush))
  const hp = p.hp
  g.enemyManager.spawnBullet(clone.x - 80, clone.y, 0, 'mage', { speed: 800 })
  g.enemyManager._updateBullets(0.1)
  near(clone.life, 6.5); assert.equal(p.hp, hp)
})
console.log(`暗影闪避与分身：${count} 组通过`)
