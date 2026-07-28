"use server";

import { prisma } from "@doza/db";
import { requireRole } from "@/lib/session";
import { revalidatePath } from "next/cache";

interface CreatePromoInput {
  productId: number;
  discountPercent?: number | null;
  cashbackPercent?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
}

/** Создать акцию (скидка и/или повышенный кешбек с периодом). Только админ. */
export async function createPromo(input: CreatePromoInput) {
  await requireRole(["admin"]);
  const productId = Number(input.productId);
  if (!productId) throw new Error("Выберите товар");

  const discount =
    input.discountPercent != null && `${input.discountPercent}` !== ""
      ? Number(input.discountPercent)
      : null;
  const cashback =
    input.cashbackPercent != null && `${input.cashbackPercent}` !== ""
      ? Number(input.cashbackPercent)
      : null;

  if (discount == null && cashback == null)
    throw new Error("Укажите скидку или повышенный кешбек");
  if (discount != null && (discount <= 0 || discount > 90))
    throw new Error("Скидка должна быть 1–90%");
  if (cashback != null && (cashback <= 0 || cashback > 90))
    throw new Error("Кешбек должен быть 1–90%");

  const startsAt = input.startsAt ? new Date(input.startsAt) : null;
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (startsAt && endsAt && endsAt < startsAt)
    throw new Error("Дата окончания раньше начала");

  await prisma.promo.create({
    data: {
      productId,
      discountPercent: discount,
      cashbackPercent: cashback,
      startsAt,
      endsAt,
    },
  });
  revalidatePath("/promos");
  revalidatePath("/");
}

/** Удалить акцию. Только админ. */
export async function deletePromo(id: number) {
  await requireRole(["admin"]);
  await prisma.promo.delete({ where: { id: Number(id) } });
  revalidatePath("/promos");
}
