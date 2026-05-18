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
const showDeleteConfirm = ref(false)
const deleteInput = ref('')

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

async function toggleStatus() {
  if (!node.value) return
  const newStatus = node.value.status === 'disabled' ? 'online' : 'disabled'
  const result = await hubStore.updateNode(node.value.id, { status: newStatus as HubNode['status'] })
  if (result.ok) {
    node.value = await hubStore.fetchNode(node.value.id)
  } else {
    hubStore.showToast('Error', result.error ?? 'Failed to update node')
  }
}

async function deleteNodeAction() {
  if (!node.value) return
  if (deleteInput.value !== node.value.id) return
  const result = await hubStore.deleteNode(node.value.id)
  if (result.ok) {
    hubStore.showToast('Deleted', `Node '${node.value.name}' has been removed.`)
    router.push('/nodes')
  } else {
    hubStore.showToast('Error', result.error ?? 'Failed to delete node')
  }
}

onMounted(() => {
  void loadNode()
})
</script>

<template>
  <div class="p-7 max-[760px]:p-[18px]">
    <div class="mb-5 flex items-center gap-3">
      <button
        class="rounded-md border border-snow/10 px-3 py-1.5 text-[13px] font-bold text-slate transition hover:bg-snow/[.065] hover:text-snow"
        @click="router.push('/nodes')"
      >
        Back to Nodes
      </button>
    </div>

    <div v-if="isLoading" class="py-10 text-center text-sm text-slate">Loading node details...</div>

    <div v-else-if="error" class="py-10 text-center text-sm text-red-400">{{ error }}</div>

    <template v-else-if="node">
      <SectionTitle>
        <template #title>{{ node.name }}</template>
        <template #subtitle>Node details and management.</template>
      </SectionTitle>

      <!-- Info Panel -->
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
              <StatusBadge :tone="statusTone(node.status)" :text="node.status" />
            </p>
          </div>
          <div>
            <span class="text-[11px] uppercase tracking-[.1em] text-slate">Hostname</span>
            <p class="mt-0.5 text-[13px] text-parchment">{{ node.hostname }}</p>
          </div>
          <div>
            <span class="text-[11px] uppercase tracking-[.1em] text-slate">Operating System</span>
            <p class="mt-0.5 text-[13px] text-parchment">{{ node.os }}</p>
          </div>
          <div>
            <span class="text-[11px] uppercase tracking-[.1em] text-slate">Architecture</span>
            <p class="mt-0.5 text-[13px] text-parchment font-mono">{{ node.arch }}</p>
          </div>
          <div>
            <span class="text-[11px] uppercase tracking-[.1em] text-slate">Agent Version</span>
            <p class="mt-0.5 text-[13px] text-parchment font-mono">{{ node.agentVersion }}</p>
          </div>
          <div>
            <span class="text-[11px] uppercase tracking-[.1em] text-slate">Hermes Version</span>
            <p class="mt-0.5 text-[13px] text-parchment font-mono">{{ node.hermesVersion ?? '--' }}</p>
          </div>
          <div class="col-span-2">
            <span class="text-[11px] uppercase tracking-[.1em] text-slate">Hermes Home</span>
            <p class="mt-0.5 text-[13px] text-parchment font-mono">{{ node.hermesHome }}</p>
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
            <p class="mt-0.5 text-[13px] text-parchment">{{ node.capabilities.join(', ') || '--' }}</p>
          </div>
          <div>
            <span class="text-[11px] uppercase tracking-[.1em] text-slate">Tags</span>
            <p class="mt-0.5">
              <span
                v-for="tag in node.tags"
                :key="tag"
                class="mr-1 inline-block rounded-sm bg-snow/[.08] px-1.5 py-0.5 text-[11px] text-slate"
              >{{ tag }}</span>
              <span v-if="node.tags.length === 0" class="text-slate">--</span>
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

      <!-- Actions Panel -->
      <section class="mb-5 overflow-hidden rounded-md border border-snow/10 bg-carbon/80 shadow-ambient p-5">
        <h3 class="mb-4 text-sm font-extrabold text-snow">Actions</h3>
        <div class="flex flex-wrap gap-3">
          <button
            class="rounded-md border px-4 py-2 text-[13px] font-bold transition"
            :class="node.status === 'disabled'
              ? 'border-signal/30 bg-signal/10 text-signal hover:bg-signal/20'
              : 'border-snow/20 bg-snow/[.05] text-parchment hover:bg-snow/[.1]'"
            @click="toggleStatus"
          >
            {{ node.status === 'disabled' ? 'Enable Node' : 'Disable Node' }}
          </button>
          <button
            v-if="node.status !== 'online'"
            class="rounded-md border border-red/30 bg-red/[.08] px-4 py-2 text-[13px] font-bold text-red hover:bg-red/[.15]"
            @click="showDeleteConfirm = !showDeleteConfirm"
          >
            {{ showDeleteConfirm ? 'Cancel' : 'Delete Node' }}
          </button>
        </div>

        <div v-if="showDeleteConfirm" class="mt-4 rounded-md border border-red/20 bg-red/[.05] p-4">
          <p class="mb-2 text-[13px] font-bold text-red">Delete this node and all its agents?</p>
          <p class="mb-3 text-[12px] text-slate">
            Type the node ID <code class="rounded bg-snow/[.1] px-1 py-0.5 text-[11px] text-parchment">{{ node.id }}</code> to confirm.
          </p>
          <div class="flex gap-2">
            <input
              v-model="deleteInput"
              class="w-64 rounded-md border border-snow/10 bg-carbon px-3 py-1.5 text-[13px] text-parchment outline-none focus:border-red/50"
              placeholder="Node ID"
            />
            <button
              class="rounded-md bg-red px-4 py-1.5 text-[13px] font-bold text-white transition hover:bg-red/80"
              :disabled="deleteInput !== node.id"
              :class="deleteInput !== node.id ? 'opacity-50 cursor-not-allowed' : ''"
              @click="deleteNodeAction"
            >
              Confirm Delete
            </button>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
