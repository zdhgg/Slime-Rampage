import { BOSS_TOMES } from './BossTomes.js'
// 弹射血统独立的随机构筑。原生的 gatling 主/副专精仍使用旧技能树。
import { getEffectiveSkillMaxLevel, getSoftRankMultiplier, applyRankMultiplier } from './SkillProgression.js'
import { getEndlessSkillChoices } from './EndlessSkills.js'
import { setCritSource } from './CritSources.js'

export const RICOCHET_RULES = Object.freeze({
  choicesBeforeRoute: 4, routeWave: 4, routeStage: 2,
  ultimateLevel: 11, ultimateWave: 8, ultimateStage: 4, ultimateInvestment: 3,
  ownedWeight: 1.28, routeWeight: 1.18, maxWeightBoost: 1.5,
  projectileLimit: 320, collisionPadding: 140, activeCountCap: 7,
})

export const ricochetSplitChance = rank => [0, 65, 95][Math.min(2, Math.max(0, rank | 0))] || 0
export const splitSporeDamageBonus = rank => (rank <= 0 ? 0 : rank <= 2 ? rank * 12 : 24 + Math.min(32, (rank - 2) * 4))
export const ricochetPierceOverdrivePct = rank => {
  const n = Math.max(0, rank | 0)
  return n <= 2 ? [0, 15, 25][n] : 25 + Math.min(35, (n - 2) * 6)
}
export const ricochetShockPct = rank => {
  const n = Math.max(0, rank | 0)
  return n <= 2 ? [0, 40, 62][n] : 62 + Math.min(54, (n - 2) * 9)
}
export const bounceAmplifyPct = rank => (rank <= 0 ? 0 : rank <= 3 ? rank * 10 : 30 + Math.min(30, (rank - 3) * 4))
export const pierceShellBonusPct = rank => {
  const n = Math.max(0, rank | 0)
  return n <= 4 ? n * 4 : 16 + Math.min(12, (n - 4) * 2)
}
export const pierceCaliberPct = rank => Math.min(35, Math.max(0, rank | 0) * 5)
export function pierceRouteDamageMultiplier(game) {
  const levels = game?.skillLevels || {}
  const pierceMul = 1 + pierceShellBonusPct(levels.rico_pierce || 0) / 100
  const route = game?.weaponSystem?.ricochetCombat?.route
  if (route !== 'pierce') return pierceMul
  return pierceMul * 1.35 * (levels.rico_cannon ? 1.15 : 1)
}
export const prismScatterBonus = rank => {
  const n = Math.max(0, rank | 0)
  return { rays: Math.min(5, n), retentionPct: Math.min(15, Math.max(0, n - 5) * 3) }
}
export const prismExtensionStats = rank => {
  const n = Math.max(0, rank | 0)
  return {
    rangeBonus: n <= 4 ? n * 35 : 140 + Math.min(60, (n - 4) * 15),
    reachPct: n <= 4 ? n * 10 : 40 + Math.min(20, (n - 4) * 4),
    hastePct: n <= 0 ? 0 : Math.min(18, n <= 3 ? n * 4 : 12 + (n - 3) * 1.5),
  }
}
export const prismWidthForCount = (count, ultimate = false) => {
  const n = Math.max(1, Math.min(RICOCHET_RULES.activeCountCap, count | 0))
  return (4.5 + (n - 1) * 1.4) * (ultimate ? 1.35 : 1)
}
export const prismDamageScaleForCount = count => {
  const n = Math.max(1, Math.min(RICOCHET_RULES.activeCountCap, count | 0))
  return 1 + (n - 1) * 0.62
}

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
    desc: '重弹以宽幅穿甲扇面横扫正面防线，命中后微幅吸附前方队列并击碎护盾，沿途贯穿并重创后排首领。',
    bonus: '主弹伤害 ×1.35、口径 ×1.55、穿透 +1 且 100% 保伤；多弹改为不塌缩的穿甲扇面＋前向微吸附，无视重盾减伤并可击碎护盾；疾射升级为 4 轮高爆穿甲重弹。',
    weakness: '背身及大角度侧翼缺少自动散射掩护，被四面合围时需走位调整扇面朝向。',
    activeName: '重弹齐射', ultimateName: '歼灭巨炮',
    ultimateDesc: '常驻主弹伤害 +15%、口径再放大 40%；空格优先锁定首领或密集敌群轰出超宽贯穿巨炮（穿透 +8），无视重盾并沿途引爆巨型穿甲冲击波。冷却 10 秒。',
  },
  bounce: {
    id: 'bounce', name: '棱镜群落', short: '折射', icon: '◇', color: '#b4a2ef',
    seed: 'rico_bounce', ultimate: 'rico_prism',
    desc: '主弹进化为光棱聚能激光：齐射越多光线越粗越强，命中瞬间向周围星爆折射出多道高能子激光。',
    bonus: '普攻聚能为 1 道光棱主束（开火间隔 ×1.15、齐射数转为光线粗细与威力并扩增散射）；命中点爆发多道星爆散射光线（基础 62% 伤害、光程 380px 起、折射半径 230px）。',
    weakness: '中程激光有光程上限且无法二次回弹；面对绝对孤立的单体时无法折射。',
    activeName: '折光齐射', ultimateName: '棱镜风暴',
    ultimateDesc: '常驻星爆散射 +1 道；空格同时射出 3 道超粗棱镜主束（单束 1.5 倍主束威力），必定触发 7 道星爆散射与二级折光网。冷却 12 秒。',
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
  make('rico_pierce', '穿透腺体', 'seed', 5, '主弹命中后保持直线穿透并微幅吸附前方敌人，逐级放大口径与单弹伤害（未定向时每次穿透保留 90% 伤害）。',
    lv => {
      const rank = lv + 1
      return `穿透 +${rank} 敌 · 主弹伤害 +${pierceShellBonusPct(rank)}% · 口径 +${pierceCaliberPct(rank)}%`
    }, { route: 'pierce', growthClass: 'core', rankCaps: { expedition: { hard: 7, hell: 8 }, timed: 7, endless: 9 } }),
  make('rico_bounce', '折射表皮', 'seed', 6, '命中后折向 300px 内的其他敌人（保伤 85%）；棱镜群落下转为增加落点星爆散射光线数（5 级后提升散射伤害）。',
    (lv, g) => {
      const rank = lv + 1
      if (g?.weaponSystem?.ricochetCombat?.route === 'bounce') {
        const b = prismScatterBonus(rank)
        return `星爆散射 +${b.rays} 道${b.retentionPct ? ` · 散射伤害 +${b.retentionPct} 个百分点` : ''}`
      }
      return `额外折射 ${rank} 次`
    }, { route: 'bounce', growthClass: 'core', rankCaps: { expedition: { hard: 8, hell: 10 }, timed: 8, endless: 10 } }),
  make('rico_multishot', '多重喷射腔', 'common', 4, '每次普通攻击额外发射 1 枚主弹，棱镜群落下改为加粗激光光线、提高单束威力并扩增散射数。',
    '齐射飞弹 +1', { growthClass: 'common', apply(g) { g.weaponSystem.projectileCount = Math.min(RICOCHET_RULES.activeCountCap, g.weaponSystem.projectileCount + 1) } }),
  make('rico_haste', '速射腔', 'common', 5, '缩短普通攻击的射击间隔，显著加快火力倾泻与触发节奏。',
    lv => `射击间隔 ×${lv < 2 ? .88 : .94}`, { apply(g, lv) { g.weaponSystem.fireInterval *= lv <= 2 ? .88 : .94 } }),
  make('rico_velocity', '喷射增压', 'common', 8, '同时加快飞弹飞行速度并提高单发基础伤害。', (lv) => {
    const speedRatio = getSoftRankMultiplier(lv + 1, .15, 3, 2) / getSoftRankMultiplier(lv, .15, 3, 2)
    const damageRatio = getSoftRankMultiplier(lv + 1, .16, 3, 2.35) / getSoftRankMultiplier(lv, .16, 3, 2.35)
    return `弹速 ×${speedRatio.toFixed(2)} · 伤害 ×${damageRatio.toFixed(2)}`
  }, { growthClass: 'core', rankCaps: { expedition: { hard: 10, hell: 12 }, timed: 10, endless: 14 }, apply(g, lv) {
    applyRankMultiplier(g.weaponSystem, 'projectileSpeed', lv - 1, lv, rank => getSoftRankMultiplier(rank, .15, 3, 2))
    applyRankMultiplier(g.weaponSystem, 'damage', lv - 1, lv, rank => getSoftRankMultiplier(rank, .16, 3, 2.35))
  } }),
  make('rico_compression', '聚焦晶核', 'common', 5, '提高暴击率与暴击伤害，让贯穿、折射与齐射频繁爆出高额暴击。',
    lv => `暴击率 +${Math.round(((lv + 1) <= 2 ? (lv + 1) * .1 : .2 + (lv - 1) * .04) * 100)}% · 暴击伤害 +${Math.round(((lv + 1) <= 2 ? (lv + 1) * .35 : .7 + (lv - 1) * .15) * 100)}%`,
    { apply(g, lv) {
      setCritSource(g, 'rico_focus', {
        chance: lv <= 2 ? lv * .1 : .2 + (lv - 2) * .04,
        multiplier: lv <= 2 ? lv * .35 : .7 + (lv - 2) * .15,
      })
    } }),
  make('rico_recharge', '回充腔', 'common', 5, '缩短空格技能冷却，定向与觉醒终极后依然保留。',
    lv => `空格冷却 ×${lv < 2 ? .88 : .94}`, { apply(g, lv) { g.player.activeSkillCdMultiplier *= lv <= 2 ? .88 : .94 } }),
  make('rico_vitality', '细胞增殖', 'common', 5, '增加生命上限并立即恢复 1 点生命。',
    '生命上限 +1 · 恢复 1 点生命', { growthClass: 'common', apply(g) { g.player.maxHp++; g.player.heal(1) } }),
  make('rico_density', '增殖囊泡', 'advanced', 3, '每次分裂额外产生更多追踪孢弹，瞬间铺满视野。',
    '分裂孢弹 +1', { route: 'split' }),
  make('rico_hunt', '嗜血孢群', 'advanced', 10, '大幅提升追踪孢弹伤害与追击时长，并对半血以下敌人触发斩杀增伤。', lv => {
    const rank = lv + 1
    return `孢弹伤害 +${splitSporeDamageBonus(rank)} 个百分点 · 半血目标 +30% · 存续 +${Math.min(1.5, rank * .25).toFixed(2)} 秒`
  }, { route: 'split', growthClass: 'core', rankCaps: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 } }),
  make('rico_bloom', '爆裂孢弹', 'rare', 1, '追踪孢弹击杀小怪立即引发范围毒爆；对首领／精英每累计命中 4 枚孢弹同样引爆！',
    '爆炸半径 95px · 主弹 75% 范围伤害', { route: 'split' }),
  make('rico_sustain', '穿甲过载', 'advanced', 8, '重弹每穿透 1 名敌人或连续命中同一首领／精英，后续伤害递增（最多 4 层），并额外破甲重创首领／精英。',
    lv => `每层增伤 +${ricochetPierceOverdrivePct(lv + 1)}%（最高 4 层）· 对首领／精英 +${ricochetPierceOverdrivePct(lv + 1)}%`, { route: 'pierce', growthClass: 'core' }),
  make('rico_shock', '破阵冲击', 'advanced', 8, '每发主弹首次穿透敌人或暴击时引爆无视重盾的穿甲冲击波（每轮齐射至多 4 次），震伤周围敌群。',
    lv => `冲击波半径 95px · 伤害 ${ricochetShockPct(lv + 1)}%（受穿透增伤加成）`, { route: 'pierce', growthClass: 'core' }),
  make('rico_breach', '破城弹头', 'rare', 1, '主弹首击首领／精英造成重击；击杀敌人向前方喷射无视重盾的破甲碎弹。',
    '首领／精英首击 +40% · 击杀前向溅射 115px', { route: 'pierce' }),
  make('rico_extension', '折光加速', 'advanced', 3, '扩大光棱主束射程与落点散射折射半径，并加快光棱蓄能开火节奏。',
    lv => {
      const s = prismExtensionStats(lv + 1)
      return `折射范围 +${s.rangeBonus}px · 光程 +${s.reachPct}% · 蓄能间隔 -${s.hastePct}%`
    }, { route: 'bounce', growthClass: 'core', rankCaps: { expedition: { hard: 8, hell: 9 }, timed: 8, endless: 9 } }),
  make('rico_amplify', '余辉增幅', 'advanced', 10, '星爆散射命中的不同目标越多，本发散射光线伤害越高（4 名起满层，孤立单体不生效）。',
    lv => `散射命中 ≥4 目标时额外增伤 +${bounceAmplifyPct(lv + 1)}%`, { route: 'bounce', growthClass: 'core', rankCaps: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 } }),
  make('rico_echo', '棱镜分束', 'rare', 1, '一级散射命中的前 3 个目标化作次级棱镜，各自再向外折射 2 道余辉激光（55% 主束伤害，不递归）。',
    '二级折光 3×2 道 · 继承 55% 主束伤害', { route: 'bounce' }),
  make('rico_split_pierce', '穿心裂变', 'hybrid', 1, '追踪孢弹获得 2 次直线穿透，且穿透过程不衰减伤害。',
    '追踪孢弹穿透 +2 · 100% 保伤', { routes: ['split', 'pierce'], needs: ['rico_split', 'rico_pierce'] }),
  make('rico_split_bounce', '追猎折光', 'hybrid', 1, '追踪孢弹命中后可继续折射 2 次，精准收割漏网目标。',
    '追踪孢弹折射 +2 · 保伤 85%', { routes: ['split', 'bounce'], needs: ['rico_split', 'rico_bounce'] }),
  make('rico_pierce_bounce', '折光穿梭', 'hybrid', 1, '光棱主束可顺穿沿途至多 3 名敌人（75% 保伤），且末段穿刺终点额外触发一次星爆散射。',
    '主束顺穿 +3 · 终点追加星爆散射', { routes: ['pierce', 'bounce'], needs: ['rico_pierce', 'rico_bounce'] }),
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
