CREATE TABLE "facts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "summary" text NOT NULL,
  "fun_fact" text NOT NULL,
  "source_url" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "facts_slug_idx" ON "facts" ("slug");
CREATE INDEX "facts_category_idx" ON "facts" ("category");

CREATE TABLE "fact_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "fact_id" uuid NOT NULL REFERENCES "facts"("id") ON DELETE CASCADE,
  "storage_key" text NOT NULL,
  "file_name" text NOT NULL,
  "content_type" text NOT NULL,
  "byte_size" bigint NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "fact_assets_fact_id_idx" ON "fact_assets" ("fact_id");

CREATE TABLE "notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX "notes_user_updated_idx" ON "notes" ("user_id", "updated_at");

CREATE TABLE "attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "note_id" uuid NOT NULL REFERENCES "notes"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL,
  "storage_key" text NOT NULL,
  "file_name" text NOT NULL,
  "content_type" text NOT NULL,
  "byte_size" bigint NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "attachments_storage_key_idx" ON "attachments" ("storage_key");
CREATE INDEX "attachments_note_idx" ON "attachments" ("note_id");
CREATE INDEX "attachments_user_idx" ON "attachments" ("user_id");
