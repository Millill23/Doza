/**
 * Разделение выручки дня между продавцами.
 *
 * Когда на смене двое работают под одним аккаунтом, все чеки записаны на него.
 * Админ задаёт доли в процентах, и трекер продаж показывает выручку так, как
 * она делится по-честному. Чистая функция без БД — чтобы покрыть тестами:
 * речь про деньги, которые видят продавцы.
 */

/** Продажа для перераспределения. */
export interface SplittableSale {
  /** Аккаунт, на который записан чек. */
  sellerId: number;
  /** День продажи в формате YYYY-MM-DD (в часовом поясе магазина). */
  day: string;
  totalByn: number;
}

/** Правило разделения: день + аккаунт → доли продавцов. */
export interface SplitRule {
  day: string;
  sourceSellerId: number;
  shares: { sellerId: number; percent: number }[];
}

export interface SellerTotal {
  sellerId: number;
  sum: number;
  /** Количество чеков, засчитанных продавцу (у долей — дробное не считаем). */
  count: number;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Ключ правила: день + аккаунт. */
function ruleKey(day: string, sellerId: number): string {
  return `${day}:${sellerId}`;
}

/**
 * Разнести продажи по продавцам с учётом правил разделения.
 *
 * Для дней с правилом сумма аккаунта делится по процентам, а чек засчитывается
 * тому продавцу, у кого доля больше (чтобы количество чеков не дробилось).
 * Дни без правила остаются как есть.
 */
export function applySalesSplits(
  sales: SplittableSale[],
  rules: SplitRule[],
): SellerTotal[] {
  const byRule = new Map<string, SplitRule>();
  for (const r of rules) byRule.set(ruleKey(r.day, r.sourceSellerId), r);

  const totals = new Map<number, { sum: number; count: number }>();
  const add = (sellerId: number, sum: number, count: number) => {
    const cur = totals.get(sellerId) ?? { sum: 0, count: 0 };
    cur.sum += sum;
    cur.count += count;
    totals.set(sellerId, cur);
  };

  for (const sale of sales) {
    const rule = byRule.get(ruleKey(sale.day, sale.sellerId));
    const shares = rule?.shares.filter((s) => s.percent > 0) ?? [];

    if (shares.length === 0) {
      add(sale.sellerId, sale.totalByn, 1);
      continue;
    }

    // Чек целиком засчитываем продавцу с наибольшей долей — иначе счётчик
    // «сколько чеков пробил» превратился бы в дробь.
    const leader = shares.reduce((a, b) => (b.percent > a.percent ? b : a));
    const totalPercent = shares.reduce((s, x) => s + x.percent, 0) || 100;

    // Копейки от округления отдаём лидеру, чтобы сумма долей сошлась с чеком.
    let distributed = 0;
    shares.forEach((share, i) => {
      const isLast = i === shares.length - 1;
      const part = isLast
        ? r2(sale.totalByn - distributed)
        : r2((sale.totalByn * share.percent) / totalPercent);
      distributed = r2(distributed + part);
      add(share.sellerId, part, share.sellerId === leader.sellerId ? 1 : 0);
    });
  }

  return [...totals.entries()]
    .map(([sellerId, v]) => ({ sellerId, sum: r2(v.sum), count: v.count }))
    .sort((a, b) => b.sum - a.sum);
}

/** Проверить доли: положительные и в сумме ровно 100%. */
export function validateShares(
  shares: { sellerId: number; percent: number }[],
): string | null {
  const active = shares.filter((s) => s.percent > 0);
  if (active.length < 2) return "Укажите доли минимум для двух продавцов";

  const ids = new Set(active.map((s) => s.sellerId));
  if (ids.size !== active.length) return "Продавец указан дважды";

  const total = active.reduce((s, x) => s + x.percent, 0);
  if (Math.abs(total - 100) > 0.01)
    return `Сумма долей должна быть 100% (сейчас ${r2(total)}%)`;

  return null;
}
