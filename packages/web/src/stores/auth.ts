import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { HermesApiClient, type HubUser } from '@hermes-hub/core'

const api = new HermesApiClient()

const AUTH_TOKEN_KEY = 'hermes-hub-auth-token'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(AUTH_TOKEN_KEY) || null)
  const user = ref<HubUser | null>(null)
  const loginError = ref<string | null>(null)
  const isLoggingIn = ref(false)

  const isAuthenticated = computed(() => token.value !== null && user.value !== null)
  const isAdmin = computed(() => user.value?.role === 'admin')
  const isOperator = computed(() => user.value?.role === 'operator' || user.value?.role === 'admin')

  // 初始化时恢复 token 到 API 客户端
  if (token.value) {
    api.setAuthToken(token.value)
  }

  async function checkStatus(): Promise<boolean> {
    if (!token.value) return false
    const result = await api.getAuthStatus()
    if (result.ok && result.data?.authenticated && result.data.user) {
      user.value = result.data.user as HubUser
      return true
    }
    // Token 无效，清除
    logout()
    return false
  }

  async function login(username: string, password: string): Promise<boolean> {
    isLoggingIn.value = true
    loginError.value = null
    const result = await api.login(username, password)
    if (result.ok && result.data) {
      token.value = result.data.token
      user.value = result.data.user
      api.setAuthToken(result.data.token)
      localStorage.setItem(AUTH_TOKEN_KEY, result.data.token)
      isLoggingIn.value = false
      return true
    }
    loginError.value = result.error ?? 'Login failed'
    isLoggingIn.value = false
    return false
  }

  function logout(): void {
    token.value = null
    user.value = null
    loginError.value = null
    api.clearAuthToken()
    localStorage.removeItem(AUTH_TOKEN_KEY)
  }

  return {
    token,
    user,
    loginError,
    isLoggingIn,
    isAuthenticated,
    isAdmin,
    isOperator,
    checkStatus,
    login,
    logout,
  }
})
