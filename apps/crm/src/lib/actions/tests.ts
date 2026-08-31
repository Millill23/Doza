"use server";

import { prisma } from "@doza/db";
import {
  ensureGiftToken,
  setGiftMessage,
  giftLink,
  giftSmsText,
} from "@doza/db/certificates";
import { toStoredPhone } from "@doza/shared/phone";
import { requireRole } from "@/lib/session";
import { sendSmsFromCrm } from "@/lib/sms";

/**
 * Проверки для админа.
 *
 * Живут отдельным разделом, а не кнопками по всей CRM: это инструменты для
 * того, кто настраивает магазин, а не для ежедневной работы продавца. Ничего
 * не выпускают и не списывают — только отправляют то, что уже есть.
 */

function siteUrl(): string {
  return (process.env.SITE_URL ?? "https://doza-parfum.by").replace(/\/+$/, "");
}

export interface GiftLinkResult {
  ok: boolean;
  link: string;
  smsSent: boolean;
  error?: string;
}

/**
 * Отправить ссылку на существующий сертификат в SMS.
 *
 * Новый сертификат намеренно не выпускается: у сертификата есть денежная
 * ценность, и кнопка «проверить», печатающая подарки, однажды напечатала бы
 * их всерьёз. Берём тот, что уже выпущен.
 *
 * Ссылку возвращаем в любом случае — даже если SMS не ушла. Шлюз отвечает
 * только с боевого адреса, и с рабочей машины проверить страницу подарка
 * иначе было бы нельзя.
 */
export async function sendGiftLink(input: {
  certificateId: number;
  phone: string;
  recipientName?: string;
  message?: string;
}): Promise<GiftLinkResult> {
  await requireRole(["admin"]);

  const phone = toStoredPhone(input.phone ?? "");
  if (phone.length < 9) throw new Error("Укажите корректный телефон");

  const cert = await prisma.giftCertificate.findUnique({
    where: { id: Number(input.certificateId) },
    select: { id: true, code: true, buyer: { select: { name: true } } },
  });
  if (!cert) throw new Error("Сертификат не найден");

  const message = (input.message ?? "").trim();
  if (message) await setGiftMessage(cert.id, message);

  const token = await ensureGiftToken(cert.id);
  const link = giftLink(siteUrl(), token);

  const sms = await sendSmsFromCrm({
    kind: "certificate",
    phone,
    text: giftSmsText({
      link,
      fromName: cert.buyer?.name ?? null,
      recipientName: (input.recipientName ?? "").trim() || null,
    }),
  });

  return {
    ok: true,
    link,
    smsSent: sms.ok,
    error: sms.ok ? undefined : (sms.error ?? "Шлюз не принял сообщение"),
  };
}
