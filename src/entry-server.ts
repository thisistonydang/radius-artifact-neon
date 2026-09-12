import { render } from 'svelte/server'
import App from './App.svelte'

export function prerender() {
  return render(App)
}
