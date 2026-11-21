// 批量自检：六血统全部技能从 Lv.0 到有效 maxLevel 的 stats 输出不得出现 undefined/NaN/Infinity。
import assert from 'node:assert/strict'
import { SKILL_DATABASE } from './src/game/SkillPool.js'
import { PET_SKILLS } from './src/game/PetSkills.js'
import { RICOCHET_SKILLS } from './src/game/RicochetRules.js'
import { GLUTTON_ROUTE_SKILLS } from './src/game/GluttonBuild.js'
import { SHADOW_ROUTE_SKILLS } from './src/game/ShadowBuild.js'
import { ELEMENTAL_ROUTE_SKILLS } from './src/game/ElementalBuild.js'
import { ELEMENTAL_SKILLS } from './src/game/SpellRules.js'
import { ORIGIN_ALL_SKILLS } from './src/game/OriginBuild.js'
import { SYMBIOSIS_ROUTE_SKILLS } from './src/game/SymbiosisBuild.js'
import { SHADOW_EXTRA_SKILLS } from './src/game/ShadowSkills.js'

const pools = {
  common: SKILL_DATABASE.common,
  glutton: [...SKILL_DATABASE.gluttony.primary, ...SKILL_DATABASE.gluttony.secondary],
  gatling: [...SKILL_DATABASE.gatling.primary, ...SKILL_DATABASE.gatling.secondary],
  elementalTree: [...SKILL_DATABASE.elemental.primary, ...SKILL_DATABASE.elemental.secondary],
  assassin: [...SKILL_DATABASE.assassin.primary, ...SKILL_DATABASE.assassin.secondary, ...SHADOW_EXTRA_SKILLS],
  summoner: [...PET_SKILLS.primary, ...PET_SKILLS.secondary],
  ricochet: RICOCHET_SKILLS,
  gluttonRoute: GLUTTON_ROUTE_SKILLS,
  shadowRoute: SHADOW_ROUTE_SKILLS,
  elementalCards: [...ELEMENTAL_SKILLS, ...ELEMENTAL_ROUTE_SKILLS],
  origin: ORIGIN_ALL_SKILLS,
  symbiosisRoute: SYMBIOSIS_ROUTE_SKILLS,
}

let checked = 0, problems = []
for (const [pool, skills] of Object.entries(pools)) {
  for (const skill of skills) {
    const cap = Number.isFinite(skill.maxLevel) ? skill.maxLevel : 12
    if (typeof skill.stats !== 'function') continue
    const stub = {
      skillLevels: {},
      weaponSystem: { projectileCount: 1, projectileSpeed: 400, damage: 10, fireInterval: 0.6, ricochetCombat: {}, shadowCombat: {}, petCombat: {}, spellCombat: {}, gluttonCombat: {} },
      player: { maxHp: 5, hp: 5, speed: 300, pickupRadius: 230, activeSkillCdMultiplier: 1, level: 10 },
      runSelection: { mode: 'timed', difficulty: 'normal' },
    }
    for (let lv = 0; lv < cap; lv++) {
      const text = String(skill.stats(lv, stub))
      checked++
      if (/undefined|NaN|Infinity/.test(text)) problems.push(`${pool}.${skill.id} Lv.${lv + 1} → ${text}`)
    }
  }
}
assert.deepEqual(problems, [], problems.join('\n'))
console.log(`等级区间扫描通过：${checked} 个 stats 输出无 undefined/NaN/Infinity`)
