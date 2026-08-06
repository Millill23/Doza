"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSuperPromo, toggleSuperPromo } from "@/lib/actions/super-promos";

export default function SuperPromoActions({
  id,
  isActive,
}: {
  id: number;
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div className="flex items-center justify-end gap-3">
      <button
        onClick={() =>
          start(async () => {
            await toggleSuperPromo(id, !isActive);
            router.refresh();
          })
        }
        disabled={pending}
        className="text-xs text-ivory-faint hover:text-gold-400 disabled:opacity-50"
      >
        {isActive ? "Выключить" : "Включить"}
      </button>
      <button
        onClick={() =>
          start(async () => {
            await deleteSuperPromo(id);
            router.refresh();
          })
        }
        disabled={pending}
        className="text-xs text-ivory-faint hover:text-red-300 disabled:opacity-50"
      >
        Удалить
      </button>
    </div>
  );
}
