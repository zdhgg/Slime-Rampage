<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Crown,
  Gauge,
  Hourglass,
  Infinity as InfinityIcon,
  Play,
  Route,
  Shield,
  Swords,
  TowerControl,
} from 'lucide-vue-next'
import {
  DIFFICULTIES,
  DIFFICULTY_IDS,
  MODE_IDS,
  MODES,
  formatRunClock,
  getNextModeUnlock,
  getUnlockedModeIds,
  isDifficultyUnlocked,
  isModeUnlocked,
  modeUnlockHint,
  normalizeRunSelection,
  runKey,
} from '../game/RunRules.js'
import { getExpeditionStages } from '../game/RunRules.js'
import { STRAINS } from '../game/Strains.js'
import StrainSelect from './StrainSelect.vue'
import { STRAIN_PRESENTATION } from './strainPresentation.js'
import { RUNNER_SUBMODES } from '../game/gameplay/runner/RunnerRules.js'

const emit = defineEmits(['prepare', 'market', 'profiles', 'account', 'leaderboard', 'ui-sound', 'runner', 'tower-defense'])
const props = defineProps({
  initialView: { type: String, default: 'playstyles' },
  records: { type: Object, default: () => ({}) },
  progression: {
    type: Object,
    default: () => ({ highestDifficulty: 'normal', highestMode: 'expedition' }),
  },
  preferences: { type: Object, default: () => ({ mode: 'expedition', difficulty: 'normal' }) },
  activeSlot: { type: Object, default: null },
  lanAccount: { type: Object, default: null },
  lanStatus: { type: Object, default: () => ({ checked: false, online: false }) },
  publicLeaderboard: { type: Object, default: null },
})

const runnerSubmodesList = Object.values(RUNNER_SUBMODES)

function startRunnerWithSubmode(submodeId) {
  emit('ui-sound', 'confirm')
  emit('runner', submodeId)
}

function runnerActionLabel(submode) {
  return Number.isFinite(submode.duration) ? `${submode.duration} 秒目标` : '持续挑战'
}

const MODE_FACTS = {
  expedition: ['独立章节', '章间补给', '讨伐统帅决战'],
  timed: ['十二分钟封锁', '终局勇者', '通关速度计分'],
  endless: ['无时间上限', '二十波后灾变', '长期生存纪录'],
}

/**
 * 模式图标统一使用 lucide 组件（与玩法选择页一致）：
 * 旧版手绘 path 中沙漏像蝴蝶结、无尽符号像心，辨识度不足。
 */
const MODE_LUCIDE_ICONS = {
  expedition: Crown,
  timed: Hourglass,
  endless: InfinityIcon,
}

/** 模式卡标签：把模式差异（时长/机制/结算）直接摆到选择页，三秒可读。 */
const MODE_CHIPS = {
  expedition: ['章节制 · 6–12 章', '章间补给', '统帅决战'],
  timed: ['12 分钟限时', '阶段首领', '速度计分'],
  endless: ['无尽波次', '20 波后灾变', '生存纪录'],
}

/** 模式主题色：仅用于卡片图标与轻微强调，不破坏整体金色体系。 */
const MODE_COLORS = {
  expedition: '#ecc477',
  timed: '#78c7ff',
  endless: '#c99bff',
}

const PLAYSTYLES = [
  {
    id: 'arena',
    index: '01',
    name: '主战场',
    kicker: 'Arena · 开放战场',
    description: '在开放地图中成长、吞噬与进化，选择一套规则推进这场反攻。',
    detail: '3 种战斗类型 · 共享成长与档案',
    accent: '#ecc477',
  },
  {
    id: 'runner',
    index: '02',
    name: '突围',
    kicker: 'Runner · 三线推进',
    description: '切换车道、躲避弹幕并融合武器，在王城封锁线上抢出一条生路。',
    detail: '3 种突围类型 · 独立玩法结算',
    accent: '#79d5e6',
  },
  {
    id: 'tower-defense',
    index: '03',
    name: '塔防',
    kicker: 'Tower Defense · 巢穴防线',
    description: '部署防御塔、调度资源并守住巢心，在一波波攻势中稳住最后的阵地。',
    detail: '即时部署 · 升级与出售 · 波次结算',
    accent: '#91dc8c',
  },
]

const PLAYSTYLE_ICONS = {
  arena: Swords,
  runner: Route,
  'tower-defense': TowerControl,
}

const RUNNER_MODE_ICONS = {
  blitz: Gauge,
  marathon: Shield,
  endless: InfinityIcon,
}

const LOCK_ICON = [
  'M7 10V7a5 5 0 0 1 10 0v3',
  'M5 10h14v10H5z',
  'M12 14v3',
]

/** 远征的关卡数随难度递增（简单 6 / 普通 8 / 困难 10 / 地狱 12），其余模式为静态规则。 */
const modeFacts = computed(() => {
  if (selection.value.mode !== 'expedition') return MODE_FACTS[selection.value.mode]
  const count = getExpeditionStages(selection.value.difficulty).length
  return [`${count} 个独立章节`, ...MODE_FACTS.expedition.slice(1)]
})

const view = ref(props.initialView)
const selection = ref({ ...normalizeRunSelection(props.preferences), strain: 'origin' })
const playstyleGrid = ref(null)
const modeGrid = ref(null)
const runnerGrid = ref(null)
const configBackLink = ref(null)

watch(
  () => runKey(normalizeRunSelection(props.preferences)),
  () => {
    selection.value = {
      ...normalizeRunSelection(props.preferences),
      strain: selection.value.strain || 'origin',
    }
  }
)

const unlockedModes = computed(() => getUnlockedModeIds(props.progression))
const nextUnlock = computed(() => getNextModeUnlock(props.progression))
const modeCards = computed(() =>
  MODE_IDS.map((mode, index) => ({
    mode,
    index,
    locked: !isModeUnlocked(props.progression, mode),
    hint: modeUnlockHint(mode),
  }))
)
/** 最新解锁的模式 = 当前推荐挑战项，用于角标与呼吸光；全部解锁后最后一张为终极挑战。 */
const featuredMode = computed(
  () => unlockedModes.value[unlockedModes.value.length - 1]
)
const allModesUnlocked = computed(() => unlockedModes.value.length === MODE_IDS.length)

/* 锁卡点击反馈：抖动 + 条件 toast（锁卡不使用 disabled，键盘/屏幕阅读器可达） */
const shakingMode = ref(null)
const lockNotice = ref('')
let shakeTimer = null
let noticeTimer = null
const selectedMode = computed(() => MODES[selection.value.mode])
const selectedDifficulty = computed(() => DIFFICULTIES[selection.value.difficulty])
const lanLabel = computed(() => {
  if (props.lanAccount) return props.lanAccount.displayName || props.lanAccount.username
  if (props.lanStatus?.online) return '登录局域网'
  return props.lanStatus?.checked ? '离线单机' : '检测中'
})
const publicEntries = computed(() => props.publicLeaderboard?.entries || [])
/**
 * 其他设备的加入地址：优先用主机上报的局域网 IP + 端口。
 * 直接 window.location.origin 在主机上是 localhost，别的设备打开访问的是它自己。
 */
const hostAddress = computed(() => {
  const ips = props.lanStatus?.lanIps
  const port = props.lanStatus?.lanPort
  if (Array.isArray(ips) && ips.length && port) return `http://${ips[0]}:${port}`
  return window.location.origin
})
const selectedStrain = computed(() => STRAINS[selection.value.strain] || STRAINS.origin)
const record = computed(() => props.records[runKey(selection.value)] || {
  best: { wave: 1, stage: 1, kills: 0, time: 0, score: 0, clears: 0, fastestFinale: null, fastestClear: null },
  board: [],
})

/** 难度卡副标题：远征展示关卡数（随难度变化），其余模式只展示战利品倍率。 */
function difficultyMeta(difficulty) {
  const info = DIFFICULTIES[difficulty]
  const reward = `战利品 ×${info.rewardMul}`
  if (selection.value.mode !== 'expedition') return reward
  return `${getExpeditionStages(difficulty).length} 章 · ${reward}`
}

function modeSummary(mode) {
  const records = DIFFICULTY_IDS.map((difficulty) =>
    props.records[runKey({ mode, difficulty })]
  ).filter(Boolean)
  const bestScore = Math.max(0, ...records.map((item) => item.best?.score || 0))
  const clears = records.reduce((sum, item) => sum + (item.best?.clears || 0), 0)
  const bestWave = Math.max(0, ...records.map((item) => item.best?.wave || 0))
  return { bestScore, clears, bestWave }
}

/** 模式卡数据只需随 records / progression 变化重算，模板中避免重复调用。 */
const modeSummaries = computed(() =>
  Object.fromEntries(MODE_IDS.map((mode) => [mode, modeSummary(mode)]))
)

function showPlaystyleSelection(playstyle = 'arena') {
  view.value = 'playstyles'
  emit('ui-sound', 'click')
  nextTick(() => {
    const preferred = playstyleGrid.value?.querySelector(`[data-playstyle="${playstyle}"]`)
    const target = preferred || playstyleGrid.value?.querySelector('.playstyle-option')
    target?.focus()
  })
}

function selectPlaystyle(playstyle) {
  emit('ui-sound', 'select')
  view.value = playstyle === 'runner' ? 'runner-types' : 'arena-types'
  nextTick(() => {
    const target = playstyle === 'runner' ? runnerGrid.value : modeGrid.value
    const preferred = playstyle === 'runner'
      ? target?.querySelector('.runner-mode-card')
      : target?.querySelector(`[data-mode="${selection.value.mode}"]`)
    const fallback = target?.querySelector(playstyle === 'runner' ? '.runner-mode-card' : '.mode-option:not(:disabled)')
    const focusTarget = preferred || fallback
    focusTarget?.focus()
  })
}

function showArenaTypes() {
  view.value = 'arena-types'
  emit('ui-sound', 'click')
  nextTick(() => {
    const preferred = modeGrid.value?.querySelector(`[data-mode="${selection.value.mode}"]`)
    const target = preferred || modeGrid.value?.querySelector('.mode-option:not(:disabled)')
    target?.focus()
  })
}

function selectMode(mode) {
  selection.value.mode = mode
  if (!isDifficultyUnlocked(props.progression, selection.value.difficulty)) {
    selection.value.difficulty = 'normal'
  }
  emit('ui-sound', 'select')
  view.value = 'config'
  nextTick(() => configBackLink.value?.focus())
}

/** 模式卡统一入口：已解锁进入配置；锁定则抖动并弹出条件提示。 */
function onModeCardClick(card) {
  if (card.locked) {
    emit('ui-sound', 'click')
    shakingMode.value = card.mode
    lockNotice.value = card.hint
    clearTimeout(shakeTimer)
    clearTimeout(noticeTimer)
    shakeTimer = setTimeout(() => {
      if (shakingMode.value === card.mode) shakingMode.value = null
    }, 620)
    noticeTimer = setTimeout(() => { lockNotice.value = '' }, 2800)
    return
  }
  selectMode(card.mode)
}

function dismissLockNotice() {
  lockNotice.value = ''
  clearTimeout(noticeTimer)
}

/** 一键续局：直接按上次（或默认）规则进入战前简报，老玩家少走三步。 */
function quickContinue() {
  emit('ui-sound', 'select')
  emit('prepare', { ...selection.value })
}

function selectDifficulty(difficulty) {
  if (!isDifficultyUnlocked(props.progression, difficulty)) return
  if (selection.value.difficulty === difficulty) return
  selection.value.difficulty = difficulty
  emit('ui-sound', 'select')
}

/** 锁定难度的解锁提示：线性解锁（简单→普通→困难→地狱），提示通关上一难度。 */
function difficultyUnlockHint(difficulty) {
  const index = DIFFICULTY_IDS.indexOf(difficulty)
  const prev = DIFFICULTIES[DIFFICULTY_IDS[index - 1]]
  return prev ? `通关${prev.name}解锁` : '尚未解锁'
}

function selectStrain(strain) {
  if (selection.value.strain === strain) return
  selection.value.strain = strain
  emit('ui-sound', 'select')
}

function showModeSelection() {
  showArenaTypes()
}

function onMenuEscape() {
  if (view.value === 'config') showArenaTypes()
  else if (view.value === 'arena-types') showPlaystyleSelection('arena')
  else if (view.value === 'runner-types') showPlaystyleSelection('runner')
}

function prepare() {
  emit('ui-sound', 'click')
  emit('prepare', { ...selection.value })
}

watch(
  () => [selection.value.mode, selection.value.difficulty],
  () => emit('leaderboard', normalizeRunSelection(selection.value)),
  { immediate: true }
)
</script>

<template>
  <div class="start-overlay" :class="{ 'config-active': view === 'config' }" @keydown.esc="onMenuEscape">
    <!-- 史莱姆主题动态背景：漂浮 goo 光晕 + 上浮气泡，纯 CSS 动画，不挡交互 -->
    <div class="goo-layer" aria-hidden="true">
      <div class="goo-blob blob-a"></div>
      <div class="goo-blob blob-b"></div>
      <span v-for="n in 12" :key="n" class="goo-bubble"></span>
    </div>
    <main class="start-shell" :class="{ 'config-shell': view === 'config' }">
      <header class="start-header">
        <h1>史莱姆大暴走<span>SLIME RAMPAGE</span></h1>
        <div class="header-actions">
          <button class="account-link" :class="{ online: props.lanAccount }" title="局域网账号" @click="emit('account')">
            <span aria-hidden="true">{{ props.lanAccount ? '●' : '○' }}</span>
            <b>{{ lanLabel }}</b>
          </button>
          <button class="profile-link" title="管理本地档案" @click="emit('profiles')">
            <span aria-hidden="true">▣</span>
            <b>{{ props.activeSlot?.name || '史莱姆档案 1' }}</b>
          </button>
          <button
            v-if="view === 'arena-types' || view === 'config'"
            class="market-link"
            title="主战场 · 永久基因改造"
            @click="emit('market')"
          >地下城黑市</button>
        </div>
      </header>

      <section v-if="view === 'playstyles'" class="mode-view playstyle-view" aria-labelledby="playstyle-title">
        <div class="view-heading">
          <p>行动档案</p>
          <div class="title-row">
            <svg class="slime-buddy" viewBox="0 0 48 38" aria-hidden="true">
              <path d="M7 33C5 21 13 9 24 9s19 12 17 24c-.3 2-1.7 2.6-3.4 2.6H10.4C8.7 35.6 7.3 35 7 33Z" fill="rgba(142, 173, 131, 0.9)" />
              <path d="M14 15.5c2-2.4 5-3.8 8-4" stroke="rgba(255, 255, 255, 0.55)" stroke-width="2.2" stroke-linecap="round" fill="none" />
              <circle cx="18.5" cy="24" r="2.1" fill="#0a0d0c" />
              <circle cx="29.5" cy="24" r="2.1" fill="#0a0d0c" />
              <path d="M21 28.4c1.9 1.4 4.1 1.4 6 0" stroke="#0a0d0c" stroke-width="1.8" stroke-linecap="round" fill="none" />
            </svg>
            <h2 id="playstyle-title">选择玩法</h2>
          </div>
          <span>三套战斗系统，从这里选择你的推进方式。</span>
        </div>

        <div ref="playstyleGrid" class="playstyle-grid">
          <button
            v-for="playstyle in PLAYSTYLES"
            :key="playstyle.id"
            class="playstyle-option"
            :data-playstyle="playstyle.id"
            :style="{ '--playstyle-accent': playstyle.accent }"
            @click="playstyle.id === 'tower-defense' ? emit('tower-defense') : selectPlaystyle(playstyle.id)"
          >
            <div class="playstyle-topline">
              <span class="playstyle-index">{{ playstyle.index }}</span>
              <span class="playstyle-kicker">{{ playstyle.kicker }}</span>
            </div>
            <div class="playstyle-title-row">
              <component :is="PLAYSTYLE_ICONS[playstyle.id]" class="playstyle-icon" :size="28" :stroke-width="1.65" aria-hidden="true" />
              <h3>{{ playstyle.name }}</h3>
            </div>
            <p>{{ playstyle.description }}</p>
            <span class="playstyle-detail">{{ playstyle.detail }}</span>
            <span class="playstyle-enter">{{ playstyle.id === 'arena' ? '选择战斗类型' : playstyle.id === 'runner' ? '选择突围类型' : '直接部署防线' }} <ArrowRight :size="16" :stroke-width="1.8" aria-hidden="true" /></span>
          </button>
        </div>
      </section>

      <section v-else-if="view === 'arena-types'" class="mode-view subtype-view" aria-labelledby="arena-mode-title">
        <div class="view-heading">
          <button class="section-kicker" title="返回玩法选择" @click="showPlaystyleSelection('arena')">
            <span class="back-arrow" aria-hidden="true"><ArrowLeft :size="17" :stroke-width="1.8" /></span>
            <span class="kicker-label">主战场 · ARENA</span>
          </button>
          <div class="title-row">
            <svg class="slime-buddy" viewBox="0 0 48 38" aria-hidden="true">
              <path d="M7 33C5 21 13 9 24 9s19 12 17 24c-.3 2-1.7 2.6-3.4 2.6H10.4C8.7 35.6 7.3 35 7 33Z" fill="rgba(142, 173, 131, 0.9)" />
              <path d="M14 15.5c2-2.4 5-3.8 8-4" stroke="rgba(255, 255, 255, 0.55)" stroke-width="2.2" stroke-linecap="round" fill="none" />
              <circle cx="18.5" cy="24" r="2.1" fill="#0a0d0c" />
              <circle cx="29.5" cy="24" r="2.1" fill="#0a0d0c" />
              <path d="M21 28.4c1.9 1.4 4.1 1.4 6 0" stroke="#0a0d0c" stroke-width="1.8" stroke-linecap="round" fill="none" />
            </svg>
            <h2 id="arena-mode-title">选择战斗类型</h2>
            <button class="quick-continue" title="按上次规则直接进入战前简报" @click="quickContinue">
              <Play :size="13" :stroke-width="2.1" aria-hidden="true" />
              继续上次 · {{ selectedMode.name }} {{ selectedDifficulty.name }}
            </button>
          </div>
          <span>决定本局的推进目标与结算规则。</span>
        </div>

        <div ref="modeGrid" class="mode-grid" :style="{ '--mode-count': modeCards.length }">
            <button
              v-for="card in modeCards"
              :key="card.mode"
              class="mode-option"
              :class="{
                locked: card.locked,
                featured: featuredMode === card.mode,
                shaking: shakingMode === card.mode,
              }"
              :aria-disabled="card.locked"
              :data-mode="card.mode"
              :style="{ '--mode-accent': MODE_COLORS[card.mode] }"
              @click="onModeCardClick(card)"
            >
              <span v-if="featuredMode === card.mode" class="mode-feature-badge">
                {{ allModesUnlocked ? '终极挑战' : '当前可挑战' }}
              </span>
              <span v-if="card.locked" class="mode-corner-lock" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                  <path v-for="d in LOCK_ICON" :key="d" :d="d" />
                </svg>
              </span>

              <span class="mode-index">0{{ card.index + 1 }}</span>
              <div class="mode-title-row">
                <component
                  :is="MODE_LUCIDE_ICONS[card.mode]"
                  class="mode-icon"
                  :size="23"
                  :stroke-width="1.7"
                  aria-hidden="true"
                />
                <h3>{{ MODES[card.mode].name }}</h3>
              </div>
              <p>{{ MODES[card.mode].description }}</p>

              <div class="mode-chips" aria-hidden="true">
                <i v-for="chip in MODE_CHIPS[card.mode]" :key="chip">{{ chip }}</i>
              </div>

              <dl v-if="!card.locked">
                <div>
                  <dt>最高分<small>全难度</small></dt>
                  <dd v-if="modeSummaries[card.mode].bestScore">{{ modeSummaries[card.mode].bestScore.toLocaleString('en-US') }}</dd>
                  <dd v-else class="empty-dd">等你首创</dd>
                </div>
                <div>
                  <dt>{{ card.mode === 'endless' ? '最高波次' : '累计通关' }}<small>全难度</small></dt>
                  <dd>{{ card.mode === 'endless' ? (modeSummaries[card.mode].bestWave || '—') : modeSummaries[card.mode].clears }}</dd>
                </div>
              </dl>
              <div v-else class="mode-locked-note">
                <svg class="mode-lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path v-for="d in LOCK_ICON" :key="d" :d="d" />
                </svg>
                <span>{{ card.hint || '尚未解锁' }}</span>
              </div>
              <span class="mode-enter">
                {{ card.locked ? '查看解锁条件' : '进入设置' }}
                <ArrowRight v-if="!card.locked" :size="15" :stroke-width="1.9" aria-hidden="true" />
              </span>
            </button>
        </div>

        <Transition name="toast">
          <div v-if="lockNotice" class="lock-toast" role="status" @click="dismissLockNotice">
            <svg class="lock-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path v-for="d in LOCK_ICON" :key="d" :d="d" />
            </svg>
            <span>{{ lockNotice }}</span>
          </div>
        </Transition>

        <div class="unlock-panel" :class="{ complete: !nextUnlock }">
          <div class="unlock-stepper" aria-label="模式解锁路线">
            <template v-for="(card, sIndex) in modeCards" :key="card.mode">
              <div
                class="unlock-step"
                :class="{
                  done: !card.locked,
                  current: nextUnlock && nextUnlock.mode === card.mode,
                  waiting: card.locked && (!nextUnlock || nextUnlock.mode !== card.mode),
                }"
              >
                <span class="unlock-dot">
                  <Check v-if="!card.locked" :size="14" :stroke-width="2.5" aria-hidden="true" />
                  <component
                    v-else
                    :is="MODE_LUCIDE_ICONS[card.mode]"
                    :size="14"
                    :stroke-width="1.9"
                    aria-hidden="true"
                  />
                </span>
                <b>{{ MODES[card.mode].name }}</b>
                <i>{{ !card.locked ? '已开放' : nextUnlock && nextUnlock.mode === card.mode ? '当前目标' : '未解锁' }}</i>
              </div>
              <div
                v-if="sIndex < modeCards.length - 1"
                class="unlock-link"
                :class="{ filled: unlockedModes.length > sIndex + 1 }"
              >
                <span>困难通关</span>
              </div>
            </template>
          </div>
          <div class="unlock-footer">
            <div class="unlock-segs" aria-hidden="true">
              <i
                v-for="mode in MODE_IDS"
                :key="mode"
                :class="{ fill: unlockedModes.includes(mode) }"
              ></i>
            </div>
            <b>解锁进度 {{ unlockedModes.length }} / {{ MODE_IDS.length }}</b>
            <i v-if="nextUnlock">下一模式：{{ nextUnlock.name }} · {{ nextUnlock.hint }}</i>
            <i v-else>全部开放 · 三种战斗类型均可进入</i>
          </div>
        </div>
      </section>

      <section v-else-if="view === 'runner-types'" class="mode-view subtype-view runner-view" aria-labelledby="runner-mode-title">
        <div class="view-heading">
          <button class="section-kicker runner" title="返回玩法选择" @click="showPlaystyleSelection('runner')">
            <span class="back-arrow" aria-hidden="true"><ArrowLeft :size="17" :stroke-width="1.8" /></span>
            <span class="kicker-label">突围 · RUNNER</span>
          </button>
          <div class="title-row">
            <svg class="slime-buddy" viewBox="0 0 48 38" aria-hidden="true">
              <path d="M7 33C5 21 13 9 24 9s19 12 17 24c-.3 2-1.7 2.6-3.4 2.6H10.4C8.7 35.6 7.3 35 7 33Z" fill="rgba(142, 173, 131, 0.9)" />
              <path d="M14 15.5c2-2.4 5-3.8 8-4" stroke="rgba(255, 255, 255, 0.55)" stroke-width="2.2" stroke-linecap="round" fill="none" />
              <circle cx="18.5" cy="24" r="2.1" fill="#0a0d0c" />
              <circle cx="29.5" cy="24" r="2.1" fill="#0a0d0c" />
              <path d="M21 28.4c1.9 1.4 4.1 1.4 6 0" stroke="#0a0d0c" stroke-width="1.8" stroke-linecap="round" fill="none" />
            </svg>
            <h2 id="runner-mode-title">选择突围类型</h2>
          </div>
          <span>换道、冲锋，在三线战场突破封锁。</span>
        </div>

        <div ref="runnerGrid" class="runner-mode-grid">
          <button
            v-for="(sub, index) in runnerSubmodesList"
            :key="sub.id"
            class="runner-mode-card"
            :class="{ featured: sub.id === 'marathon' }"
            @click="startRunnerWithSubmode(sub.id)"
          >
            <div class="runner-card-top">
              <span class="runner-card-index">0{{ index + 1 }}</span>
              <component :is="RUNNER_MODE_ICONS[sub.id]" class="runner-mode-icon" :size="22" :stroke-width="1.7" aria-hidden="true" />
              <span v-if="sub.id === 'marathon'" class="runner-recommend-tag">主力推荐</span>
            </div>
            <h3>{{ sub.name }}</h3>
            <p class="runner-card-kicker">{{ sub.kicker }}</p>
            <p class="runner-card-desc">{{ sub.description }}</p>
            <span class="runner-card-action">{{ runnerActionLabel(sub) }} <ArrowRight :size="15" :stroke-width="1.9" aria-hidden="true" /></span>
          </button>
        </div>
      </section>

      <section v-else-if="view === 'config'" class="config-view" aria-labelledby="config-title">
        <div class="config-content">
          <div class="config-intro">
            <div class="config-heading">
              <button ref="configBackLink" class="back-link" title="返回战斗类型" aria-label="返回战斗类型" @click="showModeSelection">
                <ArrowLeft :size="17" :stroke-width="1.8" aria-hidden="true" />
              </button>
              <div class="config-mode-copy">
                <div class="config-kicker"><p>本局配置</p><span aria-hidden="true">/</span><h2 id="config-title">{{ selectedMode.name }}</h2></div>
                <details class="config-mode-details">
                  <summary>{{ modeFacts.join(' · ') }}</summary>
                  <p>{{ selectedMode.description }}</p>
                </details>
              </div>
            </div>

            <aside class="config-record" aria-label="当前规则纪录">
              <span>当前规则纪录 · {{ selectedDifficulty.name }}</span>
              <strong>{{ record.best.score?.toLocaleString('en-US') || '—' }}</strong>
              <dl>
                <div>
                  <dt>{{ selection.mode === 'expedition' ? '最高章节' : '最高波次' }}</dt>
                  <dd>{{ selection.mode === 'expedition' ? `${record.best.stage || 1} / ${getExpeditionStages(selection.difficulty).length}` : record.best.wave || 1 }}</dd>
                </div>
                <div><dt>最多击杀</dt><dd>{{ record.best.kills || 0 }}</dd></div>
                <div v-if="selection.mode === 'timed'">
                  <dt>最快终局</dt>
                  <dd>{{ record.best.fastestFinale ? formatRunClock(record.best.fastestFinale) : '—' }}</dd>
                </div>
                <div v-else-if="selection.mode === 'expedition'">
                  <dt>最快远征</dt>
                  <dd>{{ record.best.fastestClear ? formatRunClock(record.best.fastestClear) : '—' }}</dd>
                </div>
                <div v-else><dt>最长生存</dt><dd>{{ formatRunClock(record.best.time) }}</dd></div>
              </dl>
            </aside>
          </div>

          <div class="config-flow">
            <StrainSelect :model-value="selection.strain" @update:model-value="selectStrain" @preview="emit('ui-sound', 'select')" />
            <section class="config-step" aria-labelledby="difficulty-heading">
              <header class="step-heading">
                <b id="difficulty-heading">难度</b>
                <span>{{ selectedDifficulty.description }}</span>
              </header>
              <!-- 锁定难度也展示（灰卡 + 解锁条件），让玩家看得到后面的挑战目标 -->
              <div class="difficulty-options" :style="{ '--difficulty-count': DIFFICULTY_IDS.length }">
                <button
                  v-for="difficulty in DIFFICULTY_IDS"
                  :key="difficulty"
                  :class="{
                    selected: selection.difficulty === difficulty,
                    locked: !isDifficultyUnlocked(props.progression, difficulty),
                  }"
                  :aria-pressed="selection.difficulty === difficulty"
                  :aria-disabled="!isDifficultyUnlocked(props.progression, difficulty)"
                  :title="isDifficultyUnlocked(props.progression, difficulty)
                    ? DIFFICULTIES[difficulty].description
                    : difficultyUnlockHint(difficulty)"
                  @click="selectDifficulty(difficulty)"
                >
                  <span class="option-copy">
                    <b>{{ DIFFICULTIES[difficulty].name }}</b>
                    <i>{{ isDifficultyUnlocked(props.progression, difficulty) ? difficultyMeta(difficulty) : difficultyUnlockHint(difficulty) }}</i>
                  </span>
                  <svg
                    v-if="!isDifficultyUnlocked(props.progression, difficulty)"
                    class="diff-lock-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.9"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path v-for="d in LOCK_ICON" :key="d" :d="d" />
                  </svg>
                  <span v-else class="choice-indicator" aria-hidden="true">✓</span>
                </button>
              </div>
            </section>

          </div>

          <!-- 排行榜挪到配置之后：配置页主角是「做选择」；空态折叠成一行，不再占黄金位置 -->
          <section class="public-board" :class="{ empty: !publicEntries.length }" aria-labelledby="public-board-title">
            <template v-if="publicEntries.length">
              <header class="step-heading">
                <b id="public-board-title">局域网排行榜</b>
                <span>{{ publicLeaderboard?.totalPlayers || 0 }} 名玩家</span>
              </header>
              <div class="public-board-list">
                <div
                  v-for="entry in publicEntries.slice(0, 5)"
                  :key="entry.runId"
                  class="public-board-row"
                  :class="{ current: entry.current }"
                >
                  <span>#{{ entry.rank }}</span>
                  <b>{{ entry.score.toLocaleString('en-US') }}</b>
                  <i>{{ entry.username }}</i>
                  <em>{{ entry.result === 'victory' ? '通关' : entry.result === 'extracted' ? '撤离' : '败退' }}</em>
                </div>
              </div>
              <p class="public-board-hint">
                主机地址 <code>{{ hostAddress }}</code> · 其他设备打开同一地址即可加入
              </p>
            </template>
            <p v-else class="public-board-empty">
              <b id="public-board-title">局域网排行榜</b>
              <span>{{ props.lanStatus?.online ? '这套规则还没有公共成绩。' : '主机未连接，启动局域网主机后全员榜会显示在这里。' }}</span>
            </p>
          </section>
        </div>

        <!-- 独立底部操作区：内容在上方滚动，不遮挡角色与排行榜。 -->
        <div class="config-actions">
          <p class="config-summary">
            <b>{{ selectedMode.name }}</b>
            <span>{{ selectedDifficulty.name }}</span>
            <i aria-hidden="true">·</i>
            <span class="summary-strain" :style="{ color: STRAIN_PRESENTATION[selectedStrain.id].color }">{{ selectedStrain.name }}</span>
          </p>
          <button class="primary-action" @click="prepare">
            开始行动
            <ArrowRight :size="16" :stroke-width="1.9" aria-hidden="true" />
          </button>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.start-overlay {
  --accent: #d7a657;
  --accent-bright: #ecc477;
  --accent-soft: rgba(215, 166, 87, 0.14);
  --surface: #12100d;
  --surface-hover: #17130f;
  --text: #f4eee6;
  --text-muted: rgba(244, 238, 230, 0.56);
  --text-faint: rgba(244, 238, 230, 0.38);
  --border: rgba(238, 214, 180, 0.15);
  position: absolute;
  inset: 0;
  z-index: 30;
  overflow-y: auto;
  color: var(--text);
  background:
    radial-gradient(1100px 560px at 82% -8%, rgba(210, 157, 77, 0.16), transparent 62%),
    radial-gradient(880px 520px at 8% 108%, rgba(134, 63, 42, 0.11), transparent 60%),
    #090806;
}

.start-overlay.config-active { overflow: hidden; }

/* ---- 史莱姆主题动态背景（纯装饰，不响应事件） ---- */
.goo-layer {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.start-shell {
  position: relative;
  z-index: 1;
  width: min(1040px, calc(100% - 48px));
  min-height: 100%;
  margin: 0 auto;
  padding: 26px 0 38px;
}

.start-shell.config-shell {
  display: flex;
  flex-direction: column;
  width: min(1180px, calc(100% - 64px));
  height: 100%;
  min-height: 0;
  padding-top: 18px;
  padding-bottom: max(14px, env(safe-area-inset-bottom));
}
.config-shell .start-header { flex: none; min-height: 48px; padding-bottom: 16px; }

.goo-blob {
  position: absolute;
  border-radius: 50%;
  opacity: 0.58;
  filter: blur(100px);
  animation: gooFloat 16s ease-in-out infinite alternate;
}

.blob-a {
  width: 460px;
  height: 400px;
  top: -150px;
  right: -120px;
  background: radial-gradient(circle at 35% 35%, rgba(190, 139, 64, 0.28), transparent 70%);
}

.blob-b {
  width: 420px;
  height: 380px;
  bottom: -130px;
  left: -140px;
  background: radial-gradient(circle at 60% 60%, rgba(133, 58, 40, 0.16), transparent 70%);
  animation-delay: -7s;
}

.goo-bubble {
  position: absolute;
  bottom: -40px;
  left: var(--x);
  width: var(--s);
  height: var(--s);
  border-radius: 50% 50% 50% 50% / 55% 55% 45% 45%;
  background: radial-gradient(circle at 32% 30%, rgba(226, 181, 108, 0.4), rgba(150, 98, 49, 0.12) 60%, transparent 78%);
  opacity: 0;
  animation: gooRise var(--dur) linear infinite;
  animation-delay: var(--delay);
}

.goo-bubble:nth-child(3) { --x: 6%; --s: 14px; --dur: 17s; --delay: -3s; }
.goo-bubble:nth-child(4) { --x: 14%; --s: 8px; --dur: 13s; --delay: -9s; }
.goo-bubble:nth-child(5) { --x: 23%; --s: 18px; --dur: 21s; --delay: -14s; }
.goo-bubble:nth-child(6) { --x: 32%; --s: 10px; --dur: 15s; --delay: -5s; }
.goo-bubble:nth-child(7) { --x: 41%; --s: 22px; --dur: 24s; --delay: -18s; }
.goo-bubble:nth-child(8) { --x: 50%; --s: 9px; --dur: 12s; --delay: -1s; }
.goo-bubble:nth-child(9) { --x: 58%; --s: 15px; --dur: 19s; --delay: -11s; }
.goo-bubble:nth-child(10) { --x: 67%; --s: 11px; --dur: 14s; --delay: -7s; }
.goo-bubble:nth-child(11) { --x: 76%; --s: 20px; --dur: 23s; --delay: -16s; }
.goo-bubble:nth-child(12) { --x: 85%; --s: 9px; --dur: 13s; --delay: -4s; }
.goo-bubble:nth-child(13) { --x: 92%; --s: 16px; --dur: 20s; --delay: -12s; }
.goo-bubble:nth-child(14) { --x: 70%; --s: 7px; --dur: 11s; --delay: -2s; }

@keyframes gooRise {
  0% { opacity: 0; transform: translateY(0) translateX(0) scale(0.8); }
  12% { opacity: 0.42; }
  85% { opacity: 0.24; }
  100% { opacity: 0; transform: translateY(-108vh) translateX(3vw) scale(1.06); }
}

@keyframes gooFloat {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(-34px, 28px, 0) scale(1.09); }
}

/* 标题旁的小史莱姆：缓慢挤压呼吸 */
.title-row {
  display: flex;
  align-items: center;
  gap: 13px;
  margin-top: 7px;
}

.title-row h2 { margin-top: 0; }

/* 快速续局：推到标题行右端，窄屏换行（见媒体查询） */
.quick-continue {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: none;
  padding: 8px 14px;
  border-radius: 5px;
  border: 1px solid rgba(215, 166, 87, 0.4);
  color: var(--accent-bright);
  background: rgba(215, 166, 87, 0.08);
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, transform 0.12s ease;
}

.quick-continue:hover {
  border-color: var(--accent-bright);
  background: rgba(215, 166, 87, 0.16);
  transform: translateY(-1px);
}

.slime-buddy {
  width: 42px;
  flex: none;
  animation: slimeSquash 2.8s ease-in-out infinite;
  transform-origin: 50% 100%;
  filter: drop-shadow(0 5px 12px rgba(142, 173, 131, 0.3));
}

@keyframes slimeSquash {
  0%, 100% { transform: scale(1, 1); }
  45% { transform: scale(1.07, 0.9); }
  70% { transform: scale(0.97, 1.05); }
}

.start-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 54px;
  padding-bottom: 22px;
  border-bottom: 1px solid var(--border);
}

.start-header h1 {
  font-size: 20px;
  letter-spacing: 0;
}

.start-header h1 span {
  display: block;
  margin-top: 3px;
  color: var(--text-faint);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0;
}

.market-link,
.account-link,
.profile-link,
.back-link,
.playstyle-option,
.mode-option,
.runner-mode-card,
.difficulty-options button,
.config-actions button {
  font: inherit;
  cursor: pointer;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.market-link,
.account-link,
.profile-link {
  min-height: 36px;
  padding: 0 14px;
  border-radius: 5px;
}

.market-link {
  border: 1px solid rgba(215, 166, 87, 0.34);
  color: var(--accent-bright);
  background: rgba(215, 166, 87, 0.07);
}

.market-link:hover { border-color: rgba(236, 196, 119, 0.54); background: rgba(215, 166, 87, 0.12); }

.account-link,
.profile-link {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border);
  color: rgba(244, 238, 230, 0.68);
  background: transparent;
}

.account-link span {
  color: rgba(244, 238, 230, 0.38);
  font-size: 10px;
}

.account-link.online span {
  color: #7fd18a;
}

.account-link b {
  max-width: 118px;
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-link span { color: #b98747; font-size: 12px; }
.profile-link b { font-size: 11px; }
.account-link:hover,
.profile-link:hover {
  border-color: rgba(215, 166, 87, 0.38);
  color: #fffaf2;
  background: rgba(215, 166, 87, 0.055);
}

.mode-view,
.config-view {
  padding-top: 54px;
}

.view-heading,
.config-heading {
  max-width: 650px;
}

.view-heading p,
.config-heading p {
  color: var(--accent);
  font-size: 11px;
  font-weight: 800;
}

.view-heading h2,
.config-heading h2 {
  margin-top: 7px;
  font-size: 29px;
  letter-spacing: 0;
}

.view-heading > span,
.config-heading > span {
  display: block;
  margin-top: 7px;
  color: var(--text-muted);
  font-size: 13px;
}

.section-kicker {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  font: inherit;
}

.section-kicker .back-arrow {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: none;
  border: 1px solid var(--border);
  border-radius: 5px;
  color: rgba(244, 238, 230, 0.74);
  background: transparent;
  transition: border-color 0.14s ease, color 0.14s ease, background 0.14s ease;
}

.section-kicker .kicker-label {
  color: var(--accent);
  font-size: 11px;
  font-weight: 800;
}

.section-kicker:hover .back-arrow {
  border-color: rgba(215, 166, 87, 0.45);
  color: var(--accent-bright);
  background: rgba(215, 166, 87, 0.07);
}

.section-kicker.runner .kicker-label { color: #79d5e6; }
.section-kicker.runner:hover .back-arrow {
  border-color: rgba(121, 213, 230, 0.5);
  color: #79d5e6;
  background: rgba(121, 213, 230, 0.07);
}

.playstyle-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 34px;
}

.playstyle-option {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 330px;
  flex-direction: column;
  padding: 28px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-left: 3px solid var(--playstyle-accent);
  border-radius: 6px;
  color: inherit;
  background: rgba(18, 16, 13, 0.86);
  text-align: left;
  transition: border-color 0.14s ease, background 0.14s ease, transform 0.08s ease;
}

.playstyle-option:hover {
  border-color: var(--playstyle-accent);
  background: rgba(24, 21, 17, 0.94);
}

.playstyle-option:active { transform: scale(0.99); }

.playstyle-option[data-playstyle='runner'] {
  background: rgba(14, 23, 26, 0.78);
}

.playstyle-option[data-playstyle='runner']:hover {
  background: rgba(17, 30, 34, 0.9);
}

.playstyle-option[data-playstyle='tower-defense'] {
  background: rgba(14, 26, 18, 0.82);
}

.playstyle-option[data-playstyle='tower-defense']:hover {
  background: rgba(18, 36, 23, 0.92);
}

.playstyle-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.playstyle-index,
.playstyle-kicker {
  color: var(--playstyle-accent);
  font-size: 10px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.playstyle-kicker {
  color: rgba(244, 238, 230, 0.46);
  font-weight: 700;
}

.playstyle-title-row {
  display: flex;
  align-items: center;
  gap: 13px;
  margin-top: 38px;
}

.playstyle-icon {
  flex: none;
  color: var(--playstyle-accent);
}

.playstyle-title-row h3 {
  margin: 0;
  font-size: 25px;
}

.playstyle-option > p {
  max-width: 390px;
  margin-top: 14px;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.7;
}

.playstyle-detail {
  margin-top: 18px;
  color: rgba(244, 238, 230, 0.42);
  font-size: 10px;
}

.playstyle-enter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: auto;
  padding-top: 24px;
  color: var(--playstyle-accent);
  font-size: 12px;
  font-weight: 800;
}

.playstyle-enter svg,
.mode-enter svg,
.runner-card-action svg {
  flex: none;
  transition: transform 0.14s ease;
}

.playstyle-option:hover .playstyle-enter svg,
.mode-option:not(.locked):hover .mode-enter svg,
.runner-mode-card:hover .runner-card-action svg {
  transform: translateX(3px);
}

.subtype-view { padding-top: 42px; }

.mode-grid {
  display: grid;
  grid-template-columns: repeat(var(--mode-count), minmax(0, 1fr));
  gap: 12px;
  margin-top: 34px;
}

.mode-grid.single {
  grid-template-columns: minmax(0, 520px);
}

.mode-option {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 292px;
  padding: 22px;
  text-align: left;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: inherit;
  background: var(--surface);
  transition: border-color 0.16s ease, background 0.16s ease, transform 0.14s ease, box-shadow 0.2s ease;
}

.mode-option:not(.locked):hover {
  border-color: rgba(215, 166, 87, 0.55);
  background: var(--surface-hover);
  transform: translateY(-4px);
  box-shadow: 0 16px 32px rgba(0, 0, 0, 0.45);
}

.mode-option:not(.locked):active { transform: translateY(-1px) scale(0.99); }

/* 锁卡悬停：边框透出模式色，暗示「点一下有信息」 */
.mode-option.locked:hover {
  border-color: color-mix(in srgb, var(--mode-accent) 48%, var(--border));
  background: rgba(20, 18, 14, 0.85);
}

/* 当前推荐卡：呼吸金光 + 角标 */
.mode-option.featured { border-color: rgba(236, 196, 119, 0.6); }
.mode-option.featured { animation: cardBreathe 2.4s ease-in-out infinite; }
@keyframes cardBreathe {
  0%, 100% { box-shadow: 0 0 0 0 rgba(236, 196, 119, 0); }
  50% { box-shadow: 0 0 24px 2px rgba(236, 196, 119, 0.25); }
}

.mode-feature-badge {
  position: absolute;
  top: -10px;
  left: 16px;
  padding: 3px 9px;
  border-radius: 4px;
  color: #24180a;
  background: linear-gradient(135deg, #ecc477, #d7a657);
  font-size: 9px;
  font-weight: 800;
  box-shadow: 0 4px 14px rgba(215, 166, 87, 0.4);
}

/* 锁卡被点击时「摇头」 */
.mode-option.shaking { animation: cardShake 0.55s ease; }
@keyframes cardShake {
  0%, 100% { transform: translateX(0); }
  15% { transform: translateX(-8px); }
  30% { transform: translateX(7px); }
  45% { transform: translateX(-5px); }
  60% { transform: translateX(4px); }
  75% { transform: translateX(-2px); }
}

/* 锁卡右上角小锁角标 */
.mode-corner-lock {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  color: var(--faint);
}

.mode-corner-lock svg { width: 13px; height:13px; }

.mode-option:hover {
  border-color: rgba(215, 166, 87, 0.5);
  background: var(--surface-hover);
}

.mode-option:active { transform: scale(0.99); }
.mode-option:focus-visible,
.playstyle-option:focus-visible,
.runner-mode-card:focus-visible,
.market-link:focus-visible,
.account-link:focus-visible,
.profile-link:focus-visible,
.back-link:focus-visible,
.difficulty-options button:focus-visible,
.config-actions button:focus-visible { outline: 2px solid var(--accent-bright); outline-offset: 3px; }

.mode-index {
  color: var(--mode-accent, #b98747);
  font-size: 11px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.mode-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 24px;
}

.mode-title-row h3 {
  margin: 0;
  font-size: 20px;
  letter-spacing: 0;
}

.mode-icon {
  width: 24px;
  height: 24px;
  flex: none;
  color: var(--mode-accent, var(--accent-bright));
  filter: drop-shadow(0 2px 6px rgba(236, 196, 119, 0.22));
}

.mode-option p {
  min-height: 44px;
  margin-top: 9px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.65;
}

/* 模式标签：描述下方，锁卡用模式色（color-mix 派生） */
.mode-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 14px;
}

.mode-chips i {
  font-style: normal;
  font-size: 9.5px;
  padding: 3px 8px;
  border-radius: 20px;
  color: rgba(244, 238, 230, 0.78);
  border: 1px solid rgba(215, 166, 87, 0.22);
  background: var(--accent-soft);
}

.mode-option.locked .mode-chips i {
  color: rgba(244, 238, 230, 0.72);
  border-color: color-mix(in srgb, var(--mode-accent) 32%, transparent);
  background: color-mix(in srgb, var(--mode-accent) 12%, transparent);
}

/* 空成绩：鼓励文案代替冷冰冰的「—」 */
.empty-dd {
  color: var(--text-faint) !important;
  font-size: 11px !important;
  font-weight: 700 !important;
}

/* 锁卡条件 toast（横幅，不遮挡卡片） */
.lock-toast {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  padding: 11px 16px;
  border-radius: 7px;
  border: 1px solid rgba(215, 166, 87, 0.5);
  background: rgba(215, 166, 87, 0.1);
  color: var(--accent-bright);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.lock-toast-icon { width: 18px; height: 18px; flex: none; }
.toast-enter-active { animation: toastIn 0.3s ease; }
.toast-leave-active { animation: toastIn 0.25s ease reverse; }
@keyframes toastIn {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

.mode-option dl {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 28px;
  padding-top: 14px;
  border-top: 1px solid rgba(238, 214, 180, 0.1);
}

.mode-option dt {
  color: var(--text-faint);
  font-size: 9px;
}

.mode-option dd {
  margin-top: 4px;
  color: var(--accent-bright);
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.mode-option dt small {
  margin-left: 4px;
  color: rgba(244, 238, 230, 0.3);
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 0;
}

.mode-option.locked {
  cursor: pointer;
  opacity: 0.9;
  filter: saturate(0.65);
  background: rgba(18, 16, 13, 0.7);
}

.mode-locked-note {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 46px;
  margin-top: 28px;
  padding-top: 14px;
  border-top: 1px solid rgba(238, 214, 180, 0.1);
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.45;
}

.mode-lock-icon {
  width: 18px;
  height: 18px;
  flex: none;
  color: rgba(244, 238, 230, 0.45);
}

.mode-enter {
  display: flex;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 22px;
  color: var(--accent-bright);
  font-size: 12px;
  font-weight: 800;
}

.mode-option:not(.locked):hover .mode-enter {
  text-decoration: underline;
  text-underline-offset: 4px;
  text-decoration-color: rgba(236, 196, 119, 0.55);
}

/* 解锁面板：三节点步骤条 + 三段进度格 */
.unlock-panel {
  margin-top: 15px;
  padding: 17px 18px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: rgba(215, 166, 87, 0.045);
}

.unlock-stepper { display: flex; align-items: flex-start; }

.unlock-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: none;
  width: 120px;
}

.unlock-dot {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: #17140f;
  color: var(--faint);
}

.unlock-step b { font-size: 12px; }
.unlock-step i { font-style: normal; font-size: 9px; color: var(--faint); text-align: center; line-height: 1.3; }

.unlock-step.done .unlock-dot {
  border-color: var(--green);
  color: var(--green);
  background: rgba(127, 209, 138, 0.1);
}

.unlock-step.current .unlock-dot {
  border-color: var(--accent-bright);
  color: var(--accent-bright);
  background: rgba(215, 166, 87, 0.14);
  animation: dotPulse 2s infinite;
}
.unlock-step.current b { color: var(--accent-bright); }
.unlock-step.current i { color: var(--accent); }

@keyframes dotPulse {
  0% { box-shadow: 0 0 0 0 rgba(236, 196, 119, 0.45); }
  70% { box-shadow: 0 0 0 11px rgba(236, 196, 119, 0); }
  100% { box-shadow: 0 0 0 0 rgba(236, 196, 119, 0); }
}

.unlock-link {
  flex: 1;
  position: relative;
  height: 2px;
  margin: 16px 6px 0;
  background: rgba(238, 214, 180, 0.14);
}

.unlock-link span {
  position: absolute;
  top: -9px;
  left: 50%;
  transform: translateX(-50%);
  padding: 0 7px;
  background: #15120e;
  color: var(--faint);
  font-size: 8.5px;
}

.unlock-link.filled { background: linear-gradient(90deg, var(--green), #6fb87a); }
.unlock-link.filled span { color: var(--green); }

.unlock-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 15px;
  color: var(--text-muted);
  font-size: 11px;
  flex-wrap: wrap;
}

.unlock-footer b { flex: none; color: var(--accent-bright); font-size: 11px; }
.unlock-footer i { font-style: normal; }

.unlock-segs { display: flex; gap: 5px; width: 120px; flex: none; }
.unlock-segs i { flex: 1; height: 7px; border-radius: 3px; background: rgba(238, 214, 180, 0.12); }
.unlock-segs i.fill { background: linear-gradient(90deg, #b98747, #ecc477); }

.runner-mode-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 34px;
}

.runner-mode-card {
  display: flex;
  min-width: 0;
  min-height: 292px;
  flex-direction: column;
  padding: 22px;
  border: 1px solid rgba(121, 213, 230, 0.18);
  border-radius: 6px;
  color: inherit;
  background: rgba(14, 24, 29, 0.74);
  text-align: left;
  transition: border-color 0.14s ease, background 0.14s ease, transform 0.08s ease;
}

.runner-mode-card:hover {
  border-color: rgba(121, 213, 230, 0.62);
  background: rgba(18, 33, 39, 0.9);
}

.runner-mode-card:active { transform: scale(0.99); }

.runner-mode-card.featured {
  border-color: rgba(215, 166, 87, 0.38);
  background: rgba(27, 28, 25, 0.84);
}

.runner-mode-card.featured:hover {
  border-color: rgba(236, 196, 119, 0.68);
  background: rgba(34, 33, 27, 0.92);
}

.runner-card-top {
  display: flex;
  align-items: center;
  min-height: 24px;
  gap: 9px;
}

.runner-card-index {
  margin-right: auto;
  color: #79d5e6;
  font-size: 10px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.runner-mode-icon { color: #79d5e6; }
.runner-mode-card.featured .runner-mode-icon,
.runner-mode-card.featured .runner-card-index { color: var(--accent-bright); }

.runner-recommend-tag {
  font-size: 10px;
  font-weight: 800;
  color: var(--accent-bright);
  border: 1px solid rgba(236, 196, 119, 0.32);
  padding: 2px 6px;
  border-radius: 3px;
}

.runner-mode-card h3 {
  margin: 25px 0 0;
  color: var(--text);
  font-size: 20px;
}

.runner-card-kicker {
  margin: 7px 0 0;
  color: rgba(244, 238, 230, 0.5);
  font-size: 10px;
  font-weight: 600;
}

.runner-card-desc {
  margin: 13px 0 0;
  font-size: 12px;
  line-height: 1.65;
  color: var(--text-muted);
  flex: 1;
}

.runner-card-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 20px;
  padding-top: 15px;
  border-top: 1px solid rgba(121, 213, 230, 0.13);
  color: #8bdded;
  font-size: 12px;
  font-weight: 800;
}

.runner-mode-card.featured .runner-card-action { color: var(--accent-bright); }

@media (max-width: 680px) {
  .runner-mode-grid {
    grid-template-columns: 1fr;
  }
}

.config-view {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding-top: 18px;
}

.config-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  margin-right: -12px;
  padding-right: 12px;
  padding-bottom: 2px;
  scrollbar-width: thin;
  scrollbar-color: #494735 transparent;
}

.config-kicker {
  display: flex;
  align-items: center;
  gap: 10px;
}

.config-kicker p { margin: 0; color: #b19b75; font-size: 11px; }
.config-kicker > span { color: #5f5b50; font-size: 13px; }
.config-kicker h2 { margin: 0; font-size: 21px; }

.back-link {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: none;
  border: 1px solid var(--border);
  border-radius: 5px;
  color: rgba(244, 238, 230, 0.74);
  background: transparent;
  font-size: 16px;
  transition: border-color 0.14s ease, color 0.14s ease, background 0.14s ease, transform 0.08s ease;
}

.back-link:hover {
  border-color: rgba(215, 166, 87, 0.45);
  color: var(--accent-bright);
  background: rgba(215, 166, 87, 0.07);
}

.back-link:active { transform: scale(0.96); }

.config-intro {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(238, 214, 180, 0.11);
}

.config-heading { display: flex; align-items: flex-start; gap: 14px; min-width: 0; flex: 1; }
.config-heading .back-link { margin-top: 2px; }
.config-mode-copy { min-width: 0; }
.config-mode-details { margin-top: 6px; color: #959184; font-size: 10px; line-height: 1.7; }
.config-mode-details summary { cursor: pointer; }
.config-mode-details summary::marker { color: #aa9167; font-size: 9px; }
.config-mode-details summary:focus-visible { outline: 2px solid var(--accent-bright); outline-offset: 3px; }
.config-mode-details p { max-width: 460px; margin: 8px 0 0; color: #aaa493; font-size: 11px; }

.config-record {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  grid-template-rows: auto auto;
  width: 380px;
  flex: none;
  align-items: end;
  column-gap: 20px;
  padding-left: 22px;
  border-left: 1px solid var(--border);
}

.config-record > span {
  grid-column: 1;
  color: var(--text-faint);
  font-size: 10px;
}

.config-record > strong {
  grid-column: 1;
  margin-top: 5px;
  color: var(--accent-bright);
  font-size: 19px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.config-record dl {
  grid-column: 2;
  grid-row: 1 / 3;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}

.config-record dt {
  color: var(--text-faint);
  font-size: 10px;
}

.config-record dd {
  margin-top: 3px;
  color: rgba(244, 238, 230, 0.78);
  font-size: 11px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.config-flow {
  display: grid;
  gap: 24px;
  margin-top: 14px;
}

.public-board {
  margin-top: 22px;
  padding: 14px 0 3px;
  border-top: 1px solid rgba(238, 214, 180, 0.11);
}

.public-board.empty { padding: 11px 0; }

.public-board .step-heading {
  margin-bottom: 10px;
}

.public-board-list {
  display: grid;
  gap: 5px;
}

.public-board-row {
  display: grid;
  grid-template-columns: 46px 112px minmax(0, 1fr) 58px;
  align-items: center;
  min-height: 34px;
  gap: 11px;
  padding: 0 10px;
  border: 1px solid rgba(238, 214, 180, 0.09);
  border-radius: 5px;
  color: rgba(244, 238, 230, 0.64);
  background: rgba(255, 255, 255, 0.018);
  font-size: 11px;
}

.public-board-row.current {
  border-color: rgba(236, 196, 119, 0.42);
  background: rgba(215, 166, 87, 0.08);
}

.public-board-row span {
  color: rgba(236, 196, 119, 0.72);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.public-board-row b {
  color: var(--accent-bright);
  text-align: right;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.public-board-row i {
  overflow: hidden;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.public-board-row em {
  color: rgba(244, 238, 230, 0.42);
  font-style: normal;
  text-align: right;
}

/* 空态折叠成一行：标题 + 一句话，不再占大块高度 */
.public-board-empty {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin: 0;
  font-size: 11px;
  line-height: 1.6;
}

.public-board-empty b {
  flex: none;
  color: rgba(255, 250, 243, 0.9);
  font-size: 12px;
}

.public-board-empty span { color: rgba(244, 238, 230, 0.42); }

.public-board-hint {
  margin-top: 9px;
  color: rgba(244, 238, 230, 0.48);
  font-size: 11px;
  line-height: 1.6;
}

.public-board-hint code {
  color: rgba(236, 196, 119, 0.88);
  font-family: inherit;
}

.config-step {
  min-width: 0;
}

.step-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 9px;
}

.step-heading b {
  color: rgba(255, 250, 243, 0.96);
  font-size: 13px;
}

.step-heading span {
  overflow: hidden;
  color: rgba(244, 238, 230, 0.48);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.difficulty-options {
  display: grid;
  grid-template-columns: repeat(var(--difficulty-count), minmax(0, 1fr));
  gap: 3px;
  width: 100%;
  padding: 3px;
  border: 1px solid rgba(238, 214, 180, 0.12);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.018);
}

.difficulty-options button {
  position: relative;
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
  color: rgba(244, 238, 230, 0.76);
  text-align: left;
  transition: border-color 0.14s ease, background 0.14s ease, color 0.14s ease, transform 0.08s ease;
}

.difficulty-options button {
  min-height: 48px;
  padding: 8px 13px;
  border: 0;
  border-radius: 4px;
  background: transparent;
}

.difficulty-options button:hover {
  color: #fffaf2;
  background: var(--surface-hover);
}

/* 锁定难度：灰卡 + 小锁图标，可见但不可选 */
.difficulty-options button.locked {
  opacity: 0.48;
  cursor: not-allowed;
}

.difficulty-options button.locked:hover {
  color: rgba(244, 238, 230, 0.66);
  background: transparent;
}

.diff-lock-icon {
  width: 15px;
  height: 15px;
  flex: none;
  color: rgba(244, 238, 230, 0.42);
}

.difficulty-options button:active,
.config-actions button:active { transform: scale(0.98); }

.difficulty-options button.selected {
  color: #fff9ef;
  background: var(--accent-soft);
}

.difficulty-options button.selected {
  box-shadow: inset 0 0 0 1px rgba(236, 196, 119, 0.48);
}

.option-copy {
  min-width: 0;
  flex: 1;
}

.option-copy b,
.option-copy i {
  display: block;
}

.option-copy b {
  overflow: hidden;
  color: inherit;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.option-copy i {
  overflow: hidden;
  margin-top: 4px;
  color: rgba(244, 238, 230, 0.54);
  font-size: 10px;
  font-style: normal;
  line-height: 1.4;
}

button.selected .option-copy i {
  color: rgba(255, 244, 228, 0.74);
}

.choice-indicator {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  flex: none;
  border-radius: 50%;
  color: #24180a;
  background: var(--accent-bright);
  font-size: 10px;
  font-weight: 900;
  opacity: 0;
  transform: scale(0.84);
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.selected > .choice-indicator {
  opacity: 1;
  transform: scale(1);
}

/* The action area is outside the content scroller, so it cannot cover choices. */
.config-actions {
  position: relative;
  flex: none;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 18px;
  padding: 10px 12px 10px 18px;
  border: 1px solid rgba(238, 214, 180, 0.2);
  border-radius: 8px;
  background: #15140f;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
}

.config-summary {
  display: flex;
  align-items: baseline;
  min-width: 0;
  gap: 8px;
  margin: 0;
  font-size: 12px;
}

.config-summary b { color: var(--accent-bright); }
.config-summary span { color: var(--text-muted); }
.config-summary i { color: var(--text-faint); font-style: normal; }

.config-actions button {
  min-height: 48px;
  padding: 0 27px;
  border-radius: 5px;
  font-size: 13px;
  font-weight: 800;
  transition: color 0.14s ease, background 0.14s ease, border-color 0.14s ease, transform 0.08s ease;
}

.primary-action {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 0 28px;
  border: 1px solid #efca82;
  color: #21170b;
  background: var(--accent);
  font-size: 13px;
}

.primary-action:hover { background: #e3b566; }

@media (max-width: 760px) {
  .start-shell { width: min(100% - 24px, 620px); padding-top: 14px; }
  .start-shell.config-shell { width: min(100% - 24px, 620px); padding-top: 14px; }
  .start-header { padding-bottom: 14px; }
  .header-actions { gap: 6px; }
  .market-link,
  .account-link,
  .profile-link { padding: 0 9px; font-size: 10px; }
  .account-link,
  .profile-link { gap: 5px; }
  .mode-view { padding-top: 34px; }
  .config-view { padding-top: 20px; }
  .config-content { display: flex; flex-direction: column; }
  .playstyle-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 25px; }
  .playstyle-option { min-height: 244px; padding: 23px; }
  .playstyle-title-row { margin-top: 28px; }
  .mode-grid,
  .mode-grid.single { grid-template-columns: 1fr; margin-top: 25px; }
  .mode-option { min-height: 218px; }
  .runner-mode-grid { margin-top: 25px; }
  .runner-mode-card { min-height: 218px; }
  .unlock-panel { padding: 14px 13px; overflow-x: auto; }
  .unlock-step { width: 86px; }
  .unlock-segs { width: 84px; }
  .quick-continue { margin-left: 0; width: 100%; justify-content: center; }
  .title-row { flex-wrap: wrap; }
  .config-intro { display: contents; }
  .config-heading { order: 0; gap: 11px; }
  .config-heading h2 { font-size: 20px; }
  .config-kicker { gap: 8px; }
  .config-record {
    order: 3;
    grid-template-columns: 112px minmax(0, 1fr);
    width: 100%;
    margin-top: 18px;
    padding: 14px 0 0;
    column-gap: 14px;
    border-top: 1px solid var(--border);
    border-left: 0;
  }
  .config-record dl { gap: 8px; }
  .public-board { order: 4; }
  .public-board-empty { flex-wrap: wrap; gap: 4px 12px; }
  .public-board-row { grid-template-columns: 38px 94px minmax(0, 1fr) 48px; gap: 8px; }
  .config-flow { order: 1; gap: 20px; margin-top: 20px; }
  .config-step { padding: 0; }
  .difficulty-options { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .config-actions {
    flex-direction: row;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
    padding: 10px 12px;
  }
  .config-summary { flex-wrap: wrap; gap: 4px 7px; font-size: 11px; }
  .config-summary b { flex-basis: 100%; }
  .config-actions button { flex: none; padding: 0 17px; justify-content: center; }
}

@media (max-width: 540px) {
  .start-header {
    align-items: stretch;
    flex-direction: column;
    gap: 12px;
  }
  .header-actions { width: 100%; }
  .account-link,
  .profile-link { min-width: 0; flex: 1; justify-content: center; }
  .account-link b,
  .profile-link b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .market-link { flex: none; }
}

@media (prefers-reduced-motion: reduce) {
  .playstyle-option,
  .mode-option,
  .runner-mode-card,
  .difficulty-options button,
  .config-actions button { transition: none; }
  .goo-bubble,
  .goo-blob,
  .slime-buddy { animation: none; }
  .goo-bubble { opacity: 0.35; }
}
</style>
