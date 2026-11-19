<script setup>
/**
 * GameOverModal：游戏结束结算面板（纯展示组件）
 *
 *  - props 接收引擎 gameOver 回调传来的统计信息（击杀/等级/波次/时长/分数/名次）；
 *  - board 为无尽模式分数榜（Top 8，分数降序）；本次成绩用 entry 引用高亮；
 *  - 点击「再来一局」emit('restart')，由 App.vue 调 engine.reset() + start()；
 *  - 纯展示 + 上报，不持有任何游戏状态。
 */
import { computed } from 'vue'
import { MODES, POINTS_PER_SCORE } from '../game/RunRules.js'

/** 元素图标（生态档案展示） */
const EL_ICONS = { fire: '🔥', water: '💧', poison: '☠️', lightning: '⚡' }
/** 前三名奖牌（分数榜行首） */
const MEDALS = ['🥇', '🥈', '🥉']

const props = defineProps({
  info: { type: Object, required: true },
  best: { type: Object, default: () => ({ wave: 1, kills: 0, time: 0 }) },
  board: { type: Array, default: () => [] },
  publicBoard: { type: Object, default: null },
  isNewRecord: { type: Boolean, default: false },
})
const emit = defineEmits(['restart', 'market', 'menu'])
const victory = computed(() => props.info?.result === 'victory')
const extracted = computed(() => props.info?.result === 'extracted')
const totalStages = computed(() => props.info?.totalStages || 6)
const resultTitle = computed(() => {
  if (extracted.value) return '带着战力点安全撤离'
  if (!victory.value) {
    if (props.info?.defeatReason === 'nest-destroyed') return '巢心被净化了'
    if (props.info?.defeatReason === 'beacon-timeout') return '信标任务超时'
    return '史莱姆倒下了'
  }
  return props.info?.mode === 'expedition' ? '讨伐统帅已被吞噬' : '终审勇者已被吞噬'
})

/** 时长格式化（mm:ss），info.elapsed 可选链兜底防漏传 */
const fmtTime = (s) => {
  const sec = Math.floor(s || 0)
  const m = Math.floor(sec / 60)
  return `${m}:${String(sec % 60).padStart(2, '0')}`
}

const timeText = computed(() => fmtTime(props.info?.elapsed))

/** 历史最高时长（mm:ss） */
const bestTimeText = computed(() => fmtTime(props.best?.time))

/** 本局分数（千分位） */
const scoreText = computed(() => (props.info?.score || 0).toLocaleString('en-US'))
const highlights = computed(() => props.info?.highlights || {})
const highlightRows = computed(() => [
  { label: '最高连续击杀', value: highlights.value.bestCombo || 0, unit: '连杀' },
  { label: '重击最高收割', value: highlights.value.bestBurst || 0, unit: '名' },
  { label: '讨伐小队破阵', value: highlights.value.squadBreaks || 0, unit: '次' },
  { label: '战獒奔潮击杀', value: highlights.value.swarmKills || 0, unit: '只' },
  ...(highlights.value.overflowWaves ? [{ label: '饱食酸浪', value: highlights.value.overflowWaves, unit: '次' }] : []),
])
const publicEntries = computed(() => props.publicBoard?.entries || [])
const accountSyncText = computed(() => {
  if (props.info?.accountSync === 'synced') {
    const rank = props.publicBoard?.currentRank ? ` · 公共榜第 ${props.publicBoard.currentRank}` : ''
    return `已保存到账号${rank}`
  }
  return `等待同步到账号${props.info?.accountSyncError ? `：${props.info.accountSyncError}` : ''}`
})

const scoreRows = computed(() => {
  const b = props.info?.scoreBreakdown || {}
  const rows = [
    { label: '战斗击杀', detail: `${props.info?.kills || 0} × 10`, value: b.combat || 0 },
    { label: '主动吞噬', detail: `${props.info?.devours || 0} × 15`, value: b.devour || 0 },
    { label: '精英猎杀', detail: `${props.info?.eliteKills || 0} × 75`, value: b.elite || 0 },
    { label: '王级勇者', detail: `${props.info?.bossKills || 0} × 500`, value: b.boss || 0 },
    { label: '地图事件', detail: `${props.info?.eventsCompleted || 0} × 350`, value: b.events || 0 },
    {
      label: props.info?.mode === 'expedition' ? '章节推进' : '波次推进',
      detail: props.info?.mode === 'expedition'
        ? `抵达第 ${props.info?.stage || 1} / ${props.info?.totalStages || 6} 章`
        : `通过 ${Math.max(0, Math.min(props.info?.mode === 'timed' ? 24 : 9999, props.info?.wave || 1) - 1)} 波`,
      value: b.progress || 0,
    },
  ]
  if (b.victory) {
    rows.push({
      label: props.info?.mode === 'expedition' ? '远征通关' : '终局通关',
      detail: props.info?.mode === 'expedition' ? '击败讨伐统帅' : '击败终审勇者',
      value: b.victory,
    })
  }
  if (b.finaleSpeed) rows.push({ label: '终局速度', detail: fmtTime(props.info?.finaleTime), value: b.finaleSpeed })
  if (b.clearSpeed) rows.push({ label: '远征速度', detail: fmtTime(props.info?.elapsed), value: b.clearSpeed })
  return rows
})

/** 分数榜行首标记：前三奖牌，其余 #n */
const rankBadge = (i) => (i < 3 ? MEDALS[i] : `#${i + 1}`)

/** 本局战力点入账（分数 ÷ POINTS_PER_SCORE × 倍率，与服务端入账共用 scoreToPoints 口径） */
const pointsText = computed(() => `${Math.floor(props.info?.earnedDrops || 0)}`)
</script>

<template>
  <div class="gameover-overlay" role="dialog" aria-modal="true" aria-label="本局结算">
    <div class="gameover-panel" :class="{ victory, extracted }">
      <div class="gameover-content">
        <div class="result-kicker">{{ info.modeName }} · {{ info.difficultyName }}</div>
        <h2 class="gameover-title">{{ resultTitle }}</h2>
        <blockquote v-if="victory && info.epilogue" class="boss-epilogue">
          <p>“{{ info.epilogue.text }}”</p>
          <cite>— {{ info.epilogue.speaker }}</cite>
        </blockquote>
        <div class="gameover-stats">
          <div class="stat"><span>{{ info.mode === 'expedition' ? '章节' : '波次' }}</span><b>{{ info.mode === 'expedition' ? `${info.stage}/${totalStages}` : info.wave }}</b></div>
          <div class="stat"><span>等级</span><b>{{ info.level }}</b></div>
          <div class="stat"><span>击杀</span><b>{{ info.kills }}</b></div>
          <div class="stat"><span>存活</span><b>{{ timeText }}</b></div>
          <div class="stat score"><span>分数</span><b>{{ scoreText }}</b></div>
        </div>
        <div v-if="info.highlights" class="combat-highlights">
          <div class="breakdown-heading"><b>战斗高光</b><span>连续击杀间隔不超过 1.8 秒</span></div>
          <div class="highlight-grid">
            <div v-for="row in highlightRows" :key="row.label" class="highlight-stat">
              <span>{{ row.label }}</span><b>{{ row.value.toLocaleString('zh-CN') }} <small>{{ row.unit }}</small></b>
            </div>
          </div>
        </div>
        <div class="score-breakdown">
          <div class="breakdown-heading">
            <b>得分明细</b>
            <span>存活时间不重复计分</span>
          </div>
          <div v-for="row in scoreRows" :key="row.label" class="breakdown-row">
            <span>{{ row.label }}</span>
            <i>{{ row.detail }}</i>
            <b>+{{ row.value.toLocaleString('en-US') }}</b>
          </div>
        </div>
        <div class="gameover-drops">
          🎒 战力点
          <span class="drop-list">
            <span class="drop-total">分数 {{ scoreText }} ÷ {{ POINTS_PER_SCORE }} · 入账 <b>{{ pointsText }}</b> 点</span>
          </span>
          <b v-if="info.mode === 'endless'">
            结算倍率 ×{{ Number(info.effectiveMultiplier || info.rewardMultiplier || 1).toFixed(2) }} ·
            {{ info.defeatRetention < 1 ? `战败保留 ${Math.round(info.defeatRetention * 100)}%` : '安全结算 100%' }} ·
            完成悬赏 {{ info.bountiesCompleted || 0 }}
          </b>
          <b v-else>难度倍率 ×{{ info.rewardMultiplier }}</b>
        </div>
        <div class="sync-banner" :class="info.accountSync">{{ accountSyncText }}</div>
        <div v-if="info.unlocked" class="unlock-banner">
          新难度已解锁：{{ info.unlocked === 'hell' ? '地狱' : '困难' }}
        </div>
        <div v-if="info.unlockedMode" class="unlock-banner mode-unlock-banner">
          新模式已解锁：{{ MODES[info.unlockedMode]?.name || info.unlockedMode }}
        </div>
        <div class="gameover-species">
          <div class="species-name">{{ info.species?.threatIcon }} {{ info.species?.name || '普通史莱姆' }}</div>
          <div class="species-threat">威胁评估：{{ info.species?.threat || '地下城原生物种' }}</div>
          <div v-if="info.species?.elements?.length" class="species-line">
            元素构成：
            <span v-for="el in info.species.elements" :key="el.id" class="species-el">
              {{ EL_ICONS[el.id] }} {{ el.share }}%
            </span>
          </div>
          <div v-if="info.species?.genes?.length" class="species-line">
            基因突变：
            <span v-for="g in info.species.genes" :key="g.id" class="species-gene">{{ g.name }} Lv.{{ g.lv }}</span>
          </div>
          <div v-if="info.species?.behavior?.length" class="species-line">
            代表行为：
            <span v-for="b in info.species.behavior" :key="b" class="species-gene">{{ b }}</span>
          </div>
          <div v-if="info.species?.secondary?.length" class="species-line">
            副反应：
            <span v-for="s in info.species.secondary" :key="s" class="species-gene">{{ s }}</span>
          </div>
        </div>
        <!-- 无尽模式分数榜（阶段十二）：Top 8，本次成绩金色高亮 -->
        <div v-if="board.length" class="gameover-board">
          <div class="board-title">🏆 勇者通缉榜</div>
          <div
            v-for="(row, i) in board"
            :key="i"
            class="board-row"
            :class="{ current: row === info.entry }"
          >
            <span class="board-rank">{{ rankBadge(i) }}</span>
            <span class="board-score">{{ row.score.toLocaleString('en-US') }}</span>
            <span class="board-meta">
              <template v-if="info.mode === 'timed'">
                {{ row.result === 'victory' ? `通关 · 终局 ${fmtTime(row.finaleTime)}` : `败退 · 波${row.wave}` }}
              </template>
              <template v-else-if="info.mode === 'expedition'">
                {{ row.result === 'victory' ? `通关 · ${fmtTime(row.time)}` : `败退 · 第${row.stage}/${totalStages}章` }}
              </template>
              <template v-else>{{ row.result === 'extracted' ? '撤离' : '败退' }} · 波{{ row.wave }} · 杀{{ row.kills }} · {{ fmtTime(row.time) }}</template>
            </span>
            <span class="board-species">{{ row.species }}</span>
            <i v-if="row === info.entry" class="board-tag">本次</i>
          </div>
          <div v-if="info.rank === 0" class="board-miss">本次成绩未上榜，继续变强！</div>
        </div>
        <div v-if="publicEntries.length" class="gameover-board public">
          <div class="board-title">公共排行榜</div>
          <div
            v-for="entry in publicEntries.slice(0, 8)"
            :key="entry.runId"
            class="board-row"
            :class="{ current: entry.current }"
          >
            <span class="board-rank">#{{ entry.rank }}</span>
            <span class="board-score">{{ entry.score.toLocaleString('en-US') }}</span>
            <span class="board-meta">
              <template v-if="info.mode === 'timed'">
                {{ entry.result === 'victory' ? `通关 · 终局 ${fmtTime(entry.finaleTime)}` : `败退 · 波${entry.wave}` }}
              </template>
              <template v-else-if="info.mode === 'expedition'">
                {{ entry.result === 'victory' ? `通关 · ${fmtTime(entry.time)}` : `败退 · 第${entry.stage}/${totalStages}章` }}
              </template>
              <template v-else>{{ entry.result === 'extracted' ? '撤离' : '败退' }} · 波{{ entry.wave }} · {{ fmtTime(entry.time) }}</template>
            </span>
            <span class="board-species">{{ entry.username }} · {{ entry.species }}</span>
            <i v-if="entry.current" class="board-tag">我的</i>
          </div>
        </div>
        <div class="gameover-best" :class="{ new: isNewRecord }">
          {{ isNewRecord ? '当前规则新纪录' : '当前规则最高纪录' }} ·
          {{ best.score?.toLocaleString('en-US') || 0 }} 分 ·
          {{ info.mode === 'expedition' ? `章节 ${best.stage || 1}/${totalStages}` : `波次 ${best.wave}` }} ·
          击杀 {{ best.kills }} · {{ bestTimeText }}
        </div>
        <div class="gameover-hint">{{ victory ? '新的威胁等级正等待挑战。' : extracted ? '这批战力点已完整入账，可以整备后再次深入。' : info.defeatReason === 'nest-destroyed' ? '净化兵突破了防线，优先拦截奔向巢心的近战单位。' : info.defeatReason === 'beacon-timeout' ? '未能在时限内摧毁迁跃信标，王城增援已经抵达。' : '调整构筑或规则，再次迎战勇者。' }}</div>
      </div>
      <footer class="gameover-footer">
        <div class="result-actions">
          <button class="restart-btn" @click="emit('restart')">重新开始</button>
          <button class="rules-btn" @click="emit('menu')">返回主页</button>
        </div>
        <button class="market-btn" @click="emit('market')">🏪 去黑市强化基因</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.gameover-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--adventure-scrim);
  backdrop-filter: blur(4px);
}

.gameover-panel {
  width: min(760px, calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 32px);
  overflow: hidden;
  text-align: center;
  border-radius: 12px;
  border: 1px solid var(--adventure-line);
  background: var(--adventure-paper);
  box-shadow: var(--adventure-shadow);
}

.gameover-content {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  padding: 25px 35px 18px;
}

.gameover-footer {
  flex: none;
  padding: 12px 20px 14px;
  border-top: 1px solid var(--adventure-line);
  background: var(--adventure-paper);
}

.gameover-title {
  font-size: 30px;
  font-weight: 800;
  letter-spacing: 0;
  color: var(--adventure-danger);
  margin-bottom: 26px;
}

.result-kicker {
  margin-bottom: 7px;
  color: var(--adventure-muted);
  font-size: 11px;
}

.gameover-panel.victory {
  border-color: rgba(138, 232, 74, 0.4);
  background: var(--adventure-paper);
}

.gameover-panel.victory .gameover-title {
  color: var(--adventure-green);
}

.gameover-panel.extracted {
  border-color: rgba(101, 170, 126, 0.5);
  background: var(--adventure-paper);
}

.gameover-panel.extracted .gameover-title {
  color: var(--adventure-green);
}

.boss-epilogue {
  margin: -13px auto 22px;
  color: var(--adventure-muted);
}

.boss-epilogue p {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
}

.boss-epilogue cite {
  display: block;
  margin-top: 3px;
  color: var(--adventure-gold);
  font-size: 10px;
  font-style: normal;
}

.gameover-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(80px, 1fr)) minmax(130px, 1.35fr);
  gap: 14px;
  margin-bottom: 22px;
}

.stat span {
  display: block;
  font-size: 12px;
  color: var(--adventure-muted);
  letter-spacing: 0;
  margin-bottom: 6px;
}

.stat b {
  font-size: 26px;
  color: var(--adventure-danger);
}

/* 分数格：金色突出（无尽模式得分） */
.stat.score b {
  color: var(--adventure-gold);
}

.score-breakdown {
  margin-bottom: 18px;
  padding: 14px 0 12px;
  border-top: 1px solid var(--adventure-line);
  border-bottom: 1px solid var(--adventure-line);
}

.combat-highlights { margin: 0 0 18px; text-align: left; }
.highlight-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 20px; }
.highlight-stat { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--adventure-line); }
.highlight-stat > span { font-size: 12px; color: var(--adventure-muted); }
.highlight-stat b { color: var(--adventure-green); font-size: 18px; font-variant-numeric: tabular-nums; }
.highlight-stat small { font-size: 10px; color: var(--adventure-muted); font-weight: 400; }
@media (max-width: 480px) { .highlight-grid { gap: 4px 12px; } .combat-highlights .breakdown-heading { display: flex; flex-wrap: wrap; gap: 5px; justify-content: space-between; } }

.breakdown-heading,
.breakdown-row {
  display: grid;
  grid-template-columns: 1fr 1fr 88px;
  align-items: baseline;
  gap: 14px;
  text-align: left;
}

.breakdown-heading {
  margin-bottom: 8px;
}

.breakdown-heading b {
  font-size: 13px;
  color: var(--adventure-muted);
}

.breakdown-heading span {
  grid-column: 2 / 4;
  text-align: right;
  font-size: 11px;
  color: var(--adventure-muted);
}

.breakdown-row {
  min-height: 25px;
  font-size: 12px;
  color: var(--adventure-muted);
}

.breakdown-row i {
  font-style: normal;
  color: var(--adventure-muted);
}

.breakdown-row b {
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--adventure-gold);
}

/* 无尽模式分数榜（阶段十二） */
.gameover-board {
  margin-bottom: 16px;
  padding: 14px 0 10px;
  border-top: 1px solid rgba(255, 209, 102, 0.22);
  border-bottom: 1px solid rgba(255, 209, 102, 0.14);
}

.gameover-board.public {
  border-top-color: rgba(138, 232, 74, 0.18);
  border-bottom-color: rgba(138, 232, 74, 0.12);
}

.gameover-board.public .board-title {
  color: var(--adventure-green);
}

.board-title {
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0;
  color: var(--adventure-gold);
}

.board-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px;
  border-radius: 8px;
  font-size: 12.5px;
  color: var(--adventure-muted);
}

.board-rank {
  width: 34px;
  text-align: center;
  font-weight: 800;
  color: var(--adventure-gold);
}

.board-score {
  width: 74px;
  text-align: right;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--adventure-gold);
}

.board-meta {
  width: 130px;
  text-align: left;
  font-variant-numeric: tabular-nums;
  color: var(--adventure-muted);
}

.board-species {
  flex: 1;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--adventure-muted);
}

.board-tag {
  font-style: normal;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
  color: #1a1206;
  background: #ffd166;
}

.board-row.current {
  background: rgba(255, 209, 102, 0.14);
  outline: 1px solid rgba(255, 209, 102, 0.45);
}

.board-miss {
  margin-top: 6px;
  font-size: 12px;
  color: var(--adventure-muted);
}

.restart-btn {
  padding: 12px 42px;
  border: none;
  border-radius: 7px;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0;
  color: #fff;
  background: var(--adventure-green);
  cursor: pointer;
  transition: background 0.12s ease, transform 0.12s ease;
}

.result-actions {
  display: flex;
  justify-content: center;
  gap: 9px;
}

.rules-btn {
  padding: 12px 28px;
  border: 1px solid var(--adventure-line);
  border-radius: 7px;
  color: var(--adventure-muted);
  background: var(--adventure-leaf);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.rules-btn:hover {
  background: #dce9de;
}

.restart-btn:hover {
  background: var(--adventure-green-hover);
}

.restart-btn:active,
.market-btn:active {
  transform: scale(0.98);
}

.restart-btn:focus-visible,
.market-btn:focus-visible,
.rules-btn:focus-visible {
  outline: 2px solid var(--adventure-focus);
  outline-offset: 3px;
}

.gameover-drops {
  margin-bottom: 12px;
  font-size: 13.5px;
  letter-spacing: 0;
  color: var(--adventure-muted);
}

.gameover-drops b {
  display: block;
  margin-top: 6px;
  color: var(--adventure-green);
  font-size: 12px;
}

.drop-list {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 3px 8px;
  margin-left: 4px;
  vertical-align: middle;
}

.drop-total {
  white-space: nowrap;
}

.sync-banner {
  margin: 0 0 12px;
  padding: 8px 11px;
  border: 1px solid var(--adventure-line);
  border-radius: 6px;
  color: var(--adventure-muted);
  background: var(--adventure-paper);
  font-size: 12px;
  font-weight: 700;
}

.sync-banner.synced {
  border-color: rgba(138, 232, 74, 0.3);
  color: var(--adventure-green);
  background: rgba(138, 232, 74, 0.07);
}

.sync-banner.pending {
  border-color: rgba(255, 138, 138, 0.34);
  color: var(--adventure-danger);
  background: rgba(255, 82, 82, 0.08);
}

.unlock-banner {
  margin: 0 0 14px;
  padding: 9px 12px;
  border: 1px solid rgba(255, 209, 102, 0.42);
  border-radius: 6px;
  color: var(--adventure-gold);
  background: rgba(255, 209, 102, 0.08);
  font-size: 13px;
  font-weight: 800;
}

.mode-unlock-banner {
  border-color: rgba(138, 192, 116, 0.42);
  color: var(--adventure-green);
  background: rgba(111, 160, 91, 0.09);
}

/* 物种生态档案（评审：可截图的传播点） */
.gameover-species {
  margin-bottom: 16px;
  padding: 14px 0;
  border-top: 1px solid rgba(138, 232, 74, 0.18);
  border-bottom: 1px solid rgba(138, 232, 74, 0.12);
}

.species-name {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 0;
  color: var(--adventure-green);
}

.species-threat {
  margin-top: 4px;
  font-size: 12.5px;
  letter-spacing: 0;
  color: var(--adventure-danger);
}

.species-line {
  margin-top: 6px;
  font-size: 12px;
  color: var(--adventure-muted);
}

.species-el,
.species-gene {
  margin-left: 8px;
  color: var(--adventure-muted);
}

.gameover-best {
  margin-bottom: 22px;
  font-size: 13px;
  letter-spacing: 0;
  color: var(--adventure-gold);
}

.gameover-best.new {
  color: var(--adventure-gold);
  font-weight: 700;
}

.market-btn {
  display: block;
  margin: 12px auto 0;
  padding: 10px 34px;
  border: 1px solid rgba(255, 209, 102, 0.4);
  border-radius: 7px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0;
  color: var(--adventure-gold);
  background: rgba(255, 209, 102, 0.08);
  cursor: pointer;
  transition: background 0.12s ease, transform 0.12s ease;
}

.market-btn:hover {
  background: rgba(255, 209, 102, 0.16);
}

.gameover-hint {
  margin-top: 18px;
  font-size: 12.5px;
  color: var(--adventure-muted);
}

@media (max-width: 700px) {
  .gameover-panel {
    width: calc(100vw - 20px);
    max-height: calc(100dvh - 20px);
  }

  .gameover-content { padding: 18px 16px; }
  .gameover-footer { padding: 10px 14px; }

  .gameover-title {
    font-size: 24px;
    margin-bottom: 20px;
  }

  .gameover-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .stat.score {
    grid-column: 1 / 3;
  }

  .result-actions button {
    flex: 1;
    padding: 11px 8px;
    font-size: 14px;
  }

  .breakdown-heading,
  .breakdown-row {
    grid-template-columns: 1fr 1fr 68px;
    gap: 8px;
  }

  .board-species {
    display: none;
  }

  .board-meta {
    flex: 1;
    width: auto;
  }
}
</style>
