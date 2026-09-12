import { mount } from 'svelte'
import './app.css'

try {
  const response = await fetch(new URL('./config.json', window.location.href))
  if (response.ok) window.APP_CONFIG = await response.json()
} catch {
  // Local defaults in the API client keep the app usable without a config file.
}

const { default: App } = await import('./App.svelte')
mount(App, { target: document.getElementById('app')! })
