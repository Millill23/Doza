"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteUnconsentedCustomer } from "@/lib/actions/consent";
import { ConsentRequestButton } from "@/components/ConsentControls";

/**
 * Блок согласия на обработку ПД в карточке клиента: статус, отправка ссылки
 * и удаление тех, кто не ответил за отведённый срок.
 */
export default function ConsentPanel({
  customerId,
  name,
  status,
  requestedAt,
  confirmedAt,
  overdue,
  ttlDays,
  canDelete,
}: {
  customerId: number;
  name: string;
  status: string;
  requestedAt: string | null;
  confirmedAt: string | null;
  overdue: boolean;
  ttlDays: number;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("ru-RU") : null;

  if (status === "confirmed") {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4">
        <p className="text-sm text-green-300">✓ Согласие на обработку данных получено</p>
        {confirmedAt && (
          <p className="mt-1 text-xs text-ivory-faint">{fmt(confirmedAt)}</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <p className="text-sm text-amber-300">⚠ Согласие не получено</p>
      <p className="mt-1 text-xs leading-relaxed text-ivory-faint">
        {requestedAt
          ? `Ссылка отправлена ${fmt(requestedAt)}. Баллы не начисляются, пока клиент не подтвердит.`
          : "Ссылку ещё не отправляли. Баллы не начисляются."}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <ConsentRequestButton
          customerId={customerId}
          kind="invite"
          label={requestedAt ? "Отправить повторно" : "Запросить согласие"}
        />
        {requestedAt && (
          <ConsentRequestButton
            customerId={customerId}
            kind="reminder"
            label="Жёсткое напоминание"
          />
        )}
      </div>

      {canDelete && (
        <div className="mt-4 border-t border-ink-600/60 pt-3">
          {overdue ? (
            <>
              <button
                onClick={() => {
                  if (
                    !confirm(
                      `Удалить клиента «${name}»?\n\nБаллы, памятные даты и история лояльности будут удалены безвозвратно. Заказы и продажи останутся, но потеряют привязку к клиенту.\n\nОтменить это действие нельзя.`,
                    )
                  )
                    return;
                  start(async () => {
                    try {
                      await deleteUnconsentedCustomer(customerId);
                      router.push("/customers");
                      router.refresh();
                    } catch (e) {
                      setErr((e as Error).message);
                    }
                  });
                }}
                disabled={pending}
                className="rounded-full border border-red-500/40 px-3 py-1.5 text-xs text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
              >
                {pending ? "Удаляем…" : "Удалить клиента (нет согласия)"}
              </button>
              {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
            </>
          ) : (
            <p className="text-xs text-ivory-faint">
              Удалить можно, если клиент не ответит в течение {ttlDays} дней после
              отправки ссылки.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
