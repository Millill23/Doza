"use client";

import { useTransition } from "react";
import { duplicateProduct } from "@/lib/actions/product-edit";

export default function DuplicateButton({ productId }: { productId: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      onClick={() => startTransition(() => duplicateProduct(productId))}
      disabled={pending}
      className="rounded-lg border border-ink-600 px-3 py-1.5 text-xs text-ivory-muted transition-colors hover:border-gold-600/60 hover:text-gold-400 disabled:opacity-50"
      title="Создать копию"
    >
      {pending ? "…" : "Копия"}
    </button>
  );
}
