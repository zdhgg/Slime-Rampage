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
import { MODES, sumDrops } from '../game/RunRules.js'

/** 元素图标（生态档案展示） */
const EL_ICONS = { fire: '🔥', water: '💧', poison: '☠️', lightning: '⚡' }
/** 前三名奖牌（分数榜行首） */
const MEDALS = ['🥇', '🥈', '🥉']
const LOOT_ICONS = {
  knight: '🛡️',
  mage: '📖',
  archer: '🏹',
  assassin: '🗡️',
  priest: '⛪',
  berserker: '🪓',
  hound: '🐕',
  golem: '🗿',
  wraith: '👻',
}

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
  if (extracted.value) return '带着战利品安全撤离'
  if (!victory.value) {
    return props.info?.defeatReason === 'nest-destroyed' ? '巢心被净化了' : '史莱姆倒下了'
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
const publicEntries = computed(() => props.publicBoard?.entries || [])
const lanSyncText = computed(() => {
  if (props.info?.lanSync === 'synced') {
    const rank = props.publicBoard?.currentRank ? ` · 全员第 ${props.publicBoard.currentRank}` : ''
    return `局域网公共榜已同步${rank}`
  }
  if (props.info?.lanSync === 'failed') {
    const fallback = props.info?.lanLocalFallback ? '，本局已保存到本机档案' : ''
    return `局域网同步失败${fallback}：${props.info?.lanSyncError || '请稍后重试'}`
  }
  return '本局保存到本机档案'
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

/** 本局九类掉落物总数（黑市货币；与 App 结算入账共用 sumDrops 口径） */
const dropTotal = computed(() => sumDrops(props.info.drops))
const dropEntries = computed(() =>
  Object.entries(LOOT_ICONS)
    .map(([id, icon]) => ({ id, icon, count: props.info.drops?.[id] || 0 }))
    .filter((entry) => entry.count > 0)
)
</script>

<template>
  <div class="gameover-overlay" role="dialog" aria-modal="true" aria-label="本局结算">
    <div class="gameover-panel" :class="{ victory, extracted }">
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
        🎒 战利品
        <span v-if="dropTotal === 0">空空如也…</span>
        <span v-else class="drop-list">
          <span v-for="entry in dropEntries" :key="entry.id" class="loot-item">
            {{ entry.icon }}×{{ entry.count }}
          </span>
          <span class="drop-total">（战斗获得 {{ dropTotal }}）</span>
        </span>
        <b v-if="info.mode === 'endless'">
          结算倍率 ×{{ Number(info.lootMultiplier || info.rewardMultiplier || 1).toFixed(2) }} ·
          {{ info.lootRetention < 1 ? `战败保留 ${Math.round(info.lootRetention * 100)}%` : '安全结算 100%' }} ·
          实际入账 {{ info.earnedDrops || 0 }} · 完成悬赏 {{ info.bountiesCompleted || 0 }}
        </b>
        <b v-else>难度倍率 ×{{ info.rewardMultiplier }} · 实际入账 {{ info.earnedDrops || 0 }}</b>
      </div>
      <div class="sync-banner" :class="info.lanSync">{{ lanSyncText }}</div>
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
        <div class="board-title">局域网全员榜</div>
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
      <div class="result-actions">
        <button class="restart-btn" @click="emit('restart')">重新开始</button>
        <button class="rules-btn" @click="emit('menu')">返回主页</button>
      </div>
      <button class="market-btn" @click="emit('market')">🏪 去黑市强化基因</button>
      <div class="gameover-hint">{{ victory ? '新的威胁等级正等待挑战。' : extracted ? '这批战利品已完整入账，可以整备后再次深入。' : info.defeatReason === 'nest-destroyed' ? '净化兵突破了防线，优先拦截奔向巢心的近战单位。' : '调整构筑或规则，再次迎战勇者。' }}</div>
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
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
}

.gameover-panel {
  width: min(760px, calc(100vw - 32px));
  max-height: 92vh;
  overflow-y: auto;
  text-align: center;
  padding: 30px 36px 28px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(20, 15, 15, 0.97);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.52);
}

.gameover-title {
  font-size: 30px;
  font-weight: 800;
  letter-spacing: 0;
  color: #ffd7d7;
  margin-bottom: 26px;
}

.result-kicker {
  margin-bottom: 7px;
  color: rgba(255, 255, 255, 0.48);
  font-size: 11px;
}

.gameover-panel.victory {
  border-color: rgba(138, 232, 74, 0.4);
  background: rgba(12, 20, 13, 0.97);
}

.gameover-panel.victory .gameover-title {
  color: #d2ff8a;
}

.gameover-panel.extracted {
  border-color: rgba(101, 170, 126, 0.5);
  background: rgba(13, 20, 16, 0.97);
}

.gameover-panel.extracted .gameover-title {
  color: #b9ebc7;
}

.boss-epilogue {
  margin: -13px auto 22px;
  color: rgba(240, 239, 226, 0.76);
}

.boss-epilogue p {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
}

.boss-epilogue cite {
  display: block;
  margin-top: 3px;
  color: rgba(200, 169, 104, 0.72);
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
  color: rgba(255, 255, 255, 0.55);
  letter-spacing: 0;
  margin-bottom: 6px;
}

.stat b {
  font-size: 26px;
  color: #ff8a8a;
}

/* 分数格：金色突出（无尽模式得分） */
.stat.score b {
  color: #ffd166;
}

.score-breakdown {
  margin-bottom: 18px;
  padding: 14px 0 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

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
  color: rgba(255, 255, 255, 0.88);
}

.breakdown-heading span {
  grid-column: 2 / 4;
  text-align: right;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

.breakdown-row {
  min-height: 25px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.64);
}

.breakdown-row i {
  font-style: normal;
  color: rgba(255, 255, 255, 0.38);
}

.breakdown-row b {
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: #e8d49a;
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
  color: #d2ff8a;
}

.board-title {
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0;
  color: #ffd166;
}

.board-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px;
  border-radius: 8px;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.75);
}

.board-rank {
  width: 34px;
  text-align: center;
  font-weight: 800;
  color: rgba(255, 209, 102, 0.75);
}

.board-score {
  width: 74px;
  text-align: right;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: #ffd166;
}

.board-meta {
  width: 130px;
  text-align: left;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.55);
}

.board-species {
  flex: 1;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(255, 255, 255, 0.6);
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
  color: rgba(255, 255, 255, 0.45);
}

.restart-btn {
  padding: 12px 42px;
  border: none;
  border-radius: 7px;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0;
  color: #0c120d;
  background: #8cda61;
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
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 7px;
  color: rgba(255, 255, 255, 0.82);
  background: rgba(255, 255, 255, 0.06);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.rules-btn:hover {
  background: rgba(255, 255, 255, 0.11);
}

.restart-btn:hover {
  background: #a1e77a;
}

.restart-btn:active,
.market-btn:active {
  transform: scale(0.98);
}

.restart-btn:focus-visible,
.market-btn:focus-visible,
.rules-btn:focus-visible {
  outline: 2px solid rgba(210, 255, 138, 0.9);
  outline-offset: 3px;
}

.gameover-drops {
  margin-bottom: 12px;
  font-size: 13.5px;
  letter-spacing: 0;
  color: rgba(255, 255, 255, 0.7);
}

.gameover-drops b {
  display: block;
  margin-top: 6px;
  color: #d2ff8a;
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

.loot-item,
.drop-total {
  white-space: nowrap;
}

.sync-banner {
  margin: 0 0 12px;
  padding: 8px 11px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.62);
  background: rgba(255, 255, 255, 0.04);
  font-size: 12px;
  font-weight: 700;
}

.sync-banner.synced {
  border-color: rgba(138, 232, 74, 0.3);
  color: #d2ff8a;
  background: rgba(138, 232, 74, 0.07);
}

.sync-banner.failed {
  border-color: rgba(255, 138, 138, 0.34);
  color: #ffb0a5;
  background: rgba(255, 82, 82, 0.08);
}

.unlock-banner {
  margin: 0 0 14px;
  padding: 9px 12px;
  border: 1px solid rgba(255, 209, 102, 0.42);
  border-radius: 6px;
  color: #ffd166;
  background: rgba(255, 209, 102, 0.08);
  font-size: 13px;
  font-weight: 800;
}

.mode-unlock-banner {
  border-color: rgba(138, 192, 116, 0.42);
  color: #bde5aa;
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
  color: #d2ff8a;
}

.species-threat {
  margin-top: 4px;
  font-size: 12.5px;
  letter-spacing: 0;
  color: #ff8a8a;
}

.species-line {
  margin-top: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.species-el,
.species-gene {
  margin-left: 8px;
  color: rgba(255, 255, 255, 0.85);
}

.gameover-best {
  margin-bottom: 22px;
  font-size: 13px;
  letter-spacing: 0;
  color: rgba(255, 209, 102, 0.65);
}

.gameover-best.new {
  color: #ffd166;
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
  color: #ffd166;
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
  color: rgba(255, 255, 255, 0.45);
}

@media (max-width: 700px) {
  .gameover-panel {
    width: calc(100vw - 20px);
    max-height: 96vh;
    padding: 24px 18px;
  }

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

  .result-actions {
    flex-direction: column;
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
