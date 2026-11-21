<script setup>
import { computed, ref } from 'vue'
import { useCardFocus } from './useCardFocus.js'
import SkillIcon from './SkillIcon.vue'
import { routeIconId } from './skillIconRegistry.js'

const props = defineProps({ options: { type: Array, required: true } })
const emit = defineEmits(['select'])
const reviewing = ref(false)
const chosen = ref(null)
const source = computed(() => reviewing.value
  ? [{ id: 'route-confirm', name: '确认锁定', icon: '✓' }, { id: 'route-cancel', name: '返回重选', icon: '↩' }]
  : props.options)
const { selectedIndex } = useCardFocus(source, (card) => {
  if (reviewing.value) {
    if (card.id === 'route-confirm' && chosen.value) emit('select', chosen.value)
    else reviewing.value = false
    return
  }
  if (card.locked) return
  chosen.value = card; reviewing.value = true
})
const title = computed(() => reviewing.value ? `确认升华【${chosen.value?.name || ''}】` : '专精分支升华 · 选择本系流派')
const pick = (card) => {
  if (reviewing.value) {
    if (card.id === 'route-confirm' && chosen.value) emit('select', chosen.value)
    else reviewing.value = false
  } else if (!card.locked) {
    chosen.value = card; reviewing.value = true
  }
}
</script>

<template>
  <div class="elemental-route-overlay route-overlay" role="dialog" aria-modal="true" aria-label="元素构筑路线确认">
    <div class="elemental-route-panel route-panel">
      <div class="route-kicker">◆ 主系探索已积累 5 次 · 元素专精即将升华</div>
      <h2>{{ title }}</h2>
      <p v-if="!reviewing" class="route-intro">选定分支后立刻触发升华质变（未学的签名核心法术将免费获得 Lv.1），并在 Lv.14 开启本分支专属终极奥义；分支定型后本局不再更改。</p>
      <p v-else class="route-intro">锁定后将开放该分支的 2 项专属进阶与互斥终极奥义；已掌握的主系强化与跨系兼修法术全部继续生效。</p>
      <div v-if="!reviewing" class="route-grid">
        <button v-for="(r, idx) in options" :key="r.id" class="route-card" :class="[{ locked: r.locked, 'is-selected': selectedIndex === idx }]" :style="{ '--route-color': r.color }" :disabled="r.locked" @mouseenter="selectedIndex = idx" @click="pick(r)">
          <kbd>{{ idx + 1 }}</kbd>
          <strong><SkillIcon :skill="{ id: routeIconId('elemental', r.route), spec: 'elemental', route: r.route }" />{{ r.name }}</strong>
          <span>{{ r.desc }}</span><b>{{ r.bonus }}</b>
          <span class="route-ultimate"><b>终极 · {{ r.ultimateName }}</b>{{ r.ultimateDesc }}</span>
          <small v-if="r.locked">🔒 {{ r.requirement }}</small>
          <small v-else>所属专精：{{ r.schoolName || '主修专精' }} · 分支进阶：{{ (r.skills || []).join('、') }}</small>
        </button>
      </div>
      <div v-else class="route-review">
        <div class="review-route" :style="{ '--route-color': chosen.color }"><strong><SkillIcon :skill="{ id: routeIconId('elemental', chosen.route), spec: 'elemental', route: chosen.route }" />{{ chosen.name }}</strong><span>{{ chosen.bonus }}</span><b>终极：{{ chosen.ultimateName }}</b><span>{{ chosen.ultimateDesc }}</span></div>
        <div class="review-actions">
          <button v-for="(action, idx) in source" :key="action.id" :class="{ 'is-selected': selectedIndex === idx, confirm: idx === 0 }" @mouseenter="selectedIndex = idx" @click="pick(action)"><kbd>{{ idx + 1 }}</kbd>{{ action.icon }} {{ action.name }}</button>
        </div>
      </div>
      <div class="route-key-hint">⌨ ← → 或数字键切换 · Enter 下一步</div>
    </div>
  </div>
</template>

<style scoped src="./routeChoiceTheme.css"></style>
<style scoped>
.elemental-route-overlay { --strain-accent: #b6a4ff; }
.elemental-route-panel {
  width: min(820px, 94vw);
}
.elemental-route-panel .route-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}
@media (max-width: 700px) {
  .elemental-route-panel .route-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}
</style>
