/**
 * Правила допродажи: что предлагаем на шаге перед оплатой и кому положена
 * скидка.
 *
 * Чистая логика без БД. Отдельный модуль нужен ровно из-за одной вещи:
 * признак «это допродажа» приходит из браузера, а браузеру верить нельзя.
 * Здесь описано, при каких условиях сервер сам подтверждает право на скидку.
 */

/** Скидка на предложенные к заказу ароматы. */
export const UPSELL_PERCENT = 20;

/**
 * Объёмы, которые предлагаем добрать.
 *
 * 3 мл намеренно нет: это пробник, и скидка на него не окупает саму механику.
 * Допродажа должна увеличивать чек, а не дробить его.
 */
export const UPSELL_VOLUMES = [5, 10] as const;

/** Сколько ароматов показываем. Больше — не выбор, а список. */
export const UPSELL_LIMIT = 5;

export type UpsellVolume = (typeof UPSELL_VOLUMES)[number];

export function isUpsellVolume(volumeMl: number): volumeMl is UpsellVolume {
  return (UPSELL_VOLUMES as readonly number[]).includes(volumeMl);
}

export interface CartLine {
  productId: number;
  volumeMl: number;
  /** Покупатель утверждает, что позиция взята из допродажи. */
  fromUpsell?: boolean;
}

/**
 * Какие товары считать «основой» корзины.
 *
 * Предложение строится вокруг того, что покупатель выбрал сам. Позиции,
 * помеченные как допродажа, основой не считаются — иначе можно было бы
 * пометить всю корзину и получить скидку на всё подряд по кругу.
 */
export function baseProductIds(lines: CartLine[]): number[] {
  return [...new Set(lines.filter((l) => !l.fromUpsell).map((l) => l.productId))];
}

/**
 * Положена ли позиции скидка допродажи.
 *
 * Три условия сразу: покупатель отметил её как допродажу, объём из числа
 * предлагаемых, и товар действительно числится похожим к чему-то, что лежит
 * в корзине само по себе. Последнее сервер проверяет по своей таблице, а не
 * по слову клиента — иначе −20% получил бы любой, кто поправит localStorage.
 */
export function upsellPercentFor(
  line: CartLine,
  offeredProductIds: Set<number>,
): number {
  if (!line.fromUpsell) return 0;
  if (!isUpsellVolume(line.volumeMl)) return 0;
  if (!offeredProductIds.has(line.productId)) return 0;
  return UPSELL_PERCENT;
}

export interface OfferCandidate {
  productId: number;
  /** Оценка близости из подбора похожих — по ней ранжируем предложение. */
  score?: number;
}

/**
 * Отобрать, что показать покупателю.
 *
 * Из подборки убираем то, что уже в корзине: предлагать человеку купить
 * второй раз то, что он только что положил, — худший способ начать разговор.
 */
export function pickOffers(
  candidates: OfferCandidate[],
  inCart: number[],
  limit = UPSELL_LIMIT,
): number[] {
  const skip = new Set(inCart);
  const seen = new Set<number>();
  const out: number[] = [];

  for (const c of [...candidates].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))) {
    if (skip.has(c.productId) || seen.has(c.productId)) continue;
    seen.add(c.productId);
    out.push(c.productId);
    if (out.length >= limit) break;
  }
  return out;
}
