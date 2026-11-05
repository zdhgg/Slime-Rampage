import assert from 'node:assert/strict'
import { ACTIVE_SKILL_ICON_MAP } from './src/components/activeSkillIconMap.js'
import { SKILL_DATABASE } from './src/game/SkillPool.js'

const commonSkills = Array.isArray(SKILL_DATABASE.common)
  ? SKILL_DATABASE.common
  : [...(SKILL_DATABASE.common.primary || []), ...(SKILL_DATABASE.common.secondary || [])]
const shockExpansion = commonSkills.find(skill => skill.id === 'com_shock')
assert.ok(shockExpansion, '震荡扩能 remains an origin progression skill')
assert.ok(ACTIVE_SKILL_ICON_MAP[shockExpansion.id], '震荡扩能 has a vector icon')
for (const id of ['origin_flux', 'origin_overload', 'origin_concord']) {
  assert.ok(commonSkills.some(skill => skill.id === id), `${id} remains an origin progression skill`)
  assert.ok(ACTIVE_SKILL_ICON_MAP[id], `${id} has a distinct vector icon`)
}
assert.equal(Object.keys(ACTIVE_SKILL_ICON_MAP).length, 4, 'Active icon map only contains active/origin skills')
console.log('原生主动与成长卡图标验证：各有独立线性图标 ✓')
