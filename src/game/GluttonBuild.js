import { getEffectiveSkillMaxLevel, getSoftRankMultiplier } from './SkillProgression.js'

export const GLUTTON_RULES = Object.freeze({
  choicesBeforeRoute: 5, routeWave: 6, routeStage: 3,
  ultimateLevel: 14, ultimateWave: 10, ultimateStage: 5, ultimateInvestment: 4,
  ownedWeight: 1.2, routeWeight: 1.15, maxWeightBoost: 1.35,
})

export const GLUTTON_ROUTES = Object.freeze({
  mire: {
    id: 'mire', name: '腐沼吞城', short: '腐沼', icon: '☣', color: '#b5d66f',
    seed: 'glut_maw', seedName: '深渊胃囊', ultimate: 'glut_capstone',
    desc: '扩大吞噬与胃酸收益，让每次成功捕食都能继续清理周围怪群。',
    bonus: '吞噬后酸液残留；酸液伤害不会递归吞噬或返还猎食点。',
    skills: ['胃酸迸发', '腐蚀残渣'], ultimateName: '荒古吞噬领主',
    ultimateDesc: '保留领主体型与吞噬强化；重咬可吞噬半血以下的普通血肉敌人。',
  },
  jaw: {
    id: 'jaw', name: '裂颚破阵', short: '裂颚', icon: '⌁', color: '#f28a59',
    seed: 'glut_ram', seedName: '腐蚀重碾', ultimate: 'glut_jaw_ultimate',
    desc: '强化重咬的扇形覆盖与冲击，让猎食点转化成正面清场爆发。',
    bonus: '重咬命中后追加一次前向震荡波；每次重咬最多触发一轮。',
    skills: ['腐蚀重碾', '颚震余波'], ultimateName: '断岳暴食',
    ultimateDesc: '重咬后释放两道逐渐衰减的前向余震，每个目标每道余震最多受击一次。',
  },
  shell: {
    id: 'shell', name: '饕甲反噬', short: '饕甲', icon: '⬟', color: '#e3bd73',
    seed: 'glut_bulk', seedName: '硬化甲壳', ultimate: 'glut_shell_ultimate',
    desc: '培养甲壳与捕食续航；护甲挡住攻击时反击近身敌群。',
    bonus: '反击共享护甲触发节奏，不叠加护甲，也不额外生成猎食点。',
    skills: ['硬化甲壳', '消化代谢', '反胃脉冲'], ultimateName: '不灭胃铠',
    ultimateDesc: '重咬命中后补上一次捕食护甲；护甲挡伤时释放更强的近身反击。',
  },
})

const routeSkillIds = Object.freeze({
  mire: ['glut_maw', 'glut_eruption', 'glut_mire'],
  jaw: ['glut_ram', 'glut_aftershock'],
  shell: ['glut_bulk', 'glut_counter'],
})
const sharedCoreIds = new Set(['glut_maw', 'glut_bulk', 'glut_ram'])

const makeRouteSkill = (id, name, route, maxLevel, desc, stats, apply) => ({
  id, name, spec: 'gluttony', route, kind: 'advanced', maxLevel, desc, stats,
  isGluttonSkill: true, growthClass: 'core', tier: 3, weight: 0.8,
  icon: route === 'mire' ? '☣' : route === 'jaw' ? '⌁' : '⬟',
  tags: ['路线进阶', GLUTTON_ROUTES[route].short], apply,
})

export const GLUTTON_ROUTE_SKILLS = [
  makeRouteSkill('glut_mire', '腐蚀残渣', 'mire', 4,
    '每次正常吞噬后在猎物位置留下短暂酸沼，周期伤害附近敌人；酸沼不触发吞噬、猎食点或其他捕食效果。',
    lv => `酸沼半径 ${46 + Math.min(7, lv) * 5}px · 持续 ${Math.min(3.2, 2.2 + lv * 0.2).toFixed(1)} 秒 · 伤害随等级递减成长`,
    (game, level) => { game.player.gluttonMireLevel = level }),
  makeRouteSkill('glut_aftershock', '颚震余波', 'jaw', 3,
    '重咬命中后追加一道前向震荡波；余波只造成伤害，不追加重咬、吞噬或猎食点。',
    lv => `余波伤害 ${Math.round((0.3 + Math.min(5, lv - 1) * 0.08) * 100)}% · 前向范围 ${120 + Math.min(5, lv) * 12}px`,
    (game, level) => { game.player.gluttonAftershockLevel = level }),
  makeRouteSkill('glut_counter', '反胃脉冲', 'shell', 4,
    '捕食护甲挡下攻击时，对周围敌人释放一次反击；伤害不触发吞噬与猎食点。',
    lv => `反击半径 ${92 + Math.min(6, lv) * 8}px · 伤害 ${Math.round((0.4 + Math.min(5, lv - 1) * 0.08) * 100)}%`,
    (game, level) => { game.player.gluttonCounterLevel = level }),
  {
    id: 'glut_jaw_ultimate', name: '🌟 断岳暴食', spec: 'gluttony', route: 'jaw', kind: 'ultimate',
    maxLevel: 1, desc: GLUTTON_ROUTES.jaw.ultimateDesc, stats: '互斥终极 · 重咬后两道前向余震',
    isGluttonSkill: true, isCapstone: true, tier: 4, weight: 0.65, icon: '⌁',
    tags: ['互斥终极', '裂颚破阵'], apply(game) { game.player.gluttonJawUltimate = true },
  },
  {
    id: 'glut_shell_ultimate', name: '🌟 不灭胃铠', spec: 'gluttony', route: 'shell', kind: 'ultimate',
    maxLevel: 1, desc: GLUTTON_ROUTES.shell.ultimateDesc, stats: '互斥终极 · 重咬补甲 · 护甲反击强化',
    isGluttonSkill: true, isCapstone: true, tier: 4, weight: 0.65, icon: '⬟',
    tags: ['互斥终极', '饕甲反噬'], apply(game) { game.player.gluttonShellUltimate = true },
  },
]

export const GLUTTON_ENDLESS_SKILL = {
  id: 'glut_endless_hunger', name: '无尽饥肠', spec: 'gluttony', kind: 'endless', maxLevel: Infinity,
  growthClass: 'endless', isGluttonSkill: true, isEndlessGlutton: true, weight: 0.4,
  icon: '∞', tags: ['无尽精通', '暴食'],
  desc: '无尽模式中提升咬击、重咬与路线衍生伤害；每级收益递减并趋近软上限。',
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
  return rank <= 3 ? 1 + rank * 0.15 : 1.45 + 0.9 * (1 - 0.9 ** (rank - 3))
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
  const routeId = skill.route || (skill.id === 'glut_eruption' || skill.id === 'glut_capstone' ? 'mire' : null)
  if (skill.isCapstone || skill.kind === 'ultimate') {
    return !!route && route === routeId && (game.player?.level || 1) >= GLUTTON_RULES.ultimateLevel &&
      gluttonProgressReady(game, true) && gluttonRouteInvestment(game, route) >= GLUTTON_RULES.ultimateInvestment &&
      !hasOtherUltimate(game) && (skill.id !== 'glut_capstone' || (game.skillLevels?.glut_eruption || 0) > 0)
  }
  if (skill.isGluttonSkill) return !!route && route === routeId
  if (!sharedCoreIds.has(skill.id)) {
    // The original acid branch remains available during the pre-route deepening
    // phase; once a route is confirmed, only its branch survives.
    if (!route && skill.id !== 'glut_eruption') return false
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
  if (skill.kind === 'common' || skill.growthClass === 'common') return true
  if (skill === GLUTTON_ENDLESS_SKILL || skill.isEndlessGlutton) return routeSkillAvailable(game, skill, baseSkills)
  return routeSkillAvailable(game, skill, baseSkills)
}

export function gluttonRouteOptions(game) {
  return Object.values(GLUTTON_ROUTES).map(route => {
    return {
      ...route, id: `glut_route_${route.id}`, route: route.id, spec: 'gluttony',
      isMilestone: true, isGluttonRoute: true, milestoneType: 'glutton',
      locked: !(game.skillLevels?.[route.seed] > 0),
      requirement: `需要【${route.seedName}】Lv.1`,
      investment: gluttonRouteInvestment(game, route.id),
    }
  })
}

export function gluttonBuildNote(game) {
  const state = game.weaponSystem?.gluttonCombat
  const route = GLUTTON_ROUTES[state?.route]
  if (!route) return `随机探索胃囊、甲壳与重咬，每次至少出现 1 个方向入口；选卡满 ${GLUTTON_RULES.choicesBeforeRoute} 次且第 ${GLUTTON_RULES.routeWave} 波／远征第 ${GLUTTON_RULES.routeStage} 章后，根据已获得入口确认路线。`
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
  // 加权无放回抽一张；调用方保证 from 非空且权重恒正。
  const drawWeighted = (from) => {
    let ticket = random() * from.reduce((sum, skill) => sum + weight(skill), 0), index = 0
    while (index < from.length - 1 && (ticket -= weight(from[index])) > 0) index++
    return from[index]
  }
  const choices = []
  while (pool.length && choices.length < count) {
    // 探索期保底：三选一里至少出现 1 个方向入口。此前只有 2 个 T1 入口对 5 张通用卡，
    // 约 29% 的升级一面全是通用卡，体感像「专精技能坏了」。路线确认后不再保底，
    // 避免稀释本路线的进阶卡；入口全部满级时自动退化为普通抽取。
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
