import { prisma } from "@doza/db";
import { formatByn } from "@doza/shared";
import { requireRole } from "@/lib/session";
import { SOLD_ORDER } from "@/lib/analytics-data";

export const dynamic = "force-dynamic";

/**
 * Продажи блогера по его промокодам.
 *
 * Показываем только время покупки и сумму. Ни имени покупателя, ни состава
 * чека здесь нет и быть не должно: это чужие персональные данные, а блогеру
 * для расчёта вознаграждения нужна выручка, а не клиентская база.
 *
 * Считаются и онлайн-заказы, и продажи в кассе: код можно назвать и там, и там.
 */

interface Row {
  at: Date;
  sum: number;
  where: "сайт" | "магазин";
}

function monthKey(d: Date): string {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
  });
}

export default async function MySalesPage() {
  const session = await requireRole(["influencer", "admin"]);
  const userId = Number(session.user.id);

  const codes = await prisma.promoCode.findMany({
    where: { influencerId: userId },
    select: { id: true, code: true, discountPercent: true, isActive: true, endsAt: true },
    orderBy: { code: "asc" },
  });
  const codeIds = codes.map((c) => c.id);

  const [orders, sales] = codeIds.length
    ? await Promise.all([
        prisma.order.findMany({
          where: { promoCodeId: { in: codeIds }, ...SOLD_ORDER },
          select: { createdAt: true, totalByn: true, deliveryFeeByn: true },
        }),
        prisma.offlineSale.findMany({
          where: { promoCodeId: { in: codeIds }, status: "closed" },
          select: { createdAt: true, totalByn: true },
        }),
      ])
    : [[], []];

  // Доставку из выручки вычитаем: это не проданный товар, а расход на почту,
  // и платить с него процент блогеру не за что.
  const rows: Row[] = [
    ...orders.map((o) => ({
      at: o.createdAt,
      sum: Number(o.totalByn),
      where: "сайт" as const,
    })),
    ...sales.map((s) => ({
      at: s.createdAt,
      sum: Number(s.totalByn),
      where: "магазин" as const,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const byMonth = new Map<string, Row[]>();
  for (const r of rows) {
    const k = monthKey(r.at);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k)!.push(r);
  }

  const total = rows.reduce((s, r) => s + r.sum, 0);

  return (
    <div>
      <h1 className="font-serif text-3xl text-ivory">Продажи</h1>
      <p className="mt-1 text-sm text-ivory-faint">
        Покупки, оформленные с вашим промокодом.
      </p>

      {codes.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-ink-600/60 bg-ink-700 p-8 text-center text-sm text-ivory-faint">
          За вами пока не закреплён промокод. Напишите нам — заведём.
        </p>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-3">
            {codes.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-ink-600/60 bg-ink-700 px-4 py-3"
              >
                <div className="font-mono text-lg text-gold-400">{c.code}</div>
                <div className="text-xs text-ivory-faint">
                  скидка {Number(c.discountPercent)}% ·{" "}
                  {c.isActive && new Date(c.endsAt) > new Date()
                    ? "действует до " + c.endsAt.toLocaleDateString("ru-RU")
                    : "не действует"}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-5">
              <div className="text-xs uppercase tracking-wide text-gold-500">
                Всего покупок
              </div>
              <div className="mt-1 font-serif text-3xl text-ivory">{rows.length}</div>
            </div>
            <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-5">
              <div className="text-xs uppercase tracking-wide text-gold-500">
                Общая сумма
              </div>
              <div className="mt-1 font-serif text-3xl text-gold-gradient">
                {formatByn(total)}
              </div>
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-ink-600/60 bg-ink-700 p-8 text-center text-sm text-ivory-faint">
              По вашему промокоду пока не покупали.
            </p>
          ) : (
            <div className="mt-6 space-y-6">
              {[...byMonth.entries()].map(([key, list]) => {
                const sum = list.reduce((s, r) => s + r.sum, 0);
                return (
                  <div
                    key={key}
                    className="overflow-hidden rounded-2xl border border-ink-600/60 bg-ink-700"
                  >
                    <div className="flex items-baseline justify-between border-b border-ink-600/40 bg-ink-800 px-5 py-3">
                      <span className="text-sm text-ivory">{monthLabel(key)}</span>
                      <span className="text-sm text-gold-400">
                        {list.length} · {formatByn(sum)}
                      </span>
                    </div>
                    <table className="w-full text-sm">
                      <tbody>
                        {list.map((r, i) => (
                          <tr key={i} className="border-t border-ink-600/30">
                            <td className="px-5 py-2.5 text-ivory-muted">
                              {r.at.toLocaleString("ru-RU", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="px-5 py-2.5 text-ivory-faint">{r.where}</td>
                            <td className="px-5 py-2.5 text-right text-gold-400">
                              {formatByn(r.sum)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
