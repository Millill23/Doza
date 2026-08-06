-- CreateEnum
CREATE TYPE "GiftCertificateStatus" AS ENUM ('new', 'activated', 'cancelled');

-- AlterTable
ALTER TABLE "loyalty_log" ADD COLUMN     "reason" TEXT;

-- CreateTable
CREATE TABLE "gift_certificates" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "denomination" DECIMAL(10,2) NOT NULL,
    "paid_byn" DECIMAL(10,2) NOT NULL,
    "status" "GiftCertificateStatus" NOT NULL DEFAULT 'new',
    "buyer_id" INTEGER,
    "issued_by_id" INTEGER NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customer_id" INTEGER,
    "activated_by_id" INTEGER,
    "activated_at" TIMESTAMP(3),
    "awarded_byn" DECIMAL(10,2),

    CONSTRAINT "gift_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gift_certificates_code_key" ON "gift_certificates"("code");

-- CreateIndex
CREATE INDEX "gift_certificates_status_idx" ON "gift_certificates"("status");

-- AddForeignKey
ALTER TABLE "gift_certificates" ADD CONSTRAINT "gift_certificates_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_certificates" ADD CONSTRAINT "gift_certificates_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "crm_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_certificates" ADD CONSTRAINT "gift_certificates_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_certificates" ADD CONSTRAINT "gift_certificates_activated_by_id_fkey" FOREIGN KEY ("activated_by_id") REFERENCES "crm_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
