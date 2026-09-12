import { createInternalNeonAuth } from '@neondatabase/neon-js/auth'

const authUrl = window.APP_CONFIG?.authUrl?.replace(/\/$/, '') ?? ''
const neonAuth = authUrl ? createInternalNeonAuth(authUrl) : null

export const authClient = neonAuth?.adapter ?? null

export async function getAuthToken() {
  return (await neonAuth?.getJWTToken()) ?? null
}
