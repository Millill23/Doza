import { prisma } from "@doza/db";
import { formatByn, formatPhone } from "@doza/shared";
import { loyaltyStats } from "@/lib/analytics-data";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LoyaltyPage() {
  await requireRole(["admin", "marketer"]);
  const now = new Date();
  const soon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const [stats, expiringSoon] = await Promise.all([
    loyaltyStats(30),
    prisma.loyaltyBatch.findMany({
      where: { amountByn: { gt: 0 }, expiresAt: { gt: now, lt: soon } },
      include: { customer: true },
      orderBy: { expiresAt: "asc" },
      take: 20,
    }),
  ]);

  return (
    <div>
      <h1 className="mb-1 font-serif text-3xl text-ivory">Лояльность</h1>
      <p className="mb-6 text-sm text-ivory-faint">Статистика баллов за 30 дней</p>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
          <p className="mb-2 text-xs uppercase tracking-wide text-ivory-faint">Начислено</p>
          <p className="font-serif text-3xl text-botanical-300">{formatByn(stats.earned)}</p>
        </div>
        <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
          <p className="mb-2 text-xs uppercase tracking-wide text-ivory-faint">Списано</p>
          <p className="font-serif text-3xl text-gold-gradient">{formatByn(stats.spent)}</p>
        </div>
        <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
          <p className="mb-2 text-xs uppercase tracking-wide text-ivory-faint">Сгорело</p>
          <p className="font-serif text-3xl text-red-300">{formatByn(stats.expired)}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
        <h2 className="mb-4 font-serif text-xl text-ivory">Сгорают в ближайшие 30 дней</h2>
        {expiringSoon.length === 0 ? (
          <p className="text-sm text-ivory-faint">Нет партий с близким сроком сгорания.</p>
        ) : (
          <ul className="divide-y divide-ink-600/40">
            {expiringSoon.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-3 text-sm">
                <span className="text-ivory">
                  {b.customer.name}{" "}
                  <span className="text-ivory-faint">{formatPhone(b.customer.phone)}</span>
                </span>
                <span className="flex items-center gap-4">
                  <span className="text-botanical-300">{formatByn(Number(b.amountByn))}</span>
                  <span className="text-red-300">
                    {b.expiresAt?.toLocaleDateString("ru-RU")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
