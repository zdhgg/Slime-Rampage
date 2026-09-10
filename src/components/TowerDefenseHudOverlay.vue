<script setup>
import { computed, ref } from 'vue'
import TowerDefenseMutationModal from './TowerDefenseMutationModal.vue'
import {
  ArrowUp,
  Coins,
  Crosshair,
  FastForward,
  Flag,
  Heart,
  Map,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Star,
  Timer,
  TowerControl,
  Trash2,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-vue-next'

const props = defineProps({
  hud: { type: Object, required: true },
  muted: { type: Boolean, default: false },
  paused: { type: Boolean, default: false },
})

const emit = defineEmits([
  'select-tower',
  'set-tower-strategy',
  'select-tower-branch',
  'upgrade',
  'sell',
  'clear-obstacle',
  'trigger-trap',
  'relocate-tower',
  'pet-tower',
  'deselect',
  'toggle-mute',
  'toggle-pause',
  'toggle-resume',
  'open-map',
  'next-stage',
  'restart-stage',
  'advance-tutorial',
  'select-mutation',
  'skip-tutorial',
  'cycle-speed',
  'call-early',
  'skip-mutation',
])

// 突变可暂存：默认不弹窗，角落芯片提示，点开再选
const mutationModalOpen = ref(false)

const towerIcons = {
  bolt: Zap,
  rapid: Crosshair,
  cannon: TowerControl,
  blast: TowerControl,
  crystal: ShieldCheck,
  frost: Timer,
  slow: Timer,
  shock: Zap,
  arcane: Sparkles,
  radiant: Star,
}

const towerChoices = computed(() => {
  const choices = props.hud.towerChoices || props.hud.towerTypes || props.hud.availableTowers || []
  return Array.isArray(choices) ? choices : Object.values(choices)
})
const selectedTower = computed(() => props.hud.selectedTower || props.hud.selected || null)
const selectedSlotIndex = computed(() => props.hud.selectedSlotIndex ?? -1)
const isSlotSelected = computed(() => selectedSlotIndex.value >= 0)
const selectedSlot = computed(() => props.hud.selectedSlot || null)
const isLockedSlotSelected = computed(() => !!selectedSlot.value?.isLocked)
const isEmptySlotSelected = computed(() => isSlotSelected.value && !selectedTower.value)
const selectedSlotNumber = computed(() => (selectedSlotIndex.value >= 0 ? selectedSlotIndex.value + 1 : ''))
const selectedBuildType = computed(() => props.hud.selectedTowerTypeId || props.hud.selectedTowerType || '')
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
const pendingOfferCount = computed(() => props.hud.pendingMutationOffers?.length || 0)
const mutationSkipBonus = computed(() => props.hud.mutationSkipBonus ?? 20)
const feedback = computed(() => {
  const value = props.hud.feedback
  if (!value) return null
  if (typeof value === 'string') return { text: value, kind: 'info' }
  return { text: value.text || value.message || value.label || '', kind: value.kind || value.type || 'info' }
})
// 战斗中只保留瞬时反馈浮条；持久的阶段说明仅在部署/清场阶段出现
const statusText = computed(() => {
  if (feedback.value?.text) return feedback.value.text
  const phase = props.hud.phase
  if (phase === 'intermission' || phase === 'waiting') return props.hud.status || ''
  return ''
})
const statusKind = computed(() => feedback.value?.kind || 'info')

const traps = computed(() => props.hud.traps || [])
const buildSlots = computed(() => props.hud.buildSlots || [])
const availableLeapSlots = computed(() => {
  if (!selectedTower.value) return []
  return buildSlots.value.filter((s) => !s.occupied && !s.isLocked && s.slotIndex !== selectedTower.value.slotIndex)
})

const selectedLevel = computed(() => selectedTower.value?.level ?? selectedTower.value?.lv ?? 1)
const selectedMaxLevel = computed(() => selectedTower.value?.maxLevel ?? selectedTower.value?.maxLv ?? 3)
const selectedUpgradeCost = computed(() => selectedTower.value?.upgradeCost ?? props.hud.upgradeCost ?? 0)
const selectedSellValue = computed(() => selectedTower.value?.sellValue ?? selectedTower.value?.refund ?? props.hud.sellValue ?? 0)
const selectedDps = computed(() => {
  if (!selectedTower.value) return null
  if (selectedTower.value.dps != null) return selectedTower.value.dps
  const interval = Number(selectedTower.value.fireInterval)
  return interval > 0 ? Number(selectedTower.value.damage || 0) / interval : null
})
const selectedAttackSpeed = computed(() => {
  if (!selectedTower.value) return null
  if (selectedTower.value.attackSpeed != null) return selectedTower.value.attackSpeed
  const interval = Number(selectedTower.value.fireInterval)
  return interval > 0 ? 1 / interval : null
})
const targetStrategies = computed(() => {
  const strategies = selectedTower.value?.targetStrategies || []
  return Array.isArray(strategies) ? strategies : Object.values(strategies)
})
const currentStrategyId = computed(() => optionId(selectedTower.value?.targetStrategy))
const currentStrategy = computed(() => {
  return targetStrategies.value.find((strategy) => optionId(strategy) === currentStrategyId.value)
    || selectedTower.value?.targetStrategy
    || null
})
const branchOptions = computed(() => {
  const options = selectedTower.value?.branchOptions || []
  return Array.isArray(options) ? options : Object.values(options)
})
const selectedBranchId = computed(() => optionId(selectedTower.value?.branch))
const canUpgrade = computed(() => {
  if (!selectedTower.value) return false
  if (selectedTower.value.canUpgrade != null) return selectedTower.value.canUpgrade
  if (selectedLevel.value >= selectedMaxLevel.value) return false
  return selectedUpgradeCost.value <= money.value
})
const canSell = computed(() => !!selectedTower.value && selectedTower.value.canSell !== false)
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

function onSelectMutation(mutationId) {
  mutationModalOpen.value = false
  emit('select-mutation', mutationId)
}

function onSkipMutation() {
  mutationModalOpen.value = false
  emit('skip-mutation')
}

const towerTagMap = {
  rapid: { role: '强酸喷射 · 极速破甲', badge: '强酸', badgeColor: '#58c9a5', glow: 'rgba(88, 201, 165, 0.16)' },
  slow: { role: '急冻冰霜 · 范围减速', badge: '极寒', badgeColor: '#74bce8', glow: 'rgba(116, 188, 232, 0.16)' },
  blast: { role: '熔岩爆浆 · 重装范围', badge: '熔岩', badgeColor: '#efad58', glow: 'rgba(239, 173, 88, 0.16)' },
  shock: { role: '连环闪电 · 麻痹打断', badge: '雷系', badgeColor: '#a55eea', glow: 'rgba(165, 94, 234, 0.16)' },
  arcane: { role: '引力黑洞 · 真实伤害', badge: '虚空', badgeColor: '#8854d0', glow: 'rgba(136, 84, 208, 0.16)' },
  radiant: { role: '圣堂光环 · 攻速激励', badge: '圣光', badgeColor: '#f1c40f', glow: 'rgba(241, 196, 15, 0.16)' },
}

function towerMeta(tower) {
  const type = towerType(tower)
  return towerTagMap[type] || { role: '史莱姆守护战宠', badge: '守卫', badgeColor: '#9be1a0', glow: 'rgba(155, 225, 160, 0.16)' }
}

const selectedMeta = computed(() => towerMeta(selectedTower.value))

function towerType(tower) {
  return tower?.id || tower?.typeId || tower?.type || tower?.key
}

function towerIcon(tower) {
  return towerIcons[tower?.shape] || towerIcons[towerType(tower)] || TowerControl
}

function towerDisabled(tower) {
  if (tower.unlocked === false) return true

  return !!(tower.disabled || tower.locked || tower.affordable === false || (tower.cost || 0) > money.value)
}

function selectTower(tower) {
  const type = towerType(tower)
  if (type) emit('select-tower', type)
}

function optionId(option) {
  if (option == null) return ''
  return typeof option === 'object' ? option.id || option.key || option.value || option.type || '' : option
}

function optionLabel(option, fallback = '') {
  if (option == null) return fallback
  return typeof option === 'object'
    ? option.name || option.label || option.title || option.id || fallback
    : String(option)
}

function optionDescription(option) {
  return typeof option === 'object'
    ? option.description || option.effectText || option.effect || option.desc || ''
    : ''
}

function cycleTargetStrategy() {
  if (targetStrategies.value.length < 1) return
  const currentIndex = targetStrategies.value.findIndex((strategy) => optionId(strategy) === currentStrategyId.value)
  const next = targetStrategies.value[(currentIndex + 1) % targetStrategies.value.length]
  const id = optionId(next)
  if (id) emit('set-tower-strategy', id)
}

function selectBranch(branch) {
  const id = optionId(branch)
  if (id) emit('select-tower-branch', id)
}

function leapToSlot(targetSlotIndex) {
  if (!selectedTower.value) return
  emit('relocate-tower', { from: selectedTower.value.slotIndex, to: targetSlotIndex })
}

function displayNumber(value) {
  return Number(value || 0).toLocaleString('en-US')
}

function displayStat(value, digits = 1) {
  const number = Number(value)
  if (!Number.isFinite(number)) return value ?? '—'
  return Number.isInteger(number) ? number : Number(number.toFixed(digits))
}
</script>

<template>
  <div class="tower-defense-hud" aria-label="塔防战况">
    <header class="defense-header">
      <div class="defense-brand" :title="hud.chapterName || ''">
        <TowerControl :size="20" :stroke-width="1.7" aria-hidden="true" />
        <strong>{{ hud.stageName || hud.mapName || hud.levelName || '母巢防线' }}</strong>
      </div>

      <div class="wave-pill" aria-label="波次状态">
        <span v-if="showPhaseChip" class="phase-chip">{{ stateLabel }}</span>
        <strong class="wave-count">第 {{ wave }}<small v-if="totalWaves"> / {{ totalWaves }}</small> 波</strong>
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
            :title="`游戏速度 ×${gameSpeed}（快捷键 F）`"
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

    <div class="wave-intel" aria-label="波次情报">
      <span v-if="currentWaveLine" :title="compositionTitles(currentWaveComposition)">本波 {{ currentWaveLine }}</span>
      <span v-if="nextWaveLine" class="next" :title="compositionTitles(nextWaveComposition)">下波 {{ nextWaveLine }}</span>
    </div>

    
    <!-- Stage 1 Interactive Tutorial Floating Banner -->
    <Transition name="fade">
      <div v-if="hud.tutorial?.active" class="tutorial-banner">
        <div class="tutorial-content">
          <div class="tutorial-badge-row">
            <span class="tutorial-badge">🌱 新手启程指引 ({{ hud.tutorial.step }}/4)</span>
            <button class="tutorial-skip-link" type="button" @click="emit('skip-tutorial')">跳过引导 ✕</button>
          </div>
          <p v-if="hud.tutorial.step === 1" class="tutorial-text">
            👈 <strong>第一步 · 召唤守卫</strong>：点击地图上发光绿色光圈地块，选择并召唤你的第一只【强酸史莱姆】！
          </p>
          <p v-else-if="hud.tutorial.step === 2" class="tutorial-text">
            🍄 <strong>第二步 · 战术机关</strong>：敌人经过时，直接点击路边的【毒孢子大蘑菇】释放范围剧毒！
          </p>
          <p v-else-if="hud.tutorial.step === 3" class="tutorial-text">
            💖 <strong>第三步 · 互动鼓舞</strong>：点击已召唤的史莱姆，可进行【抚摸鼓舞】提升攻速，或【换位跳跃】！
          </p>
          <p v-else-if="hud.tutorial.step === 4" class="tutorial-text">
            🛡️ <strong>第四步 · 备战迎敌</strong>：准备就绪！迎战第一波巡逻步兵，保卫母巢之王吧！
          </p>
        </div>
        <button class="tutorial-next-btn" type="button" @click="emit('advance-tutorial')">
          {{ hud.tutorial.step === 4 ? '开始防御战 ⚔️' : '下一步 →' }}
        </button>
      </div>
    </Transition>

    <section v-if="statusText" class="defense-status" :class="statusKind" role="status" aria-live="polite">
      <Flag :size="15" aria-hidden="true" />
      <span>{{ statusText }}</span>
    </section>

    <Transition name="panel-fade">
      <section
        v-if="selectedTower || isEmptySlotSelected"
        class="tower-controls"
        aria-label="史莱姆守卫选择与操作"
      >
        <!-- 1. 已选中史莱姆守卫：展示进化、放生、索敌、突变、抚摸与弹跳 -->
        <div v-if="selectedTower" class="selected-tower" :style="{ borderColor: `${selectedMeta.badgeColor}55` }">
          <div class="selected-heading">
            <div>
              <div class="selected-sub">
                <span>已选史莱姆</span>
                <span class="role-badge" :style="{ borderColor: `${selectedMeta.badgeColor}55`, color: selectedMeta.badgeColor }">{{ selectedMeta.badge }}</span>
              </div>
              <strong :style="{ color: selectedTower.color || '#f2f6ed' }">{{ selectedTower.name || '史莱姆守卫' }}</strong>
            </div>
            <div class="heading-actions">
              <b class="tower-level" :style="{ color: selectedMeta.badgeColor }">Lv.{{ selectedLevel }}<small> / {{ selectedMaxLevel }}</small></b>
              <button class="close-card-btn" type="button" title="取消选中" aria-label="取消选中" @click="emit('deselect')">
                <X :size="13" aria-hidden="true" />
              </button>
            </div>
          </div>

          <!-- ✨ 闪光特质开盲盒提示 -->
          <div v-if="selectedTower.shinyTrait" class="shiny-trait-banner" :style="{ borderColor: selectedTower.shinyTrait.color }">
            <span class="shiny-icon">{{ selectedTower.shinyTrait.icon }}</span>
            <div class="shiny-text">
              <strong :style="{ color: selectedTower.shinyTrait.color }">✨ 闪光特质：【{{ selectedTower.shinyTrait.name }}】</strong>
              <small>{{ selectedTower.shinyTrait.description }}</small>
            </div>
          </div>

          <!-- 地脉共鸣提示 -->
          <div v-if="selectedTower.resonance?.isResonant" class="resonance-banner">
            <Zap :size="13" aria-hidden="true" />
            <span>【{{ selectedTower.resonance.leylineName }}】共鸣激活：{{ selectedTower.resonance.description }}</span>
          </div>

          <dl class="tower-stats">
            <div v-if="selectedDps != null"><dt>DPS</dt><dd class="stat-highlight">{{ displayStat(selectedDps) }}</dd></div>
            <div v-if="selectedAttackSpeed != null"><dt>攻速</dt><dd>{{ displayStat(selectedAttackSpeed, 2) }}/s</dd></div>
            <div v-if="selectedTower.damage != null"><dt>威力</dt><dd>{{ displayStat(selectedTower.damage) }}</dd></div>
            <div v-if="selectedTower.range != null"><dt>感知</dt><dd>{{ displayStat(selectedTower.range, 2) }}</dd></div>
          </dl>
          <p v-if="selectedTower.effectText" class="tower-effect">{{ selectedTower.effectText }}</p>
          <button v-if="targetStrategies.length" class="strategy-button" type="button" @click="cycleTargetStrategy">
            <span>索敌倾向</span><strong>{{ optionLabel(currentStrategy, '默认') }}</strong><small>切换</small>
          </button>
          <div v-if="selectedLevel >= 2 && branchOptions.length" class="branch-section">
            <span class="section-label">{{ selectedLevel === 2 ? 'Lv.3 突变方向预选' : '已突变基因' }}</span>
            <div class="branch-options">
              <button
                v-for="branch in branchOptions"
                :key="optionId(branch)"
                class="branch-button"
                :class="{
                  selected: optionId(branch) === selectedBranchId,
                  disabled: selectedLevel > 2 && optionId(branch) !== selectedBranchId,
                }"
                :disabled="selectedLevel > 2"
                type="button"
                :title="optionDescription(branch)"
                @click="selectBranch(branch)"
              >
                <strong>{{ optionLabel(branch, '突变') }}</strong>
                <small v-if="optionDescription(branch)">{{ optionDescription(branch) }}</small>
              </button>
            </div>
          </div>

          <!-- 互动操作：抚摸鼓舞与弹跳调度 -->
          <div class="pet-and-leap-row">
            <button class="pet-btn" type="button" title="轻抚鼓舞史莱姆（4秒内攻速+15%）" @click="emit('pet-tower', selectedTower.slotIndex)">
              <Heart :size="13" aria-hidden="true" />
              <span>抚摸鼓舞</span>
            </button>
            <div v-if="availableLeapSlots.length" class="leap-dropdown">
              <span class="leap-label">弹跳至:</span>
              <button
                v-for="slot in availableLeapSlots"
                :key="`leap-${slot.slotIndex}`"
                class="leap-slot-chip"
                :disabled="!selectedTower.canRelocate"
                type="button"
                @click="leapToSlot(slot.slotIndex)"
              >
                #{{ slot.slotIndex + 1 }}
              </button>
            </div>
          </div>

          <div class="tower-actions">
            <button class="upgrade-button" type="button" :disabled="!canUpgrade" @click="emit('upgrade')">
              <ArrowUp :size="15" aria-hidden="true" />
              <span>{{ selectedLevel >= selectedMaxLevel ? '已达顶级' : '基因进化' }}</span>
              <b v-if="selectedLevel < selectedMaxLevel"><Coins :size="11" aria-hidden="true" />{{ selectedUpgradeCost }}</b>
            </button>
            <button class="sell-button" type="button" :disabled="!canSell" @click="emit('sell')">
              <Trash2 :size="14" aria-hidden="true" />放生
              <small v-if="selectedSellValue">+{{ selectedSellValue }}</small>
            </button>
          </div>
        </div>

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
            开垦此高台可清除荆棘障碍，释放被封印的远古能量，立即收获 <strong>+{{ selectedSlot.lockReward }}</strong> 养分，并解锁为全系增益的【超导晶脉】高台！
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

        <!-- 3. 选中空槽位：展示召唤面板，点击史莱姆守卫直接召唤到该地块 -->
        <div v-else-if="isEmptySlotSelected" class="tower-palette">
          <div class="palette-heading">
            <div>
              <span>召唤史莱姆守卫</span>
              <small>守卫点 #{{ selectedSlotNumber }} · 点击直接召唤</small>
            </div>
            <button class="close-card-btn" type="button" title="取消选中" aria-label="取消选中" @click="emit('deselect')">
              <X :size="13" aria-hidden="true" />
            </button>
          </div>

          <!-- 地脉属性提示 -->
          <div v-if="selectedSlot?.leyline" class="leyline-recommendation" :style="{ borderColor: `${selectedSlot.leyline.color}55` }">
            <strong :style="{ color: selectedSlot.leyline.color }">🌿 {{ selectedSlot.leyline.leylineName }}</strong>
            <small>{{ selectedSlot.leyline.description }}</small>
          </div>

          <div class="tower-options">
            <button
              v-for="tower in towerChoices"
              :key="towerType(tower)"
              class="tower-option"
              :class="[towerType(tower), { disabled: towerDisabled(tower), locked: tower.unlocked === false }]"
              :disabled="towerDisabled(tower)"
              :style="{ '--accent': towerMeta(tower).badgeColor, '--glow': towerMeta(tower).glow }"
              :aria-label="`${tower.name || '史莱姆'}，花费 ${tower.cost || 0}`"
              type="button"
              @click="selectTower(tower)"
            >
              <div class="tower-opt-icon" :style="{ color: towerMeta(tower).badgeColor }">
                <component :is="towerIcon(tower)" :size="20" :stroke-width="1.8" aria-hidden="true" />
              </div>
              <div class="tower-opt-content">
                <div class="tower-opt-top">
                  <strong class="tower-opt-name">{{ tower.name || '史莱姆' }}</strong>
                  <span class="role-badge" :style="{ borderColor: `${towerMeta(tower).badgeColor}55`, color: towerMeta(tower).badgeColor }">{{ towerMeta(tower).badge }}</span>
                </div>
                <span class="tower-opt-desc">{{ towerMeta(tower).role }}</span>
              </div>
              <b v-if="tower.unlocked !== false" class="tower-opt-cost"><Coins :size="11" aria-hidden="true" />{{ tower.cost ?? 0 }}</b>
              <span v-else class="tower-lock-chip">🔒 第 {{ tower.unlockStage }} 关解锁</span>
            </button>
            <span v-if="!towerChoices.length" class="tower-empty">等待史莱姆基因解锁</span>
          </div>
        </div>
      </section>
    </Transition>

    <!-- Roguelike 3-Card Mutation：可暂存，不阻塞战斗；点芯片打开 -->
    <button
      v-if="pendingOfferCount > 0 && !mutationModalOpen"
      class="mutation-pending-chip"
      type="button"
      title="有未选择的基因突变，点击打开（战斗不会暂停）"
      @click="mutationModalOpen = true"
    >
      🧬 突变待选 ×{{ pendingOfferCount }}
    </button>
    <Transition name="fade">
      <TowerDefenseMutationModal
        v-if="pendingOfferCount > 0 && mutationModalOpen && hud.pendingMutationChoices?.length"
        :choices="hud.pendingMutationChoices"
        :skippable="true"
        :skip-bonus="mutationSkipBonus"
        :pending-count="pendingOfferCount"
        @select="onSelectMutation"
        @skip="onSkipMutation"
        @dismiss="mutationModalOpen = false"
      />
    </Transition>

    <!-- Stage Victory / Defeat Outcome Dialog -->
    <Transition name="fade">
      <div v-if="hud.outcome" class="stage-outcome-backdrop" role="dialog" aria-modal="true">
        <div class="stage-outcome-card" :class="hud.outcome">
          <div class="outcome-header">
            <span class="outcome-icon">{{ hud.outcome === 'victory' ? '🏆' : '💀' }}</span>
            <h2>{{ hud.outcome === 'victory' ? '防线守卫大捷' : '母巢防线失守' }}</h2>
            <p>{{ hud.stageName || '当前关卡' }}</p>
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
                <span>防守成功完成所有波次</span>
                <b>⭐</b>
              </div>
              <div class="criteria-row" :class="{ met: (hud.clearResult?.stars || 1) >= 2 }">
                <Star :size="12" />
                <span>母巢生命值 ≥ 80%</span>
                <b>⭐</b>
              </div>
              <div class="criteria-row" :class="{ met: (hud.clearResult?.stars || 1) >= 3 }">
                <Star :size="12" />
                <span>母巢满血 100% 完美无损</span>
                <b>⭐</b>
              </div>
            </div>
          </div>

          <!-- Outcome Action Buttons -->
          <div class="outcome-actions">
            <button
              v-if="hud.outcome === 'victory' && (hud.stageId || 1) < 99"
              class="outcome-btn primary-btn"
              type="button"
              @click="emit('next-stage', (hud.stageId || 1) + 1)"
            >
              <Play :size="16" />
              <span>挑战下一关</span>
            </button>
            <button
              v-if="hud.outcome === 'defeat'"
              class="outcome-btn retry-btn"
              type="button"
              @click="emit('restart-stage')"
            >
              <RotateCcw :size="16" />
              <span>重新挑战</span>
            </button>
            <button class="outcome-btn secondary-btn" type="button" @click="emit('open-map')">
              <Map :size="16" />
              <span>返回战役地图</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.tower-defense-hud {
  position: absolute;
  inset: 0;
  z-index: 6;
  overflow: hidden;
  color: #eef5f2;
  font-family: "Segoe UI", "PingFang SC", sans-serif;
  letter-spacing: 0;
  pointer-events: none;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.65);
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
  border-color: var(--trap-color, #2ecc71);
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 10px rgba(46, 204, 113, 0.2);
}
.trap-btn.ready:hover {
  background: var(--trap-color, #2ecc71);
  color: #0b1912;
  transform: translateY(-2px);
  box-shadow: 0 0 14px var(--trap-color, #2ecc71);
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
  color: #2ecc71;
  border: 1px solid rgba(46, 204, 113, 0.4);
}
.trap-btn.ready:hover .trap-badge.badge-ready {
  background: #0b1912;
  color: #2ecc71;
}
.trap-sub {
  font-size: 8.5px;
  color: rgba(238, 245, 242, 0.65);
  white-space: nowrap;
}
.trap-btn.ready:hover .trap-sub {
  color: rgba(11, 25, 18, 0.85);
}

/* 地脉共鸣横幅 */
.resonance-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding: 4px 7px;
  border-radius: 4px;
  background: rgba(46, 204, 113, 0.14);
  border: 1px solid rgba(46, 204, 113, 0.38);
  color: #a8ff78;
  font-size: 8.5px;
  line-height: 1.3;
}

/* 抚摸鼓舞与弹跳换位 */
.pet-and-leap-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
.pet-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid rgba(255, 107, 129, 0.45);
  border-radius: 4px;
  background: rgba(255, 107, 129, 0.12);
  color: #ff6b81;
  font-size: 9px;
  font-weight: 700;
  cursor: pointer;
  pointer-events: auto;
  transition: all 0.15s ease;
}
.pet-btn:hover {
  background: #ff6b81;
  color: #fff;
}
.leap-dropdown {
  display: flex;
  align-items: center;
  gap: 4px;
}
.leap-label {
  font-size: 8.5px;
  color: rgba(238, 245, 242, 0.5);
}
.leap-slot-chip {
  padding: 2px 6px;
  border: 1px solid rgba(121, 213, 230, 0.35);
  border-radius: 3px;
  background: rgba(121, 213, 230, 0.08);
  color: #79d5e6;
  font-size: 8.5px;
  font-weight: 700;
  cursor: pointer;
  pointer-events: auto;
}
.leap-slot-chip:hover:not(:disabled) {
  background: #79d5e6;
  color: #0b171c;
}
.leap-slot-chip:disabled {
  opacity: 0.35;
  cursor: not-allowed;
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

/* 地脉推荐提示 */
.leyline-recommendation {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 6px;
  padding: 4px 7px;
  border: 1px solid;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.04);
}
.leyline-recommendation strong {
  font-size: 9.5px;
}
.leyline-recommendation small {
  color: rgba(238, 245, 242, 0.62);
  font-size: 8.5px;
}

.defense-header {
  top: 14px;
  left: 24px;
  right: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.defense-brand { display: flex; align-items: center; gap: 9px; min-width: 0; color: #9be1a0; }
.defense-brand strong { overflow: hidden; color: #f2f6ed; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }

.header-right { display: flex; flex: none; align-items: center; gap: 14px; }
.metric-cell { display: grid; grid-template-columns: 16px auto; align-items: center; column-gap: 5px; min-width: 64px; color: rgba(238, 245, 242, 0.56); font-size: 9px; }
.metric-cell svg { grid-row: 1 / 3; color: #d7a657; }
.metric-cell b { color: #f1d487; font-size: 13px; font-variant-numeric: tabular-nums; }
.metric-cell small { color: rgba(241, 212, 135, 0.58); font-size: 9px; font-weight: 700; }
.lives-bar { grid-column: 2; width: 64px; height: 3px; margin-top: 1px; overflow: hidden; border-radius: 2px; background: rgba(255, 255, 255, 0.13); }
.lives-bar em { display: block; height: 100%; background: #d8845c; transition: width 0.16s ease; }

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
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 5px;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(0, 0, 0, 0.46);
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
  color: #91dc8c;
  font-weight: 800;
}
.speed-label { font-size: 11px; font-variant-numeric: tabular-nums; }

.mutation-pending-chip {
  position: absolute;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  z-index: 5;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid rgba(165, 94, 234, 0.65);
  border-radius: 999px;
  background: rgba(24, 14, 36, 0.92);
  color: #cda9f5;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  pointer-events: auto;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.55), 0 0 14px rgba(165, 94, 234, 0.35);
  animation: chip-pulse 1.6s infinite ease-in-out;
}
.mutation-pending-chip:hover { background: rgba(44, 24, 66, 0.95); }
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
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  background: rgba(7, 15, 12, 0.55);
  backdrop-filter: blur(4px);
  white-space: nowrap;
}
.phase-chip { color: #9be1a0; font-size: 10px; font-weight: 800; }
.wave-count { color: #f2d98d; font-size: 16px; font-variant-numeric: tabular-nums; }
.wave-count small { color: rgba(242, 217, 141, 0.55); font-size: 11px; }
.wave-track { width: 104px; height: 4px; overflow: hidden; border-radius: 2px; background: rgba(255, 255, 255, 0.13); }
.wave-track em { display: block; height: 100%; background: #91dc8c; transition: width 0.16s ease; }

.call-early-btn {
  padding: 3px 10px;
  border: 1px solid rgba(239, 173, 88, 0.65);
  border-radius: 999px;
  background: rgba(239, 173, 88, 0.14);
  color: #f5b56a;
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
  color: rgba(238, 245, 242, 0.42);
  font-size: 9px;
  font-weight: 700;
  white-space: nowrap;
  pointer-events: none;
}
.wave-intel span { overflow: hidden; text-overflow: ellipsis; }
.wave-intel .next { color: rgba(121, 213, 230, 0.5); }

.defense-status {
  top: 88px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 7px;
  max-width: min(440px, calc(100vw - 40px));
  padding: 6px 10px;
  transform: translateX(-50%);
  border-left: 2px solid #79d5e6;
  color: rgba(238, 245, 242, 0.7);
  background: rgba(7, 15, 22, 0.68);
  font-size: 10px;
  pointer-events: none;
}
.defense-status svg { flex: none; color: #79d5e6; }
.defense-status span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.defense-status.danger { border-left-color: #df765f; }
.defense-status.success { border-left-color: #91dc8c; }

.tower-controls {
  right: 24px;
  bottom: 20px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  max-width: min(340px, calc(100vw - 48px));
  pointer-events: auto;
}
.tower-palette, .selected-tower {
  width: 100%;
  min-width: 260px;
  max-width: 340px;
  padding: 10px;
  border: 1px solid rgba(215, 166, 87, 0.28);
  border-radius: 5px;
  background: rgba(8, 13, 15, 0.88);
  backdrop-filter: blur(5px);
  pointer-events: auto;
}
.palette-heading, .selected-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.palette-heading span, .selected-heading span, .section-label { color: rgba(238, 245, 242, 0.54); font-size: 10px; font-weight: 800; }
.palette-heading small { color: rgba(238, 245, 242, 0.34); font-size: 9px; }
.heading-actions { display: flex; align-items: center; gap: 8px; }
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
  color: #9be1a0;
  flex: none;
}
.selected-sub { display: flex; align-items: center; gap: 6px; }
.role-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 5px;
  border: 1px solid;
  border-radius: 3px;
  font-size: 8px;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: 0.5px;
  background: rgba(255, 255, 255, 0.05);
}
.stat-highlight {
  color: #79d5e6 !important;
  font-weight: 700;
}
.tower-options { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.tower-option {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 8px;
  min-width: 0;
  min-height: 48px;
  padding: 6px 9px;
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: 4px;
  color: rgba(238, 245, 242, 0.88);
  background: rgba(255, 255, 255, 0.04);
  font: inherit;
  font-size: 10px;
  text-align: left;
  cursor: pointer;
  pointer-events: auto;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.12s ease;
}
.tower-opt-icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.35);
}
.tower-opt-content { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.tower-opt-top { display: flex; align-items: center; gap: 6px; }
.tower-opt-name { color: #f2f6ed; font-size: 11px; font-weight: 800; }
.tower-opt-desc { color: rgba(238, 245, 242, 0.52); font-size: 8.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tower-opt-cost {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 6px;
  border-radius: 3px;
  color: #f1d487;
  background: rgba(241, 212, 135, 0.1);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.tower-option:hover:not(:disabled) {
  border-color: var(--accent, #91dc8c);
  background: var(--glow, rgba(145, 220, 140, 0.12));
  transform: translateX(-2px);
}
.tower-option.disabled { cursor: not-allowed; opacity: 0.38; }
.tower-empty { padding: 12px 4px; color: rgba(238, 245, 242, 0.4); font-size: 10px; }

.selected-tower { border-color: rgba(121, 213, 230, 0.35); }
.selected-heading strong { display: block; margin-top: 3px; overflow: hidden; color: #f2f6ed; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.tower-level { flex: none; color: #79d5e6; font-size: 13px; font-variant-numeric: tabular-nums; }
.tower-level small { color: rgba(121, 213, 230, 0.55); font-size: 10px; }
.tower-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5px; margin: 9px 0 0; padding-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.1); }
.tower-stats div { min-width: 0; }
.tower-stats dt { overflow: hidden; color: rgba(238, 245, 242, 0.4); font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }
.tower-stats dd { margin: 2px 0 0; color: #e9f0eb; font-size: 11px; font-variant-numeric: tabular-nums; }
.tower-effect { margin: 7px 0 0; overflow: hidden; color: rgba(238, 245, 242, 0.62); font-size: 9px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.strategy-button { display: flex; align-items: center; gap: 7px; width: 100%; min-height: 28px; margin-top: 7px; padding: 4px 7px; border: 1px solid rgba(121, 213, 230, 0.3); border-radius: 4px; color: rgba(238, 245, 242, 0.64); background: rgba(121, 213, 230, 0.07); font: inherit; font-size: 9px; text-align: left; cursor: pointer; pointer-events: auto; }
.strategy-button strong { overflow: hidden; color: #bce9ed; text-overflow: ellipsis; white-space: nowrap; }
.strategy-button small { margin-left: auto; color: rgba(238, 245, 242, 0.38); }
.branch-section { margin-top: 8px; }
.branch-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px; margin-top: 4px; }
.branch-button { min-width: 0; min-height: 34px; padding: 4px 6px; border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 4px; color: rgba(238, 245, 242, 0.65); background: rgba(255, 255, 255, 0.04); font: inherit; text-align: left; cursor: pointer; pointer-events: auto; }
.branch-button strong, .branch-button small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.branch-button strong { font-size: 9px; }
.branch-button small { margin-top: 2px; color: rgba(238, 245, 242, 0.4); font-size: 8px; }
.branch-button.selected { border-color: #d7a657; color: #f1d487; background: rgba(215, 166, 87, 0.13); }
.tower-actions { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 6px; margin-top: 8px; }
.tower-actions button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-width: 0; min-height: 32px; padding: 0 7px; border: 1px solid rgba(145, 220, 140, 0.52); border-radius: 4px; color: #122016; background: #91dc8c; font: inherit; font-size: 10px; font-weight: 800; cursor: pointer; pointer-events: auto; }
.tower-actions button b { display: inline-flex; align-items: center; gap: 2px; color: #2e4b2d; font-size: 9px; }
.tower-actions button small { color: #9be1a0; font-size: 9px; }
.tower-actions button:disabled { cursor: not-allowed; opacity: 0.36; }
.tower-actions button:hover:not(:disabled) { background: #a5e99f; }
.tower-actions .sell-button { border-color: rgba(223, 118, 95, 0.52); color: #f1d5cd; background: rgba(223, 118, 95, 0.12); }
.tower-actions .sell-button:hover:not(:disabled) { background: rgba(223, 118, 95, 0.22); }
.system-button:focus-visible, .tower-option:focus-visible, .strategy-button:focus-visible, .branch-button:focus-visible, .tower-actions button:focus-visible, .close-card-btn:focus-visible { outline: 2px solid #d7ffba; outline-offset: 2px; }

.panel-fade-enter-active,
.panel-fade-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}
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
  .tower-palette, .selected-tower { min-width: 0; max-width: none; }
  .tower-options { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .tower-option { grid-template-columns: 1fr; justify-items: center; min-height: 40px; padding: 4px 3px; text-align: center; }
  .tower-option svg { grid-row: auto; }
  .tower-option span { max-width: 100%; font-size: 9px; }
  .tower-option b { display: none; }
  .tower-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .tower-effect { max-width: 100%; }
}

.stage-outcome-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(4, 9, 14, 0.85);
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
  background: #0d151c;
  border: 1px solid rgba(88, 201, 165, 0.4);
  border-radius: 14px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.8);
  text-align: center;
  color: #eef5f2;
}
.stage-outcome-card.defeat {
  border-color: rgba(255, 107, 129, 0.45);
}
.outcome-header .outcome-icon {
  font-size: 40px;
}
.outcome-header h2 {
  margin: 6px 0 0;
  font-size: 20px;
  color: #a8ff78;
}
.stage-outcome-card.defeat .outcome-header h2 {
  color: #ff6b81;
}
.outcome-header p {
  margin: 3px 0 0;
  font-size: 13px;
  color: rgba(238, 245, 242, 0.7);
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
  color: rgba(255, 255, 255, 0.2);
  transition: all 0.3s;
}
.star-wrapper.earned {
  color: #ffd166;
  filter: drop-shadow(0 0 10px rgba(255, 209, 102, 0.8));
  transform: scale(1.1);
}
.star-wrapper.earned .big-star {
  fill: #ffd166;
}
.star-criteria-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: rgba(255, 255, 255, 0.04);
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 11.5px;
  text-align: left;
}
.criteria-row {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(238, 245, 242, 0.4);
}
.criteria-row.met {
  color: #2ecc71;
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
.outcome-btn.primary-btn {
  background: #2ecc71;
  color: #0c1c14;
  border: 1px solid #2ecc71;
}
.outcome-btn.primary-btn:hover {
  background: #55efc4;
}
.outcome-btn.retry-btn {
  background: #ff6b81;
  color: #fff;
  border: 1px solid #ff6b81;
}
.outcome-btn.secondary-btn {
  background: rgba(255, 255, 255, 0.08);
  color: #eef5f2;
  border: 1px solid rgba(255, 255, 255, 0.15);
}
.outcome-btn.secondary-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

@media (prefers-reduced-motion: reduce) {
  .wave-track em, .lives-bar em, .tower-option, .tower-actions button, .panel-fade-enter-active, .panel-fade-leave-active { transition: none; }
}

.tutorial-banner {
  position: absolute;
  top: 68px;
  left: 50%;
  transform: translateX(-50%);
  width: min(92%, 640px);
  background: rgba(10, 20, 16, 0.95);
  border: 2px solid #2ecc71;
  border-radius: 12px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7), 0 0 20px rgba(46, 204, 113, 0.35);
  z-index: 100;
  backdrop-filter: blur(8px);
  pointer-events: auto;
  animation: pulse-border 2s infinite ease-in-out;
}

@keyframes pulse-border {
  0%, 100% { border-color: #2ecc71; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7), 0 0 15px rgba(46, 204, 113, 0.3); }
  50% { border-color: #55efc4; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7), 0 0 25px rgba(85, 239, 196, 0.5); }
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
  color: #2ecc71;
  background: rgba(46, 204, 113, 0.15);
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(46, 204, 113, 0.4);
}

.tutorial-skip-link {
  background: none;
  border: none;
  color: #a4b0be;
  font-size: 12px;
  cursor: pointer;
  padding: 2px 6px;
}

.tutorial-skip-link:hover {
  color: #ff7675;
}

.tutorial-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: #f1f2f6;
}

.tutorial-next-btn {
  background: linear-gradient(135deg, #2ecc71, #27ae60);
  border: none;
  border-radius: 8px;
  color: #ffffff;
  font-weight: 700;
  font-size: 13px;
  padding: 8px 16px;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(46, 204, 113, 0.4);
  transition: transform 0.15s ease;
}

.tutorial-next-btn:hover {
  transform: scale(1.04);
}

.tower-option.locked {
  opacity: 0.55;
  filter: grayscale(0.65);
  cursor: not-allowed;
  border-color: rgba(255, 255, 255, 0.1) !important;
}

.tower-lock-chip {
  font-size: 10px;
  font-weight: 700;
  color: #ff7675;
  background: rgba(255, 118, 117, 0.15);
  padding: 3px 6px;
  border-radius: 4px;
  border: 1px solid rgba(255, 118, 117, 0.35);
}


.shiny-trait-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: rgba(255, 209, 102, 0.12);
  border: 1px solid #ffd166;
  border-radius: 6px;
  margin-bottom: 8px;
}
.shiny-icon {
  font-size: 18px;
}
.shiny-text {
  display: flex;
  flex-direction: column;
}
.shiny-text strong {
  font-size: 11px;
}
.shiny-text small {
  font-size: 10px;
  color: rgba(238, 245, 242, 0.7);
}


.active-mutations-tray {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}
.mutation-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.mutation-mini-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(15, 26, 36, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.15);
  font-size: 11px;
  color: #eef5f2;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  cursor: help;
  transition: transform 0.15s ease;
}
.mutation-mini-chip:hover {
  transform: scale(1.08);
}
.mutation-mini-chip.common {
  border-color: #2ecc71;
  color: #2ecc71;
}
.mutation-mini-chip.rare {
  border-color: #38d2ff;
  color: #38d2ff;
}
.mutation-mini-chip.epic {
  border-color: #a55eea;
  color: #a55eea;
}
.mutation-mini-chip.legendary {
  border-color: #ffd166;
  color: #ffd166;
  background: linear-gradient(180deg, rgba(30, 25, 15, 0.9) 0%, rgba(15, 20, 26, 0.9) 100%);
}
.chip-icon {
  font-size: 12px;
}
.chip-name {
  font-weight: 700;
}

</style>
