/**
 * Правила белорусского мобильного номера.
 *
 * Номер — это идентификатор клиента: к нему привязаны баллы, заказы и вход в
 * кабинет, на него уходят SMS с согласием, кодами списания и поздравлениями.
 * Опечатка в цифре создаёт «клиента-призрака», которого потом не найти и не
 * слить с настоящим, поэтому формат проверяем жёстко на входе.
 */

/** Коды мобильных операторов РБ: life:, A1, МТС. */
export const BELARUS_MOBILE_CODES = ["25", "29", "33", "44"] as const;

/** Международный префикс, он же неизменяемая часть в полях ввода. */
export const BELARUS_PREFIX = "375";

/** Сколько цифр вводит пользователь после +375: код оператора + номер. */
export const BELARUS_LOCAL_LENGTH = 9;

export const PHONE_ERROR = `Номер должен быть в формате +375 (${BELARUS_MOBILE_CODES.join("/")}) XXX-XX-XX`;

/** Только цифры. */
export function digitsOnly(input: string): string {
  return (input ?? "").replace(/\D/g, "");
}

/**
 * Локальная часть номера (9 цифр после 375) из чего угодно.
 *
 * Терпимо разбирает то, что реально встречается: `+375 29 …`, `80 29 …`
 * (внутрибелорусский набор) и просто 9 цифр. Это разбор ввода, а не проверка —
 * годность решает `isValidBelarusPhone`.
 */
export function toLocalDigits(input: string): string {
  let d = digitsOnly(input);
  if (d.startsWith(BELARUS_PREFIX)) d = d.slice(3);
  else if (d.startsWith("80")) d = d.slice(2);
  return d.slice(0, BELARUS_LOCAL_LENGTH);
}

/** Годна ли локальная часть: 9 цифр и код оператора из списка. */
export function isValidLocalDigits(local: string): boolean {
  if (local.length !== BELARUS_LOCAL_LENGTH) return false;
  return (BELARUS_MOBILE_CODES as readonly string[]).includes(local.slice(0, 2));
}

/** Полный номер `375XXXXXXXXX` или null, если ввод не годится. */
export function normalizeBelarusPhone(input: string): string | null {
  const local = toLocalDigits(input);
  return isValidLocalDigits(local) ? BELARUS_PREFIX + local : null;
}

export function isValidBelarusPhone(input: string): boolean {
  return normalizeBelarusPhone(input) !== null;
}

/**
 * Проверить и вернуть номер в хранимом виде `375XXXXXXXXX`.
 * Бросает Error с текстом, который показывается продавцу или покупателю.
 */
export function assertBelarusPhone(input: string): string {
  const phone = normalizeBelarusPhone(input);
  if (!phone) throw new Error(PHONE_ERROR);
  return phone;
}

/**
 * Локальная часть для показа в поле ввода: `29 245-33-33`.
 * Форматирует и незаконченный ввод, чтобы маска работала по мере набора.
 */
export function formatLocalDigits(local: string): string {
  const d = digitsOnly(local).slice(0, BELARUS_LOCAL_LENGTH);
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts[0]} ${parts.slice(1).join("-")}`;
}
