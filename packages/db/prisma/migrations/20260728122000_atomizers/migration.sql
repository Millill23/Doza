-- Атомайзеры (флаконы под розлив), привязаны к объёму
CREATE TABLE "atomizers" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "volume_ml" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "atomizers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "offline_sale_items" ADD COLUMN "atomizer_id" INTEGER;
ALTER TABLE "offline_sale_items" ADD CONSTRAINT "offline_sale_items_atomizer_id_fkey" FOREIGN KEY ("atomizer_id") REFERENCES "atomizers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
