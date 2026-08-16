/**
 * 物种命名与生态档案：把「Build」改造成有传播力的进化结果
 *
 * 评审 Day 1/Day 9：命名与档案由 ElementSystem 反应表驱动
 * （不硬编码组合名），并按元素等级计算构成占比、记录本局代表行为。
 *
 * 规则：
 *  - 反应表匹配优先（熔蚀爆浆 / 雷涡凝胶 …），其次单元素，再次普通；
 *  - 黑市基因改变前缀（巨型 / 分裂 / 再生）；
 *  - 元素构成占比按等级加权（水 42% 雷 38% 之类）；
 *  - 威胁评级随波次攀升，最高「世界级灾害」；
 *  - 代表行为：最长连锁 / 酸液引爆（雷水、火毒 Build 的证明）。
 */

import { REACTIONS, ELEMENTS, getElement } from './ElementSystem.js'

const THREAT_LEVELS = [
  { minWave: 20, label: '世界级灾害', icon: '☢️' },
  { minWave: 12, label: 'S级威胁', icon: '🚨' },
  { minWave: 8, label: 'A级威胁', icon: '⚔️' },
  { minWave: 5, label: 'B级威胁', icon: '⚠️' },
]

const GENE_PREFIX = {
  giant: '巨型',
  split: '分裂',
  regen: '再生',
  predator_origin: '捕食',
  kinetic_origin: '动能',
  element_origin: '共鸣',
}

const GENE_NAMES = {
  split: '有丝分裂基因',
  giant: '巨型化突变',
  regen: '再生基因',
  swift: '迅捷基因',
  lore: '经验基因',
  resonance: '共鸣基因',
  predator_origin: '捕食原核',
  kinetic_origin: '动能原核',
  element_origin: '共鸣原核',
}

/** 单元素物种名 */
const SINGLE_SPECIES = {
  fire: '熔岩史莱姆',
  water: '水凝胶史莱姆',
  poison: '毒蚀史莱姆',
  lightning: '电浆史莱姆',
}

/** 生成物种名与生态档案（结算面板展示） */
export function buildSpecies(player, genes, wave, kills, behavior = {}) {
  const elMap = player.elements // Map：元素 → 等级

  // 1) 物种名：主形态锁定优先（第一个融合的反应 = 物种身份，阶段十五设计改造），
  //    其次按反应表匹配，其次单元素，再次普通
  let name = null
  const primary = player._primaryReaction
    ? REACTIONS.find((r) => r.id === player._primaryReaction)
    : null
  if (primary && primary.combo.every((el) => elMap.has(el))) {
    name = primary.species
  }
  if (!name) {
    for (const r of REACTIONS) {
      if (r.combo.every((el) => elMap.has(el))) {
        name = r.species
        break
      }
    }
  }
  if (!name) {
    for (const id of ['fire', 'water', 'poison', 'lightning']) {
      if (elMap.has(id)) {
        name = SINGLE_SPECIES[id]
        break
      }
    }
  }
  if (!name) name = '普通史莱姆'

  // 2) 基因前缀
  let prefix = ''
  for (const id of Object.keys(GENE_PREFIX)) {
    if ((genes[id] || 0) > 0) prefix += GENE_PREFIX[id]
  }
  if (prefix) name = prefix + name

  // 3) 威胁评级（按波次攀升，呼应「勇者刷史莱姆 → 世界讨伐史莱姆」的反转）
  let threat = '地下城原生物种'
  let threatIcon = '🐌'
  for (const lv of THREAT_LEVELS) {
    if (wave >= lv.minWave) {
      threat = lv.label
      threatIcon = lv.icon
      break
    }
  }

  // 4) 元素构成：按等级加权占比（评审 Day 9：水 42% 雷 38%）
  const total = [...elMap.values()].reduce((s, lv) => s + lv, 0)
  const elementShare = [...elMap.entries()].map(([id, lv]) => ({
    id,
    icon: getElement(id)?.icon || '?',
    share: Math.round((lv / Math.max(1, total)) * 100),
  }))

  // 5) 基因列表
  const geneList = Object.entries(genes)
    .filter(([, lv]) => lv > 0)
    .map(([id, lv]) => ({ id, lv, name: GENE_NAMES[id] || id }))

  // 6) 代表行为（评审 Day 9：本局代表性行为，截图传播点）
  const behaviorText = []
  if (behavior.maxChain > 1) behaviorText.push(`最长连锁 ${behavior.maxChain} 名勇者`)
  if (behavior.explosions > 0) behaviorText.push(`引爆酸液 ${behavior.explosions} 次`)
  if (behavior.slowClouds > 0) behaviorText.push(`蒸汽云雾 ${behavior.slowClouds} 次`)
  if (behavior.venomStorms > 0) behaviorText.push(`毒雷风暴 ${behavior.venomStorms} 次`)

  // 6.5) 副反应（阶段十五/十六）：仅列出已占用槽位的激活副反应
  const secondary = REACTIONS.filter(
    (r) =>
      r.id !== player._primaryReaction &&
      player._secondaryIds.has(r.id) &&
      r.combo.every((el) => elMap.has(el))
  ).map((r) => r.name)

  return {
    name,
    threat,
    threatIcon,
    elements: elementShare,
    genes: geneList,
    behavior: behaviorText,
    secondary,
    kills,
  }
}
