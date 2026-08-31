"use server";

import { createWeeklyPromo, deleteWeeklyPromo } from "@doza/db/weekly-promo";
import { startOfDay, endOfDay, isDayString } from "@doza/shared/day-range";
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
  /** День начала в виде ГГГГ-ММ-ДД — как в обычных акциях. */
  startsAt: string;
  /** День окончания включительно: подборка живёт до конца этого дня. */
  endsAt: string;
}) {
  await requireRole(["admin"]);

  const name = (input.name ?? "").trim() || "Парфюм недели";
  const percent = Number(input.discountPercent);
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100)
    throw new Error("Скидка — от 1 до 100 процентов");

  const ids = [...new Set((input.productIds ?? []).map(Number))].filter(Boolean);
  if (ids.length === 0) throw new Error("Выберите хотя бы один аромат");

  // Выбирается только дата: начало — с 00:00 указанного дня, окончание — до
  // конца указанного дня включительно. Ровно как в обычных акциях: продавец не
  // должен помнить, что «по 7 сентября» где-то значит «до 7 сентября 00:00».
  if (!isDayString(input.startsAt) || !isDayString(input.endsAt))
    throw new Error("Укажите даты начала и окончания");

  const startsAt = startOfDay(input.startsAt);
  const endsAt = endOfDay(input.endsAt);
  if (endsAt < startsAt) throw new Error("Дата окончания раньше начала");

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
