-- CreateTable
CREATE TABLE "sms_log" (
    "id" SERIAL NOT NULL,
    "phone" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,
    "customer_id" INTEGER,
    "user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sms_log_phone_kind_idx" ON "sms_log"("phone", "kind");

-- CreateIndex
CREATE INDEX "sms_log_created_at_idx" ON "sms_log"("created_at");
