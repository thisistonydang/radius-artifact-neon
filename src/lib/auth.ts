import { createAuthClient } from '@neondatabase/neon-js/auth'

const authUrl = window.APP_CONFIG?.authUrl?.replace(/\/$/, '') ?? ''

export const authClient = authUrl ? createAuthClient(authUrl) : null

export async function getAuthToken() {
  if (!authClient) return null
  const result = await authClient.token()
  if (result.error) throw new Error(result.error.message ?? 'Could not create an access token.')
  return result.data?.token ?? null
}
