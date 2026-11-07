import { getEffectiveSkillMaxLevel } from './SkillProgression.js'

export const SHADOW_RULES = Object.freeze({
  choicesBeforeRoute: 5, routeWave: 6, routeStage: 3,
  ultimateLevel: 14, ultimateWave: 10, ultimateStage: 5, ultimateInvestment: 4,
  ownedWeight: 1.16, routeWeight: 1.18, maxWeightBoost: 1.3,
})

export const SHADOW_ROUTES = Object.freeze({
  hunt: {
    id: 'hunt', name: '瞬影猎杀', short: '猎杀', icon: '⌖', color: '#84d6e8',
    seed: 'shadow_hunt_mark', seedName: '猎杀印记',
    desc: '影袭锁定猎物，本体与分身随后集中追斩，击杀后继续切入下一群。',
    bonus: '影袭首击留下猎杀印记；印记目标受到本体与分身的额外伤害。',
    skills: ['追猎步伐', '致命回势', '猎手直觉'], ultimate: 'shadow_hunt_ultimate', ultimateName: '无间影袭',
    ultimateDesc: '影袭命中后短时间获得一次免费追击，可连续穿过两条敌阵；追击不刷新冷却。',
  },
  swarm: {
    id: 'swarm', name: '群影军团', short: '群影', icon: '✣', color: '#c39be6',
    seed: 'ass_echo', seedName: '影生共鸣',
    desc: '暴击不断唤出影身，分头压制后排；影袭时分身响应集火。',
    bonus: '影袭指令强化分身突袭；分身击杀可有限延长其他影身的停留时间。',
    skills: ['影刃合击', '影潮续燃'], ultimate: 'ass_capstone', ultimateName: '群影共舞',
    ultimateDesc: '分身影刃获得有限贯穿，影袭夹击展开十字斩；分身数量仍最多四只。',
  },
  blade: {
    id: 'blade', name: '裂影刃潮', short: '刃潮', icon: '⌁', color: '#f18ba5',
    seed: 'ass_cleave', seedName: '裂影横斩',
    desc: '贴身近战暴击带出横斩，用连续刀光覆盖身边怪群。',
    bonus: '横斩扩大覆盖并获得一次受控回响；影袭仍可切入和脱身。',
    skills: ['弧刃扩散', '裂影回响'], ultimate: 'shadow_blade_ultimate', ultimateName: '永夜刃域',
    ultimateDesc: '影袭落点展开短暂刃域，按固定节拍斩击附近敌人；脉冲不递归触发横斩。',
  },
})

export const SHADOW_SEED_IDS = Object.freeze(Object.values(SHADOW_ROUTES).map(route => route.seed))

const make = (id, name, route, maxLevel, desc, stats, apply, extra = {}) => ({
  id, name, spec: 'assassin', route, kind: 'advanced', maxLevel, desc, stats, apply,
  isShadowSkill: true, growthClass: 'core', tier: 3, weight: .82,
  icon: SHADOW_ROUTES[route].icon, color: SHADOW_ROUTES[route].color,
  tags: ['路线进阶', SHADOW_ROUTES[route].short], ...extra,
})
const huntBonusAt = level => Math.min(.72, .12 + Math.min(8, level) * .06 + Math.max(0, level - 8) * .015)
const huntRefundAt = level => Math.min(1.8, .5 + Math.min(6, level) * .16 + Math.max(0, level - 6) * .08)
const swarmMultiplierAt = level => Math.min(3.1, 2 + Math.min(8, level) * .12 + Math.max(0, level - 8) * .035)
const swarmRecoveryAt = level => Math.min(1.5, Math.min(6, level) * .2 + Math.max(0, level - 6) * .05)
const bladeRangeAt = level => Math.min(90, Math.min(8, level) * 9 + Math.max(0, level - 8) * 3)
const bladeTargetsAt = level => Math.min(10, 4 + Math.min(6, level))
const bladeEchoAt = level => Math.min(.68, .3 + Math.min(6, level) * .05 + Math.max(0, level - 6) * .02)
/** 「猎手直觉」：本体击杀射手/法师时返还的影袭冷却（秒），软封顶 1.6。 */
export const shadowHuntRangedRefundAt = level => Math.min(1.6, .65 + Math.max(0, Math.floor(Number(level) || 0)) * .15)

export const SHADOW_ROUTE_SKILLS = [
  {
    id: 'shadow_hunt_mark', name: '猎杀印记', spec: 'assassin', route: 'hunt', kind: 'seed',
    maxLevel: 1, isShadowSkill: true, tier: 1, weight: .9, icon: '⌖', color: SHADOW_ROUTES.hunt.color,
    tags: ['方向入口', '猎杀'], desc: '普通选卡时发现猎杀方向。中期确认猎杀路线后，影袭首击标记目标。',
    stats: '路线入口 · 影袭首击标记猎物', apply(game) { game.weaponSystem.shadowCombat.huntMarkLevel = 1 },
  },
  make('shadow_hunt_pursuit', '追猎步伐', 'hunt', 8,
    '提高猎杀标记目标承受的本体与分身伤害；高等级收益递减并封顶。',
    lv => `标记目标额外承伤 +${Math.round(huntBonusAt(lv) * 100)}%`,
    (game, level) => { game.weaponSystem.shadowCombat.huntPursuitLevel = level },
    { rankCaps: { expedition: { hard: 7, hell: 10 }, timed: 8, endless: 12 } }),
  make('shadow_hunt_reap', '致命回势', 'hunt', 8,
    '影袭击杀时返还更多冷却；每次影袭最多返还一次，首领不产生额外击杀返还。',
    lv => `击杀返还 ${huntRefundAt(lv).toFixed(2)} 秒 · 每次最多一次`,
    (game, level) => { game.weaponSystem.shadowCombat.huntReapLevel = level },
    { rankCaps: { expedition: { hard: 8, hell: 10 }, timed: 8, endless: 10 } }),
  make('shadow_hunt_refund', '猎手直觉', 'hunt', 4,
    '本体击杀射手或法师时额外返还影袭冷却；分身、横斩与余波击杀不产生返还。',
    lv => `击杀远程敌人返还影袭 ${shadowHuntRangedRefundAt(lv + 1).toFixed(2)} 秒`,
    (game, level) => { game.weaponSystem.shadowCombat.huntRefundLevel = level }),
  make('shadow_swarm_assault', '影刃合击', 'swarm', 8,
    '提高影袭指挥分身突袭的伤害；突袭不触发暴击生影。',
    lv => `分身夹击伤害 ${Math.round(swarmMultiplierAt(lv) * 100)}%`,
    (game, level) => { game.weaponSystem.shadowCombat.swarmAssaultLevel = level },
    { rankCaps: { expedition: { hard: 7, hell: 10 }, timed: 8, endless: 12 } }),
  make('shadow_swarm_reap', '影潮续燃', 'swarm', 8,
    '分身击杀后，为附近其他分身恢复少量持续时间；恢复量受单次上限约束。',
    lv => `每次分身击杀恢复 ${swarmRecoveryAt(lv).toFixed(2)} 秒 · 不超过原始寿命`,
    (game, level) => { game.weaponSystem.shadowCombat.swarmReapLevel = level },
    { rankCaps: { expedition: { hard: 8, hell: 10 }, timed: 8, endless: 12 } }),
  make('shadow_blade_arc', '弧刃扩散', 'blade', 8,
    '扩大暴击横斩的覆盖距离与可命中目标数，目标数有上限。',
    lv => `横斩距离 +${bladeRangeAt(lv)}px · 最多 ${bladeTargetsAt(lv)} 个目标`,
    (game, level) => { game.weaponSystem.shadowCombat.bladeArcLevel = level },
    { rankCaps: { expedition: { hard: 7, hell: 10 }, timed: 8, endless: 12 } }),
  make('shadow_blade_echo', '裂影回响', 'blade', 8,
    '横斩命中后短暂延迟再斩一次；回响只结算伤害，不暴击、不递归触发。',
    lv => `回响伤害 ${Math.round(bladeEchoAt(lv) * 100)}% · 延迟 0.18 秒`,
    (game, level) => { game.weaponSystem.shadowCombat.bladeEchoLevel = level },
    { rankCaps: { expedition: { hard: 8, hell: 10 }, timed: 8, endless: 10 } }),
  {
    id: 'shadow_hunt_ultimate', name: '🌟 无间影袭', spec: 'assassin', route: 'hunt', kind: 'ultimate',
    maxLevel: 1, isShadowSkill: true, isCapstone: true, tier: 4, weight: .6,
    icon: '⌖', color: SHADOW_ROUTES.hunt.color, tags: ['互斥终极', '瞬影猎杀'],
    desc: SHADOW_ROUTES.hunt.ultimateDesc, stats: '互斥终极 · 影袭后一次免费追击',
    apply(game) { game.weaponSystem.shadowCombat.routeUltimate = 'hunt' },
  },
  {
    id: 'shadow_blade_ultimate', name: '🌟 永夜刃域', spec: 'assassin', route: 'blade', kind: 'ultimate',
    maxLevel: 1, isShadowSkill: true, isCapstone: true, tier: 4, weight: .6,
    icon: '⌁', color: SHADOW_ROUTES.blade.color, tags: ['互斥终极', '裂影刃潮'],
    desc: SHADOW_ROUTES.blade.ultimateDesc, stats: '互斥终极 · 影袭后落点刃域',
    apply(game) { game.weaponSystem.shadowCombat.routeUltimate = 'blade' },
  },
  {
    id: 'ass_capstone', name: '🌟 群影共舞', spec: 'assassin', route: 'swarm', kind: 'ultimate',
    maxLevel: 1, isShadowSkill: true, isCapstone: true, tier: 4, weight: .6,
    icon: '✣', color: SHADOW_ROUTES.swarm.color, tags: ['互斥终极', '群影军团'],
    desc: SHADOW_ROUTES.swarm.ultimateDesc, stats: '互斥终极 · 分身有限贯穿与十字夹击',
    apply(game) { game.weaponSystem.shadowCombat.routeUltimate = 'swarm'; game.player.shadowCloneLord = true },
  },
]

export const SHADOW_ROUTE_SKILL_BY_ID = Object.fromEntries(SHADOW_ROUTE_SKILLS.map(skill => [skill.id, skill]))

const investmentIds = Object.freeze({
  hunt: ['shadow_hunt_mark', 'shadow_hunt_pursuit', 'shadow_hunt_reap', 'shadow_hunt_refund'],
  swarm: ['ass_echo', 'shadow_swarm_assault', 'shadow_swarm_reap'],
  blade: ['ass_cleave', 'shadow_blade_arc', 'shadow_blade_echo'],
})

export function shadowRouteInvestment(game, route = game.weaponSystem?.shadowCombat?.route) {
  return (investmentIds[route] || []).reduce((sum, id) => sum + (game.skillLevels?.[id] || 0), 0)
}

export function shadowProgressReady(game, ultimate = false) {
  const rules = SHADOW_RULES
  return game.runSelection?.mode === 'expedition'
    ? (game.expeditionStage || 1) >= (ultimate ? rules.ultimateStage : rules.routeStage)
    : (game.enemyManager?.wave || 1) >= (ultimate ? rules.ultimateWave : rules.routeWave)
}

export function shadowRouteReady(game) {
  const state = game.weaponSystem?.shadowCombat
  return game.startingStrain === 'shadow' && game.primarySpec === 'assassin' && !state?.route &&
    (state?.normalChoices || 0) >= SHADOW_RULES.choicesBeforeRoute && shadowProgressReady(game) &&
    SHADOW_SEED_IDS.some(id => (game.skillLevels?.[id] || 0) > 0)
}

function hasOtherUltimate(game) {
  return SHADOW_ROUTES && Object.values(SHADOW_ROUTES).some(route => {
    const id = route.ultimate
    return (game.skillLevels?.[id] || 0) > 0
  })
}

export function shadowSkillAvailable(game, skill) {
  if (game.startingStrain !== 'shadow' || !skill || skill.originOnly) return false
  const state = game.weaponSystem?.shadowCombat, route = state?.route, levels = game.skillLevels || {}
  const role = skill.kind === 'common' && skill.growthClass !== 'core' ? 'common' : 'primary'
  if ((levels[skill.id] || 0) >= getEffectiveSkillMaxLevel(game, skill, role)) return false
  if (skill.kind === 'ultimate' || skill.isCapstone) return !!route && route === skill.route &&
    (game.player?.level || 1) >= SHADOW_RULES.ultimateLevel && shadowProgressReady(game, true) &&
    shadowRouteInvestment(game, route) >= SHADOW_RULES.ultimateInvestment && !hasOtherUltimate(game)
  if (skill.kind === 'seed') return !route || route === skill.route
  const flex = skill.kind === 'flex'
  if (flex && route && route !== skill.route) return false
  if (skill.requires?.length && !skill.requires.some(id => (levels[id] || 0) > 0)) return false
  if (skill.kind === 'common' || skill.growthClass === 'common') return true
  if (skill.isShadowSkill) return flex ? (!route || route === skill.route) : !!route && route === skill.route
  return true
}

export function shadowRouteOptions(game) {
  return Object.values(SHADOW_ROUTES).map(route => ({
    ...route, id: `shadow_route_${route.id}`, route: route.id, spec: 'assassin',
    isMilestone: true, isShadowRoute: true, milestoneType: 'shadow',
    locked: !(game.skillLevels?.[route.seed] > 0),
    requirement: `需要【${route.seedName}】Lv.1`,
    investment: shadowRouteInvestment(game, route.id),
  }))
}

export function shadowBuildNote(game) {
  const state = game.weaponSystem?.shadowCombat, route = SHADOW_ROUTES[state?.route]
  if (!route) return `随机探索猎杀、群影与刃潮入口；选卡满 ${SHADOW_RULES.choicesBeforeRoute} 次且第 ${SHADOW_RULES.routeWave} 波／远征第 ${SHADOW_RULES.routeStage} 章后确认方向。`
  if (state.routeUltimate) return `${route.name}已锁定 · 终极【${route.ultimateName}】已获得 · 已学暗影能力继续生效`
  const ready = (game.player?.level || 1) >= SHADOW_RULES.ultimateLevel && shadowProgressReady(game, true)
  return `${route.name}已锁定 · 路线投入 ${shadowRouteInvestment(game)}/${SHADOW_RULES.ultimateInvestment} · ${ready ? '终极已进入随机池' : '终极需 Lv.14＋第 10 波／远征第 5 章'} · 达标后不保证抽到`
}

function withShadowPresentation(skill, game, level) {
  const route = SHADOW_ROUTES[skill.route]
  const role = skill.kind === 'common' && skill.growthClass !== 'core' ? 'common' : 'primary'
  return {
    ...skill, isShadowSkill: true, level, role, progressionRole: role,
    maxLevel: getEffectiveSkillMaxLevel(game, skill, role),
    tags: [...(skill.tags || []), ...(route ? [route.short] : [])],
    stats: typeof skill.stats === 'function' ? skill.stats(level, game) : skill.stats || '',
    buildNote: shadowBuildNote(game),
  }
}

export function getShadowSkill(id, baseSkills = [], commonSkills = []) {
  const special = SHADOW_ROUTE_SKILL_BY_ID[id]
  if (special) return special
  const common = commonSkills.find(skill => skill.id === id)
  if (common) return { ...common, kind: 'common' }
  const base = baseSkills.find(skill => skill.id === id)
  if (!base) return null
  const skill = { ...base }
  if (id === 'ass_echo') Object.assign(skill, { kind: 'seed', route: 'swarm', isShadowSkill: true })
  if (id === 'ass_cleave') Object.assign(skill, { kind: 'seed', route: 'blade', isShadowSkill: true, requires: [] })
  if (['ass_execute', 'ass_decoy', 'ass_legion'].includes(id)) Object.assign(skill, { kind: 'flex', route: 'swarm', isShadowSkill: true })
  if (id === 'ass_afterimage') Object.assign(skill, { kind: 'common', isShadowSkill: true })
  if (id === 'ass_lethal' || id === 'ass_stride') Object.assign(skill, { kind: 'common' })
  return skill
}

export function rollShadowSkills(game, count, baseSkills, commonSkills, random = Math.random) {
  if (count <= 0) return []
  if (shadowRouteReady(game)) return shadowRouteOptions(game)
  const levels = game.skillLevels || {}, route = game.weaponSystem?.shadowCombat?.route
  const specialIds = new Set(SHADOW_ROUTE_SKILLS.map(skill => skill.id))
  const base = baseSkills.filter(skill => skill.spec === 'assassin' && !specialIds.has(skill.id))
    .map(skill => getShadowSkill(skill.id, baseSkills, commonSkills)).filter(Boolean)
  const pool = [...base, ...SHADOW_ROUTE_SKILLS,
    ...commonSkills.map(skill => ({ ...skill, kind: 'common' }))]
    .filter(skill => shadowSkillAvailable(game, skill))
  const weight = skill => (skill.weight || 1) * Math.min(SHADOW_RULES.maxWeightBoost,
    (levels[skill.id] ? SHADOW_RULES.ownedWeight : 1) * (route && skill.route === route ? SHADOW_RULES.routeWeight : 1))
  const drawWeighted = candidates => {
    let ticket = random() * candidates.reduce((sum, skill) => sum + weight(skill), 0), index = 0
    while (index < candidates.length - 1 && (ticket -= weight(candidates[index])) > 0) index++
    return candidates[index]
  }
  const choices = []
  while (pool.length && choices.length < count) {
    // The first ordinary pick introduces one random direction, never a fixed path.
    const entrances = !route && choices.length === 0 ? pool.filter(skill => SHADOW_SEED_IDS.includes(skill.id)) : []
    const skill = drawWeighted(entrances.length ? entrances : pool)
    pool.splice(pool.indexOf(skill), 1)
    choices.push(withShadowPresentation(skill, game, levels[skill.id] || 0))
  }
  return choices
}
