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
    description: '坚守 12 分钟，随后击败终局勇者。',
  },
  endless: {
    id: 'endless',
    name: '无尽灾变',
    shortName: '无尽',
    description: '越过第 20 波，每 5 波提升一次灾变等级。',
  },
  expedition: {
    id: 'expedition',
    name: '章节远征',
    shortName: '远征',
    description: '连破数道战区关卡，最终击败章节统帅。',
  },
}

export const EXPEDITION_STAGES = [
  {
    id: 1,
    type: 'kills',
    title: '边境清剿',
    brief: '击退勇者先锋',
    target: 60,
    region: '湿苔边境',
    theme: 'frontier',
    variant: 'marsh-edge',
    narrativeKey: 'pest',
  },
  {
    id: 2,
    type: 'event',
    title: '截断增援',
    brief: '封锁勇者传送信标',
    target: 1,
    eventType: 'beacon',
    region: '勇者营道',
    theme: 'frontier',
    variant: 'camp-road',
    narrativeKey: 'alarm',
  },
  {
    id: 3,
    type: 'elites',
    title: '猎杀队长',
    brief: '吞噬精英讨伐队',
    target: 7,
    region: '腐化洞庭',
    theme: 'blight',
    variant: 'blight-garden',
    narrativeKey: 'reversal',
  },
  {
    id: 4,
    type: 'survive',
    title: '巢穴守卫',
    brief: '承受勇者围攻',
    target: 90,
    region: '史莱姆巢心',
    theme: 'blight',
    variant: 'slime-nest',
    narrativeKey: 'home',
  },
  {
    id: 5,
    type: 'mixed',
    title: '王城突破',
    brief: '击退守军并完成地图事件',
    target: 75,
    eventTarget: 1,
    eventType: 'surge',
    region: '王城外垒',
    theme: 'royal',
    variant: 'outer-bailey',
    narrativeKey: 'war',
  },
  {
    id: 6,
    type: 'boss',
    title: '王庭决战',
    brief: '击败远征统帅',
    target: 1,
    region: '残破王庭',
    theme: 'royal',
    variant: 'shattered-court',
    narrativeKey: 'truth',
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
    title: '圣物洗劫',
    brief: '洗劫王庭圣物库',
    target: 90,
    eventTarget: 1,
    eventType: 'surge',
    region: '王庭圣物库',
    theme: 'royal',
    variant: 'reliquary',
    narrativeKey: 'relic',
  },
  {
    id: 8,
    type: 'elites',
    title: '圣殿禁卫',
    brief: '击溃圣殿骑士团',
    target: 9,
    eliteTypes: ['golem', 'knight', 'assassin', 'priest', 'berserker'],
    region: '灰烬圣殿',
    theme: 'royal',
    variant: 'sanctum',
    narrativeKey: 'sanctum',
  },
  {
    id: 9,
    type: 'kills',
    title: '王陵惊魂',
    brief: '清空守陵亡军',
    target: 120,
    region: '先王王陵',
    theme: 'blight',
    variant: 'royal-crypt',
    narrativeKey: 'crypt',
  },
  {
    id: 10,
    type: 'event',
    title: '地窖封印',
    brief: '捣毁王庭召唤祭坛',
    target: 1,
    eventType: 'beacon',
    region: '封印地窖',
    theme: 'blight',
    variant: 'seal-chamber',
    narrativeKey: 'origin',
  },
  {
    id: 11,
    type: 'survive',
    title: '王座回廊',
    brief: '承受王国全军的怒火',
    target: 120,
    region: '王座回廊',
    theme: 'royal',
    variant: 'throne-gallery',
    narrativeKey: 'coronation',
  },
  {
    id: 12,
    type: 'elites',
    title: '终焉动员',
    brief: '击溃王国残存的所有将领',
    target: 12,
    eliteTypes: ['knight', 'assassin', 'berserker', 'golem', 'wraith'],
    region: '王庭校场',
    theme: 'royal',
    variant: 'war-camp',
    narrativeKey: 'muster',
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
    enemyHpMul: 1.2,
    enemySpeedMul: 1.08,
    spawnPressureMul: 1.15,
    attackTempoMul: 1.08,
    eliteChanceMul: 1.5,
    eliteChanceCap: 0.18,
    bossHpMul: 1.2,
    rewardMul: 1.25,
    doubleAffixChance: 0,
    bossPatternBonus: 1,
  },
  hell: {
    id: 'hell',
    name: '地狱',
    description: '极限攻势；部分精英同时拥有两种词缀。',
    playerBonusHp: 0,
    enemyHpMul: 1.45,
    enemySpeedMul: 1.12,
    spawnPressureMul: 1.3,
    attackTempoMul: 1.18,
    eliteChanceMul: 2,
    eliteChanceCap: 0.24,
    bossHpMul: 1.45,
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

/**
 * 波次修饰：无尽按灾变档位递增；远征按关卡进度递进（关卡越深，
 * 敌人越硬、精英越多——难度跟随远征进度而不只跟随时间波次）。
 */
export function getWaveModifiers(selection, wave, stage = 0) {
  const tier = getEndlessDisasterTier(selection, wave)
  const expeditionTier = selection?.mode === 'expedition' ? Math.max(0, (stage || 1) - 1) : 0
  return {
    tier,
    enemyHpMul: 1 + tier * 0.12 + expeditionTier * 0.08,
    bossHpMul: 1 + tier * 0.18 + expeditionTier * 0.08,
    eliteChanceBonus: Math.min(0.1, tier * 0.02 + expeditionTier * 0.02),
    bossPatternBonus: Math.min(4, tier + Math.floor(expeditionTier / 2)),
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

/** 战利品六类求和（App 结算入账与 GameOver 面板展示共用，防两处口径漂移） */
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

export function calculateMaterialReward(rawDrops, selection) {
  const total = Math.max(0, Math.round(rawDrops || 0))
  return Math.max(0, Math.round(total * getRunProfile(selection).rewardMul))
}
