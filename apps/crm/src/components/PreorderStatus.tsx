"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPreorderStatus } from "@/lib/actions/preorders";

export default function PreorderStatus({
  id,
  status,
}: {
  id: number;
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const change = (next: "new" | "done" | "cancelled") =>
    start(async () => {
      await setPreorderStatus(id, next);
      router.refresh();
    });

  if (status !== "new") {
    return (
      <button
        onClick={() => change("new")}
        disabled={pending}
        className="rounded-lg border border-ink-600 px-3 py-1 text-xs text-ivory-muted hover:border-gold-500 disabled:opacity-50"
      >
        Вернуть в работу
      </button>
    );
  }

  return (
    <div className="flex justify-end gap-2">
      <button
        onClick={() => change("done")}
        disabled={pending}
        className="rounded-lg border border-green-600/50 px-3 py-1 text-xs text-green-300 hover:border-green-500 disabled:opacity-50"
      >
        Выполнено
      </button>
      <button
        onClick={() => change("cancelled")}
        disabled={pending}
        className="rounded-lg border border-red-600/50 px-3 py-1 text-xs text-red-300 hover:border-red-500 disabled:opacity-50"
      >
        Отменить
      </button>
    </div>
  );
}
