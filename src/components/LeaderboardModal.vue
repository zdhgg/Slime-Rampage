<script setup>
import { computed, ref, watch } from 'vue'
import { accountApi } from '../services/AccountClient.js'
import { GAMEPLAY_NAMES, ACCOUNT_MODES } from '../game/AccountRules.js'
import { MODES, DIFFICULTIES } from '../game/RunRules.js'
import { useDialogFocus } from './useDialogFocus.js'
import './account-panels.css'

const emit = defineEmits(['close'])
const dialog = ref(null)
useDialogFocus(dialog, () => emit('close'))
const gameplay = ref('arena')
const mode = ref('expedition')
const difficulty = ref('normal')
const page = ref(1)
const board = ref(null)
const loading = ref(false)
const error = ref('')
let requestId = 0
const modes = computed(() => gameplay.value === 'arena'
  ? Object.fromEntries(Object.entries(MODES).map(([id, info]) => [id, info.name]))
  : ACCOUNT_MODES[gameplay.value])
watch(gameplay, () => {
  mode.value = gameplay.value === 'arena' ? 'expedition' : Object.keys(ACCOUNT_MODES[gameplay.value])[0]
  difficulty.value = gameplay.value === 'arena' ? 'normal' : 'standard'
  page.value = 1
})
watch([mode, difficulty], () => { page.value = 1 })
watch([gameplay, mode, difficulty, page], load, { immediate: true })
async function load() {
  const id = ++requestId
  loading.value = true
  error.value = ''
  try {
    const payload = await accountApi.leaderboard({ gameplay: gameplay.value, mode: mode.value, difficulty: difficulty.value, page: page.value, limit: 20 })
    if (id === requestId) board.value = payload.leaderboard
  } catch (cause) {
    if (id === requestId) { error.value = cause.message; board.value = null }
  } finally { if (id === requestId) loading.value = false }
}
</script>

<template>
  <div class="account-overlay" @pointerdown.self="emit('close')">
    <section ref="dialog" class="account-dialog" role="dialog" aria-modal="true" aria-labelledby="leaderboard-title">
      <header>
        <div><span class="eyebrow">LEADERBOARD</span><h2 id="leaderboard-title">排行榜</h2><p>每个账号展示一条最佳成绩，所有玩家均可查看。</p></div>
        <button class="close" aria-label="关闭排行榜" @click="emit('close')">×</button>
      </header>
      <div class="tabs" aria-label="排行榜玩法">
        <button v-for="(name, id) in GAMEPLAY_NAMES" :key="id" :aria-pressed="gameplay === id" @click="gameplay = id">{{ name }}</button>
      </div>
      <div class="filters">
        <label>模式<select v-model="mode"><option v-for="(name, id) in modes" :key="id" :value="id">{{ name }}</option></select></label>
        <label v-if="gameplay === 'arena'">难度<select v-model="difficulty"><option v-for="(info, id) in DIFFICULTIES" :key="id" :value="id">{{ info.name }}</option></select></label>
        <button :disabled="loading" @click="load">刷新</button>
      </div>
      <div class="board-meta"><span>{{ board?.totalPlayers || 0 }} 名玩家 · {{ gameplay === 'tower-defense' ? mode === 'campaign' ? '优先比较关卡，再比较得分' : '优先比较波次，再比较得分' : '按最佳成绩排名' }}</span>
        <span v-if="board?.currentRank">我的排名 #{{ board.currentRank }} <button :disabled="loading" @click="page = Math.ceil(board.currentRank / 20)">定位</button></span>
      </div>
      <p v-if="loading" class="empty" role="status">正在读取榜单…</p>
      <div v-else-if="error" class="empty error" role="alert">{{ error }} <button @click="load">重试</button></div>
      <div v-else-if="!board?.entries?.length" class="empty">这里还没有成绩，完成一局即可参与排名。</div>
      <div v-else class="table-scroll">
        <table><thead><tr><th>排名</th><th>玩家</th><th>得分</th><th>{{ gameplay === 'tower-defense' ? mode === 'campaign' ? '关卡' : '波次' : '击破' }}</th><th>结果</th></tr></thead>
          <tbody><tr v-for="entry in board.entries" :key="entry.runId" :class="{ current: entry.current }">
            <td>#{{ entry.rank }}</td><td>{{ entry.username }}{{ entry.current ? ' · 我' : '' }}</td>
            <td><strong>{{ entry.score.toLocaleString() }}</strong></td>
            <td>{{ gameplay === 'tower-defense' ? mode === 'campaign' ? `第 ${entry.stage} 关` : `${entry.wave} 波` : entry.kills }}</td>
            <td>{{ entry.result === 'victory' ? '通关' : entry.result === 'extracted' ? '撤离' : '结束' }}</td>
          </tr></tbody></table>
      </div>
      <footer class="pagination"><button :disabled="loading || (board?.page || 1) <= 1" @click="page = board.page - 1">上一页</button><span>{{ board?.page || 1 }} / {{ board?.totalPages || 1 }}</span><button :disabled="loading || (board?.page || 1) >= (board?.totalPages || 1)" @click="page = board.page + 1">下一页</button></footer>
    </section>
  </div>
</template>
