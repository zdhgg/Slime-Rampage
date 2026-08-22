<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'

const emit = defineEmits(['close', 'create', 'switch', 'delete'])
const props = defineProps({
  slots: { type: Array, default: () => [] },
  activeSlotId: { type: String, default: '' },
})

const pendingDelete = ref('')
const closeButton = ref(null)
const occupiedCount = computed(() => props.slots.filter(Boolean).length)

const MODE_NAMES = { expedition: '远征', timed: '限时', endless: '无尽' }
const DIFFICULTY_NAMES = { normal: '普通', hard: '困难', nightmare: '噩梦', hell: '地狱' }

function geneLevels(slot) {
  return Object.values(slot?.data?.genes || {}).reduce((sum, level) => sum + Number(level || 0), 0)
}

function progressLabel(slot) {
  const progression = slot?.data?.progression || {}
  const mode = MODE_NAMES[progression.highestMode] || MODE_NAMES.expedition
  const difficulty = DIFFICULTY_NAMES[progression.highestDifficulty] || DIFFICULTY_NAMES.normal
  return `${mode} · ${difficulty}`
}

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '刚刚建立'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function requestDelete(id) {
  pendingDelete.value = id
}

function confirmDelete(id) {
  pendingDelete.value = ''
  emit('delete', id)
}

function close() {
  pendingDelete.value = ''
  emit('close')
}

function onKeydown(event) {
  if (event.code !== 'Escape') return
  if (pendingDelete.value) pendingDelete.value = ''
  else close()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  nextTick(() => closeButton.value?.focus())
})

onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="save-layer" @pointerdown.self="close">
    <section class="save-dialog" role="dialog" aria-modal="true" aria-labelledby="save-title">
      <header class="dialog-header">
        <div>
          <span>本地进度</span>
          <h2 id="save-title">史莱姆档案</h2>
        </div>
        <button ref="closeButton" class="close-button" aria-label="关闭档案管理" title="关闭" @click="close">×</button>
      </header>

      <div class="slot-list">
        <article
          v-for="(slot, index) in slots"
          :key="slot?.id || `empty-${index}`"
          class="slot-row"
          :class="{ active: slot?.id === activeSlotId, empty: !slot }"
        >
          <template v-if="slot">
            <div class="slot-number" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</div>
            <div class="slot-copy">
              <div class="slot-title">
                <h3>{{ slot.name }}</h3>
                <span v-if="slot.id === activeSlotId">当前档案</span>
              </div>
              <dl>
                <div><dt>战利品</dt><dd>{{ Math.floor(slot.data?.drops || 0) }}</dd></div>
                <div><dt>基因等级</dt><dd>{{ geneLevels(slot) }}</dd></div>
                <div><dt>最高进度</dt><dd>{{ progressLabel(slot) }}</dd></div>
              </dl>
              <p>最后游玩 {{ formatDate(slot.lastPlayedAt) }}</p>
            </div>

            <div v-if="pendingDelete !== slot.id" class="slot-actions">
              <button
                v-if="slot.id !== activeSlotId"
                class="switch-button"
                @click="emit('switch', slot.id)"
              >
                切换
              </button>
              <button v-else class="current-button" disabled>使用中</button>
              <button
                class="delete-button"
                :disabled="occupiedCount <= 1"
                :title="occupiedCount <= 1 ? '至少保留一个档案' : '删除档案'"
                @click="requestDelete(slot.id)"
              >
                删除
              </button>
            </div>

            <div v-else class="delete-confirm" role="alert">
              <span>删除后无法恢复</span>
              <div>
                <button class="cancel-button" @click="pendingDelete = ''">取消</button>
                <button class="confirm-button" @click="confirmDelete(slot.id)">确认删除</button>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="slot-number" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</div>
            <div class="empty-copy">
              <h3>空档案位</h3>
              <p>创建一只从零开始的史莱姆</p>
            </div>
            <button class="create-button" @click="emit('create', index)">新建档案</button>
          </template>
        </article>
      </div>

    </section>
  </div>
</template>

<style scoped>
.save-layer {
  position: fixed;
  inset: 0;
  z-index: 55;
  display: grid;
  place-items: center;
  padding: 24px;
  color: #f4eee6;
  background: rgba(4, 4, 3, 0.78);
  backdrop-filter: blur(8px);
}

.save-dialog {
  width: min(760px, 100%);
  max-height: min(720px, calc(100vh - 48px));
  overflow-y: auto;
  border: 1px solid rgba(238, 214, 180, 0.18);
  border-radius: 8px;
  background: #0e0d0b;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.46);
}

.dialog-header {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 90px;
  padding: 20px 22px;
  border-bottom: 1px solid rgba(238, 214, 180, 0.12);
  background: rgba(14, 13, 11, 0.96);
}

.dialog-header span {
  color: #b98747;
  font-size: 10px;
  font-weight: 800;
}

.dialog-header h2 {
  margin-top: 5px;
  font-size: 24px;
  letter-spacing: 0;
}

button {
  font: inherit;
}

.close-button {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid rgba(238, 214, 180, 0.16);
  border-radius: 5px;
  color: rgba(244, 238, 230, 0.72);
  background: transparent;
  font-size: 22px;
  cursor: pointer;
}

.slot-list {
  display: grid;
  gap: 10px;
  padding: 18px 22px 20px;
}

.slot-row {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  min-height: 136px;
  padding: 17px 18px;
  border: 1px solid rgba(238, 214, 180, 0.12);
  border-radius: 6px;
  background: #13110e;
}

.slot-row.active {
  border-color: rgba(215, 166, 87, 0.55);
  box-shadow: inset 3px 0 0 #d7a657;
}

.slot-row.empty {
  min-height: 98px;
  border-style: dashed;
  background: rgba(255, 255, 255, 0.018);
}

.slot-number {
  color: rgba(236, 196, 119, 0.62);
  font-size: 16px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}

.slot-copy,
.empty-copy {
  min-width: 0;
}

.slot-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.slot-title h3,
.empty-copy h3 {
  font-size: 15px;
  letter-spacing: 0;
}

.slot-title span {
  padding: 3px 7px;
  border-radius: 4px;
  color: #edc77f;
  background: rgba(215, 166, 87, 0.12);
  font-size: 9px;
  font-weight: 800;
}

.slot-copy dl {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 22px;
  margin-top: 16px;
}

.slot-copy dl div {
  display: flex;
  align-items: baseline;
  gap: 7px;
}

.slot-copy dt {
  color: rgba(244, 238, 230, 0.42);
  font-size: 10px;
}

.slot-copy dd {
  color: rgba(244, 238, 230, 0.86);
  font-size: 11px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.slot-copy p,
.empty-copy p {
  margin-top: 10px;
  color: rgba(244, 238, 230, 0.38);
  font-size: 10px;
}

.slot-actions,
.delete-confirm {
  display: grid;
  width: 116px;
  gap: 8px;
}

.slot-actions button,
.delete-confirm button,
.create-button {
  min-height: 36px;
  padding: 0 13px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.switch-button,
.create-button {
  border: 1px solid rgba(215, 166, 87, 0.5);
  color: #251a0d;
  background: #d7a657;
}

.current-button {
  border: 1px solid rgba(215, 166, 87, 0.25);
  color: rgba(236, 196, 119, 0.66);
  background: rgba(215, 166, 87, 0.08);
}

.delete-button,
.cancel-button {
  border: 1px solid rgba(238, 214, 180, 0.14);
  color: rgba(244, 238, 230, 0.62);
  background: transparent;
}

.delete-button:disabled {
  color: rgba(244, 238, 230, 0.24);
  cursor: not-allowed;
}

.delete-confirm {
  width: 142px;
}

.delete-confirm > span {
  color: #e6a56f;
  font-size: 10px;
  text-align: center;
}

.delete-confirm > div {
  display: grid;
  grid-template-columns: 1fr 1.3fr;
  gap: 6px;
}

.confirm-button {
  border: 1px solid rgba(202, 92, 72, 0.54);
  color: #f4c2b7;
  background: rgba(143, 50, 38, 0.2);
}

.create-button {
  min-width: 116px;
}

.close-button:hover,
.delete-button:not(:disabled):hover,
.cancel-button:hover {
  border-color: rgba(215, 166, 87, 0.42);
  color: #fffaf2;
  background: rgba(215, 166, 87, 0.07);
}

.switch-button:hover,
.create-button:hover {
  background: #e3b566;
}

.confirm-button:hover {
  background: rgba(160, 57, 43, 0.32);
}

button:active:not(:disabled) {
  transform: scale(0.97);
}

button:focus-visible {
  outline: 2px solid #ecc477;
  outline-offset: 3px;
}

@media (max-width: 640px) {
  .save-layer { align-items: end; padding: 0; }
  .save-dialog {
    width: 100%;
    max-height: 92vh;
    border-right: 0;
    border-bottom: 0;
    border-left: 0;
    border-radius: 8px 8px 0 0;
  }
  .dialog-header { min-height: 78px; padding: 16px; }
  .slot-list { padding: 14px 16px 18px; }
  .slot-row {
    grid-template-columns: 32px minmax(0, 1fr);
    gap: 10px;
    padding: 15px 13px;
  }
  .slot-actions,
  .delete-confirm,
  .create-button {
    grid-column: 2;
    width: 100%;
  }
  .slot-actions { grid-template-columns: 1fr 1fr; }
  .delete-confirm > span { text-align: left; }
  .slot-copy dl { gap: 8px 14px; }
}

@media (prefers-reduced-motion: reduce) {
  button { transition: none; }
}
</style>
