// Gameplay 架构 smoke test：验证 gameplay 层默认值、工厂回落、
// hooks 接线（reset/update/render/destroy）、Execution Boundary（每帧
// update/render 执行边界）、Runner 三通道移动/射击闭环/通道职责与
// Rapid Gate、Engine 初始化销毁不受损。
// 纯 Node 运行（无头桩与 engine-smoke.mjs 同源），npm test 链内执行。
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
const {
  RunnerGameplay,
  MONSTER_LANE,
  BUFF_LANE,
  SPECIAL_LANE,
  MAX_MONSTERS,
} = await import('./src/game/gameplay/RunnerGameplay.js')
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

// —— 通道职责：怪物群只在 MONSTER_LANE，Gate 只在 BUFF/SPECIAL lane ——
assert.equal(sg.monsters.length, 1, '开局 MONSTER_LANE 应有一只怪物')
assert.ok(
  sg.monsters[0].hp === sg.monsters[0].maxHp && sg.monsters[0].speed > 0,
  '初始怪物应满血、带速度'
)
assert.ok(sg.monsters[0].y < engine.height * 0.3, '怪物应从通道顶部生成')
assert.ok(sg.monsters.every((m) => m.lane === MONSTER_LANE), '所有怪物都应属于 MONSTER_LANE')
assert.equal(sg._gateByLane[MONSTER_LANE], null, '怪物 lane 不应有 Gate')
assert.equal(sg._gateByLane[BUFF_LANE].kind, 'attack', 'ATK lane 应是 attack Gate')
assert.equal(sg._gateByLane[SPECIAL_LANE].kind, 'rapid', 'Rapid lane 应是 rapid Gate')
assert.equal(sg.attackDamage, 1, '初始攻击力应为 1')
assert.equal(sg.rapidFireTimer, 0, '初始无急速效果')
assert.equal(sg.elapsedTime, 0, '初始无已进行时间')
assert.equal(sg.maxHp, 5, '初始最大生命应为 5')
assert.equal(sg.hp, 5, '初始生命应满')
assert.equal(sg.gameOver, false, '初始不应处于失败状态')

// —— 压力曲线基线：前 30 秒完全温和（HP/速度/间隔不增长）——
const earlyMaxHp = sg.monsters[0].maxHp
const earlySpeed = sg.monsters[0].speed
const earlyInterval = sg.monsterSpawnInterval()
sg.elapsedTime = 25
assert.equal(sg.monsterMaxHp(), earlyMaxHp, '前 30 秒怪物 HP 应保持基线')
assert.equal(sg.monsterSpawnInterval(), earlyInterval, '前 30 秒生成间隔应保持基线')
sg.elapsedTime = 0

// 统计射击次数（节拍/急速验证共用）
let shotCount = 0
const originalPush = sg._bullets.push.bind(sg._bullets)
sg._bullets.push = (bullet) => {
  shotCount++
  return originalPush(bullet)
}

// 首帧立即射击 1 发；怪物持续向玩家方向（下方）移动
engine.update(1 / 60)
assert.equal(shotCount, 1, '首帧应立即射出 1 发')
const probeY = sg.monsters[0].y
for (let i = 0; i < 5; i++) engine.update(1 / 60)
assert.ok(sg.monsters[0].y > probeY, '怪物应持续向下移动')

// 首发子弹向上、直线、保持发射时的 lane（初始在 BUFF_LANE）
const firstBullet = sg._bullets[0]
assert.equal(firstBullet.lane, BUFF_LANE)
const bulletY = firstBullet.y
const bulletX = firstBullet.x
engine.update(1 / 60)
assert.ok(firstBullet.y < bulletY, '子弹应向上移动')
assert.equal(firstBullet.x, bulletX, '子弹应沿所属 lane 直线飞行')

// —— 多怪命中/最近目标/击杀移除/突破：用两只受控怪物精确验证 ——
engine.input.state.left = true
engine.update(1 / 60)
engine.input.state.left = false
engine.update(1 / 60)
assert.equal(sg.currentLane, MONSTER_LANE, '应切换到怪物 lane')
sg._bullets.length = 0 // 清空在途子弹：首发子弹正飞向 ATK Gate，会污染 Gate 快照
const atkGateHpSnapshot = sg._gateByLane[BUFF_LANE].hp
const rapidGateHpSnapshot = sg._gateByLane[SPECIAL_LANE].hp
sg.monsters.length = 0
sg._monsterSpawnTimer = 999 // 冻结持续生成，排除干扰
const nearMonster = { lane: MONSTER_LANE, y: 380, hp: 5, maxHp: 5, speed: 60 } // 更靠近玩家
const farMonster = { lane: MONSTER_LANE, y: 200, hp: 5, maxHp: 5, speed: 60 }
sg.monsters.push(nearMonster, farMonster)

// 子弹只命中弹道上最靠近玩家的怪物，单发只命中一个目标
for (let i = 0; i < 60 && nearMonster.hp === 5; i++) engine.update(1 / 60)
assert.ok(nearMonster.hp === 5 - sg.attackDamage, '子弹应命中更靠近玩家的怪物')
assert.equal(farMonster.hp, 5, '远端怪物不应被命中')
assert.equal(sg._gateByLane[BUFF_LANE].hp, atkGateHpSnapshot, '怪物 lane 的子弹不应命中 ATK Gate')
assert.equal(sg._gateByLane[SPECIAL_LANE].hp, rapidGateHpSnapshot, '怪物 lane 的子弹不应命中 Rapid Gate')

// 击杀：HP 归零后从数组移除
nearMonster.hp = 1 // 快进：下一发命中即击杀
const killBreachBefore = sg.breachCount
for (let i = 0; i < 120 && sg.monsters.includes(nearMonster); i++) engine.update(1 / 60)
assert.ok(!sg.monsters.includes(nearMonster), '击杀后怪物应从数组移除')
assert.equal(farMonster.hp, 5, '击杀不影响远端怪物')
assert.equal(sg.breachCount, killBreachBefore, '应记为击杀而非突破（未到达玩家区域）')

// 突破：到达玩家区域 → 移除 + breachCount 只增加一次 + 扣 1 点生命
const breachBefore = sg.breachCount
farMonster.y = sg.playerY - 10 // 直接拉到玩家区域，模拟到达
engine.update(1 / 60)
assert.equal(sg.breachCount, breachBefore + 1, '怪物到达玩家区域应记录一次突破')
assert.ok(!sg.monsters.includes(farMonster), '突破的怪物应被移除')
assert.equal(sg.hp, sg.maxHp - 1, '每次突破应扣除 1 点生命')
engine.update(1 / 60)
assert.equal(sg.breachCount, breachBefore + 1, '突破只应记录一次（不会重复计数）')

// —— 生命与失败：再次突破扣血归零 → gameOver → 世界冻结 ——
assert.equal(sg.hp, sg.maxHp - 1, '此前一次突破应已扣除 1 点生命')
sg.hp = 1 // 快进：再突破一次即失败
const lifeBreachBefore = sg.breachCount
sg.monsters.length = 0
sg.monsters.push({ lane: MONSTER_LANE, y: sg.playerY - 10, hp: 5, maxHp: 5, speed: 0 })
engine.update(1 / 60)
assert.equal(sg.breachCount, lifeBreachBefore + 1, '失败前的突破仍应计数')
assert.equal(sg.hp, 0, '生命应钳制为 0（不为负）')
assert.equal(sg.gameOver, true, '生命归零应进入失败状态')

// gameOver 后世界冻结：时间/射击/怪物/玩家移动/Gate 全停（渲染继续）
sg.elapsedTime = 0 // 从 0 起观测冻结（失败后不应增长）
const frozenShots = shotCount
const frozenBullets = sg._bullets.length
sg._monsterSpawnTimer = 0 // 即使到点也不应生成
engine.input.state.right = true // 即使按键也不应切换通道
for (let i = 0; i < 20; i++) engine.update(1 / 60)
engine.input.state.right = false
assert.equal(sg.elapsedTime, 0, '失败后 elapsedTime 不再增长')
assert.equal(shotCount, frozenShots, '失败后不应继续射击')
assert.equal(sg._bullets.length, frozenBullets, '失败后子弹不应推进或新增')
assert.equal(sg.monsters.length, 0, '失败后不应生成怪物')
assert.equal(sg.currentLane, MONSTER_LANE, '失败后玩家移动应冻结')
sg._gateByLane[BUFF_LANE] = null
sg._gateRespawnTimers[BUFF_LANE] = 0
engine.update(1 / 60)
assert.equal(sg._gateByLane[BUFF_LANE], null, '失败后 Gate 不应重生')
engine.render() // 失败状态渲染冒烟（遮罩 + GAME OVER + 生存时间 + 突破次数）

// restart：恢复完整初始状态并让世界重新运转
sg.restart()
assert.equal(sg.hp, sg.maxHp, 'restart 应恢复生命')
assert.equal(sg.gameOver, false, 'restart 应清除失败状态')
assert.equal(sg.attackDamage, 1, 'restart 应恢复初始攻击力')
assert.equal(sg.rapidFireTimer, 0, 'restart 应清空急速状态')
assert.equal(sg.breachCount, 0, 'restart 应清零突破计数')
assert.equal(sg.elapsedTime, 0, 'restart 应清零已进行时间')
assert.equal(sg.currentLane, BUFF_LANE, 'restart 应回到中间通道')
assert.ok(Math.abs(sg.playerX - sg.laneCenterX(BUFF_LANE)) < 1e-6, 'restart 后玩家应回到中间通道中心')
assert.equal(sg.monsters.length, 1, 'restart 应立即生成第一只怪物')
assert.equal(sg._bullets.length, 0, 'restart 应清空子弹')
assert.equal(sg._gateByLane[MONSTER_LANE], null, 'restart 后怪物 lane 不应有 Gate')
assert.ok(
  sg._gateByLane[BUFF_LANE] && sg._gateByLane[BUFF_LANE].hp === sg._gateByLane[BUFF_LANE].maxHp,
  'restart 后 ATK Gate 应满血重生'
)
assert.ok(
  sg._gateByLane[SPECIAL_LANE] && sg._gateByLane[SPECIAL_LANE].kind === 'rapid',
  'restart 后 Rapid Gate 应就位'
)
const resumedShots = shotCount
engine.update(1 / 60)
assert.ok(sg.elapsedTime > 0, 'restart 后时间应恢复增长')
assert.ok(shotCount > resumedShots, 'restart 后应恢复射击')

// —— 持续生成：多怪同屏 + 数量上限 + 时间压力曲线 ——
// 生命机制已专项验证，这里把生命拉满，避免自然突破触发 gameOver 干扰后续断言
sg.hp = 9999
sg._bullets.length = 0
sg.monsters.length = 0
sg._monsterSpawnTimer = 0
// 持续生成按「累计生成次数」验证：突破清场与生成并存时并发数量存在随机涨落
let spawnCount = 0
const monsterPush = sg.monsters.push.bind(sg.monsters)
sg.monsters.push = (monster) => {
  spawnCount++
  return monsterPush(monster)
}
for (let i = 0; i < 600 && spawnCount < 3; i++) engine.update(1 / 60)
assert.ok(spawnCount >= 3, '生成计时器应持续产出怪物')
// 同时存在多只：直接置入多只受控怪物，验证并发更新/渲染路径
sg.monsters.length = 0
for (let i = 0; i < 5; i++) sg._spawnMonster()
assert.equal(sg.monsters.length, 5, '应支持多只怪物同时存在')
assert.ok(
  sg.monsters.every((m) => m.lane === MONSTER_LANE && m.hp > 0 && m.speed > 0),
  '每只怪物数据应有效'
)

// 数量上限：强制连续生成也不超过 MAX_MONSTERS
sg.monsters.length = 0
for (let i = 0; i < 30; i++) {
  sg._monsterSpawnTimer = 0
  engine.update(1 / 60)
}
assert.equal(sg.monsters.length, MAX_MONSTERS, '持续生成应被数量上限封顶')

// 时间曲线：elapsedTime 越大，怪物 HP/速度更高、生成间隔更短
sg.elapsedTime = 180
sg.monsters.length = 0
sg._monsterSpawnTimer = 0
engine.update(1 / 60)
const lateMonster = sg.monsters[0]
assert.ok(lateMonster && lateMonster.maxHp > earlyMaxHp, '时间越长怪物 HP 应越高')
assert.ok(lateMonster.speed > earlySpeed, '时间越长怪物速度应越高')
assert.ok(sg.monsterSpawnInterval() < earlyInterval, '时间越长生成间隔应越短')
assert.ok(sg.monsters.length <= MAX_MONSTERS, '后期生成同样受上限约束')

// —— ATK Gate（BUFF_LANE）：扣血 / 打爆强化 / 重生 ——
assert.equal(sg.currentLane, BUFF_LANE, '应已在 ATK lane')
// 压力测试期间玩家一直停在 ATK lane 射击，Gate 可能正处于重生窗口；
// 强制立即重生后再做 ATK Gate 专项验证
sg._gateByLane[BUFF_LANE] = null
sg._gateRespawnTimers[BUFF_LANE] = 0
for (let i = 0; i < 30 && !sg._gateByLane[BUFF_LANE]; i++) engine.update(1 / 60)
assert.ok(sg._gateByLane[BUFF_LANE], 'ATK Gate 应重生就位')
const atkGateHpBefore = sg._gateByLane[BUFF_LANE].hp
for (let i = 0; i < 40 && sg._gateByLane[BUFF_LANE].hp === atkGateHpBefore; i++) engine.update(1 / 60)
assert.ok(sg._gateByLane[BUFF_LANE].hp < atkGateHpBefore, 'ATK lane 子弹应命中 ATK Gate 扣血')
assert.equal(sg._gateByLane[SPECIAL_LANE].hp, rapidGateHpSnapshot, 'Rapid Gate 不应被命中')
const damageBefore = sg.attackDamage
sg._gateByLane[BUFF_LANE].hp = sg.attackDamage // 快进：一发打爆
for (let i = 0; i < 60 && sg._gateByLane[BUFF_LANE]; i++) engine.update(1 / 60)
assert.equal(sg._gateByLane[BUFF_LANE], null, '打爆后 ATK Gate 应消失')
assert.equal(sg.attackDamage, damageBefore + 1, '打爆 ATK Gate 应获得永久攻击强化')
for (let i = 0; i < 420 && !sg._gateByLane[BUFF_LANE]; i++) engine.update(1 / 60)
assert.ok(
  sg._gateByLane[BUFF_LANE] && sg._gateByLane[BUFF_LANE].hp === sg._gateByLane[BUFF_LANE].maxHp,
  'ATK Gate 应按间隔重生且满血'
)

// —— Rapid Gate（SPECIAL_LANE）：打爆后射速 ×2，到期恢复 ——
engine.input.state.right = true
engine.update(1 / 60)
engine.input.state.right = false
engine.update(1 / 60)
assert.equal(sg.currentLane, SPECIAL_LANE, '应切到 Rapid lane')
const rapidDamageBefore = sg.attackDamage
sg._gateByLane[SPECIAL_LANE].hp = sg.attackDamage // 快进：一发打爆
for (let i = 0; i < 60 && sg._gateByLane[SPECIAL_LANE]; i++) engine.update(1 / 60)
assert.equal(sg._gateByLane[SPECIAL_LANE], null, '打爆后 Rapid Gate 应消失')
assert.equal(sg.attackDamage, rapidDamageBefore, 'Rapid Gate 不应提升攻击力')
assert.ok(sg.rapidFireTimer > 0, '急速射击效果应激活')

// 效果期间：1 秒约 10 发（基础 5 发/秒的 ×2）
const rapidStart = shotCount
for (let i = 0; i < 60; i++) engine.update(1 / 60)
assert.ok(Math.abs(shotCount - rapidStart - 10) <= 1, '急速期间 1 秒应射出约 10 发（×2）')
assert.ok(sg.rapidFireTimer > 0, '6 秒效果仍在持续')

// 离开 Rapid lane：继续留在 lane 2 会把重生后的 Rapid Gate 再次打爆、
// 无限刷新效果——真实玩法中玩家会自行离开，这里切回怪物 lane 等待到期
engine.input.state.left = true
engine.update(1 / 60)
engine.input.state.left = false
engine.update(1 / 60)
engine.input.state.left = true
engine.update(1 / 60)
engine.input.state.left = false
engine.update(1 / 60)
assert.equal(sg.currentLane, MONSTER_LANE, '应离开 Rapid lane')

// 效果结束：快进剩余时间（无新增命中，效果自然到期）后射速恢复 5 发/秒
for (let i = 0; i < 400 && sg.rapidFireTimer > 0; i++) engine.update(1 / 60)
assert.equal(sg.rapidFireTimer, 0, '效果应到期结束')
const normalStart = shotCount
for (let i = 0; i < 60; i++) engine.update(1 / 60)
assert.ok(Math.abs(shotCount - normalStart - 5) <= 1, '效果结束后应恢复 5 发/秒')

// Rapid Gate 按冷却重生
for (let i = 0; i < 300 && !sg._gateByLane[SPECIAL_LANE]; i++) engine.update(1 / 60)
assert.ok(
  sg._gateByLane[SPECIAL_LANE] &&
    sg._gateByLane[SPECIAL_LANE].kind === 'rapid' &&
    sg._gateByLane[SPECIAL_LANE].hp === sg._gateByLane[SPECIAL_LANE].maxHp,
  'Rapid Gate 应按间隔重生且满血'
)
engine.render() // 渲染冒烟（怪物/双 Gate/职责标识/子弹）

// —— 切 lane 后：新子弹跟随新 lane（右切到 ATK lane）——
engine.input.state.right = true
engine.update(1 / 60)
engine.input.state.right = false
engine.update(1 / 60)
assert.equal(sg.currentLane, BUFF_LANE, '应切到 ATK lane')
// 等待上限放宽到 30 帧：覆盖「切换前冷却刚好重置」的最坏相位
for (
  let i = 0;
  i < 30 && !sg._bullets.some((b) => b.lane === BUFF_LANE);
  i++
) {
  engine.update(1 / 60)
}
assert.ok(sg._bullets.some((b) => b.lane === BUFF_LANE), '切 lane 后新子弹应属于新 lane')

// —— resize 后子弹 X 吸附所属 lane 中心，怪物仍归属原 lane ——
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
  sg.monsters.every((m) => m.lane === MONSTER_LANE),
  'resize 后在场怪物仍归属 MONSTER_LANE'
)
engine.render() // 射击渲染冒烟（怪物/血条/子弹）

// —— 自动射击补发：大 dt 跨多个间隔时补齐，且不超过安全上限 ——
const sg2 = engine.configureGameplay('runner') // 全新实例，独立计时
let catchUpShots = 0
const catchUpPush = sg2._bullets.push.bind(sg2._bullets)
sg2._bullets.push = (bullet) => {
  catchUpShots++
  return catchUpPush(bullet)
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
console.log('✓ Runner 怪物压力：多怪同屏/上限封顶/时间曲线/最近命中/击杀移除/突破扣血/gameOver 冻结/restart 恢复全链可用')

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
