import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { HermesApiClient, type CreateProfilePayload, type HubNode, type LogEntry, type ManagedAgent, type ProfileRow } from '@hermes-hub/core'

const api = new HermesApiClient()

export const useHubStore = defineStore('hub', () => {
  const profiles = ref<ProfileRow[]>([])
  const nodes = ref<HubNode[]>([])
  const agents = ref<ManagedAgent[]>([])
  const logs = ref<LogEntry[]>([])
  const toastVisible = ref(false)
  const toastTitle = ref('Submitted')
  const toastMessage = ref('Hermes Hub is executing your request.')
  const isLoadingProfiles = ref(false)
  const isLoadingLogs = ref(false)
  const profilesError = ref<string | null>(null)
  const nodesError = ref<string | null>(null)
  const logsError = ref<string | null>(null)
  const hubStatus = ref('running')
  const hubVersion = ref('--')
  const registrationToken = ref('')

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

  async function fetchServerInfo(): Promise<void> {
    try {
      const res = await fetch('/api/health')
      if (res.ok) {
        const body = await res.json()
        if (body?.ok && body?.data) {
          hubStatus.value = body.data.status ?? 'running'
          hubVersion.value = body.data.version ?? '--'
        }
      }
    } catch {
      // Server unreachable, keep defaults
    }
  }

  async function fetchProfiles(): Promise<void> {
    isLoadingProfiles.value = true
    profilesError.value = null
    void fetchServerInfo()

    const previousChecked = new Map(profiles.value.map((profile) => [profile.id, profile.checked]))
    const [agentResult, nodeResult] = await Promise.all([api.listAgents(), api.listNodes()])

    if (nodeResult.ok && nodeResult.data) {
      nodes.value = nodeResult.data
      nodesError.value = null
    } else {
      nodes.value = []
      nodesError.value = nodeResult.error ?? 'Failed to fetch nodes'
    }

    if (agentResult.ok && agentResult.data) {
      agents.value = agentResult.data
      profiles.value = agentResult.data.map((agent) => api.agentToProfileRow(agent)).map((profile) => ({
        ...profile,
        checked: previousChecked.get(profile.id) ?? false,
      }))
    } else {
      agents.value = []
      profilesError.value = agentResult.error ?? 'Failed to fetch agents'
      profiles.value = []
    }

    isLoadingProfiles.value = false
  }

  async function fetchProfile(id: string): Promise<ProfileRow | null> {
    const result = await api.getProfile(id)
    if (!result.ok || !result.data) return null
    return result.data
  }

  async function createAgent(payload: CreateProfilePayload): Promise<{ ok: boolean; error?: string; steps?: string[]; commandId?: string }> {
    const result = await api.createProfile(payload)
    if (!result.ok || !result.data) {
      return { ok: false, error: result.error ?? 'Failed to queue create command' }
    }
    const commandId = result.data.commandId
    // 等待 Hub Agent 执行完成后检查命令结果
    const finalCmd = await api.waitForCommand(commandId)
    if (finalCmd.ok && finalCmd.data) {
      if (finalCmd.data.status === 'failed') {
        return { ok: false, error: finalCmd.data.stderr || finalCmd.data.error || 'Create command failed' }
      }
      if (finalCmd.data.status === 'timeout') {
        return { ok: false, error: finalCmd.data.error || 'Create command timed out' }
      }
    }
    await fetchProfiles()
    return { ok: true, steps: result.data.nextSteps, commandId }
  }

  async function renameAgent(id: string, name: string): Promise<{ ok: boolean; error?: string; commandId?: string }> {
    const result = await api.renameProfile(id, name)
    if (!result.ok) return { ok: false, error: result.error ?? 'Failed to queue rename command' }
    const commandId = result.data?.commandId
    if (!commandId) return { ok: false, error: 'No command ID returned' }
    // 等待 Hub Agent 执行完成后检查命令结果
    const finalCmd = await api.waitForCommand(commandId)
    if (finalCmd.ok && finalCmd.data) {
      if (finalCmd.data.status === 'failed') {
        return { ok: false, error: finalCmd.data.stderr || finalCmd.data.error || 'Rename command failed' }
      }
      if (finalCmd.data.status === 'timeout') {
        return { ok: false, error: finalCmd.data.error || 'Rename command timed out' }
      }
    }
    await fetchProfiles()
    return { ok: true, commandId }
  }

  async function deleteAgent(id: string): Promise<{ ok: boolean; error?: string }> {
    const result = await api.deleteProfile(id)
    if (!result.ok) return { ok: false, error: result.error ?? 'Failed to queue delete command' }
    const commandId = result.data?.commandId
    if (commandId) {
      // 等待 Hub Agent 执行完成后检查命令结果
      const finalCmd = await api.waitForCommand(commandId)
      if (finalCmd.ok && finalCmd.data) {
        if (finalCmd.data.status === 'failed') {
          return { ok: false, error: finalCmd.data.stderr || finalCmd.data.error || 'Delete command failed' }
        }
        if (finalCmd.data.status === 'timeout') {
          return { ok: false, error: finalCmd.data.error || 'Delete command timed out' }
        }
      }
    }
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

  // Env 管理（Phase 6）
  async function fetchEnvStatus(id: string): Promise<string[]> {
    const result = await api.getEnvStatus(id)
    if (!result.ok || !result.data) return []
    return result.data
  }

  async function setEnv(id: string, key: string, value: string): Promise<{ ok: boolean; error?: string }> {
    const result = await api.setEnv(id, key, value)
    if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Failed to queue env.set' }
    const final = await api.waitForCommand(result.data.id)
    if (final.ok && final.data) {
      if (final.data.status === 'failed') return { ok: false, error: final.data.stderr || final.data.error || 'env.set failed' }
      if (final.data.status === 'timeout') return { ok: false, error: final.data.error || 'env.set timed out' }
    }
    await fetchProfiles()
    return { ok: true }
  }

  async function deleteEnv(id: string, key: string): Promise<{ ok: boolean; error?: string }> {
    const result = await api.deleteEnv(id, key)
    if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Failed to queue env.delete' }
    const final = await api.waitForCommand(result.data.id)
    if (final.ok && final.data) {
      if (final.data.status === 'failed') return { ok: false, error: final.data.stderr || final.data.error || 'env.delete failed' }
      if (final.data.status === 'timeout') return { ok: false, error: final.data.error || 'env.delete timed out' }
    }
    await fetchProfiles()
    return { ok: true }
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

  // Node management (Phase 8)
  async function fetchNode(id: string): Promise<HubNode | null> {
    const result = await api.getNode(id)
    if (!result.ok || !result.data) return null
    return result.data
  }

  async function updateNode(id: string, fields: Partial<Pick<HubNode, 'name' | 'status' | 'tags'>>): Promise<{ ok: boolean; error?: string }> {
    const result = await api.updateNode(id, fields)
    if (!result.ok) return { ok: false, error: result.error ?? 'Failed to update node' }
    await fetchProfiles()
    return { ok: true }
  }

  async function deleteNode(id: string): Promise<{ ok: boolean; error?: string }> {
    const result = await api.deleteNode(id)
    if (!result.ok) return { ok: false, error: result.error ?? 'Failed to delete node' }
    await fetchProfiles()
    return { ok: true }
  }

  async function createNode(name?: string): Promise<{ ok: boolean; error?: string; node?: HubNode; vkey?: string; command?: string }> {
    const result = await api.createNode(name)
    if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Failed to create node' }
    await fetchProfiles()
    return { ok: true, node: result.data.node, vkey: result.data.vkey, command: result.data.command }
  }

  async function fetchNodeVkey(nodeId: string): Promise<{ vkey: string; command: string } | null> {
    const result = await api.getNodeVkey(nodeId)
    if (!result.ok || !result.data) return null
    return result.data
  }

  async function fetchRegistrationToken(): Promise<void> {
    const result = await api.getRegistrationToken()
    if (result.ok && result.data) {
      registrationToken.value = result.data.token
    }
  }

  // 单 agent gateway 操作
  async function startGateway(id: string): Promise<{ ok: boolean; error?: string }> {
    const result = await api.startGateway(id)
    if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Failed to queue gateway start' }
    const finalCmd = await api.waitForCommand(result.data.id)
    if (finalCmd.ok && finalCmd.data) {
      if (finalCmd.data.status === 'failed') return { ok: false, error: finalCmd.data.stderr || finalCmd.data.error || 'Gateway start failed' }
      if (finalCmd.data.status === 'timeout') return { ok: false, error: finalCmd.data.error || 'Gateway start timed out' }
    }
    await fetchProfiles()
    return { ok: true }
  }

  async function stopGateway(id: string): Promise<{ ok: boolean; error?: string }> {
    const result = await api.stopGateway(id)
    if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Failed to queue gateway stop' }
    const finalCmd = await api.waitForCommand(result.data.id)
    if (finalCmd.ok && finalCmd.data) {
      if (finalCmd.data.status === 'failed') return { ok: false, error: finalCmd.data.stderr || finalCmd.data.error || 'Gateway stop failed' }
      if (finalCmd.data.status === 'timeout') return { ok: false, error: finalCmd.data.error || 'Gateway stop timed out' }
    }
    await fetchProfiles()
    return { ok: true }
  }

  async function restartGateway(id: string): Promise<{ ok: boolean; error?: string }> {
    const result = await api.restartGateway(id)
    if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Failed to queue gateway restart' }
    const finalCmd = await api.waitForCommand(result.data.id)
    if (finalCmd.ok && finalCmd.data) {
      if (finalCmd.data.status === 'failed') return { ok: false, error: finalCmd.data.stderr || finalCmd.data.error || 'Gateway restart failed' }
      if (finalCmd.data.status === 'timeout') return { ok: false, error: finalCmd.data.error || 'Gateway restart timed out' }
    }
    await fetchProfiles()
    return { ok: true }
  }

  // Setup / Doctor
  async function runSetup(id: string, section: string = 'all'): Promise<{ ok: boolean; error?: string }> {
    const result = await api.runSetup(id, section)
    if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Failed to queue setup' }
    const finalCmd = await api.waitForCommand(result.data.id, 600_000)  // setup 可能耗时较长，最多等 10 分钟
    if (finalCmd.ok && finalCmd.data) {
      if (finalCmd.data.status === 'failed') return { ok: false, error: finalCmd.data.stderr || finalCmd.data.error || 'Setup failed' }
      if (finalCmd.data.status === 'timeout') return { ok: false, error: finalCmd.data.error || 'Setup timed out' }
    }
    await fetchProfiles()
    return { ok: true }
  }

  async function runDoctor(id: string): Promise<{ ok: boolean; error?: string }> {
    const result = await api.runDoctor(id)
    if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Failed to queue doctor' }
    const finalCmd = await api.waitForCommand(result.data.id)
    if (finalCmd.ok && finalCmd.data) {
      if (finalCmd.data.status === 'failed') return { ok: false, error: finalCmd.data.stderr || finalCmd.data.error || 'Doctor failed' }
      if (finalCmd.data.status === 'timeout') return { ok: false, error: finalCmd.data.error || 'Doctor timed out' }
    }
    await fetchProfiles()
    return { ok: true }
  }

  // 批量 gateway 操作（作用于选中的 agents）
  async function batchStartGateways(): Promise<void> {
    const targets = profiles.value.filter((p) => p.checked)
    if (targets.length === 0) { showToast('No selection', 'Select agents first.'); return }
    let okCount = 0
    for (const profile of targets) {
      const res = await startGateway(profile.id)
      if (res.ok) okCount++
    }
    showToast('Batch Start', `${okCount}/${targets.length} gateway starts queued.`)
  }

  async function batchStopGateways(): Promise<void> {
    const targets = profiles.value.filter((p) => p.checked)
    if (targets.length === 0) { showToast('No selection', 'Select agents first.'); return }
    let okCount = 0
    for (const profile of targets) {
      const res = await stopGateway(profile.id)
      if (res.ok) okCount++
    }
    showToast('Batch Stop', `${okCount}/${targets.length} gateway stops queued.`)
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
    nodes,
    agents,
    logs,
    toastVisible,
    toastTitle,
    toastMessage,
    isLoadingProfiles,
    isLoadingLogs,
    profilesError,
    nodesError,
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
    // Node management
    registrationToken,
    fetchNode,
    updateNode,
    deleteNode,
    createNode,
    fetchNodeVkey,
    fetchRegistrationToken,
    // Gateway
    startGateway,
    stopGateway,
    restartGateway,
    batchStartGateways,
    batchStopGateways,
    // Env
    fetchEnvStatus,
    setEnv,
    deleteEnv,
    // Setup / Doctor
    runSetup,
    runDoctor,
    createProfile,
    toggleAllProfiles,
    disposeToastTimer,
  }
})
