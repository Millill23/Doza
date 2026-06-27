import Link from "next/link";
import { prisma } from "@doza/db";
import { formatByn } from "@doza/shared";
import { GENDER_LABEL } from "@/lib/labels";
import StockInput from "@/components/StockInput";
import DuplicateButton from "@/components/DuplicateButton";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  await requireRole(["admin"]);
  const products = await prisma.product.findMany({
    include: {
      brand: true,
      inventory: true,
      volumes: { where: { isActive: true } },
    },
    orderBy: [{ isArchived: "asc" }, { brand: { name: "asc" } }, { name: "asc" }],
  });

  const defaultThreshold = 50;

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="mb-1 font-serif text-3xl text-ivory">Товары</h1>
          <p className="text-sm text-ivory-faint">{products.length} позиций</p>
        </div>
        <Link
          href="/products/new"
          className="rounded-full bg-gold-gradient px-5 py-2.5 text-sm font-medium text-ink-900 transition-opacity hover:opacity-90"
        >
          + Новый товар
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-ink-600/60">
        <table className="w-full text-sm">
          <thead className="bg-ink-800 text-left text-xs uppercase tracking-wide text-ivory-faint">
            <tr>
              <th className="px-4 py-3">Бренд / Название</th>
              <th className="px-4 py-3">Гендер</th>
              <th className="px-4 py-3">Цена от</th>
              <th className="px-4 py-3">Остаток</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const prices = p.volumes.map((v) => Number(v.priceByn));
              const priceFrom = prices.length ? Math.min(...prices) : 0;
              const stock = p.inventory?.quantityMl ?? 0;
              const threshold = p.lowStockThreshold ?? defaultThreshold;
              return (
                <tr
                  key={p.id}
                  className={`border-t border-ink-600/40 ${
                    p.isArchived ? "bg-ink-800/50 opacity-50" : "bg-ink-700"
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="text-[11px] uppercase tracking-wide text-gold-500">
                      {p.brand.name}
                    </div>
                    <div className="font-serif text-base text-ivory">{p.name}</div>
                    {p.isArchived && (
                      <span className="text-xs text-ivory-faint">в архиве</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ivory-muted">{GENDER_LABEL[p.gender]}</td>
                  <td className="px-4 py-3 text-gold-400">{formatByn(priceFrom)}</td>
                  <td className="px-4 py-3">
                    <StockInput productId={p.id} value={stock} threshold={threshold} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/products/${p.id}/edit`}
                        className="rounded-lg border border-ink-600 px-3 py-1.5 text-xs text-ivory-muted transition-colors hover:border-gold-600/60 hover:text-gold-400"
                      >
                        Изменить
                      </Link>
                      <DuplicateButton productId={p.id} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-ivory-faint">
        Полное редактирование карточек товара (фото, ноты, объёмы, похожие) — следующий этап.
        Сейчас доступно управление остатками.
      </p>
    </div>
  );
}
