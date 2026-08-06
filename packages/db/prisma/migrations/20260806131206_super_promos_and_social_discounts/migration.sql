-- CreateEnum
CREATE TYPE "SuperPromoKind" AS ENUM ('n_plus_one');

-- AlterTable
ALTER TABLE "offline_sales" ADD COLUMN     "created_by_id" INTEGER,
ADD COLUMN     "discount_kind" TEXT;

-- AlterTable
ALTER TABLE "promos" ALTER COLUMN "product_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "super_promos" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "SuperPromoKind" NOT NULL DEFAULT 'n_plus_one',
    "group_size" INTEGER NOT NULL DEFAULT 3,
    "all_products" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "super_promos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "super_promo_products" (
    "super_promo_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,

    CONSTRAINT "super_promo_products_pkey" PRIMARY KEY ("super_promo_id","product_id")
);

-- CreateIndex
CREATE INDEX "super_promo_products_product_id_idx" ON "super_promo_products"("product_id");

-- AddForeignKey
ALTER TABLE "super_promo_products" ADD CONSTRAINT "super_promo_products_super_promo_id_fkey" FOREIGN KEY ("super_promo_id") REFERENCES "super_promos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "super_promo_products" ADD CONSTRAINT "super_promo_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_sales" ADD CONSTRAINT "offline_sales_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "crm_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
