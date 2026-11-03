import assert from 'node:assert/strict'
import { createArena, spawn, spawnBoss, dispose, pressSpace } from './test-support/arena-fixture.mjs'
import { SPELL_FUSIONS } from './src/game/SpellRules.js'
import { rollSkills } from './src/game/SkillPool.js'

let checks = 0
function check(name, test, strain = 'elemental') {
  const g = createArena(strain)
  g.reset(); g.running = true; g.input.suspended = false
  g.enemyManager._enemies.length = 0; g.enemyManager._spawnTimer = Infinity
  g.mapFeatures.barricades = []; g.mapFeatures.resolvePlayerMovement = () => false
  const events = []
  g.onSpellCore = info => events.push({ type: 'spell', info })
  g.onLevelUp = options => events.push({ type: 'normal', options })
  try { test(g, g.weaponSystem.spellCombat, events); console.log(`✓ ${++checks}. ${name}`) }
  finally { dispose(g) }
}

function nextLevel(g, events, element) {
  const before = events.length
  g.player.gainExp(g.player.maxExp - g.player.exp)
  assert.equal(events.length, before + 1, '每级恰好一个奖励入口')
  const event = events.at(-1)
  if (event.type === 'spell') {
    const option = event.info.options.find(o => o.element === element) || event.info.options[0]
    assert.equal(g.resolveSpellCore(option.id), true)
  } else {
    g.applySkill(event.options.find(o => o.element) || event.options[0])
  }
  assert.equal(g._pauseLock, 0)
  return event
}

check('Lv.1 原质飞弹真实击杀并掉落经验，Lv.2 触发第一法术且护盾可用', (g, s, events) => {
  assert.equal(s.elements.size, 0); assert.equal(s.shield.capacity, 1)
  assert.deepEqual(s.coreOptions(), [], '尚未学法术时没有可提前领取的核心选项')
  const enemy = spawn(g, { hp: 1, x: 65 })
  g.enemyManager._buildGrid()
  for (let n = 0; n < 60 && enemy.hp > 0; n++) g.weaponSystem.update(.05)
  assert.ok(enemy.hp <= 0, '中性阶段能够攻击，不能卡在零经验')
  assert.ok(g.gemManager._gems.some(gem => gem.type === 'exp'))
  g.player.gainExp(40)
  assert.equal(events.at(-1).info.stage, 'first')
  assert.equal(events.at(-1).info.options.length, 4)
  const time = s.time; s.update(1); assert.equal(s.time, time, '选法术时暂停计时')
  assert.equal(g.resolveSpellCore('invalid'), false); assert.equal(g._pauseLock, 1)
  assert.equal(g.resolveSpellCore('spell_learn_fire'), true)
  assert.equal(g.weaponSystem._projectiles.length, 0)
  assert.deepEqual([...s.elements], ['fire']); assert.equal(s.shield.capacity, 1)
  assert.equal(s.cores, 0, '学法术不占 BOSS 核心计数')
})

for (const mode of ['expedition', 'timed', 'endless']) for (const fusion of SPELL_FUSIONS) {
  check(`${mode} ${fusion.name}: Lv.2/5/10 各替代一次升级，强化保留且实际施法有效`, (g, s, events) => {
    g.configureRun({ mode, difficulty: 'normal' })
    assert.equal(nextLevel(g, events, fusion.combo[0]).info.stage, 'first')
    assert.equal(nextLevel(g, events).type, 'normal')
    assert.equal(nextLevel(g, events).type, 'normal')
    const learned = { ...g.skillLevels }
    assert.equal(nextLevel(g, events, fusion.combo[1]).info.stage, 'fusion')
    assert.equal(s.fusion.id, fusion.id); assert.equal(g.primarySpec, 'elemental')
    assert.deepEqual(g.skillLevels, learned)
    assert.ok(s.coreOptions().every(o => !['fusion', 'active'].includes(o.kind)))
    const enemy = spawn(g, { hp: 1e6, x: 90 })
    for (let n = 0; n < 80; n++) g.weaponSystem.update(.05)
    assert.ok(s.stats.castsByElement[fusion.combo[0]] > 0)
    assert.ok(s.stats.castsByElement[fusion.combo[1]] > 0)
    assert.ok(enemy.hp < 1e6)
    while (g.player.level < 9) nextLevel(g, events)
    assert.equal(s.activeName, fusion.active)
    assert.equal(nextLevel(g, events).info.stage, 'evolution')
    assert.equal(s.activeName, fusion.evolved); assert.equal(s.rank('active'), 3)
    pressSpace(g); assert.equal(s.stats.activeCasts, 1)
    assert.equal(s.elements.size, 2); assert.equal(s.cores, 0)
    assert.equal(events.filter(e => e.type === 'spell').length, 3)
    assert.equal(events.filter(e => e.type === 'normal').length, 6)
    assert.equal(s.applyMilestone({ id: 'spell_milestone_evolution' }), false, '进化不能重复领取')
  })
}

check('提前击败 BOSS 时核心延后到融合，重复奖励、无效选择与暂停锁正确', (g, s, events) => {
  const boss = spawnBoss(g)
  assert.equal(g.queueSpellCore(boss), true); assert.equal(g.queueSpellCore(boss), false)
  assert.equal(g._openPendingSpellCore(), false)
  assert.equal(s.applyCore({ id: 'spell_fuse_water' }), false)
  nextLevel(g, events, 'fire'); nextLevel(g, events); nextLevel(g, events)
  const before = events.length
  g.player.gainExp(g.player.maxExp)
  assert.equal(events.length, before + 1)
  assert.equal(g.resolveSpellCore('spell_fuse_poison'), true)
  assert.equal(events.at(-1).info.first, false)
  assert.ok(events.at(-1).info.options.every(o => !['fusion', 'active'].includes(o.kind)))
  assert.equal(g._pauseLock, 1)
  assert.equal(g.resolveSpellCore(events.at(-1).info.options[0].id), true)
  assert.equal(g._pauseLock, 0); assert.equal(s.cores, 1)
})

check('大额溢出经验串行跨越三个里程碑，重开清空法术与进化', (g, s, events) => {
  g.player.gainExp(1480)
  let resolved = 0
  while (g._pauseLock && resolved++ < 20) {
    const event = events.at(-1)
    if (event.type === 'spell') assert.equal(g.resolveSpellCore(event.info.options[0].id), true)
    else g.applySkill(event.options.find(o => o.element) || event.options[0])
  }
  assert.equal(g.player.level, 10); assert.equal(g.player.exp, 0)
  assert.equal(events.length, 9); assert.equal(g._pauseLock, 0)
  assert.equal(s.elements.size, 2); assert.equal(s.milestoneEvolved, true)
  const stale = events.find(e => e.info?.stage === 'first').info.options[0]
  assert.equal(s.applyMilestone(stale), false)
  g.reset()
  assert.equal(s.elements.size, 0); assert.equal(s.milestoneEvolved, false)
  assert.equal(s.rank('active'), 0); assert.equal(g._spellCoreChoice, null)
  assert.equal(g._spellCoreQueue.length, 0); assert.equal(g.player.level, 1)
})

check('死亡与终局不会领取里程碑；不会抽到未掌握系强化', (g, s, events) => {
  nextLevel(g, events, 'lightning')
  for (let n = 0; n < 30; n++) assert.ok(rollSkills(g, 3).every(o => !o.element || o.element === 'lightning'))
  g.player.level = 5; g.player.dead = true
  assert.equal(s.milestoneReward(), null)
  g.player.dead = false; g.runFinished = true
  assert.equal(s.milestoneReward(), null)
})

for (const strain of ['origin', 'glutton', 'ricochet', 'shadow', 'summoner']) {
  check(`${strain}: 保留其他角色的升级入口`, (g, s, events) => {
    assert.equal(s.enabled, false); assert.equal(s.milestoneReward(), null)
    g.player.gainExp(40)
    assert.equal(events.length, 1); assert.equal(events[0].type, 'normal')
  }, strain)
}

console.log(`\n元素等级成长验证通过：${checks} 组检查（含 18 组模式与融合组合）`)
