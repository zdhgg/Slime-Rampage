import assert from 'node:assert/strict'
import { createArena, spawn, spawnBoss, learn, dispose, pressSpace } from './test-support/arena-fixture.mjs'
import { BOSS_SKILL_DATABASE } from './src/game/SkillPool.js'
import { applyGenes } from './src/game/GenePool.js'
import { RunnerDirector } from './src/game/gameplay/runner/RunnerDirector.js'

let checks = 0
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`)
function check(strain, name, run) {
  const g = createArena(strain)
  try { run(g); console.log(`✓ ${++checks}. ${name}`) } finally { dispose(g) }
}
const key = (g, code, repeat = false) => g.input._onKeyDown({ code, repeat, preventDefault() {} })

for (const strain of ['origin', 'glutton', 'ricochet', 'elemental', 'shadow', 'summoner']) {
  check(strain, `${strain}: 空格唯一触发，长按/暂停/失焦/冷却不补发`, g => {
    spawn(g); g.player.gluttonCharge = strain === 'glutton' ? 2 : -1
    let casts = 0
    const skill = g.strainSkill, original = skill.use
    skill.use = () => { casts++; return true }
    try {
      for (const code of ['KeyF', 'ShiftLeft', 'ShiftRight']) key(g, code)
      g._updateStrainSkill(0); assert.equal(casts, 0)
      key(g, 'Space'); g._updateStrainSkill(0); assert.equal(casts, 1)
      key(g, 'Space', true); g._updateStrainSkill(20); assert.equal(casts, 1)
      g.input.suspended = true; key(g, 'Space'); g.input.suspended = false
      g._updateStrainSkill(0); assert.equal(casts, 1)
      key(g, 'Space'); g.input._onBlur(); g._updateStrainSkill(0); assert.equal(casts, 1)
      if (strain !== 'glutton') {
        g.player.strainSkillCd = 1; key(g, 'Space'); g._updateStrainSkill(0)
        g._updateStrainSkill(2); assert.equal(casts, 1)
      }
      g.input._onKeyDown({ code: 'Space', target: { closest: () => ({}) }, preventDefault() { throw Error('button swallowed') } })
      assert.equal(g.input.consumeFever(), false)
    } finally { skill.use = original }
  })
}
check('origin', '震荡伤害、范围、首领不击退、自由构筑联动', g => {
  const e = spawn(g, { x: 70 }), outside = spawn(g, { x: 170 }), boss = spawnBoss(g, 1000)
  const bossX = boss.x, before = e.hp
  pressSpace(g)
  near(e.hp, before - 1.5); near(e.x, g.player.x + 106)
  assert.equal(outside.hp, 100); assert.equal(boss.x, bossX)
  learn(g, 'ass_stride'); learn(g, 'ass_decoy'); learn(g, 'ass_capstone')
  BOSS_SKILL_DATABASE.assassin.find(s => s.id === 'boss_assassin_voidstep').apply(g)
  g.player.strainSkillCd = 0; pressSpace(g)
  near(g.player.strainSkillCd, 8 * 0.85 * 0.65)
  assert.equal(g.player._decoys.length, 1); assert.equal(g.player.guaranteedCrit, true)
  assert.equal(g.player.stealthTimer, 1.5)
  g.reset(); assert.equal(g.player.activeSkillCdMultiplier, 1); assert.equal(g.player._decoys.length, 0)
})
check('ricochet', '疾射无目标不扣冷却；分时四轮、移动增益按时间结束，死亡清理', g => {
  pressSpace(g); assert.equal(g.player.strainSkillCd, 0)
  spawn(g, { x: 700, hp: 10000 })
  const ws = g.weaponSystem, p = g.player
  ws.cooldown = 100
  let shots = 0
  const fire = ws.fire.bind(ws); ws.fire = target => { shots++; fire(target) }
  pressSpace(g); assert.equal(shots, 1); assert.equal(p.volleyMoveTimer, 1)
  ws.update(0.11); assert.equal(shots, 1)
  ws.update(0.02); assert.equal(shots, 2)
  ws.update(0.24); assert.equal(shots, 4); assert.equal(ws.rapidVolley, null)
  const x = p.x; g.input.state.right = true; p.update(0.1)
  near(p.x - x, p.speed * 1.2 * 0.1)
  g.input.state.right = false; p.update(1); assert.equal(p.volleyMoveTimer, 0)
  p.strainSkillCd = 0; pressSpace(g); p.dead = true; ws.update(0.5)
  assert.equal(ws.rapidVolley, null)
})
check('origin', '震荡被自爆反杀后停止后续结算，不留下替身', g => {
  g.player.hp = 1; g.player.shadowDecoyDuration = 2.5
  const bomb = spawn(g, { x: 20, hp: 1, type: 'golem' })
  bomb.affixes = ['explosive']
  const next = spawn(g, { x: 40, hp: 1 })
  pressSpace(g)
  assert.equal(g.player.dead, true)
  assert.equal(next.hp, 1)
  assert.equal(g.weaponSystem.kills, 1)
  assert.equal(g.player._decoys.length, 0)
})
check('elemental', '元素冲击只控制范围内普通敌人，减速实效与过期正确', g => {
  const e = spawn(g, { x: 100 }), far = spawn(g, { x: 180 }), boss = spawnBoss(g, 1000)
  const bossX = boss.x
  pressSpace(g)
  assert.equal(g.player.strainSkillCd, 10); assert.equal(e.primeSlow, 1.5)
  assert.equal(e.hp, 98); near(e.x, g.player.x + 122)
  assert.equal(far.hp, 100); assert.equal(far.primeSlow, 0)
  assert.equal(boss.x, bossX); assert.equal(boss.primeSlow, 0)
  e._tickStatus(1.6); assert.equal(e.primeSlow, 0)
})
check('glutton', '重碾三级范围、护甲成长、资源边界及重置', g => {
  const c = g.weaponSystem.gluttonCombat
  learn(g, 'glut_ram', 3)
  near(c.reach(true), g.player.radius + 68 * 1.3)
  assert.equal(g.player.gluttonGuardDuration, 1.6)
  learn(g, 'glut_bulk', 3); near(g.player.gluttonGuardDuration, 2.8)
  spawn(g); pressSpace(g); assert.equal(c.swing, null)
  g.player.gluttonCharge = 1; pressSpace(g); assert.equal(g.player.gluttonCharge, 0)
  g.reset(); assert.equal(g.player.gluttonHeavyLevel, 0)
})
check('shadow', '影袭结束储存普攻必暴，不被下一次影袭消耗', g => {
  BOSS_SKILL_DATABASE.assassin.find(s => s.id === 'boss_assassin_voidstep').apply(g)
  spawn(g, { hp: 1000 }); pressSpace(g); g.player.update(0.27)
  assert.equal(g.player.guaranteedCrit, true)
  const c = g.weaponSystem.shadowCombat, e = spawn(g, { hp: 1000 })
  c.hit(e, 1, { action: { hitTargets: new Set() } })
  assert.equal(g.player.guaranteedCrit, true)
  c.hit(e, 1, { action: {} }); assert.equal(g.player.guaranteedCrit, false)
})
for (const strain of ['origin', 'glutton', 'ricochet', 'elemental', 'shadow', 'summoner']) {
  check(strain, `${strain}: 旧动能原核有效且幂等，普攻能从碰撞线外清理拒马`, g => {
    const genes = { swift: 2, split: 1, kinetic_origin: 1 }
    applyGenes(g, genes); const speed = g.player.speed
    applyGenes(g, genes); near(g.player.speed, speed); near(speed, 340 * 1.16 * 1.08)
    const p = g.player, barrier = { active: true, hp: 2, hitCooldown: 0, flash: 0,
      xRatio: (p.x + 65) / g.worldWidth, yRatio: p.y / g.worldHeight, angle: Math.PI / 2, length: 150, width: 18 }
    g.mapFeatures.barricades = [barrier]
    g.weaponSystem.update(0.01); assert.equal(barrier.hp, 1)
    g.mapFeatures.update(1.3); g.weaponSystem.update(1.3)
    assert.equal(barrier.active, false)
  })
}
for (let seed = 1; seed <= 60; seed++) {
  const director = new RunnerDirector(seed)
  for (const time of [0, 30, 60, 120, 179]) {
    const row = director.createEncounter(time)
    assert.ok([0, 1, 2].some(lane => !row.some(e => e.lane === lane && e.damage > 0)))
  }
}
console.log(`单主动技能：${checks} 组角色验证 + 300 组突围通路验证通过`)
