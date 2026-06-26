-- CreateEnum
CREATE TYPE "CrmRole" AS ENUM ('admin', 'seller', 'marketer');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'unisex');

-- CreateEnum
CREATE TYPE "LoyaltyOp" AS ENUM ('earned', 'spent', 'expired');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('new', 'confirmed', 'shipped', 'closed', 'rejected', 'returned');

-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('pickup', 'post');

-- CreateEnum
CREATE TYPE "OfflineSaleStatus" AS ENUM ('open', 'closed', 'cancelled');

-- CreateTable
CREATE TABLE "Brand" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "crm_users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "CrmRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "brand_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "notes_top" TEXT,
    "notes_mid" TEXT,
    "notes_base" TEXT,
    "description" TEXT,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "loyalty_percent_override" DECIMAL(5,2),
    "low_stock_threshold" INTEGER,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_photos" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_volumes" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "volume_ml" INTEGER NOT NULL,
    "price_byn" DECIMAL(10,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "product_volumes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_similar" (
    "product_id" INTEGER NOT NULL,
    "similar_id" INTEGER NOT NULL,

    CONSTRAINT "product_similar_pkey" PRIMARY KEY ("product_id","similar_id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "product_id" INTEGER NOT NULL,
    "quantity_ml" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "inventory_log" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "delta_ml" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "ref_type" TEXT,
    "ref_id" INTEGER,
    "user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "birthday" DATE,
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_purchase_at" TIMESTAMP(3),
    "last_purchase_sum" DECIMAL(10,2),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_dates" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "customer_dates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_batches" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "amount_byn" DECIMAL(10,2) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ref_type" TEXT,
    "ref_id" INTEGER,

    CONSTRAINT "loyalty_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_log" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "batch_id" INTEGER,
    "delta_byn" DECIMAL(10,2) NOT NULL,
    "op_type" "LoyaltyOp" NOT NULL,
    "ref_type" TEXT,
    "ref_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER,
    "customer_name" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'new',
    "delivery_type" "DeliveryType" NOT NULL,
    "address" TEXT,
    "comment" TEXT,
    "total_byn" DECIMAL(10,2) NOT NULL,
    "loyalty_spent_byn" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tracking_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "volume_ml" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "price_byn" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offline_sales" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER,
    "seller_id" INTEGER NOT NULL,
    "status" "OfflineSaleStatus" NOT NULL DEFAULT 'open',
    "total_byn" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "loyalty_spent_byn" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "offline_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offline_sale_items" (
    "id" SERIAL NOT NULL,
    "sale_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "volume_ml" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "price_byn" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "offline_sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offline_sale_edits" (
    "id" SERIAL NOT NULL,
    "sale_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "edited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "change_description" TEXT NOT NULL,
    "before_json" JSONB NOT NULL,
    "after_json" JSONB NOT NULL,

    CONSTRAINT "offline_sale_edits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Brand_name_key" ON "Brand"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_slug_key" ON "Brand"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "crm_users_email_key" ON "crm_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "product_volumes_product_id_volume_ml_key" ON "product_volumes"("product_id", "volume_ml");

-- CreateIndex
CREATE UNIQUE INDEX "customers_phone_key" ON "customers"("phone");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_photos" ADD CONSTRAINT "product_photos_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_volumes" ADD CONSTRAINT "product_volumes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_similar" ADD CONSTRAINT "product_similar_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_similar" ADD CONSTRAINT "product_similar_similar_id_fkey" FOREIGN KEY ("similar_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_log" ADD CONSTRAINT "inventory_log_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_log" ADD CONSTRAINT "inventory_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "crm_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_dates" ADD CONSTRAINT "customer_dates_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_batches" ADD CONSTRAINT "loyalty_batches_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_log" ADD CONSTRAINT "loyalty_log_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_log" ADD CONSTRAINT "loyalty_log_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "loyalty_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_sales" ADD CONSTRAINT "offline_sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_sales" ADD CONSTRAINT "offline_sales_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "crm_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_sale_items" ADD CONSTRAINT "offline_sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "offline_sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_sale_items" ADD CONSTRAINT "offline_sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_sale_edits" ADD CONSTRAINT "offline_sale_edits_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "offline_sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
