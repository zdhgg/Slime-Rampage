import assert from 'node:assert/strict'
import { SKILL_DATABASE } from './src/game/SkillPool.js'
import { SHADOW_ROUTE_SKILLS } from './src/game/ShadowBuild.js'
import { SHADOW_ICON_COLORS, SHADOW_ICON_MAP, SHADOW_ICON_ROUTES } from './src/components/shadowIconMap.js'

const shadowIds = [...new Set([
  ...SKILL_DATABASE.assassin.primary.map(skill => skill.id),
  ...SHADOW_ROUTE_SKILLS.map(skill => skill.id),
])]
const missing = shadowIds.filter(id => !SHADOW_ICON_MAP[id])
assert.deepEqual(missing, [], `暗影技能缺少线性图标：${missing.join(', ')}`)
const mapped = shadowIds.map(id => SHADOW_ICON_MAP[id])
assert.equal(new Set(mapped).size, mapped.length, '暗影技能图标应各自有独立轮廓')
for (const route of ['hunt', 'swarm', 'blade']) assert.ok(SHADOW_ICON_COLORS[route], `${route} 路线需要颜色`)
for (const [id, route] of Object.entries(SHADOW_ICON_ROUTES)) assert.ok(SHADOW_ICON_COLORS[route], `${id} 指向未知路线 ${route}`)
console.log(`暗影图标验证通过：${shadowIds.length} 个技能均有独立 Lucide 图标`)
