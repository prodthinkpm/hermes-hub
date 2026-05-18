<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useHubStore } from '@/stores/hub'
import UiButton from '@/components/ui/UiButton.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import StatCard from '@/components/ui/StatCard.vue'
import type { StatItem } from '@/types/hub'

const router = useRouter()
const hubStore = useHubStore()
const { profiles } = storeToRefs(hubStore)

const topologyStats = computed<StatItem[]>(() => {
  const total = profiles.value.length
  const gatewayRunning = profiles.value.filter((profile) => profile.gatewayTone === 'running').length
  const apiEnabled = profiles.value.filter((profile) => profile.apiTone !== 'stopped').length
  const setupMissing = profiles.value.filter((profile) => profile.setupTone !== 'running').length
  return [
    { label: 'Agents', icon: '🤖', value: String(total), hint: 'Independent HERMES_HOME' },
    { label: 'Gateway', icon: '🔗', value: String(gatewayRunning), hint: 'Running' },
    { label: 'API', icon: '📲', value: String(apiEnabled), hint: 'Endpoints' },
    { label: 'Needs Setup', icon: '✔', value: String(setupMissing), hint: 'Need fix' },
  ]
})

onMounted(() => {
  if (!profiles.value.length) {
    void hubStore.fetchProfiles()
  }
})
</script>

<template>
  <div class="mb-5 grid grid-cols-[1.4fr_400px] gap-5 max-[1180px]:grid-cols-1">
    <section class="relative overflow-hidden rounded-md border border-snow/10 bg-[linear-gradient(135deg,rgba(0,217,146,.09),rgba(242,242,242,.035))] p-[27px] shadow-dramatic">
      <div class="mb-4 inline-flex items-center gap-2 rounded-md border border-signal/20 bg-signal/10 px-3 py-2 text-[13px] font-extrabold text-signal">◎ Hermes-native redesign</div>
      <h2 class="m-0 max-w-[850px] text-[34px] font-black leading-tight tracking-[-.03em] text-snow max-[760px]:text-[26px]">Dashboard for Overview, Agents for Operations</h2>
      <p class="my-[15px] max-w-[880px] text-[15px] leading-7 text-parchment">
        Dashboard focuses on global health. Agent creation, logs, setup, gateway, SOUL and details are managed in the Agents page.
      </p>
      <div class="flex flex-wrap gap-2.5">
        <UiButton variant="primary" @click="router.push('/profiles')">Manage Agents</UiButton>
        <UiButton variant="green" @click="hubStore.startAllGateways">Start All Gateways</UiButton>
        <UiButton @click="router.push('/services')">Manage API Server</UiButton>
      </div>
    </section>

    <section class="rounded-md border border-snow/10 bg-carbon/80 p-5 shadow-ambient">
      <div class="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 class="m-0 text-base font-extrabold tracking-[-.02em] text-snow">Runtime Topology</h3>
          <p class="mt-1 text-xs text-slate">Agent / Gateway / API overview</p>
        </div>
        <StatusBadge tone="running">healthy</StatusBadge>
      </div>
      <div class="grid grid-cols-2 gap-3.5">
        <StatCard v-for="stat in topologyStats" :key="stat.label" :stat="stat" />
      </div>
    </section>
  </div>
</template>
