import {
  DIFFICULTY_IDS,
  MODE_IDS,
  getExpeditionStages,
  isModeUnlocked,
  normalizeRunSelection,
  runKey,
  unlockedDifficultyAfterRun,
  unlockedModeAfterRun,
} from './RunRules.js'

const KEY = 'slime-rampage-save'
export const BOARD_SIZE = 8

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
  version: 4,
  drops: 0,
  genes: {},
  records: emptyRecords(),
  progression: { highestDifficulty: 'normal', highestMode: 'expedition' },
  preferences: { mode: 'expedition', difficulty: 'normal' },
  sound: { muted: false },
})

function sanitizeRun(run, selection = run) {
  const selected = normalizeRunSelection(selection)
  return {
    mode: selected.mode,
    difficulty: selected.difficulty,
    result: run?.result === 'victory' ? 'victory' : 'defeat',
    // 远征关数随难度递增（6/8/10/12 关），按本局难度的实际关卡表截断
    stage: Math.max(
      1,
      Math.min(
        getExpeditionStages(selected.difficulty).length,
        Math.round(run?.stage || run?.expeditionStage || 1)
      )
    ),
    wave: Math.max(1, Math.round(run?.wave || 1)),
    kills: Math.max(0, Math.round(run?.kills || 0)),
    time: Math.max(0, Math.round(run?.time ?? run?.elapsed ?? 0)),
    finaleTime: Math.max(0, Number(run?.finaleTime || 0)),
    devours: Math.max(0, Math.round(run?.devours || 0)),
    eliteKills: Math.max(0, Math.round(run?.eliteKills || 0)),
    bossKills: Math.max(0, Math.round(run?.bossKills || 0)),
    eventsCompleted: Math.max(0, Math.round(run?.eventsCompleted || 0)),
    species: typeof run?.species === 'string' ? run.species : '',
  }
}

export function computeScoreBreakdown(run) {
  const clean = sanitizeRun(run)
  const progressWave = clean.mode === 'timed' ? Math.min(24, clean.wave) : clean.wave
  const breakdown = {
    combat: clean.kills * 10,
    devour: clean.devours * 15,
    elite: clean.eliteKills * 75,
    boss: clean.bossKills * 500,
    events: clean.eventsCompleted * 350,
    progress: clean.mode === 'expedition' ? (clean.stage - 1) * 800 : (progressWave - 1) * 100,
    victory:
      (clean.mode === 'timed' || clean.mode === 'expedition') && clean.result === 'victory'
        ? clean.mode === 'expedition' ? 6000 : 4000
        : 0,
    finaleSpeed:
      clean.mode === 'timed' && clean.result === 'victory'
        ? Math.max(0, Math.round((180 - clean.finaleTime) * 10))
        : 0,
    clearSpeed:
      clean.mode === 'expedition' && clean.result === 'victory'
        ? Math.max(0, Math.round((1500 - clean.time) * 2))
        : 0,
  }
  breakdown.total = Object.values(breakdown).reduce((sum, value) => sum + value, 0)
  return breakdown
}

export function computeScore(run) {
  return computeScoreBreakdown(run).total
}

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

function compareEntries(a, b, mode) {
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
  save.drops = Number(source?.drops) > 0 ? Number(source.drops) : 0
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

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultSave()
    const source = JSON.parse(raw)
    if (!source?.records || Number(source.version) < 3) return migrateLegacy(source)

    const save = defaultSave()
    save.drops = Number(source.drops) > 0 ? Number(source.drops) : 0
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
  } catch {
    return defaultSave()
  }
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
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...save, version: 4 }))
  } catch {
    /* localStorage 不可用时游戏仍可继续。 */
  }
}
