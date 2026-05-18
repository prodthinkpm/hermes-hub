<script setup lang="ts">
import { onUnmounted } from 'vue'
import { RouterView } from 'vue-router'
import { useHubStore } from '@/stores/hub'
import SidebarNav from '@/components/layout/SidebarNav.vue'
import TopBar from '@/components/layout/TopBar.vue'
import ToastNotice from '@/components/layout/ToastNotice.vue'

const hubStore = useHubStore()

onUnmounted(() => {
  hubStore.disposeToastTimer()
})
</script>

<template>
  <div class="relative z-[1] grid min-h-screen grid-cols-[290px_1fr] max-[1180px]:grid-cols-[86px_1fr] max-[760px]:block">
    <SidebarNav />
    <main class="min-w-0">
      <TopBar />
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>
    <ToastNotice />
  </div>
</template>
