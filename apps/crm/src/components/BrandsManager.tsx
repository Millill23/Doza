"use client";

import { useState, useTransition } from "react";
import { addBrand, deleteBrand } from "@/lib/actions/settings";

export default function BrandsManager({
  brands,
}: {
  brands: { id: number; name: string; productCount: number }[];
}) {
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Новый бренд"
          className="h-10 flex-1 rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none"
        />
        <button
          onClick={() => {
            if (!name.trim()) return;
            startTransition(async () => {
              await addBrand(name);
              setName("");
            });
          }}
          disabled={pending}
          className="rounded-lg bg-gold-gradient px-4 text-sm font-medium text-ink-900 disabled:opacity-50"
        >
          Добавить
        </button>
      </div>
      {err && <p className="mb-2 text-sm text-red-300">{err}</p>}
      <ul className="space-y-2">
        {brands.map((b) => (
          <li
            key={b.id}
            className="flex items-center justify-between rounded-lg border border-ink-600/60 bg-ink-800 px-3 py-2 text-sm"
          >
            <span className="text-ivory">
              {b.name}{" "}
              <span className="text-xs text-ivory-faint">({b.productCount} тов.)</span>
            </span>
            <button
              onClick={() => {
                setErr(null);
                startTransition(async () => {
                  try {
                    await deleteBrand(b.id);
                  } catch (e) {
                    setErr((e as Error).message);
                  }
                });
              }}
              disabled={b.productCount > 0}
              className="text-ivory-faint hover:text-red-300 disabled:opacity-30"
              title={b.productCount > 0 ? "Есть товары" : "Удалить"}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
