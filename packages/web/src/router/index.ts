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
    { path: '/profile', redirect: '/profiles' },
    { path: '/context', redirect: '/profiles' },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior() {
    return { top: 0, behavior: 'smooth' }
  },
})
