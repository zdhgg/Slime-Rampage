import assert from 'node:assert/strict'
import { RICOCHET_ICON_MAP, RICOCHET_ROUTE_COLORS } from './src/components/ricochetIconMap.js'
import { RICOCHET_SKILLS, RICOCHET_BOSS_SKILLS, RICOCHET_ROUTES } from './src/game/RicochetRules.js'

const ids = [...RICOCHET_SKILLS, ...RICOCHET_BOSS_SKILLS].map(skill => skill.id)
assert.equal(new Set(ids).size, ids.length, 'Skill ids must be unique')
for (const id of ids) assert.ok(RICOCHET_ICON_MAP[id], `${id} must have a dedicated icon`)
const iconComponents = Object.values(RICOCHET_ICON_MAP)
assert.equal(new Set(iconComponents).size, ids.length, 'Every ricochet and boss skill uses a unique Lucide silhouette')
assert.equal(Object.keys(RICOCHET_ICON_MAP).length, ids.length, 'Icon map must not contain stale entries')
for (const [route, definition] of Object.entries(RICOCHET_ROUTES)) assert.equal(RICOCHET_ROUTE_COLORS[route], definition.color)
assert.ok(!Object.values(RICOCHET_ROUTES).some(route => route.color === RICOCHET_ROUTE_COLORS.common), 'Public upgrades remain neutral rather than borrowing a route color')
for (const route of Object.keys(RICOCHET_ROUTES)) {
  const family = RICOCHET_SKILLS.filter(skill => skill.route === route)
  assert.ok(family.length >= 5, `${route} family contains its seed, advances, rare card, and ultimate`)
  assert.equal(new Set(family.map(skill => RICOCHET_ICON_MAP[skill.id])).size, family.length)
}
console.log(`弹射图标验证：${ids.length} 张技能各有独立图标，3 条路线色与规则定义一致 ✓`)
