"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPromo } from "@/lib/actions/promos";

interface ProductOpt {
  id: number;
  label: string;
}

export default function PromoForm({ products }: { products: ProductOpt[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [productId, setProductId] = useState(0);
  const [allProducts, setAllProducts] = useState(false);
  const [discount, setDiscount] = useState("");
  const [cashback, setCashback] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const field =
    "h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none";

  return (
    <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
      <h2 className="mb-4 font-serif text-xl text-ivory">Новая акция</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs uppercase tracking-wide text-gold-500">
            Товар
          </label>
          <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-ivory">
            <input
              type="checkbox"
              checked={allProducts}
              onChange={(e) => setAllProducts(e.target.checked)}
              className="h-4 w-4 accent-[#C9A24B]"
            />
            Применить ко всем товарам каталога
          </label>
          <select
            value={productId}
            onChange={(e) => setProductId(Number(e.target.value))}
            disabled={allProducts}
            className={`${field} disabled:opacity-40`}
          >
            <option value={0}>— выберите товар —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gold-500">
            Скидка, % (на цену)
          </label>
          <input
            type="number" min={0} max={90} value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            placeholder="напр. 15"
            className={field}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gold-500">
            Повышенный кешбек, %
          </label>
          <input
            type="number" min={0} max={90} value={cashback}
            onChange={(e) => setCashback(e.target.value)}
            placeholder="напр. 10"
            className={field}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gold-500">
            Начало (необязательно)
          </label>
          <input
            type="date" value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className={field}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gold-500">
            Окончание (для напоминания)
          </label>
          <input
            type="date" value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className={field}
          />
        </div>
      </div>
      {err && <p className="mt-2 text-sm text-red-300">{err}</p>}
      <button
        onClick={() =>
          start(async () => {
            try {
              setErr(null);
              await createPromo({
                productId,
                allProducts,
                discountPercent: discount ? Number(discount) : null,
                cashbackPercent: cashback ? Number(cashback) : null,
                startsAt: startsAt || null,
                endsAt: endsAt || null,
              });
              setProductId(0);
              setAllProducts(false);
              setDiscount("");
              setCashback("");
              setStartsAt("");
              setEndsAt("");
              router.refresh();
            } catch (e) {
              setErr((e as Error).message);
            }
          })
        }
        disabled={pending}
        className="mt-4 rounded-full bg-gold-gradient px-6 py-2.5 text-sm font-medium text-ink-900 disabled:opacity-50"
      >
        {pending ? "Создаём…" : "Создать акцию"}
      </button>
    </div>
  );
}
