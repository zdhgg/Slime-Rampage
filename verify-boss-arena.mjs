/**
 * 决斗圈 P0 验证（限时第 5 波骑士王）：
 * 激活门槛 / 圈半径与跟随 / 出界宽限与灼烧节奏 / 难度倍率 /
 * 狂暴触发阈值与一次性 / 狂暴参数生效（攻速·连段·破绽·增伤·冷却）/
 * 冲锋落地夹击（固定 2 伤）/ BOSS 死亡消散 / 重开归零。
 */
import assert from 'node:assert/strict'
import { createArena, spawnBoss, dispose, ctx2d } from './test-support/arena-fixture.mjs'
import { DUEL_ARENA, DUEL_ARENA_DEBUG, DUEL_ARENA_RULES } from './src/game/BossArena.js'
import { getRunProfile, getBossWavePlan, getExpeditionBoss } from './src/game/RunRules.js'

let passed = 0
function ok(name) {
  passed++
  console.log(`  ✓ ${name}`)
}

/** 手动推进决斗圈与玩家无敌帧（测试不走主循环） */
function stepArena(game, seconds, dt = 0.05) {
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    game.bossArena.update(dt)
    game.player.invincible = Math.max(0, game.player.invincible - dt)
  }
}

function setDifficulty(game, difficulty) {
  game.runSelection = { mode: 'timed', difficulty }
  game.runProfile = getRunProfile(game.runSelection)
}

// ── 1. 激活门槛（规则清单：按模式 + 单体 + 非复合 + 非边防官） ──
{
  const game = createArena()
  const boss = spawnBoss(game, 300, 'boss-knight') // fixture：wave=5、单体、timed/normal
  assert.equal(game.bossArena.activate(boss), true, '限时第 5 波骑士王应激活决斗圈')
  assert.equal(boss.duelArena, game.bossArena)
  assert.equal(game.bossArena.rageEnabled, true)
  assert.equal(game.bossArena.pincerEnabled, true)
  assert.equal(game.bossArena.burnDamage, 1)
  dispose(game)
  ok('限时第 5 波骑士王激活（普通：圈+狂暴+夹击全量）')
}
{
  const game = createArena()
  const arena = game.bossArena
  const knight15 = spawnBoss(game, 300, 'boss-knight')
  knight15.wave = 15
  assert.equal(arena.activate(knight15), false, '限时第 15 波（编队波）不激活')
  const composite = spawnBoss(game, 300, 'boss-final')
  assert.equal(arena.activate(composite), false, '复合首领不激活')
  const knight5 = spawnBoss(game, 300, 'boss-knight')
  knight5.bossGroupSize = 2
  assert.equal(arena.activate(knight5), false, '编队成员不激活')
  knight5.bossGroupSize = 1
  DUEL_ARENA_DEBUG.enabled = false
  assert.equal(arena.activate(knight5), false, '调试开关关闭时不激活')
  DUEL_ARENA_DEBUG.enabled = true
  assert.equal(arena.active, false)
  dispose(game)
  ok('通用排除：编队/复合首领/调试开关')
}

// ── 1b. 每种模式的第一只/主要 BOSS 都能挂圈（真实生成路径） ──
{
  // 限时第 5 波：骑士王（编队管线，groupTotal=1）
  const g1 = createArena()
  g1.enemyManager.wave = 5
  const [knight] = g1.enemyManager.spawnBossGroup(getBossWavePlan(g1.runSelection, 5))
  assert.equal(g1.bossArena.active, true)
  assert.equal(g1.bossArena.boss, knight)
  assert.equal(knight.type, 'boss-knight')
  assert.equal(knight.maxHp, 270, '限时第 5 波 HP=300×0.9（成员系数）')
  dispose(g1)

  // 限时第 10 波：大法师（单体，圈+狂暴生效；无冲锋故无夹击）
  const g2 = createArena()
  g2.enemyManager.wave = 10
  const [mage] = g2.enemyManager.spawnBossGroup(getBossWavePlan(g2.runSelection, 10))
  assert.equal(g2.bossArena.active, true, '限时第 10 波大法师应挂圈')
  assert.equal(mage.maxHp, 460, '限时第 10 波 HP=(100+100)×2.3×1')
  dispose(g2)

  // 无尽第 5 波：单体首领
  const g3 = createArena()
  g3.runSelection = { mode: 'endless', difficulty: 'normal' }
  g3.runProfile = getRunProfile(g3.runSelection)
  g3.enemyManager.wave = 5
  const [eBoss] = g3.enemyManager.spawnBossGroup(getBossWavePlan(g3.runSelection, 5))
  assert.equal(g3.bossArena.active, true, '无尽第 5 波单体首领应挂圈')
  assert.equal(eBoss.maxHp, 300, '无尽第 5 波 HP=(100+50)×2（成长已补齐）')
  dispose(g3)

  // 远征第 2 章：信标术士（章节首领 → 挂圈）
  const g4 = createArena()
  g4.runSelection = { mode: 'expedition', difficulty: 'normal' }
  g4.runProfile = getRunProfile(g4.runSelection)
  g4.expeditionStage = 2
  const beacon = g4.enemyManager.beginExpeditionStageBoss(getExpeditionBoss('beacon_engineer'))
  assert.equal(g4.bossArena.active, true, '远征章节首领应挂圈')
  assert.equal(beacon.encounter.id, 'beacon_engineer')
  dispose(g4)

  // 远征第 1 章：边防官（独立 AI 体系 → 挂圈但按自身体系适配参数，不开狂暴/夹击）
  const g5 = createArena()
  g5.runSelection = { mode: 'expedition', difficulty: 'normal' }
  g5.runProfile = getRunProfile(g5.runSelection)
  g5.expeditionStage = 1
  const warden = g5.enemyManager.beginExpeditionStageBoss(getExpeditionBoss('border_warden'))
  assert.equal(g5.bossArena.active, true, '边防官应挂圈（远征第 1 章主 BOSS）')
  assert.equal(g5.bossArena.boss, warden)
  assert.equal(g5.bossArena.radius, 640, '边防官圈半径按冲锋位移适配')
  assert.equal(g5.bossArena.followSpeed, 180, '圈心跟随速度按追击速度适配')
  assert.equal(g5.bossArena.rageEnabled, false, '独立 AI 不开决斗狂暴')
  assert.equal(g5.bossArena.pincerEnabled, false, '独立 AI 不开决斗夹击')
  assert.equal(warden.maxHp, 314, '远征第 1 章 HP=(100+130)×0.62×2.2（上一论调整已生效）')
  dispose(g5)

  // 限时第 15 波：双首领编队 → 不挂圈
  const g6 = createArena()
  g6.enemyManager.wave = 15
  g6.enemyManager.spawnBossGroup(getBossWavePlan(g6.runSelection, 15))
  assert.equal(g6.bossArena.active, false, '双首领编队不挂圈')
  dispose(g6)

  assert.ok(DUEL_ARENA_RULES.length >= 3, '规则清单可按模式扩展')
  ok('模式覆盖：限时 5/10 波、无尽单体、远征章节首领（含第 1 章边防官）挂圈；编队/终局不挂圈')
}

// ── 1c. 边防官：挂圈但不触发狂暴/夹击，冲锋位移不灼烧贴身玩家 ──
{
  const game = createArena()
  game.runSelection = { mode: 'expedition', difficulty: 'normal' }
  game.runProfile = getRunProfile(game.runSelection)
  game.expeditionStage = 1
  const boss = game.enemyManager.beginExpeditionStageBoss(getExpeditionBoss('border_warden'))
  const arena = game.bossArena
  assert.equal(arena.active, true)
  const p = game.player

  // 满冲锋位移 600px：BOSS 与贴身玩家仍在 640 圈内，不触发灼烧
  boss.x = arena.cx + 600
  boss.y = arena.cy
  p.x = boss.x - 40
  p.y = boss.y
  const hp0 = p.hp
  stepArena(game, 1.5)
  assert.equal(p.hp, hp0, '满冲锋后贴身玩家不受灼烧')
  // 圈心以 180px/s 回归：1.5s 后已追近 270px
  assert.ok(Math.abs(arena.cx - (boss.x - 330)) < 1e-6, `圈心按 180px/s 跟随（cx=${arena.cx}）`)
  stepArena(game, 2.5) // 累计约 4s：完全追上
  assert.equal(arena.cx, boss.x)

  // 残血 20%：不触发决斗狂暴，圈不收、体型不变
  const radiusBefore = boss.radius
  boss.hit(boss.maxHp * 0.85)
  assert.ok(boss.hp / boss.maxHp <= 0.25)
  assert.equal(boss._duelRage, false, '边防官 25% 不触发决斗狂暴')
  assert.equal(boss.radius, radiusBefore, '无狂暴体型变化')
  assert.equal(arena.radius, 640, '无狂暴收圈')
  assert.equal(arena.redFlash, 0, '无狂暴红闪')

  // 夹击门控：即使直接调用（边防官 type 同为 boss-knight）也不生效
  p.invincible = 0
  boss.lockedAngle = 0
  boss.x = p.x - 100
  boss.y = p.y
  boss._duelPincer()
  assert.equal(p.hp, hp0, '边防官不触发决斗夹击')
  assert.ok(!boss._pincerFx, '无夹击闪光')
  dispose(game)
  ok('边防官：挂圈不开狂暴/夹击，满冲锋位移不灼烧贴身玩家')
}
// ── 1d. 边防官机制强化：不与决斗圈形成双重惩罚；难度分档生效 ──
{
  const game = createArena()
  game.runSelection = { mode: 'expedition', difficulty: 'normal' }
  game.runProfile = getRunProfile(game.runSelection)
  game.expeditionStage = 1
  const boss = game.enemyManager.beginExpeditionStageBoss(getExpeditionBoss('border_warden'))
  const arena = game.bossArena
  const p = game.player
  assert.equal(arena.active, true)
  assert.equal(boss._mechTier, 1, '普通档启用机制强化')
  const stepAll = (seconds, dt = 1 / 60) => {
    for (let t = 0; t < seconds - 1e-9; t += dt) {
      boss.update(dt)
      arena.update(dt)
      p.invincible = Math.max(0, p.invincible - dt)
    }
  }

  // 圈内满冲锋（真实命中管线）：直中 2 伤害；落点残留被 0.5s 受击无敌帧挡下；
  // 圈内无灼烧——整套最坏情况 = 2 伤害，不构成“招+圈”双惩致死
  boss.x = p.x - 480; boss.y = p.y; boss.facing = 0
  arena.cx = p.x; arena.cy = p.y
  p.hp = 4 // 低血量边界：也不被单套连招秒杀
  boss._startSpecial()
  assert.equal(boss._cast.kind, 'charge')
  let sawHazard = false
  for (let i = 0; i < 200; i++) { stepAll(1 / 60); if (boss._hazards.length) sawHazard = true }
  assert.ok(sawHazard, '普通档冲锋落点生成残留危险区')
  assert.equal(p.hp, 2, '整套冲锋最坏 2 伤害（直中），残留被无敌帧挡下、圈内无灼烧')
  assert.equal(p.dead, false, '低血量玩家不被冲锋+落点+圈组合秒杀')
  assert.ok(boss.x - arena.cx < 640, '满冲锋后 BOSS 仍在圈内（无双惩来源）')

  // 圈外：灼烧节奏独立，不受受击/残留影响
  boss.freeze = 10 // 冻结 BOSS 动作，隔离灼烧节律
  p.hp = 100
  p.x = arena.cx + arena.radius + 120; p.y = arena.cy
  const burns = []
  const realHit = p.hit.bind(p)
  p.hit = (d, e) => { if (e?.zoneBurn) burns.push(arena.outTime); return realHit(d, e) }
  stepAll(2)
  assert.ok(burns.length >= 3, '圈外灼烧按自身节奏持续')
  assert.ok(Math.abs(burns[0] - DUEL_ARENA.graceTime) < 0.06, '首次灼烧在 0.8s 宽限后')
  for (let i = 1; i < burns.length; i++)
    assert.ok(Math.abs(burns[i] - burns[i - 1] - DUEL_ARENA.tickInterval) < 0.06, '灼烧间隔固定 0.5s，不被受击/残留改变')
  dispose(game)
  ok('边防官强化机制与圈不双惩：整套最坏 2 伤害，灼烧节奏独立')
}
{
  // 简单档：边防官机制强化全部关闭，圈仅作软结界
  const game = createArena()
  game.runSelection = { mode: 'expedition', difficulty: 'easy' }
  game.runProfile = getRunProfile(game.runSelection)
  game.expeditionStage = 1
  const boss = game.enemyManager.beginExpeditionStageBoss(getExpeditionBoss('border_warden'))
  const p = game.player
  assert.equal(game.bossArena.active, true, '简单档仍挂圈')
  assert.equal(game.bossArena.burnDamage, 1)
  assert.equal(boss._mechTier, 0, '简单档机制强化关闭')
  boss.x = p.x - 480; boss.y = p.y; boss.facing = 0
  boss._startSpecial()
  const cast = boss._cast
  p.y += 300 // 让开冲锋线
  for (let i = 0; i < 180; i++) boss.update(1 / 60)
  assert.equal(boss._hazards.length, 0, '简单档冲锋无落点残留')
  assert.equal(cast.angle, 0, '简单档预警全程锁定不跟踪')
  assert.equal(boss._flank, null, '简单档无二段判定')
  dispose(game)
  ok('难度分档：简单档保持现状（圈在、强化关）')
}
{
  const game = createArena()
  game.enemyManager.wave = 5
  const boss = game.enemyManager.spawnBoss({ type: 'boss-knight' })
  assert.equal(game.bossArena.active, true, 'EnemyManager.spawnBoss 应自动挂接决斗圈')
  assert.equal(game.bossArena.boss, boss)
  dispose(game)
  ok('真实生成路径（spawnBoss）自动激活')
}

// ── 2. 圈半径与跟随 ──────────────────────────────────────────
{
  const game = createArena()
  const boss = spawnBoss(game, 300, 'boss-knight')
  const arena = game.bossArena
  arena.activate(boss)
  assert.equal(arena.radius, DUEL_ARENA.radius)
  assert.equal(arena.cx, boss.x)
  assert.equal(arena.cy, boss.y)
  boss.x += 100 // BOSS 离开圈心 100px
  arena.update(0.5) // 40px/s × 0.5s = 20px
  const dist = Math.hypot(boss.x - arena.cx, boss.y - arena.cy)
  assert.ok(Math.abs(dist - 80) < 1e-6, `圈心应跟随 20px（剩余 ${dist}）`)
  stepArena(game, 5) // 足够时间追上
  assert.equal(arena.cx, boss.x)
  assert.equal(arena.cy, boss.y)
  dispose(game)
  ok('圈半径 520，圈心以 40px/s 跟随 BOSS')
}

// ── 3. 出界宽限与灼烧节奏 ────────────────────────────────────
{
  const game = createArena()
  const boss = spawnBoss(game, 300, 'boss-knight')
  const arena = game.bossArena
  arena.activate(boss)
  const p = game.player
  p.x = arena.cx + arena.radius + 150 // 稳稳出界
  p.y = arena.cy
  const hp0 = p.hp
  stepArena(game, 0.7)
  assert.equal(p.hp, hp0, '0.8s 宽限内不掉血')
  stepArena(game, 0.35) // 累计 1.05s：越过 0.8s 第一跳
  assert.equal(hp0 - p.hp, 1, '0.8s 后第一跳扣 1')
  stepArena(game, 0.5) // 累计 1.55s：1.3s 第二跳
  assert.equal(hp0 - p.hp, 2, '之后每 0.5s 一跳')
  stepArena(game, 0.5) // 累计 2.05s：1.8s 第三跳
  assert.equal(hp0 - p.hp, 3, '灼烧节奏稳定 0.5s/跳')
  dispose(game)
  ok('出界 0.8s 宽限，之后每 0.5s 扣 1 血')
}
{
  // 宽限重置：被击退出圈立刻跑回，不欠跳；再出界重新计宽限
  const game = createArena()
  const boss = spawnBoss(game, 300, 'boss-knight')
  const arena = game.bossArena
  arena.activate(boss)
  const p = game.player
  p.x = arena.cx + arena.radius + 150
  p.y = arena.cy
  const hp0 = p.hp
  stepArena(game, 0.5)
  p.x = arena.cx // 回圈
  stepArena(game, 0.2)
  assert.equal(p.hp, hp0, '宽限内回圈不掉血')
  p.x = arena.cx + arena.radius + 150
  stepArena(game, 0.7)
  assert.equal(p.hp, hp0, '再出界宽限重新计满 0.8s')
  stepArena(game, 0.35)
  assert.equal(hp0 - p.hp, 1)
  dispose(game)
  ok('回圈即重置宽限（击退瞬出圈不会被秒判）')
}
{
  // 玩家死在界外：圈不再补刀
  const game = createArena()
  const boss = spawnBoss(game, 300, 'boss-knight')
  const arena = game.bossArena
  arena.activate(boss)
  const p = game.player
  p.dead = true
  p.x = arena.cx + arena.radius + 150
  const hp0 = p.hp
  stepArena(game, 2)
  assert.equal(p.hp, hp0)
  dispose(game)
  ok('玩家死亡后灼烧停止')
}

// ── 4. 难度分档 ──────────────────────────────────────────────
{
  const game = createArena()
  setDifficulty(game, 'hard')
  const boss = spawnBoss(game, 300, 'boss-knight')
  const arena = game.bossArena
  arena.activate(boss)
  assert.equal(arena.burnDamage, 1.5, '困难灼烧 ×1.5')
  const p = game.player
  p.x = arena.cx + arena.radius + 150
  p.y = arena.cy
  const hp0 = p.hp
  stepArena(game, 1.05)
  assert.equal(hp0 - p.hp, 1.5, '困难每跳 1.5')
  // 狂暴连段 +2（困难）
  p.x = arena.cx
  p.invincible = 0
  boss.hit(boss.maxHp * 0.8)
  assert.equal(boss._duelRage, true)
  assert.equal(boss._duelChainBonus, 2, '困难狂暴连段再 +1')
  boss.phase = 2
  boss._startSpecial()
  assert.equal(boss._chainTotal, 4, '困难：基础 2 + 狂暴 2 = 4 段')
  dispose(game)
  ok('困难：灼烧 ×1.5、狂暴连段 +2')
}
{
  const game = createArena()
  setDifficulty(game, 'hell')
  const boss = spawnBoss(game, 300, 'boss-knight')
  const arena = game.bossArena
  arena.activate(boss)
  assert.equal(arena.burnDamage, 2, '地狱灼烧 ×2')
  boss.hit(boss.maxHp * 0.8)
  assert.equal(boss._duelRage, true)
  assert.ok(Math.abs(arena.radius - DUEL_ARENA.radius * 0.78) < 1e-9, '地狱狂暴缩圈 22%（×0.78）')
  dispose(game)
  ok('地狱：灼烧 ×2、狂暴缩圈 ×0.78')
}
{
  const game = createArena()
  setDifficulty(game, 'easy')
  const boss = spawnBoss(game, 300, 'boss-knight')
  const arena = game.bossArena
  arena.activate(boss)
  assert.equal(arena.active, true, '简单仍开圈')
  assert.equal(arena.rageEnabled, false, '简单不开狂暴')
  assert.equal(arena.pincerEnabled, false, '简单不开夹击')
  boss.hit(boss.maxHp * 0.8)
  assert.equal(boss._duelRage, false, '简单 25% 不触发狂暴')
  dispose(game)
  ok('简单：只留圈，不开狂暴与夹击')
}

// ── 5. 狂暴触发：阈值、一次性、参数生效 ──────────────────────
{
  const game = createArena()
  const boss = spawnBoss(game, 300, 'boss-knight')
  const arena = game.bossArena
  arena.activate(boss)
  const before = { radius: boss.radius, attackInterval: boss.attackInterval, damage: boss.damage }

  boss.hit(boss.maxHp * 0.3) // 70%：只触发 75% 增援，不触发狂暴
  assert.equal(boss._reinforced, true, '75% 增援不受影响')
  assert.equal(boss._duelRage, false, '70% 不触发狂暴')

  boss.hit(boss.maxHp * 0.5) // 20%：触发狂暴
  assert.equal(boss._duelRage, true, '25% 触发狂暴')
  assert.ok(Math.abs(boss.radius - before.radius * 1.08) < 1e-9, '体型 +8%')
  // 25% 同时触发既有「困兽之斗」(×0.88) 与狂暴(×0.75)
  assert.ok(Math.abs(boss.attackInterval - before.attackInterval * 0.88 * 0.75) < 1e-9, '攻速 ×0.88(困兽)×0.75(狂暴)')
  assert.equal(boss.damage, before.damage + 1, '狂暴伤害 +1')
  assert.ok(Math.abs(arena.radius - DUEL_ARENA.radius * 0.85) < 1e-9, '决斗圈再收 15%')
  assert.ok(arena.redFlash > 0, '全屏红闪已触发')

  const ragedRadius = boss.radius
  boss.hit(1) // 再次受击：一次性，不得重复叠乘
  assert.equal(boss.radius, ragedRadius, '狂暴一次性')
  assert.equal(boss.vulnerableMultiplier, 2.5, '狂暴破绽增伤 2.5×')

  // 狂暴参数：连段 +1（普通）、破绽窗口、强招冷却
  boss.phase = 2
  boss._startSpecial()
  assert.equal(boss._chainTotal, 3, '普通狂暴：基础 2 + 1 = 3 段')
  boss._chainStep = boss._chainTotal - 1 // 直接落末段收尾
  boss._beginRecovery(1.2)
  assert.ok(Math.abs(boss.specialTimer - (0.8 + 2 * 0.2)) < 1e-9, '狂暴破绽窗口 0.8s 起、每段 +0.2')
  assert.ok(Math.abs(boss.specialCd - 5 * 0.76 * 0.7) < 1e-9, '狂暴强招冷却 ×0.7')
  assert.equal(boss.vulnerableTimer, boss.specialTimer, '破绽窗口同步')
  dispose(game)
  ok('狂暴：阈值 25% 一次性，攻速/连段/破绽/增伤/冷却全部生效且 75% 增援保留')
}

// ── 6. 冲锋落地夹击 ──────────────────────────────────────────
{
  const game = createArena()
  const boss = spawnBoss(game, 300, 'boss-knight')
  const arena = game.bossArena
  arena.activate(boss)
  const p = game.player
  p.invincible = 0
  // 冲锋落地：玩家在扇形内（冲锋方向正前方 100px）
  boss.x = p.x - 100
  boss.y = p.y
  boss.lockedAngle = 0 // 朝 +x（玩家方向）
  boss.specialState = 'dash'
  boss.specialTimer = 0.01
  boss.dashHit = true // 本次只验证夹击，不吃冲锋撞击
  boss.dashChain = 0
  const hp0 = p.hp
  boss._updateKnightDash(0.02)
  assert.equal(hp0 - p.hp, 2, '夹击固定 2 伤')
  assert.ok(p.x > boss.x + 100, '夹击带击退')
  assert.equal(boss.specialState, 'recover', '落地后进入 recovery 分支')
  assert.ok(boss._pincerFx, '落地扇形闪光已挂出')
  dispose(game)
  ok('冲锋落地追加 120° 扇形夹击（2 伤 + 击退 + recovery）')
}
{
  const game = createArena()
  const boss = spawnBoss(game, 300, 'boss-knight')
  game.bossArena.activate(boss)
  const p = game.player
  // 扇形外（BOSS 背后）：位移反制成立
  boss.x = p.x + 100
  boss.y = p.y
  boss.lockedAngle = 0
  const hp0 = p.hp
  boss._duelPincer()
  assert.equal(p.hp, hp0, '扇形外不吃夹击')
  // 半径外
  boss.x = p.x - 250
  boss._duelPincer()
  assert.equal(p.hp, hp0, '200 半径外不吃夹击')
  dispose(game)
  ok('扇形外/半径外可反制（位移出区即安全）')
}
{
  // 狂暴期夹击仍是固定 2 伤（不吃狂暴 +1）
  const game = createArena()
  const boss = spawnBoss(game, 300, 'boss-knight')
  game.bossArena.activate(boss)
  boss.hit(boss.maxHp * 0.8)
  assert.equal(boss._duelRage, true)
  const p = game.player
  p.invincible = 0
  boss.x = p.x - 100
  boss.y = p.y
  boss.lockedAngle = 0
  const hp0 = p.hp
  boss._duelPincer()
  assert.equal(hp0 - p.hp, 2, '狂暴期夹击仍固定 2 伤')
  dispose(game)
  ok('夹击伤害固定 2，不吃狂暴加成')
}

// ── 7. BOSS 死亡消散 / 重开归零 ─────────────────────────────
{
  const game = createArena()
  const boss = spawnBoss(game, 300, 'boss-knight')
  const arena = game.bossArena
  arena.activate(boss)
  const p = game.player
  p.x = arena.cx + arena.radius + 150
  const hp0 = p.hp
  game.handleBossDefeated(boss) // BOSS 死亡：进入消散
  assert.ok(arena.dissolve > 0)
  stepArena(game, 1.2) // 消散期间不再灼烧
  assert.equal(p.hp, hp0, '消散期间停止灼烧')
  assert.equal(arena.active, false, '消散完毕圈归零')
  assert.equal(arena.boss, null)
  dispose(game)
  ok('BOSS 死亡 → 0.6s 消散 → 完全归零')
}
{
  const game = createArena()
  const boss = spawnBoss(game, 300, 'boss-knight')
  const arena = game.bossArena
  arena.activate(boss)
  game.reset() // 重开
  assert.equal(arena.active, false, '重开圈归零')
  assert.equal(arena.radius, DUEL_ARENA.radius)
  assert.equal(arena.outTime, 0)
  dispose(game)
  ok('重开（reset）决斗圈完全归零')
}

// ── 8. 渲染挂钩冒烟（stub ctx 不炸） ────────────────────────
{
  const game = createArena()
  const boss = spawnBoss(game, 300, 'boss-knight')
  const arena = game.bossArena
  arena.activate(boss)
  game.player.x = arena.cx + arena.radius + 150 // 出界态也要能画
  arena.renderWorld(ctx2d)
  arena.renderOverlay(ctx2d, 1280, 720)
  arena.flash()
  arena.renderOverlay(ctx2d, 1280, 720)
  boss.render(ctx2d)
  dispose(game)
  ok('渲染挂钩（圈环/泛红/箭头/红闪/夹击闪光）冒烟通过')
}

console.log(`\nverify-boss-arena: ${passed} 组断言全部通过`)
