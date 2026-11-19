// A failed read must never turn into an automatic overwrite of the only copy.
export function availableLocalStorage() {
  try { return globalThis.localStorage } catch { return null }
}

export function createRecoverableStorage(key, valid, storage = availableLocalStorage()) {
  let status = { state: 'new', savedAt: '', message: '' }
  let protectedRead = false
  const decode = (raw) => {
    const value = JSON.parse(raw)
    if (!valid(value)) throw new Error('invalid save')
    return value
  }
  return {
    get status() { return { ...status } },
    read() {
      protectedRead = false
      try {
        if (!storage) throw new Error('storage unavailable')
        const raw = storage.getItem(key)
        if (raw == null) return null
        try {
          const value = decode(raw)
          status = { state: 'ready', savedAt: '', message: '' }
          return value
        } catch {
          protectedRead = true
          // Keep the damaged primary untouched unless a good fallback AND an
          // archival copy of the damaged bytes both exist.
          const previous = storage.getItem(`${key}:previous`)
          if (previous != null) {
            try {
              const recovered = decode(previous)
              storage.setItem(`${key}:damaged:${Date.now()}`, raw)
              protectedRead = false
              status = { state: 'recovered', savedAt: '', message: '本机存档异常，已读取上一份有效副本；原始数据已保留。' }
              return recovered
            } catch { /* Preserve the original, including quota failures. */ }
          }
          status = { state: 'damaged', savedAt: '', message: '本机存档无法读取，原始数据已保留，未覆盖为新档。' }
          return null
        }
      } catch {
        protectedRead = true
        status = { state: 'unavailable', savedAt: '', message: '浏览器无法读取本机存档。' }
        return null
      }
    },
    write(value) {
      if (protectedRead) return false
      try {
        if (!storage || !valid(value)) throw new Error('storage unavailable')
        const next = JSON.stringify(value)
        const raw = storage.getItem(key)
        if (raw != null && raw !== next) {
          let healthy = false
          try { decode(raw); healthy = true } catch { /* Archive damaged bytes. */ }
          storage.setItem(healthy ? `${key}:previous` : `${key}:damaged:${Date.now()}`, raw)
        }
        storage.setItem(key, next)
        status = { ...status, state: status.state === 'recovered' ? 'recovered' : 'ready', savedAt: new Date().toISOString() }
        return true
      } catch {
        status = { state: 'unavailable', savedAt: '', message: '浏览器无法保存本机数据，请保持页面打开。' }
        return false
      }
    },
  }
}
