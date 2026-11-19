<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { Database, Download, Upload } from 'lucide-vue-next'
import { accountApi } from '../services/AccountClient.js'
import { BACKUP_MAX_BYTES } from '../game/SaveProtocol.js'
import { useDialogFocus } from './useDialogFocus.js'
import './account-panels.css'

const props = defineProps({
  account: { type: Object, required: true },
  status: { type: Object, default: () => ({ online: false }) },
  activeSlot: { type: Object, default: null },
  localSlot: { type: Object, default: null },
  continuation: { type: Object, default: null },
  savedAt: { type: String, default: '' },
  pendingCount: { type: Number, default: 0 },
  queueDurable: { type: Boolean, default: true },
  syncing: Boolean,
  busy: Boolean,
  message: { type: String, default: '' },
  localSaveNotice: { type: String, default: '' },
  recoveryNotice: { type: String, default: '' },
})
const emit = defineEmits(['close', 'profiles', 'records', 'import-local', 'refresh', 'server-restored', 'toast'])
const dialog = ref(null)
const accounts = ref(null)
const loadingAccounts = ref(false)
const selectedAccountId = ref(props.account.id)
const error = ref('')
const working = ref(false)
const pending = ref(null)
const cancelButton = ref(null)
const serverPicker = ref(null)
const accountPicker = ref(null)
const importTarget = ref(null)
const confirmMigration = ref(false)
const locked = computed(() => working.value || props.busy || props.syncing)
const selectedAccount = computed(() => accounts.value?.find(row => row.id === selectedAccountId.value))
const syncReady = computed(() => props.status.online && !props.pendingCount && !props.syncing)
const syncLabel = computed(() => props.syncing ? '正在同步游戏记录…'
  : props.pendingCount ? `${props.pendingCount} 条记录等待同步`
    : props.status.online ? '游戏进度随账号保存' : '暂时无法连接游戏服务')
const localSummary = computed(() => {
  const save = props.localSlot?.data
  if (!save) return '暂无可迁移的本机档案'
  const genes = Object.values(save.genes || {}).reduce((sum, level) => sum + Number(level || 0), 0)
  return `${props.localSlot.name} · 战力点 ${Math.floor(save.drops || 0)} · 基因等级 ${genes}`
})

useDialogFocus(dialog, () => { if (!locked.value) emit('close') })
watch([pending, locked], async ([action, isLocked]) => {
  if (!action || isLocked) return
  await nextTick()
  cancelButton.value?.focus()
})
onMounted(() => {
  if (props.account.admin) loadAccounts().catch(cause => { error.value = cause.message })
})

async function loadAccounts() {
  loadingAccounts.value = true
  try {
    const payload = await accountApi.adminAccounts()
    accounts.value = payload.accounts
  } finally { loadingAccounts.value = false }
}

async function run(action) {
  if (locked.value) return
  working.value = true
  error.value = ''
  try { await action() }
  catch (cause) { error.value = cause.message }
  finally { working.value = false }
}

function download(payload, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const dateStamp = () => new Date().toISOString().slice(0, 10).replaceAll('-', '')

function exportServer() {
  run(async () => {
    download(await accountApi.adminBackup(), `slime-rampage-server-${dateStamp()}.json`)
    emit('toast', '整服备份已导出', 'success')
  })
}

function exportAccount() {
  const row = selectedAccount.value
  if (!row) return
  run(async () => {
    download(await accountApi.adminExportAccount(row.id), `slime-rampage-backup-${row.username}-${dateStamp()}.json`)
    emit('toast', `已导出 ${row.displayName || row.username} 的进度备份`, 'success')
  })
}

function pickAccountFile() {
  importTarget.value = selectedAccount.value
  accountPicker.value?.click()
}

function readBackup(event, kind) {
  const file = event.target.files?.[0]
  event.target.value = ''
  const target = kind === 'account' ? importTarget.value : null
  importTarget.value = null
  if (!file || (kind === 'account' && !target)) return
  run(async () => {
    let payload
    try {
      if (file.size > BACKUP_MAX_BYTES) throw new Error('too large')
      payload = JSON.parse(await file.text())
    } catch {
      throw new Error('备份文件无法解析或过大，请选择有效的 JSON 文件')
    }
    const expectedKind = kind === 'server' ? 'slime-rampage-server-backup' : 'slime-rampage-backup'
    if (payload?.kind !== expectedKind) {
      throw new Error(kind === 'server' ? '这不是整服备份文件，请选择整服备份'
        : '这不是账号备份文件；整服备份请使用「恢复整服备份」')
    }
    const slots = (payload.catalog?.slots || []).filter(Boolean)
    const points = slots.reduce((sum, slot) => sum + Math.floor(Number(slot.data?.drops) || 0), 0)
    pending.value = {
      kind, payload, target, filename: file.name,
      summary: kind === 'server' ? `包含 ${Array.isArray(payload.accounts) ? payload.accounts.length : 0} 个账号的服务器快照`
        : `${slots.length} 个成长档案 · 战力点共 ${points} · 塔防解锁至第 ${payload.accountData?.campaign?.unlockedStage || 1} 关`,
    }
    dialog.value?.scrollTo({ top: 0 })
  })
}

function confirmRestore() {
  const action = pending.value
  if (!action) return
  run(async () => {
    if (action.kind === 'server') {
      await accountApi.adminRestore(action.payload)
      pending.value = null
      emit('server-restored')
    } else {
      const row = action.target
      await accountApi.adminImportAccount(row.id, { ...action.payload,
        expected: { saveEpoch: row.saveEpoch, accountRevision: row.accountRevision } })
      pending.value = null
      emit('toast', `${row.displayName || row.username} 的进度已恢复`, 'success')
      if (row.id === props.account.id) emit('refresh')
      await loadAccounts()
    }
  })
}
</script>

<template>
  <div class="account-overlay storage-overlay" @pointerdown.self="!locked && emit('close')">
    <section ref="dialog" class="account-dialog account-dialog--flush storage-dialog" role="dialog" aria-modal="true" aria-labelledby="storage-title" :aria-busy="locked">
      <header class="storage-header">
        <div class="storage-title-group">
          <span class="storage-icon"><Database :size="21" :stroke-width="1.7" aria-hidden="true" /></span>
          <div><h2 id="storage-title">数据与存档</h2><p>查看保存状态，管理档案与备份。</p></div>
        </div>
        <button class="close" aria-label="关闭数据与存档" :disabled="locked" @click="emit('close')">×</button>
      </header>

      <div class="storage-body">
        <p v-if="error || message" class="notice" :class="{ 'notice-error': error }" role="alert">{{ error || message }}</p>
        <p v-if="recoveryNotice" class="notice" role="alert">{{ recoveryNotice }}</p>

        <section v-if="pending" class="restore-confirm" aria-labelledby="restore-title">
          <h3 id="restore-title">{{ pending.kind === 'server' ? '恢复整服备份' : `恢复 ${pending.target.displayName || pending.target.username} 的进度` }}</h3>
          <p class="filename">{{ pending.filename }}</p>
          <p>{{ pending.summary }}</p>
          <p class="restore-warning">{{ pending.kind === 'server'
            ? '将整体覆盖服务器现有数据，所有玩家需要重新登录。恢复前会自动备份。'
            : `将覆盖 ${pending.target.displayName || pending.target.username} 的成长档案与塔防进度，保留行动历史。恢复前会自动备份，恢复前的行动将无法补交或续玩。` }}</p>
          <div class="actions">
            <button ref="cancelButton" :disabled="locked" @click="pending = null">取消</button>
            <button class="control-danger" :disabled="locked" @click="confirmRestore">{{ working ? '正在恢复…' : '确认覆盖并恢复' }}</button>
          </div>
        </section>

        <template v-else>
          <section class="storage-section" aria-labelledby="sync-title">
            <div class="section-heading"><h3 id="sync-title">同步与存档</h3><span>@{{ account.username }}</span></div>
            <div class="sync-card" :class="{ ready: syncReady }">
              <div class="sync-state" role="status"><i aria-hidden="true"></i><strong>{{ syncLabel }}</strong></div>
              <p>{{ savedAt ? `最近保存到服务器 · ${new Date(savedAt).toLocaleString('zh-CN')}` : '成长进度与成绩由游戏服务器保存。' }}</p>
            </div>
            <p v-if="pendingCount && !queueDurable" class="warning" role="alert">浏览器无法暂存结算，请保持页面打开，在游戏记录中导出待同步记录。</p>
            <div class="profile-row"><div><span>当前主战场档案</span><strong>{{ activeSlot?.name || '史莱姆档案' }}</strong></div><button :disabled="locked" @click="emit('profiles')">管理主战场档案</button></div>
            <p class="local-checkpoint">{{ continuation ? `本机续玩 · ${continuation.snapshot.label} · ${new Date(continuation.savedAt).toLocaleString('zh-CN')}` : '局内续玩保存在当前浏览器；成长进度与战绩可跨设备同步。' }}</p>
            <button v-if="pendingCount" class="records-button" :disabled="locked" @click="emit('records')">查看待同步记录</button>
          </section>

          <section class="storage-section" aria-labelledby="backup-title">
            <div class="section-heading"><h3 id="backup-title">备份与恢复</h3><span v-if="account.admin">管理员操作</span></div>
            <template v-if="account.admin">
              <div class="backup-row">
                <div><h4>整服数据</h4><p>全部账号的档案、塔防进度、行动成绩与服务器设置。</p></div>
                <div class="actions"><button class="backup-export" :disabled="locked" @click="exportServer"><Download :size="15" aria-hidden="true" />导出整服备份</button><button class="backup-restore" :disabled="locked" @click="serverPicker?.click()"><Upload :size="15" aria-hidden="true" />恢复整服备份…</button></div>
              </div>
              <div class="backup-row">
                <div><h4>单个账号进度</h4><p>导出或恢复所选账号的成长档案与塔防进度。</p></div>
                <label class="account-selector"><span>选择账号</span><select v-model="selectedAccountId" :disabled="locked || !accounts?.length"><option v-if="!accounts" :value="account.id">正在读取账号…</option><option v-for="row in accounts" :key="row.id" :value="row.id">{{ row.displayName || row.username }} · @{{ row.username }}{{ row.id === account.id ? '（当前账号）' : '' }}{{ row.disabled ? '（已停用）' : '' }}</option></select></label>
                <p v-if="selectedAccount" class="account-summary">{{ selectedAccount.slotCount }} 个档案 · 塔防第 {{ selectedAccount.campaignStage }} 关 · {{ selectedAccount.runCount }} 局行动</p>
                <button v-if="!accounts && !loadingAccounts" :disabled="locked" @click="run(loadAccounts)">重新读取账号</button>
                <div class="actions"><button class="backup-export" :disabled="locked || !selectedAccount" @click="exportAccount"><Download :size="15" aria-hidden="true" />导出账号备份</button><button class="backup-restore" :disabled="locked || !selectedAccount" @click="pickAccountFile"><Upload :size="15" aria-hidden="true" />恢复账号进度…</button></div>
              </div>
              <p class="backup-note">备份文件不包含本机续玩和待同步记录，恢复前请先处理尚未同步的记录。</p>
            </template>
            <p v-else>游戏进度由服务器保存。备份与恢复由主机管理员在「数据与存档」中操作；如需恢复进度，请联系管理员。</p>
          </section>

          <details class="migration-section">
            <summary tabindex="0">迁移以前的本机进度</summary>
            <p>{{ localSummary }}</p>
            <p v-if="localSaveNotice" class="warning" role="alert">{{ localSaveNotice }}</p>
            <p>本机档案将替换当前主战场成长档案，塔防按最高进度合并。迁移成绩不参与公共排名。</p>
            <div v-if="confirmMigration" class="migration-confirm"><strong>确认替换「{{ activeSlot?.name || '史莱姆档案' }}」？</strong><div class="actions"><button :disabled="locked" @click="confirmMigration = false">取消</button><button class="control-danger" :disabled="locked" @click="emit('import-local'); confirmMigration = false">确认迁移</button></div></div>
            <button v-else class="migration-button" :disabled="locked || !localSlot" @click="confirmMigration = true">迁移本机进度</button>
          </details>
        </template>
      </div>
      <input ref="serverPicker" type="file" accept=".json,application/json" hidden @change="readBackup($event, 'server')" />
      <input ref="accountPicker" type="file" accept=".json,application/json" hidden @change="readBackup($event, 'account')" />
    </section>
  </div>
</template>

<style scoped>
.storage-overlay { z-index: 58; }

.storage-dialog {
  width: min(680px, 100%);
  scroll-padding-block: 112px 16px;
}

.storage-header {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 20px 24px 17px;
  border-bottom: 1px solid var(--adventure-line);
  background: var(--adventure-paper);
}

.storage-title-group { display: flex; align-items: center; min-width: 0; gap: 12px; }
.storage-icon {
  display: grid;
  flex: none;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 1px solid var(--adventure-line);
  border-radius: 9px;
  background: var(--adventure-leaf);
  color: var(--adventure-green);
}
.storage-header p { font-size: 13px; }

.storage-body { padding: 0 24px 21px; }
.storage-section { padding: 18px 0; border-bottom: 1px solid var(--adventure-line); }
.section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; margin-bottom: 10px; }
.section-heading > span { text-align: right; overflow-wrap: anywhere; color: var(--adventure-muted); font-size: 12px; }
h3 { margin: 0; font-size: 16px; }
h4 { margin: 0 0 3px; font-size: 14px; }
p { font-size: 13px; }

.sync-card {
  padding: 10px 13px;
  border: 1px solid var(--adventure-warning-line);
  border-radius: 8px;
  background: var(--adventure-warning-paper);
  color: var(--adventure-gold);
}
.sync-card.ready {
  border-color: #c8dbca;
  background: #edf4ec;
  color: var(--adventure-green);
}
.sync-state { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
.sync-state i { width: 7px; height: 7px; flex: none; border-radius: 50%; background: currentColor; }
.sync-card p { font-size: 12px; }

.profile-row { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-top: 13px; }
.profile-row span { display: block; color: var(--adventure-muted); font-size: 12px; }
.profile-row strong { font-size: 15px; overflow-wrap: anywhere; }
.profile-row button { flex: none; }
p.local-checkpoint { margin-top: 8px; font-size: 12px; }

.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.storage-dialog button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; font-size: 13px; font-weight: 650; }
.storage-dialog .close { display: grid; font-size: 22px; font-weight: 400; }
.actions svg { flex: none; }

.backup-row {
  padding: 13px 15px;
  border: 1px solid var(--adventure-line);
  border-radius: 8px;
  background: #f4f7f1;
}
.backup-row + .backup-row { margin-top: 8px; }
.backup-export:not(:disabled) { color: var(--adventure-green); }
.backup-restore:not(:disabled) { border-color: var(--adventure-danger-line); color: var(--adventure-danger); }
.backup-restore:hover:not(:disabled) { border-color: #ba8075; background: var(--adventure-danger-paper); }
.account-selector { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 10px; margin-top: 10px; font-size: 13px; }
.account-selector select { width: 100%; min-width: 0; cursor: pointer; }
p.account-summary { margin-top: 5px; font-size: 12px; }
p.backup-note { margin-top: 9px; font-size: 12px; }

.notice { margin-top: 14px; padding: 9px 12px; border: 1px solid var(--adventure-warning-line); border-radius: 7px; color: var(--adventure-gold); background: var(--adventure-warning-paper); overflow-wrap: anywhere; }
.notice.notice-error { border-color: var(--adventure-danger-line); color: var(--adventure-danger); background: var(--adventure-danger-paper); }
p.warning { margin-top: 8px; color: var(--adventure-gold); }
.migration-section { padding-top: 14px; }
.migration-section summary { width: fit-content; padding: 4px 0; color: var(--adventure-green); font-size: 13px; font-weight: 650; cursor: pointer; }
.migration-section p { margin-top: 8px; }
.migration-button, .records-button { margin-top: 10px; }
.migration-confirm {
  margin-top: 12px;
  padding: 11px 12px;
  border: 1px solid var(--adventure-danger-line);
  border-radius: 7px;
  background: var(--adventure-danger-paper);
}

.restore-confirm { padding: 20px 0 2px; }
.restore-confirm h3 { margin: 0 0 12px; font-size: 20px; overflow-wrap: anywhere; }
p.filename { color: var(--adventure-ink); font-weight: 650; overflow-wrap: anywhere; }
p.restore-warning {
  margin-top: 14px;
  padding: 11px 13px;
  border-left: 3px solid var(--adventure-danger);
  border-radius: 5px;
  color: var(--adventure-danger);
  background: var(--adventure-danger-paper);
}
.restore-confirm .actions { justify-content: flex-end; margin-top: 17px; }

@media (max-width: 560px) {
  .storage-header { padding: 15px 14px 12px; gap: 10px; }
  .storage-title-group { gap: 9px; }
  .storage-icon { width: 34px; height: 34px; }
  .storage-header p { font-size: 12px; }
  .storage-body { padding: 0 14px 16px; }
  .profile-row { align-items: flex-start; flex-direction: column; gap: 8px; }
  .actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .actions button { padding-inline: 6px; font-size: 12px; }
  .backup-row { padding: 10px; }
  .account-selector { grid-template-columns: 1fr; gap: 5px; }
}
</style>
