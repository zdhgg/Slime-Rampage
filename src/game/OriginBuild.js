import { getEffectiveSkillMaxLevel } from './SkillProgression.js'
import { ENDLESS_SKILLS } from './EndlessSkills.js'

/**
 * 原生黏液（origin）的独立成长体系。
 *
 * 设计约束：
 *  - 只有一条路线、一个异源印记；路线管“黏液震荡的主形态与被动超载的形态”，
 *    印记管“震荡附加特征与超载回响”，两者都不开放任何职业主系统。
 *  - 碎片只在 Lv.1~4 出现，最多 2 个系、每系 1 级；同系印记会吸收碎片，
 *    不会产生两次触发。
 *  - 所有能派生的数值都从 skillLevels 实时计算，避免“先点卡、后选路线”的
 *    属性丢失；apply 只处理真正的离散解锁（印记等级）。
 */

export const ORIGIN_RULES = Object.freeze({
  routeLevel: 5,
  markLevel: 9,
  maxFragmentFamilies: 2,
  maxMarkRank: 2,
  ownedWeight: 1.2,
  routeWeight: 1.15,
  maxWeightBoost: 1.35,
  overloadWindow: 2.5,
  echoShareCap: 0.35,
  mutationMaxStacks: 5,
  mutationMaxGainPerCast: 2,
  resonanceMaxCircuits: 3,
  resonanceWindow: 8,
})

/** 首版基础值；数值调优只改这里与路线卡系数，不散落在战斗代码中。 */
export const ORIGIN_BASE = Object.freeze({
  shockRadius: 120,
  shockDamageMul: 1.7,
  shockCooldown: 6.5,
  overloadCost: 40,
  energyMax: 100,
})

export const ORIGIN_ROUTES = Object.freeze({
  expansion: {
    id: 'expansion',
    name: '原质扩张',
    short: '扩张',
    icon: '🌊',
    color: '#5ad1c8',
    tint: 'rgba(90,209,200,0.22)',
    desc: '把震荡扩散成层叠冲击环，用残留液痕与波纹外延持续压缩怪群空间。',
    bonus: '震荡范围 +12%，每第 3 次震荡追加一道 35% 伤害的副环；震荡自带液痕；超载覆盖更大并在落点留下液域',
    shockDesc: '范围冲击 + 副环 + 残留液痕',
    overloadDesc: '超载范围 +10%~15%，落点生成液域',
    roadmap: [
      'T1: 层叠冲击环（每 3 次震荡追加副环）',
      'T2: 残留液痕强化（路线自带液痕；提升持续/伤害/减速）',
      'T3: 波纹外延（边缘伤害与击退强化）',
    ],
  },
  assimilation: {
    id: 'assimilation',
    name: '基因同化',
    short: '同化',
    icon: '🧬',
    color: '#b8e86a',
    tint: 'rgba(184,232,106,0.22)',
    desc: '用震荡施放积累不稳定基因层数，满层后触发局部形态重组，越打越适应。',
    bonus: '震荡、普攻命中与精英击杀积累同化层数（震荡命中 3 个以上敌人额外 +1），被动超载读取层数增伤，满层时消耗层数触发形态重组',
    shockDesc: '层数积累 + 每层减伤',
    overloadDesc: '每层同化提高本次超载伤害；满层时消耗层数，强化本次超载并进入形变',
    roadmap: [
      'T1: 不稳定基因纹路（层数上限与每层收益）',
      'T2: 局部形态重组（满层超载强化）',
      'T3: 战场适应 / 同化持续（减伤、移速与层数窗口）',
    ],
  },
  resonance: {
    id: 'resonance',
    name: '异源共振',
    short: '共振',
    icon: '⚡',
    color: '#ffd166',
    tint: 'rgba(255,209,102,0.22)',
    desc: '交替使用飞弹、震荡、元素与路线效果，积累共振回路，把异源能量转成超载爆发。',
    bonus: '8 秒内每出现一种不同伤害来源获得 1 层回路（最多 3 层），提高充能；超载冷却更短，满 3 回路时超载追加共振余波',
    shockDesc: '多源回路积累',
    overloadDesc: '超载冷却缩短，回路提高本次超载伤害，满 3 回路追加共振余波',
    roadmap: [
      'T1: 能量回路（回路充能与持续时间）',
      'T2: 共振核心（回路提高超载伤害）',
      'T3: 多源切换 / 超载爆发（切换收益与回路爆发）',
    ],
  },
})

export const ORIGIN_MARKS = Object.freeze({
  glutton: {
    id: 'glutton', name: '暴食印记', icon: '🍽️', color: '#ff9f43',
    desc: '震荡命中残血目标时回复少量生命并短暂获得护甲；不获得吞噬与重咬。',
    shockDesc: '残血命中回复 1 生命（8 秒 ICD）',
    overloadDesc: '获得 1 层护甲 2 秒，并回复 1 生命',
  },
  gatling: {
    id: 'gatling', name: '弹射印记', icon: '🔫', color: '#00d2d3',
    desc: '震荡后追加少量副弹；不获得分裂、连锁与穿透树。',
    shockDesc: '追加 1 枚 50% 副弹（4 秒 ICD）',
    overloadDesc: '追加 2 枚 50% 副弹',
  },
  elemental: {
    id: 'elemental', name: '元素印记', icon: '🔮', color: '#a29bfe',
    desc: '震荡附带轻量元素附着；超载时触发一次有上限的晶核共鸣。',
    shockDesc: '25% 概率附加已吸收元素（时长按元素 0.6~3 秒）',
    overloadDesc: '触发晶核共鸣（最多 5 个目标）',
  },
  assassin: {
    id: 'assassin', name: '暗影印记', icon: '🗡️', color: '#ff6b6b',
    desc: '震荡后短暂隐匿并强化下一次攻击；不获得分身与闪避树。',
    shockDesc: '0.6 秒隐匿，下一次攻击 +20%（6 秒 ICD）',
    overloadDesc: '1.2 秒隐匿，下一次攻击必暴',
  },
  symbiosis: {
    id: 'symbiosis', name: '共生印记', icon: '🐾', color: '#edc479',
    desc: '震荡生成支援泡泡抵挡一次伤害；不获得伙伴名册与鼓舞。',
    shockDesc: '生成 1 点支援泡泡（12 秒 ICD）',
    overloadDesc: '泡泡爆裂：获得 1 点护盾并造成小范围伤害',
  },
})

const routeCardIds = Object.freeze({
  expansion: ['ori_exp_ring', 'ori_exp_residue', 'ori_exp_edge', 'ori_exp_control'],
  assimilation: ['ori_asm_stack', 'ori_asm_recompose', 'ori_asm_adapt', 'ori_asm_duration'],
  resonance: ['ori_res_circuit', 'ori_res_core', 'ori_res_switch', 'ori_res_burst'],
})

const routeSkill = (route, id, name, icon, maxLevel, desc, stats, apply = null) => ({
  id, name, icon, spec: 'origin', originOnly: true,
  originPool: `route_${route}`, originRequires: { route }, originCommit: 'route',
  route, maxLevel, growthClass: 'core', tier: 2, weight: 1,
  tags: ['原生·路线', ORIGIN_ROUTES[route].short],
  desc, stats, apply,
})

const fragment = (family, id, name, icon, desc, stats) => ({
  id, name, icon, spec: 'origin', originOnly: true,
  originPool: 'fragment', fragment: family, originCommit: null,
  maxLevel: 1, growthClass: 'common', tier: 1, weight: 0.9,
  tags: ['原生·碎片', ORIGIN_MARKS[family].name],
  desc, stats, apply() {},
})

const markUpgrade = (mark, id, name, icon, desc, stats) => ({
  id, name, icon, spec: 'origin', originOnly: true,
  originPool: 'mark', mark, originRequires: { mark }, originCommit: 'mark',
  maxLevel: 1, growthClass: 'core', tier: 3, weight: 1,
  tags: ['原生·印记', ORIGIN_MARKS[mark].name],
  desc, stats,
  apply(game) {
    if (game?.player?.markState?.mark === mark) game.player.markState.rank = 2
  },
})

export const ORIGIN_COMMON_SKILLS = [
  {
    id: 'com_shock', name: '震荡扩能', icon: '🫧',
    spec: 'origin', originOnly: true, originPool: 'common', originCommit: 'route',
    maxLevel: 3, growthClass: 'common', tier: 1, weight: 1.2,
    desc: '强化原生唯一的主动技「黏液震荡」；路线与印记只改变形态，不改变主动身份。',
    tags: ['原生核心', '主动技'],
    stats(lv) { return `震荡伤害 +${(lv + 1) * 8}% · 范围 +${(lv + 1) * 6}px` },
    apply() {},
  },
  {
    id: 'origin_flux', name: '异源校准', icon: '🔄',
    spec: 'origin', originOnly: true, originPool: 'common', originRequires: { route: true },
    originCommit: 'route', maxLevel: 6, growthClass: 'core', tier: 2, weight: 1,
    desc: '让不同伤害来源之间的异源能量轮换更高效；同源收益不变，异源收益递减封顶。',
    tags: ['原生核心', '异源能量'],
    stats(lv, game) {
      const before = getOriginGrowth({ ...game, skillLevels: { ...(game?.skillLevels || {}), origin_flux: lv } }).foreignBonus
      const after = getOriginGrowth({ ...game, skillLevels: { ...(game?.skillLevels || {}), origin_flux: lv + 1 } }).foreignBonus
      return `异源充能额外 +${before.toFixed(1)} → +${after.toFixed(1)}（上限 +3）`
    },
    apply() {},
  },
  {
    id: 'origin_overload', name: '超载棱镜', icon: '🔆',
    spec: 'origin', originOnly: true, originPool: 'common', originRequires: { route: true },
    originCommit: 'route', maxLevel: 6, growthClass: 'core', tier: 2, weight: 1,
    desc: '强化被动超载的源质技能与原质环流：提高伤害与范围，并受全局硬上限约束。',
    tags: ['原生核心', '超载'],
    stats(lv, game) {
      const before = getOriginGrowth({ ...game, skillLevels: { ...(game?.skillLevels || {}), origin_overload: lv } })
      const after = getOriginGrowth({ ...game, skillLevels: { ...(game?.skillLevels || {}), origin_overload: lv + 1 } })
      return `超载伤害 ×${before.overloadDamageMul.toFixed(2)} → ×${after.overloadDamageMul.toFixed(2)} · 范围 ×${before.overloadRangeMul.toFixed(2)} → ×${after.overloadRangeMul.toFixed(2)}`
    },
    apply() {},
  },
  {
    id: 'origin_adapt', name: '适应性膜', icon: '🛡️',
    spec: 'origin', originOnly: true, originPool: 'common', originRequires: { route: true },
    originCommit: 'route', maxLevel: 2, growthClass: 'core', tier: 2, weight: 0.9,
    desc: '被动超载后短暂降低受到的伤害；原生高光时刻也是 2.5 秒生存窗口。',
    tags: ['原生核心', '生存'],
    stats(lv) { return `被动超载后 2.5 秒受到伤害 −${(lv + 1) * 10}%` },
    apply() {},
  },
  {
    id: 'origin_motility', name: '流体机动', icon: '💨',
    spec: 'origin', originOnly: true, originPool: 'common', originCommit: 'route',
    maxLevel: 3, growthClass: 'common', tier: 1, weight: 0.9,
    desc: '震荡后短暂提高移动速度，让原生在释放主动后更容易重新拉开距离。',
    tags: ['原生核心', '机动'],
    stats(lv) { return `震荡后移速 +${4 + (lv + 1) * 4}%（持续 1.5 秒）` },
    apply() {},
  },
  {
    id: 'origin_recovery', name: '液态回流', icon: '🌱',
    spec: 'origin', originOnly: true, originPool: 'common', originCommit: 'route',
    maxLevel: 2, growthClass: 'common', tier: 2, weight: 0.8,
    desc: '震荡击杀敌人时回复生命；共享独立冷却，不能靠怪海无限续航。',
    tags: ['原生核心', '恢复'],
    stats(lv) { return `震荡击杀回复 1 生命（${lv === 0 ? 12 : 10} 秒 ICD）` },
    apply() {},
  },
]

export const ORIGIN_FRAGMENT_SKILLS = [
  fragment('glutton', 'ori_frag_glutton', '暴食碎片', '🍽️',
    '震荡命中残血目标时获得 1 层护甲；不回复生命，也不能吞噬。',
    () => '残血命中获得 1 层护甲 · 6 秒 ICD'),
  fragment('gatling', 'ori_frag_gatling', '弹射碎片', '🔫',
    '震荡有概率追加 1 枚弱化副弹；不获得分裂、连锁或穿透。',
    () => '50% 概率追加 1 枚 35% 副弹 · 3 秒 ICD'),
  fragment('elemental', 'ori_frag_elemental', '元素碎片', '🔮',
    '震荡有概率附加已吸收元素的短暂附着；需先吸收元素核心，且不会开启元素法术树。',
    (lv, game) => (game?.player?.elements?.size || 0) > 0
      ? '35% 概率附加 1 种已吸收元素（时长按元素 0.6~3 秒）'
      : '未吸收任何元素核心 · 当前不会触发（先吃一颗元素核心）'),
  fragment('assassin', 'ori_frag_assassin', '暗影碎片', '🗡️',
    '震荡后短暂隐匿并小幅强化下一次攻击；不获得分身与闪避。',
    () => '0.5 秒隐匿 · 下一次攻击 +12% · 6 秒 ICD'),
  fragment('symbiosis', 'ori_frag_symbiosis', '共生碎片', '🐾',
    '震荡生成 1 点支援泡泡；不会生成伙伴，也不提供鼓舞。',
    () => '获得 1 点支援泡泡 · 10 秒 ICD'),
]

export const ORIGIN_ROUTE_SKILLS = {
  expansion: [
    routeSkill('expansion', 'ori_exp_ring', '层叠冲击环', '🌊', 3,
      '每第 3 次黏液震荡追加一道延迟副环；副环伤害低于主环，且不产生异源能量。',
      lv => `副环伤害 ${Math.round((0.35 + 0.05 * (lv + 1)) * 100)}% · 半径为主环的 60%`,
      () => {}),
    routeSkill('expansion', 'ori_exp_residue', '残留液痕', '💧', 3,
      '强化路线自带的震荡液痕与超载液域：延长持续、提高周期伤害与减速；两种液域各自最多 1 个。',
      lv => `液痕持续 ${(3 + 0.5 * (lv + 1)).toFixed(1)} 秒 · 伤害 ${Math.round((0.4 + 0.08 * (lv + 1)) * 100)}% · 减速 ${Math.round((0.15 + 0.05 * (lv + 1)) * 100)}%`,
      () => {}),
    routeSkill('expansion', 'ori_exp_edge', '波纹外延', '🌀', 3,
      '震荡边缘的敌人受到额外伤害并被更远推开；强化范围压制而不是单点爆发。',
      lv => `边缘伤害 +${Math.round((0.1 + 0.05 * (lv + 1)) * 100)}% · 击退 +${Math.round((0.1 + 0.05 * (lv + 1)) * 100)}%`,
      () => {}),
    routeSkill('expansion', 'ori_exp_control', '范围控制', '⭕', 2,
      '液痕的减速更强，震荡对普通敌人的击退更稳定；首领不受减速影响。',
      lv => `液痕减速额外 +${(lv + 1) * 5}% · 震荡击退 +${(lv + 1) * 10}%`,
      () => {}),
  ],
  assimilation: [
    routeSkill('assimilation', 'ori_asm_stack', '不稳定基因纹路', '🧬', 3,
      '提高同化层数上限与每层伤害；层数在基础 8 秒内未刷新会衰减，可由同化持续延长。',
      lv => `层数上限 ${5 + lv + 1} · 每层伤害 +${(2.5 + 0.5 * (lv + 1)).toFixed(1)}%`,
      () => {}),
    routeSkill('assimilation', 'ori_asm_recompose', '局部形态重组', '🦠', 3,
      '满层后的下一次被动超载获得额外伤害与范围，并消耗全部层数。',
      lv => `满层超载伤害 +${Math.round((0.15 + 0.1 * (lv + 1)) * 100)}% · 范围 +15%`,
      () => {}),
    routeSkill('assimilation', 'ori_asm_adapt', '战场适应', '🛡️', 3,
      '每层同化提供少量减伤；满层时额外提高移速。',
      lv => `每层减伤 +${(1 + (lv + 1))}% · 满层移速 +10%`,
      () => {}),
    routeSkill('assimilation', 'ori_asm_duration', '同化持续', '⏳', 2,
      '延长同化层数的持续时间（基础 8 秒）；超载后仍会消耗层数，但形变窗口更长。',
      lv => `层数持续 +${lv + 1} 秒 · 超载形变 +${lv + 1} 秒`,
      () => {}),
  ],
  resonance: [
    routeSkill('resonance', 'ori_res_circuit', '能量回路', '⚡', 3,
      '提高共振回路的充能效率与持续时间；回路来自不同伤害来源。',
      lv => `回路充能 +${Math.round((0.04 + 0.02 * (lv + 1)) * 100)}% · 持续时间 ${8 + lv + 1} 秒`,
      () => {}),
    routeSkill('resonance', 'ori_res_core', '共振核心', '◈', 3,
      '每层共振回路提高被动超载伤害；这是共振路线的主要爆发成长。',
      lv => `每层回路超载伤害 +${Math.round((0.05 + 0.03 * (lv + 1)) * 100)}%（与超载爆发合计封顶 30%）`,
      () => {}),
    routeSkill('resonance', 'ori_res_switch', '多源切换', '🔄', 2,
      '切换伤害来源时额外获得少量异源能量；独立 3 秒冷却，不能靠高频多段刷能。',
      lv => `切换来源额外 +${(lv + 1) * 2} 能量 · 3 秒 ICD`,
      () => {}),
    routeSkill('resonance', 'ori_res_burst', '超载爆发', '💥', 2,
      '每层共振回路使被动超载伤害额外提高；与共振核心合计封顶 30%，满 3 回路时再追加一次共振余波。',
      lv => `每层回路超载伤害额外 +${(lv + 1) * 15}%（合计封顶 30%）`,
      () => {}),
  ],
}

export const ORIGIN_MARK_SKILLS = [
  markUpgrade('glutton', 'ori_mark_glutton', '暴食印记·深化', '🍽️',
    '强化残血回复与护甲效果；仍然不会获得吞噬。',
    () => '回复/护甲提升至 2 点 · ICD −20%'),
  markUpgrade('gatling', 'ori_mark_gatling', '弹射印记·深化', '🔫',
    '强化副弹数量；总伤害仍受超载回响 35% 预算约束，不会随深化超预算。',
    () => '副弹数量 +1 · 超载回响总伤害仍受 35% 预算'),
  markUpgrade('elemental', 'ori_mark_elemental', '元素印记·深化', '🔮',
    '提高震荡元素附着的概率与持续时间；超载晶核回响仍受 35% 预算。',
    () => '附着概率 +15% · 持续时间 +0.75 秒'),
  markUpgrade('assassin', 'ori_mark_assassin', '暗影印记·深化', '🗡️',
    '延长隐匿并强化下一次攻击；仍然不会生成分身。',
    () => '隐匿 +0.4 秒 · 下一次攻击 +15%'),
  markUpgrade('symbiosis', 'ori_mark_symbiosis', '共生印记·深化', '🐾',
    '强化支援泡泡与超载爆裂范围；爆裂伤害仍受 35% 预算。',
    () => '泡泡护盾 +1 · 爆裂范围 +20px'),
]

export const ORIGIN_ALL_SKILLS = [
  ...ORIGIN_COMMON_SKILLS,
  ...ORIGIN_FRAGMENT_SKILLS,
  ...Object.values(ORIGIN_ROUTE_SKILLS).flat(),
  ...ORIGIN_MARK_SKILLS,
]

export const ORIGIN_SKILL_BY_ID = Object.fromEntries(ORIGIN_ALL_SKILLS.map(s => [s.id, s]))

const lv = (levels, id) => Math.max(0, Math.floor(Number(levels?.[id]) || 0))

export function originInvestment(game, route = game?.originRoute) {
  if (!route) return 0
  return (routeCardIds[route] || []).reduce((sum, id) => sum + lv(game?.skillLevels, id), 0)
}

export function originFragmentFamilies(game) {
  return ORIGIN_FRAGMENT_SKILLS
    .filter(s => lv(game?.skillLevels, s.id) > 0)
    .map(s => s.fragment)
}

export function hasOriginFragment(game, family) {
  const skill = ORIGIN_FRAGMENT_SKILLS.find(s => s.fragment === family)
  return !!skill && lv(game?.skillLevels, skill.id) > 0
}

export function canOfferOriginFragment(game, family) {
  if (game?.originRoute) return false
  const owned = originFragmentFamilies(game)
  if (owned.includes(family)) return false
  return owned.length < ORIGIN_RULES.maxFragmentFamilies
}

/**
 * 原生成长派生。支持传入 skillLevels override 做卡片预览：
 * getOriginGrowth({ ...game, skillLevels: { ...game.skillLevels, com_shock: lv } })
 */
export function getOriginGrowth(game, overrideLevels = null) {
  const levels = overrideLevels || game?.skillLevels || {}
  const route = game?.originRoute || null
  const mark = game?.originMark || null
  const shockRank = lv(levels, 'com_shock')
  const flux = lv(levels, 'origin_flux')
  const overload = lv(levels, 'origin_overload')
  const routeInvestment = route ? (routeCardIds[route] || []).reduce((sum, id) => sum + lv(levels, id), 0) : 0
  const markRank = Math.max(0, Number(game?.player?.markState?.rank) || (mark ? 1 : 0))
  const stackLevel = lv(levels, 'ori_asm_stack')
  const adaptLevel = lv(levels, 'ori_asm_adapt')
  const recomposeLevel = lv(levels, 'ori_asm_recompose')
  const circuitLevel = lv(levels, 'ori_res_circuit')
  const coreLevel = lv(levels, 'ori_res_core')
  const burstLevel = lv(levels, 'ori_res_burst')
  const ringLevel = lv(levels, 'ori_exp_ring')
  const residueLevel = lv(levels, 'ori_exp_residue')
  const edgeLevel = lv(levels, 'ori_exp_edge')
  const controlLevel = lv(levels, 'ori_exp_control')

  const maxStacks = ORIGIN_RULES.mutationMaxStacks + (route === 'assimilation' ? Math.min(3, stackLevel) : 0)
  return {
    route, mark, routeInvestment, markRank,
    shockRank,
    shockDamageMul: 1 + shockRank * 0.08,
    shockRangeBonus: shockRank * 6,
    foreignBonus: Math.min(3, Math.round((1 - 0.86 ** flux) * 4 * 100) / 100),
    overloadDamageMul: 1 + Math.min(0.45, 1 - 0.92 ** overload),
    overloadRangeMul: 1 + Math.min(0.3, 1 - 0.94 ** overload),
    maxStacks,
    stackDamageBonus: route === 'assimilation' ? 0.025 + 0.005 * stackLevel : 0,
    stackDrBonus: route === 'assimilation' ? 0.01 + 0.01 * adaptLevel : 0,
    empoweredDamageBonus: route === 'assimilation' ? 0.15 + 0.1 * recomposeLevel : 0,
    empoweredRadiusBonus: route === 'assimilation' ? 0.25 + 0.05 * recomposeLevel : 0,
    stackDuration: 8 + lv(levels, 'ori_asm_duration'),
    formDuration: 3 + lv(levels, 'ori_asm_duration'),
    ringDamage: route === 'expansion' ? 0.35 + 0.05 * ringLevel : 0,
    residueDuration: route === 'expansion' ? 3 + 0.5 * residueLevel : 0,
    residueDamage: route === 'expansion' ? 0.4 + 0.08 * residueLevel : 0,
    residueSlow: route === 'expansion' ? Math.min(0.55, 0.15 + 0.05 * residueLevel + 0.05 * controlLevel) : 0,
    edgeDamageBonus: route === 'expansion' ? 0.1 + 0.05 * edgeLevel : 0,
    knockbackBonus: route === 'expansion' ? 0.1 * edgeLevel + 0.1 * controlLevel : 0,
    circuitEnergy: route === 'resonance' ? 0.04 + 0.02 * circuitLevel : 0,
    circuitDamage: route === 'resonance' ? 0.05 + 0.03 * coreLevel : 0,
    circuitWindow: ORIGIN_RULES.resonanceWindow + circuitLevel,
    overloadBurstBonus: route === 'resonance' ? 0.15 * burstLevel : 0,
    adaptReduction: 0.1 * lv(levels, 'origin_adapt'),
    motilityBonus: lv(levels, 'origin_motility') > 0 ? 0.04 + 0.04 * lv(levels, 'origin_motility') : 0,
    recoveryLevel: lv(levels, 'origin_recovery'),
    switchLevel: lv(levels, 'ori_res_switch'),
  }
}

/** 黏液震荡的最终数值。超载已与震荡解耦，这里不再有超载乘区。 */
export function getOriginShockProfile(game) {
  const g = getOriginGrowth(game)
  const baseRadius = ORIGIN_BASE.shockRadius + g.shockRangeBonus
  let radius = baseRadius
  let damage = ORIGIN_BASE.shockDamageMul * g.shockDamageMul
  let knockback = 36

  if (g.route === 'expansion') {
    radius *= 1.12 + 0.02 * g.routeInvestment
    damage *= 1 + 0.01 * g.routeInvestment
    knockback *= 1 + g.knockbackBonus
  } else if (g.route === 'assimilation') {
    damage *= 1 + 0.01 * g.routeInvestment
  } else if (g.route === 'resonance') {
    damage *= 1 + 0.015 * g.routeInvestment
  }

  return {
    radius: Math.max(40, Math.round(radius)),
    damageMul: damage,
    knockback,
    growth: g,
  }
}

export function originOverloadDescription(game) {
  const route = game?.originRoute
  const routeInfo = ORIGIN_ROUTES[route]
  const markInfo = ORIGIN_MARKS[game?.originMark]
  const parts = []
  if (routeInfo) parts.push(routeInfo.overloadDesc)
  else parts.push('自动释放默认技能「原质环流」或已吸收的源质记忆')
  if (markInfo) parts.push(`${markInfo.name}回响：${markInfo.overloadDesc}`)
  return `异源能量 ≥${ORIGIN_BASE.overloadCost} 时被动超载自动释放：${parts.join('；')}`
}

export function originShockDescription(game) {
  const route = ORIGIN_ROUTES[game?.originRoute]
  const mark = ORIGIN_MARKS[game?.originMark]
  const g = getOriginGrowth(game)
  const profile = getOriginShockProfile(game, false)
  const base = `周围 ${profile.radius}px 造成 ${profile.damageMul.toFixed(2)} 倍攻击伤害并击退普通敌人`
  const parts = [base]
  if (route) parts.push(`${route.name}：${route.shockDesc}`)
  if (mark) parts.push(`${mark.name}：${mark.shockDesc}`)
  if (g.route === 'assimilation') parts.push(`同化层数 ${game?.player?.mutationState?.stacks || 0}/${g.maxStacks}`)
  if (g.route === 'resonance') parts.push(`共振回路 ${game?.player?.routeState?.resonance?.circuits || 0}/3`)
  parts.push(originOverloadDescription(game))
  return parts.join('；')
}

export function initOriginRouteState(game, route) {
  const p = game?.player
  if (!p) return
  p.routeState = {
    route,
    investment: originInvestment(game, route),
    expansion: { shockCount: 0, lastResidueAt: -Infinity, pendingRings: [] },
    assimilation: { lastStackAt: -Infinity },
    resonance: { sources: [], circuits: 0, circuitTimer: 0 },
  }
  p.mutationState = {
    stacks: 0,
    max: getOriginGrowth(game).maxStacks,
    timer: 0,
    empowered: false,
    formTimer: 0,
  }
  p.overloadState = {
    active: false, timer: 0, route: null, damageMul: 1, radiusMul: 1,
    spent: 0, lastPaidAt: -Infinity, echoTriggered: false,
  }
}

export function initOriginMarkState(game, mark) {
  const p = game?.player
  if (!p) return
  p.markState = {
    mark,
    rank: 1,
    icd: 0,
    icdByFamily: {},
    echoUsed: false,
    bubble: 0,
    bubbleTimer: 0,
    mergedFragment: hasOriginFragment(game, mark),
  }
}

export function resetOriginState(game) {
  const p = game?.player
  if (!p) return
  p.originEnergy = 0
  p.overloadState = {
    active: false, timer: 0, route: null, damageMul: 1, radiusMul: 1,
    spent: 0, lastPaidAt: -Infinity, echoTriggered: false,
  }
  p.mutationState = { stacks: 0, max: ORIGIN_RULES.mutationMaxStacks, timer: 0, empowered: false, formTimer: 0 }
  p.routeState = {
    route: null, investment: 0,
    expansion: { shockCount: 0, lastResidueAt: -Infinity, pendingRings: [] },
    assimilation: { lastStackAt: -Infinity },
    resonance: { sources: [], circuits: 0, circuitTimer: 0 },
  }
  p.markState = {
    mark: null, rank: 0, icd: 0, icdByFamily: {}, echoUsed: false,
    bubble: 0, bubbleTimer: 0, mergedFragment: false,
  }
  p.originGuard = 0
  p.originGuardTimer = 0
  p.originNextHitMul = 1
  p.originRiderIcd = {}
  p.originAdaptReduction = 0
  p.originFormDr = 0
  p.originSwitchReadyAt = -Infinity
}

export function originMilestonePending(game) {
  const level = game?.player?.level || 1
  if (game?.startingStrain !== 'origin') return false
  if (level >= ORIGIN_RULES.routeLevel && !game.originRoute) return true
  return level >= ORIGIN_RULES.markLevel && !!game.originRoute && !game.originMark
}

export function originRouteOptions(game) {
  return Object.values(ORIGIN_ROUTES).map(route => ({
    ...route,
    id: `origin_route_${route.id}`,
    iconId: `spec_origin_route_${route.id}`,
    originRoute: route.id,
    isOriginRoute: true,
    isMilestone: true,
    milestoneType: 'origin_route',
    name: `原生进化：${route.name}`,
    desc: route.desc,
    bonus: route.bonus,
    roadmap: route.roadmap,
    tags: ['🧬 原生进化路线', route.name],
    stats: route.bonus,
    buildNote: originBuildNote(game),
  }))
}

export function originMarkOptions(game) {
  return Object.values(ORIGIN_MARKS).map(mark => ({
    ...mark,
    id: `origin_mark_${mark.id}`,
    iconId: `spec_origin_mark_${mark.id}`,
    originMark: mark.id,
    isOriginMark: true,
    isMilestone: true,
    milestoneType: 'origin_mark',
    name: `异源印记：${mark.name}`,
    desc: mark.desc,
    bonus: `${mark.shockDesc}；超载：${mark.overloadDesc}`,
    roadmap: [mark.shockDesc, mark.overloadDesc],
    tags: ['🧬 异源印记', mark.name],
    stats: mark.bonus || mark.overloadDesc,
    buildNote: originBuildNote(game),
  }))
}

export function originBuildNote(game) {
  if (!game?.originRoute) {
    return '自由变异期：原生核心 + 异源碎片 + 通用卡；Lv.5 选择一条原生路线，碎片最多 2 系。'
  }
  const route = ORIGIN_ROUTES[game.originRoute]
  if (!game.originMark) {
    return `${route.name}已锁定 · 路线投入 ${originInvestment(game, route.id)} · Lv.9 选择一枚异源印记。`
  }
  const mark = ORIGIN_MARKS[game.originMark]
  return `${route.name} + ${mark.name} · 继续强化路线、印记与原生核心；不会开放${mark.name.replace('印记', '')}职业主系统。`
}

function originSkillUsable(game, skill, role) {
  if (!skill || game?.startingStrain !== 'origin') return false
  const level = lv(game.skillLevels, skill.id)
  const max = getEffectiveSkillMaxLevel(game, skill, role)
  if (level >= max) return false
  const req = skill.originRequires
  if (req) {
    if (req.route === true && !game.originRoute) return false
    if (typeof req.route === 'string' && game.originRoute !== req.route) return false
    if (req.mark && game.originMark !== req.mark) return false
  }
  if (skill.originPool === 'fragment') return canOfferOriginFragment(game, skill.fragment)
  if (skill.originPool?.startsWith('route_')) {
    if (!game.originRoute || skill.route !== game.originRoute) return false
  }
  if (skill.originPool === 'mark') {
    if (!game.originMark || skill.mark !== game.originMark) return false
    if ((game.player?.markState?.rank || 1) >= ORIGIN_RULES.maxMarkRank) return false
  }
  return true
}

export function originSkillAvailable(game, skill) {
  if (!skill?.originOnly) return true
  const role = skill.originPool === 'fragment' ? 'origin_fragment'
    : skill.originPool?.startsWith('route_') ? 'origin_route'
    : skill.originPool === 'mark' ? 'origin_mark' : 'origin_common'
  return originSkillUsable(game, skill, role)
}

export function rollOriginSkills(game, count = 3, commonSkills = [], random = Math.random) {
  const level = game?.player?.level || 1
  if (level >= ORIGIN_RULES.routeLevel && !game.originRoute) return originRouteOptions(game)
  if (level >= ORIGIN_RULES.markLevel && game.originRoute && !game.originMark) return originMarkOptions(game)
  if (count <= 0) return []

  const levels = game.skillLevels || {}
  const pool = []
  const push = (skill, role) => {
    if (!originSkillUsable(game, skill, role)) return
    const cur = lv(levels, skill.id)
    pool.push({
      ...skill,
      role,
      progressionRole: role,
      level: cur,
      maxLevel: getEffectiveSkillMaxLevel(game, skill, role),
    })
  }

  for (const skill of ORIGIN_COMMON_SKILLS) push(skill, 'origin_common')
  if (!game.originRoute) {
    for (const skill of ORIGIN_FRAGMENT_SKILLS) {
      if (canOfferOriginFragment(game, skill.fragment)) push(skill, 'origin_fragment')
    }
  } else {
    for (const skill of ORIGIN_ROUTE_SKILLS[game.originRoute] || []) push(skill, 'origin_route')
    if (game.originMark) {
      for (const skill of ORIGIN_MARK_SKILLS) {
        if (skill.mark === game.originMark) push(skill, 'origin_mark')
      }
    }
  }
  for (const skill of commonSkills) {
    if (skill.originOnly) continue
    push(skill, 'common')
  }
  if (game.runSelection?.mode === 'endless' && (game.enemyManager?.wave || 1) >= 25) {
    for (const skill of ENDLESS_SKILLS) push(skill, 'common')
  }

  const weightOf = (skill) => {
    let weight = skill.weight || 1
    if (levels[skill.id]) weight *= ORIGIN_RULES.ownedWeight
    if (game.originRoute && skill.originPool === `route_${game.originRoute}`) weight *= ORIGIN_RULES.routeWeight
    return Math.min(ORIGIN_RULES.maxWeightBoost, weight)
  }
  const drawWeighted = (from) => {
    let ticket = random() * from.reduce((sum, skill) => sum + weightOf(skill), 0)
    let index = 0
    while (index < from.length - 1 && (ticket -= weightOf(from[index])) > 0) index++
    return from[index]
  }

  const choices = []
  while (pool.length && choices.length < count) {
    // 探索期/路线期都保证至少 1 张原生卡，避免三张全通用。
    const firstOrigin = choices.length === 0 && pool.some(skill => skill.originOnly)
    const from = firstOrigin ? pool.filter(skill => skill.originOnly) : pool
    const skill = drawWeighted(from.length ? from : pool)
    pool.splice(pool.indexOf(skill), 1)
    const cur = lv(levels, skill.id)
    const role = skill.role
    choices.push({
      ...skill,
      level: cur,
      role,
      progressionRole: role,
      maxLevel: getEffectiveSkillMaxLevel(game, skill, role),
      tags: [
        ...(skill.tags || []),
        ...(skill.route ? [ORIGIN_ROUTES[skill.route]?.short].filter(Boolean) : []),
      ],
      stats: typeof skill.stats === 'function' ? skill.stats(cur, game) : skill.stats || '',
      buildNote: originBuildNote(game),
    })
  }
  return choices
}
