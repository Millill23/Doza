-- Сертификат становится платёжным средством с остатком и сроком жизни.
--
-- Оба поля обязательные, а таблица не пуста, поэтому добавляем их пустыми,
-- заполняем по существующим данным и только потом запрещаем NULL.

-- AlterEnum
ALTER TYPE "GiftCertificateStatus" ADD VALUE 'spent';

-- AlterTable
ALTER TABLE "gift_certificates" ADD COLUMN "balance_byn" DECIMAL(10,2),
ADD COLUMN "expires_at" TIMESTAMP(3);

-- Уже активированные сертификаты обменяны на баллы — тратить нечего.
-- У остальных доступен полный номинал.
UPDATE "gift_certificates"
SET "balance_byn" = CASE WHEN "status" = 'activated' THEN 0 ELSE "denomination" END;

-- Срок отсчитывается от выпуска: те же 180 дней, что и у новых.
UPDATE "gift_certificates"
SET "expires_at" = "issued_at" + INTERVAL '180 days';

ALTER TABLE "gift_certificates" ALTER COLUMN "balance_byn" SET NOT NULL;
ALTER TABLE "gift_certificates" ALTER COLUMN "expires_at" SET NOT NULL;

-- CreateTable
CREATE TABLE "certificate_redemptions" (
    "id" SERIAL NOT NULL,
    "certificate_id" INTEGER NOT NULL,
    "sale_id" INTEGER NOT NULL,
    "amount_byn" DECIMAL(10,2) NOT NULL,
    "balance_after" DECIMAL(10,2) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificate_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "certificate_redemptions_certificate_id_idx" ON "certificate_redemptions"("certificate_id");

-- CreateIndex
CREATE INDEX "certificate_redemptions_sale_id_idx" ON "certificate_redemptions"("sale_id");

-- AddForeignKey
ALTER TABLE "certificate_redemptions" ADD CONSTRAINT "certificate_redemptions_certificate_id_fkey" FOREIGN KEY ("certificate_id") REFERENCES "gift_certificates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_redemptions" ADD CONSTRAINT "certificate_redemptions_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "offline_sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_redemptions" ADD CONSTRAINT "certificate_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "crm_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
