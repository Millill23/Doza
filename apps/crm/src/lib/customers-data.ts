import { prisma } from "@doza/db";

/** Карта customerId → текущий баланс баллов (непросроченные партии). */
export async function getBalancesMap(customerIds: number[]): Promise<Map<number, number>> {
  if (customerIds.length === 0) return new Map();
  const now = new Date();
  const grouped = await prisma.loyaltyBatch.groupBy({
    by: ["customerId"],
    where: {
      customerId: { in: customerIds },
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
