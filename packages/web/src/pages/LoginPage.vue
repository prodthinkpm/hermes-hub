<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const error = ref('')

const redirectTo = (route.query.redirect as string) || '/'

onMounted(async () => {
  if (authStore.isAuthenticated) {
    router.replace(redirectTo)
  }
})

async function doLogin() {
  if (!username.value || !password.value) {
    error.value = 'Enter username and password.'
    return
  }
  const ok = await authStore.login(username.value, password.value)
  if (ok) {
    router.replace(redirectTo)
  } else {
    error.value = authStore.loginError ?? 'Login failed.'
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-abyss">
    <div class="w-full max-w-[400px] rounded-xl border border-snow/10 bg-carbon/90 p-8 shadow-ambient backdrop-blur-sm">
      <div class="mb-6 text-center">
        <div class="mx-auto mb-3 grid size-[52px] place-items-center rounded-md border border-signal/30 bg-signal text-abyss font-black">H</div>
        <h1 class="text-xl font-extrabold tracking-[-.02em] text-snow">Hermes Hub</h1>
        <p class="mt-1.5 text-[13px] text-slate">Sign in to manage your agents.</p>
      </div>

      <form @submit.prevent="doLogin" class="grid gap-3.5">
        <div>
          <label class="mb-1.5 block text-[12px] font-bold text-slate uppercase tracking-[.08em]">Username</label>
          <input
            v-model="username"
            class="h-11 w-full rounded-md border border-snow/10 bg-snow/[.045] px-3.5 text-[14px] text-parchment outline-none transition focus:border-signal/40"
            placeholder="admin"
            autocomplete="username"
          />
        </div>
        <div>
          <label class="mb-1.5 block text-[12px] font-bold text-slate uppercase tracking-[.08em]">Password</label>
          <input
            v-model="password"
            type="password"
            class="h-11 w-full rounded-md border border-snow/10 bg-snow/[.045] px-3.5 text-[14px] text-parchment outline-none transition focus:border-signal/40"
            placeholder="Password"
            autocomplete="current-password"
          />
        </div>

        <p v-if="error" class="text-[13px] text-red font-bold">{{ error }}</p>

        <button
          type="submit"
          class="mt-1 h-11 w-full rounded-md bg-signal text-[14px] font-extrabold text-abyss transition hover:bg-signal/85"
          :disabled="authStore.isLoggingIn"
        >
          {{ authStore.isLoggingIn ? 'Signing in...' : 'Sign In' }}
        </button>
      </form>
    </div>
  </div>
</template>
