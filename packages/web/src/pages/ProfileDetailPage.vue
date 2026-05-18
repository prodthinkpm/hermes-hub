<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useHubStore } from '@/stores/hub'
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
] as const

type TabKey = (typeof tabs)[number]['key']
type SaveState = 'idle' | 'saved' | 'error'
type ConfigViewMode = 'form' | 'raw'

const activeTab = ref<TabKey>('config')
const loading = ref(false)
const loadError = ref<string | null>(null)
const skills = ref<string[]>([])

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

const profileId = computed(() => String(route.params.id ?? ''))
const profile = computed(() => profiles.value.find((item) => item.id === profileId.value) ?? null)
const agentName = computed(() => profile.value?.name ?? profileId.value)
const agentHome = computed(() => profile.value?.home ?? '(unknown home)')

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

    const [configText, soulText, profileSkills] = await Promise.all([
      hubStore.fetchProfileConfig(profileId.value),
      hubStore.fetchProfileSoul(profileId.value),
      hubStore.fetchProfileSkills(profileId.value),
    ])

    const parsedConfig = extractEditableProfileConfig(configText)
    configLoadedText.value = configText
    configLoadedForm.value = cloneEditableConfig(parsedConfig)
    configForm.value = cloneEditableConfig(parsedConfig)

    soulLoadedText.value = soulText
    soulDraft.value = soulText
    skills.value = profileSkills
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Failed to load agent details'
    configLoadedText.value = ''
    configLoadedForm.value = cloneEditableConfig(EMPTY_EDITABLE_PROFILE_CONFIG)
    configForm.value = cloneEditableConfig(EMPTY_EDITABLE_PROFILE_CONFIG)
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
        </div>
      </template>
      <template #actions>
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
              <input v-model="configForm.modelProvider" placeholder="deepseek" />
            </label>
            <label class="form-group">
              <span>Model Default</span>
              <input v-model="configForm.modelDefault" placeholder="deepseek-v4-flash" />
            </label>
            <label class="form-group">
              <span>Model Base URL</span>
              <input v-model="configForm.modelBaseUrl" placeholder="https://api.deepseek.com/v1" />
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

          <div v-else class="yaml-box">
            <span class="text-mint"># {{ agentHome }}/config.yaml</span>
            {{ configLoadedText || '\n# config.yaml not found' }}
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <span v-if="isConfigDirty" class="text-xs text-warning">Unsaved changes</span>
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
            <span v-if="soulSaveState === 'saved'" class="text-xs text-mint">Saved</span>
            <span v-if="soulSaveState === 'error'" class="text-xs text-danger">Save failed: {{ soulSaveError }}</span>
          </div>
        </div>

        <div v-else class="grid grid-cols-1 gap-3">
          <div v-if="skills.length === 0" class="rounded-md border border-snow/10 bg-snow/[.03] p-4 text-sm text-slate">
            No skills found under this agent.
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
