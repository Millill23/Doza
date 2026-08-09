"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSuperPromo } from "@/lib/actions/super-promos";

interface ProductOpt {
  id: number;
  label: string;
}

export default function SuperPromoForm({ products }: { products: ProductOpt[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("1 + 1 = 3");
  const [groupSize, setGroupSize] = useState("3");
  const [allProducts, setAllProducts] = useState(true);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const field =
    "h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.label.toLowerCase().includes(q));
  }, [products, search]);

  function toggle(id: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const n = Number(groupSize) || 3;

  return (
    <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
      <h2 className="mb-1 font-serif text-xl text-ivory">Новая супер-акция</h2>
      <p className="mb-4 text-xs text-ivory-faint">
        Каждый {n}-й товар в чеке — бесплатно. Бесплатным становится самый
        дешёвый товар из участвующих.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gold-500">
            Название
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="1 + 1 = 3"
            className={field}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gold-500">
            Каждый N-й товар бесплатно
          </label>
          <select
            value={groupSize}
            onChange={(e) => setGroupSize(e.target.value)}
            className={field}
          >
            <option value="2">2 — каждый 2-й (1+1=2)</option>
            <option value="3">3 — каждый 3-й (1+1=3)</option>
            <option value="4">4 — каждый 4-й</option>
            <option value="5">5 — каждый 5-й</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gold-500">
            Начало (необязательно)
          </label>
          <input
            type="date"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className={field}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gold-500">
            Окончание (необязательно)
          </label>
          <input
            type="date"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className={field}
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="mb-1 block text-xs uppercase tracking-wide text-gold-500">
          Участвующие товары
        </label>
        <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-ivory">
          <input
            type="checkbox"
            checked={allProducts}
            onChange={(e) => setAllProducts(e.target.checked)}
            className="h-4 w-4 accent-[#C9A24B]"
          />
          Все товары каталога
        </label>

        {!allProducts && (
          <div className="rounded-lg border border-ink-600 bg-ink-800 p-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по бренду или названию…"
              className={`${field} mb-2`}
            />
            <p className="mb-2 text-xs text-ivory-faint">
              Выбрано: {picked.size}
            </p>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {filtered.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-ivory hover:bg-ink-700"
                >
                  <input
                    type="checkbox"
                    checked={picked.has(p.id)}
                    onChange={() => toggle(p.id)}
                    className="h-4 w-4 accent-[#C9A24B]"
                  />
                  {p.label}
                </label>
              ))}
              {filtered.length === 0 && (
                <p className="px-2 py-3 text-sm text-ivory-faint">
                  Ничего не найдено.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {err && <p className="mt-2 text-sm text-red-300">{err}</p>}

      <button
        onClick={() =>
          start(async () => {
            try {
              setErr(null);
              await createSuperPromo({
                name,
                groupSize: Number(groupSize),
                allProducts,
                productIds: [...picked],
                startsAt: startsAt || null,
                endsAt: endsAt || null,
              });
              setName("1 + 1 = 3");
              setGroupSize("3");
              setAllProducts(true);
              setPicked(new Set());
              setSearch("");
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
        {pending ? "Создаём…" : "Создать супер-акцию"}
      </button>
    </div>
  );
}
