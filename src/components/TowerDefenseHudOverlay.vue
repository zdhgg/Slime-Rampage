<script setup>
import { computed } from 'vue'
import TowerDefenseBuildMenu from './TowerDefenseBuildMenu.vue'
import TowerDefenseUpgradePanel from './TowerDefenseUpgradePanel.vue'
import TowerDefensePortrait from './TowerDefensePortrait.vue'
import {
  Coins,
  FastForward,
  Flag,
  Heart,
  Map,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Star,
  TowerControl,
  Volume2,
  VolumeX,
  X,
} from 'lucide-vue-next'

const props = defineProps({
  hud: { type: Object, required: true },
  muted: { type: Boolean, default: false },
  paused: { type: Boolean, default: false },
})

const emit = defineEmits([
  'select-tower',
  'preview-tower',
  'select-tower-branch',
  'select-tower-strategy',
  'upgrade',
  'sell',
  'clear-obstacle',
  'trigger-trap',
  'relocate-tower',
  'deselect',
  'toggle-mute',
  'toggle-pause',
  'toggle-resume',
  'open-map',
  'next-stage',
  'restart-stage',
  'menu',
  'advance-tutorial',
  'skip-tutorial',
  'cycle-speed',
  'call-early',
])


const towerChoices = computed(() => {
  const choices = props.hud.towerChoices || props.hud.towerTypes || props.hud.availableTowers || []
  return Array.isArray(choices) ? choices : Object.values(choices)
})
const selectedTower = computed(() => props.hud.selectedTower || props.hud.selected || null)
const selectedSlotIndex = computed(() => props.hud.selectedSlotIndex ?? -1)
const isSlotSelected = computed(() => selectedSlotIndex.value >= 0)
const selectedSlot = computed(() => props.hud.selectedSlot || null)
const tutorialStep = computed(() => props.hud.tutorial?.active ? props.hud.tutorial.step : 0)
const isLockedSlotSelected = computed(() => !!selectedSlot.value?.isLocked)
const isEmptySlotSelected = computed(() => isSlotSelected.value && !selectedTower.value)
const selectedSlotNumber = computed(() => (selectedSlotIndex.value >= 0 ? selectedSlotIndex.value + 1 : ''))
const money = computed(() => props.hud.coins ?? props.hud.gold ?? props.hud.currency ?? 0)
const lives = computed(() => props.hud.lives ?? props.hud.baseHp ?? props.hud.hp ?? 0)
const maxLives = computed(() => props.hud.maxLives ?? props.hud.maxBaseHp ?? props.hud.maxHp ?? 0)
const wave = computed(() => props.hud.wave ?? props.hud.round ?? 1)
const totalWaves = computed(() => props.hud.totalWaves ?? props.hud.maxWave ?? props.hud.waveCount ?? 0)
const waveProgress = computed(() => {
  const value = props.hud.waveProgress ?? props.hud.progress ?? 0
  return `${Math.max(0, Math.min(100, value <= 1 ? value * 100 : value))}%`
})
const basePercent = computed(() => {
  if (!maxLives.value) return '100%'
  return `${Math.max(0, Math.min(100, (lives.value / maxLives.value) * 100))}%`
})
const currentWaveComposition = computed(() => normalizeComposition(props.hud.currentWaveComposition))
const nextWaveComposition = computed(() => normalizeComposition(props.hud.nextWavePreview))
const currentWaveLine = computed(() => formatComposition(currentWaveComposition.value))
const nextWaveLine = computed(() => formatComposition(nextWaveComposition.value))
const showPhaseChip = computed(() => props.hud.phase === 'intermission')
const earlyCallBonus = computed(() => props.hud.earlyCallBonus || 0)
const gameSpeed = computed(() => props.hud.gameSpeed || 1)
const feedback = computed(() => {
  const value = props.hud.feedback
  if (!value) return null
  if (typeof value === 'string') return { text: value, kind: 'info' }
  return { text: value.text || value.message || value.label || '', kind: value.kind || value.type || 'info' }
})
// 战斗中只保留瞬时反馈浮条；持久的阶段说明仅在部署/清场阶段出现
const statusText = computed(() => {
  if (feedback.value?.text) return feedback.value.text
  if (tutorialStep.value) return ''
  const phase = props.hud.phase
  if (phase === 'intermission' || phase === 'waiting') return props.hud.status || ''
  return ''
})
const statusKind = computed(() => feedback.value?.kind || 'info')

const traps = computed(() => props.hud.traps || [])
const buildSlots = computed(() => props.hud.buildSlots || [])
const tutorialInstruction = computed(() => {
  const step = tutorialStep.value
  if (step === 3 && buildSlots.value.filter(slot => slot.occupied).length >= 2) {
    return '两只守卫会一起保护巢心，准备迎接下一波吧！'
  }
  if (step === 2 && selectedTower.value) {
    return money.value < (selectedTower.value.upgradeCost ?? 0)
      ? '等守卫打败敌人、攒够养分，再点「升级」。'
      : '点「升级」，让小守卫变强。'
  }
  if (selectedTower.value) return '点面板右上角的「×」，收起升级面板。'
  if (isEmptySlotSelected.value) {
    return step === 2 && buildSlots.value.some(slot => slot.occupied)
      ? '先关掉召唤菜单，再点已有的守卫。'
      : '选一只小守卫，它会帮你守路。'
  }
  if (step === 2 && buildSlots.value.some(slot => slot.occupied)) return '点箭头指着的小守卫，打开升级面板。'
  return step === 3 ? '点另一个「＋」，让两只守卫一起守路。' : '点路边箭头指着的「＋」，放一只守卫。'
})
const availableLeapSlots = computed(() => {
  if (!selectedTower.value) return []
  return buildSlots.value.filter((s) => !s.occupied && !s.isLocked && s.slotIndex !== selectedTower.value.slotIndex)
})

const stateLabel = computed(() => {
  const labels = {
    countdown: '部署准备',
    build: '部署阶段',
    active: '防守进行中',
    victory: '防线守住',
    defeated: '防线失守',
    paused: '行动暂停',
  }
  return props.hud.stateLabel || labels[props.hud.state] || '防守进行中'
})

function normalizeComposition(source) {
  if (!source) return []
  let items = source
  if (!Array.isArray(items) && typeof items === 'object') {
    items = items.composition || items.enemies || items.units || items.types || items.preview || items
  }
  if (Array.isArray(items)) return items.map(normalizeEnemyEntry).filter((entry) => entry.count > 0)
  if (typeof items === 'object') {
    return Object.entries(items)
      .map(([id, value]) => normalizeEnemyEntry(typeof value === 'object' ? { id, ...value } : { id, count: value }))
      .filter((entry) => entry.count > 0)
  }
  return []
}

function normalizeEnemyEntry(entry) {
  if (typeof entry === 'string') return { id: entry, name: entry, count: 1 }
  const id = entry?.id || entry?.typeId || entry?.type || entry?.key || entry?.name || 'enemy'
  return {
    id,
    name: entry?.name || entry?.label || entry?.typeName || id,
    traits: entry?.traits || [],
    count: Number(entry?.count ?? entry?.amount ?? entry?.quantity ?? entry?.total ?? 0),
  }
}

function formatComposition(items) {
  return items.map((entry) => `${entry.name}×${entry.count}${(entry.traits || []).map((t) => t.icon).join('')}`).join(' ')
}

function compositionTitles(items) {
  if (!items?.length) return ''
  return items
    .map((entry) => `${entry.name}×${entry.count}：${(entry.traits || []).map((t) => t.label).join('；') || '无特殊机制'}`)
    .join('\n')
}

function displayNumber(value) {
  return Number(value || 0).toLocaleString('en-US')
}

</script>

<template>
  <div class="tower-defense-hud adventure-theme" :data-tutorial-step="tutorialStep || undefined" aria-label="塔防战况">
    <header class="defense-header">
      <div class="defense-brand" :title="[hud.tactic?.description, hud.assault?.hint].filter(Boolean).join(' ')">
        <TowerControl :size="20" :stroke-width="1.7" aria-hidden="true" />
        <strong>{{ hud.stageName || hud.mapName || hud.levelName || '母巢防线' }}</strong>
      </div>

      <div class="wave-pill" aria-label="波次状态">
        <span v-if="showPhaseChip" class="phase-chip">{{ stateLabel }}</span>
        <strong class="wave-count">第 {{ Math.max(1, wave) }}<small v-if="totalWaves"> / {{ totalWaves }}</small> 波</strong>
        <i class="wave-track" aria-hidden="true"><em :style="{ width: waveProgress }" /></i>
        <button
          v-if="earlyCallBonus > 0"
          class="call-early-btn"
          type="button"
          title="提前召唤下一波，按剩余整备秒数获得养分（快捷键 E）"
          @click="emit('call-early')"
        >
          ⚔ 立即进攻 +{{ earlyCallBonus }}
        </button>
      </div>

      <div class="header-right">
        <div class="metric-cell"><Coins :size="15" aria-hidden="true" /><span>养分</span><b>{{ displayNumber(money) }}</b></div>
        <div class="metric-cell lives-cell">
          <Heart :size="15" aria-hidden="true" />
          <span>巢心</span>
          <b>{{ lives }}<small v-if="maxLives"> / {{ maxLives }}</small></b>
          <i class="lives-bar" aria-hidden="true"><em :style="{ width: basePercent }" /></i>
        </div>
        <div class="system-controls" aria-label="系统控制">
          <button
            class="system-button speed-btn"
            type="button"
            :title="`游戏速度 ×${gameSpeed}`"
            :aria-label="`游戏速度 ×${gameSpeed}`"
            @click="emit('cycle-speed')"
          >
            <FastForward :size="15" aria-hidden="true" />
            <span class="speed-label">×{{ gameSpeed }}</span>
          </button>
          <button
            class="system-button map-btn"
            type="button"
            title="战役大地图"
            aria-label="战役大地图"
            @click="emit('open-map')"
          >
            <Map :size="17" aria-hidden="true" />
          </button>
          <button
            class="system-button"
            type="button"
            :title="muted ? '取消静音' : '静音'"
            :aria-label="muted ? '取消静音' : '静音'"
            :aria-pressed="muted"
            @click="emit('toggle-mute')"
          >
            <VolumeX v-if="muted" :size="17" aria-hidden="true" />
            <Volume2 v-else :size="17" aria-hidden="true" />
          </button>
          <button
            class="system-button"
            type="button"
            :title="paused ? '继续游戏' : '暂停'"
            :aria-label="paused ? '继续游戏' : '暂停'"
            @click="paused ? emit('toggle-resume') : emit('toggle-pause')"
          >
            <Play v-if="paused" :size="17" aria-hidden="true" />
            <Pause v-else :size="17" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>

    <div v-if="!tutorialStep" class="wave-intel" aria-label="波次情报">
      <span v-if="hud.miniBoss && hud.phase === 'intermission'" :title="`${hud.miniBoss.mechanic} ${hud.miniBoss.counter} 漏过损失 ${hud.miniBoss.damage} 点耐久。`">◆ 最终波：{{ hud.miniBoss.name }}</span>
      <span v-if="hud.assault && hud.phase === 'intermission'" :title="hud.tactic?.description">{{ hud.assault.name }} · {{ hud.assault.hint }}</span>
      <span v-if="currentWaveLine" :title="[hud.currentWavePacing?.hint, compositionTitles(currentWaveComposition)].filter(Boolean).join('\n')">本波{{ hud.currentWavePacing ? ' · ' + hud.currentWavePacing.name : '' }} {{ currentWaveLine }}</span>
      <span v-if="nextWaveLine" class="next" :title="[hud.nextWavePacing?.hint, compositionTitles(nextWaveComposition)].filter(Boolean).join('\n')">下波{{ hud.nextWavePacing ? ' · ' + hud.nextWavePacing.name : '' }} {{ nextWaveLine }}</span>
    </div>

    
    <Transition name="tutorial">
      <div v-if="tutorialStep && !hud.outcome" class="tutorial-banner">
        <div class="tutorial-content">
          <div class="tutorial-badge-row">
            <span class="tutorial-badge">守护练习 {{ tutorialStep }}/3</span>
            <button class="tutorial-skip-link" type="button" @click="emit('skip-tutorial')">跳过引导</button>
          </div>
          <p class="tutorial-text" aria-live="polite">{{ tutorialInstruction }}</p>
        </div>
        <button v-if="tutorialStep === 3" class="tutorial-next-btn" type="button" @click="emit('advance-tutorial')">明白了</button>
      </div>
    </Transition>

    <section v-if="statusText" class="defense-status" :class="statusKind" role="status" aria-live="polite">
      <Flag :size="15" aria-hidden="true" />
      <span>{{ statusText }}</span>
    </section>

    <Transition name="panel-fade">
      <section
        v-if="selectedTower || isLockedSlotSelected"
        class="tower-controls"
        aria-label="史莱姆守卫选择与操作"
      >
        <TowerDefenseUpgradePanel
          v-if="selectedTower" :key="selectedTower.slotIndex"
          :tower="selectedTower" :money="money" :introductory="!!hud.introductory" :leap-slots="availableLeapSlots"
          @upgrade="emit('upgrade')" @sell="emit('sell')" @close="emit('deselect')"
          @branch="emit('select-tower-branch', $event)"
          @strategy="emit('select-tower-strategy', $event)"
          @relocate="emit('relocate-tower', $event)"
        />

        <!-- 2. 选中封印障碍槽位：开垦解锁 -->
        <div v-else-if="isLockedSlotSelected" class="locked-slot-card">
          <div class="palette-heading">
            <div>
              <span>🪓 野性封印高台</span>
              <small>守卫点 #{{ selectedSlotNumber }} · 被帝国封印石碑阻挡</small>
            </div>
            <button class="close-card-btn" type="button" title="取消选中" aria-label="取消选中" @click="emit('deselect')">
              <X :size="13" aria-hidden="true" />
            </button>
          </div>
          <p class="obstacle-desc">
            支付养分清除荆棘，解锁带有全系增益的超导晶脉。开垦不会返还养分，请结合防线位置决定是否投资。
          </p>
          <button
            class="clear-obstacle-btn"
            type="button"
            :disabled="money < selectedSlot.lockCost"
            @click="emit('clear-obstacle', selectedSlotIndex)"
          >
            <Sparkles :size="15" aria-hidden="true" />
            <span>开垦清理障碍</span>
            <b><Coins :size="12" aria-hidden="true" />{{ selectedSlot.lockCost }} 养分</b>
          </button>
        </div>

      </section>
    </Transition>

    <TowerDefenseBuildMenu
      v-if="isEmptySlotSelected && !isLockedSlotSelected && selectedSlot && !hud.outcome"
      :slot="selectedSlot" :choices="towerChoices" :money="money"
      @select="emit('select-tower', $event)" @preview="emit('preview-tower', $event)"
      @close="emit('deselect')"
    />



    <!-- Stage Victory / Defeat Outcome Dialog -->
    <Transition name="fade">
      <div v-if="hud.outcome" class="stage-outcome-backdrop" role="dialog" aria-modal="true" aria-labelledby="stage-outcome-title">
        <div class="stage-outcome-card" :class="hud.outcome">
          <div class="outcome-header">
            <TowerDefensePortrait type="rapid" :level="hud.outcome === 'victory' ? 2 : 1" class="outcome-portrait" />
            <h2 id="stage-outcome-title">{{ hud.outcome === 'victory' ? '守护成功！' : '差一点，给守卫再帮把手！' }}</h2>
            <p v-if="hud.completedWaves > 0">你守住了 {{ hud.completedWaves }} 波！</p>
            <p v-else-if="hud.outcome === 'defeat'">下次可以试试在路的拐弯处放守卫。</p>
            <p class="outcome-stage">{{ hud.stageName || '当前关卡' }}</p>
          </div>

          <!-- 3-Star Rating (for victory) -->
          <div v-if="hud.outcome === 'victory'" class="outcome-stars-section">
            <div class="outcome-stars-row">
              <div
                v-for="s in 3"
                :key="s"
                class="star-wrapper"
                :class="{ earned: (hud.clearResult?.stars || 1) >= s }"
              >
                <Star :size="36" class="big-star" />
              </div>
            </div>

            <div class="star-criteria-list">
              <div class="criteria-row" :class="{ met: true }">
                <Star :size="12" />
                <span>守住所有波次</span>
                <b>⭐</b>
              </div>
              <div class="criteria-row" :class="{ met: (hud.clearResult?.stars || 1) >= 2 }">
                <Star :size="12" />
                <span>巢心剩下至少 80% 生命</span>
                <b>⭐</b>
              </div>
              <div class="criteria-row" :class="{ met: (hud.clearResult?.stars || 1) >= 3 }">
                <Star :size="12" />
                <span>巢心毫发无损</span>
                <b>⭐</b>
              </div>
            </div>
          </div>

          <p class="account-save-status" role="status">{{ hud.accountSync === 'synced' ? '本局记录已保存到账号' : '本局记录等待同步到账号' }}</p>
          <!-- Outcome Action Buttons -->
          <div class="outcome-actions">
            <button
              v-if="hud.outcome === 'victory' && (hud.stageId || 1) < 99"
              class="outcome-btn primary-btn"
              type="button"
              @click="emit('next-stage', (hud.stageId || 1) + 1)"
            >
              <Play :size="16" />
              <span>去下一关</span>
            </button>
            <button
              v-if="hud.outcome === 'defeat'"
              class="outcome-btn retry-btn"
              type="button"
              @click="emit('restart-stage')"
            >
              <RotateCcw :size="16" />
              <span>再试一次</span>
            </button>
            <button class="outcome-btn secondary-btn" type="button" @click="emit('open-map')">
              <Map :size="16" />
              <span>返回守护地图</span>
            </button>
            <button class="outcome-btn secondary-btn" type="button" @click="emit('menu')">返回主界面</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.account-save-status { color: var(--adventure-muted); font-size: 12px; text-align: center; margin: 16px 0; }

.tower-defense-hud {
  position: absolute;
  inset: 0;
  z-index: 6;
  overflow: hidden;
  color: var(--adventure-ink);
  font-family: "Segoe UI", "PingFang SC", sans-serif;
  letter-spacing: 0;
  pointer-events: none;
}

.defense-header,
.wave-intel,
.defense-status,
.tower-controls { position: absolute; }

/* 战术机关 Dock 样式 */
.tactical-traps-dock {
  left: 24px;
  bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  background: rgba(8, 14, 18, 0.88);
  backdrop-filter: blur(6px);
  pointer-events: auto;
  z-index: 4;
}
.dock-title {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #ffeaa7;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.5px;
}
.dock-hint {
  color: rgba(255, 234, 167, 0.6);
  font-size: 9px;
  font-weight: normal;
}
.trap-buttons {
  display: flex;
  gap: 8px;
}
.trap-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  color: #eef5f2;
  cursor: pointer;
  pointer-events: auto;
  transition: all 0.18s ease;
  min-width: 140px;
}
.trap-btn.ready {
  border-color: var(--trap-color, #91dc8c);
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 10px rgba(46, 204, 113, 0.2);
}
.trap-btn.ready:hover {
  background: var(--trap-color, #91dc8c);
  color: #0b1912;
  transform: translateY(-2px);
  box-shadow: 0 0 14px var(--trap-color, #91dc8c);
}
.trap-btn.cooling {
  opacity: 0.45;
  cursor: not-allowed;
}
.trap-icon {
  font-size: 18px;
}
.trap-info {
  display: flex;
  flex-direction: column;
  text-align: left;
  gap: 1px;
}
.trap-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.trap-header-row strong {
  font-size: 10.5px;
  font-weight: 700;
  white-space: nowrap;
}
.trap-badge {
  display: inline-block;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.12);
  color: #dcdde1;
  font-size: 8px;
  font-weight: 700;
}
.trap-badge.badge-ready {
  background: rgba(46, 204, 113, 0.25);
  color: #91dc8c;
}
.trap-btn.ready:hover .trap-badge.badge-ready {
  background: #0b1912;
  color: #91dc8c;
}
.trap-sub {
  font-size: 8.5px;
  color: rgba(238, 245, 242, 0.65);
  white-space: nowrap;
}
.trap-btn.ready:hover .trap-sub {
  color: rgba(11, 25, 18, 0.85);
}

/* 封印节点卡片 */
.locked-slot-card {
  width: 100%;
  min-width: 260px;
  max-width: 340px;
  padding: 10px;
  border: 1px solid rgba(225, 112, 85, 0.45);
  border-radius: 5px;
  background: rgba(18, 12, 10, 0.92);
  backdrop-filter: blur(5px);
  pointer-events: auto;
}
.obstacle-desc {
  margin: 8px 0;
  color: rgba(238, 245, 242, 0.72);
  font-size: 9.5px;
  line-height: 1.45;
}
.obstacle-desc strong {
  color: #ffeaa7;
}
.clear-obstacle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid rgba(255, 177, 66, 0.65);
  border-radius: 4px;
  background: #ffb142;
  color: #1a1005;
  font-size: 10.5px;
  font-weight: 800;
  cursor: pointer;
  pointer-events: auto;
  transition: background 0.15s ease;
}
.clear-obstacle-btn:hover:not(:disabled) {
  background: #ffc048;
}
.clear-obstacle-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.clear-obstacle-btn b {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: #4a2800;
  font-size: 9.5px;
}

.defense-header {
  top: 14px;
  left: 24px;
  right: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 43px;
  padding: 4px 8px;
  border: 1px solid var(--adventure-line);
  border-radius: 12px;
  background: var(--adventure-paper);
}

.defense-brand { display: flex; align-items: center; gap: 8px; min-width: 0; color: var(--adventure-green); }
.defense-brand svg { flex-shrink: 0; }
.defense-brand strong { overflow: hidden; color: var(--adventure-ink); font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }

.header-right { display: flex; flex: none; align-items: center; gap: 14px; }
.metric-cell { display: grid; grid-template-columns: 16px auto; align-items: center; column-gap: 5px; min-width: 64px; color: var(--adventure-muted); font-size: 11px; }
.metric-cell svg { grid-row: 1 / 3; color: var(--adventure-gold); }
.metric-cell b { color: var(--adventure-ink); font-size: 15px; font-variant-numeric: tabular-nums; }
.metric-cell small { color: var(--adventure-muted); font-size: 9px; font-weight: 700; }
.lives-bar { grid-column: 2; width: 64px; height: 3px; margin-top: 1px; overflow: hidden; border-radius: 2px; background: #dedfd4; }
.lives-bar em { display: block; height: 100%; background: #b35347; transition: width 0.16s ease; }

.system-controls {
  display: flex;
  gap: 7px;
  z-index: 2;
  pointer-events: auto;
}
.system-button {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  padding: 0;
  border: 1px solid var(--adventure-line);
  border-radius: 5px;
  color: var(--adventure-ink);
  background: var(--adventure-paper);
  cursor: pointer;
  pointer-events: auto;
}
.system-button:hover { border-color: rgba(145, 220, 140, 0.7); }

.speed-btn {
  width: auto;
  min-width: 46px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  color: var(--adventure-green);
  font-weight: 800;
}
.speed-label { font-size: 11px; font-variant-numeric: tabular-nums; }

@keyframes chip-pulse {
  0%, 100% { box-shadow: 0 4px 18px rgba(0, 0, 0, 0.55), 0 0 10px rgba(165, 94, 234, 0.3); }
  50% { box-shadow: 0 4px 18px rgba(0, 0, 0, 0.55), 0 0 20px rgba(165, 94, 234, 0.55); }
}

.wave-pill {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 14px;
  transform: translate(-50%, -50%);
  border: 1px solid var(--adventure-line);
  border-radius: 999px;
  background: var(--adventure-paper);
  backdrop-filter: blur(4px);
  white-space: nowrap;
}
.phase-chip { color: var(--adventure-green); font-size: 10px; font-weight: 800; }
.wave-count { color: var(--adventure-ink); font-size: 16px; font-variant-numeric: tabular-nums; }
.wave-count small { color: var(--adventure-muted); font-size: 11px; }
.wave-track { width: 104px; height: 4px; overflow: hidden; border-radius: 2px; background: #dedfd4; }
.wave-track em { display: block; height: 100%; background: var(--adventure-green); transition: width 0.16s ease; }

.call-early-btn {
  padding: 3px 10px;
  border: 1px solid rgba(239, 173, 88, 0.65);
  border-radius: 999px;
  background: #fff0d6;
  color: #74441c;
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
  cursor: pointer;
  pointer-events: auto;
  transition: all 0.15s ease;
}
.call-early-btn:hover {
  background: #efad58;
  color: #241503;
}

.wave-intel {
  top: 64px;
  left: 50%;
  display: flex;
  gap: 14px;
  max-width: calc(100vw - 32px);
  transform: translateX(-50%);
  width: max-content;
  padding: 3px 9px;
  border-radius: 8px;
  background: var(--adventure-paper);
  color: var(--adventure-muted);
  font-size: 11px;
  font-weight: 650;
  white-space: nowrap;
  pointer-events: none;
}
.wave-intel span { overflow: hidden; text-overflow: ellipsis; }
.wave-intel .next { color: #315e79; }

.defense-status {
  top: 88px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 7px;
  max-width: min(440px, calc(100vw - 40px));
  padding: 6px 10px;
  transform: translateX(-50%);
  border-left: 3px solid #427d9a;
  border-radius: 6px;
  color: var(--adventure-muted);
  background: var(--adventure-paper);
  font-size: 10px;
  pointer-events: none;
}
.defense-status svg { flex: none; color: #427d9a; }
.defense-status span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.defense-status.danger { border-left-color: #df765f; }
.defense-status.success { border-left-color: var(--adventure-green); }

.tower-controls {
  right: 24px;
  bottom: 20px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  max-width: min(352px, calc(100vw - 48px));
  pointer-events: auto;
}
.palette-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.palette-heading span { color: rgba(238, 245, 242, 0.54); font-size: 10px; font-weight: 800; }
.palette-heading small { color: rgba(238, 245, 242, 0.34); font-size: 9px; }
.close-card-btn {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 3px;
  color: rgba(238, 245, 242, 0.55);
  background: rgba(255, 255, 255, 0.05);
  cursor: pointer;
  pointer-events: auto;
}
.close-card-btn:hover {
  border-color: rgba(255, 255, 255, 0.4);
  color: #fff;
  background: rgba(255, 255, 255, 0.12);
}
.tower-idle-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 5px;
  background: rgba(8, 13, 15, 0.76);
  backdrop-filter: blur(4px);
  color: rgba(238, 245, 242, 0.65);
  font-size: 11px;
  pointer-events: none;
  white-space: nowrap;
}
.tower-idle-hint svg {
  color: var(--adventure-green);
  flex: none;
}
.system-button:focus-visible, .close-card-btn:focus-visible { outline: 2px solid var(--adventure-focus); outline-offset: 2px; }

.panel-fade-enter-active,
.panel-fade-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.tower-controls.panel-fade-leave-active,
.tower-controls.panel-fade-leave-active :deep(*) { pointer-events: none; }
.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

@media (max-width: 900px) {
  .defense-header { left: 16px; right: 16px; }
  .wave-intel { top: 60px; }
  .defense-status { top: 84px; }
  .tower-controls { right: 16px; bottom: 14px; max-width: calc(100vw - 32px); }
}

@media (max-width: 620px) {
  .defense-header { gap: 8px; }
  .defense-brand strong { max-width: 34vw; font-size: 13px; }
  .header-right { gap: 8px; }
  .metric-cell { min-width: 0; }
  .wave-pill { gap: 7px; padding: 4px 10px; }
  .wave-count { font-size: 14px; }
  .wave-track { width: 60px; }
  .wave-intel { top: 58px; font-size: 8px; }
  .defense-status { top: 78px; max-width: calc(100vw - 28px); }
  .tower-controls { right: 10px; bottom: 10px; left: 10px; max-width: none; }
}

@media (max-width: 620px) and (orientation: portrait) {
  .defense-header {
    top: 10px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: 32px 24px 30px;
    gap: 5px 8px;
    padding: 3px 6px;
  }
  .defense-brand { grid-column: 1; grid-row: 1; min-width: 0; }
  .defense-brand strong { max-width: 100%; }
  .header-right { display: contents; }
  .system-controls { grid-column: 2; grid-row: 1; }
  .metric-cell { grid-row: 2; justify-self: start; }
  .lives-cell { justify-self: end; }
  .wave-pill { position: static; grid-column: 1 / -1; grid-row: 3; transform: none; justify-self: center; }
  .wave-intel { top: 108px; gap: 8px; font-size: 10px; line-height: 16px; }
  .wave-intel > span:first-child { max-width: 42vw; }
  .defense-status { top: 132px; }
}

.stage-outcome-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(24, 46, 36, 0.46);
  backdrop-filter: blur(8px);
  pointer-events: auto;
}
.stage-outcome-card {
  width: 90%;
  max-width: 440px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 28px;
  background: var(--adventure-paper);
  border: 1px solid var(--adventure-line);
  border-radius: 20px;
  max-height: calc(100dvh - 30px);
  overflow: auto;
  box-shadow: 0 16px 48px #18352b35;
  text-align: center;
  color: var(--adventure-ink);
}
.stage-outcome-card.defeat {
  border-color: #e1b6a6;
}
.outcome-portrait { width: 96px; height: 74px; margin: 0 auto; }
.outcome-header .outcome-stage { margin-top: 9px; font-size: 12px; }
.outcome-header h2 {
  margin: 6px 0 0;
  font-size: clamp(20px, 4vw, 28px);
  color: var(--adventure-green);
}
.stage-outcome-card.defeat .outcome-header h2 {
  color: #8c4837;
}
.outcome-header p {
  margin: 3px 0 0;
  font-size: 13px;
  color: var(--adventure-muted);
}
.outcome-stars-section {
  width: 100%;
  margin: 16px 0;
}
.outcome-stars-row {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-bottom: 14px;
}
.star-wrapper {
  color: #848d82;
}
.star-wrapper.earned {
  color: #a16816;
}
.star-wrapper.earned .big-star {
  fill: #f7bd47;
}
.star-criteria-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #f2f5ec;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 11.5px;
  text-align: left;
}
.criteria-row {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--adventure-muted);
}
.criteria-row.met {
  color: var(--adventure-green);
  font-weight: 600;
}
.criteria-row b {
  margin-left: auto;
}
.outcome-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  margin-top: 10px;
}
.outcome-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}
.outcome-btn.primary-btn,
.outcome-btn.retry-btn {
  background: var(--adventure-green);
  color: #fff;
  border: 1px solid var(--adventure-green);
}
.outcome-btn:is(.primary-btn, .retry-btn):hover { background: var(--adventure-green-hover); }
.outcome-btn.secondary-btn {
  background: var(--adventure-leaf);
  color: var(--adventure-ink);
  border: 1px solid var(--adventure-line);
}
.outcome-btn.secondary-btn:hover {
  background: #daeace;
}

@media (prefers-reduced-motion: reduce) {
  .wave-track em, .lives-bar em, .tower-actions button, .panel-fade-enter-active, .panel-fade-leave-active { transition: none; }
}

.tutorial-banner {
  box-sizing: border-box;
  position: absolute;
  top: 64px;
  left: 50%;
  transform: translateX(-50%);
  width: min(calc(100% - 24px), 510px);
  background: var(--adventure-paper);
  border: 1px solid #8bb27e;
  border-radius: 12px;
  padding: 9px 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  box-shadow: 0 3px 10px #18352b24;
  z-index: 100;
  backdrop-filter: blur(8px);
  pointer-events: auto;
}

.tutorial-enter-active,
.tutorial-leave-active {
  transition: opacity 0.16s ease;
}

.tutorial-enter-from,
.tutorial-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .tutorial-enter-active, .tutorial-leave-active { transition: none; }
}

.tower-defense-hud[data-tutorial-step] .defense-status {
  top: auto;
  bottom: 15px;
  left: 24px;
  transform: none;
}

.tutorial-banner button:focus-visible,
.outcome-btn:focus-visible { outline: 2px solid var(--adventure-focus); outline-offset: 2px; }

@media (max-width: 620px) and (orientation: portrait) {
  .tutorial-banner { top: 115px; gap: 8px; }
  .tutorial-banner .tutorial-text { font-size: 14px; }
  .tower-defense-hud[data-tutorial-step] .defense-status { left: 10px; }
}

.tutorial-content {
  flex: 1;
}

.tutorial-badge-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.tutorial-badge {
  font-size: 11px;
  font-weight: 800;
  color: var(--adventure-green);
  background: var(--adventure-leaf);
  padding: 2px 8px;
  border-radius: 999px;
}

.tutorial-skip-link {
  background: none;
  border: none;
  color: var(--adventure-muted);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 6px;
}

.tutorial-skip-link:hover {
  color: #8c4837;
}

.tutorial-text {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.45;
  color: var(--adventure-ink);
}

.tutorial-next-btn {
  background: var(--adventure-green);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-weight: 700;
  font-size: 13px;
  padding: 8px 16px;
  cursor: pointer;
  white-space: nowrap;
}

.tutorial-next-btn:hover {
  background: var(--adventure-green-hover);
}

.chip-icon {
  font-size: 12px;
}
.chip-name {
  font-weight: 700;
}

</style>
