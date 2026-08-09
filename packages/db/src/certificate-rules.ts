/**
 * Подарочные сертификаты: коды и правило начисления.
 *
 * Чистый модуль без обращений к БД — чтобы правила можно было покрыть тестами
 * и переиспользовать и в CRM, и на сайте. Работа с базой — в `certificates.ts`.
 */

/**
 * Алфавит кода: латиница в верхнем регистре + цифры, без легко путаемых
 * символов (O/0, I/1). Коды диктуют вслух и вбивают руками с карточки, поэтому
 * неоднозначные символы обходятся дороже, чем небольшое сокращение алфавита.
 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;

/** Номиналы, которые можно выпустить. */
export const CERTIFICATE_DENOMINATIONS = [50, 100, 150, 200, 300, 500] as const;

/** Сгенерировать код сертификата (8 символов). Уникальность проверяет вызывающий. */
export function generateCertificateCode(
  random: () => number = Math.random,
): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Привести введённый код к каноничному виду: убрать пробелы/дефисы, поднять
 * регистр. Клиент может ввести «abcd-2345» или с пробелами — принимаем.
 */
export function normalizeCertificateCode(input: string): string {
  return (input ?? "").replace(/[\s-]/g, "").toUpperCase();
}

/** Похож ли ввод на код сертификата (длина и алфавит). */
export function isValidCertificateCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return false;
  return true;
}

/**
 * Сколько баллов начислить при активации.
 *
 * VIP получает сумму, реально уплаченную за сертификат, а не номинал — иначе
 * VIP покупал бы сертификат со своей скидкой 20% и активировал сам себе полный
 * номинал, зарабатывая на разнице. Всем остальным начисляется номинал.
 */
export function certificateAward(opts: {
  denomination: number;
  paidByn: number;
  activatorIsVip: boolean;
}): number {
  const value = opts.activatorIsVip ? opts.paidByn : opts.denomination;
  return Math.round(Math.max(0, value) * 100) / 100;
}
