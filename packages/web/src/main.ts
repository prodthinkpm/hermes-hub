import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from '@/App.vue'
import { router } from '@/router'
import { useThemeStore } from '@/stores/theme'
import '@/styles.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

// Apply theme before first paint — store is already initialized by Pinia
const themeStore = useThemeStore()
themeStore.apply()
