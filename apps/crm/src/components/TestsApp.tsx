"use client";

import { useMemo, useState, useTransition } from "react";
import { sendGiftLink, type GiftLinkResult } from "@/lib/actions/tests";
import PhoneInput from "@/components/PhoneInput";
import { BELARUS_PREFIX, isValidLocalDigits, PHONE_ERROR } from "@doza/shared/phone";

interface Cert {
  id: number;
  code: string;
  denomination: number;
  balance: number;
  hasLink: boolean;
  issuedAt: string;
  buyer: string | null;
}

const inputCls =
  "h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory placeholder:text-ivory-faint focus:border-gold-500 focus:outline-none";
const labelCls = "mb-1 block text-xs uppercase tracking-wide text-gold-500";

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU");
}

export default function TestsApp({ certificates }: { certificates: Cert[] }) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<GiftLinkResult | null>(null);

  const [query, setQuery] = useState("");
  const [certId, setCertId] = useState<number | null>(null);
  const [phone, setPhone] = useState("");
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");

  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? certificates.filter(
          (c) =>
            c.code.toLowerCase().includes(q) ||
            (c.buyer ?? "").toLowerCase().includes(q) ||
            String(c.denomination).includes(q),
        )
      : certificates;
    return list.slice(0, 20);
  }, [query, certificates]);

  const picked = certificates.find((c) => c.id === certId) ?? null;

  function send() {
    setErr(null);
    setResult(null);
    if (!certId) {
      setErr("Выберите сертификат");
      return;
    }
    if (!isValidLocalDigits(phone)) {
      setErr("Проверьте телефон: " + PHONE_ERROR.toLowerCase());
      return;
    }
    startTransition(async () => {
      try {
        const r = await sendGiftLink({
          certificateId: certId,
          phone: BELARUS_PREFIX + phone,
          recipientName: recipient,
          message,
        });
        setResult(r);
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  return (
    <div>
      <h1 className="font-serif text-3xl text-ivory">Тесты</h1>
      <p className="mt-1 max-w-2xl text-sm text-ivory-faint">
        Посмотреть, что получает покупатель, не собирая для этого настоящий
        заказ.
      </p>

      <div className="mt-6 rounded-2xl border border-ink-600/60 bg-ink-700 p-5">
        <h2 className="font-serif text-xl text-ivory">
          Сертификат ссылкой в SMS
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ivory-faint">
          Отправляет ссылку на страницу подарка — ту самую, что уходит при
          покупке электронного сертификата на сайте. Новый сертификат не
          выпускается: берётся уже существующий, чтобы кнопка «проверить» не
          печатала подарки.
        </p>

        {certificates.length === 0 ? (
          <p className="mt-4 rounded-lg border border-ink-600 bg-ink-800/60 p-4 text-sm text-ivory-muted">
            Нет живых сертификатов. Выпустите один в разделе «Сертификаты» или
            купите на сайте — тогда его можно будет отправить отсюда.
          </p>
        ) : (
          <>
            <div className="mt-4">
              <label className={labelCls}>Сертификат</label>
              {picked ? (
                <div className="flex items-center justify-between rounded-lg border border-gold-500/40 bg-gold-500/5 px-3 py-2.5">
                  <div>
                    <span className="font-mono text-sm text-gold-300">
                      {picked.code}
                    </span>
                    <span className="ml-3 text-xs text-ivory-faint">
                      номинал {picked.denomination} BYN · остаток{" "}
                      {picked.balance} BYN
                      {picked.buyer ? " · " + picked.buyer : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCertId(null)}
                    className="text-xs text-ivory-faint hover:text-gold-400"
                  >
                    Сменить
                  </button>
                </div>
              ) : (
                <>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Поиск по коду, номиналу или покупателю"
                    className={inputCls}
                  />
                  <div className="mt-1.5 max-h-52 space-y-1 overflow-y-auto rounded-lg border border-ink-600/60 p-2">
                    {found.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCertId(c.id)}
                        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm text-ivory-muted transition-colors hover:bg-ink-600/40"
                      >
                        <span>
                          <span className="font-mono text-ivory">{c.code}</span>
                          <span className="ml-2 text-xs text-ivory-faint">
                            {day(c.issuedAt)}
                            {c.buyer ? " · " + c.buyer : ""}
                            {c.hasLink ? "" : " · без ссылки"}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-gold-400">
                          {c.balance} BYN
                        </span>
                      </button>
                    ))}
                    {found.length === 0 && (
                      <p className="px-2 py-3 text-center text-xs text-ivory-faint">
                        Ничего не нашлось.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Кому отправить</label>
                <PhoneInput value={phone} onChange={setPhone} />
              </div>
              <div>
                <label className={labelCls}>Имя получателя</label>
                <input
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="Необязательно"
                  className={inputCls}
                />
              </div>
            </div>

            <div className="mt-4">
              <label className={labelCls}>Поздравление</label>
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Появится на странице подарка. Пусто — оставим прежнее"
                className={inputCls}
              />
            </div>

            {err && (
              <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
                {err}
              </p>
            )}

            <button
              type="button"
              onClick={send}
              disabled={pending}
              className="mt-4 rounded-full bg-gold-gradient px-5 py-2.5 text-sm font-medium text-ink-900 disabled:opacity-50"
            >
              {pending ? "Отправляем…" : "Отправить"}
            </button>

            {result && (
              <div className="mt-4 rounded-lg border border-botanical-500/40 bg-botanical-700/15 p-4">
                <p className="text-sm text-ivory">
                  {result.smsSent
                    ? "SMS отправлена."
                    : "SMS не ушла: " + (result.error ?? "шлюз недоступен")}
                </p>
                {/* Ссылку показываем всегда. Шлюз отвечает только с боевого
                    адреса, и с рабочей машины проверить страницу иначе было бы
                    нельзя. */}
                <p className="mt-2 text-xs text-ivory-faint">
                  Ссылка на подарок:
                </p>
                <a
                  href={result.link}
                  target="_blank"
                  rel="noopener"
                  className="mt-0.5 block break-all text-sm text-gold-400 hover:text-gold-300"
                >
                  {result.link}
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
