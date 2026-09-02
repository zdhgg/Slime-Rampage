<script setup>
import { computed } from 'vue'
import { Sparkles, Zap, Flame, Shield, Check, Dna } from 'lucide-vue-next'

const props = defineProps({
  choices: {
    type: Array,
    required: true,
  },
})

const emit = defineEmits(['select'])

function selectCard(mutation) {
  emit('select', mutation.id)
}

function getRarityLabel(rarity) {
  if (rarity === 'legendary') return '传说 · 终极突变'
  if (rarity === 'epic') return '史诗 · 核心秘籍'
  if (rarity === 'rare') return '稀有 · 进阶强化'
  return '普通 · 基础增益'
}
</script>

<template>
  <div class="mutation-modal-overlay" role="dialog" aria-modal="true" aria-label="母巢基因突变选择">
    <div class="mutation-modal-container">
      <!-- Header -->
      <div class="mutation-header">
        <div class="header-icon-wrap">
          <Dna :size="32" class="dna-icon" />
        </div>
        <h2>母巢基因突变 · 流派觉醒</h2>
        <p>波次防守大捷！选择 1 项专属突变秘籍，强化本局流派构筑</p>
      </div>

      <!-- 3 Mutation Cards -->
      <div class="mutation-cards-grid">
        <button
          v-for="card in choices"
          :key="card.id"
          class="mutation-card"
          :class="[card.rarity, card.theme]"
          type="button"
          @click="selectCard(card)"
        >
          <!-- Rarity Tag -->
          <div class="card-rarity-badge">
            <span>{{ getRarityLabel(card.rarity) }}</span>
          </div>

          <!-- Card Icon -->
          <div class="card-icon-circle">
            <span class="card-icon-emoji">{{ card.icon }}</span>
          </div>

          <!-- Card Name -->
          <h3 class="card-name">{{ card.name }}</h3>

          <!-- Card Description -->
          <p class="card-description">{{ card.description }}</p>

          <!-- Select Action Tag -->
          <div class="card-select-btn">
            <span>选择此突变</span>
            <Check :size="15" />
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mutation-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(4, 9, 14, 0.88);
  backdrop-filter: blur(10px);
  padding: 24px;
  animation: overlay-fade 0.25s ease-out;
  pointer-events: auto;
}

@keyframes overlay-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.mutation-modal-container {
  width: 100%;
  max-width: 880px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

.mutation-header {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.header-icon-wrap {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(46, 204, 113, 0.15);
  border: 1.5px solid rgba(46, 204, 113, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 24px rgba(46, 204, 113, 0.35);
}

.dna-icon {
  color: #2ecc71;
  animation: dna-spin 8s linear infinite;
}

@keyframes dna-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.mutation-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  color: #ffeaa7;
  text-shadow: 0 2px 12px rgba(255, 234, 167, 0.4);
}

.mutation-header p {
  margin: 0;
  font-size: 13px;
  color: rgba(238, 245, 242, 0.7);
}

/* Cards Grid */
.mutation-cards-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  width: 100%;
}

/* Mutation Card */
.mutation-card {
  position: relative;
  background: #0f1a24;
  border: 1.5px solid rgba(255, 255, 255, 0.14);
  border-radius: 16px;
  padding: 24px 18px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6);
  color: #eef5f2;
}

.mutation-card:hover {
  transform: translateY(-8px) scale(1.03);
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.8), 0 0 24px var(--card-glow, rgba(46, 204, 113, 0.4));
}

/* Rarity Variations */
.mutation-card.common {
  --card-color: #2ecc71;
  --card-glow: rgba(46, 204, 113, 0.4);
  border-color: rgba(46, 204, 113, 0.35);
}

.mutation-card.rare {
  --card-color: #38d2ff;
  --card-glow: rgba(56, 210, 255, 0.45);
  border-color: rgba(56, 210, 255, 0.4);
}

.mutation-card.epic {
  --card-color: #a55eea;
  --card-glow: rgba(165, 94, 234, 0.5);
  border-color: rgba(165, 94, 234, 0.45);
}

.mutation-card.legendary {
  --card-color: #ffd166;
  --card-glow: rgba(255, 209, 102, 0.6);
  border-color: rgba(255, 209, 102, 0.55);
  background: linear-gradient(180deg, #181c26 0%, #10151e 100%);
}

.card-rarity-badge {
  font-size: 11px;
  font-weight: 800;
  color: var(--card-color, #2ecc71);
  background: rgba(255, 255, 255, 0.06);
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.card-icon-circle {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  border: 1.5px solid var(--card-color, #2ecc71);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 4px 0;
  box-shadow: 0 0 16px var(--card-glow, rgba(46, 204, 113, 0.3));
}

.card-icon-emoji {
  font-size: 28px;
}

.card-name {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: #ffffff;
}

.card-description {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(238, 245, 242, 0.75);
  flex: 1;
}

.card-select-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 8px 18px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--card-color, #2ecc71);
  color: var(--card-color, #2ecc71);
  font-size: 12px;
  font-weight: 800;
  transition: all 0.15s ease;
}

.mutation-card:hover .card-select-btn {
  background: var(--card-color, #2ecc71);
  color: #06140d;
}
</style>
