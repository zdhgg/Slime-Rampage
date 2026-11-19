<script setup>
import { onMounted, ref } from 'vue'
import { accountApi } from '../services/AccountClient.js'
import { useDialogFocus } from './useDialogFocus.js'
import './account-panels.css'

const props = defineProps({ account: { type: Object, required: true } })
const emit = defineEmits(['close', 'toast'])

const dialog = ref(null)
const accounts = ref(null)
const message = ref('')
const busy = ref(false)
const pending = ref(null)
useDialogFocus(dialog, () => { if (!busy.value) emit('close') })

onMounted(load)

async function load() {
  try {
    const payload = await accountApi.adminAccounts()
    accounts.value = payload.accounts
  } catch (error) {
    message.value = error.message
  }
}

async function run(action) {
  busy.value = true
  message.value = ''
  try {
    await action()
  } catch (error) {
    message.value = error.message
  } finally {
    busy.value = false
  }
}

const askDisable = (row) => {
  pending.value = {
    kind: 'disable',
    user: row,
    label: `确认停用 ${row.displayName || row.username}？该账号会立即被踢下线且无法登录`,
  }
}

const onEnable = (row) => run(async () => {
  await accountApi.adminEnableAccount(row.id)
  emit('toast', `${row.displayName || row.username} 已恢复登录`, 'success')
  await load()
})

async function confirmPending() {
  const action = pending.value
  pending.value = null
  await run(async () => {
    if (action.kind === 'disable') {
      await accountApi.adminDisableAccount(action.user.id)
      emit('toast', `${action.user.displayName || action.user.username} 已停用`, 'info')
      await load()
    }
  })
}
</script>

<template>
  <div class="account-overlay" @pointerdown.self="!busy && emit('close')">
    <section ref="dialog" class="account-dialog admin-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-title">
      <header>
        <div>
          <h2 id="admin-title">账号管理</h2>
          <p>查看账号状态，停用或启用玩家账号。</p>
        </div>
        <button class="close" aria-label="关闭账号管理" :disabled="busy" @click="emit('close')">×</button>
      </header>

      <p v-if="message" class="admin-message" role="alert">{{ message }}</p>

      <section class="admin-block" aria-labelledby="accounts-title">
        <div class="block-head">
          <h3 id="accounts-title">账号列表</h3>
          <span>{{ accounts ? `${accounts.length} 个账号` : '读取中…' }}</span>
        </div>
        <div v-if="!accounts" class="empty">正在读取账号…</div>
        <div v-else class="table-scroll">
          <table>
            <thead>
              <tr><th>账号</th><th>进度</th><th>行动</th><th>操作</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in accounts" :key="row.id" :class="{ current: row.id === account.id }">
                <td>
                  <strong>{{ row.displayName || row.username }}</strong>
                  <span class="at">@{{ row.username }}</span>
                  <em v-if="row.admin" class="badge">管理员</em>
                  <em v-if="row.disabled" class="badge off">已停用</em>
                </td>
                <td>{{ row.slotCount }} 档案 · 塔防第 {{ row.campaignStage }} 关</td>
                <td>{{ row.runCount }} 局</td>
                <td class="ops">
                  <span v-if="row.id === account.id">当前账号</span>
                  <button v-else-if="!row.disabled" :disabled="busy || !!pending" @click="askDisable(row)">停用</button>
                  <button v-else :disabled="busy || !!pending" @click="onEnable(row)">启用</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div v-if="pending" class="confirm-bar" role="alert">
        <p>{{ pending.label }}</p>
        <div class="block-actions">
          <button :disabled="busy" @click="pending = null">取消</button>
          <button class="control-danger" :disabled="busy" @click="confirmPending">确认</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.admin-dialog { max-width: 720px; }
p.admin-message {
  margin-bottom: 14px;
  padding: 9px 12px;
  border: 1px solid var(--adventure-warning-line);
  border-radius: 7px;
  color: var(--adventure-gold);
  background: var(--adventure-warning-paper);
  font-size: 13px;
  overflow-wrap: anywhere;
}
.block-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 9px; }
.block-head h3 { margin: 0; font-size: 16px; }
.block-head span { color: var(--adventure-muted); font-size: 12px; }
.at { margin-left: 5px; color: var(--adventure-muted); font-size: 12px; }
.badge {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--adventure-leaf);
  color: var(--adventure-green);
  font-size: 11px;
  font-style: normal;
}
.badge.off { background: var(--adventure-warning-paper); color: var(--adventure-gold); }
.ops button { min-height: 34px; padding: 3px 10px; font-size: 12px; }
.confirm-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 14px;
  padding: 10px 12px;
  border: 1px solid var(--adventure-danger-line);
  border-radius: 7px;
  background: var(--adventure-danger-paper);
}
.confirm-bar p { color: var(--adventure-danger); font-size: 13px; }
.block-actions { display: flex; flex-wrap: wrap; gap: 7px; }
</style>
