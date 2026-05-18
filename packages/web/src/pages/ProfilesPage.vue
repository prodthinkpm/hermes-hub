<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useHubStore } from '@/stores/hub'
import ProfileTable from '@/components/fleet/ProfileTable.vue'
import StatCard from '@/components/ui/StatCard.vue'
import SectionTitle from '@/components/ui/SectionTitle.vue'
import type { StatItem } from '@/types/hub'

const hubStore = useHubStore()
const { profiles, nodes } = storeToRefs(hubStore)

const fleetStats = computed<StatItem[]>(() => {
  const total = profiles.value.length
  const setupOk = profiles.value.filter((profile) => profile.setupTone === 'running').length
  const gateways = profiles.value.filter((profile) => profile.gatewayTone === 'running').length
  const apis = profiles.value.filter((profile) => profile.apiTone !== 'stopped').length
  return [
    { label: 'Agents', icon: '🤖', value: String(total), hint: 'Scanned agents' },
    { label: 'Nodes', icon: '⌂', value: String(nodes.value.length), hint: 'Registered workers' },
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

    <section class="mb-5 overflow-hidden rounded-md border border-snow/10 bg-carbon/80 shadow-ambient">
      <div class="border-b border-snow/10 px-5 py-4">
        <h3 class="m-0 text-base font-extrabold text-snow">Nodes</h3>
        <p class="mt-1 text-xs text-slate">Registered Hub Agent workers.</p>
      </div>
      <div v-if="nodes.length === 0" class="px-5 py-5 text-sm text-slate">No nodes registered yet. Start a Hub Agent to populate this list.</div>
      <div v-else class="overflow-auto">
        <table class="min-w-[840px] w-full border-collapse">
          <thead>
            <tr class="bg-snow/[.035] text-left text-xs text-slate">
              <th class="border-b border-snow/10 px-[18px] py-[15px]">Node</th>
              <th class="border-b border-snow/10 px-[18px] py-[15px]">Status</th>
              <th class="border-b border-snow/10 px-[18px] py-[15px]">Host</th>
              <th class="border-b border-snow/10 px-[18px] py-[15px]">Hermes Home</th>
              <th class="border-b border-snow/10 px-[18px] py-[15px]">Agents</th>
              <th class="border-b border-snow/10 px-[18px] py-[15px]">Last Heartbeat</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="node in nodes" :key="node.id" class="text-[13px] text-parchment">
              <td class="border-b border-snow/10 px-[18px] py-[15px] font-black text-snow">{{ node.name }}</td>
              <td class="border-b border-snow/10 px-[18px] py-[15px]">{{ node.status }}</td>
              <td class="border-b border-snow/10 px-[18px] py-[15px]">{{ node.hostname }} / {{ node.os }}</td>
              <td class="border-b border-snow/10 px-[18px] py-[15px] font-mono">{{ node.hermesHome }}</td>
              <td class="border-b border-snow/10 px-[18px] py-[15px]">{{ node.profilesTotal }}</td>
              <td class="border-b border-snow/10 px-[18px] py-[15px]">{{ node.lastHeartbeatAt ?? 'waiting' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <ProfileTable />
  </div>
</template>
