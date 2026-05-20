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
const nodeCommands = ref<Record<string, { vkey: string; command: string }>>({})
const copiedNodeId = ref<string | null>(null)

// Edit state
const editingNodeId = ref<string | null>(null)
const editName = ref('')
const editSaving = ref(false)
// Delete state
const deletingNodeId = ref<string | null>(null)
const deleteConfirmInput = ref('')
const deleteSaving = ref(false)

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
  if (result.ok && result.node && result.vkey && result.command) {
    nodeCommands.value[result.node.id] = { vkey: result.vkey, command: result.command }
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
    hubStore.fetchNodeVkey(nodeId).then((data) => {
      if (data) nodeCommands.value[nodeId] = data
    })
  }
}

function copyCommand(command: string, nodeId: string) {
  void navigator.clipboard.writeText(command)
  copiedNodeId.value = nodeId
  setTimeout(() => { copiedNodeId.value = null }, 2000)
}

// Edit node name
function startEdit(node: { id: string; name: string }) {
  editingNodeId.value = node.id
  editName.value = node.name
}

function cancelEdit() {
  editingNodeId.value = null
  editName.value = ''
}

async function saveEdit(nodeId: string) {
  const name = editName.value.trim()
  if (!name || editSaving.value) return
  editSaving.value = true
  const result = await hubStore.updateNode(nodeId, { name })
  if (result.ok) {
    editingNodeId.value = null
  } else {
    hubStore.showToast('Error', result.error ?? 'Failed to rename node')
  }
  editSaving.value = false
}

// Delete node
function startDelete(nodeId: string) {
  deletingNodeId.value = nodeId
  deleteConfirmInput.value = ''
}

function cancelDelete() {
  deletingNodeId.value = null
  deleteConfirmInput.value = ''
}

async function confirmDelete(nodeId: string) {
  if (deleteConfirmInput.value !== nodeId || deleteSaving.value) return
  deleteSaving.value = true
  const result = await hubStore.deleteNode(nodeId)
  if (result.ok) {
    hubStore.showToast('Deleted', 'Node removed')
    deletingNodeId.value = null
  } else {
    hubStore.showToast('Error', result.error ?? 'Failed to delete node')
  }
  deleteSaving.value = false
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
        <table class="min-w-[1100px] w-full border-collapse">
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
              <th v-if="isAdmin()" class="border-b border-snow/10 px-[18px] py-[15px] w-[100px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="node in nodes" :key="node.id">
              <tr class="text-[13px] text-parchment transition hover:bg-snow/[.04]">
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
                <td class="border-b border-snow/10 px-[18px] py-[15px] cursor-pointer hover:underline" @click="router.push('/nodes/' + node.id)">
                  <template v-if="editingNodeId === node.id">
                    <input
                      v-model="editName"
                      class="w-40 rounded border border-signal/40 bg-carbon px-2 py-0.5 text-[13px] font-bold text-snow outline-none"
                      @keyup.enter="saveEdit(node.id)"
                      @keyup.escape="cancelEdit()"
                      @click.stop
                    />
                    <button class="ml-1 text-[11px] text-signal font-bold" :disabled="editSaving" @click.stop="saveEdit(node.id)">Save</button>
                    <button class="ml-1 text-[11px] text-slate" @click.stop="cancelEdit()">Cancel</button>
                  </template>
                  <span v-else class="font-black text-snow">{{ node.name }}</span>
                </td>
                <td class="border-b border-snow/10 px-[18px] py-[15px]" @click="router.push('/nodes/' + node.id)">
                  <StatusBadge :tone="statusTone(node.status)">{{ node.status }}</StatusBadge>
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
                <td v-if="isAdmin()" class="border-b border-snow/10 px-[18px] py-[15px]">
                  <div v-if="deletingNodeId === node.id" class="flex items-center gap-1">
                    <input
                      v-model="deleteConfirmInput"
                      class="w-28 rounded border border-red/30 bg-carbon px-1.5 py-0.5 text-[11px] text-parchment outline-none"
                      :placeholder="node.id.substring(0,8)"
                      @keyup.escape="cancelDelete()"
                      @click.stop
                    />
                    <button class="text-[11px] text-red font-bold" :disabled="deleteSaving" @click.stop="confirmDelete(node.id)">OK</button>
                    <button class="text-[11px] text-slate" @click.stop="cancelDelete()">X</button>
                  </div>
                  <div v-else class="flex items-center gap-2">
                    <button
                      class="text-[12px] text-slate hover:text-signal transition"
                      title="Edit name"
                      @click.stop="startEdit(node)"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button
                      v-if="node.status !== 'online'"
                      class="text-[12px] text-slate hover:text-red transition"
                      title="Delete node"
                      @click.stop="startDelete(node.id)"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
              <!-- Expandable command row -->
              <tr v-if="expandedNodeId === node.id && isAdmin()" class="bg-signal/[.03]">
                <td :colspan="isAdmin() ? 10 : 9" class="border-b border-snow/10 px-[18px] py-4">
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
