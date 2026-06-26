import Link from "next/link";
import { prisma } from "@doza/db";
import { formatByn, formatPhone } from "@doza/shared";
import { topByMl, topByRevenue, topCustomers, upcomingDates } from "@/lib/analytics-data";

export const dynamic = "force-dynamic";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
      <h2 className="mb-4 font-serif text-xl text-ivory">{title}</h2>
      {children}
    </div>
  );
}

export default async function AnalyticsPage() {
  const [byMl, byRev, customers, dates, lowStock] = await Promise.all([
    topByMl(8),
    topByRevenue(8),
    topCustomers(8),
    upcomingDates(7),
    prisma.inventory.findMany({
      where: { quantityMl: { lt: 50 } },
      include: { product: { include: { brand: true } } },
      orderBy: { quantityMl: "asc" },
    }),
  ]);

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl text-ivory">Аналитика</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Топ по объёму продаж (мл)">
          {byMl.length === 0 ? (
            <p className="text-sm text-ivory-faint">Нет данных.</p>
          ) : (
            <ul className="space-y-2">
              {byMl.map((r, i) => (
                <li key={i} className="flex justify-between text-sm">
                  <span className="text-ivory">
                    <span className="text-ivory-faint">{r.brand}</span> {r.name}
                  </span>
                  <span className="text-gold-400">{r.ml} мл</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Топ по выручке">
          {byRev.length === 0 ? (
            <p className="text-sm text-ivory-faint">Нет данных.</p>
          ) : (
            <ul className="space-y-2">
              {byRev.map((r, i) => (
                <li key={i} className="flex justify-between text-sm">
                  <span className="text-ivory">
                    <span className="text-ivory-faint">{r.brand}</span> {r.name}
                  </span>
                  <span className="text-gold-400">{formatByn(r.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Активные покупатели">
          {customers.length === 0 ? (
            <p className="text-sm text-ivory-faint">Нет данных.</p>
          ) : (
            <ul className="space-y-2">
              {customers.map((c) => (
                <li key={c.customerId} className="flex justify-between text-sm">
                  <Link href={`/customers/${c.customerId}`} className="text-ivory hover:text-gold-400">
                    {c.name}
                  </Link>
                  <span className="text-gold-400">{formatByn(c.sum)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Памятные даты (7 дней)">
          {dates.length === 0 ? (
            <p className="text-sm text-ivory-faint">Ближайших дат нет.</p>
          ) : (
            <ul className="space-y-2">
              {dates.map((d, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <div>
                    <Link href={`/customers/${d.customerId}`} className="text-ivory hover:text-gold-400">
                      {d.name}
                    </Link>
                    <span className="ml-2 text-xs text-ivory-faint">{d.label}</span>
                  </div>
                  <span className="text-botanical-300">
                    {d.inDays === 0 ? "сегодня" : `через ${d.inDays} дн.`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <Card title="Критические остатки">
          {lowStock.length === 0 ? (
            <p className="text-sm text-ivory-faint">Все остатки в норме.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {lowStock.map((i) => (
                <div
                  key={i.productId}
                  className="flex justify-between rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm"
                >
                  <span className="text-ivory">
                    {i.product.brand.name} — {i.product.name}
                  </span>
                  <span className="text-red-300">{i.quantityMl} мл</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
