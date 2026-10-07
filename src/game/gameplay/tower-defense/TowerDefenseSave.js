import { CAMPAIGN_TOWER_UNLOCKS } from './TowerDefenseContent.js';
/**
 * TowerDefenseSave.js
 * LocalStorage Save & Progress Persistence for Campaign
 */


const STORAGE_KEY = 'slime_rampage_td_campaign_save_v2';

export function createDefaultSave() {
  return {
    unlockedStage: 1,
    stageStars: {}, // { stageId: stars (1..3) }
    claimedChests: [], // [stageMilestoneId]
    unlockedTowers: ['rapid', 'slow'],
    tutorialCompleted: false,
    endlessBestWave: 0,
    totalStarsEarned: 0,
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
    for (const [type, stage] of Object.entries(CAMPAIGN_TOWER_UNLOCKS)) {
      if (maxStage >= stage && !unlockedTowers.includes(type)) unlockedTowers.push(type);
    }

    const save = {
      ...def,
      ...parsed,
      stageStars: { ...parsed.stageStars },
      claimedChests: Array.isArray(parsed.claimedChests) ? parsed.claimedChests : [],
      unlockedTowers,
      tutorialCompleted: !!parsed.tutorialCompleted,
    };
    return save;
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

  for (const [type, stage] of Object.entries(CAMPAIGN_TOWER_UNLOCKS)) {
    if (save.unlockedStage >= stage && !save.unlockedTowers.includes(type)) save.unlockedTowers.push(type);
  }

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
