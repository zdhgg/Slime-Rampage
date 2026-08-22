import assert from 'node:assert/strict'
import {
  createSaveSlot,
  deleteSaveSlot,
  getActiveSave,
  loadSaveCatalog,
  saveSaveCatalog,
  switchSaveSlot,
  updateActiveSave,
} from './src/game/SaveManager.js'

const legacy = {
  version: 4,
  drops: 159,
  genes: { giant: 2 },
  records: {},
  progression: { highestDifficulty: 'hard', highestMode: 'timed' },
  preferences: { mode: 'timed', difficulty: 'hard' },
  sound: { muted: true },
}

let stored = JSON.stringify(legacy)
globalThis.localStorage = {
  getItem: () => stored,
  setItem: (_key, value) => {
    stored = value
  },
}

const catalog = loadSaveCatalog()
assert.equal(catalog.slots.length, 3)
assert.equal(catalog.activeSlotId, 'slot-1')
assert.equal(catalog.slots[0].data.drops, 159)
assert.equal(catalog.slots[0].data.genes.giant, 2)
assert.equal(catalog.settings.sound.muted, true)
assert.equal(catalog.slots[1], null)

const second = createSaveSlot(catalog, 1)
assert.equal(second.id, 'slot-2')
assert.equal(getActiveSave(catalog).drops, 0)
assert.deepEqual(getActiveSave(catalog).genes, {})

const secondSave = getActiveSave(catalog)
secondSave.drops = 7
updateActiveSave(catalog, secondSave)
switchSaveSlot(catalog, 'slot-1')
assert.equal(getActiveSave(catalog).drops, 159)

assert.equal(deleteSaveSlot(catalog, 'slot-1'), true)
assert.equal(catalog.activeSlotId, 'slot-2')
assert.equal(getActiveSave(catalog).drops, 7)
assert.equal(deleteSaveSlot(catalog, 'slot-2'), false)

saveSaveCatalog(catalog)
const reloaded = loadSaveCatalog()
assert.equal(reloaded.activeSlotId, 'slot-2')
assert.equal(getActiveSave(reloaded).drops, 7)
assert.equal(reloaded.settings.sound.muted, true)

delete globalThis.localStorage
console.log('✓ 三槽档案：旧档迁移、新建隔离、切换与保底删除均正常')
