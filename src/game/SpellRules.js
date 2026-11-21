/** Elemental Slime v2 rules, Lv.2 school selection, and compatibility helpers. */
import {
  ELEMENTAL_SCHOOL_IDS,
  ELEMENTAL_SCHOOLS,
  schoolToElement,
  elementToSchool,
  normalizeSpellSchool,
} from './ElementalSchools.js'
import { ELEMENTAL_ALL_BASE_SKILLS } from './ElementalUpgrades.js'
import { BASE_SPELL_PALETTES, FUSION_SPELL_PALETTES } from './SpellPalette.js'

export const SPELL_ELEMENTS = Object.freeze({
  fire: {
    id: 'fire', school: 'fire', name: '火焰', icon: '🔥', color: BASE_SPELL_PALETTES.fire.main,
    spell: ELEMENTAL_SCHOOLS.fire.primarySpell.name, interval: ELEMENTAL_SCHOOLS.fire.primarySpell.interval,
    desc: ELEMENTAL_SCHOOLS.fire.primarySpell.desc,
  },
  water: {
    id: 'water', school: 'ice', name: '寒冰', icon: '❄️', color: BASE_SPELL_PALETTES.water.main,
    spell: ELEMENTAL_SCHOOLS.ice.primarySpell.name, interval: ELEMENTAL_SCHOOLS.ice.primarySpell.interval,
    desc: ELEMENTAL_SCHOOLS.ice.primarySpell.desc,
  },
  lightning: {
    id: 'lightning', school: 'lightning', name: '雷电', icon: '⚡', color: BASE_SPELL_PALETTES.lightning.main,
    spell: ELEMENTAL_SCHOOLS.lightning.primarySpell.name, interval: ELEMENTAL_SCHOOLS.lightning.primarySpell.interval,
    desc: ELEMENTAL_SCHOOLS.lightning.primarySpell.desc,
  },
  poison: {
    id: 'poison', school: 'poison', name: '毒素', icon: '☠️', color: BASE_SPELL_PALETTES.poison.main,
    spell: ELEMENTAL_SCHOOLS.poison.primarySpell.name, interval: ELEMENTAL_SCHOOLS.poison.primarySpell.interval,
    desc: ELEMENTAL_SCHOOLS.poison.primarySpell.desc,
  },
})

export const SPELL_ELEMENT_IDS = Object.freeze(Object.keys(SPELL_ELEMENTS))
export const normalizeSpellElement = id => SPELL_ELEMENTS[schoolToElement(id)] ? schoolToElement(id) : 'fire'

// Legacy fusion table retained only for compatibility imports (Elemental v2 uses 4 pure schools).
export const SPELL_FUSIONS = Object.freeze([
  { id: 'steam', combo: ['fire', 'water'], name: '霜火碎裂', active: '霜火爆裂', evolved: '霜焰新星', color: FUSION_SPELL_PALETTES.steam.main, palette: FUSION_SPELL_PALETTES.steam, mutation: 'steam', species: '霜火碎裂史莱姆', desc: '霜火碎裂' },
  { id: 'gel', combo: ['lightning', 'water'], name: '雷霜传导', active: '雷霜风暴', evolved: '极寒雷暴', color: FUSION_SPELL_PALETTES.gel.main, palette: FUSION_SPELL_PALETTES.gel, mutation: 'gel', species: '雷霜传导史莱姆', desc: '雷霜传导' },
  { id: 'acid', combo: ['fire', 'poison'], name: '火毒爆燃', active: '爆燃领域', evolved: '灾炎领域', color: FUSION_SPELL_PALETTES.acid.main, palette: FUSION_SPELL_PALETTES.acid, mutation: 'acid', species: '火毒爆燃史莱姆', desc: '火毒爆燃' },
  { id: 'venom', combo: ['lightning', 'poison'], name: '毒电连锁', active: '毒雷风暴', evolved: '瘟雷领域', color: FUSION_SPELL_PALETTES.venom.main, palette: FUSION_SPELL_PALETTES.venom, mutation: 'venom', species: '毒电连锁史莱姆', desc: '毒电连锁' },
  { id: 'corrode', combo: ['water', 'poison'], name: '寒疫侵蚀', active: '寒疫领域', evolved: '永冻瘟疫', color: FUSION_SPELL_PALETTES.corrode.main, palette: FUSION_SPELL_PALETTES.corrode, mutation: 'corrode', species: '寒疫侵蚀史莱姆', desc: '寒疫侵蚀' },
  { id: 'burst', combo: ['fire', 'lightning'], name: '雷火爆发', active: '雷火轰击', evolved: '天罚雷炎', color: FUSION_SPELL_PALETTES.burst.main, palette: FUSION_SPELL_PALETTES.burst, mutation: 'storm', species: '雷火爆发史莱姆', desc: '雷火爆发' },
])
export const getSpellFusion = () => null

export const ELEMENTAL_SPEC_INFO = Object.freeze({
  name: '四系魔导',
  desc: '火焰 · 寒冰 · 雷电 · 毒素四大独立专精 × 跨系基础法术书',
  bonus: 'Lv.2 定主修专精与特色护盾 · 局内可兼修最多 2 门跨系基础法术 · 中期双分支升华',
  roadmap: [
    'Lv.2：火 / 冰 / 电 / 毒四选一定系（切换主法术、专属护盾与空格大招）',
    'Lv.3+：零稀释主系循环成长 ＋ 可选跨系基础法术（至多 2 门）',
    '第 6 波／第 3 章：本系双分支升华，赠核心大法术并解锁高阶进阶',
    'Lv.14＋投入达标：随机觉醒分支互斥终极',
  ],
})

export const ELEMENTAL_SKILLS = ELEMENTAL_ALL_BASE_SKILLS

export function resolveElementalSkill(skill, game) {
  if (game?.startingStrain !== 'elemental') return skill
  const base = ELEMENTAL_SKILLS.find(s => s.id === skill?.id) || skill
  if (!base) return skill
  if (base.id === 'spell_shield') {
    const schoolId = game.weaponSystem?.spellCombat?.school
    const school = ELEMENTAL_SCHOOLS[schoolId]
    if (!school) return base
    return {
      ...base,
      name: school.shield.name,
      color: school.color,
      desc: `${school.shield.desc} 强化法术护盾容量、缩短重建时间并升级破盾特效。`,
    }
  }
  return base
}

export function ordinarySpellCoreSkills() {
  return []
}

export function spellCoreOptions() {
  return []
}

/** Lv.2 school selection milestone (4-choose-1). */
export function spellMilestoneReward(combat) {
  if (!combat?.available) return null
  const level = combat.player?.level || 1
  if (!combat.school && !(combat.elements?.size > 0) && level >= 2) {
    return {
      stage: 'first',
      source: 'Lv.2',
      options: ELEMENTAL_SCHOOL_IDS.map(schoolId => {
        const s = ELEMENTAL_SCHOOLS[schoolId]
        const elId = schoolToElement(schoolId)
        return {
          id: `spell_learn_${elId}`,
          school: s.id,
          element: elId,
          kind: 'learn',
          name: s.name,
          spell: s.primarySpell.name,
          icon: s.icon,
          color: s.color,
          label: `${s.short}专精 · ${s.primarySpell.name}`,
          desc: `${s.primarySpell.desc} 核心循环：${s.engineSummary}。`,
          stats: `空格：${s.activeSpell.name} ｜ 护盾：${s.shield.name}`,
          activeName: s.activeSpell.name,
          shieldName: s.shield.name,
          isSpellCore: true,
        }
      }),
    }
  }
  return null
}

export { normalizeSpellSchool, elementToSchool, schoolToElement }
