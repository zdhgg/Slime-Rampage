import { getEffectiveSkillMaxLevel, getSoftRankMultiplier } from './SkillProgression.js'
import { PET_MAX_SQUAD_SIZE, PET_PARTNER_SKILLS, PET_ROSTER_BY_ID, computeSquadSynergies } from './PetRoster.js'

export const SYMBIOSIS_RULES = Object.freeze({
  choicesBeforeRoute: 5,
  routeWave: 6,
  routeStage: 3,
  ultimateLevel: 14,
  ultimateWave: 10,
  ultimateStage: 5,
  ultimateInvestment: 4,
  ownedWeight: 1.28,
  routeWeight: 1.15,
  maxWeightBoost: 1.5,
  draftGate2Level: 4,
  draftGate3Level: 8,
  draftGate3Wave: 4,
  draftGate3Stage: 2,
  draftGate4Level: 12,
  draftGate4Wave: 8,
  draftGate4Stage: 4,
})

export const SYMBIOSIS_ROUTES = Object.freeze({
  beast: {
    id: 'beast',
    name: '万兽统领',
    short: '兽王',
    roleBadge: '本体辅助 · 伙伴主 C',
    icon: '✦',
    color: '#edc479',
    seed: 'sym_beast_seed',
    seedName: '驯兽号令',
    desc: '本体退居战术指挥与破甲削弱，全体伙伴获得暴击、高额顺劈与嗜血狂潮，化身碾压怪海的狂暴兽群。',
    bonus: '本体飞弹转为破甲信号弹（3.5 秒范围 +20% 伙伴易伤与 −20% 敌伤）；全体伙伴解锁暴击继承并额外 +10% 暴击；空格进化为【狂野怒火】。',
    skills: ['兽群狂潮', '狂兽践踏', '狩猎衰弱', '野性复苏'],
    ultimate: 'sym_beast_ultimate',
    ultimateName: '万兽天灾',
    ultimateDesc: '狂野怒火期间全队特技冷却减半，并额外召唤至多 4 只灵能分影协同扑杀，引发重击顿帧。',
  },
  ranger: {
    id: 'ranger',
    name: '借灵游侠',
    short: '游侠',
    roleBadge: '本体主 C · 伙伴辅助',
    icon: '⌖',
    color: '#8edacb',
    seed: 'sym_ranger_seed',
    seedName: '借灵重箭',
    desc: '本体汲取伙伴灵能成为绝对输出核心，每名在场伙伴都为本体武器赋予专属元素/穿透/爆破词条，并强化护卫与挡弹。',
    bonus: '本体飞弹倍率提至 105%、穿透 +1、弹速 +25%；已投【兽灵共鸣/默契步调】按 50% 反哺本体；每只伙伴使本体 +8% 伤害并赋予专属武器赋能；空格进化为【万灵汇聚炮】。',
    skills: ['灵能过载', '穿甲猎心', '贴身护卫', '万灵齐发'],
    ultimate: 'sym_ranger_ultimate',
    ultimateName: '苍穹猎星',
    ultimateDesc: '万灵汇聚炮进化为三轨星轨炮（沿途引爆最多 6 次赋能星爆），释放后 2.5 秒本体射速 +25% 且攻击必暴。',
  },
  bond: {
    id: 'bond',
    name: '双生协奏',
    short: '协奏',
    roleBadge: '人宠双核 · 互相支撑',
    icon: '✣',
    color: '#c3a4dc',
    seed: 'sym_bond_seed',
    seedName: '灵链共振',
    desc: '本体与伙伴以高伤切割灵链相连，并肩拉网割草；你打我追、我护你爆，频繁互相触发协同补刀与联防护盾。',
    bonus: '本体飞弹倍率回调至 100%；本体与伙伴间常驻切割灵链；本体每 2 击唤起最近伙伴补刀，伙伴每 3 次特技为本体凝聚联防护盾；空格进化为【共生协奏】。',
    skills: ['绞杀光网', '同频连携', '同生共护', '协奏高潮'],
    ultimate: 'sym_bond_ultimate',
    ultimateName: '永恒星阵',
    ultimateDesc: '协奏期间展开封闭星芒领域：每秒全向脉冲并粉碎边缘普通敌弹，期间伙伴锁血不倒且结束回血 35%。',
  },
})

const routeSkillIds = Object.freeze({
  beast: ['sym_beast_seed', 'sym_beast_frenzy', 'sym_beast_cleave', 'sym_beast_curse', 'sym_beast_revive'],
  ranger: ['sym_ranger_seed', 'sym_ranger_infuse', 'sym_ranger_focus', 'sym_ranger_escort', 'sym_ranger_barrage'],
  bond: ['sym_bond_seed', 'sym_bond_chain', 'sym_bond_volley', 'sym_bond_aegis', 'sym_bond_surge'],
})
const routeSeeds = new Set(Object.values(SYMBIOSIS_ROUTES).map(route => route.seed))

const makeRouteSkill = (id, name, route, maxLevel, desc, stats, apply, extra = {}) => ({
  id,
  name,
  spec: 'symbiosis',
  route,
  kind: routeSeeds.has(id) ? 'seed' : 'advanced',
  maxLevel,
  desc,
  stats,
  isSymbiosisSkill: true,
  growthClass: extra.growthClass || 'core',
  tier: routeSeeds.has(id) ? 1 : 3,
  weight: routeSeeds.has(id) ? 0.92 : 0.84,
  icon: SYMBIOSIS_ROUTES[route].icon,
  color: SYMBIOSIS_ROUTES[route].color,
  tags: [routeSeeds.has(id) ? '方向入口' : '路线进阶', SYMBIOSIS_ROUTES[route].short],
  apply,
  ...extra,
})

export const SYMBIOSIS_ROUTE_SKILLS = [
  // —— 万兽统领（beast） ——
  makeRouteSkill(
    'sym_beast_seed',
    '驯兽号令',
    'beast',
    8,
    '探索期解锁伙伴暴击能力并提高对猎手印记目标的伤害；确认【万兽统领】后成为兽群爆发核心。',
    lv => {
      const next = lv + 1
      return `伙伴暴击率 +${Math.min(22, Math.round(5 + next * 2.2))}% · 标记增伤 +${Math.min(25, Math.round(7 + next * 2.5))}%`
    },
    (game, level) => { game.weaponSystem.petCombat.routeBeastSeedLevel = level }
  ),
  makeRouteSkill(
    'sym_beast_frenzy',
    '兽群狂潮',
    'beast',
    8,
    '全队击杀叠加嗜血狂意（上限 8 层，持续 3 秒）；狂野怒火期间层数翻倍且不衰减。',
    lv => {
      const next = lv + 1
      return `每层全队攻速 +${Math.min(6, 2 + next * 0.5).toFixed(1)}% · 移速 +3%（最高 8 层）`
    },
    (game, level) => { game.weaponSystem.petCombat.routeBeastFrenzyLevel = level }
  ),
  makeRouteSkill(
    'sym_beast_cleave',
    '狂兽践踏',
    'beast',
    8,
    '伙伴普攻命中额外迸发范围顺劈/扩溅（受内置冷却保护，不递归触发自身）。',
    lv => {
      const next = lv + 1
      return `顺劈半径 ${Math.min(130, 65 + next * 8)}px · 至多 ${Math.min(7, 3 + Math.ceil(next / 2))} 敌 · ${Math.min(60, 28 + next * 4)}% 伤害`
    },
    (game, level) => { game.weaponSystem.petCombat.routeBeastCleaveLevel = level }
  ),
  makeRouteSkill(
    'sym_beast_curse',
    '狩猎衰弱',
    'beast',
    8,
    '被标记或威慑的目标承受更高伙伴暴击伤害；本体施放威慑声波时同步缩减全队伙伴特技冷却。',
    lv => {
      const next = lv + 1
      return `伙伴对衰弱目标暴伤 +${Math.min(0.45, 0.13 + next * 0.04).toFixed(2)}× · 特技缩冷 ${Math.min(2.8, 0.8 + next * 0.25).toFixed(2)} 秒`
    },
    (game, level) => { game.weaponSystem.petCombat.routeBeastCurseLevel = level }
  ),
  makeRouteSkill(
    'sym_beast_revive',
    '野性复苏',
    'beast',
    8,
    '提高伙伴生命上限并缩短倒地恢复；伙伴倒地瞬间在原地引爆一次高伤狂暴冲击波。',
    lv => {
      const next = lv + 1
      return `伙伴生命 +${Math.min(55, 15 + next * 5)}% · 复苏 −${Math.min(3.2, next * 0.4).toFixed(1)} 秒 · 倒地爆 ${Math.min(280, 140 + next * 18)}%`
    },
    (game, level) => {
      game.weaponSystem.petCombat.routeBeastReviveLevel = level
      game.weaponSystem.petCombat.sync()
    }
  ),

  // —— 借灵游侠（ranger） ——
  makeRouteSkill(
    'sym_ranger_seed',
    '借灵重箭',
    'ranger',
    8,
    '每名在场伙伴提高本体伤害并强化本体暴击；确认【借灵游侠】后激活全部伙伴专属武器赋能。',
    lv => {
      const next = lv + 1
      return `每名伙伴使本体伤害 +${Math.min(10, 3 + next)}% · 本体暴击 +${Math.min(22, Math.round(4 + next * 2.2))}%`
    },
    (game, level) => { game.weaponSystem.petCombat.routeRangerSeedLevel = level }
  ),
  makeRouteSkill(
    'sym_ranger_infuse',
    '灵能过载',
    'ranger',
    8,
    '放大所有伙伴赋予本体的武器赋能效果（电弧链、火焰爆炸、寒霜碎冰、易伤毒雾等）伤害与范围。',
    lv => {
      const next = lv + 1
      return `赋能特效伤害 +${Math.min(120, 25 + next * 12)}% · 赋能范围 +${Math.min(52, 12 + next * 5)}%`
    },
    (game, level) => { game.weaponSystem.petCombat.routeRangerInfuseLevel = level }
  ),
  makeRouteSkill(
    'sym_ranger_focus',
    '穿甲猎心',
    'ranger',
    8,
    '本体命中被伙伴控制、减速、嘲讽或标记的敌人时暴击伤害飙升，并爆出穿甲碎裂溅射。',
    lv => {
      const next = lv + 1
      return `受控目标暴伤 +${Math.min(1.0, 0.3 + next * 0.1).toFixed(2)}× · 碎甲溅射 ${Math.min(45, 25 + next * 3)}%`
    },
    (game, level) => { game.weaponSystem.petCombat.routeRangerFocusLevel = level }
  ),
  makeRouteSkill(
    'sym_ranger_escort',
    '贴身护卫',
    'ranger',
    8,
    '缩短伙伴特技冷却；每当伙伴挡弹或施放特技护主时，强化本体下一轮射击并缩短空格冷却。',
    lv => {
      const next = lv + 1
      return `伙伴特技冷却 −${Math.min(30, 6 + next * 3)}% · 下轮本体伤害 +${Math.min(45, 15 + next * 4)}%`
    },
    (game, level) => { game.weaponSystem.petCombat.routeRangerEscortLevel = level }
  ),
  makeRouteSkill(
    'sym_ranger_barrage',
    '万灵齐发',
    'ranger',
    8,
    '本体每间隔数次普攻自动额外齐射多枚继承武器赋能的共鸣副箭，扫清密集怪潮。',
    lv => {
      const next = lv + 1
      const freq = next >= 4 ? 3 : 4
      const arrows = 2 + Math.min(2, Math.floor(next / 3))
      return `每 ${freq} 射追加 ${arrows} 枚共鸣副箭（${Math.min(65, Math.round(38 + next * 3.5))}% 伤害）`
    },
    (game, level) => { game.weaponSystem.petCombat.routeRangerBarrageLevel = level }
  ),

  // —— 双生协奏（bond） ——
  makeRouteSkill(
    'sym_bond_seed',
    '灵链共振',
    'bond',
    8,
    '提高共生灵链的切割伤害与协奏震荡波范围；探索期按空格即可短暂拉起 3 秒切割灵链。',
    lv => {
      const next = lv + 1
      return `灵链伤害 +${Math.min(120, 15 + next * 14)}% · 震荡波半径 +${Math.min(80, next * 10)}px`
    },
    (game, level) => { game.weaponSystem.petCombat.routeBondSeedLevel = level }
  ),
  makeRouteSkill(
    'sym_bond_chain',
    '绞杀光网',
    'bond',
    8,
    '延长灵链有效距离，并在临近的存活伙伴之间拉起副链，组成多边移动割草光网。',
    lv => {
      const next = lv + 1
      return `灵链距离 ${Math.min(400, 280 + next * 15)}px · 伙伴副链威力 ${Math.min(90, 50 + next * 5)}%`
    },
    (game, level) => { game.weaponSystem.petCombat.routeBondChainLevel = level }
  ),
  makeRouteSkill(
    'sym_bond_volley',
    '同频连携',
    'bond',
    8,
    '缩短人宠连携补刀冷却并提高补刀伤害；伙伴暴击或击杀时令本体追加 1 枚免费共鸣弹。',
    lv => {
      const next = lv + 1
      return `补刀内冷 ${Math.max(0.28, 0.6 - next * 0.04).toFixed(2)} 秒 · 威力 ${Math.min(134, 70 + next * 8)}%`
    },
    (game, level) => { game.weaponSystem.petCombat.routeBondVolleyLevel = level }
  ),
  makeRouteSkill(
    'sym_bond_aegis',
    '同生共护',
    'bond',
    8,
    '提高联防护盾上限；本体护盾挡伤或伙伴重创时，双端同步爆发反震波并缩短空格冷却 0.5 秒。',
    lv => {
      const next = lv + 1
      return `联防盾上限 2 · 双端反震 ${Math.min(218, 90 + next * 16)}%`
    },
    (game, level) => { game.weaponSystem.petCombat.routeBondAegisLevel = level }
  ),
  makeRouteSkill(
    'sym_bond_surge',
    '协奏高潮',
    'bond',
    8,
    '延长共生协奏持续时间并触发周期全队震荡脉冲；期间全队击杀可进一步延长协奏窗口（上限 8 秒）。',
    lv => {
      const next = lv + 1
      return `协奏 +${Math.min(2.0, next * 0.25).toFixed(2)} 秒 · 每 1.5 秒全队脉冲 · 击杀延窗`
    },
    (game, level) => { game.weaponSystem.petCombat.routeBondSurgeLevel = level }
  ),

  // —— 三路线互斥终极 ——
  {
    id: 'sym_beast_ultimate',
    name: '🌟 万兽天灾',
    spec: 'symbiosis',
    route: 'beast',
    kind: 'ultimate',
    maxLevel: 1,
    desc: SYMBIOSIS_ROUTES.beast.ultimateDesc,
    stats: '互斥终极 · 怒火特技半冷＋4 灵影齐扑',
    isSymbiosisSkill: true,
    isCapstone: true,
    tier: 4,
    weight: 0.65,
    icon: '✦',
    color: SYMBIOSIS_ROUTES.beast.color,
    tags: ['互斥终极', '万兽统领'],
    apply(game) { game.weaponSystem.petCombat.routeUltimate = 'beast' },
  },
  {
    id: 'sym_ranger_ultimate',
    name: '🌟 苍穹猎星',
    spec: 'symbiosis',
    route: 'ranger',
    kind: 'ultimate',
    maxLevel: 1,
    desc: SYMBIOSIS_ROUTES.ranger.ultimateDesc,
    stats: '互斥终极 · 三轨星炮＋4 秒疾射必暴',
    isSymbiosisSkill: true,
    isCapstone: true,
    tier: 4,
    weight: 0.65,
    icon: '⌖',
    color: SYMBIOSIS_ROUTES.ranger.color,
    tags: ['互斥终极', '借灵游侠'],
    apply(game) { game.weaponSystem.petCombat.routeUltimate = 'ranger' },
  },
  {
    id: 'sym_bond_ultimate',
    name: '🌟 永恒星阵',
    spec: 'symbiosis',
    route: 'bond',
    kind: 'ultimate',
    maxLevel: 1,
    desc: SYMBIOSIS_ROUTES.bond.ultimateDesc,
    stats: '互斥终极 · 封闭星域＋清弹锁血回血',
    isSymbiosisSkill: true,
    isCapstone: true,
    tier: 4,
    weight: 0.65,
    icon: '✣',
    color: SYMBIOSIS_ROUTES.bond.color,
    tags: ['互斥终极', '双生协奏'],
    apply(game) { game.weaponSystem.petCombat.routeUltimate = 'bond' },
  },
]

export const SYMBIOSIS_ENDLESS_SKILL = {
  id: 'sym_endless_pact',
  name: '无尽灵契',
  spec: 'symbiosis',
  kind: 'endless',
  maxLevel: Infinity,
  growthClass: 'endless',
  isSymbiosisSkill: true,
  isEndlessSymbiosis: true,
  weight: 0.4,
  icon: '∞',
  color: '#edc479',
  tags: ['无尽精通', '共生'],
  desc: '无尽模式中同步提升本体与全体伙伴的直伤、灵链与路线衍生伤害；每级收益递减并趋近软上限。',
  stats(level) {
    return `累计灵契伤害 +${((getSoftRankMultiplier(level + 1, 0.04, 5, 1.45) - 1) * 100).toFixed(1)}%（上限趋近 +45%）`
  },
  apply(game, level) {
    if (game.weaponSystem?.petCombat) game.weaponSystem.petCombat.endlessPactLevel = level
  },
}

export function getSymbiosisEndlessMultiplier(levels = {}) {
  const rank = Math.max(0, Math.floor(Number(levels?.sym_endless_pact) || 0))
  return getSoftRankMultiplier(rank, 0.04, 5, 1.45)
}

export const SYMBIOSIS_SKILL_BY_ID = Object.fromEntries(
  SYMBIOSIS_ROUTE_SKILLS.concat(SYMBIOSIS_ENDLESS_SKILL).map(skill => [skill.id, skill])
)

export function symbiosisRouteInvestment(game, route = game.weaponSystem?.petCombat?.route) {
  return (routeSkillIds[route] || []).reduce((sum, id) => sum + (game.skillLevels?.[id] || 0), 0)
}

export function symbiosisProgressReady(game, ultimate = false) {
  const rules = SYMBIOSIS_RULES
  return game.runSelection?.mode === 'expedition'
    ? (game.expeditionStage || 1) >= (ultimate ? rules.ultimateStage : rules.routeStage)
    : (game.enemyManager?.wave || 1) >= (ultimate ? rules.ultimateWave : rules.routeWave)
}

export function unlockedSquadSlots(game) {
  const lv = game?.player?.level || 1
  const mode = game?.runSelection?.mode
  const wave = game?.enemyManager?.wave || 1
  const stage = game?.expeditionStage || 1
  const gate3 = mode === 'expedition' ? stage >= SYMBIOSIS_RULES.draftGate3Stage : wave >= SYMBIOSIS_RULES.draftGate3Wave
  const gate4 = mode === 'expedition' ? stage >= SYMBIOSIS_RULES.draftGate4Stage : wave >= SYMBIOSIS_RULES.draftGate4Wave
  const bonus = game?.weaponSystem?.petCombat?.bonusSlots || 0
  return Math.min(
    PET_MAX_SQUAD_SIZE,
    1 +
      (lv >= SYMBIOSIS_RULES.draftGate2Level ? 1 : 0) +
      (lv >= SYMBIOSIS_RULES.draftGate3Level && gate3 ? 1 : 0) +
      (lv >= SYMBIOSIS_RULES.draftGate4Level && gate4 ? 1 : 0) +
      bonus
  )
}

export function nextDraftUnlockHint(game) {
  const state = game?.weaponSystem?.petCombat
  const current = (state?.rosterTypes || []).filter(type => type !== 'echo').length
  if (current >= PET_MAX_SQUAD_SIZE) return '4/4 满编'
  const lv = game?.player?.level || 1
  const mode = game?.runSelection?.mode
  if (current < 2 && lv < SYMBIOSIS_RULES.draftGate2Level) return `下位招募 Lv.${SYMBIOSIS_RULES.draftGate2Level}`
  if (current < 3) {
    return mode === 'expedition'
      ? `下位招募 Lv.${SYMBIOSIS_RULES.draftGate3Level}·第 ${SYMBIOSIS_RULES.draftGate3Stage} 章`
      : `下位招募 Lv.${SYMBIOSIS_RULES.draftGate3Level}·第 ${SYMBIOSIS_RULES.draftGate3Wave} 波`
  }
  return mode === 'expedition'
    ? `末位王牌 Lv.${SYMBIOSIS_RULES.draftGate4Level}·第 ${SYMBIOSIS_RULES.draftGate4Stage} 章`
    : `末位王牌 Lv.${SYMBIOSIS_RULES.draftGate4Level}·第 ${SYMBIOSIS_RULES.draftGate4Wave} 波`
}

export function symbiosisDraftReady(game) {
  const state = game?.weaponSystem?.petCombat
  if (game?.startingStrain !== 'summoner' || !state) return false
  const roster = (state.rosterTypes || []).filter(type => type !== 'echo')
  if (roster.length >= PET_MAX_SQUAD_SIZE) return false
  return roster.length < unlockedSquadSlots(game) && PET_PARTNER_SKILLS.some(id => !(game.skillLevels?.[id] > 0))
}

export function symbiosisDraftOptions(game, baseSkills, count = 3, random = Math.random) {
  const levels = game.skillLevels || {}
  const state = game.weaponSystem?.petCombat
  const currentRoster = (state?.rosterTypes || ['guardian']).filter(type => type !== 'echo')
  const currentSynergies = computeSquadSynergies(currentRoster)
  const candidates = baseSkills.filter(skill => skill.isPartnerChoice && !(levels[skill.id] > 0))
  const pool = candidates.slice()
  const picks = []
  while (pool.length && picks.length < count) {
    const idx = Math.floor(random() * pool.length)
    const skill = pool.splice(idx, 1)[0]
    const nextSynergies = computeSquadSynergies([...currentRoster, skill.partnerType])
    const unlockedSynergies = nextSynergies.active
      .filter(syn => !currentSynergies.active.some(cur => cur.id === syn.id))
      .map(syn => syn.name)
    const def = PET_ROSTER_BY_ID[skill.partnerType]
    picks.push({
      ...skill,
      level: 0,
      role: 'primary',
      progressionRole: 'primary',
      maxLevel: 1,
      stats: typeof skill.stats === 'function' ? skill.stats(0, game) : skill.stats || '',
      synergyPreview: unlockedSynergies.length ? `可激活羁绊：${unlockedSynergies.join(' · ')}` : `编队职能：${def?.roleLabel || '伙伴'}`,
      rangerInfusePreview: def?.rangerInfuseDesc || '',
      buildNote: `伙伴选秀（当前编队 ${currentRoster.length}/${PET_MAX_SQUAD_SIZE}）· 挑选 1 名新伙伴加入小队`,
    })
  }
  return picks
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

export function symbiosisSkillAvailable(game, skill) {
  if (game.startingStrain !== 'summoner' || !skill || skill.originOnly) return false
  if (skill.isPartnerChoice) return false
  if (skill.isEndlessSymbiosis) return game.runSelection?.mode === 'endless' && (game.enemyManager?.wave || 1) >= 25
  const role = skill.kind === 'common' && skill.growthClass !== 'core' ? 'common' : 'primary'
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
  if (!game.primarySpec && skill.tier > 1) return false
  if (skill.isPartnerAwakening) {
    const roster = game.weaponSystem?.petCombat?.rosterTypes || ['guardian']
    return roster.includes(skill.partnerType)
  }
  if (skill.requires?.length && !skill.requires.every(id => (game.skillLevels?.[id] || 0) > 0)) return false
  return true
}

export function symbiosisRouteOptions(game) {
  return Object.values(SYMBIOSIS_ROUTES).map(route => ({
    ...route,
    id: `sym_route_${route.id}`,
    route: route.id,
    spec: 'symbiosis',
    isMilestone: true,
    isSymbiosisRoute: true,
    milestoneType: 'symbiosis',
    locked: !(game.skillLevels?.[route.seed] > 0),
    requirement: `需要【${route.seedName}】Lv.1`,
    investment: symbiosisRouteInvestment(game, route.id),
  }))
}

export function symbiosisBuildNote(game) {
  const state = game.weaponSystem?.petCombat
  const route = SYMBIOSIS_ROUTES[state?.route]
  const squad = (state?.rosterTypes || ['guardian']).filter(type => type !== 'echo').length
  if (!route) {
    return `编队 ${squad}/${PET_MAX_SQUAD_SIZE}（${nextDraftUnlockHint(game)}）· 探索兽王／游侠／协奏入口，选卡满 ${SYMBIOSIS_RULES.choicesBeforeRoute} 次且第 ${SYMBIOSIS_RULES.routeWave} 波／远征第 ${SYMBIOSIS_RULES.routeStage} 章后确认路线。`
  }
  if (game.skillLevels?.[route.ultimate]) {
    return `${route.name}已锁定 · 终极【${route.ultimateName}】已获得 · 编队 ${squad}/${PET_MAX_SQUAD_SIZE}`
  }
  const ready = (game.player?.level || 1) >= SYMBIOSIS_RULES.ultimateLevel && symbiosisProgressReady(game, true)
  return `${route.name}已锁定 · 路线投入 ${symbiosisRouteInvestment(game)}/${SYMBIOSIS_RULES.ultimateInvestment} · ${ready ? '终极已进入随机池' : '终极需 Lv.14＋第 10 波／远征第 5 章'} · ${nextDraftUnlockHint(game)}`
}

export function rollSymbiosisSkills(game, count, baseSkills, commonSkills, random = Math.random) {
  if (count <= 0) return []
  if (symbiosisRouteReady(game)) return symbiosisRouteOptions(game)
  if (symbiosisDraftReady(game)) return symbiosisDraftOptions(game, baseSkills, count, random)
  const levels = game.skillLevels || {}
  const pool = [...baseSkills, ...SYMBIOSIS_ROUTE_SKILLS, ...commonSkills.map(skill => ({ ...skill, kind: 'common' }))]
    .filter(skill => symbiosisSkillAvailable(game, skill))
  if (game.runSelection?.mode === 'endless' && (game.enemyManager?.wave || 1) >= 25 &&
      symbiosisSkillAvailable(game, SYMBIOSIS_ENDLESS_SKILL)) {
    pool.push(SYMBIOSIS_ENDLESS_SKILL)
  }
  const route = game.weaponSystem?.petCombat?.route
  const weight = skill => (skill.weight || 1) * Math.min(
    SYMBIOSIS_RULES.maxWeightBoost,
    (levels[skill.id] ? SYMBIOSIS_RULES.ownedWeight : 1) *
    (route && skill.route === route ? SYMBIOSIS_RULES.routeWeight : 1)
  )
  const drawWeighted = from => {
    let ticket = random() * from.reduce((sum, skill) => sum + weight(skill), 0)
    let index = 0
    while (index < from.length - 1 && (ticket -= weight(from[index])) > 0) index++
    return from[index]
  }
  const choices = []
  while (pool.length && choices.length < count) {
    const entrances = !route && choices.length === 0 ? pool.filter(skill => routeSeeds.has(skill.id)) : []
    const skill = drawWeighted(entrances.length ? entrances : pool)
    pool.splice(pool.indexOf(skill), 1)
    const level = levels[skill.id] || 0
    const role = skill.kind === 'common' && skill.growthClass !== 'core' ? 'common' : 'primary'
    choices.push({
      ...skill,
      level,
      role,
      progressionRole: role,
      maxLevel: getEffectiveSkillMaxLevel(game, skill, role),
      tags: [...(skill.tags || []), ...(skill.route ? [SYMBIOSIS_ROUTES[skill.route]?.short].filter(Boolean) : [])],
      stats: typeof skill.stats === 'function' ? skill.stats(level, game) : skill.stats || '',
      buildNote: symbiosisBuildNote(game),
    })
  }
  return choices
}
