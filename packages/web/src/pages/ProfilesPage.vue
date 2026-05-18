<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useHubStore } from '@/stores/hub'
import ProfileTable from '@/components/fleet/ProfileTable.vue'
import StatCard from '@/components/ui/StatCard.vue'
import SectionTitle from '@/components/ui/SectionTitle.vue'
import type { StatItem } from '@/types/hub'

const hubStore = useHubStore()
const { profiles } = storeToRefs(hubStore)

const fleetStats = computed<StatItem[]>(() => {
  const total = profiles.value.length
  const setupOk = profiles.value.filter((profile) => profile.setupTone === 'running').length
  const gateways = profiles.value.filter((profile) => profile.gatewayTone === 'running').length
  const apis = profiles.value.filter((profile) => profile.apiTone !== 'stopped').length
  return [
    { label: 'Agents', icon: '🤖', value: String(total), hint: 'Scanned agents' },
    { label: 'Setup OK', icon: '✔', value: String(setupOk), hint: `${Math.max(total - setupOk, 0)} need setup` },
    { label: 'Gateway', icon: '🔗', value: String(gateways), hint: 'Running now' },
    { label: 'API', icon: '📲', value: String(apis), hint: 'Enabled endpoints' },
  ]
})

onMounted(() => {
  void hubStore.fetchProfiles()
})
</script>

<template>
  <div class="p-7 max-[760px]:p-[18px]">
    <SectionTitle>
      <template #title>Agents</template>
      <template #subtitle>All Hermes agents and their operation entry points.</template>
    </SectionTitle>

    <div class="mb-5 grid grid-cols-4 gap-3.5 max-[1180px]:grid-cols-2 max-[760px]:grid-cols-1">
      <StatCard v-for="stat in fleetStats" :key="stat.label" :stat="stat" />
    </div>

    <ProfileTable />
  </div>
</template>
