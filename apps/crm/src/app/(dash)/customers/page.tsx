import Link from "next/link";
import { prisma } from "@doza/db";
import { formatByn, formatPhone } from "@doza/shared";
import { getBalancesMap } from "@/lib/customers-data";
import { getSession } from "@/lib/session";
import VipRegisterForm from "@/components/VipRegisterForm";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const [customers, balances, session] = await Promise.all([
    prisma.customer.findMany({ orderBy: { registeredAt: "desc" }, take: 200 }),
    getBalancesMap(),
    getSession(),
  ]);
  const isAdmin = session?.user?.role === "admin";

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="mb-1 font-serif text-3xl text-ivory">Клиенты</h1>
          <p className="text-sm text-ivory-faint">{customers.length} клиентов</p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && <VipRegisterForm />}
          <Link
            href="/customers/register"
            className="rounded-full bg-gold-gradient px-5 py-2.5 text-sm font-medium text-ink-900 transition-opacity hover:opacity-90"
          >
            + Зарегистрировать клиента
          </Link>
        </div>
      </div>

      {customers.length === 0 ? (
        <p className="rounded-xl border border-ink-600/60 bg-ink-700 p-10 text-center text-ivory-muted">
          Клиентов пока нет.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink-600/60">
          <table className="w-full text-sm">
            <thead className="bg-ink-800 text-left text-xs uppercase tracking-wide text-ivory-faint">
              <tr>
                <th className="px-4 py-3">Имя</th>
                <th className="px-4 py-3">Телефон</th>
                <th className="px-4 py-3">Баллы</th>
                <th className="px-4 py-3">Последняя покупка</th>
                <th className="px-4 py-3">Регистрация</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-t border-ink-600/40 bg-ink-700 hover:bg-ink-600/30">
                  <td className="px-4 py-3">
                    <Link href={`/customers/${c.id}`} className="text-gold-400 hover:text-gold-300">
                      {c.name}
                    </Link>
                    {c.vipCardNumber && (
                      <span className="ml-2 rounded-full bg-gold-gradient px-1.5 py-0.5 text-[10px] font-semibold text-ink-900">
                        ⭐ VIP
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ivory-muted">{formatPhone(c.phone)}</td>
                  <td className="px-4 py-3 text-botanical-300">
                    {formatByn(balances.get(c.id) ?? 0)}
                  </td>
                  <td className="px-4 py-3 text-xs text-ivory-faint">
                    {c.lastPurchaseAt
                      ? `${c.lastPurchaseAt.toLocaleDateString("ru-RU")} · ${formatByn(Number(c.lastPurchaseSum ?? 0))}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-ivory-faint">
                    {c.registeredAt.toLocaleDateString("ru-RU")}
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
