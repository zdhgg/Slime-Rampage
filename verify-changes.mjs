// 本轮改动验证脚本（输入挂起 / 局内觉醒 / 分裂继承 / 冲撞附魔）。运行：node verify-changes.mjs
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

const { GameEngine } = await import('./src/game/GameEngine.js')
const { Enemy } = await import('./src/game/entities/Enemy.js')
const { Projectile } = await import('./src/game/entities/Projectile.js')
const { SKILL_DATABASE, rollSkills } = await import('./src/game/SkillPool.js')

const engine = GameEngine.create(canvasStub)
for (const k of ['onStats', 'onLevelUp', 'onGameOver', 'onBossSpawn', 'onWaveChanged', 'onEvolution']) {
  engine[k] = () => {}
}
let n = 0
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`)

// —— 1. 输入挂起：暂停期间按键不入队，恢复后无幽灵操作 ——
assert.equal(engine.input.suspended, true, '构造后（未开局）应处于挂起态')
const evSpace = { code: 'Space', repeat: false, preventDefault() { this.prevented = true } }
engine.input._onKeyDown(evSpace)
assert.equal(engine.input._dashQueued, false, '挂态按下 Space 不应入队')
assert.equal(evSpace.prevented, undefined, '挂态不应 preventDefault（放行给 UI 按钮）')
engine.reset()
engine.start()
assert.equal(engine.input.suspended, false, 'start 后应接管键盘')
engine.input._onKeyDown(evSpace)
assert.equal(engine.input._dashQueued, true)
engine.pause()
assert.equal(engine.input.suspended, true, '暂停后应挂起')
assert.equal(engine.input._dashQueued, false, '暂停应清空队列（无幽灵冲刺）')
engine.resume()
ok('输入挂起：UI 期间不劫持 Space、恢复后无幽灵操作')

// —— 2. 主专精只在局内觉醒：开局无专精，Lv.5 四系陈列且不附赠 T1 ——
assert.equal(engine.primarySpec, null)
assert.equal(engine.weaponSystem.projectileCount, 1, '开局保持基础单弹')
assert.equal(typeof engine.applyStartingSpec, 'undefined', '引擎不再暴露开局预选通道')
engine.player.level = 5
engine.player.exp = 0
engine.player.maxExp = 1
let options = rollSkills(engine, 3)
assert.equal(options.length, 4, 'Lv.5 必须完整展示四个主专精')
assert.ok(options.every((o) => o.isMilestone && o.milestoneType === 'primary'))
engine.applySkill(options.find((o) => o.spec === 'gatling'))
assert.equal(engine.primarySpec, 'gatling')
assert.equal(engine.weaponSystem.projectileCount, 2, '机枪觉醒只应用专精赋能，不附赠 T1')
assert.ok(Math.abs(engine.weaponSystem.fireInterval - 0.85) < 1e-9)
assert.equal(engine.skillLevels['gat_multishot'] || 0, 0, '局内觉醒不白送 T1')

// 暴食的核心技能主动压低攻击，逐级扩大留血窗口；重开后不残留。
engine.reset()
engine.player.level = 5
options = rollSkills(engine, 3)
engine.applySkill(options.find((o) => o.spec === 'gluttony'))
assert.equal(engine.weaponSystem.damage, 1, '暴食觉醒本身不附赠深渊胃囊')
const maw = SKILL_DATABASE.gluttony.primary.find((skill) => skill.id === 'glut_maw')
maw.apply(engine, 1)
assert.ok(Math.abs(engine.weaponSystem.damage - 0.9) < 1e-9, '深渊胃囊 Lv.1：攻击降至 90%')
maw.apply(engine, 2)
maw.apply(engine, 3)
assert.ok(Math.abs(engine.weaponSystem.damage - 0.7) < 1e-9, '深渊胃囊 Lv.3：攻击降至 70%')
assert.equal(engine.devourThreshold, 0.36)
assert.equal(engine.player.devourRadiusBonus, 1.6)

// 重开回到无专精基线，再由 Lv.5 选择另一条路线。
engine.reset()
assert.equal(engine.weaponSystem.damage, 1, '重开后暴食攻击抑制完全复位')
assert.equal(engine.primarySpec, null)
engine.player.level = 5
options = rollSkills(engine, 3)
engine.applySkill(options.find((o) => o.spec === 'elemental'))
assert.equal(engine.primarySpec, 'elemental')
assert.equal(engine.weaponSystem.projectileCount, 1, '机枪赋能不残留')
assert.ok(Math.abs(engine.weaponSystem.freezeChance - 0.2) < 1e-9, '元素觉醒只应用 +20% 基础赋能')
assert.equal(engine.skillLevels['ele_affinity'] || 0, 0, '元素路线同样不附赠 T1')
ok('主专精仅在 Lv.5 局内四选一，开局无预选与附赠技能')

// —— 3. 分裂弹继承母弹特效概率 ——
const ws = engine.weaponSystem
ws.freezeChance = 0.5
ws.burnChance = 0.5
ws.critChance = 0.4
const em = engine.enemyManager
const origin = new Enemy({ x: 400, y: 400, speed: 80, hp: 50, type: 'knight' })
origin.attach(engine)
const otherA = new Enemy({ x: 480, y: 400, speed: 80, hp: 50, type: 'knight' })
otherA.attach(engine)
const otherB = new Enemy({ x: 400, y: 480, speed: 80, hp: 50, type: 'knight' })
otherB.attach(engine)
em._enemies.push(origin, otherA, otherB)
const parent = new Projectile({ x: 400, y: 400, damage: 10, freezeChance: 0.5, burnChance: 0.5, critChance: 0.4 })
ws._split(origin, parent)
const splits = ws._projectiles.filter((p) => p.isSplit)
assert.equal(splits.length, 2)
assert.ok(splits.every((s) => Math.abs(s.freezeChance - 0.25) < 1e-9), '分裂弹继承 50% 冰冻概率')
assert.ok(splits.every((s) => Math.abs(s.burnChance - 0.25) < 1e-9), '分裂弹继承 50% 燃烧概率')
assert.ok(splits.every((s) => Math.abs(s.critChance - 0.2) < 1e-9), '分裂弹继承 50% 暴击概率')
assert.equal(splits[0].damage, 5, '分裂弹伤害仍为母弹 50%')
ok('分裂弹：按 50% 继承母弹暴击/元素附魔概率（机枪×元素协同打通）')

// —— 4. 冲撞附带元素 + 统一击杀结算 ——
ws._projectiles.length = 0
const gemsBefore = engine.gemManager.count
const killsBefore = ws.kills
ws.damage = 10
ws.levelMul = 1
engine.player.dashImpactDmg = 4 // ×4 冲撞
const victim = new Enemy({ x: 600, y: 400, speed: 80, hp: 10, type: 'knight' }) // ×1.6 职业系数 = 16 血
victim.attach(engine)
em._enemies.push(victim)
ws.dashImpact(victim, ws.damage * ws.levelMul * 4)
assert.equal(victim.active, false, '40 伤害击杀 30 血敌人')
assert.equal(ws.kills, killsBefore + 1, '冲撞击杀进入统一击杀结算')
assert.ok(engine.gemManager.count > gemsBefore, '冲撞击杀掉落经验宝石')
ok('冲撞：附带元素概率结算 + 击杀统一结算（不再漏掉宝石/计数）')

// —— 5. 重开统一回到 Lv.1 自由探索期 ——
engine.reset()
assert.equal(engine.primarySpec, null, '重开后主专精为空')
assert.equal(engine.skillLevels['gat_multishot'] || 0, 0, '无附赠 T1')
assert.equal(engine.weaponSystem.projectileCount, 1, '无觉醒加成')
ok('重开回到自由探索期，等待 Lv.5 再次觉醒')

engine.destroy()
console.log(`\n改动验证全部通过：${n} 组 ✓`)
