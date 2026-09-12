;(() => {
  let saved = 'system'
  try {
    const stored = localStorage.getItem('theme')
    if (stored === 'light' || stored === 'dark') saved = stored
  } catch {
    // The default system theme still works when browser storage is unavailable.
  }

  const dark = matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.dataset.themeMode = saved
  document.documentElement.dataset.theme = saved === 'system' ? (dark ? 'dark' : 'light') : saved
})()
