import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const manifest = JSON.parse(readFileSync(resolve('public/assets/art/v1/manifest.json'), 'utf8'))
assert.equal(manifest.version, 'v1')
assert.equal(manifest.assets.length, 4, 'boss PNGs retired to the enemy-art casts; only the four ordinary-enemy samples load')
for (const asset of manifest.assets) {
  const path = resolve('public/assets/art/v1', asset.file)
  const bytes = readFileSync(path)
  assert.ok(bytes.length > 1000, `${asset.file} is unexpectedly small`)
  assert.equal(bytes.readUInt32BE(0), 0x89504e47, `${asset.file} is not PNG`)
  assert.equal(bytes.readUInt8(25), 6, `${asset.file} must be RGBA PNG`)
  assert.ok(statSync(path).size < 3_000_000, `${asset.file} exceeds the sample asset budget`)
  assert.ok(asset.fallback)
}
const assetManager = readFileSync(resolve('src/game/AssetManager.js'), 'utf8')
assert.match(assetManager, /_loadArtV1Images/)
assert.match(assetManager, /drawArt\(/)
for (const key of manifest.assets.map(asset => asset.key)) assert.match(assetManager, new RegExp(key))
// The boss art-V1 keys are retired: Arena bosses render through the enemy-art casts.
assert.doesNotMatch(assetManager, /artV1BorderWarden|artV1GateMarshal|artV1AshPaladin|artV1ThroneGuard|artV1BossMage|artV1BossArcher/, 'retired boss art keys must not load')
for (const file of ['Boss.js', 'ExpeditionBoss.js', 'BorderWarden.js']) {
  const src = readFileSync(resolve(`src/game/entities/${file}`), 'utf8')
  assert.doesNotMatch(src, /drawArt|artKey|artV1/, `${file} must not reference the legacy boss art path`)
}
const portrait = readFileSync(resolve('src/components/SlimeFamilyPortrait.vue'), 'utf8')
// Art V1 remains a historical asset sample for the enemy pipeline, but the
// active slime portrait must be the current shared family renderer.
assert.doesNotMatch(portrait, /assets\/art\/v1\/slime-/)
assert.match(portrait, /slime-art\/slime-painter\.js/)
const player = readFileSync(resolve('src/game/entities/Player.js'), 'utf8')
assert.doesNotMatch(player, /artV1Slime/, 'Player must not retain legacy slime Art V1 runtime paths')
assert.match(player, /renderSlimeFamilyBody/)
assert.match(player, /renderSlimeFamilyFace/)
for (const retired of ['SlimeRenderer', 'SlimeAppearance', 'ArenaOriginSlimeArt']) {
  assert.ok(!existsSync(resolve(`src/game/${retired}.js`)), `${retired}.js was retired with the family art`)
  assert.doesNotMatch(player, new RegExp(retired), `Player must not import retired ${retired}`)
}
const { SLIME_CAST, drawSlimeFamily, slimePose } = await import('./src/game/slime-art/slime-cast.js')
const { renderSlimeFamilyBody, renderSlimeFamilyFace, paintSlimeFamilySilhouette, slimeFamilyBodyState, slimeFamilyFaceState } = await import('./src/game/SlimeFamilyArtRenderer.js')
const gradient = { addColorStop() {} }
const recorder = () => new Proxy({}, {
  get(_t, prop) {
    if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => gradient
    return () => {}
  },
})
for (const id of ['origin', 'glutton', 'ricochet', 'elemental', 'shadow', 'summoner']) {
  assert.ok(SLIME_CAST[id]?.body && SLIME_CAST[id]?.face && SLIME_CAST[id]?.shape, `${id} needs body, face and shape`)
  // Every strain, pose, size (combat LOD r26 and portrait r100) and face flag must draw without throwing.
  for (const r of [26, 100]) {
    for (const pose of ['idle', 'move', 'charge', 'release', 'recover', 'hit']) {
      const st = slimePose(id, pose, pose === 'hit' ? .2 : 1.3)
      assert.ok(drawSlimeFamily(recorder(), id, r, { ...st, el: ['fire', 'water'] }), `${id}/${pose}/r${r} portrait draw`)
    }
    const ctx = recorder()
    const body = slimeFamilyBodyState(2.4, { bite: 0, swallowing: 1, elements: ['lightning'], hitJolt: .5, recoil: 1, coreGlow: 1 })
    assert.ok(renderSlimeFamilyBody(ctx, id, r, body), `${id} body bridge`)
    for (const flags of [{}, { hurt: true }, { blink: true }, { lowhp: true }, { angry: true }, { devour: true }, { bite: true }, { elements: ['fire', 'poison'], lookX: 1, lookY: -1 }]) {
      assert.ok(renderSlimeFamilyFace(ctx, id, r, slimeFamilyFaceState(1.1, flags)), `${id} face bridge ${JSON.stringify(flags)}`)
    }
    assert.ok(paintSlimeFamilySilhouette(ctx, id, r, { fill: '#fff', stroke: '#000', width: 2 }), `${id} silhouette bridge`)
  }
}
assert.equal(renderSlimeFamilyBody(recorder(), 'unknown-strain', 26), false, 'unknown strains report no art instead of throwing')
console.log(`Art V1 sample: ${manifest.assets.length} RGBA assets, manifest and fallback hooks verified`)
