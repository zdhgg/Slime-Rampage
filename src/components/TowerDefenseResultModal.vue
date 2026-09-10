<script setup>
import { computed } from 'vue'
import { Home, RotateCcw, ShieldCheck, Swords } from 'lucide-vue-next'

const props = defineProps({
  info: { type: Object, required: true },
})
const emit = defineEmits(['restart', 'menu'])
const victory = computed(() => props.info.outcome === 'victory' || props.info.result === 'victory' || props.info.success === true)
const scoreText = computed(() => (props.info.score || 0).toLocaleString('en-US'))
const endless = computed(() => props.info.isEndless === true)
const waveText = computed(() => {
  if (endless.value) return `${props.info.endlessWave ?? props.info.wave ?? 0} / ∞`
  return props.info.wave ? `${props.info.wave}${props.info.totalWaves ? ` / ${props.info.totalWaves}` : ''}` : '—'
})
const livesText = computed(() => props.info.lives != null ? `${props.info.lives}${props.info.maxLives ? ` / ${props.info.maxLives}` : ''}` : '—')
const stats = computed(() => {
  const rows = [
    ['防守波次', waveText.value],
  ]
  if (endless.value) {
    rows.push(['历史最佳', props.info.endlessBest != null ? `第 ${props.info.endlessBest} 波` : '—'])
  }
  rows.push(
    ['巢心耐久', livesText.value],
    ['建造数量', props.info.towersBuilt ?? props.info.built ?? 0],
    ['击破敌人', props.info.kills ?? props.info.defeated ?? 0],
    ['升级次数', props.info.upgrades ?? 0],
    ['剩余资源', props.info.coins ?? props.info.gold ?? 0],
  )
  return rows
})
</script>

<template>
  <div class="tower-result-overlay" role="dialog" aria-modal="true" aria-label="塔防行动结算">
    <section class="tower-result-panel" :class="{ victory }">
      <div class="result-kicker"><ShieldCheck :size="15" aria-hidden="true" />塔防行动 · 结算报告</div>
      <h2>{{ info.title || (victory ? '防线守住' : '防线失守') }}</h2>
      <p class="result-summary">{{ info.summary || (victory ? '巢心完整，所有来袭单位已被拦截。' : '巢心耐久归零，防线需要重新部署。') }}</p>

      <div class="score-block">
        <span>行动得分</span>
        <strong>{{ scoreText }}</strong>
      </div>

      <div class="result-stats">
        <div v-for="([label, value], index) in stats" :key="label" :class="{ last: index === stats.length - 1 }">
          <span>{{ label }}</span><b>{{ value }}</b>
        </div>
      </div>

      <div class="result-actions">
        <button class="primary" autofocus @click="emit('restart')">
          <RotateCcw :size="18" aria-hidden="true" />
          再次部署
        </button>
        <button @click="emit('menu')">
          <Home :size="18" aria-hidden="true" />
          返回主界面
        </button>
      </div>
      <div class="result-note"><Swords :size="13" aria-hidden="true" />塔防记录仅用于本次行动</div>
    </section>
  </div>
</template>

<style scoped>
.tower-result-overlay {
  position: absolute;
  inset: 0;
  z-index: 22;
  display: grid;
  place-items: center;
  overflow: auto;
  padding: 24px;
  background: rgba(4, 10, 15, 0.74);
  backdrop-filter: blur(5px);
}

.tower-result-panel {
  width: min(480px, calc(100vw - 48px));
  padding: 28px 32px 24px;
  border: 1px solid rgba(223, 118, 95, 0.42);
  border-top: 3px solid #df765f;
  border-radius: 6px;
  color: #edf4f1;
  background: #111b23;
  box-shadow: 0 22px 64px rgba(0, 0, 0, 0.56);
  font-family: "Segoe UI", "PingFang SC", sans-serif;
  letter-spacing: 0;
  text-align: center;
}

.tower-result-panel.victory { border-color: rgba(145, 220, 140, 0.46); border-top-color: #91dc8c; }
.result-kicker { display: inline-flex; align-items: center; gap: 6px; color: #79d5e6; font-size: 11px; font-weight: 800; }
.result-kicker svg { color: #91dc8c; }
h2 { margin: 8px 0 4px; color: #f4f7f2; font-size: 30px; line-height: 1.2; }
.victory h2 { color: #cfffaa; }
.result-summary { margin: 0; color: rgba(237, 244, 241, 0.58); font-size: 13px; line-height: 1.5; }
.score-block { margin: 22px 0 19px; }
.score-block span { display: block; color: rgba(237, 244, 241, 0.48); font-size: 10px; font-weight: 800; }
.score-block strong { display: block; margin-top: 2px; color: #f3d879; font-size: 42px; font-variant-numeric: tabular-nums; line-height: 1.1; }
.result-stats { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid rgba(255, 255, 255, 0.1); border-bottom: 1px solid rgba(255, 255, 255, 0.1); }
.result-stats div { min-width: 0; padding: 12px 5px; border-right: 1px solid rgba(255, 255, 255, 0.08); }
.result-stats div:nth-child(3n) { border-right: 0; }
.result-stats span,
.result-stats b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.result-stats span { color: rgba(237, 244, 241, 0.46); font-size: 10px; }
.result-stats b { margin-top: 3px; color: #ecf2ef; font-size: 16px; font-variant-numeric: tabular-nums; }
.result-actions { display: grid; grid-template-columns: 1.2fr 1fr; gap: 9px; margin-top: 22px; }
button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 5px; color: rgba(245, 248, 246, 0.86); background: rgba(255, 255, 255, 0.06); font: inherit; font-size: 13px; font-weight: 800; cursor: pointer; transition: background 0.14s ease, border-color 0.14s ease, transform 0.08s ease; }
button.primary { border-color: #a8ed7f; color: #0c160d; background: #91dc8c; }
button:hover { border-color: rgba(255, 255, 255, 0.4); background: rgba(255, 255, 255, 0.11); }
button.primary:hover { border-color: #c4ffa2; background: #a5e99f; }
button:active { transform: scale(0.98); }
button:focus-visible { outline: 2px solid #d7ffba; outline-offset: 3px; }
.result-note { display: inline-flex; align-items: center; gap: 5px; margin-top: 14px; color: rgba(237, 244, 241, 0.36); font-size: 10px; }

@media (max-width: 540px) {
  .tower-result-overlay { padding: 14px; }
  .tower-result-panel { width: min(100%, 480px); padding: 24px 18px 20px; }
  .result-actions { grid-template-columns: 1fr; }
  .result-stats { grid-template-columns: repeat(2, 1fr); }
  .result-stats div:nth-child(3n) { border-right: 1px solid rgba(255, 255, 255, 0.08); }
  .result-stats div:nth-child(2n) { border-right: 0; }
}

@media (prefers-reduced-motion: reduce) { button { transition: none; } }
</style>
