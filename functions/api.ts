import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { neon as neonModel } from '@neon/ai-sdk-provider'
import { attachDatabasePool } from '@neon/functions'
import { generateText } from 'ai'
import { and, asc, eq, inArray, lt, notInArray, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { Context, Next } from 'hono'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { Pool } from 'pg'
import { z } from 'zod'
import { normalizePostgresUrl } from '../src/db/connection.js'
import {
  apiRateLimits,
  attachments,
  starterAttachments,
  starterTodos,
  storageDeletions,
  todos,
  userTodoWorkspaces,
} from '../src/db/schema.js'

const MAX_TODOS = 10
const uuid = z.string().uuid()
const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_ATTACHMENTS = 3
const MAX_USER_STORAGE_BYTES = 50 * 1024 * 1024
const MAX_GLOBAL_STORAGE_BYTES = positiveInteger(process.env.MAX_GLOBAL_STORAGE_BYTES, 1024 * 1024 * 1024)
const BUCKET = 'attachments'
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const RATE_LIMIT_SALT = process.env.RATE_LIMIT_SALT ?? 'local-development-rate-limit-salt'
const CHAT_IP_LIMIT = positiveInteger(process.env.PUBLIC_CHAT_IP_LIMIT, 20)
const CHAT_GLOBAL_LIMIT = positiveInteger(process.env.PUBLIC_CHAT_GLOBAL_LIMIT, 500)
const UPLOAD_HOURLY_LIMIT = positiveInteger(process.env.UPLOAD_HOURLY_LIMIT, 20)
const UPLOAD_IP_HOURLY_LIMIT = positiveInteger(process.env.UPLOAD_IP_HOURLY_LIMIT, 30)
const UPLOAD_GLOBAL_DAILY_LIMIT = positiveInteger(process.env.UPLOAD_GLOBAL_DAILY_LIMIT, 200)
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

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function corsHeaders(origin: string | undefined): Record<string, string> {
  if (!origin || (!configuredOrigins.has(origin) && !configuredOrigins.has('*'))) return { Vary: 'Origin' }
  return {
    'Access-Control-Allow-Origin': configuredOrigins.has('*') ? '*' : origin,
    'Access-Control-Allow-Headers': 'authorization, content-type, x-file-name',
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
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'no-referrer')
  if (c.req.path.startsWith('/api/me/') || c.req.path === '/api/chat') c.header('Cache-Control', 'no-store')
})

const jsonBodyLimit = bodyLimit({
  maxSize: 32 * 1024,
  onError: (c) => c.json({ error: 'The request is too large.' }, 413),
})
const fileBodyLimit = bodyLimit({
  maxSize: MAX_FILE_BYTES,
  onError: (c) => c.json({ error: 'Attachments must be 5 MB or smaller.' }, 413),
})
app.use('/api/chat', jsonBodyLimit)
app.use('/api/me/todos', jsonBodyLimit)
app.use('/api/me/todos/:id/attachments', fileBodyLimit)

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
  if (!auth?.toLowerCase().startsWith('bearer ')) return c.json({ error: 'Authentication required.' }, 401)

  const jwksUrl = process.env.NEON_AUTH_JWKS_URL
  const authBaseUrl = process.env.NEON_AUTH_BASE_URL
  if (!jwksUrl || !authBaseUrl) return c.json({ error: 'Authentication is not configured.' }, 503)

  let userId: string
  try {
    jwks ??= createRemoteJWKSet(new URL(jwksUrl))
    const issuer = new URL(authBaseUrl).origin
    const { payload } = await jwtVerify(auth.slice(7), jwks, { issuer, audience: issuer })
    if (!payload.sub) throw new Error('Token has no subject')
    userId = payload.sub
  } catch {
    return c.json({ error: 'Your session is invalid or expired.' }, 401)
  }

  c.set('userId', userId)
  await next()
}

app.use('/api/me/*', requireUser)

function safeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'file'
}

function clientAddress(c: Context<AppEnv>) {
  return (
    c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim() ||
    c.req.header('x-real-ip')?.trim() ||
    c.req.header('cf-connecting-ip')?.trim() ||
    'unknown'
  )
}

async function subjectHash(value: string) {
  const input = new TextEncoder().encode(`${RATE_LIMIT_SALT}:${value}`)
  const digest = await crypto.subtle.digest('SHA-256', input)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function consumeRateLimit(bucket: string, subject: string, windowMs: number, limit: number) {
  const now = Date.now()
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs)
  const [entry] = await db
    .insert(apiRateLimits)
    .values({ bucket, subjectHash: await subjectHash(subject), windowStart })
    .onConflictDoUpdate({
      target: [apiRateLimits.bucket, apiRateLimits.subjectHash, apiRateLimits.windowStart],
      set: { count: sql`${apiRateLimits.count} + 1` },
    })
    .returning({ count: apiRateLimits.count })

  if (Math.random() < 0.01) {
    await db.delete(apiRateLimits).where(lt(apiRateLimits.windowStart, new Date(now - 2 * DAY_MS)))
  }

  return {
    allowed: entry.count <= limit,
    retryAfter: Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now) / 1000)),
  }
}

async function signedDownloadUrl(storageKey: string) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: storageKey }), { expiresIn: 3600 })
}

async function queueStorageDeletion(storageKey: string) {
  await db.insert(storageDeletions).values({ storageKey }).onConflictDoNothing()
}

async function drainStorageDeletions(limit = 20) {
  const queued = await db.select().from(storageDeletions).orderBy(asc(storageDeletions.createdAt)).limit(limit)
  for (const item of queued) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: item.storageKey }))
      await db.delete(storageDeletions).where(eq(storageDeletions.id, item.id))
    } catch (error) {
      console.error('Object Storage cleanup failed', error)
    }
  }
}

app.get('/api/starter-todos', async (c) => {
  const rows = await db
    .select({
      id: starterTodos.id,
      slug: starterTodos.slug,
      title: starterTodos.title,
      completed: starterTodos.completed,
      position: starterTodos.position,
      attachmentId: starterAttachments.id,
      attachmentFileName: starterAttachments.fileName,
    })
    .from(starterTodos)
    .leftJoin(starterAttachments, eq(starterTodos.id, starterAttachments.starterTodoId))
    .orderBy(asc(starterTodos.position))
    .limit(MAX_TODOS)

  c.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=60')
  const data = rows.map((todo) => ({
    id: todo.id,
    slug: todo.slug,
    title: todo.title,
    completed: todo.completed,
    position: todo.position,
    attachment:
      todo.attachmentId && todo.attachmentFileName
        ? { id: todo.attachmentId, fileName: todo.attachmentFileName }
        : null,
  }))
  return c.json({ todos: data })
})

app.get('/api/starter-attachments/:id/url', async (c) => {
  const attachmentId = uuid.safeParse(c.req.param('id'))
  if (!attachmentId.success) return c.json({ error: 'Attachment not found.' }, 404)
  const [attachment] = await db
    .select({ storageKey: starterAttachments.storageKey })
    .from(starterAttachments)
    .where(eq(starterAttachments.id, attachmentId.data))
    .limit(1)
  if (!attachment) return c.json({ error: 'Attachment not found.' }, 404)
  c.header('Cache-Control', 'public, max-age=300')
  return c.json({ url: await signedDownloadUrl(attachment.storageKey), expiresIn: 3600 })
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

  const [ipLimit, globalLimit] = await Promise.all([
    consumeRateLimit('chat-ip-hour', clientAddress(c), HOUR_MS, CHAT_IP_LIMIT),
    consumeRateLimit('chat-global-day', 'all-visitors', DAY_MS, CHAT_GLOBAL_LIMIT),
  ])
  if (!ipLimit.allowed || !globalLimit.allowed) {
    const retryAfter = Math.max(
      ipLimit.allowed ? 0 : ipLimit.retryAfter,
      globalLimit.allowed ? 0 : globalLimit.retryAfter,
    )
    c.header('Retry-After', String(retryAfter))
    return c.json({ error: 'The todo assistant has reached its request limit. Please try again later.' }, 429)
  }

  const context = parsed.data.todos
    .map((todo, index) => `${index + 1}. [${todo.completed ? 'done' : 'open'}] ${todo.title}`)
    .join('\n')
  const result = await generateText({
    model: neonModel(process.env.AI_MODEL ?? 'gpt-5-mini'),
    system:
      'You are a concise, friendly todo assistant. Answer only from the supplied todo list. If the list does not answer the question, say so plainly. Keep the answer under 120 words.',
    prompt: `TODO LIST\n${context}\n\nQUESTION\n${parsed.data.question}`,
    maxOutputTokens: 350,
    abortSignal: AbortSignal.timeout(30_000),
  })
  return c.json({ answer: result.text })
})

const cloudTodoInput = z.object({
  clientId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  completed: z.boolean(),
})
const workspaceInput = z
  .object({
    revision: z.number().int().nonnegative(),
    todos: z.array(cloudTodoInput).max(MAX_TODOS),
  })
  .superRefine((workspace, context) => {
    if (new Set(workspace.todos.map((todo) => todo.clientId)).size !== workspace.todos.length) {
      context.addIssue({ code: 'custom', message: 'Todo IDs must be unique.', path: ['todos'] })
    }
  })

async function listCloudTodos(userId: string) {
  const todoRows = await db
    .select({
      id: todos.id,
      clientId: todos.clientId,
      title: todos.title,
      completed: todos.completed,
      position: todos.position,
      updatedAt: todos.updatedAt,
    })
    .from(todos)
    .where(eq(todos.userId, userId))
    .orderBy(asc(todos.position))
    .limit(MAX_TODOS)
  if (todoRows.length === 0) return []
  const attachmentRows = await db
    .select({
      id: attachments.id,
      todoId: attachments.todoId,
      fileName: attachments.fileName,
      contentType: attachments.contentType,
      byteSize: attachments.byteSize,
      createdAt: attachments.createdAt,
    })
    .from(attachments)
    .where(and(eq(attachments.userId, userId), inArray(attachments.todoId, todoRows.map((todo) => todo.id))))
    .orderBy(asc(attachments.createdAt))
    .limit(MAX_TODOS * MAX_ATTACHMENTS)

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

async function workspaceRevision(userId: string) {
  await db.insert(userTodoWorkspaces).values({ userId }).onConflictDoNothing()
  const [workspace] = await db
    .select({ revision: userTodoWorkspaces.revision })
    .from(userTodoWorkspaces)
    .where(eq(userTodoWorkspaces.userId, userId))
    .limit(1)
  return workspace.revision
}

app.get('/api/me/todos', async (c) => {
  const userId = c.get('userId')
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const revision = await workspaceRevision(userId)
    const cloudTodos = await listCloudTodos(userId)
    if (revision === (await workspaceRevision(userId))) return c.json({ todos: cloudTodos, revision })
  }
  return c.json({ error: 'The online list is changing. Please try again.' }, 409)
})

class WorkspaceConflict extends Error {
  constructor(readonly revision: number) {
    super('The online list changed in another tab or browser.')
  }
}

app.put('/api/me/todos', async (c) => {
  const parsed = workspaceInput.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Save no more than 10 todos with short titles.' }, 400)

  const userId = c.get('userId')
  const clientIds = parsed.data.todos.map((todo) => todo.clientId)
  let revision: number
  try {
    revision = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`workspace:${userId}`}))`)
      await tx.insert(userTodoWorkspaces).values({ userId }).onConflictDoNothing()
      const [workspace] = await tx
        .select({ revision: userTodoWorkspaces.revision })
        .from(userTodoWorkspaces)
        .where(eq(userTodoWorkspaces.userId, userId))
        .limit(1)
      if (workspace.revision !== parsed.data.revision) throw new WorkspaceConflict(workspace.revision)

      const existingTodos = await tx
        .select({ id: todos.id, clientId: todos.clientId })
        .from(todos)
        .where(eq(todos.userId, userId))
      const removed = existingTodos.filter((todo) => !clientIds.includes(todo.clientId))
      const removedFiles = removed.length
        ? await tx
            .select({ storageKey: attachments.storageKey })
            .from(attachments)
            .where(
              and(eq(attachments.userId, userId), inArray(attachments.todoId, removed.map((todo) => todo.id))),
            )
        : []
      if (removedFiles.length) {
        await tx
          .insert(storageDeletions)
          .values(removedFiles)
          .onConflictDoNothing({ target: storageDeletions.storageKey })
      }
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

      const [updated] = await tx
        .update(userTodoWorkspaces)
        .set({ revision: sql`${userTodoWorkspaces.revision} + 1`, updatedAt: new Date() })
        .where(eq(userTodoWorkspaces.userId, userId))
        .returning({ revision: userTodoWorkspaces.revision })
      return updated.revision
    })
  } catch (error) {
    if (error instanceof WorkspaceConflict) {
      return c.json(
        {
          error: 'Your online list changed in another tab. Reload before making more changes.',
          revision: error.revision,
        },
        409,
      )
    }
    throw error
  }

  await drainStorageDeletions()
  return c.json({ todos: await listCloudTodos(userId), revision })
})

class UploadError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 429,
  ) {
    super(message)
  }
}

app.post('/api/me/todos/:id/attachments', async (c) => {
  const userId = c.get('userId')
  const todoId = uuid.safeParse(c.req.param('id'))
  if (!todoId.success) return c.json({ error: 'Todo not found.' }, 404)
  const contentType = c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''
  let requestedName = 'file'
  try {
    requestedName = decodeURIComponent(c.req.header('x-file-name') ?? 'file')
  } catch {
    return c.json({ error: 'The attachment name is invalid.' }, 400)
  }
  const fileName = safeFileName(requestedName)

  if (!ALLOWED_FILE_TYPES.has(contentType)) {
    return c.json({ error: 'Use a PNG, JPEG, PDF, Markdown, or text file up to 5 MB.' }, 400)
  }

  const [userUploadLimit, addressUploadLimit] = await Promise.all([
    consumeRateLimit('upload-user-hour', userId, HOUR_MS, UPLOAD_HOURLY_LIMIT),
    consumeRateLimit('upload-address-hour', clientAddress(c), HOUR_MS, UPLOAD_IP_HOURLY_LIMIT),
  ])
  if (!userUploadLimit.allowed || !addressUploadLimit.allowed) {
    const retryAfter = Math.max(
      userUploadLimit.allowed ? 0 : userUploadLimit.retryAfter,
      addressUploadLimit.allowed ? 0 : addressUploadLimit.retryAfter,
    )
    c.header('Retry-After', String(retryAfter))
    return c.json({ error: 'The attachment upload limit has been reached. Please try again later.' }, 429)
  }

  const body = Buffer.from(await c.req.arrayBuffer())
  if (body.byteLength <= 0 || body.byteLength > MAX_FILE_BYTES) {
    return c.json({ error: 'Attachments must be between 1 byte and 5 MB.' }, 400)
  }

  const [ownedTodo] = await db
    .select({ id: todos.id })
    .from(todos)
    .where(and(eq(todos.id, todoId.data), eq(todos.userId, userId)))
    .limit(1)
  if (!ownedTodo) return c.json({ error: 'Save this todo online before attaching a file.' }, 404)

  let storageKey: string | undefined
  try {
    const attachment = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('upload:global'))`)

      const [todo] = await tx
        .select({ id: todos.id })
        .from(todos)
        .where(and(eq(todos.id, todoId.data), eq(todos.userId, userId)))
        .limit(1)
      if (!todo) throw new UploadError('Save this todo online before attaching a file.', 404)

      const [todoUsage] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(attachments)
        .where(and(eq(attachments.todoId, todoId.data), eq(attachments.userId, userId)))
      if (todoUsage.count >= MAX_ATTACHMENTS) {
        throw new UploadError(`A todo can have up to ${MAX_ATTACHMENTS} attachments.`, 400)
      }

      const [userUsage] = await tx
        .select({ bytes: sql<number>`coalesce(sum(${attachments.byteSize}), 0)::bigint`.mapWith(Number) })
        .from(attachments)
        .where(eq(attachments.userId, userId))
      if (userUsage.bytes + body.byteLength > MAX_USER_STORAGE_BYTES) {
        throw new UploadError('Your account has reached its 50 MB attachment limit.', 400)
      }

      const [globalUsage] = await tx
        .select({ bytes: sql<number>`coalesce(sum(${attachments.byteSize}), 0)::bigint`.mapWith(Number) })
        .from(attachments)
      if (globalUsage.bytes + body.byteLength > MAX_GLOBAL_STORAGE_BYTES) {
        throw new UploadError('This demo has reached its shared attachment storage limit.', 400)
      }

      const globalUploadLimit = await consumeRateLimit(
        'upload-global-day',
        'all-users',
        DAY_MS,
        UPLOAD_GLOBAL_DAILY_LIMIT,
      )
      if (!globalUploadLimit.allowed) {
        c.header('Retry-After', String(globalUploadLimit.retryAfter))
        throw new UploadError('The shared daily attachment upload limit has been reached.', 429)
      }

      storageKey = `users/${userId}/${todoId.data}/${crypto.randomUUID()}-${fileName}`
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: storageKey,
          Body: body,
          ContentType: contentType,
          ContentDisposition: `attachment; filename="${fileName}"`,
        }),
      )

      const [created] = await tx
        .insert(attachments)
        .values({
          todoId: todoId.data,
          userId,
          storageKey,
          fileName,
          contentType,
          byteSize: body.byteLength,
        })
        .returning({
          id: attachments.id,
          todoId: attachments.todoId,
          fileName: attachments.fileName,
          contentType: attachments.contentType,
          byteSize: attachments.byteSize,
          createdAt: attachments.createdAt,
        })
      return created
    })
    await drainStorageDeletions()
    return c.json(
      {
        attachment: {
          id: attachment.id,
          todoId: attachment.todoId,
          fileName: attachment.fileName,
          contentType: attachment.contentType,
          byteSize: attachment.byteSize,
          createdAt: attachment.createdAt,
        },
      },
      201,
    )
  } catch (error) {
    if (storageKey) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: storageKey }))
      } catch {
        await queueStorageDeletion(storageKey)
      }
    }
    if (error instanceof UploadError) return c.json({ error: error.message }, error.status)
    throw error
  }
})

app.get('/api/me/attachments/:id/url', async (c) => {
  const attachmentId = uuid.safeParse(c.req.param('id'))
  if (!attachmentId.success) return c.json({ error: 'Attachment not found.' }, 404)
  const [attachment] = await db
    .select({ storageKey: attachments.storageKey })
    .from(attachments)
    .where(and(eq(attachments.id, attachmentId.data), eq(attachments.userId, c.get('userId'))))
    .limit(1)
  if (!attachment) return c.json({ error: 'Attachment not found.' }, 404)
  return c.json({ url: await signedDownloadUrl(attachment.storageKey), expiresIn: 3600 })
})

app.delete('/api/me/attachments/:id', async (c) => {
  const attachmentId = uuid.safeParse(c.req.param('id'))
  if (!attachmentId.success) return c.json({ error: 'Attachment not found.' }, 404)
  const attachment = await db.transaction(async (tx) => {
    const [found] = await tx
      .select({ id: attachments.id, storageKey: attachments.storageKey })
      .from(attachments)
      .where(and(eq(attachments.id, attachmentId.data), eq(attachments.userId, c.get('userId'))))
      .limit(1)
    if (!found) return null
    await tx.insert(storageDeletions).values({ storageKey: found.storageKey }).onConflictDoNothing()
    await tx.delete(attachments).where(eq(attachments.id, found.id))
    return found
  })
  if (!attachment) return c.json({ error: 'Attachment not found.' }, 404)
  await drainStorageDeletions()
  return c.json({ ok: true })
})

export default app
