import { CHECKPOINT_VERSION } from './SaveProtocol.js'
import { DIFFICULTY_IDS, getExpeditionStages } from './RunRules.js'
import { STRAIN_IDS } from './Strains.js'
import { ELEMENTS } from './ElementSystem.js'

const omitted = new Set(['__proto__', 'prototype', 'constructor', 'game', 'weapon', 'player', 'combat', 'input',
  'canvas', 'ctx', 'renderer', 'sound', 'enemies', '_pool', '_grid', '_projectiles', '_particles',
  '_texts', 'shots', 'fields', 'pendingRings', 'delayed', 'jobs', 'targets', 'huntTarget',
  'swing', 'assault', 'flash', '_trail', '_aura', '_decoys', 'echoQueue', 'domains', 'cleaves', 'echoes', 'waves', 'marks',
  'pounce', 'vortex', 'vortices', 'aimTarget', 'impacts', 'morsels', 'acidBursts', 'pounceEchoes', 'slams', 'spikes', 'auraPulses', 'mires'])

function encode(value, ancestors = new Set()) {
  if (typeof value === 'number' && !Number.isFinite(value)) return { $number: String(value) }
  if (value === null || ['number', 'string', 'boolean'].includes(typeof value)) return value
  if (!value || typeof value !== 'object' || ancestors.has(value)) return undefined
  const next = new Set(ancestors).add(value)
  if (value instanceof Map) return { $map: [...value].map(([key, item]) => [encode(key, next), encode(item, next)])
    .filter(pair => pair.every(item => item !== undefined)) }
  if (value instanceof Set) return { $set: [...value].map(item => encode(item, next)).filter(item => item !== undefined) }
  if (Array.isArray(value)) return value.map(item => encode(item, next)).filter(item => item !== undefined)
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return undefined
  return capture(value, next)
}

function capture(object, ancestors = new Set()) {
  return Object.fromEntries(Object.entries(object).flatMap(([key, value]) => {
    if (omitted.has(key) || key.startsWith('on') && typeof value === 'function') return []
    const encoded = encode(value, ancestors)
    return encoded === undefined ? [] : [[key, encoded]]
  }))
}

function decode(value) {
  if (!value || typeof value !== 'object') return value
  if (value.$number) return Number(value.$number)
  if (value.$map) return new Map(value.$map.map(([key, item]) => [decode(key), decode(item)]))
  if (value.$set) return new Set(value.$set.map(decode))
  if (Array.isArray(value)) return value.map(decode)
  return Object.fromEntries(Object.entries(value).filter(([key]) => !omitted.has(key)).map(([key, item]) => [key, decode(item)]))
}

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const positive = value => Number.isFinite(value) && value > 0
const count = value => Number.isFinite(value) && value >= 0
const elementId = value => typeof value === 'string' && Object.hasOwn(ELEMENTS, value)

function validEntranceCore(core) {
  if (core == null) return true // 既有章节存档不含此字段。
  if (!object(core) || !elementId(core.type)) return false
  const choices = core.coreChoices
  return choices === null || (Array.isArray(choices) && choices.length === 2
    && choices[0] === core.type && elementId(choices[1]) && choices[1] !== core.type)
}

function validEncoding(value, depth = 0) {
  if (depth > 32) return false
  if (value === null || ['string', 'boolean'].includes(typeof value)) return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (!object(value) && !Array.isArray(value)) return false
  if (Array.isArray(value)) return value.every(item => validEncoding(item, depth + 1))
  if ('$number' in value) return Object.keys(value).length === 1 && ['Infinity', '-Infinity', 'NaN'].includes(value.$number)
  if ('$map' in value) return Object.keys(value).length === 1 && Array.isArray(value.$map)
    && value.$map.every(pair => Array.isArray(pair) && pair.length === 2 && pair.every(item => validEncoding(item, depth + 1)))
  if ('$set' in value) return Object.keys(value).length === 1 && Array.isArray(value.$set)
    && value.$set.every(item => validEncoding(item, depth + 1))
  return Object.entries(value).every(([key, item]) => !['__proto__', 'prototype', 'constructor'].includes(key) && validEncoding(item, depth + 1))
}

// Restore data fields on existing instances; saved bytes cannot replace engine
// methods, runtime dependencies or newly introduced class members.
function restoreFields(target, saved, allowed = Object.keys(target)) {
  const decoded = decode(saved)
  for (const key of allowed) {
    if (!omitted.has(key) && Object.hasOwn(decoded, key) && Object.hasOwn(target, key)
      && typeof target[key] !== 'function') target[key] = decoded[key]
  }
}

export function isRunCheckpoint(saved) {
  if (!object(saved) || saved.version !== CHECKPOINT_VERSION || !validEncoding(saved)) return false
  if (saved.gameplay === 'arena') {
    const player = saved.components?.player
    return saved.selection?.mode === 'expedition' && DIFFICULTY_IDS.includes(saved.selection.difficulty)
      && Number.isInteger(saved.stage) && saved.stage >= 1 && saved.stage <= getExpeditionStages(saved.selection.difficulty).length
      && object(saved.engine) && STRAIN_IDS.includes(saved.engine.startingStrain) && count(saved.engine.elapsed)
      && object(player) && positive(player.hp) && positive(player.maxHp) && player.hp <= player.maxHp
      && Number.isInteger(player.level) && player.level >= 1 && object(saved.components.weaponSystem)
      && object(saved.metrics) && ['kills', 'elites', 'completed', 'failed', 'wave'].every(key => count(saved.metrics[key]))
      && object(saved.metrics.completedByType)
      && validEntranceCore(saved.entranceCore)
  }
  if (saved.gameplay === 'tower-defense') {
    return Number.isInteger(saved.stage) && saved.stage >= 1 && saved.stage <= 99 && typeof saved.endless === 'boolean'
      && count(saved.elapsed) && object(saved.state) && positive(saved.state.baseHp) && positive(saved.state.maxBaseHp)
      && saved.state.baseHp <= saved.state.maxBaseHp && count(saved.state.gold)
      && Array.isArray(saved.state.towers) && Array.isArray(saved.state.traps) && Array.isArray(saved.state.unlockedSlots?.$set)
      && saved.director?.phase === 'intermission' && Number.isInteger(saved.director.waveIndex) && saved.director.waveIndex >= -1
      && saved.director.completedWaves === saved.director.waveIndex + 1 && count(saved.director.timer)
  }
  return false
}

const engineFields = ['elapsed', 'genes', 'startingStrain', 'startingElement', 'primarySpec', 'secondarySpec',
  'roleSpec', 'originRoute', 'originMark', 'originSourceMemories', 'originSourceCursor', 'originSourceLastCast',
  '_originSourceSeen', 'originCoreDropState', 'originCombo', 'skillLevels', 'bossSkillIds', 'bossSkillLevels',
  'strainDevourBonus', 'devourThreshold', '_mapSeed', '_runRandomState', '_spellCoreSeen']
const components = ['player', 'weaponSystem', 'weaponSystem.gluttonCombat', 'weaponSystem.shadowCombat',
  'weaponSystem.shadowCombat.shield',
  'weaponSystem.ricochetCombat', 'weaponSystem.petCombat', 'weaponSystem.spellCombat',
  'weaponSystem.spellCombat.shield', 'weaponSystem.spellCombat.lightning', 'weaponSystem.originCombat', 'weaponSystem.originSourceCombat',
  'weaponSystem.originOverload', 'bossTomes']
const at = (object, path) => path.split('.').reduce((value, key) => value?.[key], object)

export function withRunRandom(engine, operation) {
  const previous = Math.random
  Math.random = () => {
    engine._runRandomState = ((engine._runRandomState || 1) + 0x6D2B79F5) >>> 0
    let x = engine._runRandomState
    x = Math.imul(x ^ x >>> 15, x | 1)
    x ^= x + Math.imul(x ^ x >>> 7, x | 61)
    return ((x ^ x >>> 14) >>> 0) / 4294967296
  }
  try { return operation() } finally { Math.random = previous }
}

export function captureExpeditionCheckpoint(engine) {
  if (engine.gameplayId !== 'arena' || engine.runSelection.mode !== 'expedition'
    || engine.runState !== 'expedition-intro' || engine.player.dead || engine._chapterSettlement) return null
  return {
    version: CHECKPOINT_VERSION, gameplay: 'arena', selection: { ...engine.runSelection },
    stage: engine.expeditionStage, label: `主战场远征 · 第 ${engine.expeditionStage} 章入口`,
    entranceCore: engine.gemManager.expeditionEntranceCore,
    engine: capture(Object.fromEntries(engineFields.map(key => [key, engine[key]]))),
    components: Object.fromEntries(components.filter(path => at(engine, path)).map(path => [path, capture(at(engine, path))])),
    metrics: { kills: engine.weaponSystem.kills, elites: engine.weaponSystem.eliteKills,
      completed: engine.worldEvents.completed, failed: engine.worldEvents.failed,
      completedByType: { ...engine.worldEvents.completedByType }, wave: engine.enemyManager.wave },
  }
}

export function restoreExpeditionCheckpoint(engine, saved) {
  if (saved?.gameplay !== 'arena' || !isRunCheckpoint(saved)) throw new Error('续玩存档版本或内容无效')
  engine.configureGameplay('arena')
  engine.configureRun(saved.selection)
  engine.applyStartingStrain(saved.engine.startingStrain)
  engine.reset()
  restoreFields(engine, saved.engine, engineFields)
  // Enter the stage before restoring cooldowns/builds: transitions clear transient combat state.
  engine._enterExpeditionStage(saved.stage, true)
  for (const path of components) if (saved.components[path] && at(engine, path)) restoreFields(at(engine, path), saved.components[path])
  // 旧存档的全屏磁感使用独立标记，已保存的半径尚未计入翻倍。
  if (saved.components.player.geneMagnetAll === 1 && positive(saved.components.player.pickupRadius)) {
    engine.player.pickupRadius *= 2
  }
  engine.player._refreshElements()
  engine.player.dead = false
  engine.worldEvents.completed = saved.metrics.completed
  engine.worldEvents.failed = saved.metrics.failed
  engine.worldEvents.completedByType = { ...saved.metrics.completedByType }
  engine.enemyManager.wave = saved.metrics.wave
  engine._expeditionBaseline = { kills: saved.metrics.kills, elites: saved.metrics.elites,
    events: saved.metrics.completed, eventsByType: { ...saved.metrics.completedByType } }
  engine._placePlayerAtMapSpawn()
  engine.gemManager.placeExpeditionEntranceCore(saved.entranceCore)
  engine._pauseLock = 0
  engine._pushStats()
  engine._pushCooldown()
}

const towerFields = ['elapsedTime', 'baseHp', 'maxBaseHp', 'gold', 'kills', 'score', 'towersBuilt', 'upgrades',
  'towers', 'traps', 'unlockedSlots', 'tutorial', 'gameSpeed', 'lastWaveReport', '_nextSpecialEnemyId']
export function captureTowerCheckpoint(engine) {
  const game = engine.gameplay
  if (engine.gameplayId !== 'tower-defense' || game.state !== 'active'
    || game.director.phase !== 'intermission' || game.enemies.length) return null
  return { version: CHECKPOINT_VERSION, gameplay: 'tower-defense', stage: game.currentStageId,
    endless: game.isEndless, elapsed: engine.elapsed, randomState: engine._runRandomState,
    label: `塔防${game.isEndless ? '无尽' : `第 ${game.currentStageId} 关`} · 第 ${game.director.completedWaves + 1} 波前整备`,
    state: capture(Object.fromEntries(towerFields.map(key => [key, game[key]]))),
    director: capture(Object.fromEntries(Object.entries(game.director).filter(([key]) => key !== 'waves'))) }
}

export function restoreTowerCheckpoint(engine, saved) {
  if (saved?.gameplay !== 'tower-defense' || !isRunCheckpoint(saved)) throw new Error('续玩存档版本或内容无效')
  engine.configureGameplay('tower-defense')
  const game = engine.gameplay
  if (saved.endless) game.startEndlessMode(saved.stage)
  else game.loadStage(saved.stage)
  restoreFields(game, saved.state, towerFields)
  restoreFields(game.director, saved.director)
  // No combat projectiles survive a wave boundary.
  game.shots = []; game.burnZones = []; game.trapEvents = []
  engine.elapsed = saved.elapsed
  engine._runRandomState = saved.randomState
  engine._pauseLock = 0
  engine._pushGameplayHud()
}
