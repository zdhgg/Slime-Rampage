import { getEffectiveSkillMaxLevel } from './SkillProgression.js'
import { SPELL_ELEMENTS, SPELL_ELEMENT_IDS, getSpellFusion, resolveElementalSkill, ordinarySpellCoreSkills } from './SpellRules.js'

export const ELEMENTAL_BUILD_RULES = Object.freeze({
  choicesBeforeRoute: 5, routeWave: 6, routeStage: 3,
  ultimateLevel: 14, ultimateWave: 10, ultimateStage: 5, ultimateInvestment: 4,
  ownedWeight: 1.2, routeWeight: 1.18, maxWeightBoost: 1.35,
})

export const ELEMENTAL_ROUTES = Object.freeze({
  single: {
    id: 'single', name: '元素君临', short: '极化', icon: '◈', color: '#ffae70',
    desc: '把一种元素推到极限，强化本系法术的覆盖与持续压制。',
    bonus: '当前主元素伤害与范围获得极化加成，空格变为元素君临。',
    skills: ['极化核心', '元素过载'], ultimate: 'ele_single_ultimate', ultimateName: '元素君临',
    ultimateDesc: '短时间让主元素进入极化状态，法术连续强化并追加一次范围爆发。',
  },
  fusion: {
    id: 'fusion', name: '双系融合', short: '融合', icon: '✦', color: '#c9cbff',
    desc: '保留两套自动法术，围绕元素反应建立爆发循环。',
    bonus: '融合反应伤害与触发频率提升，空格保留当前双元素融合术。',
    skills: ['共鸣回路', '反应增幅'], ultimate: 'ele_fusion_ultimate', ultimateName: '融合灾变',
    ultimateDesc: '引爆当前元素对的终极反应，随后短时间内自动重复一次反应。',
  },
  cycle: {
    id: 'cycle', name: '万象轮转', short: '轮转', icon: '⟳', color: '#a8e5f1',
    desc: '掌握三系以上元素，按顺序轮转施法，完成循环后积蓄共鸣爆发。',
    bonus: '三系以上元素按顺序轮转；完成一轮后释放受控共鸣脉冲。',
    skills: ['轮转节拍', '万象回响'], ultimate: 'ele_cycle_ultimate', ultimateName: '万象轮转',
    ultimateDesc: '空格立即完成一轮元素轮转，并在每次命中后追加一次共鸣脉冲。',
  },
})

const routeSkill = (id, name, route, maxLevel, desc, stats, apply, extra = {}) => ({
  id, name, spec: 'elemental', route, kind: 'advanced', maxLevel, desc, stats,
  isElementalSkill: true, growthClass: 'core', tier: 3, weight: .82,
  icon: ELEMENTAL_ROUTES[route].icon, color: ELEMENTAL_ROUTES[route].color,
  tags: ['路线进阶', ELEMENTAL_ROUTES[route].short], apply, ...extra,
})

export const ELEMENTAL_ROUTE_SKILLS = [
  routeSkill('ele_single_focus', '极化核心', 'single', 8,
    '只强化当前主元素；等级越高，主元素法术的范围与伤害越稳定。',
    lv => `主元素伤害 +${Math.min(64, lv * 8)}% · 范围 +${Math.min(32, lv * 4)}%`,
    (game, level) => { game.weaponSystem.spellCombat.routeSingleLevel = level }),
  routeSkill('ele_single_overload', '元素过载', 'single', 6,
    '主元素连续施法后积累过载，达到阈值释放一次不递归的范围爆发。',
    lv => `每 ${Math.max(3, 7 - lv)} 次施法触发 · 爆发伤害 ${80 + lv * 18}%`,
    (game, level) => { game.weaponSystem.spellCombat.routeSingleOverloadLevel = level }),
  routeSkill('ele_fusion_resonance', '共鸣回路', 'fusion', 8,
    '提高当前元素对的反应强度，并缩短同一目标的反应间隔。',
    lv => `融合反应伤害 +${Math.min(72, lv * 9)}% · 间隔 −${Math.min(0.7, lv * .08).toFixed(2)} 秒`,
    (game, level) => { game.weaponSystem.spellCombat.routeFusionLevel = level }),
  routeSkill('ele_fusion_amplify', '反应增幅', 'fusion', 6,
    '融合反应命中后留下短暂余波；余波只结算一次伤害，不递归触发反应。',
    lv => `余波范围 ${60 + lv * 8}px · 伤害 ${35 + lv * 8}%`,
    (game, level) => { game.weaponSystem.spellCombat.routeFusionEchoLevel = level }),
  routeSkill('ele_cycle_tempo', '轮转节拍', 'cycle', 8,
    '缩短轮转间隔，并让轮转中的每种元素获得小幅伤害补偿。',
    lv => `轮转间隔 −${Math.min(36, lv * 4)}% · 轮转伤害 +${Math.min(40, lv * 5)}%`,
    (game, level) => { game.weaponSystem.spellCombat.routeCycleLevel = level }),
  routeSkill('ele_cycle_echo', '万象回响', 'cycle', 6,
    '完成一轮元素轮转后释放一次共鸣脉冲，目标数与范围受控。',
    lv => `脉冲半径 ${70 + lv * 10}px · 伤害 ${45 + lv * 10}% · 最多 ${Math.min(6, 2 + lv)} 个目标`,
    (game, level) => { game.weaponSystem.spellCombat.routeCycleEchoLevel = level }),
  {
    id: 'ele_single_ultimate', name: '🌟 元素君临', spec: 'elemental', route: 'single', kind: 'ultimate',
    maxLevel: 1, isElementalSkill: true, isCapstone: true, tier: 4, weight: .65,
    icon: ELEMENTAL_ROUTES.single.icon, tags: ['互斥终极', '元素君临'], color: ELEMENTAL_ROUTES.single.color,
    desc: ELEMENTAL_ROUTES.single.ultimateDesc, stats: '互斥终极 · 主元素极化爆发',
    apply(game) { game.weaponSystem.spellCombat.routeUltimate = 'single' },
  },
  {
    id: 'ele_fusion_ultimate', name: '🌟 融合灾变', spec: 'elemental', route: 'fusion', kind: 'ultimate',
    maxLevel: 1, isElementalSkill: true, isCapstone: true, tier: 4, weight: .65,
    icon: ELEMENTAL_ROUTES.fusion.icon, tags: ['互斥终极', '双系融合'], color: ELEMENTAL_ROUTES.fusion.color,
    desc: ELEMENTAL_ROUTES.fusion.ultimateDesc, stats: '互斥终极 · 元素反应灾变',
    apply(game) { game.weaponSystem.spellCombat.routeUltimate = 'fusion' },
  },
  {
    id: 'ele_cycle_ultimate', name: '🌟 万象轮转', spec: 'elemental', route: 'cycle', kind: 'ultimate',
    maxLevel: 1, isElementalSkill: true, isCapstone: true, tier: 4, weight: .65,
    icon: ELEMENTAL_ROUTES.cycle.icon, tags: ['互斥终极', '万象轮转'], color: ELEMENTAL_ROUTES.cycle.color,
    desc: ELEMENTAL_ROUTES.cycle.ultimateDesc, stats: '互斥终极 · 全元素轮转爆发',
    apply(game) { game.weaponSystem.spellCombat.routeUltimate = 'cycle' },
  },
]

export const ELEMENTAL_ROUTE_SKILL_BY_ID = Object.fromEntries(ELEMENTAL_ROUTE_SKILLS.map(skill => [skill.id, skill]))

const routeSkillIds = Object.freeze({
  single: ['ele_single_focus', 'ele_single_overload'],
  fusion: ['ele_fusion_resonance', 'ele_fusion_amplify'],
  cycle: ['ele_cycle_tempo', 'ele_cycle_echo'],
})

export function elementalRouteInvestment(game, route = game.weaponSystem?.spellCombat?.route) {
  return (routeSkillIds[route] || []).reduce((sum, id) => sum + (game.skillLevels?.[id] || 0), 0)
}

export function elementalProgressReady(game, ultimate = false) {
  const rules = ELEMENTAL_BUILD_RULES
  return game.runSelection?.mode === 'expedition'
    ? (game.expeditionStage || 1) >= (ultimate ? rules.ultimateStage : rules.routeStage)
    : (game.enemyManager?.wave || 1) >= (ultimate ? rules.ultimateWave : rules.routeWave)
}

export function elementalRouteReady(game) {
  const state = game.weaponSystem?.spellCombat
  return game.startingStrain === 'elemental' && !state?.route && (state?.elements?.size || 0) > 0 &&
    (state?.normalChoices || 0) >= ELEMENTAL_BUILD_RULES.choicesBeforeRoute && elementalProgressReady(game)
}

export function elementalRouteOptions(game) {
  const elements = [...(game.weaponSystem?.spellCombat?.elements || [])]
  return Object.values(ELEMENTAL_ROUTES).map(route => {
    const valid = route.id === 'single' ? elements.length >= 1 : route.id === 'fusion' ? elements.length >= 2 : elements.length >= 3
    return {
      ...route, id: `ele_route_${route.id}`, route: route.id, spec: 'elemental', tier: 2,
      isMilestone: true, isElementalRoute: true, milestoneType: 'elemental', locked: !valid,
      requirement: route.id === 'single' ? '需要至少掌握 1 种元素' : route.id === 'fusion' ? '需要掌握 2 种元素' : '需要掌握 3 种元素',
      investment: elementalRouteInvestment(game, route.id),
      elements: elements.map(id => SPELL_ELEMENTS[id]?.name).filter(Boolean),
      skills: routeSkillIds[route.id].map(id => ELEMENTAL_ROUTE_SKILL_BY_ID[id].name),
    }
  })
}

export function elementalBuildNote(game) {
  const state = game.weaponSystem?.spellCombat, route = ELEMENTAL_ROUTES[state?.route]
  if (!route) return `随机探索单系强化与新元素；选卡满 ${ELEMENTAL_BUILD_RULES.choicesBeforeRoute} 次且第 ${ELEMENTAL_BUILD_RULES.routeWave} 波／远征第 ${ELEMENTAL_BUILD_RULES.routeStage} 章后确认单系、双系或多系轮转。`
  if (state.routeUltimate) return `${route.name}已锁定 · 终极【${route.ultimateName}】已获得 · 元素组合继续生效`
  const ready = (game.player?.level || 1) >= ELEMENTAL_BUILD_RULES.ultimateLevel && elementalProgressReady(game, true)
  return `${route.name}已锁定 · 路线投入 ${elementalRouteInvestment(game)}/${ELEMENTAL_BUILD_RULES.ultimateInvestment} · ${ready ? '终极已进入随机池' : '终极需 Lv.14＋第 10 波／远征第 5 章'} · 达标后不保证抽到`
}

function discoveryCards(game) {
  const owned = new Set(game.weaponSystem?.spellCombat?.elements || [])
  return SPELL_ELEMENT_IDS.filter(id => !owned.has(id)).map(id => ({
    id: `ele_discover_${id}`, name: SPELL_ELEMENTS[id].spell, element: id, kind: 'discovery',
    isElementalDiscovery: true, isElementalSkill: true, spec: 'elemental', tier: 1, weight: .62,
    maxLevel: 1, icon: SPELL_ELEMENTS[id].icon, color: SPELL_ELEMENTS[id].color,
    tags: ['元素发现', SPELL_ELEMENTS[id].name],
    desc: `发现${SPELL_ELEMENTS[id].name}，加入可用法术池。路线确认前可以继续调整元素组合。`,
    stats: '掌握后加入自动施法／轮转序列',
  }))
}

export function elementalSkillAvailable(game, skill) {
  const state = game.weaponSystem?.spellCombat
  if (!skill || game.startingStrain !== 'elemental' || skill.originOnly) return false
  if (skill.isSpellCoreUpgrade) return ordinarySpellCoreSkills(game).some(card => card.id === skill.id)
  const level = game.skillLevels?.[skill.id] || 0
  const role = skill.kind === 'discovery' || skill.kind === 'common' ? 'common' : skill.kind === 'ultimate' || skill.growthClass === 'core' ? 'primary' : 'common'
  if (level >= getEffectiveSkillMaxLevel(game, skill, role)) return false
  if (skill.kind === 'discovery') return !state?.elements?.has(skill.element) && (!state?.route || state.route === 'cycle')
  if (skill.kind === 'common') return true
  if (skill.spec === 'elemental' && skill.kind !== 'advanced' && skill.kind !== 'ultimate') {
    const elements = state?.elements || new Set()
    if (skill.element && !elements.has(skill.element)) return false
    if (skill.element && state?.route && !state.activeElements.includes(skill.element)) return false
    if (['ele_resonance', 'ele_overload'].includes(skill.id) && (state?.route && state.route !== 'fusion' || !state.fusion)) return false
    if (skill.requires?.length && !skill.requires.every(id => (game.skillLevels?.[id] || 0) > 0)) return false
    return true
  }
  if (skill.kind === 'ultimate') return state?.route === skill.route &&
    (game.player?.level || 1) >= ELEMENTAL_BUILD_RULES.ultimateLevel && elementalProgressReady(game, true) &&
    elementalRouteInvestment(game) >= ELEMENTAL_BUILD_RULES.ultimateInvestment &&
    !ELEMENTAL_ROUTE_SKILLS.some(entry => entry.isCapstone && (game.skillLevels?.[entry.id] || 0) > 0)
  if (!state?.route) return false
  return skill.route === state.route
}

export function elementalSkillOptions(game, elementSkills, commonSkills, count = 3, random = Math.random) {
  if (count <= 0) return []
  if (elementalRouteReady(game)) return elementalRouteOptions(game)
  const state = game.weaponSystem?.spellCombat
  const levels = game.skillLevels || {}
  const pool = [
    ...elementSkills.filter(skill => !['ele_resonance', 'ele_overload'].includes(skill.id)),
    ...discoveryCards(game),
    ...ordinarySpellCoreSkills(game),
    ...commonSkills.map(skill => ({ ...skill, kind: 'common' })),
  ].filter(skill => elementalSkillAvailable(game, skill))
  if (state?.fusion && (!state?.route || state.route === 'fusion')) {
    for (const id of ['ele_resonance', 'ele_overload']) {
      const skill = elementSkills.find(entry => entry.id === id)
      if (skill && elementalSkillAvailable(game, skill)) pool.push(skill)
    }
  }
  if (state?.route) pool.push(...ELEMENTAL_ROUTE_SKILLS.filter(skill => elementalSkillAvailable(game, skill)))
  const weight = skill => (skill.weight || 1) * Math.min(ELEMENTAL_BUILD_RULES.maxWeightBoost,
    (levels[skill.id] ? ELEMENTAL_BUILD_RULES.ownedWeight : 1) *
    (state?.route && skill.route === state.route ? ELEMENTAL_BUILD_RULES.routeWeight : 1))
  const choices = []
  while (pool.length && choices.length < count) {
    let ticket = random() * pool.reduce((sum, skill) => sum + weight(skill), 0), index = 0
    while (index < pool.length - 1 && (ticket -= weight(pool[index])) > 0) index++
    const skill = resolveElementalSkill(pool.splice(index, 1)[0], game), level = levels[skill.id] || 0
    const role = skill.kind === 'common' || skill.kind === 'discovery' || skill.growthClass !== 'core' ? 'common' : 'primary'
    choices.push({ ...skill, level, role, progressionRole: role,
      maxLevel: getEffectiveSkillMaxLevel(game, skill, role),
      stats: typeof skill.stats === 'function' ? skill.stats(level, game) : skill.stats || '',
      buildNote: elementalBuildNote(game),
    })
  }
  if ((game.player?.level || 0) % 5 === 3 && !choices.some(skill => skill.id === 'spell_shield')) {
    const shield = elementSkills.find(skill => skill.id === 'spell_shield' && elementalSkillAvailable(game, skill))
    if (shield && choices.length) {
      const level = levels[shield.id] || 0
      choices[choices.length - 1] = { ...shield, level, role: 'common', progressionRole: 'common',
        maxLevel: getEffectiveSkillMaxLevel(game, shield, 'common'),
        stats: typeof shield.stats === 'function' ? shield.stats(level, game) : shield.stats,
        buildNote: elementalBuildNote(game),
      }
    }
  }
  return choices
}

export function elementalRouteSkillIds(route) { return routeSkillIds[route] || [] }

