<script setup>
import { computed } from 'vue'
import { ArrowRight, ArrowUp, Check, ChevronDown, Coins, Dna, MoveUpRight, Trash2, X, Zap } from 'lucide-vue-next'
import TowerDefensePortrait from './TowerDefensePortrait.vue'

const props = defineProps({
  tower: { type: Object, required: true },
  money: { type: Number, default: 0 },
  introductory: { type: Boolean, default: false },
  leapSlots: { type: Array, default: () => [] },
})
const emit = defineEmits(['upgrade', 'sell', 'close', 'branch', 'relocate', 'strategy'])
const roles = {
  rapid: '强酸喷射 · 极速破甲', slow: '急冻冰霜 · 范围减速', blast: '熔岩爆浆 · 重装范围',
  shock: '连环闪电 · 麻痹打断', arcane: '引力黑洞 · 真实伤害', radiant: '圣堂光环 · 攻速激励',
}
const type = computed(() => props.tower.typeId || props.tower.type || props.tower.id)
const level = computed(() => props.tower.level ?? props.tower.lv ?? 1)
const maxLevel = computed(() => props.tower.maxLevel ?? props.tower.maxLv ?? 4)
const isMaxLevel = computed(() => level.value >= maxLevel.value)
const cost = computed(() => props.tower.upgradeCost ?? 0)
const shortfall = computed(() => Math.max(0, cost.value - props.money))
const branches = computed(() => options(props.tower.branchOptions))
const branchId = computed(() => optionId(props.tower.branch))
const needsBranch = computed(() => level.value === 2 && branches.value.length > 0 && !branchId.value)
const activeBranch = computed(() => branches.value.find(branch => optionId(branch) === branchId.value) || props.tower.branch)
const canUpgrade = computed(() => !isMaxLevel.value && !needsBranch.value && !shortfall.value && props.tower.canUpgrade !== false)
const preview = computed(() => !isMaxLevel.value && !needsBranch.value ? props.tower.upgradePreview : null)
const upgradeHint = computed(() => {
  if (isMaxLevel.value) return ''
  if (needsBranch.value) return '先选择专精方向，再升级至 Lv.3'
  if (shortfall.value) return `还差 ${shortfall.value} 养分`
  if (!canUpgrade.value) return '当前暂不可升级'
  return ''
})
const stats = computed(() => {
  const tower = props.tower
  const interval = Number(tower.fireInterval)
  return [
    { key: 'dps', label: 'DPS', value: tower.dps ?? (interval > 0 ? tower.damage / interval : null), digits: 0 },
    { key: 'attackSpeed', label: '攻速 / 秒', value: tower.attackSpeed ?? (interval > 0 ? 1 / interval : null), digits: 1 },
  ].filter(stat => stat.value != null)
})

function options(value) { return Array.isArray(value) ? value : Object.values(value || {}) }
function optionId(value) { return typeof value === 'object' ? value?.id || value?.key || value?.value || '' : value || '' }
function optionLabel(value) { return typeof value === 'object' ? value?.name || value?.label || value?.title || value?.id : value }
function description(value) { return value?.description || value?.effectText || value?.effect || value?.desc || '' }
function format(value, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: digits })
}
</script>

<template>
  <section class="upgrade-panel" :style="{ '--element': tower.color || '#75d5ac' }" aria-label="史莱姆升级" @keydown.esc.stop="emit('close')">
    <header class="guardian-heading">
      <div class="guardian-avatar">
        <TowerDefensePortrait :type="type" :level="level" :branch-id="level >= 3 ? branchId : ''" />
      </div>
      <div class="guardian-identity">
        <div class="guardian-title"><h2>{{ tower.name || '史莱姆守卫' }}</h2><span class="slot-number">#{{ tower.slotIndex + 1 }}</span></div>
        <p>{{ roles[type] || '史莱姆守卫' }}</p>
        <div class="guardian-level" :aria-label="`等级 ${level} / ${maxLevel}`">
          <b>Lv.{{ level }}</b>
          <span v-if="isMaxLevel" class="max-label">{{ maxLevel < 4 ? '本关满级' : '满级' }}</span>
        </div>
      </div>
      <button type="button" class="panel-close" aria-label="取消选中" title="取消选中 · Esc" @click="emit('close')"><X :size="16" /></button>
    </header>

    <div class="panel-content">
      <div v-if="tower.shinyTrait || tower.resonance?.isResonant" class="guardian-traits">
        <div v-if="tower.shinyTrait" class="trait-line" :style="{ color: tower.shinyTrait.color }">
          <span aria-hidden="true">{{ tower.shinyTrait.icon || '✦' }}</span>
          <p><strong>{{ tower.shinyTrait.name }}</strong><span>{{ tower.shinyTrait.description }}</span></p>
        </div>
        <details v-if="tower.resonance?.isResonant" class="resonance-detail">
          <summary><Zap :size="14" aria-hidden="true" /><strong>{{ tower.resonance.leylineName }} · 共鸣</strong><ChevronDown :size="12" aria-hidden="true" /></summary>
          <p>{{ tower.resonance.description }}</p>
        </details>
      </div>

      <section class="combat-section" aria-label="战斗属性">
        <dl class="combat-stats">
          <div v-for="stat in stats" :key="stat.key" :class="{ 'primary-stat': stat.key === 'dps' }">
            <dt>{{ stat.label }}</dt>
            <dd>{{ format(stat.value, stat.digits) }}<span v-if="preview" class="stat-preview" :class="{ improved: preview[stat.key] > stat.value }" :aria-label="`升级后 ${format(preview[stat.key], stat.digits)}`"><ArrowRight :size="12" />{{ format(preview[stat.key], stat.digits) }}</span></dd>
          </div>
        </dl>
        <p v-if="tower.effectText" class="combat-effect">{{ tower.effectText }}</p>
        <p v-if="preview?.effectText && preview.effectText !== tower.effectText" class="next-effect"><ArrowRight :size="12" /><span>升级后：{{ preview.effectText }}</span></p>
      </section>

      <section v-if="level >= 2 && branches.length" class="gene-section" aria-label="建筑专精">
        <div class="section-heading"><h3><Dna :size="14" />{{ level === 2 ? '选择专精方向' : '建筑专精' }}</h3><span>{{ level === 2 ? 'Lv.3 生效' : '已生效' }}</span></div>
        <div v-if="level === 2" class="gene-options">
          <button v-for="branch in branches" :key="optionId(branch)" type="button" class="gene-option" :class="{ selected: optionId(branch) === branchId }" :aria-pressed="optionId(branch) === branchId" @click="emit('branch', optionId(branch))">
            <span class="gene-name"><strong>{{ optionLabel(branch) }}</strong><Check v-if="optionId(branch) === branchId" :size="13" /><i v-else class="gene-choice-dot" /></span>
            <span class="gene-description">{{ description(branch) }}</span>
          </button>
        </div>
        <div v-else-if="activeBranch" class="active-gene"><Check :size="14" /><div><strong>{{ optionLabel(activeBranch) }}</strong><p>{{ description(activeBranch) }}</p></div></div>
      </section>

      <label v-if="tower.targetStrategies?.length" class="target-strategy">
        <span>索敌优先</span>
        <select :value="tower.targetStrategy?.id" @change="emit('strategy', $event.target.value)">
          <option v-for="strategy in tower.targetStrategies" :key="strategy.id" :value="strategy.id">{{ strategy.name }}</option>
        </select>
      </label>

    </div>

    <footer class="panel-footer">
      <div v-if="upgradeHint" class="upgrade-caption" :class="{ 'needs-resource': shortfall > 0 && !needsBranch }">
        <span>{{ upgradeHint }}</span>
      </div>
      <button v-if="!isMaxLevel" type="button" class="upgrade-button" :disabled="!canUpgrade" @click="emit('upgrade')"><ArrowUp :size="16" /><span>升级至 Lv.{{ level + 1 }}</span><b><Coins :size="13" />{{ cost }}</b></button>
      <div class="guardian-actions">
        <details v-if="tower.relocationUnlocked && leapSlots.length" class="relocate-control">
          <summary><MoveUpRight :size="14" /><span>弹跳换位</span><small v-if="tower.relocateCooldown > 0">{{ tower.relocateCooldown }}s</small><ChevronDown :size="12" /></summary>
          <div class="relocate-options">
            <span>{{ tower.canRelocate ? '选择目标守卫点' : `换位冷却中 · ${tower.relocateCooldown || 0}s` }}</span>
            <div><button v-for="slot in leapSlots" :key="slot.slotIndex" type="button" :disabled="!tower.canRelocate" :aria-label="`弹跳至守卫点 ${slot.slotIndex + 1}`" @click="emit('relocate', { from: tower.slotIndex, to: slot.slotIndex })">#{{ slot.slotIndex + 1 }}</button></div>
          </div>
        </details>
        <button type="button" class="sell-button" :disabled="tower.canSell === false" :title="`放生，返还 ${tower.sellValue ?? tower.refund ?? 0} 养分`" @click="emit('sell')"><Trash2 :size="13" /><span>放生</span><small>+{{ tower.sellValue ?? tower.refund ?? 0 }}</small></button>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.upgrade-panel {
  --panel-text: #edf4ef;
  --panel-muted: #9aada4;
  box-sizing: border-box; display: flex; flex-direction: column; width: 320px; max-width: 100%; max-height: calc(100dvh - 116px);
  overflow: hidden; border: 1px solid #3b5148; border-radius: 12px;
  background: #101d18; color: var(--panel-text); text-shadow: none;
  box-shadow: 0 10px 32px #0005, 0 1px 0 #ffffff08 inset; font-size: 12px; line-height: 1.45;
  pointer-events: auto; color-scheme: dark;
}
.upgrade-panel *, .upgrade-panel *::before, .upgrade-panel *::after { box-sizing: border-box; }
.upgrade-panel button { font: inherit; }
.upgrade-panel button { cursor: pointer; transition: background-color 120ms, border-color 120ms, color 120ms; }
.upgrade-panel button:disabled { cursor: not-allowed; }
.upgrade-panel :is(button, summary):focus-visible { outline: 2px solid #b6e5c8; outline-offset: 3px; }
.upgrade-panel button:active:not(:disabled) { transform: translateY(1px); }
.upgrade-panel svg { flex-shrink: 0; }
.guardian-heading { display: flex; align-items: center; gap: 10px; padding: 12px; border-bottom: 1px solid #ffffff0d; flex-shrink: 0; }
.guardian-avatar { display: grid; place-items: center; width: 48px; height: 48px; flex-shrink: 0; border-radius: 9px; background: #ffffff05; }
.guardian-avatar :deep(canvas) { width: 56px; height: 44px; }
.guardian-identity { min-width: 0; flex: 1; }
.guardian-title { display: flex; align-items: center; gap: 8px; }
.guardian-title h2 { margin: 0; color: var(--panel-text); font-size: 16px; font-weight: 700; }
.slot-number { color: #849a8f; font-size: 11px; }
.guardian-identity p { margin: 3px 0 6px; color: var(--panel-muted); font-size: 11px; }
.guardian-level { display: flex; align-items: center; gap: 8px; font-variant-numeric: tabular-nums; }
.guardian-level b { color: var(--element); font-size: 12px; }
.max-label { color: var(--panel-muted); font-size: 10px; }
.panel-close { display: grid; place-items: center; align-self: flex-start; width: 28px; height: 28px; margin: -3px -4px 0 0; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--panel-muted); }
.panel-close:hover { background: #ffffff0e; color: white; }
.panel-content { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 14px; scrollbar-width: thin; scrollbar-color: #435a4e transparent; }
.guardian-traits { display: grid; gap: 8px; padding: 10px 0 0; }
.trait-line { display: flex; align-items: flex-start; gap: 7px; font-size: 11px; }
.trait-line > svg, .trait-line > span { margin-top: 2px; }
.trait-line p { display: flex; flex-wrap: wrap; gap: 1px 7px; margin: 0; }
.trait-line strong { font-size: 11px; font-weight: 600; }
.trait-line p > span { color: var(--panel-muted); }
.resonance-detail { color: #a6d2a8; font-size: 11px; }
.resonance-detail summary { display: flex; align-items: center; gap: 7px; min-height: 24px; cursor: pointer; list-style: none; }
.resonance-detail summary::-webkit-details-marker { display: none; }
.resonance-detail summary strong { font-weight: 600; }
.resonance-detail[open] summary > svg:last-child { transform: rotate(180deg); }
.resonance-detail p { margin: 4px 0; color: var(--panel-muted); }
.combat-section { padding: 12px 0; }
.section-heading { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
.section-heading h3 { display: flex; align-items: center; gap: 5px; margin: 0; color: #becdc5; font-size: 11px; font-weight: 600; }
.section-heading > span { color: #8da396; font-size: 10px; }
.combat-stats { display: grid; grid-template-columns: 1fr 1fr; margin: 0; }
.combat-stats > div { min-width: 0; padding-left: 12px; border-left: 1px solid #ffffff0c; }
.combat-stats > div:first-child { padding-left: 0; border-left: 0; }
.combat-stats dt { color: var(--panel-muted); font-size: 10px; }
.combat-stats dd { display: flex; align-items: center; gap: 8px; margin: 3px 0 0; color: var(--panel-text); font-size: 18px; line-height: 1.2; font-weight: 600; font-variant-numeric: tabular-nums; }
.combat-stats .primary-stat dd { color: #a2e5c4; }
.stat-preview { display: flex; align-items: center; gap: 4px; margin-top: 0; color: #8da396; font-size: 11px; font-weight: 400; line-height: 1.45; font-variant-numeric: tabular-nums; }
.stat-preview.improved { color: #a2e5c4; }
.combat-effect, .next-effect { margin: 9px 0 0; color: var(--panel-muted); font-size: 11px; line-height: 1.5; overflow-wrap: anywhere; }
.next-effect { display: flex; align-items: baseline; gap: 5px; margin-top: 3px; color: #abd3bb; }
.gene-section { padding: 12px 0; }
.target-strategy { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 0; color: var(--panel-muted); font-size: 11px; }
.target-strategy select { min-height: 32px; max-width: 170px; padding: 4px 8px; border: 1px solid #425d4c; border-radius: 6px; background: #17251f; color: var(--panel-text); font: inherit; }
.gene-options { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
.gene-option { padding: 9px; border: 1px solid #ffffff16; border-radius: 7px; background: #ffffff03; color: #c0cec5; text-align: left; }
.gene-option:hover { background: #ffffff09; border-color: #76947e; }
.gene-option.selected { background: #97cba312; border-color: #91b99a; color: #d0eacb; }
.gene-name { display: flex; align-items: center; justify-content: space-between; gap: 5px; }
.gene-name strong { font-size: 12px; font-weight: 600; }
.gene-choice-dot { width: 11px; height: 11px; border: 1px solid #637c6b; border-radius: 50%; flex-shrink: 0; }
.gene-description { display: block; margin-top: 5px; color: #a2b5a9; font-size: 11px; line-height: 1.6; overflow-wrap: anywhere; }
.active-gene { display: flex; align-items: flex-start; gap: 7px; padding: 0 0 2px; color: #c8debb; }
.active-gene > svg { margin-top: 2px; }
.active-gene strong { font-size: 12px; font-weight: 600; }
.active-gene p { margin: 3px 0 0; color: var(--panel-muted); font-size: 11px; line-height: 1.5; }
.relocate-control { flex: 1; min-width: 0; }
.relocate-control summary { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 32px; padding: 5px 9px; border: 1px solid #ffffff12; border-radius: 6px; color: #b5c6bb; font-size: 11px; cursor: pointer; list-style: none; }
.relocate-control summary:hover { background: #ffffff09; border-color: #ffffff25; }
.relocate-control summary::-webkit-details-marker { display: none; }
.relocate-control summary small { color: #a4b5aa; font-variant-numeric: tabular-nums; }
.relocate-control[open] summary > svg:last-child { transform: rotate(180deg); }
.relocate-options { max-height: 116px; overflow-y: auto; padding: 8px 0 0; color: var(--panel-muted); font-size: 10px; }
.relocate-options > div { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.relocate-options button { min-width: 34px; min-height: 30px; padding: 3px 6px; border: 1px solid #425d4c; border-radius: 4px; background: #1c3025; color: #c4dbca; }
.relocate-options button:hover:not(:disabled) { background: #2b4736; }
.relocate-options button:disabled { color: #86958b; background: #ffffff03; border-color: #ffffff0e; }
.panel-footer { flex-shrink: 0; margin-top: 2px; padding: 10px 14px; border-top: 1px solid #ffffff0f; background: #0d1914; }
.upgrade-caption { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; color: var(--panel-muted); font-size: 10px; }
.upgrade-caption.needs-resource > span:first-child { color: #e4c087; }
.guardian-actions { display: flex; align-items: flex-start; gap: 10px; }
.upgrade-button { display: flex; width: 100%; margin-bottom: 8px; align-items: center; justify-content: center; gap: 6px; min-height: 40px; padding: 0 10px; border: 1px solid #a6dab1; border-radius: 7px; background: #a6dab1; color: #14281c; font-weight: 700 !important; }
.upgrade-button b { display: flex; align-items: center; gap: 4px; margin-left: auto; padding-left: 8px; font-size: 12px; font-variant-numeric: tabular-nums; }
.upgrade-button:hover:not(:disabled) { background: #bdeac6; border-color: #bdeac6; }
.upgrade-button:disabled { border-color: #394d40; background: #293d30; color: #a1b6a5; }
.sell-button { display: flex; margin-left: auto; flex-shrink: 0; align-items: center; justify-content: center; column-gap: 4px; row-gap: 0; min-height: 32px; padding: 3px 4px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: #aaafa6; font-size: 11px !important; }
.sell-button small { color: #a6bba6; font-size: 10px; line-height: 1.1; font-variant-numeric: tabular-nums; }
.sell-button:hover:not(:disabled) { color: #edb1a1; border-color: #c1806c55; background: #c1806c0c; }
.sell-button:disabled { opacity: .5; }
@media (max-width: 620px) {
  .upgrade-panel { width: 100%; max-height: min(64dvh, calc(100dvh - 105px)); }
  .guardian-heading { padding: 11px 14px; }
  .panel-close { width: 32px; height: 32px; }
  .relocate-control summary { min-height: 36px; }
  .panel-footer { padding-bottom: max(12px, env(safe-area-inset-bottom)); }
}
@media (max-height: 500px) and (min-width: 621px) {
  .upgrade-panel { max-height: calc(100dvh - 84px); }
  .guardian-heading { gap: 8px; padding: 8px 12px; }
  .guardian-avatar { width: 44px; height: 44px; }
  .guardian-avatar :deep(canvas) { width: 54px; height: 42px; }
  .guardian-identity p { display: none; }
  .guardian-level { margin-top: 3px; }
  .panel-footer { padding: 8px 12px; }
}
@media (prefers-reduced-motion: reduce) {
  .upgrade-panel button { transition: none; }
  .upgrade-panel button:active:not(:disabled) { transform: none; }
}
</style>
