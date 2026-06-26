import { prisma } from "@doza/db";

/** Карта customerId → текущий баланс баллов (непросроченные партии). */
export async function getBalancesMap(): Promise<Map<number, number>> {
  const now = new Date();
  const grouped = await prisma.loyaltyBatch.groupBy({
    by: ["customerId"],
    where: {
      amountByn: { gt: 0 },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    _sum: { amountByn: true },
  });
  const map = new Map<number, number>();
  for (const g of grouped) {
    map.set(g.customerId, Number(g._sum.amountByn ?? 0));
  }
  return map;
}
