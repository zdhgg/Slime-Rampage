export const RUNNER_LANE_COUNT = 3
export const RUNNER_DURATION = 90
export const RUNNER_DISTANCE = 1500
export const RUNNER_COUNTDOWN = 2.4

export const RUNNER_MAX_HP = 5
export const RUNNER_MAX_SHIELD = 3
export const RUNNER_MAX_ATTACK = 8
export const RUNNER_FIRE_INTERVAL = 1 / 5
export const RUNNER_RAPID_MULTIPLIER = 2
export const RUNNER_RAPID_DURATION = 6
export const RUNNER_BULLET_SPEED = 1.35
export const RUNNER_MAX_CATCH_UP_SHOTS = 3
export const RUNNER_MAX_ENTITIES = 24
export const RUNNER_MAX_BULLETS = 48
export const RUNNER_MAX_ENEMY_PROJECTILES = 16
export const RUNNER_MAX_DAMAGE_NUMBERS = 8
export const RUNNER_DAMAGE_AGGREGATE_WINDOW = 0.18
export const RUNNER_ENEMY_ATTACK_GAP = 1.2
export const RUNNER_DASH_COOLDOWN = 4.5
export const RUNNER_DASH_DURATION = 0.24
export const RUNNER_DODGE_WINDOW = 0.72

export const RUNNER_FEVER_SHARDS_PER_CHARGE = 3
export const RUNNER_FEVER_MAX_CHARGES = 2
export const RUNNER_FEVER_DURATION = 5.0
export const RUNNER_FEVER_SCORE_MULTIPLIER = 2
export const RUNNER_DASH_IMPACT_DAMAGE = 6

export const RUNNER_PLAYER_DEPTH = 0.98
export const RUNNER_ENTITY_SPAWN_DEPTH = 0.035
export const RUNNER_COLLISION_DEPTH = 0.965
export const RUNNER_LANE_LERP_PER_FRAME = 0.24
export const RUNNER_LANE_COMMIT_EPSILON = 0.035

export const RUNNER_WEAPON_CHOICE_TIME = 18
export const RUNNER_WEAPON_EVOLVE_TIME = 48
export const RUNNER_WEAPON_OVERDRIVE_TIME = 75
export const RUNNER_MUTATION_ARM_DEPTH = 0.38

export const RUNNER_WEAPON_CORES = {
  pierce: {
    id: 'pierce',
    name: '贯穿凝胶',
    shortName: '贯穿',
    color: '#79d9ee',
    description: '贯穿同路目标，后续伤害衰减',
    levels: [
      { penetrations: 1, decay: 0.72 },
      { penetrations: 2, decay: 0.79 },
      { penetrations: 3, decay: 0.86 },
    ],
  },
  burst: {
    id: 'burst',
    name: '爆裂核心',
    shortName: '爆裂',
    color: '#f0b35f',
    description: '周期性引爆同路小范围冲击',
    levels: [
      { every: 5, radius: 0.07, damage: 0.65 },
      { every: 4, radius: 0.085, damage: 0.8 },
      { every: 3, radius: 0.1, damage: 1 },
    ],
  },
  corrosion: {
    id: 'corrosion',
    name: '腐蚀弹体',
    shortName: '腐蚀',
    color: '#9bdf6a',
    description: '连续命中叠加易伤，并溶解装甲',
    levels: [
      { stackBonus: 0.12, maxStacks: 4, armorPierce: 0.55, barrierDamage: 1.5 },
      { stackBonus: 0.14, maxStacks: 5, armorPierce: 0.75, barrierDamage: 1.75 },
      { stackBonus: 0.16, maxStacks: 6, armorPierce: 1, barrierDamage: 2 },
    ],
  },
}

export const RUNNER_SECONDARY_ELEMENTS = {
  lightning: {
    id: 'lightning',
    name: '雷电附魔',
    shortName: '雷电',
    color: '#ffea79',
    description: '折射连锁电弧，群体闪电',
    icon: '⚡',
  },
  flame: {
    id: 'flame',
    name: '烈焰附魔',
    shortName: '烈焰',
    color: '#ff6b4a',
    description: '引燃灼烧火海，殉爆烈焰',
    icon: '🔥',
  },
  frost: {
    id: 'frost',
    name: '极寒附魔',
    shortName: '极寒',
    color: '#7be3ff',
    description: '冰冻深度减速，破甲霜蚀',
    icon: '❄️',
  },
}

export const RUNNER_FUSION_WEAPONS = {
  'pierce:lightning': {
    id: 'pierce_lightning',
    primary: 'pierce',
    secondary: 'lightning',
    name: '超导轨道炮',
    color: '#7be8ff',
    description: '贯穿目标时向相邻车道释放折射雷弧（60% 溅射）',
    arcDamageRatio: 0.6,
  },
  'pierce:flame': {
    id: 'pierce_flame',
    primary: 'pierce',
    secondary: 'flame',
    name: '熔岩钻头弹',
    color: '#ff8552',
    description: '穿透目标后在车道留下持续燃烧的熔岩火海',
    fireDuration: 3.5,
    fireDamage: 0.8,
  },
  'pierce:frost': {
    id: 'pierce_frost',
    primary: 'pierce',
    secondary: 'frost',
    name: '极光冰晶锥',
    color: '#90f0ef',
    description: '穿透使敌人减速 50% 并粉碎护甲',
    slowRatio: 0.5,
    slowDuration: 3.0,
    armorBreak: 1.0,
  },
  'burst:lightning': {
    id: 'burst_lightning',
    primary: 'burst',
    secondary: 'lightning',
    name: '雷暴集束弹',
    color: '#ffd859',
    description: '爆裂时向周围迸发 4 枚自动锁敌雷电火花',
    sparksCount: 4,
    sparkDamage: 0.75,
  },
  'burst:flame': {
    id: 'burst_flame',
    primary: 'burst',
    secondary: 'flame',
    name: '地狱火核弹',
    color: '#ff4d4d',
    description: '爆炸范围扩大 1.5 倍并在地面留下持续核爆焦土',
    radiusMultiplier: 1.5,
    fireDuration: 3.0,
    fireDamage: 1.0,
  },
  'burst:frost': {
    id: 'burst_frost',
    primary: 'burst',
    secondary: 'frost',
    name: '绝对零度弹',
    color: '#a0ebff',
    description: '大范围极寒冰爆，将敌人深度冻结 1.2 秒',
    freezeDuration: 1.2,
    radiusMultiplier: 1.25,
  },
  'corrosion:lightning': {
    id: 'corrosion_lightning',
    primary: 'corrosion',
    secondary: 'lightning',
    name: '等离子风暴',
    color: '#c0ff73',
    description: '腐蚀叠满 3 层时触发过载电击引发大硬直与额外爆发',
    shockThreshold: 3,
    shockDamage: 2.5,
  },
  'corrosion:flame': {
    id: 'corrosion_flame',
    primary: 'corrosion',
    secondary: 'flame',
    name: '酸焰殉爆',
    color: '#ff9a42',
    description: '被腐蚀的敌人阵亡时发生猛烈殉爆，清空周围怪群',
    explosionRadius: 0.09,
    explosionDamage: 2.2,
  },
  'corrosion:frost': {
    id: 'corrosion_frost',
    primary: 'corrosion',
    secondary: 'frost',
    name: '脆化霜蚀',
    color: '#76e5b5',
    description: '被减速的腐蚀目标受到所有子弹伤害额外提升 40%',
    vulnerabilityBonus: 0.4,
    slowRatio: 0.45,
  },
}

export const RUNNER_TACTICAL_ITEMS = {
  magnet: {
    id: 'magnet',
    name: '全息磁暴仪',
    reward: 'item_magnet',
    color: '#4db8ff',
    icon: '🧲',
    description: '瞬间吸纳全屏三路所有强化道具与印记',
  },
  bullet_time: {
    id: 'bullet_time',
    name: '时空力场',
    reward: 'item_bullet_time',
    duration: 3.5,
    dilation: 0.4,
    color: '#6ee7b7',
    icon: '⏳',
    description: '全场环境慢速 40%，畅享子弹时间微操',
  },
  booster: {
    id: 'booster',
    name: '超频踏板',
    reward: 'item_booster',
    duration: 2.5,
    crushDamage: 15,
    color: '#f59e0b',
    icon: '🚀',
    description: '金身无敌高速冲刺，撞碎前方一切障碍',
  },
  drone: {
    id: 'drone',
    name: '浮游炮护卫',
    reward: 'item_drone',
    duration: 10.0,
    color: '#ec4899',
    icon: '🤖',
    description: '在相邻车道召唤浮游史莱姆协同射击',
  },
}

export function getRunnerFusionWeapon(primary, secondary) {
  if (!primary || !secondary) return null
  const key = `${primary}:${secondary}`
  return RUNNER_FUSION_WEAPONS[key] || null
}

export const RUNNER_ENTITY_TYPES = {
  scout: {
    id: 'scout',
    kind: 'enemy',
    name: '追猎骑士',
    hp: 4,
    damage: 1,
    score: 90,
    sprite: 'char_knight_0',
    color: '#e88765',
  },
  hound: {
    id: 'hound',
    kind: 'enemy',
    name: '王庭战獒',
    hp: 3,
    damage: 1,
    score: 110,
    sprite: 'char_hound_0',
    color: '#df775e',
  },
  swarm: {
    id: 'swarm',
    kind: 'enemy',
    name: '猎犬蜂群',
    hp: 2,
    damage: 1,
    score: 55,
    sprite: 'char_hound_0',
    color: '#d98269',
    packCount: 3,
    packSpacing: 0.065,
    renderScale: 0.78,
  },
  shield: {
    id: 'shield',
    kind: 'enemy',
    name: '王庭盾卫',
    hp: 11,
    damage: 2,
    score: 260,
    sprite: 'char_knight_0',
    color: '#7eafc8',
    armor: 0.55,
    behavior: 'shield',
  },
  charger: {
    id: 'charger',
    kind: 'enemy',
    name: '裂阵冲锋兵',
    hp: 7,
    damage: 2,
    score: 240,
    sprite: 'char_berserker_0',
    color: '#e47759',
    behavior: 'charge',
    chargeAt: 0.5,
    chargeDelay: 0.72,
    chargeMultiplier: 2.65,
  },
  priest: {
    id: 'priest',
    kind: 'enemy',
    name: '狂热祭司',
    hp: 8,
    damage: 1,
    score: 280,
    sprite: 'char_mage_0',
    color: '#ecc969',
    behavior: 'support',
    supportReduction: 0.45,
  },
  splitter: {
    id: 'splitter',
    kind: 'enemy',
    name: '聚合分裂体',
    hp: 10,
    damage: 2,
    score: 300,
    sprite: 'char_berserker_0',
    color: '#70cfb5',
    behavior: 'split',
    splitCount: 2,
  },
  archer: {
    id: 'archer',
    kind: 'enemy',
    name: '王庭游侠',
    hp: 6,
    damage: 1,
    score: 220,
    sprite: 'char_ranger_0',
    color: '#8fd7ac',
    behavior: 'archer',
    attackAt: 0.44,
    attackDelay: 0.8,
    projectileDamage: 1,
    projectileHp: 1,
  },
  mage: {
    id: 'mage',
    kind: 'enemy',
    name: '王庭魔导士',
    hp: 7,
    damage: 1,
    score: 260,
    sprite: 'char_mage_0',
    color: '#c59bf0',
    behavior: 'mage',
    attackAt: 0.46,
    attackDelay: 1.05,
    projectileDamage: 1,
  },
  fragment: {
    id: 'fragment',
    kind: 'enemy',
    name: '魔像碎体',
    hp: 2,
    damage: 1,
    score: 45,
    sprite: 'char_wraith_0',
    color: '#ad92cf',
    renderScale: 0.68,
  },
  brute: {
    id: 'brute',
    kind: 'enemy',
    name: '重装禁卫',
    hp: 16,
    damage: 2,
    score: 320,
    sprite: 'char_berserker_0',
    color: '#d66b57',
  },
  elite: {
    id: 'elite',
    kind: 'enemy',
    name: '王庭统领',
    hp: 30,
    damage: 3,
    score: 650,
    sprite: 'char_knight_0',
    color: '#f0965d',
    elite: true,
    renderScale: 1.18,
  },
  carrier_boss: {
    id: 'carrier_boss',
    kind: 'enemy',
    name: '破阵要塞',
    hp: 42,
    damage: 3,
    score: 1100,
    sprite: 'char_berserker_0',
    color: '#e0533c',
    elite: true,
    renderScale: 1.35,
  },
  gold_convoy: {
    id: 'gold_convoy',
    kind: 'enemy',
    name: '皇家运宝车',
    hp: 26,
    damage: 1,
    score: 1500,
    color: '#fbbf24',
    behavior: 'convoy',
    elite: true,
    renderScale: 1.35,
  },
  twin_assassin: {
    id: 'twin_assassin',
    kind: 'enemy',
    name: '暗影刺客',
    hp: 14,
    damage: 1,
    score: 450,
    color: '#a855f7',
    behavior: 'assassin',
    elite: true,
    renderScale: 0.95,
  },
  barrel: {
    id: 'barrel',
    kind: 'obstacle',
    name: '高能炸药桶',
    hp: 3,
    damage: 0,
    score: 200,
    color: '#f97316',
    behavior: 'barrel',
    explosionDamage: 12,
    explosionRadius: 0.12,
  },
  laser_gate: {
    id: 'laser_gate',
    kind: 'hazard',
    name: '脉冲激光',
    hp: 999,
    damage: 1,
    score: 0,
    color: '#ef4444',
    behavior: 'laser_gate',
    warnTime: 1.2,
    activeTime: 1.5,
    period: 3.2,
  },
  barrier: {
    id: 'barrier',
    kind: 'obstacle',
    name: '封锁路障',
    hp: 48,
    damage: 2,
    score: 70,
    color: '#d1685b',
  },
  attack: {
    id: 'attack',
    kind: 'gate',
    name: '攻击强化',
    reward: 'attack',
    hp: 7,
    score: 150,
    color: '#66c9e8',
  },
  rapid: {
    id: 'rapid',
    kind: 'gate',
    name: '急速射击',
    reward: 'rapid',
    hp: 6,
    score: 140,
    color: '#b794e8',
  },
  repair: {
    id: 'repair',
    kind: 'gate',
    name: '胶核修复',
    reward: 'repair',
    hp: 5,
    score: 120,
    color: '#8bd46c',
  },
  guard: {
    id: 'guard',
    kind: 'gate',
    name: '防护凝胶',
    reward: 'shield',
    hp: 6,
    score: 130,
    color: '#70d8d3',
  },
  fever_shard: {
    id: 'fever_shard',
    kind: 'gate',
    name: '暴走印记',
    reward: 'fever_shard',
    hp: 4,
    score: 180,
    color: '#ffd166',
  },
  gate_magnet: {
    id: 'gate_magnet',
    kind: 'gate',
    name: '全息磁暴',
    reward: 'item_magnet',
    hp: 4,
    score: 160,
    color: '#4db8ff',
  },
  gate_bullet_time: {
    id: 'gate_bullet_time',
    kind: 'gate',
    name: '时空力场',
    reward: 'item_bullet_time',
    hp: 4,
    score: 160,
    color: '#6ee7b7',
  },
  gate_booster: {
    id: 'gate_booster',
    kind: 'gate',
    name: '超频冲刺',
    reward: 'item_booster',
    hp: 4,
    score: 160,
    color: '#f59e0b',
  },
  gate_drone: {
    id: 'gate_drone',
    kind: 'gate',
    name: '浮游护卫',
    reward: 'item_drone',
    hp: 4,
    score: 160,
    color: '#ec4899',
  },
  element_lightning: {
    id: 'element_lightning',
    kind: 'secondary_mutation',
    element: 'lightning',
    name: '雷电附魔',
    hp: 1,
    color: '#ffea79',
  },
  element_flame: {
    id: 'element_flame',
    kind: 'secondary_mutation',
    element: 'flame',
    name: '烈焰附魔',
    hp: 1,
    color: '#ff6b4a',
  },
  element_frost: {
    id: 'element_frost',
    kind: 'secondary_mutation',
    element: 'frost',
    name: '极寒附魔',
    hp: 1,
    color: '#7be3ff',
  },
}

export const RUNNER_SUBMODES = {
  blitz: {
    id: 'blitz',
    name: '极速闪击',
    duration: 60,
    distance: 1200,
    kicker: '60 秒闪击突围',
    description: '开局即选核心，极速进化，短平快纯享！',
    badge: '⚡ 60s 极速闪击',
    weaponChoiceTime: 10,
    weaponEvolveTime: 25,
    weaponOverdriveTime: 42,
    sections: [
      {
        id: 'blitz_outer',
        name: '破门闪击',
        start: 0,
        end: 20,
        spawnInterval: 2.8,
        advanceSpeed: 0.15,
        hpMultiplier: 0.9,
        patterns: [
          ['scout', 'attack', 'fever_shard'],
          ['barrel', 'gate_bullet_time', 'rapid'],
          ['hound', 'fever_shard', 'attack'],
          ['swarm', 'gate_magnet', 'barrel'],
        ],
      },
      {
        id: 'blitz_mid',
        name: '穿越封锁',
        start: 20,
        end: 42,
        spawnInterval: 2.2,
        advanceSpeed: 0.20,
        hpMultiplier: 1.15,
        patterns: [
          ['carrier_boss', 'barrier', 'fever_shard'],
          ['charger', 'gate_booster', 'scout'],
          ['laser_gate', 'fever_shard', 'gold_convoy'],
          ['archer', 'guard', 'barrel'],
        ],
      },
      {
        id: 'blitz_sprint',
        name: '极限冲关',
        start: 42,
        end: 60,
        spawnInterval: 1.8,
        advanceSpeed: 0.26,
        hpMultiplier: 1.35,
        patterns: [
          ['carrier_boss', 'shield', 'gate_drone'],
          ['elite', 'twin_assassin', 'fever_shard'],
          ['laser_gate', 'brute', 'charger'],
          ['rapid', 'elite', 'priest'],
        ],
      },
    ],
  },
  marathon: {
    id: 'marathon',
    name: '决战远征',
    duration: 180,
    distance: 3600,
    kicker: '180 秒深度远征',
    description: '4阶段宏大进军，双Boss挑战，超载弹道爽快割草！',
    badge: '🛡️ 180s 决战远征',
    weaponChoiceTime: 25,
    weaponEvolveTime: 65,
    weaponOverdriveTime: 110,
    sections: [
      {
        id: 'outer',
        name: '突破外环',
        start: 0,
        end: 35,
        spawnInterval: 3.4,
        advanceSpeed: 0.13,
        hpMultiplier: 0.95,
        patterns: [
          ['scout', 'attack', null],
          ['barrel', 'rapid', 'fever_shard'],
          ['hound', 'guard', 'gate_magnet'],
          ['swarm', 'gate_bullet_time', 'fever_shard'],
        ],
      },
      {
        id: 'blockade',
        name: '穿越封锁',
        start: 35,
        end: 85,
        spawnInterval: 2.8,
        advanceSpeed: 0.165,
        hpMultiplier: 1.1,
        patterns: [
          ['shield', 'barrier', 'attack'],
          ['charger', 'gate_booster', 'fever_shard'],
          ['laser_gate', 'scout', 'barrel'],
          ['repair', 'gold_convoy', 'rapid'],
          ['swarm', 'gate_drone', 'fever_shard'],
          ['archer', 'guard', 'barrier'],
        ],
      },
      {
        id: 'pursuit',
        name: '王城激战',
        start: 85,
        end: 140,
        spawnInterval: 2.4,
        advanceSpeed: 0.21,
        hpMultiplier: 1.25,
        patterns: [
          ['priest', 'shield', 'attack'],
          ['laser_gate', 'splitter', 'fever_shard'],
          ['carrier_boss', 'repair', 'charger'],
          ['twin_assassin', 'attack', 'shield'],
          ['rapid', 'priest', 'barrel'],
          ['mage', 'gate_bullet_time', 'fever_shard'],
        ],
      },
      {
        id: 'sprint',
        name: '决战冲锋',
        start: 140,
        end: 180,
        spawnInterval: 2.0,
        advanceSpeed: 0.26,
        hpMultiplier: 1.4,
        patterns: [
          ['elite', 'laser_gate', 'fever_shard'],
          ['carrier_boss', 'shield', 'gate_booster'],
          ['barrier', 'repair', 'twin_assassin'],
          ['swarm', 'brute', 'gate_drone'],
          ['rapid', 'elite', 'priest'],
          ['archer', 'mage', 'barrel'],
        ],
      },
    ],
  },
  endless: {
    id: 'endless',
    name: '无尽狂飙',
    duration: Infinity,
    distance: Infinity,
    kicker: '无限距离挑战',
    description: '没有终点线！速度与难度无限提升，挑战极限里程！',
    badge: '♾️ 无尽狂飙',
    weaponChoiceTime: 25,
    weaponEvolveTime: 60,
    weaponOverdriveTime: 100,
    sections: [],
  },
}

export function getRunnerSubmode(id) {
  return RUNNER_SUBMODES[id] || RUNNER_SUBMODES.marathon
}

export function getRunnerSection(elapsed, submodeId = 'marathon') {
  const submode = getRunnerSubmode(submodeId)
  const time = Math.max(0, elapsed)

  if (submode.id === 'endless') {
    const waveIndex = Math.floor(time / 30)
    const baseSpeed = Math.min(0.32, 0.14 + waveIndex * 0.015)
    const spawnInterval = Math.max(1.6, 3.2 - waveIndex * 0.12)
    const hpMultiplier = 1 + waveIndex * 0.12
    const stageNames = ['起步试炼', '封锁外围', '要塞突破', '王城突袭', '深渊狂飙', '虚空极速']
    const name = waveIndex < stageNames.length ? stageNames[waveIndex] : `狂飙第 ${waveIndex + 1} 区`
    const pool = [
      ['scout', 'fever_shard', 'gate_magnet'],
      ['carrier_boss', 'repair', 'charger'],
      ['laser_gate', 'barrier', 'gate_bullet_time'],
      ['elite', 'fever_shard', 'splitter'],
      ['swarm', 'barrel', 'gate_booster'],
      ['gold_convoy', 'twin_assassin', 'guard'],
      ['archer', 'mage', 'gate_drone'],
    ]
    return {
      id: `endless_${waveIndex}`,
      name,
      index: waveIndex,
      start: waveIndex * 30,
      end: (waveIndex + 1) * 30,
      spawnInterval,
      advanceSpeed: baseSpeed,
      hpMultiplier,
      patterns: pool,
    }
  }

  const sections = submode.sections || RUNNER_SUBMODES.marathon.sections
  for (let i = sections.length - 1; i >= 0; i--) {
    if (time >= sections[i].start) return { ...sections[i], index: i }
  }
  return { ...sections[0], index: 0 }
}

export function getRunnerWeaponCore(id) {
  return RUNNER_WEAPON_CORES[id] || null
}

export function runnerProgress(elapsed, duration = 180) {
  if (!duration || duration === Infinity) return 0
  return Math.min(1, Math.max(0, elapsed / duration))
}

export function runnerDistanceRemaining(elapsed, duration = 180, totalDistance = 3600) {
  if (!duration || duration === Infinity) return Math.floor(elapsed * 85)
  return Math.max(0, Math.ceil((1 - runnerProgress(elapsed, duration)) * totalDistance))
}

export function createRunnerSeed(value = Date.now()) {
  const seed = Number(value) >>> 0
  return seed || 0x6d2b79f5
}
