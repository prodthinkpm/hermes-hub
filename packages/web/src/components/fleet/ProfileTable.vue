<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useHubStore } from '@/stores/hub'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import PanelHeader from '@/components/ui/PanelHeader.vue'
import type { ProfileRow } from '@/types/hub'

const router = useRouter()
const hubStore = useHubStore()
const { profiles, isLoadingProfiles, profilesError } = storeToRefs(hubStore)

const rowBusyId = ref<string | null>(null)
const rowError = ref<Record<string, string>>({})
const renameDialogOpen = ref(false)
const renameDialogTarget = ref<ProfileRow | null>(null)
const renameDialogValue = ref('')

const anyBusy = computed(() => rowBusyId.value !== null)

function openProfile(profile: ProfileRow): void {
  void router.push(`/profiles/${profile.id}`)
}

function openProfileLogs(profile: ProfileRow): void {
  void router.push(`/profiles/${profile.id}/logs`)
}

function openRenameDialog(profile: ProfileRow): void {
  if (profile.kind !== 'profile') return
  renameDialogTarget.value = profile
  renameDialogValue.value = profile.name
  rowError.value[profile.id] = ''
  renameDialogOpen.value = true
}

function closeRenameDialog(): void {
  renameDialogOpen.value = false
  renameDialogTarget.value = null
  renameDialogValue.value = ''
}

async function submitRenameDialog(): Promise<void> {
  const profile = renameDialogTarget.value
  if (!profile) return
  const nextName = renameDialogValue.value.trim()
  if (!nextName) {
    rowError.value[profile.id] = 'Name is required'
    return
  }
  if (nextName === profile.name) {
    rowError.value[profile.id] = ''
    return
  }

  rowBusyId.value = profile.id
  rowError.value[profile.id] = ''
  try {
    const result = await hubStore.renameAgent(profile.id, nextName)
    if (!result.ok) {
      rowError.value[profile.id] = result.error ?? 'Rename failed'
      return
    }
    hubStore.showToast('Agent renamed', `${profile.name} -> ${nextName}`)
    closeRenameDialog()
  } finally {
    rowBusyId.value = null
  }
}

async function deleteAgent(profile: ProfileRow): Promise<void> {
  if (profile.kind !== 'profile') return
  const firstConfirm = window.confirm(`Delete agent "${profile.name}"? This cannot be undone.`)
  if (!firstConfirm) return

  const secondInput = window.prompt(`Type "${profile.name}" to confirm deletion:`)
  if (secondInput !== profile.name) {
    rowError.value[profile.id] = 'Deletion cancelled: confirmation text did not match'
    return
  }

  rowBusyId.value = profile.id
  rowError.value[profile.id] = ''
  try {
    const result = await hubStore.deleteAgent(profile.id)
    if (!result.ok) {
      rowError.value[profile.id] = result.error ?? 'Delete failed'
      return
    }
    hubStore.showToast('Agent deleted', `${profile.name} was deleted`)
  } finally {
    rowBusyId.value = null
  }
}
</script>

<template>
  <section class="overflow-hidden rounded-md border border-snow/10 bg-carbon/80 shadow-ambient">
    <PanelHeader>
      <template #title>All Agents</template>
      <template #subtitle>Agent list and operation entry points.</template>
      <template #actions>
        <UiButton variant="primary" :disabled="anyBusy" @click="router.push('/create')">New Agent</UiButton>
      </template>
    </PanelHeader>

    <div class="overflow-auto">
      <div v-if="isLoadingProfiles" class="px-5 py-6 text-sm text-slate">Loading agents...</div>
      <div v-else-if="profilesError" class="px-5 py-6 text-sm text-danger">{{ profilesError }}</div>
      <div v-else-if="profiles.length === 0" class="px-5 py-6 text-sm text-slate">No agents found. Configure scan paths in Settings first.</div>

      <table v-if="!isLoadingProfiles && !profilesError && profiles.length > 0" class="min-w-[980px] w-full border-collapse">
        <thead>
          <tr class="bg-snow/[.035] text-left text-xs text-slate">
            <th class="border-b border-snow/10 px-[18px] py-[15px]">Agent</th>
            <th class="border-b border-snow/10 px-[18px] py-[15px]">Type</th>
            <th class="border-b border-snow/10 px-[18px] py-[15px]">Setup</th>
            <th class="border-b border-snow/10 px-[18px] py-[15px]">Gateway</th>
            <th class="border-b border-snow/10 px-[18px] py-[15px]">API Server</th>
            <th class="border-b border-snow/10 px-[18px] py-[15px]">Model</th>
            <th class="border-b border-snow/10 px-[18px] py-[15px]">HERMES_HOME</th>
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
                  <div class="mt-0.5 text-xs text-slate">{{ profile.desc }}</div>
                  <div v-if="rowError[profile.id]" class="mt-1 text-xs text-danger">{{ rowError[profile.id] }}</div>
                </div>
              </div>
            </td>
            <td class="border-b border-snow/10 px-[18px] py-[15px]">
              <StatusBadge :tone="profile.kind === 'default' ? 'info' : 'purple'">
                {{ profile.kind === 'default' ? 'default' : 'profile' }}
              </StatusBadge>
            </td>
            <td class="border-b border-snow/10 px-[18px] py-[15px]"><StatusBadge :tone="profile.setupTone">{{ profile.setupText }}</StatusBadge></td>
            <td class="border-b border-snow/10 px-[18px] py-[15px]"><StatusBadge :tone="profile.gatewayTone">{{ profile.gatewayText }}</StatusBadge></td>
            <td class="border-b border-snow/10 px-[18px] py-[15px]"><StatusBadge :tone="profile.apiTone">{{ profile.apiText }}</StatusBadge></td>
            <td class="border-b border-snow/10 px-[18px] py-[15px]">{{ profile.model }}</td>
            <td class="border-b border-snow/10 px-[18px] py-[15px] font-mono">{{ profile.home }}</td>
            <td class="border-b border-snow/10 px-[18px] py-[15px]">
              <div class="flex flex-wrap gap-1.5">
                <button class="min-h-[34px] rounded-md border border-snow/10 bg-snow/[.055] px-2.5 text-xs font-bold text-snow transition hover:bg-snow/[.09]" type="button" @click="openProfileLogs(profile)" v-show="false">Logs</button>
                <button
                  class="min-h-[34px] rounded-md border border-snow/10 bg-snow/[.055] px-2.5 text-xs font-bold text-snow transition hover:bg-snow/[.09]"
                  type="button"
                  :disabled="rowBusyId === profile.id"
                  @click="openProfile(profile)"
                >
                  Details
                </button>
                <button
                  v-if="profile.kind === 'profile'"
                  class="min-h-[34px] rounded-md border border-snow/10 bg-snow/[.055] px-2.5 text-xs font-bold text-snow transition hover:bg-snow/[.09]"
                  type="button"
                  :disabled="rowBusyId === profile.id"
                  @click="openRenameDialog(profile)"
                >
                  Rename
                </button>
                <button
                  v-if="profile.kind === 'profile'"
                  class="min-h-[34px] rounded-md border border-danger/35 bg-danger/10 px-2.5 text-xs font-bold text-danger transition hover:bg-danger/15"
                  type="button"
                  :disabled="rowBusyId === profile.id"
                  @click="deleteAgent(profile)"
                >
                  {{ rowBusyId === profile.id ? 'Deleting...' : 'Delete' }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <div v-if="renameDialogOpen" class="fixed inset-0 z-40 grid place-items-center bg-black/55 p-4">
    <div class="w-full max-w-[420px] rounded-md border border-snow/10 bg-carbon p-4 shadow-dramatic">
      <h3 class="m-0 text-base font-extrabold text-snow">Rename Agent</h3>
      <p class="mt-1 text-xs text-slate">Enter a new name for this agent.</p>
      <input
        v-model="renameDialogValue"
        class="mt-3 h-11 w-full"
        placeholder="new-agent-name"
        @keyup.enter="submitRenameDialog"
      />
      <div v-if="renameDialogTarget && rowError[renameDialogTarget.id]" class="mt-2 text-xs text-danger">
        {{ rowError[renameDialogTarget.id] }}
      </div>
      <div class="mt-3 flex items-center justify-end gap-2">
        <UiButton :disabled="rowBusyId === renameDialogTarget?.id" @click="closeRenameDialog">Cancel</UiButton>
        <UiButton
          variant="primary"
          :disabled="!renameDialogValue.trim() || rowBusyId === renameDialogTarget?.id"
          @click="submitRenameDialog"
        >
          {{ rowBusyId === renameDialogTarget?.id ? 'Renaming...' : 'Save' }}
        </UiButton>
      </div>
    </div>
  </div>
</template>
