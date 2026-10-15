import assert from 'node:assert/strict'
import { createArena, spawn, spawnBoss, dispose, pressSpace, ctx2d } from './test-support/arena-fixture.mjs'
import { SPELL_ELEMENT_IDS, SPELL_FUSIONS, ELEMENTAL_SKILLS } from './src/game/SpellRules.js'
import { rollSkills } from './src/game/SkillPool.js'
import { iceFanAngle, iceShardDamageMul, iceBrittleMul } from './src/game/IceSpellRules.js'
import { fireBrittleMul } from './src/game/FireSpellRules.js'
import { applyGenes } from './src/game/GenePool.js'
import { BASE_SPELL_PALETTES, FUSION_SPELL_PALETTES } from './src/game/SpellPalette.js'

let checks = 0
function check(name, test, element = 'fire') {
  const g = createArena('elemental')
  g.startingElement = element; g.reset(); g.running = true; g.input.suspended = false; g.runState = 'active'
  g.weaponSystem.critChance = 0; g.enemyManager._enemies.length = 0; g.enemyManager._spawnTimer = Infinity
  g.mapFeatures.resolvePlayerMovement = () => false; g.mapFeatures.barricades = []
  const s = g.weaponSystem.spellCombat
  try { test(g, s); console.log(`✓ ${++checks}. ${name}`) } finally { dispose(g) }
}
const hold = s => { for (const id of s.elements) s.clocks[id] = 100 }
const fuse = (s, id) => assert.equal(s.applyCore(s.coreOptions().find(o => o.element === id)), true)
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≈ ${b}`)
const learnSpell = (g, id) => { const skill = ELEMENTAL_SKILLS.find(s => s.id === id); assert.ok(skill); g.applySkill(skill) }

for (const element of SPELL_ELEMENT_IDS) check(`${element}: 开局法术、等待目标、独立计时与零旧飞弹`, (g, s) => {
  assert.deepEqual([...s.elements], [element]); assert.equal(g.player.elements.size, 1)
  s.update(1); assert.equal(s.stats.casts, 0); assert.equal(s.clocks[element], 0)
  spawn(g, { hp: 1000 }); s.update(.01); assert.equal(s.stats.casts, 1)
  assert.equal(g.weaponSystem._projectiles.length, 0)
  const cd = s.clocks[element], second = SPELL_ELEMENT_IDS.find(id => id !== element)
  fuse(s, second); near(s.clocks[element], cd)
  hold(s); s.render(ctx2d); assert.equal(s.elements.size, 2)
}, element)

check('火球基础爆炸不带燃烧，升级燃烧与融合裂焰分别生效', (g, s) => {
  const a = spawn(g, { x: 80 }), b = spawn(g, { x: 108 }), far = spawn(g, { x: 300 })
  hold(s); s.cast('fire', a); s.update(.2)
  assert.ok(a.hp < 100 && b.hp < 100); assert.equal(far.hp, 100); assert.equal(a.burnHits, 0)
  learnSpell(g, 'spell_fire_burn'); s.damage(a, .1, 'fire'); assert.ok(a.burnHits > 0)
  fuse(s, 'poison'); s.applyCore(s.coreOptions()[0]); assert.equal(s.applyCore(s.coreOptions().find(o => o.id === 'shape_fire')), true); hold(s)
  a.destroy(); b.destroy()
  const before = far.hp; const nearby = spawn(g, { x: 220 }); s.cast('fire', nearby); s.update(.6)
  assert.ok(far.hp < before, '裂焰击中爆炸附近目标')
})
check('冰箭基础两目标穿透，减速与冻结逐步解锁且有再次冻结间隔', (g, s) => {
  const a = spawn(g, { x: 60 }), b = spawn(g, { x: 120 }), c = spawn(g, { x: 180 })
  hold(s); s.cast('water', c); s.update(.3)
  assert.ok([a, b].every(e => e.hp < 100)); assert.equal(c.hp, 100); assert.equal(a.spellSlowTime, 0); assert.equal(a.freeze, 0)
  learnSpell(g, 'spell_ice_slow'); learnSpell(g, 'spell_ice_freeze'); s.mark(a).frost = 1
  s.damage(a, .1, 'water'); s.damage(a, .1, 'water'); assert.equal(a.freeze, .8)
  a.freeze = 0; for (let i = 0; i < 8; i++) s.damage(a, .1, 'water')
  assert.equal(a.freeze, 0)
}, 'water')
check('闪电链瞬时伤害、有界跳跃、不重复击中，单体首领仍有首击', (g, s) => {
  const enemies = [spawn(g, { x: 60 }), spawn(g, { x: 140 }), spawn(g, { x: 220 }), spawn(g, { x: 300 })]
  s.cast('lightning', enemies[0]); assert.equal(enemies[0].hp, 100); s.update(.13); assert.ok(enemies.slice(0, 2).every(e => e.hp < 100)); assert.equal(enemies[2].hp, 100)
  assert.equal(enemies[0].elementStun, 0); assert.equal(enemies[0].freeze, 0)
  learnSpell(g, 'spell_lightning_stun'); s.damage(enemies[0], .1, 'lightning'); assert.equal(enemies[0].elementStun, .15)
  g.enemyManager._enemies.length = 0; const boss = spawnBoss(g, 1000), hp = boss.hp
  s.cast('lightning', boss); hold(s); s.update(.13); assert.ok(boss.hp < hp); assert.equal(boss.elementStun, 0); assert.equal(boss.freeze, 0)
}, 'lightning')
check('毒雾持续伤害、范围边界、数量上限及寿命回收', (g, s) => {
  const inside = spawn(g, { x: 70 }), outside = spawn(g, { x: 270 })
  hold(s); s.cast('poison', inside); s.update(.01); const hp = inside.hp
  s.update(.5); assert.ok(inside.hp < hp); assert.equal(outside.hp, 100)
  for (let i = 0; i < 10; i++) s.field(inside)
  assert.equal(s.fields.length, 5)
  for (let i = 0; i < 90; i++) s.update(.05)
  assert.equal(s.fields.length, 0)
}, 'poison')

for (const f of SPELL_FUSIONS) check(`${f.name}: 自动反应、空格独立成立、首领抗控制及高阶进化`, (g, s) => {
  fuse(s, f.combo[1]); hold(s); assert.equal(s.fusion.id, f.id)
  const e = spawn(g, { hp: 10000, x: 100 })
  if (f.combo.includes('poison')) s.field(e)
  if (f.combo.includes('water')) s.damage(e, .1, 'water')
  if (f.id === 'burst') s.damage(e, .1, 'fire')
  const trigger = f.id === 'corrode' ? 'poison' : f.id === 'steam' || f.id === 'acid' ? 'fire' : 'lightning'
  s.damage(e, 1, trigger); assert.ok(s.stats.reactions > 0)
  const before = s.stats.reactions
  s.damage(e, .1, trigger); assert.equal(s.stats.reactions, before, '反应不会递归或连续触发')
  s.fields.length = 0; s.marks.clear(); const hp = e.hp; pressSpace(g)
  assert.equal(s.stats.activeCasts, 1); assert.ok(e.hp < hp); assert.equal(g.strainSkill.name, f.active)
  for (let i = 0; i < 3; i++) assert.equal(s.applyCore(s.coreOptions().find(o => o.id === 'active')), true)
  assert.equal(g.strainSkill.name, f.evolved); assert.equal(s.elements.size, 2)
  g.player.strainSkillCd = 0; pressSpace(g)
  assert.ok(s.delayed.length > 0 || s.fields.some(field => field.rain || field.storm || field.icy))
  const boss = spawnBoss(g, 10000), position = { x: boss.x, y: boss.y }
  g.player.strainSkillCd = 0; pressSpace(g)
  assert.deepEqual({ x: boss.x, y: boss.y }, position); assert.equal(boss.freeze, 0); assert.equal(boss.elementStun, 0)
  s.render(ctx2d)
}, f.combo[0])

check('核心选择不可伪造、不会引入第三元素；强化耗尽有无尽兜底', (g, s) => {
  const options = s.coreOptions(); assert.equal(options.length, 3); assert.equal(new Set(options.map(o => o.id)).size, 3)
  assert.equal(s.applyCore({ id: 'invalid' }), false)
  fuse(s, 'poison'); assert.equal(s.applyCore(options.find(o => o.element === 'water')), false)
  for (const id of ['shape_fire', 'shape_poison', 'reaction', 'active']) for (let i = 0; i < 3; i++) {
    // Exact offered shape alternates; consume another available card until the requested branch appears.
    let option = s.coreOptions().find(o => o.id === id)
    if (!option) { s.cores++; option = s.coreOptions().find(o => o.id === id) }
    assert.ok(option); assert.equal(s.applyCore(option), true)
  }
  const fallback = s.coreOptions(); assert.equal(fallback.length, 3); assert.ok(fallback.every(o => o.kind === 'power'))
  const power = s.power; s.applyCore(fallback.find(o => o.id === 'power')); assert.ok(s.power > power)
})
check('单个 BOSS 奖励一次，普通怪与精英零属性核心，职业秘籍合并', (g, s) => {
  let reward
  g.onSpellCore = r => { reward = r }
  const elite = spawn(g, { hp: 1 }); elite.isElite = true
  s.damage(elite, 10, 'fire'); assert.ok(g.gemManager._gems.every(gem => gem.type === 'exp'))
  const boss = spawnBoss(g, 1)
  s.damage(boss, 10, 'fire'); g.weaponSystem._settleKill(boss)
  assert.equal(g._spellCoreQueue.length, 1); assert.ok(g.gemManager._gems.every(gem => gem.type === 'exp'))
  g._openPendingSpellCore(); assert.equal(reward.first, true); assert.equal(g._pauseLock, 1)
  assert.equal(g.resolveSpellCore('invalid'), false); assert.equal(g._pauseLock, 1)
  assert.equal(g.resolveSpellCore(reward.options[0].id), true)
  assert.equal(g._pauseLock, 0); assert.equal(s.cores, 1); assert.equal(s.elements.size, 2)
  assert.equal(g.queueSpellCore(boss), false)
})
check('首领编队全队结束才发一颗核心', (g, s) => {
  g.enemyManager.spawnBossGroup({ label: '测试双首领', types: ['boss-knight', 'boss-archer'], memberHpMul: 1 })
  const bosses = g.enemyManager._enemies.filter(e => e.isBoss)
  assert.equal(bosses.length, 2)
  s.damage(bosses[0], 1e6, 'lightning'); assert.equal(g._spellCoreQueue.length, 0)
  s.damage(bosses[1], 1e6, 'lightning'); assert.equal(g._spellCoreQueue.length, 1)
  assert.equal(g.queueSpellCore(bosses[0]), false)
})
check('升级与核心串行：恢复进入核心选择，暂停锁与溢出经验正确', (g, s) => {
  let reward, levels = 0
  g.onLevelUp = () => levels++; g.onSpellCore = info => { reward = info }
  g.openFreeSkillPanel(); assert.equal(g._pauseLock, 1)
  g.queueSpellCore({ x: 0, y: 0, name: '测试首领' }); assert.equal(g._openPendingSpellCore(), false)
  g.applySkill(ELEMENTAL_SKILLS[0]); assert.ok(reward); assert.equal(g._pauseLock, 1); assert.equal(levels, 1)
  g.resolveSpellCore(reward.options[0].id); assert.equal(g._pauseLock, 0); assert.equal(s.cores, 1)
})
check('远征核心先于补给，转场清理不会丢失奖励', (g, s) => {
  let reward, supplies = 0
  g.onSpellCore = info => { reward = info }; g.onExpeditionReward = () => supplies++
  g.configureRun({ mode: 'expedition', difficulty: 'normal' })
  g.runState = 'expedition-guardian'
  const boss = spawnBoss(g, 1); boss.isExpeditionStageBoss = true
  s.damage(boss, 10, 'fire'); assert.equal(g.runState, 'stage-clearing')
  g._updateRunState(.7); assert.ok(reward); assert.equal(supplies, 0)
  g.resolveSpellCore(reward.options[0].id); g._updateRunState(.7)
  assert.equal(supplies, 1); assert.equal(g.runState, 'stage-reward'); assert.equal(s.cores, 1)
})
check('终局与死亡结算优先，不弹无用途核心；DOT 击杀只结算一次', (g, s) => {
  let rewards = 0; g.onSpellCore = () => rewards++
  const dot = spawn(g, { hp: .1 }); dot.burnHits = 1; dot._burnDmg = 10; dot._burnTick = 0
  const count = g.weaponSystem.kills; dot._tickStatus(.01); g.weaponSystem.onDOTKill(dot)
  assert.equal(g.weaponSystem.kills, count + 1)
  g.runState = 'finale'; const boss = spawnBoss(g, 1); boss.isFinalBoss = true
  s.damage(boss, 10, 'fire'); assert.equal(g.runFinished, true); assert.equal(g._spellCoreQueue.length, 0)
  g._openPendingSpellCore(); assert.equal(rewards, 0); assert.equal(s.shots.length, 0)
})
check('普通升级无旧附魔与四系终极，已有基因有效且幂等，重开无强化残留', (g, s) => {
  for (let i = 0; i < 30; i++) assert.ok(rollSkills(g, 20).every(o => o.id !== 'ele_capstone' && o.id !== 'ele_resonance'))
  fuse(s, 'poison'); g.player.level = 5; g._ensureRoleAwakening()
  const choices = rollSkills(g, 30)
  assert.ok(choices.some(o => o.id === 'ele_overload')); assert.ok(choices.every(o => o.id !== 'ele_capstone'))
  const power = s.power, reaction = s.reactionPower
  const genes = { resonance: 3, split: 2, element_origin: 1 }
  g.genes = genes; applyGenes(g, genes); const grown = s.power, grownReaction = s.reactionPower
  assert.ok(grown > power); assert.ok(grownReaction > reaction)
  applyGenes(g, genes); near(s.power, grown); near(s.reactionPower, grownReaction)
  assert.deepEqual(g.player._procs, {}); assert.equal(g.player.secondarySlots, 0)
  s.applyCore(s.coreOptions()[0]); g.reset()
  assert.equal(s.cores, 0); assert.equal(s.elements.size, 1); assert.deepEqual(s.upgrades, {})
  assert.equal(g._spellCoreSeen.size, 0); assert.equal(s.marks.size, 0)
  g.applyStartingStrain('origin'); g.reset(); g.player.absorbElement('fire'); g.player.absorbElement('poison')
  assert.equal(g.player._primaryReaction, 'acid'); assert.ok(g.player._procs.burn); assert.ok(g.player.secondarySlots > 0)
})
check('暂停、无效空格、死亡清理与高密度区域/反应预算', (g, s) => {
  pressSpace(g); assert.equal(g.player.strainSkillCd, 0)
  const far = spawn(g, { x: 400 }); pressSpace(g); assert.equal(g.player.strainSkillCd, 0); far.destroy()
  fuse(s, 'poison'); hold(s)
  const targets = Array.from({ length: 120 }, (_, i) => spawn(g, { x: 100 + i % 12 * 4, y: Math.floor(i / 12) * 4, hp: 10000 }))
  for (let i = 0; i < 12; i++) s.field(targets[0])
  s.update(.01); assert.ok(s.fields.length <= 5); assert.ok(s.effects.length <= 100)
  const time = s.time, life = s.fields[0].life
  g.pause(); s.update(1); assert.equal(s.time, time); assert.equal(s.fields[0].life, life)
  g.resume(); s.explode(targets[0], 100, 1, '#fff', 'fire'); assert.ok(s.reactionBudget >= 0)
  s.render(ctx2d); g.player.dead = true; s.update(.1)
  assert.equal(s.fields.length, 0); assert.equal(s.shots.length, 0); assert.equal(s.delayed.length, 0); assert.equal(s.marks.size, 0)
})

check('新法术 DOT 按攻击比例结算，过期后重置；原有角色状态规则保留', (g, s) => {
  const e = spawn(g, { hp: 1000 })
  learnSpell(g, 'spell_fire_burn'); learnSpell(g, 'spell_poison_linger')
  s.damage(e, 1, 'fire'); near(e._burnDmg, .12)
  const hp = e.hp; e._burnTick = 0; e._tickStatus(.01); near(hp - e.hp, .12)
  e.burnHits = 0; s.damage(e, 2, 'fire'); near(e._burnDmg, .24)
  s.damage(e, .1, 'fire'); near(e._burnDmg, .24)
  s.damage(e, 1, 'poison'); near(e._poisonDmg, .15)
  e.poisonHits = 0; e._poisonDmg = 1; e.hit(0, { poison: 2, poisonDmg: .1 }); assert.equal(e._poisonDmg, 1)
})
check('主动留下的毒雾仍能被自动火球引燃，具有反应间隔', (g, s) => {
  fuse(s, 'poison'); const e = spawn(g, { hp: 10000 }), f = s.field(e, { active: true })
  s.damage(e, 1, 'fire'); assert.equal(s.stats.reactions, 1); assert.ok(f.igniteReady > s.time)
  s.damage(e, 1, 'fire'); assert.equal(s.stats.reactions, 1)
})
check('主动术被自爆反杀后不再制造领域、延迟攻击或追加伤害', (g, s) => {
  fuse(s, 'poison'); for (let i = 0; i < 3; i++) s.applyCore(s.coreOptions().find(o => o.id === 'active'))
  g.player.hp = 1
  s.shield.points = 0; s.shield.remaining = s.shield.cooldown
  const bomb = spawn(g, { hp: 1, x: 20 }); bomb.affix = 'explosive'; bomb.affixes = ['explosive']
  const untouched = spawn(g, { hp: 1000, x: 80 })
  pressSpace(g); assert.equal(g.runFinished, true); assert.equal(untouched.hp, 1000)
  assert.equal(s.fields.length, 0); assert.equal(s.delayed.length, 0)
})

for (const element of SPELL_ELEMENT_IDS) check(`${element}: 连续 20 秒实战计时、首领伤害与状态生命周期`, (g, s) => {
  const boss = spawnBoss(g, 10000), hp = boss.hp
  for (let i = 0; i < 400; i++) { s.update(.05); boss._tickStatus(.05) }
  assert.ok(hp - boss.hp >= 12, `${element} 首领持续输出有效：${hp - boss.hp}`)
  assert.equal(boss.freeze, 0); assert.equal(boss.elementStun, 0)
  assert.ok(s.effects.length <= 100 && s.fields.length <= 5 && s.shots.length <= 48)
}, element)

check('四系候选只匹配已掌握法术，单系保底两项；冰封要求先选减速', (g, s) => {
  for (const element of SPELL_ELEMENT_IDS) {
    s.start(element); g.skillLevels = {}; g.primarySpec = null; g.player.level = 2
    for (let i = 0; i < 40; i++) {
      const cards = rollSkills(g, 3)
      assert.ok(cards.filter(c => c.element === element).length >= 2)
      assert.ok(cards.every(c => !c.element || c.element === element))
      assert.ok(cards.every(c => c.id !== 'spell_ice_freeze'))
    }
  }
  learnSpell(g, 'spell_ice_slow')
  s.start('water'); assert.ok(rollSkills(g, 30).some(c => c.id === 'spell_ice_freeze'))
  g.skillLevels = {}; s.start('fire'); fuse(s, 'lightning')
  for (let i = 0; i < 40; i++) {
    const cards = rollSkills(g, 3)
    assert.ok(cards.some(c => c.element === 'fire')); assert.ok(cards.some(c => c.element === 'lightning'))
    assert.ok(cards.every(c => !c.element || ['fire', 'lightning'].includes(c.element)))
  }
  for (const skill of ELEMENTAL_SKILLS.filter(c => c.element === 'fire')) g.skillLevels[skill.id] = skill.maxLevel
  const fallback = rollSkills(g, 3); assert.equal(fallback.length, 3); assert.ok(fallback.every(c => c.element !== 'fire'))
})
check('火球变大、多弹分时、燃烧可选；融合不重置已学强化', (g, s) => {
  const target = spawn(g, { x: 300, hp: 10000 })
  s.cast('fire', target); const size = s.shots[0].size
  s.shots.length = 0; learnSpell(g, 'spell_fire_size'); learnSpell(g, 'spell_fire_count'); learnSpell(g, 'spell_fire_burn')
  s.cast('fire', target); assert.equal(s.shots.length, 2); assert.ok(s.shots[0].size > size)
  assert.equal(s.shots[0].delay, 0); assert.ok(s.shots[1].delay > 0)
  const cd = s.clocks.fire; fuse(s, 'lightning'); near(s.clocks.fire, cd)
  assert.equal(g.skillLevels.spell_fire_count, 1); assert.match(s.hud().elements.find(e => e.id === 'fire').enhancements, /火球×2.*燃烧/)
  hold(s); for (let i = 0; i < 25; i++) s.update(.05)
  assert.equal(s.stats.fireExplosions, 2); assert.ok(target.burnHits > 0)
})
check('多重火球对普通敌人分摊、对首领与精英聚火，追加弹仍按支数补偿', (g, s) => {
  hold(s); learnSpell(g, 'spell_fire_count')
  const target = spawn(g, { x: 200 }), other = spawn(g, { x: 260, y: 40 })
  s.cast('fire', target); assert.equal(s.shots.length, 2)
  assert.equal(s.shots[0].target, target); assert.equal(s.shots[1].target, other, '追加火球分摊到附近敌人')
  assert.ok(s.shots[1].power < s.shots[0].power * 1.001 && s.shots[0].power === s.shots[1].power, '同轮同倍率')
  s.shots.length = 0; other.isElite = true; s.cast('fire', target)
  assert.ok(s.shots.every(shot => shot.target === target), '精英在场时聚火')
  s.shots.length = 0; other.isElite = false
  const boss = spawnBoss(g, 1000); s.cast('fire', boss)
  assert.ok(s.shots.every(shot => shot.target === boss), '首领聚火')
  s.shots.length = 0; other.destroy(); s.cast('fire', target)
  assert.ok(s.shots.every(shot => shot.target === target), '没有其它目标时回落主目标')
}, 'fire')
check('炽燃提高对燃烧目标的火焰伤害，未燃烧目标与其它元素不受影响', (g, s) => {
  hold(s); learnSpell(g, 'spell_fire_burn'); learnSpell(g, 'spell_fire_brittle')
  const a = spawn(g, { x: 120, hp: 10000 }), b = spawn(g, { x: 200, hp: 10000 })
  s.damage(a, 10, 'fire'); s.damage(b, 10, 'fire')
  const first = 10000 - a.hp
  near(10000 - b.hp, first); assert.ok(a.burnHits > 0)
  s.damage(a, 10, 'fire'); near((10000 - a.hp) - first, first * fireBrittleMul(1), '燃烧目标承受更多火焰伤害')
  const burningHp = b.hp; s.damage(b, 10, 'water'); near(burningHp - b.hp, first, '寒冰不受炽燃影响')
  const boss = spawnBoss(g, 2000); s.damage(boss, 10, 'fire'); const bossFirst = 2000 - boss.hp
  s.damage(boss, 10, 'fire'); assert.ok(2000 - boss.hp - bossFirst > bossFirst, '首领点燃后同样获得增伤')
}, 'fire')
check('余烬蔓延延迟点燃近邻、只传一代、继承每跳灼烧，且与毒素传染各自记账', (g, s) => {
  hold(s); learnSpell(g, 'spell_fire_burn'); learnSpell(g, 'spell_fire_spread')
  const a = spawn(g, { x: 80, hp: 10000 }), b = spawn(g, { x: 140, hp: 10000 }), c = spawn(g, { x: 210, hp: 10000 })
  s.damage(a, 10, 'fire')
  assert.ok(s.embers.infections.has(a)); assert.equal(b.burnHits, 0)
  let emberFx = false
  for (let i = 0; i < 16; i++) { s.update(.05); if (s.effects.some(fx => fx.kind === 'ember-spread')) emberFx = true }
  assert.ok(b.burnHits > 0, '延迟后点燃近邻'); assert.equal(c.burnHits, 0, '超出范围不点燃')
  assert.equal(s.stats.burnSpreads, 1); near(b._burnDmg, a._burnDmg * .7, '继承来源每跳灼烧的 70%')
  assert.ok(emberFx)
  s.update(1); assert.equal(c.burnHits, 0, '后代不再传播')
  learnSpell(g, 'spell_poison_contagion'); s.field(a); s.update(.05)
  assert.ok(s.contagion.infections.size > 0 && s.embers.infections.size > 0, '毒素与余烬各自记账')
}, 'fire')
check('火系新卡需先学余烬附着：未学燃烧时炽燃与余烬蔓延不进候选', (g, s) => {
  s.start('fire'); g.skillLevels = {}; g.primarySpec = null; g.player.level = 2
  const ids = () => rollSkills(g, 30).map(card => card.id)
  assert.ok(!ids().includes('spell_fire_brittle') && !ids().includes('spell_fire_spread'))
  learnSpell(g, 'spell_fire_burn')
  assert.ok(ids().includes('spell_fire_brittle') && ids().includes('spell_fire_spread'))
}, 'fire')
check('穿透、减速、雷链目标/距离和毒雾范围/持续/中毒升级改变实际行为', (g, s) => {
  s.start('water'); learnSpell(g, 'spell_ice_pierce'); learnSpell(g, 'spell_ice_slow')
  const a = spawn(g, { x: 50 }), b = spawn(g, { x: 110 }), c = spawn(g, { x: 170 })
  hold(s); s.cast('water', c); s.update(.3); assert.ok([a,b,c].every(e => e.hp < 100 && e.spellSlowTime > 0))
  assert.equal(a.spellSlowAmount, .4); learnSpell(g, 'spell_ice_slow'); s.damage(a, .1, 'water'); assert.equal(a.spellSlowAmount, .55)
  g.enemyManager._enemies.length = 0; s.start('lightning')
  const chainTargets = [spawn(g,{x:50}),spawn(g,{x:240}),spawn(g,{x:430})]
  s.cast('lightning',chainTargets[0]); hold(s); s.update(.13); assert.equal(chainTargets[1].hp,100)
  learnSpell(g,'spell_lightning_chain');learnSpell(g,'spell_lightning_reach')
  s.cast('lightning',chainTargets[0]); s.update(.13); assert.ok(chainTargets.every(e=>e.hp<100))
  s.start('poison'); const target=chainTargets[0], initial=s.field(target); const radius=initial.radius, life=initial.life
  s.damage(target, .1,'poison'); assert.equal(target.poisonHits,0)
  learnSpell(g,'spell_poison_area'); learnSpell(g,'spell_poison_duration'); learnSpell(g,'spell_poison_linger')
  const enhanced=s.field(target); assert.ok(enhanced.radius>radius && enhanced.life>life)
  s.damage(target,.1,'poison');assert.ok(target.poisonHits>0)
})

for (const f of SPELL_FUSIONS) for (const reverse of [false, true]) check(`${f.name} ${reverse ? '逆序' : '正序'}：两套法术持续输出、无状态升级也融合`, (g, s) => {
  const ids = reverse ? [...f.combo].reverse() : f.combo
  s.start(ids[0]); fuse(s,ids[1]); const boss=spawnBoss(g,10000)
  for(let i=0;i<300;i++){s.update(.05);boss._tickStatus(.05)}
  for(const id of ids) { assert.ok(s.stats.castsByElement[id]>3); assert.ok(s.stats.damageByElement[id]>0) }
  assert.ok(s.stats.reactions>0); assert.equal(s.elements.size,2)
  assert.equal(g.skillLevels.spell_fire_burn || 0,0);assert.equal(g.skillLevels.spell_ice_freeze || 0,0)
}, (reverse ? [...f.combo].reverse() : f.combo)[0])

check('闪电抢先击杀时火球仍在原目标位置爆炸；弱怪索敌避免覆盖已发火球', (g, s) => {
  fuse(s,'lightning');hold(s)
  const e=spawn(g,{x:300,hp:1});s.cast('fire',e)
  assert.equal(s.target('lightning'),null,'不抢已被火球覆盖的弱怪')
  s.chain(e,10);assert.equal(e.active,false)
  for(let i=0;i<25;i++)s.update(.05)
  assert.equal(s.shots.length,0);assert.equal(s.stats.fireExplosions,1)
  const second=spawn(g,{x:340,hp:1}), third=spawn(g,{x:400,hp:1})
  s.cast('fire',second);assert.equal(s.target('lightning'),third)
})
check('雷火主动先展示火焰爆发再空中落雷，两种效果与真实伤害可辨', (g,s)=>{
  fuse(s,'lightning');hold(s);const e=spawn(g,{hp:10000,x:100})
  s.useActive();assert.ok(s.effects.some(f=>f.kind==='burst'&&f.color===s.palette('fire').main))
  assert.ok(!s.effects.some(f=>f.kind==='bolt'));const hp=e.hp
  s.update(.2);assert.ok(s.effects.some(f=>f.kind==='sky-bolt'));assert.ok(e.hp<hp)
  s.render(ctx2d)
})

check('雷核蓄亮后本体释放首段电弧，后续雷链从敌人之间传导', (g,s)=>{
  hold(s);const a=spawn(g,{x:120,hp:1000}),b=spawn(g,{x:230,hp:1000})
  s.cast('lightning',a);assert.equal(s.lightning.charge,.12);assert.equal(a.hp,1000)
  s.render(ctx2d);s.update(.05);assert.equal(a.hp,1000);assert.ok(s.lightning.charge>0)
  s.update(.08);assert.ok(a.hp<1000&&b.hp<1000)
  const bolts=s.effects.filter(f=>f.kind==='bolt');assert.equal(bolts.length,2)
  assert.equal(bolts[0].body,true);assert.deepEqual(bolts[0].from,{x:g.player.x,y:g.player.y})
  assert.deepEqual(bolts[1].from,{x:a.x,y:a.y});assert.ok(!s.effects.some(f=>f.kind==='sky-bolt'))
  assert.equal(s.stats.bodyLightningCasts,1)
},'lightning')
check('蓄亮期间目标死亡可重新索敌；目标全部越界时不产生幽灵伤害', (g,s)=>{
  hold(s);const a=spawn(g,{x:100}),b=spawn(g,{x:200})
  s.cast('lightning',a);a.destroy();s.update(.13);assert.ok(b.hp<100)
  const hp=b.hp;s.cast('lightning',b);b.x=g.player.x+900;s.update(.13);assert.equal(b.hp,hp)
  assert.equal(s.cast('lightning'),false);assert.equal(s.lightning.jobs.length,0)
},'lightning')
for(const second of ['fire','water','poison'])check(`雷＋${second}空格：地面预告、空中落雷和落点传导`,(g,s)=>{
  fuse(s,second);hold(s)
  const a=spawn(g,{x:180,hp:10000}),b=spawn(g,{x:250,hp:10000})
  s.useActive();assert.ok(s.effects.some(f=>f.kind==='lightning-warning'))
  assert.ok(!s.effects.some(f=>f.kind==='sky-bolt'))
  const hp=a.hp;s.update(.1);assert.equal(s.stats.skyStrikes,0);if(second!=='poison')assert.equal(a.hp,hp)
  const preStrike=a.hp;s.update(.09);assert.ok(a.hp<preStrike);assert.ok(s.effects.some(f=>f.kind==='sky-bolt'&&f.strong))
  assert.ok(!s.effects.some(f=>f.kind==='bolt'&&f.body))
  const link=s.effects.find(f=>f.kind==='bolt');assert.ok(link)
  assert.notDeepEqual(link.from,{x:g.player.x,y:g.player.y})
  assert.equal(s.stats.skyStrikes,1);s.render(ctx2d)
},'lightning')
check('雷暴形态后期核心可选且只替换一次，继承传导与麻痹强化', (g,s)=>{
  fuse(s,'fire');hold(s);assert.ok(!s.coreOptions().some(o=>o.id==='lightning_storm'))
  learnSpell(g,'spell_lightning_chain');learnSpell(g,'spell_lightning_chain');learnSpell(g,'spell_lightning_reach');learnSpell(g,'spell_lightning_stun')
  s.cores=3;const form=s.coreOptions().find(o=>o.id==='lightning_storm');assert.ok(form);assert.equal(form.kind,'form')
  const before=s.interval('lightning');s.applyCore(form);assert.equal(s.lightning.storm,true)
  assert.equal(s.elements.size,2);assert.equal(s.interval('lightning'),before)
  assert.equal(g.skillLevels.spell_lightning_chain,2);assert.ok(!s.coreOptions().some(o=>o.id==='lightning_storm'))
  assert.equal(s.applyCore(form),false);assert.equal(s.hud().elements.find(e=>e.id==='lightning').spell,'雷暴落击')
  const cards=rollSkills(g,30);assert.ok(cards.filter(c=>c.element==='lightning').every(c=>c.tags.includes('雷电·雷暴落击')))
  const targets=Array.from({length:5},(_,i)=>spawn(g,{x:100+i*60,hp:10000}))
  s.cast('lightning',targets[0]);assert.ok(s.effects.some(f=>f.kind==='lightning-warning'))
  s.update(.19);assert.ok(targets.filter(e=>e.hp<10000).length>=4)
  assert.ok(targets.some(e=>e.elementStun>0));assert.ok(s.effects.some(f=>f.kind==='sky-bolt'))
  assert.equal(s.stats.bodyLightningCasts,0);assert.ok(!s.effects.some(f=>f.body));s.render(ctx2d)
},'lightning')
check('雷暴落点优先射程内的怪群精英，群内随机位置不会劈向空地或越界目标', (g,s)=>{
  fuse(s,'fire');s.cores=3;s.applyCore(s.coreOptions().find(o=>o.id==='lightning_storm'));hold(s)
  const original=Math.random
  const a=spawn(g,{x:120,hp:10000}),b=spawn(g,{x:170,hp:10000}),outside=spawn(g,{x:900,hp:10000})
  b.isElite=true
  try{
    for(const random of [0,.99]){Math.random=()=>random;assert.equal(s.lightning.stormTarget(),b)}
    b.isElite=false;Math.random=()=>0;assert.equal(s.lightning.stormTarget(),a)
    Math.random=()=>.99;assert.equal(s.lightning.stormTarget(),b)
    assert.notEqual(s.lightning.stormTarget(),outside)
    s.cast('lightning',b);b.x+=20;s.update(.08)
    assert.equal(s.lightning.jobs[0].warning.x,b.x,'自动落雷的预告跟随目标')
    s.update(.11);assert.ok(s.stats.skyStrikes>0);assert.equal(outside.hp,10000)
  }finally{Math.random=original}
},'lightning')
check('雷电蓄亮与落雷使用游戏时间，暂停、死亡、重开和换角色清空待施法', (g,s)=>{
  const target=spawn(g,{hp:10000});hold(s);s.cast('lightning',target)
  const due=s.lightning.jobs[0].due,charge=s.lightning.charge,time=s.time
  g.pause();s.update(1);assert.equal(s.time,time);assert.equal(s.lightning.charge,charge);assert.equal(s.lightning.jobs[0].due,due)
  g.resume();hold(s);s.update(.13);assert.ok(target.hp<10000)
  s.lightning.warn(target,10);g.finishRun('defeat');assert.equal(s.lightning.jobs.length,0)
  g.reset();assert.equal(s.lightning.storm,false);assert.equal(s.lightning.jobs.length,0)
  g.running=true;s.lightning.warn(g.player,10);g.applyStartingStrain('origin');assert.equal(s.lightning.jobs.length,0)
},'lightning')
check('待落雷有预算上限，转换后与火球仍独立持续输出并触发融合', (g,s)=>{
  fuse(s,'fire');s.cores=3;s.applyCore(s.coreOptions().find(o=>o.id==='lightning_storm'))
  const target=spawnBoss(g,10000)
  for(let i=0;i<100;i++)s.lightning.warn(target,1)
  assert.equal(s.lightning.jobs.length,12);s.lightning.reset()
  for(let i=0;i<300;i++){s.update(.05);target._tickStatus(.05)}
  assert.ok(s.stats.castsByElement.fire>3&&s.stats.castsByElement.lightning>3)
  assert.ok(s.stats.damageByElement.fire>0&&s.stats.damageByElement.lightning>0)
  assert.ok(s.stats.reactions>0);assert.ok(s.stats.skyStrikes>0);assert.equal(s.elements.size,2)
  assert.ok(s.effects.length<=100&&s.lightning.jobs.length<=12)
},'lightning')

check('毒囊优先最近可攻击敌人，已有毒雾和远处密集怪群不会改变优先级', (g, s) => {
  const closest = spawn(g, { x: 80 }), invalid = spawn(g, { x: 30 }); invalid.devouring = true
  spawn(g, { x: 20 }).destroy(); spawn(g, { x: 700 })
  for (let i = 0; i < 8; i++) spawn(g, { x: 230 + i * 3, y: i * 2 })
  s.field(closest); hold(s); assert.equal(s.target('poison'), closest)
  s.cast('poison'); assert.equal(s.shots[0].target, closest)
}, 'poison')
check('毒囊蓄力与弧线飞行不提前造成伤害，落地才生成完整时长毒雾', (g, s) => {
  const target = spawn(g, { x: 180 }); hold(s); s.cast('poison')
  const shot = s.shots[0]; assert.equal(s.fields.length, 0); assert.deepEqual(shot.start, { x: g.player.x, y: g.player.y })
  s.update(.06); assert.ok(s.pose); assert.ok(shot.delay > 0); assert.equal(shot.elapsed, 0)
  s.update(.16); assert.ok(shot.x > g.player.x && shot.x < target.x); assert.ok(shot.arcHeight > 0)
  assert.equal(target.hp, 100); assert.equal(s.fields.length, 0); s.render(ctx2d)
  s.update(.201); assert.equal(s.shots.length, 0); assert.equal(s.fields.length, 1)
  near(s.fields[0].x, target.x); near(s.fields[0].life, s.fields[0].maxLife - .001)
  assert.ok(target.hp < 100); assert.ok(s.effects.some(f => f.kind === 'poison-bloom'))
}, 'poison')
check('毒囊抛出后落点固定，目标死亡也会在原落点展开并伤害附近敌人', (g, s) => {
  const target = spawn(g, { x: 180 }), nearby = spawn(g, { x: 200 }); hold(s); s.cast('poison', target)
  const aim = { ...s.shots[0].aim }; s.update(.2); target.x += 200; target.destroy()
  s.update(.3); assert.equal(s.shots.length, 0); assert.equal(s.fields.length, 1)
  near(s.fields[0].x, aim.x); near(s.fields[0].y, aim.y); assert.equal(s.fields[0].target, null)
  assert.ok(nearby.hp < 100)
}, 'poison')
check('毒囊跳过不可攻击目标，途中新增障碍物会阻挡并在障碍前展开', (g, s) => {
  spawn(g, { x: 60 }); const reachable = spawn(g, { x: 0, y: 120 }); hold(s)
  g.mapFeatures.resolvePlayerMovement = (p, x, y) => {
    if (p.x > g.player.x + 40 && Math.abs(p.y - g.player.y) < 20) { p.x = x; p.y = y; return true }
    return false
  }
  assert.equal(s.target('poison'), reachable); s.cast('poison'); s.update(.15)
  g.mapFeatures.resolvePlayerMovement = (p, x, y) => {
    if (p.y > g.player.y + 40) { p.x = x; p.y = y; return true }
    return false
  }
  s.update(.3); assert.equal(s.shots.length, 0); assert.ok(s.fields[0].y <= g.player.y + 40)
  assert.equal(reachable.hp, 100)
}, 'poison')
check('毒囊暂停冻结飞行和抛掷动作，死亡、重开与角色切换清理飞行', (g, s) => {
  const target = spawn(g, { x: 180 }); hold(s); s.cast('poison', target); s.update(.05)
  const shot = s.shots[0], delay = shot.delay, poseLife = s.poisonThrow.life
  g.pause(); s.update(1); assert.equal(shot.delay, delay); assert.equal(s.poisonThrow.life, poseLife)
  g.resume(); hold(s); s.update(.18); const elapsed = shot.elapsed
  g.pause(); s.update(1); assert.equal(shot.elapsed, elapsed); assert.equal(s.fields.length, 0)
  g.resume(); s.update(.3); assert.equal(s.fields.length, 1)
  s.cast('poison', target); g.player.dead = true; s.update(.01); assert.equal(s.shots.length, 0); assert.equal(s.pose, null)
  g.reset(); assert.equal(s.poisonThrow, null); assert.equal(s.shots.length, 0)
  g.running = true; s.cast('poison', spawn(g)); g.applyStartingStrain('origin'); assert.equal(s.shots.length, 0); assert.equal(s.pose, null)
}, 'poison')
check('抛掷保留毒雾范围、持续与附着成长及融合追随目标，两系持续独立输出', (g, s) => {
  fuse(s, 'fire'); s.cores = 2; assert.equal(s.applyCore(s.coreOptions().find(c => c.id === 'shape_poison')), true)
  learnSpell(g, 'spell_poison_area'); learnSpell(g, 'spell_poison_duration'); learnSpell(g, 'spell_poison_linger')
  const target = spawn(g, { x: 180, hp: 10000 }); hold(s); s.cast('poison', target); s.update(.43)
  const f = s.fields[0]; near(f.radius, 62 * 1.2); near(f.maxLife, (3.6 + .25) * 1.25)
  assert.equal(f.target, target); assert.ok(target.poisonHits > 0)
  target.x += 40; const before = f.x; s.update(.1); assert.ok(f.x > before)
  for (const id of s.elements) s.clocks[id] = 0
  for (let i = 0; i < 180; i++) s.update(.05)
  assert.ok(s.stats.castsByElement.poison > 2 && s.stats.castsByElement.fire > 2)
  assert.ok(s.stats.damageByElement.poison > 0 && s.stats.damageByElement.fire > 0)
  assert.ok(s.stats.reactions > 0); assert.equal(s.elements.size, 2)
}, 'poison')

check('法术护盾开局一层，仅吸收敌人攻击，破盾后超额伤害正常扣血', (g, s) => {
  hold(s); const hp = g.player.hp
  assert.equal(s.shield.points, 1); assert.equal(s.shield.cooldown, 8)
  g.player.hit(1, { enemyAttack: true }); assert.equal(g.player.hp, hp); assert.equal(s.shield.points, 0)
  assert.equal(s.shield.remaining, 8); assert.equal(s.stats.shieldAbsorbed, 1)
  assert.ok(s.effects.some(f => f.kind === 'shield-break'))
  g.player.hit(2, { enemyAttack: true }); assert.equal(g.player.hp, hp, '受击短保护不被连续碰撞穿透')
  g.player.invincible = 0; g.player.hit(1); assert.equal(g.player.hp, hp - 1, '事件伤害保持原有规则')
  g.player.invincible = 0; s.shield.reset(true); g.player.hit(2, { enemyAttack: true }); assert.equal(g.player.hp, hp - 2)
})
check('护盾按游戏时间八秒重建，暂停冻结，升级缩短为六秒且容量提升至二', (g, s) => {
  hold(s); g.player.hit(1, { enemyAttack: true }); s.update(3)
  near(s.shield.remaining, 5); g.pause(); s.update(20); near(s.shield.remaining, 5)
  g.resume(); hold(s); learnSpell(g, 'spell_shield'); near(s.shield.remaining, 3.75)
  learnSpell(g, 'spell_shield'); assert.equal(s.shield.capacity, 2); assert.equal(s.shield.points, 0, '升级不提前重建破盾')
  s.update(3.75); assert.equal(s.shield.points, 2); assert.equal(s.shield.remaining, 0)
  g.player.invincible = 0; const hp = g.player.hp; g.player.hit(1, { enemyAttack: true })
  assert.equal(s.shield.points, 1); assert.equal(s.shield.remaining, 0); assert.equal(g.player.hp, hp)
  g.player.invincible = 0; g.player.hit(2, { enemyAttack: true }); assert.equal(g.player.hp, hp - 1); assert.equal(s.shield.remaining, 6)
  s.render(ctx2d)
})
check('护盾融合保持当前容量与恢复进度，重开、结算及非元素角色清理', (g, s) => {
  learnSpell(g, 'spell_shield'); learnSpell(g, 'spell_shield'); assert.equal(s.shield.points, 2)
  g.player.hit(2, { enemyAttack: true }); hold(s); s.update(1); const remaining = s.shield.remaining
  fuse(s, 'poison'); near(s.shield.remaining, remaining); assert.equal(s.elements.size, 2)
  g.finishRun('defeat'); assert.equal(s.shield.points, 0)
  g.reset(); assert.equal(s.shield.points, 1); assert.equal(s.shield.remaining, 0)
  g.applyStartingStrain('origin'); assert.equal(s.shield.points, 0)
  g.running = true; g.player.invincible = 0; const hp = g.player.hp
  g.player.hit(1, { enemyAttack: true }); assert.equal(g.player.hp, hp - 1)
})
check('元素升级每五级提供护盾强化机会，保留单系和双系法术保底', (g, s) => {
  g.player.level = 3
  for (let i = 0; i < 20; i++) {
    const options = rollSkills(g); assert.ok(options.some(c => c.id === 'spell_shield'))
    assert.ok(options.filter(c => c.element === 'fire').length >= 2)
  }
  fuse(s, 'poison'); g.player.level = 8; g.primarySpec = 'elemental'
  const options = rollSkills(g); assert.ok(options.some(c => c.id === 'spell_shield'))
  assert.ok(options.some(c => c.element === 'fire') && options.some(c => c.element === 'poison'))
  learnSpell(g, 'spell_shield'); learnSpell(g, 'spell_shield')
  for (let i = 0; i < 20; i++) assert.ok(rollSkills(g).every(c => c.id !== 'spell_shield'))
})
for (const element of SPELL_ELEMENT_IDS) check(`${element} 威力逐级增加20%，其他元素与融合反应不重复乘算`, (g, s) => {
  hold(s); const target = spawn(g, { hp: 10000 }); let hp = target.hp
  s.damage(target, 10, element, { statuses: false }); near(hp - target.hp, 10)
  for (let lv = 1; lv <= 3; lv++) {
    learnSpell(g, `spell_${element}_power`); hp = target.hp
    s.damage(target, 10, element, { statuses: false }); near(hp - target.hp, 10 * (1 + lv * .2))
  }
  hp = target.hp; s.damage(target, 10, SPELL_ELEMENT_IDS.find(id => id !== element), { statuses: false }); near(hp - target.hp, 10)
  hp = target.hp; s.damage(target, 10, element, { reaction: true, statuses: false }); near(hp - target.hp, 10)
  assert.match(s.enhancements(element), /威力\+60%/)
}, element)
check('未学习传染时毒雾不会传毒；学习后仅落地区域的毒伤建立感染', (g, s) => {
  hold(s); const root = spawn(g, { x: 60 }), child = spawn(g, { x: 150 })
  s.field(root); s.update(.01); s.update(.7); assert.equal(s.contagion.infections.size, 0); assert.equal(child.poisonHits, 0)
  learnSpell(g, 'spell_poison_contagion'); s.update(.5); assert.ok(root.poisonHits > 0)
  assert.equal(s.contagion.infections.get(root).generation, 0); assert.equal(child.poisonHits, 0)
}, 'poison')
check('第一代传染延迟六成秒，每次感染仅传一个目标且毒伤继承70%', (g, s) => {
  hold(s); learnSpell(g, 'spell_poison_contagion')
  const root = spawn(g, { x: 60 }), child = spawn(g, { x: 150 }), last = spawn(g, { x: 240 })
  s.field(root); s.update(.01); const rootDamage = root._poisonDmg
  s.update(.59); assert.equal(child.poisonHits, 0)
  s.update(.02); assert.ok(child.poisonHits > 0); near(child._poisonDmg, rootDamage * .7)
  assert.equal(child.hp, 100, '传染瞬间只附毒，伤害由DOT结算'); assert.equal(s.fields.length, 1)
  child._poisonTick = 0; child._tickStatus(.01); assert.ok(child.hp < 100)
  s.update(.7); assert.equal(last.poisonHits, 0); assert.equal(s.stats.contagionTransfers, 1)
  s.render(ctx2d)
}, 'poison')
check('传染强化最多两代、两个近邻，逐代衰减且不在同帧递归传播', (g, s) => {
  hold(s); for (let i = 0; i < 3; i++) learnSpell(g, 'spell_poison_contagion')
  const root = spawn(g, { x: 60 }), a = spawn(g, { x: 150, y: 10 }), b = spawn(g, { x: 150, y: -10 })
  const second = spawn(g, { x: 240 }), third = spawn(g, { x: 340 })
  s.field(root); s.update(.01); s.update(.61)
  assert.ok(a.poisonHits > 0 && b.poisonHits > 0); assert.equal(second.poisonHits, 0)
  s.update(.61); assert.ok(second.poisonHits > 0); near(second._poisonDmg, root._poisonDmg * .7 ** 2)
  s.update(.7); assert.equal(third.poisonHits, 0); assert.equal(s.contagion.infections.get(second).generation, 2)
}, 'poison')
check('传染不能穿过障碍，暂停不推进传播，感染过期、死亡和重开清理', (g, s) => {
  hold(s); learnSpell(g, 'spell_poison_contagion'); const root = spawn(g, { x: 60 }), child = spawn(g, { x: 150 })
  s.field(root); s.update(.01)
  g.mapFeatures.resolvePlayerMovement = (p, x, y) => { if (p.x > g.player.x + 120) { p.x = x; p.y = y; return true } return false }
  g.pause(); s.update(3); assert.equal(s.stats.contagionTransfers, 0)
  g.resume(); hold(s); s.update(.7); assert.equal(child.poisonHits, 0)
  root.destroy(); s.update(.1); assert.equal(s.contagion.infections.size, 0)
  s.contagion.infect(child, 1, .1, 1); child.hit(0, { poison: 2, poisonDmg: 1 }); s.update(.11); assert.equal(s.contagion.infections.size, 0)
  s.contagion.infect(child, 1, 2, 1); g.reset(); assert.equal(s.contagion.infections.size, 0)
}, 'poison')
check('传染总感染预算96、每帧最多处理8个传播源，且不新增法术位', (g, s) => {
  hold(s); learnSpell(g, 'spell_poison_contagion')
  for (let i = 0; i < 140; i++) { const e = spawn(g, { x: 80 + i % 20, y: Math.floor(i / 20) * 4 }); e.hit(0, { poison: 2, poisonDmg: 1 }); s.contagion.seed(e, 1, 2) }
  assert.equal(s.contagion.infections.size, 96); s.update(.61)
  assert.equal([...s.contagion.infections.values()].filter(i => i.spread).length, 8)
  assert.equal(s.elements.size, 1); assert.equal(s.fields.length, 0); assert.ok(s.effects.length <= 100)
}, 'poison')

check('四系威力通过实际飞行、雷击和毒雾命中生效，燃烧毒伤继承强化', (g, s) => {
  for (const element of SPELL_ELEMENT_IDS) {
    s.start(element); hold(s); const target = spawn(g, { x: 100, hp: 10000 })
    s.cast(element, target); s.update(.6); const base = 10000 - target.hp
    s.shots = []; s.fields = []; s.lightning.reset(); target.hp = 10000
    learnSpell(g, `spell_${element}_power`); s.cast(element, target); s.update(.6)
    near(10000 - target.hp, base * 1.2)
    if (element === 'fire' || element === 'poison') {
      learnSpell(g, element === 'fire' ? 'spell_fire_burn' : 'spell_poison_linger')
      s.damage(target, 10, element)
      near(element === 'fire' ? target._burnDmg : target._poisonDmg, element === 'fire' ? 1.44 : 1.8)
    }
    target.destroy()
  }
})
check('传染继承强化后的真实毒伤，已有更强毒素不被低威力雾区稀释', (g, s) => {
  hold(s); learnSpell(g, 'spell_poison_power'); learnSpell(g, 'spell_poison_contagion')
  const root = spawn(g, { x: 60 }), child = spawn(g, { x: 150 })
  root.hit(0, { poison: 3, poisonDmg: 2, replaceInactiveDots: true })
  s.field(root); s.update(.01); near(root._poisonDmg, 2)
  s.update(.61); near(child._poisonDmg, 1.4)
}, 'poison')

check('寒霜升级真实降低移动40%与55%，到期恢复且步行动画同步减慢', (g, s) => {
  hold(s); g.mapFeatures.speedMultiplierAt = () => 1; g.mapFeatures.getEnemyTarget = () => g.player
  const target = spawn(g, { x: 350, hp: 1000 }); target._spawnT = 0
  let x = target.x, walk = target._walkT; target.update(.1)
  const normal = x - target.x, normalWalk = target._walkT - walk
  learnSpell(g, 'spell_ice_slow'); s.damage(target, 1, 'water'); x = target.x; walk = target._walkT
  target.update(.1); near(x - target.x, normal * .6); near(target._walkT - walk, normalWalk * .6)
  assert.match(ELEMENTAL_SKILLS.find(c => c.id === 'spell_ice_slow').stats(0), /40%.*2 秒/)
  learnSpell(g, 'spell_ice_slow'); s.damage(target, 1, 'water'); x = target.x; target.update(.1)
  near(x - target.x, normal * .45); target._tickStatus(3); assert.equal(target.spellSlowAmount, 0)
  x = target.x; target.update(.1); near(x - target.x, normal)
}, 'water')
check('寒霜同步减慢刺客突进，但首领和狂暴目标保持免疫', (g, s) => {
  hold(s); learnSpell(g, 'spell_ice_slow'); g.mapFeatures.speedMultiplierAt = () => 1
  const target = spawn(g, { x: 350, type: 'assassin' }); target.assassinState = 'dashing'; target._dashTimer = 1; target._dashDir = { x: -1, y: 0 }
  s.damage(target, 1, 'water'); const x = target.x; target.update(.1); near(x - target.x, 880 * .6 * .1)
  const boss = spawnBoss(g, 1000), enraged = spawn(g, { type: 'berserker' }); enraged.isEnraged = true
  s.damage(boss, 1, 'water'); s.damage(enraged, 1, 'water'); assert.equal(boss.spellSlowTime, 0); assert.equal(enraged.spellSlowTime, 0)
  target.type = 'berserker'; target.isEnraged = true; target._tickStatus(.01); assert.equal(target.spellSlowAmount, 0)
}, 'water')
check('寒霜状态绘制随实际减速持续，到期消失，重新命中不刷屏提示', (g, s) => {
  hold(s); learnSpell(g, 'spell_ice_slow'); const target = spawn(g)
  let texts = 0; g.enemyManager.addText = (_x, _y, text) => { if (text === '寒霜减速') texts++ }
  s.damage(target, 1, 'water'); s.damage(target, 1, 'water'); assert.equal(texts, 1)
  const labels = [], strokes = []; const recorder = new Proxy({}, {
    get(_t, key) { if (key === 'createRadialGradient' || key === 'createLinearGradient') return ctx2d[key]; return () => {} },
    set(_t, key, value) { if (key === 'fillStyle') labels.push(value); if (key === 'strokeStyle') strokes.push(value); return true },
  })
  target.render(recorder); assert.ok(strokes.includes('#c8f4ff')); assert.ok(labels.includes('#233d4d'))
  target._tickStatus(3); labels.length = strokes.length = 0; target.render(recorder)
  assert.ok(!strokes.includes('#c8f4ff')); assert.ok(!labels.includes('#233d4d'))
  s.damage(target, 1, 'water'); assert.equal(texts, 2)
}, 'water')
check('冰箭强化增大视觉晶体而保留穿透数与碰撞半径', (g, s) => {
  hold(s); const target = spawn(g, { x: 200 }); s.cast('water', target)
  const before = { size: s.shots[0].size, pierces: s.shots[0].pierces, visual: s.shots[0].visualScale }
  learnSpell(g, 'spell_water_power'); s.cast('water', target); const after = s.shots[1]
  assert.ok(after.visualScale > before.visual); assert.equal(after.size, before.size); assert.equal(after.pierces, before.pierces)
  s.render(ctx2d); g.player.dead = true; s.update(.1); assert.equal(s.shots.length, 0)
}, 'water')

check('冰箭投入穿透后按可穿透直线选目标，未投入时仍取最近威胁', (g, s) => {
  const lone = spawn(g, { x: 90, y: 60 }), first = spawn(g, { x: 300 }), mid = spawn(g, { x: 390 }), far = spawn(g, { x: 480 })
  assert.equal(s.target('water'), lone, '未投入贯穿时取最近威胁')
  learnSpell(g, 'spell_ice_pierce')
  assert.equal(s.target('water'), first, '投入后选择同一条直线上最近的敌人')
  hold(s); s.cast('water'); s.update(1.5)
  assert.ok([first, mid, far].every(e => e.hp < 100), '一次施法沿直线贯穿三人')
  assert.equal(lone.hp, 100, '偏离弹道的敌人不被命中')
}, 'water')
check('多重冰箭扇形齐射、单支伤害递减，且一轮齐射只叠一层霜纹', (g, s) => {
  hold(s); const target = spawn(g, { x: 150, hp: 10000 })
  s.cast('water', target); const base = s.shots[0].power
  s.shots.length = 0; learnSpell(g, 'spell_ice_multi'); s.cast('water', target)
  assert.equal(s.shots.length, 2); assert.equal(s.shots[0].volley, s.shots[1].volley)
  near(s.shots[0].power, base * .82); near(Math.abs(s.shots[0].angle - s.shots[1].angle), iceFanAngle)
  learnSpell(g, 'spell_ice_multi'); s.shots.length = 0; s.cast('water', target)
  assert.equal(s.shots.length, 3); assert.equal(s.shots[0].delay, 0); assert.ok(s.shots[1].delay > 0 && s.shots[2].delay > s.shots[1].delay, '分时发射')
  assert.ok(s.shots.every(shot => shot.pierces === 2), '多重箭不削减穿透')
  learnSpell(g, 'spell_ice_slow'); learnSpell(g, 'spell_ice_freeze')
  const mark = s.mark(target); mark.frost = 0; mark.frostVolley = 0
  for (let i = 0; i < 3; i++) s.damage(target, 10, 'water', { volley: 5 })
  assert.equal(mark.frost, 1, '同一轮齐射只叠一层霜纹'); assert.equal(target.freeze, 0)
  s.damage(target, 10, 'water', { volley: 6 }); assert.equal(mark.frost, 2)
  s.damage(target, 10, 'water', { volley: 7 }); assert.equal(target.freeze, .8, '第三次齐射仍能触发冻结')
  target.freeze = 0; mark.frost = 0; mark.freezeReady = 0; s.shots.length = 0; hold(s)
  s.cast('water', target); s.update(.5); assert.ok(mark.frost <= 1, '一次齐射最多叠一层霜纹')
}, 'water')
check('分裂冰箭分出碎晶：只结算伤害，不叠霜纹、不减速、不再次分裂', (g, s) => {
  hold(s); learnSpell(g, 'spell_ice_pierce'); learnSpell(g, 'spell_ice_split'); learnSpell(g, 'spell_ice_slow')
  const target = spawn(g, { x: 150, hp: 10000 }), upper = spawn(g, { x: 140, y: 120, hp: 10000 }), lower = spawn(g, { x: 150, y: -130, hp: 10000 })
  s.cast('water', target)
  let sawShard = false
  for (let i = 0; i < 12; i++) { s.update(.05); if (s.shots.some(shot => shot.shard)) sawShard = true }
  assert.ok(sawShard, '命中后分出碎晶'); s.render(ctx2d)
  assert.ok(upper.hp < 10000, '碎晶追向附近敌人'); assert.equal(lower.hp, 10000)
  near((10000 - upper.hp) / (10000 - target.hp), iceShardDamageMul)
  assert.equal(upper.spellSlowTime, 0, '碎晶不附加减速'); assert.equal(s.mark(upper).frost, 0, '碎晶不叠霜纹')
  assert.equal(s.shots.some(shot => shot.shard), false, '碎晶不再分裂且命中后回收')
}, 'water')
check('冰晶迸裂：普通敌人三层霜纹冻结并迸裂，首领只承受迸裂伤害不被冻结', (g, s) => {
  hold(s); learnSpell(g, 'spell_ice_slow'); learnSpell(g, 'spell_ice_freeze')
  const boss = spawnBoss(g, 2000), frost = s.mark(boss)
  frost.frost = 2; s.damage(boss, 10, 'water')
  assert.equal(frost.frost, 3, '未投入迸裂时首领的霜纹不被消耗'); assert.equal(boss.freeze, 0)
  learnSpell(g, 'spell_ice_shatter')
  const bossHp = boss.hp; s.damage(boss, 10, 'water')
  assert.equal(frost.frost, 0); assert.equal(boss.freeze, 0, '首领免疫冻结'); assert.ok(boss.hp < bossHp, '首领照常承受迸裂伤害')
  const target = spawn(g, { x: 200, hp: 10000 }), neighbor = spawn(g, { x: 240, hp: 10000 })
  s.mark(target).frost = 2; const neighborHp = neighbor.hp
  s.damage(target, 10, 'water')
  assert.equal(target.freeze, .8); assert.ok(neighbor.hp < neighborHp, '迸裂对周围造成范围伤害')
  assert.ok(s.effects.some(fx => fx.kind === 'crystal' && fx.radius > 40))
}, 'water')
check('霜纹脆化：霜纹在冰箭命中后附着，带霜纹目标承受更多冰系伤害', (g, s) => {
  hold(s); const plain = spawn(g, { x: 150, hp: 10000 }), cold = spawn(g, { x: 240, hp: 10000 })
  s.damage(plain, 10, 'water'); s.damage(cold, 10, 'water')
  const baseline = 10000 - plain.hp
  near(10000 - cold.hp, baseline)
  learnSpell(g, 'spell_ice_brittle')
  const before = plain.hp; s.damage(plain, 10, 'water')
  near(before - plain.hp, baseline * iceBrittleMul(1))
  const fresh = spawn(g, { x: 320, hp: 10000 })
  const firstHp = fresh.hp; s.damage(fresh, 10, 'water')
  near(firstHp - fresh.hp, baseline)
  const markedHp = fresh.hp; s.damage(fresh, 10, 'water')
  near(markedHp - fresh.hp, baseline * iceBrittleMul(1))
}, 'water')
check('冰系新卡按前置逐步进入候选：分裂需贯穿，脆化与冰封需寒霜，迸裂需冰封', (g, s) => {
  s.start('water'); g.skillLevels = {}; g.primarySpec = null; g.player.level = 2
  const ids = () => rollSkills(g, 30).map(card => card.id)
  assert.ok(!ids().includes('spell_ice_split') && !ids().includes('spell_ice_shatter') && !ids().includes('spell_ice_brittle'))
  assert.ok(ids().includes('spell_ice_multi'), '多重冰箭无需前置')
  learnSpell(g, 'spell_ice_pierce'); assert.ok(ids().includes('spell_ice_split'))
  learnSpell(g, 'spell_ice_slow'); assert.ok(ids().includes('spell_ice_brittle')); assert.ok(!ids().includes('spell_ice_shatter'))
  learnSpell(g, 'spell_ice_freeze'); assert.ok(ids().includes('spell_ice_shatter'))
}, 'water')

check('初始雷系采用淡白配色，开局选项与实际雷链颜色一致', (g, s) => {
  hold(s); const target = spawn(g, { hp: 1000 }); s.cast('lightning', target); s.update(.13)
  assert.equal(s.palette('lightning').name, '淡白'); assert.equal(s.hud().elements[0].color, '#dce3ed')
  assert.equal(s.effects.find(f => f.kind === 'bolt').color, BASE_SPELL_PALETTES.lightning.main)
}, 'lightning')
for (const fusion of SPELL_FUSIONS) for (const order of [fusion.combo, [...fusion.combo].reverse()]) check(`${fusion.name} ${order.join('→')} 两系共享融合配色、HUD和核心同步且不改变攻击形态`, (g, s) => {
  const target = spawn(g, { x: 260, hp: 10000 }); hold(s); s.cast(order[0], target)
  const beforeShots = [...s.shots], originalPalette = s.palette(order[0])
  fuse(s, order[1]); hold(s)
  const palette = FUSION_SPELL_PALETTES[fusion.id]
  assert.deepEqual(s.palette(order[0]), palette); assert.deepEqual(s.palette(order[1]), palette)
  assert.notEqual(originalPalette.main, palette.main)
  assert.ok(beforeShots.every(shot => s.shots.includes(shot)), '融合不删除已飞出法术')
  const hud = s.hud(); assert.ok(hud.elements.every(el => el.color === palette.main)); assert.equal(hud.palette.name, palette.name)
  assert.ok(s.coreOptions().every(card => card.color === palette.main))
  for (const element of order) s.cast(element, target)
  if (order.includes('fire')) assert.ok(s.shots.some(shot => shot.element === 'fire' && shot.speed === 330))
  if (order.includes('water')) assert.ok(s.shots.some(shot => shot.element === 'water' && shot.pierces === 2))
  if (order.includes('poison')) assert.ok(s.shots.some(shot => shot.element === 'poison' && shot.arcHeight > 0))
  s.useActive(); assert.ok(s.effects.some(f => f.kind === 'fusion' && f.colors[0] === palette.main && f.colors[1] === palette.accent))
  g.player.hit(1, { enemyAttack: true }); const broken = s.effects.find(f => f.kind === 'shield-break')
  assert.deepEqual(broken.colors, [palette.main, palette.accent])
  s.update(.2)
  if (order.includes('lightning')) assert.ok(s.effects.some(f => f.kind === 'bolt' || f.kind === 'sky-bolt'))
  const styles = [], recorder = new Proxy({}, {
    get(_t, key) { if (key === 'createRadialGradient' || key === 'createLinearGradient') return ctx2d[key]; return () => {} },
    set(_t, key, value) { if (key === 'fillStyle' || key === 'strokeStyle') styles.push(value); return true },
  })
  s.render(recorder); assert.ok(styles.includes(palette.main)); assert.ok(styles.includes(palette.accent))
  assert.equal(s.elements.size, 2); assert.ok(s.stats.damage > 0)
  s.start(order[0]); assert.equal(s.palette(order[0]).main, BASE_SPELL_PALETTES[order[0]].main)
}, order[0])
check('已有毒雾和传染在融合后切换配色，雷暴形态继承当前融合色', (g, s) => {
  hold(s); const target = spawn(g, { hp: 10000 }); s.field(target)
  learnSpell(g, 'spell_poison_contagion'); s.update(.01); assert.ok(s.contagion.infections.size > 0)
  fuse(s, 'lightning'); hold(s); const field = s.fields[0], damage = field.damage
  s.cores = 3; s.applyCore(s.coreOptions().find(c => c.id === 'lightning_storm'))
  s.cast('lightning', target); s.update(.19)
  assert.equal(s.effects.find(f => f.kind === 'sky-bolt').color, FUSION_SPELL_PALETTES.venom.main)
  assert.equal(s.fields[0], field); assert.equal(field.damage, damage); assert.equal(s.lightning.storm, true)
  s.render(ctx2d)
}, 'poison')

console.log(`\n双元素法术验证通过：${checks} 组机制与回归检查`)
