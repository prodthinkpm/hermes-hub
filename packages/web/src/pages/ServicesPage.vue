<script setup lang="ts">
import { services } from '@/data/dashboard'
import UiButton from '@/components/ui/UiButton.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import SectionTitle from '@/components/ui/SectionTitle.vue'
import CommandBox from '@/components/ui/CommandBox.vue'
</script>

<template>
  <div class="p-7 max-[760px]:p-[18px]">
    <SectionTitle>
      <template #title>Gateway / API Server</template>
      <template #subtitle>Hub 不直接替代 Hermes Gateway，而是批量配置和守护每个 Profile 的 gateway 与 OpenAI-compatible API server。</template>
      <template #actions><UiButton variant="primary">批量应用配置</UiButton></template>
    </SectionTitle>

    <div class="grid grid-cols-3 gap-4 max-[1180px]:grid-cols-2 max-[760px]:grid-cols-1">
      <article v-for="service in services" :key="service.title" class="content-card">
        <StatusBadge :tone="service.tone">{{ service.status }}</StatusBadge>
        <h3>{{ service.title }}</h3>
        <p>{{ service.description }}</p>
        <CommandBox>{{ service.command }}</CommandBox>
      </article>
    </div>
  </div>
</template>
