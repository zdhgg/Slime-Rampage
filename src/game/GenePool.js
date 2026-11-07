/**
 * 黑市永久基因：通用货架 + 暗格违禁品 + 旧血统基因（隐藏保留）。
 *
 * 货架只卖全血统通用的改造——伤害/攻速/暴击/范围/生命/回复/噬血/经验/
 * 机动/拾取，任何血统购买即生效；暗格违禁品是带副作用的高收益赃物，
 * 同属 `contraband` 互斥组，只能持有一件。
 *
 * 三个终点原核共用 `origin` 互斥组，一局档案只能激活一个。
 *
 * 旧存档兼容（血统专属基因下架）：旧 id 保留定义与 apply，继续按原
 * 等级生效，但标记 hidden 不再出售；旧原核摘除 exclusiveGroup，
 * 不再占用新原核的互斥位。
 */

export const GENE_BRANCHES = [
  {
    id: 'flesh',
    name: '血肉改造',
    icon: '🫀',
    color: '#d88b4a',
    desc: '生命、回复与噬血',
  },
  {
    id: 'arms',
    name: '走私军火',
    icon: '⚙️',
    color: '#58b8c7',
    desc: '伤害、射速与暴击',
  },
  {
    id: 'supply',
    name: '黑市杂货',
    icon: '◇',
    color: '#9c8ad4',
    desc: '经验、机动与改装',
  },
  {
    id: 'contraband',
    name: '暗格违禁品',
    icon: '☠️',
    color: '#c75c5c',
    desc: '高收益但有副作用的赃物，同类只能持有一件',
    layout: 'strip',
  },
]

export const GENES = [
  // ==================== 血肉改造 ====================
  {
    id: 'giant',
    branch: 'flesh',
    tier: 1,
    name: '巨大化基因',
    icon: '🐘',
    desc: '每级体型 +3px、生命上限 +2',
    costs: [200, 300, 500, 600],
    maxLevel: 4,
    apply(game, lv) {
      game.player.radius = 26 + 3 * lv
      game.player.maxHp = 5 + 2 * lv
    },
  },
  {
    id: 'thorns',
    branch: 'flesh',
    tier: 1,
    name: '应激刺膜',
    icon: '🛡️',
    desc: '受击时震开近身敌人并造成反震伤害，每级 +2 点',
    costs: [200, 300, 500, 600],
    maxLevel: 4,
    apply(game, lv) {
      game.player.thornsPulse = true
      game.player.thornsDamage = Math.max(game.player.thornsDamage || 0, 2 * lv)
    },
  },
  {
    id: 'regen',
    branch: 'flesh',
    tier: 2,
    requires: [{ id: 'giant', level: 1 }],
    name: '再生基因',
    icon: '💚',
    desc: '每 10 秒回复生命，每级 +1 点',
    costs: [200, 300, 600],
    maxLevel: 3,
    apply(game, lv) {
      game.player.regen = lv
    },
  },
  {
    id: 'siphon',
    branch: 'flesh',
    tier: 2,
    requires: [{ id: 'regen', level: 1 }],
    name: '涌泉基因',
    icon: '🌊',
    desc: '累计吸收经验达当前升级需求的 60%/40%/25% 时回复 1 点生命；满血不计数，与噬血共用 5 秒回复间隔',
    costs: [300, 500, 900],
    maxLevel: 3,
    apply(game, lv) {
      game.player.geneSiphonRate = [0.6, 0.4, 0.25][lv - 1]
    },
  },
  {
    id: 'leech',
    branch: 'flesh',
    tier: 2,
    requires: [{ id: 'giant', level: 1 }],
    name: '噬血基因',
    icon: '🩸',
    desc: '击杀计数满额回复 1 点生命；每级阈值 45 → 32 → 20，回复间隔至少 5 秒',
    costs: [300, 600, 1000],
    maxLevel: 3,
    apply(game, lv) {
      game.player.geneLeechKills = [45, 32, 20][lv - 1]
    },
  },
  {
    id: 'cocoon',
    branch: 'flesh',
    tier: 2,
    requires: [{ id: 'giant', level: 2 }],
    name: '复苏茧',
    icon: '🥚',
    desc: '每局一次：致命伤害改为保留 1 点生命，并获得 2 秒无敌',
    costs: [1400],
    maxLevel: 1,
    apply(game) {
      game.player.geneCocoon = 1
    },
  },
  {
    id: 'gorged_origin',
    branch: 'flesh',
    tier: 3,
    requires: [{ id: 'giant', level: 2 }, { id: 'leech', level: 1 }],
    exclusiveGroup: 'origin',
    isCapstone: true,
    name: '饕餮原核',
    icon: '◆',
    desc: '生命上限 +2；受击无敌时间延长 24%；噬血阈值 ×0.6',
    costs: [2500],
    maxLevel: 1,
    apply(game) {
      game.player.maxHp += 2
      game.player.geneIFramesMul = (game.player.geneIFramesMul || 1) * 1.24
      game.player.geneLeechKillsMul = (game.player.geneLeechKillsMul || 1) * 0.6
    },
  },
  // ==================== 走私军火 ====================
  {
    id: 'razor',
    branch: 'arms',
    tier: 1,
    name: '锋锐基因',
    icon: '🗡️',
    desc: '每级攻击伤害 +6%，对飞弹、近战与法术同样生效',
    costs: [200, 300, 500, 800],
    maxLevel: 4,
    apply(game, lv) {
      game.weaponSystem.damage = 1 + 0.06 * lv
    },
  },
  {
    id: 'rapid',
    branch: 'arms',
    tier: 1,
    name: '速射基因',
    icon: '⚡',
    desc: '每级攻击间隔 ×0.96，近战与远程共用同一攻击周期',
    costs: [200, 300, 500, 800],
    maxLevel: 4,
    apply(game, lv) {
      game.weaponSystem.fireInterval = 1.0 * Math.pow(0.96, lv)
    },
  },
  {
    id: 'hunt',
    branch: 'arms',
    tier: 1,
    name: '狩猎亢奋',
    icon: '⏱️',
    desc: '击杀后 2.5 秒内攻击间隔 ×0.95/级，击杀刷新窗口',
    costs: [200, 300, 500, 600],
    maxLevel: 4,
    apply(game, lv) {
      game.weaponSystem.geneHuntHaste = Math.pow(0.95, lv)
    },
  },
  {
    id: 'hunter',
    branch: 'arms',
    tier: 2,
    requires: [{ id: 'razor', level: 1 }],
    name: '猎手基因',
    icon: '🎯',
    desc: '每级暴击率 +2.5 个百分点、暴击伤害 +0.15 倍',
    costs: [300, 600, 900],
    maxLevel: 3,
    apply(game, lv) {
      game.weaponSystem.critChance = 0.1 + 0.025 * lv
      game.weaponSystem.critMul = 3.0 + 0.15 * lv
    },
  },
  {
    id: 'fury',
    branch: 'arms',
    tier: 2,
    requires: [{ id: 'razor', level: 1 }],
    name: '困兽基因',
    icon: '🔥',
    desc: '每缺失 1 点生命上限，攻击伤害 +6%/级',
    costs: [300, 500, 900],
    maxLevel: 3,
    apply(game, lv) {
      game.player.geneFuryPerMissing = 0.06 * lv
    },
  },
  {
    id: 'arsenal_origin',
    branch: 'arms',
    tier: 3,
    requires: [{ id: 'razor', level: 2 }, { id: 'rapid', level: 2 }],
    exclusiveGroup: 'origin',
    isCapstone: true,
    name: '兵工原核',
    icon: '◆',
    desc: '攻击伤害 +15%；攻击间隔 ×0.92；所有攻击额外穿透 1 个目标',
    costs: [2500],
    maxLevel: 1,
    apply(game) {
      game.weaponSystem.damage *= 1.15
      game.weaponSystem.fireInterval *= 0.92
      game.weaponSystem.genePierces = 1
    },
  },
  // ==================== 黑市杂货 ====================
  {
    id: 'lore',
    branch: 'supply',
    tier: 1,
    name: '经验基因',
    icon: '📖',
    desc: '每级经验获取 +15%',
    costs: [200, 300, 500, 600],
    maxLevel: 4,
    apply(game, lv) {
      game.player.expGainMul = 1 + 0.15 * lv
    },
  },
  {
    id: 'swift',
    branch: 'supply',
    tier: 1,
    name: '迅捷基因',
    icon: '🦶',
    desc: '每级移动速度 +8%',
    costs: [200, 200, 300, 400],
    maxLevel: 4,
    apply(game, lv) {
      game.player.speed = 340 * (1 + 0.08 * lv)
    },
  },
  {
    id: 'expand',
    branch: 'supply',
    tier: 2,
    requires: [{ id: 'swift', level: 1 }],
    name: '扩张基因',
    icon: '📡',
    desc: '每级攻击范围 +8%（飞弹航程、近战触及、法术半径），拾取半径 +15%',
    costs: [300, 500, 900],
    maxLevel: 3,
    apply(game, lv) {
      game.weaponSystem.geneRangeMul = 1 + 0.08 * lv
      game.player.pickupRadius = 150 * (1 + 0.15 * lv)
    },
  },
  {
    id: 'blueprint',
    branch: 'supply',
    tier: 2,
    requires: [{ id: 'swift', level: 1 }],
    name: '备选蓝图',
    icon: '🔄',
    desc: '每局升级选卡面板刷新次数 +1（R 键或按钮重抽）',
    costs: [500, 900],
    maxLevel: 2,
    apply(game, lv) {
      game.player.geneRerolls = lv
    },
  },
  {
    id: 'magnet',
    branch: 'supply',
    tier: 2,
    requires: [{ id: 'expand', level: 1 }],
    name: '全域磁感',
    icon: '🧲',
    desc: '经验宝石拾取半径扩展到全屏',
    costs: [1300],
    maxLevel: 1,
    apply(game) {
      game.player.geneMagnetAll = 1
    },
  },
  {
    id: 'horizon',
    branch: 'supply',
    tier: 2,
    requires: [{ id: 'lore', level: 2 }],
    name: '扩容视界',
    icon: '🗂️',
    desc: '技能选卡面板候选 +1（4 选 1）',
    costs: [1600],
    maxLevel: 1,
    apply(game) {
      game.player.geneExtraOptions = 1
    },
  },
  {
    id: 'flux_origin',
    branch: 'supply',
    tier: 3,
    requires: [{ id: 'lore', level: 2 }, { id: 'expand', level: 1 }],
    exclusiveGroup: 'origin',
    isCapstone: true,
    name: '万象原核',
    icon: '◆',
    desc: '经验获取 +30%；移动速度 +10%；主动技能冷却 ×0.85',
    costs: [2200],
    maxLevel: 1,
    apply(game) {
      game.player.expGainMul *= 1.3
      game.player.speed *= 1.1
      game.player.geneActiveSkillCdMultiplier = (game.player.geneActiveSkillCdMultiplier || 1) * 0.85
    },
  },
  // ==================== 暗格违禁品（互斥，带副作用） ====================
  {
    id: 'stim',
    branch: 'contraband',
    isContraband: true,
    exclusiveGroup: 'contraband',
    name: '燃血针剂',
    icon: '💉',
    desc: '攻击间隔 ×0.80（约攻速 +25%）；副作用：生命上限 −1',
    downside: '生命上限 −1',
    costs: [800],
    maxLevel: 1,
    apply(game) {
      game.weaponSystem.fireInterval *= 0.8
      game.player.maxHp = Math.max(1, game.player.maxHp - 1)
    },
  },
  {
    id: 'serum',
    branch: 'contraband',
    isContraband: true,
    exclusiveGroup: 'contraband',
    name: '浓缩血清',
    icon: '🧪',
    desc: '攻击伤害 +22%；副作用：移动速度 −10%',
    downside: '移动速度 −10%',
    costs: [800],
    maxLevel: 1,
    apply(game) {
      game.weaponSystem.damage *= 1.22
      game.player.speed *= 0.9
    },
  },
  {
    id: 'greed',
    branch: 'contraband',
    isContraband: true,
    exclusiveGroup: 'contraband',
    name: '贪婪烙印',
    icon: '👁️',
    desc: '经验获取 +50%；副作用：拾取半径 −30%',
    downside: '拾取半径 −30%',
    costs: [600],
    maxLevel: 1,
    apply(game) {
      game.player.expGainMul *= 1.5
      game.player.pickupRadius *= 0.7
    },
  },
  {
    id: 'glass',
    branch: 'contraband',
    isContraband: true,
    exclusiveGroup: 'contraband',
    name: '玻璃腺体',
    icon: '💎',
    desc: '攻击伤害 +40%；副作用：受击无敌帧 −35%',
    downside: '受击无敌帧 −35%',
    costs: [1000],
    maxLevel: 1,
    apply(game) {
      game.weaponSystem.damage *= 1.4
      game.player.geneIFramesMul *= 0.65
    },
  },
  {
    id: 'dicer',
    branch: 'contraband',
    isContraband: true,
    exclusiveGroup: 'contraband',
    name: '赌命菌株',
    icon: '🎲',
    desc: '暴击率 +15 个百分点；副作用：经验获取 −25%',
    downside: '经验获取 −25%',
    costs: [800],
    maxLevel: 1,
    apply(game) {
      game.weaponSystem.critChance += 0.15
      game.player.expGainMul *= 0.75
    },
  },
  // ==================== 旧血统基因（hidden：下架保留，旧存档按原等级生效） ====================
  {
    id: 'split',
    branch: 'legacy',
    hidden: true,
    tier: 2,
    requires: [{ id: 'swift', level: 1 }],
    name: '分裂基因',
    icon: '🧬',
    desc: '每级获得 25% 基础分裂概率，可与局内技能叠加',
    costs: [300, 500],
    maxLevel: 2,
    apply(game, lv) {
      game.weaponSystem.baseSplitChance = 0.25 * lv
    },
  },
  {
    id: 'resonance',
    branch: 'legacy',
    hidden: true,
    tier: 2,
    requires: [{ id: 'lore', level: 1 }],
    name: '共鸣基因',
    icon: '🔗',
    desc: '元素史莱姆按路线强化法术与融合；原生黏液每级增加 1 个副反应槽位',
    costs: [300, 600, 1000],
    maxLevel: 3,
    apply(game, lv) {
      game.player.geneSlotBonus = lv
      game.weaponSystem.spellGeneReactionMul = 1 + lv * .12
      game.weaponSystem.spellGeneRoutePowerMul = 1 + lv * .04
    },
  },
  {
    id: 'shadow_step',
    branch: 'legacy',
    hidden: true,
    tier: 1,
    name: '虚化步基因',
    icon: '👁️',
    desc: '暗影史莱姆每级获得 2 个百分点闪避率，受全局闪避上限约束。',
    costs: [200, 300, 600],
    maxLevel: 3,
    apply(game, lv) {
      game.player.geneShadowEvasionBonus = 0.02 * lv
    },
  },
  {
    id: 'shadow_echo',
    branch: 'legacy',
    hidden: true,
    tier: 2,
    requires: [{ id: 'shadow_step', level: 1 }],
    name: '影生基因',
    icon: '✣',
    desc: '每级让分身持续时间增加 0.35 秒，并提高分身伤害 4%。',
    costs: [300, 600, 900],
    maxLevel: 3,
    apply(game, lv) {
      game.player.geneShadowCloneLifeBonus = 0.35 * lv
      game.player.geneShadowClonePowerBonus = 0.04 * lv
    },
  },
  {
    id: 'symbiosis_bond',
    branch: 'legacy',
    hidden: true,
    tier: 1,
    name: '伙伴活性基因',
    icon: '🐾',
    desc: '每级提高所有在场伙伴 8% 攻击伤害。',
    costs: [200, 300, 600],
    maxLevel: 3,
    apply(game, lv) {
      game.player.genePetDamageMul = 1 + 0.08 * lv
    },
  },
  {
    id: 'symbiosis_vital',
    branch: 'legacy',
    hidden: true,
    tier: 2,
    requires: [{ id: 'symbiosis_bond', level: 1 }],
    name: '伙伴韧性基因',
    icon: '🛡️',
    desc: '每级提高所有伙伴 2 点生命上限，生成和升级时自动补齐。',
    costs: [300, 600, 900],
    maxLevel: 3,
    apply(game, lv) {
      game.player.genePetHpBonus = 2 * lv
    },
  },
  {
    id: 'predator_origin',
    branch: 'legacy',
    hidden: true,
    tier: 3,
    requires: [{ id: 'giant', level: 2 }, { id: 'regen', level: 2 }],
    name: '捕食原核',
    icon: '◆',
    desc: '生命上限 +2；吞噬回复 1 点生命（与其他吞噬恢复共用 4 秒间隔）并额外获得 35% 经验，且每次吞噬攻击永久 +3%（封顶 +100%）',
    costs: [2000],
    maxLevel: 1,
    apply(game) {
      game.player.maxHp += 2
      game.player.geneDevourHeal = 1
      game.player.geneDevourExpMul = 1.35
      game.player.geneDevourDamage = 0.03
    },
  },
  {
    id: 'kinetic_origin',
    branch: 'legacy',
    hidden: true,
    tier: 3,
    requires: [{ id: 'swift', level: 2 }, { id: 'split', level: 1 }],
    name: '动能原核',
    icon: '◆',
    desc: '移动速度提高 8%；所有主弹与分裂弹额外穿透 1 个目标',
    costs: [2000],
    maxLevel: 1,
    apply(game) {
      game.player.speed *= 1.08
      game.weaponSystem.genePierces = 1
    },
  },
  {
    id: 'element_origin',
    branch: 'legacy',
    hidden: true,
    tier: 3,
    requires: [{ id: 'lore', level: 2 }, { id: 'resonance', level: 1 }],
    name: '共鸣原核',
    icon: '◆',
    desc: '反应伤害 +25%；元素史莱姆主动术基础范围 +15px，额外强化路线；原生黏液增加 1 个副反应槽位',
    costs: [2200],
    maxLevel: 1,
    apply(game) {
      game.weaponSystem.geneReactionDmgMul = 1.25
      game.weaponSystem.spellGeneRoutePowerMul = (game.weaponSystem.spellGeneRoutePowerMul || 1) * 1.08
      game.player.geneSlotBonus = (game.player.geneSlotBonus || 0) + 1
    },
  },
  {
    id: 'shadow_origin',
    branch: 'legacy',
    hidden: true,
    tier: 3,
    requires: [{ id: 'shadow_step', level: 2 }, { id: 'shadow_echo', level: 2 }],
    name: '暗影原核',
    icon: '◆',
    desc: '闪避率 +3 个百分点；分身伤害 +12%；影袭冷却 ×0.90。',
    costs: [2500],
    maxLevel: 1,
    apply(game) {
      game.player.geneShadowEvasionBonus = (game.player.geneShadowEvasionBonus || 0) + 0.03
      game.player.geneShadowClonePowerBonus = (game.player.geneShadowClonePowerBonus || 0) + 0.12
      game.player.geneActiveSkillCdMultiplier = (game.player.geneActiveSkillCdMultiplier || 1) * 0.9
    },
  },
  {
    id: 'symbiosis_origin',
    branch: 'legacy',
    hidden: true,
    tier: 3,
    requires: [{ id: 'symbiosis_bond', level: 2 }, { id: 'symbiosis_vital', level: 2 }],
    name: '共生原核',
    icon: '◆',
    desc: '伙伴伤害额外 +12%；伙伴倒地恢复 −1 秒；共生指令冷却 ×0.90。',
    costs: [2500],
    maxLevel: 1,
    apply(game) {
      game.player.genePetDamageMul = (game.player.genePetDamageMul || 1) * 1.12
      game.player.genePetRecoveryBonus = (game.player.genePetRecoveryBonus || 0) + 1
      game.player.geneActiveSkillCdMultiplier = (game.player.geneActiveSkillCdMultiplier || 1) * 0.9
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
  const explicit = gene.costs?.[level]
  if (Number.isFinite(explicit)) return explicit
  return (gene.baseCost || 0) * (level + 1)
}

export function getChosenOrigin(genes) {
  return GENES.find((gene) => gene.exclusiveGroup === 'origin' && getGeneLevel(genes, gene) > 0) || null
}

/** 购买按钮与 App 结算共用同一判定，避免 UI 可买但业务层拒绝。 */
export function getGenePurchaseState(geneOrId, genes, drops = 0) {
  const gene = typeof geneOrId === 'string' ? getGene(geneOrId) : geneOrId
  if (!gene) return { canBuy: false, locked: true, reason: '未知基因' }
  // 下架基因（旧血统路线）：旧档按原等级生效，不再出售。
  if (gene.hidden) return { canBuy: false, locked: true, hidden: true, level: getGeneLevel(genes, gene), reason: '已下架' }

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
  } else if (!affordable && !maxed) reason = `还差 ${cost - drops} 点战力点`

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
  p.pickupRadius = 150
  p.geneSlotBonus = 0
  p.geneDevourHeal = 0
  p.geneDevourExpMul = 1
  p.geneDevourDamage = 0
  p.geneActiveSkillCdMultiplier = 1
  p.geneIFramesMul = 1
  p.geneLeechKills = 0
  p.geneLeechKillsMul = 1
  p.geneSiphonRate = 0
  p.thornsPulse = false // 应激刺膜与暴食甲壳共用震退通道，基线复位
  p.thornsDamage = 2
  p.geneCocoon = 0
  p.geneFuryPerMissing = 0
  p.geneRerolls = 0
  p.geneExtraOptions = 0
  p.geneMagnetAll = 0
  p.geneShadowEvasionBonus = 0
  p.geneShadowCloneLifeBonus = 0
  p.geneShadowClonePowerBonus = 0
  p.genePetDamageMul = 1
  p.genePetHpBonus = 0
  p.genePetRecoveryBonus = 0
  weapon.damage = 1
  weapon.fireInterval = 1.0
  weapon.critChance = 0.1
  weapon.critMul = 3.0
  weapon.baseSplitChance = 0
  weapon.genePierces = 0
  weapon.geneRangeMul = 1
  weapon.geneHuntHaste = 0
  weapon.geneReactionDmgMul = 1
  weapon.devourDamageMul = 1
  weapon.spellGeneReactionMul = 1
  weapon.spellGenePowerMul = 1
  weapon.spellGeneRoutePowerMul = 1

  const chosenOrigin = getChosenOrigin(genes)
  for (const gene of GENES) {
    const level = getGeneLevel(genes, gene)
    if (gene.exclusiveGroup === 'origin' && chosenOrigin?.id !== gene.id) continue
    if (level > 0) gene.apply(game, level)
  }
  weapon.splitChance = weapon.baseSplitChance
  weapon.spellGenePowerMul = 1 + weapon.baseSplitChance * .3
  // 派生展示值（黑市收益预览读 baseSecondarySlots 差值）；最终槽位与等级加成
  // 由 refreshReactionSlots 统一结算（重开时元素已清空，是纯重算）
  p.baseSecondarySlots = 2 + (p.geneSlotBonus || 0)
  p.refreshReactionSlots?.()
  p.hp = p.maxHp
}
