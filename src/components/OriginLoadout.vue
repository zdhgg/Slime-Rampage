<script setup>
const props = defineProps({ combo: { type: Object, required: true } })
const emit = defineEmits(['configure'])
function toggle(id, checked) {
  const equipped = checked ? [...props.combo.equipped, id] : props.combo.equipped.filter(item => item !== id)
  if (!equipped.length || equipped.length > 4) return
  emit('configure', equipped, equipped.includes(props.combo.main) ? props.combo.main : equipped[0])
}
function elementName(id) {
  return props.combo.elements?.find(item => item.id === id)?.name || ''
}
</script>
<template>
  <details class="origin-loadout" @keydown.stop @keyup.stop>
    <summary>超载配置 · {{ combo.equipped.length }}/4</summary>
    <p>主技能每次释放，协同随机出场；最多装备四项能力。已释放连招保留原配置。<span v-if="combo.tripleUnlocked"> 三重超载 {{ combo.tripleCount }}/3</span></p>
    <label>主技能
      <select :value="combo.main" @change="emit('configure', combo.equipped, $event.target.value)">
        <option v-for="skill in combo.skills.filter(item => combo.equipped.includes(item.id))" :key="skill.id" :value="skill.id">{{ skill.name }}</option>
      </select>
    </label>
    <label v-for="skill in combo.skills" :key="skill.id">
      <input type="checkbox" :checked="combo.equipped.includes(skill.id)"
        :disabled="(combo.equipped.includes(skill.id) && combo.equipped.length === 1) || (!combo.equipped.includes(skill.id) && combo.equipped.length >= 4)"
        @change="toggle(skill.id, $event.target.checked)">
      {{ skill.name }} <small>{{ skill.id === combo.main ? '主技能' : '协同候选' }}</small>
    </label>
    <!-- 元素注入由等级排名派生：主技能第 1 名、协同第 2 名、第三技能第 3 名（只读） -->
    <p v-if="combo.inject?.primary" class="inject-line">
      注入：主 {{ elementName(combo.inject.primary) }}<template v-if="combo.inject.secondary && combo.inject.secondary !== combo.inject.primary"> · 协同 {{ elementName(combo.inject.secondary) }}</template><template v-if="combo.tripleUnlocked"> · 第三 {{ combo.inject.third ? elementName(combo.inject.third) : '（缺第 3 元素）' }}</template>
    </p>
    <p v-if="combo.reactionName" class="inject-line">
      连招：{{ combo.reactionName }}<template v-for="r in combo.secondaryReactions" :key="r.id"> · {{ r.name }}</template>
    </p>
  </details>
</template>
<style scoped>
.origin-loadout { position: absolute; bottom: 14px; left: 14px; z-index: 40; width: min(330px, calc(100% - 28px)); box-sizing: border-box; max-height: 42%; overflow: auto; padding: 12px 16px; border: 1px solid #466658; border-radius: 12px; background: #101e19; color: #e2f6e9; box-shadow: 0 8px 28px #0008; }
summary { cursor: pointer; font-weight: 700; }
p { color: #a8beb0; font-size: 12px; line-height: 1.5; }
p.inject-line { color: #d4edaa; }
label { display: flex; align-items: center; gap: 8px; padding: 7px 0; font-size: 13px; }
select { flex: 1; min-width: 0; padding: 6px; color: #e2f6e9; background: #20382d; border: 1px solid #547262; border-radius: 5px; }
small { margin-left: auto; color: #a8beb0; }
</style>
