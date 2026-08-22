import assert from 'node:assert/strict'
import { generateDecor } from './src/game/MapDecor.js'

const gradient = { addColorStop() {} }
const ctx2d = new Proxy(
  {},
  {
    get(_target, property) {
      if (property === 'createRadialGradient' || property === 'createLinearGradient') return () => gradient
      return () => {}
    },
    set() {
      return true
    },
  }
)
const canvasStub = {
  width: 0,
  height: 0,
  getBoundingClientRect: () => ({ width: 1280, height: 720 }),
  getContext: () => ctx2d,
}
globalThis.window = { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 }
globalThis.document = {
  createElement: () => canvasStub,
  addEventListener() {},
  removeEventListener() {},
  hidden: false,
}
globalThis.requestAnimationFrame = () => 0
globalThis.cancelAnimationFrame = () => {}

const { GameEngine } = await import('./src/game/GameEngine.js')
const engine = GameEngine.create(canvasStub)
for (const callback of ['onStats', 'onLevelUp', 'onBossSpawn', 'onBossGroupSpawn', 'onWaveChanged', 'onEvolution']) {
  engine[callback] = () => {}
}

let settlement = null
engine.onGameOver = (info) => {
  settlement = info
}

const activateChapter = () => {
  engine.expeditionIntroTime = 10
  engine.update(0)
}

// 1. 巢穴出生与回巢定位。
engine.configureRun({ mode: 'expedition', difficulty: 'easy' })
engine.reset()
assert.equal(engine._mapVariant, 'nest-border')
assert.equal(engine.player.x, engine.worldWidth * 0.5)
assert.equal(engine.player.y, engine.worldHeight * 0.5)
assert.ok(engine.mapFeatures.terrain.some((zone) => zone.type === 'slime'))

const openingDecor = generateDecor(2400, 1800, {
  seed: 42,
  themeId: 'frontier',
  variant: 'nest-border',
  spawn: { x: 0.5, y: 0.5 },
})
assert.ok(openingDecor.bg.some((item) => item.type === 'nest' && item.state === 'intact'))
assert.ok(openingDecor.bg.some((item) => item.type === 'road'))

engine._enterExpeditionStage(4)
assert.equal(engine._mapVariant, 'slime-nest-sieged')
assert.equal(engine.player.x, engine.worldWidth * 0.5)
assert.equal(engine.player.y, engine.worldHeight * 0.5)
assert.equal(engine.mapFeatures.nest.preview, true)

// 2. 净化兵攻击巢心，守住后才进入章节首领战。
activateChapter()
assert.equal(engine._expeditionProgress().definition.type, 'defend')
assert.equal(engine.mapFeatures.nestDefenseActive, true)
assert.equal(engine.mapFeatures.nestInfo.maxHp, 120)
engine.mapFeatures.update(0)
const nest = engine.mapFeatures.nest
const hpBefore = nest.hp
const raider = engine.enemyManager.spawnAt(nest.x + nest.radius + 14, nest.y, 'knight', {
  objectiveTarget: 'nest',
})
raider.attackCd = 0
raider.update(0.016)
assert.ok(nest.hp < hpBefore)
assert.equal(engine.player.hp, engine.player.maxHp)

engine.expeditionStageElapsed = 90
engine.update(0)
assert.equal(engine.runState, 'expedition-guardian')
assert.equal(engine.mapFeatures.nestInfo.state, 'secured')

// 3. 巢心归零使用独立失败原因进入结算。
engine.reset()
engine._enterExpeditionStage(4)
activateChapter()
engine.mapFeatures.update(0)
engine.mapFeatures.hitNest(engine.mapFeatures.nest.maxHp)
assert.equal(engine.runState, 'defeat')
assert.equal(settlement.defeatReason, 'nest-destroyed')

// 4. 事件实体化后保留残迹，换章时才清除。
engine.configureRun({ mode: 'timed', difficulty: 'normal' })
engine.reset()
const hunt = engine.worldEvents.spawnEvent('hunt')
assert.equal(hunt.def.title, '讨伐队猎营')
hunt.state = 'active'
engine.worldEvents._complete()
assert.equal(engine.worldEvents.scars.length, 1)
engine.worldEvents.cancelForEncounter()
assert.equal(engine.worldEvents.scars.length, 1)
engine.worldEvents.cancelForTransition()
assert.equal(engine.worldEvents.scars.length, 0)

// 5. 黏液脉络只加速玩家，泥地轻度减速双方。
engine.mapFeatures.configure('frontier', 'nest-border', 1)
assert.equal(engine.mapFeatures.speedMultiplierAt(engine.worldWidth * 0.5, engine.worldHeight * 0.5, 'player'), 1.12)
assert.equal(engine.mapFeatures.speedMultiplierAt(engine.worldWidth * 0.5, engine.worldHeight * 0.5, 'enemy'), 1)
engine.mapFeatures.configure('frontier', 'camp-road', 1)
assert.equal(engine.mapFeatures.speedMultiplierAt(engine.worldWidth * 0.3, engine.worldHeight * 0.34, 'player'), 0.84)
assert.equal(engine.mapFeatures.speedMultiplierAt(engine.worldWidth * 0.3, engine.worldHeight * 0.34, 'enemy'), 0.88)

// 6. 王城拒马需要两次冲刺冲击，破坏后不再阻挡。
engine.mapFeatures.configure('royal', 'outer-bailey', 1)
const barrier = engine.mapFeatures.barricades[0]
const barrierPos = engine.mapFeatures._position(barrier)
const player = engine.player
const oldX = barrierPos.x - 80
const oldY = barrierPos.y
player.x = barrierPos.x
player.y = barrierPos.y
assert.equal(engine.mapFeatures.resolvePlayerMovement(player, oldX, oldY, true), true)
assert.equal(barrier.hp, 1)
barrier.hitCooldown = 0
player.x = barrierPos.x
player.y = barrierPos.y
engine.mapFeatures.resolvePlayerMovement(player, oldX, oldY, true)
assert.equal(barrier.active, false)
player.x = barrierPos.x
player.y = barrierPos.y
assert.equal(engine.mapFeatures.resolvePlayerMovement(player, oldX, oldY, false), false)

// 7. 主章节必须各自拥有唯一的强地标。
const landmarks = [
  ['nest-border', 'nest'],
  ['camp-road', 'camp'],
  ['blight-garden', 'hunter-camp'],
  ['slime-nest-sieged', 'purifier-stake'],
  ['outer-bailey', 'gate-breach'],
  ['shattered-court', 'throne'],
]
for (const [variant, landmark] of landmarks) {
  const themeId = ['outer-bailey', 'shattered-court'].includes(variant)
    ? 'royal'
    : ['blight-garden', 'slime-nest-sieged'].includes(variant)
    ? 'blight'
    : 'frontier'
  const decor = generateDecor(2400, 1800, { seed: 7, themeId, variant })
  assert.ok(decor.bg.some((item) => item.type === landmark), `${variant} 缺少 ${landmark}`)
}

engine.destroy()
console.log('地图分阶段优化验证通过 ✓')
