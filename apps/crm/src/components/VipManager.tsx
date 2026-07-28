"use client";

import { useState, useTransition } from "react";
import { attachVipCard, removeVipCard } from "@/lib/actions/customers";

export default function VipManager({
  customerId,
  card,
}: {
  customerId: number;
  card: string | null;
}) {
  const [pending, start] = useTransition();
  const [val, setVal] = useState("");
  const [err, setErr] = useState<string | null>(null);

  if (card) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-gold-600/40 bg-gold-500/10 px-3 py-2">
        <span className="text-sm font-medium text-gold-300">⭐ VIP · карта №{card}</span>
        <button
          onClick={() => start(() => removeVipCard(customerId))}
          disabled={pending}
          className="text-xs text-ivory-faint hover:text-red-300"
        >
          Снять
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="№ карты (напр. 091)"
          className="h-9 flex-1 rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none"
        />
        <button
          onClick={() =>
            start(async () => {
              try {
                setErr(null);
                await attachVipCard(customerId, val);
              } catch (e) {
                setErr((e as Error).message);
              }
            })
          }
          disabled={pending || !val.trim()}
          className="rounded-lg bg-gold-gradient px-3 text-xs font-medium text-ink-900 disabled:opacity-50"
        >
          Сделать VIP
        </button>
      </div>
      {err && <p className="mt-1 text-xs text-red-300">{err}</p>}
    </div>
  );
}
