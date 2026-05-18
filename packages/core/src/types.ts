export type BadgeTone = 'running' | 'stopped' | 'warn' | 'bad' | 'info' | 'purple'
export type LogTone = '' | 'ok' | 'err' | 'yellow'
export type ProfileKind = 'default' | 'profile'

export type {
  HubNode,
  HubCommand,
  ManagedAgent,
  NodeStatus,
  AgentSetupStatus,
  AgentRuntimeStatus,
  AgentApiStatus,
} from '@hermes-hub/protocol'

export type {
  HubUser,
  UserRole,
  LoginRequest,
  LoginResponse,
  AuthStatusResponse,
} from '@hermes-hub/protocol'

export interface ProfileRow {
  id: string
  kind: ProfileKind
  checked: boolean
  letter: string
  name: string
  desc: string
  setupTone: BadgeTone
  setupText: string
  gatewayTone: BadgeTone
  gatewayText: string
  apiTone: BadgeTone
  apiText: string
  model: string
  home: string
}

export interface HermesApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
}

export interface LogEntry {
  id: string
  time: string
  source: string
  message: string
  tone: LogTone
}
