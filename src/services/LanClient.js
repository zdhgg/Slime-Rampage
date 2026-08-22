const DEFAULT_TIMEOUT = 8000

export class LanApiError extends Error {
  constructor(message, status = 0, code = 'network_error', details = null) {
    super(message)
    this.name = 'LanApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

async function request(path, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeout || DEFAULT_TIMEOUT)
  try {
    const response = await fetch(path, {
      method: options.method || 'GET',
      credentials: 'same-origin',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      throw new LanApiError(
        payload?.error?.message || `请求失败（${response.status}）`,
        response.status,
        payload?.error?.code || 'request_failed',
        payload?.error?.details || null
      )
    }
    return payload
  } catch (error) {
    if (error instanceof LanApiError) throw error
    if (error?.name === 'AbortError') {
      throw new LanApiError('局域网服务器响应超时', 0, 'timeout')
    }
    throw new LanApiError('无法连接局域网服务器', 0, 'network_error')
  } finally {
    clearTimeout(timeout)
  }
}

export const lanApi = {
  status: () => request('/api/status', { timeout: 2500 }),
  me: () => request('/api/auth/me'),
  register: (credentials) => request('/api/auth/register', { method: 'POST', body: credentials }),
  login: (credentials) => request('/api/auth/login', { method: 'POST', body: credentials }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  profile: () => request('/api/profile'),
  createSlot: (index) => request('/api/profiles', { method: 'POST', body: { index } }),
  switchSlot: (id) => request(`/api/profiles/${encodeURIComponent(id)}/activate`, { method: 'POST' }),
  deleteSlot: (id) => request(`/api/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  importSlot: (slot) => request('/api/profile/import', { method: 'POST', body: { slot } }),
  updatePreferences: (preferences) =>
    request('/api/profile/preferences', { method: 'PATCH', body: { preferences } }),
  buyGene: (geneId) =>
    request(`/api/profile/genes/${encodeURIComponent(geneId)}/purchase`, { method: 'POST' }),
  startRun: (selection) => request('/api/runs/start', { method: 'POST', body: selection }),
  finishRun: (ticketId, run) =>
    request(`/api/runs/${encodeURIComponent(ticketId)}/finish`, {
      method: 'POST',
      body: { run },
      timeout: 15000,
    }),
  leaderboard: ({ mode, difficulty, limit = 50 }) => {
    const query = new URLSearchParams({ mode, difficulty, limit: String(limit) })
    return request(`/api/leaderboard?${query}`)
  },
}
