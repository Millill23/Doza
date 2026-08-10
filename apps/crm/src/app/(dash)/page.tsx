import { prisma } from "@doza/db";
import { formatByn } from "@doza/shared";
import { getSession } from "@/lib/session";
import { myMonthSales, monthSalesBySeller } from "@/lib/analytics-data";

export const dynamic = "force-dynamic";

async function getStats() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Выручка = онлайн-заказы + оффлайн-продажи. Раньше считались только заказы,
  // из-за чего дашборд показывал 0 BYN, пока трекер продавцов ниже на той же
  // странице показывал реальные продажи из кассы. Отменённые продажи и
  // невыкупленные заказы отсекаются фильтром по статусу.
  const [closedOrders, closedSales, newOrders, lowStock, customersCount] =
    await Promise.all([
      prisma.order.findMany({
        where: { status: "closed", updatedAt: { gte: since } },
        select: { totalByn: true },
      }),
      prisma.offlineSale.findMany({
        where: { status: "closed", closedAt: { gte: since } },
        select: { totalByn: true },
      }),
      prisma.order.count({ where: { status: "new" } }),
      prisma.inventory.findMany({
        where: { quantityMl: { lt: 50 } },
        include: { product: { select: { name: true, brand: { select: { name: true } } } } },
        orderBy: { quantityMl: "asc" },
        take: 8,
      }),
      prisma.customer.count(),
    ]);

  const sum = (rows: { totalByn: unknown }[]) =>
    rows.reduce((s, r) => s + Number(r.totalByn), 0);

  const onlineRevenue = sum(closedOrders);
  const offlineRevenue = sum(closedSales);
  const revenue = onlineRevenue + offlineRevenue;
  const closedCount = closedOrders.length + closedSales.length;

  return {
    revenue,
    onlineRevenue,
    offlineRevenue,
    avgCheck: closedCount ? revenue / closedCount : 0,
    closedCount,
    newOrders,
    lowStock,
    customersCount,
  };
}

function Kpi({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
      <p className="mb-2 text-xs uppercase tracking-wide text-ivory-faint">{label}</p>
      <p className={`font-serif text-3xl ${accent ? "text-gold-gradient" : "text-ivory"}`}>
        {value}
      </p>
      {hint && <p className="mt-2 text-xs text-ivory-faint">{hint}</p>}
    </div>
  );
}

export default async function DashboardPage() {
  const session = await getSession();
  const userId = Number(session?.user?.id);
  const isAdmin = session?.user?.role === "admin";
  const monthLabel = new Date().toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
  });

  const [s, mine, bySeller] = await Promise.all([
    getStats(),
    userId ? myMonthSales(userId) : Promise.resolve({ sum: 0, count: 0 }),
    isAdmin ? monthSalesBySeller() : Promise.resolve([]),
  ]);

  return (
    <div>
      <h1 className="mb-1 font-serif text-3xl text-ivory">Дашборд</h1>
      <p className="mb-8 text-sm text-ivory-faint">Сводка за последние 30 дней</p>

      {/* Мои продажи за месяц (мотивация продавца) */}
      <div className="mb-8 rounded-2xl border border-gold-600/30 bg-gradient-to-br from-ink-700 to-ink-800 p-6">
        <p className="mb-1 text-xs uppercase tracking-wide text-gold-500">
          Мои продажи · {monthLabel}
        </p>
        <div className="flex flex-wrap items-end gap-8">
          <div>
            <p className="font-serif text-4xl text-gold-gradient">
              {formatByn(mine.sum)}
            </p>
            <p className="mt-1 text-sm text-ivory-faint">оборот за месяц</p>
          </div>
          <div>
            <p className="font-serif text-4xl text-ivory">{mine.count}</p>
            <p className="mt-1 text-sm text-ivory-faint">продаж</p>
          </div>
        </div>
      </div>

      {isAdmin && bySeller.length > 0 && (
        <div className="mb-8 rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
          <h2 className="mb-4 font-serif text-xl text-ivory">
            Продажи по продавцам · {monthLabel}
          </h2>
          <ul className="space-y-2">
            {bySeller.map((r) => (
              <li
                key={r.sellerId}
                className="flex items-center justify-between rounded-lg border border-ink-600/60 px-3 py-2 text-sm"
              >
                <span className="text-ivory">
                  {r.name} <span className="text-ivory-faint">· {r.count} прод.</span>
                </span>
                <span className="font-medium text-gold-400">{formatByn(r.sum)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Выручка (закрытые)"
          value={formatByn(s.revenue)}
          hint={`касса ${formatByn(s.offlineRevenue)} · сайт ${formatByn(s.onlineRevenue)}`}
          accent
        />
        <Kpi label="Средний чек" value={formatByn(s.avgCheck)} />
        <Kpi
          label="Закрытых чеков"
          value={String(s.closedCount)}
          hint="касса + сайт"
        />
        <Kpi label="Новых заказов" value={String(s.newOrders)} hint="с сайта" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
          <h2 className="mb-4 font-serif text-xl text-ivory">Критические остатки</h2>
          {s.lowStock.length === 0 ? (
            <p className="text-sm text-ivory-faint">Все остатки в норме.</p>
          ) : (
            <ul className="space-y-2">
              {s.lowStock.map((i) => (
                <li
                  key={i.productId}
                  className="flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm"
                >
                  <span className="text-ivory">
                    {i.product.brand.name} — {i.product.name}
                  </span>
                  <span className="font-medium text-red-300">{i.quantityMl} мл</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
          <h2 className="mb-4 font-serif text-xl text-ivory">Клиентская база</h2>
          <p className="font-serif text-4xl text-gold-gradient">{s.customersCount}</p>
          <p className="mt-1 text-sm text-ivory-faint">зарегистрировано клиентов</p>
        </div>
      </div>
    </div>
  );
}
