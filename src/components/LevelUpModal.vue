<script setup>
/**
 * LevelUpModal：升级技能与里程碑专精觉醒面板
 */
const props = defineProps({
  options: { type: Array, required: true }, // 技能选项数组
  level: { type: Number, required: true }, // 当前等级
})
const emit = defineEmits(['select'])

// 是否处于专精觉醒里程碑
const isMilestone = props.options?.[0]?.isMilestone || false
const milestoneType = props.options?.[0]?.milestoneType || 'primary'

const roleLabel = (s) => {
  if (s.isCapstone) return '🌟 终极觉醒'
  if (s.role === 't1_free') return '🌱 自由变异尝试'
  if (s.role === 'primary') return '🔥 主专精深潜'
  if (s.role === 'secondary') return '🔗 副专精共鸣'
  return '💚 通用生存'
}

const cardClass = (s) => {
  if (s.isCapstone) return 'card-capstone'
  if (s.role === 'primary') return 'card-primary'
  if (s.role === 'secondary') return 'card-secondary'
  if (s.role === 't1_free') return 'card-free'
  return 'card-common'
}
</script>

<template>
  <div class="levelup-overlay" role="dialog" aria-modal="true" aria-label="升级选择">
    <!-- 1. 里程碑专精觉醒仪式大面板 (Lv.5 / Lv.9) -->
    <div v-if="isMilestone" class="milestone-panel">
      <div class="milestone-header">
        <h2 class="milestone-title">
          {{ milestoneType === 'primary' ? '👑 Lv.5 主专精觉醒 · 抉择你的进化宿命 👑' : '🥈 Lv.9 副专精共鸣 · 挑选你的辅助流派 🥈' }}
        </h2>
        <div class="milestone-sub">
          {{ milestoneType === 'primary'
            ? '主专精将确立你的核心战斗形态，并解锁后续 T2~T3 高阶技能与 T4 终极觉醒大招！'
            : '副专精将为你的史莱姆提供强力共鸣被动与专属辅助质变！' }}
        </div>
      </div>

      <div class="milestone-cards">
        <div
          v-for="s in options"
          :key="s.id"
          class="milestone-card"
          :style="{ '--spec-color': s.color }"
          @click="emit('select', s)"
        >
          <div class="ms-top">
            <div class="ms-icon">{{ s.icon }}</div>
            <div class="ms-name">{{ s.name }}</div>
            <div class="ms-desc">{{ s.desc }}</div>
          </div>

          <!-- 觉醒即时赋能 -->
          <div class="ms-bonus-box">
            <div class="ms-bonus-title">⚡ 初始觉醒赋能</div>
            <div class="ms-bonus-val">{{ s.bonus }}</div>
          </div>

          <!-- 未来进阶路线预览 -->
          <div v-if="milestoneType === 'primary'" class="ms-roadmap">
            <div class="ms-roadmap-title">📜 未来进阶与终极觉醒预览</div>
            <div v-for="(rm, idx) in s.roadmap" :key="idx" class="roadmap-item" :class="{ capstone: idx === 3 }">
              {{ rm }}
            </div>
          </div>

          <button class="ms-select-btn">
            {{ milestoneType === 'primary' ? `👑 确立【${s.tags[1]}】为主专精` : `🥈 确立【${s.tags[1]}】为副专精` }}
          </button>
        </div>
      </div>
    </div>

    <!-- 2. 常规升级 3 卡面板 (自由探索 / 主副专精深潜 / 通用) -->
    <div v-else class="levelup-panel">
      <h2 class="levelup-title">✨ 升级！Lv.{{ level }} · 选择一项基因进化 ✨</h2>
      <div class="levelup-grow">
        {{ level < 5
          ? '🌱 阶段说明：Lv.1~4 为自由变异期（随意尝试手感与元素，不会锁死流派，Lv.5 将触发主专精觉醒仪式）'
          : '📈 等级成长：攻击力自动提升 8%（已生效，可与技能叠加）' }}
      </div>
      <div class="levelup-cards">
        <button
          v-for="s in options"
          :key="s.id"
          :class="['skill-card', cardClass(s)]"
          :title="`当前 Lv.${s.level} · 选择后 Lv.${s.level + 1}`"
          @click="emit('select', s)"
        >
          <!-- 流派定位指示 -->
          <div class="role-badge">{{ roleLabel(s) }}</div>

          <!-- 等级角标 -->
          <i class="skill-lv">Lv.{{ s.level + 1 }}/{{ s.maxLevel }}</i>

          <div class="skill-icon">{{ s.icon }}</div>

          <div class="skill-tags">
            <span v-for="t in s.tags || []" :key="t" class="skill-tag">{{ t }}</span>
          </div>

          <div class="skill-name">{{ s.name }}</div>
          <div class="skill-desc">{{ s.desc }}</div>

          <!-- 该级具体数值 -->
          <div class="skill-num">{{ s.stats }}</div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.levelup-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(5px);
}

/* ====================================================
   1. 里程碑专精觉醒仪式大界面
==================================================== */
.milestone-panel {
  text-align: center;
  max-width: 1200px;
  width: 95%;
}

.milestone-header {
  margin-bottom: 24px;
}

.milestone-title {
  font-size: 28px;
  font-weight: 900;
  letter-spacing: 4px;
  color: #ffd166;
  text-shadow: 0 0 20px rgba(255, 209, 102, 0.6);
  margin-bottom: 8px;
}

.milestone-sub {
  font-size: 14px;
  letter-spacing: 1px;
  color: rgba(234, 255, 221, 0.8);
}

.milestone-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 18px;
  justify-content: center;
}

.milestone-card {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 24px 18px 20px;
  border-radius: 20px;
  background: linear-gradient(170deg, rgba(28, 32, 38, 0.95), rgba(12, 16, 20, 0.98));
  border: 1.5px solid rgba(255, 255, 255, 0.12);
  color: #e8f5e0;
  cursor: pointer;
  text-align: left;
  transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), border-color 0.2s ease, box-shadow 0.2s ease;
}

.milestone-card:hover {
  transform: translateY(-8px);
  border-color: var(--spec-color);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6), 0 0 24px var(--spec-color);
}

.ms-top {
  text-align: center;
  margin-bottom: 14px;
}

.ms-icon {
  font-size: 46px;
  line-height: 1.2;
  margin-bottom: 6px;
}

.ms-name {
  font-size: 20px;
  font-weight: 800;
  color: var(--spec-color);
  margin-bottom: 6px;
}

.ms-desc {
  font-size: 12px;
  line-height: 1.5;
  color: rgba(232, 245, 224, 0.7);
}

.ms-bonus-box {
  margin: 10px 0;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(255, 209, 102, 0.08);
  border: 1px dashed rgba(255, 209, 102, 0.3);
}

.ms-bonus-title {
  font-size: 11px;
  font-weight: 700;
  color: #ffd166;
  margin-bottom: 4px;
}

.ms-bonus-val {
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  line-height: 1.4;
}

.ms-roadmap {
  margin: 8px 0 16px;
  padding: 8px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.35);
  font-size: 11px;
  line-height: 1.6;
}

.ms-roadmap-title {
  font-size: 10.5px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding-bottom: 2px;
}

.roadmap-item {
  color: rgba(232, 245, 224, 0.75);
}

.roadmap-item.capstone {
  color: #ffd166;
  font-weight: 700;
}

.ms-select-btn {
  width: 100%;
  padding: 10px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 1px;
  border: none;
  cursor: pointer;
  background: var(--spec-color);
  color: #121212;
  transition: transform 0.15s ease, filter 0.15s ease;
}

.ms-select-btn:hover {
  transform: scale(1.03);
  filter: brightness(1.15);
}

/* ====================================================
   2. 常规升级面板
==================================================== */
.levelup-panel {
  text-align: center;
}

.levelup-title {
  margin-bottom: 24px;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 4px;
  color: #eaffdd;
  text-shadow: 0 2px 14px rgba(138, 232, 74, 0.5);
}

.levelup-grow {
  margin: -14px 0 22px;
  font-size: 13px;
  letter-spacing: 1px;
  color: rgba(255, 209, 102, 0.9);
}

.levelup-cards {
  display: flex;
  gap: 22px;
  justify-content: center;
}

.skill-card {
  position: relative;
  width: 210px;
  min-height: 290px;
  padding: 30px 16px 18px;
  border-radius: 18px;
  color: #e8f5e0;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: transform 0.18s cubic-bezier(0.175, 0.885, 0.32, 1.275), border-color 0.18s ease, box-shadow 0.18s ease;
}

.skill-card:hover {
  transform: translateY(-8px) scale(1.02);
}

.card-common {
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: linear-gradient(165deg, rgba(30, 46, 34, 0.95), rgba(14, 22, 16, 0.95));
}
.card-common:hover {
  border-color: rgba(138, 232, 74, 0.7);
  box-shadow: 0 10px 30px rgba(138, 232, 74, 0.25);
}

.card-free {
  border: 1px solid rgba(79, 195, 247, 0.4);
  background: linear-gradient(165deg, rgba(18, 38, 48, 0.95), rgba(10, 20, 26, 0.95));
}
.card-free:hover {
  border-color: #4fc3f7;
  box-shadow: 0 10px 30px rgba(79, 195, 247, 0.3);
}

.card-primary {
  border: 1.5px solid rgba(255, 159, 67, 0.5);
  background: linear-gradient(165deg, rgba(46, 32, 18, 0.95), rgba(22, 14, 8, 0.95));
}
.card-primary:hover {
  border-color: #ff9f43;
  box-shadow: 0 10px 32px rgba(255, 159, 67, 0.35);
}

.card-secondary {
  border: 1.5px solid rgba(0, 210, 211, 0.5);
  background: linear-gradient(165deg, rgba(16, 40, 48, 0.95), rgba(8, 20, 24, 0.95));
}
.card-secondary:hover {
  border-color: #00d2d3;
  box-shadow: 0 10px 32px rgba(0, 210, 211, 0.35);
}

.card-capstone {
  border: 2px solid #ffd32a;
  background: linear-gradient(165deg, rgba(60, 45, 10, 0.98), rgba(28, 20, 4, 0.98));
  box-shadow: 0 0 24px rgba(255, 211, 42, 0.4);
  animation: capstonePulse 2s infinite alternate;
}
@keyframes capstonePulse {
  from { box-shadow: 0 0 16px rgba(255, 211, 42, 0.3); }
  to { box-shadow: 0 0 32px rgba(255, 211, 42, 0.65); }
}

.role-badge {
  position: absolute;
  top: -11px;
  left: 50%;
  transform: translateX(-50%);
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.8px;
  white-space: nowrap;
  background: #1e272e;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #dcdde1;
}
.card-free .role-badge {
  background: #0288d1;
  border-color: #4fc3f7;
  color: #fff;
}
.card-primary .role-badge {
  background: #d35400;
  border-color: #f39c12;
  color: #fff;
}
.card-secondary .role-badge {
  background: #0984e3;
  border-color: #74b9ff;
  color: #fff;
}
.card-capstone .role-badge {
  background: linear-gradient(90deg, #f1c40f, #e67e22);
  border-color: #ffd32a;
  color: #2c1c00;
}

.skill-lv {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 2px 8px;
  border-radius: 999px;
  font-style: normal;
  font-size: 10.5px;
  font-weight: 800;
  color: #1a1206;
  background: linear-gradient(90deg, #ffd166, #f0a63a);
}

.skill-icon {
  font-size: 44px;
  line-height: 1.2;
  margin: 6px 0 10px;
}

.skill-tags {
  display: flex;
  gap: 5px;
  justify-content: center;
  margin-bottom: 8px;
  min-height: 20px;
}

.skill-tag {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 600;
  color: rgba(255, 209, 102, 0.9);
  background: rgba(255, 209, 102, 0.12);
  border: 1px solid rgba(255, 209, 102, 0.25);
}

.skill-name {
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 8px;
  color: #d2ff8a;
}
.card-capstone .skill-name {
  color: #ffd32a;
}

.skill-desc {
  font-size: 12.5px;
  line-height: 1.5;
  color: rgba(232, 245, 224, 0.72);
  flex-grow: 1;
}

.skill-num {
  margin-top: 10px;
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 11.5px;
  font-weight: 700;
  color: #ffd166;
  background: rgba(255, 209, 102, 0.1);
  border: 1px solid rgba(255, 209, 102, 0.25);
}

@media (max-width: 900px) {
  .levelup-overlay {
    align-items: flex-start;
    overflow-y: auto;
    box-sizing: border-box;
    padding: 22px 12px;
  }

  .levelup-panel,
  .milestone-panel {
    width: 100%;
    max-width: 420px;
    margin: auto;
  }

  .levelup-title,
  .milestone-title {
    margin: 0 0 10px;
    font-size: 18px;
    line-height: 1.35;
    letter-spacing: 0;
  }

  .levelup-grow,
  .milestone-sub {
    margin: 0 0 18px;
    font-size: 11.5px;
    line-height: 1.5;
    letter-spacing: 0;
  }

  .levelup-cards {
    flex-direction: column;
    gap: 12px;
  }

  .skill-card {
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr);
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    column-gap: 12px;
    row-gap: 4px;
    box-sizing: border-box;
    width: 100%;
    height: 166px;
    min-height: 166px;
    padding: 42px 12px 10px;
    text-align: left;
  }

  .skill-card:hover {
    transform: none;
  }

  .role-badge {
    top: 10px;
    left: 12px;
    transform: none;
  }

  .skill-lv {
    top: 10px;
    right: 12px;
  }

  .skill-icon {
    grid-column: 1;
    grid-row: 1 / 5;
    align-self: center;
    margin: 0;
    font-size: 38px;
    text-align: center;
  }

  .skill-tags {
    grid-column: 2;
    grid-row: 1;
    flex-wrap: wrap;
    justify-content: flex-start;
    margin: 0;
  }

  .skill-name {
    grid-column: 2;
    grid-row: 2;
    margin: 0;
    font-size: 16px;
  }

  .skill-desc {
    grid-column: 2;
    grid-row: 3;
    font-size: 11.5px;
    line-height: 1.4;
  }

  .skill-num {
    grid-column: 2;
    grid-row: 4;
    justify-self: start;
    margin: 0;
    padding: 4px 8px;
    font-size: 10.5px;
  }

  .milestone-header {
    margin-bottom: 16px;
  }

  .milestone-cards {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}
</style>
