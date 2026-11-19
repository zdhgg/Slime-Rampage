<script setup>
import './account-panels.css'
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
  <div class="account-overlay save-layer" @pointerdown.self="close">
    <section class="account-dialog account-dialog--flush save-dialog" role="dialog" aria-modal="true" aria-labelledby="save-title">
      <header class="dialog-header">
        <h2 id="save-title">史莱姆档案</h2>
        <button ref="closeButton" class="close" aria-label="关闭档案管理" title="关闭" @click="close">×</button>
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
                <div><dt>战力点</dt><dd>{{ Math.floor(slot.data?.drops || 0) }}</dd></div>
                <div><dt>基因等级</dt><dd>{{ geneLevels(slot) }}</dd></div>
                <div><dt>最高进度</dt><dd>{{ progressLabel(slot) }}</dd></div>
              </dl>
              <p>最后游玩 {{ formatDate(slot.lastPlayedAt) }}</p>
            </div>

            <div v-if="pendingDelete !== slot.id" class="slot-actions">
              <button
                v-if="slot.id !== activeSlotId"
                class="control-primary"
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
              <span>确认删除上述成长进度？历史成绩保留，操作前副本由服务器留存。</span>
              <div>
                <button class="cancel-button" @click="pendingDelete = ''">取消</button>
                <button class="control-danger" @click="confirmDelete(slot.id)">确认删除</button>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="slot-number" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</div>
            <div class="empty-copy">
              <h3>空档案位</h3>
              <p>创建一只从零开始的史莱姆</p>
            </div>
            <button class="create-button control-primary" @click="emit('create', index)">新建档案</button>
          </template>
        </article>
      </div>

    </section>
  </div>
</template>

<style scoped>
.save-layer { z-index: 55; }
.save-dialog { width: min(740px, 100%); scroll-padding-block: 92px 14px; }
.dialog-header {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 18px 22px 15px;
  border-bottom: 1px solid var(--adventure-line);
  background: var(--adventure-paper);
}
.slot-list { display: grid; gap: 9px; padding: 16px 22px 20px; }
.slot-row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  align-items: center;
  gap: 13px;
  min-height: 110px;
  padding: 15px 16px;
  border: 1px solid var(--adventure-line);
  border-radius: 9px;
  background: #f3f6f0;
}
.slot-row.active { border-color: #a7c0ae; background: #edf4ec; box-shadow: inset 3px 0 0 var(--adventure-green); }
.slot-row.empty { min-height: 82px; border-style: dashed; background: var(--adventure-paper); }
.slot-number { color: var(--adventure-muted); font-size: 15px; font-weight: 650; font-variant-numeric: tabular-nums; }
.slot-copy, .empty-copy { min-width: 0; }
.slot-title { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.slot-title h3, .empty-copy h3 { font-size: 15px; overflow-wrap: anywhere; }
.slot-title span {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--adventure-leaf);
  color: var(--adventure-green);
  font-size: 11px;
  font-weight: 650;
}
.slot-copy dl { display: flex; flex-wrap: wrap; gap: 5px 16px; margin-top: 8px; }
.slot-copy dl div { display: flex; align-items: baseline; gap: 5px; }
.slot-copy dt { color: var(--adventure-muted); font-size: 12px; }
.slot-copy dd { font-size: 12px; font-weight: 650; font-variant-numeric: tabular-nums; }
.slot-copy p, .empty-copy p { margin-top: 6px; font-size: 12px; }

.slot-actions, .delete-confirm { display: grid; gap: 6px; }
.slot-actions { width: 108px; }
.delete-confirm { width: 146px; }
.delete-confirm > span { color: var(--adventure-danger); font-size: 12px; text-align: center; }
.delete-confirm > div { display: grid; grid-template-columns: 1fr 1.45fr; gap: 5px; }
.slot-list button { min-height: 36px; padding-inline: 8px; font-size: 12px; font-weight: 650; }

@media (max-width: 640px) {
  .dialog-header { padding: 14px 15px 11px; }
  .slot-list { padding: 12px 14px 14px; }
  .slot-row { grid-template-columns: 24px minmax(0, 1fr); gap: 7px 9px; padding: 11px; }
  .slot-actions, .delete-confirm, .create-button { grid-column: 2; width: 100%; }
  .slot-actions { grid-template-columns: 1fr 1fr; }
  .delete-confirm > span { text-align: left; }
}
</style>
