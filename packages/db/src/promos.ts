/**
 * Логика активных акций (скидка / повышенный кешбек по времени).
 * Функции расчёта — чистые, данные передаёт вызывающий код. Исключение —
 * `getGlobalPromo` внизу файла: акция «на все товары» не привязана к товару,
 * поэтому её нужно достать из БД отдельным запросом.
 */

import { prisma } from "./index";

export interface PromoInput {
  discountPercent: number | null;
  cashbackPercent: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
}

export interface EffectivePromo {
  /** активная скидка на цену, % (0 если нет) */
  discountPercent: number;
  /** активный повышенный кешбек из акции, % (null если акция не задаёт кешбек) */
  cashbackPercent: number | null;
}

/** Выбрать эффективную акцию на момент `now`: максимум скидки и максимум кешбека среди активных. */
export function pickActivePromo(
  promos: PromoInput[],
  now: Date = new Date(),
): EffectivePromo {
  const t = now.getTime();
  let discount = 0;
  let cashback: number | null = null;
  for (const p of promos) {
    const started = !p.startsAt || p.startsAt.getTime() <= t;
    const notEnded = !p.endsAt || p.endsAt.getTime() >= t;
    if (!started || !notEnded) continue;
    if (p.discountPercent != null && p.discountPercent > discount)
      discount = p.discountPercent;
    if (
      p.cashbackPercent != null &&
      (cashback == null || p.cashbackPercent > cashback)
    )
      cashback = p.cashbackPercent;
  }
  return { discountPercent: discount, cashbackPercent: cashback };
}

/**
 * Активная акция «на все товары» (в БД `product_id IS NULL`).
 * Такая акция не привязана к товару, поэтому не приходит вместе с ним через
 * relation — её нужно запрашивать отдельно и объединять с адресными акциями.
 */
export async function getGlobalPromo(now: Date = new Date()): Promise<EffectivePromo> {
  const rows = await prisma.promo.findMany({
    where: { productId: null },
    select: {
      discountPercent: true,
      cashbackPercent: true,
      startsAt: true,
      endsAt: true,
    },
  });
  return pickActivePromo(
    rows.map((r) => ({
      discountPercent: r.discountPercent != null ? Number(r.discountPercent) : null,
      cashbackPercent: r.cashbackPercent != null ? Number(r.cashbackPercent) : null,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
    })),
    now,
  );
}

/** Активная супер-акция + правило участия товара, готовое для `priceCart`. */
export async function getActiveSuperPromo(now: Date = new Date()): Promise<
  | {
      id: number;
      name: string;
      groupSize: number;
      isEligible(productId: number): boolean;
    }
  | null
> {
  const rows = await prisma.superPromo.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    include: { products: { select: { productId: true } } },
    orderBy: { createdAt: "desc" },
  });

  const promo = rows[0];
  if (!promo) return null;

  const ids = new Set(promo.products.map((p) => p.productId));
  return {
    id: promo.id,
    name: promo.name,
    groupSize: promo.groupSize,
    isEligible: (productId: number) => promo.allProducts || ids.has(productId),
  };
}

/** Объединить адресную акцию товара с глобальной: берётся лучшее, не сумма. */
export function mergePromos(own: EffectivePromo, global: EffectivePromo): EffectivePromo {
  return {
    discountPercent: Math.max(own.discountPercent, global.discountPercent),
    cashbackPercent:
      own.cashbackPercent == null && global.cashbackPercent == null
        ? null
        : Math.max(own.cashbackPercent ?? 0, global.cashbackPercent ?? 0),
  };
}
