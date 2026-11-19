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
const { selectedIndex } = useCardFocus(source, card => {
  if (reviewing.value) {
    if (card.id === 'route-confirm' && chosen.value) emit('select', chosen.value)
    else reviewing.value = false
  } else if (!card.locked) { chosen.value = card; reviewing.value = true }
})
const title = computed(() => reviewing.value ? `确认锁定【${chosen.value?.name || ''}】` : '中期路线确认 · 选择暗影方向')
const pick = card => {
  if (reviewing.value) {
    if (card.id === 'route-confirm' && chosen.value) emit('select', chosen.value)
    else reviewing.value = false
  } else if (!card.locked) { chosen.value = card; reviewing.value = true }
}
</script>

<template>
  <div class="shadow-route-overlay route-overlay" role="dialog" aria-modal="true" aria-label="暗影路线确认">
    <section class="shadow-route-panel route-panel">
      <div class="route-kicker">✦ 随机探索已积累 5 次 · 路线确认后将锁定方向</div>
      <h2>{{ title }}</h2>
      <p class="route-intro">
        {{ reviewing ? '锁定后会关闭另外两条路线的进阶技能与终极大招；已获得的入口、基础能力和通用强化继续生效。' : '只可选择已抽到的路线入口。猎杀追击、群影协同与裂影刃潮的终极互斥，终极技能达标后仍随机出现。' }}
      </p>
      <div v-if="!reviewing" class="route-grid">
        <button v-for="(route, idx) in options" :key="route.id" class="route-card" :class="[{ locked: route.locked, 'is-selected': selectedIndex === idx }]" :style="{ '--route-color': route.color }" :disabled="route.locked" @mouseenter="selectedIndex = idx" @click="pick(route)">
          <kbd>{{ idx + 1 }}</kbd>
          <strong><SkillIcon :skill="{ id: routeIconId('assassin', route.route), spec: 'assassin', route: route.route }" />{{ route.name }}</strong>
          <span>{{ route.desc }}</span>
          <b class="route-bonus">{{ route.bonus }}</b>
          <span class="route-ultimate"><b>终极 · {{ route.ultimateName }}</b>{{ route.ultimateDesc }}</span>
          <small v-if="route.locked">🔒 {{ route.requirement }}</small>
          <small v-else>已投入 {{ route.investment }} · 后续：{{ route.skills.join('、') }}</small>
        </button>
      </div>
      <div v-else class="route-review">
        <div class="review-route" :style="{ '--route-color': chosen.color }">
          <strong><SkillIcon :skill="{ id: routeIconId('assassin', chosen.route), spec: 'assassin', route: chosen.route }" />{{ chosen.name }}</strong>
          <span>{{ chosen.bonus }}</span><b>终极：{{ chosen.ultimateName }}</b><span>{{ chosen.ultimateDesc }}</span>
        </div>
        <div class="review-actions">
          <button v-for="(action, idx) in source" :key="action.id" :class="{ 'is-selected': selectedIndex === idx, confirm: idx === 0 }" @mouseenter="selectedIndex = idx" @click="pick(action)"><kbd>{{ idx + 1 }}</kbd>{{ action.icon }} {{ action.name }}</button>
        </div>
      </div>
      <div class="route-key-hint">⌨ ← → 或数字键切换 · Enter 下一步</div>
    </section>
  </div>
</template>

<style scoped src="./routeChoiceTheme.css"></style>
<style scoped>
.shadow-route-overlay { --strain-accent: #f18ba5; }
</style>
