const DEFAULT_TIMEOUT = 8000

export class AccountApiError extends Error {
  constructor(message, status = 0, code = 'network_error', details = null) {
    super(message)
    this.name = 'AccountApiError'
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
      throw new AccountApiError(
        payload?.error?.message || `请求失败（${response.status}）`,
        response.status,
        payload?.error?.code || 'request_failed',
        payload?.error?.details || null
      )
    }
    if (!payload || typeof payload !== 'object') {
      throw new AccountApiError('服务器返回了无效数据，请稍后重试', 502, 'invalid_response')
    }
    return payload
  } catch (error) {
    if (error instanceof AccountApiError) throw error
    if (error?.name === 'AbortError') {
      throw new AccountApiError('服务器响应超时', 0, 'timeout')
    }
    throw new AccountApiError('无法连接游戏服务器，请检查连接后重试', 0, 'network_error')
  } finally {
    clearTimeout(timeout)
  }
}

export const accountApi = {
  status: () => request('/api/status', { timeout: 2500 }),
  me: () => request('/api/auth/me'),
  records: (page = 1, gameplay = 'all') => request(`/api/account/records?${new URLSearchParams({ page: String(page), gameplay })}`),
  importCampaign: (campaign) => request('/api/account/import-campaign', { method: 'POST', body: { campaign } }),
  completeTutorial: () => request('/api/account/tutorial', { method: 'POST' }),
  register: (credentials) => request('/api/auth/register', { method: 'POST', body: credentials }),
  login: (credentials) => request('/api/auth/login', { method: 'POST', body: credentials }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  profile: () => request('/api/profile'),
  createSlot: (index) => request('/api/profiles', { method: 'POST', body: { index } }),
  switchSlot: (id) => request(`/api/profiles/${encodeURIComponent(id)}/activate`, { method: 'POST' }),
  deleteSlot: (id) => request(`/api/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  importSlot: (slot, campaign) => request('/api/profile/import', { method: 'POST', body: { slot, campaign } }),
  updatePreferences: (preferences) =>
    request('/api/profile/preferences', { method: 'PATCH', body: { preferences } }),
  buyGene: (geneId) =>
    request(`/api/profile/genes/${encodeURIComponent(geneId)}/purchase`, { method: 'POST' }),
  startRun: (selection) => request('/api/runs/start', { method: 'POST', body: selection }),
  finishRun: async (ticketId, run) => {
    const payload = await request(`/api/runs/${encodeURIComponent(ticketId)}/finish`, {
      method: 'POST',
      body: { run },
      timeout: 15000,
    })
    if (!payload.result?.runId || !payload.catalog || !payload.accountData) {
      throw new AccountApiError('结算尚未得到服务器确认，请重试同步', 502, 'invalid_settlement')
    }
    return payload
  },
  leaderboard: ({ gameplay = 'arena', mode, difficulty, limit = 20, page = 1 }) => {
    const query = new URLSearchParams({ gameplay, mode, difficulty, limit: String(limit), page: String(page) })
    return request(`/api/leaderboard?${query}`)
  },
}
