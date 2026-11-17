import Link from "next/link";
import { prisma } from "@doza/db";
import { formatByn } from "@doza/shared";
import { GENDER_LABEL } from "@/lib/labels";
import StockInput from "./StockInput";
import DuplicateButton from "./DuplicateButton";
import ProductFilters, { type ProductSearchParams } from "./ProductFilters";

export default async function ProductList({
  searchParams,
  editable,
}: {
  searchParams: ProductSearchParams;
  editable: boolean;
}) {
  const query = typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const { gender: requestedGender, stock: requestedSort } = searchParams;
  const gender = requestedGender === "male" || requestedGender === "female" || requestedGender === "unisex"
    ? requestedGender
    : undefined;
  const sort = editable && (requestedSort === "asc" || requestedSort === "desc")
    ? requestedSort
    : undefined;
  const matches = query ? query.split(/\s+/).map((word) => {
    const match = { contains: word.replace(/[\\%_]/g, "\\$&"), mode: "insensitive" as const };
    return { OR: [{ name: match }, { brand: { name: match } }] };
  }) : undefined;

  const products = await prisma.product.findMany({
    where: { isArchived: editable ? undefined : false, gender, AND: matches },
    select: {
      id: true,
      name: true,
      gender: true,
      isArchived: true,
      lowStockThreshold: true,
      brand: { select: { name: true } },
      inventory: { select: { quantityMl: true } },
      volumes: editable ? { where: { isActive: true }, select: { priceByn: true } } : false,
    },
    orderBy: [{ isArchived: "asc" }, { brand: { name: "asc" } }, { name: "asc" }, { id: "asc" }],
  });

  if (sort) {
    const direction = sort === "asc" ? 1 : -1;
    products.sort((a, b) => direction * ((a.inventory?.quantityMl ?? 0) - (b.inventory?.quantityMl ?? 0)));
  }

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 font-serif text-3xl text-ivory">{editable ? "Товары" : "Остатки"}</h1>
          <p className="text-sm text-ivory-faint">Позиций: {products.length}</p>
        </div>
        {editable && (
          <Link
            href="/products/new"
            className="rounded-full bg-gold-gradient px-5 py-2.5 text-sm font-medium text-ink-900 transition-opacity hover:opacity-90"
          >
            + Новый товар
          </Link>
        )}
      </div>

      <ProductFilters key={JSON.stringify([query, gender, sort])} query={query} gender={gender} sort={sort} editable={editable} />

      <div className="overflow-x-auto rounded-xl border border-ink-600/60">
        <table className="w-full text-sm">
          <thead className="bg-ink-800 text-left text-xs uppercase tracking-wide text-ivory-faint">
            <tr>
              <th className="px-4 py-3">Бренд / Название</th>
              <th className="px-4 py-3">Пол</th>
              {editable && <th className="px-4 py-3">Цена от</th>}
              <th className="px-4 py-3">Остаток</th>
              {editable && <th className="px-4 py-3"><span className="sr-only">Действия</span></th>}
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td colSpan={editable ? 5 : 3} className="px-4 py-6 text-center text-ivory-muted">
                  Товары не найдены
                </td>
              </tr>
            )}
            {products.map((product) => {
              const stock = product.inventory?.quantityMl ?? 0;
              const threshold = product.lowStockThreshold ?? 50;
              const prices = product.volumes?.map((volume) => Number(volume.priceByn)) ?? [];
              return (
                <tr
                  key={product.id}
                  className={`border-t border-ink-600/40 ${product.isArchived ? "bg-ink-800/50 opacity-50" : "bg-ink-700"}`}
                >
                  <td className="px-4 py-3">
                    <div className="text-[11px] uppercase tracking-wide text-gold-500">{product.brand.name}</div>
                    <div className="font-serif text-base text-ivory">{product.name}</div>
                    {product.isArchived && <span className="text-xs text-ivory-faint">в архиве</span>}
                  </td>
                  <td className="px-4 py-3 text-ivory-muted">{GENDER_LABEL[product.gender]}</td>
                  {editable && (
                    <td className="px-4 py-3 text-gold-400">{formatByn(prices.length ? Math.min(...prices) : 0)}</td>
                  )}
                  <td className="px-4 py-3">
                    {editable ? (
                      <StockInput productId={product.id} value={stock} threshold={threshold} />
                    ) : (
                      <span className={stock < threshold ? "text-red-300" : "text-ivory"}>{stock} мл</span>
                    )}
                  </td>
                  {editable && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/products/${product.id}/edit`}
                          className="rounded-lg border border-ink-600 px-3 py-1.5 text-xs text-ivory-muted transition-colors hover:border-gold-600/60 hover:text-gold-400"
                        >
                          Изменить
                        </Link>
                        <DuplicateButton productId={product.id} />
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
