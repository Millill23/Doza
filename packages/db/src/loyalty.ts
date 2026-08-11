import { prisma } from "./index";

/**
 * Бизнес-логика лояльности (партионный учёт, FIFO по дате сгорания).
 * 1 балл = 1 BYN. Используется и сайтом, и CRM.
 */

/** Текущий баланс баллов клиента (сумма непросроченных партий). */
export async function getBalance(customerId: number): Promise<number> {
  const now = new Date();
  const batches = await prisma.loyaltyBatch.findMany({
    where: {
      customerId,
      amountByn: { gt: 0 },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { amountByn: true },
  });
  return batches.reduce((sum, b) => sum + Number(b.amountByn), 0);
}

/** Баланс по номеру телефона (или 0, если клиент не найден). */
export async function getBalanceByPhone(phone: string): Promise<number> {
  const customer = await prisma.customer.findUnique({
    where: { phone },
    select: { id: true },
  });
  if (!customer) return 0;
  return getBalance(customer.id);
}

/** Ближайшая дата сгорания баллов (или null). */
export async function getNextExpiry(customerId: number): Promise<Date | null> {
  const now = new Date();
  const batch = await prisma.loyaltyBatch.findFirst({
    where: {
      customerId,
      amountByn: { gt: 0 },
      expiresAt: { gt: now },
    },
    orderBy: { expiresAt: "asc" },
    select: { expiresAt: true },
  });
  return batch?.expiresAt ?? null;
}

/** Клиент Prisma внутри транзакции — чтобы начислять из чужой транзакции. */
export type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Начисление внутри уже открытой транзакции. */
async function earnPointsTx(
  tx: TxClient,
  customerId: number,
  amountByn: number,
  loyaltyDays: number,
  ref: { type: string; id: number },
  reason?: string,
): Promise<void> {
  const expiresAt =
    loyaltyDays > 0
      ? new Date(Date.now() + loyaltyDays * 24 * 60 * 60 * 1000)
      : null;

  const batch = await tx.loyaltyBatch.create({
    data: {
      customerId,
      amountByn,
      expiresAt,
      refType: ref.type,
      refId: ref.id,
    },
  });
  await tx.loyaltyLog.create({
    data: {
      customerId,
      batchId: batch.id,
      deltaByn: amountByn,
      opType: "earned",
      refType: ref.type,
      refId: ref.id,
      reason: reason ?? null,
    },
  });
}

/**
 * Начислить баллы: создаёт партию с датой сгорания и пишет в журнал.
 * loyaltyDays = 0 → бессрочно.
 *
 * Баллы копятся только у клиентов, подтвердивших согласие на обработку
 * персональных данных (99-З): накопительная программа — цель обработки сверх
 * разовой покупки. Без согласия продажа проходит как обычно, просто без
 * начисления — блокировать чек из-за этого нельзя.
 *
 * Возвращает `true`, если баллы действительно начислены. Вызывающий код обязан
 * смотреть на результат, а не на запрошенную сумму: иначе касса скажет «начислено
 * 2.25», SMS пообещает бонусы, а в базе не появится ничего.
 *
 * `opts.tx` начисляет внутри чужой транзакции — нужно там, где начисление
 * обязано быть неразрывно с другой записью (активация сертификата: либо и
 * статус меняется, и баллы начислены, либо не происходит ничего).
 * `opts.reason` — причина (для ручного начисления админом).
 */
export async function earnPoints(
  customerId: number,
  amountByn: number,
  loyaltyDays: number,
  ref: { type: string; id: number },
  opts?: { reason?: string; tx?: TxClient },
): Promise<boolean> {
  if (amountByn <= 0) return false;
  if (!(await hasConsent(customerId, opts?.tx))) return false;

  if (opts?.tx) {
    await earnPointsTx(opts.tx, customerId, amountByn, loyaltyDays, ref, opts.reason);
    return true;
  }

  await prisma.$transaction(async (tx) => {
    await earnPointsTx(tx, customerId, amountByn, loyaltyDays, ref, opts?.reason);
  });
  return true;
}

/** Подтвердил ли клиент согласие на обработку ПД. */
async function hasConsent(customerId: number, tx?: TxClient): Promise<boolean> {
  const db = tx ?? prisma;
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { consentStatus: true },
  });
  return customer?.consentStatus === "confirmed";
}

/**
 * Списать баллы по FIFO (сначала партии с ближайшим сроком сгорания).
 * Возвращает фактически списанную сумму.
 */
export async function spendPoints(
  customerId: number,
  amountByn: number,
  ref: { type: string; id: number },
  opts?: { reason?: string },
): Promise<number> {
  if (amountByn <= 0) return 0;

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const batches = await tx.loyaltyBatch.findMany({
      where: {
        customerId,
        amountByn: { gt: 0 },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
    });

    let remaining = amountByn;
    let spentTotal = 0;

    for (const batch of batches) {
      if (remaining <= 0) break;
      const available = Number(batch.amountByn);
      const take = Math.min(available, remaining);

      await tx.loyaltyBatch.update({
        where: { id: batch.id },
        data: { amountByn: available - take },
      });
      await tx.loyaltyLog.create({
        data: {
          customerId,
          batchId: batch.id,
          deltaByn: -take,
          opType: "spent",
          refType: ref.type,
          refId: ref.id,
          reason: opts?.reason ?? null,
        },
      });

      remaining -= take;
      spentTotal += take;
    }

    return spentTotal;
  });
}
