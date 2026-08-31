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
  order_paid: {
    label: "Заказ принят",
    hint: "Уходит сразу после оплаты: сроки отправки и начисленные баллы.",
    required: false,
  },
  order_ready: {
    label: "Заказ готов к выдаче",
    hint: "Самовывоз: покупателя зовут в магазин, когда заказ собран.",
    required: false,
  },
  order_shipped: {
    label: "Заказ отправлен",
    hint: "Служба доставки и трек-номер, когда посылку передали почте.",
    required: false,
  },
  order_shipped_fix: {
    label: "Уточнение по отправке",
    hint: "Когда продавец поправил службу доставки или трек-номер после отправки.",
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

// ── Частота служебных SMS ───────────────────────────────────────────────────

/**
 * Код регистрации и новый пароль отправляются по чужой просьбе: достаточно
 * знать номер. Без ограничения это и счёт за сообщения, и способ завалить
 * человека SMS, а сброс пароля вдобавок каждый раз меняет пароль владельцу —
 * прочитать его чужой не сможет, а выкинуть человека из кабинета сможет.
 *
 * Ограничиваем только эти две категории. Уведомления о заказе, баллах и
 * поздравления шлёт магазин по своей воле, и держать их незачем.
 */
export const THROTTLED_SMS_KINDS = ["otp_register", "password_reset"] as const;

export type ThrottledSmsKind = (typeof THROTTLED_SMS_KINDS)[number];

export function isThrottledKind(kind: string): kind is ThrottledSmsKind {
  return (THROTTLED_SMS_KINDS as readonly string[]).includes(kind);
}

/** Минимальная пауза между двумя сообщениями на один номер, секунд. */
export const SMS_MIN_INTERVAL_SEC = 60;

/** Сколько таких сообщений можно отправить на номер за сутки. */
export const SMS_DAILY_LIMIT = 20;

export interface ThrottleState {
  /** Когда на этот номер уходило последнее сообщение такой категории. */
  lastSentAt: Date | null;
  /** Сколько уже ушло за последние сутки. */
  sentToday: number;
}

export type ThrottleVerdict =
  | { allowed: true }
  | { allowed: false; reason: string; retryAfterSec: number };

/**
 * Можно ли отправить служебное SMS на этот номер.
 *
 * Считаем и удачные, и неудачные попытки: иначе сломанный шлюз превращается в
 * дыру — сообщения не уходят, счётчик стоит, а запросы к нему летят без счёта.
 */
export function canSendThrottledSms(
  state: ThrottleState,
  now = new Date(),
): ThrottleVerdict {
  if (state.sentToday >= SMS_DAILY_LIMIT) {
    return {
      allowed: false,
      reason:
        "Слишком много запросов на этот номер за сутки. Попробуйте завтра или позвоните нам.",
      retryAfterSec: 3600,
    };
  }

  if (state.lastSentAt) {
    const passed = Math.floor((now.getTime() - state.lastSentAt.getTime()) / 1000);
    if (passed < SMS_MIN_INTERVAL_SEC) {
      const left = SMS_MIN_INTERVAL_SEC - passed;
      return {
        allowed: false,
        reason: `Сообщение уже отправлено. Следующее можно запросить через ${left} с.`,
        retryAfterSec: left,
      };
    }
  }

  return { allowed: true };
}
