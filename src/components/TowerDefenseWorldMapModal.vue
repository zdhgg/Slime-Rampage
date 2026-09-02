<script setup>
import { computed, ref, onMounted } from 'vue'
import {
  Star,
  Shield,
  Lock,
  Unlock,
  Crown,
  Gift,
  Sparkles,
  Play,
  X,
  ChevronRight,
  Compass,
  AlertTriangle,
  Coins,
  Flame,
  Zap,
  Snowflake,
  Trees,
  CheckCircle2,
} from 'lucide-vue-next'
import { CHAPTERS_META, getStageConfig } from '../game/gameplay/tower-defense/TowerDefenseCampaignRules.js'
import { loadCampaignSave } from '../game/gameplay/tower-defense/TowerDefenseSave.js'
import TowerDefenseGeneTreeModal from './TowerDefenseGeneTreeModal.vue'

const emit = defineEmits(['start-stage', 'close'])

const save = ref(loadCampaignSave())
const activeChapterId = ref(1)
const selectedStageId = ref(null)
const showStageModal = ref(false)
const showGeneTree = ref(false)

onMounted(() => {
  save.value = loadCampaignSave()
  const unlocked = save.value.unlockedStage || 1
  const chapter = CHAPTERS_META.find((c) => unlocked >= c.stageRange[0] && unlocked <= c.stageRange[1])
  if (chapter) {
    activeChapterId.value = chapter.id
    selectedStageId.value = unlocked
  } else {
    activeChapterId.value = 1
    selectedStageId.value = 1
  }
})

function refreshSave() {
  save.value = loadCampaignSave()
}

const activeChapter = computed(() => {
  return CHAPTERS_META.find((c) => c.id === activeChapterId.value) || CHAPTERS_META[0]
})

const chapterStages = computed(() => {
  const [start, end] = activeChapter.value.stageRange
  const stages = []
  const maxUnlocked = save.value.unlockedStage || 1

  for (let sid = start; sid <= end; sid++) {
    const isUnlocked = maxUnlocked >= sid
    const isCurrent = maxUnlocked === sid
    const stars = save.value.stageStars[sid] || 0
    const isBoss = sid === activeChapter.value.bossStage || sid === 99
    const isTreasure = sid % 5 === 0 && !isBoss
    const config = getStageConfig(sid)

    let unlockReward = null
    if (sid === 2) unlockReward = '🔥 熔岩史莱姆'
    else if (sid === 5) unlockReward = '⚡ 雷鸣史莱姆'
    else if (sid === 21) unlockReward = '🔮 虚空史莱姆'
    else if (sid === 41) unlockReward = '☀️ 炽阳史莱姆'
    else if (isTreasure) unlockReward = '🎁 丰饶养分箱'
    else if (isBoss) unlockReward = '👑 章节霸主皇冠'

    stages.push({
      id: sid,
      stageNumber: sid - start + 1,
      name: config.name.split('·')[1]?.trim() || `第 ${sid} 关`,
      fullName: config.name,
      isUnlocked,
      isCurrent,
      stars,
      isBoss,
      isTreasure,
      topologyId: config.topologyId,
      waveCount: config.waveCount,
      startingGold: config.startingGold,
      rewardGold: config.rewards.firstClearGold,
      unlockReward,
      theme: activeChapter.value.theme,
    })
  }
  return stages
})

// Star collection in current chapter
const chapterStarStats = computed(() => {
  const [start, end] = activeChapter.value.stageRange
  let earned = 0
  const total = (end - start + 1) * 3
  for (let sid = start; sid <= end; sid++) {
    earned += save.value.stageStars[sid] || 0
  }
  return { earned, total, percent: Math.round((earned / total) * 100) }
})

const selectedStageConfig = computed(() => {
  if (!selectedStageId.value) return null
  return getStageConfig(selectedStageId.value)
})

const selectedStageStars = computed(() => {
  if (!selectedStageId.value) return 0
  return save.value.stageStars[selectedStageId.value] || 0
})

const selectedStageIsUnlocked = computed(() => {
  if (!selectedStageId.value) return false
  return (save.value.unlockedStage || 1) >= selectedStageId.value
})

function onSelectStage(stage) {
  selectedStageId.value = stage.id
  showStageModal.value = true
}

function onStartSelectedStage() {
  if (!selectedStageId.value || !selectedStageIsUnlocked.value) return
  showStageModal.value = false
  emit('start-stage', selectedStageId.value)
}

function selectChapter(chapterId) {
  activeChapterId.value = chapterId
  const ch = CHAPTERS_META.find((c) => c.id === chapterId)
  if (ch) {
    const unlocked = save.value.unlockedStage || 1
    if (unlocked >= ch.stageRange[0] && unlocked <= ch.stageRange[1]) {
      selectedStageId.value = unlocked
    } else {
      selectedStageId.value = ch.stageRange[0]
    }
  }
}
</script>

<template>
  <div class="world-map-overlay" role="dialog" aria-modal="true" aria-label="母巢防卫战闯关地图">
    <!-- Top Global Bar -->
    <header class="map-header">
      <div class="header-branding">
        <span class="branding-icon">🗺️</span>
        <div>
          <h1>母巢防线 · 99关战役大地图</h1>
          <p>驱逐帝国军团，收复五大母巢生态领地</p>
        </div>
      </div>

      <div class="header-actions">
        <button class="gene-tree-btn" type="button" @click="showGeneTree = true">
          <span>🧬</span>
          <span>母巢基因天赋库</span>
          <b class="star-chip"><Star :size="13" class="star-gold" />{{ save.totalStarsEarned || 0 }}</b>
        </button>
        <button class="close-map-btn" type="button" @click="emit('close')" aria-label="关闭大地图">
          <X :size="20" />
        </button>
      </div>
    </header>

    <!-- 5 Chapter Selector Tabs -->
    <nav class="chapter-tabs" aria-label="章节选择">
      <button
        v-for="ch in CHAPTERS_META"
        :key="ch.id"
        class="chapter-tab"
        :class="{
          active: activeChapterId === ch.id,
          locked: (save.unlockedStage || 1) < ch.stageRange[0],
        }"
        :style="{ '--ch-color': ch.theme.badgeColor }"
        type="button"
        @click="selectChapter(ch.id)"
      >
        <span class="tab-icon">{{ ch.icon }}</span>
        <div class="tab-copy">
          <strong>第 {{ ch.id }} 章 · {{ ch.name.split('·')[0].trim() }}</strong>
          <small>第 {{ ch.stageRange[0] }} ~ {{ ch.stageRange[1] }} 关</small>
        </div>
      </button>
    </nav>

    <!-- Main Map Viewport & Interactive Stage Journey -->
    <div class="map-viewport" :class="activeChapter.key">
      <!-- Ambient Thematic Background Visuals -->
      <div class="biome-scenery" :class="activeChapter.key">
        <div class="scenery-glow" />
      </div>

      <!-- Main Stage Exploration Layout -->
      <div class="map-content-area">
        <!-- Chapter Header & Star Reward Milestone Track -->
        <section class="chapter-overview-card" :style="{ borderColor: activeChapter.theme.badgeColor }">
          <div class="overview-left">
            <div class="chapter-title-row">
              <span class="chapter-icon-badge">{{ activeChapter.icon }}</span>
              <div>
                <h2>{{ activeChapter.name }}</h2>
                <p>{{ activeChapter.subtitle }}</p>
              </div>
            </div>
            <div class="boss-intel-tag">
              <span>终极霸主:</span>
              <strong>{{ activeChapter.bossName }}</strong>
            </div>
          </div>

          <div class="overview-right">
            <div class="star-progress-header">
              <span>本章星级探索度</span>
              <strong><Star :size="13" class="star-gold" />{{ chapterStarStats.earned }} / {{ chapterStarStats.total }} ({{ chapterStarStats.percent }}%)</strong>
            </div>
            <div class="star-progress-bar">
              <div class="star-progress-fill" :style="{ width: `${chapterStarStats.percent}%`, background: activeChapter.theme.badgeColor }" />
            </div>
            <div class="star-milestones-row">
              <span class="milestone-item" :class="{ completed: chapterStarStats.earned >= 15 }">🎁 15星宝箱</span>
              <span class="milestone-item" :class="{ completed: chapterStarStats.earned >= 30 }">🎁 30星宝箱</span>
              <span class="milestone-item" :class="{ completed: chapterStarStats.earned >= 45 }">🎁 45星宝箱</span>
              <span class="milestone-item" :class="{ completed: chapterStarStats.earned >= 60 }">👑 60星通关</span>
            </div>
          </div>
        </section>

        <!-- Dynamic Winding Stage Trail (4 Rows x 5 Nodes) -->
        <div class="adventure-trail-scroll">
          <div class="adventure-trail-grid">
            <div
              v-for="(stg, index) in chapterStages"
              :key="stg.id"
              class="stage-trail-cell"
            >
              <!-- Stage Landmark Node Button -->
              <button
                class="stage-landmark-btn"
                :class="{
                  unlocked: stg.isUnlocked,
                  locked: !stg.isUnlocked,
                  selected: selectedStageId === stg.id,
                  current: stg.isCurrent,
                  boss: stg.isBoss,
                  treasure: stg.isTreasure,
                }"
                type="button"
                @click="onSelectStage(stg)"
              >
                <!-- Current Challenge Beacon Indicator -->
                <div v-if="stg.isCurrent" class="current-indicator">
                  <span>⚔️ 目标</span>
                </div>

                <!-- Main Portal / Landmark Shape -->
                <div class="landmark-body">
                  <Crown v-if="stg.isBoss" :size="24" class="landmark-icon boss-crown" />
                  <Gift v-else-if="stg.isTreasure" :size="20" class="landmark-icon treasure-gift" />
                  <Lock v-else-if="!stg.isUnlocked" :size="18" class="landmark-icon lock-icon" />
                  <span v-else class="stage-badge-number">{{ stg.stageNumber }}</span>
                </div>

                <!-- Stage Number & Name Label -->
                <div class="landmark-info">
                  <strong class="landmark-title">
                    {{ activeChapter.id }}-{{ stg.stageNumber }} {{ stg.name }}
                  </strong>
                  <!-- Reward / Sneak Peek Chip -->
                  <span v-if="stg.unlockReward" class="landmark-reward-chip" :class="{ boss: stg.isBoss, gift: stg.isTreasure }">
                    {{ stg.unlockReward }}
                  </span>
                </div>

                <!-- Star Rating Badge -->
                <div class="landmark-stars">
                  <Star
                    v-for="s in 3"
                    :key="s"
                    :size="11"
                    :class="{ earned: stg.stars >= s, unearned: stg.stars < s }"
                  />
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Interactive Stage Briefing & Battle Preparation Modal Dialog -->
    <Transition name="modal-fade">
      <div v-if="showStageModal && selectedStageConfig" class="stage-modal-backdrop" @click.self="showStageModal = false">
        <div class="stage-modal-card" :class="{ 'is-locked': !selectedStageIsUnlocked, 'is-boss': selectedStageConfig.isBossStage }">
          <!-- Modal Header -->
          <div class="modal-card-header">
            <div class="modal-badge-row">
              <span class="chapter-tag">{{ selectedStageConfig.chapterName }}</span>
              <span v-if="selectedStageConfig.isBossStage" class="boss-tag">👑 章节霸主关</span>
              <span v-else class="normal-tag">第 {{ activeChapter.id }}-{{ selectedStageConfig.stageInChapter }} 关</span>
            </div>
            <button class="modal-close-btn" type="button" @click="showStageModal = false" aria-label="关闭">
              <X :size="20" />
            </button>
          </div>

          <!-- Stage Name & Best Stars -->
          <div class="modal-title-section">
            <h2>{{ selectedStageConfig.name }}</h2>
            <div class="modal-stars-row">
              <div
                v-for="s in 3"
                :key="s"
                class="star-badge"
                :class="{ earned: selectedStageStars >= s }"
              >
                <Star :size="18" fill="currentColor" />
              </div>
              <span class="stars-label">{{ selectedStageStars > 0 ? `已获 ${selectedStageStars} 星评价` : '尚未通关' }}</span>
            </div>
          </div>

          <!-- Tactical Intelligence Recon Grid -->
          <div class="modal-recon-grid">
            <div class="recon-cell">
              <span class="cell-label">⚔️ 波次规模</span>
              <strong class="cell-value">{{ selectedStageConfig.waveCount }} 波入侵</strong>
            </div>
            <div class="recon-cell">
              <span class="cell-label">🌾 初始养分</span>
              <strong class="cell-value">{{ selectedStageConfig.startingGold }} 养分</strong>
            </div>
            <div class="recon-cell">
              <span class="cell-label">🗺️ 地形拓扑</span>
              <strong class="cell-value">{{ selectedStageConfig.topologyId }}</strong>
            </div>
            <div class="recon-cell">
              <span class="cell-label">🌿 推荐阵容</span>
              <strong class="cell-value">{{ activeChapter.recommendedTypes.join(' / ') }}</strong>
            </div>
          </div>

          <!-- Rewards & Special Unlocks -->
          <div class="modal-rewards-card">
            <div class="reward-title-row">
              <Sparkles :size="15" class="sparkle-icon" />
              <span>通关丰厚奖励</span>
            </div>
            <div class="rewards-list">
              <span class="reward-chip gold-chip"><Coins :size="13" /> 首通 +{{ selectedStageConfig.rewards.firstClearGold }} 养分</span>
              <span class="reward-chip star-chip"><Star :size="13" /> 最高 +3 颗基因星</span>
              <span v-if="selectedStageId === 2" class="reward-chip unlock-chip">🔥 解锁【熔岩史莱姆】基因</span>
              <span v-if="selectedStageId === 5" class="reward-chip unlock-chip">⚡ 解锁【雷鸣史莱姆】基因</span>
              <span v-if="selectedStageId === 21" class="reward-chip unlock-chip">🔮 解锁【虚空史莱姆】基因</span>
              <span v-if="selectedStageId === 41" class="reward-chip unlock-chip">☀️ 解锁【炽阳史莱姆】基因</span>
            </div>
          </div>

          <!-- 3-Star Objectives -->
          <div class="modal-criteria-section">
            <span class="criteria-title">⭐ 3 星评级挑战目标</span>
            <div class="criteria-item">
              <CheckCircle2 :size="14" class="check-icon" :class="{ done: selectedStageStars >= 1 }" />
              <span>{{ selectedStageConfig.starCriteria.star1 }}</span>
              <b class="star-count">⭐</b>
            </div>
            <div class="criteria-item">
              <CheckCircle2 :size="14" class="check-icon" :class="{ done: selectedStageStars >= 2 }" />
              <span>{{ selectedStageConfig.starCriteria.star2 }}</span>
              <b class="star-count">⭐⭐</b>
            </div>
            <div class="criteria-item">
              <CheckCircle2 :size="14" class="check-icon" :class="{ done: selectedStageStars >= 3 }" />
              <span>{{ selectedStageConfig.starCriteria.star3 }}</span>
              <b class="star-count">⭐⭐⭐</b>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="modal-action-row">
            <button
              v-if="selectedStageIsUnlocked"
              class="modal-start-btn"
              type="button"
              @click="onStartSelectedStage"
            >
              <Play :size="18" fill="currentColor" />
              <span>开启防御战</span>
            </button>
            <div v-else class="modal-locked-btn">
              <Lock :size="16" />
              <span>尚未解锁（需先通关第 {{ selectedStageId - 1 }} 关）</span>
            </div>
            <button class="modal-cancel-btn" type="button" @click="showStageModal = false">
              返回大地图
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Gene Tree Modal Dialog -->
    <Transition name="modal-fade">
      <TowerDefenseGeneTreeModal
        v-if="showGeneTree"
        @close="showGeneTree = false"
        @updated="refreshSave"
      />
    </Transition>
  </div>
</template>

<style scoped>
.world-map-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  background: #080f14;
  color: #eef5f2;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  overflow: hidden;
}

/* Header */
.map-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: rgba(10, 18, 24, 0.96);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 10;
}

.header-branding {
  display: flex;
  align-items: center;
  gap: 12px;
}

.branding-icon {
  font-size: 26px;
}

.header-branding h1 {
  margin: 0;
  font-size: 17px;
  color: #ffeaa7;
  font-weight: 800;
}

.header-branding p {
  margin: 2px 0 0;
  font-size: 11px;
  color: rgba(238, 245, 242, 0.65);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.gene-tree-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border: 1px solid #2ecc71;
  border-radius: 8px;
  background: rgba(46, 204, 113, 0.15);
  color: #2ecc71;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 0 12px rgba(46, 204, 113, 0.2);
  transition: all 0.15s ease;
}

.gene-tree-btn:hover {
  background: #2ecc71;
  color: #06120d;
}

.star-chip {
  display: flex;
  align-items: center;
  gap: 3px;
  color: #ffd166;
}

.star-gold {
  fill: #ffd166;
  color: #ffd166;
}

.close-map-btn {
  padding: 6px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  background: transparent;
  color: #dcdde1;
  cursor: pointer;
  transition: background 0.15s;
}

.close-map-btn:hover {
  background: rgba(255, 255, 255, 0.12);
}

/* Chapter Tabs */
.chapter-tabs {
  display: flex;
  gap: 8px;
  padding: 10px 24px;
  background: rgba(8, 14, 20, 0.95);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  overflow-x: auto;
  z-index: 10;
}

.chapter-tab {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: #eef5f2;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.chapter-tab:hover:not(.locked) {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.25);
}

.chapter-tab.active {
  border-color: var(--ch-color, #2ecc71);
  background: rgba(255, 255, 255, 0.12);
  box-shadow: 0 0 16px rgba(46, 204, 113, 0.25);
}

.chapter-tab.locked {
  opacity: 0.45;
  filter: grayscale(0.8);
}

.tab-icon {
  font-size: 20px;
}

.tab-copy strong {
  display: block;
  font-size: 13px;
  font-weight: 700;
}

.tab-copy small {
  font-size: 10px;
  color: rgba(238, 245, 242, 0.55);
}

/* Map Viewport */
.map-viewport {
  position: relative;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* Procedural Biome Themed Backgrounds */
.biome-scenery {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}

.biome-scenery.verdant {
  background: radial-gradient(circle at 50% 20%, #153326 0%, #0c1f17 50%, #06110c 100%);
}

.biome-scenery.glacial {
  background: radial-gradient(circle at 50% 20%, #152d42 0%, #0d1b28 50%, #060e16 100%);
}

.biome-scenery.volcanic {
  background: radial-gradient(circle at 50% 20%, #341710 0%, #200d09 50%, #100604 100%);
}

.biome-scenery.superconductor {
  background: radial-gradient(circle at 50% 20%, #261642 0%, #170d2a 50%, #0a0514 100%);
}

.biome-scenery.imperial {
  background: radial-gradient(circle at 50% 20%, #322612 0%, #1f170a 50%, #0e0a04 100%);
}

.scenery-glow {
  position: absolute;
  top: 10%;
  left: 20%;
  width: 60%;
  height: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.05) 0%, rgba(0,0,0,0) 70%);
}

/* Main Content Area */
.map-content-area {
  position: relative;
  z-index: 2;
  padding: 24px 32px 40px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1440px;
  margin: 0 auto;
  width: 100%;
}

/* Chapter Overview Card */
.chapter-overview-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 18px 24px;
  background: rgba(10, 18, 22, 0.88);
  border-left: 5px solid #2ecc71;
  border-radius: 12px;
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

.chapter-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.chapter-icon-badge {
  font-size: 28px;
}

.chapter-title-row h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: #ffffff;
}

.chapter-title-row p {
  margin: 2px 0 0;
  font-size: 12px;
  color: rgba(238, 245, 242, 0.7);
}

.boss-intel-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  background: rgba(231, 76, 60, 0.15);
  border: 1px solid rgba(231, 76, 60, 0.35);
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 11px;
}

.boss-intel-tag span {
  color: #ff7675;
}

.boss-intel-tag strong {
  color: #ffffff;
}

.overview-right {
  min-width: 320px;
}

.star-progress-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 12px;
}

.star-progress-bar {
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  overflow: hidden;
}

.star-progress-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.3s ease;
}

.star-milestones-row {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 10px;
  color: rgba(238, 245, 242, 0.45);
}

.milestone-item.completed {
  color: #ffd166;
  font-weight: 700;
}

/* Winding Adventure Trail Grid */
.adventure-trail-scroll {
  padding: 10px 0;
}

.adventure-trail-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 20px 16px;
}

.stage-trail-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* Stage Landmark Node Button */
.stage-landmark-btn {
  position: relative;
  width: 100%;
  background: rgba(14, 24, 28, 0.88);
  border: 1.5px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
  backdrop-filter: blur(8px);
}

.stage-landmark-btn:hover {
  transform: translateY(-5px) scale(1.02);
  border-color: rgba(255, 255, 255, 0.4);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.6);
}

.stage-landmark-btn.unlocked {
  background: rgba(20, 36, 32, 0.92);
  border-color: rgba(46, 204, 113, 0.5);
}

.stage-landmark-btn.selected {
  border-color: #ffd166;
  box-shadow: 0 0 24px rgba(255, 209, 102, 0.5);
}

.stage-landmark-btn.current {
  border-color: #2ecc71;
  animation: beacon-pulse 2s infinite ease-in-out;
}

@keyframes beacon-pulse {
  0%, 100% { box-shadow: 0 0 10px rgba(46, 204, 113, 0.4); }
  50% { box-shadow: 0 0 24px rgba(46, 204, 113, 0.85); }
}

.stage-landmark-btn.boss {
  border-color: rgba(231, 76, 60, 0.6);
  background: rgba(38, 16, 16, 0.92);
}

.stage-landmark-btn.treasure {
  border-color: rgba(241, 196, 15, 0.5);
}

.stage-landmark-btn.locked {
  opacity: 0.72;
  background: rgba(10, 16, 20, 0.75);
  border-color: rgba(255, 255, 255, 0.08);
}

/* Current Target Tag */
.current-indicator {
  position: absolute;
  top: -10px;
  background: #2ecc71;
  color: #06140d;
  font-size: 10px;
  font-weight: 900;
  padding: 2px 8px;
  border-radius: 999px;
  box-shadow: 0 2px 8px rgba(46, 204, 113, 0.6);
  animation: bounce 1.2s infinite ease-in-out;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}

/* Node Body & Icons */
.landmark-body {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.stage-landmark-btn.unlocked .landmark-body {
  background: rgba(46, 204, 113, 0.18);
  border-color: rgba(46, 204, 113, 0.45);
}

.stage-badge-number {
  font-size: 17px;
  font-weight: 800;
  color: #2ecc71;
}

.landmark-icon.boss-crown {
  color: #ff7675;
}

.landmark-icon.treasure-gift {
  color: #ffd166;
}

.landmark-icon.lock-icon {
  color: rgba(255, 255, 255, 0.45);
}

/* Info Labels */
.landmark-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 4px;
  width: 100%;
}

.landmark-title {
  font-size: 12px;
  font-weight: 700;
  color: #f1f2f6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.landmark-reward-chip {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  color: #ffeaa7;
  font-weight: 600;
  white-space: nowrap;
}

.landmark-reward-chip.boss {
  background: rgba(231, 76, 60, 0.2);
  color: #ff7675;
}

.landmark-reward-chip.gift {
  background: rgba(241, 196, 15, 0.2);
  color: #ffd166;
}

/* Stars */
.landmark-stars {
  display: flex;
  gap: 2px;
}

.landmark-stars .earned {
  fill: #ffd166;
  color: #ffd166;
}

.landmark-stars .unearned {
  color: rgba(255, 255, 255, 0.15);
}

/* Modal Popup Dialog (Interactive Stage Recon & Start Battle) */
.stage-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(4, 9, 14, 0.82);
  backdrop-filter: blur(8px);
  padding: 20px;
}

.stage-modal-card {
  width: 100%;
  max-width: 520px;
  background: #0f1922;
  border: 1.5px solid rgba(88, 201, 165, 0.45);
  border-radius: 16px;
  padding: 24px 28px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(46, 204, 113, 0.15);
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: modal-pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.stage-modal-card.is-boss {
  border-color: rgba(231, 76, 60, 0.55);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(231, 76, 60, 0.2);
}

.stage-modal-card.is-locked {
  border-color: rgba(255, 255, 255, 0.2);
}

@keyframes modal-pop {
  0% { transform: scale(0.92); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

.modal-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-badge-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chapter-tag {
  font-size: 11px;
  font-weight: 700;
  color: #2ecc71;
  background: rgba(46, 204, 113, 0.15);
  padding: 3px 8px;
  border-radius: 6px;
}

.boss-tag {
  font-size: 11px;
  font-weight: 800;
  color: #ff7675;
  background: rgba(231, 76, 60, 0.18);
  padding: 3px 8px;
  border-radius: 6px;
}

.normal-tag {
  font-size: 11px;
  font-weight: 700;
  color: #ffeaa7;
  background: rgba(255, 234, 167, 0.15);
  padding: 3px 8px;
  border-radius: 6px;
}

.modal-close-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: #a4b0be;
  padding: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.modal-close-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}

.modal-title-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding-bottom: 12px;
}

.modal-title-section h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  color: #ffffff;
}

.modal-stars-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.star-badge {
  color: rgba(255, 255, 255, 0.15);
}

.star-badge.earned {
  color: #ffd166;
  filter: drop-shadow(0 0 6px rgba(255, 209, 102, 0.7));
}

.stars-label {
  font-size: 11px;
  color: rgba(238, 245, 242, 0.6);
  margin-left: 6px;
}

/* Recon Grid */
.modal-recon-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.recon-cell {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cell-label {
  font-size: 11px;
  color: rgba(238, 245, 242, 0.55);
}

.cell-value {
  font-size: 13px;
  color: #f1f2f6;
  font-weight: 700;
}

/* Rewards Card */
.modal-rewards-card {
  background: rgba(241, 196, 15, 0.06);
  border: 1px solid rgba(241, 196, 15, 0.25);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.reward-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 800;
  color: #ffd166;
}

.rewards-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.reward-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 6px;
}

.gold-chip {
  background: rgba(241, 196, 15, 0.15);
  color: #ffd166;
}

.star-chip {
  background: rgba(88, 201, 165, 0.15);
  color: #58c9a5;
}

.unlock-chip {
  background: rgba(231, 76, 60, 0.2);
  color: #ff7675;
  border: 1px solid rgba(231, 76, 60, 0.4);
}

/* Criteria List */
.modal-criteria-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.criteria-title {
  font-size: 12px;
  font-weight: 800;
  color: #ffd166;
  margin-bottom: 2px;
}

.criteria-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: rgba(238, 245, 242, 0.7);
  background: rgba(255, 255, 255, 0.03);
  padding: 6px 10px;
  border-radius: 6px;
}

.check-icon {
  color: rgba(255, 255, 255, 0.2);
}

.check-icon.done {
  color: #2ecc71;
}

.star-count {
  margin-left: auto;
  color: #ffd166;
}

/* Action Buttons */
.modal-action-row {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.modal-start-btn {
  flex: 1.5;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: linear-gradient(135deg, #ffd166, #f39c12);
  color: #06140d;
  font-size: 15px;
  font-weight: 800;
  padding: 12px 20px;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(243, 156, 18, 0.45);
  transition: all 0.2s ease;
}

.modal-start-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 24px rgba(243, 156, 18, 0.65);
}

.modal-locked-btn {
  flex: 1.5;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #a4b0be;
  font-size: 13px;
  font-weight: 700;
  padding: 12px 16px;
  border-radius: 10px;
}

.modal-cancel-btn {
  flex: 1;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #dcdde1;
  font-size: 13px;
  font-weight: 700;
  padding: 12px 16px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s;
}

.modal-cancel-btn:hover {
  background: rgba(255, 255, 255, 0.14);
}
</style>
