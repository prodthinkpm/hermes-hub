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

export interface ServerOptions {
  port: number
  apiUrl?: string
  staticDir?: string
}

interface HubState {
  nodes: Map<string, HubNode>
  agents: Map<string, ManagedAgent>
  commands: Map<string, HubCommand>
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

const state: HubState = {
  nodes: new Map(),
  agents: new Map(),
  commands: new Map(),
}

let nextCommandNumber = 1

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
  return value === 'profile.scan' || value === 'profile.create' || value === 'profile.rename' || value === 'profile.delete'
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

function chooseDefaultNodeId(): string | null {
  const onlineNode = [...state.nodes.values()].find((node) => node.status === 'online')
  return onlineNode?.id ?? state.nodes.values().next().value?.id ?? null
}

function createCommand(body: CreateCommandRequest): { ok: true; command: HubCommand } | { ok: false; error: string } {
  const agent = body.agentId ? state.agents.get(body.agentId) : undefined
  const nodeId = body.nodeId ?? agent?.nodeId ?? chooseDefaultNodeId()
  if (!nodeId) return { ok: false, error: 'No registered node is available' }
  if (!state.nodes.has(nodeId)) return { ok: false, error: `Node '${nodeId}' not found` }

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

  const timestamp = nowIso()
  // 默认命令超时 300 秒，可通过 payload.timeoutSeconds 覆盖
  const timeoutSeconds =
    typeof body.payload?.timeoutSeconds === 'number'
      ? (body.payload as Record<string, number>).timeoutSeconds
      : 300
  const command: HubCommand = {
    id: `cmd_${String(nextCommandNumber++).padStart(6, '0')}`,
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
  state.commands.set(command.id, command)
  return { ok: true, command }
}

function upsertNode(body: HubAgentRegisterRequest): HubNode {
  const existing = state.nodes.get(body.node_id)
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
  state.nodes.set(node.id, node)
  return node
}

// 检查 node 上所有 running 命令是否超过 timeoutSeconds，超时则标记为 timeout
function checkTimeouts(nodeId: string, timestamp: string): void {
  const now = new Date(timestamp).getTime()
  for (const command of state.commands.values()) {
    if (command.nodeId !== nodeId || command.status !== 'running') continue
    if (!command.startedAt) continue
    const startedMs = new Date(command.startedAt).getTime()
    const elapsedSeconds = (now - startedMs) / 1000
    if (elapsedSeconds > command.timeoutSeconds) {
      command.status = 'timeout'
      command.error = `Command timed out after ${elapsedSeconds.toFixed(0)}s (limit: ${command.timeoutSeconds}s)`
      command.finishedAt = timestamp
      command.updatedAt = timestamp
      state.commands.set(command.id, command)
    }
  }
}

function upsertAgentsFromHeartbeat(nodeId: string, body: HubAgentHeartbeatRequest): void {
  const timestamp = nowIso()
  const seen = new Set<string>()

  for (const profile of body.profiles) {
    if (!profile.profile_name || !profile.profile_home) continue
    const id = `${nodeId}:${profile.profile_name}`
    seen.add(id)
    const existing = state.agents.get(id)
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
    state.agents.set(id, agent)
  }

  for (const [agentId, agent] of state.agents.entries()) {
    if (agent.nodeId === nodeId && !seen.has(agentId)) {
      state.agents.delete(agentId)
    }
  }
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

async function handleHubAgentApi(path: string, method: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
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
    const node = upsertNode(registerBody)
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
    if (!state.nodes.has(nodeId)) {
      jsonReply(res, 404, { ok: false, error: `Node '${nodeId}' is not registered` })
      return true
    }
    const timestamp = nowIso()
    // 写操作白名单：同一 agent 同时只允许一个写操作
    const WRITE_TYPES = new Set(['profile.create', 'profile.rename', 'profile.delete'])
    // 收集当前 node 上所有正在运行的写命令对应的 agentId
    const busyAgentIds = new Set(
      [...state.commands.values()]
        .filter((c) => c.nodeId === nodeId && c.status === 'running' && c.agentId && WRITE_TYPES.has(c.type))
        .map((c) => c.agentId)
    )
    const commands = [...state.commands.values()]
      .filter((command) => {
        if (command.nodeId !== nodeId || command.status !== 'pending') return false
        // 跳过目标 agent 正忙于其他写操作的命令
        if (command.agentId && WRITE_TYPES.has(command.type) && busyAgentIds.has(command.agentId)) return false
        return true
      })
      .slice(0, 1)
      .map((command) => {
        command.status = 'dispatched'
        command.dispatchedAt = timestamp
        command.updatedAt = timestamp
        state.commands.set(command.id, command)
        return command
      })
    jsonReply(res, 200, { ok: true, commands })
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
    const command = state.commands.get(commandId)
    if (!command || command.nodeId !== nodeId) {
      jsonReply(res, 404, { ok: false, error: `Command '${commandId}' not found` })
      return true
    }
    const timestamp = nowIso()
    command.status = 'running'
    command.startedAt = timestamp
    command.updatedAt = timestamp
    state.commands.set(command.id, command)
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
    const command = state.commands.get(commandId)
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
    state.commands.set(command.id, command)
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
  const node = state.nodes.get(nodeId)
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
  state.nodes.set(node.id, node)
  upsertAgentsFromHeartbeat(nodeId, heartbeatBody)
  // 检查该 node 上所有 running 命令是否超时
  checkTimeouts(nodeId, timestamp)

  jsonReply(res, 200, { ok: true, data: null })
  return true
}

async function handlePublicApi(path: string, method: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
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
      jsonReply(res, 200, { ok: true, data: [...state.commands.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) })
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
      const result = createCommand(createBody)
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
    const command = state.commands.get(decodeURIComponent(commandMatch[1]))
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
    jsonReply(res, 200, { ok: true, data: [...state.nodes.values()] })
    return true
  }

  if (path === '/api/agents' || path === '/api/agents/') {
    if (method !== 'GET') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }
    jsonReply(res, 200, { ok: true, data: [...state.agents.values()] })
    return true
  }

  const agentMatch = path.match(/^\/api\/agents\/([^/]+)$/)
  if (agentMatch) {
    if (method !== 'GET') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }
    const id = decodeURIComponent(agentMatch[1])
    const agent = state.agents.get(id)
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
      const result = createCommand({
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
    jsonReply(res, 200, { ok: true, data: [...state.agents.values()].map(profileCompat) })
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
    const result = createCommand({
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

  const profileMatch = path.match(/^\/api\/profiles\/([^/]+)$/)
  if (profileMatch) {
    const id = decodeURIComponent(profileMatch[1])
    if (method === 'DELETE') {
      const result = createCommand({
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
    const agent = state.agents.get(id)
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

async function handleRequest(req: IncomingMessage, res: ServerResponse, opts: ServerOptions): Promise<void> {
  const rawUrl = req.url ?? '/'
  const path = rawUrl.split('?')[0]
  const method = req.method ?? 'GET'

  if (path.startsWith('/api/hub-agents')) {
    if (await handleHubAgentApi(path, method, req, res)) return
  }

  if (path.startsWith('/api/')) {
    if (await handlePublicApi(path, method, req, res)) return
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
  const server = createServer((req, res) => {
    void handleRequest(req, res, opts)
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
