"use server";

import { prisma } from "@doza/db";
import {
  activateCertificate,
  reserveUniqueCode,
  CertificateError,
  CERTIFICATE_DENOMINATIONS,
} from "@doza/db/certificates";
import { normalizePhone } from "@doza/shared";
import { assertCustomerName } from "@doza/shared/customer-name";
import { sendSms } from "@doza/shared/sms";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { notifyTelegram, tgEscape } from "@/lib/telegram";

async function getSetting(key: string, fallback: number): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s ? Number(s.value) : fallback;
}

/** Баллы без лишних нулей: 80 вместо 80.00, но 83.33 — как есть. */
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/**
 * Предпросмотр перед выпуском: какой код будет и сколько платит покупатель.
 * Код здесь только показывается — запись создаётся в `issueCertificate`.
 */
export async function prepareCertificate(denomination: number, phoneRaw?: string) {
  await requireRole(["admin", "seller"]);

  const nominal = Number(denomination);
  if (!CERTIFICATE_DENOMINATIONS.includes(nominal as (typeof CERTIFICATE_DENOMINATIONS)[number]))
    throw new Error("Выберите номинал из списка");

  let buyerName: string | null = null;
  let vipCard: string | null = null;
  let vipPercent = 0;

  const phone = phoneRaw ? normalizePhone(phoneRaw) : "";
  if (phone.length >= 9) {
    const customer = await prisma.customer.findUnique({
      where: { phone },
      select: { name: true, vipCardNumber: true },
    });
    if (customer) {
      buyerName = customer.name;
      vipCard = customer.vipCardNumber;
      if (vipCard) vipPercent = await getSetting("vip_discount_percent", 20);
    }
  }

  const paid = Math.round(nominal * (1 - vipPercent / 100) * 100) / 100;

  return {
    code: await reserveUniqueCode(),
    denomination: nominal,
    paid,
    buyerName,
    vipCard,
    vipPercent,
  };
}

/** Выпустить сертификат: создаёт запись со статусом `new` и шлёт TG-оповещение. */
export async function issueCertificate(input: {
  code: string;
  denomination: number;
  phone?: string;
}) {
  const session = await requireRole(["admin", "seller"]);
  const issuedById = Number(session.user.id);

  const nominal = Number(input.denomination);
  if (!CERTIFICATE_DENOMINATIONS.includes(nominal as (typeof CERTIFICATE_DENOMINATIONS)[number]))
    throw new Error("Выберите номинал из списка");

  // Цену считаем заново на сервере — присланной с клиента не доверяем.
  let buyerId: number | null = null;
  let vipPercent = 0;
  let vipCard: string | null = null;
  const phone = input.phone ? normalizePhone(input.phone) : "";
  if (phone.length >= 9) {
    const customer = await prisma.customer.findUnique({
      where: { phone },
      select: { id: true, vipCardNumber: true },
    });
    if (customer) {
      buyerId = customer.id;
      vipCard = customer.vipCardNumber;
      if (vipCard) vipPercent = await getSetting("vip_discount_percent", 20);
    }
  }
  const paid = Math.round(nominal * (1 - vipPercent / 100) * 100) / 100;

  const cert = await prisma.giftCertificate.create({
    data: {
      code: input.code,
      denomination: nominal,
      paidByn: paid,
      buyerId,
      issuedById,
    },
  });

  try {
    const seller = await prisma.crmUser.findUnique({
      where: { id: issuedById },
      select: { name: true },
    });
    await notifyTelegram(
      `🎁 <b>Выпущен сертификат</b>\n` +
        `Код: <code>${cert.code}</code>\n` +
        `Номинал: ${fmt(nominal)} BYN\n` +
        (paid !== nominal
          ? `Оплачено: ${fmt(paid)} BYN (VIP −${vipPercent}%)\n`
          : `Оплачено: ${fmt(paid)} BYN\n`) +
        `Продавец: ${tgEscape(seller?.name ?? issuedById)}`,
    );
  } catch (e) {
    console.error("[certificates] TG о выпуске не отправлено:", e);
  }

  revalidatePath("/certificates");
  return { id: cert.id, code: cert.code, denomination: nominal, paid };
}

/** Активировать сертификат в CRM: начисляет баллы, шлёт SMS и TG. */
export async function activateCertificateInCrm(input: {
  code: string;
  phone: string;
  name?: string;
}) {
  const session = await requireRole(["admin", "seller"]);
  const activatedById = Number(session.user.id);

  const phone = normalizePhone(input.phone ?? "");
  if (phone.length < 9) throw new Error("Укажите корректный телефон клиента");

  // Имя необязательно, но если введено — проверяем: оно уходит в SMS и TG.
  const typed = (input.name ?? "").trim();
  const name = typed ? assertCustomerName(typed) : "";
  // Клиента заводим до активации: сертификат должен начислиться на кого-то.
  const customer = await prisma.customer.upsert({
    where: { phone },
    update: name ? { name } : {},
    create: { phone, name: name || "Покупатель" },
  });

  const days = await getSetting("loyalty_days", 180);

  let result;
  try {
    result = await activateCertificate({
      code: input.code,
      customerId: customer.id,
      activatedById,
      loyaltyDays: days,
    });
  } catch (e) {
    if (e instanceof CertificateError) throw new Error(e.message);
    throw e;
  }

  try {
    await sendSms(
      phone,
      `Сертификат активирован! Вам начислено ${fmt(result.awarded)} бонусов. Всего бонусов: ${fmt(result.balance)}`,
    );
  } catch (e) {
    console.error("[certificates] SMS об активации не отправлена:", e);
  }

  try {
    const seller = await prisma.crmUser.findUnique({
      where: { id: activatedById },
      select: { name: true },
    });
    await notifyTelegram(
      `✅ <b>Сертификат активирован</b>\n` +
        `Код: <code>${result.code}</code> · номинал ${fmt(result.denomination)} BYN\n` +
        `Клиент: ${tgEscape(result.customerName)} (${result.customerPhone})${result.isVip ? " ⭐VIP" : ""}\n` +
        `Начислено: <b>${fmt(result.awarded)}</b> баллов` +
        (result.isVip && result.awarded !== result.denomination
          ? " (по цене покупки — VIP)"
          : "") +
        `\nПродавец: ${tgEscape(seller?.name ?? activatedById)}`,
    );
  } catch (e) {
    console.error("[certificates] TG об активации не отправлено:", e);
  }

  revalidatePath("/certificates");
  return result;
}
