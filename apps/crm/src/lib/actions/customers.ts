"use server";

import { prisma } from "@doza/db";
import { createSmsCode, verifySmsCode } from "@doza/db/sms-codes";
import { normalizePhone } from "@doza/shared";
import { assertCustomerName } from "@doza/shared/customer-name";
import { sendSms } from "@doza/shared/sms";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";

/** Продавец инициирует регистрацию клиента: отправить SMS-код на его телефон. */
export async function requestOfflineRegOtp(phoneRaw: string) {
  await requireRole(["admin", "seller", "marketer"]);
  const phone = normalizePhone(phoneRaw);
  if (phone.length < 9) throw new Error("Некорректный телефон");

  const existing = await prisma.customer.findUnique({ where: { phone } });
  if (existing?.phoneVerified) {
    return { ok: true, already: true, name: existing.name };
  }

  const code = await createSmsCode(phone, "offline_register");
  const sms = await sendSms(phone, `${code} - код регистрации в программе лояльности DOZA`);
  return { ok: true, smsSent: sms.ok };
}

export interface OfflineRegInput {
  phone: string;
  name: string;
  otp: string;
  birthday?: string;
  dates?: { date: string; description: string }[];
}

/** Завершить регистрацию клиента продавцом после подтверждения кодом. */
export async function registerCustomerOffline(input: OfflineRegInput) {
  await requireRole(["admin", "seller", "marketer"]);
  const phone = normalizePhone(input.phone);
  const name = assertCustomerName(input.name ?? "");

  const otp = await verifySmsCode(phone, "offline_register", input.otp ?? "");
  if (!otp.ok) throw new Error(otp.error ?? "Неверный код подтверждения");

  const customer = await prisma.customer.upsert({
    where: { phone },
    update: {
      name,
      phoneVerified: true,
      birthday: input.birthday ? new Date(input.birthday) : undefined,
    },
    create: {
      phone,
      name,
      phoneVerified: true,
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

  revalidatePath("/customers");
  return { ok: true, customerId: customer.id };
}

/** Зарегистрировать VIP-клиента (админ, без подтверждения телефона). */
export async function registerVip(
  phoneRaw: string,
  nameRaw: string,
  cardRaw: string,
) {
  await requireRole(["admin"]);
  const phone = normalizePhone(phoneRaw);
  if (phone.length < 9) throw new Error("Некорректный телефон");
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

  if (!before?.vipCardNumber) await sendVipWelcomeSms(phone, name);

  revalidatePath("/customers");
  return { ok: true, customerId: customer.id };
}

/**
 * Поздравительная SMS новому VIP-клиенту.
 * Сбой отправки не должен ломать регистрацию — только пишем в лог.
 */
async function sendVipWelcomeSms(phone: string, name: string) {
  try {
    await sendSms(
      phone,
      `Поздравляем, ${name} - вы стали VIP клиентом магазина оригинальной парфюмерии DOZA`,
    );
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
    await sendVipWelcomeSms(before.phone, before.name);
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
  const phone = normalizePhone(input.phone ?? "");
  if (phone.length < 9) throw new Error("Укажите корректный телефон");

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
