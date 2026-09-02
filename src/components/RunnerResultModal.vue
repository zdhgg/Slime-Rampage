<script setup>
import { computed } from 'vue'
import { Home, RotateCcw } from 'lucide-vue-next'

const props = defineProps({
  info: { type: Object, required: true },
})
const emit = defineEmits(['restart', 'menu'])
const victory = computed(() => props.info.outcome === 'victory')
const scoreText = computed(() => (props.info.score || 0).toLocaleString('en-US'))
const weaponMetric = computed(() => {
  if (props.info.weapon?.id === 'pierce') return `贯穿 ${props.info.weaponStats?.pierced || 0} 次`
  if (props.info.weapon?.id === 'burst') return `爆裂 ${props.info.weaponStats?.explosions || 0} 次`
  if (props.info.weapon?.id === 'corrosion') return `腐蚀命中 ${props.info.weaponStats?.corrosionStacks || 0} 次`
  return ''
})
</script>

<template>
  <div class="result-overlay" role="dialog" aria-modal="true" aria-label="极速突围结算">
    <section class="result-panel" :class="{ victory }">
      <div class="result-kicker">{{ info.submodeName ? `极速突围 · ${info.submodeName}` : '极速突围 · 行动结算' }}</div>
      <h2>{{ info.title }}</h2>
      <p class="result-summary">
        {{ info.isEndless ? `已极限狂飙突破 ${info.distance} 米` : victory ? '已成功越过王城封锁线' : `距出口还有 ${info.distance} 米` }}
      </p>

      <div class="score-block">
        <span>行动得分</span>
        <strong>{{ scoreText }}</strong>
      </div>

      <div v-if="info.weapon" class="weapon-result" :style="{ '--weapon-color': info.weapon.color }">
        <i aria-hidden="true" />
        <span>最终弹道</span>
        <strong>{{ info.weapon.name }} Lv.{{ info.weapon.level }}</strong>
        <em v-if="weaponMetric">{{ weaponMetric }}</em>
      </div>

      <div class="result-stats">
        <div><span>{{ info.isEndless ? '存活时间' : '用时' }}</span><b>{{ info.timeLabel }}</b></div>
        <div v-if="info.isEndless"><span>极限里程</span><b>{{ info.distance }}m</b></div>
        <div><span>击破</span><b>{{ info.kills }}</b></div>
        <div><span>强化门</span><b>{{ info.gates }}</b></div>
        <div><span>最高连破</span><b>×{{ info.bestCombo }}</b></div>
        <div><span>狂热暴走</span><b>{{ info.feverCount || 0 }} 次</b></div>
        <div><span>战术道具</span><b>{{ (info.tacticalStats?.magnets || 0) + (info.tacticalStats?.bulletTimes || 0) + (info.tacticalStats?.boosters || 0) + (info.tacticalStats?.drones || 0) }} 次</b></div>
        <div><span>引爆炸药</span><b>{{ info.tacticalStats?.barrels || 0 }} 桶</b></div>
        <div><span>冲撞击杀</span><b>{{ info.dashKills || 0 }}</b></div>
        <div><span>承受冲击</span><b>{{ info.hitsTaken }}</b></div>
        <div><span>护盾吸收</span><b>{{ info.shieldAbsorbed || 0 }}</b></div>
        <div><span>最终攻击</span><b>{{ info.attack }}</b></div>
      </div>

      <div class="result-actions">
        <button class="primary" autofocus @click="emit('restart')">
          <RotateCcw :size="18" aria-hidden="true" />
          再次突围
        </button>
        <button @click="emit('menu')">
          <Home :size="18" aria-hidden="true" />
          返回主界面
        </button>
      </div>
      <div class="trial-note">独立试玩不写入档案与排行榜</div>
    </section>
  </div>
</template>

<style scoped>
.result-overlay {
  position: absolute;
  inset: 0;
  z-index: 22;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(4, 10, 15, 0.72);
  backdrop-filter: blur(5px);
}

.result-panel {
  width: min(480px, calc(100vw - 48px));
  padding: 30px 34px 26px;
  border: 1px solid rgba(232, 116, 93, 0.42);
  border-top: 3px solid #df765f;
  border-radius: 6px;
  color: #edf4f1;
  background: #111b23;
  box-shadow: 0 22px 64px rgba(0, 0, 0, 0.56);
  font-family: "Segoe UI", "PingFang SC", sans-serif;
  letter-spacing: 0;
  text-align: center;
}

.result-panel.victory {
  border-color: rgba(131, 223, 81, 0.42);
  border-top-color: #83df51;
}

.result-kicker {
  color: #82d7e9;
  font-size: 11px;
  font-weight: 800;
}

h2 {
  margin: 7px 0 4px;
  color: #f4f7f2;
  font-size: 30px;
  line-height: 1.2;
}

.victory h2 {
  color: #cfffaa;
}

.result-summary {
  margin: 0;
  color: rgba(237, 244, 241, 0.58);
  font-size: 13px;
}

.score-block {
  margin: 24px 0 20px;
}

.score-block span {
  display: block;
  color: rgba(237, 244, 241, 0.48);
  font-size: 10px;
  font-weight: 800;
}

.score-block strong {
  display: block;
  margin-top: 2px;
  color: #f3d879;
  font-size: 42px;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.result-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.weapon-result {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin: -8px 0 18px;
  font-size: 11px;
}

.weapon-result i {
  width: 3px;
  height: 15px;
  border-radius: 1px;
  background: var(--weapon-color);
}

.weapon-result span {
  color: rgba(237, 244, 241, 0.46);
}

.weapon-result strong {
  color: var(--weapon-color);
}

.weapon-result em {
  color: rgba(237, 244, 241, 0.5);
  font-size: 10px;
  font-style: normal;
}

.result-stats div {
  min-width: 0;
  padding: 13px 5px;
}

.result-stats div:not(:nth-child(4n)) {
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}

.result-stats span,
.result-stats b {
  display: block;
}

.result-stats span {
  overflow-wrap: anywhere;
  color: rgba(237, 244, 241, 0.46);
  font-size: 10px;
}

.result-stats b {
  margin-top: 3px;
  color: #ecf2ef;
  font-size: 16px;
  font-variant-numeric: tabular-nums;
}

.result-actions {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 9px;
  margin-top: 22px;
}

button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 5px;
  color: rgba(245, 248, 246, 0.86);
  background: rgba(255, 255, 255, 0.06);
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: background 0.14s ease, border-color 0.14s ease, transform 0.08s ease;
}

button.primary {
  border-color: #a8ed7f;
  color: #0c160d;
  background: #83df51;
}

button:hover {
  border-color: rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.11);
}

button.primary:hover {
  border-color: #c4ffa2;
  background: #94e969;
}

button:active {
  transform: scale(0.98);
}

button:focus-visible {
  outline: 2px solid #d7ffba;
  outline-offset: 3px;
}

.trial-note {
  margin-top: 14px;
  color: rgba(237, 244, 241, 0.36);
  font-size: 10px;
}

@media (max-width: 540px) {
  .result-panel {
    padding: 26px 20px 22px;
  }

  .result-actions {
    grid-template-columns: 1fr;
  }

  .result-stats {
    grid-template-columns: repeat(2, 1fr);
  }

  .result-stats div:not(:nth-child(4n)) {
    border-right: 0;
  }

  .result-stats div:nth-child(odd) {
    border-right: 1px solid rgba(255, 255, 255, 0.08);
  }
}
</style>
