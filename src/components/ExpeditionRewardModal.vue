<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import SkillIcon from './SkillIcon.vue'
import LevelUpModal from './LevelUpModal.vue'
import { useCardFocus } from './useCardFocus.js'
const props = defineProps({ info: { type: Object, required: true } })
const emit = defineEmits(['select'])
const panel = ref(null)
const compensation = computed(() => props.info.phase === 'compensation')
let readyAt = 0, previousFocus
function choose(card) {
  if (!card || card.disabled || performance.now() < readyAt) return
  readyAt = performance.now() + 180
  emit('select', card.id)
}
const { selectedCard } = useCardFocus(() => props.info.options, choose, () => !compensation.value)
const hasMemory = computed(() => props.info.options.some(card => card.isOriginMemory))
const title = computed(() => compensation.value ? '秘典满级补偿' : hasMemory.value ? '首领源质 · 吸收与重构' : '选择 BOSS 秘典')
onMounted(() => { previousFocus = document.activeElement; panel.value?.focus({ preventScroll: true }) })
onBeforeUnmount(() => { if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }) })
function trap(event) {
  const buttons = [...panel.value.querySelectorAll('button:not(:disabled)')]
  if (!buttons.length) return
  const current = buttons.indexOf(document.activeElement)
  buttons[(current + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus()
}
</script>
<template>
  <div class="reward-overlay" @keydown.tab.prevent="trap">
    <section ref="panel" class="reward-panel" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="reward-title">
      <header class="reward-heading">
        <p class="reward-kicker">{{ info.chapter ? `第 ${info.stage} 章 · ${info.stageTitle} 完成` : '首领战利品' }}</p>
        <h2 id="reward-title">{{ title }}</h2>
        <p class="reward-source">{{ compensation ? '秘典已满级，获得一次普通技能选择' : `已击败 ${info.source} · 选择一项专属成长` }}</p>
      </header>
      <LevelUpModal v-if="compensation" embedded :options="info.options" :level="info.level" :role-spec="info.roleSpec" :can-use-elements="info.canUseElements" reward-title="秘典已满级 · 选择一项普通强化" @select="choose" />
      <div v-else class="reward-options tome-options">
        <button v-for="(card, index) in info.options" :key="card.id" :class="{ selected: selectedCard?.id === card.id, 'is-memory': card.isOriginMemory }" :style="{ '--tome-color': card.color }" @click="choose(card)">
          <div class="card-top"><span class="card-kind">{{ card.isOriginMemory ? '源质记忆' : card.level ? '升级秘典' : '新秘典' }}</span><kbd>{{ index + 1 }}</kbd></div>
          <SkillIcon :skill="card" /><h3>{{ card.name }}</h3>
          <p v-if="card.isOriginMemory" class="card-source">来源：{{ card.sourceBoss }}</p>
          <p>{{ card.desc }}</p>
          <p v-if="card.trigger" class="card-trigger">{{ card.trigger }}</p>
          <div class="tome-ranks" :aria-label="`选择后等级 ${card.level + 1}，最高3级`"><i v-for="rank in 3" :key="rank" :class="{ owned: rank <= card.level, next: rank === card.level + 1 }" /></div>
          <strong class="card-stats">{{ card.stats }}</strong><span class="card-action">{{ card.level ? `Lv.${card.level} → Lv.${card.level + 1}` : '获得 Lv.1' }}<span>选择 →</span></span>
        </button>
      </div>
      <p class="reward-footer">{{ compensation ? '本次选择不增加玩家等级' : '最高 Lv.3 · 每次随机三选一 · 不占用普通升级次数' }}<span v-if="!compensation">方向键或数字键切换 · Enter 确认</span></p>
    </section>
  </div>
</template>
<style scoped>
.reward-overlay {
  position: absolute;
  inset: 0;
  z-index: 140;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(8, 17, 13, 0.72);
  backdrop-filter: blur(11px);
}

.reward-panel {
  box-sizing: border-box;
  width: min(980px, 100%);
  max-height: calc(100dvh - 48px);
  overflow-y: auto;
  padding: 28px 30px 24px;
  border: 1px solid rgba(232, 198, 122, 0.38);
  border-radius: 18px;
  color: var(--art-text, #f3ead5);
  background:
    radial-gradient(ellipse at 50% 0%, rgba(215, 184, 110, 0.14), transparent 58%),
    rgba(16, 26, 21, 0.93);
  backdrop-filter: blur(16px);
  box-shadow:
    inset 0 1px 0 rgba(255, 244, 206, 0.14),
    0 28px 72px rgba(0, 0, 0, 0.6);
  outline: none;
}

.reward-heading {
  margin-bottom: 22px;
}

.reward-kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px;
  padding: 3px 12px;
  border-radius: 999px;
  background: rgba(215, 184, 110, 0.12);
  border: 1px solid rgba(215, 184, 110, 0.34);
  color: #f2d27a;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.6px;
}

.reward-kicker::before {
  content: '✦';
  font-size: 10px;
  opacity: 0.9;
}

h2 {
  margin: 0;
  color: #f7df94;
  font-size: 28px;
  font-weight: 850;
  letter-spacing: 0.3px;
  text-shadow: 0 2px 14px rgba(215, 184, 110, 0.24), 0 2px 6px rgba(0, 0, 0, 0.45);
}

.reward-source {
  margin: 8px 0 0;
  color: #c2d0bf;
  font-size: 13.5px;
  line-height: 1.55;
}

.reward-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.reward-options button {
  --tome-color: #d7b86e;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  padding: 18px 18px 16px;
  border: 1.5px solid color-mix(in srgb, var(--tome-color) 32%, rgba(225, 211, 170, 0.22));
  border-radius: 14px;
  color: var(--art-text, #f3ead5);
  background:
    radial-gradient(circle at 50% 18%, color-mix(in srgb, var(--tome-color) 16%, transparent) 0%, transparent 58%),
    linear-gradient(180deg, rgba(28, 42, 35, 0.96) 0%, rgba(15, 25, 20, 0.99) 100%);
  box-shadow: inset 0 1px 0 rgba(255, 246, 214, 0.08), 0 12px 28px rgba(0, 0, 0, 0.38);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.reward-options button::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 3.5px;
  border-radius: 14px 14px 0 0;
  background: linear-gradient(90deg, transparent 8%, color-mix(in srgb, var(--tome-color) 62%, #f7df94 38%) 50%, transparent 92%);
  opacity: 0.78;
  pointer-events: none;
}

.reward-options button:hover:not(:disabled),
.reward-options button.selected:not(:disabled) {
  transform: translateY(-5px);
  border-color: color-mix(in srgb, var(--tome-color) 55%, #f7df94 45%);
  background:
    radial-gradient(circle at 50% 18%, color-mix(in srgb, var(--tome-color) 24%, transparent) 0%, transparent 60%),
    linear-gradient(180deg, color-mix(in srgb, var(--tome-color) 9%, #1f3028) 0%, rgba(17, 28, 22, 0.99) 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 244, 206, 0.14),
    0 0 26px color-mix(in srgb, var(--tome-color) 26%, rgba(247, 223, 148, 0.16)),
    0 18px 36px rgba(0, 0, 0, 0.48);
}

.reward-options button:focus-visible {
  outline: 2px solid var(--art-focus, #a9e8a0);
  outline-offset: 2px;
}

.reward-options button:active:not(:disabled) {
  transform: translateY(-2px);
}

.reward-options button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
  filter: saturate(0.35);
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  margin-bottom: 14px;
}

.card-kind {
  padding: 3px 10px;
  border-radius: 999px;
  color: color-mix(in srgb, var(--tome-color) 72%, #f7df94 28%);
  background: color-mix(in srgb, var(--tome-color) 14%, rgba(10, 18, 14, 0.85));
  border: 1px solid color-mix(in srgb, var(--tome-color) 36%, transparent);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.4px;
}

kbd {
  min-width: 22px;
  padding: 2px 7px;
  border: 1px solid rgba(225, 211, 170, 0.24);
  border-radius: 6px;
  color: var(--art-muted, #a9b6a4);
  background: rgba(11, 19, 15, 0.82);
  font: inherit;
  font-size: 10.5px;
  font-weight: 800;
  text-align: center;
}

.reward-options button.selected:not(:disabled) kbd {
  color: #0e1914;
  background: linear-gradient(135deg, #f7df94, #d7b86e);
  border-color: #f7df94;
  box-shadow: 0 0 10px rgba(247, 223, 148, 0.45);
}

.tome-options :deep(.skill-glyph) {
  --skill-icon-color: var(--tome-color) !important;
  align-self: center;
  margin: 2px 0 12px;
  border-color: color-mix(in srgb, var(--tome-color) 48%, #f7df94 52%);
  box-shadow:
    inset 0 -6px 12px color-mix(in srgb, var(--tome-color) 42%, rgba(0, 0, 0, 0.35)),
    0 0 22px color-mix(in srgb, var(--tome-color) 38%, transparent);
}

.tome-options h3 {
  width: 100%;
  text-align: center;
}

h3 {
  margin: 2px 0 8px;
  font-size: 19px;
  font-weight: 800;
  color: color-mix(in srgb, var(--tome-color) 70%, #f9f3e3);
  text-shadow: 0 1px 10px color-mix(in srgb, var(--tome-color) 24%, transparent);
}

.reward-options p {
  margin: 0 0 14px;
  color: #c8d4c4;
  font-size: 12.5px;
  line-height: 1.65;
}

.tome-ranks {
  display: flex;
  gap: 6px;
  width: 100%;
  margin-bottom: 14px;
}

.tome-ranks i {
  flex: 1;
  height: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.tome-ranks .owned {
  background: var(--tome-color);
  border-color: color-mix(in srgb, var(--tome-color) 70%, #ffffff 30%);
  box-shadow: 0 0 8px color-mix(in srgb, var(--tome-color) 55%, transparent);
}

.tome-ranks .next {
  background: linear-gradient(90deg, #f7df94, #d7b86e);
  border-color: rgba(255, 244, 206, 0.65);
  box-shadow: 0 0 10px rgba(247, 223, 148, 0.45);
}

.card-stats {
  box-sizing: border-box;
  width: 100%;
  margin-top: auto;
  padding: 9px 11px;
  border-radius: 10px;
  color: var(--art-text, #f3ead5);
  background: color-mix(in srgb, var(--tome-color) 11%, rgba(10, 18, 14, 0.74));
  border: 1px solid color-mix(in srgb, var(--tome-color) 30%, transparent);
  box-shadow: inset 3px 0 0 var(--tome-color);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.6;
}

.card-action {
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(225, 211, 170, 0.14);
  color: #c8d4c4;
  font-size: 11.5px;
  font-weight: 700;
}

.tome-options .card-action span {
  padding: 4px 11px;
  border-radius: 999px;
  color: #f7df94;
  background: rgba(215, 184, 110, 0.14);
  border: 1px solid rgba(215, 184, 110, 0.34);
  transition: background 0.16s ease, color 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
}

.tome-options button.selected:not(:disabled) .card-action span,
.tome-options button:hover:not(:disabled) .card-action span {
  color: #0e1914;
  background: linear-gradient(135deg, #f7df94, #d7b86e);
  border-color: #f7df94;
  box-shadow: 0 3px 12px rgba(215, 184, 110, 0.35);
}

/* 源质记忆卡（原生黏液吸收首领源质）：更醒目的生态光条与身份徽章 */
.tome-options button.is-memory {
  border-color: color-mix(in srgb, var(--tome-color) 62%, #f7df94 38%);
  background:
    radial-gradient(circle at 50% 18%, color-mix(in srgb, var(--tome-color) 22%, transparent) 0%, transparent 60%),
    linear-gradient(180deg, color-mix(in srgb, var(--tome-color) 11%, #1c2c24) 0%, rgba(15, 25, 20, 0.99) 100%);
  box-shadow:
    inset 3px 0 0 var(--tome-color),
    inset 0 1px 0 rgba(255, 246, 214, 0.14),
    0 12px 30px rgba(0, 0, 0, 0.42);
}

.tome-options button.is-memory .card-kind {
  color: #0e1914;
  background: linear-gradient(135deg, color-mix(in srgb, var(--tome-color) 75%, #ffffff 25%), var(--tome-color));
  border-color: rgba(255, 255, 255, 0.65);
  font-weight: 800;
  letter-spacing: 0.5px;
}

.reward-options p.card-source {
  width: 100%;
  margin: 0 0 8px;
  text-align: center;
  color: #e6cb88;
  font-size: 11.5px;
  font-weight: 650;
  letter-spacing: 0.4px;
}

.reward-options p.card-trigger {
  box-sizing: border-box;
  width: 100%;
  margin: 0 0 14px;
  padding: 7px 10px;
  border-left: 2.5px solid var(--tome-color);
  border-radius: 0 8px 8px 0;
  color: #d5e2d0;
  font-size: 11px;
  line-height: 1.55;
  background: color-mix(in srgb, var(--tome-color) 10%, rgba(10, 18, 14, 0.72));
}

.reward-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  margin: 20px 0 0;
  color: var(--art-muted, #a9b6a4);
  font-size: 11.5px;
  line-height: 1.6;
}

.reward-footer span {
  padding: 4px 12px;
  border-radius: 999px;
  color: #c8d4c4;
  background: rgba(10, 18, 14, 0.66);
  border: 1px solid rgba(225, 211, 170, 0.18);
}

@media (max-width: 720px) {
  .reward-overlay { padding: 12px; }
  .reward-panel { padding: 18px 14px 16px; max-height: calc(100dvh - 24px); }
  .reward-heading { margin-bottom: 16px; }
  h2 { font-size: 22px; }
  .reward-options { grid-template-columns: 1fr; gap: 12px; }
  .reward-options button { padding: 16px; }
  .reward-options button:hover:not(:disabled),
  .reward-options button.selected:not(:disabled) { transform: none; }
  .card-top { margin-bottom: 10px; }
  .tome-options button { display: grid; grid-template-columns: 58px minmax(0, 1fr); column-gap: 13px; }
  .tome-options .card-top, .tome-options .card-stats, .tome-options .card-action { grid-column: 1 / -1; }
  .tome-options h3, .tome-options p, .tome-options .tome-ranks { grid-column: 2; }
  .tome-options :deep(.skill-glyph) { grid-column: 1; grid-row: 2 / 5; align-self: start; margin: 4px 0; }
  .tome-options h3 { text-align: left; font-size: 17px; }
  .tome-options p.card-source { text-align: left; }
  .tome-options p { margin-bottom: 10px; }
  .tome-ranks { grid-column: 2; margin-bottom: 12px; }
  .reward-footer span { display: none; }
}
</style>
