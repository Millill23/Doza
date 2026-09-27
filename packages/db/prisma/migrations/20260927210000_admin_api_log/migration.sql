-- Журнал технической апишки: только изменения, чтения не пишем.
CREATE TABLE "admin_api_log" (
    "id" SERIAL NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_api_log_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "admin_api_log_created_at_idx" ON "admin_api_log"("created_at");
