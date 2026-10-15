<script setup>
import { ref, watch } from 'vue'
import { accountApi } from '../services/AccountClient.js'
import { GAMEPLAY_NAMES, ACCOUNT_MODES } from '../game/AccountRules.js'
import { MODES, DIFFICULTIES } from '../game/RunRules.js'
import { useDialogFocus } from './useDialogFocus.js'
import './account-panels.css'
const props = defineProps({ accountData: Object, pending: { type: Array, default: () => [] }, syncing: Boolean })
const emit = defineEmits(['close', 'retry', 'data', 'discard'])
const dialog = ref(null)
useDialogFocus(dialog, () => emit('close'))
const page = ref(1)
const gameplay = ref('all')
const filters = { all: '全部', ...GAMEPLAY_NAMES }
const history = ref(null)
const error = ref('')
const loading = ref(false)
const discardId = ref('')
let requestId = 0
watch([page, gameplay], load, { immediate: true })
function selectGameplay(id) {
  gameplay.value = id
  page.value = 1
}
async function load() {
  const id = ++requestId
  loading.value = true
  error.value = ''
  try {
    const payload = await accountApi.records(page.value, gameplay.value)
    if (id === requestId) { history.value = payload; emit('data', payload.accountData) }
  } catch (cause) { if (id === requestId) error.value = cause.message }
  finally { if (id === requestId) loading.value = false }
}
function modeLabel(entry) {
  return entry.gameplay === 'arena' ? `${MODES[entry.mode]?.name} · ${DIFFICULTIES[entry.difficulty]?.name}` : ACCOUNT_MODES[entry.gameplay]?.[entry.mode]
}
</script>
<template>
  <div class="account-overlay" @pointerdown.self="emit('close')">
    <section ref="dialog" class="account-dialog" role="dialog" aria-modal="true" aria-labelledby="records-title">
      <header><div><span class="eyebrow">MY RECORDS</span><h2 id="records-title">我的游戏记录</h2><p>主战场、突围与塔防的成绩和进度，随账号保存。</p></div><button class="close" aria-label="关闭游戏记录" @click="emit('close')">×</button></header>
      <div class="gameplay-summaries" aria-label="三个玩法的成绩概览">
        <section v-for="(name, id) in GAMEPLAY_NAMES" :key="id" class="gameplay-summary" :aria-label="`${name}成绩概览`">
          <div class="summary-heading"><h3>{{ name }}</h3><span>{{ history ? `${history.summary?.[id]?.plays || 0} 局` : '—' }}</span></div>
          <template v-if="id !== 'tower-defense'">
            <span class="metric-label">最高单局得分</span>
            <strong>{{ history?.summary?.[id]?.bestScore != null ? history.summary[id].bestScore.toLocaleString() : '—' }}</strong>
            <p>{{ !history ? '正在读取成绩…' : history.summary?.[id]?.plays ? `已通关 ${history.summary[id].clears} 次` : '尚未完成行动' }}</p>
          </template>
          <template v-else>
            <span class="metric-label">战役已解锁</span><strong>第 {{ accountData?.campaign?.unlockedStage || 1 }} 关</strong>
            <p>{{ accountData?.campaign?.totalStarsEarned || 0 }} / 297 星 · 无尽最佳 {{ accountData?.campaign?.endlessBestWave || 0 }} 波</p>
          </template>
        </section>
      </div>
      <div v-if="pending.length" class="pending-list" role="status">
        <strong>{{ pending.length }} 条记录等待同步</strong>
        <div v-for="job in pending" :key="job.ticketId"><p>{{ GAMEPLAY_NAMES[job.gameplay] }} · {{ job.error || '正在保存' }}</p>
          <template v-if="job.failed"><button v-if="discardId !== job.ticketId" :disabled="syncing" @click="discardId = job.ticketId">放弃此结算</button><template v-else><span>此局将无法恢复。</span><button :disabled="syncing" @click="emit('discard', job.ticketId); discardId = ''">确认放弃</button><button @click="discardId = ''">保留</button></template></template>
        </div>
        <button :disabled="syncing" @click="emit('retry')">{{ syncing ? '正在同步…' : '重试同步' }}</button>
      </div>
      <div class="board-meta"><span>行动历史 · {{ history?.overallTotal ?? '—' }} 局已同步</span><button :disabled="loading" @click="load">刷新</button></div>
      <div class="tabs record-filters" aria-label="筛选行动历史">
        <button v-for="(name, id) in filters" :key="id" :aria-pressed="gameplay === id" @click="selectGameplay(id)">{{ name }}<span class="filter-count">{{ history ? id === 'all' ? history.overallTotal : history.summary?.[id]?.plays || 0 : '—' }}</span></button>
      </div>
      <p v-if="loading" class="empty" role="status">正在读取记录…</p>
      <div v-else-if="error" class="empty error" role="alert">{{ error }} <button @click="load">重试</button></div>
      <div v-else-if="!history?.entries?.length" class="empty"><p>{{ gameplay === 'all' ? '还没有行动记录' : `还没有${GAMEPLAY_NAMES[gameplay]}记录` }}</p><p class="records-empty-hint">完成一局并同步后，成绩会显示在这里。中途放弃不会计入。</p></div>
      <div v-else class="table-scroll"><table><thead><tr><th>玩法 / 模式</th><th>得分</th><th>结果</th><th>时间</th></tr></thead><tbody>
        <tr v-for="entry in history.entries" :key="entry.id"><td>{{ GAMEPLAY_NAMES[entry.gameplay] }} · {{ modeLabel(entry) }}<span v-if="entry.gameplay === 'tower-defense'"> · {{ entry.mode === 'campaign' ? `第 ${entry.stage} 关` : `${entry.wave} 波` }}</span></td><td><strong>{{ entry.score.toLocaleString() }}</strong></td><td>{{ entry.result === 'victory' ? '通关' : entry.result === 'extracted' ? '撤离' : '结束' }}</td><td>{{ new Date(entry.submittedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }}</td></tr>
      </tbody></table></div>
      <footer class="pagination"><span>{{ loading ? '读取中…' : `共 ${history?.total || 0} 局` }}</span><button :disabled="loading || (history?.page || 1) <= 1" @click="page = history.page - 1">上一页</button><span>{{ history?.page || 1 }} / {{ history?.totalPages || 1 }}</span><button :disabled="loading || (history?.page || 1) >= (history?.totalPages || 1)" @click="page = history.page + 1">下一页</button></footer>
    </section>
  </div>
</template>
