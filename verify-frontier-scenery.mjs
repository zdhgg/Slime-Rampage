import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { generateDecor } from './src/game/MapDecor.js'
import { paintFrontierGround, drawWoodlandForeground } from './src/game/FrontierScenery.js'
import { MapFeatureManager } from './src/game/MapFeatureManager.js'

// Same seed must retain the scene across rebuilds, independent of ambient randomness.
const options = { themeId: 'frontier', variant: 'nest-border', seed: 42 }
const first = generateDecor(2400, 1800, options)
for (let i = 0; i < 100; i++) Math.random()
assert.deepEqual(generateDecor(2400, 1800, options), first)
assert.notDeepEqual(generateDecor(2400, 1800, { ...options, seed: 43 }), first)
for (const [w, h] of [[2400, 1800], [3840, 2160], [6000, 4000]]) {
  for (const seed of [1, 7, 42, 100]) {
    const scene = generateDecor(w, h, { ...options, seed })
    const trees = scene.bg.filter(item => item.type === 'woodland-tree')
    assert.ok(trees.length > 5 && trees.length <= 72)
    assert.ok(scene.fg.length <= 216, 'dynamic decoration is bounded')
    for (const item of scene.bg) {
      assert.ok(Number.isFinite(item.x) && Number.isFinite(item.y))
      if (item.type === 'road' || item.type === 'nest' || item.type === 'woodland-marker') continue
      assert.ok(Math.hypot(item.x - w / 2, item.y - h / 2) > 200, 'spawn remains clear')
    }
  }
}

function groundSignature(seed) {
  const hash = createHash('sha256')
  const log = (name, args) => hash.update(JSON.stringify([name, args]))
  const ctx = new Proxy({}, {
    get: (_, name) => (...args) => {
      log(name, args)
      if (String(name).includes('Gradient')) return { addColorStop: (...values) => log('stop', values) }
    },
    set: (_, name, value) => { log(name, [value]); return true },
  })
  paintFrontierGround(ctx, 2400, 1800, seed)
  return hash.digest('hex')
}
assert.equal(groundSignature(42), groundSignature(42))
assert.notEqual(groundSignature(42), groundSignature(7))

// Verify the rendered world-space boundary and gameplay agree along all directions.
const manager = new MapFeatureManager()
manager.game = { worldWidth: 2400, worldHeight: 1800 }
for (const variant of ['nest-border', 'camp-road']) {
  manager.configure('frontier', variant, 42)
  const zone = manager.terrain[0]
  manager.terrain = [zone]
  const transforms = [], circles = []
  const ctx = new Proxy({}, {
    get: (_, name) => (...args) => {
      if (['scale', 'rotate'].includes(name)) transforms.push(args)
      if (name === 'arc') circles.push(args)
      if (String(name).includes('Gradient')) return { addColorStop() {} }
    },
    set: () => true,
  })
  manager._renderTerrain(ctx, zone)
  assert.deepEqual(transforms, [], 'effect boundary must not be stretched or rotated')
  assert.equal(circles[0][2], zone.radius)
  const center = manager._position(zone)
  for (let i = 0; i < 16; i++) {
    const angle = i / 16 * Math.PI * 2
    const sample = radius => manager.speedMultiplierAt(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius)
    assert.notEqual(sample(zone.radius - 0.1), 1)
    assert.equal(sample(zone.radius + 0.1), 1)
  }
}

// A canopy must fade over enemies as well as the player, and use the cached sprite.
function crownAlpha(player, enemies) {
  let alpha = 1, images = 0
  const ctx = new Proxy({}, {
    get: (_, name) => () => { if (name === 'drawImage') images++ },
    set: (_, name, value) => { if (name === 'globalAlpha') alpha = value; return true },
  })
  drawWoodlandForeground(ctx, { type: 'woodland-crown', x: 500, y: 500, s: 1, phase: 0, crownSprite: {} }, 0, player, enemies)
  assert.equal(images, 1)
  return alpha
}
assert.ok(crownAlpha({ x: 500, y: 427 }, []) < 0.25)
assert.ok(crownAlpha(null, [{ x: 500, y: 427, active: true }]) < 0.25)
assert.ok(crownAlpha(null, []) > 0.8)
const camp = generateDecor(2400, 1800, { themeId: 'frontier', variant: 'camp-road' })
assert.ok(camp.bg.some(item => item.type === 'camp'))
assert.ok(!camp.bg.some(item => item.type === 'nest'), 'other woodland chapters retain their own landmarks')
console.log('✓ 第一章场景：固定种子、密度上限、出生空白区、地形边界与树冠遮挡通过')
