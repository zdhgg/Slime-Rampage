<script setup>
/**
 * LevelUpModal：升级技能与里程碑专精觉醒面板
 */
import { computed, onBeforeUnmount, onMounted } from 'vue'
import SkillIcon from './SkillIcon.vue'
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
import { ELEMENTAL_ICON_COLORS } from './skillIconRegistry.js'
import { ORIGIN_MARKS, ORIGIN_ROUTES } from '../game/OriginBuild.js'

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
  // 元素权限（第四批）：无权限角色拿不到刺客元素赋能，需隐藏该规则
  canUseElements: { type: Boolean, default: true },
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
 * 打开默认选中中间卡，方向键和数字键切换，Enter 确认。
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

// 是否处于专精觉醒里程碑
const isMilestone = computed(() => !!props.options?.[0]?.isMilestone)
const milestoneType = computed(() => props.options?.[0]?.milestoneType || 'primary')

const STRAIN_THEMES = {
  origin: { label: '🧬 原生黏液', accent: '#6ee7b7' },
  gatling: { label: '🔫 弹射史莱姆', accent: '#56ccf2' },
  gluttony: { label: '🍽️ 暴食史莱姆', accent: '#ff9f43' },
  symbiosis: { label: '🐾 共生史莱姆', accent: '#edc479' },
  elemental: { label: '🔮 元素史莱姆', accent: '#b6a4ff' },
  assassin: { label: '🗡️ 暗影史莱姆', accent: '#f18ba5' },
}

const ROUTE_SHORTS = {
  split: '分裂', pierce: '贯穿', bounce: '折射',
  mire: '腐沼', jaw: '裂颚', shell: '饕甲',
  hunt: '猎团', spore: '孢潮', guard: '守望',
  blade: '刃潮', swarm: '群影',
  single: '极化', fusion: '融合', cycle: '轮转',
}

const COMMON_CARD_ACCENT = '#6ec4a6'

const isBossReward = computed(() => !!props.options?.[0]?.isBossSkill)
const isPartnerSelection = computed(() => props.options?.length > 0 && props.options.every(s => s.isPartnerChoice))

const activeStrain = computed(() => {
  if (props.roleSpec && STRAIN_THEMES[props.roleSpec]) return props.roleSpec
  for (const s of props.options || []) {
    if (s.isRicochetSkill || s.id?.startsWith('boss_rico_') || s.id?.startsWith('rico_')) return 'gatling'
    if (isGluttonSkill(s)) return 'gluttony'
    if (isSymbiosisSkill(s) || s.isPartnerChoice || s.id?.startsWith('boss_pet_') || s.id?.startsWith('pet_')) return 'symbiosis'
    if (s.isElementalSkill || s.isElementalDiscovery || s.id?.startsWith('boss_elemental_') || s.id?.startsWith('spell_') || s.id?.startsWith('ele_')) return 'elemental'
    if (s.isShadowSkill || s.id?.startsWith('boss_shadow_') || s.id?.startsWith('boss_assassin_') || s.id?.startsWith('ass_') || s.id?.startsWith('shadow_')) return 'assassin'
    if (s.originOnly || s.originPool || s.id?.startsWith('boss_origin_') || s.id?.startsWith('ori_') || s.id?.startsWith('origin_')) return 'origin'
  }
  return 'origin'
})

const strainTheme = computed(() => {
  const base = STRAIN_THEMES[activeStrain.value] || STRAIN_THEMES.origin
  if (isBossReward.value) return { label: `${base.label} · 王级秘典`, accent: props.options?.[0]?.color || base.accent }
  if (isPartnerSelection.value) return { label: '🐾 共生史莱姆 · 伙伴契约', accent: '#edc479' }
  return base
})

const joinTagPair = (s, fallback) => {
  const first = s.tags?.[0], second = s.tags?.[1]
  if (!first) return fallback
  if (!second || second === first || ['基础', '进阶', '随机成长'].includes(second)) return first
  return `${first} · ${second}`
}

const roleLabel = (s) => {
  if (s.isOriginRoute) return '🧬 原生进化路线'
  if (s.isOriginMark) return '🧬 异源印记'
  if (s.originPool === 'fragment') return s.tags?.[1] ? `🧩 ${s.tags[1].replace('印记', '')}碎片` : '🧩 异源碎片'
  if (s.role === 'origin_route') return `🌊 路线 · ${s.tags?.find(tag => ['扩张', '同化', '共振'].includes(tag)) || '强化'}`
  if (s.role === 'origin_mark') return s.tags?.[1] ? `🧬 深化 · ${s.tags[1].replace('印记', '')}` : '🧬 印记强化'
  if (s.originOnly) return '💧 原生核心'
  if (s.isBossSkill) return s.isPartnerChoice ? '🐾 BOSS伙伴契约' : '📜 BOSS职业秘典'
  if (s.isCapstone || s.kind === 'ultimate') return s.tags?.[1] ? `🌟 终极 · ${s.tags[1]}` : '🌟 终极觉醒'
  if (s.isPartnerChoice) return '🐾 招募伙伴 · 在场 +1'
  if (s.element || s.isElementalSkill || s.isElementalDiscovery || s.spec === 'elemental') return joinTagPair(s, '🔮 元素构筑')
  if (s.kind === 'hybrid' && s.routes?.length === 2) {
    return `✦ 混搭 · ${ROUTE_SHORTS[s.routes[0]] || s.routes[0]}×${ROUTE_SHORTS[s.routes[1]] || s.routes[1]}`
  }
  if (s.isRicochetSkill) return joinTagPair(s, '弹道进化')
  if (s.isGluttonSkill) return joinTagPair(s, '暴食进化')
  if (s.isSymbiosisSkill) return joinTagPair(s, '共生进化')
  if (s.isShadowSkill) return joinTagPair(s, '暗影进化')
  if (s.role === 't1_free') return '🌱 自由变异尝试'
  if (s.role === 'primary') return joinTagPair(s, '🔥 主专精深潜')
  if (s.role === 'secondary') return joinTagPair(s, '🔗 副专精共鸣')
  if (s.role === 'role_t1') return joinTagPair(s, '🔮 专属强化')
  return s.kind === 'common' && s.tags?.[0] ? s.tags[0] : '💚 通用生存'
}

const isCommonCard = (s) =>
  !s.isBossSkill &&
  !s.isCapstone &&
  s.kind !== 'ultimate' &&
  !s.isPartnerChoice &&
  !s.element &&
  !s.originOnly &&
  !s.originPool &&
  !s.isElementalDiscovery &&
  (s.kind === 'common' || (s.role === 'common' && !s.route))

const cardClass = (s) => {
  if (s.isOriginRoute) return 'card-primary'
  if (s.isOriginMark) return 'card-secondary'
  if (s.originPool === 'fragment') return 'card-free'
  if (s.element || s.role === 'role_t1' || s.originOnly) return 'card-primary'
  if (s.isBossSkill) return s.isPartnerChoice ? 'card-partner' : 'card-boss'
  if (s.isCapstone || s.kind === 'ultimate') return 'card-capstone'
  if (s.isPartnerChoice) return 'card-partner'
  if (s.role === 'primary') return 'card-primary'
  if (s.role === 'secondary') return 'card-secondary'
  if (s.role === 't1_free') return 'card-free'
  return 'card-common'
}

const cardTierClass = (s) => {
  if (s.isBossSkill) return 'tier-boss'
  if (s.isCapstone || s.kind === 'ultimate') return 'tier-capstone'
  if (s.isPartnerChoice) return 'tier-partner'
  if (s.kind === 'hybrid') return 'tier-hybrid'
  if (isCommonCard(s)) return 'tier-common'
  return 'tier-route'
}

const resolveCardAccent = (s) => {
  if (s.isBossSkill) return s.color || '#f472b6'
  if (s.isPartnerChoice) return s.color || '#ec8db8'
  if (s.originPool === 'fragment') return ORIGIN_MARKS[s.fragment]?.color || '#6ee7b7'
  if (s.role === 'origin_route') return ORIGIN_ROUTES[s.route]?.color || '#5ad1c8'
  if (s.role === 'origin_mark') return ORIGIN_MARKS[s.mark]?.color || '#edc479'
  if (s.originOnly) return s.id === 'com_shock' ? '#45d9c8' : '#66e3b4'
  if (s.isRicochetSkill || s.id?.startsWith('boss_rico_')) {
    if (s.kind === 'hybrid') return RICOCHET_ROUTE_COLORS[s.routes?.[0]] || RICOCHET_ROUTE_COLORS.hybrid
    if (s.kind === 'common') return COMMON_CARD_ACCENT
    const route = s.route || s.routes?.[0]
    return RICOCHET_ROUTE_COLORS[route || 'common'] || COMMON_CARD_ACCENT
  }
  if (isGluttonSkill(s) || s.isGluttonRoute) {
    if (s.kind === 'common') return COMMON_CARD_ACCENT
    const route = s.route || GLUTTON_ICON_ROUTES[s.id] || 'common'
    return s.color || GLUTTON_ICON_COLORS[route] || GLUTTON_ICON_COLORS.common
  }
  if (isSymbiosisSkill(s) || s.isSymbiosisRoute || s.spec === 'symbiosis') {
    if (s.kind === 'common') return COMMON_CARD_ACCENT
    const route = s.route || SYMBIOSIS_ICON_ROUTES[s.id]
    return s.color || (route ? SYMBIOSIS_ICON_COLORS[route] : '#edc479')
  }
  if (s.isShadowSkill || s.isShadowRoute || s.spec === 'assassin') {
    if (s.kind === 'common' && !s.isShadowSkill) return COMMON_CARD_ACCENT
    const route = s.route || SHADOW_ICON_ROUTES[s.id]
    return s.color || (route ? SHADOW_ICON_COLORS[route] : '#d892b8')
  }
  if (s.element || s.isElementalSkill || s.isElementalDiscovery || s.spec === 'elemental') {
    if (s.element) return s.color || ELEMENTAL_ICON_COLORS[s.element] || '#b6a4ff'
    if (s.route) return s.color || ELEMENTAL_ICON_COLORS[s.route] || '#b6a4ff'
    if (s.id === 'spell_shield') return '#84d6e8'
    return s.color || '#b6a4ff'
  }
  if (isCommonCard(s)) return COMMON_CARD_ACCENT
  return STRAIN_THEMES[s.spec]?.accent || '#66e3b4'
}

const cardStyle = (s) => {
  const accent = resolveCardAccent(s)
  const style = { '--card-accent': accent }
  if (s.kind === 'hybrid' && s.routes?.length >= 2) {
    style['--card-accent-2'] = RICOCHET_ROUTE_COLORS[s.routes[1]] || accent
  }
  if (s.isRicochetSkill || s.id?.startsWith('boss_rico_')) {
    const route = s.route || s.routes?.[0]
    const family = s.isBossSkill ? 'boss' : s.kind === 'hybrid' ? 'hybrid' : route || 'common'
    style['--rico-color'] = RICOCHET_ROUTE_COLORS[family] || RICOCHET_ROUTE_COLORS.common
  }
  if (isGluttonSkill(s) || s.isGluttonRoute) {
    const route = s.route || GLUTTON_ICON_ROUTES[s.id] || 'common'
    style['--glutton-color'] = s.color || GLUTTON_ICON_COLORS[route] || GLUTTON_ICON_COLORS.common
  }
  if (isSymbiosisSkill(s) || s.isSymbiosisRoute) {
    const route = s.route || SYMBIOSIS_ICON_ROUTES[s.id] || 'common'
    style['--symbiosis-color'] = s.color || SYMBIOSIS_ICON_COLORS[route] || SYMBIOSIS_ICON_COLORS.common
  }
  if (s.isShadowSkill || s.isShadowRoute) {
    const route = s.route || SHADOW_ICON_ROUTES[s.id] || 'common'
    style['--shadow-color'] = s.color || SHADOW_ICON_COLORS[route] || SHADOW_ICON_COLORS.common
  }
  if (s.isPartnerChoice && s.color) {
    style['--partner-color'] = s.color
  }
  return style
}
</script>

<template>
  <div class="levelup-overlay" :class="{ embedded, 'is-milestone': isMilestone }" :role="embedded ? 'group' : 'dialog'" :aria-modal="embedded ? undefined : true" aria-label="升级选择">
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
            ? '🧬 Lv.5 原生进化 · 选择你的核心玩法 🧬'
            : isOriginMark
            ? '🧬 Lv.9 异源印记 · 选择一种外来特征 🧬'
            : milestoneType === 'primary' ? '👑 Lv.5 主专精觉醒 · 抉择你的进化宿命 👑' : '🥈 Lv.9 副专精共鸣 · 挑选你的辅助流派 🥈' }}
        </h2>
        <div class="milestone-sub">
          {{ isOriginRoute
            ? '只选一个方向：它决定黏液震荡和超载怎么成长；空格仍是黏液震荡。'
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
          :class="{ 'is-selected': selectedIndex === idx, 'is-origin-route': isOriginRoute }"
          :style="{ '--spec-color': s.color }"
          :title="isOriginRoute ? s.desc : undefined"
          @click="emit('select', s)"
          @mouseenter="selectedIndex = idx"
        >
          <kbd class="key-hint" aria-hidden="true">{{ idx + 1 }}</kbd>
          <div class="ms-top">
            <SkillIcon :skill="{ ...s, id: s.iconId || `spec_${s.spec}` }" />
            <div class="ms-name">{{ isOriginRoute ? (s.tags?.[1] || s.name) : s.name }}</div>
            <div class="ms-desc">{{ isOriginRoute ? s.summary : s.desc }}</div>
          </div>

          <!-- 觉醒即时赋能 -->
          <div class="ms-bonus-box">
            <div class="ms-bonus-title">{{ isOriginRoute ? '🧬 选中后' : isOriginMark ? '🧬 印记效果' : milestoneType === 'primary' ? '⚡ 初始觉醒赋能' : '⚡ 选择后立即获得' }}</div>
            <div class="ms-bonus-val">{{ isOriginRoute ? s.instant : s.bonus }}</div>
          </div>

          <!-- 玩法规则改写：主专精决定你怎么用（暴击／分裂／元素）。
               刺客那条依赖元素权限，对暗影隐藏——不承诺拿不到的效果。 -->
          <div v-if="!isOriginRoute && !isOriginMark && milestoneType === 'primary' && canShowSpecRule(s.spec)" class="ms-element-rule">
            {{ SPEC_ELEMENT_RULE[s.spec] }}
          </div>

          <!-- 未来进阶路线预览 -->
          <div v-if="isOriginRoute" class="ms-roadmap origin-route-growth">
            <div class="ms-roadmap-title">成长方向</div>
            <div class="origin-growth-steps">
              <template v-for="(step, stepIdx) in s.growth" :key="step">
                <span class="origin-growth-step">{{ step }}</span>
                <span v-if="stepIdx < s.growth.length - 1" class="origin-growth-arrow" aria-hidden="true">→</span>
              </template>
            </div>
          </div>

          <div v-else-if="milestoneType === 'primary' || isOriginMark" class="ms-roadmap">
            <div class="ms-roadmap-title">{{ isOriginRoute ? '📜 路线进阶预览' : isOriginMark ? '📜 印记强化预览' : '📜 未来进阶与终极觉醒预览' }}</div>
            <div v-for="(rm, idx) in s.roadmap" :key="idx" class="roadmap-item" :class="{ capstone: !isOriginRoute && !isOriginMark && idx === 3 }">
              {{ rm }}
            </div>
          </div>

          <button class="ms-select-btn">
            {{ isOriginRoute
              ? `选择【${s.tags?.[1] || s.name}】`
              : isOriginMark
              ? `🧬 烙下【${s.tags?.[1] || s.name}】`
              : milestoneType === 'primary' ? `👑 确立【${s.tags[1]}】为主专精` : `🥈 确立【${s.tags[1]}】为副专精` }}
          </button>
        </div>
      </div>
      <div class="keyboard-hint" aria-hidden="true">⌨ ← → 或数字键切换 · Enter 确认</div>
    </div>

    <!-- 2. 常规升级 3 卡面板 (自由探索 / 主副专精深潜 / 通用)：深苔藓悬浮进化卡牌 -->
    <div v-else class="levelup-panel" :style="{ '--strain-accent': strainTheme.accent }">
      <div v-if="!embedded" class="levelup-kicker">{{ strainTheme.label }}</div>
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
      <div class="levelup-cards">
        <button
          v-for="(s, idx) in options"
          :key="s.id"
          :class="['skill-card', cardClass(s), cardTierClass(s), { 'is-selected': selectedIndex === idx, 'is-ricochet': s.isRicochetSkill || s.id?.startsWith('boss_rico_'), 'is-ricochet-hybrid': s.kind === 'hybrid', 'is-glutton': isGluttonSkill(s), 'is-symbiosis': isSymbiosisSkill(s), 'is-elemental': s.isElementalSkill || s.isElementalDiscovery || !!s.element, 'is-shadow': s.isShadowSkill, 'is-active-skill': s.id === 'com_shock' }]"
          :style="cardStyle(s)"
          :title="s.isBossSkill ? 'BOSS 专属技能' : `当前 Lv.${s.level} · 选择后 Lv.${s.level + 1}`"
          @click="emit('select', s)"
          @mouseenter="selectedIndex = idx"
        >
          <kbd class="key-hint" aria-hidden="true">{{ idx + 1 }}</kbd>
          <!-- 流派定位指示（唯一类别标签） -->
          <div class="role-badge">{{ roleLabel(s) }}</div>

          <!-- 等级角标 -->
          <i v-if="!s.isBossSkill" class="skill-lv">Lv.{{ s.level + 1 }}/{{ s.maxLevel === Infinity ? '∞' : s.maxLevel }}</i>
          <i v-else class="skill-lv boss-lv">BOSS</i>

          <SkillIcon :skill="s" />

          <div class="skill-name">{{ s.name }}</div>
          <div class="skill-desc">{{ s.desc }}</div>

          <!-- 该级具体数值（亮色增益框） -->
          <div class="skill-num">{{ s.stats }}</div>

          <!-- 选中行动提示条 -->
          <span class="card-cta" aria-hidden="true">点击或按 Enter 选择 ✨</span>
        </button>
      </div>
      <div class="keyboard-hint" aria-hidden="true">⌨ ← → 或数字键切换 · Enter 确认</div>
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
  background: rgba(15, 35, 25, 0.45);
  backdrop-filter: blur(8px);
}

.levelup-overlay.is-milestone {
  background: rgba(10, 20, 15, 0.62);
  backdrop-filter: blur(10px);
}

/* ====================================================
   1. 里程碑专精觉醒仪式大界面（深苔藓磨砂玻璃 + 荧光生物进化风）
==================================================== */
.milestone-panel {
  text-align: center;
  max-width: 1240px;
  width: 97%;
  /* margin:auto + overlay 滚动：放得下时居中，放不下时从顶部排起可滚到底部 */
  margin: auto;
  padding: 28px 22px 22px;
  border-radius: 18px;
  border: 1px solid var(--art-edge, rgba(225, 211, 170, 0.34));
  background:
    radial-gradient(ellipse at 50% 0%, rgba(169, 232, 160, 0.08), transparent 62%),
    var(--art-surface, rgba(19, 27, 23, 0.88));
  backdrop-filter: blur(14px);
  box-shadow:
    inset 0 1px 0 rgba(255, 246, 214, 0.08),
    0 24px 64px rgba(0, 0, 0, 0.52);
  color: var(--art-text, #f3ead5);
}

.milestone-header {
  margin-bottom: 20px;
}

.milestone-title {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 1.5px;
  color: #f2d27a;
  text-shadow: 0 2px 12px rgba(215, 184, 110, 0.24), 0 2px 6px rgba(0, 0, 0, 0.45);
  margin-bottom: 8px;
}

.milestone-sub {
  font-size: 13.5px;
  line-height: 1.55;
  letter-spacing: 0.5px;
  color: var(--art-muted, #a9b6a4);
}

.milestone-cards {
  display: grid;
  /* 5 张卡一排：196px×5 + 间距 ≈ 1120px，1240 容器内自适应铺开 */
  grid-template-columns: repeat(auto-fit, minmax(196px, 1fr));
  gap: 16px;
  justify-content: center;
}

.milestone-card {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 20px 14px 14px;
  border-radius: 14px;
  background:
    radial-gradient(circle at 50% 14%, color-mix(in srgb, var(--spec-color) 14%, transparent) 0%, transparent 56%),
    linear-gradient(180deg, rgba(30, 46, 38, 0.96) 0%, rgba(19, 31, 25, 0.98) 100%);
  border: 1.5px solid color-mix(in srgb, var(--spec-color) 28%, rgba(225, 211, 170, 0.18));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 10px 24px rgba(0, 0, 0, 0.3);
  color: var(--art-text, #f3ead5);
  cursor: pointer;
  text-align: left;
  transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.milestone-card:hover {
  transform: translateY(-6px);
  border-color: var(--spec-color);
  background:
    radial-gradient(circle at 50% 14%, color-mix(in srgb, var(--spec-color) 24%, transparent) 0%, transparent 58%),
    linear-gradient(180deg, color-mix(in srgb, var(--spec-color) 10%, #1e2e26) 0%, rgba(21, 34, 27, 0.99) 100%);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--spec-color) 52%, transparent),
    0 0 26px color-mix(in srgb, var(--spec-color) 28%, transparent),
    0 16px 32px rgba(0, 0, 0, 0.45);
}

.milestone-card :deep(.skill-glyph) {
  --skill-icon-color: var(--spec-color) !important;
  border-color: color-mix(in srgb, var(--spec-color) 42%, rgba(255, 255, 255, 0.86));
  box-shadow:
    inset 0 -6px 12px color-mix(in srgb, var(--spec-color) 42%, rgba(0, 0, 0, 0.35)),
    0 0 22px color-mix(in srgb, var(--spec-color) 40%, transparent);
}

/* Lv.5 原生路线：把卡片收束成“玩法定位 → 立即效果 → 成长方向”三层信息。 */
.milestone-card.is-origin-route {
  min-height: 342px;
  padding: 22px 18px 16px;
}

.milestone-card.is-origin-route:hover {
  transform: translateY(-5px);
}

.milestone-card.is-origin-route .ms-top {
  margin-bottom: 14px;
}

.milestone-card.is-origin-route .ms-desc {
  min-height: 38px;
  font-size: 13px;
  line-height: 1.45;
  color: #c8d4c4;
}

.milestone-card.is-origin-route .ms-bonus-box {
  margin: 2px 0 10px;
  padding: 10px 12px 11px;
}

.milestone-card.is-origin-route .ms-bonus-val {
  font-size: 12px;
  line-height: 1.5;
}

.ms-top {
  text-align: center;
  margin-bottom: 10px;
}

.ms-name {
  font-size: 17px;
  font-weight: 800;
  color: color-mix(in srgb, var(--spec-color) 74%, #f7f3e8);
  text-shadow: 0 1px 10px color-mix(in srgb, var(--spec-color) 28%, transparent);
  margin-bottom: 5px;
}

.ms-desc {
  font-size: 11.5px;
  line-height: 1.5;
  color: #c8d4c4;
}

.ms-bonus-box {
  margin: 8px 0;
  padding: 8px 10px 9px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--spec-color) 11%, rgba(11, 19, 15, 0.72));
  border: 1px solid color-mix(in srgb, var(--spec-color) 30%, transparent);
  box-shadow: inset 3px 0 0 var(--spec-color);
}

.ms-bonus-title {
  font-size: 10.5px;
  font-weight: 700;
  color: color-mix(in srgb, var(--spec-color) 80%, #ffffff);
  margin-bottom: 4px;
}

.ms-bonus-val {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--art-text, #f3ead5);
  line-height: 1.48;
}

.ms-roadmap {
  margin: 6px 0 12px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(11, 19, 15, 0.58);
  border: 1px solid rgba(225, 211, 170, 0.12);
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
  color: #d6ccff;
  background: rgba(162, 155, 254, 0.12);
  border: 1px dashed rgba(162, 155, 254, 0.36);
}

.ms-roadmap-title {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--art-muted, #a9b6a4);
  margin-bottom: 5px;
  border-bottom: 1px solid rgba(225, 211, 170, 0.12);
  padding-bottom: 3px;
}

.roadmap-item {
  color: #c2cfc0;
}

.roadmap-item.capstone {
  color: #ffd166;
  font-weight: 700;
}

.origin-route-growth {
  margin: 0 0 14px;
  padding: 9px 10px 11px;
  background: rgba(11, 19, 15, 0.58);
  border: 1px solid rgba(225, 211, 170, 0.12);
}

.origin-growth-steps {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
  color: var(--art-text, #f3ead5);
}

.origin-growth-step {
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  color: color-mix(in srgb, var(--spec-color) 75%, #f3ead5);
  background: color-mix(in srgb, var(--spec-color) 12%, rgba(16, 28, 22, 0.9));
  border: 1px solid color-mix(in srgb, var(--spec-color) 28%, transparent);
}

.origin-growth-arrow {
  color: color-mix(in srgb, var(--spec-color) 75%, #a9b6a4);
  font-size: 12px;
  font-weight: 700;
}

.ms-select-btn {
  width: 100%;
  padding: 10px 8px;
  border-radius: 10px;
  font-size: 12.5px;
  font-weight: 800;
  letter-spacing: 0.2px;
  border: 1px solid color-mix(in srgb, var(--spec-color) 48%, transparent);
  cursor: pointer;
  background: color-mix(in srgb, var(--spec-color) 18%, #15231c);
  color: color-mix(in srgb, var(--spec-color) 65%, #ffffff);
  transition: transform 0.15s ease, filter 0.15s ease, background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.milestone-card.is-selected .ms-select-btn,
.milestone-card:hover .ms-select-btn,
.ms-select-btn:hover {
  background: linear-gradient(135deg, color-mix(in srgb, var(--spec-color) 86%, #ffffff 14%), var(--spec-color));
  border-color: color-mix(in srgb, var(--spec-color) 65%, #ffffff 35%);
  color: #0e1914;
  box-shadow: 0 4px 16px color-mix(in srgb, var(--spec-color) 35%, transparent);
}

.ms-select-btn:hover {
  transform: scale(1.02);
  filter: brightness(1.06);
}

/* ====================================================
   2. 常规升级面板：深苔藓磨砂风进化卡牌（无白底大框）
==================================================== */
.levelup-panel {
  text-align: center;
}

.levelup-kicker {
  display: inline-block;
  margin: 0 auto 10px;
  padding: 4px 14px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 1px;
  color: color-mix(in srgb, var(--strain-accent, #6ee7b7) 78%, #f7f3e8);
  background: color-mix(in srgb, var(--strain-accent, #6ee7b7) 12%, rgba(16, 27, 22, 0.92));
  border: 1px solid color-mix(in srgb, var(--strain-accent, #6ee7b7) 36%, transparent);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
}

/* 顶部标题：按史莱姆角色主题染色的磨砂玻璃横幅（居中） */
.levelup-title {
  display: block;
  width: fit-content;
  margin: 0 auto 12px;
  padding: 10px 28px;
  border: 1.5px solid color-mix(in srgb, var(--strain-accent, #f2d27a) 52%, rgba(225, 211, 170, 0.26));
  border-radius: 999px;
  font-size: 23px;
  font-weight: 800;
  letter-spacing: 1px;
  color: #f6efe0;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
  background:
    radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--strain-accent, #f2d27a) 22%, transparent), transparent 72%),
    linear-gradient(135deg, rgba(24, 39, 32, 0.95), rgba(15, 25, 20, 0.96));
  box-shadow:
    inset 0 1px 0 rgba(255, 246, 214, 0.1),
    0 0 24px color-mix(in srgb, var(--strain-accent, #f2d27a) 24%, transparent),
    0 10px 26px rgba(0, 0, 0, 0.36);
}

/* 副提示：标题下方独立一行的半透明深苔藓胶囊 */
.levelup-grow {
  display: block;
  width: fit-content;
  max-width: min(820px, 92vw);
  margin: 0 auto 30px;
  padding: 7px 18px;
  border: 1px solid color-mix(in srgb, var(--strain-accent, #a9e8a0) 24%, rgba(225, 211, 170, 0.18));
  border-radius: 999px;
  font-size: 12.5px;
  line-height: 1.5;
  letter-spacing: 0.3px;
  color: #d2ded0;
  background: rgba(15, 25, 20, 0.78);
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.24);
}

.levelup-cards {
  display: flex;
  gap: 20px;
  justify-content: center;
}

/* 备选蓝图（黑市）：刷新候选按钮 */
.reroll-btn {
  margin-top: 18px;
  padding: 9px 22px;
  border-radius: 999px;
  border: 1px solid rgba(86, 204, 242, 0.45);
  background: rgba(18, 30, 24, 0.9);
  color: #7fd4f5;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.8px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.reroll-btn:hover {
  transform: scale(1.04);
  border-color: #56ccf2;
  box-shadow: 0 0 18px rgba(86, 204, 242, 0.28), 0 8px 18px rgba(0, 0, 0, 0.35);
}
.reroll-btn:active { transform: scale(0.97); }

/* —— 深苔藓悬浮卡牌：路径色调渐变光晕 + 精细层级描边 —— */
.skill-card {
  position: relative;
  width: 254px;
  min-height: 332px;
  padding: 36px 18px 46px;
  border: 1.5px solid color-mix(in srgb, var(--card-accent, #6ec4a6) 34%, rgba(225, 211, 170, 0.18));
  border-radius: 18px;
  color: var(--art-text, #f3ead5);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  background:
    radial-gradient(circle at 50% 18%, color-mix(in srgb, var(--card-accent, #6ec4a6) 17%, transparent) 0%, transparent 58%),
    linear-gradient(180deg, rgba(29, 45, 37, 0.96) 0%, rgba(18, 29, 23, 0.98) 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 14px 32px rgba(0, 0, 0, 0.36);
  transition: transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1), border-color 0.22s ease, box-shadow 0.22s ease, background 0.22s ease;
}

.skill-card.tier-common {
  border-color: color-mix(in srgb, var(--card-accent, #6ec4a6) 24%, rgba(225, 211, 170, 0.16));
  background:
    radial-gradient(circle at 50% 18%, color-mix(in srgb, var(--card-accent, #6ec4a6) 10%, transparent) 0%, transparent 56%),
    linear-gradient(180deg, rgba(26, 40, 33, 0.95) 0%, rgba(17, 27, 22, 0.98) 100%);
}

.skill-card.tier-capstone,
.skill-card.tier-boss,
.skill-card.tier-partner {
  border-color: color-mix(in srgb, var(--card-accent, #f2d27a) 52%, #f2d27a 48%);
  background:
    radial-gradient(circle at 50% 16%, color-mix(in srgb, var(--card-accent, #f2d27a) 22%, transparent) 0%, transparent 60%),
    linear-gradient(180deg, color-mix(in srgb, var(--card-accent, #f2d27a) 8%, #1e2e26) 0%, rgba(18, 29, 23, 0.99) 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 246, 214, 0.14),
    0 0 20px color-mix(in srgb, var(--card-accent, #f2d27a) 18%, transparent),
    0 14px 32px rgba(0, 0, 0, 0.4);
}

.skill-card.is-ricochet-hybrid,
.skill-card.tier-hybrid {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--card-accent, #79dfc8) 54%, var(--card-accent-2, #b4a2ef));
  background:
    radial-gradient(circle at 28% 18%, color-mix(in srgb, var(--card-accent, #79dfc8) 18%, transparent) 0%, transparent 52%),
    radial-gradient(circle at 72% 18%, color-mix(in srgb, var(--card-accent-2, #b4a2ef) 18%, transparent) 0%, transparent 52%),
    linear-gradient(180deg, rgba(29, 45, 37, 0.96) 0%, rgba(18, 29, 23, 0.98) 100%);
}

.skill-card:hover {
  transform: translateY(-9px) scale(1.03);
  border-color: color-mix(in srgb, var(--card-accent, #F59E0B) 72%, #F59E0B 28%);
  box-shadow:
    0 0 24px color-mix(in srgb, var(--card-accent, #fbbf24) 32%, transparent),
    0 18px 36px rgba(0, 0, 0, 0.45);
}

/* 顶部光带覆盖层 */
.skill-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 4px;
  border-radius: 18px 18px 0 0;
  background: linear-gradient(90deg, transparent 8%, color-mix(in srgb, var(--card-accent, #6ec4a6) 68%, #fff 10%) 50%, transparent 92%);
  opacity: 0.72;
  pointer-events: none;
}

.skill-card.is-ricochet-hybrid::before,
.skill-card.tier-hybrid::before {
  background: linear-gradient(90deg, var(--card-accent, #79dfc8) 0%, var(--card-accent-2, #b4a2ef) 100%);
  opacity: 0.82;
}

/* 宝石徽章球底由路径/元素色驱动，彻底避免回退成灰球 */
.skill-card :deep(.skill-glyph) {
  --skill-icon-color: var(--card-accent, #6ec4a6) !important;
  border-color: color-mix(in srgb, var(--card-accent, #6ec4a6) 42%, rgba(255, 255, 255, 0.86));
  box-shadow:
    inset 0 -6px 12px color-mix(in srgb, var(--card-accent, #6ec4a6) 42%, rgba(0, 0, 0, 0.35)),
    0 0 20px color-mix(in srgb, var(--card-accent, #6ec4a6) 38%, transparent);
}

/* 选中态：琥珀金焦点框 + 外发光 + 底部行动提示条 */
.skill-card.is-selected {
  transform: translateY(-10px) scale(1.03);
  border-color: #F59E0B;
  background:
    radial-gradient(circle at 50% 18%, color-mix(in srgb, var(--card-accent, #6ec4a6) 24%, transparent) 0%, transparent 60%),
    linear-gradient(180deg, color-mix(in srgb, var(--card-accent, #6ec4a6) 10%, #1e2e26) 0%, rgba(20, 32, 26, 0.99) 100%);
  box-shadow: 0 0 28px rgba(251, 191, 36, 0.36), 0 18px 36px rgba(0, 0, 0, 0.48);
}

.card-cta {
  position: absolute;
  bottom: 11px;
  left: 50%;
  transform: translateX(-50%) translateY(6px);
  padding: 4px 14px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
  color: #0e1914;
  background: linear-gradient(135deg, color-mix(in srgb, var(--card-accent, #ffd166) 76%, #ffffff 24%), var(--card-accent, #ffd166));
  border: 1px solid rgba(255, 255, 255, 0.48);
  box-shadow: 0 3px 10px color-mix(in srgb, var(--card-accent, #fbbf24) 32%, transparent);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.skill-card.is-selected .card-cta,
.skill-card:hover .card-cta {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

/* 顶部定位胶囊：路径/稀有度区分 */
.role-badge {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  max-width: calc(100% - 28px);
  padding: 4px 13px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #0e1914;
  background: linear-gradient(135deg, color-mix(in srgb, var(--card-accent, #6ec4a6) 74%, #ffffff 26%), var(--card-accent, #6ec4a6));
  border: 1.5px solid rgba(255, 255, 255, 0.72);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--card-accent, #6ec4a6) 34%, transparent);
}

.skill-card.tier-common .role-badge {
  color: color-mix(in srgb, var(--card-accent, #6ec4a6) 72%, #f3ead5);
  background: rgba(16, 28, 22, 0.96);
  border: 1.5px solid color-mix(in srgb, var(--card-accent, #6ec4a6) 44%, transparent);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.32);
}

.skill-card.is-ricochet-hybrid .role-badge,
.skill-card.tier-hybrid .role-badge {
  background: linear-gradient(135deg, var(--card-accent, #79dfc8) 0%, var(--card-accent-2, #b4a2ef) 100%);
}

.skill-lv {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  font-style: normal;
  font-size: 10.5px;
  font-weight: 800;
  color: #f4d684;
  background: rgba(12, 20, 16, 0.8);
  border: 1px solid rgba(244, 214, 132, 0.36);
}
.skill-lv.boss-lv {
  color: #f9a8d4;
  background: rgba(36, 15, 28, 0.85);
  border-color: rgba(244, 114, 182, 0.45);
}

.skill-name {
  font-size: 17.5px;
  font-weight: 800;
  margin-bottom: 8px;
  color: color-mix(in srgb, var(--card-accent, #6ec4a6) 70%, #f7f3e8);
  text-shadow: 0 1px 10px color-mix(in srgb, var(--card-accent, #6ec4a6) 24%, transparent);
}

.skill-desc {
  font-size: 12.5px;
  line-height: 1.6;
  color: #c7d4c3;
  flex-grow: 1;
}

/* 数值提升框：深苔藓路线微透底 + 左侧色条，清晰突出增益 */
.skill-num {
  width: 100%;
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.45;
  text-wrap: balance;
  color: var(--art-text, #f3ead5);
  background: color-mix(in srgb, var(--card-accent, #6ec4a6) 11%, rgba(11, 19, 15, 0.72));
  border: 1px solid color-mix(in srgb, var(--card-accent, #6ec4a6) 30%, transparent);
  box-shadow: inset 3px 0 0 var(--card-accent, #6ec4a6);
}

/* ====================================================
   3. 键盘选中态与按键提示
   选中即发光上浮（与 hover 同套仪式感），角标同步点亮。
==================================================== */
.milestone-card.is-selected {
  transform: translateY(-6px);
  border-color: var(--spec-color);
  background:
    radial-gradient(circle at 50% 14%, color-mix(in srgb, var(--spec-color) 24%, transparent) 0%, transparent 58%),
    linear-gradient(180deg, color-mix(in srgb, var(--spec-color) 10%, #1e2e26) 0%, rgba(21, 34, 27, 0.99) 100%);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--spec-color) 52%, transparent),
    0 0 26px color-mix(in srgb, var(--spec-color) 28%, transparent),
    0 16px 32px rgba(0, 0, 0, 0.45);
}

/* 数字键角标：桌面端统一位于左上角，避免挤压底部 CTA */
.key-hint {
  position: absolute;
  top: 12px;
  left: 12px;
  min-width: 20px;
  padding: 2px 6px;
  border-radius: 7px;
  font-family: inherit;
  font-size: 10.5px;
  font-weight: 800;
  text-align: center;
  color: var(--art-muted, #a9b6a4);
  background: rgba(12, 20, 16, 0.78);
  border: 1px solid rgba(225, 211, 170, 0.22);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  pointer-events: none;
}

.milestone-card .key-hint {
  top: 10px;
  left: 10px;
}

.milestone-card.is-selected .key-hint {
  color: #0e1914;
  background: var(--spec-color);
  border-color: color-mix(in srgb, var(--spec-color) 70%, #ffffff 30%);
  box-shadow: 0 0 12px color-mix(in srgb, var(--spec-color) 45%, transparent);
}

.skill-card.is-selected .key-hint {
  color: #1a1206;
  background: #ffd166;
  border-color: #F59E0B;
  box-shadow: 0 0 12px rgba(251, 191, 36, 0.5);
}

/* 底部操作提示：半透明深苔藓胶囊条 */
.keyboard-hint {
  display: inline-block;
  margin-top: 20px;
  padding: 6px 18px;
  border-radius: 999px;
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--art-muted, #a9b6a4);
  background: rgba(11, 19, 15, 0.68);
  border: 1px solid rgba(225, 211, 170, 0.2);
  backdrop-filter: blur(4px);
}

.milestone-panel .keyboard-hint {
  margin-top: 18px;
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

  .milestone-panel {
    padding: 18px 14px 16px;
  }

  .levelup-title,
  .milestone-title {
    margin: 0 0 10px;
    padding: 8px 16px;
    font-size: 16.5px;
    line-height: 1.35;
    letter-spacing: 0;
  }

  .milestone-title {
    padding: 0;
    font-size: 18px;
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

  /* 里程碑卡在窄屏单列铺开：五系拟态卡内容密集，两列挤压不可读 */
  .milestone-cards {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .milestone-card {
    padding: 14px 12px 12px;
  }

  .milestone-card.is-origin-route {
    min-height: 0;
    padding: 16px 14px 12px;
  }

  .milestone-card.is-origin-route .ms-desc {
    min-height: 0;
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
    height: auto;
    min-height: 158px;
    padding: 40px 12px 12px;
    text-align: left;
    border-width: 1.5px;
  }

  .skill-card .card-cta { display: none; }

  .skill-card:hover {
    transform: none;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 10px 24px rgba(0, 0, 0, 0.32);
  }

  /* 窄屏禁用上浮，选中态保持金框 + 发光标识 */
  .skill-card.is-selected {
    transform: none;
    border-color: #F59E0B;
    box-shadow: 0 0 20px rgba(251, 191, 36, 0.36), 0 8px 20px rgba(0, 0, 0, 0.35);
  }
  .milestone-card.is-selected {
    transform: none;
  }

  .role-badge {
    top: 10px;
    left: 12px;
    transform: none;
    max-width: calc(100% - 96px);
  }

  .skill-lv {
    top: 10px;
    right: 12px;
  }

  .skill-card .key-hint {
    top: auto;
    left: 12px;
    bottom: 10px;
  }

  :deep(.skill-card .skill-glyph) {
    grid-column: 1;
    grid-row: 1 / 5;
    align-self: center;
    justify-self: center;
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
    width: auto;
    margin: 0;
    padding: 5px 9px;
    font-size: 11px;
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
.embedded .levelup-panel { width: 100%; max-width: none; }
.embedded .levelup-title { font-size: 17px; }
.embedded .levelup-cards { gap: 14px; }
.embedded .skill-card { width: auto; flex: 1 1 0; min-width: 0; min-height: 296px; }

/* 常规升级与里程碑统一为深苔藓磨砂风 */
.levelup-panel { margin: auto; padding: 0; border: 0; background: transparent; box-shadow: none; }
.levelup-title { letter-spacing: 0.4px; font-weight: 800; }
.skill-card:focus-visible, .milestone-card:focus-visible { outline: 2px solid var(--art-focus, #a9e8a0); outline-offset: 2px; }
.embedded .levelup-panel { padding: 0; border: 0; background: transparent; box-shadow: none; }
@media (max-width: 560px) {
  .levelup-panel { max-width: calc(100% - 16px); padding: 0; }
}

</style>
