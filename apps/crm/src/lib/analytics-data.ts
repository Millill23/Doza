import { prisma } from "@doza/db";

const SOLD_REASONS = ["order_closed", "offline_sale"];

/** Топ товаров по проданным мл (из журнала остатков). */
export async function topByMl(limit = 10) {
  const grouped = await prisma.inventoryLog.groupBy({
    by: ["productId"],
    where: { reason: { in: SOLD_REASONS } },
    _sum: { deltaMl: true },
  });
  const rows = grouped
    .map((g) => ({ productId: g.productId, ml: -(g._sum.deltaMl ?? 0) }))
    .filter((r) => r.ml > 0)
    .sort((a, b) => b.ml - a.ml)
    .slice(0, limit);

  const products = await prisma.product.findMany({
    where: { id: { in: rows.map((r) => r.productId) } },
    include: { brand: true },
  });
  const pmap = new Map(products.map((p) => [p.id, p]));
  return rows.map((r) => ({
    ml: r.ml,
    name: pmap.get(r.productId)?.name ?? `#${r.productId}`,
    brand: pmap.get(r.productId)?.brand.name ?? "",
  }));
}

/** Топ товаров по выручке (закрытые заказы + закрытые оффлайн-продажи). */
export async function topByRevenue(limit = 10) {
  const [orderItems, saleItems] = await Promise.all([
    prisma.orderItem.findMany({
      where: { order: { status: "closed" } },
      include: { product: { include: { brand: true } } },
    }),
    prisma.offlineSaleItem.findMany({
      where: { sale: { status: "closed" } },
      include: { product: { include: { brand: true } } },
    }),
  ]);

  const map = new Map<number, { name: string; brand: string; revenue: number }>();
  const add = (
    pid: number,
    name: string,
    brand: string,
    rev: number,
  ) => {
    const cur = map.get(pid) ?? { name, brand, revenue: 0 };
    cur.revenue += rev;
    map.set(pid, cur);
  };
  for (const i of orderItems)
    add(i.productId, i.product.name, i.product.brand.name, Number(i.priceByn) * i.qty);
  for (const i of saleItems)
    add(i.productId, i.product.name, i.product.brand.name, Number(i.priceByn) * i.qty);

  return [...map.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

/** Топ клиентов по сумме покупок. */
export async function topCustomers(limit = 10) {
  const [orders, sales] = await Promise.all([
    prisma.order.groupBy({
      by: ["customerId"],
      where: { status: "closed", customerId: { not: null } },
      _sum: { totalByn: true },
    }),
    prisma.offlineSale.groupBy({
      by: ["customerId"],
      where: { status: "closed", customerId: { not: null } },
      _sum: { totalByn: true },
    }),
  ]);

  const map = new Map<number, number>();
  for (const o of orders)
    if (o.customerId)
      map.set(o.customerId, (map.get(o.customerId) ?? 0) + Number(o._sum.totalByn ?? 0));
  for (const s of sales)
    if (s.customerId)
      map.set(s.customerId, (map.get(s.customerId) ?? 0) + Number(s._sum.totalByn ?? 0));

  const top = [...map.entries()]
    .map(([customerId, sum]) => ({ customerId, sum }))
    .sort((a, b) => b.sum - a.sum)
    .slice(0, limit);

  const customers = await prisma.customer.findMany({
    where: { id: { in: top.map((t) => t.customerId) } },
  });
  const cmap = new Map(customers.map((c) => [c.id, c]));
  return top.map((t) => ({
    customerId: t.customerId,
    sum: t.sum,
    name: cmap.get(t.customerId)?.name ?? "",
    phone: cmap.get(t.customerId)?.phone ?? "",
  }));
}

/** Клиенты с памятными датами в ближайшие N дней (по дню и месяцу). */
export async function upcomingDates(days = 7) {
  const [dates, customers] = await Promise.all([
    prisma.customerDate.findMany({ include: { customer: true } }),
    prisma.customer.findMany({ where: { birthday: { not: null } } }),
  ]);

  const today = new Date();
  const within = (d: Date): number | null => {
    for (let i = 0; i <= days; i++) {
      const t = new Date(today);
      t.setDate(today.getDate() + i);
      if (t.getDate() === d.getDate() && t.getMonth() === d.getMonth()) return i;
    }
    return null;
  };

  const events: { name: string; phone: string; label: string; inDays: number; customerId: number }[] = [];
  for (const d of dates) {
    const inDays = within(d.date);
    if (inDays !== null)
      events.push({
        name: d.customer.name,
        phone: d.customer.phone,
        label: d.description,
        inDays,
        customerId: d.customerId,
      });
  }
  for (const c of customers) {
    if (!c.birthday) continue;
    const inDays = within(c.birthday);
    if (inDays !== null)
      events.push({
        name: c.name,
        phone: c.phone,
        label: "День рождения",
        inDays,
        customerId: c.id,
      });
  }
  return events.sort((a, b) => a.inDays - b.inDays);
}

/** Статистика баллов за период: начислено / списано / сгорело. */
export async function loyaltyStats(sinceDays = 30) {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const logs = await prisma.loyaltyLog.groupBy({
    by: ["opType"],
    where: { createdAt: { gte: since } },
    _sum: { deltaByn: true },
  });
  const get = (op: string) =>
    Math.abs(Number(logs.find((l) => l.opType === op)?._sum.deltaByn ?? 0));
  return {
    earned: get("earned"),
    spent: get("spent"),
    expired: get("expired"),
  };
}
