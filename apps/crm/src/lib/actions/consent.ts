"use server";

import { prisma } from "@doza/db";
import { requestConsent } from "@doza/db/consent";
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
  await requireRole(["admin", "seller", "marketer"]);
  const res = await requestConsent(customerId, sendSms, kind);
  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  return res;
}

export interface BulkConsentResult {
  total: number;
  sent: number;
  failed: number;
}

/**
 * Разослать ссылку всем, кто ещё не подтвердил согласие.
 * Кнопка постоянная: подходит и для разовой кампании по старой базе, и для
 * периодических напоминаний. Уже подтвердившие отсеиваются на входе.
 */
export async function sendConsentToAllPending(
  kind: ConsentSmsKind = "invite",
): Promise<BulkConsentResult> {
  await requireRole(["admin", "marketer"]);

  const pending = await prisma.customer.findMany({
    where: { consentStatus: "pending" },
    select: { id: true },
    orderBy: { registeredAt: "asc" },
  });

  let sent = 0;
  let failed = 0;
  // Последовательно, а не Promise.all: сотня одновременных запросов к SMS-шлюзу
  // упрётся в его лимиты, и часть клиентов молча останется без сообщения.
  for (const c of pending) {
    try {
      const r = await requestConsent(c.id, sendSms, kind);
      if (r.smsSent) sent++;
      else failed++;
    } catch (e) {
      console.error(`[consent] клиент ${c.id}:`, e);
      failed++;
    }
  }

  revalidatePath("/customers");
  return { total: pending.length, sent, failed };
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

