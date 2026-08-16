// 无头引擎渲染可见性测试：桩掉 DOM/Canvas，记录绘制坐标，
// 断言背景/玩家/敌人确实被绘制在视口内。运行：node engine-smoke.mjs
import assert from 'node:assert/strict'

// —— 浏览器环境桩（ctx 记录 translate/drawImage 坐标） ——
const frame = { translates: [], images: [] }
const gradient = { addColorStop() {} }
const ctx2d = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => gradient
      if (prop === 'translate') return (x, y) => frame.translates.push([x, y])
      if (prop === 'drawImage') return (_img, x, y) => frame.images.push([x, y])
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

const engine = GameEngine.create(canvasStub)
engine.onStats = () => {}
engine.onLevelUp = () => {}
engine.onGameOver = () => {}
engine.onBossSpawn = () => {}
engine.onWaveChanged = () => {}
engine.onEvolution = () => {}

// 页面可见性生命周期：菜单不能被前台恢复误启动；战斗切后台需停循环与 BGM，
// 回前台只恢复此前确实运行的局；手动暂停仍由暂停锁守住。
let musicPauses = 0
const originalPauseMusic = engine.sound.pauseMusic
engine.sound.pauseMusic = function (...args) {
  musicPauses++
  return originalPauseMusic.apply(this, args)
}
document.hidden = false
engine._onVisibility()
assert.equal(engine.running, false)
assert.equal(engine.input.suspended, true)

engine.start()
document.hidden = true
engine._onVisibility()
assert.equal(engine.running, false)
assert.equal(engine.input.suspended, true)
assert.equal(musicPauses, 1)

document.hidden = false
engine._onVisibility()
assert.equal(engine.running, true)
assert.equal(engine.input.suspended, false)

engine.pause()
document.hidden = true
engine._onVisibility()
document.hidden = false
engine._onVisibility()
assert.equal(engine.running, false)
engine.resume()
assert.equal(engine.running, true)
engine.sound.pauseMusic = originalPauseMusic
engine.stop()
console.log('✓ 页面可见性恢复不误启动菜单，战斗后台静音，手动暂停锁保持有效')

const near = (a, b, eps = 1) => Math.abs(a - b) < eps
const has = (list, x, y) => list.some(([a, b]) => near(a, x) && near(b, y))

engine.reset()
engine.start()
engine.update(1 / 60)
engine.render()

// 放敌人到玩家附近，跑几帧后验证绘制坐标
const p = engine.player
const em = engine.enemyManager
p.invincible = 999 // 渲染压力测试不验证受击，避免随机死亡污染后续事件测试
em.spawnAt(p.x + 120, p.y + 80, 'knight')
em.spawnAt(p.x - 120, p.y + 80, 'archer')
em.spawnAt(p.x + 60, p.y - 120, 'mage')

let enemiesDrawnOnScreen = false
let playerDrawn = false
let bgDrawn = false
let maxKills = 0
for (let i = 0; i < 240; i++) {
  frame.translates.length = 0
  frame.images.length = 0
  engine.update(1 / 60)
  engine.render()

  const cam = engine.camera
  const { width, height } = engine
  if (frame.images.some(([x, y]) => near(x, -cam.x) && near(y, -cam.y))) bgDrawn = true
  // 实体绘制在相机平移后的世界坐标系中：translate 记录的是原始世界坐标
  if (has(frame.translates, p.x, p.y)) playerDrawn = true
  for (const e of em.enemies) {
    const sx = e.x - cam.x
    const sy = e.y - cam.y
    if (sx > -100 && sx < width + 100 && sy > -100 && sy < height + 100 && has(frame.translates, e.x, e.y)) {
      enemiesDrawnOnScreen = true
      break
    }
  }
  maxKills = Math.max(maxKills, engine.weaponSystem.kills)
  if (maxKills >= 3) break // 有击杀即可
}

console.log(`状态：kills=${maxKills} enemies=${em.count} cam=(${engine.camera.x.toFixed(0)}, ${engine.camera.y.toFixed(0)})`)
assert.ok(bgDrawn, '背景离屏画布未被绘制')
assert.ok(playerDrawn, '玩家未被绘制在视口内')
assert.ok(enemiesDrawnOnScreen, '敌人未被绘制在视口内')
console.log('✓ 背景、玩家、敌人均绘制在视口内（坐标断言通过）')

// 再验证高波次满场场景（敌人可能在视口外的剔除逻辑不误伤可见敌人）
for (let i = 0; i < 240; i++) {
  if (i % 8 === 0) em.spawn()
  frame.translates.length = 0
  engine.update(1 / 60)
  engine.render()
  if (em.count >= 60) break
}
console.log(`✓ 满场场景无异常：enemies=${em.count} kills=${engine.weaponSystem.kills}`)

// 地图事件地标必须进入世界渲染层，且处于视口内时实际绘制。
const event = engine.worldEvents.spawnEvent('beacon')
event.x = p.x + 100
event.y = p.y
frame.translates.length = 0
engine.render()
assert.ok(has(frame.translates, event.x, event.y), '地图事件地标未绘制在世界坐标中')
console.log('✓ 地图事件地标进入世界渲染层')

// Boss 强招预警必须可进入世界渲染层，战斗意图同时供 HUD 读取。
em.wave = 5
em.spawnBoss()
const boss = em._boss
assert.equal(engine.dialogue.current?.kind, 'boss')
assert.equal(engine.dialogue.current?.event, 'spawn')
boss.x = engine.camera.x - 100 // 本体在常规剔除余量外，预警仍可能延伸进视口
boss.y = p.y
boss.specialCd = 0
boss.update(1 / 60)
boss.update(1 / 60)
frame.translates.length = 0
engine.render()
assert.equal(boss.specialState, 'telegraph')
assert.ok(boss.combatInfo.castProgress > 0)
assert.ok(has(frame.translates, boss.x, boss.y), '视口外 Boss 的入屏预警被错误剔除')
assert.equal(em.bossInfo.special, boss.combatInfo.special)
console.log('✓ Boss 强招预警进入世界渲染层，HUD 战斗意图可读取')

// 临期元素核心使用透明度脉冲 + 静态倒计时环，必须保持可绘制。
const warningCore = engine.gemManager.spawn(p.x + 120, p.y + 80, 0, 'lightning')
warningCore.life = 4
frame.translates.length = 0
engine.render()
assert.ok(has(frame.translates, warningCore.x, warningCore.y), '临期元素核心未进入渲染层')
console.log('✓ 临期元素核心警示状态进入世界渲染层')

// 重开必须清掉全部局内专精，永久基因由 applyGenes 重新应用。
engine.setGenes({ swift: 2, split: 1, kinetic_origin: 1 })
p.shadowDecoyDuration = 2.5
p.killRushSpeed = 0.4
p.devourDamageReduction = 0.25
p.frostFireAura = 2
p.isGluttonyLord = true
p._decoys.push({ x: p.x, y: p.y, life: 1, maxLife: 1, radius: 20, isDecoy: true })
engine.reset()
assert.equal(p.shadowDecoyDuration, 0)
assert.equal(p.killRushSpeed, 0)
assert.equal(p.devourDamageReduction, 0)
assert.equal(p.frostFireAura, 0)
assert.equal(p.isGluttonyLord, false)
assert.equal(p._decoys.length, 0)
assert.equal(p.geneDashCdMultiplier, 0.8)
assert.equal(engine.weaponSystem.genePierces, 1)
assert.equal(engine.weaponSystem.splitChance, 0.25)
assert.equal(engine.worldEvents.current, null)
assert.equal(engine.worldEvents.completed, 0)
console.log('✓ 重开清除全部局内专精状态')

// 限时模式状态机：11:30 预警、12:00 中立取消事件并清场、终局 Boss 死亡才胜利。
const runEvents = []
let settlement = null
engine.onRunState = (event) => runEvents.push(event)
engine.onGameOver = (info) => {
  settlement = info
}
engine.configureRun({ mode: 'timed', difficulty: 'easy' })
engine.reset()
assert.equal(engine.player.maxHp, 7)
engine.worldEvents.spawnEvent('hunt')
em.spawnAt(p.x + 90, p.y, 'knight')
em.spawnBullet(p.x + 200, p.y, Math.PI, 'archer')
engine.elapsed = 690
engine.update(1 / 60)
assert.equal(runEvents.at(-1).kind, 'warning')
engine.elapsed = 720
engine.update(1 / 60)
assert.equal(engine.runState, 'finale')
assert.equal(engine.worldEvents.current, null)
assert.equal(em.enemies.length, 1)
assert.equal(em._bullets.length, 0)
assert.equal(em._boss.isFinalBoss, true)
// 终局审判：战场切入王城决战场
assert.equal(engine._mapThemeId, 'royal')
assert.equal(engine._mapVariant, 'shattered-court')
engine.update(0.5)
assert.equal(engine.finaleTime, 0.5)
engine.weaponSystem._settleKill(em._boss)
assert.equal(engine.runState, 'victory')
assert.equal(settlement.result, 'victory')
assert.equal(settlement.mode, 'timed')
assert.equal(settlement.difficulty, 'easy')
console.log('✓ 限时状态机完成预警、终局清场、复合 Boss 与胜利结算闭环')

// 无尽战场推进：边境开局，波次跨过 20/30 时换景腐化、王城（灾厄烧向王都）
engine.configureRun({ mode: 'endless', difficulty: 'normal' })
engine.reset()
assert.equal(engine._mapThemeId, 'frontier')
assert.equal(engine._mapVariant, 'marsh-edge')
engine.enemyManager.wave = 20
engine.update(1 / 60)
assert.equal(engine._mapThemeId, 'blight')
assert.equal(engine._mapVariant, 'blight-garden')
engine.enemyManager.wave = 30
engine.update(1 / 60)
assert.equal(engine._mapThemeId, 'royal')
assert.equal(engine._mapVariant, 'outer-bailey')
const zoneEvents = runEvents.filter((event) => event.kind === 'zone')
assert.equal(zoneEvents.length, 2)
assert.equal(zoneEvents[0].zone, '腐化洞庭')
assert.equal(zoneEvents[1].zone, '王城废垒')
console.log('✓ 无尽战场推进：随灾变波次从边境烧到王城（三段换景 + 战区横幅）')

// 史莱姆血统：先天属性在基因/难度/专精之后叠加（岩壳/电光/贪噬各有代价）
engine.configureRun({ mode: 'timed', difficulty: 'normal' })
engine.applyStartingStrain('origin')
engine.reset()
const baseHp = engine.player.maxHp
const baseSpeed = engine.player.speed
const baseDmg = engine.weaponSystem.damage
engine.applyStartingStrain('stone')
engine.reset()
assert.equal(engine.player.maxHp, baseHp + 3)
assert.equal(engine.player.speed, Math.round(baseSpeed * 0.88))
engine.applyStartingStrain('volt')
engine.reset()
assert.equal(engine.player.maxHp, baseHp - 2)
assert.equal(engine.player.speed, Math.round(baseSpeed * 1.15))
engine.applyStartingStrain('glutton')
engine.reset()
assert.ok(Math.abs(engine.weaponSystem.damage - baseDmg * 0.85) < 1e-9)
assert.equal(engine.player.strainDevourRadius, 1.35)
assert.equal(engine.strainDevourBonus, 0.04)
const strainProbe = new (await import('./src/game/entities/Enemy.js')).Enemy({ x: 0, y: 0, speed: 80, hp: 10, type: 'knight' })
strainProbe.attach(engine)
assert.ok(Math.abs(strainProbe._devourThresh() - 0.16) < 1e-9, '贪噬血统：普通怪吞噬线 12% → 16%')
engine.applyStartingStrain('origin')
engine.reset()
console.log('✓ 史莱姆血统：岩壳/电光/贪噬先天属性正确叠加（生命/移速/攻击/吞噬口径）')

// 章节远征：六类目标、关间补给、技能选择与章节 Boss 必须形成完整状态闭环。
const rewards = []
let offeredSkills = null
settlement = null
engine.onExpeditionReward = (payload) => rewards.push(payload)
engine.onLevelUp = (options) => {
  offeredSkills = options
}
engine.configureRun({ mode: 'expedition', difficulty: 'normal' })
engine.reset()
assert.equal(engine.expeditionStage, 1)
assert.equal(engine.runState, 'active')
assert.equal(engine._mapThemeId, 'frontier')
assert.equal(engine._mapVariant, 'marsh-edge')
assert.equal(engine.canStartWorldEvent, false)
assert.equal(engine._expeditionProgress().definition.type, 'kills')

/** 过关推进：先进入 0.6s 残敌溃散演出，跳满计时后落进补给结算 */
const finishStageClearing = () => {
  assert.equal(engine.runState, 'stage-clearing', '过关先进入残敌溃散演出')
  engine._stageClearT = 10
  engine.update(0.001)
  assert.equal(engine.runState, 'stage-reward')
}

engine.weaponSystem.kills += 60
engine.update(0)
finishStageClearing()
assert.equal(rewards.at(-1).nextStage, 2)
engine.player.hp = 1
engine.resolveExpeditionReward('rest')
assert.equal(engine.expeditionStage, 2)
assert.equal(engine.player.hp, engine.player.maxHp)
assert.equal(engine.worldEvents.current.type, 'beacon')

engine.worldEvents.completed++
engine.update(0)
finishStageClearing()
const hpBeforeBlood = engine.player.maxHp
const dmgBeforeBlood = engine.weaponSystem.damage
engine.resolveExpeditionReward('blood')
assert.equal(engine.expeditionStage, 3)
assert.equal(engine.player.maxHp, hpBeforeBlood - 1)
assert.equal(engine.weaponSystem.damage, dmgBeforeBlood * 1.2)
assert.equal(em.enemies.filter((enemy) => enemy.isElite).length, 7)

engine.weaponSystem.eliteKills += 7
engine.update(0)
finishStageClearing()
engine.resolveExpeditionReward('rest')
assert.equal(engine.expeditionStage, 4)
assert.equal(engine._mapThemeId, 'blight')
assert.equal(engine._mapVariant, 'slime-nest')
engine.expeditionStageElapsed = 90
engine.update(0)
finishStageClearing()
engine.resolveExpeditionReward('rest')
assert.equal(engine.expeditionStage, 5)
assert.equal(engine.worldEvents.current.type, 'surge')

engine.weaponSystem.kills += 75
engine.worldEvents.completed++
engine.update(0)
finishStageClearing()
engine.resolveExpeditionReward('tome')
assert.ok(offeredSkills?.length > 0)
assert.equal(engine._pendingExpeditionStage, 6)
engine.applySkill(offeredSkills[0])
// 普通难度为 8 关：第 6/7 关是插章「圣物洗劫」「圣殿禁卫」，第 8 关才是统帅决战
assert.equal(engine.expeditionStage, 6)
assert.equal(engine.runState, 'active')
assert.equal(engine._mapThemeId, 'royal')
assert.equal(engine._mapVariant, 'reliquary')
assert.equal(engine.worldEvents.current.type, 'surge')

engine.weaponSystem.kills += 90
engine.worldEvents.completed++
engine.update(0)
finishStageClearing()
engine.resolveExpeditionReward('rest')
assert.equal(engine.expeditionStage, 7)
assert.equal(engine.runState, 'active')
assert.equal(engine._mapVariant, 'sanctum')
assert.equal(em.enemies.filter((enemy) => enemy.isElite).length, 9)

engine.weaponSystem.eliteKills += 9
engine.update(0)
finishStageClearing()
engine.resolveExpeditionReward('rest')
assert.equal(engine.expeditionStage, 8)
assert.equal(engine.runState, 'expedition-boss')
assert.equal(engine._mapThemeId, 'royal')
assert.equal(engine._mapVariant, 'shattered-court')
assert.equal(em.enemies.length, 1)
assert.equal(em._boss.isExpeditionBoss, true)
engine.weaponSystem._settleKill(em._boss)
assert.equal(engine.runState, 'victory')
assert.equal(settlement.mode, 'expedition')
assert.equal(settlement.stage, 8)
assert.equal(settlement.totalStages, 8)
assert.equal(settlement.epilogue.text, '原来一路进犯的……是我们。')
console.log('✓ 章节远征完成八关目标（含难度插章）、三类补给、技能衔接、统帅 Boss 与胜利结算闭环')
console.log('\n无头渲染可见性测试通过 ✓')
