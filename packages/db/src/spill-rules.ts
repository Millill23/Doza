/**
 * Технологические потери при распиве.
 *
 * На бумаге из стомиллилитрового флакона выходит ровно сто миллилитров, на
 * прилавке – около девяноста пяти: капли на горлышке, остаток в шприце, недолив
 * в атомайзер. Из-за этого остаток в CRM месяцами расходился с флаконом: в базе
 * восемь миллилитров, в руках четыре, и продавец узнавал об этом, когда брался
 * отливать.
 *
 * Процент задаёт админ в настройках. Ноль – учёт как раньше, миллилитр в
 * миллилитр.
 *
 * Чистая математика без БД: данные готовит вызывающий код.
 */

/** Настройка с процентом потерь. */
export const SPILL_PERCENT_SETTING = "stock_spill_percent";

/** Больше этого процент не принимаем: выше – уже не потери, а опечатка. */
export const MAX_SPILL_PERCENT = 30;

export interface SpillResult {
  /** Сколько списать со склада всего: отлитое плюс потери. */
  deductMl: number;
  /** Сколько из этого – потери (для журнала остатков). */
  spillMl: number;
  /** Недосписанные сотые доли миллилитра – переносятся на следующую продажу. */
  carry: number;
}

/**
 * Сколько списать с учётом потерь.
 *
 * Дробный хвост не выбрасывается, а копится в `carry` (сотые доли миллилитра)
 * и списывается, когда наберётся на целый миллилитр. Без этого настройка была
 * бы бесполезной: пять миллилитров с потерей 5% – это 5.25, округление вниз
 * даёт ровно пять, и за весь флакон не спишется ни капли. С переносом каждая
 * четвёртая продажа по 5 мл забирает лишний миллилитр – те самые пять на сто.
 *
 * @param ml      отлитый объём, мл
 * @param percent процент потерь
 * @param carry   хвост с прошлых продаж этого товара, сотые доли мл
 */
export function spillWriteOff(ml: number, percent: number, carry = 0): SpillResult {
  const poured = Math.max(0, Math.round(Number.isFinite(ml) ? ml : 0));
  const pct = clampPercent(percent);
  const kept = Math.max(0, Math.round(Number.isFinite(carry) ? carry : 0));

  if (poured === 0 || pct === 0) {
    return { deductMl: poured, spillMl: 0, carry: kept };
  }

  // Считаем в сотых долях миллилитра: с целыми потери мелких отливов теряются
  // при округлении, а с плавающей точкой 0.1 + 0.2 не равно 0.3.
  const total = Math.round(poured * pct) + kept; // мл × % = сотые доли мл
  const spillMl = Math.floor(total / 100);

  return {
    deductMl: poured + spillMl,
    spillMl,
    carry: total - spillMl * 100,
  };
}

/** Процент в допустимых границах. Мусор и отрицательные значения – это ноль. */
export function clampPercent(percent: number): number {
  const p = Number(percent);
  if (!Number.isFinite(p) || p <= 0) return 0;
  return Math.min(MAX_SPILL_PERCENT, Math.round(p * 10) / 10);
}
