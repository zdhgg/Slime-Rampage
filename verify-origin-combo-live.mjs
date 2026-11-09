import assert from 'node:assert/strict'
import { createArena, spawn, spawnBoss, learn, rollSkills, dispose } from './test-support/arena-fixture.mjs'
import { learnOriginMemory, originComboState, nextOriginCast } from './src/game/OriginSourceSkills.js'

function advance(g, seconds) {
  for (let t = 0; t < seconds; t += 0.02) {
    g.elapsed += 0.02
    g.weaponSystem.originCombat.update(0.02)
    g.weaponSystem.originSourceCombat.update(0.02)
    g.weaponSystem.originOverload.update(0.02)
  }
}
const g = createArena('origin')
try {
  g.player.level = 2
  assert.ok(rollSkills(g, 3).some(card => card.id === 'origin_discovery'))
  learn(g, 'origin_discovery')
  assert.deepEqual(originComboState(g).equipped, ['primal_orbit', 'native_wave'])
  spawn(g, { x: 80, hp: 100000 })
  const combat = g.weaponSystem.originSourceCombat
  const casts = []
  const cast = combat.castNow.bind(combat)
  combat.castNow = (entry, snapshot, options) => {
    const result = cast(entry, snapshot, options)
    if (result) casts.push({ id: entry.id, scale: options?.scale ?? 1 })
    return result
  }
  g.player.originEnergy = 40
  advance(g, 1)
  assert.deepEqual(casts, [{ id: 'primal_orbit', scale: 1 }, { id: 'native_wave', scale: 0.6 }])
  assert.ok(g.player.originEnergy < 3, 'one payment; only combat flow added after spending')
  assert.ok(g.weaponSystem.originOverload.cooldown > 4)
  assert.equal(g.configureOriginCombo(['native_wave', 'primal_orbit'], 'native_wave'), false, 'live combat cannot reconfigure')
  g.running = false
  assert.equal(g.configureOriginCombo(['native_wave', 'primal_orbit'], 'native_wave'), true)
  assert.equal(nextOriginCast(g).id, 'native_wave')
  learnOriginMemory(g, 'knight_breach')
  learnOriginMemory(g, 'mage_collapse')
  learnOriginMemory(g, 'archer_hunt')
  assert.equal(originComboState(g).equipped.length, 4)
  assert.equal(g.configureOriginCombo(['native_wave', 'primal_orbit', 'knight_breach', 'mage_collapse', 'archer_hunt'], 'native_wave'), false)
  assert.equal(g.configureOriginCombo(['primal_orbit', 'native_wave', 'knight_breach'], 'primal_orbit'), true)
  learn(g, 'origin_multicast')
  g.running = true
  casts.length = 0
  for (let i = 0; i < 3; i++) {
    g.weaponSystem.originOverload.reset()
    g.player.overloadState.active = false
    g.player.originEnergy = 40
    advance(g, 1.3)
  }
  assert.equal(casts.filter(c => c.scale === 1).length, 3)
  assert.equal(casts.filter(c => c.scale === 0.6).length, 3)
  assert.equal(casts.filter(c => c.scale === 0.4).length, 1)
  assert.equal(new Set(casts.slice(-3).map(c => c.id)).size, 3)
  g.runSelection.mode = 'endless'
  assert.ok(!rollSkills(g, 999).some(card => ['origin_discovery', 'origin_multicast'].includes(card.id)), 'discrete unlocks stay capped in endless')
  g.weaponSystem.originOverload.reset()
  assert.equal(g.weaponSystem.originOverload.auxiliary, null)
  g.reset()
  assert.deepEqual(originComboState(g).equipped, ['primal_orbit'])
  console.log('双/三技能实际释放、单次支付、发现卡、暂停配置和重开清理通过')
} finally { dispose(g) }

const h = createArena('origin')
try {
  learn(h, 'origin_discovery')
  spawnBoss(h, 100000)
  h.player.originEnergy = 40
  advance(h, 0.4)
  assert.ok(h.weaponSystem.originOverload.auxiliary)
  h.running = false
  assert.equal(h.configureOriginCombo(['primal_orbit'], 'primal_orbit'), true)
  h.running = true
  advance(h, 0.5)
  assert.equal(h.originSourceLastAuxiliary?.id, 'native_wave', 'paid combo retains its original loadout')
  assert.deepEqual(originComboState(h).equipped, ['primal_orbit'])
  assert.deepEqual(originComboState(h).bag, [])
  h.weaponSystem.originOverload.reset()
  h.player.overloadState.active = false
  h.player.originEnergy = 40
  h.weaponSystem.originOverload.update(0.02)
  assert.equal(h.weaponSystem.originOverload.state, 'windup')
  h.running = false
  assert.equal(h.configureOriginCombo(['native_wave'], 'native_wave'), true)
  assert.equal(h.weaponSystem.originOverload.pending, null)
  assert.ok(h.player.originEnergy >= 40, 'cancelled unpaid windup preserves energy')
  console.log('连招中途修改配置与未支付启动取消通过')
} finally { dispose(h) }
