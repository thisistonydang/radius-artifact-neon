import './load-env.js'
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { notInArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { starterAttachmentSeeds, starterTodos as seedTodos } from '../seed/todos.js'
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

for (const attachment of starterAttachmentSeeds) {
  const starterTodoId = seededIds.get(attachment.todoSlug)
  if (!starterTodoId) throw new Error(`Starter todo ${attachment.todoSlug} was not seeded`)

  const body = Buffer.from(attachment.body)
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: attachment.storageKey,
      Body: body,
      ContentType: attachment.contentType,
      CacheControl: 'public, max-age=3600',
    }),
  )

  await db
    .insert(starterAttachments)
    .values({
      starterTodoId,
      storageKey: attachment.storageKey,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      byteSize: body.byteLength,
    })
    .onConflictDoUpdate({
      target: starterAttachments.starterTodoId,
      set: {
        storageKey: attachment.storageKey,
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        byteSize: body.byteLength,
      },
    })
}

const attachmentKeys = starterAttachmentSeeds.map((attachment) => attachment.storageKey)
await db.delete(starterAttachments).where(notInArray(starterAttachments.storageKey, attachmentKeys))

const starterObjects = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'starter/' }))
const staleStarterObjects =
  starterObjects.Contents?.flatMap((object) =>
    object.Key && !attachmentKeys.includes(object.Key) ? [{ Key: object.Key }] : [],
  ) ?? []
if (staleStarterObjects.length) {
  await s3.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: staleStarterObjects },
    }),
  )
}


await pool.end()
console.log(`Seeded ${seedTodos.length} starter todos and ${starterAttachmentSeeds.length} example attachments.`)
