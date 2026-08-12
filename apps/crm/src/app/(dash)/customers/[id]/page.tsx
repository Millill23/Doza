import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@doza/db";
import { getBalance } from "@doza/db/loyalty";
import { formatByn, formatPhone } from "@doza/shared";
import CustomerDates from "@/components/CustomerDates";
import VipManager from "@/components/VipManager";
import CustomerEdit from "@/components/CustomerEdit";
import ConsentPanel from "@/components/ConsentPanel";
import CustomerDelete from "@/components/CustomerDelete";
import { isConsentOverdue, CONSENT_TTL_DAYS } from "@doza/db/consent-rules";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function ymd(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export default async function CustomerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      dates: { orderBy: { date: "asc" } },
      orders: { orderBy: { createdAt: "desc" } },
      offlineSales: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!customer) notFound();

  const session = await getSession();
  const isAdmin = session?.user?.role === "admin";
  const now = new Date();
  const [balance, batches] = await Promise.all([
    getBalance(customer.id),
    prisma.loyaltyBatch.findMany({
      where: { customerId: id, amountByn: { gt: 0 } },
      orderBy: { expiresAt: "asc" },
    }),
  ]);

  // История покупок (онлайн + оффлайн), отсортированная по дате
  const history = [
    ...customer.orders.map((o) => ({
      kind: "Онлайн-заказ",
      id: o.id,
      date: o.createdAt,
      sum: Number(o.totalByn),
      status: o.status,
      href: `/orders/${o.id}`,
    })),
    ...customer.offlineSales.map((s) => ({
      kind: "Оффлайн-продажа",
      id: s.id,
      date: s.createdAt,
      sum: Number(s.totalByn),
      status: s.status,
      href: null,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div>
      <Link href="/customers" className="mb-6 inline-block text-sm text-ivory-faint hover:text-gold-400">
        ← К списку клиентов
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <h1 className="font-serif text-3xl text-ivory">{customer.name}</h1>
        <span className="text-ivory-muted">{formatPhone(customer.phone)}</span>
        <span className="rounded-full border border-botanical-500/40 bg-botanical-700/20 px-3 py-1 text-sm text-botanical-300">
          Баланс: {formatByn(balance)}
        </span>
        {customer.vipCardNumber && (
          <span className="rounded-full bg-gold-gradient px-3 py-1 text-sm font-semibold text-ink-900">
            ⭐ VIP №{customer.vipCardNumber}
          </span>
        )}
      </div>

      {isAdmin && (
        <div className="mb-6">
          <CustomerEdit
            customerId={customer.id}
            name={customer.name}
            phone={customer.phone}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {/* Партии баллов */}
          <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
            <h2 className="mb-4 font-serif text-xl text-ivory">Баллы по партиям</h2>
            {batches.length === 0 ? (
              <p className="text-sm text-ivory-faint">Нет активных баллов.</p>
            ) : (
              <ul className="space-y-2">
                {batches.map((b) => {
                  const expired = b.expiresAt && b.expiresAt < now;
                  return (
                    <li
                      key={b.id}
                      className="flex items-center justify-between rounded-lg border border-ink-600/60 bg-ink-800 px-3 py-2 text-sm"
                    >
                      <span className="text-ivory">{formatByn(Number(b.amountByn))}</span>
                      <span className={expired ? "text-red-300" : "text-ivory-faint"}>
                        {b.expiresAt
                          ? `сгорает ${b.expiresAt.toLocaleDateString("ru-RU")}`
                          : "бессрочно"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* История покупок */}
          <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
            <h2 className="mb-4 font-serif text-xl text-ivory">История покупок</h2>
            {history.length === 0 ? (
              <p className="text-sm text-ivory-faint">Покупок пока нет.</p>
            ) : (
              <ul className="divide-y divide-ink-600/40">
                {history.map((h) => (
                  <li key={`${h.kind}-${h.id}`} className="flex items-center justify-between py-3 text-sm">
                    <div>
                      <span className="text-ivory">{h.kind} </span>
                      {h.href ? (
                        <Link href={h.href} className="text-gold-400 hover:text-gold-300">#{h.id}</Link>
                      ) : (
                        <span className="text-ivory-muted">№{h.id}</span>
                      )}
                      <span className="ml-2 text-xs text-ivory-faint">
                        {h.date.toLocaleDateString("ru-RU")}
                      </span>
                    </div>
                    <span className="text-gold-400">{formatByn(h.sum)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Согласие + даты + VIP */}
        <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6 lg:sticky lg:top-8 lg:self-start">
          <div className="mb-6">
            <h2 className="mb-3 font-serif text-xl text-ivory">
              Персональные данные
            </h2>
            <ConsentPanel
              customerId={customer.id}
              status={customer.consentStatus}
              requestedAt={customer.consentRequestedAt?.toISOString() ?? null}
              confirmedAt={customer.consentConfirmedAt?.toISOString() ?? null}
              overdue={isConsentOverdue(customer)}
              ttlDays={CONSENT_TTL_DAYS}
            />
          </div>
          {isAdmin && (
            <div className="mb-6">
              <h2 className="mb-3 font-serif text-xl text-ivory">VIP-карта</h2>
              <VipManager customerId={customer.id} card={customer.vipCardNumber} />
            </div>
          )}
          <h2 className="mb-4 font-serif text-xl text-ivory">Памятные даты</h2>
          <CustomerDates
            customerId={customer.id}
            birthday={ymd(customer.birthday)}
            dates={customer.dates.map((d) => ({
              id: d.id,
              date: d.date.toISOString(),
              description: d.description,
            }))}
          />

          {isAdmin && (
            <div className="mt-6 border-t border-ink-600/60 pt-4">
              <CustomerDelete
                customerId={customer.id}
                name={customer.name}
                balance={balance}
                purchases={history.length}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
