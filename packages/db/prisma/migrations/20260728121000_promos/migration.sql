-- Акции: скидки и/или повышенный кешбек на товар с периодом действия
CREATE TABLE "promos" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "discount_percent" DECIMAL(5,2),
    "cashback_percent" DECIMAL(5,2),
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "reminder_sent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "promos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "promos_product_id_idx" ON "promos"("product_id");
ALTER TABLE "promos" ADD CONSTRAINT "promos_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
