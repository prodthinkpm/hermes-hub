export type NodeStatus = 'online' | 'offline' | 'unhealthy' | 'disabled'
export type AgentSetupStatus = 'unknown' | 'ready' | 'needs_setup' | 'failed'
export type AgentRuntimeStatus = 'unknown' | 'running' | 'stopped' | 'failed'
export type AgentApiStatus = 'unknown' | 'enabled' | 'disabled' | 'failed'
export type CommandStatus = 'pending' | 'dispatched' | 'running' | 'success' | 'failed' | 'timeout' | 'cancelled'
export type CommandType =
  | 'profile.scan' | 'profile.create' | 'profile.rename' | 'profile.delete'
  | 'gateway.start' | 'gateway.stop' | 'gateway.restart' | 'gateway.status'
  | 'doctor.run' | 'setup.run' | 'setup.catalog'
  | 'logs.tail'
  | 'config.read' | 'config.patch'
  | 'soul.read' | 'soul.update'
  | 'env.status' | 'env.set' | 'env.delete'
  | 'skills.list' | 'sessions.list'

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
  node_id?: string  // Phase 10: optional fallback, vkey is preferred
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
  vkey?: string  // Phase 10: vkey identifies the node
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

export const SETUP_STEP_ORDER = [
  'preflight.validate_profile_home',
  'fs.ensure_directory_structure',
  'config.write_yaml',
  'config.validate_yaml',
  'env.write_file',
  'env.validate_required_keys',
  'soul.write_file',
  'provider.validate',
  'terminal.validate',
  'gateway.validate',
  'tools.validate',
  'agent_behavior.validate_and_finalize',
] as const

export type SetupStep = (typeof SETUP_STEP_ORDER)[number]
export type SetupMode = 'create_flow' | 'repair'
export type SetupProgressStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped'
export type SetupRunFinalStatus = 'success' | 'failed' | 'timeout' | 'cancelled'
export type ReadQueryType =
  | 'profile.scan'
  | 'gateway.status'
  | 'setup.catalog'
  | 'config.read'
  | 'soul.read'
  | 'env.status'
  | 'skills.list'
  | 'sessions.list'

export interface SetupInputs {
  provider?: string
  model?: {
    default?: string
    base_url?: string
  }
  terminal?: {
    cwd?: string
  }
  gateway?: {
    endpoint?: string
    platforms?: string[]
  }
  tools?: {
    allow?: string[]
  }
  agent_behavior?: {
    reasoning_effort?: string
    approvals_mode?: string
    message?: string
  }
  config_yaml?: string
  env?: Record<string, string>
  soul_md?: string
}

export interface SetupRunPayload {
  profile_home?: string
  mode?: SetupMode
  resume_from_step?: SetupStep
  inputs?: SetupInputs
}

export interface SetupErrorModel {
  code: string
  message: string
  hint?: string
  retriable: boolean
  details_ref?: string
}

export interface SetupStepResult {
  step: SetupStep
  status: SetupProgressStatus
  started_at?: string
  ended_at?: string
  duration_ms?: number
  summary?: string
  error_code?: string
  stderr_ref?: string
}

export interface SetupArtifacts {
  config_written: boolean
  env_written: boolean
  soul_written: boolean
}

export interface SetupRunResult {
  status: SetupRunFinalStatus
  step_results: SetupStepResult[]
  artifacts: SetupArtifacts
  error?: SetupErrorModel
}

export interface SetupCatalogProvider {
  id: string
  label: string
  auth_type: string
  required_env_keys: string[]
  optional_env_keys?: string[]
  base_url?: string
  base_url_env_var?: string
  models: string[]
}

export interface SetupCatalogResult {
  providers: SetupCatalogProvider[]
  generated_at: string
  source: 'hermes-agent'
}

export interface QueryResultMeta {
  source: 'live' | 'cache'
  stale: boolean
  cached_at?: string
  node_online: boolean
}

export interface QueryEnvelope<T> {
  data: T
  meta: QueryResultMeta
}

export interface ProfileScanResult {
  hermes_home: string
  profiles: Array<Record<string, unknown>>
}

export interface ConfigReadResult {
  profile_home: string
  config_path?: string
  has_config?: boolean
  config?: string
  provider?: string
  model?: string
  terminal_cwd?: string
}

export interface SoulReadResult {
  profile_home: string
  soul_path?: string
  has_soul: boolean
  content: string
  size_bytes?: number
  mtime?: number
}

export interface EnvStatusResult {
  profile_home: string
  env_path?: string
  has_env?: boolean
  env_status: Record<string, boolean>
}

export interface GatewayStatusResult {
  profile_home: string
  gateway: Record<string, unknown>
  gateway_status: string
}

export interface SessionsListResult {
  profile_home: string
  sessions_count: number
  sessions: Array<Record<string, unknown>>
  sessions_error?: string
}

export interface SkillsListEntry {
  name: string
  path: string
  type: 'directory' | 'file'
  size_bytes?: number
  mtime?: number
}

export interface SkillsListResult {
  profile_home: string
  skills_dir: string
  skills_count: number
  skills: SkillsListEntry[]
}

export interface QueryChannelHello {
  kind: 'query.hello'
  node_id: string
  vkey?: string
  protocol_version: 1
}

export interface QueryChannelPing {
  kind: 'query.ping'
  sent_at: string
}

export interface QueryChannelPong {
  kind: 'query.pong'
  sent_at: string
}

export interface QueryChannelRequest {
  kind: 'query.request'
  request_id: string
  query_type: ReadQueryType
  agent_id?: string
  payload: Record<string, unknown>
  deadline_ms: number
}

export interface QueryChannelResponse {
  kind: 'query.response'
  request_id: string
  ok: boolean
  data?: Record<string, unknown>
  error?: string
}

export type QueryChannelServerMessage = QueryChannelRequest | QueryChannelPing
export type QueryChannelClientMessage = QueryChannelHello | QueryChannelResponse | QueryChannelPong

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
  result?: Record<string, unknown>
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
  status: 'running' | 'success' | 'failed' | 'timeout' | 'cancelled'
  stdout?: string
  stderr?: string
  error?: string
  result?: Record<string, unknown>
  started_at?: string
  finished_at?: string
}

// -- Auth types (Phase 9) --

export type UserRole = 'admin' | 'operator' | 'viewer'

export interface HubUser {
  id: string
  username: string
  role: UserRole
  createdAt: string
}

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  ok: true
  token: string
  user: HubUser
}

export interface AuthStatusResponse {
  authenticated: boolean
  user?: HubUser
}

// -- Node creation types (Phase 10) --

export interface CreateNodeRequest {
  name?: string
}

export interface CreateNodeResponse {
  node: HubNode
  vkey: string
  command: string
}

export interface NodeVkeyResponse {
  vkey: string
  command: string
}
