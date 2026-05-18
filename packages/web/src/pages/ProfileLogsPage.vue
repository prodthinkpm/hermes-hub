<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import type { LogEntry } from '@hermes-hub/core'
import { useHubStore } from '@/stores/hub'
import UiButton from '@/components/ui/UiButton.vue'
import SectionTitle from '@/components/ui/SectionTitle.vue'
import LogConsole from '@/components/ui/LogConsole.vue'

const route = useRoute()
const router = useRouter()
const hubStore = useHubStore()
const { profiles } = storeToRefs(hubStore)
const agentLogs = ref<LogEntry[]>([])
const loading = ref(false)
const logsError = ref<string | null>(null)

const profileId = computed(() => String(route.params.id ?? ''))
const profile = computed(() => profiles.value.find((item) => item.id === profileId.value) ?? profiles.value[0] ?? null)
const agentName = computed(() => profile.value?.name ?? profileId.value)
const agentHome = computed(() => profile.value?.home ?? '(unknown home)')
const consoleTitle = computed(() => `${agentHome.value}/sessions + logs`)

async function loadAgentLogs(): Promise<void> {
  loading.value = true
  logsError.value = null
  try {
    agentLogs.value = await hubStore.fetchProfileLogs(profileId.value)
  } catch (err) {
    logsError.value = err instanceof Error ? err.message : 'Failed to load agent logs'
    agentLogs.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void hubStore.fetchProfiles()
  void loadAgentLogs()
})

watch(profileId, () => {
  void loadAgentLogs()
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
      <template #title>{{ agentName }} Logs</template>
      <template #subtitle>This page only shows logs from this agent.</template>
      <template #actions>
        <UiButton @click="router.push(`/profiles/${profileId}`)">Agent Detail</UiButton>
        <UiButton variant="primary" @click="router.push('/logs')">All Logs</UiButton>
      </template>
    </SectionTitle>

    <section class="app-panel p-5">
      <div v-if="loading" class="mb-3 text-sm text-slate">Loading logs...</div>
      <div v-else-if="logsError" class="mb-3 text-sm text-danger">{{ logsError }}</div>
      <LogConsole :logs="agentLogs" :title="consoleTitle" body-class="h-[560px]" />
    </section>
  </div>
</template>
