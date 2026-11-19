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
  chosen.value = card
  reviewing.value = true
})
const title = computed(() => reviewing.value ? `确认驶入【${chosen.value?.name || ''}】` : '中期路线确认 · 选定你的弹射方向')
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
  <div class="ricochet-route-overlay route-overlay" role="dialog" aria-modal="true" aria-label="弹射路线确认">
    <div class="ricochet-route-panel route-panel">
      <div class="route-kicker">✦ 弹道探索已完成 · 现在做出不可逆的路线选择</div>
      <h2>{{ title }}</h2>
      <p v-if="!reviewing" class="route-intro">已有入口会点亮对应路线；抽不到的方向会暂时锁定。公共强化和已获得的其他入口仍然保留。</p>
      <p v-else class="route-intro">锁定后将关闭另外两条路线的进阶卡与终极大招。已获得的公共强化、其他入口和混搭联动会继续生效。</p>
      <div v-if="!reviewing" class="route-grid">
        <button v-for="(r, idx) in options" :key="r.id" class="route-card" :class="[{ locked: r.locked, 'is-selected': selectedIndex === idx }]" :style="{ '--route-color': r.color }" :disabled="r.locked" @mouseenter="selectedIndex = idx" @click="pick(r)">
          <kbd>{{ idx + 1 }}</kbd><strong><SkillIcon :skill="{ id: routeIconId('gatling', r.route), spec: 'gatling', route: r.route }" />{{ r.name }}</strong>
          <span>{{ r.desc }}</span><b>{{ r.bonus }}</b>
          <span class="route-ultimate"><b>终极 · {{ r.ultimateName }}</b>{{ r.ultimateDesc }}</span>
          <small v-if="r.locked">🔒 {{ r.requirement }}</small>
          <small v-else>已投入 {{ r.investment }} · 后续：{{ r.skills.join('、') }}</small>
        </button>
      </div>
      <div v-if="!reviewing" class="route-touch-hint">触摸选择路线 · 向下滑动查看全部方向</div>
      <div v-else class="route-review">
        <div class="review-route" :style="{ '--route-color': chosen.color }"><strong><SkillIcon :skill="{ id: routeIconId('gatling', chosen.route), spec: 'gatling', route: chosen.route }" />{{ chosen.name }}</strong><span>{{ chosen.bonus }}</span><span class="route-weakness">短板：{{ chosen.weakness }}</span><b>终极：{{ chosen.ultimateName }}</b><span>{{ chosen.ultimateDesc }}</span></div>
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
.ricochet-route-overlay { --strain-accent: #56ccf2; }
</style>
