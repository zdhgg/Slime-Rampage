import { getEffectiveSkillMaxLevel } from './SkillProgression.js'
import { PET_PARTNER_SKILLS } from './PetSkills.js'

export const SYMBIOSIS_RULES = Object.freeze({
  choicesBeforeRoute: 5, routeWave: 6, routeStage: 3,
  ultimateLevel: 14, ultimateWave: 10, ultimateStage: 5, ultimateInvestment: 4,
  ownedWeight: 1.2, routeWeight: 1.15, maxWeightBoost: 1.35,
})

export const SYMBIOSIS_ROUTES = Object.freeze({
  hunt: {
    id: 'hunt', name: '疾风猎团', short: '猎团', icon: '✦', color: '#8edacb',
    seed: 'sym_hunt_link', seedName: '追猎链接',
    desc: '让伙伴围绕同一个目标连续追击，越打越快，适合远程伙伴与高密度怪群。',
    bonus: '伙伴命中会留下追猎标记；标记目标受到下一次伙伴攻击时额外受伤。',
    skills: ['追猎标记', '群猎连携'], ultimate: 'sym_hunt_ultimate', ultimateName: '万灵齐射',
    ultimateDesc: '空格发动全队协同追猎，近战伙伴释放冲击，远程伙伴追加齐射。',
  },
  spore: {
    id: 'spore', name: '孢潮花园', short: '孢潮', icon: '✣', color: '#c3a4dc',
    seed: 'sym_spore_link', seedName: '孢息共鸣',
    desc: '把伙伴命中转化为范围孢息，持续清理贴近队伍的怪海。',
    bonus: '伙伴命中会向附近敌人扩散孢息伤害；孢云伙伴会扩大孢息范围。',
    skills: ['孢息扩散', '菌毯蔓延'], ultimate: 'sym_spore_ultimate', ultimateName: '万孢盛放',
    ultimateDesc: '空格在队伍周围铺开大型菌域，分批爆发并减速普通敌人。',
  },
  guard: {
    id: 'guard', name: '守望战阵', short: '守望', icon: '⬢', color: '#edc479',
    seed: 'sym_guard_link', seedName: '守望连结',
    desc: '将鼓舞变成短时推进窗口，伙伴替本体承压并用冲击波清出安全区。',
    bonus: '鼓舞期间伙伴与本体获得减伤；岩甲团团倒地时不会立刻丢失阵线。',
    skills: ['护阵回响', '阵地冲击'], ultimate: 'sym_guard_ultimate', ultimateName: '共生堡垒',
    ultimateDesc: '空格展开守护战阵，短时保护全队并周期释放近身冲击波。',
  },
})

const routeSkillIds = Object.freeze({
  hunt: ['sym_hunt_link', 'sym_hunt_mark', 'sym_hunt_chain'],
  spore: ['sym_spore_link', 'sym_spore_field', 'sym_spore_bloom'],
  guard: ['sym_guard_link', 'sym_guard_aegis', 'sym_guard_pulse'],
})
const routeSeeds = new Set(Object.values(SYMBIOSIS_ROUTES).map(route => route.seed))

const makeRouteSkill = (id, name, route, maxLevel, desc, stats, apply, extra = {}) => ({
  id, name, spec: 'symbiosis', route, kind: 'advanced', maxLevel, desc, stats,
  isSymbiosisSkill: true, growthClass: 'core', tier: 3, weight: 0.8,
  icon: SYMBIOSIS_ROUTES[route].icon, tags: ['路线进阶', SYMBIOSIS_ROUTES[route].short], apply, ...extra,
})

export const SYMBIOSIS_ROUTE_SKILLS = [
  makeRouteSkill('sym_hunt_link', '追猎链接', 'hunt', 4,
    '伙伴命中后标记目标；下一次伙伴攻击优先追击并造成额外伤害。',
    lv => `标记额外伤害 +${Math.min(36, 12 + lv * 6)}% · 标记持续 ${Math.min(5, 2.5 + lv * .5).toFixed(1)} 秒`,
    (game, level) => { game.weaponSystem.petCombat.routeHuntLevel = level }),
  makeRouteSkill('sym_hunt_mark', '群猎标记', 'hunt', 5,
    '追猎标记命中后会短暂牵引附近伙伴；连续命中同一标记目标会追加一次协同攻击。',
    lv => `协同攻击每 ${Math.max(2, 5 - lv)} 次命中触发 · 追加伤害 ${Math.min(70, 35 + lv * 7)}%`,
    (game, level) => { game.weaponSystem.petCombat.routeHuntChainLevel = level }),
  makeRouteSkill('sym_hunt_chain', '猎团回响', 'hunt', 4,
    '鼓舞期间标记目标不会过期，伙伴更容易切换到同一目标。',
    lv => `鼓舞标记延长 ${Math.min(4, lv)} 秒 · 伙伴追猎范围 +${lv * 35}px`,
    (game, level) => { game.weaponSystem.petCombat.routeHuntEchoLevel = level }),
  makeRouteSkill('sym_spore_link', '孢息共鸣', 'spore', 4,
    '伙伴命中在目标周围扩散孢息，造成有限范围伤害与减速，不会递归触发自身。',
    lv => `孢息半径 ${55 + lv * 10}px · 扩散伤害 ${Math.min(45, 15 + lv * 5)}%`,
    (game, level) => { game.weaponSystem.petCombat.routeSporeLevel = level }),
  makeRouteSkill('sym_spore_field', '菌毯蔓延', 'spore', 5,
    '孢息扩散范围扩大，命中多个目标时伤害不会指数叠加。',
    lv => `范围额外 +${lv * 14}px · 减速持续 ${Math.min(3, 1 + lv * .4).toFixed(1)} 秒`,
    (game, level) => { game.weaponSystem.petCombat.routeSporeFieldLevel = level }),
  makeRouteSkill('sym_spore_bloom', '孢云回响', 'spore', 4,
    '孢云伙伴的范围支援与孢息爆发共享一次受控冷却，避免场面无限递归。',
    lv => `孢息每次最多影响 ${Math.min(5, 2 + lv)} 个目标 · 伤害封顶`,
    (game, level) => { game.weaponSystem.petCombat.routeSporeBloomLevel = level }),
  makeRouteSkill('sym_guard_link', '守望连结', 'guard', 4,
    '鼓舞期间全队获得减伤；减伤只作用于真实受击，不会抵消倒地恢复或技能代价。',
    lv => `鼓舞减伤 ${Math.min(28, 8 + lv * 5)}%`,
    (game, level) => { game.weaponSystem.petCombat.routeGuardLevel = level }),
  makeRouteSkill('sym_guard_aegis', '护阵回响', 'guard', 5,
    '鼓舞开始时为附近伙伴补充护阵，并延长本次推进窗口。护阵有独立上限。',
    lv => `鼓舞持续 +${Math.min(3, lv * .5).toFixed(1)} 秒 · 伙伴减伤额外 ${Math.min(15, lv * 3)}%`,
    (game, level) => { game.weaponSystem.petCombat.routeGuardAegisLevel = level }),
  makeRouteSkill('sym_guard_pulse', '阵地冲击', 'guard', 5,
    '鼓舞开始时释放一次近身冲击波，后续等级只提高范围与伤害，不能再次触发鼓舞。',
    lv => `冲击半径 ${110 + lv * 14}px · 伤害 ${Math.min(180, 70 + lv * 22)}%`,
    (game, level) => { game.weaponSystem.petCombat.routeGuardPulseLevel = level }),
  {
    id: 'sym_hunt_ultimate', name: '🌟 万灵齐射', spec: 'symbiosis', route: 'hunt', kind: 'ultimate',
    maxLevel: 1, desc: SYMBIOSIS_ROUTES.hunt.ultimateDesc, stats: '互斥终极 · 全队协同追猎',
    isSymbiosisSkill: true, isCapstone: true, tier: 4, weight: 0.65, icon: '✦', tags: ['互斥终极', '疾风猎团'],
    apply(game) { game.weaponSystem.petCombat.routeUltimate = 'hunt' },
  },
  {
    id: 'sym_spore_ultimate', name: '🌟 万孢盛放', spec: 'symbiosis', route: 'spore', kind: 'ultimate',
    maxLevel: 1, desc: SYMBIOSIS_ROUTES.spore.ultimateDesc, stats: '互斥终极 · 大型菌域爆发',
    isSymbiosisSkill: true, isCapstone: true, tier: 4, weight: 0.65, icon: '✣', tags: ['互斥终极', '孢潮花园'],
    apply(game) { game.weaponSystem.petCombat.routeUltimate = 'spore' },
  },
  {
    id: 'sym_guard_ultimate', name: '🌟 共生堡垒', spec: 'symbiosis', route: 'guard', kind: 'ultimate',
    maxLevel: 1, desc: SYMBIOSIS_ROUTES.guard.ultimateDesc, stats: '互斥终极 · 守护战阵与冲击波',
    isSymbiosisSkill: true, isCapstone: true, tier: 4, weight: 0.65, icon: '⬢', tags: ['互斥终极', '守望战阵'],
    apply(game) { game.weaponSystem.petCombat.routeUltimate = 'guard' },
  },
]

export const SYMBIOSIS_SKILL_BY_ID = Object.fromEntries(SYMBIOSIS_ROUTE_SKILLS.map(skill => [skill.id, skill]))

export function symbiosisRouteInvestment(game, route = game.weaponSystem?.petCombat?.route) {
  return (routeSkillIds[route] || []).reduce((sum, id) => sum + (game.skillLevels?.[id] || 0), 0)
}

export function symbiosisProgressReady(game, ultimate = false) {
  const rules = SYMBIOSIS_RULES
  return game.runSelection?.mode === 'expedition'
    ? (game.expeditionStage || 1) >= (ultimate ? rules.ultimateStage : rules.routeStage)
    : (game.enemyManager?.wave || 1) >= (ultimate ? rules.ultimateWave : rules.routeWave)
}

export function symbiosisRouteReady(game) {
  const state = game.weaponSystem?.petCombat
  return game.startingStrain === 'summoner' && game.primarySpec === 'symbiosis' && !state?.route &&
    (state?.normalChoices || 0) >= SYMBIOSIS_RULES.choicesBeforeRoute && symbiosisProgressReady(game) &&
    Object.values(SYMBIOSIS_ROUTES).some(route => game.skillLevels?.[route.seed] > 0)
}

function hasOtherUltimate(game) {
  return Object.values(SYMBIOSIS_ROUTES).some(route => (game.skillLevels?.[route.ultimate] || 0) > 0)
}

export function symbiosisSkillAvailable(game, skill, baseSkills = []) {
  if (game.startingStrain !== 'summoner' || !skill || skill.originOnly) return false
  const role = skill.kind === 'common' ? 'common' : 'primary'
  if ((game.skillLevels?.[skill.id] || 0) >= getEffectiveSkillMaxLevel(game, skill, role)) return false
  if (skill.kind === 'common' || skill.growthClass === 'common') return true
  const route = game.weaponSystem?.petCombat?.route
  if (skill.isCapstone || skill.kind === 'ultimate') {
    return !!route && route === skill.route && (game.player?.level || 1) >= SYMBIOSIS_RULES.ultimateLevel &&
      symbiosisProgressReady(game, true) && symbiosisRouteInvestment(game, route) >= SYMBIOSIS_RULES.ultimateInvestment &&
      !hasOtherUltimate(game)
  }
  if (skill.isSymbiosisSkill) {
    if (!route) return routeSeeds.has(skill.id)
    return skill.route === route
  }
  if (skill.isPartnerChoice && (game.skillLevels?.[skill.id] || 0) > 0) return false
  if (skill.requires?.length && !skill.requires.every(id => (game.skillLevels?.[id] || 0) > 0)) return false
  if (skill.kind === 'partner') return true
  return true
}

export function symbiosisRouteOptions(game) {
  return Object.values(SYMBIOSIS_ROUTES).map(route => ({
    ...route, id: `sym_route_${route.id}`, route: route.id, spec: 'symbiosis',
    isMilestone: true, isSymbiosisRoute: true, milestoneType: 'symbiosis',
    locked: !(game.skillLevels?.[route.seed] > 0),
    requirement: `需要【${route.seedName}】Lv.1`,
    investment: symbiosisRouteInvestment(game, route.id),
  }))
}

export function symbiosisBuildNote(game) {
  const state = game.weaponSystem?.petCombat
  const route = SYMBIOSIS_ROUTES[state?.route]
  if (!route) return `随机招募伙伴并探索追猎、孢潮与守望；选卡满 ${SYMBIOSIS_RULES.choicesBeforeRoute} 次且第 ${SYMBIOSIS_RULES.routeWave} 波／远征第 ${SYMBIOSIS_RULES.routeStage} 章后确认路线。`
  if (game.skillLevels?.[route.ultimate]) return `${route.name}已锁定 · 终极【${route.ultimateName}】已获得 · 伙伴契约继续生效`
  const ready = (game.player?.level || 1) >= SYMBIOSIS_RULES.ultimateLevel && symbiosisProgressReady(game, true)
  return `${route.name}已锁定 · 路线投入 ${symbiosisRouteInvestment(game)}/${SYMBIOSIS_RULES.ultimateInvestment} · ${ready ? '终极已进入随机池' : '终极需 Lv.14＋第 10 波／远征第 5 章'} · 达标后不保证抽到`
}

export function rollSymbiosisSkills(game, count, baseSkills, commonSkills, random = Math.random) {
  if (count <= 0) return []
  if (symbiosisRouteReady(game)) return symbiosisRouteOptions(game)
  const levels = game.skillLevels || {}
  // 保留首屏的伙伴教学：第一次进入共生专精时先让玩家认识三名可招募伙伴；
  // 从第二次普通选卡开始才进入路线入口与伙伴混合的随机池。
  if (!game.weaponSystem?.petCombat?.normalChoices && !game.weaponSystem?.petCombat?.route && (game.player?.level || 1) >= 5 &&
      !PET_PARTNER_SKILLS.some(id => (levels[id] || 0) > 0)) {
    const firstPartners = PET_PARTNER_SKILLS.map(id => baseSkills.find(skill => skill.id === id)).filter(Boolean)
    if (firstPartners.length === PET_PARTNER_SKILLS.length) return firstPartners.slice(0, count).map(skill => ({
      ...skill, level: levels[skill.id] || 0, role: 'primary', progressionRole: 'primary',
      maxLevel: getEffectiveSkillMaxLevel(game, skill, 'primary'),
      stats: typeof skill.stats === 'function' ? skill.stats(0, game) : skill.stats || '',
      buildNote: symbiosisBuildNote(game),
    }))
  }
  const pool = [...baseSkills, ...SYMBIOSIS_ROUTE_SKILLS, ...commonSkills.map(skill => ({ ...skill, kind: 'common' }))]
    .filter(skill => symbiosisSkillAvailable(game, skill, baseSkills))
  const route = game.weaponSystem?.petCombat?.route
  const weight = skill => (skill.weight || 1) * Math.min(SYMBIOSIS_RULES.maxWeightBoost,
    (levels[skill.id] ? SYMBIOSIS_RULES.ownedWeight : 1) *
    (route && skill.route === route ? SYMBIOSIS_RULES.routeWeight : 1))
  const drawWeighted = from => {
    let ticket = random() * from.reduce((sum, skill) => sum + weight(skill), 0), index = 0
    while (index < from.length - 1 && (ticket -= weight(from[index])) > 0) index++
    return from[index]
  }
  const choices = []
  while (pool.length && choices.length < count) {
    const entrances = !route && choices.length === 0 ? pool.filter(skill => routeSeeds.has(skill.id)) : []
    const skill = drawWeighted(entrances.length ? entrances : pool)
    pool.splice(pool.indexOf(skill), 1)
    const level = levels[skill.id] || 0
    const role = skill.kind === 'common' ? 'common' : 'primary'
    choices.push({ ...skill, level, role, progressionRole: role,
      maxLevel: getEffectiveSkillMaxLevel(game, skill, role),
      tags: [...(skill.tags || []), ...(skill.route ? [SYMBIOSIS_ROUTES[skill.route]?.short].filter(Boolean) : [])],
      stats: typeof skill.stats === 'function' ? skill.stats(level, game) : skill.stats || '',
      buildNote: symbiosisBuildNote(game),
    })
  }
  // Early recruitment is encouraged without guaranteeing a particular partner.
  if (!route && (game.weaponSystem?.petCombat?.normalChoices || 0) < 3 &&
      !choices.some(skill => skill.isPartnerChoice)) {
    const partner = pool.find(skill => skill.isPartnerChoice)
    if (partner && choices.length) {
      const index = choices.length - 1
      pool.splice(pool.indexOf(partner), 1)
      const level = levels[partner.id] || 0
      choices[index] = { ...partner, level, role: 'primary', progressionRole: 'primary',
        maxLevel: getEffectiveSkillMaxLevel(game, partner, 'primary'),
        stats: typeof partner.stats === 'function' ? partner.stats(level, game) : partner.stats || '',
        buildNote: symbiosisBuildNote(game),
      }
    }
  }
  return choices
}
