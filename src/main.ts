import { hydrate, mount } from 'svelte'
import './app.css'

if (import.meta.env.DEV) {
  window.APP_CONFIG = {
    apiUrl: import.meta.env.PUBLIC_API_URL ?? 'http://localhost:8787',
    authUrl: import.meta.env.PUBLIC_NEON_AUTH_URL ?? '',
  }
} else {
  try {
    const response = await fetch(new URL('./config.json', window.location.href), {
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    })
    if (response.ok) window.APP_CONFIG = await response.json()
  } catch {
    // Runtime defaults keep the public view usable if config loading fails.
  }
}

const { default: App } = await import('./App.svelte')
const target = document.getElementById('app')!
if (target.hasChildNodes()) hydrate(App, { target })
else mount(App, { target })
