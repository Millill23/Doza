/**
 * Правила акций: какая из них действует и как складывается с глобальной.
 * Чистая логика без БД — работа с базой в `promos.ts`.
 */

export interface PromoInput {
  discountPercent: number | null;
  cashbackPercent: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
}

export interface EffectivePromo {
  /** Активная скидка на цену, % (0 — нет). */
  discountPercent: number;
  /** Повышенный кешбек акции, % (null — акция кешбек не задаёт). */
  cashbackPercent: number | null;
}

/**
 * Эффективная акция на момент `now`: максимум скидки и максимум кешбека среди
 * действующих. Скидка и кешбек выбираются независимо — акция может поднимать
 * только кешбек, не трогая цену.
 */
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
 * Объединить адресную акцию товара с акцией «на все товары».
 * Берётся лучшее, а не сумма: проценты в проекте нигде не складываются.
 */
export function mergePromos(
  own: EffectivePromo,
  global: EffectivePromo,
): EffectivePromo {
  return {
    discountPercent: Math.max(own.discountPercent, global.discountPercent),
    cashbackPercent:
      own.cashbackPercent == null && global.cashbackPercent == null
        ? null
        : Math.max(own.cashbackPercent ?? 0, global.cashbackPercent ?? 0),
  };
}
