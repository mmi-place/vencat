import './assets/main.css'
import '@fontsource-variable/nunito';

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './scripts/pwa'
import './scripts/catalogueSync'

const app = createApp(App)

app.use(router)

app.mount('#app')

// Discard the obsolete device subscription management token.
try { localStorage.removeItem('vencat:push-token'); } catch { /* Storage can be blocked. */ }
