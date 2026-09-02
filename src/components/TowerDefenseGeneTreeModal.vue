<script setup>
import { computed, ref, onMounted } from 'vue'
import { Sparkles, RotateCcw, X, Check, Star } from 'lucide-vue-next'
import { GENE_TREE_NODES } from '../game/gameplay/tower-defense/TowerDefenseCampaignRules.js'
import { loadCampaignSave, upgradeGeneTalent, resetGeneTalents } from '../game/gameplay/tower-defense/TowerDefenseSave.js'

const emit = defineEmits(['close', 'updated'])

const save = ref(loadCampaignSave())

const totalStars = computed(() => save.value.totalStarsEarned || 0)
const spentStars = computed(() => save.value.starsSpent || 0)
const availableStars = computed(() => Math.max(0, totalStars.value - spentStars.value))

function onUpgrade(talentId) {
  const res = upgradeGeneTalent(talentId)
  if (res.success) {
    save.value = res.save
    emit('updated')
  }
}

function onReset() {
  const res = resetGeneTalents()
  if (res.success) {
    save.value = res.save
    emit('updated')
  }
}
</script>

<template>
  <div class="gene-tree-backdrop" role="dialog" aria-modal="true" aria-label="母巢基因库">
    <div class="gene-tree-panel">
      <!-- Header -->
      <div class="panel-header">
        <div class="header-left">
          <span class="header-icon">🧬</span>
          <div>
            <h2>母巢星级基因库</h2>
            <p>通关关卡收集星星，点亮全局强力被动天赋</p>
          </div>
        </div>
        <div class="header-right">
          <div class="stars-counter">
            <Star :size="16" class="star-icon" />
            <span>可用星星:</span>
            <strong>{{ availableStars }}</strong>
            <small>/ {{ totalStars }}</small>
          </div>
          <button class="reset-btn" type="button" :disabled="spentStars === 0" @click="onReset" title="重置所有天赋，100%返还星星">
            <RotateCcw :size="13" />
            <span>重置天赋</span>
          </button>
          <button class="close-btn" type="button" @click="emit('close')" aria-label="关闭">
            <X :size="18" />
          </button>
        </div>
      </div>

      <!-- Talent Cards Grid -->
      <div class="talents-grid">
        <div
          v-for="node in GENE_TREE_NODES"
          :key="node.id"
          class="talent-card"
          :class="{ 'max-level': (save.geneTalents[node.id] || 0) >= node.maxLevel }"
        >
          <div class="card-top">
            <span class="talent-icon">{{ node.icon }}</span>
            <div class="talent-title-col">
              <h3>{{ node.name }}</h3>
              <div class="level-pills">
                <span
                  v-for="lvl in node.maxLevel"
                  :key="lvl"
                  class="lvl-dot"
                  :class="{ active: (save.geneTalents[node.id] || 0) >= lvl }"
                />
                <small>Lv.{{ save.geneTalents[node.id] || 0 }} / {{ node.maxLevel }}</small>
              </div>
            </div>
          </div>

          <div class="card-body">
            <ul class="effect-list">
              <li
                v-for="(desc, idx) in node.descriptions"
                :key="idx"
                :class="{ current: (save.geneTalents[node.id] || 0) === idx + 1, next: (save.geneTalents[node.id] || 0) === idx }"
              >
                <span class="lvl-tag">Lv.{{ idx + 1 }}</span>
                <span>{{ desc }}</span>
              </li>
            </ul>
          </div>

          <div class="card-footer">
            <button
              v-if="(save.geneTalents[node.id] || 0) < node.maxLevel"
              class="upgrade-talent-btn"
              :disabled="availableStars < node.costs[save.geneTalents[node.id] || 0]"
              type="button"
              @click="onUpgrade(node.id)"
            >
              <Sparkles :size="14" />
              <span>升级天赋</span>
              <b><Star :size="12" />{{ node.costs[save.geneTalents[node.id] || 0] }} 星</b>
            </button>
            <div v-else class="maxed-badge">
              <Check :size="14" />
              <span>已达顶级</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gene-tree-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 10, 15, 0.88);
  backdrop-filter: blur(8px);
  padding: 24px;
}
.gene-tree-panel {
  width: 100%;
  max-width: 860px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: #0d151c;
  border: 1px solid rgba(88, 201, 165, 0.35);
  border-radius: 12px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.7);
  overflow: hidden;
  color: #eef5f2;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.header-icon {
  font-size: 28px;
}
.header-left h2 {
  margin: 0;
  font-size: 18px;
  color: #a8ff78;
}
.header-left p {
  margin: 2px 0 0;
  font-size: 12px;
  color: rgba(238, 245, 242, 0.6);
}
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.stars-counter {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid rgba(255, 209, 102, 0.4);
  border-radius: 6px;
  background: rgba(255, 209, 102, 0.1);
  color: #ffd166;
  font-size: 13px;
}
.star-icon {
  fill: #ffd166;
}
.reset-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: 1px solid rgba(255, 107, 129, 0.4);
  border-radius: 6px;
  background: rgba(255, 107, 129, 0.1);
  color: #ff6b81;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}
.reset-btn:hover:not(:disabled) {
  background: #ff6b81;
  color: #fff;
}
.reset-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.close-btn {
  padding: 6px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  background: transparent;
  color: #dcdde1;
  cursor: pointer;
}
.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}
.talents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
  padding: 20px;
  overflow-y: auto;
}
.talent-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  transition: all 0.2s;
}
.talent-card:hover {
  border-color: rgba(88, 201, 165, 0.4);
  background: rgba(255, 255, 255, 0.05);
}
.talent-card.max-level {
  border-color: rgba(255, 209, 102, 0.35);
  background: rgba(255, 209, 102, 0.03);
}
.card-top {
  display: flex;
  align-items: center;
  gap: 10px;
}
.talent-icon {
  font-size: 24px;
}
.talent-title-col h3 {
  margin: 0;
  font-size: 14px;
  color: #fff;
}
.level-pills {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 3px;
}
.lvl-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
}
.lvl-dot.active {
  background: #2ecc71;
  box-shadow: 0 0 4px #2ecc71;
}
.level-pills small {
  font-size: 10px;
  color: rgba(238, 245, 242, 0.6);
  margin-left: 4px;
}
.card-body {
  margin: 12px 0;
}
.effect-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.effect-list li {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: rgba(238, 245, 242, 0.45);
}
.effect-list li.current {
  color: #2ecc71;
  font-weight: 700;
}
.effect-list li.next {
  color: #ffeaa7;
}
.lvl-tag {
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 9px;
}
.card-footer {
  margin-top: auto;
}
.upgrade-talent-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 10px;
  border: 1px solid rgba(46, 204, 113, 0.5);
  border-radius: 6px;
  background: #2ecc71;
  color: #0b1912;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}
.upgrade-talent-btn:hover:not(:disabled) {
  background: #55efc4;
}
.upgrade-talent-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.15);
}
.upgrade-talent-btn b {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: 4px;
  color: #ffeaa7;
}
.maxed-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px;
  border-radius: 6px;
  background: rgba(255, 209, 102, 0.15);
  color: #ffd166;
  font-size: 11.5px;
  font-weight: 700;
}
</style>
