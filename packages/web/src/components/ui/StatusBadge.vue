<script setup lang="ts">
import { computed } from 'vue'
import type { BadgeTone } from '@/types/hub'

const props = defineProps<{
  tone: BadgeTone
}>()

const badgeClass = computed(() => {
  const map: Record<BadgeTone, string> = {
    running: 'border-signal/30 bg-signal/10 text-signal',
    stopped: 'border-slate/25 bg-slate/10 text-parchment',
    warn: 'border-warning/30 bg-warning/10 text-warning',
    bad: 'border-danger/35 bg-danger/10 text-danger',
    info: 'border-info/30 bg-info/10 text-info',
    purple: 'border-mint/30 bg-mint/10 text-mint',
  }
  return `inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-xs font-extrabold ${map[props.tone]}`
})
</script>

<template>
  <span :class="badgeClass">
    <slot />
  </span>
</template>
