import { prisma } from "@doza/db";
import { requireRole } from "@/lib/session";
import PromoForm from "@/components/PromoForm";
import PromoDelete from "@/components/PromoDelete";

export const dynamic = "force-dynamic";

function fmt(d: Date | null): string {
  if (!d) return "—";
  // Акции задаются по дням, часы не показываем.
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export default async function PromosPage() {
  await requireRole(["admin"]);

  const [products, promos] = await Promise.all([
    prisma.product.findMany({
      where: { isArchived: false },
      include: { brand: { select: { name: true } } },
      orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.promo.findMany({
      include: { product: { include: { brand: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const opts = products.map((p) => ({
    id: p.id,
    label: `${p.brand.name} — ${p.name}`,
  }));

  const now = new Date();
  const status = (p: (typeof promos)[number]) => {
    if (p.endsAt && p.endsAt < now)
      return { label: "Завершена", cls: "text-ivory-faint" };
    if (p.startsAt && p.startsAt > now)
      return { label: "Запланирована", cls: "text-botanical-300" };
    return { label: "Активна", cls: "text-green-300" };
  };

  return (
    <div>
      <h1 className="mb-1 font-serif text-3xl text-ivory">Акции</h1>
      <p className="mb-8 text-sm text-ivory-faint">
        Скидки и повышенный кешбек на товары с периодом действия. За день до
        окончания продавцам придёт напоминание в Telegram.
      </p>

      <div className="mb-8">
        <PromoForm products={opts} />
      </div>

      {promos.length === 0 ? (
        <p className="rounded-xl border border-ink-600/60 bg-ink-700 p-10 text-center text-ivory-muted">
          Акций пока нет.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink-600/60">
          <table className="w-full text-sm">
            <thead className="bg-ink-800 text-left text-xs uppercase tracking-wide text-ivory-faint">
              <tr>
                <th className="px-4 py-3">Товар</th>
                <th className="px-4 py-3">Скидка</th>
                <th className="px-4 py-3">Кешбек</th>
                <th className="px-4 py-3">Период</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => {
                const st = status(p);
                return (
                  <tr
                    key={p.id}
                    className="border-t border-ink-600/40 bg-ink-700"
                  >
                    <td className="px-4 py-3 text-ivory">
                      {p.product ? (
                        `${p.product.brand.name} — ${p.product.name}`
                      ) : (
                        <span className="text-gold-400">Все товары</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-botanical-300">
                      {p.discountPercent ? `−${Number(p.discountPercent)}%` : "—"}
                    </td>
                    <td className="px-4 py-3 text-gold-400">
                      {p.cashbackPercent ? `${Number(p.cashbackPercent)}%` : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-ivory-faint">
                      {fmt(p.startsAt)} → {fmt(p.endsAt)}
                    </td>
                    <td className={`px-4 py-3 text-xs ${st.cls}`}>{st.label}</td>
                    <td className="px-4 py-3 text-right">
                      <PromoDelete id={p.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
