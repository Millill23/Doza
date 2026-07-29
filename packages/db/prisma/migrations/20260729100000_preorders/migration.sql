-- Предзаказ целого флакона (нет в каталоге)
CREATE TABLE "preorders" (
    "id" SERIAL NOT NULL,
    "customer_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "wish" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "seller_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    CONSTRAINT "preorders_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "preorders" ADD CONSTRAINT "preorders_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "crm_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
