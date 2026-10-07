import assert from 'node:assert/strict'
import { createSimulation, simulate } from './tower-defense-simulation.mjs'

const sizes = [{ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 844, height: 390 }]
for (let stage = 1; stage <= 99; stage++) {
  const gp = createSimulation(stage), anchors = gp.buildSlots, coordinates = structuredClone(anchors)
  for (const size of sizes) {
    Object.assign(gp.game, size)
    gp.renderer.ensureLayout()
    assert.equal(gp.buildSlots, anchors, 'Resizing must never replace the combat coordinates')
    assert.deepEqual(gp.buildSlots, coordinates)
    for (const [index, slot] of anchors.entries()) {
      const p = gp.renderer.project(slot)
      assert.equal(gp.renderer.getSlotIndexAt(p.x, p.y), index, `Stage ${stage}: every platform is selectable`)
      const logical = gp.renderer.unproject(p.x, p.y)
      assert.ok(Math.hypot(slot.x - logical.x, slot.y - logical.y) < 1e-12)
    }
  }
  gp.destroy()
  const baseline = simulate(stage, { traps: true })
  for (const viewport of sizes.slice(1)) {
    assert.deepEqual(simulate(stage, { traps: true, plan: baseline.plan, viewport }), baseline,
      `Stage ${stage}: dimensions cannot change combat, income or wave timing`)
  }
  if ([1, 18, 39, 74, 81, 86, 99].includes(stage)) {
    assert.deepEqual(simulate(stage, { traps: true, plan: baseline.plan,
      resizeAt: [{ seconds: 8, ...sizes[1] }, { seconds: 25, ...sizes[2] }, { seconds: 60, ...sizes[0] }],
    }), baseline, `Stage ${stage}: rotating during combat cannot affect the result`)
  }
}
console.log('✓ All 99 stages: identical combat across three viewports, live resizing and stable slot hit targets')
