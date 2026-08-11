-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('pending', 'confirmed');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "consent_confirmed_at" TIMESTAMP(3),
ADD COLUMN     "consent_requested_at" TIMESTAMP(3),
ADD COLUMN     "consent_status" "ConsentStatus" NOT NULL DEFAULT 'pending';
