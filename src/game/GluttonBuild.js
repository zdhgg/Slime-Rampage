import { getEffectiveSkillMaxLevel, getSoftRankMultiplier } from './SkillProgression.js'

export const GLUTTON_RULES = Object.freeze({
  choicesBeforeRoute: 5, routeWave: 6, routeStage: 3,
  ultimateLevel: 14, ultimateWave: 10, ultimateStage: 5, ultimateInvestment: 4,
  ownedWeight: 1.28, routeWeight: 1.18, maxWeightBoost: 1.5,
})

export const GLUTTON_ROUTES = Object.freeze({
  mire: {
    id: 'mire', name: '腐沼吞城', short: '腐沼', icon: '☣', color: '#b5d66f',
    seed: 'glut_maw', seedName: '深渊胃囊', ultimate: 'glut_capstone',
    desc: '扩大体表腐蚀光环与吞噬引力，把贴近的敌群持续软化并卷入口中。',
    bonus: '腐蚀光环范围 +15%、跳伤加快且使圈内敌人承受伤害 +8%；光环与酸沼可将普通敌人压入吞噬线。',
    skills: ['酸蚀沸腾', '胃酸迸发', '腐蚀残渣'], ultimateName: '荒古吞噬领主',
    ultimateDesc: '体型 +25%，光环与咬击范围/伤害 +20%；深渊吸噬可吞噬半血以下血肉敌人，光环内低于 18% 血量的普通猎物直接卷入吞噬。',
  },
  jaw: {
    id: 'jaw', name: '裂颚破阵', short: '裂颚', icon: '⌁', color: '#f28a59',
    seed: 'glut_ram', seedName: '腐蚀重碾', ultimate: 'glut_jaw_ultimate',
    desc: '强化深渊吸噬的碎甲聚怪与闭颚余波，把外围敌群连盾一并扯碎。',
    bonus: '深渊吸噬击碎护盾并无视重盾正面格挡；确认路线时立即获得 1 层胃铠。',
    skills: ['颚震余波', '血宴连噬', '裂颚狂咬', '破阵重压'], ultimateName: '断岳暴食',
    ultimateDesc: '深渊吸噬引力范围 +30% 并震出两道全向碎地震波（第二波震晕 0.6 秒）；单次吸噬吞杀 ≥3 名敌人时触发 3 秒狂怒（移速 +25%、咬击 +35%）。',
  },
  shell: {
    id: 'shell', name: '饕甲反噬', short: '饕甲', icon: '⬟', color: '#e3bd73',
    seed: 'glut_bulk', seedName: '硬化甲壳', ultimate: 'glut_shell_ultimate',
    desc: '强化多层胃铠、高额反伤与吞噬续航；越被敌群围攻，反震爆发越频繁。',
    bonus: '胃铠上限 +1、反伤范围 +20px 且反震冷却 −25%；把挨打变成清屏输出。',
    skills: ['荆棘反胃', '消化代谢', '胃压震慑', '蓄甲爆刺'], ultimateName: '不灭胃铠',
    ultimateDesc: '胃铠上限 +1 且每 3.5 秒自动再生 1 层；满层溢出触发反震；挡伤时释放 1.5 倍超大反震、晕眩近敌并缩短深渊吸噬冷却 0.5 秒。',
  },
})

const routeSkillIds = Object.freeze({
  mire: ['glut_maw', 'glut_acid_aura', 'glut_eruption', 'glut_mire'],
  jaw: ['glut_ram', 'glut_aftershock', 'glut_pounce_reset', 'glut_frenzy_jaw', 'glut_breach'],
  shell: ['glut_bulk', 'glut_counter', 'glut_sub_digest', 'glut_cow', 'glut_thorns_surge'],
})
const sharedCoreIds = new Set(['glut_maw', 'glut_bulk', 'glut_ram'])

const makeRouteSkill = (id, name, route, maxLevel, desc, stats, apply, extra = {}) => ({
  id, name, spec: 'gluttony', route, kind: 'advanced', maxLevel, desc, stats,
  isGluttonSkill: true, growthClass: extra.growthClass || 'common', tier: 3, weight: 0.85,
  icon: route === 'mire' ? '☣' : route === 'jaw' ? '⌁' : '⬟',
  tags: ['路线进阶', GLUTTON_ROUTES[route].short], apply, ...extra,
})

/** 「咬合/胃压震慑」（饕甲进阶卡）：受光环/反伤/咬击命中的非首领敌人出手伤害折扣与持续时间。 */
export const gluttonCowPowerAt = level => Math.min(0.64, 0.26 + Math.max(0, Math.floor(Number(level) || 0)) * 0.07)
export const gluttonCowDurationAt = level => Math.min(4.2, 1.6 + Math.max(0, Math.floor(Number(level) || 0)) * 0.25)

/** 酸蚀沸腾：光环半径、伤害加成与融甲易伤；前 4 级全额，之后递减。 */
export const gluttonAcidAuraBonusAt = level => {
  const n = Math.max(0, Math.floor(Number(level) || 0))
  return Math.min(4, n) * 10 + Math.min(72, Math.max(0, n - 4) * 9)
}
export const gluttonAcidAuraDamageAt = level => {
  const n = Math.max(0, Math.floor(Number(level) || 0))
  return 1 + Math.min(4, n) * 0.15 + Math.min(0.6, Math.max(0, n - 4) * 0.08)
}
export const gluttonAcidAuraVulnAt = level => Math.min(0.32, 0.04 + Math.max(0, Math.floor(Number(level) || 0)) * 0.04)

/** 荆棘反胃：反伤半径与基础倍率。 */
export const gluttonCounterRadiusAt = level => Math.min(230, 112 + Math.max(0, Math.floor(Number(level) || 0)) * 11)
export const gluttonCounterDamageAt = level => Math.min(2.4, 0.75 + Math.max(0, Math.floor(Number(level) || 0)) * 0.18)

/** 血宴连噬：每次吞噬/击杀返还深渊吸噬冷却与单次封顶比例。 */
export const gluttonPounceResetPerKillAt = level => Math.min(1.1, 0.2 + Math.min(3, Math.max(0, Math.floor(Number(level) || 0))) * 0.15 + Math.max(0, Math.floor(Number(level) || 0) - 3) * 0.08)
export const gluttonPounceResetCapRatioAt = level => Math.min(0.72, 0.35 + Math.max(0, Math.floor(Number(level) || 0)) * 0.08)

/** 裂颚狂咬：吸噬重咬后咬击攻速与额外弧度。 */
export const gluttonFrenzyHasteAt = level => {
  const n = Math.max(0, Math.floor(Number(level) || 0))
  return n <= 3 ? [0, 0.18, 0.25, 0.32][n] : 0.32 + Math.min(0.28, (n - 3) * 0.05)
}
export const gluttonFrenzyArcDegAt = level => {
  const n = Math.max(0, Math.floor(Number(level) || 0))
  return n <= 3 ? [0, 45, 65, 85][n] : 85 + Math.min(60, (n - 3) * 12)
}

/** 破阵重压：吸噬重咬额外伤害与易伤。 */
export const gluttonBreachDamageAt = level => {
  const n = Math.max(0, Math.floor(Number(level) || 0))
  return Math.min(4, n) * 0.12 + Math.min(0.56, Math.max(0, n - 4) * 0.07)
}
export const gluttonBreachVulnAt = level => Math.min(0.32, 0.05 + Math.max(0, Math.floor(Number(level) || 0)) * 0.05)

/** 贪婪巨口（T1）：咬击弧度、攻速与伤害的前段全额 + 后段递减。 */
export const gluttonBiteSweepArcDegAt = level => {
  const n = Math.max(0, Math.floor(Number(level) || 0))
  return Math.min(3, n) * 18 + Math.min(48, Math.max(0, n - 3) * 10)
}
export const gluttonBiteSweepHasteAt = level => {
  const n = Math.max(0, Math.floor(Number(level) || 0))
  return Math.min(3, n) * 0.06 + Math.min(0.2, Math.max(0, n - 3) * 0.03)
}
export const gluttonBiteSweepDamageAt = level => {
  const n = Math.max(0, Math.floor(Number(level) || 0))
  return Math.min(4, n) * 0.12 + Math.min(0.32, Math.max(0, n - 4) * 0.08)
}
/** 硬化甲壳反震对受击/挡伤的基础倍率。 */
export const gluttonBulkReflectScaleAt = level => {
  const n = Math.max(0, Math.floor(Number(level) || 0))
  return 1 + Math.min(4, n) * 0.15 + Math.min(0.56, Math.max(0, n - 4) * 0.07)
}
/** 蓄甲爆刺：爆刺威力倍率。 */
export const gluttonThornsSurgeScaleAt = level => {
  const n = Math.max(0, Math.floor(Number(level) || 0))
  return n <= 3 ? [0, 1.35, 1.75, 2.2][n] : 2.2 + Math.min(0.8, (n - 3) * 0.16)
}
/** 胃酸迸发：吞噬酸爆的半径与伤害倍率。 */
export const gluttonEruptionRadiusAt = level => {
  const n = Math.max(0, Math.floor(Number(level) || 0))
  return 105 + Math.min(4, n) * 12 + Math.min(32, Math.max(0, n - 4) * 8)
}
export const gluttonEruptionDamageAt = level => {
  const n = Math.max(0, Math.floor(Number(level) || 0))
  return 0.9 + Math.min(4, n) * 0.35 + Math.min(0.6, Math.max(0, n - 4) * 0.15)
}
/** 颚震余波：冲击半径与伤害倍率。 */
export const gluttonAftershockRadiusAt = level => 145 + Math.min(10, Math.max(0, Math.floor(Number(level) || 0))) * 14
export const gluttonAftershockDamageAt = level => 0.5 + Math.min(10, Math.max(0, Math.floor(Number(level) || 0))) * 0.14
/** 消化代谢：吞噬/酸浪后的百分比减伤。 */
export const gluttonSubDigestDrAt = level => [0, 0.18, 0.26, 0.34, 0.4, 0.45, 0.5][Math.min(6, Math.max(0, Math.floor(Number(level) || 0)))] || 0.5

export const GLUTTON_ROUTE_SKILLS = [
  // —— 腐沼吞城（mire） ——
  makeRouteSkill('glut_acid_aura', '酸蚀沸腾', 'mire', 8,
    '大幅扩大体表腐蚀光环范围与跳伤威力，使圈内敌人减速并承受额外伤害（对首领同样生效）。',
    lv => `光环半径 +${gluttonAcidAuraBonusAt(lv + 1)}px · 伤害 +${Math.round((gluttonAcidAuraDamageAt(lv + 1) - 1) * 100)}% · 额外融甲 +${Math.round(gluttonAcidAuraVulnAt(lv + 1) * 100)}%`,
    (game, level) => { game.player.gluttonAcidAuraLevel = level },
    { growthClass: 'core' }),
  makeRouteSkill('glut_eruption', '胃酸迸发', 'mire', 8,
    '吞噬或深渊吸噬咬合时爆发近身强酸溅射，减速周围普通敌人并将残血猎物压入吞噬线（每 0.35 秒最多一次）。',
    lv => `酸爆半径 ${gluttonEruptionRadiusAt(lv + 1)}px · 伤害 ×${gluttonEruptionDamageAt(lv + 1).toFixed(2)} · 减速 0.8 秒`,
    (game, level) => { game.player.devourAcidBurst = level },
    { growthClass: 'core' }),
  makeRouteSkill('glut_mire', '腐蚀残渣', 'mire', 8,
    '吞噬或深渊吸噬咬合后在原处留下沸腾酸沼，周期伤害并减速附近敌人，同时牵引圈内白旗猎物；酸沼可将普通敌人压进吞噬线。',
    lv => `酸沼半径 ${64 + Math.min(9, lv + 1) * 8}px · 持续 ${Math.min(4.6, 2.6 + (lv + 1) * 0.3).toFixed(1)} 秒`,
    (game, level) => { game.player.gluttonMireLevel = level },
    { growthClass: 'core' }),

  // —— 裂颚破阵（jaw） ——
  makeRouteSkill('glut_aftershock', '颚震余波', 'jaw', 8,
    '深渊吸噬闭颚重咬与普攻咬击后追加冲击余波，可将外围敌人震入吞噬线；余波不递归触发自身。',
    lv => `余波伤害 ${Math.round(gluttonAftershockDamageAt(lv + 1) * 100)}% · 范围 ${gluttonAftershockRadiusAt(lv + 1)}px`,
    (game, level) => { game.player.gluttonAftershockLevel = level },
    { growthClass: 'core' }),
  makeRouteSkill('glut_pounce_reset', '血宴连噬', 'jaw', 8,
    '深渊吸噬每吞噬或击杀敌人，返还深渊吸噬冷却时间，拉聚吞食敌群后更快凝聚下一口。',
    lv => `每吞杀返还 ${gluttonPounceResetPerKillAt(lv + 1).toFixed(2)} 秒 · 单次至多返还 ${Math.round(gluttonPounceResetCapRatioAt(lv + 1) * 100)}% 冷却`,
    (game, level) => { game.player.gluttonPounceResetLevel = level },
    { growthClass: 'core' }),
  makeRouteSkill('glut_frenzy_jaw', '裂颚狂咬', 'jaw', 8,
    '深渊吸噬咬合后 3 秒内进入狂咬狂热：大幅拓宽普攻咬击扇角并提高咬击攻速。',
    lv => `咬击弧度 +${gluttonFrenzyArcDegAt(lv + 1)}° · 攻速 +${Math.round(gluttonFrenzyHasteAt(lv + 1) * 100)}%（持续 3 秒）`,
    (game, level) => { game.player.gluttonFrenzyJawLevel = level },
    { growthClass: 'core' }),
  makeRouteSkill('glut_breach', '破阵重压', 'jaw', 8,
    '大幅提高深渊吸噬重咬伤害，并使命中目标 3 秒内承受伤害提高（对精英与首领同样生效）。',
    lv => `吸噬伤害 +${Math.round(gluttonBreachDamageAt(lv + 1) * 100)}% · 命中易伤 +${Math.round(gluttonBreachVulnAt(lv + 1) * 100)}%`,
    (game, level) => { game.player.gluttonBreachLevel = level },
    { growthClass: 'core' }),
  {
    id: 'glut_jaw_ultimate', name: '🌟 断岳暴食', spec: 'gluttony', route: 'jaw', kind: 'ultimate',
    maxLevel: 1, desc: GLUTTON_ROUTES.jaw.ultimateDesc, stats: '互斥终极 · 引力 +30% · 双重碎地震波 · 狂怒增益',
    isGluttonSkill: true, isCapstone: true, tier: 4, weight: 0.65, icon: '⌁',
    tags: ['互斥终极', '裂颚破阵'], apply(game) { game.player.gluttonJawUltimate = true },
  },

  // —— 饕甲反噬（shell） ——
  makeRouteSkill('glut_counter', '荆棘反胃', 'shell', 8,
    '大幅强化胃铠挡伤与受击时的 360° 酸刺反震；反震伤害额外受自身生命上限加成，并可将敌人震入吞噬线。',
    lv => `反震半径 ${gluttonCounterRadiusAt(lv + 1)}px · 威力 ${Math.round(gluttonCounterDamageAt(lv + 1) * 100)}%（每点最大生命 +5%）`,
    (game, level) => { game.player.gluttonCounterLevel = level },
    { growthClass: 'core' }),
  makeRouteSkill('glut_sub_digest', '消化代谢', 'shell', 6,
    '吞噬或触发饱食酸浪时恢复 1 点生命（共享 3.5 秒间隔），并获得 3.5 秒百分比减伤。',
    lv => `恢复 +1 生命（3.5 秒冷却）· 减伤 ${Math.round(gluttonSubDigestDrAt(lv + 1) * 100)}%`,
    (game, level) => {
      game.player.devourHeal = true
      game.player.devourDamageReduction = gluttonSubDigestDrAt(level)
    },
    { growthClass: 'core',
      rankCaps: { expedition: { hard: 6, hell: 6 }, timed: 6, endless: 6 } }),
  makeRouteSkill('glut_cow', '胃压震慑', 'shell', 8,
    '被腐蚀光环、反震或咬击命中的非首领敌人在短时间内出手伤害大幅降低；刷新时长不叠加。',
    lv => `出手伤害 −${Math.round(gluttonCowPowerAt(lv + 1) * 100)}% · 持续 ${gluttonCowDurationAt(lv + 1).toFixed(1)} 秒`,
    (game, level) => { game.player.gluttonCowLevel = level },
    { growthClass: 'core' }),
  makeRouteSkill('glut_thorns_surge', '蓄甲爆刺', 'shell', 8,
    '每通过胃铠挡伤或受击承受 3 次攻击，自动向外爆射一轮高伤穿透钢刺并立刻再生 1 层胃铠。',
    lv => `爆刺威力 ${Math.round(gluttonThornsSurgeScaleAt(lv + 1) * 100)}% 反伤 · 立即 +1 层胃铠`,
    (game, level) => { game.player.gluttonThornsSurgeLevel = level },
    { growthClass: 'core' }),
  {
    id: 'glut_shell_ultimate', name: '🌟 不灭胃铠', spec: 'gluttony', route: 'shell', kind: 'ultimate',
    maxLevel: 1, desc: GLUTTON_ROUTES.shell.ultimateDesc, stats: '互斥终极 · 甲上限 +1 · 自动再生 · 挡伤缩 CD',
    isGluttonSkill: true, isCapstone: true, tier: 4, weight: 0.65, icon: '⬟',
    tags: ['互斥终极', '饕甲反噬'], apply(game) { game.player.gluttonShellUltimate = true },
  },
]

export const GLUTTON_ENDLESS_SKILL = {
  id: 'glut_endless_hunger', name: '无尽饥肠', spec: 'gluttony', kind: 'endless', maxLevel: Infinity,
  growthClass: 'endless', isGluttonSkill: true, isEndlessGlutton: true, weight: 0.4,
  icon: '∞', tags: ['无尽精通', '暴食'],
  desc: '无尽模式中提升咬击、深渊吸噬、腐蚀光环、反伤与路线衍生伤害；每级收益递减并趋近软上限。',
  stats(level) { return `累计暴食伤害 +${((getSoftRankMultiplier(level + 1, 0.035, 5, 1.4) - 1) * 100).toFixed(1)}%（上限趋近 +40%）` },
  apply(game) { game.weaponSystem.gluttonCombat.refreshStats() },
}

export const GLUTTON_SKILL_BY_ID = Object.fromEntries(GLUTTON_ROUTE_SKILLS.concat(GLUTTON_ENDLESS_SKILL).map(skill => [skill.id, skill]))

export function getGluttonEndlessDamageMultiplier(levels = {}) {
  const rank = Math.max(0, Math.floor(Number(levels.glut_endless_hunger) || 0))
  return getSoftRankMultiplier(rank, 0.035, 5, 1.4)
}

export function getGluttonHeavyDamageMultiplier(level = 0) {
  const rank = Math.max(0, Math.floor(Number(level) || 0))
  return rank <= 3 ? 1 + rank * 0.15 : 1.45 + 0.75 * (1 - 0.9 ** (rank - 3))
}

export function getGluttonHeavyReachMultiplier(level = 0) {
  const rank = Math.max(0, Math.floor(Number(level) || 0))
  return rank <= 3 ? 1 + rank * 0.1 : 1.3 + 0.7 * (1 - 0.9 ** (rank - 3))
}

export function gluttonRouteInvestment(game, route) {
  return (routeSkillIds[route] || []).reduce((sum, id) => sum + (game.skillLevels?.[id] || 0), 0)
}

export function gluttonProgressReady(game, ultimate = false) {
  const rules = GLUTTON_RULES
  return game.runSelection?.mode === 'expedition'
    ? (game.expeditionStage || 1) >= (ultimate ? rules.ultimateStage : rules.routeStage)
    : (game.enemyManager?.wave || 1) >= (ultimate ? rules.ultimateWave : rules.routeWave)
}

export function gluttonRouteReady(game) {
  const state = game.weaponSystem?.gluttonCombat
  return game.startingStrain === 'glutton' && game.primarySpec === 'gluttony' && !state?.route &&
    (state?.normalChoices || 0) >= GLUTTON_RULES.choicesBeforeRoute && gluttonProgressReady(game) &&
    Object.values(GLUTTON_ROUTES).some(route => game.skillLevels?.[route.seed] > 0)
}

function hasOtherUltimate(game) {
  return Object.values(GLUTTON_ROUTES).some(route => (game.skillLevels?.[route.ultimate] || 0) > 0)
}

function routeSkillAvailable(game, skill, baseSkills) {
  if (!game.primarySpec) return skill.kind === 'common' || skill.tier === 1
  const route = game.weaponSystem?.gluttonCombat?.route
  if (skill.isEndlessGlutton) return game.runSelection?.mode === 'endless' && (game.enemyManager?.wave || 1) >= 25
  const routeId = skill.route || (skill.id === 'glut_capstone' ? 'mire' : null)
  if (skill.isCapstone || skill.kind === 'ultimate') {
    return !!route && route === routeId && (game.player?.level || 1) >= GLUTTON_RULES.ultimateLevel &&
      gluttonProgressReady(game, true) && gluttonRouteInvestment(game, route) >= GLUTTON_RULES.ultimateInvestment &&
      !hasOtherUltimate(game)
  }
  if (skill.isGluttonSkill) return !!route && route === routeId
  if (!sharedCoreIds.has(skill.id) && skill.id !== 'glut_bite_sweep') {
    if (!route) return false
    if (route && routeId && route !== routeId) return false
  }
  if (skill.requires?.length && !skill.requires.some(id => (game.skillLevels?.[id] || 0) > 0)) return false
  if (skill.tier === 2) {
    const invested = baseSkills.reduce((sum, current) => sum + (game.skillLevels?.[current.id] || 0), 0)
    if (invested < 2) return false
  }
  return true
}

export function gluttonSkillAvailable(game, skill, baseSkills) {
  if (game.startingStrain !== 'glutton' || !skill) return false
  if (skill.originOnly) return false
  const role = skill.kind === 'common' ? 'common' : 'primary'
  if ((game.skillLevels?.[skill.id] || 0) >= getEffectiveSkillMaxLevel(game, skill, role)) return false
  if (skill.kind === 'common' || skill.growthClass === 'common') {
    // 暴食路线进阶卡虽然 growthClass 可为 common，但带有 isGluttonSkill 与 route 限制，不能绕过路线检查。
    if (skill.isGluttonSkill) return routeSkillAvailable(game, skill, baseSkills)
    return true
  }
  return routeSkillAvailable(game, skill, baseSkills)
}

export function gluttonRouteOptions(game) {
  return Object.values(GLUTTON_ROUTES).map(route => ({
    ...route, id: `glut_route_${route.id}`, route: route.id, spec: 'gluttony',
    isMilestone: true, isGluttonRoute: true, milestoneType: 'glutton',
    locked: !(game.skillLevels?.[route.seed] > 0),
    requirement: `需要【${route.seedName}】Lv.1`,
    investment: gluttonRouteInvestment(game, route.id),
  }))
}

export function gluttonBuildNote(game) {
  const state = game.weaponSystem?.gluttonCombat
  const route = GLUTTON_ROUTES[state?.route]
  if (!route) return `随机探索胃囊、甲壳与重碾，每次至少出现 1 个方向入口；选卡满 ${GLUTTON_RULES.choicesBeforeRoute} 次且第 ${GLUTTON_RULES.routeWave} 波／远征第 ${GLUTTON_RULES.routeStage} 章后，根据已获得入口确认路线。`
  if (game.skillLevels?.[route.ultimate]) return `${route.name}已锁定 · 终极【${route.ultimateName}】已获得 · 已学基础技能继续生效`
  const ready = (game.player?.level || 1) >= GLUTTON_RULES.ultimateLevel && gluttonProgressReady(game, true)
  return `${route.name}已锁定 · 路线投入 ${gluttonRouteInvestment(game, route.id)}/${GLUTTON_RULES.ultimateInvestment} · ${ready ? '终极已进入随机池' : '终极需 Lv.14＋第 10 波／远征第 5 章'} · 达标后不保证抽到`
}

export function rollGluttonSkills(game, count, baseSkills, commonSkills, random = Math.random) {
  if (count <= 0) return []
  if (gluttonRouteReady(game)) return gluttonRouteOptions(game)
  const levels = game.skillLevels || {}
  const pool = [...baseSkills, ...GLUTTON_ROUTE_SKILLS, ...commonSkills.map(skill => ({ ...skill, kind: 'common' }))]
    .filter(skill => gluttonSkillAvailable(game, skill, baseSkills))
  if (game.runSelection?.mode === 'endless' && (game.enemyManager?.wave || 1) >= 25 &&
      gluttonSkillAvailable(game, GLUTTON_ENDLESS_SKILL, baseSkills)) pool.push(GLUTTON_ENDLESS_SKILL)
  const route = game.weaponSystem?.gluttonCombat?.route
  const weight = skill => (skill.weight || 1) * Math.min(GLUTTON_RULES.maxWeightBoost,
    (levels[skill.id] ? GLUTTON_RULES.ownedWeight : 1) *
    (route && (skill.route === route || sharedCoreIds.has(skill.id)) ? GLUTTON_RULES.routeWeight : 1))
  const drawWeighted = (from) => {
    let ticket = random() * from.reduce((sum, skill) => sum + weight(skill), 0), index = 0
    while (index < from.length - 1 && (ticket -= weight(from[index])) > 0) index++
    return from[index]
  }
  const choices = []
  while (pool.length && choices.length < count) {
    const entrances = !route && choices.length === 0
      ? pool.filter(skill => sharedCoreIds.has(skill.id))
      : []
    const skill = drawWeighted(entrances.length ? entrances : pool)
    pool.splice(pool.indexOf(skill), 1)
    const level = levels[skill.id] || 0
    const role = skill.kind === 'common' ? 'common' : 'primary'
    choices.push({ ...skill, level, role, progressionRole: role,
      maxLevel: getEffectiveSkillMaxLevel(game, skill, role),
      tags: [...(skill.tags || []), ...(skill.route ? [GLUTTON_ROUTES[skill.route]?.short].filter(Boolean) : [])],
      stats: typeof skill.stats === 'function' ? skill.stats(level, game) : skill.stats || '',
      buildNote: gluttonBuildNote(game),
    })
  }
  return choices
}
