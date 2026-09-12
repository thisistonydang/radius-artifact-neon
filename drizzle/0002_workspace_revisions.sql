CREATE TABLE "user_todo_workspaces" (
  "user_id" text PRIMARY KEY NOT NULL,
  "revision" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
