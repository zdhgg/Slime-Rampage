import assert from 'node:assert/strict'
import { SYMBIOSIS_ICON_COLORS, SYMBIOSIS_ICON_MAP, SYMBIOSIS_ICON_ROUTES } from './src/components/symbiosisIconMap.js'
import { PET_SKILLS } from './src/game/PetSkills.js'
import { SYMBIOSIS_ROUTE_SKILLS, SYMBIOSIS_ROUTES } from './src/game/SymbiosisBuild.js'

const authored = [...(PET_SKILLS.primary || []), ...(PET_SKILLS.secondary || []), ...SYMBIOSIS_ROUTE_SKILLS]
const ids = authored.map(skill => skill.id)
assert.equal(new Set(ids).size, ids.length, '共生技能 id 必须唯一')
for (const id of ids) assert.ok(SYMBIOSIS_ICON_MAP[id], `${id} 必须有独立图标`)
assert.equal(new Set(ids.map(id => SYMBIOSIS_ICON_MAP[id])).size, ids.length, '不同共生技能必须使用不同图标')
for (const [route, definition] of Object.entries(SYMBIOSIS_ROUTES)) {
  assert.equal(SYMBIOSIS_ICON_COLORS[route], definition.color, `${route} 路线颜色需与规则一致`)
  const family = authored.filter(skill => SYMBIOSIS_ICON_ROUTES[skill.id] === route)
  assert.ok(family.length >= 4, `${route} 路线至少包含入口、进阶和终极图标`)
}
console.log(`共生图标验证：${ids.length} 张技能均有独立图标，三条路线色与规则一致 ✓`)
