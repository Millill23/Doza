/**
 * Правила отправки SMS: категории, лимиты и пауза между повторами.
 * Чистая логика без БД — чтобы покрыть тестами.
 */

/**
 * Категории сообщений.
 *
 * `required: true` — служебные сообщения, без которых ломается сам сценарий
 * (клиент не войдёт, не подтвердит списание баллов). Их нельзя отключить из
 * настроек: тихо выключенный код подтверждения выглядит как поломка сайта.
 */
export const SMS_KINDS = {
  otp_register: {
    label: "Код подтверждения регистрации",
    hint: "Отправляется, когда покупатель регистрируется на сайте.",
    required: true,
  },
  otp_loyalty_spend: {
    label: "Код на списание баллов",
    hint: "Подтверждение списания баллов в кассе.",
    required: true,
  },
  password_reset: {
    label: "Новый пароль",
    hint: "Восстановление доступа в личный кабинет.",
    required: true,
  },
  consent_invite: {
    label: "Приглашение дать согласие",
    hint: "Первое сообщение со ссылкой на согласие с обработкой данных.",
    required: false,
  },
  consent_reminder: {
    label: "Напоминание о согласии",
    hint: "Повтор для тех, кто не отреагировал на первое сообщение.",
    required: false,
  },
  purchase: {
    label: "Спасибо за покупку",
    hint: "Сообщение о покупке и начисленных баллах.",
    required: false,
  },
  vip_welcome: {
    label: "Поздравление с VIP",
    hint: "Отправляется один раз при выдаче VIP-карты.",
    required: false,
  },
  points_manual: {
    label: "Ручное начисление баллов",
    hint: "Когда админ начисляет баллы вручную.",
    required: false,
  },
  certificate: {
    label: "Активация сертификата",
    hint: "Когда клиенту зачислен подарочный сертификат.",
    required: false,
  },
  birthday_gift: {
    label: "Поздравление с днём рождения",
    hint: "Раз в год в день рождения, вместе с подарочными баллами.",
    required: false,
  },
  date_discount: {
    label: "Скидка к памятной дате",
    hint: "За несколько дней до памятной даты клиента.",
    required: false,
  },
} as const;

export type SmsKind = keyof typeof SMS_KINDS;

export const SMS_KIND_LIST = Object.keys(SMS_KINDS) as SmsKind[];

export function isSmsKind(value: string): value is SmsKind {
  return value in SMS_KINDS;
}

/** Ключ настройки-переключателя для категории. */
export function smsKindSettingKey(kind: SmsKind): string {
  return `sms_kind_${kind}`;
}

/** Ключ главного рубильника: выключает вообще все SMS. */
export const SMS_MASTER_SETTING = "sms_enabled";

/**
 * Дублировать каждую отправку в Telegram.
 *
 * Задумано как временный «прожектор»: включил, посмотрел час, что реально
 * уходит клиентам, выключил. Постоянно держать включённым не стоит — канал
 * заполнится служебными кодами. По умолчанию выключено, в отличие от самих
 * категорий отправки.
 */
export const SMS_TELEGRAM_SETTING = "sms_telegram_notify";

/**
 * Ограничения на повторные сообщения о согласии.
 *
 * Клиент, которому напоминают каждый день, не начинает соглашаться — он
 * начинает нас ненавидеть. Даём паузу в неделю и не больше трёх сообщений
 * всего: если человек трижды промолчал, это ответ, а не невнимательность.
 */
export const CONSENT_RESEND_COOLDOWN_DAYS = 7;
export const CONSENT_MAX_MESSAGES = 3;

export interface ConsentSendState {
  /** Сколько сообщений о согласии уже ушло этому номеру. */
  sent: number;
  /** Когда ушло последнее (null — ещё ни одного). */
  lastSentAt: Date | null;
}

export type ConsentSendVerdict =
  | { allowed: true }
  | { allowed: false; reason: string };

/** Можно ли отправить очередное сообщение о согласии. */
export function canSendConsentSms(
  state: ConsentSendState,
  now = new Date(),
): ConsentSendVerdict {
  if (state.sent >= CONSENT_MAX_MESSAGES) {
    return {
      allowed: false,
      reason: `Уже отправлено ${state.sent} сообщения — больше не напоминаем. Попросите клиента подтвердить лично или удалите его из базы.`,
    };
  }
  if (state.lastSentAt) {
    const days = (now.getTime() - state.lastSentAt.getTime()) / 86_400_000;
    if (days < CONSENT_RESEND_COOLDOWN_DAYS) {
      const left = Math.ceil(CONSENT_RESEND_COOLDOWN_DAYS - days);
      return {
        allowed: false,
        reason: `Напоминание уже отправляли. Следующее можно через ${left} дн.`,
      };
    }
  }
  return { allowed: true };
}
