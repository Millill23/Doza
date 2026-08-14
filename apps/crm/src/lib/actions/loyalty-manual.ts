"use server";

import { prisma } from "@doza/db";
import { earnPoints, getBalance, spendPoints } from "@doza/db/loyalty";
import { sendSmsFromCrm } from "@/lib/sms";
import { toStoredPhone } from "@doza/shared/phone";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { notifyTelegram, tgEscape } from "@/lib/telegram";

async function getSetting(key: string, fallback: number): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s ? Number(s.value) : fallback;
}

/** Баллы без лишних нулей. */
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** Найти клиента по телефону — для подстановки имени перед начислением. */
export async function findCustomerForPoints(phoneRaw: string) {
  await requireRole(["admin"]);
  const phone = toStoredPhone(phoneRaw);
  if (phone.length < 9) return { found: false as const };

  const customer = await prisma.customer.findUnique({
    where: { phone },
    select: { id: true, name: true, vipCardNumber: true },
  });
  if (!customer) return { found: false as const };

  return {
    found: true as const,
    name: customer.name,
    vipCard: customer.vipCardNumber,
    balance: await getBalance(customer.id),
  };
}

/**
 * Начислить баллы клиенту вручную. Только админ.
 * Причина обязательна — она попадает в журнал лояльности и в TG-оповещение.
 */
export async function grantPoints(input: {
  phone: string;
  amount: number;
  reason: string;
}) {
  const session = await requireRole(["admin"]);

  const phone = toStoredPhone(input.phone ?? "");
  if (phone.length < 9) throw new Error("Укажите корректный телефон клиента");

  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0)
    throw new Error("Количество баллов должно быть больше нуля");

  const reason = (input.reason ?? "").trim();
  if (reason.length < 3) throw new Error("Укажите причину начисления");

  const customer = await prisma.customer.findUnique({ where: { phone } });
  if (!customer)
    throw new Error("Клиент с таким телефоном не найден");

  const days = await getSetting("loyalty_days", 180);
  const accrued = await earnPoints(
    customer.id,
    amount,
    days,
    { type: "manual", id: Number(session.user.id) },
    { reason },
  );
  // Начисление — осознанное действие админа, поэтому молча проглотить отказ
  // нельзя: иначе он увидит «готово», клиент получит SMS про бонусы, а баллов
  // не будет.
  if (!accrued)
    throw new Error(
      `${customer.name} не подтвердил согласие на обработку персональных данных — начислить баллы нельзя. Отправьте запрос согласия в карточке клиента.`,
    );

  const balance = await getBalance(customer.id);

  try {
    await sendSmsFromCrm({
      kind: "points_manual",
      phone,
      text: `Вам начислено ${fmt(amount)} бонусов: ${reason}. Всего бонусов: ${fmt(balance)}`,
      customerId: customer.id,
      userId: Number(session.user.id),
    });
  } catch (e) {
    console.error("[loyalty] SMS о начислении не отправлена:", e);
  }

  try {
    await notifyTelegram(
      `🎯 <b>Начислены баллы вручную</b>\n` +
        `Клиент: ${tgEscape(customer.name)} (${phone})${customer.vipCardNumber ? " ⭐VIP" : ""}\n` +
        `Начислено: <b>${fmt(amount)}</b> баллов\n` +
        `Причина: ${tgEscape(reason)}\n` +
        `Баланс: ${fmt(balance)}\n` +
        `Начислил: ${tgEscape(session.user.name ?? session.user.id)}`,
    );
  } catch (e) {
    console.error("[loyalty] TG о начислении не отправлено:", e);
  }

  revalidatePath("/loyalty");
  revalidatePath(`/customers/${customer.id}`);

  return { customerId: customer.id, name: customer.name, amount, balance };
}

/**
 * Списать баллы у клиента вручную. Только админ.
 *
 * Списание идёт по тем же правилам, что и оплата баллами (FIFO — сначала
 * сгорающие партии), поэтому баланс остаётся консистентным. Причина
 * обязательна: операция уменьшает деньги клиента и должна быть объяснима.
 * SMS клиенту НЕ отправляется — это корректирующее действие магазина; в
 * Telegram уходит запись для аудита.
 */
export async function deductPoints(input: {
  phone: string;
  amount: number;
  reason: string;
}) {
  const session = await requireRole(["admin"]);

  const phone = toStoredPhone(input.phone ?? "");
  if (phone.length < 9) throw new Error("Укажите корректный телефон клиента");

  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0)
    throw new Error("Количество баллов должно быть больше нуля");

  const reason = (input.reason ?? "").trim();
  if (reason.length < 3) throw new Error("Укажите причину списания");

  const customer = await prisma.customer.findUnique({ where: { phone } });
  if (!customer) throw new Error("Клиент с таким телефоном не найден");

  const before = await getBalance(customer.id);
  if (before <= 0) throw new Error("У клиента нет баллов");
  if (amount > before)
    throw new Error(
      `Нельзя списать больше, чем есть на балансе (${fmt(before)})`,
    );

  const spent = await spendPoints(
    customer.id,
    amount,
    { type: "manual", id: Number(session.user.id) },
    { reason },
  );

  const balance = await getBalance(customer.id);

  try {
    await notifyTelegram(
      `➖ <b>Списаны баллы вручную</b>\n` +
        `Клиент: ${tgEscape(customer.name)} (${phone})${customer.vipCardNumber ? " ⭐VIP" : ""}\n` +
        `Списано: <b>${fmt(spent)}</b> баллов\n` +
        `Причина: ${tgEscape(reason)}\n` +
        `Баланс: ${fmt(balance)}\n` +
        `Списал: ${tgEscape(session.user.name ?? session.user.id)}`,
    );
  } catch (e) {
    console.error("[loyalty] TG о списании не отправлено:", e);
  }

  revalidatePath("/loyalty");
  revalidatePath(`/customers/${customer.id}`);

  return { customerId: customer.id, name: customer.name, amount: spent, balance };
}
