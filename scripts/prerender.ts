import { readFile, rm, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const outputDirectory = resolve('.svelte-ssr')
const serverEntry = pathToFileURL(resolve(outputDirectory, 'entry-server.js')).href
const { prerender } = (await import(serverEntry)) as { prerender: () => { body: string } }
const { body } = prerender()
if (!body.includes('todo-skeleton') || !body.includes('Neon Functions') || !body.includes('Built with')) {
  throw new Error('The prerendered page shell is missing expected static content.')
}
const indexPath = resolve('dist/index.html')
const index = await readFile(indexPath, 'utf8')
const marker = '<div id="app"></div>'
if (!index.includes(marker)) throw new Error('Could not find the application mount point while prerendering.')
await writeFile(indexPath, index.replace(marker, `<div id="app">${body}</div>`))
await rm(outputDirectory, { recursive: true, force: true })
console.log('Prerendered the static page shell into dist/index.html.')
