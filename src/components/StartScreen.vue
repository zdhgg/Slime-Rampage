<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Crown,
  Database,
  Gauge,
  Hourglass,
  Info,
  Infinity as InfinityIcon,
  Play,
  Shield,
  Store,
} from 'lucide-vue-next'
import {
  DIFFICULTIES,
  DIFFICULTY_IDS,
  MODE_IDS,
  MODES,
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
import AboutGame from './AboutGame.vue'
import { RUNNER_SUBMODES } from '../game/gameplay/runner/RunnerRules.js'
import arenaCover from '../assets/playstyles/forest-ruins.webp'
import runnerCover from '../assets/playstyles/citadel-run.webp'
import towerCover from '../assets/playstyles/nest-defense.webp'

const emit = defineEmits(['prepare', 'market', 'profiles', 'account', 'storage', 'leaderboard', 'ui-sound', 'runner', 'tower-defense', 'open-leaderboard', 'records', 'resume', 'discard-resume'])
const props = defineProps({
  initialView: { type: String, default: 'playstyles' },
  records: { type: Object, default: () => ({}) },
  progression: {
    type: Object,
    default: () => ({ highestDifficulty: 'normal', highestMode: 'expedition' }),
  },
  preferences: { type: Object, default: () => ({ mode: 'expedition', difficulty: 'normal' }) },
  activeSlot: { type: Object, default: null },
  account: { type: Object, default: null },
  serviceStatus: { type: Object, default: () => ({ checked: false, online: false }) },
  publicLeaderboard: { type: Object, default: null },
  accountData: { type: Object, default: null },
  continuation: { type: Object, default: null },
  resumeBusy: Boolean,
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

/** 战斗卡用不同的亮色识别战斗类型（深色大厅下保持对比度）。 */
const MODE_COLORS = {
  expedition: '#4ade80',
  timed: '#60a5fa',
  endless: '#c084fc',
}

/** 玩法海报卡：全出血插画 + 差异化主题强调色（翡翠 / 冰蓝 / 琥珀）。 */
const PLAYSTYLES = [
  {
    id: 'arena',
    name: '主战场',
    description: '收集宝石，进化专属大招',
    action: '选择战斗',
    cover: arenaCover,
    accent: '#22C55E',
  },
  {
    id: 'runner',
    name: '突围',
    description: '三道冲刺，灵巧躲避障碍',
    action: '选择突围',
    cover: runnerCover,
    accent: '#38BDF8',
  },
  {
    id: 'tower-defense',
    name: '塔防',
    description: '布置史莱姆，守住家园巢心',
    action: '选关守护',
    cover: towerCover,
    accent: '#EAB308',
  },
]

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
const aboutTab = ref('guide')
const aboutLink = ref(null)
const menuRoot = ref(null)
let menuScrollTop = 0

// Hash routes also work on static hosting, without changing game sessions.
async function syncAboutLocation() {
  const route = window.location.hash
  const match = route.match(/^#\/about(?:\/(updates|arena|runner|tower-defense))?$/)
  if (match) {
    if (view.value !== 'about') menuScrollTop = menuRoot.value?.scrollTop || 0
    view.value = 'about'
    aboutTab.value = match[1] === 'updates' ? 'updates' : 'guide'
    await nextTick()
    if (match[1] && match[1] !== 'updates') {
      document.getElementById(`guide-${match[1]}`)?.scrollIntoView({ block: 'start' })
    } else {
      menuRoot.value?.scrollTo({ top: 0 })
    }
  } else if (view.value === 'about') {
    view.value = 'playstyles'
    await nextTick()
    menuRoot.value?.scrollTo({ top: menuScrollTop })
    aboutLink.value?.focus({ preventScroll: true })
  }
}

onMounted(() => {
  syncAboutLocation()
  window.addEventListener('hashchange', syncAboutLocation)
})
onUnmounted(() => window.removeEventListener('hashchange', syncAboutLocation))

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
  MODE_IDS.map((mode) => ({
    mode,
    locked: !isModeUnlocked(props.progression, mode),
    hint: modeUnlockHint(mode),
  }))
)
/** 最新解锁的模式显示挑战角标。 */
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
const accountLabel = computed(() => {
  if (props.account) return props.account.displayName || props.account.username
  if (props.serviceStatus?.online) return '登录 / 注册'
  return props.serviceStatus?.checked ? '连接服务' : '连接中'
})
/* 配置页排行榜预览与右侧记录卡已移除：纪录在结算页与「我的记录」中查看 */
const selectedStrain = computed(() => STRAINS[selection.value.strain] || STRAINS.origin)

/** 难度卡副标题：远征展示关卡数（随难度变化），其余模式只展示战力点倍率。 */
function difficultyMeta(difficulty) {
  const info = DIFFICULTIES[difficulty]
  const reward = `战力点 ×${info.rewardMul}`
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

/**
 * 玩法海报卡右上角毛玻璃徽章：进度/纪录有数据就内聚展示，
 * 突围暂无云端纪录，退化为模式定位标签（后续接入纪录时替换数据源即可）。
 */
const playstyleBadges = computed(() => {
  const campaign = props.accountData?.campaign
  const towerBadge = campaign
    ? `塔防进度 第 ${campaign.unlockedStage || 1} 关 · ${campaign.totalStarsEarned || 0} 星`
    : null
  const arenaBestScore = modeSummaries.value.expedition?.bestScore
    || modeSummaries.value.timed?.bestScore
    || modeSummaries.value.endless?.bestScore
  const arenaBadge = props.account
    ? (arenaBestScore ? `最高分 ${arenaBestScore.toLocaleString('en-US')}` : 'Roguelite 进化')
    : 'Roguelite 进化'
  const runnerBadge = '三轨敏捷生存'
  return { arena: arenaBadge, runner: runnerBadge, 'tower-defense': towerBadge || '战役闯关' }
})

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
  if (!props.account) {
    emit('account')
    return
  }
  if (playstyle === 'tower-defense') {
    emit('tower-defense')
    return
  }
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
  nextTick(() => {
    menuRoot.value?.scrollTo({ top: 0 })
    configBackLink.value?.focus({ preventScroll: true })
  })
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
  if (view.value === 'about') window.location.hash = '/'
  else if (view.value === 'config') showArenaTypes()
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
  <div
    ref="menuRoot"
    class="start-overlay"
    :class="{
      'config-active': view === 'config',
      'hub-night': view === 'playstyles' || view === 'arena-types' || view === 'runner-types' || view === 'config',
    }"
    @keydown.esc="onMenuEscape"
  >
    <main class="start-shell" :class="{ 'config-shell': view === 'config' }">
      <header class="start-header">
        <h1 class="game-brand">
          <svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
            <path d="M10 46C10 29 19 16 32 16s22 13 22 30c0 6-7 9-22 9S10 52 10 46Z" fill="currentColor" />
            <path d="M19 27c3-4 7-6 11-6" fill="none" stroke="#f2f7ed" stroke-opacity=".5" stroke-width="3" stroke-linecap="round" />
            <circle cx="25" cy="39" r="2.7" fill="#152019" /><circle cx="39" cy="39" r="2.7" fill="#152019" />
            <path d="M28 46q4 3 8 0" fill="none" stroke="#152019" stroke-width="2" stroke-linecap="round" />
          </svg>
          <span class="brand-copy">史莱姆大暴走<small>SLIME RAMPAGE</small></span>
        </h1>
        <nav class="header-actions" aria-label="游戏功能">
          <button class="profile-link" @click="emit('open-leaderboard')"><Crown :size="15" :stroke-width="1.7" aria-hidden="true" /><b>排行榜</b></button>
          <button v-if="props.account" class="profile-link" @click="emit('records')"><BarChart3 :size="15" :stroke-width="1.7" aria-hidden="true" /><b>我的记录</b></button>
          <button v-if="props.account" class="profile-link" @click="emit('storage')"><Database :size="15" :stroke-width="1.7" aria-hidden="true" /><b>数据与存档</b></button>
          <a ref="aboutLink" class="about-link" href="#/about" :aria-current="view === 'about' ? 'page' : undefined"><Info :size="15" :stroke-width="1.7" aria-hidden="true" /><span>关于游戏</span></a>
          <button
            v-if="view === 'arena-types' || view === 'config'"
            class="market-link"
            title="主战场 · 永久基因改造"
            @click="emit('market')"
          ><Store :size="15" :stroke-width="1.9" aria-hidden="true" /><b>地下城黑市</b></button>
          <button class="account-link" :class="{ online: props.account }" title="游戏账号" @click="emit('account')">
            <span aria-hidden="true"></span>
            <b>{{ accountLabel }}</b>
          </button>
        </nav>
      </header>

      <div v-if="!props.account && view !== 'about'" class="account-notice">
        <div><strong>登录，继续你的史莱姆旅程</strong><span>每个账号独立保存三种玩法的进度与成绩。</span></div>
        <button @click="emit('account')">登录 / 注册 <ArrowRight :size="15" aria-hidden="true" /></button>
      </div>
      <div v-if="account && continuation && view !== 'about'" class="resume-banner">
        <span class="resume-slime" aria-hidden="true">
          <svg viewBox="0 0 64 64">
            <path d="M10 46C10 29 19 16 32 16s22 13 22 30c0 6-7 9-22 9S10 52 10 46Z" fill="currentColor" />
            <circle cx="25" cy="39" r="2.7" fill="#152019" /><circle cx="39" cy="39" r="2.7" fill="#152019" />
            <path d="M28 46q4 3 8 0" fill="none" stroke="#152019" stroke-width="2" stroke-linecap="round" />
          </svg>
        </span>
        <div class="resume-copy">
          <div class="resume-title-row">
            <strong>{{ continuation.snapshot.gameplay === 'tower-defense' && !continuation.snapshot.endless ? `继续守护 · 第 ${continuation.snapshot.stage} 关` : '继续上次冒险' }}</strong>
            <span class="resume-status-tag"><i aria-hidden="true"></i>进行中 IN PROGRESS</span>
          </div>
          <span class="resume-meta">{{ continuation.snapshot.label }} · {{ new Date(continuation.savedAt).toLocaleString('zh-CN') }}</span>
        </div>
        <div class="resume-actions">
          <button class="resume-primary" :disabled="resumeBusy" @click="emit('resume')">{{ resumeBusy ? '正在恢复…' : '继续行动' }}<Play :size="15" aria-hidden="true" /></button>
          <button class="resume-discard" :disabled="resumeBusy" @click="emit('discard-resume')">放弃</button>
        </div>
      </div>
      <AboutGame v-if="view === 'about'" :tab="aboutTab" />
      <section v-else-if="view === 'playstyles'" class="mode-view playstyle-view" aria-label="选择玩法">

        <div ref="playstyleGrid" class="playstyle-grid">
          <button
            v-for="playstyle in PLAYSTYLES"
            :key="playstyle.id"
            class="playstyle-option"
            :class="{ hero: playstyle.id === 'arena' }"
            :data-playstyle="playstyle.id"
            :style="{ '--playstyle-accent': playstyle.accent }"
            :aria-label="`${playstyle.name}：${playstyle.description} ${playstyle.action}`"
            @click="selectPlaystyle(playstyle.id)"
          >
            <img class="playstyle-art" :src="playstyle.cover" alt="" decoding="async" draggable="false" />
            <span class="playstyle-shade" aria-hidden="true"></span>
            <span v-if="playstyle.id === 'arena'" class="playstyle-feature-tag">🔥 核心模式</span>
            <span class="playstyle-badge">{{ playstyleBadges[playstyle.id] }}</span>
            <span class="playstyle-body">
              <h3>{{ playstyle.name }}</h3>
              <p>{{ playstyle.description }}</p>
              <i class="playstyle-enter">{{ playstyle.action }} <ArrowRight :size="16" :stroke-width="1.8" aria-hidden="true" /></i>
            </span>
          </button>
        </div>
      </section>

      <section v-else-if="view === 'arena-types'" class="mode-view subtype-view" aria-labelledby="arena-mode-title">
        <div class="view-heading subtype-heading">
          <img class="subtype-cover" :src="arenaCover" alt="" />
          <button class="section-kicker" title="返回玩法选择" aria-label="返回玩法选择" @click="showPlaystyleSelection('arena')">
            <span class="back-arrow" aria-hidden="true"><ArrowLeft :size="17" :stroke-width="1.8" /></span>
            <span class="kicker-label">主战场 · ARENA</span>
          </button>
          <div class="title-row">
            <h2 id="arena-mode-title">选择战斗类型</h2>
            <button class="quick-continue" title="按上次规则直接进入战前简报" @click="quickContinue">
              <Play :size="13" :stroke-width="2.1" aria-hidden="true" />
              沿用配置 · {{ selectedMode.name }} {{ selectedDifficulty.name }}
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
                {{ card.locked ? '查看解锁条件' : '选择难度与角色' }}
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
      </section>

      <section v-else-if="view === 'runner-types'" class="mode-view subtype-view runner-view" aria-labelledby="runner-mode-title">
        <div class="view-heading subtype-heading">
          <img class="subtype-cover" :src="runnerCover" alt="" />
          <button class="section-kicker runner" title="返回玩法选择" aria-label="返回玩法选择" @click="showPlaystyleSelection('runner')">
            <span class="back-arrow" aria-hidden="true"><ArrowLeft :size="17" :stroke-width="1.8" /></span>
            <span class="kicker-label">突围 · RUNNER</span>
          </button>
          <div class="title-row">
            <h2 id="runner-mode-title">选择突围类型</h2>
          </div>
          <span>换道、冲锋，在三线战场突破封锁。</span>
        </div>

        <div ref="runnerGrid" class="runner-mode-grid">
          <button
            v-for="sub in runnerSubmodesList"
            :key="sub.id"
            class="runner-mode-card"
            :class="{ featured: sub.id === 'marathon' }"
            @click="startRunnerWithSubmode(sub.id)"
          >
            <div class="runner-card-top">
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
          </div>

          <div class="config-flow">
            <StrainSelect :model-value="selection.strain" @update:model-value="selectStrain" />
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
        </div>

        <!-- 独立底部操作区：内容在上方滚动，不遮挡角色与排行榜。 -->
        <div class="config-actions">
          <p class="config-summary">
            <b>{{ selectedMode.name }}</b>
            <span>{{ selectedDifficulty.name }}</span>
            <i aria-hidden="true">·</i>
            <span class="summary-strain">{{ selectedStrain.name }}</span>
            <span v-if="selectedStrain.id === 'elemental'">Lv.2 学习法术</span>
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
/* —— 登录提示（未登录）：子页亮色基底 —— */
.account-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-top: 20px;
  padding: 16px 20px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
}
.account-notice strong, .account-notice span { display: block; }
.account-notice strong { color: var(--text); font-size: 14px; font-weight: 650; }
.account-notice span { margin-top: 4px; color: var(--text-muted); font-size: 12px; }
.account-notice button {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--accent-bright);
  border-radius: 8px;
  background: var(--accent-bright);
  color: #fff;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

/* 大厅夜林下的登录提示：玻璃卡 + 翡翠 CTA */
.hub-night .account-notice {
  border: 2px solid rgba(255, 255, 255, 0.95);
  border-radius: var(--hub-radius);
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  box-shadow: 0 8px 24px rgba(16, 185, 129, 0.08);
}
.hub-night .account-notice strong { color: var(--hub-text); }
.hub-night .account-notice span { color: var(--hub-text-muted); }
.hub-night .account-notice button {
  border-color: transparent;
  background: linear-gradient(135deg, #22C55E 0%, #10B981 100%);
  box-shadow: 0 4px 0 #059669, 0 8px 16px rgba(16, 185, 129, 0.3);
}
.hub-night .account-notice button:hover { transform: translateY(-1px); }
.hub-night .account-notice button:active { transform: translateY(2px); box-shadow: 0 2px 0 #059669, 0 4px 8px rgba(16, 185, 129, 0.25); }

/* —— 续玩恢复卡（Resume Banner）：紧凑单行布局，左侧状态徽标 + 右侧并排按钮 —— */
.resume-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 20px;
  padding: 14px 18px;
  border: 1px solid #bcd4c3;
  border-radius: 12px;
  background: linear-gradient(120deg, #eef6ef, var(--adventure-paper) 70%);
  box-shadow: 0 3px 12px #26332e14;
}
.resume-slime {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: 12px;
  color: #2d624d;
  background: #dcecdf;
}
.resume-slime svg { width: 30px; height: 30px; }
.resume-copy { min-width: 0; flex: 1; }
.resume-title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; }
.resume-title-row strong { color: var(--adventure-ink); font-size: 15px; font-weight: 750; }
.resume-status-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #dcecdf;
  color: #2d624d;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  white-space: nowrap;
}
.resume-status-tag i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 8px #22c55e;
  animation: statusBreath 1.8s ease-in-out infinite;
}
.resume-meta {
  display: block;
  margin-top: 4px;
  color: var(--adventure-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.resume-actions { display: flex; align-items: center; gap: 12px; flex: none; }
.resume-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 22px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  background: linear-gradient(135deg, #22C55E 0%, #10B981 100%);
  color: #fff;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 4px 0 #059669, 0 8px 16px rgba(16, 185, 129, 0.3);
  position: relative;
  overflow: hidden;
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}
/* 扫光效果：hover 时一道高光掠过按钮 */
.resume-primary::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -70%;
  width: 45%;
  border-radius: inherit;
  background: linear-gradient(105deg, transparent, rgba(255, 255, 255, 0.32), transparent);
  transform: skewX(-18deg);
  transition: left 0.45s ease;
  pointer-events: none;
}
.resume-primary:hover:not(:disabled) {
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 6px 0 #059669, 0 12px 22px rgba(16, 185, 129, 0.38);
}
.resume-primary:active:not(:disabled) { transform: translateY(3px) scale(0.99); box-shadow: 0 1px 0 #059669, 0 3px 8px rgba(16, 185, 129, 0.25); }
.resume-primary:hover:not(:disabled)::after { left: 125%; }
.resume-primary:disabled { opacity: 0.7; cursor: default; }
.resume-discard {
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid #c3d2c8;
  border-radius: 10px;
  background: transparent;
  color: var(--adventure-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.14s ease, border-color 0.14s ease, background 0.14s ease;
}
.resume-discard:hover:not(:disabled) { color: var(--adventure-danger); border-color: var(--adventure-danger-line); background: var(--adventure-danger-paper); }
.resume-discard:disabled { opacity: 0.55; cursor: default; }

/* 大厅晴空下的续玩卡：薄荷奶油悬浮卡 + 翡翠描边 */
.hub-night .resume-banner {
  border: 3px solid #A7F3D0;
  border-radius: var(--hub-radius);
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(var(--glass-blur));
  box-shadow: 0 10px 25px rgba(16, 185, 129, 0.12);
}
.hub-night .resume-slime { background: #D1FAE5; color: #059669; }
.hub-night .resume-title-row strong { color: var(--hub-text); }
.hub-night .resume-status-tag { background: #D1FAE5; color: #047857; }
.hub-night .resume-meta { color: var(--hub-text-muted); }
.hub-night .resume-discard { border-color: #C7DED2; color: var(--hub-text-muted); }
.hub-night .resume-discard:hover:not(:disabled) {
  color: #B45309;
  border-color: #FDE68A;
  background: #FEF3C7;
}

@keyframes statusBreath {
  0%, 100% { opacity: 1; box-shadow: 0 0 8px #22c55e; }
  50% { opacity: 0.55; box-shadow: 0 0 3px #22c55e; }
}

/* ============================================================
 * Game Hub 晴空果冻童话主题（大厅首页）：晨光森林 + 晶莹白框海报卡。
 * 子页（战斗类型/配置/突围/关于）沿用原亮色纸面变量，避免子组件返工。
 * ============================================================ */
.start-overlay {
  /* —— 大厅专用变量（海报卡 / 顶栏 / 续玩卡） —— */
  --hub-radius: 24px;
  --glass-bg: rgba(255, 255, 255, 0.78);
  --glass-border: rgba(255, 255, 255, 0.95);
  --glass-blur: 12px;
  --primary-glow: 0 0 18px rgba(52, 211, 153, 0.3);
  --hub-text: #064E3B;
  --hub-text-muted: #4B6B5E;
  --hub-card-shadow: 0 14px 32px rgba(15, 118, 110, 0.12), 0 4px 10px rgba(0, 0, 0, 0.04);
  --accent: var(--adventure-gold);
  --accent-bright: var(--adventure-green);
  --accent-soft: var(--adventure-leaf);
  --surface: var(--adventure-paper);
  --surface-hover: #f0f4ed;
  --text: var(--adventure-ink);
  --text-muted: var(--adventure-muted);
  --text-faint: var(--adventure-muted);
  --border: var(--adventure-line);
  position: absolute;
  inset: 0;
  z-index: 30;
  overflow-y: auto;
  color: var(--text);
  background: radial-gradient(ellipse at 50% 0%, #fafbf7 0%, transparent 68%), var(--adventure-bg);
}

/* 晴空基底与氛围层只在大厅首页（hub-night）生效，子页恢复原亮色纸面 */
.start-overlay.hub-night {
  color: var(--hub-text);
  background:
    radial-gradient(circle at 15% 15%, rgba(167, 243, 208, 0.55) 0%, transparent 45%),
    radial-gradient(circle at 85% 20%, rgba(186, 230, 253, 0.6) 0%, transparent 45%),
    radial-gradient(circle at 50% 90%, rgba(254, 240, 138, 0.45) 0%, transparent 50%),
    linear-gradient(180deg, #ECFDF5 0%, #F0F9FF 55%, #FEFCE8 100%);
}

/* 氛围层 1：晨光柔焦光晕（浅色天空感，覆盖全屏含下半部） */
.hub-night::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(720px circle at 8% 12%, rgba(255, 255, 255, 0.55), transparent 70%),
    radial-gradient(560px circle at 94% 34%, rgba(255, 255, 255, 0.45), transparent 70%),
    radial-gradient(640px circle at 50% 96%, rgba(254, 240, 138, 0.28), transparent 70%);
}

/* 氛围层 2：薄荷/白色波点星光，全屏铺满更明显 */
.hub-night::after {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-image:
    radial-gradient(circle, rgba(255, 255, 255, 0.7) 1.8px, transparent 2.8px),
    radial-gradient(circle, rgba(110, 231, 183, 0.34) 1.4px, transparent 2.4px),
    radial-gradient(circle, rgba(186, 230, 253, 0.3) 1.2px, transparent 2.2px);
  background-size: 92px 92px, 61px 61px, 74px 74px;
  background-position: 0 0, 26px 36px, 48px 12px;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.75) 55%, rgba(0, 0, 0, 0.45) 100%);
}

/* 大厅节奏收紧：标题行已删，卡片直接顶上 */
.hub-night .mode-view { padding-top: 8px; }
.hub-night .playstyle-grid { margin-top: 14px; }

.start-overlay.config-active { overflow: hidden; }

.start-shell {
  position: relative;
  z-index: 1;
  width: min(1200px, calc(100% - 64px));
  min-height: 100%;
  margin: 0 auto;
  padding: 24px 0 48px;
}

.start-shell.config-shell {
  display: flex;
  flex-direction: column;
  width: min(1180px, calc(100% - 64px));
  height: 100%;
  min-height: 0;
  padding-top: 10px;
  padding-bottom: max(10px, env(safe-area-inset-bottom));
}
.config-shell .start-header { flex: none; min-height: 48px; padding-bottom: 10px; }

.title-row {
  display: flex;
  align-items: center;
  gap: 13px;
  margin-top: 7px;
}

.title-row h2 { margin-top: 0; }

/* 一键沿用配置：薄荷绿高光胶囊，快速开打一眼可见 */
.quick-continue {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: none;
  padding: 9px 16px;
  border-radius: 999px;
  border: 2px solid #6EE7B7;
  color: #047857;
  background: linear-gradient(135deg, #D1FAE5 0%, #A7F3D0 100%);
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 4px 0 rgba(4, 120, 87, 0.16), 0 6px 14px rgba(16, 185, 129, 0.16);
  transition: border-color 0.16s ease, background 0.16s ease, transform 0.14s ease, box-shadow 0.14s ease, filter 0.14s ease;
}

.quick-continue:hover {
  border-color: #34D399;
  filter: brightness(1.04);
  transform: translateY(-1px);
  box-shadow: 0 6px 0 rgba(4, 120, 87, 0.16), 0 10px 20px rgba(16, 185, 129, 0.22);
}

.quick-continue:active { transform: translateY(2px); box-shadow: 0 2px 0 rgba(4, 120, 87, 0.16), 0 3px 8px rgba(16, 185, 129, 0.12); }

.start-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
  min-height: 64px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border);
}

.start-header h1 {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: none;
  font-size: 23px;
  font-weight: 800;
  letter-spacing: 0;
}

.brand-mark {
  width: 40px;
  height: 40px;
  flex: none;
  color: #83aa71;
}

.brand-copy { display: block; line-height: 1.25; }

.start-header h1 .brand-copy small {
  display: block;
  margin-top: 4px;
  color: var(--text-faint);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.15em;
}

/* 大厅晴空下的品牌区：深森林墨绿大标题 + 柔和浅绿投影 + Q 弹徽标 */
.hub-night .brand-mark { color: #34D399; filter: drop-shadow(0 3px 6px rgba(16, 185, 129, 0.35)); }
.hub-night .brand-copy {
  color: #064E3B;
  font-weight: 900;
  text-shadow: 0 2px 0 rgba(167, 243, 208, 0.6);
  background: none;
  -webkit-text-fill-color: currentColor;
}
.hub-night .start-header h1 .brand-copy small {
  color: #0D9488;
  background: none;
  -webkit-text-fill-color: currentColor;
  letter-spacing: 0.15em;
}

/* 大厅晴空下的顶栏：奶油白毛玻璃胶囊导航 */
.hub-night .start-header { border-bottom-color: rgba(110, 231, 183, 0.35); }
.hub-night .header-actions {
  gap: 4px;
  padding: 5px;
  border: 2px solid rgba(255, 255, 255, 0.95);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(12px);
  box-shadow: 0 8px 24px rgba(16, 185, 129, 0.08);
}
.hub-night .profile-link,
.hub-night .about-link { border-radius: 999px; color: #1E3A2F; }
.hub-night .profile-link:hover,
.hub-night .about-link:hover,
.hub-night .about-link[aria-current] {
  color: #064E3B;
  background: #D1FAE5;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.18);
}
.hub-night .account-link {
  border: 2px solid #A7F3D0;
  border-radius: 999px;
  background: #ECFDF5;
  color: #064E3B;
}
.hub-night .account-link:hover { border-color: #6EE7B7; background: #D1FAE5; }
.hub-night .account-link.online span {
  background: #22c55e;
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.65);
  animation: statusBreath 2.2s ease-in-out infinite;
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
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 3px;
}

.about-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 40px;
  padding: 0 11px;
  color: var(--text-muted);
  font-size: 12px;
  text-decoration: none;
  white-space: nowrap;
  border-radius: 5px;
  transition: color 0.14s ease, background 0.14s ease;
}
.about-link:hover, .about-link[aria-current] { color: var(--text); background: var(--accent-soft); }
.about-link:focus-visible { outline: 2px solid var(--accent-bright); outline-offset: 2px; }

.market-link,
.account-link,
.profile-link {
  min-height: 40px;
  padding: 0 11px;
  border-radius: 5px;
}

/* 暖金糖果徽章：琥珀金渐变底 + 深橙描边与文字，带商店小图标 */
.market-link {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 2px solid #F59E0B;
  color: #B45309;
  background: linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%);
  font-size: 12px;
  font-weight: 800;
  box-shadow: 0 3px 0 #D97706, 0 6px 14px rgba(245, 158, 11, 0.22);
  transition: border-color 0.14s ease, filter 0.14s ease, transform 0.14s ease, box-shadow 0.14s ease;
}

.market-link b { font-weight: 800; }
.market-link svg { color: #D97706; }
.market-link:hover { border-color: #D97706; filter: brightness(1.04); transform: translateY(-1px); box-shadow: 0 5px 0 #D97706, 0 9px 18px rgba(245, 158, 11, 0.28); }
.market-link:active { transform: translateY(2px); box-shadow: 0 1px 0 #D97706, 0 3px 8px rgba(245, 158, 11, 0.18); }

.account-link,
.profile-link {
  display: flex;
  align-items: center;
  gap: 7px;
  border: 0;
  color: var(--text-muted);
  background: transparent;
  transition: color 0.14s ease, background 0.14s ease, border-color 0.14s ease;
}

.account-link {
  margin-left: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
}

.account-link span {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: #777e7a;
}

.account-link.online span { background: #83aa71; }

.account-link b {
  max-width: 118px;
  overflow: hidden;
  font-size: 12px;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-link b { font-size: 12px; font-weight: 500; }
.profile-link > svg { color: var(--text-faint); }
.account-link:hover,
.profile-link:hover {
  color: var(--text);
  background: var(--accent-soft);
}
.account-link:hover { border-color: #9fb6a5; }

.mode-view,
.config-view {
  padding-top: 48px;
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
  font-size: 32px;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.view-heading > span,
.config-heading > span {
  display: block;
  margin-top: 9px;
  color: var(--text-muted);
  font-size: 14px;
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

/* 圆润可爱的白色立体返回小圆钮 */
.section-kicker .back-arrow {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex: none;
  border: 2px solid #FFFFFF;
  border-radius: 50%;
  color: #064E3B;
  background: #FFFFFF;
  box-shadow: 0 4px 0 rgba(16, 185, 129, 0.18), 0 6px 14px rgba(16, 185, 129, 0.14);
  transition: border-color 0.14s ease, color 0.14s ease, background 0.14s ease, transform 0.14s ease, box-shadow 0.14s ease;
}

.section-kicker .kicker-label {
  color: #059669;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.section-kicker:hover .back-arrow {
  color: #047857;
  background: #D1FAE5;
  transform: translateY(-1px);
}

.section-kicker:active .back-arrow { transform: translateY(2px); box-shadow: 0 2px 0 rgba(16, 185, 129, 0.18), 0 3px 8px rgba(16, 185, 129, 0.12); }

.section-kicker.runner .kicker-label { color: var(--adventure-slate); }
.section-kicker.runner:hover .back-arrow {
  border-color: #a7bad0;
  color: var(--adventure-slate);
  background: #e5edf3;
}

.playstyle-grid {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr;
  gap: 22px;
  margin-top: 18px;
}

/* —— 全出血海报卡（晴空果冻版）：100% 原图明亮 + 白色画框 + 奶油白悬浮信息舱 —— */
.playstyle-option {
  position: relative;
  display: flex;
  min-width: 0;
  /* 竖版海报比例：标题行也删掉后空间全给卡片 */
  height: clamp(460px, calc(100vh - 210px), 680px);
  flex-direction: column;
  justify-content: flex-end;
  padding: 0;
  overflow: hidden;
  border: 4px solid #FFFFFF;
  border-radius: var(--hub-radius);
  color: inherit;
  background: #F0FDFA;
  text-align: left;
  box-shadow: var(--hub-card-shadow);
  transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.3s ease;
}

.playstyle-option.hero {
  box-shadow: 0 14px 32px rgba(16, 185, 129, 0.2), 0 4px 10px rgba(0, 0, 0, 0.04);
}

.playstyle-art {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* 微提亮 + 提饱和：让蓝天白云与果冻史莱姆晶莹剔透 */
  filter: brightness(1.03) saturate(1.08);
  transform: scale(1.001);
  transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}

/* 轻柔彩底渐变：只覆盖底部信息舱高度，上方近 70% 画面完全留给插画 */
.playstyle-shade {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(to top, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0.22) 20%, transparent 34%);
}

/* —— 右上角奖励贴纸徽章：奶油白底 + 主题浓色文字 —— */
.playstyle-badge {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 2;
  max-width: calc(100% - 28px);
  padding: 5px 12px;
  border: 2px solid #FFFFFF;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  color: #047857;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  font-size: 12px;
  font-weight: 750;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.playstyle-option[data-playstyle="tower-defense"] .playstyle-badge { color: #B45309; }
.playstyle-option[data-playstyle="runner"] .playstyle-badge { color: #0369A1; }
.playstyle-option[data-playstyle="arena"] .playstyle-badge { color: #047857; }

/* —— 主战场左上角暖橙贴纸角标：饱和渐变 + 白字描边阴影保证对比 —— */
.playstyle-feature-tag {
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: 2;
  padding: 6px 13px;
  border: 2px solid #FFFFFF;
  border-radius: 999px;
  background: linear-gradient(135deg, #F97316, #FB923C);
  color: #FFFFFF;
  box-shadow: 0 4px 12px rgba(249, 115, 22, 0.4);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.02em;
  text-shadow: 0 1px 2px rgba(154, 52, 18, 0.65);
}

/* —— 底部信息舱（紧凑版）：单行短句 + 收紧内距，只占卡片 28%~32% —— */
.playstyle-body {
  position: relative;
  z-index: 1;
  display: flex;
  min-width: 0;
  width: calc(100% - 20px);
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  margin: 10px;
  margin-top: auto;
  padding: 14px 18px 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(10px);
  box-shadow: 0 6px 18px rgba(15, 118, 110, 0.1);
}

.playstyle-body h3 {
  font-size: clamp(22px, 2.1vw, 26px);
  line-height: 1.25;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #064E3B;
}

.playstyle-body > p {
  margin-bottom: 6px;
  color: #374151;
  font-size: 14px;
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* —— 糖果色立体果冻按钮：主题渐变 + 底部厚度阴影 + 内高光 + Q 弹按压 —— */
.playstyle-enter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  width: 100%;
  margin-top: 4px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  color: #FFFFFF;
  font-size: 14px;
  font-weight: 800;
  font-style: normal;
  text-shadow: 0 1px 2px rgba(0, 60, 40, 0.5), 0 0 4px rgba(0, 60, 40, 0.3);
  background: linear-gradient(135deg, #22C55E 0%, #10B981 100%);
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.35), 0 5px 0 #047857, 0 10px 18px rgba(16, 185, 129, 0.32);
  transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
}
.playstyle-option[data-playstyle="runner"] .playstyle-enter {
  background: linear-gradient(135deg, #38BDF8 0%, #0EA5E9 100%);
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.35), 0 5px 0 #075985, 0 10px 18px rgba(14, 165, 233, 0.32);
}
.playstyle-option[data-playstyle="tower-defense"] .playstyle-enter {
  background: linear-gradient(135deg, #FBBF24 0%, #F59E0B 100%);
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.3), 0 4px 0 #D97706, 0 8px 16px rgba(245, 158, 11, 0.28);
}

/* —— Hover 微动效：整卡上浮 + 插画缓放 + 果冻按钮弹起（幅度加大到儿童可感知） —— */
.playstyle-option:is(:hover, :focus-visible) {
  transform: translateY(-10px);
  box-shadow: 0 26px 48px rgba(15, 118, 110, 0.24), 0 10px 20px rgba(0, 0, 0, 0.07);
}
.playstyle-option:is(:hover, :focus-visible) .playstyle-art { transform: scale(1.08); }
.playstyle-option:is(:hover, :focus-visible) .playstyle-enter {
  transform: translateY(-3px) scale(1.03);
  filter: brightness(1.12);
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.35), 0 8px 0 #047857, 0 16px 28px rgba(16, 185, 129, 0.42);
}
.playstyle-option:is(:hover, :focus-visible)[data-playstyle="runner"] .playstyle-enter {
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.35), 0 8px 0 #075985, 0 16px 28px rgba(14, 165, 233, 0.42);
}
.playstyle-option:is(:hover, :focus-visible)[data-playstyle="tower-defense"] .playstyle-enter {
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.3), 0 7px 0 #D97706, 0 14px 26px rgba(245, 158, 11, 0.4);
}
.playstyle-option:active .playstyle-art { transform: scale(1.03); }
.playstyle-option:active .playstyle-enter { transform: translateY(3px) scale(0.99); filter: none; box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.25), 0 2px 0 #047857, 0 4px 10px rgba(16, 185, 129, 0.22); }
.playstyle-option:active[data-playstyle="runner"] .playstyle-enter { box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.25), 0 2px 0 #075985, 0 4px 10px rgba(14, 165, 233, 0.22); }
.playstyle-option:active[data-playstyle="tower-defense"] .playstyle-enter { box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.2), 0 1px 0 #D97706, 0 3px 8px rgba(245, 158, 11, 0.2); }

.playstyle-enter svg { flex: none; transition: transform 0.2s ease; }
.playstyle-option:is(:hover, :focus-visible) .playstyle-enter svg { transform: translateX(3px); }

.mode-enter svg,
.runner-card-action svg {
  flex: none;
  transition: transform 0.14s ease;
}

.mode-option:not(.locked):hover .mode-enter svg,
.runner-mode-card:hover .runner-card-action svg {
  transform: translateX(3px);
}

.subtype-view { padding-top: 24px; }

/* 主题横幅：晶莹白框毛玻璃卡片，左文右图渐隐 */
.subtype-heading {
  position: relative;
  isolation: isolate;
  max-width: none;
  overflow: hidden;
  min-height: 178px;
  padding: 24px 26px;
  border: 3px solid #FFFFFF;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(10px);
  box-shadow: 0 12px 30px rgba(16, 185, 129, 0.1);
}

.subtype-heading .title-row { justify-content: flex-start; flex-wrap: wrap; margin-top: 14px; }
.subtype-heading .title-row h2 { font-size: clamp(24px, 3vw, 37px); font-weight: 800; color: #064E3B; }
.subtype-heading > span { color: #059669; font-weight: 550; }
.subtype-heading .quick-continue { margin-left: 0; }
.subtype-cover {
  position: absolute;
  z-index: -1;
  inset: 0 0 0 auto;
  width: 48%;
  height: 100%;
  object-fit: cover;
  object-position: 55% 46%;
  filter: brightness(1.04) saturate(1.06);
  mask-image: linear-gradient(90deg, transparent 3%, black 49%);
}

@media (max-width: 840px) {
  .subtype-cover { width: 44%; mask-image: linear-gradient(90deg, transparent 6%, #0008 58%); }
  .subtype-heading { padding: 18px; }
}

@media (max-width: 540px) {
  .subtype-cover { width: 54%; mask-image: linear-gradient(90deg, transparent 8%, #0004 62%); }
  .subtype-heading .quick-continue { width: fit-content; }
}

/* —— 模式卡（晴空果冻版）：白框大圆角 + 主题色顶部微光 —— */
.mode-grid,
.runner-mode-grid {
  display: grid;
  grid-template-columns: repeat(var(--mode-count, 3), minmax(0, 1fr));
  gap: 18px;
  margin-top: 18px;
}

.mode-grid.single { grid-template-columns: minmax(0, 520px); }

.mode-option,
.runner-mode-card {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 320px;
  flex-direction: column;
  padding: 22px;
  border: 3px solid #FFFFFF;
  border-radius: 24px;
  color: #064E3B;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
  text-align: left;
  box-shadow: 0 10px 26px rgba(15, 118, 110, 0.1), 0 4px 10px rgba(0, 0, 0, 0.03), inset 0 6px 18px color-mix(in srgb, var(--mode-accent, #22C55E) 7%, transparent);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}

/* 模式卡适度拉伸：吃掉移除路线图后的部分空间，但控制中部空旷 */
.mode-option { height: clamp(320px, calc(100vh - 520px), 420px); }

.mode-option:hover,
.runner-mode-card:hover {
  transform: translateY(-7px) scale(1.01);
  border-color: color-mix(in srgb, var(--mode-accent, #22C55E) 45%, #FFFFFF);
  box-shadow: 0 20px 40px rgba(15, 118, 110, 0.18), 0 8px 16px rgba(0, 0, 0, 0.05), inset 0 6px 18px color-mix(in srgb, var(--mode-accent, #22C55E) 14%, transparent);
}

.mode-option.featured,
.runner-mode-card.featured {
  box-shadow: 0 10px 26px rgba(16, 185, 129, 0.16), 0 4px 10px rgba(0, 0, 0, 0.03), inset 0 6px 18px rgba(34, 197, 94, 0.1);
}

/* 锁定卡：柔和半透明磨砂底 + 主题色描边强化蓝/紫识别 */
.mode-option.locked {
  background: color-mix(in srgb, var(--mode-accent) 5%, rgba(255, 255, 255, 0.78));
  border-color: color-mix(in srgb, var(--mode-accent) 26%, #FFFFFF);
}
.mode-option.locked:hover {
  transform: translateY(-7px) scale(1.01);
  border-color: color-mix(in srgb, var(--mode-accent) 45%, #FFFFFF);
  box-shadow: 0 20px 40px rgba(15, 118, 110, 0.16), 0 8px 16px rgba(0, 0, 0, 0.05), inset 0 6px 18px color-mix(in srgb, var(--mode-accent) 12%, transparent);
}

.mode-option:focus-visible,
.playstyle-option:focus-visible,
.runner-mode-card:focus-visible,
.market-link:focus-visible,
.account-link:focus-visible,
.profile-link:focus-visible,
.back-link:focus-visible,
.quick-continue:focus-visible,
.section-kicker:focus-visible,
.difficulty-options button:focus-visible,
.config-actions button:focus-visible { outline: 2px solid var(--adventure-focus); outline-offset: 3px; }

/* 右上角贴纸徽章：已解锁=亮绿挑战贴纸 / 锁定=金色小锁头贴纸 */
.mode-feature-badge,
.runner-recommend-tag {
  padding: 5px 11px;
  border: 2px solid #FFFFFF;
  border-radius: 999px;
  background: linear-gradient(135deg, #22C55E, #10B981);
  color: #FFFFFF;
  font-size: 11px;
  font-weight: 800;
  box-shadow: 0 4px 10px rgba(16, 185, 129, 0.3);
}

.mode-feature-badge,
.mode-corner-lock {
  position: absolute;
  top: 14px;
  right: 14px;
}

.mode-corner-lock {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 2px solid #FFFFFF;
  border-radius: 999px;
  background: linear-gradient(135deg, #FBBF24, #F59E0B);
  color: #FFFFFF;
  box-shadow: 0 4px 10px rgba(245, 158, 11, 0.35);
}
.mode-corner-lock svg { width: 14px; height: 14px; }

.mode-option.shaking { animation: cardShake 0.23s ease; }
@keyframes cardShake {
  0%, 100% { transform: translateX(0); }
  30% { transform: translateX(-3px); }
  65% { transform: translateX(3px); }
}

.mode-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 7px;
}

.mode-title-row h3, .runner-mode-card h3 {
  margin: 0;
  font-size: 23px;
  font-weight: 800;
  color: #064E3B;
}
.mode-icon, .runner-mode-icon { flex: none; color: var(--mode-accent, #10B981); }
.mode-option p, .runner-card-desc {
  margin-top: 9px;
  color: #374151;
  font-size: 13px;
  line-height: 1.65;
}
.mode-option p { min-height: 42px; }

/* 彩色小标签胶囊：主题色浅底 + 描边 */
.mode-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
.mode-chips i {
  padding: 4px 9px;
  border-radius: 999px;
  color: var(--mode-accent);
  background: color-mix(in srgb, var(--mode-accent) 12%, #FFFFFF);
  border: 1px solid color-mix(in srgb, var(--mode-accent) 26%, transparent);
  font-size: 11px;
  font-weight: 650;
  font-style: normal;
}

/* 数据面板：浅主题色圆角底框，游戏面板感 */
.mode-option dl {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 14px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  background: color-mix(in srgb, var(--mode-accent, #22C55E) 7%, #FFFFFF);
  border: 1px solid color-mix(in srgb, var(--mode-accent, #22C55E) 18%, transparent);
}
.mode-option dt { color: #3B5A4E; font-size: 12px; font-weight: 650; }
.mode-option dt small { margin-left: 4px; font-size: 10px; color: #5B7A6E; }
.mode-option dd { margin-top: 4px; color: #047857; font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums; }
.mode-option .empty-dd { font-size: 11px; font-weight: 550; }

/* 锁定提示条：清晰可爱的圆角提示 */
.mode-locked-note {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px dashed color-mix(in srgb, var(--mode-accent) 40%, transparent);
  background: color-mix(in srgb, var(--mode-accent) 6%, #FFFFFF);
  color: #374151;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.55;
}
.mode-lock-icon { width: 16px; height: 16px; flex: none; color: #D97706; }

/* 糖果大按钮：已解锁=主题色立体果冻 / 锁定=浅色磨砂胶囊 */
.mode-enter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  margin-top: auto;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  color: #FFFFFF;
  font-size: 14px;
  font-weight: 800;
  font-style: normal;
  text-shadow: 0 1px 2px rgba(0, 60, 40, 0.5);
  background: linear-gradient(135deg, color-mix(in srgb, var(--mode-accent) 88%, #fff 12%), var(--mode-accent));
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.35), 0 5px 0 color-mix(in srgb, var(--mode-accent) 55%, #064E3B), 0 10px 18px color-mix(in srgb, var(--mode-accent) 35%, transparent);
  transition: transform 0.16s ease, box-shadow 0.16s ease, filter 0.16s ease;
}
.mode-option:not(.locked):is(:hover, :focus-visible) .mode-enter {
  transform: translateY(-2px) scale(1.02);
  filter: brightness(1.08);
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.35), 0 7px 0 color-mix(in srgb, var(--mode-accent) 55%, #064E3B), 0 14px 24px color-mix(in srgb, var(--mode-accent) 42%, transparent);
}
.mode-option:not(.locked):active .mode-enter { transform: translateY(3px) scale(0.99); filter: none; box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.25), 0 2px 0 color-mix(in srgb, var(--mode-accent) 55%, #064E3B), 0 4px 10px color-mix(in srgb, var(--mode-accent) 25%, transparent); }

.mode-option.locked .mode-enter {
  color: color-mix(in srgb, var(--mode-accent) 62%, #064E3B);
  background: color-mix(in srgb, var(--mode-accent) 14%, #FFFFFF);
  border: 1px solid color-mix(in srgb, var(--mode-accent) 38%, transparent);
  text-shadow: none;
  box-shadow: 0 4px 10px rgba(15, 118, 110, 0.08);
}
.mode-option.locked:is(:hover, :focus-visible) .mode-enter {
  background: color-mix(in srgb, var(--mode-accent) 22%, #FFFFFF);
  border-color: color-mix(in srgb, var(--mode-accent) 55%, transparent);
}

.runner-card-top { display: flex; align-items: center; justify-content: space-between; gap: 9px; }
.runner-mode-card h3 { margin-top: 12px; }
.runner-card-kicker { margin-top: 5px; color: #0369A1; font-size: 11px; font-weight: 650; }
.runner-card-desc { margin-bottom: 10px; }

/* 突围卡行动条同步糖果按钮 */
.runner-card-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  margin-top: auto;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  color: #FFFFFF;
  font-size: 14px;
  font-weight: 800;
  font-style: normal;
  text-shadow: 0 1px 2px rgba(0, 60, 40, 0.5);
  background: linear-gradient(135deg, #38BDF8, #0EA5E9);
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.35), 0 5px 0 #075985, 0 10px 18px rgba(14, 165, 233, 0.3);
  transition: transform 0.16s ease, box-shadow 0.16s ease, filter 0.16s ease;
}
.runner-mode-card:is(:hover, :focus-visible) .runner-card-action {
  transform: translateY(-2px) scale(1.02);
  filter: brightness(1.08);
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.35), 0 7px 0 #075985, 0 14px 24px rgba(14, 165, 233, 0.38);
}
.runner-mode-card:active .runner-card-action { transform: translateY(3px) scale(0.99); filter: none; box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.25), 0 2px 0 #075985, 0 4px 10px rgba(14, 165, 233, 0.22); }

/* 锁卡点击 toast：暖金提示条 */
.lock-toast {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 12px;
  padding: 11px 16px;
  border: 2px solid #FDE68A;
  border-radius: 14px;
  background: #FEF3C7;
  color: #92400E;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  box-shadow: 0 8px 20px rgba(245, 158, 11, 0.15);
}
.lock-toast-icon { width: 17px; height: 17px; flex: none; }
.toast-enter-active, .toast-leave-active { transition: opacity 0.16s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; }


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
  padding-top: 12px;
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
  scrollbar-color: rgba(110, 231, 183, 0.55) transparent;
}

.config-kicker {
  display: flex;
  align-items: center;
  gap: 10px;
}

.config-kicker p { margin: 0; color: #059669; font-size: 11px; font-weight: 700; }
.config-kicker > span { color: #4B6B5E; font-size: 13px; }
.config-kicker h2 { margin: 0; font-size: 21px; color: #064E3B; font-weight: 800; }

/* 返回：圆润白色立体小圆钮（内高光 + 明显厚度） */
.back-link {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex: none;
  border: 2px solid #FFFFFF;
  border-radius: 50%;
  color: #064E3B;
  background: linear-gradient(180deg, #FFFFFF, #F0FDF4);
  font-size: 16px;
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.9), 0 4px 0 #86EFAC, 0 8px 16px rgba(16, 185, 129, 0.2);
  transition: border-color 0.14s ease, color 0.14s ease, background 0.14s ease, transform 0.14s ease, box-shadow 0.14s ease;
}

.back-link:hover {
  color: #047857;
  background: #D1FAE5;
  transform: translateY(-1px);
}

.back-link:active { transform: translateY(2px); box-shadow: 0 2px 0 rgba(16, 185, 129, 0.18), 0 3px 8px rgba(16, 185, 129, 0.12); }

/* 本局配置条：通透白色磨砂圆角条 */
.config-intro {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 14px 18px;
  border: 2px solid #FFFFFF;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 22px rgba(16, 185, 129, 0.08);
}

.config-heading { display: flex; align-items: flex-start; gap: 14px; min-width: 0; flex: 1; }
.config-heading .back-link { margin-top: 2px; }
.config-mode-copy { min-width: 0; }
.config-mode-details { margin-top: 6px; color: var(--text-muted); font-size: 10px; line-height: 1.7; }
.config-mode-details summary { cursor: pointer; }
.config-mode-details summary::marker { color: var(--adventure-gold); font-size: 9px; }
.config-mode-details summary:focus-visible { outline: 2px solid var(--accent-bright); outline-offset: 3px; }
.config-mode-details p { max-width: 460px; margin: 8px 0 0; color: var(--text-muted); font-size: 11px; }

.config-flow {
  display: grid;
  gap: 16px;
  margin-top: 12px;
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
  color: #064E3B;
  font-size: 13px;
}

.step-heading span {
  overflow: hidden;
  color: #4B6B5E;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 难度糖果分段胶囊：选中翡翠绿立体突出，未选白底磨砂 */
.difficulty-options {
  display: grid;
  grid-template-columns: repeat(var(--difficulty-count), minmax(0, 1fr));
  gap: 10px;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
}

.difficulty-options button {
  position: relative;
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
  min-height: 48px;
  padding: 7px 16px;
  border: 2px solid #FFFFFF;
  border-radius: 999px;
  color: #064E3B;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(8px);
  text-align: left;
  box-shadow: 0 4px 10px rgba(15, 118, 110, 0.08);
  transition: border-color 0.14s ease, background 0.14s ease, color 0.14s ease, transform 0.14s ease, box-shadow 0.14s ease, filter 0.14s ease;
}

.difficulty-options button:hover {
  background: #ECFDF5;
  border-color: #A7F3D0;
  transform: translateY(-1px);
}

/* 锁定难度：白底磨砂 + 小锁图标，可见但不可选 */
.difficulty-options button.locked {
  color: #8AA69B;
  background: rgba(255, 255, 255, 0.55);
  border-color: rgba(255, 255, 255, 0.8);
  cursor: not-allowed;
  box-shadow: none;
}

.difficulty-options button.locked:hover {
  transform: none;
  border-color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.55);
}

.diff-lock-icon {
  width: 15px;
  height: 15px;
  flex: none;
  color: #C29A5E;
}

.difficulty-options button:active { transform: translateY(2px); }
.config-actions button:active { transform: scale(0.98); }

.difficulty-options button.selected {
  color: #FFFFFF;
  background: linear-gradient(135deg, #22C55E, #10B981);
  border-color: #FFFFFF;
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.3), 0 5px 0 #059669, 0 10px 18px rgba(16, 185, 129, 0.3);
}

.difficulty-options button.selected:hover { filter: brightness(1.05); transform: translateY(-1px); }
.difficulty-options button.selected .option-copy i { color: #D1FAE5; }

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
  color: var(--text-muted);
  font-size: 10px;
  font-style: normal;
  line-height: 1.4;
}

button.selected .option-copy i {
  color: var(--text-muted);
}

.choice-indicator {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  flex: none;
  border-radius: 50%;
  color: #fff;
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

/* 底部操作栏：白色磨砂条 + 翡翠绿糖果大按钮 */
.config-actions {
  position: relative;
  flex: none;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 12px;
  padding: 10px 12px 10px 20px;
  border: 2px solid #FFFFFF;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(10px);
  box-shadow: 0 10px 26px rgba(16, 185, 129, 0.1);
}

.config-summary {
  display: flex;
  align-items: baseline;
  min-width: 0;
  gap: 8px;
  margin: 0;
  font-size: 12px;
}

.config-summary b { color: #047857; }
.config-summary span { color: #4B6B5E; }
.config-summary i { color: #8AA69B; font-style: normal; }

.config-actions button {
  min-height: 48px;
  padding: 0 27px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 800;
  transition: color 0.14s ease, background 0.14s ease, border-color 0.14s ease, transform 0.14s ease, box-shadow 0.14s ease, filter 0.14s ease;
}

.primary-action {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 50px;
  padding: 0 30px;
  border: 2px solid rgba(255, 255, 255, 0.6);
  color: #fff;
  background: linear-gradient(135deg, #22C55E, #10B981);
  font-size: 14px;
  text-shadow: 0 1px 2px rgba(0, 60, 40, 0.5);
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.35), 0 4px 0 #059669, 0 10px 22px rgba(16, 185, 129, 0.35);
}

.primary-action:hover { filter: brightness(1.06); transform: translateY(-2px); box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.35), 0 6px 0 #059669, 0 14px 26px rgba(16, 185, 129, 0.42); }
.primary-action:active { transform: translateY(3px); box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.25), 0 1px 0 #059669, 0 4px 10px rgba(16, 185, 129, 0.25); }

@media (max-width: 960px) {
  .start-shell { width: calc(100% - 48px); }
  .start-header { gap: 18px; }
  .playstyle-grid { grid-template-columns: 1fr 1fr; gap: 14px; }
  .playstyle-option { height: clamp(380px, 46vw, 460px); }
  /* 主战场独占一整行，保持核心模式的主次层级 */
  .playstyle-option.hero { grid-column: 1 / -1; height: clamp(300px, 34vw, 380px); }
}

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
  .playstyle-grid { grid-template-columns: 1fr; margin-top: 20px; }
  /* 移动端改为「插画在上 / 信息舱在下」堆叠：史莱姆角色完整可见，不被舱体遮挡 */
  .playstyle-option,
  .playstyle-option.hero { height: auto; min-height: 0; grid-column: auto; }
  .playstyle-art { position: static; inset: auto; width: 100%; height: 175px; }
  .playstyle-shade { display: none; }
  .playstyle-body { width: 100%; margin: 0; margin-top: 0; border-radius: 0; box-shadow: none; }
  .mode-grid,
  .mode-grid.single { grid-template-columns: 1fr; margin-top: 25px; }
  .mode-option { min-height: 240px; }
  .runner-mode-grid { margin-top: 25px; }
  .runner-mode-card { min-height: 240px; }
  .quick-continue { margin-left: 0; width: 100%; justify-content: center; }
  .title-row { flex-wrap: wrap; }
  .config-intro { display: contents; }
  .config-heading { order: 0; gap: 11px; }
  .config-heading h2 { font-size: 20px; }
  .config-kicker { gap: 8px; }
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
  .account-notice { align-items: flex-start; padding: 13px; gap: 12px; }
  .start-header {
    align-items: stretch;
    flex-direction: column;
    gap: 12px;
  }
  .header-actions { display: grid; width: 100%; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; }
  .header-actions .account-link { grid-column: span 2; margin-left: 0; max-width: 60%; }
  .header-actions .about-link { min-width: 0; justify-content: center; padding: 0 6px; }
  .account-link,
  .profile-link { min-width: 0; flex: 1; justify-content: center; }
  .account-link b,
  .profile-link b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .header-actions:has(.market-link) .account-link { grid-column: auto; }
  .playstyle-art { height: 150px; }
  .playstyle-body { padding: 13px 14px 12px; }
  .playstyle-body h3 { font-size: 21px; }
  .playstyle-body > p { margin-bottom: 7px; font-size: 14px; }
  .playstyle-enter { font-size: 13px; min-height: 38px; }
  .playstyle-badge { top: 10px; right: 10px; padding: 4px 9px; font-size: 11px; }
  .playstyle-feature-tag { top: 10px; left: 10px; padding: 4px 9px; font-size: 11px; }
  .resume-banner { flex-wrap: wrap; padding: 13px 14px; }
  .resume-slime { order: 1; }
  .resume-copy { order: 2; flex-basis: calc(100% - 60px); }
  .resume-actions { order: 3; width: 100%; margin-left: 0; }
  .resume-primary { flex: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .playstyle-option,
  .playstyle-art,
  .playstyle-enter,
  .resume-primary,
  .mode-option,
  .runner-mode-card,
  .difficulty-options button,
  .config-actions button { transition: none; }
  .playstyle-option:is(:hover, :focus-visible) { transform: none; }
  .playstyle-option:is(:hover, :focus-visible) .playstyle-art { transform: none; }
  .resume-primary::after,
  .resume-status-tag i,
  .hub-night .account-link.online span { animation: none; }
  .mode-option.shaking { animation: none; }
}
</style>
