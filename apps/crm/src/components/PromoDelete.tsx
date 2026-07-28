"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deletePromo } from "@/lib/actions/promos";

export default function PromoDelete({ id }: { id: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() =>
        start(async () => {
          await deletePromo(id);
          router.refresh();
        })
      }
      disabled={pending}
      className="text-xs text-ivory-faint hover:text-red-300 disabled:opacity-50"
    >
      Удалить
    </button>
  );
}
