<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { computed } from 'vue'
import AppShell from '@/components/layout/AppShell.vue'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const authStore = useAuthStore()

const showShell = computed(() => route.name !== 'login')

onMounted(() => {
  // 恢复持久化会话
  if (authStore.token) {
    void authStore.checkStatus()
  }
})
</script>

<template>
  <AppShell v-if="showShell" />
  <RouterView v-else />
</template>
