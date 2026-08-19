-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'failed', 'expired');

-- CreateEnum
CREATE TYPE "PaymentMethodKind" AS ENUM ('card', 'erip');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "paid_at" TIMESTAMP(3),
ADD COLUMN     "payment_status" "PaymentStatus" NOT NULL DEFAULT 'pending';

-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "method" "PaymentMethodKind" NOT NULL DEFAULT 'card',
    "token" TEXT NOT NULL,
    "uid" TEXT,
    "amount_byn" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "is_test" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_token_key" ON "payments"("token");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
