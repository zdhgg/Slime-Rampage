// Gameplay 架构 smoke test：验证 gameplay 层默认值、工厂回落、
// hooks 接线（reset/update/render/destroy）、Execution Boundary（每帧
// update/render 执行边界）、Runner 空壳/三通道移动/原型射击闭环、
// Engine 初始化销毁不受损。纯 Node 运行（无头桩与 engine-smoke.mjs 同源），
// npm test 链内执行。
import assert from 'node:assert/strict'

// —— 浏览器环境桩（与 engine-smoke.mjs 相同的最小桩） ——
const gradient = { addColorStop() {} }
const ctx2d = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => gradient
      return () => {} // 其余绘制方法 → no-op
    },
    set() {
      return true
    },
  }
)
const canvasStub = {
  width: 0,
  height: 0,
  getBoundingClientRect: () => ({ width: 1280, height: 720 }),
  getContext: () => ctx2d,
}
globalThis.window = { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 }
globalThis.document = {
  createElement: () => canvasStub,
  addEventListener() {},
  removeEventListener() {},
  hidden: false,
}
globalThis.requestAnimationFrame = () => 0
globalThis.cancelAnimationFrame = () => {}

const { GameEngine } = await import('./src/game/GameEngine.js')
const { GameplayController } = await import('./src/game/gameplay/GameplayController.js')
const { ArenaGameplay } = await import('./src/game/gameplay/ArenaGameplay.js')
const { RunnerGameplay } = await import('./src/game/gameplay/RunnerGameplay.js')
const { createGameplay } = await import('./src/game/gameplay/GameplayFactory.js')

// 工厂：arena/runner 命中对应 Controller；未知 id 安全回落 arena
assert.ok(createGameplay('arena') instanceof ArenaGameplay)
assert.ok(createGameplay('runner') instanceof RunnerGameplay)
assert.ok(createGameplay('unknown-mode') instanceof ArenaGameplay)
console.log('✓ GameplayFactory：arena/runner 命中，未知 id 安全回落 arena')

// 默认 gameplay = arena，且已注入引擎上下文
const engine = GameEngine.create(canvasStub)
assert.equal(engine.gameplayId, 'arena')
assert.ok(engine.gameplay instanceof ArenaGameplay)
assert.ok(engine.gameplay instanceof GameplayController)
assert.equal(engine.gameplay.game, engine)
console.log('✓ 引擎默认 gameplay 为 arena（Controller 已 attach 引擎）')

// configureRun 只归一化规则模式，不触碰 gameplay 层
const gameplayBefore = engine.gameplay
engine.configureRun({ mode: 'endless', difficulty: 'hell' })
assert.equal(engine.runSelection.mode, 'endless')
assert.equal(engine.gameplayId, 'arena')
assert.equal(engine.gameplay, gameplayBefore)
console.log('✓ configureRun 不改变 gameplay（expedition/timed/endless 语义不变）')

// hooks 接线：reset → update → render 各自按序触发对应 hook
const calls = []
const gp = engine.gameplay
for (const hook of ['reset', 'beforeUpdate', 'afterUpdate', 'beforeRender', 'afterRender']) {
  gp[hook] = (...args) => calls.push([hook, args])
}
engine.reset()
assert.equal(calls.length, 1)
assert.equal(calls[0][0], 'reset')
engine.update(1 / 60)
assert.deepEqual(calls.map(([hook]) => hook), ['reset', 'beforeUpdate', 'afterUpdate'])
assert.ok(Math.abs(calls[1][1][0] - 1 / 60) < 1e-9, 'beforeUpdate 应收到 dt')
engine.render()
assert.deepEqual(
  calls.map(([hook]) => hook),
  ['reset', 'beforeUpdate', 'afterUpdate', 'beforeRender', 'afterRender']
)
assert.equal(calls[3][1][0], ctx2d, 'beforeRender 应收到 ctx')
console.log('✓ Gameplay hooks 在 Engine 生命周期中按序接线（reset/update/render）')

// ArenaGameplay 可独立 attach/reset（纯 JS、无 DOM 依赖），destroy 清空上下文
const standalone = new ArenaGameplay()
standalone.attach(engine)
assert.equal(standalone.game, engine)
standalone.reset()
standalone.beforeUpdate(1 / 60)
standalone.afterRender(ctx2d)
standalone.destroy()
assert.equal(standalone.game, null)
console.log('✓ ArenaGameplay 可独立 attach/reset/destroy')

// 显式入口 configureGameplay：重建 Controller 并重新 attach；未知 id 回落 arena
const swapped = engine.configureGameplay('does-not-exist')
assert.equal(engine.gameplayId, 'arena')
assert.ok(swapped instanceof ArenaGameplay)
assert.equal(swapped.game, engine)
assert.notEqual(swapped, gp, 'configureGameplay 应重建 Controller')
assert.equal(gp.game, null, '旧 Controller 已被销毁（上下文清空）')
console.log('✓ configureGameplay 显式入口可用（未知 id 回落 arena 并重建）')

// Execution Boundary：默认走 Arena 帧管线；usesArenaFramePipeline() 返回 false 时
// Arena update/render helper 不执行，改由 updateWorld/renderWorld 完全接管，
// before/after hooks 仍然触发（无假 gameplay 类型，仅在实例上临时覆写）。
const bp = engine.gameplay
assert.equal(bp.usesArenaFramePipeline(), true, '默认应使用 Arena frame pipeline')
const frameSpies = { arenaUpdate: 0, arenaRender: 0, worldUpdate: [], worldRender: [] }
engine._updateArenaFrame = () => {
  frameSpies.arenaUpdate++
}
engine._renderArenaFrame = () => {
  frameSpies.arenaRender++
}
const boundaryHooks = []
for (const hook of ['beforeUpdate', 'afterUpdate', 'beforeRender', 'afterRender']) {
  bp[hook] = () => boundaryHooks.push(hook)
}

// Arena 管线（默认）：Arena helper 各执行一次，自定义世界入口不执行
engine.update(1 / 60)
engine.render()
assert.equal(frameSpies.arenaUpdate, 1)
assert.equal(frameSpies.arenaRender, 1)
assert.equal(frameSpies.worldUpdate.length, 0)
assert.equal(frameSpies.worldRender.length, 0)
assert.deepEqual(boundaryHooks, ['beforeUpdate', 'afterUpdate', 'beforeRender', 'afterRender'])

// 自定义管线：Arena helper 不再执行，updateWorld/renderWorld 接管，hooks 照常
bp.usesArenaFramePipeline = () => false
bp.updateWorld = (dt) => frameSpies.worldUpdate.push(dt)
bp.renderWorld = (ctx) => frameSpies.worldRender.push(ctx)
boundaryHooks.length = 0
engine.update(1 / 60)
engine.render()
assert.equal(frameSpies.arenaUpdate, 1, '自定义管线不得再执行 Arena update helper')
assert.equal(frameSpies.arenaRender, 1, '自定义管线不得再执行 Arena render helper')
assert.equal(frameSpies.worldUpdate.length, 1)
assert.ok(Math.abs(frameSpies.worldUpdate[0] - 1 / 60) < 1e-9, 'updateWorld 应收到 dt')
assert.equal(frameSpies.worldRender[0], ctx2d, 'renderWorld 应收到 ctx')
assert.deepEqual(boundaryHooks, ['beforeUpdate', 'afterUpdate', 'beforeRender', 'afterRender'])

// 还原实例级覆写（回到原型默认），不影响后续测试与引擎销毁
for (const key of [
  'usesArenaFramePipeline',
  'updateWorld',
  'renderWorld',
  'beforeUpdate',
  'afterUpdate',
  'beforeRender',
  'afterRender',
]) {
  delete bp[key]
}
delete engine._updateArenaFrame
delete engine._renderArenaFrame
console.log('✓ Execution Boundary：自定义 Gameplay 可完全跳过 Arena 每帧 update/render')

// RunnerGameplay 最小空壳：configureGameplay('runner') 可切换；不走 Arena 管线，
// updateWorld/renderWorld 接管每帧；可随时切回 arena 恢复默认管线。
const runnerEntry = engine.configureGameplay('runner')
assert.equal(engine.gameplayId, 'runner')
assert.ok(runnerEntry instanceof RunnerGameplay)
assert.ok(runnerEntry instanceof GameplayController)
assert.equal(runnerEntry.usesArenaFramePipeline(), false)
assert.equal(runnerEntry.game, engine)
const runnerSpies = { arenaUpdate: 0, arenaRender: 0, worldUpdate: 0, worldRender: 0 }
engine._updateArenaFrame = () => {
  runnerSpies.arenaUpdate++
}
engine._renderArenaFrame = () => {
  runnerSpies.arenaRender++
}
runnerEntry.updateWorld = (dt) => {
  runnerSpies.worldUpdate += dt
}
runnerEntry.renderWorld = () => {
  runnerSpies.worldRender++
}
engine.update(1 / 60)
engine.render()
assert.equal(runnerSpies.arenaUpdate, 0, 'runner 不得执行 Arena update helper')
assert.equal(runnerSpies.arenaRender, 0, 'runner 不得执行 Arena render helper')
assert.ok(Math.abs(runnerSpies.worldUpdate - 1 / 60) < 1e-9, 'updateWorld 应按帧收到 dt')
assert.equal(runnerSpies.worldRender, 1, 'renderWorld 应每帧执行')
delete engine._updateArenaFrame
delete engine._renderArenaFrame
delete runnerEntry.updateWorld
delete runnerEntry.renderWorld

// 切回 arena：默认管线与 Engine 上下文恢复，旧 runner 实例随切换销毁
const backToArena = engine.configureGameplay('arena')
assert.equal(engine.gameplayId, 'arena')
assert.ok(backToArena instanceof ArenaGameplay)
assert.equal(backToArena.usesArenaFramePipeline(), true)
assert.equal(runnerEntry.game, null, '切回 arena 后旧 runner 实例已销毁')
engine.update(1 / 60) // 切回后 Arena 管线照常运转
engine.render()
console.log('✓ RunnerGameplay 空壳：创建/接管每帧/切回 arena 全链可用')

// Runner 三通道移动：初始中间、边沿触发切换、边界钳制、按住不连跳、
// X 平滑过渡、resize 后 lane 位置自适应。
const rg = engine.configureGameplay('runner')
assert.equal(rg.currentLane, 1, '初始 lane 应为中间（1）')
assert.ok(
  rg.laneCenterX(0) < rg.laneCenterX(1) && rg.laneCenterX(1) < rg.laneCenterX(2),
  '三条通道中心 X 应从左到右递增'
)
assert.ok(Math.abs(rg.playerX - rg.laneCenterX(1)) < 1e-6, '玩家初始应位于中间通道中心')
assert.ok(rg.playerY > engine.height * 0.6, '玩家应固定在画面下方区域')

/** 单帧按下并松开（边沿触发）：updateWorld 必须各观察到按下帧与释放帧 */
const pressFrame = (axis) => {
  engine.input.state[axis] = true
  engine.update(1 / 60) // 按下帧：边沿切换
  engine.input.state[axis] = false
  engine.update(1 / 60) // 释放帧：让 updateWorld 观察到松开
}

// 右切 1→2 后再次右按：右边界钳制
pressFrame('right')
assert.equal(rg.currentLane, 2, '右切换应到达 lane 2')
pressFrame('right')
assert.equal(rg.currentLane, 2, '右边界外不得继续右移')

// 左切 2→1→0 后再次左按：左边界钳制
pressFrame('left')
assert.equal(rg.currentLane, 1, '左切换应回到 lane 1')
pressFrame('left')
assert.equal(rg.currentLane, 0, '左切换应到达 lane 0')
pressFrame('left')
assert.equal(rg.currentLane, 0, '左边界外不得继续左移')

// 按住右键 3 帧：只允许从 0 跳到 1（连续跳 lane 会错误地到达 2）
engine.input.state.right = true
engine.update(1 / 60)
engine.update(1 / 60)
engine.update(1 / 60)
engine.input.state.right = false
assert.equal(rg.currentLane, 1, '按住不得连续跳 lane')

// 平滑过渡：从静止的 lane 1 切到 lane 2，一帧内只移动部分距离并最终收敛
for (let i = 0; i < 40; i++) engine.update(1 / 60)
assert.ok(Math.abs(rg.playerX - rg.laneCenterX(1)) < 1, '静止后玩家应收敛在当前通道中心')
const laneSpan = rg.laneCenterX(2) - rg.laneCenterX(1)
pressFrame('right')
assert.equal(rg.currentLane, 2)
const distToTarget = Math.abs(rg.playerX - rg.laneCenterX(2))
assert.ok(distToTarget > 1 && distToTarget < laneSpan - 1, 'lane 切换应为平滑过渡而非瞬移')
for (let i = 0; i < 60; i++) engine.update(1 / 60)
assert.ok(Math.abs(rg.playerX - rg.laneCenterX(2)) < 1, '平滑过渡应收敛到目标通道中心')
engine.render() // runner 渲染管线冒烟（背景 + 通道 + 史莱姆占位）

// 视口尺寸变化：通道几何与玩家锚点随新尺寸自适应
const previousCenter = rg.laneCenterX(2)
const previousRect = canvasStub.getBoundingClientRect
canvasStub.getBoundingClientRect = () => ({ width: 900, height: 600 })
engine._onResize()
engine.update(1 / 60)
assert.notEqual(rg.laneCenterX(2), previousCenter, 'lane 中心应随视口宽度变化')
assert.ok(Math.abs(rg.playerX - rg.laneCenterX(2)) < 1, 'resize 后玩家仍锁定当前通道中心')
assert.ok(Math.abs(rg.playerY - 600 * 0.78) < 1e-6, '玩家 Y 应随视口高度自适应')
canvasStub.getBoundingClientRect = previousRect
engine._onResize()
engine.update(1 / 60)

// 恢复 arena，交还后续测试的默认上下文
engine.configureGameplay('arena')
console.log('✓ Runner lane 移动：边沿切换/边界钳制/按住不连跳/平滑过渡/resize 自适应全链可用')

// Runner 原型射击闭环（怪物版）：帧率无关节拍、子弹 lane 隔离、逼近怪物、
// 击杀/重生、突破记录、resize 对齐。

// —— 射击节拍：不同 dt 模拟相同总时长（2s），发数应基本一致 ——
const countShots = (dt, seconds) => {
  const instance = engine.configureGameplay('runner') // 全新实例，独立计时
  let shots = 0
  const originalPush = instance._bullets.push.bind(instance._bullets)
  instance._bullets.push = (bullet) => {
    shots++
    return originalPush(bullet)
  }
  const frames = Math.round(seconds / dt)
  for (let i = 0; i < frames; i++) engine.update(dt)
  return shots
}
const shotsAt60 = countShots(1 / 60, 2.0)
const shotsAt30 = countShots(0.05, 2.0)
assert.ok(Math.abs(shotsAt60 - shotsAt30) <= 1, '不同 dt 下射击节拍应基本一致')
assert.ok(Math.abs(shotsAt60 - 10) <= 1, '2 秒内应射出约 10 发（5 发/秒）')

const sg = engine.configureGameplay('runner')
assert.ok(
  sg._monsterByLane.every((m) => m && m.lane === sg._monsterByLane.indexOf(m) && m.hp === m.maxHp && m.speed > 0),
  '三 lane 初始各有一只满血、带速度的怪物'
)
assert.ok(sg._monsterByLane.every((m) => m.y < engine.height * 0.3), '怪物应从通道顶部生成')
assert.ok(sg._gateByLane.every(Boolean), '初始三条 lane 应各有一个增益 Gate')
assert.equal(sg.attackDamage, 1, '初始攻击力应为 1')
// 暂时清空并冻结 Gate：子弹会优先命中路径上更近的 Gate，会污染怪物基线；
// Gate 专项测试在本段末尾解冻后进行
for (let lane = 0; lane < 3; lane++) {
  sg._gateByLane[lane] = null
  sg._gateRespawnTimers[lane] = 999
}

// 首帧立即射击 1 发；怪物持续向玩家方向（下方）移动
engine.update(1 / 60)
assert.equal(sg._bullets.length, 1, '首帧应立即射出 1 发')
const probe = sg._monsterByLane[1]
const probeY = probe.y
for (let i = 0; i < 5; i++) engine.update(1 / 60)
assert.ok(sg._monsterByLane[1].y > probeY, '怪物应持续向下移动')

// 首发子弹向上、直线、保持发射时的 lane（初始在 lane 1）
const firstBullet = sg._bullets[0]
assert.equal(firstBullet.lane, 1)
const bulletY = firstBullet.y
const bulletX = firstBullet.x
engine.update(1 / 60)
assert.ok(firstBullet.y < bulletY, '子弹应向上移动')
assert.equal(firstBullet.x, bulletX, '子弹应沿所属 lane 直线飞行')

// 只命中同 lane 怪物：lane 1 的子弹打到中路怪物，左右怪物不受影响
for (
  let i = 0;
  i < 200 && sg._monsterByLane[1] && sg._monsterByLane[1].hp === sg._monsterByLane[1].maxHp;
  i++
) {
  engine.update(1 / 60)
}
assert.equal(sg._monsterByLane[1].hp, sg._monsterByLane[1].maxHp - 1, '同 lane 命中应扣血')
assert.equal(sg._monsterByLane[0].hp, sg._monsterByLane[0].maxHp, '左 lane 怪物不应被命中')
assert.equal(sg._monsterByLane[2].hp, sg._monsterByLane[2].maxHp, '右 lane 怪物不应被命中')
assert.ok(!sg._bullets.includes(firstBullet), '命中后的子弹应被移除')

// 突破：怪物到达玩家区域 → 移除 + breachCount 记录一次
const breachBefore = sg.breachCount
sg._monsterByLane[2].y = sg.playerY - 10 // 直接拉到玩家区域，模拟到达
engine.update(1 / 60)
assert.equal(sg.breachCount, breachBefore + 1, '怪物到达玩家区域应记录一次突破')
assert.equal(sg._monsterByLane[2], null, '突破的怪物应被移除')
for (let i = 0; i < 240 && !sg._monsterByLane[2]; i++) engine.update(1 / 60)
assert.ok(sg._monsterByLane[2], '短暂间隔后怪物应在原 lane 重新生成')
assert.equal(sg._monsterByLane[2].hp, sg._monsterByLane[2].maxHp, '重生怪物应满血')
assert.ok(sg._monsterByLane[2].y < engine.height * 0.3, '重生位置应回到通道顶部')

// 击杀：HP 归零怪物消失（而非突破），随后重新生成新怪物
for (let i = 0; i < 300 && !sg._monsterByLane[1]; i++) engine.update(1 / 60)
assert.ok(sg._monsterByLane[1], 'lane 1 应有怪物可供击杀')
sg._monsterByLane[1].hp = 1 // 快进：下一发命中即击杀
const killBreachBefore = sg.breachCount
const dyingMonster = sg._monsterByLane[1]
for (let i = 0; i < 120 && sg._monsterByLane[1]; i++) engine.update(1 / 60)
assert.equal(sg._monsterByLane[1], null, 'HP 归零后怪物应消失')
assert.equal(sg.breachCount, killBreachBefore, '应记为击杀而非突破（未到达玩家区域）')
for (let i = 0; i < 240 && !sg._monsterByLane[1]; i++) engine.update(1 / 60)
assert.ok(sg._monsterByLane[1] && sg._monsterByLane[1] !== dyingMonster, '击杀后应重新生成新怪物')

// 切换 lane 后：新子弹跟随新 lane，旧子弹保持发射时的 lane
engine.input.state.left = true
engine.update(1 / 60)
engine.input.state.left = false
engine.update(1 / 60)
assert.equal(sg.currentLane, 0, '应切换到左 lane')
// 等待上限放宽到 30 帧：覆盖「切换前冷却刚好重置」的最坏相位
for (let i = 0; i < 30 && !sg._bullets.some((b) => b.lane === 0); i++) engine.update(1 / 60)
assert.ok(sg._bullets.some((b) => b.lane === 0), '切 lane 后新子弹应属于新 lane')
assert.ok(
  sg._bullets.every((b) => b.lane === 0 || b.lane === 1),
  '子弹不应出现在从未射击的 lane 2'
)

// resize 后子弹 X 吸附所属 lane 中心，怪物仍归属原 lane
const flyingBullet = sg._bullets[sg._bullets.length - 1]
const previousBulletLane = flyingBullet.lane
const previousBulletCenter = sg.laneCenterX(previousBulletLane)
// 出生于平滑过渡途中的子弹 x 可偏离目标 lane 中心最多一个 lane 间距，
// 只断言仍在三通道走廊内；精确对齐由 resize 吸附断言验证
const corridorLeft = sg._laneStartX
const corridorRight = sg._laneStartX + sg._laneW * 3 + sg._laneGap * 2
assert.ok(
  flyingBullet.x >= corridorLeft && flyingBullet.x <= corridorRight,
  '子弹应位于通道走廊范围内（出生时可能仍在平滑过渡途中）'
)
canvasStub.getBoundingClientRect = () => ({ width: 820, height: 640 })
engine._onResize()
engine.update(1 / 60)
assert.notEqual(sg.laneCenterX(previousBulletLane), previousBulletCenter, 'lane 中心应随视口变化')
assert.ok(
  Math.abs(flyingBullet.x - sg.laneCenterX(flyingBullet.lane)) < 1e-6,
  'resize 后子弹 X 应回到所属 lane 中心'
)
canvasStub.getBoundingClientRect = previousRect
engine._onResize()
engine.update(1 / 60)
assert.ok(
  sg._monsterByLane.filter(Boolean).length > 0 &&
    sg._monsterByLane.filter(Boolean).every((m) => sg._monsterByLane[m.lane] === m),
  'resize 后在场怪物仍归属原 lane（空 slot 属于重生间隔）'
)
engine.render() // 射击渲染冒烟（怪物/血条/子弹）

// —— 增益 Gate：同 lane 命中 / 扣血 / 打爆强化 / 重生 / 最近目标取舍 ——
// 先切回中间 lane（前面的切 lane 测试把玩家留在了 lane 0），
// 再解冻 Gate——否则解冻等待期间 lane 0 子弹会污染 lane 0 Gate 的满血断言
engine.input.state.right = true
engine.update(1 / 60)
engine.input.state.right = false
engine.update(1 / 60)
assert.equal(sg.currentLane, 1, '应回到中间 lane 进行 Gate 测试')
sg._bullets.length = 0 // 清空在途旧弹：切 lane 测试留下的 lane 0 子弹会命中解冻后的 lane 0 Gate
for (let lane = 0; lane < 3; lane++) {
  sg._gateByLane[lane] = null
  sg._gateRespawnTimers[lane] = 0 // 解冻：立即重生
}
for (
  let i = 0;
  i < 30 && !(sg._gateByLane[0] && sg._gateByLane[1] && sg._gateByLane[2]);
  i++
) {
  engine.update(1 / 60)
}
assert.ok(sg._gateByLane.every(Boolean), '解冻后三条 lane 应各恢复一个 Gate')

// 清空 lane 1 弹道（冻结怪物重生），子弹直达 Gate
sg._monsterByLane[1] = null
sg._respawnTimers[1] = 999
const gateHpBefore = sg._gateByLane[1].hp
for (let i = 0; i < 40 && sg._gateByLane[1].hp === gateHpBefore; i++) engine.update(1 / 60)
assert.ok(sg._gateByLane[1].hp < gateHpBefore, '同 lane 子弹应命中 Gate 扣血')
assert.equal(sg._gateByLane[0].hp, sg._gateByLane[0].maxHp, '左 lane Gate 不应被命中')
assert.equal(sg._gateByLane[2].hp, sg._gateByLane[2].maxHp, '右 lane Gate 不应被命中')

// 打爆 Gate：攻击永久 +1，Gate 消失
const damageBefore = sg.attackDamage
sg._gateByLane[1].hp = sg.attackDamage // 快进：一发打爆
for (let i = 0; i < 60 && sg._gateByLane[1]; i++) engine.update(1 / 60)
assert.equal(sg._gateByLane[1], null, '打爆后 Gate 应消失')
assert.equal(sg.attackDamage, damageBefore + 1, '打爆 Gate 应获得永久攻击强化')

// Gate 消失一段时间后重新生成（满血）
for (let i = 0; i < 420 && !sg._gateByLane[1]; i++) engine.update(1 / 60)
assert.ok(sg._gateByLane[1] && sg._gateByLane[1].hp === sg._gateByLane[1].maxHp, 'Gate 应按间隔重生且满血')

// 强化后的子弹对怪物造成 attackDamage 点伤害（此前基线为 1）
sg._respawnTimers[1] = 0 // 恢复 lane 1 怪物
for (let i = 0; i < 120 && !sg._monsterByLane[1]; i++) engine.update(1 / 60)
assert.ok(sg._monsterByLane[1], 'lane 1 怪物应恢复生成')
sg._monsterByLane[1].y = 400 // 放进弹道：Gate 下方、突破线上方 → 子弹先命中怪物
const gateHpSnapshot = sg._gateByLane[1].hp
const monsterHpBefore = sg._monsterByLane[1].hp
for (
  let i = 0;
  i < 60 && sg._monsterByLane[1] && sg._monsterByLane[1].hp === monsterHpBefore;
  i++
) {
  engine.update(1 / 60)
}
assert.ok(
  sg._monsterByLane[1] && sg._monsterByLane[1].hp === monsterHpBefore - sg.attackDamage,
  '子弹伤害应等于 attackDamage（强化后一次扣 2）'
)
assert.equal(sg._gateByLane[1].hp, gateHpSnapshot, '怪物更近时子弹不应命中 Gate')

// 最近目标取舍（另一方向）：怪物拉到 Gate 上方，子弹命中更近的 Gate
sg._monsterByLane[1].y = 100
sg._bullets.length = 0 // 清空在途旧弹：Gate 消失期间它们已越过 302 线，会先命中怪物
const gateHpBefore2 = sg._gateByLane[1].hp
const monsterHpMid = sg._monsterByLane[1].hp
for (
  let i = 0;
  i < 60 && sg._gateByLane[1] && sg._gateByLane[1].hp === gateHpBefore2;
  i++
) {
  engine.update(1 / 60)
}
assert.ok(sg._gateByLane[1] && sg._gateByLane[1].hp < gateHpBefore2, '怪物在 Gate 上方时应命中更近的 Gate')
assert.ok(sg._monsterByLane[1] && sg._monsterByLane[1].hp === monsterHpMid, '远端怪物不应被命中')
engine.render() // Gate 渲染冒烟（菱形门体/ATK +1/血条）

// —— 自动射击补发：大 dt 跨多个间隔时补齐，且不超过安全上限 ——
const sg2 = engine.configureGameplay('runner') // 全新实例，独立计时
let catchUpShots = 0
const originalPush = sg2._bullets.push.bind(sg2._bullets)
sg2._bullets.push = (bullet) => {
  catchUpShots++
  return originalPush(bullet)
}
engine.update(1 / 60)
assert.equal(catchUpShots, 1, '首帧应射出 1 发')
engine.update(1.0) // 单帧 1 秒：理论应发 5 发，超出上限被截断
const caughtUp = catchUpShots - 1
assert.equal(caughtUp, 3, '大 dt 应补发但不超过单帧 3 发的安全上限')
const shotsBeforeNextFrame = catchUpShots
engine.update(1 / 60)
assert.equal(catchUpShots, shotsBeforeNextFrame, '上限触发后下一帧不应继续爆发')

// 恢复 arena，交还后续销毁测试的默认上下文
engine.configureGameplay('arena')
console.log('✓ Runner 射击闭环：帧率无关节拍/lane 隔离命中/击杀重生/突破记录/Gate 强化取舍/resize 自适应全链可用')

// 引擎销毁同步销毁 gameplay，单例复位；销毁后可再次初始化（HMR 场景）
const active = engine.gameplay
let destroyed = false
const originalDestroy = active.destroy.bind(active)
active.destroy = () => {
  destroyed = true
  originalDestroy()
}
engine.destroy()
assert.ok(destroyed, 'engine.destroy 应调用 gameplay.destroy')
assert.equal(active.game, null, 'destroy 后 gameplay 的 Engine 上下文应已清空')
assert.equal(GameEngine.getInstance(), null)
const revived = GameEngine.create(canvasStub)
assert.equal(revived.gameplayId, 'arena')
assert.ok(revived.gameplay instanceof ArenaGameplay)
revived.destroy()
console.log('✓ 引擎初始化与销毁不受损（gameplay 同步销毁，单例可重建）')

console.log('\nGameplay 架构 smoke test 通过 ✓')
