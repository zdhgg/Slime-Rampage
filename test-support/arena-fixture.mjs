const gradient = { addColorStop() {} }
export const ctx2d = new Proxy({}, {
  get(_target, name) {
    if (name === 'createRadialGradient' || name === 'createLinearGradient') return () => gradient
    return () => {}
  },
  set() { return true },
})
export const canvas = {
  width: 1280, height: 720,
  getBoundingClientRect: () => ({ width: 1280, height: 720 }),
  getContext: () => ctx2d,
}
globalThis.window = { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 }
globalThis.document = { createElement: () => canvas, addEventListener() {}, removeEventListener() {}, hidden: false }
globalThis.requestAnimationFrame = () => 0
globalThis.cancelAnimationFrame = () => {}

const { GameEngine } = await import('../src/game/GameEngine.js')
export const { Boss } = await import('../src/game/entities/Boss.js')
export const { SKILL_DATABASE, rollSkills } = await import('../src/game/SkillPool.js')

export function createArena(strain = 'glutton') {
  const game = GameEngine.create(canvas)
  for (const name of ['onStats', 'onLevelUp', 'onGameOver', 'onBossSpawn', 'onWaveChanged', 'onEvolution']) game[name] = () => {}
  game.applyStartingStrain(strain)
  game.reset()
  game.running = true
  game.input.suspended = false
  game.enemyManager._enemies.length = 0
  game.enemyManager._spawnTimer = Infinity
  game.weaponSystem.critChance = 0
  return game
}

export function spawn(game, { x = 60, y = 0, hp = 100, type = 'knight' } = {}) {
  const e = game.enemyManager.spawnAt(game.player.x + x, game.player.y + y, type)
  e.hp = e.maxHp = hp
  e.shieldHits = 0
  e.devourable = false
  return e
}

export function spawnBoss(game, hp = 300, type = 'boss-knight') {
  const boss = new Boss({ x: game.player.x + 70, y: game.player.y, wave: 5, type })
  boss.attach(game)
  boss.hp = boss.maxHp = hp
  game.enemyManager._enemies.push(boss)
  return boss
}

export function learn(game, id, count = 1) {
  const skill = Object.values(SKILL_DATABASE).flatMap(tree => Array.isArray(tree) ? tree : [...tree.primary, ...tree.secondary]).find(s => s.id === id)
  if (!skill) throw new Error(`Unknown skill: ${id}`)
  for (let i = 0; i < count; i++) game.applySkill(skill)
}

export function pressSpace(game) {
  game.input.queueFever()
  game._updateStrainSkill(0)
}

export function strike(game, target) {
  const combat = game.weaponSystem.gluttonCombat
  if (!combat.bite(target)) throw new Error('Unable to start bite')
  combat.update(combat.swing.windup + combat.swing.strike + 0.001)
}

export function dispose(game) {
  game.pause()
  clearTimeout(game._evolutionTimer)
  game.destroy?.()
}
