<script setup>
/**
 * 顶层组件：布局 = 全屏 Canvas（游戏层）+ HUD 覆盖层（UI 层）+ 模态编排
 *
 * 解耦示范：
 *  - stats 是唯一进入 Vue 响应式系统的游戏数据快照（shallowRef，引擎 onStats
 *    以 ~2Hz 整树替换，嵌套对象不深层代理）；连续型数据（冲刺 CD / Boss 施法条）
 *    走 onCooldown ~10Hz 轻量通道；
 *  - 升级事件走 onLevelUp 回调（事件驱动）：引擎暂停后把 3 个技能选项
 *    （普通对象）一次性交给 Vue 渲染面板，面板关闭后引用即丢弃；
 *  - 技能生效通过 skill.apply(engine) 直接修改引擎原生对象，全程无 Proxy 劫持；
 *  - HUD 覆盖层 pointer-events: none，不拦截任何键盘/鼠标输入
 *    （升级面板 z-index 更高且需要点击，单独开启 pointer events）。
 */
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import GameCanvas from './components/GameCanvas.vue'
import HudOverlay from './components/HudOverlay.vue'
import LevelUpModal from './components/LevelUpModal.vue'
import GameOverModal from './components/GameOverModal.vue'
import PauseModal from './components/PauseModal.vue'
import StartScreen from './components/StartScreen.vue'
import BlackMarket from './components/BlackMarket.vue'
import ReactionSwapModal from './components/ReactionSwapModal.vue'
import FusionConfirmModal from './components/FusionConfirmModal.vue'
import ExpeditionRewardModal from './components/ExpeditionRewardModal.vue'
import RunIntroOverlay from './components/RunIntroOverlay.vue'
import { getRunRecord, loadSave, saveSave, pushScore } from './game/SaveManager.js'
import { calculateMaterialReward, normalizeRunSelection, sumDrops } from './game/RunRules.js'
import { getGene, getGenePurchaseState } from './game/GenePool.js'
import { createDefaultStats } from './game/GameEngine.js'
import { getRunIntro } from './game/RunIntro.js'

const engine = shallowRef(null) // 仅作为挂载句柄：浅响应，避免 Vue 深代理整个引擎对象树
const started = ref(false) // 序章结束、主循环已启动
const showMarket = ref(false) // 黑市打开
const save = ref(loadSave()) // 局外存档（掉落物 + 基因等级 + 分数榜 + 音效设置）
const selectedRun = ref(normalizeRunSelection(save.value.preferences))
const muted = ref(save.value.sound?.muted || false) // 音效静音开关（HUD 按钮）
const elementToast = ref('') // 元素组合激活提示（短暂显示）
const toastKind = ref('info')
const evolution = ref(null) // 进化事件演出（title/subtitle/mutation）
let toastTimer = 0
let evolutionTimer = 0

/** 音效快捷访问（引擎未就绪时静默） */
const snd = () => engine.value?.sound

// stats：引擎快照直接整树赋值（shallowRef 不深层代理，形状由 createDefaultStats 保证）
const stats = shallowRef(createDefaultStats())
const levelUpOptions = ref(null) // 升级面板的 3 个技能选项（null = 不显示）
// 高频冷却数据（引擎 onCooldown ~10Hz 推送）：冲刺 CD / Boss 施法条是连续递变量，
// 走 2Hz 大快照会肉眼跳变，单独小通道进响应式（仅 3 个数字，HUD 重渲染开销可忽略）
const cooldown = ref({ dashCd: 0, dashMax: 1.2, cast: 0 })
const gameOverInfo = ref(null) // 游戏结束统计（null = 游戏中）
const isNewRecord = ref(false) // 本局是否刷新了最高纪录
const paused = ref(false) // 手动暂停状态（引擎已暂停，画面冻结）
const reactionChoice = ref(null) // 副反应替换面板数据（null = 不显示；阶段十六槽位经济）
const fusionConfirm = ref(null) // 首融确认面板数据（null = 不显示；阶段十六追加设计）
const expeditionReward = ref(null)
const pendingRun = ref(null)
const currentRecord = computed(() => getRunRecord(save.value, selectedRun.value))

function onEngineReady(eng) {
  engine.value = eng
  eng.setGenes(save.value.genes) // 开局应用黑市基因
  eng.sound.setMuted(muted.value) // 应用持久化的静音设置
  // 引擎快照直接整树赋值：形状由 createDefaultStats 与 _pushStats 共同保证，
  // 不再手工逐字段拷贝（消除双写漂移——fps 死字段就是这么来的）
  eng.onStats = (s) => {
    stats.value = s
  }
  // 高频冷却桥接（~10Hz）：冲刺条 / Boss 施法条的平滑数据源
  eng.onCooldown = (c) => {
    cooldown.value = c
  }
  // 引擎升级暂停后回调：把 3 个技能选项交给 Vue 渲染面板
  eng.onLevelUp = (options) => {
    levelUpOptions.value = options
  }
  // 引擎玩家死亡后回调：显示结算面板 + 战利品入账 + 最高纪录更新 + 分数榜入榜
  eng.onGameOver = (info) => {
    const rawDrops = sumDrops(info.drops)
    const earnedDrops = calculateMaterialReward(rawDrops, selectedRun.value)
    save.value.drops += earnedDrops
    const previousScore = currentRecord.value.best.score || 0
    const { rank, entry, best, board, unlocked, unlockedMode } = pushScore(save.value, selectedRun.value, {
      ...info,
      species: info.species?.name || '',
    })
    saveSave(save.value)
    isNewRecord.value = entry.score > previousScore
    gameOverInfo.value = {
      ...info,
      rawDrops,
      earnedDrops,
      score: entry.score,
      scoreBreakdown: entry.breakdown,
      rank,
      entry,
      best,
      board,
      unlocked,
      unlockedMode,
    }
    if (isNewRecord.value) snd()?.newRecord()
  }
  // 进化事件回调（评审 Day 2）：融合激活时全屏演出，0.95s 后自动淡出
  eng.onEvolution = (title, subtitle, mutation, desc) => {
    evolution.value = { title, subtitle, mutation, desc }
    clearTimeout(evolutionTimer)
    evolutionTimer = setTimeout(() => {
      evolution.value = null
    }, 950)
  }
  // 副反应位已满（阶段十六槽位经济）：暂停 + 弹替换面板
  eng.onReactionFull = (payload) => {
    reactionChoice.value = payload
  }
  // 首融确认（阶段十六追加）：吃下将触发首次融合的核心 → 弹确认面板
  eng.onFusionConfirm = (payload) => {
    fusionConfirm.value = payload
  }
  // Boss 登场回调：HUD 红色警告
  eng.onBossSpawn = (boss) => {
    toastKind.value = 'danger'
    elementToast.value = `⚠️ ${boss.name} 出现了！`
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      elementToast.value = ''
    }, 3000)
  }
  // 波次叙事回调：进入命名波次时提示（反转剧情）
  eng.onWaveChanged = (wave, name) => {
    toastKind.value = 'info'
    elementToast.value = `第 ${wave} 波 · ${name}`
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      elementToast.value = ''
    }, 3000)
  }
  eng.onWorldEvent = (event) => {
    toastKind.value = event.kind === 'completed' ? 'success' : event.kind === 'failed' ? 'danger' : 'info'
    elementToast.value =
      event.kind === 'appeared'
        ? `发现地图事件 · ${event.title}`
        : event.kind === 'activated'
        ? `${event.title} · ${event.brief}`
        : event.kind === 'completed'
        ? `事件完成 · ${event.reward}`
        : `事件失败 · ${event.reason}`
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      elementToast.value = ''
    }, event.kind === 'completed' ? 3200 : 2600)
  }
  eng.onRunState = (event) => {
    toastKind.value = event.kind === 'expedition-clear' || event.kind === 'zone'
      ? 'success'
      : event.kind === 'expedition-stage'
      ? 'info'
      : 'danger'
    elementToast.value = event.kind === 'warning'
      ? '终局勇者正在集结 · 30 秒后降临'
      : event.kind === 'finale'
      ? `${event.boss} 降临 · 击败他才能通关`
      : event.kind === 'zone'
      ? `战区推进 · ${event.zone}`
      : event.kind === 'expedition-clear'
      ? `第 ${event.stage} 关完成 · 残敌溃散`
      : `第 ${event.stage} / ${event.total} 关 · ${event.title}`
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      elementToast.value = ''
    }, event.kind === 'finale' ? 4200 : 3200)
  }
  eng.onExpeditionReward = (payload) => {
    expeditionReward.value = payload
  }
}

/** 选择配置后先进入战前简报，确认按钮才真正消耗一次开局。 */
function onPrepareRun(selection) {
  const normalized = normalizeRunSelection(selection || save.value.preferences)
  const strain = selection?.strain || 'origin'
  selectedRun.value = normalized
  save.value.preferences = { ...normalized }
  saveSave(save.value)
  pendingRun.value = {
    selection: normalized,
    spec: selection?.spec || null,
    strain,
    intro: getRunIntro(normalized, strain),
  }
}

/** 战前简报确认：先 reset 再 start，避免结算/黑市返回后残留死亡与暂停锁。 */
function onDeployRun() {
  const plan = pendingRun.value
  if (!plan || !engine.value) return
  snd()?.gameStart()
  gameOverInfo.value = null
  paused.value = false
  expeditionReward.value = null
  engine.value.configureRun(plan.selection)
  engine.value.applyStartingSpec(plan.spec)
  engine.value.applyStartingStrain(plan.strain)
  engine.value.reset()
  engine.value.start()
  started.value = true
  pendingRun.value = null
}

function onBackFromIntro() {
  pendingRun.value = null
}

/** 打开黑市（开始界面 / 结算面板入口；引擎保持暂停） */
function onOpenMarket() {
  snd()?.uiClick()
  gameOverInfo.value = null
  paused.value = false
  expeditionReward.value = null
  pendingRun.value = null
  started.value = false
  showMarket.value = true
}

/** 关闭黑市：回到开场界面 */
function onCloseMarket() {
  snd()?.uiClick()
  showMarket.value = false
}

/** 购买基因：校验费用 → 扣款升级 → 写档 → 立即应用到引擎 */
function onBuyGene(geneId) {
  const gene = getGene(geneId)
  if (!gene) return
  const state = getGenePurchaseState(gene, save.value.genes, save.value.drops)
  if (!state.canBuy) {
    snd()?.buyFail()
    return
  }
  save.value.drops -= state.cost
  save.value.genes[geneId] = state.level + 1
  saveSave(save.value)
  snd()?.buy() // 购买成功：金币双响
  engine.value?.setGenes(save.value.genes) // 立即生效（后续每局 reset 自动保持）
}

/** 点击技能卡片：应用技能 → 关面板 → 恢复引擎主循环 */
function onSelectSkill(skill) {
  engine.value?.applySkill(skill)
  snd()?.select() // 技能确认音
  levelUpOptions.value = null
}

/** 副反应替换面板选择（阶段十六）：replacedId 为 null = 放弃新反应 */
function onResolveSwap(newId, replacedId) {
  snd()?.select()
  reactionChoice.value = null
  engine.value?.resolveReactionSwap(newId, replacedId) // 引擎内部替换 + resume
}

/** 首融确认结果（阶段十六追加）：accepted = 吃下并融合 */
function onResolveFusion(accepted) {
  snd()?.select()
  const type = fusionConfirm.value?.type
  fusionConfirm.value = null
  engine.value?.resolveFusionConfirm(type, accepted) // 引擎：吸收/吐回 + 恢复
}

function onSelectExpeditionReward(rewardId) {
  snd()?.select()
  expeditionReward.value = null
  engine.value?.resolveExpeditionReward(rewardId)
}

/** 再来一局：重置整局状态并恢复主循环 */
function onRestart() {
  const strain = engine.value?.startingStrain || 'origin'
  pendingRun.value = {
    selection: { ...selectedRun.value },
    spec: engine.value?.startingSpec || null,
    strain,
    intro: getRunIntro(selectedRun.value, strain),
  }
}

function onChangeRules() {
  snd()?.uiClick()
  gameOverInfo.value = null
  paused.value = false
  expeditionReward.value = null
  pendingRun.value = null
  started.value = false
}

/** 任一模态面板打开中（升级/结算/替换/首融/远征奖励）——暂停与 Esc 守卫共用 */
const isModalOpen = computed(
  () =>
    !!(
      levelUpOptions.value ||
      gameOverInfo.value ||
      reactionChoice.value ||
      fusionConfirm.value ||
      expeditionReward.value ||
      pendingRun.value
    )
)

/** 手动暂停：模态面板打开时不响应（引擎已处于暂停态，叠加会多持一把暂停锁） */
function onPause() {
  if (isModalOpen.value) return
  snd()?.uiClick()
  paused.value = true
  engine.value.pause()
}

/** 继续游戏 */
function onResume() {
  snd()?.uiClick()
  paused.value = false
  engine.value.resume()
}

/** 静音开关（HUD 按钮）：作用于引擎 master 总线并持久化 */
function onToggleMute() {
  muted.value = !muted.value
  snd()?.setMuted(muted.value)
  save.value.sound = { ...save.value.sound, muted: muted.value }
  saveSave(save.value)
}

/** Esc 键：黑市 → 返回开场；游戏中 → 切换暂停（模态面板打开时不响应） */
function onKeydown(e) {
  if (e.code !== 'Escape') return
  if (!started.value && showMarket.value) {
    onCloseMarket()
    return
  }
  if (!started.value || showMarket.value) return // 序章界面不响应暂停
  if (isModalOpen.value) return
  if (paused.value) onResume()
  else onPause()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="app-root">
    <GameCanvas @ready="onEngineReady" />

    <!-- HUD 覆盖层：stats/cooldown 快照驱动的纯展示组件（前端 P2 拆分） -->
    <HudOverlay
      v-if="started"
      :stats="stats"
      :cooldown="cooldown"
      :muted="muted"
      :paused="paused"
      :buttons-visible="!levelUpOptions && !gameOverInfo && !expeditionReward"
      :toast="elementToast"
      :toast-kind="toastKind"
      :evolution="evolution"
      @toggle-mute="onToggleMute"
      @toggle-pause="onPause"
      @toggle-resume="onResume"
    />

    <!-- 升级面板：覆盖层之上，点击卡片应用技能并恢复游戏 -->
    <Transition name="modal-fade">
      <LevelUpModal v-if="levelUpOptions" :options="levelUpOptions" :level="stats.level" @select="onSelectSkill" />
    </Transition>

    <Transition name="modal-fade">
      <ExpeditionRewardModal
        v-if="expeditionReward"
        :info="expeditionReward"
        @select="onSelectExpeditionReward"
      />
    </Transition>

    <!-- 副反应替换面板（阶段十六槽位经济）：槽满时选择替换或放弃 -->
    <Transition name="modal-fade">
      <ReactionSwapModal v-if="reactionChoice" :info="reactionChoice" @resolve="onResolveSwap" />
    </Transition>

    <!-- 首融确认面板（阶段十六追加）：主形态锁定前唯一一次「吃或不吃」 -->
    <Transition name="modal-fade">
      <FusionConfirmModal v-if="fusionConfirm" :info="fusionConfirm" @resolve="onResolveFusion" />
    </Transition>

    <!-- 暂停面板 -->
    <Transition name="modal-fade">
      <PauseModal v-if="paused" @resume="onResume" @restart="onRestart" />
    </Transition>

    <!-- 游戏结束面板：显示统计 + 分数榜，点击重开 -->
    <Transition name="modal-fade">
      <GameOverModal
        v-if="gameOverInfo"
        :info="gameOverInfo"
        :best="gameOverInfo.best"
        :board="gameOverInfo.board"
        :is-new-record="isNewRecord"
        @restart="onRestart"
        @market="onOpenMarket"
        @menu="onChangeRules"
      />
    </Transition>

    <!-- 地下城黑市：局外成长（掉落物 → 永久基因） -->
    <Transition name="modal-fade">
      <BlackMarket
        v-if="showMarket"
        :drops="save.drops"
        :genes="save.genes"
        @buy="onBuyGene"
        @close="onCloseMarket"
      />
    </Transition>

    <!-- 模式选择与本局配置 -->
    <StartScreen
      v-if="!started && !showMarket"
      :records="save.records"
      :progression="save.progression"
      :preferences="save.preferences"
      @prepare="onPrepareRun"
      @market="onOpenMarket"
    />

    <Transition name="modal-fade">
      <RunIntroOverlay
        v-if="pendingRun"
        :intro="pendingRun.intro"
        @deploy="onDeployRun"
        @back="onBackFromIntro"
      />
    </Transition>
  </div>
</template>

<style scoped>
.app-root {
  position: relative;
  width: 100%;
  height: 100%;
}

/* 模态面板进出过渡（前端 P2）：子组件根节点同时受父级 scoped 样式影响，此处统一管理 */
.modal-fade-enter-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.modal-fade-leave-active {
  transition: opacity 0.12s ease;
}

.modal-fade-enter-from {
  opacity: 0;
  transform: scale(0.97);
}

.modal-fade-leave-to {
  opacity: 0;
}
</style>
