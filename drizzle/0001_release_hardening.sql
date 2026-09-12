CREATE TABLE "api_rate_limits" (
  "bucket" text NOT NULL,
  "subject_hash" text NOT NULL,
  "window_start" timestamptz NOT NULL,
  "count" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "api_rate_limits_bucket_subject_hash_window_start_pk" PRIMARY KEY ("bucket", "subject_hash", "window_start")
);

CREATE INDEX "api_rate_limits_window_idx" ON "api_rate_limits" ("window_start");

CREATE TABLE "storage_deletions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "storage_key" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "storage_deletions_key_idx" ON "storage_deletions" ("storage_key");
