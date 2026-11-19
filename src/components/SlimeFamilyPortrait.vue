<script setup>
/* Current slime portrait — the family cast drawn live on canvas.
 * Same painter Player.render uses (src/game/slime-art/slime-painter.js +
 * slime-cast.js); portraits use idle breathing and can show a supplied element. */
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import '../game/slime-art/slime-painter.js'
import { drawSlimeFamily, slimePose } from '../game/slime-art/slime-cast.js'

const props = defineProps({
  strain: { type: String, default: 'origin' },
  element: { type: String, default: '' },
  compact: Boolean,
})

const cv = ref(null)
let raf = 0
let observer
const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
const DPR = Math.min(window.devicePixelRatio || 1, 2)

function paint(t) {
  const c = cv.value
  if (!c) return
  const w = c.clientWidth, h = c.clientHeight
  if (!w || !h) return
  const W = Math.round(w * DPR), H = Math.round(h * DPR)
  if (c.width !== W) c.width = W
  if (c.height !== H) c.height = H
  const x = c.getContext('2d')
  x.setTransform(DPR, 0, 0, DPR, 0, 0)
  x.clearRect(0, 0, w, h)
  // Measured margins keep the elemental tip, shadow tail and partners inside
  // the selection card at its smallest stage.
  const r = Math.min(w * (props.compact ? 0.33 : 0.3), h * (props.compact ? 0.4 : 0.36))
  x.save()
  x.translate(w / 2, h * 0.9 - r * 0.8)
  drawSlimeFamily(x, props.strain, r, {
    ...slimePose(props.strain, 'idle', t),
    el: props.element ? [props.element] : ['fire'],
  })
  x.restore()
}

function loop(ms) {
  paint(ms / 1000)
  raf = requestAnimationFrame(loop)
}

function updateMotion() {
  cancelAnimationFrame(raf)
  observer.disconnect()
  if (motion.matches) {
    paint(0)
    observer.observe(cv.value)
  } else {
    raf = requestAnimationFrame(loop)
  }
}

onMounted(() => {
  observer = new ResizeObserver(() => paint(0))
  updateMotion()
  motion.addEventListener('change', updateMotion)
})
watch(() => [props.strain, props.element, props.compact], () => {
  if (motion.matches) paint(0)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  observer?.disconnect()
  motion.removeEventListener('change', updateMotion)
})
</script>

<template>
<canvas ref="cv" class="slime-family-portrait" :class="[strain, { compact }]" aria-hidden="true" />
</template>

<style scoped>
.slime-family-portrait { display: block; width: 100%; height: 100%; }
</style>
