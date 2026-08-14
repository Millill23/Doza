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
  // Причина отказа: чаще всего это пауза между повторами, а не сбой шлюза.
  // Молчаливое «не ушла» заставляло продавца жать кнопку снова и снова.
  const [reason, setReason] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        onClick={() =>
          start(async () => {
            try {
              const r = await sendConsentRequest(customerId, kind);
              setState(r.smsSent ? "sent" : "failed");
              setReason(r.smsSent ? null : (r.error ?? "Сообщение не отправлено"));
              router.refresh();
            } catch (e) {
              setState("failed");
              setReason((e as Error).message);
            }
          })
        }
        disabled={pending || state === "sent"}
        title={reason ?? "Отправить клиенту ссылку на согласие"}
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
              ? "Не отправлено"
              : label}
      </button>
      {reason && (
        <span className="max-w-[220px] text-[11px] leading-snug text-amber-300">
          {reason}
        </span>
      )}
    </span>
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
