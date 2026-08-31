import { prisma } from "@doza/db";
import { applySalesSplits, type SplitRule } from "@doza/db/sales-split";


/** Календарный день продажи (YYYY-MM-DD) — по нему заданы разделения выручки. */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Правила разделения выручки начиная с даты. */
async function splitRules(since: Date): Promise<SplitRule[]> {
  const splits = await prisma.salesSplit.findMany({
    where: { date: { gte: since } },
    include: { shares: { select: { sellerId: true, percent: true } } },
  });
  return splits.map((s) => ({
    // date хранится как DATE (без времени) — берём календарный день как есть
    day: s.date.toISOString().slice(0, 10),
    sourceSellerId: s.sourceSellerId,
    shares: s.shares.map((x) => ({
      sellerId: x.sellerId,
      percent: Number(x.percent),
    })),
  }));
}

/** Топ товаров по проданным мл (из журнала остатков). */
/** Период выборки. Пустой объект = за всё время. */
export interface Period {
  from?: Date;
  to?: Date;
}

/** Условие по дате для Prisma (undefined, если период не ограничен). */
function dateFilter(p: Period) {
  if (!p.from && !p.to) return undefined;
  return { ...(p.from ? { gte: p.from } : {}), ...(p.to ? { lte: p.to } : {}) };
}

/**
 * Состоявшийся онлайн-заказ — то, что считается выручкой.
 *
 * Магазин работает по стопроцентной предоплате, поэтому продажа признаётся по
 * факту оплаты, а не по доезду посылки: заказ может неделю ехать почтой, но
 * деньги получены сразу. Возврат переводит заказ в `refunded`, и он из выборки
 * выпадает сам.
 *
 * Второе условие — про заказы времён оплаты при получении: через шлюз они не
 * проходили и `paid` у них не будет никогда, а выручку за них терять нельзя.
 */
export const SOLD_ORDER = {
  OR: [{ paymentStatus: "paid" as const }, { status: "closed" as const }],
};

/**
 * Проданные мл по товарам за период.
 *
 * Считаем по позициям ЗАКРЫТЫХ заказов и продаж, а не по журналу остатков.
 * Журнал для этого не годится: при отмене продажи компенсирующая запись имеет
 * причину `offline_sale_cancel`, которая в выборку не попадала, — отменённый
 * чек продолжал считаться проданным. А заказ, закрытый и затем возвращённый,
 * вообще не откатывает остатки. В обоих случаях объём расходился с выручкой,
 * которая берётся именно из позиций. Теперь у обеих метрик один источник.
 */
async function soldMlByProduct(period: Period): Promise<Map<number, number>> {
  const createdAt = dateFilter(period);
  const [orderItems, saleItems] = await Promise.all([
    prisma.orderItem.findMany({
      where: { order: { ...SOLD_ORDER, ...(createdAt ? { createdAt } : {}) } },
      select: { productId: true, volumeMl: true, qty: true },
    }),
    prisma.offlineSaleItem.findMany({
      where: { sale: { status: "closed", ...(createdAt ? { createdAt } : {}) } },
      select: { productId: true, volumeMl: true, qty: true },
    }),
  ]);

  const ml = new Map<number, number>();
  for (const i of [...orderItems, ...saleItems]) {
    ml.set(i.productId, (ml.get(i.productId) ?? 0) + i.volumeMl * i.qty);
  }
  return ml;
}

export async function topByMl(limit = 10, period: Period = {}) {
  const ml = await soldMlByProduct(period);
  const rows = [...ml.entries()]
    .map(([productId, value]) => ({ productId, ml: value }))
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

/**
 * Аутсайдеры: товары с наименьшими продажами за период.
 *
 * Считаем от полного каталога, а не от журнала продаж: товары, которые вообще
 * не продавались, в журнале отсутствуют — а именно они главные кандидаты на
 * скидку. Архивные не показываем: их и так сняли с витрины.
 */
export async function bottomByMl(limit = 10, period: Period = {}) {
  const [products, sold] = await Promise.all([
    prisma.product.findMany({
      where: { isArchived: false },
      select: { id: true, name: true, brand: { select: { name: true } } },
    }),
    soldMlByProduct(period),
  ]);

  return products
    .map((p) => ({
      ml: sold.get(p.id) ?? 0,
      name: p.name,
      brand: p.brand.name,
    }))
    .sort((a, b) => a.ml - b.ml || a.brand.localeCompare(b.brand, "ru"))
    .slice(0, limit);
}

/** Топ товаров по выручке (закрытые заказы + закрытые оффлайн-продажи). */
export async function topByRevenue(limit = 10, period: Period = {}) {
  const createdAt = dateFilter(period);
  const [orderItems, saleItems] = await Promise.all([
    prisma.orderItem.findMany({
      where: {
        order: { ...SOLD_ORDER, ...(createdAt ? { createdAt } : {}) },
      },
      include: { product: { include: { brand: true } } },
    }),
    prisma.offlineSaleItem.findMany({
      where: {
        sale: { status: "closed", ...(createdAt ? { createdAt } : {}) },
      },
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
export async function topCustomers(limit = 10, period: Period = {}) {
  const createdAt = dateFilter(period);
  const [orders, sales] = await Promise.all([
    prisma.order.groupBy({
      by: ["customerId"],
      where: {
        ...SOLD_ORDER,
        customerId: { not: null },
        ...(createdAt ? { createdAt } : {}),
      },
      _sum: { totalByn: true },
    }),
    prisma.offlineSale.groupBy({
      by: ["customerId"],
      where: {
        status: "closed",
        customerId: { not: null },
        ...(createdAt ? { createdAt } : {}),
      },
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

function monthStart(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * Продажи всех продавцов за текущий месяц с учётом разделения выручки.
 * Если на день задано разделение, сумма аккаунта расходится по долям.
 */
async function monthTotalsBySeller() {
  const since = monthStart();
  const [sales, certificates, rules] = await Promise.all([
    prisma.offlineSale.findMany({
      where: { status: "closed", createdAt: { gte: since } },
      select: { sellerId: true, createdAt: true, totalByn: true },
    }),
    // Проданные сертификаты. Деньги за них легли в кассу в день продажи, и
    // засчитывать их только при погашении — значит не платить тому, кто
    // продал, и заплатить тому, кто просто отпустил товар через три месяца.
    // Купленные на сайте сюда не попадают: у них нет продавца.
    prisma.giftCertificate.findMany({
      where: { issuedAt: { gte: since }, issuedById: { not: null } },
      select: { issuedById: true, issuedAt: true, paidByn: true },
    }),
    splitRules(since),
  ]);

  // Погашение сертификата позже попадёт в сумму ещё раз, уже как обычный чек.
  // Это осознанно: правило простое и в пользу продавца, а разбираться, чей
  // сертификат гасят, продавцу за прилавком некогда.
  return applySalesSplits(
    [
      ...sales.map((s) => ({
        sellerId: s.sellerId,
        day: dayKey(s.createdAt),
        totalByn: Number(s.totalByn),
      })),
      ...certificates.map((c) => ({
        sellerId: c.issuedById!,
        day: dayKey(c.issuedAt),
        // Считаем уплаченное, а не номинал: VIP берёт сертификат со скидкой,
        // и в кассу легло именно столько.
        totalByn: Number(c.paidByn),
      })),
    ],
    rules,
  );
}

/** Продажи продавца за текущий месяц (сумма + количество закрытых оффлайн-продаж). */
export async function myMonthSales(sellerId: number) {
  const totals = await monthTotalsBySeller();
  const mine = totals.find((t) => t.sellerId === sellerId);
  return { sum: mine?.sum ?? 0, count: mine?.count ?? 0 };
}

/** Продажи всех продавцов за текущий месяц (для админа). */
export async function monthSalesBySeller() {
  const totals = await monthTotalsBySeller();
  const users = await prisma.crmUser.findMany({
    where: { id: { in: totals.map((t) => t.sellerId) } },
    select: { id: true, name: true },
  });
  const umap = new Map(users.map((u) => [u.id, u.name]));
  return totals.map((t) => ({
    sellerId: t.sellerId,
    name: umap.get(t.sellerId) ?? `#${t.sellerId}`,
    sum: t.sum,
    count: t.count,
  }));
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
