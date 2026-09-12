export {}

declare global {
  interface Window {
    APP_CONFIG?: {
      apiUrl?: string
      authUrl?: string
    }
  }
}
