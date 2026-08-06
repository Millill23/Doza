"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { prepareCertificate, issueCertificate } from "@/lib/actions/certificates";

interface Prepared {
  code: string;
  denomination: number;
  paid: number;
  buyerName: string | null;
  vipCard: string | null;
  vipPercent: number;
}

function byn(n: number) {
  return `${n.toFixed(2)} BYN`;
}

export default function CertificateIssue({
  denominations,
}: {
  denominations: number[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [denomination, setDenomination] = useState<number>(denominations[0]);
  const [phone, setPhone] = useState("");
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [issued, setIssued] = useState<{ code: string; paid: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const field =
    "h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none";

  function reset() {
    setPrepared(null);
    setIssued(null);
    setPhone("");
    setErr(null);
  }

  if (issued) {
    return (
      <div className="rounded-2xl border border-green-500/40 bg-green-500/5 p-8 text-center">
        <h2 className="mb-2 font-serif text-2xl text-green-300">
          Сертификат выпущен
        </h2>
        <p className="mb-1 text-sm text-ivory-muted">Код сертификата</p>
        <p className="mb-4 font-mono text-4xl tracking-[0.3em] text-gold-gradient">
          {issued.code}
        </p>
        <p className="mb-6 text-sm text-ivory-muted">
          К оплате: {byn(issued.paid)}
        </p>
        <button
          onClick={reset}
          className="rounded-full bg-gold-gradient px-6 py-2.5 text-sm font-medium text-ink-900"
        >
          Выпустить ещё
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
      <h2 className="mb-4 font-serif text-xl text-ivory">Новый сертификат</h2>

      <label className="mb-1.5 block text-xs uppercase tracking-wide text-gold-500">
        Номинал
      </label>
      <div className="mb-4 flex flex-wrap gap-2">
        {denominations.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => {
              setDenomination(d);
              setPrepared(null);
            }}
            className={`rounded-full border px-4 py-2 text-sm transition-colors ${
              denomination === d
                ? "border-gold-500 bg-gold-500/15 text-gold-300"
                : "border-ink-600 text-ivory-muted hover:border-gold-500"
            }`}
          >
            🎁 {d}
          </button>
        ))}
      </div>

      <label className="mb-1.5 block text-xs uppercase tracking-wide text-gold-500">
        Телефон покупателя (необязательно — подтянет VIP-скидку)
      </label>
      <input
        value={phone}
        onChange={(e) => {
          setPhone(e.target.value);
          setPrepared(null);
        }}
        placeholder="+375…"
        className={`${field} mb-4`}
      />

      {err && <p className="mb-3 text-sm text-red-300">{err}</p>}

      {!prepared ? (
        <button
          onClick={() =>
            start(async () => {
              try {
                setErr(null);
                setPrepared(await prepareCertificate(denomination, phone));
              } catch (e) {
                setErr((e as Error).message);
              }
            })
          }
          disabled={pending}
          className="rounded-full bg-gold-gradient px-6 py-2.5 text-sm font-medium text-ink-900 disabled:opacity-50"
        >
          {pending ? "Генерируем…" : "Сгенерировать"}
        </button>
      ) : (
        <div className="rounded-xl border border-gold-600/40 bg-ink-800 p-5">
          <p className="mb-1 text-xs uppercase tracking-wide text-gold-500">
            Код сертификата
          </p>
          <p className="mb-4 font-mono text-3xl tracking-[0.3em] text-gold-gradient">
            {prepared.code}
          </p>

          <div className="mb-4 space-y-1 text-sm">
            <div className="flex justify-between text-ivory-muted">
              <span>Номинал</span>
              <span>{byn(prepared.denomination)}</span>
            </div>
            {prepared.vipCard && (
              <div className="flex justify-between text-gold-400">
                <span>VIP №{prepared.vipCard} · −{prepared.vipPercent}%</span>
                <span>
                  −{byn(prepared.denomination - prepared.paid)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-base font-medium text-ivory">
              <span>К оплате</span>
              <span className="text-gold-gradient">{byn(prepared.paid)}</span>
            </div>
            {prepared.buyerName && (
              <p className="pt-1 text-xs text-ivory-faint">
                Покупатель: {prepared.buyerName}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() =>
                start(async () => {
                  try {
                    setErr(null);
                    const res = await issueCertificate({
                      code: prepared.code,
                      denomination: prepared.denomination,
                      phone: phone || undefined,
                    });
                    setIssued({ code: res.code, paid: res.paid });
                    router.refresh();
                  } catch (e) {
                    setErr((e as Error).message);
                  }
                })
              }
              disabled={pending}
              className="rounded-full bg-gold-gradient px-6 py-2.5 text-sm font-medium text-ink-900 disabled:opacity-50"
            >
              {pending ? "Сохраняем…" : "Подтвердить"}
            </button>
            <button
              onClick={() => setPrepared(null)}
              disabled={pending}
              className="rounded-full border border-ink-600 px-5 py-2.5 text-sm text-ivory-muted hover:border-gold-500 disabled:opacity-50"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
