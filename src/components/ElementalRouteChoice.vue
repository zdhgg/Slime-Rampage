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
const title = computed(() => reviewing.value ? `确认锁定【${chosen.value?.name || ''}】` : '中期路线确认 · 选择元素构筑')
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
      <div class="route-kicker">◆ 随机探索已积累 5 次 · 元素构筑即将定型</div>
      <h2>{{ title }}</h2>
      <p v-if="!reviewing" class="route-intro">已有元素会保留。单系、双系和三系以上轮转分别对应不同的战斗节奏；锁定后中后期方向不可更改。</p>
      <p v-else class="route-intro">锁定后只开放当前路线的进阶和互斥终极。已掌握的元素与普通法术强化继续生效。</p>
      <div v-if="!reviewing" class="route-grid">
        <button v-for="(r, idx) in options" :key="r.id" class="route-card" :class="[{ locked: r.locked, 'is-selected': selectedIndex === idx }]" :style="{ '--route-color': r.color }" :disabled="r.locked" @mouseenter="selectedIndex = idx" @click="pick(r)">
          <kbd>{{ idx + 1 }}</kbd>
          <strong><SkillIcon :skill="{ id: routeIconId('elemental', r.route), spec: 'elemental', route: r.route }" />{{ r.name }}</strong>
          <span>{{ r.desc }}</span><b>{{ r.bonus }}</b>
          <span class="route-ultimate"><b>终极 · {{ r.ultimateName }}</b>{{ r.ultimateDesc }}</span>
          <small v-if="r.locked">🔒 {{ r.requirement }}</small>
          <small v-else-if="r.route === 'single'">主元素：{{ r.elements[0] }}（首个发现） · 已掌握：{{ r.elements.join('、') }} · 后续：{{ r.skills.join('、') }}</small>
          <small v-else>已掌握：{{ r.elements.join('、') }} · 后续：{{ r.skills.join('、') }}</small>
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
</style>
