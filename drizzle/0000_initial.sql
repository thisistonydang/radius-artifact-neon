CREATE TABLE "starter_todos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "completed" boolean DEFAULT false NOT NULL,
  "position" integer NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "starter_todos_slug_idx" ON "starter_todos" ("slug");
CREATE INDEX "starter_todos_position_idx" ON "starter_todos" ("position");

CREATE TABLE "starter_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "starter_todo_id" uuid NOT NULL REFERENCES "starter_todos"("id") ON DELETE CASCADE,
  "storage_key" text NOT NULL,
  "file_name" text NOT NULL,
  "content_type" text NOT NULL,
  "byte_size" bigint NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "starter_attachments_todo_idx" ON "starter_attachments" ("starter_todo_id");

CREATE TABLE "todos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "client_id" uuid NOT NULL,
  "title" text NOT NULL,
  "completed" boolean DEFAULT false NOT NULL,
  "position" integer NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "todos_user_client_idx" ON "todos" ("user_id", "client_id");
CREATE INDEX "todos_user_position_idx" ON "todos" ("user_id", "position");

CREATE TABLE "attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "todo_id" uuid NOT NULL REFERENCES "todos"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL,
  "storage_key" text NOT NULL,
  "file_name" text NOT NULL,
  "content_type" text NOT NULL,
  "byte_size" bigint NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "attachments_storage_key_idx" ON "attachments" ("storage_key");
CREATE INDEX "attachments_todo_idx" ON "attachments" ("todo_id");
CREATE INDEX "attachments_user_idx" ON "attachments" ("user_id");
