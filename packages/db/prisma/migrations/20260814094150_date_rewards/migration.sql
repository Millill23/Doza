-- CreateEnum
CREATE TYPE "DateRewardKind" AS ENUM ('birthday', 'memorable');

-- CreateTable
CREATE TABLE "date_rewards" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "kind" "DateRewardKind" NOT NULL,
    "customer_date_id" INTEGER,
    "occasion_key" TEXT NOT NULL,
    "percent" DECIMAL(5,2),
    "points_byn" DECIMAL(10,2),
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "used_sale_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "date_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "date_rewards_customer_id_used_at_idx" ON "date_rewards"("customer_id", "used_at");

-- CreateIndex
CREATE UNIQUE INDEX "date_rewards_customer_id_occasion_key_key" ON "date_rewards"("customer_id", "occasion_key");

-- AddForeignKey
ALTER TABLE "date_rewards" ADD CONSTRAINT "date_rewards_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "date_rewards" ADD CONSTRAINT "date_rewards_customer_date_id_fkey" FOREIGN KEY ("customer_date_id") REFERENCES "customer_dates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
