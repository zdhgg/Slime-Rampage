// P2 批次验证脚本（stats 快照形状一致性 / 捕食原核滚雪球 / sumDrops）。运行：node verify-p2.mjs
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
const { sumDrops } = await import('./src/game/RunRules.js')
const { applyGenes, GENES } = await import('./src/game/GenePool.js')

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

// —— 3. sumDrops：空值安全 + 与六类口径一致 ——
assert.equal(sumDrops(null), 0)
assert.equal(sumDrops({}), 0)
assert.equal(sumDrops({ knight: 2, mage: 1, archer: 3, assassin: 0, priest: 1, berserker: 4 }), 11)
ok('sumDrops：空值安全，六类求和正确')

engine.destroy()
console.log(`\nP2 批次验证全部通过：${n} 组 ✓`)
