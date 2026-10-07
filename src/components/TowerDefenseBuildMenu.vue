<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Coins, Leaf, LockKeyhole, X } from 'lucide-vue-next'
import TowerDefensePortrait from './TowerDefensePortrait.vue'
import { getBuildMenuPosition } from './towerDefenseBuildMenuLayout.js'

const props = defineProps({
  slot: { type: Object, required: true },
  choices: { type: Array, required: true },
  money: { type: Number, required: true },
})
const emit = defineEmits(['select', 'preview', 'close'])
const surface = ref(null)
const panel = ref(null)
const viewport = ref({ width: 1280, height: 720 })
const panelSize = ref({ width: 336, height: 360 })
const measured = ref(false)
const hovered = ref(null)
const focused = ref(null)
const available = computed(() => props.choices.filter(tower => tower.unlocked !== false && !tower.locked))
const locked = computed(() => props.choices.filter(tower => tower.unlocked === false || tower.locked))
const previewId = computed(() => hovered.value || focused.value)
const preview = computed(() => available.value.find(tower => tower.id === previewId.value))
const roles = {
  spore: '腐蚀削甲 · 抑制再生', thorn: '缠绕拦截 · 有限控场', ballista: '直线贯穿 · 近身盲区', beacon: '侦测隐匿 · 弱点标记',
  rapid: '高速喷射 · 单体', slow: '寒霜减速 · 控场', blast: '熔岩爆炸 · 群攻',
  shock: '连锁闪电 · 打断', arcane: '引力黑洞 · 真伤', radiant: '圣光光环 · 辅助',
}
const position = computed(() => getBuildMenuPosition(props.slot.anchor, viewport.value, panelSize.value))
const panelStyle = computed(() => ({
  left: `${position.value.left}px`, top: `${position.value.top}px`,
  maxHeight: `${position.value.maxHeight}px`,
  '--arrow-x': `${position.value.arrowX}px`, '--arrow-y': `${position.value.arrowY}px`,
  visibility: measured.value ? 'visible' : 'hidden',
}))
const previewDescription = computed(() => {
  const resonance = preview.value?.resonance
  if (!resonance?.isResonant) return ''
  const buff = resonance.buff || {}
  const labels = {
    rangeMultiplier: '射程', speedMultiplier: '攻速', damageMultiplier: '伤害',
    splashRadiusMultiplier: '爆炸范围', slowDurationMultiplier: '减速时长',
  }
  const parts = Object.entries(labels).filter(([key]) => buff[key])
    .map(([key, label]) => `${label} +${Math.round((buff[key] - 1) * 100)}%`)
  if (buff.slowRatioBonus) parts.push(`减速强度 +${Math.round(buff.slowRatioBonus * 100)}%`)
  return parts.join(' · ')
})

function unavailable(tower) {
  return tower.disabled || tower.affordable === false || tower.cost > props.money
}

function select(tower) {
  if (!unavailable(tower)) emit('select', tower.id)
}

function measure() {
  if (!surface.value || !panel.value) return
  viewport.value = { width: surface.value.clientWidth, height: surface.value.clientHeight }
  panelSize.value = { width: panel.value.offsetWidth, height: panel.value.firstElementChild.scrollHeight + 2 }
  measured.value = true
}

watch(previewId, value => emit('preview', value || null))
watch(() => props.slot.index, () => { hovered.value = null; focused.value = null })
let observer
onMounted(() => {
  measure()
  observer = new ResizeObserver(measure)
  observer.observe(surface.value)
  observer.observe(panel.value)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  emit('preview', null)
})
</script>

<template>
  <div ref="surface" class="build-menu-surface">
    <section
      ref="panel" class="build-menu" :class="`opens-${position.side}`" :style="panelStyle"
      aria-label="召唤史莱姆守卫" @keydown.esc.stop="emit('close')"
    >
      <div class="build-menu-content">
        <header class="build-heading">
          <h2>召唤守卫 <span>#{{ slot.index + 1 }}</span></h2>
          <div class="build-heading-actions">
            <span class="build-budget" aria-label="可用养分"><Coins :size="13" />{{ money }}</span>
            <button type="button" class="build-close" aria-label="关闭召唤菜单" title="关闭 · Esc" @click="emit('close')"><X :size="16" /></button>
          </div>
        </header>

        <div v-if="slot.leyline?.leylineName" class="build-terrain">
          <Leaf :size="13" :style="{ color: slot.leyline.color }" />
          <span>{{ slot.leyline.leylineName }}</span><small>契合守卫获得加成</small>
        </div>

        <div class="build-choices">
          <button
            v-for="tower in available" :key="tower.id" type="button" class="build-choice"
            :class="{ 'is-previewed': previewId === tower.id, 'is-unavailable': unavailable(tower), 'is-resonant': tower.resonance?.isResonant }"
            :style="{ '--element': tower.color }" :data-tower="tower.id"
            :aria-disabled="!!unavailable(tower)"
            :aria-label="`${tower.name}，${roles[tower.id]}，${tower.cost} 养分${tower.resonance?.isResonant ? '，地形契合' : ''}${tower.cost > money ? `，还差 ${tower.cost - money} 养分` : ''}`"
            @pointerenter="event => { if (event.pointerType !== 'touch') hovered = tower.id }"
            @pointerleave="hovered = null" @focus="focused = tower.id" @blur="focused = null"
            @click="select(tower)"
          >
            <div class="build-choice-visual">
              <TowerDefensePortrait :type="tower.id" />
              <span v-if="tower.resonance?.isResonant" class="build-affinity"><Leaf :size="10" />契合</span>
              <b class="build-price"><Coins :size="12" />{{ tower.cost }}</b>
            </div>
            <strong>{{ tower.name }}</strong>
            <span class="build-role">{{ roles[tower.id] }}</span>
            <span v-if="tower.cost > money" class="build-shortfall">还差 {{ tower.cost - money }} 养分</span>
            <span v-else-if="unavailable(tower)" class="build-shortfall">暂不可召唤</span>
          </button>
        </div>

        <div class="build-preview-hint" :class="{ 'has-affinity': previewDescription }" aria-live="polite">
          <template v-if="previewDescription"><Leaf :size="13" /><span>{{ previewDescription }}</span></template>
          <template v-else><span><span class="hover-hint">悬停预览射程 · </span>点击立即召唤</span><kbd>Esc 关闭</kbd></template>
        </div>

        <div v-if="locked.length" class="build-locked" aria-label="待解锁守卫">
          <LockKeyhole :size="12" />
          <span v-for="tower in locked" :key="tower.id">{{ tower.name.replace('史莱姆', '') }}<small>第 {{ tower.unlockStage }} 关</small></span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.build-menu-surface { position: absolute; inset: 0; pointer-events: none; z-index: 7; text-shadow: none; }
.build-menu { position: absolute; box-sizing: border-box; width: min(336px, calc(100% - 24px)); border: 1px solid #41544b; border-radius: 12px; color: #eaf2ec; background: #12211c; box-shadow: 0 8px 28px #030b0870, 0 1px 3px #030b0870; pointer-events: auto; }
.build-menu::before { content: ''; position: absolute; width: 10px; height: 10px; background: #12211c; border: solid #41544b; border-width: 0 0 1px 1px; transform: rotate(45deg); pointer-events: none; }
.opens-right::before { left: -6px; top: calc(var(--arrow-y) - 5px); }
.opens-left::before { right: -6px; top: calc(var(--arrow-y) - 5px); transform: rotate(225deg); }
.opens-below::before { top: -6px; left: calc(var(--arrow-x) - 5px); transform: rotate(135deg); }
.opens-above::before { bottom: -6px; left: calc(var(--arrow-x) - 5px); transform: rotate(-45deg); }
.build-menu-content { box-sizing: border-box; max-height: inherit; padding: 14px; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #476053 transparent; border-radius: inherit; }
.build-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.build-heading h2 { margin: 0; color: #f0f5ef; font-size: 16px; font-weight: 700; line-height: 1.4; }
.build-heading h2 span { margin-left: 4px; color: #80988a; font-size: 11px; font-weight: 500; }
.build-heading-actions { display: flex; align-items: center; gap: 12px; }
.build-budget, .build-price { display: inline-flex; align-items: center; gap: 4px; color: #edcf83; font-size: 13px; font-variant-numeric: tabular-nums; }
.build-close { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 1px solid transparent; border-radius: 6px; background: transparent; color: #a4b6ab; cursor: pointer; }
.build-close:hover { background: #ffffff0c; color: white; }
.build-terrain { display: flex; align-items: center; gap: 6px; padding: 8px 0; margin: -4px 0 8px; border-top: 1px solid #ffffff0c; color: #c4d3c9; font-size: 11px; }
.build-terrain small { margin-left: auto; color: #8da495; font-size: 10px; }
.build-choices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.build-choice { position: relative; min-width: 0; padding: 8px 10px 10px; border: 1px solid #ffffff13; border-radius: 8px; color: #ebf2ec; background: #1b2c24; text-align: left; font: inherit; cursor: pointer; transition: background 120ms ease, border-color 120ms ease; }
.build-choice-visual { display: flex; align-items: center; justify-content: space-between; min-height: 56px; margin: -2px -4px 4px; }
.build-choice strong { display: block; font-size: 13px; line-height: 1.4; font-weight: 650; }
.build-role { display: block; margin-top: 3px; color: #a1b6a8; font-size: 10px; line-height: 1.5; white-space: nowrap; }
.build-price { align-self: flex-end; margin: 0 4px 6px 0; font-size: 12px; }
.build-affinity { position: absolute; right: 8px; top: 8px; display: inline-flex; align-items: center; gap: 3px; color: #b6dfbd; font-size: 9px; }
.build-choice.is-resonant { border-color: #73ac7f66; }
.build-choice.is-previewed { border-color: var(--element, #9acda8); background: #253c30; }
.build-choice:active:not(.is-unavailable) { background: #304b3c; }
.build-choice:focus-visible, .build-close:focus-visible { outline: 2px solid #d8efc4; outline-offset: 3px; }
.build-choice.is-unavailable { background: #17251f; cursor: not-allowed; }
.is-unavailable .guardian-portrait { opacity: 0.55; }
.is-unavailable strong, .is-unavailable .build-price { color: #9caaa1; }
.build-shortfall { display: block; margin-top: 4px; color: #e6b69b; font-size: 10px; }
.build-preview-hint { display: flex; align-items: center; justify-content: space-between; gap: 7px; box-sizing: border-box; min-height: 42px; padding: 8px 0 0; color: #a4b7a9; font-size: 10px; line-height: 1.6; }
.build-preview-hint.has-affinity { justify-content: flex-start; color: #c2e4c5; }
.build-preview-hint svg { flex: none; }
.build-preview-hint kbd { color: #8da193; font: inherit; white-space: nowrap; }
.build-locked { display: flex; flex-wrap: wrap; align-items: center; gap: 7px 12px; margin-top: 4px; padding-top: 10px; border-top: 1px solid #ffffff0c; color: #99aca0; font-size: 10px; }
.build-locked > span { display: inline-flex; gap: 5px; }
.build-locked small { color: #879b8d; font-size: 10px; }
@media (max-width: 620px) {
  .build-menu-content { padding: 12px; }
  .build-heading { margin-bottom: 9px; }
  .build-choice { padding: 6px 9px 8px; }
  .build-preview-hint kbd { display: none; }
}
@media (hover: none) { .hover-hint { display: none; } }
@media (prefers-reduced-motion: reduce) { .build-choice { transition: none; } }
</style>
