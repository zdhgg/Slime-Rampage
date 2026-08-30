<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const emit = defineEmits(['close', 'login', 'register', 'logout', 'import-local'])
const props = defineProps({
  account: { type: Object, default: null },
  status: { type: Object, default: () => ({ checked: false, online: false, registrationEnabled: false }) },
  activeSlot: { type: Object, default: null },
  localSlot: { type: Object, default: null },
  busy: { type: Boolean, default: false },
  message: { type: String, default: '' },
})

const mode = ref('login')
const username = ref('')
const password = ref('')
const firstInput = ref(null)
const closeButton = ref(null)

const isOnline = computed(() => !!props.status?.online)
const canRegister = computed(() => isOnline.value && props.status?.registrationEnabled !== false)
const canSubmit = computed(() => isOnline.value && username.value.trim().length >= 3 && password.value.length >= 6 && !props.busy)
const hostAddress = computed(() => window.location.origin)
const copied = ref(false)
let copiedTimer = 0
const localSummary = computed(() => {
  const save = props.localSlot?.data
  if (!save) return '暂无可导入的本地档案'
  const drops = Math.floor(save.drops || 0)
  const geneLevels = Object.values(save.genes || {}).reduce((sum, level) => sum + Number(level || 0), 0)
  return `${props.localSlot.name} · 战利品 ${drops} · 基因等级 ${geneLevels}`
})

function submit() {
  if (!canSubmit.value) return
  emit(mode.value === 'register' ? 'register' : 'login', {
    username: username.value.trim(),
    password: password.value,
  })
}

function switchMode(nextMode) {
  mode.value = nextMode
  nextTick(() => firstInput.value?.focus())
}

async function copyAddress() {
  const text = hostAddress.value
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // 局域网 http 地址不是安全上下文，剪贴板 API 可能不可用，退回 execCommand
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    try {
      document.execCommand('copy')
    } catch {
      /* 复制失败：保持按钮原样，不伪装成功 */
    }
    area.remove()
  }
  copied.value = true
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    copied.value = false
  }, 1600)
}

function onKeydown(event) {
  if (event.code === 'Escape') emit('close')
}

watch(
  () => props.account,
  () => nextTick(() => (props.account ? closeButton.value?.focus() : firstInput.value?.focus()))
)

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  nextTick(() => (props.account ? closeButton.value?.focus() : firstInput.value?.focus()))
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  clearTimeout(copiedTimer)
})
</script>

<template>
  <div class="lan-layer" @pointerdown.self="emit('close')">
    <section class="lan-dialog" role="dialog" aria-modal="true" aria-labelledby="lan-title">
      <header class="lan-header">
        <div>
          <span>{{ isOnline ? '局域网主机在线' : '局域网主机未连接' }}</span>
          <h2 id="lan-title">局域网账号</h2>
        </div>
        <button ref="closeButton" class="icon-button" title="关闭" aria-label="关闭局域网账号" @click="emit('close')">×</button>
      </header>

      <div v-if="message" class="lan-message" role="status">{{ message }}</div>

      <div v-if="isOnline" class="lan-address">
        <span>主机地址</span>
        <code>{{ hostAddress }}</code>
        <button type="button" class="ghost-button" @click="copyAddress">{{ copied ? '已复制' : '复制' }}</button>
      </div>

      <div v-if="account" class="account-panel">
        <div class="account-card">
          <span>当前登录</span>
          <strong>{{ account.displayName || account.username }}</strong>
          <i>@{{ account.username }}</i>
        </div>

        <div class="remote-profile">
          <span>当前远程档案</span>
          <strong>{{ activeSlot?.name || '史莱姆档案' }}</strong>
          <p>
            战利品 {{ Math.floor(activeSlot?.data?.drops || 0) }} ·
            最高进度 {{ activeSlot?.data?.progression?.highestMode || 'expedition' }} /
            {{ activeSlot?.data?.progression?.highestDifficulty || 'normal' }}
          </p>
        </div>

        <div class="import-box">
          <span>本机档案迁移</span>
          <p>{{ localSummary }}</p>
          <button class="ghost-button" :disabled="busy || !localSlot" @click="emit('import-local')">
            导入到当前远程档
          </button>
        </div>

        <footer>
          <button class="ghost-button" :disabled="busy" @click="emit('logout')">退出登录</button>
          <button class="primary-button" @click="emit('close')">完成</button>
        </footer>
      </div>

      <form v-else class="auth-form" @submit.prevent="submit">
        <div class="auth-tabs" role="tablist" aria-label="账号操作">
          <button type="button" :class="{ selected: mode === 'login' }" @click="switchMode('login')">登录</button>
          <button
            type="button"
            :class="{ selected: mode === 'register' }"
            :disabled="!canRegister"
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
            placeholder="3-20 位文字、数字、_ 或 -"
            :disabled="busy || !isOnline"
          />
        </label>

        <label>
          <span>密码</span>
          <input
            v-model="password"
            autocomplete="current-password"
            type="password"
            placeholder="至少 6 个字符"
            :disabled="busy || !isOnline"
          />
        </label>

        <p v-if="!isOnline" class="auth-note">请先启动局域网主机（npm run lan），再从同一地址打开游戏；仍无法连接时，检查主机防火墙是否放行了 4173 端口。</p>
        <p v-else-if="mode === 'register' && !canRegister" class="auth-note">主机暂时关闭了新账号注册。</p>
        <p v-else class="auth-note">登录后使用远程三档案，结算会进入全员排行榜。</p>

        <footer>
          <button type="button" class="ghost-button" @click="emit('close')">取消</button>
          <button type="submit" class="primary-button" :disabled="!canSubmit">
            {{ busy ? '处理中…' : mode === 'register' ? '创建账号' : '登录账号' }}
          </button>
        </footer>
      </form>
    </section>
  </div>
</template>

<style scoped>
.lan-layer {
  position: fixed;
  inset: 0;
  z-index: 58;
  display: grid;
  place-items: center;
  padding: 24px;
  color: #f4eee6;
  background: rgba(4, 4, 3, 0.78);
  backdrop-filter: blur(8px);
}

.lan-dialog {
  width: min(520px, 100%);
  overflow: hidden;
  border: 1px solid rgba(238, 214, 180, 0.18);
  border-radius: 8px;
  background: #0f0e0c;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.46);
}

.lan-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 86px;
  padding: 20px 22px;
  border-bottom: 1px solid rgba(238, 214, 180, 0.12);
  background: rgba(18, 16, 13, 0.9);
}

.lan-header span,
.account-card span,
.remote-profile span,
.import-box span,
.auth-form label span {
  color: #b98747;
  font-size: 10px;
  font-weight: 800;
}

.lan-header h2 {
  margin-top: 5px;
  font-size: 24px;
  letter-spacing: 0;
}

button,
input {
  font: inherit;
}

.icon-button {
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

.lan-message {
  margin: 16px 22px 0;
  padding: 10px 12px;
  border: 1px solid rgba(236, 196, 119, 0.24);
  border-radius: 6px;
  color: #ecc477;
  background: rgba(215, 166, 87, 0.08);
  font-size: 12px;
  line-height: 1.5;
}

.lan-address {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 16px 22px 0;
  padding: 9px 12px;
  border: 1px dashed rgba(238, 214, 180, 0.22);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.02);
}

.lan-address span {
  color: #b98747;
  font-size: 10px;
  font-weight: 800;
}

.lan-address code {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: rgba(244, 238, 230, 0.8);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lan-address .ghost-button {
  min-height: 30px;
  padding: 0 12px;
}

.account-panel,
.auth-form {
  display: grid;
  gap: 14px;
  padding: 20px 22px 22px;
}

.account-card,
.remote-profile,
.import-box {
  padding: 15px;
  border: 1px solid rgba(238, 214, 180, 0.12);
  border-radius: 6px;
  background: #14120f;
}

.account-card strong,
.remote-profile strong {
  display: block;
  margin-top: 6px;
  font-size: 19px;
  letter-spacing: 0;
}

.account-card i,
.remote-profile p,
.import-box p,
.auth-note {
  display: block;
  margin-top: 6px;
  color: rgba(244, 238, 230, 0.5);
  font-size: 11px;
  font-style: normal;
  line-height: 1.6;
}

.auth-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
  padding: 3px;
  border: 1px solid rgba(238, 214, 180, 0.12);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.018);
}

.auth-tabs button {
  min-height: 38px;
  border: 0;
  border-radius: 4px;
  color: rgba(244, 238, 230, 0.68);
  background: transparent;
  cursor: pointer;
}

.auth-tabs button.selected {
  color: #fff9ef;
  background: rgba(215, 166, 87, 0.14);
  box-shadow: inset 0 0 0 1px rgba(236, 196, 119, 0.42);
}

.auth-form label {
  display: grid;
  gap: 7px;
}

.auth-form input {
  height: 42px;
  min-width: 0;
  padding: 0 12px;
  border: 1px solid rgba(238, 214, 180, 0.16);
  border-radius: 5px;
  color: #fffaf2;
  background: #13110e;
  outline: none;
}

.auth-form input:focus {
  border-color: rgba(236, 196, 119, 0.58);
}

footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.primary-button,
.ghost-button {
  min-height: 38px;
  padding: 0 16px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.primary-button {
  border: 1px solid #efca82;
  color: #21170b;
  background: #d7a657;
}

.ghost-button {
  border: 1px solid rgba(238, 214, 180, 0.14);
  color: rgba(244, 238, 230, 0.68);
  background: transparent;
}

button:hover:not(:disabled) {
  filter: brightness(1.08);
}

.ghost-button:hover:not(:disabled),
.icon-button:hover {
  border-color: rgba(215, 166, 87, 0.42);
  color: #fffaf2;
  background: rgba(215, 166, 87, 0.07);
}

button:active:not(:disabled) {
  transform: scale(0.97);
}

button:disabled,
input:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

button:focus-visible,
input:focus-visible {
  outline: 2px solid #ecc477;
  outline-offset: 3px;
}

@media (max-width: 560px) {
  .lan-layer {
    align-items: end;
    padding: 0;
  }

  .lan-dialog {
    width: 100%;
    border-right: 0;
    border-bottom: 0;
    border-left: 0;
    border-radius: 8px 8px 0 0;
  }

  footer {
    flex-direction: column-reverse;
  }

  .primary-button,
  .ghost-button {
    width: 100%;
  }
}
</style>
