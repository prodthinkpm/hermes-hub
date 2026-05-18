<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import HeroBanner from '@/components/fleet/HeroBanner.vue'
import { useHubStore } from '@/stores/hub'
import StatCard from '@/components/ui/StatCard.vue'
import SectionTitle from '@/components/ui/SectionTitle.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import type { StatItem } from '@/types/hub'

const hubStore = useHubStore()
const { profiles, logs } = storeToRefs(hubStore)

const fleetStats = computed<StatItem[]>(() => {
  const total = profiles.value.length
  const setupOk = profiles.value.filter((profile) => profile.setupTone === 'running').length
  const sessions = logs.value.filter((log) => log.source.includes('/sessions') || log.source.includes('/session')).length
  const alerts = logs.value.filter((log) => log.tone === 'err' || log.tone === 'yellow').length
  return [
    { label: 'Agents', icon: '🤖', value: String(total), hint: 'Scanned agents' },
    { label: 'Setup OK', icon: '✔', value: String(setupOk), hint: `${Math.max(total - setupOk, 0)} need setup` },
    { label: 'Sessions', icon: '💬', value: String(sessions), hint: 'Collected log lines' },
    { label: 'Alerts', icon: '⚠', value: String(alerts), hint: 'Warnings / errors' },
  ]
})

const attentionItems = computed(() => {
  const missingSetup = profiles.value.filter((profile) => profile.setupTone !== 'running')
  const gatewayIssues = profiles.value.filter((profile) => profile.gatewayTone === 'bad' || profile.gatewayTone === 'warn')
  const alerts = logs.value.filter((log) => log.tone === 'err' || log.tone === 'yellow').slice(-5)
  return [
    { title: 'needs setup', detail: `${missingSetup.length} agents still need setup.`, tone: missingSetup.length > 0 ? 'warn' : 'running' },
    { title: 'gateway issues', detail: `${gatewayIssues.length} agents have gateway issues.`, tone: gatewayIssues.length > 0 ? 'bad' : 'running' },
    { title: 'recent alerts', detail: `${alerts.length} recent warning/error logs captured.`, tone: alerts.length > 0 ? 'warn' : 'info' },
  ] as const
})

onMounted(() => {
  void Promise.all([hubStore.fetchProfiles(), hubStore.fetchLogs()])
})
</script>

<template>
  <div class="p-7 max-[760px]:p-[18px]">
    <HeroBanner />

    <SectionTitle>
      <template #title>Dashboard</template>
      <template #subtitle>Global runtime overview: agent health, gateway/API status, session growth, and recent alerts.</template>
    </SectionTitle>

    <div class="mb-5 grid grid-cols-4 gap-3.5 max-[1180px]:grid-cols-2 max-[760px]:grid-cols-1">
      <StatCard v-for="stat in fleetStats" :key="stat.label" :stat="stat" />
    </div>

    <div class="grid grid-cols-[1fr_420px] gap-5 max-[1180px]:grid-cols-1">
      <section class="app-panel p-5">
        <div class="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 class="m-0 text-base font-extrabold tracking-[-.02em] text-snow">Needs Attention</h3>
            <p class="mt-1 text-xs text-slate">Only summary signals are shown here.</p>
          </div>
          <StatusBadge tone="warn">{{ attentionItems.length }} items</StatusBadge>
        </div>
        <div class="grid gap-3">
          <div v-for="item in attentionItems" :key="item.title" class="soft-card flex items-start justify-between gap-3 p-4">
            <div>
              <div class="text-sm font-extrabold text-snow">{{ item.title }}</div>
              <p class="mt-1 text-xs leading-6 text-slate">{{ item.detail }}</p>
            </div>
            <StatusBadge :tone="item.tone">{{ item.tone }}</StatusBadge>
          </div>
        </div>
      </section>

      <section class="app-panel p-5">
        <div class="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 class="m-0 text-base font-extrabold tracking-[-.02em] text-snow">Control Scope</h3>
            <p class="mt-1 text-xs text-slate">Dashboard is for overview; detailed operations are in Agents.</p>
          </div>
          <StatusBadge tone="info">overview</StatusBadge>
        </div>
        <div class="grid gap-3">
          <div class="soft-card p-4">
            <div class="text-sm font-extrabold text-snow">Agents Page</div>
            <p class="mt-1 text-xs leading-6 text-slate">Create agents, inspect details, and access agent logs.</p>
          </div>
          <div class="soft-card p-4">
            <div class="text-sm font-extrabold text-snow">Logs Page</div>
            <p class="mt-1 text-xs leading-6 text-slate">View aggregated logs from all agents and hub runtime, then filter by agent.</p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
