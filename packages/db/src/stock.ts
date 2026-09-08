import { prisma } from "./index";
import {
  spillWriteOff,
  clampPercent,
  SPILL_PERCENT_SETTING,
} from "./spill-rules";

/**
 * Списание остатков со склада — единственное место, где это делается.
 *
 * Раньше касса и оплата заказа списывали остаток каждая по-своему, и добавить
 * туда учёт потерь при распиве значило бы вписать одну и ту же арифметику
 * дважды с надеждой, что она не разъедется.
 */

/** Процент технологических потерь из настроек. */
export async function getSpillPercent(): Promise<number> {
  const s = await prisma.setting.findUnique({
    where: { key: SPILL_PERCENT_SETTING },
  });
  return clampPercent(s ? Number(s.value) : 0);
}

export interface WriteOffResult {
  beforeMl: number;
  afterMl: number;
  /** Сколько ушло сверх отлитого — технологические потери. */
  spillMl: number;
}

/**
 * Списать отлитый объём и накопленные потери, записав это в журнал остатков.
 *
 * Потери идут отдельной строкой журнала: в сводке продаж должно остаться
 * ровно проданное, иначе отчёт по мл начнёт расходиться с выручкой.
 */
export async function writeOffStock(opts: {
  productId: number;
  /** Отлитый объём, мл. */
  ml: number;
  reason: string;
  refType: string;
  refId: number;
  /** Кто провёл операцию. null — списал факт оплаты, а не сотрудник. */
  userId: number | null;
  /** Процент потерь; берётся из настроек вызывающим кодом один раз на чек. */
  spillPercent: number;
}): Promise<WriteOffResult> {
  const before = await prisma.inventory.findUnique({
    where: { productId: opts.productId },
    select: { quantityMl: true, spillCarry: true },
  });
  const beforeMl = before?.quantityMl ?? 0;

  const spill = spillWriteOff(opts.ml, opts.spillPercent, before?.spillCarry ?? 0);

  const updated = await prisma.inventory.upsert({
    where: { productId: opts.productId },
    update: {
      quantityMl: { increment: -spill.deductMl },
      spillCarry: spill.carry,
    },
    create: {
      productId: opts.productId,
      quantityMl: -spill.deductMl,
      spillCarry: spill.carry,
    },
    select: { quantityMl: true },
  });

  await prisma.inventoryLog.create({
    data: {
      productId: opts.productId,
      deltaMl: -opts.ml,
      reason: opts.reason,
      refType: opts.refType,
      refId: opts.refId,
      userId: opts.userId,
    },
  });

  if (spill.spillMl > 0) {
    await prisma.inventoryLog.create({
      data: {
        productId: opts.productId,
        deltaMl: -spill.spillMl,
        reason: "spill",
        refType: opts.refType,
        refId: opts.refId,
        userId: opts.userId,
      },
    });
  }

  return { beforeMl, afterMl: updated.quantityMl, spillMl: spill.spillMl };
}

export { SPILL_PERCENT_SETTING };
