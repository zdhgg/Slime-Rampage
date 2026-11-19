<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useDialogFocus } from './useDialogFocus.js'
import { MODES, DIFFICULTIES } from '../game/RunRules.js'
import './account-panels.css'

const emit = defineEmits(['close', 'login', 'register', 'logout', 'profiles', 'records', 'storage', 'retry', 'admin'])
const props = defineProps({
  account: { type: Object, default: null },
  status: { type: Object, default: () => ({ checked: false, online: false, registrationEnabled: false }) },
  activeSlot: { type: Object, default: null },
  busy: { type: Boolean, default: false },
  message: { type: String, default: '' },
  savedAt: { type: String, default: '' },
  pendingCount: { type: Number, default: 0 },
  queueDurable: { type: Boolean, default: true },
  recoveryNotice: { type: String, default: '' },
})

const mode = ref('login')
const username = ref('')
const password = ref('')
const firstInput = ref(null)
const closeButton = ref(null)

const isOnline = computed(() => !!props.status?.online)
const canRegister = computed(() => isOnline.value && props.status?.registrationEnabled !== false)
const canSubmit = computed(() => isOnline.value && username.value.trim().length >= 3 && password.value.length >= 6 && !props.busy)
const dialog = ref(null)
useDialogFocus(dialog, () => { if (!props.busy) emit('close') })

function submit() {
  if (!canSubmit.value || (mode.value === 'register' && !canRegister.value)) return
  emit(mode.value === 'register' ? 'register' : 'login', {
    username: username.value.trim(),
    password: password.value,
  })
}

function switchMode(nextMode) {
  mode.value = nextMode
  nextTick(() => firstInput.value?.focus())
}

watch(
  () => props.account,
  () => nextTick(() => (props.account ? closeButton.value?.focus() : firstInput.value?.focus()))
)
</script>

<template>
  <div class="account-overlay auth-layer" @pointerdown.self="!busy && emit('close')">
    <section ref="dialog" class="account-dialog account-dialog--flush auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <header class="auth-header">
        <div>
          <h2 id="auth-title">游戏账号</h2>
          <span class="service-state" :class="{ online: isOnline }">{{ isOnline ? '游戏服务已连接' : '游戏服务未连接' }}</span>
        </div>
        <button ref="closeButton" class="close" :disabled="busy" title="关闭" aria-label="关闭游戏账号" @click="emit('close')">×</button>
      </header>

      <div v-if="message" class="auth-message" role="status">{{ message }}</div>
      <div v-if="recoveryNotice" class="auth-message" role="alert">{{ recoveryNotice }}</div>

      <div v-if="account" class="account-panel">
        <div class="account-card">
          <span>当前登录</span>
          <strong>{{ account.displayName || account.username }}</strong>
          <i>@{{ account.username }}</i>
          <p role="status">{{ pendingCount ? queueDurable ? `${pendingCount} 条结算已暂存本机，等待上传` : '无法暂存结算，请保持页面打开并导出待同步记录' : savedAt ? `已保存到账号 · ${new Date(savedAt).toLocaleString('zh-CN')}` : '账号已连接' }}</p>
        </div>

        <div class="remote-profile">
          <span>主战场成长档案</span>
          <strong>{{ activeSlot?.name || '史莱姆档案' }}</strong>
          <p>
            战力点 {{ Math.floor(activeSlot?.data?.drops || 0) }} ·
            最高进度 {{ MODES[activeSlot?.data?.progression?.highestMode || 'expedition']?.name }} /
            {{ DIFFICULTIES[activeSlot?.data?.progression?.highestDifficulty || 'normal']?.name }}
          </p>
        </div>

        <div class="account-links">
          <button class="ghost-button" :disabled="busy" @click="emit('records')">我的游戏记录</button>
          <button class="ghost-button" :disabled="busy" @click="emit('profiles')">管理主战场档案</button>
          <button class="ghost-button" :disabled="busy" @click="emit('storage')">数据与存档</button>
          <button v-if="account?.admin" class="ghost-button" :disabled="busy" @click="emit('admin')">账号管理</button>
        </div>

        <footer>
          <button class="ghost-button" :disabled="busy" @click="emit('logout')">退出登录</button>
          <button class="control-primary" :disabled="busy" @click="emit('close')">完成</button>
        </footer>
      </div>

      <form v-else class="auth-form" @submit.prevent="submit">
        <div class="auth-tabs" role="tablist" aria-label="账号操作">
          <button type="button" :disabled="busy" :class="{ selected: mode === 'login' }" @click="switchMode('login')">登录</button>
          <button
            type="button"
            :class="{ selected: mode === 'register' }"
            :disabled="busy || !canRegister"
            @click="switchMode('register')"
          >
            注册
          </button>
        </div>

        <label>
          <span>账号名</span>
          <input
            ref="firstInput"
            v-model="username"
            autocomplete="username"
            inputmode="text"
            maxlength="20"
            placeholder="3-20 位文字、数字、_ 或 -"
            :disabled="busy || !isOnline"
          />
        </label>

        <label>
          <span>密码</span>
          <input
            v-model="password"
            :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
            type="password"
            maxlength="72"
            placeholder="至少 6 个字符"
            :disabled="busy || !isOnline"
          />
        </label>

        <p v-if="!isOnline" class="auth-note">暂时无法连接游戏服务器，请检查连接后重试。</p>
        <p v-else-if="mode === 'register' && !canRegister" class="auth-note">暂时关闭了新账号注册。</p>
        <p v-else class="auth-note">登录后游玩，进度与成绩随账号保存，排行榜向所有玩家开放。</p>

        <footer>
          <button v-if="!isOnline" type="button" class="ghost-button" :disabled="busy" @click="emit('retry')">重新连接</button>
          <button type="button" class="ghost-button" :disabled="busy" @click="emit('close')">取消</button>
          <button type="submit" class="control-primary" :disabled="!canSubmit">
            {{ busy ? '处理中…' : mode === 'register' ? '创建账号' : '登录账号' }}
          </button>
        </footer>
      </form>
    </section>
  </div>
</template>

<style scoped>
.auth-layer { z-index: 58; }
.auth-dialog { width: min(520px, 100%); }
.auth-header { padding: 19px 22px 15px; border-bottom: 1px solid var(--adventure-line); }
.service-state { display: inline-flex; align-items: center; gap: 6px; color: var(--adventure-gold); font-size: 12px; }
.service-state::before { width: 7px; height: 7px; border-radius: 50%; background: currentColor; content: ''; }
.service-state.online { color: var(--adventure-green); }

.auth-message {
  margin: 12px 22px 0;
  padding: 9px 12px;
  border: 1px solid var(--adventure-warning-line);
  border-radius: 7px;
  background: var(--adventure-warning-paper);
  color: var(--adventure-gold);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.account-panel, .auth-form { display: grid; gap: 12px; padding: 18px 22px 21px; }
.account-card, .remote-profile { padding: 12px 14px; border: 1px solid var(--adventure-line); border-radius: 8px; background: #f2f6ef; }
.account-card > span, .remote-profile > span, .auth-form label { color: var(--adventure-muted); font-size: 13px; font-weight: 650; }
.account-card strong, .remote-profile strong { display: block; font-size: 18px; line-height: 1.45; overflow-wrap: anywhere; }
.account-card i { color: var(--adventure-muted); font-size: 12px; font-style: normal; overflow-wrap: anywhere; }
.account-card p, .remote-profile p, .auth-note { font-size: 12px; }
.account-card p, .remote-profile p { margin-top: 5px; }
.account-links { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }

.auth-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; border: 1px solid var(--adventure-line); border-radius: 8px; background: #eef2eb; }
.auth-tabs button { border-color: transparent; background: transparent; }
.auth-tabs button.selected { border-color: #b8cbbd; background: var(--adventure-paper); color: var(--adventure-green); font-weight: 700; }
.auth-form label { display: grid; gap: 4px; }
.auth-form input { width: 100%; min-width: 0; font-weight: 450; }
.auth-form input::placeholder { color: #627168; }

footer { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
footer > button { font-weight: 650; }

@media (max-width: 560px) {
  .auth-header { padding: 15px 16px 12px; }
  .auth-message { margin-inline: 16px; }
  .account-panel, .auth-form { padding: 14px 16px 16px; }
  .account-links button { padding-inline: 7px; font-size: 13px; }
  footer > button { flex: 1 1 auto; }
}
</style>
