"use client";

import { useState, useTransition } from "react";
import { changeOrderStatus, setTrackingNumber } from "@/lib/actions/orders";
import { ORDER_STATUS_LABEL } from "@/lib/labels";

const NEXT: Record<string, string[]> = {
  new: ["confirmed", "rejected"],
  confirmed: ["shipped", "closed", "rejected"],
  shipped: ["closed", "returned"],
  closed: [],
  rejected: [],
  returned: [],
};

export default function OrderActions({
  orderId,
  status,
  tracking,
}: {
  orderId: number;
  status: string;
  tracking: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [track, setTrack] = useState(tracking ?? "");
  const [err, setErr] = useState<string | null>(null);
  const next = NEXT[status] ?? [];

  function doChange(s: string) {
    setErr(null);
    startTransition(async () => {
      try {
        await changeOrderStatus(orderId, s as never);
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  function saveTrack() {
    startTransition(async () => {
      await setTrackingNumber(orderId, track);
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-3 text-xs uppercase tracking-wide text-gold-500">Сменить статус</h3>
        {next.length === 0 ? (
          <p className="text-sm text-ivory-faint">Заказ в финальном статусе.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {next.map((s) => (
              <button
                key={s}
                onClick={() => doChange(s)}
                disabled={pending}
                className="rounded-full bg-gold-gradient px-4 py-2 text-sm font-medium text-ink-900 transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {ORDER_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        )}
        {err && <p className="mt-2 text-sm text-red-300">{err}</p>}
      </div>

      <div>
        <h3 className="mb-2 text-xs uppercase tracking-wide text-gold-500">Трек-номер</h3>
        <div className="flex gap-2">
          <input
            value={track}
            onChange={(e) => setTrack(e.target.value)}
            placeholder="Номер отправления"
            className="h-10 flex-1 rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none"
          />
          <button
            onClick={saveTrack}
            disabled={pending}
            className="rounded-lg border border-gold-600/50 px-4 text-sm text-gold-400 transition-colors hover:border-gold-500 disabled:opacity-50"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
