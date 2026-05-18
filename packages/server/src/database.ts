// SQLite persistence layer for Hermes Hub Server.
// Replaces the in-memory Maps with a SQLite database at ~/.hermes-hub/hub.db.

import { homedir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type {
  HubNode,
  ManagedAgent,
  HubCommand,
  CommandType,
  CommandStatus,
  NodeStatus,
  AgentSetupStatus,
  AgentRuntimeStatus,
  AgentApiStatus,
} from '@hermes-hub/protocol'

// ---- Row types (match SQLite column names) ----

export interface DbNodeRow {
  id: string
  name: string
  hostname: string
  os: string
  arch: string
  agent_version: string
  hermes_version: string | null
  hermes_home: string
  status: string
  capabilities: string  // JSON array
  tags: string           // JSON array
  last_heartbeat_at: string | null
  profiles_total: number
  gateway_running: number
  created_at: string
  updated_at: string
}

export interface DbAgentRow {
  id: string
  node_id: string
  profile_name: string
  display_name: string | null
  description: string | null
  profile_home: string
  provider: string | null
  model: string | null
  terminal_cwd: string | null
  setup_status: string
  gateway_status: string
  api_server_status: string
  sessions_count: number | null
  skills_count: number | null
  cron_count: number | null
  has_env: number
  has_soul: number
  last_seen_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface DbCommandRow {
  id: string
  node_id: string
  agent_id: string | null
  type: string
  payload: string         // JSON object
  status: string
  stdout: string | null
  stderr: string | null
  error: string | null
  timeout_seconds: number
  created_by: string
  created_at: string
  dispatched_at: string | null
  started_at: string | null
  finished_at: string | null
  updated_at: string
}

// ---- Row-to-Type conversion ----

export function rowToNode(row: DbNodeRow): HubNode {
  return {
    id: row.id,
    name: row.name,
    hostname: row.hostname,
    os: row.os,
    arch: row.arch,
    agentVersion: row.agent_version,
    hermesVersion: row.hermes_version ?? undefined,
    hermesHome: row.hermes_home,
    status: row.status as NodeStatus,
    capabilities: JSON.parse(row.capabilities) as string[],
    tags: JSON.parse(row.tags) as string[],
    lastHeartbeatAt: row.last_heartbeat_at ?? undefined,
    profilesTotal: row.profiles_total,
    gatewayRunning: row.gateway_running,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function nodeToRow(node: HubNode): DbNodeRow {
  return {
    id: node.id,
    name: node.name,
    hostname: node.hostname,
    os: node.os,
    arch: node.arch,
    agent_version: node.agentVersion,
    hermes_version: node.hermesVersion ?? null,
    hermes_home: node.hermesHome,
    status: node.status,
    capabilities: JSON.stringify(node.capabilities),
    tags: JSON.stringify(node.tags),
    last_heartbeat_at: node.lastHeartbeatAt ?? null,
    profiles_total: node.profilesTotal,
    gateway_running: node.gatewayRunning,
    created_at: node.createdAt,
    updated_at: node.updatedAt,
  }
}

export function rowToAgent(row: DbAgentRow): ManagedAgent {
  return {
    id: row.id,
    nodeId: row.node_id,
    profileName: row.profile_name,
    displayName: row.display_name ?? undefined,
    description: row.description ?? undefined,
    profileHome: row.profile_home,
    provider: row.provider ?? undefined,
    model: row.model ?? undefined,
    terminalCwd: row.terminal_cwd ?? undefined,
    setupStatus: row.setup_status as AgentSetupStatus,
    gatewayStatus: row.gateway_status as AgentRuntimeStatus,
    apiServerStatus: row.api_server_status as AgentApiStatus,
    sessionsCount: row.sessions_count ?? undefined,
    skillsCount: row.skills_count ?? undefined,
    cronCount: row.cron_count ?? undefined,
    hasEnv: row.has_env === 1,
    hasSoul: row.has_soul === 1,
    lastSeenAt: row.last_seen_at ?? undefined,
    lastError: row.last_error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function agentToRow(agent: ManagedAgent): DbAgentRow {
  return {
    id: agent.id,
    node_id: agent.nodeId,
    profile_name: agent.profileName,
    display_name: agent.displayName ?? null,
    description: agent.description ?? null,
    profile_home: agent.profileHome,
    provider: agent.provider ?? null,
    model: agent.model ?? null,
    terminal_cwd: agent.terminalCwd ?? null,
    setup_status: agent.setupStatus,
    gateway_status: agent.gatewayStatus,
    api_server_status: agent.apiServerStatus,
    sessions_count: agent.sessionsCount ?? null,
    skills_count: agent.skillsCount ?? null,
    cron_count: agent.cronCount ?? null,
    has_env: agent.hasEnv ? 1 : 0,
    has_soul: agent.hasSoul ? 1 : 0,
    last_seen_at: agent.lastSeenAt ?? null,
    last_error: agent.lastError ?? null,
    created_at: agent.createdAt,
    updated_at: agent.updatedAt,
  }
}

export function rowToCommand(row: DbCommandRow): HubCommand {
  return {
    id: row.id,
    nodeId: row.node_id,
    agentId: row.agent_id ?? undefined,
    type: row.type as CommandType,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    status: row.status as CommandStatus,
    stdout: row.stdout ?? undefined,
    stderr: row.stderr ?? undefined,
    error: row.error ?? undefined,
    timeoutSeconds: row.timeout_seconds,
    createdBy: row.created_by,
    createdAt: row.created_at,
    dispatchedAt: row.dispatched_at ?? undefined,
    startedAt: row.started_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
    updatedAt: row.updated_at,
  }
}

export function commandToRow(cmd: HubCommand): DbCommandRow {
  return {
    id: cmd.id,
    node_id: cmd.nodeId,
    agent_id: cmd.agentId ?? null,
    type: cmd.type,
    payload: JSON.stringify(cmd.payload),
    status: cmd.status,
    stdout: cmd.stdout ?? null,
    stderr: cmd.stderr ?? null,
    error: cmd.error ?? null,
    timeout_seconds: cmd.timeoutSeconds,
    created_by: cmd.createdBy,
    created_at: cmd.createdAt,
    dispatched_at: cmd.dispatchedAt ?? null,
    started_at: cmd.startedAt ?? null,
    finished_at: cmd.finishedAt ?? null,
    updated_at: cmd.updatedAt,
  }
}

// ---- Database initialization ----

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      hostname          TEXT NOT NULL DEFAULT '',
      os                TEXT NOT NULL DEFAULT '',
      arch              TEXT NOT NULL DEFAULT '',
      agent_version     TEXT NOT NULL DEFAULT '',
      hermes_version    TEXT,
      hermes_home       TEXT NOT NULL DEFAULT '',
      status            TEXT NOT NULL DEFAULT 'online',
      capabilities      TEXT NOT NULL DEFAULT '[]',
      tags              TEXT NOT NULL DEFAULT '[]',
      last_heartbeat_at TEXT,
      profiles_total    INTEGER NOT NULL DEFAULT 0,
      gateway_running   INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agents (
      id                TEXT PRIMARY KEY,
      node_id           TEXT NOT NULL,
      profile_name      TEXT NOT NULL,
      display_name      TEXT,
      description       TEXT,
      profile_home      TEXT NOT NULL,
      provider          TEXT,
      model             TEXT,
      terminal_cwd      TEXT,
      setup_status      TEXT NOT NULL DEFAULT 'unknown',
      gateway_status    TEXT NOT NULL DEFAULT 'unknown',
      api_server_status TEXT NOT NULL DEFAULT 'unknown',
      sessions_count    INTEGER,
      skills_count      INTEGER,
      cron_count        INTEGER,
      has_env           INTEGER NOT NULL DEFAULT 0,
      has_soul          INTEGER NOT NULL DEFAULT 0,
      last_seen_at      TEXT,
      last_error        TEXT,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS commands (
      id               TEXT PRIMARY KEY,
      node_id          TEXT NOT NULL,
      agent_id         TEXT,
      type             TEXT NOT NULL,
      payload          TEXT NOT NULL DEFAULT '{}',
      status           TEXT NOT NULL DEFAULT 'pending',
      stdout           TEXT,
      stderr           TEXT,
      error            TEXT,
      timeout_seconds  INTEGER NOT NULL DEFAULT 300,
      created_by       TEXT NOT NULL DEFAULT 'local-user',
      created_at       TEXT NOT NULL,
      dispatched_at    TEXT,
      started_at       TEXT,
      finished_at      TEXT,
      updated_at       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      level      TEXT NOT NULL DEFAULT 'info',
      message    TEXT NOT NULL,
      source     TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS metadata (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // Seed the command counter if not present (restart-safe).
  db.prepare(
    `INSERT INTO metadata (key, value) VALUES ('next_command_number', '1')
     ON CONFLICT(key) DO NOTHING`
  ).run()
}

export function initDatabase(dbPath?: string): Database.Database {
  const finalPath = dbPath ?? join(homedir(), '.hermes-hub', 'hub.db')
  let db: Database.Database
  try {
    db = new Database(finalPath)
  } catch (err) {
    console.error(`[hermes-hub] Failed to open database at ${finalPath}:`, (err as Error).message)
    process.exit(1)
  }
  // WAL 模式提升并发读性能，foreign_keys 保持引用完整性
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}

// ---- Prepared CRUD helpers ----

// -- Nodes --

export function getNode(db: Database.Database, id: string): HubNode | undefined {
  const row = db.prepare('SELECT * FROM nodes WHERE id = ?').get(id) as DbNodeRow | undefined
  return row ? rowToNode(row) : undefined
}

export function getAllNodes(db: Database.Database): HubNode[] {
  const rows = db.prepare('SELECT * FROM nodes ORDER BY id').all() as DbNodeRow[]
  return rows.map(rowToNode)
}

export function upsertNode(db: Database.Database, node: HubNode): void {
  const row = nodeToRow(node)
  db.prepare(`
    INSERT OR REPLACE INTO nodes
      (id, name, hostname, os, arch, agent_version, hermes_version, hermes_home,
       status, capabilities, tags, last_heartbeat_at, profiles_total,
       gateway_running, created_at, updated_at)
    VALUES
      (@id, @name, @hostname, @os, @arch, @agent_version, @hermes_version, @hermes_home,
       @status, @capabilities, @tags, @last_heartbeat_at, @profiles_total,
       @gateway_running, @created_at, @updated_at)
  `).run(row)
}

// -- Agents --

export function getAgent(db: Database.Database, id: string): ManagedAgent | undefined {
  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as DbAgentRow | undefined
  return row ? rowToAgent(row) : undefined
}

export function getAllAgents(db: Database.Database): ManagedAgent[] {
  const rows = db.prepare('SELECT * FROM agents ORDER BY id').all() as DbAgentRow[]
  return rows.map(rowToAgent)
}

export function upsertAgent(db: Database.Database, agent: ManagedAgent): void {
  const row = agentToRow(agent)
  db.prepare(`
    INSERT OR REPLACE INTO agents
      (id, node_id, profile_name, display_name, description, profile_home,
       provider, model, terminal_cwd, setup_status, gateway_status,
       api_server_status, sessions_count, skills_count, cron_count,
       has_env, has_soul, last_seen_at, last_error, created_at, updated_at)
    VALUES
      (@id, @node_id, @profile_name, @display_name, @description, @profile_home,
       @provider, @model, @terminal_cwd, @setup_status, @gateway_status,
       @api_server_status, @sessions_count, @skills_count, @cron_count,
       @has_env, @has_soul, @last_seen_at, @last_error, @created_at, @updated_at)
  `).run(row)
}

export function deleteAgent(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM agents WHERE id = ?').run(id)
}

// 心跳后清理：删除该 node 上不在 keepIds 中的 agent（已从磁盘消失的 profile）
export function deleteAgentsForNode(db: Database.Database, nodeId: string, keepIds: Set<string>): void {
  if (keepIds.size === 0) {
    db.prepare('DELETE FROM agents WHERE node_id = ?').run(nodeId)
    return
  }
  // 动态参数化 IN 子句，避免拼接 profile name
  const placeholders = Array.from({ length: keepIds.size }, () => '?').join(',')
  db.prepare(
    `DELETE FROM agents WHERE node_id = ? AND id NOT IN (${placeholders})`
  ).run(nodeId, ...keepIds)
}

// -- Commands --

export function getCommand(db: Database.Database, id: string): HubCommand | undefined {
  const row = db.prepare('SELECT * FROM commands WHERE id = ?').get(id) as DbCommandRow | undefined
  return row ? rowToCommand(row) : undefined
}

export function getAllCommands(db: Database.Database): HubCommand[] {
  const rows = db.prepare('SELECT * FROM commands ORDER BY created_at DESC').all() as DbCommandRow[]
  return rows.map(rowToCommand)
}

export function upsertCommand(db: Database.Database, cmd: HubCommand): void {
  const row = commandToRow(cmd)
  db.prepare(`
    INSERT OR REPLACE INTO commands
      (id, node_id, agent_id, type, payload, status, stdout, stderr, error,
       timeout_seconds, created_by, created_at, dispatched_at, started_at,
       finished_at, updated_at)
    VALUES
      (@id, @node_id, @agent_id, @type, @payload, @status, @stdout, @stderr, @error,
       @timeout_seconds, @created_by, @created_at, @dispatched_at, @started_at,
       @finished_at, @updated_at)
  `).run(row)
}

// -- Counter (atomic read+increment, replaces nextCommandNumber) --

export function getNextCommandNumber(db: Database.Database): number {
  const increment = db.transaction((): number => {
    const row = db.prepare(
      `SELECT CAST(value AS INTEGER) AS num FROM metadata WHERE key = 'next_command_number'`
    ).get() as { num: number } | undefined
    const next = (row?.num ?? 0) + 1
    db.prepare(
      `UPDATE metadata SET value = ? WHERE key = 'next_command_number'`
    ).run(String(next))
    return next
  })
  return increment()
}

// -- Timeout checker: 查询指定 node 上所有 running 且已启动的命令 --

export function getRunningCommandsForNode(db: Database.Database, nodeId: string): HubCommand[] {
  const rows = db.prepare(
    `SELECT * FROM commands WHERE node_id = ? AND status = 'running' AND started_at IS NOT NULL`
  ).all(nodeId) as DbCommandRow[]
  return rows.map(rowToCommand)
}

// -- Write serialization: 查询指定 node 上正在运行的写命令对应的 agentId --

export function getBusyAgentIds(db: Database.Database, nodeId: string): Set<string> {
  const rows = db.prepare(
    `SELECT DISTINCT agent_id FROM commands
     WHERE node_id = ? AND status = 'running' AND agent_id IS NOT NULL
       AND type IN ('profile.create', 'profile.rename', 'profile.delete')`
  ).all(nodeId) as { agent_id: string }[]
  return new Set(rows.map((row) => row.agent_id))
}

// -- Poll: 获取指定 node 在给定 agentId 白名单之外的第一条 pending 命令 --

export function pollNextPendingCommand(db: Database.Database, nodeId: string, skipAgentIds: Set<string>): HubCommand | undefined {
  const rows = db.prepare(
    `SELECT * FROM commands WHERE node_id = ? AND status = 'pending' ORDER BY created_at ASC`
  ).all(nodeId) as DbCommandRow[]

  for (const row of rows) {
    const cmd = rowToCommand(row)
    // 跳过目标 agent 正忙于其他写操作的命令
    if (cmd.agentId && skipAgentIds.has(cmd.agentId) && isWriteType(cmd.type)) continue
    return cmd
  }
  return undefined
}

const WRITE_TYPES = new Set(['profile.create', 'profile.rename', 'profile.delete'])

function isWriteType(type: string): boolean {
  return WRITE_TYPES.has(type)
}

// -- 日志查询与脱敏（Phase 5）--

// 日志脱敏规则：匹配常见密钥格式，替换为 '***REDACTED***'
const SECRET_PATTERNS: [RegExp, string][] = [
  // env key=secret 格式
  [/(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|AUTH[_-]?TOKEN)\s*[=:]\s*\S+/gi, '$1=***REDACTED***'],
  // OpenAI / Anthropic API key 格式
  [/sk-[a-zA-Z0-9_-]{20,}/g, '***REDACTED***'],
  // Bearer token
  [/Bearer\s+[a-zA-Z0-9\-_.]+/gi, 'Bearer ***REDACTED***'],
]

export function sanitizeMessage(message: string): string {
  let result = message
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    result = result.replace(pattern, replacement)
  }
  return result
}

// DB row → LogEntry 映射（level→tone, created_at→time）
export interface LogEntry {
  id: string
  time: string
  source: string
  message: string
  tone: '' | 'ok' | 'err' | 'yellow'
}

interface DbLogRow {
  id: number
  level: string
  message: string
  source: string | null
  created_at: string
}

function levelToTone(level: string): LogEntry['tone'] {
  switch (level) {
    case 'error': return 'err'
    case 'warn': return 'yellow'
    case 'ok': return 'ok'
    default: return ''
  }
}

function dbRowToLogEntry(row: DbLogRow): LogEntry {
  return {
    id: String(row.id),
    time: row.created_at.replace('T', ' ').replace(/\.\d{3}Z$/, '').substring(11, 19),  // HH:MM:SS
    source: row.source ?? 'hub',
    message: row.message,
    tone: levelToTone(row.level),
  }
}

// 写入日志（自动脱敏）
export function insertLog(db: Database.Database, level: string, message: string, source?: string): void {
  const safe = sanitizeMessage(message)
  db.prepare(
    `INSERT INTO logs (level, message, source, created_at) VALUES (?, ?, ?, ?)`
  ).run(level, safe, source ?? 'hub', new Date().toISOString())
}

const DEFAULT_LOG_LIMIT = 200

export function getAllLogs(db: Database.Database, limit = DEFAULT_LOG_LIMIT, offset = 0): LogEntry[] {
  const rows = db.prepare(
    'SELECT * FROM logs ORDER BY id DESC LIMIT ? OFFSET ?'
  ).all(limit, offset) as DbLogRow[]
  return rows.reverse().map(dbRowToLogEntry)
}

export function getLogsForAgent(db: Database.Database, agentId: string, limit = DEFAULT_LOG_LIMIT, offset = 0): LogEntry[] {
  // agentId 格式为 nodeId:profileName，同时匹配 source 中精确和模糊两种模式
  const pattern = `%${agentId}%`
  const rows = db.prepare(
    'SELECT * FROM logs WHERE source LIKE ? ORDER BY id DESC LIMIT ? OFFSET ?'
  ).all(pattern, limit, offset) as DbLogRow[]
  return rows.reverse().map(dbRowToLogEntry)
}

export function getLogsForNode(db: Database.Database, nodeId: string, limit = DEFAULT_LOG_LIMIT, offset = 0): LogEntry[] {
  const pattern = `%${nodeId}%`
  const rows = db.prepare(
    'SELECT * FROM logs WHERE source LIKE ? ORDER BY id DESC LIMIT ? OFFSET ?'
  ).all(pattern, limit, offset) as DbLogRow[]
  return rows.reverse().map(dbRowToLogEntry)
}

export function getLogsForCommand(db: Database.Database, commandId: string, limit = DEFAULT_LOG_LIMIT, offset = 0): LogEntry[] {
  const pattern = `%${commandId}%`
  const rows = db.prepare(
    'SELECT * FROM logs WHERE source LIKE ? ORDER BY id DESC LIMIT ? OFFSET ?'
  ).all(pattern, limit, offset) as DbLogRow[]
  return rows.reverse().map(dbRowToLogEntry)
}
