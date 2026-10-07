import assert from 'node:assert/strict'
import { simulate, createSimulation, standardLine } from './tower-defense-simulation.mjs'

const formations = [
  [['shock','overload'],['shock','overload'],['rapid','sniper'],['spore','solvent'],['blast','burn-zone']],
  [['blast','burn-zone'],['shock','overload'],['rapid','sniper'],['spore','bloom'],['radiant','sanctuary']],
  [['shock','overload'],['rapid','sniper'],['spore','solvent'],['blast','heavy-shell'],['beacon','silence'],['radiant','sanctuary'],['arcane','void-rift'],['ballista','lance']],
  [['shock','overload'],['rapid','sniper'],['arcane','void-rift'],['radiant','sanctuary']],
  [['shock','hyper-beam'],['shock','overload'],['spore','solvent'],['slow','ice-chain']],
  [['shock','overload'],['beacon','expose'],['rapid','sniper'],['spore','bloom'],['radiant','sanctuary'],['ballista','lance']],
  [['beacon','expose'],['shock','overload'],['rapid','sniper'],['ballista','skewer'],['radiant','sanctuary'],['arcane','void-rift']],
  [['ballista','lance'],['shock','overload'],['beacon','expose'],['spore','solvent'],['radiant','sanctuary'],['arcane','void-rift']],
  [['shock','overload'],['ballista','lance'],['beacon','silence'],['spore','solvent'],['radiant','sanctuary'],['arcane','void-rift']],
]
const failed = [], report = []
for (let stage = 1; stage <= 99; stage++) {
  const lines = [standardLine(stage), ...formations]
  let best
  for (const line of lines) {
    const result = simulate(stage, { line, traps: true })
    assert.ok(result.outcome, `Stage ${stage} must settle within the simulation budget`)
    if (!best || result.hp > best.hp) best = result
    if (result.hp >= 16) break
  }
  if (best.outcome !== 'victory') failed.push(stage)
  if ([1,5,10,15,20,40,60,80,99].includes(stage)) report.push({ stage, hp:best.hp, towers:best.maxTowers, gold:best.gold })
}
console.table(report)
console.log('Stages without a winning reference formation:', failed)

const gp = createSimulation(15), slots = [...gp.unlockedSlots]
gp.destroy()
const types = [['rapid','sniper'],['rapid','gatling'],['blast','heavy-shell'],['shock','hyper-beam'],['shock','overload'],['arcane','void-rift']]
let singleWins=0, doubleWins=0, doubleCount=0
for (const slot of slots) for (const type of types) {
  if (simulate(15,{plan:[[slot,...type]]}).hp>0) singleWins++
}
for(let i=0;i<slots.length;i++) for(let j=i+1;j<slots.length;j++) for(const a of types) for(const b of types) {
  const result=simulate(15,{plan:[[slots[i],...a],[slots[j],...b]]})
  doubleCount++
  if(result.hp>0) doubleWins++
}
console.log(`Stage 15: single tower ${singleWins}/${slots.length*types.length}; two towers ${doubleWins}/${doubleCount}`)
assert.deepEqual(failed, [], 'Every campaign stage must have a winning formation using normal economy')
assert.equal(singleWins,0,'A single damage tower must not clear stage 15')
assert.ok(doubleWins/doubleCount < .35,'Most unattended two-tower placements must fail')
assert.equal(simulate(15,{line:[['rapid','gatling'],['blast','heavy-shell']]}).outcome,'defeat','The old rapid/cannon strategy must require reinforcements')
for(const stage of [1,15,40,60,80,99]) assert.equal(simulate(stage,{line:[]}).outcome,'defeat')
console.log('Tower defense balance verification passed')
