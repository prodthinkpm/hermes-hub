import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, extname, basename, dirname } from 'node:path'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const STATIC = resolve(__dirname, 'static')
const INDEX = resolve(STATIC, 'index.html')

export interface ServerOptions {
  port: number
  apiUrl: string
}

// ── config types ──

interface HubConfig {
  paths: string[]
}

// ── profile types ──

type BadgeTone = 'running' | 'stopped' | 'warn' | 'bad' | 'info' | 'purple'
type LogTone = '' | 'ok' | 'err' | 'yellow'
type ProfileKind = 'default' | 'profile'

interface ProfileRow {
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

interface LogEntry {
  id: string
  time: string
  source: string
  message: string
  tone: LogTone
}

interface CreateProfileBody {
  name?: unknown
  cloneMode?: unknown
  cloneFrom?: unknown
  noAlias?: unknown
}

interface RenameProfileBody {
  name?: unknown
}

// ── config storage ──

function getHubConfigDir(): string {
  return resolve(homedir(), '.hermes-hub')
}

function getHubConfigPath(): string {
  return resolve(getHubConfigDir(), 'config.json')
}

function getLegacyHubConfigPath(): string {
  return resolve(getHubConfigDir(), 'config.yml')
}

function parseConfigYaml(raw: string): HubConfig {
  const lines = raw.split(/\r?\n/)
  const paths: string[] = []
  let inPaths = false

  for (const originalLine of lines) {
    const line = originalLine.trim()
    if (!line || line.startsWith('#')) continue

    if (line === 'paths:' || line.startsWith('paths: ')) {
      inPaths = true
      continue
    }

    if (!inPaths) continue

    if (line.startsWith('- ')) {
      let value = line.slice(2).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (value) paths.push(value)
      continue
    }

    // Any non-list key means we're out of the paths list block.
    if (/^[A-Za-z0-9_-]+\s*:/.test(line)) {
      inPaths = false
    }
  }

  return { paths }
}

function readHubConfig(): HubConfig {
  const jsonPath = getHubConfigPath()
  const yamlPath = getLegacyHubConfigPath()

  if (existsSync(jsonPath)) {
    try {
      const raw = readFileSync(jsonPath, 'utf-8')
      const parsed = JSON.parse(raw) as HubConfig
      return {
        paths: Array.isArray(parsed.paths) ? parsed.paths.filter((p) => typeof p === 'string') : [],
      }
    } catch {
      return { paths: [] }
    }
  }

  // Backward compatibility: migrate legacy YAML config on first read.
  if (existsSync(yamlPath)) {
    try {
      const raw = readFileSync(yamlPath, 'utf-8')
      const config = parseConfigYaml(raw)
      writeHubConfig(config)
      return config
    } catch {
      return { paths: [] }
    }
  }

  return { paths: [] }
}

function writeHubConfig(config: HubConfig): void {
  const configDir = getHubConfigDir()
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }

  const normalized: HubConfig = {
    paths: [...new Set(config.paths.map((p) => p.trim()).filter(Boolean))],
  }

  writeFileSync(getHubConfigPath(), JSON.stringify(normalized, null, 2), 'utf-8')
}

// ── filesystem helpers ──

function readYamlField(filePath: string, field: string): string | undefined {
  if (!existsSync(filePath)) return undefined
  try {
    const text = readFileSync(filePath, 'utf-8')
    const match = text.match(new RegExp(`^${field}:[ \\t]*([^\\r\\n]+)$`, 'm'))
    let value = match?.[1]?.trim()
    if (!value) return undefined
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    return value
  } catch {
    return undefined
  }
}

function unquoteYamlScalar(value: string): string {
  const v = value.trim()
  if (!v) return ''
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1)
  }
  return v
}

function formatModelLabel(provider: string, modelName: string): string {
  const p = provider.trim()
  const m = modelName.trim()
  if (!m) return ''
  if (!p) return m
  if (m.toLowerCase().startsWith(`${p.toLowerCase()}:`)) return m
  return `${p}:${m}`
}

function readPrimaryModel(configPath: string): string {
  if (!existsSync(configPath)) return ''
  try {
    const text = readFileSync(configPath, 'utf-8')
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      const inline = line.match(/^model:[ \t]*([^#\r\n]+)$/)
      if (inline) return unquoteYamlScalar(inline[1])

      if (!/^model:[ \t]*$/.test(line.trim())) continue

      let defaultModel = ''
      let provider = ''
      for (let j = i + 1; j < lines.length; j += 1) {
        const nested = lines[j]
        if (!nested.trim()) continue
        if (!/^[ \t]+/.test(nested)) break

        const defaultMatch = nested.match(/^[ \t]+default:[ \t]*([^#\r\n]+)$/)
        if (defaultMatch) {
          defaultModel = unquoteYamlScalar(defaultMatch[1])
          continue
        }

        const providerMatch = nested.match(/^[ \t]+provider:[ \t]*([^#\r\n]+)$/)
        if (providerMatch) {
          provider = unquoteYamlScalar(providerMatch[1])
        }
      }
      return formatModelLabel(provider, defaultModel)
    }

    return ''
  } catch {
    return ''
  }
}

function readJsonObject(filePath: string): Record<string, unknown> | null {
  if (!existsSync(filePath)) return null
  try {
    const raw = readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function readPidFromGatewayPidFile(profileHome: string): number | null {
  const pidPath = resolve(profileHome, 'gateway.pid')
  const data = readJsonObject(pidPath)
  if (!data) return null
  const pid = data.pid
  return typeof pid === 'number' && Number.isFinite(pid) ? pid : null
}

function readGatewayAndApiStatus(profileHome: string): Pick<ProfileRow, 'gatewayTone' | 'gatewayText' | 'apiTone' | 'apiText'> {
  const statePath = resolve(profileHome, 'gateway_state.json')
  const state = readJsonObject(statePath)
  const rawGatewayState = state?.gateway_state
  const gatewayState = typeof rawGatewayState === 'string' ? rawGatewayState.toLowerCase() : ''
  const platforms = state?.platforms
  let connectedPlatforms = 0
  let erroredPlatforms = 0

  if (platforms && typeof platforms === 'object' && !Array.isArray(platforms)) {
    for (const value of Object.values(platforms)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue
      const platformState = (value as Record<string, unknown>).state
      if (typeof platformState !== 'string') continue
      const s = platformState.toLowerCase()
      if (s === 'connected' || s === 'running' || s === 'ready') connectedPlatforms += 1
      if (s === 'error' || s === 'failed' || s === 'disconnected') erroredPlatforms += 1
    }
  }

  if (gatewayState === 'running') {
    return {
      gatewayTone: 'running',
      gatewayText: connectedPlatforms > 0 ? `running (${connectedPlatforms} connected)` : 'running',
      apiTone: connectedPlatforms > 0 ? 'running' : 'warn',
      apiText: connectedPlatforms > 0 ? 'on' : 'idle',
    }
  }

  if (gatewayState === 'starting' || gatewayState === 'restarting') {
    return {
      gatewayTone: 'warn',
      gatewayText: gatewayState,
      apiTone: 'warn',
      apiText: 'starting',
    }
  }

  if (gatewayState === 'error' || gatewayState === 'failed' || erroredPlatforms > 0) {
    return {
      gatewayTone: 'bad',
      gatewayText: gatewayState || 'error',
      apiTone: 'bad',
      apiText: 'error',
    }
  }

  const pid = readPidFromGatewayPidFile(profileHome)
  if (pid && isProcessAlive(pid)) {
    return {
      gatewayTone: 'running',
      gatewayText: 'running',
      apiTone: 'warn',
      apiText: 'unknown',
    }
  }

  if (pid && !isProcessAlive(pid)) {
    return {
      gatewayTone: 'warn',
      gatewayText: 'stale pid',
      apiTone: 'stopped',
      apiText: 'off',
    }
  }

  return {
    gatewayTone: 'stopped',
    gatewayText: 'stopped',
    apiTone: 'stopped',
    apiText: 'off',
  }
}

function slugPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
}

function shortHash(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
  }
  return (hash >>> 0).toString(16).slice(0, 8)
}

function makeProfileId(kind: ProfileKind, basePath: string, name: string): string {
  const label = slugPart(name) || kind
  return `${kind}-${label}-${shortHash(`${kind}|${basePath}|${name}`)}`
}

function buildProfileRow(kind: ProfileKind, id: string, name: string, home: string): ProfileRow {
  const configPath = resolve(home, 'config.yaml')
  const model = readPrimaryModel(configPath)
  const desc = readYamlField(configPath, 'description') ?? ''
  const hasConfig = existsSync(configPath)
  const runtimeStatus = readGatewayAndApiStatus(home)

  return {
    id,
    kind,
    checked: false,
    letter: name[0]?.toUpperCase() ?? '?',
    name,
    desc: desc || (kind === 'default' ? 'Hermes default agent' : ''),
    setupTone: hasConfig ? 'running' : 'warn',
    setupText: hasConfig ? 'ok' : 'needs setup',
    gatewayTone: runtimeStatus.gatewayTone,
    gatewayText: runtimeStatus.gatewayText,
    apiTone: runtimeStatus.apiTone,
    apiText: runtimeStatus.apiText,
    model,
    home,
  }
}

function hasAnyAgentMarker(home: string): boolean {
  const markers = ['config.yaml', 'SOUL.md', 'sessions', 'logs', 'skills']
  return markers.some((name) => existsSync(resolve(home, name)))
}

function readDefaultProfile(basePath: string): ProfileRow[] {
  if (!existsSync(basePath)) return []
  if (!hasAnyAgentMarker(basePath)) return []
  const id = makeProfileId('default', basePath, 'hermes')
  return [buildProfileRow('default', id, 'hermes', basePath)]
}

function readProfilesFromBase(basePath: string): ProfileRow[] {
  const dir = resolve(basePath, 'profiles')
  if (!existsSync(dir)) return []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((d) => d.isDirectory())
    .map((d) => {
      const home = resolve(dir, d.name)
      const id = makeProfileId('profile', basePath, d.name)
      return buildProfileRow('profile', id, d.name, home)
    })
}

function detectTone(line: string): LogTone {
  const lower = line.toLowerCase()
  if (/(error|fail|panic|fatal|exception|blocked|denied)/.test(lower)) return 'err'
  if (/(warn|warning|retry|timeout|missing|conflict)/.test(lower)) return 'yellow'
  if (/(ok|success|healthy|done|completed|ready)/.test(lower)) return 'ok'
  return ''
}

function extractTime(line: string): string {
  const hms = line.match(/\b\d{2}:\d{2}:\d{2}\b/)
  if (hms) return hms[0]
  const iso = line.match(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  if (iso) return iso[0].slice(11, 19)
  return '--:--:--'
}

function readFileLinesTail(filePath: string, maxLines: number): string[] {
  if (!existsSync(filePath)) return []
  try {
    const text = readFileSync(filePath, 'utf-8')
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    if (lines.length <= maxLines) return lines
    return lines.slice(lines.length - maxLines)
  } catch {
    return []
  }
}

function collectLogFiles(profileHome: string): string[] {
  const result: string[] = []
  const directFiles = [
    resolve(profileHome, 'logs', 'latest.log'),
    resolve(profileHome, 'sessions', 'latest.log'),
    resolve(profileHome, 'sessions.log'),
  ]
  for (const file of directFiles) {
    if (existsSync(file)) result.push(file)
  }

  for (const dirName of ['logs', 'sessions']) {
    const dir = resolve(profileHome, dirName)
    if (!existsSync(dir)) continue
    try {
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile()) continue
        if (!/\.(log|txt|jsonl|md)$/i.test(entry.name)) continue
        result.push(resolve(dir, entry.name))
      }
    } catch {
      // ignore unreadable directories
    }
  }

  return [...new Set(result)]
}

function readProfileLogs(profileId: string, profileHome: string, maxLinesPerFile = 80): LogEntry[] {
  const files = collectLogFiles(profileHome)
  const rows: LogEntry[] = []

  for (const filePath of files) {
    const sourceSuffix = basename(filePath)
    const lines = readFileLinesTail(filePath, maxLinesPerFile)
    for (const line of lines) {
      rows.push({
        id: `${profileId}-${rows.length + 1}`,
        time: extractTime(line),
        source: `[${profileId}/${sourceSuffix}]`,
        message: line,
        tone: detectTone(line),
      })
    }
  }

  return rows.slice(-500)
}

function getAllScanPaths(): string[] {
  const config = readHubConfig()
  const paths = config.paths
  // deduplicate while preserving order
  return [...new Set(paths)]
}

function readAllProfiles(): ProfileRow[] {
  const paths = getAllScanPaths()
  const seenHomes = new Set<string>()
  const all: ProfileRow[] = []
  for (const basePath of paths) {
    const profiles = [...readDefaultProfile(basePath), ...readProfilesFromBase(basePath)]
    for (const p of profiles) {
      if (!seenHomes.has(p.home)) {
        seenHomes.add(p.home)
        all.push(p)
      }
    }
  }
  return all
}

function readAllLogs(): LogEntry[] {
  const profiles = readAllProfiles()
  const allLogs = profiles.flatMap((profile) => readProfileLogs(profile.id, profile.home))

  const hubRuntimeLog = resolve(getHubConfigDir(), 'runtime', 'events.log')
  const hubLines = readFileLinesTail(hubRuntimeLog, 200)
  for (const line of hubLines) {
    allLogs.push({
      id: `hub-${allLogs.length + 1}`,
      time: extractTime(line),
      source: '[hub/runtime]',
      message: line,
      tone: detectTone(line),
    })
  }

  return allLogs.slice(-1200)
}

function findProfileById(profileId: string): ProfileRow | null {
  const profiles = readAllProfiles()
  return profiles.find((profile) => profile.id === profileId) ?? null
}

function jsonReply(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString()
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(body))
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

function getHermesCommandCandidates(): string[] {
  const configured = process.env.HERMES_BIN?.trim()
  const candidates: string[] = []

  if (configured) candidates.push(configured)

  if (process.platform === 'win32') {
    candidates.push('hermes.cmd', 'hermes.exe', 'hermes')
  } else {
    candidates.push('hermes')
  }

  return [...new Set(candidates)]
}

function runHermesCommand(
  args: string[],
  envExtras: Record<string, string> = {},
): { ok: boolean; stdout: string; stderr: string; status: number | null; command: string } {
  const env = {
    ...process.env,
    ...envExtras,
  }

  const candidates = getHermesCommandCandidates()
  let lastStdout = ''
  let lastStderr = ''
  let lastStatus: number | null = null
  let lastCommand = candidates[0] ?? 'hermes'

  for (const command of candidates) {
    lastCommand = command
    const result = spawnSync(command, args, {
      encoding: 'utf-8',
      windowsHide: true,
      env,
      shell: process.platform === 'win32',
    })

    lastStdout = result.stdout ?? ''
    lastStderr = result.stderr ?? ''
    lastStatus = result.status ?? null

    const spawnErrorCode = (result.error as NodeJS.ErrnoException | undefined)?.code
    if (spawnErrorCode === 'ENOENT') {
      continue
    }

    return {
      ok: (result.status ?? 1) === 0,
      stdout: lastStdout,
      stderr: lastStderr || result.error?.message || '',
      status: lastStatus,
      command,
    }
  }

  const hint =
    `Hermes CLI not found. Tried: ${candidates.join(', ')}. Install Hermes CLI and make sure it is on PATH, or set HERMES_BIN to the full executable path (for example C:\\Users\\<you>\\AppData\\Roaming\\npm\\hermes.cmd).`
  return {
    ok: false,
    stdout: lastStdout,
    stderr: [lastStderr, hint].filter(Boolean).join(' '),
    status: lastStatus,
    command: lastCommand,
  }
}

function getProfileBasePath(profile: ProfileRow): string {
  if (profile.kind === 'default') return profile.home
  return dirname(dirname(profile.home))
}

// ── config API handler ──

async function handleConfigApi(path: string, method: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (path !== '/api/config' && path !== '/api/config/') return false

  if (method === 'GET') {
    const config = readHubConfig()
    jsonReply(res, 200, {
      ok: true,
      data: {
        paths: config.paths,
      },
    })
    return true
  }

  if (method === 'PUT') {
    let body: { paths?: string[] }
    try {
      body = (await readJsonBody(req)) as { paths?: string[] }
    } catch {
      jsonReply(res, 400, { ok: false, error: 'Invalid JSON body' })
      return true
    }

    if (!Array.isArray(body.paths) || body.paths.some((p) => typeof p !== 'string')) {
      jsonReply(res, 400, { ok: false, error: 'paths must be an array of strings' })
      return true
    }

    try {
      const paths = body.paths.map((p) => p.trim()).filter(Boolean)
      writeHubConfig({ paths })
      jsonReply(res, 200, { ok: true, data: null })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to write config'
      jsonReply(res, 500, { ok: false, error: message })
    }
    return true
  }

  jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
  return true
}

// ── profile API handler ──

async function handleProfileApi(path: string, method: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  // GET /api/profiles
  if (path === '/api/profiles' || path === '/api/profiles/') {
    if (method === 'POST') {
      let body: CreateProfileBody
      try {
        body = (await readJsonBody(req)) as CreateProfileBody
      } catch {
        jsonReply(res, 400, { ok: false, error: 'Invalid JSON body' })
        return true
      }

      const name = typeof body.name === 'string' ? body.name.trim() : ''
      const cloneMode = typeof body.cloneMode === 'string' ? body.cloneMode : 'blank'
      const cloneFrom = typeof body.cloneFrom === 'string' ? body.cloneFrom.trim() : ''
      const noAlias = body.noAlias === true

      if (!name) {
        jsonReply(res, 400, { ok: false, error: 'name is required' })
        return true
      }
      if (!/^[A-Za-z0-9_-]+$/.test(name)) {
        jsonReply(res, 400, { ok: false, error: 'name must contain only letters, numbers, hyphens, and underscores' })
        return true
      }
      if (cloneMode !== 'blank' && cloneMode !== 'clone' && cloneMode !== 'clone-all') {
        jsonReply(res, 400, { ok: false, error: "cloneMode must be one of: 'blank', 'clone', 'clone-all'" })
        return true
      }
      if (cloneFrom && !/^[A-Za-z0-9_-]+$/.test(cloneFrom)) {
        jsonReply(res, 400, { ok: false, error: 'cloneFrom must contain only letters, numbers, hyphens, and underscores' })
        return true
      }
      if (cloneFrom && cloneMode === 'blank') {
        jsonReply(res, 400, { ok: false, error: 'cloneFrom requires cloneMode clone or clone-all' })
        return true
      }

      const args = ['profile', 'create', name]
      if (cloneMode === 'clone') args.push('--clone')
      if (cloneMode === 'clone-all') args.push('--clone-all')
      if (cloneFrom) args.push('--clone-from', cloneFrom)
      if (noAlias) args.push('--no-alias')

      const run = runHermesCommand(args)
      if (!run.ok) {
        console.error(`[hermes-hub] create profile failed: ${run.command} ${args.join(' ')} :: ${run.stderr || run.stdout}`)
        jsonReply(res, 500, {
          ok: false,
          error: run.stderr || run.stdout || `Failed to create profile '${name}'`,
        })
        return true
      }

      jsonReply(res, 200, {
        ok: true,
        data: {
          name,
          stdout: run.stdout,
          nextSteps: [`hermes -p ${name} setup`, `hermes -p ${name} chat`],
        },
      })
      return true
    }

    if (method !== 'GET') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }
    const profiles = readAllProfiles()
    jsonReply(res, 200, { ok: true, data: profiles })
    return true
  }

  // Match /api/profiles/:id and sub-routes
  const match = path.match(/^\/api\/profiles\/([^/]+)(\/.*)?$/)
  if (!match) return false

  const profileId = decodeURIComponent(match[1])
  const subPath = match[2] || ''
  const profile = findProfileById(profileId)

  if (!profile) {
    jsonReply(res, 404, { ok: false, error: `Agent '${profileId}' not found` })
    return true
  }

  // /api/profiles/:id/rename
  if (subPath === '/rename') {
    if (method !== 'PUT') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }
    if (profile.kind !== 'profile') {
      jsonReply(res, 400, { ok: false, error: 'Only profile agents can be renamed' })
      return true
    }

    let body: RenameProfileBody
    try {
      body = (await readJsonBody(req)) as RenameProfileBody
    } catch {
      jsonReply(res, 400, { ok: false, error: 'Invalid JSON body' })
      return true
    }

    const nextName = typeof body.name === 'string' ? body.name.trim() : ''
    if (!nextName) {
      jsonReply(res, 400, { ok: false, error: 'name is required' })
      return true
    }
    if (!/^[A-Za-z0-9_-]+$/.test(nextName)) {
      jsonReply(res, 400, { ok: false, error: 'name must contain only letters, numbers, hyphens, and underscores' })
      return true
    }
    if (nextName === profile.name) {
      jsonReply(res, 200, { ok: true, data: { name: profile.name, renamed: false } })
      return true
    }

    const basePath = getProfileBasePath(profile)
    const run = runHermesCommand(['profile', 'rename', profile.name, nextName], { HERMES_HOME: basePath })
    if (!run.ok) {
      console.error(`[hermes-hub] rename profile failed: ${run.command} profile rename ${profile.name} ${nextName} :: ${run.stderr || run.stdout}`)
      jsonReply(res, 500, {
        ok: false,
        error: run.stderr || run.stdout || `Failed to rename profile '${profile.name}'`,
      })
      return true
    }

    jsonReply(res, 200, {
      ok: true,
      data: {
        name: nextName,
        renamed: true,
      },
    })
    return true
  }

  // DELETE /api/profiles/:id
  if ((subPath === '' || subPath === '/') && method === 'DELETE') {
    if (profile.kind !== 'profile') {
      jsonReply(res, 400, { ok: false, error: 'Only profile agents can be deleted' })
      return true
    }
    const basePath = getProfileBasePath(profile)
    const run = runHermesCommand(['profile', 'delete', profile.name, '--yes'], { HERMES_HOME: basePath })
    if (!run.ok) {
      console.error(`[hermes-hub] delete profile failed: ${run.command} profile delete ${profile.name} --yes :: ${run.stderr || run.stdout}`)
      jsonReply(res, 500, {
        ok: false,
        error: run.stderr || run.stdout || `Failed to delete profile '${profile.name}'`,
      })
      return true
    }
    jsonReply(res, 200, { ok: true, data: null })
    return true
  }

  // /api/profiles/:id/config.yaml
  if (subPath === '/config.yaml') {
    const configPath = resolve(profile.home, 'config.yaml')
    if (method === 'PUT') {
      let body: { content?: unknown }
      try {
        body = (await readJsonBody(req)) as { content?: unknown }
      } catch {
        jsonReply(res, 400, { ok: false, error: 'Invalid JSON body' })
        return true
      }

      if (typeof body.content !== 'string') {
        jsonReply(res, 400, { ok: false, error: 'content must be a string' })
        return true
      }

      try {
        writeFileSync(configPath, body.content, 'utf-8')
        jsonReply(res, 200, { ok: true, data: null })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to write config.yaml'
        jsonReply(res, 500, { ok: false, error: message })
      }
      return true
    }

    if (method !== 'GET') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }

    if (!existsSync(configPath)) {
      jsonReply(res, 404, { ok: false, error: 'config.yaml not found' })
      return true
    }
    serveStatic(res, configPath)
    return true
  }

  // /api/profiles/:id/SOUL.md
  if (subPath === '/SOUL.md') {
    const soulPath = resolve(profile.home, 'SOUL.md')
    if (method === 'PUT') {
      let body: { content?: unknown }
      try {
        body = (await readJsonBody(req)) as { content?: unknown }
      } catch {
        jsonReply(res, 400, { ok: false, error: 'Invalid JSON body' })
        return true
      }

      if (typeof body.content !== 'string') {
        jsonReply(res, 400, { ok: false, error: 'content must be a string' })
        return true
      }

      try {
        writeFileSync(soulPath, body.content, 'utf-8')
        jsonReply(res, 200, { ok: true, data: null })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to write SOUL.md'
        jsonReply(res, 500, { ok: false, error: message })
      }
      return true
    }

    if (method !== 'GET') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }

    if (!existsSync(soulPath)) {
      jsonReply(res, 404, { ok: false, error: 'SOUL.md not found' })
      return true
    }
    serveStatic(res, soulPath)
    return true
  }

  // /api/profiles/:id/skills
  if (subPath === '/skills') {
    if (method !== 'GET') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }
    const skillsDir = resolve(profile.home, 'skills')
    let skills: string[] = []
    if (existsSync(skillsDir)) {
      try {
        skills = readdirSync(skillsDir).filter((f) => f.endsWith('.md'))
      } catch {
        // ignore
      }
    }
    jsonReply(res, 200, { ok: true, data: skills })
    return true
  }

  // /api/profiles/:id/logs
  if (subPath === '/logs') {
    if (method !== 'GET') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }
    jsonReply(res, 200, { ok: true, data: readProfileLogs(profileId, profile.home) })
    return true
  }

  // /api/profiles/:id — single profile detail
  if (subPath === '' || subPath === '/') {
    if (method !== 'GET') {
      jsonReply(res, 405, { ok: false, error: 'Method not allowed' })
      return true
    }
    jsonReply(res, 200, { ok: true, data: profile })
    return true
  }

  // Unknown sub-path
  jsonReply(res, 404, { ok: false, error: `Unknown profile resource: ${subPath}` })
  return true
}

function handleLogsApi(path: string, res: ServerResponse): boolean {
  if (path !== '/api/logs' && path !== '/api/logs/') return false
  jsonReply(res, 200, { ok: true, data: readAllLogs() })
  return true
}

// ── static serving ──

function serveStatic(res: ServerResponse, filePath: string): boolean {
  if (!existsSync(filePath)) return false

  let body: Buffer | string
  try {
    body = readFileSync(filePath)
  } catch {
    return false
  }

  const ext = extname(filePath).toLowerCase()
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' })
  res.end(body)
  return true
}

// ── proxy ──

function proxyApi(res: ServerResponse, apiUrl: string, targetPath: string): void {
  const url = new URL(targetPath, apiUrl)
  const isHttps = url.protocol === 'https:'
  const reqFn = isHttps ? httpsRequest : httpRequest

  const proxyReq = reqFn(
    {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: { Accept: 'application/json' },
      timeout: 10_000,
    },
    (proxyRes) => {
      let body = ''
      proxyRes.on('data', (chunk: Buffer) => {
        body += chunk.toString()
      })
      proxyRes.on('end', () => {
        const ct = proxyRes.headers['content-type'] ?? 'application/json; charset=utf-8'
        res.writeHead(proxyRes.statusCode ?? 500, { 'Content-Type': ct })
        res.end(body)
      })
    },
  )

  proxyReq.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'Bad Gateway', message: 'Backend unreachable' }))
  })

  proxyReq.on('timeout', () => {
    proxyReq.destroy()
    res.writeHead(504, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'Gateway Timeout', message: 'Backend timeout' }))
  })

  proxyReq.end()
}

// ── router ──

async function handleRequest(req: IncomingMessage, res: ServerResponse, apiUrl: string): Promise<void> {
  const rawUrl = req.url ?? '/'
  const path = rawUrl.split('?')[0]
  const method = req.method ?? 'GET'

  // /api/config — hub configuration
  if (path.startsWith('/api/config')) {
    if (await handleConfigApi(path, method, req, res)) return
  }

  // /api/profiles — served directly from local filesystem
  if (path.startsWith('/api/profiles')) {
    if (await handleProfileApi(path, method, req, res)) return
  }

  // /api/logs — served directly from local filesystem
  if (path.startsWith('/api/logs')) {
    if (handleLogsApi(path, res)) return
  }

  // /api/* — proxy to Hermes backend
  if (path.startsWith('/api/')) {
    if (!apiUrl) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: 'Bad Gateway', message: 'No API backend configured. Use --api or set HERMES_API_URL.' }))
      return
    }
    proxyApi(res, apiUrl, rawUrl)
    return
  }

  // Try static file first
  const filePath = path === '/' ? INDEX : resolve(STATIC, `.${path}`)
  if (serveStatic(res, filePath)) return

  // SPA fallback: return index.html for all unmatched routes
  if (existsSync(INDEX)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(readFileSync(INDEX, 'utf-8'))
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not Found')
  }
}

export function startServer(opts: ServerOptions): ReturnType<typeof createServer> {
  const server = createServer((req, res) => handleRequest(req, res, opts.apiUrl))

  server.on('error', (error) => {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'EADDRINUSE') {
      console.error(`[hermes-hub] Port ${opts.port} is already in use. Try: --port ${opts.port + 1}`)
      return
    }
    console.error(`[hermes-hub] Server error: ${err.message}`)
  })

  server.listen(opts.port, () => {
    console.log(`Hermes Hub running at http://localhost:${opts.port}`)
    const paths = getAllScanPaths()
    console.log(`Scan paths: ${paths.length ? paths.join(', ') : '(none configured)'}`)
    if (opts.apiUrl) {
      console.log(`API proxy: /api/* → ${opts.apiUrl}`)
    }
  })

  return server
}
