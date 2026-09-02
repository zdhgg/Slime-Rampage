export const TOWER_DEFENSE_WAVE_COUNT = 10
export const TOWER_DEFENSE_STARTING_GOLD = 240
export const TOWER_DEFENSE_BASE_HP = 20
export const TOWER_DEFENSE_PREPARATION = 4.5
export const TOWER_DEFENSE_INTERMISSION = 3.5

/** Normalized board coordinates. Enemies traverse this polyline from left to right. */
export const TOWER_DEFENSE_PATH = Object.freeze([
  { x: 0.03, y: 0.18 },
  { x: 0.28, y: 0.18 },
  { x: 0.28, y: 0.46 },
  { x: 0.63, y: 0.46 },
  { x: 0.63, y: 0.76 },
  { x: 0.97, y: 0.76 },
])

/** 10 Build slots (8 core standard slots + 2 clearable wild sealed nodes) */
export const TOWER_DEFENSE_BUILD_SLOTS = Object.freeze([
  { x: 0.13, y: 0.37 },
  { x: 0.42, y: 0.16 },
  { x: 0.45, y: 0.34 },
  { x: 0.14, y: 0.66 },
  { x: 0.43, y: 0.68 },
  { x: 0.79, y: 0.40 },
  { x: 0.79, y: 0.62 },
  { x: 0.43, y: 0.86 },
  { x: 0.28, y: 0.32, locked: true, cost: 40, reward: 60 },
  { x: 0.63, y: 0.62, locked: true, cost: 40, reward: 60 },
])

/** Elemental Leylines for slots */
export const TOWER_DEFENSE_LEYLINE_TYPES = Object.freeze({
  acid: {
    id: 'acid',
    name: '毒沼活泉',
    color: '#2ecc71',
    glow: 'rgba(46, 232, 168, 0.45)',
    preferredType: 'rapid',
    description: '强酸史莱姆驻扎：攻速 +25%，伤害 +15%',
    statBuff: { speedMultiplier: 1.25, damageMultiplier: 1.15 },
  },
  frost: {
    id: 'frost',
    name: '极寒冰隙',
    color: '#38d2ff',
    glow: 'rgba(56, 210, 255, 0.45)',
    preferredType: 'slow',
    description: '极寒史莱姆驻扎：减速范围 +20%，减速时长 +20%',
    statBuff: { rangeMultiplier: 1.15, slowDurationMultiplier: 1.20, slowRatioBonus: 0.08 },
  },
  magma: {
    id: 'magma',
    name: '熔岩地热',
    color: '#ff7675',
    glow: 'rgba(255, 118, 117, 0.45)',
    preferredType: 'blast',
    description: '熔岩史莱姆驻扎：爆炸范围 +30%，伤害 +15%',
    statBuff: { splashRadiusMultiplier: 1.30, damageMultiplier: 1.15 },
  },
  amplified: {
    id: 'amplified',
    name: '超导晶脉',
    color: '#ffeaa7',
    glow: 'rgba(255, 234, 167, 0.55)',
    preferredType: 'all',
    description: '全系共鸣：射程 +20%，攻速 +15%',
    statBuff: { rangeMultiplier: 1.20, speedMultiplier: 1.15, damageMultiplier: 1.10 },
  },
})

export const TOWER_DEFENSE_SLOT_LEYLINES = Object.freeze([
  'acid',      // Slot 0
  'frost',     // Slot 1
  'magma',     // Slot 2
  'acid',      // Slot 3
  'frost',     // Slot 4
  'magma',     // Slot 5
  'acid',      // Slot 6
  'magma',     // Slot 7
  'amplified', // Slot 8 (Expansion)
  'amplified', // Slot 9 (Expansion)
])

/** 3 Interactive Battlefield Traps / Spells */
export const TOWER_DEFENSE_TRAPS = Object.freeze([
  {
    id: 'spore_shroom',
    name: '毒孢子大蘑菇',
    shortDesc: '入口 50% 减速 + 毒蚀伤害',
    description: '引爆浓厚剧毒孢子，大范围减速 50% 并造成 35 点持续毒蚀伤害',
    pos: { x: 0.17, y: 0.08 },
    targetPos: { x: 0.17, y: 0.18 },
    radius: 0.15,
    cooldown: 18,
    damage: 35,
    slowRatio: 0.50,
    duration: 4.0,
    color: '#2ecc71',
    icon: '🍄',
  },
  {
    id: 'slime_geyser',
    name: '高压黏液泉',
    shortDesc: '中段敌军定身 2.5 秒',
    description: '喷涌强力黏液洪流，将中段弯道敌军牢牢定身 2.5 秒并造成伤害',
    pos: { x: 0.46, y: 0.57 },
    targetPos: { x: 0.46, y: 0.46 },
    radius: 0.16,
    cooldown: 22,
    damage: 20,
    stunDuration: 2.5,
    color: '#38d2ff',
    icon: '🌊',
  },
  {
    id: 'hive_crystal',
    name: '母巢超载晶石',
    shortDesc: '全场史莱姆 5 秒 +60% 攻速',
    description: '激活母巢共鸣，全场史莱姆守卫获得 5 秒暴走狂热（攻速 +60%）',
    pos: { x: 0.88, y: 0.88 },
    targetPos: { x: 0.88, y: 0.88 },
    radius: 0.99,
    cooldown: 30,
    overdriveDuration: 5.0,
    color: '#ffeaa7',
    icon: '💎',
  },
])

export function getSlotLeylineResonance(slotIndex, towerTypeId) {
  const leylineId = TOWER_DEFENSE_SLOT_LEYLINES[slotIndex] || 'acid'
  const leyline = TOWER_DEFENSE_LEYLINE_TYPES[leylineId]
  if (!leyline) return { isResonant: false, leylineId, buff: null }
  const isResonant = !towerTypeId || leyline.preferredType === 'all' || leyline.preferredType === towerTypeId
  return {
    isResonant: !!towerTypeId && isResonant,
    leylineId,
    leylineName: leyline.name,
    color: leyline.color,
    description: leyline.description,
    buff: (towerTypeId && isResonant) ? leyline.statBuff : null,
  }
}

const noTraits = Object.freeze({
  armor: 0,
  slowResistance: 0,
  shield: 0,
  supportRadius: 0,
  supportHeal: 0,
  splitCount: 0,
})

function enemyType(id, data) {
  return Object.freeze({ id, ...data, traits: Object.freeze({ ...noTraits, ...data.traits }) })
}

export const TOWER_DEFENSE_ENEMY_TYPES = Object.freeze({
  grunt: enemyType('grunt', {
    name: '步战者',
    shortName: '步战',
    shape: 'slime',
    color: '#d57461',
    hp: 24,
    speed: 0.055,
    reward: 10,
    damage: 1,
    size: 1,
  }),
  runner: enemyType('runner', {
    name: '疾行者',
    shortName: '疾行',
    shape: 'arrow',
    color: '#ee9360',
    hp: 17,
    speed: 0.092,
    reward: 11,
    damage: 1,
    size: 0.82,
    traits: { slowResistance: 0.22 },
  }),
  tank: enemyType('tank', {
    name: '重装者',
    shortName: '重装',
    shape: 'hex',
    color: '#a86863',
    hp: 92,
    speed: 0.039,
    reward: 21,
    damage: 3,
    size: 1.22,
    traits: { armor: 0.48, slowResistance: 0.28 },
  }),
  swarm: enemyType('swarm', {
    name: '群袭体',
    shortName: '群袭',
    shape: 'orb',
    color: '#e8b45d',
    hp: 11,
    speed: 0.072,
    reward: 6,
    damage: 1,
    size: 0.68,
  }),
  shield: enemyType('shield', {
    name: '结界者',
    shortName: '结界',
    shape: 'shield',
    color: '#7db7cf',
    hp: 48,
    speed: 0.049,
    reward: 18,
    damage: 2,
    size: 1.05,
    traits: { shield: 32, slowResistance: 0.12 },
  }),
  support: enemyType('support', {
    name: '祷告者',
    shortName: '支援',
    shape: 'diamond',
    color: '#b18bd0',
    hp: 43,
    speed: 0.047,
    reward: 24,
    damage: 2,
    size: 0.96,
    traits: { supportRadius: 0.14, supportHeal: 8, slowResistance: 0.1 },
  }),
  splitter: enemyType('splitter', {
    name: '裂殖者',
    shortName: '裂殖',
    shape: 'split',
    color: '#cf826b',
    hp: 58,
    speed: 0.052,
    reward: 17,
    damage: 2,
    size: 1.08,
    traits: { splitCount: 2, slowResistance: 0.08 },
  }),
  boss: enemyType('boss', {
    name: '王庭攻城兽',
    shortName: '攻城兽',
    shape: 'boss',
    color: '#df4f46',
    hp: 1280,
    speed: 0.035,
    reward: 190,
    damage: 10,
    size: 1.75,
    boss: true,
    traits: { armor: 0.38, slowResistance: 0.55, shield: 180 },
  }),
})

export const TOWER_DEFENSE_TARGET_STRATEGIES = Object.freeze([
  Object.freeze({ id: 'first', name: '最前方' }),
  Object.freeze({ id: 'last', name: '最后方' }),
  Object.freeze({ id: 'strong', name: '生命最高' }),
  Object.freeze({ id: 'weak', name: '生命最低' }),
  Object.freeze({ id: 'support', name: '支援优先' }),
  Object.freeze({ id: 'boss', name: '首领优先' }),
])

function towerBranch(id, data) {
  return Object.freeze({ id, ...data, level3: Object.freeze(data.level3), level4: Object.freeze(data.level4) })
}

function towerType(id, data) {
  const branches = Object.fromEntries(
    Object.entries(data.branches).map(([branchId, branch]) => [branchId, towerBranch(branchId, branch)])
  )
  return Object.freeze({
    id,
    ...data,
    levels: Object.freeze(data.levels.map((level) => Object.freeze(level))),
    branches: Object.freeze(branches),
    upgradeCosts: Object.freeze(data.upgradeCosts),
  })
}

export const TOWER_DEFENSE_TOWER_TYPES = Object.freeze({
  rapid: towerType('rapid', {
    name: '强酸史莱姆',
    description: '极速连喷强酸毒液弹，单体破甲输出',
    color: '#58c9a5',
    cost: 65,
    targeting: 'first',
    shape: 'rapid',
    levels: [
      { damage: 6, range: 0.205, fireInterval: 0.30, fireKind: 'single' },
      { damage: 9, range: 0.218, fireInterval: 0.255, fireKind: 'single' },
    ],
    upgradeCosts: [55, 92, 132],
    branches: {
      gatling: {
        name: '暴走连喷',
        description: '多头连环疾速喷吐，优先收割低生命目标',
        level3: { damage: 7, range: 0.225, fireInterval: 0.20, fireKind: 'burst', burst: 3, burstScale: 0.58 },
        level4: { damage: 9, range: 0.232, fireInterval: 0.16, fireKind: 'burst', burst: 4, burstScale: 0.62 },
      },
      sniper: {
        name: '独角穿甲',
        description: '高能长程强酸射线，无视大部分护甲',
        level3: { damage: 36, range: 0.34, fireInterval: 0.92, fireKind: 'single', armorPierce: 0.72 },
        level4: { damage: 58, range: 0.40, fireInterval: 0.82, fireKind: 'single', armorPierce: 0.82 },
      },
    },
  }),
  slow: towerType('slow', {
    name: '极寒史莱姆',
    description: '喷吐急冻寒霜，减速并控制高威胁目标',
    color: '#74bce8',
    cost: 75,
    targeting: 'first',
    shape: 'frost',
    levels: [
      { damage: 5, range: 0.22, fireInterval: 0.72, fireKind: 'slow', slowRatio: 0.46, slowDuration: 1.7 },
      { damage: 8, range: 0.232, fireInterval: 0.64, fireKind: 'slow', slowRatio: 0.50, slowDuration: 2.0 },
    ],
    upgradeCosts: [65, 98, 138],
    branches: {
      'frost-field': {
        name: '霜雪领域',
        description: '叠加极寒霜晶，三层霜冻极速冰封',
        level3: { damage: 10, range: 0.25, fireInterval: 0.58, fireKind: 'freeze', slowRatio: 0.56, slowDuration: 2.2, freezeDuration: 0.8 },
        level4: { damage: 14, range: 0.27, fireInterval: 0.50, fireKind: 'freeze', slowRatio: 0.62, slowDuration: 2.5, freezeDuration: 1.1 },
      },
      'ice-chain': {
        name: '冰脉连锁',
        description: '寒流在多个邻近目标之间连锁跳转',
        level3: { damage: 9, range: 0.25, fireInterval: 0.62, fireKind: 'chain', slowRatio: 0.42, slowDuration: 1.7, chainCount: 3, chainRange: 0.12, chainScale: 0.72 },
        level4: { damage: 12, range: 0.27, fireInterval: 0.54, fireKind: 'chain', slowRatio: 0.46, slowDuration: 2.0, chainCount: 4, chainRange: 0.14, chainScale: 0.78 },
      },
    },
  }),
  blast: towerType('blast', {
    name: '熔岩史莱姆',
    description: '吐出巨大熔岩爆浆，大范围重伤与穿甲',
    color: '#efad58',
    cost: 90,
    targeting: 'first',
    shape: 'cannon',
    levels: [
      { damage: 12, range: 0.19, fireInterval: 1.12, fireKind: 'splash', splashRadius: 0.105, armorPierce: 0.45 },
      { damage: 19, range: 0.205, fireInterval: 1.02, fireKind: 'splash', splashRadius: 0.114, armorPierce: 0.48 },
    ],
    upgradeCosts: [75, 112, 152],
    branches: {
      'heavy-shell': {
        name: '黑曜重炮',
        description: '巨型熔岩弹砸落，超大范围破坏与震波',
        level3: { damage: 34, range: 0.22, fireInterval: 1.22, fireKind: 'splash', splashRadius: 0.145, armorPierce: 0.72 },
        level4: { damage: 52, range: 0.235, fireInterval: 1.12, fireKind: 'splash', splashRadius: 0.17, armorPierce: 0.82 },
      },
      'burn-zone': {
        name: '炽热焦土',
        description: '熔浆溅落形成持续燃烧的烈焰火海',
        level3: { damage: 25, range: 0.215, fireInterval: 1.05, fireKind: 'burn', splashRadius: 0.12, burnDamage: 7, burnDuration: 2.8, armorPierce: 0.55 },
        level4: { damage: 35, range: 0.23, fireInterval: 0.96, fireKind: 'burn', splashRadius: 0.14, burnDamage: 11, burnDuration: 3.4, armorPierce: 0.62 },
      },
    },
  }),
  shock: towerType('shock', {
    name: '雷鸣史莱姆',
    description: '释放跳跃连环闪电，电弧麻痹打断敌军技能',
    color: '#a55eea',
    cost: 85,
    targeting: 'first',
    shape: 'shock',
    levels: [
      { damage: 8, range: 0.21, fireInterval: 0.52, fireKind: 'chain_shock', chainCount: 3, chainRange: 0.14, stunDuration: 0.15 },
      { damage: 13, range: 0.225, fireInterval: 0.46, fireKind: 'chain_shock', chainCount: 4, chainRange: 0.16, stunDuration: 0.2 },
    ],
    upgradeCosts: [70, 105, 145],
    branches: {
      overload: {
        name: '高压过载',
        description: '超强电弧风暴，跳跃5个目标并造成连锁微眩晕',
        level3: { damage: 18, range: 0.24, fireInterval: 0.40, fireKind: 'chain_shock', chainCount: 5, chainRange: 0.18, stunDuration: 0.35 },
        level4: { damage: 26, range: 0.26, fireInterval: 0.34, fireKind: 'chain_shock', chainCount: 6, chainRange: 0.20, stunDuration: 0.5 },
      },
      'hyper-beam': {
        name: '超导光束',
        description: '高能持续聚焦雷霆光束，对单体目标呈高倍穿甲增伤',
        level3: { damage: 45, range: 0.32, fireInterval: 0.85, fireKind: 'single', armorPierce: 0.8 },
        level4: { damage: 72, range: 0.38, fireInterval: 0.75, fireKind: 'single', armorPierce: 0.9 },
      },
    },
  }),
  arcane: towerType('arcane', {
    name: '虚空史莱姆',
    description: '释放暗影引力黑洞，强力聚怪牵引并撕裂护甲',
    color: '#8854d0',
    cost: 100,
    targeting: 'first',
    shape: 'arcane',
    levels: [
      { damage: 10, range: 0.23, fireInterval: 0.95, fireKind: 'vortex', splashRadius: 0.12, pullForce: 0.04 },
      { damage: 16, range: 0.245, fireInterval: 0.85, fireKind: 'vortex', splashRadius: 0.135, pullForce: 0.06 },
    ],
    upgradeCosts: [85, 125, 170],
    branches: {
      singularity: {
        name: '奇点坍缩',
        description: '超大范围引力黑洞，吸聚大批敌军并造成大范围震波',
        level3: { damage: 26, range: 0.26, fireInterval: 0.80, fireKind: 'vortex', splashRadius: 0.16, pullForce: 0.10 },
        level4: { damage: 40, range: 0.28, fireInterval: 0.70, fireKind: 'vortex', splashRadius: 0.19, pullForce: 0.14 },
      },
      'void-rift': {
        name: '虚空裂隙',
        description: '直接撕裂空间，造成无视护甲与护盾的纯粹穿透伤害',
        level3: { damage: 55, range: 0.25, fireInterval: 1.10, fireKind: 'single', armorPierce: 1.0 },
        level4: { damage: 90, range: 0.28, fireInterval: 0.98, fireKind: 'single', armorPierce: 1.0 },
      },
    },
  }),
  radiant: towerType('radiant', {
    name: '炽阳史莱姆',
    description: '圣堂庇护光环，大幅强化邻近史莱姆攻击速度',
    color: '#f1c40f',
    cost: 110,
    targeting: 'first',
    shape: 'radiant',
    levels: [
      { damage: 8, range: 0.24, fireInterval: 0.80, fireKind: 'aura', auraSpeedBoost: 0.25, auraRadius: 0.24 },
      { damage: 14, range: 0.26, fireInterval: 0.72, fireKind: 'aura', auraSpeedBoost: 0.30, auraRadius: 0.26 },
    ],
    upgradeCosts: [90, 135, 180],
    branches: {
      'solar-flare': {
        name: '炽阳新星',
        description: '周期性爆发超强太阳耀斑，眩晕震慑范围敌军',
        level3: { damage: 32, range: 0.28, fireInterval: 0.90, fireKind: 'nova', auraSpeedBoost: 0.35, auraRadius: 0.28, stunDuration: 0.6 },
        level4: { damage: 50, range: 0.30, fireInterval: 0.80, fireKind: 'nova', auraSpeedBoost: 0.40, auraRadius: 0.30, stunDuration: 1.0 },
      },
      sanctuary: {
        name: '圣堂庇护',
        description: '扩大光环范围，为临近所有史莱姆提供 +45% 攻速狂热',
        level3: { damage: 20, range: 0.34, fireInterval: 0.65, fireKind: 'aura', auraSpeedBoost: 0.45, auraRadius: 0.34 },
        level4: { damage: 30, range: 0.38, fireInterval: 0.55, fireKind: 'aura', auraSpeedBoost: 0.55, auraRadius: 0.38 },
      },
    },
  }),
})

export const TOWER_UNLOCK_MAP = Object.freeze({
  rapid: 1,
  slow: 1,
  blast: 2,
  shock: 5,
  arcane: 21,
  radiant: 41,
})

export function isTowerUnlocked(typeId, stageId = 1, customUnlockedSet = null) {
  if (customUnlockedSet && customUnlockedSet.has(typeId)) return true
  const reqStage = TOWER_UNLOCK_MAP[typeId] || 1
  return (stageId || 1) >= reqStage
}

function group(type, count, interval, scale = 1, gap = 0.25) {
  return Object.freeze({ type, count, interval, scale, gap })
}

function wave(groups, reward) {
  const count = groups.reduce((sum, entry) => sum + entry.count, 0)
  const firstType = TOWER_DEFENSE_ENEMY_TYPES[groups[0].type]
  return Object.freeze({
    groups: Object.freeze(groups),
    count,
    reward,
    interval: groups[0].interval,
    hp: Math.round(firstType.hp * groups[0].scale),
    speed: firstType.speed,
    damage: firstType.damage,
    color: firstType.color,
    boss: groups.some((entry) => entry.type === 'boss'),
  })
}

export const TOWER_DEFENSE_WAVES = Object.freeze([
  wave([group('grunt', 7, 0.72, 0.9)], 24),
  wave([group('grunt', 5, 0.64, 1), group('runner', 4, 0.42, 0.9)], 28),
  wave([group('swarm', 8, 0.30, 1), group('tank', 2, 0.92, 0.9)], 32),
  wave([group('grunt', 5, 0.55, 1.15), group('support', 1, 1.0, 1), group('runner', 4, 0.40, 1)], 36),
  wave([group('shield', 3, 0.74, 1), group('swarm', 9, 0.28, 1.15)], 41),
  wave([group('tank', 3, 0.90, 1.12), group('support', 2, 0.95, 1.05), group('grunt', 6, 0.47, 1.35)], 46),
  wave([group('splitter', 4, 0.72, 1.08), group('runner', 7, 0.35, 1.22), group('shield', 2, 0.78, 1.08)], 52),
  wave([group('swarm', 24, 0.16, 1.55), group('tank', 4, 0.78, 1.28), group('support', 2, 0.9, 1.18)], 58),
  wave([group('runner', 10, 0.25, 1.5), group('swarm', 22, 0.14, 1.8), group('shield', 5, 0.58, 1.36), group('splitter', 5, 0.62, 1.32)], 66),
  wave([group('boss', 1, 0.5, 1), group('grunt', 4, 0.55, 1.65), group('support', 2, 0.92, 1.35)], 90),
])

const PATH_SEGMENTS = []
let pathLength = 0
for (let i = 1; i < TOWER_DEFENSE_PATH.length; i++) {
  const from = TOWER_DEFENSE_PATH[i - 1]
  const to = TOWER_DEFENSE_PATH[i]
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  PATH_SEGMENTS.push({ from, to, start: pathLength, length })
  pathLength += length
}

export function computePathSegments(path) {
  const points = Array.isArray(path) && path.length >= 2 ? path : TOWER_DEFENSE_PATH
  const segments = []
  let totalLength = 0
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1]
    const to = points[i]
    const length = Math.hypot(to.x - from.x, to.y - from.y)
    segments.push({ from, to, start: totalLength, length })
    totalLength += length
  }
  return { segments, totalLength }
}

export function getTowerDefensePathPosition(progress, customPath = null) {
  const { segments, totalLength } = customPath ? computePathSegments(customPath) : { segments: PATH_SEGMENTS, totalLength: pathLength }
  const distance = Math.max(0, Math.min(1, progress)) * totalLength
  let segment = segments[segments.length - 1]
  for (const candidate of segments) {
    if (distance <= candidate.start + candidate.length) {
      segment = candidate
      break
    }
  }
  const ratio = segment && segment.length > 0
    ? Math.max(0, Math.min(1, (distance - segment.start) / segment.length))
    : 0
  const dx = segment ? segment.to.x - segment.from.x : 0
  const dy = segment ? segment.to.y - segment.from.y : 0
  return {
    x: segment ? segment.from.x + dx * ratio : 0,
    y: segment ? segment.from.y + dy * ratio : 0,
    dx,
    dy,
    facing: Math.atan2(dy, dx),
  }
}

export function getEnemyType(typeId) {
  return TOWER_DEFENSE_ENEMY_TYPES[typeId] || TOWER_DEFENSE_ENEMY_TYPES.grunt
}

export function getWaveComposition(waveIndex) {
  const definition = TOWER_DEFENSE_WAVES[waveIndex]
  if (!definition) return []
  const counts = new Map()
  for (const entry of definition.groups) counts.set(entry.type, (counts.get(entry.type) || 0) + entry.count)
  return Array.from(counts, ([id, count]) => {
    const type = getEnemyType(id)
    return { id, name: type.shortName || type.name, count, color: type.color, shape: type.shape }
  })
}

export function getWaveBaseDamage(waveIndex) {
  const definition = TOWER_DEFENSE_WAVES[waveIndex]
  if (!definition) return 0
  return definition.groups.reduce((sum, entry) => sum + getEnemyType(entry.type).damage * entry.count, 0)
}

export function getTowerStats(typeId, level = 1, branchId = null, slotIndex = null) {
  const type = TOWER_DEFENSE_TOWER_TYPES[typeId]
  if (!type) return null
  const rank = Math.max(1, Math.min(4, Math.floor(level)))
  const branch = type.branches[branchId] || Object.values(type.branches)[0]
  const stats = rank <= 2
    ? { ...type.levels[rank - 1] }
    : { ...(rank === 3 ? branch.level3 : branch.level4), branchId: branch.id }

  if (slotIndex != null) {
    const resonance = getSlotLeylineResonance(slotIndex, typeId)
    if (resonance.isResonant && resonance.buff) {
      if (resonance.buff.damageMultiplier) stats.damage = Math.round(stats.damage * resonance.buff.damageMultiplier)
      if (resonance.buff.rangeMultiplier) stats.range = +(stats.range * resonance.buff.rangeMultiplier).toFixed(3)
      if (resonance.buff.speedMultiplier) stats.fireInterval = +(stats.fireInterval / resonance.buff.speedMultiplier).toFixed(3)
      if (resonance.buff.splashRadiusMultiplier && stats.splashRadius) stats.splashRadius = +(stats.splashRadius * resonance.buff.splashRadiusMultiplier).toFixed(3)
      if (resonance.buff.slowDurationMultiplier && stats.slowDuration) stats.slowDuration = +(stats.slowDuration * resonance.buff.slowDurationMultiplier).toFixed(2)
      if (resonance.buff.slowRatioBonus && stats.slowRatio) stats.slowRatio = Math.min(0.9, +(stats.slowRatio + resonance.buff.slowRatioBonus).toFixed(2))
    }
  }
  return stats
}

export function getTowerUpgradeCost(tower) {
  const type = TOWER_DEFENSE_TOWER_TYPES[tower?.typeId]
  if (!type || tower.level >= 4) return null
  return type.upgradeCosts[tower.level - 1] ?? null
}

export function getTowerSellValue(tower) {
  const type = TOWER_DEFENSE_TOWER_TYPES[tower?.typeId]
  if (!type) return 0
  let invested = type.cost
  for (let level = 1; level < tower.level; level++) invested += type.upgradeCosts[level - 1] || 0
  return Math.floor(invested * 0.7)
}

export function getTowerBranchOptions(typeId) {
  const type = TOWER_DEFENSE_TOWER_TYPES[typeId]
  if (!type) return []
  return Object.values(type.branches).map((branch) => ({
    id: branch.id,
    name: branch.name,
    description: branch.description,
  }))
}

/** 5 Shiny Slime Traits (20% chance on summon) */
export const SLIME_SHINY_TRAITS = Object.freeze({
  greedy: {
    id: 'greedy',
    name: '贪吃鬼',
    icon: '🌟',
    color: '#ffd166',
    description: '击杀敌人额外掉落 +50% 养分',
    bonusGoldMul: 1.5,
  },
  hasty: {
    id: 'hasty',
    name: '疾风迅捷',
    icon: '⚡',
    color: '#2ecc71',
    description: '基础攻击速度提升 +30%',
    speedMul: 1.3,
  },
  sniper: {
    id: 'sniper',
    name: '鹰眼索敌',
    icon: '🎯',
    color: '#38d2ff',
    description: '射程提升 +25%，优先索敌高速目标',
    rangeMul: 1.25,
  },
  critical: {
    id: 'critical',
    name: '致命暴击',
    icon: '💥',
    color: '#ff7675',
    description: '每次攻击有 25% 概率造成 2.2 倍暴击伤害',
    critChance: 0.25,
    critMul: 2.2,
  },
  beloved: {
    id: 'beloved',
    name: '母巢宠儿',
    icon: '👑',
    color: '#a55eea',
    description: '抚摸鼓舞时攻速提升增加至 +80%',
    petSpeedBoost: 0.80,
  },
});

/** 16+ Roguelike Mutation Cards */
export const TOWER_DEFENSE_MUTATIONS = Object.freeze([
  {
    id: 'acid_pool',
    name: '酸液喷涌',
    icon: '🌿',
    rarity: 'rare',
    theme: 'rapid',
    description: '强酸史莱姆攻击命中后在地面留下融甲酸池（持续 3 秒，每秒 15 点融甲伤害）',
  },
  {
    id: 'frost_deep_freeze',
    name: '绝对零度',
    icon: '❄️',
    rarity: 'epic',
    theme: 'slow',
    description: '极寒史莱姆减速叠至 3 层时直接深度冰封目标 1.5 秒',
  },
  {
    id: 'magma_blast_zone',
    name: '炽热焦土',
    icon: '🔥',
    rarity: 'rare',
    theme: 'blast',
    description: '熔岩史莱姆爆炸范围扩大 +35%，且地面火海持续时间延长 2 秒',
  },
  {
    id: 'shock_hyper_chain',
    name: '超导过载',
    icon: '⚡',
    rarity: 'rare',
    theme: 'shock',
    description: '雷鸣史莱姆电弧跳跃目标数 +2，且跳跃伤害不再衰减',
  },
  {
    id: 'void_singularity',
    name: '引力撕裂',
    icon: '🔮',
    rarity: 'epic',
    theme: 'arcane',
    description: '虚空史莱姆黑洞吸附范围 +40%，对被吸附敌人造成 1.5 倍纯粹伤害',
  },
  {
    id: 'radiant_fervor',
    name: '圣堂狂热',
    icon: '☀️',
    rarity: 'epic',
    theme: 'radiant',
    description: '炽阳史莱姆光环攻速加成提升至 +60%',
  },
  {
    id: 'nutrient_harvest',
    name: '吞噬饕餮',
    icon: '💰',
    rarity: 'common',
    theme: 'economy',
    description: '所有敌人被消灭时额外掉落 +25% 养分',
  },
  {
    id: 'spore_chain_reaction',
    name: '殉爆孢子',
    icon: '🍄',
    rarity: 'rare',
    theme: 'trap',
    description: '被战术机关命中的敌人，阵亡时产生范围连锁爆炸造成 50 点伤害',
  },
  {
    id: 'spiritual_affinity',
    name: '灵性亲和',
    icon: '💖',
    rarity: 'common',
    theme: 'interaction',
    description: '抚摸鼓舞冷却时间缩短 50%，鼓舞持续时间提升至 8 秒',
  },
  {
    id: 'leap_earthquake',
    name: '泰山压顶',
    icon: '🦘',
    rarity: 'rare',
    theme: 'interaction',
    description: '史莱姆战术换位落地时震晕周围大范围敌人 1.8 秒',
  },
  {
    id: 'hive_thorns',
    name: '母巢荆棘',
    icon: '🛡️',
    rarity: 'common',
    theme: 'hive',
    description: '母巢核心获得反伤电网，靠近核心的敌人受到持续 30 DPS 雷击',
  },
  {
    id: 'rapid_gatling_frenzy',
    name: '狂暴弹幕',
    icon: '🎯',
    rarity: 'epic',
    theme: 'rapid',
    description: '强酸史莱姆攻击速度提升 +35%，连续命中同目标伤害每次 +10%',
  },
  {
    id: 'frost_blizzard_storm',
    name: '寒霜暴风',
    icon: '🌨️',
    rarity: 'rare',
    theme: 'slow',
    description: '极寒史莱姆攻击范围扩大 +25%，减速比例额外提升 +15%',
  },
  {
    id: 'magma_meteor_rain',
    name: '流星火雨',
    icon: '☄️',
    rarity: 'legendary',
    theme: 'blast',
    description: '熔岩史莱姆攻击时有 25% 概率额外附赠一颗小型陨石轰炸',
  },
  {
    id: 'shock_plasma_storm',
    name: '等离子风暴',
    icon: '🌩️',
    rarity: 'legendary',
    theme: 'shock',
    description: '雷鸣史莱姆暴击率提升 +30%，暴击时引发全屏微型麻痹静电',
  },
  {
    id: 'gene_overclock',
    name: '基因超频',
    icon: '🧬',
    rarity: 'legendary',
    theme: 'all',
    description: '全场所有史莱姆攻击力 +25%，攻击速度 +20%',
  },
]);

/**
 * Deterministically pick 3 random mutation choices based on unlocked towers & active mutations.
 */
export function getRandomMutationChoices(count = 3, activeMutations = [], unlockedTowers = ['rapid', 'slow']) {
  const activeIds = new Set(activeMutations.map((m) => m.id || m));
  const available = TOWER_DEFENSE_MUTATIONS.filter((m) => {
    if (activeIds.has(m.id)) return false;
    // Check if tower theme is unlocked
    if (['rapid', 'slow', 'blast', 'shock', 'arcane', 'radiant'].includes(m.theme)) {
      return unlockedTowers.includes(m.theme);
    }
    return true;
  });

  // Shuffle and pick
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
