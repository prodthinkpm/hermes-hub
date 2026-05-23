<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useHubStore } from '@/stores/hub'
import UiButton from '@/components/ui/UiButton.vue'
import SectionTitle from '@/components/ui/SectionTitle.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import type { HubCommand } from '@hermes-hub/core'
import {
  SETUP_STEP_ORDER,
  type SetupRunPayload,
  type SetupRunResult,
  type SetupStep,
  type SetupStepResult,
} from '@hermes-hub/core'
import { deleteSetupDraft, loadSetupDraft } from '@/utils/setupDraft'

const route = useRoute()
const router = useRouter()
const hubStore = useHubStore()

const commandId = ref<string>('')
const activeCommand = ref<HubCommand | null>(null)
const launching = ref(false)
const waiting = ref(false)
const pageError = ref<string | null>(null)
const redirected = ref(false)

const agentId = computed(() => String(route.params.id ?? ''))
const allSteps = SETUP_STEP_ORDER

const setupResult = computed<SetupRunResult | null>(() => {
  const value = activeCommand.value?.result
  if (!value || typeof value !== 'object') return null
  const maybe = value as Partial<SetupRunResult>
  if (!Array.isArray(maybe.step_results)) return null
  return maybe as SetupRunResult
})

const failedStep = computed<SetupStep | null>(() => {
  const failed = setupResult.value?.step_results?.find((item) => item.status === 'failed')
  return failed?.step ?? null
})

const isTerminal = computed(() => {
  const status = activeCommand.value?.status
  return status === 'success' || status === 'failed' || status === 'timeout' || status === 'cancelled'
})

function setupPayloadFromQuery(): SetupRunPayload {
  const draftId = typeof route.query.draft === 'string' ? route.query.draft : ''
  if (draftId) {
    const storedDraft = loadSetupDraft(draftId)
    if (storedDraft) return storedDraft
  }
  const provider = typeof route.query.provider === 'string' ? route.query.provider.trim() : ''
  const terminalCwd = typeof route.query.terminal_cwd === 'string' ? route.query.terminal_cwd.trim() : ''
  const gatewayEndpoint = typeof route.query.gateway_endpoint === 'string' ? route.query.gateway_endpoint.trim() : ''
  const toolsAllowCsv = typeof route.query.tools_allow === 'string' ? route.query.tools_allow.trim() : ''
  const reasoningEffort = typeof route.query.reasoning_effort === 'string' ? route.query.reasoning_effort.trim() : ''
  const approvalsMode = typeof route.query.approvals_mode === 'string' ? route.query.approvals_mode.trim() : ''
  const message = typeof route.query.message === 'string' ? route.query.message : ''

  const toolsAllow = toolsAllowCsv
    ? toolsAllowCsv.split(',').map((item) => item.trim()).filter(Boolean)
    : []

  return {
    mode: route.query.mode === 'repair' ? 'repair' : 'create_flow',
    inputs: {
      ...(provider ? { provider } : {}),
      ...(terminalCwd ? { terminal: { cwd: terminalCwd } } : {}),
      ...(gatewayEndpoint ? { gateway: { endpoint: gatewayEndpoint } } : {}),
      ...(toolsAllow.length > 0 ? { tools: { allow: toolsAllow } } : {}),
      ...(reasoningEffort || approvalsMode || message
        ? {
            agent_behavior: {
              ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
              ...(approvalsMode ? { approvals_mode: approvalsMode } : {}),
              ...(message ? { message } : {}),
            },
          }
        : {}),
    },
  }
}

function stepByName(step: SetupStep): SetupStepResult | undefined {
  return setupResult.value?.step_results?.find((item) => item.step === step)
}

function stepStatus(step: SetupStep): 'pending' | 'running' | 'success' | 'failed' | 'skipped' {
  return stepByName(step)?.status ?? 'pending'
}

function stepTone(step: SetupStep): 'running' | 'stopped' | 'warn' | 'bad' | 'info' | 'purple' {
  const status = stepStatus(step)
  if (status === 'success') return 'running'
  if (status === 'failed') return 'bad'
  if (status === 'running') return 'warn'
  if (status === 'skipped') return 'stopped'
  return 'info'
}

function fmtDuration(step: SetupStep): string {
  const value = stepByName(step)?.duration_ms
  if (!value) return '--'
  return `${Math.round(value)} ms`
}

async function watchCommand(id: string): Promise<void> {
  waiting.value = true
  pageError.value = null
  commandId.value = id
  const result = await hubStore.waitForCommandWithUpdates(id, 600_000, (command) => {
    activeCommand.value = command
  })
  waiting.value = false
  if (!result.ok) {
    pageError.value = result.error ?? 'Command watch failed'
    return
  }
  activeCommand.value = result.command ?? null
  if (activeCommand.value?.status === 'success') {
    const draftId = typeof route.query.draft === 'string' ? route.query.draft : ''
    if (draftId) deleteSetupDraft(draftId)
    await hubStore.fetchProfiles()
    if (!redirected.value) {
      redirected.value = true
      window.setTimeout(() => {
        void router.replace(`/profiles/${agentId.value}`)
      }, 1200)
    }
  }
}

async function startSetup(payload: SetupRunPayload): Promise<void> {
  launching.value = true
  pageError.value = null
  const queued = await hubStore.queueSetup(agentId.value, payload)
  launching.value = false
  if (!queued.ok || !queued.commandId) {
    pageError.value = queued.error ?? 'Failed to queue setup'
    return
  }
  void router.replace({
    name: 'profileSetupProgress',
    params: { id: agentId.value },
    query: { ...route.query, cmd: queued.commandId },
  })
  await watchCommand(queued.commandId)
}

async function retryFromFailure(): Promise<void> {
  const step = failedStep.value
  if (!step) return
  const payload = setupPayloadFromQuery()
  payload.mode = 'repair'
  payload.resume_from_step = step
  await startSetup(payload)
}

async function rerunAll(): Promise<void> {
  const payload = setupPayloadFromQuery()
  payload.mode = 'repair'
  delete payload.resume_from_step
  await startSetup(payload)
}

onMounted(async () => {
  await hubStore.fetchProfiles()
  const existingCommandId = typeof route.query.cmd === 'string' ? route.query.cmd : ''
  if (existingCommandId) {
    await watchCommand(existingCommandId)
    return
  }
  await startSetup(setupPayloadFromQuery())
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
      <template #title>Setup Progress: {{ agentId }}</template>
      <template #subtitle>
        <div class="flex flex-wrap items-center gap-2">
          <StatusBadge tone="info">Command: {{ commandId || '--' }}</StatusBadge>
          <StatusBadge :tone="activeCommand?.status === 'failed' ? 'bad' : activeCommand?.status === 'success' ? 'running' : 'warn'">
            {{ activeCommand?.status ?? 'pending' }}
          </StatusBadge>
        </div>
      </template>
      <template #actions>
        <UiButton :disabled="launching || waiting || !failedStep" variant="primary" @click="retryFromFailure">Retry Failed Step</UiButton>
        <UiButton :disabled="launching || waiting" @click="rerunAll">Run From Start</UiButton>
      </template>
    </SectionTitle>

    <section class="app-panel p-5">
      <div v-if="pageError" class="mb-3 rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
        {{ pageError }}
      </div>
      <div v-if="activeCommand?.status === 'success'" class="mb-3 rounded-md border border-signal/30 bg-signal/8 px-4 py-3 text-sm text-signal">
        Setup finished successfully. Redirecting to detail page...
      </div>

      <div class="grid grid-cols-1 gap-3">
        <div
          v-for="(step, index) in allSteps"
          :key="step"
          class="rounded-md border border-snow/10 bg-snow/[.03] px-4 py-3"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <StatusBadge :tone="stepTone(step)">{{ stepStatus(step) }}</StatusBadge>
              <span class="text-sm font-extrabold text-snow">{{ index + 1 }}. {{ step }}</span>
            </div>
            <span class="text-xs text-slate">{{ fmtDuration(step) }}</span>
          </div>
          <p class="mt-2 text-xs text-slate">{{ stepByName(step)?.summary || 'Waiting for execution...' }}</p>
          <p v-if="stepByName(step)?.stderr_ref" class="mt-1 text-xs text-warning">stderr: {{ stepByName(step)?.stderr_ref }}</p>
        </div>
      </div>
    </section>
  </div>
</template>
