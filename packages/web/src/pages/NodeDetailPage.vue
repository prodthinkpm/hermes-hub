<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useHubStore } from '@/stores/hub'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import SectionTitle from '@/components/ui/SectionTitle.vue'
import type { HubNode } from '@hermes-hub/core'
import type { BadgeTone } from '@hermes-hub/core'

const route = useRoute()
const router = useRouter()
const hubStore = useHubStore()

const node = ref<HubNode | null>(null)
const isLoading = ref(true)
const error = ref<string | null>(null)

function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'online': return 'running'
    case 'offline': return 'stopped'
    case 'disabled': return 'stopped'
    case 'unhealthy': return 'bad'
    default: return 'info'
  }
}

async function loadNode() {
  isLoading.value = true
  error.value = null
  const id = route.params.id as string
  const result = await hubStore.fetchNode(id)
  if (result) {
    node.value = result
  } else {
    error.value = `Node '${id}' not found.`
  }
  isLoading.value = false
}

onMounted(() => {
  void loadNode()
})
</script>

<template>
  <div class="p-7 max-[760px]:p-[18px]">
    <div class="mb-5">
      <button class="back-link" type="button" @click="router.push('/nodes')">
        <span>&lt;-</span>
        <span>Back</span>
      </button>
    </div>

    <div v-if="isLoading" class="py-10 text-center text-sm text-slate">Loading node details...</div>

    <div v-else-if="error" class="py-10 text-center text-sm text-red-400">{{ error }}</div>

    <template v-else-if="node">
      <SectionTitle>
        <template #title>{{ node.name }}</template>
        <template #subtitle>Node details.</template>
      </SectionTitle>

      <section class="mb-5 overflow-hidden rounded-md border border-snow/10 bg-carbon/80 shadow-ambient p-5">
        <h3 class="mb-4 text-sm font-extrabold text-snow">Node Information</h3>
        <div class="grid grid-cols-2 gap-x-5 gap-y-3 max-[760px]:grid-cols-1">
          <div>
            <span class="text-[11px] uppercase tracking-[.1em] text-slate">Node ID</span>
            <p class="mt-0.5 text-[13px] font-mono text-parchment">{{ node.id }}</p>
          </div>
          <div>
            <span class="text-[11px] uppercase tracking-[.1em] text-slate">Name</span>
            <p class="mt-0.5 text-[13px] font-bold text-snow">{{ node.name }}</p>
          </div>
          <div>
            <span class="text-[11px] uppercase tracking-[.1em] text-slate">Status</span>
            <p class="mt-0.5">
              <StatusBadge :tone="statusTone(node.status)">{{ node.status }}</StatusBadge>
            </p>
          </div>
          <div>
            <span class="text-[11px] uppercase tracking-[.1em] text-slate">Hostname</span>
            <p class="mt-0.5 text-[13px] text-parchment">{{ node.hostname || '—' }}</p>
          </div>
          <div>
            <span class="text-[11px] uppercase tracking-[.1em] text-slate">Operating System</span>
            <p class="mt-0.5 text-[13px] text-parchment">{{ node.os || '—' }}</p>
          </div>
          <div>
            <span class="text-[11px] uppercase tracking-[.1em] text-slate">Architecture</span>
            <p class="mt-0.5 text-[13px] text-parchment font-mono">{{ node.arch || '—' }}</p>
          </div>
          <div>
            <span class="text-[11px] uppercase tracking-[.1em] text-slate">Agent Version</span>
            <p class="mt-0.5 text-[13px] text-parchment font-mono">{{ node.agentVersion || '—' }}</p>
          </div>
          <div>
            <span class="text-[11px] uppercase tracking-[.1em] text-slate">Hermes Version</span>
            <p class="mt-0.5 text-[13px] text-parchment font-mono">{{ node.hermesVersion ?? '—' }}</p>
          </div>
          <div class="col-span-2">
            <span class="text-[11px] uppercase tracking-[.1em] text-slate">Hermes Home</span>
            <p class="mt-0.5 text-[13px] text-parchment font-mono">{{ node.hermesHome || '—' }}</p>
          </div>
          <div>
            <span class="text-[11px] uppercase tracking-[.1em] text-slate">Profiles Total</span>
            <p class="mt-0.5 text-[13px] text-parchment">{{ node.profilesTotal }}</p>
          </div>
          <div>
            <span class="text-[11px] uppercase tracking-[.1em] text-slate">Gateways Running</span>
            <p class="mt-0.5 text-[13px] text-parchment">{{ node.gatewayRunning }}</p>
          </div>
          <div>
            <span class="text-[11px] uppercase tracking-[.1em] text-slate">Last Heartbeat</span>
            <p class="mt-0.5 text-[13px] text-parchment font-mono">{{ node.lastHeartbeatAt ?? 'never' }}</p>
          </div>
          <div>
            <span class="text-[11px] uppercase tracking-[.1em] text-slate">Capabilities</span>
            <p class="mt-0.5 text-[13px] text-parchment">{{ node.capabilities.join(', ') || '—' }}</p>
          </div>
          <div>
            <span class="text-[11px] uppercase tracking-[.1em] text-slate">Tags</span>
            <p class="mt-0.5">
              <span
                v-for="tag in node.tags"
                :key="tag"
                class="mr-1 inline-block rounded-sm bg-snow/[.08] px-1.5 py-0.5 text-[11px] text-slate"
              >{{ tag }}</span>
              <span v-if="node.tags.length === 0" class="text-slate/50">—</span>
            </p>
          </div>
          <div>
            <span class="text-[11px] uppercase tracking-[.1em] text-slate">Created</span>
            <p class="mt-0.5 text-[13px] text-parchment font-mono">{{ node.createdAt }}</p>
          </div>
          <div>
            <span class="text-[11px] uppercase tracking-[.1em] text-slate">Updated</span>
            <p class="mt-0.5 text-[13px] text-parchment font-mono">{{ node.updatedAt }}</p>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
