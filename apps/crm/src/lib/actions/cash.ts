"use server";

import { prisma } from "@doza/db";
import { getBalance, earnPoints, spendPoints } from "@doza/db/loyalty";
import { createSmsCode, verifySmsCode } from "@doza/db/sms-codes";
import { normalizePhone } from "@doza/shared";
import { sendSms } from "@doza/shared/sms";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";

/** Отправить покупателю SMS-код для подтверждения списания баллов. */
export async function requestLoyaltySpendOtp(phoneRaw: string, amount: number) {
  await requireRole(["admin", "seller"]);
  const phone = normalizePhone(phoneRaw);
  if (phone.length < 9) throw new Error("Некорректный телефон");
  if (amount <= 0) throw new Error("Укажите количество баллов");

  const customer = await prisma.customer.findUnique({ where: { phone } });
  if (!customer) throw new Error("Клиент не найден");
  const balance = await getBalance(customer.id);
  if (balance <= 0) throw new Error("У клиента нет баллов");

  const code = await createSmsCode(phone, "loyalty_spend", { amount });
  const sms = await sendSms(
    phone,
    `${code} - Код подтверждения для списания ${amount} баллов`,
  );
  return { ok: true, smsSent: sms.ok, balance };
}

async function getSetting(key: string, fallback: number): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s ? Number(s.value) : fallback;
}

export interface CashItemInput {
  productId: number;
  volumeMl: number;
  qty: number;
}

/** Поиск клиента по телефону + баланс баллов. */
export async function lookupCustomer(phoneRaw: string) {
  await requireRole(["admin", "seller"]);
  const phone = normalizePhone(phoneRaw);
  if (phone.length < 9) return { found: false, name: null, balance: 0 };

  const customer = await prisma.customer.findUnique({
    where: { phone },
    select: { id: true, name: true },
  });
  if (!customer) return { found: false, name: null, balance: 0 };

  const balance = await getBalance(customer.id);
  return { found: true, name: customer.name, balance };
}

interface CreateSaleInput {
  items: CashItemInput[];
  phone?: string;
  name?: string;
  loyaltySpend?: number;
  loyaltyOtp?: string;
}

/** Создать и сразу закрыть оффлайн-продажу. */
export async function createOfflineSale(input: CreateSaleInput) {
  const session = await requireRole(["admin", "seller"]);
  const sellerId = Number(session.user.id);

  const items = Array.isArray(input.items) ? input.items : [];
  if (items.length === 0) throw new Error("Корзина пуста");

  // Пересчёт цен на сервере
  const volumeRecords = await prisma.productVolume.findMany({
    where: {
      isActive: true,
      OR: items.map((i) => ({ productId: i.productId, volumeMl: i.volumeMl })),
    },
  });
  const priceMap = new Map<string, number>();
  for (const v of volumeRecords)
    priceMap.set(`${v.productId}:${v.volumeMl}`, Number(v.priceByn));

  let total = 0;
  const resolved = items.map((i) => {
    const price = priceMap.get(`${i.productId}:${i.volumeMl}`);
    if (price == null) throw new Error("Позиция недоступна");
    const qty = Math.max(1, Math.floor(i.qty || 1));
    total += price * qty;
    return { ...i, qty, priceByn: price };
  });
  total = Math.round(total * 100) / 100;

  // Клиент (опционально)
  let customerId: number | null = null;
  if (input.phone) {
    const phone = normalizePhone(input.phone);
    if (phone.length >= 9) {
      const customer = await prisma.customer.upsert({
        where: { phone },
        update: input.name ? { name: input.name } : {},
        create: { phone, name: input.name?.trim() || "Покупатель" },
      });
      customerId = customer.id;
    }
  }

  // Списание баллов — требует подтверждения кодом из SMS
  let loyaltySpent = 0;
  if (customerId && input.loyaltySpend && input.loyaltySpend > 0) {
    const phone = normalizePhone(input.phone ?? "");
    const otp = await verifySmsCode(phone, "loyalty_spend", input.loyaltyOtp ?? "");
    if (!otp.ok) {
      throw new Error(
        otp.error ?? "Списание баллов не подтверждено кодом из SMS",
      );
    }
    const balance = await getBalance(customerId);
    loyaltySpent = Math.min(input.loyaltySpend, balance, total);
    loyaltySpent = Math.round(loyaltySpent * 100) / 100;
  }

  // Создание закрытой продажи
  const sale = await prisma.offlineSale.create({
    data: {
      sellerId,
      customerId,
      status: "closed",
      totalByn: total,
      loyaltySpentByn: loyaltySpent,
      closedAt: new Date(),
      items: {
        create: resolved.map((r) => ({
          productId: r.productId,
          volumeMl: r.volumeMl,
          qty: r.qty,
          priceByn: r.priceByn,
        })),
      },
    },
  });

  // Списание остатков
  for (const r of resolved) {
    const delta = -(r.volumeMl * r.qty);
    await prisma.inventory.upsert({
      where: { productId: r.productId },
      update: { quantityMl: { increment: delta } },
      create: { productId: r.productId, quantityMl: 0 },
    });
    await prisma.inventoryLog.create({
      data: {
        productId: r.productId,
        deltaMl: delta,
        reason: "offline_sale",
        refType: "offline_sale",
        refId: sale.id,
        userId: sellerId,
      },
    });
  }

  // Баллы: списание и начисление
  if (customerId) {
    if (loyaltySpent > 0) {
      await spendPoints(customerId, loyaltySpent, {
        type: "offline_sale",
        id: sale.id,
      });
    }
    const percent = await getSetting("loyalty_percent", 5);
    const days = await getSetting("loyalty_days", 180);
    const net = total - loyaltySpent;
    const earn = Math.round(net * (percent / 100) * 100) / 100;
    if (earn > 0) {
      await earnPoints(customerId, earn, days, {
        type: "offline_sale",
        id: sale.id,
      });
    }
    await prisma.customer.update({
      where: { id: customerId },
      data: { lastPurchaseAt: new Date(), lastPurchaseSum: total },
    });
  }

  revalidatePath("/cash");
  revalidatePath("/");

  return {
    saleId: sale.id,
    total,
    loyaltySpent,
    toPay: Math.round((total - loyaltySpent) * 100) / 100,
  };
}
