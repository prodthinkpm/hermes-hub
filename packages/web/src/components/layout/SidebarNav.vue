<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { useHubStore } from '@/stores/hub'
import { useAuthStore } from '@/stores/auth'
import { navItems } from '@/data/navigation'
import type { RouteKey } from '@/types/hub'

const route = useRoute()
const hubStore = useHubStore()
const authStore = useAuthStore()

function isActive(key: RouteKey): boolean {
  if (key === 'profiles') return ['profiles', 'profile', 'profileSetup', 'profileSetupProgress', 'profileLogs', 'create'].includes(String(route.name))
  if (key === 'nodes') return ['nodes', 'nodeDetail'].includes(String(route.name))
  return route.name === key
}
</script>

<template>
  <aside class="sticky top-0 flex h-screen flex-col border-r border-snow/10 bg-abyss/90 px-[18px] py-[22px] backdrop-blur-[22px] max-[1180px]:px-3 max-[1180px]:py-4 max-[760px]:hidden">
    <div class="flex items-center gap-[13px] border-b border-snow/10 px-2.5 pb-[22px] max-[1180px]:justify-center max-[1180px]:px-0 max-[1180px]:pb-[18px]">
      <div class="grid size-[46px] place-items-center rounded-md border border-signal/30 bg-signal text-abyss font-black shadow-ambient">H</div>
      <div class="max-[1180px]:hidden">
        <h1 class="m-0 text-lg font-extrabold tracking-[-.03em] text-snow">Hermes Hub</h1>
        <p class="mt-1.5 text-xs text-slate">Hermes Control Plane</p>
      </div>
    </div>

    <nav class="mt-[22px]">
      <div class="px-2.5 pb-2.5 text-[11px] uppercase tracking-[.12em] text-slate max-[1180px]:hidden">Hermes Native</div>
      <RouterLink
        v-for="item in navItems"
        :key="item.key"
        :to="item.to"
        class="my-1 flex items-center gap-3 rounded-md px-[13px] py-3 text-left text-[15px] font-bold text-parchment transition hover:bg-snow/[.065] hover:text-snow max-[1180px]:justify-center"
        :class="isActive(item.key) ? 'border border-signal/25 bg-signal/10 text-signal' : ''"
      >
        <span class="grid size-[30px] place-items-center rounded-sm bg-snow/[.07]">{{ item.icon }}</span>
        <span class="max-[1180px]:hidden">{{ item.label }}</span>
      </RouterLink>
    </nav>

    <div class="mt-auto rounded-md border border-snow/10 bg-snow/[.045] p-[15px] max-[1180px]:hidden">
      <div v-if="authStore.isAuthenticated" class="mb-3 flex items-center justify-between">
        <span class="text-xs text-slate">User</span>
        <span class="text-[13px] font-bold text-snow">{{ authStore.user?.username }} <span class="text-[11px] text-slate">({{ authStore.user?.role }})</span></span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-xs text-slate">Hub Status</span>
        <span class="inline-flex items-center gap-1.5 text-[13px] font-bold text-signal">
          <span class="size-2 rounded-full bg-signal shadow-[0_0_0_4px_rgba(0,217,146,.12)]"></span>
          {{ hubStore.hubStatus }}
        </span>
      </div>
      <div class="mt-3 flex items-center justify-between">
        <span class="text-xs text-slate">Version</span>
        <span class="text-[13px] font-bold text-snow">{{ hubStore.hubVersion }}</span>
      </div>
    </div>
  </aside>
</template>
