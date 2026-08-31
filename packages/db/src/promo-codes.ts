import { prisma } from "./index";
import {
  normalizePromoCode,
  promoCodeStatus,
  promoCodeError,
} from "./promo-code-rules";

/**
 * Промокоды: поиск и проверка.
 *
 * Правила (приведение к канону, срок) живут в `promo-code-rules.ts` и покрыты
 * тестами. Здесь только обращение к базе.
 */

export * from "./promo-code-rules";

export interface UsablePromoCode {
  id: number;
  code: string;
  discountPercent: number;
  influencerId: number | null;
}

export type PromoCodeLookup =
  | { ok: true; promo: UsablePromoCode }
  | { ok: false; error: string };

/**
 * Найти действующий промокод.
 *
 * Пустой ввод — не ошибка: поле необязательное, и молчать на пустоту правильнее,
 * чем ругаться на человека, который просто ничего не ввёл.
 */
export async function findUsablePromoCode(
  raw: string,
  now = new Date(),
): Promise<PromoCodeLookup | null> {
  const code = normalizePromoCode(raw);
  if (!code) return null;

  const found = await prisma.promoCode.findUnique({ where: { code } });
  const status = promoCodeStatus(found, now);
  if (status !== "ok") {
    return { ok: false, error: promoCodeError(status) ?? "Промокод недоступен" };
  }

  return {
    ok: true,
    promo: {
      id: found!.id,
      code: found!.code,
      discountPercent: Number(found!.discountPercent),
      influencerId: found!.influencerId,
    },
  };
}

/** Коды для выпадающего списка в кассе: продавец выбирает, а не печатает. */
export async function listActivePromoCodes(now = new Date()) {
  return prisma.promoCode.findMany({
    where: { isActive: true, startsAt: { lte: now }, endsAt: { gte: now } },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      comment: true,
      discountPercent: true,
      endsAt: true,
      influencer: { select: { name: true } },
    },
  });
}
