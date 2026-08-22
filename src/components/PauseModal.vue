<script setup>
import { nextTick, ref } from 'vue'

/**
 * PauseModal：手动暂停面板（纯展示组件）
 *
 *  - 引擎已由 App.vue 调 pause() 冻结画面；
 *  - 「继续游戏」emit('resume')：App.vue 调 engine.resume()；
 *  - 「重新开始」emit('restart')：复用整局重置流程。
 *  - 「返回主界面」先在面板内确认，再 emit('quit') 放弃本局。
 */
const emit = defineEmits(['resume', 'restart', 'quit'])
const confirmingQuit = ref(false)
const confirmButton = ref(null)

async function askQuit() {
  confirmingQuit.value = true
  await nextTick()
  confirmButton.value?.focus()
}

function onEscape() {
  if (confirmingQuit.value) confirmingQuit.value = false
  else emit('resume')
}
</script>

<template>
  <div
    class="pause-overlay"
    role="dialog"
    aria-modal="true"
    :aria-label="confirmingQuit ? '确认放弃本局' : '游戏暂停'"
    @keydown.esc.stop.prevent="onEscape"
  >
    <div class="pause-panel" :class="{ confirming: confirmingQuit }">
      <template v-if="!confirmingQuit">
        <h2 class="pause-title"><span aria-hidden="true">Ⅱ</span> 已暂停</h2>
        <div class="pause-actions">
          <button class="menu-button primary" autofocus @click="emit('resume')">
            <span aria-hidden="true">▶</span> 继续游戏
          </button>
          <button class="menu-button secondary" @click="emit('restart')">
            <span aria-hidden="true">↻</span> 重新开始
          </button>
          <button class="menu-button quit" @click="askQuit">
            <span aria-hidden="true">↩</span> 返回主界面
          </button>
        </div>
        <div class="pause-hint">按 Esc 也可以继续</div>
      </template>

      <template v-else>
        <div class="warning-mark" aria-hidden="true">!</div>
        <h2 class="pause-title confirm-title">放弃本局？</h2>
        <p class="confirm-copy">当前进度不会结算，也不会获得本局奖励。</p>
        <div class="pause-actions confirm-actions">
          <button ref="confirmButton" class="menu-button danger" @click="emit('quit')">
            确认放弃
          </button>
          <button class="menu-button secondary" @click="confirmingQuit = false">继续本局</button>
        </div>
        <div class="pause-hint">按 Esc 返回暂停菜单</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.pause-overlay {
  position: absolute;
  inset: 0;
  z-index: 15;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
}

.pause-panel {
  width: min(290px, calc(100vw - 40px));
  text-align: center;
  padding: 30px 34px 26px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(14, 22, 17, 0.97);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.52);
}

.pause-panel.confirming {
  border-color: rgba(255, 135, 122, 0.25);
}

.pause-title {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 0;
  color: #eaffdd;
  margin: 0 0 24px;
}

.pause-title span {
  display: inline-block;
  margin-right: 8px;
  font-size: 21px;
}

.pause-actions {
  display: grid;
  gap: 10px;
}

.menu-button {
  width: 100%;
  min-height: 44px;
  padding: 10px 16px;
  border: 1px solid transparent;
  border-radius: 7px;
  font: inherit;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease, transform 0.08s ease;
}

.menu-button span {
  display: inline-block;
  width: 19px;
  margin-right: 5px;
  text-align: center;
}

.menu-button.primary {
  color: #0c120d;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: #83dc54;
}

.menu-button.secondary {
  color: rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.2);
}

.menu-button.quit {
  color: rgba(255, 181, 170, 0.88);
  background: transparent;
  border-color: transparent;
}

.menu-button.danger {
  color: #fff4f1;
  background: #a84238;
  border-color: #c95a4e;
}

.menu-button.primary:hover {
  background: #94e667;
}

.menu-button.secondary:hover {
  border-color: rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.12);
}

.menu-button.quit:hover {
  color: #ffc2b8;
  background: rgba(203, 81, 68, 0.1);
}

.menu-button.danger:hover {
  background: #b84b40;
}

.menu-button:active {
  transform: scale(0.98);
}

.menu-button:focus-visible {
  outline: 2px solid #d7ffb9;
  outline-offset: 3px;
}

.warning-mark {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  margin: 0 auto 14px;
  border: 1px solid rgba(255, 135, 122, 0.5);
  border-radius: 50%;
  color: #ff9f92;
  font-size: 22px;
  font-weight: 800;
}

.confirm-title {
  margin-bottom: 10px;
  font-size: 23px;
}

.confirm-copy {
  margin: 0 0 22px;
  color: rgba(255, 255, 255, 0.62);
  font-size: 13px;
  line-height: 1.7;
}

.confirm-actions {
  gap: 9px;
}

.pause-hint {
  margin-top: 18px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
}

@media (max-width: 520px) {
  .pause-panel {
    padding: 26px 24px 22px;
  }
}
</style>
