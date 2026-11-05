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
const title = computed(() => reviewing.value ? `确认锁定【${chosen.value?.name || ''}】` : '中期路线确认 · 选择暴食方向')
const pick = (card) => {
  if (reviewing.value) {
    if (card.id === 'route-confirm' && chosen.value) emit('select', chosen.value)
    else reviewing.value = false
  } else if (!card.locked) {
    chosen.value = card
    reviewing.value = true
  }
}
</script>

<template>
  <div class="glutton-route-overlay" role="dialog" aria-modal="true" aria-label="暴食路线确认">
    <div class="glutton-route-panel">
      <div class="route-kicker">🍽️ 随机探索已积累 5 次 · 现在做出不可逆的路线选择</div>
      <h2>{{ title }}</h2>
      <p v-if="!reviewing" class="route-intro">已有入口会点亮对应路线；抽不到的方向会暂时锁定。猎食点、公共强化和已获得的其他基础能力继续保留。</p>
      <p v-else class="route-intro">锁定后将关闭另外两条路线的进阶卡与终极大招。已获得的基础能力继续生效。</p>
      <div v-if="!reviewing" class="route-grid">
        <button v-for="(r, idx) in options" :key="r.id" class="route-card" :class="[{ locked: r.locked, 'is-selected': selectedIndex === idx }]" :style="{ '--route-color': r.color }" :disabled="r.locked" @mouseenter="selectedIndex = idx" @click="pick(r)">
          <kbd>{{ idx + 1 }}</kbd><strong><SkillIcon :skill="{ id: routeIconId('gluttony', r.route), spec: 'gluttony', route: r.route }" />{{ r.name }}</strong>
          <span>{{ r.desc }}</span><b>{{ r.bonus }}</b>
          <span class="route-ultimate"><b>终极 · {{ r.ultimateName }}</b>{{ r.ultimateDesc }}</span>
          <small v-if="r.locked">🔒 {{ r.requirement }}</small>
          <small v-else>已投入 {{ r.investment }} · 后续：{{ r.skills.join('、') }}</small>
        </button>
      </div>
      <div v-else class="route-review">
        <div class="review-route" :style="{ '--route-color': chosen.color }"><strong><SkillIcon :skill="{ id: routeIconId('gluttony', chosen.route), spec: 'gluttony', route: chosen.route }" />{{ chosen.name }}</strong><span>{{ chosen.bonus }}</span><b>终极：{{ chosen.ultimateName }}</b><span>{{ chosen.ultimateDesc }}</span></div>
        <div class="review-actions">
          <button v-for="(action, idx) in source" :key="action.id" :class="{ 'is-selected': selectedIndex === idx, confirm: idx === 0 }" @mouseenter="selectedIndex = idx" @click="pick(action)"><kbd>{{ idx + 1 }}</kbd>{{ action.icon }} {{ action.name }}</button>
        </div>
      </div>
      <div class="route-key-hint">⌨ ← → 选择 · Enter / 空格 下一步 · 数字键操作</div>
    </div>
  </div>
</template>

<style scoped>
.glutton-route-overlay { position:absolute; inset:0; z-index:11; display:flex; align-items:center; justify-content:center; overflow:auto; background:rgba(20,8,5,.88); backdrop-filter:blur(7px); }
.glutton-route-panel { box-sizing:border-box; width:min(1080px,94vw); margin:auto; padding:30px; color:#fff4e5; text-align:center; }
.route-kicker { color:#ffd166; font-size:12px; letter-spacing:2px; }
h2 { margin:10px 0; color:#ffe3ad; font-size:28px; }
.route-intro { margin:0 auto 22px; max-width:760px; color:rgba(255,244,229,.72); line-height:1.6; font-size:13px; }
.route-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
.route-card { position:relative; display:flex; flex-direction:column; gap:10px; min-height:300px; padding:24px 18px 18px; border:1px solid color-mix(in srgb,var(--route-color) 52%,transparent); border-radius:18px; color:#fff4e5; background:linear-gradient(165deg,rgba(50,28,20,.98),rgba(18,9,7,.98)); text-align:left; cursor:pointer; transition:.18s ease; }
.route-card:hover,.route-card.is-selected { transform:translateY(-5px); border-color:var(--route-color); box-shadow:0 0 28px color-mix(in srgb,var(--route-color) 28%,transparent); }
.route-card.locked { opacity:.56; cursor:not-allowed; filter:saturate(.35); }
.route-card kbd,.review-actions kbd { position:absolute; top:10px; right:12px; padding:2px 7px; border-radius:5px; color:#25130d; background:#ffd166; font-weight:800; }
.route-card strong { display:flex; align-items:center; flex-direction:column; gap:6px; color:var(--route-color); font-size:20px; text-align:center; }
.route-card span:not(.skill-glyph) { min-height:58px; color:rgba(255,244,229,.75); font-size:12px; line-height:1.55; }
.route-card b { padding:9px; border-radius:9px; color:#fff; background:rgba(255,209,102,.1); font-size:11px; line-height:1.5; }
.route-card small { margin-top:auto; color:rgba(255,244,229,.56); line-height:1.5; }
.route-card .route-ultimate { min-height:0; font-size:11px; }.route-ultimate b { display:block; margin-bottom:6px; padding:0; background:none; color:var(--route-color); }
.route-review { max-width:620px; margin:0 auto; }.review-route { display:flex; flex-direction:column; gap:12px; padding:26px; border:1px solid var(--route-color); border-radius:18px; background:rgba(255,255,255,.06); }.review-route strong { display:flex; align-items:center; flex-direction:column; gap:8px; color:var(--route-color); font-size:24px; }.review-route span:not(.skill-glyph),.review-route b { font-size:13px; }.review-actions { display:flex; justify-content:center; gap:14px; margin-top:22px; }.review-actions button { position:relative; min-width:180px; padding:14px 22px; border:1px solid rgba(255,255,255,.24); border-radius:12px; color:#fff4e5; background:rgba(255,255,255,.08); cursor:pointer; font-weight:800; }.review-actions button.confirm { color:#25130d; background:#ffd166; border-color:#ffd166; }.review-actions button.is-selected { outline:3px solid #fff; outline-offset:2px; }.route-key-hint { margin-top:22px; color:rgba(255,244,229,.55); font-size:12px; }
@media(max-width:700px){.glutton-route-panel{padding:20px 12px}.route-grid{grid-template-columns:1fr}.route-card{min-height:0}.review-actions{flex-direction:column}.review-actions button{width:100%}h2{font-size:22px}}
</style>
