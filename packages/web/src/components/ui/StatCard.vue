<script setup lang="ts">
import type { StatItem } from '@/types/hub'

defineProps<{
  stat: StatItem
}>()
</script>

<template>
  <article class="rounded-md border border-snow/10 bg-carbon/80 p-[18px] shadow-ambient">
    <small class="flex justify-between text-[13px] text-slate">
      <b>{{ stat.label }}</b>
      <em>{{ stat.icon }}</em>
    </small>
    <strong class="mt-4 block text-[31px] font-extrabold tracking-[-.05em] text-snow">{{ stat.value }}</strong>
    <span class="mt-2 block text-xs text-signal">{{ stat.hint }}</span>
  </article>
</template>
