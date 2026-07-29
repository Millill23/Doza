-- Подарочные сертификаты в оффлайн-продаже (номиналы, без кешбека)
CREATE TABLE "offline_sale_certificates" (
    "id" SERIAL NOT NULL,
    "sale_id" INTEGER NOT NULL,
    "denomination" DECIMAL(10,2) NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "offline_sale_certificates_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "offline_sale_certificates" ADD CONSTRAINT "offline_sale_certificates_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "offline_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
