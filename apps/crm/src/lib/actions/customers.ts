"use server";

import { prisma } from "@doza/db";
import { requestConsent } from "@doza/db/consent";
import { assertBelarusPhone } from "@doza/shared/phone";
import { sendSmsFromCrm } from "@/lib/sms";
import { notifyTelegram } from "@/lib/telegram";
import { assertCustomerName } from "@doza/shared/customer-name";
import { sendSms } from "@doza/shared/sms";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";

export interface OfflineRegInput {
  phone: string;
  name: string;
  birthday?: string;
  dates?: { date: string; description: string }[];
}

/**
 * Регистрация клиента продавцом в кассе.
 *
 * Одноразового кода здесь больше нет: вместо него клиенту уходит ссылка на
 * согласие с обработкой персональных данных (99-З). Переход по ней заодно
 * подтверждает владение номером — то же, что давал код, но с юридически
 * значимым согласием в придачу.
 *
 * Продажу это не задерживает: клиент заводится сразу, продавец работает
 * дальше, а баллы начнут начисляться, как только придёт подтверждение.
 */
export async function registerCustomerOffline(input: OfflineRegInput) {
  await requireRole(["admin", "seller", "marketer"]);
  const phone = assertBelarusPhone(input.phone);
  const name = assertCustomerName(input.name ?? "");

  const existing = await prisma.customer.findUnique({
    where: { phone },
    select: { id: true, name: true, consentStatus: true },
  });

  const customer = await prisma.customer.upsert({
    where: { phone },
    update: {
      name,
      birthday: input.birthday ? new Date(input.birthday) : undefined,
    },
    create: {
      phone,
      name,
      birthday: input.birthday ? new Date(input.birthday) : undefined,
    },
  });

  // памятные даты (до 3)
  for (const d of (input.dates ?? []).slice(0, 3)) {
    if (d.date && d.description?.trim()) {
      await prisma.customerDate.create({
        data: {
          customerId: customer.id,
          date: new Date(d.date),
          description: d.description.trim(),
        },
      });
    }
  }

  const alreadyConfirmed = existing?.consentStatus === "confirmed";
  const consent = alreadyConfirmed
    ? { smsSent: false }
    : await requestConsent(customer.id, sendSms, "invite", { notify: notifyTelegram });

  revalidatePath("/customers");
  return {
    ok: true,
    customerId: customer.id,
    alreadyConfirmed,
    smsSent: consent.smsSent,
  };
}

/** Зарегистрировать VIP-клиента (админ, без подтверждения телефона). */
export async function registerVip(
  phoneRaw: string,
  nameRaw: string,
  cardRaw: string,
) {
  await requireRole(["admin"]);
  const phone = assertBelarusPhone(phoneRaw);
  const name = assertCustomerName(nameRaw ?? "");
  const card = (cardRaw ?? "").trim();
  if (!card) throw new Error("Укажите номер карты");

  const taken = await prisma.customer.findUnique({
    where: { vipCardNumber: card },
  });
  if (taken && taken.phone !== phone)
    throw new Error(`Карта №${card} уже привязана к другому клиенту`);

  // Был ли клиент VIP до этого — чтобы не поздравлять повторно, когда админ
  // просто исправляет имя или перевыпускает карту.
  const before = await prisma.customer.findUnique({
    where: { phone },
    select: { vipCardNumber: true },
  });

  // phoneVerified: true — админ регистрирует лично, клиент сможет получить
  // пароль на сайте через «восстановить пароль» и зайти в свой аккаунт.
  const customer = await prisma.customer.upsert({
    where: { phone },
    update: { name, vipCardNumber: card, phoneVerified: true },
    create: { phone, name, vipCardNumber: card, phoneVerified: true },
  });

  if (!before?.vipCardNumber) await sendVipWelcomeSms(phone, name, customer.id);

  // VIP — это программа лояльности, значит нужно согласие на обработку ПД.
  // Отдельным сообщением после поздравления, чтобы не смешивать две темы.
  const fresh = await prisma.customer.findUnique({
    where: { id: customer.id },
    select: { consentStatus: true },
  });
  if (fresh?.consentStatus !== "confirmed") {
    await requestConsent(customer.id, sendSms, "invite", { notify: notifyTelegram }).catch((e) =>
      console.error("[customers] запрос согласия для VIP не ушёл:", e),
    );
  }

  revalidatePath("/customers");
  return { ok: true, customerId: customer.id };
}

/**
 * Поздравительная SMS новому VIP-клиенту.
 * Сбой отправки не должен ломать регистрацию — только пишем в лог.
 */
async function sendVipWelcomeSms(
  phone: string,
  name: string,
  customerId?: number,
) {
  try {
    await sendSmsFromCrm({
      kind: "vip_welcome",
      phone,
      text: `Поздравляем, ${name} - вы стали VIP клиентом магазина оригинальной парфюмерии DOZA`,
      customerId,
    });
  } catch (e) {
    console.error("[customers] VIP SMS не отправлена:", e);
  }
}

/** Привязать VIP-карту существующему клиенту. */
export async function attachVipCard(customerId: number, cardRaw: string) {
  await requireRole(["admin"]);
  const card = (cardRaw ?? "").trim();
  if (!card) throw new Error("Укажите номер карты");
  const taken = await prisma.customer.findUnique({
    where: { vipCardNumber: card },
  });
  if (taken && taken.id !== customerId)
    throw new Error(`Карта №${card} уже привязана к другому клиенту`);
  const before = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { vipCardNumber: true, phone: true, name: true },
  });
  await prisma.customer.update({
    where: { id: customerId },
    data: { vipCardNumber: card },
  });
  // Клиент стал VIP только что — поздравляем.
  if (before && !before.vipCardNumber)
    await sendVipWelcomeSms(before.phone, before.name, customerId);
  revalidatePath(`/customers/${customerId}`);
}

/**
 * Изменить имя и/или телефон клиента. Только админ.
 * Телефон — это идентификатор клиента (баллы, заказы, вход в кабинет),
 * поэтому проверяем, что он не занят другим.
 */
export async function updateCustomer(
  customerId: number,
  input: { name: string; phone: string },
) {
  await requireRole(["admin"]);

  const name = assertCustomerName(input.name ?? "");
  const phone = assertBelarusPhone(input.phone ?? "");

  const taken = await prisma.customer.findUnique({
    where: { phone },
    select: { id: true, name: true },
  });
  if (taken && taken.id !== customerId)
    throw new Error(
      `Телефон уже привязан к другому клиенту (${taken.name}). Объединение клиентов не поддерживается.`,
    );

  await prisma.customer.update({
    where: { id: customerId },
    data: { name, phone },
  });

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return { ok: true, name, phone };
}

/** Снять VIP-карту с клиента. */
export async function removeVipCard(customerId: number) {
  await requireRole(["admin"]);
  await prisma.customer.update({
    where: { id: customerId },
    data: { vipCardNumber: null },
  });
  revalidatePath(`/customers/${customerId}`);
}

export async function setBirthday(customerId: number, date: string) {
  await requireRole(["admin", "seller", "marketer"]);
  await prisma.customer.update({
    where: { id: customerId },
    data: { birthday: date ? new Date(date) : null },
  });
  revalidatePath(`/customers/${customerId}`);
}

export async function addCustomerDate(
  customerId: number,
  date: string,
  description: string,
) {
  await requireRole(["admin", "seller", "marketer"]);
  if (!date || !description.trim()) return;

  const count = await prisma.customerDate.count({ where: { customerId } });
  if (count >= 3) throw new Error("Не более 3 памятных дат");

  await prisma.customerDate.create({
    data: { customerId, date: new Date(date), description: description.trim() },
  });
  revalidatePath(`/customers/${customerId}`);
}

export async function removeCustomerDate(id: number, customerId: number) {
  await requireRole(["admin", "seller", "marketer"]);
  await prisma.customerDate.delete({ where: { id } });
  revalidatePath(`/customers/${customerId}`);
}

/**
 * Полностью удалить клиента. Только админ.
 *
 * Заказы и продажи не удаляются: их хранение — самостоятельное правовое
 * основание (исполнение договора и бухгалтерский учёт), оно не зависит от
 * присутствия клиента в базе лояльности. Но связь с ним рвётся, а всё, что
 * существовало только ради лояльности — баллы, журнал, памятные даты,
 * привязка сертификатов — удаляется вместе с клиентом.
 *
 * Нужно и для отзыва согласия (по 99-З это требование прекратить обработку),
 * и для обычной уборки: дубли, ошибочные записи, тестовые клиенты.
 */
export async function deleteCustomer(customerId: number) {
  await requireRole(["admin"]);

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { phone: true, name: true },
  });
  if (!customer) throw new Error("Клиент не найден");

  await prisma.$transaction(async (tx) => {
    // Журнал ссылается на партии, поэтому его удаляем первым.
    await tx.loyaltyLog.deleteMany({ where: { customerId } });
    await tx.loyaltyBatch.deleteMany({ where: { customerId } });
    await tx.customerDate.deleteMany({ where: { customerId } });

    await tx.order.updateMany({ where: { customerId }, data: { customerId: null } });
    await tx.offlineSale.updateMany({ where: { customerId }, data: { customerId: null } });
    await tx.giftCertificate.updateMany({
      where: { buyerId: customerId },
      data: { buyerId: null },
    });
    await tx.giftCertificate.updateMany({
      where: { customerId },
      data: { customerId: null },
    });
    // Неиспользованные коды и ссылки этого номера больше ни к чему не ведут.
    await tx.smsCode.deleteMany({ where: { phone: customer.phone } });

    await tx.customer.delete({ where: { id: customerId } });
  });

  revalidatePath("/customers");
  return { ok: true, name: customer.name };
}
