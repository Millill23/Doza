"use server";

import { prisma } from "@doza/db";
import { requestConsent } from "@doza/db/consent";
import { notifyTelegram } from "@/lib/telegram";
import { checkConsentSendAllowed } from "@doza/db/sms-log";
import { type ConsentSmsKind } from "@doza/db/consent-rules";
import { sendSms } from "@doza/shared/sms";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";

/**
 * Согласия на обработку ПД (99-З): рассылка ссылок и удаление тех, кто не
 * ответил. Начисление баллов гейтится в `earnPoints` — здесь только про то,
 * как получить согласие и что делать с молчунами.
 */

/** Отправить одному клиенту ссылку на подтверждение согласия. */
export async function sendConsentRequest(
  customerId: number,
  kind: ConsentSmsKind = "invite",
) {
  const session = await requireRole(["admin", "seller", "marketer"]);
  const res = await requestConsent(customerId, sendSms, kind, {
    userId: Number(session.user.id),
    notify: notifyTelegram,
  });
  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  return res;
}

export interface BulkConsentResult {
  total: number;
  sent: number;
  /** Пропущены из-за паузы или исчерпанного лимита — это норма, не ошибка. */
  skipped: number;
  failed: number;
}

/**
 * Разослать ссылку всем, кто ещё не подтвердил согласие.
 *
 * Кому уже писали недавно, сообщение не уйдёт: пауза и лимит проверяются в
 * `requestConsent` для каждого номера отдельно, поэтому повторное нажатие
 * кнопки не превращается в повторную рассылку по всей базе.
 */
export async function sendConsentToAllPending(
  kind: ConsentSmsKind = "invite",
): Promise<BulkConsentResult> {
  const session = await requireRole(["admin", "marketer"]);
  const userId = Number(session.user.id);

  const pending = await prisma.customer.findMany({
    where: { consentStatus: "pending" },
    select: { id: true },
    orderBy: { registeredAt: "asc" },
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  // Последовательно, а не Promise.all: сотня одновременных запросов к SMS-шлюзу
  // упрётся в его лимиты, и часть клиентов молча останется без сообщения.
  for (const c of pending) {
    try {
      const r = await requestConsent(c.id, sendSms, kind, { userId, notify: notifyTelegram });
      if (r.smsSent) sent++;
      else if (r.error) skipped++;
      else failed++;
    } catch (e) {
      console.error(`[consent] клиент ${c.id}:`, e);
      failed++;
    }
  }

  revalidatePath("/customers");
  return { total: pending.length, sent, skipped, failed };
}

/** Можно ли сейчас слать клиенту напоминание (для блокировки кнопки). */
export async function getConsentSendAllowance(customerId: number) {
  await requireRole(["admin", "seller", "marketer"]);
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { phone: true },
  });
  if (!c) return { allowed: false, reason: "Клиент не найден" };
  const v = await checkConsentSendAllowed(c.phone);
  return v.allowed ? { allowed: true } : { allowed: false, reason: v.reason };
}

/** Статус согласия — для поллинга из кассы, пока клиент читает SMS. */
export async function getConsentStatus(customerId: number) {
  await requireRole(["admin", "seller", "marketer"]);
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { consentStatus: true, consentRequestedAt: true },
  });
  return {
    confirmed: c?.consentStatus === "confirmed",
    requested: Boolean(c?.consentRequestedAt),
  };
}

