<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useHubStore } from '@/stores/hub'
import { useThemeStore } from '@/stores/theme'
import UiButton from '@/components/ui/UiButton.vue'

const router = useRouter()
const hubStore = useHubStore()
const themeStore = useThemeStore()
</script>

<template>
  <header class="sticky top-0 z-10 flex h-[78px] items-center justify-between border-b border-snow/10 bg-abyss/80 px-7 backdrop-blur-[20px] max-[760px]:px-3.5">
    <div class="flex items-center gap-2.5 ml-auto">
      <button
        class="inline-flex size-9 items-center justify-center rounded-md border border-snow/10 bg-snow/[.055] text-parchment transition hover:bg-snow/[.09] hover:text-snow"
        :title="themeStore.mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
        @click="themeStore.toggle()"
      >
        <!-- Sun icon (shown in dark mode) -->
        <svg v-if="themeStore.mode === 'dark'" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
        <!-- Moon icon (shown in light mode) -->
        <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </button>
    </div>
  </header>
</template>
