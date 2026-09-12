export type ThemeMode = 'system' | 'light' | 'dark'

export function loadTheme(): ThemeMode {
  try {
    const mode = localStorage.getItem('theme')
    return mode === 'light' || mode === 'dark' ? mode : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(mode: ThemeMode) {
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const theme = mode === 'system' ? (dark ? 'dark' : 'light') : mode
  document.documentElement.dataset.themeMode = mode
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem('theme', mode)
  } catch {
    // Theme switching still works for this page when browser storage is unavailable.
  }
}
