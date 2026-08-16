<script setup>
/**
 * GameCanvas：Vue 层 → 引擎层的唯一桥梁组件
 *
 * 职责边界（架构红线）：
 *  - 仅负责 Canvas DOM 节点的挂载/卸载，以及引擎实例的创建与销毁；
 *  - 引擎句柄用普通变量持有（非 ref/reactive）——它只在本组件生命周期
 *    中被访问，不存在任何响应式依赖，热路径（每帧 update/render）
 *    完全不经过 Vue；
 *  - 引擎通过 @ready 事件交给父组件，父组件仅做低频桥接（onStats 等）。
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { GameEngine } from '../game/GameEngine.js'

const emit = defineEmits(['ready'])
const canvasRef = ref(null)

let engine = null // 普通变量持有引擎句柄，刻意不走响应式

onMounted(() => {
  engine = GameEngine.create(canvasRef.value)
  // 注意：不自动 start()——主循环由 App 层在序章结束后显式启动，
  // 保证开场剧情期间画面静止、不产生任何战斗
  emit('ready', engine)
})

onUnmounted(() => {
  engine?.destroy()
  engine = null
})
</script>

<template>
  <canvas ref="canvasRef" class="game-canvas"></canvas>
</template>
