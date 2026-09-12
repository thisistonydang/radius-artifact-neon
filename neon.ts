import { defineConfig } from '@neon/config/v1'

export default defineConfig({
  auth: true,
  preview: {
    aiGateway: true,
    buckets: {
      attachments: {
        access: 'private',
      },
    },
    functions: {
      webdevfacts: {
        name: 'simple todos API',
        source: './functions/api.ts',
        env: {
          APP_ORIGINS: process.env.APP_ORIGINS ?? 'http://localhost:5173,http://localhost:4173',
          AI_MODEL: process.env.AI_MODEL ?? 'gpt-5-mini',
          PUBLIC_CHAT_ENABLED: process.env.PUBLIC_CHAT_ENABLED ?? 'true',
        },
      },
    },
  },
  branch: (branch) => {
    if (branch.isDefault || branch.name === 'dev') return {}
    return { ttl: '7d' }
  },
})
