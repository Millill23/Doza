-- Недосписанные потери при распиве: сотые доли миллилитра, копятся до целого.
ALTER TABLE "inventory" ADD COLUMN "spill_carry" INTEGER NOT NULL DEFAULT 0;
