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
import { SPELL_ELEMENTS } from './SpellRules.js'

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
  gorged_origin: '饕餮',
  arsenal_origin: '兵工',
  flux_origin: '万象',
  predator_origin: '捕食',
  kinetic_origin: '动能',
  element_origin: '共鸣',
  shadow_origin: '暗影',
  symbiosis_origin: '共生',
}

const GENE_NAMES = {
  split: '有丝分裂基因',
  giant: '巨型化突变',
  regen: '再生基因',
  leech: '噬血基因',
  razor: '锋锐基因',
  rapid: '速射基因',
  hunter: '猎手基因',
  expand: '扩张基因',
  stim: '燃血针剂',
  serum: '浓缩血清',
  greed: '贪婪烙印',
  swift: '迅捷基因',
  lore: '经验基因',
  resonance: '共鸣基因',
  gorged_origin: '饕餮原核',
  arsenal_origin: '兵工原核',
  flux_origin: '万象原核',
  predator_origin: '捕食原核',
  kinetic_origin: '动能原核',
  element_origin: '共鸣原核',
  shadow_step: '虚化步基因',
  shadow_echo: '影生基因',
  shadow_origin: '暗影原核',
  symbiosis_bond: '伙伴活性基因',
  symbiosis_vital: '伙伴韧性基因',
  symbiosis_origin: '共生原核',
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

  // 1) 物种名：当前主反应优先（元素等级排名前两名的组合 = 物种身份），
  //    其次按反应表匹配，其次单元素，再次普通
  let name = null
  const spellFusion = player.game?.weaponSystem?.spellCombat?.enabled ? player.game.weaponSystem.spellCombat.fusion : null
  const primary = spellFusion || (player._primaryReaction
    ? REACTIONS.find((r) => r.id === player._primaryReaction)
    : null)
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
        name = player.game?.weaponSystem?.spellCombat?.enabled && id === 'water' ? '寒冰史莱姆' : SINGLE_SPECIES[id]
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
    icon: (player.game?.weaponSystem?.spellCombat?.enabled ? SPELL_ELEMENTS[id]?.icon : getElement(id)?.icon) || '?',
    share: Math.round((lv / Math.max(1, total)) * 100),
  }))

  // 5) 基因列表
  const geneList = Object.entries(genes)
    .filter(([, lv]) => lv > 0)
    .map(([id, lv]) => ({ id, lv, name: GENE_NAMES[id] || id }))

  // 6) 代表行为（评审 Day 9：本局代表性行为，截图传播点）
  const behaviorText = []
  const spells = player.game?.weaponSystem?.spellCombat
  if (spells?.enabled) {
    behaviorText.push(`法术核心 ${spells.cores} 颗`, `融合反应 ${spells.stats.reactions} 次`, `${spells.activeName} ${spells.stats.activeCasts} 次`)
  }
  if (behavior.maxChain > 1) behaviorText.push(`最长连锁 ${behavior.maxChain} 名勇者`)
  if (behavior.explosions > 0) behaviorText.push(`引爆酸液 ${behavior.explosions} 次`)
  if (behavior.slowClouds > 0) behaviorText.push(`蒸汽云雾 ${behavior.slowClouds} 次`)
  if (behavior.venomStorms > 0) behaviorText.push(`毒雷风暴 ${behavior.venomStorms} 次`)

  // 6.5) 副反应（元素等级排名第 3 名与前两名的组合，最多两个）
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
