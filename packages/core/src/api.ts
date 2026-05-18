import type { HermesApiResponse, HubCommand, HubNode, LogEntry, ManagedAgent, ProfileRow } from './types'
import type { HubUser, LoginResponse, AuthStatusResponse } from '@hermes-hub/protocol'

export interface HubConfig {
  paths: string[]
}

export interface CreateProfilePayload {
  name: string
  cloneMode: 'blank' | 'clone' | 'clone-all'
  cloneFrom?: string
  noAlias?: boolean
}

export interface CreateProfileResult {
  name: string
  commandId: string
  status: HubCommand['status']
  stdout?: string
  nextSteps: string[]
}

export interface RenameProfileResult {
  name: string
  renamed: boolean
  commandId?: string
}

export class HermesApiClient {
  constructor(private baseUrl: string = '') {}

  private authToken: string | null = null

  setAuthToken(token: string | null): void {
    this.authToken = token
  }

  clearAuthToken(): void {
    this.authToken = null
  }

  getAuthToken(): string | null {
    return this.authToken
  }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {}
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`
    }
    return headers
  }

  private parseEnvelope<T>(payload: unknown): HermesApiResponse<T> {
    if (payload && typeof payload === 'object' && 'ok' in payload) {
      const envelope = payload as HermesApiResponse<T>
      return envelope.ok ? { ok: true, data: envelope.data } : { ok: false, error: envelope.error ?? 'Unknown API error' }
    }
    return { ok: true, data: payload as T }
  }

  private async parseErrorResponse(res: Response): Promise<HermesApiResponse<never>> {
    try {
      const payload = await res.json()
      const envelope = this.parseEnvelope<never>(payload)
      if (!envelope.ok) return envelope
    } catch {
      // Fall through to the generic HTTP message.
    }
    return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` }
  }

  private async get<T>(path: string): Promise<HermesApiResponse<T>> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        headers: { ...this.authHeaders(), Accept: 'application/json' },
      })
      if (res.status === 401) { this.clearAuthToken() }
      if (!res.ok) {
        return this.parseErrorResponse(res)
      }
      const payload = await res.json()
      return this.parseEnvelope<T>(payload)
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  private async getText(path: string): Promise<HermesApiResponse<string>> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        headers: { Accept: 'text/plain, text/markdown, text/yaml, application/json' },
      })
      if (!res.ok) {
        return this.parseErrorResponse(res)
      }
      return { ok: true, data: await res.text() }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  private async put<T>(path: string, body: unknown): Promise<HermesApiResponse<T>> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'PUT',
        headers: { ...this.authHeaders(), 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.status === 401) { this.clearAuthToken() }
      if (!res.ok) {
        return this.parseErrorResponse(res)
      }
      const payload = await res.json()
      return this.parseEnvelope<T>(payload)
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  private async post<T>(path: string, body: unknown): Promise<HermesApiResponse<T>> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { ...this.authHeaders(), 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.status === 401) { this.clearAuthToken() }
      if (!res.ok) {
        return this.parseErrorResponse(res)
      }
      const payload = await res.json()
      return this.parseEnvelope<T>(payload)
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  private async del<T>(path: string): Promise<HermesApiResponse<T>> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'DELETE',
        headers: { ...this.authHeaders(), Accept: 'application/json' },
      })
      if (res.status === 401) { this.clearAuthToken() }
      if (!res.ok) {
        return this.parseErrorResponse(res)
      }
      const payload = await res.json()
      return this.parseEnvelope<T>(payload)
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  async listProfiles(): Promise<HermesApiResponse<ProfileRow[]>> {
    const result = await this.listAgents()
    if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Failed to fetch agents' }
    return { ok: true, data: result.data.map((agent) => this.agentToProfileRow(agent)) }
  }

  async getProfile(id: string): Promise<HermesApiResponse<ProfileRow>> {
    const result = await this.getAgent(id)
    if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Failed to fetch agent' }
    return { ok: true, data: this.agentToProfileRow(result.data) }
  }

  async listNodes(): Promise<HermesApiResponse<HubNode[]>> {
    return this.get<HubNode[]>('/api/nodes')
  }

  async getNode(id: string): Promise<HermesApiResponse<HubNode>> {
    return this.get<HubNode>(`/api/nodes/${encodeURIComponent(id)}`)
  }

  async updateNode(id: string, fields: Partial<Pick<HubNode, 'name' | 'status' | 'tags'>>): Promise<HermesApiResponse<HubNode>> {
    return this.put<HubNode>(`/api/nodes/${encodeURIComponent(id)}`, fields)
  }

  async deleteNode(id: string): Promise<HermesApiResponse<null>> {
    return this.del<null>(`/api/nodes/${encodeURIComponent(id)}`)
  }

  async getRegistrationToken(): Promise<HermesApiResponse<{ token: string; enabled: boolean }>> {
    return this.get<{ token: string; enabled: boolean }>('/api/settings/registration-token')
  }

  // Auth methods (Phase 9)
  async login(username: string, password: string): Promise<HermesApiResponse<LoginResponse>> {
    return this.post<LoginResponse>('/api/auth/login', { username, password })
  }

  async getAuthStatus(): Promise<HermesApiResponse<AuthStatusResponse>> {
    return this.get<AuthStatusResponse>('/api/auth/status')
  }

  async changePassword(newPassword: string): Promise<HermesApiResponse<{ message: string }>> {
    return this.post<{ message: string }>('/api/auth/change-password', { newPassword })
  }

  async listAgents(): Promise<HermesApiResponse<ManagedAgent[]>> {
    return this.get<ManagedAgent[]>('/api/agents')
  }

  async getAgent(id: string): Promise<HermesApiResponse<ManagedAgent>> {
    return this.get<ManagedAgent>(`/api/agents/${encodeURIComponent(id)}`)
  }

  async createProfile(payload: CreateProfilePayload): Promise<HermesApiResponse<CreateProfileResult>> {
    const result = await this.post<HubCommand>('/api/profiles', payload)
    if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Failed to queue create command' }
    return {
      ok: true,
      data: {
        name: payload.name,
        commandId: result.data.id,
        status: result.data.status,
        nextSteps: [`Command queued: ${result.data.id}`, 'Waiting for Hub Agent heartbeat to refresh agents.'],
      },
    }
  }

  async renameProfile(id: string, name: string): Promise<HermesApiResponse<RenameProfileResult>> {
    const result = await this.put<HubCommand>(`/api/profiles/${encodeURIComponent(id)}/rename`, { name })
    if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Failed to queue rename command' }
    return { ok: true, data: { name, renamed: false, commandId: result.data.id } }
  }

  async deleteProfile(id: string): Promise<HermesApiResponse<{ commandId: string }>> {
    const result = await this.del<HubCommand>(`/api/profiles/${encodeURIComponent(id)}`)
    if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Failed to queue delete command' }
    return { ok: true, data: { commandId: result.data.id } }
  }

  // Gateway 控制：对单个 agent 发起 start/stop/restart 命令
  async startGateway(id: string): Promise<HermesApiResponse<HubCommand>> {
    const result = await this.post<HubCommand>(`/api/profiles/${encodeURIComponent(id)}/gateway/start`, {})
    if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Failed to queue gateway start' }
    return { ok: true, data: result.data }
  }

  async stopGateway(id: string): Promise<HermesApiResponse<HubCommand>> {
    const result = await this.post<HubCommand>(`/api/profiles/${encodeURIComponent(id)}/gateway/stop`, {})
    if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Failed to queue gateway stop' }
    return { ok: true, data: result.data }
  }

  async restartGateway(id: string): Promise<HermesApiResponse<HubCommand>> {
    const result = await this.post<HubCommand>(`/api/profiles/${encodeURIComponent(id)}/gateway/restart`, {})
    if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Failed to queue gateway restart' }
    return { ok: true, data: result.data }
  }

  // Setup / Doctor
  async runSetup(id: string, section: string = 'all'): Promise<HermesApiResponse<HubCommand>> {
    const result = await this.post<HubCommand>(`/api/profiles/${encodeURIComponent(id)}/setup`, { section })
    if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Failed to queue setup' }
    return { ok: true, data: result.data }
  }

  async runDoctor(id: string): Promise<HermesApiResponse<HubCommand>> {
    const result = await this.post<HubCommand>(`/api/profiles/${encodeURIComponent(id)}/doctor`, {})
    if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Failed to queue doctor' }
    return { ok: true, data: result.data }
  }

  async listCommands(): Promise<HermesApiResponse<HubCommand[]>> {
    return this.get<HubCommand[]>('/api/commands')
  }

  async getCommand(id: string): Promise<HermesApiResponse<HubCommand>> {
    return this.get<HubCommand>(`/api/commands/${encodeURIComponent(id)}`)
  }

  // 轮询命令直到到达终态（success/failed/timeout/cancelled）
  async waitForCommand(id: string, maxWaitMs = 30_000): Promise<HermesApiResponse<HubCommand>> {
    const deadline = Date.now() + maxWaitMs
    let lastError: string | undefined
    while (Date.now() < deadline) {
      const result = await this.getCommand(id)
      if (!result.ok || !result.data) {
        lastError = result.error
        await new Promise((resolve) => setTimeout(resolve, 1000))
        continue
      }
      const command = result.data
      // 终态：success, failed, timeout, cancelled
      if (command.status === 'success' || command.status === 'failed' || command.status === 'timeout' || command.status === 'cancelled') {
        return { ok: true, data: command }
      }
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    return { ok: false, error: lastError ?? `Command '${id}' did not complete within ${maxWaitMs / 1000}s` }
  }

  // Config — 通过 command queue 异步读取（Phase 6）
  async getProfileConfig(id: string): Promise<HermesApiResponse<string>> {
    const result = await this.post<HubCommand>(`/api/profiles/${encodeURIComponent(id)}/config/read`, {})
    if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Failed to queue config.read' }
    const final = await this.waitForCommand(result.data.id)
    if (!final.ok || !final.data) return { ok: false, error: final.error ?? 'Command failed' }
    if (final.data.status === 'failed') return { ok: false, error: final.data.stderr || 'config.read failed' }
    return { ok: true, data: final.data.stdout ?? '' }
  }

  async updateProfileConfig(id: string, content: string): Promise<HermesApiResponse<null>> {
    const result = await this.post<HubCommand>(`/api/profiles/${encodeURIComponent(id)}/config.yaml`, { content })
    if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Failed to queue config.patch' }
    const final = await this.waitForCommand(result.data.id)
    if (!final.ok || !final.data) return { ok: false, error: final.error ?? 'Command failed' }
    if (final.data.status === 'failed') return { ok: false, error: final.data.stderr || 'config.patch failed' }
    return { ok: true, data: null }
  }

  // SOUL — 通过 command queue 异步读取（Phase 6）
  async getProfileSoul(id: string): Promise<HermesApiResponse<string>> {
    const result = await this.post<HubCommand>(`/api/profiles/${encodeURIComponent(id)}/soul/read`, {})
    if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Failed to queue soul.read' }
    const final = await this.waitForCommand(result.data.id)
    if (!final.ok || !final.data) return { ok: false, error: final.error ?? 'Command failed' }
    if (final.data.status === 'failed') return { ok: false, error: final.data.stderr || 'soul.read failed' }
    return { ok: true, data: final.data.stdout ?? '' }
  }

  async updateProfileSoul(id: string, content: string): Promise<HermesApiResponse<null>> {
    const result = await this.post<HubCommand>(`/api/profiles/${encodeURIComponent(id)}/SOUL.md`, { content })
    if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Failed to queue soul.update' }
    const final = await this.waitForCommand(result.data.id)
    if (!final.ok || !final.data) return { ok: false, error: final.error ?? 'Command failed' }
    if (final.data.status === 'failed') return { ok: false, error: final.data.stderr || 'soul.update failed' }
    return { ok: true, data: null }
  }

  // Skills — 通过 command queue 异步读取（Phase 6）
  async getProfileSkills(id: string): Promise<HermesApiResponse<string[]>> {
    const result = await this.post<HubCommand>(`/api/profiles/${encodeURIComponent(id)}/skills/read`, {})
    if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Failed to queue skills.list' }
    const final = await this.waitForCommand(result.data.id)
    if (!final.ok || !final.data) return { ok: false, error: final.error ?? 'Command failed' }
    if (final.data.status === 'failed') return { ok: false, error: final.data.stderr || 'skills.list failed' }
    try {
      return { ok: true, data: final.data.stdout ? JSON.parse(final.data.stdout) : [] }
    } catch {
      return { ok: true, data: [] }
    }
  }

  // Env — 通过 command queue（Phase 6）
  async getEnvStatus(id: string): Promise<HermesApiResponse<string[]>> {
    const result = await this.post<HubCommand>(`/api/profiles/${encodeURIComponent(id)}/env/read`, {})
    if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Failed to queue env.status' }
    const final = await this.waitForCommand(result.data.id)
    if (!final.ok || !final.data) return { ok: false, error: final.error ?? 'Command failed' }
    if (final.data.status === 'failed') return { ok: false, error: final.data.stderr || 'env.status failed' }
    try { return { ok: true, data: final.data.stdout ? JSON.parse(final.data.stdout) : [] } } catch { return { ok: true, data: [] } }
  }

  async setEnv(id: string, key: string, value: string): Promise<HermesApiResponse<HubCommand>> {
    const result = await this.post<HubCommand>(`/api/profiles/${encodeURIComponent(id)}/env`, { key, value })
    if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Failed to queue env.set' }
    return { ok: true, data: result.data }
  }

  async deleteEnv(id: string, key: string): Promise<HermesApiResponse<HubCommand>> {
    const result = await this.post<HubCommand>(`/api/profiles/${encodeURIComponent(id)}/env/delete`, { key })
    if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Failed to queue env.delete' }
    return { ok: true, data: result.data }
  }

  async getConfig(): Promise<HermesApiResponse<HubConfig>> {
    return this.get<HubConfig>('/api/config')
  }

  async updateConfig(paths: string[]): Promise<HermesApiResponse<null>> {
    return this.put<null>('/api/config', { paths })
  }

  async listLogs(): Promise<HermesApiResponse<LogEntry[]>> {
    return this.get<LogEntry[]>('/api/logs')
  }

  async listProfileLogs(id: string): Promise<HermesApiResponse<LogEntry[]>> {
    return this.get<LogEntry[]>(`/api/profiles/${encodeURIComponent(id)}/logs`)
  }

  agentToProfileRow(agent: ManagedAgent): ProfileRow {
    const kind = agent.profileName === 'default' ? 'default' : 'profile'
    const name = agent.displayName || (kind === 'default' ? 'hermes' : agent.profileName)
    return {
      id: agent.id,
      kind,
      checked: false,
      letter: name[0]?.toUpperCase() ?? '?',
      name,
      desc: agent.nodeId,
      setupTone: this.statusTone(agent.setupStatus),
      setupText: agent.setupStatus,
      gatewayTone: this.statusTone(agent.gatewayStatus),
      gatewayText: agent.gatewayStatus,
      apiTone: this.statusTone(agent.apiServerStatus),
      apiText: agent.apiServerStatus,
      model: this.modelLabel(agent.provider, agent.model),
      home: agent.profileHome,
    }
  }

  private statusTone(status: string): ProfileRow['setupTone'] {
    if (status === 'ready' || status === 'running' || status === 'enabled') return 'running'
    if (status === 'failed') return 'bad'
    if (status === 'stopped' || status === 'disabled') return 'stopped'
    return 'warn'
  }

  private modelLabel(provider?: string, model?: string): string {
    if (!model) return ''
    if (!provider) return model
    return model.toLowerCase().startsWith(`${provider.toLowerCase()}:`) ? model : `${provider}:${model}`
  }
}
