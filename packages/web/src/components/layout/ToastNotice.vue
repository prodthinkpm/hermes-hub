<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useHubStore } from '@/stores/hub'

const hubStore = useHubStore()
const { toastVisible, toastTitle, toastMessage } = storeToRefs(hubStore)
</script>

<template>
  <Transition name="toast">
    <div v-if="toastVisible" class="fixed bottom-6 right-6 z-20 w-[330px] rounded-md border border-snow/10 bg-carbon/95 p-4 shadow-dramatic">
      <strong class="mb-1 block text-snow">{{ toastTitle }}</strong>
      <span class="text-[13px] text-slate">{{ toastMessage }}</span>
    </div>
  </Transition>
</template>
