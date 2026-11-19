import { availableLocalStorage } from './RecoverableStorage.js'

export const SETTLEMENT_PREFIX = 'slime-account-settlement:'
const RETRY_BASE = 5000
const RETRY_MAX = 5 * 60 * 1000

// One key per ticket; malformed records never prevent healthy records syncing.
export function createSettlementQueue(storage = availableLocalStorage(), { now = Date.now } = {}) {
  const volatile = new Map()
  let running = false
  let readable = true
  let damaged = []
  function list(accountId) {
    const jobs = new Map()
    damaged = []
    try {
      if (!storage) throw new Error('storage unavailable')
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
      for (const key of keys) {
        if (!key?.startsWith(SETTLEMENT_PREFIX)) continue
        try {
          const job = JSON.parse(storage.getItem(key))
          if (!job?.ticketId || !job.accountId || !job.run || typeof job.run !== 'object'
            || key !== SETTLEMENT_PREFIX + job.ticketId) throw new Error('invalid record')
          jobs.set(job.ticketId, { ...job, createdAt: typeof job.createdAt === 'string' ? job.createdAt : '',
            attempts: Number(job.attempts) || 0, nextRetryAt: Number(job.nextRetryAt) || 0 })
        } catch { damaged.push(key) }
      }
      readable = true
    } catch { readable = false }
    for (const [id, job] of volatile) {
      if (job) jobs.set(id, job)
      else jobs.delete(id)
    }
    return [...jobs.values()].filter(job => job.accountId === accountId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }
  function persist(id, job) {
    try {
      if (!storage) throw new Error('storage unavailable')
      if (job) storage.setItem(SETTLEMENT_PREFIX + id, JSON.stringify(job))
      else storage.removeItem(SETTLEMENT_PREFIX + id)
      volatile.delete(id)
    } catch { volatile.set(id, job) }
  }
  return {
    list,
    get damagedCount() { return damaged.length },
    get durable() { return readable && volatile.size === 0 },
    get running() { return running },
    export(accountId) {
      const jobs = list(accountId)
      return { kind: 'slime-rampage-pending-settlements', format: 1,
        exportedAt: new Date(now()).toISOString(), accountId, jobs }
    },
    import(payload, accountId) {
      if (payload?.kind !== 'slime-rampage-pending-settlements' || payload.format !== 1
        || payload.accountId !== accountId || !Array.isArray(payload.jobs)
        || payload.jobs.some(job => job?.accountId !== accountId || typeof job.ticketId !== 'string'
          || !job.run || typeof job.run !== 'object' || Array.isArray(job.run))) throw new Error('待同步文件无效，或不属于当前账号')
      const existing = new Set(list(accountId).map(job => job.ticketId))
      for (const job of payload.jobs) {
        if (existing.has(job.ticketId)) continue
        persist(job.ticketId, { ...job, createdAt: typeof job.createdAt === 'string' ? job.createdAt : new Date(now()).toISOString(),
          attempts: Number(job.attempts) || 0, nextRetryAt: 0 })
        existing.add(job.ticketId)
      }
    },
    discard(accountId, ticketId) {
      if (!running && list(accountId).some(job => job.ticketId === ticketId && job.failed)) persist(ticketId, null)
    },
    add(job) {
      if (!list(job.accountId).some(item => item.ticketId === job.ticketId)) {
        persist(job.ticketId, { ...job, createdAt: new Date(now()).toISOString(), error: '', failed: false,
          attempts: 0, nextRetryAt: 0 })
      }
    },
    async flush(accountId, submit, onSuccess, { retryFailed = false, force = false,
      isCurrent = () => true, onChange = () => {} } = {}) {
      if (running || !accountId) return
      running = true
      onChange()
      try {
        for (const job of list(accountId)) {
          if (!isCurrent() || (job.failed && !retryFailed)
            || (!force && !retryFailed && job.nextRetryAt > now())) continue
          let result
          try { result = await submit(job) }
          catch (error) {
            job.error = error.message || '同步失败'
            job.status = error.status || 0
            job.failed = error.status >= 400 && error.status < 500 && ![401, 408, 429].includes(error.status)
            job.attempts++
            job.nextRetryAt = job.failed ? 0 : now() + Math.min(RETRY_MAX, RETRY_BASE * 2 ** Math.min(job.attempts - 1, 6))
            persist(job.ticketId, job)
            onChange()
            if (!job.failed) break
            continue
          }
          // submit validates the server acknowledgement before returning.
          persist(job.ticketId, null)
          if (isCurrent()) onSuccess(job, result)
          onChange()
        }
      } finally {
        running = false
        onChange()
      }
    },
  }
}
