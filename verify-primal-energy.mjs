// 拟态能量（origin 独占资源，P0）验证：充能规则、节流、超载震荡、重置与血统隔离
import assert from 'node:assert'
import { createArena, spawn, pressSpace, dispose } from './test-support/arena-fixture.mjs'
import {
  PRIMAL_ENERGY_MAX,
  PRIMAL_OVERLOAD_COST,
  PRIMAL_GAIN_FOREIGN,
  PRIMAL_GAIN_SAME,
  PRIMAL_GAIN_ELITE,
  PRIMAL_GAIN_BOSS,
  PRIMAL_SOURCES,
  gainPrimalEnergy,
  onPrimalKill,
  canPrimalOverload,
  resetPrimalEnergy,
} from './src/game/PrimalEnergy.js'

let passed = 0
function ok(name) { passed++; console.log(`✓ ${name}`) }

// —— 1. 异源 +8 / 同源 +1 ——
{
  const game = createArena('origin')
  resetPrimalEnergy(game.player)
  assert.equal(gainPrimalEnergy(game, PRIMAL_SOURCES.PROJECTILE, 0), PRIMAL_GAIN_FOREIGN, '首次判定：无上次来源，按异源 +8')
  assert.equal(gainPrimalEnergy(game, PRIMAL_SOURCES.PROJECTILE, 0.1), PRIMAL_GAIN_SAME, '同源连续 +1')
  assert.equal(gainPrimalEnergy(game, PRIMAL_SOURCES.SHOCK, 0.2), PRIMAL_GAIN_FOREIGN, '换来源回到 +8')
  assert.equal(game.player.primalEnergy, 8 + 1 + 8)
  ok('异源 +8 / 同源 +1 / 首次按异源')
  dispose(game)
}

// —— 2. 每秒最多结算 3 次（节流），被节流不改变「上一次来源」 ——
{
  const game = createArena('origin')
  resetPrimalEnergy(game.player)
  gainPrimalEnergy(game, PRIMAL_SOURCES.PROJECTILE, 0) // 计 1
  gainPrimalEnergy(game, PRIMAL_SOURCES.SHOCK, 0.1) // 计 2
  gainPrimalEnergy(game, PRIMAL_SOURCES.ELEMENT, 0.2) // 计 3
  const before = game.player.primalEnergy
  const lastSource = game.player._lastDamageSource
  assert.equal(gainPrimalEnergy(game, PRIMAL_SOURCES.PROJECTILE, 0.3), 0, '窗口内第 4 次判定被节流')
  assert.equal(game.player.primalEnergy, before, '节流不充能')
  assert.equal(game.player._lastDamageSource, lastSource, '节流不消耗轮换进度')
  assert.equal(gainPrimalEnergy(game, PRIMAL_SOURCES.PROJECTILE, 1.1), PRIMAL_GAIN_FOREIGN, '窗口滚动后恢复（且 vs 上次 element 为异源）')
  ok('每秒 3 次节流 + 窗口滚动恢复')
  dispose(game)
}

// —— 3. 上限 100，满格不再获得（含击杀通道） ——
{
  const game = createArena('origin')
  resetPrimalEnergy(game.player)
  game.player.primalEnergy = 98
  gainPrimalEnergy(game, PRIMAL_SOURCES.PROJECTILE, 0)
  assert.equal(game.player.primalEnergy, PRIMAL_ENERGY_MAX, '充能封顶 100')
  assert.equal(gainPrimalEnergy(game, PRIMAL_SOURCES.SHOCK, 0.1), 0, '满格后充能判定返回 0')
  assert.equal(onPrimalKill(game, { isBoss: true }), 0, '满格后首领击杀也不溢出')
  assert.equal(game.player.primalEnergy, PRIMAL_ENERGY_MAX)
  ok('上限 100 / 满格不再获得')
  dispose(game)
}

// —— 4. 击杀加成：精英 +15 / 首领 +30 / 普通 +0，不占节流窗口 ——
{
  const game = createArena('origin')
  resetPrimalEnergy(game.player)
  // 先把节流窗口打满
  gainPrimalEnergy(game, PRIMAL_SOURCES.PROJECTILE, 0)
  gainPrimalEnergy(game, PRIMAL_SOURCES.PROJECTILE, 0.1)
  gainPrimalEnergy(game, PRIMAL_SOURCES.PROJECTILE, 0.2)
  assert.equal(onPrimalKill(game, { isElite: true }), PRIMAL_GAIN_ELITE, '精英 +15（不受节流影响）')
  assert.equal(onPrimalKill(game, { isBoss: true }), PRIMAL_GAIN_BOSS, '首领 +30')
  assert.equal(onPrimalKill(game, {}), 0, '普通怪不加')
  assert.equal(game.player.primalEnergy, 8 + 1 + 1 + 15 + 30)
  ok('击杀加成独立通道')
  dispose(game)
}

// —— 5. 超载阈值：39 不超载（基础版照常），40 超载并消耗 40 ——
{
  const game = createArena('origin')
  resetPrimalEnergy(game.player)
  const e = spawn(game, { x: 70, hp: 100 })
  game.player.primalEnergy = PRIMAL_OVERLOAD_COST - 1
  assert.equal(canPrimalOverload(game.player), false, '39 不可超载')
  const hpBefore = e.hp
  pressSpace(game)
  assert.ok(Math.abs(e.hp - (hpBefore - 1.9)) < 1e-9, '能量不足时基础版照常（1.9 倍伤害）')
  assert.ok(e.x > game.player.x + 100 && e.x < game.player.x + 112, '基础击退 36px')
  // 基础版释放后：39 + 震荡异源充能 8 = 47（不扣费）
  assert.equal(game.player.primalEnergy, 39 + PRIMAL_GAIN_FOREIGN, '基础版不扣费，震荡自身计来源②')
  dispose(game)
}
{
  const game = createArena('origin')
  resetPrimalEnergy(game.player)
  const e = spawn(game, { x: 70, hp: 100 })
  game.player.primalEnergy = PRIMAL_OVERLOAD_COST
  assert.equal(canPrimalOverload(game.player), true, '40 可超载')
  const hpBefore = e.hp
  pressSpace(game)
  assert.ok(Math.abs(e.hp - (hpBefore - 1.9 * 2.5)) < 1e-9, '超载震荡伤害 ×2.5（4.75）')
  assert.ok(Math.abs(e.x - (game.player.x + 70 + 72)) < 1, '超载击退翻倍（72px）')
  assert.equal(game.player.primalEnergy, PRIMAL_GAIN_FOREIGN, '超载扣 40 后由震荡充能 +8')
  ok('阈值 40 / 超载伤害 ×2.5 / 击退 72 / 扣费 40')
  dispose(game)
}

// —— 6. 超载半径 ×1.5：180px 覆盖到基础版打不到的 170px 目标 ——
{
  const game = createArena('origin')
  resetPrimalEnergy(game.player)
  const far = spawn(game, { x: 170, hp: 100 })
  game.player.strainSkillCd = 0
  game.player.primalEnergy = PRIMAL_OVERLOAD_COST
  pressSpace(game)
  assert.ok(far.hp < 100, '超载半径 180 覆盖 170px 目标')
  dispose(game)
  const game2 = createArena('origin')
  resetPrimalEnergy(game2.player)
  const far2 = spawn(game2, { x: 170, hp: 100 })
  game2.player.strainSkillCd = 0
  game2.player.primalEnergy = 0
  pressSpace(game2)
  assert.equal(far2.hp, 100, '基础半径 120 打不到 170px 目标')
  ok('超载半径 ×1.5（180 vs 120）')
  dispose(game2)
}

// —— 7. 能量为 0 时基础版可用 + 重开归零 ——
{
  const game = createArena('origin')
  resetPrimalEnergy(game.player)
  const e = spawn(game, { x: 70, hp: 100 })
  game.player.strainSkillCd = 0
  game.player.primalEnergy = 0
  pressSpace(game)
  assert.ok(Math.abs(e.hp - (100 - 1.9)) < 1e-9, '0 能量基础版照常释放')
  assert.equal(game.player.strainSkillCd, 7, '冷却照常启动（7s）')
  game.player.primalEnergy = 80
  game.reset()
  assert.equal(game.player.primalEnergy, 0, '重开（reset）能量归零')
  assert.equal(game.player._lastDamageSource, null, '来源轮换状态一并清空')
  ok('0 能量可用 / 重开归零')
  dispose(game)
}

// —— 8. 血统隔离：非 origin 不充能、不超载、击杀不加 ——
{
  const game = createArena('ricochet')
  assert.equal(gainPrimalEnergy(game, PRIMAL_SOURCES.PROJECTILE, 0), 0, '弹射血统充能短路')
  assert.equal(onPrimalKill(game, { isBoss: true }), 0, '弹射血统击杀不加')
  assert.equal(game.player.primalEnergy, 0)
  assert.equal(canPrimalOverload(game.player), false)
  ok('非 origin 全程无能量')
  dispose(game)
}

// —— 9. 实战联动：飞弹命中自动充能，击杀精英注入 +15 ——
{
  const game = createArena('origin')
  resetPrimalEnergy(game.player)
  const e = spawn(game, { x: 60, hp: 1 })
  e.isElite = true
  const dt = 0.02
  for (let t = 0; t < 3 && e.active; t += dt) {
    game.elapsed += dt
    game.enemyManager._buildGrid()
    game.weaponSystem.update(dt)
  }
  assert.ok(game.player.primalEnergy > 0, '飞弹命中自动充能')
  assert.ok(!e.active, '精英被击杀')
  assert.ok(game.player.primalEnergy >= PRIMAL_GAIN_ELITE + PRIMAL_GAIN_FOREIGN - 1, '精英击杀 +15 已注入（含命中充能）')
  ok('飞弹命中/精英击杀实战链路')
  dispose(game)
}

console.log(`\n✅ verify-primal-energy: ${passed} 组断言全部通过`)
