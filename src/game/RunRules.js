import { ENDLESS_BOSS_FORMATIONS, ENDLESS_DEFEAT_RETENTION, getEndlessBossFormation } from './EndlessMode.js'

export const RUN_DURATION = 12 * 60
export const RUN_DURATION_20 = 20 * 60
export const FINAL_WARNING_AT = RUN_DURATION - 30
export const EVENT_LOCK_AT = RUN_DURATION - 60

export const PRIMARY_MODE_IDS = ['expedition', 'timed', 'endless']
export const MODE_IDS = ['expedition', 'timed', 'timed20', 'endless']
export const DIFFICULTY_IDS = ['easy', 'normal', 'hard', 'hell']

export function isTimedMode(mode) {
  return mode === 'timed' || mode === 'timed20'
}

export function isExtendedTimedMode(mode) {
  return mode === 'timed20'
}

export function getTimedDuration(mode) {
  return mode === 'timed20' ? RUN_DURATION_20 : RUN_DURATION
}

export function getFinalWarningAt(mode) {
  return getTimedDuration(mode) - 30
}

export function getEventLockAt(mode) {
  return getTimedDuration(mode) - 60
}

export function getTimedMaxWave(mode) {
  return mode === 'timed20' ? 40 : 24
}

export const MODES = {
  timed: {
    id: 'timed',
    name: '限时讨伐',
    shortName: '限时',
    description: '突破阶段首领，坚守 12 分钟后击败王国最后防线。',
  },
  timed20: {
    id: 'timed20',
    name: '限时讨伐 · 20分',
    shortName: '限时20',
    description: '深入王城围剿与多王混战，坚守 20 分钟后迎战王国终焉防线。',
  },
  endless: {
    id: 'endless',
    name: '无尽灾变',
    shortName: '无尽',
    description: '越过第 20 波，迎战规模不断扩大的灾变首领编队。',
  },
  expedition: {
    id: 'expedition',
    name: '王庭逆袭',
    shortName: '远征',
    description: '从史莱姆巢界反攻王庭，逐章追查讨伐令与封印真相。',
  },
}

/**
 * 十二名远征首领共享现有职业动画，但每人拥有独立的预警几何与破解方式。
 * hpMul 只调节章节内相对体量，难度与关卡成长仍由统一战斗曲线负责。
 */
export const EXPEDITION_BOSSES = {
  border_warden: {
    id: 'border_warden',
    name: '边防官 洛恩',
    archetype: 'knight',
    special: '盾枪连击',
    phaseName: '关隘死守',
    mechanic: 'border-pincer',
    hpMul: 0.62,
    telegraph: 1.05,
    cooldown: 5.8,
  },
  beacon_engineer: {
    id: 'beacon_engineer',
    name: '信标术士 赫兹',
    archetype: 'mage',
    special: '三点迁跃',
    phaseName: '过载回路',
    mechanic: 'beacon-triad',
    hpMul: 0.66,
    telegraph: 1.15,
    cooldown: 6.2,
  },
  hunt_captain: {
    id: 'hunt_captain',
    name: '猎团长 薇拉',
    archetype: 'archer',
    special: '八方归猎',
    phaseName: '血迹追索',
    mechanic: 'hunter-converge',
    hpMul: 0.72,
    telegraph: 1.1,
    cooldown: 5.7,
  },
  nest_inquisitor: {
    id: 'nest_inquisitor',
    name: '净巢司祭 伊诺',
    archetype: 'mage',
    special: '净火戒律',
    phaseName: '焚巢圣仪',
    mechanic: 'purifier-annulus',
    hpMul: 0.78,
    telegraph: 1.2,
    cooldown: 6.4,
  },
  gate_marshal: {
    id: 'gate_marshal',
    name: '王城盾将 巴尔德',
    archetype: 'knight',
    special: '重盾猛击',
    phaseName: '城门不坠',
    mechanic: 'shield-wall',
    hpMul: 0.84,
    telegraph: 1.05,
    cooldown: 5.9,
  },
  relic_keeper: {
    id: 'relic_keeper',
    name: '王庭司库 赛芙琳',
    archetype: 'mage',
    special: '双生回响',
    phaseName: '圣物共鸣',
    mechanic: 'relic-echo',
    hpMul: 0.88,
    telegraph: 1.1,
    cooldown: 6.1,
  },
  ash_paladin: {
    id: 'ash_paladin',
    name: '灰烬圣骑 阿斯特',
    archetype: 'knight',
    special: '灰烬十字',
    phaseName: '殉道余烬',
    mechanic: 'ash-cross',
    hpMul: 0.94,
    telegraph: 1.05,
    cooldown: 5.6,
  },
  tomb_regent: {
    id: 'tomb_regent',
    name: '守陵王魂 奥德里克',
    archetype: 'mage',
    special: '王陵回魂',
    phaseName: '千年守望',
    mechanic: 'tomb-spiral',
    hpMul: 1,
    telegraph: 1.2,
    cooldown: 6.5,
  },
  seal_archbishop: {
    id: 'seal_archbishop',
    name: '封印主教 弥迦',
    archetype: 'mage',
    special: '四象逆封',
    phaseName: '原罪显形',
    mechanic: 'seal-quadrants',
    hpMul: 1.04,
    telegraph: 1.25,
    cooldown: 6.2,
  },
  throne_guard: {
    id: 'throne_guard',
    name: '王座近卫 赫克托',
    archetype: 'knight',
    special: '王命横斩',
    phaseName: '王座无退',
    mechanic: 'throne-edict',
    hpMul: 1.08,
    telegraph: 1.05,
    cooldown: 5.7,
  },
  last_marshal: {
    id: 'last_marshal',
    name: '末代元帅 凯恩',
    archetype: 'archer',
    special: '终焉点兵',
    phaseName: '举国皆兵',
    mechanic: 'final-muster',
    hpMul: 1.12,
    telegraph: 1.25,
    cooldown: 7,
  },
  court_commander: {
    id: 'court_commander',
    name: '讨伐统帅 雷欧尼斯',
    archetype: 'knight',
    special: '王庭棋局',
    phaseName: '统帅决意',
    mechanic: 'royal-chess',
    hpMul: 1,
    telegraph: 1.2,
    cooldown: 5.8,
    final: true,
  },
}

export function getExpeditionBoss(id) {
  return EXPEDITION_BOSSES[id] || EXPEDITION_BOSSES.court_commander
}

/**
 * 远征首领需要承载完整机制循环，统一给 2.2 倍体量（BOSS 平衡 2026-11 由 1.6 上调：
 * 旧体量在实战构筑下章节首领 20~50 秒就倒，机制还没轮转完战斗已结束）。
 * 终章的额外强度改由成长曲线（EXPEDITION_BOSS_GROWTH）与统帅自身 hpMul 提供——
 * 旧口径在此处再叠一层 2× 会让终章相对前一章暴涨近一倍，形成曲线悬崖。
 */
export function getExpeditionBossHpMultiplier(encounter) {
  return encounter ? 2.2 : 1
}

export const EXPEDITION_STAGES = [
  {
    id: 1,
    type: 'kills',
    title: '害兽讨伐令',
    brief: '击杀 60 名敌人，引出边防官',
    target: 60,
    region: '史莱姆巢界',
    theme: 'frontier',
    variant: 'nest-border',
    spawn: { x: 0.5, y: 0.5 },
    narrativeKey: 'pest',
    bossId: 'border_warden',
    enemyBias: { knight: 1.2 },
  },
  {
    id: 2,
    type: 'event',
    title: '断讯的信标',
    brief: '进入蓝圈激活信标，留在圈内直到封锁完成',
    target: 1,
    eventType: 'beacon',
    deadline: 180,
    region: '勇者营道',
    theme: 'frontier',
    variant: 'camp-road',
    spawn: { x: 0.5, y: 0.62 },
    narrativeKey: 'alarm',
    bossId: 'beacon_engineer',
    enemyBias: { mage: 2, hound: 1.4, knight: 0.6 },
  },
  {
    id: 3,
    type: 'elites',
    title: '猎人与猎物',
    brief: '击杀 7 名精英，引出猎团长',
    target: 7,
    region: '腐化洞庭',
    theme: 'blight',
    variant: 'blight-garden',
    spawn: { x: 0.5, y: 0.56 },
    narrativeKey: 'reversal',
    bossId: 'hunt_captain',
    enemyBias: { assassin: 2, hound: 1.5, knight: 0.7 },
  },
  {
    id: 4,
    type: 'defend',
    title: '巢心净火',
    brief: '保护巢心 90 秒，靠近或命中冲巢敌人即可引开它们',
    target: 90,
    region: '史莱姆巢心',
    theme: 'blight',
    variant: 'slime-nest-sieged',
    spawn: { x: 0.5, y: 0.5 },
    narrativeKey: 'home',
    bossId: 'nest_inquisitor',
    enemyBias: { knight: 1.6, berserker: 1.3, alchemist: 1.4, assassin: 0.7 },
  },
  {
    id: 5,
    type: 'mixed',
    title: '王城缺口',
    brief: '击杀 75 名敌人，并完成一次污染黏液池事件',
    target: 75,
    eventTarget: 1,
    eventType: 'surge',
    region: '王城外垒',
    theme: 'royal',
    variant: 'outer-bailey',
    spawn: { x: 0.34, y: 0.5 },
    narrativeKey: 'war',
    bossId: 'gate_marshal',
    enemyBias: { knight: 1.8, bulwark: 1.6, priest: 1.3, assassin: 0.6 },
  },
  {
    id: 6,
    type: 'boss',
    title: '王庭真相',
    brief: '击败讨伐统帅',
    target: 1,
    region: '残破王庭',
    theme: 'royal',
    variant: 'shattered-court',
    spawn: { x: 0.5, y: 0.68 },
    narrativeKey: 'truth',
    bossId: 'court_commander',
    enemyBias: { knight: 1.4, priest: 1.3, mage: 1.2, bannerman: 1.35, hound: 0.6 },
  },
]

export function getExpeditionStage(difficulty, stage) {
  const stages = getExpeditionStages(difficulty)
  return stages[Math.max(1, Math.min(stages.length, stage)) - 1]
}

/**
 * 王城插章：更高难度在统帅决战前追加的章节（普通 +2、困难 +4、地狱 +6）。
 * 叙事线从地面攻势一路打穿到王陵与封印地窖——王国封印的原点。
 */
const EXPEDITION_INTERLUDES = [
  {
    id: 7,
    type: 'mixed',
    title: '被藏起的圣物',
    brief: '击杀 90 名敌人，并完成一次污染黏液池事件',
    target: 90,
    eventTarget: 1,
    eventType: 'surge',
    region: '王庭圣物库',
    theme: 'royal',
    variant: 'reliquary',
    narrativeKey: 'relic',
    bossId: 'relic_keeper',
    enemyBias: { mage: 1.8, golem: 1.5, assassin: 0.6 },
  },
  {
    id: 8,
    type: 'elites',
    title: '燃尽的圣殿',
    brief: '击杀 9 名精英，引出灰烬圣骑',
    target: 9,
    eliteTypes: ['golem', 'knight', 'assassin', 'priest', 'berserker'],
    region: '灰烬圣殿',
    theme: 'royal',
    variant: 'sanctum',
    narrativeKey: 'sanctum',
    bossId: 'ash_paladin',
    enemyBias: { golem: 2, berserker: 1.4, knight: 1.2 },
  },
  {
    id: 9,
    type: 'kills',
    title: '不眠王陵',
    brief: '击杀 120 名敌人，引出守陵王魂',
    target: 120,
    region: '先王王陵',
    theme: 'blight',
    variant: 'royal-crypt',
    narrativeKey: 'crypt',
    bossId: 'tomb_regent',
    enemyBias: { wraith: 2.2, golem: 1.4, hound: 0.5 },
  },
  {
    id: 10,
    type: 'event',
    title: '原初封印',
    brief: '进入蓝圈激活信标，守圈封锁后迎战封印主教',
    target: 1,
    eventType: 'beacon',
    region: '封印地窖',
    theme: 'blight',
    variant: 'seal-chamber',
    narrativeKey: 'origin',
    bossId: 'seal_archbishop',
    enemyBias: { wraith: 1.8, mage: 1.6, priest: 1.2 },
  },
  {
    id: 11,
    type: 'survive',
    title: '无人的王座',
    brief: '躲避追击，存活 120 秒以引出王座近卫',
    target: 120,
    region: '王座回廊',
    theme: 'royal',
    variant: 'throne-gallery',
    narrativeKey: 'coronation',
    bossId: 'throne_guard',
    enemyBias: { knight: 2, bulwark: 1.4, bannerman: 1.35, priest: 1.5, berserker: 1.3 },
  },
  {
    id: 12,
    type: 'elites',
    title: '最后点兵',
    brief: '击杀 12 名精英，引出末代元帅',
    target: 12,
    eliteTypes: ['knight', 'assassin', 'berserker', 'golem', 'wraith'],
    region: '王庭校场',
    theme: 'royal',
    variant: 'war-camp',
    narrativeKey: 'muster',
    bossId: 'last_marshal',
    enemyBias: { berserker: 2, archer: 1.4, knight: 1.3, bannerman: 1.5, alchemist: 1.25, mage: 0.6 },
  },
]

const EXPEDITION_INTERLUDE_COUNTS = { easy: 0, normal: 2, hard: 4, hell: 6 }

/**
 * 首领乘算成长档位（解决「越到后期首领越脆」的曲线倒挂）：
 * 玩家 DPS 随等级与技能是乘算增长（一局可涨一个数量级），而首领基础生命
 * 只在 baseHp 里线性 +8/波——缺少乘算补偿时，后期首领相对血量持续缩水，
 * 终局反而成为全流程最轻松的一场。这里按档位给首领独立的乘算成长：
 *  - 限时：第 5 波起每 5 波一档（第 5/10/15/20/25 波，终局为第 5 档）
 *  - 远征：每章一档逐章递进（上限 12 章），避免旧口径「前段平、末章暴涨」
 * 用查表而非 pow 是为了让断言可精确复现，也便于逐档手调。
 */
// BOSS 平衡 2026-11：前段与中后段整体抬升，配合 Boss 四层防暴毙与困难/地狱高压曲线，
// 目标困难/地狱成型构筑首领实战 TTK 落在 45~70 秒（约 60 秒硬核高压体验）。
const TIMED_BOSS_GROWTH = [2.2, 2.6, 3.0, 3.5, 4.2]
// 20 分钟限时在第 20 波后继续爬坡（第 25/30/35/40+ 波对应 4.2 → 7.4），追赶玩家深层构筑输出。
const TIMED20_BOSS_GROWTH = [2.2, 2.6, 3.0, 3.5, 4.2, 5.1, 6.2, 7.4]
const EXPEDITION_BOSS_GROWTH = [1.05, 1.24, 1.48, 1.76, 2.08, 2.46, 2.95, 3.4, 4.02, 4.72, 5.55, 6.5]

/** 首领成长系数：远征按章、限时按波次档位、无尽按灾变档位复用同一成长表 */
function getBossGrowth(selection, wave, expeditionTier) {
  if (selection?.mode === 'expedition') {
    return EXPEDITION_BOSS_GROWTH[Math.min(expeditionTier, EXPEDITION_BOSS_GROWTH.length - 1)]
  }
  if (isTimedMode(selection?.mode)) {
    const timedTier = Math.max(0, Math.floor((Math.max(1, wave) - 5) / 5))
    const table = selection.mode === 'timed20' ? TIMED20_BOSS_GROWTH : TIMED_BOSS_GROWTH
    return table[Math.min(timedTier, table.length - 1)]
  }
  // 无尽（BOSS 平衡 2026-11 补齐）：此前成长恒为 1，前段首领只有 baseHp 线性抬升、
  // 血量明显落后于限时同波次。改为 20 波前与限时首档一致（×2），
  // 20 波后按灾变档位复用限时成长表，与 (1+tier*0.18) 叠乘。
  if (selection?.mode === 'endless') {
    if (wave < 20) return TIMED_BOSS_GROWTH[0]
    const tier = getEndlessDisasterTier(selection, wave)
    return TIMED_BOSS_GROWTH[Math.min(tier, TIMED_BOSS_GROWTH.length - 1)]
  }
  return 1
}

/**
 * 章节敌军偏向（章节 → 兵种权重乘数）：
 * 让 12 个章节的兵种构成随地域变化，而不只是数值不同——
 * 王城缺口是盾卫与牧师的主场、王陵是怨灵的巢穴、校场挤满狂战士。
 * 权重为乘数（1 = 不变），未列出的兵种保持原权重；
 * 平局或权重全为 0 时回退到波次原生权重，不会抽不出兵。
 */
export function applyEnemyBias(roster, bias) {
  if (!bias) return roster
  const scaled = roster.map(([type, weight]) => [type, Math.max(0, weight * (bias[type] ?? 1))])
  const total = scaled.reduce((sum, [, weight]) => sum + weight, 0)
  if (total <= 0) return roster // 偏向把权重清空：回退原生编成
  return scaled.filter(([, weight]) => weight > 0)
}

/** 当前章节的敌军偏向（非远征模式返回 null，不改变原有波次编成） */
export function getStageEnemyBias(selection, stage) {
  if (selection?.mode !== 'expedition') return null
  return getExpeditionStage(selection.difficulty, stage)?.enemyBias || null
}

/** 远征关卡表按难度递增：简单 6 关，普通/困难/地狱为 8/10/12 关（插章插在统帅决战之前）。 */
export function getExpeditionStages(difficulty) {
  const interludes = EXPEDITION_INTERLUDES.slice(
    0,
    EXPEDITION_INTERLUDE_COUNTS[difficulty] ?? EXPEDITION_INTERLUDE_COUNTS.normal
  )
  return [...EXPEDITION_STAGES.slice(0, 5), ...interludes, EXPEDITION_STAGES[5]]
}

export const DIFFICULTIES = {
  easy: {
    id: 'easy',
    name: '简单',
    description: '更耐打，勇者攻势更舒缓。',
    playerBonusHp: 2,
    enemyHpMul: 0.92,
    eliteHpMul: 0.95,
    enemySpeedMul: 0.92,
    enemySpeedCap: 285,
    spawnPressureMul: 0.88,
    attackTempoMul: 0.92,
    eliteChanceMul: 0.75,
    eliteChanceCap: 0.11,
    bossHpMul: 0.85,
    rewardMul: 0.8,
    doubleAffixChance: 0,
    bossPatternBonus: 0,
  },
  normal: {
    id: 'normal',
    name: '普通',
    description: '标准攻势与完整成长节奏。',
    playerBonusHp: 0,
    enemyHpMul: 1.15,
    eliteHpMul: 1.15,
    enemySpeedMul: 1,
    enemySpeedCap: 310,
    spawnPressureMul: 1,
    attackTempoMul: 1.02,
    eliteChanceMul: 1.1,
    eliteChanceCap: 0.14,
    bossHpMul: 1.35,
    timedBossHpRamp: [1.05, 0.12, 1.55],
    timed20BossHpMax: 1.9,
    rewardMul: 1,
    doubleAffixChance: 0,
    bossPatternBonus: 0,
  },
  hard: {
    id: 'hard',
    name: '困难',
    description: '高压硬核攻势、高频双词缀精英与具备防暴毙韧性的王级勇者。',
    playerBonusHp: 0,
    enemyHpMul: 1.45,
    eliteHpMul: 1.35,
    enemySpeedMul: 1.06,
    enemySpeedCap: 332,
    spawnPressureMul: 1.25,
    attackTempoMul: 1.12,
    eliteChanceMul: 1.75,
    eliteChanceCap: 0.24,
    bossHpMul: 2.8,
    timedBossHpRamp: [1.4, 0.55, 4.15],
    timed20BossHpMax: 6.2,
    expeditionBossHpRamp: [1.15, 0.14, 2.55],
    rewardMul: 1.35,
    doubleAffixChance: 0.22,
    bossPatternBonus: 1,
  },
  hell: {
    id: 'hell',
    name: '地狱',
    description: '极限硬核攻势；大量精英兼具双词缀与新词缀，王级勇者拥有极高耐久、破盾与重伤杀招。',
    playerBonusHp: 0,
    enemyHpMul: 1.85,
    eliteHpMul: 1.55,
    enemySpeedMul: 1.08,
    enemySpeedCap: 335,
    spawnPressureMul: 1.4,
    attackTempoMul: 1.2,
    eliteChanceMul: 2.3,
    eliteChanceCap: 0.32,
    bossHpMul: 3.8,
    timedBossHpRamp: [1.55, 0.72, 5.4],
    timed20BossHpMax: 7.4,
    expeditionBossHpRamp: [1.3, 0.2, 3.4],
    rewardMul: 1.8,
    doubleAffixChance: 0.48,
    bossPatternBonus: 2,
  },
}

/**
 * 难度对首领生命的修正倍率：
 *  - 限时/普通以上：按首领波次档位递增；
 *  - 远征困难/地狱：按章节深度递增，避免后期黑市+成型构筑融化章节守将；
 *  - 无尽困难/地狱：按 5 波一档递增，追赶深层构筑输出。
 */
export function getDifficultyBossHpMultiplier(profile, selection, wave = 1, stage = 0) {
  const base = profile?.bossHpMul || 1
  if (selection?.mode === 'expedition') {
    if (!Array.isArray(profile?.expeditionBossHpRamp)) return base
    const [start, step, max] = profile.expeditionBossHpRamp
    const expTier = Math.max(0, (stage || 1) - 1)
    return base * Math.min(max, start + expTier * step)
  }
  if (!Array.isArray(profile?.timedBossHpRamp)) return base
  if (!isTimedMode(selection?.mode) && selection?.mode !== 'endless') return base
  const [start, step, max] = profile.timedBossHpRamp
  const cap = (selection?.mode === 'timed20' || selection?.mode === 'endless') && Number.isFinite(profile?.timed20BossHpMax)
    ? profile.timed20BossHpMax
    : max
  const tier = Math.max(0, Math.floor((Math.max(1, wave) - 5) / 5))
  return base * Math.min(cap, start + tier * step)
}

export function normalizeRunSelection(selection = {}) {
  return {
    mode: MODE_IDS.includes(selection.mode) ? selection.mode : 'timed',
    difficulty: DIFFICULTY_IDS.includes(selection.difficulty) ? selection.difficulty : 'normal',
  }
}

export function runKey(selection) {
  const value = normalizeRunSelection(selection)
  return `${value.mode}:${value.difficulty}`
}

export function getRunProfile(selection) {
  const value = normalizeRunSelection(selection)
  return {
    ...value,
    modeInfo: MODES[value.mode],
    difficultyInfo: DIFFICULTIES[value.difficulty],
    ...DIFFICULTIES[value.difficulty],
  }
}

export function getEndlessDisasterTier(selection, wave) {
  const value = normalizeRunSelection(selection)
  if (value.mode !== 'endless') return 0
  return Math.max(0, Math.floor((Math.max(1, wave) - 20) / 5))
}

/** 限时与无尽的五波首领表；多首领以较低单体生命换取组合压力。 */
export function getBossWavePlan(selection, wave, extraBossMembers = 0) {
  const value = normalizeRunSelection(selection)
  if (value.mode === 'expedition' || wave < 5 || wave % 5 !== 0) return null

  if (isTimedMode(value.mode)) {
    const plans = {
      5: { label: '边境督战', types: ['boss-knight'], memberHpMul: 0.9 },
      10: { label: '皇家奥术镇压', types: ['boss-mage'], memberHpMul: 1 },
      15: { label: '王国双锋', types: ['boss-knight', 'boss-archer'], memberHpMul: 0.72 },
      20: { label: '王庭术猎团', types: ['boss-mage', 'boss-archer'], memberHpMul: 0.72 },
    }
    if (value.mode === 'timed20') {
      plans[25] = {
        label: '王庭三圣卫',
        types: ['boss-knight', 'boss-mage', 'boss-archer'],
        total: 3,
        maxActive: 3,
        memberHpMul: 0.62,
        formation: { ...ENDLESS_BOSS_FORMATIONS[0] },
      }
      plans[30] = {
        label: '血誓讨伐团',
        types: ['boss-knight', 'boss-mage', 'boss-archer', 'boss-knight'],
        total: 4,
        maxActive: 3,
        memberHpMul: 0.56,
        formation: { ...ENDLESS_BOSS_FORMATIONS[1] },
      }
      plans[35] = {
        label: '四王围猎阵',
        types: ['boss-knight', 'boss-mage', 'boss-archer', 'boss-knight'],
        total: 4,
        maxActive: 4,
        memberHpMul: 0.5,
        formation: { ...ENDLESS_BOSS_FORMATIONS[2] },
      }
    }
    return plans[wave] || null
  }

  // 越过第 20 波后，每次首领波都增加一名成员；三名以上作为后备依次补位。
  const baseTotal = Math.min(6, Math.max(1, Math.floor((wave - 20) / 5) + 1))
  const total = Math.min(8, baseTotal + Math.max(0, Math.floor(extraBossMembers || 0)))
  const maxActive = Math.min(3, total)
  const rotations = [
    ['boss-knight', 'boss-mage', 'boss-archer'],
    ['boss-mage', 'boss-archer', 'boss-knight'],
    ['boss-archer', 'boss-knight', 'boss-mage'],
  ]
  const rotation = rotations[Math.floor(wave / 5) % rotations.length]
  const types = Array.from({ length: total }, (_, index) => rotation[index % rotation.length])
  const rank = total >= 4
    ? `灾变王团 ×${total}`
    : total === 3 ? '灾变三王' : total === 2 ? '灾变双王' : '王级勇者'
  const memberHpMul = [1, 1, 0.72, 0.58, 0.52, 0.47, 0.43, 0.4, 0.37][total]
  return {
    label: `${rank} · 第 ${wave} 波`,
    types,
    total,
    maxActive,
    memberHpMul,
    formation: getEndlessBossFormation(wave, total),
  }
}

/**
 * 波次修饰：无尽按灾变档位递增；远征按关卡进度递进（关卡越深，
 * 敌人越硬、精英越多——难度跟随远征进度而不只跟随时间波次）；
 * 首领血量另有按档位的乘算成长（见 getBossGrowth），避免后期相对变脆。
 */
export function getWaveModifiers(selection, wave, stage = 0) {
  const tier = getEndlessDisasterTier(selection, wave)
  const expeditionTier = selection?.mode === 'expedition' ? Math.max(0, (stage || 1) - 1) : 0
  const timedLateTier = selection?.mode === 'timed20' && wave > 20
    ? Math.min(4, Math.floor((wave - 20) / 5))
    : 0
  const bossGrowth = getBossGrowth(selection, wave, expeditionTier)
  return {
    tier,
    enemyHpMul: 1 + tier * 0.12 + expeditionTier * 0.06 + timedLateTier * 0.1,
    bossHpMul: (1 + tier * 0.18) * bossGrowth,
    attackTempoMul: 1 + Math.min(0.3, tier * 0.03) + timedLateTier * 0.03,
    eliteChanceBonus: Math.min(0.1, tier * 0.02 + expeditionTier * 0.015) + timedLateTier * 0.02,
    bossPatternBonus:
      Math.min(4, tier) +
      Math.min(2, Math.floor(expeditionTier / 4)) +
      Math.min(2, Math.floor((timedLateTier + 1) / 2)),
  }
}

export function isDifficultyUnlocked(progression, difficulty) {
  const requested = DIFFICULTY_IDS.indexOf(difficulty)
  const unlocked = DIFFICULTY_IDS.indexOf(progression?.highestDifficulty || 'normal')
  return requested >= 0 && requested <= Math.max(1, unlocked)
}

/** 无尽战场推进：灾厄烧向王都——边境 → 腐化 → 王城，随波次换景（复用现有主题资产） */
export const PROGRESSION_THEMES = [
  { minWave: 1, theme: 'frontier', variant: 'marsh-edge' },
  { minWave: 20, theme: 'blight', variant: 'blight-garden' },
  { minWave: 30, theme: 'royal', variant: 'outer-bailey' },
]

export function getProgressionStage(wave) {
  let matched = PROGRESSION_THEMES[0]
  for (const stage of PROGRESSION_THEMES) {
    if (wave >= stage.minWave) matched = stage
  }
  return matched
}

export function difficultyUnlockHint(difficulty) {
  if (difficulty === 'hard') return '普通限时或远征通关，或普通无尽到达第 20 波'
  if (difficulty === 'hell') return '困难限时或远征通关，或困难无尽到达第 25 波'
  return ''
}

function normalizedHighestMode(progression) {
  const raw = progression?.highestMode
  if (PRIMARY_MODE_IDS.includes(raw)) return raw
  if (raw === 'timed20') return 'endless'
  return 'expedition'
}

export function isModeUnlocked(progression, mode) {
  const highest = normalizedHighestMode(progression)
  if (mode === 'timed20') return highest === 'endless'
  const requested = PRIMARY_MODE_IDS.indexOf(mode)
  const highestIdx = PRIMARY_MODE_IDS.indexOf(highest)
  return requested >= 0 && requested <= highestIdx
}

export function getUnlockedModeIds(progression) {
  return PRIMARY_MODE_IDS.filter((mode) => isModeUnlocked(progression, mode))
}

export function modeUnlockHint(mode) {
  // 条件直接点名模式，避免「闯关/限时」这类需要玩家自行映射的简称。
  if (mode === 'timed') return '通关「王庭逆袭 · 困难」后解锁'
  if (mode === 'timed20') return '通关「限时讨伐（12 分钟）· 困难」后解锁'
  if (mode === 'endless') return '通关「限时讨伐 · 困难」后解锁'
  return ''
}

export function getNextModeUnlock(progression) {
  const mode = PRIMARY_MODE_IDS.find((id) => !isModeUnlocked(progression, id))
  return mode ? { mode, name: MODES[mode].name, hint: modeUnlockHint(mode) } : null
}

/** 模式按远征 → 限时 → 无尽推进；通关 12 分钟困难会同步解锁 20 分钟限时与无尽。 */
export function unlockedModeAfterRun(progression, run) {
  const current = normalizedHighestMode(progression)
  let next = current
  if (run?.result === 'victory' && run?.difficulty === 'hard') {
    if (run.mode === 'expedition' && PRIMARY_MODE_IDS.indexOf(next) < PRIMARY_MODE_IDS.indexOf('timed')) {
      next = 'timed'
    }
    if (isTimedMode(run.mode)) next = 'endless'
  }
  return next
}

export function unlockedDifficultyAfterRun(progression, run) {
  const current = progression?.highestDifficulty || 'normal'
  let next = current
  if (
    run?.difficulty === 'normal' &&
    (((isTimedMode(run.mode) || run.mode === 'expedition') && run.result === 'victory') ||
      (run.mode === 'endless' && Number(run.wave) >= 20))
  ) {
    next = 'hard'
  }
  if (
    DIFFICULTY_IDS.indexOf(next) >= DIFFICULTY_IDS.indexOf('hard') &&
    run?.difficulty === 'hard' &&
    (((isTimedMode(run.mode) || run.mode === 'expedition') && run.result === 'victory') ||
      (run.mode === 'endless' && Number(run.wave) >= 25))
  ) {
    next = 'hell'
  }
  return DIFFICULTY_IDS.indexOf(next) > DIFFICULTY_IDS.indexOf(current) ? next : current
}

export function formatRunClock(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function sanitizeRun(run, selection = run) {
  const selected = normalizeRunSelection(selection)
  return {
    mode: selected.mode,
    difficulty: selected.difficulty,
    result: ['victory', 'extracted'].includes(run?.result) ? run.result : 'defeat',
    // 远征关数随难度递增（6/8/10/12 关），按本局难度的实际关卡表截断
    stage: Math.max(
      1,
      Math.min(
        getExpeditionStages(selected.difficulty).length,
        Math.round(run?.stage || run?.expeditionStage || 1)
      )
    ),
    wave: Math.max(1, Math.round(run?.wave || 1)),
    kills: Math.max(0, Math.round(run?.kills || 0)),
    time: Math.max(0, Math.round(run?.time ?? run?.elapsed ?? 0)),
    finaleTime: Math.max(0, Number(run?.finaleTime || 0)),
    devours: Math.max(0, Math.round(run?.devours || 0)),
    eliteKills: Math.max(0, Math.round(run?.eliteKills || 0)),
    bossKills: Math.max(0, Math.round(run?.bossKills || 0)),
    eventsCompleted: Math.max(0, Math.round(run?.eventsCompleted || 0)),
    species: typeof run?.species === 'string' ? run.species : '',
  }
}

export function computeScoreBreakdown(run) {
  const clean = sanitizeRun(run)
  const timed = isTimedMode(clean.mode)
  const progressWave = timed ? Math.min(getTimedMaxWave(clean.mode), clean.wave) : clean.wave
  const breakdown = {
    combat: clean.kills * 10,
    devour: clean.devours * 15,
    elite: clean.eliteKills * 75,
    boss: clean.bossKills * 500,
    events: clean.eventsCompleted * 350,
    progress: clean.mode === 'expedition' ? (clean.stage - 1) * 800 : (progressWave - 1) * 100,
    victory:
      (timed || clean.mode === 'expedition') && clean.result === 'victory'
        ? clean.mode === 'expedition' || clean.mode === 'timed20' ? 6000 : 4000
        : 0,
    finaleSpeed:
      timed && clean.result === 'victory'
        ? Math.max(0, Math.round(((clean.mode === 'timed20' ? 240 : 180) - clean.finaleTime) * 10))
        : 0,
    clearSpeed:
      clean.mode === 'expedition' && clean.result === 'victory'
        ? Math.max(0, Math.round((1500 - clean.time) * 2))
        : 0,
  }
  breakdown.total = Object.values(breakdown).reduce((sum, value) => sum + value, 0)
  return breakdown
}

export function computeScore(run) {
  return computeScoreBreakdown(run).total
}

/**
 * 战力点（黑市货币）：由本局分数按难度倍率折算，客户端预览与服务端入账共用同一公式。
 * 锚点：POINTS_PER_SCORE = 30（即旧口径 ÷3000 的 ×100 展示尺度）→ 困难通关（~2.6 万分 ×1.35）
 * 约 1100 点、普通通关约 800 点；20 分钟限时分母为 50（同难度完整通关约 +20% 收益）；
 * 无尽沿用灾变/继续加成与战败 70% 保留；POINTS_SOFT_CAP 后收益减半，
 * 防止深层无尽单局打穿黑市货架。
 */
export const POINTS_PER_SCORE = 30
export const POINTS_PER_SCORE_TIMED20 = 50
export const POINTS_SOFT_CAP = 2000

export function getPointsPerScore(mode) {
  return mode === 'timed20' ? POINTS_PER_SCORE_TIMED20 : POINTS_PER_SCORE
}

export function scoreToPoints(score, selection, context = {}) {
  const selected = normalizeRunSelection(selection)
  const endlessBonus = selected.mode === 'endless'
    ? Math.max(0, Number(context.endlessRewardBonus) || 0)
    : 0
  const retention = selected.mode === 'endless' && context.result === 'defeat'
    ? ENDLESS_DEFEAT_RETENTION
    : 1
  const scaled = Math.max(0, Number(score) || 0) *
    getRunProfile(selected).rewardMul * (1 + endlessBonus) * retention
  const raw = Math.max(0, Math.round(scaled / getPointsPerScore(selected.mode)))
  return raw > POINTS_SOFT_CAP ? POINTS_SOFT_CAP + Math.round((raw - POINTS_SOFT_CAP) / 2) : raw
}
