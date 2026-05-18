import type { HermesApiResponse, HubCommand, HubNode, LogEntry, ManagedAgent, ProfileRow } from './types'

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
        headers: { Accept: 'application/json' },
      })
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
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      })
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
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      })
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
        headers: { Accept: 'application/json' },
      })
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

  async getProfileConfig(id: string): Promise<HermesApiResponse<string>> {
    return this.getText(`/api/profiles/${encodeURIComponent(id)}/config.yaml`)
  }

  async updateProfileConfig(id: string, content: string): Promise<HermesApiResponse<null>> {
    return this.put<null>(`/api/profiles/${encodeURIComponent(id)}/config.yaml`, { content })
  }

  async getProfileSoul(id: string): Promise<HermesApiResponse<string>> {
    return this.getText(`/api/profiles/${encodeURIComponent(id)}/SOUL.md`)
  }

  async updateProfileSoul(id: string, content: string): Promise<HermesApiResponse<null>> {
    return this.put<null>(`/api/profiles/${encodeURIComponent(id)}/SOUL.md`, { content })
  }

  async getProfileSkills(id: string): Promise<HermesApiResponse<string[]>> {
    return this.get<string[]>(`/api/profiles/${encodeURIComponent(id)}/skills`)
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
