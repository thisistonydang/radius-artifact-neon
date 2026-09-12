export function normalizePostgresUrl(value: string) {
  const url = new URL(value)
  const sslMode = url.searchParams.get('sslmode')
  if (sslMode === 'prefer' || sslMode === 'require' || sslMode === 'verify-ca') {
    url.searchParams.set('sslmode', 'verify-full')
  }
  return url.toString()
}
