export const ENDLESS_CALAMITY_START_WAVE = 25
export const ENDLESS_EXTRACTION_START_WAVE = 10
export const ENDLESS_EXTRACTION_INTERVAL = 10
export const ENDLESS_DEFEAT_RETENTION = 0.7
export const ENDLESS_CONTINUE_REWARD_BONUS = 0.15
export const ENDLESS_FORMATION_BREAK_DURATION = 8
export const ENDLESS_FORMATION_BREAK_ATTACK_INTERVAL_MUL = 0.8
export const ENDLESS_FORMATION_BREAK_SPEED_MUL = 1.15

export const ENDLESS_BOSS_FORMATIONS = [
  {
    id: 'royal_guard',
    mark: 'G',
    name: '王庭护卫阵',
    effect: '主将承伤 -35%，直至护卫清空',
    counter: '击溃全部护卫可获得追击',
    breakName: '护卫线击溃',
  },
  {
    id: 'blood_oath',
    mark: 'R',
    name: '复仇血誓',
    effect: '每名首领阵亡，余众行动节奏 +12%',
    counter: '在破绽期击杀首领可截断血誓',
    breakName: '血誓截断',
  },
  {
    id: 'arcane_relay',
    mark: 'A',
    name: '奥术接力阵',
    effect: '强招结束后，另一名首领快速接力',
    counter: '击杀施法或接力目标可打断阵型',
    breakName: '接力打断',
  },
]

export const ENDLESS_BOUNTIES = [
  {
    id: 'extermination',
    mark: 'K',
    metric: 'kills',
    name: '高效清剿令',
    brief: '在限时内击溃指定数量的王国兵力。',
    baseTarget: 90,
    targetStep: 15,
    maxTarget: 180,
    duration: 80,
  },
  {
    id: 'consumption',
    mark: 'D',
    metric: 'devours',
    name: '血肉征收令',
    brief: '主动吞噬残血勇者，完成王庭的血肉配额。',
    baseTarget: 12,
    targetStep: 3,
    maxTarget: 30,
    duration: 90,
  },
  {
    id: 'elite_hunt',
    mark: 'E',
    metric: 'eliteKills',
    name: '精英猎杀令',
    brief: '优先猎杀精英单位，打断王国的战术骨干。',
    baseTarget: 8,
    targetStep: 2,
    maxTarget: 20,
    duration: 90,
  },
]

export const ENDLESS_CALAMITIES = [
  {
    id: 'iron_legion',
    mark: 'HP',
    name: '铁甲军势',
    brief: '王国为全军换装灾变装甲。',
    effect: '敌人生命 +18%',
    rewardBonus: 0.08,
  },
  {
    id: 'forced_march',
    mark: 'IN',
    name: '强征急行',
    brief: '增援不再等待完整集结。',
    effect: '敌人刷新压力 +10%',
    rewardBonus: 0.1,
  },
  {
    id: 'war_drums',
    mark: 'AT',
    name: '不息战鼓',
    brief: '战鼓持续催促所有攻击动作。',
    effect: '敌人攻击频率 +8%',
    rewardBonus: 0.1,
  },
  {
    id: 'elite_decree',
    mark: 'EX',
    name: '精英征召令',
    brief: '王国把最后的老兵投入战场。',
    effect: '精英出现率 +3%',
    rewardBonus: 0.12,
  },
  {
    id: 'royal_reserves',
    mark: 'B',
    name: '王庭后备军',
    brief: '王级后备最多增加两名，强招也会随等级升级。',
    effect: 'Boss 生命 +15%，后备与招式强化',
    rewardBonus: 0.12,
  },
]

const CALAMITY_MAP = new Map(ENDLESS_CALAMITIES.map((entry) => [entry.id, entry]))
const BOUNTY_MAP = new Map(ENDLESS_BOUNTIES.map((entry) => [entry.id, entry]))

export function getEndlessCalamity(id) {
  return CALAMITY_MAP.get(id) || null
}

export function getEndlessBounty(id) {
  return BOUNTY_MAP.get(id) || null
}

export function getEndlessBountyChoices(continues = 0) {
  const depth = Math.max(0, Math.floor(Number(continues) || 0) - 1)
  return ENDLESS_BOUNTIES.map((entry) => ({
    ...entry,
    target: Math.min(entry.maxTarget, entry.baseTarget + depth * entry.targetStep),
    reward: '王级秘籍三选一',
  }))
}

export function getEndlessBossFormation(wave, total) {
  if (Math.max(0, Math.floor(Number(total) || 0)) < 2) return null
  const bossWaveIndex = Math.max(0, Math.floor(Number(wave) / 5) - 5)
  return { ...ENDLESS_BOSS_FORMATIONS[bossWaveIndex % ENDLESS_BOSS_FORMATIONS.length] }
}

export function getEndlessCalamityLevel(levels, id) {
  return Math.max(0, Math.floor(Number(levels?.[id]) || 0))
}

export function rollEndlessCalamityChoices(levels = {}, count = 3, random = Math.random) {
  const pool = ENDLESS_CALAMITIES.map((entry) => entry)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.max(0, Math.min(i, Math.floor(random() * (i + 1))))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, Math.max(1, Math.min(pool.length, count))).map((entry) => ({
    ...entry,
    level: getEndlessCalamityLevel(levels, entry.id),
    nextLevel: getEndlessCalamityLevel(levels, entry.id) + 1,
  }))
}

export function getEndlessModifiers(levels = {}) {
  const iron = getEndlessCalamityLevel(levels, 'iron_legion')
  const march = getEndlessCalamityLevel(levels, 'forced_march')
  const drums = getEndlessCalamityLevel(levels, 'war_drums')
  const elites = getEndlessCalamityLevel(levels, 'elite_decree')
  const reserves = getEndlessCalamityLevel(levels, 'royal_reserves')
  return {
    enemyHpMul: 1 + iron * 0.18,
    spawnPressureMul: 1 + Math.min(0.6, march * 0.1),
    attackTempoMul: 1 + Math.min(0.4, drums * 0.08),
    eliteChanceBonus: Math.min(0.15, elites * 0.03),
    bossHpMul: 1 + reserves * 0.15,
    bossPatternBonus: Math.min(3, Math.floor((reserves + 1) / 2)),
    bossExtraMembers: Math.min(2, reserves),
  }
}

export function getEndlessRewardBonus(levels = {}, continues = 0) {
  let calamityBonus = 0
  for (const entry of ENDLESS_CALAMITIES) {
    calamityBonus += getEndlessCalamityLevel(levels, entry.id) * entry.rewardBonus
  }
  const depthBonus = Math.max(0, Math.floor(Number(continues) || 0)) * ENDLESS_CONTINUE_REWARD_BONUS
  return Math.min(2.5, calamityBonus + depthBonus)
}

export function getEndlessCalamitySummary(levels = {}) {
  return ENDLESS_CALAMITIES
    .map((entry) => ({ ...entry, level: getEndlessCalamityLevel(levels, entry.id) }))
    .filter((entry) => entry.level > 0)
}

export function isEndlessCalamityWave(wave) {
  return wave >= ENDLESS_CALAMITY_START_WAVE && wave % 5 === 0
}

export function isEndlessExtractionWave(wave) {
  return wave >= ENDLESS_EXTRACTION_START_WAVE && wave % ENDLESS_EXTRACTION_INTERVAL === 0
}
