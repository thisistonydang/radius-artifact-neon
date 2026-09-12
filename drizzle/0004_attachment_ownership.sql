CREATE UNIQUE INDEX "todos_id_user_idx" ON "todos" ("id", "user_id");

ALTER TABLE "attachments" DROP CONSTRAINT "attachments_todo_id_fkey";
ALTER TABLE "attachments"
  ADD CONSTRAINT "attachments_todo_user_fk"
  FOREIGN KEY ("todo_id", "user_id")
  REFERENCES "todos" ("id", "user_id")
  ON DELETE CASCADE;
