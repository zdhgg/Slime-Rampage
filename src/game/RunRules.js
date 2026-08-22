import { ENDLESS_DEFEAT_RETENTION, getEndlessBossFormation } from './EndlessMode.js'

export const RUN_DURATION = 12 * 60
export const FINAL_WARNING_AT = RUN_DURATION - 30
export const EVENT_LOCK_AT = RUN_DURATION - 60

export const MODE_IDS = ['expedition', 'timed', 'endless']
export const DIFFICULTY_IDS = ['easy', 'normal', 'hard', 'hell']

export const MODES = {
  timed: {
    id: 'timed',
    name: '限时讨伐',
    shortName: '限时',
    description: '突破阶段首领，坚守 12 分钟后击败王国最后防线。',
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
    special: '边境钳杀',
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
    special: '缺口盾墙',
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
    special: '王命背裁',
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

/** 远征首领需要承载完整机制循环；终章统帅额外延长决战时间。 */
export function getExpeditionBossHpMultiplier(encounter) {
  return encounter?.final ? 2 : 1.6
}

export const EXPEDITION_STAGES = [
  {
    id: 1,
    type: 'kills',
    title: '害兽讨伐令',
    brief: '突破边防，击溃奉命而来的勇者先锋',
    target: 60,
    region: '史莱姆巢界',
    theme: 'frontier',
    variant: 'nest-border',
    spawn: { x: 0.5, y: 0.5 },
    narrativeKey: 'pest',
    bossId: 'border_warden',
  },
  {
    id: 2,
    type: 'event',
    title: '断讯的信标',
    brief: '摧毁迁跃信标，切断王城增援',
    target: 1,
    eventType: 'beacon',
    region: '勇者营道',
    theme: 'frontier',
    variant: 'camp-road',
    spawn: { x: 0.5, y: 0.62 },
    narrativeKey: 'alarm',
    bossId: 'beacon_engineer',
  },
  {
    id: 3,
    type: 'elites',
    title: '猎人与猎物',
    brief: '反猎精英讨伐队，追上带头的猎团长',
    target: 7,
    region: '腐化洞庭',
    theme: 'blight',
    variant: 'blight-garden',
    spawn: { x: 0.5, y: 0.56 },
    narrativeKey: 'reversal',
    bossId: 'hunt_captain',
  },
  {
    id: 4,
    type: 'defend',
    title: '巢心净火',
    brief: '守住史莱姆巢心，熬过王国的净化围攻',
    target: 90,
    region: '史莱姆巢心',
    theme: 'blight',
    variant: 'slime-nest-sieged',
    spawn: { x: 0.5, y: 0.5 },
    narrativeKey: 'home',
    bossId: 'nest_inquisitor',
  },
  {
    id: 5,
    type: 'mixed',
    title: '王城缺口',
    brief: '撕开王城盾墙，越过外垒的最后缺口',
    target: 75,
    eventTarget: 1,
    eventType: 'surge',
    region: '王城外垒',
    theme: 'royal',
    variant: 'outer-bailey',
    spawn: { x: 0.34, y: 0.5 },
    narrativeKey: 'war',
    bossId: 'gate_marshal',
  },
  {
    id: 6,
    type: 'boss',
    title: '王庭真相',
    brief: '直面讨伐统帅，揭开远征令背后的真相',
    target: 1,
    region: '残破王庭',
    theme: 'royal',
    variant: 'shattered-court',
    spawn: { x: 0.5, y: 0.68 },
    narrativeKey: 'truth',
    bossId: 'court_commander',
  },
]

export const EXPEDITION_REWARDS = [
  {
    id: 'rest',
    name: '黏液休整',
    description: '完全恢复生命。',
  },
  {
    id: 'tome',
    name: '勇者秘籍',
    description: '从三个技能中选择一个。',
  },
  {
    id: 'blood',
    name: '不稳定增殖',
    description: '最大生命 -1，本局攻击提高 20%。',
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
    brief: '突破圣物库，夺回被封存的王国记忆',
    target: 90,
    eventTarget: 1,
    eventType: 'surge',
    region: '王庭圣物库',
    theme: 'royal',
    variant: 'reliquary',
    narrativeKey: 'relic',
    bossId: 'relic_keeper',
  },
  {
    id: 8,
    type: 'elites',
    title: '燃尽的圣殿',
    brief: '击溃圣殿禁卫，穿过燃尽的圣堂',
    target: 9,
    eliteTypes: ['golem', 'knight', 'assassin', 'priest', 'berserker'],
    region: '灰烬圣殿',
    theme: 'royal',
    variant: 'sanctum',
    narrativeKey: 'sanctum',
    bossId: 'ash_paladin',
  },
  {
    id: 9,
    type: 'kills',
    title: '不眠王陵',
    brief: '击退守陵亡军，寻找被掩埋的证词',
    target: 120,
    region: '先王王陵',
    theme: 'blight',
    variant: 'royal-crypt',
    narrativeKey: 'crypt',
    bossId: 'tomb_regent',
  },
  {
    id: 10,
    type: 'event',
    title: '原初封印',
    brief: '逆转四象祭坛，打开黏液诞生的源头',
    target: 1,
    eventType: 'beacon',
    region: '封印地窖',
    theme: 'blight',
    variant: 'seal-chamber',
    narrativeKey: 'origin',
    bossId: 'seal_archbishop',
  },
  {
    id: 11,
    type: 'survive',
    title: '无人的王座',
    brief: '穿过王座回廊，承受最后防线的怒火',
    target: 120,
    region: '王座回廊',
    theme: 'royal',
    variant: 'throne-gallery',
    narrativeKey: 'coronation',
    bossId: 'throne_guard',
  },
  {
    id: 12,
    type: 'elites',
    title: '最后点兵',
    brief: '击溃残存将领，终止王国最后的动员令',
    target: 12,
    eliteTypes: ['knight', 'assassin', 'berserker', 'golem', 'wraith'],
    region: '王庭校场',
    theme: 'royal',
    variant: 'war-camp',
    narrativeKey: 'muster',
    bossId: 'last_marshal',
  },
]

const EXPEDITION_INTERLUDE_COUNTS = { easy: 0, normal: 2, hard: 4, hell: 6 }

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
    enemyHpMul: 0.85,
    enemySpeedMul: 0.92,
    enemySpeedCap: 285,
    spawnPressureMul: 0.85,
    attackTempoMul: 0.92,
    eliteChanceMul: 0.7,
    eliteChanceCap: 0.1,
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
    enemyHpMul: 1,
    enemySpeedMul: 1,
    enemySpeedCap: 305,
    spawnPressureMul: 1,
    attackTempoMul: 1,
    eliteChanceMul: 1,
    eliteChanceCap: 0.12,
    bossHpMul: 1,
    rewardMul: 1,
    doubleAffixChance: 0,
    bossPatternBonus: 0,
  },
  hard: {
    id: 'hard',
    name: '困难',
    description: '更密集的精英攻势与更强的王级勇者。',
    playerBonusHp: 0,
    enemyHpMul: 1.12,
    enemySpeedMul: 1.04,
    enemySpeedCap: 320,
    spawnPressureMul: 1.12,
    attackTempoMul: 1.06,
    eliteChanceMul: 1.5,
    eliteChanceCap: 0.18,
    bossHpMul: 1.15,
    rewardMul: 1.25,
    doubleAffixChance: 0,
    bossPatternBonus: 1,
  },
  hell: {
    id: 'hell',
    name: '地狱',
    description: '极限攻势；部分精英同时拥有两种词缀。',
    playerBonusHp: 0,
    enemyHpMul: 1.28,
    enemySpeedMul: 1.07,
    enemySpeedCap: 335,
    spawnPressureMul: 1.22,
    attackTempoMul: 1.12,
    eliteChanceMul: 2,
    eliteChanceCap: 0.24,
    bossHpMul: 1.3,
    rewardMul: 1.6,
    doubleAffixChance: 0.35,
    bossPatternBonus: 2,
  },
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

  if (value.mode === 'timed') {
    const plans = {
      5: { label: '边境督战', types: ['boss-knight'], memberHpMul: 0.9 },
      10: { label: '皇家奥术镇压', types: ['boss-mage'], memberHpMul: 1 },
      15: { label: '王国双锋', types: ['boss-knight', 'boss-archer'], memberHpMul: 0.72 },
      20: { label: '王庭术猎团', types: ['boss-mage', 'boss-archer'], memberHpMul: 0.72 },
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
 * 敌人越硬、精英越多——难度跟随远征进度而不只跟随时间波次）。
 */
export function getWaveModifiers(selection, wave, stage = 0) {
  const tier = getEndlessDisasterTier(selection, wave)
  const expeditionTier = selection?.mode === 'expedition' ? Math.max(0, (stage || 1) - 1) : 0
  return {
    tier,
    enemyHpMul: 1 + tier * 0.12 + expeditionTier * 0.06,
    bossHpMul: 1 + tier * 0.18 + expeditionTier * 0.09,
    attackTempoMul: 1 + Math.min(0.3, tier * 0.03),
    eliteChanceBonus: Math.min(0.1, tier * 0.02 + expeditionTier * 0.015),
    bossPatternBonus: Math.min(4, tier) + Math.min(2, Math.floor(expeditionTier / 4)),
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

export function isModeUnlocked(progression, mode) {
  const requested = MODE_IDS.indexOf(mode)
  const highest = MODE_IDS.indexOf(
    MODE_IDS.includes(progression?.highestMode) ? progression.highestMode : 'expedition'
  )
  return requested >= 0 && requested <= highest
}

export function getUnlockedModeIds(progression) {
  return MODE_IDS.filter((mode) => isModeUnlocked(progression, mode))
}

export function modeUnlockHint(mode) {
  if (mode === 'timed') return '困难闯关通关后解锁'
  if (mode === 'endless') return '困难限时通关后解锁'
  return ''
}

export function getNextModeUnlock(progression) {
  const mode = MODE_IDS.find((id) => !isModeUnlocked(progression, id))
  return mode ? { mode, name: MODES[mode].name, hint: modeUnlockHint(mode) } : null
}

/** 模式按远征 → 限时 → 无尽推进；只认可对应模式的困难通关。 */
export function unlockedModeAfterRun(progression, run) {
  const current = MODE_IDS.includes(progression?.highestMode)
    ? progression.highestMode
    : 'expedition'
  let next = current
  if (run?.result === 'victory' && run?.difficulty === 'hard') {
    if (run.mode === 'expedition' && MODE_IDS.indexOf(next) < MODE_IDS.indexOf('timed')) next = 'timed'
    if (run.mode === 'timed') next = 'endless'
  }
  return next
}

export function unlockedDifficultyAfterRun(progression, run) {
  const current = progression?.highestDifficulty || 'normal'
  let next = current
  if (
    run?.difficulty === 'normal' &&
    (((run.mode === 'timed' || run.mode === 'expedition') && run.result === 'victory') ||
      (run.mode === 'endless' && Number(run.wave) >= 20))
  ) {
    next = 'hard'
  }
  if (
    DIFFICULTY_IDS.indexOf(next) >= DIFFICULTY_IDS.indexOf('hard') &&
    run?.difficulty === 'hard' &&
    (((run.mode === 'timed' || run.mode === 'expedition') && run.result === 'victory') ||
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

/** 战利品九类求和（App 结算入账与 GameOver 面板展示共用，防两处口径漂移） */
export function sumDrops(drops) {
  if (!drops) return 0
  return (
    (drops.knight || 0) +
    (drops.mage || 0) +
    (drops.archer || 0) +
    (drops.assassin || 0) +
    (drops.priest || 0) +
    (drops.berserker || 0) +
    (drops.hound || 0) +
    (drops.golem || 0) +
    (drops.wraith || 0)
  )
}

export function calculateMaterialReward(rawDrops, selection, context = {}) {
  const total = Math.max(0, Math.round(rawDrops || 0))
  const selected = normalizeRunSelection(selection)
  const endlessBonus = selected.mode === 'endless'
    ? Math.max(0, Number(context.endlessRewardBonus) || 0)
    : 0
  const retention = selected.mode === 'endless' && context.result === 'defeat'
    ? ENDLESS_DEFEAT_RETENTION
    : 1
  return Math.max(
    0,
    Math.round(total * getRunProfile(selected).rewardMul * (1 + endlessBonus) * retention)
  )
}
