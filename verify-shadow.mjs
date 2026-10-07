import assert from 'node:assert/strict'
import { createArena, spawn, spawnBoss, pressSpace, learn, dispose, ctx2d, rollSkills } from './test-support/arena-fixture.mjs'
import { inShadowPath, SHADOW_BLADE_DAMAGE, SHADOW_ASSAULT_DISTANCE, SHADOW_ASSAULT_DAMAGE, SHADOW_ASSAULT_SPLASH } from './src/game/ShadowCombat.js'
import { BOSS_SKILL_DATABASE } from './src/game/SkillPool.js'

let count = 0
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`)
function check(name, test) {
  const g = createArena('shadow')
  // Isolate blade geometry from the independently verified critical summon mechanic.
  g.weaponSystem.shadowCombat.clones.onCritical = () => false
  try { test(g); console.log(`  ✓ ${++count}. ${name}`) } finally { dispose(g) }
}
function stab(g, e) {
  const c = g.weaponSystem.shadowCombat
  assert.ok(c.stab(e))
  c.update(c.swing.windup + c.swing.strike + 0.0001)
}
function assault(g, dt = 1 / 60) {
  pressSpace(g)
  let frames = 0
  while (g.weaponSystem.shadowCombat.assault && frames++ < 120) g.player.update(dt)
  assert.ok(frames < 120)
}

check('开局近战，远敌保留就绪；近敌触发短前摇，普攻不移动本体或生成飞弹', g => {
  const ws = g.weaponSystem, c = ws.shadowCombat, p = g.player
  near(ws.fireInterval, 0.55)
  const e = spawn(g, { x: 400 })
  ws.cooldown = 0; ws.update(0.02)
  assert.equal(c.swing, null); assert.equal(ws.cooldown, 0)
  e.x = p.x + 65
  ws.update(0.01)
  assert.ok(c.swing); assert.equal(e.hp, 100)
  const x = p.x, y = p.y
  c.render(ctx2d); p.render(ctx2d)
  c.update(0.11)
  near(e.hp, 100 - SHADOW_BLADE_DAMAGE)
  assert.equal(p.x, x); assert.equal(p.y, y)
  assert.equal(ws._projectiles.length, 0)
  c.render(ctx2d); p.render(ctx2d)
})
check('窄向最多三目标，后续伤害降低；侧面、背面与远处不受伤', g => {
  const front = spawn(g, { x: 40 }), next = spawn(g, { x: 62 }), third = spawn(g, { x: 80 })
  const fourth = spawn(g, { x: 96 }), side = spawn(g, { x: 60, y: 65 }), rear = spawn(g, { x: -60 }), far = spawn(g, { x: 250 })
  stab(g, front)
  near(front.hp, 100 - SHADOW_BLADE_DAMAGE)
  for (const e of [next, third]) near(e.hp, 100 - SHADOW_BLADE_DAMAGE * 0.65)
  for (const e of [fourth, side, rear, far]) assert.equal(e.hp, 100)
})
check('起手锁方向，目标在前摇离开会刺空；圆端点和擦边判定准确', g => {
  const c = g.weaponSystem.shadowCombat, e = spawn(g)
  assert.ok(c.stab(e)); e.y += 80; c.update(0.11)
  assert.equal(e.hp, 100)
  const circle = { active: true, hp: 1, radius: 10, x: 108, y: 15 }
  assert.equal(inShadowPath(circle, 0, 0, 100, 0, 8), true)
  circle.x = 111; assert.equal(inShadowPath(circle, 0, 0, 100, 0, 8), false)
})
check('高攻速缩短前摇并提高实际命中数，不重复结算同一刺击', g => {
  const ws = g.weaponSystem, c = ws.shadowCombat, e = spawn(g, { hp: 10000 })
  function hits(interval) {
    c.reset(); ws.fireInterval = interval; ws.cooldown = 0; e.hp = 10000
    for (let i = 0; i < 240; i++) ws.update(1 / 120)
    return 10000 - e.hp
  }
  const slow = hits(0.55), fast = hits(0.20)
  assert.ok(fast > slow * 2)
})
check('F 按移动方向起手并锁定，前摇不无敌；穿行命中一次且首目标必暴', g => {
  const p = g.player, c = g.weaponSystem.shadowCombat
  const first = spawn(g, { x: 65 }), next = spawn(g, { x: 125 }), rear = spawn(g, { x: -60 }), side = spawn(g, { x: 80, y: 80 })
  g.input.state.right = true
  const x = p.x
  pressSpace(g)
  assert.equal(c.assault.phase, 'windup'); assert.equal(p.strainSkillCd, 5)
  p.update(0.05); assert.equal(p.x, x); assert.equal(p.invincible, 0)
  g.input.state.right = false; g.input.state.up = true
  while (c.assault) p.update(1 / 60)
  near(p.x, x + SHADOW_ASSAULT_DISTANCE)
  near(first.hp, 100 - SHADOW_ASSAULT_DAMAGE * g.weaponSystem.critMul)
  near(next.hp, 100 - SHADOW_ASSAULT_SPLASH)
  assert.equal(rear.hp, 100); assert.equal(side.hp, 100)
  assert.equal(p.guaranteedCrit, false)
})
check('无目标也能主动撤离，静止沿面朝方向；无击杀不返还', g => {
  const p = g.player, y = p.y
  p.facing = -Math.PI / 2
  assault(g, 0.26)
  near(p.y, y - SHADOW_ASSAULT_DISTANCE)
  near(p.strainSkillCd, 5)
  near(p.invincible, 0.12)
  assert.equal(p.guaranteedCrit, false)
})
check('多目标致死仅返还一次 0.5 秒，奖励去重且不吞噬', g => {
  const p = g.player
  const enemies = [45, 85, 130].map(x => spawn(g, { x, hp: 0.5 }))
  p.facing = 0
  assault(g, 0.26)
  near(p.strainSkillCd, 4.5)
  assert.equal(g.weaponSystem.kills, 3); assert.equal(g.weaponSystem.devours, 0)
  for (const e of enemies) g.weaponSystem._onKill(e)
  assert.equal(g.weaponSystem.kills, 3)
})
check('护盾吸收首目标影袭，后续目标不继承首击倍率；无虚假命中与返还', g => {
  const shield = spawn(g, { x: 55 }), next = spawn(g, { x: 100 })
  shield.shieldHits = 1; g.player.facing = 0
  assault(g, 0.26)
  assert.equal(shield.hp, 100); assert.equal(shield.shieldHits, 0)
  near(next.hp, 100 - SHADOW_ASSAULT_SPLASH)
  assert.equal(g.weaponSystem.shadowCombat.impacts.length, 1)
})
check('储存必暴跨刺空与护盾保留，首次真实伤害消费；残血暴伤生效，旧伪分身倍率被移除', g => {
  const ws = g.weaponSystem, p = g.player, e = spawn(g)
  p.guaranteedCrit = true; e.shieldHits = 1
  stab(g, e); assert.equal(p.guaranteedCrit, true)
  ws.executeCrit = true; ws.isShadowLord = true; ws.critMul = 5; e.hp = 50
  stab(g, e)
  near(e.hp, 50 - SHADOW_BLADE_DAMAGE * 5 * 2)
  assert.equal(p.guaranteedCrit, false)
  assert.ok(ws.shadowCombat.impacts.some(i => i.crit))
})
check('首领护盾、易伤和高暴伤遵循同一实体结算，无杂兵也可影袭', g => {
  const ws = g.weaponSystem, boss = spawnBoss(g, 1000)
  ws.damage = 2; ws.levelMul = 3; boss.vulnerableTimer = 1
  g.player.facing = 0
  assault(g, 0.26)
  near(boss.hp, 1000 - 2 * 3 * SHADOW_ASSAULT_DAMAGE * ws.critMul * boss.vulnerableMultiplier)
  assert.equal(ws.devours, 0)
})
check('大步长仍扫描整条穿行路径，穿行与落地短暂免伤，之后恢复受击', g => {
  const p = g.player, c = g.weaponSystem.shadowCombat, e = spawn(g, { x: 110 })
  p.facing = 0; pressSpace(g); p.update(0.11)
  const hp = p.hp; p.hit(1); assert.equal(p.hp, hp)
  p.update(0.3)
  assert.equal(c.assault, null); assert.ok(e.hp < 100)
  p.hit(1); assert.equal(p.hp, hp)
  p.update(0.13); p.hit(1); assert.equal(p.hp, hp - 1)
})
check('地图边界与拒马截断穿行，提示端点等于实际落点，不穿墙伤敌', g => {
  const p = g.player, c = g.weaponSystem.shadowCombat
  p.x = g.worldWidth - p.radius - 40; p.facing = 0
  const preview = c.destination(0)
  assault(g, 0.26); near(p.x, preview.x); near(p.x, g.worldWidth - p.radius)
  p.strainSkillCd = 0; pressSpace(g)
  assert.equal(p.strainSkillCd, 0); assert.equal(c.assault, null)
  p.x = g.worldWidth / 2
  const wallX = p.x + 75
  g.mapFeatures.barricades = [{ active: true, xRatio: wallX / g.worldWidth, yRatio: p.y / g.worldHeight, angle: Math.PI / 2, length: 160, width: 18, hp: 3, hitCooldown: 0 }]
  const e = spawn(g, { x: 120 })
  const stop = c.destination(0)
  assault(g, 0.26)
  near(p.x, stop.x); assert.ok(p.x < wallX); assert.equal(e.hp, 100)
  assert.equal(g.mapFeatures.barricades[0].hp, 2)
})
check('F 与 Shift 无效，空格影袭会取消普攻；秘典必暴在影袭结束后储存', g => {
  const c = g.weaponSystem.shadowCombat, p = g.player, e = spawn(g)
  for (const code of ['KeyF', 'ShiftLeft', 'ShiftRight']) g.input._onKeyDown({ code, preventDefault() {} })
  g._updateStrainSkill(0)
  assert.equal(c.assault, null)
  learn(g, 'ass_decoy')
  BOSS_SKILL_DATABASE.assassin.find(s => s.id === 'boss_assassin_voidstep').apply(g)
  c.stab(e); pressSpace(g)
  assert.equal(c.swing, null)
  g.player.update(0.27)
  assert.equal(p._decoys.length, 0)
  assert.equal(p.guaranteedCrit, true)
})
check('暂停不消耗影袭前摇，死亡、结算与重开清理所有状态', g => {
  const c = g.weaponSystem.shadowCombat
  pressSpace(g); g.pause(); g._tick(300)
  assert.equal(c.assault.phase, 'windup')
  g.player.dead = true; g.weaponSystem.update(0.1)
  assert.equal(c.assault, null)
  g.reset(); g.running = true; pressSpace(g); g.runFinished = true; c.update(0.01)
  assert.equal(c.assault, null)
  g.reset(); assert.equal(c.assault, null); assert.equal(c.impacts.length, 0)
  assert.equal(g.player.strainSkillCd, 0)
  g.applyStartingStrain('ricochet'); g.reset()
  const e = spawn(g, { x: 400 }); g.weaponSystem.fire(e)
  assert.ok(g.weaponSystem._projectiles.length > 0)
  assert.equal(c.enabled, false)
})
check('裂影横斩在 Lv.5 觉醒并有前置后进入暗影技能池，原生黏液不抽到无效技能', g => {
  learn(g, 'ass_lethal')
  assert.ok(!rollSkills(g, 100).some(s => s.id === 'ass_cleave'))
  g.player.level = 5; g._ensureRoleAwakening()
  assert.ok(rollSkills(g, 100).some(s => s.id === 'ass_cleave'))
  g.applyStartingStrain('origin'); g.reset(); g.player.level = 5; g.primarySpec = 'assassin'; learn(g, 'ass_lethal')
  assert.ok(!rollSkills(g, 100).some(s => s.id === 'ass_cleave'))
})
check('裂影横斩清理目标两侧最多四敌，独立伤害不暴击、不递归，远敌安全', g => {
  learn(g, 'ass_cleave', 2)
  const ws = g.weaponSystem, c = ws.shadowCombat
  ws.critChance = 1; ws.critMul = 5
  const primary = spawn(g)
  const flank = [-56, -30, 30, 56, 76].map(y => spawn(g, { x: 60, y }))
  const far = spawn(g, { x: 60, y: 150 })
  stab(g, primary)
  near(primary.hp, 100 - SHADOW_BLADE_DAMAGE * 5)
  for (const e of flank.slice(0, 4)) near(e.hp, 98.8)
  assert.equal(flank[4].hp, 100); assert.equal(far.hp, 100)
  assert.equal(c.cleaves.length, 1)
  c.render(ctx2d)
  stab(g, primary)
  for (const e of flank.slice(0, 4)) near(e.hp, 98.8)
  c.update(0.66); stab(g, primary)
  for (const e of flank.slice(0, 4)) near(e.hp, 97.6)
})
check('横斩遵循护盾与击杀结算；由横斩造成的击杀不返还影袭冷却', g => {
  learn(g, 'ass_cleave')
  const primary = spawn(g, { x: 65 }), shield = spawn(g, { x: 65, y: -40, hp: 0.5 }), victim = spawn(g, { x: 65, y: 40, hp: 0.5 })
  shield.shieldHits = 1; g.player.facing = 0
  assault(g, 0.26)
  assert.ok(primary.hp < 100); assert.equal(shield.hp, 0.5)
  assert.equal(victim.active, false); assert.equal(g.weaponSystem.kills, 1)
  near(g.player.strainSkillCd, 5)
  g.reset(); assert.equal(g.player.shadowCleaveLevel, 0)
  assert.equal(g.weaponSystem.shadowCombat.cleaves.length, 0)
})
console.log(`暗影近战验证：${count} 组通过`)
