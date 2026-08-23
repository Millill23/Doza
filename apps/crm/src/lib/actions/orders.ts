"use server";

import { prisma } from "@doza/db";
import { earnPoints } from "@doza/db/loyalty";
import { getCashbackRates } from "@doza/db/promos";
import { refundOrderPoints, revokeOrderCashback } from "@doza/db/payments";
import {
  canTransition,
  canClose,
  requiresTracking,
  shippedSmsText,
  refundReversal,
  ORDER_STATUS_LABEL,
  DELIVERY_SERVICE_LABEL,
  type OrderStatusValue,
  type DeliveryServiceValue,
} from "@doza/db/order-rules";
import { refundPayment } from "@doza/shared/bepaid";
import { formatByn } from "@doza/shared";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { sendSmsFromCrm } from "@/lib/sms";
import { notifyTelegram, tgEscape } from "@/lib/telegram";

async function getSetting(key: string, fallback: number): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s ? Number(s.value) : fallback;
}

/** Кешбек за заказ: процент берётся по каждому товару отдельно, как на витрине. */
async function cashbackFor(
  items: { productId: number; priceByn: unknown; qty: number }[],
): Promise<number> {
  const rates = await getCashbackRates(items.map((i) => i.productId));
  return (
    Math.round(
      items.reduce((sum, i) => {
        const line = Number(i.priceByn) * i.qty;
        return sum + line * ((rates[i.productId] ?? 0) / 100);
      }, 0) * 100,
    ) / 100
  );
}

export interface StatusChangeInput {
  orderId: number;
  next: OrderStatusValue;
  /** Обязательны при переходе в «отправлен» для посылки. */
  trackingNumber?: string;
  deliveryService?: DeliveryServiceValue;
}

/**
 * Перевести заказ на следующий шаг.
 *
 * Побочные эффекты привязаны к шагам, а не свалены в один «закрыт»: кешбек
 * начисляется на подтверждении, остатки списываются на распиве, SMS уходит
 * при отправке. Так продавец видит, что именно произошло, и откат при
 * возврате знает, что откатывать.
 */
export async function changeOrderStatus(input: StatusChangeInput) {
  const session = await requireRole(["admin", "seller"]);
  const userId = Number(session.user.id);
  const { orderId, next } = input;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) throw new Error("Заказ не найден");

  const from = order.status as OrderStatusValue;
  if (!canTransition(from, next))
    throw new Error(
      `Нельзя перевести «${ORDER_STATUS_LABEL[from]}» → «${ORDER_STATUS_LABEL[next]}»`,
    );

  // Магазин работает по стопроцентной предоплате: неоплаченный заказ в работу
  // не берём. Вернуть деньги за него тоже не потребуется — их и не списывали.
  if (order.paymentStatus !== "paid")
    throw new Error("Заказ не оплачен — брать его в работу нельзя");

  const needsTracking = requiresTracking(next, order.deliveryType);
  const tracking = (input.trackingNumber ?? "").trim();
  const service = input.deliveryService ?? order.deliveryService ?? null;
  if (needsTracking) {
    if (!tracking) throw new Error("Укажите трек-номер");
    if (!service) throw new Error("Выберите службу доставки");
  }

  // Остатки и кешбек здесь не трогаем: и то и другое проводится в момент
  // оплаты (`settlePaidOrder`). Смена статуса — это про работу продавца, а не
  // про деньги и склад.

  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: next,
      ...(needsTracking
        ? { trackingNumber: tracking, deliveryService: service }
        : {}),
    },
  });

  // SMS об отправке — после сохранения статуса: сбой отправки не должен
  // откатывать уже упакованную и переданную почте посылку.
  if (needsTracking && service) {
    try {
      await sendSmsFromCrm({
        kind: "order_shipped",
        phone: order.customerPhone,
        text: shippedSmsText(service, tracking),
        customerId: order.customerId,
        userId,
      });
    } catch (e) {
      console.error("[orders] SMS об отправке не отправлена:", e);
    }
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  return { ok: true };
}

/**
 * Вернуть деньги за заказ. Только админ, доступно на любом шаге.
 *
 * Откат зависит от того, докуда дошёл заказ: кешбек отбирается, если его уже
 * начислили, остатки возвращаются, если парфюм уже отлили. Откатывать то,
 * чего не было, нельзя — иначе возврат подарит баллы или создаст товар из
 * воздуха.
 */
export async function refundOrder(orderId: number, reasonRaw: string) {
  const session = await requireRole(["admin"]);
  const userId = Number(session.user.id);

  const reason = (reasonRaw ?? "").trim();
  if (reason.length < 3) throw new Error("Укажите причину возврата");

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      payments: { where: { status: "successful" }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!order) throw new Error("Заказ не найден");
  if (order.paymentStatus === "refunded")
    throw new Error("Деньги за этот заказ уже возвращены");

  const paid =
    Math.round((Number(order.totalByn) - Number(order.loyaltySpentByn)) * 100) / 100;

  // ─── Деньги ──────────────────────────────────────────────────────────────
  // Если платили только баллами, возвращать через шлюз нечего.
  if (paid > 0) {
    const payment = order.payments.find((p) => p.uid);
    if (!payment?.uid)
      throw new Error(
        "Не найдена транзакция оплаты — верните деньги вручную в кабинете bePaid",
      );

    const res = await refundPayment({
      parentUid: payment.uid,
      amountByn: paid,
      reason,
    });
    if (!res.ok)
      throw new Error(`Шлюз отказал в возврате: ${res.message ?? "неизвестная ошибка"}`);

    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "refunded", message: `Возврат: ${reason}` },
    });
  }

  // ─── Откат баллов и остатков ─────────────────────────────────────────────
  const undo = refundReversal(order.status as OrderStatusValue);

  if (undo.revokeCashback) await revokeOrderCashback(order.id, reason);
  if (undo.refundSpentPoints) await refundOrderPoints(order.id);

  if (undo.restoreStock) {
    for (const item of order.items) {
      const deltaMl = item.volumeMl * item.qty;
      await prisma.inventory.upsert({
        where: { productId: item.productId },
        update: { quantityMl: { increment: deltaMl } },
        create: { productId: item.productId, quantityMl: deltaMl },
      });
      await prisma.inventoryLog.create({
        data: {
          productId: item.productId,
          deltaMl,
          reason: "order_refund",
          refType: "order",
          refId: order.id,
          userId,
        },
      });
    }
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { status: "refunded", paymentStatus: "refunded" },
  });

  try {
    await notifyTelegram(
      `↩️ <b>Возврат по заказу #${order.id}</b>\n` +
        `Клиент: ${tgEscape(order.customerName)} (+${order.customerPhone})\n` +
        `Возвращено: <b>${formatByn(paid)}</b>\n` +
        `Причина: ${tgEscape(reason)}\n` +
        `Вернул: ${tgEscape(session.user.name ?? session.user.id)}`,
    );
  } catch (e) {
    console.error("[orders] TG о возврате не отправлено:", e);
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  return { ok: true, refunded: paid };
}

/**
 * Закрыть заказ вручную. Только админ.
 *
 * Для случаев, которые не ложатся в цепочку: покупатель забрал самовывозом,
 * договорились по телефону, заказ доехал и вопрос исчерпан. Ни денег, ни
 * склада это не трогает — они уже проведены при оплате.
 */
export async function closeOrder(orderId: number) {
  await requireRole(["admin"]);

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  if (!order) throw new Error("Заказ не найден");

  if (!canClose(order.status as OrderStatusValue))
    throw new Error(
      `Заказ в статусе «${ORDER_STATUS_LABEL[order.status as OrderStatusValue]}» закрывать нечего`,
    );

  await prisma.order.update({ where: { id: orderId }, data: { status: "closed" } });
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
}

/** Служба доставки и трек-номер — можно поправить после отправки. */
export async function setTracking(
  orderId: number,
  tracking: string,
  service: DeliveryServiceValue | null,
) {
  await requireRole(["admin", "seller"]);
  await prisma.order.update({
    where: { id: orderId },
    data: {
      trackingNumber: tracking.trim() || null,
      ...(service ? { deliveryService: service } : {}),
    },
  });
  revalidatePath(`/orders/${orderId}`);
}
