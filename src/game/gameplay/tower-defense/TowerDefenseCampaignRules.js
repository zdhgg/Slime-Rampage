/**
 * TowerDefenseCampaignRules.js
 * 5 Thematic Biomes & 99 Stages Campaign Progression Configuration
 */

export const CHAPTERS_META = Object.freeze([
  {
    id: 1,
    key: 'verdant',
    name: '纯净母巢 · 绿意始源',
    subtitle: '第 1 ~ 20 关 · 原始巨木森林与毒沼活泉',
    theme: {
      key: 'verdant',
      bgBase: '#0b1613',
      gridColor: 'rgba(46, 204, 113, 0.08)',
      roadColor: '#1e332a',
      roadBorder: '#2ecc71',
      ambientGlow: 'rgba(46, 204, 113, 0.15)',
      badgeColor: '#2ecc71',
    },
    stageRange: [1, 20],
    bossStage: 20,
    bossName: '重装开路巨像',
    recommendedTypes: ['rapid', 'blast'],
    icon: '🌿',
  },
  {
    id: 2,
    key: 'glacial',
    name: '霜白裂谷 · 极寒冻土',
    subtitle: '第 21 ~ 40 关 · 冰川裂谷与霜雪苔原',
    theme: {
      key: 'glacial',
      bgBase: '#0a141e',
      gridColor: 'rgba(56, 210, 255, 0.09)',
      roadColor: '#172b3c',
      roadBorder: '#38d2ff',
      ambientGlow: 'rgba(56, 210, 255, 0.18)',
      badgeColor: '#38d2ff',
    },
    stageRange: [21, 40],
    bossStage: 40,
    bossName: '凛冬裁决官',
    recommendedTypes: ['slow', 'pierce'],
    icon: '❄️',
  },
  {
    id: 3,
    key: 'volcanic',
    name: '地热溶洞 · 熔岩裂隙',
    subtitle: '第 41 ~ 60 关 · 沸腾熔岩河与地热熔炉',
    theme: {
      key: 'volcanic',
      bgBase: '#1a0d0a',
      gridColor: 'rgba(255, 107, 107, 0.09)',
      roadColor: '#341a14',
      roadBorder: '#ff6b6b',
      ambientGlow: 'rgba(255, 107, 107, 0.20)',
      badgeColor: '#ff6b6b',
    },
    stageRange: [41, 60],
    bossStage: 60,
    bossName: '熔火灭世领主',
    recommendedTypes: ['blast', 'rapid'],
    icon: '🔥',
  },
  {
    id: 4,
    key: 'superconductor',
    name: '超导苍穹 · 雷鸣晶矿',
    subtitle: '第 61 ~ 80 关 · 浮空晶石废墟与紫金雷光',
    theme: {
      key: 'superconductor',
      bgBase: '#120e1e',
      gridColor: 'rgba(165, 94, 234, 0.10)',
      roadColor: '#241b3a',
      roadBorder: '#a55eea',
      ambientGlow: 'rgba(255, 234, 167, 0.22)',
      badgeColor: '#ffeaa7',
    },
    stageRange: [61, 80],
    bossStage: 80,
    bossName: '虚空大魔导师',
    recommendedTypes: ['pierce', 'slow'],
    icon: '⚡',
  },
  {
    id: 5,
    key: 'imperial',
    name: '帝国圣城 · 终焉决战',
    subtitle: '第 81 ~ 99 关 · 黄金神殿王座与终极审判',
    theme: {
      key: 'imperial',
      bgBase: '#19150d',
      gridColor: 'rgba(241, 196, 15, 0.12)',
      roadColor: '#3a2f18',
      roadBorder: '#f1c40f',
      ambientGlow: 'rgba(241, 196, 15, 0.25)',
      badgeColor: '#f1c40f',
    },
    stageRange: [81, 99],
    bossStage: 99,
    bossName: '帝国双子元帅 & 灭绝机甲',
    recommendedTypes: ['rapid', 'blast', 'slow', 'pierce'],
    icon: '👑',
  },
]);

export const TOPOLOGY_PRESETS = Object.freeze({
  classic_s: {
    id: 'classic_s',
    name: '经典S形防线',
    path: [
      { x: 0.03, y: 0.18 },
      { x: 0.28, y: 0.18 },
      { x: 0.28, y: 0.46 },
      { x: 0.63, y: 0.46 },
      { x: 0.63, y: 0.76 },
      { x: 0.97, y: 0.76 },
    ],
    buildSlots: [
      { x: 0.13, y: 0.37, leyline: 'acid' },
      { x: 0.42, y: 0.16, leyline: 'frost' },
      { x: 0.45, y: 0.34, leyline: 'magma' },
      { x: 0.14, y: 0.66, leyline: 'acid' },
      { x: 0.43, y: 0.68, leyline: 'frost' },
      { x: 0.79, y: 0.40, leyline: 'magma' },
      { x: 0.79, y: 0.62, leyline: 'acid' },
      { x: 0.43, y: 0.86, leyline: 'magma' },
      { x: 0.28, y: 0.32, locked: true, cost: 40, reward: 60, leyline: 'amplified' },
      { x: 0.63, y: 0.62, locked: true, cost: 40, reward: 60, leyline: 'amplified' },
    ],
    traps: [
      { id: 'spore_shroom', pos: { x: 0.17, y: 0.08 }, targetPos: { x: 0.17, y: 0.18 } },
      { id: 'slime_geyser', pos: { x: 0.46, y: 0.57 }, targetPos: { x: 0.46, y: 0.46 } },
      { id: 'hive_crystal', pos: { x: 0.88, y: 0.88 }, targetPos: { x: 0.88, y: 0.88 } },
    ],
  },
  canyon_creek: {
    id: 'canyon_creek',
    name: '峡谷环流防线',
    path: [
      { x: 0.03, y: 0.15 },
      { x: 0.75, y: 0.15 },
      { x: 0.75, y: 0.82 },
      { x: 0.25, y: 0.82 },
      { x: 0.25, y: 0.48 },
      { x: 0.97, y: 0.48 },
    ],
    buildSlots: [
      { x: 0.48, y: 0.32, leyline: 'magma' },
      { x: 0.48, y: 0.64, leyline: 'frost' },
      { x: 0.12, y: 0.34, leyline: 'acid' },
      { x: 0.88, y: 0.32, leyline: 'acid' },
      { x: 0.88, y: 0.68, leyline: 'magma' },
      { x: 0.12, y: 0.68, leyline: 'frost' },
      { x: 0.48, y: 0.15, leyline: 'acid' },
      { x: 0.50, y: 0.88, leyline: 'magma' },
      { x: 0.75, y: 0.48, locked: true, cost: 45, reward: 70, leyline: 'amplified' },
      { x: 0.25, y: 0.65, locked: true, cost: 45, reward: 70, leyline: 'amplified' },
    ],
    traps: [
      { id: 'spore_shroom', pos: { x: 0.40, y: 0.06 }, targetPos: { x: 0.40, y: 0.15 } },
      { id: 'slime_geyser', pos: { x: 0.50, y: 0.48 }, targetPos: { x: 0.50, y: 0.48 } },
      { id: 'hive_crystal', pos: { x: 0.88, y: 0.88 }, targetPos: { x: 0.88, y: 0.82 } },
    ],
  },
  double_s: {
    id: 'double_s',
    name: '双层蛇形回廊',
    path: [
      { x: 0.03, y: 0.15 },
      { x: 0.82, y: 0.15 },
      { x: 0.82, y: 0.45 },
      { x: 0.18, y: 0.45 },
      { x: 0.18, y: 0.78 },
      { x: 0.97, y: 0.78 },
    ],
    buildSlots: [
      { x: 0.35, y: 0.30, leyline: 'frost' },
      { x: 0.60, y: 0.30, leyline: 'frost' },
      { x: 0.40, y: 0.62, leyline: 'magma' },
      { x: 0.65, y: 0.62, leyline: 'acid' },
      { x: 0.08, y: 0.30, leyline: 'acid' },
      { x: 0.92, y: 0.60, leyline: 'magma' },
      { x: 0.50, y: 0.90, leyline: 'frost' },
      { x: 0.28, y: 0.90, leyline: 'acid' },
      { x: 0.82, y: 0.30, locked: true, cost: 45, reward: 70, leyline: 'amplified' },
      { x: 0.18, y: 0.62, locked: true, cost: 45, reward: 70, leyline: 'amplified' },
    ],
    traps: [
      { id: 'spore_shroom', pos: { x: 0.40, y: 0.06 }, targetPos: { x: 0.40, y: 0.15 } },
      { id: 'slime_geyser', pos: { x: 0.50, y: 0.37 }, targetPos: { x: 0.50, y: 0.45 } },
      { id: 'hive_crystal', pos: { x: 0.88, y: 0.88 }, targetPos: { x: 0.88, y: 0.78 } },
    ],
  },
  cross_grove: {
    id: 'cross_grove',
    name: '十字古树要塞',
    path: [
      { x: 0.03, y: 0.25 },
      { x: 0.48, y: 0.25 },
      { x: 0.48, y: 0.75 },
      { x: 0.20, y: 0.75 },
      { x: 0.20, y: 0.50 },
      { x: 0.80, y: 0.50 },
      { x: 0.80, y: 0.80 },
      { x: 0.97, y: 0.80 },
    ],
    buildSlots: [
      { x: 0.28, y: 0.14, leyline: 'acid' },
      { x: 0.65, y: 0.36, leyline: 'magma' },
      { x: 0.32, y: 0.38, leyline: 'frost' },
      { x: 0.65, y: 0.64, leyline: 'acid' },
      { x: 0.32, y: 0.62, leyline: 'magma' },
      { x: 0.08, y: 0.62, leyline: 'frost' },
      { x: 0.92, y: 0.64, leyline: 'magma' },
      { x: 0.50, y: 0.88, leyline: 'acid' },
      { x: 0.48, y: 0.50, locked: true, cost: 50, reward: 75, leyline: 'amplified' },
      { x: 0.80, y: 0.32, locked: true, cost: 50, reward: 75, leyline: 'amplified' },
    ],
    traps: [
      { id: 'spore_shroom', pos: { x: 0.25, y: 0.35 }, targetPos: { x: 0.25, y: 0.25 } },
      { id: 'slime_geyser', pos: { x: 0.50, y: 0.62 }, targetPos: { x: 0.48, y: 0.50 } },
      { id: 'hive_crystal', pos: { x: 0.88, y: 0.90 }, targetPos: { x: 0.88, y: 0.80 } },
    ],
  },
  glacial_pass: {
    id: 'glacial_pass',
    name: '冰隙裂谷防线',
    path: [
      { x: 0.03, y: 0.20 },
      { x: 0.40, y: 0.20 },
      { x: 0.40, y: 0.60 },
      { x: 0.70, y: 0.60 },
      { x: 0.70, y: 0.28 },
      { x: 0.97, y: 0.28 },
    ],
    buildSlots: [
      { x: 0.20, y: 0.38, leyline: 'frost' },
      { x: 0.55, y: 0.42, leyline: 'magma' },
      { x: 0.55, y: 0.78, leyline: 'frost' },
      { x: 0.20, y: 0.75, leyline: 'acid' },
      { x: 0.85, y: 0.48, leyline: 'acid' },
      { x: 0.85, y: 0.14, leyline: 'magma' },
      { x: 0.40, y: 0.08, leyline: 'frost' },
      { x: 0.70, y: 0.78, leyline: 'magma' },
      { x: 0.40, y: 0.40, locked: true, cost: 45, reward: 70, leyline: 'amplified' },
      { x: 0.70, y: 0.44, locked: true, cost: 45, reward: 70, leyline: 'amplified' },
    ],
    traps: [
      { id: 'spore_shroom', pos: { x: 0.20, y: 0.08 }, targetPos: { x: 0.20, y: 0.20 } },
      { id: 'slime_geyser', pos: { x: 0.55, y: 0.60 }, targetPos: { x: 0.55, y: 0.60 } },
      { id: 'hive_crystal', pos: { x: 0.88, y: 0.40 }, targetPos: { x: 0.97, y: 0.28 } },
    ],
  },
  hairpin_loop: {
    id: 'hairpin_loop',
    name: '环形焦土要塞',
    path: [
      { x: 0.03, y: 0.30 },
      { x: 0.45, y: 0.30 },
      { x: 0.45, y: 0.14 },
      { x: 0.78, y: 0.14 },
      { x: 0.78, y: 0.72 },
      { x: 0.35, y: 0.72 },
      { x: 0.35, y: 0.52 },
      { x: 0.97, y: 0.52 },
    ],
    buildSlots: [
      { x: 0.25, y: 0.15, leyline: 'magma' },
      { x: 0.62, y: 0.28, leyline: 'magma' },
      { x: 0.62, y: 0.46, leyline: 'frost' },
      { x: 0.18, y: 0.48, leyline: 'acid' },
      { x: 0.55, y: 0.62, leyline: 'amplified' },
      { x: 0.90, y: 0.34, leyline: 'magma' },
      { x: 0.55, y: 0.86, leyline: 'acid' },
      { x: 0.20, y: 0.86, leyline: 'frost' },
      { x: 0.45, y: 0.22, locked: true, cost: 50, reward: 75, leyline: 'amplified' },
      { x: 0.35, y: 0.62, locked: true, cost: 50, reward: 75, leyline: 'amplified' },
    ],
    traps: [
      { id: 'spore_shroom', pos: { x: 0.25, y: 0.38 }, targetPos: { x: 0.25, y: 0.30 } },
      { id: 'slime_geyser', pos: { x: 0.78, y: 0.43 }, targetPos: { x: 0.78, y: 0.43 } },
      { id: 'hive_crystal', pos: { x: 0.88, y: 0.65 }, targetPos: { x: 0.97, y: 0.52 } },
    ],
  },
  magma_river: {
    id: 'magma_river',
    name: '熔岩断崖防线',
    path: [
      { x: 0.03, y: 0.18 },
      { x: 0.60, y: 0.18 },
      { x: 0.60, y: 0.52 },
      { x: 0.15, y: 0.52 },
      { x: 0.15, y: 0.82 },
      { x: 0.97, y: 0.82 },
    ],
    buildSlots: [
      { x: 0.30, y: 0.35, leyline: 'magma' },
      { x: 0.75, y: 0.35, leyline: 'magma' },
      { x: 0.38, y: 0.68, leyline: 'frost' },
      { x: 0.75, y: 0.68, leyline: 'acid' },
      { x: 0.08, y: 0.35, leyline: 'acid' },
      { x: 0.90, y: 0.65, leyline: 'magma' },
      { x: 0.55, y: 0.92, leyline: 'frost' },
      { x: 0.40, y: 0.08, leyline: 'magma' },
      { x: 0.60, y: 0.35, locked: true, cost: 50, reward: 75, leyline: 'amplified' },
      { x: 0.15, y: 0.68, locked: true, cost: 50, reward: 75, leyline: 'amplified' },
    ],
    traps: [
      { id: 'spore_shroom', pos: { x: 0.30, y: 0.08 }, targetPos: { x: 0.30, y: 0.18 } },
      { id: 'slime_geyser', pos: { x: 0.60, y: 0.65 }, targetPos: { x: 0.60, y: 0.52 } },
      { id: 'hive_crystal', pos: { x: 0.88, y: 0.90 }, targetPos: { x: 0.88, y: 0.82 } },
    ],
  },
  sky_bridge: {
    id: 'sky_bridge',
    name: '超导浮岛晶桥',
    path: [
      { x: 0.03, y: 0.22 },
      { x: 0.35, y: 0.22 },
      { x: 0.35, y: 0.65 },
      { x: 0.65, y: 0.65 },
      { x: 0.65, y: 0.22 },
      { x: 0.97, y: 0.22 },
    ],
    buildSlots: [
      { x: 0.18, y: 0.40, leyline: 'amplified' },
      { x: 0.50, y: 0.42, leyline: 'magma' },
      { x: 0.82, y: 0.40, leyline: 'frost' },
      { x: 0.18, y: 0.80, leyline: 'acid' },
      { x: 0.50, y: 0.80, leyline: 'amplified' },
      { x: 0.82, y: 0.80, leyline: 'magma' },
      { x: 0.35, y: 0.08, leyline: 'frost' },
      { x: 0.65, y: 0.08, leyline: 'acid' },
      { x: 0.35, y: 0.44, locked: true, cost: 50, reward: 80, leyline: 'amplified' },
      { x: 0.65, y: 0.44, locked: true, cost: 50, reward: 80, leyline: 'amplified' },
    ],
    traps: [
      { id: 'spore_shroom', pos: { x: 0.18, y: 0.10 }, targetPos: { x: 0.18, y: 0.22 } },
      { id: 'slime_geyser', pos: { x: 0.50, y: 0.65 }, targetPos: { x: 0.50, y: 0.65 } },
      { id: 'hive_crystal', pos: { x: 0.88, y: 0.10 }, targetPos: { x: 0.97, y: 0.22 } },
    ],
  },
  converge_dual: {
    id: 'converge_dual',
    name: '天穹双路防线',
    path: [
      { x: 0.03, y: 0.20 },
      { x: 0.38, y: 0.20 },
      { x: 0.50, y: 0.48 },
      { x: 0.78, y: 0.48 },
      { x: 0.78, y: 0.80 },
      { x: 0.97, y: 0.80 },
    ],
    buildSlots: [
      { x: 0.20, y: 0.36, leyline: 'amplified' },
      { x: 0.38, y: 0.36, leyline: 'frost' },
      { x: 0.64, y: 0.34, leyline: 'magma' },
      { x: 0.64, y: 0.62, leyline: 'amplified' },
      { x: 0.35, y: 0.62, leyline: 'acid' },
      { x: 0.20, y: 0.80, leyline: 'magma' },
      { x: 0.60, y: 0.80, leyline: 'frost' },
      { x: 0.88, y: 0.36, leyline: 'acid' },
      { x: 0.50, y: 0.36, locked: true, cost: 50, reward: 80, leyline: 'amplified' },
      { x: 0.78, y: 0.64, locked: true, cost: 50, reward: 80, leyline: 'amplified' },
    ],
    traps: [
      { id: 'spore_shroom', pos: { x: 0.20, y: 0.10 }, targetPos: { x: 0.20, y: 0.20 } },
      { id: 'slime_geyser', pos: { x: 0.50, y: 0.60 }, targetPos: { x: 0.50, y: 0.48 } },
      { id: 'hive_crystal', pos: { x: 0.88, y: 0.90 }, targetPos: { x: 0.88, y: 0.90 } },
    ],
  },
  crossroads: {
    id: 'crossroads',
    name: '神圣帝国要塞枢纽',
    path: [
      { x: 0.03, y: 0.45 },
      { x: 0.25, y: 0.45 },
      { x: 0.25, y: 0.18 },
      { x: 0.75, y: 0.18 },
      { x: 0.75, y: 0.45 },
      { x: 0.50, y: 0.45 },
      { x: 0.50, y: 0.78 },
      { x: 0.97, y: 0.78 },
    ],
    buildSlots: [
      { x: 0.12, y: 0.28, leyline: 'amplified' },
      { x: 0.38, y: 0.30, leyline: 'magma' },
      { x: 0.62, y: 0.30, leyline: 'frost' },
      { x: 0.88, y: 0.28, leyline: 'acid' },
      { x: 0.38, y: 0.60, leyline: 'amplified' },
      { x: 0.62, y: 0.60, leyline: 'amplified' },
      { x: 0.25, y: 0.75, leyline: 'magma' },
      { x: 0.75, y: 0.75, leyline: 'frost' },
      { x: 0.50, y: 0.30, locked: true, cost: 60, reward: 100, leyline: 'amplified' },
      { x: 0.50, y: 0.60, locked: true, cost: 60, reward: 100, leyline: 'amplified' },
    ],
    traps: [
      { id: 'spore_shroom', pos: { x: 0.15, y: 0.55 }, targetPos: { x: 0.15, y: 0.45 } },
      { id: 'slime_geyser', pos: { x: 0.50, y: 0.36 }, targetPos: { x: 0.50, y: 0.45 } },
      { id: 'hive_crystal', pos: { x: 0.88, y: 0.88 }, targetPos: { x: 0.88, y: 0.88 } },
    ],
  },
});

export const GENE_TREE_NODES = Object.freeze([
  {
    id: 'talent_gold',
    name: '丰饶原浆',
    icon: '🌾',
    maxLevel: 3,
    costs: [3, 6, 12],
    descriptions: [
      '开局初始养分 +30',
      '开局初始养分 +60',
      '开局初始养分 +100',
    ],
    effect: (level) => ({ startingGoldBonus: [0, 30, 60, 100][level] || 0 }),
  },
  {
    id: 'talent_leyline',
    name: '地脉共鸣过载',
    icon: '⚡',
    maxLevel: 3,
    costs: [5, 10, 18],
    descriptions: [
      '所有槽位地脉增益效果提升 +15%',
      '所有槽位地脉增益效果提升 +30%',
      '所有槽位地脉增益效果提升 +50%',
    ],
    effect: (level) => ({ leylineBoostMultiplier: [1, 1.15, 1.30, 1.50][level] || 1 }),
  },
  {
    id: 'talent_trap_cd',
    name: '母巢神经突触',
    icon: '⏱️',
    maxLevel: 3,
    costs: [4, 8, 15],
    descriptions: [
      '所有战术生物机关冷却时间缩短 -10%',
      '所有战术生物机关冷却时间缩短 -20%',
      '所有战术生物机关冷却时间缩短 -30%',
    ],
    effect: (level) => ({ trapCooldownMultiplier: [1, 0.90, 0.80, 0.70][level] || 1 }),
  },
  {
    id: 'talent_pet_morale',
    name: '灵性羁绊',
    icon: '💖',
    maxLevel: 3,
    costs: [3, 7, 14],
    descriptions: [
      '抚摸鼓舞持续时间提升至 6 秒',
      '抚摸鼓舞持续时间提升至 8 秒',
      '抚摸鼓舞持续时间提升至 10 秒且攻速提升 +25%',
    ],
    effect: (level) => ({
      moraleDuration: [4, 6, 8, 10][level] || 4,
      moraleSpeedBoost: [0.15, 0.15, 0.20, 0.25][level] || 0.15,
    }),
  },
  {
    id: 'talent_leap_shield',
    name: '弹跳生肌',
    icon: '🦘',
    maxLevel: 3,
    costs: [6, 12, 22],
    descriptions: [
      '战术换位冷却缩短至 6 秒',
      '换位冷却缩短至 4 秒，且落地获得 3 秒强化光环',
      '换位冷却缩短至 3 秒，落地全图史莱姆获得 3 秒小狂热',
    ],
    effect: (level) => ({
      relocateCooldown: [8, 6, 4, 3][level] || 8,
      leapBuff: level >= 2,
    }),
  },
  {
    id: 'talent_dmg',
    name: '强酸消化腺',
    icon: '🧪',
    maxLevel: 3,
    costs: [5, 10, 18],
    descriptions: [
      '全体守卫攻击力 +4%',
      '全体守卫攻击力 +8%',
      '全体守卫攻击力 +12%',
    ],
    effect: (level) => ({ towerDamageMultiplier: [1, 1.04, 1.08, 1.12][level] || 1 }),
  },
  {
    id: 'talent_rate',
    name: '代谢亢进',
    icon: '🔥',
    maxLevel: 3,
    costs: [5, 10, 18],
    descriptions: [
      '全体守卫攻击速度 +3%',
      '全体守卫攻击速度 +6%',
      '全体守卫攻击速度 +10%',
    ],
    effect: (level) => ({ towerSpeedMultiplier: [1, 1.03, 1.06, 1.10][level] || 1 }),
  },
  {
    id: 'talent_range',
    name: '蛛网感知',
    icon: '🕸️',
    maxLevel: 3,
    costs: [4, 8, 14],
    descriptions: [
      '全体守卫感知范围 +3%',
      '全体守卫感知范围 +6%',
      '全体守卫感知范围 +10%',
    ],
    effect: (level) => ({ towerRangeMultiplier: [1, 1.03, 1.06, 1.10][level] || 1 }),
  },
  {
    id: 'talent_basehp',
    name: '巢心韧壳',
    icon: '🏰',
    maxLevel: 3,
    costs: [4, 9, 16],
    descriptions: [
      '母巢核心生命上限 +2',
      '母巢核心生命上限 +4',
      '母巢核心生命上限 +6',
    ],
    effect: (level) => ({ baseHpBonus: [0, 2, 4, 6][level] || 0 }),
  },
  {
    id: 'talent_sell',
    name: '循环回收',
    icon: '♻️',
    maxLevel: 3,
    costs: [3, 6, 10],
    descriptions: [
      '放生返还提升 +10%',
      '放生返还提升 +20%',
      '放生返还提升 +35%',
    ],
    effect: (level) => ({ sellBonusMultiplier: [1, 1.10, 1.20, 1.35][level] || 1 }),
  },
  {
    id: 'talent_interest',
    name: '复利发酵',
    icon: '🏦',
    maxLevel: 3,
    costs: [4, 9, 16],
    descriptions: [
      '波次结算利息 +2%（上限提升）',
      '波次结算利息 +4%（上限提升）',
      '波次结算利息 +6%（上限提升）',
    ],
    effect: (level) => ({ interestRate: [0.05, 0.07, 0.09, 0.11][level] || 0.05 }),
  },
  {
    id: 'talent_early',
    name: '先手突袭',
    icon: '⚔️',
    maxLevel: 3,
    costs: [3, 7, 12],
    descriptions: [
      '提前召唤下一波的养分奖励 +25%',
      '提前召唤下一波的养分奖励 +50%',
      '提前召唤下一波的养分奖励 +80%',
    ],
    effect: (level) => ({ earlyCallMultiplier: [1, 1.25, 1.50, 1.80][level] || 1 }),
  },
  {
    id: 'talent_boss',
    name: '攻城破甲',
    icon: '🔨',
    maxLevel: 3,
    costs: [5, 11, 20],
    descriptions: [
      '对首领伤害 +8%',
      '对首领伤害 +16%',
      '对首领伤害 +25%',
    ],
    effect: (level) => ({ bossDamageMultiplier: [1, 1.08, 1.16, 1.25][level] || 1 }),
  },
  {
    id: 'talent_shiny',
    name: '闪光血统',
    icon: '✨',
    maxLevel: 3,
    costs: [4, 8, 15],
    descriptions: [
      '闪光特质触发率 +5%',
      '闪光特质触发率 +10%',
      '闪光特质触发率 +15%',
    ],
    effect: (level) => ({ shinyChanceBonus: [0, 0.05, 0.10, 0.15][level] || 0 }),
  },
  {
    id: 'talent_mskip',
    name: '突变精华',
    icon: '🧬',
    maxLevel: 3,
    costs: [3, 6, 10],
    descriptions: [
      '跳过突变的养分补偿 +10',
      '跳过突变的养分补偿 +20',
      '跳过突变的养分补偿 +35',
    ],
    effect: (level) => ({ mutationSkipBonus: [0, 10, 20, 35][level] || 0 }),
  },
]);

/** 无尽模式：确定性无限波次生成（波次血量持续爬升，每 10 波一个首领） */
export const TOWER_DEFENSE_ENDLESS_WAVE_COUNT = 60;

export function generateEndlessWaves(baseStageId = 1) {
  const basePool = ['grunt', 'runner', 'shield', 'support', 'splitter'];
  const elitePool = ['tank', 'swarm', 'emp'];
  const waves = [];
  for (let w = 1; w <= TOWER_DEFENSE_ENDLESS_WAVE_COUNT; w++) {
    const isBoss = w % 10 === 0;
    const scale = 1.05 + w * 0.10 + Math.floor(w / 10) * 0.35;
    const groups = [];
    if (isBoss) {
      groups.push({
        type: 'boss',
        count: w >= 50 ? 2 : 1,
        interval: 3.5,
        gap: 2.0,
        scale: scale * 1.25,
      });
      groups.push({
        type: w >= 30 ? 'shield' : 'runner',
        count: 4 + Math.floor(w / 15),
        interval: 0.9,
        scale,
      });
    } else {
      const pool = w >= 3 ? basePool.concat(elitePool) : basePool;
      const mainType = pool[(w + baseStageId) % pool.length];
      const count = 6 + Math.floor(w * 1.2) + Math.floor(w * 0.08 * Math.min((w - 1) / 3, 1));
      const mainTuned = tuneEnemyGroup(mainType, count, Math.max(0.60, 1.30 - w * 0.03));
      groups.push({ type: mainType, count: mainTuned.count, interval: mainTuned.interval, scale });
      if (w >= 3) {
        const subType = pool[(w + baseStageId + 2) % pool.length];
        const subTuned = tuneEnemyGroup(subType, 3 + Math.floor(w * 0.6), 1.1);
        groups.push({ type: subType, count: subTuned.count, interval: subTuned.interval, gap: 1.2, scale });
      }
    }
    waves.push({
      wave: w,
      preview: {
        title: isBoss ? `首领波次 ${Math.floor(w / 10)}` : `第 ${w} 波次`,
        count: groups.reduce((acc, g) => acc + g.count, 0),
      },
      groups,
    });
  }
  return waves;
}


/**
 * Deterministically customizes build slots per stage within the 5-stage block.
 */
function getStageSpecificSlots(baseSlots, stageId, stageInChapter, chapterId) {
  const subIndex = (stageInChapter - 1) % 5; // 0, 1, 2, 3, 4
  const leylines = ['acid', 'frost', 'magma', 'amplified'];

  return baseSlots.map((slot, idx) => {
    // Determine locked slots: alternate which slots are locked per stage
    let isLocked = false;
    let cost = 40 + subIndex * 5;
    let reward = 60 + subIndex * 10;

    if (subIndex === 0) {
      isLocked = idx === 8 || idx === 9;
    } else if (subIndex === 1) {
      isLocked = idx === 2 || idx === 7;
    } else if (subIndex === 2) {
      isLocked = idx === 3 || idx === 8;
    } else if (subIndex === 3) {
      isLocked = idx === 1 || idx === 6;
    } else {
      isLocked = idx === 4 || idx === 9;
    }

    // Dynamic Leyline rotation per stage
    let leyline = slot.leyline || 'acid';
    if (!isLocked) {
      const leylineShift = (idx + subIndex + chapterId) % leylines.length;
      leyline = leylines[leylineShift];
    } else {
      leyline = 'amplified';
    }

    // Micro position shift (±0.015) based on stage seed
    const microX = ((Math.sin(stageId * 7.1 + idx * 3.3) * 100) % 15) * 0.001;
    const microY = ((Math.cos(stageId * 5.3 + idx * 4.7) * 100) % 15) * 0.001;

    return {
      slotIndex: idx,
      x: Math.max(0.06, Math.min(0.94, Number((slot.x + microX).toFixed(3)))),
      y: Math.max(0.08, Math.min(0.92, Number((slot.y + microY).toFixed(3)))),
      leyline,
      locked: isLocked,
      cost: isLocked ? cost : 0,
      reward: isLocked ? reward : 0,
    };
  });
}

/**
 * Deterministically customizes tactical trap positions per stage.
 */
function getStageSpecificTraps(baseTraps, stageId, stageInChapter, path) {
  const subIndex = (stageInChapter - 1) % 5;
  const pathLen = path ? path.length : 6;

  // Distribute traps along different key path segments depending on subIndex
  const p1 = path[Math.min(pathLen - 1, 1 + (subIndex % 2))] || { x: 0.20, y: 0.20 };
  const p2 = path[Math.min(pathLen - 1, 2 + ((subIndex + 1) % 2))] || { x: 0.50, y: 0.50 };
  const p3 = path[Math.min(pathLen - 1, pathLen - 1)] || { x: 0.88, y: 0.80 };

  return [
    {
      id: 'spore_shroom',
      pos: {
        x: Math.max(0.06, Math.min(0.94, Number((p1.x + (subIndex % 2 === 0 ? -0.06 : 0.06)).toFixed(3)))),
        y: Math.max(0.06, Math.min(0.94, Number((p1.y + (subIndex < 2 ? -0.10 : 0.10)).toFixed(3)))),
      },
      targetPos: { x: p1.x, y: p1.y },
    },
    {
      id: 'slime_geyser',
      pos: {
        x: Math.max(0.06, Math.min(0.94, Number((p2.x + (subIndex % 2 === 1 ? -0.05 : 0.05)).toFixed(3)))),
        y: Math.max(0.06, Math.min(0.94, Number((p2.y + (subIndex % 3 === 0 ? -0.08 : 0.08)).toFixed(3)))),
      },
      targetPos: { x: p2.x, y: p2.y },
    },
    {
      id: 'hive_crystal',
      pos: {
        x: Math.max(0.06, Math.min(0.94, Number((p3.x + (subIndex % 2 === 0 ? -0.08 : 0.04)).toFixed(3)))),
        y: Math.max(0.06, Math.min(0.94, Number((p3.y + (subIndex < 3 ? 0.08 : -0.08)).toFixed(3)))),
      },
      targetPos: { x: p3.x, y: p3.y },
    },
  ];
}

export function getStageConfig(stageId) {
  const clampedStage = Math.max(1, Math.min(99, Math.floor(stageId || 1)));
  const chapter = CHAPTERS_META.find((c) => clampedStage >= c.stageRange[0] && clampedStage <= c.stageRange[1]) || CHAPTERS_META[0];
  const stageInChapter = clampedStage - chapter.stageRange[0] + 1;
  const isMilestone = clampedStage % 10 === 0 || clampedStage === 99;
  const isBossStage = clampedStage === chapter.bossStage || clampedStage === 99;

  // Distinct 4-tier sub-stage topologies per chapter (Every 5 stages unique!)
  let topologyId = 'classic_s';
  const blockIndex = Math.min(3, Math.floor((stageInChapter - 1) / 5)); // 0: 1-5, 1: 6-10, 2: 11-15, 3: 16-20

  if (chapter.id === 1) {
    const ch1Topos = ['classic_s', 'canyon_creek', 'double_s', 'cross_grove'];
    topologyId = ch1Topos[blockIndex] || 'classic_s';
  } else if (chapter.id === 2) {
    const ch2Topos = ['glacial_pass', 'double_s', 'hairpin_loop', 'canyon_creek'];
    topologyId = ch2Topos[blockIndex] || 'glacial_pass';
  } else if (chapter.id === 3) {
    const ch3Topos = ['magma_river', 'hairpin_loop', 'double_s', 'cross_grove'];
    topologyId = ch3Topos[blockIndex] || 'magma_river';
  } else if (chapter.id === 4) {
    const ch4Topos = ['sky_bridge', 'converge_dual', 'hairpin_loop', 'canyon_creek'];
    topologyId = ch4Topos[blockIndex] || 'sky_bridge';
  } else if (chapter.id === 5) {
    const ch5Topos = ['classic_s', 'converge_dual', 'crossroads', 'crossroads'];
    topologyId = clampedStage === 99 ? 'crossroads' : (ch5Topos[blockIndex] || 'crossroads');
  }

  const topology = TOPOLOGY_PRESETS[topologyId] || TOPOLOGY_PRESETS.classic_s;
  let waveCount = 6;
  if (clampedStage === 1) {
    waveCount = 4;
  } else if (clampedStage <= 5) {
    waveCount = 5;
  } else if (isBossStage) {
    waveCount = clampedStage === 99 ? 12 : 8 + Math.floor(chapter.id * 0.6);
  } else {
    waveCount = Math.min(12, 6 + Math.floor((clampedStage - 1) / 10));
  }

  const startingGold = clampedStage === 1 ? 240 : 240 + (chapter.id - 1) * 25;
  const waves = generateStageWaves(clampedStage, chapter.id, waveCount, isBossStage);

  return {
    stageId: clampedStage,
    chapterId: chapter.id,
    chapterKey: chapter.key,
    chapterName: chapter.name,
    stageInChapter,
    name: `第 ${chapter.id}-${stageInChapter} 关 · ${getStageTitle(clampedStage, chapter.id, isBossStage)}`,
    theme: chapter.theme,
    isMilestone,
    isBossStage,
    bossName: isBossStage ? chapter.bossName : null,
    topologyId,
    path: topology.path,
    buildSlots: getStageSpecificSlots(topology.buildSlots, clampedStage, stageInChapter, chapter.id),
    traps: getStageSpecificTraps(topology.traps, clampedStage, stageInChapter, topology.path),
    subStageIndex: (stageInChapter - 1) % 5,
    timeOfDay: ['dawn', 'noon', 'amber_dusk', 'twilight', 'midnight'][(stageInChapter - 1) % 5],
    waveCount,
    waves,
    startingGold,
    baseHp: 20,
    starCriteria: {
      star1: '击退所有波次防守成功',
      star2: '母巢核心生命值 ≥ 80% (剩余 ≥ 16)',
      star3: '母巢核心生命值 100% 完美无损 (剩余 20)',
    },
    rewards: {
      firstClearGold: 50 + clampedStage * 5,
      starsMax: 3,
    },
  };
}

function getStageTitle(stageId, chapterId, isBossStage) {
  if (stageId === 1) return '林间幽径 · 新手启程';
  if (stageId === 99) return '帝国终审 · 世纪终焉决战';
  if (isBossStage) return `${CHAPTERS_META[chapterId - 1]?.bossName || '章节霸主'}降临`;

  const titlesByChapter = {
    1: ['林间幽径', '绿意苗圃', '毒沼活泉', '古木栈桥', '巡逻哨所', '荆棘密林', '清泉苔地', '迷雾回廊', '先锋哨塔', '骑士防线', '苍翠幽谷', '母巢前哨', '毒蚀沼泽', '狂暴林地', '重装巡逻', '绿茸湿地', '帝国封锁', '古树核心', '先遣突围'],
    2: ['冰原边缘', '霜白冻土', '裂谷回风', '冰川小径', '雪狼峡谷', '苍白荒原', '极寒冰隙', '风雪回廊', '寒冰前哨', '雪原突袭', '凛风隘口', '冰晶矿洞', '冻土要塞', '冰霜哨所', '雪崩要塞', '极光冰湖', '寒潮防线', '冰蚀古道', '暴雪突围'],
    3: ['焦土荒原', '熔岩裂隙', '地热气孔', '黑曜石径', '熔炉前哨', '烈焰回廊', '火山口下', '炽热焦土', '熔岩巨桥', '自爆工兵', '赤炎峡谷', '熔火回廊', '地核裂隙', '硫磺熔坑', '烈焰要塞', '炽晶矿脉', '重装装甲', '地热喷涌', '熔岩狂潮'],
    4: ['浮空碎石', '雷鸣裂谷', '超导晶矿', '悬浮废墟', '紫金云海', '奥术前哨', '晶体回廊', '电网要塞', '双路夹击', '虚空裂隙', '苍穹神殿', '雷暴回廊', '超导枢纽', '晶石风暴', '暗影潜行', '极光要塞', '奥术洪流', '虚空前哨', '雷鸣天穹'],
    5: ['王城外围', '大理石阶', '圣殿回廊', '神圣要塞', '皇家广场', '禁魔要塞', '圣光回廊', '十字枢纽', '教皇卫队', '黄金圣堂', '帝国神殿', '双路神卫', '审判要塞', '王城心腹', '终焉回廊', '圣光禁区', '最后防线', '至高神殿'],
  };
  const list = titlesByChapter[chapterId] || titlesByChapter[1];
  const idx = ((stageId - 1) % list.length);
  return list[idx] || '防守要塞';
}

// 精英兵种只在第 3 波及以后进场（开局经济挡不住满编制重装），并按类型修正编制/间隔：
// 重装少而慢、群袭多而密、支援（治疗光环叠加）必须零散、裂殖者死亡会翻倍需限量
const GROUP_TUNING = {
  tank: { countScale: 0.4, minCount: 2, minInterval: 0.85 },
  swarm: { countScale: 1.5, maxInterval: 0.45 },
  support: { countScale: 0.35, minCount: 1, minInterval: 1.0 },
  splitter: { countScale: 0.7, minCount: 2 },
  emp: { countScale: 0.3, minCount: 1, minInterval: 1.5 },
};

function tuneEnemyGroup(type, count, interval) {
  const tuning = GROUP_TUNING[type];
  if (!tuning) return { count, interval };
  return {
    count: Math.max(tuning.minCount ?? 1, Math.round(count * tuning.countScale)),
    interval: Math.min(Math.max(interval, tuning.minInterval ?? 0), tuning.maxInterval ?? Infinity),
  };
}

function generateStageWaves(stageId, chapterId, waveCount, isBossStage) {
  // Stage 1 Tutorial Wave Pacing（教学关保持温和，但疾行者用正确的真实类型）
  if (stageId === 1) {
    return [
      {
        wave: 1,
        preview: { title: '第 1 波 · 巡逻斥候', count: 4 },
        groups: [{ type: 'grunt', count: 4, interval: 1.8, scale: 0.85 }],
      },
      {
        wave: 2,
        preview: { title: '第 2 波 · 探路小队', count: 6 },
        groups: [{ type: 'grunt', count: 6, interval: 1.6, scale: 0.9 }],
      },
      {
        wave: 3,
        preview: { title: '第 3 波 · 疾行斥候', count: 7 },
        groups: [
          { type: 'grunt', count: 4, interval: 1.5, scale: 0.95 },
          { type: 'runner', count: 3, interval: 1.4, gap: 1.0, scale: 0.9 },
        ],
      },
      {
        wave: 4,
        preview: { title: '第 4 波 · 先遣决胜', count: 9 },
        groups: [
          { type: 'grunt', count: 5, interval: 1.4, scale: 1.0 },
          { type: 'runner', count: 4, interval: 1.2, gap: 1.0, scale: 0.95 },
        ],
      },
    ];
  }

  const waves = [];
  // 敌种池随关卡进度解锁：runner 全程参战，重装第 8 关起逼穿透选择，群袭第 14 关起施压数量，电磁傀儡第 22 关起瘫痪守卫
  const basePool = ['grunt', 'runner', 'shield', 'support', 'splitter'];
  const elitePool = [];
  if (stageId >= 8) elitePool.push('tank');
  if (stageId >= 14) elitePool.push('swarm');
  if (stageId >= 22) elitePool.push('emp');
  // 精英兵种只在第 3 波及以后进场（开局经济挡不住满编制重装），并按类型修正编制/间隔：
  // 重装少而慢、群袭多而密、支援（治疗光环叠加）必须零散、裂殖者死亡会翻倍需限量
  const pickType = (offset, waveNumber) => {
    const pool = waveNumber >= 3 ? basePool.concat(elitePool) : basePool;
    return pool[offset % pool.length];
  };
  const tuneGroup = tuneEnemyGroup;

  for (let w = 1; w <= waveCount; w++) {
    const isFinalWave = w === waveCount;
    const groups = [];
    // 成长曲线对齐玩家每波一张突变卡的乘法成长（原 0.038/0.030 过平）。
    // 关卡系数分两段释放：基底让开局波始终可防守，关卡爬坡在前 5 波内逐步吃满，压力滚向阶段后段
    const scale = 1.05
      + (stageId - 1) * 0.04
      + (stageId - 1) * 0.045 * Math.min((w - 1) / 4, 1)
      + (w - 1) * 0.06;

    if (isFinalWave && isBossStage) {
      groups.push({
        type: 'boss',
        count: stageId === 99 ? 2 : 1,
        interval: 3.5,
        gap: 2.0,
        scale: scale * 1.25,
      });
      groups.push({
        type: chapterId >= 3 ? 'shield' : 'runner',
        count: 4 + Math.floor(stageId / 15),
        interval: 0.9,
        scale,
      });
    } else {
      const mainType = pickType(w + stageId, w);
      const count = 6 + Math.floor(w * 1.4) + Math.floor(stageId * 0.06 * w * Math.min((w - 1) / 3, 1));
      const mainInterval = Math.max(0.70, 1.45 - w * 0.04);
      const mainTuned = tuneGroup(mainType, count, mainInterval);
      groups.push({
        type: mainType,
        count: mainTuned.count,
        interval: mainTuned.interval,
        scale,
      });

      if (w >= 3) {
        const subType = pickType(w + stageId + 2, w);
        const subTuned = tuneGroup(subType, 3 + Math.floor(w * 0.7), 1.15);
        groups.push({
          type: subType,
          count: subTuned.count,
          interval: subTuned.interval,
          gap: 1.2,
          scale,
        });
      }
    }

    waves.push({
      wave: w,
      preview: {
        title: isFinalWave ? (isBossStage ? '首领终局' : '决胜波次') : `第 ${w} 波次`,
        count: groups.reduce((acc, g) => acc + g.count, 0),
      },
      groups,
    });
  }

  return waves;
}
