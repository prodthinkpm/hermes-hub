import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { HermesApiClient, type CreateProfilePayload, type LogEntry, type ProfileRow } from '@hermes-hub/core'

const api = new HermesApiClient()

export const useHubStore = defineStore('hub', () => {
  const profiles = ref<ProfileRow[]>([])
  const logs = ref<LogEntry[]>([])
  const toastVisible = ref(false)
  const toastTitle = ref('Submitted')
  const toastMessage = ref('Hermes Hub is executing your request.')
  const isLoadingProfiles = ref(false)
  const isLoadingLogs = ref(false)
  const profilesError = ref<string | null>(null)
  const logsError = ref<string | null>(null)
  const hubStatus = ref('running')
  const hubVersion = ref('--')

  let toastTimer: number | undefined

  const selectedCount = computed(() => profiles.value.filter((profile) => profile.checked).length)

  function showToast(title: string, message: string): void {
    toastTitle.value = title
    toastMessage.value = message
    toastVisible.value = true
    if (toastTimer) window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => {
      toastVisible.value = false
    }, 2500)
  }

  async function fetchProfiles(): Promise<void> {
    isLoadingProfiles.value = true
    profilesError.value = null

    const previousChecked = new Map(profiles.value.map((profile) => [profile.id, profile.checked]))
    const result = await api.listProfiles()

    if (result.ok && result.data) {
      profiles.value = result.data.map((profile) => ({
        ...profile,
        checked: previousChecked.get(profile.id) ?? false,
      }))
    } else {
      profilesError.value = result.error ?? 'Failed to fetch agents'
      profiles.value = []
    }

    isLoadingProfiles.value = false
  }

  async function fetchProfile(id: string): Promise<ProfileRow | null> {
    const result = await api.getProfile(id)
    if (!result.ok || !result.data) return null
    return result.data
  }

  async function createAgent(payload: CreateProfilePayload): Promise<{ ok: boolean; error?: string; steps?: string[] }> {
    const result = await api.createProfile(payload)
    if (!result.ok || !result.data) {
      return { ok: false, error: result.error ?? 'Failed to create agent' }
    }
    await fetchProfiles()
    return { ok: true, steps: result.data.nextSteps }
  }

  async function renameAgent(id: string, name: string): Promise<{ ok: boolean; error?: string }> {
    const result = await api.renameProfile(id, name)
    if (!result.ok) return { ok: false, error: result.error ?? 'Failed to rename agent' }
    await fetchProfiles()
    return { ok: true }
  }

  async function deleteAgent(id: string): Promise<{ ok: boolean; error?: string }> {
    const result = await api.deleteProfile(id)
    if (!result.ok) return { ok: false, error: result.error ?? 'Failed to delete agent' }
    await fetchProfiles()
    return { ok: true }
  }

  async function fetchProfileConfig(id: string): Promise<string> {
    const result = await api.getProfileConfig(id)
    if (!result.ok || result.data === undefined) return ''
    return result.data
  }

  async function saveProfileConfig(id: string, content: string): Promise<{ ok: boolean; error?: string }> {
    const result = await api.updateProfileConfig(id, content)
    if (!result.ok) return { ok: false, error: result.error ?? 'Failed to save config.yaml' }
    return { ok: true }
  }

  async function fetchProfileSoul(id: string): Promise<string> {
    const result = await api.getProfileSoul(id)
    if (!result.ok || result.data === undefined) return ''
    return result.data
  }

  async function saveProfileSoul(id: string, content: string): Promise<{ ok: boolean; error?: string }> {
    const result = await api.updateProfileSoul(id, content)
    if (!result.ok) return { ok: false, error: result.error ?? 'Failed to save SOUL.md' }
    return { ok: true }
  }

  async function fetchProfileSkills(id: string): Promise<string[]> {
    const result = await api.getProfileSkills(id)
    if (!result.ok || !result.data) return []
    return result.data
  }

  async function fetchLogs(): Promise<void> {
    isLoadingLogs.value = true
    logsError.value = null

    const result = await api.listLogs()
    if (result.ok && result.data) {
      logs.value = result.data
    } else {
      logsError.value = result.error ?? 'Failed to fetch logs'
      logs.value = []
    }

    isLoadingLogs.value = false
  }

  async function fetchProfileLogs(id: string): Promise<LogEntry[]> {
    const result = await api.listProfileLogs(id)
    if (!result.ok || !result.data) return []
    return result.data
  }

  function runDoctor(): void {
    showToast('Doctor queued', `Doctor checks queued for ${selectedCount.value || 'all'} agents.`)
  }

  function startAllGateways(): void {
    showToast('Start queued', 'Gateway/API start queued for the selected agents.')
  }

  function createProfile(): void {
    showToast('Create Agent', 'Open the create page to configure and create a new agent.')
  }

  function toggleAllProfiles(checked: boolean): void {
    profiles.value.forEach((profile) => {
      profile.checked = checked
    })
  }

  function disposeToastTimer(): void {
    if (toastTimer) window.clearTimeout(toastTimer)
  }

  return {
    profiles,
    logs,
    toastVisible,
    toastTitle,
    toastMessage,
    isLoadingProfiles,
    isLoadingLogs,
    profilesError,
    logsError,
    selectedCount,
    hubStatus,
    hubVersion,
    showToast,
    fetchProfiles,
    fetchProfile,
    createAgent,
    renameAgent,
    deleteAgent,
    fetchProfileConfig,
    saveProfileConfig,
    fetchProfileSoul,
    saveProfileSoul,
    fetchProfileSkills,
    fetchLogs,
    fetchProfileLogs,
    runDoctor,
    startAllGateways,
    createProfile,
    toggleAllProfiles,
    disposeToastTimer,
  }
})
