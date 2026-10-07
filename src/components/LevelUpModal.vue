<script setup>
/**
 * LevelUpModal：升级技能与里程碑专精觉醒面板
 */
import { computed } from 'vue'
import { REACTION_SLOT_LEVELS, getReactionSlotLevelBonus } from '../game/entities/Player.js'

/**
 * 主专精的规则改写（专精 → 玩法规则）：觉醒面板直接标出「这条流派怎么改写玩法」。
 *
 * 三条规则的性质不同，文案必须区分：
 *  - gatling：分裂弹继承「暴击率 + 状态附加概率」——这里刻意写「状态附加概率」而不是
 *    「附魔概率」：它指飞弹自带的 freeze/burn/poisonChance（武器状态附加），
 *    与核心元素的 _procs（已吸收元素的等级累积附魔）不是同一个概念。
 *  - elemental：核心元素附魔封顶 60% → 85%，只可能被 elemental / origin 拿到。
 *  - assassin：暴击保证触发**已吸收的**核心元素附魔——**只在角色有元素权限时成立**。
 *    暗影史莱姆无元素权限，引擎不会给它这条赋能，因此模板里必须按 canUseElements
 *    隐藏，不能向暗影承诺拿不到的效果。
 * 暴食的元素规则改写已随赋能移除，不再展示。
 */
const SPEC_ELEMENT_RULE = {
  gatling: '🧬 分裂规则：分裂弹 100% 继承母弹的暴击率与状态附加概率（分裂不再稀释）',
  elemental: '🧬 元素规则：附魔概率封顶 60% → 85%（把概率投满有了去处）',
  assassin: '🧬 元素规则：暴击必定触发你已吸收的元素附魔（原生黏液等高元素角色专属）',
}

/** 该规则是否应当展示：刺客这条依赖元素权限，其余两条与权限无关 */
const canShowSpecRule = (spec) => {
  if (spec === 'assassin') return props.canUseElements === true
  return !!SPEC_ELEMENT_RULE[spec]
}

const props = defineProps({
  options: { type: Array, required: true }, // 技能选项数组
  level: { type: Number, required: true }, // 当前等级
  // 角色身份（阶段十九）：非空 = 四角色血统，Lv.1~4 只开放本树；
  // 空 = origin 自由构筑，仍走四系自由探索 + Lv.5 四选一
  roleSpec: { type: String, default: null },
  // 元素权限（第四批）：无权限角色的槽位里程碑是空承诺，需隐藏
  canUseElements: { type: Boolean, default: true },
})
const emit = defineEmits(['select'])

/**
 * 槽位里程碑提示（等级 → 元素联动的高亮时刻）：
 * 恰好跨过 Lv.4 / Lv.8 时宣告新槽位（此刻已由 Player.refreshReactionSlots 生效），
 * 否则预告下一个里程碑——让升级面板第一次把「元素构筑」纳入决策视野。
 *
 * 第四批：无元素权限的角色（暴食/弹射/暗影）不显示——它们不会吸收任何元素，
 * 槽位再扩也是空槽，提示等于一句空承诺。底层槽位计算不改。
 */
const slotMilestone = computed(() => {
  if (!props.canUseElements) return null
  const level = props.level || 1
  if (REACTION_SLOT_LEVELS.includes(level)) {
    return { hit: true, text: `🎉 副反应槽 +1（现 ${2 + getReactionSlotLevelBonus(level)} 个基础槽，已自动接入可用反应）` }
  }
  const next = REACTION_SLOT_LEVELS.find((milestone) => level < milestone)
  return next ? { hit: false, text: `⬡ 下一槽位里程碑：Lv.${next}（副反应槽 +1）` } : null
})

// 是否处于专精觉醒里程碑
const isMilestone = props.options?.[0]?.isMilestone || false
const milestoneType = props.options?.[0]?.milestoneType || 'primary'

const roleLabel = (s) => {
  if (s.isBossSkill) return '📜 BOSS职业秘典'
  if (s.isCapstone) return '🌟 终极觉醒'
  if (s.role === 't1_free') return '🌱 自由变异尝试'
  if (s.role === 'primary') return '🔥 主专精深潜'
  if (s.role === 'secondary') return '🔗 副专精共鸣'
  return '💚 通用生存'
}

const cardClass = (s) => {
  if (s.isBossSkill) return 'card-boss'
  if (s.isCapstone) return 'card-capstone'
  if (s.role === 'primary') return 'card-primary'
  if (s.role === 'secondary') return 'card-secondary'
  if (s.role === 't1_free') return 'card-free'
  return 'card-common'
}

const isBossReward = computed(() => !!props.options?.[0]?.isBossSkill)
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

          <!-- 玩法规则改写：主专精决定你怎么用（暴击／分裂／元素）。
               刺客那条依赖元素权限，对暗影隐藏——不承诺拿不到的效果。 -->
          <div v-if="milestoneType === 'primary' && canShowSpecRule(s.spec)" class="ms-element-rule">
            {{ SPEC_ELEMENT_RULE[s.spec] }}
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
      <h2 class="levelup-title">{{ isBossReward ? '📜 王级职业秘典 · 选择一项专属强化 📜' : `✨ 升级！Lv.${level} · 选择一项基因进化 ✨` }}</h2>
      <div class="levelup-grow">
        {{ isBossReward
          ? '击败首领获得的职业秘典：不占用升级次数，只能选择当前职业的强力专属技能。'
          : level < 5
          ? (roleSpec
            ? '🌱 阶段说明：Lv.1~4 只开放本角色专属技能树（Lv.5 自动觉醒为你的主专精，无需选择）'
            : '🌱 阶段说明：Lv.1~4 为自由变异期（四系技能全开放，不锁死流派，Lv.5 将触发主专精觉醒仪式）')
          : '📈 等级成长：攻击力自动提升 8%（已生效，可与技能叠加）' }}
      </div>
      <div v-if="slotMilestone" class="levelup-slot" :class="{ hit: slotMilestone.hit }">
        {{ slotMilestone.text }}
      </div>
      <div class="levelup-cards">
        <button
          v-for="s in options"
          :key="s.id"
          :class="['skill-card', cardClass(s)]"
          :title="s.isBossSkill ? 'BOSS 专属技能' : `当前 Lv.${s.level} · 选择后 Lv.${s.level + 1}`"
          @click="emit('select', s)"
        >
          <!-- 流派定位指示 -->
          <div class="role-badge">{{ roleLabel(s) }}</div>

          <!-- 等级角标 -->
          <i v-if="!s.isBossSkill" class="skill-lv">Lv.{{ s.level + 1 }}/{{ s.maxLevel }}</i>
          <i v-else class="skill-lv boss-lv">BOSS</i>

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

/* 元素规则改写（专精 → 元素联动）：主专精独有的元素玩法说明 */
.ms-element-rule {
  margin: 8px 0;
  padding: 7px 9px;
  border-radius: 10px;
  font-size: 11px;
  line-height: 1.5;
  color: rgba(226, 214, 255, 0.92);
  background: rgba(156, 138, 212, 0.12);
  border: 1px dashed rgba(156, 138, 212, 0.42);
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

/* 槽位里程碑（等级 → 元素联动）：跨过 Lv.4 / Lv.8 时高亮宣告，其余时候低强度预告 */
.levelup-slot {
  margin: -16px 0 20px;
  font-size: 12px;
  letter-spacing: 1px;
  color: rgba(156, 138, 212, 0.82);
}

.levelup-slot.hit {
  display: inline-block;
  padding: 5px 14px;
  border-radius: 999px;
  font-weight: 700;
  color: #e6dcff;
  background: rgba(156, 138, 212, 0.18);
  border: 1px solid rgba(156, 138, 212, 0.5);
  box-shadow: 0 0 18px rgba(156, 138, 212, 0.3);
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

.card-boss {
  border: 2px solid #ff8bd1;
  background: linear-gradient(165deg, rgba(62, 24, 58, 0.98), rgba(26, 12, 28, 0.98));
  box-shadow: 0 0 24px rgba(255, 139, 209, 0.35);
}
.card-boss:hover {
  border-color: #ffd1ee;
  box-shadow: 0 10px 36px rgba(255, 139, 209, 0.5);
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
.skill-lv.boss-lv {
  color: #32142d;
  background: linear-gradient(90deg, #ffd1ee, #ff8bd1);
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
  .levelup-slot,
  .milestone-sub {
    margin: 0 0 18px;
    font-size: 11.5px;
    line-height: 1.5;
    letter-spacing: 0;
  }

  .levelup-slot.hit {
    display: block;
    padding: 5px 10px;
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
