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
import RunnerHudOverlay from './components/RunnerHudOverlay.vue'
import RunnerResultModal from './components/RunnerResultModal.vue'
import TowerDefenseHudOverlay from './components/TowerDefenseHudOverlay.vue'
import TowerDefenseResultModal from './components/TowerDefenseResultModal.vue'
import TowerDefenseWorldMapModal from './components/TowerDefenseWorldMapModal.vue'
import LevelUpModal from './components/LevelUpModal.vue'
import GameOverModal from './components/GameOverModal.vue'
import PauseModal from './components/PauseModal.vue'
import StartScreen from './components/StartScreen.vue'
import SaveSlotModal from './components/SaveSlotModal.vue'
import BlackMarket from './components/BlackMarket.vue'
import ReactionSwapModal from './components/ReactionSwapModal.vue'
import FusionConfirmModal from './components/FusionConfirmModal.vue'
import ExpeditionRewardModal from './components/ExpeditionRewardModal.vue'
import EndlessDecisionModal from './components/EndlessDecisionModal.vue'
import RunIntroOverlay from './components/RunIntroOverlay.vue'
import LanAccountModal from './components/LanAccountModal.vue'
import {
  createSaveSlot,
  deleteSaveSlot,
  getActiveSave,
  getActiveSaveSlot,
  getRunRecord,
  loadSaveCatalog,
  pushScore,
  saveSaveCatalog,
  switchSaveSlot,
  updateActiveSave,
} from './game/SaveManager.js'
import { calculateMaterialReward, normalizeRunSelection, sumDrops } from './game/RunRules.js'
import { getGene, getGenePurchaseState } from './game/GenePool.js'
import { createDefaultStats } from './game/GameEngine.js'
import { getRunIntro } from './game/RunIntro.js'
import { lanApi } from './services/LanClient.js'
import { loadCampaignSave } from './game/gameplay/tower-defense/TowerDefenseSave.js'

const engine = shallowRef(null) // 仅作为挂载句柄：浅响应，避免 Vue 深代理整个引擎对象树
const started = ref(false) // 序章结束、主循环已启动
const showMarket = ref(false) // 黑市打开
const showSaveSlots = ref(false)
const showLanAccount = ref(false)
const offlineCatalog = ref(loadSaveCatalog())
saveSaveCatalog(offlineCatalog.value) // 首次启动即落盘三槽结构，避免旧档每次重复迁移
const saveCatalog = ref(offlineCatalog.value)
const save = ref(getActiveSave(saveCatalog.value)) // 当前档案（掉落物 + 基因等级 + 分数榜）
const selectedRun = ref(normalizeRunSelection(save.value.preferences))
const muted = ref(saveCatalog.value.settings?.sound?.muted || false) // 全局音效设置，不随档案切换
const elementToast = ref('') // 元素组合激活提示（短暂显示）
const toastKind = ref('info')
const evolution = ref(null) // 进化事件演出（title/subtitle/mutation）
const lanStatus = ref({ checked: false, online: false, registrationEnabled: false })
const lanAccount = ref(null)
const lanBusy = ref(false)
const lanMessage = ref('')
const lanRunTicket = ref(null)
const deployingRun = ref(false)
const publicLeaderboard = ref(null)
const publicLeaderboardKey = ref('')
let toastTimer = 0
let evolutionTimer = 0
let lanBoardTimer = 0

/** 音效快捷访问（引擎未就绪时静默） */
const snd = () => engine.value?.sound

function onUiSound(effect) {
  const sound = snd()
  if (!sound) return
  if (effect === 'select') sound.uiSelect()
  else sound.uiClick()
}

// stats：引擎快照直接整树赋值（shallowRef 不深层代理，形状由 createDefaultStats 保证）
const stats = shallowRef(createDefaultStats())
const levelUpOptions = ref(null) // 升级面板的 3 个技能选项（null = 不显示）
// 高频冷却数据（引擎 onCooldown ~10Hz 推送）：冲刺 CD / Boss 施法条是连续递变量，
// 走 2Hz 大快照会肉眼跳变，单独小通道进响应式（仅少量数字，HUD 重渲染开销可忽略）
const cooldown = ref({
  dashCd: 0,
  dashMax: 1.2,
  cast: 0,
  formationBreak: 0,
  formationBreakMax: 8,
  // F 角色专属技能（阶段十九）：skillId 为空表示 origin 无技能，HUD 据此隐藏整条
  skillId: null,
  skillName: '',
  skillCd: 0,
  skillMax: 0,
  // 资源型 F（暴食猎食点）：非 null 时 HUD 用它替换冷却条渲染
  charge: null,
})
const gameOverInfo = ref(null) // 游戏结束统计（null = 游戏中）
const isNewRecord = ref(false) // 本局是否刷新了最高纪录
const paused = ref(false) // 手动暂停状态（引擎已暂停，画面冻结）
const activeGameplay = ref('arena') // 当前玩法 id；Arena 之外的玩法共用 HUD/结算桥接
const gameplayHud = shallowRef(null)
const gameplayResult = ref(null)
const runnerActive = computed(() => activeGameplay.value === 'runner')
const towerDefenseActive = computed(() => activeGameplay.value === 'tower-defense')
const showTowerDefenseMap = ref(false)
const reactionChoice = ref(null) // 副反应替换面板数据（null = 不显示；阶段十六槽位经济）
const fusionConfirm = ref(null) // 首融确认面板数据（null = 不显示；阶段十六追加设计）
const expeditionReward = ref(null)
const endlessDecision = ref(null)
const pendingRun = ref(null)
const currentRecord = computed(() => getRunRecord(save.value, selectedRun.value))
const activeSaveSlot = computed(() => getActiveSaveSlot(saveCatalog.value))
const activeLocalSaveSlot = computed(() => getActiveSaveSlot(offlineCatalog.value))
const isLanSignedIn = computed(() => !!lanAccount.value)

function showToast(message, kind = 'info', duration = 3000) {
  toastKind.value = kind
  elementToast.value = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    elementToast.value = ''
  }, duration)
}

function cloneSave(source) {
  return JSON.parse(JSON.stringify(source))
}

function persistActiveSave() {
  if (isLanSignedIn.value) return
  updateActiveSave(offlineCatalog.value, save.value)
  saveCatalog.value = offlineCatalog.value
  saveSaveCatalog(offlineCatalog.value)
}

function applyActiveSave() {
  save.value = getActiveSave(saveCatalog.value)
  selectedRun.value = normalizeRunSelection(save.value.preferences)
  engine.value?.setGenes(save.value.genes)
}

function applyCatalog(catalog, remote = isLanSignedIn.value) {
  if (!catalog) return
  if (remote) saveCatalog.value = catalog
  else {
    offlineCatalog.value = catalog
    saveCatalog.value = offlineCatalog.value
    saveSaveCatalog(offlineCatalog.value)
  }
  applyActiveSave()
}

function applyLanPayload(payload) {
  if (payload?.account) lanAccount.value = payload.account
  if (payload?.catalog) applyCatalog(payload.catalog, true)
}

function persistFallbackSave(targetSave) {
  updateActiveSave(offlineCatalog.value, targetSave)
  saveSaveCatalog(offlineCatalog.value)
}

function buildLocalGameOver(info, options = {}) {
  const {
    persist = true,
    syncError = '',
    fallbackToOffline = false,
  } = options
  const targetSave = fallbackToOffline ? cloneSave(save.value) : persist ? save.value : cloneSave(save.value)
  const rawDrops = sumDrops(info.drops)
  const earnedDrops = calculateMaterialReward(rawDrops, selectedRun.value, info)
  targetSave.drops += earnedDrops
  const previousScore = getRunRecord(targetSave, selectedRun.value).best.score || 0
  const { rank, entry, best, board, unlocked, unlockedMode } = pushScore(targetSave, selectedRun.value, {
    ...info,
    species: info.species?.name || '',
  })
  if (fallbackToOffline) persistFallbackSave(targetSave)
  else if (persist) persistActiveSave()
  return {
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
    isNewRecord: entry.score > previousScore,
    lanSync: syncError ? 'failed' : 'offline',
    lanSyncError: syncError,
    lanLocalFallback: fallbackToOffline,
  }
}

async function settleGameOver(info) {
  endlessDecision.value = null
  lanRunTicket.value ||= null
  if (isLanSignedIn.value && lanRunTicket.value) {
    try {
      const payload = await lanApi.finishRun(lanRunTicket.value, {
        ...info,
        species: info.species?.name || '',
      })
      lanRunTicket.value = null
      applyCatalog(payload.catalog, true)
      publicLeaderboard.value = payload.leaderboard || null
      publicLeaderboardKey.value = `${info.mode}:${info.difficulty}`
      const result = payload.result
      isNewRecord.value = !!result.isNewRecord
      gameOverInfo.value = {
        ...info,
        rawDrops: result.rawDrops,
        earnedDrops: result.earnedDrops,
        score: result.score,
        scoreBreakdown: result.scoreBreakdown,
        rank: result.rank,
        entry: result.entry,
        best: result.best,
        board: result.personalBoard,
        publicLeaderboard: payload.leaderboard,
        unlocked: result.unlocked,
        unlockedMode: result.unlockedMode,
        lanSync: 'synced',
      }
      if (isNewRecord.value) snd()?.newRecord()
      return
    } catch (error) {
      const message = error?.message || '公共榜同步失败'
      lanMessage.value = message
      const fallback = buildLocalGameOver(info, { persist: false, syncError: message, fallbackToOffline: true })
      gameOverInfo.value = fallback
      isNewRecord.value = !!fallback.isNewRecord
      if (isNewRecord.value) snd()?.newRecord()
      showToast(`局域网结算失败，已保存到本机档案：${message}`, 'danger', 5200)
      return
    }
  }

  gameOverInfo.value = buildLocalGameOver(info, true)
  isNewRecord.value = !!gameOverInfo.value.isNewRecord
  if (isNewRecord.value) snd()?.newRecord()
}

function onEngineReady(eng) {
  engine.value = eng
  eng.setGenes(save.value.genes) // 开局应用黑市基因
  eng.sound.setMuted(muted.value) // 应用持久化的静音设置
  // 引擎快照直接整树赋值：形状由 createDefaultStats 与 _pushStats 共同保证，
  // 不再手工逐字段拷贝（消除双写漂移——fps 死字段就是这么来的）
  eng.onStats = (s) => {
    stats.value = s
  }
  // 高频冷却桥接（~10Hz）：冲刺、Boss 施法与破阵追击条的平滑数据源
  eng.onCooldown = (c) => {
    cooldown.value = c
  }
  eng.onGameplayHud = (snapshot) => {
    if (snapshot?.mode === 'runner' || snapshot?.mode === 'tower-defense') {
      gameplayHud.value = snapshot
    }
  }
  eng.onGameplayFinished = (result) => {
    if (result?.mode !== 'runner' && result?.mode !== 'tower-defense') return
    paused.value = false
    activeGameplay.value = result.mode
    if (result.mode === 'runner') {
      gameplayResult.value = result
    }
  }
  // 引擎升级暂停后回调：把 3 个技能选项交给 Vue 渲染面板
  eng.onLevelUp = (options) => {
    levelUpOptions.value = options
  }
  // 引擎玩家死亡后回调：离线本地入榜；LAN 登录时提交服务器，返回公共榜与远程档案。
  eng.onGameOver = (info) => {
    settleGameOver(info)
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
  eng.onBossGroupSpawn = (group) => {
    toastKind.value = 'danger'
    elementToast.value = `${group.label} · ${group.total} 名首领参战`
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      elementToast.value = ''
    }, group.finale ? 4200 : 3200)
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
    if (event.kind === 'expedition-stage') {
      clearTimeout(toastTimer)
      elementToast.value = ''
      return
    }
    toastKind.value = event.kind === 'expedition-clear' || event.kind === 'zone' ||
      event.kind === 'calamity' || event.kind === 'bounty-complete' ||
      event.kind === 'formation-break'
      ? 'success'
      : 'danger'
    elementToast.value = event.kind === 'warning'
      ? '终局勇者正在集结 · 30 秒后降临'
      : event.kind === 'finale'
      ? `${event.boss} 降临 · 击败他才能通关`
      : event.kind === 'zone'
      ? `战区推进 · ${event.zone}`
      : event.kind === 'calamity'
      ? `灾变已叠加 · ${event.name} Lv.${event.level}`
      : event.kind === 'bounty-complete'
      ? `悬赏完成 · ${event.reward}`
      : event.kind === 'bounty-failed'
      ? `悬赏失效 · ${event.name}`
      : event.kind === 'formation-break'
      ? `${event.name} · 追击 ${event.duration} 秒（攻速 +25% / 移速 +15%）`
      : event.kind === 'expedition-guardian'
      ? `${event.boss} 阻断去路 · ${event.special}`
      : event.kind === 'expedition-clear'
      ? `第 ${event.stage} 章 · ${event.title} 已完成`
      : ''
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      elementToast.value = ''
    }, event.kind === 'finale' || event.kind === 'expedition-guardian' ? 4200 : 3200)
  }
  eng.onExpeditionReward = (payload) => {
    expeditionReward.value = payload
  }
  eng.onEndlessDecision = (payload) => {
    endlessDecision.value = payload
  }
}

function lanErrorMessage(error) {
  return error?.message || '局域网请求失败'
}

async function loadPublicLeaderboard(selection = selectedRun.value) {
  const normalized = normalizeRunSelection(selection)
  const key = `${normalized.mode}:${normalized.difficulty}`
  publicLeaderboardKey.value = key
  if (!lanStatus.value.online) {
    publicLeaderboard.value = null
    return
  }
  try {
    const payload = await lanApi.leaderboard({ ...normalized, limit: 10 })
    if (publicLeaderboardKey.value === key) publicLeaderboard.value = payload.leaderboard || null
  } catch {
    if (publicLeaderboardKey.value === key) publicLeaderboard.value = null
  }
}

/** 停留在开始界面时每 20s 轮询公共榜：朋友的新成绩无需手动刷新（隐藏标签页不请求）。 */
function startLanBoardPolling() {
  stopLanBoardPolling()
  lanBoardTimer = setInterval(() => {
    if (!document.hidden && lanStatus.value.online && !started.value && !showMarket.value) {
      loadPublicLeaderboard(selectedRun.value)
    }
  }, 20000)
}

function stopLanBoardPolling() {
  clearInterval(lanBoardTimer)
  lanBoardTimer = 0
}

async function refreshLanSession() {
  try {
    const status = await lanApi.status()
    lanStatus.value = {
      checked: true,
      online: true,
      registrationEnabled: status.registrationEnabled !== false,
      serverTime: status.serverTime,
    }
    const payload = await lanApi.me()
    if (payload.account) applyLanPayload(payload)
    else {
      lanAccount.value = null
      saveCatalog.value = offlineCatalog.value
      applyActiveSave()
    }
    await loadPublicLeaderboard(selectedRun.value)
  } catch {
    lanStatus.value = { checked: true, online: false, registrationEnabled: false }
    lanAccount.value = null
    publicLeaderboard.value = null
    saveCatalog.value = offlineCatalog.value
    applyActiveSave()
  }
}

function onOpenLanAccount() {
  snd()?.uiClick()
  lanMessage.value = ''
  showLanAccount.value = true
  refreshLanSession()
}

async function onLanAuth(kind, credentials) {
  lanBusy.value = true
  lanMessage.value = ''
  try {
    const payload = await lanApi[kind](credentials)
    applyLanPayload(payload)
    showLanAccount.value = false
    showToast(`已登录局域网账号：${payload.account.displayName || payload.account.username}`, 'success')
    await loadPublicLeaderboard(selectedRun.value)
  } catch (error) {
    lanMessage.value = lanErrorMessage(error)
  } finally {
    lanBusy.value = false
  }
}

function onLanLogin(credentials) {
  return onLanAuth('login', credentials)
}

function onLanRegister(credentials) {
  return onLanAuth('register', credentials)
}

async function onLanLogout() {
  lanBusy.value = true
  try {
    await lanApi.logout()
  } catch {
    /* 退出登录以本地状态清理为准。 */
  } finally {
    lanBusy.value = false
    lanAccount.value = null
    lanRunTicket.value = null
    saveCatalog.value = offlineCatalog.value
    applyActiveSave()
    showLanAccount.value = false
    showToast('已切回本地单机档案', 'info')
  }
}

async function onImportLocalSlot() {
  const localSlot = activeLocalSaveSlot.value
  if (!localSlot || !isLanSignedIn.value) return
  lanBusy.value = true
  lanMessage.value = ''
  try {
    const payload = await lanApi.importSlot(localSlot)
    applyCatalog(payload.catalog, true)
    showToast('本机档案已导入当前局域网档案', 'success')
  } catch (error) {
    lanMessage.value = lanErrorMessage(error)
  } finally {
    lanBusy.value = false
  }
}

async function syncRunPreferences(normalized) {
  save.value.preferences = { ...normalized }
  if (!isLanSignedIn.value) {
    persistActiveSave()
    return true
  }
  try {
    const payload = await lanApi.updatePreferences(normalized)
    applyCatalog(payload.catalog, true)
    return true
  } catch (error) {
    const message = lanErrorMessage(error)
    lanMessage.value = message
    showToast(`局域网档案同步失败：${message}`, 'danger', 3800)
    return false
  }
}

async function runLanCatalogAction(action, successMessage) {
  lanBusy.value = true
  lanMessage.value = ''
  try {
    const payload = await action()
    applyCatalog(payload.catalog, true)
    showSaveSlots.value = false
    snd()?.uiSelect()
    if (successMessage) showToast(successMessage, 'success')
  } catch (error) {
    lanMessage.value = lanErrorMessage(error)
    showLanAccount.value = true
  } finally {
    lanBusy.value = false
  }
}

/** 选择配置后先进入战前简报，确认按钮才真正消耗一次开局。 */
async function onPrepareRun(selection) {
  const normalized = normalizeRunSelection(selection || save.value.preferences)
  const strain = selection?.strain || 'origin'
  selectedRun.value = normalized
  if (!(await syncRunPreferences(normalized))) return
  pendingRun.value = {
    selection: normalized,
    strain,
    intro: getRunIntro(normalized, strain),
  }
  loadPublicLeaderboard(normalized)
}

/** 战前简报确认：先 reset 再 start，避免结算/黑市返回后残留死亡与暂停锁。 */
async function onDeployRun() {
  const plan = pendingRun.value
  if (!plan || !engine.value || deployingRun.value) return
  deployingRun.value = true
  if (isLanSignedIn.value) {
    try {
      const payload = await lanApi.startRun(plan.selection)
      lanRunTicket.value = payload.ticket?.id || null
    } catch (error) {
      const message = lanErrorMessage(error)
      lanMessage.value = message
      showToast(`无法开始局域网行动：${message}`, 'danger', 4200)
      deployingRun.value = false
      return
    }
  } else {
    lanRunTicket.value = null
  }
  snd()?.gameStart()
  activeGameplay.value = 'arena'
  gameplayHud.value = null
  gameplayResult.value = null
  gameOverInfo.value = null
  paused.value = false
  expeditionReward.value = null
  endlessDecision.value = null
  engine.value.configureGameplay('arena') // 从 Runner 独立玩法返回后必须显式切回 Arena 管线
  engine.value.configureRun(plan.selection)
  engine.value.applyStartingStrain(plan.strain)
  engine.value.reset()
  engine.value.start()
  started.value = true
  pendingRun.value = null
  deployingRun.value = false
}

const currentRunnerSubmode = ref('marathon')

/**
 * 独立玩法：Runner（三线推进射击）。
 * 不入档、不上榜、不创建 LAN 行动票据、不改存档 preferences——
 * 仅切换 Gameplay 到 runner 并走独立会话生命周期。
 */
function onStartRunner(submode = 'marathon') {
  if (!engine.value) return
  snd()?.uiSelect()
  currentRunnerSubmode.value = (typeof submode === 'string' && submode) ? submode : 'marathon'
  // 清理局内 UI 状态（与 onDeployRun/onChangeRules 同一套复位口径）
  gameOverInfo.value = null
  gameplayResult.value = null
  gameplayHud.value = null
  paused.value = false
  levelUpOptions.value = null
  reactionChoice.value = null
  fusionConfirm.value = null
  expeditionReward.value = null
  endlessDecision.value = null
  pendingRun.value = null
  evolution.value = null
  elementToast.value = ''
  lanRunTicket.value = null
  activeGameplay.value = 'runner'
  engine.value.configureGameplay('runner')
  engine.value.resetGameplaySession(undefined, currentRunnerSubmode.value)
  engine.value.start()
  started.value = true
}

/** 独立玩法：固定路径塔防闯关战役大地图 */
function onStartTowerDefense() {
  snd()?.uiSelect()
  showTowerDefenseMap.value = true
}

function onStartTowerDefenseStage(stageId = 1) {
  if (!engine.value) return
  snd()?.uiSelect()
  gameOverInfo.value = null
  gameplayResult.value = null
  gameplayHud.value = null
  paused.value = false
  levelUpOptions.value = null
  reactionChoice.value = null
  fusionConfirm.value = null
  expeditionReward.value = null
  endlessDecision.value = null
  pendingRun.value = null
  evolution.value = null
  elementToast.value = ''
  lanRunTicket.value = null
  activeGameplay.value = 'tower-defense'
  engine.value.configureGameplay('tower-defense')
  engine.value.gameplay.loadStage(stageId)
  engine.value.start()
  started.value = true
  showTowerDefenseMap.value = false
}

function onSelectTower(typeId) {
  engine.value?.gameplay?.selectTowerType?.(typeId)
}

function onSetTowerStrategy(strategyId) {
  engine.value?.gameplay?.setSelectedTowerStrategy?.(strategyId)
}

function onSelectTowerBranch(branchId) {
  engine.value?.gameplay?.selectTowerBranch?.(branchId)
}

function onUpgradeTower() {
  engine.value?.gameplay?.upgradeSelectedTower?.()
}

function onSellTower() {
  engine.value?.gameplay?.sellSelectedTower?.()
}

function onClearObstacle(slotIndex) {
  engine.value?.gameplay?.clearObstacle?.(slotIndex)
}

function onTriggerTrap(trapId) {
  engine.value?.gameplay?.triggerTrap?.(trapId)
}

function onRelocateTower(payload) {
  engine.value?.gameplay?.relocateTower?.(payload?.from, payload?.to)
}

function onPetTower(slotIndex) {
  engine.value?.gameplay?.petTower?.(slotIndex)
}

/** 启动无尽试炼：使用玩家最新解锁章节（上限第 20 关）的地图与机关 */
function onStartTowerDefenseEndless() {
  if (!engine.value) return
  snd()?.uiSelect()
  gameOverInfo.value = null
  gameplayResult.value = null
  gameplayHud.value = null
  paused.value = false
  levelUpOptions.value = null
  reactionChoice.value = null
  fusionConfirm.value = null
  expeditionReward.value = null
  endlessDecision.value = null
  pendingRun.value = null
  evolution.value = null
  elementToast.value = ''
  lanRunTicket.value = null
  const baseStage = Math.min(20, Math.max(1, Number(loadCampaignSave()?.unlockedStage) || 1))
  activeGameplay.value = 'tower-defense'
  engine.value.configureGameplay('tower-defense')
  engine.value.gameplay.startEndlessMode(baseStage)
  engine.value.start()
  started.value = true
  showTowerDefenseMap.value = false
}

function onSelectTowerDefenseMutation(mutationId) {
  engine.value?.gameplay?.selectMutation?.(mutationId)
  snd()?.levelUp?.()
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
  endlessDecision.value = null
  pendingRun.value = null
  started.value = false
  showMarket.value = true
}

/** 关闭黑市：回到开场界面 */
function onCloseMarket() {
  snd()?.uiClick()
  showMarket.value = false
}

function onOpenSaveSlots() {
  snd()?.uiClick()
  showSaveSlots.value = true
}

function onCloseSaveSlots() {
  snd()?.uiClick()
  showSaveSlots.value = false
}

function onCreateSaveSlot(index) {
  if (isLanSignedIn.value) {
    runLanCatalogAction(() => lanApi.createSlot(index), '局域网档案已创建')
    return
  }
  persistActiveSave()
  if (!createSaveSlot(offlineCatalog.value, index)) return
  saveSaveCatalog(offlineCatalog.value)
  saveCatalog.value = offlineCatalog.value
  applyActiveSave()
  showSaveSlots.value = false
  snd()?.uiSelect()
}

function onSwitchSaveSlot(id) {
  if (id === saveCatalog.value.activeSlotId) {
    showSaveSlots.value = false
    return
  }
  if (isLanSignedIn.value) {
    runLanCatalogAction(() => lanApi.switchSlot(id), '已切换局域网档案')
    return
  }
  persistActiveSave()
  if (!switchSaveSlot(offlineCatalog.value, id)) return
  saveSaveCatalog(offlineCatalog.value)
  saveCatalog.value = offlineCatalog.value
  applyActiveSave()
  showSaveSlots.value = false
  snd()?.uiSelect()
}

function onDeleteSaveSlot(id) {
  if (isLanSignedIn.value) {
    runLanCatalogAction(() => lanApi.deleteSlot(id), '局域网档案已删除')
    return
  }
  const previousActive = offlineCatalog.value.activeSlotId
  if (!deleteSaveSlot(offlineCatalog.value, id)) return
  saveSaveCatalog(offlineCatalog.value)
  saveCatalog.value = offlineCatalog.value
  if (previousActive !== offlineCatalog.value.activeSlotId) applyActiveSave()
  snd()?.uiClick()
}

/** 购买基因：校验费用 → 扣款升级 → 写档 → 立即应用到引擎 */
async function onBuyGene(geneId) {
  const gene = getGene(geneId)
  if (!gene) return
  const state = getGenePurchaseState(gene, save.value.genes, save.value.drops)
  if (!state.canBuy) {
    snd()?.buyFail()
    return
  }
  if (isLanSignedIn.value) {
    try {
      const payload = await lanApi.buyGene(geneId)
      applyCatalog(payload.catalog, true)
      snd()?.buy()
    } catch (error) {
      snd()?.buyFail()
      showToast(lanErrorMessage(error), 'danger', 3200)
    }
    return
  }
  save.value.drops -= state.cost
  save.value.genes[geneId] = state.level + 1
  persistActiveSave()
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

function onSelectEndlessCalamity(id) {
  endlessDecision.value = null
  snd()?.select()
  engine.value?.resolveEndlessCalamity(id)
}

function onSelectEndlessBounty(id) {
  endlessDecision.value = null
  snd()?.select()
  engine.value?.resolveEndlessBounty(id)
}

function onResolveEndlessCheckpoint(action) {
  endlessDecision.value = null
  snd()?.select()
  engine.value?.resolveEndlessCheckpoint(action)
}

/** 再来一局：重置整局状态并恢复主循环 */
function onRestart() {
  engine.value?.stop()
  gameOverInfo.value = null
  endlessDecision.value = null
  paused.value = false
  const strain = engine.value?.startingStrain || 'origin'
  pendingRun.value = {
    selection: { ...selectedRun.value },
    strain,
    intro: getRunIntro(selectedRun.value, strain),
  }
}

/** Runner 重试：保留模式、不经过 Arena 战前简报，也不写入档案。 */
function onRestartRunner() {
  if (!engine.value) return
  snd()?.uiSelect()
  gameplayResult.value = null
  paused.value = false
  activeGameplay.value = 'runner'
  if (engine.value.gameplayId !== 'runner') engine.value.configureGameplay('runner')
  engine.value.resetGameplaySession(undefined, currentRunnerSubmode.value)
  engine.value.start()
  started.value = true
}

/** 塔防重试：保留独立玩法规则并重建完整防线会话。 */
function onRestartTowerDefense() {
  if (!engine.value) return
  snd()?.uiSelect()
  gameplayResult.value = null
  paused.value = false
  activeGameplay.value = 'tower-defense'
  if (engine.value.gameplayId !== 'tower-defense') engine.value.configureGameplay('tower-defense')
  engine.value.resetGameplaySession()
  engine.value.start()
  started.value = true
}

function onRestartCurrent() {
  if (activeGameplay.value === 'runner') onRestartRunner()
  else if (activeGameplay.value === 'tower-defense') onRestartTowerDefense()
  else onRestart()
}

function onChangeRules() {
  snd()?.uiClick()
  engine.value?.stop()
  lanRunTicket.value = null
  activeGameplay.value = 'arena'
  gameplayHud.value = null
  gameplayResult.value = null
  levelUpOptions.value = null
  gameOverInfo.value = null
  paused.value = false
  reactionChoice.value = null
  fusionConfirm.value = null
  expeditionReward.value = null
  endlessDecision.value = null
  pendingRun.value = null
  evolution.value = null
  elementToast.value = ''
  started.value = false
}

/** 暂停菜单放弃本局：不触发结算，直接清理局内界面并返回模式选择。 */
function onAbandonRun() {
  onChangeRules()
}

/** 任一模态面板打开中（升级/结算/替换/首融/远征奖励）——暂停与 Esc 守卫共用 */
const isModalOpen = computed(
  () =>
    !!(
      levelUpOptions.value ||
      gameOverInfo.value ||
      gameplayResult.value ||
      reactionChoice.value ||
      fusionConfirm.value ||
      expeditionReward.value ||
      endlessDecision.value ||
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
  offlineCatalog.value.settings ||= {}
  offlineCatalog.value.settings.sound = { muted: muted.value }
  if (!isLanSignedIn.value) saveCatalog.value = offlineCatalog.value
  saveSaveCatalog(offlineCatalog.value)
}

/** Esc 键：黑市 → 返回开场；游戏中 → 切换暂停（模态面板打开时不响应） */
function onKeydown(e) {
  if (e.code !== 'Escape') return
  if (!started.value && showSaveSlots.value) return // 档案面板自行处理 Esc 与删除确认
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
  refreshLanSession()
  startLanBoardPolling()
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  stopLanBoardPolling()
})
</script>

<template>
  <div class="app-root">
    <GameCanvas @ready="onEngineReady" />

    <!-- HUD 覆盖层：stats/cooldown 快照驱动的纯展示组件（前端 P2 拆分） -->
    <HudOverlay
      v-if="started && !towerDefenseActive"
      :stats="stats"
      :cooldown="cooldown"
      :variant="activeGameplay === 'arena' ? 'arena' : 'runner'"
      :muted="muted"
      :paused="paused"
      :buttons-visible="!levelUpOptions && !gameOverInfo && !gameplayResult && !expeditionReward && !endlessDecision"
      :toast="elementToast"
      :toast-kind="toastKind"
      :evolution="evolution"
      @toggle-mute="onToggleMute"
      @toggle-pause="onPause"
      @toggle-resume="onResume"
    />

    <RunnerHudOverlay
      v-if="started && runnerActive && gameplayHud"
      :hud="gameplayHud"
      @activate-fever="engine?.gameplay?.activateFever?.()"
    />

    <TowerDefenseHudOverlay
      v-if="started && towerDefenseActive && gameplayHud"
      :hud="gameplayHud"
      :muted="muted"
      :paused="paused"
      @select-tower="onSelectTower"
      @set-tower-strategy="onSetTowerStrategy"
      @select-tower-branch="onSelectTowerBranch"
      @upgrade="onUpgradeTower"
      @sell="onSellTower"
      @clear-obstacle="onClearObstacle"
      @trigger-trap="onTriggerTrap"
      @relocate-tower="onRelocateTower"
      @pet-tower="onPetTower"
      @deselect="engine?.gameplay?.selectSlot?.(-1)"
      @toggle-mute="onToggleMute"
      @toggle-pause="onPause"
      @toggle-resume="onResume"
      @open-map="showTowerDefenseMap = true"
      @next-stage="onStartTowerDefenseStage"
      @restart-stage="onRestartTowerDefense"
      @advance-tutorial="engine?.gameplay?.advanceTutorial?.()"
      @skip-tutorial="engine?.gameplay?.skipTutorial?.()"
      @select-mutation="onSelectTowerDefenseMutation"
      @skip-mutation="engine?.gameplay?.skipMutationOffer?.()"
      @cycle-speed="engine?.gameplay?.cycleGameSpeed?.()"
      @call-early="engine?.gameplay?.callNextWaveEarly?.()"
    />

    <!-- 升级面板：覆盖层之上，点击卡片应用技能并恢复游戏 -->
    <Transition name="modal-fade">
      <LevelUpModal v-if="levelUpOptions" :options="levelUpOptions" :level="stats.level" :role-spec="stats.roleSpec" :can-use-elements="stats.canUseElements" @select="onSelectSkill" />
    </Transition>

    <Transition name="modal-fade">
      <ExpeditionRewardModal
        v-if="expeditionReward"
        :info="expeditionReward"
        @select="onSelectExpeditionReward"
      />
    </Transition>

    <Transition name="modal-fade">
      <EndlessDecisionModal
        v-if="endlessDecision"
        :info="endlessDecision"
        @select-calamity="onSelectEndlessCalamity"
        @select-bounty="onSelectEndlessBounty"
        @resolve-checkpoint="onResolveEndlessCheckpoint"
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
      <PauseModal
        v-if="paused"
        @resume="onResume"
        @restart="onRestartCurrent"
        @quit="onAbandonRun"
      />
    </Transition>


    <Transition name="modal-fade">
      <RunnerResultModal
        v-if="gameplayResult?.mode === 'runner'"
        :info="gameplayResult"
        @restart="onRestartRunner"
        @menu="onChangeRules"
      />
    </Transition>

    <Transition name="modal-fade">
      <TowerDefenseResultModal
        v-if="gameplayResult?.mode === 'tower-defense'"
        :info="gameplayResult"
        @restart="onRestartTowerDefense"
        @menu="onChangeRules"
      />
    </Transition>

    <!-- 游戏结束面板：显示统计 + 分数榜，点击重开 -->
    <Transition name="modal-fade">
      <GameOverModal
        v-if="gameOverInfo"
        :info="gameOverInfo"
        :best="gameOverInfo.best"
        :board="gameOverInfo.board"
        :public-board="gameOverInfo.publicLeaderboard"
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
      :key="saveCatalog.activeSlotId"
      :records="save.records"
      :progression="save.progression"
      :preferences="save.preferences"
      :active-slot="activeSaveSlot"
      :lan-account="lanAccount"
      :lan-status="lanStatus"
      :public-leaderboard="publicLeaderboard"
      @prepare="onPrepareRun"
      @runner="onStartRunner"
      @tower-defense="onStartTowerDefense"
      @market="onOpenMarket"
      @profiles="onOpenSaveSlots"
      @account="onOpenLanAccount"
      @leaderboard="loadPublicLeaderboard"
      @ui-sound="onUiSound"
    />

    <Transition name="modal-fade">
      <SaveSlotModal
        v-if="showSaveSlots"
        :slots="saveCatalog.slots"
        :active-slot-id="saveCatalog.activeSlotId"
        @close="onCloseSaveSlots"
        @create="onCreateSaveSlot"
        @switch="onSwitchSaveSlot"
        @delete="onDeleteSaveSlot"
      />
    </Transition>

    <Transition name="modal-fade">
      <TowerDefenseWorldMapModal
        v-if="showTowerDefenseMap"
        @start-stage="onStartTowerDefenseStage"
        @start-endless="onStartTowerDefenseEndless"
        @close="showTowerDefenseMap = false"
      />
    </Transition>

    <Transition name="modal-fade">
      <RunIntroOverlay
        v-if="pendingRun"
        :intro="pendingRun.intro"
        @deploy="onDeployRun"
        @back="onBackFromIntro"
      />
    </Transition>

    <Transition name="modal-fade">
      <LanAccountModal
        v-if="showLanAccount"
        :account="lanAccount"
        :status="lanStatus"
        :active-slot="activeSaveSlot"
        :local-slot="activeLocalSaveSlot"
        :busy="lanBusy"
        :message="lanMessage"
        @close="showLanAccount = false"
        @login="onLanLogin"
        @register="onLanRegister"
        @logout="onLanLogout"
        @import-local="onImportLocalSlot"
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
