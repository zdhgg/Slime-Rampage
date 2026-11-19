import { availableLocalStorage, createRecoverableStorage } from './RecoverableStorage.js'
import { CHECKPOINT_VERSION } from '../game/SaveProtocol.js'

const valid = value => value?.version === CHECKPOINT_VERSION && typeof value.ticketId === 'string'
  && ['arena', 'tower-defense'].includes(value.snapshot?.gameplay) && value.accountId && value.saveEpoch
  && value.checksum === checksum(value.snapshot)

// Detect valid JSON whose contents changed in storage; this is an integrity
// check for local corruption, not a signature or an anti-cheat boundary.
function checksum(snapshot) {
  let hash = 2166136261
  for (const char of JSON.stringify(snapshot)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0
  return hash.toString(16)
}

export function createRunCheckpointStore(storage = availableLocalStorage()) {
  let selected = null
  let store = null
  let key = ''
  return {
    select(accountId, catalog) {
      const nextKey = `slime-rampage-checkpoint:${catalog?.serverId || 'legacy'}:${accountId || 'guest'}`
      if (key !== nextKey) {
        key = nextKey
        store = createRecoverableStorage(key, valid, storage)
      }
      selected = accountId && catalog?.saveEpoch ? { accountId, saveEpoch: catalog.saveEpoch } : null
      const value = store.read()
      // Restored accounts and other accounts never resume the old timeline.
      return selected && value?.accountId === accountId && value.saveEpoch === selected.saveEpoch ? value : null
    },
    save(context, snapshot) {
      if (!selected || context?.accountId !== selected.accountId || context.saveEpoch !== selected.saveEpoch) return null
      const value = { version: CHECKPOINT_VERSION, ...context, snapshot, checksum: checksum(snapshot), savedAt: new Date().toISOString() }
      return store.write(value) ? value : null
    },
    clear(ticketId) {
      if (!store || !selected) return
      const current = store.read()
      if (current?.ticketId !== ticketId) return
      try { storage.removeItem(key); storage.removeItem(`${key}:previous`) } catch { /* A completed ticket cannot resume on the server. */ }
    },
    get status() { return store?.status || { state: 'new' } },
  }
}
