import assert from 'node:assert/strict'
import { createOriginComboState, reconcileOriginCombo, setOriginComboLoadout, drawOriginAuxiliary } from './src/game/OriginCombo.js'

const state = createOriginComboState()
const known = ['wave', 'rain', 'collapse']
assert.equal(setOriginComboLoadout(state, ['primal_orbit', ...known], 'wave', known), true)
const result = Array.from({ length: 3 }, () => drawOriginAuxiliary(state, () => true, () => 0.5))
assert.deepEqual(new Set(result), new Set(['primal_orbit', 'rain', 'collapse']))
assert.equal(setOriginComboLoadout(state, ['primal_orbit', ...known], 'wave', known), true)
const picked = drawOriginAuxiliary(state, id => id === 'rain', () => 0.5)
assert.equal(picked, 'rain')
assert.equal(drawOriginAuxiliary(state, () => false), null)
assert.deepEqual(new Set(state.bag), new Set(['primal_orbit', 'collapse']))
assert.equal(drawOriginAuxiliary(state, id => id === 'collapse'), 'collapse')
assert.equal(drawOriginAuxiliary(state, () => true), 'primal_orbit')
assert.equal(setOriginComboLoadout(state, ['unknown'], 'unknown', known), false)
const migrated = reconcileOriginCombo({ main: 'missing', equipped: ['missing', 'rain'], bag: ['missing', 'rain'] }, known)
assert.equal(migrated.main, 'rain')
assert.deepEqual(migrated.bag, [])
assert.deepEqual(reconcileOriginCombo(null, known).equipped, ['primal_orbit'])
console.log('原生超载配置与随机协同选择通过')
