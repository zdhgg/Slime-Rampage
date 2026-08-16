<script setup>
import { computed, ref, watch } from 'vue'
import {
  DIFFICULTIES,
  DIFFICULTY_IDS,
  MODES,
  formatRunClock,
  getNextModeUnlock,
  getUnlockedModeIds,
  isDifficultyUnlocked,
  normalizeRunSelection,
  runKey,
} from '../game/RunRules.js'
import { SPEC_INFO, getStartingGift } from '../game/SkillPool.js'
import { getExpeditionStages } from '../game/RunRules.js'
import { STRAINS, STRAIN_IDS } from '../game/Strains.js'

const emit = defineEmits(['prepare', 'market'])
const props = defineProps({
  records: { type: Object, default: () => ({}) },
  progression: {
    type: Object,
    default: () => ({ highestDifficulty: 'normal', highestMode: 'expedition' }),
  },
  preferences: { type: Object, default: () => ({ mode: 'expedition', difficulty: 'normal' }) },
})

const SPEC_CHOICES = Object.keys(SPEC_INFO).map((id) => ({ id, ...SPEC_INFO[id] }))
const STRAIN_CHOICES = STRAIN_IDS.map((id) => ({ id, ...STRAINS[id] }))
const MODE_FACTS = {
  expedition: ['连续关卡', '关间补给', '统帅决战'],
  timed: ['十二分钟封锁', '终局勇者', '通关速度计分'],
  endless: ['无时间上限', '二十波后灾变', '长期生存纪录'],
}

/** 远征的关卡数随难度递增（简单 6 / 普通 8 / 困难 10 / 地狱 12），其余模式为静态规则。 */
const modeFacts = computed(() => {
  if (selection.value.mode !== 'expedition') return MODE_FACTS[selection.value.mode]
  const count = getExpeditionStages(selection.value.difficulty).length
  return [`${count} 个连续关卡`, ...MODE_FACTS.expedition.slice(1)]
})

const view = ref('modes')
const selection = ref({ ...normalizeRunSelection(props.preferences), spec: null, strain: 'origin' })

watch(
  () => props.preferences,
  (value) => {
    selection.value = {
      ...normalizeRunSelection(value),
      spec: selection.value.spec || null,
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
const selectedMode = computed(() => MODES[selection.value.mode])
const selectedDifficulty = computed(() => DIFFICULTIES[selection.value.difficulty])
const record = computed(() => props.records[runKey(selection.value)] || {
  best: { wave: 1, stage: 1, kills: 0, time: 0, score: 0, clears: 0, fastestFinale: null, fastestClear: null },
  board: [],
})

const specHint = computed(() => {
  const id = selection.value.spec
  if (!id) return 'Lv.5 时自由选择主专精'
  const gift = getStartingGift(id)
  return `${SPEC_INFO[id].desc}，附赠「${gift?.name || ''}」Lv.1`
})

function modeSummary(mode) {
  const records = DIFFICULTY_IDS.map((difficulty) =>
    props.records[runKey({ mode, difficulty })]
  ).filter(Boolean)
  const bestScore = Math.max(0, ...records.map((item) => item.best?.score || 0))
  const clears = records.reduce((sum, item) => sum + (item.best?.clears || 0), 0)
  return { bestScore, clears }
}

function selectMode(mode) {
  selection.value.mode = mode
  if (!isDifficultyUnlocked(props.progression, selection.value.difficulty)) {
    selection.value.difficulty = 'normal'
  }
  view.value = 'config'
}

function prepare() {
  emit('prepare', { ...selection.value })
}
</script>

<template>
  <div class="start-overlay">
    <main class="start-shell">
      <header class="start-header">
        <h1>史莱姆大暴走<span>SLIME RAMPAGE</span></h1>
        <button class="market-link" @click="emit('market')">地下城黑市</button>
      </header>

      <section v-if="view === 'modes'" class="mode-view" aria-labelledby="mode-title">
        <div class="view-heading">
          <p>行动档案</p>
          <h2 id="mode-title">选择作战模式</h2>
          <span>先决定这一局要面对什么。</span>
        </div>

        <div class="mode-grid" :class="{ single: unlockedModes.length === 1 }" :style="{ '--mode-count': unlockedModes.length }">
          <button
            v-for="(mode, index) in unlockedModes"
            :key="mode"
            class="mode-option"
            @click="selectMode(mode)"
          >
            <span class="mode-index">0{{ index + 1 }}</span>
            <div>
              <h3>{{ MODES[mode].name }}</h3>
              <p>{{ MODES[mode].description }}</p>
            </div>
            <dl>
              <div><dt>最高分</dt><dd>{{ modeSummary(mode).bestScore ? modeSummary(mode).bestScore.toLocaleString('en-US') : '—' }}</dd></div>
              <div><dt>通关</dt><dd>{{ mode === 'endless' ? '—' : modeSummary(mode).clears }}</dd></div>
            </dl>
            <span class="mode-enter">进入设置 <b aria-hidden="true">→</b></span>
          </button>
        </div>

        <div v-if="nextUnlock" class="next-unlock">
          <span>下一行动档案</span>
          <b>{{ nextUnlock.name }}</b>
          <i>{{ nextUnlock.hint }}</i>
        </div>
        <div v-else class="next-unlock complete">
          <span>行动档案</span>
          <b>全部开放</b>
          <i>三种作战模式均可进入</i>
        </div>
      </section>

      <section v-else class="config-view" aria-labelledby="config-title">
        <button class="back-link" title="返回模式选择" aria-label="返回模式选择" @click="view = 'modes'">←</button>
        <div class="config-heading">
          <p>本局配置</p>
          <h2 id="config-title">{{ selectedMode.name }}</h2>
          <span>{{ selectedMode.description }}</span>
        </div>

        <div class="config-layout">
          <div class="config-main">
            <section class="config-section">
              <div class="section-heading">
                <b>威胁等级</b>
                <span>{{ selectedDifficulty.description }}</span>
              </div>
              <div class="difficulty-options" :style="{ '--difficulty-count': unlockedDifficulties.length }">
                <button
                  v-for="difficulty in unlockedDifficulties"
                  :key="difficulty"
                  :class="{ selected: selection.difficulty === difficulty }"
                  @click="selection.difficulty = difficulty"
                >
                  <span>{{ DIFFICULTIES[difficulty].name }}</span>
                  <i>战利品 ×{{ DIFFICULTIES[difficulty].rewardMul }}</i>
                </button>
              </div>
            </section>

            <section class="config-section">
              <div class="section-heading">
                <b>史莱姆血统</b>
                <span>先天属性 · 与专精自由搭配</span>
              </div>
              <div class="spec-options">
                <button
                  v-for="strain in STRAIN_CHOICES"
                  :key="strain.id"
                  :class="{ selected: selection.strain === strain.id }"
                  :title="strain.desc"
                  @click="selection.strain = strain.id"
                >
                  <span aria-hidden="true">{{ strain.icon }}</span>
                  <b>{{ strain.name }}</b>
                </button>
              </div>
            </section>

            <section class="config-section">
              <div class="section-heading">
                <b>进化方向</b>
                <span>{{ specHint }}</span>
              </div>
              <div class="spec-options">
                <button
                  v-for="spec in SPEC_CHOICES"
                  :key="spec.id"
                  :class="{ selected: selection.spec === spec.id }"
                  :title="spec.roadmap?.join('\n')"
                  @click="selection.spec = spec.id"
                >
                  <span aria-hidden="true">{{ spec.icon }}</span>
                  <b>{{ spec.name }}</b>
                </button>
                <button
                  :class="{ selected: !selection.spec }"
                  title="Lv.5 时自由觉醒主专精"
                  @click="selection.spec = null"
                >
                  <span aria-hidden="true">🧬</span>
                  <b>自由变异</b>
                </button>
              </div>
            </section>

            <section class="config-section rules-section">
              <div class="section-heading"><b>行动规则</b></div>
              <ul>
                <li v-for="fact in modeFacts" :key="fact">{{ fact }}</li>
              </ul>
            </section>
          </div>

          <aside class="record-aside">
            <span>当前规则纪录</span>
            <strong>{{ record.best.score?.toLocaleString('en-US') || '—' }}</strong>
            <dl>
              <div>
                <dt>{{ selection.mode === 'expedition' ? '最高关卡' : '最高波次' }}</dt>
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

        <div class="config-actions">
          <button class="secondary-action" @click="view = 'modes'">更换模式</button>
          <button class="primary-action" @click="prepare">开始行动 <b aria-hidden="true">→</b></button>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.start-overlay {
  position: absolute;
  inset: 0;
  z-index: 30;
  overflow-y: auto;
  color: #eef2ec;
  background: rgba(7, 10, 9, 0.97);
}

.start-shell {
  width: min(1040px, calc(100% - 48px));
  min-height: 100%;
  margin: 0 auto;
  padding: 26px 0 38px;
}

.start-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 54px;
  padding-bottom: 22px;
  border-bottom: 1px solid rgba(230, 236, 227, 0.12);
}

.start-header h1 {
  font-size: 20px;
  letter-spacing: 0;
}

.start-header h1 span {
  display: block;
  margin-top: 3px;
  color: rgba(238, 242, 236, 0.36);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0;
}

.market-link,
.back-link,
.mode-option,
.difficulty-options button,
.spec-options button,
.config-actions button {
  font: inherit;
  cursor: pointer;
}

.market-link {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid rgba(202, 172, 104, 0.3);
  border-radius: 5px;
  color: #d8bc7b;
  background: rgba(202, 172, 104, 0.06);
}

.market-link:hover { background: rgba(202, 172, 104, 0.11); }

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
  color: #8ead83;
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
  color: rgba(238, 242, 236, 0.48);
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
  border: 1px solid rgba(230, 236, 227, 0.13);
  border-radius: 6px;
  color: inherit;
  background: #101413;
  transition: border-color 0.14s ease, background 0.14s ease, transform 0.08s ease;
}

.mode-option:hover {
  border-color: rgba(142, 173, 131, 0.55);
  background: #131917;
}

.mode-option:active { transform: scale(0.99); }
.mode-option:focus-visible,
.market-link:focus-visible,
.back-link:focus-visible,
.difficulty-options button:focus-visible,
.spec-options button:focus-visible,
.config-actions button:focus-visible { outline: 2px solid #b7cfaf; outline-offset: 3px; }

.mode-index {
  color: #76906f;
  font-size: 11px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.mode-option h3 {
  margin-top: 24px;
  font-size: 20px;
  letter-spacing: 0;
}

.mode-option p {
  min-height: 44px;
  margin-top: 9px;
  color: rgba(238, 242, 236, 0.5);
  font-size: 12px;
  line-height: 1.65;
}

.mode-option dl {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 28px;
  padding-top: 14px;
  border-top: 1px solid rgba(230, 236, 227, 0.09);
}

.mode-option dt,
.record-aside dt {
  color: rgba(238, 242, 236, 0.35);
  font-size: 9px;
}

.mode-option dd,
.record-aside dd {
  margin-top: 4px;
  color: #d8c18c;
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.mode-enter {
  display: flex;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 22px;
  color: #b9d4b0;
  font-size: 12px;
  font-weight: 800;
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
  color: rgba(238, 242, 236, 0.48);
  background: rgba(202, 172, 104, 0.045);
  font-size: 11px;
}

.next-unlock b { color: #d8bc7b; font-size: 12px; }
.next-unlock i { font-style: normal; }
.next-unlock.complete { border-left-color: #78966f; background: rgba(120, 150, 111, 0.05); }
.next-unlock.complete b { color: #b7cfaf; }

.config-view {
  position: relative;
  padding-left: 58px;
}

.back-link {
  position: absolute;
  top: 57px;
  left: 0;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 1px solid rgba(230, 236, 227, 0.14);
  border-radius: 5px;
  color: rgba(238, 242, 236, 0.72);
  background: transparent;
  font-size: 18px;
}

.back-link:hover { background: rgba(255, 255, 255, 0.05); }

.config-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 210px;
  gap: 36px;
  margin-top: 31px;
}

.config-section {
  padding: 20px 0 22px;
  border-top: 1px solid rgba(230, 236, 227, 0.1);
}

.section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 11px;
}

.section-heading b { font-size: 13px; }
.section-heading span {
  overflow: hidden;
  color: rgba(238, 242, 236, 0.42);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.difficulty-options {
  display: grid;
  grid-template-columns: repeat(var(--difficulty-count), minmax(0, 1fr));
  gap: 7px;
}

.difficulty-options button,
.spec-options button {
  min-width: 0;
  border: 1px solid rgba(230, 236, 227, 0.13);
  border-radius: 5px;
  color: rgba(238, 242, 236, 0.62);
  background: #0d1110;
  transition: border-color 0.14s ease, background 0.14s ease, color 0.14s ease, transform 0.08s ease;
}

.difficulty-options button {
  min-height: 52px;
  padding: 8px 10px;
  text-align: left;
}

.difficulty-options span,
.difficulty-options i { display: block; }
.difficulty-options span { font-size: 12px; font-weight: 800; }
.difficulty-options i { margin-top: 4px; color: rgba(238, 242, 236, 0.34); font-size: 9px; font-style: normal; }
.difficulty-options button:hover,
.spec-options button:hover { border-color: rgba(183, 207, 175, 0.38); color: #fff; }
.difficulty-options button:active,
.spec-options button:active,
.config-actions button:active { transform: scale(0.98); }
.difficulty-options button.selected,
.spec-options button.selected { border-color: #8ead83; color: #e9f3e5; background: rgba(110, 143, 99, 0.18); }

.spec-options {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 7px;
}

.spec-options button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 66px;
  padding: 7px 5px;
}

.spec-options button span { font-size: 17px; }
.spec-options button b { overflow: hidden; max-width: 100%; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }

.rules-section ul {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 22px;
  color: rgba(238, 242, 236, 0.58);
  font-size: 11px;
  list-style: none;
}

.rules-section li::before { content: '— '; color: #78966f; }

.record-aside {
  padding-left: 25px;
  border-left: 1px solid rgba(230, 236, 227, 0.1);
}

.record-aside > span { color: rgba(238, 242, 236, 0.4); font-size: 10px; }
.record-aside > strong { display: block; margin-top: 9px; color: #dcc58e; font-size: 25px; font-variant-numeric: tabular-nums; }
.record-aside dl { margin-top: 23px; }
.record-aside dl div { padding: 12px 0; border-top: 1px solid rgba(230, 236, 227, 0.08); }

.config-actions {
  display: flex;
  justify-content: flex-end;
  gap: 9px;
  padding-top: 19px;
  border-top: 1px solid rgba(230, 236, 227, 0.11);
}

.config-actions button {
  min-height: 42px;
  padding: 0 20px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 800;
  transition: background 0.14s ease, border-color 0.14s ease, transform 0.08s ease;
}

.secondary-action { border: 1px solid rgba(230, 236, 227, 0.14); color: rgba(238, 242, 236, 0.64); background: transparent; }
.secondary-action:hover { background: rgba(255, 255, 255, 0.045); }
.primary-action {
  min-height: 48px;
  padding: 0 28px;
  border: 1px solid #9dbd92;
  color: #0a0d0c;
  background: #8ead83;
  font-size: 13px;
  box-shadow: 0 3px 16px rgba(142, 173, 131, 0.22);
}
.primary-action b { margin-left: 7px; }
.primary-action:hover { background: #a8c79e; box-shadow: 0 4px 20px rgba(142, 173, 131, 0.38); }

@media (max-width: 760px) {
  .start-shell { width: min(100% - 24px, 620px); padding-top: 14px; }
  .start-header { padding-bottom: 14px; }
  .market-link { padding: 0 10px; font-size: 11px; }
  .mode-view,
  .config-view { padding-top: 34px; }
  .mode-grid,
  .mode-grid.single { grid-template-columns: 1fr; margin-top: 25px; }
  .mode-option { min-height: 218px; }
  .next-unlock { grid-template-columns: 1fr; gap: 4px; padding: 12px 14px; }
  .config-view { padding-left: 0; }
  .back-link { position: static; margin-bottom: 18px; }
  .config-layout { grid-template-columns: 1fr; gap: 10px; }
  .record-aside { padding: 20px 0 0; border-top: 1px solid rgba(230, 236, 227, 0.1); border-left: 0; }
  .record-aside dl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 13px; }
  .record-aside dl div { padding: 9px 0; }
  .spec-options { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .difficulty-options { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .section-heading span { display: none; }
  .config-actions { flex-direction: column-reverse; }
  .config-actions button { width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .mode-option,
  .difficulty-options button,
  .spec-options button,
  .config-actions button { transition: none; }
}
</style>
