"use server";

import { prisma } from "@doza/db";
import { earnPoints } from "@doza/db/loyalty";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";

type OrderStatus =
  | "new"
  | "confirmed"
  | "shipped"
  | "closed"
  | "rejected"
  | "returned";

// Разрешённые переходы статусов
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ["confirmed", "rejected"],
  confirmed: ["shipped", "closed", "rejected"],
  shipped: ["closed", "returned"],
  closed: [],
  rejected: [],
  returned: [],
};

async function getSetting(key: string, fallback: number): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s ? Number(s.value) : fallback;
}

/** Закрытие заказа: списание остатков + начисление баллов на чистую сумму. */
async function applyClose(orderId: number, userId: number) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return;

  // Списание остатков
  for (const item of order.items) {
    const deltaMl = -(item.volumeMl * item.qty);
    await prisma.inventory.upsert({
      where: { productId: item.productId },
      update: { quantityMl: { increment: deltaMl } },
      create: { productId: item.productId, quantityMl: 0 },
    });
    await prisma.inventoryLog.create({
      data: {
        productId: item.productId,
        deltaMl,
        reason: "order_closed",
        refType: "order",
        refId: order.id,
        userId,
      },
    });
  }

  // Начисление баллов на чистую оплаченную сумму
  if (order.customerId) {
    const percent = await getSetting("loyalty_percent", 5);
    const days = await getSetting("loyalty_days", 180);
    const net = Number(order.totalByn) - Number(order.loyaltySpentByn);
    const earn = Math.round(net * (percent / 100) * 100) / 100;
    if (earn > 0) {
      await earnPoints(order.customerId, earn, days, {
        type: "order",
        id: order.id,
      });
    }

    // обновляем "последнюю покупку"
    await prisma.customer.update({
      where: { id: order.customerId },
      data: { lastPurchaseAt: new Date(), lastPurchaseSum: order.totalByn },
    });
  }
}

export async function changeOrderStatus(orderId: number, next: OrderStatus) {
  const session = await requireRole(["admin", "seller"]);
  const userId = Number(session.user.id);

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Заказ не найден");

  const allowed = TRANSITIONS[order.status as OrderStatus] ?? [];
  if (!allowed.includes(next)) {
    throw new Error(`Недопустимый переход: ${order.status} → ${next}`);
  }

  if (next === "closed") {
    await applyClose(orderId, userId);
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { status: next },
  });

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
}

export async function setTrackingNumber(orderId: number, tracking: string) {
  await requireRole(["admin", "seller"]);
  await prisma.order.update({
    where: { id: orderId },
    data: { trackingNumber: tracking.trim() || null },
  });
  revalidatePath(`/orders/${orderId}`);
}
