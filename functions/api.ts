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
import { and, asc, eq, inArray, notInArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { Pool } from 'pg'
import { z } from 'zod'
import { normalizePostgresUrl } from '../src/db/connection.js'
import { attachments, starterAttachments, starterTodos, todos } from '../src/db/schema.js'

const MAX_TODOS = 10
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
  if (c.req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) })
  await next()
  for (const [name, value] of Object.entries(corsHeaders(origin))) c.header(name, value)
})

app.onError((error, c) => {
  console.error(error)
  return c.json({ error: 'The backend could not complete this request.' }, 500)
})

app.get('/health', (c) =>
  c.json({ ok: true, service: 'simple todos API', branch: process.env.NEON_BRANCH ?? 'local' }),
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

app.get('/api/starter-todos', async (c) => {
  const rows = await db
    .select({ todo: starterTodos, attachment: starterAttachments })
    .from(starterTodos)
    .leftJoin(starterAttachments, eq(starterTodos.id, starterAttachments.starterTodoId))
    .orderBy(asc(starterTodos.position))

  const data = await Promise.all(
    rows.map(async ({ todo, attachment }) => ({
      id: todo.id,
      slug: todo.slug,
      title: todo.title,
      completed: todo.completed,
      position: todo.position,
      attachment: attachment
        ? {
            id: attachment.id,
            fileName: attachment.fileName,
            url: await signedDownloadUrl(attachment.storageKey),
          }
        : null,
    })),
  )
  return c.json({ todos: data })
})

const todoForChat = z.object({ title: z.string().trim().min(1).max(200), completed: z.boolean() })
const chatInput = z.object({
  question: z.string().trim().min(2).max(500),
  todos: z.array(todoForChat).max(MAX_TODOS),
})

app.post('/api/chat', async (c) => {
  if (process.env.PUBLIC_CHAT_ENABLED === 'false') {
    return c.json({ error: 'Todo chat is temporarily disabled.' }, 503)
  }
  const parsed = chatInput.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Send a short question and no more than 10 todos.' }, 400)
  if (parsed.data.todos.length === 0) return c.json({ error: 'Add a todo before asking a question.' }, 400)

  const context = parsed.data.todos
    .map((todo, index) => `${index + 1}. [${todo.completed ? 'done' : 'open'}] ${todo.title}`)
    .join('\n')
  const result = await generateText({
    model: neonModel(process.env.AI_MODEL ?? 'gpt-5-mini'),
    system:
      'You are a concise, friendly todo assistant. Answer only from the supplied todo list. If the list does not answer the question, say so plainly. Keep the answer under 120 words.',
    prompt: `TODO LIST\n${context}\n\nQUESTION\n${parsed.data.question}`,
    maxOutputTokens: 350,
  })
  return c.json({ answer: result.text })
})

const cloudTodoInput = z.object({
  clientId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  completed: z.boolean(),
})
const workspaceInput = z.object({ todos: z.array(cloudTodoInput).max(MAX_TODOS) })

async function listCloudTodos(userId: string) {
  const todoRows = await db.select().from(todos).where(eq(todos.userId, userId)).orderBy(asc(todos.position))
  if (todoRows.length === 0) return []
  const attachmentRows = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.userId, userId), inArray(attachments.todoId, todoRows.map((todo) => todo.id))))
    .orderBy(asc(attachments.createdAt))

  return todoRows.map((todo) => ({
    id: todo.id,
    clientId: todo.clientId,
    title: todo.title,
    completed: todo.completed,
    position: todo.position,
    updatedAt: todo.updatedAt,
    attachments: attachmentRows.filter((attachment) => attachment.todoId === todo.id),
  }))
}

app.get('/api/me/todos', async (c) => c.json({ todos: await listCloudTodos(c.get('userId')) }))

app.put('/api/me/todos', async (c) => {
  const parsed = workspaceInput.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Save no more than 10 todos with short titles.' }, 400)

  const userId = c.get('userId')
  const clientIds = parsed.data.todos.map((todo) => todo.clientId)
  const existingTodos = await db.select().from(todos).where(eq(todos.userId, userId))
  const removed = existingTodos.filter((todo) => !clientIds.includes(todo.clientId))
  const removedFiles = removed.length
    ? await db
        .select({ storageKey: attachments.storageKey })
        .from(attachments)
        .where(and(eq(attachments.userId, userId), inArray(attachments.todoId, removed.map((todo) => todo.id))))
    : []

  await db.transaction(async (tx) => {
    if (clientIds.length) {
      await tx.delete(todos).where(and(eq(todos.userId, userId), notInArray(todos.clientId, clientIds)))
    } else {
      await tx.delete(todos).where(eq(todos.userId, userId))
    }

    for (const [position, todo] of parsed.data.todos.entries()) {
      await tx
        .insert(todos)
        .values({ userId, clientId: todo.clientId, title: todo.title, completed: todo.completed, position })
        .onConflictDoUpdate({
          target: [todos.userId, todos.clientId],
          set: { title: todo.title, completed: todo.completed, position, updatedAt: new Date() },
        })
    }
  })

  await Promise.allSettled(
    removedFiles.map(({ storageKey }) => s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: storageKey }))),
  )
  return c.json({ todos: await listCloudTodos(userId) })
})

const uploadInput = z.object({
  fileName: z.string().trim().min(1).max(140),
  contentType: z.string().trim(),
  byteSize: z.number().int().positive().max(MAX_FILE_BYTES),
})

app.post('/api/me/todos/:id/attachments/presign', async (c) => {
  const parsed = uploadInput.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success || !ALLOWED_FILE_TYPES.has(parsed.data?.contentType ?? '')) {
    return c.json({ error: 'Use a PNG, JPEG, PDF, Markdown, or text file up to 5 MB.' }, 400)
  }

  const userId = c.get('userId')
  const todoId = c.req.param('id')
  const [todo] = await db
    .select({ id: todos.id })
    .from(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)))
    .limit(1)
  if (!todo) return c.json({ error: 'Save this todo online before attaching a file.' }, 404)

  const existing = await db
    .select({ id: attachments.id })
    .from(attachments)
    .where(and(eq(attachments.todoId, todoId), eq(attachments.userId, userId)))
  if (existing.length >= MAX_ATTACHMENTS) {
    return c.json({ error: `A todo can have up to ${MAX_ATTACHMENTS} attachments.` }, 400)
  }

  const fileName = safeFileName(parsed.data.fileName)
  const storageKey = `users/${userId}/${todoId}/${crypto.randomUUID()}-${fileName}`
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

app.post('/api/me/todos/:id/attachments/complete', async (c) => {
  const parsed = completeUploadInput.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success || !ALLOWED_FILE_TYPES.has(parsed.data?.contentType ?? '')) {
    return c.json({ error: 'Invalid attachment information.' }, 400)
  }

  const userId = c.get('userId')
  const todoId = c.req.param('id')
  if (!parsed.data.storageKey.startsWith(`users/${userId}/${todoId}/`)) {
    return c.json({ error: 'Invalid storage key.' }, 400)
  }

  const [todo] = await db
    .select({ id: todos.id })
    .from(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)))
    .limit(1)
  if (!todo) return c.json({ error: 'Todo not found.' }, 404)

  const stored = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: parsed.data.storageKey }))
  const storedBytes = stored.ContentLength ?? 0
  if (storedBytes <= 0 || storedBytes > MAX_FILE_BYTES) return c.json({ error: 'Uploaded file has an invalid size.' }, 400)

  const [attachment] = await db
    .insert(attachments)
    .values({
      todoId,
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

export default app
