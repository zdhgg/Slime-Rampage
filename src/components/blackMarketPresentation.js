import { applyGenes } from '../game/GenePool.js'

function effects(genes) {
  const game = { player: {}, weaponSystem: {} }
  applyGenes(game, genes)
  return game
}

const baseline = effects({})
const percent = value => `+${Math.round(value * 100)}%`
const reduction = value => (value <= 0 ? '±0%' : `-${Math.round(value * 100)}%`)
const points = value => `+${Math.round(value)}`
const metrics = {
  giant: { label: '生命上限', read: game => game.player.maxHp - baseline.player.maxHp, format: points },
  regen: { label: '每 10 秒回复', read: game => game.player.regen, format: value => `${Math.round(value)} 点` },
  leech: {
    label: '噬血阈值',
    read: game => game.player.geneLeechKills,
    format: value => (value > 0 ? `${Math.round(value)} 击杀` : '—'),
  },
  razor: { label: '攻击伤害', read: game => game.weaponSystem.damage - baseline.weaponSystem.damage, format: percent },
  rapid: { label: '攻击间隔', read: game => 1 - game.weaponSystem.fireInterval / baseline.weaponSystem.fireInterval, format: reduction },
  hunter: {
    label: '暴击成长',
    read: game => ({ chance: game.weaponSystem.critChance - baseline.weaponSystem.critChance, mul: game.weaponSystem.critMul - baseline.weaponSystem.critMul }),
    format: value => `+${Math.round(value.chance * 100)}% · +${value.mul.toFixed(2)}x`,
  },
  expand: {
    label: '范围与拾取',
    read: game => ({ range: game.weaponSystem.geneRangeMul - 1, pickup: game.player.pickupRadius / baseline.player.pickupRadius - 1 }),
    format: value => `+${Math.round(value.range * 100)}% · +${Math.round(value.pickup * 100)}%`,
  },
  lore: { label: '经验加成', read: game => game.player.expGainMul - 1, format: percent },
  swift: { label: '移速加成', read: game => game.player.speed / baseline.player.speed - 1, format: percent },
  thorns: { label: '受击反震', read: game => game.player.thornsDamage || 0, format: value => `${Math.round(value)} 点` },
  siphon: {
    label: '经验回血',
    read: game => game.player.geneSiphonRate || 0,
    format: value => (value > 0 ? `每 ${Math.round(value * 100)}% 升级经验` : '—'),
  },
  cocoon: { label: '免死茧', read: game => game.player.geneCocoon || 0, format: value => `${Math.round(value)} 次/局` },
  hunt: {
    label: '击杀加速',
    read: game => game.weaponSystem.geneHuntHaste || 1,
    format: value => `间隔 ×${Number(value).toFixed(2)}`,
  },
  fury: {
    label: '困兽加成',
    read: game => game.player.geneFuryPerMissing || 0,
    format: value => `每缺失1点 +${Math.round(value * 100)}%`,
  },
  blueprint: { label: '每局刷新', read: game => game.player.geneRerolls || 0, format: value => `${Math.round(value)} 次` },
  magnet: { label: '拾取半径', read: game => game.player.geneMagnetAll || 0, format: value => (value ? '全屏' : '—') },
  horizon: { label: '候选卡数', read: game => game.player.geneExtraOptions || 0, format: value => `+${Math.round(value)} 张` },
  glass: { label: '攻击伤害', read: game => game.weaponSystem.damage - baseline.weaponSystem.damage, format: percent },
  dicer: { label: '暴击率', read: game => game.weaponSystem.critChance - baseline.weaponSystem.critChance, format: percent },
}

const notes = {
  giant: '体型随基因等级增大。',
  leech: '满血时不积累击杀计数；两次回复至少间隔 5 秒。',
  razor: '伤害同时放大飞弹、近战咬合与法术威力。',
  rapid: '近战与远程共用同一攻击周期，攻速收益全体生效。',
  hunter: '与局内暴击强化叠乘；暴击率无上限之外的封顶。',
  expand: '作用于飞弹航程、近战触及与法术半径；伙伴攻击不受影响。',
  thorns: '受击时震退 160px 内敌人；暴食硬化甲壳可在此基础上继续增强。',
  siphon: '阈值随当前升级经验条自动缩放；与噬血共用回复间隔，满血时不计数。',
  cocoon: '每局限触发一次；无敌期间可脱离包围。',
  hunt: '窗口可无限刷新；对近战与远程同样生效。',
  fury: '满血时无加成；压血换输出，与燃血针剂相性极佳。',
  blueprint: '仅作用于升级选卡面板；秘典与悬赏结算为独立流程不参与刷新。',
  magnet: '经验宝石无条件入体；元素核心不受影响，仍按靠近自动吸收。',
  horizon: '升级、秘典与悬赏面板同步变为 4 选 1。',
}

const descriptions = {
  gorged_origin: '生命上限 +2；受击无敌时间延长 24%；噬血阈值 ×0.6。',
  arsenal_origin: '攻击伤害 +15%；攻击间隔 ×0.92；所有攻击额外穿透 1 个目标。',
  flux_origin: '经验获取 +30%；移动速度 +10%；主动技能冷却 ×0.85。',
  stim: '攻击间隔 ×0.80（约攻速 +25%）。燃血而速：每一次开火都在烧命。',
  serum: '攻击伤害 +22%。浓缩的代价是沉重。',
  greed: '经验获取 +50%。看得见的成长，够不着的宝石。',
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
    description: descriptions[gene.id] || gene.desc || '',
  }
}
