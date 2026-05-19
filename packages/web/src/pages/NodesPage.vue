<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useHubStore } from '@/stores/hub'
import { useAuthStore } from '@/stores/auth'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import SectionTitle from '@/components/ui/SectionTitle.vue'
import StatCard from '@/components/ui/StatCard.vue'
import type { StatItem } from '@/types/hub'
import type { BadgeTone } from '@hermes-hub/core'

const router = useRouter()
const hubStore = useHubStore()
const authStore = useAuthStore()
const { nodes } = storeToRefs(hubStore)

const showCreateForm = ref(false)
const newNodeName = ref('')
const creating = ref(false)
const createError = ref('')
const expandedNodeId = ref<string | null>(null)
const nodeCommands = ref<Record<string, { token: string; command: string }>>({})
const copiedNodeId = ref<string | null>(null)

const nodeStats = computed<StatItem[]>(() => {
  const total = nodes.value.length
  const online = nodes.value.filter((n) => n.status === 'online').length
  const offline = nodes.value.filter((n) => n.status === 'offline').length
  const disabled = nodes.value.filter((n) => n.status === 'disabled').length
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

function isAdmin(): boolean {
  return authStore.user?.role === 'admin'
}

async function doCreateNode() {
  if (creating.value) return
  creating.value = true
  createError.value = ''
  const result = await hubStore.createNode(newNodeName.value.trim() || undefined)
  if (result.ok && result.node && result.token && result.command) {
    nodeCommands.value[result.node.id] = { token: result.token, command: result.command }
    expandedNodeId.value = result.node.id
    newNodeName.value = ''
    showCreateForm.value = false
  } else {
    createError.value = result.error ?? 'Failed to create node'
  }
  creating.value = false
}

function toggleExpand(nodeId: string) {
  if (expandedNodeId.value === nodeId) {
    expandedNodeId.value = null
    return
  }
  expandedNodeId.value = nodeId
  if (!nodeCommands.value[nodeId]) {
    hubStore.fetchNodeToken(nodeId).then((data) => {
      if (data) nodeCommands.value[nodeId] = data
    })
  }
}

function copyCommand(command: string, nodeId: string) {
  void navigator.clipboard.writeText(command)
  copiedNodeId.value = nodeId
  setTimeout(() => { copiedNodeId.value = null }, 2000)
}

onMounted(() => {
  void hubStore.fetchProfiles()
})
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
      <div class="flex items-center justify-between border-b border-snow/10 px-5 py-4">
        <div>
          <h3 class="m-0 text-base font-extrabold text-snow">All Nodes</h3>
          <p class="mt-1 text-xs text-slate">Click a node to view details. Click the arrow to show connection command.</p>
        </div>
        <button
          v-if="isAdmin() && !showCreateForm"
          class="rounded-md border border-signal/30 bg-signal/10 px-3 py-1.5 text-[13px] font-bold text-signal transition hover:bg-signal/20"
          @click="showCreateForm = true"
        >
          + New Node
        </button>
      </div>

      <!-- Create form -->
      <div v-if="showCreateForm" class="border-b border-snow/10 bg-signal/[.03] px-5 py-4">
        <div class="flex items-end gap-3">
          <div class="flex-1">
            <label class="mb-1.5 block text-[11px] font-bold text-slate uppercase tracking-[.08em]">Node Name (optional)</label>
            <input
              v-model="newNodeName"
              class="h-11 w-full rounded-md border border-snow/10 bg-snow/[.045] px-3.5 text-[14px] text-parchment outline-none focus:border-signal/40"
              placeholder="e.g. Production Server"
              @keyup.enter="doCreateNode"
            />
          </div>
          <button
            class="h-11 rounded-md bg-signal px-4 text-[13px] font-extrabold text-abyss transition hover:bg-signal/85"
            :disabled="creating"
            @click="doCreateNode"
          >
            {{ creating ? 'Creating...' : 'Create' }}
          </button>
          <button
            class="h-11 rounded-md border border-snow/10 px-3 text-[13px] font-bold text-slate transition hover:bg-snow/[.06]"
            @click="showCreateForm = false"
          >
            Cancel
          </button>
        </div>
        <p v-if="createError" class="mt-2 text-[13px] text-red font-bold">{{ createError }}</p>
      </div>

      <div v-if="nodes.length === 0 && !showCreateForm" class="px-5 py-5 text-sm text-slate">
        No nodes yet.
        <button v-if="isAdmin()" class="text-signal underline" @click="showCreateForm = true">Create one</button>
      </div>

      <div v-else-if="nodes.length > 0" class="overflow-auto">
        <table class="min-w-[960px] w-full border-collapse">
          <thead>
            <tr class="bg-snow/[.035] text-left text-xs text-slate">
              <th class="border-b border-snow/10 w-10 px-[18px] py-[15px]"></th>
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
            <template v-for="node in nodes" :key="node.id">
              <tr
                class="cursor-pointer text-[13px] text-parchment transition hover:bg-snow/[.04]"
              >
                <td class="border-b border-snow/10 px-[18px] py-[15px]">
                  <button
                    class="inline-flex size-6 items-center justify-center rounded text-slate transition hover:text-snow"
                    :class="expandedNodeId === node.id ? 'rotate-90' : ''"
                    @click.stop="toggleExpand(node.id)"
                    title="Show connection command"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                </td>
                <td
                  class="border-b border-snow/10 px-[18px] py-[15px] font-black text-snow hover:underline"
                  @click="router.push('/nodes/' + node.id)"
                >{{ node.name }}</td>
                <td class="border-b border-snow/10 px-[18px] py-[15px]" @click="router.push('/nodes/' + node.id)">
                  <StatusBadge :tone="statusTone(node.status)" :text="node.status" />
                </td>
                <td class="border-b border-snow/10 px-[18px] py-[15px]" @click="router.push('/nodes/' + node.id)">{{ node.hostname || '—' }} / {{ node.os || '—' }}</td>
                <td class="border-b border-snow/10 px-[18px] py-[15px] font-mono" @click="router.push('/nodes/' + node.id)">{{ node.hermesHome || '—' }}</td>
                <td class="border-b border-snow/10 px-[18px] py-[15px]" @click="router.push('/nodes/' + node.id)">{{ node.profilesTotal }}</td>
                <td class="border-b border-snow/10 px-[18px] py-[15px]" @click="router.push('/nodes/' + node.id)">{{ node.gatewayRunning }}</td>
                <td class="border-b border-snow/10 px-[18px] py-[15px]" @click="router.push('/nodes/' + node.id)">{{ node.lastHeartbeatAt ?? 'waiting' }}</td>
                <td class="border-b border-snow/10 px-[18px] py-[15px]" @click="router.push('/nodes/' + node.id)">
                  <span
                    v-for="tag in node.tags"
                    :key="tag"
                    class="mr-1 inline-block rounded-sm bg-snow/[.08] px-1.5 py-0.5 text-[11px] text-slate"
                  >{{ tag }}</span>
                  <span v-if="node.tags.length === 0" class="text-slate/50">—</span>
                </td>
              </tr>
              <!-- Expandable command row -->
              <tr v-if="expandedNodeId === node.id && isAdmin()" class="bg-signal/[.03]">
                <td colspan="9" class="border-b border-snow/10 px-[18px] py-4">
                  <div v-if="nodeCommands[node.id]" class="flex items-center gap-3">
                    <code class="flex-1 rounded-md bg-carbon px-3 py-2 text-[12px] text-parchment font-mono break-all">{{ nodeCommands[node.id].command }}</code>
                    <button
                      class="shrink-0 rounded-md border px-3 py-1.5 text-[12px] font-bold transition"
                      :class="copiedNodeId === node.id ? 'border-signal/30 bg-signal/10 text-signal' : 'border-snow/10 bg-snow/[.05] text-slate hover:bg-snow/[.1]'"
                      @click.stop="copyCommand(nodeCommands[node.id].command, node.id)"
                    >
                      {{ copiedNodeId === node.id ? 'Copied' : 'Copy' }}
                    </button>
                  </div>
                  <div v-else class="text-[13px] text-slate">Loading...</div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
