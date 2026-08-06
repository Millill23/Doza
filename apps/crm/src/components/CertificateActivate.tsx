"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { activateCertificateInCrm } from "@/lib/actions/certificates";

function byn(n: number) {
  return `${n.toFixed(2)} BYN`;
}

export default function CertificateActivate() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{
    awarded: number;
    balance: number;
    denomination: number;
    customerName: string;
    isVip: boolean;
  } | null>(null);

  const field =
    "h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none";

  if (done) {
    return (
      <div className="rounded-2xl border border-green-500/40 bg-green-500/5 p-8 text-center">
        <h2 className="mb-2 font-serif text-2xl text-green-300">
          Сертификат активирован
        </h2>
        <p className="mb-1 text-ivory">
          {done.customerName}
          {done.isVip && (
            <span className="ml-2 rounded-full bg-gold-gradient px-2 py-0.5 text-[10px] font-semibold text-ink-900">
              ⭐ VIP
            </span>
          )}
        </p>
        <p className="mb-1 text-2xl text-gold-gradient">
          +{byn(done.awarded)}
        </p>
        {done.isVip && done.awarded !== done.denomination && (
          <p className="mb-1 text-xs text-ivory-faint">
            Начислено по цене покупки сертификата (номинал {byn(done.denomination)})
          </p>
        )}
        <p className="mb-6 text-sm text-ivory-muted">
          Баланс клиента: {byn(done.balance)}
        </p>
        <button
          onClick={() => {
            setDone(null);
            setCode("");
            setPhone("");
            setName("");
          }}
          className="rounded-full bg-gold-gradient px-6 py-2.5 text-sm font-medium text-ink-900"
        >
          Активировать ещё
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
      <h2 className="mb-4 font-serif text-xl text-ivory">Активация</h2>

      <label className="mb-1.5 block text-xs uppercase tracking-wide text-gold-500">
        Код сертификата
      </label>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="ABCD2345"
        maxLength={12}
        className={`${field} mb-4 font-mono text-lg tracking-[0.25em]`}
      />

      <label className="mb-1.5 block text-xs uppercase tracking-wide text-gold-500">
        Телефон клиента
      </label>
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="+375…"
        className={`${field} mb-4`}
      />

      <label className="mb-1.5 block text-xs uppercase tracking-wide text-gold-500">
        Имя клиента
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Имя"
        className={`${field} mb-4`}
      />

      {err && <p className="mb-3 text-sm text-red-300">{err}</p>}

      <button
        onClick={() =>
          start(async () => {
            try {
              setErr(null);
              const res = await activateCertificateInCrm({ code, phone, name });
              setDone({
                awarded: res.awarded,
                balance: res.balance,
                denomination: res.denomination,
                customerName: res.customerName,
                isVip: res.isVip,
              });
              router.refresh();
            } catch (e) {
              setErr((e as Error).message);
            }
          })
        }
        disabled={pending || !code.trim() || !phone.trim()}
        className="rounded-full bg-gold-gradient px-6 py-2.5 text-sm font-medium text-ink-900 disabled:opacity-50"
      >
        {pending ? "Активируем…" : "Активировать"}
      </button>
    </div>
  );
}
