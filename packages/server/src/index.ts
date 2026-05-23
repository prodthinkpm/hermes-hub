import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import type {
  AuthStatusResponse,
  CommandResultRequest,
  CommandType,
  CreateCommandRequest,
  ConfigReadResult,
  EnvStatusResult,
  GatewayStatusResult,
  HubCommand,
  HubAgentHeartbeatRequest,
  HubAgentRegisterRequest,
  HubNode,
  ManagedAgent,
  ProfileScanResult,
  QueryChannelClientMessage,
  QueryChannelHello,
  QueryChannelRequest,
  QueryChannelResponse,
  QueryEnvelope,
  ReadQueryType,
  SessionsListResult,
  SkillsListResult,
  SoulReadResult,
  SetupCatalogResult,
  SetupRunPayload,
  SetupStep,
} from '@hermes-hub/protocol'
import { SETUP_STEP_ORDER } from '@hermes-hub/protocol'
import type Database from 'better-sqlite3'
import { handleUpgrade, type WsConnection, wsBroadcast, wsClients } from './websocket.js'
import {
  initDatabase,
  getNode,
  getAllNodes,
  upsertNode as dbUpsertNode,
  getAgent,
  getAllAgents,
  upsertAgent,
  deleteAgentsForNode,
  deleteNode,
  updateNodeFields,
  createNodeRecord,
  getNodeByVkey,
  getNodeVkey as dbGetNodeVkey,
  getCommand,
  getAllCommands,
  upsertCommand,
  getQueryCache,
  upsertQueryCache,
  deleteQueryCacheByAgentAndTypes,
  deleteQueryCacheByNodeAndTypes,
  getNextCommandNumber,
  getRunningCommandsForNode,
  getBusyAgentIds,
  pollNextPendingCommand,
  getAllLogs,
  getLogsForAgent,
  getLogsForNode,
  getLogsForCommand,
  insertLog,
  sanitizeMessage,
  getMetadataValue,
  setMetadataValue,
  createUser,
  getUserByUsername,
  getUserById,
  getAllUsers,
  updateUser,
  deleteUser,
  seedDefaultAdmin,
  type DbUserRow,
} from './database.js'

export interface ServerOptions {
  port: number
  apiUrl?: string
  staticDir?: string
  dbPath?: string  // SQLite 数据库路径，默认 ~/.hermes-hub/hub.db
  registrationToken?: string  // 注册 token，未提供则自动生成
}

// Module-level registration token and port (set during startServer)
let resolvedToken: string | undefined
let serverPort = 3000

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
}

function nowIso(): string {
  return new Date().toISOString()
}

function jsonReply(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString()
    })
    req.on('end', () => {
      try {
        resolveBody(body ? JSON.parse(body) : {})
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isSetupStep(value: unknown): value is SetupStep {
  return typeof value === 'string' && (SETUP_STEP_ORDER as readonly string[]).includes(value)
}

function parseSetupPayload(body: unknown): SetupRunPayload {
  if (!isObject(body)) return { mode: 'create_flow' }
  const payload: SetupRunPayload = {
    mode: body.mode === 'repair' ? 'repair' : 'create_flow',
  }
  if (isSetupStep(body.resume_from_step)) {
    payload.resume_from_step = body.resume_from_step
  }
  if (isObject(body.inputs)) {
    payload.inputs = body.inputs as SetupRunPayload['inputs']
  }
  if (typeof body.profile_home === 'string' && body.profile_home.trim()) {
    payload.profile_home = body.profile_home.trim()
  }
  return payload
}

const READ_QUERY_TYPES: readonly ReadQueryType[] = [
  'profile.scan',
  'gateway.status',
  'setup.catalog',
  'config.read',
  'soul.read',
  'env.status',
  'skills.list',
  'sessions.list',
] as const

const QUERY_TIMEOUT_MS = 5_000
const QUERY_CACHE_TTLS_MS: Partial<Record<ReadQueryType, number>> = {
  'setup.catalog': 10 * 60_000,
  'skills.list': 30_000,
  'sessions.list': 30_000,
  'gateway.status': 15_000,
}

type QueryResponseData =
  | ProfileScanResult
  | GatewayStatusResult
  | SetupCatalogResult
  | ConfigReadResult
  | SoulReadResult
  | EnvStatusResult
  | SkillsListResult
  | SessionsListResult

interface QuerySession {
  nodeId: string
  connection: WsConnection
  pending: Map<string, {
    resolve: (value: QueryChannelResponse) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }>
  lastPongAt: string
}

const querySessions = new Map<string, QuerySession>()

function isReadQueryType(value: unknown): value is ReadQueryType {
  return typeof value === 'string' && (READ_QUERY_TYPES as readonly string[]).includes(value)
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function queryCacheKey(nodeId: string, agentId: string | undefined, queryType: ReadQueryType, payload: Record<string, unknown>): string {
  return `${nodeId}::${agentId ?? '__node__'}::${queryType}::${stableStringify(payload)}`
}

function isNodeOnline(db: Database.Database, nodeId: string): boolean {
  return getNode(db, nodeId)?.status === 'online'
}

function buildQueryEnvelope<T extends QueryResponseData>(
  data: T,
  meta: QueryEnvelope<T>['meta'],
): QueryEnvelope<T> {
  return { data, meta }
}

function cacheStillFresh(queryType: ReadQueryType, cachedAt: string): boolean {
  const ttl = QUERY_CACHE_TTLS_MS[queryType]
  if (!ttl) return true
  return Date.now() - new Date(cachedAt).getTime() <= ttl
}

function stringArrayFromFlags(flags: Record<string, boolean> | undefined): string[] {
  if (!flags) return []
  return Object.entries(flags)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
}

function validateRegisterBody(body: unknown): HubAgentRegisterRequest | null {
  if (!isObject(body)) return null
  const runtime = body.runtime
  if (!isObject(runtime)) return null
  if (
    (body.node_id !== undefined && typeof body.node_id !== 'string') ||
    typeof body.hostname !== 'string' ||
    typeof body.agent_version !== 'string' ||
    typeof body.hermes_home !== 'string' ||
    typeof runtime.os !== 'string' ||
    typeof runtime.arch !== 'string'
  ) {
    return null
  }
  return body as unknown as HubAgentRegisterRequest
}

function validateHeartbeatBody(body: unknown): HubAgentHeartbeatRequest | null {
  if (!isObject(body)) return null
  if (typeof body.status !== 'string' || !Array.isArray(body.profiles)) return null
  return body as unknown as HubAgentHeartbeatRequest
}

function isCommandType(value: unknown): value is CommandType {
  return (
    value === 'profile.scan' || value === 'profile.create' || value === 'profile.rename' || value === 'profile.delete' ||
    value === 'gateway.start' || value === 'gateway.stop' || value === 'gateway.restart' || value === 'gateway.status' ||
    value === 'doctor.run' || value === 'setup.run' || value === 'setup.catalog' ||
    value === 'logs.tail' ||
    value === 'config.read' || value === 'config.patch' ||
    value === 'soul.read' || value === 'soul.update' ||
    value === 'env.status' || value === 'env.set' || value === 'env.delete' ||
    value === 'skills.list' || value === 'sessions.list'
  )
}

function validateCreateCommandBody(body: unknown): CreateCommandRequest | null {
  if (!isObject(body) || !isCommandType(body.type)) return null
  if (body.nodeId !== undefined && typeof body.nodeId !== 'string') return null
  if (body.agentId !== undefined && typeof body.agentId !== 'string') return null
  if (body.payload !== undefined && !isObject(body.payload)) return null
  return body as unknown as CreateCommandRequest
}

function validateCommandResultBody(body: unknown): CommandResultRequest | null {
  if (!isObject(body)) return null
  if (
    body.status !== 'running' &&
    body.status !== 'success' &&
    body.status !== 'failed' &&
    body.status !== 'timeout' &&
    body.status !== 'cancelled'
  ) {
    return null
  }
  if (body.result !== undefined && !isObject(body.result)) return null
  return body as unknown as CommandResultRequest
}

function isTerminalCommandStatus(status: HubCommand['status']): boolean {
  return status === 'success' || status === 'failed' || status === 'timeout' || status === 'cancelled'
}

function normalizeReportedStatus(resultBody: CommandResultRequest): CommandResultRequest {
  if (resultBody.status !== 'success') return resultBody
  const returncode = resultBody.result && typeof resultBody.result.returncode === 'number'
    ? resultBody.result.returncode
    : undefined
  if (returncode === undefined || returncode === 0) return resultBody
  return {
    ...resultBody,
    status: 'failed',
    error: resultBody.error ?? `Command exited with returncode ${returncode}`,
  }
}

// 从数据库查找第一个 online node，用于没有明确 target node 的命令
function chooseDefaultNodeId(db: Database.Database): string | null {
  const allNodes = getAllNodes(db)
  const onlineNode = allNodes.find((node) => node.status === 'online')
  return onlineNode?.id ?? allNodes[0]?.id ?? null
}

// 创建命令并写入数据库
function createCommand(
  db: Database.Database,
  body: CreateCommandRequest
): { ok: true; command: HubCommand } | { ok: false; error: string } {
  const agent = body.agentId ? getAgent(db, body.agentId) : undefined
  const cloneFromAgentIdRaw = body.type === 'profile.create' && typeof body.payload?.clone_from_agent_id === 'string'
    ? body.payload.clone_from_agent_id.trim()
    : ''
  const cloneFromAgent = cloneFromAgentIdRaw ? getAgent(db, cloneFromAgentIdRaw) : undefined
  const nodeId = body.nodeId ?? agent?.nodeId ?? cloneFromAgent?.nodeId ?? chooseDefaultNodeId(db)
  if (!nodeId) return { ok: false, error: 'No registered node is available' }
  if (!getNode(db, nodeId)) return { ok: false, error: `Node '${nodeId}' not found` }

  if ((body.type === 'profile.rename' || body.type === 'profile.delete') && !agent) {
    return { ok: false, error: `${body.type} requires a valid agentId` }
  }
  if ((body.type === 'profile.rename' || body.type === 'profile.delete') && agent?.profileName === 'default') {
    return { ok: false, error: 'The default Hermes agent cannot be renamed or deleted' }
  }
  if (body.type === 'profile.create') {
    const name = typeof body.payload?.profile_name === 'string' ? body.payload.profile_name.trim() : ''
    if (!name) return { ok: false, error: 'profile.create requires payload.profile_name' }
    if (cloneFromAgentIdRaw) {
      if (!cloneFromAgent) return { ok: false, error: `Clone source agent '${cloneFromAgentIdRaw}' not found` }
      if (cloneFromAgent.nodeId !== nodeId) {
        return { ok: false, error: 'Clone source must be on the same node as the new agent' }
      }
    }
  }
  if (body.type === 'profile.rename') {
    const nextName = typeof body.payload?.new_name === 'string' ? body.payload.new_name.trim() : ''
    if (!nextName) return { ok: false, error: 'profile.rename requires payload.new_name' }
  }
  // gateway/doctor/setup 需要 agent 来确定操作的 profile
  if (
    (body.type.startsWith('gateway.') || body.type === 'doctor.run' || body.type === 'setup.run' || body.type === 'setup.catalog') &&
    !agent
  ) {
    return { ok: false, error: `${body.type} requires a valid agentId` }
  }

  const timestamp = nowIso()
  // 默认命令超时 300 秒，可通过 payload.timeoutSeconds 覆盖
  const timeoutSeconds =
    typeof body.payload?.timeoutSeconds === 'number'
      ? (body.payload as Record<string, number>).timeoutSeconds
      : 300
  const commandPayload: Record<string, unknown> = {
    ...(body.payload ?? {}),
  }
  if (body.type === 'profile.create' && cloneFromAgent) {
    commandPayload.clone_from_agent_id = cloneFromAgent.id
    commandPayload.clone_from_profile_home = cloneFromAgent.profileHome
    commandPayload.clone_from_profile_name = cloneFromAgent.profileName
  }
  // 使用数据库原子计数器生成命令 ID
  const commandNum = getNextCommandNumber(db)
  const command: HubCommand = {
    id: `cmd_${String(commandNum).padStart(6, '0')}`,
    nodeId,
    agentId: body.agentId,
    type: body.type,
    payload: {
      ...commandPayload,
      ...(agent ? { profile_name: agent.profileName, profile_home: agent.profileHome } : {}),
    },
    status: 'pending',
    timeoutSeconds,
    createdBy: 'local-user',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  upsertCommand(db, command)
  notifyCommandUpdated(command);
  // 高危操作写入审计日志
  auditCommand(db, command)
  return { ok: true, command }
}

// 对高危命令类型写入审计日志
function auditCommand(db: Database.Database, command: HubCommand): void {
  const agentName = typeof command.payload?.profile_name === 'string' ? command.payload.profile_name : 'unknown'
  const source = `cmd:${command.id}`
  switch (command.type) {
    case 'profile.create':
      insertLog(db, 'warn', `Agent '${agentName}' created`, source)
      break
    case 'profile.delete':
      insertLog(db, 'warn', `Agent '${agentName}' deleted`, source)
      break
    case 'profile.rename': {
      const newName = typeof command.payload?.new_name === 'string' ? command.payload.new_name : '?'
      insertLog(db, 'warn', `Agent '${agentName}' renamed to '${newName}'`, source)
      break
    }
    case 'gateway.start':
      insertLog(db, 'info', `Gateway started for '${agentName}'`, source)
      break
    case 'gateway.stop':
      insertLog(db, 'warn', `Gateway stopped for '${agentName}'`, source)
      break
    case 'gateway.restart':
      insertLog(db, 'info', `Gateway restarted for '${agentName}'`, source)
      break
    case 'setup.run':
      insertLog(db, 'info', `Setup ran for '${agentName}'`, source)
      break
    case 'doctor.run':
      insertLog(db, 'info', `Doctor ran for '${agentName}'`, source)
      break
    case 'config.patch':
      insertLog(db, 'warn', `Config updated for '${agentName}'`, source)
      break
    case 'soul.update':
      insertLog(db, 'warn', `SOUL updated for '${agentName}'`, source)
      break
    case 'env.set': {
      const envKey = typeof command.payload?.key === 'string' ? command.payload.key : '?'
      insertLog(db, 'warn', `Env '${envKey}' set for '${agentName}'`, source)
      break
    }
    case 'env.delete': {
      const envDelKey = typeof command.payload?.key === 'string' ? command.payload.key : '?'
      insertLog(db, 'warn', `Env '${envDelKey}' deleted for '${agentName}'`, source)
      break
    }
  }
}

// 根据注册请求构造 node 对象并写入数据库，保留已有节点的历史数据
function upsertNode(
  db: Database.Database,
  body: HubAgentRegisterRequest,
  overrideNodeId?: string,
): HubNode {
  const nodeId = overrideNodeId || body.node_id || 'unknown'
  const existing = getNode(db, nodeId)
  const timestamp = nowIso()
  const node: HubNode = {
    id: nodeId,
    name: body.name?.trim() || nodeId,
    hostname: body.hostname,
    os: body.runtime.os,
    arch: body.runtime.arch,
    agentVersion: body.agent_version,
    hermesVersion: body.hermes_version,
    hermesHome: body.hermes_home,
    status: 'online',
    capabilities: stringArrayFromFlags(body.capabilities),
    tags: body.tags ?? [],
    lastHeartbeatAt: existing?.lastHeartbeatAt,
    profilesTotal: existing?.profilesTotal ?? 0,
    gatewayRunning: existing?.gatewayRunning ?? 0,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }
  dbUpsertNode(db, node)
  return node
}

// 检查 node 上所有 running 命令是否超过 timeoutSeconds，超时则标记为 timeout
function checkTimeouts(db: Database.Database, nodeId: string, timestamp: string): void {
  const now = new Date(timestamp).getTime()
  const runningCommands = getRunningCommandsForNode(db, nodeId)
  for (const command of runningCommands) {
    if (!command.startedAt) continue
    const startedMs = new Date(command.startedAt).getTime()
    const elapsedSeconds = (now - startedMs) / 1000
    if (elapsedSeconds > command.timeoutSeconds) {
      command.status = 'timeout'
      command.error = `Command timed out after ${elapsedSeconds.toFixed(0)}s (limit: ${command.timeoutSeconds}s)`
      command.finishedAt = timestamp
      command.updatedAt = timestamp
      upsertCommand(db, command)
      notifyCommandUpdated(command);
    }
  }
}

// 检查所有节点心跳超时（30s 无心跳 → offline）
function markStaleNodesOffline(db: Database.Database, timestamp: string): void {
  const now = new Date(timestamp).getTime()
  const nodes = getAllNodes(db)
  for (const node of nodes) {
    if (node.status !== 'online' || !node.lastHeartbeatAt) continue
    if (now - new Date(node.lastHeartbeatAt).getTime() > 30_000) {
      updateNodeFields(db, node.id, { status: 'offline' })
    }
  }
}

// 心跳处理：更新 agents 表，清理已从磁盘消失的 profile
function upsertAgentsFromHeartbeat(
  db: Database.Database,
  nodeId: string,
  body: HubAgentHeartbeatRequest
): void {
  const timestamp = nowIso()
  const seen = new Set<string>()

  for (const profile of body.profiles) {
    if (!profile.profile_name || !profile.profile_home) continue
    const id = `${nodeId}:${profile.profile_name}`
    seen.add(id)
    const existing = getAgent(db, id)
    const agent: ManagedAgent = {
      id,
      nodeId,
      profileName: profile.profile_name,
      displayName: profile.profile_name === 'default' ? 'hermes' : profile.profile_name,
      description: '',
      profileHome: profile.profile_home,
      provider: profile.provider,
      model: profile.model,
      terminalCwd: profile.terminal_cwd,
      setupStatus: profile.setup_status ?? 'unknown',
      gatewayStatus: profile.gateway_status ?? 'unknown',
      apiServerStatus: profile.api_server_status ?? 'unknown',
      sessionsCount: profile.sessions_count,
      skillsCount: profile.skills_count,
      cronCount: profile.cron_count,
      hasEnv: profile.has_env ?? false,
      hasSoul: profile.has_soul ?? false,
      lastSeenAt: timestamp,
      lastError: (profile as any).error || profile.last_error,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    }
    upsertAgent(db, agent)
  }

  // 删除该 node 上在本次心跳中未出现（已从磁盘删除）的 agent
  deleteAgentsForNode(db, nodeId, seen)
}

function mapAgentStatusToTone(status: string): 'running' | 'stopped' | 'warn' | 'bad' | 'info' | 'purple' {
  if (status === 'ready' || status === 'running' || status === 'enabled') return 'running'
  if (status === 'failed') return 'bad'
  if (status === 'stopped' || status === 'disabled') return 'stopped'
  return 'warn'
}

function formatModel(provider?: string, model?: string): string {
  if (!model) return ''
  if (!provider) return model
  return model.toLowerCase().startsWith(`${provider.toLowerCase()}:`) ? model : `${provider}:${model}`
}

function profileCompat(agent: ManagedAgent) {
  const kind = agent.profileName === 'default' ? 'default' : 'profile'
  const name = agent.displayName || agent.profileName
  return {
    id: agent.id,
    kind,
    checked: false,
    letter: name[0]?.toUpperCase() ?? '?',
    name,
    desc: agent.nodeId,
    nodeId: agent.nodeId,
    nodeLabel: agent.nodeId,
    setupTone: mapAgentStatusToTone(agent.setupStatus),
    setupText: agent.setupStatus,
    gatewayTone: mapAgentStatusToTone(agent.gatewayStatus),
    gatewayText: agent.gatewayStatus,
    apiTone: mapAgentStatusToTone(agent.apiServerStatus),
    apiText: agent.apiServerStatus,
    model: formatModel(agent.provider, agent.model),
    home: agent.profileHome,
  }
}

// ---------------------------------------------------------------------------
// JWT 认证工具（Phase 9，零依赖，纯 node:crypto）
// ---------------------------------------------------------------------------

function jwtSecret(): string {
  return resolvedToken ? `jwt_${resolvedToken}` : `jwt_${randomBytes(32).toString('hex')}`
}

function signJwt(payload: Record<string, unknown>): string {
  const secret = jwtSecret()
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) })).toString('base64url')
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}

function verifyJwt(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const secret = jwtSecret()
    const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('base64url')
    if (expected.length !== parts[2].length || !timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2]))) {
      return null
    }
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'))
    return payload as Record<string, unknown>
  } catch {
    return null
  }
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':')
    const derived = scryptSync(password, salt, 64).toString('hex')
    return hash.length === derived.length && timingSafeEqual(Buffer.from(hash), Buffer.from(derived))
  } catch {
    return false
  }
}

function roleLevel(role: string): number {
  switch (role) {
    case 'admin': return 2
    case 'operator': return 1
    default: return 0
  }
}

function extractJwtFromRequest(req: IncomingMessage): string | null {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) return null
  return auth.slice(7)
}

function authenticateRequest(req: IncomingMessage): DbUserRow | null {
  const token = extractJwtFromRequest(req)
  if (!token) return null
  const payload = verifyJwt(token)
  if (!payload || typeof payload.sub !== 'string') return null
  // 注意：这里不查数据库，仅凭 JWT 中的 sub 字段重建轻量上下文
  // 实际查库在需要完整 user 信息的端点中调用 getUserById
  return { id: payload.sub, username: (payload.username as string) ?? '', password_hash: '', role: (payload.role as string) ?? 'viewer', created_at: '' }
}

function extractHubAgentVkey(req: IncomingMessage): string | null {
  const auth = req.headers.authorization
  if (auth?.startsWith('Bearer ')) {
    const vkey = auth.slice(7).trim()
    return vkey || null
  }
  const header = req.headers['x-hermes-hub-vkey']
  const value = Array.isArray(header) ? header[0] : header
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function hasAnyNodeVkey(db: Database.Database): boolean {
  const row = db.prepare('SELECT COUNT(*) AS count FROM nodes WHERE token IS NOT NULL').get() as { count: number }
  return row.count > 0
}

function validateHubAgentVkey(db: Database.Database, nodeId: string, req: IncomingMessage): boolean {
  const vkey = extractHubAgentVkey(req)
  return validateHubAgentVkeyValue(db, nodeId, vkey)
}

function validateHubAgentVkeyValue(db: Database.Database, nodeId: string, vkey: string | null | undefined): boolean {
  const nodeVkey = dbGetNodeVkey(db, nodeId)
  if (nodeVkey) {
    return vkey === nodeVkey
  }
  if (resolvedToken) {
    return vkey === resolvedToken
  }
  if (hasAnyNodeVkey(db)) {
    if (!vkey) return false
    const found = getNodeByVkey(db, vkey)
    return found?.node.id === nodeId
  }
  return true
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function notifyCommandUpdated(command: HubCommand): void {
  wsBroadcast(JSON.stringify({ event: 'command.updated', command }))
}

function clearQuerySession(session: QuerySession): void {
  const current = querySessions.get(session.nodeId)
  if (current !== session) return
  for (const pending of session.pending.values()) {
    clearTimeout(pending.timer)
    pending.reject(new Error(`Query channel closed for node '${session.nodeId}'`))
  }
  session.pending.clear()
  querySessions.delete(session.nodeId)
}

function registerQuerySession(session: QuerySession): void {
  const previous = querySessions.get(session.nodeId)
  if (previous && previous !== session) {
    clearQuerySession(previous)
    previous.connection.close()
  }
  querySessions.set(session.nodeId, session)
}

function bindQueryChannel(
  db: Database.Database,
  connection: WsConnection,
): {
  onText: (payload: string) => void
  onClose: () => void
} {
  let session: QuerySession | null = null

  return {
    onText(payload) {
      let message: QueryChannelClientMessage
      try {
        message = JSON.parse(payload) as QueryChannelClientMessage
      } catch {
        connection.close()
        return
      }

      if (!session) {
        const hello = message as Partial<QueryChannelHello>
        if (hello.kind !== 'query.hello' || typeof hello.node_id !== 'string') {
          connection.close()
          return
        }
        const vkey = typeof hello.vkey === 'string' ? hello.vkey.trim() : extractHubAgentVkey(connection.req)
        if (!validateHubAgentVkeyValue(db, hello.node_id, vkey)) {
          connection.close()
          return
        }
        if (!getNode(db, hello.node_id)) {
          connection.close()
          return
        }
        session = {
          nodeId: hello.node_id,
          connection,
          pending: new Map(),
          lastPongAt: nowIso(),
        }
        registerQuerySession(session)
        return
      }

      if (message.kind === 'query.pong') {
        session.lastPongAt = typeof message.sent_at === 'string' ? message.sent_at : nowIso()
        return
      }

      if (message.kind !== 'query.response') return
      const pending = session.pending.get(message.request_id)
      if (!pending) return
      clearTimeout(pending.timer)
      session.pending.delete(message.request_id)
      pending.resolve(message)
    },
    onClose() {
      if (session) clearQuerySession(session)
    },
  }
}

function invalidateReadCachesForCommand(db: Database.Database, command: HubCommand, status: HubCommand['status']): void {
  const nodeId = command.nodeId
  const agentId = command.agentId
  switch (command.type) {
    case 'config.patch':
      if (status !== 'success') return
      if (agentId) deleteQueryCacheByAgentAndTypes(db, nodeId, agentId, ['config.read'])
      return
    case 'env.set':
    case 'env.delete':
      if (status !== 'success') return
      if (agentId) deleteQueryCacheByAgentAndTypes(db, nodeId, agentId, ['env.status'])
      return
    case 'soul.update':
      if (status !== 'success') return
      if (agentId) deleteQueryCacheByAgentAndTypes(db, nodeId, agentId, ['soul.read'])
      return
    case 'setup.run':
      if (agentId) deleteQueryCacheByAgentAndTypes(db, nodeId, agentId, ['config.read', 'env.status', 'soul.read', 'gateway.status', 'skills.list', 'sessions.list'])
      deleteQueryCacheByNodeAndTypes(db, nodeId, ['setup.catalog'])
      return
    case 'profile.create':
    case 'profile.rename':
    case 'profile.delete':
      if (status !== 'success') return
      deleteQueryCacheByNodeAndTypes(db, nodeId, ['setup.catalog', 'profile.scan'])
      if (agentId) {
        deleteQueryCacheByAgentAndTypes(db, nodeId, agentId, ['config.read', 'env.status', 'soul.read', 'gateway.status', 'skills.list', 'sessions.list'])
      }
      return
  }
}

async function executeReadQuery<T extends QueryResponseData>(
  db: Database.Database,
  args: {
    nodeId: string
    agentId?: string
    queryType: ReadQueryType
    payload?: Record<string, unknown>
  },
): Promise<{ status: number; body: { ok: boolean; data?: QueryEnvelope<T>; error?: string } }> {
  const payload = args.payload ?? {}
  const cacheKey = queryCacheKey(args.nodeId, args.agentId, args.queryType, payload)
  const cached = getQueryCache(db, cacheKey)
  const nodeOnline = isNodeOnline(db, args.nodeId)
  const session = querySessions.get(args.nodeId)

  if (session) {
    const requestId = `qry_${randomUUID()}`
    const request: QueryChannelRequest = {
      kind: 'query.request',
      request_id: requestId,
      query_type: args.queryType,
      agent_id: args.agentId,
      payload,
      deadline_ms: QUERY_TIMEOUT_MS,
    }
    const liveResponse = await new Promise<QueryChannelResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        session.pending.delete(requestId)
        reject(new Error(`Query '${args.queryType}' timed out`))
      }, QUERY_TIMEOUT_MS)
      session.pending.set(requestId, { resolve, reject, timer })
      try {
        session.connection.sendText(JSON.stringify(request))
      } catch (error) {
        clearTimeout(timer)
        session.pending.delete(requestId)
        reject(error instanceof Error ? error : new Error('Failed to send query request'))
      }
    }).catch((error: Error) => ({ kind: 'query.response', request_id: requestId, ok: false, error: error.message } satisfies QueryChannelResponse))

    if (liveResponse.ok && liveResponse.data) {
      const timestamp = nowIso()
      upsertQueryCache(db, {
        cacheKey,
        nodeId: args.nodeId,
        agentId: args.agentId,
        queryType: args.queryType,
        payloadKey: stableStringify(payload),
        data: liveResponse.data,
        updatedAt: timestamp,
      })
      return {
        status: 200,
        body: {
          ok: true,
          data: buildQueryEnvelope(liveResponse.data as T, {
            source: 'live',
            stale: false,
            cached_at: timestamp,
            node_online: true,
          }),
        },
      }
    }
  }

  if (cached && cacheStillFresh(args.queryType, cached.updatedAt)) {
    return {
      status: 200,
      body: {
        ok: true,
        data: buildQueryEnvelope(cached.data as T, {
          source: 'cache',
          stale: true,
          cached_at: cached.updatedAt,
          node_online: nodeOnline,
        }),
      },
    }
  }

  return {
    status: nodeOnline ? 504 : 502,
    body: {
      ok: false,
      error: nodeOnline
        ? `Query '${args.queryType}' timed out for node '${args.nodeId}'`
        : `Node '${args.nodeId}' is offline and no cached '${args.queryType}' result is available`,
    },
  }
}

function requestHubUrl(req: IncomingMessage): string {
  const forwardedProto = headerValue(req.headers['x-forwarded-proto'])
  const proto = forwardedProto?.split(',')[0]?.trim() || 'http'
  const forwardedHost = headerValue(req.headers['x-forwarded-host'])
  const host = forwardedHost?.split(',')[0]?.trim() || req.headers.host || `localhost:${serverPort}`
  return `${proto}://${host}`
}

async function replyReadQueryForAgent<T extends QueryResponseData>(
  db: Database.Database,
  res: ServerResponse,
  agentId: string,
  queryType: ReadQueryType,
  payload: Record<string, unknown> = {},
): Promise<boolean> {
  const agent = getAgent(db, agentId)
  if (!agent) {
    jsonReply(res, 404, { ok: false, error: `Agent '${agentId}' not found` })
    return true
  }
  const result = await executeReadQuery<T>(db, {
    nodeId: agent.nodeId,
    agentId,
    queryType,
    payload: {
      ...payload,
      profile_name: agent.profileName,
      profile_home: agent.profileHome,
    },
  })
  jsonReply(res, result.status, result.body)
  return true
}

function hubAgentCommand(req: IncomingMessage, _nodeId: string, vkey: string): string {
  return `hermes-hub-agent --hub-url=${requestHubUrl(req)} --vkey=${vkey}`
}

function vkeyFingerprint(vkey: string | undefined): string {
  if (!vkey) return 'none'
  return vkey.length <= 6 ? vkey : vkey.slice(-6)
}

function rejectHubAgentRegister(
  res: ServerResponse,
  db: Database.Database,
  code: string,
  error: string,
  nodeId: string | undefined,
  vkey: string | undefined,
): void {
  insertLog(
    db,
    'warn',
    `Hub Agent register rejected: code=${code} node_id=${nodeId || 'none'} vkey_tail=${vkeyFingerprint(vkey)}`,
    'hub-agent',
  )
  jsonReply(res, 401, { ok: false, code, error })
}

async function handleHubAgentApi(
  path: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  db: Database.Database
): Promise<boolean> {
  if (path === '/api/hub-agents/register') {
    if (method !== 'POST') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }
    let body: unknown
    try {
      body = await readJsonBody(req)
    } catch {
      jsonReply(res, 400, { ok: false, error: 'Invalid JSON body' })
      return true
    }
    const registerBody = validateRegisterBody(body)
    if (!registerBody) {
      jsonReply(res, 400, { ok: false, error: 'Invalid register payload' })
      return true
    }
    {
      const vkey = registerBody.vkey?.trim()

      // Phase 10: vkey 唯一标识节点，不需要 node_id
      if (vkey) {
        const found = getNodeByVkey(db, vkey)
        if (found) {
          // 更新节点运行时信息
          const timestamp = nowIso()
          const updated: HubNode = {
            ...found.node,
            name: registerBody.name?.trim() || found.node.name,
            hostname: registerBody.hostname,
            os: registerBody.runtime.os,
            arch: registerBody.runtime.arch,
            agentVersion: registerBody.agent_version,
            hermesVersion: registerBody.hermes_version || found.node.hermesVersion,
            hermesHome: registerBody.hermes_home,
            status: 'online',
            capabilities: stringArrayFromFlags(registerBody.capabilities),
            tags: registerBody.tags ?? found.node.tags,
            updatedAt: timestamp,
          }
          dbUpsertNode(db, updated)
          jsonReply(res, 200, {
            ok: true,
            node_id: updated.id,
            server_time: timestamp,
            poll_interval_seconds: 3,
            heartbeat_interval_seconds: 10,
          })
          return true
        }
        // vkey not found in any node
        rejectHubAgentRegister(res, db, 'vkey_not_found',
          'Node not found for this vkey. Create the node from the web UI first, then run: hermes-hub-agent --hub-url=... --vkey=<vkey>',
          undefined, vkey)
        return true
      }

      // Fallback: agent sent old-style node_id without vkey — backward compat
      const fallbackNodeId = registerBody.node_id?.trim() || `node-${randomBytes(4).toString('hex')}`
      if (!resolvedToken) {
        // No tokens configured — allow registration (dev mode)
        const node = upsertNode(db, { ...registerBody, node_id: fallbackNodeId })
        jsonReply(res, 200, {
          ok: true, node_id: node.id, server_time: nowIso(),
          poll_interval_seconds: 3, heartbeat_interval_seconds: 10,
        })
        return true
      }
      rejectHubAgentRegister(res, db, 'missing_vkey',
        'Missing vkey. Create a Node in the web UI and run the generated command.',
        fallbackNodeId, undefined)
      return true
    }
    /*
    if (!registerBody) {
      jsonReply(res, 400, { ok: false, error: 'Invalid register payload' })
      return true
    }

    // Phase 10: 优先按 per-node token 查找节点
    if (registerBody.token) {
      const found = getNodeByToken(db, registerBody.token)
      if (found) {
        // 更新节点信息（hostname/os/arch/agent_version 等由 agent 上报）
        const timestamp = nowIso()
        const updated: HubNode = {
          ...found.node,
          name: registerBody.name?.trim() || found.node.name,
          hostname: registerBody.hostname,
          os: registerBody.runtime.os,
          arch: registerBody.runtime.arch,
          agentVersion: registerBody.agent_version,
          hermesVersion: registerBody.hermes_version || found.node.hermesVersion,
          hermesHome: registerBody.hermes_home,
          status: 'online',
          capabilities: stringArrayFromFlags(registerBody.capabilities),
          tags: registerBody.tags ?? found.node.tags,
          updatedAt: timestamp,
        }
        dbUpsertNode(db, updated)
        jsonReply(res, 200, {
          ok: true,
          node_id: updated.id,
          server_time: timestamp,
          poll_interval_seconds: 3,
          heartbeat_interval_seconds: 10,
        })
        return true
      }
    }

    // Fallback: 全局 token 兼容（旧行为）
    if (resolvedToken && registerBody.token === resolvedToken) {
      const nodeId = registerBody.node_id || `node-${randomBytes(4).toString('hex')}`
      const existing = getNode(db, nodeId)
      if (!existing) {
        // Auto-create node with global token (backward compat)
        createNodeRecord(db, nodeId, registerBody.name?.trim() || nodeId, registerBody.token)
      }
      const node = upsertNode(db, { ...registerBody, node_id: nodeId })
      jsonReply(res, 200, {
        ok: true,
        node_id: node.id,
        server_time: nowIso(),
        poll_interval_seconds: 3,
        heartbeat_interval_seconds: 10,
      })
      return true
    }

    // Token 不匹配任何节点
    const hasPerNodeToken = db.prepare('SELECT COUNT(*) AS count FROM nodes WHERE token IS NOT NULL').get() as { count: number }
    if (hasPerNodeToken.count > 0) {
      // 已有 per-node tokens，强制要求有效 token
      jsonReply(res, 401, { ok: false, error: 'Invalid token. Create this node from the web UI first, then run: hermes-hub-agent --hub-url=... --token=<node-token>' })
      return true
    }
    if (resolvedToken) {
      // 有全局 token 但 agent 提供的 token 不对
      jsonReply(res, 401, { ok: false, error: 'Invalid registration token' })
      return true
    }
    // 没有 per-node tokens，agent 也没提供 token — 允许注册（开发模式 / 向后兼容）
    const nodeId = registerBody.node_id || `node-${randomBytes(4).toString('hex')}`
    const node = upsertNode(db, { ...registerBody, node_id: nodeId })
    jsonReply(res, 200, {
      ok: true,
      node_id: node.id,
      server_time: nowIso(),
      poll_interval_seconds: 3,
      heartbeat_interval_seconds: 10,
    })
    return true
    */
  }

  const pollMatch = path.match(/^\/api\/hub-agents\/([^/]+)\/commands\/poll$/)
  if (pollMatch) {
    if (method !== 'GET') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }
    const nodeId = decodeURIComponent(pollMatch[1])
    if (!getNode(db, nodeId)) {
      jsonReply(res, 404, { ok: false, error: `Node '${nodeId}' is not registered` })
      return true
    }
    if (!validateHubAgentVkey(db, nodeId, req)) {
      jsonReply(res, 401, { ok: false, error: 'Invalid hub agent token' })
      return true
    }
    const timestamp = nowIso()
    // 写操作串行化：收集当前 node 上正在运行的写命令对应的 agentId
    const busyAgentIds = getBusyAgentIds(db, nodeId)
    // 从数据库查询下一条待分发命令（自动跳过 busy agent）
    const nextCommand = pollNextPendingCommand(db, nodeId, busyAgentIds)
    if (nextCommand) {
      nextCommand.status = 'dispatched'
      nextCommand.dispatchedAt = timestamp
      nextCommand.updatedAt = timestamp
      upsertCommand(db, nextCommand)
      notifyCommandUpdated(nextCommand);
    }
    jsonReply(res, 200, { ok: true, commands: nextCommand ? [nextCommand] : [] })
    return true
  }

  const commandStartedMatch = path.match(/^\/api\/hub-agents\/([^/]+)\/commands\/([^/]+)\/started$/)
  if (commandStartedMatch) {
    if (method !== 'POST') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }
    const nodeId = decodeURIComponent(commandStartedMatch[1])
    const commandId = decodeURIComponent(commandStartedMatch[2])
    if (!getNode(db, nodeId)) {
      jsonReply(res, 404, { ok: false, error: `Node '${nodeId}' is not registered` })
      return true
    }
    if (!validateHubAgentVkey(db, nodeId, req)) {
      jsonReply(res, 401, { ok: false, error: 'Invalid hub agent token' })
      return true
    }
    const command = getCommand(db, commandId)
    if (!command || command.nodeId !== nodeId) {
      jsonReply(res, 404, { ok: false, error: `Command '${commandId}' not found` })
      return true
    }
    const timestamp = nowIso()
    command.status = 'running'
    command.startedAt = timestamp
    command.updatedAt = timestamp
    upsertCommand(db, command)
    notifyCommandUpdated(command);
    jsonReply(res, 200, { ok: true, data: command })
    return true
  }

  const commandResultMatch = path.match(/^\/api\/hub-agents\/([^/]+)\/commands\/([^/]+)\/result$/)
  if (commandResultMatch) {
    if (method !== 'POST') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }
    const nodeId = decodeURIComponent(commandResultMatch[1])
    const commandId = decodeURIComponent(commandResultMatch[2])
    if (!getNode(db, nodeId)) {
      jsonReply(res, 404, { ok: false, error: `Node '${nodeId}' is not registered` })
      return true
    }
    if (!validateHubAgentVkey(db, nodeId, req)) {
      jsonReply(res, 401, { ok: false, error: 'Invalid hub agent token' })
      return true
    }
    const command = getCommand(db, commandId)
    if (!command || command.nodeId !== nodeId) {
      jsonReply(res, 404, { ok: false, error: `Command '${commandId}' not found` })
      return true
    }

    let body: unknown
    try {
      body = await readJsonBody(req)
    } catch {
      jsonReply(res, 400, { ok: false, error: 'Invalid JSON body' })
      return true
    }
    const parsedBody = validateCommandResultBody(body)
    if (!parsedBody) {
      jsonReply(res, 400, { ok: false, error: 'Invalid command result payload' })
      return true
    }
    const resultBody = normalizeReportedStatus(parsedBody)

    const timestamp = nowIso()
    command.status = resultBody.status
    command.stdout = resultBody.stdout ? sanitizeMessage(resultBody.stdout) : undefined
    command.stderr = resultBody.stderr ? sanitizeMessage(resultBody.stderr) : undefined
    command.error = resultBody.error
    command.result = resultBody.result
    command.startedAt = command.startedAt ?? resultBody.started_at
    command.finishedAt = isTerminalCommandStatus(resultBody.status) ? (resultBody.finished_at ?? timestamp) : undefined
    command.updatedAt = timestamp
    upsertCommand(db, command)
    invalidateReadCachesForCommand(db, command, resultBody.status)
    notifyCommandUpdated(command);
    jsonReply(res, 200, { ok: true, data: command })
    return true
  }

  // Agent log upload (Phase 3)
  const agentLogsMatch = path.match(/^\/api\/hub-agents\/([^/]+)\/logs$/)
  if (agentLogsMatch) {
    if (method !== 'POST') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }
    const nodeId = decodeURIComponent(agentLogsMatch[1])
    if (!getNode(db, nodeId)) {
      jsonReply(res, 404, { ok: false, error: `Node '${nodeId}' is not registered` })
      return true
    }
    if (!validateHubAgentVkey(db, nodeId, req)) {
      jsonReply(res, 401, { ok: false, error: 'Invalid hub agent token' })
      return true
    }
    let body: unknown
    try { body = await readJsonBody(req) } catch {
      jsonReply(res, 400, { ok: false, error: 'Invalid JSON body' })
      return true
    }
    if (isObject(body) && typeof body.message === 'string') {
      const level = typeof body.level === 'string' ? body.level : 'info'
      insertLog(db, level, body.message, `node:${nodeId}`)
      jsonReply(res, 200, { ok: true })
    } else {
      jsonReply(res, 400, { ok: false, error: 'Request body must contain message (string)' })
    }
    return true
  }

  const heartbeatMatch = path.match(/^\/api\/hub-agents\/([^/]+)\/heartbeat$/)
  if (!heartbeatMatch) return false
  if (method !== 'POST') {
    jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
    return true
  }

  const nodeId = decodeURIComponent(heartbeatMatch[1])
  const node = getNode(db, nodeId)
  if (!node) {
    jsonReply(res, 404, { ok: false, error: `Node '${nodeId}' is not registered` })
    return true
  }
  if (!validateHubAgentVkey(db, nodeId, req)) {
    jsonReply(res, 401, { ok: false, error: 'Invalid hub agent token' })
    return true
  }

  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch {
    jsonReply(res, 400, { ok: false, error: 'Invalid JSON body' })
    return true
  }

  const heartbeatBody = validateHeartbeatBody(body)
  if (!heartbeatBody) {
    jsonReply(res, 400, { ok: false, error: 'Invalid heartbeat payload' })
    return true
  }

  const timestamp = nowIso()
  node.status = heartbeatBody.status
  node.lastHeartbeatAt = timestamp
  node.profilesTotal = heartbeatBody.summary?.profiles_total ?? heartbeatBody.profiles.length
  node.gatewayRunning = heartbeatBody.summary?.gateway_running ?? heartbeatBody.profiles.filter((p) => p.gateway_status === 'running').length
  node.updatedAt = timestamp
  dbUpsertNode(db, node)
  upsertAgentsFromHeartbeat(db, nodeId, heartbeatBody)
  checkTimeouts(db, nodeId, timestamp)
  // 检查所有节点心跳超时（30s 无心跳 → offline）
  markStaleNodesOffline(db, timestamp)

  jsonReply(res, 200, { ok: true, data: null })
  return true
}

async function handlePublicApi(
  path: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  db: Database.Database
): Promise<boolean> {
  // ---- 公开端点（无需 JWT）----

  if (path === '/api/health') {
    if (method !== 'GET') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }
    jsonReply(res, 200, { ok: true, data: { status: 'running', version: '1.0.0' } })
    return true
  }

  // Auth 端点
  if (path === '/api/auth/login' || path === '/api/auth/login/') {
    if (method !== 'POST') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }
    let body: unknown
    try { body = await readJsonBody(req) } catch {
      jsonReply(res, 400, { ok: false, error: 'Invalid JSON body' })
      return true
    }
    if (!isObject(body) || typeof body.username !== 'string' || typeof body.password !== 'string') {
      jsonReply(res, 400, { ok: false, error: 'username and password are required' })
      return true
    }
    const user = getUserByUsername(db, body.username)
    if (!user || !verifyPassword(body.password, user.password_hash)) {
      jsonReply(res, 401, { ok: false, error: 'Invalid username or password' })
      return true
    }
    const token = signJwt({ sub: user.id, username: user.username, role: user.role })
    jsonReply(res, 200, { ok: true, data: { token, user: { id: user.id, username: user.username, role: user.role, createdAt: user.created_at } } })
    return true
  }

  if (path === '/api/auth/status' || path === '/api/auth/status/') {
    if (method !== 'GET') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }
    const authUser = authenticateRequest(req)
    if (!authUser) {
      const status: AuthStatusResponse = { authenticated: false }
      jsonReply(res, 200, { ok: true, data: status })
      return true
    }
    const fullUser = getUserById(db, authUser.id)
    const status: AuthStatusResponse = {
      authenticated: true,
      user: fullUser ? { id: fullUser.id, username: fullUser.username, role: fullUser.role as 'admin' | 'operator' | 'viewer', createdAt: fullUser.created_at } : undefined,
    }
    jsonReply(res, 200, { ok: true, data: status })
    return true
  }

  // ---- 所有其他 /api/* 端点需要 JWT 鉴权 ----

  const authUser = authenticateRequest(req)
  if (!authUser) {
    jsonReply(res, 401, { ok: false, error: 'Authentication required' })
    return true
  }
  const userRole = roleLevel(authUser.role)

  // 修改密码（需要鉴权但不检查角色）
  if (path === '/api/auth/change-password' || path === '/api/auth/change-password/') {
    if (method !== 'POST') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }
    let body: unknown
    try { body = await readJsonBody(req) } catch {
      jsonReply(res, 400, { ok: false, error: 'Invalid JSON body' })
      return true
    }
    if (!isObject(body) || typeof body.newPassword !== 'string' || !body.newPassword) {
      jsonReply(res, 400, { ok: false, error: 'newPassword is required' })
      return true
    }
    const hash = hashPassword(body.newPassword)
    updateUser(db, authUser.id, { password_hash: hash })
    jsonReply(res, 200, { ok: true, data: { message: 'Password changed' } })
    return true
  }

  // ---- 受保护的业务端点 ----

  if (path === '/api/commands' || path === '/api/commands/') {
    if (method === 'GET') {
      jsonReply(res, 200, { ok: true, data: getAllCommands(db) })
      return true
    }
    if (method === 'POST') {
      if (userRole < 1) {
        jsonReply(res, 403, { ok: false, error: 'Operator role required to create commands' })
        return true
      }
      let body: unknown
      try {
        body = await readJsonBody(req)
      } catch {
        jsonReply(res, 400, { ok: false, error: 'Invalid JSON body' })
        return true
      }
      const createBody = validateCreateCommandBody(body)
      if (!createBody) {
        jsonReply(res, 400, { ok: false, error: 'Invalid command payload' })
        return true
      }
      const result = createCommand(db, createBody)
      if (!result.ok) {
        jsonReply(res, 400, { ok: false, error: result.error })
        return true
      }
      jsonReply(res, 201, { ok: true, data: result.command })
      return true
    }
    jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
    return true
  }

  const commandMatch = path.match(/^\/api\/commands\/([^/]+)$/)
  if (commandMatch) {
    if (method !== 'GET') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }
    const command = getCommand(db, decodeURIComponent(commandMatch[1]))
    if (!command) {
      jsonReply(res, 404, { ok: false, error: `Command '${decodeURIComponent(commandMatch[1])}' not found` })
      return true
    }
    jsonReply(res, 200, { ok: true, data: command })
    return true
  }

  if (path === '/api/nodes' || path === '/api/nodes/') {
    // GET /api/nodes — list all nodes
    if (method === 'GET') {
      markStaleNodesOffline(db, nowIso())
      jsonReply(res, 200, { ok: true, data: getAllNodes(db) })
      return true
    }
    // POST /api/nodes — create node (admin only, Phase 10)
    if (method === 'POST') {
      if (userRole < 2) {
        jsonReply(res, 403, { ok: false, error: 'Admin role required to create nodes' })
        return true
      }
      let body: unknown
      try { body = await readJsonBody(req) } catch {
        jsonReply(res, 400, { ok: false, error: 'Invalid JSON body' })
        return true
      }
      const nodeName = isObject(body) && typeof body.name === 'string' && body.name.trim()
        ? body.name.trim()
        : `node-${randomBytes(4).toString('hex')}`
      const nodeId = `node-${randomBytes(4).toString('hex')}`
      const nodeVkey = randomUUID().replace(/-/g, '')
      const node = createNodeRecord(db, nodeId, nodeName, nodeVkey)
      insertLog(db, 'info', `Node '${nodeId}' (${nodeName}) created via API with vkey`, 'hub')
      const command = hubAgentCommand(req, nodeId, nodeVkey)
      jsonReply(res, 201, { ok: true, data: { node, vkey: nodeVkey, command } })
      return true
    }
    jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
    return true
  }

  // Node token endpoint (admin only, Phase 10)
  const nodeVkeyMatch = path.match(/^\/api\/nodes\/([^/]+)\/vkey$/)
  if (nodeVkeyMatch) {
    if (method !== 'GET') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }
    if (userRole < 2) {
      jsonReply(res, 403, { ok: false, error: 'Admin role required to view node vkeys' })
      return true
    }
    const nodeId = decodeURIComponent(nodeVkeyMatch[1])
    const vkey = dbGetNodeVkey(db, nodeId)
    if (!vkey) {
      jsonReply(res, 404, { ok: false, error: `Node '${nodeId}' not found or has no vkey` })
      return true
    }
    const command = hubAgentCommand(req, nodeId, vkey)
    jsonReply(res, 200, { ok: true, data: { vkey, command } })
    return true
  }

  // Node detail CRUD (Phase 8)
  const nodeDetailMatch = path.match(/^\/api\/nodes\/([^/]+)$/)
  if (nodeDetailMatch) {
    const nodeId = decodeURIComponent(nodeDetailMatch[1])

    if (method === 'GET') {
      const node = getNode(db, nodeId)
      if (!node) {
        jsonReply(res, 404, { ok: false, error: `Node '${nodeId}' not found` })
        return true
      }
      jsonReply(res, 200, { ok: true, data: node })
      return true
    }

    if (method === 'PUT') {
      if (userRole < 2) {
        jsonReply(res, 403, { ok: false, error: 'Admin role required to manage nodes' })
        return true
      }
      let body: unknown
      try { body = await readJsonBody(req) } catch {
        jsonReply(res, 400, { ok: false, error: 'Invalid JSON body' })
        return true
      }
      if (!isObject(body)) {
        jsonReply(res, 400, { ok: false, error: 'Invalid body' })
        return true
      }
      const update: Record<string, unknown> = {}
      if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim()
      if (typeof body.status === 'string' && ['online', 'offline', 'unhealthy', 'disabled'].includes(body.status)) {
        update.status = body.status
      }
      if (Array.isArray(body.tags)) update.tags = body.tags.filter((t: unknown) => typeof t === 'string')
      if (Object.keys(update).length === 0) {
        jsonReply(res, 400, { ok: false, error: 'No valid fields to update (name, status, tags)' })
        return true
      }
      const updated = updateNodeFields(db, nodeId, update as Partial<Pick<HubNode, 'name' | 'status' | 'tags'>>)
      if (!updated) {
        jsonReply(res, 404, { ok: false, error: `Node '${nodeId}' not found` })
        return true
      }
      insertLog(db, 'info', `Node '${nodeId}' updated: ${JSON.stringify(update)}`, 'hub')
      jsonReply(res, 200, { ok: true, data: updated })
      return true
    }

    if (method === 'DELETE') {
      if (userRole < 2) {
        jsonReply(res, 403, { ok: false, error: 'Admin role required to delete nodes' })
        return true
      }
      const node = getNode(db, nodeId)
      if (!node) {
        jsonReply(res, 404, { ok: false, error: `Node '${nodeId}' not found` })
        return true
      }
      if (node.status === 'online') {
        jsonReply(res, 400, { ok: false, error: 'Cannot delete an online node. Disable it first or wait for it to go offline.' })
        return true
      }
      deleteNode(db, nodeId)
      insertLog(db, 'warn', `Node '${nodeId}' deleted`, 'hub')
      jsonReply(res, 200, { ok: true, data: null })
      return true
    }

    jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
    return true
  }

  if (path === '/api/agents' || path === '/api/agents/') {
    if (method !== 'GET') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }
    jsonReply(res, 200, { ok: true, data: getAllAgents(db) })
    return true
  }

  const agentMatch = path.match(/^\/api\/agents\/([^/]+)$/)
  if (agentMatch) {
    if (method !== 'GET') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }
    const id = decodeURIComponent(agentMatch[1])
    const agent = getAgent(db, id)
    if (!agent) {
      jsonReply(res, 404, { ok: false, error: `Agent '${id}' not found` })
      return true
    }
    jsonReply(res, 200, { ok: true, data: agent })
    return true
  }

  if (path === '/api/profiles' || path === '/api/profiles/') {
    if (method === 'POST') {
      if (userRole < 1) {
        jsonReply(res, 403, { ok: false, error: 'Operator role required to create agents' })
        return true
      }
      let body: unknown
      try {
        body = await readJsonBody(req)
      } catch {
        jsonReply(res, 400, { ok: false, error: 'Invalid JSON body' })
        return true
      }
      if (!isObject(body)) {
        jsonReply(res, 400, { ok: false, error: 'Invalid create profile payload' })
        return true
      }
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) {
        jsonReply(res, 400, { ok: false, error: 'name is required' })
        return true
      }
      const result = createCommand(db, {
        nodeId: typeof body.nodeId === 'string' ? body.nodeId : undefined,
        type: 'profile.create',
        payload: {
          profile_name: name,
          clone_mode: typeof body.cloneMode === 'string' ? body.cloneMode : 'blank',
          clone_from_agent_id: typeof body.cloneFrom === 'string' ? body.cloneFrom : undefined,
          no_alias: body.noAlias === true,
        },
      })
      if (!result.ok) {
        jsonReply(res, 400, { ok: false, error: result.error })
        return true
      }
      jsonReply(res, 202, { ok: true, data: result.command })
      return true
    }
    if (method !== 'GET') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }
    jsonReply(res, 200, { ok: true, data: getAllAgents(db).map(profileCompat) })
    return true
  }

  const profileRenameMatch = path.match(/^\/api\/profiles\/([^/]+)\/rename$/)
  if (profileRenameMatch) {
    if (method !== 'PUT') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }
    let body: unknown
    try {
      body = await readJsonBody(req)
    } catch {
      jsonReply(res, 400, { ok: false, error: 'Invalid JSON body' })
      return true
    }
    const agentId = decodeURIComponent(profileRenameMatch[1])
    const nextName = isObject(body) && typeof body.name === 'string' ? body.name.trim() : ''
    const result = createCommand(db, {
      agentId,
      type: 'profile.rename',
      payload: { new_name: nextName },
    })
    if (!result.ok) {
      jsonReply(res, 400, { ok: false, error: result.error })
      return true
    }
    jsonReply(res, 202, { ok: true, data: result.command })
    return true
  }

  // Gateway start/stop/restart routes
  const gatewayStartMatch = path.match(/^\/api\/profiles\/([^/]+)\/gateway\/start$/)
  if (gatewayStartMatch) {
    if (method !== 'POST') { jsonReply(res, 405, { ok: false, error: 'Method not allowed' }); return true }
    const result = createCommand(db, { agentId: decodeURIComponent(gatewayStartMatch[1]), type: 'gateway.start', payload: {} })
    if (!result.ok) { jsonReply(res, 400, { ok: false, error: result.error }); return true }
    jsonReply(res, 202, { ok: true, data: result.command })
    return true
  }

  const gatewayStopMatch = path.match(/^\/api\/profiles\/([^/]+)\/gateway\/stop$/)
  if (gatewayStopMatch) {
    if (method !== 'POST') { jsonReply(res, 405, { ok: false, error: 'Method not allowed' }); return true }
    const result = createCommand(db, { agentId: decodeURIComponent(gatewayStopMatch[1]), type: 'gateway.stop', payload: {} })
    if (!result.ok) { jsonReply(res, 400, { ok: false, error: result.error }); return true }
    jsonReply(res, 202, { ok: true, data: result.command })
    return true
  }

  const gatewayRestartMatch = path.match(/^\/api\/profiles\/([^/]+)\/gateway\/restart$/)
  if (gatewayRestartMatch) {
    if (method !== 'POST') { jsonReply(res, 405, { ok: false, error: 'Method not allowed' }); return true }
    const result = createCommand(db, { agentId: decodeURIComponent(gatewayRestartMatch[1]), type: 'gateway.restart', payload: {} })
    if (!result.ok) { jsonReply(res, 400, { ok: false, error: result.error }); return true }
    jsonReply(res, 202, { ok: true, data: result.command })
    return true
  }

  // Setup route
  const setupMatch = path.match(/^\/api\/profiles\/([^/]+)\/setup$/)
  if (setupMatch) {
    if (method !== 'POST') { jsonReply(res, 405, { ok: false, error: 'Method not allowed' }); return true }
    let setupBody: unknown = {}
    try { setupBody = await readJsonBody(req) } catch { /* 允许空 body */ }
    const setupPayload = parseSetupPayload(setupBody)
    const result = createCommand(db, { agentId: decodeURIComponent(setupMatch[1]), type: 'setup.run', payload: setupPayload as unknown as Record<string, unknown> })
    if (!result.ok) { jsonReply(res, 400, { ok: false, error: result.error }); return true }
    jsonReply(res, 202, { ok: true, data: result.command })
    return true
  }

  const setupCatalogMatch = path.match(/^\/api\/profiles\/([^/]+)\/setup\/catalog$/)
  if (setupCatalogMatch) {
    if (method !== 'POST') { jsonReply(res, 405, { ok: false, error: 'Method not allowed' }); return true }
    return replyReadQueryForAgent<SetupCatalogResult>(db, res, decodeURIComponent(setupCatalogMatch[1]), 'setup.catalog')
  }

  // Doctor route
  const doctorMatch = path.match(/^\/api\/profiles\/([^/]+)\/doctor$/)
  if (doctorMatch) {
    if (method !== 'POST') { jsonReply(res, 405, { ok: false, error: 'Method not allowed' }); return true }
    const result = createCommand(db, { agentId: decodeURIComponent(doctorMatch[1]), type: 'doctor.run', payload: {} })
    if (!result.ok) { jsonReply(res, 400, { ok: false, error: result.error }); return true }
    jsonReply(res, 202, { ok: true, data: result.command })
    return true
  }

  // Config read/write routes (Phase 6)
  const configReadMatch = path.match(/^\/api\/profiles\/([^/]+)\/config\/read$/)
  if (configReadMatch) {
    if (method !== 'POST') { jsonReply(res, 405, { ok: false, error: 'Method not allowed' }); return true }
    return replyReadQueryForAgent<ConfigReadResult>(db, res, decodeURIComponent(configReadMatch[1]), 'config.read')
  }

  const configWriteMatch = path.match(/^\/api\/profiles\/([^/]+)\/config\.yaml$/)
  if (configWriteMatch) {
    if (method !== 'POST') { jsonReply(res, 405, { ok: false, error: 'Method not allowed' }); return true }
    let body: unknown
    try { body = await readJsonBody(req) } catch { jsonReply(res, 400, { ok: false, error: 'Invalid JSON' }); return true }
    const content = isObject(body) && typeof body.content === 'string' ? body.content : ''
    const result = createCommand(db, { agentId: decodeURIComponent(configWriteMatch[1]), type: 'config.patch', payload: { content } })
    if (!result.ok) { jsonReply(res, 400, { ok: false, error: result.error }); return true }
    jsonReply(res, 202, { ok: true, data: result.command })
    return true
  }

  // SOUL read/write routes (Phase 6)
  const soulReadMatch = path.match(/^\/api\/profiles\/([^/]+)\/soul\/read$/)
  if (soulReadMatch) {
    if (method !== 'POST') { jsonReply(res, 405, { ok: false, error: 'Method not allowed' }); return true }
    return replyReadQueryForAgent<SoulReadResult>(db, res, decodeURIComponent(soulReadMatch[1]), 'soul.read')
  }

  const soulWriteMatch = path.match(/^\/api\/profiles\/([^/]+)\/SOUL\.md$/)
  if (soulWriteMatch) {
    if (method !== 'POST') { jsonReply(res, 405, { ok: false, error: 'Method not allowed' }); return true }
    let body: unknown
    try { body = await readJsonBody(req) } catch { jsonReply(res, 400, { ok: false, error: 'Invalid JSON' }); return true }
    const content = isObject(body) && typeof body.content === 'string' ? body.content : ''
    const result = createCommand(db, { agentId: decodeURIComponent(soulWriteMatch[1]), type: 'soul.update', payload: { content } })
    if (!result.ok) { jsonReply(res, 400, { ok: false, error: result.error }); return true }
    jsonReply(res, 202, { ok: true, data: result.command })
    return true
  }

  // Skills read route (Phase 6)
  const skillsReadMatch = path.match(/^\/api\/profiles\/([^/]+)\/skills\/read$/)
  if (skillsReadMatch) {
    if (method !== 'POST') { jsonReply(res, 405, { ok: false, error: 'Method not allowed' }); return true }
    return replyReadQueryForAgent<SkillsListResult>(db, res, decodeURIComponent(skillsReadMatch[1]), 'skills.list')
  }

  const sessionsReadMatch = path.match(/^\/api\/profiles\/([^/]+)\/sessions\/read$/)
  if (sessionsReadMatch) {
    if (method !== 'POST') { jsonReply(res, 405, { ok: false, error: 'Method not allowed' }); return true }
    return replyReadQueryForAgent<SessionsListResult>(db, res, decodeURIComponent(sessionsReadMatch[1]), 'sessions.list')
  }

  const gatewayStatusMatch = path.match(/^\/api\/profiles\/([^/]+)\/gateway\/status$/)
  if (gatewayStatusMatch) {
    if (method !== 'POST') { jsonReply(res, 405, { ok: false, error: 'Method not allowed' }); return true }
    return replyReadQueryForAgent<GatewayStatusResult>(db, res, decodeURIComponent(gatewayStatusMatch[1]), 'gateway.status')
  }

  // Env routes (Phase 6)
  const envReadMatch = path.match(/^\/api\/profiles\/([^/]+)\/env\/read$/)
  if (envReadMatch) {
    if (method !== 'POST') { jsonReply(res, 405, { ok: false, error: 'Method not allowed' }); return true }
    return replyReadQueryForAgent<EnvStatusResult>(db, res, decodeURIComponent(envReadMatch[1]), 'env.status')
  }

  const envSetMatch = path.match(/^\/api\/profiles\/([^/]+)\/env$/)
  if (envSetMatch) {
    if (method !== 'POST') { jsonReply(res, 405, { ok: false, error: 'Method not allowed' }); return true }
    let body: unknown
    try { body = await readJsonBody(req) } catch { jsonReply(res, 400, { ok: false, error: 'Invalid JSON' }); return true }
    if (!isObject(body) || typeof body.key !== 'string' || typeof body.value !== 'string') {
      jsonReply(res, 400, { ok: false, error: 'env set requires key and value' }); return true
    }
    const result = createCommand(db, { agentId: decodeURIComponent(envSetMatch[1]), type: 'env.set', payload: { key: body.key, value: body.value } })
    if (!result.ok) { jsonReply(res, 400, { ok: false, error: result.error }); return true }
    jsonReply(res, 202, { ok: true, data: result.command })
    return true
  }

  const envDeleteMatch = path.match(/^\/api\/profiles\/([^/]+)\/env\/delete$/)
  if (envDeleteMatch) {
    if (method !== 'POST') { jsonReply(res, 405, { ok: false, error: 'Method not allowed' }); return true }
    let body: unknown
    try { body = await readJsonBody(req) } catch { jsonReply(res, 400, { ok: false, error: 'Invalid JSON' }); return true }
    if (!isObject(body) || typeof body.key !== 'string') {
      jsonReply(res, 400, { ok: false, error: 'env delete requires key' }); return true
    }
    const result = createCommand(db, { agentId: decodeURIComponent(envDeleteMatch[1]), type: 'env.delete', payload: { key: body.key } })
    if (!result.ok) { jsonReply(res, 400, { ok: false, error: result.error }); return true }
    jsonReply(res, 202, { ok: true, data: result.command })
    return true
  }

  const profileMatch = path.match(/^\/api\/profiles\/([^/]+)$/)
  if (profileMatch) {
    const id = decodeURIComponent(profileMatch[1])
    if (method === 'DELETE') {
      const result = createCommand(db, {
        agentId: id,
        type: 'profile.delete',
        payload: {},
      })
      if (!result.ok) {
        jsonReply(res, 400, { ok: false, error: result.error })
        return true
      }
      jsonReply(res, 202, { ok: true, data: result.command })
      return true
    }
    if (method !== 'GET') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }
    const agent = getAgent(db, id)
    if (!agent) {
      jsonReply(res, 404, { ok: false, error: `Agent '${id}' not found` })
      return true
    }
    jsonReply(res, 200, { ok: true, data: profileCompat(agent) })
    return true
  }

  // Logs 路由（Phase 5）
  if (path === '/api/logs' || path === '/api/logs/') {
    if (method !== 'GET') { jsonReply(res, 405, { ok: false, error: 'Method not allowed' }); return true }
    jsonReply(res, 200, { ok: true, data: getAllLogs(db) })
    return true
  }

  const profileLogsMatch = path.match(/^\/api\/profiles\/([^/]+)\/logs$/)
  if (profileLogsMatch) {
    if (method !== 'GET') { jsonReply(res, 405, { ok: false, error: 'Method not allowed' }); return true }
    jsonReply(res, 200, { ok: true, data: getLogsForAgent(db, decodeURIComponent(profileLogsMatch[1])) })
    return true
  }

  const nodeLogsMatch = path.match(/^\/api\/nodes\/([^/]+)\/logs$/)
  if (nodeLogsMatch) {
    if (method !== 'GET') { jsonReply(res, 405, { ok: false, error: 'Method not allowed' }); return true }
    jsonReply(res, 200, { ok: true, data: getLogsForNode(db, decodeURIComponent(nodeLogsMatch[1])) })
    return true
  }

  const commandLogsMatch = path.match(/^\/api\/commands\/([^/]+)\/logs$/)
  if (commandLogsMatch) {
    if (method !== 'GET') { jsonReply(res, 405, { ok: false, error: 'Method not allowed' }); return true }
    jsonReply(res, 200, { ok: true, data: getLogsForCommand(db, decodeURIComponent(commandLogsMatch[1])) })
    return true
  }

  if (path === '/api/config' || path === '/api/config/') {
    if (method !== 'GET') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }
    jsonReply(res, 200, { ok: true, data: { paths: [] } })
    return true
  }

  // Registration token (Phase 8)
  if (path === '/api/settings/registration-token' || path === '/api/settings/registration-token/') {
    if (method !== 'GET') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }
    if (userRole < 2) {
      jsonReply(res, 403, { ok: false, error: 'Admin role required' })
      return true
    }
    jsonReply(res, 200, { ok: true, data: { token: resolvedToken ?? '', enabled: Boolean(resolvedToken) } })
    return true
  }

  return false
}

function serveStatic(res: ServerResponse, staticDir: string | undefined, path: string): boolean {
  if (!staticDir) return false
  const filePath = path === '/' ? resolve(staticDir, 'index.html') : resolve(staticDir, `.${path}`)
  if (!existsSync(filePath)) return false
  const ext = extname(filePath).toLowerCase()
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' })
  res.end(readFileSync(filePath))
  return true
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: ServerOptions,
  db: Database.Database
): Promise<void> {
  const rawUrl = req.url ?? '/'
  const path = rawUrl.split('?')[0]
  const method = req.method ?? 'GET'

  if (path.startsWith('/api/hub-agents')) {
    if (await handleHubAgentApi(path, method, req, res, db)) return
  }

  if (path.startsWith('/api/')) {
    if (await handlePublicApi(path, method, req, res, db)) return
    jsonReply(res, 404, { ok: false, error: `Unknown API route: ${path}` })
    return
  }

  if (serveStatic(res, opts.staticDir, path)) return

  if (opts.staticDir && existsSync(resolve(opts.staticDir, 'index.html'))) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(readFileSync(resolve(opts.staticDir, 'index.html'), 'utf-8'))
    return
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('Not Found')
}

export function startServer(opts: ServerOptions): ReturnType<typeof createServer> {
  serverPort = opts.port

  // 初始化 SQLite 数据库，持久化 path 默认为 ~/.hermes-hub/hub.db
  const db = initDatabase(opts.dbPath)

  // 注册 token：优先使用传入值，否则从 metadata 读取，最后自动生成
  resolvedToken = opts.registrationToken ?? getMetadataValue(db, 'registration_token') ?? undefined
  if (!resolvedToken) {
    resolvedToken = randomUUID()
    setMetadataValue(db, 'registration_token', resolvedToken)
    console.log(`[hermes-hub] Registration token: ${resolvedToken}`)
  }

  // Seed default admin user if users table is empty
  const adminInfo = seedDefaultAdmin(db)
  if (adminInfo) {
    console.log(`[hermes-hub] Default admin created: ${adminInfo.username} / ${adminInfo.password} -- CHANGE PASSWORD IMMEDIATELY`)
  } else {
    // Always show current user count on startup
    const allUsers = getAllUsers(db)
    if (allUsers.length > 0) {
      const roleSummary = allUsers.map((u: DbUserRow) => `${u.username}(${u.role})`).join(', ')
      console.log(`[hermes-hub] ${allUsers.length} user(s): ${roleSummary}`)
    }
  }

  const server = createServer((req, res) => {
    const start = Date.now()
    res.on('finish', () => {
      const ms = Date.now() - start
      console.log(`[hermes-hub] ${req.method} ${req.url} → ${res.statusCode} (${ms}ms)`)
    })
    void handleRequest(req, res, opts, db)
  })

  server.on('error', (error) => {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'EADDRINUSE') {
      console.error(`[hermes-hub] Port ${opts.port} is already in use. Try: --port ${opts.port + 1}`)
      return
    }
    console.error(`[hermes-hub] Server error: ${err.message}`)
  })

  // WebSocket upgrade (Phase 11 — command push)
  server.on('upgrade', (req, socket, head) => {
    if (req.url === '/ws') {
      const connection = handleUpgrade(req, socket, head, {
        onClose(conn) {
          wsClients.delete(conn)
        },
      })
      if (connection) wsClients.add(connection)
      return
    }
    if (req.url === '/ws/query-agent') {
      let binding: ReturnType<typeof bindQueryChannel> | null = null
      const connection = handleUpgrade(req, socket, head, {
        onText(_connection, payload) {
          binding?.onText(payload)
        },
        onClose() {
          binding?.onClose()
        },
      })
      if (connection) {
        binding = bindQueryChannel(db, connection)
      }
      return
    }
    socket.destroy()
  })

  server.listen(opts.port, () => {
    console.log(`Hermes Hub Server running at http://localhost:${opts.port}`)
    console.log('Controller-Agent APIs: /api/nodes, /api/agents, /api/hub-agents/register')
  })

  return server
}
