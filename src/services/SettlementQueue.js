const PREFIX = 'slime-account-settlement:'

// 每张票据单独暂存，两个标签页不会覆盖彼此的待同步结算。
export function createSettlementQueue(storage = globalThis.localStorage) {
  const volatile = new Map()
  let running = false
  let readable = true
  function list(accountId) {
    const jobs = new Map()
    try {
      if (!storage) throw new Error('storage unavailable')
      for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index)
        if (!key?.startsWith(PREFIX)) continue
        const job = JSON.parse(storage.getItem(key))
        if (job?.ticketId && job.accountId && job.run) jobs.set(job.ticketId, job)
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
      if (job) storage.setItem(PREFIX + id, JSON.stringify(job))
      else storage.removeItem(PREFIX + id)
      volatile.delete(id)
    } catch { volatile.set(id, job) }
  }
  return {
    list,
    get durable() { return readable && volatile.size === 0 },
    get running() { return running },
    discard(accountId, ticketId) {
      if (!running && list(accountId).some(job => job.ticketId === ticketId && job.failed)) persist(ticketId, null)
    },
    add(job) {
      if (!list(job.accountId).some(item => item.ticketId === job.ticketId)) {
        persist(job.ticketId, { ...job, createdAt: new Date().toISOString(), error: '', failed: false })
      }
    },
    async flush(accountId, submit, onSuccess, { retryFailed = false, isCurrent = () => true, onChange = () => {} } = {}) {
      if (running || !accountId) return
      running = true
      onChange()
      try {
        for (const job of list(accountId)) {
          if (!isCurrent() || (job.failed && !retryFailed)) continue
          let result
          try {
            result = await submit(job)
          } catch (error) {
            job.error = error.message || '同步失败'
            job.status = error.status || 0
            job.failed = error.status >= 400 && error.status < 500 && ![401, 408, 429].includes(error.status)
            persist(job.ticketId, job)
            onChange()
            if (!job.failed) break
            continue
          }
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
