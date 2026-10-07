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
const { getNextExpThreshold, STARTING_EXP_THRESHOLD } = await import('./src/game/entities/Player.js')
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
engine.player.activeSkillCdMultiplier = 0.5
engine._updateStrainSkill(0)
engine.player.strainSkillCd = 0.3
engine._pushCooldown()
assert.ok(lastCd && typeof lastCd.skillCd === 'number' && typeof lastCd.cast === 'number')
assert.equal(lastCd.skillMax, 4, '原生技能 8 秒 × 冷却倍率')
assert.equal(lastCd.formationBreak, 0)
assert.equal(lastCd.formationBreakMax, 8)
// _tick 累积到 0.1s 触发推送
engine._cdAcc = 0.1
engine._tick(performance.now ? 0 : 0) // rAF 桩返回 0；dt 首帧为 0，靠 _cdAcc 门槛
engine.onCooldown = null
engine.player.activeSkillCdMultiplier = 1
ok('冷却通道：冲刺、施法与破阵追击进度独立于 2Hz 快照')

// —— 3. 经验曲线：Lv.5 前放慢选择密度，Lv.10 收敛回原中期曲线 ——
assert.equal(engine.player.maxExp, STARTING_EXP_THRESHOLD, '开局阈值 40')
engine.player.gainExp(39)
assert.equal(engine.player.level, 1, '39 经验不足以升到 2 级')
engine.player.gainExp(1)
assert.equal(engine.player.level, 2)
assert.equal(engine.player.maxExp, 55, '2 → 3 级需要 55 经验')
assert.deepEqual(
  [2, 3, 4, 5, 6, 7, 8, 9].map((level) => getNextExpThreshold(0, level)),
  [55, 75, 100, 130, 170, 220, 290, 400],
  '引导阈值逐级递增并在 9 级收敛到 400'
)
assert.equal(STARTING_EXP_THRESHOLD + 55 + 75 + 100, 270, '升到 5 级累计需要 270 经验')
engine.player.level = 9
engine.player.exp = 0
engine.player.maxExp = 401
engine.player.gainExp(401)
assert.equal(engine.player.level, 10)
assert.equal(engine.player.maxExp, Math.floor(401 * 1.32), '10 级起倍率降至 1.32')
engine.onLevelUp = () => {} // 吞掉升级面板（暂停）
engine.player.level = 1
engine.player.exp = 0
engine.player.maxExp = STARTING_EXP_THRESHOLD
ok('经验曲线：Lv.5 前累计需求提高至 270，Lv.10 后沿用中后期增幅')

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

// —— 5. Capstone 门槛：Lv.14 且达到战局进度后才进入候选 ——
engine.reset()
engine.primarySpec = 'gatling'
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
assert.ok(opts.every((o) => !o.isCapstone), '仅 Lv.14、波 6：大招仍未开放')
engine.player.level = 12
engine.enemyManager.wave = 10
opts = rollSkills(engine, 3)
assert.ok(opts.every((o) => !o.isCapstone), '仅第 10 波、Lv.12：大招仍未开放')
engine.player.level = 14
opts = rollSkills(engine, 3)
assert.ok(opts[0].isCapstone, 'Lv.14 且第 10 波：大招进入候选并排首位')
engine.runSelection = { mode: 'expedition', difficulty: 'normal' }
engine.expeditionStage = 4
opts = rollSkills(engine, 3)
assert.ok(opts.every((o) => !o.isCapstone), '远征第 4 关：大招仍未开放')
engine.expeditionStage = 5
opts = rollSkills(engine, 3)
assert.ok(opts[0].isCapstone, '远征 Lv.14 且第 5 关：大招开放')
engine.runSelection = { mode: 'timed', difficulty: 'normal' }
ok('Capstone 门槛：等级与战局进度必须同时达标')

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
