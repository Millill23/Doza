/**
 * Логика активных акций (скидка / повышенный кешбек по времени).
 * Чистые функции без обращения к БД — данные передаются вызывающим кодом.
 */

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
