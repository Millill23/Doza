import Link from "next/link";
import { prisma } from "@doza/db";
import { formatByn, formatPhone } from "@doza/shared";
import { ORDER_STATUS_LABEL, ORDER_STATUS_STYLE, DELIVERY_LABEL } from "@/lib/labels";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUSES = ["all", "new", "confirmed", "shipped", "closed", "rejected", "returned"];

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  await requireRole(["admin", "seller"]);
  const status = searchParams.status ?? "all";
  const where = status !== "all" ? { status: status as never } : {};

  const orders = await prisma.order.findMany({
    where,
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <h1 className="mb-1 font-serif text-3xl text-ivory">Заказы</h1>
      <p className="mb-6 text-sm text-ivory-faint">Онлайн-заказы с сайта</p>

      {/* Фильтр по статусу */}
      <div className="mb-6 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={s === "all" ? "/orders" : `/orders?status=${s}`}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
              status === s
                ? "border-gold-500 bg-gold-500/10 text-gold-300"
                : "border-ink-600 text-ivory-muted hover:border-gold-600/60"
            }`}
          >
            {s === "all" ? "Все" : ORDER_STATUS_LABEL[s]}
          </Link>
        ))}
      </div>

      {orders.length === 0 ? (
        <p className="rounded-xl border border-ink-600/60 bg-ink-700 p-10 text-center text-ivory-muted">
          Заказов нет.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink-600/60">
          <table className="w-full text-sm">
            <thead className="bg-ink-800 text-left text-xs uppercase tracking-wide text-ivory-faint">
              <tr>
                <th className="px-4 py-3">№</th>
                <th className="px-4 py-3">Клиент</th>
                <th className="px-4 py-3">Получение</th>
                <th className="px-4 py-3">Позиций</th>
                <th className="px-4 py-3">Сумма</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Дата</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr
                  key={o.id}
                  className="border-t border-ink-600/40 bg-ink-700 transition-colors hover:bg-ink-600/30"
                >
                  <td className="px-4 py-3">
                    <Link href={`/orders/${o.id}`} className="text-gold-400 hover:text-gold-300">
                      #{o.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-ivory">{o.customerName}</div>
                    <div className="text-xs text-ivory-faint">{formatPhone(o.customerPhone)}</div>
                  </td>
                  <td className="px-4 py-3 text-ivory-muted">{DELIVERY_LABEL[o.deliveryType]}</td>
                  <td className="px-4 py-3 text-ivory-muted">{o.items.length}</td>
                  <td className="px-4 py-3 text-gold-400">{formatByn(Number(o.totalByn))}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2.5 py-1 text-xs ${ORDER_STATUS_STYLE[o.status]}`}>
                      {ORDER_STATUS_LABEL[o.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-ivory-faint">
                    {o.createdAt.toLocaleDateString("ru-RU")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
