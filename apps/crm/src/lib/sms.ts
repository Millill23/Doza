import { sendTrackedSms, type SmsKind } from "@doza/db/sms-log";
import { sendSms } from "@doza/shared/sms";
import { notifyTelegram } from "@/lib/telegram";

/**
 * Отправка SMS из CRM: шлюз, журнал и Telegram связаны в одном месте.
 * Вызывающему коду остаётся сказать только «что» и «кому».
 */
export function sendSmsFromCrm(opts: {
  kind: SmsKind;
  phone: string;
  text: string;
  customerId?: number | null;
  userId?: number | null;
}) {
  return sendTrackedSms({ ...opts, send: sendSms, notify: notifyTelegram });
}
