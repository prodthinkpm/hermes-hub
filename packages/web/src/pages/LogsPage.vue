<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useHubStore } from '@/stores/hub'
import UiButton from '@/components/ui/UiButton.vue'
import SectionTitle from '@/components/ui/SectionTitle.vue'
import LogConsole from '@/components/ui/LogConsole.vue'

const route = useRoute()
const hubStore = useHubStore()
const { profiles, logs, isLoadingLogs, logsError } = storeToRefs(hubStore)
const selectedProfile = ref(String(route.query.profile ?? 'all'))

watch(
  () => route.query.profile,
  (profile) => {
    selectedProfile.value = String(profile ?? 'all')
  },
)

const filteredLogs = computed(() => {
  if (selectedProfile.value === 'all') return logs.value
  if (selectedProfile.value === 'hub') return logs.value.filter((log) => log.source.includes('[hub]'))
  return logs.value.filter((log) => log.source.includes(`[${selectedProfile.value}`))
})

const consoleTitle = computed(() => {
  if (selectedProfile.value === 'all') return 'all scanned agents + hub runtime'
  if (selectedProfile.value === 'hub') return 'hub runtime events'
  const selected = profiles.value.find((profile) => profile.id === selectedProfile.value)
  return selected ? `${selected.home}/sessions + logs` : 'agent logs'
})

onMounted(() => {
  void Promise.all([hubStore.fetchProfiles(), hubStore.fetchLogs()])
})
</script>

<template>
  <div class="p-7 max-[760px]:p-[18px]">
    <SectionTitle>
      <template #title>Logs</template>
      <template #subtitle>默认显示所有 Agents + Hub runtime 的聚合日志；可按单个 Agent 过滤。</template>
      <template #actions>
        <div class="flex items-center gap-2.5 whitespace-nowrap">
          <select v-model="selectedProfile" class="h-10 min-w-[220px] rounded-md border border-snow/10 bg-snow/[.055] px-3 text-snow outline-none focus:border-signal/50">
            <option value="all">All Agents + Hub</option>
            <option value="hub">Hub runtime only</option>
            <option v-for="profile in profiles" :key="profile.id" :value="profile.id">{{ profile.name }}</option>
          </select>
          <UiButton>暂停滚动</UiButton>
        </div>
      </template>
    </SectionTitle>

    <section class="app-panel p-5">
      <div v-if="isLoadingLogs" class="mb-3 text-sm text-slate">正在加载日志...</div>
      <div v-else-if="logsError" class="mb-3 text-sm text-danger">{{ logsError }}</div>
      <LogConsole :logs="filteredLogs" :title="consoleTitle" body-class="h-[560px]" />
    </section>
  </div>
</template>
