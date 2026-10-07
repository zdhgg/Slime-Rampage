import assert from 'node:assert/strict'
import { RunnerGameplay } from './src/game/gameplay/RunnerGameplay.js'
import { InputManager } from './src/game/InputManager.js'
import { createRunnerTouchGesture } from './src/components/runnerTouchGesture.js'
import { RUNNER_COLLISION_DEPTH, RUNNER_ENTITY_TYPES } from './src/game/gameplay/runner/RunnerRules.js'

globalThis.window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }
const ctx = new Proxy({}, {
  get: (_, key) => key === 'measureText' ? text => ({ width: text.length * 12 }) : String(key).includes('Gradient') ? () => ({ addColorStop() {} }) : () => {},
  set: () => true,
})
const input = new InputManager()
const runner = new RunnerGameplay()
runner.attach({ width: 1280, height: 720, ctx, input, sound: new Proxy({}, { get: () => () => {} }), finishGameplay() {} })
runner.reset(4242, 'blitz')
runner.state = 'active'
input.suspended = false
const make = (type, lane, depth, extra = {}) => ({ ...RUNNER_ENTITY_TYPES[type], type, id: 50 + lane, lane, depth, hp: 100, maxHp: 100, speed: .2, baseSpeed: .2, active: true, ...extra })

// Choice entries and supplies must never tell the player to dodge.
runner.entities = ['mutation', 'secondary_mutation', 'module_mutation', 'gate', 'fork'].map((kind, index) => ({ kind, lane: index % 3, depth: .95, active: true }))
assert.deepEqual(runner._getLaneRisks(), [0, 0, 0])
assert.ok(runner._getLaneTelemetry().every(lane => lane.status === 'open'))

// An archer standing on the left can aim at the right: danger belongs to its
// locked target, not the shooter's lane. This also feeds automatic dashing.
runner.entities = [make('archer', 0, .3, { attacking: true, speed: 0, attackLane: 2 })]
assert.equal(runner._getLaneRisks()[0], 0)
assert.ok(runner._getLaneRisks()[2] > 1)
assert.equal(runner._getLaneTelemetry()[2].intent, '瞄准')

const areas = []
runner.renderer._drawDangerZone = (...args) => areas.push(args.slice(1))
runner.entities = [make('scout', 0, .4)]
runner.renderer._drawInWorldTelemetry(ctx)
assert.equal(areas.length, 0, 'a distant enemy gets no road danger fill')
runner.entities[0].depth = .93
runner.renderer._drawInWorldTelemetry(ctx)
assert.equal(areas.length, 1)
assert.ok(areas[0][2] - areas[0][1] <= .11, 'collision warning stays near the object')
assert.equal(runner._getLaneTelemetry()[0].status, 'danger')
runner.entities[0].freezeTimer = 1
runner.entities[0].depth = RUNNER_COLLISION_DEPTH - .002
assert.notEqual(runner._getLaneTelemetry()[0].status, 'danger', 'a frozen enemy is not approaching')
areas.length = 0
runner.entities = [make('mage', 1, .4, { attacking: true, attackLanes: [0, 2], attackDelay: 1, attackTimer: .2 })]
runner.renderer._drawEnemyThreats(ctx)
assert.deepEqual(areas.map(area => area[0]), [0, 2])
assert.ok(areas.every(area => area[1] > RUNNER_COLLISION_DEPTH - .1 && area[2] <= RUNNER_COLLISION_DEPTH + .05), 'mage warning is at the actual impact plane')
assert.equal(runner._getLaneTelemetry()[1].status, 'open')
console.log('✓ Runner threat forecasts exclude choices, track aimed lanes and match collision areas')

// Both keyboard and pointer routes share the same gameplay guards.
runner.feverCharges = 2
runner.state = 'countdown'
assert.equal(runner.activateFever(), false)
runner.state = 'active'
assert.equal(runner.activateFever(), true)
assert.equal(runner.activateFever(), false)
assert.equal(runner.feverCharges, 1)
runner.state = 'finished'
runner.feverTimer = 0
assert.equal(runner.activateFever(), false)
const nativeEvent = { code: 'Space', target: { closest: () => ({}) }, preventDefault() { throw new Error('native button activation was swallowed') } }
input._onKeyDown(nativeEvent)
assert.equal(input.consumeFever(), false)
input._onKeyDown({ code: 'Space', preventDefault() {} })
assert.equal(input.consumeFever(), true)
input.suspended = true
input._onKeyDown({ code: 'KeyF', preventDefault() {} })
assert.equal(input.consumeFever(), false)
console.log('✓ Native control keys, game Space, suspended input and fever lifecycle stay separate')

runner.damageNumbers = []
runner._showDamageNumber('corrosion', 400, 300, .6, 'corrosion')
runner._updateEffects(.25)
runner._showDamageNumber('corrosion', 400, 300, .6, 'corrosion')
assert.equal(runner.damageNumbers.length, 1)
assert.equal(runner.damageNumbers[0].value, 1.2)
runner._showDamageNumber('burn', 400, 300, .6, 'burn')
assert.ok(Math.abs(runner.damageNumbers[0].x - runner.damageNumbers[1].x) >= 32)
runner._updateEffects(.8)
assert.equal(runner.damageNumbers.length, 0, 'aggregates still expire')
runner.visualTime = 7
runner.reducedMotion = true
assert.equal(runner.renderer.motionTime, 0)
assert.equal(runner.getHudSnapshot().reducedMotion, true)
console.log('✓ Low-value damage aggregates, avoids other receipts and expires; reduced motion reaches HUD and renderer')
input.destroy()

const swipes = []
const gesture = createRunnerTouchGesture(direction => swipes.push(direction))
const touch = (x, y, time = 0, id = 1) => ({ pointerType: 'touch', isPrimary: true, pointerId: id, clientX: x, clientY: y, timeStamp: time })
gesture.begin(touch(100, 100))
gesture.move(touch(138, 102, 80))
gesture.move(touch(220, 104, 160))
gesture.end(touch(230, 104, 180))
assert.deepEqual(swipes, [1], 'a long drag changes exactly one lane')
gesture.begin(touch(100, 100)); gesture.end(touch(60, 100, 150))
assert.deepEqual(swipes, [1, -1], 'release handles a quick swipe')
for (const end of [touch(105, 103, 60), touch(140, 180, 100), touch(160, 100, 1200)]) {
  gesture.begin(touch(100, 100)); gesture.end(end)
}
gesture.begin(touch(100, 100)); gesture.reset(); gesture.end(touch(160, 100, 100))
gesture.begin(touch(100, 100)); gesture.begin({ ...touch(105, 100, 10, 2), isPrimary: false }); gesture.end(touch(160, 100, 100))
assert.deepEqual(swipes, [1, -1], 'tap, vertical, long press, cancellation and multi-touch cannot change lanes')
runner.state = 'active'; input.suspended = false
runner.currentLane = runner.targetLane = runner.lanePosition = 1
assert.equal(runner.changeLane(1), true)
assert.equal(runner.currentLane, 1, 'touch movement follows normal lane interpolation')
assert.equal(runner.targetLane, 2)
assert.equal(runner.changeLane(1), false)
assert.equal(runner.changeLane(0), false)
input.suspended = true
assert.equal(runner.changeLane(-1), false)
input.suspended = false; runner.state = 'finished'
assert.equal(runner.changeLane(-1), false)
runner.renderer.setHudInsets({ top: 220, bottom: 120 })
assert.ok(runner.renderer.horizonY >= 228)
assert.ok(runner.renderer.playerY + runner.renderer.baseUnit < 600)
assert.equal(runner.renderer.scenery.horizonY, runner.renderer.horizonY)
runner.renderer.setHudInsets({ top: 250, bottom: 100 })
assert.equal(runner.renderer.scenery.horizonY, runner.renderer.horizonY, 'scenery geometry follows HUD-only size changes')
assert.ok(runner.renderer.playerY > runner.renderer.horizonY)
console.log('✓ Touch gestures are one-shot and cancellable; HUD geometry reserves the playfield without changing collision rules')
runner.floatingTexts.length = 0
runner._activateBulletTime({ x: 400, y: 300 })
assert.ok(runner.bulletTimeTimer > 0)
assert.match(runner.getHudSnapshot().weaponNotice, /时空力场/)
assert.equal(runner.floatingTexts.length, 0, 'tactical feedback has one HUD destination, without a duplicate world label')
