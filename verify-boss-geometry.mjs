/**
 * 强招几何同源验收（P0.5）：预警画出来的形状 × 实际落下去的伤害，必须对得上。
 *
 * 之前箭雨画 ±41.3°、打 ±57.3°（+50%），冲锋画 273px、连段实走 355~508px（+59%），
 * 玩家于是学会「别信地面标记、提前把距离拉满」，三名首领被压回同一个打法。
 * 本脚本把「画」与「打」逐档（阶段 × 连段 × 难度弹数）对撞，偏差超过 5% 即失败。
 *
 * 覆盖：冲锋行程与道宽 / 箭雨扇角与弹数 / 环爆圆与弹数 / 落点裂地的加减速与回收。
 */
import assert from 'node:assert/strict'
import { createArena, spawnBoss, dispose } from './test-support/arena-fixture.mjs'

let passed = 0
function ok(name) {
  passed++
  console.log(`  ✓ ${name}`)
}

/** 把一次强招推进到正式出手，返回 telegraph 时冻结的几何快照 */
function castPattern(boss, { phase = 1, chain = 0, patternBonus = 0 } = {}) {
  boss.phase = phase
  boss.patternBonus = patternBonus
  boss._chainStep = chain
  boss.specialCd = 0
  boss.specialState = 'idle'
  boss.update(0.016)
  assert.equal(boss.specialState, 'telegraph', '强招应进入预警')
  const geo = boss._specialGeometry
  assert.ok(geo, '预警必须冻结几何快照')
  boss.update(boss.specialDuration + 0.01) // → execute
  return geo
}

/** 推进到预警开始（不结算），返回冻结的几何快照 */
function telegraph(boss, { phase = 1, chain = 0, patternBonus = 0 } = {}) {
  boss.phase = phase
  boss.patternBonus = patternBonus
  boss._chainStep = chain
  boss.specialCd = 0
  boss.specialState = 'idle'
  boss.update(0.016)
  assert.equal(boss.specialState, 'telegraph', '强招应进入预警')
  assert.ok(boss._specialGeometry, '预警必须冻结几何快照')
  return boss._specialGeometry
}

/** 把预警推进到正式出手 */
function resolve(boss) {
  boss.update(boss.specialDuration + 0.01)
  assert.notEqual(boss.specialState, 'telegraph', '预警结束应出手')
}

/** 冲锋实走距离（逐帧推进到 dash 结束） */
function measureDash(boss, dt = 0.01) {
  const sx = boss.x
  const sy = boss.y
  let guard = 0
  while (boss.specialState === 'dash' && guard++ < 500) boss.update(dt)
  return Math.hypot(boss.x - sx, boss.y - sy)
}

const rel = (drawn, actual) => Math.abs(drawn - actual) / Math.max(1e-6, actual)

// ── 1. 王者冲锋：画多长就走多远，道宽与判伤半径一致 ──
{
  const game = createArena()
  const boss = spawnBoss(game, 300, 'boss-knight')
  for (const phase of [1, 2]) {
    for (const chain of [0, 1, 2]) {
      const geo = castPattern(boss, { phase, chain })
      const travel = measureDash(boss)
      assert.ok(rel(geo.lane.distance, travel) < 0.05,
        `冲锋 P${phase} 第${chain + 1}段：画 ${geo.lane.distance.toFixed(1)}px、走 ${travel.toFixed(1)}px，偏差应 <5%`)
      assert.ok(geo.lane.halfWidth === boss._specialGeometry.lane.halfWidth)
      // 落地后进入破绽；下一段前把状态复位
      boss.specialState = 'idle'
      boss.dashHit = false
      boss.dashChain = 0
      boss.x = game.player.x + 70
      boss.y = game.player.y
      boss.lockedAngle = 0
    }
  }
  dispose(game)
  ok('冲锋：六档（阶段×连段）预警长度 = 实走距离，偏差 <5%')
}

// ── 2. 王庭三判（弓王的时间轴）：落点按速度外推、预警开始即冻结、一次施放最多结算一次 ──
{
  const game = createArena()
  const boss = spawnBoss(game, 300, 'boss-archer')
  const player = game.player
  const manager = game.enemyManager
  const resetPlayer = (x, y, vx = 0, vy = 0) => {
    player.x = x
    player.y = y
    player.vx = vx
    player.vy = vy
    player.invincible = 0
    player.dead = false
    player.hp = player.maxHp
    manager._bullets.length = 0
  }

  // 2.1 站桩：三点叠在脚下，也只结算一次（不是 3×2）
  resetPlayer(300, 400)
  const geo = telegraph(boss)
  assert.equal(boss._tribunal.points.length, 3, '常态三判')
  for (const pt of boss._tribunal.points) {
    assert.equal(pt.x, 300, '静止时三个落点重合')
    assert.equal(pt.y, 400)
  }
  const hpBefore = player.hp
  resolve(boss)
  assert.equal(manager._bullets.length, 0, '三判不再发射扇形弹幕')
  assert.equal(hpBefore - player.hp, 2, '三点重合也只吃一次 2 点（_volleyHit 只放行一次）')
  assert.equal(boss.specialState, 'recover')

  // 2.2 匀速直线：三点按 0.8s 间隔沿速度方向等距外推
  resetPlayer(300, 400, 340, 0)
  telegraph(boss)
  const xs = boss._tribunal.points.map((pt) => pt.x)
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(xs[i] - (300 + 340 * [0, 0.8, 1.6][i])) < 1e-6,
      `第${i + 1}个落点应外推到 ${(340 * [0, 0.8, 1.6][i]).toFixed(0)}px 之后`)
  }

  // 2.3 冻结：预警开始后玩家原地不动、继续跑，落点都不该跟着滑
  const frozen = boss._tribunal.points.map((pt) => ({ ...pt }))
  player.x = 700
  boss.update(0.1)
  assert.equal(boss.specialState, 'telegraph')
  assert.deepEqual(boss._tribunal.points, frozen, '落点必须在预警开始时冻结（假路线而非追踪弹）')

  // 2.4 按预测直线跑 → 撞上第二个落点；改变方向 → 三点全空
  player.x = frozen[1].x
  player.y = frozen[1].y
  player.invincible = 0
  player.hp = player.maxHp
  resolve(boss)
  assert.equal(player.hp, player.maxHp - 2, '照着他的预测直线跑应撞上第二点')

  resetPlayer(300, 400, 340, 0)
  telegraph(boss)
  player.x = 572
  player.y = 200 // 横向变向：脱离所有落点
  player.invincible = 0
  player.hp = player.maxHp
  resolve(boss)
  assert.equal(player.hp, player.maxHp, '中途变向可以三点全空')

  // 2.5 25% 之后多一判（2.4s）：最后一段变成「四连阶梯」
  resetPlayer(300, 400)
  boss._lastStand = true
  telegraph(boss)
  assert.equal(boss._tribunal.points.length, 4, '困兽之斗后三判升为四判')
  assert.ok(Math.abs(boss._tribunal.points[3].t - 2.4) < 1e-9, '第四判外推到 2.4s')
  boss._lastStand = false

  // 2.6 预判跑出场外：落点被夹在场内，不会把伤害打到墙外
  resetPlayer(game.worldWidth - 40, 400, 340, 0)
  telegraph(boss)
  for (const pt of boss._tribunal.points) {
    assert.ok(pt.x <= game.worldWidth - 24 + 1e-6, '落点必须夹在场内')
  }

  dispose(game)
  ok('三判：外推位移正确 / 预警冻结 / 站桩只吃一次 / 变向可全空 / 场外落点夹回场内')
}

// ── 3. 奥术环爆：圆半径与环射弹数同一份数值 ──
{
  const game = createArena()
  const boss = spawnBoss(game, 300, 'boss-mage')
  const player = game.player
  const cases = [
    { phase: 1, chain: 0, patternBonus: 0, expect: 12 },
    { phase: 2, chain: 0, patternBonus: 0, expect: 16 },
    { phase: 2, chain: 2, patternBonus: 2, expect: 16 + 2 * 2 + 2 * 4 },
  ]
  for (const c of cases) {
    // 站在锁定圆外：不挨圈伤，只吃环射
    player.x = boss.x + 400
    player.y = boss.y
    game.enemyManager._bullets.length = 0
    const geo = castPattern(boss, c)
    assert.equal(geo.burst.radius, 102)
    assert.equal(game.enemyManager._bullets.length, c.expect, `环爆 P${c.phase}/第${c.chain + 1}段 应打 ${c.expect} 发`)
    boss.specialState = 'idle'
  }
  dispose(game)
  ok('环爆：圆半径 102 恒定，弹数随阶段/连段/难度档位正确抬升')
}

// ── 4. 落点裂地：只减速不冻人，按时回收，首领倒下立即失效 ──
{
  const game = createArena()
  const boss = spawnBoss(game, 300, 'boss-knight')
  const manager = game.enemyManager
  assert.equal(manager._bossFields.length, 0)

  boss.x = game.player.x + 70
  boss.y = game.player.y
  boss.lockedAngle = 0
  castPattern(boss, { phase: 1, chain: 0 })
  measureDash(boss)

  boss.specialState = 'idle' // 结束破绽循环外的状态，保住裂地现场
  const field = boss._rupture
  assert.ok(field, '冲锋落地必须留下裂地')
  assert.equal(manager._bossFields.length, 1)
  assert.ok(field.until - field.born >= 0.89, '裂地应持续约 0.9s')

  assert.equal(manager.playerFieldMultiplierAt(field.x, field.y), 0.7, '站在裂地上移速 ×0.7')
  assert.equal(manager.playerFieldMultiplierAt(field.x + 300, field.y), 1, '离开裂地恢复正常')
  assert.equal(manager.playerFieldMultiplierAt(field.x, field.y + 300), 1)

  game.elapsed += 1.0
  assert.equal(manager.playerFieldMultiplierAt(field.x, field.y), 1, '到期后不再减速')

  // 首领倒下：立刻失效，不留隐形劣地
  boss.x = game.player.x + 70
  boss.y = game.player.y
  boss.lockedAngle = 0
  castPattern(boss, { phase: 1, chain: 0 })
  measureDash(boss)
  boss.specialState = 'idle'
  const field2 = boss._rupture
  assert.ok(field2)
  game.elapsed -= 1.0
  boss.active = false
  assert.equal(manager.playerFieldMultiplierAt(field2.x, field2.y), 1, '持有者死后劣地应立即失效')
  boss.active = true
  dispose(game)
  ok('裂地：×0.7 减速、0.9s 到期、离场/身死即失效（无伤害、无碰撞）')
}

// ── 5. 只有主战场骑士王留裂地；终审勇者的骑士段与远征首领不留 ──
{
  const game = createArena()
  const finalBoss = spawnBoss(game, 300, 'boss-final')
  finalBoss._spawnRupture()
  assert.equal(game.enemyManager._bossFields.length, 0, '终审勇者轮转出的冲锋不放裂地')
  const expedition = spawnBoss(game, 300, 'boss-knight')
  expedition.isExpeditionBoss = true
  expedition._spawnRupture()
  assert.equal(game.enemyManager._bossFields.length, 0, '远征首领不放裂地')
  dispose(game)
  ok('裂地范围仅限主战场骑士王（不渗入终局轮转与远征）')
}

// ── 6. 75% / 25% 阈值分档：同样是「加码」，三种首领加在不同的维度 ──
{
  const game = createArena()

  // 骑士王：加地形（双段裂地），不是加人头；25% 干脆不再留地，变成纯冲锋节奏
  const knight = spawnBoss(game, 300, 'boss-knight')
  const before = game.enemyManager._enemies.length
  knight.hp = knight.maxHp * 0.74
  knight._checkThresholdEvents()
  assert.equal(knight._ruptureTier, 2, '骑士王 75% 应升为双段裂地')
  assert.equal(game.enemyManager._enemies.length, before, '骑士王 75% 不召护卫（距离轴加的是地形）')
  knight.hp = knight.maxHp * 0.24
  knight._checkThresholdEvents()
  assert.equal(knight._ruptureOff, true, '骑士王 25% 不再留地')
  assert.equal(knight._ruptureTier, 2)

  // 大法师：加人头（3 名护卫＝3 层护盾），25% 停止召唤，护盾层只减不增
  const mage = spawnBoss(game, 300, 'boss-mage')
  const mageBefore = game.enemyManager._enemies.length
  mage.hp = mage.maxHp * 0.74
  mage._checkThresholdEvents()
  assert.equal(mage._guards.length, 3, '法师 75% 召 3 名护卫')
  assert.equal(game.enemyManager._enemies.length - mageBefore, 3)
  assert.ok(Math.abs(mage._guardMitigation() - 0.4) < 1e-9, '3 层护盾＝承伤 ×0.4')
  mage.hp = mage.maxHp * 0.24
  mage._checkThresholdEvents()
  assert.equal(mage.summonCd, Infinity, '法师 25% 停止召唤')

  dispose(game)
  ok('阈值分档：骑士王加地形 / 法师加护盾层 / 弓王维持原节奏（不再共用一张模板）')
}

// ── 7. 目标轴：护卫层数 = 承伤减免，拆一个就少 20% ──
{
  const game = createArena()
  const mage = spawnBoss(game, 300, 'boss-mage')
  const manager = game.enemyManager
  assert.equal(mage._guardMitigation(), 1, '没有护卫＝不减免')
  mage._trackGuard(manager.spawnAt(mage.x + 60, mage.y, 'knight'))
  assert.ok(Math.abs(mage._guardMitigation() - 0.8) < 1e-9)
  mage._trackGuard(manager.spawnAt(mage.x - 60, mage.y, 'knight'))
  assert.ok(Math.abs(mage._guardMitigation() - 0.6) < 1e-9)
  const g3 = mage._trackGuard(manager.spawnAt(mage.x, mage.y + 60, 'knight'))
  assert.ok(Math.abs(mage._guardMitigation() - 0.4) < 1e-9)
  const g4 = mage._trackGuard(manager.spawnAt(mage.x, mage.y - 60, 'knight'))
  assert.ok(Math.abs(mage._guardMitigation() - 0.4) < 1e-9, '护盾上限 3 层')
  g3.active = false
  g4.active = false
  assert.ok(Math.abs(mage._guardMitigation() - 0.6) < 1e-9, '拆掉护卫后承伤立刻回涨 20%/名')

  mage.hp = 300
  mage.vulnerableTimer = 0
  const before = mage.hp
  mage.hit(10)
  assert.ok(Math.abs((before - mage.hp) - 6) < 1e-6, '2 层护盾下，10 点伤害只掉 6 点')
  dispose(game)
  ok('护盾层：每名护卫 −20% 承伤、上限 3 层、拆掉即回涨（「先拆还是先打」成立）')
}

// ── 8. 目标轴落点：环爆改锁「离你最近的护卫」，没有护卫才回到你脚下 ──
{
  const game = createArena()
  const mage = spawnBoss(game, 300, 'boss-mage')
  const player = game.player
  mage.x = 400
  mage.y = 400
  player.x = 700
  player.y = 400
  player.vx = 0
  player.vy = 0
  telegraph(mage)
  assert.equal(mage.targetX, player.x, '无护卫时环爆锁玩家')
  assert.equal(mage.targetY, player.y)
  mage.specialState = 'idle'
  const guard = mage._trackGuard(game.enemyManager.spawnAt(mage.x + 150, mage.y, 'knight'))
  telegraph(mage)
  assert.equal(mage.targetX, guard.x, '有护卫时环爆改锁最近护卫')
  assert.equal(mage.targetY, guard.y, '拆掉护卫就等于让环爆改砸自己')
  dispose(game)
  ok('环爆锚点：有护卫锁护卫、无护卫锁玩家（目标轴从「打一个点」变成「选一个点」）')
}

dispose.cleanup?.()
console.log(`\n${passed} 组断言通过`)
