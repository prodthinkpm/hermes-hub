<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useHubStore } from '@/stores/hub'
import UiButton from '@/components/ui/UiButton.vue'
import SectionTitle from '@/components/ui/SectionTitle.vue'
import CommandBox from '@/components/ui/CommandBox.vue'

type CloneMode = 'blank' | 'clone' | 'clone-all'

interface CloneOption {
  id: string
  label: string
  nodeId: string
}

const router = useRouter()
const hubStore = useHubStore()
const { profiles, nodes, isLoadingProfiles } = storeToRefs(hubStore)

const name = ref('')
const nodeId = ref('')
const cloneMode = ref<CloneMode>('blank')
const cloneFromAgentId = ref('')
const createAlias = ref(true)
const creating = ref(false)
const createError = ref<string | null>(null)
const createdProfileId = ref<string | null>(null)

const canChooseCloneSource = computed(() => cloneMode.value !== 'blank')
const cloneOptions = computed<CloneOption[]>(() =>
  profiles.value.map((profile) => ({
    id: profile.id,
    label: `${profile.nodeLabel} / ${profile.name}`,
    nodeId: profile.nodeId,
  })),
)
const selectedCloneOption = computed(() => cloneOptions.value.find((option) => option.id === cloneFromAgentId.value) ?? null)
const hasMultipleNodes = computed(() => nodes.value.length > 1)
const nodeMismatchError = computed(() => {
  if (!canChooseCloneSource.value || !selectedCloneOption.value || !nodeId.value) return ''
  if (selectedCloneOption.value.nodeId === nodeId.value) return ''
  return 'Clone source must be on the same node as the new agent.'
})
const submitDisabled = computed(() => {
  if (creating.value) return true
  if (!name.value.trim()) return true
  if (!nodeId.value.trim()) return true
  if (canChooseCloneSource.value && !cloneFromAgentId.value) return true
  if (Boolean(nodeMismatchError.value)) return true
  return false
})

watch(
  nodes,
  (items) => {
    if (items.length === 1) {
      nodeId.value = items[0]?.id ?? ''
      return
    }
    if (nodeId.value && items.some((item) => item.id === nodeId.value)) return
    nodeId.value = ''
  },
  { immediate: true },
)

watch(canChooseCloneSource, (enabled) => {
  if (!enabled) cloneFromAgentId.value = ''
})

watch([cloneOptions, nodeId, canChooseCloneSource], ([options, nextNodeId, enabled]) => {
  if (!enabled) return
  if (cloneFromAgentId.value && options.some((option) => option.id === cloneFromAgentId.value && (!nextNodeId || option.nodeId === nextNodeId))) {
    return
  }
  const preferred = nextNodeId ? options.find((option) => option.nodeId === nextNodeId) : undefined
  cloneFromAgentId.value = preferred?.id ?? options[0]?.id ?? ''
})

async function createAgent(): Promise<void> {
  if (submitDisabled.value) return
  creating.value = true
  createError.value = null
  createdProfileId.value = null

  const payload = {
    name: name.value.trim(),
    nodeId: nodeId.value.trim(),
    cloneMode: cloneMode.value,
    cloneFrom: canChooseCloneSource.value ? cloneFromAgentId.value : undefined,
    noAlias: !createAlias.value,
  } as const

  try {
    const result = await hubStore.createAgent(payload)
    if (!result.ok) {
      createError.value = result.error ?? 'Failed to create agent'
      return
    }
    const created = profiles.value.find((profile) => profile.name === payload.name && profile.nodeId === payload.nodeId)
    createdProfileId.value = result.agentId ?? created?.id ?? null
    if (!createdProfileId.value) {
      createError.value = 'Create succeeded, but could not resolve the new agent ID.'
      return
    }
    hubStore.showToast('Create success', `${payload.name} created. Continue with setup.`)
    void router.push({
      name: 'profileSetup',
      params: { id: createdProfileId.value },
      query: { mode: 'create_flow' },
    })
  } finally {
    creating.value = false
  }
}

function goToCreatedAgent(): void {
  if (!createdProfileId.value) return
  void router.push(`/profiles/${createdProfileId.value}`)
}

onMounted(() => {
  void hubStore.fetchProfiles()
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
      <template #title>Create Hermes Agent</template>
      <template #subtitle>Create the profile first, then continue in the dedicated setup form.</template>
      <template #actions>
        <UiButton :disabled="submitDisabled" variant="primary" @click="createAgent">
          {{ creating ? 'Creating...' : 'Create Agent' }}
        </UiButton>
      </template>
    </SectionTitle>

    <div class="grid grid-cols-[1fr_420px] gap-5 max-[1180px]:grid-cols-1">
      <section class="app-panel p-5">
        <div class="grid grid-cols-2 gap-3.5 max-[760px]:grid-cols-1">
          <label class="form-group">
            <span>Agent Name</span>
            <input v-model="name" placeholder="writer" />
            <small>Allowed: letters, numbers, hyphen, underscore.</small>
          </label>

          <label class="form-group">
            <span>Node</span>
            <select v-model="nodeId" :disabled="nodes.length <= 1">
              <option value="" :disabled="hasMultipleNodes">Select a node</option>
              <option v-for="node in nodes" :key="node.id" :value="node.id">
                {{ node.name }} ({{ node.id }})
              </option>
            </select>
            <small v-if="nodes.length === 1">Single node detected. Auto-selected.</small>
            <small v-else-if="hasMultipleNodes">Choose the node that should host the new agent.</small>
          </label>

          <label class="form-group">
            <span>Create Mode</span>
            <select v-model="cloneMode">
              <option value="blank">Blank</option>
              <option value="clone">Clone config only (--clone)</option>
              <option value="clone-all">Clone config + sessions/memories (--clone-all)</option>
            </select>
          </label>

          <label class="form-group" :class="!canChooseCloneSource ? 'opacity-60' : ''">
            <span>Clone From</span>
            <select v-model="cloneFromAgentId" :disabled="!canChooseCloneSource || isLoadingProfiles">
              <option v-if="cloneOptions.length === 0" value="">No agent available</option>
              <option v-for="option in cloneOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
            </select>
            <small>Choose the exact agent instance to clone from, including default agents.</small>
          </label>

          <label class="form-group">
            <span>Alias</span>
            <select v-model="createAlias">
              <option :value="true">Create alias (recommended)</option>
              <option :value="false">No alias (--no-alias)</option>
            </select>
          </label>
        </div>

        <div v-if="nodeMismatchError" class="mt-4 rounded-md border border-warning/30 bg-warning/8 px-4 py-3 text-sm text-warning">
          {{ nodeMismatchError }}
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-2">
          <UiButton :disabled="submitDisabled" variant="primary" @click="createAgent">{{ creating ? 'Creating...' : 'Create Agent' }}</UiButton>
          <UiButton :disabled="!createdProfileId" @click="goToCreatedAgent">Open Agent Detail</UiButton>
          <span v-if="createError" class="text-sm text-danger">{{ createError }}</span>
          <span v-if="!createError && createdProfileId" class="text-sm text-mint">Profile created.</span>
        </div>
      </section>

      <aside>
        <div class="note-card">
          <h4>CLI mapping</h4>
          <CommandBox>hermes profile create &lt;name&gt;</CommandBox>
          <p class="mt-2">Node selection targets the exact Hub Agent that will run this create command.</p>
        </div>
        <div class="note-card">
          <h4>Next step</h4>
          <CommandBox>profile.create -&gt; profile.setup</CommandBox>
          <p class="mt-2">After create succeeds, Hermes Hub will move into the setup form instead of jumping straight into execution.</p>
        </div>
      </aside>
    </div>
  </div>
</template>
