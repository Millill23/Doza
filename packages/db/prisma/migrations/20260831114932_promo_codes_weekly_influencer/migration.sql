-- AlterEnum
ALTER TYPE "CrmRole" ADD VALUE 'influencer';

-- AlterTable
ALTER TABLE "offline_sales" ADD COLUMN     "promo_code_id" INTEGER;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "promo_code_id" INTEGER;

-- AlterTable
ALTER TABLE "promos" ADD COLUMN     "weekly_promo_id" INTEGER;

-- CreateTable
CREATE TABLE "promo_codes" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "comment" TEXT,
    "discount_percent" DECIMAL(5,2) NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "influencer_id" INTEGER,

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_promos" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Парфюм недели',
    "discount_percent" DECIMAL(5,2) NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_promos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promo_codes_code_key" ON "promo_codes"("code");

-- CreateIndex
CREATE INDEX "promo_codes_influencer_id_idx" ON "promo_codes"("influencer_id");

-- CreateIndex
CREATE INDEX "offline_sales_promo_code_id_idx" ON "offline_sales"("promo_code_id");

-- CreateIndex
CREATE INDEX "orders_promo_code_id_idx" ON "orders"("promo_code_id");

-- CreateIndex
CREATE INDEX "promos_weekly_promo_id_idx" ON "promos"("weekly_promo_id");

-- AddForeignKey
ALTER TABLE "promos" ADD CONSTRAINT "promos_weekly_promo_id_fkey" FOREIGN KEY ("weekly_promo_id") REFERENCES "weekly_promos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_influencer_id_fkey" FOREIGN KEY ("influencer_id") REFERENCES "crm_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_sales" ADD CONSTRAINT "offline_sales_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
