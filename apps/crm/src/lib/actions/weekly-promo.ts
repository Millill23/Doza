"use server";

import {
  createWeeklyPromo,
  deleteWeeklyPromo,
  weeklyPromoEnd,
  WEEKLY_PROMO_DAYS,
} from "@doza/db/weekly-promo";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";

/**
 * «Парфюм недели»: подборка ароматов с одинаковой скидкой.
 *
 * Скидка заводится обычными акциями на каждый товар — так витрина и касса
 * считают её уже существующим кодом, и вторая механика скидок рядом с первой
 * не появляется.
 */

export async function saveWeeklyPromo(input: {
  name: string;
  discountPercent: number;
  productIds: number[];
  days?: number;
}) {
  await requireRole(["admin"]);

  const name = (input.name ?? "").trim() || "Парфюм недели";
  const percent = Number(input.discountPercent);
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100)
    throw new Error("Скидка — от 1 до 100 процентов");

  const ids = [...new Set((input.productIds ?? []).map(Number))].filter(Boolean);
  if (ids.length === 0) throw new Error("Выберите хотя бы один аромат");

  const days = Number(input.days) > 0 ? Number(input.days) : WEEKLY_PROMO_DAYS;
  const startsAt = new Date();
  const endsAt = weeklyPromoEnd(startsAt, days);

  await createWeeklyPromo({
    name,
    discountPercent: percent,
    productIds: ids,
    startsAt,
    endsAt,
  });

  // Каталог кэшируется на сайте — но он отдельное приложение, поэтому здесь
  // обновляем только страницы CRM.
  revalidatePath("/weekly-promo");
  revalidatePath("/promos");
}

export async function removeWeeklyPromo(id: number) {
  await requireRole(["admin"]);
  await deleteWeeklyPromo(id);
  revalidatePath("/weekly-promo");
  revalidatePath("/promos");
}
