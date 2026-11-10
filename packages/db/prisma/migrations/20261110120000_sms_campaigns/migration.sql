-- CreateEnum
CREATE TYPE "SmsCampaignRecipientStatus" AS ENUM ('pending', 'sending', 'accepted', 'failed', 'skipped', 'uncertain');

-- CreateTable
CREATE TABLE "sms_campaigns" (
    "id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "points" DECIMAL(10,2) NOT NULL,
    "reason" TEXT,
    "loyalty_days" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_campaign_recipients" (
    "id" SERIAL NOT NULL,
    "campaign_id" UUID NOT NULL,
    "customer_id" INTEGER,
    "status" "SmsCampaignRecipientStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "points_granted" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,

    CONSTRAINT "sms_campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sms_campaign_recipients_status_next_attempt_idx" ON "sms_campaign_recipients"("status", "next_attempt");

-- CreateIndex
CREATE INDEX "sms_campaign_recipients_customer_id_idx" ON "sms_campaign_recipients"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "sms_campaign_recipients_campaign_id_customer_id_key" ON "sms_campaign_recipients"("campaign_id", "customer_id");

-- AddForeignKey
ALTER TABLE "sms_campaign_recipients" ADD CONSTRAINT "sms_campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "sms_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_campaign_recipients" ADD CONSTRAINT "sms_campaign_recipients_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
