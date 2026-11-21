// 限时讨伐 20 分钟模式（timed20）专项回归验证。
// 运行：node verify-timed20.mjs
import assert from 'node:assert/strict'
import { createArena, dispose } from './test-support/arena-fixture.mjs'
import { STARTING_EXP_THRESHOLD, getNextExpThreshold } from './src/game/entities/Player.js'
import {
  computeScoreBreakdown,
  getBossWavePlan,
  getDifficultyBossHpMultiplier,
  getEventLockAt,
  getFinalWarningAt,
  getPointsPerScore,
  getTimedDuration,
  getTimedMaxWave,
  getWaveModifiers,
  isModeUnlocked,
  scoreToPoints,
  DIFFICULTIES,
} from './src/game/RunRules.js'
import { defaultSave, pushScore, sanitizeSave } from './src/game/SaveManager.js'

let n = 0
const ok = (message) => console.log(`  ✓ ${++n}. ${message}`)

// 1. 解锁链与老存档兼容
{
  const save = defaultSave()
  assert.equal(isModeUnlocked(save.progression, 'timed20'), false)
  pushScore(save, { mode: 'expedition', difficulty: 'hard' }, {
    result: 'victory', stage: 10, wave: 20, kills: 200, time: 1200,
  })
  assert.equal(isModeUnlocked(save.progression, 'timed'), true)
  assert.equal(isModeUnlocked(save.progression, 'timed20'), false)

  pushScore(save, { mode: 'timed', difficulty: 'normal' }, {
    result: 'victory', wave: 25, kills: 200, time: 750, finaleTime: 30,
  })
  assert.equal(isModeUnlocked(save.progression, 'timed20'), false, '普通 12 分钟通关不解锁 20 分钟')

  pushScore(save, { mode: 'timed', difficulty: 'hard' }, {
    result: 'victory', wave: 25, kills: 240, time: 770, finaleTime: 50,
  })
  assert.equal(isModeUnlocked(save.progression, 'timed20'), true, '困难 12 分钟通关解锁 20 分钟')
  assert.equal(isModeUnlocked(save.progression, 'endless'), true)

  const legacyEndless = sanitizeSave({
    version: 6,
    drops: 500,
    genes: {},
    records: {},
    progression: { highestDifficulty: 'hard', highestMode: 'endless' },
    preferences: { mode: 'timed20', difficulty: 'hard' },
  })
  assert.equal(isModeUnlocked(legacyEndless.progression, 'timed20'), true)
  assert.equal(legacyEndless.preferences.mode, 'timed20')

  const lockedPref = sanitizeSave({
    version: 6,
    drops: 0,
    genes: {},
    records: {},
    progression: { highestDifficulty: 'normal', highestMode: 'timed' },
    preferences: { mode: 'timed20', difficulty: 'normal' },
  })
  assert.equal(lockedPref.preferences.mode, 'timed', '未解锁 20 分钟时偏好回退到限时')
  ok('解锁门槛：困难 12 分钟解锁 20 分钟，老无尽存档自动开放，未解锁偏好安全回落')
}

// 2. 时长、警报、世界事件锁定、换景与终局编队
{
  assert.equal(getTimedDuration('timed20'), 1200)
  assert.equal(getFinalWarningAt('timed20'), 1170)
  assert.equal(getEventLockAt('timed20'), 1140)
  assert.equal(getTimedMaxWave('timed20'), 40)

  const g = createArena('origin')
  const events = []
  g.onRunState = (e) => events.push(e)
  g.configureRun({ mode: 'timed20', difficulty: 'hard' })
  g.reset()
  g.player.invincible = 9999

  assert.equal(g._mapThemeId, 'frontier')
  g.elapsed = 1100
  assert.equal(g.canStartWorldEvent, true)
  g.elapsed = 1141
  assert.equal(g.canStartWorldEvent, false)

  g.enemyManager.wave = 20
  g._updateRunState(0.016)
  assert.equal(g._mapThemeId, 'blight')
  assert.ok(events.some((e) => e.kind === 'zone'))

  g.enemyManager.wave = 30
  g._updateRunState(0.016)
  assert.equal(g._mapThemeId, 'royal')

  g.elapsed = 1170.1
  g._updateRunState(0.016)
  assert.ok(events.some((e) => e.kind === 'warning'))
  assert.equal(g.enemyManager.crowds.blocked(), true)

  g.elapsed = 1200.1
  g._updateRunState(0.016)
  assert.equal(g.runState, 'finale')
  assert.equal(g._mapThemeId, 'royal')
  assert.equal(g.enemyManager.wave, 41)
  assert.equal(g.enemyManager.activeBossCount, 4)
  assert.equal(g.enemyManager.pendingBossCount, 1)
  assert.equal(g.enemyManager.bossInfo.total, 5)
  assert.ok(events.some((e) => e.kind === 'finale' && e.boss === '王国终焉防线'))

  // 必须击破全部 5 名成员（4 名同场 + 1 名后备）才判胜利
  let safety = 0
  while (!g.runFinished && safety++ < 10) {
    const target = g.enemyManager._bosses.find((boss) => boss.active)
    assert.ok(target)
    target.destroy()
    g.handleBossDefeated(target)
  }
  assert.equal(g.runFinished, true)
  assert.equal(g.runState, 'victory')
  dispose(g)
  ok('20 分钟引擎流程：事件锁定、三段换景、末 30s 警报、四王+后备终局与整队全清胜利闭环')
}

// 3. 割草人口、群体潮汐与决斗圈
{
  const g = createArena('ricochet')
  g.configureRun({ mode: 'timed20', difficulty: 'normal' })
  g.reset()
  const m = g.enemyManager
  m.wave = 20
  assert.equal(m._populationTarget(), 76)
  m.wave = 30
  assert.equal(m._populationTarget(), 101)
  m.wave = 40
  assert.equal(m._populationTarget(), 126)

  m.wave = 25
  assert.equal(m.crowds.startTide(), true)
  m.crowds.spawnTide(g.player.x + 200, g.player.y)
  assert.equal(m.count, 3, '20 分钟后段战獒奔潮单次生成 3 只')
  m.crowds.cancel()
  m._enemies.length = 0

  // 第 5 波单王仍开决斗圈，第 35 波四王不开决斗圈
  m.wave = 5
  m.spawnBossGroup(getBossWavePlan(g.runSelection, 5))
  assert.equal(g.bossArena.active, true)
  g.bossArena.reset()
  m._clearCombatants()

  m.wave = 25
  m.spawnBossGroup(getBossWavePlan(g.runSelection, 25))
  assert.equal(g.bossArena.active, false)
  assert.equal(m.activeBossCount, 3)
  const captain = m._bosses.find((b) => b.bossMemberId === m._bossEncounter.captainId)
  for (const b of m._bosses.filter((b) => b !== captain)) {
    b.destroy()
    m.advanceBossEncounter(b)
  }
  assert.ok(g.endlessFormationBreakTimer > 7.9, '20 分钟限时破阵触发 8 秒追击窗口')
  dispose(g)
  ok('割草密度、后段三只奔潮、决斗圈边界与 20 分钟限时破阵追击生效')
}

// 4. 经验曲线、技能等级与攻击斜率
{
  const totalXpTo = (targetLevel, mode) => {
    let threshold = STARTING_EXP_THRESHOLD
    let sum = 0
    for (let lv = 2; lv <= targetLevel; lv++) {
      sum += threshold
      threshold = getNextExpThreshold(threshold, lv, mode)
    }
    return sum
  }
  assert.equal(totalXpTo(14, 'timed20'), totalXpTo(14, 'timed'), '前 14 级保持完全一致的引导曲线')
  const xp12 = totalXpTo(36, 'timed')
  const xp20 = totalXpTo(36, 'timed20')
  assert.ok(xp20 < xp12 * 0.25, `20 分钟 36 级所需经验应大幅平缓（${xp20} vs ${xp12}）`)

  const g = createArena('origin')
  g.configureRun({ mode: 'timed20', difficulty: 'normal' })
  g.reset()
  g.player.level = 27
  const mul27 = g.weaponSystem.refreshLevelMultiplier()
  g.player.level = 38
  const mul38 = g.weaponSystem.refreshLevelMultiplier()
  assert.ok(Math.abs(mul27 - 1.08 ** 26) < 1e-9)
  assert.ok(mul38 > mul27 && mul38 < 1.08 ** 37, '27 级后等级攻击力按更缓和斜率增长')
  dispose(g)
  ok('20 分钟经验曲线平缓释放更多抽卡，且高等级攻击成长温和封控')
}

// 5. 高难 BOSS 曲线与黑市战力点 +20% 锚点
{
  const mod20 = getWaveModifiers({ mode: 'timed20', difficulty: 'normal' }, 20)
  const mod35 = getWaveModifiers({ mode: 'timed20', difficulty: 'normal' }, 35)
  assert.ok(mod35.bossHpMul > mod20.bossHpMul)
  assert.equal(mod35.bossPatternBonus, 2)
  assert.ok(
    getDifficultyBossHpMultiplier(DIFFICULTIES.hell, { mode: 'timed20' }, 41) >
    getDifficultyBossHpMultiplier(DIFFICULTIES.hell, { mode: 'timed' }, 25)
  )

  assert.equal(getPointsPerScore('timed'), 30)
  assert.equal(getPointsPerScore('timed20'), 50)
  const run12 = {
    mode: 'timed',
    difficulty: 'hard',
    result: 'victory',
    wave: 25,
    kills: 1500,
    devours: 60,
    eliteKills: 25,
    bossKills: 7,
    eventsCompleted: 4,
    finaleTime: 50,
  }
  const run20 = {
    mode: 'timed20',
    difficulty: 'hard',
    result: 'victory',
    wave: 41,
    kills: 3400,
    devours: 110,
    eliteKills: 50,
    bossKills: 15,
    eventsCompleted: 7,
    finaleTime: 70,
  }
  const bd12 = computeScoreBreakdown(run12)
  const bd20 = computeScoreBreakdown(run20)
  assert.equal(bd20.progress, 3900)
  assert.equal(bd20.victory, 6000)
  const pts12 = scoreToPoints(bd12.total, run12)
  const pts20 = scoreToPoints(bd20.total, run20)
  const ratio = pts20 / pts12
  assert.ok(ratio >= 1.1 && ratio <= 1.35, `20 分钟战力点增幅应控制在 +20% 附近（实际 ${pts12} → ${pts20}，×${ratio.toFixed(2)}）`)
  ok(`20 分钟黑市战力点经济锚定在 +20% 区间（困难参考 ${pts12} → ${pts20} 点）`)
}

console.log(`\n20 分钟限时模式专项通过：${n} 组断言 ✓`)
