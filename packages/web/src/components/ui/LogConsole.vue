<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import type { LogEntry } from '@/types/hub'

const props = withDefaults(
  defineProps<{
    logs: LogEntry[]
    title: string
    bodyClass?: string
  }>(),
  {
    bodyClass: 'h-[325px]',
  },
)

const bodyRef = ref<HTMLDivElement | null>(null)

function toneClass(tone: LogEntry['tone']): string {
  const map: Record<LogEntry['tone'], string> = {
    '': '',
    ok: 'text-signal',
    err: 'text-danger',
    yellow: 'text-warning',
  }
  return map[tone]
}

function scrollToBottom(): void {
  const el = bodyRef.value
  if (el) el.scrollTop = el.scrollHeight
}

onMounted(() => {
  void nextTick(() => {
    scrollToBottom()
  })
})

watch(
  () => props.logs.length,
  () => {
    void nextTick(() => {
      scrollToBottom()
    })
  },
)

defineExpose({ scrollToBottom })
</script>

<template>
  <div class="overflow-hidden rounded-md border border-snow/10 bg-abyss">
    <div class="flex h-[42px] min-w-0 items-center gap-2 border-b border-snow/10 bg-snow/[.035] px-3.5">
      <span class="size-2.5 shrink-0 rounded-full bg-[#ff5f56]"></span>
      <span class="size-2.5 shrink-0 rounded-full bg-[#ffbd2e]"></span>
      <span class="size-2.5 shrink-0 rounded-full bg-[#27c93f]"></span>
      <span class="ml-2 min-w-0 flex-1 truncate whitespace-nowrap font-mono text-xs text-slate" :title="title">{{ title }}</span>
    </div>
    <div ref="bodyRef" class="console-body overflow-auto p-3.5 font-mono text-xs leading-7 text-parchment" :class="bodyClass">
      <div v-if="logs.length === 0" class="text-slate">No matching log lines.</div>
      <div v-for="log in logs" :key="log.id" class="grid grid-cols-[74px_240px_minmax(0,1fr)] items-start gap-2.5">
        <span class="text-slate">{{ log.time }}</span>
        <span class="min-w-0 truncate whitespace-nowrap text-mint" :title="log.source">{{ log.source }}</span>
        <span class="min-w-0 whitespace-pre-wrap break-all" :class="toneClass(log.tone)">{{ log.message }}</span>
      </div>
    </div>
  </div>
</template>
