import { setCritSource } from './CritSources.js'
import { getEffectiveSkillMaxLevel, getSoftRankMultiplier } from './SkillProgression.js'

export const SHADOW_RULES = Object.freeze({
  choicesBeforeRoute: 5, routeWave: 6, routeStage: 3,
  ultimateLevel: 14, ultimateWave: 10, ultimateStage: 5, ultimateInvestment: 4,
  ownedWeight: 1.25, routeWeight: 1.18, maxWeightBoost: 1.5,
})

export const SHADOW_ROUTES = Object.freeze({
  hunt: {
    id: 'hunt', name: '瞬影猎杀', short: '猎杀', icon: '⌖', color: '#84d6e8',
    seed: 'shadow_hunt_mark', seedName: '猎杀印记',
    desc: '影袭锁定猎物，本体与分身随后集中追斩，压制并收割后排法系目标。',
    bonus: '影袭首击留下猎杀印记；印记目标受到本体与分身的额外伤害，阵亡时爆散影斩并自动传染给附近可见目标（最多连锁 3 次）；对首领与远程敌人暴击率额外 +10%。',
    skills: ['追猎步伐', '致命回势', '猎手直觉', '破法绝杀'], ultimate: 'shadow_hunt_ultimate', ultimateName: '无间影袭',
    ultimateDesc: '影袭命中后短时间获得一次免费追击，可连续穿过两条敌阵（追击不刷新冷却）；追击命中时立即恢复 1 层暗影魔盾（6 秒内至多一次）。',
  },
  swarm: {
    id: 'swarm', name: '群影军团', short: '群影', icon: '✣', color: '#c39be6',
    seed: 'ass_echo', seedName: '影生共鸣',
    desc: '暴击不断唤出影身，分身共享暴击并护主挡弹；影袭时群影响应集火。',
    bonus: '影袭指令强化分身突袭；本体第 3 刀影波同步唤起全分身劈出共鸣影刃；分身击杀可有限延长其他影身时间；分身基础暴击继承率额外 +15%。',
    skills: ['影刃合击', '影潮续燃', '影契共暴', '影幕护主'], ultimate: 'ass_capstone', ultimateName: '群影共舞',
    ultimateDesc: '分身影刃获得有限贯穿，影袭夹击展开十字斩并在分身未满时立即补足 1 只分身；分身数量仍最多四只。',
  },
  blade: {
    id: 'blade', name: '裂影刃潮', short: '刃潮', icon: '⌁', color: '#f18ba5',
    seed: 'ass_cleave', seedName: '裂影横斩',
    desc: '贴身近战暴击与闪避带出高频横斩，以连续刀光切碎法球与敌群。',
    bonus: '横斩扩大覆盖并获得一次受控回响；第 3 刀影波可切碎沿途法球，多目标暴击额外缩短横斩冷却；每次暴击触发横斩时加快魔盾充能 0.4 秒并缩短影袭冷却 0.15 秒。',
    skills: ['弧刃扩散', '裂影回响', '虚影反刃', '噬法刃舞'], ultimate: 'shadow_blade_ultimate', ultimateName: '永夜刃域',
    ultimateDesc: '影袭落点展开短暂刃域，按固定节拍斩击附近敌人；身处刃域内闪避率 +8%、暗影魔盾充能速度 +35%。',
  },
})

export const SHADOW_SEED_IDS = Object.freeze(Object.values(SHADOW_ROUTES).map(route => route.seed))

const make = (id, name, route, maxLevel, desc, stats, apply, extra = {}) => ({
  id, name, spec: 'assassin', route, kind: 'advanced', maxLevel, desc, stats, apply,
  isShadowSkill: true, growthClass: extra.growthClass || 'core', tier: 3, weight: .82,
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
/** 「猎手直觉」：本体击杀射手/法师/炼金时返还的影袭冷却（秒），软封顶 1.6。 */
export const shadowHuntRangedRefundAt = level => Math.min(1.6, .65 + Math.max(0, Math.floor(Number(level) || 0)) * .15)
export const shadowHuntSpellbreakCritAt = level => {
  const n = Math.max(0, Math.floor(Number(level) || 0))
  return n <= 4 ? [0, 0.25, 0.45, 0.65, 0.85][n] : 0.85 + Math.min(0.35, (n - 4) * 0.07)
}
export const shadowSwarmCritInheritAt = level => {
  const n = Math.max(0, Math.floor(Number(level) || 0))
  return n <= 3 ? n * 0.12 : 0.36 + Math.min(0.24, (n - 3) * 0.04)
}
export const shadowSwarmCritMulAt = level => {
  const n = Math.max(0, Math.floor(Number(level) || 0))
  return n <= 3 ? n * 0.22 : 0.66 + Math.min(0.44, (n - 3) * 0.08)
}
export const shadowSwarmBulwarkBlocksAt = level => (level >= 6 ? 3 : level >= 3 ? 2 : level >= 1 ? 1 : 0)
export const shadowSwarmBulwarkBurstAt = level => (level > 0 ? Math.min(1.7, 0.55 + Math.max(0, Math.floor(Number(level) || 0)) * 0.15) : 0)
export const shadowBladeRiposteReachAt = level => {
  const n = Math.max(0, Math.floor(Number(level) || 0))
  return 75 + Math.min(5, n) * 12 + Math.max(0, n - 5) * 7
}
export const shadowBladeRiposteDmgAt = level => {
  const n = Math.max(0, Math.floor(Number(level) || 0))
  return 1.0 + Math.min(5, n) * 0.25 + Math.min(0.55, Math.max(0, n - 5) * 0.11)
}
export const shadowBladeRendOrbsAt = level => (level > 0 ? Math.min(6, 2 + Math.max(0, Math.floor(Number(level) || 0))) : 0)
export const shadowBladeRendDmgMulAt = level => {
  const n = Math.max(0, Math.floor(Number(level) || 0))
  return 1 + Math.min(5, n) * 0.12 + Math.min(0.4, Math.max(0, n - 5) * 0.08)
}

export const SHADOW_ROUTE_SKILLS = [
  {
    id: 'shadow_hunt_mark', name: '猎杀印记', spec: 'assassin', route: 'hunt', kind: 'seed',
    maxLevel: 1, isShadowSkill: true, tier: 1, weight: .9, icon: '⌖', color: SHADOW_ROUTES.hunt.color,
    tags: ['方向入口', '猎杀'], desc: '普通选卡时发现猎杀方向。中期确认猎杀路线后，影袭首击标记目标；击杀标记目标额外获得 2 点影魄。',
    stats: '路线入口 · 影袭首击标记猎物 · 猎杀击杀 +2 影魄', apply(game) { game.weaponSystem.shadowCombat.huntMarkLevel = 1 },
  },
  make('shadow_hunt_pursuit', '追猎步伐', 'hunt', 8,
    '提高猎杀标记目标承受的本体与分身伤害；高等级收益递减并封顶。',
    lv => `标记目标额外承伤 +${Math.round(huntBonusAt(lv) * 100)}%`,
    (game, level) => { game.weaponSystem.shadowCombat.huntPursuitLevel = level },
    { rankCaps: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 } }),
  make('shadow_hunt_reap', '致命回势', 'hunt', 8,
    '影袭击杀时返还更多影袭冷却并加速暗影魔盾充能；每次影袭最多返还一次。',
    lv => `击杀返还 ${huntRefundAt(lv).toFixed(2)} 秒 · 魔盾充能 +${Math.min(3, 1.0 + lv * 0.25).toFixed(2)} 秒`,
    (game, level) => { game.weaponSystem.shadowCombat.huntReapLevel = level },
    { rankCaps: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 } }),
  make('shadow_hunt_refund', '猎手直觉', 'hunt', 8,
    '本体击杀法师、弓手或炼金投弹手时返还影袭冷却，并立即加速暗影魔盾充能。',
    lv => `击杀远程返还影袭 ${shadowHuntRangedRefundAt(lv + 1).toFixed(2)} 秒 · 魔盾充能 +${(2 + Math.min(1.6, (lv + 1) * 0.25)).toFixed(2)} 秒`,
    (game, level) => { game.weaponSystem.shadowCombat.huntRefundLevel = level }),
  make('shadow_hunt_spellbreak', '破法绝杀', 'hunt', 8,
    '提高本体暴击伤害；影袭命中标记目标或远程敌人时压制非首领攻击节奏，并加速暗影魔盾充能。',
    lv => `暴伤 +${shadowHuntSpellbreakCritAt(lv + 1).toFixed(2)} 倍 · 压制施法 ${Math.min(2.6, 1.2 + (lv + 1) * 0.2).toFixed(1)} 秒 · 魔盾充能 +${Math.min(3.6, 1.2 + (lv + 1) * 0.3).toFixed(1)} 秒`,
    (game, level) => {
      game.weaponSystem.shadowCombat.huntSpellbreakLevel = level
      setCritSource(game, 'hunt_spellbreak', { multiplier: shadowHuntSpellbreakCritAt(level) })
    }),
  make('shadow_swarm_assault', '影刃合击', 'swarm', 8,
    '提高影袭指挥分身突袭的伤害；突袭不触发暴击生影。',
    lv => `分身夹击伤害 ${Math.round(swarmMultiplierAt(lv) * 100)}%`,
    (game, level) => { game.weaponSystem.shadowCombat.swarmAssaultLevel = level },
    { rankCaps: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 } }),
  make('shadow_swarm_reap', '影潮续燃', 'swarm', 8,
    '分身击杀后，为附近其他分身恢复少量持续时间；恢复量受单次上限约束。',
    lv => `每次分身击杀恢复 ${swarmRecoveryAt(lv).toFixed(2)} 秒 · 不超过原始寿命`,
    (game, level) => { game.weaponSystem.shadowCombat.swarmReapLevel = level },
    { rankCaps: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 } }),
  make('shadow_swarm_crit', '影契共暴', 'swarm', 8,
    '大幅提高分身的暴击继承率与暴击伤害；分身每次暴击额外加速暗影魔盾充能 0.25 秒。',
    lv => `分身暴击继承 +${Math.round(shadowSwarmCritInheritAt(lv + 1) * 100)}% · 分身暴伤 +${shadowSwarmCritMulAt(lv + 1).toFixed(2)} 倍`,
    (game, level) => { game.weaponSystem.shadowCombat.swarmCritLevel = level },
    { rankCaps: { expedition: { hard: 8, hell: 10 }, timed: 8, endless: 11 } }),
  make('shadow_swarm_bulwark', '影幕护主', 'swarm', 8,
    '新生成或刷新的分身自带免费挡弹护甲；分身消散时在原地爆出影斩，且每只分身加速魔盾充能。',
    lv => `免费挡弹 ${shadowSwarmBulwarkBlocksAt(lv + 1)} 次 · 消散斩 ${Math.round(shadowSwarmBulwarkBurstAt(lv + 1) * 100)}% · 魔盾充能 +${[12, 16, 20, 25, 28, 31, 34, 36][Math.min(7, lv)]}%/只`,
    (game, level) => { game.weaponSystem.shadowCombat.swarmBulwarkLevel = level }),
  make('shadow_blade_arc', '弧刃扩散', 'blade', 8,
    '扩大暴击横斩的覆盖距离与可命中目标数，目标数有上限。',
    lv => `横斩距离 +${bladeRangeAt(lv)}px · 最多 ${bladeTargetsAt(lv)} 个目标`,
    (game, level) => { game.weaponSystem.shadowCombat.bladeArcLevel = level },
    { rankCaps: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 } }),
  make('shadow_blade_echo', '裂影回响', 'blade', 8,
    '横斩命中后短暂延迟再斩一次；回响只结算伤害，不暴击、不递归触发。',
    lv => `回响伤害 ${Math.round(bladeEchoAt(lv) * 100)}% · 延迟 0.18 秒`,
    (game, level) => { game.weaponSystem.shadowCombat.bladeEchoLevel = level },
    { rankCaps: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 11 } }),
  make('shadow_blade_riposte', '虚影反刃', 'blade', 8,
    '闪避或暗影魔盾挡下法术时立即挥出周身反击横斩（受 0.45 秒冷却约束），并短暂提升暴击率。',
    lv => `反刃半径 ${shadowBladeRiposteReachAt(lv + 1)}px · 伤害 ${Math.round(shadowBladeRiposteDmgAt(lv + 1) * 100)}% · 暴击 +${15 + (lv + 1) * 5}%`,
    (game, level) => { game.weaponSystem.shadowCombat.bladeRiposteLevel = level }),
  make('shadow_blade_rend', '噬法刃舞', 'blade', 8,
    '横斩与永夜刃域可斩碎触及的普通法术弹幕，每斩碎一发加速魔盾充能 0.45 秒，并提高横斩与刃域伤害。',
    lv => `单次切碎至多 ${shadowBladeRendOrbsAt(lv + 1)} 发法球 · 横斩/刃域伤害 +${Math.round((shadowBladeRendDmgMulAt(lv + 1) - 1) * 100)}%`,
    (game, level) => { game.weaponSystem.shadowCombat.bladeRendLevel = level }),
  {
    id: 'shadow_hunt_ultimate', name: '🌟 无间影袭', spec: 'assassin', route: 'hunt', kind: 'ultimate',
    maxLevel: 1, isShadowSkill: true, isCapstone: true, tier: 4, weight: .6,
    icon: '⌖', color: SHADOW_ROUTES.hunt.color, tags: ['互斥终极', '瞬影猎杀'],
    desc: SHADOW_ROUTES.hunt.ultimateDesc, stats: '互斥终极 · 免费追击＋追击恢复魔盾',
    apply(game) { game.weaponSystem.shadowCombat.routeUltimate = 'hunt' },
  },
  {
    id: 'shadow_blade_ultimate', name: '🌟 永夜刃域', spec: 'assassin', route: 'blade', kind: 'ultimate',
    maxLevel: 1, isShadowSkill: true, isCapstone: true, tier: 4, weight: .6,
    icon: '⌁', color: SHADOW_ROUTES.blade.color, tags: ['互斥终极', '裂影刃潮'],
    desc: SHADOW_ROUTES.blade.ultimateDesc, stats: '互斥终极 · 落点刃域＋域内闪避魔盾强化',
    apply(game) { game.weaponSystem.shadowCombat.routeUltimate = 'blade' },
  },
  {
    id: 'ass_capstone', name: '🌟 群影共舞', spec: 'assassin', route: 'swarm', kind: 'ultimate',
    maxLevel: 1, isShadowSkill: true, isCapstone: true, tier: 4, weight: .6,
    icon: '✣', color: SHADOW_ROUTES.swarm.color, tags: ['互斥终极', '群影军团'],
    desc: SHADOW_ROUTES.swarm.ultimateDesc, stats: '互斥终极 · 分身贯穿＋十字夹击＋自动补影',
    apply(game) { game.weaponSystem.shadowCombat.routeUltimate = 'swarm'; game.player.shadowCloneLord = true },
  },
]

export const SHADOW_ENDLESS_SKILL = {
  id: 'shadow_endless_eclipse', name: '无尽影蚀', spec: 'assassin', kind: 'endless', maxLevel: Infinity,
  growthClass: 'endless', isShadowSkill: true, isEndlessShadow: true, weight: 0.4,
  icon: '∞', color: '#c39be6', tags: ['无尽精通', '暗影'],
  desc: '无尽模式中稳步强化本体影刃、影袭、横斩、刃域与分身伤害及暴击伤害；每级收益递减并趋近软上限。',
  stats(level) {
    return `累计暗影伤害 +${((getSoftRankMultiplier(level + 1, 0.04, 5, 1.45) - 1) * 100).toFixed(1)}%（上限趋近 +45%）`
  },
  apply(game, level) {
    if (game.weaponSystem?.shadowCombat) game.weaponSystem.shadowCombat.endlessEclipseLevel = level
    const bonusMul = (getSoftRankMultiplier(level, 0.08, 4, 1.8) - 1)
    setCritSource(game, 'endless_eclipse', { multiplier: Number(bonusMul.toFixed(4)) })
  },
}

export const SHADOW_ROUTE_SKILL_BY_ID = Object.fromEntries(SHADOW_ROUTE_SKILLS.map(skill => [skill.id, skill]))

const investmentIds = Object.freeze({
  hunt: ['shadow_hunt_mark', 'shadow_hunt_pursuit', 'shadow_hunt_reap', 'shadow_hunt_refund', 'shadow_hunt_spellbreak'],
  swarm: ['ass_echo', 'shadow_swarm_assault', 'shadow_swarm_reap', 'shadow_swarm_crit', 'shadow_swarm_bulwark'],
  blade: ['ass_cleave', 'shadow_blade_arc', 'shadow_blade_echo', 'shadow_blade_riposte', 'shadow_blade_rend'],
})

export function getShadowEndlessDamageMultiplier(levels = {}) {
  const rank = Math.max(0, Math.floor(Number(levels?.shadow_endless_eclipse) || 0))
  return getSoftRankMultiplier(rank, 0.04, 5, 1.45)
}

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
  if (skill.isEndlessShadow) return game.runSelection?.mode === 'endless' && (game.enemyManager?.wave || 1) >= 25
  const role = skill.kind === 'common' && skill.growthClass !== 'core' ? 'common' : 'primary'
  if ((levels[skill.id] || 0) >= getEffectiveSkillMaxLevel(game, skill, role)) return false
  if (skill.kind === 'ultimate' || skill.isCapstone) return !!route && route === skill.route &&
    (game.player?.level || 1) >= SHADOW_RULES.ultimateLevel && shadowProgressReady(game, true) &&
    shadowRouteInvestment(game, route) >= SHADOW_RULES.ultimateInvestment && !hasOtherUltimate(game)
  if (skill.kind === 'seed') return !route || route === skill.route
  const flex = skill.kind === 'flex'
  if (flex && route && route !== skill.route) return false
  if (skill.requires?.length && !skill.requires.some(id => (levels[id] || 0) > 0)) return false
  if (skill.kind === 'common' || skill.growthClass === 'common') {
    // 暗影路线进阶卡（即使 growthClass 为 common）带有 route，不能越过路线检查。
    if (skill.isShadowSkill && skill.route) return !!route && route === skill.route
    return true
  }
  if (skill.isShadowSkill) return flex ? (!route || route === skill.route) : (!skill.route || (!!route && route === skill.route))
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
  if (id === SHADOW_ENDLESS_SKILL.id) return SHADOW_ENDLESS_SKILL
  const special = SHADOW_ROUTE_SKILL_BY_ID[id]
  if (special) return special
  const common = commonSkills.find(skill => skill.id === id)
  if (common) return { ...common, kind: 'common' }
  const base = baseSkills.find(skill => skill.id === id)
  if (!base) return null
  const skill = { ...base }
  if (id === 'ass_echo') Object.assign(skill, { kind: 'seed', route: 'swarm', isShadowSkill: true })
  if (id === 'ass_cleave') Object.assign(skill, { kind: 'seed', route: 'blade', isShadowSkill: true, requires: [] })
  if (['ass_afterimage', 'ass_execute', 'ass_decoy', 'ass_legion', 'ass_ward', 'ass_lethal', 'ass_stride'].includes(id)) {
    Object.assign(skill, { kind: 'common', isShadowSkill: true })
  }
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
  if (game.runSelection?.mode === 'endless' && (game.enemyManager?.wave || 1) >= 25 &&
    shadowSkillAvailable(game, SHADOW_ENDLESS_SKILL)) {
    pool.push(SHADOW_ENDLESS_SKILL)
  }
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
