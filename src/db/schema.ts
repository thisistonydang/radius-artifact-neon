import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const starterTodos = pgTable(
  'starter_todos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    completed: boolean('completed').notNull().default(false),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('starter_todos_slug_idx').on(table.slug), index('starter_todos_position_idx').on(table.position)],
)

export const starterAttachments = pgTable(
  'starter_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    starterTodoId: uuid('starter_todo_id')
      .notNull()
      .references(() => starterTodos.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('starter_attachments_todo_idx').on(table.starterTodoId)],
)

export const todos = pgTable(
  'todos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    clientId: uuid('client_id').notNull(),
    title: text('title').notNull(),
    completed: boolean('completed').notNull().default(false),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('todos_user_client_idx').on(table.userId, table.clientId),
    index('todos_user_position_idx').on(table.userId, table.position),
  ],
)

export const apiRateLimits = pgTable(
  'api_rate_limits',
  {
    bucket: text('bucket').notNull(),
    subjectHash: text('subject_hash').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(1),
  },
  (table) => [
    primaryKey({ columns: [table.bucket, table.subjectHash, table.windowStart] }),
    index('api_rate_limits_window_idx').on(table.windowStart),
  ],
)

export const userTodoWorkspaces = pgTable('user_todo_workspaces', {
  userId: text('user_id').primaryKey(),
  revision: integer('revision').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const storageDeletions = pgTable(
  'storage_deletions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storageKey: text('storage_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('storage_deletions_key_idx').on(table.storageKey),
    index('storage_deletions_created_idx').on(table.createdAt),
  ],
)

export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    todoId: uuid('todo_id')
      .notNull()
      .references(() => todos.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    storageKey: text('storage_key').notNull(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('attachments_storage_key_idx').on(table.storageKey),
    index('attachments_todo_idx').on(table.todoId),
    index('attachments_user_idx').on(table.userId),
  ],
)
