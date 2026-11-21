<script setup>
import SkillIcon from './SkillIcon.vue'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
const props = defineProps({ info: { type: Object, required: true } })
const heading = computed(() => props.info.stage === 'first' ? '选择本局元素专精'
  : props.info.stage === 'evolution' ? '专精主动术进化'
  : props.info.stage === 'boss' ? '强化当前元素构筑'
  : '选择元素专精')
const copy = computed(() => props.info.stage === 'first' ? '选定主修专精后立即替换原质飞弹并激活专属护盾与空格大招；随后主修本系法术，并可兼修至多 2 门他系基础法术。'
  : props.info.stage === 'evolution' ? '主动法术获得新的形态与效果，已学技能与兼修法术全部保留。'
  : props.info.stage === 'boss' ? '选择一项强化当前已掌握专精的法术核心。'
  : '确定主修方向后，本局可专注深化并至多兼修 2 门他系基础法术。')
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
  <div class="spell-core-overlay" @keydown.tab.prevent="trap" @keydown.space.prevent @keydown.enter="$event.repeat && $event.preventDefault()">
    <section ref="panel" class="spell-core-panel" :class="{ 'milestone-panel': info.milestone }" role="dialog" aria-modal="true" aria-labelledby="spell-core-title" aria-describedby="spell-core-copy">
      <div class="core-heading"><SkillIcon skill="spec_elemental" size="inline" /><div><p>{{ info.milestone ? '元素成长' : '法术核心' }} · {{ info.source }}</p><h2 id="spell-core-title">{{ heading }}</h2></div></div>
      <p id="spell-core-copy" class="core-copy">{{ copy }}</p>
      <div class="core-options" :class="{ 'first-spell-options': info.stage === 'first', 'evolution-options': info.stage === 'evolution' }">
        <button v-for="option in info.options" :key="option.id" class="core-option" :style="{ '--core-accent': option.color }" @click="emit('select', option.id)">
          <span class="core-option-top"><SkillIcon :skill="{ ...option, spec: 'elemental' }" /><small>{{ option.label || (info.stage === 'evolution' ? '空格法术进化' : info.first ? '第二元素' : option.kind === 'form' ? '雷系形态替换' : option.kind === 'shape' ? '基础法术改造' : option.kind === 'reaction' ? '融合反应强化' : option.kind === 'active' ? '空格法术进化' : '法术强度') }}</small></span>
          <strong>{{ option.name }}</strong><p>{{ option.desc }}</p>
          <div v-if="option.fusion" class="core-fusion"><b>{{ option.fusion.name }}</b><p>{{ option.fusion.desc }}</p><span>空格 · {{ option.fusion.active }}</span><p>{{ option.preview }}</p></div>
          <span v-if="option.stats" class="core-upgrade">{{ option.stats }}</span><span class="core-select">{{ info.stage === 'first' ? '选定专精' : info.first ? '确定融合' : option.isEvolution ? '进化法术' : '吸收强化' }} <span aria-hidden="true">→</span></span>
        </button>
      </div>
      <p class="core-footer">{{ info.stage === 'first' ? '自动施放主系法术 · 单局至多兼修 2 门他系基础法术' : info.stage === 'boss' ? '首领核心只强化当前构筑' : '纯化四系专精 · 兼修上限 2 门 · 单空格主动术' }} · Tab 切换 · Enter 确认</p>
    </section>
  </div>
</template>

<style scoped>
.spell-core-overlay { position: fixed; inset: 0; z-index: 160; display: grid; place-items: center; padding: 24px; background: var(--adventure-scrim); pointer-events: auto; }
.spell-core-panel { width: min(880px, 100%); max-height: calc(100dvh - 48px); overflow-y: auto; padding: 30px; color: var(--adventure-ink); background: var(--adventure-paper); border: 1px solid var(--adventure-line); border-radius: 12px; box-shadow: var(--adventure-shadow); }
.core-heading { display: flex; align-items: center; gap: 16px; }.core-glyph { font-size: 32px; color: #6a597f; }
.core-heading p { margin: 0 0 7px; color: #6a597f; font-size: 12px; }.core-heading h2 { margin: 0; font-size: 24px; line-height: 1.35; }
.core-copy { color: var(--adventure-muted); font-size: 13px; line-height: 1.7; margin: 18px 0 24px; }
.core-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.first-spell-options { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.evolution-options { grid-template-columns: minmax(0, 1fr); max-width: 520px; margin: 0 auto; }
.core-option { display: flex; flex-direction: column; text-align: left; padding: 20px; border: 1px solid var(--adventure-line); border-radius: 8px; color: var(--adventure-ink); background: #f3f1f6; font: inherit; cursor: pointer; transition: border-color .15s, background .15s; }
.core-option:hover { border-color: color-mix(in srgb, var(--core-accent) 35%, var(--adventure-ink)); background: #edebf3; }.core-option:focus-visible { outline: 2px solid var(--core-accent); outline-offset: 3px; }.core-option:active { background: #e9e5f0; }
.core-option-top { display: flex; align-items: center; gap: 9px; margin-bottom: 17px; color: color-mix(in srgb, var(--core-accent) 35%, var(--adventure-ink)); }.core-option-top :deep(.skill-glyph) { margin: 0; }.core-option-top small { font-size: 11px; }
.core-option > strong { font-size: 18px; line-height: 1.4; }.core-option p { margin: 10px 0 16px; color: var(--adventure-muted); font-size: 12px; line-height: 1.8; }
.core-fusion { padding-top: 14px; border-top: 1px solid var(--adventure-line); }.core-fusion b, .core-fusion span { display: block; }.core-fusion b { color: color-mix(in srgb, var(--core-accent) 35%, var(--adventure-ink)); font-size: 14px; }.core-fusion span { margin-top: 8px; font-size: 12px; }
.core-upgrade { display: block; margin-top: auto; padding-top: 16px; color: #57476e; font-size: 11px; line-height: 1.7; }
.core-select { display: flex; justify-content: space-between; padding-top: 17px; margin-top: 16px; border-top: 1px solid var(--adventure-line); font-size: 12px; font-weight: 600; }
.core-footer { margin: 22px 0 0; color: var(--adventure-muted); font-size: 11px; text-align: center; }
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
