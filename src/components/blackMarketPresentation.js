import { applyGenes } from '../game/GenePool.js'

function effects(genes) {
  const game = { player: {}, weaponSystem: {} }
  applyGenes(game, genes)
  return game
}

const baseline = effects({})
const percent = value => `+${Math.round(value * 100)}%`
const points = value => `+${Math.round(value)}`
const metrics = {
  giant: { label: '生命上限', read: game => game.player.maxHp - baseline.player.maxHp, format: points },
  regen: { label: '每 10 秒回复', read: game => game.player.regen, format: value => `${Math.round(value)} 点` },
  swift: { label: '移速加成', read: game => game.player.speed / baseline.player.speed - 1, format: percent },
  split: { label: '基础分裂概率', read: game => game.weaponSystem.baseSplitChance, format: percent },
  lore: { label: '经验加成', read: game => game.player.expGainMul - 1, format: percent },
  resonance: { label: '额外反应槽位', read: game => game.player.baseSecondarySlots - baseline.player.baseSecondarySlots, format: points },
}

const notes = {
  giant: '体型随基因等级增大。',
  split: '可与局内分裂技能叠加。',
  resonance: '基础为 2 个槽位。',
}

const scopes = {
  predator_origin: '吞噬加成主要适用于暴食史莱姆。',
  resonance: '适用于元素史莱姆、原生黏液；需拥有元素权限。',
  element_origin: '适用于元素史莱姆、原生黏液；需拥有元素权限。',
}

const originDescriptions = {
  predator_origin: '生命上限 +2；吞噬回复 1 点生命（与其他吞噬恢复共用 4 秒间隔），额外经验 +35%。每次吞噬攻击 +3%，本局最多 +100%。',
  kinetic_origin: '移动速度提高 8%；所有主弹与分裂弹额外穿透 1 个目标。',
  element_origin: '反应伤害 +25%，额外增加 1 个副反应槽位。',
}

/** 数值来自现有基因应用逻辑，只展示该基因自身的累计收益，不混入其他基因。 */
export function getGenePresentation(gene, level) {
  const metric = metrics[gene.id]
  const valueAt = rank => metric.format(metric.read(effects({ [gene.id]: rank })))
  return {
    preview: metric ? {
      label: metric.label,
      current: valueAt(level),
      next: level < gene.maxLevel ? valueAt(level + 1) : null,
    } : null,
    note: notes[gene.id] || '',
    scope: scopes[gene.id] || '',
    description: originDescriptions[gene.id] || '',
  }
}
