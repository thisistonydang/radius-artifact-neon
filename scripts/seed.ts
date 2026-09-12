import './load-env.js'
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { eq, notInArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { rubberDuckGuide, starterTodos as seedTodos } from '../seed/todos.js'
import { normalizePostgresUrl } from '../src/db/connection.js'
import { starterAttachments, starterTodos } from '../src/db/schema.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is required. Run `neon env pull`.')
if (!process.env.AWS_ENDPOINT_URL_S3) {
  throw new Error('Object Storage environment variables are required. Run `neon deploy`, then `neon env pull`.')
}

const pool = new Pool({ connectionString: normalizePostgresUrl(connectionString), max: 2 })
const db = drizzle(pool)
const s3 = new S3Client({ forcePathStyle: true })
const bucket = 'attachments'

const seededIds = new Map<string, string>()
for (const todo of seedTodos) {
  const [row] = await db
    .insert(starterTodos)
    .values(todo)
    .onConflictDoUpdate({
      target: starterTodos.slug,
      set: { title: todo.title, completed: todo.completed, position: todo.position, updatedAt: new Date() },
    })
    .returning({ id: starterTodos.id, slug: starterTodos.slug })
  seededIds.set(row.slug, row.id)
}

await db.delete(starterTodos).where(notInArray(starterTodos.slug, seedTodos.map((todo) => todo.slug)))

const guideBody = Buffer.from(rubberDuckGuide)
const guideKey = 'starter/rubber-duck-review-guide.md'
await s3.send(
  new PutObjectCommand({
    Bucket: bucket,
    Key: guideKey,
    Body: guideBody,
    ContentType: 'text/markdown',
    CacheControl: 'public, max-age=3600',
  }),
)

const rubberDuckId = seededIds.get('rubber-duck-review')
if (!rubberDuckId) throw new Error('Rubber duck starter todo was not seeded')
const [existingAttachment] = await db
  .select({ id: starterAttachments.id })
  .from(starterAttachments)
  .where(eq(starterAttachments.starterTodoId, rubberDuckId))
  .limit(1)

const attachmentValues = {
  starterTodoId: rubberDuckId,
  storageKey: guideKey,
  fileName: 'rubber-duck-review-guide.md',
  contentType: 'text/markdown',
  byteSize: guideBody.byteLength,
}
if (existingAttachment) {
  await db
    .update(starterAttachments)
    .set(attachmentValues)
    .where(eq(starterAttachments.id, existingAttachment.id))
} else {
  await db.insert(starterAttachments).values(attachmentValues)
}

const oldFactObjects = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'facts/' }))
if (oldFactObjects.Contents?.length) {
  await s3.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: oldFactObjects.Contents.flatMap((object) => (object.Key ? [{ Key: object.Key }] : [])) },
    }),
  )
}

await pool.end()
console.log(`Seeded ${seedTodos.length} starter todos and one example attachment.`)
