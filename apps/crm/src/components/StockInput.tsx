"use client";

import { useState, useTransition } from "react";
import { setStock } from "@/lib/actions/products";

export default function StockInput({
  productId,
  value,
  threshold,
}: {
  productId: number;
  value: number;
  threshold: number;
}) {
  const [qty, setQty] = useState(value);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const low = qty < threshold;

  function save() {
    startTransition(async () => {
      await setStock(productId, qty);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        value={qty}
        onChange={(e) => setQty(Number(e.target.value))}
        className={`h-9 w-24 rounded-lg border bg-ink-800 px-2 text-sm focus:outline-none ${
          low
            ? "border-red-500/50 text-red-300 focus:border-red-400"
            : "border-ink-600 text-ivory focus:border-gold-500"
        }`}
      />
      <span className="text-xs text-ivory-faint">мл</span>
      <button
        onClick={save}
        disabled={pending || qty === value}
        className="rounded-lg border border-gold-600/50 px-3 py-1.5 text-xs text-gold-400 transition-colors hover:border-gold-500 disabled:opacity-40"
      >
        {saved ? "✓" : "OK"}
      </button>
    </div>
  );
}
