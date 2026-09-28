// 暴食史莱姆「猎食点 + F 主动捕食」正式机制验证（本轮设计合同）。
// 运行：node verify-glutton.mjs
//
// 覆盖六组契约：
//   A 充能（5 吞 = 1 点 / 上限 2 / 满仓进度冻结）
//   B F 不返充（核心回归护栏）
//   C 主动资格边界（吞噬线 N / 带上限 M = ceil(maxHp×(T+0.05))、Boss、NO_DEVOUR、inactive、devouring、320px）
//   D 空放（不扣点、不进锁、不产生吞噬）
//   E 0.3s 再次释放锁（不是主冷却）
//   F reset / 角色切换不残留，其它三角色 F 冷却语义不变
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
const { Boss } = await import('./src/game/entities/Boss.js')
const { Projectile } = await import('./src/game/entities/Projectile.js')
const { SKILL_DATABASE, rollSkills } = await import('./src/game/SkillPool.js')
const {
  GLUTTON_BOSS_BITE_PCT,
  GLUTTON_BOSS_CAPSTONE_HITS_PER_CHARGE,
  GLUTTON_BOSS_ERUPTION_DAMAGE_MUL,
  GLUTTON_BOSS_ERUPTION_MAX_SHOTS,
  GLUTTON_BOSS_HITS_PER_CHARGE,
  GLUTTON_CHARGE_MAX,
  GLUTTON_DEVOURS_PER_CHARGE,
  GLUTTON_HUNT_RADIUS,
  GLUTTON_HUNT_THRESHOLD_BONUS,
  GLUTTON_RECAST_LOCK,
  canDevourNow,
  canGluttonBiteBoss,
  canGluttonHunt,
  devourLineHp,
  findGluttonBiteBoss,
  getGluttonBossBiteDamage,
  getGluttonBossProgressMultiplier,
  getGluttonBossProgressThreshold,
  getGluttonMawDamageMultiplier,
  getGluttonMawLevel,
  gluttonHuntLimitHp,
  isGluttonLocked,
  onGluttonBossBasicHit,
} = await import('./src/game/GluttonResource.js')

const engine = GameEngine.create(canvasStub)
for (const k of ['onStats', 'onLevelUp', 'onGameOver', 'onBossSpawn', 'onWaveChanged', 'onEvolution']) {
  engine[k] = () => {}
}
let n = 0
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`)

const p = () => engine.player
const em = () => engine.enemyManager
const ws = () => engine.weaponSystem

/** 新局（可指定角色）；只测试「吞噬 → 资源」这一段，不参与升级面板 */
function openRun(strainId = 'glutton') {
  engine.applyStartingStrain(strainId)
  engine.reset()
  engine.running = true
  engine.enemyManager._enemies.length = 0
  engine.enemyManager._spawnTimer = Infinity
}

/** 生成一个**普通**的、远离玩家的敌人（默认 600px 外：既不进吞噬吸附，也不满足 F 半径） */
function spawnFar(type = 'knight') {
  const e = em().spawnAt(p().x + 600, p().y, type)
  e.hp = 100
  e.maxHp = 100
  e.devourable = false
  return e
}

/**
 * 直接走真实吞噬入口（EnemyManager._startDevour），用显式来源标记区分
 * normal / gluttonF —— 这是引擎里两条真实路径的最小复现。
 */
function devour(e, source) {
  em()._startDevour(e, source ? { source } : null)
}

/** 敌人「真实正常吞噬线」的 HP 上限（跟随当前 devourThreshold / 血统 / 分层宽度） */
const line = (e) => devourLineHp(e)

/** F 主动捕食带的 HP 上限（A 口径：ceil(maxHp × (T + 0.05))） */
const huntLimit = (e) => gluttonHuntLimitHp(e)

/** 一次完整的 F 按键（边沿输入 → 引擎消费） */
function pressF() {
  engine.input.queueFever()
  engine._updateStrainSkill(0)
}

/** 把敌人放到玩家的 F 主动捕食带内（取带上限；要求该敌人确实存在非空额外带） */
function placeHuntable(dist = 200, type = 'knight') {
  const e = spawnFar(type)
  e.x = p().x + dist
  e.y = p().y
  e.hp = huntLimit(e)
  assert.ok(
    e.hp > line(e),
    `测试前置：${type}（maxHp ${e.maxHp}）必须存在非空额外带（带宽 ${huntLimit(e) - line(e)} HP）`
  )
  return e
}

// ---------------------------------------------------------------
// A. 充能：5 次正常吞噬 = 1 点，上限 2，满仓进度冻结
// ---------------------------------------------------------------
openRun('glutton')
assert.equal(p().gluttonCharge, 0, '新局猎食点 0')
assert.equal(p().gluttonDevourProgress, 0, '新局吞噬进度 0')
assert.equal(p().gluttonRecastLock, 0, '新局再次释放锁 0')
assert.equal(engine.strainSkill.cooldown, 0, '暴食 F 不再有主冷却')

for (let i = 1; i <= 4; i++) {
  devour(spawnFar())
  assert.equal(p().gluttonCharge, 0, `第 ${i} 次正常吞噬仍未满 5：0 点`)
  assert.equal(p().gluttonDevourProgress, i, `第 ${i} 次正常吞噬进度 = ${i}`)
}
devour(spawnFar())
assert.equal(p().gluttonCharge, 1, '第 5 次正常吞噬：+1 猎食点')
assert.equal(p().gluttonDevourProgress, 0, '获得 1 点后进度归零（不保留溢出）')

for (let i = 0; i < 5; i++) devour(spawnFar())
assert.equal(p().gluttonCharge, 2, '累计 10 次正常吞噬：2 点（= 上限）')
assert.equal(p().gluttonDevourProgress, 0)

// 满仓行为（固定契约）：不再累计进度 —— 不存在隐藏的第三点
for (let i = 0; i < 7; i++) devour(spawnFar())
assert.equal(p().gluttonCharge, GLUTTON_CHARGE_MAX, '满仓后继续吞噬不得超过 2 点')
assert.equal(p().gluttonDevourProgress, 0, '满仓时吞噬进度冻结为 0（不存第三点）')
assert.equal(
  p().gluttonCharge + p().gluttonDevourProgress / GLUTTON_DEVOURS_PER_CHARGE,
  GLUTTON_CHARGE_MAX,
  '满仓时「点数 + 进度折算」恒等于上限，不存在隐形储蓄'
)
ok('充能：5 吞 = 1 点、上限 2、满仓进度冻结（无隐藏第三点）')

// 溢出后的恢复：花掉 1 点，进度即可重新从 0 开始累计
p().gluttonCharge = 1
p().gluttonRecastLock = 0
devour(spawnFar())
assert.equal(p().gluttonDevourProgress, 1, '花掉点数后进度恢复累计')
p().gluttonCharge = 0
p().gluttonDevourProgress = 0
ok('充能：点数消耗后进度可正常恢复累计')

// ---------------------------------------------------------------
// B. F 不返充（核心护栏）
// ---------------------------------------------------------------
openRun('glutton')
p().gluttonCharge = 1
p().gluttonDevourProgress = 0
const fTargets = [placeHuntable(120), placeHuntable(200), placeHuntable(280)]
const devoursBefore = ws().devours
pressF()
assert.equal(p().gluttonCharge, 0, 'F 消耗 1 点')
assert.equal(ws().devours, devoursBefore + 3, 'F 一次吞掉全部 3 个合法目标（320px 内不限个数）')
assert.ok(fTargets.every((e) => e.devouring), 'F 目标进入真实吞噬链（devouring 标记）')
assert.equal(p().gluttonDevourProgress, 0, 'F 自身的吞噬不增加正常吞噬进度')
assert.equal(p().gluttonCharge, 0, 'F 吞噬 3 个也不会因此回充点数')

// 连续多轮 F：每一步都必须只减不增（资源只能靠正常吞噬补充）
for (let round = 0; round < 3; round++) {
  p().gluttonCharge = GLUTTON_CHARGE_MAX
  p().gluttonDevourProgress = 0
  p().gluttonRecastLock = 0
  placeHuntable(160)
  placeHuntable(240)
  pressF()
  assert.equal(p().gluttonCharge, 1, `第 ${round + 1} 轮 F：只扣 1 点`)
  assert.equal(p().gluttonDevourProgress, 0, `第 ${round + 1} 轮 F：进度仍为 0（不返充）`)
  engine._updateStrainSkill(GLUTTON_RECAST_LOCK + 0.01)
}

// 反向验证：同一次吞噬换成普通来源就必须计入（证明差异确实来自来源标记）
openRun('glutton')
p().gluttonCharge = 0
p().gluttonDevourProgress = 0
devour(spawnFar(), 'normal')
assert.equal(p().gluttonDevourProgress, 1, '带 normal 来源的吞噬计入进度')
ok('F 不返充：来源分发在 WeaponSystem.onDevoured，F 吞噬只消耗不产出')

// ---------------------------------------------------------------
// C. 主动资格边界
// ---------------------------------------------------------------
openRun('glutton')
const probe = spawnFar('knight')
const N = line(probe)
const M = huntLimit(probe)
const probePlayer = { x: p().x, y: p().y }
assert.ok(N > 0, `普通怪吞噬线上限 N = ${N}（由 maxHp × 真实 _devourThresh 计算，非写死）`)
assert.ok(M > N, `主动捕食带上限 M = ${M} > ${N}（maxHp = ${probe.maxHp}，T = ${probe._devourThresh()}）`)
assert.equal(
  M,
  Math.ceil(probe.maxHp * (probe._devourThresh() + GLUTTON_HUNT_THRESHOLD_BONUS)),
  '带上限口径 = ceil(maxHp × (T + 0.05))'
)
assert.ok(M - N >= 2, `maxHp 足够大时带宽 > 1 HP（实测 ${M - N} HP）—— 这是与「恒定 +1 HP」口径的根本差别`)

probe.x = probePlayer.x + 100
probe.y = probePlayer.y
probe.hp = N
assert.equal(canGluttonHunt(probe, probePlayer), false, 'hp = N：已属正常吞噬线，不属于 F 额外带')
assert.equal(probe.devourable, false, 'hp = N 但未经过 hit：devourable 未置位（F 正是要抢这种猎物）')
assert.equal(canDevourNow(probe), true, 'hp = N：属于**正常**吞噬线（canDevourNow 为真，与 F 资格互补）')

probe.hp = N + 1
assert.equal(canGluttonHunt(probe, probePlayer), true, 'hp = N+1：F 可以主动捕食')
assert.equal(probe.devourable, false, 'F 资格不依赖 devourable 标记')

// A 口径下 N+2 未必非法（带宽由 ceil 决定，可达 5 HP）——真正的上界是 M
probe.hp = M
assert.equal(canGluttonHunt(probe, probePlayer), true, 'hp = M（带上限本身）：仍可主动捕食')

probe.hp = M + 1
assert.equal(canGluttonHunt(probe, probePlayer), false, 'hp = M+1：超出主动捕食带')

probe.hp = M
probe.isBoss = true
assert.equal(canGluttonHunt(probe, probePlayer), false, 'Boss 永不可进入 F 普通吞噬资格（devour eligibility = false）')
assert.equal(canDevourNow(probe), false, 'Boss 永不可进入普通吞噬线（canDevourNow = false）')
p().gluttonCharge = 1
p().gluttonRecastLock = 0
probe.x = p().x + 100
probe.y = p().y
assert.equal(canGluttonBiteBoss(probe, p()), true, 'Boss 在满足 charge / 未锁 / 320px 内时具备 Boss Bite 资格')
p().gluttonCharge = 0
assert.equal(canGluttonBiteBoss(probe, p()), false, '无猎食点时 Boss Bite 资格为 false')
probe.isBoss = false
assert.equal(canGluttonBiteBoss(probe, p()), false, '普通怪不具备 Boss Bite 资格')

probe.type = 'golem'
assert.equal(canGluttonHunt(probe, probePlayer), false, 'NO_DEVOUR_TYPES（魔像）不可 F 主动捕食')
probe.type = 'wraith'
assert.equal(canGluttonHunt(probe, probePlayer), false, 'NO_DEVOUR_TYPES（怨灵）不可 F 主动捕食')
probe.type = 'knight'

probe.active = false
assert.equal(canGluttonHunt(probe, probePlayer), false, 'inactive 不可 F 主动捕食')
probe.active = true

probe.devouring = true
assert.equal(canGluttonHunt(probe, probePlayer), false, 'devouring 中不可重复 F 主动捕食')
probe.devouring = false

probe.x = probePlayer.x + GLUTTON_HUNT_RADIUS
assert.equal(canGluttonHunt(probe, probePlayer), true, `距离正好 ${GLUTTON_HUNT_RADIUS}px：边界内`)
probe.x = probePlayer.x + GLUTTON_HUNT_RADIUS + 1
assert.equal(canGluttonHunt(probe, probePlayer), false, `距离超过 ${GLUTTON_HUNT_RADIUS}px：不可 F 主动捕食`)

probe.hp = 0
probe.x = probePlayer.x + 50
assert.equal(canGluttonHunt(probe, probePlayer), false, 'hp = 0（已死）不可 F 主动捕食')

// —— C2. 量化契约（A 口径的已知行为，固定为测试）：资格带恰好是 (N, M] ——
// 带宽由 ceil 决定，所以 maxHp 小到 ceil 不跨整数边界时**带为空**（该敌人永不可猎），
// maxHp 大时带宽会 > 1 HP。两种情况都必须出现，否则说明口径退化回了「恒定 +1 HP」。
let emptyBand = null
let wideBand = null
for (let maxHp = 1; maxHp <= 40; maxHp++) {
  const e = spawnFar('knight')
  e.maxHp = maxHp
  e.x = probePlayer.x + 50
  e.y = probePlayer.y
  const n2 = line(e)
  const m2 = huntLimit(e)
  assert.equal(
    m2,
    Math.max(1, Math.ceil(maxHp * (e._devourThresh() + GLUTTON_HUNT_THRESHOLD_BONUS))),
    `maxHp=${maxHp}：带上限必须严格等于 ceil(maxHp × (T + 0.05))`
  )
  assert.ok(m2 >= n2, `maxHp=${maxHp}：带上限不得低于正常吞噬线`)
  if (m2 === n2 && !emptyBand) emptyBand = { maxHp, n: n2 }
  if (m2 - n2 >= 2 && !wideBand) wideBand = { maxHp, width: m2 - n2 }
  for (let hp = 1; hp <= maxHp; hp++) {
    e.hp = hp
    assert.equal(
      canGluttonHunt(e, probePlayer),
      hp > n2 && hp <= m2,
      `maxHp=${maxHp} hp=${hp}：资格必须恰好等于 (N, M] = (${n2}, ${m2}]`
    )
  }
}
assert.ok(
  emptyBand,
  `存在「空额外带」的 maxHp（maxHp=${emptyBand?.maxHp} 时 M == N == ${emptyBand?.n}）：` +
    '小怪常常完全没有额外带，这是 A 口径的量化结果，不是漏判'
)
assert.ok(
  wideBand,
  `存在带宽 ≥ 2 HP 的 maxHp（maxHp=${wideBand?.maxHp} 时带宽 ${wideBand?.width} HP）：额外带不是恒定的 1 HP`
)

// 吞噬线口径随局内真实规则变化（glut_maw 专精 / 觉醒会改写 devourThreshold）
probe.hp = 2
probe.maxHp = 16
engine.devourThreshold = 0.25
const normalLine = line(probe)
const normalLimit = huntLimit(probe)
engine.devourThreshold = 0.36 // 深渊胃囊 Lv.3 的真实取值
assert.ok(line(probe) > normalLine, '吞噬线上限跟随当前真实 devourThreshold 变化（不是写死比例）')
assert.ok(huntLimit(probe) > normalLimit, '主动捕食带上限同样跟随真实 devourThreshold 变化')
ok('主动资格：N / N+1 / M / M+1、空带与宽带的量化契约、Boss、NO_DEVOUR、inactive、devouring、320px 全部按合同收口')

// ---------------------------------------------------------------
// D. 空放：有资源但无合法目标 → 不扣点、不进锁、不吞噬
// ---------------------------------------------------------------
openRun('glutton')
p().gluttonCharge = 1
p().gluttonDevourProgress = 0
const noTargets = [spawnFar(), spawnFar('golem')]
noTargets[1].x = p().x + 40
noTargets[1].y = p().y
noTargets[1].hp = huntLimit(noTargets[1]) // HP 处于额外带内，位置合法，但敌族不可吞
const onlyTooFar = spawnFar('knight')
onlyTooFar.x = p().x + GLUTTON_HUNT_RADIUS + 40
onlyTooFar.y = p().y
onlyTooFar.hp = huntLimit(onlyTooFar) // HP 合法，仅距离超出 320px
const devoursBeforeEmpty = ws().devours
pressF()
assert.equal(p().gluttonCharge, 1, '空放不扣猎食点')
assert.equal(p().gluttonRecastLock, 0, '空放不启动 0.3s 再次释放锁')
assert.equal(ws().devours, devoursBeforeEmpty, '空放不产生任何吞噬')
assert.ok(noTargets.every((e) => !e.devouring), '空放不改变任何敌人状态')

// 紧接着把合法目标放进来：同一个点数必须能正常用出去
const lateTarget = placeHuntable(90)
pressF()
assert.equal(p().gluttonCharge, 0, '空放之后点数仍可用（没有被白白烧掉）')
assert.equal(lateTarget.devouring, true, '空放之后的正常释放成功吞噬目标')
ok('空放：无合法目标时不扣点、不进锁、不制造吞噬')

// ---------------------------------------------------------------
// E. 0.3s 再次释放锁（只是防连点，不是主冷却）
// ---------------------------------------------------------------
openRun('glutton')
p().gluttonCharge = GLUTTON_CHARGE_MAX
p().gluttonDevourProgress = 0
const first = placeHuntable(150)
pressF()
assert.equal(p().gluttonCharge, 1, '第 1 次释放：扣 1 点')
assert.equal(first.devouring, true, '第 1 次释放：真实吞噬')
assert.equal(p().gluttonRecastLock, GLUTTON_RECAST_LOCK, `第 1 次释放：启动 ${GLUTTON_RECAST_LOCK}s 再次释放锁`)
assert.equal(isGluttonLocked(p()), true, '锁查询口径与字段一致')

const second = placeHuntable(150)
pressF() // 同一帧内再按：锁生效
assert.equal(p().gluttonCharge, 1, '锁内第二次输入不扣点')
assert.equal(second.devouring, false, '锁内第二次输入不产生吞噬')

// 锁只按 dt 递减；未走完 0.3s 前依然不可再次释放
engine._updateStrainSkill(GLUTTON_RECAST_LOCK - 0.02)
assert.ok(p().gluttonRecastLock > 0, `${GLUTTON_RECAST_LOCK - 0.02}s 后锁仍未结束`)
pressF()
assert.equal(p().gluttonCharge, 1, '锁未结束前仍不扣点')

// 走完 0.3s：立刻可以再次释放（说明它不是 10s 主冷却）
engine._updateStrainSkill(0.03)
assert.equal(p().gluttonRecastLock, 0, '0.3s 后锁归零')
assert.equal(isGluttonLocked(p()), false, '锁结束后查询口径同步归位')
pressF()
assert.equal(p().gluttonCharge, 0, '锁结束后可正常再次释放并扣点')
assert.equal(second.devouring, true, '锁结束后第二次真实吞噬生效')
ok('再次释放锁：0.3s 内不重复消耗，0.3s 后立即可再放（无主冷却）')

// 没有点数时不释放（也不空转锁）
openRun('glutton')
p().gluttonCharge = 0
const noChargeTarget = placeHuntable(150)
pressF()
assert.equal(p().gluttonCharge, 0, '无猎食点时按 F 不释放')
assert.equal(p().gluttonRecastLock, 0, '无猎食点时按 F 不进锁')
assert.equal(noChargeTarget.devouring, false, '无猎食点时按 F 不吞噬')
ok('F 输入：0 点不释放、锁内不扣点、有点数才允许尝试')

// ---------------------------------------------------------------
// F. reset / 角色切换 / 其它角色 F 冷却
// ---------------------------------------------------------------
openRun('glutton')
p().gluttonCharge = 2
p().gluttonDevourProgress = 4
p().gluttonRecastLock = 0.2
engine.reset()
assert.equal(p().gluttonCharge, 0, '重开：猎食点归零')
assert.equal(p().gluttonDevourProgress, 0, '重开：吞噬进度归零')
assert.equal(p().gluttonRecastLock, 0, '重开：再次释放锁归零')

// 暴食 → 其它角色：不得残留任何暴食资源
p().gluttonCharge = 2
p().gluttonDevourProgress = 3
for (const strainId of ['origin', 'ricochet', 'elemental', 'shadow']) {
  engine.applyStartingStrain(strainId)
  engine.reset()
  engine.running = true
  assert.equal(p().gluttonCharge, -1, `${strainId}：不拥有猎食点（-1 哨兵）`)
  assert.equal(p().gluttonDevourProgress, 0, `${strainId}：无吞噬进度残留`)
  assert.equal(p().gluttonRecastLock, 0, `${strainId}：无再次释放锁残留`)
  const hud = engine.strainSkill?.getHud?.(p()) || null
  assert.equal(hud, null, `${strainId}：F 技能不提供猎食点 HUD 口径`)
  // 非暴食角色不产生猎食点，且普通吞噬不应污染任何状态
  const before = ws().devours
  devour(spawnFar())
  assert.equal(ws().devours, before + 1, `${strainId}：普通吞噬照常结算`)
  assert.equal(p().gluttonCharge, -1, `${strainId}：普通吞噬不会创建猎食点`)
  assert.equal(p().gluttonDevourProgress, 0, `${strainId}：普通吞噬不会累计暴食进度`)
}

// 其它三角色的 F 主冷却语义必须原样保留（暴食不再是 10s 冷却，但这三者的没有被删）
const TIMER_SKILLS = { ricochet: 8, elemental: 12, shadow: 7 }
for (const [strainId, cooldown] of Object.entries(TIMER_SKILLS)) {
  openRun(strainId)
  const skill = engine.strainSkill
  assert.equal(skill.cooldown, cooldown, `${strainId}：F 主冷却仍为 ${cooldown}s`)
  assert.ok(!skill.getHud, `${strainId}：不提供猎食点口径`)
  engine.input.queueFever()
  engine._updateStrainSkill(0.016)
  assert.equal(p().strainSkillCd, cooldown, `${strainId}：释放后进入自身冷却`)
  engine.input.queueFever()
  engine._updateStrainSkill(0.016)
  assert.ok(p().strainSkillCd < cooldown, `${strainId}：冷却中再按 F 不重复释放`)
  engine._updateStrainSkill(cooldown + 0.1)
  assert.equal(p().strainSkillCd, 0, `${strainId}：冷却按 dt 递减到 0`)
  assert.equal(p().gluttonCharge, -1, `${strainId}：全程不产生猎食点`)
}

// 暴食自己的 strainSkillCd 恒为 0（没有主冷却），且不显示冷却条
openRun('glutton')
engine._updateStrainSkill(0.016)
assert.equal(p().strainSkillCd, 0, '暴食：strainSkillCd 恒为 0')
assert.equal(p().strainSkillMax, 0, '暴食：skillMax 为 0（HUD 不会渲染冷却条）')
p().gluttonCharge = 1
const hudState = engine.strainSkill.getHud(p())
assert.deepEqual(hudState, {
  mode: 'charge',
  charge: 1,
  max: GLUTTON_CHARGE_MAX,
  progress: 0,
  progressPer: GLUTTON_DEVOURS_PER_CHARGE,
  ready: true,
  lock: 0,
}, 'HUD 口径：0/1/2 点 + 吞噬进度 + 就绪状态')

// 引擎推送给 HUD 的冷却快照里必须带上 charge 口径（仅暴食）
let snapshot = null
engine.onCooldown = (c) => {
  snapshot = c
}
engine._pushCooldown()
assert.ok(snapshot.charge, '暴食：cooldown 快照带 charge 口径')
assert.equal(snapshot.skillMax, 0, '暴食：skillMax 为 0，旧冷却条不会点亮')
engine.applyStartingStrain('shadow')
engine.reset()
engine._updateStrainSkill(0) // 帧管线先跑一次：skillMax 由 _updateStrainSkill 写入
engine._pushCooldown()
assert.equal(snapshot.charge, null, '暗影：cooldown 快照不带猎食点口径')
assert.equal(snapshot.skillMax, 7, '暗影：仍走冷却条口径')
engine.onCooldown = null
ok('reset / 角色切换：暴食资源不泄漏，其它三角色 F 冷却语义不变')

// ---------------------------------------------------------------
// 附加：HUD stats 口径与满仓显示
// ---------------------------------------------------------------
openRun('glutton')
let statsShot = null
engine.onStats = (s) => {
  statsShot = s
}
engine._pushStats()
assert.equal(statsShot.glutton.has, true, '暴食：stats.glutton.has = true')
assert.equal(statsShot.glutton.charge, 0, '暴食：stats 初始 0 点')
assert.equal(statsShot.glutton.progress, 0, '暴食：stats 初始 0/5')
p().gluttonCharge = 2
p().gluttonDevourProgress = 0
engine._pushStats()
assert.equal(statsShot.glutton.charge, 2, '暴食：stats 反映 2 点')
engine.applyStartingStrain('elemental')
engine.reset()
engine._pushStats()
assert.equal(statsShot.glutton.has, false, '元素：stats.glutton.has = false（HUD 不显示）')
engine.onStats = () => {}
ok('HUD 口径：仅暴食 has=true，0/1/2 点与 x/5 进度均可读')

// ---------------------------------------------------------------
// G. Boss 普攻猎食进度（H10 + M2 + C1）与非普攻排除
// ---------------------------------------------------------------
function spawnBossNear(dist = 120, hp = 1000) {
  const boss = new Boss({ x: p().x + dist, y: p().y, type: 'boss-knight', wave: 5 })
  boss.attach(engine)
  boss.hp = hp
  boss.maxHp = hp
  em()._enemies.push(boss)
  return boss
}

function rebuildEnemyGrid() {
  em()._buildGrid()
}

// G1. H10 基础进度：10 次真实普攻命中 Boss -> +1 点，上限 2，满仓冻结
openRun('glutton')
const bossG1 = spawnBossNear(80, 2000)
assert.equal(getGluttonBossProgressThreshold(p()), GLUTTON_BOSS_HITS_PER_CHARGE, '默认 Boss 猎食阈值为 10')
assert.equal(getGluttonBossProgressMultiplier(p()), 1.0, 'glut_maw Lv.0 进度倍率为 1.0')
for (let i = 1; i <= 9; i++) {
  ws()._projectiles.length = 0
  ws().fire(bossG1)
  ws()._projectiles[0].x = bossG1.x
  ws()._projectiles[0].y = bossG1.y
  rebuildEnemyGrid()
  ws()._resolveCollisions()
  assert.equal(p().gluttonCharge, 0, `第 ${i} 次普攻命中 Boss：未满 10，charge = 0`)
  assert.equal(p().gluttonBossHuntProgress, i, `第 ${i} 次普攻命中 Boss：progress = ${i}`)
}
ws()._projectiles.length = 0
ws().fire(bossG1)
ws()._projectiles[0].x = bossG1.x
ws()._projectiles[0].y = bossG1.y
rebuildEnemyGrid()
ws()._resolveCollisions()
assert.equal(p().gluttonCharge, 1, '第 10 次普攻命中 Boss：+1 猎食点')
assert.equal(p().gluttonBossHuntProgress, 0, '满 10 产点后进度归零')

// 再命中 10 次 -> 2 点满仓；满仓后继续命中不隐藏累计第三点
for (let i = 0; i < 10; i++) {
  assert.equal(onGluttonBossBasicHit(p(), bossG1), i === 9)
}
assert.equal(p().gluttonCharge, GLUTTON_CHARGE_MAX, '累计 20 次命中：达到上限 2 点')
assert.equal(p().gluttonBossHuntProgress, 0)
for (let i = 0; i < 5; i++) {
  assert.equal(onGluttonBossBasicHit(p(), bossG1), false, '满仓时继续命中不产点')
}
assert.equal(p().gluttonBossHuntProgress, 0, '满仓时 Boss 猎食进度冻结为 0（不隐藏累计第三点）')

// G2. M2（glut_maw Lv.1~3 加速：1.33 / 1.66 / 2.0）与小数余数保留
openRun('glutton')
const bossG2 = spawnBossNear(80, 2000)
const mawSkill = SKILL_DATABASE.gluttony.primary.find((s) => s.id === 'glut_maw')
mawSkill.apply(engine, 1)
engine.skillLevels.glut_maw = 1
assert.equal(getGluttonBossProgressMultiplier(p()), 1.33, 'glut_maw Lv.1 进度倍率为 1.33')
for (let i = 1; i <= 7; i++) {
  assert.equal(onGluttonBossBasicHit(p(), bossG2), false)
}
assert.equal(p().gluttonBossHuntProgress, 9.31, 'Lv.1 第 7 次命中进度 = 9.31')
assert.equal(onGluttonBossBasicHit(p(), bossG2), true, 'Lv.1 第 8 次命中进度 10.64 >= 10 -> +1 点')
assert.equal(p().gluttonCharge, 1)
assert.equal(p().gluttonBossHuntProgress, 0.64, 'Lv.1 产点后保留小数余数 0.64')

openRun('glutton')
const bossG2b = spawnBossNear(80, 2000)
mawSkill.apply(engine, 1)
mawSkill.apply(engine, 2)
engine.skillLevels.glut_maw = 2
assert.equal(getGluttonBossProgressMultiplier(p()), 1.66, 'glut_maw Lv.2 进度倍率为 1.66')
for (let i = 1; i <= 6; i++) {
  assert.equal(onGluttonBossBasicHit(p(), bossG2b), false)
}
assert.equal(p().gluttonBossHuntProgress, 9.96, 'Lv.2 第 6 次命中进度 = 9.96 (< 10)')
assert.equal(onGluttonBossBasicHit(p(), bossG2b), true, 'Lv.2 第 7 次命中进度 11.62 >= 10 -> +1 点')
assert.equal(p().gluttonBossHuntProgress, 1.62, 'Lv.2 产点后保留小数余数 1.62')

openRun('glutton')
const bossG2c = spawnBossNear(80, 2000)
mawSkill.apply(engine, 1)
mawSkill.apply(engine, 2)
mawSkill.apply(engine, 3)
engine.skillLevels.glut_maw = 3
assert.equal(getGluttonBossProgressMultiplier(p()), 2.0, 'glut_maw Lv.3 进度倍率为 2.0')
for (let i = 1; i <= 4; i++) {
  assert.equal(onGluttonBossBasicHit(p(), bossG2c), false)
}
assert.equal(onGluttonBossBasicHit(p(), bossG2c), true, 'Lv.3 第 5 次命中进度 10.0 >= 10 -> +1 点')
assert.equal(p().gluttonBossHuntProgress, 0, 'Lv.3 产点后余数为 0')

// G3. C1（glut_capstone 阈值 10 -> 8，与 M2 叠乘且不重复相乘）
openRun('glutton')
const bossG3 = spawnBossNear(80, 2000)
const capSkill = SKILL_DATABASE.gluttony.primary.find((s) => s.id === 'glut_capstone')
capSkill.apply(engine, 1)
engine.skillLevels.glut_capstone = 1
assert.equal(getGluttonBossProgressThreshold(p()), GLUTTON_BOSS_CAPSTONE_HITS_PER_CHARGE, '觉醒后 Boss 猎食阈值降为 8')
for (let i = 1; i <= 7; i++) {
  assert.equal(onGluttonBossBasicHit(p(), bossG3), false)
}
assert.equal(onGluttonBossBasicHit(p(), bossG3), true, 'C1（无 maw）：第 8 次命中 -> +1 点')
assert.equal(p().gluttonBossHuntProgress, 0)

p().gluttonCharge = 0
mawSkill.apply(engine, 1)
mawSkill.apply(engine, 2)
mawSkill.apply(engine, 3)
engine.skillLevels.glut_maw = 3
for (let i = 1; i <= 3; i++) {
  assert.equal(onGluttonBossBasicHit(p(), bossG3), false)
}
assert.equal(onGluttonBossBasicHit(p(), bossG3), true, 'C1 + maw Lv.3：第 4 次命中（4×2.0=8）-> +1 点')

// G4. 非普攻来源明确不计入 gluttonBossHuntProgress
openRun('glutton')
const bossG4 = spawnBossNear(80, 2000)
p().devourAcidSpray = 6
ws().dashImpact(bossG4, 5) // glut_ram 冲撞伤害
assert.equal(p().gluttonBossHuntProgress, 0, 'glut_ram 冲撞命中 Boss 不计入普攻猎食进度')
ws()._explode(bossG4.x, bossG4.y, 5) // 爆炸
assert.equal(p().gluttonBossHuntProgress, 0, '爆炸命中 Boss 不计入普攻猎食进度')
bossG4.hit(2, { poison: 3, poisonDmg: 2 }) // DOT
bossG4._tickStatus(1.1)
assert.equal(p().gluttonBossHuntProgress, 0, '毒 DOT 跳伤不计入普攻猎食进度')
ws()._projectiles.length = 0
ws().spawnDevourEruption(bossG4.x, bossG4.y, { bossBite: true }) // 腐殖喷吐弹体
for (const proj of ws()._projectiles) {
  proj.x = bossG4.x
  proj.y = bossG4.y
}
rebuildEnemyGrid()
ws()._resolveCollisions()
assert.equal(p().gluttonBossHuntProgress, 0, 'glut_eruption 喷吐弹命中 Boss 不计入普攻猎食进度')
ok('Boss 普攻猎食进度：H10 / M2（1.33·1.66·2.0 余数保留）/ C1（阈值 8）及非普攻排除全部符合合同')

// ---------------------------------------------------------------
// H. Boss Bite（BITE5）+ M1 目标感知补偿 + E 弱化喷酸 + 不启用 D
// ---------------------------------------------------------------
openRun('glutton')
const bossH = spawnBossNear(150, 1000)
p().gluttonCharge = 2
p().gluttonBossHuntProgress = 3
p().gluttonDevourProgress = 2
// 先把 glut_sub_digest 打开，验证方案 D 未启用（Boss Bite 不回血、不给吞噬减伤）
const digestSkill = SKILL_DATABASE.gluttony.secondary.find((s) => s.id === 'glut_sub_digest')
digestSkill.apply(engine, 1)
p().hp = p().maxHp - 2
const hpBeforeBite = p().hp
const devoursBeforeBite = ws().devours
const expectedBiteDmg = getGluttonBossBiteDamage(bossH)
assert.equal(expectedBiteDmg, Math.max(1, Math.round(bossH.maxHp * GLUTTON_BOSS_BITE_PCT)), 'BITE5 伤害 = round(maxHp × 5%) = 50')

pressF()
assert.equal(p().gluttonCharge, 1, 'Boss Bite 消耗 1 点猎食点')
assert.equal(p().gluttonRecastLock, GLUTTON_RECAST_LOCK, 'Boss Bite 启动 0.3s 再次释放锁')
assert.equal(bossH.hp, 1000 - expectedBiteDmg, 'Boss Bite 通过真实 Boss.hit 扣除 5% maxHp 生命')
assert.equal(bossH.active, true, 'Boss Bite 不秒杀 Boss')
assert.equal(bossH.devouring, false, 'Boss Bite 不把 Boss 标为 devouring')
assert.equal(ws().devours, devoursBeforeBite, 'Boss Bite 不增加 devours 计数')
assert.equal(p().gluttonDevourProgress, 2, 'Boss Bite 不返充普通吞噬进度')
assert.equal(p().gluttonBossHuntProgress, 3, 'Boss Bite 不返充 Boss 普攻猎食进度')
assert.equal(p().hp, hpBeforeBite, '方案 D 不启用：Boss Bite 不触发 glut_sub_digest 回血')
assert.equal(p().devourDamageReductionTimer, 0, '方案 D 不启用：Boss Bite 不触发 glut_sub_digest 减伤')

// Boss Bite 致死时走正式击杀结算且只结算一次
engine._updateStrainSkill(GLUTTON_RECAST_LOCK + 0.05)
bossH.hp = 20
const bossKillsBefore = ws().bossKills
pressF()
assert.equal(bossH.active, false, '残血 Boss 被 Boss Bite 击杀')
assert.equal(ws().bossKills, bossKillsBefore + 1, 'Boss Bite 致死走正式 _onKill 结算一次')
assert.equal(bossH._settled, true, 'Boss 死亡标记 _settled 防重复结算')

// M1：glut_maw 降攻只作用于小怪/精英，对 Boss 基础普攻做目标感知对冲还原
openRun('glutton')
const bossM1 = spawnBossNear(100, 1000)
const mobM1 = spawnFar('knight')
mobM1.x = p().x + 100
mobM1.y = p().y + 80
mobM1.hp = 100
mobM1.maxHp = 100
mawSkill.apply(engine, 1)
mawSkill.apply(engine, 2)
mawSkill.apply(engine, 3)
engine.skillLevels.glut_maw = 3
assert.ok(Math.abs(ws().damage - 0.7) < 1e-9, 'glut_maw Lv.3：面板基础 damage 仍为 0.7（不被全局改写）')
assert.equal(getGluttonMawDamageMultiplier(p()), 0.7)

// M1 夹具固定为非暴击，避免把随机 crit 混入目标感知伤害断言
const critChanceBeforeM1 = ws().critChance
ws().critChance = 0
try {
  // 普攻命中普通怪：受 0.7 降攻影响
  ws()._projectiles.length = 0
  ws().fire(mobM1)
  ws()._projectiles[0].x = mobM1.x
  ws()._projectiles[0].y = mobM1.y
  rebuildEnemyGrid()
  ws()._resolveCollisions()
  assert.ok(Math.abs((100 - mobM1.hp) - 0.7) < 1e-6, `M1：普通怪普攻仍受 glut_maw Lv.3 降攻影响（实测扣血 ${100 - mobM1.hp}）`)

  // 普攻命中 Boss：对冲还原为未受胃囊惩罚的 1.0
  ws()._projectiles.length = 0
  ws().fire(bossM1)
  ws()._projectiles[0].x = bossM1.x
  ws()._projectiles[0].y = bossM1.y
  rebuildEnemyGrid()
  ws()._resolveCollisions()
  assert.ok(Math.abs((1000 - bossM1.hp) - 1.0) < 1e-6, `M1：Boss 普攻还原为未降攻值 1.0（实测扣血 ${1000 - bossM1.hp}）`)
  assert.ok(Math.abs(ws().damage - 0.7) < 1e-9, 'M1：对冲仅在命中 Boss 当次计算，不污染全局 ws.damage')
} finally {
  ws().critChance = critChanceBeforeM1
}

// E：Boss Bite 触发弱化版 glut_eruption（<=4 发，伤害 ×0.5，poisonChance = 0，不计入 H10）
openRun('glutton')
const bossE = spawnBossNear(120, 1000)
const eruptionSkill = SKILL_DATABASE.gluttony.primary.find((s) => s.id === 'glut_eruption')
eruptionSkill.apply(engine, 2) // Lv.2 = 10 发
engine.skillLevels.glut_eruption = 2
ws()._projectiles.length = 0
p().gluttonCharge = 1
pressF()
assert.equal(
  ws()._projectiles.length,
  GLUTTON_BOSS_ERUPTION_MAX_SHOTS,
  `E：glut_eruption Lv.2（原 10 发）在 Boss Bite 时限幅为 ${GLUTTON_BOSS_ERUPTION_MAX_SHOTS} 发`
)
for (const proj of ws()._projectiles) {
  assert.equal(proj.isEruption, true, 'E：喷酸弹标记 isEruption = true')
  assert.equal(proj.isBasicAttack, false, 'E：喷酸弹 isBasicAttack = false')
  assert.equal(proj.poisonChance, 0, 'E：Boss Bite 弱化喷酸不附带毒（poisonChance = 0）')
  assert.ok(
    Math.abs(proj.damage - ws().damage * 1.5 * GLUTTON_BOSS_ERUPTION_DAMAGE_MUL) < 1e-9,
    'E：Boss Bite 弱化喷酸单发伤害 = damage × 1.5 × 0.5'
  )
}
// 对照：普通吞噬的 glut_eruption 保持原样（Lv.2 = 10 发，1.0× 喷酸伤害，poisonChance = 1.0）
ws()._projectiles.length = 0
devour(spawnFar('knight'))
assert.equal(ws()._projectiles.length, 10, '普通吞噬：glut_eruption Lv.2 仍喷 10 发')
assert.equal(ws()._projectiles[0].poisonChance, 1.0, '普通吞噬：喷酸弹仍保持 poisonChance = 1.0')
assert.ok(Math.abs(ws()._projectiles[0].damage - ws().damage * 1.5) < 1e-9, '普通吞噬：喷酸弹伤害保持 damage × 1.5')
ok('Boss Bite（BITE5）+ M1 目标感知补偿 + E 弱化喷酸 + 方案 D 未启用全部验证通过')

// ---------------------------------------------------------------
// I. glut_ram 单次冲刺多帧重复结算修复回归（测试 A / B / C / D + 觉醒大半径）
// ---------------------------------------------------------------
const ramSkill = SKILL_DATABASE.gluttony.primary.find((s) => s.id === 'glut_ram')

// 测试 A：单次 dash 对单 Boss 最多结算 1 次
openRun('glutton')
ramSkill.apply(engine, 3) // Lv.3：冲撞倍率 ×4
const bossRamA = spawnBossNear(60, 2000)
let ramHitCountA = 0
const origDashImpact = ws().dashImpact.bind(ws())
ws().dashImpact = (target, dmg) => {
  if (target === bossRamA) ramHitCountA++
  return origDashImpact(target, dmg)
}
engine.input.state.right = true
engine.input.queueDash()
const hpBeforeRamA = bossRamA.hp
const expectedSingleRamDmg = ws().damage * ws().levelMul * ws().devourDamageMul * p().dashImpactDmg
for (let f = 0; f < 15; f++) {
  p().update(1 / 60)
}
engine.input.state.right = false
assert.equal(ramHitCountA, 1, '测试 A：单次冲刺（~11 帧）穿过 Boss 仅触发 1 次 dashImpact')
assert.ok(
  Math.abs((hpBeforeRamA - bossRamA.hp) - expectedSingleRamDmg) < 1e-6,
  `测试 A：单次冲刺对 Boss 仅造成 1 次冲撞伤害 ${expectedSingleRamDmg}（实测 ${hpBeforeRamA - bossRamA.hp}）`
)

// 测试 B：两次独立 dash 对同一 Boss 各结算 1 次（共 2 次）
p().dashCd = 0
p().x = bossRamA.x - 60
p().y = bossRamA.y
engine.input.state.right = true
engine.input.queueDash()
for (let f = 0; f < 15; f++) {
  p().update(1 / 60)
}
engine.input.state.right = false
assert.equal(ramHitCountA, 2, '测试 B：第二次独立冲刺可再次命中同一 Boss（累计 2 次）')
ws().dashImpact = origDashImpact

// 测试 C：单次 dash 同时穿过多个不同敌人，每个各结算 1 次
openRun('glutton')
ramSkill.apply(engine, 2)
const mobC1 = spawnFar('knight')
const mobC2 = spawnFar('knight')
mobC1.x = p().x + 40
mobC1.y = p().y - 10
mobC1.hp = 500
mobC1.maxHp = 500
mobC2.x = p().x + 90
mobC2.y = p().y + 10
mobC2.hp = 500
mobC2.maxHp = 500
const hitsC = new Map()
ws().dashImpact = (target, dmg) => {
  hitsC.set(target, (hitsC.get(target) || 0) + 1)
  return origDashImpact(target, dmg)
}
engine.input.state.right = true
engine.input.queueDash()
for (let f = 0; f < 15; f++) {
  p().update(1 / 60)
}
engine.input.state.right = false
ws().dashImpact = origDashImpact
assert.equal(hitsC.get(mobC1), 1, '测试 C：单次冲刺对目标 1 仅结算 1 次')
assert.equal(hitsC.get(mobC2), 1, '测试 C：单次冲刺对目标 2 仅结算 1 次')

// 测试 D：单次 dash 对高血精英与觉醒大半径（isGluttonyLord）不重复命中
openRun('glutton')
ramSkill.apply(engine, 3)
capSkill.apply(engine, 1) // isGluttonyLord = true, radius *= 1.3
const eliteD = spawnFar('knight')
eliteD.isElite = true
eliteD.x = p().x + 50
eliteD.y = p().y
eliteD.hp = 500 // > 50% maxHp，不触发秒杀吞噬，走冲撞伤害
eliteD.maxHp = 500
const lowMobD = spawnFar('knight')
lowMobD.x = p().x + 80
lowMobD.y = p().y
lowMobD.hp = 40 // <= 50% maxHp，触发荒古领主冲刺秒杀吞噬
lowMobD.maxHp = 100
let eliteHitsD = 0
ws().dashImpact = (target, dmg) => {
  if (target === eliteD) eliteHitsD++
  return origDashImpact(target, dmg)
}
const devoursBeforeD = ws().devours
engine.input.state.right = true
engine.input.queueDash()
for (let f = 0; f < 15; f++) {
  p().update(1 / 60)
}
engine.input.state.right = false
ws().dashImpact = origDashImpact
assert.equal(eliteHitsD, 1, '测试 D：觉醒大半径下单次冲刺对高血精英仅结算 1 次冲撞')
assert.equal(ws().devours, devoursBeforeD + 1, '测试 D：觉醒冲刺对 ≤50% 残血小怪仍正常触发 1 次秒杀吞噬')
ok('glut_ram 单次冲刺去重：测试 A / B / C / D 与荒古领主大半径全部通过')

// ---------------------------------------------------------------
// J. Boss + 小怪同场混合战斗与双进度切换稳定性
// ---------------------------------------------------------------
openRun('glutton')
const bossMix = spawnBossNear(140, 1000)
const huntableMinion = placeHuntable(100, 'knight')
p().gluttonCharge = 2
p().gluttonRecastLock = 0
const bossHpBeforeMix = bossMix.hp
// 同场既有可主动捕食小怪又有可撕咬 Boss：一次 F 只走普通捕食分支、只扣 1 点
pressF()
assert.equal(p().gluttonCharge, 1, '同场混合：一次 F 只消耗 1 点猎食点（不双扣）')
assert.equal(huntableMinion.devouring, true, '同场混合：优先吞噬处于主动捕食带的小怪')
assert.equal(bossMix.hp, bossHpBeforeMix, '同场混合：同一次 F 不会同时吞小怪又撕咬 Boss')

// 0.3s 锁结束后，场上小怪不在主动捕食带（满血），再按 F 走 Boss Bite 分支
engine._updateStrainSkill(GLUTTON_RECAST_LOCK + 0.05)
const fullHpMinion = spawnFar('knight')
fullHpMinion.x = p().x + 90
fullHpMinion.y = p().y
fullHpMinion.hp = 100
fullHpMinion.maxHp = 100
pressF()
assert.equal(p().gluttonCharge, 0, '同场混合：第二次 F 消耗剩余 1 点')
assert.equal(bossMix.hp, bossHpBeforeMix - getGluttonBossBiteDamage(bossMix), '同场混合：无合法小怪猎物时正常撕咬 Boss')
assert.equal(fullHpMinion.devouring, false, '同场混合：满血小怪不被吞噬')

// 双进度独立存在且共用 gluttonCharge（cap 2），切换目标不互相覆盖或暴冲
openRun('glutton')
const bossSwitch = spawnBossNear(140, 1000)
for (let i = 0; i < 3; i++) devour(spawnFar('knight'))
for (let i = 0; i < 6; i++) onGluttonBossBasicHit(p(), bossSwitch)
assert.equal(p().gluttonDevourProgress, 3, '双进度：普通吞噬进度独立保持 3/5')
assert.equal(p().gluttonBossHuntProgress, 6, '双进度：Boss 普攻进度独立保持 6/10')
assert.equal(p().gluttonCharge, 0)
// 再吞 2 只普通怪 -> 产第 1 点，Boss 进度仍为 6
for (let i = 0; i < 2; i++) devour(spawnFar('knight'))
assert.equal(p().gluttonCharge, 1, '双进度：普通吞噬满 5 产第 1 点')
assert.equal(p().gluttonDevourProgress, 0)
assert.equal(p().gluttonBossHuntProgress, 6, '双进度：普通吞噬产点不清空 Boss 普攻进度')
// 再命中 Boss 4 次 -> 产第 2 点（达上限 2）
for (let i = 0; i < 4; i++) onGluttonBossBasicHit(p(), bossSwitch)
assert.equal(p().gluttonCharge, 2, '双进度：Boss 普攻满 10 产第 2 点（达上限 2）')
assert.equal(p().gluttonBossHuntProgress, 0)
// reset 两侧进度全部归零
engine.reset()
assert.equal(p().gluttonDevourProgress, 0, 'reset 后普通吞噬进度归零')
assert.equal(p().gluttonBossHuntProgress, 0, 'reset 后 Boss 普攻进度归零')
assert.equal(p().gluttonCharge, 0, 'reset 后猎食点归零')
ok('同场混合战斗与双进度切换：不双扣、不双触发、双进度正交且共同受 cap 2 约束')

// ---------------------------------------------------------------
// K. 终审一致性护栏（Q1 capstone 14/10 门槛 / Q2 isBasicAttack 正向显式标记 / Q3 glut_maw 单真源）
// ---------------------------------------------------------------

// K1 (Q1)：rollSkills 动态门槛验证（Lv.14 + wave 10 / expeditionStage 5）
openRun('glutton')
engine.primarySpec = 'gluttony'
engine.secondarySpec = 'gluttony'
engine.skillLevels = {
  glut_maw: 3,
  glut_bulk: 3,
  glut_ram: 3,
  glut_eruption: 2,
}
const hasCapstoneInRoll = (level, wave, mode = 'timed', expeditionStage = 1) => {
  engine.runSelection = { ...engine.runSelection, mode }
  engine.expeditionStage = expeditionStage
  p().level = level
  em().wave = wave
  const rolled = rollSkills(engine, 3)
  return rolled.some((s) => s.id === 'glut_capstone')
}
assert.equal(hasCapstoneInRoll(11, 7), false, 'Q1：Lv.11 / wave 7 不可 roll 出 capstone')
assert.equal(hasCapstoneInRoll(12, 7), false, 'Q1：Lv.12 / wave 7 不可 roll 出 capstone')
assert.equal(hasCapstoneInRoll(12, 8), false, 'Q1：Lv.12 / wave 8 不可 roll 出 capstone')
assert.equal(hasCapstoneInRoll(13, 8), false, 'Q1：Lv.13 / wave 8 不可 roll 出 capstone')
assert.equal(hasCapstoneInRoll(14, 8), false, 'Q1：Lv.14 / wave 8 不可 roll 出 capstone（波次未满 10）')
assert.equal(hasCapstoneInRoll(14, 9), false, 'Q1：Lv.14 / wave 9 不可 roll 出 capstone（波次未满 10）')
assert.equal(hasCapstoneInRoll(13, 10), false, 'Q1：Lv.13 / wave 10 不可 roll 出 capstone（等级未满 14）')
assert.equal(hasCapstoneInRoll(14, 10), true, 'Q1：Lv.14 / wave 10 可以 roll 出 capstone')
assert.equal(hasCapstoneInRoll(14, 1, 'expedition', 4), false, 'Q1：远征 Lv.14 / stage 4 不可 roll 出 capstone')
assert.equal(hasCapstoneInRoll(14, 1, 'expedition', 5), true, 'Q1：远征 Lv.14 / stage 5 可以 roll 出 capstone')
engine.runSelection = { ...engine.runSelection, mode: 'timed' }

// K2 (Q2)：Projectile.isBasicAttack 正向显式标记（Test A ~ Test F + 多重射击）
openRun('glutton')
engine.applySkill(mawSkill)
engine.applySkill(mawSkill)
engine.applySkill(mawSkill) // glut_maw Lv.3：ws.damage = 0.7，M2 = 2.0，M1 对 Boss 还原 1.0
const bossQ2 = spawnBossNear(100, 2000)

// Test A：普通射击弹命中 Boss -> 涨进度 +2.0、享受 M1（扣 1.0 而非 0.7）
const critChanceBeforeQ2M1 = ws().critChance
ws().critChance = 0
try {
  ws()._projectiles.length = 0
  ws().fire(bossQ2)
  assert.equal(ws()._projectiles[0].isBasicAttack, true, 'Q2 Test A：WeaponSystem.fire 显式标记 isBasicAttack = true')
  ws()._projectiles[0].x = bossQ2.x
  ws()._projectiles[0].y = bossQ2.y
  rebuildEnemyGrid()
  ws()._resolveCollisions()
  assert.equal(p().gluttonBossHuntProgress, 2.0, 'Q2 Test A：普攻命中 Boss 涨猎食进度')
  assert.ok(Math.abs((2000 - bossQ2.hp) - 1.0) < 1e-6, 'Q2 Test A：普攻命中 Boss 享受 M1 对冲还原')
} finally {
  ws().critChance = critChanceBeforeQ2M1
}

// Test A2：多重射击（projectileCount > 1）的每枚普攻弹均为 isBasicAttack = true
ws().projectileCount = 3
ws()._projectiles.length = 0
ws().fire(bossQ2)
assert.equal(ws()._projectiles.length, 3)
assert.ok(ws()._projectiles.every((pr) => pr.isBasicAttack === true), 'Q2 Test A2：多重射击每枚普攻弹均为 isBasicAttack = true')
ws().projectileCount = 1

// Test B：glut_eruption 喷吐弹命中 Boss -> isBasicAttack = false、不涨进度、不享受 M1
p().devourAcidSpray = 6
ws()._projectiles.length = 0
ws().spawnDevourEruption(bossQ2.x, bossQ2.y, { bossBite: true })
assert.equal(ws()._projectiles[0].isBasicAttack, false, 'Q2 Test B：喷吐弹 isBasicAttack = false')
const hpBeforeB = bossQ2.hp
const progBeforeB = p().gluttonBossHuntProgress
const singleEruptionProj = ws()._projectiles[0]
ws()._projectiles.length = 0
singleEruptionProj.x = bossQ2.x
singleEruptionProj.y = bossQ2.y
ws()._projectiles.push(singleEruptionProj)
rebuildEnemyGrid()
ws()._resolveCollisions()
assert.equal(p().gluttonBossHuntProgress, progBeforeB, 'Q2 Test B：喷吐弹命中 Boss 不涨进度')
assert.ok(
  Math.abs((hpBeforeB - bossQ2.hp) - singleEruptionProj.damage) < 1e-6,
  'Q2 Test B：喷吐弹命中 Boss 不享受 M1 还原（按原 damage 结算）'
)

// Test C：gat_split 分裂小弹命中 Boss -> 即使母弹 isBasicAttack = true，子弹仍为 isBasicAttack = false、不涨进度、不享受 M1
const dummyOrigin = spawnFar('knight')
const parentBasicProj = new Projectile({ x: dummyOrigin.x, y: dummyOrigin.y, damage: 4, isBasicAttack: true })
ws()._projectiles.length = 0
ws()._split(dummyOrigin, parentBasicProj)
assert.ok(ws()._projectiles.length >= 1, 'Q2 Test C：生成分裂子弹')
const splitProj = ws()._projectiles[0]
assert.equal(splitProj.isSplit, true)
assert.equal(splitProj.isBasicAttack, false, 'Q2 Test C：分裂子弹 isBasicAttack = false')
ws()._projectiles.length = 0
splitProj.x = bossQ2.x
splitProj.y = bossQ2.y
ws()._projectiles.push(splitProj)
const hpBeforeC = bossQ2.hp
rebuildEnemyGrid()
ws()._resolveCollisions()
assert.equal(p().gluttonBossHuntProgress, progBeforeB, 'Q2 Test C：分裂子弹命中 Boss 不涨进度')
assert.ok(
  Math.abs((hpBeforeC - bossQ2.hp) - splitProj.damage) < 1e-6,
  'Q2 Test C：分裂子弹命中 Boss 不享受 M1 还原'
)

// Test D：glut_ram 冲撞命中 Boss -> 不涨进度
ws().dashImpact(bossQ2, 3)
assert.equal(p().gluttonBossHuntProgress, progBeforeB, 'Q2 Test D：glut_ram 命中 Boss 不涨进度')

// Test E：Boss Bite 命中 Boss -> 不涨进度
p().gluttonCharge = 1
p().gluttonRecastLock = 0
p().devourAcidSpray = 0
pressF()
assert.equal(p().gluttonBossHuntProgress, progBeforeB, 'Q2 Test E：Boss Bite 命中 Boss 不涨进度')

// Test F：手工构造未传 isBasicAttack / isSplit / isEruption 的特殊 Projectile -> 默认 false、不涨进度、不享 M1
const customSpecialProj = new Projectile({
  x: bossQ2.x,
  y: bossQ2.y,
  damage: 2.1,
})
assert.equal(customSpecialProj.isBasicAttack, false, 'Q2 Test F：未显式传参的自定义 Projectile 默认 isBasicAttack = false')
ws()._projectiles.length = 0
ws()._projectiles.push(customSpecialProj)
const hpBeforeF = bossQ2.hp
rebuildEnemyGrid()
ws()._resolveCollisions()
assert.equal(p().gluttonBossHuntProgress, progBeforeB, 'Q2 Test F：自定义特殊弹命中 Boss 不涨普攻猎食进度')
assert.ok(
  Math.abs((hpBeforeF - bossQ2.hp) - 2.1) < 1e-6,
  `Q2 Test F：自定义特殊弹命中 Boss 不享受 M1 还原（扣血 2.1 而非 ${2.1 / 0.7}）`
)

// K3 (Q3)：glut_maw 等级唯一真源（skillLevels.glut_maw），消除 player.glutMawLevel 双真源
openRun('glutton')
assert.equal('glutMawLevel' in p(), false, 'Q3：Player 实例不再持有 glutMawLevel 镜像字段')
assert.equal(getGluttonMawLevel(p()), 0, 'Q3：初始 glut_maw 等级为 0')
engine.applySkill(mawSkill)
assert.equal(engine.skillLevels.glut_maw, 1, 'Q3：applySkill 写入唯一真源 skillLevels.glut_maw = 1')
assert.equal('glutMawLevel' in p(), false, 'Q3：applySkill 后 Player 仍不产生 glutMawLevel 字段')
assert.equal(getGluttonMawLevel(p()), 1)
assert.equal(getGluttonMawDamageMultiplier(p()), 0.9)
assert.equal(getGluttonBossProgressMultiplier(p()), 1.33)
engine.applySkill(mawSkill)
assert.equal(getGluttonMawLevel(p()), 2)
assert.equal(getGluttonMawDamageMultiplier(p()), 0.8)
assert.equal(getGluttonBossProgressMultiplier(p()), 1.66)
engine.applySkill(mawSkill)
assert.equal(getGluttonMawLevel(p()), 3)
assert.equal(getGluttonMawDamageMultiplier(p()), 0.7)
assert.equal(getGluttonBossProgressMultiplier(p()), 2.0)
engine.reset()
assert.equal(getGluttonMawLevel(p()), 0, 'Q3：engine.reset 清空 skillLevels 后 getGluttonMawLevel 自动归 0')
// 即使外部误挂 player.glutMawLevel，也不会污染唯一真源读取
p().glutMawLevel = 3
assert.equal(getGluttonMawLevel(p()), 0, 'Q3：getGluttonMawLevel 不再读取 player.glutMawLevel 镜像')
delete p().glutMawLevel
ok('终审一致性护栏：Q1 觉醒门槛（14/10/stage5）、Q2 普攻正向显式标记（Test A~F）、Q3 胃囊等级单真源全部通过')

engine.destroy()
console.log(`\n暴食猎食点机制验证通过：${n} 组 ✓`)
