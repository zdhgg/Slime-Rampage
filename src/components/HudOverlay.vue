<script setup>
/**
 * HUD 覆盖层：stats/cooldown 快照驱动的纯展示组件（无引擎引用）。
 * 从 App.vue 拆出（前端 P2 瘦身）——App 只保留引擎桥接与模态编排，
 * 本组件持有全部 HUD 派生计算（进度百分比/方向箭头/状态文案）与样式。
 * 数据源约定：stats 由引擎 onStats 以 ~2Hz 整树替换（shallowRef 快照），
 * cooldown 由 onCooldown 以 ~10Hz 推送（连续条平滑数据源）。
 */
import { computed } from 'vue'
import { SPEC_INFO } from '../game/SkillPool.js'
import { formatRunClock } from '../game/RunRules.js'

const props = defineProps({
  stats: { type: Object, required: true },
  cooldown: { type: Object, required: true },
  muted: { type: Boolean, default: false },
  paused: { type: Boolean, default: false },
  buttonsVisible: { type: Boolean, default: true },
  toast: { type: String, default: '' },
  toastKind: { type: String, default: 'info' },
  evolution: { type: Object, default: null },
})
const emit = defineEmits(['toggle-mute', 'toggle-pause', 'toggle-resume'])
const WEAPON_MUTATIONS = new Set(['gluttony', 'gatling', 'elemental', 'assassin'])
const isWeaponEvolution = computed(() => WEAPON_MUTATIONS.has(props.evolution?.mutation))

// 元素指示常量（HUD 展示用，与引擎侧元素 id 一致；effect/combo 为悬停说明）
const ELEMENTS = [
  { id: 'fire', icon: '🔥', effect: '每级：命中 10% 概率引燃（2s，伤害随攻击力成长）', combo: '组合：+💧 蒸汽迷雾 ／ +☠️ 爆炸酸液 ／ +⚡ 爆裂' },
  { id: 'water', icon: '💧', effect: '每级：命中 8% 概率冻结（1.2s）', combo: '组合：+🔥 蒸汽迷雾 ／ +⚡ 雷涌凝胶 ／ +☠️ 腐蚀' },
  { id: 'poison', icon: '☠️', effect: '每级：命中 10% 概率中毒（3s，伤害随攻击力成长）', combo: '组合：+🔥 爆炸酸液 ／ +⚡ 毒雷风暴 ／ +💧 腐蚀' },
  { id: 'lightning', icon: '⚡', effect: '每级：命中 7% 概率麻痹（0.6s）', combo: '组合：+💧 雷涌凝胶 ／ +☠️ 毒雷风暴 ／ +🔥 爆裂' },
]

const runStatusText = computed(() => {
  const run = props.stats.run
  if (!run) return ''
  if (run.mode === 'timed') {
    if (run.state === 'finale') return `终局 ${formatRunClock(run.finaleTime)}`
    return `剩余 ${formatRunClock(Math.ceil(run.remaining || 0))}`
  }
  if (run.mode === 'expedition') return `第 ${run.stage || 1} / ${run.totalStages || 6} 关`
  return run.disasterTier > 0 ? `灾变 ${run.disasterTier}` : '灾变未至'
})
const expeditionPercent = computed(() => {
  const objective = props.stats.run?.objective
  if (!objective?.total) return 0
  return Math.max(0, Math.min(100, (objective.progress / objective.total) * 100))
})
const expeditionMetric = computed(() => {
  const objective = props.stats.run?.objective
  if (!objective) return ''
  if (objective.type === 'survive') return `${Math.floor(objective.progress)} / ${objective.total}s`
  if (objective.type === 'mixed') {
    return `击杀 ${objective.kills}/${objective.total / 2} · 事件 ${objective.events}/${objective.eventTarget}`
  }
  return `${Math.floor(objective.progress)} / ${objective.total}`
})

const expPercent = computed(() =>
  props.stats.maxExp > 0 ? Math.min(100, (props.stats.exp / props.stats.maxExp) * 100) : 0
)
const dashPercent = computed(() =>
  props.cooldown.dashMax > 0
    ? Math.max(0, 100 - (props.cooldown.dashCd / props.cooldown.dashMax) * 100)
    : 100
)
const bossPercent = computed(() =>
  props.stats.boss?.maxHp > 0 ? Math.max(0, (props.stats.boss.hp / props.stats.boss.maxHp) * 100) : 0
)
const objectivePercent = computed(() => {
  const objective = props.stats.objective
  if (!objective?.total) return 0
  return Math.max(0, Math.min(100, (objective.progress / objective.total) * 100))
})
const objectiveArrow = computed(() => {
  const objective = props.stats.objective
  if (!objective) return ''
  const angle = Math.atan2(objective.y - props.stats.y, objective.x - props.stats.x)
  const arrows = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗']
  return arrows[(Math.round(angle / (Math.PI / 4)) + 8) % 8]
})
const objectiveMetric = computed(() => {
  const objective = props.stats.objective
  if (!objective) return ''
  if (objective.state === 'available') return `${Math.max(0, Math.round(objective.distance / 10))}m`
  if (objective.state === 'complete') return '完成'
  if (objective.state === 'failed') return '失败'
  if (objective.type === 'hunt') return `${Math.floor(objective.progress)} / ${objective.total}`
  if (objective.type === 'beacon') return `${objective.progress.toFixed(1)} / ${objective.total}s`
  return `${Math.ceil(objective.timeLeft)}s`
})

/** 元素当前等级（stats.elements 为 [{id, lv}]） */
const elementLevel = (id) => props.stats.elements.find((e) => e.id === id)?.lv || 0
</script>

<template>
  <div class="hud">
    <div class="hud-title">
      史莱姆大暴走<span>SLIME RAMPAGE</span>
    </div>
    <div class="hud-level">
      <div class="hud-level-txt">Lv.{{ stats.level }}</div>
      <div class="hud-level-bar">
        <i :style="{ width: expPercent + '%' }"></i>
      </div>
      <div class="hud-hp">
        <span v-for="i in stats.maxHp" :key="i" class="hp-dot" :class="{ lost: i > stats.hp }"></span>
      </div>
      <div class="hud-wave">波次 {{ stats.wave }}<i>{{ stats.waveName }}</i></div>
      <!-- 元素指示：点亮已吸收的元素并显示等级（评审 Day 2：💧2 ⚡3） -->
      <div class="hud-elements">
        <span
          v-for="el in ELEMENTS"
          :key="el.id"
          class="el-dot"
          :class="[el.id, { active: elementLevel(el.id) > 0 }]"
          :title="el.effect + ' | ' + el.combo"
        >
          {{ el.icon }}<i v-if="elementLevel(el.id) > 0" class="el-lv">{{ elementLevel(el.id) }}</i>
        </span>
      </div>
      <!-- 激活反应徽章（阶段十五）：主形态 ★ 标识，副反应并列，悬停看效果 -->
      <div v-if="stats.reactions.length" class="hud-reactions">
        <span class="reaction-meta">副反应 {{ stats.secondaryCount }}/{{ stats.secondarySlots }}</span>
        <span
          v-for="r in stats.reactions"
          :key="r.id"
          class="reaction-chip"
          :class="{ primary: r.id === stats.primaryReaction }"
          :title="r.id === stats.primaryReaction ? '主形态（物种身份）｜' + r.desc : '副反应（叠加生效）｜' + r.desc"
        >
          <i v-if="r.id === stats.primaryReaction" class="chip-star">★</i>{{ r.name }}
        </span>
      </div>
      <!-- 流派专精指示（阶段十八） -->
      <div v-if="stats.primarySpec || stats.secondarySpec" class="hud-specs">
        <span v-if="stats.primarySpec" class="spec-chip primary" :title="'主专精：' + SPEC_INFO[stats.primarySpec]?.desc">
          👑 主: {{ SPEC_INFO[stats.primarySpec]?.icon }} {{ SPEC_INFO[stats.primarySpec]?.name }}
        </span>
        <span v-if="stats.secondarySpec" class="spec-chip secondary" :title="'副专精：' + SPEC_INFO[stats.secondarySpec]?.desc">
          🥈 副: {{ SPEC_INFO[stats.secondarySpec]?.icon }} {{ SPEC_INFO[stats.secondarySpec]?.name }}
        </span>
      </div>
    </div>
    <div class="hud-run-status" :class="stats.run?.state">
      <span>{{ stats.run?.modeName }} · {{ stats.run?.difficultyName }}</span>
      <b>{{ runStatusText }}</b>
    </div>
    <div v-if="stats.run?.mode === 'expedition' && !stats.boss" class="expedition-hud">
      <div class="expedition-head">
        <span>{{ stats.run.region }} · {{ stats.run.stage }}/{{ stats.run.totalStages }}</span>
        <b>{{ expeditionMetric }}</b>
      </div>
      <strong>{{ stats.run.objective?.title }}</strong>
      <i>{{ stats.run.objective?.brief }}</i>
      <div class="expedition-track"><em :style="{ width: expeditionPercent + '%' }"></em></div>
    </div>
    <div class="hud-hint">WASD / 方向键移动 · Space 冲刺 · E 吸收元素核心 · Esc 暂停</div>
    <div class="hud-stats">
      <span>攻击 <b>{{ stats.dmg }}</b></span>
      <span>击杀 <b>{{ stats.kills }}</b></span>
      <span>战利品 <b>{{ stats.loot }}</b></span>
      <span
        >吞噬线
        <b title="普通怪 / 精英怪的投降血线"
          >{{ Math.max(8, Math.round((stats.devourThreshold - 0.13) * 100)) }}/{{
            Math.round((stats.devourThreshold + 0.13) * 100)
          }}%</b
        ></span
      >
    </div>
    <div class="hud-action" :class="{ ready: cooldown.dashCd <= 0.02 }">
      <div class="hud-action-label">
        <span>SPACE</span>
        <b>{{ cooldown.dashCd <= 0.02 ? '冲刺就绪' : `${cooldown.dashCd.toFixed(1)}s` }}</b>
      </div>
      <i><em :style="{ width: dashPercent + '%' }"></em></i>
    </div>
    <div
      v-if="stats.boss"
      class="boss-hud"
      :class="{ enraged: stats.boss.enraged, vulnerable: stats.boss.vulnerable }"
    >
      <div class="boss-meta">
        <span>阶段 {{ stats.boss.phase }} · {{ stats.boss.state }}</span>
        <b>{{ stats.boss.name }}</b>
        <i>{{ Math.max(0, Math.ceil(stats.boss.hp)) }} / {{ stats.boss.maxHp }}</i>
      </div>
      <div class="boss-track"><em :style="{ width: bossPercent + '%' }"></em></div>
      <div class="boss-intent">
        <span>{{ stats.boss.phaseName }}</span>
        <b>{{ stats.boss.vulnerable ? '破绽 · 伤害提升' : stats.boss.special }}</b>
      </div>
      <div class="boss-cast-track" :class="{ active: cooldown.cast > 0 }">
        <em :style="{ width: Math.round(cooldown.cast * 100) + '%' }"></em>
      </div>
    </div>
    <div
      v-if="stats.objective"
      class="objective-hud"
      :class="[stats.objective.state, { expedition: stats.run?.mode === 'expedition' }]"
      :style="{ '--objective-color': stats.objective.color }"
    >
      <div class="objective-kicker">
        <span>地图事件</span>
        <i>{{ Math.ceil(stats.objective.timeLeft) }}s</i>
      </div>
      <div class="objective-title">
        <b>{{ stats.objective.title }}</b>
        <em>{{ objectiveArrow }} {{ objectiveMetric }}</em>
      </div>
      <div class="objective-label">{{ stats.objective.label }}</div>
      <div class="objective-track"><i :style="{ width: objectivePercent + '%' }"></i></div>
      <div class="objective-reward">奖励 · {{ stats.objective.reward }}</div>
    </div>
    <!-- 右上角按钮组：静音 + 暂停（HUD 层 pointer-events:none，按钮单独可点击） -->
    <div v-if="buttonsVisible" class="hud-btns">
      <button
        class="hud-pause"
        @click="emit('toggle-mute')"
        :title="muted ? '取消静音' : '静音'"
        :aria-label="muted ? '取消静音' : '静音'"
        :aria-pressed="muted"
      >
        {{ muted ? '🔇' : '🔊' }}
      </button>
      <button
        class="hud-pause"
        @click="paused ? emit('toggle-resume') : emit('toggle-pause')"
        :title="paused ? '继续游戏' : '暂停'"
        :aria-label="paused ? '继续游戏' : '暂停'"
      >
        {{ paused ? '▶' : '⏸' }}
      </button>
    </div>

    <!-- 元素组合激活提示 -->
    <div v-if="toast" class="combo-toast" :class="toastKind">{{ toast }}</div>

    <!-- 进化事件演出（评审 Day 2：暂停 0.9s + 全屏色闪 + 融合宣告） -->
    <div v-if="evolution" class="evolution-overlay" :class="evolution.mutation">
      <div class="evolution-flash"></div>
      <div class="evolution-panel">
        <div class="evolution-kicker">
          {{ isWeaponEvolution ? '武器结构发生终极异化——' : '检测到高浓度元素体液——' }}
        </div>
        <h2 class="evolution-title">{{ evolution.title }}</h2>
        <p class="evolution-sub">{{ evolution.subtitle }}</p>
        <p v-if="evolution.desc" class="evolution-desc">{{ isWeaponEvolution ? '◆' : '⚔️' }} {{ evolution.desc }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hud {
  position: absolute;
  inset: 0;
  pointer-events: none; /* 关键：UI 层不拦截游戏输入 */
}

.hud-title {
  position: absolute;
  top: 20px;
  left: 24px;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 2px;
  color: #eaffdd;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
}

.hud-title span {
  margin-left: 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 3px;
  opacity: 0.55;
}

.hud-level {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
}

.hud-level-txt {
  font-size: 15px;
  font-weight: 800;
  color: #d2ff8a;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
}

.hud-level-bar {
  width: 200px;
  height: 10px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.45);
  overflow: hidden;
}

.hud-level-bar i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #4fae4a, #a8f06a);
  transition: width 0.3s ease;
}

/* 生命点：心形圆点，损失时变暗 */
.hud-hp {
  display: flex;
  gap: 5px;
  margin-left: 12px;
}

.hp-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #ff9d9d, #e04444);
  box-shadow: 0 0 6px rgba(224, 68, 68, 0.5);
  transition: opacity 0.3s ease;
}

.hp-dot.lost {
  opacity: 0.22;
  box-shadow: none;
}

.hud-wave {
  margin-left: 14px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #ffd166;
  background: rgba(0, 0, 0, 0.45);
}

.hud-wave i {
  margin-left: 6px;
  font-style: normal;
  font-weight: 500;
  letter-spacing: 0.5px;
  color: rgba(255, 209, 102, 0.7);
}

.hud-run-status {
  position: absolute;
  top: 54px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 22px;
  padding: 3px 9px;
  transform: translateX(-50%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.62);
  background: rgba(5, 10, 6, 0.72);
  font-size: 10px;
  white-space: nowrap;
}

.hud-run-status b {
  color: #e8d49a;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.hud-run-status.finale {
  border-color: rgba(223, 87, 73, 0.58);
}

.hud-run-status.finale b {
  color: #ff8a80;
}

.expedition-hud {
  position: absolute;
  top: 74px;
  left: 24px;
  width: 244px;
  padding: 9px 11px 10px;
  border: 1px solid rgba(138, 232, 74, 0.3);
  border-radius: 7px;
  color: rgba(255, 255, 255, 0.82);
  background: rgba(6, 12, 7, 0.74);
  backdrop-filter: blur(5px);
}

.expedition-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 4px;
  color: rgba(255, 255, 255, 0.55);
  font-size: 9.5px;
}

.expedition-head b {
  color: #d2ff8a;
  font-variant-numeric: tabular-nums;
}

.expedition-hud strong,
.expedition-hud i {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.expedition-hud strong {
  color: #f2f6ed;
  font-size: 13px;
}

.expedition-hud i {
  margin-top: 2px;
  color: rgba(255, 255, 255, 0.58);
  font-size: 10px;
  font-style: normal;
}

/* 元素指示：四格核心，未吸收时灰暗 */
.hud-elements {
  display: flex;
  gap: 4px;
  margin-left: 12px;
}

.el-dot {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 13px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  filter: grayscale(1);
  opacity: 0.35;
  transition: filter 0.3s ease, opacity 0.3s ease, box-shadow 0.3s ease;
}

.el-dot.active {
  filter: none;
  opacity: 1;
}

/* 元素等级角标（评审 Day 2：💧2 ⚡3） */
.el-lv {
  position: absolute;
  right: -5px;
  bottom: -5px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 13px;
  height: 13px;
  padding: 0 2px;
  border-radius: 999px;
  font-style: normal;
  font-size: 9px;
  font-weight: 700;
  color: #0c120d;
  background: #d2ff8a;
}

.el-dot.fire.active {
  box-shadow: 0 0 10px rgba(255, 107, 74, 0.8);
  border-color: #ff6b4a;
}

.el-dot.water.active {
  box-shadow: 0 0 10px rgba(79, 195, 247, 0.8);
  border-color: #4fc3f7;
}

.el-dot.poison.active {
  box-shadow: 0 0 10px rgba(124, 232, 106, 0.8);
  border-color: #7ce86a;
}

.el-dot.lightning.active {
  box-shadow: 0 0 10px rgba(255, 209, 102, 0.8);
  border-color: #ffd166;
}

/* 激活反应徽章（阶段十五）：进化效果常驻可见 */
.hud-reactions {
  display: flex;
  gap: 5px;
  margin-left: 12px;
}

.reaction-chip {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #d2ff8a;
  background: rgba(138, 232, 74, 0.12);
  border: 1px solid rgba(138, 232, 74, 0.35);
  cursor: help;
}

/* 主形态徽章：金色 ★ + 更亮的描边（物种身份一眼可辨） */
.reaction-chip.primary {
  color: #ffd166;
  background: rgba(255, 209, 102, 0.12);
  border-color: rgba(255, 209, 102, 0.55);
}

.chip-star {
  font-style: normal;
  margin-right: 4px;
}

/* 副反应槽位计数（阶段十六） */
.reaction-meta {
  align-self: center;
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.62);
  letter-spacing: 1px;
  white-space: nowrap;
}

/* 流派专精徽章（阶段十八） */
.hud-specs {
  display: flex;
  gap: 6px;
  margin-left: 12px;
}

.spec-chip {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 800;
  letter-spacing: 0.8px;
  white-space: nowrap;
  cursor: help;
}

.spec-chip.primary {
  color: #fff;
  background: linear-gradient(90deg, rgba(230, 126, 34, 0.85), rgba(211, 84, 0, 0.85));
  border: 1px solid #f39c12;
  box-shadow: 0 0 10px rgba(243, 156, 18, 0.35);
}

.spec-chip.secondary {
  color: #fff;
  background: linear-gradient(90deg, rgba(9, 132, 227, 0.85), rgba(0, 206, 201, 0.85));
  border: 1px solid #74b9ff;
  box-shadow: 0 0 10px rgba(116, 185, 255, 0.35);
}

/* 元素组合激活提示（屏幕中央上方短暂浮现） */
.combo-toast {
  position: absolute;
  top: 90px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 12;
  padding: 10px 26px;
  border-radius: 7px;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0;
  color: #ffd166;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 209, 102, 0.4);
  backdrop-filter: blur(4px);
  pointer-events: none;
  animation: toast-in 0.3s ease;
}

.combo-toast.success {
  color: #d2ffb6;
  border-color: rgba(118, 200, 90, 0.48);
}

.combo-toast.danger {
  color: #ffd1cc;
  border-color: rgba(223, 87, 73, 0.52);
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

/* 进化事件演出：全屏色闪 + 融合宣告（评审 Day 2） */
.evolution-overlay {
  position: absolute;
  inset: 0;
  z-index: 14;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.evolution-flash {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, var(--evo-color, #b8e84a), transparent 70%);
  opacity: 0;
  animation: evo-flash 0.9s ease forwards;
}

.evolution-panel {
  text-align: center;
  animation: evo-rise 0.9s ease forwards;
}

.evolution-kicker {
  font-size: 13px;
  letter-spacing: 3px;
  color: rgba(255, 255, 255, 0.65);
  margin-bottom: 10px;
}

.evolution-title {
  font-size: 34px;
  font-weight: 900;
  letter-spacing: 5px;
  color: var(--evo-color, #d2ff8a);
  text-shadow: 0 0 32px var(--evo-color, #d2ff8a);
  margin-bottom: 12px;
}

.evolution-sub {
  font-size: 15px;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.85);
}

/* 进化效果说明（阶段十五）：直接告诉玩家「进化改变了什么」 */
.evolution-desc {
  margin-top: 10px;
  padding: 6px 16px;
  border-radius: 999px;
  font-size: 13px;
  letter-spacing: 1px;
  color: #ffd166;
  background: rgba(255, 209, 102, 0.1);
  border: 1px solid rgba(255, 209, 102, 0.3);
  display: inline-block;
}

/* 形态主色（acid 黄绿 / gel 蓝 / storm 橙 / corrode 绿 / steam 雾白 / venom 毒紫绿） */
.evolution-overlay.acid {
  --evo-color: #b8e84a;
}

.evolution-overlay.gel {
  --evo-color: #5ad8e8;
}

.evolution-overlay.storm {
  --evo-color: #f0a83c;
}

.evolution-overlay.corrode {
  --evo-color: #6ad86a;
}

.evolution-overlay.steam {
  --evo-color: #cfe8f0;
}

.evolution-overlay.venom {
  --evo-color: #a8d84a;
}

.evolution-overlay.gluttony {
  --evo-color: #d38a58;
}

.evolution-overlay.gatling {
  --evo-color: #5bc3c5;
}

.evolution-overlay.elemental {
  --evo-color: #9b7fd1;
}

.evolution-overlay.assassin {
  --evo-color: #d86b70;
}

@keyframes evo-flash {
  0% {
    opacity: 0.85;
  }
  100% {
    opacity: 0;
  }
}

@keyframes evo-rise {
  0% {
    opacity: 0;
    transform: scale(0.7) translateY(14px);
  }
  35% {
    opacity: 1;
    transform: scale(1.05) translateY(0);
  }
  70% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: scale(1) translateY(-10px);
  }
}

.hud-hint {
  position: absolute;
  bottom: 22px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 18px;
  border-radius: 999px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(4px);
}

.hud-stats {
  position: absolute;
  bottom: 22px;
  right: 24px;
  display: flex;
  gap: 14px;
  padding: 7px 11px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 7px;
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.66);
  background: rgba(6, 10, 7, 0.64);
  backdrop-filter: blur(4px);
}

.hud-stats span {
  white-space: nowrap;
}

.hud-stats b {
  margin-left: 3px;
  color: rgba(255, 255, 255, 0.9);
  font-variant-numeric: tabular-nums;
}

.hud-action {
  position: absolute;
  bottom: 22px;
  left: 24px;
  width: 148px;
  padding: 7px 10px 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 7px;
  background: rgba(6, 10, 7, 0.68);
  backdrop-filter: blur(4px);
}

.hud-action-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.hud-action-label span {
  padding: 1px 5px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 4px;
  font-size: 9px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.62);
}

.hud-action-label b {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.68);
  font-variant-numeric: tabular-nums;
}

/* 细进度条共用结构（冲刺条 / Boss 血条）：外观差异只在填充色与高度 */
.hud-action > i,
.boss-track {
  display: block;
  height: 3px;
  overflow: hidden;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.1);
}

.hud-action > i em,
.boss-track em {
  display: block;
  height: 100%;
  background: #8ae84a;
  transition: width 0.12s linear;
}

.hud-action.ready {
  border-color: rgba(138, 232, 74, 0.38);
}

.hud-action.ready .hud-action-label b {
  color: #d2ff8a;
}

.boss-hud {
  position: absolute;
  top: 84px;
  left: 50%;
  width: min(420px, calc(100vw - 48px));
  transform: translateX(-50%);
  padding: 8px 12px 10px;
  border: 1px solid rgba(255, 209, 102, 0.28);
  border-radius: 7px;
  background: rgba(10, 9, 7, 0.76);
  backdrop-filter: blur(5px);
}

.boss-meta {
  display: grid;
  grid-template-columns: minmax(112px, auto) 1fr 68px;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 7px;
}

.boss-meta span,
.boss-meta i {
  overflow: hidden;
  font-size: 10px;
  font-style: normal;
  color: rgba(255, 255, 255, 0.58);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.boss-meta b {
  overflow: hidden;
  font-size: 13px;
  color: #f2dfaa;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.boss-meta i {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.boss-track {
  height: 6px;
}

.boss-track em {
  background: #d6a642;
}

.boss-intent {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 16px;
  margin-top: 5px;
  color: rgba(255, 255, 255, 0.56);
  font-size: 9px;
}

.boss-intent b {
  color: rgba(255, 209, 102, 0.82);
  font-size: 10px;
  font-weight: 700;
}

/* 细进度条共用结构（施法条 / 远征条 / 事件条）：底槽同构，填充色各异 */
.boss-cast-track,
.expedition-track,
.objective-track {
  height: 4px;
  overflow: hidden;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.1);
}

.boss-cast-track {
  height: 3px;
  background: rgba(255, 255, 255, 0.07);
}

.boss-cast-track em,
.expedition-track em,
.objective-track i {
  display: block;
  height: 100%;
  transition: width 0.12s linear;
}

.expedition-track {
  margin-top: 8px;
}

.expedition-track em {
  background: #8cda61;
}

.boss-cast-track em {
  width: 0;
  background: #ff7466;
  transition: width 0.12s linear; /* 与 10Hz 冷却通道步进对齐，视觉连续 */
}

.boss-cast-track:not(.active) em {
  opacity: 0;
}

.boss-hud.enraged {
  border-color: rgba(232, 87, 73, 0.5);
}

.boss-hud.enraged .boss-track em {
  background: #df5749;
}

.boss-hud.vulnerable {
  border-color: rgba(255, 227, 162, 0.68);
}

.boss-hud.vulnerable .boss-intent b {
  color: #ffe3a2;
}

.objective-hud {
  --objective-color: #d6a642;
  position: absolute;
  top: 78px;
  right: 24px;
  width: 264px;
  padding: 11px 12px 10px;
  border: 1px solid color-mix(in srgb, var(--objective-color) 42%, transparent);
  border-radius: 7px;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(7, 11, 8, 0.76);
  backdrop-filter: blur(5px);
}

.objective-kicker,
.objective-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.objective-kicker {
  margin-bottom: 5px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.58);
}

.objective-kicker i,
.objective-title em {
  font-style: normal;
  font-variant-numeric: tabular-nums;
}

.objective-title b {
  overflow: hidden;
  font-size: 14px;
  color: #f4f3e9;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.objective-title em {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 800;
  color: var(--objective-color);
}

.objective-label,
.objective-reward {
  overflow: hidden;
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.64);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.objective-label {
  margin-top: 3px;
}

.objective-track {
  margin: 8px 0 7px;
}

.objective-track i {
  background: var(--objective-color);
}

.objective-hud.complete {
  border-color: rgba(118, 200, 90, 0.55);
}

.objective-hud.failed {
  --objective-color: #c95959;
  border-color: rgba(201, 89, 89, 0.55);
}

/* 暂停/静音按钮：右上角，HUD 不拦截输入但按钮自身可点击 */
.hud-btns {
  position: absolute;
  top: 20px;
  right: 24px;
  display: flex;
  gap: 8px;
  pointer-events: auto; /* 覆盖 .hud 的 none */
}

.hud-pause {
  width: 40px;
  height: 40px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.hud-pause:hover {
  border-color: rgba(138, 232, 74, 0.6);
  background: rgba(0, 0, 0, 0.6);
}

.hud-pause:active {
  transform: scale(0.96);
}

.hud-pause:focus-visible {
  outline: 2px solid rgba(210, 255, 138, 0.9);
  outline-offset: 2px;
}

@media (max-width: 900px) {
  .combo-toast {
    top: auto;
    bottom: 90px;
    box-sizing: border-box;
    width: max-content;
    max-width: calc(100vw - 32px);
    padding: 9px 18px;
    text-align: center;
    white-space: normal;
  }

  .hud-title span,
  .hud-hint,
  .reaction-meta {
    display: none;
  }

  .hud-title {
    top: 14px;
    left: 16px;
    font-size: 17px;
  }

  .hud-level {
    top: 56px;
    width: calc(100% - 24px);
    flex-wrap: wrap;
    justify-content: center;
    row-gap: 7px;
  }

  .hud-level-bar {
    width: min(180px, 38vw);
  }

  .boss-hud {
    top: 158px;
  }

  .hud-run-status {
    top: 124px;
  }

  .expedition-hud {
    top: 158px;
    left: 14px;
    box-sizing: border-box;
    width: calc(100vw - 28px);
  }

  .objective-hud.expedition {
    top: 252px;
  }

  .objective-hud {
    top: 210px;
    right: 14px;
    width: min(264px, calc(100vw - 28px));
  }

  .hud-action {
    bottom: 14px;
    left: 14px;
  }

  .hud-stats {
    right: 14px;
    bottom: 14px;
    gap: 8px;
  }

  .hud-stats span:nth-child(3),
  .hud-stats span:nth-child(4) {
    display: none;
  }

  .hud-btns {
    top: 12px;
    right: 14px;
  }
}
</style>
