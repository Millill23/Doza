-- CreateTable
CREATE TABLE "sales_splits" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "source_seller_id" INTEGER NOT NULL,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_splits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_split_shares" (
    "id" SERIAL NOT NULL,
    "split_id" INTEGER NOT NULL,
    "seller_id" INTEGER NOT NULL,
    "percent" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "sales_split_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_splits_date_source_seller_id_key" ON "sales_splits"("date", "source_seller_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_split_shares_split_id_seller_id_key" ON "sales_split_shares"("split_id", "seller_id");

-- AddForeignKey
ALTER TABLE "sales_splits" ADD CONSTRAINT "sales_splits_source_seller_id_fkey" FOREIGN KEY ("source_seller_id") REFERENCES "crm_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_splits" ADD CONSTRAINT "sales_splits_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "crm_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_split_shares" ADD CONSTRAINT "sales_split_shares_split_id_fkey" FOREIGN KEY ("split_id") REFERENCES "sales_splits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_split_shares" ADD CONSTRAINT "sales_split_shares_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "crm_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
