import { prisma } from "./index";
import { earnPoints } from "./loyalty";
import { getCashbackRates } from "./promos";
import { justRanLow, lowStockMessage } from "./stock-rules";

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
    // Условный UPDATE, а не проверка выше: уведомление bePaid приходит до
    // 25 раз и может обогнать возврат покупателя на сайт. Прочитали оба
    // «не оплачен» — и оба начислили бы кешбек и списали остатки. Пометить
    // оплаченным должен ровно один.
    const claimed = await prisma.order.updateMany({
      where: { id: order.id, paymentStatus: { not: "paid" } },
      data: { paymentStatus: "paid", paidAt: new Date() },
    });
    return {
      orderId: order.id,
      paymentStatus: "paid",
      justPaid: claimed.count === 1,
      pointsRefunded: 0,
    };
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

export interface SettleResult {
  /** Начислено баллов. 0 — клиент без согласия либо кешбек нулевой. */
  earned: number;
  /** Списано миллилитров суммарно — для журнала. */
  consumedMl: number;
}

/**
 * Сказать продавцам, что флакон заканчивается.
 *
 * Нужно именно продавцу за прилавком: онлайн-заказ уже забрал миллилитры, но
 * флакон физически ещё стоит в зале, и его могут распить второй раз — тому,
 * кто пришёл ногами. Сбой уведомления не должен ронять проведение оплаты:
 * деньги уже списаны, заказ обязан пройти.
 */
/** Перенос строки в тексте уведомления. */
const BR = String.fromCharCode(10);

async function warnLowStock(
  ranLow: { productId: number; afterMl: number }[],
  notify?: (text: string) => Promise<unknown>,
): Promise<void> {
  if (!notify || ranLow.length === 0) return;
  try {
    const products = await prisma.product.findMany({
      where: { id: { in: ranLow.map((r) => r.productId) } },
      select: { id: true, name: true, brand: { select: { name: true } } },
    });
    const nameOf = new Map(
      products.map((p) => [p.id, `${p.brand.name} ${p.name}`]),
    );
    const lines = ranLow.map((r) =>
      lowStockMessage(nameOf.get(r.productId) ?? `товар ${r.productId}`, r.afterMl),
    );
    await notify(
      "⚠️ Заканчивается на складе" + BR + lines.join(BR),
    );
  } catch (e) {
    console.error("[stock] уведомление об остатке не отправлено:", e);
  }
}

/**
 * Провести оплаченный заказ по складу и лояльности.
 *
 * Вызывается ровно один раз — в момент, когда заказ стал оплаченным. Раньше
 * это делалось на подтверждении продавцом, но магазин работает по предоплате и
 * никому не перезванивает: пришли деньги — заказ принят. Держать остатки
 * несписанными до распива нельзя, иначе оплаченный миллилитр ещё числится на
 * складе и его продают второй раз в кассе.
 *
 * Повторный вызов защищён вызывающим кодом (`justPaid`), а начисление баллов —
 * ещё и согласием клиента: без него `earnPoints` откажет, и SMS не должна
 * обещать несуществующие баллы.
 */
export async function settlePaidOrder(
  orderId: number,
  loyaltyDays: number,
  /** Куда сообщить, что флакон заканчивается. Без него просто молчим. */
  notify?: (text: string) => Promise<unknown>,
): Promise<SettleResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return { earned: 0, consumedMl: 0 };

  // Списываем по товару целиком: две позиции одного аромата льются из одного
  // флакона, и по отдельности порог «заканчивается» они бы не пересекли.
  const perProduct = new Map<number, number>();
  for (const item of order.items) {
    const ml = item.volumeMl * item.qty;
    perProduct.set(item.productId, (perProduct.get(item.productId) ?? 0) + ml);
  }

  let consumedMl = 0;
  const ranLow: { productId: number; afterMl: number }[] = [];

  for (const [productId, ml] of perProduct) {
    const before = await prisma.inventory.findUnique({
      where: { productId },
      select: { quantityMl: true },
    });
    const beforeMl = before?.quantityMl ?? 0;

    const updated = await prisma.inventory.upsert({
      where: { productId },
      update: { quantityMl: { increment: -ml } },
      create: { productId, quantityMl: -ml },
      select: { quantityMl: true },
    });
    await prisma.inventoryLog.create({
      data: {
        productId,
        deltaMl: -ml,
        reason: "order_paid",
        refType: "order",
        refId: order.id,
        // Списал не сотрудник, а факт оплаты.
        userId: null,
      },
    });
    consumedMl += ml;
    if (justRanLow(beforeMl, updated.quantityMl)) {
      ranLow.push({ productId, afterMl: updated.quantityMl });
    }
  }

  await warnLowStock(ranLow, notify);

  let earned = 0;
  if (order.customerId) {
    const rates = await getCashbackRates(order.items.map((i) => i.productId));
    // Процент — по каждому товару отдельно, включая повышенный кешбек акции,
    // как обещает витрина. Доставка кешбека не даёт: это не покупка.
    const cashback =
      Math.round(
        order.items.reduce((sum, i) => {
          const line = Number(i.priceByn) * i.qty;
          return sum + line * ((rates[i.productId] ?? 0) / 100);
        }, 0) * 100,
      ) / 100;

    if (cashback > 0) {
      const ok = await earnPoints(order.customerId, cashback, loyaltyDays, {
        type: "order",
        id: order.id,
      });
      if (ok) earned = cashback;
    }

    await prisma.customer.update({
      where: { id: order.customerId },
      data: { lastPurchaseAt: new Date(), lastPurchaseSum: order.totalByn },
    });
  }

  return { earned, consumedMl };
}

/**
 * Отобрать кешбек, начисленный за заказ. Возвращает снятую сумму.
 *
 * Партию не удаляем, а обнуляем: на неё уже ссылается журнал, и история должна
 * остаться читаемой. Снимаем только остаток — если клиент часть баллов успел
 * потратить, отнимать их второй раз нельзя, баланс уйдёт в минус.
 */
export async function revokeOrderCashback(
  orderId: number,
  reason: string,
): Promise<number> {
  const batches = await prisma.loyaltyBatch.findMany({
    where: { refType: "order", refId: orderId, amountByn: { gt: 0 } },
  });

  let taken = 0;
  for (const batch of batches) {
    const left = Number(batch.amountByn);
    await prisma.loyaltyBatch.update({
      where: { id: batch.id },
      data: { amountByn: 0 },
    });
    await prisma.loyaltyLog.create({
      data: {
        customerId: batch.customerId,
        batchId: batch.id,
        deltaByn: -left,
        opType: "expired",
        refType: "order_refund",
        refId: orderId,
        reason,
      },
    });
    taken += left;
  }
  return Math.round(taken * 100) / 100;
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
