// P2 批次验证脚本（stats 快照形状一致性 / 捕食原核滚雪球 / scoreToPoints）。运行：node verify-p2.mjs
import assert from 'node:assert/strict'

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

const { GameEngine, createDefaultStats } = await import('./src/game/GameEngine.js')
const { Enemy } = await import('./src/game/entities/Enemy.js')
const { scoreToPoints } = await import('./src/game/RunRules.js')
const { applyGenes, GENES, getGeneCost } = await import('./src/game/GenePool.js')

const engine = GameEngine.create(canvasStub)
for (const k of ['onStats', 'onLevelUp', 'onGameOver', 'onBossSpawn', 'onWaveChanged', 'onEvolution', 'onCooldown']) {
  engine[k] = () => {}
}
let n = 0
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`)

// —— 1. createDefaultStats 与 _pushStats 字段形状一致（消除双写漂移的契约测试） ——
let pushed = null
engine.onStats = (s) => {
  pushed = s
}
engine.reset()
engine.start()
engine._pushStats()
engine.onStats = () => {}
const defaultKeys = Object.keys(createDefaultStats()).sort()
const pushedKeys = Object.keys(pushed).sort()
assert.deepEqual(pushedKeys, defaultKeys, `_pushStats 与 createDefaultStats 字段一致：${pushedKeys} vs ${defaultKeys}`)
const runDefault = Object.keys(createDefaultStats().run).sort()
const runPushed = Object.keys(pushed.run).sort()
assert.deepEqual(runPushed, runDefault, 'run 嵌套对象字段一致')
assert.equal(pushed.x, Math.round(engine.player.x), '坐标扁平化为 x/y（UI 可直接整树赋值）')
ok('快照形状契约：createDefaultStats ≡ _pushStats（含 run 嵌套字段）')

// —— 2. 捕食原核：吞噬滚雪球攻击成长，封顶 +100%，重开/基因基线正确复位 ——
const predator = GENES.find((g) => g.id === 'predator_origin')
engine.setGenes({ giant: 2, regen: 2, predator_origin: 1 }) // setGenes 持久到 engine.genes，reset 重放不丢
assert.ok(Math.abs(engine.player.geneDevourDamage - 0.03) < 1e-9, '原核启用吞噬攻击成长 +3%/次')
engine.reset() // reset 内部重新 applyGenes
const em = engine.enemyManager
const ws = engine.weaponSystem
assert.equal(ws.devourDamageMul, 1, '开局倍率 1.0')
// 精英吞噬算双倍原核成长（+6%）——抢吞精英是分层吞噬的核心决策
const eliteProbe = new Enemy({ x: 400, y: 400, speed: 80, hp: 10, type: 'knight', elite: true })
eliteProbe.attach(engine)
ws.onDevoured(eliteProbe)
assert.ok(Math.abs(ws.devourDamageMul - 1.06) < 1e-9, '精英吞噬提供双倍成长（+6%）')
// 模拟吞噬结算（onDevoured 的核心路径）
for (let i = 0; i < 40; i++) {
  const e = new Enemy({ x: 400 + i, y: 400, speed: 80, hp: 10, type: 'knight' })
  e.attach(engine)
  ws.onDevoured(e)
}
assert.ok(Math.abs(ws.devourDamageMul - 2) < 1e-9, '40 次吞噬后封顶 2.0（+100%）')
const dmgMul50 = ws.devourDamageMul
for (let i = 0; i < 5; i++) {
  const e = new Enemy({ x: 400, y: 400, speed: 80, hp: 10, type: 'knight' })
  e.attach(engine)
  ws.onDevoured(e)
}
assert.equal(ws.devourDamageMul, dmgMul50, '封顶后不再增长')
// 不带原核的存档：吞噬不涨攻击
applyGenes(engine, {})
const e2 = new Enemy({ x: 400, y: 400, speed: 80, hp: 10, type: 'knight' })
e2.attach(engine)
ws.onDevoured(e2)
assert.equal(ws.devourDamageMul, 1, '未购原核时吞噬不提供攻击成长')
engine.reset()
assert.equal(ws.devourDamageMul, 1, '重开复位')
ok('捕食原核：吞噬永久 +3% 攻击（封顶 ×2），未购不生效，重开复位')

// —— 3. scoreToPoints：空值安全 + 难度倍率 + 无尽保留/加成/软顶 ——
assert.equal(scoreToPoints(0, { mode: 'expedition', difficulty: 'normal' }), 0)
assert.equal(scoreToPoints(null, { mode: 'timed', difficulty: 'normal' }), 0)
assert.equal(scoreToPoints(30000, { mode: 'expedition', difficulty: 'easy' }), 800)
assert.equal(scoreToPoints(30000, { mode: 'expedition', difficulty: 'normal' }), 1000)
assert.equal(scoreToPoints(30000, { mode: 'expedition', difficulty: 'hard' }), 1350)
assert.equal(scoreToPoints(30000, { mode: 'expedition', difficulty: 'hell' }), 1800)
// 无尽战败保留 70%、撤离满额、继续加成参与换算
assert.equal(scoreToPoints(30000, { mode: 'endless', difficulty: 'normal' }, { result: 'defeat' }), 700)
assert.equal(scoreToPoints(30000, { mode: 'endless', difficulty: 'normal' }, { result: 'extracted' }), 1000)
assert.equal(
  scoreToPoints(30000, { mode: 'endless', difficulty: 'normal' }, { result: 'extracted', endlessRewardBonus: 0.5 }),
  1500
)
// 软顶 2000 点：超出部分减半（raw 3000 → 2000 + 500）
assert.equal(scoreToPoints(90000, { mode: 'endless', difficulty: 'normal' }, { result: 'extracted' }), 2500)
ok('scoreToPoints：空值安全、难度倍率正确、无尽保留/加成/软顶生效')

// —— 4. 黑市成本后段加速：首级 150 点起步可触达，高级节点与原核承担长期消耗 ——
{
  const expectedCosts = {
    giant: [150, 200, 300, 450, 650, 900, 1200, 1600, 2100, 2700],
    thorns: [150, 200, 300, 450, 650, 900, 1200, 1600, 2100, 2700],
    regen: [300, 550, 950, 1500, 2300],
    siphon: [400, 750, 1300, 2100, 3400],
    leech: [400, 800, 1400, 2300, 3600],
    cocoon: [4800],
    gorged_origin: [9500],
    razor: [150, 200, 300, 450, 700, 1000, 1400, 1900, 2400, 3000],
    rapid: [150, 200, 300, 450, 700, 1000, 1400, 1900, 2400, 3000],
    hunt: [150, 250, 400, 650, 1000, 1450, 2050, 2850],
    hunter: [300, 550, 900, 1400, 2100, 3050],
    fury: [250, 400, 650, 1000, 1450, 2050, 2800],
    arsenal_origin: [9500],
    lore: [150, 200, 300, 450, 650, 900, 1200, 1600, 2100, 2700],
    swift: [150, 200, 300, 450, 700, 1050, 1500, 2150],
    expand: [300, 550, 900, 1400, 2100, 3050],
    blueprint: [1000, 2000, 3500],
    magnet: [4800],
    horizon: [6000],
    flux_origin: [8500],
    stim: [3200],
    serum: [3200],
    greed: [2400],
    glass: [4000],
    dicer: [3200],
    split: [300, 500],
    resonance: [300, 600, 1000],
    shadow_step: [200, 300, 600],
    shadow_echo: [300, 600, 900],
    symbiosis_bond: [200, 300, 600],
    symbiosis_vital: [300, 600, 900],
    predator_origin: [2000],
    kinetic_origin: [2000],
    element_origin: [2200],
    shadow_origin: [2500],
    symbiosis_origin: [2500],
  }
  for (const gene of GENES) {
    assert.deepEqual(
      Array.from({ length: gene.maxLevel }, (_, level) => getGeneCost(gene, level)),
      expectedCosts[gene.id],
      `${gene.name} 逐级价格`
    )
  }
  // 货架总价只算在售通用基因：legacy 已下架，违禁品互斥只计最贵一件
  const shelfTotal = GENES.filter((gene) => !gene.hidden && !gene.isCapstone && !gene.isContraband)
    .reduce((sum, gene) => sum + gene.costs.reduce((branch, cost) => branch + cost, 0), 0)
  assert.equal(shelfTotal, 138400)
  const contrabandCost = Math.max(...GENES.filter((gene) => gene.isContraband).map((gene) => gene.costs[0]))
  assert.equal(contrabandCost, 4000)
  assert.equal(shelfTotal + contrabandCost + expectedCosts.gorged_origin[0], 151900)
  assert.equal(shelfTotal + contrabandCost + expectedCosts.arsenal_origin[0], 151900)
  assert.equal(shelfTotal + contrabandCost + expectedCosts.flux_origin[0], 150900)
  ok('黑市货架总价 138400＋一件违禁品 4000，选择终点原核后总价为 150900～151900')
}

engine.destroy()
console.log(`\nP2 批次验证全部通过：${n} 组 ✓`)
