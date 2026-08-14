import { prisma } from "./index";
import {
  SMS_MASTER_SETTING,
  SMS_TELEGRAM_SETTING,
  SMS_KINDS,
  smsKindSettingKey,
  canSendConsentSms,
  type SmsKind,
  type ConsentSendState,
} from "./sms-rules";

/**
 * Единая точка отправки SMS: проверка настроек, лимитов и запись в журнал.
 *
 * Раньше каждое место слало напрямую через `sendSms`, поэтому не было ни
 * общего выключателя, ни истории, ни защиты от повторов — напоминания о
 * согласии уходили людям ежедневно, и увидеть это можно было только со
 * стороны получателя.
 *
 * Сама отправка передаётся аргументом: `@doza/db` не зависит от `@doza/shared`,
 * а в тестах это позволяет подменить шлюз.
 */

export * from "./sms-rules";

export type SmsSender = (
  phone: string,
  text: string,
) => Promise<{ ok: boolean; error?: string }>;

export interface SendSmsResult {
  ok: boolean;
  /** Отправку не начинали: выключено настройкой или упёрлись в лимит. */
  skipped?: boolean;
  error?: string;
}

/** Значение настройки-переключателя. `fallback` — если настройки ещё нет. */
async function isEnabled(key: string, fallback = true): Promise<boolean> {
  const s = await prisma.setting.findUnique({ where: { key } });
  if (!s) return fallback;
  return s.value !== "0" && s.value !== "false";
}

/** Включена ли категория с учётом главного рубильника. */
export async function isSmsKindEnabled(kind: SmsKind): Promise<boolean> {
  if (!(await isEnabled(SMS_MASTER_SETTING))) return false;
  return isEnabled(smsKindSettingKey(kind));
}

/**
 * Отправить SMS с учётом настроек и записать результат в журнал.
 * Возвращает `skipped: true`, если отправка запрещена настройками.
 */
export async function sendTrackedSms(opts: {
  kind: SmsKind;
  phone: string;
  text: string;
  send: SmsSender;
  /** Дублирование в Telegram, если админ включил «прожектор». */
  notify?: (text: string) => Promise<unknown>;
  customerId?: number | null;
  /** Сотрудник CRM, инициировавший отправку. null — сайт или система. */
  userId?: number | null;
}): Promise<SendSmsResult> {
  if (!(await isSmsKindEnabled(opts.kind))) {
    return { ok: false, skipped: true, error: "Отправка этой категории выключена в настройках" };
  }

  let ok = false;
  let error: string | undefined;
  try {
    const res = await opts.send(opts.phone, opts.text);
    ok = res.ok;
    error = res.error;
  } catch (e) {
    error = (e as Error).message;
  }

  // Пишем и удачные, и неудачные: по журналу считается пауза между повторами,
  // а неудачные отправки — единственный след проблем со шлюзом.
  await prisma.smsLog.create({
    data: {
      phone: opts.phone,
      kind: opts.kind,
      text: opts.text,
      ok,
      error: error ?? null,
      customerId: opts.customerId ?? null,
      userId: opts.userId ?? null,
    },
  });

  // «Прожектор» на рассылки: сбой Telegram не должен ломать саму отправку.
  if (opts.notify && (await isEnabled(SMS_TELEGRAM_SETTING, false))) {
    try {
      await opts.notify(
        `📨 SMS · ${SMS_KINDS[opts.kind].label}\n` +
          `Кому: +${opts.phone}\n` +
          `${ok ? "Доставлено" : `Не ушло: ${error ?? "ошибка шлюза"}`}\n\n` +
          opts.text,
      );
    } catch (e) {
      console.error("[sms] уведомление в Telegram не отправлено:", e);
    }
  }

  return { ok, error };
}

/** Сколько сообщений о согласии уже ушло на номер и когда последнее. */
export async function consentSendState(phone: string): Promise<ConsentSendState> {
  const rows = await prisma.smsLog.findMany({
    where: { phone, kind: { in: ["consent_invite", "consent_reminder"] }, ok: true },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return { sent: rows.length, lastSentAt: rows[0]?.createdAt ?? null };
}

/** Разрешено ли слать очередное сообщение о согласии на этот номер. */
export async function checkConsentSendAllowed(phone: string) {
  return canSendConsentSms(await consentSendState(phone));
}
