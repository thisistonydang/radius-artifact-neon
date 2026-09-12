import './load-env.js'
import { mkdir, writeFile } from 'node:fs/promises'

const config = {
  apiUrl: process.env.PUBLIC_API_URL ?? 'http://localhost:8787',
  authUrl: process.env.PUBLIC_NEON_AUTH_URL ?? '',
}

await mkdir('dist', { recursive: true })
await writeFile('dist/config.json', `${JSON.stringify(config, null, 2)}\n`)
console.log('Wrote public runtime configuration to dist/config.json.')
