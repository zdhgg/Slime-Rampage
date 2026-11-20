<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { RefreshCw, Sparkles } from 'lucide-vue-next'
import { useCardFocus } from './useCardFocus.js'

const props = defineProps({
  draft: { type: Object, required: true },
})
const emit = defineEmits(['select', 'reroll'])

const options = computed(() => props.draft?.options || [])
const canReroll = computed(() => {
  if (!props.draft) return false
  return (props.draft.freeRerolls || 0) > 0 || (props.draft.bountyCredits || 0) >= (props.draft.rerollCost || 1500)
})

const { selectedIndex } = useCardFocus(
  () => options.value,
  (card) => emit('select', card.id),
  true
)

function onKeyDown(event) {
  if (event.code === 'KeyR' && !event.repeat && canReroll.value) {
    event.preventDefault()
    emit('reroll')
  }
}

onMounted(() => window.addEventListener('keydown', onKeyDown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown))
</script>

<template>
  <div class="draft-overlay" role="dialog" aria-modal="true" :aria-label="draft.isBossRelic ? '首领遗物抉择' : '进化词条三选一'">
    <section class="draft-panel" :class="{ relic: draft.isBossRelic }">
      <header class="draft-head">
        <div class="draft-kicker">
          <Sparkles :size="15" aria-hidden="true" />
          <span>{{ draft.isBossRelic ? 'BOSS RELIC · 首领战利品' : `EVOLUTION Lv.${draft.level} · 进化抽卡` }}</span>
        </div>
        <h2>{{ draft.isBossRelic ? '选择一件守关遗物' : '选择强化词条' }}</h2>
        <p class="draft-sub">使用 <kbd>←</kbd> <kbd>→</kbd> 或数字键 <kbd>1</kbd>–<kbd>3</kbd> 选卡，<kbd>Enter</kbd> 确认</p>
      </header>

      <div class="draft-cards">
        <button
          v-for="(card, index) in options"
          :key="card.id"
          type="button"
          class="draft-card"
          :class="{ selected: selectedIndex === index, fusion: !!card.synergyHint }"
          :style="{ '--card-color': card.color || '#38bdf8' }"
          @mouseenter="selectedIndex = index"
          @click="emit('select', card.id)"
        >
          <span class="card-index">{{ index + 1 }}</span>
          <span class="card-badge">{{ card.badge }}</span>
          <div class="card-icon">{{ card.icon || '✦' }}</div>
          <h3>{{ card.name }}</h3>
          <span class="card-lv">
            {{ card.level > 0 ? `Lv.${card.level} → Lv.${card.nextLevel}` : '新解锁 Lv.1' }}
          </span>
          <p class="card-desc">{{ card.description }}</p>
          <div v-if="card.synergyHint" class="synergy-pill">{{ card.synergyHint }}</div>
        </button>
      </div>

      <footer class="draft-foot">
        <div class="credit-info">
          <span>悬赏信用: <b>{{ (draft.bountyCredits || 0).toLocaleString('en-US') }}</b></span>
          <span v-if="draft.freeRerolls > 0" class="free-tag">免费刷新 ×{{ draft.freeRerolls }}</span>
        </div>
        <button
          type="button"
          class="reroll-btn"
          :disabled="!canReroll"
          @click="emit('reroll')"
        >
          <RefreshCw :size="15" aria-hidden="true" />
          <span v-if="draft.freeRerolls > 0">免费重随 ({{ draft.freeRerolls }})</span>
          <span v-else>重随词条 ({{ draft.rerollCost || 1500 }} 信用)</span>
          <kbd>R</kbd>
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.draft-overlay {
  position: fixed;
  inset: 0;
  z-index: 24;
  display: grid;
  place-items: center;
  padding: 20px;
  background: var(--adventure-scrim);
  backdrop-filter: blur(8px);
}
.draft-panel {
  width: min(820px, 100%);
  padding: 26px 28px 22px;
  border-radius: 14px;
  background: var(--adventure-paper);
  border: 2px solid var(--adventure-line);
  box-shadow: 0 24px 64px rgba(15, 23, 42, 0.35);
  color: var(--adventure-ink);
  font-family: "Segoe UI", "PingFang SC", sans-serif;
}
.draft-panel.relic {
  border-color: #f59e0b;
  box-shadow: 0 24px 64px rgba(245, 158, 11, 0.25);
}
.draft-head {
  text-align: center;
  margin-bottom: 18px;
}
.draft-kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  background: #e0f2fe;
  color: #0369a1;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
}
.relic .draft-kicker {
  background: #fef3c7;
  color: #b45309;
}
.draft-head h2 {
  margin: 8px 0 4px;
  font-size: 24px;
  font-weight: 800;
}
.draft-sub {
  margin: 0;
  color: var(--adventure-muted);
  font-size: 12px;
}
.draft-sub kbd, .reroll-btn kbd {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 4px;
  background: #e2e8f0;
  border: 1px solid #cbd5e1;
  font-size: 11px;
  font-weight: 700;
  color: #1e293b;
}

.draft-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}
.draft-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 18px 14px 16px;
  border-radius: 12px;
  background: #f8fafc;
  border: 2px solid #dbe3e8;
  cursor: pointer;
  transition: transform 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease, background 0.14s ease;
  color: var(--adventure-ink);
  font: inherit;
}
.draft-card.selected, .draft-card:hover {
  transform: translateY(-4px);
  border-color: var(--card-color);
  background: #ffffff;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.14);
}
.draft-card.fusion {
  background: linear-gradient(180deg, #fffbeb 0%, #f8fafc 100%);
}
.card-index {
  position: absolute;
  top: 8px;
  left: 10px;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: #e2e8f0;
  color: #334155;
  font-size: 12px;
  font-weight: 800;
  display: grid;
  place-items: center;
}
.selected .card-index {
  background: var(--card-color);
  color: #0f172a;
}
.card-badge {
  margin-top: 4px;
  font-size: 11px;
  font-weight: 750;
  color: color-mix(in srgb, var(--card-color) 65%, #1e293b);
}
.card-icon {
  margin: 12px 0 8px;
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  font-size: 26px;
  background: color-mix(in srgb, var(--card-color) 18%, #ffffff);
  border: 1.5px solid color-mix(in srgb, var(--card-color) 55%, #ffffff);
}
.draft-card h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
}
.card-lv {
  margin-top: 3px;
  font-size: 12px;
  font-weight: 700;
  color: #0369a1;
}
.card-desc {
  margin: 10px 0 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--adventure-muted);
  flex: 1;
}
.synergy-pill {
  margin-top: 10px;
  padding: 4px 9px;
  border-radius: 999px;
  background: #fef3c7;
  border: 1px solid #f59e0b;
  color: #92400e;
  font-size: 11px;
  font-weight: 750;
}

.draft-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--adventure-line);
}
.credit-info {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: var(--adventure-muted);
}
.credit-info b {
  color: var(--adventure-gold);
}
.free-tag {
  padding: 2px 8px;
  border-radius: 999px;
  background: #dcfce7;
  color: #166534;
  font-size: 11px;
  font-weight: 750;
}
.reroll-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  background: #f1f5f9;
  color: #0f172a;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.reroll-btn:hover:not(:disabled) {
  background: #e2e8f0;
  border-color: #94a3b8;
}
.reroll-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (max-width: 720px) {
  .draft-cards {
    grid-template-columns: 1fr;
  }
}
</style>
