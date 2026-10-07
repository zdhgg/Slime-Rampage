import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { generateDecor, drawBgItem, drawFgItem } from './src/game/MapDecor.js'
import { CHAPTER_SCENES, paintChapterGround, chapterPropAlpha, prepareChapterSprites } from './src/game/ChapterScenery.js'
import { getExpeditionStages } from './src/game/RunRules.js'

const stages = getExpeditionStages('hell').filter(stage => stage.variant !== 'nest-border')
const signatures = new Set()
for (const stage of stages) {
  assert.ok(CHAPTER_SCENES[stage.variant], `missing scene: ${stage.variant}`)
  for (const [w, h] of [[2400, 1800], [3840, 2160], [6000, 4000]]) {
    for (const seed of [1, 7, 42]) {
      const options = { themeId: stage.theme, variant: stage.variant, spawn: stage.spawn, seed }
      const decor = generateDecor(w, h, options)
      assert.deepEqual(generateDecor(w, h, options), decor, 'seeded scenery must rebuild identically')
      assert.ok(decor.fg.length > 5 && decor.fg.length <= 70, 'foreground density must be bounded')
      assert.ok(decor.bg.length < 450, 'background density must be bounded')
      const sx = (stage.spawn?.x ?? 0.5) * w, sy = (stage.spawn?.y ?? 0.5) * h
      const roads = decor.bg.filter(item => item.type === 'road')
      for (const item of decor.fg) {
        assert.ok(Number.isFinite(item.x) && Number.isFinite(item.y))
        assert.ok(Math.hypot(item.x - sx, item.y - sy) >= 210, 'spawn stays readable')
        assert.ok(item.x >= 70 && item.x <= w - 70 && item.y >= 110 && item.y <= h - 70)
        for (const road of roads) assert.ok(Math.abs(-(item.x - road.x) * Math.sin(road.angle) + (item.y - road.y) * Math.cos(road.angle)) > road.width / 2 + 65)
      }
    }
  }
  const hash = createHash('sha256')
  let depth = 0
  const ctx = new Proxy({}, {
    get: (_, key) => (...args) => {
      hash.update(JSON.stringify([key, args]))
      if (key === 'save') depth++
      if (key === 'restore') { depth--; assert.ok(depth >= 0) }
      if (String(key).includes('Gradient')) return { addColorStop: (...stops) => hash.update(JSON.stringify(stops)) }
    },
    set: (_, key, value) => { hash.update(JSON.stringify([key, value])); return true },
  })
  const options = { themeId: stage.theme, variant: stage.variant, spawn: stage.spawn, seed: 42 }
  const { bg, fg } = generateDecor(2400, 1800, options)
  paintChapterGround(ctx, 2400, 1800, 42, stage.theme, stage.variant)
  for (const item of bg) drawBgItem(ctx, item, stage.theme)
  for (const item of fg) drawFgItem(ctx, item, 0, stage.theme, null, [])
  assert.equal(depth, 0, 'each scene must restore its drawing state')
  signatures.add(hash.digest('hex'))
}
assert.equal(signatures.size, stages.length, 'each chapter has a distinct composition')

const item = { type: 'chapter-prop', theme: 'royal', variant: 'sanctum', prop: 'pillar', x: 500, y: 500, s: 1 }
assert.ok(chapterPropAlpha(item, { x: 500, y: 460 }, []) < 0.25)
assert.ok(chapterPropAlpha(item, null, [{ x: 500, y: 460, active: true }]) < 0.25)
assert.ok(chapterPropAlpha(item, null, [{ x: 500, y: 460, active: false }]) > 0.8)
let created = 0
const ctx = new Proxy({}, { get: () => () => {}, set: () => true })
globalThis.document = { createElement() { created++; return { getContext: () => ctx } } }
const items = Array.from({ length: 40 }, () => ({ ...item }))
prepareChapterSprites(items, 1)
assert.equal(created, 1, 'identical architecture shares one cached sprite')
assert.ok(items.every(prop => prop.sprite === items[0].sprite))
prepareChapterSprites(items, 2)
assert.equal(created, 2, 'DPR switch creates only one additional sprite')
console.log(`✓ ${stages.length} 个后续章节：布局区分、固定种子、密度上限、出生与道路留白、遮挡淡化及 DPR 缓存通过`)
