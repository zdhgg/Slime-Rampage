<script setup>
/**
 * HUD 覆盖层：stats/cooldown 快照驱动的纯展示组件（无引擎引用）。
 * 从 App.vue 拆出（前端 P2 瘦身）——App 只保留引擎桥接与模态编排，
 * 本组件持有全部 HUD 派生计算（进度百分比/方向箭头/状态文案）与样式。
 * 数据源约定：stats 由引擎 onStats 以 ~2Hz 整树替换（shallowRef 快照），
 * cooldown 由 onCooldown 以 ~10Hz 推送（连续条平滑数据源）。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import SkillIcon from './SkillIcon.vue'
import { routeIconId } from './skillIconRegistry.js'
import { Check, Pause, Play, Volume2, VolumeX } from 'lucide-vue-next'
import { SPEC_INFO, getSpecInfo } from '../game/SkillPool.js'
import { ORIGIN_ROUTES, ORIGIN_MARKS } from '../game/OriginBuild.js'
import { formatRunClock } from '../game/RunRules.js'
import { DIGEST_EFFECTS } from '../game/ElementSystem.js'

const props = defineProps({
  stats: { type: Object, required: true },
  cooldown: { type: Object, required: true },
  muted: { type: Boolean, default: false },
  paused: { type: Boolean, default: false },
  buttonsVisible: { type: Boolean, default: true },
  toast: { type: String, default: '' },
  toastKind: { type: String, default: 'info' },
  evolution: { type: Object, default: null },
  // arena = 完整战斗 HUD；runner = 仅保留右上角暂停/静音（其余信息由 Runner HUD 提供）
  variant: { type: String, default: 'arena' },
})
const emit = defineEmits(['toggle-mute', 'toggle-pause', 'toggle-resume', 'activate-skill'])
// 触屏设备：底部提示改为摇杆操作说明（真正的摇杆在画布左半屏，由引擎绘制）
const touchControls = ref(false)
let coarsePointerMedia = null
const syncTouchControls = () => { touchControls.value = !!coarsePointerMedia?.matches }
// 键帽跟随主指针，触屏笔记本接入鼠标时仍提示 SPACE。
const touchSkillKey = ref(false)
let coarsePrimaryMedia = null
const syncTouchSkillKey = () => { touchSkillKey.value = !!coarsePrimaryMedia?.matches }
// 构筑栏在窄屏会折行，下面的面板跟随顶部 HUD 的实际高度。
const topHud = ref(null)
const topHudHeight = ref(0)
let topHudObserver = null
let bossPhaseTimer
onMounted(() => {
  coarsePointerMedia = window.matchMedia?.('(any-pointer: coarse)') || null
  syncTouchControls()
  coarsePointerMedia?.addEventListener?.('change', syncTouchControls)
  coarsePrimaryMedia = window.matchMedia?.('(pointer: coarse)') || null
  syncTouchSkillKey()
  coarsePrimaryMedia?.addEventListener?.('change', syncTouchSkillKey)
  if (typeof ResizeObserver !== 'undefined') {
    topHudObserver = new ResizeObserver(([entry]) => {
      topHudHeight.value = Math.ceil(entry.contentRect.height)
    })
    topHudObserver.observe(topHud.value)
  }
})
onUnmounted(() => {
  coarsePointerMedia?.removeEventListener?.('change', syncTouchControls)
  coarsePointerMedia = null
  coarsePrimaryMedia?.removeEventListener?.('change', syncTouchSkillKey)
  coarsePrimaryMedia = null
  topHudObserver?.disconnect()
  clearTimeout(bossPhaseTimer)
})
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
  if (run.mode === 'expedition') {
    if (run.state === 'expedition-intro') return '章节部署'
    // 带时限的章节（如第二章信标）实时显示剩余时间；超时会直接判负。
    if (run.stageDeadline && run.state === 'active' && !props.stats.objective?.chapterTimed) {
      return `第 ${run.stage || 1} / ${run.totalStages || 6} 章 · 剩余 ${formatRunClock(Math.ceil(run.stageRemaining || 0))}`
    }
    return `第 ${run.stage || 1} / ${run.totalStages || 6} 章`
  }
  const multiplier = Number(run.effectiveMultiplier || run.rewardMultiplier || 1).toFixed(2)
  return run.disasterTier > 0
    ? `灾变 ${run.disasterTier} · 收益×${multiplier}`
    : `深入中 · 收益×${multiplier}`
})
/**
 * 章节时限倒计时：优先用 10Hz cooldown 通道（末段逐秒不跳变），stats 2Hz 快照兜底。
 * 仅 runState === 'active' 阶段计时真正流逝，其余状态隐藏避免误读。
 */
const stageRemaining = computed(() => {
  if (props.stats.run?.state !== 'active') return null
  const value = props.cooldown.stageRemaining ?? props.stats.run?.stageRemaining
  return typeof value === 'number' ? Math.max(0, value) : null
})
const deadlineUrgency = computed(() => {
  const remaining = stageRemaining.value
  if (remaining === null) return ''
  if (remaining <= 10) return 'deadline-critical'
  if (remaining <= 30) return 'deadline-danger'
  if (remaining <= 60) return 'deadline-warn'
  return 'deadline-calm'
})
const deadlinePercent = computed(() => {
  const total = props.stats.run?.stageDeadline || 0
  return total > 0 && stageRemaining.value !== null
    ? Math.max(0, Math.min(100, (stageRemaining.value / total) * 100))
    : 0
})
/** 末 10 秒大屏逐秒倒数：:key 驱动每秒重新挂载，重放一次脉冲动画 */
const deadlineSeconds = computed(() => {
  const remaining = stageRemaining.value
  if (remaining === null || remaining <= 0 || remaining > 10) return 0
  return Math.ceil(remaining)
})
const expeditionPercent = computed(() => {
  const objective = props.stats.run?.objective
  if (!objective?.total) return 0
  return Math.max(0, Math.min(100, (objective.progress / objective.total) * 100))
})
const expeditionMetric = computed(() => {
  const objective = props.stats.run?.objective
  if (!objective) return ''
  if (objective.type === 'defend' || objective.type === 'survive') {
    return `剩余 ${formatRunClock(Math.ceil(objective.total - objective.progress))}`
  }
  const label = objective.type === 'elites' ? '精英' : objective.type === 'event' ? '信标' : '击杀'
  return `${label} ${Math.min(Math.floor(objective.progress), objective.total)} / ${objective.total}`
})
const defensePercent = computed(() => {
  const defense = props.stats.run?.objective?.defense
  if (!defense?.maxHp) return 0
  return Math.max(0, Math.min(100, (defense.hp / defense.maxHp) * 100))
})

const expPercent = computed(() =>
  props.stats.maxExp > 0 ? Math.min(100, (props.stats.exp / props.stats.maxExp) * 100) : 0
)
const bossMemberPercent = (member) =>
  member?.maxHp > 0 ? Math.max(0, Math.min(100, (member.hp / member.maxHp) * 100)) : 0
const bossPercent = computed(() => bossMemberPercent(props.stats.boss))
const bossCast = computed(() => {
  const cast = props.cooldown.bossCast
  return cast?.encounter === props.stats.boss?.name ? cast : null
})
const bossPhaseCue = ref('')
watch(() => props.stats.boss, (boss, previousBoss) => {
  if (!boss || boss.name !== previousBoss?.name) {
    clearTimeout(bossPhaseTimer)
    bossPhaseCue.value = ''
    return
  }
  const previousMembers = previousBoss.members
  const changed = boss.members.find(member =>
    previousMembers.some(previous => previous.id === member.id && previous.name === member.name && previous.phase < member.phase)
  )
  if (!changed) return
  bossPhaseCue.value = boss.total > 1
    ? `阶段 ${changed.phase} · ${changed.name}`
    : `进入阶段 ${changed.phase}`
  clearTimeout(bossPhaseTimer)
  bossPhaseTimer = setTimeout(() => { bossPhaseCue.value = '' }, 2200)
})
const objectivePercent = computed(() => {
  const objective = props.stats.objective
  if (!objective?.total) return 0
  return Math.max(0, Math.min(100, (objective.progress / objective.total) * 100))
})
const bountyPercent = computed(() => {
  const bounty = props.stats.run?.bounty
  if (!bounty?.target) return 0
  return Math.max(0, Math.min(100, (bounty.progress / bounty.target) * 100))
})
const formationBreakPercent = computed(() => {
  const max = props.cooldown.formationBreakMax || 0
  return max > 0 ? Math.max(0, Math.min(100, (props.cooldown.formationBreak / max) * 100)) : 0
})

/** 暗影追击在主技能冷却期间也能释放。 */
const shadowFollowup = computed(() => !!props.cooldown.shadow?.followup)
const skillReady = computed(() => props.cooldown.skillReady)
const skillSeconds = computed(() => Math.ceil(props.cooldown.skillCd))
const skillStatus = computed(() => props.cooldown.skillCd > 0
  ? `冷却 ${Math.max(0.1, props.cooldown.skillCd).toFixed(1)} 秒`
  : '就绪')
const skillLabel = computed(() => `${props.cooldown.skillName}，${skillStatus.value}${shadowFollowup.value ? '，影袭追击就绪' : ''}`)
const skillPercent = computed(() => {
  const max = props.cooldown.skillMax || 0
  return max > 0 ? Math.max(0, Math.min(100, (1 - props.cooldown.skillCd / max) * 100)) : 0
})
const hasStrainSkill = computed(() => !!props.cooldown.skillId && (props.cooldown.skillMax || 0) > 0)
// 顶部响应冷却归零，底部响应施放成功；两个脉冲沿用引擎的计时。
const skillReadyFlash = computed(() => (props.cooldown.skillReadyFlash || 0) > 0)
const skillCastPulse = computed(() => (props.cooldown.skillCastPulse || 0) > 0)
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
const requiredEvent = computed(() => {
  const run = props.stats.run
  const mission = run?.objective
  if (run?.state !== 'active' || !mission?.event || mission.events >= (mission.eventTarget || mission.target)) return null
  return mission.event
})
const chapterEventGuide = computed(() => {
  const event = requiredEvent.value
  if (!event) return null
  const beacon = event.type === 'beacon'
  const name = beacon ? '信标' : '黏液池'
  const objective = props.stats.objective
  if (objective?.type !== event.type || objective.state === 'failed') {
    return {
      title: `等待${name}出现`,
      metric: event.retryIn === null ? '' : formatRunClock(Math.ceil(event.retryIn)),
    }
  }
  if (objective.state === 'available') {
    return objective.inside
      ? { title: `正在激活${name}`, hint: '留在圈内即可自动激活', showProgress: true }
      : { title: `前往${name}`, hint: `沿箭头移动，进入${beacon ? '蓝' : '绿'}圈自动激活`, metric: `${objectiveArrow.value} ${objectiveMetric.value}` }
  }
  if (!beacon) {
    return {
      title: '躲避追猎',
      hint: '继续走位，离开绿圈也会推进',
      metric: `剩余 ${formatRunClock(Math.ceil(objective.goal - objective.progress))}`,
      showProgress: true,
    }
  }
  if (objective.state === 'active') {
    const progress = `${objective.progress.toFixed(1)} / ${objective.goal} 秒`
    return {
      title: objective.inside ? '守住信标圈' : '返回信标圈',
      hint: objective.inside ? '在蓝圈内躲避攻击，直到进度填满' : `沿 ${objectiveArrow.value} 返回蓝圈，离圈时进度会回退`,
      metric: progress,
      showProgress: true,
    }
  }
  return null
})
const chapterEventTimer = computed(() => {
  const objective = props.stats.objective
  if (!requiredEvent.value || !objective || objective.chapterTimed) return null
  if (objective.state === 'available') return { label: '激活限时', remaining: objective.timeLeft }
  if (objective.state === 'active' && objective.type === 'beacon') return { label: '封锁限时', remaining: objective.timeLeft }
  return null
})

/** 元素当前等级（stats.elements 为 [{id, lv}]） */
const elementLevel = (id) => props.stats.elements.find((e) => e.id === id)?.lv || 0

/**
 * 元素悬停说明（元素 → 吞噬联动的可读入口）：
 * 附魔效果之外补上该元素的消化档位——玩家不必翻文档就知道
 * 「继续吃同类核心」除了加概率，还会在 Lv.2 / Lv.4 改写吞噬的即时效果。
 */
function elementTitle(id) {
  const base = ELEMENTS.find((e) => e.id === id)
  if (!base) return ''
  const lv = elementLevel(id)
  const digest = DIGEST_EFFECTS[id]
  if (!digest) return `${base.effect} | ${base.combo}`
  // 消化档位挂吞噬触发：只有暴食血统能吞噬，其它角色只标注解锁条件，
  // 不承诺当前可用——避免「文案承诺了却永远触发不了」。
  if (!props.stats.canDevour) return `${base.effect} | ${base.combo} | 吞噬消化：需暴食血统`
  const tier = lv >= 4 ? 'Lv.4 已解锁' : lv >= 2 ? 'Lv.4' : 'Lv.2'
  const detail = lv >= 4 ? digest.lv4 : digest.lv2
  return `${base.effect} | ${base.combo} | 吞噬消化（${tier}）：${detail.name}（当前 ${lv} 级）`
}

/** 消化进度（吞噬 → 元素联动）：吃肉积累，满槽转化元素等级 */
const digestRatio = computed(() => {
  const digest = props.stats.digest
  if (!digest?.max) return 0
  return Math.max(0, Math.min(1, digest.charge / digest.max))
})
const digestTitle = computed(() => {
  const digest = props.stats.digest
  if (!digest) return ''
  if (digestRatio.value >= 1) {
    return props.stats.elements.length
      ? '消化能量已满 · 下次吞噬将转化为一次元素等级提升'
      : '消化能量已满 · 吸收第一颗元素核心时立即兑现为元素等级'
  }
  return `吞噬积累消化能量（${Math.round(digestRatio.value * 100)}%）· 满槽转化元素等级｜已爆发 ${digest.bursts} 次`
})

/** 异源能量按单次超载费用显示，额外能量作为储备。 */
const primalRatio = computed(() => {
  const origin = props.stats.origin || props.stats.primal
  if (!origin?.cost) return 0
  return Math.max(0, Math.min(1, (origin.energy ?? origin.value ?? 0) / origin.cost))
})
const primalReady = computed(() => {
  const origin = props.stats.origin || props.stats.primal
  return !!origin && (origin.energy ?? origin.value) >= origin.cost
})
const primalTitle = computed(() => {
  const origin = props.stats.origin || props.stats.primal
  if (!origin) return ''
  const effect = origin.effect || '路线决定超载主体，印记提供有限回响'
  const value = origin.energy ?? origin.value ?? 0
  return `异源能量 ${value}/${origin.max} · ${primalStatus.value} · ${effect}`
})
const primalStatus = computed(() => {
  const origin = props.stats.origin || props.stats.primal
  if (!origin) return ''
  const value = origin.energy ?? origin.value ?? 0
  const passive = origin.passive
  if (passive?.state === 'windup') return '超载启动'
  if (passive?.state === 'cooldown') return `冷却 ${Math.ceil(passive.cooldown * 10) / 10} 秒`
  if (passive?.state === 'waiting') return '等待目标'
  if (value >= origin.cost) return '充能完成'
  return `${value} / ${origin.cost}`
})
const primalReserve = computed(() => {
  const origin = props.stats.origin || props.stats.primal
  if (!origin?.cost) return 0
  return Math.max(0, (origin.energy ?? origin.value ?? 0) - origin.cost)
})
const originRouteInfo = computed(() => ORIGIN_ROUTES[props.stats.originRoute] || null)
const originMarkInfo = computed(() => ORIGIN_MARKS[props.stats.originMark] || null)
const originFragments = computed(() => props.stats.originFragments || [])
const originMutation = computed(() => props.stats.origin?.mutation || null)
/** 源质记忆：三槽位 + 当前轮换位 + 下一次超载预告（原生黏液独占）。 */
const originMemory = computed(() => props.stats.origin?.memory || null)
const originMemoryChip = (slot) => ({
  id: slot.cardId,
  iconKey: slot.iconKey,
  color: slot.color,
  route: 'memory',
  spec: 'origin',
})
</script>

<template>
  <div
    class="hud"
    :style="[
      { '--hud-top-height': topHudHeight + 'px' },
      stats.spells?.palette && { '--fusion-main': stats.spells.palette.main, '--fusion-accent': stats.spells.palette.accent },
    ]"
    :class="{
      'has-boss': stats.boss,
      'has-shadow': !!cooldown.shadow,
      'has-glutton': !!cooldown.glutton,
      'has-spells': !!stats.spells,
      'has-strain-skill': hasStrainSkill,
      'hud--runner': variant === 'runner',
    }"
  >
    <div class="hud-title">
      史莱姆大暴走<span>SLIME RAMPAGE</span>
    </div>
    <div ref="topHud" class="hud-level">
      <div class="hud-vitals">
        <div class="hud-level-txt">Lv.{{ stats.level }}</div>
        <div class="hud-level-bar">
          <i :style="{ width: expPercent + '%' }"></i>
        </div>
        <div class="hud-hp" role="img" :aria-label="`生命 ${stats.hp} / ${stats.maxHp}`">
          <span v-for="i in stats.maxHp" :key="i" class="hp-dot" :class="{ lost: stats.hp <= i - 1 }"
            :style="{ '--hp-fill': `${Math.max(0, Math.min(1, stats.hp - i + 1)) * 100}%` }"></span>
        </div>
        <div v-if="stats.run?.mode === 'expedition'" class="hud-wave expedition">
          第 {{ stats.run.stage }} 章<i>{{ stats.run.chapterTitle }}</i>
        </div>
        <div v-else class="hud-wave">波次 {{ stats.wave }}<i>{{ stats.waveName }}</i></div>
        <div v-if="stats.director?.encounter" class="hud-crowd-cue" role="status">{{ stats.director.encounter }}</div>
        <div class="hud-run-status" :class="[stats.run?.state, deadlineUrgency]">
          <span>{{ stats.run?.modeName }} · {{ stats.run?.difficultyName }}</span>
          <b>{{ runStatusText }}</b>
        </div>
      </div>
      <div v-if="hasStrainSkill" class="hud-skill-cue" role="status">
        <span
          v-if="!paused && buttonsVisible && stats.run?.state !== 'expedition-intro'"
          class="hud-skill-badge"
          :class="{ ready: skillReady, 'is-ready-flash': skillReady && (skillReadyFlash || shadowFollowup) }"
        >
          <span
            class="hud-skill-dial"
            :style="{ '--skill-progress': skillReady ? '100%' : skillPercent + '%' }"
            aria-hidden="true"
          >
            <Check v-if="skillReady" :size="16" :stroke-width="2.5" />
            <span v-else class="hud-skill-seconds">{{ skillSeconds }}<small>s</small></span>
          </span>
          <strong>{{ shadowFollowup ? '影袭追击' : cooldown.skillName }}</strong>
          <small class="hud-skill-state">{{ skillReady ? '就绪' : '冷却' }}</small>
        </span>
      </div>
      <div class="hud-build">
        <div v-if="stats.ricochet" class="hud-ricochet" :title="stats.ricochet.note">
          <SkillIcon :skill="{ id: routeIconId('gatling', stats.ricochet.route), spec: 'gatling', route: stats.ricochet.route }" size="inline" />
          <span><b>{{ stats.ricochet.name }}</b><small v-if="stats.ricochet.route">投入 {{ stats.ricochet.investment }}/{{ stats.ricochet.investmentTarget ?? 3 }} · {{ stats.ricochet.ultimate ? `终极：${stats.ricochet.ultimateName}` : stats.ricochet.ultimateReady ? '终极已进入随机池' : '终极进度未达标' }}</small><small v-else>入口 {{ stats.ricochet.seeds?.join(' · ') || '尚未抽到' }} · {{ stats.ricochet.normalChoices < (stats.ricochet.choicesTarget ?? 4) ? `还需选卡 ${(stats.ricochet.choicesTarget ?? 4) - stats.ricochet.normalChoices} 次` : stats.ricochet.routeReady ? '下次选卡确认路线' : stats.ricochet.progressReady ? '等待随机入口' : `等待${stats.ricochet.routeGateText || '第 4 波／第 2 章'}` }}</small></span>
        </div>
        <div v-if="stats.glutton?.has && stats.glutton?.route" class="hud-glutton-build" :style="{ '--glutton-color': stats.glutton.color }" :title="stats.glutton.note">
          <SkillIcon :skill="{ id: routeIconId('gluttony', stats.glutton.route), spec: 'gluttony', route: stats.glutton.route }" size="inline" />
          <span><b>{{ stats.glutton.name }}</b><small>{{ stats.glutton.investment }}/4 · {{ stats.glutton.ultimate ? `终极：${stats.glutton.ultimateName}` : stats.glutton.ultimateReady ? '终极已进入随机池' : '终极进度未达标' }}</small></span>
        </div>
        <div v-if="stats.symbiosis" class="hud-symbiosis-build" :style="{ '--symbiosis-color': stats.symbiosis.color }" :title="stats.symbiosis.note">
          <SkillIcon :skill="{ id: routeIconId('symbiosis', stats.symbiosis.route), spec: 'symbiosis', route: stats.symbiosis.route }" size="inline" />
          <span><b>{{ stats.symbiosis.name }}</b><small v-if="stats.symbiosis.route">投入 {{ stats.symbiosis.investment }}/4 · {{ stats.symbiosis.ultimate ? `终极：${stats.symbiosis.ultimateName}` : stats.symbiosis.ultimateReady ? '终极已进入随机池' : '终极进度未达标' }}</small><small v-else>随机组队 · {{ stats.symbiosis.normalChoices < 5 ? `还需选卡 ${5 - stats.symbiosis.normalChoices} 次` : stats.symbiosis.routeReady ? '下次选卡确认路线' : '等待第 6 波／第 3 章' }}</small></span>
        </div>
        <div v-if="stats.shadow" class="hud-shadow-build" :style="{ '--shadow-color': stats.shadow.routeColor || '#bdacd0' }" :title="stats.shadow.route ? `${stats.shadow.routeName} · ${stats.shadow.routeInvestment}/4 · ${stats.shadow.ultimateName || '互斥终极未获得'}` : '暗影路线探索与锁定进度'">
          <SkillIcon :skill="{ id: routeIconId('assassin', stats.shadow.route), spec: 'assassin', route: stats.shadow.route }" size="inline" />
          <span>
            <b>{{ stats.shadow.route ? stats.shadow.routeName : '暗影路线探索' }}</b>
            <small v-if="stats.shadow.route">投入 {{ stats.shadow.routeInvestment }}/4 · {{ stats.shadow.ultimate ? `终极：${stats.shadow.ultimateName}` : stats.shadow.ultimateReady ? '终极已进入随机池' : '终极未达门槛' }}{{ stats.shadow.marked ? ' · 猎物已标记' : '' }}{{ stats.shadow.followup ? ' · 免费追击就绪' : '' }}</small>
            <small v-else>入口 {{ stats.shadow.entryCount }}/3 · {{ stats.shadow.normalChoices < 5 ? `还需选卡 ${5 - stats.shadow.normalChoices} 次` : stats.shadow.routeReady ? '下次选卡确认路线' : '等待第 6 波／第 3 章' }}</small>
          </span>
        </div>
        <div v-if="stats.spells" class="hud-spell-build" :title="`当前配色：${stats.spells.palette?.name || '基础元素'}`">
          <div v-if="stats.spells.route" class="hud-element-route" :style="{ '--element-route-color': stats.spells.routeColor }">
            <b><SkillIcon :skill="{ id: routeIconId('elemental', stats.spells.route), spec: 'elemental', route: stats.spells.route }" size="inline" /> {{ stats.spells.routeName }}</b><small>投入 {{ stats.spells.routeInvestment }}/4 · {{ stats.spells.routeUltimate ? `终极：${stats.spells.activeName}` : stats.spells.routeInvestment >= 4 ? '终极等待战局门槛与随机出现' : '路线进阶继续成长' }}</small>
          </div>
          <div v-else class="hud-element-route exploring"><b>{{ stats.spells.buildMode === 'cycle' ? '万象轮转探索中' : stats.spells.buildMode === 'fusion' ? '双系融合探索中' : '单系极化探索中' }}</b><small>{{ stats.spells.normalChoices < 5 ? `还需选卡 ${5 - stats.spells.normalChoices} 次` : '等待第 6 波／第 3 章确认路线' }}</small></div>
          <div class="hud-spell-slots">
            <span v-for="el in stats.spells.elements" :key="el.id" :style="{ '--spell-color': el.color }" :title="`${el.desc} 自动施法间隔 ${el.interval.toFixed(2)} 秒 · ${el.enhancements || '基础法术'} · 核心改造 ${el.rank}/3`"><SkillIcon :skill="{ id: el.id, spec: 'elemental', element: el.id }" size="inline" /><b>{{ el.spell }}</b><small v-if="el.enhancements">{{ el.enhancements }}</small><small v-else-if="el.rank">改造 {{ el.rank }}</small></span>
            <span v-if="stats.spells.elements.length === 0" class="spell-slot-empty">◇<b>原质飞弹</b><small>Lv.2 发现首系</small></span>
            <span v-if="stats.spells.route === 'cycle' && stats.spells.elements.length < 3" class="spell-slot-empty">◇<small>继续发现第三系</small></span>
          </div>
          <p v-if="stats.spells.fusion" :title="stats.spells.fusion.desc"><b>{{ stats.spells.fusion.name }}</b><span>核心 {{ stats.spells.cores }} · {{ stats.spells.activeRank >= 3 ? '融合术已进化' : '融合反应持续成长' }}</span></p>
          <p v-else><span>{{ stats.spells.buildMode === 'cycle' ? '多系法术按顺序轮转施放' : '基础法术自动施放 · 空格原质释放' }}</span></p>

        </div>
        <!-- 元素指示：点亮已吸收的元素并显示等级（评审 Day 2：💧2 ⚡3）
             第三批角色化：暴食/弹射/暗影不使用元素，整组圆点隐藏（灰显占位会误导） -->
        <div v-if="stats.canUseElements && !stats.spells" class="hud-elements">
          <span
            v-for="el in ELEMENTS"
            :key="el.id"
            class="el-dot"
            :class="[el.id, { active: elementLevel(el.id) > 0 }]"
            :title="elementTitle(el.id)"
          >
            <SkillIcon :skill="{ id: el.id, spec: 'elemental', element: el.id }" size="inline" /><i v-if="elementLevel(el.id) > 0" class="el-lv">{{ elementLevel(el.id) }}</i>
          </span>
        </div>
        <!-- 激活反应徽章（阶段十五）：主形态 ★ 标识，副反应并列，悬停看效果 -->
        <div v-if="stats.reactions.length && !stats.spells" class="hud-reactions">
          <span class="reaction-meta">
            副反应 {{ stats.secondaryCount }}
          </span>
          <span
            v-for="r in stats.reactions"
            :key="r.id"
            class="reaction-chip"
            :class="{ primary: r.id === stats.primaryReaction }"
            :title="r.id === stats.primaryReaction ? '主反应（物种身份，由元素等级前两名决定）｜' + r.desc : '副反应（第 3 位元素的组合，叠加生效）｜' + r.desc"
          >
            <i v-if="r.id === stats.primaryReaction" class="chip-star">★</i>{{ r.name }}
          </span>
        </div>
        <div
          v-if="stats.coreResonance && stats.strainId !== 'origin' && !stats.spells"
          class="hud-core-resonance"
          :style="{ '--resonance-color': stats.coreResonance.color }"
          :title="`${stats.coreResonance.name}：${stats.coreResonance.effect} · 两种元素等级 ${stats.coreResonance.levels.join(' / ')}`"
        >
          <span>晶核共鸣</span>
          <b>{{ stats.coreResonance.icons.join('＋') }}</b>
          <small>{{ stats.coreResonance.effect }} · Lv.{{ stats.coreResonance.strength }}</small>
        </div>
        <!-- 消化进度（吞噬 → 元素联动）：吃下去的血肉正在变成元素养分 -->
        <div
          v-if="digestRatio > 0 && !stats.spells"
          class="hud-digest"
          :class="{ ready: digestRatio >= 1 }"
          :title="digestTitle"
        >
          <span>🧬 消化</span>
          <i><em :style="{ width: Math.round(Math.min(1, digestRatio) * 100) + '%' }"></em></i>
          <b v-if="digestRatio >= 1">{{ stats.elements.length ? '爆发就绪' : '待吸收元素' }}</b>
          <b v-else>{{ Math.round(digestRatio * 100) }}%</b>
        </div>
        <!-- 异源能量：按一次超载费用显示，额外能量单独显示 -->
        <div
          v-if="stats.strainId === 'origin'"
          class="hud-primal"
          :class="{ ready: primalReady, full: (stats.origin?.energy ?? stats.primal?.value ?? 0) >= (stats.origin?.max ?? stats.primal?.max ?? 100) }"
          :title="primalTitle"
        >
          <span>🫧 超载<span v-if="primalReserve"> +{{ primalReserve }}</span></span>
          <i><em :style="{ width: Math.round(primalRatio * 100) + '%' }"></em></i>
          <b>{{ primalStatus }}</b>
        </div>
        <div v-if="stats.strainId === 'origin' && stats.origin?.combo?.inject?.primary" class="hud-specs">
          <span class="spec-chip secondary" title="主技能注入第 1 位元素、协同注入第 2 位、第三技能注入第 3 位；同一目标集齐组合元素即触发连招">
            {{ ELEMENTS.find(item => item.id === stats.origin.combo.inject.primary)?.icon }} 超载注入
            <template v-if="stats.origin.combo.reactionName"> · {{ stats.origin.combo.reactionName }}</template>
          </span>
        </div>
        <div v-if="stats.strainId === 'origin' && stats.origin?.combo?.tripleUnlocked" class="hud-specs">
          <span class="spec-chip secondary" title="每第三次成功超载追加一项不同协同技能">
            ✨ 三重超载 {{ stats.origin.combo.tripleCount }}/3
          </span>
        </div>
        <!-- 原生路线/印记/碎片：不显示职业主副专精，只显示液态变异方向 -->
        <div v-if="stats.strainId === 'origin' && (originRouteInfo || originMarkInfo || originFragments.length)" class="hud-specs">
          <span v-if="originRouteInfo" class="spec-chip primary" :title="originRouteInfo.desc" :style="{ '--spec-color': originRouteInfo.color }">
            <SkillIcon :skill="`spec_origin_route_${originRouteInfo.id}`" size="inline" /> {{ originRouteInfo.name }}
          </span>
          <span v-for="frag in originFragments" :key="frag.id" class="spec-chip secondary" :title="frag.title" :style="{ '--spec-color': frag.color }">
            <SkillIcon :skill="frag.skillId" size="inline" /> {{ frag.name }}
          </span>
          <span v-if="originMarkInfo" class="spec-chip secondary" :title="originMarkInfo.desc" :style="{ '--spec-color': originMarkInfo.color }">
            <SkillIcon :skill="`spec_origin_mark_${originMarkInfo.id}`" size="inline" /> {{ originMarkInfo.name }}
          </span>
          <span v-if="originMutation && originMutation.max > 0 && originMutation.stacks > 0" class="spec-chip secondary" :title="`同化层数 ${originMutation.stacks}/${originMutation.max}`">
            🧬 {{ originMutation.stacks }}/{{ originMutation.max }}
          </span>
          <span v-if="stats.origin?.circuits > 0" class="spec-chip secondary" :title="`共振回路 ${stats.origin.circuits}/3`">
            ⚡ {{ stats.origin.circuits }}/3
          </span>
        </div>
        <!-- 源质记忆（原生黏液独占）：吸收的 BOSS 源质技能 + 下一次超载释放预告 -->
        <div
          v-if="stats.strainId === 'origin' && originMemory"
          class="hud-memory"
          :class="{ empty: !originMemory.known }"
          aria-label="源质记忆"
        >
          <template v-if="originMemory.known">
            <span class="memory-label">源质记忆</span>
            <span
              v-for="slot in originMemory.slots"
              :key="slot.id"
              class="memory-slot"
              :class="{
                next: slot.next,
                casting: (originMemory.lastId === slot.id && originMemory.lastAge < 1.4) || (originMemory.auxiliaryId === slot.id && originMemory.auxiliaryAge < 1.4),
              }"
              :style="{ '--memory-color': slot.color }"
              :title="`${slot.name} Lv.${slot.level}/${originMemory.maxLevel} · ${slot.next ? '主技能' : stats.origin?.combo?.equipped?.includes(slot.id) ? '协同候选' : '未装备'}`"
            >
              <SkillIcon :skill="originMemoryChip(slot)" size="inline" />
              <b>{{ slot.name }}</b>
              <em>Lv.{{ slot.level }}</em>
            </span>
            <span class="memory-next" :title="`超载后自动释放：${originMemory.nextName}`">
              主技能：<b>{{ originMemory.nextName }}</b> · 协同随机
            </span>
          </template>
          <span v-else class="memory-empty">🫧 主技能：{{ originMemory.nextName }} · {{ stats.origin?.combo?.equipped?.length >= 2 ? '协同随机' : '升级发现协同能力' }}</span>
        </div>
        <!-- 流派专精指示（专职角色） -->
        <div v-if="!stats.ricochet && stats.strainId !== 'origin' && (stats.primarySpec || stats.secondarySpec)" class="hud-specs">
          <span v-if="stats.primarySpec" class="spec-chip primary" :title="'主专精：' + getSpecInfo(stats.primarySpec, stats)?.desc">
            <SkillIcon :skill="`spec_${stats.primarySpec}`" size="inline" /> 主: {{ getSpecInfo(stats.primarySpec, stats)?.name }}
          </span>
          <span v-if="stats.secondarySpec" class="spec-chip secondary" :title="'副专精：' + SPEC_INFO[stats.secondarySpec]?.desc">
            <SkillIcon :skill="`spec_${stats.secondarySpec}`" size="inline" /> 副: {{ SPEC_INFO[stats.secondarySpec]?.name }}
          </span>
        </div>
    <div v-if="stats.bossTomes?.length" class="hud-tomes" aria-label="已学BOSS秘典">
      <span v-for="tome in stats.bossTomes" :key="tome.id" :title="`${tome.name} Lv.${tome.level}/3 · ${tome.desc} · ${tome.stats}`"><SkillIcon :skill="tome" size="inline" />{{ tome.name }} <b>{{ tome.level }}/3</b></span>
      <span v-if="cooldown.tomeShield > 0">秘典护盾 {{ cooldown.tomeShield }}</span>
    </div>

      </div>
    </div>
    <div
      v-if="stats.run?.mode === 'expedition' && stats.run.state === 'active' && !stats.boss"
      class="expedition-hud"
    >
      <div class="expedition-head">
        <span>第 {{ stats.run.stage }} 章 · {{ stats.run.region }}</span>
        <b v-if="!chapterEventGuide && stats.run.objective?.type !== 'mixed'">{{ expeditionMetric }}</b>
      </div>
      <div v-if="stats.run.objective?.type === 'mixed'" class="expedition-counts">
        <span>击杀 <b>{{ Math.min(stats.run.objective.kills, stats.run.objective.target) }} / {{ stats.run.objective.target }}</b></span>
        <span>{{ stats.run.objective.event?.title }} <b>{{ Math.min(stats.run.objective.events, stats.run.objective.eventTarget) }} / {{ stats.run.objective.eventTarget }}</b></span>
      </div>
      <div v-if="deadlineUrgency" class="expedition-deadline" :class="deadlineUrgency">
        <span>章节时限</span>
        <i><em :style="{ width: deadlinePercent + '%' }"></em></i>
        <b>{{ formatRunClock(Math.ceil(stageRemaining)) }}</b>
      </div>
      <template v-if="chapterEventGuide">
        <div v-if="chapterEventTimer" class="chapter-event-timer">
          <span>{{ chapterEventTimer.label }}</span><b>{{ formatRunClock(Math.ceil(chapterEventTimer.remaining)) }}</b>
        </div>
        <div class="chapter-event-title">
          <strong>{{ chapterEventGuide.title }}</strong>
          <b v-if="chapterEventGuide.metric">{{ chapterEventGuide.metric }}</b>
        </div>
        <p v-if="chapterEventGuide.hint" class="chapter-event-hint">{{ chapterEventGuide.hint }}</p>
        <div v-if="chapterEventGuide.showProgress" class="expedition-track chapter-event-track" :style="{ '--event-progress': stats.objective?.color }"><em :style="{ width: objectivePercent + '%' }"></em></div>
      </template>
      <template v-else>
        <strong>{{ stats.run.objective?.title }}</strong>
        <i v-if="stats.run.objective?.type === 'defend'">靠近或命中带标记的敌人，将它们引开</i>
        <i v-else-if="stats.run.objective?.type === 'elites'">击杀带金色光环的精英</i>
        <div class="expedition-track"><em :style="{ width: expeditionPercent + '%' }"></em></div>
      </template>
      <div v-if="stats.run.objective?.type === 'defend'" class="nest-defense">
        <span>巢心耐久</span>
        <i><em :style="{ width: defensePercent + '%' }"></em></i>
        <b>{{ Math.ceil(stats.run.objective.defense?.hp || 0) }} / {{ stats.run.objective.defense?.maxHp || 0 }}</b>
      </div>
    </div>
    <div class="hud-hint">
      <template v-if="touchControls">左侧拖动移动</template><template v-else>WASD / 方向键或点按地面移动</template><template v-if="stats.spells"> · 法术自动施放</template><template v-else-if="stats.canUseElements"> · 元素核心靠近后自动吸收</template><template v-if="hasStrainSkill"> · {{ touchSkillKey ? '点按' : '空格' }} {{ cooldown.skillName }}<template v-if="cooldown.skillName === '影袭'">（沿移动方向）</template><template v-else-if="cooldown.skillName === '深渊吸噬'">（聚怪重咬）</template></template> · Esc 暂停
    </div>
    <div class="hud-bottom-right">
      <dl class="hud-stats" aria-label="战斗数据">
        <div><dt>攻击</dt><dd>{{ stats.dmg }}</dd></div>
        <div><dt>击杀</dt><dd>{{ stats.kills }}</dd></div>
        <div><dt>分数</dt><dd>{{ (stats.score || 0).toLocaleString('en-US') }}</dd></div>
        <div v-if="stats.canDevour">
          <dt>吞噬线</dt>
          <dd title="普通怪 / 精英怪的投降血线">{{ Math.max(8, Math.round((stats.devourThreshold - stats.strainDevourBonus - 0.13) * 100)) }}/{{
            Math.round((stats.devourThreshold + stats.strainDevourBonus + 0.13) * 100)
          }}%</dd>
        </div>
      </dl>
      <div
        v-if="hasStrainSkill"
        class="hud-action hud-action--skill"
        :class="{ ready: skillReady, 'is-cast-pulse': skillCastPulse }"
        :aria-label="skillLabel"
        :title="cooldown.skillDesc"
        role="button"
        tabindex="0"
        @click="emit('activate-skill')"
        @keydown.enter.prevent="emit('activate-skill')"
        @keydown.space.prevent="!$event.repeat && emit('activate-skill')"
      >
        <b class="hud-action-name"><SkillIcon :skill="cooldown.skillId" size="inline" />{{ cooldown.skillName }}</b>
        <span class="hud-action-key">{{ touchSkillKey ? '点按' : 'SPACE' }}</span>
      </div>
    </div>
    <div v-if="cooldown.formationBreak > 0" class="formation-break-hud">
      <div>
        <span>破阵追击</span>
        <b>{{ cooldown.formationBreak.toFixed(1) }}s</b>
      </div>
      <i><em :style="{ width: formationBreakPercent + '%' }"></em></i>
      <small>攻速 +25% · 移速 +15%</small>
    </div>
    <div v-if="cooldown.pets?.length" class="pet-status" :class="{ squad: cooldown.pets.length > 2 }" aria-label="共生伙伴状态">
      <div v-if="cooldown.petRally" class="pet-status__boost" :title="`伙伴攻击力 +${Math.round(cooldown.petRally.damage * 100)}% · 攻速 +${Math.round(cooldown.petRally.haste * 100)}% · 移速 +${Math.round(cooldown.petRally.move * 100)}%`">
        <span>共生鼓舞</span><b>{{ cooldown.petRally.remaining.toFixed(1) }}s</b>
        <i><em :style="{ width: (cooldown.petRally.remaining / cooldown.petRally.duration) * 100 + '%' }"></em></i>
      </div>
      <div v-for="pet in cooldown.pets" :key="pet.id" class="pet-status__row" :class="[pet.id, { resting: pet.down > 0, boosted: pet.boosted }]">
        <span class="pet-status__crest" aria-hidden="true"></span>
        <div class="pet-status__body" :title="pet.state">
          <div class="pet-status__meta">
            <span>{{ pet.name }}</span>
            <small>{{ pet.role }}</small>
            <b>{{ pet.down > 0 ? Math.ceil(pet.down) + 's 恢复' : pet.hp + '/' + pet.maxHp }}</b>
          </div>
          <i class="pet-status__track"><em :style="{ width: (pet.hp / pet.maxHp) * 100 + '%' }"></em></i>
          <div class="pet-status__support" :title="pet.supportDesc" :class="{ active: pet.down <= 0 && (pet.supporting || pet.supportActive > 0) }">
            <span>{{ pet.supportName }}</span>
            <b>{{ pet.down > 0 ? '暂歇' : pet.supporting ? '施放中' : pet.supportActive > 0 && (pet.id === 'guardian' || pet.id === 'spore' || pet.id === 'hunter') ? pet.supportActive.toFixed(1) + 's' : pet.supportCd > 0 ? Math.ceil(pet.supportCd) + 's' : '就绪' }}</b>
          </div>
        </div>
      </div>
    </div>
    <div v-if="cooldown.shadow" class="shadow-status" :title="`暴击率 ${Math.round(cooldown.shadow.crit * 100)}%（暴伤 ${Number((cooldown.shadow.critMul || 3).toFixed(2))}x）· 暴击生影 ${Math.round(cooldown.shadow.chance * 100)}% · 分身攻击 ${Math.round(cooldown.shadow.power * 100)}% · 持续 ${cooldown.shadow.duration} 秒（可挡普通弹并就近分流近战）· 影刃格挡（物理未闪避 −1 伤并震退近敌，7 秒重聚，三连波/影袭命中 −1.2s）：${cooldown.shadow.guard?.charges > 0 ? '就绪' : `${(cooldown.shadow.guard?.remaining || 0).toFixed(1)}s`} · 影织魔盾仅挡法术，充能 ×${Number((cooldown.shadow.shield?.haste || 1).toFixed(2))} · 替身移影${cooldown.shadow.substituteCd > 0 ? `冷却 ${cooldown.shadow.substituteCd.toFixed(1)}s` : cooldown.shadow.substituteReady ? '待命（致命换位保命）' : '需场上存在分身'} · 影魄满 ${cooldown.shadow.soul?.threshold || 16} 点受伤回 1 血（冷却 ${cooldown.shadow.soul?.healCooldown || 12} 秒，首领交锋点数 ×2），满血反哺魔盾或涌动`">
      <span>闪避 <b>{{ Math.round(cooldown.shadow.evasion * 100) }}%</b></span>
      <span>分身 <b>{{ cooldown.shadow.count }}/{{ cooldown.shadow.cap }}</b></span>
      <span>暴击 <b>{{ Math.round(cooldown.shadow.crit * 100) }}%</b></span>
      <span v-if="cooldown.shadow.guard">格挡 <b>{{ cooldown.shadow.guard.charges > 0 ? `${cooldown.shadow.guard.charges}/${cooldown.shadow.guard.capacity}` : `${cooldown.shadow.guard.remaining.toFixed(1)}s` }}</b></span>
      <span v-if="cooldown.shadow.shield">魔盾 <b>{{ cooldown.shadow.shield.charges }}/{{ cooldown.shadow.shield.capacity }}</b></span>
      <span v-if="cooldown.shadow.soul" class="shadow-soul-stat">影魄 <b>{{ cooldown.shadow.soul.points }}/{{ cooldown.shadow.soul.threshold }}</b></span>
      <span>替身 <b>{{ cooldown.shadow.substituteCd > 0 ? `${Math.ceil(cooldown.shadow.substituteCd)}s` : cooldown.shadow.substituteReady ? '待命' : '无影' }}</b></span>
      <small v-if="cooldown.shadow.shield && cooldown.shadow.shield.charges < cooldown.shadow.shield.capacity">
        充能 {{ cooldown.shadow.shield.remaining.toFixed(1) }}s · {{ cooldown.shadow.soul?.healCd > 0 ? `回血 ${cooldown.shadow.soul.healCd.toFixed(1)}s` : cooldown.shadow.assaultBuff?.timer > 0 ? `影遁 ${cooldown.shadow.assaultBuff.timer.toFixed(1)}s` : cooldown.shadow.counterReady ? '反制必暴就绪' : `生影 ${Math.round(cooldown.shadow.chance * 100)}%` }}
      </small>
      <small v-else>
        {{ cooldown.shadow.assaultBuff?.timer > 0 ? `影遁 ${cooldown.shadow.assaultBuff.timer.toFixed(1)}s` : cooldown.shadow.counterReady ? '噬法反制必暴' : cooldown.shadow.soul?.surge > 0 ? `影魄涌动 ${cooldown.shadow.soul.surge.toFixed(1)}s` : `生影 ${Math.round(cooldown.shadow.chance * 100)}%` }} · {{ cooldown.shadow.soul?.healCd > 0 ? `回血 ${cooldown.shadow.soul.healCd.toFixed(1)}s` : '影魄就绪' }}
      </small>
      <div v-if="cooldown.shadow.shield && cooldown.shadow.shield.charges < cooldown.shadow.shield.capacity" class="shadow-shield-bar">
        <em :style="{ width: `${Math.round(cooldown.shadow.shield.progress * 100)}%` }"></em>
      </div>
      <div v-if="cooldown.shadow.soul" class="shadow-soul-bar">
        <em :style="{ width: `${Math.round(cooldown.shadow.soul.progress * 100)}%` }"></em>
      </div>
    </div>
    <div
      v-if="cooldown.glutton"
      class="glutton-status"
      :title="`胃铠 ${cooldown.glutton.guard}/${cooldown.glutton.guardMax} · 饱食 ${cooldown.glutton.satiety}/${cooldown.glutton.satietyMax}（满槽释放饱食酸浪）· 腐蚀光环半径 ${cooldown.glutton.auraRadius}px · 反伤冷却 ${cooldown.glutton.counterCd > 0 ? cooldown.glutton.counterCd.toFixed(1) + 's' : '就绪'}`"
    >
      <span>胃铠 <b>{{ cooldown.glutton.guard }}/{{ cooldown.glutton.guardMax }}</b></span>
      <span>饱食 <b>{{ stats.boss ? `${cooldown.glutton.bossProgress}/${cooldown.glutton.bossProgressPer}` : `${cooldown.glutton.satiety}/${cooldown.glutton.satietyMax}` }}</b></span>
      <i class="glutton-status__track"><em :style="{ width: Math.min(100, Math.round(((stats.boss ? cooldown.glutton.bossProgress / Math.max(1, cooldown.glutton.bossProgressPer) : cooldown.glutton.satiety / Math.max(1, cooldown.glutton.satietyMax))) * 100)) + '%' }"></em></i>
      <small>光环 {{ cooldown.glutton.auraRadius }}px · 反伤 {{ cooldown.glutton.counterCd > 0 ? cooldown.glutton.counterCd.toFixed(1) + 's' : '就绪' }}</small>
    </div>
<div v-if="cooldown.spellShield" class="spell-shield-status" :class="{ broken: cooldown.spellShield.points <= 0 }" :title="`法术护盾吸收敌人攻击，破盾后 ${cooldown.spellShield.cooldown} 秒自动重建`" aria-label="法术护盾状态">
            <span><SkillIcon skill="spell_shield" size="inline" /> 法术护盾</span><b>{{ Number(cooldown.spellShield.points.toFixed(1)) }}/{{ cooldown.spellShield.capacity }}</b>
            <small>{{ cooldown.spellShield.points > 0 ? '保护中' : `重建 ${Math.ceil(cooldown.spellShield.remaining)} 秒` }}</small>
            <i v-if="cooldown.spellShield.points <= 0"><em :style="{ width: `${100 * (1 - cooldown.spellShield.remaining / cooldown.spellShield.cooldown)}%` }"></em></i>
          </div>
    <div v-if="stats.boss || stats.run?.bounty || (stats.objective && !chapterEventGuide)" class="hud-side-panels">
      <div v-if="stats.boss || stats.run?.bounty" class="hud-left-panels">
        <section
          v-if="stats.boss"
          class="boss-hud"
          aria-label="首领"
          :class="{ enraged: stats.boss.enraged, vulnerable: stats.boss.vulnerable }"
        >
          <div class="boss-meta">
            <b>{{ stats.boss.name }}</b>
            <span v-if="bossPhaseCue" class="boss-phase-cue" role="status">{{ bossPhaseCue }}</span>
            <span v-else-if="stats.boss.vulnerable" class="boss-vulnerability">破绽</span>
          </div>
          <div
            class="boss-track"
            role="progressbar"
            :aria-label="stats.boss.name + '生命'"
            :aria-valuenow="Math.round(bossPercent)"
            :aria-valuetext="Math.ceil(stats.boss.hp) + ' / ' + stats.boss.maxHp"
          >
            <em :style="{ width: bossPercent + '%' }"></em>
          </div>
          <div v-if="bossCast" class="boss-telegraph">
            <span class="boss-cast-name">{{ bossCast.skill }}<template v-if="bossCast.caster"> · {{ bossCast.caster }}</template></span>
            <div class="boss-cast-track"><em :style="{ width: Math.round(cooldown.cast * 100) + '%' }"></em></div>
          </div>
          <div v-if="stats.boss.total > 1" class="boss-members">
            <div
              v-for="member in stats.boss.members"
              :key="member.id"
              :class="{ casting: member.casting, enraged: member.enraged, protected: member.protected }"
            >
              <span>{{ member.name }}</span>
              <i role="progressbar" :aria-label="member.name + '生命'" :aria-valuenow="Math.round(bossMemberPercent(member))"><em :style="{ width: bossMemberPercent(member) + '%' }"></em></i>
            </div>
            <small v-if="stats.boss.pending > 0">增援待命 ×{{ stats.boss.pending }}</small>
          </div>
          <div
            v-if="stats.boss.formation"
            class="boss-formation"
            :class="[stats.boss.formation.id, { broken: stats.boss.formation.broken }]"
          >
            <span><i>{{ stats.boss.formation.mark }}</i>{{ stats.boss.formation.name }}</span>
            <b>{{ stats.boss.formation.status }}</b>
          </div>
        </section>
        <div v-if="stats.run?.bounty" class="endless-bounty-hud">
          <div class="bounty-kicker">
            <span>深层悬赏 · {{ stats.run.bounty.mark }}</span>
            <i>{{ Math.ceil(stats.run.bounty.timeLeft) }}s</i>
          </div>
          <div class="bounty-title">
            <b>{{ stats.run.bounty.name }}</b>
            <em>{{ stats.run.bounty.progress }} / {{ stats.run.bounty.target }}</em>
          </div>
          <div class="bounty-track"><i :style="{ width: bountyPercent + '%' }"></i></div>
          <div class="bounty-reward">奖励 · {{ stats.run.bounty.reward }}</div>
        </div>
      </div>
      <div
        v-if="stats.objective && !chapterEventGuide"
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
        <VolumeX v-if="muted" :size="18" aria-hidden="true" />
        <Volume2 v-else :size="18" aria-hidden="true" />
      </button>
      <button
        class="hud-pause"
        @click="paused ? emit('toggle-resume') : emit('toggle-pause')"
        :title="paused ? '继续游戏' : '暂停'"
        :aria-label="paused ? '继续游戏' : '暂停'"
      >
        <Play v-if="paused" :size="18" aria-hidden="true" />
        <Pause v-else :size="18" aria-hidden="true" />
      </button>
    </div>

    <div v-if="stats.run?.state === 'expedition-intro'" class="chapter-intro" aria-live="polite">
      <div class="chapter-intro-scrim"></div>
      <section>
        <span>王庭逆袭 · 第 {{ stats.run.stage }} / {{ stats.run.totalStages }} 章</span>
        <i aria-hidden="true"></i>
        <h2>{{ stats.run.chapterTitle }}</h2>
        <p>{{ stats.run.region }} · {{ stats.run.chapterBrief }}</p>
        <p v-if="stats.run.stageDeadline" class="chapter-deadline">限时 {{ formatRunClock(stats.run.stageDeadline) }} · 超时任务失败</p>
      </section>
    </div>

    <!-- 元素组合激活提示 -->
    <div v-if="toast" class="combo-toast" :class="toastKind">{{ toast }}</div>

    <!-- 章节时限末 10 秒：大屏逐秒倒数（:key 每秒重挂载 → 脉冲动画重放） -->
    <div v-if="deadlineSeconds" :key="deadlineSeconds" class="deadline-countdown">{{ deadlineSeconds }}</div>

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
.hud-crowd-cue { margin-top: 5px; color: #c1e7cc; font-size: 12px; font-weight: 600; letter-spacing: .04em; }
.hud-ricochet { display:flex; align-items:center; gap:8px; padding:6px 12px; border:1px solid rgba(121,217,238,.3); border-radius:10px; background:rgba(7,17,26,.8); text-align:left; }
.hud-ricochet b { display:block; font-size:12px; color:#cceff7; }
.hud-ricochet small { display:block; margin-top:2px; font-size:10px; color:rgba(234,247,255,.65); }
.hud-glutton-build { display:flex; align-items:center; gap:8px; padding:6px 12px; border:1px solid color-mix(in srgb,var(--glutton-color) 42%,transparent); border-radius:10px; background:rgba(28,13,8,.82); text-align:left; }
.hud-glutton-build b { display:block; font-size:12px; color:#ffe3ad; }
.hud-glutton-build small { display:block; margin-top:2px; font-size:10px; color:rgba(255,244,229,.65); }
.hud-symbiosis-build { display:flex; align-items:center; gap:8px; padding:6px 12px; border:1px solid color-mix(in srgb,var(--symbiosis-color) 42%,transparent); border-radius:10px; background:rgba(13,18,17,.84); text-align:left; }
.hud-symbiosis-build b { display:block; font-size:12px; color:#e9f6e7; }
.hud-symbiosis-build small { display:block; margin-top:2px; font-size:10px; color:rgba(238,250,239,.66); }
.hud-shadow-build { display:flex; align-items:center; gap:9px; padding:6px 12px; border:1px solid color-mix(in srgb,var(--shadow-color) 38%,transparent); border-radius:10px; background:rgba(12,12,20,.84); text-align:left; }
.hud-shadow-build b { display:block; color:var(--shadow-color); font-size:12px; }
.hud-shadow-build small { display:block; margin-top:2px; color:rgba(233,232,244,.66); font-size:10px; }

.hud-spell-build { display: flex; flex-direction: column; gap: 5px; }.hud-spell-slots { display: flex; gap: 6px; }
.hud-element-route { display:flex; flex-direction:column; gap:2px; padding:4px 7px; border-left:2px solid var(--element-route-color,#b6a4ff); background:color-mix(in srgb,var(--element-route-color,#b6a4ff) 8%,transparent); }.hud-element-route b { color:var(--element-route-color,#d4caff); font-size:10px; }.hud-element-route small { color:#a39aac; font-size:9px; }.hud-element-route.exploring { --element-route-color:#aaa0c4; }
.hud-spell-slots > span { display: flex; gap: 5px; align-items: center; min-height: 30px; padding: 3px 8px; border: 1px solid #494351; border-radius: 5px; background: rgb(18 17 23 / .8); color: var(--spell-color, #82798e); }
.hud-spell-slots i { font-style: normal; font-size: 14px; }.hud-spell-slots b { font-size: 11px; font-weight: 600; }.hud-spell-slots small { color: #a39aac; font-size: 9px; }.hud-spell-slots .spell-slot-empty { border-style: dashed; }
.hud-spell-build p { display: flex; gap: 8px; margin: 0; font-size: 10px; color: #98909f; }.hud-spell-build p b { font-weight: 600; color: #c8b9df; }
.spell-shield-status { position: absolute; left: 24px; bottom: 78px; display: flex; align-items: center; gap: 6px; padding: 6px 9px; border: 1px solid #494351; border-radius: 5px; background: rgb(18 17 23 / .85); font-size: 10px; color: #c8b9df; }
.spell-shield-status b { font-size: 11px; }.spell-shield-status small { color: #a7a0b2; font-size: 9px; }
.spell-shield-status.broken { color: #8d8497; }.spell-shield-status i { width: 42px; height: 3px; background: #38303e; border-radius: 2px; overflow: hidden; }
.spell-shield-status em { display: block; height: 100%; background: #b6a4df; }
.has-spells .spell-shield-status { color: var(--fusion-main); }
.has-spells .spell-shield-status em { background: var(--fusion-main); }
.has-spells .hud-spell-build p b { color: var(--fusion-main); }
.hud-spell-slots small { max-width: 160px; white-space: normal; }
@media (max-width: 520px) { .hud-spell-slots > span { padding: 3px 5px; min-height: 26px; }.hud-spell-slots b { font-size: 10px; }.hud-spell-slots small { max-width: 70px; }.hud-spell-slots .spell-slot-empty small { max-width: 65px; line-height: 1.25; }.hud-spell-build p { flex-wrap: wrap; gap: 3px 7px; } }
.shadow-status { position: absolute; left: 24px; bottom: 78px; width: 184px; box-sizing: border-box; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; padding: 7px 10px; border: 1px solid #bea0ce38; border-radius: 8px; background: #211b29e8; color: #dcc9e7; font-size: 11px; }
.shadow-status b { color: #f3e6fa; font-variant-numeric: tabular-nums; }
.shadow-status small { width: 100%; color: #bba9c5; font-size: 10px; }
.shadow-shield-bar { width: 100%; height: 3px; border-radius: 2px; background: #362c44; overflow: hidden; }
.shadow-shield-bar em { display: block; height: 100%; background: linear-gradient(90deg, #9c88ff, #78e8ff); }
.shadow-soul-bar { width: 100%; height: 3px; border-radius: 2px; background: #362c44; overflow: hidden; }
.shadow-soul-bar em { display: block; height: 100%; background: linear-gradient(90deg, #4ade80, #c084fc); transition: width 0.12s linear; }
.hud.has-shadow .formation-break-hud { bottom: 186px; }
.hud.has-glutton .formation-break-hud { bottom: 138px; }
.glutton-status { position: absolute; left: 24px; bottom: 78px; width: 176px; box-sizing: border-box; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; padding: 7px 10px; border: 1px solid rgba(181, 214, 111, 0.34); border-radius: 8px; background: rgba(22, 28, 17, 0.9); color: #dcebc8; font-size: 12px; }
.glutton-status b { color: #f1ffd6; font-variant-numeric: tabular-nums; }
.glutton-status small { width: 100%; color: #b5cba0; font-size: 10px; }
.glutton-status__track { display: block; width: 100%; height: 4px; overflow: hidden; border-radius: 2px; background: rgba(255, 255, 255, 0.12); }
.glutton-status__track em { display: block; height: 100%; background: linear-gradient(90deg, #62a94b, #c8f37d); transition: width 0.12s linear; }
.hud {
  --hud-top-inset: 14px;
  --hud-top-bottom: calc(var(--hud-top-inset) + var(--hud-top-height));
  position: absolute;
  inset: 0;
  pointer-events: none; /* 关键：UI 层不拦截游戏输入 */
  color: var(--art-text, #f3ead5);
}

.hud.has-strain-skill {
  --hud-skill-cue-height: 38px;
  --hud-skill-cue-offset: calc(var(--hud-skill-cue-height) + 7px);
}

/* Runner 试玩模式：隐藏全部 Arena 专属信息（等级/生命/波次/提示/统计/Boss/事件/
   悬赏/章节演出），仅保留右上角暂停与静音按钮；Runner 信息使用独立 Vue HUD */
.hud--runner .hud-title,
.hud--runner .hud-level,
.hud--runner .expedition-hud,
.hud--runner .hud-hint,
.hud--runner .hud-bottom-right,
.hud--runner .formation-break-hud,
.hud--runner .glutton-status,
.hud--runner .hud-side-panels,
.hud--runner .chapter-intro,
.hud--runner .combo-toast,
.hud--runner .deadline-countdown {
  display: none;
}

.hud-title {
  position: absolute;
  top: 18px;
  left: 24px;
  width: 240px;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 2px;
  line-height: 1;
  color: var(--art-text, #eaffdd);
  text-shadow: 0 1px 0 rgba(255, 240, 196, 0.18), 0 3px 12px rgba(0, 0, 0, 0.72);
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
}

/* V1 visual system: quiet stone/glass surfaces, restrained gold focus states. */
.hud-run-status,
.boss-hud,
.objective-hud,
.hud-elements,
.hud-reactions {
  border-color: var(--art-edge, rgba(225, 211, 170, 0.34));
  background-color: var(--art-surface, rgba(19, 27, 23, 0.88));
  box-shadow: inset 0 1px 0 rgba(255, 246, 214, 0.06), 0 8px 22px rgba(0, 0, 0, 0.2);
}
.hud-title span {
  display: block;
  margin-top: 6px;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 2.5px;
  opacity: 0.55;
}

.hud-level {
  position: absolute;
  top: var(--hud-top-inset);
  left: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  width: min(1040px, calc(100vw - 560px));
  min-width: 0;
  transform: translateX(-50%);
}

.hud-vitals,
.hud-build {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-width: 0;
}

.hud-vitals {
  gap: 12px;
  min-height: 25px;
}

.hud-skill-cue {
  display: grid;
  place-items: center;
  min-height: var(--hud-skill-cue-height);
}

.hud-skill-badge {
  --skill-dial-fill: #eabb68;
  --skill-dial-face: #192a24;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: var(--hud-skill-cue-height);
  padding: 0 11px 0 4px;
  border: 1px solid #677c71;
  border-radius: 999px;
  background: #273a32;
  color: #bbd1c6;
  font-size: 13px;
  white-space: nowrap;
  box-shadow: 0 2px 8px #223a2c33;
}

.hud-skill-badge.ready {
  --skill-dial-fill: #f5d17c;
  --skill-dial-face: #254936;
  border-color: #ad975d;
  background: #1d4132;
  color: #ffe19b;
}

.hud-skill-dial {
  position: relative;
  display: grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  color: #ffe19b;
  background: conic-gradient(var(--skill-dial-fill) var(--skill-progress), #54665c 0);
}

.hud-skill-dial::before {
  position: absolute;
  inset: 3px;
  border-radius: inherit;
  background: var(--skill-dial-face);
  content: '';
}

.hud-skill-dial > * { position: relative; }

.hud-skill-seconds {
  font-size: 12px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.hud-skill-seconds small {
  margin-inline-start: 1px;
  font-size: 8px;
}

.hud-skill-state {
  padding-inline-start: 7px;
  border-inline-start: 1px solid currentColor;
  font-size: 11px;
  font-weight: 650;
}

.hud-skill-badge.is-ready-flash {
  animation: skillReadyFlash 0.34s ease-out;
}

.hud-skill-badge.ready .hud-skill-dial {
  animation: skillReadyGlow 2.4s ease-in-out 0.34s infinite;
}

@keyframes skillReadyFlash {
  18%, 42% {
    transform: scale(1.12);
    background-color: #3b5234;
    border-color: #ffe8a4;
    box-shadow: 0 0 0 4px #ffe5a1, 0 0 22px 6px #ffd574a8, 0 2px 8px #223a2c33;
  }
}

@keyframes skillReadyGlow {
  50% {
    filter: brightness(1.14);
    box-shadow: 0 0 0 2px #f5d17c55, 0 0 9px #f5d17c8c;
  }
}

.hud-build {
  gap: 10px;
  min-height: 28px;
}

.hud-level-txt {
  font-size: 15px;
  font-weight: 800;
  color: #d2ff8a;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
}

.hud-level-bar {
  width: clamp(140px, 13vw, 190px);
  height: 8px;
  flex: 0 1 auto;
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

/* 每个圆点表示 1 点生命，支持部分填充。 */
.hud-hp {
  display: flex;
  gap: 5px;
  flex: none;
}

.hp-dot {
  position: relative;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, rgba(255, 157, 157, 0.22), rgba(224, 68, 68, 0.22));
  box-shadow: 0 0 6px rgba(224, 68, 68, 0.5);
}

.hp-dot::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(circle at 35% 30%, #ff9d9d, #e04444);
  clip-path: inset(0 calc(100% - var(--hp-fill)) 0 0);
  transition: clip-path 0.3s ease;
}

.hp-dot.lost {
  box-shadow: none;
}

.hud-wave {
  flex: none;
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

.hud-wave.expedition {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hud-run-status {
  display: flex;
  align-items: center;
  flex: none;
  gap: 8px;
  min-height: 22px;
  padding: 3px 9px;
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

/* 章节时限紧急度：剩余 60s 转黄 → 30s 橙 → 10s 红并呼吸闪烁 */
.hud-run-status.deadline-warn b { color: #ffd166; }
.hud-run-status.deadline-danger b { color: #ff9d5c; }
.hud-run-status.deadline-critical { border-color: rgba(223, 87, 73, 0.72); }
.hud-run-status.deadline-critical b {
  color: #ff6b5e;
  animation: deadline-pulse 0.5s ease-in-out infinite alternate;
}

@keyframes deadline-pulse {
  from { opacity: 1; }
  to { opacity: 0.45; }
}

.expedition-hud {
  position: absolute;
  top: 86px;
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

.chapter-event-title,
.chapter-event-timer,
.expedition-counts {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.chapter-event-title b,
.chapter-event-timer b,
.expedition-counts b {
  color: #28596a;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.chapter-event-hint {
  margin: 3px 0 0;
  color: var(--adventure-muted);
  font-size: 11px;
  line-height: 1.5;
}

.chapter-event-timer,
.expedition-counts {
  margin: 4px 0 6px;
  font-size: 10px;
  color: var(--adventure-muted);
}

.expedition-track.chapter-event-track em {
  background: var(--event-progress, #397b94);
}

/* 章节时限条：目标面板内常驻倒计时（条随剩余时间收缩，按紧急度换色） */
.expedition-deadline {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 3px 0 6px;
  font-size: 9.5px;
  color: rgba(255, 255, 255, 0.55);
}
.expedition-deadline i {
  flex: 1;
  height: 4px;
  margin: 0;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}
.expedition-deadline em {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: #8ae84a;
  transition: width 0.12s linear;
}
.expedition-deadline b {
  color: #d2ff8a;
  font-variant-numeric: tabular-nums;
}
.expedition-deadline.deadline-warn em { background: #ffd166; }
.expedition-deadline.deadline-warn b { color: #ffd166; }
.expedition-deadline.deadline-danger em { background: #ff9d5c; }
.expedition-deadline.deadline-danger b { color: #ff9d5c; }
.expedition-deadline.deadline-critical em { background: #ff5c4d; }
.expedition-deadline.deadline-critical b {
  color: #ff6b5e;
  animation: deadline-pulse 0.5s ease-in-out infinite alternate;
}

/* 章节公告：z-index 低于升级遮罩(10)，升级弹窗出现时公告沉入背景不抢层 */
.chapter-intro {
  position: absolute;
  inset: 0;
  z-index: 9;
  display: grid;
  place-items: center;
  overflow: hidden;
  text-align: center;
}

.chapter-intro-scrim {
  position: absolute;
  inset: 0;
  background: rgba(3, 7, 4, 0.78);
  animation: chapter-scrim 1.6s ease-in-out both;
}

.chapter-intro section {
  position: relative;
  width: min(620px, calc(100vw - 40px));
  animation: chapter-copy 1.6s ease-in-out both;
}

.chapter-intro span {
  color: rgba(210, 255, 138, 0.72);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
}

.chapter-intro i {
  display: block;
  width: 72px;
  height: 1px;
  margin: 12px auto 13px;
  background: rgba(210, 255, 138, 0.5);
}

.chapter-intro h2 {
  margin: 0;
  color: #f2f6ed;
  font-size: 30px;
  font-weight: 850;
  letter-spacing: 0;
  text-shadow: 0 2px 16px rgba(0, 0, 0, 0.72);
}

.chapter-intro p {
  max-width: 560px;
  margin: 10px auto 0;
  color: rgba(255, 255, 255, 0.62);
  font-size: 13px;
  line-height: 1.55;
}

/* 开幕卡上的时限宣告：带 deadline 的章节在演出阶段就明确失败条件 */
.chapter-intro .chapter-deadline {
  margin-top: 8px;
  color: #ffc98a;
  font-weight: 700;
}

@keyframes chapter-scrim {
  0%, 100% { opacity: 0; }
  15%, 76% { opacity: 1; }
}

@keyframes chapter-copy {
  0% { opacity: 0; transform: translateY(8px); }
  18%, 74% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-4px); }
}

/* 元素指示：四格核心，未吸收时灰暗 */
.hud-elements {
  display: flex;
  flex: none;
  gap: 4px;
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
  flex: none;
  gap: 5px;
}

.hud-core-resonance {
  display: grid;
  grid-template-columns: auto auto;
  align-items: center;
  column-gap: 6px;
  padding: 4px 8px;
  border: 1px solid color-mix(in srgb, var(--resonance-color) 48%, transparent);
  border-radius: 7px;
  color: color-mix(in srgb, var(--resonance-color) 86%, white 14%);
  background: color-mix(in srgb, var(--resonance-color) 8%, rgba(19, 27, 23, 0.88));
  white-space: nowrap;
}

.hud-core-resonance span,
.hud-core-resonance small {
  grid-column: 1 / -1;
}

.hud-core-resonance span {
  font-size: 9px;
  letter-spacing: 0.8px;
  opacity: 0.76;
}

.hud-core-resonance b {
  font-size: 13px;
  letter-spacing: 1px;
}

.hud-core-resonance small {
  margin-top: 1px;
  font-size: 9px;
  color: rgba(255, 255, 255, 0.64);
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
  white-space: nowrap;
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

/* 消化进度（吞噬 → 元素联动）：吃下去的猎物正在变成元素养分 */
.hud-digest {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  color: rgba(255, 209, 102, 0.86);
  letter-spacing: 1px;
  white-space: nowrap;
}

.hud-digest i {
  display: block;
  width: 76px;
  height: 5px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.12);
}

.hud-digest em {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #8ae84a, #ffd166);
  transition: width 0.2s ease;
}

.hud-digest b {
  font-size: 10px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.68);
}

.hud-digest.ready {
  color: #ffd166;
  animation: digestPulse 1s ease-in-out infinite alternate;
}

.hud-digest.ready em {
  background: linear-gradient(90deg, #ffd166, #ff9f43);
}

.hud-primal {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  color: rgba(140, 255, 200, 0.86);
  letter-spacing: 1px;
  white-space: nowrap;
}

.hud-primal i {
  display: block;
  width: 76px;
  height: 5px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.12);
  /* 5 格 × 20：分段刻度线 */
  outline: 1px solid rgba(140, 255, 200, 0.18);
  background-image: repeating-linear-gradient(90deg, transparent 0 14px, rgba(0, 0, 0, 0.55) 14px 15px);
  background-size: 15px 100%;
}

.hud-primal em {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #4dd0e1, #8cffc8);
  transition: width 0.2s ease;
}

.hud-primal b {
  font-size: 10px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.68);
}

.hud-primal.ready {
  color: #8cffc8;
}

.hud-primal.ready em {
  background: linear-gradient(90deg, #8cffc8, #ffd166);
}

.hud-primal.full {
  animation: digestPulse 1s ease-in-out infinite alternate;
}

@keyframes digestPulse {
  from { opacity: 0.72; }
  to { opacity: 1; }
}

/* 流派专精徽章（阶段十八） */
.hud-specs {
  display: flex;
  flex: none;
  gap: 6px;
}

.spec-chip {
  display: inline-flex; align-items: center; gap: 4px;
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

/* 源质记忆（原生黏液）：紧凑三槽位 + 下一次超载预告 */
.hud-memory {
  display: flex;
  flex-wrap: wrap;
  flex: none;
  align-items: center;
  gap: 5px;
  font-size: 11px;
}

.hud-memory .memory-label {
  color: #8ea6a0;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1.2px;
}

.hud-memory .memory-slot {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 8px 1px 4px;
  border: 1px solid color-mix(in srgb, var(--memory-color) 45%, transparent);
  border-radius: 999px;
  color: #dfeae2;
  background: color-mix(in srgb, var(--memory-color) 12%, rgba(0, 0, 0, 0.35));
  white-space: nowrap;
}

.hud-memory .memory-slot b { font-weight: 700; }

.hud-memory .memory-slot em {
  color: var(--memory-color);
  font-style: normal;
  font-size: 10px;
  font-weight: 800;
}

.hud-memory .memory-slot.next {
  border-color: var(--memory-color);
  box-shadow: 0 0 8px color-mix(in srgb, var(--memory-color) 55%, transparent);
}

.hud-memory .memory-slot.casting {
  animation: memory-cast 0.5s ease-out 2;
}

.hud-memory .memory-next { color: #a7b8ad; font-size: 10.5px; }
.hud-memory .memory-next b { color: #ffe08a; font-weight: 800; }
.hud-memory.empty { color: #7f8f88; font-size: 10.5px; }
.hud-memory .memory-empty { letter-spacing: 0.4px; }

@keyframes memory-cast {
  0% { background: color-mix(in srgb, var(--memory-color) 55%, rgba(0, 0, 0, 0.35)); }
  100% { background: color-mix(in srgb, var(--memory-color) 12%, rgba(0, 0, 0, 0.35)); }
}

/* 元素组合激活提示（屏幕中央上方短暂浮现） */
.combo-toast {
  position: absolute;
  top: max(calc(94px + var(--hud-skill-cue-offset, 0px)), calc(var(--hud-top-bottom) + 8px));
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

/* 章节时限末 10 秒：屏幕中央逐秒大数字（:key 每秒重挂载 → 动画重放一次脉冲） */
.deadline-countdown {
  position: absolute;
  top: 30%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 13;
  color: #ff5c4d;
  font-size: 84px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 0 22px rgba(255, 62, 40, 0.55), 0 3px 14px rgba(0, 0, 0, 0.8);
  pointer-events: none;
  animation: deadline-pop 0.9s ease-out both;
}

@keyframes deadline-pop {
  0% { opacity: 0; transform: translateX(-50%) scale(1.6); }
  18% { opacity: 1; transform: translateX(-50%) scale(1); }
  75% { opacity: 1; }
  100% { opacity: 0.35; }
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
  max-width: calc(100% - 560px);
  padding: 8px 18px;
  border-radius: 999px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(4px);
}

.hud-bottom-right {
  position: absolute;
  bottom: 22px;
  right: 24px;
  width: max-content;
  border: 1px solid var(--adventure-line);
  border-radius: 8px;
  background: var(--adventure-paper);
  color: var(--adventure-muted);
  box-shadow: 0 3px 12px #223a2c20;
}

.hud-stats {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(42px, auto);
  gap: 5px 12px;
  padding: 7px 10px;
  line-height: 1.3;
}

.hud-stats dt {
  font-size: 10px;
}

.hud-stats dd {
  margin-top: 1px;
  color: var(--adventure-ink);
  font-size: 13px;
  font-weight: 720;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.pet-status {
  position: absolute;
  bottom: 82px;
  left: 24px;
  box-sizing: border-box;
  width: 210px;
  padding: 9px 10px;
  border: 1px solid rgba(237, 196, 121, 0.23);
  border-radius: 8px;
  background: rgba(9, 20, 16, 0.84);
  backdrop-filter: blur(4px);
}
.pet-status__row { --pet-color: #e3b96e; display: flex; align-items: center; gap: 9px; min-width: 0; }
.pet-status__row.hunter { --pet-color: #83d3bd; }
.pet-status__row.dew { --pet-color: #8fd7e8; }
.pet-status__row.spore { --pet-color: #c3a4dc; }
.pet-status__row + .pet-status__row { margin-top: 9px; }
.pet-status.squad { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 18px; width: 440px; }
.pet-status.squad .pet-status__row { margin-top: 0; }
.pet-status__boost { display: grid; grid-column: 1 / -1; grid-template-columns: 1fr auto; gap: 5px; margin-bottom: 10px; color: #ffe4a1; font-size: 10px; }
.pet-status.squad .pet-status__boost { margin-bottom: 0; }
.pet-status__boost b { font-weight: 500; font-variant-numeric: tabular-nums; }
.pet-status__boost i { grid-column: 1 / -1; height: 2px; overflow: hidden; background: rgba(237,196,121,.15); }
.pet-status__boost em { display: block; height: 100%; background: #edc479; transition: width .1s linear; }
.pet-status__row.boosted .pet-status__crest { border-color: #ffe4a1; }
.pet-status__crest {
  position: relative;
  flex: 0 0 25px;
  height: 25px;
  box-sizing: border-box;
  border: 1px solid color-mix(in srgb, var(--pet-color) 50%, #192b24);
  border-radius: 9px 9px 7px 7px;
  background: color-mix(in srgb, var(--pet-color) 72%, #493923);
  box-shadow: inset 0 2px 3px rgba(255, 255, 255, 0.26);
}
.pet-status__crest::before,
.pet-status__crest::after { content: ''; position: absolute; top: 13px; width: 3px; height: 4px; border-radius: 50%; background: #243b34; }
.pet-status__crest::before { left: 7px; }
.pet-status__crest::after { right: 7px; }
.hunter .pet-status__crest {
  border-radius: 11px 11px 7px 7px;
  background:
    radial-gradient(ellipse 2px 3px at 9px 16px, #243b34 95%, transparent 100%),
    radial-gradient(ellipse 2px 3px at 17px 16px, #243b34 95%, transparent 100%),
    linear-gradient(135deg, #d5fff0, #69b8a2 75%);
}
.hunter .pet-status__crest::before { top: -6px; left: 5px; width: 7px; height: 9px; border-radius: 8px 0 8px 0; transform: rotate(-21deg); background: #83d3bd; }
.hunter .pet-status__crest::after { top: -6px; right: 3px; width: 7px; height: 9px; border-radius: 0 8px 0 8px; transform: rotate(21deg); background: #a5e7c9; }
.dew .pet-status__crest {
  border-radius: 13px 13px 8px 8px;
  background:
    radial-gradient(ellipse 2px 3px at 9px 16px, #24495a 95%, transparent 100%),
    radial-gradient(ellipse 2px 3px at 17px 16px, #24495a 95%, transparent 100%),
    linear-gradient(135deg, #e4fbff, #8fd7e8 65%, #5099b4);
}
.dew .pet-status__crest::before { top: -7px; left: 9px; width: 8px; height: 10px; border-radius: 9px 0 9px 9px; transform: rotate(35deg); background: #bceefa; }
.dew .pet-status__crest::after { display: none; }
.spore .pet-status__crest {
  background:
    radial-gradient(ellipse 2px 3px at 9px 17px, #303047 95%, transparent 100%),
    radial-gradient(ellipse 2px 3px at 17px 17px, #303047 95%, transparent 100%),
    linear-gradient(135deg, #f0ddf8, #b498d1);
}
.spore .pet-status__crest::before { top: -5px; left: -3px; width: 29px; height: 14px; border-radius: 15px 15px 7px 7px; background: #8c6eaa; border: 1px solid #59466f; }
.spore .pet-status__crest::after { display: none; }
.pet-status__body { flex: 1; min-width: 0; }
.pet-status__meta { display: flex; align-items: baseline; justify-content: space-between; gap: 7px; margin-bottom: 6px; color: var(--pet-color); font-size: 11px; }
.pet-status__meta span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.pet-status__meta small { flex: none; color: rgba(242, 245, 231, 0.48); font-size: 9px; }
.pet-status__meta b { flex: none; margin-left: auto; color: rgba(242, 245, 231, 0.76); font-size: 10px; font-weight: 500; font-variant-numeric: tabular-nums; }
.pet-status__track { display: block; height: 3px; overflow: hidden; border-radius: 3px; background: rgba(255, 255, 255, 0.14); }
.pet-status__track em { display: block; height: 100%; border-radius: inherit; background: var(--pet-color); transition: width 0.18s linear; }
.pet-status__support { display: flex; justify-content: space-between; gap: 6px; margin-top: 5px; color: rgba(242,245,231,.48); font-size: 9px; }
.pet-status__support span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pet-status__support b { flex: none; font-weight: 500; font-variant-numeric: tabular-nums; }
.pet-status__support.active { color: var(--pet-color); }
.pet-status__row.resting { opacity: 0.66; }
.hud-action {
  pointer-events: auto;
  cursor: pointer;
  touch-action: manipulation;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-height: 35px;
  padding: 6px 9px;
  border-top: 1px solid var(--adventure-line);
  border-radius: 0 0 7px 7px;
  background: #f0f3ee;
  white-space: nowrap;
}

.hud-action:focus-visible {
  outline: 2px solid var(--adventure-focus);
  outline-offset: -3px;
}

.hud-action:hover { background: #e8eee8; }
.hud-action.ready { background: #e6eef4; color: var(--adventure-slate); }
.hud-action.ready:hover { background: #dce8ef; }

.hud-action-name {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
}

.has-spells .hud-action-name {
  color: color-mix(in srgb, var(--fusion-main) 38%, var(--adventure-ink));
}

.hud-action-name .skill-glyph {
  --glyph-frame: 18px;
  --glyph-size: 17px;
  color: inherit;
}

.hud-action-key {
  padding: 1px 5px;
  border: 1px solid var(--adventure-line);
  border-radius: 4px;
  font-size: 9px;
  font-weight: 800;
}

.hud-action.ready .hud-action-key {
  border-color: var(--adventure-slate);
  background: var(--adventure-slate);
  color: #fff;
}

.formation-break-hud {
  position: absolute;
  bottom: 74px;
  left: 24px;
  width: 168px;
  color: rgba(255, 255, 255, 0.68);
  font-size: 9px;
}

.formation-break-hud > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 4px;
}

.formation-break-hud span,
.formation-break-hud b {
  color: #bfeaa2;
  font-size: 10px;
}

.formation-break-hud b {
  font-variant-numeric: tabular-nums;
}

.formation-break-hud > i {
  display: block;
  height: 3px;
  margin-bottom: 4px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.12);
}

.formation-break-hud > i > em {
  display: block;
  height: 100%;
  background: #8fce6d;
  transition: width 0.1s linear;
}

.formation-break-hud small {
  color: rgba(255, 255, 255, 0.5);
  font-size: 8px;
}

/* 施放回弹：按下成功的确认（轻微下压 0.18s），闭合「亮 → 用掉 → 暗 → 亮」 */
.hud-action--skill.is-cast-pulse {
  animation: skillCastPulse 0.18s ease-out;
}

@keyframes skillCastPulse {
  0% { transform: scale(1); }
  40% { transform: scale(0.965); }
  100% { transform: scale(1); }
}

.hud-side-panels {
  position: absolute;
  inset: 78px 24px auto;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.hud-left-panels {
  display: grid;
  justify-items: start;
  gap: 8px;
}

.boss-hud {
  box-sizing: border-box;
  width: min(246px, calc(100vw - 28px));
  padding: 7px 10px 8px;
  border: 1px solid var(--adventure-line);
  border-radius: 7px;
  color: var(--adventure-ink);
}

.boss-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 7px;
  margin-bottom: 5px;
}

.boss-meta b,
.boss-cast-name,
.boss-phase-cue {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.boss-meta b {
  font-size: 13px;
  line-height: 1.25;
}

.boss-phase-cue,
.boss-vulnerability {
  flex-shrink: 0;
  max-width: 52%;
  color: var(--adventure-gold);
  font-size: 10px;
  font-weight: 650;
  white-space: nowrap;
}

.boss-track {
  height: 5px;
  overflow: hidden;
  border-radius: 3px;
}
.boss-track em {
  display: block;
  height: 100%;
  background: #d6a642;
  transition: width 0.12s linear;
}

.boss-members {
  display: grid;
  gap: 4px;
  margin-top: 6px;
}

.boss-members > div {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 64px;
  align-items: center;
  gap: 7px;
  min-height: 12px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 10px;
}

.boss-members > div > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.boss-members > div > i {
  height: 3px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
}

.boss-members > div > i > em {
  display: block;
  height: 100%;
  background: rgba(214, 166, 66, 0.72);
  transition: width 0.12s linear;
}

.boss-members > div.casting {
  color: #ffe3a2;
}

.boss-members > div.casting > i > em {
  background: #ff7466;
}

.boss-members > div.enraged:not(.casting) > i > em {
  background: #df5749;
}

.boss-members > div.protected {
  color: #f4d88a;
}

.boss-members > div.protected > span::after {
  content: ' · 受护';
  color: var(--adventure-gold);
}

.boss-members > div.protected > i > em {
  background: #c8b163;
}

.boss-members > small {
  color: var(--adventure-muted);
  font-size: 10px;
  text-align: right;
}

.boss-formation {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 18px;
  margin-top: 5px;
  padding-top: 5px;
  border-top: 1px solid var(--adventure-line);
  color: var(--adventure-muted);
  font-size: 10px;
}

.boss-formation > span {
  display: flex;
  flex: 0 1 auto;
  align-items: center;
  min-width: 0;
  color: #ead28d;
  white-space: nowrap;
}

.boss-formation > span > i {
  display: inline-grid;
  width: 14px;
  height: 14px;
  margin-right: 6px;
  place-items: center;
  border: 1px solid rgba(234, 210, 141, 0.42);
  color: var(--adventure-gold);
  font-size: 8px;
  font-style: normal;
  font-weight: 800;
}

.boss-formation > b {
  font-weight: 600;
  text-align: right;
  line-height: 1.35;
}

.boss-formation.blood_oath > span,
.boss-formation.blood_oath > span > i {
  color: #ef998c;
  border-color: rgba(239, 153, 140, 0.4);
}

.boss-formation.arcane_relay > span,
.boss-formation.arcane_relay > span > i {
  color: #9dc8df;
  border-color: rgba(157, 200, 223, 0.4);
}

.boss-formation.broken > span,
.boss-formation.broken > span > i {
  color: #a9dc8d;
  border-color: rgba(169, 220, 141, 0.42);
}

.boss-telegraph {
  display: grid;
  gap: 4px;
  margin-top: 6px;
}

.boss-cast-name {
  color: var(--adventure-danger);
  font-size: 11px;
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

.nest-defense {
  display: grid;
  grid-template-columns: auto minmax(58px, 1fr) auto;
  align-items: center;
  gap: 7px;
  min-height: 18px;
  margin-top: 6px;
  color: rgba(255, 225, 198, 0.72);
  font-size: 9px;
}

.nest-defense > i {
  display: block;
  height: 4px;
  margin: 0;
  overflow: hidden;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.1);
}

.nest-defense > i > em {
  display: block;
  height: 100%;
  background: #d8845c;
  transition: width 0.12s linear;
}

.nest-defense > b {
  color: #f0ba91;
  font-size: 9px;
  font-variant-numeric: tabular-nums;
}

.boss-cast-track em {
  background: #ff7466;
}

.boss-hud.enraged {
  border-color: rgba(232, 87, 73, 0.5);
}

.boss-hud.enraged .boss-track em {
  background: #df5749;
}

.boss-hud.vulnerable .boss-track em {
  background: #af831f;
}

.objective-hud {
  --objective-color: #d6a642;
  box-sizing: border-box;
  width: min(290px, calc(100vw - 28px));
  margin-left: auto;
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

.endless-bounty-hud {
  box-sizing: border-box;
  width: min(290px, calc(100vw - 28px));
  padding: 11px 12px 10px;
  border: 1px solid rgba(190, 154, 104, 0.46);
  border-radius: 7px;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(10, 9, 7, 0.78);
  backdrop-filter: blur(5px);
}

.bounty-kicker,
.bounty-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.bounty-kicker {
  margin-bottom: 5px;
  color: rgba(255, 255, 255, 0.56);
  font-size: 10px;
}

.bounty-kicker i,
.bounty-title em {
  font-style: normal;
  font-variant-numeric: tabular-nums;
}

.bounty-title b {
  overflow: hidden;
  color: #f2dfaa;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bounty-title em {
  flex: 0 0 auto;
  color: #e8c477;
  font-size: 12px;
  font-weight: 800;
}

.bounty-track {
  height: 4px;
  margin: 8px 0 7px;
  overflow: hidden;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.1);
}

.bounty-track i {
  display: block;
  height: 100%;
  background: #c8a567;
  transition: width 0.18s linear;
}

.bounty-reward {
  overflow: hidden;
  color: rgba(255, 255, 255, 0.62);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  border: 1px solid var(--adventure-line);
  border-radius: 6px;
  font-size: 16px;
  color: var(--adventure-ink);
  background: var(--adventure-paper);
  backdrop-filter: blur(4px);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.hud-pause:hover {
  border-color: var(--adventure-green);
  background: var(--adventure-leaf);
}

.hud-pause:active {
  transform: scale(0.96);
}

.hud-pause:focus-visible {
  outline: 2px solid var(--adventure-focus);
  outline-offset: 2px;
}

@media (max-width: 1400px) and (min-width: 901px) {
  .hud-side-panels {
    inset: 59px 16px auto;
  }

  .boss-hud {
    width: 150px;
  }

  .boss-members > div {
    grid-template-columns: minmax(0, 1fr) 36px;
  }

  .hud-title {
    top: 16px;
    left: 16px;
    width: 150px;
    font-size: 17px;
  }

  .hud-title span,
  .hud-run-status span,
  .reaction-meta {
    display: none;
  }

  .hud-level {
    width: min(1040px, calc(100vw - 340px));
  }

  .hud-vitals {
    gap: 8px;
  }

  .hud-level-bar {
    width: clamp(110px, 13vw, 150px);
  }

  .hp-dot {
    width: 10px;
    height: 10px;
  }

  .reaction-chip,
  .spec-chip {
    padding-right: 6px;
    padding-left: 6px;
    font-size: 10px;
    letter-spacing: 0;
  }

  .hud-btns {
    right: 16px;
  }
}

@media (max-width: 900px) {
  .hud {
    --hud-top-inset: 56px;
    --hud-panel-top: 170px;
    --hud-panel-offset: max(var(--hud-skill-cue-offset, 0px), calc(var(--hud-top-bottom) + 8px - var(--hud-panel-top)));
  }

  .spell-shield-status { left: 14px; bottom: 70px; }
  .shadow-status { left: 14px; bottom: 70px; width: 164px; }
  .glutton-status { left: 14px; bottom: 70px; width: 162px; }
  .pet-status { left: 14px; bottom: 74px; width: min(210px, calc(100vw - 28px)); }
  .pet-status.squad { width: min(390px, calc(100vw - 28px)); gap: 12px; }
  .pet-status.squad .pet-status__meta { gap: 4px; }
  .pet-status.squad .pet-status__meta small { display: none; }
  .combo-toast {
    top: auto;
    bottom: 146px;
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
    width: calc(100% - 24px);
    gap: 7px;
  }

  .hud-vitals,
  .hud-build {
    flex-wrap: wrap;
    row-gap: 7px;
  }

  .hud-vitals {
    gap: 7px 9px;
  }

  .expedition-hud {
    translate: 0 var(--hud-panel-offset);
  }

  .hud-level-bar {
    width: min(180px, 38vw);
  }

  .hud-wave.expedition {
    max-width: min(240px, 62vw);
  }

  .chapter-intro h2 {
    font-size: 25px;
  }

  .chapter-intro p {
    font-size: 12px;
  }

  .deadline-countdown {
    font-size: 56px;
  }

  .hud-side-panels {
    inset: calc(var(--hud-top-bottom) + 8px) 14px auto;
    display: grid;
  }

  .hud:not(.has-boss) .hud-side-panels {
    top: calc(222px + var(--hud-panel-offset));
  }

  .boss-hud {
    width: min(220px, calc(60vw - 8px));
  }

  .expedition-hud {
    top: var(--hud-panel-top);
    left: 14px;
    box-sizing: border-box;
    width: calc(100vw - 28px);
  }

  .objective-hud,
  .endless-bounty-hud {
    width: min(264px, calc(100vw - 28px));
  }

  .hud:not(.has-boss) .objective-hud.expedition {
    margin-top: 42px;
  }

  .hud-bottom-right {
    bottom: 14px;
    right: 14px;
  }

  .formation-break-hud {
    bottom: 66px;
    left: 14px;
  }

  .hud-btns {
    top: 12px;
    right: 14px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chapter-intro-scrim,
  .chapter-intro section {
    animation: none;
  }
  .hud-skill-badge.is-ready-flash,
  .hud-skill-badge.ready .hud-skill-dial,
  .hud-action--skill.is-cast-pulse {
    animation: none;
  }
}
.hud-tomes { display:flex; flex-wrap:wrap; gap:6px 12px; max-width:560px; margin:6px 0; color:#c2d2b4; font-size:10px; }
.hud-tomes > span { display:inline-flex; align-items:center; gap:4px; }.hud-tomes b { color:#e0cf92; font-weight:500; }
@media(max-width:650px) { .hud-tomes { max-width:230px; font-size:9px; gap:3px 8px; } }
@media (max-width: 650px) {
  /* 窄屏：源质记忆收成两行内，避免挤掉血条/技能条 */
  .hud-memory { max-width: 250px; font-size: 10px; gap: 4px; }
  .hud-memory .memory-slot { padding: 1px 6px 1px 3px; }
  .hud-memory .memory-slot b { max-width: 74px; overflow: hidden; text-overflow: ellipsis; }
  .hud-memory .memory-label { display: none; }
}

@media (max-width: 900px), (pointer: coarse) {
  .hud-bottom-right {
    width: min(176px, calc(50vw - 28px));
  }

  .hud-stats {
    grid-auto-flow: row;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 8px;
  }

  .hud-stats > :last-child:nth-child(3) {
    grid-column: 1 / -1;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
  }
}

@media (max-width: 600px) {
  .pet-status.squad { bottom: 140px; }
}

@media (max-width: 520px) {
  .spell-shield-status,
  .shadow-status,
  .glutton-status,
  .pet-status:not(.squad) {
    max-width: calc(50vw - 8px);
  }

  .spell-shield-status { flex-wrap: wrap; }
}

@media (pointer: coarse) {
  .hud-action {
    min-height: 48px;
  }
}

/* Paper-backed information stays readable over both grass and enclosed levels. */
.hud-title {
  padding: 8px 10px;
  border: 1px solid var(--adventure-line);
  border-radius: 8px;
  background: var(--adventure-paper);
  color: var(--adventure-ink);
  font-weight: 720;
  letter-spacing: 0.04em;
  text-shadow: none;
}
.hud-title span { color: var(--adventure-muted); opacity: 1; }
.hud-vitals {
  width: fit-content;
  max-width: 100%;
  padding: 4px 8px;
  border: 1px solid var(--adventure-line);
  border-radius: 8px;
  background: var(--adventure-paper);
}
.hud-level-txt { color: var(--adventure-green); text-shadow: none; }
.hud-wave, .hud-wave i, .hud-run-status b { color: var(--adventure-gold); }
.hud-wave { background: #f7f0dd; }
.hud-run-status,
.expedition-hud,
.hud-hint,
.boss-hud {
  border-color: var(--adventure-line);
  background: var(--adventure-paper);
  color: var(--adventure-muted);
  box-shadow: 0 3px 12px #223a2c20;
}
.hud-hint { border: 1px solid var(--adventure-line); }
.expedition-head, .expedition-hud i, .expedition-deadline,
.boss-members > div { color: var(--adventure-muted); }
.boss-meta b { color: var(--adventure-ink); }
.expedition-head b, .expedition-deadline b { color: var(--adventure-green); }
.expedition-hud strong { color: var(--adventure-ink); }
.hud-level-bar, .boss-track, .boss-cast-track, .boss-members > div > i,
.expedition-track, .expedition-deadline i { background: #dae4db; }
.hud-level-bar i { background: linear-gradient(90deg, #387755, #6da874); }
.hud-run-status.finale b, .hud-run-status.deadline-danger b, .hud-run-status.deadline-critical b,
.expedition-deadline.deadline-danger b, .expedition-deadline.deadline-critical b { color: var(--adventure-danger); }
.hud-run-status.deadline-warn b, .expedition-deadline.deadline-warn b { color: var(--adventure-gold); }
.boss-formation.blood_oath > span, .boss-formation.blood_oath > span > i { color: var(--adventure-danger); }
.boss-formation.arcane_relay > span, .boss-formation.arcane_relay > span > i { color: var(--adventure-slate); }
.boss-formation.broken > span, .boss-formation.broken > span > i { color: var(--adventure-green); }
.nest-defense { color: var(--adventure-muted); }

</style>
