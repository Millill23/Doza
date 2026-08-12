"use client";

import { ConsentRequestButton } from "@/components/ConsentControls";

/**
 * Блок согласия на обработку ПД в карточке клиента: статус и отправка ссылки.
 * Само удаление — отдельным блоком внизу карточки, оно шире по смыслу.
 */
export default function ConsentPanel({
  customerId,
  status,
  requestedAt,
  confirmedAt,
  overdue,
  ttlDays,
}: {
  customerId: number;
  status: string;
  requestedAt: string | null;
  confirmedAt: string | null;
  overdue: boolean;
  ttlDays: number;
}) {
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

      {overdue && (
        <p className="mt-3 border-t border-ink-600/60 pt-3 text-xs leading-relaxed text-ivory-faint">
          Клиент молчит дольше {ttlDays} дней. По 99-З хранить его данные для
          лояльности больше нет основания — удалить можно внизу карточки.
        </p>
      )}
    </div>
  );
}
