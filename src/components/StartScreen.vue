<script setup>
import { computed, nextTick, ref, watch } from 'vue'
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
import { STRAINS, STRAIN_IDS } from '../game/Strains.js'

const emit = defineEmits(['prepare', 'market', 'profiles', 'account', 'leaderboard', 'ui-sound', 'runner'])
const props = defineProps({
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

const STRAIN_CHOICES = STRAIN_IDS.map((id) => ({ id, ...STRAINS[id] }))
const MODE_FACTS = {
  expedition: ['独立章节', '章间补给', '讨伐统帅决战'],
  timed: ['十二分钟封锁', '终局勇者', '通关速度计分'],
  endless: ['无时间上限', '二十波后灾变', '长期生存纪录'],
}

/**
 * 选项图标统一用内联 SVG（24×24 描边风格），不再依赖系统 emoji 字体——
 * 🫧/🪨 这类 Emoji 13+ 字符在旧版 Windows 上会渲染成方框。
 */
const ICONS = {
  origin: [
    'M12 21a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z',
    'M18.5 6.6a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z',
    'M9.1 11.4a3.6 3.6 0 0 1 2.5-2.3',
  ],
  stone: ['M8.2 5 15 4l5 6-2.8 8-8.2 1L4.8 12 8.2 5Z', 'M13 4.6 11.8 11 7 12.8'],
  volt: ['M13 2 5 13.2h5L9 22l8-11.2h-5L13 2Z'],
  glutton: ['M20.6 8.4 12 12l8.6 3.6A9 9 0 1 1 20.6 8.4Z'],
}

/** 血统图标配色（血统本身没有 color 字段，这里按主题色手配）。 */
const STRAIN_COLORS = {
  origin: '#b7cfaf',
  stone: '#9fb4c8',
  volt: '#78e0ff',
  glutton: '#96e878',
}

/** 模式专属图标（内联 SVG path，避免系统 emoji 字体差异）。 */
const MODE_ICONS = {
  expedition: [
    'M4 8l4.5 3L12 5l3.5 6L20 8l-1.8 9H5.8L4 8Z',
    'M9 21h6',
  ],
  timed: [
    'M7 3h10',
    'M8 3v2.2c0 2.8 3.2 4.3 4 5.8.8-1.5 4-3 4-5.8V3',
    'M8 21v-2.2c0-2.8 3.2-4.3 4-5.8.8 1.5 4 3 4 5.8V21',
    'M7 21h10',
  ],
  endless: [
    'M18.6 8.2c-1.5-1.7-3.4-2-4.8-1.2L12 8.1l-1.8-1.1c-1.4-.8-3.3-.5-4.8 1.2-1.6 1.9-1.6 4.7 0 6.6 1.5 1.7 3.4 2 4.8 1.2L12 14.9l1.8 1.1c1.4.8 3.3.5 4.8-1.2 1.6-1.9 1.6-4.7 0-6.6Z',
  ],
}

/** 模式主题色：仅用于卡片图标与轻微强调，不破坏整体金色体系。 */
const MODE_COLORS = {
  expedition: '#ecc477',
  timed: '#78c7ff',
  endless: '#c99bff',
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

const view = ref('modes')
const selection = ref({ ...normalizeRunSelection(props.preferences), strain: 'origin' })
const modeGrid = ref(null)
const configBackLink = ref(null)

watch(
  () => props.preferences,
  (value) => {
    selection.value = {
      ...normalizeRunSelection(value),
      strain: selection.value.strain || 'origin',
    }
  },
  { deep: true }
)

const unlockedModes = computed(() => getUnlockedModeIds(props.progression))
const unlockedDifficulties = computed(() =>
  DIFFICULTY_IDS.filter((id) => isDifficultyUnlocked(props.progression, id))
)
const nextUnlock = computed(() => getNextModeUnlock(props.progression))
const modeCards = computed(() =>
  MODE_IDS.map((mode, index) => ({
    mode,
    index,
    locked: !isModeUnlocked(props.progression, mode),
    hint: modeUnlockHint(mode),
  }))
)
const selectedMode = computed(() => MODES[selection.value.mode])
const selectedDifficulty = computed(() => DIFFICULTIES[selection.value.difficulty])
const lanLabel = computed(() => {
  if (props.lanAccount) return props.lanAccount.displayName || props.lanAccount.username
  if (props.lanStatus?.online) return '登录局域网'
  return props.lanStatus?.checked ? '离线单机' : '检测中'
})
const publicEntries = computed(() => props.publicLeaderboard?.entries || [])
const hostAddress = window.location.origin
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

function selectMode(mode) {
  selection.value.mode = mode
  if (!isDifficultyUnlocked(props.progression, selection.value.difficulty)) {
    selection.value.difficulty = 'normal'
  }
  emit('ui-sound', 'select')
  view.value = 'config'
  nextTick(() => configBackLink.value?.focus())
}

function selectDifficulty(difficulty) {
  if (selection.value.difficulty === difficulty) return
  selection.value.difficulty = difficulty
  emit('ui-sound', 'select')
}

function selectStrain(strain) {
  if (selection.value.strain === strain) return
  selection.value.strain = strain
  emit('ui-sound', 'select')
}

function showModeSelection() {
  view.value = 'modes'
  emit('ui-sound', 'click')
  nextTick(() => modeGrid.value?.querySelector('.mode-option')?.focus())
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
  <div class="start-overlay">
    <!-- 史莱姆主题动态背景：漂浮 goo 光晕 + 上浮气泡，纯 CSS 动画，不挡交互 -->
    <div class="goo-layer" aria-hidden="true">
      <div class="goo-blob blob-a"></div>
      <div class="goo-blob blob-b"></div>
      <span v-for="n in 12" :key="n" class="goo-bubble"></span>
    </div>
    <main class="start-shell">
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
          <button class="market-link" @click="emit('market')">地下城黑市</button>
        </div>
      </header>

      <section v-if="view === 'modes'" class="mode-view" aria-labelledby="mode-title">
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
            <h2 id="mode-title">选择作战模式</h2>
          </div>
          <span>先决定这一局要面对什么。</span>
        </div>

          <div ref="modeGrid" class="mode-grid" :style="{ '--mode-count': modeCards.length }">
            <button
              v-for="card in modeCards"
              :key="card.mode"
              class="mode-option"
              :class="{ locked: card.locked }"
              :disabled="card.locked"
              :style="{ '--mode-accent': MODE_COLORS[card.mode] }"
              @click="selectMode(card.mode)"
            >
              <span class="mode-index">0{{ card.index + 1 }}</span>
              <div class="mode-title-row">
                <svg class="mode-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path v-for="d in MODE_ICONS[card.mode]" :key="d" :d="d" />
                </svg>
                <h3>{{ MODES[card.mode].name }}</h3>
              </div>
              <p>{{ MODES[card.mode].description }}</p>
              <dl v-if="!card.locked">
                <div>
                  <dt>最高分<small>全难度</small></dt>
                  <dd>{{ modeSummaries[card.mode].bestScore ? modeSummaries[card.mode].bestScore.toLocaleString('en-US') : '—' }}</dd>
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
              <span class="mode-enter">{{ card.locked ? '尚未解锁' : '进入设置' }} <b v-if="!card.locked" aria-hidden="true">→</b></span>
            </button>
          </div>

        <div class="next-unlock" :class="{ complete: !nextUnlock }">
          <span>解锁进度</span>
          <b>{{ unlockedModes.length }} / {{ MODE_IDS.length }}</b>
          <i v-if="nextUnlock">下一档案：{{ nextUnlock.name }} · {{ nextUnlock.hint }}</i>
          <i v-else>全部开放 · 三种作战模式均可进入</i>
        </div>

        <!-- 独立试玩入口：Runner 不属于 MODE_IDS，不参与解锁/难度/排行榜 -->
        <button class="runner-entry" @click="emit('runner')">
          <span class="runner-tag">独立试玩</span>
          <span class="runner-copy">
            <h3>极速突围 · Runner</h3>
            <p>三线通道射击原型：切道走位、自动射击、打爆增益门。不入档、不上榜、随时可弃。</p>
          </span>
          <span class="runner-enter">直接开始 <b aria-hidden="true">→</b></span>
        </button>
      </section>

      <section v-else class="config-view" aria-labelledby="config-title">
        <div class="config-intro">
          <div class="config-heading">
            <div class="config-kicker">
              <button ref="configBackLink" class="back-link" title="返回模式选择" aria-label="返回模式选择" @click="showModeSelection">←</button>
              <p>本局配置</p>
            </div>
            <div class="title-row">
              <svg class="slime-buddy" viewBox="0 0 48 38" aria-hidden="true">
                <path d="M7 33C5 21 13 9 24 9s19 12 17 24c-.3 2-1.7 2.6-3.4 2.6H10.4C8.7 35.6 7.3 35 7 33Z" fill="rgba(142, 173, 131, 0.9)" />
                <path d="M14 15.5c2-2.4 5-3.8 8-4" stroke="rgba(255, 255, 255, 0.55)" stroke-width="2.2" stroke-linecap="round" fill="none" />
                <circle cx="18.5" cy="24" r="2.1" fill="#0a0d0c" />
                <circle cx="29.5" cy="24" r="2.1" fill="#0a0d0c" />
                <path d="M21 28.4c1.9 1.4 4.1 1.4 6 0" stroke="#0a0d0c" stroke-width="1.8" stroke-linecap="round" fill="none" />
              </svg>
              <h2 id="config-title">{{ selectedMode.name }}</h2>
            </div>
            <span>{{ selectedMode.description }}</span>
            <ul class="mode-facts" aria-label="行动规则">
              <li v-for="fact in modeFacts" :key="fact">{{ fact }}</li>
            </ul>
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

        <section class="public-board" aria-labelledby="public-board-title">
          <header class="step-heading">
            <b id="public-board-title">局域网排行榜</b>
            <span v-if="props.lanStatus?.online">{{ publicLeaderboard?.totalPlayers || 0 }} 名玩家</span>
            <span v-else>主机未连接</span>
          </header>
          <div v-if="publicEntries.length" class="public-board-list">
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
          <p v-else class="public-board-empty">
            {{ props.lanStatus?.online ? '这套规则还没有公共成绩。' : '启动局域网主机后，全员榜会显示在这里。' }}
          </p>
          <p v-if="props.lanStatus?.online" class="public-board-hint">
            主机地址 <code>{{ hostAddress }}</code> · 其他设备打开同一地址即可加入
          </p>
        </section>

        <div class="config-flow">
          <section class="config-step" aria-labelledby="difficulty-heading">
            <header class="step-heading">
              <b id="difficulty-heading">难度</b>
              <span>{{ selectedDifficulty.description }}</span>
            </header>
            <div class="difficulty-options" :style="{ '--difficulty-count': unlockedDifficulties.length }">
              <button
                v-for="difficulty in unlockedDifficulties"
                :key="difficulty"
                :class="{ selected: selection.difficulty === difficulty }"
                :aria-pressed="selection.difficulty === difficulty"
                @click="selectDifficulty(difficulty)"
              >
                <span class="option-copy">
                  <b>{{ DIFFICULTIES[difficulty].name }}</b>
                  <i>{{ difficultyMeta(difficulty) }}</i>
                </span>
                <span class="choice-indicator" aria-hidden="true">✓</span>
              </button>
            </div>
          </section>

          <section class="config-step" aria-labelledby="strain-heading">
            <header class="step-heading">
              <b id="strain-heading">史莱姆血统</b>
              <span>选择先天属性</span>
            </header>
            <div class="strain-options">
              <button
                v-for="strain in STRAIN_CHOICES"
                :key="strain.id"
                :class="{ selected: selection.strain === strain.id }"
                :aria-pressed="selection.strain === strain.id"
                @click="selectStrain(strain.id)"
              >
                <svg
                  class="opt-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.7"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  :style="{ color: STRAIN_COLORS[strain.id] }"
                  aria-hidden="true"
                >
                  <path v-for="d in ICONS[strain.id]" :key="d" :d="d" />
                </svg>
                <span class="option-copy">
                  <b>{{ strain.name }}</b>
                  <i>{{ strain.desc }}</i>
                </span>
                <span class="choice-indicator" aria-hidden="true">✓</span>
              </button>
            </div>
          </section>
        </div>

        <div class="config-actions">
          <button class="primary-action" @click="prepare">
            开始行动
            <b aria-hidden="true">→</b>
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
.mode-option,
.difficulty-options button,
.strain-options button,
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
  transition: border-color 0.14s ease, background 0.14s ease, transform 0.08s ease;
}

.mode-option:hover {
  border-color: rgba(215, 166, 87, 0.5);
  background: var(--surface-hover);
}

.mode-option:active { transform: scale(0.99); }
.mode-option:focus-visible,
.market-link:focus-visible,
.account-link:focus-visible,
.profile-link:focus-visible,
.back-link:focus-visible,
.difficulty-options button:focus-visible,
.strain-options button:focus-visible,
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
  cursor: not-allowed;
  opacity: 0.62;
  background: rgba(18, 16, 13, 0.48);
}

.mode-option.locked:hover {
  border-color: var(--border);
  background: rgba(18, 16, 13, 0.48);
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

.mode-enter b {
  transition: transform 0.14s ease;
}

.mode-option:not(.locked):hover .mode-enter {
  text-decoration: underline;
  text-underline-offset: 4px;
  text-decoration-color: rgba(236, 196, 119, 0.55);
}

.mode-option:not(.locked):hover .mode-enter b {
  transform: translateX(4px);
}


.next-unlock {
  display: grid;
  grid-template-columns: 120px 150px 1fr;
  align-items: center;
  gap: 14px;
  min-height: 54px;
  margin-top: 15px;
  padding: 0 17px;
  border-left: 3px solid #8f7650;
  color: var(--text-muted);
  background: rgba(215, 166, 87, 0.05);
  font-size: 11px;
}

.next-unlock b { color: var(--accent-bright); font-size: 12px; }
.next-unlock i { font-style: normal; }
.next-unlock.complete { border-left-color: #a8773e; background: rgba(215, 166, 87, 0.05); }
.next-unlock.complete b { color: var(--accent-bright); }

/* 独立试玩入口（Runner）：与三张模式卡明确区隔的横幅按钮 */
.runner-entry {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  margin-top: 12px;
  padding: 13px 18px;
  border: 1px solid rgba(201, 162, 255, 0.4);
  border-radius: 10px;
  background: linear-gradient(120deg, rgba(201, 162, 255, 0.12), rgba(122, 75, 184, 0.07));
  color: rgba(244, 238, 230, 0.92);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.15s ease;
}

.runner-entry:hover {
  border-color: rgba(201, 162, 255, 0.75);
  transform: translateY(-1px);
}

.runner-tag {
  flex-shrink: 0;
  padding: 3px 9px;
  border: 1px solid rgba(201, 162, 255, 0.5);
  border-radius: 999px;
  color: #c9a2ff;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1px;
}

.runner-copy {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 3px;
}

.runner-copy h3 { margin: 0; font-size: 15px; }

.runner-copy p {
  margin: 0;
  color: rgba(244, 238, 230, 0.55);
  font-size: 11px;
  line-height: 1.5;
}

.runner-enter {
  flex-shrink: 0;
  color: #c9a2ff;
  font-size: 12px;
  font-weight: 700;
}

.config-view {
  position: relative;
  padding-top: 42px;
}

.config-kicker {
  display: flex;
  align-items: center;
  gap: 10px;
}

.config-kicker p { margin: 0; }

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
  gap: 36px;
  padding-bottom: 22px;
  border-bottom: 1px solid rgba(238, 214, 180, 0.11);
}

.config-heading { min-width: 0; flex: 1; }
.config-heading .title-row { margin-top: 9px; }
.config-heading .title-row h2 { margin-top: 0; font-size: 27px; }
.config-heading .slime-buddy { width: 34px; }
.config-heading > span { margin-top: 5px; font-size: 12px; }

.mode-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 15px;
  margin-top: 10px;
  color: rgba(244, 238, 230, 0.52);
  font-size: 10px;
  list-style: none;
}

.mode-facts li::before {
  content: '\2014  ';
  color: #b98747;
}

.config-record {
  display: grid;
  grid-template-columns: 94px minmax(0, 1fr);
  grid-template-rows: auto auto;
  width: 350px;
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
  font-size: 22px;
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
  margin-top: 22px;
}

.public-board {
  margin-top: 18px;
  padding: 15px 0 3px;
  border-bottom: 1px solid rgba(238, 214, 180, 0.11);
}

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

.public-board-empty {
  min-height: 38px;
  color: rgba(244, 238, 230, 0.42);
  font-size: 11px;
  line-height: 1.6;
}

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
  width: min(720px, 100%);
  padding: 3px;
  border: 1px solid rgba(238, 214, 180, 0.12);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.018);
}

.difficulty-options button,
.strain-options button {
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
  min-height: 54px;
  padding: 8px 13px;
  border: 0;
  border-radius: 4px;
  background: transparent;
}

.strain-options button {
  min-height: 72px;
  padding: 10px 12px;
  border: 1px solid rgba(238, 214, 180, 0.12);
  border-radius: 6px;
  background: rgba(18, 16, 13, 0.72);
}

.difficulty-options button:hover,
.strain-options button:hover {
  color: #fffaf2;
  background: var(--surface-hover);
}

.strain-options button:hover { border-color: rgba(215, 166, 87, 0.38); }

.difficulty-options button:active,
.strain-options button:active,
.config-actions button:active { transform: scale(0.98); }

.difficulty-options button.selected,
.strain-options button.selected {
  color: #fff9ef;
  background: var(--accent-soft);
}

.difficulty-options button.selected {
  box-shadow: inset 0 0 0 1px rgba(236, 196, 119, 0.48);
}

.strain-options button.selected { border-color: rgba(236, 196, 119, 0.52); }

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

.strain-options {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.opt-icon {
  width: 22px;
  height: 22px;
  flex: none;
}

.config-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 24px;
}

.config-actions button {
  min-height: 48px;
  padding: 0 27px;
  border-radius: 5px;
  font-size: 13px;
  font-weight: 800;
  transition: color 0.14s ease, background 0.14s ease, border-color 0.14s ease, transform 0.08s ease;
}

.primary-action {
  min-height: 48px;
  padding: 0 28px;
  border: 1px solid #efca82;
  color: #21170b;
  background: var(--accent);
  font-size: 13px;
}

.primary-action b { margin-left: 7px; }
.primary-action:hover { background: #e3b566; }

@media (max-width: 760px) {
  .start-shell { width: min(100% - 24px, 620px); padding-top: 14px; }
  .start-header { padding-bottom: 14px; }
  .header-actions { gap: 6px; }
  .market-link,
  .account-link,
  .profile-link { padding: 0 9px; font-size: 10px; }
  .account-link,
  .profile-link { gap: 5px; }
  .mode-view,
  .config-view { padding-top: 34px; }
  .mode-grid,
  .mode-grid.single { grid-template-columns: 1fr; margin-top: 25px; }
  .mode-option { min-height: 218px; }
  .next-unlock { grid-template-columns: 1fr; gap: 4px; padding: 12px 14px; }
  .config-intro { display: block; padding-bottom: 18px; }
  .config-heading h2 { font-size: 26px; }
  .config-record {
    grid-template-columns: 80px minmax(0, 1fr);
    width: 100%;
    margin-top: 18px;
    padding: 14px 0 0;
    column-gap: 14px;
    border-top: 1px solid var(--border);
    border-left: 0;
  }
  .config-record dl { gap: 8px; }
  .public-board-row { grid-template-columns: 38px 94px minmax(0, 1fr) 48px; gap: 8px; }
  .config-flow { gap: 20px; margin-top: 20px; }
  .config-step { padding: 0; }
  .difficulty-options { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .strain-options { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .config-actions {
    margin-top: 20px;
  }
  .config-actions button { width: 100%; }
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
  .mode-option,
  .difficulty-options button,
  .strain-options button,
  .config-actions button { transition: none; }
  .goo-bubble,
  .goo-blob,
  .slime-buddy { animation: none; }
  .goo-bubble { opacity: 0.35; }
}
</style>
