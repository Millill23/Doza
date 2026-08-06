import { prisma } from "@doza/db";
import { requireRole } from "@/lib/session";
import SuperPromoForm from "@/components/SuperPromoForm";
import SuperPromoActions from "@/components/SuperPromoActions";

export const dynamic = "force-dynamic";

function fmt(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function SuperPromosPage() {
  await requireRole(["admin"]);

  const [products, promos] = await Promise.all([
    prisma.product.findMany({
      where: { isArchived: false },
      include: { brand: { select: { name: true } } },
      orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.superPromo.findMany({
      include: {
        products: {
          include: { product: { include: { brand: { select: { name: true } } } } },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const opts = products.map((p) => ({
    id: p.id,
    label: `${p.brand.name} — ${p.name}`,
  }));

  const now = new Date();
  const status = (p: (typeof promos)[number]) => {
    if (!p.isActive) return { label: "Выключена", cls: "text-ivory-faint" };
    if (p.endsAt && p.endsAt < now)
      return { label: "Завершена", cls: "text-ivory-faint" };
    if (p.startsAt && p.startsAt > now)
      return { label: "Запланирована", cls: "text-botanical-300" };
    return { label: "Активна", cls: "text-green-300" };
  };

  return (
    <div>
      <h1 className="mb-1 font-serif text-3xl text-ivory">Супер акции</h1>
      <p className="mb-8 max-w-3xl text-sm text-ivory-faint">
        Сложные механики на весь чек. Скидки не складываются: касса сама
        сравнит супер-акцию с VIP-скидкой и скидкой за подписки и применит то,
        что выгоднее покупателю.
      </p>

      <div className="mb-8">
        <SuperPromoForm products={opts} />
      </div>

      {promos.length === 0 ? (
        <p className="rounded-xl border border-ink-600/60 bg-ink-700 p-10 text-center text-ivory-muted">
          Супер-акций пока нет.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink-600/60">
          <table className="w-full text-sm">
            <thead className="bg-ink-800 text-left text-xs uppercase tracking-wide text-ivory-faint">
              <tr>
                <th className="px-4 py-3">Название</th>
                <th className="px-4 py-3">Механика</th>
                <th className="px-4 py-3">Товары</th>
                <th className="px-4 py-3">Период</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => {
                const st = status(p);
                return (
                  <tr key={p.id} className="border-t border-ink-600/40 bg-ink-700">
                    <td className="px-4 py-3 text-ivory">{p.name}</td>
                    <td className="px-4 py-3 text-botanical-300">
                      каждый {p.groupSize}-й бесплатно
                    </td>
                    <td className="px-4 py-3 text-xs text-ivory-muted">
                      {p.allProducts ? (
                        <span className="text-gold-400">Все товары</span>
                      ) : (
                        <span title={p.products.map((x) => `${x.product.brand.name} ${x.product.name}`).join(", ")}>
                          {p.products.length} шт.
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-ivory-faint">
                      {fmt(p.startsAt)} → {fmt(p.endsAt)}
                    </td>
                    <td className={`px-4 py-3 text-xs ${st.cls}`}>{st.label}</td>
                    <td className="px-4 py-3 text-right">
                      <SuperPromoActions id={p.id} isActive={p.isActive} />
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
