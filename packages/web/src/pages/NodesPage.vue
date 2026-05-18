<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useHubStore } from '@/stores/hub'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import SectionTitle from '@/components/ui/SectionTitle.vue'
import StatCard from '@/components/ui/StatCard.vue'
import type { StatItem } from '@/types/hub'
import type { BadgeTone } from '@hermes-hub/core'

const router = useRouter()
const hubStore = useHubStore()
const { nodes } = storeToRefs(hubStore)

const nodeStats = computed<StatItem[]>(() => {
  const total = nodes.value.length
  const online = nodes.value.filter((n) => n.status === 'online').length
  const disabled = nodes.value.filter((n) => n.status === 'disabled').length
  const offline = nodes.value.filter((n) => n.status === 'offline').length
  const totalAgents = nodes.value.reduce((sum, n) => sum + n.profilesTotal, 0)
  return [
    { label: 'Total Nodes', icon: '◈', value: String(total), hint: 'Registered workers' },
    { label: 'Online', icon: '✓', value: String(online), hint: `${offline} offline, ${disabled} disabled` },
    { label: 'Total Agents', icon: '◎', value: String(totalAgents), hint: 'Across all nodes' },
    { label: 'Gateways', icon: '🔗', value: String(nodes.value.reduce((sum, n) => sum + n.gatewayRunning, 0)), hint: 'Running now' },
  ]
})

function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'online': return 'running'
    case 'offline': return 'stopped'
    case 'disabled': return 'stopped'
    case 'unhealthy': return 'bad'
    default: return 'info'
  }
}

onMounted(() => {
  void hubStore.fetchProfiles()
})
</script>

<script lang="ts">
import { computed } from 'vue'
</script>

<template>
  <div class="p-7 max-[760px]:p-[18px]">
    <SectionTitle>
      <template #title>Nodes</template>
      <template #subtitle>Registered Hub Agent workers and their status.</template>
    </SectionTitle>

    <div class="mb-5 grid grid-cols-4 gap-3.5 max-[1180px]:grid-cols-2 max-[760px]:grid-cols-1">
      <StatCard v-for="stat in nodeStats" :key="stat.label" :stat="stat" />
    </div>

    <section class="mb-5 overflow-hidden rounded-md border border-snow/10 bg-carbon/80 shadow-ambient">
      <div class="border-b border-snow/10 px-5 py-4">
        <h3 class="m-0 text-base font-extrabold text-snow">All Nodes</h3>
        <p class="mt-1 text-xs text-slate">Click a node to view details and manage it.</p>
      </div>
      <div v-if="nodes.length === 0" class="px-5 py-5 text-sm text-slate">
        No nodes registered yet. Start a Hub Agent to populate this list.
      </div>
      <div v-else class="overflow-auto">
        <table class="min-w-[960px] w-full border-collapse">
          <thead>
            <tr class="bg-snow/[.035] text-left text-xs text-slate">
              <th class="border-b border-snow/10 px-[18px] py-[15px]">Node</th>
              <th class="border-b border-snow/10 px-[18px] py-[15px]">Status</th>
              <th class="border-b border-snow/10 px-[18px] py-[15px]">Host / OS</th>
              <th class="border-b border-snow/10 px-[18px] py-[15px]">Hermes Home</th>
              <th class="border-b border-snow/10 px-[18px] py-[15px]">Agents</th>
              <th class="border-b border-snow/10 px-[18px] py-[15px]">Gateway</th>
              <th class="border-b border-snow/10 px-[18px] py-[15px]">Last Heartbeat</th>
              <th class="border-b border-snow/10 px-[18px] py-[15px]">Tags</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="node in nodes"
              :key="node.id"
              class="cursor-pointer text-[13px] text-parchment transition hover:bg-snow/[.04]"
              @click="router.push('/nodes/' + node.id)"
            >
              <td class="border-b border-snow/10 px-[18px] py-[15px] font-black text-snow">{{ node.name }}</td>
              <td class="border-b border-snow/10 px-[18px] py-[15px]">
                <StatusBadge :tone="statusTone(node.status)" :text="node.status" />
              </td>
              <td class="border-b border-snow/10 px-[18px] py-[15px]">{{ node.hostname }} / {{ node.os }}</td>
              <td class="border-b border-snow/10 px-[18px] py-[15px] font-mono">{{ node.hermesHome }}</td>
              <td class="border-b border-snow/10 px-[18px] py-[15px]">{{ node.profilesTotal }}</td>
              <td class="border-b border-snow/10 px-[18px] py-[15px]">{{ node.gatewayRunning }}</td>
              <td class="border-b border-snow/10 px-[18px] py-[15px]">{{ node.lastHeartbeatAt ?? 'waiting' }}</td>
              <td class="border-b border-snow/10 px-[18px] py-[15px]">
                <span
                  v-for="tag in node.tags"
                  :key="tag"
                  class="mr-1 inline-block rounded-sm bg-snow/[.08] px-1.5 py-0.5 text-[11px] text-slate"
                >{{ tag }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
