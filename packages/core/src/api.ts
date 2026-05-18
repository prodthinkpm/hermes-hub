import type { HermesApiResponse, LogEntry, ProfileRow } from './types'

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
  stdout: string
  nextSteps: string[]
}

export interface RenameProfileResult {
  name: string
  renamed: boolean
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

  private async get<T>(path: string): Promise<HermesApiResponse<T>> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` }
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
        return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` }
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
        return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` }
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
        return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` }
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
        return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` }
      }
      const payload = await res.json()
      return this.parseEnvelope<T>(payload)
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  async listProfiles(): Promise<HermesApiResponse<ProfileRow[]>> {
    return this.get<ProfileRow[]>('/api/profiles')
  }

  async getProfile(id: string): Promise<HermesApiResponse<ProfileRow>> {
    return this.get<ProfileRow>(`/api/profiles/${encodeURIComponent(id)}`)
  }

  async createProfile(payload: CreateProfilePayload): Promise<HermesApiResponse<CreateProfileResult>> {
    return this.post<CreateProfileResult>('/api/profiles', payload)
  }

  async renameProfile(id: string, name: string): Promise<HermesApiResponse<RenameProfileResult>> {
    return this.put<RenameProfileResult>(`/api/profiles/${encodeURIComponent(id)}/rename`, { name })
  }

  async deleteProfile(id: string): Promise<HermesApiResponse<null>> {
    return this.del<null>(`/api/profiles/${encodeURIComponent(id)}`)
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
}
