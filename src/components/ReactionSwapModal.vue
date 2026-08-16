<script setup>
/**
 * ReactionSwapModal：副反应位已满的替换面板（阶段十六槽位经济）
 *
 *  - props.info：{ candidate（新反应）, secondaries（现有副反应）, slots, count }
 *  - 点击现有副反应 → emit('resolve', candidate.id, 该副反应.id) = 替换
 *  - 「保持现状」→ emit('resolve', candidate.id, null) = 放弃新反应
 *  - 纯展示 + 上报，引擎在 App.vue 的 onResolveSwap 中完成替换并 resume
 */
defineProps({
  info: { type: Object, required: true },
})
const emit = defineEmits(['resolve'])
</script>

<template>
  <div class="swap-overlay" role="dialog" aria-modal="true" aria-label="副反应替换选择">
    <div class="swap-panel">
      <h2 class="swap-title">⚗️ 副反应位已满（{{ info.count }}/{{ info.slots }}）</h2>
      <p class="swap-grow">
        新组合「{{ info.candidate.combo }} {{ info.candidate.name }}」已就绪——点击一个现有副反应进行替换，或放弃
      </p>
      <div class="swap-cards">
        <!-- 新反应候选（不可点击，高亮展示） -->
        <button class="swap-card swap-new" disabled>
          <div class="swap-icon">✨</div>
          <div class="swap-name">{{ info.candidate.combo }} {{ info.candidate.name }}</div>
          <div class="swap-desc">{{ info.candidate.desc }}</div>
          <div class="swap-num">新反应</div>
        </button>
        <!-- 现有副反应（点击替换） -->
        <button
          v-for="s in info.secondaries"
          :key="s.id"
          class="swap-card"
          @click="emit('resolve', info.candidate.id, s.id)"
        >
          <div class="swap-icon">♻️</div>
          <div class="swap-name">{{ s.combo }} {{ s.name }}</div>
          <div class="swap-desc">{{ s.desc }}</div>
          <div class="swap-num">点击替换</div>
        </button>
      </div>
      <button class="swap-decline" @click="emit('resolve', info.candidate.id, null)">
        保持现状（放弃新反应）
      </button>
      <div class="swap-hint">副反应槽位可在黑市通过「共鸣基因」扩充</div>
    </div>
  </div>
</template>

<style scoped>
.swap-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(3px);
}

.swap-panel {
  text-align: center;
}

.swap-title {
  margin-bottom: 10px;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: 3px;
  color: #ffd166;
  text-shadow: 0 2px 12px rgba(255, 209, 102, 0.4);
}

.swap-grow {
  margin-bottom: 22px;
  font-size: 13px;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.75);
}

.swap-cards {
  display: flex;
  gap: 20px;
  justify-content: center;
}

.swap-card {
  position: relative;
  width: 190px;
  padding: 22px 16px 18px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  background: linear-gradient(165deg, rgba(30, 46, 34, 0.95), rgba(14, 22, 16, 0.95));
  color: #e8f5e0;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.swap-card:hover:not(:disabled) {
  transform: translateY(-6px);
  border-color: rgba(138, 232, 74, 0.65);
  box-shadow: 0 8px 28px rgba(138, 232, 74, 0.22);
}

.swap-card.swap-new {
  border-color: rgba(255, 209, 102, 0.55);
  cursor: default;
}

.swap-icon {
  font-size: 34px;
  line-height: 1.2;
  margin-bottom: 8px;
}

.swap-name {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 8px;
  color: #d2ff8a;
}

.swap-new .swap-name {
  color: #ffd166;
}

.swap-desc {
  font-size: 12.5px;
  line-height: 1.6;
  color: rgba(232, 245, 224, 0.68);
}

.swap-num {
  margin-top: 10px;
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #ffd166;
  background: rgba(255, 209, 102, 0.08);
  border: 1px solid rgba(255, 209, 102, 0.2);
}

.swap-decline {
  display: block;
  margin: 22px auto 0;
  padding: 9px 28px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.swap-decline:hover {
  border-color: rgba(255, 255, 255, 0.55);
  background: rgba(255, 255, 255, 0.1);
}

.swap-hint {
  margin-top: 12px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
}
</style>
