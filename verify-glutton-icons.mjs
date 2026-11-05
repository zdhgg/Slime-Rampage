import assert from 'node:assert/strict'
import { GLUTTON_ICON_COLORS, GLUTTON_ICON_MAP, GLUTTON_ICON_ROUTES } from './src/components/gluttonIconMap.js'
import { GLUTTON_ENDLESS_SKILL, GLUTTON_ROUTE_SKILLS, GLUTTON_ROUTES } from './src/game/GluttonBuild.js'
import { SKILL_DATABASE } from './src/game/SkillPool.js'

const authored = [
  ...(SKILL_DATABASE.gluttony.primary || []),
  ...(SKILL_DATABASE.gluttony.secondary || []),
  ...GLUTTON_ROUTE_SKILLS,
  GLUTTON_ENDLESS_SKILL,
]
const ids = authored.map(skill => skill.id)
assert.equal(new Set(ids).size, ids.length, 'Glutton skill ids must be unique')
for (const id of ids) assert.ok(GLUTTON_ICON_MAP[id], `${id} must have a dedicated icon`)
assert.equal(new Set(Object.values(GLUTTON_ICON_MAP)).size, ids.length, 'Every glutton skill uses a unique Lucide silhouette')
assert.equal(Object.keys(GLUTTON_ICON_MAP).length, ids.length, 'Icon map must not contain stale entries')
for (const [route, definition] of Object.entries(GLUTTON_ROUTES)) {
  assert.equal(GLUTTON_ICON_COLORS[route], definition.color, `${route} icon color must match route color`)
  const family = authored.filter(skill => GLUTTON_ICON_ROUTES[skill.id] === route)
  assert.ok(family.length >= 3, `${route} family must contain multiple skills`)
  assert.equal(new Set(family.map(skill => GLUTTON_ICON_MAP[skill.id])).size, family.length)
}
console.log(`暴食图标验证：${ids.length} 张技能各有独立 Lucide 图标，三条路线色与规则定义一致 ✓`)
