// 无尽灾变与撤离：词条叠加、决策顺序、奖励保留率和榜单结果。
// 运行：node verify-endless-decisions.mjs
import assert from 'node:assert/strict'

import {
  ENDLESS_FORMATION_BREAK_DURATION,
  ENDLESS_FORMATION_BREAK_ATTACK_INTERVAL_MUL,
  ENDLESS_FORMATION_BREAK_SPEED_MUL,
  getEndlessBountyChoices,
  getEndlessModifiers,
  getEndlessRewardBonus,
  isEndlessCalamityWave,
  isEndlessExtractionWave,
  rollEndlessCalamityChoices,
} from './src/game/EndlessMode.js'
import { GameEngine } from './src/game/GameEngine.js'
import {
  calculateMaterialReward,
  getBossWavePlan,
  getRunProfile,
} from './src/game/RunRules.js'
import { defaultSave, pushScore } from './src/game/SaveManager.js'

let n = 0
const ok = (message) => console.log(`  ✓ ${++n}. ${message}`)
const endless = { mode: 'endless', difficulty: 'normal' }

assert.equal(isEndlessExtractionWave(10), true)
assert.equal(isEndlessExtractionWave(25), false)
assert.equal(isEndlessCalamityWave(25), true)
assert.equal(isEndlessCalamityWave(20), false)
const choices = rollEndlessCalamityChoices({}, 3, () => 0.37)
assert.equal(choices.length, 3)
assert.equal(new Set(choices.map((choice) => choice.id)).size, 3)
ok('第 10 波起每十波出现撤离点，第 25 波起每五波抽取三个不重复灾变')

const modifiers = getEndlessModifiers({
  iron_legion: 2,
  forced_march: 9,
  war_drums: 9,
  elite_decree: 9,
  royal_reserves: 3,
})
assert.ok(Math.abs(modifiers.enemyHpMul - 1.36) < 1e-9)
assert.equal(modifiers.spawnPressureMul, 1.6)
assert.equal(modifiers.attackTempoMul, 1.4)
assert.equal(modifiers.eliteChanceBonus, 0.15)
assert.ok(Math.abs(modifiers.bossHpMul - 1.45) < 1e-9)
assert.equal(modifiers.bossExtraMembers, 2)
assert.equal(getBossWavePlan(endless, 45, modifiers.bossExtraMembers).total, 8)
ok('灾变按等级叠加，刷怪/攻速/精英率受控封顶，王级后备把六人团扩到八人')

assert.equal(calculateMaterialReward(100, endless, { result: 'extracted', endlessRewardBonus: 0.3 }), 130)
assert.equal(calculateMaterialReward(100, endless, { result: 'defeat', endlessRewardBonus: 0.3 }), 91)
assert.equal(calculateMaterialReward(100, { mode: 'timed', difficulty: 'hard' }, { result: 'defeat', endlessRewardBonus: 1 }), 125)
ok('无尽安全撤离完整结算，战败保留 70%，其他模式不受无尽规则污染')

const firstBounties = getEndlessBountyChoices(1)
const deepBounties = getEndlessBountyChoices(20)
assert.deepEqual(firstBounties.map((entry) => entry.target), [90, 12, 8])
assert.deepEqual(deepBounties.map((entry) => entry.target), [180, 30, 20])
assert.ok(firstBounties.every((entry) => entry.reward === '王级秘籍三选一'))
ok('继续深入提供清剿/吞噬/精英三类悬赏，目标随深度成长并有明确上限')

assert.equal(ENDLESS_FORMATION_BREAK_DURATION, 8)
assert.equal(ENDLESS_FORMATION_BREAK_ATTACK_INTERVAL_MUL, 0.8)
assert.equal(ENDLESS_FORMATION_BREAK_SPEED_MUL, 1.15)
ok('首领阵型破解后只提供 8 秒局内追击，不改变素材结算倍率')

function createDirector() {
  const director = Object.create(GameEngine.prototype)
  Object.assign(director, {
    runSelection: endless,
    runProfile: getRunProfile(endless),
    endlessCalamities: {},
    endlessContinues: 0,
    _pendingEndlessWave: 0,
    _endlessDecisionKind: null,
    _endlessChoices: [],
    endlessBounty: null,
    endlessBountiesCompleted: 0,
    _pendingEndlessBountyReward: false,
    _pauseLock: 0,
    elapsed: 300,
    weaponSystem: { drops: { knight: 100 }, kills: 200, devours: 20, eliteKills: 10 },
    enemyManager: { beginWave(wave) { director.beganWave = wave } },
    onEndlessDecision(payload) { director.decisions.push(payload) },
    onRunState(payload) { director.runEvents.push(payload) },
    decisions: [],
    runEvents: [],
    cooldowns: [],
    pause() { director.pauses = (director.pauses || 0) + 1 },
    resume() { director.resumes = (director.resumes || 0) + 1 },
    openFreeSkillPanel() { director.tomePanels = (director.tomePanels || 0) + 1 },
    _pushStats() {},
    _pushCooldown() { director.cooldowns.push(director.endlessFormationBreakTimer) },
  })
  return director
}

const director = createDirector()
assert.equal(director.triggerEndlessFormationBreak({ id: 'blood_oath', name: '血誓截断' }), true)
assert.equal(director.endlessFormationBreakTimer, 8)
director._updateEndlessFormationBreak(2.5)
assert.equal(director.endlessFormationBreakTimer, 5.5)
assert.deepEqual(director.runEvents[0], {
  kind: 'formation-break',
  id: 'blood_oath',
  name: '血誓截断',
  duration: ENDLESS_FORMATION_BREAK_DURATION,
})
ok('破阵追击计时可暂停式递减，并通过事件桥接到 HUD')
assert.equal(director.handleWaveAdvanced(30), true)
assert.equal(director.decisions[0].kind, 'checkpoint')
assert.equal(director.decisions[0].safeLoot, 100)
assert.equal(director.decisions[0].defeatLoot, 70)
assert.equal(director.resolveEndlessCheckpoint('continue'), true)
assert.equal(director.decisions[1].kind, 'bounty')
assert.equal(director.endlessContinues, 1)
const bounty = director.decisions[1].choices[0]
assert.equal(director.resolveEndlessBounty(bounty.id), true)
assert.equal(director.decisions[2].kind, 'calamity')
const picked = director.decisions[2].choices[0]
assert.equal(director.resolveEndlessCalamity(picked.id), true)
assert.equal(director.endlessCalamities[picked.id], 1)
assert.equal(director.beganWave, 30)
assert.equal(director.resumes, 1)
assert.ok(getEndlessRewardBonus(director.endlessCalamities, director.endlessContinues) > 0.15)
ok('重叠节点严格按撤离抉择 → 深层悬赏 → 灾变三选一 → 第 30 波开战执行')

director.weaponSystem.kills += bounty.target
director.elapsed += 30
director._updateEndlessBounty()
assert.equal(director.endlessBounty, null)
assert.equal(director.endlessBountiesCompleted, 1)
assert.equal(director.tomePanels, 1)
assert.equal(director.runEvents.at(-1).kind, 'bounty-complete')
director._updateEndlessBounty()
assert.equal(director.tomePanels, 1)
ok('悬赏按统计基线结算，完成后只发放一次王级秘籍选择')

const queuedBounty = createDirector()
queuedBounty.endlessBounty = {
  ...getEndlessBountyChoices(1)[0],
  baseline: queuedBounty.weaponSystem.kills,
  startedAt: queuedBounty.elapsed,
}
queuedBounty.weaponSystem.kills += queuedBounty.endlessBounty.target
queuedBounty._pauseLock = 1
queuedBounty._updateEndlessBounty()
assert.equal(queuedBounty._pendingEndlessBountyReward, true)
assert.equal(queuedBounty.tomePanels, undefined)
GameEngine.prototype.resume.call(queuedBounty)
assert.equal(queuedBounty._pendingEndlessBountyReward, false)
assert.equal(queuedBounty.tomePanels, 1)
ok('其他面板持有暂停锁时，悬赏奖励排队到面板关闭后再打开')

const failedBounty = createDirector()
failedBounty.handleWaveAdvanced(20)
failedBounty.resolveEndlessCheckpoint('continue')
failedBounty.resolveEndlessBounty('elite_hunt')
failedBounty.elapsed += 91
failedBounty._updateEndlessBounty()
assert.equal(failedBounty.endlessBounty, null)
assert.equal(failedBounty.tomePanels, undefined)
assert.equal(failedBounty.runEvents.at(-1).kind, 'bounty-failed')
ok('悬赏超时会安静失效，不发放秘籍也不影响当前战斗')

const extraction = createDirector()
extraction.finishRun = (result) => { extraction.finishedAs = result }
assert.equal(extraction.handleWaveAdvanced(20), true)
assert.equal(extraction.resolveEndlessCheckpoint('extract'), true)
assert.equal(extraction.finishedAs, 'extracted')
assert.equal(extraction.beganWave, undefined)
ok('撤离会以 extracted 结束本局，且不会在结算面板背后生成下一波')

const save = defaultSave()
const scored = pushScore(save, endless, {
  result: 'extracted',
  wave: 30,
  kills: 200,
  time: 600,
})
assert.equal(scored.entry.result, 'extracted')
assert.equal(scored.board[0].result, 'extracted')
ok('无尽排行榜保留安全撤离结果，可与战败记录明确区分')

console.log(`\n无尽决策验证完成，共 ${n} 项。`)
