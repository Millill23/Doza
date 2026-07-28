-- VIP-карта клиента (скидка 20%)
ALTER TABLE "customers" ADD COLUMN "vip_card_number" TEXT;
CREATE UNIQUE INDEX "customers_vip_card_number_key" ON "customers"("vip_card_number");
