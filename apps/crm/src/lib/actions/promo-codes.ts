"use server";

import { prisma } from "@doza/db";
import { normalizePromoCode, PROMO_CODE_MAX_LENGTH } from "@doza/db/promo-codes";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";

/**
 * Промокоды: заведение, отключение, удаление.
 *
 * Код хранится в верхнем регистре — покупатель набирает как придётся, и
 * приведение к канону должно быть в одном месте для сайта, кассы и CRM.
 */

function parseDate(value: string, fallback: Date): Date {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

export async function createPromoCode(input: {
  code: string;
  comment?: string;
  discountPercent: number;
  startsAt: string;
  endsAt: string;
  influencerId?: number | null;
}) {
  await requireRole(["admin"]);

  const code = normalizePromoCode(input.code);
  if (code.length < 3)
    throw new Error("Промокод — минимум 3 символа");
  if (code.length > PROMO_CODE_MAX_LENGTH)
    throw new Error(`Промокод — не длиннее ${PROMO_CODE_MAX_LENGTH} символов`);

  const percent = Number(input.discountPercent);
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100)
    throw new Error("Скидка — от 1 до 100 процентов");

  const now = new Date();
  const startsAt = parseDate(input.startsAt, now);
  const endsAt = parseDate(input.endsAt, new Date(now.getTime() + 30 * 86_400_000));
  if (endsAt <= startsAt) throw new Error("Дата окончания должна быть позже начала");

  const exists = await prisma.promoCode.findUnique({ where: { code } });
  if (exists) throw new Error(`Промокод ${code} уже заведён`);

  // Блогера проверяем: код, привязанный к несуществующему или отключённому
  // аккаунту, не покажет владельцу ни одной продажи, и разбираться в этом
  // будут через месяц.
  let influencerId: number | null = null;
  if (input.influencerId) {
    const user = await prisma.crmUser.findUnique({
      where: { id: Number(input.influencerId) },
      select: { id: true, role: true, isActive: true },
    });
    if (!user || !user.isActive) throw new Error("Блогер не найден");
    if (user.role !== "influencer")
      throw new Error("Привязать код можно только к аккаунту блогера");
    influencerId = user.id;
  }

  await prisma.promoCode.create({
    data: {
      code,
      comment: (input.comment ?? "").trim() || null,
      discountPercent: percent,
      startsAt,
      endsAt,
      influencerId,
    },
  });

  revalidatePath("/promo-codes");
}

/** Выключить или включить обратно. Удалять не обязательно — история чеков жива. */
export async function togglePromoCode(id: number, isActive: boolean) {
  await requireRole(["admin"]);
  await prisma.promoCode.update({ where: { id }, data: { isActive } });
  revalidatePath("/promo-codes");
}

/**
 * Удалить код.
 *
 * Заказы и продажи, оформленные по нему, остаются — связь просто обнуляется.
 * Иначе удаление кода стирало бы из отчётов настоящую выручку.
 */
export async function deletePromoCode(id: number) {
  await requireRole(["admin"]);
  await prisma.promoCode.delete({ where: { id } });
  revalidatePath("/promo-codes");
}
