<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useHubStore } from '@/stores/hub'
import type { ConfigReadResult, SetupCatalogProvider, SetupRunPayload } from '@hermes-hub/core'
import UiButton from '@/components/ui/UiButton.vue'
import SectionTitle from '@/components/ui/SectionTitle.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { createSetupDraftId, saveSetupDraft } from '@/utils/setupDraft'

interface SetupFormState {
  provider: string
  modelDefault: string
  modelBaseUrl: string
  terminalCwd: string
  gatewayEndpoint: string
  gatewayPlatformsCsv: string
  toolsAllowCsv: string
  reasoningEffort: string
  approvalsMode: string
  message: string
  providerApiKey: string
}

interface SetupModelOption {
  id: string
  label: string
}

type SetupFormField = keyof SetupFormState

interface MessagingPlatformOption {
  id: string
  label: string
  tokenEnvKey?: string
}

const DEFAULT_FORM_STATE: SetupFormState = {
  provider: '',
  modelDefault: '',
  modelBaseUrl: '',
  terminalCwd: '.',
  gatewayEndpoint: '',
  gatewayPlatformsCsv: '',
  toolsAllowCsv: '',
  reasoningEffort: 'medium',
  approvalsMode: 'manual',
  message: '',
  providerApiKey: '',
}

const MESSAGING_PLATFORM_OPTIONS: readonly MessagingPlatformOption[] = [
  { id: 'telegram', label: 'Telegram', tokenEnvKey: 'TELEGRAM_BOT_TOKEN' },
  { id: 'discord', label: 'Discord', tokenEnvKey: 'DISCORD_BOT_TOKEN' },
  { id: 'slack', label: 'Slack', tokenEnvKey: 'SLACK_BOT_TOKEN' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'signal', label: 'Signal' },
  { id: 'sms', label: 'SMS' },
  { id: 'email', label: 'Email' },
  { id: 'homeassistant', label: 'Home Assistant' },
  { id: 'mattermost', label: 'Mattermost' },
  { id: 'matrix', label: 'Matrix' },
  { id: 'dingtalk', label: 'DingTalk' },
  { id: 'feishu', label: 'Feishu / Lark' },
  { id: 'wecom', label: 'WeCom' },
  { id: 'wecom_callback', label: 'WeCom Callback' },
  { id: 'weixin', label: 'Weixin' },
  { id: 'bluebubbles', label: 'BlueBubbles' },
  { id: 'qqbot', label: 'QQBot' },
  { id: 'yuanbao', label: 'Yuanbao' },
  { id: 'teams', label: 'Microsoft Teams' },
  { id: 'line', label: 'LINE' },
  { id: 'google_chat', label: 'Google Chat' },
]

const route = useRoute()
const router = useRouter()
const hubStore = useHubStore()
const { profiles } = storeToRefs(hubStore)

const loading = ref(false)
const loadError = ref<string | null>(null)
const envKeys = ref<string[]>([])
const setupCatalog = ref<SetupCatalogProvider[]>([])
const form = ref<SetupFormState>({ ...DEFAULT_FORM_STATE })
const catalogLoading = ref(false)
const configLoading = ref(false)
const envLoading = ref(false)
const catalogStale = ref(false)
const configStale = ref(false)
const envStale = ref(false)
const catalogCachedAt = ref('')
const configCachedAt = ref('')
const envCachedAt = ref('')
const touchedFields = ref<Partial<Record<SetupFormField, boolean>>>({})
const suppressFieldTracking = ref(false)
const lastAutoModelBaseUrl = ref('')
const gatewayPlatformSecrets = ref<Record<string, string>>({})

function asText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value == null) return ''
  return String(value)
}

function trimmedText(value: unknown): string {
  return asText(value).trim()
}

function envValueIsSet(value: unknown): boolean {
  return value === true || value === 'set'
}

function withProgrammaticFormUpdate(fn: () => void): void {
  const previous = suppressFieldTracking.value
  suppressFieldTracking.value = true
  try {
    fn()
  } finally {
    suppressFieldTracking.value = previous
  }
}

function isTouched(field: SetupFormField): boolean {
  return Boolean(touchedFields.value[field])
}

function markTouched(field: SetupFormField): void {
  if (suppressFieldTracking.value) return
  touchedFields.value = {
    ...touchedFields.value,
    [field]: true,
  }
}

function syncModelBaseUrlFromProvider(nextBaseUrl: string): void {
  const current = trimmedText(form.value.modelBaseUrl)
  const autoBaseUrl = trimmedText(lastAutoModelBaseUrl.value)
  if (isTouched('modelBaseUrl')) return
  if (current && current !== autoBaseUrl) return
  withProgrammaticFormUpdate(() => {
    form.value.modelBaseUrl = nextBaseUrl
  })
  lastAutoModelBaseUrl.value = nextBaseUrl
}

const profileId = computed(() => String(route.params.id ?? ''))
const profile = computed(() => profiles.value.find((item) => item.id === profileId.value) ?? null)
const pageMode = computed<'create_flow' | 'repair'>(() => (route.query.mode === 'create_flow' ? 'create_flow' : 'repair'))
const providerOptions = computed<SetupCatalogProvider[]>(() => {
  const current = trimmedText(form.value.provider)
  if (!current || setupCatalog.value.some((item) => item.id === current)) return setupCatalog.value
  return [
    {
      id: current,
      label: `${current} (current)`,
      auth_type: 'api_key',
      required_env_keys: [],
      optional_env_keys: [],
      models: trimmedText(form.value.modelDefault) ? [trimmedText(form.value.modelDefault)] : [],
    },
    ...setupCatalog.value,
  ]
})
const selectedProviderDefinition = computed<SetupCatalogProvider | null>(() => {
  const current = trimmedText(form.value.provider)
  return providerOptions.value.find((item) => item.id === current) ?? null
})
const modelOptions = computed<SetupModelOption[]>(() => {
  const currentModel = trimmedText(form.value.modelDefault)
  const catalogModels = selectedProviderDefinition.value?.models ?? []
  const options = catalogModels.map((model) => ({ id: model, label: model }))
  if (currentModel && !catalogModels.includes(currentModel)) {
    return [{ id: currentModel, label: `${currentModel} (current)` }, ...options]
  }
  return options
})
const availableModels = computed(() => modelOptions.value.map((item) => item.id))
const providerEnvKeys = computed(() => selectedProviderDefinition.value?.required_env_keys ?? [])
const providerOptionalEnvKeys = computed(() => selectedProviderDefinition.value?.optional_env_keys ?? [])
const providerEnvWriteKey = computed(() => providerEnvKeys.value[0] ?? '')
const providerEnvAlreadySet = computed(() => providerEnvKeys.value.some((key) => envKeys.value.includes(key)))
const providerEnvMissing = computed(() => providerEnvKeys.value.length > 0 && !providerEnvAlreadySet.value && !trimmedText(form.value.providerApiKey))
const providerNeedsNonApiKeyAuth = computed(() => {
  const authType = selectedProviderDefinition.value?.auth_type ?? 'api_key'
  return authType !== 'api_key'
})
const providerBaseUrl = computed(() => trimmedText(selectedProviderDefinition.value?.base_url))
const providerBaseUrlEnvVar = computed(() => trimmedText(selectedProviderDefinition.value?.base_url_env_var))
const submitDisabled = computed(() => !trimmedText(form.value.provider) || !trimmedText(form.value.modelDefault) || !trimmedText(form.value.terminalCwd) || providerEnvMissing.value)
const selectedGatewayPlatforms = computed(() => {
  const seen = new Set<string>()
  return parseCsvList(form.value.gatewayPlatformsCsv).filter((platform) => {
    if (seen.has(platform)) return false
    seen.add(platform)
    return true
  })
})
const selectedGatewayPlatformSet = computed(() => new Set(selectedGatewayPlatforms.value))
const selectedGatewayPlatformOptions = computed(() =>
  MESSAGING_PLATFORM_OPTIONS.filter((option) => selectedGatewayPlatformSet.value.has(option.id)),
)
const selectedGatewayTokenPlatformOptions = computed(() =>
  selectedGatewayPlatformOptions.value.filter((option) => Boolean(option.tokenEnvKey)),
)

function authTone(authType: string | undefined): 'running' | 'stopped' | 'warn' | 'bad' | 'info' | 'purple' {
  switch (authType) {
    case 'api_key':
      return 'running'
    case 'oauth_external':
    case 'oauth_device_code':
    case 'oauth_minimax':
      return 'purple'
    case 'external_process':
    case 'aws_sdk':
      return 'warn'
    default:
      return 'info'
  }
}

function authLabel(authType: string | undefined): string {
  switch (authType) {
    case 'oauth_external':
      return 'OAuth'
    case 'oauth_device_code':
      return 'Device OAuth'
    case 'oauth_minimax':
      return 'MiniMax OAuth'
    case 'external_process':
      return 'External Process'
    case 'aws_sdk':
      return 'AWS SDK'
    case 'api_key':
      return 'API Key'
    default:
      return authType || 'Unknown Auth'
  }
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/)
}

function leadingSpaces(line: string): number {
  let count = 0
  while (count < line.length && line[count] === ' ') count += 1
  return count
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

function parseScalar(raw: string): string {
  const value = stripInlineComment(raw).trim()
  if (!value) return ''
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  return value
}

function findPathLine(lines: string[], path: string[]): number {
  let start = 0
  let end = lines.length
  let indent = -2

  for (let depth = 0; depth < path.length; depth += 1) {
    const key = path[depth]
    const targetIndent = indent + 2
    let index = -1

    for (let i = start; i < end; i += 1) {
      const line = lines[i]
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      if (leadingSpaces(line) !== targetIndent) continue
      if (!trimmed.startsWith(`${key}:`)) continue
      index = i
      break
    }

    if (index < 0) return -1
    if (depth === path.length - 1) return index

    const nextIndent = targetIndent
    let nextEnd = lines.length
    for (let i = index + 1; i < lines.length; i += 1) {
      const line = lines[i]
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      if (leadingSpaces(line) <= nextIndent) {
        nextEnd = i
        break
      }
    }
    start = index + 1
    end = nextEnd
    indent = targetIndent
  }

  return -1
}

function getScalar(lines: string[], path: string[]): string {
  const index = findPathLine(lines, path)
  if (index < 0) return ''
  const line = lines[index]
  const colon = line.indexOf(':')
  if (colon < 0) return ''
  return parseScalar(line.slice(colon + 1))
}

function getList(lines: string[], path: string[]): string[] {
  const index = findPathLine(lines, path)
  if (index < 0) return []
  const baseIndent = leadingSpaces(lines[index])
  const items: string[] = []
  for (let i = index + 1; i < lines.length; i += 1) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const indent = leadingSpaces(line)
    if (indent <= baseIndent) break
    if (indent === baseIndent + 2 && trimmed.startsWith('- ')) {
      items.push(parseScalar(trimmed.slice(2)))
    }
  }
  return items
}

function getObjectPath(source: unknown, path: string[]): unknown {
  let current: unknown = source
  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

function getObjectScalar(source: unknown, path: string[]): string {
  return trimmedText(getObjectPath(source, path))
}

function getObjectList(source: unknown, path: string[]): string[] {
  const value = getObjectPath(source, path)
  if (!Array.isArray(value)) return []
  return value.map((item) => trimmedText(item)).filter(Boolean)
}

function parseCsvList(value: unknown): string[] {
  return asText(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatCsvList(values: string[]): string {
  return values.join(', ')
}

function topLevelPlatformsFromObject(source: unknown): string[] {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return []
  const obj = source as Record<string, unknown>
  return MESSAGING_PLATFORM_OPTIONS
    .map((option) => option.id)
    .filter((platform) => {
      const value = obj[platform]
      return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    })
}

function topLevelPlatformsFromYaml(lines: string[]): string[] {
  return MESSAGING_PLATFORM_OPTIONS
    .map((option) => option.id)
    .filter((platform) => findPathLine(lines, [platform]) >= 0)
}

function toggleGatewayPlatform(platformId: string): void {
  const next = new Set(selectedGatewayPlatforms.value)
  if (next.has(platformId)) next.delete(platformId)
  else next.add(platformId)
  const ordered = [
    ...MESSAGING_PLATFORM_OPTIONS.map((option) => option.id).filter((id) => next.has(id)),
    ...[...next].filter((id) => !MESSAGING_PLATFORM_OPTIONS.some((option) => option.id === id)).sort(),
  ]
  withProgrammaticFormUpdate(() => {
    form.value.gatewayPlatformsCsv = formatCsvList(ordered)
  })
}

function messagingPlatformLabel(platformId: string): string {
  return MESSAGING_PLATFORM_OPTIONS.find((option) => option.id === platformId)?.label ?? platformId
}

function gatewayPlatformSecretValue(platformId: string): string {
  return trimmedText(gatewayPlatformSecrets.value[platformId])
}

function updateGatewayPlatformSecret(platformId: string, value: string): void {
  gatewayPlatformSecrets.value = {
    ...gatewayPlatformSecrets.value,
    [platformId]: value,
  }
}

function onGatewayPlatformSecretInput(platformId: string, event: Event): void {
  const target = event.target
  updateGatewayPlatformSecret(
    platformId,
    target instanceof HTMLInputElement ? target.value : '',
  )
}

function platformTokenAlreadySet(option: MessagingPlatformOption): boolean {
  return Boolean(option.tokenEnvKey) && envKeys.value.includes(option.tokenEnvKey as string)
}

function parseConfigDefaults(config: Partial<ConfigReadResult> | null | undefined): Partial<SetupFormState> {
  const configData = config?.config
  const raw = typeof configData === 'string' ? configData : ''
  const lines = raw.trim() ? splitLines(raw) : []
  const toolsAllow = getList(lines, ['tools', 'allow']).length > 0
    ? getList(lines, ['tools', 'allow'])
    : getObjectList(configData, ['tools', 'allow'])
  const gatewayPlatformsList = getList(lines, ['gateway', 'platforms']).length > 0
    ? getList(lines, ['gateway', 'platforms'])
    : getObjectList(configData, ['gateway', 'platforms'])
  const inferredPlatforms = gatewayPlatformsList.length > 0
    ? gatewayPlatformsList
    : [
        ...topLevelPlatformsFromObject(configData),
        ...topLevelPlatformsFromYaml(lines),
      ].filter((value, index, items) => items.indexOf(value) === index)
  const provider =
    trimmedText(config?.provider)
    || getScalar(lines, ['model', 'provider'])
    || getObjectScalar(configData, ['model', 'provider'])
    || getScalar(lines, ['provider'])
    || getObjectScalar(configData, ['provider'])
  const modelDefault =
    trimmedText(config?.model)
    || getScalar(lines, ['model', 'default'])
    || getObjectScalar(configData, ['model', 'default'])
    || getScalar(lines, ['model'])
    || getObjectScalar(configData, ['model'])
  const terminalCwd =
    trimmedText(config?.terminal_cwd)
    || getScalar(lines, ['terminal', 'cwd'])
    || getObjectScalar(configData, ['terminal', 'cwd'])
    || '.'
  const modelBaseUrl =
    getScalar(lines, ['model', 'base_url'])
    || getObjectScalar(configData, ['model', 'base_url'])
  return {
    provider,
    modelDefault,
    modelBaseUrl,
    terminalCwd,
    gatewayEndpoint:
      getScalar(lines, ['gateway', 'endpoint'])
      || getObjectScalar(configData, ['gateway', 'endpoint']),
    gatewayPlatformsCsv: inferredPlatforms.join(', '),
    toolsAllowCsv: toolsAllow.join(', '),
    reasoningEffort:
      getScalar(lines, ['agent', 'behavior', 'reasoning_effort'])
      || getObjectScalar(configData, ['agent', 'behavior', 'reasoning_effort'])
      || getScalar(lines, ['agent', 'reasoning_effort'])
      || getObjectScalar(configData, ['agent', 'reasoning_effort'])
      || 'medium',
    approvalsMode:
      getScalar(lines, ['agent', 'behavior', 'approvals_mode'])
      || getObjectScalar(configData, ['agent', 'behavior', 'approvals_mode'])
      || getScalar(lines, ['approvals', 'mode'])
      || getObjectScalar(configData, ['approvals', 'mode'])
      || 'manual',
    message:
      getScalar(lines, ['agent', 'behavior', 'message'])
      || getObjectScalar(configData, ['agent', 'behavior', 'message'])
      || getScalar(lines, ['agent', 'message'])
      || getObjectScalar(configData, ['agent', 'message']),
    providerApiKey: '',
  }
}

function applyQueryOverrides(state: SetupFormState): SetupFormState {
  const next = { ...state }
  if (typeof route.query.provider === 'string') next.provider = route.query.provider
  if (typeof route.query.model_base_url === 'string') next.modelBaseUrl = route.query.model_base_url
  if (typeof route.query.terminal_cwd === 'string') next.terminalCwd = route.query.terminal_cwd
  if (typeof route.query.gateway_endpoint === 'string') next.gatewayEndpoint = route.query.gateway_endpoint
  if (typeof route.query.tools_allow === 'string') next.toolsAllowCsv = route.query.tools_allow
  if (typeof route.query.reasoning_effort === 'string') next.reasoningEffort = route.query.reasoning_effort
  if (typeof route.query.approvals_mode === 'string') next.approvalsMode = route.query.approvals_mode
  if (typeof route.query.message === 'string') next.message = route.query.message
  return next
}

function applyLoadedConfig(config: Partial<ConfigReadResult> | null | undefined): void {
  const next = applyQueryOverrides({
    ...DEFAULT_FORM_STATE,
    ...parseConfigDefaults(config),
  })
  const current = form.value
  lastAutoModelBaseUrl.value = ''
  withProgrammaticFormUpdate(() => {
    form.value = {
      ...next,
      provider: isTouched('provider') ? asText(current.provider) : next.provider,
      modelDefault: isTouched('modelDefault') ? asText(current.modelDefault) : next.modelDefault,
      modelBaseUrl: isTouched('modelBaseUrl') ? asText(current.modelBaseUrl) : next.modelBaseUrl,
      terminalCwd: isTouched('terminalCwd') ? asText(current.terminalCwd) : next.terminalCwd,
      gatewayEndpoint: isTouched('gatewayEndpoint') ? asText(current.gatewayEndpoint) : next.gatewayEndpoint,
      gatewayPlatformsCsv: isTouched('gatewayPlatformsCsv') ? asText(current.gatewayPlatformsCsv) : next.gatewayPlatformsCsv,
      toolsAllowCsv: isTouched('toolsAllowCsv') ? asText(current.toolsAllowCsv) : next.toolsAllowCsv,
      reasoningEffort: isTouched('reasoningEffort') ? asText(current.reasoningEffort) : next.reasoningEffort,
      approvalsMode: isTouched('approvalsMode') ? asText(current.approvalsMode) : next.approvalsMode,
      message: isTouched('message') ? asText(current.message) : next.message,
      providerApiKey: isTouched('providerApiKey') ? asText(current.providerApiKey) : '',
    }
  })
}

async function loadDefaults(): Promise<void> {
  loading.value = true
  loadError.value = null
  try {
    if (!profiles.value.length) {
      await hubStore.fetchProfiles()
    }
    touchedFields.value = {}
    lastAutoModelBaseUrl.value = ''
    gatewayPlatformSecrets.value = {}
    withProgrammaticFormUpdate(() => {
      form.value = applyQueryOverrides({ ...DEFAULT_FORM_STATE })
    })
    catalogLoading.value = true
    configLoading.value = true
    envLoading.value = true

    void hubStore.fetchSetupCatalog(profileId.value).then((catalog) => {
      if (!catalog) return
      setupCatalog.value = catalog.data.providers ?? []
      catalogStale.value = catalog.meta.stale
      catalogCachedAt.value = catalog.meta.cached_at ?? ''
    }).catch((error) => {
      loadError.value = error instanceof Error ? error.message : 'Failed to load setup catalog'
    }).finally(() => {
      catalogLoading.value = false
    })

    void hubStore.fetchProfileConfig(profileId.value).then((config) => {
      applyLoadedConfig(config?.data ?? null)
      configStale.value = config?.meta.stale ?? false
      configCachedAt.value = config?.meta.cached_at ?? ''
    }).catch((error) => {
      loadError.value = error instanceof Error ? error.message : 'Failed to load setup defaults'
    }).finally(() => {
      configLoading.value = false
    })

    void hubStore.fetchEnvStatus(profileId.value).then((status) => {
      envKeys.value = Object.keys(status?.data.env_status ?? {}).filter((key) => envValueIsSet(status?.data.env_status?.[key]))
      envStale.value = status?.meta.stale ?? false
      envCachedAt.value = status?.meta.cached_at ?? ''
    }).catch((error) => {
      loadError.value = error instanceof Error ? error.message : 'Failed to load env status'
      envKeys.value = []
    }).finally(() => {
      envLoading.value = false
    })
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Failed to load setup defaults'
    envKeys.value = []
    setupCatalog.value = []
    touchedFields.value = {}
    lastAutoModelBaseUrl.value = ''
    gatewayPlatformSecrets.value = {}
    withProgrammaticFormUpdate(() => {
      form.value = applyQueryOverrides({ ...DEFAULT_FORM_STATE })
    })
  } finally {
    loading.value = false
  }
}

function startSetup(): void {
  if (submitDisabled.value) return
  const toolsAllow = asText(form.value.toolsAllowCsv)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const provider = trimmedText(form.value.provider)
  const modelDefault = trimmedText(form.value.modelDefault)
  const modelBaseUrl = trimmedText(form.value.modelBaseUrl)
  const terminalCwd = trimmedText(form.value.terminalCwd)
  const gatewayEndpoint = trimmedText(form.value.gatewayEndpoint)
  const gatewayPlatforms = parseCsvList(form.value.gatewayPlatformsCsv)
  const reasoningEffort = trimmedText(form.value.reasoningEffort)
  const approvalsMode = trimmedText(form.value.approvalsMode)
  const message = asText(form.value.message)
  const providerApiKey = trimmedText(form.value.providerApiKey)
  const envEntries: Record<string, string> = {}
  if (providerEnvWriteKey.value && providerApiKey) {
    envEntries[providerEnvWriteKey.value] = providerApiKey
  }
  for (const option of selectedGatewayPlatformOptions.value) {
    if (!option.tokenEnvKey) continue
    const tokenValue = trimmedText(gatewayPlatformSecrets.value[option.id])
    if (!tokenValue) continue
    envEntries[option.tokenEnvKey] = tokenValue
  }
  const payload: SetupRunPayload = {
    mode: pageMode.value,
    inputs: {
      provider,
      model: {
        default: modelDefault,
        ...(modelBaseUrl ? { base_url: modelBaseUrl } : {}),
      },
      terminal: { cwd: terminalCwd },
      ...(gatewayEndpoint || gatewayPlatforms.length > 0
        ? {
            gateway: {
              ...(gatewayEndpoint ? { endpoint: gatewayEndpoint } : {}),
              ...(gatewayPlatforms.length > 0 ? { platforms: gatewayPlatforms } : {}),
            },
          }
        : {}),
      ...(toolsAllow.length > 0 ? { tools: { allow: toolsAllow } } : {}),
      agent_behavior: {
        reasoning_effort: reasoningEffort,
        approvals_mode: approvalsMode,
        ...(trimmedText(message) ? { message } : {}),
      },
      ...(Object.keys(envEntries).length > 0 ? { env: envEntries } : {}),
    },
  }
  const draftId = createSetupDraftId(profileId.value)
  saveSetupDraft(draftId, payload)
  void router.push({
    name: 'profileSetupProgress',
    params: { id: profileId.value },
    query: {
      draft: draftId,
    },
  })
}

onMounted(() => {
  void loadDefaults()
})

watch(
  [providerOptions, () => form.value.provider],
  ([options, provider]) => {
    if (configLoading.value) return
    if (trimmedText(provider)) return
    const first = options[0]
    if (!first) return
    withProgrammaticFormUpdate(() => {
      form.value.provider = first.id
    })
  },
  { immediate: true },
)

watch(
  [selectedProviderDefinition, availableModels],
  ([providerDef, models]) => {
    if (configLoading.value) return
    if (!providerDef) return
    if (models.length === 0) return
    if (trimmedText(form.value.modelDefault)) return
    withProgrammaticFormUpdate(() => {
      form.value.modelDefault = models[0]
    })
  },
  { immediate: true },
)

watch(
  [() => form.value.provider, selectedProviderDefinition, configLoading],
  ([nextProvider, providerDef, isConfigLoading], [previousProvider]) => {
    if (isConfigLoading) return
    if (configLoading.value) return
    if (!nextProvider || nextProvider === previousProvider) return
    syncModelBaseUrlFromProvider(trimmedText(providerDef?.base_url))
  },
  { immediate: true },
)

watch(
  [selectedProviderDefinition, configLoading],
  ([providerDef, isConfigLoading]) => {
    if (isConfigLoading) return
    if (!trimmedText(form.value.provider)) return
    syncModelBaseUrlFromProvider(trimmedText(providerDef?.base_url))
  },
  { immediate: true },
)

watch(
  () => form.value.provider,
  (nextProvider, previousProvider) => {
    if (configLoading.value) return
    if (!nextProvider || nextProvider === previousProvider) return
    if (availableModels.value.length > 0) return
    withProgrammaticFormUpdate(() => {
      form.value.modelDefault = ''
    })
  },
)

watch(() => form.value.provider, (next, previous) => {
  if (next !== previous) markTouched('provider')
})

watch(() => form.value.modelDefault, (next, previous) => {
  if (next !== previous) markTouched('modelDefault')
})

watch(() => form.value.modelBaseUrl, (next, previous) => {
  if (next !== previous) markTouched('modelBaseUrl')
})

watch(() => form.value.terminalCwd, (next, previous) => {
  if (next !== previous) markTouched('terminalCwd')
})

watch(() => form.value.gatewayEndpoint, (next, previous) => {
  if (next !== previous) markTouched('gatewayEndpoint')
})

watch(() => form.value.gatewayPlatformsCsv, (next, previous) => {
  if (next !== previous) markTouched('gatewayPlatformsCsv')
})

watch(() => form.value.toolsAllowCsv, (next, previous) => {
  if (next !== previous) markTouched('toolsAllowCsv')
})

watch(() => form.value.reasoningEffort, (next, previous) => {
  if (next !== previous) markTouched('reasoningEffort')
})

watch(() => form.value.approvalsMode, (next, previous) => {
  if (next !== previous) markTouched('approvalsMode')
})

watch(() => form.value.message, (next, previous) => {
  if (next !== previous) markTouched('message')
})

watch(() => form.value.providerApiKey, (next, previous) => {
  if (next !== previous) markTouched('providerApiKey')
})
</script>

<template>
  <div class="p-7 max-[760px]:p-[18px]">
    <SectionTitle>
      <template #before-title>
        <button class="back-link" type="button" @click="router.back()">
          <span>&lt;-</span>
          <span>Back</span>
        </button>
      </template>
      <template #title>Setup Agent: {{ profile?.name ?? profileId }}</template>
      <template #subtitle>
        <div class="flex flex-wrap items-center gap-2">
          <StatusBadge tone="info">Node: {{ profile?.nodeLabel ?? '--' }}</StatusBadge>
          <StatusBadge :tone="profile?.setupTone ?? 'warn'">Setup: {{ profile?.setupText ?? 'unknown' }}</StatusBadge>
          <StatusBadge tone="purple">{{ pageMode === 'create_flow' ? 'Create Flow' : 'Repair Flow' }}</StatusBadge>
          <StatusBadge v-if="catalogStale || configStale || envStale" tone="warn">Using Cached Reads</StatusBadge>
        </div>
      </template>
      <template #actions>
        <UiButton :disabled="submitDisabled || catalogLoading" variant="primary" @click="startSetup">
          {{ catalogLoading ? 'Loading Catalog...' : 'Continue To Setup' }}
        </UiButton>
      </template>
    </SectionTitle>

    <section class="app-panel p-5">
      <div v-if="loadError" class="mb-4 rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
        {{ loadError }}
      </div>
      <div v-if="catalogStale || configStale || envStale" class="mb-4 rounded-md border border-warning/30 bg-warning/8 px-4 py-3 text-sm text-warning">
        Some defaults are coming from cached node data because the live query channel was unavailable.
      </div>

      <div class="grid grid-cols-2 gap-3.5 max-[860px]:grid-cols-1">
        <label class="form-group">
          <span>Provider</span>
          <select v-model="form.provider" :disabled="catalogLoading || providerOptions.length === 0">
            <option value="" disabled>Select provider</option>
            <option v-for="provider in providerOptions" :key="provider.id" :value="provider.id">
              {{ provider.label }}
            </option>
          </select>
          <small v-if="catalogLoading">Loading provider catalog from Hermes Agent...</small>
          <small v-else-if="catalogStale">Provider list is from cache{{ catalogCachedAt ? ` (${catalogCachedAt})` : '' }}.</small>
          <small v-else>Provider list is loaded from the target Hermes Agent instance.</small>
        </label>

        <label class="form-group">
          <span>Model</span>
          <select v-if="modelOptions.length > 0" v-model="form.modelDefault" :disabled="catalogLoading">
            <option v-for="model in modelOptions" :key="model.id" :value="model.id">{{ model.label }}</option>
          </select>
          <input v-else v-model="form.modelDefault" placeholder="Model id" />
          <small v-if="modelOptions.length > 0">Model list follows the selected provider from Hermes Agent.</small>
          <small v-else>No curated model list was returned for this provider, so model stays editable.</small>
        </label>

        <label class="form-group">
          <span>Model Base URL</span>
          <input v-model="form.modelBaseUrl" :placeholder="providerBaseUrl || 'https://api.example.com/v1'" />
          <small v-if="providerBaseUrl">Hermes default for this provider: {{ providerBaseUrl }}</small>
          <small v-else-if="providerBaseUrlEnvVar">Hermes supports override via {{ providerBaseUrlEnvVar }}.</small>
          <small v-else>Leave blank to keep the provider default behavior.</small>
        </label>

        <label v-if="providerEnvWriteKey" class="form-group">
          <span>{{ providerEnvWriteKey }}</span>
          <input v-model="form.providerApiKey" type="password" :placeholder="providerEnvAlreadySet ? 'Already configured; enter only to overwrite during setup' : 'Enter API key'" />
          <small v-if="envLoading">Checking `.env` status...</small>
          <small v-else-if="providerEnvAlreadySet">Existing key detected in `.env`. Leave blank to keep it.</small>
          <small v-else-if="providerEnvKeys.length > 1">Required. Hermes also accepts: {{ providerEnvKeys.slice(1).join(', ') }}.</small>
          <small v-else>Required because current profile does not have this provider key yet.</small>
        </label>

        <label class="form-group">
          <span>Terminal CWD</span>
          <input v-model="form.terminalCwd" placeholder="." />
          <small v-if="configLoading">Loading config defaults...</small>
          <small v-else-if="configStale">Config defaults are from cache{{ configCachedAt ? ` (${configCachedAt})` : '' }}.</small>
        </label>

        <label class="form-group">
          <span>Gateway Endpoint</span>
          <input v-model="form.gatewayEndpoint" placeholder="http://127.0.0.1:3000" />
        </label>

        <div class="form-group col-span-full">
          <span>Messaging Platforms</span>
          <div class="mt-2 grid grid-cols-3 gap-2 max-[980px]:grid-cols-2 max-[560px]:grid-cols-1">
            <button
              v-for="option in MESSAGING_PLATFORM_OPTIONS"
              :key="option.id"
              class="rounded-md border px-3 py-2 text-left text-sm transition"
              :class="selectedGatewayPlatformSet.has(option.id)
                ? 'border-brand/50 bg-brand/12 text-parchment'
                : 'border-snow/10 bg-snow/[.03] text-slate hover:border-snow/25 hover:text-parchment'"
              type="button"
              @click="toggleGatewayPlatform(option.id)"
            >
              <div class="flex items-center justify-between gap-2">
                <span>{{ option.label }}</span>
                <span
                  v-if="option.tokenEnvKey"
                  class="rounded-sm border border-snow/12 bg-ash/40 px-1.5 py-0.5 font-mono text-[11px] text-slate"
                >
                  {{ option.tokenEnvKey }}
                </span>
              </div>
            </button>
          </div>
          <small>
            Choose the messaging gateways this profile should prepare inside `gateway.platforms`.
          </small>
          <small v-if="selectedGatewayPlatforms.length > 0">
            Selected: {{ selectedGatewayPlatforms.map(messagingPlatformLabel).join(', ') }}
          </small>
        </div>

        <label
          v-for="option in selectedGatewayTokenPlatformOptions"
          :key="option.id"
          class="form-group"
        >
          <span>{{ option.tokenEnvKey }}</span>
          <input
            :value="gatewayPlatformSecretValue(option.id)"
            type="password"
            :placeholder="platformTokenAlreadySet(option) ? 'Already configured; enter only to overwrite during setup' : `Enter ${option.label} token`"
            @input="onGatewayPlatformSecretInput(option.id, $event)"
          />
          <small v-if="envLoading">Checking `.env` status...</small>
          <small v-else-if="platformTokenAlreadySet(option)">
            Existing {{ option.label }} token detected in `.env`. Leave blank to keep it.
          </small>
          <small v-else>
            Optional here, but usually needed before the {{ option.label }} gateway can connect.
          </small>
        </label>

        <label class="form-group col-span-full">
          <span>Messaging Platforms (Advanced)</span>
          <input v-model="form.gatewayPlatformsCsv" placeholder="telegram, discord, slack" />
          <small>
            Advanced override for `gateway.platforms`. The selector above keeps this field in sync.
          </small>
        </label>

        <label class="form-group">
          <span>Tools Allow</span>
          <input v-model="form.toolsAllowCsv" placeholder="shell,read_file,write_file" />
          <small>Comma-separated list written into `tools.allow`.</small>
        </label>

        <label class="form-group">
          <span>Reasoning Effort</span>
          <select v-model="form.reasoningEffort">
            <option value="minimal">minimal</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>

        <label class="form-group">
          <span>Approvals Mode</span>
          <select v-model="form.approvalsMode">
            <option value="manual">manual</option>
            <option value="auto">auto</option>
          </select>
        </label>

        <label class="form-group col-span-full">
          <span>Message</span>
          <input v-model="form.message" placeholder="Optional agent behavior message" />
        </label>
      </div>

      <div v-if="selectedProviderDefinition" class="mt-4 rounded-md border border-snow/10 bg-snow/[.03] px-4 py-3">
        <div class="flex flex-wrap items-center gap-2">
          <StatusBadge :tone="authTone(selectedProviderDefinition.auth_type)">{{ authLabel(selectedProviderDefinition.auth_type) }}</StatusBadge>
          <StatusBadge v-if="providerBaseUrl" tone="info">Base URL: {{ providerBaseUrl }}</StatusBadge>
          <StatusBadge v-if="providerBaseUrlEnvVar" tone="info">Override: {{ providerBaseUrlEnvVar }}</StatusBadge>
        </div>
        <p v-if="providerEnvKeys.length > 0" class="mt-2 text-sm text-slate">
          Required env keys: <span class="font-mono text-parchment">{{ providerEnvKeys.join(', ') }}</span>
        </p>
        <p v-if="providerOptionalEnvKeys.length > 0" class="mt-1 text-sm text-slate">
          Optional env keys: <span class="font-mono text-parchment">{{ providerOptionalEnvKeys.join(', ') }}</span>
        </p>
      </div>

      <div v-if="providerNeedsNonApiKeyAuth" class="mt-4 rounded-md border border-warning/30 bg-warning/8 px-4 py-3 text-sm text-warning">
        This provider uses `{{ selectedProviderDefinition?.auth_type }}` authentication in Hermes Agent. This setup form can save provider and model selection, but account login may still need to happen through Hermes native auth flow.
      </div>

      <div class="mt-5 flex flex-wrap items-center gap-2">
        <UiButton :disabled="submitDisabled || catalogLoading" variant="primary" @click="startSetup">Start Setup</UiButton>
        <UiButton @click="router.push(`/profiles/${profileId}`)">Open Agent Detail</UiButton>
        <span v-if="providerEnvMissing" class="text-sm text-warning">{{ providerEnvWriteKey }} is required before setup can start.</span>
        <span v-else-if="submitDisabled" class="text-sm text-warning">Provider, model, and terminal cwd are required before setup can start.</span>
      </div>
    </section>
  </div>
</template>
