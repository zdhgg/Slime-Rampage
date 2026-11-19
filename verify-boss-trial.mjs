/**
 * 终局审判验收（P0 收尾）：登场名片 × 终局三问。
 *
 * 名片：把「⚠️ 骑士王 出现了！」升级成压力轴预告，所以必须逐类型可读、且互不重复。
 * 三问：终审勇者每打满三轮强招插一问，答对才有 2s 破绽，答错只扣血——
 * 「乱答换输出窗口」这条路必须被堵死。
 */
import assert from 'node:assert/strict'
import { createArena, spawnBoss, dispose } from './test-support/arena-fixture.mjs'

let passed = 0
function ok(name) {
  passed++
  console.log(`  ✓ ${name}`)
}

// ── 1. 登场名片：四名主战场首领各有一行预告，且互不重复 ──
{
  const game = createArena()
  const seen = new Set()
  for (const type of ['boss-knight', 'boss-mage', 'boss-archer', 'boss-final']) {
    const boss = spawnBoss(game, 300, type)
    assert.ok(boss.briefing, `${type} 必须有登场名片`)
    assert.ok(boss.briefing.includes('轴') || boss.briefing.includes('轮转'), `${type} 名片应写明压力轴`)
    assert.ok(!seen.has(boss.briefing), `${type} 名片不能与其他首领重复`)
    seen.add(boss.briefing)
    assert.ok(!boss.briefing.includes('\n'), '名片必须单行（HUD toast 是一行）')
  }
  // 远征首领不占主战场那三条轴
  const expedition = spawnBoss(game, 300, 'boss-expedition')
  assert.ok(expedition.briefing.startsWith('远征'), '远征首领名片走自己的口径')
  dispose(game)
  ok('登场名片：四名主战场首领各自可读且互不重复，远征走独立口径')
}

// ── 2. 三问只在终审勇者身上出现，且每四段强招一问 ──
{
  const game = createArena()
  const finalBoss = spawnBoss(game, 300, 'boss-final')
  finalBoss.specialCd = 0
  finalBoss.specialState = 'idle'
  finalBoss.update(0.016)
  assert.notEqual(finalBoss.specialPattern, 'final-quiz', '第一次强招仍是常规三段之一')
  finalBoss.specialState = 'idle'
  finalBoss._specialCount = 3
  finalBoss.specialCd = 0
  finalBoss.update(0.016)
  assert.equal(finalBoss.specialPattern, 'final-quiz', '第 4 段强招改出题')
  assert.ok(finalBoss._quiz, '出题必须留下题面快照')
  assert.equal(finalBoss.specialState, 'telegraph')

  // 普通骑士王即使打到第 4 段也不会出题
  const knight = spawnBoss(game, 300, 'boss-knight')
  knight.specialCd = 0
  knight.specialState = 'idle'
  knight._specialCount = 3
  knight.update(0.016)
  assert.equal(knight.specialPattern, 'boss-knight', '三问不外溢到其他首领')
  dispose(game)
  ok('触发面：只有终审勇者出题，且节奏是「三段常规 + 一问」')
}

// ── 3. 三道题的判题与赏罚：答对 2s 破绽、答错 2 点、零破绽 ──
{
  const game = createArena()
  const boss = spawnBoss(game, 300, 'boss-final')
  const player = game.player

  const castQuiz = (kindIdx) => {
    if (kindIdx !== undefined) boss._quizIndex = kindIdx
    boss._specialCount = 3
    boss.specialCd = 0
    boss.specialState = 'idle'
    boss.hp = boss.maxHp
    boss.vulnerableTimer = 0
    player.hp = player.maxHp
    player.invincible = 0
    player.dead = false
    player.vx = 0
    player.vy = 0
    player.x = boss.x + 10
    player.y = boss.y
    boss.update(0.016)
    assert.equal(boss.specialPattern, 'final-quiz')
    return boss._quiz
  }
  const answerAt = (dx, dy) => {
    player.x = boss.x + dx
    player.y = boss.y + dy
    boss.update(boss.specialDuration + 0.01) // 判题
  }

  // 题 1 · 净化之环：环心安全、环带受伤、环外安全
  castQuiz(0)
  assert.equal(boss._quiz.kind, 'annulus')
  answerAt(0, 0)
  assert.equal(player.hp, player.maxHp, '站进环心不吃伤害')
  assert.equal(boss.vulnerableTimer, 2, '答对给 2s 破绽')
  assert.equal(boss.specialState, 'recover')
  assert.equal(boss._quiz, null, '结算后题面清空，不会重复判题')

  castQuiz(0)
  answerAt(220, 0) // 150 < d <= 330：环带
  assert.equal(player.hp, player.maxHp - 2, '站在环带上挨 2 点')
  assert.equal(boss.vulnerableTimer, 0, '答错不给破绽')

  castQuiz(0)
  answerAt(400, 0) // 跑出环外
  assert.equal(player.hp, player.maxHp, '跑出环外算答对')
  assert.equal(boss.vulnerableTimer, 2)

  // 题 2 · 封印四象限：只有一格没被封
  const q2 = castQuiz(1)
  assert.equal(q2.kind, 'quadrant')
  const safeAngle = -Math.PI + (q2.safeQuadrant + 0.5) * Math.PI / 2
  answerAt(Math.cos(safeAngle) * 180, Math.sin(safeAngle) * 180)
  assert.equal(player.hp, player.maxHp, '站在没被封的象限里安全')
  assert.equal(boss.vulnerableTimer, 2)
  const q2b = castQuiz(1)
  const wrongAngle = -Math.PI + (((q2b.safeQuadrant + 2) % 4) + 0.5) * Math.PI / 2
  answerAt(Math.cos(wrongAngle) * 180, Math.sin(wrongAngle) * 180)
  assert.equal(player.hp, player.maxHp - 2, '站在被封的象限里挨 2 点')
  assert.equal(boss.vulnerableTimer, 0)

  // 题 3 · 王庭棋盘：只有中间那道带亮着
  const q3 = castQuiz(2)
  assert.equal(q3.kind, 'chess')
  answerAt(180, 0) // 120~240：安全带
  assert.equal(player.hp, player.maxHp, '站对同心带算答对')
  assert.equal(boss.vulnerableTimer, 2)
  castQuiz(2)
  answerAt(300, 0) // 240~360：危险带
  assert.equal(player.hp, player.maxHp - 2)
  assert.equal(boss.vulnerableTimer, 0)

  // 三题循环：不会出现第四种题
  const again = castQuiz()
  assert.equal(again.kind, 'annulus', '三题循环')
  assert.equal(again.round, 1)
  dispose(game)
  ok('三问判题：环里/环外、唯一开放象限、亮着的那道带；答对 2s 破绽、答错 2 点零破绽')
}

// ── 4. 打断与身死：题面不会残留到下一段 ──
{
  const game = createArena()
  const boss = spawnBoss(game, 300, 'boss-final')
  boss._specialCount = 3
  boss.specialCd = 0
  boss.specialState = 'idle'
  boss.update(0.016)
  assert.ok(boss._quiz)
  boss.cancelAttack()
  assert.equal(boss._quiz, null, '打断（冻结/转阶段/死亡）必须清题面')
  dispose(game)
  ok('打断：题面随 cancelAttack 清空，不会带着旧题结算')
}

dispose.cleanup?.()
console.log(`\n${passed} 组断言通过`)
