import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { neon as neonModel } from '@neon/ai-sdk-provider'
import { attachDatabasePool } from '@neon/functions'
import { generateText } from 'ai'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { Pool } from 'pg'
import { z } from 'zod'
import { normalizePostgresUrl } from '../src/db/connection.js'
import { attachments, factAssets, facts, notes } from '../src/db/schema.js'

const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_ATTACHMENTS = 3
const BUCKET = 'attachments'
const ALLOWED_FILE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'application/pdf',
  'text/markdown',
  'text/plain',
])

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is required')

const pool = new Pool({ connectionString: normalizePostgresUrl(connectionString), max: 5 })
attachDatabasePool(pool)
const db = drizzle(pool)
const s3 = new S3Client({ forcePathStyle: true })

type AppEnv = { Variables: { userId: string } }
const app = new Hono<AppEnv>()
const configuredOrigins = new Set(
  (process.env.APP_ORIGINS ?? 'http://localhost:5173,http://localhost:4173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
)

function corsHeaders(origin: string | undefined): Record<string, string> {
  if (!origin || (!configuredOrigins.has(origin) && !configuredOrigins.has('*'))) return {}
  return {
    'Access-Control-Allow-Origin': configuredOrigins.has('*') ? '*' : origin,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

app.use('*', async (c, next) => {
  const origin = c.req.header('origin')
  if (c.req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }
  await next()
  for (const [name, value] of Object.entries(corsHeaders(origin))) c.header(name, value)
})

app.onError((error, c) => {
  console.error(error)
  return c.json({ error: 'The backend could not complete this request.' }, 500)
})

app.get('/health', (c) =>
  c.json({
    ok: true,
    service: 'web dev fun facts API',
    branch: process.env.NEON_BRANCH ?? 'local',
  }),
)

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined

async function requireUser(c: Context<AppEnv>, next: Next) {
  const auth = c.req.header('authorization')
  if (!auth?.toLowerCase().startsWith('bearer ')) return c.json({ error: 'Sign in required.' }, 401)

  const jwksUrl = process.env.NEON_AUTH_JWKS_URL
  const authBaseUrl = process.env.NEON_AUTH_BASE_URL
  if (!jwksUrl || !authBaseUrl) return c.json({ error: 'Authentication is not configured.' }, 503)

  try {
    jwks ??= createRemoteJWKSet(new URL(jwksUrl))
    const issuer = new URL(authBaseUrl).origin
    const { payload } = await jwtVerify(auth.slice(7), jwks, { issuer, audience: issuer })
    if (!payload.sub) throw new Error('Token has no subject')
    c.set('userId', payload.sub)
    await next()
  } catch {
    return c.json({ error: 'Your session is invalid or expired.' }, 401)
  }
}

app.use('/api/me/*', requireUser)

function safeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'file'
}

async function signedDownloadUrl(storageKey: string) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: storageKey }), { expiresIn: 3600 })
}

app.get('/api/facts', async (c) => {
  const rows = await db
    .select({ fact: facts, asset: factAssets })
    .from(facts)
    .leftJoin(factAssets, eq(facts.id, factAssets.factId))
    .orderBy(asc(facts.category), asc(facts.name))

  const data = await Promise.all(
    rows.map(async ({ fact, asset }) => ({
      ...fact,
      logoUrl: asset ? await signedDownloadUrl(asset.storageKey) : null,
      attachmentName: asset?.fileName ?? null,
    })),
  )

  return c.json({ facts: data })
})

const questionInput = z.object({ question: z.string().trim().min(2).max(500) })

async function answerQuestion(question: string, context: string, scope: string) {
  const model = process.env.AI_MODEL ?? 'gpt-5-mini'
  const result = await generateText({
    model: neonModel(model),
    system: [
      `You are the concise archivist for ${scope}.`,
      'Answer only from the supplied notes.',
      'If the notes do not answer the question, say so plainly.',
      'Mention note titles in square brackets when using them as evidence.',
      'Keep the answer under 180 words.',
    ].join(' '),
    prompt: `NOTES\n${context}\n\nQUESTION\n${question}`,
    maxOutputTokens: 500,
  })
  return result.text
}

app.post('/api/chat/public', async (c) => {
  if (process.env.PUBLIC_CHAT_ENABLED === 'false') {
    return c.json({ error: 'Public chat is temporarily disabled.' }, 503)
  }
  const parsed = questionInput.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Enter a question between 2 and 500 characters.' }, 400)

  const rows = await db.select().from(facts).orderBy(asc(facts.name))
  const context = rows
    .map((fact) => `[${fact.name}]\nCategory: ${fact.category}\n${fact.summary}\nFun fact: ${fact.funFact}`)
    .join('\n\n')
  const answer = await answerQuestion(parsed.data.question, context, 'the public web dev fun facts')
  return c.json({ answer })
})

const noteInput = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(5000),
})

async function listNotes(userId: string) {
  const noteRows = await db
    .select()
    .from(notes)
    .where(eq(notes.userId, userId))
    .orderBy(desc(notes.updatedAt))
  if (noteRows.length === 0) return []

  const attachmentRows = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.userId, userId), inArray(attachments.noteId, noteRows.map((note) => note.id))))
    .orderBy(asc(attachments.createdAt))

  return noteRows.map((note) => ({
    ...note,
    attachments: attachmentRows.filter((attachment) => attachment.noteId === note.id),
  }))
}

app.get('/api/me/notes', async (c) => c.json({ notes: await listNotes(c.get('userId')) }))

app.post('/api/me/notes', async (c) => {
  const parsed = noteInput.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'A title and note text are required.' }, 400)

  const userId = c.get('userId')
  const existing = await db.select({ id: notes.id }).from(notes).where(eq(notes.userId, userId)).limit(51)
  if (existing.length >= 50) return c.json({ error: 'This demo allows up to 50 notes per user.' }, 400)

  const [note] = await db.insert(notes).values({ userId, ...parsed.data }).returning()
  return c.json({ note: { ...note, attachments: [] } }, 201)
})

app.put('/api/me/notes/:id', async (c) => {
  const parsed = noteInput.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'A title and note text are required.' }, 400)

  const [note] = await db
    .update(notes)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(notes.id, c.req.param('id')), eq(notes.userId, c.get('userId'))))
    .returning()
  if (!note) return c.json({ error: 'Note not found.' }, 404)
  return c.json({ note })
})

app.delete('/api/me/notes/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const files = await db
    .select({ storageKey: attachments.storageKey })
    .from(attachments)
    .where(and(eq(attachments.noteId, id), eq(attachments.userId, userId)))
  const [deleted] = await db
    .delete(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .returning({ id: notes.id })
  if (!deleted) return c.json({ error: 'Note not found.' }, 404)

  await Promise.allSettled(
    files.map(({ storageKey }) => s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: storageKey }))),
  )
  return c.json({ ok: true })
})

const uploadInput = z.object({
  fileName: z.string().trim().min(1).max(140),
  contentType: z.string().trim(),
  byteSize: z.number().int().positive().max(MAX_FILE_BYTES),
})

app.post('/api/me/notes/:id/attachments/presign', async (c) => {
  const parsed = uploadInput.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success || !ALLOWED_FILE_TYPES.has(parsed.data?.contentType ?? '')) {
    return c.json({ error: 'Use a PNG, JPEG, PDF, Markdown, or text file up to 5 MB.' }, 400)
  }

  const userId = c.get('userId')
  const noteId = c.req.param('id')
  const [note] = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .limit(1)
  if (!note) return c.json({ error: 'Note not found.' }, 404)

  const existing = await db
    .select({ id: attachments.id })
    .from(attachments)
    .where(and(eq(attachments.noteId, noteId), eq(attachments.userId, userId)))
  if (existing.length >= MAX_ATTACHMENTS) {
    return c.json({ error: `A note can have up to ${MAX_ATTACHMENTS} attachments.` }, 400)
  }

  const fileName = safeFileName(parsed.data.fileName)
  const storageKey = `users/${userId}/${noteId}/${crypto.randomUUID()}-${fileName}`
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: storageKey,
      ContentType: parsed.data.contentType,
      ContentLength: parsed.data.byteSize,
    }),
    { expiresIn: 300 },
  )

  return c.json({ uploadUrl, storageKey, fileName, expiresIn: 300 })
})

const completeUploadInput = uploadInput.extend({ storageKey: z.string().min(1).max(500) })

app.post('/api/me/notes/:id/attachments/complete', async (c) => {
  const parsed = completeUploadInput.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success || !ALLOWED_FILE_TYPES.has(parsed.data?.contentType ?? '')) {
    return c.json({ error: 'Invalid attachment information.' }, 400)
  }

  const userId = c.get('userId')
  const noteId = c.req.param('id')
  const expectedPrefix = `users/${userId}/${noteId}/`
  if (!parsed.data.storageKey.startsWith(expectedPrefix)) return c.json({ error: 'Invalid storage key.' }, 400)

  const [note] = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .limit(1)
  if (!note) return c.json({ error: 'Note not found.' }, 404)

  const stored = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: parsed.data.storageKey }))
  const storedBytes = stored.ContentLength ?? 0
  if (storedBytes <= 0 || storedBytes > MAX_FILE_BYTES) return c.json({ error: 'Uploaded file has an invalid size.' }, 400)

  const [attachment] = await db
    .insert(attachments)
    .values({
      noteId,
      userId,
      storageKey: parsed.data.storageKey,
      fileName: safeFileName(parsed.data.fileName),
      contentType: parsed.data.contentType,
      byteSize: storedBytes,
    })
    .returning()
  return c.json({ attachment }, 201)
})

app.get('/api/me/attachments/:id/url', async (c) => {
  const [attachment] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, c.req.param('id')), eq(attachments.userId, c.get('userId'))))
    .limit(1)
  if (!attachment) return c.json({ error: 'Attachment not found.' }, 404)
  return c.json({ url: await signedDownloadUrl(attachment.storageKey), expiresIn: 3600 })
})

app.delete('/api/me/attachments/:id', async (c) => {
  const [attachment] = await db
    .delete(attachments)
    .where(and(eq(attachments.id, c.req.param('id')), eq(attachments.userId, c.get('userId'))))
    .returning()
  if (!attachment) return c.json({ error: 'Attachment not found.' }, 404)
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: attachment.storageKey }))
  return c.json({ ok: true })
})

app.post('/api/me/chat', async (c) => {
  const parsed = questionInput.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Enter a question between 2 and 500 characters.' }, 400)

  const rows = await db
    .select({ title: notes.title, body: notes.body })
    .from(notes)
    .where(eq(notes.userId, c.get('userId')))
    .orderBy(desc(notes.updatedAt))
    .limit(50)
  if (rows.length === 0) return c.json({ error: 'Create a note before asking about your notes.' }, 400)

  const context = rows.map((note) => `[${note.title}]\n${note.body}`).join('\n\n')
  const answer = await answerQuestion(parsed.data.question, context, 'the signed-in user’s private notes')
  return c.json({ answer })
})

export default app
