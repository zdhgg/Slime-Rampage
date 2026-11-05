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
  <div class="elemental-route-overlay" role="dialog" aria-modal="true" aria-label="元素构筑路线确认">
    <div class="elemental-route-panel">
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
      <div class="route-key-hint">⌨ ← → 选择 · Enter / 空格 下一步 · 数字键操作</div>
    </div>
  </div>
</template>

<style scoped>
.elemental-route-overlay { position:absolute; inset:0; z-index:11; display:flex; align-items:center; justify-content:center; overflow:auto; background:rgba(8,8,20,.88); backdrop-filter:blur(7px); }
.elemental-route-panel { box-sizing:border-box; width:min(1080px,94vw); margin:auto; padding:30px; color:#f0efff; text-align:center; }
.route-kicker { color:#c9cbff; font-size:12px; letter-spacing:2px; }
h2 { margin:10px 0; color:#e5e1ff; font-size:28px; }
.route-intro { margin:0 auto 22px; max-width:780px; color:rgba(240,239,255,.72); line-height:1.6; font-size:13px; }
.route-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
.route-card { position:relative; display:flex; flex-direction:column; gap:10px; min-height:300px; padding:24px 18px 18px; border:1px solid color-mix(in srgb,var(--route-color) 52%,transparent); border-radius:18px; color:#f0efff; background:linear-gradient(165deg,rgba(31,30,51,.98),rgba(10,10,20,.98)); text-align:left; cursor:pointer; transition:.18s ease; }
.route-card:hover,.route-card.is-selected { transform:translateY(-5px); border-color:var(--route-color); box-shadow:0 0 28px color-mix(in srgb,var(--route-color) 28%,transparent); }
.route-card.locked { opacity:.56; cursor:not-allowed; filter:saturate(.35); }
.route-card kbd,.review-actions kbd { position:absolute; top:10px; right:12px; padding:2px 7px; border-radius:5px; color:#11121e; background:#ffd166; font-weight:800; }
.route-card strong { display:flex; align-items:center; flex-direction:column; gap:6px; color:var(--route-color); font-size:20px; text-align:center; }
.route-card span:not(.skill-glyph) { min-height:58px; color:rgba(240,239,255,.75); font-size:12px; line-height:1.55; }
.route-card b { padding:9px; border-radius:9px; color:#fff; background:rgba(201,203,255,.1); font-size:11px; line-height:1.5; }
.route-card small { margin-top:auto; color:rgba(240,239,255,.56); line-height:1.5; }
.route-card .route-ultimate { min-height:0; font-size:11px; }.route-ultimate b { display:block; margin-bottom:6px; padding:0; background:none; color:var(--route-color); }
.route-review { max-width:620px; margin:0 auto; }.review-route { display:flex; flex-direction:column; gap:12px; padding:26px; border:1px solid var(--route-color); border-radius:18px; background:rgba(255,255,255,.06); }.review-route strong { display:flex; align-items:center; flex-direction:column; gap:8px; color:var(--route-color); font-size:24px; }.review-route span:not(.skill-glyph),.review-route b { font-size:13px; }.review-actions { display:flex; justify-content:center; gap:14px; margin-top:22px; }.review-actions button { position:relative; min-width:180px; padding:14px 22px; border:1px solid rgba(255,255,255,.24); border-radius:12px; color:#f0efff; background:rgba(255,255,255,.08); cursor:pointer; font-weight:800; }.review-actions button.confirm { color:#11121e; background:#ffd166; border-color:#ffd166; }.review-actions button.is-selected { outline:3px solid #fff; outline-offset:2px; }.route-key-hint { margin-top:22px; color:rgba(240,239,255,.55); font-size:12px; }
@media(max-width:700px){.elemental-route-panel{padding:20px 12px}.route-grid{grid-template-columns:1fr}.route-card{min-height:0}.review-actions{flex-direction:column}.review-actions button{width:100%}h2{font-size:22px}}
</style>
