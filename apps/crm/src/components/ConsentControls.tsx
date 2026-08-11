"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  sendConsentRequest,
  sendConsentToAllPending,
} from "@/lib/actions/consent";

/**
 * Кнопки запроса согласия на обработку ПД: точечно по клиенту и массово по
 * всем неподтверждённым.
 */

/** Точечная отправка — кнопка в строке клиента и в его карточке. */
export function ConsentRequestButton({
  customerId,
  kind = "invite",
  label,
  className,
}: {
  customerId: number;
  kind?: "invite" | "reminder";
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<"idle" | "sent" | "failed">("idle");

  return (
    <button
      onClick={() =>
        start(async () => {
          try {
            const r = await sendConsentRequest(customerId, kind);
            setState(r.smsSent ? "sent" : "failed");
            router.refresh();
          } catch {
            setState("failed");
          }
        })
      }
      disabled={pending || state === "sent"}
      title={
        state === "failed"
          ? "SMS не ушла — проверьте настройки шлюза"
          : "Отправить клиенту ссылку на согласие"
      }
      className={
        className ??
        "whitespace-nowrap rounded-full border border-gold-600/40 px-3 py-1 text-xs text-gold-400 transition-colors hover:bg-gold-600/10 disabled:opacity-50"
      }
    >
      {pending
        ? "…"
        : state === "sent"
          ? "Отправлено ✓"
          : state === "failed"
            ? "Не ушла ✕"
            : label}
    </button>
  );
}

/** Массовая рассылка всем, кто ещё не подтвердил. */
export function ConsentBulkButton({ pendingCount }: { pendingCount: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  if (pendingCount === 0) return null;

  return (
    <div className="flex items-center gap-3">
      {result && <span className="text-xs text-ivory-faint">{result}</span>}
      <button
        onClick={() => {
          if (
            !confirm(
              `Отправить запрос согласия ${pendingCount} клиентам? Каждому уйдёт SMS со ссылкой.`,
            )
          )
            return;
          start(async () => {
            try {
              const r = await sendConsentToAllPending();
              setResult(
                r.failed > 0
                  ? `Отправлено ${r.sent} из ${r.total}, не доставлено ${r.failed}`
                  : `Отправлено ${r.sent} из ${r.total}`,
              );
              router.refresh();
            } catch (e) {
              setResult((e as Error).message);
            }
          });
        }}
        disabled={pending}
        className="rounded-full border border-gold-600/40 px-4 py-2.5 text-sm text-gold-400 transition-colors hover:bg-gold-600/10 disabled:opacity-50"
      >
        {pending ? "Рассылаем…" : `Запросить согласие (${pendingCount})`}
      </button>
    </div>
  );
}
