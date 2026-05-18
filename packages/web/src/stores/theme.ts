import { ref, watch } from 'vue'
import { defineStore } from 'pinia'

export type ThemeMode = 'dark' | 'light'

export const useThemeStore = defineStore('theme', () => {
  const stored = localStorage.getItem('hermes-theme')
  const mode = ref<ThemeMode>(stored === 'light' ? 'light' : 'dark')

  function apply() {
    const el = document.documentElement
    if (mode.value === 'light') {
      el.setAttribute('data-theme', 'light')
    } else {
      el.removeAttribute('data-theme')
    }
    localStorage.setItem('hermes-theme', mode.value)
  }

  function toggle() {
    mode.value = mode.value === 'dark' ? 'light' : 'dark'
  }

  watch(mode, apply, { immediate: true })

  return { mode, toggle, apply }
})
