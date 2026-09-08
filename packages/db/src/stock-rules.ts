/**
 * Наличие товара: хватает ли остатка и когда бить тревогу.
 *
 * Чистая логика без БД — данные готовит вызывающий код. Раньше наличие не
 * проверялось нигде: покупатель мог оплатить аромат, которого нет, остаток
 * уходил в минус, и продавец узнавал об этом, когда брался отливать.
 */

/** Ниже этого остатка флакон считается заканчивающимся, мл. */
export const LOW_STOCK_ML = 10;

/**
 * Ниже этого остатка аромат снимается с продажи, мл.
 *
 * Донышко флакона продавать нельзя: реальный остаток всегда меньше учётного —
 * капли на стенках, недолив в атомайзер, — и заказ на последние миллилитры
 * оборачивается возвратом денег. Порог выше {@link LOW_STOCK_ML}: сперва
 * приходит предупреждение продавцам, и только потом закрывается витрина.
 */
export const OUT_OF_STOCK_ML = 15;

/** Можно ли ещё продавать этот аромат. */
export function isSoldOut(quantityMl: number, thresholdMl = OUT_OF_STOCK_ML): boolean {
  return (Number.isFinite(quantityMl) ? quantityMl : 0) < thresholdMl;
}

export interface StockLine {
  productId: number;
  volumeMl: number;
  qty: number;
  /** Как называть товар покупателю и в уведомлении. */
  label: string;
}

/** Сколько миллилитров нужно по каждому товару. Позиции одного товара суммируются. */
export function neededMl(lines: StockLine[]): Map<number, number> {
  const need = new Map<number, number>();
  for (const l of lines) {
    const qty = Math.max(0, Math.floor(l.qty));
    const ml = Math.max(0, l.volumeMl) * qty;
    if (ml === 0) continue;
    need.set(l.productId, (need.get(l.productId) ?? 0) + ml);
  }
  return need;
}

export interface Shortage {
  productId: number;
  label: string;
  /** Сколько нужно всего по заказу. */
  needMl: number;
  /** Сколько есть на складе. */
  haveMl: number;
}

/**
 * Чего не хватает на складе.
 *
 * Считается по товару целиком, а не по позиции: два по 5 мл одного аромата —
 * это 10 мл из одного флакона, и проверять их порознь значит пропустить
 * нехватку.
 */
export function shortages(
  lines: StockLine[],
  available: Map<number, number>,
  /**
   * Остаток, ниже которого аромат считается снятым с продажи. Тот же порог,
   * что показывает на витрине плашку «закончился»: иначе карточка говорила бы
   * одно, а корзина пропускала бы заказ на донышко флакона.
   */
  soldOutBelowMl = OUT_OF_STOCK_ML,
): Shortage[] {
  const need = neededMl(lines);
  const labels = new Map(lines.map((l) => [l.productId, l.label]));
  const out: Shortage[] = [];

  for (const [productId, needMl] of need) {
    const stockMl = available.get(productId) ?? 0;
    const haveMl = isSoldOut(stockMl, soldOutBelowMl) ? 0 : stockMl;
    if (haveMl < needMl) {
      out.push({
        productId,
        label: labels.get(productId) ?? `товар ${productId}`,
        needMl,
        haveMl,
      });
    }
  }
  return out;
}

/**
 * Сообщение покупателю о нехватке.
 *
 * Называем аромат и сколько осталось: «нет в наличии» на оплаченном заказе
 * звучит как отписка, а человеку надо решить — взять меньший объём или другой
 * аромат.
 */
export function shortageMessage(list: Shortage[]): string {
  if (list.length === 0) return "";
  const parts = list.map((s) =>
    s.haveMl <= 0
      ? `${s.label} — закончился`
      : `${s.label} — осталось ${s.haveMl} мл, нужно ${s.needMl}`,
  );
  return (
    (list.length === 1
      ? "Этого аромата не хватает: "
      : "Этих ароматов не хватает: ") +
    parts.join("; ") +
    ". Уменьшите объём или уберите позицию из корзины."
  );
}

/**
 * Пересёк ли товар порог «заканчивается» именно этой продажей.
 *
 * Сравниваем «до» и «после»: иначе уведомление уходило бы на каждую продажу
 * подходящего к концу флакона, и на него перестали бы смотреть.
 */
export function justRanLow(
  beforeMl: number,
  afterMl: number,
  thresholdMl: number = LOW_STOCK_ML,
): boolean {
  return beforeMl >= thresholdMl && afterMl < thresholdMl;
}

/** Текст уведомления продавцам. */
export function lowStockMessage(label: string, afterMl: number): string {
  if (afterMl <= 0) {
    return `${label} — закончился, остаток ${afterMl} мл`;
  }
  return `${label} — остаток меньше ${LOW_STOCK_ML} мл (${afterMl} мл)`;
}
