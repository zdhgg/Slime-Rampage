<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Pause, Play, Volume2, VolumeX } from 'lucide-vue-next'
import { createRunnerTouchGesture } from './runnerTouchGesture.js'

const props = defineProps({ hud: { type: Object, required: true }, muted: Boolean, paused: Boolean, controlsDisabled: Boolean })
const emit = defineEmits(['activate-fever', 'toggle-mute', 'toggle-pause', 'toggle-resume', 'change-lane', 'layout-change'])
const hudRoot = ref(null)
const hudTop = ref(null)
const skillDock = ref(null)
const touchControls = ref(false)
const insets = ref({ top: 160, bottom: 100 })
const percent = value => `${Math.max(0, Math.min(100, value * 100))}%`
const feverPercent = computed(() => {
  const fever = props.hud.fever
  if (!fever) return '0%'
  if (fever.active) return percent(fever.timer / fever.duration)
  return fever.charges >= fever.maxCharges ? '100%' : percent(fever.shards / (fever.shardsPerCharge || 3))
})
const canPlay = computed(() => props.hud.state === 'active' && !props.paused && !props.controlsDisabled)
const canFever = computed(() => canPlay.value && props.hud.fever?.charges > 0 && !props.hud.fever.active)
const gesture = createRunnerTouchGesture(direction => {
  if (canPlay.value) emit('change-lane', direction)
})
watch(canPlay, () => gesture.reset())
function beginSwipe(event) {
  if (canPlay.value && gesture.begin(event)) event.currentTarget.setPointerCapture(event.pointerId)
}
let resizeObserver
let touchMedia
function updateTouchControls() {
  touchControls.value = touchMedia.matches
  gesture.reset()
}
function measureHud() {
  if (!hudRoot.value || !hudTop.value || !skillDock.value) return
  const root = hudRoot.value.getBoundingClientRect()
  const top = Math.ceil(hudTop.value.getBoundingClientRect().bottom - root.top)
  const bottom = Math.ceil(root.bottom - skillDock.value.getBoundingClientRect().top)
  if (top === insets.value.top && bottom === insets.value.bottom) return
  insets.value = { top, bottom }
  emit('layout-change', insets.value)
}
onMounted(() => {
  touchMedia = window.matchMedia('(any-pointer: coarse)')
  updateTouchControls()
  touchMedia.addEventListener('change', updateTouchControls)
  window.addEventListener('blur', gesture.reset)
  resizeObserver = new ResizeObserver(measureHud)
  for (const element of [hudRoot.value, hudTop.value, skillDock.value]) resizeObserver.observe(element)
  measureHud()
})
onUnmounted(() => {
  resizeObserver?.disconnect()
  touchMedia?.removeEventListener('change', updateTouchControls)
  window.removeEventListener('blur', gesture.reset)
})
const countdownLabel = computed(() => props.hud.state === 'countdown' ? Math.ceil(props.hud.countdown || 0) || '突破' : '')
const choiceHint = computed(() => props.hud.weaponChoicePending ? '主核心三选一 · 换道选择' : props.hud.secondaryChoicePending ? '元素三选一 · 穿门融合' : props.hud.moduleChoicePending ? '模组三选一 · 换道搭载' : '')
const laneNames = ['左', '中', '右']
const buffs = computed(() => [
  { name: '时空力场', time: props.hud.buffs?.bulletTime },
  { name: '超频冲刺', time: props.hud.buffs?.booster },
  { name: '浮游史莱姆', time: props.hud.buffs?.drone },
].filter(buff => buff.time > 0))
const scoreGain = ref(0)
const scoreReceipt = ref(0)
watch(() => props.hud.score, (next, previous) => {
  if (previous != null && next > previous) { scoreGain.value = next - previous; scoreReceipt.value += 1 }
  else if (next < previous) scoreGain.value = 0
})
// Native Enter/Space activation is preserved; a mouse click returns focus to
// the game so the next Space activates fever. Keyboard users retain visible focus.
function activate(event, action, allowed = true) {
  if (allowed) emit(action)
  if (event.detail > 0) event.currentTarget.blur()
}
</script>

<template>
  <div ref="hudRoot" class="runner-hud" :class="{ 'reduced-motion': hud.reducedMotion, 'touch-controls': touchControls }" :style="{ '--hud-top': `${insets.top}px`, '--hud-bottom': `${insets.bottom}px` }">
    <div v-if="touchControls && canPlay" class="swipe-region" aria-hidden="true"
      @pointerdown="beginSwipe" @pointermove="gesture.move" @pointerup="gesture.end"
      @pointercancel="gesture.reset" @lostpointercapture="gesture.reset" />
    <div ref="hudTop" class="hud-top">
      <section class="vitals hud-surface" aria-label="生命与装备">
        <div class="mode-label">{{ hud.submodeName || '极速突围' }}</div>
        <div class="vital-row"><span>生命</span><div class="hp-cells" aria-hidden="true"><i v-for="index in hud.maxHp" :key="index" :class="{ lost: index > hud.hp }" /></div><b>{{ hud.hp }}<small> / {{ hud.maxHp }}</small></b></div>
        <div class="vital-row shield-row"><span>护盾</span><div class="shield-cells" aria-hidden="true"><i v-for="index in (hud.maxShield || 3)" :key="index" :class="{ lost: index > (hud.shield || 0) }" /></div><b>{{ hud.shield || 0 }}<small> / {{ hud.maxShield || 3 }}</small></b></div>
        <div class="equipment">
          <span v-if="hud.weapon" class="weapon-core" :style="{ '--weapon-color': hud.weapon.color }">{{ hud.weapon.name }} <b>Lv.{{ hud.weapon.level }}</b></span><span v-else>凝胶弹</span>
          <span>攻击 <b>{{ hud.attack }}</b></span><span v-if="hud.rapid > 0" class="rapid-label">急速 {{ Math.ceil(hud.rapid) }}s</span>
        </div>
        <div v-if="buffs.length" class="tactical-buffs" aria-label="临时增益"><span v-for="buff in buffs" :key="buff.name">{{ buff.name }} <b>{{ Math.ceil(buff.time) }}s</b></span></div>
      </section>
      <section class="route hud-surface" aria-label="突围进度与车道">
        <div class="route-head"><span>{{ hud.section }}</span><strong>{{ hud.timeLabel }}</strong><span>{{ hud.isEndless ? '已行驶' : '剩余' }} {{ hud.distance }}m</span></div>
        <div v-if="!hud.isEndless" class="track route-track" aria-hidden="true"><i :style="{ width: percent(hud.progress || 0) }" /></div>
        <div class="lane-cells" aria-label="左中右车道状态">
          <div v-for="lane in (hud.lanes || [])" :key="lane.lane" class="lane-cell" :class="[lane.status, { current: lane.lane === hud.lane }]" :aria-label="`${laneNames[lane.lane]}道：${lane.intent}${lane.lane === hud.lane ? '，当前所在' : ''}`">
            <i aria-hidden="true" /><span>{{ laneNames[lane.lane] }}<b v-if="lane.lane === hud.lane"> · 当前</b></span>
            <em v-if="lane.status === 'danger' || ['冲锋', '瞄准', '封锁'].includes(lane.intent)">{{ lane.intent }}</em>
          </div>
        </div>
        <div v-if="choiceHint" class="choice-guide" role="status">{{ choiceHint }}</div>
        <div v-else-if="hud.weaponNotice && !hud.fusion" class="combat-receipt" role="status">{{ hud.weaponNotice }}</div>
        <div v-if="hud.route" class="route-label"><b :style="{ color: hud.route.color }">{{ hud.route.label }}</b><span>{{ hud.route.riskLabel }} · {{ hud.route.rewardLabel }}</span></div>
      </section>
      <section class="score hud-surface" aria-label="得分与游戏控制">
        <div class="game-controls">
          <button type="button" :aria-label="muted ? '取消静音' : '静音'" :aria-pressed="muted" @click="activate($event, 'toggle-mute')"><VolumeX v-if="muted" :size="18" aria-hidden="true" /><Volume2 v-else :size="18" aria-hidden="true" /></button>
          <button type="button" :disabled="controlsDisabled" :aria-label="paused ? '继续游戏' : '暂停'" @click="activate($event, paused ? 'toggle-resume' : 'toggle-pause')"><Play v-if="paused" :size="18" aria-hidden="true" /><Pause v-else :size="18" aria-hidden="true" /></button>
        </div>
        <div class="score-value"><span>得分</span><strong>{{ (hud.score || 0).toLocaleString('en-US') }}</strong></div>
        <div class="score-feedback"><em v-if="hud.combo > 1">连破 ×{{ hud.combo }}</em><span v-if="scoreGain" :key="scoreReceipt" class="score-gain">+{{ scoreGain }}</span></div>
      </section>
    </div>
    <div ref="skillDock" class="skill-dock">
      <span v-if="touchControls" class="touch-hint">左右滑动换道 · 自动射击</span>
      <button v-if="hud.fever" type="button" class="skill-module fever-module" :class="{ ready: canFever, active: hud.fever.active }" :disabled="!canFever" @click="activate($event, 'activate-fever', canFever)" :aria-label="hud.fever.active ? `暴走中，剩余 ${Math.ceil(hud.fever.timer)}秒` : `空格 暴走，可用 ${hud.fever.charges} 次`">
        <span class="skill-head"><kbd v-if="!touchControls">Space</kbd><span>暴走</span><b>{{ hud.fever.active ? `${Math.ceil(hud.fever.timer)}s` : `可用 ${hud.fever.charges} 次` }}</b></span>
        <span class="track" aria-hidden="true"><i :style="{ width: feverPercent }" /></span>
        <span class="skill-detail">
          <template v-if="hud.fever.active">暴走中 · 得分 ×2<span>储备 {{ hud.fever.charges }} 次</span></template>
          <template v-else-if="hud.fever.charges >= hud.fever.maxCharges">充能已满<span>{{ touchControls ? '轻触释放' : '按空格释放' }}</span></template>
          <template v-else>下次充能 {{ hud.fever.shards }}/{{ hud.fever.shardsPerCharge || 3 }}<span>{{ canFever ? touchControls ? '轻触释放' : '按空格释放' : '收集印记' }}</span></template>
        </span>
      </button>
    </div>
    <Transition name="notice"><div v-if="countdownLabel" :key="countdownLabel" class="countdown-mark" role="status">{{ countdownLabel }}</div></Transition>
    <Transition name="notice">
      <div v-if="hud.fusion" :key="`${hud.fusion.id}-${hud.fusion.level}`" class="event-notice fusion-banner" :style="{ '--notice-color': hud.fusion.color }" role="status"><span>{{ hud.fusion.kicker }}</span><strong>{{ hud.fusion.title }}</strong><em>{{ hud.fusion.description }}</em></div>
      <div v-else-if="hud.state === 'active' && hud.sectionNotice > 0 && !choiceHint && !hud.weaponNotice" :key="hud.section" class="event-notice" role="status"><span>阶段 {{ (hud.sectionIndex || 0) + 1 }}</span><strong>{{ hud.section }}</strong></div>
    </Transition>
  </div>
</template>

<style scoped>
.runner-hud { --surface: rgba(8,17,25,.91); --muted: #b1c3cd; position: absolute; inset: 0; z-index: 6; overflow: hidden; color: #eff6f5; font: 14px/1.35 "Segoe UI","PingFang SC",sans-serif; font-variant-numeric: tabular-nums; pointer-events: none; }
.runner-hud * { box-sizing: border-box; }
.swipe-region { position: absolute; left: 0; right: 0; top: var(--hud-top); bottom: var(--hud-bottom); pointer-events: auto; touch-action: none; user-select: none; }
.hud-top, .skill-dock { z-index: 1; }
.hud-top { position: relative; }
.touch-hint { grid-column: 1 / -1; justify-self: center; color: #bfd0d6; font-size: 12px; text-shadow: 0 1px 4px #071019; }
.touch-controls .game-controls button { min-width: 44px; min-height: 44px; }
.hud-top { display: grid; grid-template-columns: minmax(210px,250px) minmax(260px,480px) minmax(160px,190px); justify-content: space-between; align-items: start; gap: 20px; padding: 18px 22px; }
.hud-surface { min-width: 0; padding: 12px 14px; border-radius: 8px; background: var(--surface); border-top: 1px solid #33444c; }
.mode-label { margin-bottom: 8px; color: var(--muted); font-size: 12px; }
.vital-row { display: flex; align-items: center; gap: 8px; margin-top: 5px; }
.vital-row > span { flex-shrink: 0; white-space: nowrap; font-size: 14px; }
.vital-row > b { margin-left: auto; white-space: nowrap; }
small { color: var(--muted); font-size: 12px; font-weight: 400; }
.hp-cells,.shield-cells { display: flex; gap: 4px; flex: 1; min-width: 0; }
.hp-cells i { flex: 1; max-width: 23px; height: 8px; border-radius: 2px; background: #91e866; }
.shield-cells i { flex: 1; max-width: 21px; height: 5px; border-radius: 1px; background: #7cddd7; }
.hp-cells .lost,.shield-cells .lost { background: #304049; }
.shield-row { color: #a4dfdc; }
.equipment { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 10px; padding-top: 8px; border-top: 1px solid #293a43; color: var(--muted); font-size: 12px; }
.equipment b { color: #eff6f5; font-weight: 600; }
.weapon-core { width: 100%; border-left: 2px solid var(--weapon-color); padding-left: 6px; }
.weapon-core b { float: right; }
.rapid-label { color: #d2b5f4; }
.route-head { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; }
.route-head > span { color: var(--muted); font-size: 12px; }
.route-head > span:last-child { text-align: right; }
.route-head strong { font-size: 22px; font-weight: 700; }
.track { display: block; overflow: hidden; height: 4px; border-radius: 2px; background: #2a3a43; }
.track i { display: block; height: 100%; background: var(--skill-color,#91e866); transition: width .12s linear; }
.route-track { margin-top: 8px; height: 3px; }
.lane-cells { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; margin-top: 12px; }
.lane-cell { display: flex; align-items: center; gap: 5px; color: var(--muted); font-size: 12px; white-space: nowrap; }
.lane-cell > i { width: 5px; height: 5px; border-radius: 50%; background: #6d838f; flex-shrink: 0; }
.lane-cell.current { color: #eef6f5; }
.lane-cell.current > i { background: #99e4d7; }
.lane-cell b { font-weight: 500; }
.lane-cell.warning > i { background: #e6b766; border-radius: 1px; }
.lane-cell.danger > i { background: #ff7a70; border-radius: 0; transform: rotate(45deg); }
.lane-cell em { margin-left: auto; color: #ff9a87; font-size: 12px; font-style: normal; }
.route-label { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px; margin-top: 8px; color: var(--muted); font-size: 12px; }
.route-label b { font-weight: 500; }
.choice-guide, .combat-receipt { margin-top: 8px; padding-top: 6px; border-top: 1px solid #31464e; color: #d2e8de; font-size: 12px; text-align: center; overflow-wrap: anywhere; }
.combat-receipt { color: #e9d79c; }
.score { text-align: right; }
.game-controls { display: flex; justify-content: flex-end; gap: 6px; margin-bottom: 6px; }
button { font: inherit; color: inherit; pointer-events: auto; cursor: pointer; touch-action: manipulation; }
.game-controls button { display: grid; place-items: center; width: 36px; height: 32px; border: 1px solid #41535f; border-radius: 5px; background: #172832; }
button:focus-visible { outline: 2px solid #e7fff9; outline-offset: 3px; }
button:disabled { cursor: default; }
.game-controls button:hover:not(:disabled) { background: #2c414d; }
.score-value > span { color: var(--muted); font-size: 12px; margin-right: 8px; }
.score-value strong { font-size: 24px; font-weight: 750; }
.score-feedback { display: flex; justify-content: flex-end; gap: 8px; min-height: 18px; font-size: 12px; }
.score-feedback em { font-style: normal; color: #8cddeb; }
.score-gain { color: #f2d586; animation: receipt 1.1s ease forwards; }
@keyframes receipt { 0%,65% { opacity: 1; } 100% { opacity: 0; } }
.skill-dock { position: absolute; left: 50%; bottom: max(14px,env(safe-area-inset-bottom)); transform: translateX(-50%); display: grid; grid-template-columns: 1fr 1.18fr; gap: 10px; width: min(520px,calc(100% - 28px)); }
.skill-module { --skill-color: #91ded5; display: grid; gap: 9px; padding: 10px 14px; min-width: 0; border: 1px solid #3d505b; border-radius: 8px; background: var(--surface); text-align: left; }
.skill-module.ready { border-color: #80c4ba; }
.skill-module:hover:not(:disabled) { background: #1b303b; }
.skill-module:active:not(:disabled) { background: #243e48; }
.skill-head { display: flex; align-items: center; gap: 8px; font-size: 15px; white-space: nowrap; }
.skill-head b { margin-left: auto; color: var(--skill-color); font-size: 15px; font-weight: 700; }
kbd { min-width: 24px; padding: 1px 5px; border: 1px solid #596a73; border-bottom-width: 2px; border-radius: 4px; color: #edf5f5; font: 12px/1.4 "Segoe UI",sans-serif; text-align: center; }
.skill-detail { display: flex; justify-content: space-between; gap: 6px; color: var(--muted); font-size: 12px; white-space: nowrap; }
.fever-module { --skill-color: #f2cd79; }
.fever-module.ready { border-color: #c4a260; }
.fever-module.active { border-color: #eb9d65; --skill-color: #ffc083; }
.tactical-buffs { display: flex; flex-wrap: wrap; gap: 4px 8px; margin-top: 6px; }
.tactical-buffs > span { color: #c8e7e0; font-size: 12px; }
.tactical-buffs b { color: #fff; }
.countdown-mark { position: absolute; left: 50%; top: 36%; transform: translate(-50%,-50%); color: #ffeba5; font-size: clamp(48px,8vh,72px); font-weight: 850; text-shadow: 0 3px 12px #061018; }
.event-notice { position: absolute; top: calc(var(--hud-top) + 8px); left: 50%; transform: translateX(-50%); display: grid; gap: 3px; max-width: calc(100% - 32px); padding: 10px 18px; border-left: 2px solid var(--notice-color,#91e866); border-radius: 4px; background: var(--surface); text-align: center; }
.event-notice span,.event-notice em { color: var(--muted); font-size: 12px; font-style: normal; }
.event-notice strong { font-size: 18px; }
.fusion-banner strong { color: var(--notice-color); font-size: 24px; }
.notice-enter-active,.notice-leave-active { transition: opacity .16s ease; }
.notice-enter-from,.notice-leave-to { opacity: 0; }
@media (max-width: 960px) {
  .hud-top { grid-template-columns: 210px minmax(230px,1fr) 160px; padding: 12px; gap: 10px; }
  .hud-surface { padding: 10px; }
  .lane-cells { gap: 6px; }
  .lane-cell { flex-wrap: wrap; row-gap: 2px; }
  .lane-cell em { width: 100%; margin-left: 10px; }
}
@media (max-width: 700px) {
  .hud-top { grid-template-columns: minmax(0,1fr) 132px; gap: 8px; padding: 10px; }
  .vitals { grid-column: 1; grid-row: 1; }
  .score { grid-column: 2; grid-row: 1; align-self: stretch; }
  .route { grid-column: 1 / -1; grid-row: 2; }
  .mode-label { display: none; }
  .equipment { margin-top: 6px; padding-top: 5px; }
  .route-head strong { font-size: 18px; }
  .route-label { display: none; }
  .lane-cells { margin-top: 7px; }
  .lane-cell { flex-wrap: nowrap; }
  .lane-cell em { width: auto; margin-left: auto; }
  .score-value strong { font-size: 20px; }
  .score-value > span { display: block; margin-right: 0; }
  .skill-dock { gap: 8px; width: calc(100% - 20px); bottom: max(10px,env(safe-area-inset-bottom)); }
  .skill-module { padding: 10px; gap: 8px; }
  .skill-head { flex-wrap: wrap; gap: 5px; }
  .skill-head b { font-size: 14px; }
  .skill-detail { flex-wrap: wrap; }
  .skill-detail > span { display: none; }
  .event-notice { width: max-content; }
}
@media (max-height: 520px) and (min-aspect-ratio: 4/3) {
  .hud-top { padding: 8px 12px; grid-template-columns: minmax(152px, 190px) minmax(190px, 1fr) 124px; gap: 8px; }
  .vitals, .route, .score { grid-row: 1; align-self: start; }
  .vitals { grid-column: 1; }
  .route { grid-column: 2; }
  .score { grid-column: 3; }
  .hud-surface { padding: 8px 10px; }
  .mode-label,.route-label { display: none; }
  .equipment { margin-top: 5px; padding-top: 4px; }
  .weapon-core { width: auto; }
  .weapon-core b { margin-left: 6px; float: none; }
  .skill-module { gap: 6px; padding: 8px 12px; }
  .skill-dock { bottom: 8px; }
  .score-value > span { display: none; }
  .score-value strong { font-size: 20px; }
  .skill-detail { display: none; }
  .touch-controls .game-controls button { min-width: 44px; min-height: 44px; }
  .event-notice { padding: 6px 12px; }
}
.reduced-motion *,.reduced-motion *::before,.reduced-motion *::after { animation: none !important; transition: none !important; }
.reduced-motion .score-gain { display: none; }
@media (prefers-reduced-motion: reduce) {
  .runner-hud *,.runner-hud *::before,.runner-hud *::after { animation: none !important; transition: none !important; }
  .score-gain { display: none; }
}
</style>
