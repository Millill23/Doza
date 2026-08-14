/**
 * Логика активных акций (скидка / повышенный кешбек по времени).
 * Функции расчёта — чистые, данные передаёт вызывающий код. Исключение —
 * `getGlobalPromo` внизу файла: акция «на все товары» не привязана к товару,
 * поэтому её нужно достать из БД отдельным запросом.
 */

import { prisma } from "./index";
import { effectiveCashbackPercent } from "./pricing";
import { pickActivePromo, mergePromos, type EffectivePromo } from "./promo-rules";

// Правила — в отдельном модуле, чтобы их можно было проверить без базы.
export * from "./promo-rules";

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

/**
 * Эффективный процент кешбека по каждому товару из списка.
 *
 * Учитывает базовую настройку, персональный процент товара и повышенный
 * кешбек активных акций (адресных и «на все товары») — ровно так же, как это
 * показывает витрина, чтобы обещание на сайте совпадало с начислением в кассе.
 */
export async function getCashbackRates(
  productIds: number[],
  now: Date = new Date(),
): Promise<Record<number, number>> {
  const ids = [...new Set(productIds)].filter(Boolean);
  const rates: Record<number, number> = {};
  if (ids.length === 0) return rates;

  const [setting, products, globalPromo] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "loyalty_percent" } }),
    prisma.product.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        loyaltyPercentOverride: true,
        promos: {
          select: {
            discountPercent: true,
            cashbackPercent: true,
            startsAt: true,
            endsAt: true,
          },
        },
      },
    }),
    getGlobalPromo(now),
  ]);

  const globalPercent = setting ? Number(setting.value) : 5;

  for (const p of products) {
    const own = pickActivePromo(
      p.promos.map((pr) => ({
        discountPercent: pr.discountPercent != null ? Number(pr.discountPercent) : null,
        cashbackPercent: pr.cashbackPercent != null ? Number(pr.cashbackPercent) : null,
        startsAt: pr.startsAt,
        endsAt: pr.endsAt,
      })),
      now,
    );
    const promo = mergePromos(own, globalPromo);
    rates[p.id] = effectiveCashbackPercent({
      globalPercent,
      productOverride:
        p.loyaltyPercentOverride != null ? Number(p.loyaltyPercentOverride) : null,
      promoCashbackPercent: promo.cashbackPercent,
    });
  }

  // Товар мог не найтись (архив/удалён) — начисляем хотя бы базовый процент.
  for (const id of ids) if (rates[id] == null) rates[id] = globalPercent;

  return rates;
}

