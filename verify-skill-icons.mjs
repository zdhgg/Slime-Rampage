import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { SKILL_DATABASE, BOSS_SKILL_DATABASE, SPEC_INFO, rollSkills } from './src/game/SkillPool.js'
import { RICOCHET_SKILLS, RICOCHET_BOSS_SKILLS, RICOCHET_ROUTES } from './src/game/RicochetRules.js'
import { GLUTTON_ROUTE_SKILLS, GLUTTON_ENDLESS_SKILL, GLUTTON_ROUTES } from './src/game/GluttonBuild.js'
import { SYMBIOSIS_ROUTE_SKILLS, SYMBIOSIS_ROUTES } from './src/game/SymbiosisBuild.js'
import { SHADOW_ROUTE_SKILLS, SHADOW_ROUTES } from './src/game/ShadowBuild.js'
import { ELEMENTAL_ROUTE_SKILLS, ELEMENTAL_ROUTES } from './src/game/ElementalBuild.js'
import { ELEMENTAL_SKILLS, SPELL_ELEMENT_IDS, SPELL_FUSIONS, spellCoreOptions, spellMilestoneReward, getSpellFusion } from './src/game/SpellRules.js'
import { ENDLESS_SKILLS } from './src/game/EndlessSkills.js'
import { createArena, dispose } from './test-support/arena-fixture.mjs'
import { resolveSkillIcon, skillIconKey, routeIconId, SKILL_ICON_KEYS, SKILL_ICON_GLYPHS, SKILL_ICON_NEUTRAL } from './src/components/skillIconRegistry.js'

const treeSkills = Object.values(SKILL_DATABASE).flatMap(tree => Array.isArray(tree) ? tree : [...tree.primary, ...tree.secondary])
const authored = [...treeSkills, ...Object.values(BOSS_SKILL_DATABASE).flat(), ...RICOCHET_SKILLS, ...RICOCHET_BOSS_SKILLS,
  ...GLUTTON_ROUTE_SKILLS, GLUTTON_ENDLESS_SKILL, ...SYMBIOSIS_ROUTE_SKILLS, ...SHADOW_ROUTE_SKILLS, ...ELEMENTAL_SKILLS, ...ELEMENTAL_ROUTE_SKILLS, ...ENDLESS_SKILLS]
const covered = new Set()
function check(skill) {
  const visual = resolveSkillIcon(skill)
  assert.equal(visual.missing, false, `${skill.id}: missing registered vector icon`)
  covered.add(skill.id)
  return visual
}
for (const skill of authored) check(skill)
for (const [id, key] of Object.entries(SKILL_ICON_KEYS)) assert.ok(SKILL_ICON_GLYPHS[key], `${id} references unknown semantic key ${key}`)

// Same names and intentional aliases preserve glyph identity across independently balanced skill IDs.
const byName = new Map()
for (const skill of authored) {
  const name = skill.name.replace(/^🌟\s*/, '')
  if (byName.has(name)) assert.equal(skillIconKey(skill), byName.get(name), `${name}: same name must retain the same glyph`)
  else byName.set(name, skillIconKey(skill))
}
for (const pair of [['com_vital', 'rico_vitality'], ['gat_multishot', 'rico_multishot'], ['gat_velocity', 'rico_velocity'],
  ['pet_partner', 'boss_pet_partner'], ['pet_dew_partner', 'boss_pet_dew_partner'], ['pet_spore_partner', 'boss_pet_spore_partner'],
  ['com_shock', 'slime_shock'], ['ele_single_ultimate', 'elemental_single'], ['ele_fusion_ultimate', 'elemental_fusion'], ['ele_cycle_ultimate', 'elemental_cycle']]) {
  assert.equal(skillIconKey(pair[0]), skillIconKey(pair[1]), `${pair}: intentional semantic aliases`)
}

// Exercise real generators: a strain presentation flag must never reskin a shared skill.
for (const strain of ['origin', 'ricochet', 'glutton', 'summoner', 'elemental', 'shadow']) {
  const game = createArena(strain)
  try {
    const cards = rollSkills(game, 999)
    for (const skill of cards) {
      const visual = check(skill)
      const baseline = resolveSkillIcon(skill.id)
      assert.equal(visual.key, baseline.key, `${strain}/${skill.id}: stable identity`)
      if (skill.id.startsWith('com_')) assert.equal(visual.color, SKILL_ICON_NEUTRAL, `${strain}/${skill.id}: shared neutral styling`)
    }
    if (strain === 'shadow') assert.ok(cards.find(skill => skill.id === 'com_vital')?.isShadowSkill, 'regression fixture includes shadow presentation flag')
    if (strain !== 'ricochet') assert.ok(cards.some(skill => skill.id === 'com_vital'), `${strain}: common vitality is exercised`)
    else assert.ok(cards.some(skill => skill.id === 'rico_vitality'), 'ricochet vitality alias is exercised')
  } finally { dispose(game) }
}

// All dynamic first-spell, fusion, evolution and boss-core rewards use registered IDs.
for (let mask = 0; mask < 16; mask++) {
  const elements = new Set(SPELL_ELEMENT_IDS.filter((_, i) => mask & (1 << i)))
  for (const rank of [0, 2, 3]) {
    const fusion = getSpellFusion(elements)
    const combat = { available: true, elements, activeElements: [...elements], fusion, player: { level: 15 },
      rank: () => rank, palette: () => ({ main: '#abc' }), cores: 3, lightning: { storm: false } }
    for (const card of [...spellCoreOptions(combat), ...(spellMilestoneReward(combat)?.options || [])]) check(card)
  }
}
for (const element of SPELL_ELEMENT_IDS) {
  for (const prefix of ['spell_learn_', 'spell_fuse_', 'ele_discover_', 'shape_']) {
    assert.equal(skillIconKey(prefix + element), skillIconKey(element), `${prefix}${element}: consistent elemental identity`)
  }
}
for (const fusion of SPELL_FUSIONS) check({ id: `fusion_${fusion.id}` })
for (const [spec, routes] of Object.entries({ gatling: RICOCHET_ROUTES, gluttony: GLUTTON_ROUTES, symbiosis: SYMBIOSIS_ROUTES, assassin: SHADOW_ROUTES, elemental: ELEMENTAL_ROUTES })) {
  for (const route of Object.values(routes)) {
    const visual = check({ id: routeIconId(spec, route.id), spec, route: route.id })
    assert.equal(visual.color, route.color, `${spec}/${route.id}: route and HUD share the authored color`)
  }
}
for (const spec of Object.keys(SPEC_INFO)) check({ id: routeIconId(spec) })
assert.equal(resolveSkillIcon('unknown_future_skill').missing, true, 'unknown ID stays detectable instead of using emoji')

// Prevent accidental return of the legacy character-specific / emoji render path.
for (const name of ['LevelUpModal', 'SpellCoreModal', 'HudOverlay', 'FusionConfirmModal', 'RicochetRouteChoice', 'GluttonRouteChoice', 'SymbiosisRouteChoice', 'ShadowRouteChoice', 'ElementalRouteChoice']) {
  const source = await fs.readFile(`src/components/${name}.vue`, 'utf8')
  assert.match(source, /import SkillIcon from/, `${name}: shared renderer`)
  assert.doesNotMatch(source, /\{\{[^}]*\b(?:s|option|el|c|info|stats\.[a-z]+)\.icon\b[^}]*\}\}/, `${name}: no emoji icon interpolation`)
  assert.doesNotMatch(source, /import (?:Ricochet|Glutton|Symbiosis|Shadow|Elemental|Active)SkillIcon/, `${name}: no strain rendering branches`)
}
console.log(`统一技能图标验证通过：${covered.size} 个技能/奖励/路线；六角色公共图标、同名别名、动态法术奖励与旧渲染入口防回归 ✓`)
