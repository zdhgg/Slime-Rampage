/**
 * TowerDefenseSave.js
 * LocalStorage Save & Progress Persistence for Campaign & Gene Tree
 */

import { GENE_TREE_NODES } from './TowerDefenseCampaignRules.js';

const STORAGE_KEY = 'slime_rampage_td_campaign_save_v1';

export function createDefaultSave() {
  return {
    unlockedStage: 1,
    stageStars: {}, // { stageId: stars (1..3) }
    claimedChests: [], // [stageMilestoneId]
    unlockedTowers: ['rapid', 'slow'],
    tutorialCompleted: false,
    endlessBestWave: 0,
    geneTalents: {
      talent_gold: 0,
      talent_leyline: 0,
      talent_trap_cd: 0,
      talent_pet_morale: 0,
      talent_leap_shield: 0,
    },
    totalStarsEarned: 0,
    starsSpent: 0,
  };
}

export function loadCampaignSave() {
  try {
    if (typeof localStorage === 'undefined') return createDefaultSave();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultSave();
    const parsed = JSON.parse(raw);
    const def = createDefaultSave();
    const unlockedTowers = Array.isArray(parsed.unlockedTowers) ? parsed.unlockedTowers : ['rapid', 'slow'];
    const maxStage = Number(parsed.unlockedStage) || 1;
    if (maxStage >= 2 && !unlockedTowers.includes('blast')) unlockedTowers.push('blast');
    if (maxStage >= 5 && !unlockedTowers.includes('shock')) unlockedTowers.push('shock');
    if (maxStage >= 21 && !unlockedTowers.includes('arcane')) unlockedTowers.push('arcane');
    if (maxStage >= 41 && !unlockedTowers.includes('radiant')) unlockedTowers.push('radiant');

    return {
      ...def,
      ...parsed,
      stageStars: { ...parsed.stageStars },
      claimedChests: Array.isArray(parsed.claimedChests) ? parsed.claimedChests : [],
      unlockedTowers,
      tutorialCompleted: !!parsed.tutorialCompleted,
      geneTalents: { ...def.geneTalents, ...(parsed.geneTalents || {}) },
    };
  } catch {
    return createDefaultSave();
  }
}

export function saveCampaignProgress(saveData) {
  try {
    if (typeof localStorage === 'undefined' || !saveData) return;
    // Calculate total stars
    let totalStars = 0;
    for (const stars of Object.values(saveData.stageStars || {})) {
      totalStars += Number(stars) || 0;
    }
    saveData.totalStarsEarned = totalStars;

    // Calculate spent stars
    let spent = 0;
    for (const node of GENE_TREE_NODES) {
      const level = saveData.geneTalents?.[node.id] || 0;
      for (let i = 0; i < level; i++) {
        spent += node.costs[i] || 0;
      }
    }
    saveData.starsSpent = spent;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(saveData));
  } catch (err) {
    console.warn('[TowerDefenseSave] save failed', err);
  }
}

export function recordStageClear(stageId, baseHpRemaining, baseHpMax = 20) {
  const save = loadCampaignSave();
  const sid = Number(stageId) || 1;

  // Calculate stars:
  // 3 stars: 100% HP (20/20)
  // 2 stars: >= 80% HP (>= 16)
  // 1 star: cleared
  let stars = 1;
  const ratio = (Number(baseHpRemaining) || 1) / (Number(baseHpMax) || 20);
  if (ratio >= 0.999) {
    stars = 3;
  } else if (ratio >= 0.799) {
    stars = 2;
  }

  const prevStars = save.stageStars[sid] || 0;
  if (stars > prevStars) {
    save.stageStars[sid] = stars;
  }

  // Unlock next stage & new slime towers if cleared
  if (save.unlockedStage <= sid && sid < 99) {
    save.unlockedStage = sid + 1;
  }

  if (sid >= 1 && !save.unlockedTowers.includes('blast')) save.unlockedTowers.push('blast');
  if (sid >= 4 && !save.unlockedTowers.includes('shock')) save.unlockedTowers.push('shock');
  if (sid >= 20 && !save.unlockedTowers.includes('arcane')) save.unlockedTowers.push('arcane');
  if (sid >= 40 && !save.unlockedTowers.includes('radiant')) save.unlockedTowers.push('radiant');

  if (sid === 1) {
    save.tutorialCompleted = true;
  }

  saveCampaignProgress(save);
  return {
    stars,
    isNewRecord: stars > prevStars,
    unlockedNext: save.unlockedStage,
    unlockedTowers: save.unlockedTowers,
    totalStars: save.totalStarsEarned,
  };
}

export function completeTutorial() {
  const save = loadCampaignSave();
  save.tutorialCompleted = true;
  saveCampaignProgress(save);
  return save;
}

export function recordEndlessWave(waveReached) {
  const save = loadCampaignSave();
  const wave = Math.max(0, Math.floor(Number(waveReached) || 0));
  const prev = save.endlessBestWave || 0;
  if (wave > prev) {
    save.endlessBestWave = wave;
    saveCampaignProgress(save);
    return { best: wave, isNewRecord: true };
  }
  return { best: prev, isNewRecord: false };
}

export function upgradeGeneTalent(talentId) {
  const save = loadCampaignSave();
  const node = GENE_TREE_NODES.find((n) => n.id === talentId);
  if (!node) return { success: false, reason: '未找到天赋节点' };

  const curLevel = save.geneTalents[talentId] || 0;
  if (curLevel >= node.maxLevel) return { success: false, reason: '已达最高等级' };

  const cost = node.costs[curLevel];
  const availableStars = (save.totalStarsEarned || 0) - (save.starsSpent || 0);
  if (availableStars < cost) return { success: false, reason: `星星不足（需要 ${cost} 颗，当前剩余 ${availableStars} 颗）` };

  save.geneTalents[talentId] = curLevel + 1;
  saveCampaignProgress(save);
  return { success: true, newLevel: curLevel + 1, save };
}

export function resetGeneTalents() {
  const save = loadCampaignSave();
  for (const node of GENE_TREE_NODES) {
    save.geneTalents[node.id] = 0;
  }
  save.starsSpent = 0;
  saveCampaignProgress(save);
  return { success: true, save };
}

export function getActiveGeneEffects(saveData = null) {
  const save = saveData || loadCampaignSave();
  const effects = {
    startingGoldBonus: 0,
    leylineBoostMultiplier: 1,
    trapCooldownMultiplier: 1,
    moraleDuration: 4,
    moraleSpeedBoost: 0.15,
    relocateCooldown: 8,
    leapBuff: false,
  };

  for (const node of GENE_TREE_NODES) {
    const level = save.geneTalents?.[node.id] || 0;
    if (level > 0 && typeof node.effect === 'function') {
      const res = node.effect(level);
      Object.assign(effects, res);
    }
  }

  return effects;
}
