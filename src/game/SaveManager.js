import {
  DIFFICULTY_IDS,
  MODE_IDS,
  computeScore,
  computeScoreBreakdown,
  isModeUnlocked,
  normalizeRunSelection,
  runKey,
  sanitizeRun,
  unlockedDifficultyAfterRun,
  unlockedModeAfterRun,
} from './RunRules.js'

// 分数公式与局数据清洗归口 RunRules（引擎实时预估分也要用）；此处 re-export 保持旧 import 路径可用。
export { computeScore, computeScoreBreakdown, sanitizeRun }

const KEY = 'slime-rampage-save'
const CATALOG_VERSION = 6
export const BOARD_SIZE = 8
export const SAVE_SLOT_COUNT = 3
/** 旧战利品 → 战力点迁移比率：version<5 的存档按购买力 ÷15 折算（黑市货架同步 ÷15 重定价）。 */
const LEGACY_DROPS_DIVISOR = 15
/** V6 展示尺度：产出与定价同步 ×100，存量战力点同乘保持购买力不变。 */
const POINTS_SCALE = 100

const emptyBest = () => ({
  score: 0,
  wave: 1,
  kills: 0,
  time: 0,
  result: 'defeat',
  clears: 0,
  fastestFinale: null,
  fastestClear: null,
  stage: 1,
})

function emptyRecords() {
  const records = {}
  for (const mode of MODE_IDS) {
    for (const difficulty of DIFFICULTY_IDS) {
      records[`${mode}:${difficulty}`] = { best: emptyBest(), board: [] }
    }
  }
  return records
}

export const defaultSave = () => ({
  version: 6,
  drops: 0,
  genes: {},
  records: emptyRecords(),
  progression: { highestDifficulty: 'normal', highestMode: 'expedition' },
  preferences: { mode: 'expedition', difficulty: 'normal' },
  sound: { muted: false },
})

function sanitizeEntry(value, selection) {
  const clean = sanitizeRun(value, selection)
  const breakdown = computeScoreBreakdown(clean)
  return {
    ...clean,
    score: value?.scoreVersion === 3 ? Math.max(0, Math.round(value.score || 0)) : breakdown.total,
    breakdown: value?.scoreVersion === 3 && value?.breakdown ? value.breakdown : breakdown,
    scoreVersion: 3,
    date: typeof value?.date === 'string' ? value.date : '',
  }
}

export function compareEntries(a, b, mode) {
  if ((mode === 'timed' || mode === 'expedition') && a.result !== b.result) {
    return a.result === 'victory' ? -1 : 1
  }
  if (b.score !== a.score) return b.score - a.score
  if (mode === 'timed' && a.result === 'victory' && a.finaleTime !== b.finaleTime) {
    return a.finaleTime - b.finaleTime
  }
  if (mode === 'expedition' && a.result === 'victory' && a.time !== b.time) return a.time - b.time
  return b.wave - a.wave
}

function sanitizeRecord(record, selection) {
  const board = Array.isArray(record?.board)
    ? record.board
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => sanitizeEntry(entry, selection))
        .sort((a, b) => compareEntries(a, b, selection.mode))
        .slice(0, BOARD_SIZE)
    : []
  const storedBest = record?.best || {}
  const leader = board[0]
  return {
    best: {
      ...emptyBest(),
      ...(leader || {}),
      clears: Math.max(0, Math.round(storedBest.clears || 0)),
      fastestFinale:
        Number(storedBest.fastestFinale) > 0 ? Number(storedBest.fastestFinale) : null,
      fastestClear: Number(storedBest.fastestClear) > 0 ? Number(storedBest.fastestClear) : null,
    },
    board,
  }
}

function migrateLegacy(source) {
  const save = defaultSave()
  // V3 前的战利品是旧货币，按购买力折算为战力点
  save.drops = Math.max(0, Math.round((Number(source?.drops) || 0) / LEGACY_DROPS_DIVISOR) * POINTS_SCALE)
  save.genes = source?.genes && typeof source.genes === 'object' ? source.genes : {}
  save.sound.muted = !!source?.sound?.muted
  save.preferences = { mode: 'endless', difficulty: 'normal' }
  save.progression.highestMode = 'endless'

  const selection = { mode: 'endless', difficulty: 'normal' }
  const legacyBoard = Array.isArray(source?.board) ? source.board : []
  const best = source?.best || {}
  if (legacyBoard.length === 0 && (best.kills > 0 || best.time > 0 || best.wave > 1)) {
    legacyBoard.push({ ...best, score: 0 })
  }
  const migrated = legacyBoard.map((entry) => ({
    ...entry,
    mode: 'endless',
    difficulty: 'normal',
    result: 'defeat',
    scoreVersion: 0,
  }))
  save.records[runKey(selection)] = sanitizeRecord({ board: migrated }, selection)
  if (Math.max(Number(best.wave) || 1, ...migrated.map((entry) => Number(entry.wave) || 1)) >= 20) {
    save.progression.highestDifficulty = 'hard'
  }
  return save
}

function recordHasHistory(record) {
  const best = record?.best || {}
  return !!(
    record?.board?.length ||
    best.score > 0 ||
    best.clears > 0 ||
    best.kills > 0 ||
    best.wave > 1 ||
    best.stage > 1 ||
    best.time > 0
  )
}

function recordHasVictory(record) {
  return !!(record?.best?.clears > 0 || record?.board?.some((entry) => entry.result === 'victory'))
}

/** V3 旧档按真实战绩补权，不以默认偏好误判已经解锁的模式。 */
function inferHighestMode(source, records) {
  if (MODE_IDS.includes(source.progression?.highestMode)) return source.progression.highestMode
  if (
    recordHasVictory(records['timed:hard']) ||
    DIFFICULTY_IDS.some((difficulty) => recordHasHistory(records[`endless:${difficulty}`]))
  ) {
    return 'endless'
  }
  if (recordHasVictory(records['expedition:hard']) ||
      DIFFICULTY_IDS.some((difficulty) => recordHasHistory(records[`timed:${difficulty}`]))) {
    return 'timed'
  }
  return 'expedition'
}

export function sanitizeSave(source) {
  if (!source) return defaultSave()
  if (!source.records || Number(source.version) < 3) return migrateLegacy(source)

  const save = defaultSave()
  save.drops = Number(source.drops) > 0 ? Number(source.drops) : 0
  // V5 前 drops 是旧战利品货币，惰性迁移为战力点（sanitizeSave 是读档唯一收口，只折一次）
  if (Number(source.version || 0) < 5) save.drops = Math.round(save.drops / LEGACY_DROPS_DIVISOR)
  // V6：战力点产出/定价同步 ×100，存量同乘保持购买力（V4 档先 ÷15 再 ×100，等价于 ÷0.15）
  if (Number(source.version || 0) < 6) save.drops = Math.round(save.drops * POINTS_SCALE)
  save.genes = source.genes && typeof source.genes === 'object' ? source.genes : {}
  save.sound.muted = !!source.sound?.muted
  save.preferences = normalizeRunSelection(source.preferences)
  save.progression.highestDifficulty = DIFFICULTY_IDS.includes(
    source.progression?.highestDifficulty
  )
    ? source.progression.highestDifficulty
    : 'normal'
  for (const mode of MODE_IDS) {
    for (const difficulty of DIFFICULTY_IDS) {
      const selection = { mode, difficulty }
      save.records[runKey(selection)] = sanitizeRecord(
        source.records[runKey(selection)],
        selection
      )
    }
  }
  save.progression.highestMode = inferHighestMode(source, save.records)
  if (!isModeUnlocked(save.progression, save.preferences.mode)) {
    save.preferences.mode = save.progression.highestMode
  }
  return save
}

const slotId = (index) => `slot-${index + 1}`
const slotName = (index) => `史莱姆档案 ${index + 1}`
const now = () => new Date().toISOString()

function makeSlot(index, data = defaultSave(), metadata = {}) {
  const timestamp = now()
  return {
    id: slotId(index),
    name: slotName(index),
    createdAt: typeof metadata.createdAt === 'string' ? metadata.createdAt : timestamp,
    lastPlayedAt: typeof metadata.lastPlayedAt === 'string' ? metadata.lastPlayedAt : timestamp,
    data: sanitizeSave(data),
  }
}

export function normalizeCatalog(source) {
  // 以 slots 数组识别目录格式（而非版本号）：旧版多槽目录逐槽走 sanitizeSave 迁移，不丢槽位
  if (Array.isArray(source?.slots)) {
    const slots = Array.from({ length: SAVE_SLOT_COUNT }, (_, index) => {
      const stored = source.slots[index]
      return stored?.data ? makeSlot(index, stored.data, stored) : null
    })
    if (!slots.some(Boolean)) slots[0] = makeSlot(0)
    const activeSlotId = slots.some((slot) => slot?.id === source.activeSlotId)
      ? source.activeSlotId
      : slots.find(Boolean).id
    return {
      version: CATALOG_VERSION,
      activeSlotId,
      settings: { sound: { muted: !!source.settings?.sound?.muted } },
      slots,
    }
  }

  const migrated = sanitizeSave(source)
  return {
    version: CATALOG_VERSION,
    activeSlotId: slotId(0),
    settings: { sound: { muted: !!source?.sound?.muted } },
    slots: [makeSlot(0, migrated), ...Array(SAVE_SLOT_COUNT - 1).fill(null)],
  }
}

/** 读取三槽档案目录；V4 及更早的单档会自动放入档案 1。 */
export function loadSaveCatalog() {
  try {
    const raw = localStorage.getItem(KEY)
    return normalizeCatalog(raw ? JSON.parse(raw) : null)
  } catch {
    return normalizeCatalog(null)
  }
}

export function getActiveSaveSlot(catalog) {
  return catalog?.slots?.find((slot) => slot?.id === catalog.activeSlotId) || null
}

export function getActiveSave(catalog) {
  return getActiveSaveSlot(catalog)?.data || defaultSave()
}

/** 在指定空位创建全新进度并立即切换过去。 */
export function createSaveSlot(catalog, index) {
  if (!catalog || index < 0 || index >= SAVE_SLOT_COUNT || catalog.slots[index]) return null
  const slot = makeSlot(index)
  catalog.slots[index] = slot
  catalog.activeSlotId = slot.id
  return slot
}

export function switchSaveSlot(catalog, id) {
  const slot = catalog?.slots?.find((entry) => entry?.id === id)
  if (!slot) return null
  catalog.activeSlotId = slot.id
  slot.lastPlayedAt = now()
  return slot
}

/** 至少保留一个有效档案；删除当前档时会自动切换到其余档案。 */
export function deleteSaveSlot(catalog, id) {
  const occupied = catalog?.slots?.filter(Boolean) || []
  const index = catalog?.slots?.findIndex((slot) => slot?.id === id) ?? -1
  if (occupied.length <= 1 || index < 0) return false
  catalog.slots[index] = null
  if (catalog.activeSlotId === id) {
    const fallback = catalog.slots.find(Boolean)
    catalog.activeSlotId = fallback.id
    fallback.lastPlayedAt = now()
  }
  return true
}

export function updateActiveSave(catalog, save) {
  const slot = getActiveSaveSlot(catalog)
  if (!slot) return null
  slot.data = save
  slot.lastPlayedAt = now()
  return slot
}

export function saveSaveCatalog(catalog) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...catalog, version: CATALOG_VERSION }))
  } catch {
    /* localStorage 不可用时游戏仍可继续。 */
  }
}

/** 兼容旧调用：返回当前档案的数据，而不是档案目录。 */
export function loadSave() {
  return getActiveSave(loadSaveCatalog())
}

export function getRunRecord(save, selection) {
  const value = normalizeRunSelection(selection)
  const key = runKey(value)
  save.records ||= emptyRecords()
  save.records[key] ||= { best: emptyBest(), board: [] }
  return save.records[key]
}

export function pushScore(save, selection, run) {
  if (run === undefined) {
    run = selection
    selection = save.preferences || run
  }
  const selected = normalizeRunSelection(selection)
  const record = getRunRecord(save, selected)
  const clean = sanitizeRun(run, selected)
  const breakdown = computeScoreBreakdown(clean)
  const entry = {
    ...clean,
    score: breakdown.total,
    breakdown,
    scoreVersion: 3,
    date: new Date().toISOString().slice(0, 10),
  }
  const board = [...record.board, entry]
    .sort((a, b) => compareEntries(a, b, selected.mode))
    .slice(0, BOARD_SIZE)
  record.board = board
  const rank = board.indexOf(entry) + 1

  const previousClears = record.best.clears || 0
  const previousFastest = record.best.fastestFinale
  const previousFastestClear = record.best.fastestClear
  const leader = board[0] || entry
  record.best = {
    ...leader,
    clears: previousClears + (clean.result === 'victory' ? 1 : 0),
    fastestFinale:
      clean.result === 'victory'
        ? previousFastest == null
          ? clean.finaleTime
          : Math.min(previousFastest, clean.finaleTime)
        : previousFastest,
    fastestClear:
      clean.mode === 'expedition' && clean.result === 'victory'
        ? previousFastestClear == null
          ? clean.time
          : Math.min(previousFastestClear, clean.time)
        : previousFastestClear,
  }

  const previousUnlock = save.progression?.highestDifficulty || 'normal'
  const previousModeUnlock = save.progression?.highestMode || 'expedition'
  const highestDifficulty = unlockedDifficultyAfterRun(save.progression, clean)
  const highestMode = unlockedModeAfterRun(save.progression, clean)
  save.progression = { ...save.progression, highestDifficulty, highestMode }
  save.preferences = selected
  return {
    rank: board.includes(entry) ? rank : 0,
    board,
    entry,
    best: record.best,
    unlocked: highestDifficulty !== previousUnlock ? highestDifficulty : null,
    unlockedMode: highestMode !== previousModeUnlock ? highestMode : null,
  }
}

export function saveSave(save) {
  const catalog = loadSaveCatalog()
  updateActiveSave(catalog, { ...save, version: 6 })
  saveSaveCatalog(catalog)
}
