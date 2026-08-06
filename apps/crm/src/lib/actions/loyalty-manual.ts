"use server";

import { prisma } from "@doza/db";
import { earnPoints, getBalance } from "@doza/db/loyalty";
import { normalizePhone } from "@doza/shared";
import { sendSms } from "@doza/shared/sms";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { notifyTelegram } from "@/lib/telegram";

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
  const phone = normalizePhone(phoneRaw);
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

  const phone = normalizePhone(input.phone ?? "");
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
  await earnPoints(
    customer.id,
    amount,
    days,
    { type: "manual", id: Number(session.user.id) },
    { reason },
  );

  const balance = await getBalance(customer.id);

  try {
    await sendSms(
      phone,
      `Вам начислено ${fmt(amount)} бонусов: ${reason}. Всего бонусов: ${fmt(balance)}`,
    );
  } catch (e) {
    console.error("[loyalty] SMS о начислении не отправлена:", e);
  }

  try {
    await notifyTelegram(
      `🎯 <b>Начислены баллы вручную</b>\n` +
        `Клиент: ${customer.name} (${phone})${customer.vipCardNumber ? " ⭐VIP" : ""}\n` +
        `Начислено: <b>${fmt(amount)}</b> баллов\n` +
        `Причина: ${reason}\n` +
        `Баланс: ${fmt(balance)}\n` +
        `Начислил: ${session.user.name ?? session.user.id}`,
    );
  } catch (e) {
    console.error("[loyalty] TG о начислении не отправлено:", e);
  }

  revalidatePath("/loyalty");
  revalidatePath(`/customers/${customer.id}`);

  return { customerId: customer.id, name: customer.name, amount, balance };
}
