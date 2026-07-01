"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  requestOfflineRegOtp,
  registerCustomerOffline,
} from "@/lib/actions/customers";

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
  const [otp, setOtp] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function addDate() {
    if (dates.length < 3) setDates([...dates, { date: "", description: "" }]);
  }
  function updateDate(i: number, patch: Partial<{ date: string; description: string }>) {
    setDates(dates.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  function requestCode() {
    setErr(null);
    setInfo(null);
    if (name.trim().length < 2) { setErr("Укажите имя"); return; }
    startTransition(async () => {
      try {
        const r = await requestOfflineRegOtp(phone);
        if (r.already) { setErr(`Клиент уже зарегистрирован: ${r.name}`); return; }
        setStep(2);
        setInfo(r.smsSent ? "Код отправлен клиенту по SMS." : "SMS не настроены — код не отправлен.");
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  function confirm() {
    setErr(null);
    startTransition(async () => {
      try {
        const r = await registerCustomerOffline({ phone, name, otp, birthday: birthday || undefined, dates });
        router.push(`/customers/${r.customerId}`);
        router.refresh();
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

          {err && <p className="text-sm text-red-300">{err}</p>}
          <button onClick={requestCode} disabled={pending} className="h-11 w-full rounded-full bg-gold-gradient text-sm font-medium text-ink-900 disabled:opacity-60">
            {pending ? "…" : "Отправить код клиенту"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {info && <p className="text-sm text-botanical-300">{info}</p>}
          <p className="text-sm text-ivory-muted">
            Попросите клиента продиктовать код из SMS.
          </p>
          <div>
            <label className={labelCls}>Код подтверждения</label>
            <input value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" placeholder="000000" className={inputCls} />
          </div>
          {err && <p className="text-sm text-red-300">{err}</p>}
          <button onClick={confirm} disabled={pending} className="h-11 w-full rounded-full bg-gold-gradient text-sm font-medium text-ink-900 disabled:opacity-60">
            {pending ? "…" : "Зарегистрировать"}
          </button>
          <button onClick={requestCode} disabled={pending} className="w-full text-xs text-ivory-faint hover:text-gold-400">
            Отправить код повторно
          </button>
        </div>
      )}
    </div>
  );
}
