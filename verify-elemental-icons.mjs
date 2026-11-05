import assert from 'node:assert/strict'
import { ELEMENTAL_ICON_MAP, ELEMENTAL_ICON_COLORS } from './src/components/elementalIconMap.js'
import { ELEMENTAL_ROUTE_SKILLS, ELEMENTAL_ROUTES } from './src/game/ElementalBuild.js'
import { ELEMENTAL_SKILLS } from './src/game/SpellRules.js'

const skills = [...ELEMENTAL_SKILLS, ...ELEMENTAL_ROUTE_SKILLS]
const ids = skills.map(skill => skill.id)
assert.equal(new Set(ids).size, ids.length, '元素技能 id 必须唯一')
for (const skill of skills) assert.ok(ELEMENTAL_ICON_MAP[skill.id], `${skill.id} 必须有图标`)
assert.equal(new Set(ids.map(id => ELEMENTAL_ICON_MAP[id])).size, ids.length, '元素技能必须使用独立图标')
for (const [route, definition] of Object.entries(ELEMENTAL_ROUTES)) assert.ok(ELEMENTAL_ICON_COLORS[route] === definition.color)
console.log(`元素图标验证：${ids.length} 张技能均有独立图标，三条路线色与规则一致 ✓`)
