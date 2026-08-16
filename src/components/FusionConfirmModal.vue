<script setup>
/**
 * FusionConfirmModal：首次融合确认面板（阶段十六追加设计）
 *
 *  - props.info：{ type, icon, name, reaction: { name, species, desc, combo } }
 *  - 「吃下并融合」→ emit('resolve', true)
 *  - 「吐掉」→ emit('resolve', false)（宝石吐回地上，2s 内不再提示）
 *  - 主形态整局锁定不可逆，这是唯一一次「吃或不吃」的选择
 */
defineProps({
  info: { type: Object, required: true },
})
const emit = defineEmits(['resolve'])
</script>

<template>
  <div class="fusion-overlay" role="dialog" aria-modal="true" aria-label="首次融合确认">
    <div class="fusion-panel">
      <div class="fusion-kicker">发现元素核心：{{ info.icon }} {{ info.name }}</div>

      <!-- 首颗元素：预览可融合方向（阶段十六追加反馈） -->
      <template v-if="info.firstElement">
        <h2 class="fusion-title">吃下第一颗元素核心？</h2>
        <p class="fusion-warn">⚠️ 元素将永久留在体内（无法移除），并决定后续的融合方向</p>
        <div class="fusion-combos">
          可与
          <span v-for="c in info.combos" :key="c.species" class="combo-item">
            {{ c.icon }}{{ c.name }} → {{ c.species }}
          </span>
          融合
        </div>
      </template>

      <!-- 首次融合：主形态锁定（阶段十六追加设计） -->
      <template v-else>
        <h2 class="fusion-title">吃下将触发首次融合！</h2>
        <div class="fusion-result">
          {{ info.reaction.combo }} → <b>{{ info.reaction.species }}</b>
        </div>
        <p class="fusion-warn">
          ⚠️ 主形态将永久锁定为该物种（外形/飞弹颜色/物种名），整局无法更改
        </p>
        <p class="fusion-desc">⚔️ {{ info.reaction.desc }}</p>
      </template>

      <div class="fusion-btns">
        <button class="fusion-eat" @click="emit('resolve', true)">🍽️ 吃下{{ info.firstElement ? '' : '并融合' }}</button>
        <button class="fusion-spit" @click="emit('resolve', false)">🤢 吐掉（放回地上）</button>
      </div>
      <div class="fusion-hint">之后靠近核心按 E 主动吸收；入槽/替换另有面板选择</div>
    </div>
  </div>
</template>

<style scoped>
.fusion-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(3px);
}

.fusion-panel {
  max-width: 460px;
  text-align: center;
  padding: 34px 44px;
  border-radius: 20px;
  border: 1px solid rgba(255, 209, 102, 0.35);
  background: linear-gradient(170deg, rgba(30, 46, 34, 0.96), rgba(14, 22, 16, 0.96));
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
}

.fusion-kicker {
  font-size: 13px;
  letter-spacing: 2px;
  color: rgba(255, 255, 255, 0.65);
  margin-bottom: 8px;
}

.fusion-title {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: 3px;
  color: #ffd166;
  text-shadow: 0 2px 12px rgba(255, 209, 102, 0.4);
  margin-bottom: 12px;
}

.fusion-result {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.85);
  margin-bottom: 12px;
}

.fusion-result b {
  color: #d2ff8a;
}

.fusion-warn {
  font-size: 12.5px;
  line-height: 1.6;
  color: #ff9d8a;
  margin-bottom: 10px;
}

.fusion-desc {
  font-size: 13px;
  padding: 6px 14px;
  border-radius: 999px;
  color: #ffd166;
  background: rgba(255, 209, 102, 0.1);
  border: 1px solid rgba(255, 209, 102, 0.3);
  display: inline-block;
  margin-bottom: 20px;
}

/* 首颗元素的融合方向预览 */
.fusion-combos {
  font-size: 13px;
  line-height: 2;
  color: rgba(255, 255, 255, 0.75);
  margin-bottom: 18px;
}

.combo-item {
  display: inline-block;
  margin: 0 4px;
  padding: 2px 10px;
  border-radius: 999px;
  font-weight: 600;
  color: #d2ff8a;
  background: rgba(138, 232, 74, 0.1);
  border: 1px solid rgba(138, 232, 74, 0.3);
}

.fusion-btns {
  display: flex;
  gap: 14px;
  justify-content: center;
}

.fusion-eat {
  padding: 11px 26px;
  border: none;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #0c120d;
  background: linear-gradient(90deg, #a8f06a, #4fae4a);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.fusion-eat:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(138, 232, 74, 0.35);
}

.fusion-spit {
  padding: 11px 24px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.fusion-spit:hover {
  border-color: rgba(255, 255, 255, 0.55);
  background: rgba(255, 255, 255, 0.1);
}

.fusion-hint {
  margin-top: 14px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
}
</style>
