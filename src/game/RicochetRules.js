import { BOSS_TOMES } from './BossTomes.js'
// 弹射血统独立的随机构筑。原生的 gatling 主/副专精仍使用旧技能树。
import { getEffectiveSkillMaxLevel, getSoftRankMultiplier, applyRankMultiplier } from './SkillProgression.js'
import { getEndlessSkillChoices } from './EndlessSkills.js'
export const RICOCHET_RULES = Object.freeze({
  choicesBeforeRoute: 5, routeWave: 6, routeStage: 3,
  ultimateLevel: 14, ultimateWave: 10, ultimateStage: 5, ultimateInvestment: 4,
  ownedWeight: 1.2, routeWeight: 1.15, maxWeightBoost: 1.35,
  projectileLimit: 320, collisionPadding: 140,
})

export const RICOCHET_ROUTES = {
  split: {
    id: 'split', name: '裂殖母体', short: '分裂', icon: '✺', color: '#79dfc8',
    seed: 'rico_split', ultimate: 'rico_swarm',
    desc: '主弹开口，子弹铺开；追着怪群移动，以密集火力清场。',
    bonus: '分裂率额外 +20 个百分点（封顶 85%），子弹伤害由主弹的 35% 提升至 45%。',
    weakness: '子弹需要其他目标承接，孤立首领前覆盖收益减少。',
    activeName: '疾射', ultimateName: '万弹母巢',
    ultimateDesc: '分裂子弹永久 +1；空格追加 6 轮齐射，期间主弹必定分裂。冷却 12 秒。',
  },
  pierce: {
    id: 'pierce', name: '贯穿重炮', short: '贯穿', icon: '➤', color: '#f1bf74',
    seed: 'rico_pierce', ultimate: 'rico_cannon',
    desc: '把怪群拉成队列，以直线重弹打穿正面。',
    bonus: '主弹伤害 ×1.35、半径 ×1.30、穿透 +1；疾射改为 4 枚重弹，每枚伤害＝单弹 ×齐射数 ×0.85。',
    weakness: '覆盖主要集中在正面，侧后方仍需走位处理。',
    activeName: '重弹齐射', ultimateName: '歼灭巨炮',
    ultimateDesc: '主弹半径再 ×1.50；空格发射巨炮，伤害＝单弹 ×齐射数 ×8，穿透额外 +6。冷却 10 秒。',
  },
  bounce: {
    id: 'bounce', name: '棱镜群落', short: '折射', icon: '◇', color: '#b4a2ef',
    seed: 'rico_bounce', ultimate: 'rico_prism',
    desc: '让飞弹在不同敌人之间接力，交织火力追击侧翼。',
    bonus: '主弹折射 +1，折射保伤 75% → 85%，索敌范围 260 → 320；疾射优先分散锁敌。',
    weakness: '依赖多个相邻目标，孤立首领或过远的敌人会使折射提前结束。',
    activeName: '折光齐射', ultimateName: '棱镜风暴',
    ultimateDesc: '主弹折射永久 +1；空格释放 3 枚核心，每枚伤害＝单弹 ×齐射数 ×1.5，最多折射 6 次、每跳保留 90% 伤害。冷却 12 秒。',
  },
}

const make = (id, name, kind, maxLevel, desc, stats, extra = {}) => ({
  id, name, kind, maxLevel, desc, stats, spec: 'gatling', isRicochetSkill: true,
  growthClass: extra.growthClass,
  icon: kind === 'common' ? '◉' : '✦', tier: kind === 'ultimate' ? 4 : kind === 'seed' || kind === 'common' ? 1 : 3,
  weight: { common: 1, seed: .8, advanced: .85, rare: .12, hybrid: .24, ultimate: .8 }[kind],
  tags: [{ common: '公共强化', seed: '方向入口', advanced: '路线进阶', rare: '稀有配套', hybrid: '混搭联动', ultimate: '互斥终极' }[kind]],
  apply() {}, ...extra,
})
export const RICOCHET_SKILLS = [
  make('rico_split', '分裂胚芽', 'seed', 2, '主弹首次命中时判定分裂，产生追踪子弹；子弹不再分裂。', lv => `分裂概率 ${[40, 65][lv]}%`, { route: 'split' }),
  make('rico_pierce', '穿透腺体', 'seed', 3, '主弹命中后保持直线穿透，每次穿透保留 80% 伤害。', lv => `额外穿透 ${lv + 1} 名敌人`, { route: 'pierce', growthClass: 'core', rankCaps: { expedition: { hard: 7, hell: 10 }, timed: 8, endless: 10 } }),
  make('rico_bounce', '折射表皮', 'seed', 3, '穿透耗尽后折向 260px 内未命中的敌人，每跳保留 75% 伤害。', lv => `额外折射 ${lv + 1} 次`, { route: 'bounce', growthClass: 'core', rankCaps: { expedition: { hard: 7, hell: 9 }, timed: 8, endless: 9 } }),
  make('rico_multishot', '多重喷射腔', 'common', 4, '增加普攻齐射数，重弹、巨炮和棱镜核心同步继承弹数投资。', '齐射飞弹 +1', { growthClass: 'common', apply(g) { g.weaponSystem.projectileCount = Math.min(7, g.weaponSystem.projectileCount + 1) } }),
  make('rico_haste', '速射腔', 'common', 2, '提高普通攻击的出手频率。', '射击间隔 ×0.90', { apply(g) { g.weaponSystem.fireInterval *= .9 } }),
  make('rico_velocity', '喷射增压', 'common', 2, '加快飞弹命中，同时提高单弹伤害。', (lv, g) => {
    const speedRatio = getSoftRankMultiplier(lv + 1, .15, 3, 2) / getSoftRankMultiplier(lv, .15, 3, 2)
    const damageRatio = getSoftRankMultiplier(lv + 1, .08, 3, 1.75) / getSoftRankMultiplier(lv, .08, 3, 1.75)
    return `弹速 ×${speedRatio.toFixed(2)} · 伤害 ×${damageRatio.toFixed(2)}`
  }, { growthClass: 'core', rankCaps: { expedition: { hard: 8, hell: 12 }, timed: 10, endless: 14 }, apply(g, lv) {
    applyRankMultiplier(g.weaponSystem, 'projectileSpeed', lv - 1, lv, rank => getSoftRankMultiplier(rank, .15, 3, 2))
    applyRankMultiplier(g.weaponSystem, 'damage', lv - 1, lv, rank => getSoftRankMultiplier(rank, .08, 3, 1.75))
  } }),
  make('rico_compression', '压缩弹丸', 'common', 2, '以出手频率换取更高的单发威力。', '伤害 ×1.30 · 射击间隔 ×1.12', { apply(g) { g.weaponSystem.damage *= 1.3; g.weaponSystem.fireInterval *= 1.12 } }),
  make('rico_recharge', '回充腔', 'common', 2, '缩短空格技能冷却，定向与终极后保留。', '空格冷却 ×0.90', { apply(g) { g.player.activeSkillCdMultiplier *= .9 } }),
  make('rico_vitality', '细胞增殖', 'common', 4, '增加生命上限并恢复新增的生命。', '生命上限 +1 · 恢复 1 点生命', { growthClass: 'common', apply(g) { g.player.maxHp++; g.player.heal(1) } }),
  make('rico_density', '增殖囊泡', 'advanced', 2, '增加每次分裂产生的子弹数量。', '分裂子弹 +1', { route: 'split' }),
  make('rico_hunt', '子弹追猎', 'advanced', 10, '提高子弹伤害与追击时间；高等级收益逐渐递减。', lv => {
    const rank = lv + 1
    return `子弹伤害额外 +${rank <= 2 ? rank * 10 : 20 + Math.min(25, (rank - 2) * 3)} 个百分点 · 存续 +${Math.min(2.5, rank * .25).toFixed(2)} 秒`
  }, { route: 'split', growthClass: 'core', rankCaps: { expedition: { hard: 8, hell: 10 }, timed: 9, endless: 10 } }),
  make('rico_bloom', '爆裂孢弹', 'rare', 1, '子弹击杀引发近身爆炸，每轮齐射最多 2 次；爆炸不继续触发。', '半径 70px · 主弹 45% 伤害', { route: 'split' }),
  make('rico_sustain', '动能续航', 'advanced', 2, '减少贯穿敌阵时损失的伤害。', lv => `穿透保留伤害 ${[90, 100][lv]}%`, { route: 'pierce' }),
  make('rico_shock', '破阵冲击', 'advanced', 2, '每累计 3 次主弹命中释放一次邻近震波，触发间隔至少 0.3 秒。', lv => `半径 80px · 单弹 ${[60, 90][lv]}% 伤害`, { route: 'pierce' }),
  make('rico_breach', '破城弹头', 'rare', 1, '主弹首击击杀普通敌人时爆炸；首击首领额外增伤。爆炸不继续触发。', '半径 90px · 单弹 100% 伤害 · 首领首击 +30%', { route: 'pierce' }),
  make('rico_extension', '折光延伸', 'advanced', 6, '连接更分散的敌人，加快折射后的追击。', lv => `折射范围 +${Math.min(360, (lv + 1) <= 2 ? (lv + 1) * 60 : 120 + ((lv + 1) - 2) * 30)}px · 转向弹速强化`, { route: 'bounce', growthClass: 'core', rankCaps: { expedition: { hard: 7, hell: 8 }, timed: 7, endless: 8 } }),
  make('rico_amplify', '余辉增幅', 'advanced', 10, '每次折射在保伤后追加初始单弹伤害，每枚飞弹最多累积 4 跳。', lv => `每跳追加初始伤害的 ${Math.min(32, (lv + 1) <= 2 ? (lv + 1) * 4 + 4 : 12 + ((lv + 1) - 2) * 2)}%`, { route: 'bounce', growthClass: 'core', rankCaps: { expedition: { hard: 8, hell: 10 }, timed: 8, endless: 10 } }),
  make('rico_echo', '余辉回响', 'rare', 1, '最后一次折射命中后释放 1 枚回响弹，再折射最多 1 次；回响不再回响或分裂。', '回响伤害 40%', { route: 'bounce' }),
  make('rico_split_pierce', '穿心裂变', 'hybrid', 1, '分裂子弹获得 1 次穿透，不增加分裂触发次数。', '子弹穿透 +1', { routes: ['split', 'pierce'], needs: ['rico_split', 'rico_pierce'] }),
  make('rico_split_bounce', '追猎折光', 'hybrid', 1, '分裂子弹获得 1 次折射，仍不再分裂。', '子弹折射 +1 · 保伤 65%', { routes: ['split', 'bounce'], needs: ['rico_split', 'rico_bounce'] }),
  make('rico_pierce_bounce', '折光穿梭', 'hybrid', 1, '主弹折射后可沿新弹道再穿透 1 名敌人，每枚主弹最多额外增加 2 次穿透。', '折射追加穿透 · 不重置折射次数', { routes: ['pierce', 'bounce'], needs: ['rico_pierce', 'rico_bounce'] }),
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
  if (!r) return '随机探索分裂、贯穿与折射；选卡满 5 次且第 6 波／远征第 3 章后，根据已有入口确认路线。Lv.5 自动获得齐射 +1、射击间隔 ×0.85。'
  if (game.skillLevels?.[r.ultimate]) return `${r.name}已锁定 · 终极【${r.ultimateName}】已获得 · 其他方向旧能力继续生效`
  const ready = (game.player?.level || 1) >= RICOCHET_RULES.ultimateLevel && ricochetProgressReady(game, true)
  return `${r.name}已锁定 · 路线投入 ${ricochetInvestment(game)}/4 · ${ready ? '战局进度已达标' : '终极需 Lv.14＋第 10 波／远征第 5 章'} · 达标后终极随机出现`
}

export function rollRicochetSkills(game, count = 3, random = Math.random) {
  if (count <= 0) return []
  if (ricochetRouteReady(game)) return ricochetRouteOptions(game)
  const rest = RICOCHET_SKILLS.filter(s => ricochetSkillAvailable(game, s))
  rest.push(...getEndlessSkillChoices(game))
  const choices = []
  const route = game.weaponSystem?.ricochetCombat?.route, levels = game.skillLevels || {}
  const weight = s => s.weight * Math.min(RICOCHET_RULES.maxWeightBoost,
    (levels[s.id] ? RICOCHET_RULES.ownedWeight : 1) *
    (route && (s.route === route || s.routes?.includes(route)) ? RICOCHET_RULES.routeWeight : 1))
  const drawWeighted = from => {
    let ticket = random() * from.reduce((sum, s) => sum + weight(s), 0), i = 0
    while (i < from.length - 1 && (ticket -= weight(from[i])) > 0) i++
    return from[i]
  }
  while (rest.length && choices.length < count) {
    const entrances = !route && choices.length === 0 ? rest.filter(s => s.kind === 'seed') : []
    const unowned = entrances.filter(s => !levels[s.id])
    const s = drawWeighted(unowned.length ? unowned : entrances.length ? entrances : rest)
    rest.splice(rest.indexOf(s), 1)
    const level = levels[s.id] || 0
    const growthRole = s.growthClass === 'core' ? 'primary' : s.kind === 'common' ? 'common' : 'primary'
    choices.push({ ...s, level, maxLevel: getEffectiveSkillMaxLevel(game, s, growthRole), progressionRole: growthRole, role: s.kind === 'common' ? 'common' : 'primary',
      tags: [...s.tags, ...(s.route ? [RICOCHET_ROUTES[s.route].short] : [])],
      stats: typeof s.stats === 'function' ? s.stats(level, game) : s.stats,
      buildNote: ricochetBuildNote(game),
    })
  }
  return choices
}

// 首领秘典只强化公共底盘，不能替玩家授予方向入口或稀有联动。
export const RICOCHET_BOSS_SKILLS = BOSS_TOMES.ricochet

export const RICOCHET_SPEC_INFO = {
  name: '随机弹道', icon: '✦', desc: '前期混搭弹道 · 中期确认路线 · 后期互斥终极',
  roadmap: ['探索：随机获得分裂／贯穿／折射与公共强化', '定向：选卡满 5 次且第 6 波／远征第 3 章后，按已有入口确认路线', '深潜：本路线进阶与混搭联动；其他方向旧能力保留', '终极：Lv.14＋第 10 波／远征第 5 章且路线投入 4 级后，随机出现互斥终极'],
}
