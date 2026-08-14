"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setSmsMaster,
  setSmsKind,
  setSmsTelegramNotify,
} from "@/lib/actions/sms";

interface KindRow {
  kind: string;
  label: string;
  hint: string;
  required: boolean;
  enabled: boolean;
  /** Сколько таких сообщений ушло за последние 30 дней. */
  sent30d: number;
}

/** Переключатели категорий SMS и главный рубильник. */
export default function SmsSettingsPanel({
  master,
  telegram,
  kinds,
}: {
  master: boolean;
  telegram: boolean;
  kinds: KindRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const toggle = (fn: () => Promise<unknown>) =>
    start(async () => {
      try {
        setErr(null);
        await fn();
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });

  return (
    <div className="space-y-4">
      <div
        className={`rounded-2xl border p-5 ${
          master ? "border-ink-600/60 bg-ink-700" : "border-red-500/40 bg-red-500/5"
        }`}
      >
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={master}
            disabled={pending}
            onChange={(e) => toggle(() => setSmsMaster(e.target.checked))}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#C9A24B]"
          />
          <span>
            <span className="block font-medium text-ivory">
              Отправка SMS включена
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-ivory-faint">
              Общий рубильник. Снимите галочку, чтобы мгновенно прекратить любые
              отправки — включая коды подтверждения. Клиенты не смогут
              зарегистрироваться и списать баллы, пока он выключен.
            </span>
          </span>
        </label>
        {!master && (
          <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300">
            Сейчас не отправляется ничего.
          </p>
        )}
      </div>

      <div
        className={`rounded-2xl border p-5 ${
          telegram ? "border-botanical-500/40 bg-botanical-500/5" : "border-ink-600/60 bg-ink-700"
        }`}
      >
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={telegram}
            disabled={pending}
            onChange={(e) => toggle(() => setSmsTelegramNotify(e.target.checked))}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#C9A24B]"
          />
          <span>
            <span className="block font-medium text-ivory">
              Дублировать каждую SMS в Telegram
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-ivory-faint">
              Временный «прожектор»: видно каждое сообщение сразу, как оно
              уходит. Включите на час, посмотрите — и выключите, иначе канал
              заполнится служебными кодами.
            </span>
          </span>
        </label>
        {telegram && (
          <p className="mt-3 text-xs text-botanical-300">
            Включено — уведомления идут в канал.
          </p>
        )}
      </div>

      {err && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {err}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-ink-600/60">
        <table className="w-full text-sm">
          <thead className="bg-ink-800 text-left text-xs uppercase tracking-wide text-ivory-faint">
            <tr>
              <th className="px-4 py-3">Категория</th>
              <th className="px-4 py-3 text-right">За 30 дней</th>
              <th className="px-4 py-3 text-right">Отправка</th>
            </tr>
          </thead>
          <tbody>
            {kinds.map((k) => (
              <tr key={k.kind} className="border-t border-ink-600/40 bg-ink-700">
                <td className="px-4 py-3">
                  <span className="text-ivory">{k.label}</span>
                  {k.required && (
                    <span className="ml-2 rounded-full border border-ink-600 px-2 py-0.5 text-[10px] uppercase text-ivory-faint">
                      служебное
                    </span>
                  )}
                  <span className="mt-0.5 block text-xs text-ivory-faint">{k.hint}</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-ivory-muted">
                  {k.sent30d}
                </td>
                <td className="px-4 py-3 text-right">
                  {k.required ? (
                    <span className="text-xs text-ivory-faint">всегда</span>
                  ) : (
                    <input
                      type="checkbox"
                      checked={k.enabled && master}
                      disabled={pending || !master}
                      onChange={(e) => toggle(() => setSmsKind(k.kind, e.target.checked))}
                      className="h-5 w-5 accent-[#C9A24B] disabled:opacity-40"
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
