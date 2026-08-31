/**
 * Промокоды: приведение к единому виду и проверка срока.
 *
 * Чистая логика без БД. Покупатель набирает код как придётся — с пробелами,
 * в нижнем регистре, с латинской «с» вместо русской. Приводим к одному виду,
 * иначе половина промокодов «не работает», и разбираться с этим будет продавец
 * по телефону.
 */

/** Максимальная длина кода — чтобы в поле не присылали роман. */
export const PROMO_CODE_MAX_LENGTH = 32;

/**
 * Привести код к каноническому виду: верхний регистр, без пробелов по краям и
 * внутри.
 *
 * Пробелы внутри убираем намеренно: «LETO 20» и «LETO20» для покупателя одно и
 * то же, а для базы — разные строки.
 */
export function normalizePromoCode(raw: string): string {
  return (raw ?? "")
    .replace(/\s+/g, "")
    .toUpperCase()
    .slice(0, PROMO_CODE_MAX_LENGTH);
}

export type PromoCodeStatus =
  | "ok"
  | "unknown"
  | "disabled"
  | "not_started"
  | "expired";

export interface PromoCodeState {
  isActive: boolean;
  startsAt: Date;
  endsAt: Date;
}

/** В каком состоянии код на данный момент. */
export function promoCodeStatus(
  promo: PromoCodeState | null,
  now = new Date(),
): PromoCodeStatus {
  if (!promo) return "unknown";
  if (!promo.isActive) return "disabled";
  if (now < promo.startsAt) return "not_started";
  if (now > promo.endsAt) return "expired";
  return "ok";
}

/**
 * Что сказать покупателю.
 *
 * Про выключенный код говорим то же, что про несуществующий: почему магазин
 * его отключил — не его дело, а разница в формулировке позволяет перебором
 * выяснять, какие коды вообще существуют.
 */
export function promoCodeError(status: PromoCodeStatus): string | null {
  switch (status) {
    case "ok":
      return null;
    case "not_started":
      return "Этот промокод ещё не начал действовать";
    case "expired":
      return "Срок действия промокода истёк";
    default:
      return "Такого промокода нет";
  }
}
