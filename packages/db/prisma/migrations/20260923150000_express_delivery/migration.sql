-- Экспресс-доставка EMS (Белпочта). Плата фиксированная и заменяет обычную.
ALTER TABLE "orders" ADD COLUMN "is_express" BOOLEAN NOT NULL DEFAULT false;
