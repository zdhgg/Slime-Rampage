<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import SkillIcon from './SkillIcon.vue'
import LevelUpModal from './LevelUpModal.vue'
import { useCardFocus } from './useCardFocus.js'
const props = defineProps({ info: { type: Object, required: true } })
const emit = defineEmits(['select'])
const panel = ref(null)
const supply = computed(() => props.info.phase === 'supply')
const ordinary = computed(() => ['study', 'compensation'].includes(props.info.phase))
const cards = computed(() => supply.value ? props.info.rewards.filter(card => !card.disabled) : props.info.options || [])
let readyAt = 0, previousFocus
function choose(card) {
  if (!card || card.disabled || performance.now() < readyAt) return
  readyAt = performance.now() + 180
  emit('select', card.id)
}
const { selectedCard } = useCardFocus(cards, choose, () => !ordinary.value)
const hasMemory = computed(() => (props.info.options || []).some(card => card.isOriginMemory))
const title = computed(() => supply.value ? '选择章间整备' : props.info.phase === 'study' ? '基因研习' : props.info.phase === 'compensation' ? '秘典满级补偿' : hasMemory.value ? '首领源质 · 吸收与重构' : '选择 BOSS 秘典')
const icons = { rest: '✚', tome: '▣', blood: '◆' }
watch(() => props.info.phase, async () => { readyAt = performance.now() + 180; await nextTick(); panel.value?.focus({ preventScroll: true }) })
onMounted(() => { previousFocus = document.activeElement; panel.value?.focus({ preventScroll: true }) })
onBeforeUnmount(() => { if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }) })
function trap(event) {
  const buttons = [...panel.value.querySelectorAll('button:not(:disabled)')]
  if (!buttons.length) return
  const current = buttons.indexOf(document.activeElement)
  buttons[(current + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus()
}
</script>
<template>
  <div class="reward-overlay" @keydown.tab.prevent="trap">
    <section ref="panel" class="reward-panel" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="reward-title">
      <header class="reward-heading">
        <div>
          <p class="reward-kicker">{{ info.chapter ? `第 ${info.stage} 章 · ${info.stageTitle} 完成` : '首领战利品' }}</p>
          <h2 id="reward-title">{{ title }}</h2>
          <p class="reward-source">{{ supply ? `下一章 · ${info.nextTitle} / ${info.nextRegion}` : ordinary ? (info.phase === 'study' ? '选择普通强化，完成后进入下一章' : '秘典已满级，获得一次普通技能选择') : `已击败 ${info.source} · 选择一项专属成长` }}</p>
        </div>
        <ol v-if="info.chapter" class="reward-steps" aria-label="通关结算步骤"><li :class="{ current: !info.summary }">01 秘典</li><li :class="{ current: !!info.summary }">02 整备</li></ol>
      </header>
      <p v-if="info.summary" class="reward-summary" role="status"><span>已获得</span>{{ info.summary }}</p>
      <LevelUpModal v-if="ordinary" embedded :key="info.phase" :options="info.options" :level="info.level" :role-spec="info.roleSpec" :can-use-elements="info.canUseElements" :reward-title="info.phase === 'study' ? '选择一项普通强化' : '秘典已满级 · 选择一项普通强化'" @select="choose" />
      <div v-else-if="supply" class="reward-options supply-options">
        <button v-for="(reward, index) in info.rewards" :key="reward.id" :disabled="reward.disabled" :class="[reward.id, { selected: selectedCard?.id === reward.id }]" @click="choose(reward)">
          <div class="card-top"><span class="supply-icon" aria-hidden="true">{{ icons[reward.id] }}</span><kbd>{{ index + 1 }}</kbd></div>
          <h3>{{ reward.name }}</h3><p>{{ reward.description }}</p><strong class="card-stats">{{ reward.preview }}</strong>
          <span class="card-action">{{ reward.disabled ? '无法选择' : reward.id === 'tome' ? '查看技能选择 →' : '确认整备，进入下一章 →' }}</span>
        </button>
      </div>
      <div v-else class="reward-options tome-options">
        <button v-for="(card, index) in info.options" :key="card.id" :class="{ selected: selectedCard?.id === card.id, 'is-memory': card.isOriginMemory }" :style="{ '--tome-color': card.color }" @click="choose(card)">
          <div class="card-top"><span class="card-kind">{{ card.isOriginMemory ? '源质记忆' : card.level ? '升级秘典' : '新秘典' }}</span><kbd>{{ index + 1 }}</kbd></div>
          <SkillIcon :skill="card" /><h3>{{ card.name }}</h3>
          <p v-if="card.isOriginMemory" class="card-source">来源：{{ card.sourceBoss }}</p>
          <p>{{ card.desc }}</p>
          <p v-if="card.trigger" class="card-trigger">{{ card.trigger }}</p>
          <div class="tome-ranks" :aria-label="`选择后等级 ${card.level + 1}，最高3级`"><i v-for="rank in 3" :key="rank" :class="{ owned: rank <= card.level, next: rank === card.level + 1 }" /></div>
          <strong class="card-stats">{{ card.stats }}</strong><span class="card-action">{{ card.level ? `Lv.${card.level} → Lv.${card.level + 1}` : '获得 Lv.1' }}<span>选择 →</span></span>
        </button>
      </div>
      <p class="reward-footer">{{ ordinary ? '本次选择不增加玩家等级' : supply ? '整备完成后进入下一章' : '最高 Lv.3 · 每次随机三选一 · 不占用普通升级次数' }}<span v-if="!ordinary">方向键切换 · Enter 确认 · 数字键直选</span></p>
    </section>
  </div>
</template>
<style scoped>
.reward-overlay { position: absolute; inset: 0; z-index: 140; display: grid; place-items: center; padding: 24px; background: rgb(4 9 7 / .82); backdrop-filter: blur(4px); }
.reward-panel { box-sizing: border-box; width: min(940px, 100%); max-height: calc(100dvh - 48px); overflow-y: auto; padding: 30px; border: 1px solid #39483d; border-radius: 12px; color: #edf4e8; background: #101813; box-shadow: 0 20px 70px rgb(0 0 0 / .35); outline: none; }
.reward-heading { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-bottom: 24px; }.reward-kicker { margin: 0 0 9px; color: #d6bd7d; font-size: 12px; font-weight: 600; }h2 { margin: 0; font-size: 27px; letter-spacing: -.5px; }
.reward-source { margin: 10px 0 0; color: #a2afa3; font-size: 13px; line-height: 1.6; }.reward-steps { display: flex; flex-shrink: 0; gap: 20px; margin: 0; padding: 0; list-style: none; font-size: 12px; color: #768477; }.reward-steps .current { color: #d4e9a8; }
.reward-summary { display: flex; flex-wrap: wrap; gap: 12px; margin: 0 0 22px; padding: 13px 15px; border-left: 2px solid #b7d88a; color: #d4e6c4; background: #1a271c; font-size: 13px; line-height: 1.6; }.reward-summary span { color: #94a68c; }
.reward-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }.reward-options button { --tome-color: #b9d99c; display: flex; flex-direction: column; align-items: flex-start; min-width: 0; padding: 20px; border: 1px solid #3b473f; border-radius: 8px; color: #edf4e8; background: #1a231d; font: inherit; text-align: left; cursor: pointer; transition: border-color 140ms, background 140ms; }
.reward-options button:hover, .reward-options button.selected { border-color: var(--tome-color); background: #202c24; }.reward-options button:focus-visible { outline: 2px solid #d4e9a8; outline-offset: 3px; }.reward-options button:active { background: #29382b; }.reward-options button:disabled { cursor: default; color: #9ca69c; border-color: #333c35; background: #171e19; }.reward-options button:disabled .card-stats, .reward-options button:disabled .card-action { color: #9ca69c; }
.card-top { display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 15px; }.card-kind { color: var(--tome-color); font-size: 11px; }kbd { color: #a4afa4; background: #101813; padding: 3px 6px; border: 1px solid #445046; border-radius: 3px; font: inherit; font-size: 10px; }h3 { margin: 5px 0 10px; font-size: 19px; }.reward-options p { margin: 0 0 18px; color: #afbbaf; font-size: 12px; line-height: 1.8; }
.tome-ranks { display: flex; gap: 5px; margin-bottom: 15px; }.tome-ranks i { width: 22px; height: 4px; border-radius: 1px; background: #485049; }.tome-ranks .owned { background: var(--tome-color); }.tome-ranks .next { background: #e1cf91; }.card-stats { margin-top: auto; color: #d6e6b9; font-size: 12px; line-height: 1.9; font-weight: 500; }.card-action { display: flex; justify-content: space-between; box-sizing: border-box; width: 100%; margin-top: 18px; padding-top: 14px; border-top: 1px solid #3a473c; color: #c5d1bd; font-size: 11px; }
.supply-icon { font-size: 27px; color: #b7d88a; }.blood .supply-icon { color: #ed9e92; }.supply-options button { min-height: 220px; }
/* 源质记忆卡：沿用秘典排版，用左侧同色竖条 + 来源/触发说明做出独立身份 */
.tome-options button.is-memory { border-color: color-mix(in srgb, var(--tome-color) 62%, #3b473f); background: linear-gradient(180deg, color-mix(in srgb, var(--tome-color) 10%, #1a231d), #1a231d 62%); box-shadow: inset 3px 0 0 var(--tome-color); }
.tome-options button.is-memory .card-kind { color: var(--tome-color); font-weight: 700; letter-spacing: 0.6px; }
.reward-options p.card-source { margin: 0 0 8px; color: color-mix(in srgb, var(--tome-color) 70%, #afbbaf); font-size: 11px; letter-spacing: 0.4px; }
.reward-options p.card-trigger { margin: 0 0 14px; padding: 6px 9px; border-left: 2px solid color-mix(in srgb, var(--tome-color) 55%, transparent); color: #cfe0cf; font-size: 11px; line-height: 1.6; background: rgb(255 255 255 / .03); }
.reward-footer { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 9px; margin: 22px 0 0; color: #8e9e8f; font-size: 11px; line-height: 1.6; }.reward-footer span { color: #98a699; }
@media (max-width: 650px) {
  .reward-overlay { padding: 12px; }.reward-panel { padding: 20px 16px; max-height: calc(100dvh - 24px); }.reward-heading { align-items: flex-start; flex-direction: column; gap: 14px; margin-bottom: 20px; }h2 { font-size: 23px; }.reward-steps { gap: 24px; }.reward-options { grid-template-columns: 1fr; gap: 10px; }.reward-options button { padding: 16px; }.card-top { margin-bottom: 8px; }
  .tome-options button { display: grid; grid-template-columns: 58px 1fr; column-gap: 13px; }.tome-options .card-top, .tome-options .card-stats, .tome-options .card-action { grid-column: 1 / -1; }.tome-options :deep(.skill-glyph) { grid-row: 2 / 4; align-self: start; margin: 4px 0; }.tome-options h3 { font-size: 17px; }.tome-options p { margin-bottom: 10px; }.tome-ranks { grid-column: 2; margin-bottom: 12px; }.supply-options button { min-height: 170px; }.reward-footer span { display: none; }
}
</style>
