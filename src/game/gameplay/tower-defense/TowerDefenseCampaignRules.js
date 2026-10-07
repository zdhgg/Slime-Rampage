import { getStageMiniBoss } from './TowerDefenseMiniBosses.js';
import { getCampaignProgression } from './TowerDefenseProgression.js';
import { CHAPTER_TACTICS, ASSAULT_PATTERNS, ENEMY_UNLOCKS } from './TowerDefenseContent.js';
/**
 * TowerDefenseCampaignRules.js
 * 5 Thematic Biomes & 99 Stages Campaign Progression Configuration
 */

import { fitTowerDefenseSlots } from './TowerDefenseLayout.js';
import { getCampaignWaveCount, shapeCampaignWaves, describeTeachingWaves } from './TowerDefensePacing.js';

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
    recommendedTypes: ['slow', 'thorn', 'shock'],
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
    recommendedTypes: ['beacon', 'shock'],
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
    recommendedTypes: ['rapid', 'blast', 'slow', 'ballista'],
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
    const x = Math.max(0.06, Math.min(0.94, Number((slot.x + microX).toFixed(3))));
    const y = Math.max(0.08, Math.min(0.92, Number((slot.y + microY).toFixed(3))));

    return {
      slotIndex: idx,
      x,
      y,
      leyline,
      locked: isLocked,
      cost: isLocked ? cost : 0,
      reward: 0,
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

export function getStageConfig(stageId, { endless = false } = {}) {
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
  const waveCount = getCampaignWaveCount(clampedStage);

  const startingGold = clampedStage <= 5 ? 240 : 230 + (chapter.id - 1) * 65;
  const waves = generateStageWaves(clampedStage, chapter.id, waveCount, isBossStage);
  const introductory = clampedStage === 1 && !endless;
  const progression = getCampaignProgression(clampedStage, { endless });
  const trapFeatures = { spore_shroom: 'sporeTrap', slime_geyser: 'geyserTrap', hive_crystal: 'crystalTrap' };
  const traps = getStageSpecificTraps(topology.traps, clampedStage, stageInChapter, topology.path)
    .filter(trap => progression[trapFeatures[trap.id]]);
  let slotSeeds = clampedStage <= 5 && !endless
    ? [{ x: 0.20, y: 0.33 }, { x: 0.38, y: 0.31 }, { x: 0.53, y: 0.62 }, { x: 0.76, y: 0.61 }, { x: 0.85, y: 0.34 }, { x: 0.12, y: 0.60 }]
      .slice(0, clampedStage === 1 ? 4 : clampedStage <= 3 ? 5 : 6)
      .map((slot, slotIndex) => ({ ...slot, slotIndex, leyline: 'none', locked: false, cost: 0, reward: 0 }))
    : getStageSpecificSlots(topology.buildSlots, clampedStage, stageInChapter, chapter.id);
  if (!endless && clampedStage >= 6 && clampedStage <= 12) {
    slotSeeds = topology.buildSlots.slice(0, clampedStage <= 7 ? 7 : 8)
      .map((slot, slotIndex) => ({ ...slot, slotIndex, locked: false, cost: 0, reward: 0,
        leyline: progression.leylines && slotIndex < 2 ? ['acid', 'frost'][slotIndex] : 'none' }));
  }
  // Delaying the clearing lesson must not remove established combat positions.
  if (!endless && clampedStage >= 13 && !progression.clearing) {
    slotSeeds = slotSeeds.map(slot => ({ ...slot, locked: false, cost: 0, reward: 0 }));
  }

  return {
    stageId: clampedStage,
    tactic: progression.lesson ? { name: progression.lesson.name, description: progression.lesson.hint } : CHAPTER_TACTICS[chapter.id - 1],
    assault: progression.lesson || ASSAULT_PATTERNS[(clampedStage - 1) % 5],
    progression,
    topologyName: topology.name,
    chapterId: chapter.id,
    chapterKey: chapter.key,
    chapterName: chapter.name,
    stageInChapter,
    name: `第 ${chapter.id}-${stageInChapter} 关 · ${getStageTitle(clampedStage, chapter.id, isBossStage)}`,
    theme: chapter.theme,
    isMilestone,
    isBossStage,
    miniBoss: getStageMiniBoss(clampedStage),
    bossName: isBossStage ? chapter.bossName : null,
    topologyId,
    introductory,
    path: topology.path,
    buildSlots: fitTowerDefenseSlots(slotSeeds, topology.path, traps),
    traps,
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
  // One gentle wave, then compact squads that require a second line of fire.
  if (stageId === 1) {
    return describeTeachingWaves([
      {
        wave: 1,
        intermission: 8,
        preview: { title: '第 1 波 · 巡逻斥候', count: 4 },
        groups: [{ type: 'grunt', count: 4, interval: 1.8, scale: 0.85 }],
      },
      {
        wave: 2,
        intermission: 8,
        preview: { title: '第 2 波 · 小队集结', count: 10 },
        groups: [{ type: 'grunt', count: 10, interval: 0.5, scale: 0.9, rewardScale: 0.6 }],
      },
      {
        wave: 3,
        intermission: 6,
        preview: { title: '第 3 波 · 前后段协防', count: 24 },
        groups: Array.from({ length: 24 }, (_, index) => ({
          type: index % 3 === 2 ? 'runner' : 'grunt', count: 1, interval: 0.18, gap: 0, scale: 0.95, rewardScale: 0.6,
        })),
      },
      {
        wave: 4,
        preview: { title: '第 4 波 · 防线检验', count: 32 },
        groups: Array.from({ length: 32 }, (_, index) => ({
          type: index % 3 === 2 ? 'runner' : 'grunt', count: 1, interval: 0.14, gap: 0, scale: 1.0, rewardScale: 0.6,
        })),
      },
    ]);
  }

  // The first five stages are lessons, with time to observe each new counter.
  if (stageId <= 5) {
    const counts = { 2: [6, 12, 24, 32], 3: [8, 14, 24, 34], 4: [8, 12, 16, 22, 28], 5: [8, 12, 18, 24, 32] }[stageId];
    const miniBoss = getStageMiniBoss(stageId);
    return describeTeachingWaves(counts.map((count, index) => {
      const wave = index + 1;
      const scale = .88 + (stageId - 2) * .045 + index * .055;
      const interval = (counts.length === 4 ? [.9, .5, .18, .14] : [.9, .5, .3, .18, .14])[index];
      const groups = Array.from({ length: count }, (_, n) => ({
        type: stageId >= 3 && wave >= 3 && n >= count - (wave === 3 ? 2 : 4)
          ? 'swarm' : n % 4 === 3 ? 'runner' : 'grunt',
        count: 1, interval, gap: 0, scale, rewardScale: 0.6,
      }));
      const final = wave === counts.length;
      if (final && miniBoss) groups.splice(Math.floor(count / 3), 7,
        { type: miniBoss.baseType, miniBoss, count: 1, interval: 1.5, scale },
        ...miniBoss.escorts.map(type => ({ type, count: 1, interval: 1.2, scale })));
      const title = final && miniBoss ? `小首领 · ${miniBoss.name}`
        : stageId === 3 && wave >= 3 ? '群袭小队 · 练习范围清场'
        : `第 ${wave} 波 · ${final ? '防线检验' : '巡逻小队'}`;
      return { wave, reward: 22 + wave * 3, preview: { title, count: groups.length }, groups };
    }));
  }

  const waves = [];
  const chapter = CHAPTER_TACTICS[chapterId - 1];
  const pool = chapter.pool.filter(type => (ENEMY_UNLOCKS[type] || 1) <= stageId);
  const available = types => types.filter(type => (ENEMY_UNLOCKS[type] || 1) <= stageId);
  const recipes = [available(['runner', 'sprinter', 'stalker', 'grunt']), available(['shield', 'warder', 'support', 'tank']), available(['swarm', 'splitter', 'broodmother', 'grunt']), available(['tank', 'regenerator', 'berserker', 'siege']), pool];
  const stagePattern = (stageId - 1) % 5;
  const miniBoss = getStageMiniBoss(stageId);
  for (let w = 1; w <= waveCount; w++) {
    const pattern = (stagePattern + w - 1) % 5;
    const recipe = recipes[pattern].length ? recipes[pattern] : ['grunt', 'runner'];
    const final = w === waveCount;
    // Early waves leave room to deploy; pressure grows within the match, not exponentially across 99 stages.
    const ramp = Math.min((w - 1) / 4, 1);
    const onboarding = Math.max(0, (10 - stageId) / 5);
    const scale = (.90 + Math.min(stageId - 1, 19) * .018 + (chapterId - 1) * .025 + (w - 1) * .14 + ramp * Math.min(stageId / 15, 1) * .45) * (1 - onboarding * .16);
    const count = Math.round((7 + w * 2 + Math.floor(Math.min(stageId, 30) / 12) + Math.floor((chapterId - 1) * ramp)) * (1 - onboarding * .35));
    const interval = Math.max(.25, .88 - Math.min(stageId, 20) * .014 - (w - 1) * .028) * (1 + onboarding * .70) * (stageId >= 13 && w >= 4 ? .80 : 1) * (chapterId === 5 ? 1.12 : 1);
    const groups = [];
    const newTypes = pool.filter(type => ENEMY_UNLOCKS[type] === stageId);
    const introducedCounts = {};
    for (let n = 0; n < count; n++) {
      // Alternate chapter specialists with each wave's tactical formation.
      let type = n % 3 === 1 ? pool[(stageId + w + Math.floor(n / 3)) % pool.length] : recipe[(Math.floor(n / 3) + w) % recipe.length];
      if (w <= 2 && ['tank', 'siege', 'broodmother'].includes(type)) type = chapterId === 1 ? 'grunt' : 'shield';
      // Auxiliary units must not outnumber the line they support.
      if (['support', 'warder', 'emp', 'siege'].includes(type) && n % 4 !== 1) type = pool.find(t => !['support', 'warder', 'emp', 'siege'].includes(t)) || 'grunt';
      // Preview a new enemy in a small group after two familiar warm-up waves.
      if (w >= 3 && n === Math.floor(count / 2) && newTypes.length) type = newTypes[0];
      if (ENEMY_UNLOCKS[type] === stageId) {
        const limit = w === 3 ? 1 : 2;
        if (w <= 2 || (introducedCounts[type] || 0) >= limit) type = 'grunt';
        else introducedCounts[type] = (introducedCounts[type] || 0) + 1;
      }
      groups.push({ type, count: 1, interval: interval * (['tank', 'siege', 'broodmother'].includes(type) ? 1.5 : 1), gap: 0, scale, rewardScale: .80 });
    }
    if (final && (isBossStage || stageId % 5 === 0)) {
      if (isBossStage) groups.splice(Math.floor(count / 2), 0, { type: 'boss', count: stageId === 99 ? 2 : 1, interval: 1.8, scale: scale * .40, rewardScale: .5, bossChapter: chapterId, bossName: CHAPTERS_META[chapterId - 1].bossName, coreDamage: 20 });
      else if (miniBoss) {
        // Replace part of the ordinary final wave; do not append a full boss encounter on top.
        const cutAt = Math.floor(count / 3);
        groups.splice(cutAt, 7,
          { type: miniBoss.baseType, miniBoss, count: 1, interval: .25, gap: 0, scale },
          ...miniBoss.escorts.map(type => ({ type, count: 1, interval: .25, gap: 0, scale, rewardScale: .8 })));
      }
    }
    waves.push({ wave: w, reward: 22 + w * 3, preview: { title: final ? (isBossStage ? '章节首领' : miniBoss ? `小首领 · ${miniBoss.name}` : '决胜波次') : ASSAULT_PATTERNS[pattern].name, count: groups.reduce((sum, g) => sum + g.count, 0) }, groups });
  }
  return shapeCampaignWaves(stageId, chapterId, waves);
}
