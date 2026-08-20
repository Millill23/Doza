import { prisma } from "./index";
import { earnPoints } from "./loyalty";

/**
 * Оплата заказов через bePaid.
 *
 * Ключевое правило: заказ считается оплаченным только после того, как мы сами
 * спросили статус у шлюза. Уведомления bePaid ничем не подписаны, а `status`
 * в адресе возврата покупатель правит руками — поэтому оба этих события лишь
 * повод сходить за настоящим статусом, и оба ведут в одну функцию
 * `applyPaymentResult`, чтобы не разъехались.
 */

export interface VerifiedPayment {
  token: string;
  uid: string | null;
  /** Итог проверки: оплачено, отклонено, просрочено или ещё в процессе. */
  outcome: "paid" | "failed" | "expired" | "pending";
  isTest: boolean;
  message: string | null;
  /** Прошёл ли платёж все проверки (сумма, тестовость). */
  accepted: boolean;
  /** Почему не приняли — для журнала и объяснения покупателю. */
  rejectReason?: string;
}

export interface ApplyResult {
  orderId: number;
  /** Состояние заказа после применения. */
  paymentStatus: "pending" | "paid" | "failed" | "expired";
  /** Заказ перешёл в оплаченный именно этим вызовом. */
  justPaid: boolean;
  /** Баллы вернулись клиенту этим вызовом. */
  pointsRefunded: number;
}

async function getSetting(key: string, fallback: number): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s ? Number(s.value) : fallback;
}

/**
 * Применить результат проверки платежа к заказу.
 *
 * Идемпотентна: уведомление приходит несколько раз (bePaid повторяет попытки
 * до 25 раз), и покупатель одновременно возвращается на сайт. Повторный вызов
 * для уже оплаченного заказа ничего не меняет и не начисляет ничего дважды.
 */
export async function applyPaymentResult(v: VerifiedPayment): Promise<ApplyResult | null> {
  const payment = await prisma.payment.findUnique({
    where: { token: v.token },
    include: { order: true },
  });
  if (!payment) return null;

  const order = payment.order;
  const status = v.accepted ? "paid" : v.outcome === "pending" ? "pending" : v.outcome;

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      uid: v.uid,
      status: v.accepted ? "successful" : v.outcome,
      isTest: v.isTest,
      message: v.rejectReason ?? v.message,
      paidAt: v.accepted ? new Date() : null,
    },
  });

  // Заказ уже оплачен — второй раз ничего не делаем. Сюда приходят и повторы
  // уведомлений, и возврат покупателя на сайт после того же платежа.
  if (order.paymentStatus === "paid") {
    return {
      orderId: order.id,
      paymentStatus: "paid",
      justPaid: false,
      pointsRefunded: 0,
    };
  }

  if (v.accepted) {
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: "paid", paidAt: new Date() },
    });
    return { orderId: order.id, paymentStatus: "paid", justPaid: true, pointsRefunded: 0 };
  }

  if (v.outcome === "pending") {
    return { orderId: order.id, paymentStatus: "pending", justPaid: false, pointsRefunded: 0 };
  }

  // Оплата не состоялась. Баллы были списаны при создании заказа, чтобы
  // никто не потратил их дважды, пока покупатель на странице оплаты, —
  // теперь возвращаем, иначе они сгорели бы ни за что.
  const refunded = await refundOrderPoints(order.id);
  await prisma.order.update({
    where: { id: order.id },
    data: { paymentStatus: v.outcome, status: "rejected" },
  });

  return {
    orderId: order.id,
    paymentStatus: v.outcome,
    justPaid: false,
    pointsRefunded: refunded,
  };
}

/**
 * Вернуть баллы, списанные за заказ. Возвращает сумму возврата.
 *
 * Проверяет, не возвращали ли уже: неудачных попыток оплаты может быть
 * несколько, и каждая не должна дарить клиенту новую порцию баллов.
 */
export async function refundOrderPoints(orderId: number): Promise<number> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { customerId: true, loyaltySpentByn: true },
  });
  if (!order?.customerId) return 0;

  const spent = Number(order.loyaltySpentByn);
  if (spent <= 0) return 0;

  const already = await prisma.loyaltyBatch.findFirst({
    where: { refType: "order_refund", refId: orderId },
  });
  if (already) return 0;

  const days = await getSetting("loyalty_days", 180);
  const expiresAt =
    days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;

  const batch = await prisma.loyaltyBatch.create({
    data: {
      customerId: order.customerId,
      amountByn: spent,
      expiresAt,
      refType: "order_refund",
      refId: orderId,
    },
  });
  await prisma.loyaltyLog.create({
    data: {
      customerId: order.customerId,
      batchId: batch.id,
      deltaByn: spent,
      opType: "earned",
      refType: "order_refund",
      refId: orderId,
    },
  });

  return spent;
}

/** Зарегистрировать попытку оплаты заказа. */
export async function createPaymentAttempt(opts: {
  orderId: number;
  token: string;
  amountByn: number;
  method?: "card" | "erip";
}) {
  return prisma.payment.create({
    data: {
      orderId: opts.orderId,
      token: opts.token,
      amountByn: opts.amountByn,
      method: opts.method ?? "card",
    },
  });
}

/**
 * Токены платежей, по которым заказ всё ещё числится неоплаченным.
 *
 * Нужны для сверки со шлюзом. Полагаться на один только вебхук нельзя: он
 * может не дойти (перезапуск во время деплоя, сбой сети, исчерпанные попытки
 * доставки), а покупатель имеет полное право закрыть вкладку сразу после
 * оплаты и не нажать «Продолжить». Тогда деньги списаны, а заказ висит.
 *
 * Берём окно в несколько суток: токен живёт час, но bePaid отмечает его
 * просроченным не мгновенно, а старые заказы разбирать смысла нет.
 */
export async function pendingPaymentTokens(withinDays = 3): Promise<string[]> {
  const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000);
  const rows = await prisma.payment.findMany({
    where: {
      createdAt: { gte: since },
      order: { paymentStatus: "pending" },
    },
    orderBy: { createdAt: "asc" },
    select: { token: true },
  });
  return rows.map((r) => r.token);
}

/** Заказ с последней попыткой оплаты — для страниц возврата. */
export async function orderWithPayment(orderId: number) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
      items: true,
    },
  });
}

/** Найти заказ по токену платежа. */
export async function orderByPaymentToken(token: string) {
  const payment = await prisma.payment.findUnique({
    where: { token },
    include: { order: true },
  });
  return payment?.order ?? null;
}

/**
 * Начислить кешбек за оплаченный заказ.
 *
 * Вызывается при закрытии заказа в CRM, а не в момент оплаты: до вручения
 * товара покупатель может отказаться, и тогда начисленные баллы пришлось бы
 * отбирать. Оставлено здесь рядом с возвратом, чтобы обе операции с баллами
 * по заказу лежали в одном месте.
 */
export async function grantOrderCashback(
  orderId: number,
  amountByn: number,
  loyaltyDays: number,
): Promise<boolean> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { customerId: true },
  });
  if (!order?.customerId || amountByn <= 0) return false;
  return earnPoints(order.customerId, amountByn, loyaltyDays, {
    type: "order",
    id: orderId,
  });
}
