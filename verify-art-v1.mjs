import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const manifest = JSON.parse(readFileSync(resolve('public/assets/art/v1/manifest.json'), 'utf8'))
assert.equal(manifest.version, 'v1')
assert.equal(manifest.assets.length, 3)
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
console.log(`Art V1 sample: ${manifest.assets.length} RGBA assets, manifest and fallback hooks verified`)
