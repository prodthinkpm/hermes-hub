<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    variant?: 'default' | 'primary' | 'green' | 'red'
    type?: 'button' | 'submit' | 'reset'
  }>(),
  {
    variant: 'default',
    type: 'button',
  },
)

const classes = computed(() => {
  const base = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-3.5 text-[13px] font-bold transition hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:cursor-not-allowed disabled:opacity-60'
  const variants = {
    default: 'border-snow/10 bg-snow/[.055] text-snow hover:bg-snow/[.09]',
    primary: 'border-signal/45 bg-signal text-abyss shadow-ambient hover:bg-mint',
    green: 'border-signal/30 bg-signal/10 text-signal',
    red: 'border-danger/35 bg-danger/10 text-danger',
  }
  return `${base} ${variants[props.variant]}`
})
</script>

<template>
  <button :type="type" :class="classes">
    <slot />
  </button>
</template>
