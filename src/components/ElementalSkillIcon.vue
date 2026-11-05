<script setup>
// Legacy adapter: geometry, glyph resolution and tier styling belong to SkillIcon.
import SkillIcon from './SkillIcon.vue'
defineProps({ skillId: { type: String, required: true }, route: { type: String, default: '' }, kind: { type: String, default: 'common' } })
</script>
<template>
  <SkillIcon :skill="{ id: skillId, spec: 'elemental', route, kind }" />
</template>
