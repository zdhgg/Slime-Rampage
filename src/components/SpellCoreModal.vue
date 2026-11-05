<script setup>
import SkillIcon from './SkillIcon.vue'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
const props = defineProps({ info: { type: Object, required: true } })
const heading = computed(() => props.info.stage === 'first' ? '选择你的第一个法术'
  : props.info.stage === 'evolution' ? '融合主动术进化'
  : props.info.stage === 'boss' ? '强化当前元素构筑'
  : props.info.first ? '选择第二元素，确定本局融合' : '深化你的元素法术')
const copy = computed(() => props.info.stage === 'first' ? '选择后自动施放，替换原质飞弹。随后通过随机升级发现更多元素，决定本局的进化方向。'
  : props.info.stage === 'evolution' ? '融合主动术获得新的形态与效果，两套自动法术及已学强化全部保留。'
  : props.info.stage === 'boss' ? '选择一项强化当前已掌握元素的法术核心。新元素与构筑路线仍通过升级随机探索。'
  : props.info.first ? '新增一套自动法术，并将空格进化为融合术。组合确定后，本局持续强化这两种元素。'
  : '选择一项改造，立即生效。法术进化沿用现有技能位。')
const emit = defineEmits(['select'])
const panel = ref(null)
let previousFocus
onMounted(() => { previousFocus = document.activeElement; panel.value?.querySelector('button')?.focus({ preventScroll: true }) })
watch(() => props.info, () => nextTick(() => panel.value?.querySelector('button')?.focus({ preventScroll: true })))
onUnmounted(() => nextTick(() => { if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }) }))
function trap(event) {
  const buttons = [...panel.value.querySelectorAll('button')], current = buttons.indexOf(document.activeElement)
  buttons[(current + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus()
}
</script>

<template>
  <div class="spell-core-overlay" @keydown.tab.prevent="trap">
    <section ref="panel" class="spell-core-panel" :class="{ 'milestone-panel': info.milestone }" role="dialog" aria-modal="true" aria-labelledby="spell-core-title" aria-describedby="spell-core-copy">
      <div class="core-heading"><SkillIcon skill="spec_elemental" size="inline" /><div><p>{{ info.milestone ? '元素成长' : '法术核心' }} · {{ info.source }}</p><h2 id="spell-core-title">{{ heading }}</h2></div></div>
      <p id="spell-core-copy" class="core-copy">{{ copy }}</p>
      <div class="core-options" :class="{ 'first-spell-options': info.stage === 'first', 'evolution-options': info.stage === 'evolution' }">
        <button v-for="option in info.options" :key="option.id" class="core-option" :style="{ '--core-accent': option.color }" @click="emit('select', option.id)">
          <span class="core-option-top"><SkillIcon :skill="{ ...option, spec: 'elemental' }" /><small>{{ option.label || (info.stage === 'evolution' ? '空格法术进化' : info.first ? '第二元素' : option.kind === 'form' ? '雷系形态替换' : option.kind === 'shape' ? '基础法术改造' : option.kind === 'reaction' ? '融合反应强化' : option.kind === 'active' ? '空格法术进化' : '法术强度') }}</small></span>
          <strong>{{ option.name }}</strong><p>{{ option.desc }}</p>
          <div v-if="option.fusion" class="core-fusion"><b>{{ option.fusion.name }}</b><p>{{ option.fusion.desc }}</p><span>空格 · {{ option.fusion.active }}</span><p>{{ option.preview }}</p></div>
          <span v-if="!info.first && info.stage !== 'first'" class="core-upgrade">{{ option.stats }}</span><span class="core-select">{{ info.stage === 'first' ? '学习法术' : info.first ? '确定融合' : option.isEvolution ? '进化法术' : '吸收强化' }} <span aria-hidden="true">→</span></span>
        </button>
      </div>
      <p class="core-footer">{{ info.stage === 'first' ? '自动瞄准与施法，专心移动躲避敌人即可' : info.stage === 'boss' ? '首领核心只强化当前构筑，不替你决定路线' : '多系法术 · 随机路线 · 一个空格主动术' }}</p>
    </section>
  </div>
</template>

<style scoped>
.spell-core-overlay { position: fixed; inset: 0; z-index: 160; display: grid; place-items: center; padding: 24px; background: rgb(5 7 9 / .84); pointer-events: auto; }
.spell-core-panel { width: min(880px, 100%); max-height: calc(100dvh - 48px); overflow-y: auto; padding: 30px; color: #e9e8ed; background: #17171c; border: 1px solid #41404c; border-radius: 12px; box-shadow: 0 20px 70px rgb(0 0 0 / .3); }
.core-heading { display: flex; align-items: center; gap: 16px; }.core-glyph { font-size: 32px; color: #b6a4ff; }
.core-heading p { margin: 0 0 7px; color: #a99bc8; font-size: 12px; }.core-heading h2 { margin: 0; font-size: 24px; line-height: 1.35; }
.core-copy { color: #a8a7b2; font-size: 13px; line-height: 1.7; margin: 18px 0 24px; }
.core-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.first-spell-options { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.evolution-options { grid-template-columns: minmax(0, 1fr); max-width: 520px; margin: 0 auto; }
.core-option { display: flex; flex-direction: column; text-align: left; padding: 20px; border: 1px solid #393843; border-radius: 8px; color: #e9e8ed; background: #202027; font: inherit; cursor: pointer; transition: border-color .15s, background .15s; }
.core-option:hover { border-color: var(--core-accent); background: #272630; }.core-option:focus-visible { outline: 2px solid var(--core-accent); outline-offset: 3px; }.core-option:active { background: #302e3b; }
.core-option-top { display: flex; align-items: center; gap: 9px; margin-bottom: 17px; color: var(--core-accent); }.core-option-top :deep(.skill-glyph) { margin: 0; }.core-option-top small { font-size: 11px; }
.core-option > strong { font-size: 18px; line-height: 1.4; }.core-option p { margin: 10px 0 16px; color: #b2b1bd; font-size: 12px; line-height: 1.8; }
.core-fusion { padding-top: 14px; border-top: 1px solid #3a3944; }.core-fusion b, .core-fusion span { display: block; }.core-fusion b { color: var(--core-accent); font-size: 14px; }.core-fusion span { margin-top: 8px; font-size: 12px; }
.core-upgrade { display: block; margin-top: auto; padding-top: 16px; color: #c6bbdf; font-size: 11px; line-height: 1.7; }
.core-select { display: flex; justify-content: space-between; padding-top: 17px; margin-top: 16px; border-top: 1px solid #3a3944; font-size: 12px; font-weight: 600; }
.core-footer { margin: 22px 0 0; color: #777583; font-size: 11px; text-align: center; }
@media (max-width: 620px) {
  .spell-core-overlay { padding: 12px; }.spell-core-panel { padding: 20px; max-height: calc(100dvh - 24px); }
  .core-heading h2 { font-size: 20px; }.core-heading { gap: 10px; }.core-glyph { font-size: 25px; }
  .core-options { grid-template-columns: 1fr; gap: 10px; }.core-option { padding: 16px; }.core-option-top { margin-bottom: 8px; }.core-option > strong { font-size: 16px; }
  .first-spell-options { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .first-spell-options .core-option { padding: 12px; }
  .first-spell-options .core-option-top { flex-direction: column; align-items: flex-start; gap: 5px; }
  .first-spell-options .core-option-top small { min-height: 28px; font-size: 10px; line-height: 1.4; }
  .first-spell-options .core-option p { font-size: 11px; line-height: 1.65; margin-bottom: 10px; }
  .first-spell-options .core-select { margin-top: auto; }
  .core-option p { margin: 7px 0 10px; }.core-fusion { padding-top: 10px; }.core-copy { margin: 14px 0 18px; }.core-upgrade { padding-top: 8px; }.core-select { margin-top: 10px; padding-top: 10px; }
}
</style>
