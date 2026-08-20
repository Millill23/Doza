-- CreateEnum
CREATE TYPE "DeliveryService" AS ENUM ('europochta', 'belpochta');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderStatus" ADD VALUE 'decanted';
ALTER TYPE "OrderStatus" ADD VALUE 'packed';
ALTER TYPE "OrderStatus" ADD VALUE 'refunded';

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'refunded';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "city" TEXT,
ADD COLUMN     "delivery_service" "DeliveryService",
ADD COLUMN     "postal_code" TEXT,
ADD COLUMN     "recipient_first_name" TEXT,
ADD COLUMN     "recipient_last_name" TEXT,
ADD COLUMN     "recipient_middle_name" TEXT,
ADD COLUMN     "region" TEXT;
