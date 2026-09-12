export type ThemeMode = 'system' | 'light' | 'dark'

export function applyTheme(mode: ThemeMode) {
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const theme = mode === 'system' ? (dark ? 'dark' : 'light') : mode
  document.documentElement.dataset.themeMode = mode
  document.documentElement.dataset.theme = theme
  localStorage.setItem('theme', mode)
}
