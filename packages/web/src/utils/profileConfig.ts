export interface EditableProfileConfig {
  description: string
  modelProvider: string
  modelDefault: string
  modelBaseUrl: string
  terminalCwd: string
  approvalsMode: string
  agentReasoningEffort: string
}

export const EMPTY_EDITABLE_PROFILE_CONFIG: EditableProfileConfig = {
  description: '',
  modelProvider: '',
  modelDefault: '',
  modelBaseUrl: '',
  terminalCwd: '',
  approvalsMode: '',
  agentReasoningEffort: '',
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/)
}

function leadingSpaces(line: string): number {
  let count = 0
  while (count < line.length && line[count] === ' ') count += 1
  return count
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripInlineComment(value: string): string {
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]
    if (char === "'" && !inDouble) {
      inSingle = !inSingle
      continue
    }
    if (char === '"' && !inSingle) {
      const escaped = i > 0 && value[i - 1] === '\\'
      if (!escaped) inDouble = !inDouble
      continue
    }
    if (char === '#' && !inSingle && !inDouble) {
      const prev = i > 0 ? value[i - 1] : ' '
      if (/\s/.test(prev)) return value.slice(0, i).trimEnd()
    }
  }
  return value
}

function parseScalar(rawValue: string): string {
  const clean = stripInlineComment(rawValue).trim()
  if (!clean) return ''
  if (clean === "''" || clean === '""' || clean === 'null' || clean === '~') return ''
  if (clean.startsWith("'") && clean.endsWith("'") && clean.length >= 2) return clean.slice(1, -1).replace(/''/g, "'")
  if (clean.startsWith('"') && clean.endsWith('"') && clean.length >= 2) {
    const body = clean.slice(1, -1)
    return body.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  return clean
}

function quoteScalar(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return "''"
  if (/^[A-Za-z0-9._:/+-]+$/.test(trimmed)) return trimmed
  return `'${trimmed.replace(/'/g, "''")}'`
}

function findTopLevelLine(lines: string[], key: string): number {
  const pattern = new RegExp(`^${escapeRegExp(key)}:\\s*(.*)$`)
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (leadingSpaces(line) !== 0) continue
    if (pattern.test(line)) return i
  }
  return -1
}

function findBlockRange(lines: string[], key: string): { start: number; endExclusive: number } | null {
  const start = findTopLevelLine(lines, key)
  if (start < 0) return null

  let endExclusive = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('#')) continue
    if (leadingSpaces(line) === 0) {
      endExclusive = i
      break
    }
  }

  return { start, endExclusive }
}

function getTopLevelScalar(lines: string[], key: string): string {
  const idx = findTopLevelLine(lines, key)
  if (idx < 0) return ''
  const line = lines[idx]
  const keyIndex = line.indexOf(':')
  if (keyIndex < 0) return ''
  return parseScalar(line.slice(keyIndex + 1))
}

function getNestedScalar(lines: string[], parent: string, key: string): string {
  const range = findBlockRange(lines, parent)
  if (!range) return ''
  const childPattern = new RegExp(`^\\s{2}${escapeRegExp(key)}:\\s*(.*)$`)
  for (let i = range.start + 1; i < range.endExclusive; i += 1) {
    const line = lines[i]
    const match = line.match(childPattern)
    if (!match) continue
    return parseScalar(match[1] ?? '')
  }
  return ''
}

function setTopLevelScalar(lines: string[], key: string, value: string): void {
  const rendered = `${key}: ${quoteScalar(value)}`
  const idx = findTopLevelLine(lines, key)
  if (idx >= 0) {
    lines[idx] = rendered
    return
  }
  if (lines.length > 0 && lines[lines.length - 1].trim() !== '') lines.push('')
  lines.push(rendered)
}

function setNestedScalar(lines: string[], parent: string, key: string, value: string): void {
  const childRendered = `  ${key}: ${quoteScalar(value)}`
  const range = findBlockRange(lines, parent)

  if (!range) {
    if (lines.length > 0 && lines[lines.length - 1].trim() !== '') lines.push('')
    lines.push(`${parent}:`)
    lines.push(childRendered)
    return
  }

  if (lines[range.start].trim() !== `${parent}:`) {
    lines[range.start] = `${parent}:`
  }

  const childPattern = new RegExp(`^\\s{2}${escapeRegExp(key)}:\\s*(.*)$`)
  for (let i = range.start + 1; i < range.endExclusive; i += 1) {
    if (!childPattern.test(lines[i])) continue
    lines[i] = childRendered
    return
  }

  lines.splice(range.start + 1, 0, childRendered)
}

export function extractEditableProfileConfig(raw: string): EditableProfileConfig {
  if (!raw.trim()) return { ...EMPTY_EDITABLE_PROFILE_CONFIG }
  const lines = splitLines(raw)
  return {
    description: getTopLevelScalar(lines, 'description'),
    modelProvider: getNestedScalar(lines, 'model', 'provider'),
    modelDefault: getNestedScalar(lines, 'model', 'default'),
    modelBaseUrl: getNestedScalar(lines, 'model', 'base_url'),
    terminalCwd: getNestedScalar(lines, 'terminal', 'cwd'),
    approvalsMode: getNestedScalar(lines, 'approvals', 'mode'),
    agentReasoningEffort: getNestedScalar(lines, 'agent', 'reasoning_effort'),
  }
}

export function applyEditableProfileConfig(raw: string, values: EditableProfileConfig): string {
  const lines = splitLines(raw)
  setTopLevelScalar(lines, 'description', values.description)
  setNestedScalar(lines, 'model', 'provider', values.modelProvider)
  setNestedScalar(lines, 'model', 'default', values.modelDefault)
  setNestedScalar(lines, 'model', 'base_url', values.modelBaseUrl)
  setNestedScalar(lines, 'terminal', 'cwd', values.terminalCwd)
  setNestedScalar(lines, 'approvals', 'mode', values.approvalsMode)
  setNestedScalar(lines, 'agent', 'reasoning_effort', values.agentReasoningEffort)
  return lines.join('\n')
}
