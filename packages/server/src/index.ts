import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import type {
  CommandResultRequest,
  CommandType,
  CreateCommandRequest,
  HubCommand,
  HubAgentHeartbeatRequest,
  HubAgentRegisterRequest,
  HubNode,
  ManagedAgent,
} from '@hermes-hub/protocol'
import type Database from 'better-sqlite3'
import {
  initDatabase,
  getNode,
  getAllNodes,
  upsertNode as dbUpsertNode,
  getAgent,
  getAllAgents,
  upsertAgent,
  deleteAgentsForNode,
  getCommand,
  getAllCommands,
  upsertCommand,
  getNextCommandNumber,
  getRunningCommandsForNode,
  getBusyAgentIds,
  pollNextPendingCommand,
} from './database.js'

export interface ServerOptions {
  port: number
  apiUrl?: string
  staticDir?: string
  dbPath?: string  // SQLite 数据库路径，默认 ~/.hermes-hub/hub.db
}

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
    typeof body.node_id !== 'string' ||
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
    value === 'gateway.start' || value === 'gateway.stop' || value === 'gateway.restart' ||
    value === 'doctor.run' || value === 'setup.run'
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
  if (body.status !== 'success' && body.status !== 'failed') return null
  return body as unknown as CommandResultRequest
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
  const nodeId = body.nodeId ?? agent?.nodeId ?? chooseDefaultNodeId(db)
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
  }
  if (body.type === 'profile.rename') {
    const nextName = typeof body.payload?.new_name === 'string' ? body.payload.new_name.trim() : ''
    if (!nextName) return { ok: false, error: 'profile.rename requires payload.new_name' }
  }
  // gateway/doctor/setup 需要 agent 来确定操作的 profile
  if (
    (body.type.startsWith('gateway.') || body.type === 'doctor.run' || body.type === 'setup.run') &&
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
  // 使用数据库原子计数器生成命令 ID
  const commandNum = getNextCommandNumber(db)
  const command: HubCommand = {
    id: `cmd_${String(commandNum).padStart(6, '0')}`,
    nodeId,
    agentId: body.agentId,
    type: body.type,
    payload: {
      ...(body.payload ?? {}),
      ...(agent ? { profile_name: agent.profileName, profile_home: agent.profileHome } : {}),
    },
    status: 'pending',
    timeoutSeconds,
    createdBy: 'local-user',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  upsertCommand(db, command)
  return { ok: true, command }
}

// 根据注册请求构造 node 对象并写入数据库，保留已有节点的历史数据
function upsertNode(
  db: Database.Database,
  body: HubAgentRegisterRequest
): HubNode {
  const existing = getNode(db, body.node_id)
  const timestamp = nowIso()
  const node: HubNode = {
    id: body.node_id,
    name: body.name?.trim() || body.node_id,
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
      lastError: profile.last_error,
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
    const node = upsertNode(db, registerBody)
    jsonReply(res, 200, {
      ok: true,
      node_id: node.id,
      server_time: nowIso(),
      poll_interval_seconds: 3,
      heartbeat_interval_seconds: 10,
    })
    return true
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
    const resultBody = validateCommandResultBody(body)
    if (!resultBody) {
      jsonReply(res, 400, { ok: false, error: 'Invalid command result payload' })
      return true
    }

    const timestamp = nowIso()
    command.status = resultBody.status
    command.stdout = resultBody.stdout
    command.stderr = resultBody.stderr
    command.error = resultBody.error
    command.startedAt = command.startedAt ?? resultBody.started_at
    command.finishedAt = resultBody.finished_at ?? timestamp
    command.updatedAt = timestamp
    upsertCommand(db, command)
    jsonReply(res, 200, { ok: true, data: command })
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
  // 检查该 node 上所有 running 命令是否超时
  checkTimeouts(db, nodeId, timestamp)

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
  if (path === '/api/health') {
    if (method !== 'GET') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }
    jsonReply(res, 200, { ok: true, data: { status: 'running', version: '1.0.0' } })
    return true
  }

  if (path === '/api/commands' || path === '/api/commands/') {
    if (method === 'GET') {
      jsonReply(res, 200, { ok: true, data: getAllCommands(db) })
      return true
    }
    if (method === 'POST') {
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
    if (method !== 'GET') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }
    jsonReply(res, 200, { ok: true, data: getAllNodes(db) })
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
          clone_from: typeof body.cloneFrom === 'string' ? body.cloneFrom : undefined,
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
    const section = isObject(setupBody) && typeof setupBody.section === 'string' ? setupBody.section : 'all'
    const result = createCommand(db, { agentId: decodeURIComponent(setupMatch[1]), type: 'setup.run', payload: { section } })
    if (!result.ok) { jsonReply(res, 400, { ok: false, error: result.error }); return true }
    jsonReply(res, 202, { ok: true, data: result.command })
    return true
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

  if (path === '/api/logs' || path === '/api/logs/') {
    if (method !== 'GET') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }
    jsonReply(res, 200, { ok: true, data: [] })
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
  // 初始化 SQLite 数据库，持久化 path 默认为 ~/.hermes-hub/hub.db
  const db = initDatabase(opts.dbPath)

  const server = createServer((req, res) => {
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

  server.listen(opts.port, () => {
    console.log(`Hermes Hub Server running at http://localhost:${opts.port}`)
    console.log('Controller-Agent APIs: /api/nodes, /api/agents, /api/hub-agents/register')
  })

  return server
}
