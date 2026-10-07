<script setup>
import { onMounted, ref, watch } from 'vue'
import { TowerDefenseRenderer } from '../game/gameplay/tower-defense/TowerDefenseRenderer.js'

const props = defineProps({
  type: { type: String, required: true },
  level: { type: Number, default: 1 },
  branchId: { type: String, default: '' },
})
const canvas = ref(null)
let renderer

function paint() {
  if (!canvas.value) return
  renderer ||= new TowerDefenseRenderer({ elapsedTime: 0 })
  const ctx = canvas.value.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, 144, 112)
  ctx.save()
  ctx.scale(2, 2)
  ctx.translate(36, 31)
  renderer.unit = 48
  renderer.drawGuardian(ctx, { typeId: props.type, level: props.level, branchId: props.branchId, pulseTime: 0 })
  ctx.restore()
}

onMounted(paint)
watch(() => [props.type, props.level, props.branchId], paint)
</script>

<template>
  <canvas ref="canvas" class="guardian-portrait" width="144" height="112" aria-hidden="true" />
</template>

<style scoped>
.guardian-portrait { display: block; width: 72px; height: 56px; flex: none; }
</style>
