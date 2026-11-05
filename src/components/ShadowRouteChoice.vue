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
  <div class="shadow-route-overlay" role="dialog" aria-modal="true" aria-label="暗影路线确认">
    <section class="shadow-route-panel">
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
      <div class="route-key-hint">⌨ ← → 选择 · Enter / 空格 下一步 · 数字键操作</div>
    </section>
  </div>
</template>

<style scoped>
.shadow-route-overlay { position:absolute; inset:0; z-index:11; display:flex; align-items:center; justify-content:center; overflow:auto; background:rgba(6,9,17,.9); backdrop-filter:blur(7px); }
.shadow-route-panel { box-sizing:border-box; width:min(1080px,94vw); margin:auto; padding:30px; color:#e8edf7; text-align:center; }
.route-kicker { color:#b9c7dc; font-size:12px; letter-spacing:1.5px; }
h2 { margin:10px 0; color:#f0d8e5; font-size:28px; }
.route-intro { max-width:760px; margin:0 auto 22px; color:rgba(232,237,247,.7); font-size:13px; line-height:1.6; }
.route-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; }
.route-card { position:relative; display:flex; min-height:310px; flex-direction:column; gap:10px; padding:22px 18px 16px; border:1px solid color-mix(in srgb,var(--route-color) 42%,transparent); border-radius:15px; color:#e8edf7; background:linear-gradient(165deg,color-mix(in srgb,var(--route-color) 8%,#151923),#0b0e15); text-align:left; cursor:pointer; transition:border-color .16s ease,background .16s ease,transform .16s ease; }
.route-card:hover,.route-card.is-selected { transform:translateY(-3px); border-color:color-mix(in srgb,var(--route-color) 82%,white 18%); background:linear-gradient(165deg,color-mix(in srgb,var(--route-color) 13%,#151923),#0b0e15); }
.route-card.locked { opacity:.48; cursor:not-allowed; filter:saturate(.45); }
kbd { position:absolute; top:10px; right:12px; padding:2px 7px; border:1px solid rgba(255,255,255,.15); border-radius:5px; color:#d9e0ed; background:rgba(255,255,255,.07); font-size:11px; font-weight:700; }
.route-card strong { display:flex; align-items:center; flex-direction:column; gap:4px; color:var(--route-color); font-size:19px; text-align:center; }
.route-card strong :deep(.skill-glyph) { margin:0 0 5px; }
.route-card span:not(.skill-glyph) { color:rgba(232,237,247,.74); font-size:12px; line-height:1.55; }
.route-card .route-bonus { padding:8px 9px; border-left:2px solid color-mix(in srgb,var(--route-color) 70%,transparent); color:#e5eaf4; background:rgba(255,255,255,.045); font-size:11px; line-height:1.5; }
.route-card .route-ultimate { min-height:0; color:rgba(232,237,247,.62); font-size:11px; }
.route-ultimate b { display:block; margin-bottom:4px; color:var(--route-color); }
.route-card small { margin-top:auto; color:rgba(232,237,247,.58); font-size:10px; line-height:1.5; }
.route-review { max-width:620px; margin:0 auto; }
.review-route { display:flex; flex-direction:column; gap:12px; padding:24px; border:1px solid color-mix(in srgb,var(--route-color) 60%,transparent); border-radius:15px; background:rgba(255,255,255,.035); }
.review-route strong { display:flex; align-items:center; flex-direction:column; gap:6px; color:var(--route-color); font-size:23px; }
.review-route strong :deep(.skill-glyph) { margin:0 0 5px; }
.review-route span:not(.skill-glyph),.review-route b { color:rgba(232,237,247,.78); font-size:13px; line-height:1.5; }
.review-actions { display:flex; justify-content:center; gap:12px; margin-top:20px; }
.review-actions button { position:relative; min-width:180px; padding:13px 22px; border:1px solid rgba(255,255,255,.2); border-radius:10px; color:#e8edf7; background:rgba(255,255,255,.06); cursor:pointer; font-weight:700; }
.review-actions button.confirm { border-color:#d9c6d6; color:#18141b; background:#d9c6d6; }
.review-actions button.is-selected { outline:2px solid #fff; outline-offset:2px; }
.route-key-hint { margin-top:20px; color:rgba(232,237,247,.5); font-size:11px; }
@media(max-width:700px) { .shadow-route-panel{padding:18px 12px}.route-grid{grid-template-columns:1fr;gap:10px}.route-card{min-height:0}.review-actions{flex-direction:column}.review-actions button{width:100%}h2{font-size:22px} }
</style>
