-- DropForeignKey
ALTER TABLE "gift_certificates" DROP CONSTRAINT "gift_certificates_issued_by_id_fkey";

-- AlterTable
ALTER TABLE "gift_certificates" ADD COLUMN     "gift_message" TEXT,
ADD COLUMN     "public_token" TEXT,
ALTER COLUMN "issued_by_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "order_certificates" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "denomination" DECIMAL(10,2) NOT NULL,
    "price_byn" DECIMAL(10,2) NOT NULL,
    "send_by_sms" BOOLEAN NOT NULL DEFAULT false,
    "recipient_phone" TEXT,
    "recipient_name" TEXT,
    "message" TEXT,
    "certificate_id" INTEGER,

    CONSTRAINT "order_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_certificates_certificate_id_key" ON "order_certificates"("certificate_id");

-- CreateIndex
CREATE INDEX "order_certificates_order_id_idx" ON "order_certificates"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "gift_certificates_public_token_key" ON "gift_certificates"("public_token");

-- AddForeignKey
ALTER TABLE "order_certificates" ADD CONSTRAINT "order_certificates_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_certificates" ADD CONSTRAINT "order_certificates_certificate_id_fkey" FOREIGN KEY ("certificate_id") REFERENCES "gift_certificates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_certificates" ADD CONSTRAINT "gift_certificates_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "crm_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

