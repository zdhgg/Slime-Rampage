<script setup>
defineProps({
  info: { type: Object, required: true },
})

const emit = defineEmits(['select'])

const ICONS = {
  rest: '✚',
  tome: '▣',
  blood: '◆',
}
</script>

<template>
  <div class="reward-overlay">
    <section class="reward-panel" role="dialog" aria-modal="true" aria-labelledby="reward-title">
      <div class="reward-kicker">第 {{ info.stage }} 章 · {{ info.stageTitle }} 完成</div>
      <h2 id="reward-title">选择章间补给</h2>
      <p>下一章 · {{ info.nextTitle }} / {{ info.nextRegion }}</p>

      <div class="reward-options">
        <button
          v-for="reward in info.rewards"
          :key="reward.id"
          :class="reward.id"
          @click="emit('select', reward.id)"
        >
          <i aria-hidden="true">{{ ICONS[reward.id] }}</i>
          <b>{{ reward.name }}</b>
          <span>{{ reward.description }}</span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.reward-overlay {
  position: absolute;
  inset: 0;
  z-index: 23;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(5px);
}

.reward-panel {
  box-sizing: border-box;
  width: min(720px, 100%);
  padding: 30px 32px 32px;
  border: 1px solid rgba(138, 232, 74, 0.34);
  border-radius: 8px;
  text-align: center;
  background: rgba(10, 17, 11, 0.98);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.48);
}

.reward-kicker {
  margin-bottom: 7px;
  color: #ffd166;
  font-size: 11px;
  font-weight: 700;
}

h2 {
  margin: 0;
  color: #d2ff8a;
  font-size: 24px;
}

p {
  margin: 8px 0 22px;
  color: rgba(255, 255, 255, 0.48);
  font-size: 12px;
}

.reward-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.reward-options button {
  min-height: 150px;
  padding: 20px 16px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 7px;
  color: rgba(255, 255, 255, 0.82);
  background: rgba(255, 255, 255, 0.045);
  font: inherit;
  cursor: pointer;
  transition: border-color 140ms ease, background 140ms ease, transform 120ms ease;
}

.reward-options button:hover {
  border-color: rgba(210, 255, 138, 0.55);
  background: rgba(138, 232, 74, 0.08);
}

.reward-options button:active {
  transform: scale(0.985);
}

.reward-options button:focus-visible {
  outline: 2px solid #d2ff8a;
  outline-offset: 3px;
}

.reward-options i,
.reward-options b,
.reward-options span {
  display: block;
}

.reward-options i {
  height: 30px;
  color: #b9e97f;
  font-size: 24px;
  font-style: normal;
}

.reward-options b {
  margin: 8px 0 7px;
  color: #eef7e8;
  font-size: 15px;
}

.reward-options span {
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  line-height: 1.55;
}

.reward-options .blood i {
  color: #ff8a80;
}

@media (max-width: 620px) {
  .reward-overlay { padding: 10px; }
  .reward-panel { padding: 24px 16px 18px; }
  .reward-options { grid-template-columns: 1fr; }
  .reward-options button {
    display: grid;
    grid-template-columns: 34px 106px 1fr;
    align-items: center;
    min-height: 70px;
    padding: 10px 12px;
    text-align: left;
  }
  .reward-options i { height: auto; font-size: 21px; }
  .reward-options b { margin: 0; font-size: 13px; }
  .reward-options span { font-size: 10.5px; }
}
</style>
