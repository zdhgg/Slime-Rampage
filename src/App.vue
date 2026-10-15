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
import SpellCoreModal from './components/SpellCoreModal.vue'
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
import AccountModal from './components/AccountModal.vue'
import LeaderboardModal from './components/LeaderboardModal.vue'
import PlayerRecordsModal from './components/PlayerRecordsModal.vue'
import { createSettlementQueue } from './services/SettlementQueue.js'
import { createCampaignSave } from './game/AccountRules.js'
import {
  defaultSave,
  getActiveSave,
  getActiveSaveSlot,
  getRunRecord,
  loadSaveCatalog,
  pushScore,
  saveSaveCatalog,
} from './game/SaveManager.js'
import { calculateMaterialReward, normalizeRunSelection, sumDrops } from './game/RunRules.js'
import { createDefaultStats } from './game/GameEngine.js'
import { getRunIntro } from './game/RunIntro.js'
import { normalizeSpellElement } from './game/SpellRules.js'
import { accountApi } from './services/AccountClient.js'
import { loadCampaignSave, loadLegacyCampaign, setAccountCampaign } from './game/gameplay/tower-defense/TowerDefenseSave.js'

const engine = shallowRef(null) // 仅作为挂载句柄：浅响应，避免 Vue 深代理整个引擎对象树
const started = ref(false) // 序章结束、主循环已启动
const showMarket = ref(false) // 黑市打开
const showSaveSlots = ref(false)
const showAccount = ref(false)
const offlineCatalog = ref(loadSaveCatalog())
saveSaveCatalog(offlineCatalog.value) // 首次启动即落盘三槽结构，避免旧档每次重复迁移
const emptyCatalog = () => ({ version: 5, activeSlotId: 'slot-1', slots: [{ id: 'slot-1', name: '主战场档案', data: defaultSave() }, null, null] })
const saveCatalog = ref(emptyCatalog())
const save = ref(getActiveSave(saveCatalog.value)) // 当前档案（掉落物 + 基因等级 + 分数榜）
const selectedRun = ref(normalizeRunSelection(save.value.preferences))
const muted = ref(offlineCatalog.value.settings?.sound?.muted || false) // 全局音效设置，不随档案切换
const elementToast = ref('') // 元素组合激活提示（短暂显示）
const toastKind = ref('info')
const evolution = ref(null) // 进化事件演出（title/subtitle/mutation）
const serviceStatus = ref({ checked: false, online: false, registrationEnabled: false })
const account = ref(null)
const accountBusy = ref(false)
const accountMessage = ref('')
const deployingRun = ref(false)
const publicLeaderboard = ref(null)
const publicLeaderboardKey = ref('')
let toastTimer = 0
let evolutionTimer = 0
let boardTimer = 0
let sessionRequestId = 0
const showLeaderboard = ref(false)
const showPlayerRecords = ref(false)
const accountData = ref({ campaign: createCampaignSave(), records: {} })
const settlementQueue = createSettlementQueue()
const pendingSettlements = ref([])
const syncing = ref(false)
const queueDurable = ref(true)
const runContext = ref(null)
setAccountCampaign(createCampaignSave())

function updateQueueState() {
  pendingSettlements.value = [...settlementQueue.list(account.value?.id)]
  syncing.value = settlementQueue.running
  queueDurable.value = settlementQueue.durable
}

function applyAccountData(data) {
  if (!data) return
  accountData.value = data
  setAccountCampaign(data.campaign, queueTutorialCompletion)
}

function queueTutorialCompletion() {
  if (!account.value) return
  settlementQueue.add({ accountId: account.value.id, ticketId: `tutorial-${account.value.id}`,
    gameplay: 'tower-defense', kind: 'tutorial', run: {} })
  updateQueueState()
  flushSettlements()
}

async function flushSettlements(retryFailed = false) {
  const accountId = account.value?.id
  if (!accountId) return
  await settlementQueue.flush(accountId,
    job => job.kind === 'tutorial' ? accountApi.completeTutorial() : accountApi.finishRun(job.ticketId, job.run),
    (job, payload) => {
      if (job.kind === 'tutorial') {
        accountData.value.campaign.tutorialCompleted = true
        return
      }
      applyAccountData(payload.accountData)
      applyCatalog(payload.catalog, true)
      if (gameOverInfo.value?.ticketId === job.ticketId) {
        const result = payload.result
        gameOverInfo.value = { ...gameOverInfo.value, ...result, best: result.best,
          board: result.personalBoard, publicLeaderboard: payload.leaderboard, accountSync: 'synced', accountSyncError: '' }
        isNewRecord.value = !!result.isNewRecord
      }
      if (gameplayResult.value?.ticketId === job.ticketId) {
        gameplayResult.value = { ...gameplayResult.value, accountSync: 'synced', rank: payload.leaderboard?.currentRank }
      }
      if (gameplayHud.value?.ticketId === job.ticketId) {
        gameplayHud.value = { ...gameplayHud.value, accountSync: 'synced' }
      }
      loadPublicLeaderboard(selectedRun.value)
    }, { retryFailed, isCurrent: () => account.value?.id === accountId, onChange: updateQueueState })
  const pending = settlementQueue.list(accountId)
  if (pending.some(job => job.status === 401) && account.value?.id === accountId) {
    showPlayerRecords.value = false
    showLeaderboard.value = false
    accountMessage.value = '登录已过期，请重新登录后同步游戏记录'
    showAccount.value = true
    account.value = null
    updateQueueState()
  }
  if (gameOverInfo.value?.ticketId && pending.some(job => job.ticketId === gameOverInfo.value.ticketId)) {
    const job = pending.find(job => job.ticketId === gameOverInfo.value.ticketId)
    gameOverInfo.value = { ...gameOverInfo.value, accountSync: 'pending', accountSyncError: job.error }
  }
}

function requireAccount() {
  if (account.value) return true
  onOpenAccount()
  return false
}

async function beginAccountRun(selection) {
  if (!requireAccount() || deployingRun.value) return false
  const accountId = account.value.id
  deployingRun.value = true
  try {
    await flushSettlements()
    if (account.value?.id !== accountId) return false
    if (settlementQueue.list(account.value?.id).length || settlementQueue.running) {
      showToast('请先同步上一局记录，再开始新的行动', 'danger', 4200)
      if (started.value && engine.value?.running) { engine.value.pause(); paused.value = true }
      showPlayerRecords.value = true
      return false
    }
    const payload = await accountApi.startRun(selection)
    if (account.value?.id !== accountId) return false
    runContext.value = { ...selection, accountId: account.value.id, ticketId: payload.ticket.id }
    return true
  } catch (error) {
    if (error.status === 401) {
      account.value = null
      showAccount.value = true
      accountMessage.value = '登录已过期，请重新登录后继续'
    }
    showToast(error.message, 'danger', 4200)
    return false
  } finally { deployingRun.value = false }
}

function queueRunResult(info, gameplay) {
  const context = runContext.value
  if (!context || context.accountId !== account.value?.id) return null
  settlementQueue.add({ accountId: context.accountId, ticketId: context.ticketId, gameplay, run: info })
  runContext.value = null
  updateQueueState()
  return context.ticketId
}

function onOpenLeaderboard() {
  showLeaderboard.value = true
}

function onOpenPlayerRecords() {
  if (!requireAccount()) return
  showAccount.value = false
  showPlayerRecords.value = true
}

async function discardSettlement(ticketId) {
  settlementQueue.discard(account.value?.id, ticketId)
  updateQueueState()
  const payload = await accountApi.me().catch(() => null)
  if (payload?.account?.id === account.value?.id) applyAccountPayload(payload)
}


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
const spellCoreReward = shallowRef(null)
// 高频冷却数据（引擎 onCooldown ~10Hz 推送）：冲刺 CD / Boss 施法条是连续递变量，
// 走 2Hz 大快照会肉眼跳变，单独小通道进响应式（仅少量数字，HUD 重渲染开销可忽略）
const cooldown = ref({
  cast: 0,
  formationBreak: 0,
  formationBreakMax: 8,
  // 所有角色共享空格主动技能入口；暴食显示猎食点，其余显示冷却。
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
const isSignedIn = computed(() => !!account.value)

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

function applyActiveSave() {
  save.value = getActiveSave(saveCatalog.value)
  selectedRun.value = normalizeRunSelection(save.value.preferences)
  engine.value?.setGenes(save.value.genes)
}

function applyCatalog(catalog) {
  if (!catalog) return
  saveCatalog.value = catalog
  applyActiveSave()
}

function applyAccountPayload(payload) {
  if (payload?.account) account.value = payload.account
  if (payload?.catalog) applyCatalog(payload.catalog, true)
  if (payload?.accountData) applyAccountData(payload.accountData)
  updateQueueState()
}

function previewGameOver(info) {
  const targetSave = cloneSave(save.value)
  const rawDrops = sumDrops(info.drops)
  const earnedDrops = calculateMaterialReward(rawDrops, selectedRun.value, info)
  const scored = pushScore(targetSave, selectedRun.value, { ...info, species: info.species?.name || '' })
  return { ...info, rawDrops, earnedDrops, score: scored.entry.score, scoreBreakdown: scored.entry.breakdown,
    entry: scored.entry, best: scored.best, board: scored.board, accountSync: 'pending' }
}

async function settleGameOver(info) {
  endlessDecision.value = null
  const run = { ...info, species: info.species?.name || '' }
  const ticketId = queueRunResult(run, 'arena')
  gameOverInfo.value = { ...previewGameOver(info), ticketId }
  await flushSettlements()
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
    if (snapshot?.state === 'finished' && gameplayHud.value?.ticketId) snapshot = { ...snapshot, ticketId: gameplayHud.value.ticketId, accountSync: gameplayHud.value.accountSync }
    if (snapshot?.mode === 'runner' || snapshot?.mode === 'tower-defense') {
      gameplayHud.value = snapshot
    }
  }
  eng.onGameplayFinished = (result) => {
    if (result?.mode !== 'runner' && result?.mode !== 'tower-defense') return
    paused.value = false
    activeGameplay.value = result.mode
    const ticketId = queueRunResult(result, result.mode)
    if (result.mode === 'runner') gameplayResult.value = { ...result, ticketId, accountSync: 'pending' }
    else gameplayHud.value = { ...gameplayHud.value, ticketId, accountSync: 'pending' }
    flushSettlements()

  }
  // 引擎升级暂停后回调：把 3 个技能选项交给 Vue 渲染面板
  eng.onLevelUp = (options) => {
    levelUpOptions.value = options
  }
  eng.onSpellCore = info => { spellCoreReward.value = info }
  // 引擎玩家死亡后回调：提交账号结算队列，服务器确认后更新成长与公共榜。
  eng.onGameOver = (info) => {
    spellCoreReward.value = null
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

function accountErrorMessage(error) {
  return error?.message || '账号请求失败'
}

async function loadPublicLeaderboard(selection = selectedRun.value) {
  const normalized = normalizeRunSelection(selection)
  const key = `${normalized.mode}:${normalized.difficulty}`
  publicLeaderboardKey.value = key
  if (!serviceStatus.value.online) {
    publicLeaderboard.value = null
    return
  }
  try {
    const payload = await accountApi.leaderboard({ ...normalized, limit: 10 })
    if (publicLeaderboardKey.value === key) publicLeaderboard.value = payload.leaderboard || null
  } catch {
    if (publicLeaderboardKey.value === key) publicLeaderboard.value = null
  }
}

/** 停留在开始界面时每 20s 轮询公共榜：朋友的新成绩无需手动刷新（隐藏标签页不请求）。 */
function startBoardPolling() {
  stopBoardPolling()
  boardTimer = setInterval(() => {
    if (!document.hidden) flushSettlements()
    if (!document.hidden && serviceStatus.value.online && !started.value && !showMarket.value) {
      loadPublicLeaderboard(selectedRun.value)
    }
  }, 20000)
}

function stopBoardPolling() {
  clearInterval(boardTimer)
  boardTimer = 0
}

async function refreshAccountSession({ promptIfSignedOut = false } = {}) {
  const requestId = ++sessionRequestId
  try {
    const status = await accountApi.status()
    if (requestId !== sessionRequestId) return
    if (Number(status.version) < 2) throw new Error('游戏服务版本过旧，请重启游戏服务后重试')
    serviceStatus.value = {
      checked: true,
      online: true,
      registrationEnabled: status.registrationEnabled !== false,
      serverTime: status.serverTime,
    }
    const payload = await accountApi.me()
    if (requestId !== sessionRequestId) return
    if (payload.account) applyAccountPayload(payload)
    else {
      account.value = null
      saveCatalog.value = emptyCatalog()
      applyAccountData({ campaign: createCampaignSave(), records: {} })
      updateQueueState()
      applyActiveSave()
      if (promptIfSignedOut && !started.value && !showLeaderboard.value && !window.location.hash.startsWith('#/about')) showAccount.value = true
    }
    await flushSettlements()
    await loadPublicLeaderboard(selectedRun.value)
  } catch (error) {
    if (requestId !== sessionRequestId) return
    accountMessage.value = error.message || '暂时无法连接游戏服务'
    serviceStatus.value = { checked: true, online: false, registrationEnabled: false }
    account.value = null
    applyAccountData({ campaign: createCampaignSave(), records: {} })
    updateQueueState()
    publicLeaderboard.value = null
    saveCatalog.value = emptyCatalog()
    applyActiveSave()
    if (promptIfSignedOut && !started.value && !showLeaderboard.value && !window.location.hash.startsWith('#/about')) showAccount.value = true
  }
}

function onOpenAccount() {
  snd()?.uiClick()
  showPlayerRecords.value = false
  showLeaderboard.value = false
  showSaveSlots.value = false
  accountMessage.value = ''
  showAccount.value = true
  refreshAccountSession()
}

async function onAuth(kind, credentials) {
  const requestId = ++sessionRequestId
  accountBusy.value = true
  accountMessage.value = ''
  try {
    const payload = await accountApi[kind](credentials)
    if (requestId !== sessionRequestId) return
    applyAccountPayload(payload)
    showAccount.value = false
    showToast(`已登录：${payload.account.displayName || payload.account.username}`, 'success')
    await flushSettlements()
    await loadPublicLeaderboard(selectedRun.value)
  } catch (error) {
    accountMessage.value = accountErrorMessage(error)
  } finally {
    accountBusy.value = false
  }
}

function onLogin(credentials) {
  return onAuth('login', credentials)
}

function onRegister(credentials) {
  return onAuth('register', credentials)
}

async function onLogout() {
  if (settlementQueue.running || deployingRun.value) return
  ++sessionRequestId
  accountBusy.value = true
  try {
    await accountApi.logout()
    account.value = null
      runContext.value = null
    saveCatalog.value = emptyCatalog()
    applyActiveSave()
    applyAccountData({ campaign: createCampaignSave(), records: {} })
    updateQueueState()
    showAccount.value = false
    showToast('已退出登录', 'info')
  } catch (error) { accountMessage.value = `退出失败：${error.message}` }
  finally { accountBusy.value = false }
}

async function onImportLocalSlot() {
  const localSlot = activeLocalSaveSlot.value
  if (!localSlot || !isSignedIn.value) return
  accountBusy.value = true
  accountMessage.value = ''
  try {
    const payload = await accountApi.importSlot(localSlot, loadLegacyCampaign())
    applyCatalog(payload.catalog, true)
    applyAccountData(payload.accountData)
    showToast('旧档案已迁移到当前账号，旧成绩不会进入公共榜', 'success')
  } catch (error) {
    accountMessage.value = accountErrorMessage(error)
  } finally {
    accountBusy.value = false
  }
}

async function syncRunPreferences(normalized) {
  save.value.preferences = { ...normalized }
  if (!requireAccount()) return false
  try {
    const payload = await accountApi.updatePreferences(normalized)
    applyCatalog(payload.catalog, true)
    return true
  } catch (error) {
    const message = accountErrorMessage(error)
    accountMessage.value = message
    showToast(`账号档案同步失败：${message}`, 'danger', 3800)
    return false
  }
}

async function runCatalogAction(action, successMessage) {
  accountBusy.value = true
  accountMessage.value = ''
  try {
    const payload = await action()
    applyCatalog(payload.catalog, true)
    showSaveSlots.value = false
    snd()?.uiSelect()
    if (successMessage) showToast(successMessage, 'success')
  } catch (error) {
    accountMessage.value = accountErrorMessage(error)
    showAccount.value = true
  } finally {
    accountBusy.value = false
  }
}

/** 选择配置后先进入战前简报，确认按钮才真正消耗一次开局。 */
async function onPrepareRun(selection) {
  if (!requireAccount()) return
  const normalized = normalizeRunSelection(selection || save.value.preferences)
  const strain = selection?.strain || 'origin'
  selectedRun.value = normalized
  if (!(await syncRunPreferences(normalized))) return
  pendingRun.value = {
    selection: normalized,
    strain,
    element: normalizeSpellElement(selection?.element),
    intro: getRunIntro(normalized, strain, selection?.element),
  }
  loadPublicLeaderboard(normalized)
}

/** 战前简报确认：先 reset 再 start，避免结算/黑市返回后残留死亡与暂停锁。 */
async function onDeployRun() {
  const plan = pendingRun.value
  if (!plan || !engine.value || deployingRun.value) return
  if (!(await beginAccountRun({ ...plan.selection, gameplay: 'arena' }))) return
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
  spellCoreReward.value = null
  engine.value.applyStartingStrain(plan.strain, plan.element)
  engine.value.reset()
  engine.value.start()
  started.value = true
  pendingRun.value = null
  deployingRun.value = false
}

const currentRunnerSubmode = ref('marathon')

/**
 * 独立玩法：Runner（三线推进射击）。
 * 使用独立规则与账号结算，不改主战场 preferences。
 */
async function onStartRunner(submode = 'marathon') {
  if (!engine.value) return
  if (!(await beginAccountRun({ gameplay: 'runner', mode: submode, difficulty: 'standard' }))) return
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
  activeGameplay.value = 'runner'
  engine.value.configureGameplay('runner')
  engine.value.resetGameplaySession(undefined, currentRunnerSubmode.value)
  engine.value.start()
  started.value = true
}

/** 独立玩法：固定路径塔防闯关战役大地图 */
function onStartTowerDefense() {
  if (!requireAccount()) return
  snd()?.uiSelect()
  showTowerDefenseMap.value = true
}

async function onStartTowerDefenseStage(stageId = 1) {
  if (!engine.value) return
  if (!(await beginAccountRun({ gameplay: 'tower-defense', mode: 'campaign', difficulty: 'standard', stageId }))) return
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

function onSelectTowerBranch(branchId) {
  engine.value?.gameplay?.selectTowerBranch?.(branchId)
}

function onSelectTowerStrategy(strategyId) {
  engine.value?.gameplay?.setSelectedTowerStrategy?.(strategyId)
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

/** 启动无尽试炼：使用玩家最新解锁章节（上限第 20 关）的地图与机关 */
async function onStartTowerDefenseEndless() {
  if (!engine.value) return
  const baseStageId = Math.min(20, Math.max(1, Number(loadCampaignSave()?.unlockedStage) || 1))
  if (!(await beginAccountRun({ gameplay: 'tower-defense', mode: 'endless', difficulty: 'standard', stageId: baseStageId }))) return
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
  const baseStage = Math.min(20, Math.max(1, Number(loadCampaignSave()?.unlockedStage) || 1))
  activeGameplay.value = 'tower-defense'
  engine.value.configureGameplay('tower-defense')
  engine.value.gameplay.startEndlessMode(baseStage)
  engine.value.start()
  started.value = true
  showTowerDefenseMap.value = false
}


function onBackFromIntro() {
  pendingRun.value = null
}

/** 打开黑市（主战场选择 / 备战 / 结算入口；引擎保持暂停） */
function onOpenMarket() {
  if (!requireAccount()) return
  snd()?.uiClick()
  gameOverInfo.value = null
  paused.value = false
  expeditionReward.value = null
  endlessDecision.value = null
  pendingRun.value = null
  started.value = false
  showMarket.value = true
}

/** 关闭黑市：恢复进入前的主战场页面，结算入口返回战斗类型选择。 */
function onCloseMarket() {
  snd()?.uiClick()
  showMarket.value = false
}

function onOpenSaveSlots() {
  if (!requireAccount()) return
  snd()?.uiClick()
  showSaveSlots.value = true
}

function onCloseSaveSlots() {
  snd()?.uiClick()
  showSaveSlots.value = false
}

function onCreateSaveSlot(index) {
  if (requireAccount()) runCatalogAction(() => accountApi.createSlot(index), '账号档案已创建')
}
function onSwitchSaveSlot(id) {
  if (requireAccount()) runCatalogAction(() => accountApi.switchSlot(id), '已切换主战场档案')
}
function onDeleteSaveSlot(id) {
  if (requireAccount()) runCatalogAction(() => accountApi.deleteSlot(id), '账号档案已删除')
}
async function onBuyGene(geneId) {
  if (!requireAccount()) return
  try {
    const payload = await accountApi.buyGene(geneId)
    applyCatalog(payload.catalog, true)
    snd()?.buy()
  } catch (error) {
    snd()?.buyFail()
    showToast(accountErrorMessage(error), 'danger', 3200)
  }
}

/** 点击技能卡片：应用技能 → 关面板 → 恢复引擎主循环 */
function onSelectSkill(skill) {
  levelUpOptions.value = null
  engine.value?.applySkill(skill)
  snd()?.select() // 技能确认音
}

function onSelectSpellCore(id) {
  const reward = spellCoreReward.value
  spellCoreReward.value = null
  if (!engine.value?.resolveSpellCore(id)) spellCoreReward.value = reward
  snd()?.select()
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
    element: engine.value?.startingElement || 'fire',
    intro: getRunIntro(selectedRun.value, strain, engine.value?.startingElement),
  }
}

/** Runner 重试：保留模式，重新领取账号行动票据。 */
function onRestartRunner() {
  return onStartRunner(currentRunnerSubmode.value)
}

function onRestartTowerDefense() {
  if (engine.value?.gameplay?.isEndless) return onStartTowerDefenseEndless()
  return onStartTowerDefenseStage(engine.value?.gameplay?.currentStageId || 1)
}

function onRestartCurrent() {
  if (activeGameplay.value === 'runner') onRestartRunner()
  else if (activeGameplay.value === 'tower-defense') onRestartTowerDefense()
  else onRestart()
}

function onChangeRules() {
  runContext.value = null
  snd()?.uiClick()
  engine.value?.stop()
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
      spellCoreReward.value ||
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
  saveSaveCatalog(offlineCatalog.value)
}

/** Esc 键：黑市 → 返回主战场菜单；游戏中 → 切换暂停（模态面板打开时不响应） */
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

function onNetworkRestored() {
  if (account.value) flushSettlements()
  else if (!started.value) refreshAccountSession()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('online', onNetworkRestored)
  refreshAccountSession({ promptIfSignedOut: true })
  startBoardPolling()
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('online', onNetworkRestored)
  stopBoardPolling()
})
</script>

<template>
  <div class="app-root">
    <GameCanvas @ready="onEngineReady" />

    <!-- HUD 覆盖层：stats/cooldown 快照驱动的纯展示组件（前端 P2 拆分） -->
    <HudOverlay
      @activate-skill="!paused && engine?.running && engine?.input?.queueFever?.()"
      v-if="started && !towerDefenseActive && !runnerActive"
      :stats="stats"
      :cooldown="cooldown"
      :variant="activeGameplay === 'arena' ? 'arena' : 'runner'"
      :muted="muted"
      :paused="paused"
      :buttons-visible="!levelUpOptions && !spellCoreReward && !gameOverInfo && !gameplayResult && !expeditionReward && !endlessDecision"
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
      :muted="muted"
      :paused="paused"
      :controls-disabled="!!gameplayResult || !!levelUpOptions || !!gameOverInfo || !!expeditionReward || !!endlessDecision"
      @activate-fever="engine?.gameplay?.activateFever?.()"
      @change-lane="engine?.gameplay?.changeLane?.($event)"
      @layout-change="engine?.gameplay?.renderer?.setHudInsets?.($event)"
      @toggle-mute="onToggleMute"
      @toggle-pause="onPause"
      @toggle-resume="onResume"
    />

    <TowerDefenseHudOverlay
      v-if="started && towerDefenseActive && gameplayHud"
      :hud="gameplayHud"
      :muted="muted"
      :paused="paused"
      @select-tower="onSelectTower"
      @preview-tower="engine?.gameplay?.previewTowerType?.($event)"
      @select-tower-branch="onSelectTowerBranch"
      @select-tower-strategy="onSelectTowerStrategy"
      @upgrade="onUpgradeTower"
      @sell="onSellTower"
      @clear-obstacle="onClearObstacle"
      @trigger-trap="onTriggerTrap"
      @relocate-tower="onRelocateTower"
      @deselect="engine?.gameplay?.selectSlot?.(-1)"
      @toggle-mute="onToggleMute"
      @toggle-pause="onPause"
      @toggle-resume="onResume"
      @open-map="showTowerDefenseMap = true"
      @menu="onChangeRules"
      @next-stage="onStartTowerDefenseStage"
      @restart-stage="onRestartTowerDefense"
      @advance-tutorial="engine?.gameplay?.advanceTutorial?.()"
      @skip-tutorial="engine?.gameplay?.skipTutorial?.()"
      @cycle-speed="engine?.gameplay?.cycleGameSpeed?.()"
      @call-early="engine?.gameplay?.callNextWaveEarly?.()"
    />

    <!-- 升级面板：覆盖层之上，点击卡片应用技能并恢复游戏 -->
    <Transition name="modal-fade">
      <LevelUpModal v-if="levelUpOptions" :options="levelUpOptions" :level="stats.level" :role-spec="stats.roleSpec" :can-use-elements="stats.canUseElements" @select="onSelectSkill" />
    </Transition>
    <Transition name="modal-fade" mode="out-in">
      <SpellCoreModal v-if="spellCoreReward" :key="stats.spells?.cores" :info="spellCoreReward" @select="onSelectSpellCore" />
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

    <!-- 地下城黑市：主战场局外成长（掉落物 → 永久基因） -->
    <Transition name="modal-fade">
      <BlackMarket
        v-if="showMarket"
        :drops="save.drops"
        :genes="save.genes"
        @buy="onBuyGene"
        @close="onCloseMarket"
      />
    </Transition>

    <!-- 黑市打开时保留菜单与备战选择；从结算新建菜单时进入主战场。 -->
    <StartScreen
      v-if="!started"
      v-show="!showMarket"
      :key="saveCatalog.activeSlotId"
      :initial-view="showMarket ? 'arena-types' : 'playstyles'"
      :records="save.records"
      :progression="save.progression"
      :preferences="save.preferences"
      :active-slot="activeSaveSlot"
      :account="account"
      :service-status="serviceStatus"
      :public-leaderboard="publicLeaderboard"
      :account-data="accountData"
      @prepare="onPrepareRun"
      @runner="onStartRunner"
      @tower-defense="onStartTowerDefense"
      @market="onOpenMarket"
      @profiles="onOpenSaveSlots"
      @account="onOpenAccount"
      @leaderboard="loadPublicLeaderboard"
      @open-leaderboard="onOpenLeaderboard"
      @records="onOpenPlayerRecords"
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
      <AccountModal
        v-if="showAccount"
        :account="account"
        :status="serviceStatus"
        :active-slot="activeSaveSlot"
        :local-slot="activeLocalSaveSlot"
        :busy="accountBusy || syncing || deployingRun"
        :message="accountMessage"
        @close="showAccount = false"
        @login="onLogin"
        @register="onRegister"
        @logout="onLogout"
        @import-local="onImportLocalSlot"
        @profiles="showAccount = false; onOpenSaveSlots()"
        @records="onOpenPlayerRecords"
        @retry="refreshAccountSession"
      />
    </Transition>
    <LeaderboardModal v-if="showLeaderboard" @close="showLeaderboard = false" />
    <PlayerRecordsModal v-if="showPlayerRecords" :account-data="accountData" :pending="pendingSettlements" :syncing="syncing"
      @close="showPlayerRecords = false" @retry="flushSettlements(true)" @data="applyAccountData" @discard="discardSettlement" />
    <div v-if="pendingSettlements.length" class="account-sync-bar" role="status">
      <span>{{ syncing ? '正在保存游戏记录…' : `${pendingSettlements.length} 条记录等待同步` }}{{ !queueDurable ? ' · 浏览器无法暂存，请保持此页面打开' : '' }}</span>
      <button :disabled="syncing" @click="flushSettlements(true)">重试</button>
      <button @click="onOpenPlayerRecords">查看</button>
    </div>
    <div v-if="elementToast && !started" class="menu-toast" :class="toastKind" role="status">{{ elementToast }}</div>
  </div>
</template>

<style scoped>
.account-sync-bar { position: fixed; z-index: 49; left: 50%; bottom: 18px; transform: translateX(-50%); max-width: calc(100vw - 24px); display: flex; align-items: center; gap: 12px; padding: 12px 16px; border: 1px solid #70603d; border-radius: 6px; background: #201d14; color: #e2c890; font: 13px/1.5 'Microsoft YaHei', sans-serif; }
.account-sync-bar button { background: transparent; border: 0; color: #f5e2b7; cursor: pointer; white-space: nowrap; }
.account-sync-bar button:disabled { opacity: .4; }
.menu-toast { position: fixed; z-index: 65; bottom: 78px; left: 50%; transform: translateX(-50%); max-width: calc(100vw - 40px); padding: 12px 18px; background: #1c281d; border: 1px solid #69846b; border-radius: 6px; color: #dfebdc; font: 13px/1.5 'Microsoft YaHei', sans-serif; }
.menu-toast.danger { background: #2c1d17; border-color: #9c6e50; }

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
