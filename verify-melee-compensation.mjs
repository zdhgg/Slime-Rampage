// 近战补偿机制验证：暴食引力场/吞噬惯性/重咬突进/咬合震慑 + 暗影残影/微步/猎手直觉。
import assert from 'node:assert/strict'
import { createArena, spawn, spawnBoss, learn, dispose, settleSwing, strike } from './test-support/arena-fixture.mjs'
import { GLUTTON_SKILL_BY_ID, gluttonSkillAvailable, gluttonCowPowerAt, gluttonCowDurationAt } from './src/game/GluttonBuild.js'
import { GLUTTON_FEAST_DURATION, GLUTTON_FEAST_SPEED } from './src/game/GluttonResource.js'
import { SHADOW_ROUTE_SKILL_BY_ID, shadowHuntRangedRefundAt, shadowSkillAvailable } from './src/game/ShadowBuild.js'
import { SHADOW_BLADE_STEP } from './src/game/ShadowCombat.js'

const DT = 1 / 60
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

// ---------- 暴食 · 捕食引力场 ----------
{
  const g = createArena('glutton')
  try {
    const pull = spawn(g, { x: 140, y: 0, hp: 60 })
    pull.devourable = true
    const still = spawn(g, { x: 0, y: 140, hp: 60 })
    const d0 = distance(pull, g.player), s0 = distance(still, g.player)
    for (let i = 0; i < 12; i++) g.enemyManager._checkDevour(DT)
    const pulled = distance(pull, g.player)
    assert.ok(pulled < d0 - 10, `引力场应拖拽猎物（${d0.toFixed(0)} → ${pulled.toFixed(0)}）`)
    const absorb = (g.player.radius + 12) * (g.player.devourRadiusBonus || 1)
    assert.ok(pulled >= absorb - 2, '拖拽不得越过吸附口径一步吞掉')
    assert.equal(distance(still, g.player), s0, '未进吞线的敌人不受引力影响')
  } finally { dispose(g) }
}
console.log('引力场：吞线猎物被拖向口部、未入线不受影响 ✓')

// ---------- 暴食 · 吞噬惯性 ----------
{
  const g = createArena('glutton')
  try {
    const meal = spawn(g, { x: 20, y: 0, hp: 60 })
    meal.devourable = true
    g.enemyManager._checkDevour(DT)
    assert.ok(g.player.gluttonFeastTimer > 0, '吞噬应触发惯性计时')
    const t = g.player.gluttonFeastTimer
    g.player.gluttonFeastTimer = 0
    const meal2 = spawn(g, { x: 60, y: 60, hp: 0.5 })
    strike(g, meal2)
    assert.equal(g.player.gluttonFeastTimer, GLUTTON_FEAST_DURATION, '咬杀应重置惯性计时')
    assert.ok(t > 0)
    // 衍生伤害不触发：直接 enemy.hit 致死不产生惯性。
    const other = spawn(g, { x: -60, y: 0, hp: 0.5 })
    g.player.gluttonFeastTimer = 0
    other.hit(999)
    assert.equal(g.player.gluttonFeastTimer, 0, '非咬合链击杀不触发惯性')
  } finally { dispose(g) }
  // 移速端对比：有惯性计时比裸跑位移更大。
  const measure = feast => {
    const g = createArena('glutton')
    try {
      g.player.gluttonFeastTimer = feast
      Object.assign(g.input.state, { right: true })
      const x0 = g.player.x
      for (let i = 0; i < 30; i++) g.update(DT)
      return g.player.x - x0
    } finally { dispose(g) }
  }
  const withFeast = measure(1.5), bare = measure(0)
  assert.ok(withFeast > bare * (1 + GLUTTON_FEAST_SPEED * 0.8), `惯性应提高实际位移（${withFeast.toFixed(1)} vs ${bare.toFixed(1)}）`)
}
console.log('吞噬惯性：捕食/咬杀置时、衍生不触发、位移真实提升 ✓')

// ---------- 暴食 · 深渊吸噬反向聚怪重咬（区别于暗影冲刺） ----------
{
  const g = createArena('glutton')
  try {
    const ranged = spawn(g, { x: 165, y: 0, hp: 200, type: 'archer' })
    const flanker = spawn(g, { x: 0, y: -155, hp: 200, type: 'mage' })
    const c = g.weaponSystem.gluttonCombat
    const x0 = g.player.x, y0 = g.player.y
    assert.ok(c.useVortex(), '冷却就绪时无需资源也能释放深渊吸噬')
    settleSwing(c)
    assert.equal(g.player.x, x0, '深渊吸噬不产生刺客式位移')
    assert.equal(g.player.y, y0, '深渊吸噬原地发力聚怪')
    assert.ok(distance(ranged, g.player) < 120, `弓手应被拽入咬合区（实测 ${distance(ranged, g.player).toFixed(1)}）`)
    assert.ok(ranged.hp < 200 && flanker.hp < 200, '多方位被吸入敌人皆受到重咬打击')
    // 重碾 3 级：引力与重咬范围同步成长
    const g2 = createArena('glutton')
    try {
      const basePull = c.pullRadius()
      g2.player.gluttonHeavyLevel = 3
      const c2 = g2.weaponSystem.gluttonCombat
      assert.ok(c2.pullRadius() > basePull + 40, '重碾 3 级扩大深渊吸噬引力半径')
    } finally { dispose(g2) }
  } finally { dispose(g) }
}
console.log('深渊吸噬：原地聚怪、拉近远程、不与暗影冲刺重样 ✓')

// ---------- 暴食 · 咬合震慑（饕甲进阶卡） ----------
{
  const g = createArena('glutton')
  try {
    const cow = GLUTTON_SKILL_BY_ID.glut_cow
    g.primarySpec = 'gluttony'
    g.weaponSystem.gluttonCombat.route = 'jaw'
    assert.equal(gluttonSkillAvailable(g, cow, []), false, '震慑是饕甲路线进阶，裂颚下不可用')
    g.weaponSystem.gluttonCombat.route = 'shell'
    assert.ok(gluttonSkillAvailable(g, cow, []), '饕甲路线下震慑应进入构筑池')
    g.applySkill(cow)
    assert.equal(g.player.gluttonCowLevel, 1)
    const mob = spawn(g, { x: 55, y: 0, hp: 200 })
    strike(g, mob)
    assert.ok(mob.gluttonCow > 0, '咬中的敌人应被震慑')
    assert.ok(Math.abs(mob.gluttonCowMul - gluttonCowPowerAt(1)) < 1e-6)
    assert.ok(Math.abs(mob.outgoingDamage(1) - (1 - gluttonCowPowerAt(1))) < 1e-6, '震慑期出手伤害打折')
    const boss = spawnBoss(g, 300)
    g.weaponSystem.gluttonCombat.hit(boss, 5, { basic: true })
    assert.equal(boss.gluttonCow, 0, '首领不受震慑')
    assert.equal(boss.gluttonCowMul, 0)
  } finally { dispose(g) }
}
console.log('咬合震慑：路线门槛正确、咬中减伤、首领免疫 ✓')

// ---------- 暗影 · 刺杀残影 + 刃隙微步 ----------
{
  const g = createArena('shadow')
  try {
    const c = g.weaponSystem.shadowCombat
    // 微步：刃距边缘的目标起手时向它小步进。
    const far = spawn(g, { x: 80, y: 0, hp: 300 })
    const x0 = g.player.x
    assert.ok(c.stab(far))
    const stepped = g.player.x - x0
    assert.ok(stepped > 10 && stepped <= SHADOW_BLADE_STEP + 0.5, `起手微步 ≤ ${SHADOW_BLADE_STEP}px（实测 ${stepped.toFixed(1)}）`)
    settleSwing(c)
    // 残影：本体击杀在击杀点留替身。
    const prey = spawn(g, { x: 55, y: 0, hp: 0.5 })
    const px = prey.x, py = prey.y
    c.stab(prey)
    settleSwing(c)
    assert.equal(g.player._decoys.length, 1, '本体击杀应留下残影替身')
    const echo = g.player._decoys[0]
    assert.ok(echo.isDecoy && Math.hypot(echo.x - px, echo.y - py) < 1, '残影落在击杀点')
    assert.ok(echo.life <= 1.25, '残影短命')
    // 上限：连续击杀共用 _decoys 池封顶 3。
    for (let i = 0; i < 4; i++) {
      const v = spawn(g, { x: 50 + i * 4, y: 40, hp: 0.5 })
      c.stab(v); settleSwing(c)
    }
    assert.ok(g.player._decoys.length <= 3, `残影与替身共用池不超过 3（实际 ${g.player._decoys.length}）`)
  } finally { dispose(g) }
}
console.log('刺杀残影 + 刃隙微步：击杀留替身、起手小步进 ✓')

// ---------- 暗影 · 猎手直觉（猎杀进阶卡） ----------
{
  const g = createArena('shadow')
  try {
    const card = SHADOW_ROUTE_SKILL_BY_ID.shadow_hunt_refund
    assert.equal(shadowSkillAvailable(g, card), false, '未确认路线时进阶卡不可用')
    g.weaponSystem.shadowCombat.route = 'swarm'
    assert.equal(shadowSkillAvailable(g, card), false, '群影路线下不可用')
    g.weaponSystem.shadowCombat.route = 'hunt'
    assert.ok(shadowSkillAvailable(g, card), '猎杀路线下应进入构筑池')
    g.applySkill(card); g.applySkill(card)
    assert.equal(g.weaponSystem.shadowCombat.huntRefundLevel, 2)
    // 返还预算由实际影袭施放建立；冷却数值本身不会创建预算。
    const combat = g.weaponSystem.shadowCombat
    assert.equal(combat.useAssault(), true)
    for (let i = 0; combat.assault && i < 120; i++) combat.updateMovement(DT)
    assert.equal(combat.assault, null)
    g.player.strainSkillCd = 3
    const mage = spawn(g, { x: 55, y: 0, hp: 0.5, type: 'mage' })
    g.weaponSystem.shadowCombat.stab(mage)
    settleSwing(g.weaponSystem.shadowCombat)
    const expected = 3 - shadowHuntRangedRefundAt(2)
    assert.ok(Math.abs(g.player.strainSkillCd - expected) < 1e-6,
      `射手击杀应返还 ${shadowHuntRangedRefundAt(2).toFixed(2)}s（剩 ${g.player.strainSkillCd.toFixed(2)}）`)
    const knight = spawn(g, { x: 55, y: 0, hp: 0.5 })
    g.player.strainSkillCd = 3
    g.weaponSystem.shadowCombat.stab(knight)
    settleSwing(g.weaponSystem.shadowCombat)
    assert.equal(g.player.strainSkillCd, 3, '近战目标击杀不产生射手返还')
  } finally { dispose(g) }
}
console.log('猎手直觉：路线门槛正确、射手击杀返还、近战目标不返 ✓')

console.log('\n近战补偿机制验证全部通过（暴食 4 项 + 暗影 3 项）')
