/**
 * 黑市永久基因：三条可交叉投资的路线，终点原核互斥。
 * 旧存档中的基础基因保持原 id 与等级；路线规则只约束后续购买。
 */

export const GENE_BRANCHES = [
  {
    id: 'gluttony',
    name: '捕食体',
    icon: '🫀',
    color: '#d88b4a',
    desc: '生命、再生与吞噬收益',
  },
  {
    id: 'kinetic',
    name: '疾射体',
    icon: '⚙️',
    color: '#58b8c7',
    desc: '机动、分裂与弹体穿透',
  },
  {
    id: 'elemental',
    name: '共鸣体',
    icon: '◇',
    color: '#9c8ad4',
    desc: '成长、反应与元素容量',
  },
]

export const GENES = [
  {
    id: 'giant',
    branch: 'gluttony',
    tier: 1,
    name: '巨大化基因',
    icon: '🐘',
    desc: '每级体型 +3px、生命上限 +2',
    baseCost: 8,
    maxLevel: 4,
    apply(game, lv) {
      game.player.radius = 26 + 3 * lv
      game.player.maxHp = 5 + 2 * lv
    },
  },
  {
    id: 'regen',
    branch: 'gluttony',
    tier: 2,
    requires: [{ id: 'giant', level: 1 }],
    name: '再生基因',
    icon: '💚',
    desc: '每 10 秒回复生命，每级 +1 点',
    baseCost: 10,
    maxLevel: 3,
    apply(game, lv) {
      game.player.regen = lv
    },
  },
  {
    id: 'predator_origin',
    branch: 'gluttony',
    tier: 3,
    requires: [{ id: 'giant', level: 2 }, { id: 'regen', level: 2 }],
    exclusiveGroup: 'origin',
    isCapstone: true,
    name: '捕食原核',
    icon: '◆',
    desc: '生命上限 +2；吞噬回复 1 点生命并额外获得 35% 经验，且每次吞噬攻击永久 +3%（封顶 +100%）——捕食体路线的滚雪球机制',
    baseCost: 36,
    maxLevel: 1,
    apply(game) {
      game.player.maxHp += 2
      game.player.geneDevourHeal = 1
      game.player.geneDevourExpMul = 1.35
      game.player.geneDevourDamage = 0.03
    },
  },
  {
    id: 'swift',
    branch: 'kinetic',
    tier: 1,
    name: '迅捷基因',
    icon: '🦶',
    desc: '每级移动速度 +8%',
    baseCost: 6,
    maxLevel: 4,
    apply(game, lv) {
      game.player.speed = 340 * (1 + 0.08 * lv)
    },
  },
  {
    id: 'split',
    branch: 'kinetic',
    tier: 2,
    requires: [{ id: 'swift', level: 1 }],
    name: '分裂基因',
    icon: '🧬',
    desc: '每级获得 25% 基础分裂概率，可与局内技能叠加',
    baseCost: 6,
    maxLevel: 2,
    apply(game, lv) {
      game.weaponSystem.baseSplitChance = 0.25 * lv
    },
  },
  {
    id: 'kinetic_origin',
    branch: 'kinetic',
    tier: 3,
    requires: [{ id: 'swift', level: 2 }, { id: 'split', level: 1 }],
    exclusiveGroup: 'origin',
    isCapstone: true,
    name: '动能原核',
    icon: '◆',
    desc: '冲刺冷却缩短 20%；所有主弹与分裂弹额外穿透 1 个目标',
    baseCost: 36,
    maxLevel: 1,
    apply(game) {
      game.player.geneDashCdMultiplier = 0.8
      game.weaponSystem.genePierces = 1
    },
  },
  {
    id: 'lore',
    branch: 'elemental',
    tier: 1,
    name: '经验基因',
    icon: '📖',
    desc: '每级经验获取 +15%',
    baseCost: 7,
    maxLevel: 4,
    apply(game, lv) {
      game.player.expGainMul = 1 + 0.15 * lv
    },
  },
  {
    id: 'resonance',
    branch: 'elemental',
    tier: 2,
    requires: [{ id: 'lore', level: 1 }],
    name: '共鸣基因',
    icon: '🔗',
    desc: '每级增加 1 个副反应槽位，基础为 2 个',
    baseCost: 20,
    maxLevel: 3,
    apply(game, lv) {
      game.player.secondarySlots = 2 + lv
    },
  },
  {
    id: 'element_origin',
    branch: 'elemental',
    tier: 3,
    requires: [{ id: 'lore', level: 2 }, { id: 'resonance', level: 1 }],
    exclusiveGroup: 'origin',
    isCapstone: true,
    name: '共鸣原核',
    icon: '◆',
    desc: '反应伤害 +25%，并额外增加 1 个副反应槽位',
    baseCost: 42,
    maxLevel: 1,
    apply(game) {
      game.weaponSystem.geneReactionDmgMul = 1.25
      game.player.secondarySlots += 1
    },
  },
]

const GENE_MAP = new Map(GENES.map((gene) => [gene.id, gene]))

export const getGene = (id) => GENE_MAP.get(id) || null

export function getGeneLevel(genes, gene) {
  const raw = Math.floor(Number(genes?.[gene.id]) || 0)
  return Math.max(0, Math.min(gene.maxLevel, raw))
}

export function getGeneCost(gene, level) {
  return gene.baseCost * (level + 1)
}

export function getChosenOrigin(genes) {
  return GENES.find((gene) => gene.exclusiveGroup === 'origin' && getGeneLevel(genes, gene) > 0) || null
}

/** 购买按钮与 App 结算共用同一判定，避免 UI 可买但业务层拒绝。 */
export function getGenePurchaseState(geneOrId, genes, drops = 0) {
  const gene = typeof geneOrId === 'string' ? getGene(geneOrId) : geneOrId
  if (!gene) return { canBuy: false, locked: true, reason: '未知基因' }

  const level = getGeneLevel(genes, gene)
  const maxed = level >= gene.maxLevel
  const cost = getGeneCost(gene, level)
  const unmet = level > 0
    ? []
    : (gene.requires || []).filter((req) => {
        const dependency = getGene(req.id)
        return !dependency || getGeneLevel(genes, dependency) < req.level
      })
  const exclusiveOwner = gene.exclusiveGroup
    ? GENES.find(
        (candidate) =>
          candidate.id !== gene.id &&
          candidate.exclusiveGroup === gene.exclusiveGroup &&
          getGeneLevel(genes, candidate) > 0
      )
    : null
  const locked = !maxed && (!!exclusiveOwner || unmet.length > 0)
  const affordable = drops >= cost
  let reason = ''
  if (exclusiveOwner) reason = `已选择「${exclusiveOwner.name}」`
  else if (unmet.length > 0) {
    reason = `需要 ${unmet.map((req) => `${getGene(req.id)?.name || req.id} Lv.${req.level}`).join('、')}`
  } else if (!affordable && !maxed) reason = `还差 ${cost - drops} 份战利品`

  return {
    level,
    cost,
    maxed,
    locked,
    affordable,
    canBuy: !maxed && !locked && affordable,
    reason,
    exclusiveOwner,
  }
}

/** 幂等应用：先恢复永久成长基线，再按固定路线顺序叠加合法等级。 */
export function applyGenes(game, genes) {
  const p = game.player
  const weapon = game.weaponSystem
  p.maxHp = 5
  p.radius = 26
  p.speed = 340
  p.expGainMul = 1
  p.regen = 0
  p.secondarySlots = 2
  p.geneDevourHeal = 0
  p.geneDevourExpMul = 1
  p.geneDevourDamage = 0
  p.geneDashCdMultiplier = 1
  weapon.baseSplitChance = 0
  weapon.genePierces = 0
  weapon.geneReactionDmgMul = 1
  weapon.devourDamageMul = 1

  const chosenOrigin = getChosenOrigin(genes)
  for (const gene of GENES) {
    const level = getGeneLevel(genes, gene)
    if (gene.exclusiveGroup === 'origin' && chosenOrigin?.id !== gene.id) continue
    if (level > 0) gene.apply(game, level)
  }
  weapon.splitChance = weapon.baseSplitChance
  p.hp = p.maxHp
}
