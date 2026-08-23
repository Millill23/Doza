-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DeliveryType" ADD VALUE 'belpochta';
ALTER TYPE "DeliveryType" ADD VALUE 'europost';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "delivery_fee_byn" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "europost_office_code" TEXT,
ADD COLUMN     "europost_office_text" TEXT,
ADD COLUMN     "recipient_phone" TEXT;

-- CreateTable
CREATE TABLE "europost_offices" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "working_hours" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "europost_offices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "europost_offices_code_key" ON "europost_offices"("code");

-- CreateIndex
CREATE INDEX "europost_offices_city_idx" ON "europost_offices"("city");
