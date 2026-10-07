import assert from 'node:assert/strict'
import { createArena, spawn, spawnBoss, dispose } from './test-support/arena-fixture.mjs'

let count = 0
function check(name, run) {
  const g = createArena('shadow')
  try { run(g, g.weaponSystem.shadowCombat.clones); console.log(`✓ ${++count}. ${name}`) }
  finally { dispose(g) }
}
check('法师射程外圈可被发现，远距追击在分身寿命内造成真实伤害', (g, cs) => {
  const front = spawn(g, { x: 40 }), mage = spawn(g, { x: 340, type: 'mage' })
  const c = cs.createAt(g.player, 0, front)
  assert.equal(cs.nearest(c), mage)
  for (let i = 0; i < 90; i++) cs.update(1 / 60)
  assert.ok(mage.hp < 100)
  assert.equal(front.hp, 100)
})
check('近战挡路不抢走分身普攻的射手命中', (g, cs) => {
  const front = spawn(g, { x: 30 }), mage = spawn(g, { x: 85, type: 'mage' })
  const c = cs.createAt(g.player, 0, mage)
  cs.update(0.01); cs.update(0.16)
  assert.equal(front.hp, 100); assert.ok(mage.hp < 100)
})
check('影袭首击前排时分派不同后排；三名近战不能耗尽射手命中名额', (g, cs) => {
  const front = [35, 65, 95, 125].map(x => spawn(g, { x }))
  const mages = [0, 75].map(y => spawn(g, { x: 340, y, type: 'mage' }))
  const a = cs.createAt(g.player, 0), b = cs.createAt(g.player, 0)
  cs.command(front[0], new Set([a.id, b.id]))
  assert.notEqual(a.target, b.target)
  assert.ok(mages.includes(a.target) && mages.includes(b.target))
  for (let i = 0; i < 35; i++) cs.update(1 / 60)
  assert.ok(mages.every(e => e.hp < 100))
})
check('首领指令保持集火，墙后射手与过远目标不被隔墙锁定', (g, cs) => {
  const boss = spawnBoss(g), mage = spawn(g, { x: 340, type: 'mage' })
  const c = cs.createAt(g.player, 0)
  cs.command(boss, new Set([c.id])); assert.equal(c.target, boss)
  g.mapFeatures.resolvePlayerMovement = (probe,x,y) => { probe.x=x; probe.y=y; return true }
  assert.equal(cs.rangedTarget(c), null)
  g.mapFeatures.resolvePlayerMovement = () => false
  mage.x = g.player.x + 600; assert.equal(cs.rangedTarget(c), null)
})

// 固定前排与后排的对照：旧 220px 搜敌/前排集火规则 vs 新规则。
function pressure(legacy) {
  const g = createArena('shadow'), cs = g.weaponSystem.shadowCombat.clones
  try {
    g.player.shadowClonePowerLevel = 3
    const front = [40, 70, 100, 130].map(x => spawn(g, {x, hp:10000}))
    const mages = [-90,-30,30,90].map(y => spawn(g, {x:340, y, hp:4, type:'mage'}))
    for (let i=0;i<4;i++) cs.createAt({x:g.player.x,y:g.player.y+(i-1.5)*25},0,front[0])
    if (legacy) {
      cs.rangedTarget = () => null // nearest 中保留的旧 220px 分支。
      const command = cs.command.bind(cs)
      cs.command = (target, ids) => command(target, ids)
    }
    cs.command(front[0], new Set(cs.items.map(c=>c.id)))
    for(let i=0;i<180;i++) cs.update(1/60)
    return { killed: mages.filter(e=>!e.active).length, damage: mages.reduce((n,e)=>n+4-Math.max(0,e.hp),0) }
  } finally { dispose(g) }
}
const before=pressure(true), after=pressure(false)
assert.ok(after.killed > before.killed)
assert.ok(after.damage > before.damage)
console.log('前排遮挡／340px 四法师／3 秒分身输出对照', {before,after})
