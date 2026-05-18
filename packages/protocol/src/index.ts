export type NodeStatus = 'online' | 'offline' | 'unhealthy' | 'disabled'
export type AgentSetupStatus = 'unknown' | 'ready' | 'needs_setup' | 'failed'
export type AgentRuntimeStatus = 'unknown' | 'running' | 'stopped' | 'failed'
export type AgentApiStatus = 'unknown' | 'enabled' | 'disabled' | 'failed'
export type CommandStatus = 'pending' | 'dispatched' | 'running' | 'success' | 'failed' | 'timeout' | 'cancelled'
export type CommandType =
  | 'profile.scan' | 'profile.create' | 'profile.rename' | 'profile.delete'
  | 'gateway.start' | 'gateway.stop' | 'gateway.restart'
  | 'doctor.run' | 'setup.run'
  | 'logs.tail'
  | 'config.read' | 'config.patch'
  | 'soul.read' | 'soul.update'
  | 'env.status' | 'env.set' | 'env.delete'
  | 'skills.list'

export interface HubNode {
  id: string
  name: string
  hostname: string
  os: string
  arch: string
  agentVersion: string
  hermesVersion?: string
  hermesHome: string
  status: NodeStatus
  capabilities: string[]
  tags: string[]
  lastHeartbeatAt?: string
  profilesTotal: number
  gatewayRunning: number
  createdAt: string
  updatedAt: string
}

export interface ManagedAgent {
  id: string
  nodeId: string
  profileName: string
  displayName?: string
  description?: string
  profileHome: string
  provider?: string
  model?: string
  terminalCwd?: string
  setupStatus: AgentSetupStatus
  gatewayStatus: AgentRuntimeStatus
  apiServerStatus: AgentApiStatus
  sessionsCount?: number
  skillsCount?: number
  cronCount?: number
  hasEnv: boolean
  hasSoul: boolean
  lastSeenAt?: string
  lastError?: string
  createdAt: string
  updatedAt: string
}

export interface HubAgentRegisterRequest {
  node_id: string
  name?: string
  hostname: string
  agent_version: string
  hermes_version?: string
  hermes_home: string
  runtime: {
    os: string
    arch: string
  }
  capabilities?: Record<string, boolean>
  tags?: string[]
  token?: string
}

export interface HubNodeUpdateRequest {
  name?: string
  status?: NodeStatus
  tags?: string[]
}

export interface HubAgentRegisterResponse {
  ok: true
  node_id: string
  server_time: string
  poll_interval_seconds: number
  heartbeat_interval_seconds: number
}

export interface HubAgentProfileSummary {
  profile_name: string
  profile_home: string
  provider?: string
  model?: string
  terminal_cwd?: string
  setup_status?: AgentSetupStatus
  gateway_status?: AgentRuntimeStatus
  api_server_status?: AgentApiStatus
  has_env?: boolean
  has_soul?: boolean
  sessions_count?: number
  skills_count?: number
  cron_count?: number
  last_error?: string
}

export interface HubAgentHeartbeatRequest {
  status: NodeStatus
  metrics?: {
    cpu_percent?: number
    memory_percent?: number
    disk_free_gb?: number
  }
  summary?: {
    profiles_total?: number
    gateway_running?: number
  }
  profiles: HubAgentProfileSummary[]
}

export interface HubCommand {
  id: string
  nodeId: string
  agentId?: string
  type: CommandType
  payload: Record<string, unknown>
  status: CommandStatus
  stdout?: string
  stderr?: string
  error?: string
  timeoutSeconds: number
  createdBy: string
  createdAt: string
  dispatchedAt?: string
  startedAt?: string
  finishedAt?: string
  updatedAt: string
}

export interface CreateCommandRequest {
  nodeId?: string
  agentId?: string
  type: CommandType
  payload?: Record<string, unknown>
}

export interface HubAgentPollCommandsResponse {
  ok: true
  commands: HubCommand[]
}

export interface CommandResultRequest {
  status: 'success' | 'failed'
  stdout?: string
  stderr?: string
  error?: string
  result?: Record<string, unknown>
  started_at?: string
  finished_at?: string
}
