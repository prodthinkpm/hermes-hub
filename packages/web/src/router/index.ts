import { createRouter, createWebHistory } from 'vue-router'
import DashboardPage from '@/pages/DashboardPage.vue'
import ProfilesPage from '@/pages/ProfilesPage.vue'
import type { RouteKey } from '@/types/hub'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'dashboard' satisfies RouteKey, component: DashboardPage },
    { path: '/profiles', name: 'profiles' satisfies RouteKey, component: ProfilesPage },
    { path: '/create', name: 'create' satisfies RouteKey, component: () => import('@/pages/CreateProfilePage.vue') },
    { path: '/profiles/:id/logs', name: 'profileLogs' satisfies RouteKey, component: () => import('@/pages/ProfileLogsPage.vue') },
    { path: '/profiles/:id', name: 'profile' satisfies RouteKey, component: () => import('@/pages/ProfileDetailPage.vue') },
    { path: '/services', name: 'services' satisfies RouteKey, component: () => import('@/pages/ServicesPage.vue') },
    { path: '/logs', name: 'logs' satisfies RouteKey, component: () => import('@/pages/LogsPage.vue') },
    { path: '/settings', name: 'settings' satisfies RouteKey, component: () => import('@/pages/SettingsPage.vue') },
    { path: '/nodes', name: 'nodes' satisfies RouteKey, component: () => import('@/pages/NodesPage.vue') },
    { path: '/nodes/:id', name: 'nodeDetail' satisfies RouteKey, component: () => import('@/pages/NodeDetailPage.vue') },
    { path: '/profile', redirect: '/profiles' },
    { path: '/context', redirect: '/profiles' },
    { path: '/login', name: 'login' satisfies RouteKey, component: () => import('@/pages/LoginPage.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior() {
    return { top: 0, behavior: 'smooth' }
  },
})

// Auth guard (Phase 9)
router.beforeEach(async (to) => {
  const { useAuthStore } = await import('@/stores/auth')
  const authStore = useAuthStore()

  // 已登录访问 /login → 重定向到首页
  if (to.name === 'login' && authStore.isAuthenticated) {
    return '/'
  }

  // 未登录访问非 /login 页面 → 重定向到登录页
  if (to.name !== 'login' && !authStore.isAuthenticated) {
    // 尝试恢复会话
    const restored = await authStore.checkStatus()
    if (restored) return true
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  return true
})
