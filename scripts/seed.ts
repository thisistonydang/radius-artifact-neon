import './load-env.js'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as simpleIcons from 'simple-icons'
import { normalizePostgresUrl } from '../src/db/connection.js'
import { factAssets, facts } from '../src/db/schema.js'
import { seedFacts } from '../seed/facts.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is required. Run `neon env pull`.')
if (!process.env.AWS_ENDPOINT_URL_S3) {
  throw new Error('Object Storage environment variables are required. Run `neon deploy`, then `neon env pull`.')
}

const pool = new Pool({ connectionString: normalizePostgresUrl(connectionString), max: 2 })
const db = drizzle(pool)
const s3 = new S3Client({ forcePathStyle: true })
const bucket = 'attachments'

type SimpleIcon = { slug: string; title: string; svg: string; hex: string }
const exportedIcons = simpleIcons as unknown as Record<string, SimpleIcon>
const iconBySlug = new Map(
  Object.values(exportedIcons)
    .filter((value) => typeof value?.slug === 'string' && typeof value?.svg === 'string')
    .map((icon) => [icon.slug, icon]),
)

function fallbackSvg(name: string) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 3)
    .toUpperCase()
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="${name}"><rect width="128" height="128" fill="#252f3d"/><rect x="8" y="8" width="112" height="112" fill="none" stroke="#6a9fcc" stroke-width="2"/><text x="64" y="72" fill="#ebe7e4" font-family="ui-monospace,monospace" font-size="30" text-anchor="middle">${initials}</text></svg>`
}

for (const fact of seedFacts) {
  const [row] = await db
    .insert(facts)
    .values(fact)
    .onConflictDoUpdate({
      target: facts.slug,
      set: {
        name: fact.name,
        category: fact.category,
        summary: fact.summary,
        funFact: fact.funFact,
        sourceUrl: fact.sourceUrl,
        updatedAt: new Date(),
      },
    })
    .returning({ id: facts.id })

  const icon = fact.iconSlug ? iconBySlug.get(fact.iconSlug) : undefined
  const svg = icon ? icon.svg.replace('<svg ', `<svg fill="#${icon.hex}" `) : fallbackSvg(fact.name)
  const storageKey = `facts/${fact.slug}.svg`
  const body = Buffer.from(svg)

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Body: body,
      ContentType: 'image/svg+xml',
      CacheControl: 'public, max-age=86400',
    }),
  )

  const [existing] = await db
    .select({ id: factAssets.id })
    .from(factAssets)
    .where(eq(factAssets.factId, row.id))
    .limit(1)

  if (existing) {
    await db
      .update(factAssets)
      .set({ storageKey, fileName: `${fact.slug}.svg`, contentType: 'image/svg+xml', byteSize: body.byteLength })
      .where(eq(factAssets.id, existing.id))
  } else {
    await db.insert(factAssets).values({
      factId: row.id,
      storageKey,
      fileName: `${fact.slug}.svg`,
      contentType: 'image/svg+xml',
      byteSize: body.byteLength,
    })
  }
}

await pool.end()
console.log(`Seeded ${seedFacts.length} web development facts and logo attachments.`)
