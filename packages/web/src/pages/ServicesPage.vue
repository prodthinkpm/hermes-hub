<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useHubStore } from '@/stores/hub'
import UiButton from '@/components/ui/UiButton.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import SectionTitle from '@/components/ui/SectionTitle.vue'
import PanelHeader from '@/components/ui/PanelHeader.vue'

const hubStore = useHubStore()
const { profiles, isLoadingProfiles, profilesError } = storeToRefs(hubStore)
const busyId = ref<string | null>(null)
const actionError = ref('')

onMounted(async () => {
  if (!profiles.value.length) await hubStore.fetchProfiles()
})

async function doGatewayAction(id: string, action: 'start' | 'stop' | 'restart'): Promise<void> {
  busyId.value = id
  actionError.value = ''
  let result: { ok: boolean; error?: string }
  switch (action) {
    case 'start': result = await hubStore.startGateway(id); break
    case 'stop': result = await hubStore.stopGateway(id); break
    case 'restart': result = await hubStore.restartGateway(id); break
  }
  if (!result.ok) actionError.value = result.error ?? `${action} failed`
  busyId.value = null
}
</script>

<template>
  <div class="p-7 max-[760px]:p-[18px]">
    <SectionTitle>
      <template #title>Gateway / API Server</template>
      <template #subtitle>管理每个 Agent 的 Gateway 生命周期。gateway 由 Hub Agent 在本机执行 Hermes CLI 控制。</template>
      <template #actions>
        <div class="flex gap-2">
          <UiButton variant="green" @click="hubStore.batchStartGateways()">Start All</UiButton>
          <UiButton variant="red" @click="hubStore.batchStopGateways()">Stop All</UiButton>
        </div>
      </template>
    </SectionTitle>

    <section class="overflow-hidden rounded-md border border-snow/10 bg-carbon/80 shadow-ambient">
      <PanelHeader>
        <template #title>Gateway Control</template>
        <template #subtitle>Start, stop, or restart gateway for each agent.</template>
      </PanelHeader>

      <div class="overflow-auto">
        <div v-if="isLoadingProfiles" class="px-5 py-6 text-sm text-slate">Loading agents...</div>
        <div v-else-if="profilesError" class="px-5 py-6 text-sm text-danger">{{ profilesError }}</div>
        <div v-else-if="actionError" class="px-5 py-3 text-sm text-danger border-b border-snow/10">{{ actionError }}</div>

        <table v-if="!isLoadingProfiles && !profilesError && profiles.length > 0" class="min-w-[720px] w-full border-collapse">
          <thead>
            <tr class="bg-snow/[.035] text-left text-xs text-slate">
              <th class="border-b border-snow/10 px-[18px] py-[15px]">Agent</th>
              <th class="border-b border-snow/10 px-[18px] py-[15px]">Node</th>
              <th class="border-b border-snow/10 px-[18px] py-[15px]">Gateway</th>
              <th class="border-b border-snow/10 px-[18px] py-[15px]">API Server</th>
              <th class="border-b border-snow/10 px-[18px] py-[15px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="profile in profiles" :key="profile.id" class="text-[13px] text-parchment">
              <td class="border-b border-snow/10 px-[18px] py-[15px] align-top">
                <div class="flex items-start gap-3">
                  <div class="grid size-[38px] place-items-center rounded-md border border-signal/25 bg-signal/10 font-black text-signal">{{ profile.letter }}</div>
                  <div class="min-w-0 flex-1">
                    <div class="font-black text-snow">{{ profile.name }}</div>
                    <div class="mt-0.5 text-xs text-slate">{{ profile.nodeLabel }}</div>
                  </div>
                </div>
              </td>
              <td class="border-b border-snow/10 px-[18px] py-[15px] align-top">
                <StatusBadge tone="info">{{ profile.nodeLabel }}</StatusBadge>
              </td>
              <td class="border-b border-snow/10 px-[18px] py-[15px] align-top">
                <StatusBadge :tone="profile.gatewayTone">{{ profile.gatewayText }}</StatusBadge>
              </td>
              <td class="border-b border-snow/10 px-[18px] py-[15px] align-top">
                <StatusBadge :tone="profile.apiTone">{{ profile.apiText }}</StatusBadge>
              </td>
              <td class="border-b border-snow/10 px-[18px] py-[15px] align-top">
                <div class="flex flex-wrap gap-1.5">
                  <UiButton variant="green" :disabled="busyId === profile.id" @click="doGatewayAction(profile.id, 'start')">
                    {{ busyId === profile.id ? '...' : 'Start' }}
                  </UiButton>
                  <UiButton variant="red" :disabled="busyId === profile.id" @click="doGatewayAction(profile.id, 'stop')">
                    {{ busyId === profile.id ? '...' : 'Stop' }}
                  </UiButton>
                  <UiButton :disabled="busyId === profile.id" @click="doGatewayAction(profile.id, 'restart')">Restart</UiButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="!isLoadingProfiles && !profilesError && profiles.length === 0" class="px-5 py-6 text-sm text-slate">
          No agents available. Start a Hub Agent to register agents from a node.
        </div>
      </div>
    </section>
  </div>
</template>
