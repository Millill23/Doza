import { sendTrackedSms, type SmsKind } from "@doza/db/sms-log";
import { sendSms } from "@doza/shared/sms";
import { notifyTelegram } from "./telegram";

/**
 * Отправка SMS с сайта: шлюз, журнал и Telegram связаны в одном месте.
 * `userId` здесь нет — с сайта отправляет не сотрудник, а сам сценарий.
 */
export function sendSmsFromSite(opts: {
  kind: SmsKind;
  phone: string;
  text: string;
  customerId?: number | null;
}) {
  return sendTrackedSms({ ...opts, send: sendSms, notify: notifyTelegram });
}
