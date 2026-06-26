import Link from "next/link";
import { prisma } from "@doza/db";
import { formatByn } from "@doza/shared";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  open: "Открыта",
  closed: "Закрыта",
  cancelled: "Отменена",
};
const STATUS_STYLE: Record<string, string> = {
  open: "border-gold-500/40 bg-gold-500/10 text-gold-300",
  closed: "border-green-500/40 bg-green-500/10 text-green-300",
  cancelled: "border-red-500/40 bg-red-500/10 text-red-300",
};

export default async function SalesPage() {
  await requireRole(["admin", "seller"]);

  const sales = await prisma.offlineSale.findMany({
    include: {
      items: true,
      seller: { select: { name: true } },
      customer: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="mb-1 font-serif text-3xl text-ivory">Оффлайн-продажи</h1>
          <p className="text-sm text-ivory-faint">Журнал продаж кассы</p>
        </div>
        <Link href="/cash" className="rounded-full bg-gold-gradient px-5 py-2.5 text-sm font-medium text-ink-900 hover:opacity-90">
          + Новая продажа
        </Link>
      </div>

      {sales.length === 0 ? (
        <p className="rounded-xl border border-ink-600/60 bg-ink-700 p-10 text-center text-ivory-muted">
          Продаж пока нет.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink-600/60">
          <table className="w-full text-sm">
            <thead className="bg-ink-800 text-left text-xs uppercase tracking-wide text-ivory-faint">
              <tr>
                <th className="px-4 py-3">№</th>
                <th className="px-4 py-3">Продавец</th>
                <th className="px-4 py-3">Клиент</th>
                <th className="px-4 py-3">Позиций</th>
                <th className="px-4 py-3">Сумма</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Дата</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id} className="border-t border-ink-600/40 bg-ink-700 hover:bg-ink-600/30">
                  <td className="px-4 py-3">
                    <Link href={`/cash/sales/${s.id}`} className="text-gold-400 hover:text-gold-300">
                      №{s.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ivory-muted">{s.seller.name}</td>
                  <td className="px-4 py-3 text-ivory-muted">{s.customer?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-ivory-muted">{s.items.length}</td>
                  <td className="px-4 py-3 text-gold-400">{formatByn(Number(s.totalByn))}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2.5 py-1 text-xs ${STATUS_STYLE[s.status]}`}>
                      {STATUS_LABEL[s.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-ivory-faint">
                    {s.createdAt.toLocaleDateString("ru-RU")}
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
