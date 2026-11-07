<script setup>
/**
 * LevelUpModal：升级技能与里程碑专精觉醒面板
 */
import { computed, onBeforeUnmount, onMounted } from 'vue'
import SkillIcon from './SkillIcon.vue'
import { REACTION_SLOT_LEVELS, getReactionSlotLevelBonus } from '../game/entities/Player.js'
import { useCardFocus } from './useCardFocus.js'
import RicochetRouteChoice from './RicochetRouteChoice.vue'
import GluttonRouteChoice from './GluttonRouteChoice.vue'
import SymbiosisRouteChoice from './SymbiosisRouteChoice.vue'
import ElementalRouteChoice from './ElementalRouteChoice.vue'
import ShadowRouteChoice from './ShadowRouteChoice.vue'
import { GLUTTON_ICON_COLORS, GLUTTON_ICON_ROUTES } from './gluttonIconMap.js'
import { RICOCHET_ROUTE_COLORS } from './ricochetIconMap.js'
import { SYMBIOSIS_ICON_COLORS, SYMBIOSIS_ICON_ROUTES } from './symbiosisIconMap.js'
import { SHADOW_ICON_COLORS, SHADOW_ICON_ROUTES } from './shadowIconMap.js'

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
  embedded: { type: Boolean, default: false },
  rewardTitle: { type: String, default: '' },
  options: { type: Array, required: true }, // 技能选项数组
  level: { type: Number, required: true }, // 当前等级
  // 角色身份（阶段十九）：非空 = 四角色血统，Lv.1~4 只开放本树；
  // 空 = origin 原生体系，走原生核心/碎片 + Lv.5 三路线 + Lv.9 五印记。
  roleSpec: { type: String, default: null },
  // 元素权限（第四批）：无权限角色的槽位里程碑是空承诺，需隐藏
  canUseElements: { type: Boolean, default: true },
  // 当前实际副反应槽数（P2 统一口径：基础 + 基因 + 等级里程碑，由 Player 单点汇总）
  secondarySlots: { type: Number, default: 0 },
  // 备选蓝图（黑市）：本局剩余刷新次数，>0 时在普通选卡面板显示刷新按钮
  rerolls: { type: Number, default: 0 },
})
const emit = defineEmits(['select', 'reroll'])

const isRicochetRoute = computed(() => !!props.options?.[0]?.isRicochetRoute)
const isGluttonRoute = computed(() => !!props.options?.[0]?.isGluttonRoute)
const isSymbiosisRoute = computed(() => !!props.options?.[0]?.isSymbiosisRoute)
const isElementalRoute = computed(() => !!props.options?.[0]?.isElementalRoute)
const isShadowRoute = computed(() => !!props.options?.[0]?.isShadowRoute)
const isOriginRoute = computed(() => !!props.options?.[0]?.isOriginRoute)
const isOriginMark = computed(() => !!props.options?.[0]?.isOriginMark)
const isGluttonSkill = (s) => !!(s?.isGluttonSkill || s?.id?.startsWith('glut_'))
const isSymbiosisSkill = (s) => !!(s?.isSymbiosisSkill || s?.id?.startsWith('sym_'))

/**
 * 键盘选卡（基因进化 3 卡与里程碑觉醒共用一套）：
 * 打开默认选中中间卡；←/→ 循环切换；Enter/空格 确认；数字键直选；
 * 鼠标悬停同步写回同一 selectedIndex，不做第二套 hover 状态。
 */
const { selectedIndex } = useCardFocus(
  () => props.options,
  (card) => emit('select', card),
  () => !isRicochetRoute.value && !isGluttonRoute.value && !isSymbiosisRoute.value && !isElementalRoute.value && !isShadowRoute.value,
)

// 备选蓝图（黑市）：R 键刷新候选（普通选卡面板，按钮同步展示剩余次数）
const rerollable = computed(() => props.rerolls > 0 && !isMilestone.value && !isPartnerSelection.value)
const onRerollKey = (e) => {
  if (e.code === 'KeyR' && !e.repeat && rerollable.value) {
    e.preventDefault()
    emit('reroll')
  }
}
onMounted(() => window.addEventListener('keydown', onRerollKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onRerollKey))

/**
 * 槽位里程碑提示（等级 → 元素联动的高亮时刻）：
 * 恰好跨过 Lv.4 / Lv.8 时宣告新槽位（此刻已由 Player.refreshReactionSlots 生效），
 * 否则预告下一个里程碑——让升级面板第一次把「元素构筑」纳入决策视野。
 *
 * 第四批：无元素权限的角色（暴食/弹射/暗影）不显示——它们不会吸收任何元素，
 * 槽位再扩也是空槽，提示等于一句空承诺。底层槽位计算不改。
 */
const slotMilestone = computed(() => {
  if (!props.canUseElements || props.roleSpec === 'elemental') return null
  const level = props.level || 1
  if (REACTION_SLOT_LEVELS.includes(level)) {
    // 优先用引擎汇总后的实际槽数（含基因加成）；无该数据时退回「基础 2 + 等级加成」口径
    const total = props.secondarySlots || 2 + getReactionSlotLevelBonus(level)
    return { hit: true, text: `🎉 副反应槽 +1（现 ${total} 个槽位，已自动接入可用反应）` }
  }
  const next = REACTION_SLOT_LEVELS.find((milestone) => level < milestone)
  return next ? { hit: false, text: `⬡ 下一槽位里程碑：Lv.${next}（副反应槽 +1）` } : null
})

// 是否处于专精觉醒里程碑
const isMilestone = computed(() => !!props.options?.[0]?.isMilestone)
const milestoneType = computed(() => props.options?.[0]?.milestoneType || 'primary')

const roleLabel = (s) => {
  if (s.element) return s.tags?.[0] || '元素强化'
  if (s.isOriginRoute) return '🧬 原生进化路线'
  if (s.isOriginMark) return '🧬 异源印记'
  if (s.originPool === 'fragment') return '🧩 异源碎片'
  if (s.role === 'origin_route') return `🌊 ${s.tags?.find(tag => ['扩张', '同化', '共振'].includes(tag)) || '路线强化'}`
  if (s.role === 'origin_mark') return '🧬 印记强化'
  if (s.originOnly) return '🫧 原生核心'
  if (s.isBossSkill) return s.isPartnerChoice ? '🐾 BOSS伙伴契约' : '📜 BOSS职业秘典'
  if (s.isCapstone) return '🌟 终极觉醒'
  if (s.isRicochetSkill) return s.tags?.[0] || '弹道进化'
  if (s.isGluttonSkill) return s.tags?.[0] || '暴食进化'
  if (s.isSymbiosisSkill) return s.tags?.[0] || '共生进化'
  if (s.isElementalSkill || s.isElementalDiscovery || s.spec === 'elemental') return s.tags?.[0] || '元素构筑'
  if (s.isShadowSkill) return s.tags?.[0] || '暗影进化'
  if (s.isPartnerChoice) return '🐾 招募伙伴 · 在场 +1'
  if (s.role === 't1_free') return '🌱 自由变异尝试'
  if (s.role === 'primary') return '🔥 主专精深潜'
  if (s.role === 'secondary') return '🔗 副专精共鸣'
  if (s.role === 'role_t1') return '🔮 专属法术强化'
  return '💚 通用生存'
}

const cardClass = (s) => {
  if (s.isOriginRoute) return 'card-primary'
  if (s.isOriginMark) return 'card-secondary'
  if (s.originPool === 'fragment') return 'card-free'
  if (s.element || s.role === 'role_t1' || s.originOnly) return 'card-primary'
  if (s.isBossSkill) return s.isPartnerChoice ? 'card-partner' : 'card-boss'
  if (s.isCapstone) return 'card-capstone'
  if (s.isPartnerChoice) return 'card-partner'
  if (s.role === 'primary') return 'card-primary'
  if (s.role === 'secondary') return 'card-secondary'
  if (s.role === 't1_free') return 'card-free'
  return 'card-common'
}

const isBossReward = computed(() => !!props.options?.[0]?.isBossSkill)
const isPartnerSelection = computed(() => props.options?.length > 0 && props.options.every(s => s.isPartnerChoice))
const cardStyle = (s) => {
  if (s.isRicochetSkill || s.id?.startsWith('boss_rico_')) {
    const route = s.route || s.routes?.[0]
    const family = s.isBossSkill ? 'boss' : s.kind === 'hybrid' ? 'hybrid' : route || 'common'
    return { '--rico-color': RICOCHET_ROUTE_COLORS[family] || RICOCHET_ROUTE_COLORS.common }
  }
  if (isGluttonSkill(s) || s.isGluttonRoute) {
    const route = s.route || GLUTTON_ICON_ROUTES[s.id] || 'common'
    return { '--glutton-color': s.color || GLUTTON_ICON_COLORS[route] || GLUTTON_ICON_COLORS.common }
  }
  if (isSymbiosisSkill(s) || s.isSymbiosisRoute) {
    const route = s.route || SYMBIOSIS_ICON_ROUTES[s.id] || 'common'
    return { '--symbiosis-color': s.color || SYMBIOSIS_ICON_COLORS[route] || SYMBIOSIS_ICON_COLORS.common }
  }
  if (s.isShadowSkill || s.isShadowRoute) {
    const route = s.route || SHADOW_ICON_ROUTES[s.id] || 'common'
    return { '--shadow-color': s.color || SHADOW_ICON_COLORS[route] || SHADOW_ICON_COLORS.common }
  }
  return s.isPartnerChoice ? { '--partner-color': s.color } : undefined
}
const visibleTags = (s) => s.isRicochetSkill && s.tags?.[0] === roleLabel(s) ? s.tags.slice(1) : (s.tags || [])
</script>

<template>
  <div class="levelup-overlay" :class="{ embedded }" :role="embedded ? 'group' : 'dialog'" :aria-modal="embedded ? undefined : true" aria-label="升级选择">
    <RicochetRouteChoice v-if="isRicochetRoute" :options="options" @select="(route) => emit('select', route)" />
    <GluttonRouteChoice v-else-if="isGluttonRoute" :options="options" @select="(route) => emit('select', route)" />
    <SymbiosisRouteChoice v-else-if="isSymbiosisRoute" :options="options" @select="(route) => emit('select', route)" />
    <ElementalRouteChoice v-else-if="isElementalRoute" :options="options" @select="(route) => emit('select', route)" />
    <ShadowRouteChoice v-else-if="isShadowRoute" :options="options" @select="(route) => emit('select', route)" />
    <!-- 1. 里程碑专精觉醒仪式大面板 (Lv.5 / Lv.9) -->
    <div v-else-if="isMilestone" class="milestone-panel">
      <div class="milestone-header">
        <h2 class="milestone-title">
          {{ isOriginRoute
            ? '🧬 Lv.5 原生进化 · 选择你的液态路线 🧬'
            : isOriginMark
            ? '🧬 Lv.9 异源印记 · 选择一种外来特征 🧬'
            : milestoneType === 'primary' ? '👑 Lv.5 主专精觉醒 · 抉择你的进化宿命 👑' : '🥈 Lv.9 副专精共鸣 · 挑选你的辅助流派 🥈' }}
        </h2>
        <div class="milestone-sub">
          {{ isOriginRoute
            ? '路线决定黏液震荡的形态与超载主体效果；不会复制任何职业树，空格始终是黏液震荡。'
            : isOriginMark
            ? '印记只提供轻量附加特征与一次超载回响；不会开放对应职业的吞噬、伙伴、法术或分身系统。'
            : milestoneType === 'primary'
            ? '主专精将确立你的核心战斗形态，并解锁后续 T2~T3 高阶技能与 T4 终极觉醒大招！'
            : '选择后立即获得一项基础共鸣，后续升级可继续强化并解锁同系辅助能力。' }}
        </div>
      </div>

      <div class="milestone-cards">
        <div
          v-for="(s, idx) in options"
          :key="s.id"
          class="milestone-card"
          :class="{ 'is-selected': selectedIndex === idx }"
          :style="{ '--spec-color': s.color }"
          @click="emit('select', s)"
          @mouseenter="selectedIndex = idx"
        >
          <kbd class="key-hint" aria-hidden="true">{{ idx + 1 }}</kbd>
          <div class="ms-top">
            <SkillIcon :skill="{ ...s, id: s.iconId || `spec_${s.spec}` }" />
            <div class="ms-name">{{ s.name }}</div>
            <div class="ms-desc">{{ s.desc }}</div>
          </div>

          <!-- 觉醒即时赋能 -->
          <div class="ms-bonus-box">
            <div class="ms-bonus-title">{{ isOriginRoute ? '🧬 路线确立' : isOriginMark ? '🧬 印记效果' : milestoneType === 'primary' ? '⚡ 初始觉醒赋能' : '⚡ 选择后立即获得' }}</div>
            <div class="ms-bonus-val">{{ s.bonus }}</div>
          </div>

          <!-- 玩法规则改写：主专精决定你怎么用（暴击／分裂／元素）。
               刺客那条依赖元素权限，对暗影隐藏——不承诺拿不到的效果。 -->
          <div v-if="!isOriginRoute && !isOriginMark && milestoneType === 'primary' && canShowSpecRule(s.spec)" class="ms-element-rule">
            {{ SPEC_ELEMENT_RULE[s.spec] }}
          </div>

          <!-- 未来进阶路线预览 -->
          <div v-if="milestoneType === 'primary' || isOriginRoute || isOriginMark" class="ms-roadmap">
            <div class="ms-roadmap-title">{{ isOriginRoute ? '📜 路线进阶预览' : isOriginMark ? '📜 印记强化预览' : '📜 未来进阶与终极觉醒预览' }}</div>
            <div v-for="(rm, idx) in s.roadmap" :key="idx" class="roadmap-item" :class="{ capstone: !isOriginRoute && !isOriginMark && idx === 3 }">
              {{ rm }}
            </div>
          </div>

          <button class="ms-select-btn">
            {{ isOriginRoute
              ? `🧬 确立【${s.tags?.[1] || s.name}】路线`
              : isOriginMark
              ? `🧬 烙下【${s.tags?.[1] || s.name}】`
              : milestoneType === 'primary' ? `👑 确立【${s.tags[1]}】为主专精` : `🥈 确立【${s.tags[1]}】为副专精` }}
          </button>
        </div>
      </div>
      <div class="keyboard-hint" aria-hidden="true">⌨ ← → 切换 · Enter / 空格 确认 · 数字键直选</div>
    </div>

    <!-- 2. 常规升级 3 卡面板 (自由探索 / 主副专精深潜 / 通用) -->
    <div v-else class="levelup-panel">
      <h2 class="levelup-title">{{ rewardTitle || (isBossReward ? '📜 王级职业秘典 · 选择一项专属强化 📜' : isPartnerSelection ? '招募你的第一位搭档' : `✨ 升级！Lv.${level} · 选择一项基因进化 ✨`) }}</h2>
      <div class="levelup-grow">
        {{ options[0]?.buildNote || (isBossReward
          ? (options.some(s => s.isPartnerChoice) ? '选择伙伴契约即可增加一位在场伙伴；每种一只，最多组成四人小队。' : '击败首领获得的职业秘典：不占用升级次数，只能选择当前职业的强力专属技能。')
          : isPartnerSelection
          ? '先选一位搭档同行，后续升级或 BOSS 秘典可继续招募，最多四只伙伴共同作战。'
          : roleSpec === 'elemental'
          ? '随机发现新元素与本系强化；掌握两系后融合，三系以上按顺序轮转。中期路线锁定后方向不再改变。'
          : level < 5
          ? (roleSpec
            ? '🌱 阶段说明：Lv.1~4 只开放本角色专属技能树（Lv.5 自动觉醒为你的主专精，无需选择）'
            : '🌱 阶段说明：Lv.1~4 为自由变异期（原生核心/碎片/通用卡自由混搭，Lv.5 三选一原生路线）')
          : '📈 等级成长：攻击力自动提升 8%（已生效，可与技能叠加）') }}
      </div>
      <div v-if="slotMilestone" class="levelup-slot" :class="{ hit: slotMilestone.hit }">
        {{ slotMilestone.text }}
      </div>
      <div class="levelup-cards">
        <button
          v-for="(s, idx) in options"
          :key="s.id"
          :class="['skill-card', cardClass(s), { 'is-selected': selectedIndex === idx, 'is-ricochet': s.isRicochetSkill || s.id?.startsWith('boss_rico_'), 'is-ricochet-hybrid': s.kind === 'hybrid', 'is-glutton': isGluttonSkill(s), 'is-elemental': s.isElementalSkill || s.isElementalDiscovery, 'is-shadow': s.isShadowSkill, 'is-active-skill': s.id === 'com_shock' }]"
          :style="cardStyle(s)"
          :title="s.isBossSkill ? 'BOSS 专属技能' : `当前 Lv.${s.level} · 选择后 Lv.${s.level + 1}`"
          @click="emit('select', s)"
          @mouseenter="selectedIndex = idx"
        >
          <kbd class="key-hint" aria-hidden="true">{{ idx + 1 }}</kbd>
          <!-- 流派定位指示 -->
          <div class="role-badge">{{ roleLabel(s) }}</div>

          <!-- 等级角标 -->
          <i v-if="!s.isBossSkill" class="skill-lv">Lv.{{ s.level + 1 }}/{{ s.maxLevel === Infinity ? '∞' : s.maxLevel }}</i>
          <i v-else class="skill-lv boss-lv">BOSS</i>

          <SkillIcon :skill="s" />

          <div v-if="visibleTags(s).length" class="skill-tags">
            <span v-for="t in visibleTags(s)" :key="t" class="skill-tag">{{ t }}</span>
          </div>

          <div class="skill-name">{{ s.name }}</div>
          <div class="skill-desc">{{ s.desc }}</div>

          <!-- 该级具体数值 -->
          <div class="skill-num">{{ s.stats }}</div>
        </button>
      </div>
      <div class="keyboard-hint" aria-hidden="true">⌨ ← → 切换 · Enter / 空格 确认 · 数字键直选</div>
      <button v-if="rerollable" class="reroll-btn" title="重抽本组候选（R 键）" @click="emit('reroll')">🔄 刷新候选 ×{{ rerolls }}</button>
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
  /* 五系拟态里程碑有 5 张卡：内容超高时宁可滚动也不可裁掉顶部 */
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(5px);
}

/* ====================================================
   1. 里程碑专精觉醒仪式大界面
==================================================== */
.milestone-panel {
  text-align: center;
  max-width: 1240px;
  width: 97%;
  /* margin:auto + overlay 滚动：放得下时居中，放不下时从顶部排起可滚到底部 */
  margin: auto;
}

.milestone-header {
  margin-bottom: 18px;
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
  /* 5 张卡一排：196px×5 + 间距 ≈ 1120px，1240 容器内自适应铺开 */
  grid-template-columns: repeat(auto-fit, minmax(196px, 1fr));
  gap: 14px;
  justify-content: center;
}

.milestone-card {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 18px 12px 14px;
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
  margin-bottom: 10px;
}


.ms-name {
  font-size: 17px;
  font-weight: 800;
  color: var(--spec-color);
  margin-bottom: 5px;
}

.ms-desc {
  font-size: 11.5px;
  line-height: 1.5;
  color: rgba(232, 245, 224, 0.7);
}

.ms-bonus-box {
  margin: 8px 0;
  padding: 7px 8px;
  border-radius: 10px;
  background: rgba(255, 209, 102, 0.08);
  border: 1px dashed rgba(255, 209, 102, 0.3);
}

.ms-bonus-title {
  font-size: 10.5px;
  font-weight: 700;
  color: #ffd166;
  margin-bottom: 3px;
}

.ms-bonus-val {
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  line-height: 1.45;
}

.ms-roadmap {
  margin: 6px 0 12px;
  padding: 7px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.35);
  font-size: 10.5px;
  line-height: 1.55;
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

/* 备选蓝图（黑市）：刷新候选按钮 */
.reroll-btn {
  margin-top: 18px;
  padding: 9px 22px;
  border-radius: 999px;
  border: 1px solid rgba(79, 195, 247, 0.55);
  background: rgba(20, 42, 54, 0.9);
  color: #bfe8ff;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1px;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.reroll-btn:hover {
  transform: scale(1.04);
  border-color: #4fc3f7;
  box-shadow: 0 6px 22px rgba(79, 195, 247, 0.3);
}
.reroll-btn:active { transform: scale(0.97); }

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

.card-partner {
  border: 1.5px solid color-mix(in srgb, var(--partner-color) 55%, transparent);
  background: linear-gradient(165deg, rgba(22, 37, 32, 0.98), rgba(10, 19, 17, 0.98));
}
.card-partner:hover {
  border-color: var(--partner-color);
  box-shadow: 0 10px 28px color-mix(in srgb, var(--partner-color) 22%, transparent);
}
.card-partner .skill-name,
.card-partner .skill-num { color: var(--partner-color); }
.card-partner .skill-num {
  background: color-mix(in srgb, var(--partner-color) 10%, transparent);
  border-color: color-mix(in srgb, var(--partner-color) 28%, transparent);
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
.skill-card.is-ricochet {
  border: 1px solid color-mix(in srgb, var(--rico-color) 48%, transparent);
  background: linear-gradient(165deg, color-mix(in srgb, var(--rico-color) 10%, #111820), #0a0f14);
}
.skill-card.is-ricochet:hover {
  border-color: color-mix(in srgb, var(--rico-color) 82%, white 18%);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--rico-color) 16%, transparent);
}
.skill-card.is-ricochet .role-badge {
  color: var(--rico-color);
  background: color-mix(in srgb, var(--rico-color) 11%, #111820);
  border-color: color-mix(in srgb, var(--rico-color) 36%, transparent);
}
.skill-card.is-ricochet .skill-name { color: var(--rico-color); }
.skill-card.is-ricochet .skill-tag {
  color: color-mix(in srgb, var(--rico-color) 82%, white 18%);
  background: color-mix(in srgb, var(--rico-color) 8%, transparent);
  border-color: color-mix(in srgb, var(--rico-color) 24%, transparent);
}
.skill-card.is-ricochet .skill-num {
  color: color-mix(in srgb, var(--rico-color) 90%, white 10%);
  border-color: color-mix(in srgb, var(--rico-color) 28%, transparent);
  background: color-mix(in srgb, var(--rico-color) 7%, transparent);
}
.skill-card.is-ricochet-hybrid { border-style: dashed; }
.skill-card.is-glutton {
  border: 1px solid color-mix(in srgb, var(--glutton-color) 48%, transparent);
  background: linear-gradient(165deg, color-mix(in srgb, var(--glutton-color) 10%, #21170f), #100d0b);
}
.skill-card.is-glutton:hover {
  border-color: color-mix(in srgb, var(--glutton-color) 82%, white 18%);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--glutton-color) 16%, transparent);
}
.skill-card.is-glutton .role-badge {
  color: var(--glutton-color);
  background: color-mix(in srgb, var(--glutton-color) 11%, #21170f);
  border-color: color-mix(in srgb, var(--glutton-color) 36%, transparent);
}
.skill-card.is-glutton .skill-name { color: var(--glutton-color); }
.skill-card.is-glutton .skill-tag {
  color: color-mix(in srgb, var(--glutton-color) 82%, white 18%);
  background: color-mix(in srgb, var(--glutton-color) 8%, transparent);
  border-color: color-mix(in srgb, var(--glutton-color) 24%, transparent);
}
.skill-card.is-glutton .skill-num {
  color: color-mix(in srgb, var(--glutton-color) 90%, white 10%);
  border-color: color-mix(in srgb, var(--glutton-color) 28%, transparent);
  background: color-mix(in srgb, var(--glutton-color) 7%, transparent);
}
.skill-card.is-shadow {
  border: 1px solid color-mix(in srgb, var(--shadow-color) 45%, transparent);
  background: linear-gradient(165deg, color-mix(in srgb, var(--shadow-color) 9%, #171821), #0c0e15);
}
.skill-card.is-shadow:hover {
  border-color: color-mix(in srgb, var(--shadow-color) 82%, white 18%);
  box-shadow: 0 8px 22px color-mix(in srgb, var(--shadow-color) 15%, transparent);
}
.skill-card.is-shadow .role-badge,
.skill-card.is-shadow .skill-name { color: var(--shadow-color); }
.skill-card.is-shadow .role-badge,
.skill-card.is-shadow .skill-tag,
.skill-card.is-shadow .skill-num { border-color: color-mix(in srgb, var(--shadow-color) 30%, transparent); }
.skill-card.is-shadow .skill-tag { color: color-mix(in srgb, var(--shadow-color) 82%, white 18%); background: color-mix(in srgb, var(--shadow-color) 7%, transparent); }
.skill-card.is-shadow .skill-num { color: color-mix(in srgb, var(--shadow-color) 90%, white 10%); background: color-mix(in srgb, var(--shadow-color) 6%, transparent); }
.skill-card.is-active-skill {
  border: 1px solid color-mix(in srgb, #8bdbe8 48%, transparent);
  background: linear-gradient(165deg, color-mix(in srgb, #8bdbe8 10%, #111820), #0a0f14);
}
.skill-card.is-active-skill .role-badge,
.skill-card.is-active-skill .skill-name { color: #8bdbe8; }
.skill-card.is-active-skill .role-badge,
.skill-card.is-active-skill .skill-tag,
.skill-card.is-active-skill .skill-num { border-color: color-mix(in srgb, #8bdbe8 30%, transparent); }
.skill-card.is-active-skill .skill-num { color: #a9eaf2; background: color-mix(in srgb, #8bdbe8 7%, transparent); }
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
.card-partner .role-badge {
  background: #192823;
  border-color: var(--partner-color);
  color: var(--partner-color);
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

/* ====================================================
   3. 键盘选中态（与鼠标 hover 区分）与按键提示
   hover = 卡片上浮 + 流派色描边；选中 = 金色外环 + 呼吸光晕，
   两者可同时存在（鼠标悬在选中卡上）而语义不混。
==================================================== */
.skill-card.is-selected,
.milestone-card.is-selected {
  transform: translateY(-6px);
  outline: 3px solid #ffd166;
  outline-offset: 3px;
  animation: selectedRingPulse 1.6s ease-in-out infinite;
}

@keyframes selectedRingPulse {
  0%, 100% { box-shadow: 0 0 14px rgba(255, 209, 102, 0.28); }
  50% { box-shadow: 0 0 30px rgba(255, 209, 102, 0.6); }
}

/* 数字键角标（可发现的快捷键标注，不是隐藏键） */
.key-hint {
  position: absolute;
  left: 10px;
  bottom: 10px;
  min-width: 18px;
  padding: 1px 5px;
  border-radius: 5px;
  font-family: inherit;
  font-size: 10.5px;
  font-weight: 800;
  text-align: center;
  color: rgba(255, 209, 102, 0.9);
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 209, 102, 0.4);
  pointer-events: none;
}

.is-selected .key-hint {
  color: #1a1206;
  background: #ffd166;
  border-color: #ffd166;
}

.keyboard-hint {
  margin-top: 18px;
  font-size: 12px;
  letter-spacing: 1px;
  color: rgba(234, 255, 221, 0.55);
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

  /* 里程碑卡在窄屏单列铺开：五系拟态卡内容密集，两列挤压不可读 */
  .milestone-cards {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .milestone-card {
    padding: 14px 12px 12px;
  }

  .milestone-card:hover {
    transform: none;
  }

  .ms-name {
    font-size: 16px;
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

  /* 窄屏禁用 hover 上浮，选中态同样保持原位，只留金环标识 */
  .skill-card.is-selected,
  .milestone-card.is-selected {
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

  :deep(.skill-card .skill-glyph) {
    grid-column: 1;
    grid-row: 1 / 5;
    align-self: center;
    justify-self: center;
    margin: 0;
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
.levelup-overlay.embedded { position: static; inset: auto; padding: 0; background: transparent; backdrop-filter: none; }
.embedded .levelup-panel { width: 100%; max-width: none; padding: 0; border: 0; background: transparent; box-shadow: none; }
.embedded .levelup-title { font-size: 17px; }
</style>
