// 暴食猎食点 · 180 秒真实回归（固定 seed，短程）。
// 运行：node verify-glutton-regression.mjs
//
// 目的不是复测消融参数，而是确认正式落地后的资源循环在**真实引擎闭环**里：
//   - 首点出现时间仍大致合理（不是开局 3 秒满仓，也不是整局都攒不到）；
//   - 正常局里 F 真的会被用到；
//   - 每次 F 额外吞噬的敌人数量是「少量」（不是一键清场）；
//   - 不存在资源无限循环（F 不返充 → 点数只能靠正常吞噬产生）；
//   - 满仓丢弃（点数用不出去被冻结）与产点恒等式被显式区分，不互相混淆；
//   - 没有新的崩溃 / NaN / 越界状态。
//
// 口径说明：每个 seed 跑满 180 秒**墙钟时间**；玩家阵亡则走引擎官方重开
// （reset）继续，因此统计的是「180 秒真实对局里资源循环发生了什么」，
// 而不是「一个无敌 bot 能撑多久」。吞噬来源靠包装 WeaponSystem.onDevoured
// 读取引擎真实传入的 ctx.source 统计——不在测试里另造一套判定。
import assert from 'node:assert/strict'

// —— 浏览器环境桩（与 engine-smoke.mjs 同构） ——
const gradient = { addColorStop() {} }
const ctx2d = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => gradient
      return () => {}
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
const { SKILL_DATABASE } = await import('./src/game/SkillPool.js')
const {
  DEVOUR_SOURCE_GLUTTON,
  GLUTTON_BOSS_CAPSTONE_HITS_PER_CHARGE,
  GLUTTON_BOSS_ERUPTION_MAX_SHOTS,
  GLUTTON_BOSS_HITS_PER_CHARGE,
  GLUTTON_CHARGE_MAX,
  GLUTTON_DEVOURS_PER_CHARGE,
  canGluttonBiteBoss,
  canGluttonHunt,
  getGluttonBossProgressMultiplier,
  getGluttonBossProgressThreshold,
  getGluttonMawDamageMultiplier,
  hasGluttonResource,
} = await import('./src/game/GluttonResource.js')

const realRandom = Math.random
/** 线性同余 RNG：给每局一个可复现的随机流（暴击/掉落/刷怪都走 Math.random） */
const seedRandom = (seed) => {
  let s = (seed >>> 0) || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const DT = 1 / 60
const FRAMES = 180 * 60 // 180 秒
const SEEDS = [20260926, 20260927, 20260928, 20260929, 20260930, 20260931, 20260932, 20260933]

/** 「值得按 F」的目标：320px 内、落在额外带 (N, M] 上（用引擎自己的资格口径判断） */
function findHuntTarget(engine) {
  const player = engine.player
  for (const e of engine.enemyManager.enemies) {
    if (canGluttonHunt(e, player)) return e
  }
  return null
}

function runSeed(seed) {
  const engine = GameEngine.create(canvasStub)
  const stats = {
    seed,
    levelUps: 0,
    firstChargeAt: null,
    firstCastAt: null,
    maxCharge: 0,
    casts: 0,
    castExtras: [],
    normalDevours: 0,
    segmentNormal: 0,
    segmentGains: 0,
    segmentDiscarded: 0,
    discardedDevours: 0,
    castsInSegment: 0,
    chargesSpent: 0,
    identityChecks: 0,
    fDevours: 0,
    maxProgress: 0,
    deaths: 0,
    frames: 0,
    segments: [],
  }
  let segmentStart = 0

  engine.onStats = () => {}
  engine.onGameOver = () => {}
  engine.onBossSpawn = () => {}
  engine.onWaveChanged = () => {}
  engine.onEvolution = () => {}
  engine.onLevelUp = (options) => {
    stats.levelUps++
    if (options.length > 0) engine.applySkill(options[0])
    engine.resume() // 面板选完立即恢复（模拟真人点选）
  }

  // 包装吞噬结算：读取引擎真实传入的 ctx.source —— 来源标记的可观测证据。
  // 只包装**一次**（每局重装会层层叠加闭包，旧闭包写的计数器会被丢弃），
  // 计数器统一挂在 stats 上，重开一局只是把本局计数器归零。
  // 产点判定：点数 +1，或进度绕回（4 → 1，进度减少只可能由产点触发）——覆盖满仓与否。
  // 满仓丢弃判定（A 口径下必然发生，且是正式契约的一部分）：普通吞噬后**点数与进度都没动**
  // → 这一次吞噬被「满仓进度冻结」吃掉了。它必须被显式计数，否则产点恒等式必然误报。
  const ws = engine.weaponSystem
  const originalOnDevoured = ws.onDevoured.bind(ws)
  ws.onDevoured = (enemy, ctx) => {
    const pl = engine.player
    const isF = ctx?.source === DEVOUR_SOURCE_GLUTTON
    const chargeBeforeThis = pl.gluttonCharge
    const progressBeforeThis = pl.gluttonDevourProgress
    if (isF) {
      stats.fDevours++
    } else {
      stats.segmentNormal++
      stats.normalDevours++
    }
    const r = originalOnDevoured(enemy, ctx)
    if (!isF && hasGluttonResource(pl)) {
      if (pl.gluttonCharge > chargeBeforeThis || pl.gluttonDevourProgress < progressBeforeThis) {
        stats.segmentGains++
      } else if (pl.gluttonCharge >= GLUTTON_CHARGE_MAX) {
        stats.segmentDiscarded++
        stats.discardedDevours++
      }
    }
    return r
  }

  /** 段（一局）收尾：把「本局的普通吞噬 / 产点 / 满仓丢弃 / 用点」配对存证 */
  const closeSegment = () => {
    stats.segments.push({
      normal: stats.segmentNormal,
      gains: stats.segmentGains,
      discarded: stats.segmentDiscarded,
      spent: stats.castsInSegment,
    })
    stats.castsInSegment = 0
    stats.segmentNormal = 0
    stats.segmentGains = 0
    stats.segmentDiscarded = 0
  }

  Math.random = seedRandom(seed)
  try {
    engine.applyStartingStrain('glutton') // reset 包装在 applyStrain 之前装好
    engine.reset()
    engine.running = true
    segmentStart = 0
    const player = engine.player
    for (let i = 0; i < FRAMES; i++) {
      // 本帧起点：F 的吞噬数与点数（F 释放是同步的，必须在它之前取快照）
      const fBefore = stats.fDevours
      const chargeBefore = player.gluttonCharge

      // —— F：有点数且存在合法猎物就放（资源型 F 的典型使用时机） ——
      // 放在阵亡检查之前：_updateStrainSkill 在 !running 时会直接短路，
      // 因此这一步不会在「已结算的上一局」上产生任何副作用。
      if (!player.dead && hasGluttonResource(player) && player.gluttonCharge > 0 && player.gluttonRecastLock <= 0) {
        if (findHuntTarget(engine)) {
          engine.input.queueFever()
          engine._updateStrainSkill(0)
        }
      }

      // 阵亡即走官方重开入口继续（不是让 bot 无敌，而是让 180s 墙钟跑满）
      if (player.dead) {
        stats.deaths++
        closeSegment()
        engine.start()
        engine.reset()
        engine.running = true
        segmentStart = i
        // 本局的普通吞噬 / 点数获取都从头开始，逐帧恒等式以重开后的状态为基准
        stats.segmentNormal = 0
        stats.segmentGains = 0
        stats.segmentDiscarded = 0
        stats.castsInSegment = 0
        continue
      }
      const env = engine.enemyManager.enemies

      // —— 简单战斗 AI（风筝 + 抓吞噬窗口） ——
      // 默认朝「让最近敌人最远」的 8 个方向逃跑（暴食只有 6 点生命，贴脸群怪必死），
      // 只有吞噬窗口才主动贴上去；冲刺每冷却好就用——无敌帧是它唯一可靠的生存手段。
      const NEAR = 200
      let prey = null
      let preyD2 = Infinity
      const nearby = []
      for (const e of env) {
        const dx = e.x - player.x
        const dy = e.y - player.y
        const d2 = dx * dx + dy * dy
        if (e.devourable && !e.isBoss && d2 < preyD2) {
          preyD2 = d2
          prey = e
        }
        if (d2 < NEAR * NEAR) nearby.push({ x: e.x, y: e.y })
      }
      let moveX = 0
      let moveY = 0
      if (preyD2 <= 130 * 130 && prey) {
        const d = Math.sqrt(preyD2) || 1
        moveX = (prey.x - player.x) / d
        moveY = (prey.y - player.y) / d
      } else if (nearby.length > 0) {
        let bestScore = -1
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2
          const dx = Math.cos(a)
          const dy = Math.sin(a)
          let score = Infinity
          for (const e of nearby) {
            const ex = player.x + dx * 120
            const ey = player.y + dy * 120
            const d2 = (e.x - ex) ** 2 + (e.y - ey) ** 2
            if (d2 < score) score = d2
          }
          if (score > bestScore) {
            bestScore = score
            moveX = dx
            moveY = dy
          }
        }
      }
      // —— F：有点数且存在合法猎物就放（资源型 F 的典型使用时机） ——
      const s = engine.input.state
      s.left = moveX < -0.35
      s.right = moveX > 0.35
      s.up = moveY < -0.35
      s.down = moveY > 0.35
      // 本帧快照：F 的吞噬按同一窗口统计（必须紧贴 engine.update，F 释放会同步产生吞噬）
      engine.update(DT)
      stats.frames++

      const castThisFrame = stats.fDevours - fBefore
      if (castThisFrame > 0) {
        stats.casts++
        stats.castsInSegment++
        stats.chargesSpent++
        stats.castExtras.push(castThisFrame)
        if (stats.firstCastAt === null) stats.firstCastAt = (i + 1 - segmentStart) * DT
      }
      // 本次 F 真实消耗的点数 = 帧起点存量 − 帧内（扣点后）最小值；正常路径下就是 1
      if (castThisFrame > 0 && chargeBefore < 1) {
        throw new Error(`seed ${seed} 第 ${i} 帧：F 产生了 ${castThisFrame} 个吞噬，但帧起点没有可用点数`)
      }
      if (player.gluttonCharge > stats.maxCharge) stats.maxCharge = player.gluttonCharge
      if (stats.firstChargeAt === null && player.gluttonCharge > 0) {
        stats.firstChargeAt = (i + 1 - segmentStart) * DT
      }

      // —— 核心回归（分块版）：每 120 帧校验一次「产点恒等式」 ——
      // 有效普通吞噬 = 普通吞噬 − 满仓被冻结丢弃的那些；本局实测产点数（segmentGains，
      // 由每次吞噬结算后真实观测得到）必须恰好等于 floor(有效普通吞噬 / 5)。
      // F 的吞噬若参与返充，segmentGains 必然偏大 → 立刻失败（纯上界另有一条硬断言）。
      if (i % 120 === 0 && !player.dead) {
        const effective = stats.segmentNormal - stats.segmentDiscarded
        const expected = Math.floor(effective / GLUTTON_DEVOURS_PER_CHARGE)
        assert.equal(
          stats.segmentGains,
          expected,
          `seed ${seed} 第 ${i} 帧：普通吞噬 ${stats.segmentNormal}（其中 ${stats.segmentDiscarded} 次因满仓冻结丢弃）` +
            ` 应产 ${expected} 点，实测产 ${stats.segmentGains} 点（本局 F 吞噬 ${stats.fDevours} 全程不产点）`
        )
        stats.identityChecks++
      }

      if (player.gluttonDevourProgress > stats.maxProgress) stats.maxProgress = player.gluttonDevourProgress

      assert.ok(Number.isFinite(player.x) && Number.isFinite(player.y), `seed ${seed}：玩家坐标未出现 NaN`)
      assert.ok(
        player.gluttonCharge >= 0 && player.gluttonCharge <= GLUTTON_CHARGE_MAX,
        `seed ${seed}：猎食点必须始终落在 [0, 2]`
      )
      assert.ok(
        player.gluttonDevourProgress >= 0 && player.gluttonDevourProgress < GLUTTON_DEVOURS_PER_CHARGE,
        `seed ${seed}：吞噬进度必须始终落在 [0, 4]`
      )
    }
    closeSegment()
    engine.destroy()
    return stats
  } finally {
    Math.random = realRandom
  }
}

console.log(`暴食 180s 真实回归（${SEEDS.length} 个固定 seed，每个跑满 180s 墙钟）`)
const results = []
for (const seed of SEEDS) {
  const t0 = Date.now()
  const stats = runSeed(seed)
  results.push(stats)
  const avgExtra = stats.castExtras.length
    ? (stats.castExtras.reduce((a, b) => a + b, 0) / stats.castExtras.length).toFixed(2)
    : '—'
  console.log(
    `  seed ${stats.seed}: 正常吞噬 ${stats.normalDevours}（满仓冻结 ${stats.discardedDevours} 次）` +
      ` · F 吞噬 ${stats.fDevours}（${stats.casts} 次释放）` +
      ` · 每次 F 额外吞噬 平均 ${avgExtra}（最大 ${Math.max(0, ...stats.castExtras)}）` +
      ` · 首点 ${stats.firstChargeAt === null ? '未获得' : stats.firstChargeAt.toFixed(1) + 's'}` +
      ` · 峰值 ${stats.maxCharge}/${GLUTTON_CHARGE_MAX} · 进度峰值 ${stats.maxProgress}/${GLUTTON_DEVOURS_PER_CHARGE}` +
      ` · 升级 ${stats.levelUps} · 阵亡重开 ${stats.deaths} · 帧 ${stats.frames}/${FRAMES}` +
      ` · ${((Date.now() - t0) / 1000).toFixed(1)}s`
  )
}

// —— 断言：只锁定结构事实与粗区间，不锁死具体秒数（避免把随机性变成 flaky 测试） ——
let n = 0
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`)

assert.ok(
  results.every((r) => r.frames >= FRAMES - 10),
  `每个 seed 都必须跑满 180 秒（死亡重开会跳掉若干帧；实际 ${results
    .map((r) => (r.frames / 60).toFixed(1) + 's')
    .join(' / ')}）`
)
assert.ok(
  results.every((r) => r.normalDevours > 0),
  '普通吞噬必须在真实对局里发生（资源循环的前提）'
)
assert.ok(
  results.every((r) => r.maxCharge <= GLUTTON_CHARGE_MAX),
  '猎食点从未越过上限 2'
)
assert.ok(
  results.every((r) => r.maxProgress < GLUTTON_DEVOURS_PER_CHARGE),
  '帧边界上的吞噬进度从未达到 5（满即结算为点数，不残留）'
)
const withCharge = results.filter((r) => r.firstChargeAt !== null)
assert.ok(withCharge.length >= Math.ceil(results.length / 2), '多数 seed 在 180 秒内都拿得到猎食点')
for (const r of withCharge) {
  assert.ok(r.firstChargeAt > 4, `seed ${r.seed}：首点不应在开局 4 秒内出现（实际 ${r.firstChargeAt.toFixed(1)}s）`)
  assert.ok(r.firstChargeAt < 180, `seed ${r.seed}：首点应在单局内出现（实际 ${r.firstChargeAt.toFixed(1)}s）`)
}
ok(
  `首点出现时间合理（${withCharge.length}/${results.length} 个 seed 获得，最快 ${Math.min(
    ...withCharge.map((r) => r.firstChargeAt)
  ).toFixed(1)}s，最慢 ${Math.max(...withCharge.map((r) => r.firstChargeAt)).toFixed(1)}s）`
)

assert.ok(
  results.some((r) => r.casts > 0),
  '正常局里 F 必须被真实用到（资源能转化为主动捕食）'
)
const allExtras = results.flatMap((r) => r.castExtras)
assert.ok(allExtras.length > 0, '至少发生一次 F 主动捕食')
assert.ok(allExtras.every((count) => count >= 1), '每次成功释放至少吞掉 1 个目标（空放不计为释放）')
const avgExtra = allExtras.reduce((a, b) => a + b, 0) / allExtras.length
const maxExtra = Math.max(...allExtras)
// 正式口径 = A（额外带上限 ceil(maxHp × (T + 0.05))）。上界按 eligibility 审计的
// 「保留标准」收紧：正常局通常 1~3 只、6+ 极少。曾经的「吞噬线 + 1 HP」口径
// （B）在同一批 seed 上实测平均 3.62、单次最大 12，会直接撞穿这两条上界。
assert.ok(avgExtra <= 3, `F 每次额外吞噬仍是「少量」（平均 ${avgExtra.toFixed(2)} 个，上限 3）`)
assert.ok(maxExtra <= 6, `单次 F 上限未失控（最大 ${maxExtra} 个，上限 6）`)
ok(`F 每点额外吞噬量级（平均 ${avgExtra.toFixed(2)}，单次最大 ${maxExtra}）`)

// 核心回归（真实对局版）：逐局验证两条恒等式。
//  (1) 硬上界：gains ≤ floor(正常吞噬 / 5) —— F 只要返充一次就会立刻打破，这是护栏本体。
//  (2) 精确恒等式：gains == floor((正常吞噬 − 满仓丢弃) / 5)。
//      A 口径（额外带 ceil 量化）下 F 机会少 → 点数常满仓 → 进度被冻结丢弃，
//      这部分**必须**显式计入，否则恒等式会把正式契约误报成异常。
for (const r of results) {
  for (const [i, seg] of r.segments.entries()) {
    assert.ok(
      seg.gains <= Math.floor(seg.normal / GLUTTON_DEVOURS_PER_CHARGE),
      `seed ${r.seed} 第 ${i + 1} 局：实测产点 ${seg.gains} 不得超过普通吞噬换算上限 ` +
        `${Math.floor(seg.normal / GLUTTON_DEVOURS_PER_CHARGE)}（超出即 F 返充）`
    )
    const effective = seg.normal - seg.discarded
    assert.equal(
      seg.gains,
      Math.floor(effective / GLUTTON_DEVOURS_PER_CHARGE),
      `seed ${r.seed} 第 ${i + 1} 局：普通吞噬 ${seg.normal}（满仓丢弃 ${seg.discarded}）→ 有效 ${effective}` +
        ` 应产 ${Math.floor(effective / GLUTTON_DEVOURS_PER_CHARGE)} 点，实测产 ${seg.gains} 点`
    )
    assert.ok(seg.spent <= seg.gains + GLUTTON_CHARGE_MAX, `seed ${r.seed} 第 ${i + 1} 局：用点未超过产点 + 期初存量`)
  }
}
const totalSegments = results.reduce((a, r) => a + r.segments.length, 0)
const totalCasts = results.reduce((a, r) => a + r.casts, 0)
const totalFDevours = results.reduce((a, r) => a + r.fDevours, 0)
const totalNormal = results.reduce((a, r) => a + r.normalDevours, 0)
const totalDiscarded = results.reduce((a, r) => a + r.discardedDevours, 0)
const totalGains = results.reduce((a, r) => a + r.segments.reduce((s, x) => s + x.gains, 0), 0)
const totalChecks = results.reduce((a, r) => a + r.identityChecks, 0)
assert.ok(totalChecks > 100, `产点恒等式覆盖了足够多的采样点（${totalChecks} 次）`)
assert.ok(totalCasts > 0 && totalFDevours >= totalCasts, 'F 的吞噬量来自真实释放')

// 每点购买力：这一轮 eligibility 审计的核心指标（A ≈ 1.13 / B ≈ 3.62 同批 seed）。
// 用上界锁死，避免「额外带」被悄悄放宽回去。
const perCharge = totalCasts > 0 ? totalFDevours / totalCasts : 0
assert.ok(
  perCharge <= 2.5,
  `每点猎食点的购买力仍是「少量」（${perCharge.toFixed(2)} 个/点，上限 2.5；` +
    '历史口径「吞噬线 + 1 HP」在同批 seed 上实测为 3.62）'
)
ok(`每点猎食点购买力：${totalCasts} 次释放 → ${totalFDevours} 个吞噬，平均 ${perCharge.toFixed(2)} 个/点`)
ok(
  `产点恒等式逐局成立（共 ${totalSegments} 局）：普通吞噬 ${totalNormal}，其中 ${totalDiscarded} 次因满仓被冻结` +
    `（约合 ${Math.floor(totalDiscarded / GLUTTON_DEVOURS_PER_CHARGE)} 点没被用出去）；` +
    `逐局实测产点合计 ${totalGains}（跨局残进度随重开清零，故不等于全局换算值）` +
    ` → F ${totalCasts} 次（F 自身吞噬 ${totalFDevours} 个，零返充）`
)
// 口径指纹：A（额外带上限 ceil 量化）下 F 机会稀少 → 点数经常用不出去而被满仓冻结。
// 「吞噬线 + 1 HP」的旧口径在同一批 seed 上丢弃率为 0——因此这条断言同时也是
// 「正式口径确实是 A」的可观测证据。
assert.ok(
  totalDiscarded > 0,
  `A 口径下满仓丢弃必须真实出现（实测 ${totalDiscarded} 次；旧口径为 0，若为 0 说明口径已退化）`
)

assert.ok(
  results.every((r) => r.deaths < 40),
  '阵亡重开次数正常（没有出现每帧暴毙的异常状态）'
)
ok('全程无崩溃、无 NaN、无越界资源状态')

// ============================================================================
// 第二部分：正式源码 Boss 战回归验证（8 seeds × 三档合法构筑：Lv.1 / Lv.8 / Lv.14）
// ============================================================================
const SKILL_MAP = new Map()
for (const [key, tree] of Object.entries(SKILL_DATABASE)) {
  const list = key === 'common' ? tree : [...(tree.primary || []), ...(tree.secondary || [])]
  for (const s of list) SKILL_MAP.set(s.id, s)
}

const BOSS_BUILDS = [
  {
    id: 'Lv.1 空技能',
    level: 1,
    budget: 0,
    primarySpec: null,
    secondarySpec: null,
    skills: {},
  },
  {
    id: 'Lv.8 合法构筑(7点)',
    level: 8,
    budget: 7,
    primarySpec: 'gluttony',
    secondarySpec: null,
    skills: {
      glut_maw: 2,
      glut_bulk: 1,
      glut_ram: 2,
      glut_eruption: 1,
      com_vital: 1,
    },
  },
  {
    id: 'Lv.14 合法构筑(12点)',
    level: 14,
    budget: 12,
    primarySpec: 'gluttony',
    secondarySpec: 'gluttony',
    skills: {
      glut_maw: 3,
      glut_bulk: 2,
      glut_ram: 2,
      glut_eruption: 2,
      glut_capstone: 1,
      glut_sub_armor: 1,
      glut_sub_digest: 1,
    },
  },
]

/** 校验构筑合法性（点数预算、前置链、capstone 等级门槛、副专精归属） */
function assertBuildLegal(build) {
  const spent = Object.values(build.skills).reduce((a, b) => a + b, 0)
  assert.equal(spent, build.budget, `${build.id}：技能点总和必须严格等于预算 ${build.budget}`)
  if (build.level < 14) {
    assert.ok(!build.skills.glut_capstone, `${build.id}：Lv.14 前不得包含 glut_capstone`)
  }
  for (const [id, lv] of Object.entries(build.skills)) {
    const s = SKILL_MAP.get(id)
    assert.ok(s, `${build.id}：技能 ${id} 存在`)
    assert.ok(lv >= 1 && lv <= s.maxLevel, `${build.id}：${id} 等级 ${lv} 不超过上限 ${s.maxLevel}`)
    if (s.requires?.length) {
      assert.ok(
        s.requires.some((reqId) => (build.skills[reqId] || 0) > 0),
        `${build.id}：${id} 满足前置 requires (${s.requires.join('/')})`
      )
    }
    if (id.startsWith('glut_sub_')) {
      assert.equal(build.secondarySpec, 'gluttony', `${build.id}：副专精技能 ${id} 要求 secondarySpec = gluttony`)
      assert.ok(build.level >= 9, `${build.id}：副专精技能要求等级 >= 9`)
    }
  }
}

for (const b of BOSS_BUILDS) assertBuildLegal(b)
ok('Boss 回归前置：Lv.1(0点) / Lv.8(7点) / Lv.14(12点) 三套构筑全部通过解锁与预算合法性校验')

/**
 * 在正式引擎上运行单场动态 Boss 战（无任何 BITE 探针开关注入，完全走正式源码）。
 */
function runFormalBossFight(build, seed) {
  const engine = GameEngine.create(canvasStub)
  for (const k of [
    'onStats', 'onGameOver', 'onBossSpawn', 'onBossGroupSpawn',
    'onWaveChanged', 'onEvolution', 'onRunState', 'onWorldEvent', 'onCooldown',
    'onGameplayHud', 'onExpeditionReward', 'onEndlessDecision', 'onFusionConfirm',
  ]) {
    engine[k] = () => {}
  }
  engine.onLevelUp = () => {
    engine.resume()
  }
  engine.setGenes({})
  Math.random = seedRandom(seed)
  try {
    engine.startingStrain = 'glutton'
    engine.reset()
    engine.running = true
    engine.input.suspended = false

    const em = engine.enemyManager
    const ws = engine.weaponSystem
    const player = engine.player

    em._enemies.length = 0
    em._bullets.length = 0
    em._devouring.length = 0
    em._bosses.length = 0
    em._boss = null
    em._bossEncounter = null
    em._bossCaster = null
    em._spawnTimer = Infinity
    em._waveTimer = -1e9
    em._earlyEliteDone = true

    player.level = build.level
    ws.levelMul = Math.pow(1.08, build.level - 1)
    engine.primarySpec = build.primarySpec
    engine.secondarySpec = build.secondarySpec
    engine._ensureRoleAwakening()

    for (const [id, lv] of Object.entries(build.skills)) {
      engine.skillLevels[id] = lv
      const skill = SKILL_MAP.get(id)
      for (let i = 1; i <= lv; i++) skill.apply(engine, i)
    }
    player.hp = player.maxHp

    // 生成 Wave 10 大法师 Boss（189 HP 基准夹具，关闭背景杂兵与召唤护卫以聚焦单 Boss 战斗回归）
    em._finale = true
    em.spawn = () => undefined
    em.spawnAt = () => undefined
    em.wave = 10
    const boss = em.spawnBoss({ type: 'boss-mage', memberHpMul: 1 })
    boss.maxHp = 189
    boss.hp = 189
    boss._onReinforce = () => {}
    boss.summonCd = Infinity
    boss.x = engine.worldWidth * 0.5 + 105
    boss.y = engine.worldHeight * 0.5
    em._enemies.length = 0
    em._bosses.length = 0
    em._enemies.push(boss)
    em._bosses.push(boss)
    em._boss = boss

    player.x = engine.worldWidth * 0.5 - 105
    player.y = engine.worldHeight * 0.5
    // 正式 Boss 机制回归探针：完整打完每一场 189 HP Boss，以精确校验四通道伤害归因总和 = Boss maxHp
    player.hit = () => {}

    const metrics = {
      seed,
      bossMaxHp: boss.maxHp,
      fCasts: 0,
      rechargeGained: 0,
      eligibleBasicHits: 0,
      basicHits: 0,
      basicDamage: 0,
      biteDamage: 0,
      rawBiteDamages: [],
      ramDamage: 0,
      eruptionHits: 0,
      eruptionDamage: 0,
      otherDamage: 0,
      poisonTriggers: 0,
      eruptionSpawns: 0,
      maxEruptionBatch: 0,
      ramDashes: 0,
      totalRamHitsOnBoss: 0,
      maxRamHitsInSingleDash: 0,
      currentDashRamHits: 0,
      digestHealsOnBite: 0,
      killed: false,
      ttk: null,
    }

    let pendingHitKind = null
    let lastDestroyedProj = null

    // 观测弹体销毁（WeaponSystem._resolveCollisions 中 p.destroy() 紧贴在 e.hit() 前一行调用）
    const wrapProjDestroy = (proj) => {
      if (!proj || proj._wrappedForBossReg) return
      proj._wrappedForBossReg = true
      const origDestroy = proj.destroy.bind(proj)
      proj.destroy = () => {
        lastDestroyedProj = proj
        return origDestroy()
      }
    }

    const origDashImpact = ws.dashImpact.bind(ws)
    ws.dashImpact = (target, dmg) => {
      if (target === boss) {
        metrics.totalRamHitsOnBoss++
        metrics.currentDashRamHits++
        if (metrics.currentDashRamHits > metrics.maxRamHitsInSingleDash) {
          metrics.maxRamHitsInSingleDash = metrics.currentDashRamHits
        }
        pendingHitKind = 'ram'
      }
      try {
        return origDashImpact(target, dmg)
      } finally {
        pendingHitKind = null
      }
    }

    const origFire = ws.fire.bind(ws)
    ws.fire = (target) => {
      const r = origFire(target)
      for (const p of ws._projectiles) wrapProjDestroy(p)
      return r
    }

    const origSpawnEruption = ws.spawnDevourEruption.bind(ws)
    ws.spawnDevourEruption = (x, y, opts) => {
      const count = origSpawnEruption(x, y, opts)
      if (opts?.bossBite && count > 0) {
        metrics.eruptionSpawns += count
        if (count > metrics.maxEruptionBatch) metrics.maxEruptionBatch = count
      }
      for (const p of ws._projectiles) wrapProjDestroy(p)
      return count
    }

    const origBossHit = boss.hit.bind(boss)
    boss.hit = (damage, effects) => {
      const kind =
        pendingHitKind ||
        (lastDestroyedProj?.isEruption
          ? 'eruption'
          : lastDestroyedProj?.isBasicAttack
          ? 'basic'
          : 'other')
      lastDestroyedProj = null
      const hpBefore = Math.max(0, boss.hp)
      const wasActive = boss.active
      if (kind === 'basic' && player.gluttonCharge < GLUTTON_CHARGE_MAX) {
        metrics.eligibleBasicHits++
      }
      if (kind === 'bite') {
        metrics.rawBiteDamages.push(damage)
      }
      origBossHit(damage, effects)
      const applied = wasActive ? Math.max(0, hpBefore - Math.max(0, boss.hp)) : 0
      if (boss.poison > 0 || boss.poisonHits > 0) metrics.poisonTriggers++
      if (kind === 'basic') {
        metrics.basicHits++
        metrics.basicDamage += applied
      } else if (kind === 'bite') {
        metrics.biteDamage += applied
      } else if (kind === 'ram') {
        metrics.ramDamage += applied
      } else if (kind === 'eruption') {
        metrics.eruptionHits++
        metrics.eruptionDamage += applied
      } else {
        metrics.otherDamage += applied
      }
    }

    const MAX_BOSS_FRAMES = 150 * 60 // 150s 上限
    let wasDashing = false

    for (let f = 0; f < MAX_BOSS_FRAMES; f++) {
      if (!boss.active || boss.hp <= 0) {
        metrics.killed = true
        metrics.ttk = f * DT
        break
      }

      const chargeBefore = player.gluttonCharge
      const hpBefore = player.hp

      // 1) 有猎食点且 Boss 在 320px 内 -> 按 F 释放正式 Boss Bite
      if (canGluttonBiteBoss(boss, player)) {
        engine.input.queueFever()
        pendingHitKind = 'bite'
        try {
          engine._updateStrainSkill(0)
        } finally {
          pendingHitKind = null
        }
        if (player.gluttonCharge < chargeBefore) {
          metrics.fCasts++
          if (player.hp > hpBefore) metrics.digestHealsOnBite++
        }
      }

      // 2) 走位与冲刺 AI：环绕风筝 + 在破绽窗口或安全时机切入冲撞
      const dx = boss.x - player.x
      const dy = boss.y - player.y
      const dist = Math.hypot(dx, dy) || 1
      const ux = dx / dist
      const uy = dy / dist
      const bossDangerous = boss.specialState === 'telegraph' || boss.specialState === 'dash'
      const wantRamWindow =
        player.dashImpactDmg > 0 &&
        player.dashCd <= 0 &&
        !bossDangerous &&
        (boss.vulnerableTimer > 0 || f % 180 < 40)

      const desiredDist = wantRamWindow ? 70 : 210
      const radial = (dist - desiredDist) / 70
      let moveX = ux * radial - uy * 0.95
      let moveY = uy * radial + ux * 0.95

      const margin = 140
      if (player.x < margin) moveX += 1.4
      else if (player.x > engine.worldWidth - margin) moveX -= 1.4
      if (player.y < margin) moveY += 1.4
      else if (player.y > engine.worldHeight - margin) moveY -= 1.4

      if (player.dashCd <= 0 && player._dashT <= 0 && wantRamWindow && dist <= 135) {
        moveX = ux
        moveY = uy
        engine.input.queueDash()
      }

      const s = engine.input.state
      s.left = moveX < -0.25
      s.right = moveX > 0.25
      s.up = moveY < -0.25
      s.down = moveY > 0.25

      if (player._dashT <= 0) {
        metrics.currentDashRamHits = 0
      }

      const chargePreStep = player.gluttonCharge
      engine.update(DT)
      if (player.gluttonCharge > chargePreStep) {
        metrics.rechargeGained += player.gluttonCharge - chargePreStep
      }

      const isDashingNow = player._dashT > 0
      if (isDashingNow && !wasDashing) {
        metrics.ramDashes++
      }
      wasDashing = isDashingNow

      assert.ok(Number.isFinite(player.x) && Number.isFinite(player.y) && Number.isFinite(boss.hp))
      assert.ok(player.gluttonCharge >= 0 && player.gluttonCharge <= GLUTTON_CHARGE_MAX)
    }

    if (!metrics.killed && (!boss.active || boss.hp <= 0)) {
      metrics.killed = true
      metrics.ttk = MAX_BOSS_FRAMES * DT
    }

    return {
      ...metrics,
      endProgress: player.gluttonBossHuntProgress,
      mawMul: getGluttonMawDamageMultiplier(player),
      progressMul: getGluttonBossProgressMultiplier(player),
      threshold: getGluttonBossProgressThreshold(player),
    }
  } finally {
    Math.random = realRandom
    engine.destroy()
  }
}

console.log(`\n暴食正式 Boss 战回归（${SEEDS.length} 个固定 seed × 3 档合法构筑）`)
const bossSuiteResults = {}
for (const build of BOSS_BUILDS) {
  const runs = SEEDS.map((seed) => runFormalBossFight(build, seed))
  bossSuiteResults[build.id] = runs
  const wins = runs.filter((r) => r.killed)
  const killRate = wins.length / runs.length
  const totalFCasts = runs.reduce((a, r) => a + r.fCasts, 0)
  const totalRecharges = runs.reduce((a, r) => a + r.rechargeGained, 0)
  const totalRamHits = runs.reduce((a, r) => a + r.totalRamHitsOnBoss, 0)
  const maxSingleDashHits = Math.max(0, ...runs.map((r) => r.maxRamHitsInSingleDash))
  const avgTtk = wins.length
    ? (wins.reduce((a, r) => a + r.ttk, 0) / wins.length).toFixed(1) + 's'
    : '—'
  console.log(
    `  ${build.id}: 胜率 ${wins.length}/${runs.length} (${Math.round(killRate * 100)}%)` +
      ` · 平均TTK ${avgTtk} · 累计充能 ${totalRecharges} · 累计Bite ${totalFCasts}` +
      ` · ram命中 ${totalRamHits}（单次dash最多命中 ${maxSingleDashHits}）`
  )
}

const lv1Runs = bossSuiteResults['Lv.1 空技能']
const lv8Runs = bossSuiteResults['Lv.8 合法构筑(7点)']
const lv14Runs = bossSuiteResults['Lv.14 合法构筑(12点)']
const allBossRuns = [...lv1Runs, ...lv8Runs, ...lv14Runs]

// 1) Lv.1 空技能断言（H10 + BITE5，无未来技能）
assert.ok(lv1Runs.every((r) => r.killed), 'Lv.1 空技能：全部完成 189 HP Boss 击杀闭环')
assert.ok(lv1Runs.reduce((a, r) => a + r.rechargeGained, 0) > 0, 'Lv.1 空技能：通过 H10 产生猎食点（rechargeGained > 0）')
assert.ok(lv1Runs.reduce((a, r) => a + r.fCasts, 0) > 0, 'Lv.1 空技能：成功释放 Boss Bite（fCasts > 0）')
assert.ok(lv1Runs.every((r) => r.threshold === GLUTTON_BOSS_HITS_PER_CHARGE && r.progressMul === 1.0 && r.mawMul === 1.0), 'Lv.1 空技能：阈值 10、倍率 1.0、M1 1.0')
assert.ok(lv1Runs.every((r) => r.eruptionSpawns === 0 && r.eruptionDamage === 0 && r.ramDamage === 0), 'Lv.1 空技能：无 E 与 ram 越权伤害')
ok('Boss 回归（Lv.1 空技能）：H10 产点 + BITE5 释放 + 零未来技能泄漏全部成立')

// 2) Lv.8 合法构筑断言（M1/M2 + E + ram，无 capstone）
assert.ok(lv8Runs.every((r) => r.killed), 'Lv.8 合法构筑：全部完成 Boss 击杀')
assert.ok(lv8Runs.every((r) => r.mawMul === 0.8 && r.progressMul === 1.66 && r.threshold === 10), 'Lv.8 合法构筑：M1(0.8) 与 M2(1.66) 生效，无 capstone(阈值 10)')
assert.ok(lv8Runs.reduce((a, r) => a + r.eruptionSpawns, 0) > 0 && lv8Runs.reduce((a, r) => a + r.eruptionDamage, 0) > 0, 'Lv.8 合法构筑：E 弱化喷酸在 Boss Bite 时触发并造成伤害')
assert.ok(lv8Runs.every((r) => r.maxEruptionBatch <= GLUTTON_BOSS_ERUPTION_MAX_SHOTS), 'Lv.8 合法构筑：E 单次喷酸不超过 4 发')
assert.ok(lv8Runs.every((r) => r.maxRamHitsInSingleDash === 1), 'Lv.8 合法构筑：glut_ram 单次 dash 对同一 Boss 严格结算 1 次')
ok('Boss 回归（Lv.8 合法构筑）：M1 + M2 + E 与 ram 单次冲刺去重全部生效')

// 3) Lv.14 合法构筑断言（M1/M2 + C1 + E + ram，无 D）
assert.ok(lv14Runs.every((r) => r.killed), 'Lv.14 合法构筑：全部完成 Boss 击杀')
assert.ok(
  lv14Runs.every((r) => r.mawMul === 0.7 && r.progressMul === 2.0 && r.threshold === GLUTTON_BOSS_CAPSTONE_HITS_PER_CHARGE),
  'Lv.14 合法构筑：M1(0.7) + M2(2.0) + C1(阈值 8) 全部生效'
)
assert.ok(lv14Runs.reduce((a, r) => a + r.eruptionSpawns, 0) > 0 && lv14Runs.reduce((a, r) => a + r.eruptionDamage, 0) > 0, 'Lv.14 合法构筑：E 弱化喷酸生效')
assert.ok(lv14Runs.every((r) => r.maxEruptionBatch <= GLUTTON_BOSS_ERUPTION_MAX_SHOTS), 'Lv.14 合法构筑：glut_eruption Lv.2(10发) 在 Boss Bite 时严格限幅 4 发')
assert.ok(lv14Runs.every((r) => r.maxRamHitsInSingleDash === 1), 'Lv.14 合法构筑：capstone 放大半径后单次 dash 仍最多命中同一 Boss 1 次')
assert.ok(lv14Runs.every((r) => r.digestHealsOnBite === 0), 'Lv.14 合法构筑：方案 D 不启用（Boss Bite 不触发 glut_sub_digest 回血）')
const avgTtkOf = (runs) => runs.reduce((a, r) => a + r.ttk, 0) / runs.length
assert.ok(avgTtkOf(lv1Runs) > avgTtkOf(lv8Runs) && avgTtkOf(lv8Runs) > avgTtkOf(lv14Runs), '三档成长单调性：平均 TTK 满足 Lv.1 > Lv.8 > Lv.14')
ok('Boss 回归（Lv.14 合法构筑）：M1 + M2 + C1 + E、无 D、capstone 下 ram 单次去重全部生效')

// 4) 全场 24 局五项硬核契约自检（Section 31）
for (const r of allBossRuns) {
  // (a) Bite 每口基础值恒为 Math.max(1, Math.round(boss.maxHp * 0.05)) = 10（约 5%）
  const expectedBiteRaw = Math.max(1, Math.round(r.bossMaxHp * 0.05))
  assert.ok(r.rawBiteDamages.length === r.fCasts && r.rawBiteDamages.every((d) => d === expectedBiteRaw), 'Bite 每口基础伤害恒为 maxHp × 5%')
  // (b) Boss progress 来源恒等式：仅未满仓时的普攻命中推进进度，Bite / ram / E 零泄漏
  const expectedTotalProgress = r.eligibleBasicHits * r.progressMul
  const actualTotalProgress = r.rechargeGained * r.threshold + r.endProgress
  assert.ok(
    Math.abs(expectedTotalProgress - actualTotalProgress) < 1e-4,
    `Boss progress 恒等式成立（expected=${expectedTotalProgress}, actual=${actualTotalProgress}）`
  )
  // (c) E 不附带 poison DOT
  assert.equal(r.poisonTriggers, 0, 'Boss Bite 弱化喷酸不触发 poison DOT')
  // (d) 四通道伤害归因总和严格等于 Boss maxHp
  const totalAttributed = r.basicDamage + r.biteDamage + r.ramDamage + r.eruptionDamage
  assert.ok(
    Math.abs(totalAttributed - r.bossMaxHp) < 1e-6 && r.otherDamage === 0,
    `四通道伤害归因总和 (${totalAttributed}) === Boss maxHp (${r.bossMaxHp})`
  )
}
ok(`Boss 回归（全场 ${allBossRuns.length} 局归因与进度恒等式）：Bite=5%、H10/M2/C1 零非普攻泄漏、E 零毒伤、四通道伤害总和 === Boss maxHp`)

console.log(`\n暴食 180s 真实回归 + 正式 Boss 战回归全部通过：${n} 组断言 ✓`)
