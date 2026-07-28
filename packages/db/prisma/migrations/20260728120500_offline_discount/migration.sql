-- Скидка на оффлайн-продажу (VIP-карта, акции)
ALTER TABLE "offline_sales" ADD COLUMN "discount_byn" DECIMAL(10,2) NOT NULL DEFAULT 0;
