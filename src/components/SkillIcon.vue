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
/* 彩色宝石徽章：渐变球底 + 内高光白边 + 柔和外发光，白色图标带立体投影 */
.skill-glyph {
  --glyph-frame: 68px;
  --glyph-size: 36px;
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
  border: 2.5px solid #FFFFFF;
  border-radius: 50%;
  color: #FFFFFF;
  background:
    radial-gradient(circle at 32% 26%, rgba(255, 255, 255, 0.5), transparent 46%),
    linear-gradient(150deg, color-mix(in srgb, var(--skill-icon-color) 88%, #fff 12%) 0%, var(--skill-icon-color) 62%, color-mix(in srgb, var(--skill-icon-color) 62%, #064E3B 38%) 100%);
  box-shadow: inset 0 -6px 12px color-mix(in srgb, var(--skill-icon-color) 40%, transparent), 0 8px 18px color-mix(in srgb, var(--skill-icon-color) 45%, transparent);
  vertical-align: middle;
  line-height: 1;
  filter: drop-shadow(0 2px 4px rgba(6, 78, 59, 0.3));
}
.skill-glyph :deep(svg) {
  display: block;
  width: var(--glyph-size);
  height: var(--glyph-size);
  flex: none;
  filter: drop-shadow(0 2px 3px rgba(0, 60, 40, 0.4));
}
.skill-glyph--ultimate { border-color: #FDE68A; box-shadow: inset 0 -6px 12px rgba(232, 197, 116, 0.5), 0 0 16px rgba(232, 197, 116, 0.5), 0 8px 18px rgba(232, 197, 116, 0.4); }
.skill-glyph--boss::after { content: ''; position: absolute; right: 4px; bottom: 4px; width: 12px; height: 12px; border: 2px solid #FFFFFF; border-radius: 50%; background: #F59E0B; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3); }
.skill-glyph--inline { --glyph-frame: 22px; --glyph-size: 20px; margin: 0; border: 0; border-radius: 0; background: none; outline: none; box-shadow: none; filter: none; }
.skill-glyph--inline :deep(svg) { filter: none; }
.skill-glyph--inline::after { display: none; }
@media (max-width: 700px) {
  .skill-glyph--card { --glyph-frame: 54px; --glyph-size: 30px; }
}
</style>
