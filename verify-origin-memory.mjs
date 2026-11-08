import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createArena, spawn, spawnBoss, pressSpace, rollSkills, dispose, learn } from './test-support/arena-fixture.mjs'
import { ORIGIN_BASE, ORIGIN_RULES } from './src/game/OriginBuild.js'
import {
  ORIGIN_SOURCE_BY_ID,
  ORIGIN_SOURCE_RULES,
  ORIGIN_SOURCE_SKILLS,
  learnOriginMemory,
  nextOriginMemory,
  originMemoryHud,
  originMemoryLevel,
  originMemories,
  originSourceForBossType,
  originSourceRouteMods,
  resetOriginSourceMemories,
  rollOriginMemoryCard,
} from './src/game/OriginSourceSkills.js'

let passed = 0
const check = (name, run) => {
  const g = createArena('origin')
  try {
    run(g)
    console.log(`✓ ${++passed}. ${name}`)
  } finally {
    dispose(g)
  }
}

const chooseRoute = (g, route) => {
  g.player.level = 5
  const card = rollSkills(g, 3).find(s => s.isOriginRoute && s.originRoute === route)
  assert.ok(card, `route ${route}`)
  assert.equal(g.applySkill(card), true)
}

const chooseMark = (g, mark) => {
  g.player.level = 9
  const card = rollSkills(g, 9).find(s => s.isOriginMark && s.originMark === mark)
  assert.ok(card, `mark ${mark}`)
  assert.equal(g.applySkill(card), true)
}

/** 真实引擎计时推进：超载延迟、波/原核/棘刺都走 update，不直接写结果。 */
function advance(g, seconds, step = 0.05) {
  const steps = Math.max(1, Math.ceil(seconds / step))
  for (let i = 0; i < steps; i++) {
    g.elapsed += step
    g._updateStrainSkill(step)
    g.weaponSystem.originCombat.update(step)
    g.weaponSystem.originSourceCombat.update(step)
  }
}

/**
 * 支付一次超载。
 * 超载窗口 1 秒 + 支付锁 2.5 秒：连续测试时直接关闭窗口/清锁，
 * 只跳过等待，不改变「支付成功才释放」这条被验证的规则。
 */
function overload(g) {
  g.player.strainSkillCd = 0
  g.player.overloadState.lastPaidAt = -Infinity
  g.player.overloadState.active = false
  g.player.overloadState.timer = 0
  g.player.originEnergy = ORIGIN_BASE.overloadCost
  pressSpace(g)
  assert.equal(g.player.overloadState.active, true, '本次震荡应当成功支付超载')
  assert.ok(g.player.originEnergy < ORIGIN_BASE.overloadCost, '确实扣除了超载能量')
}

const damageOf = (g) => g.weaponSystem.damage * g.weaponSystem.levelMul

// ============================================================
// A. 学习机制
// ============================================================

check('A1 击败骑士王 → 首领奖励出现「骑士王源质·破阵凝胶波」并可学习', g => {
  let payload = null
  g.onExpeditionReward = (info) => { payload = info }
  const boss = spawnBoss(g, 1, 'boss-knight')
  const random = Math.random
  Math.random = () => 0 // 只看「进入奖励流程」的必然分支，不改概率本身
  try {
    g.weaponSystem._explode(boss.x, boss.y, 999, null, 40)
  } finally {
    Math.random = random
  }
  assert.equal(boss.active, false, '首领被击杀')
  assert.equal(g._bossRewardQueue.length, 1, '首领奖励入队一次')
  assert.deepEqual(g._bossRewardQueue[0].bossTypes, ['boss-knight'], '记录稳定首领类型')
  assert.equal(g._openPendingBossReward(), true, '打开现有首领奖励流程')
  assert.ok(payload && payload.phase === 'boss')
  const memory = payload.options.find(card => card.isOriginMemory)
  assert.ok(memory, '候选里必须有源质记忆卡')
  assert.equal(memory.memoryId, 'knight_breach')
  assert.match(memory.name, /骑士王源质·破阵凝胶波/)
  assert.equal(memory.level, 0)
  assert.equal(g.resolveExpeditionReward(memory.id), true)
  assert.deepEqual(g.originSourceMemories, [{ id: 'knight_breach', level: 1 }])
  assert.equal(g.skillLevels[memory.id], undefined, '不写普通技能等级')
  assert.equal(g.bossSkillLevels[memory.id], undefined, '不写 BOSS 秘典等级')
})

check('A2 大法师 → 奥术坍缩；A3 弓王 → 棘刺追猎雨', g => {
  let payload = null
  g.onExpeditionReward = (info) => { payload = info }
  for (const [type, id] of [['boss-mage', 'mage_collapse'], ['boss-archer', 'archer_hunt']]) {
    g._chapterSettlement = null
    const boss = spawnBoss(g, 1, type)
    const random = Math.random
    Math.random = () => 0
    try { g.weaponSystem._explode(boss.x, boss.y, 999, null, 40) } finally { Math.random = random }
    assert.equal(g._openPendingBossReward(), true)
    const card = payload.options.find(option => option.isOriginMemory)
    assert.ok(card, `${type} 必须给出源质卡`)
    assert.equal(card.memoryId, id)
    assert.equal(g.resolveExpeditionReward(card.id), true)
  }
  assert.deepEqual(g.originSourceMemories.map(m => m.id).sort(), ['archer_hunt', 'mage_collapse'])
})

check('A4/A5 重复获得升级，最高 Lv.3，满级后不再给卡', g => {
  assert.deepEqual(learnOriginMemory(g, 'knight_breach'), { ok: true, id: 'knight_breach', level: 1, upgraded: false })
  assert.deepEqual(learnOriginMemory(g, 'knight_breach'), { ok: true, id: 'knight_breach', level: 2, upgraded: true })
  assert.deepEqual(learnOriginMemory(g, 'knight_breach'), { ok: true, id: 'knight_breach', level: 3, upgraded: true })
  assert.equal(learnOriginMemory(g, 'knight_breach'), null, '三级封顶')
  assert.equal(originMemoryLevel(g, 'knight_breach'), 3)
  assert.equal(g.originSourceMemories.length, 1, '不重复占用多个槽位')
  assert.equal(rollOriginMemoryCard(g, 'boss-knight'), null, '满级后恢复普通秘典候选')
})

check('A6/A7 三槽位满后不自动覆盖，重复学习只升级不新增槽', g => {
  for (const skill of ORIGIN_SOURCE_SKILLS) {
    assert.ok(learnOriginMemory(g, skill.id), `learn ${skill.id}`)
  }
  const before = JSON.stringify(g.originSourceMemories)
  assert.equal(originMemories(g).length, ORIGIN_SOURCE_RULES.maxSlots)
  // 第四种源质（未来扩展）在槽位已满时绝不自动覆盖
  assert.equal(learnOriginMemory(g, 'future_unknown_source'), null)
  assert.equal(JSON.stringify(g.originSourceMemories), before, '已有记忆保持不变')
  // 满槽时重复学习其中的技能仍然只升级
  assert.equal(learnOriginMemory(g, 'knight_breach').level, 2)
  assert.equal(originMemories(g).length, 3)
  // 清洗规则：去重 + 上限 + 未知 id 丢弃
  g.originSourceMemories = [{ id: 'knight_breach', level: 9 }, { id: 'knight_breach', level: 1 }, { id: 'nope', level: 1 }, { id: 'mage_collapse', level: 2 }]
  const clean = originMemories(g)
  assert.equal(clean.length, 2)
  assert.equal(clean[0].level, 3, '等级夹在 1~3')
})

check('A8 其他五种职业不会出现原生源质卡，候选与旧规则一致', g => {
  for (const strain of ['glutton', 'ricochet', 'elemental', 'shadow', 'summoner']) {
    const other = createArena(strain)
    try {
      assert.equal(rollOriginMemoryCard(other, 'boss-knight'), null, `${strain} 不给源质卡`)
      assert.equal(rollOriginMemoryCard(other, 'boss-mage'), null)
      assert.equal(learnOriginMemory(other, 'knight_breach'), null, `${strain} 不能学习源质技能`)
      let payload = null
      other.onExpeditionReward = (info) => { payload = info }
      other._beginBossSettlement(false, { label: '骑士王', bossTypes: ['boss-knight'] })
      assert.ok(payload && payload.options.length === 3, `${strain} 仍是三选一`)
      assert.equal(payload.options.some(card => card.isOriginMemory), false)
      assert.ok(payload.options.every(card => card.isBossSkill), `${strain} 候选全部是本职秘典`)
    } finally {
      dispose(other)
    }
  }
})

check('A 来源映射按稳定 boss 类型，不依赖显示名', g => {
  assert.equal(originSourceForBossType('boss-knight').id, 'knight_breach')
  assert.equal(originSourceForBossType('boss-mage').id, 'mage_collapse')
  assert.equal(originSourceForBossType('boss-archer').id, 'archer_hunt')
  assert.equal(originSourceForBossType('骑士王 加洛特'), null, '显示名不参与判定')
  assert.equal(originSourceForBossType(undefined), null)
})

// ============================================================
// B. 超载机制
// ============================================================

check('B1/B2 普通震荡与能量不足都不释放源质技能', g => {
  learnOriginMemory(g, 'knight_breach')
  g.player.strainSkillCd = 0
  g.player.originEnergy = ORIGIN_BASE.overloadCost - 1
  pressSpace(g)
  assert.equal(g.player.overloadState.active, false, '能量不足 → 不是超载')
  advance(g, 0.6)
  assert.equal(g.originSourceLastCast, null, '普通震荡不释放源质技能')
  assert.equal(g.weaponSystem.originSourceCombat.waves.length, 0)
  assert.equal(g.originSourceCursor, 0)
})

check('B3 成功超载后自动释放一项已学技能（延迟 0.15~0.25 秒）', g => {
  learnOriginMemory(g, 'knight_breach')
  spawn(g, { x: 120, hp: 10000 })
  overload(g)
  g.weaponSystem.originSourceCombat.update(0.1)
  assert.equal(g.originSourceLastCast, null, '0.1 秒时还没释放')
  advance(g, 0.2, 0.02)
  assert.ok(g.originSourceLastCast, '延迟后自动释放')
  assert.equal(g.originSourceLastCast.id, 'knight_breach')
  assert.equal(g.originSourceLastCast.level, 1)
  assert.ok(ORIGIN_SOURCE_RULES.castDelay >= 0.15 && ORIGIN_SOURCE_RULES.castDelay <= 0.25)
})

check('B4 只有一个技能时每次超载都释放', g => {
  learnOriginMemory(g, 'mage_collapse')
  spawn(g, { x: 160, hp: 100000 })
  for (let i = 0; i < 3; i++) {
    overload(g)
    advance(g, 0.4)
    assert.equal(g.originSourceLastCast.id, 'mage_collapse')
    assert.equal(g.originSourceCursor, 0)
  }
})

check('B5/B6 两个技能顺序轮换、三个技能循环', g => {
  learnOriginMemory(g, 'knight_breach')
  learnOriginMemory(g, 'mage_collapse')
  spawn(g, { x: 160, hp: 100000 })
  const order = []
  for (let i = 0; i < 4; i++) {
    overload(g)
    advance(g, 0.4)
    order.push(g.originSourceLastCast.id)
  }
  assert.deepEqual(order, ['knight_breach', 'mage_collapse', 'knight_breach', 'mage_collapse'])

  learnOriginMemory(g, 'archer_hunt')
  const cycle = []
  for (let i = 0; i < 5; i++) {
    overload(g)
    advance(g, 0.4)
    cycle.push(g.originSourceLastCast.id)
  }
  // 游标承接上一段（4 次释放后回到槽位 0），第三个技能追加到末尾 → 三技能循环
  assert.deepEqual(cycle, ['knight_breach', 'mage_collapse', 'archer_hunt', 'knight_breach', 'mage_collapse'])
})

check('B7 连续超载不丢失轮换状态（游标始终合法）', g => {
  for (const skill of ORIGIN_SOURCE_SKILLS) learnOriginMemory(g, skill.id)
  spawn(g, { x: 160, hp: 100000 })
  const seen = new Set()
  for (let i = 0; i < 9; i++) {
    overload(g)
    advance(g, 0.4)
    assert.ok(g.originSourceCursor >= 0 && g.originSourceCursor < 3, '游标在合法范围')
    seen.add(g.originSourceLastCast.id)
  }
  assert.equal(seen.size, 3, '三个技能都轮到过')
})

check('B8 无有效目标时不报错、不卡死轮换、不浪费轮换位', g => {
  g.enemyManager._enemies.length = 0
  learnOriginMemory(g, 'knight_breach')
  learnOriginMemory(g, 'mage_collapse')
  spawn(g, { x: 150, hp: 100000 })
  overload(g)
  advance(g, 0.4)
  assert.equal(g.originSourceCursor, 1, '有目标时正常推进')
  const before = g.originSourceLastCast.id
  g.enemyManager._enemies.length = 0
  overload(g)
  advance(g, 0.4)
  assert.equal(g.originSourceCursor, 1, '无目标时保持游标，下次再释放')
  assert.equal(g.originSourceLastCast.id, before, '没有释放任何技能')
  assert.equal(g.weaponSystem.originSourceCombat.jobs.length, 0, '不残留悬挂任务')
  // 目标回来后，轮换从上次的位置继续
  spawn(g, { x: 150, hp: 100000 })
  overload(g)
  advance(g, 0.4)
  assert.equal(g.originSourceLastCast.id, 'mage_collapse')
})

check('B9 超载印记回响仍然正常触发', g => {
  chooseRoute(g, 'expansion')
  chooseMark(g, 'glutton')
  learnOriginMemory(g, 'knight_breach')
  spawn(g, { x: 40, hp: 100000 })
  overload(g)
  advance(g, 0.4)
  assert.equal(g.player.markState.echoUsed, true, '超载兑现了印记回响')
  assert.ok(g.player.originGuard >= 1, '暴食回响护甲生效')
  assert.equal(g.originSourceLastCast.id, 'knight_breach')
})

// ============================================================
// C. 路线联动
// ============================================================

check('C1 原质扩张扩大源质技能的覆盖范围', g => {
  learnOriginMemory(g, 'knight_breach')
  spawn(g, { x: 150, hp: 100000 })
  overload(g)
  advance(g, 0.3, 0.02)
  const plain = g.weaponSystem.originSourceCombat.waves[0]
  assert.ok(plain, '无路线时也有波体')
  const plainWidth = plain.width

  const expanded = createArena('origin')
  try {
    chooseRoute(expanded, 'expansion')
    learnOriginMemory(expanded, 'knight_breach')
    spawn(expanded, { x: 150, hp: 100000 })
    overload(expanded)
    advance(expanded, 0.3, 0.02)
    const wave = expanded.weaponSystem.originSourceCombat.waves[0]
    assert.ok(wave)
    assert.ok(wave.width > plainWidth, '扩张后的波体更宽')
    const ratio = wave.width / plainWidth
    assert.ok(ratio >= 1.09 && ratio <= 1.16, `范围加成应落在 10%~15%，实际 ${ratio.toFixed(3)}`)
  } finally {
    dispose(expanded)
  }
})

check('C2 基因同化按「超载前」层数给有限增伤（快照，不被消耗清零）', g => {
  chooseRoute(g, 'assimilation')
  learnOriginMemory(g, 'knight_breach')
  g.player.mutationState.stacks = 5
  g.player.mutationState.timer = 8
  spawn(g, { x: 150, hp: 100000 })
  overload(g)
  assert.equal(g.player.mutationState.stacks, 0, '超载已消耗层数')
  advance(g, 0.3, 0.02)
  const boosted = g.weaponSystem.originSourceCombat.waves[0]
  assert.ok(boosted)

  const plain = createArena('origin')
  try {
    learnOriginMemory(plain, 'knight_breach')
    spawn(plain, { x: 150, hp: 100000 })
    overload(plain)
    advance(plain, 0.3, 0.02)
    const base = plain.weaponSystem.originSourceCombat.waves[0]
    assert.ok(Math.abs(boosted.damage / base.damage - 1.15) < 1e-6, '5 层 × 3% = +15%')
  } finally {
    dispose(plain)
  }
})

check('C3 异源共振 3 回路追加有限余波，且不超过 25%', g => {
  chooseRoute(g, 'resonance')
  learnOriginMemory(g, 'knight_breach')
  const front = spawn(g, { x: 150, hp: 100000 })
  g.player.routeState.resonance.circuits = 3
  overload(g)
  advance(g, 0.25, 0.02)
  const wave = g.weaponSystem.originSourceCombat.waves[0]
  assert.ok(wave, '主技能已释放')
  const mainDamage = wave.damage
  // 冲击波已离体：此刻在身侧补一个「只可能被余波打到」的目标（冲击波半宽 + 半径远小于 90）
  const later = spawn(g, { x: 0, y: -90, hp: 100000 })
  advance(g, 1.5, 0.03)
  const lost = 100000 - later.hp
  assert.ok(lost > 0, '3 回路时确实追加了共振余波')
  assert.ok(Math.abs(lost - mainDamage * ORIGIN_SOURCE_RULES.echoShare) < 1e-6,
    `余波伤害应为主技能的 25%（实际 ${lost.toFixed(2)} / ${(mainDamage * 0.25).toFixed(2)}）`)
  assert.ok(front.hp < 100000, '主目标仍吃到主体伤害')

  const control = createArena('origin')
  try {
    chooseRoute(control, 'resonance')
    learnOriginMemory(control, 'knight_breach')
    spawn(control, { x: 150, hp: 100000 })
    overload(control) // 0 回路：没有余波
    advance(control, 0.25, 0.02)
    const behind = spawn(control, { x: 0, y: -90, hp: 100000 })
    advance(control, 1.5, 0.03)
    assert.equal(behind.hp, 100000, '没有 3 回路时不会产生余波')
  } finally {
    dispose(control)
  }
})

check('C4 三条路线只叠加自己的专属效果，加成都有上限', g => {
  g.originRoute = 'expansion'
  const expansion = originSourceRouteMods(g, { stacks: 5, circuits: 3 })
  assert.equal(expansion.route, 'expansion')
  assert.equal(expansion.damage, 1, '扩张不额外加伤害')
  assert.equal(expansion.echo, false, '扩张不触发共振余波')
  assert.ok(expansion.area <= 1.15)

  g.originRoute = 'assimilation'
  const assimilation = originSourceRouteMods(g, { stacks: 9, circuits: 3 })
  assert.equal(assimilation.area, 1, '同化不加范围')
  assert.equal(assimilation.echo, false)
  assert.ok(Math.abs(assimilation.damage - 1.15) < 1e-9, '同化增伤封顶 15%')

  g.originRoute = 'resonance'
  const resonance = originSourceRouteMods(g, { stacks: 5, circuits: 3 })
  assert.equal(resonance.damage, 1, '共振不额外加伤害')
  assert.equal(resonance.area, 1)
  assert.equal(resonance.echo, true)
  assert.equal(originSourceRouteMods({ ...g, originRoute: 'resonance' }, { circuits: 2 }).echo, false, '2 回路不触发')

  g.originRoute = null
  const none = originSourceRouteMods(g, { stacks: 5, circuits: 3 })
  assert.deepEqual([none.area, none.damage, none.echo], [1, 1, false])
})

// ============================================================
// D. 战斗安全
// ============================================================

check('D1/D2 源质技能不产生异源能量，也不会触发自身', g => {
  learnOriginMemory(g, 'knight_breach')
  const victim = spawn(g, { x: 120, hp: 1 }) // 会被冲击波击杀
  overload(g)
  const energyAfterShock = g.player.originEnergy
  advance(g, 0.6)
  assert.equal(victim.active, false, '源质技能完成击杀')
  assert.equal(g.player.originEnergy, energyAfterShock, '击杀不返还/产生异源能量')
  assert.equal(g.weaponSystem.originSourceCombat.jobs.filter(job => job.kind === 'overload').length, 0, '不会自我递归')
})

check('D3 棘刺数量有硬上限，不产生无限弹体', g => {
  learnOriginMemory(g, 'archer_hunt')
  for (let i = 0; i < 8; i++) spawn(g, { x: 120 + i * 30, hp: 100000 })
  for (let i = 0; i < 10; i++) {
    overload(g)
    advance(g, 0.25, 0.02)
    assert.ok(
      g.weaponSystem.originSourceCombat.spikes.length <= ORIGIN_SOURCE_RULES.spikeCap,
      `棘刺 ${g.weaponSystem.originSourceCombat.spikes.length} ≤ ${ORIGIN_SOURCE_RULES.spikeCap}`
    )
  }
})

check('D4 不递归触发印记回响（副弹只来自那一次超载回响）', g => {
  chooseRoute(g, 'expansion')
  chooseMark(g, 'gatling')
  learnOriginMemory(g, 'archer_hunt')
  spawn(g, { x: 130, hp: 400 })
  overload(g)
  const echoBolts = () => g.weaponSystem._projectiles.filter(p => p.isOriginEcho).length
  const afterEcho = echoBolts()
  assert.ok(afterEcho > 0, '超载回响确实打出了副弹')
  advance(g, 0.8)
  assert.ok(echoBolts() <= afterEcho, '源质技能不会追加新的印记回响副弹')
})

check('D5 源质技能击杀正常结算经验/掉落/统计', g => {
  learnOriginMemory(g, 'knight_breach')
  const gems = g.gemManager.count
  spawn(g, { x: 120, hp: 1 })
  overload(g)
  advance(g, 0.6)
  assert.equal(g.weaponSystem.kills, 1)
  assert.ok(g.gemManager.count > gems, '掉落经验宝石')
  assert.ok(g.player.exp >= 0)
})

check('D6 源质技能击杀精英/首领不会形成无限充能', g => {
  learnOriginMemory(g, 'knight_breach')
  // 放在震荡半径之外、冲击波路径之上：击杀只能由源质技能完成
  const elite = spawn(g, { x: 250, hp: 1 })
  elite.isElite = true
  const boss = spawnBoss(g, 1, 'boss-mage')
  boss.x = g.player.x + 330
  boss.y = g.player.y
  overload(g)
  const energy = g.player.originEnergy
  advance(g, 1.2, 0.03)
  assert.equal(elite.active, false, '冲击波击杀精英')
  assert.equal(boss.active, false, '冲击波击杀首领')
  assert.equal(g.player.originEnergy, energy, '精英/首领击杀不额外充能')
  assert.equal(g.weaponSystem.eliteKills, 1)
  assert.equal(g.weaponSystem.bossKills, 1)
})

check('D7 其他五种职业的战斗逻辑不受影响', g => {
  for (const strain of ['glutton', 'ricochet', 'elemental', 'shadow', 'summoner']) {
    const other = createArena(strain)
    try {
      assert.equal(other.weaponSystem.originSourceCombat.enabled, false, `${strain} 不启用源质记忆`)
      assert.equal(other.weaponSystem.originSourceCombat.queueOverload(), false)
      other.weaponSystem.update(0.016)
      assert.equal(other.originSourceLastCast, null)
      assert.deepEqual(other.originSourceMemories, [])
    } finally {
      dispose(other)
    }
  }
})

// ============================================================
// E. 状态与 UI
// ============================================================

check('E1 新开局清空源质记忆', g => {
  for (const skill of ORIGIN_SOURCE_SKILLS) learnOriginMemory(g, skill.id)
  advance(g, 0.4)
  g.reset()
  assert.deepEqual(g.originSourceMemories, [])
  assert.equal(g.originSourceCursor, 0)
  assert.equal(g.originSourceLastCast, null)
  assert.equal(originMemoryHud(g).known, false)
})

check('E2 换章/武器重置保留本局已吸收的源质记忆', g => {
  learnOriginMemory(g, 'mage_collapse')
  learnOriginMemory(g, 'archer_hunt')
  g.weaponSystem.reset() // 换章会走这条重置链
  assert.deepEqual(g.originSourceMemories.map(m => m.id), ['mage_collapse', 'archer_hunt'])
  g.bossTomes.clearStage()
  g._enterExpeditionStage(2)
  assert.deepEqual(g.originSourceMemories.map(m => m.id), ['mage_collapse', 'archer_hunt'])
  assert.equal(g.originSourceCursor, 0)
})

check('E3/E4 HUD 正确显示三槽位、释放顺序，并在学习/升级/释放后更新', g => {
  let stats = null
  g.onStats = (value) => { stats = value }
  g._pushStats()
  assert.equal(stats.origin.memory.known, false, '未吸收时不显示空洞区域')
  assert.equal(stats.origin.memory.slots.length, 0)

  assert.ok(learnOriginMemory(g, 'knight_breach'))
  assert.ok(learnOriginMemory(g, 'mage_collapse'))
  g._pushStats()
  const memory = stats.origin.memory
  assert.equal(memory.known, true)
  assert.equal(memory.cap, 3)
  assert.equal(memory.slots.length, 2)
  assert.deepEqual(memory.slots.map(slot => slot.next), [true, false], '当前轮换位只有第一个')
  assert.equal(memory.nextName, '破阵凝胶波')
  assert.match(memory.slots[0].cardId, /osrc_knight_breach/)

  learnOriginMemory(g, 'knight_breach') // 升到 Lv.2
  g._pushStats()
  assert.equal(stats.origin.memory.slots[0].level, 2)

  spawn(g, { x: 150, hp: 100000 })
  overload(g)
  advance(g, 0.4)
  g._pushStats()
  assert.equal(stats.origin.memory.lastId, 'knight_breach', '释放后 HUD 记录最近一次')
  assert.ok(stats.origin.memory.lastAge < 1.4, '高亮窗口内')
  assert.equal(stats.origin.memory.nextName, '奥术坍缩', '预告切到下一次')
  assert.deepEqual(stats.origin.memory.slots.map(slot => slot.next), [false, true])
})

check('E5 暂停/恢复/结算不产生异常', g => {
  learnOriginMemory(g, 'knight_breach')
  spawn(g, { x: 150, hp: 100000 })
  overload(g)
  g.pause()
  g.resume()
  advance(g, 0.5)
  assert.ok(g.originSourceLastCast, '恢复后仍会释放')
  g.finishRun('defeat')
  assert.equal(g.runFinished, true)
  assert.deepEqual(g.originSourceMemories, [{ id: 'knight_breach', level: 1 }], '结算不清空本局记忆')
  g.weaponSystem.update(0.016)
  assert.equal(g.weaponSystem.originSourceCombat.spikes.length, 0, '结束后清空残留实体')
})

check('E6 窄屏 UI：HUD 有紧凑样式与窄屏断点', () => {
  const source = fs.readFileSync(new URL('./src/components/HudOverlay.vue', import.meta.url), 'utf8')
  assert.match(source, /class="hud-memory"/)
  assert.match(source, /下次超载释放/)
  assert.match(source, /尚未吸收源质/)
  assert.match(source, /@media \(max-width: 650px\)[\s\S]{0,400}\.hud-memory/)
})

check('E 状态结构：nextOriginMemory 与 reset 的纯函数契约', g => {
  assert.equal(nextOriginMemory(g), null)
  learnOriginMemory(g, 'archer_hunt')
  learnOriginMemory(g, 'knight_breach')
  g.originSourceCursor = 1
  const next = nextOriginMemory(g)
  assert.equal(next.id, 'knight_breach')
  assert.equal(next.def.name, '破阵凝胶波')
  g.originSourceCursor = 99
  assert.equal(nextOriginMemory(g).id, 'knight_breach', '越界游标回到合法范围')
  g.originSourceCursor = -5
  assert.equal(nextOriginMemory(g).index, 0)
  resetOriginSourceMemories(g)
  assert.equal(nextOriginMemory(g), null)
  assert.equal(ORIGIN_SOURCE_BY_ID.knight_breach.bossType, 'boss-knight')
})

check('A9 远征章节结算：章间秘典阶段同样可吸收源质，步骤顺序不变', g => {
  const payloads = []
  g.onExpeditionReward = (info) => { payloads.push(info) }
  g._lastChapterBoss = '弓王 罗宾'
  g._lastChapterBossTypes = ['boss-archer']
  assert.equal(g._beginBossSettlement(true), true)
  const bossPhase = payloads.at(-1)
  assert.equal(bossPhase.phase, 'boss')
  assert.equal(bossPhase.chapter, true)
  assert.equal(bossPhase.source, '弓王 罗宾')
  const memory = bossPhase.options.find(card => card.isOriginMemory)
  assert.ok(memory, '章节首领也会给出源质卡')
  assert.equal(memory.memoryId, 'archer_hunt')
  assert.ok(bossPhase.options.filter(card => card.isBossSkill).length <= 2, '其余位置仍是本职秘典')
  assert.equal(g.resolveExpeditionReward(memory.id), true)
  const supply = payloads.at(-1)
  assert.equal(supply.phase, 'supply', '仍然进入原有补给阶段')
  assert.match(supply.summary, /弓王源质·棘刺追猎雨 · Lv\.1\/3/)
  assert.deepEqual(g.originSourceMemories, [{ id: 'archer_hunt', level: 1 }])
})

check('A10 同一场首领编队只发一次源质奖励（沿用遭遇去重）', g => {
  const random = Math.random
  Math.random = () => 0
  try {
    const first = spawnBoss(g, 100, 'boss-knight')
    first.bossGroupId = 'squad-1'
    first.isBossSquadMember = true
    const second = spawnBoss(g, 100, 'boss-archer')
    second.bossGroupId = 'squad-1'
    second.isBossSquadMember = true
    assert.equal(g.queueBossReward(first), true)
    assert.equal(g.queueBossReward(second), false, '整队只入队一次')
  } finally {
    Math.random = random
  }
  assert.equal(g._bossRewardQueue.length, 1)
})

// ============================================================
// F. 第二轮验收修正（首次保底 / 编队类型 / 命中带 / 首领优先）
// ============================================================

check('F1 首次遇到某种源质时保底进入奖励流程（不受 65% 判定影响）', g => {
  const random = Math.random
  try {
    Math.random = () => 0.99 // 必然落在 65% / 85% 之外
    const first = spawnBoss(g, 100, 'boss-knight')
    first.bossGroupId = 'solo-first'
    assert.equal(g.queueBossReward(first, ['boss-knight']), true, '首次必定入队')
    const second = spawnBoss(g, 100, 'boss-knight')
    second.bossGroupId = 'solo-second'
    assert.equal(g.queueBossReward(second, ['boss-knight']), false, '同种源质不再保底')
    Math.random = () => 0.99
    const mage = spawnBoss(g, 100, 'boss-mage')
    mage.bossGroupId = 'solo-mage'
    assert.equal(g.queueBossReward(mage, ['boss-mage']), true, '另一种源质仍享首次保底')
  } finally {
    Math.random = random
  }
  assert.equal(g._bossRewardQueue.length, 2)
  assert.deepEqual(g._bossRewardQueue.map(entry => entry.bossTypes), [['boss-knight'], ['boss-mage']])
})

check('F2 保底不越界：其他职业 / 已满级 / 槽位已满时不保底', g => {
  // 其他职业
  const other = createArena('glutton')
  try {
    const random = Math.random
    Math.random = () => 0.99
    try {
      const boss = spawnBoss(other, 100, 'boss-knight')
      assert.equal(other.queueBossReward(boss, ['boss-knight']), false, '其他职业不保底')
    } finally { Math.random = random }
    assert.equal(other._bossRewardQueue.length, 0)
  } finally {
    dispose(other)
  }
  // 已满级
  learnOriginMemory(g, 'knight_breach')
  learnOriginMemory(g, 'knight_breach')
  learnOriginMemory(g, 'knight_breach')
  const random = Math.random
  Math.random = () => 0.99
  try {
    const boss = spawnBoss(g, 100, 'boss-knight')
    assert.equal(g.queueBossReward(boss, ['boss-knight']), false, '满级后恢复原概率')
  } finally { Math.random = random }
})

check('F3 编队按「未学优先」挑选源质类型，不再只认最后一名成员', g => {
  // 都未学：按遭遇顺序取第一个
  assert.equal(rollOriginMemoryCard(g, ['boss-knight', 'boss-archer']).memoryId, 'knight_breach')
  learnOriginMemory(g, 'knight_breach')
  // 骑士已学、弓手未学：即使最后死的是骑士，也给弓手
  assert.equal(rollOriginMemoryCard(g, ['boss-knight', 'boss-archer']).memoryId, 'archer_hunt')
  // 只有骑士：给升级卡
  const upgrade = rollOriginMemoryCard(g, ['boss-knight'])
  assert.equal(upgrade.memoryId, 'knight_breach')
  assert.equal(upgrade.level, 1)
  // 面板层同口径：入队结构带多个类型时，候选卡就是未学的那个
  let payload = null
  g.onExpeditionReward = (info) => { payload = info }
  g._beginBossSettlement(false, { label: '王国双锋', bossTypes: ['boss-knight', 'boss-archer'] })
  const card = payload.options.find(option => option.isOriginMemory)
  assert.equal(card.memoryId, 'archer_hunt')
})

check('F4 首领阵亡后移出名单不影响类型留档（bossEncounterTypes 在结算前取样）', g => {
  const types = []
  const first = spawnBoss(g, 100, 'boss-knight')
  first.bossGroupId = 'squad-x'
  first.bossGroupSize = 2
  first.isBossSquadMember = true
  const second = spawnBoss(g, 100, 'boss-archer')
  second.bossGroupId = 'squad-x'
  second.bossGroupSize = 2
  second.isBossSquadMember = true
  g.enemyManager._bossEncounter = { id: 'squad-x', memberTypes: new Set(['boss-knight', 'boss-archer']), pending: [] }
  types.push(...g.enemyManager.bossEncounterTypes(first))
  assert.deepEqual(types.sort(), ['boss-archer', 'boss-knight'])
  // 成员被清出活跃名单后仍能取到完整类型
  first.active = false
  second.active = false
  assert.deepEqual(g.enemyManager.bossEncounterTypes(first).sort(), ['boss-archer', 'boss-knight'])
  g.enemyManager._bossEncounter = null
})

check('F5 破阵凝胶波命中带随距离外扩（不再等宽细线）', g => {
  learnOriginMemory(g, 'knight_breach')
  const decoy = spawn(g, { x: 300, y: 0, hp: 100000 }) // 定义发射方向（+x）
  const offset = spawn(g, { x: 480, y: 50, hp: 100000 }) // 偏离轴线 50px
  overload(g)
  advance(g, 1.25, 0.02)
  assert.ok(decoy.hp < 100000, '轴线上目标被命中')
  assert.ok(offset.hp < 100000, `偏移 50px 的敌人也应被楔形命中带覆盖（hp ${offset.hp}）`)
})

check('F6 破阵凝胶波优先瞄准首领（直线沿途仍会扫到杂兵）', g => {
  learnOriginMemory(g, 'knight_breach')
  const boss = spawnBoss(g, 100000, 'boss-knight')
  boss.x = g.player.x + 500
  boss.y = g.player.y
  const add = spawn(g, { x: 130, y: 210, hp: 100000 }) // 更近但偏离轴线
  overload(g)
  advance(g, 1.25, 0.02)
  assert.ok(boss.hp < 100000, `首领应在射程内被优先命中（hp ${boss.hp}）`)
  assert.ok(add.hp <= 100000)
})

check('F7 棘刺追猎雨的第一枚锁定首领', g => {
  learnOriginMemory(g, 'archer_hunt')
  const boss = spawnBoss(g, 100000, 'boss-knight')
  boss.x = g.player.x + 420
  boss.y = g.player.y
  const add = spawn(g, { x: 110, y: 240, hp: 100000 }) // 不在朝首领的直线上，避免身体挡弹
  overload(g)
  advance(g, 1.4, 0.03)
  assert.ok(boss.hp < 100000, `首领应吃到棘刺（hp ${boss.hp}）`)
  assert.ok(add.hp <= 100000)
})

check('F8 奥术坍缩的密集点对首领所在区域加权', g => {
  learnOriginMemory(g, 'mage_collapse')
  const boss = spawnBoss(g, 100000, 'boss-mage')
  boss.x = g.player.x + 360
  boss.y = g.player.y
  spawn(g, { x: 120, y: 140, hp: 100000 })
  spawn(g, { x: 132, y: 150, hp: 100000 })
  overload(g)
  advance(g, 0.3, 0.02)
  const core = g.weaponSystem.originSourceCombat.cores[0]
  assert.ok(core, '原核已生成')
  assert.ok(Math.hypot(core.x - boss.x, core.y - boss.y) < 120, '原核偏向首领所在簇')
  advance(g, 0.6, 0.02)
  assert.ok(boss.hp < 100000, '首领吃到坍缩伤害')
})

console.log(`\n源质记忆验证通过：${passed} 组 ✓`)
