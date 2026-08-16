<script setup>
/**
 * PauseModal：手动暂停面板（纯展示组件）
 *
 *  - 引擎已由 App.vue 调 pause() 冻结画面；
 *  - 「继续游戏」emit('resume')：App.vue 调 engine.resume()；
 *  - 「重新开始」emit('restart')：复用整局重置流程。
 */
const emit = defineEmits(['resume', 'restart'])
</script>

<template>
  <div class="pause-overlay" role="dialog" aria-modal="true" aria-label="游戏暂停">
    <div class="pause-panel">
      <h2 class="pause-title">⏸ 已暂停</h2>
      <button class="resume-btn" @click="emit('resume')">▶ 继续游戏</button>
      <button class="restart-btn" @click="emit('restart')">🔄 重新开始</button>
      <div class="pause-hint">按 Esc 也可以继续</div>
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
  text-align: center;
  padding: 36px 52px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: linear-gradient(170deg, rgba(24, 32, 26, 0.96), rgba(12, 18, 14, 0.96));
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
}

.pause-title {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 4px;
  color: #eaffdd;
  margin-bottom: 26px;
}

.resume-btn {
  display: block;
  width: 100%;
  margin-bottom: 12px;
  padding: 11px 0;
  border: none;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #0c120d;
  background: linear-gradient(90deg, #a8f06a, #4fae4a);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.resume-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(138, 232, 74, 0.35);
}

.restart-btn {
  display: block;
  width: 100%;
  padding: 10px 0;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 2px;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.restart-btn:hover {
  border-color: rgba(255, 255, 255, 0.55);
  background: rgba(255, 255, 255, 0.12);
}

.pause-hint {
  margin-top: 16px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
}
</style>
