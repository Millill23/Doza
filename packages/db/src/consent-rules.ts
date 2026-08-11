/**
 * Правила согласия на обработку персональных данных (закон РБ №99-З).
 * Чистая логика без БД — чтобы покрыть тестами сроки и тексты.
 * Работа с базой — в `consent.ts`.
 */

/**
 * Ссылка живёт 30 дней — столько же даётся клиенту на ответ, прежде чем его
 * можно удалить из базы. Один срок на оба процесса, чтобы не вышло так, что
 * ссылка протухла, а удалять ещё нельзя: клиенту было бы нечем подтвердить.
 */
export const CONSENT_TTL_DAYS = 30;
export const CONSENT_TTL_MS = CONSENT_TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * Тексты SMS.
 *
 * Из-за кириллицы сообщение кодируется UCS-2 — 70 знаков на сегмент, а ссылка
 * съедает 55. Поэтому формулировки короткие: лишняя вежливость здесь стоит
 * третьего сегмента на каждом сообщении, то есть плюс 50% к цене рассылки.
 */
export const CONSENT_SMS = {
  /** Первое приглашение — новому клиенту или при рассылке по старой базе. */
  invite: (link: string) =>
    `DOZA: подтвердите согласие на обработку данных, чтобы получать баллы: ${link}`,
  /** Повтор — когда клиент не отреагировал на первое сообщение. */
  reminder: (link: string) =>
    `DOZA: баллы не начисляются без согласия на обработку данных. Подтвердите: ${link}`,
} as const;

export type ConsentSmsKind = keyof typeof CONSENT_SMS;

/** Адрес страницы согласия. `base` — адрес сайта без слеша на конце. */
export function consentLink(base: string, token: string): string {
  return `${base.replace(/\/+$/, "")}/consent/${token}`;
}

export interface ConsentState {
  consentStatus: string;
  consentRequestedAt: Date | null;
}

/**
 * Просрочен ли ответ: ссылку отправляли и с тех пор прошло больше срока.
 * Только таких клиентов можно удалять за отсутствие согласия — если запрос не
 * отправляли, человек и не знал, что от него чего-то ждут.
 */
export function isConsentOverdue(c: ConsentState, now = new Date()): boolean {
  if (c.consentStatus === "confirmed") return false;
  if (!c.consentRequestedAt) return false;
  return now.getTime() - c.consentRequestedAt.getTime() > CONSENT_TTL_MS;
}

/** Сколько дней прошло с отправки запроса (null, если не отправляли). */
export function daysSinceRequest(c: ConsentState, now = new Date()): number | null {
  if (!c.consentRequestedAt) return null;
  return Math.floor((now.getTime() - c.consentRequestedAt.getTime()) / 86_400_000);
}
