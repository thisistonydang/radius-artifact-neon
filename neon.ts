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
      todos: {
        name: 'simple todos API',
        source: './functions/api.ts',
        env: {
          APP_ORIGINS: process.env.APP_ORIGINS ?? 'http://localhost:5173,http://localhost:4173',
          AI_MODEL: process.env.AI_MODEL ?? 'gpt-5-mini',
          PUBLIC_CHAT_ENABLED: process.env.PUBLIC_CHAT_ENABLED ?? 'true',
          PUBLIC_CHAT_IP_LIMIT: process.env.PUBLIC_CHAT_IP_LIMIT ?? '20',
          PUBLIC_CHAT_GLOBAL_LIMIT: process.env.PUBLIC_CHAT_GLOBAL_LIMIT ?? '500',
          UPLOAD_HOURLY_LIMIT: process.env.UPLOAD_HOURLY_LIMIT ?? '20',
          RATE_LIMIT_SALT: process.env.RATE_LIMIT_SALT!,
        },
      },
    },
  },
  branch: (branch) => {
    if (branch.isDefault || branch.name === 'dev' || branch.name === 'production') return {}
    return { ttl: '7d' }
  },
})
