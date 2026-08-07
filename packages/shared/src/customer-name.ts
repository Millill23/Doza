/**
 * Проверка имени клиента.
 *
 * Разрешены только русские буквы, пробел и дефис. Причина не косметическая:
 * имя подставляется в SMS и в Telegram-уведомления, а спецсимволы ломали
 * отправку (имя «<3» рвало HTML-разметку сообщения, и уведомления о продажах
 * переставали приходить).
 */

/** Разрешено: А-Я, а-я, Ё/ё, пробел, дефис. */
const ALLOWED = /^[А-Яа-яЁё][А-Яа-яЁё \-]*$/;

export const CUSTOMER_NAME_ERROR =
  "Имя может содержать только русские буквы, пробел и дефис";

/** Схлопнуть повторные пробелы и обрезать края. */
export function normalizeCustomerName(input: string): string {
  return (input ?? "").replace(/\s+/g, " ").trim();
}

/** Корректно ли имя (после нормализации). */
export function isValidCustomerName(input: string): boolean {
  const name = normalizeCustomerName(input);
  if (name.length < 2 || name.length > 60) return false;
  return ALLOWED.test(name);
}

/**
 * Проверить и вернуть нормализованное имя.
 * Бросает Error с понятным текстом — сообщение показывается продавцу/клиенту.
 */
export function assertCustomerName(input: string): string {
  const name = normalizeCustomerName(input);
  if (name.length < 2) throw new Error("Укажите имя (минимум 2 символа)");
  if (name.length > 60) throw new Error("Имя слишком длинное");
  if (!ALLOWED.test(name)) throw new Error(CUSTOMER_NAME_ERROR);
  return name;
}
