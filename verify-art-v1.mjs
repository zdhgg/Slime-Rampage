import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const manifest = JSON.parse(readFileSync(resolve('public/assets/art/v1/manifest.json'), 'utf8'))
assert.equal(manifest.version, 'v1')
assert.equal(manifest.assets.length, 16)
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
const portrait = readFileSync(resolve('src/components/SlimePortrait.vue'), 'utf8')
// Arena origin now has a procedural body and live face. Its Art V1 PNG stays
// in the manifest for historical assets/other modes, but must not be wired
// into the portrait as the runtime art path.
for (const file of manifest.assets
  .filter(asset => (asset.role.includes('slime') || asset.role === 'player') && asset.key !== 'artV1SlimeOrigin')
  .map(asset => asset.file)) {
  assert.match(portrait, new RegExp(file.replaceAll('.', '\\.')), `${file} missing from frontend portrait`)
}
assert.doesNotMatch(portrait, /slime-origin-v1\.png/, 'Arena origin must use the procedural portrait')
const originArt = readFileSync(resolve('src/game/ArenaOriginSlimeArt.js'), 'utf8')
assert.match(originArt, /renderArenaOriginBody/)
assert.match(originArt, /renderArenaOriginFace/)
const player = readFileSync(resolve('src/game/entities/Player.js'), 'utf8')
assert.doesNotMatch(player, /artV1SlimeOrigin/, 'Arena origin must not retain an Art V1 runtime path')
console.log(`Art V1 sample: ${manifest.assets.length} RGBA assets, manifest and fallback hooks verified`)
