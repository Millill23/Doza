/**
 * Премия продавца от месячной выручки.
 *
 * Чистая математика без БД. Пороги и проценты живут здесь: меняются они редко,
 * а держать их в настройках значит рисковать тем, что кто-то поправит процент
 * посреди месяца и продавец не поймёт, почему полоска прыгнула.
 *
 * Процент считается от ВСЕЙ суммы, а не от превышения: продал на 10 500 —
 * это 2% от 10 500. Так продавец может посчитать премию в уме, а значит и
 * поверить в неё.
 */

export interface CommissionTier {
  /** С какой суммы действует. */
  from: number;
  /** Сколько процентов от всей выручки. */
  percent: number;
}

/** Пороги по возрастанию. Первый порог — начало премии. */
export const COMMISSION_TIERS: CommissionTier[] = [
  { from: 8000, percent: 1 },
  { from: 10000, percent: 2 },
  { from: 12000, percent: 3 },
];

/** Процент, который заработан при такой выручке. 0 — порог ещё не взят. */
export function commissionPercent(sum: number): number {
  const value = Number.isFinite(sum) ? sum : 0;
  let percent = 0;
  for (const tier of COMMISSION_TIERS) {
    if (value >= tier.from) percent = tier.percent;
  }
  return percent;
}

/** Сама премия в рублях. */
export function commissionAmount(sum: number): number {
  const value = Math.max(0, Number.isFinite(sum) ? sum : 0);
  return Math.round(value * (commissionPercent(value) / 100) * 100) / 100;
}

export interface CommissionProgress {
  /** Заработанный процент сейчас. */
  percent: number;
  /** Премия при текущей выручке. */
  amount: number;
  /** Процент следующей ступени. null — все ступени взяты. */
  nextPercent: number | null;
  /** Сумма, с которой начнётся следующая ступень. null — ступеней больше нет. */
  nextAt: number | null;
  /** Сколько не хватает до следующей ступени. 0 — ступеней больше нет. */
  left: number;
  /** Заполнение полоски от 0 до 1 — в пределах текущего отрезка. */
  fill: number;
  /** Начало текущего отрезка: предыдущий порог или ноль. */
  segmentFrom: number;
  /** Конец текущего отрезка: следующий порог или последний. */
  segmentTo: number;
}

/**
 * Где продавец сейчас и сколько до следующей ступени.
 *
 * Полоска заполняется не от нуля до последнего порога, а от ступени к
 * ступени: иначе первые восемь тысяч выглядят как две трети пути, хотя за них
 * не платят вовсе, а рывок с 10 до 12 тысяч почти не двигает полоску.
 */
export function commissionProgress(sum: number): CommissionProgress {
  const value = Math.max(0, Number.isFinite(sum) ? sum : 0);
  const percent = commissionPercent(value);
  const amount = commissionAmount(value);

  const next = COMMISSION_TIERS.find((t) => value < t.from);

  if (!next) {
    // Всё взято: полоска полная, дальше расти некуда.
    const last = COMMISSION_TIERS[COMMISSION_TIERS.length - 1];
    return {
      percent,
      amount,
      nextPercent: null,
      nextAt: null,
      left: 0,
      fill: 1,
      segmentFrom: last.from,
      segmentTo: last.from,
    };
  }

  // Начало отрезка — предыдущий взятый порог, иначе ноль.
  const passed = COMMISSION_TIERS.filter((t) => value >= t.from);
  const segmentFrom = passed.length ? passed[passed.length - 1].from : 0;
  const span = next.from - segmentFrom;
  const fill = span > 0 ? Math.min(1, Math.max(0, (value - segmentFrom) / span)) : 0;

  return {
    percent,
    amount,
    nextPercent: next.percent,
    nextAt: next.from,
    left: Math.round((next.from - value) * 100) / 100,
    fill,
    segmentFrom,
    segmentTo: next.from,
  };
}
