<script setup>
import { computed, watchEffect } from 'vue'
import { resolveSkillIcon, SKILL_ICON_METRICS } from './skillIconRegistry.js'

const props = defineProps({
  skill: { type: [Object, String], required: true },
  size: { type: String, default: 'card' },
})
const visual = computed(() => resolveSkillIcon(props.skill))
const id = computed(() => typeof props.skill === 'string' ? props.skill : props.skill.id)
watchEffect(() => {
  if (import.meta.env.DEV && visual.value.missing) console.warn(`[SkillIcon] Unregistered skill: ${id.value}`)
})
</script>

<template>
  <span
    class="skill-glyph"
    :class="[visual.familyClass, `skill-glyph--${size}`, `skill-glyph--${visual.tier}`]"
    :style="{ '--skill-icon-color': visual.color }"
    :data-icon-id="id"
    :data-icon-key="visual.key"
    :data-icon-missing="visual.missing || undefined"
    aria-hidden="true"
  >
    <component :is="visual.glyph" :size="SKILL_ICON_METRICS.glyph" :stroke-width="SKILL_ICON_METRICS.stroke" :absolute-stroke-width="true" />
  </span>
</template>

<style scoped>
.skill-glyph {
  --glyph-frame: 58px;
  --glyph-size: 34px;
  position: relative;
  display: inline-flex;
  box-sizing: border-box;
  width: var(--glyph-frame);
  height: var(--glyph-frame);
  min-height: 0;
  flex: 0 0 var(--glyph-frame);
  align-items: center;
  justify-content: center;
  margin: 5px 0 12px;
  border: 1px solid color-mix(in srgb, var(--skill-icon-color) 48%, transparent);
  border-radius: 16px;
  color: var(--skill-icon-color);
  background: color-mix(in srgb, var(--skill-icon-color) 8%, #0e151b);
  vertical-align: middle;
  line-height: 1;
}
.skill-glyph :deep(svg) { display: block; width: var(--glyph-size); height: var(--glyph-size); flex: none; }
.skill-glyph--ultimate { border-color: #e8c574; outline: 1px solid #e8c574; outline-offset: 3px; }
.skill-glyph--boss::after { content: ''; position: absolute; right: 5px; bottom: 5px; width: 5px; height: 5px; border-radius: 50%; background: #e8c574; }
.skill-glyph--inline { --glyph-frame: 22px; --glyph-size: 20px; margin: 0; border: 0; border-radius: 0; background: none; outline: none; }
.skill-glyph--inline::after { display: none; }
@media (max-width: 700px) {
  .skill-glyph--card { --glyph-frame: 48px; --glyph-size: 30px; }
}
</style>
