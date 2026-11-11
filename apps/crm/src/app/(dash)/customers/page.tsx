import Link from "next/link";
import { prisma } from "@doza/db";
import { formatByn, formatPhone } from "@doza/shared";
import { digitsOnly, toStoredPhone } from "@doza/shared/phone";
import { getBalancesMap } from "@/lib/customers-data";
import { getSession } from "@/lib/session";
import VipRegisterForm from "@/components/VipRegisterForm";
import {
  ConsentBulkButton,
  ConsentRequestButton,
} from "@/components/ConsentControls";
import { daysSinceRequest } from "@doza/db/consent-rules";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: { phone?: string; page?: string };
}) {
  const phone = typeof searchParams.phone === "string" ? searchParams.phone.trim() : "";
  const digits = digitsOnly(phone);
  const phoneFragment = /^80\d{9}$/.test(digits) ? toStoredPhone(digits) : digits;
  const where = phone
    ? { phone: phoneFragment ? { contains: phoneFragment } : "" }
    : undefined;
  const [total, session, pendingCount] = await Promise.all([
    prisma.customer.count({ where }),
    getSession(),
    prisma.customer.count({ where: { consentStatus: "pending" } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requestedPage = Number(searchParams.page);
  const page = Number.isSafeInteger(requestedPage)
    ? Math.min(pageCount, Math.max(1, requestedPage))
    : 1;
  const customers = await prisma.customer.findMany({
    where,
    orderBy: [{ registeredAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  const balances = await getBalancesMap(customers.map((customer) => customer.id));
  const isAdmin = session?.user?.role === "admin";
  const canBulk = isAdmin || session?.user?.role === "marketer";
  const pageHref = (number: number) => ({
    pathname: "/customers",
    query: { ...(phone ? { phone } : {}), page: number },
  });
  const pageLinkClass = "rounded-lg border border-ink-600 px-3 py-2 text-sm text-gold-400 hover:border-gold-500";

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="mb-1 font-serif text-3xl text-ivory">Клиенты</h1>
          <p className="text-sm text-ivory-faint">
            {phone ? "Найдено клиентов" : "Всего клиентов"}: {total}
            {pendingCount > 0 && (
              <span className="text-amber-300"> · {pendingCount} без согласия</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canBulk && <ConsentBulkButton pendingCount={pendingCount} />}
          {isAdmin && <VipRegisterForm />}
          <Link
            href="/customers/register"
            className="rounded-full bg-gold-gradient px-5 py-2.5 text-sm font-medium text-ink-900 transition-opacity hover:opacity-90"
          >
            + Зарегистрировать клиента
          </Link>
        </div>
      </div>

      <form action="/customers" className="mb-5 flex flex-wrap items-end gap-2">
        <label className="text-sm text-ivory-muted">
          Поиск по телефону
          <input
            key={phone}
            type="tel"
            name="phone"
            defaultValue={phone}
            placeholder="+375 (29) 123-45-67"
            className="mt-1 block rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-ivory"
          />
        </label>
        <button type="submit" className={pageLinkClass}>Найти</button>
        {phone && <Link href="/customers" className={pageLinkClass}>Сбросить</Link>}
      </form>

      {customers.length === 0 ? (
        <p className="rounded-xl border border-ink-600/60 bg-ink-700 p-10 text-center text-ivory-muted">
          {phone ? "Клиенты с таким номером не найдены." : "Клиентов пока нет."}
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
                <th className="px-4 py-3">Согласие</th>
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
                      : "–"}
                  </td>
                  <td className="px-4 py-3 text-xs text-ivory-faint">
                    {c.registeredAt.toLocaleDateString("ru-RU")}
                  </td>
                  <td className="px-4 py-3">
                    {c.consentStatus === "confirmed" ? (
                      <span
                        className="text-xs text-green-300"
                        title={
                          c.consentConfirmedAt
                            ? `Подтверждено ${c.consentConfirmedAt.toLocaleDateString("ru-RU")}`
                            : undefined
                        }
                      >
                        ✓ есть
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="whitespace-nowrap text-xs text-amber-300">
                          ⚠ нет
                          {c.consentRequestedAt && (
                            <span className="text-ivory-faint">
                              {" "}
                              · {daysSinceRequest(c)} дн.
                            </span>
                          )}
                        </span>
                        <ConsentRequestButton
                          customerId={c.id}
                          label={c.consentRequestedAt ? "Напомнить" : "Запросить"}
                          kind={c.consentRequestedAt ? "reminder" : "invite"}
                        />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pageCount > 1 && (
        <nav aria-label="Страницы списка клиентов" className="mt-4 flex flex-wrap items-center justify-end gap-3">
          <span className="text-sm text-ivory-muted">Страница {page} из {pageCount}</span>
          {page > 1 && <Link href={pageHref(page - 1)} className={pageLinkClass}>Назад</Link>}
          {page < pageCount && <Link href={pageHref(page + 1)} className={pageLinkClass}>Далее</Link>}
        </nav>
      )}
    </div>
  );
}
