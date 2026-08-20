"use server";

import { prisma } from "@doza/db";
import { earnPoints } from "@doza/db/loyalty";
import { revokeSaleRedemptions } from "@doza/db/certificates";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";

async function getSetting(key: string, fallback: number): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s ? Number(s.value) : fallback;
}

/**
 * Отмена закрытой оффлайн-продажи с полным реверсом:
 *  - возврат остатков
 *  - обнуление начисленных за продажу баллов
 *  - возврат списанных за продажу баллов (новой партией)
 *  - запись в журнал offline_sale_edits
 */
export async function cancelOfflineSale(saleId: number, reason: string) {
  const session = await requireRole(["admin", "seller"]);
  const userId = Number(session.user.id);

  const sale = await prisma.offlineSale.findUnique({
    where: { id: saleId },
    include: { items: true },
  });
  if (!sale) throw new Error("Продажа не найдена");
  if (sale.status !== "closed") throw new Error("Можно отменить только закрытую продажу");

  const before = {
    status: sale.status,
    totalByn: Number(sale.totalByn),
    loyaltySpentByn: Number(sale.loyaltySpentByn),
    items: sale.items.map((i) => ({
      productId: i.productId,
      volumeMl: i.volumeMl,
      qty: i.qty,
      priceByn: Number(i.priceByn),
    })),
  };

  /** Сколько вернулось на сертификат — попадёт в журнал изменений. */
  let certReturned = 0;

  await prisma.$transaction(async (tx) => {
    // 1. Возврат остатков
    for (const item of sale.items) {
      const delta = item.volumeMl * item.qty;
      await tx.inventory.upsert({
        where: { productId: item.productId },
        update: { quantityMl: { increment: delta } },
        create: { productId: item.productId, quantityMl: delta },
      });
      await tx.inventoryLog.create({
        data: {
          productId: item.productId,
          deltaMl: delta,
          reason: "offline_sale_cancel",
          refType: "offline_sale",
          refId: sale.id,
          userId,
        },
      });
    }

    if (sale.customerId) {
      // 2. Обнуление начисленных за продажу баллов
      const earnedBatches = await tx.loyaltyBatch.findMany({
        where: { refType: "offline_sale", refId: sale.id, amountByn: { gt: 0 } },
      });
      for (const b of earnedBatches) {
        await tx.loyaltyLog.create({
          data: {
            customerId: sale.customerId,
            batchId: b.id,
            deltaByn: -Number(b.amountByn),
            opType: "expired",
            refType: "offline_sale_cancel",
            refId: sale.id,
          },
        });
        await tx.loyaltyBatch.update({ where: { id: b.id }, data: { amountByn: 0 } });
      }

      // 3. Возврат списанных за продажу баллов
      const spent = Number(sale.loyaltySpentByn);
      if (spent > 0) {
        const days = await getSetting("loyalty_days", 180);
        const expiresAt =
          days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;
        const batch = await tx.loyaltyBatch.create({
          data: {
            customerId: sale.customerId,
            amountByn: spent,
            expiresAt,
            refType: "offline_sale_refund",
            refId: sale.id,
          },
        });
        await tx.loyaltyLog.create({
          data: {
            customerId: sale.customerId,
            batchId: batch.id,
            deltaByn: spent,
            opType: "earned",
            refType: "offline_sale_refund",
            refId: sale.id,
          },
        });
      }
    }

    // 4. Возврат разовой скидки по памятной дате: продажи не было — значит и
    // скидка не потрачена. Срок при этом не продлевается, окно то же.
    await tx.dateReward.updateMany({
      where: { usedSaleId: sale.id },
      data: { usedAt: null, usedSaleId: null },
    });

    // 5. Возврат оплаты сертификатом — тоже без продления срока.
    certReturned = await revokeSaleRedemptions(sale.id, tx);

    // 6. Статус + журнал
    await tx.offlineSale.update({
      where: { id: sale.id },
      data: { status: "cancelled" },
    });
    await tx.offlineSaleEdit.create({
      data: {
        saleId: sale.id,
        userId,
        changeDescription:
          `Отмена продажи: ${reason || "без указания причины"}` +
          (certReturned > 0
            ? ` · возвращено на сертификат ${certReturned.toFixed(2)} BYN`
            : ""),
        beforeJson: before,
        afterJson: { status: "cancelled" },
      },
    });
  });

  revalidatePath(`/cash/sales/${saleId}`);
  revalidatePath("/cash/sales");
  revalidatePath("/certificates");
  return { certReturned };
}
