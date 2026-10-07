// 逻辑层回归测试（阶段十三起常驻）：纯 Node 运行，无需浏览器
// 运行：node smoke-test.mjs
import assert from 'node:assert/strict'
import {
  ELEMENTAL_SPEC_PROC_CAP,
  MAX_REACTION_SLOTS,
  Player,
  REACTION_SLOT_LEVELS,
  getReactionSlotLevelBonus,
} from './src/game/entities/Player.js'
import { Enemy } from './src/game/entities/Enemy.js'
import { Boss } from './src/game/entities/Boss.js'
import { EnemyManager } from './src/game/EnemyManager.js'
import {
  COMMON_LOOT_CHANCE,
  DIGEST_CHARGE_MAX,
  DIGEST_GAIN_ELITE,
  DIGEST_GAIN_NORMAL,
  WeaponSystem,
  getLootDropCount,
} from './src/game/WeaponSystem.js'
import {
  ELEMENT_CORE_LIFETIME,
  MAX_ELEMENT_CORES,
  MAX_EXP_GEMS,
  GemManager,
} from './src/game/GemManager.js'
import { SoundManager } from './src/game/SoundManager.js'
import { Projectile } from './src/game/entities/Projectile.js'
import { WorldEventManager } from './src/game/WorldEventManager.js'
import {
  computeScore,
  computeScoreBreakdown,
  defaultSave,
  getRunRecord,
  loadSave,
  pushScore,
} from './src/game/SaveManager.js'
import {
  DIFFICULTIES,
  EXPEDITION_STAGES,
  EVENT_LOCK_AT,
  FINAL_WARNING_AT,
  RUN_DURATION,
  applyEnemyBias,
  calculateMaterialReward,
  getEndlessDisasterTier,
  getExpeditionStage,
  getExpeditionStages,
  getNextModeUnlock,
  getProgressionStage,
  getStageEnemyBias,
  getUnlockedModeIds,
  getWaveModifiers,
  isDifficultyUnlocked,
  isModeUnlocked,
} from './src/game/RunRules.js'
import { CHARACTER_IDS, STRAINS, STRAIN_IDS, canDevour, getStrainSkill } from './src/game/Strains.js'
import { getRunIntro } from './src/game/RunIntro.js'
import { DIGEST_EFFECTS, getDigestTier } from './src/game/ElementSystem.js'
import {
  applyGenes,
  getChosenOrigin,
  getGene,
  getGenePurchaseState,
} from './src/game/GenePool.js'

// —— 最小游戏上下文桩（引擎层不参与：纯逻辑层测试） ——
let dashQueued = false
let interactQueued = false
const input = {
  getMoveVector: () => ({ x: 0, y: 0 }),
  consumeDash: () => {
    const q = dashQueued
    dashQueued = false
    return q
  },
  queueDash: () => {
    dashQueued = true
  },
  consumeInteract: () => {
    const q = interactQueued
    interactQueued = false
    return q
  },
  queueInteract: () => {
    interactQueued = true
  },
}
const player = new Player({ input })
const enemyManager = new EnemyManager()
const weaponSystem = new WeaponSystem({ player, enemyManager })
const gemManager = new GemManager({ player })
const worldEvents = new WorldEventManager()
const sound = new SoundManager() // 无 AudioContext 时全部音效为 no-op
const game = {
  player,
  enemyManager,
  weaponSystem,
  gemManager,
  worldEvents,
  sound,
  camera: { x: 0, y: 0 },
  width: 1280,
  height: 720,
  worldWidth: 2400,
  worldHeight: 1800,
  elapsed: 0, // 游戏时间（首融确认冷却用）
  // 角色权限（阶段十九/第三批）：本文件测的是「元素系统本身的逻辑」，
  // 因此默认按有权限的角色跑；权限矩阵本身在 verify-changes.mjs 里单独锁定。
  canDevour: true,
  canUseElements: true,
  onWaveChanged() {},
  onBossSpawn() {},
  evolutionEvent() {},
  shakeScreen() {}, // 屏幕震动（阶段十五美化，桩）
  reactionSlotsFull() {}, // 副反应位满面板（阶段十六，桩）
}
player.attach(game)
enemyManager.attach(game)
weaponSystem.attach(game)
gemManager.attach(game)
worldEvents.attach(game)

let n = 0
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`)

// 1) 元素附魔缓存、反应激活、零分配形态
player.absorbElement('fire')
assert.equal(player._procs.burn.chance, 0.1)
assert.equal(player._procs.burn.duration, 2)
player.absorbElement('fire')
assert.equal(player._procs.burn.chance, 0.2)
ok('元素附魔概率按等级叠加（10% → 20%）')

player.absorbElement('poison')
assert.ok(player._reactionIds.has('acid'))
assert.equal(player._reactionMap.get('acid').name, '爆炸酸液')
assert.equal(player._mutation().key, 'acid')
ok('吸收毒元素激活酸液反应，形态切换 acid')

assert.equal(player._mutation(), player._mutation())
ok('_mutation 零分配（返回同一缓存对象）')

for (let i = 0; i < 10; i++) player.absorbElement('fire')
assert.equal(player._procs.burn.chance, 0.6)
ok('附魔概率封顶 60%')

assert.equal(weaponSystem._reactionPower(player._reactionMap.get('acid')), 1)
ok('反应强度 = 组合元素最低等级（火12/毒1 → 1）')

// 2) 吞噬结算去重（Bug1：奖励双发）
const e1 = new Enemy({ x: 100, y: 100, speed: 80, hp: 5, type: 'knight' })
e1.attach(game)
enemyManager._enemies.push(e1)
e1.hp = 1
e1.devourable = true
const lootBeforeDevour = weaponSystem.drops.knight
enemyManager._startDevour(e1) // onDevoured 结算一次
const killsAfterDevour = weaponSystem.kills
assert.equal(killsAfterDevour, 1)
assert.equal(weaponSystem.drops.knight, lootBeforeDevour + 1)
weaponSystem._settleKill(e1) // 吞噬中再被「击杀」→ 应被 _settled 拦下
weaponSystem.onDevoured(e1)
assert.equal(weaponSystem.kills, killsAfterDevour)
ok('吞噬结算去重：重复 _settleKill / onDevoured 不再发放奖励')

// 3) DOT 致死仍走统一结算（_settled 收敛到 _settleKill 内部）
const e2 = new Enemy({ x: 300, y: 300, speed: 80, hp: 1, type: 'knight' })
e2.attach(game)
enemyManager._enemies.push(e2)
e2.hp = 1
e2.poisonHits = 1
const kills0 = weaponSystem.kills
e2._tickStatus(1.1) // 中毒跳伤致死
assert.equal(weaponSystem.kills, kills0 + 1)
assert.ok(e2._settled)
weaponSystem._settleKill(e2) // 重复调用被拦
assert.equal(weaponSystem.kills, kills0 + 1)
ok('DOT 致死结算一次且不可重复')

// 4) 空间哈希碰撞：命中击杀 + 吞噬中敌人免伤
enemyManager.reset()
weaponSystem._projectiles.length = 0
const e3 = new Enemy({ x: 500, y: 500, speed: 80, hp: 5, type: 'knight' })
e3.attach(game)
enemyManager._enemies.push(e3)
const e4 = new Enemy({ x: 508, y: 500, speed: 80, hp: 5, type: 'knight' })
e4.attach(game)
enemyManager._enemies.push(e4)
e4.devouring = true
e4._settled = true
e3.hp = 1
enemyManager._buildGrid()
const k1 = weaponSystem.kills
weaponSystem._projectiles.push(
  new Projectile({ x: 499, y: 500, target: e3, vx: 0, vy: 0, damage: 5, life: 2 })
)
weaponSystem._resolveCollisions()
assert.equal(weaponSystem.kills, k1 + 1)
assert.ok(e4.active && e4.hp > 0)
ok('网格碰撞：命中敌人结算击杀，吞噬中敌人被跳过')

// 5) 死亡帧防护（Bug4：面板叠加/快照污染）
player.dead = true
const projCount0 = weaponSystem._projectiles.length
weaponSystem.update(0.016)
assert.equal(weaponSystem._projectiles.length, projCount0)
const gemCount0 = gemManager._gems.length
gemManager.update(0.016)
assert.equal(gemManager._gems.length, gemCount0)
assert.equal(player.gainExp(100), false)
player.absorbElement('water') // 应静默返回
player.dead = false
ok('死亡帧防护：武器/宝石/经验/吸收全部静默')

// 6) 四元素齐备：主形态 1 + 副反应 2（槽位经济，超出组合不激活）
player.absorbElement('water')
player.absorbElement('lightning')
assert.ok(player._reactionIds.has('acid')) // 主形态
assert.equal(player._secondaryIds.size, 2) // 槽位 2：入槽 steam + corrode
assert.ok(player._reactionIds.has('steam'))
assert.ok(player._reactionIds.has('corrode'))
assert.ok(!player._reactionIds.has('gel')) // 槽满，未入槽组合不生效
ok('副反应槽位：主形态 1 + 副反应 2（默认），超出组合不激活')
assert.equal(player._mutation().shape, 'acid') // 设计层：主形态锁定剪影（酸液）
ok('元素形态剪影：主形态锁定驱动形态轮廓（acid）')
assert.ok(player._procs.freeze.chance > 0 && player._procs.poison.chance > 0)
ok('水流+雷电附魔同状态（冻结/麻痹）概率叠加')

// 7) 蒸汽减速：slow 衰减 + 移动速度 ×0.6
const eA = new Enemy({ x: 700, y: 700, speed: 100, hp: 5, type: 'knight' })
const eB = new Enemy({ x: 700, y: 700, speed: 100, hp: 5, type: 'knight' })
eA.attach(game)
eB.attach(game)
eB.slow = 1
eA.update(0.1)
eB.update(0.1)
assert.ok(eA.x - eB.x > 2) // 未减速者明显走得更远
assert.ok(eB.slow > 0 && eB.slow < 1) // slow 随帧衰减
ok('蒸汽减速：减速者移动明显更慢且状态衰减')

// 8) 护盾词缀：吸收前 2 次伤害
const e7 = new Enemy({ x: 800, y: 800, speed: 80, hp: 5, type: 'knight', elite: true, affix: 'shielded' })
e7.attach(game)
const hp0 = e7.hp
e7.hit(5)
assert.equal(e7.hp, hp0)
e7.hit(5)
assert.equal(e7.hp, hp0)
assert.equal(e7.shieldHits, 0)
e7.hit(5)
assert.equal(e7.hp, hp0 - 5)
ok('护盾词缀：前 2 次伤害被吸收，之后正常扣血')

// 9) 经验宝石同位置自动合并
gemManager.reset()
gemManager.spawn(100, 100, 5)
gemManager.spawn(105, 102, 5)
gemManager.spawn(300, 300, 5) // 远处不合并
gemManager._mergeGems()
assert.equal(gemManager.count, 2)
assert.equal(gemManager._gems[0].value, 10)
assert.ok(gemManager._gems[0].size >= 6.5) // 合并后重新分级为中宝石
ok('宝石合并：同位置（<16px）经验宝石并为一颗且数值累加')

// 9b) 合并回收循环的边界：末位元素本身 merged 时，旧的「i-- 写在 else 分支」实现
//     pop 后 i 不回退 → i === list.length → list[i] === undefined → 读 .merged 抛 TypeError。
//     180s 长局已稳定复现，因此这里同时断言「不抛异常」与「清理后的真实数组内容」。
const gmMerge = new GemManager({ player })
gmMerge.attach(game)
const mergeRun = (specs) => {
  gmMerge.reset()
  const gems = specs.map(([x, y, value]) => gmMerge.spawn(x, y, value))
  const before = gems.reduce((sum, g) => sum + g.value, 0) // 必须在合并前取，承载者 value 会变
  gmMerge._mergeGems()
  const list = gmMerge._gems
  return {
    gems,
    list,
    before,
    after: list.reduce((sum, g) => sum + g.value, 0),
    residue: list.filter((g) => g.merged).length,
  }
}

// ① 末位元素本身就是 merged（崩溃现场）
{
  const r = mergeRun([[100, 100, 5], [105, 102, 5]])
  assert.equal(r.list.length, 1, '末位 merged 必须被删除')
  assert.equal(r.list[0], r.gems[0], '承载经验的宝石必须保留')
  assert.equal(r.list[0].value, 10)
  assert.equal(r.residue, 0)
  assert.equal(r.after, r.before, '合并前后经验总值守恒')
}
ok('宝石回收：末位 merged 不再抛 TypeError，被正确删除且经验守恒')

// ② 连续多个尾部元素 merged
{
  const r = mergeRun([[100, 100, 3], [101, 100, 4], [102, 100, 5], [103, 100, 6]])
  assert.equal(r.list.length, 1, '连续尾部 merged 必须全部删除')
  assert.equal(r.list[0], r.gems[0])
  assert.equal(r.list[0].value, 18)
  assert.equal(r.residue, 0)
  assert.equal(r.after, r.before)
}
ok('宝石回收：连续多个尾部 merged 全部删除，只留承载经验的那一颗')

// ③ 中间存在 merged、尾部未 merged
{
  const r = mergeRun([[100, 100, 5], [105, 100, 7], [400, 400, 11]])
  assert.equal(r.list.length, 2, '只删除 merged 的那一颗')
  assert.ok(!r.list.includes(r.gems[1]), '被吸收的宝石必须移除')
  assert.ok(r.list.includes(r.gems[0]) && r.list.includes(r.gems[2]), '未删除的元素必须原样保留')
  assert.equal(r.residue, 0)
  assert.equal(r.after, r.before)
}
ok('宝石回收：中间 merged + 尾部未 merged 时，只删 merged 且其余元素一个不少')

// ④ merged / unmerged 交错
{
  const r = mergeRun([[100, 100, 2], [103, 100, 3], [200, 200, 4], [203, 200, 5], [400, 400, 6]])
  assert.equal(r.list.length, 3)
  assert.equal(r.residue, 0, '清理后不允许存在 merged 残留')
  assert.ok(!r.list.includes(r.gems[1]) && !r.list.includes(r.gems[3]))
  assert.ok(r.list.includes(r.gems[0]) && r.list.includes(r.gems[2]) && r.list.includes(r.gems[4]))
  assert.equal(r.after, r.before)
}
ok('宝石回收：交错标记全部清除，未标记元素全部保留')

// ⑤ 无 merged：数组必须完全不动（对象与顺序都不变）
{
  const r = mergeRun([[100, 100, 5], [400, 400, 7], [900, 900, 11]])
  assert.equal(r.list.length, 3)
  assert.ok(r.list.every((g, i) => g === r.gems[i]), '无 merged 时不应发生任何搬移')
  assert.deepEqual(r.list.map((g) => g.value), [5, 7, 11])
  assert.equal(r.after, r.before)
}
ok('宝石回收：无 merged 时数组完全不变')

// ⑥ 多轮压力：掉落 → 合并 → 拾取（swap-pop 删除）交错，模拟长局宝石池
{
  gmMerge.reset()
  let seed = 20260926
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  let spawned = 0
  let expSpawned = 0
  let expPicked = 0
  let picked = 0
  let mergedAway = 0
  let rounds = 0
  for (let step = 0; step < 3000; step++) {
    const drops = 1 + ((rand() * 3) | 0) // 每步掉 1~3 颗
    for (let d = 0; d < drops; d++) {
      // 位置落在 12×12 个聚集点附近 → 复现「同位置宝石」的真实分布
      const cx = 120 + ((rand() * 12) | 0) * 90
      const cy = 120 + ((rand() * 12) | 0) * 90
      const g = gmMerge.spawn(cx + rand() * 24, cy + rand() * 24, 1 + ((rand() * 20) | 0))
      spawned++
      expSpawned += g.value
    }
    if (step % 5 !== 0) continue
    const before = gmMerge.count
    gmMerge._mergeGems()
    rounds++
    mergedAway += before - gmMerge.count // 合并轮自身回收掉的数量
    // 模拟拾取：与 GemManager.update 一致的 swap-pop 删除（打乱末位、制造尾部 merged 场景）
    const list = gmMerge._gems
    const picks = (rand() * 4) | 0
    for (let k = 0; k < picks && list.length > 0; k++) {
      const i = (rand() * list.length) | 0
      expPicked += list[i].value
      list[i] = list[list.length - 1]
      list.pop()
      picked++
    }
  }
  const residue = gmMerge._gems.filter((g) => g.merged).length
  assert.ok(rounds >= 500, `压力轮次应足够多（实际 ${rounds}）`)
  assert.ok(mergedAway >= 1000, `合并回收次数应足够多（实际 ${mergedAway}）`)
  assert.equal(gmMerge.count, spawned - mergedAway - picked, '数组长度必须与掉落-合并回收-拾取严格一致')
  assert.equal(residue, 0, '多轮合并后不允许有 merged 残留')
  assert.equal(
    gmMerge._gems.reduce((sum, g) => sum + g.value, 0),
    expSpawned - expPicked,
    '多轮合并 + 拾取交错后经验总值仍守恒'
  )
}
ok('宝石回收：多轮「掉落→合并→拾取」交错无残留、无越界，经验总值守恒')

// 10) Boss 召唤小兵波次成长（spawnAt 复用 spawn 公式）
enemyManager.reset()
enemyManager.wave = 10
enemyManager.spawnAt(100, 100, 'knight')
const last = enemyManager.enemies[enemyManager.enemies.length - 1]
assert.ok(last.hp >= 8) // 基础 hp ≥ 5 × 骑士系数 1.6 = 8
ok('spawnAt 波次成长：第 10 波召唤兵不再是一碰就碎的空气')

// 11) 自爆/召唤词缀死亡特效
player.hp = 5
player.invincible = 0
const e8 = new Enemy({ x: player.x + 10, y: player.y, speed: 80, hp: 5, type: 'knight', elite: true, affix: 'explosive' })
e8.attach(game)
weaponSystem._settleKill(e8)
assert.equal(player.hp, 4) // 90px 内自爆伤 1 点
ok('自爆词缀：死亡时炸伤附近玩家（吞噬不触发，是克制手段）')

const beforeCount = enemyManager.count
const e9 = new Enemy({ x: player.x + 10, y: player.y, speed: 80, hp: 5, type: 'knight', elite: true, affix: 'summoner' })
e9.attach(game)
weaponSystem._settleKill(e9)
assert.equal(enemyManager.count, beforeCount + 2)
ok('召唤词缀：死亡时召唤 2 名骑士')

player.invincible = 0
const beforeDual = enemyManager.count
const dual = new Enemy({
  x: player.x + 10,
  y: player.y,
  speed: 80,
  hp: 5,
  type: 'knight',
  elite: true,
  affixes: ['explosive', 'summoner'],
})
dual.attach(game)
const hpBeforeDual = player.hp
weaponSystem._settleKill(dual)
assert.ok(dual.hasAffix('explosive') && dual.hasAffix('summoner'))
assert.equal(player.hp, hpBeforeDual - 1)
assert.equal(enemyManager.count, beforeDual + 2)
ok('地狱双词缀：自爆与召唤可同时生效')

// 12) 蒸汽云雾 / 毒雷风暴行为统计（直接调用合成反应对象，不受槽位限制）
weaponSystem._dropCloud(200, 200)
assert.equal(weaponSystem.stats.slowClouds, 1)
weaponSystem._venomStorm({ combo: ['poison', 'lightning'] }) // 合成反应：_reactionPower 读元素等级
assert.equal(weaponSystem.stats.venomStorms, 1)
ok('蒸汽云雾/毒雷风暴：行为统计（物种档案）正常记录')

// 13) 取消通用冲刺：静止时不注入位移或无敌。
player.invincible = 0
const sx = player.x, sy = player.y
player.update(0.016)
assert.equal(player.x, sx)
assert.equal(player.y, sy)
assert.equal(player.invincible, 0)
ok('移除通用冲刺，无额外位移或无敌')

// 14) DOT 跳伤随武器伤害成长（阶段十四调优：元素伤害不再固定 1 点）
const eD = new Enemy({ x: 900, y: 900, speed: 80, hp: 5, type: 'knight' })
eD.attach(game)
const hpD0 = eD.hp
eD.hit(1, { burn: 2, burnDmg: 3 }) // 直伤 1 + 引燃 2s（每跳 3 点）
assert.equal(eD._burnDmg, 3)
eD._tickStatus(0.6) // 第一跳
assert.equal(eD.hp, hpD0 - 1 - 3)
eD.hit(0, { burn: 2, burnDmg: 1 }) // 更小的跳伤不覆盖已有的高跳伤
assert.equal(eD._burnDmg, 3)
ok('DOT 跳伤随攻击力成长：跳伤值附加时锁定、同状态取较大值')

// 15) 精英击杀必掉元素核心（掉率上调：精英 100% / 法师 40% / 普通 15%）
gemManager.reset()
const gemsBefore = gemManager.count
const eElite = new Enemy({ x: 950, y: 950, speed: 80, hp: 5, type: 'knight', elite: true })
eElite.attach(game)
weaponSystem._settleKill(eElite)
assert.equal(gemManager.count, gemsBefore + 2) // 经验宝石 + 精英必掉元素核心
ok('精英击杀必掉元素核心：经验宝石 + 核心 = +2 颗（普通怪/法师不再掉）')

// 15b) 元素权限（第三批角色化）：无权限角色不产出核心，absorbElement 无副作用
{
  const before = gemManager.count
  game.canUseElements = false
  const eNoEl = new Enemy({ x: 950, y: 950, speed: 80, hp: 5, type: 'knight', elite: true })
  eNoEl.attach(game)
  weaponSystem._settleKill(eNoEl)
  assert.equal(gemManager.count, before + 1, '无元素权限：精英只掉经验宝石，不产核心')
  const lvBefore = [...player.elements.entries()]
  const reactionsBefore = player._reactions.length
  player.absorbElement('fire')
  assert.deepEqual([...player.elements.entries()], lvBefore, '无元素权限：absorbElement 直接短路')
  assert.equal(player._reactions.length, reactionsBefore, '无元素权限：不产生新的反应缓存')
  game.canUseElements = true
  ok('元素权限：无权限角色不产核心且 absorbElement 无副作用')
}

// 16) 视觉增强：随机眨眼 + 元素氛围粒子（阶段十五美化）
player._blinkT = 0
player.update(0.016)
assert.ok(player._blink > 0)
for (let i = 0; i < 20; i++) player.update(0.05)
assert.ok(player._aura.length > 0)
ok('视觉增强：随机眨眼触发 + 元素氛围粒子生成')

// 17) 敌人动画状态：出生弹入计时 + 移动弹跳相位（阶段十五美化）
const eAni = new Enemy({ x: 1000, y: 1000, speed: 80, hp: 5, type: 'knight' })
eAni.attach(game)
assert.equal(eAni._spawnT, 0.28)
eAni._tickStatus(0.3)
assert.equal(eAni._spawnT, 0) // 计时随状态机递减
eAni.update(0.1) // 骑士远离玩家 → 移动
assert.ok(eAni._moving)
assert.ok(eAni._walkT > 0)
ok('敌人动画状态：出生弹入递减 + 移动相位推进')

// 18) 融合进化：主形态锁定 + 副反应槽位入槽（阶段十五/十六设计改造）
let evoCount = 0
let lastEvo = null
const p2 = new Player({ input })
p2.game = {
  sound,
  evolutionEvent: (...args) => {
    evoCount++
    lastEvo = args
  },
  reactionSlotsFull() {},
}
p2.absorbElement('fire')
p2.absorbElement('water') // 激活蒸汽 → 首次融合 = 主形态锁定
assert.equal(evoCount, 1)
assert.equal(p2._primaryReaction, 'steam')
assert.equal(p2._mutation().key, 'steam')
p2.absorbElement('poison') // 酸液 + 腐蚀 → 2 个空槽全入（2/2）
assert.equal(evoCount, 2)
assert.equal(lastEvo[0], '副反应激活：爆炸酸液！')
assert.ok(lastEvo[1].includes('腐蚀')) // 副标题合并两行
assert.ok(lastEvo[3].includes('不改变主形态')) // 效果说明标注叠加
assert.equal(p2._secondaryIds.size, 2)
assert.equal(p2._mutation().key, 'steam') // 外形锁定：副反应不再换肤
assert.equal(p2._primaryReaction, 'steam') // 主形态不变
ok('融合进化主形态锁定：首个融合即物种身份，副反应入槽叠加生效')

// 19) 副反应槽满 → 替换面板 + 替换/放弃（阶段十六槽位经济）
let fullCandidateId = null
p2.game.reactionSlotsFull = (candidateId) => {
  fullCandidateId = candidateId // Player 传候选 id；引擎层才组装面板 payload
}
p2.absorbElement('lightning') // 新组合 gel/burst/venom → 槽满 → 面板（候选 gel）
assert.equal(fullCandidateId, 'gel') // 反应表顺序第一个候选
assert.equal(p2.secondarySlots, 2)
assert.equal(p2._secondaryIds.size, 2)
p2.resolveSecondarySwap(fullCandidateId, 'acid') // 替换 acid → gel
assert.ok(p2._secondaryIds.has('gel'))
assert.ok(!p2._secondaryIds.has('acid'))
assert.ok(p2._reactionIds.has('gel'))
assert.ok(!p2._reactionIds.has('acid')) // 被替换的反应效果立即失效
p2.resolveSecondarySwap('venom', null) // 放弃路径：不改变任何状态
assert.equal(p2._secondaryIds.size, 2)
ok('副反应槽满：替换面板回调 + 替换生效（旧反应失效）/ 放弃无副作用')

// 20) 首融确认：shouldConfirmElement 判定 + 持住/吐回宝石（阶段十六追加设计）
const p5 = new Player({ input })
assert.equal(p5.shouldConfirmElement('fire'), true) // 第一颗元素：确认
p5.elements.set('fire', 1)
p5._refreshElements()
assert.equal(p5.shouldConfirmElement('fire'), false) // 同款升级：不确认
assert.equal(p5.shouldConfirmElement('water'), true) // 首融：确认
ok('吃前确认判定：第一颗元素与首次融合都确认，同款升级不确认')

const p4 = new Player({ input })
p4.elements.set('fire', 1)
p4._refreshElements()
assert.equal(p4.wouldFuseFirst('water'), true) // 新增元素 + 会成组合 → 确认
assert.equal(p4.wouldFuseFirst('fire'), false) // 同款元素只升级，不触发新组合
const gm2 = new GemManager({ player: p4 })
gm2.attach(game)
p4.x = 500
p4.y = 500
gm2.spawn(500, 500, 0, 'water')
const heldCalls = []
game.askFusionConfirm = (type) => heldCalls.push(type)
const gHeld = gm2._gems[0]
gm2.update(0.016) // 元素核心不再自动磁吸
assert.deepEqual(heldCalls, [])
assert.equal(gHeld.state, 'idle')
input.queueInteract()
gm2.update(0.016) // 近距离按 E → 首融确认
assert.deepEqual(heldCalls, ['water'])
assert.equal(gHeld.state, 'held') // 宝石被持住，不吸收不删除
gm2.resolveHeld(false) // 吐掉
assert.equal(gHeld.state, 'idle')
assert.ok(gHeld.rejectedUntil > 0) // 2s 冷却防原地重复弹窗
input.queueInteract()
gm2.update(0.016) // 冷却未过 → 按 E 也不触发确认
assert.equal(heldCalls.length, 1)
assert.equal(gm2.count, 1)
gHeld.rejectedUntil = 0
gHeld.x = p4.x
gHeld.y = p4.y // 玩家重新靠近后才能再次主动吸收
input.queueInteract()
gm2.update(0.016) // 冷却过后主动吸收 → 再次确认
assert.equal(heldCalls.length, 2)
gm2.resolveHeld(true) // 确认吃下 → 宝石移除
assert.equal(gm2.count, 0)
ok('元素核心主动拾取：不自动磁吸，按 E 确认，吐回带冷却且不再追人')

// 21) 离散血量吞噬线：小体型敌人剩 1 HP 时也必须可吞噬
const eSmall = new Enemy({ x: 600, y: 600, speed: 80, hp: 1, type: 'knight' }) // 实际 2 HP
eSmall.attach(game)
eSmall.hit(1)
assert.equal(eSmall.hp, 1)
assert.equal(eSmall.devourable, true)
ok('吞噬阈值按离散血量兜底：2 HP 敌人剩 1 HP 可吞噬')

// 22) 穿透：一枚飞弹可连续命中两个重叠目标，且同目标只结算一次
enemyManager.reset()
weaponSystem._projectiles.length = 0
weaponSystem._pools.length = 0
weaponSystem._clouds.length = 0
player.elements.clear()
player._primaryReaction = null
player._secondaryIds.clear()
player._refreshElements()
const eP1 = new Enemy({ x: 700, y: 700, speed: 80, hp: 10, type: 'knight' })
const eP2 = new Enemy({ x: 703, y: 700, speed: 80, hp: 10, type: 'knight' })
eP1.attach(game)
eP2.attach(game)
enemyManager._enemies.push(eP1, eP2)
enemyManager._buildGrid()
const hpP1 = eP1.hp
const hpP2 = eP2.hp
const critChanceBeforePierce = weaponSystem.critChance
weaponSystem.critChance = 0
weaponSystem._projectiles.push(
  new Projectile({ x: 701, y: 700, vx: 0, vy: 0, damage: 2, life: 2, pierces: 1 })
)
weaponSystem._resolveCollisions()
assert.equal(eP1.hp, hpP1 - 2)
assert.equal(eP2.hp, hpP2 - 2)
assert.equal(weaponSystem._projectiles[0].active, false)
weaponSystem.critChance = critChanceBeforePierce
ok('动能穿透：一枚飞弹连续命中两个目标且不会重复命中')

// 23) 刺客替身、击杀爆发与局内状态清理
player.resetRunState()
player.shadowDecoyDuration = 1.5
player.killRushSpeed = 0.4
player.devourDamageReduction = 0.25
getStrainSkill('origin').use(game)
assert.equal(player._decoys.length, 1)
const taunted = new Enemy({ x: player.x + 100, y: player.y, speed: 80, hp: 5, type: 'knight' })
taunted.attach(game)
assert.equal(player.getEnemyTarget(taunted).isDecoy, true)
player.triggerKillRush()
player.triggerDevourGuard()
assert.equal(player.killRushTimer, 2)
assert.equal(player.devourDamageReductionTimer, 3)
player.resetRunState()
assert.equal(player._decoys.length, 0)
assert.equal(player.shadowDecoyDuration, 0)
assert.equal(player.killRushSpeed, 0)
assert.equal(player.devourDamageReduction, 0)
ok('专精行为：替身可嘲讽、击杀/吞噬增益有限时且重开状态可清理')

// 24) 地图事件：抵达讨伐队猎营后生成 3 名事件精英，击败后发奖并可完整重置
enemyManager.reset()
gemManager.reset()
worldEvents.reset()
const hunt = worldEvents.spawnEvent('hunt')
player.x = hunt.x
player.y = hunt.y
worldEvents.update(1)
assert.equal(hunt.state, 'active')
const huntTargets = enemyManager.enemies.filter((e) => e.eventToken === hunt.token)
assert.equal(huntTargets.length, 3)
assert.ok(huntTargets.every((e) => e.isElite))
for (const target of huntTargets) weaponSystem._settleKill(target)
assert.equal(hunt.state, 'complete')
assert.equal(worldEvents.completed, 1)
assert.ok(gemManager.count >= 2)
worldEvents.reset()
assert.equal(worldEvents.current, null)
assert.equal(worldEvents.completed, 0)
ok('地图事件：抵达激活、事件精英归属、完成奖励与重开清理形成闭环')

enemyManager.reset()
gemManager.reset()
const surge = worldEvents.spawnEvent('surge')
player.x = surge.x
player.y = surge.y
player.hp = 1
worldEvents.update(1)
assert.equal(surge.state, 'active')
assert.ok(player.hp > 1)
for (let i = 0; i < 121; i++) worldEvents.update(0.1)
assert.equal(surge.state, 'complete')
assert.equal(player.hp, player.maxHp)
ok('污染浪潮：触发时应急治疗，目标时长先于失败期限并在完成时回满')

// 26) 遭遇导演：同一波内部按集结 → 围攻 → 冲刺切换节拍（波末最快，无死时间）
enemyManager._bossGrace = 0
enemyManager._waveTimer = 2
enemyManager._directorFactor()
assert.equal(enemyManager.directorInfo.phase, '集结')
enemyManager._waveTimer = 15
enemyManager._directorFactor()
assert.equal(enemyManager.directorInfo.phase, '围攻')
enemyManager._waveTimer = 28
enemyManager._directorFactor()
assert.equal(enemyManager.directorInfo.phase, '冲刺')
assert.equal(enemyManager.directorInfo.intensity, 1.3, '冲刺段强度高于围攻段（1.12）——波末压力最大')
ok('遭遇导演：每波具备集结、围攻、冲刺三段压力节拍（以高潮收尾）')

// 27) 新计分：波次相同时时长不重复加分，各类高价值行为有独立来源
const scoreRun = { wave: 6, kills: 40, devours: 8, eliteKills: 3, bossKills: 1, eventsCompleted: 2, time: 150 }
const scoreA = computeScore(scoreRun)
const scoreB = computeScore({ ...scoreRun, time: 999 })
const breakdown = computeScoreBreakdown(scoreRun)
assert.equal(scoreA, scoreB)
assert.equal(scoreA, breakdown.total)
assert.equal(breakdown.events, 700)
assert.equal(breakdown.progress, 500)
ok('计分拆分：时间不与波次重复计分，吞噬/精英/Boss/事件奖励可解释')

globalThis.localStorage = {
  getItem: () => JSON.stringify({
    drops: 0,
    genes: {},
    best: { wave: 6, kills: 40, time: 300 },
    board: [{ score: 99999, wave: 6, kills: 40, time: 300, species: '旧版史莱姆' }],
    sound: { muted: false },
  }),
}
const migratedSave = loadSave()
const migratedRecord = getRunRecord(migratedSave, { mode: 'endless', difficulty: 'normal' })
assert.equal(migratedSave.version, 4)
assert.deepEqual(migratedSave.preferences, { mode: 'endless', difficulty: 'normal' })
assert.equal(migratedSave.progression.highestMode, 'endless')
assert.equal(migratedRecord.board[0].scoreVersion, 3)
assert.equal(migratedRecord.board[0].score, computeScore({ mode: 'endless', wave: 6, kills: 40 }))
assert.notEqual(migratedRecord.board[0].score, 99999)
delete globalThis.localStorage
ok('旧排行榜迁移：归入普通无尽并按 V3 口径重算')

const blankV3 = defaultSave()
blankV3.version = 3
delete blankV3.progression.highestMode
blankV3.preferences = { mode: 'timed', difficulty: 'normal' }
globalThis.localStorage = { getItem: () => JSON.stringify(blankV3) }
const freshV3 = loadSave()
assert.equal(freshV3.progression.highestMode, 'expedition')
assert.equal(freshV3.preferences.mode, 'expedition')

const v3Source = structuredClone(blankV3)
v3Source.records['timed:normal'] = {
  best: { wave: 8, kills: 30, time: 240, clears: 0 },
  board: [{ mode: 'timed', difficulty: 'normal', result: 'defeat', wave: 8, kills: 30, time: 240 }],
}
globalThis.localStorage = { getItem: () => JSON.stringify(v3Source) }
const grandfatheredV3 = loadSave()
assert.equal(grandfatheredV3.progression.highestMode, 'timed')
assert.equal(grandfatheredV3.preferences.mode, 'timed')
delete globalThis.localStorage
ok('V3 旧档按真实限时战绩补发模式权限，不依赖默认偏好误判')

const fresh = defaultSave()
assert.deepEqual(fresh.preferences, { mode: 'expedition', difficulty: 'normal' })
assert.deepEqual(getUnlockedModeIds(fresh.progression), ['expedition'])
assert.equal(getNextModeUnlock(fresh.progression).mode, 'timed')
assert.equal(Object.keys(fresh.records).length, 12)
assert.equal(RUN_DURATION, 720)
assert.equal(FINAL_WARNING_AT, 690)
assert.equal(EVENT_LOCK_AT, 660)
assert.equal(DIFFICULTIES.easy.playerBonusHp, 2)
assert.equal(DIFFICULTIES.hard.rewardMul, 1.25)
assert.equal(DIFFICULTIES.hell.eliteChanceCap, 0.24)
assert.equal(getEndlessDisasterTier({ mode: 'endless' }, 24), 0)
assert.equal(getEndlessDisasterTier({ mode: 'endless' }, 25), 1)
assert.equal(getWaveModifiers({ mode: 'endless' }, 30).tier, 2)
assert.equal(EXPEDITION_STAGES.length, 6)
assert.equal(getExpeditionStage('easy', 3).type, 'elites')
assert.equal(getExpeditionStage('easy', 6).type, 'boss')
assert.equal(getExpeditionStage('normal', 8).type, 'boss')
assert.equal(getExpeditionStage('hard', 9).narrativeKey, 'origin')
assert.equal(getExpeditionStage('hell', 7).narrativeKey, 'sanctum')
assert.equal(getExpeditionStage('hell', 12).type, 'boss')
assert.equal(getExpeditionStages('easy').length, 6)
assert.equal(getExpeditionStages('normal').length, 8)
assert.equal(getExpeditionStages('hard').length, 10)
assert.equal(getExpeditionStages('hell').length, 12)
assert.equal(getProgressionStage(1).theme, 'frontier')
assert.equal(getProgressionStage(19).theme, 'frontier')
assert.equal(getProgressionStage(20).theme, 'blight')
assert.equal(getProgressionStage(29).variant, 'blight-garden')
assert.equal(getProgressionStage(30).theme, 'royal')
assert.equal(getProgressionStage(45).variant, 'outer-bailey')
// 角色设计护栏（阶段十九）：四条角色血统各绑定一棵互不相同的专精树、各有 F 技能与
// 明确的玩法短板；origin 保持「无身份」纯净基线（不绑树、不吞、无 F 技能）。
assert.equal(STRAIN_IDS.length, 6)
assert.equal(CHARACTER_IDS.length, 5)
assert.deepEqual(STRAIN_IDS, ['origin', ...CHARACTER_IDS])
assert.ok(!STRAINS.origin.maxHp && !STRAINS.origin.speedMul && !STRAINS.origin.damageMul)
assert.equal(STRAINS.origin.roleSpec, null, 'origin 不绑定技能树（保留 Lv.5 四选一）')
assert.equal(getStrainSkill('origin').id, 'slime_shock', '原生拥有黏液震荡')
assert.equal(canDevour('origin'), false, 'origin 不享受吞噬独占')

const roleSpecs = CHARACTER_IDS.map((id) => STRAINS[id].roleSpec)
assert.ok(
  roleSpecs.every((spec) => typeof spec === 'string' && spec.length > 0),
  '每条角色血统都必须绑定 roleSpec'
)
assert.equal(new Set(roleSpecs).size, 5, '五条角色绑定五棵互不相同的专精树')
for (const id of CHARACTER_IDS) {
  assert.ok(getStrainSkill(id), `${id} 必须有 F 专属技能`)
  // 玩法短板：每条角色至少有一项明确的负向机制修正（而非只有加成）
  const s = STRAINS[id]
  const hasDrawback =
    s.attackMode === 'melee' || (s.bodyProjectileDamageMul || 1) < 1 || (s.maxHp || 0) < 0 || (s.fireIntervalMul || 1) > 1 || (s.devourRadius || 1) < 1 || (s.speedMul || 1) < 1
  assert.ok(hasDrawback, `${id} 必须有玩法层面的短板（负向机制修正）`)
}
assert.equal(canDevour('glutton'), true, '只有暴食史莱姆可以吞噬')
assert.ok(CHARACTER_IDS.filter((id) => canDevour(id)).length === 1, '吞噬独占者只能是暴食')
assert.ok(STRAINS.glutton.devourRadius > 1 && STRAINS.glutton.attackMode === 'melee', '暴食以攻击距离换取捕食收益；近战范围另有真实战斗测试')
assert.ok(STRAINS.ricochet.projectileCount > 0 && (STRAINS.ricochet.fireIntervalMul || 1) > 1)
assert.ok(STRAINS.elemental.critChance > 0 && STRAINS.elemental.maxHp < 0)
assert.ok(STRAINS.shadow.critChance > 0 && STRAINS.shadow.maxHp < 0)
const strainIntro = getRunIntro({ mode: 'timed', difficulty: 'normal' }, 'glutton')
assert.ok(strainIntro.strainNote.includes('暴食史莱姆'))
assert.equal(getRunIntro({ mode: 'timed', difficulty: 'normal' }, 'origin').strainNote, null)
assert.equal(calculateMaterialReward(10, { difficulty: 'easy' }), 8)
assert.equal(calculateMaterialReward(10, { difficulty: 'hard' }), 13)
assert.equal(calculateMaterialReward(10, { difficulty: 'hell' }), 16)
ok('模式规则：新档默认普通闯关、12 分钟节点与灾变阶级一致')
ok('血统设计护栏：特化血统各有代价、原生黏液纯净基线、简报展示血统行')

const normalRewardEnemy = new Enemy({ x: 0, y: 0, speed: 100, hp: 10, rewardHp: 10, type: 'knight', elite: true })
const hellRewardEnemy = new Enemy({ x: 0, y: 0, speed: 112, hp: 14.5, rewardHp: 10, type: 'knight', elite: true, attackTempo: 1.18 })
assert.ok(hellRewardEnemy.hp > normalRewardEnemy.hp)
assert.ok(hellRewardEnemy.attackInterval < normalRewardEnemy.attackInterval)
assert.equal(hellRewardEnemy.expValue, normalRewardEnemy.expValue)
ok('难度奖励边界：敌人属性增强但经验值不随难度膨胀，素材只在结算乘算')

// 非人敌族（战獒/魔像/怨灵）：速度与血量梯度 + 怨灵命中吸血
const mkEnemy = (type) => new Enemy({ x: 0, y: 0, speed: 100, hp: 10, rewardHp: 10, type })
const knightUnit = mkEnemy('knight')
const houndUnit = mkEnemy('hound')
const golemUnit = mkEnemy('golem')
const wraithUnit = mkEnemy('wraith')
assert.ok(houndUnit.speed > knightUnit.speed * 1.3 && houndUnit.hp < knightUnit.hp)
assert.ok(houndUnit.attackInterval < knightUnit.attackInterval)
assert.ok(golemUnit.hp > knightUnit.hp * 2.5 && golemUnit.speed < knightUnit.speed * 0.7)
assert.equal(golemUnit.damage, 2)
assert.ok(wraithUnit.hp > houndUnit.hp && wraithUnit.damage === 1)
ok('非人敌族数值：战獒快袭脆皮、魔像重壁慢速、怨灵中坚吸血定位成立')

wraithUnit.hp = 1
wraithUnit.attackCd = 0
wraithUnit.game = {
  enemyManager: { addText() {} },
  devourThreshold: 0.25,
  player: { x: wraithUnit.x + 10, y: wraithUnit.y, radius: 12, hit() { return true } },
}
wraithUnit.update(1 / 60)
assert.ok(wraithUnit.hp > 1, '怨灵命中后应吸血回升')
ok('怨灵吸血：命中回复 30% 生命（克制手段只剩爆发输出）')

// 吞噬边界：魔像（石造物）与怨灵（亡魂）残血不进入可吞噬状态；战獒（活物）仍可吞噬
const lowGolem = mkEnemy('golem')
lowGolem.hit(lowGolem.hp - 1)
assert.equal(lowGolem.devourable, false)
const lowWraith = mkEnemy('wraith')
lowWraith.hit(lowWraith.hp - 1)
assert.equal(lowWraith.devourable, false)
const lowHound = mkEnemy('hound')
lowHound.hit(lowHound.hp - 1)
assert.equal(lowHound.devourable, true)
ok('吞噬边界：魔像与怨灵没有血肉不可吞噬，战獒作为活物仍可吞噬')

// 分层吞噬线：普通怪 12%（约 19% 血量不举旗），精英 38%（约 29% 血量即举旗）
const tierNormal = mkEnemy('knight') // 16 HP
tierNormal.hit(13) // 剩 3/16 ≈ 19% —— 高于 12% 线，不投降
assert.equal(tierNormal.devourable, false)
tierNormal.hit(1) // 剩 2/16 = 12.5% —— 跨过离散兜底线（ceil(16×0.12)=2）
assert.equal(tierNormal.devourable, true)
const tierElite = new Enemy({ x: 0, y: 0, speed: 100, hp: 10, rewardHp: 10, type: 'knight', elite: true }) // 48 HP
tierElite.hit(27) // 剩 21/48 ≈ 44% —— 未到精英 38% 线
assert.equal(tierElite.devourable, false)
tierElite.hit(7) // 剩 14/48 ≈ 29% ≤ 38% —— 精英提前举白旗
assert.equal(tierElite.devourable, true)
ok('分层吞噬线：普通怪 12% 才投降、精英 38% 提前举白旗（抢吞精英成为决策点）')

const profileSave = defaultSave()
pushScore(profileSave, { mode: 'timed', difficulty: 'normal' }, {
  result: 'defeat', wave: 24, kills: 999, time: 720,
})
const timedClear = pushScore(profileSave, { mode: 'timed', difficulty: 'normal' }, {
  result: 'victory', wave: 25, kills: 100, time: 760, finaleTime: 40,
})
pushScore(profileSave, { mode: 'endless', difficulty: 'normal' }, {
  result: 'defeat', wave: 12, kills: 120, time: 360,
})
pushScore(profileSave, { mode: 'expedition', difficulty: 'normal' }, {
  result: 'defeat', stage: 4, wave: 8, kills: 90, time: 620,
})
assert.equal(timedClear.board[0].result, 'victory')
assert.equal(getRunRecord(profileSave, { mode: 'timed', difficulty: 'normal' }).board.length, 2)
assert.equal(getRunRecord(profileSave, { mode: 'endless', difficulty: 'normal' }).board.length, 1)
assert.equal(getRunRecord(profileSave, { mode: 'expedition', difficulty: 'normal' }).board.length, 1)
assert.equal(profileSave.progression.highestDifficulty, 'hard')
assert.equal(isDifficultyUnlocked(profileSave.progression, 'hard'), true)
assert.equal(isDifficultyUnlocked(profileSave.progression, 'hell'), false)
const hellUnlock = pushScore(profileSave, { mode: 'endless', difficulty: 'hard' }, {
  result: 'defeat', wave: 25, kills: 200, time: 750,
})
assert.equal(hellUnlock.unlocked, 'hell')
assert.equal(isDifficultyUnlocked(profileSave.progression, 'hell'), true)
ok('独立记录与解锁：3×4 榜单隔离，胜利优先并按条件解锁困难/地狱')

const expeditionUnlockSave = defaultSave()
const expeditionClear = pushScore(expeditionUnlockSave, { mode: 'expedition', difficulty: 'normal' }, {
  result: 'victory', stage: 6, wave: 18, kills: 180, time: 1100, bossKills: 3,
})
assert.equal(expeditionClear.unlocked, 'hard')
assert.equal(expeditionClear.entry.breakdown.victory, 6000)
assert.ok(expeditionClear.entry.breakdown.clearSpeed > 0)
assert.equal(expeditionClear.best.fastestClear, 1100)
const expeditionHell = pushScore(expeditionUnlockSave, { mode: 'expedition', difficulty: 'hard' }, {
  result: 'victory', stage: 6, wave: 20, kills: 210, time: 1200, bossKills: 4,
})
assert.equal(expeditionHell.unlocked, 'hell')
assert.equal(expeditionHell.unlockedMode, 'timed')
assert.equal(isModeUnlocked(expeditionUnlockSave.progression, 'timed'), true)
assert.equal(isModeUnlocked(expeditionUnlockSave.progression, 'endless'), false)
const endlessUnlock = pushScore(expeditionUnlockSave, { mode: 'timed', difficulty: 'hard' }, {
  result: 'victory', wave: 25, kills: 220, time: 780, finaleTime: 60, bossKills: 5,
})
assert.equal(endlessUnlock.unlockedMode, 'endless')
assert.deepEqual(getUnlockedModeIds(expeditionUnlockSave.progression), ['expedition', 'timed', 'endless'])
assert.equal(getNextModeUnlock(expeditionUnlockSave.progression), null)
ok('章节远征计分与模式推进：困难闯关解锁限时，困难限时解锁无尽')

const expeditionIntro = getRunIntro({ mode: 'expedition', difficulty: 'normal' })
const timedHardIntro = getRunIntro({ mode: 'timed', difficulty: 'hard' })
const endlessHellIntro = getRunIntro({ mode: 'endless', difficulty: 'hell' })
assert.equal(expeditionIntro.location, '史莱姆巢界 · 破晓前')
assert.match(timedHardIntro.threatReport, /精英比例提升/)
assert.equal(timedHardIntro.rewardMultiplier, 1.25)
assert.match(endlessHellIntro.signal, /第二十波/)
ok('战前简报随模式与难度组合生成地点、目标、信号和威胁情报')

// 28) 永久基因路线：前置、旧档兼容和终点互斥使用同一购买判定
assert.equal(getGenePurchaseState('regen', {}, 999).locked, true)
assert.equal(getGenePurchaseState('regen', { giant: 1 }, 999).canBuy, true)
assert.equal(getGenePurchaseState('split', { split: 1 }, 999).locked, false) // 旧档已购节点可继续升级
const originReady = {
  giant: 2,
  regen: 2,
  swift: 2,
  split: 1,
  lore: 2,
  resonance: 1,
}
assert.equal(getGenePurchaseState('predator_origin', originReady, 999).canBuy, true)
const chosenGenes = { ...originReady, predator_origin: 1 }
assert.equal(getChosenOrigin(chosenGenes).id, 'predator_origin')
assert.equal(getGenePurchaseState('kinetic_origin', chosenGenes, 999).locked, true)
assert.ok(getGenePurchaseState('kinetic_origin', chosenGenes, 999).reason.includes('捕食原核'))
ok('永久基因路线：前置解锁、旧档祖父兼容与终点原核互斥')

// 29) 原核效果实际进入战斗数据，applyGenes 重复调用保持幂等
player.resetRunState()
weaponSystem.reset()
applyGenes(game, { giant: 2, regen: 2, predator_origin: 1 })
assert.equal(player.maxHp, 11)
assert.equal(player.geneDevourHeal, 1)
assert.equal(player.geneDevourExpMul, 1.35)
applyGenes(game, { giant: 2, regen: 2, predator_origin: 1 })
assert.equal(player.maxHp, 11)
gemManager.reset()
const geneMeal = new Enemy({ x: player.x, y: player.y, speed: 80, hp: 5, type: 'knight' })
geneMeal.attach(game)
player.hp = player.maxHp - 1
weaponSystem.onDevoured(geneMeal)
assert.equal(player.hp, player.maxHp)
// 分层吞噬收益：普通怪经验 ×1.5（精英 ×3），叠加原核经验倍率 1.35
assert.equal(
  gemManager._gems.find((gem) => gem.type === 'exp').value,
  Math.round(geneMeal.expValue * 1.5 * 1.35)
)

weaponSystem.reset()
applyGenes(game, { swift: 2, split: 1, kinetic_origin: 1 })
assert.ok(Math.abs(player.speed - 340 * 1.16 * 1.08) < 1e-7)
assert.equal(weaponSystem.genePierces, 1)
assert.equal(weaponSystem.splitChance, 0.25) // 基础分裂概率已同步到实际概率
enemyManager.reset()
const geneTarget = new Enemy({ x: player.x + 80, y: player.y, speed: 80, hp: 8, type: 'knight' })
geneTarget.attach(game)
enemyManager._enemies.push(geneTarget)
weaponSystem.fire(geneTarget)
assert.equal(weaponSystem._projectiles[0].pierces, 1)

weaponSystem.reset()
applyGenes(game, { lore: 2, resonance: 1, element_origin: 1 })
assert.equal(player.secondarySlots, 4)
assert.equal(weaponSystem.geneReactionDmgMul, 1.25)
assert.equal(getGene('element_origin').isCapstone, true)
applyGenes(game, {
  giant: 2,
  regen: 2,
  predator_origin: 1,
  swift: 2,
  split: 1,
  kinetic_origin: 1,
})
assert.equal(player.geneDevourHeal, 1)
assert.equal(weaponSystem.genePierces, 0)
ok('终点原核：捕食恢复、动能穿透与共鸣倍率均进入实际战斗属性')

// 30) Boss 强招：固定预警、三职业差异化、强招后破绽增伤
enemyManager.reset()
player.dead = false
player.hp = player.maxHp
player.invincible = 0
player.x = 720
player.y = 500
const knightBoss = new Boss({ x: 500, y: 500, wave: 5, type: 'boss-knight' })
knightBoss.attach(game)
enemyManager._enemies.push(knightBoss)
enemyManager._boss = knightBoss
knightBoss.specialCd = 0
knightBoss.update(0.016)
assert.equal(knightBoss.specialState, 'telegraph')
const lockedAngle = knightBoss.lockedAngle
assert.equal(knightBoss.dashLaneRadius, knightBoss.radius + player.radius + 12)
const telegraphX = knightBoss.x
const telegraphY = knightBoss.y
const blocker = new Enemy({ x: knightBoss.x + 5, y: knightBoss.y, speed: 80, hp: 5, type: 'knight' })
blocker.attach(game)
enemyManager._enemies.push(blocker)
enemyManager._buildGrid()
enemyManager._separate()
assert.deepEqual({ x: knightBoss.x, y: knightBoss.y }, { x: telegraphX, y: telegraphY })
player.y = 760 // 离开已锁定的水平冲锋线
knightBoss.update(knightBoss.specialDuration + 0.01)
assert.equal(knightBoss.specialState, 'dash')
assert.equal(knightBoss.lockedAngle, lockedAngle)
knightBoss.update(0.5)
assert.equal(knightBoss.specialState, 'recover')
assert.equal(knightBoss.combatInfo.vulnerable, true)
const bossHpBeforeBreak = knightBoss.hp
knightBoss.hit(10)
assert.equal(knightBoss.hp, bossHpBeforeBreak - 18) // 破绽承伤 ×1.8（原 1.35 收益过低）
assert.equal(enemyManager.bossInfo.state, '破绽暴露')
ok('骑士王强招：预警锁线不追踪、冲锋后暴露破绽且承伤 +80%')
enemyManager.releaseBossCast(knightBoss)

enemyManager._bullets.length = 0
player.x = 650
player.y = 500
player.invincible = 0
const mageBoss = new Boss({ x: 360, y: 500, wave: 5, type: 'boss-mage' })
mageBoss.attach(game)
mageBoss.specialCd = 0
mageBoss.update(0.016)
const mageTarget = { x: mageBoss.targetX, y: mageBoss.targetY }
player.x = 900
player.y = 800 // 离开锁定爆破圈
const hpBeforeMageBlast = player.hp
mageBoss.update(mageBoss.specialDuration + 0.01)
assert.deepEqual({ x: mageBoss.targetX, y: mageBoss.targetY }, mageTarget)
assert.equal(player.hp, hpBeforeMageBlast)
assert.equal(enemyManager._bullets.length, 12)
assert.ok(enemyManager._bullets.every((bullet) => bullet.isBoss))
enemyManager.releaseBossCast(mageBoss)

enemyManager._bullets.length = 0
const archerBoss = new Boss({ x: 360, y: 500, wave: 5, type: 'boss-archer' })
archerBoss.attach(game)
archerBoss.specialCd = 0
archerBoss.update(0.016)
archerBoss.update(archerBoss.specialDuration + 0.01)
assert.equal(enemyManager._bullets.length, 6)
assert.equal(archerBoss.specialState, 'recover')
ok('法师王定点环爆与弓王扇形齐射使用独立弹幕规模并进入破绽期')

enemyManager.reset()
enemyManager.spawnAt(player.x + 80, player.y, 'knight')
enemyManager.spawnAt(player.x + 100, player.y, 'mage')
enemyManager.spawnBullet(player.x, player.y, 0, 'mage')
const finaleVanguard = enemyManager.beginFinale()
assert.equal(enemyManager.enemies.length, 2)
assert.equal(enemyManager._bullets.length, 0)
assert.equal(enemyManager.activeBossCount, 2)
assert.equal(enemyManager.pendingBossCount, 1)
assert.equal(finaleVanguard.bossEncounterFinal, true)
finaleVanguard.destroy()
enemyManager.advanceBossEncounter(finaleVanguard)
const finalBoss = enemyManager._bosses.find((boss) => boss.active && boss.type === 'boss-final')
assert.ok(finalBoss)
assert.equal(finalBoss.isFinalBoss, true)
assert.equal(finalBoss.type, 'boss-final')
finalBoss.patternBonus = 2
finalBoss.specialCd = 0
finalBoss.update(0.016)
assert.equal(finalBoss.specialPattern, 'boss-knight')
assert.equal(finalBoss.specialDuration, 0.72)
finalBoss.update(0.73)
finalBoss.update(0.5)
finalBoss.specialState = 'idle'
finalBoss.specialCd = 0
finalBoss.update(0.016)
assert.equal(finalBoss.specialPattern, 'boss-mage')
assert.equal(finalBoss.specialDuration, 0.95)
enemyManager._bullets.length = 0
finalBoss.update(0.96)
assert.equal(enemyManager._bullets.length, 16)
ok('限时终局首领编队：先遣双首领、终审增援与三职业轮转均正常')

// 31) Boss 半血第二阶段：统一转阶段停顿、解控与攻击节奏强化
enemyManager.reset()
const phaseBoss = new Boss({ x: 500, y: 500, wave: 5, type: 'boss-knight' })
phaseBoss.attach(game)
enemyManager._enemies.push(phaseBoss)
enemyManager._bosses.push(phaseBoss)
enemyManager._boss = phaseBoss
phaseBoss.specialState = 'idle'
phaseBoss.vulnerableTimer = 0
phaseBoss.hp = phaseBoss.maxHp * 0.5
phaseBoss.freeze = 5
const phaseOneSpeed = phaseBoss.speed
const phaseOneInterval = phaseBoss.attackInterval
phaseBoss.update(0.016)
assert.equal(phaseBoss.phase, 2)
assert.equal(phaseBoss.enraged, true)
assert.ok(phaseBoss.phaseShift > 0)
assert.ok(phaseBoss.speed > phaseOneSpeed)
assert.ok(phaseBoss.attackInterval < phaseOneInterval)
assert.equal(phaseBoss.freeze, 0)
assert.equal(enemyManager.bossInfo.phaseName, '血誓狂袭')
ok('Boss 半血统一进入第二阶段：短暂停顿、解控、加速并缩短攻击间隔')

// 32) 元素核心生命周期：临期警示、交互范围保护、离开后回收
gemManager.reset()
player.dead = false
player.x = 1200
player.y = 900
const expPermanent = gemManager.spawn(100, 100, 7)
const tomePermanent = gemManager.spawn(140, 100, 0, 'tome')
const expiringCore = gemManager.spawn(100, 140, 0, 'fire')
assert.equal(expiringCore.life, ELEMENT_CORE_LIFETIME)
expiringCore.life = 0.01
gemManager.update(0.02)
assert.ok(!gemManager._gems.includes(expiringCore))
assert.ok(gemManager._gems.includes(expPermanent))
assert.ok(gemManager._gems.includes(tomePermanent))

const protectedCore = gemManager.spawn(player.x + 20, player.y, 0, 'water')
protectedCore.life = 0.01
gemManager.update(0.2)
assert.ok(gemManager._gems.includes(protectedCore))
assert.ok(protectedCore.life > 1)
player.x = 2200
player.y = 1700
gemManager.update(1.3)
assert.ok(!gemManager._gems.includes(protectedCore))
ok('元素核心：30 秒寿命，临期靠近时保留，玩家离开后自动回收')

// 33) 元素核心硬上限与经验宝石守恒压缩
gemManager.reset()
player.x = 2200
player.y = 1700
const oldestCore = gemManager.spawn(40, 40, 0, 'poison')
oldestCore.life = 1
for (let i = 0; i < MAX_ELEMENT_CORES; i++) {
  gemManager.spawn(80 + (i % 12) * 40, 100 + ((i / 12) | 0) * 40, 0, i % 2 ? 'fire' : 'lightning')
}
const elementCores = gemManager._gems.filter((g) => g.type !== 'exp' && g.type !== 'tome')
assert.equal(elementCores.length, MAX_ELEMENT_CORES)
assert.ok(!gemManager._gems.includes(oldestCore))

gemManager.reset()
let expTotal = 0
for (let i = 0; i < MAX_EXP_GEMS + 47; i++) {
  const value = 3 + (i % 11)
  expTotal += value
  gemManager.spawn((i * 83) % 2300, (i * 137) % 1750, value)
}
gemManager._compactExpGems()
const compactedExp = gemManager._gems.filter((g) => g.type === 'exp')
assert.equal(compactedExp.length, MAX_EXP_GEMS)
assert.equal(compactedExp.reduce((sum, g) => sum + g.value, 0), expTotal)
ok('掉落预算：元素核心封顶 36 个，经验宝石封顶 180 个且经验总值守恒')

// 34) 黑市战利品：普通击杀 10% 边界明确，主动吞噬仍保持必掉。
assert.equal(COMMON_LOOT_CHANCE, 0.1)
const commonLootProbe = new Enemy({ x: 100, y: 100, speed: 80, hp: 1, type: 'knight' })
const eliteLootProbe = new Enemy({ x: 120, y: 100, speed: 80, hp: 1, type: 'knight', elite: true })
assert.equal(getLootDropCount(commonLootProbe, () => COMMON_LOOT_CHANCE - 0.001), 1)
assert.equal(getLootDropCount(commonLootProbe, () => COMMON_LOOT_CHANCE), 0)
assert.equal(getLootDropCount(eliteLootProbe, () => 1), 1)
ok('黑市战利品：普通击杀降至 10%，吞噬与精英的确定性收益保留')

// 35) 等级 → 元素联动：副反应槽随等级里程碑扩张，并自动接入被满槽挤掉的反应
assert.deepEqual(REACTION_SLOT_LEVELS, [4, 8])
assert.equal(getReactionSlotLevelBonus(3), 0)
assert.equal(getReactionSlotLevelBonus(4), 1)
assert.equal(getReactionSlotLevelBonus(8), 2)
const slotPlayer = new Player({ input })
slotPlayer.game = {
  sound,
  evolutionEvent() {},
  reactionSlotsFull() {},
  enemyManager: { addText() {} },
}
assert.equal(slotPlayer.secondarySlots, 2)
slotPlayer.absorbElement('fire')
slotPlayer.absorbElement('water') // steam → 主形态锁定
slotPlayer.absorbElement('poison') // acid + corrode → 2/2 满槽
assert.equal(slotPlayer._primaryReaction, 'steam')
assert.equal(slotPlayer._secondaryIds.size, 2)
slotPlayer.absorbElement('lightning') // gel/burst/venom 已满足但无槽可入
assert.equal(slotPlayer._secondaryIds.size, 2, '满槽时新反应不得潜伏入槽')

slotPlayer.level = 4
const unlockedAt4 = slotPlayer.refreshReactionSlots()
assert.equal(slotPlayer.secondarySlots, 3, 'Lv.4 里程碑 +1 槽')
assert.equal(unlockedAt4.length, 1)
assert.equal(unlockedAt4[0].id, 'gel', '接入此前因满槽未能入位的反应')
assert.equal(slotPlayer._reactionIds.has('gel'), true, '自动接入立即产生效果')

slotPlayer.level = 8
const unlockedAt8 = slotPlayer.refreshReactionSlots()
assert.equal(slotPlayer.secondarySlots, 4, 'Lv.8 里程碑再 +1 槽')
assert.equal(unlockedAt8.length, 1)
assert.equal(unlockedAt8[0].id, 'burst')

slotPlayer.level = 20
assert.equal(slotPlayer.refreshReactionSlots().length, 0, '无剩余候选时不再接入')
assert.equal(slotPlayer.secondarySlots, 4, '无基因加持时封顶 2 + 2')
slotPlayer.baseSecondarySlots = 4
slotPlayer.refreshReactionSlots()
assert.equal(slotPlayer.secondarySlots, MAX_REACTION_SLOTS, '基因 + 等级共同封顶 5 槽')
ok('等级里程碑扩张副反应槽（Lv.4 / Lv.8），并自动接入被满槽挤掉的反应')

// 36) 元素 → 吞噬联动：消化档位随元素等级解锁，四系吞噬效果差异化
assert.equal(getDigestTier('fire', 1), null, 'Lv.1 尚无消化效果')
assert.equal(getDigestTier('fire', 2).name, '灼热消化')
assert.equal(getDigestTier('fire', 4).name, '熔核消化')
assert.equal(getDigestTier('fire', 99).tier, 4, 'Lv.4+ 保持强化档')
assert.equal(getDigestTier('water', 3).tier, 2, 'Lv.3 仍是基础档')
assert.equal(getDigestTier('poison', 4).poolDmg, 2)
assert.equal(getDigestTier('lightning', 2).damageMul, 0.7)
assert.equal(getDigestTier('unknown', 9), null)
for (const id of Object.keys(DIGEST_EFFECTS)) {
  assert.ok(DIGEST_EFFECTS[id].lv2.name && DIGEST_EFFECTS[id].lv4.name, `${id} 两档命名完整`)
}

const digestPlayer = new Player({ input })
const digestEnemies = new EnemyManager()
const digestWeapon = new WeaponSystem({ player: digestPlayer, enemyManager: digestEnemies })
const digestGame = {
  ...game,
  player: digestPlayer,
  enemyManager: digestEnemies,
  weaponSystem: digestWeapon,
}
digestPlayer.attach(digestGame)
digestEnemies.attach(digestGame)
digestWeapon.attach(digestGame)
const spawnMeal = (x, y) => {
  const e = new Enemy({ x, y, speed: 0, hp: 60, type: 'knight' })
  e.attach(digestGame)
  digestEnemies._enemies.push(e)
  return e
}
const meal = { x: 0, y: 0, type: 'knight', isElite: false, expValue: 1 }

digestPlayer.elements.set('fire', 2)
digestPlayer._refreshElements()
let digestVictim = spawnMeal(40, 0)
const hpBeforeFire = digestVictim.hp
assert.ok(digestWeapon._digestDevour(meal).includes('灼热消化'))
assert.ok(digestVictim.hp < hpBeforeFire, '火消化对周围敌人造成溅射伤害')
// 半径必须与档位一致：Lv.2 为 90px（既打到 85px，也放过 95px 外的目标）
digestEnemies._enemies.length = 0
const inRadius = spawnMeal(85, 0)
const outRadius = spawnMeal(95, 0)
digestWeapon._digestDevour(meal)
assert.ok(inRadius.hp < inRadius.maxHp, 'Lv.2 半径 90px 内的敌人被命中')
assert.equal(outRadius.hp, outRadius.maxHp, 'Lv.2 半径 90px 外的敌人不受影响')

digestEnemies._enemies.length = 0
digestPlayer.elements.clear()
digestPlayer.elements.set('water', 2)
digestPlayer._refreshElements()
digestVictim = spawnMeal(60, 0)
digestWeapon._digestDevour(meal)
assert.ok(digestVictim.slow > 0 && digestVictim.freeze === 0, '水 Lv.2 只减速不冻结')
digestEnemies._enemies.length = 0
digestPlayer.elements.set('water', 4)
digestPlayer._refreshElements()
digestVictim = spawnMeal(60, 0)
digestWeapon._digestDevour(meal)
assert.ok(digestVictim.freeze > 0, '水 Lv.4 追加冻结')

digestEnemies._enemies.length = 0
digestPlayer.elements.clear()
digestPlayer.elements.set('poison', 2)
digestPlayer._refreshElements()
const poolsBefore = digestWeapon._pools.length
digestWeapon._digestDevour(meal)
assert.equal(digestWeapon._pools.length, poolsBefore + 1, '毒消化在吞噬点留下酸液池')

digestEnemies._enemies.length = 0
digestPlayer.elements.clear()
digestPlayer.elements.set('lightning', 4)
digestPlayer._refreshElements()
const digestCrowd = [spawnMeal(50, 0), spawnMeal(90, 0)]
const crowdHp = digestCrowd.map((e) => e.hp)
digestWeapon._digestDevour(meal)
assert.ok(digestCrowd.some((e, i) => e.hp < crowdHp[i]), '雷消化电弧跳向附近敌人')

digestPlayer.elements.clear()
digestPlayer._refreshElements()
assert.equal(digestWeapon._digestDevour(meal), '', '未吸收元素时吞噬无额外副作用')
ok('元素消化：四系吞噬效果差异化（溅射/减速冻结/酸池/电弧），未吸收元素时零副作用')

// 37) 吞噬 → 元素联动：消化能量累积、满槽爆发元素等级、满载待命不空转
const chargePlayer = new Player({ input })
const chargeEnemies = new EnemyManager()
const chargeWeapon = new WeaponSystem({ player: chargePlayer, enemyManager: chargeEnemies })
const chargeGame = {
  ...game,
  player: chargePlayer,
  enemyManager: chargeEnemies,
  weaponSystem: chargeWeapon,
}
chargePlayer.attach(chargeGame)
chargeEnemies.attach(chargeGame)
chargeWeapon.attach(chargeGame)

assert.equal(chargeWeapon.digestCharge, 0)
assert.equal(chargeWeapon.digestChargeMax, DIGEST_CHARGE_MAX)

// 未吸收元素时：满槽保持待命，不空转也不报错
chargeWeapon.addDigestCharge(DIGEST_CHARGE_MAX * 2)
assert.equal(chargeWeapon.digestCharge, DIGEST_CHARGE_MAX, '满槽后能量不再溢出')
assert.equal(chargeWeapon.digestBursts, 0, '未吸收元素时不爆发')

// 吸收元素后：下一次吞噬立即兑现满槽能量
chargePlayer.elements.set('fire', 1)
chargePlayer._refreshElements()
const digestMeal = new Enemy({ x: 50, y: 50, speed: 0, hp: 1, type: 'knight' })
digestMeal.attach(chargeGame)
chargeEnemies._enemies.push(digestMeal)
chargeWeapon.onDevoured(digestMeal) // 吞噬走完整结算：累积 → 满槽 → 爆发
assert.equal(chargeWeapon.digestBursts, 1, '满槽 + 已吸收元素 → 爆发一次')
assert.equal(chargeWeapon.digestCharge, 0, '爆发后能量清零')
assert.equal(chargePlayer.elements.get('fire'), 2, '爆发放大已吸收元素等级')

// 普通怪与精英的累积差异：精英一次顶两个多普通怪
chargeWeapon.digestCharge = 0
chargeWeapon.addDigestCharge(DIGEST_GAIN_NORMAL)
const afterNormal = chargeWeapon.digestCharge
chargeWeapon.digestCharge = 0
chargeWeapon.addDigestCharge(DIGEST_GAIN_ELITE)
assert.ok(chargeWeapon.digestCharge > afterNormal * 2, '精英吞噬的消化收益显著更高')

// 暴食已退出元素链（第三批角色化）：消化效率乘数被移除，累积不再被放大
chargeWeapon.digestCharge = 0
chargeWeapon.addDigestCharge(DIGEST_GAIN_NORMAL)
assert.equal(chargeWeapon.digestCharge, DIGEST_GAIN_NORMAL, '消化按基础速率累积（不再有专精效率放大）')
assert.equal(chargeWeapon.digestGainMul, undefined, '消化效率乘数已随暴食赋能一并移除')

// 无元素时的微粒心跳：不得污染玩家氛围粒子（缺 vx/vy 会 NaN）
chargePlayer.elements.clear()
chargePlayer._refreshElements()
chargeWeapon.digestCharge = DIGEST_CHARGE_MAX * 0.8
chargeWeapon._updateDigestPulse(1)
assert.equal(chargePlayer._aura.length, 0, '未吸收元素时不冒微粒')
chargePlayer.elements.set('fire', 3)
chargePlayer._refreshElements()
chargeWeapon._updateDigestPulse(1)
assert.ok(chargePlayer._aura.length > 0, '能量过半且已吸收元素时冒微粒')
const auraParticle = chargePlayer._aura[chargePlayer._aura.length - 1]
assert.ok(
  Number.isFinite(auraParticle.vx) && Number.isFinite(auraParticle.vy),
  '微粒携带速度字段（否则位置更新会变成 NaN）'
)
ok('消化进度：满槽爆发元素等级、满载待命与精英高收益均生效（暴食已退出元素链）')

// 38) 专精规则改写：第三批角色化后只有元素树改写元素规则
const engineLike = {
  player,
  weaponSystem,
  devourThreshold: 0.25,
}
// 直接复用引擎上的实现（不实例化 GameEngine：本测试为纯逻辑层）
const { GameEngine } = await import('./src/game/GameEngine.js')
const applySpec = GameEngine.prototype._applyPrimarySpecBonus

weaponSystem.reset()
player.resetRunState()
player.elements.clear()
player._refreshElements()
applySpec.call(engineLike, 'elemental')
assert.equal(player.elementProcCap, ELEMENTAL_SPEC_PROC_CAP, '元素专精抬升附魔封顶至 85%')
player.elements.set('fire', 8) // 8 级 × 10% = 80%，旧封顶 60% 会截断
player._refreshElements()
assert.equal(player._procs.burn.chance, 0.8, '封顶抬升后高等级附魔概率不再被 60% 截断')

weaponSystem.reset()
player.resetRunState()
applySpec.call(engineLike, 'gatling')
assert.equal(weaponSystem.splitInherit, 1, '机枪专精：分裂弹 100% 继承母弹附魔')

weaponSystem.reset()
player.resetRunState()
applySpec.call(engineLike, 'assassin')
assert.equal(weaponSystem.critChance >= 0.25, true, '刺客专精：暴击率提升至 25%')
assert.equal(weaponSystem.critMul >= 3.5, true, '刺客专精：暴击倍率提升至 3.5×')
// 第五批：刺客觉醒的「暴击保证触发元素附魔」受能力闸门控制——
// 有元素权限（origin / elemental）才赋值，暗影史莱姆恒为 false。
// 注意：闸门读的是引擎 getter `game.canUseElements`，因此这里必须给桩提供布尔值；
// 缺省（undefined）时按「无权限」处理，正确语义由 verify-changes 用真实引擎锁定。
engineLike.canUseElements = false
applySpec.call(engineLike, 'assassin')
assert.equal(weaponSystem.critGuaranteesElement, false, 'canUseElements=false（暗影）：不获得元素规则')
engineLike.canUseElements = true
applySpec.call(engineLike, 'assassin')
assert.equal(weaponSystem.critGuaranteesElement, true, 'canUseElements=true（origin）：恢复「元素 × 暴击」协同')
delete engineLike.canUseElements
applySpec.call(engineLike, 'assassin')
assert.equal(weaponSystem.critGuaranteesElement, false, '权限缺失时按无权限处理')

// 重开归位：专精标记不得跨局残留
weaponSystem.reset()
player.resetRunState()
assert.equal(weaponSystem.splitInherit, 0.5)
assert.equal(weaponSystem.critGuaranteesElement, false)
assert.equal(weaponSystem.digestGainMul, undefined)
assert.equal(player.elementProcCap, 0.6)
player.elements.set('fire', 8)
player._refreshElements()
assert.equal(player._procs.burn.chance, 0.6, '未确立元素专精时回到 60% 封顶')
player.elements.clear()
player._refreshElements()
ok('专精规则改写：元素规则受能力闸门控制，且重开后完全归位')

// 39) 章节敌军偏向：12 章各有兵种画像，权重缩放不改变总数走向、且可安全回退
const hellExpedition = { mode: 'expedition', difficulty: 'hell' }
const biasedStages = getExpeditionStages('hell')
assert.equal(biasedStages.length, 12)
assert.ok(
  biasedStages.every((stage) => stage.enemyBias && Object.keys(stage.enemyBias).length > 0),
  '每一章都配置了敌军偏向'
)
// 插章按位置插入决战之前，用 id 定位而非数组下标（位置 ≠ 章节号）
const stageById = (id) => biasedStages.find((stage) => stage.id === id)
// 王陵章节以怨灵为主：偏向权重必须显著高于其他章节
assert.ok(stageById(9).enemyBias.wraith >= 2, '王陵章节怨灵权重拉满')
// 校场章节狂战士为主
assert.ok(stageById(12).enemyBias.berserker >= 2, '校场章节狂战士权重拉满')

// 权重缩放：偏向只改变分布，未列出的兵种保持原倍率
const baseRoster = [['knight', 0.5], ['mage', 0.3], ['hound', 0.2]]
const biasedRoster = applyEnemyBias(baseRoster, { mage: 2, knight: 0.5 })
assert.deepEqual(biasedRoster, [['knight', 0.25], ['mage', 0.6], ['hound', 0.2]])
assert.deepEqual(applyEnemyBias(baseRoster, null), baseRoster, '无偏向时原样返回')
// 极端偏向：权重全部清零时必须回退原生编成，不能抽不出兵
assert.deepEqual(
  applyEnemyBias(baseRoster, { knight: 0, mage: 0, hound: 0 }),
  baseRoster,
  '权重被清空时回退原生编成'
)
assert.equal(getStageEnemyBias({ mode: 'timed', difficulty: 'normal' }, 3), null, '非远征模式无偏向')
assert.equal(getStageEnemyBias(hellExpedition, 1).knight, 1.2)

// 实际抽取：同一波次下，王陵章节的怨灵占比必须明显高于第 1 章
const makeRoller = (stage) => {
  const manager = new EnemyManager()
  manager.attach({
    ...game,
    runSelection: hellExpedition,
    expeditionStage: stage,
    enemyManager: manager,
  })
  return manager
}
const countTypes = (manager, rolls) => {
  const tally = {}
  for (let i = 0; i < rolls; i++) {
    const type = manager._rollType()
    tally[type] = (tally[type] || 0) + 1
  }
  return tally
}
const cryptTally = countTypes(makeRoller(8), 4000) // 位置 8 = 「不眠王陵」（id 9）
const borderTally = countTypes(makeRoller(1), 4000)
assert.ok(
  (cryptTally.wraith || 0) > (borderTally.wraith || 0) * 3,
  `王陵章节怨灵占比显著更高（${cryptTally.wraith || 0} vs ${borderTally.wraith || 0}）`
)
ok('章节敌军偏向：12 章各有兵种画像，权重缩放正确且清空时可安全回退')

// 40) 首领登场收口：目标接近完成时增援间隔拉长，首领登场/换章后归位
const windManager = makeRoller(5)
windManager.setStagePressure(0)
const relaxFactor = windManager._directorFactor()
windManager.setStagePressure(0.5) // 未达收口阈值：节拍不变
assert.equal(windManager._directorFactor(), relaxFactor, '进度未达阈值时不影响节拍')
windManager.setStagePressure(1)
const windFactor = windManager._directorFactor()
assert.ok(windFactor > relaxFactor, `收口拉长增援间隔（${relaxFactor.toFixed(2)} → ${windFactor.toFixed(2)}）`)
assert.ok(windFactor <= relaxFactor * (1 + 0.9) + 1e-9, '收口倍率不超过设定上限')
assert.equal(windManager.directorInfo.phase, '决战前夕')

// 首领登场：收口状态清除，避免与 _finale 的生成闸门叠加
windManager.beginExpeditionStageBoss({ id: 'test', name: '测试首领', archetype: 'knight', hpMul: 1, telegraph: 1, cooldown: 5 })
assert.equal(windManager._stagePressure, 0, '首领登场后收口清零')

// 越界输入不产生非法压力值
windManager.setStagePressure(-5)
assert.equal(windManager._stagePressure, 0)
windManager.setStagePressure(99)
assert.equal(windManager._stagePressure, 1)
windManager.setStagePressure(Number.NaN)
assert.equal(windManager._stagePressure, 0, '非法输入回退为 0')
windManager.reset()
assert.equal(windManager._stagePressure, 0, '重开归零（非远征模式不受影响）')
ok('首领登场收口：接近目标时增援稀疏、登场后归位且输入受钳制')

console.log(`\n全部通过：${n} 组断言 ✓`)
