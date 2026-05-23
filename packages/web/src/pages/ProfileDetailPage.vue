<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useHubStore } from '@/stores/hub'
import type { SetupCatalogProvider } from '@hermes-hub/core'
import UiButton from '@/components/ui/UiButton.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import SectionTitle from '@/components/ui/SectionTitle.vue'
import {
  applyEditableProfileConfig,
  EMPTY_EDITABLE_PROFILE_CONFIG,
  extractEditableProfileConfig,
  type EditableProfileConfig,
} from '@/utils/profileConfig'

const route = useRoute()
const router = useRouter()
const hubStore = useHubStore()
const { profiles } = storeToRefs(hubStore)

const tabs = [
  { key: 'config', label: 'config.yaml' },
  { key: 'soul', label: 'SOUL.md' },
  { key: 'skills', label: 'Skills' },
  { key: 'env', label: 'Env' },
] as const

type TabKey = (typeof tabs)[number]['key']
type SaveState = 'idle' | 'saved' | 'error'
type ConfigViewMode = 'form' | 'raw'

interface SetupModelOption {
  id: string
  label: string
}

const activeTab = ref<TabKey>('config')
const loading = ref(false)
const loadError = ref<string | null>(null)
const skills = ref<string[]>([])
const setupCatalog = ref<SetupCatalogProvider[]>([])
const configStale = ref(false)
const soulStale = ref(false)
const skillsStale = ref(false)
const envStale = ref(false)
const catalogStale = ref(false)

const configLoadedText = ref('')
const configLoadedForm = ref<EditableProfileConfig>({ ...EMPTY_EDITABLE_PROFILE_CONFIG })
const configForm = ref<EditableProfileConfig>({ ...EMPTY_EDITABLE_PROFILE_CONFIG })
const configViewMode = ref<ConfigViewMode>('form')
const configSaving = ref(false)
const configSaveState = ref<SaveState>('idle')
const configSaveError = ref<string | null>(null)

const soulLoadedText = ref('')
const soulDraft = ref('')
const soulSaving = ref(false)
const soulSaveState = ref<SaveState>('idle')
const soulSaveError = ref<string | null>(null)

// Env state (Phase 6)
const envKeys = ref<string[]>([])
const envLoading = ref(false)
const envLoadError = ref<string | null>(null)
const envSaving = ref(false)
const envSetShow = ref(false)
const envSetKey = ref('')
const envSetValue = ref('')
const envError = ref<string | null>(null)

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

const profileId = computed(() => String(route.params.id ?? ''))
const profile = computed(() => profiles.value.find((item) => item.id === profileId.value) ?? null)
const agentName = computed(() => profile.value?.name ?? profileId.value)
const agentHome = computed(() => profile.value?.home ?? '(unknown home)')
const providerOptions = computed<SetupCatalogProvider[]>(() => {
  const current = trimmedText(configForm.value.modelProvider)
  if (!current || setupCatalog.value.some((item) => item.id === current)) return setupCatalog.value
  return [
    {
      id: current,
      label: `${current} (current)`,
      auth_type: 'api_key',
      required_env_keys: [],
      optional_env_keys: [],
      models: trimmedText(configForm.value.modelDefault) ? [trimmedText(configForm.value.modelDefault)] : [],
    },
    ...setupCatalog.value,
  ]
})
const selectedProviderDefinition = computed<SetupCatalogProvider | null>(() => {
  const current = trimmedText(configForm.value.modelProvider)
  return providerOptions.value.find((item) => item.id === current) ?? null
})
const modelOptions = computed<SetupModelOption[]>(() => {
  const currentModel = trimmedText(configForm.value.modelDefault)
  const catalogModels = selectedProviderDefinition.value?.models ?? []
  const options = catalogModels.map((model) => ({ id: model, label: model }))
  if (currentModel && !catalogModels.includes(currentModel)) {
    return [{ id: currentModel, label: `${currentModel} (current)` }, ...options]
  }
  return options
})
const providerAuthType = computed(() => selectedProviderDefinition.value?.auth_type ?? '')
const providerEnvKeys = computed(() => selectedProviderDefinition.value?.required_env_keys ?? [])
const providerOptionalEnvKeys = computed(() => selectedProviderDefinition.value?.optional_env_keys ?? [])
const providerEnvAlreadySet = computed(() => providerEnvKeys.value.some((key) => envKeys.value.includes(key)))
const providerBaseUrl = computed(() => trimmedText(selectedProviderDefinition.value?.base_url))
const providerBaseUrlEnvVar = computed(() => trimmedText(selectedProviderDefinition.value?.base_url_env_var))
const providerNeedsNonApiKeyAuth = computed(() => !!providerAuthType.value && providerAuthType.value !== 'api_key')

function cloneEditableConfig(values: EditableProfileConfig): EditableProfileConfig {
  return {
    description: values.description,
    modelProvider: values.modelProvider,
    modelDefault: values.modelDefault,
    modelBaseUrl: values.modelBaseUrl,
    terminalCwd: values.terminalCwd,
    approvalsMode: values.approvalsMode,
    agentReasoningEffort: values.agentReasoningEffort,
  }
}

function isSameEditableConfig(left: EditableProfileConfig, right: EditableProfileConfig): boolean {
  return (
    left.description === right.description &&
    left.modelProvider === right.modelProvider &&
    left.modelDefault === right.modelDefault &&
    left.modelBaseUrl === right.modelBaseUrl &&
    left.terminalCwd === right.terminalCwd &&
    left.approvalsMode === right.approvalsMode &&
    left.agentReasoningEffort === right.agentReasoningEffort
  )
}

const isConfigDirty = computed(() => !isSameEditableConfig(configForm.value, configLoadedForm.value))
const isSoulDirty = computed(() => soulDraft.value !== soulLoadedText.value)
const hasUnsavedChanges = computed(() => isConfigDirty.value || isSoulDirty.value)

const configSaveDisabled = computed(() => configSaving.value || !isConfigDirty.value)
const soulSaveDisabled = computed(() => soulSaving.value || !isSoulDirty.value)

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

function clearConfigFeedback(): void {
  configSaveState.value = 'idle'
  configSaveError.value = null
}

function clearSoulFeedback(): void {
  soulSaveState.value = 'idle'
  soulSaveError.value = null
}

function confirmDiscardUnsavedChanges(): boolean {
  if (!hasUnsavedChanges.value) return true
  return window.confirm('You have unsaved changes in this agent. Leave without saving?')
}

function switchTab(nextTab: TabKey): void {
  if (nextTab === activeTab.value) return
  if (!confirmDiscardUnsavedChanges()) return
  activeTab.value = nextTab
}

async function saveConfig(): Promise<void> {
  if (configSaveDisabled.value) return
  configSaving.value = true
  clearConfigFeedback()
  const nextRaw = applyEditableProfileConfig(configLoadedText.value, configForm.value)
  try {
    const result = await hubStore.saveProfileConfig(profileId.value, nextRaw)
    if (result.ok) {
      configLoadedText.value = nextRaw
      configLoadedForm.value = cloneEditableConfig(configForm.value)
      configSaveState.value = 'saved'
      return
    }
    configSaveState.value = 'error'
    configSaveError.value = result.error ?? 'Failed to save config.yaml'
  } finally {
    configSaving.value = false
  }
}

function resetConfig(): void {
  configForm.value = cloneEditableConfig(configLoadedForm.value)
  clearConfigFeedback()
}

async function saveSoul(): Promise<void> {
  if (soulSaveDisabled.value) return
  soulSaving.value = true
  clearSoulFeedback()
  try {
    const result = await hubStore.saveProfileSoul(profileId.value, soulDraft.value)
    if (result.ok) {
      soulLoadedText.value = soulDraft.value
      soulSaveState.value = 'saved'
      return
    }
    soulSaveState.value = 'error'
    soulSaveError.value = result.error ?? 'Failed to save SOUL.md'
  } finally {
    soulSaving.value = false
  }
}

function resetSoul(): void {
  soulDraft.value = soulLoadedText.value
  clearSoulFeedback()
}

function openEnvSet(newKey = '', newValue = ''): void {
  envSetKey.value = newKey
  envSetValue.value = newValue
  envSetShow.value = true
  envError.value = null
}

async function saveEnv(): Promise<void> {
  if (!trimmedText(envSetKey.value)) return
  envSaving.value = true
  envError.value = null
  try {
    const result = await hubStore.setEnv(profileId.value, trimmedText(envSetKey.value), asText(envSetValue.value))
    if (result.ok) {
      envSetShow.value = false
      const status = await hubStore.fetchEnvStatus(profileId.value)
      envKeys.value = Object.keys(status?.data.env_status ?? {}).filter((envKey) => envValueIsSet(status?.data.env_status?.[envKey]))
      envStale.value = status?.meta.stale ?? false
    } else {
      envError.value = result.error ?? 'env.set failed'
    }
  } finally {
    envSaving.value = false
  }
}

async function doDeleteEnv(key: string): Promise<void> {
  if (!window.confirm(`Delete env variable '${key}'?`)) return
  envSaving.value = true
  envError.value = null
  try {
    const result = await hubStore.deleteEnv(profileId.value, key)
    if (result.ok) {
      const status = await hubStore.fetchEnvStatus(profileId.value)
      envKeys.value = Object.keys(status?.data.env_status ?? {}).filter((envKey) => envValueIsSet(status?.data.env_status?.[envKey]))
      envStale.value = status?.meta.stale ?? false
    } else {
      envError.value = result.error ?? 'env.delete failed'
    }
  } finally {
    envSaving.value = false
  }
}

async function loadProfileDetail(): Promise<void> {
  loading.value = true
  loadError.value = null
  clearConfigFeedback()
  clearSoulFeedback()
  configSaving.value = false
  soulSaving.value = false

  try {
    if (!profiles.value.length) {
      await hubStore.fetchProfiles()
    }

    const [configResult, soulResult, skillsResult] = await Promise.all([
      hubStore.fetchProfileConfig(profileId.value),
      hubStore.fetchProfileSoul(profileId.value),
      hubStore.fetchProfileSkills(profileId.value),
    ])
    const catalog = await hubStore.fetchSetupCatalog(profileId.value)

    const configText = configResult?.data.config ?? ''
    const parsedConfig = extractEditableProfileConfig(configText)
    configLoadedText.value = configText
    configLoadedForm.value = cloneEditableConfig(parsedConfig)
    configForm.value = cloneEditableConfig(parsedConfig)
    setupCatalog.value = catalog?.data.providers ?? []
    configStale.value = configResult?.meta.stale ?? false
    soulStale.value = soulResult?.meta.stale ?? false
    skillsStale.value = skillsResult?.meta.stale ?? false
    catalogStale.value = catalog?.meta.stale ?? false

    soulLoadedText.value = soulResult?.data.content ?? ''
    soulDraft.value = soulResult?.data.content ?? ''
    skills.value = (skillsResult?.data.skills ?? []).map((skill) => skill.name)

    // Env 加载独立进行，不阻塞主流程
    envLoading.value = true
    envLoadError.value = null
    try {
      const status = await hubStore.fetchEnvStatus(profileId.value)
      envKeys.value = Object.keys(status?.data.env_status ?? {}).filter((envKey) => envValueIsSet(status?.data.env_status?.[envKey]))
      envStale.value = status?.meta.stale ?? false
    } catch {
      envLoadError.value = 'Failed to load env status'
      envKeys.value = []
    } finally {
      envLoading.value = false
    }
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Failed to load agent details'
    configLoadedText.value = ''
    configLoadedForm.value = cloneEditableConfig(EMPTY_EDITABLE_PROFILE_CONFIG)
    configForm.value = cloneEditableConfig(EMPTY_EDITABLE_PROFILE_CONFIG)
    setupCatalog.value = []
    configStale.value = false
    soulStale.value = false
    skillsStale.value = false
    envStale.value = false
    catalogStale.value = false
    soulLoadedText.value = ''
    soulDraft.value = ''
    skills.value = []
  } finally {
    loading.value = false
  }
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (!hasUnsavedChanges.value) return
  event.preventDefault()
  event.returnValue = ''
}

onBeforeRouteLeave((_to, _from, next) => {
  if (confirmDiscardUnsavedChanges()) {
    next()
    return
  }
  next(false)
})

onBeforeRouteUpdate((_to, _from, next) => {
  if (confirmDiscardUnsavedChanges()) {
    next()
    return
  }
  next(false)
})

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  void loadProfileDetail()
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})

watch(profileId, () => {
  void loadProfileDetail()
})

watch(
  configForm,
  () => {
    if (configSaveState.value === 'saved' && isConfigDirty.value) clearConfigFeedback()
    if (configSaveState.value === 'error') clearConfigFeedback()
  },
  { deep: true },
)

watch(
  [selectedProviderDefinition, modelOptions],
  ([providerDef, models]) => {
    if (!providerDef) return
    if (models.length === 0) return
    const current = trimmedText(configForm.value.modelDefault)
    if (models.some((item) => item.id === current)) return
    configForm.value.modelDefault = models[0].id
  },
  { immediate: true },
)

watch(
  () => configForm.value.modelProvider,
  (nextProvider, previousProvider) => {
    if (!nextProvider || nextProvider === previousProvider) return
    if (modelOptions.value.length > 0) return
    configForm.value.modelDefault = ''
  },
)

watch(soulDraft, () => {
  if (soulSaveState.value === 'saved' && isSoulDirty.value) clearSoulFeedback()
  if (soulSaveState.value === 'error') clearSoulFeedback()
})
</script>

<template>
  <div class="p-7 max-[760px]:p-[18px]">
    <SectionTitle>
      <template #before-title>
        <button class="back-link" type="button" @click="router.push('/profiles')">
          <span>&lt;-</span>
          <span>Back</span>
        </button>
      </template>
      <template #title>Agent Detail: {{ agentName }}</template>
      <template #subtitle>
        <div class="flex flex-wrap items-center gap-2">
          <StatusBadge :tone="profile?.setupTone ?? 'warn'">Setup: {{ profile?.setupText ?? 'unknown' }}</StatusBadge>
          <StatusBadge :tone="profile?.gatewayTone ?? 'warn'">Gateway: {{ profile?.gatewayText ?? 'unknown' }}</StatusBadge>
          <StatusBadge :tone="profile?.apiTone ?? 'warn'">API: {{ profile?.apiText ?? 'unknown' }}</StatusBadge>
          <StatusBadge v-if="configStale || soulStale || skillsStale || envStale || catalogStale" tone="warn">Cached Reads</StatusBadge>
        </div>
      </template>
      <template #actions>
        <UiButton variant="primary" @click="router.push(`/profiles/${profileId}/setup`)">Setup</UiButton>
        <UiButton @click="router.push(`/profiles/${profileId}/logs`)">Agent Logs</UiButton>
        <UiButton @click="router.push('/profiles')">Back to Agents</UiButton>
      </template>
    </SectionTitle>

    <section class="app-panel p-5">
      <div class="mb-4 flex flex-wrap gap-2 rounded-md border border-snow/10 bg-snow/[.035] p-2">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="min-h-[38px] rounded-md px-3 text-sm font-extrabold transition"
          :class="activeTab === tab.key ? 'border border-signal/25 bg-signal/10 text-signal' : 'text-slate hover:text-snow'"
          type="button"
          @click="switchTab(tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>

      <div v-if="loading" class="text-sm text-slate">Loading agent detail...</div>
      <div v-else-if="loadError" class="text-sm text-danger">{{ loadError }}</div>

      <template v-else>
        <div v-if="configStale || soulStale || skillsStale || envStale || catalogStale" class="mb-4 rounded-md border border-warning/30 bg-warning/8 px-4 py-3 text-sm text-warning">
          Some agent details are currently coming from cached node data.
        </div>
        <div v-if="activeTab === 'config'" class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-snow/10 bg-snow/[.03] p-2">
            <div class="inline-flex items-center gap-1">
              <button
                class="min-h-[34px] rounded-md px-3 text-xs font-bold transition"
                :class="configViewMode === 'form' ? 'border border-signal/25 bg-signal/10 text-signal' : 'text-slate hover:text-snow'"
                type="button"
                @click="configViewMode = 'form'"
              >
                Editable
              </button>
              <button
                class="min-h-[34px] rounded-md px-3 text-xs font-bold transition"
                :class="configViewMode === 'raw' ? 'border border-signal/25 bg-signal/10 text-signal' : 'text-slate hover:text-snow'"
                type="button"
                @click="configViewMode = 'raw'"
              >
                Raw
              </button>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UiButton variant="primary" :disabled="configSaveDisabled" @click="saveConfig">
                {{ configSaving ? 'Saving...' : 'Save Config' }}
              </UiButton>
              <UiButton :disabled="configSaving || !isConfigDirty" @click="resetConfig">Reset</UiButton>
            </div>
          </div>

          <div v-if="configViewMode === 'form'" class="grid grid-cols-2 gap-3.5 max-[860px]:grid-cols-1">
            <label class="form-group">
              <span>Description</span>
              <input v-model="configForm.description" placeholder="Agent description" />
            </label>
            <label class="form-group">
              <span>Terminal CWD</span>
              <input v-model="configForm.terminalCwd" placeholder="." />
            </label>
            <label class="form-group">
              <span>Model Provider</span>
              <select v-model="configForm.modelProvider">
                <option value="" disabled>Select provider</option>
                <option v-for="provider in providerOptions" :key="provider.id" :value="provider.id">
                  {{ provider.label }}
                </option>
              </select>
              <small>Provider list is loaded from this Hermes Agent node.</small>
            </label>
            <label class="form-group">
              <span>Model Default</span>
              <select v-if="modelOptions.length > 0" v-model="configForm.modelDefault">
                <option v-for="model in modelOptions" :key="model.id" :value="model.id">{{ model.label }}</option>
              </select>
              <input v-else v-model="configForm.modelDefault" placeholder="Model id" />
              <small v-if="modelOptions.length > 0">Models follow the selected provider from Hermes Agent.</small>
              <small v-else>No curated model list returned, so this stays editable.</small>
            </label>
            <label class="form-group">
              <span>Model Base URL</span>
              <input v-model="configForm.modelBaseUrl" placeholder="https://api.deepseek.com/v1" />
              <small v-if="providerBaseUrl">Hermes default: {{ providerBaseUrl }}</small>
              <small v-else-if="providerBaseUrlEnvVar">Override env: {{ providerBaseUrlEnvVar }}</small>
            </label>
            <label class="form-group">
              <span>Approvals Mode</span>
              <input v-model="configForm.approvalsMode" placeholder="manual" />
            </label>
            <label class="form-group col-span-full">
              <span>Reasoning Effort</span>
              <input v-model="configForm.agentReasoningEffort" placeholder="medium" />
              <small>Only key editable fields are shown here. Use Raw mode to inspect original config content.</small>
            </label>
          </div>

          <div v-if="configViewMode === 'form' && selectedProviderDefinition" class="rounded-md border border-snow/10 bg-snow/[.03] px-4 py-3">
            <div class="flex flex-wrap items-center gap-2">
              <StatusBadge :tone="authTone(selectedProviderDefinition.auth_type)">{{ authLabel(selectedProviderDefinition.auth_type) }}</StatusBadge>
              <StatusBadge v-if="providerBaseUrl" tone="info">Base URL: {{ providerBaseUrl }}</StatusBadge>
              <StatusBadge v-if="providerBaseUrlEnvVar" tone="info">Override: {{ providerBaseUrlEnvVar }}</StatusBadge>
              <StatusBadge v-if="providerEnvKeys.length > 0" :tone="providerEnvAlreadySet ? 'running' : 'warn'">
                {{ providerEnvAlreadySet ? 'Env Ready' : 'Env Missing' }}
              </StatusBadge>
            </div>
            <p v-if="providerEnvKeys.length > 0" class="mt-2 text-sm text-slate">
              Required env keys:
              <span class="font-mono text-parchment">{{ providerEnvKeys.join(', ') }}</span>
            </p>
            <p v-if="providerOptionalEnvKeys.length > 0" class="mt-1 text-sm text-slate">
              Optional env keys:
              <span class="font-mono text-parchment">{{ providerOptionalEnvKeys.join(', ') }}</span>
            </p>
            <p v-if="providerNeedsNonApiKeyAuth" class="mt-2 text-sm text-warning">
              This provider uses {{ authLabel(providerAuthType) }} in Hermes Agent. Config can be edited here, but login may still need to happen through Hermes native auth flow.
            </p>
            <p v-else-if="providerEnvKeys.length > 0 && !providerEnvAlreadySet" class="mt-2 text-sm text-warning">
              Add the missing provider key in the Env tab before running Setup again.
            </p>
          </div>

          <div v-else class="yaml-box">
            <span class="text-mint"># {{ agentHome }}/config.yaml</span>
            {{ configLoadedText || '\n# config.yaml not found' }}
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <span v-if="isConfigDirty" class="text-xs text-warning">Unsaved changes</span>
            <span v-if="configStale" class="text-xs text-warning">Config is cached</span>
            <span v-if="configSaveState === 'saved'" class="text-xs text-mint">Saved</span>
            <span v-if="configSaveState === 'error'" class="text-xs text-danger">Save failed: {{ configSaveError }}</span>
          </div>
        </div>

        <div v-else-if="activeTab === 'soul'" class="editor-shell">
          <div class="editor-titlebar">
            <span class="size-2.5 rounded-full bg-[#ff5f56]"></span><span class="size-2.5 rounded-full bg-[#ffbd2e]"></span><span class="size-2.5 rounded-full bg-[#27c93f]"></span>
            <span class="ml-2 font-mono text-xs text-slate">SOUL.md</span>
          </div>
          <textarea
            v-model="soulDraft"
            class="min-h-[360px] rounded-none border-0 bg-transparent font-mono text-[13px] text-parchment"
            placeholder="# Write your SOUL content here"
          />
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <UiButton variant="primary" :disabled="soulSaveDisabled" @click="saveSoul">
              {{ soulSaving ? 'Saving...' : 'Save SOUL' }}
            </UiButton>
            <UiButton :disabled="soulSaving || !isSoulDirty" @click="resetSoul">Reset</UiButton>
            <span v-if="isSoulDirty" class="text-xs text-warning">Unsaved changes</span>
            <span v-if="soulStale" class="text-xs text-warning">SOUL is cached</span>
            <span v-if="soulSaveState === 'saved'" class="text-xs text-mint">Saved</span>
            <span v-if="soulSaveState === 'error'" class="text-xs text-danger">Save failed: {{ soulSaveError }}</span>
          </div>
        </div>

        <div v-else-if="activeTab === 'env'" class="space-y-4">
          <div class="flex flex-wrap items-center gap-2 rounded-md border border-snow/10 bg-snow/[.03] p-2">
            <UiButton variant="green" @click="openEnvSet()">Add Env</UiButton>
            <span v-if="envLoading" class="text-xs text-slate">Loading env...</span>
            <span v-else-if="envLoadError" class="text-xs text-danger">{{ envLoadError }}</span>
            <span v-else-if="envStale" class="text-xs text-warning">Env status is cached</span>
          </div>

          <div v-if="envError" class="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{{ envError }}</div>

          <!-- Set env modal -->
          <div v-if="envSetShow" class="rounded-md border border-signal/25 bg-signal/5 p-4 space-y-3">
            <h4 class="text-sm font-extrabold text-snow">Set Env Variable</h4>
            <label class="form-group">
              <span>Key</span>
              <input v-model="envSetKey" placeholder="API_KEY" />
            </label>
            <label class="form-group">
              <span>Value</span>
              <input v-model="envSetValue" placeholder="" />
            </label>
            <div class="flex gap-2">
              <UiButton variant="primary" :disabled="envSaving || !trimmedText(envSetKey)" @click="saveEnv">
                {{ envSaving ? 'Saving...' : 'Save' }}
              </UiButton>
              <UiButton :disabled="envSaving" @click="envSetShow = false">Cancel</UiButton>
            </div>
          </div>

          <div v-if="envKeys.length === 0 && !envLoading" class="rounded-md border border-snow/10 bg-snow/[.03] p-4 text-sm text-slate">
            No environment variables configured.
          </div>
          <div v-for="key in envKeys" :key="key" class="flex items-center justify-between rounded-md border border-snow/10 bg-snow/[.03] px-4 py-3">
            <div class="flex items-center gap-3">
              <StatusBadge tone="info">set</StatusBadge>
              <span class="text-sm font-extrabold text-snow">{{ key }}</span>
            </div>
            <div class="flex gap-2">
              <UiButton @click="openEnvSet(key)">Edit</UiButton>
              <UiButton variant="red" :disabled="envSaving" @click="doDeleteEnv(key)">Delete</UiButton>
            </div>
          </div>
        </div>

        <div v-else class="grid grid-cols-1 gap-3">
          <div v-if="skills.length === 0" class="rounded-md border border-snow/10 bg-snow/[.03] p-4 text-sm text-slate">
            No skills found under this agent.
          </div>
          <div v-if="skillsStale" class="rounded-md border border-warning/30 bg-warning/8 px-4 py-3 text-sm text-warning">
            Skills list is currently coming from cached node data.
          </div>
          <article v-for="skill in skills" :key="skill" class="content-card">
            <StatusBadge tone="running">enabled</StatusBadge>
            <h3>{{ skill }}</h3>
            <p>Source: {{ agentHome }}/skills/{{ skill }}</p>
          </article>
        </div>
      </template>
    </section>
  </div>
</template>
