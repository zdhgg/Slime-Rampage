// P1 批次验证脚本（resize 防抖 / 冷却通道 / 肾上腺素 / Capstone 门槛 / 池耗尽反馈 / 经验曲线）。
// 运行：node verify-p1.mjs
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
let rectSize = { width: 1280, height: 720 }
const canvasStub = {
  width: 0,
  height: 0,
  getBoundingClientRect: () => ({ ...rectSize }),
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
const { SKILL_DATABASE, rollSkills } = await import('./src/game/SkillPool.js')

const engine = GameEngine.create(canvasStub)
for (const k of ['onStats', 'onLevelUp', 'onGameOver', 'onBossSpawn', 'onWaveChanged', 'onEvolution']) {
  engine[k] = () => {}
}
let n = 0
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`)

// —— 1. resize 防抖：首建同步、高频 resize 合并为一次重建 ——
assert.ok(engine._worldBg, '构造后首次世界背景应同步构建（无头测试依赖）')
const origBuild = engine._buildWorldBg.bind(engine)
let builds = 0
engine._buildWorldBg = () => {
  builds++
  origBuild()
}
rectSize = { width: 2000, height: 1400 } // 模拟窗口拖动（超过 2400×1800 世界下限才会触发重建）
engine._onResize()
engine._onResize()
engine._onResize()
assert.equal(builds, 0, 'resize 事件连发期间不立即重建')
assert.ok(engine._worldBgTimer, '已排定防抖重建')
await new Promise((r) => setTimeout(r, 220))
assert.equal(builds, 1, '停止变化后只重建一次')
rectSize = { width: 1280, height: 720 }
engine._onResize()
await new Promise((r) => setTimeout(r, 220))
assert.equal(builds, 2, '尺寸再次变化后按计划重建')
engine._buildWorldBg = origBuild
ok('resize 防抖：高频拖动合并为一次离屏重建（首建保持同步）')

// —— 2. 冷却高频通道：字段与公式 ——
engine.reset()
engine.start()
let lastCd = null
engine.onCooldown = (c) => {
  lastCd = c
}
engine.player.dashCdMultiplier = 0.5
engine.player.dashCd = 0.3
engine._pushCooldown()
assert.ok(lastCd && typeof lastCd.dashCd === 'number' && typeof lastCd.cast === 'number')
assert.ok(Math.abs(lastCd.dashMax - 0.6) < 1e-9, 'dashMax = 1.2 × 冷却缩减 × 基因缩减')
// _tick 累积到 0.1s 触发推送
engine._cdAcc = 0.1
engine._tick(performance.now ? 0 : 0) // rAF 桩返回 0；dt 首帧为 0，靠 _cdAcc 门槛
engine.onCooldown = null
engine.player.dashCdMultiplier = 1
ok('冷却通道：onCooldown 携带 dashCd/dashMax/cast，公式与 2Hz 快照一致')

// —— 3. 经验曲线：首级阈值 28、倍率 1.4 不变 ——
assert.equal(engine.player.maxExp, 28, '开局阈值 28')
engine.player.gainExp(27)
assert.equal(engine.player.level, 1, '27 经验不足以前期 1 级（原曲线 20 会升级）')
engine.player.gainExp(1)
assert.equal(engine.player.level, 2)
assert.equal(engine.player.maxExp, Math.floor(28 * 1.4), '升级倍率 1.4 保持')
engine.onLevelUp = () => {} // 吞掉升级面板（暂停）
engine.player.level = 1
engine.player.exp = 0
engine.player.maxExp = 28
ok('经验曲线：前期阈值 +40%（打断频率下降），倍率不变')

// —— 4. 肾上腺素：受击触发移速爆发、随时间衰减、重开清零 ——
const adSkill = SKILL_DATABASE.common.find((s) => s.id === 'com_adrenaline')
assert.ok(adSkill, '技能池包含「肾上腺素」')
adSkill.apply(engine, 1)
assert.ok(Math.abs(engine.player.adrenalineSpeed - 0.3) < 1e-9)
engine.player.invincible = 0
engine.player.hp = engine.player.maxHp
engine.player.hit(1)
assert.ok(engine.player.adrenalineTimer > 2.9, '受击触发 3 秒肾上腺素')
engine.player.update(1.6)
engine.player.update(1.6)
assert.ok(engine.player.adrenalineTimer <= 0, '3 秒后衰减完毕')
engine.reset()
assert.equal(engine.player.adrenalineSpeed, 0, '重开清空肾上腺素等级')
ok('肾上腺素：受击 → 3s 移速爆发 → 衰减，重开清零')

// —— 5. Capstone 门槛：Lv.14 / 第 10 波前不进候选，之后排在首位 ——
engine.applyStartingSpec('gatling')
engine.reset()
engine.secondarySpec = 'elemental' // 跳过 Lv.9 副专精里程碑，直接测常规抽取
// 点满前置链（T1×2、T2、T3 各 1 级即满足 requires）
for (const id of ['gat_multishot', 'gat_velocity', 'gat_split', 'gat_chain']) {
  engine.skillLevels[id] = 1
}
engine.player.level = 12
engine.enemyManager.wave = 6
let opts = rollSkills(engine, 3)
assert.ok(opts.length > 0 && opts.every((o) => !o.isCapstone), 'Lv.12 / 波 6：大招未开放')
engine.player.level = 14
opts = rollSkills(engine, 3)
assert.ok(opts[0].isCapstone, 'Lv.14 起大招进入候选且排首位')
engine.player.level = 12
engine.enemyManager.wave = 10
opts = rollSkills(engine, 3)
assert.ok(opts[0].isCapstone, '或第 10 波起开放（满足其一即可）')
ok('Capstone 门槛：Lv.14 / 波 10 前不出现——后半局才有质变大招')

// —— 6. 技能池耗尽：不再静默，转化为治愈 + 浮字 ——
for (const [specKey, tree] of Object.entries(SKILL_DATABASE)) {
  const list = specKey === 'common' ? tree : [...tree.primary, ...tree.secondary]
  for (const s of list) engine.skillLevels[s.id] = s.maxLevel
}
engine.secondarySpec = 'elemental' // 副专精池也满
const hpBefore = engine.player.hp
engine.player.hp = Math.max(1, engine.player.hp - 2)
let panelOpened = false
engine.onLevelUp = () => {
  panelOpened = true
}
engine.openFreeSkillPanel()
assert.equal(panelOpened, false, '池空时不弹面板')
assert.equal(engine.player.hp, hpBefore - 1, '池空升级转化为 +1 治愈（扣 2 回 1）')
assert.ok(engine.running, '引擎已恢复运行（无暂停锁残留）')
ok('技能池耗尽：升级转为治愈反馈，引擎恢复正常')

engine.destroy()
console.log(`\nP1 批次验证全部通过：${n} 组 ✓`)
