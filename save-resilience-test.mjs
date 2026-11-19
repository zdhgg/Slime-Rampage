import assert from 'node:assert/strict'
import { createRecoverableStorage } from './src/services/RecoverableStorage.js'
import { createSettlementQueue, SETTLEMENT_PREFIX } from './src/services/SettlementQueue.js'
import { createRunCheckpointStore } from './src/services/RunCheckpointStore.js'
import { defaultSave, loadSaveCatalog, saveSaveCatalog } from './src/game/SaveManager.js'

const memory = () => {
  const values = new Map()
  return { values, get length() { return values.size }, key: i => [...values.keys()][i],
    getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) }
}
const storage = memory()
const valid = value => Number.isInteger(value?.progress)
let store = createRecoverableStorage('save', valid, storage)
assert.equal(store.read(), null)
assert.equal(store.write({ progress: 10 }), true)
assert.equal(store.write({ progress: 20 }), true)
storage.setItem('save', '{broken')
store = createRecoverableStorage('save', valid, storage)
assert.deepEqual(store.read(), { progress: 10 })
assert.equal(store.status.state, 'recovered')
assert.equal(storage.getItem('save'), '{broken', 'reading must not overwrite damaged bytes')
assert.equal(store.write({ progress: 11 }), true)
assert.ok([...storage.values.values()].includes('{broken'))
const damaged = memory()
damaged.setItem('save', '{broken')
store = createRecoverableStorage('save', valid, damaged)
assert.equal(store.read(), null)
assert.equal(store.write({ progress: 0 }), false)
assert.equal(damaged.getItem('save'), '{broken')
const quota = { ...damaged, setItem() { throw new Error('quota') } }
store = createRecoverableStorage('save', valid, quota)
assert.equal(store.read(), null)
assert.equal(store.write({ progress: 0 }), false)
const local = memory()
globalThis.localStorage = local
local.setItem('slime-rampage-save', 'null')
const blank = loadSaveCatalog()
assert.equal(saveSaveCatalog(blank), false)
assert.equal(local.getItem('slime-rampage-save'), 'null')
delete globalThis.localStorage
Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked') } })
assert.doesNotThrow(() => createSettlementQueue().add({ accountId: 1, ticketId: 'blocked', run: {} }))
assert.doesNotThrow(() => loadSaveCatalog())
delete globalThis.localStorage
const malformed = memory()
malformed.setItem('slime-rampage-save', JSON.stringify({ version: 6, drops: 100, genes: null }))
globalThis.localStorage = malformed
assert.equal(saveSaveCatalog(loadSaveCatalog()), false)
assert.equal(JSON.parse(malformed.getItem('slime-rampage-save')).genes, null)
delete globalThis.localStorage
console.log('✓ Damaged local saves retain original bytes; good fallback and quota protection work')

let clock = 10000
const queueStorage = memory()
queueStorage.setItem(SETTLEMENT_PREFIX + 'broken', '{invalid')
const queue = createSettlementQueue(queueStorage, { now: () => clock })
const job = { ticketId: 'healthy', accountId: 1, saveEpoch: 'epoch', serverId: 'server', run: { score: 3 } }
queue.add(job)
assert.equal(queue.damagedCount, 1)
assert.equal(queue.list(1).length, 1)
let calls = 0
await queue.flush(1, async () => { calls++; throw new Error('offline') }, () => assert.fail())
assert.equal(queue.list(1)[0].attempts, 1)
assert.equal(queue.list(1)[0].nextRetryAt, 15000)
await queue.flush(1, () => assert.fail('must respect backoff'), () => {})
clock = 15000
await queue.flush(1, async () => { calls++; throw new Error('offline') }, () => assert.fail())
assert.equal(queue.list(1)[0].nextRetryAt, 25000)
const exported = queue.export(1)
const imported = createSettlementQueue(memory())
assert.throws(() => imported.import(exported, 2))
imported.import(exported, 1)
assert.equal(imported.list(1).length, 1)
await queue.flush(1, async () => ({ confirmed: true }), () => calls++, { force: true })
assert.equal(queue.list(1).length, 0)
assert.equal(calls, 3)
assert.equal(queueStorage.getItem(SETTLEMENT_PREFIX + 'broken'), '{invalid')
console.log('✓ Malformed settlement isolation, retry backoff, forced reconnect and rescue export/import work')

const checkpointStorage = memory()
const checkpoints = createRunCheckpointStore(checkpointStorage)
const catalog = { serverId: 'server', saveEpoch: 'epoch' }
checkpoints.select(1, catalog)
const context = { accountId: 1, ticketId: 'ticket', saveEpoch: 'epoch', serverId: 'server' }
const snapshot = { version: 1, gameplay: 'arena', label: 'chapter 2' }
assert.ok(checkpoints.save(context, snapshot))
assert.equal(checkpoints.select(2, catalog), null)
assert.equal(checkpoints.select(1, { ...catalog, saveEpoch: 'restored' }), null)
assert.equal(checkpoints.select(1, catalog).ticketId, 'ticket')
const checkpointKey = 'slime-rampage-checkpoint:server:1'
const intactCheckpoint = checkpointStorage.getItem(checkpointKey)
const changedCheckpoint = JSON.parse(intactCheckpoint)
changedCheckpoint.snapshot.label = 'damaged valid JSON'
checkpointStorage.setItem(checkpointKey, JSON.stringify(changedCheckpoint))
assert.equal(checkpoints.select(1, catalog), null, 'integrity check must reject modified contents')
assert.equal(checkpoints.status.state, 'damaged')
checkpointStorage.setItem(checkpointKey, intactCheckpoint)
checkpoints.select(1, catalog)
checkpoints.clear('other-ticket')
assert.ok(checkpoints.select(1, catalog))
checkpoints.clear('ticket')
assert.equal(checkpoints.select(1, catalog), null)
console.log('✓ Continuations are isolated by server, account and restored timeline')
