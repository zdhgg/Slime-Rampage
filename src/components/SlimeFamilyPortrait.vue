<script setup>
/* Current slime portrait — the family cast drawn live on canvas.
 * Same painter Player.render uses (src/game/slime-art/slime-painter.js +
 * slime-cast.js); idle breathing by default, `performing` shows the release
 * keyframe, and the elemental portrait shows the chosen starting element. */
import { onMounted, onBeforeUnmount, ref } from 'vue'
import '../game/slime-art/slime-painter.js'
import { drawSlimeFamily, slimePose } from '../game/slime-art/slime-cast.js'

const props = defineProps({
  strain: { type: String, default: 'origin' },
  element: { type: String, default: '' },
  compact: Boolean,
  performing: Boolean,
})

const cv = ref(null)
let raf = 0
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
    ...slimePose(props.strain, props.performing ? 'release' : 'idle', t),
    el: props.element ? [props.element] : ['fire'],
  })
  x.restore()
}

function loop(ms) {
  paint(ms / 1000)
  raf = requestAnimationFrame(loop)
}
onMounted(() => { raf = requestAnimationFrame(loop) })
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
<canvas ref="cv" class="slime-family-portrait" :class="[strain, { compact, performing }]" aria-hidden="true" />
</template>

<style scoped>
.slime-family-portrait { display: block; width: 100%; height: 100%; }
</style>
