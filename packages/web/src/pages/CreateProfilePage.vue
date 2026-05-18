<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useHubStore } from '@/stores/hub'
import UiButton from '@/components/ui/UiButton.vue'
import SectionTitle from '@/components/ui/SectionTitle.vue'
import CommandBox from '@/components/ui/CommandBox.vue'

type CloneMode = 'blank' | 'clone' | 'clone-all'

const router = useRouter()
const hubStore = useHubStore()
const { profiles, isLoadingProfiles } = storeToRefs(hubStore)

const name = ref('')
const cloneMode = ref<CloneMode>('blank')
const cloneFrom = ref('')
const createAlias = ref(true)
const creating = ref(false)
const createError = ref<string | null>(null)
const createdSteps = ref<string[]>([])
const createdProfileId = ref<string | null>(null)

const canChooseCloneSource = computed(() => cloneMode.value !== 'blank')
const cloneOptions = computed(() => profiles.value.filter((p) => p.kind === 'profile').map((p) => p.name))
const submitDisabled = computed(() => {
  if (creating.value) return true
  if (!name.value.trim()) return true
  if (canChooseCloneSource.value && !cloneFrom.value) return true
  return false
})

watch(canChooseCloneSource, (enabled) => {
  if (!enabled) cloneFrom.value = ''
})

watch(cloneOptions, (options) => {
  if (!canChooseCloneSource.value) return
  if (cloneFrom.value && options.includes(cloneFrom.value)) return
  cloneFrom.value = options[0] ?? ''
})

async function createAgent(): Promise<void> {
  if (submitDisabled.value) return
  creating.value = true
  createError.value = null
  createdSteps.value = []
  createdProfileId.value = null

  const payload = {
    name: name.value.trim(),
    cloneMode: cloneMode.value,
    cloneFrom: canChooseCloneSource.value ? cloneFrom.value : undefined,
    noAlias: !createAlias.value,
  } as const

  try {
    const result = await hubStore.createAgent(payload)
    if (!result.ok) {
      createError.value = result.error ?? 'Failed to create agent'
      return
    }
    createdSteps.value = result.steps ?? []
    const created = profiles.value.find((p) => p.name === payload.name)
    createdProfileId.value = created?.id ?? null
    hubStore.showToast('Agent created', `${payload.name} is ready. Next: run setup.`)
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
      <template #subtitle>Create a profile through Hermes CLI semantics, then run setup.</template>
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
            <span>Create Mode</span>
            <select v-model="cloneMode">
              <option value="blank">Blank</option>
              <option value="clone">Clone config only (--clone)</option>
              <option value="clone-all">Clone config + sessions/memories (--clone-all)</option>
            </select>
          </label>

          <label class="form-group" :class="!canChooseCloneSource ? 'opacity-60' : ''">
            <span>Clone From</span>
            <select v-model="cloneFrom" :disabled="!canChooseCloneSource || isLoadingProfiles">
              <option v-if="cloneOptions.length === 0" value="">No profile available</option>
              <option v-for="option in cloneOptions" :key="option" :value="option">{{ option }}</option>
            </select>
          </label>

          <label class="form-group">
            <span>Alias</span>
            <select v-model="createAlias">
              <option :value="true">Create alias (recommended)</option>
              <option :value="false">No alias (--no-alias)</option>
            </select>
          </label>
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-2">
          <UiButton :disabled="submitDisabled" variant="primary" @click="createAgent">{{ creating ? 'Creating...' : 'Create Agent' }}</UiButton>
          <UiButton :disabled="!createdProfileId" @click="goToCreatedAgent">Open Agent Detail</UiButton>
          <span v-if="createError" class="text-sm text-danger">{{ createError }}</span>
          <span v-if="!createError && createdSteps.length > 0" class="text-sm text-mint">Created successfully.</span>
        </div>
      </section>

      <aside>
        <div class="note-card">
          <h4>CLI mapping</h4>
          <CommandBox>hermes profile create &lt;name&gt;</CommandBox>
          <p class="mt-2">Clone mode and alias options are translated to official Hermes CLI flags.</p>
        </div>
        <div class="note-card">
          <h4>Recommended setup</h4>
          <CommandBox>hermes -p &lt;name&gt; setup</CommandBox>
          <p class="mt-2">After setup, you can run chat/gateway with the same profile.</p>
        </div>
        <div v-if="createdSteps.length > 0" class="note-card">
          <h4>Next commands</h4>
          <CommandBox>{{ createdSteps.join('\n') }}</CommandBox>
        </div>
      </aside>
    </div>
  </div>
</template>
