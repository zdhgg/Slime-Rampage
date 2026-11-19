<script setup>
import { computed, ref, onMounted } from 'vue'
import {
  ArrowLeft,
  Star,
  Shield,
  Lock,
  Unlock,
  Crown,
  Gift,
  Sparkles,
  Play,
  Infinity as InfinityIcon,
  Map as MapIcon,
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
import { TOWER_DEFENSE_TOWER_TYPES, TOWER_UNLOCK_MAP } from '../game/gameplay/tower-defense/TowerDefenseRules.js'

const props = defineProps({
  context: { type: String, default: 'menu' },
})
const emit = defineEmits(['start-stage', 'start-endless', 'close'])

const isGameplayContext = computed(() => props.context === 'gameplay')

const save = ref(loadCampaignSave())
const activeChapterId = ref(1)
const selectedStageId = ref(null)
const showStageModal = ref(false)


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
    const isMiniBoss = sid % 5 === 0 && !isBoss
    const config = getStageConfig(sid)

    const unlocked = Object.entries(TOWER_UNLOCK_MAP).filter(([, stage]) => stage === sid)
    const unlockReward = unlocked.length ? unlocked.map(([type]) => TOWER_DEFENSE_TOWER_TYPES[type].name).join(' / ') : (isBoss ? '章节首领挑战' : config.miniBoss ? `小首领 · ${config.miniBoss.name}` : config.assault.name)


    stages.push({
      id: sid,
      stageNumber: sid - start + 1,
      name: config.name.split('·')[1]?.trim() || `第 ${sid} 关`,
      fullName: config.name,
      isUnlocked,
      isCurrent,
      stars,
      isBoss,
      isMiniBoss,
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
  <div class="world-map-overlay adventure-theme" role="dialog" aria-modal="true" aria-label="守护地图">
    <!-- Top Global Bar -->
    <header class="map-header">
      <div class="header-leading">
        <button
          v-if="!isGameplayContext"
          class="map-back-btn"
          type="button"
          title="返回玩法选择"
          aria-label="返回玩法选择"
          @click="emit('close')"
        >
          <ArrowLeft :size="17" :stroke-width="1.8" aria-hidden="true" />
          <span>返回玩法选择</span>
        </button>

        <div class="header-branding">
          <MapIcon class="branding-icon" :size="24" :stroke-width="1.7" aria-hidden="true" />
          <div>
            <h1>守护地图</h1>
            <p>选一关，守护史莱姆的家。</p>
          </div>
        </div>
      </div>

      <div class="header-actions">
        <button class="endless-btn" type="button" :title="save.endlessBestWave ? `无尽试炼 · 最佳纪录第 ${save.endlessBestWave} 波` : '无尽试炼 · 挑战最高波次纪录'" @click="emit('start-endless')">
          <InfinityIcon :size="16" :stroke-width="1.8" aria-hidden="true" />
          <span>无尽试炼</span>
          <b v-if="save.endlessBestWave" class="star-chip">第 {{ save.endlessBestWave }} 波</b>
        </button>
        <button v-if="isGameplayContext" class="close-map-btn" type="button" @click="emit('close')" aria-label="关闭大地图" title="关闭大地图">
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
        :aria-pressed="activeChapterId === ch.id"
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
              <span>章节首领</span>
              <strong>{{ activeChapter.bossName }}</strong>
            </div>
          </div>

          <div class="overview-right">
            <div class="star-progress-header">
              <span>本章收集的星星</span>
              <strong><Star :size="13" class="star-gold" />{{ chapterStarStats.earned }} / {{ chapterStarStats.total }}</strong>
            </div>
            <div class="star-progress-bar">
              <div class="star-progress-fill" :style="{ width: `${chapterStarStats.percent}%`, background: activeChapter.theme.badgeColor }" />
            </div>
            <div class="star-milestones-row">
              <span class="milestone-item" :class="{ completed: chapterStarStats.earned >= 15 }">15星记录</span>
              <span class="milestone-item" :class="{ completed: chapterStarStats.earned >= 30 }">30星记录</span>
              <span class="milestone-item" :class="{ completed: chapterStarStats.earned >= 45 }">45星记录</span>
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
                  treasure: stg.isMiniBoss,
                }"
                type="button"
                @click="onSelectStage(stg)"
              >
                <!-- Current Challenge Beacon Indicator -->
                <div v-if="stg.isCurrent" class="current-indicator">
                  <span>{{ stg.id === 1 ? '从这里开始' : '最新解锁' }}</span>
                </div>

                <!-- Main Portal / Landmark Shape -->
                <div class="landmark-body">
                  <Lock v-if="!stg.isUnlocked" :size="18" class="landmark-icon lock-icon" aria-label="尚未解锁" />
                  <Crown v-else-if="stg.isBoss" :size="24" class="landmark-icon boss-crown" />
                  <Crown v-else-if="stg.isMiniBoss" :size="20" class="landmark-icon treasure-gift" />
                  <span v-else class="stage-badge-number">{{ stg.stageNumber }}</span>
                </div>

                <!-- Stage Number & Name Label -->
                <div class="landmark-info">
                  <strong class="landmark-title">
                    {{ activeChapter.id }}-{{ stg.stageNumber }} {{ stg.name }}
                  </strong>
                  <!-- Reward / Sneak Peek Chip -->
                  <span v-if="stg.isUnlocked && stg.unlockReward" class="landmark-reward-chip" :class="{ boss: stg.isBoss, gift: stg.isMiniBoss }">
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
              <span v-else-if="selectedStageConfig.miniBoss" class="boss-tag">◆ 小首领挑战</span>
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

          <p v-if="selectedStageConfig.introductory" class="first-stage-tip">
            在路边放一只小守卫，和它一起保护巢心。
          </p>
          <details class="stage-details" :open="!selectedStageConfig.introductory">
            <summary>关卡详情</summary>
            <div class="modal-recon-grid">
              <div class="recon-cell">
                <span class="cell-label">需要守住</span>
                <strong class="cell-value">{{ selectedStageConfig.waveCount }} 波</strong>
              </div>
              <div class="recon-cell">
                <span class="cell-label">🌾 初始养分</span>
                <strong class="cell-value">{{ selectedStageConfig.startingGold }} 养分</strong>
              </div>
              <div class="recon-cell">
                <span class="cell-label">🗺️ 地形拓扑</span>
                <strong class="cell-value">{{ selectedStageConfig.topologyName }}</strong>
              </div>
              <div class="recon-cell">
                <span class="cell-label">🌿 推荐阵容</span>
                <strong class="cell-value">{{ activeChapter.recommendedTypes.filter(id => TOWER_UNLOCK_MAP[id] <= selectedStageId).map(id => TOWER_DEFENSE_TOWER_TYPES[id]?.name || id).join(' / ') }}</strong>
              </div>
            </div>

            <div class="modal-rewards-card">
              <strong>{{ selectedStageConfig.tactic.name }} · {{ selectedStageConfig.assault.name }}</strong>
              <p>{{ selectedStageConfig.tactic.description }}</p>
              <p>{{ selectedStageConfig.assault.hint }}</p>
              <template v-if="selectedStageConfig.miniBoss">
                <strong>小首领 · {{ selectedStageConfig.miniBoss.name }}</strong>
                <p>{{ selectedStageConfig.miniBoss.mechanic }}</p>
                <p>应对：{{ selectedStageConfig.miniBoss.counter }}</p>
                <p>最终波登场；漏过损失 {{ selectedStageConfig.miniBoss.damage }} 点巢心耐久。</p>
              </template>
              <p v-if="selectedStageConfig.isBossStage">首领抵达母巢即失败，必须击杀；提前准备穿甲与控制火力。</p>
              <span v-for="(stage, type) in TOWER_UNLOCK_MAP" :key="type">
                <span v-if="stage === selectedStageId" class="reward-chip unlock-chip">本关可用：{{ TOWER_DEFENSE_TOWER_TYPES[type].name }}</span>
              </span>
            </div>
            <!-- Rewards & Special Unlocks -->
            <div class="modal-rewards-card">
              <div class="reward-title-row">
                <Sparkles :size="15" class="sparkle-icon" />
                <span>通关评价</span>
              </div>
              <div class="rewards-list">
                <span class="reward-chip star-chip"><Star :size="13" /> 最高 3 星通关评价</span>
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
          </details>

          <!-- Action Buttons -->
          <div class="modal-action-row">
            <button
              v-if="selectedStageIsUnlocked"
              class="modal-start-btn"
              type="button"
              @click="onStartSelectedStage"
            >
              <Play :size="18" fill="currentColor" />
              <span>开始守护</span>
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


  </div>
</template>

<style scoped>
.world-map-overlay {
  --map-surface: var(--adventure-paper);
  --map-text: var(--adventure-ink);
  --map-text-muted: var(--adventure-muted);
  --map-border: var(--adventure-line);
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  background: var(--adventure-bg);
  color: var(--map-text);
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
  overflow: hidden;
}

/* Header */
.map-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  min-height: 80px;
  padding: 16px 24px;
  background: var(--map-surface);
  border-bottom: 1px solid var(--map-border);
  z-index: 10;
}

.header-leading {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.header-branding {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.branding-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 36px;
  border: 1px solid var(--map-border);
  border-radius: 9px;
  color: var(--adventure-green);
  background: var(--adventure-leaf);
}

.header-branding h1 {
  margin: 0;
  overflow: hidden;
  color: var(--map-text);
  font-size: 18px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 800;
}

.header-branding p {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--map-text-muted);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: none;
}

.map-back-btn,
.close-map-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 36px;
  border: 1px solid var(--map-border);
  border-radius: 9px;
  color: var(--map-text-muted);
  background: transparent;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.14s ease, color 0.14s ease, background 0.14s ease;
}

.map-back-btn {
  padding: 0 11px;
  white-space: nowrap;
}

.map-back-btn:hover,
.close-map-btn:hover {
  border-color: #9bb98e;
  color: var(--adventure-green);
  background: var(--adventure-leaf);
}

.map-back-btn:focus-visible,
.close-map-btn:focus-visible,
.endless-btn:focus-visible,
.chapter-tab:focus-visible,
.stage-landmark-btn:focus-visible,
.modal-start-btn:focus-visible,
.modal-cancel-btn:focus-visible {
  outline: 2px solid var(--adventure-focus);
  outline-offset: 3px;
}

.endless-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid #cebde0;
  border-radius: 9px;
  background: #f6edf9;
  color: #68437c;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.14s ease, background 0.14s ease, color 0.14s ease;
}

.endless-btn:hover {
  border-color: #aa83c1;
  background: #ecdcf5;
  color: #593369;
}

.star-chip {
  display: flex;
  align-items: center;
  gap: 3px;
  color: var(--adventure-gold);
}

.star-gold {
  fill: var(--adventure-gold);
  color: var(--adventure-gold);
}

.close-map-btn {
  width: 36px;
  padding: 0;
}

/* Chapter Tabs */
.chapter-tabs {
  display: flex;
  gap: 8px;
  padding: 10px 24px;
  background: var(--adventure-bg);
  border-bottom: 1px solid var(--map-border);
  overflow-x: auto;
  z-index: 10;
}

.chapter-tab {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 54px;
  padding: 8px 14px;
  border: 1px solid var(--map-border);
  border-radius: 9px;
  background: var(--map-surface);
  color: var(--map-text);
  font: inherit;
  cursor: pointer;
  transition: border-color 0.14s ease, background 0.14s ease, color 0.14s ease;
  white-space: nowrap;
}

.chapter-tab:hover:not(.locked) {
  background: var(--adventure-leaf);
  border-color: #9aba8d;
}

.chapter-tab.active {
  border-color: var(--ch-color, var(--adventure-green));
  background: #eef1e8;
  box-shadow: inset 0 -2px 0 var(--ch-color, var(--adventure-green));
}

.chapter-tab.locked {
  color: var(--map-text-muted);
  background: #f4f4ec;
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
  color: var(--map-text-muted);
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
  background: radial-gradient(circle at 50% 20%, #f3f9dd 0%, #e8f4da 50%, #d1e8bf 100%);
}

.biome-scenery.glacial {
  background: radial-gradient(circle at 50% 20%, #f0f9fe 0%, #e1f3fb 50%, #cbdfef 100%);
}

.biome-scenery.volcanic {
  background: radial-gradient(circle at 50% 20%, #fff4da 0%, #fae8d5 50%, #eed0bc 100%);
}

.biome-scenery.superconductor {
  background: radial-gradient(circle at 50% 20%, #f7f0ff 0%, #eae4f9 50%, #d7c9ef 100%);
}

.biome-scenery.imperial {
  background: radial-gradient(circle at 50% 20%, #fff7df 0%, #f3ebd1 50%, #e8d5ae 100%);
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
  width: min(1180px, calc(100% - 48px));
  padding: 28px 0 40px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin: 0 auto;
}

/* Chapter Overview Card */
.chapter-overview-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 18px 20px;
  background: var(--map-surface);
  border-left: 3px solid var(--adventure-green);
  border-radius: 10px;
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 0 rgba(56, 92, 48, 0.10);
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
  color: var(--map-text);
}

.chapter-title-row p {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--map-text-muted);
}

.boss-intel-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  background: #fae8e1;
  border: 1px solid #dfb1a3;
  padding: 3px 10px;
  border-radius: 10px;
  font-size: 11px;
}

.boss-intel-tag span {
  color: #943a37;
}

.boss-intel-tag strong {
  color: var(--map-text);
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
  background: #e7eadf;
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
  color: var(--map-text-muted);
}

.milestone-item.completed {
  color: var(--adventure-gold);
  font-weight: 700;
}

/* Winding Adventure Trail Grid */
.adventure-trail-scroll {
  padding: 10px 0;
}

.adventure-trail-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
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
  background: var(--map-surface);
  border: 1.5px solid #e9ece4;
  border-radius: 10px;
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: border-color 0.14s ease, background 0.14s ease, transform 0.12s ease, box-shadow 0.14s ease;
  backdrop-filter: blur(8px);
}

.stage-landmark-btn:hover {
  transform: translateY(-2px);
  border-color: #8cac7d;
  box-shadow: 0 4px 0 rgba(56, 92, 48, 0.16);
}

.stage-landmark-btn.unlocked {
  background: #fdfff8;
  border-color: #9dbb90;
}

.stage-landmark-btn.selected {
  border-color: var(--adventure-gold);
  box-shadow: 0 0 0 2px #d2bd8a;
}

.stage-landmark-btn.current {
  border-color: var(--adventure-green);
  background: #fafff2;
  box-shadow: 0 0 0 2px #a6c894;
}
.stage-landmark-btn.current .landmark-title { font-size: 14px; }

.stage-landmark-btn.boss { border-color: #d49b90; }
.stage-landmark-btn.treasure { border-color: #d9b77d; }
.stage-landmark-btn.locked { background: #f5f7f1; border-color: var(--map-border); }
.stage-landmark-btn.locked .landmark-title { color: var(--map-text-muted); }

/* Current Target Tag */
.current-indicator {
  position: absolute;
  top: -10px;
  background: var(--adventure-green);
  color: #fff;
  font-size: 11px;
  font-weight: 900;
  padding: 2px 8px;
  border-radius: 999px;
}

/* Node Body & Icons */
.landmark-body {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #eef1e8;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--map-border);
}

.stage-landmark-btn.unlocked .landmark-body {
  background: var(--adventure-leaf);
  border-color: #a9c99b;
}

.stage-badge-number {
  font-size: 17px;
  font-weight: 800;
  color: var(--adventure-green);
}

.landmark-icon.boss-crown {
  color: #943a37;
}

.landmark-icon.treasure-gift {
  color: var(--adventure-gold);
}

.landmark-icon.lock-icon {
  color: var(--map-text-muted);
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
  color: var(--map-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.landmark-reward-chip {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--adventure-leaf);
  color: var(--adventure-gold);
  font-weight: 600;
  white-space: nowrap;
}

.landmark-reward-chip.boss {
  background: #fae8e1;
  color: #943a37;
}

.landmark-reward-chip.gift {
  background: #fbebc7;
  color: var(--adventure-gold);
}

/* Stars */
.landmark-stars {
  display: flex;
  gap: 2px;
}

.landmark-stars .earned {
  fill: var(--adventure-gold);
  color: var(--adventure-gold);
}

.landmark-stars .unearned {
  color: #879487;
}

/* Modal Popup Dialog (Interactive Stage Recon & Start Battle) */
.stage-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(27, 51, 41, 0.43);
  backdrop-filter: blur(8px);
  padding: 20px;
}

.stage-modal-card {
  width: 100%;
  max-width: 520px;
  background: var(--map-surface);
  border: 1.5px solid var(--map-border);
  border-radius: 8px;
  padding: 24px 28px;
  max-height: calc(100dvh - 40px);
  overflow-y: auto;
  box-shadow: 0 14px 40px rgba(27, 51, 41, 0.2);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stage-modal-card.is-boss { border-color: #d49b90; }

.first-stage-tip {
  padding: 12px 15px;
  border-radius: 10px;
  background: var(--adventure-leaf);
  color: var(--adventure-green);
  font-size: 16px;
  line-height: 1.55;
}

.stage-details > summary {
  width: fit-content;
  color: var(--map-text-muted);
  font-size: 14px;
  font-weight: 650;
  cursor: pointer;
}
.stage-details[open] > div { margin-top: 12px; }
.stage-details p { margin: 0; line-height: 1.55; }

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
  color: var(--adventure-green);
  background: var(--adventure-leaf);
  padding: 3px 8px;
  border-radius: 10px;
}

.boss-tag {
  font-size: 11px;
  font-weight: 800;
  color: #943a37;
  background: #fae8e1;
  padding: 3px 8px;
  border-radius: 10px;
}

.normal-tag {
  font-size: 11px;
  font-weight: 700;
  color: var(--adventure-gold);
  background: #fbebc7;
  padding: 3px 8px;
  border-radius: 10px;
}

.modal-close-btn {
  background: transparent;
  border: 1px solid #879487;
  border-radius: 10px;
  color: var(--map-text-muted);
  padding: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.modal-close-btn:hover {
  background: var(--map-border);
  color: var(--map-text);
}

.modal-title-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--adventure-leaf);
  padding-bottom: 12px;
}

.modal-title-section h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  color: var(--map-text);
}

.modal-stars-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.star-badge {
  color: #879487;
}

.star-badge.earned {
  color: var(--adventure-gold);
  fill: #efb63f;
}

.stars-label {
  font-size: 11px;
  color: var(--map-text-muted);
  margin-left: 6px;
}

/* Recon Grid */
.modal-recon-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.recon-cell {
  background: #f6f7f0;
  border: 1px solid var(--adventure-leaf);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cell-label {
  font-size: 11px;
  color: var(--map-text-muted);
}

.cell-value {
  font-size: 13px;
  color: var(--map-text);
  font-weight: 700;
}

/* Rewards Card */
.modal-rewards-card {
  background: #fffaed;
  border: 1px solid #ead8b5;
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
  color: var(--adventure-gold);
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
  border-radius: 10px;
}

.gold-chip {
  background: #fbebc7;
  color: var(--adventure-gold);
}

.star-chip {
  background: var(--adventure-leaf);
  color: var(--adventure-green);
}

.unlock-chip {
  background: #fae8e1;
  color: #943a37;
  border: 1px solid #dfb1a3;
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
  color: var(--adventure-gold);
  margin-bottom: 2px;
}

.criteria-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--map-text-muted);
  background: #f3f5ed;
  padding: 6px 10px;
  border-radius: 10px;
}

.check-icon {
  color: #879487;
}

.check-icon.done {
  color: var(--adventure-green);
}

.star-count {
  margin-left: auto;
  color: var(--adventure-gold);
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
  background: var(--adventure-green);
  color: #fff;
  font-size: 15px;
  font-weight: 800;
  padding: 12px 20px;
  border: none;
  border-radius: 9px;
  cursor: pointer;
  transition: background 0.14s ease, border-color 0.14s ease, transform 0.12s ease;
}

.modal-start-btn:hover {
  transform: translateY(-1px);
  background: var(--adventure-green-hover);
}

.modal-locked-btn {
  flex: 1.5;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: #eef1e8;
  border: 1px solid var(--map-border);
  color: var(--map-text-muted);
  font-size: 13px;
  font-weight: 700;
  padding: 12px 16px;
  border-radius: 9px;
}

.modal-cancel-btn {
  flex: 1;
  background: var(--adventure-leaf);
  border: 1px solid #879487;
  color: var(--map-text);
  font-size: 13px;
  font-weight: 700;
  padding: 12px 16px;
  border-radius: 9px;
  cursor: pointer;
  transition: background 0.15s;
}

.modal-cancel-btn:hover {
  background: #e9ece4;
}

@media (max-width: 720px) {
  .map-header {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 12px;
    padding: 14px 16px;
  }

  .map-header .header-leading { flex: 1; min-width: 0; }
  .map-header .header-actions { gap: 6px; }

  .header-actions {
    justify-content: flex-end;
  }

  .map-back-btn {
    order: 0;
    padding-inline: 8px;
  }

  .header-branding {
    order: 1;
    min-width: 0;
  }

  .header-branding h1 { font-size: 16px; }
  .map-back-btn span, .header-branding p, .branding-icon { display: none; }

  .map-content-area {
    width: min(calc(100% - 28px), 1180px);
    padding-top: 18px;
  }

  .chapter-overview-card {
    align-items: flex-start;
    flex-direction: column;
  }

  .overview-right {
    width: 100%;
    min-width: 0;
  }

  .adventure-trail-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (prefers-reduced-motion: reduce) {
  .world-map-overlay:is(.modal-fade-enter-active, .modal-fade-leave-active) { transition: none; }
  .stage-landmark-btn,
  .modal-start-btn,
  .map-back-btn,
  .close-map-btn,
  .endless-btn,
  .chapter-tab { transition: none; }
}
</style>
