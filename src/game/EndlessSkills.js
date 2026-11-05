import { getSoftRankMultiplier } from './SkillProgression.js'

export const ENDLESS_SKILLS = [
  {
    id: 'endless_power', name: '余烬共鸣', icon: '∞', kind: 'common', maxLevel: Infinity,
    growthClass: 'endless', isEndlessMastery: true, weight: 0.45,
    tags: ['无尽精通', '伤害'],
    desc: '每级强化全局伤害，收益逐渐递减并趋近软上限。',
    stats(level) {
      const total = (getSoftRankMultiplier(level + 1, 0.08, 1, 1.5) - 1) * 100
      return `累计全局伤害 +${total.toFixed(1)}%（上限趋近 +50%）`
    },
    apply(game) { game.weaponSystem.refreshLevelMultiplier() },
  },
]

export const ENDLESS_SKILL_BY_ID = Object.fromEntries(ENDLESS_SKILLS.map(skill => [skill.id, skill]))

export function getEndlessSkillChoices(game) {
  if (game?.runSelection?.mode !== 'endless' || (game.enemyManager?.wave || 1) < 25) return []
  return ENDLESS_SKILLS.map(skill => {
    const level = game.skillLevels?.[skill.id] || 0
    return { ...skill, level, role: 'common', stats: skill.stats(level) }
  })
}

export function getEndlessSkillBonus(levels = {}) {
  const rank = Math.max(0, Math.floor(Number(levels.endless_power) || 0))
  return getSoftRankMultiplier(rank, 0.08, 1, 1.5) - 1
}
