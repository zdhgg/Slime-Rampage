import { BOSS_TOMES } from './BossTomes.js'
// 弹射血统独立的随机构筑。原生的 gatling 主/副专精仍使用旧技能树。
import { getEffectiveSkillMaxLevel, getSoftRankMultiplier, applyRankMultiplier } from './SkillProgression.js'
import { getEndlessSkillChoices } from './EndlessSkills.js'
import { setCritSource } from './CritSources.js'

export const RICOCHET_RULES = Object.freeze({
  choicesBeforeRoute: 4, routeWave: 4, routeStage: 2,
  ultimateLevel: 11, ultimateWave: 8, ultimateStage: 4, ultimateInvestment: 3,
  ownedWeight: 1.2, routeWeight: 1.15, maxWeightBoost: 1.35,
  projectileLimit: 320, collisionPadding: 140, activeCountCap: 7,
})

export const ricochetSplitChance = rank => [0, 65, 95][Math.min(2, Math.max(0, rank | 0))] || 0
export const splitSporeDamageBonus = rank => (rank <= 0 ? 0 : rank <= 2 ? rank * 12 : 24 + Math.min(32, (rank - 2) * 4))
export const ricochetPierceOverdrivePct = rank => [0, 15, 25][Math.min(2, Math.max(0, rank | 0))] || 0
export const ricochetShockPct = rank => [0, 75, 115][Math.min(2, Math.max(0, rank | 0))] || 0
export const bounceAmplifyPct = rank => (rank <= 0 ? 0 : rank <= 3 ? rank * 12 : 36 + Math.min(24, (rank - 3) * 4))

export const RICOCHET_ROUTES = {
  split: {
    id: 'split', name: '裂殖母体', short: '分裂', icon: '✺', color: '#79dfc8',
    seed: 'rico_split', ultimate: 'rico_swarm',
    desc: '主弹命中即爆出追踪孢弹，全自动横扫涌来的怪群；借周边小怪爆破压制首领。',
    bonus: '主弹必定触发分裂（100%），追踪孢弹伤害由主弹的 35% 提升至 50%。',
    weakness: '单体点杀不如重炮集中，需要依靠密集孢群与爆破压制血线。',
    activeName: '疾射', ultimateName: '万弹母巢',
    ultimateDesc: '每次分裂额外 +2 枚追踪孢弹；空格追加 6 轮蜂群齐射，期间孢弹伤害额外 +30%。冷却 12 秒。',
  },
  pierce: {
    id: 'pierce', name: '贯穿重炮', short: '贯穿', icon: '➤', color: '#f1bf74',
    seed: 'rico_pierce', ultimate: 'rico_cannon',
    desc: '把怪群拉成队列，以大口径重弹打穿整条防线，顺势重创后排首领。',
    bonus: '主弹伤害 ×1.35、弹体放大 30%、穿透 +1 且穿透不再衰减（100% 保伤）；疾射改为连发 4 枚聚能重弹。',
    weakness: '火力集中在直线正面，被四面合围时需主动走位拉线。',
    activeName: '重弹齐射', ultimateName: '歼灭巨炮',
    ultimateDesc: '常驻主弹再放大 50%；空格轰出贯穿巨炮（穿透 +6），沿途连续引爆巨型冲击波。冷却 10 秒。',
  },
  bounce: {
    id: 'bounce', name: '棱镜群落', short: '折射', icon: '◇', color: '#b4a2ef',
    seed: 'rico_bounce', ultimate: 'rico_prism',
    desc: '飞弹在怪群与首领之间高速来回弹射，交织激光弹网且越弹越痛。',
    bonus: '主弹折射 +1、折射不再衰减（100% 保伤）、索敌扩至 360px，且允许在多目标间来回乒乓折射。',
    weakness: '需要周围有其他目标接力；面对绝对孤立的单体时无法继续弹射。',
    activeName: '折光齐射', ultimateName: '棱镜风暴',
    ultimateDesc: '常驻折射 +1；空格释放 3 枚高能棱镜核心，无衰减连续折射 6 次并触发越弹越痛。冷却 12 秒。',
  },
}

const make = (id, name, kind, maxLevel, desc, stats, extra = {}) => ({
  id, name, kind, maxLevel, desc, stats, spec: 'gatling', isRicochetSkill: true,
  growthClass: extra.growthClass,
  icon: kind === 'common' ? '◉' : '✦', tier: kind === 'ultimate' ? 4 : kind === 'seed' || kind === 'common' ? 1 : 3,
  weight: { common: 1, seed: 1, advanced: .9, rare: .2, hybrid: .45, ultimate: .9 }[kind],
  tags: [{ common: '公共强化', seed: '方向入口', advanced: '路线进阶', rare: '稀有配套', hybrid: '混搭联动', ultimate: '互斥终极' }[kind]],
  apply() {}, ...extra,
})
export const RICOCHET_SKILLS = [
  make('rico_split', '分裂胚芽', 'seed', 2, '主弹首次命中时分裂出追踪孢弹，自动追击周围其他敌人。',
    lv => `分裂概率 ${ricochetSplitChance(lv + 1)}% · 产生 ${lv >= 1 ? 3 : 2} 枚追踪孢弹`, { route: 'split' }),
  make('rico_pierce', '穿透腺体', 'seed', 3, '主弹命中后保持直线穿透多名敌人，每次穿透保留 90% 伤害。',
    lv => `额外穿透 ${lv + 1} 名敌人`, { route: 'pierce', growthClass: 'core', rankCaps: { expedition: { hard: 7, hell: 10 }, timed: 8, endless: 10 } }),
  make('rico_bounce', '折射表皮', 'seed', 3, '穿透耗尽后折向 300px 内的其他敌人，每次折射保留 85% 伤害。',
    lv => `额外折射 ${lv + 1} 次`, { route: 'bounce', growthClass: 'core', rankCaps: { expedition: { hard: 7, hell: 9 }, timed: 8, endless: 9 } }),
  make('rico_multishot', '多重喷射腔', 'common', 4, '每次普通攻击额外发射 1 枚主弹，并同步提升路线主动与终极威力。',
    '齐射飞弹 +1', { growthClass: 'common', apply(g) { g.weaponSystem.projectileCount = Math.min(RICOCHET_RULES.activeCountCap, g.weaponSystem.projectileCount + 1) } }),
  make('rico_haste', '速射腔', 'common', 2, '缩短普通攻击的射击间隔，显著加快火力倾泻与触发节奏。',
    '射击间隔 ×0.88', { apply(g) { g.weaponSystem.fireInterval *= .88 } }),
  make('rico_velocity', '喷射增压', 'common', 2, '同时加快飞弹飞行速度并提高单发基础伤害。', (lv) => {
    const speedRatio = getSoftRankMultiplier(lv + 1, .15, 3, 2) / getSoftRankMultiplier(lv, .15, 3, 2)
    const damageRatio = getSoftRankMultiplier(lv + 1, .16, 3, 2.35) / getSoftRankMultiplier(lv, .16, 3, 2.35)
    return `弹速 ×${speedRatio.toFixed(2)} · 伤害 ×${damageRatio.toFixed(2)}`
  }, { growthClass: 'core', rankCaps: { expedition: { hard: 8, hell: 12 }, timed: 10, endless: 14 }, apply(g, lv) {
    applyRankMultiplier(g.weaponSystem, 'projectileSpeed', lv - 1, lv, rank => getSoftRankMultiplier(rank, .15, 3, 2))
    applyRankMultiplier(g.weaponSystem, 'damage', lv - 1, lv, rank => getSoftRankMultiplier(rank, .16, 3, 2.35))
  } }),
  make('rico_compression', '聚焦晶核', 'common', 2, '提高暴击率与暴击伤害，让贯穿、折射与齐射频繁爆出高额暴击。',
    '暴击率 +10% · 暴击伤害 +35%', { apply(g, lv) { setCritSource(g, 'rico_focus', { chance: lv * .1, multiplier: lv * .35 }) } }),
  make('rico_recharge', '回充腔', 'common', 2, '缩短空格技能冷却，定向与觉醒终极后依然保留。',
    '空格冷却 ×0.88', { apply(g) { g.player.activeSkillCdMultiplier *= .88 } }),
  make('rico_vitality', '细胞增殖', 'common', 4, '增加生命上限并立即恢复 1 点生命。',
    '生命上限 +1 · 恢复 1 点生命', { growthClass: 'common', apply(g) { g.player.maxHp++; g.player.heal(1) } }),
  make('rico_density', '增殖囊泡', 'advanced', 2, '每次分裂额外产生更多追踪孢弹，瞬间铺满视野。',
    '分裂孢弹 +1', { route: 'split' }),
  make('rico_hunt', '嗜血孢群', 'advanced', 10, '大幅提升追踪孢弹伤害与追击时长，并对半血以下敌人触发斩杀增伤。', lv => {
    const rank = lv + 1
    return `孢弹伤害 +${splitSporeDamageBonus(rank)} 个百分点 · 半血目标 +30% · 存续 +${Math.min(1.5, rank * .25).toFixed(2)} 秒`
  }, { route: 'split', growthClass: 'core', rankCaps: { expedition: { hard: 8, hell: 10 }, timed: 9, endless: 10 } }),
  make('rico_bloom', '爆裂孢弹', 'rare', 1, '追踪孢弹击杀小怪立即引发范围毒爆；对首领／精英每累计命中 4 枚孢弹同样引爆！',
    '爆炸半径 95px · 主弹 75% 范围伤害', { route: 'split' }),
  make('rico_sustain', '穿甲过载', 'advanced', 2, '重弹每穿透 1 名敌人后续伤害递增（最多 4 层），并对首领／精英造成额外破甲伤害。',
    lv => `每穿 1 敌增伤 +${ricochetPierceOverdrivePct(lv + 1)}% · 对首领／精英 +${ricochetPierceOverdrivePct(lv + 1)}%`, { route: 'pierce' }),
  make('rico_shock', '破阵冲击', 'advanced', 2, '主弹每次穿透敌人或触发暴击时释放冲击波，震伤周围敌群。',
    lv => `冲击波半径 95px · 单弹 ${ricochetShockPct(lv + 1)}% 伤害`, { route: 'pierce' }),
  make('rico_breach', '破城弹头', 'rare', 1, '主弹首击首领／精英造成重击；击杀敌人向前方扇形喷射破甲碎弹。',
    '首领／精英首击 +40% · 击杀前向溅射 110px', { route: 'pierce' }),
  make('rico_extension', '折光加速', 'advanced', 3, '同时增加折射次数、索敌接力范围与转向飞行速度。',
    lv => `折射 +${lv + 1} 次 · 范围 +${(lv + 1) * 120}px · 转向弹速 +${(lv + 1) * 25}%`, { route: 'bounce', growthClass: 'core', rankCaps: { expedition: { hard: 5, hell: 6 }, timed: 5, endless: 6 } }),
  make('rico_amplify', '余辉增幅', 'advanced', 10, '每次折射都会累加威力，让飞弹在怪群间越弹越痛（每弹最多叠加 6 层）。',
    lv => `每次折射伤害 +${bounceAmplifyPct(lv + 1)}%`, { route: 'bounce', growthClass: 'core', rankCaps: { expedition: { hard: 8, hell: 10 }, timed: 8, endless: 10 } }),
  make('rico_echo', '棱镜分束', 'rare', 1, '主弹首次折射时一分为二，衍生光弹继承剩余折射次数一同在战场上弹射！',
    '首跳分束 2 道光弹 · 继承 65% 伤害', { route: 'bounce' }),
  make('rico_split_pierce', '穿心裂变', 'hybrid', 1, '追踪孢弹获得 2 次直线穿透，且穿透过程不衰减伤害。',
    '追踪孢弹穿透 +2 · 100% 保伤', { routes: ['split', 'pierce'], needs: ['rico_split', 'rico_pierce'] }),
  make('rico_split_bounce', '追猎折光', 'hybrid', 1, '追踪孢弹命中后可继续折射 2 次，精准收割漏网目标。',
    '追踪孢弹折射 +2 · 保伤 85%', { routes: ['split', 'bounce'], needs: ['rico_split', 'rico_bounce'] }),
  make('rico_pierce_bounce', '折光穿梭', 'hybrid', 1, '主弹每次折射后，在新弹道上额外附带 1 次直线穿透。',
    '每次折射追加 +1 穿透（最多 4 次）', { routes: ['pierce', 'bounce'], needs: ['rico_pierce', 'rico_bounce'] }),
  ...Object.values(RICOCHET_ROUTES).map(r => make(r.ultimate, r.ultimateName, 'ultimate', 1, r.ultimateDesc,
    '替换空格技能 · 本局终极互斥', { route: r.id, icon: r.icon, isCapstone: true })),
]
export const RICOCHET_SKILL_BY_ID = Object.fromEntries(RICOCHET_SKILLS.map(s => [s.id, s]))

export function ricochetInvestment(game, route = game.weaponSystem?.ricochetCombat?.route) {
  if (!route) return 0
  return RICOCHET_SKILLS.reduce((sum, s) => sum + (s.kind !== 'ultimate' &&
    (s.route === route || s.routes?.includes(route)) ? game.skillLevels?.[s.id] || 0 : 0), 0)
}

export function ricochetProgressReady(game, ultimate = false) {
  const rules = RICOCHET_RULES
  return game.runSelection?.mode === 'expedition'
    ? (game.expeditionStage || 1) >= (ultimate ? rules.ultimateStage : rules.routeStage)
    : (game.enemyManager?.wave || 1) >= (ultimate ? rules.ultimateWave : rules.routeWave)
}

export function ricochetRouteReady(game) {
  const state = game.weaponSystem?.ricochetCombat
  return !state?.route && (state?.normalChoices || 0) >= RICOCHET_RULES.choicesBeforeRoute &&
    ricochetProgressReady(game) && Object.values(RICOCHET_ROUTES).some(r => game.skillLevels?.[r.seed] > 0)
}

export function ricochetSkillAvailable(game, skill) {
  if (game.startingStrain !== 'ricochet' || !skill) return false
  const levels = game.skillLevels || {}, route = game.weaponSystem?.ricochetCombat?.route
  if ((levels[skill.id] || 0) >= getEffectiveSkillMaxLevel(game, skill, skill.growthClass === 'core' ? 'primary' : skill.kind === 'common' ? 'common' : 'primary')) return false
  if (skill.kind === 'common') return true
  if (!route) return skill.kind === 'seed'
  if (skill.kind === 'hybrid') return skill.routes.includes(route) && skill.needs.every(id => levels[id] > 0)
  if (skill.route !== route) return false
  if (skill.kind === 'ultimate') return (game.player?.level || 1) >= RICOCHET_RULES.ultimateLevel &&
    ricochetProgressReady(game, true) && ricochetInvestment(game) >= RICOCHET_RULES.ultimateInvestment &&
    !Object.values(RICOCHET_ROUTES).some(r => levels[r.ultimate] > 0)
  return true
}

export function ricochetRouteOptions(game) {
  return Object.values(RICOCHET_ROUTES).map(r => ({
    ...r, id: `rico_route_${r.id}`, route: r.id, spec: 'gatling', tier: 2,
    isMilestone: true, isRicochetRoute: true, milestoneType: 'ricochet',
    locked: !(game.skillLevels?.[r.seed] > 0),
    requirement: `需要【${RICOCHET_SKILL_BY_ID[r.seed].name}】Lv.1`,
    investment: ricochetInvestment(game, r.id),
    skills: RICOCHET_SKILLS.filter(s => s.route === r.id && ['advanced', 'rare'].includes(s.kind)).map(s => s.name),
  }))
}

export function ricochetBuildNote(game) {
  const route = game.weaponSystem?.ricochetCombat?.route, r = RICOCHET_ROUTES[route]
  if (!r) {
    const choices = Math.min(RICOCHET_RULES.choicesBeforeRoute, game.weaponSystem?.ricochetCombat?.normalChoices || 0)
    const seeds = Object.values(RICOCHET_ROUTES).filter(item => game.skillLevels?.[item.seed] > 0).map(item => item.short)
    const progress = game.runSelection?.mode === 'expedition'
      ? `第 ${game.expeditionStage || 1}/${RICOCHET_RULES.routeStage} 章`
      : `第 ${game.enemyManager?.wave || 1}/${RICOCHET_RULES.routeWave} 波`
    return `弹道探索 · 选卡 ${choices}/${RICOCHET_RULES.choicesBeforeRoute} · ${progress} · 已点亮入口：${seeds.join(' / ') || '暂无（至少选 1 个入口）'}`
  }
  if (game.skillLevels?.[r.ultimate]) return `已锁定【${r.name}】· 🌟 终极【${r.ultimateName}】已觉醒`
  const ready = (game.player?.level || 1) >= RICOCHET_RULES.ultimateLevel && ricochetProgressReady(game, true)
  const inv = Math.min(RICOCHET_RULES.ultimateInvestment, ricochetInvestment(game))
  const gate = game.runSelection?.mode === 'expedition'
    ? `Lv.${RICOCHET_RULES.ultimateLevel}＋第 ${RICOCHET_RULES.ultimateStage} 章`
    : `Lv.${RICOCHET_RULES.ultimateLevel}＋第 ${RICOCHET_RULES.ultimateWave} 波`
  return `已锁定【${r.name}】· 路线投入 ${inv}/${RICOCHET_RULES.ultimateInvestment} · ${ready && inv >= RICOCHET_RULES.ultimateInvestment ? '终极大招已进入随机池' : `终极解锁：${gate}`}`
}

export function rollRicochetSkills(game, count = 3, random = Math.random) {
  if (count <= 0) return []
  if (ricochetRouteReady(game)) return ricochetRouteOptions(game)
  const rest = RICOCHET_SKILLS.filter(s => ricochetSkillAvailable(game, s))
  rest.push(...getEndlessSkillChoices(game))
  const choices = []
  const route = game.weaponSystem?.ricochetCombat?.route, levels = game.skillLevels || {}
  const hasAnySeed = Object.values(RICOCHET_ROUTES).some(r => levels[r.seed] > 0)
  const weight = s => s.weight * Math.min(RICOCHET_RULES.maxWeightBoost,
    (levels[s.id] ? RICOCHET_RULES.ownedWeight : 1) *
    (route && (s.route === route || s.routes?.includes(route)) ? RICOCHET_RULES.routeWeight : 1))
  const drawWeighted = from => {
    let ticket = random() * from.reduce((sum, s) => sum + weight(s), 0), i = 0
    while (i < from.length - 1 && (ticket -= weight(from[i])) > 0) i++
    return from[i]
  }
  while (rest.length && choices.length < count) {
    const needEntrance = !route && !hasAnySeed && choices.length === 0
    const entrances = needEntrance ? rest.filter(s => s.kind === 'seed') : []
    const s = drawWeighted(entrances.length ? entrances : rest)
    rest.splice(rest.indexOf(s), 1)
    const level = levels[s.id] || 0
    const growthRole = s.growthClass === 'core' ? 'primary' : s.kind === 'common' ? 'common' : 'primary'
    choices.push({ ...s, level, maxLevel: getEffectiveSkillMaxLevel(game, s, growthRole), progressionRole: growthRole, role: s.kind === 'common' ? 'common' : 'primary',
      tags: [...s.tags, ...(s.route ? [RICOCHET_ROUTES[s.route].short] : [])],
      stats: typeof s.stats === 'function' ? s.stats(level, game) : s.stats,
      buildNote: ricochetBuildNote(game),
    })
  }
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[choices[i], choices[j]] = [choices[j], choices[i]]
  }
  return choices
}

// 首领秘典只强化公共底盘，不能替玩家授予方向入口或稀有联动。
export const RICOCHET_BOSS_SKILLS = BOSS_TOMES.ricochet

export const RICOCHET_SPEC_INFO = {
  name: '随机弹道', icon: '✦', desc: '前期探索弹道 · 中期确认路线 · 后期互斥终极',
  roadmap: [
    '探索：随机获取分裂／贯穿／折射入口与纯正面基础强化',
    '定向：选卡满 4 次且第 4 波／远征第 2 章后，按已点亮入口确认路线',
    '深潜：解锁本路线高阶质变技能与双修联动；其他已获能力继续生效',
    '终极：Lv.11＋第 8 波／远征第 4 章且路线投入 3 级后，随机出现互斥终极',
  ],
}
