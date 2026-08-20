"use client";

import { useState, useTransition } from "react";
import { cancelOfflineSale } from "@/lib/actions/sale-edits";

export default function CancelSale({ saleId }: { saleId: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-red-500/40 px-4 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/10"
      >
        Отменить продажу
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-red-500/40 bg-red-500/5 p-4">
      <p className="text-sm text-ivory">
        Отмена вернёт остатки, баллы и оплату сертификатом. Действие будет
        записано в журнал.
      </p>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Причина отмены"
        className="h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none"
      />
      {err && <p className="text-sm text-red-300">{err}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => {
            setErr(null);
            startTransition(async () => {
              try {
                await cancelOfflineSale(saleId, reason);
                setOpen(false);
              } catch (e) {
                setErr((e as Error).message);
              }
            });
          }}
          disabled={pending}
          className="rounded-lg bg-red-500/80 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
        >
          {pending ? "Отменяем…" : "Подтвердить отмену"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg border border-ink-600 px-4 py-2 text-sm text-ivory-muted hover:border-gold-600/60"
        >
          Назад
        </button>
      </div>
    </div>
  );
}
