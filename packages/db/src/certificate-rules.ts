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

/**
 * Сколько живёт сертификат — от выпуска, а не от первого использования.
 *
 * Считаем от выпуска сознательно: иначе сертификат, пролежавший в столе два
 * года, пришлось бы принимать по ценам двухлетней давности.
 */
export const CERTIFICATE_LIFETIME_DAYS = 180;

/** Когда сгорит сертификат, выпущенный в этот момент. */
export function certificateExpiresAt(issuedAt: Date): Date {
  return new Date(
    issuedAt.getTime() + CERTIFICATE_LIFETIME_DAYS * 24 * 60 * 60 * 1000,
  );
}

/** Сколько дней осталось (0, если срок уже вышел). */
export function daysLeft(expiresAt: Date, now = new Date()): number {
  const ms = expiresAt.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / (24 * 60 * 60 * 1000));
}

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

/** Состояние сертификата с точки зрения «можно ли им сейчас платить». */
export type CertificateUsability =
  | { ok: true; balance: number }
  | { ok: false; reason: string };

export interface CertificateState {
  status: "new" | "activated" | "spent" | "cancelled";
  balanceByn: number;
  denomination: number;
  expiresAt: Date;
}

/**
 * Можно ли расплатиться этим сертификатом.
 *
 * Одно место, где решается судьба кода, — и для кассы, и для предпросмотра:
 * разъехавшись, они дадут продавцу пообещать оплату, которая потом не пройдёт.
 */
export function canRedeem(
  cert: CertificateState,
  now = new Date(),
): CertificateUsability {
  if (cert.status === "cancelled")
    return { ok: false, reason: "Сертификат аннулирован" };
  if (cert.status === "activated")
    return {
      ok: false,
      reason: "Сертификат уже обменян на баллы — платить им нельзя",
    };
  if (cert.balanceByn <= 0)
    return { ok: false, reason: "Остаток по сертификату израсходован" };
  if (cert.expiresAt.getTime() <= now.getTime())
    return {
      ok: false,
      reason: `Срок действия истёк ${cert.expiresAt.toLocaleDateString("ru-RU")}`,
    };
  return { ok: true, balance: cert.balanceByn };
}

/**
 * Можно ли обменять сертификат на баллы.
 *
 * Требуем нетронутый остаток: способы использования не смешиваются, иначе по
 * частично потраченному коду начислился бы полный номинал и магазин заплатил
 * бы дважды.
 */
export function canActivate(
  cert: CertificateState,
  now = new Date(),
): CertificateUsability {
  if (cert.status === "activated")
    return { ok: false, reason: "Сертификат уже активирован" };
  if (cert.status === "cancelled")
    return { ok: false, reason: "Сертификат аннулирован" };
  if (cert.balanceByn < cert.denomination)
    return {
      ok: false,
      reason: `По сертификату уже расплачивались в кассе (остаток ${cert.balanceByn.toFixed(2)} BYN) — обменять его на баллы нельзя. Потратьте остаток покупкой.`,
    };
  if (cert.expiresAt.getTime() <= now.getTime())
    return {
      ok: false,
      reason: `Срок действия истёк ${cert.expiresAt.toLocaleDateString("ru-RU")}`,
    };
  return { ok: true, balance: cert.balanceByn };
}

export interface Redemption {
  /** Сколько списать с сертификата в этот раз. */
  applied: number;
  /** Что останется на сертификате после списания. */
  remaining: number;
  /** Сколько покупателю придётся доплатить деньгами. */
  toPay: number;
}

/**
 * Разложить оплату сертификатом.
 *
 * Сертификат на 300 при чеке на 153 списывается на 153, а 147 остаются
 * покупателю на следующий раз — это главное свойство, ради которого сертификат
 * и стал платёжным средством, а не разовым купоном.
 */
export function applyCertificate(opts: {
  balance: number;
  /** Сумма к оплате после скидок и списания баллов. */
  due: number;
}): Redemption {
  const balance = Math.max(0, opts.balance);
  const due = Math.max(0, opts.due);
  const applied = Math.round(Math.min(balance, due) * 100) / 100;
  return {
    applied,
    remaining: Math.round((balance - applied) * 100) / 100,
    toPay: Math.round((due - applied) * 100) / 100,
  };
}

// ── Покупка сертификата на сайте ────────────────────────────────────────────
//
// Живёт здесь же, рядом с номиналами и сроком: отдельный модуль пришлось бы
// импортировать из этого, а кросс-импорт между чистыми правилами ломает
// прямой запуск тестов через `node --test`.


/** Сколько сертификатов можно взять за один заказ. */
export const MAX_CERTIFICATES_PER_ORDER = 10;

/** Длина поздравления: SMS и страница подарка, а не открытка. */
export const GIFT_MESSAGE_MAX = 200;

export function isValidDenomination(value: number): boolean {
  return (CERTIFICATE_DENOMINATIONS as readonly number[]).includes(value);
}

/** Строка корзины с сертификатом — то, что присылает браузер. */
export interface CertificateOrderLine {
  denomination: number;
  /** Отправить электронную версию ссылкой в SMS. */
  sendBySms?: boolean;
  recipientPhone?: string;
  recipientName?: string;
  message?: string;
}

/**
 * Цена сертификата для покупателя.
 *
 * VIP покупает дешевле, но тратить может полный номинал: скидка касается
 * покупки сертификата, а не его ценности. Так же считает и офлайн-касса —
 * иначе один и тот же сертификат стоил бы по-разному в зале и на сайте.
 */
export function certificatePrice(denomination: number, vipPercent: number): number {
  const pct = Number.isFinite(vipPercent) ? Math.min(100, Math.max(0, vipPercent)) : 0;
  return Math.round(denomination * (1 - pct / 100) * 100) / 100;
}

/**
 * Нужна ли посылка.
 *
 * Электронный сертификат уходит ссылкой в SMS — везти нечего. Если в заказе
 * только такие, доставка не нужна вовсе, и спрашивать адрес значит требовать
 * его без причины.
 */
export function needsShipping(opts: {
  hasProducts: boolean;
  certificates: CertificateOrderLine[];
}): boolean {
  if (opts.hasProducts) return true;
  return opts.certificates.some((c) => !c.sendBySms);
}

export type CertificateLineError =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Проверить строку сертификата.
 *
 * Телефон получателя проверяет вызывающий код — формат номера живёт в
 * `@doza/shared/phone`, а сюда его тянуть нельзя: `@doza/db` от `@doza/shared`
 * не зависит.
 */
export function validateCertificateLine(
  line: CertificateOrderLine,
): CertificateLineError {
  if (!isValidDenomination(Number(line.denomination))) {
    return { ok: false, error: "Выберите номинал сертификата из списка" };
  }

  if (line.sendBySms) {
    if (!(line.recipientPhone ?? "").trim()) {
      return {
        ok: false,
        error: "Укажите номер, на который отправить сертификат",
      };
    }
    if ((line.message ?? "").length > GIFT_MESSAGE_MAX) {
      return {
        ok: false,
        error: `Поздравление — не длиннее ${GIFT_MESSAGE_MAX} символов`,
      };
    }
  }

  return { ok: true };
}

/** Проверить весь набор сертификатов в заказе. */
export function validateCertificateLines(
  lines: CertificateOrderLine[],
): CertificateLineError {
  if (lines.length > MAX_CERTIFICATES_PER_ORDER) {
    return {
      ok: false,
      error: `За один заказ можно купить не больше ${MAX_CERTIFICATES_PER_ORDER} сертификатов`,
    };
  }
  for (const line of lines) {
    const verdict = validateCertificateLine(line);
    if (!verdict.ok) return verdict;
  }
  return { ok: true };
}

/** Текст SMS получателю подарка. */
export function giftSmsText(opts: {
  link: string;
  fromName?: string | null;
  recipientName?: string | null;
}): string {
  const to = (opts.recipientName ?? "").trim();
  const from = (opts.fromName ?? "").trim();
  const hello = to ? `${to}, вам` : "Вам";
  // Имя дарителя ставим после двоеточия, а не в оборот «от ...»: русские имена
  // там требуют родительного падежа, а склонять чужое имя автоматически —
  // верный способ поздравить человека с ошибкой в собственном имени.
  const who = from ? ` Отправитель: ${from}.` : "";
  return `${hello} подарочный сертификат DOZA.${who} Открыть: ${opts.link}`;
}
