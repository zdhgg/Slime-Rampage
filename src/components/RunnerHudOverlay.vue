<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { BookOpen, Pause, Play, Sparkles, Volume2, VolumeX, X } from 'lucide-vue-next'
import { createRunnerTouchGesture } from './runnerTouchGesture.js'

const props = defineProps({ hud: { type: Object, required: true }, muted: Boolean, paused: Boolean, controlsDisabled: Boolean })
const emit = defineEmits(['activate-fever', 'toggle-mute', 'toggle-pause', 'toggle-resume', 'change-lane', 'layout-change', 'jump'])
const hudRoot = ref(null)
const hudTop = ref(null)
const skillDock = ref(null)
const touchControls = ref(false)
const showCodex = ref(false)
const insets = ref({ top: 160, bottom: 100 })

const percent = value => `${Math.max(0, Math.min(100, (value || 0) * 100))}%`
const feverPercent = computed(() => {
  const fever = props.hud.fever
  if (!fever) return '0%'
  if (fever.active) return percent(fever.timer / fever.duration)
  return fever.charges >= fever.maxCharges ? '100%' : percent(fever.shards / (fever.shardsPerCharge || 3))
})
const canPlay = computed(() => props.hud.state === 'active' && !props.paused && !props.controlsDisabled)
const canFever = computed(() => canPlay.value && props.hud.fever?.charges > 0 && !props.hud.fever.active)
const gesture = createRunnerTouchGesture(action => {
  if (!canPlay.value) return
  if (action === 'jump') emit('jump')
  else emit('change-lane', action)
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

function handleKeyDown(event) {
  if (event.key === 'Tab' || event.key.toLowerCase() === 'c') {
    event.preventDefault()
    showCodex.value = !showCodex.value
  } else if (event.key === 'Escape' && showCodex.value) {
    showCodex.value = false
  }
}

onMounted(() => {
  touchMedia = window.matchMedia('(any-pointer: coarse)')
  updateTouchControls()
  touchMedia.addEventListener('change', updateTouchControls)
  window.addEventListener('blur', gesture.reset)
  window.addEventListener('keydown', handleKeyDown)
  resizeObserver = new ResizeObserver(measureHud)
  for (const element of [hudRoot.value, hudTop.value, skillDock.value]) resizeObserver.observe(element)
  measureHud()
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  touchMedia?.removeEventListener('change', updateTouchControls)
  window.removeEventListener('blur', gesture.reset)
  window.removeEventListener('keydown', handleKeyDown)
})

const countdownLabel = computed(() => props.hud.state === 'countdown' ? Math.ceil(props.hud.countdown || 0) || '突破' : '')
const choiceHint = computed(() => props.hud.weaponChoicePending ? '💎 核心三选一 · 换道选择主武器' : props.hud.secondaryChoicePending ? '🧪 元素三选一 · 穿门激活超武融合' : props.hud.moduleChoicePending ? '⑂ 模组三选一 · 换道搭载战术模组' : '')
const laneNames = ['左', '中', '右']
const buffs = computed(() => [
  { name: '时空力场', time: props.hud.buffs?.bulletTime, icon: '⏳' },
  { name: '超频冲刺', time: props.hud.buffs?.booster, icon: '🚀' },
  { name: '浮游史莱姆', time: props.hud.buffs?.drone, icon: '🤖' },
].filter(buff => buff.time > 0))

const scoreGain = ref(0)
const scoreReceipt = ref(0)
watch(() => props.hud.score, (next, previous) => {
  if (previous != null && next > previous) { scoreGain.value = next - previous; scoreReceipt.value += 1 }
  else if (next < previous) scoreGain.value = 0
})

function activate(event, action, allowed = true) {
  if (allowed) emit(action)
  if (event.detail > 0) event.currentTarget.blur()
}

const slots = computed(() => props.hud.slots || {
  core: { equipped: false, name: '凝胶弹', level: 0, nextTime: 10 },
  element: { equipped: false, nextTime: 25 },
  fusion: { active: false },
  module: { equipped: false, nextTime: 34 },
})

const codexList = computed(() => props.hud.fusionCodex || [])
const currentCoreId = computed(() => slots.value.core?.id)
</script>

<template>
  <div ref="hudRoot" class="runner-hud" :class="{ 'reduced-motion': hud.reducedMotion, 'touch-controls': touchControls }" :style="{ '--hud-top': `${insets.top}px`, '--hud-bottom': `${insets.bottom}px` }">
    <div v-if="touchControls && canPlay" class="swipe-region" aria-hidden="true"
      @pointerdown="beginSwipe" @pointermove="gesture.move" @pointerup="gesture.end"
      @pointercancel="gesture.reset" @lostpointercapture="gesture.reset" />

    <!-- 顶部 HUD 区域 -->
    <div ref="hudTop" class="hud-top">
      <!-- 左侧：战备构筑与生命装备 -->
      <section class="vitals hud-surface" aria-label="生命与构筑槽位">
        <div class="deck-header">
          <span class="mode-badge">{{ hud.submodeName || '极速突围' }}</span>
          <button type="button" class="codex-btn" :class="{ active: showCodex }" @click="showCodex = !showCodex" aria-label="查看超武图谱">
            <BookOpen :size="13" aria-hidden="true" />
            <span>超武图谱</span>
            <kbd v-if="!touchControls">Tab</kbd>
          </button>
        </div>

        <div class="vital-row">
          <span>生命</span>
          <div class="hp-cells" aria-hidden="true">
            <i v-for="index in hud.maxHp" :key="index" :class="{ lost: index > hud.hp }" />
          </div>
          <b>{{ hud.hp }}<small> / {{ hud.maxHp }}</small></b>
        </div>
        <div class="vital-row shield-row">
          <span>护盾</span>
          <div class="shield-cells" aria-hidden="true">
            <i v-for="index in (hud.maxShield || 3)" :key="index" :class="{ lost: index > (hud.shield || 0) }" />
          </div>
          <b>{{ hud.shield || 0 }}<small> / {{ hud.maxShield || 3 }}</small></b>
        </div>

        <!-- 三槽插槽式构筑展示 -->
        <div class="build-deck">
          <!-- 融合超武高亮标牌 -->
          <div v-if="slots.fusion?.active" class="fusion-badge" :style="{ '--glow': slots.fusion.color }">
            <Sparkles :size="14" class="spark-icon" />
            <div class="fusion-info">
              <strong>{{ slots.fusion.name }}</strong>
              <small>{{ slots.fusion.description }}</small>
            </div>
          </div>

          <!-- 三插槽并列 -->
          <div class="slots-grid">
            <!-- 槽位 1：主核心 -->
            <div class="build-slot core-slot" :class="{ equipped: slots.core?.equipped }" :style="{ '--slot-color': slots.core?.color || '#79d5e6' }">
              <span class="slot-tag">核心</span>
              <template v-if="slots.core?.equipped">
                <span class="slot-name">{{ slots.core.shortName || slots.core.name }}</span>
                <b class="slot-lv">Lv.{{ slots.core.level }}</b>
              </template>
              <template v-else>
                <span class="slot-empty">⏳ {{ slots.core?.nextTime }}s</span>
              </template>
            </div>

            <!-- 槽位 2：元素附魔 -->
            <div class="build-slot elem-slot" :class="{ equipped: slots.element?.equipped }" :style="{ '--slot-color': slots.element?.color || '#ffd859' }">
              <span class="slot-tag">元素</span>
              <template v-if="slots.element?.equipped">
                <span class="slot-icon">{{ slots.element.icon }}</span>
                <span class="slot-name">{{ slots.element.shortName || slots.element.name }}</span>
              </template>
              <template v-else>
                <span class="slot-empty">⏳ {{ slots.element?.nextTime }}s</span>
              </template>
            </div>

            <!-- 槽位 3：战术模组 -->
            <div class="build-slot mod-slot" :class="{ equipped: slots.module?.equipped }" :style="{ '--slot-color': slots.module?.color || '#7ce0c3' }">
              <span class="slot-tag">模组</span>
              <template v-if="slots.module?.equipped">
                <span class="slot-icon">{{ slots.module.icon }}</span>
                <span class="slot-name">{{ slots.module.shortLabel || slots.module.name }}</span>
              </template>
              <template v-else>
                <span class="slot-empty">⏳ {{ slots.module?.nextTime }}s</span>
              </template>
            </div>
          </div>
        </div>

        <!-- 临时战术 Buff -->
        <div v-if="buffs.length" class="tactical-buffs" aria-label="临时增益">
          <span v-for="buff in buffs" :key="buff.name">
            <i>{{ buff.icon }}</i> {{ buff.name }} <b>{{ Math.ceil(buff.time) }}s</b>
          </span>
        </div>
      </section>

      <!-- 中央：突围战役看板与战术目标 -->
      <section class="route hud-surface" aria-label="突围战役看板">
        <div class="campaign-header">
          <span class="campaign-stage">阶段 {{ (hud.sectionIndex || 0) + 1 }}/{{ hud.totalSections || 3 }} · {{ hud.section }}</span>
          <span class="distance-badge">{{ hud.isEndless ? '已狂飙' : '剩余' }} <b>{{ hud.distance }}m</b></span>
        </div>

        <div class="countdown-row">
          <strong class="timer-display">{{ hud.timeLabel }}</strong>
        </div>

        <!-- 双层进度条：全局进度与当前阶段进度 -->
        <div v-if="!hud.isEndless" class="track-wrapper">
          <div class="track route-track" title="总突围进度" aria-hidden="true">
            <i class="total-fill" :style="{ width: percent(hud.progress || 0) }" />
          </div>
        </div>

        <!-- 动态战术行动口号与指令 -->
        <div class="tactical-banner" role="status">
          <span class="objective-text">{{ hud.tacticalObjective || choiceHint || '向前突进，轰碎一切拦截！' }}</span>
        </div>

        <!-- 全息战术车道雷达 -->
        <div class="lane-cells" aria-label="左中右车道状态">
          <div v-for="lane in (hud.lanes || [])" :key="lane.lane" class="lane-cell" :class="[lane.status, { current: lane.lane === hud.lane }]" :aria-label="`${laneNames[lane.lane]}道：${lane.intent}${lane.lane === hud.lane ? '，当前所在' : ''}`">
            <span class="radar-dot" aria-hidden="true" />
            <span class="lane-title">{{ laneNames[lane.lane] }}<b v-if="lane.lane === hud.lane">·当前</b></span>
            <em v-if="lane.status === 'danger' || ['冲锋', '瞄准', '封锁'].includes(lane.intent)">{{ lane.intent }}</em>
          </div>
        </div>

        <div v-if="hud.route" class="route-label">
          <b :style="{ color: hud.route.color }">路线: {{ hud.route.label }}</b>
          <span>{{ hud.route.riskLabel }} · {{ hud.route.rewardLabel }}</span>
        </div>
      </section>

      <!-- 右侧：得分与控制 -->
      <section class="score hud-surface" aria-label="得分与游戏控制">
        <div class="game-controls">
          <button type="button" :aria-label="muted ? '取消静音' : '静音'" :aria-pressed="muted" @click="activate($event, 'toggle-mute')">
            <VolumeX v-if="muted" :size="18" aria-hidden="true" />
            <Volume2 v-else :size="18" aria-hidden="true" />
          </button>
          <button type="button" :disabled="controlsDisabled" :aria-label="paused ? '继续游戏' : '暂停'" @click="activate($event, paused ? 'toggle-resume' : 'toggle-pause')">
            <Play v-if="paused" :size="18" aria-hidden="true" />
            <Pause v-else :size="18" aria-hidden="true" />
          </button>
        </div>
        <div class="score-value">
          <span class="score-label">SCORE</span>
          <strong>{{ (hud.score || 0).toLocaleString('en-US') }}</strong>
        </div>
        <div class="score-feedback">
          <em v-if="hud.combo > 1" class="combo-pulse">COMBO ×{{ hud.combo }}</em>
          <span v-if="scoreGain" :key="scoreReceipt" class="score-gain">+{{ scoreGain }}</span>
        </div>
      </section>
    </div>

    <!-- 底部：暴走超杀坞与操作提示 -->
    <div ref="skillDock" class="skill-dock">
      <span v-if="touchControls" class="touch-hint">左右滑动换道 · 向上轻扫或按 W 跳跃避障 · 自动射击</span>
      <div class="dock-actions">
        <button type="button" class="jump-btn" :disabled="!canPlay" @click="emit('jump')" aria-label="立体弹跳避障">
          <kbd v-if="!touchControls">W</kbd>
          <span>🦘 弹跳避障</span>
        </button>
        <button v-if="hud.fever" type="button" class="skill-module fever-module" :class="{ ready: canFever, active: hud.fever.active }" :disabled="!canFever" @click="activate($event, 'activate-fever', canFever)" :aria-label="hud.fever.active ? `暴走中，剩余 ${Math.ceil(hud.fever.timer)}秒` : `空格 暴走，可用 ${hud.fever.charges} 次`">
        <span class="fever-shimmer" aria-hidden="true" />
        <span class="skill-head">
          <kbd v-if="!touchControls">Space</kbd>
          <span class="skill-title">⚡ 毁灭暴走</span>
          <b class="fever-status">{{ hud.fever.active ? `${Math.ceil(hud.fever.timer)}s` : `可用 ${hud.fever.charges} 次` }}</b>
        </span>
        <span class="track fever-track" aria-hidden="true">
          <i :style="{ width: feverPercent }" />
        </span>
        <span class="skill-detail">
          <template v-if="hud.fever.active">
            <span class="glow-tag">🔥 暴走中 · 得分 ×2 · 三线齐射</span>
            <span>储备 {{ hud.fever.charges }} 次</span>
          </template>
          <template v-else-if="hud.fever.charges >= hud.fever.maxCharges">
            <span class="ready-tag">💥 充能已满！</span>
            <span class="trigger-prompt">{{ touchControls ? '轻触释放' : '按空格释放' }}</span>
          </template>
          <template v-else>
            <span>下次充能 {{ hud.fever.shards }}/{{ hud.fever.shardsPerCharge || 3 }} 印记</span>
            <span class="prompt-hint">{{ canFever ? (touchControls ? '轻触释放' : '按空格释放') : '撞击印记充能' }}</span>
          </template>
        </span>
      </button>
      </div>
    </div>

    <!-- 倒计时大号浮标 -->
    <Transition name="notice">
      <div v-if="countdownLabel" :key="countdownLabel" class="countdown-mark" role="status">
        {{ countdownLabel }}
      </div>
    </Transition>

    <!-- 阶段/超武融合全屏横幅 -->
    <Transition name="notice">
      <div v-if="hud.fusion" :key="`${hud.fusion.id}-${hud.fusion.level}`" class="event-notice fusion-banner" :style="{ '--notice-color': hud.fusion.color }" role="status">
        <span>{{ hud.fusion.kicker || '超武融合觉醒' }}</span>
        <strong>{{ hud.fusion.title }}</strong>
        <em>{{ hud.fusion.description }}</em>
      </div>
      <div v-else-if="hud.state === 'active' && hud.sectionNotice > 0 && !choiceHint && !hud.weaponNotice" :key="hud.section" class="event-notice" role="status">
        <span>阶段 {{ (hud.sectionIndex || 0) + 1 }}</span>
        <strong>{{ hud.section }}</strong>
      </div>
    </Transition>

    <!-- 超武演化图谱弹窗 (Fusion Codex Modal) -->
    <div v-if="showCodex" class="codex-backdrop" @click.self="showCodex = false" role="dialog" aria-modal="true" aria-label="超武演化矩阵图谱">
      <div class="codex-window">
        <header class="codex-header">
          <div class="codex-title">
            <Sparkles :size="20" class="codex-icon" />
            <div>
              <h3>超武演化矩阵图谱</h3>
              <p>主武器核心 + 元素附魔 = 9 种终极融合形态</p>
            </div>
          </div>
          <button type="button" class="codex-close" @click="showCodex = false" aria-label="关闭图谱">
            <X :size="18" />
          </button>
        </header>

        <div class="codex-body">
          <div class="codex-grid">
            <div v-for="item in codexList" :key="item.key" class="codex-card" :class="{ highlighted: item.primaryId === currentCoreId }">
              <div class="codex-card-head">
                <span class="card-formula">
                  <b :style="{ color: item.primaryColor }">{{ item.primaryName }}</b>
                  <i>+</i>
                  <b :style="{ color: item.secondaryColor }">{{ item.secondaryIcon }} {{ item.secondaryName }}</b>
                </span>
                <span v-if="item.primaryId === currentCoreId" class="match-badge">当前核心路线</span>
              </div>
              <div class="codex-fusion-name" :style="{ color: item.color }">
                {{ item.name }}
              </div>
              <div class="codex-fusion-desc">
                {{ item.description }}
              </div>
            </div>
          </div>
        </div>

        <footer class="codex-footer">
          <span>提示：在赛道上穿过对应发光龙门架即可完成觉醒！按 <kbd>Tab</kbd> 或 <kbd>C</kbd> 可快速切换此图谱</span>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.runner-hud {
  --surface: rgba(8, 17, 25, 0.92);
  --surface-border: rgba(65, 88, 105, 0.45);
  --muted: #a0b6c4;
  --accent-cyan: #79d5e6;
  --accent-gold: #f2cd79;
  --accent-rose: #ff7a70;
  position: absolute;
  inset: 0;
  z-index: 6;
  overflow: hidden;
  color: #eff6f5;
  font: 14px/1.35 "Segoe UI", "PingFang SC", sans-serif;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}
.runner-hud * { box-sizing: border-box; }
.swipe-region { position: absolute; left: 0; right: 0; top: var(--hud-top); bottom: var(--hud-bottom); pointer-events: auto; touch-action: none; user-select: none; }
.hud-top, .skill-dock { z-index: 1; }
.hud-top { position: relative; display: grid; grid-template-columns: minmax(240px, 310px) minmax(320px, 560px) minmax(160px, 200px); justify-content: space-between; align-items: start; gap: 16px; padding: 14px 20px; }
.hud-surface { min-width: 0; padding: 12px 14px; border-radius: 10px; background: var(--surface); border: 1px solid var(--surface-border); backdrop-filter: blur(12px); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45); }

/* 左侧：装备区与插槽 */
.deck-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.mode-badge { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #8ec3d6; font-weight: 600; background: rgba(121, 213, 230, 0.12); padding: 2px 7px; border-radius: 4px; border: 1px solid rgba(121, 213, 230, 0.25); }
.codex-btn { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; border-radius: 5px; background: rgba(242, 205, 121, 0.12); border: 1px solid rgba(242, 205, 121, 0.3); color: #f2cd79; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.15s ease; }
.codex-btn:hover { background: rgba(242, 205, 121, 0.22); border-color: #f2cd79; }
.codex-btn kbd { margin-left: 2px; padding: 0 4px; font-size: 10px; background: rgba(0,0,0,0.3); border: 1px solid rgba(242, 205, 121, 0.4); border-radius: 3px; }

.vital-row { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.vital-row > span { flex-shrink: 0; font-size: 13px; color: var(--muted); }
.vital-row > b { margin-left: auto; font-size: 13px; }
small { color: var(--muted); font-size: 11px; font-weight: 400; }
.hp-cells, .shield-cells { display: flex; gap: 4px; flex: 1; min-width: 0; }
.hp-cells i { flex: 1; max-width: 24px; height: 7px; border-radius: 2px; background: #91e866; box-shadow: 0 0 6px rgba(145, 232, 102, 0.45); }
.shield-cells i { flex: 1; max-width: 22px; height: 5px; border-radius: 2px; background: #7cddd7; box-shadow: 0 0 5px rgba(124, 221, 215, 0.4); }
.hp-cells .lost, .shield-cells .lost { background: #26353d; box-shadow: none; }
.shield-row { color: #a4dfdc; }

/* 构筑插槽 */
.build-deck { margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.08); }
.fusion-badge { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding: 6px 10px; border-radius: 6px; background: linear-gradient(90deg, rgba(242, 205, 121, 0.18), rgba(121, 213, 230, 0.1)); border: 1px solid var(--glow, #f2cd79); box-shadow: 0 0 12px rgba(242, 205, 121, 0.25); }
.spark-icon { color: #f2cd79; animation: pulse-spark 1.8s infinite ease-in-out; }
@keyframes pulse-spark { 0%, 100% { transform: scale(1); filter: drop-shadow(0 0 2px #f2cd79); } 50% { transform: scale(1.2); filter: drop-shadow(0 0 6px #fff); } }
.fusion-info strong { display: block; font-size: 13px; color: #ffeb99; }
.fusion-info small { display: block; font-size: 10px; color: #cbe3e7; line-height: 1.2; }

.slots-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.build-slot { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 5px 4px; border-radius: 6px; background: rgba(18, 30, 40, 0.65); border: 1px dashed rgba(80, 110, 130, 0.5); text-align: center; min-height: 48px; transition: all 0.2s ease; }
.build-slot.equipped { border-style: solid; border-color: var(--slot-color); background: rgba(22, 40, 52, 0.9); box-shadow: 0 0 8px rgba(0, 0, 0, 0.3); }
.slot-tag { font-size: 9px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }
.slot-name { font-size: 11px; font-weight: 600; color: #eff6f5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; margin-top: 2px; }
.slot-lv { font-size: 10px; color: var(--slot-color); font-weight: 700; }
.slot-icon { font-size: 12px; margin-right: 2px; }
.slot-empty { font-size: 10px; color: #627b88; animation: breath-slot 2.2s infinite ease-in-out; margin-top: 2px; }
@keyframes breath-slot { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.95; color: #9bc0d2; } }

.tactical-buffs { display: flex; flex-wrap: wrap; gap: 4px 6px; margin-top: 6px; }
.tactical-buffs > span { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; color: #b7e4db; background: rgba(110, 231, 183, 0.12); padding: 2px 5px; border-radius: 4px; }
.tactical-buffs b { color: #fff; }

/* 中央：战役看板与目标 */
.campaign-header { display: flex; justify-content: space-between; align-items: center; font-size: 12px; }
.campaign-stage { color: #8ad3e8; font-weight: 600; text-shadow: 0 0 8px rgba(138, 211, 232, 0.4); }
.distance-badge { color: var(--muted); }
.distance-badge b { color: #eff6f5; font-size: 14px; }
.countdown-row { text-align: center; margin: 4px 0 6px; }
.timer-display { font-size: 32px; font-weight: 800; letter-spacing: 1px; color: #ffffff; text-shadow: 0 2px 10px rgba(0, 0, 0, 0.8), 0 0 16px rgba(121, 213, 230, 0.3); line-height: 1; }

.track-wrapper { position: relative; height: 6px; background: rgba(30, 48, 60, 0.8); border-radius: 3px; overflow: hidden; margin-bottom: 8px; border: 1px solid rgba(255, 255, 255, 0.06); }
.total-fill { display: block; height: 100%; background: linear-gradient(90deg, #79d5e6, #91e866, #f2cd79); transition: width 0.15s linear; box-shadow: 0 0 8px rgba(121, 213, 230, 0.6); }

.tactical-banner { padding: 5px 8px; border-radius: 5px; background: rgba(16, 28, 38, 0.85); border: 1px solid rgba(121, 213, 230, 0.25); text-align: center; margin-bottom: 8px; }
.objective-text { font-size: 12px; color: #eff6f5; font-weight: 600; letter-spacing: 0.3px; }

.lane-cells { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.lane-cell { display: flex; align-items: center; gap: 5px; padding: 4px 6px; border-radius: 5px; background: rgba(16, 26, 34, 0.7); border: 1px solid rgba(255, 255, 255, 0.05); color: var(--muted); font-size: 11px; white-space: nowrap; transition: all 0.2s ease; }
.radar-dot { width: 6px; height: 6px; border-radius: 50%; background: #4f6875; flex-shrink: 0; }
.lane-cell.current { color: #eff6f5; border-color: rgba(121, 213, 230, 0.5); background: rgba(32, 54, 70, 0.85); box-shadow: 0 0 8px rgba(121, 213, 230, 0.25); }
.lane-cell.current .radar-dot { background: #79d5e6; box-shadow: 0 0 6px #79d5e6; }
.lane-cell.danger .radar-dot { background: #ff5e57; box-shadow: 0 0 6px #ff5e57; animation: blink-danger 0.5s infinite alternate; }
@keyframes blink-danger { from { opacity: 0.4; } to { opacity: 1; } }
.lane-cell.danger { border-color: rgba(255, 94, 87, 0.6); }
.lane-cell em { margin-left: auto; color: #ff8579; font-size: 11px; font-style: normal; font-weight: 600; }
.route-label { display: flex; justify-content: space-between; margin-top: 6px; font-size: 11px; color: var(--muted); padding: 3px 6px; border-radius: 4px; background: rgba(0, 0, 0, 0.25); }

/* 右侧：得分区 */
.score { text-align: right; display: flex; flex-direction: column; justify-content: space-between; }
.game-controls { display: flex; justify-content: flex-end; gap: 6px; margin-bottom: 6px; }
button { font: inherit; color: inherit; pointer-events: auto; cursor: pointer; touch-action: manipulation; }
.game-controls button { display: grid; place-items: center; width: 34px; height: 30px; border: 1px solid #41535f; border-radius: 6px; background: #162630; transition: all 0.15s ease; }
.game-controls button:hover:not(:disabled) { background: #283e4c; border-color: #79d5e6; }
.score-value { margin-top: 2px; }
.score-label { display: block; font-size: 10px; color: #728c9b; letter-spacing: 1px; font-weight: 700; }
.score-value strong { font-size: 26px; font-weight: 800; color: #eff6f5; text-shadow: 0 2px 10px rgba(0, 0, 0, 0.8); }
.score-feedback { display: flex; justify-content: flex-end; gap: 8px; min-height: 18px; font-size: 12px; font-weight: 600; }
.combo-pulse { font-style: normal; color: #ffdc73; text-shadow: 0 0 8px rgba(255, 220, 115, 0.6); animation: combo-pop 0.3s ease-out; }
@keyframes combo-pop { 0% { transform: scale(1.3); } 100% { transform: scale(1); } }
.score-gain { color: #91e866; animation: receipt 1.1s ease forwards; text-shadow: 0 0 6px rgba(145, 232, 102, 0.6); }
@keyframes receipt { 0%, 65% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-8px); } }

/* 底部：暴走超杀坞 */
.skill-dock { position: absolute; left: 50%; bottom: max(16px, env(safe-area-inset-bottom)); transform: translateX(-50%); width: min(580px, calc(100% - 24px)); }
.dock-actions { display: grid; grid-template-columns: auto 1fr; gap: 10px; align-items: stretch; }
.jump-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 10px 14px; border-radius: 10px; background: rgba(9, 20, 29, 0.92); border: 1px solid rgba(121, 213, 230, 0.35); color: #eff6f5; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s ease; backdrop-filter: blur(12px); box-shadow: 0 10px 24px rgba(0,0,0,0.5); }
.jump-btn:hover:not(:disabled) { background: rgba(22, 45, 62, 0.95); border-color: #79d5e6; transform: translateY(-1px); }
.jump-btn:active:not(:disabled) { transform: translateY(1px); }
.jump-btn kbd { margin-bottom: 2px; }
.touch-hint { display: block; text-align: center; color: #b1c8d1; font-size: 12px; text-shadow: 0 2px 6px #071019; margin-bottom: 6px; }
.skill-module { position: relative; overflow: hidden; width: 100%; display: grid; gap: 8px; padding: 12px 16px; border: 1px solid #3d505b; border-radius: 10px; background: rgba(9, 20, 29, 0.94); backdrop-filter: blur(12px); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6); text-align: left; transition: all 0.2s ease; }
.fever-module { --skill-color: #f2cd79; }
.fever-module.ready { border-color: #ffd759; box-shadow: 0 0 20px rgba(255, 215, 89, 0.35); animation: ready-glow 1.5s infinite alternate ease-in-out; }
@keyframes ready-glow { from { border-color: #e6b83f; } to { border-color: #fff099; box-shadow: 0 0 25px rgba(255, 220, 100, 0.6); } }
.fever-module.active { border-color: #ff8547; background: linear-gradient(135deg, rgba(30, 20, 10, 0.95), rgba(45, 25, 12, 0.95)); box-shadow: 0 0 30px rgba(255, 133, 71, 0.5); --skill-color: #ff9d66; }

.skill-head { display: flex; align-items: center; gap: 8px; }
.skill-title { font-size: 16px; font-weight: 750; color: #eff6f5; letter-spacing: 0.3px; }
kbd { min-width: 24px; padding: 2px 6px; border: 1px solid #5d7585; border-bottom-width: 2px; border-radius: 4px; color: #edf5f5; font: 12px/1.3 "Segoe UI", sans-serif; text-align: center; background: rgba(0, 0, 0, 0.4); }
.fever-status { margin-left: auto; color: var(--skill-color); font-size: 15px; font-weight: 700; text-shadow: 0 0 8px rgba(242, 205, 121, 0.4); }

.fever-track { height: 6px; background: rgba(30, 42, 50, 0.85); border-radius: 3px; overflow: hidden; }
.fever-track i { display: block; height: 100%; background: linear-gradient(90deg, #e6b83f, #ff8547); transition: width 0.12s linear; box-shadow: 0 0 8px #ffd759; }

.skill-detail { display: flex; justify-content: space-between; gap: 6px; color: var(--muted); font-size: 12px; }
.glow-tag { color: #ffc083; font-weight: 600; text-shadow: 0 0 6px rgba(255, 160, 100, 0.5); }
.ready-tag { color: #ffeb99; font-weight: 700; }
.trigger-prompt { color: #79d5e6; font-weight: 600; animation: bounce-x 1s infinite alternate; }
@keyframes bounce-x { from { transform: translateX(0); } to { transform: translateX(3px); } }

/* 倒计时与浮标 */
.countdown-mark { position: absolute; left: 50%; top: 38%; transform: translate(-50%, -50%); color: #ffeba5; font-size: clamp(52px, 9vh, 80px); font-weight: 900; text-shadow: 0 4px 20px rgba(0, 0, 0, 0.9), 0 0 30px rgba(255, 235, 165, 0.6); }
.event-notice { position: absolute; top: calc(var(--hud-top) + 10px); left: 50%; transform: translateX(-50%); display: grid; gap: 3px; max-width: calc(100% - 32px); padding: 12px 24px; border-left: 3px solid var(--notice-color, #91e866); border-radius: 6px; background: var(--surface); text-align: center; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6); backdrop-filter: blur(10px); }
.event-notice span, .event-notice em { color: var(--muted); font-size: 12px; font-style: normal; }
.event-notice strong { font-size: 19px; }
.fusion-banner strong { color: var(--notice-color); font-size: 26px; text-shadow: 0 0 16px var(--notice-color); }
.notice-enter-active, .notice-leave-active { transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
.notice-enter-from, .notice-leave-to { opacity: 0; transform: translate(-50%, -10px); }

/* 超武演化图谱弹窗 */
.codex-backdrop { position: fixed; inset: 0; z-index: 20; background: rgba(4, 9, 14, 0.82); backdrop-filter: blur(14px); display: grid; place-items: center; padding: 16px; pointer-events: auto; }
.codex-window { width: min(780px, 100%); max-height: min(85vh, 680px); display: flex; flex-direction: column; background: #0c1822; border: 1px solid rgba(121, 213, 230, 0.35); border-radius: 14px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.85); overflow: hidden; }
.codex-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); background: rgba(18, 32, 44, 0.6); }
.codex-title { display: flex; align-items: center; gap: 12px; }
.codex-icon { color: #f2cd79; }
.codex-title h3 { margin: 0; font-size: 18px; font-weight: 700; color: #eff6f5; }
.codex-title p { margin: 2px 0 0; font-size: 12px; color: var(--muted); }
.codex-close { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 6px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.12); color: #c9d7de; transition: all 0.15s ease; }
.codex-close:hover { background: rgba(255, 94, 87, 0.25); color: #ff8579; border-color: #ff8579; }

.codex-body { flex: 1; overflow-y: auto; padding: 18px 20px; }
.codex-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.codex-card { padding: 12px 14px; border-radius: 8px; background: rgba(16, 28, 38, 0.7); border: 1px solid rgba(255, 255, 255, 0.08); display: flex; flex-direction: column; gap: 6px; transition: all 0.2s ease; }
.codex-card:hover { transform: translateY(-2px); border-color: rgba(121, 213, 230, 0.4); box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4); }
.codex-card.highlighted { border-color: #f2cd79; background: linear-gradient(135deg, rgba(30, 38, 30, 0.8), rgba(20, 32, 40, 0.9)); box-shadow: 0 0 14px rgba(242, 205, 121, 0.25); }

.codex-card-head { display: flex; justify-content: space-between; align-items: center; font-size: 11px; }
.card-formula { display: flex; align-items: center; gap: 4px; font-weight: 600; }
.card-formula i { font-style: normal; color: var(--muted); }
.match-badge { font-size: 10px; color: #ffeb99; background: rgba(242, 205, 121, 0.2); padding: 1px 5px; border-radius: 3px; border: 1px solid rgba(242, 205, 121, 0.35); }
.codex-fusion-name { font-size: 15px; font-weight: 750; letter-spacing: 0.3px; }
.codex-fusion-desc { font-size: 11px; color: #a4bcc9; line-height: 1.35; }

.codex-footer { padding: 12px 20px; background: rgba(12, 22, 30, 0.8); border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 12px; color: var(--muted); text-align: center; }
.codex-footer kbd { margin: 0 3px; }

/* 响应式适配 */
@media (max-width: 960px) {
  .hud-top { grid-template-columns: 240px minmax(260px, 1fr) 150px; padding: 10px 14px; gap: 10px; }
  .timer-display { font-size: 26px; }
}
@media (max-width: 720px) {
  .hud-top { grid-template-columns: 1fr auto; gap: 8px; padding: 8px 10px; }
  .vitals { grid-column: 1; grid-row: 1; }
  .score { grid-column: 2; grid-row: 1; }
  .route { grid-column: 1 / -1; grid-row: 2; }
  .deck-header { margin-bottom: 4px; }
  .slots-grid { gap: 4px; }
  .build-slot { min-height: 42px; padding: 4px 2px; }
  .slot-name { font-size: 10px; }
  .timer-display { font-size: 22px; }
  .skill-dock { width: calc(100% - 16px); bottom: max(10px, env(safe-area-inset-bottom)); }
  .codex-grid { grid-template-columns: 1fr; }
}
</style>
