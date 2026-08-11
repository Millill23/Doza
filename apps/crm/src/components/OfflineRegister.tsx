"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registerCustomerOffline } from "@/lib/actions/customers";
import { getConsentStatus, sendConsentRequest } from "@/lib/actions/consent";

const inputCls =
  "h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none";
const labelCls = "mb-1.5 block text-xs uppercase tracking-wide text-gold-500";

export default function OfflineRegister() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<1 | 2>(1);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [dates, setDates] = useState<{ date: string; description: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Клиент уже создан — ждём, пока он откроет ссылку из SMS.
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  function addDate() {
    if (dates.length < 3) setDates([...dates, { date: "", description: "" }]);
  }
  function updateDate(i: number, patch: Partial<{ date: string; description: string }>) {
    setDates(dates.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  // Пока продавец на экране, раз в 3 секунды спрашиваем, не подтвердил ли
  // клиент согласие со своего телефона.
  useEffect(() => {
    if (!customerId || confirmed) return;
    const timer = setInterval(async () => {
      try {
        const s = await getConsentStatus(customerId);
        if (s.confirmed) setConfirmed(true);
      } catch {
        // сеть моргнула — просто ждём следующей попытки
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [customerId, confirmed]);

  function register() {
    setErr(null);
    setInfo(null);
    if (name.trim().length < 2) {
      setErr("Укажите имя");
      return;
    }
    startTransition(async () => {
      try {
        const r = await registerCustomerOffline({
          phone,
          name,
          birthday: birthday || undefined,
          dates,
        });
        setCustomerId(r.customerId);
        setConfirmed(r.alreadyConfirmed);
        setStep(2);
        if (r.alreadyConfirmed) setInfo("Клиент уже давал согласие ранее.");
        else if (!r.smsSent)
          setInfo("SMS не настроены — ссылка не отправлена, отправьте повторно.");
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  function resend() {
    if (!customerId) return;
    setErr(null);
    startTransition(async () => {
      try {
        const r = await sendConsentRequest(customerId);
        setInfo(r.smsSent ? "Ссылка отправлена повторно." : "SMS не отправлена.");
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
      {step === 1 ? (
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Телефон клиента</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+375…" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Имя</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>День рождения (необязательно)</label>
            <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} className={inputCls} />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className={labelCls}>Памятные даты (до 3)</span>
              {dates.length < 3 && (
                <button type="button" onClick={addDate} className="text-xs text-gold-400 hover:text-gold-300">+ дата</button>
              )}
            </div>
            <div className="space-y-2">
              {dates.map((d, i) => (
                <div key={i} className="flex gap-2">
                  <input type="date" value={d.date} onChange={(e) => updateDate(i, { date: e.target.value })} className="h-10 w-40 rounded-lg border border-ink-600 bg-ink-800 px-2 text-sm text-ivory focus:border-gold-500 focus:outline-none" />
                  <input value={d.description} onChange={(e) => updateDate(i, { description: e.target.value })} placeholder="Описание" className="h-10 flex-1 rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none" />
                </div>
              ))}
            </div>
          </div>

          <p className="rounded-lg border border-ink-600/60 bg-ink-800 p-3 text-xs leading-relaxed text-ivory-faint">
            Клиенту придёт SMS со ссылкой на согласие с обработкой персональных
            данных. Без него баллы не начисляются — покупать это не мешает.
          </p>

          {err && <p className="text-sm text-red-300">{err}</p>}
          <button onClick={register} disabled={pending} className="h-11 w-full rounded-full bg-gold-gradient text-sm font-medium text-ink-900 disabled:opacity-60">
            {pending ? "…" : "Зарегистрировать и отправить согласие"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {confirmed ? (
            <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-5 text-center">
              <p className="mb-1 text-3xl">✓</p>
              <p className="font-medium text-green-300">Клиент подтвердил согласие</p>
              <p className="mt-1 text-xs text-ivory-faint">Баллы будут начисляться.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-gold-600/30 bg-ink-800 p-5 text-center">
              <p className="mb-2 text-sm text-ivory">
                Ждём подтверждения от клиента…
              </p>
              <p className="text-xs leading-relaxed text-ivory-faint">
                Попросите открыть ссылку из SMS и нажать «Я согласен(на)».
                Ждать не обязательно — продажу можно оформлять уже сейчас, баллы
                начислятся, как только он подтвердит.
              </p>
            </div>
          )}

          {info && <p className="text-sm text-botanical-300">{info}</p>}
          {err && <p className="text-sm text-red-300">{err}</p>}

          <button
            onClick={() => {
              if (customerId) router.push(`/customers/${customerId}`);
              router.refresh();
            }}
            className="h-11 w-full rounded-full bg-gold-gradient text-sm font-medium text-ink-900"
          >
            Открыть карточку клиента
          </button>
          {!confirmed && (
            <button onClick={resend} disabled={pending} className="w-full text-xs text-ivory-faint hover:text-gold-400">
              Отправить ссылку повторно
            </button>
          )}
        </div>
      )}
    </div>
  );
}
